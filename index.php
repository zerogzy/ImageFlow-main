<?php
/**
 * ImageFlow PHP - Main Entry Point
 * Routes API requests to handlers, serves static HTML pages.
 */
require_once __DIR__ . '/app/Config.php';
require_once __DIR__ . '/app/Database.php';
require_once __DIR__ . '/app/Cache.php';
require_once __DIR__ . '/app/Auth.php';
require_once __DIR__ . '/app/Storage.php';
require_once __DIR__ . '/app/ImageModel.php';
require_once __DIR__ . '/app/ImageProcessor.php';

Config::load();

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Serve static files (JS, CSS, images)
if (preg_match('/\.(js|css|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2)$/', $path)) {
    $filePath = __DIR__ . $path;
    if (file_exists($filePath) && is_file($filePath)) {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mimeTypes = [
            'js' => 'application/javascript',
            'css' => 'text/css',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'avif' => 'image/avif',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            'woff2' => 'font/woff2',
        ];
        if (isset($mimeTypes[$ext])) {
            header("Content-Type: {$mimeTypes[$ext]}");
        }
        header("Cache-Control: public, max-age=86400");
        readfile($filePath);
        exit;
    }
}

// CORS for API requests
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = Config::get('ALLOWED_ORIGINS', '*');
if ($allowed === '*') {
    header('Access-Control-Allow-Origin: *');
} else {
    $origins = array_map('trim', explode(',', $allowed));
    if (in_array($origin, $origins)) {
        header("Access-Control-Allow-Origin: $origin");
    }
}
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Serve upload images from local storage when not S3
if (!Storage::isS3() && preg_match('#^/uploads/(.+)$#', $path, $matches)) {
    $filePath = __DIR__ . '/uploads/' . $matches[1];
    if (file_exists($filePath) && is_file($filePath)) {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mimeTypes = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'avif' => 'image/avif'];
        if (isset($mimeTypes[$ext])) header("Content-Type: {$mimeTypes[$ext]}");
        header("Cache-Control: public, max-age=86400");
        readfile($filePath);
        exit;
    }
}

// API Routes
function jsonResponse($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function getParam($name, $default = '') {
    return $_GET[$name] ?? $default;
}

if (str_starts_with($path, '/api/')) {
    
    // Validate API Key
    if ($path === '/api/validate-api-key' && $method === 'POST') {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $key = preg_match('/Bearer\s+(.+)$/i', $header, $m) ? trim($m[1]) : null;
        jsonResponse(Auth::validateKey($key));
    }
    
    // Get config
    if ($path === '/api/config' && $method === 'GET') {
        Auth::requireRole('admin');
        jsonResponse([
            'maxUploadCount' => Config::getInt('MAX_UPLOAD_COUNT', 20),
            'imageQuality' => Config::getInt('IMAGE_QUALITY', 80),
            'storageType' => Config::get('STORAGE_TYPE', 'local'),
        ]);
    }
    
    // Upload
    if ($path === '/api/upload' && $method === 'POST') {
        Auth::requireAdmin();
        
        $maxCount = Config::getInt('MAX_UPLOAD_COUNT', 20);
        $quality = Config::getInt('IMAGE_QUALITY', 80);
        
        $files = $_FILES['images'] ?? null;
        if (!$files || !is_array($files['name']) || empty($files['name'])) {
            jsonResponse(['code' => 1001, 'message' => 'No files uploaded'], 400);
        }
        
        $count = count($files['name']);
        if ($count > $maxCount) {
            jsonResponse(['code' => 1004, 'message' => "Too many files. Maximum is $maxCount"], 413);
        }
        
        $expiryMinutes = isset($_POST['expiry_minutes']) ? (int)$_POST['expiry_minutes'] : 0;
        $tags = isset($_POST['tags']) ? explode(',', $_POST['tags']) : [];
        $tags = array_map('trim', array_filter($tags));
        
        $results = [];
        
        for ($i = 0; $i < $count; $i++) {
            $name = $files['name'][$i];
            $tmpName = $files['tmp_name'][$i];
            $size = $files['size'][$i];
            $error = $files['error'][$i];
            
            if ($error !== UPLOAD_ERR_OK) {
                $results[] = ['status' => 'error', 'filename' => $name, 'message' => 'Upload error'];
                continue;
            }
            
            $mime = mime_content_type($tmpName);
            $allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!in_array($mime, $allowedMimes)) {
                $results[] = ['status' => 'error', 'filename' => $name, 'message' => 'Unsupported format'];
                continue;
            }
            
            $id = bin2hex(random_bytes(16));
            $ext = pathinfo($name, PATHINFO_EXTENSION);
            $filename = $id . '.' . $ext;
            $isGif = strtolower($ext) === 'gif';
            
            $imgInfo = getimagesize($tmpName);
            $width = $imgInfo[0] ?? 0;
            $height = $imgInfo[1] ?? 0;
            $orientation = $width > $height ? 'landscape' : ($height > $width ? 'portrait' : 'square');
            
            if ($isGif) {
                $storagePath = "gif/$filename";
            } else {
                $storagePath = "original/$orientation/$filename";
            }
            
            if (Storage::isS3()) {
                $content = file_get_contents($tmpName);
                Storage::save($storagePath, $content);
            } else {
                $fullPath = __DIR__ . '/uploads/' . $storagePath;
                $dir = dirname($fullPath);
                if (!is_dir($dir)) mkdir($dir, 0755, true);
                move_uploaded_file($tmpName, $fullPath);
            }
            
            $expiryTime = null;
            if ($expiryMinutes > 0) {
                $expiryTime = date('Y-m-d H:i:s', time() + $expiryMinutes * 60);
            }
            
            $db = Database::getInstance();
            $db->beginTransaction();
            try {
                ImageModel::create([
                    'id' => $id,
                    'filename' => $filename,
                    'original_filename' => $name,
                    'format' => $isGif ? 'gif' : 'original',
                    'orientation' => $orientation,
                    'width' => $width,
                    'height' => $height,
                    'size' => $size,
                    'mime_type' => $mime,
                    'storage_path' => $storagePath,
                    'tags' => $tags,
                    'expiry_time' => $expiryTime,
                ]);
                
                if (!empty($tags)) {
                    foreach ($tags as $tag) {
                        Cache::sadd("tags:$tag", $id);
                    }
                    Cache::sadd('all_tags', ...$tags);
                }
                
                $db->commit();
            } catch (Exception $e) {
                $db->rollBack();
                $results[] = ['status' => 'error', 'filename' => $name, 'message' => $e->getMessage()];
                continue;
            }
            
            $results[] = ['status' => 'success', 'filename' => $name, 'id' => $id];
            
            // Process thumbnails in background (synchronous for now)
            if (!$isGif) {
                $localPath = __DIR__ . '/uploads/' . $storagePath;
                if (file_exists($localPath)) {
                    ImageProcessor::processImage($id, $localPath, $orientation);
                }
            }
        }
        
        jsonResponse(['results' => $results]);
    }
    
    // List images
    if ($path === '/api/images' && $method === 'GET') {
        Auth::requireRole('guest');
        
        $page = max(1, (int)getParam('page', 1));
        $limit = min(50, max(1, (int)getParam('limit', 12)));
        $format = getParam('format', 'webp');
        $orientation = getParam('orientation', 'all');
        $tag = getParam('tag', '');
        
        $filters = [];
        if ($format) $filters['format'] = $format;
        if ($orientation && $orientation !== 'all') $filters['orientation'] = $orientation;
        if ($tag) $filters['tag'] = $tag;
        
        $result = ImageModel::listImages($filters, $page, $limit);
        
        foreach ($result['images'] as &$image) {
            $image['urls'] = [
                'original' => Storage::getUrl($image['storage_path']),
                'webp' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/webp/{$image['id']}.webp"),
                'avif' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/avif/{$image['id']}.avif"),
            ];
        }
        
        jsonResponse($result);
    }
    
    // Random image
    if ($path === '/api/random' && $method === 'GET') {
        $filters = [];
        $format = getParam('format', '');
        $orientation = getParam('orientation', 'all');
        $tag = getParam('tag', '');
        $exclude = getParam('exclude', '');
        
        if ($format) $filters['format'] = $format;
        if ($orientation && $orientation !== 'all') $filters['orientation'] = $orientation;
        if ($tag) $filters['tag'] = $tag;
        if ($exclude) $filters['exclude'] = array_map('trim', explode(',', $exclude));
        
        $image = ImageModel::getRandom($filters);
        if (!$image) {
            jsonResponse(['message' => 'No image found'], 404);
        }
        
        $image['urls'] = [
            'original' => Storage::getUrl($image['storage_path']),
            'webp' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/webp/{$image['id']}.webp"),
            'avif' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/avif/{$image['id']}.avif"),
        ];
        
        jsonResponse($image);
    }
    
    // Delete image
    if ($path === '/api/delete-image' && $method === 'POST') {
        Auth::requireAdmin();
        
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? '';
        
        if (empty($id)) {
            jsonResponse(['success' => false, 'message' => 'Missing image ID'], 400);
        }
        
        $image = ImageModel::findById($id);
        if (!$image) {
            jsonResponse(['success' => false, 'message' => 'Image not found'], 404);
        }
        
        Storage::delete($image['storage_path']);
        Storage::delete("{$image['orientation']}/webp/{$image['id']}.webp");
        Storage::delete("{$image['orientation']}/avif/{$image['id']}.avif");
        
        $db = Database::getInstance();
        $stmt = $db->prepare("SELECT storage_path FROM image_thumbnails WHERE image_id = :id");
        $stmt->execute(['id' => $id]);
        foreach ($stmt->fetchAll() as $thumb) {
            Storage::delete($thumb['storage_path']);
        }
        
        ImageModel::deleteById($id);
        
        if (!empty($image['tags'])) {
            foreach ($image['tags'] as $tag) {
                Cache::srem("tags:$tag", $id);
            }
        }
        
        jsonResponse(['success' => true, 'message' => 'Image deleted']);
    }
    
    // Update tags
    if ($path === '/api/update-tags' && $method === 'POST') {
        Auth::requireAdmin();
        
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? '';
        $tags = $input['tags'] ?? [];
        
        if (empty($id)) {
            jsonResponse(['success' => false, 'message' => 'Missing image ID'], 400);
        }
        
        ImageModel::updateTags($id, $tags);
        
        $image = ImageModel::findById($id);
        if ($image && !empty($image['tags'])) {
            foreach ($image['tags'] as $tag) {
                Cache::sadd("tags:$tag", $id);
            }
            Cache::sadd('all_tags', ...$image['tags']);
        }
        
        jsonResponse(['success' => true, 'message' => 'Tags updated']);
    }
    
    // Get tags
    if ($path === '/api/tags' && $method === 'GET') {
        $tags = ImageModel::getAllTags();
        jsonResponse(['tags' => $tags]);
    }
    
    // Trigger cleanup
    if ($path === '/api/trigger-cleanup' && $method === 'POST') {
        Auth::requireAdmin();
        $count = ImageModel::deleteExpired();
        jsonResponse(['success' => true, 'deleted' => $count]);
    }
    
    // 404 for unknown API routes
    jsonResponse(['code' => 404, 'message' => 'Not found'], 404);
}

// Serve HTML pages
if ($path === '/' || $path === '/index.php' || $path === '') {
    if (file_exists(__DIR__ . '/index.html')) {
        header('Content-Type: text/html; charset=utf-8');
        readfile(__DIR__ . '/index.html');
        exit;
    }
}

if ($path === '/upload') {
    if (file_exists(__DIR__ . '/upload.html')) {
        header('Content-Type: text/html; charset=utf-8');
        readfile(__DIR__ . '/upload.html');
        exit;
    }
}

if ($path === '/manage') {
    if (file_exists(__DIR__ . '/manage.html')) {
        header('Content-Type: text/html; charset=utf-8');
        readfile(__DIR__ . '/manage.html');
        exit;
    }
}

// 404
http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
echo '<!DOCTYPE html><html><head><title>404</title></head><body><h1>404 Not Found</h1><p>The requested page was not found.</p></body></html>';

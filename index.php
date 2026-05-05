<?php
/**
 * ImageFlow PHP - Main Entry Point
 */
require_once __DIR__ . '/app/Config.php';
require_once __DIR__ . '/app/Database.php';
require_once __DIR__ . '/app/Cache.php';
require_once __DIR__ . '/app/Router.php';
require_once __DIR__ . '/app/Auth.php';
require_once __DIR__ . '/app/Storage.php';
require_once __DIR__ . '/app/ImageModel.php';
require_once __DIR__ . '/app/ImageProcessor.php';

Config::load();

$router = new Router();

// Validate API Key
$router->post('/api/validate-api-key', function() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $key = null;
    if (preg_match('/Bearer\s+(.+)$/i', $header, $matches)) {
        $key = trim($matches[1]);
    }
    
    $result = Auth::validateKey($key);
    header('Content-Type: application/json');
    echo json_encode($result);
});

// Get config
$router->get('/api/config', function() {
    Auth::requireRole('admin');
    header('Content-Type: application/json');
    echo json_encode([
        'maxUploadCount' => Config::getInt('MAX_UPLOAD_COUNT', 20),
        'imageQuality' => Config::getInt('IMAGE_QUALITY', 80),
        'storageType' => Config::get('STORAGE_TYPE', 'local'),
    ]);
});

// Upload images
$router->post('/api/upload', function() {
    Auth::requireAdmin();
    
    $maxCount = Config::getInt('MAX_UPLOAD_COUNT', 20);
    $quality = Config::getInt('IMAGE_QUALITY', 80);
    
    // Parse form data
    $files = $_FILES['images'] ?? null;
    if (!$files || !is_array($files['name']) || empty($files['name'])) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['code' => 1001, 'message' => 'No files uploaded']);
        return;
    }
    
    $count = count($files['name']);
    if ($count > $maxCount) {
        http_response_code(413);
        header('Content-Type: application/json');
        echo json_encode(['code' => 1004, 'message' => "Too many files. Maximum is $maxCount"]);
        return;
    }
    
    // Parse expiry and tags from POST data
    $expiryMinutes = isset($_POST['expiry_minutes']) ? (int)$_POST['expiry_minutes'] : 0;
    $tags = isset($_POST['tags']) ? explode(',', $_POST['tags']) : [];
    $tags = array_map('trim', array_filter($tags));
    
    $results = [];
    $storageType = Storage::isS3() ? 's3' : 'local';
    
    for ($i = 0; $i < $count; $i++) {
        $name = $files['name'][$i];
        $tmpName = $files['tmp_name'][$i];
        $size = $files['size'][$i];
        $error = $files['error'][$i];
        
        if ($error !== UPLOAD_ERR_OK) {
            $results[] = ['status' => 'error', 'filename' => $name, 'message' => 'Upload error'];
            continue;
        }
        
        // Validate file type
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
        
        // Get image dimensions
        $imgInfo = getimagesize($tmpName);
        $width = $imgInfo[0] ?? 0;
        $height = $imgInfo[1] ?? 0;
        $orientation = $width > $height ? 'landscape' : ($height > $width ? 'portrait' : 'square');
        
        // Save original
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
        
        // Calculate expiry
        $expiryTime = null;
        if ($expiryMinutes > 0) {
            $expiryTime = date('Y-m-d H:i:s', time() + $expiryMinutes * 60);
        }
        
        // Save to database
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
            
            // Index tags in Redis
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
        
        // Queue for background processing (WebP/AVIF conversion + thumbnails)
        if (!$isGif) {
            ImageProcessor::processImage($id, __DIR__ . '/uploads/' . $storagePath, $orientation);
        }
    }
    
    header('Content-Type: application/json');
    echo json_encode(['results' => $results]);
});

// List images
$router->get('/api/images', function() {
    Auth::requireRole('guest');
    
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = min(50, max(1, (int)($_GET['limit'] ?? 12)));
    $format = $_GET['format'] ?? 'webp';
    $orientation = $_GET['orientation'] ?? 'all';
    $tag = $_GET['tag'] ?? '';
    
    $filters = [];
    if ($format) $filters['format'] = $format;
    if ($orientation) $filters['orientation'] = $orientation;
    if ($tag) $filters['tag'] = $tag;
    
    $result = ImageModel::listImages($filters, $page, $limit);
    
    // Add URLs to each image
    foreach ($result['images'] as &$image) {
        $image['urls'] = [
            'original' => Storage::getUrl($image['storage_path']),
            'webp' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/webp/{$image['id']}.webp"),
            'avif' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/avif/{$image['id']}.avif"),
        ];
    }
    
    header('Content-Type: application/json');
    echo json_encode($result);
});

// Random image
$router->get('/api/random', function() {
    $filters = [];
    $format = $_GET['format'] ?? '';
    $orientation = $_GET['orientation'] ?? 'all';
    $tag = $_GET['tag'] ?? '';
    $tags = $_GET['tags'] ?? '';
    $exclude = $_GET['exclude'] ?? '';
    
    if ($format) $filters['format'] = $format;
    if ($orientation && $orientation !== 'all') $filters['orientation'] = $orientation;
    if ($tag) $filters['tag'] = $tag;
    if ($tags) $filters['tag'] = explode(',', $tags)[0];
    if ($exclude) $filters['exclude'] = array_map('trim', explode(',', $exclude));
    
    $image = ImageModel::getRandom($filters);
    
    if (!$image) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['message' => 'No image found']);
        return;
    }
    
    $image['urls'] = [
        'original' => Storage::getUrl($image['storage_path']),
        'webp' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/webp/{$image['id']}.webp"),
        'avif' => $image['format'] === 'gif' ? null : Storage::getUrl("{$image['orientation']}/avif/{$image['id']}.avif"),
    ];
    
    header('Content-Type: application/json');
    echo json_encode($image);
});

// Delete image
$router->post('/api/delete-image', function() {
    Auth::requireAdmin();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';
    
    if (empty($id)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Missing image ID']);
        return;
    }
    
    $image = ImageModel::findById($id);
    if (!$image) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Image not found']);
        return;
    }
    
    // Delete files
    Storage::delete($image['storage_path']);
    Storage::delete("{$image['orientation']}/webp/{$image['id']}.webp");
    Storage::delete("{$image['orientation']}/avif/{$image['id']}.avif");
    
    // Delete thumbnails
    $db = Database::getInstance();
    $stmt = $db->prepare("SELECT storage_path FROM image_thumbnails WHERE image_id = :id");
    $stmt->execute(['id' => $id]);
    $thumbs = $stmt->fetchAll();
    foreach ($thumbs as $thumb) {
        Storage::delete($thumb['storage_path']);
    }
    
    ImageModel::deleteById($id);
    
    // Remove from tag index
    if (!empty($image['tags'])) {
        foreach ($image['tags'] as $tag) {
            Cache::srem("tags:$tag", $id);
        }
    }
    Cache::delete('images_list');
    
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'message' => 'Image deleted']);
});

// Update tags
$router->post('/api/update-tags', function() {
    Auth::requireAdmin();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';
    $tags = $input['tags'] ?? [];
    
    if (empty($id)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Missing image ID']);
        return;
    }
    
    ImageModel::updateTags($id, $tags);
    
    // Update tag index
    $image = ImageModel::findById($id);
    if ($image && !empty($image['tags'])) {
        foreach ($image['tags'] as $tag) {
            Cache::sadd("tags:$tag", $id);
        }
        Cache::sadd('all_tags', ...$image['tags']);
    }
    Cache::delete('images_list');
    
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'message' => 'Tags updated']);
});

// Get tags
$router->get('/api/tags', function() {
    $tags = ImageModel::getAllTags();
    header('Content-Type: application/json');
    echo json_encode(['tags' => $tags]);
});

// Trigger cleanup
$router->post('/api/trigger-cleanup', function() {
    Auth::requireAdmin();
    $count = ImageModel::deleteExpired();
    Cache::delete('images_list');
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'deleted' => $count]);
});

// Dispatch
$router->dispatch();

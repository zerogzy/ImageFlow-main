<?php
class Storage {
    private static ?array $s3Client = null;
    
    public static function isS3(): bool {
        return Config::get('STORAGE_TYPE') === 's3';
    }
    
    public static function getBaseUrl(): string {
        if (self::isS3()) {
            $custom = Config::get('S3_CUSTOM_DOMAIN', '');
            if (!empty($custom)) {
                return rtrim($custom, '/');
            }
            $bucket = Config::get('S3_BUCKET', '');
            $endpoint = Config::get('S3_ENDPOINT', '');
            return rtrim($endpoint, '/') . '/' . $bucket;
        }
        return '/uploads';
    }
    
    public static function save(string $localPath, string $content): bool {
        if (self::isS3()) {
            return self::s3Upload($localPath, $content);
        }
        
        $dir = dirname($localPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return file_put_contents($localPath, $content) !== false;
    }
    
    public static function saveFile(string $sourcePath, string $destPath): bool {
        if (self::isS3()) {
            $content = file_get_contents($sourcePath);
            return self::s3Upload($destPath, $content);
        }
        
        $dir = dirname($destPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return copy($sourcePath, $destPath);
    }
    
    public static function delete(string $path): bool {
        if (self::isS3()) {
            return self::s3Delete($path);
        }
        if (file_exists($path)) {
            return unlink($path);
        }
        return false;
    }
    
    public static function exists(string $path): bool {
        if (self::isS3()) {
            return self::s3Exists($path);
        }
        return file_exists($path);
    }
    
    public static function getUrl(string $path): string {
        if (self::isS3()) {
            return self::getBaseUrl() . '/' . ltrim($path, '/');
        }
        return '/' . ltrim($path, '/');
    }
    
    private static function getS3Client(): array {
        if (self::$s3Client !== null) return self::$s3Client;
        
        // Manual S3 client using cURL (no AWS SDK dependency)
        self::$s3Client = [
            'endpoint' => Config::get('S3_ENDPOINT', ''),
            'region' => Config::get('S3_REGION', ''),
            'bucket' => Config::get('S3_BUCKET', ''),
            'access_key' => Config::get('S3_ACCESS_KEY', ''),
            'secret_key' => Config::get('S3_SECRET_KEY', ''),
        ];
        return self::$s3Client;
    }
    
    private static function s3Upload(string $key, string $content): bool {
        $config = self::getS3Client();
        $url = $config['endpoint'] . '/' . $config['bucket'] . '/' . ltrim($key, '/');
        
        $date = gmdate('D, d M Y H:i:s T');
        $contentType = self::getMimeType($key);
        $stringToSign = "PUT\n\n$contentType\n$date\n/" . $config['bucket'] . "/" . ltrim($key, '/');
        $signature = base64_encode(hash_hmac('sha1', $stringToSign, $config['secret_key'], true));
        
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'PUT',
            CURLOPT_POSTFIELDS => $content,
            CURLOPT_HTTPHEADER => [
                "Authorization: AWS {$config['access_key']}:$signature",
                "Date: $date",
                "Content-Type: $contentType",
            ],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 60,
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        return $httpCode >= 200 && $httpCode < 300;
    }
    
    private static function s3Delete(string $key): bool {
        $config = self::getS3Client();
        $url = $config['endpoint'] . '/' . $config['bucket'] . '/' . ltrim($key, '/');
        
        $date = gmdate('D, d M Y H:i:s T');
        $stringToSign = "DELETE\n\n\n$date\n/" . $config['bucket'] . "/" . ltrim($key, '/');
        $signature = base64_encode(hash_hmac('sha1', $stringToSign, $config['secret_key'], true));
        
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_HTTPHEADER => [
                "Authorization: AWS {$config['access_key']}:$signature",
                "Date: $date",
            ],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        return $httpCode >= 200 && $httpCode < 300;
    }
    
    private static function s3Exists(string $key): bool {
        $config = self::getS3Client();
        $url = $config['endpoint'] . '/' . $config['bucket'] . '/' . ltrim($key, '/');
        
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_NOBODY => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 10,
        ]);
        
        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        return $httpCode === 200;
    }
    
    private static function getMimeType(string $path): string {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $types = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'avif' => 'image/avif',
        ];
        return $types[$ext] ?? 'application/octet-stream';
    }
}

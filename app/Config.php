<?php
/**
 * ImageFlow PHP - Configuration
 */
class Config {
    private static ?array $config = null;
    
    public static function load(): array {
        if (self::$config !== null) return self::$config;
        
        $envFile = __DIR__ . '/.env';
        $defaults = [
            'APP_NAME' => 'ImageFlow',
            'APP_DEBUG' => 'false',
            'DB_HOST' => '127.0.0.1',
            'DB_PORT' => '3306',
            'DB_DATABASE' => 'imageflow',
            'DB_USERNAME' => 'root',
            'DB_PASSWORD' => '',
            'REDIS_HOST' => '127.0.0.1',
            'REDIS_PORT' => '6379',
            'REDIS_PASSWORD' => '',
            'REDIS_CACHE_TTL' => '3600',
            'ADMIN_API_KEY' => '',
            'GUEST_API_KEY' => '',
            'STORAGE_TYPE' => 'local',
            'STORAGE_PATH' => './uploads',
            'S3_ENDPOINT' => '',
            'S3_REGION' => '',
            'S3_BUCKET' => '',
            'S3_ACCESS_KEY' => '',
            'S3_SECRET_KEY' => '',
            'S3_CUSTOM_DOMAIN' => '',
            'MAX_UPLOAD_COUNT' => '20',
            'IMAGE_QUALITY' => '80',
            'THUMBNAIL_WIDTHS' => '400,800,1200',
            'THUMBNAIL_QUALITY' => '80',
            'ALLOWED_ORIGINS' => '*',
        ];
        
        if (file_exists($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) continue;
                if (strpos($line, '=') === false) continue;
                [$key, $value] = explode('=', $line, 2);
                $defaults[trim($key)] = trim($value);
            }
        }
        
        self::$config = $defaults;
        return $defaults;
    }
    
    public static function get(string $key, $default = null) {
        $config = self::load();
        return $config[$key] ?? $default;
    }
    
    public static function getArray(string $key, array $default = []): array {
        $value = self::get($key);
        if ($value === null || $value === '') return $default;
        return array_map('trim', explode(',', $value));
    }
    
    public static function getInt(string $key, int $default = 0): int {
        $value = self::get($key);
        return $value !== null ? (int) $value : $default;
    }
    
    public static function getBool(string $key): bool {
        $value = self::get($key);
        return in_array(strtolower($value), ['true', '1', 'yes'], true);
    }
}

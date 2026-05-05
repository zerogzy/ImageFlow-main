<?php
/**
 * ImageFlow PHP - Database Migration
 * Run this script once to create the database tables.
 * Access: http://your-domain/migrate.php
 */
require_once __DIR__ . '/app/Config.php';
require_once __DIR__ . '/app/Database.php';

Config::load();

$host = Config::get('DB_HOST', '127.0.0.1');
$port = Config::get('DB_PORT', '3306');
$dbname = Config::get('DB_DATABASE', 'imageflow');
$user = Config::get('DB_USERNAME', 'root');
$pass = Config::get('DB_PASSWORD', '');

try {
    $pdo = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbname` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `$dbname`");
    
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS images (
            id VARCHAR(36) PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            format VARCHAR(10) NOT NULL DEFAULT 'original',
            orientation VARCHAR(20) NOT NULL DEFAULT 'landscape',
            width INT DEFAULT 0,
            height INT DEFAULT 0,
            size BIGINT DEFAULT 0,
            mime_type VARCHAR(50) DEFAULT '',
            storage_path VARCHAR(500) DEFAULT '',
            tags JSON DEFAULT NULL,
            expiry_time DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_format (format),
            INDEX idx_orientation (orientation),
            INDEX idx_expiry (expiry_time),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS image_thumbnails (
            id INT AUTO_INCREMENT PRIMARY KEY,
            image_id VARCHAR(36) NOT NULL,
            width INT NOT NULL,
            format VARCHAR(10) NOT NULL,
            storage_path VARCHAR(500) NOT NULL,
            size BIGINT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_image (image_id),
            FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    
    $dirs = [
        __DIR__ . '/uploads/original/landscape',
        __DIR__ . '/uploads/original/portrait',
        __DIR__ . '/uploads/landscape/webp',
        __DIR__ . '/uploads/landscape/avif',
        __DIR__ . '/uploads/portrait/webp',
        __DIR__ . '/uploads/portrait/avif',
        __DIR__ . '/uploads/gif',
    ];
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
    
    echo "✅ Database migration complete!\n";
    echo "Tables created: images, image_thumbnails\n";
    echo "Upload directories created.\n";
} catch (PDOException $e) {
    echo "❌ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}

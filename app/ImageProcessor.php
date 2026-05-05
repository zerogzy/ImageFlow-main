<?php
class ImageProcessor {
    private static array $queue = [];
    
    public static function queueImage(string $id, string $sourcePath, string $orientation): void {
        self::$queue[] = [
            'id' => $id,
            'source' => $sourcePath,
            'orientation' => $orientation,
        ];
    }
    
    public static function processQueue(): void {
        foreach (self::$queue as $item) {
            self::processImage($item['id'], $item['source'], $item['orientation']);
        }
        self::$queue = [];
    }
    
    public static function processImage(string $id, string $sourcePath, string $orientation): void {
        if (!extension_loaded('vips')) {
            return;
        }
        
        try {
            $image = Vips\Image::newFromFile($sourcePath);
            $width = $image->width;
            $height = $image->height;
            $mime = $image->mime_type ?? '';
            $isGif = stripos($mime, 'gif') !== false;
            
            if ($isGif) {
                return;
            }
            
            $quality = Config::getInt('IMAGE_QUALITY', 80);
            $thumbWidths = Config::getArray('THUMBNAIL_WIDTHS', [400, 800, 1200]);
            $thumbQuality = Config::getInt('THUMBNAIL_QUALITY', 80);
            
            // Convert to WebP and AVIF
            $baseDir = __DIR__ . "/../uploads/$orientation";
            
            // WebP
            $webpPath = "$baseDir/webp/$id.webp";
            $image->webpsave($webpPath, ['Q' => $quality]);
            if (Storage::isS3()) {
                Storage::saveFile($webpPath, "landscape/webp/$id.webp");
            }
            
            // AVIF
            $avifPath = "$baseDir/avif/$id.avif";
            $image->heifsave($avifPath, ['Q' => $quality, 'compression' => 'av1']);
            if (Storage::isS3()) {
                Storage::saveFile($avifPath, "landscape/avif/$id.avif");
            }
            
            // Thumbnails
            $db = Database::getInstance();
            foreach ($thumbWidths as $thumbW) {
                if ($width <= $thumbW) continue;
                
                $ratio = $thumbW / $width;
                $thumbH = (int) round($height * $ratio);
                $thumb = $image->resize($ratio);
                
                foreach (['webp', 'avif'] as $format) {
                    $thumbFileName = "{$id}_{$thumbW}.{$format}";
                    $thumbPath = "$baseDir/$format/$thumbFileName";
                    
                    if ($format === 'webp') {
                        $thumb->webpsave($thumbPath, ['Q' => $thumbQuality]);
                    } else {
                        $thumb->heifsave($thumbPath, ['Q' => $thumbQuality, 'compression' => 'av1']);
                    }
                    
                    $thumbSize = filesize($thumbPath);
                    $thumbStoragePath = "$orientation/$format/$thumbFileName";
                    
                    if (Storage::isS3()) {
                        Storage::saveFile($thumbPath, $thumbStoragePath);
                    }
                    
                    $stmt = $db->prepare("INSERT INTO image_thumbnails (image_id, width, format, storage_path, size) VALUES (:id, :width, :format, :path, :size)");
                    $stmt->execute([
                        'id' => $id,
                        'width' => $thumbW,
                        'format' => $format,
                        'path' => $thumbStoragePath,
                        'size' => $thumbSize,
                    ]);
                }
            }
            
            $image->close();
        } catch (\Exception $e) {
            error_log("Image processing failed for $id: " . $e->getMessage());
        }
    }
    
    public static function detectOrientation(int $width, int $height): string {
        if ($width > $height) return 'landscape';
        if ($height > $width) return 'portrait';
        return 'square';
    }
}

<?php
class ImageModel {
    public static function create(array $data): bool {
        $db = Database::getInstance();
        $stmt = $db->prepare("
            INSERT INTO images (id, filename, original_filename, format, orientation, width, height, size, mime_type, storage_path, tags, expiry_time)
            VALUES (:id, :filename, :original_filename, :format, :orientation, :width, :height, :size, :mime_type, :storage_path, :tags, :expiry_time)
        ");
        return $stmt->execute([
            'id' => $data['id'],
            'filename' => $data['filename'],
            'original_filename' => $data['original_filename'],
            'format' => $data['format'] ?? 'original',
            'orientation' => $data['orientation'] ?? 'landscape',
            'width' => $data['width'] ?? 0,
            'height' => $data['height'] ?? 0,
            'size' => $data['size'] ?? 0,
            'mime_type' => $data['mime_type'] ?? '',
            'storage_path' => $data['storage_path'] ?? '',
            'tags' => !empty($data['tags']) ? json_encode($data['tags']) : null,
            'expiry_time' => $data['expiry_time'] ?? null,
        ]);
    }
    
    public static function findById(string $id): ?array {
        $db = Database::getInstance();
        $stmt = $db->prepare("SELECT * FROM images WHERE id = :id");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if ($row && $row['tags']) {
            $row['tags'] = json_decode($row['tags'], true);
        }
        return $row ?: null;
    }
    
    public static function listImages(array $filters = [], int $page = 1, int $limit = 12): array {
        $db = Database::getInstance();
        $where = [];
        $params = [];
        
        if (!empty($filters['format'])) {
            $where[] = 'format = :format';
            $params['format'] = $filters['format'];
        }
        if (!empty($filters['orientation']) && $filters['orientation'] !== 'all') {
            $where[] = 'orientation = :orientation';
            $params['orientation'] = $filters['orientation'];
        }
        if (!empty($filters['tag'])) {
            $where[] = 'JSON_CONTAINS(tags, JSON_QUOTE(:tag))';
            $params['tag'] = $filters['tag'];
        }
        
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        
        // Count total
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM images $whereSql");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch()['total'];
        
        // Get page
        $offset = ($page - 1) * $limit;
        $params['limit'] = $limit;
        $params['offset'] = $offset;
        $sql = "SELECT * FROM images $whereSql ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        if (!empty($filters['format'])) {
            $stmt->bindValue(':format', $filters['format']);
        }
        if (!empty($filters['orientation']) && $filters['orientation'] !== 'all') {
            $stmt->bindValue(':orientation', $filters['orientation']);
        }
        if (!empty($filters['tag'])) {
            $stmt->bindValue(':tag', $filters['tag']);
        }
        $stmt->execute();
        $rows = $stmt->fetchAll();
        
        foreach ($rows as &$row) {
            if ($row['tags']) {
                $row['tags'] = json_decode($row['tags'], true);
            }
        }
        
        $totalPages = max(1, (int) ceil($total / $limit));
        
        return [
            'images' => $rows,
            'page' => $page,
            'totalPages' => $totalPages,
            'total' => $total,
        ];
    }
    
    public static function getRandom(array $filters = []): ?array {
        $db = Database::getInstance();
        $where = [];
        $params = [];
        
        if (!empty($filters['format']) && $filters['format'] !== 'original') {
            $where[] = 'format = :format';
            $params['format'] = $filters['format'];
        }
        if (!empty($filters['orientation']) && $filters['orientation'] !== 'all') {
            $where[] = 'orientation = :orientation';
            $params['orientation'] = $filters['orientation'];
        }
        if (!empty($filters['tag'])) {
            $where[] = 'JSON_CONTAINS(tags, JSON_QUOTE(:tag))';
            $params['tag'] = $filters['tag'];
        }
        if (!empty($filters['exclude'])) {
            $excludeTags = $filters['exclude'];
            foreach ($excludeTags as $i => $tag) {
                $where[] = "NOT JSON_CONTAINS(tags, JSON_QUOTE(:exclude$i))";
                $params["exclude$i"] = $tag;
            }
        }
        
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        
        // Get count
        $countStmt = $db->prepare("SELECT COUNT(*) as total FROM images $whereSql");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch()['total'];
        
        if ($total === 0) return null;
        
        $offset = rand(0, max(0, $total - 1));
        $params['limit'] = 1;
        $params['offset'] = $offset;
        $sql = "SELECT * FROM images $whereSql ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $db->prepare($sql);
        $stmt->bindValue(':limit', 1, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        foreach ($params as $k => $v) {
            if ($k !== 'limit' && $k !== 'offset') {
                $stmt->bindValue(":$k", $v);
            }
        }
        $stmt->execute();
        $row = $stmt->fetch();
        
        if ($row && $row['tags']) {
            $row['tags'] = json_decode($row['tags'], true);
        }
        return $row ?: null;
    }
    
    public static function deleteById(string $id): bool {
        $db = Database::getInstance();
        $stmt = $db->prepare("DELETE FROM images WHERE id = :id");
        return $stmt->execute(['id' => $id]);
    }
    
    public static function updateTags(string $id, array $tags): bool {
        $db = Database::getInstance();
        $stmt = $db->prepare("UPDATE images SET tags = :tags WHERE id = :id");
        return $stmt->execute([
            'id' => $id,
            'tags' => json_encode($tags),
        ]);
    }
    
    public static function deleteExpired(): int {
        $db = Database::getInstance();
        $stmt = $db->query("SELECT id, storage_path FROM images WHERE expiry_time IS NOT NULL AND expiry_time < NOW()");
        $expired = $stmt->fetchAll();
        
        foreach ($expired as $row) {
            // Delete files
            $storagePath = $row['storage_path'];
            if (!empty($storagePath) && file_exists($storagePath)) {
                unlink($storagePath);
            }
            // Delete thumbnails
            $thumbStmt = $db->prepare("SELECT storage_path FROM image_thumbnails WHERE image_id = :id");
            $thumbStmt->execute(['id' => $row['id']]);
            $thumbs = $thumbStmt->fetchAll();
            foreach ($thumbs as $thumb) {
                if (!empty($thumb['storage_path']) && file_exists($thumb['storage_path'])) {
                    unlink($thumb['storage_path']);
                }
            }
            $db->prepare("DELETE FROM image_thumbnails WHERE image_id = :id")->execute(['id' => $row['id']]);
        }
        
        $count = count($expired);
        if ($count > 0) {
            $db->prepare("DELETE FROM images WHERE expiry_time IS NOT NULL AND expiry_time < NOW()")->execute();
        }
        
        return $count;
    }
    
    public static function getAllTags(): array {
        $db = Database::getInstance();
        $stmt = $db->query("SELECT tags FROM images WHERE tags IS NOT NULL AND tags != 'null' AND tags != '[]'");
        $rows = $stmt->fetchAll();
        
        $tags = [];
        foreach ($rows as $row) {
            if ($row['tags']) {
                $tagList = json_decode($row['tags'], true);
                if (is_array($tagList)) {
                    foreach ($tagList as $tag) {
                        $tags[$tag] = true;
                    }
                }
            }
        }
        
        $tagNames = array_keys($tags);
        sort($tagNames);
        return $tagNames;
    }
}

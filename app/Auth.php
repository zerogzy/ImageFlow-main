<?php
class Auth {
    public static function validateKey(?string $key): array {
        if (empty($key)) {
            return ['valid' => false];
        }
        
        $adminKey = Config::get('ADMIN_API_KEY', '');
        $guestKey = Config::get('GUEST_API_KEY', '');
        
        // No keys configured = open access
        if (empty($adminKey) && empty($guestKey)) {
            return ['valid' => true, 'role' => 'admin'];
        }
        
        if (!empty($adminKey) && hash_equals($adminKey, $key)) {
            return ['valid' => true, 'role' => 'admin'];
        }
        
        if (!empty($guestKey) && hash_equals($guestKey, $key)) {
            return ['valid' => true, 'role' => 'guest'];
        }
        
        return ['valid' => false];
    }
    
    public static function getApiKeyFromRequest(): ?string {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)$/i', $header, $matches)) {
            return trim($matches[1]);
        }
        return $_GET['api_key'] ?? null;
    }
    
    public static function requireAdmin(): void {
        $key = self::getApiKeyFromRequest();
        $result = self::validateKey($key);
        
        if (!$result['valid'] || $result['role'] !== 'admin') {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['code' => 1002, 'message' => 'Invalid API key']);
            exit;
        }
    }
    
    public static function requireRole(string $minRole): void {
        $adminKey = Config::get('ADMIN_API_KEY', '');
        $guestKey = Config::get('GUEST_API_KEY', '');
        
        // Open access mode
        if (empty($adminKey) && empty($guestKey)) {
            return;
        }
        
        $key = self::getApiKeyFromRequest();
        $result = self::validateKey($key);
        
        if (!$result['valid']) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['code' => 1002, 'message' => 'Invalid API key']);
            exit;
        }
        
        if ($minRole === 'admin' && $result['role'] !== 'admin') {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['code' => 1003, 'message' => 'No permission to access']);
            exit;
        }
    }
}

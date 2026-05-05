<?php
class Router {
    private array $routes = [];
    private string $basePath = '';
    
    public function __construct(string $basePath = '') {
        $this->basePath = rtrim($basePath, '/');
    }
    
    public function get(string $path, callable $handler): void {
        $this->addRoute('GET', $path, $handler);
    }
    
    public function post(string $path, callable $handler): void {
        $this->addRoute('POST', $path, $handler);
    }
    
    public function delete(string $path, callable $handler): void {
        $this->addRoute('DELETE', $path, $handler);
    }
    
    private function addRoute(string $method, string $path, callable $handler): void {
        $path = rtrim($path, '/');
        if ($path === '') $path = '/';
        $this->routes[$method][$path] = $handler;
    }
    
    public function dispatch(): void {
        $method = $_SERVER['REQUEST_METHOD'];
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $path = rtrim($path, '/');
        if ($path === '') $path = '/';
        
        // Remove base path
        if ($this->basePath !== '' && str_starts_with($path, $this->basePath)) {
            $path = substr($path, strlen($this->basePath));
            if ($path === '') $path = '/';
        }
        
        $handler = $this->routes[$method][$path] ?? null;
        
        if (!$handler) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['code' => 404, 'message' => 'Not found']);
            return;
        }
        
        // CORS
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
            return;
        }
        
        try {
            $handler();
        } catch (\Exception $e) {
            http_response_code(500);
            header('Content-Type: application/json');
            $debug = Config::getBool('APP_DEBUG');
            echo json_encode([
                'code' => 500,
                'message' => $debug ? $e->getMessage() : 'Internal server error',
            ]);
        }
    }
}

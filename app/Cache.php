<?php
class Cache {
    private static ?\Redis $instance = null;
    
    public static function getInstance(): ?\Redis {
        if (self::$instance !== null) return self::$instance;
        
        $host = Config::get('REDIS_HOST', '127.0.0.1');
        $port = (int) Config::get('REDIS_PORT', '6379');
        $pass = Config::get('REDIS_PASSWORD', '');
        
        if (empty($host) || !class_exists('\Redis')) {
            return null;
        }
        
        try {
            self::$instance = new \Redis();
            self::$instance->connect($host, $port);
            if (!empty($pass)) {
                self::$instance->auth($pass);
            }
            return self::$instance;
        } catch (\Exception $e) {
            return null;
        }
    }
    
    public static function get(string $key) {
        $redis = self::getInstance();
        if (!$redis) return null;
        
        $data = $redis->get('if:' . $key);
        return $data !== false ? json_decode($data, true) : null;
    }
    
    public static function set(string $key, $value, int $ttl = 3600): bool {
        $redis = self::getInstance();
        if (!$redis) return false;
        
        return $redis->setEx('if:' . $key, $ttl, json_encode($value));
    }
    
    public static function delete(string $key): bool {
        $redis = self::getInstance();
        if (!$redis) return false;
        return (bool) $redis->del('if:' . $key);
    }
    
    public static function flush(): bool {
        $redis = self::getInstance();
        if (!$redis) return false;
        
        $keys = $redis->keys('if:*');
        if (empty($keys)) return true;
        return (bool) $redis->del($keys);
    }
    
    public static function sadd(string $key, ...$values): int {
        $redis = self::getInstance();
        if (!$redis) return 0;
        return $redis->sAdd('if:' . $key, ...$values);
    }
    
    public static function srem(string $key, ...$values): int {
        $redis = self::getInstance();
        if (!$redis) return 0;
        return $redis->sRem('if:' . $key, ...$values);
    }
    
    public static function smembers(string $key): array {
        $redis = self::getInstance();
        if (!$redis) return [];
        return $redis->sMembers('if:' . $key);
    }
    
    public static function sismember(string $key, $value): bool {
        $redis = self::getInstance();
        if (!$redis) return false;
        return (bool) $redis->sIsMember('if:' . $key, $value);
    }
}

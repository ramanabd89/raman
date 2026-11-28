<?php
namespace App\Core;

use App\Models\Setting;

/** The current HTTP request: method, path, query, JSON/form body, uploaded files, client IP, signed-in user. */
final class Request
{
    public string $method;
    public string $path;
    public array $query;
    public array $body = [];
    public array $files;
    public array $params = [];
    public ?array $user = null;
    public ?string $token = null;
    public bool $viaCookie = false;
    public string $ip;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $this->path = Url::requestPath();
        $this->query = $_GET;
        $this->files = $_FILES;
        $this->ip = self::clientIp();
        $type = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
        if (str_contains($type, 'application/json')) {
            $raw = (string)file_get_contents('php://input');
            if (strlen($raw) > 1048576) throw new HttpException(413, 'too_large');
            if ($raw !== '') {
                $j = json_decode($raw, true);
                if (!is_array($j)) throw new HttpException(400, 'invalid_json');
                $this->body = $j;
            }
        } else {
            $this->body = $_POST;
        }
    }

    /** Real visitor IP; proxy headers are trusted only when Admin → Settings says the site is behind Cloudflare/a proxy. */
    public static function clientIp(): string
    {
        $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
        try { $trust = Setting::get('trust_proxy') === '1'; } catch (\Throwable) { $trust = false; }
        if ($trust) {
            if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return (string)$_SERVER['HTTP_CF_CONNECTING_IP'];
            if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) return trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        }
        return $remote;
    }

    public function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if (isset($_SERVER[$key])) return (string)$_SERVER[$key];
        if ($name === 'Authorization' && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) return (string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        if (function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strcasecmp($k, $name) === 0) return (string)$v;
        return '';
    }

    public function input(string $key, $default = null) { return $this->body[$key] ?? $default; }
    public function q(string $key, $default = null) { return $this->query[$key] ?? $default; }
    public function param(string $key): string { return (string)($this->params[$key] ?? ''); }
    public function isApi(): bool { return strncmp($this->path, '/api/', 5) === 0 || $this->path === '/api'; }
    public function uid(): int { return (int)($this->user['id'] ?? 0); }
}

<?php
namespace App\Core;

use App\Config\Config;

/**
 * Works out the site address at runtime, so the shop runs unchanged at https://domain.com/,
 * http://localhost/ramanphone/ or any staging domain:
 *  - scheme: HTTPS flag, port 443, X-Forwarded-Proto, Cloudflare's CF-Visitor
 *  - host:   Host header
 *  - base:   the folder index.php lives in, from SCRIPT_NAME
 * config.php 'public_url' (optional) pins the scheme + host for links that leave the site (Telegram, sitemap).
 */
final class Url
{
    private static ?string $base = null;

    public static function scheme(): string
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') return 'https';
        if (($_SERVER['SERVER_PORT'] ?? '') === '443') return 'https';
        if (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') return 'https';
        $cf = json_decode((string)($_SERVER['HTTP_CF_VISITOR'] ?? ''), true);
        if (is_array($cf) && ($cf['scheme'] ?? '') === 'https') return 'https';
        return 'http';
    }

    public static function host(): string
    {
        $h = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
        return preg_match('/^[a-z0-9.\-:\[\]]+$/i', $h) ? $h : 'localhost';
    }

    /** "/" or "/sub/folder/" */
    public static function base(): string
    {
        if (self::$base !== null) return self::$base;
        $dir = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/index.php')));
        $dir = rtrim($dir, '/.');
        return self::$base = ($dir === '' ? '' : $dir) . '/';
    }

    public static function origin(): string
    {
        $fixed = rtrim((string)Config::get('public_url', ''), '/');
        if ($fixed !== '') { $p = parse_url($fixed); if (!empty($p['host'])) return ($p['scheme'] ?? 'https') . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : ''); }
        return self::scheme() . '://' . self::host();
    }

    /** Absolute URL for a path relative to the install folder. */
    public static function to(string $path = ''): string { return self::origin() . self::base() . ltrim($path, '/'); }

    /** Request path relative to the install folder, always starting with "/". */
    public static function requestPath(): string
    {
        $p = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
        $b = self::base();
        if ($b !== '/' && strncmp($p, $b, strlen($b)) === 0) $p = substr($p, strlen($b) - 1);
        elseif ($b !== '/' && $p . '/' === $b) $p = '/';
        return '/' . ltrim($p, '/');
    }

    public static function isHttps(): bool { return self::scheme() === 'https'; }
}

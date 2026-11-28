<?php
namespace App\Services;

/**
 * Small file cache in storage/cache/ (no Redis/Memcached needed on shared hosting).
 * - JSON only (never unserialize()), so a tampered cache file can't run code.
 * - Atomic writes: temp file written with LOCK_EX, then rename() over the old file.
 * - Every key belongs to one tag (catalog, content, settings…); a tag is cleared as a whole when the data behind it changes.
 *   The file name is "<tag>__<sha1(key)>.json", so clearing a tag is one glob.
 */
final class CacheService
{
    public const TAGS = ['catalog', 'content', 'settings', 'sitemap'];

    /** What a successful change (non-GET API call) makes stale: path prefix → tags. */
    private const INVALIDATE = [
        '/api/admin/products' => ['catalog', 'sitemap'], '/api/admin/bulk-price' => ['catalog'], '/api/admin/variant-presets' => ['catalog'],
        '/api/admin/stock' => ['catalog'], '/api/admin/categories' => ['catalog', 'sitemap'], '/api/admin/tags' => ['catalog'],
        '/api/admin/banners' => ['content'], '/api/admin/faqs' => ['content'], '/api/admin/reviews' => ['catalog'],
        '/api/admin/settings' => ['settings', 'catalog', 'content'], '/api/admin/orders' => ['catalog'], '/api/admin/tradeins' => ['catalog', 'sitemap'],
        '/api/admin/repair-prices' => ['catalog'], '/api/admin/tradein-rules' => ['settings'], '/api/admin/repair-services' => ['catalog'],
        '/api/orders' => ['catalog'], '/api/products/' => ['catalog'],
    ];

    private static function dir(): string { return ROOT . '/storage/cache'; }
    private static function tag(string $t): string { return in_array($t, self::TAGS, true) ? $t : 'catalog'; }
    private static function file(string $tag, string $key): string { return self::dir() . '/' . self::tag($tag) . '__' . sha1($key) . '.json'; }

    private static function ready(): bool
    {
        $d = self::dir();
        if (!is_dir($d) && !@mkdir($d, 0775, true) && !is_dir($d)) return false;
        return is_writable($d);
    }

    /** @return array{0: bool, 1: mixed} [hit, value] */
    public static function get(string $tag, string $key): array
    {
        $f = self::file($tag, $key);
        if (!is_file($f)) return [false, null];
        $raw = @file_get_contents($f);
        $d = $raw === false ? null : json_decode($raw, true);
        if (!is_array($d) || !isset($d['e']) || !array_key_exists('v', $d) || $d['e'] < time()) { @unlink($f); return [false, null]; }
        return [true, $d['v']];
    }

    public static function set(string $tag, string $key, $value, int $ttl = 300): void
    {
        if (!self::ready()) return;
        $json = json_encode(['e' => time() + max(1, $ttl), 'k' => $key, 'v' => $value], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        if ($json === false) return;
        $f = self::file($tag, $key);
        $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) { @unlink($tmp); return; }
        @chmod($tmp, 0664);
        if (!@rename($tmp, $f)) @unlink($tmp);
    }

    /** Cached value, or compute + store it. */
    public static function remember(string $tag, string $key, int $ttl, callable $make)
    {
        [$hit, $v] = self::get($tag, $key);
        if ($hit) return $v;
        $v = $make();
        self::set($tag, $key, $v, $ttl);
        return $v;
    }

    public static function forget(string ...$tags): int
    {
        $n = 0;
        foreach ($tags as $t) foreach (glob(self::dir() . '/' . self::tag($t) . '__*.json') ?: [] as $f) if (@unlink($f)) $n++;
        return $n;
    }

    public static function clear(): int
    {
        $n = 0;
        foreach (glob(self::dir() . '/*.{json,tmp}', GLOB_BRACE) ?: [] as $f) if (@unlink($f)) $n++;
        return $n;
    }

    public static function stats(): array
    {
        $files = glob(self::dir() . '/*.json') ?: [];
        $size = 0; $by = array_fill_keys(self::TAGS, 0);
        foreach ($files as $f) { $size += (int)@filesize($f); $t = explode('__', basename($f))[0]; if (isset($by[$t])) $by[$t]++; }
        return ['files' => count($files), 'bytes' => $size, 'by_tag' => $by, 'writable' => self::ready()];
    }

    /** Called after every successful state-changing API request. */
    public static function afterWrite(string $method, string $path): void
    {
        if ($method === 'GET' || $method === 'HEAD') return;
        $tags = [];
        foreach (self::INVALIDATE as $prefix => $t) if (strncmp($path, $prefix, strlen($prefix)) === 0) $tags = array_merge($tags, $t);
        if ($tags) self::forget(...array_unique($tags));
    }
}

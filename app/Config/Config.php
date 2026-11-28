<?php
namespace App\Config;

/**
 * Reads config.php (written by install.php). Only things needed before the database is reachable live here:
 * database login, secret admin address, optional fixed site URL, environment. Everything else (OTPIQ, Telegram,
 * store info…) is edited in Admin → Settings and stored in the `settings` table.
 * Environment variables RP_<KEY> override the file (handy for staging/tests).
 */
final class Config
{
    private static ?array $data = null;

    public static function file(): string { return ROOT . '/config.php'; }
    public static function exists(): bool { return is_file(self::file()); }

    public static function get(string $key, $default = null)
    {
        if (self::$data === null) {
            $c = self::exists() ? require self::file() : [];
            self::$data = is_array($c) ? $c : [];
        }
        $env = getenv('RP_' . strtoupper($key));
        if ($env !== false && $env !== '') return $env;
        $v = self::$data[$key] ?? null;
        return $v === null || $v === '' ? $default : $v;
    }

    public static function isProd(): bool { return self::get('env', 'production') === 'production'; }

    public static function adminPath(): string
    {
        $p = preg_replace('/[^\w-]/', '', trim((string)self::get('admin_path', 'admin'), '/'));
        return $p === '' ? 'admin' : $p;
    }
}

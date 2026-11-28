<?php
namespace App\Core;

/** Counts attempts per key in the database (survives restarts). Keys: "ip:1.2.3.4", "phone:0750…", "coupon:…", "revup:<user>", "track:<ip>". */
final class RateLimiter
{
    public const WINDOW_MS = 15 * 60 * 1000;
    public const LIMITS = ['ip' => 30, 'phone' => 8, 'coupon' => 15, 'revup' => 12, 'track' => 120, 'otpiq_test' => 5];

    public static function failures(string $key): int
    {
        return (int)Model::val('SELECT COUNT(*) FROM auth_failures WHERE `key` = ? AND ts > ?', [$key, ms() - self::WINDOW_MS]);
    }
    public static function check(array $keys): void
    {
        foreach ($keys as $k) if (self::failures($k) >= (self::LIMITS[explode(':', $k)[0]] ?? 30)) throw new HttpException(429, 'too_many_attempts');
    }
    public static function hit(array $keys): void
    {
        foreach ($keys as $k) Model::run('INSERT INTO auth_failures(`key`, ts) VALUES(?, ?)', [$k, ms()]);
    }
    /** check + count in one go (every call counts) */
    public static function throttle(array $keys): void { self::check($keys); self::hit($keys); }
    public static function clear(string $key): void { Model::run('DELETE FROM auth_failures WHERE `key` = ?', [$key]); }
    public static function prune(): void { Model::run('DELETE FROM auth_failures WHERE ts < ?', [ms() - 86400000]); }
}

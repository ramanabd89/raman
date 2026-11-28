<?php
namespace App\Models;

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Model;

final class User extends Model
{
    public static function find(int $id): ?array { return self::one('SELECT * FROM users WHERE id = ?', [$id]); }
    public static function byPhone(string $phone): ?array { return self::one('SELECT * FROM users WHERE phone = ?', [$phone]); }

    public static function referralCode(): string
    {
        for (;;) { $c = strtoupper(substr(rand_hex(4), 0, 8)); if (!self::one('SELECT 1 FROM users WHERE referral_code = ?', [$c])) return $c; }
    }
    public static function referrer(string $code): ?int
    {
        if ($code === '') return null;
        $r = self::one('SELECT id FROM users WHERE referral_code = ?', [$code]);
        if (!$r) throw new HttpException(422, 'invalid_referral');
        return (int)$r['id'];
    }
    public static function create(string $name, string $phone, string $password, ?int $referredBy = null, string $role = 'customer'): int
    {
        self::run('INSERT INTO users(name, phone, password_hash, referral_code, referred_by, role, created_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP())',
            [$name, $phone, password_hash($password, PASSWORD_DEFAULT), self::referralCode(), $referredBy, $role]);
        return self::lastId();
    }
    public static function setPassword(int $id, string $password): void { self::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $id]); }

    public static function adminList(string $q): array
    {
        $rows = $q !== '' ? self::all('SELECT * FROM users WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 300', ["%$q%", "%$q%"]) : self::all('SELECT * FROM users ORDER BY id DESC LIMIT 300');
        return array_map(fn($u) => Auth::publicUser($u) + ['blocked' => (bool)$u['blocked'], 'block_reason' => $u['block_reason'],
            'orders' => (int)self::val('SELECT COUNT(*) FROM orders WHERE user_id = ?', [$u['id']]),
            'cancelled' => (int)self::val("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'cancelled'", [$u['id']])], $rows);
    }
    public static function staff(): array
    {
        return array_map(fn($u) => ['totp_enabled' => (bool)$u['totp_enabled']] + $u, self::all("SELECT id, name, phone, role, totp_enabled, created_at FROM users WHERE role != 'customer' ORDER BY id"));
    }
    public static function setRole(int $id, string $role): void
    {
        self::run('UPDATE users SET role = ? WHERE id = ?', [$role, $id]);
        self::run('DELETE FROM sessions WHERE user_id = ?', [$id]); // must sign in again with the new role
    }
}

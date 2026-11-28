<?php
namespace App\Core;

/**
 * Sign-in sessions stored in the `sessions` table.
 * Browsers get an HttpOnly, SameSite=Lax cookie (rp_sid) — scripts can't read it. API clients (a future mobile app)
 * may send Authorization: Bearer <token> instead; they ask for the token with the header X-Client: api.
 * Customers stay signed in 30 days, staff 7 days.
 */
final class Auth
{
    public const COOKIE = 'rp_sid';
    public const STAFF_ROLES = ['admin', 'manager', 'orders', 'technician', 'products'];

    public static function isStaff($role): bool { return in_array($role, self::STAFF_ROLES, true); }

    public static function load(Request $req): void
    {
        $h = $req->header('Authorization');
        $token = null; $viaCookie = false;
        if (strncmp($h, 'Bearer ', 7) === 0) $token = substr($h, 7);
        elseif (!empty($_COOKIE[self::COOKIE])) { $token = (string)$_COOKIE[self::COOKIE]; $viaCookie = true; }
        if (!$token || !preg_match('/^[a-f0-9]{64}$/', $token)) return;
        $row = Model::one('SELECT u.*, TIMESTAMPDIFF(SECOND, s.created_at, UTC_TIMESTAMP()) / 86400 AS session_age FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', [$token]);
        if (!$row) { if ($viaCookie) self::clearCookie(); return; }
        $days = $row['role'] === 'customer' ? 30 : 7;
        if ((float)$row['session_age'] > $days) { Model::run('DELETE FROM sessions WHERE token = ?', [$token]); if ($viaCookie) self::clearCookie(); return; }
        unset($row['session_age']);
        $req->user = $row; $req->token = $token; $req->viaCookie = $viaCookie;
    }

    /** Starts a session; returns the response body part (token only for API clients). */
    public static function login(Request $req, int $userId): array
    {
        $token = rand_hex(32);
        Model::run('INSERT INTO sessions(token, user_id, created_at) VALUES(?, ?, UTC_TIMESTAMP())', [$token, $userId]);
        $role = (string)Model::val('SELECT role FROM users WHERE id = ?', [$userId]);
        setcookie(self::COOKIE, $token, ['expires' => time() + 86400 * ($role === 'customer' ? 30 : 7), 'path' => Url::base(),
            'secure' => Url::isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
        return strtolower($req->header('X-Client')) === 'api' ? ['token' => $token] : [];
    }

    public static function logout(Request $req): void
    {
        if ($req->token) Model::run('DELETE FROM sessions WHERE token = ?', [$req->token]);
        self::clearCookie();
    }

    private static function clearCookie(): void
    {
        setcookie(self::COOKIE, '', ['expires' => time() - 3600, 'path' => Url::base(), 'secure' => Url::isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
    }

    public static function publicUser(?array $u): ?array
    {
        if (!$u) return null;
        return ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'role' => $u['role'], 'wallet' => $u['wallet'],
            'referral_code' => $u['referral_code'], 'avatar' => $u['avatar'], 'created_at' => $u['created_at'], 'totp_enabled' => (bool)$u['totp_enabled']];
    }
}

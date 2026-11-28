<?php
namespace App\Services;

/** RFC 6238 authenticator codes (Google Authenticator, Microsoft Authenticator, Authy) for staff two-step sign-in. */
final class TotpService
{
    private const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function encode(string $bin): string
    {
        $bits = 0; $value = 0; $out = '';
        foreach (str_split($bin) as $ch) {
            $value = (($value << 8) | ord($ch)) & 0xFFFFFF; $bits += 8;
            while ($bits >= 5) { $out .= self::B32[($value >> ($bits - 5)) & 31]; $bits -= 5; }
        }
        if ($bits > 0) $out .= self::B32[($value << (5 - $bits)) & 31];
        return $out;
    }
    public static function decode(string $s): string
    {
        $bits = 0; $value = 0; $out = '';
        foreach (str_split(preg_replace('/[^A-Z2-7]/', '', strtoupper($s))) as $ch) {
            if ($ch === '') continue;
            $value = (($value << 5) | strpos(self::B32, $ch)) & 0xFFFFFF; $bits += 5;
            if ($bits >= 8) { $out .= chr(($value >> ($bits - 8)) & 255); $bits -= 8; }
        }
        return $out;
    }
    public static function hotp(string $secret, int $counter): string
    {
        $h = hash_hmac('sha1', pack('J', $counter), self::decode($secret), true);
        $o = ord($h[19]) & 15;
        $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
        return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
    }
    public static function newSecret(): string { return self::encode(random_bytes(20)); }
    /** accepts the current 30-second code and one step either side (phone clocks drift) */
    public static function verify(?string $secret, $code): bool
    {
        $c = preg_replace('/\D/', '', (string)($code ?? ''));
        if (strlen($c) !== 6 || !$secret) return false;
        $step = intdiv(ms(), 30000);
        for ($w = -1; $w <= 1; $w++) if (hash_equals(self::hotp($secret, $step + $w), $c)) return true;
        return false;
    }
    public static function url(string $secret, string $account, string $issuer): string
    {
        return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($account) . "?secret=$secret&issuer=" . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=30';
    }
}

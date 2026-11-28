<?php
namespace App\Services;

use App\Core\HttpException;
use App\Core\Model;
use App\Models\Setting;

/**
 * One-time verification codes through OTPIQ (https://api.otpiq.com/api/sms).
 * Settings (Admin → Settings): otpiq_api_key, otpiq_provider (auto | whatsapp-telegram-sms | whatsapp | sms | telegram),
 * otp_test_mode (codes are only written to the PHP error log and returned to the page — local testing only),
 * otp_allowed_prefixes (default 96475,96477,96478,96479).
 * Security: 6-digit code from random_int, salted SHA-256 hash, 5-minute life, 5 tries, 60 s resend wait,
 * 5 codes per phone and 20 per IP per hour, newest code only.
 */
final class OtpiqService
{
    public const ENDPOINT = 'https://api.otpiq.com/api/sms';
    public const PROVIDERS = ['auto', 'whatsapp-telegram-sms', 'whatsapp', 'sms', 'telegram'];
    public const PURPOSES = ['register', 'reset', 'change_phone', 'quick'];
    private const TTL_MS = 300000, RESEND_MS = 60000, MAX_TRIES = 5;

    /** 0750 123 4567 / +964 750… / 00964… / 750… → 9647501234567 (digits only), or '' when not a valid mobile. */
    public static function normalize(string $phone): string
    {
        $d = preg_replace('/\D/', '', $phone);
        if (strncmp($d, '00', 2) === 0) $d = substr($d, 2);
        if (strncmp($d, '964', 3) === 0) $d = substr($d, 3);
        $d = ltrim($d, '0');
        $d = '964' . $d;
        if (!preg_match('/^964\d{10}$/', $d)) return '';
        $prefixes = array_filter(array_map(fn($x) => preg_replace('/\D/', '', $x), explode(',', Setting::get('otp_allowed_prefixes', '96475,96477,96478,96479'))));
        foreach ($prefixes as $p) if (strncmp($d, $p, strlen($p)) === 0) return $d;
        return '';
    }

    public static function testMode(): bool { return Setting::on('otp_test_mode'); }
    public static function configured(): bool { return Setting::get('otpiq_api_key') !== '' || self::testMode(); }
    private static function hash(string $code, string $salt): string { return hash('sha256', "$salt:$code"); }

    /** Sends the code over OTPIQ. Throws on any failure. */
    public static function deliver(string $intl, string $code): void
    {
        if (self::testMode()) { error_log("[OTP test mode] $intl: $code"); return; }
        $key = Setting::get('otpiq_api_key');
        if ($key === '') throw new HttpException(503, 'otp_not_configured');
        $provider = in_array(Setting::get('otpiq_provider', 'auto'), self::PROVIDERS, true) ? Setting::get('otpiq_provider', 'auto') : 'auto';
        [$st, $body] = HttpClient::post(self::ENDPOINT, ['Authorization: Bearer ' . $key, 'Content-Type: application/json', 'Accept: application/json'],
            json_encode(['phoneNumber' => $intl, 'smsType' => 'verification', 'provider' => $provider, 'verificationCode' => $code]), 10);
        if ($st < 200 || $st >= 300) {
            error_log("OTPIQ $st: " . substr($body, 0, 300));
            throw new HttpException(502, 'otp_send_failed', ['provider_status' => $st]);
        }
    }

    /** @return array{resend_in:int, expires_in:int, dev_code?:string} */
    public static function send(string $phone, string $purpose, string $ip): array
    {
        if (!in_array($purpose, self::PURPOSES, true)) throw new HttpException(422, 'invalid_input', ['fields' => ['purpose']]);
        $intl = self::normalize($phone);
        if ($intl === '') throw new HttpException(422, 'phone_not_allowed');
        if (!self::configured()) throw new HttpException(503, 'otp_not_configured');
        $now = ms();
        Model::run('DELETE FROM otp_codes WHERE created_at < ?', [$now - 86400000]);
        $last = Model::one('SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1', [$phone]);
        if ($last && $now - $last['created_at'] < self::RESEND_MS) throw new HttpException(429, 'otp_wait', ['retry_in' => (int)ceil((self::RESEND_MS - ($now - $last['created_at'])) / 1000)]);
        $perPhone = (int)Model::val('SELECT COUNT(*) FROM otp_codes WHERE phone = ? AND created_at > ?', [$phone, $now - 3600000]);
        $perIp = (int)Model::val('SELECT COUNT(*) FROM otp_codes WHERE ip = ? AND created_at > ?', [$ip, $now - 3600000]);
        if ($perPhone >= 5 || $perIp >= 20) throw new HttpException(429, 'too_many_attempts');
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $salt = rand_hex(8);
        Model::run('UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0', [$phone, $purpose]);
        Model::run('INSERT INTO otp_codes(phone, purpose, code_hash, salt, ip, expires_at, created_at) VALUES(?,?,?,?,?,?,?)', [$phone, $purpose, self::hash($code, $salt), $salt, $ip, $now + self::TTL_MS, $now]);
        $id = Model::lastId();
        try { self::deliver($intl, $code); }
        catch (HttpException $e) { Model::run('DELETE FROM otp_codes WHERE id = ?', [$id]); throw $e; }
        $out = ['resend_in' => 60, 'expires_in' => 300];
        if (self::testMode()) $out['dev_code'] = $code;
        return $out;
    }

    /** Consumes the code on success; throws otp_expired / otp_invalid otherwise. */
    public static function verify(string $phone, string $purpose, $code): void
    {
        $row = Model::one('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1', [$phone, $purpose]);
        if (!$row || $row['expires_at'] < ms() || $row['attempts'] >= self::MAX_TRIES) throw new HttpException(422, 'otp_expired');
        if (!hash_equals($row['code_hash'], self::hash(preg_replace('/\D/', '', (string)($code ?? '')), $row['salt']))) {
            Model::run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
            throw new HttpException(422, 'otp_invalid', ['attempts_left' => max(0, self::MAX_TRIES - $row['attempts'] - 1)]);
        }
        Model::run('UPDATE otp_codes SET used = 1 WHERE id = ?', [$row['id']]);
    }

    /** Admin "Send test OTP": sends a real code to the given phone with the saved key/provider. */
    public static function test(string $phone): array
    {
        $intl = self::normalize($phone);
        if ($intl === '') throw new HttpException(422, 'phone_not_allowed');
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        self::deliver($intl, $code);
        return ['ok' => true, 'phone' => $intl, 'test_mode' => self::testMode()] + (self::testMode() ? ['dev_code' => $code] : []);
    }
}

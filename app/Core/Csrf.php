<?php
namespace App\Core;

/**
 * CSRF protection (double-submit): a random token lives in the readable cookie rp_csrf; the browser app copies it
 * into the X-CSRF-Token header on every POST/PUT/PATCH/DELETE. Other sites cannot read the cookie, so they cannot
 * send a matching header. Requests authenticated with an Authorization: Bearer token (no cookies) are not exposed.
 */
final class Csrf
{
    public const COOKIE = 'rp_csrf';

    public static function token(): string
    {
        $t = (string)($_COOKIE[self::COOKIE] ?? '');
        if (!preg_match('/^[a-f0-9]{48}$/', $t)) {
            $t = rand_hex(24);
            setcookie(self::COOKIE, $t, ['expires' => time() + 86400 * 30, 'path' => Url::base(), 'secure' => Url::isHttps(), 'httponly' => false, 'samesite' => 'Lax']);
            $_COOKIE[self::COOKIE] = $t;
        }
        return $t;
    }

    public static function verify(Request $req): void
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        if (!$req->viaCookie && $req->token) return; // bearer-token clients
        $cookie = (string)($_COOKIE[self::COOKIE] ?? '');
        $sent = $req->header('X-CSRF-Token');
        if ($cookie === '' || $sent === '' || !hash_equals($cookie, $sent)) throw new HttpException(403, 'csrf_failed');
    }
}

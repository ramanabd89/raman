<?php
namespace App\Core;

/** Sends JSON, HTML, redirects and files; adds the security headers to every response. */
final class Response
{
    public static function securityHeaders(): void
    {
        header_remove('X-Powered-By');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header('X-Frame-Options: DENY');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()');
        header("Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; manifest-src 'self'");
        if (Url::isHttps()) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }

    public static function json($data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    public static function html(string $html, int $status = 200, bool $noindex = false): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-cache');
        if ($noindex) header('X-Robots-Tag: noindex, nofollow');
        echo $html;
        exit;
    }

    public static function text(string $body, string $type = 'text/plain'): never
    {
        header("Content-Type: $type; charset=utf-8");
        echo $body;
        exit;
    }

    public static function redirect(string $to, int $status = 302): never
    {
        header('Location: ' . $to, true, $status);
        exit;
    }

    public static function download(string $file, string $name, string $type, bool $deleteAfter = false): never
    {
        header("Content-Type: $type");
        header('Content-Disposition: attachment; filename="' . str_replace('"', '', $name) . '"');
        header('Content-Length: ' . filesize($file));
        header('X-Robots-Tag: noindex, nofollow');
        readfile($file);
        if ($deleteAfter) @unlink($file);
        exit;
    }
}

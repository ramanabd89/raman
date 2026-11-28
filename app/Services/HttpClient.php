<?php
namespace App\Services;

/** Minimal cURL wrapper with short timeouts (a slow SMS/Telegram API must never block checkout for long). */
final class HttpClient
{
    /** @return array{0:int,1:string} [status, body] — status 0 = network error */
    public static function post(string $url, array $headers, string $body, int $timeout = 8): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => min(5, $timeout), CURLOPT_FOLLOWLOCATION => false]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        return [$res === false ? 0 : $code, $res === false ? $err : (string)$res];
    }
}

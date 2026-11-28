<?php
// Small global helpers used everywhere (views, models, controllers).

use App\Core\Lang;
use App\Core\Url;

/** Translate a key from lang/{ku,ar,en}.php, e.g. __('seo.home_title', ['store' => 'RamanPhone']). */
function __(string $key, array $params = [], ?string $lang = null): string { return Lang::get($key, $params, $lang); }
/** Escape for HTML text and attributes. */
function e($s): string { return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
/** Site URL for a path relative to the install folder: url('product/12') → https://shop.iq/sub/product/12 */
function url(string $path = ''): string { return Url::to($path); }
/** Path (no domain) for a path relative to the install folder: path('css/style.css') → /sub/css/style.css */
function path(string $p = ''): string { return Url::base() . ltrim($p, '/'); }

function toint($v, int $d = 0): int {
    if (is_int($v)) return $v;
    if (is_float($v)) return is_finite($v) ? (int)$v : $d;
    if (is_bool($v) || $v === null || is_array($v)) return $d;
    return preg_match('/^\s*([+-]?\d+)/', (string)$v, $m) ? (int)$m[1] : $d;
}
function num($v): float { return is_numeric($v) ? (float)$v : 0.0; }
function tostr($v, int $max = 500): string {
    if ($v === null || is_array($v)) return '';
    if (is_bool($v)) $v = $v ? 'true' : 'false';
    return mb_substr(trim((string)$v), 0, $max);
}
function parse_json($v, $d) { if ($v === null || $v === '') return $d; $x = json_decode((string)$v, true); return $x ?? $d; }
/** {} instead of [] when a JSON object is empty. */
function obj($a) { return is_array($a) && !$a ? new stdClass() : $a; }
function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }
function now_utc(): string { return gmdate('Y-m-d H:i:s'); }
function ms(): int { return (int)floor(microtime(true) * 1000); }
/** Iraqi dinar, whole numbers: 1250000 → "1,250,000" */
function iqd($n): string { return number_format((float)$n, 0, '.', ','); }
function norm_phone($p): string { return preg_replace('/[^\d+]/', '', tostr($p, 20)); }
function json_enc($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
/** URL slug from a product / category name (Latin letters and digits; Arabic/Kurdish names fall back to the id only). */
function slugify(?string $s): string {
    $s = strtolower(trim((string)$s));
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim(substr($s, 0, 80), '-');
}

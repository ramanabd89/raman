<?php
namespace App\Core;

/** Server-side translations from lang/ku.php, lang/ar.php, lang/en.php ("a.b" keys, {name} placeholders). */
final class Lang
{
    public const LANGS = ['ku', 'ar', 'en'];
    public const HREFLANG = ['ku' => 'ckb', 'ar' => 'ar', 'en' => 'en'];
    private static string $current = 'ku';
    private static array $cache = [];

    public static function set(string $lang): void { if (in_array($lang, self::LANGS, true)) self::$current = $lang; }
    public static function current(): string { return self::$current; }
    public static function dir(?string $lang = null): string { return ($lang ?? self::$current) === 'en' ? 'ltr' : 'rtl'; }

    public static function dict(string $lang): array
    {
        if (!isset(self::$cache[$lang])) {
            $f = ROOT . "/lang/$lang.php";
            self::$cache[$lang] = is_file($f) ? (require $f) : [];
        }
        return self::$cache[$lang];
    }

    public static function get(string $key, array $params = [], ?string $lang = null): string
    {
        $lang = in_array($lang, self::LANGS, true) ? $lang : self::$current;
        $s = self::dict($lang)[$key] ?? self::dict('en')[$key] ?? $key;
        foreach ($params as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
        return $s;
    }

    public static function has(string $key, ?string $lang = null): bool { return isset(self::dict($lang ?? self::$current)[$key]); }

    /** Language from ?lang=, the rp_lang cookie, Accept-Language, then the store default. */
    public static function detect(string $default = 'ku'): string
    {
        $q = (string)($_GET['lang'] ?? '');
        if (in_array($q, self::LANGS, true)) return $q;
        $c = (string)($_COOKIE['rp_lang'] ?? '');
        if (in_array($c, self::LANGS, true)) return $c;
        $al = strtolower((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
        if (preg_match('/\b(ckb|ku)\b/', $al)) return 'ku';
        if (preg_match('/\bar\b/', $al)) return 'ar';
        if (preg_match('/^en\b/', $al)) return 'en';
        return in_array($default, self::LANGS, true) ? $default : 'ku';
    }
}

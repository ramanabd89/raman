<?php
namespace App\Services;

/**
 * Multilingual product search: Kurdish (Sorani), Arabic and English spellings of the same thing
 * (ئایفۆن / ايفون / iphone, سامسونك / samsung, كفر / case …), whole-word matching and relevance ranking.
 */
final class SearchService
{
    // (same rules as the Node version: server/search.js).

    public static function normalize($text): string {
        $s = mb_strtolower((string)($text ?? ''), 'UTF-8');
        $s = preg_replace('/[\x{064B}-\x{0652}\x{0670}\x{0640}]/u', '', $s); // harakat + tatweel
        $s = strtr($s, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']);
        $s = strtr($s, ['أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ئ' => 'ا', 'ء' => 'ا', 'ؤ' => 'و',
            'ی' => 'ي', 'ى' => 'ي', 'ێ' => 'ي', 'ک' => 'ك', 'گ' => 'ك', 'ە' => 'ه', 'ة' => 'ه', 'ھ' => 'ه',
            'ۆ' => 'و', 'ۇ' => 'و', 'ۉ' => 'و', 'ڵ' => 'ل', 'ڕ' => 'ر', 'ڤ' => 'ف', 'چ' => 'ج', 'پ' => 'ب', 'ژ' => 'ز']);
        $s = preg_replace('/ا+/u', 'ا', $s);
        $s = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s);
        $s = preg_replace('/(\p{N})(\p{L})/u', '$1 $2', $s);
        $s = preg_replace('/(\p{L})(\p{N})/u', '$1 $2', $s);
        $s = trim($s);
        foreach ([['/promax/u', 'pro max'], ['/بروماكس/u', 'برو ماكس'], ['/برومكس/u', 'برو ماكس'], ['/proplus/u', 'pro plus']] as [$re, $to]) $s = preg_replace($re, $to, $s);
        return $s;
    }

    public static function groups(): array {
        static $ng = null;
        if ($ng !== null) return $ng;
        $groups = [
            ['iphone', 'ايفون', 'آيفون', 'ئایفۆن', 'اي فون', 'ايفوون'],
            ['apple', 'ابل', 'أبل', 'ئەپڵ', 'آبل'],
            ['samsung', 'سامسونج', 'سامسونگ', 'سامسۆنگ', 'سامسونك', 'سامسنج', 'سامسونق', 'galaxy', 'جالكسي', 'گالاکسی', 'كالكسي', 'كلكسي', 'جلاكسي'],
            ['xiaomi', 'شاومي', 'شاومی', 'شياومي', 'redmi', 'ريدمي', 'ڕێدمی', 'poco', 'بوكو'],
            ['honor', 'هونر', 'هونور', 'هۆنەر'],
            ['infinix', 'انفنكس', 'انفينكس', 'ئینفینیکس'],
            ['tecno', 'تكنو', 'تيكنو'],
            ['huawei', 'هواوي', 'هواوی'],
            ['airpods', 'ايربودز', 'ايربود', 'ئێرپۆد', 'ئێرپۆدس', 'earbuds', 'سماعات لاسلكية', 'buds', 'بودز'],
            ['charger', 'شاحن', 'شاحنة', 'شواحن', 'شەحن', 'شحن', 'adapter', 'راس شاحن'],
            ['cable', 'كيبل', 'كابل', 'وايەر', 'وایەر', 'واير', 'وايرات', 'سلك', 'type c', 'تايب سي', 'lightning', 'لايتنينغ'],
            ['case', 'cases', 'cover', 'covers', 'كفر', 'كفرات', 'كڤر', 'کەڤەر', 'غطاء', 'جراب', 'غڵاف', 'بەرگ'],
            ['glass', 'screen protector', 'protector', 'شاشة حماية', 'شاشات حماية', 'اسكرين', 'سكرين', 'شاشەی پاراستن', 'لزقة', 'tempered'],
            ['power bank', 'powerbank', 'باور بانك', 'پاوەر بانک', 'باوربانك', 'بطارية متنقلة', 'شاحن متنقل'],
            ['watch', 'smart watch', 'ساعة', 'ساعه', 'ساعة ذكية', 'کاتژمێر', 'واچ', 'واتش'],
            ['headphone', 'headphones', 'هێدفۆن', 'هيدفون', 'سماعة رأس', 'سماعة', 'سماعات'],
            ['phone', 'mobile', 'موبايل', 'مۆبایل', 'هاتف', 'جوال', 'تلفون'],
            ['holder', 'هولدر', 'هۆڵدەر', 'حامل', 'ستاند'],
            ['wireless', 'لاسلكي', 'بێوایەر', 'magsafe', 'ماك سيف', 'ماغ سيف'],
            ['pro', 'برو', 'پرۆ'],
            ['max', 'ماكس', 'ماکس'],
            ['plus', 'بلس', 'پلەس', 'پلس'],
            ['ultra', 'الترا', 'ئەلترا', 'التره', 'اولترا'],
            ['mini', 'ميني', 'مینی'],
            ['lite', 'لايت'],
        ];
        $ng = array_map(fn($g) => array_values(array_unique(array_filter(array_map([self::class, 'normalize'], $g)))), $groups);
        return $ng;
    }

    public static function starts(string $a, string $b): bool { return strncmp($a, $b, strlen($b)) === 0; }

    public static function expand(string $tok): array {
        $out = [$tok => true];
        $len = mb_strlen($tok);
        foreach (self::groups() as $g) {
            $hit = in_array($tok, $g, true);
            if (!$hit && $len >= 4) foreach ($g as $w) if (mb_strlen($w) >= 4 && (self::starts($w, $tok) || self::starts($tok, $w))) { $hit = true; break; }
            if ($hit) foreach ($g as $w) $out[$w] = true;
        }
        return array_map('strval', array_keys($out));
    }

    public static function wordPattern(string $w): string {
        $latin = (bool)preg_match('/^[a-z0-9 ]+$/', $w);
        $exact = preg_match('/^\d+$/', $w) || ($latin ? mb_strlen($w) <= 3 : mb_strlen($w) <= 2);
        return $exact ? "% $w %" : "% $w%";
    }

    public static function tokenize(string $query): array {
        $rest = ' ' . self::normalize($query) . ' ';
        $tokens = [];
        foreach (self::groups() as $g) foreach ($g as $w) {
            if (strpos($w, ' ') !== false && strpos($rest, " $w ") !== false) { $tokens[] = $w; $pos = strpos($rest, " $w "); $rest = substr_replace($rest, ' ', $pos, strlen(" $w ")); }
        }
        foreach (explode(' ', $rest) as $t) if ($t !== '') $tokens[] = $t;
        return array_slice($tokens, 0, 8);
    }

    /** Every word must match (AND); a word matches if any of its synonyms appears as a word (OR). */
    public static function clause(string $query, string $column = 'p.search_text'): ?array {
        $tokens = self::tokenize($query);
        if (!$tokens) return null;
        $parts = []; $params = [];
        foreach ($tokens as $t) {
            $words = self::expand($t);
            $parts[] = '(' . implode(' OR ', array_fill(0, count($words), "$column LIKE ?")) . ')';
            foreach ($words as $w) $params[] = self::wordPattern($w);
        }
        return ['sql' => implode(' AND ', $parts), 'params' => $params, 'tokens' => $tokens];
    }

    public static function hasWord(string $text, string $w): bool { return strpos($text, str_replace('%', '', self::wordPattern($w))) !== false; }

    public static function relevance(array $p, array $tokens): int {
        $name = ' ' . self::normalize(implode(' ', array_filter([$p['name_ku'] ?? '', $p['name_ar'] ?? '', $p['name_en'] ?? '']))) . ' ';
        $score = 0;
        foreach ($tokens as $t) foreach (self::expand($t) as $w) if (self::hasWord($name, $w)) { $score += 2; break; }
        $asked = [];
        foreach ($tokens as $t) foreach (self::expand($t) as $w) $asked[$w] = true;
        $groups = self::groups();
        foreach (['case', 'glass', 'charger', 'cable', 'power bank', 'holder', 'headphone', 'airpods', 'watch'] as $k) {
            foreach ($groups as $g) if (in_array($k, $g, true)) {
                $askedIt = false; foreach ($g as $w) if (isset($asked[$w])) { $askedIt = true; break; }
                $inName = false; foreach ($g as $w) if (self::hasWord($name, $w)) { $inName = true; break; }
                if (!$askedIt && $inName) $score -= 3;
                break;
            }
        }
        return $score;
    }
}

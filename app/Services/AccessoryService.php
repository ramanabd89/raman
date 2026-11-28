<?php
namespace App\Services;

use App\Models\Product;

/**
 * "Find accessories for my phone": phone models customers can pick (from phones on sale, accessory model tags,
 * repair and trade-in price lists) and the in-stock accessories that fit one model.
 * Fit order: tagged for exactly this model → name names this model → universal (charger, cable, power bank, audio…).
 * Never shown: cases/glass/lenses for another model, Lightning for USB-C phones, USB-C-only cables for Lightning iPhones,
 * MagSafe for phones without it.
 */
final class AccessoryService
{
    public const TYPES = ['case', 'glass', 'lens', 'charger', 'cable', 'powerbank', 'magsafe', 'audio', 'other'];
    /** types that only make sense for one exact model */
    private const MODEL_SPECIFIC = ['case', 'glass', 'lens'];
    /** detection order matters: "MagSafe power bank" is a power bank first */
    private const WORDS = [
        'powerbank' => ['power bank', 'powerbank', 'باور بانك', 'پاوەر بانک', 'باوربانك', 'بطارية متنقلة', 'شاحن متنقل'],
        'magsafe' => ['magsafe', 'ماك سيف', 'ماغ سيف', 'magnetic wireless'],
        'lens' => ['lens', 'camera protector', 'عدسة', 'عدسات', 'لێنز', 'حماية كاميرا', 'پاراستنی کامێرا'],
        'glass' => ['glass', 'screen protector', 'protector', 'شاشة حماية', 'شاشات حماية', 'سكرين', 'اسكرين', 'شاشەی پاراستن', 'لزقة', 'tempered'],
        'case' => ['case', 'cover', 'كفر', 'كڤر', 'کەڤەر', 'غطاء', 'جراب', 'غڵاف', 'بەرگ'],
        'cable' => ['cable', 'كيبل', 'كابل', 'وايەر', 'وایەر', 'واير', 'سلك'],
        'charger' => ['charger', 'adapter', 'شاحن', 'شاحنة', 'شەحن', 'راس شاحن', 'wireless charger'],
        'watch' => ['watch', 'smart watch', 'ساعة', 'ساعه', 'کاتژمێر', 'واچ', 'واتش', 'band'],
        'audio' => ['airpods', 'earbuds', 'buds', 'headphone', 'headphones', 'سماعة', 'سماعات', 'هێدفۆن', 'ئێرپۆد', 'ايربودز'],
    ];

    public static function typeOf(array $p): string
    {
        $n = ' ' . SearchService::normalize(implode(' ', array_filter([$p['name_en'] ?? '', $p['name_ar'] ?? '', $p['name_ku'] ?? '']))) . ' ';
        foreach (self::WORDS as $type => $words) foreach ($words as $w) if (str_contains($n, ' ' . SearchService::normalize($w))) return $type;
        return 'other';
    }

    // ---------------- models ----------------
    /** @return array{brands: array<int, array{brand: string, models: array<int, array{label: string, key: string}>}>} */
    public static function models(): array
    {
        return CacheService::remember('catalog', 'accessories:models', 900, function () {
            $found = []; // key → [brand, label, weight]
            $add = function (string $brand, string $label, int $w) use (&$found) {
                $label = trim(preg_replace('/\s+/u', ' ', $label));
                if ($label === '' || mb_strlen($label) > 80) return;
                $sig = Product::modelSig($brand . ' ' . $label) ?: Product::modelSig($label);
                $brand = $brand !== '' ? $brand : ($sig ? Product::FAMILY_BRAND[$sig['family']] : '');
                if ($brand === '') return;
                $key = Product::modelKey($brand, $label);
                if (!isset($found[$key]) || $found[$key][2] < $w) $found[$key] = [self::brandName($brand), $label, $w];
            };
            foreach (Product::all("SELECT name_en, name_ku, brand FROM products WHERE active = 1 AND JSON_EXTRACT(attrs, '$.os') IS NOT NULL") as $p) $add((string)$p['brand'], Product::phoneModelName($p), 3);
            foreach (Product::all('SELECT DISTINCT c.label FROM product_compatibility c JOIN products p ON p.id = c.product_id WHERE p.active = 1') as $r) { [$b, $m] = Product::splitBrand($r['label']); $add($b, $m, 2); }
            foreach (Product::all('SELECT DISTINCT brand, model FROM repair_prices WHERE active = 1') as $r) $add((string)$r['brand'], (string)$r['model'], 1);
            foreach (Product::all('SELECT DISTINCT brand, model FROM tradein_models WHERE active = 1') as $r) $add((string)$r['brand'], (string)$r['model'], 1);
            $brands = [];
            foreach ($found as $key => [$brand, $label]) $brands[$brand][] = ['label' => $label, 'key' => $key];
            uksort($brands, fn($a, $b) => (count($brands[$b]) <=> count($brands[$a])) ?: strcmp($a, $b));
            $out = [];
            foreach ($brands as $brand => $models) {
                usort($models, fn($x, $y) => strnatcasecmp($y['label'], $x['label'])); // newest numbers first
                $out[] = ['brand' => $brand, 'models' => $models];
            }
            return ['brands' => $out];
        });
    }

    private static function brandName(string $b): string
    {
        $l = mb_strtolower(trim($b));
        foreach (Product::FAMILY_BRAND as $brand) if (mb_strtolower($brand) === $l) return $brand;
        return mb_convert_case(trim($b), MB_CASE_TITLE, 'UTF-8');
    }

    // ---------------- accessories for one model ----------------
    public static function byModel(string $brand, string $model, string $type = '', int $categoryId = 0): array
    {
        $brand = tostr($brand, 60); $model = tostr($model, 80);
        if ($model === '') return ['model' => null, 'types' => [], 'items' => []];
        $key = Product::modelKey($brand, $model);
        return CacheService::remember('catalog', "accessories:by:$key:$type:$categoryId", 300, function () use ($brand, $model, $key, $type, $categoryId) {
            $sig = Product::modelSig("$brand $model") ?: Product::modelSig($model);
            $phoneText = $sig ? "{$sig['family']} {$sig['model']} " . str_replace('+', ' ', $sig['mods']) : "$brand $model";
            $phone = ['name_en' => $phoneText, 'name_ar' => '', 'name_ku' => ''];
            $lightning = $sig && $sig['family'] === 'iphone' && (int)$sig['model'] >= 5 && (int)$sig['model'] <= 14;
            $magsafe = $sig && $sig['family'] === 'iphone' && (int)$sig['model'] >= 12;

            $tagged = [];
            foreach (Product::all('SELECT product_id, model_key FROM product_compatibility') as $r) $tagged[$r['product_id']][] = $r['model_key'];

            $sql = 'SELECT p.*, ' . Product::VARIANT_COUNT . " FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.is_used = 0 AND JSON_EXTRACT(p.attrs, '$.os') IS NULL";
            $params = [];
            if ($categoryId > 0) { $sql .= ' AND (p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?))'; array_push($params, $categoryId, $categoryId); }
            $items = []; $counts = array_fill_keys(self::TYPES, 0);
            foreach (Product::all($sql . ' ORDER BY p.sold DESC, p.id DESC LIMIT 600', $params) as $p) {
                $t = self::typeOf($p);
                $names = SearchService::normalize(implode(' ', [$p['name_en'], $p['name_ar'], $p['name_ku']]));
                $hasLightning = (bool)preg_match('/lightning|لايتنينغ|لايتننغ/u', $names);
                $fit = null;
                if (isset($tagged[$p['id']])) {
                    if (!in_array($key, $tagged[$p['id']], true)) continue;        // tagged for other models only
                    $fit = 'exact';
                } else {
                    if (!Product::fits($phone, $p)) continue;                        // names another model / wrong connector
                    $accSig = Product::modelSig(implode(' ', [$p['name_en'], $p['name_ar'], $p['name_ku']]));
                    if ($accSig) $fit = 'model';
                    elseif (in_array($t, self::MODEL_SPECIFIC, true)) continue;     // a case "for phones" fits nothing for sure
                    else $fit = 'universal';
                }
                if ($t === 'magsafe' && !$magsafe && $fit !== 'exact') continue;
                if ($t === 'cable' && $fit !== 'exact') {
                    if ($hasLightning && !$lightning) continue;
                    if ($lightning && !$hasLightning) continue;
                }
                if ($t === 'watch' && $fit !== 'exact') continue;                 // a watch is its own device, not a phone accessory
                if ($t === 'watch') $t = 'other';
                $counts[$t]++;
                if ($type !== '' && $t !== $type) continue;
                $items[] = ['p' => $p, 'fit' => $fit, 'type' => $t];
            }
            $rank = ['exact' => 0, 'model' => 1, 'universal' => 2];
            usort($items, fn($a, $b) => ($rank[$a['fit']] <=> $rank[$b['fit']]) ?: ($b['p']['sold'] <=> $a['p']['sold']));
            $out = array_map(fn($x) => Product::slim($x['p']) + ['fit' => $x['fit'], 'acc_type' => $x['type']], array_slice($items, 0, 60));
            $types = [];
            foreach ($counts as $t => $n) if ($n) $types[] = ['type' => $t, 'n' => $n];
            return ['model' => ['brand' => $brand !== '' ? self::brandName($brand) : ($sig ? Product::FAMILY_BRAND[$sig['family']] : ''), 'label' => $model, 'key' => $key], 'types' => $types, 'items' => $out];
        });
    }
}

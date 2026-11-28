<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;
use App\Services\SearchService;

/** Products: listing/search/filters, public output, accessory compatibility, bundle deal, admin save. */
final class Product extends Model
{
    public const VARIANT_COUNT = '(SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count';
    public const FIELDS = ['category_id', 'name_ku', 'name_ar', 'name_en', 'desc_ku', 'desc_ar', 'desc_en', 'brand', 'price', 'old_price', 'stock', 'image', 'images',
        'featured', 'trending', 'flash_sale', 'active', 'usd_priced', 'price_usd', 'old_price_usd', 'cost_price', 'specs', 'bundle_ids', 'attrs', 'video_url', 'slug'];

    // ---------------- output ----------------
    public static function out(?array $p, bool $admin = false): ?array
    {
        if (!$p) return $p;
        $p['images'] = parse_json($p['images'] ?? '[]', []);
        $p['specs'] = parse_json($p['specs'] ?? '[]', []);
        $p['bundle_ids'] = parse_json($p['bundle_ids'] ?? '[]', []);
        $p['attrs'] = obj(parse_json($p['attrs'] ?? '{}', []));
        foreach (['featured', 'trending', 'flash_sale', 'active'] as $k) $p[$k] = (bool)($p[$k] ?? 0);
        $p['has_variants'] = ($p['variant_count'] ?? 0) > 0;
        if (!$p['slug']) $p['slug'] = self::slugFor($p);
        if (!$admin) unset($p['cost_price'], $p['search_text'], $p['bundle_ids'], $p['usd_priced'], $p['price_usd'], $p['old_price_usd']);
        return $p;
    }
    public static function attrs(array $p): array { $a = $p['attrs'] ?? '{}'; return is_array($a) ? $a : (is_object($a) ? (array)$a : parse_json($a, [])); }
    public static function isPhone(array $p): bool { return !empty(self::attrs($p)['os']); }
    public static function slugFor(array $p): string { return slugify($p['name_en'] ?? '') ?: slugify($p['brand'] ?? ''); }
    /** "12-iphone-15-pro-max" (path part of /product/…) */
    public static function urlKey(array $p): string { $s = $p['slug'] ?: self::slugFor($p); return $p['id'] . ($s ? "-$s" : ''); }

    public static function find(int $id, bool $activeOnly = true): ?array
    {
        return self::one('SELECT p.*, ' . self::VARIANT_COUNT . ' FROM products p WHERE p.id = ?' . ($activeOnly ? ' AND p.active = 1' : ''), [$id]);
    }

    // ---------------- listing ----------------
    /** WHERE parts shared by the list and the filter facets. */
    private static function where(array $q, bool $admin, bool $withFilters): array
    {
        $w = []; $p = []; $tokens = null;
        if (!$admin) $w[] = 'p.active = 1';
        if (!empty($q['category'])) { $c = toint($q['category']); $w[] = '(p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?))'; array_push($p, $c, $c); }
        if (!empty($q['q'])) {
            $c = SearchService::clause(tostr($q['q'], 100));
            if ($c) { $w[] = "({$c['sql']})"; array_push($p, ...$c['params']); $tokens = $c['tokens']; }
        }
        if (!empty($q['flash'])) $w[] = 'p.flash_sale = 1';
        if (!empty($q['featured'])) $w[] = 'p.featured = 1';
        if (($q['phones'] ?? '') === '1') $w[] = "JSON_EXTRACT(p.attrs, '$.os') IS NOT NULL";
        if (!empty($q['ids'])) {
            $ids = array_slice(array_values(array_filter(array_map('toint', explode(',', (string)$q['ids'])), fn($x) => $x > 0)), 0, 60);
            $w[] = $ids ? 'p.id IN (' . self::marks($ids) . ')' : '0'; array_push($p, ...$ids);
        }
        if ($withFilters) {
            if (!empty($q['brand'])) {
                $b = array_slice(array_values(array_filter(array_map(fn($x) => mb_strtolower(tostr($x, 60)), explode(',', (string)$q['brand'])))), 0, 20);
                if ($b) { $w[] = 'LOWER(p.brand) IN (' . self::marks($b) . ')'; array_push($p, ...$b); }
            }
            if (toint($q['min_price'] ?? 0) > 0) { $w[] = 'p.price >= ?'; $p[] = toint($q['min_price']); }
            if (toint($q['max_price'] ?? 0) > 0) { $w[] = 'p.price <= ?'; $p[] = toint($q['max_price']); }
            if (toint($q['storage'] ?? 0) > 0) { $w[] = "CAST(JSON_EXTRACT(p.attrs, '$.storage') AS DECIMAL(10,2)) = ?"; $p[] = toint($q['storage']); }
            if (toint($q['ram'] ?? 0) > 0) { $w[] = "CAST(JSON_EXTRACT(p.attrs, '$.ram') AS DECIMAL(10,2)) = ?"; $p[] = toint($q['ram']); }
            if (($q['in_stock'] ?? '') === '1') $w[] = 'p.stock > 0';
        }
        return [$w ? 'WHERE ' . implode(' AND ', $w) : '', $p, $tokens];
    }

    public static function list(array $q, bool $admin = false): array
    {
        [$where, $params, $tokens] = self::where($q, $admin, true);
        $sorts = ['foryou' => 'p.featured DESC, p.trending DESC, (p.stock > 0) DESC, p.id DESC', 'popular' => 'p.sold DESC', 'cheap' => 'p.price ASC',
            'expensive' => 'p.price DESC', 'newest' => 'p.id DESC', 'rating' => 'p.rating_avg DESC, p.rating_count DESC'];
        $order = $sorts[$q['sort'] ?? ''] ?? $sorts['foryou'];
        $limit = min(max(toint($q['limit'] ?? 40, 40), 1), 200); $offset = max(toint($q['offset'] ?? 0), 0);
        $rows = self::all('SELECT p.*, ' . self::VARIANT_COUNT . " FROM products p $where ORDER BY $order LIMIT $limit OFFSET $offset", $params);
        if ($tokens && (empty($q['sort']) || $q['sort'] === 'foryou')) {
            foreach ($rows as $i => &$r) { $r['_rel'] = SearchService::relevance($r, $tokens); $r['_i'] = $i; } unset($r);
            usort($rows, fn($a, $b) => ($b['_rel'] <=> $a['_rel']) ?: ($a['_i'] <=> $b['_i']));
            foreach ($rows as &$r) unset($r['_rel'], $r['_i']); unset($r);
        }
        if (!empty($q['ids'])) { $order = array_map('toint', explode(',', (string)$q['ids'])); usort($rows, fn($a, $b) => array_search($a['id'], $order) <=> array_search($b['id'], $order)); }
        return array_map(fn($p) => self::out($p, $admin), $rows);
    }

    /** Filter options computed in SQL over ALL matching products (category / search), not a sample. */
    public static function facets(array $q): array
    {
        [$where, $params] = self::where(['category' => $q['category'] ?? null, 'q' => $q['q'] ?? null], false, false);
        $brands = self::all("SELECT TRIM(p.brand) v, COUNT(*) n FROM products p $where" . ($where ? ' AND' : ' WHERE') . " p.brand IS NOT NULL AND TRIM(p.brand) != '' GROUP BY TRIM(p.brand) ORDER BY n DESC, v", $params);
        $attr = function (string $k) use ($where, $params) {
            $rows = self::all("SELECT CAST(JSON_EXTRACT(p.attrs, '$.$k') AS DECIMAL(10,2)) v, COUNT(*) n FROM products p $where" . ($where ? ' AND' : ' WHERE')
                . " JSON_EXTRACT(p.attrs, '$.$k') IS NOT NULL AND CAST(JSON_EXTRACT(p.attrs, '$.$k') AS DECIMAL(10,2)) > 0 GROUP BY v ORDER BY v", $params);
            return array_map(fn($r) => ['v' => (string)(int)$r['v'], 'n' => (int)$r['n']], $rows);
        };
        $mm = self::one("SELECT COALESCE(MIN(p.price), 0) mn, COALESCE(MAX(p.price), 0) mx, COUNT(*) total FROM products p $where", $params);
        return ['brands' => array_map(fn($r) => ['v' => (string)$r['v'], 'n' => (int)$r['n']], $brands), 'storages' => $attr('storage'), 'rams' => $attr('ram'),
            'min' => (int)$mm['mn'], 'max' => (int)$mm['mx'], 'total' => (int)$mm['total']];
    }

    public static function related(array $p): array
    {
        if (!$p['category_id']) return [];
        return array_map([self::class, 'out'], self::all('SELECT p.*, ' . self::VARIANT_COUNT . ' FROM products p WHERE p.active = 1 AND p.category_id = ? AND p.id != ? ORDER BY p.sold DESC LIMIT 8', [$p['category_id'], $p['id']]));
    }

    // ---------------- variants / tags ----------------
    public static function variants(int $pid): array { return self::all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort, id', [$pid]); }
    public static function publicVariant(array $v): array { unset($v['cost_price'], $v['price_usd'], $v['old_price_usd']); return $v; }
    public static function tags(int $pid): array { return self::all('SELECT t.id, t.name_ku, t.name_ar, t.name_en, t.color FROM tags t JOIN product_tags pt ON pt.tag_id = t.id WHERE pt.product_id = ? ORDER BY t.id', [$pid]); }
    public static function attachVariants(array $list): array
    {
        $ids = array_values(array_map(fn($p) => $p['id'], array_filter($list, fn($p) => !empty($p['has_variants']))));
        if (!$ids) return $list;
        $rows = self::all('SELECT * FROM product_variants WHERE product_id IN (' . self::marks($ids) . ') ORDER BY sort, id', $ids);
        foreach ($list as &$p) if (!empty($p['has_variants'])) $p['variants'] = array_values(array_filter($rows, fn($v) => $v['product_id'] === $p['id']));
        return $list;
    }
    /** products.price/stock = cheapest variant / total variant stock, so sorting and listing stay simple */
    public static function syncFromVariants(int $pid): void
    {
        $vs = self::variants($pid);
        if (!$vs) return;
        $c = $vs[0]; foreach ($vs as $v) if ($v['price'] < $c['price']) $c = $v;
        self::run('UPDATE products SET price = ?, old_price = ?, stock = ? WHERE id = ?', [$c['price'], $c['old_price'], array_sum(array_column($vs, 'stock')), $pid]);
    }

    // ---------------- search index + slugs ----------------
    public static function index(int $id): void
    {
        $p = self::one('SELECT p.name_ku, p.name_ar, p.name_en, p.brand, c.name_ku ck, c.name_ar ca, c.name_en ce FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [$id]);
        if (!$p) return;
        $labels = array_column(self::all('SELECT label FROM product_variants WHERE product_id = ?', [$id]), 'label');
        $slug = slugify($p['name_en'] ?? '') ?: slugify($p['brand'] ?? '');
        self::run('UPDATE products SET search_text = ?, slug = ? WHERE id = ?', [' ' . SearchService::normalize(implode(' ', array_filter(array_merge(array_values($p), $labels)))) . ' ', $slug ?: null, $id]);
    }
    public static function rebuildIndex(): void
    {
        foreach (self::all('SELECT id FROM products') as $r) self::index((int)$r['id']);
        foreach (self::all('SELECT id, name_en FROM categories') as $c) self::run('UPDATE categories SET slug = ? WHERE id = ?', [slugify($c['name_en']) ?: null, $c['id']]);
    }

    // ---------------- USD helper for the owner (selling prices are always stored and shown in IQD) ----------------
    public static function toIqd($usd): ?int
    {
        $rate = num(Setting::get('usd_rate')); $step = max(1, Setting::int('usd_round', 250));
        return $usd ? (int)(round(($usd * $rate) / $step) * $step) : null;
    }
    public static function repriceUsd(): int
    {
        if (!(num(Setting::get('usd_rate')) > 0)) return 0;
        $ps = self::all('SELECT id, price_usd, old_price_usd FROM products WHERE usd_priced = 1');
        foreach ($ps as $p) {
            self::run('UPDATE products SET price = ?, old_price = ? WHERE id = ?', [self::toIqd($p['price_usd']) ?: 0, self::toIqd($p['old_price_usd']), $p['id']]);
            foreach (self::all('SELECT id, price_usd, old_price_usd FROM product_variants WHERE product_id = ?', [$p['id']]) as $v)
                self::run('UPDATE product_variants SET price = ?, old_price = ? WHERE id = ?', [self::toIqd($v['price_usd']) ?: 0, self::toIqd($v['old_price_usd']), $v['id']]);
            self::syncFromVariants((int)$p['id']);
        }
        return count($ps);
    }

    // ---------------- accessory compatibility ----------------
    private const FAMILIES = ['iphone', 'galaxy', 'redmi', 'poco', 'pixel', 'honor', 'infinix', 'tecno', 'huawei'];
    private const MODIFIERS = ['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'edge'];
    /** family + model number + modifiers from a name: "iPhone 16 Pro Max" → iphone / 16 / max+pro */
    public static function modelSig(string $text): ?array
    {
        $t = ' ' . SearchService::normalize($text) . ' ';
        $t = str_replace([' برو ', ' ماكس ', ' ايفون '], [' pro ', ' max ', ' iphone '], $t);
        $t = preg_replace('/ (جالكسي|كالاكسي|كالكسي) /u', ' galaxy ', $t);
        $w = array_values(array_filter(explode(' ', $t), fn($x) => $x !== ''));
        $fi = -1; foreach ($w as $i => $x) if (in_array($x, self::FAMILIES, true)) { $fi = $i; break; }
        if ($fi < 0) return null;
        $rest = array_slice($w, $fi + 1, 5);
        $ni = -1; foreach ($rest as $i => $x) if (preg_match('/^\d{1,3}$/', $x)) { $ni = $i; break; }
        $series = $ni > 0 && preg_match('/^[a-z]$/', $rest[$ni - 1]) ? $rest[$ni - 1] : '';
        $mods = array_values(array_filter(array_slice($rest, $ni >= 0 ? $ni + 1 : 0), fn($x) => in_array($x, self::MODIFIERS, true)));
        sort($mods);
        return ['family' => $w[$fi], 'model' => $series . ($ni >= 0 ? $rest[$ni] : ''), 'mods' => implode('+', $mods)];
    }
    private static function names(array $x): string { return implode(' ', array_filter([$x['name_en'] ?? '', $x['name_ar'] ?? '', $x['name_ku'] ?? ''])); }
    /** No iPhone case on a Galaxy, no Lightning cable on a USB-C iPhone. */
    public static function fits(array $phone, array $acc): bool
    {
        $ps = self::modelSig(self::names($phone));
        if (!$ps) return true;
        $as = self::modelSig(self::names($acc));
        if ($as && ($as['family'] !== $ps['family'] || ($as['model'] !== '' && $as['model'] !== $ps['model']) || $as['mods'] !== $ps['mods'])) return false;
        if (preg_match('/lightning|لايتنينغ|لايتننغ/iu', self::names($acc)) && !($ps['family'] === 'iphone' && (int)$ps['model'] > 0 && (int)$ps['model'] <= 14)) return false;
        return true;
    }

    /** Bundle deal: fitting accessories bought with a phone get bundle_discount_percent off (one per phone). */
    public static function bundleDiscount(array $lines): int
    {
        $pct = min(max(num(Setting::get('bundle_discount_percent')), 0), 50);
        if (!$pct) return 0;
        $phones = array_values(array_filter($lines, fn($l) => self::isPhone($l['p'])));
        $n = array_sum(array_column($phones, 'qty'));
        if (!$n) return 0;
        $off = 0;
        foreach ($lines as $l) {
            if (self::isPhone($l['p'])) continue;
            foreach ($phones as $ph) if (self::fits($ph['p'], $l['p'])) { $off += (int)floor(($l['price'] * min($l['qty'], $n) * $pct) / 100); break; }
        }
        return $off;
    }

    /** "Frequently bought together": the admin's picks, else co-purchases, else popular accessories — all fitting the phone. */
    public static function boughtTogether(array $p): array
    {
        $isPhone = self::isPhone($p);
        $fits = fn($x) => !$isPhone || self::fits($p, $x);
        $pick = fn(array $ids) => $ids ? self::all('SELECT p.*, ' . self::VARIANT_COUNT . ' FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.id IN (' . self::marks($ids) . ')', $ids) : [];
        $has = fn($list, $x) => in_array($x['id'], array_column($list, 'id'), true);
        $list = array_values(array_filter($pick(array_slice(array_values(array_filter(array_map('toint', parse_json($p['bundle_ids'] ?? '[]', [])))), 0, 4)), $fits));
        if (count($list) < 3) {
            $co = array_column(self::all('SELECT oi2.product_id id, COUNT(*) n FROM order_items oi1 JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id != oi1.product_id WHERE oi1.product_id = ? GROUP BY oi2.product_id ORDER BY n DESC LIMIT 6', [$p['id']]), 'id');
            foreach ($pick(array_values(array_filter($co))) as $x) if ($fits($x) && !$has($list, $x)) $list[] = $x;
        }
        if (count($list) < 3) {
            $more = self::all('SELECT p.*, ' . self::VARIANT_COUNT . ' FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.id != ? AND p.price < ?
                AND (p.category_id IS NULL OR p.category_id NOT IN (SELECT id FROM categories WHERE id = ? OR parent_id <=> (SELECT parent_id FROM categories WHERE id = ?)))
                ORDER BY p.sold DESC LIMIT 30', [$p['id'], max($p['price'] * 0.5, 50000), $p['category_id'] ?? 0, $p['category_id'] ?? 0]);
            foreach ($more as $x) if ($fits($x) && !($isPhone && self::isPhone($x)) && !$has($list, $x)) $list[] = $x;
        }
        $list = array_values(array_filter($list, fn($x) => $x['id'] !== $p['id']));
        return array_map([self::class, 'out'], array_slice($list, 0, 4));
    }

    /** Real numbers only: people viewing in the last 15 minutes, units sold in the last 30 days. */
    public static function proof(int $id): array
    {
        return ['viewers' => (int)self::val('SELECT COUNT(DISTINCT visitor) FROM page_views WHERE product_id = ? AND created_at > ?', [$id, ms() - 900000]),
            'sold30' => (int)self::val("SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status != 'cancelled' AND o.created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY", [$id])];
    }

    // ---------------- admin save ----------------
    private static function cleanAttrs($a): array
    {
        if (!is_array($a) || !in_array($a['os'] ?? null, ['ios', 'android'], true)) return [];
        $n = fn($x, $max) => max(0, min(num($x), $max));
        $o = ['os' => $a['os'], 'tier' => in_array($a['tier'] ?? '', ['flagship', 'upper', 'mid', 'entry'], true) ? $a['tier'] : 'mid',
            'ram' => $n($a['ram'] ?? 0, 32), 'storage' => $n($a['storage'] ?? 0, 2048), 'battery' => $n($a['battery'] ?? 0, 10000), 'camera' => $n($a['camera'] ?? 0, 300),
            'screen' => $n($a['screen'] ?? 0, 10), 'charging' => $n($a['charging'] ?? 0, 300), 'g5' => !empty($a['g5'])];
        foreach (['ram', 'storage', 'battery', 'camera', 'screen', 'charging'] as $k) if (floor($o[$k]) == $o[$k]) $o[$k] = (int)$o[$k];
        return $o;
    }

    public static function values(array $b): array
    {
        $off = fn($x) => $x === false || $x === 0 || $x === '0';
        $v = [
            'category_id' => !empty($b['category_id']) ? toint($b['category_id']) : null,
            'name_ku' => tostr($b['name_ku'] ?? '', 200), 'name_ar' => tostr($b['name_ar'] ?? '', 200), 'name_en' => tostr($b['name_en'] ?? '', 200),
            'desc_ku' => tostr($b['desc_ku'] ?? '', 5000), 'desc_ar' => tostr($b['desc_ar'] ?? '', 5000), 'desc_en' => tostr($b['desc_en'] ?? '', 5000),
            'brand' => tostr($b['brand'] ?? '', 80),
            'price' => max(0, toint($b['price'] ?? 0)), 'old_price' => !empty($b['old_price']) ? max(0, toint($b['old_price'])) : null,
            'stock' => max(0, toint($b['stock'] ?? 0)), 'image' => tostr($b['image'] ?? '', 500),
            'images' => json_enc(array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 500), is_array($b['images'] ?? null) ? $b['images'] : []))), 0, 10)),
            'featured' => !empty($b['featured']) ? 1 : 0, 'trending' => !empty($b['trending']) ? 1 : 0, 'flash_sale' => !empty($b['flash_sale']) ? 1 : 0,
            'active' => array_key_exists('active', $b) && $off($b['active']) ? 0 : 1,
            'cost_price' => isset($b['cost_price']) && $b['cost_price'] !== '' ? max(0, toint($b['cost_price'])) : null,
            'specs' => json_enc(array_values(array_filter(array_map(fn($x) => ['k' => tostr($x['k'] ?? '', 60), 'v' => tostr($x['v'] ?? '', 200)], array_slice(is_array($b['specs'] ?? null) ? $b['specs'] : [], 0, 30)), fn($x) => $x['k'] !== '' && $x['v'] !== ''))),
            'bundle_ids' => json_enc(array_slice(array_values(array_filter(array_map('toint', is_array($b['bundle_ids'] ?? null) ? $b['bundle_ids'] : []), fn($x) => $x > 0)), 0, 4)),
            'attrs' => json_enc(obj(self::cleanAttrs($b['attrs'] ?? null))),
            'video_url' => preg_match('#^(https://[^\s"\'<>]+|/uploads/[\w.-]+)$#', tostr($b['video_url'] ?? '', 500)) ? tostr($b['video_url'], 500) : null,
        ];
        $v['slug'] = slugify($v['name_en']) ?: (slugify($v['brand']) ?: null);
        $v['tag_ids'] = array_slice(array_values(array_filter(array_map('toint', is_array($b['tag_ids'] ?? null) ? $b['tag_ids'] : []), fn($x) => $x > 0)), 0, 10);
        $usd = fn($x) => max(0, round(num($x) * 100) / 100);
        $v['usd_priced'] = !empty($b['usd_priced']) ? 1 : 0;
        if ($v['usd_priced'] && !(num(Setting::get('usd_rate')) > 0)) throw new HttpException(422, 'usd_rate_missing');
        if ($v['usd_priced']) {
            $v['price_usd'] = $usd($b['price'] ?? 0) ?: null; $v['old_price_usd'] = $usd($b['old_price'] ?? 0) ?: null;
            $v['price'] = self::toIqd($v['price_usd']) ?: 0; $v['old_price'] = self::toIqd($v['old_price_usd']);
        } else { $v['price_usd'] = null; $v['old_price_usd'] = null; }
        $v['variants'] = [];
        foreach (array_slice(is_array($b['variants'] ?? null) ? $b['variants'] : [], 0, 30) as $i => $x) {
            $pu = $v['usd_priced'] ? ($usd($x['price'] ?? 0) ?: null) : null;
            $opu = $v['usd_priced'] ? ($usd($x['old_price'] ?? 0) ?: null) : null;
            $row = ['id' => !empty($x['id']) ? toint($x['id']) : null, 'label' => tostr($x['label'] ?? '', 80), 'sku' => tostr($x['sku'] ?? '', 60) ?: null,
                'price' => $v['usd_priced'] ? (self::toIqd($pu) ?: 0) : max(0, toint($x['price'] ?? 0)),
                'old_price' => $v['usd_priced'] ? self::toIqd($opu) : (!empty($x['old_price']) ? max(0, toint($x['old_price'])) : null),
                'price_usd' => $pu, 'old_price_usd' => $opu, 'stock' => max(0, toint($x['stock'] ?? 0)), 'sort' => $i,
                'cost_price' => isset($x['cost_price']) && $x['cost_price'] !== '' ? max(0, toint($x['cost_price'])) : null];
            if ($row['label'] !== '' && $row['price']) $v['variants'][] = $row;
        }
        $all = [$v['price_usd'], $v['old_price_usd']]; foreach ($v['variants'] as $x) array_push($all, $x['price_usd'], $x['old_price_usd']);
        if ($v['usd_priced'] && max(array_map(fn($x) => (float)($x ?? 0), $all)) > 50000) throw new HttpException(422, 'usd_price_too_high');
        if ($v['variants']) { $v['price'] = min(array_column($v['variants'], 'price')); $v['stock'] = array_sum(array_column($v['variants'], 'stock')); }
        if ($v['name_ku'] === '' || !$v['price']) throw new HttpException(422, 'invalid_input', ['fields' => $v['name_ku'] === '' ? ['name_ku'] : ['price']]);
        return $v;
    }

    public static function saveVariants(int $pid, array $vs): void
    {
        $keep = array_values(array_filter(array_column($vs, 'id')));
        self::run('DELETE FROM product_variants WHERE product_id = ?' . ($keep ? ' AND id NOT IN (' . self::marks($keep) . ')' : ''), array_merge([$pid], $keep));
        foreach ($vs as $x) {
            $exists = $x['id'] && self::one('SELECT 1 FROM product_variants WHERE id = ? AND product_id = ?', [$x['id'], $pid]);
            if ($exists) self::run('UPDATE product_variants SET label=?, sku=?, price=?, old_price=?, price_usd=?, old_price_usd=?, stock=?, sort=?, cost_price=? WHERE id=?',
                [$x['label'], $x['sku'], $x['price'], $x['old_price'], $x['price_usd'], $x['old_price_usd'], $x['stock'], $x['sort'], $x['cost_price'], $x['id']]);
            else self::run('INSERT INTO product_variants(product_id, label, sku, price, old_price, price_usd, old_price_usd, stock, sort, cost_price) VALUES(?,?,?,?,?,?,?,?,?,?)',
                [$pid, $x['label'], $x['sku'], $x['price'], $x['old_price'], $x['price_usd'], $x['old_price_usd'], $x['stock'], $x['sort'], $x['cost_price']]);
        }
        self::syncFromVariants($pid);
    }
    public static function saveTags(int $pid, array $ids): void
    {
        self::run('DELETE FROM product_tags WHERE product_id = ?', [$pid]);
        foreach ($ids as $t) if (self::one('SELECT 1 FROM tags WHERE id = ?', [$t])) self::run('INSERT IGNORE INTO product_tags(product_id, tag_id) VALUES(?,?)', [$pid, $t]);
    }

    public static function decorateAdmin(array $list): array
    {
        $min = Setting::int('min_profit');
        foreach ($list as &$p) {
            $p['tag_ids'] = array_map('intval', array_column(self::all('SELECT tag_id FROM product_tags WHERE product_id = ?', [$p['id']]), 'tag_id'));
            $pairs = !empty($p['variants']) ? array_map(fn($v) => [$v['price'], $v['cost_price'] ?? $p['cost_price']], $p['variants']) : [[$p['price'], $p['cost_price']]];
            $p['low_margin'] = false; foreach ($pairs as [$pr, $c]) if ($c !== null && $pr - $c < $min) $p['low_margin'] = true;
        }
        return $list;
    }
    public static function adminOne(int $id): array { return self::decorateAdmin(self::attachVariants([self::out(self::find($id, false), true)]))[0]; }
}

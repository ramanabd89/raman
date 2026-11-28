<?php
namespace App\Models;

use App\Core\Model;

/** Prices a cart from the database (never trusts the browser) and keeps abandoned carts for follow-up. */
final class Cart extends Model
{
    /** Current price/stock for each line: [{id, variant_id, qty, available, price, stock, ...}] */
    public static function price($raw): array
    {
        $out = [];
        foreach (array_slice(is_array($raw) ? $raw : [], 0, 50) as $it) {
            if (!is_array($it)) continue;
            $qty = max(1, min(toint($it['qty'] ?? 1, 1), 99));
            $p = self::one('SELECT * FROM products WHERE id = ? AND active = 1', [toint($it['id'] ?? 0)]);
            if (!$p) { $out[] = ['id' => toint($it['id'] ?? 0), 'variant_id' => $it['variant_id'] ?? null, 'qty' => $qty, 'available' => false]; continue; }
            $v = !empty($it['variant_id']) ? self::one('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [toint($it['variant_id']), $p['id']]) : null;
            if (!empty($it['variant_id']) && !$v) { $out[] = ['id' => $p['id'], 'variant_id' => $it['variant_id'], 'qty' => $qty, 'available' => false]; continue; }
            $out[] = ['id' => $p['id'], 'variant_id' => $v ? $v['id'] : null, 'variant_label' => $v ? $v['label'] : null, 'name_ku' => $p['name_ku'], 'name_ar' => $p['name_ar'], 'name_en' => $p['name_en'],
                'image' => $p['image'], 'price' => $v ? $v['price'] : $p['price'], 'stock' => $v ? $v['stock'] : $p['stock'], 'qty' => $qty, 'available' => true, 'is_phone' => Product::isPhone($p)];
        }
        return $out;
    }
    public static function subtotal(array $items): int { $s = 0; foreach ($items as $it) if ($it['available']) $s += $it['price'] * $it['qty']; return $s; }
    /** lines for Product::bundleDiscount */
    public static function lines(array $items): array
    {
        $o = [];
        foreach ($items as $it) if ($it['available']) $o[] = ['p' => self::one('SELECT * FROM products WHERE id = ?', [$it['id']]), 'price' => $it['price'], 'qty' => $it['qty']];
        return $o;
    }

    public static function sync(int $userId, $raw): void
    {
        $items = array_values(array_filter(self::price($raw), fn($i) => $i['available']));
        if (!$items) { self::run('DELETE FROM carts WHERE user_id = ?', [$userId]); return; }
        $slim = array_map(fn($i) => ['id' => $i['id'], 'variant_id' => $i['variant_id'], 'qty' => $i['qty']], $items);
        self::run('INSERT INTO carts(user_id, items, value, updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE items = VALUES(items), value = VALUES(value), updated_at = VALUES(updated_at)',
            [$userId, json_enc($slim), self::subtotal($items)]);
    }
    /**
     * Guest cart + the account's saved cart → one cart. Same product/variant lines are added together, each line is capped
     * to what is in stock, and lines that are gone or sold out are dropped. Every change is reported in `notices`.
     */
    public static function merge(int $userId, $guest): array
    {
        return self::tx(function () use ($userId, $guest) {
            $saved = self::one('SELECT items FROM carts WHERE user_id = ? FOR UPDATE', [$userId]);
            $lines = []; $order = [];
            foreach ([parse_json($saved['items'] ?? '[]', []), is_array($guest) ? array_slice($guest, 0, 50) : []] as $src) {
                foreach ($src as $it) {
                    if (!is_array($it) || toint($it['id'] ?? 0) <= 0) continue;
                    $vid = !empty($it['variant_id']) ? toint($it['variant_id']) : null;
                    $k = toint($it['id']) . ':' . ($vid ?? 0);
                    if (!isset($lines[$k])) { $lines[$k] = ['id' => toint($it['id']), 'variant_id' => $vid, 'qty' => 0]; $order[] = $k; }
                    $lines[$k]['qty'] += max(1, min(toint($it['qty'] ?? 1, 1), 99));
                }
            }
            $items = []; $notices = [];
            foreach ($order as $k) {
                $want = $lines[$k]['qty'];
                $priced = self::price([['id' => $lines[$k]['id'], 'variant_id' => $lines[$k]['variant_id'], 'qty' => min($want, 99)]])[0];
                if (!$priced['available']) { $notices[] = ['id' => $priced['id'], 'variant_id' => $priced['variant_id'], 'reason' => 'unavailable']; continue; }
                $label = ['id' => $priced['id'], 'variant_id' => $priced['variant_id'], 'name_ku' => $priced['name_ku'], 'name_ar' => $priced['name_ar'], 'name_en' => $priced['name_en'], 'variant_label' => $priced['variant_label']];
                if ($priced['stock'] <= 0) { $notices[] = $label + ['reason' => 'out_of_stock']; continue; }
                $qty = min($want, (int)$priced['stock'], 99);
                if ($qty < $want) $notices[] = $label + ['reason' => 'reduced', 'qty_before' => $want, 'qty' => $qty];
                $priced['qty'] = $qty;
                $items[] = $priced;
            }
            $subtotal = self::subtotal($items);
            if ($items) {
                $slim = array_map(fn($i) => ['id' => $i['id'], 'variant_id' => $i['variant_id'], 'qty' => $i['qty']], $items);
                self::run('INSERT INTO carts(user_id, items, value, updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE items = VALUES(items), value = VALUES(value), updated_at = VALUES(updated_at)',
                    [$userId, json_enc($slim), $subtotal]);
            } else self::run('DELETE FROM carts WHERE user_id = ?', [$userId]);
            $bundle = Product::bundleDiscount(self::lines($items));
            return ['items' => $items, 'subtotal' => $subtotal, 'bundle_discount' => $bundle, 'total' => max(0, $subtotal - $bundle), 'currency' => 'IQD', 'notices' => $notices];
        });
    }

    public static function abandoned(): array
    {
        $rows = self::all('SELECT c.*, u.name, u.phone, TIMESTAMPDIFF(SECOND, c.updated_at, UTC_TIMESTAMP()) / 3600 AS hours FROM carts c JOIN users u ON u.id = c.user_id ORDER BY c.updated_at DESC LIMIT 300');
        return array_map(function ($r) { $r['hours'] = (float)$r['hours']; $r['items'] = self::price(parse_json($r['items'], [])); return $r; }, $rows);
    }
}

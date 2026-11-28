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
    public static function abandoned(): array
    {
        $rows = self::all('SELECT c.*, u.name, u.phone, TIMESTAMPDIFF(SECOND, c.updated_at, UTC_TIMESTAMP()) / 3600 AS hours FROM carts c JOIN users u ON u.id = c.user_id ORDER BY c.updated_at DESC LIMIT 300');
        return array_map(function ($r) { $r['hours'] = (float)$r['hours']; $r['items'] = self::price(parse_json($r['items'], [])); return $r; }, $rows);
    }
}

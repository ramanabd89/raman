<?php
namespace App\Models;

use App\Core\Model;
use App\Services\TelegramService;

/** Stock ledger: initial, order, cancel, restock, damage, return, correction, admin_edit. */
final class StockMovement extends Model
{
    public const REASONS = ['restock', 'damage', 'correction', 'return'];

    public static function record(int $productId, $variantId, int $delta, string $reason, ?string $ref = null, ?string $userName = null): void
    {
        if (!$delta) return;
        $p = self::one('SELECT name_ku, stock FROM products WHERE id = ?', [$productId]);
        $v = $variantId ? self::one('SELECT label, stock FROM product_variants WHERE id = ?', [$variantId]) : null;
        $after = $v ? $v['stock'] : ($p['stock'] ?? null);
        self::run('INSERT INTO stock_movements(product_id, variant_id, product_name, variant_label, delta, stock_after, reason, ref, user_name, created_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())',
            [$productId, $variantId ?: null, $p['name_ku'] ?? null, $v['label'] ?? null, $delta, $after, $reason, $ref, $userName]);
        // low-stock alert when an order takes the product down to the threshold
        $limit = Setting::int('low_stock_threshold', 3);
        if ($delta < 0 && $after !== null && $after <= $limit && $after - $delta > $limit) TelegramService::event('tg_low_stock', 'tg.low_stock', ['name' => trim(($p['name_ku'] ?? '') . ' ' . ($v['label'] ?? '')), 'stock' => $after]);
    }

    public static function list(int $productId = 0): array
    {
        return $productId ? self::all('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 300', [$productId]) : self::all('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 300');
    }
}

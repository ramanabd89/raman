<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/** Product options (storage / colour) with their own price, stock, cost and SKU. */
final class Variant extends Model
{
    public static function find(int $id, int $productId): ?array { return self::one('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [$id, $productId]); }

    /** Quick restock / correction from the stock page (variant or simple product). */
    public static function adjustStock(int $productId, ?int $variantId, int $delta, string $reason, ?string $note, string $by): int
    {
        if (!$delta) throw new HttpException(422, 'invalid_input', ['fields' => ['delta']]);
        if (!in_array($reason, StockMovement::REASONS, true)) $reason = 'correction';
        self::tx(function () use ($productId, $variantId, $delta, $reason, $note, $by) {
            if ($variantId) {
                $v = self::find($variantId, $productId);
                if (!$v) throw new HttpException(404, 'not_found');
                if ($v['stock'] + $delta < 0) throw new HttpException(422, 'invalid_input', ['fields' => ['delta']]);
                self::run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [$delta, $variantId]);
                self::run('UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?', [$productId, $productId]);
            } else {
                $p = self::one('SELECT * FROM products WHERE id = ?', [$productId]);
                if (!$p) throw new HttpException(404, 'not_found');
                if ($p['stock'] + $delta < 0) throw new HttpException(422, 'invalid_input', ['fields' => ['delta']]);
                self::run('UPDATE products SET stock = stock + ? WHERE id = ?', [$delta, $productId]);
            }
            StockMovement::record($productId, $variantId, $delta, $reason, $note, $by);
        });
        return (int)self::val('SELECT stock FROM products WHERE id = ?', [$productId]);
    }
}

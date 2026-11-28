<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/** Influencer / campaign discount codes (percent or fixed IQD). */
final class Coupon extends Model
{
    public const FIELDS = ['code', 'owner', 'type', 'value', 'max_discount', 'min_order', 'max_uses', 'once_per_customer', 'expires_at', 'active'];

    public static function norm($c): string { return preg_replace('/\s+/', '', strtoupper(tostr($c, 30))); }

    /** Returns ['coupon' => row, 'discount' => IQD] or throws coupon_* (subtotal is after the bundle deal). */
    public static function evaluate($code, ?int $userId, int $subtotal): array
    {
        $c = self::one('SELECT * FROM coupons WHERE code = ?', [self::norm($code)]);
        if (!$c || !$c['active']) throw new HttpException(400, 'coupon_invalid');
        if ($c['expires_at'] && ($t = strtotime($c['expires_at'])) !== false && $t < time()) throw new HttpException(400, 'coupon_expired');
        if ($c['max_uses'] && $c['uses'] >= $c['max_uses']) throw new HttpException(400, 'coupon_used_up');
        if ($subtotal < $c['min_order']) throw new HttpException(400, 'coupon_min_order', ['detail' => $c['min_order']]);
        if ($c['once_per_customer'] && $userId && self::one("SELECT 1 FROM orders WHERE user_id = ? AND coupon_code = ? AND status != 'cancelled'", [$userId, $c['code']])) throw new HttpException(400, 'coupon_already_used');
        $d = $c['type'] === 'fixed' ? (int)$c['value'] : (int)floor(($subtotal * $c['value']) / 100);
        if ($c['max_discount']) $d = min($d, (int)$c['max_discount']);
        return ['coupon' => $c, 'discount' => max(0, min($d, $subtotal))];
    }

    public static function adminList(): array
    {
        return self::all("SELECT c.*,
            (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS orders,
            (SELECT COALESCE(SUM(o.total + o.wallet_used), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status = 'delivered') AS revenue,
            (SELECT COALESCE(SUM(o.discount), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS discount_given
          FROM coupons c ORDER BY c.id DESC");
    }

    public static function values(array $b): array
    {
        $off = fn($x) => $x === false || $x === 0;
        $v = ['code' => self::norm($b['code'] ?? ''), 'owner' => tostr($b['owner'] ?? '', 80), 'type' => ($b['type'] ?? '') === 'fixed' ? 'fixed' : 'percent', 'value' => max(0, toint($b['value'] ?? 0)),
            'max_discount' => !empty($b['max_discount']) ? max(0, toint($b['max_discount'])) : null, 'min_order' => max(0, toint($b['min_order'] ?? 0)),
            'max_uses' => !empty($b['max_uses']) ? max(1, toint($b['max_uses'])) : null, 'once_per_customer' => array_key_exists('once_per_customer', $b) && $off($b['once_per_customer']) ? 0 : 1,
            'expires_at' => !empty($b['expires_at']) ? tostr($b['expires_at'], 40) : null, 'active' => array_key_exists('active', $b) && $off($b['active']) ? 0 : 1];
        if (!preg_match('/^[A-Z0-9_-]{3,30}$/', $v['code']) || !$v['value'] || ($v['type'] === 'percent' && $v['value'] > 90)) throw new HttpException(422, 'invalid_input');
        return $v;
    }
}

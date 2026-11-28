<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;
use App\Services\TelegramService;

/** Orders: placing (server-side prices), cancelling (restock), status changes (cashback, referral reward). */
final class Order extends Model
{
    public const STATUSES = ['pending', 'preparing', 'shipping', 'delivered', 'cancelled'];
    public const SOURCES = ['tiktok', 'instagram', 'facebook', 'snapchat', 'friend', 'influencer', 'google', 'store', 'other'];

    public static function find(int $id, ?int $userId = null): ?array
    {
        return $userId ? self::one('SELECT * FROM orders WHERE id = ? AND user_id = ?', [$id, $userId]) : self::one('SELECT * FROM orders WHERE id = ?', [$id]);
    }

    public static function withItems(?array $o, bool $staff = false): ?array
    {
        if (!$o) return $o;
        $t = $o['tradein_id'] ? self::one('SELECT id, label, estimate, final_value, status, answers FROM tradeins WHERE id = ?', [$o['tradein_id']]) : null;
        if ($t) $t['answers'] = obj(parse_json($t['answers'], []));
        $o['items'] = array_map(function ($it) use ($staff) { if (!$staff) unset($it['cost']); return $it; }, self::all('SELECT * FROM order_items WHERE order_id = ?', [$o['id']]));
        $o['tradein'] = $t;
        return $o;
    }

    public static function adminExtras(array $o): array
    {
        $confirm = Setting::int('confirm_over');
        $u = $o['user_id'] ? self::one('SELECT blocked FROM users WHERE id = ?', [$o['user_id']]) : null;
        $o['high_value'] = $confirm > 0 && $o['total'] + $o['wallet_used'] >= $confirm;
        $o['customer_blocked'] = (bool)($u['blocked'] ?? false);
        $o['phone_cancelled'] = (int)self::val("SELECT COUNT(*) FROM orders WHERE phone = ? AND status = 'cancelled' AND id != ?", [$o['phone'], $o['id']]);
        return $o;
    }

    public static function delivery(string $city, int $subtotal): int
    {
        $zones = Setting::zones();
        $zone = null; foreach ($zones as $z) if ($z['name'] === $city) { $zone = $z; break; }
        if ($zones && $city !== '' && !$zone) throw new HttpException(422, 'invalid_city');
        $free = Setting::int('free_delivery_over');
        if ($free && $subtotal >= $free) return 0;
        return $zone ? max(0, toint($zone['fee'])) : Setting::int('delivery_fee');
    }

    /** Places the order inside a transaction; all prices, discounts and stock come from the database. */
    public static function place(array $user, array $in): array
    {
        $items = array_slice(is_array($in['items'] ?? null) ? $in['items'] : [], 0, 50);
        $name = tostr($in['name'] ?? '', 80) ?: $user['name'];
        $phone = norm_phone($in['phone'] ?? '') ?: $user['phone'];
        $city = tostr($in['city'] ?? '', 60);
        $address = tostr($in['address'] ?? '', 300);
        if (!$items) throw new HttpException(422, 'cart_empty');
        if ($city === '' || $address === '') throw new HttpException(422, 'invalid_input', ['fields' => $city === '' ? ['city'] : ['address']]);
        if ($user['blocked']) throw new HttpException(403, 'account_blocked');
        $maxPending = Setting::int('max_pending_orders', 2);
        if ($maxPending > 0 && (int)self::val("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'pending'", [$user['id']]) >= $maxPending) throw new HttpException(429, 'too_many_pending');

        $order = self::tx(function () use ($user, $in, $items, $name, $phone, $city, $address) {
            $subtotal = 0; $lines = [];
            foreach ($items as $it) {
                $qty = max(1, min(toint($it['qty'] ?? 1, 1), 99));
                $p = self::one('SELECT * FROM products WHERE id = ? AND active = 1 FOR UPDATE', [toint($it['id'] ?? 0)]);
                if (!$p) throw new HttpException(409, 'product_unavailable');
                $variants = Product::variants((int)$p['id']);
                $price = $p['price']; $variant = null;
                if ($variants) {
                    foreach ($variants as $v) if ($v['id'] === toint($it['variant_id'] ?? 0)) $variant = $v;
                    if (!$variant) throw new HttpException(422, 'choose_variant', ['detail' => $p['name_ku']]);
                    if ($variant['stock'] < $qty) throw new HttpException(409, 'out_of_stock', ['detail' => "{$p['name_ku']} ({$variant['label']})"]);
                    $price = $variant['price'];
                    self::run('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [$qty, $variant['id']]);
                } elseif ($p['stock'] < $qty) throw new HttpException(409, 'out_of_stock', ['detail' => $p['name_ku']]);
                self::run('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?', [$qty, $qty, $p['id']]);
                $subtotal += $price * $qty;
                $lines[] = ['p' => $p, 'qty' => $qty, 'price' => $price, 'variant' => $variant];
            }
            $bundleOff = Product::bundleDiscount($lines);
            $net = $subtotal - $bundleOff; // coupon, delivery and trade-in all work on the bundle price
            $discount = 0; $code = null;
            if (!empty($in['coupon'])) {
                $c = Coupon::evaluate($in['coupon'], (int)$user['id'], $net);
                $discount = $c['discount']; $code = $c['coupon']['code'];
                self::run('UPDATE coupons SET uses = uses + 1 WHERE id = ?', [$c['coupon']['id']]);
            }
            $delivery = self::delivery($city, $net - $discount);
            $tradein = null; $credit = 0;
            if (!empty($in['tradein']['model_id'])) {
                if (!Setting::on('tradein_enabled')) throw new HttpException(400, 'tradein_disabled');
                $tradein = TradeIn::quote($in['tradein']['model_id'], $in['tradein']['answers'] ?? []);
                if (!empty($tradein['error'])) throw new HttpException(422, $tradein['error']);
                $credit = min($tradein['estimate'], $net - $discount);
            }
            $wallet = (int)self::val('SELECT wallet FROM users WHERE id = ? FOR UPDATE', [$user['id']]);
            $walletUsed = !empty($in['use_wallet']) ? min($wallet, $net - $discount - $credit + $delivery) : 0;
            $total = $net - $discount - $credit + $delivery - $walletUsed;
            $source = in_array($in['source'] ?? '', self::SOURCES, true) ? $in['source'] : null;
            $utm = preg_replace('/[^\w\-.:\/ ]/', '', tostr($in['utm'] ?? '', 100)) ?: null;
            self::run('INSERT INTO orders(user_id, customer_name, phone, city, address, note, subtotal, delivery_fee, wallet_used, total, discount, coupon_code, source, utm, bundle_discount, created_at, updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
                [$user['id'], $name, $phone, $city, $address, tostr($in['note'] ?? '', 500), $subtotal, $delivery, $walletUsed, $total, $discount, $code, $source, $utm, $bundleOff]);
            $oid = self::lastId();
            foreach ($lines as $l) {
                $cost = $l['variant'] && $l['variant']['cost_price'] !== null ? $l['variant']['cost_price'] : $l['p']['cost_price'];
                self::run('INSERT INTO order_items(order_id, product_id, variant_id, variant_label, name, image, price, qty, cost) VALUES(?,?,?,?,?,?,?,?,?)',
                    [$oid, $l['p']['id'], $l['variant']['id'] ?? null, $l['variant']['label'] ?? null, $l['p']['name_ku'], $l['p']['image'], $l['price'], $l['qty'], $cost]);
                StockMovement::record((int)$l['p']['id'], $l['variant']['id'] ?? null, -$l['qty'], 'order', "#$oid", $name);
            }
            self::run('DELETE FROM carts WHERE user_id = ?', [$user['id']]);
            if ($tradein) {
                self::run('INSERT INTO tradeins(user_id, order_id, model_id, label, answers, estimate, created_at, updated_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
                    [$user['id'], $oid, $tradein['model']['id'], $tradein['label'], json_enc(obj($tradein['answers'])), $tradein['estimate']]);
                self::run('UPDATE orders SET tradein_id = ?, tradein_credit = ? WHERE id = ?', [self::lastId(), $credit, $oid]);
            }
            if ($walletUsed) self::run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [$walletUsed, $user['id']]);
            return self::find($oid);
        });
        $full = self::withItems($order);
        TelegramService::newOrder($full);
        return $full;
    }

    public static function cancelEffects(array $o, ?string $userName = null): void
    {
        foreach (self::all('SELECT * FROM order_items WHERE order_id = ?', [$o['id']]) as $it) {
            if ($it['product_id']) self::run('UPDATE products SET stock = stock + ?, sold = GREATEST(sold - ?, 0) WHERE id = ?', [$it['qty'], $it['qty'], $it['product_id']]);
            if ($it['variant_id']) self::run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [$it['qty'], $it['variant_id']]);
            if ($it['product_id']) StockMovement::record((int)$it['product_id'], $it['variant_id'], (int)$it['qty'], 'cancel', "#{$o['id']}", $userName);
        }
        if ($o['cashback'] && $o['user_id']) self::run('UPDATE users SET wallet = GREATEST(wallet - ?, 0) WHERE id = ?', [$o['cashback'], $o['user_id']]);
        if ($o['wallet_used'] && $o['user_id']) self::run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [$o['wallet_used'], $o['user_id']]);
        if ($o['coupon_code']) self::run('UPDATE coupons SET uses = GREATEST(uses - 1, 0) WHERE code = ?', [$o['coupon_code']]);
        if ($o['tradein_id']) self::run("UPDATE tradeins SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$o['tradein_id']]);
    }

    public static function cancelByCustomer(array $o, array $user): array
    {
        if ($o['status'] !== 'pending') throw new HttpException(409, 'cannot_cancel');
        self::tx(function () use ($o, $user) { self::cancelEffects($o, $user['name']); self::run("UPDATE orders SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$o['id']]); });
        TelegramService::event('tg_order_cancelled', 'tg.order_cancelled', ['id' => $o['id'], 'name' => $o['customer_name'], 'phone' => $o['phone']]);
        return self::withItems(self::find((int)$o['id']));
    }

    /** Admin status change: cashback on the amount actually paid for products, referral reward on the first delivery. */
    public static function setStatus(array $o, string $status, ?string $note, string $byName): void
    {
        if (!in_array($status, self::STATUSES, true)) throw new HttpException(422, 'invalid_status');
        if ($o['status'] === 'cancelled' && $status !== 'cancelled') throw new HttpException(409, 'order_cancelled');
        self::tx(function () use ($o, $status, $note, $byName) {
            if ($status === 'cancelled' && $o['status'] !== 'cancelled') self::cancelEffects($o, $byName);
            self::run('UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = UTC_TIMESTAMP() WHERE id = ?', [$status, $note, $o['id']]);
            $pct = num(Setting::get('cashback_percent'));
            if ($status === 'delivered' && $o['user_id'] && !$o['cashback'] && $pct > 0) {
                $base = $o['subtotal'] - $o['bundle_discount'] - $o['discount'];
                $cb = (int)floor(($base * min($pct, 50)) / 100);
                if ($cb > 0) { self::run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [$cb, $o['user_id']]); self::run('UPDATE orders SET cashback = ? WHERE id = ?', [$cb, $o['id']]); }
            }
            if ($status === 'delivered' && $o['user_id']) {
                $u = self::one('SELECT * FROM users WHERE id = ?', [$o['user_id']]);
                if ($u && $u['referred_by'] && !$u['referral_paid']) {
                    $reward = Setting::int('referral_reward');
                    if ($reward > 0) self::run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [$reward, $u['referred_by']]);
                    self::run('UPDATE users SET referral_paid = 1 WHERE id = ?', [$u['id']]);
                }
            }
        });
    }

    /** IMEI / serial of a sold phone (lets /warranty find the sale later). */
    public static function setImei(int $orderId, int $itemId, string $imei): void
    {
        $imei = preg_replace('/[^\dA-Za-z]/', '', $imei);
        if ($imei !== '' && (strlen($imei) < 8 || strlen($imei) > 20)) throw new HttpException(422, 'invalid_input', ['fields' => ['imei']]);
        if (!self::run('UPDATE order_items SET imei = ? WHERE id = ? AND order_id = ?', [$imei ?: null, $itemId, $orderId]) && !self::one('SELECT 1 FROM order_items WHERE id = ? AND order_id = ?', [$itemId, $orderId])) throw new HttpException(404, 'not_found');
    }

    public static function stats(int $uid): array
    {
        $by = array_fill_keys(self::STATUSES, 0);
        foreach (self::all('SELECT status, COUNT(*) n FROM orders WHERE user_id = ? GROUP BY status', [$uid]) as $r) $by[$r['status']] = (int)$r['n'];
        return ['by_status' => $by,
            'total_spent' => (int)self::val("SELECT COALESCE(SUM(total + wallet_used), 0) FROM orders WHERE user_id = ? AND status = 'delivered'", [$uid]),
            'orders' => (int)self::val('SELECT COUNT(*) FROM orders WHERE user_id = ?', [$uid]),
            'invited' => (int)self::val('SELECT COUNT(*) FROM users WHERE referred_by = ?', [$uid])];
    }
}

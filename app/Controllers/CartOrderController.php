<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\RateLimiter;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Product;

/** Cart quote, coupons, abandoned-cart sync and the customer's orders. */
final class CartOrderController extends Controller
{
    /** Current prices/stock + bundle deal + delivery for a city (the cart never shows stale prices). */
    public function quote(): array
    {
        $items = Cart::price($this->in('items', []));
        $sub = Cart::subtotal($items);
        $bundle = Product::bundleDiscount(Cart::lines($items));
        try { $delivery = Order::delivery(tostr($this->in('city', ''), 60), $sub - $bundle); } catch (HttpException) { $delivery = null; }
        return ['items' => $items, 'subtotal' => $sub, 'bundle_discount' => $bundle, 'delivery' => $delivery];
    }

    public function checkCoupon(): array
    {
        $keys = ["coupon:{$this->req->ip}"];
        RateLimiter::check($keys); // 15 wrong codes per 15 minutes: stops guessing
        $items = Cart::price($this->in('items', []));
        $sub = Cart::subtotal($items) - Product::bundleDiscount(Cart::lines($items));
        try { $r = Coupon::evaluate($this->in('code', ''), $this->req->user['id'] ?? null, $sub); }
        catch (HttpException $e) { if ($e->errCode === 'coupon_invalid') RateLimiter::hit($keys); throw $e; }
        return ['code' => $r['coupon']['code'], 'type' => $r['coupon']['type'], 'value' => $r['coupon']['value'], 'discount' => $r['discount']];
    }

    public function sync(): array { Cart::sync($this->uid(), $this->in('items', [])); return ['ok' => true]; }

    public function place(): array { return Order::place($this->user(), $this->req->body); }

    public function list(): array
    {
        $st = in_array($this->qs('status', ''), Order::STATUSES, true) ? $this->qs('status') : null;
        $rows = $st ? Order::all('SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC', [$this->uid(), $st]) : Order::all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [$this->uid()]);
        return array_map(fn($o) => Order::withItems($o), $rows);
    }

    public function show(): array
    {
        $o = Order::find($this->id(), $this->uid());
        if (!$o) throw new HttpException(404, 'not_found');
        return Order::withItems($o);
    }

    public function cancel(): array
    {
        $o = Order::find($this->id(), $this->uid());
        if (!$o) throw new HttpException(404, 'not_found');
        return Order::cancelByCustomer($o, $this->user());
    }
}

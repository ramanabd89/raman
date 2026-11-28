<?php
namespace App\Models;

use App\Core\Model;

/** Favourites. Guests keep them in the browser; after sign-in the browser list is merged into `wishlists`. */
final class Wishlist extends Model
{
    public const MAX = 200;

    public static function ids(int $uid): array
    {
        return array_map('intval', array_column(self::all('SELECT w.product_id FROM wishlists w JOIN products p ON p.id = w.product_id AND p.active = 1 WHERE w.user_id = ? ORDER BY w.created_at DESC, w.product_id DESC', [$uid]), 'product_id'));
    }
    public static function has(int $uid, int $pid): bool { return (bool)self::one('SELECT 1 FROM wishlists WHERE user_id = ? AND product_id = ?', [$uid, $pid]); }
    public static function add(int $uid, int $pid): bool
    {
        if (!self::one('SELECT 1 FROM products WHERE id = ? AND active = 1', [$pid])) return false;
        if ((int)self::val('SELECT COUNT(*) FROM wishlists WHERE user_id = ?', [$uid]) >= self::MAX) return false;
        self::run('INSERT IGNORE INTO wishlists(user_id, product_id, created_at) VALUES(?,?,UTC_TIMESTAMP())', [$uid, $pid]);
        return true;
    }
    public static function remove(int $uid, int $pid): void { self::run('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [$uid, $pid]); }

    /** @return array{on: bool, ids: int[]} */
    public static function toggle(int $uid, int $pid): array
    {
        if (self::has($uid, $pid)) { self::remove($uid, $pid); $on = false; } else $on = self::add($uid, $pid);
        return ['on' => $on, 'ids' => self::ids($uid)];
    }

    /** The browser list joins the account list (unknown/hidden products are skipped). */
    public static function merge(int $uid, array $ids): array
    {
        self::tx(function () use ($uid, $ids) {
            foreach (array_slice(array_values(array_unique(array_filter(array_map('toint', $ids), fn($x) => $x > 0))), 0, self::MAX) as $pid) self::add($uid, $pid);
        });
        return self::ids($uid);
    }
}

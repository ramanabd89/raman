<?php
namespace App\Models;

use App\Core\Model;

/** Favourites. Guests keep them in the browser; signed-in customers' lists are synced here. */
final class Wishlist extends Model
{
    public static function ids(int $uid): array { return array_map('intval', array_column(self::all('SELECT product_id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC', [$uid]), 'product_id')); }
    public static function add(int $uid, int $pid): void
    {
        if (self::one('SELECT 1 FROM products WHERE id = ? AND active = 1', [$pid])) self::run('INSERT IGNORE INTO wishlist(user_id, product_id, created_at) VALUES(?,?,UTC_TIMESTAMP())', [$uid, $pid]);
    }
    public static function remove(int $uid, int $pid): void { self::run('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', [$uid, $pid]); }
    /** merge the browser list into the account (max 200) */
    public static function merge(int $uid, array $ids): array
    {
        foreach (array_slice(array_unique(array_filter(array_map('toint', $ids))), 0, 200) as $pid) self::add($uid, $pid);
        return self::ids($uid);
    }
}

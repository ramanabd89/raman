<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/** Stars + comment + up to 3 photos. Buyers are published at once with a "verified purchase" badge. */
final class Review extends Model
{
    public const STATUSES = ['pending', 'approved', 'hidden'];

    public static function recalc(int $pid): void
    {
        $r = self::one("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id = ? AND status = 'approved'", [$pid]);
        self::run('UPDATE products SET rating_count = ?, rating_avg = ? WHERE id = ?', [$r['n'], $r['n'] ? round((float)$r['a'] * 10) / 10 : 0, $pid]);
    }
    public static function boughtIt(int $uid, int $pid): bool
    {
        return (bool)self::one("SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered' LIMIT 1", [$uid, $pid]);
    }
    public static function shortName($name): string
    {
        $w = array_values(array_filter(preg_split('/\s+/u', trim((string)$name)), fn($x) => $x !== ''));
        if (!$w) return '—';
        return count($w) > 1 ? $w[0] . ' ' . mb_substr($w[1], 0, 1) . '.' : $w[0];
    }
    public static function pub(array $r): array
    {
        return ['id' => $r['id'], 'rating' => $r['rating'], 'comment' => $r['comment'], 'photos' => parse_json($r['photos'], []), 'name' => $r['name'], 'city' => $r['city'],
            'verified' => (bool)$r['verified'], 'reply' => $r['reply'], 'created_at' => $r['created_at']];
    }
    public static function canReview(?array $user, int $pid): string
    {
        if (Setting::get('reviews_enabled', '1') === '0') return 'off';
        if (!$user) return 'login';
        if (self::boughtIt((int)$user['id'], $pid)) return 'yes';
        return Setting::get('reviews_buyers_only', '1') === '0' ? 'yes' : 'buy';
    }
    private static function round1($x) { $v = round((float)$x * 10) / 10; return $v == (int)$v ? (int)$v : $v; }

    public static function forProduct(int $pid, ?array $user, int $limit, int $offset, bool $photosOnly): array
    {
        $sum = self::one("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id = ? AND status = 'approved'", [$pid]);
        $dist = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];
        foreach (self::all("SELECT rating, COUNT(*) n FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating", [$pid]) as $r) $dist[$r['rating']] = (int)$r['n'];
        $list = array_map([self::class, 'pub'], self::all("SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' " . ($photosOnly ? "AND photos != '[]' " : '')
            . "ORDER BY verified DESC, (photos != '[]') DESC, id DESC LIMIT $limit OFFSET $offset", [$pid]));
        $photos = [];
        foreach (self::all("SELECT photos FROM reviews WHERE product_id = ? AND status = 'approved' AND photos != '[]' ORDER BY id DESC LIMIT 12", [$pid]) as $r) $photos = array_merge($photos, parse_json($r['photos'], []));
        $mine = $user ? self::one('SELECT * FROM reviews WHERE product_id = ? AND user_id = ?', [$pid, $user['id']]) : null;
        return ['avg' => $sum['n'] ? self::round1($sum['a']) : 0, 'count' => (int)$sum['n'], 'dist' => $dist, 'list' => $list, 'photos' => array_slice($photos, 0, 12),
            'mine' => $mine ? self::pub($mine) + ['status' => $mine['status']] : null, 'can_review' => self::canReview($user, $pid)];
    }

    public static function save(array $user, int $pid, $rating, $comment, $photos): string
    {
        if (!self::one('SELECT id FROM products WHERE id = ? AND active = 1', [$pid])) throw new HttpException(404, 'not_found');
        $can = self::canReview($user, $pid);
        if ($can === 'off') throw new HttpException(400, 'reviews_off');
        if ($can === 'buy') throw new HttpException(403, 'review_buyers_only');
        $rating = toint($rating);
        if ($rating < 1 || $rating > 5) throw new HttpException(422, 'invalid_input', ['fields' => ['rating']]);
        $comment = tostr($comment, 1000);
        // only photos this shop processed
        $photos = array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 120), is_array($photos) ? $photos : []), fn($x) => preg_match('#^/uploads/[a-f0-9]{24}\.(webp|jpg)$#', $x))), 0, 3);
        $verified = self::boughtIt((int)$user['id'], $pid) ? 1 : 0;
        $status = $verified ? 'approved' : 'pending';
        $city = self::val('SELECT city FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$user['id']]) ?: null;
        $name = self::shortName($user['name']);
        $old = self::one('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', [$pid, $user['id']]);
        if ($old) self::run('UPDATE reviews SET rating = ?, comment = ?, photos = ?, verified = ?, status = ?, name = ?, city = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [$rating, $comment, json_enc($photos), $verified, $status, $name, $city, $old['id']]);
        else self::run('INSERT INTO reviews(product_id, user_id, rating, comment, photos, verified, status, name, city, created_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())', [$pid, $user['id'], $rating, $comment, json_enc($photos), $verified, $status, $name, $city]);
        self::recalc($pid);
        return $status;
    }

    public static function toReview(int $uid): array
    {
        return self::all("SELECT p.id, p.name_ku, p.name_ar, p.name_en, p.image, MAX(o.id) last_order FROM order_items oi JOIN orders o ON o.id = oi.order_id
            JOIN products p ON p.id = oi.product_id WHERE o.user_id = ? AND o.status = 'delivered' AND p.active = 1
            AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.user_id = ?) GROUP BY p.id, p.name_ku, p.name_ar, p.name_en, p.image ORDER BY last_order DESC LIMIT 10", [$uid, $uid]);
    }

    public static function adminList(?string $status): array
    {
        $st = in_array($status, self::STATUSES, true) ? $status : null;
        $rows = self::all("SELECT r.*, p.name_ku product_name, p.image product_image, u.phone FROM reviews r JOIN products p ON p.id = r.product_id LEFT JOIN users u ON u.id = r.user_id "
            . ($st ? 'WHERE r.status = ? ' : '') . "ORDER BY (r.status = 'pending') DESC, r.id DESC LIMIT 300", $st ? [$st] : []);
        $counts = []; foreach (self::STATUSES as $s) $counts[$s] = (int)self::val('SELECT COUNT(*) FROM reviews WHERE status = ?', [$s]);
        return ['list' => array_map(function ($r) { $r['photos'] = parse_json($r['photos'], []); return $r; }, $rows), 'counts' => $counts];
    }
}

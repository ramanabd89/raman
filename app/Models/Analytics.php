<?php
namespace App\Models;

use App\Core\Auth;
use App\Core\Model;
use App\Core\RateLimiter;
use App\Core\Request;

/** Cookieless visitor analytics: a daily-rotating anonymous visitor id, no third parties. */
final class Analytics extends Model
{
    private const BOTS = '/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|headless/i';

    public static function track(Request $req): void
    {
        $k = "track:{$req->ip}";
        if (RateLimiter::failures($k) >= 120) return;
        RateLimiter::hit([$k]);
        $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
        if ($ua === '' || preg_match(self::BOTS, $ua) || ($req->user && Auth::isStaff($req->user['role']))) return;
        $secret = Setting::get('analytics_secret');
        if ($secret === '') { $secret = rand_hex(16); Setting::set('analytics_secret', $secret); }
        $day = gmdate('Y-m-d');
        $visitor = substr(hash('sha256', "$secret|$day|{$req->ip}|$ua"), 0, 16);
        self::run('INSERT INTO page_views(day, visitor, path, product_id, src, created_at) VALUES(?,?,?,?,?,?)',
            [$day, $visitor, tostr($req->body['path'] ?? '', 120), !empty($req->body['product_id']) ? toint($req->body['product_id']) : null, preg_replace('/[^\w\-.]/', '', tostr($req->body['src'] ?? '', 60)) ?: null, ms()]);
    }

    public static function report(int $days): array
    {
        $days = min(max($days, 1), 180);
        $since = gmdate('Y-m-d', time() - ($days - 1) * 86400);
        $daily = self::all('SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_views WHERE day >= ? GROUP BY day ORDER BY day', [$since]);
        $orders = [];
        foreach (self::all("SELECT SUBSTR(created_at, 1, 10) day, COUNT(*) n FROM orders WHERE SUBSTR(created_at, 1, 10) >= ? AND status != 'cancelled' GROUP BY 1", [$since]) as $r) $orders[$r['day']] = (int)$r['n'];
        $visitors = (int)self::val('SELECT COUNT(DISTINCT CONCAT(day, visitor)) FROM page_views WHERE day >= ?', [$since]);
        $total = array_sum($orders);
        return ['days' => $days,
            'daily' => array_map(fn($d) => $d + ['orders' => $orders[$d['day']] ?? 0], $daily),
            'totals' => ['views' => array_sum(array_column($daily, 'views')), 'visitors' => $visitors, 'orders' => $total, 'conversion' => $visitors ? round(($total / $visitors) * 1000) / 10 : 0],
            'top_products' => array_map(fn($r) => ['id' => $r['id'], 'name' => $r['name'], 'views' => (int)$r['views'], 'visitors' => (int)$r['visitors'], 'sold' => (int)$r['sold']], self::all("SELECT pv.product_id id, p.name_ku name, COUNT(*) views, COUNT(DISTINCT CONCAT(pv.day, pv.visitor)) visitors,
                (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = pv.product_id AND SUBSTR(o.created_at,1,10) >= ? AND o.status != 'cancelled') sold
                FROM page_views pv JOIN products p ON p.id = pv.product_id WHERE pv.day >= ? GROUP BY pv.product_id, p.name_ku ORDER BY views DESC LIMIT 15", [$since, $since])),
            'sources' => self::all("SELECT COALESCE(src, 'direct') src, COUNT(DISTINCT CONCAT(day, visitor)) visitors FROM page_views WHERE day >= ? GROUP BY 1 ORDER BY 2 DESC LIMIT 10", [$since]),
            'pages' => self::all('SELECT path, COUNT(*) views FROM page_views WHERE day >= ? GROUP BY path ORDER BY 2 DESC LIMIT 10', [$since])];
    }

    public static function prune(): void { self::run('DELETE FROM page_views WHERE day < ?', [gmdate('Y-m-d', time() - 180 * 86400)]); }
}

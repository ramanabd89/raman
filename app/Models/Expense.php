<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/** Shop expenses and the profit & loss report. */
final class Expense extends Model
{
    public const CATEGORIES = ['rent', 'salaries', 'ads', 'delivery', 'utilities', 'stock_purchase', 'other'];

    public static function month(string $m): array { return self::all('SELECT * FROM expenses WHERE SUBSTR(date, 1, 7) = ? ORDER BY date DESC, id DESC', [$m]); }
    public static function find(int $id): ?array { return self::one('SELECT * FROM expenses WHERE id = ?', [$id]); }
    public static function add(array $b, string $by): int
    {
        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['date'] ?? '')) ? $b['date'] : gmdate('Y-m-d');
        $cat = in_array($b['category'] ?? '', self::CATEGORIES, true) ? $b['category'] : 'other';
        $amount = max(0, toint($b['amount'] ?? 0));
        if (!$amount) throw new HttpException(422, 'invalid_input', ['fields' => ['amount']]);
        self::run('INSERT INTO expenses(date, category, amount, note, created_by, created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())', [$date, $cat, $amount, tostr($b['note'] ?? '', 300), $by]);
        return self::lastId();
    }
    public static function remove(int $id): void { self::run('DELETE FROM expenses WHERE id = ?', [$id]); }

    /**
     * P&L for [from, to] (dates, inclusive): sales after bundle deal and coupons − cost of goods − wallet/cashback
     * spent − expenses + repair revenue − repair parts. Delivery fees are shown but not counted (they go to the courier).
     */
    public static function profit(string $from, string $to, string $label): array
    {
        $range = [$from . ' 00:00:00', $to . ' 23:59:59'];
        $o = self::one("SELECT COUNT(*) orders, COALESCE(SUM(subtotal - discount - bundle_discount), 0) sales, COALESCE(SUM(wallet_used), 0) wallet, COALESCE(SUM(delivery_fee), 0) delivery, COALESCE(SUM(bundle_discount), 0) bundle
            FROM orders WHERE status = 'delivered' AND updated_at BETWEEN ? AND ?", $range);
        $c = self::one("SELECT COALESCE(SUM(CASE WHEN oi.cost IS NOT NULL THEN oi.cost * oi.qty END), 0) cogs, COALESCE(SUM(CASE WHEN oi.cost IS NULL THEN 1 END), 0) missing
            FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'delivered' AND o.updated_at BETWEEN ? AND ?", $range);
        $ex = (int)self::val('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date BETWEEN ? AND ?', [$from, $to]);
        $rp = self::one("SELECT COUNT(*) n, COALESCE(SUM(COALESCE(final_price, quoted_price + approved_extra)), 0) revenue, COALESCE(SUM(parts_cost), 0) parts FROM repairs WHERE status = 'delivered' AND updated_at BETWEEN ? AND ?", $range);
        $byCat = array_map(fn($r) => ['category' => $r['category'], 'amount' => (int)$r['amount']], self::all('SELECT category, SUM(amount) amount FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY 2 DESC', [$from, $to]));
        $sales = (int)$o['sales']; $cogs = (int)$c['cogs']; $wallet = (int)$o['wallet'];
        return ['month' => $label, 'from' => $from, 'to' => $to, 'orders' => (int)$o['orders'], 'sales' => $sales, 'bundle_discount' => (int)$o['bundle'], 'delivery' => (int)$o['delivery'], 'wallet' => $wallet,
            'cogs' => $cogs, 'missing_cost' => (int)$c['missing'], 'gross' => $sales - $cogs, 'expenses' => $ex, 'expenses_by_cat' => $byCat,
            'repairs' => (int)$rp['n'], 'repair_revenue' => (int)$rp['revenue'], 'repair_parts' => (int)$rp['parts'],
            'net' => $sales - $cogs - $wallet - $ex + (int)$rp['revenue'] - (int)$rp['parts']];
    }
}

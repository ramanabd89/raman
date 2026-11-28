<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/** Trade-in: models price list, condition rules, quote (rounded down to 5,000 IQD), technician review at delivery. */
final class TradeIn extends Model
{
    public const QUESTIONS = ['screen' => ['perfect', 'scratches', 'cracked'], 'body' => ['perfect', 'scratches', 'damaged'], 'battery' => ['good', 'ok', 'weak'], 'works' => ['yes', 'no'], 'box' => ['yes', 'no']];
    private const MAX_DEDUCTION = 80; // a phone that turns on is never worth less than 20% of its base price

    private static function n($x) { return $x == (int)$x ? (int)$x : $x; }

    public static function quote($modelId, $answers): array
    {
        $m = self::one('SELECT * FROM tradein_models WHERE id = ? AND active = 1', [toint($modelId)]);
        if (!$m) return ['error' => 'tradein_model'];
        $rules = parse_json(Setting::get('tradein_rules', '{}'), []);
        $clean = []; $pct = 0; $breakdown = [];
        foreach (self::QUESTIONS as $q => $opts) {
            $a = is_array($answers) ? ($answers[$q] ?? null) : null;
            if (!in_array($a, $opts, true)) return ['error' => 'tradein_answers'];
            $clean[$q] = $a;
            $d = num($rules[$q][$a] ?? 0);
            if ($d) $breakdown[] = ['q' => $q, 'a' => $a, 'pct' => self::n($d)];
            $pct += $d;
        }
        $pct = min($pct, self::MAX_DEDUCTION);
        $value = round($m['base_price'] * (100 - $pct)) / 100;     // integer maths: no 5,000 IQD lost to rounding
        $estimate = max(0, (int)(floor(($value + 1e-6) / 5000) * 5000));
        return ['model' => $m, 'answers' => $clean, 'estimate' => $estimate, 'deduction_pct' => self::n($pct), 'breakdown' => $breakdown, 'label' => "{$m['brand']} {$m['model']} {$m['storage_gb']}GB"];
    }

    public static function models(bool $all = false): array
    {
        return $all ? self::all('SELECT * FROM tradein_models ORDER BY brand, sort, model, storage_gb')
            : self::all('SELECT id, brand, model, storage_gb FROM tradein_models WHERE active = 1 ORDER BY brand, sort, model, storage_gb');
    }
    public static function modelValues(array $b): array
    {
        $v = ['brand' => tostr($b['brand'] ?? '', 40), 'model' => tostr($b['model'] ?? '', 80), 'storage_gb' => max(1, toint($b['storage_gb'] ?? 0)), 'base_price' => max(0, toint($b['base_price'] ?? 0)),
            'active' => array_key_exists('active', $b) && ($b['active'] === false || $b['active'] === 0) ? 0 : 1, 'sort' => toint($b['sort'] ?? 0)];
        if ($v['brand'] === '' || $v['model'] === '' || !$v['base_price']) throw new HttpException(422, 'invalid_input');
        return $v;
    }
    public static function saveRules(array $rules): array
    {
        $out = [];
        foreach (self::QUESTIONS as $q => $opts) { $out[$q] = []; foreach ($opts as $o) $out[$q][$o] = self::n(max(0, min(90, num($rules[$q][$o] ?? 0)))); }
        Setting::set('tradein_rules', json_enc($out));
        return $out;
    }
    public static function adminList(): array
    {
        return array_map(function ($t) { $t['answers'] = obj(parse_json($t['answers'] ?: '{}', [])); return $t; },
            self::all('SELECT t.*, o.status order_status, o.customer_name, o.phone, o.city, o.total order_total FROM tradeins t LEFT JOIN orders o ON o.id = t.order_id ORDER BY t.id DESC LIMIT 300'));
    }
    /**
     * An accepted trade-in becomes a hidden draft "used phone" product (brand/model/storage, grade and box from the answers,
     * price = trade-in value + 20% rounded to 5,000 IQD) for the owner to check, photograph and publish.
     */
    public static function listAsUsed(int $id): int
    {
        $t = self::one('SELECT t.*, m.brand, m.model, m.storage_gb FROM tradeins t LEFT JOIN tradein_models m ON m.id = t.model_id WHERE t.id = ?', [$id]);
        if (!$t) throw new HttpException(404, 'not_found');
        if (!in_array($t['status'], ['accepted', 'adjusted'], true)) throw new HttpException(422, 'tradein_not_accepted');
        if ($t['listed_product_id'] && self::one('SELECT 1 FROM products WHERE id = ?', [$t['listed_product_id']])) return (int)$t['listed_product_id'];
        $a = parse_json($t['answers'] ?: '{}', []);
        $grade = ($a['screen'] ?? '') === 'cracked' || ($a['body'] ?? '') === 'damaged' || ($a['works'] ?? '') === 'no' ? 'C'
            : (($a['screen'] ?? '') === 'scratches' || ($a['body'] ?? '') === 'scratches' ? 'B' : (($a['battery'] ?? '') === 'good' ? 'A+' : 'A'));
        $battery = ['good' => 88, 'ok' => 82, 'weak' => 76][$a['battery'] ?? ''] ?? null;
        $brand = (string)($t['brand'] ?? ''); $model = (string)($t['model'] ?? ''); $gb = (int)($t['storage_gb'] ?? 0);
        $name = trim($model !== '' ? ($brand !== '' && stripos($model, $brand) === false && $brand !== 'Apple' ? "$brand $model" : $model) . ($gb ? " {$gb}GB" : '') : $t['label']);
        $value = (int)($t['final_value'] ?: $t['estimate']);
        $price = max(5000, (int)(ceil($value * 1.2 / 5000) * 5000));
        $os = stripos($brand . $model, 'iphone') !== false || strcasecmp($brand, 'Apple') === 0 ? 'ios' : 'android';
        $cat = self::val("SELECT p.category_id FROM products p WHERE JSON_EXTRACT(p.attrs, '$.os') IS NOT NULL AND p.category_id IS NOT NULL GROUP BY p.category_id ORDER BY COUNT(*) DESC LIMIT 1");
        return self::tx(function () use ($t, $name, $brand, $price, $value, $grade, $battery, $a, $gb, $os, $cat) {
            self::run('INSERT INTO products(category_id, name_ku, name_ar, name_en, brand, price, stock, active, cost_price, attrs, is_used, condition_grade, battery_health, has_box, has_charger, used_warranty_days, created_at)
                VALUES(?,?,?,?,?,?,1,0,?,?,1,?,?,?,?,30,UTC_TIMESTAMP())',
                [$cat ?: null, $name, $name, $name, $brand ?: null, $price, $value, json_enc(['os' => $os, 'tier' => 'mid', 'storage' => $gb]), $grade, $battery,
                    ($a['box'] ?? '') === 'yes' ? 1 : 0, ($a['box'] ?? '') === 'yes' ? 1 : 0]);
            $pid = self::lastId();
            self::run('UPDATE tradeins SET listed_product_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [$pid, $t['id']]);
            Product::index($pid);
            StockMovement::record($pid, null, 1, 'tradein', 'tradein #' . $t['id']);
            return $pid;
        });
    }

    /** accepted / adjusted / rejected after inspection; the order total follows. Credit never exceeds what the products cost. */
    public static function review(int $id, string $status, $finalValue, string $imei, string $note): array
    {
        $t = self::one('SELECT * FROM tradeins WHERE id = ?', [$id]);
        if (!$t) throw new HttpException(404, 'not_found');
        if (!in_array($status, ['accepted', 'adjusted', 'rejected'], true)) throw new HttpException(422, 'invalid_input');
        $o = $t['order_id'] ? Order::find((int)$t['order_id']) : null;
        $final = $status === 'rejected' ? 0 : ($status === 'accepted' ? (int)$t['estimate'] : max(0, toint($finalValue)));
        if ($o) $final = min($final, $o['subtotal'] - $o['bundle_discount'] - $o['discount']);
        self::tx(function () use ($t, $o, $status, $final, $imei, $note) {
            self::run('UPDATE tradeins SET status = ?, final_value = ?, imei = COALESCE(?, imei), note = COALESCE(?, note), updated_at = UTC_TIMESTAMP() WHERE id = ?', [$status, $final, $imei ?: null, $note ?: null, $t['id']]);
            if ($o) self::run('UPDATE orders SET tradein_credit = ?, total = total + ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [$final, $o['tradein_credit'] - $final, $o['id']]);
        });
        return ['t' => $t, 'final' => $final];
    }
}

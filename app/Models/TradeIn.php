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

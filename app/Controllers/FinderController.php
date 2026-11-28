<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Models\Product;
use App\Services\AccessoryService;

/**
 * "Help me choose": scores in-stock phones by budget, OS, storage and what the customer uses the phone for.
 * "Accessories for my phone": phone models list + accessories that fit one model.
 */
final class FinderController extends Controller
{
    public function accessoryModels(): array { return AccessoryService::models(); }

    public function accessoriesByModel(): array
    {
        $cat = (string)$this->qs('category', '');
        $type = in_array($cat, AccessoryService::TYPES, true) ? $cat : (in_array($this->qs('type', ''), AccessoryService::TYPES, true) ? (string)$this->qs('type') : '');
        return AccessoryService::byModel((string)$this->qs('brand', ''), (string)$this->qs('model', ''), $type, ctype_digit($cat) ? (int)$cat : 0);
    }

    private const USES = ['camera', 'battery', 'gaming', 'social', 'basic'];
    private const TIER = ['flagship' => 1, 'upper' => 0.75, 'mid' => 0.5, 'entry' => 0.25];

    private static function clamp(float $x): float { return max(0.0, min(1.0, $x)); }

    private static function score(array $a, array $uses): float
    {
        $tier = self::TIER[$a['tier'] ?? ''] ?? 0.4;
        $cam = self::clamp((log(max(($a['camera'] ?? 0) ?: 12, 8), 2) - 3) / (log(200, 2) - 3)); // 8MP→0, 200MP→1
        $bat = self::clamp(((($a['battery'] ?? 0) ?: 3000) - 3000) / 2500);
        $ram = self::clamp(((($a['ram'] ?? 0) ?: 4) - 3) / 9);
        $chg = self::clamp(((($a['charging'] ?? 0) ?: 15) - 15) / 60);
        $parts = ['camera' => 0.55 * $cam + 0.45 * $tier, 'battery' => 0.75 * $bat + 0.25 * $chg, 'gaming' => 0.55 * $tier + 0.45 * $ram,
            'social' => 0.4 * $cam + 0.35 * $bat + 0.25 * $tier, 'basic' => 0.6 * $bat + 0.4 * (1 - $tier * 0.5)];
        $chosen = $uses ?: ['social'];
        return array_sum(array_map(fn($u) => $parts[$u], $chosen)) / count($chosen);
    }

    private static function reasons(array $a, array $uses, int $price, ?int $max): array
    {
        $r = []; $in = fn($u) => in_array($u, $uses, true);
        if (($a['tier'] ?? '') === 'flagship') $r[] = ['code' => 'flagship'];
        if (($in('camera') || $in('social')) && ($a['camera'] ?? 0) >= 48) $r[] = ['code' => 'camera', 'x' => $a['camera']];
        if (($in('battery') || $in('basic') || $in('social')) && ($a['battery'] ?? 0) >= 4500) $r[] = ['code' => 'battery', 'x' => $a['battery']];
        if ($in('gaming') && ($a['ram'] ?? 0) >= 8) $r[] = ['code' => 'gaming', 'x' => $a['ram']];
        if (($a['charging'] ?? 0) >= 45) $r[] = ['code' => 'charging', 'x' => $a['charging']];
        if (!empty($a['g5'])) $r[] = ['code' => 'g5'];
        if ($max && $price <= $max * 0.8) $r[] = ['code' => 'under_budget', 'x' => $max - $price];
        return array_slice($r, 0, 4);
    }

    public function find(): array
    {
        $min = max(0, toint($this->qs('min', 0)));
        $max = toint($this->qs('max', 0)) > 0 ? toint($this->qs('max')) : PHP_INT_MAX;
        $os = in_array($this->qs('os', ''), ['ios', 'android'], true) ? $this->qs('os') : null;
        $uses = array_values(array_filter(explode(',', (string)$this->qs('uses', '')), fn($u) => in_array($u, self::USES, true)));
        $storageMin = max(0, toint($this->qs('storage', 0)));
        $cands = [];
        foreach (Product::all('SELECT p.*, ' . Product::VARIANT_COUNT . " FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.attrs != '{}'") as $p) {
            $a = parse_json($p['attrs'], null);
            if (!is_array($a) || empty($a['os']) || ($os && $a['os'] !== $os)) continue;
            $vs = array_values(array_filter(Product::variants((int)$p['id']), fn($v) => $v['stock'] > 0));
            $opts = $vs ? array_map(function ($v) use ($a) {
                $st = preg_match('/(\d+)\s*(GB|TB)/i', $v['label'], $m) ? (int)$m[1] * (stripos($v['label'], 'TB') !== false ? 1024 : 1) : 0;
                return ['price' => $v['price'], 'variant' => $v, 'storage' => $st ?: ($a['storage'] ?? 0)];
            }, $vs) : [['price' => $p['price'], 'variant' => null, 'storage' => $a['storage'] ?? 0]];
            $fits = array_values(array_filter($opts, fn($o) => !$storageMin || $o['storage'] >= $storageMin));
            usort($fits, fn($x, $y) => $x['price'] <=> $y['price']);
            if (!$fits) continue;
            $best = null; foreach ($fits as $o) if ($o['price'] >= $min && $o['price'] <= $max) { $best = $o; break; }
            $best = $best ?? $fits[0];
            $cands[] = ['p' => $p, 'a' => $a] + $best + ['inBudget' => $best['price'] >= $min && $best['price'] <= $max, 'quality' => self::score($a, $uses)];
        }
        $inB = array_values(array_filter($cands, fn($c) => $c['inBudget']));
        $maxQ = $inB ? max(0.01, ...array_column($inB, 'quality')) : 0.01;
        $minP = $inB ? min(array_column($inB, 'price')) : PHP_INT_MAX;
        foreach ($inB as &$c) {
            $boost = (in_array('basic', $uses, true) ? 0.25 : 0.1) * ($minP / $c['price']);
            $c['match'] = (int)round(min(99, (($c['quality'] / $maxQ) * 0.85 + $boost) * 100));
        } unset($c);
        usort($inB, fn($x, $y) => $y['match'] <=> $x['match']);
        $ranked = array_slice($inB, 0, 3);
        $budget = $max !== PHP_INT_MAX ? $max : null;
        $out = fn($c, $extra = []) => ['product' => Product::out($c['p']), 'variant' => $c['variant'] ? Product::publicVariant($c['variant']) : null, 'price' => $c['price'],
            'match' => $c['match'] ?? null, 'attrs' => obj($c['a']), 'reasons' => self::reasons($c['a'], $uses, (int)$c['price'], $budget)] + $extra;
        $stretch = null;
        if (!$ranked && $budget) { // nothing in budget: the closest phone just above it
            $above = array_values(array_filter($cands, fn($c) => $c['price'] > $max));
            usort($above, fn($x, $y) => $x['price'] <=> $y['price']);
            if ($above) $stretch = $out(['match' => null] + $above[0], ['over_by' => $above[0]['price'] - $max]);
        }
        $cheap = null; foreach ($ranked as $i => $c) if ($cheap === null || $c['price'] < $ranked[$cheap]['price']) $cheap = $i;
        $results = [];
        foreach ($ranked as $i => $c) $results[] = $out($c, ['best' => $i === 0, 'best_value' => $i === $cheap && count($ranked) > 1 && $i !== 0]);
        return ['results' => $results, 'stretch' => $stretch];
    }
}

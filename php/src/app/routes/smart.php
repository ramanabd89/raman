<?php
// Trade-in ("swap your old phone") and the phone finder ("help me choose").

const TRADEIN_QUESTIONS = ['screen' => ['perfect', 'scratches', 'cracked'], 'body' => ['perfect', 'scratches', 'damaged'], 'battery' => ['good', 'ok', 'weak'], 'works' => ['yes', 'no'], 'box' => ['yes', 'no']];

/** Base price × (1 − deductions), max 80% off, rounded down to 5,000 IQD. */
function quote_tradein(array $s, $modelId, $answers): array {
    $m = one('SELECT * FROM tradein_models WHERE id = ? AND active = 1', [toint($modelId)]);
    if (!$m) return ['error' => 'tradein_model'];
    $rules = parse_json($s['tradein_rules'] ?? '{}', []);
    $clean = []; $pct = 0; $breakdown = [];
    foreach (TRADEIN_QUESTIONS as $q => $opts) {
        $a = is_array($answers) ? ($answers[$q] ?? null) : null;
        if (!in_array($a, $opts, true)) return ['error' => 'tradein_answers'];
        $clean[$q] = $a;
        $d = num($rules[$q][$a] ?? 0);
        if ($d) $breakdown[] = ['q' => $q, 'a' => $a, 'pct' => $d == (int)$d ? (int)$d : $d];
        $pct += $d;
    }
    $pct = min($pct, 80);
    $value = round($m['base_price'] * (100 - $pct)) / 100;
    $estimate = max(0, (int)(floor(($value + 1e-6) / 5000) * 5000));
    return ['model' => $m, 'answers' => $clean, 'estimate' => $estimate, 'deduction_pct' => $pct == (int)$pct ? (int)$pct : $pct, 'breakdown' => $breakdown, 'label' => "{$m['brand']} {$m['model']} {$m['storage_gb']}GB"];
}

route('GET', '/api/tradein/models', function () {
    if ((settings()['tradein_enabled'] ?? '') !== '1') return ['enabled' => false, 'models' => []];
    return ['enabled' => true, 'models' => all('SELECT id, brand, model, storage_gb FROM tradein_models WHERE active = 1 ORDER BY brand, sort, model, storage_gb')];
});
route('POST', '/api/tradein/quote', function (Req $req) {
    $s = settings();
    if (($s['tradein_enabled'] ?? '') !== '1') fail(400, 'tradein_disabled');
    $q = quote_tradein($s, $req->body['model_id'] ?? 0, $req->body['answers'] ?? []);
    if (!empty($q['error'])) fail(400, $q['error']);
    return ['estimate' => $q['estimate'], 'label' => $q['label'], 'deduction_pct' => $q['deduction_pct'], 'breakdown' => $q['breakdown']];
});

route('GET', '/api/admin/tradein-models', fn() => all('SELECT * FROM tradein_models ORDER BY brand, sort, model, storage_gb'));
function tradein_model_values(array $b): array {
    $v = ['brand' => tostr($b['brand'] ?? '', 40), 'model' => tostr($b['model'] ?? '', 80), 'storage_gb' => max(1, toint($b['storage_gb'] ?? 0)), 'base_price' => max(0, toint($b['base_price'] ?? 0)),
        'active' => array_key_exists('active', $b) && ($b['active'] === false || $b['active'] === 0) ? 0 : 1, 'sort' => toint($b['sort'] ?? 0)];
    if ($v['brand'] === '' || $v['model'] === '' || !$v['base_price']) fail(400, 'invalid_input');
    return $v;
}
route('POST', '/api/admin/tradein-models', function (Req $req) {
    $v = tradein_model_values($req->body);
    run('INSERT INTO tradein_models(brand, model, storage_gb, base_price, active, sort) VALUES(?,?,?,?,?,?)', array_values($v));
    $id = last_id();
    log_admin($req, 'tradein_model', ['id' => $id] + $v);
    return one('SELECT * FROM tradein_models WHERE id = ?', [$id]);
});
route('PUT', '/api/admin/tradein-models/:id', function (Req $req) {
    $v = tradein_model_values($req->body); $id = toint($req->params['id']);
    $before = one('SELECT base_price FROM tradein_models WHERE id = ?', [$id]);
    run('UPDATE tradein_models SET brand=?, model=?, storage_gb=?, base_price=?, active=?, sort=? WHERE id=?', array_merge(array_values($v), [$id]));
    if ($before && $before['base_price'] !== $v['base_price']) log_admin($req, 'tradein_model', ['id' => $id, 'price' => [$before['base_price'], $v['base_price']]]);
    return one('SELECT * FROM tradein_models WHERE id = ?', [$id]);
});
route('DELETE', '/api/admin/tradein-models/:id', function (Req $req) { run('DELETE FROM tradein_models WHERE id = ?', [toint($req->params['id'])]); return ['ok' => true]; });
route('PUT', '/api/admin/tradein-rules', function (Req $req) {
    $out = [];
    foreach (TRADEIN_QUESTIONS as $q => $opts) { $out[$q] = []; foreach ($opts as $o) { $x = max(0, min(90, num($req->body['rules'][$q][$o] ?? 0))); $out[$q][$o] = $x == (int)$x ? (int)$x : $x; } }
    set_setting('tradein_rules', json_encode($out));
    if (isset($req->body['enabled'])) set_setting('tradein_enabled', $req->body['enabled'] ? '1' : '0');
    log_admin($req, 'tradein_rules', $out);
    return ['rules' => $out, 'enabled' => (settings()['tradein_enabled'] ?? '') === '1'];
});
route('GET', '/api/admin/tradeins', fn() => array_map(function ($t) { $t['answers'] = obj(parse_json($t['answers'] ?: '{}', [])); return $t; },
    all('SELECT t.*, o.status order_status, o.customer_name, o.phone, o.city, o.total order_total FROM tradeins t LEFT JOIN orders o ON o.id = t.order_id ORDER BY t.id DESC LIMIT 300')));
route('PUT', '/api/admin/tradeins/:id', function (Req $req) {
    $t = one('SELECT * FROM tradeins WHERE id = ?', [toint($req->params['id'])]);
    if (!$t) fail(404, 'not_found');
    $status = in_array($req->body['status'] ?? '', ['accepted', 'adjusted', 'rejected'], true) ? $req->body['status'] : null;
    if (!$status) fail(400, 'invalid_input');
    $o = $t['order_id'] ? one('SELECT * FROM orders WHERE id = ?', [$t['order_id']]) : null;
    $final = $status === 'rejected' ? 0 : ($status === 'accepted' ? (int)$t['estimate'] : max(0, toint($req->body['final_value'] ?? 0)));
    if ($o) $final = min($final, $o['subtotal'] - $o['discount']);
    tx(function () use ($t, $o, $status, $final, $req) {
        run('UPDATE tradeins SET status = ?, final_value = ?, imei = COALESCE(?, imei), note = COALESCE(?, note), updated_at = UTC_TIMESTAMP() WHERE id = ?',
            [$status, $final, tostr($req->body['imei'] ?? '', 20) ?: null, tostr($req->body['note'] ?? '', 300) ?: null, $t['id']]);
        if ($o) run('UPDATE orders SET tradein_credit = ?, total = total + ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [$final, $o['tradein_credit'] - $final, $o['id']]);
    });
    log_admin($req, 'tradein_review', ['id' => $t['id'], 'order' => $t['order_id'], 'status' => $status, 'estimate' => $t['estimate'], 'final' => $final]);
    return ['ok' => true, 'final_value' => $final];
});

// ---------- phone finder ----------
function clamp01(float $x): float { return max(0.0, min(1.0, $x)); }
function phone_score(array $a, array $uses): float {
    $tier = ['flagship' => 1, 'upper' => 0.75, 'mid' => 0.5, 'entry' => 0.25][$a['tier'] ?? ''] ?? 0.4;
    $cam = clamp01((log(max(($a['camera'] ?? 0) ?: 12, 8), 2) - 3) / (log(200, 2) - 3));
    $bat = clamp01(((($a['battery'] ?? 0) ?: 3000) - 3000) / 2500);
    $ram = clamp01(((($a['ram'] ?? 0) ?: 4) - 3) / 9);
    $chg = clamp01(((($a['charging'] ?? 0) ?: 15) - 15) / 60);
    $parts = ['camera' => 0.55 * $cam + 0.45 * $tier, 'battery' => 0.75 * $bat + 0.25 * $chg, 'gaming' => 0.55 * $tier + 0.45 * $ram,
        'social' => 0.4 * $cam + 0.35 * $bat + 0.25 * $tier, 'basic' => 0.6 * $bat + 0.4 * (1 - $tier * 0.5)];
    $chosen = $uses ?: ['social'];
    return array_sum(array_map(fn($u) => $parts[$u], $chosen)) / count($chosen);
}
function finder_reasons(array $a, array $uses, int $price, ?int $budgetMax): array {
    $r = []; $in = fn($u) => in_array($u, $uses, true);
    if (($a['tier'] ?? '') === 'flagship') $r[] = ['code' => 'flagship'];
    if (($in('camera') || $in('social')) && ($a['camera'] ?? 0) >= 48) $r[] = ['code' => 'camera', 'x' => $a['camera']];
    if (($in('battery') || $in('basic') || $in('social')) && ($a['battery'] ?? 0) >= 4500) $r[] = ['code' => 'battery', 'x' => $a['battery']];
    if ($in('gaming') && ($a['ram'] ?? 0) >= 8) $r[] = ['code' => 'gaming', 'x' => $a['ram']];
    if (($a['charging'] ?? 0) >= 45) $r[] = ['code' => 'charging', 'x' => $a['charging']];
    if (!empty($a['g5'])) $r[] = ['code' => 'g5'];
    if ($budgetMax && $price <= $budgetMax * 0.8) $r[] = ['code' => 'under_budget', 'x' => $budgetMax - $price];
    return array_slice($r, 0, 4);
}
route('GET', '/api/finder', function (Req $req) {
    $q = $req->query;
    $min = max(0, toint($q['min'] ?? 0));
    $max = toint($q['max'] ?? 0) > 0 ? toint($q['max']) : PHP_INT_MAX;
    $os = in_array($q['os'] ?? '', ['ios', 'android'], true) ? $q['os'] : null;
    $uses = array_values(array_filter(explode(',', (string)($q['uses'] ?? '')), fn($u) => in_array($u, ['camera', 'battery', 'gaming', 'social', 'basic'], true)));
    $storageMin = max(0, toint($q['storage'] ?? 0));
    $phones = all('SELECT p.*, ' . VARIANT_COUNT_SQL . " FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.attrs != '{}'");
    $cands = [];
    foreach ($phones as $p) {
        $a = parse_json($p['attrs'], null);
        if (!is_array($a) || empty($a['os']) || ($os && $a['os'] !== $os)) continue;
        $vs = array_values(array_filter(variants_of((int)$p['id']), fn($v) => $v['stock'] > 0));
        $opts = $vs ? array_map(function ($v) use ($a) {
            $st = preg_match('/(\d+)\s*(GB|TB)/i', $v['label'], $m) ? (int)$m[1] * (stripos($v['label'], 'TB') !== false ? 1024 : 1) : 0;
            return ['price' => $v['price'], 'variant' => $v, 'storage' => $st ?: ($a['storage'] ?? 0)];
        }, $vs) : [['price' => $p['price'], 'variant' => null, 'storage' => $a['storage'] ?? 0]];
        $fits = array_values(array_filter($opts, fn($o) => !$storageMin || $o['storage'] >= $storageMin));
        usort($fits, fn($x, $y) => $x['price'] <=> $y['price']);
        if (!$fits) continue;
        $best = null; foreach ($fits as $o) if ($o['price'] >= $min && $o['price'] <= $max) { $best = $o; break; }
        $best = $best ?? $fits[0];
        $cands[] = ['p' => $p, 'a' => $a] + $best + ['inBudget' => $best['price'] >= $min && $best['price'] <= $max, 'quality' => phone_score($a, $uses)];
    }
    $inB = array_values(array_filter($cands, fn($c) => $c['inBudget']));
    $maxQ = max(0.01, ...array_map(fn($c) => $c['quality'], $inB ?: [['quality' => 0.01]]));
    $minP = $inB ? min(array_column($inB, 'price')) : PHP_INT_MAX;
    foreach ($inB as &$c) {
        $boost = in_array('basic', $uses, true) ? 0.25 * ($minP / $c['price']) : 0.1 * ($minP / $c['price']);
        $c['match'] = (int)round(min(99, (($c['quality'] / $maxQ) * 0.85 + $boost) * 100));
    } unset($c);
    usort($inB, fn($x, $y) => $y['match'] <=> $x['match']);
    $ranked = array_slice($inB, 0, 3);
    $budget = $max !== PHP_INT_MAX ? $max : null;
    $out = fn($c, $extra = []) => ['product' => product_out($c['p']), 'variant' => $c['variant'] ? public_variant($c['variant']) : null, 'price' => $c['price'], 'match' => $c['match'] ?? null,
        'attrs' => obj($c['a']), 'reasons' => finder_reasons($c['a'], $uses, (int)$c['price'], $budget)] + $extra;
    $stretch = null;
    if (!$ranked && $budget) {
        $above = array_values(array_filter($cands, fn($c) => $c['price'] > $max));
        usort($above, fn($x, $y) => $x['price'] <=> $y['price']);
        if ($above) $stretch = $out(['match' => null] + $above[0], ['over_by' => $above[0]['price'] - $max]);
    }
    $cheapIdx = null; foreach ($ranked as $i => $c) if ($cheapIdx === null || $c['price'] < $ranked[$cheapIdx]['price']) $cheapIdx = $i;
    $results = [];
    foreach ($ranked as $i => $c) $results[] = $out($c, ['best' => $i === 0, 'best_value' => $i === $cheapIdx && count($ranked) > 1 && $i !== 0]);
    return ['results' => $results, 'stretch' => $stretch];
});

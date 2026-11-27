<?php
// Repair service: price list & honest advice, booking (walk-in slot or home pickup with an exact map pin),
// tracking with customer approval for any extra cost, comments, admin tickets, warranty certificates.

const REPAIR_STATUSES = ['booked', 'received', 'diagnosing', 'awaiting_approval', 'repairing', 'testing', 'ready', 'delivered', 'cancelled'];
const IRAQ_OFFSET = 3 * 3600; // Asia/Baghdad, no daylight saving
function iraq_now(): string { return gmdate('Y-m-d H:i', time() + IRAQ_OFFSET); }
function repair_map_url(array $r): string { return "https://www.google.com/maps/search/?api=1&query={$r['lat']},{$r['lng']}"; }
function repair_new_code(): string {
    $A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) { $c = 'R'; foreach (str_split(random_bytes(6)) as $b) $c .= $A[ord($b) % strlen($A)]; if (!one('SELECT 1 FROM repairs WHERE code = ?', [$c])) return $c; }
}
function repair_enabled(): bool { return (settings()['repair_enabled'] ?? '') === '1'; }
function repair_quote(string $brand, string $model, $serviceId): array {
    $svc = one('SELECT * FROM repair_services WHERE id = ? AND active = 1', [toint($serviceId)]);
    if (!$svc) fail(400, 'repair_service');
    $row = one('SELECT * FROM repair_prices WHERE service_id = ? AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?) AND active = 1', [$svc['id'], $brand, $model]);
    $opts = [];
    if (!$svc['needs_diagnosis'] && $row) {
        if ($row['price_original']) $opts[] = ['quality' => 'original', 'price' => $row['price_original'], 'warranty_days' => $row['warranty_original']];
        if ($row['price_copy']) $opts[] = ['quality' => 'copy', 'price' => $row['price_copy'], 'warranty_days' => $row['warranty_copy']];
    }
    if (!$opts) $opts[] = ['quality' => 'diagnosis', 'price' => 0, 'warranty_days' => $row ? $row['warranty_original'] : 90];
    $s = settings();
    $value = val('SELECT MAX(base_price) FROM tradein_models WHERE active = 1 AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)', [$brand, $model]) ?: null;
    $prices = array_filter(array_column($opts, 'price'));
    $cheapest = $prices ? min($prices) : null;
    $advice = $value && $cheapest !== null && $cheapest > ($value * toint($s['repair_honest_pct'] ?? 50, 50)) / 100 ? ['phone_value' => $value, 'repair_price' => $cheapest] : null;
    return ['service' => $svc, 'options' => $opts, 'duration_min' => $row ? $row['duration_min'] : null, 'advice' => $advice];
}
function repair_slots(string $date): array {
    $s = settings();
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return [];
    [$y, $m, $d] = array_map('intval', explode('-', $date));
    $dow = (int)gmdate('w', gmmktime(0, 0, 0, $m, $d, $y));
    $closed = array_map('intval', array_filter(array_map('trim', explode(',', (string)($s['repair_closed_days'] ?? ''))), fn($x) => $x !== ''));
    if (in_array($dow, $closed, true)) return [];
    $now = iraq_now(); $cap = max(1, toint($s['repair_slot_capacity'] ?? 2, 2)); $out = [];
    for ($hr = toint($s['repair_open'] ?? 10, 10); $hr < toint($s['repair_close'] ?? 21, 21); $hr++) {
        $slot = sprintf('%s %02d:00', $date, $hr);
        if (strcmp($slot, $now) <= 0) continue;
        $taken = (int)val("SELECT COUNT(*) FROM repairs WHERE appointment = ? AND status != 'cancelled'", [$slot]);
        $out[] = ['slot' => $slot, 'time' => substr($slot, 11), 'free' => max(0, $cap - $taken)];
    }
    return $out;
}
function repair_out(?array $r, bool $forCustomer = true): ?array {
    if (!$r) return $r;
    $r['photos'] = parse_json($r['photos'] ?? '[]', []);
    $r['old_part_returned'] = (bool)$r['old_part_returned'];
    $svc = $r['service_id'] ? one('SELECT name_ku, name_ar, name_en FROM repair_services WHERE id = ?', [$r['service_id']]) : null;
    $r['service'] = $svc ?: ['name_ku' => $r['service_label']];
    $r['events'] = all('SELECT status, note, created_at FROM repair_events WHERE repair_id = ? ORDER BY id', [$r['id']]);
    $r['comments'] = all('SELECT id, author, name, body, created_at FROM repair_comments WHERE repair_id = ? ORDER BY id', [$r['id']]);
    $r['map_url'] = $r['lat'] !== null ? repair_map_url($r) : null;
    $r['total'] = ($r['final_price'] ?? ($r['quoted_price'] + $r['approved_extra'])) + $r['pickup_fee'];
    if ($forCustomer) unset($r['parts_cost'], $r['technician']);
    return $r;
}
function repair_of_user(Req $req): array {
    $r = one('SELECT * FROM repairs WHERE code = ? AND user_id = ?', [strtoupper(tostr($req->params['code'], 12)), $req->user['id']]);
    if (!$r) fail(404, 'not_found');
    return $r;
}

route('GET', '/api/repair/catalog', function () {
    $s = settings();
    if (!repair_enabled()) return ['enabled' => false];
    return ['enabled' => true, 'services' => all('SELECT * FROM repair_services WHERE active = 1 ORDER BY sort, id'),
        'models' => all('SELECT DISTINCT brand, model FROM repair_prices WHERE active = 1 ORDER BY brand, model'),
        'pickup' => ($s['repair_pickup'] ?? '') === '1', 'pickup_fee' => toint($s['repair_pickup_fee'] ?? 0), 'free_diagnosis' => ($s['repair_free_diagnosis'] ?? '') === '1',
        'from_price' => val('SELECT MIN(p) FROM (SELECT price_copy p FROM repair_prices WHERE active = 1 AND price_copy > 0 UNION ALL SELECT price_original FROM repair_prices WHERE active = 1 AND price_original > 0) x') ?: null,
        'fastest_min' => val('SELECT MIN(duration_min) FROM repair_prices WHERE active = 1') ?: null];
});
route('GET', '/api/repair/quote', function (Req $req) {
    if (!repair_enabled()) fail(400, 'repair_disabled');
    $q = repair_quote(tostr($req->query['brand'] ?? '', 40), tostr($req->query['model'] ?? '', 80), $req->query['service'] ?? 0);
    return ['options' => $q['options'], 'duration_min' => $q['duration_min'], 'advice' => $q['advice'], 'needs_diagnosis' => (bool)$q['service']['needs_diagnosis']];
});
route('GET', '/api/repair/slots', fn(Req $req) => repair_slots((string)($req->query['date'] ?? '')));

route('POST', '/api/repairs', function (Req $req) {
    if (!repair_enabled()) fail(400, 'repair_disabled');
    $s = settings(); $b = $req->body;
    $brand = tostr($b['brand'] ?? '', 40); $model = tostr($b['model'] ?? '', 80);
    $q = repair_quote($brand, $model, $b['service_id'] ?? 0);
    $opt = null; foreach ($q['options'] as $o) if ($o['quality'] === ($b['quality'] ?? null)) $opt = $o;
    if (!$opt && count($q['options']) === 1) $opt = $q['options'][0];
    if (!$opt) fail(400, 'repair_quality');
    $method = ($b['method'] ?? '') === 'pickup' ? 'pickup' : 'walkin';
    $appointment = null; $city = null; $address = null; $lat = null; $lng = null; $acc = null;
    if ($method === 'walkin') {
        $appointment = tostr($b['appointment'] ?? '', 16);
        $slot = null; foreach (repair_slots(substr($appointment, 0, 10)) as $x) if ($x['slot'] === $appointment) $slot = $x;
        if (!$slot || $slot['free'] < 1) fail(400, 'repair_slot');
    } else {
        if (($s['repair_pickup'] ?? '') !== '1') fail(400, 'repair_pickup');
        $city = tostr($b['city'] ?? '', 60); $address = tostr($b['address'] ?? '', 300);
        if ($city === '' || $address === '') fail(400, 'invalid_input');
        $lat = is_numeric($b['lat'] ?? null) ? (float)$b['lat'] : null; $lng = is_numeric($b['lng'] ?? null) ? (float)$b['lng'] : null;
        if (!($lat !== null && $lng !== null && $lat >= 29 && $lat <= 37.5 && $lng >= 38.7 && $lng <= 48.8)) fail(400, 'repair_location');
        $lat = round($lat * 1e6) / 1e6; $lng = round($lng * 1e6) / 1e6;
        $acc = isset($b['loc_accuracy']) && $b['loc_accuracy'] !== '' ? min(max(toint($b['loc_accuracy']), 0), 100000) : null;
    }
    $svcName = $q['service']['name_ku'];
    $code = repair_new_code();
    $id = tx(function () use ($req, $b, $code, $brand, $model, $q, $svcName, $opt, $method, $s, $appointment, $city, $address, $lat, $lng, $acc) {
        run('INSERT INTO repairs(code, user_id, customer_name, phone, brand, model, service_id, service_label, quality, quoted_price, pickup_fee, warranty_days, method, appointment, city, address, imei, problem, lat, lng, loc_accuracy, pickup_note, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
            [$code, $req->user['id'], tostr($b['name'] ?? '', 80) ?: $req->user['name'], preg_replace('/[^\d+]/', '', tostr($b['phone'] ?? '', 20)) ?: $req->user['phone'], $brand, $model,
             $q['service']['id'], $svcName, $opt['quality'], $opt['price'], $method === 'pickup' ? toint($s['repair_pickup_fee'] ?? 0) : 0, $opt['warranty_days'],
             $method, $appointment, $city, $address, tostr($b['imei'] ?? '', 20) ?: null, tostr($b['problem'] ?? '', 1000) ?: null, $lat, $lng, $acc, $method === 'pickup' ? (tostr($b['pickup_note'] ?? '', 300) ?: null) : null]);
        $rid = last_id();
        run("INSERT INTO repair_events(repair_id, status, by_name, created_at) VALUES(?, 'booked', ?, UTC_TIMESTAMP())", [$rid, $req->user['name']]);
        return $rid;
    });
    $r = one('SELECT * FROM repairs WHERE id = ?', [$id]);
    notify(implode("\n", array_filter(["🔧 <b>حجز تصليح {$r['code']}</b>", '👤 ' . tg_esc($r['customer_name']) . ' — 📞 ' . tg_esc($r['phone']), '📱 ' . tg_esc("{$r['brand']} {$r['model']}") . ' — ' . tg_esc($svcName),
        '💰 ' . ($r['quality'] === 'diagnosis' ? 'بعد الفحص' : money_fmt($r['quoted_price']) . ' د.ع (' . ($r['quality'] === 'original' ? 'أصلي' : 'بديل') . ')'),
        $r['method'] === 'pickup' ? '🚗 استلام من: ' . tg_esc($r['city']) . ' — ' . tg_esc($r['address']) : '🕐 موعد: ' . tg_esc($r['appointment']),
        $r['lat'] !== null ? '📍 الموقع: ' . repair_map_url($r) . ($r['loc_accuracy'] ? " (±{$r['loc_accuracy']} م)" : '') : null,
        $r['pickup_note'] ? '🚚 للمندوب: ' . tg_esc($r['pickup_note']) : null, $r['problem'] ? '📝 ' . tg_esc($r['problem']) : null,
        public_url() ? tg_esc(public_url()) . admin_path() . '#/repairs' : null])));
    return repair_out($r);
}, ['user']);
route('GET', '/api/repairs', fn(Req $req) => array_map('repair_out', all('SELECT * FROM repairs WHERE user_id = ? ORDER BY id DESC', [$req->user['id']])), ['user']);
route('GET', '/api/repairs/:code', fn(Req $req) => repair_out(repair_of_user($req)), ['user']);
route('POST', '/api/repairs/:code/decision', function (Req $req) {
    $r = repair_of_user($req);
    if ($r['status'] !== 'awaiting_approval' || $r['extra_status'] !== 'pending') fail(400, 'repair_no_request');
    $ok = !empty($req->body['approve']);
    tx(function () use ($r, $ok, $req) {
        if ($ok) run("UPDATE repairs SET extra_status = 'approved', approved_extra = approved_extra + extra_price, status = 'repairing', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$r['id']]);
        else run("UPDATE repairs SET extra_status = 'rejected', status = 'ready', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$r['id']]);
        run('INSERT INTO repair_events(repair_id, status, note, by_name, created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())', [$r['id'], $ok ? 'repairing' : 'ready', $ok ? "approved:{$r['extra_price']}" : 'rejected', $req->user['name']]);
    });
    notify("🔧 {$r['code']}: الزبون " . ($ok ? '✅ وافق على' : '❌ رفض') . ' السعر الإضافي ' . money_fmt($r['extra_price']) . ' د.ع');
    return repair_out(one('SELECT * FROM repairs WHERE id = ?', [$r['id']]));
}, ['user']);
route('POST', '/api/repairs/:code/comments', function (Req $req) {
    $r = repair_of_user($req);
    $body = tostr($req->body['body'] ?? '', 1000);
    if ($body === '') fail(400, 'invalid_input');
    if ((int)val("SELECT COUNT(*) FROM repair_comments WHERE repair_id = ? AND author = 'customer' AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR", [$r['id']]) >= 20) fail(429, 'too_many_attempts');
    run("INSERT INTO repair_comments(repair_id, author, name, body, created_at) VALUES(?, 'customer', ?, ?, UTC_TIMESTAMP())", [$r['id'], $req->user['name'], $body]);
    notify("💬 <b>{$r['code']}</b> — " . tg_esc($r['customer_name']) . ' (' . tg_esc("{$r['brand']} {$r['model']}") . "):\n" . tg_esc($body) . (public_url() ? "\n" . tg_esc(public_url()) . admin_path() . '#/repairs' : ''));
    return repair_out(one('SELECT * FROM repairs WHERE id = ?', [$r['id']]));
}, ['user']);
route('POST', '/api/repairs/:code/cancel', function (Req $req) {
    $r = repair_of_user($req);
    if ($r['status'] !== 'booked') fail(400, 'cannot_cancel');
    run("UPDATE repairs SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$r['id']]);
    run("INSERT INTO repair_events(repair_id, status, by_name, created_at) VALUES(?, 'cancelled', ?, UTC_TIMESTAMP())", [$r['id'], $req->user['name']]);
    notify("🔧 {$r['code']}: الزبون ألغى الحجز");
    return ['ok' => true];
}, ['user']);
route('GET', '/api/warranty/:code', function (Req $req) {
    $r = one("SELECT code, brand, model, service_id, service_label, quality, warranty_days, warranty_until, status, updated_at FROM repairs WHERE code = ? AND status = 'delivered'", [strtoupper(tostr($req->params['code'], 12))]);
    if (!$r) fail(404, 'not_found');
    $svc = $r['service_id'] ? one('SELECT name_ku, name_ar, name_en FROM repair_services WHERE id = ?', [$r['service_id']]) : null;
    return $r + ['service' => $svc ?: ['name_ku' => $r['service_label']], 'valid' => $r['warranty_until'] && strcmp($r['warranty_until'], substr(iraq_now(), 0, 10)) >= 0];
});

// ---------- admin ----------
route('GET', '/api/admin/repairs', function (Req $req) {
    $where = []; $p = []; $st = $req->query['status'] ?? '';
    if (in_array($st, REPAIR_STATUSES, true)) { $where[] = 'status = ?'; $p[] = $st; }
    elseif ($st === 'open') $where[] = "status NOT IN ('delivered', 'cancelled')";
    $q = tostr($req->query['q'] ?? '', 40);
    if ($q !== '') { $where[] = '(code LIKE ? OR phone LIKE ? OR customer_name LIKE ? OR imei LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%", "%$q%"); }
    $rows = all('SELECT * FROM repairs ' . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . " ORDER BY CASE WHEN status IN ('delivered','cancelled') THEN 1 ELSE 0 END, COALESCE(appointment, created_at) LIMIT 300", $p);
    $today = substr(iraq_now(), 0, 10);
    return array_map(function ($r) use ($today) {
        $prior = $r['imei'] ? one("SELECT code, service_label, warranty_until FROM repairs WHERE imei = ? AND id != ? AND status = 'delivered' AND warranty_until >= ?", [$r['imei'], $r['id'], $today]) : null;
        $o = repair_out($r, false) + ['warranty_claim' => $prior];
        $o['awaiting_reply'] = $o['comments'] && end($o['comments'])['author'] === 'customer';
        return $o;
    }, $rows);
});
route('POST', '/api/admin/repairs/:id/comments', function (Req $req) {
    $r = one('SELECT * FROM repairs WHERE id = ?', [toint($req->params['id'])]);
    if (!$r) fail(404, 'not_found');
    $body = tostr($req->body['body'] ?? '', 1000);
    if ($body === '') fail(400, 'invalid_input');
    run("INSERT INTO repair_comments(repair_id, author, name, body, created_at) VALUES(?, 'staff', ?, ?, UTC_TIMESTAMP())", [$r['id'], $req->user['name'], $body]);
    return repair_out(one('SELECT * FROM repairs WHERE id = ?', [$r['id']]), false);
});
route('PUT', '/api/admin/repairs/:id', function (Req $req) {
    $r = one('SELECT * FROM repairs WHERE id = ?', [toint($req->params['id'])]);
    if (!$r) fail(404, 'not_found');
    $b = $req->body;
    $status = in_array($b['status'] ?? '', REPAIR_STATUSES, true) ? $b['status'] : $r['status'];
    if ($r['status'] === 'delivered' && $status !== 'delivered') fail(400, 'repair_closed');
    $photos = $r['photos'];
    if (is_array($b['photos'] ?? null)) $photos = json_encode(array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 300), $b['photos']), fn($x) => strncmp($x, '/uploads/', 9) === 0)), 0, 12), JSON_UNESCAPED_SLASHES);
    $final = array_key_exists('final_price', $b) && $b['final_price'] !== '' && $b['final_price'] !== null ? max(0, toint($b['final_price'])) : $r['final_price'];
    $until = $r['warranty_until'];
    if ($status === 'delivered' && $r['status'] !== 'delivered' && $r['extra_status'] !== 'rejected' && $r['warranty_days'] > 0) $until = gmdate('Y-m-d', time() + IRAQ_OFFSET + $r['warranty_days'] * 86400);
    tx(function () use ($r, $b, $status, $final, $photos, $until, $req) {
        run('UPDATE repairs SET status = ?, technician = ?, imei = ?, final_price = ?, parts_cost = ?, photos = ?, old_part_returned = ?, warranty_until = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
            $status, array_key_exists('technician', $b) ? tostr($b['technician'], 60) : $r['technician'], array_key_exists('imei', $b) ? (tostr($b['imei'], 20) ?: null) : $r['imei'],
            $final, array_key_exists('parts_cost', $b) && $b['parts_cost'] !== '' && $b['parts_cost'] !== null ? max(0, toint($b['parts_cost'])) : $r['parts_cost'], $photos,
            array_key_exists('old_part_returned', $b) ? ($b['old_part_returned'] ? 1 : 0) : $r['old_part_returned'], $until, $r['id']]);
        if ($status !== $r['status'] || !empty($b['note'])) run('INSERT INTO repair_events(repair_id, status, note, by_name, created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())', [$r['id'], $status, tostr($b['note'] ?? '', 300) ?: null, $req->user['name']]);
    });
    if ($status !== $r['status']) log_admin($req, 'repair_status', ['code' => $r['code'], 'from' => $r['status'], 'to' => $status]);
    return repair_out(one('SELECT * FROM repairs WHERE id = ?', [$r['id']]), false);
});
route('POST', '/api/admin/repairs/:id/extra', function (Req $req) {
    $r = one('SELECT * FROM repairs WHERE id = ?', [toint($req->params['id'])]);
    if (!$r) fail(404, 'not_found');
    $price = max(0, toint($req->body['price'] ?? 0)); $note = tostr($req->body['note'] ?? '', 300);
    if (!$price || $note === '') fail(400, 'invalid_input');
    tx(function () use ($r, $price, $note, $req) {
        run("UPDATE repairs SET extra_price = ?, extra_note = ?, extra_status = 'pending', status = 'awaiting_approval', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$price, $note, $r['id']]);
        run("INSERT INTO repair_events(repair_id, status, note, by_name, created_at) VALUES(?, 'awaiting_approval', ?, ?, UTC_TIMESTAMP())", [$r['id'], "+$price: $note", $req->user['name']]);
    });
    log_admin($req, 'repair_extra', ['code' => $r['code'], 'price' => $price]);
    return repair_out(one('SELECT * FROM repairs WHERE id = ?', [$r['id']]), false);
});
route('GET', '/api/admin/repair-prices', fn() => ['services' => all('SELECT * FROM repair_services ORDER BY sort, id'), 'prices' => all('SELECT * FROM repair_prices ORDER BY brand, model, service_id')]);
const REPAIR_PF = ['service_id', 'brand', 'model', 'price_original', 'price_copy', 'duration_min', 'warranty_original', 'warranty_copy', 'active'];
function repair_price_values(array $b): array {
    $n = fn($x) => $x === '' || $x === null ? null : max(0, toint($x));
    $v = ['service_id' => toint($b['service_id'] ?? 0), 'brand' => tostr($b['brand'] ?? '', 40), 'model' => tostr($b['model'] ?? '', 80), 'price_original' => $n($b['price_original'] ?? null), 'price_copy' => $n($b['price_copy'] ?? null),
        'duration_min' => max(5, toint($b['duration_min'] ?? 60, 60)), 'warranty_original' => max(0, toint($b['warranty_original'] ?? 90, 90)), 'warranty_copy' => max(0, toint($b['warranty_copy'] ?? 30, 30)), 'active' => ($b['active'] ?? null) === false ? 0 : 1];
    if (!$v['service_id'] || $v['brand'] === '' || $v['model'] === '') fail(400, 'invalid_input');
    return $v;
}
route('POST', '/api/admin/repair-prices', function (Req $req) {
    run('INSERT INTO repair_prices(' . implode(',', REPAIR_PF) . ') VALUES(' . in_list(REPAIR_PF) . ')', array_values(repair_price_values($req->body)));
    return one('SELECT * FROM repair_prices WHERE id = ?', [last_id()]);
});
route('PUT', '/api/admin/repair-prices/:id', function (Req $req) {
    $v = repair_price_values($req->body); $id = toint($req->params['id']);
    run('UPDATE repair_prices SET ' . implode(', ', array_map(fn($f) => "$f = ?", REPAIR_PF)) . ' WHERE id = ?', array_merge(array_values($v), [$id]));
    log_admin($req, 'repair_price', ['id' => $id, 'model' => $v['model'], 'service' => $v['service_id'], 'original' => $v['price_original'], 'copy' => $v['price_copy']]);
    return one('SELECT * FROM repair_prices WHERE id = ?', [$id]);
});
route('DELETE', '/api/admin/repair-prices/:id', function (Req $req) { run('DELETE FROM repair_prices WHERE id = ?', [toint($req->params['id'])]); return ['ok' => true]; });
route('PUT', '/api/admin/repair-services/:id', function (Req $req) {
    $b = $req->body;
    run('UPDATE repair_services SET name_ku = ?, name_ar = ?, name_en = ?, active = ?, needs_diagnosis = ? WHERE id = ?',
        [tostr($b['name_ku'] ?? '', 60), tostr($b['name_ar'] ?? '', 60), tostr($b['name_en'] ?? '', 60), ($b['active'] ?? null) === false ? 0 : 1, !empty($b['needs_diagnosis']) ? 1 : 0, toint($req->params['id'])]);
    return ['ok' => true];
});

<?php
// Public catalogue, sign-in, customer account, cart and orders (same API as server/index.js).

// ================= auth =================
route('POST', '/api/auth/otp', function (Req $req) {
    $phone = norm_phone($req->body['phone'] ?? '');
    $purpose = (string)($req->body['purpose'] ?? '');
    if (strlen($phone) < 7) fail(400, 'invalid_input');
    $u = one('SELECT role FROM users WHERE phone = ?', [$phone]);
    $exists = (bool)$u;
    if ($purpose === 'register' && $exists) fail(409, 'phone_taken');
    if ($purpose === 'reset' && !$exists) fail(404, 'phone_not_found');
    if ($purpose === 'quick' && $exists && $u['role'] !== 'customer') fail(403, 'use_password');
    if ($purpose === 'change_phone') { if (!$req->user) fail(401, 'unauthorized'); if ($exists) fail(409, 'phone_taken'); }
    $lang = in_array($req->body['lang'] ?? '', ['ku', 'ar', 'en'], true) ? $req->body['lang'] : 'ku';
    $out = send_otp($phone, $purpose, $req->ip, $lang, (string)(settings()['store_name'] ?? ''));
    if ($purpose === 'quick') $out['is_new'] = !$exists;
    return $out;
});

function referrer_id(string $ref): ?int {
    if ($ref === '') return null;
    $r = one('SELECT id FROM users WHERE referral_code = ?', [$ref]);
    if (!$r) fail(400, 'invalid_referral');
    return (int)$r['id'];
}
function insert_user(string $name, string $phone, string $password, ?int $referredBy, string $role = 'customer'): int {
    run('INSERT INTO users(name, phone, password_hash, referral_code, referred_by, role, created_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP())',
        [$name, $phone, hash_pw($password), new_referral_code(), $referredBy, $role]);
    return last_id();
}

route('POST', '/api/auth/quick', function (Req $req) {
    rate_limit($req);
    $phone = norm_phone($req->body['phone'] ?? '');
    if (strlen($phone) < 7) fail(400, 'invalid_input');
    $existing = one('SELECT * FROM users WHERE phone = ?', [$phone]);
    if ($existing && $existing['role'] !== 'customer') fail(403, 'use_password');
    $name = tostr($req->body['name'] ?? '', 80);
    if (!$existing && $name === '') fail(400, 'name_required');
    $ref = strtoupper(tostr($req->body['referral'] ?? '', 20));
    $referredBy = !$existing ? referrer_id($ref) : null;
    verify_otp($phone, 'quick', $req->body['code'] ?? '');
    $user = $existing ?: one('SELECT * FROM users WHERE id = ?', [insert_user($name, $phone, rand_hex(24), $referredBy)]);
    return ['token' => create_session((int)$user['id']), 'user' => public_user($user), 'created' => !$existing];
});

route('POST', '/api/auth/reset', function (Req $req) {
    rate_limit($req);
    $phone = norm_phone($req->body['phone'] ?? '');
    $password = (string)($req->body['password'] ?? '');
    if (mb_strlen($password) < 6) fail(400, 'password_short');
    $user = one('SELECT * FROM users WHERE phone = ?', [$phone]);
    if (!$user) fail(404, 'phone_not_found');
    verify_otp($phone, 'reset', $req->body['code'] ?? '');
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hash_pw($password), $user['id']]);
    run('DELETE FROM sessions WHERE user_id = ?', [$user['id']]);
    return ['token' => create_session((int)$user['id']), 'user' => public_user($user)];
});

route('POST', '/api/auth/register', function (Req $req) {
    rate_limit($req);
    $name = tostr($req->body['name'] ?? '', 80);
    $phone = norm_phone($req->body['phone'] ?? '');
    $password = (string)($req->body['password'] ?? '');
    $ref = strtoupper(tostr($req->body['referral'] ?? '', 20));
    if ($name === '' || strlen($phone) < 7) fail(400, 'invalid_input');
    if (mb_strlen($password) < 6) fail(400, 'password_short');
    if (one('SELECT 1 FROM users WHERE phone = ?', [$phone])) fail(409, 'phone_taken');
    $referredBy = referrer_id($ref);
    verify_otp($phone, 'register', $req->body['code'] ?? '');
    $id = insert_user($name, $phone, $password, $referredBy);
    return ['token' => create_session($id), 'user' => public_user(one('SELECT * FROM users WHERE id = ?', [$id]))];
});

route('POST', '/api/auth/login', function (Req $req) {
    $phone = norm_phone($req->body['phone'] ?? '');
    $keys = ["ip:{$req->ip}", "phone:$phone"];
    check_limit($keys);
    $user = one('SELECT * FROM users WHERE phone = ?', [$phone]);
    if (!$user || !verify_pw((string)($req->body['password'] ?? ''), $user['password_hash'])) { record_failure($keys); fail(401, 'wrong_credentials'); }
    run('DELETE FROM auth_failures WHERE `key` = ?', ["phone:$phone"]);
    if ($user['totp_enabled']) {
        $ticket = rand_hex(24);
        run('DELETE FROM login_tickets WHERE expires_at < ?', [ms()]);
        run('INSERT INTO login_tickets(ticket, user_id, expires_at) VALUES(?,?,?)', [$ticket, $user['id'], ms() + 5 * 60 * 1000]);
        return ['need_2fa' => true, 'ticket' => $ticket];
    }
    return ['token' => create_session((int)$user['id']), 'user' => public_user($user)];
});

route('POST', '/api/auth/login/2fa', function (Req $req) {
    $t = one('SELECT * FROM login_tickets WHERE ticket = ?', [(string)($req->body['ticket'] ?? '')]);
    if (!$t || $t['expires_at'] < ms() || $t['attempts'] >= 5) fail(401, 'login_expired');
    $user = one('SELECT * FROM users WHERE id = ?', [$t['user_id']]);
    if (!$user || !totp_verify($user['totp_secret'], $req->body['code'] ?? '')) {
        run('UPDATE login_tickets SET attempts = attempts + 1 WHERE ticket = ?', [$t['ticket']]);
        record_failure(["ip:{$req->ip}"]);
        fail(401, 'wrong_2fa_code');
    }
    run('DELETE FROM login_tickets WHERE ticket = ?', [$t['ticket']]);
    return ['token' => create_session((int)$user['id']), 'user' => public_user($user)];
});

route('POST', '/api/auth/logout', function (Req $req) {
    run('DELETE FROM sessions WHERE token = ?', [$req->token]);
    return ['ok' => true];
}, ['user']);

// ================= catalogue =================
route('GET', '/api/settings', function () {
    $s = settings(); $out = [];
    foreach (PUBLIC_SETTINGS as $k) $out[$k] = $s[$k] ?? '';
    return $out;
});

route('GET', '/api/categories', function () {
    $rows = all('SELECT * FROM categories ORDER BY sort, id');
    $counts = [];
    foreach (all('SELECT category_id, COUNT(*) n FROM products WHERE active = 1 GROUP BY category_id') as $r) $counts[$r['category_id'] ?? ''] = $r['n'];
    $top = [];
    foreach ($rows as $c) {
        if ($c['parent_id']) continue;
        $kids = array_values(array_map(fn($s) => $s + ['count' => $counts[$s['id']] ?? 0], array_filter($rows, fn($s) => $s['parent_id'] === $c['id'])));
        $c['count'] = ($counts[$c['id']] ?? 0) + array_sum(array_column($kids, 'count'));
        $c['children'] = $kids;
        $top[] = $c;
    }
    return $top;
});

route('GET', '/api/banners', fn() => all('SELECT * FROM banners WHERE active = 1 ORDER BY sort, id'));

function product_query(array $q, bool $admin = false): array {
    $where = []; $params = [];
    if (!$admin) $where[] = 'p.active = 1';
    if (!empty($q['category'])) { $cid = toint($q['category']); $where[] = '(p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?))'; array_push($params, $cid, $cid); }
    $tokens = null;
    if (!empty($q['q'])) {
        $c = search_clause(tostr($q['q'], 100));
        if ($c) { $where[] = "({$c['sql']})"; array_push($params, ...$c['params']); $tokens = $c['tokens']; }
    }
    if (!empty($q['flash'])) $where[] = 'p.flash_sale = 1';
    if (!empty($q['featured'])) $where[] = 'p.featured = 1';
    $ids = null;
    if (!empty($q['ids'])) {
        $ids = array_slice(array_values(array_filter(array_map('toint', explode(',', (string)$q['ids'])), fn($x) => $x > 0)), 0, 30);
        $where[] = $ids ? 'p.id IN (' . in_list($ids) . ')' : '0'; array_push($params, ...$ids);
    }
    if (!empty($q['brand'])) {
        $brands = array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 60), explode(',', (string)$q['brand'])))), 0, 20);
        if ($brands) { $where[] = 'LOWER(p.brand) IN (' . in_list($brands) . ')'; array_push($params, ...array_map('mb_strtolower', $brands)); }
    }
    if (toint($q['min_price'] ?? 0) > 0) { $where[] = 'p.price >= ?'; $params[] = toint($q['min_price']); }
    if (toint($q['max_price'] ?? 0) > 0) { $where[] = 'p.price <= ?'; $params[] = toint($q['max_price']); }
    if (toint($q['storage'] ?? 0) > 0) { $where[] = "CAST(JSON_EXTRACT(p.attrs, '$.storage') AS DECIMAL(10,2)) = ?"; $params[] = toint($q['storage']); }
    if (($q['in_stock'] ?? '') === '1') $where[] = 'p.stock > 0';
    if (($q['phones'] ?? '') === '1') $where[] = "JSON_EXTRACT(p.attrs, '$.os') IS NOT NULL";
    $sorts = ['foryou' => 'p.featured DESC, p.trending DESC, (p.stock > 0) DESC, p.id DESC', 'popular' => 'p.sold DESC', 'cheap' => 'p.price ASC', 'expensive' => 'p.price DESC', 'newest' => 'p.id DESC'];
    $order = $sorts[$q['sort'] ?? ''] ?? $sorts['foryou'];
    $limit = min(toint($q['limit'] ?? 40, 40), 200); $offset = max(toint($q['offset'] ?? 0), 0);
    $rows = all('SELECT p.*, ' . VARIANT_COUNT_SQL . ' FROM products p ' . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $order LIMIT $limit OFFSET $offset", $params);
    if ($tokens && (empty($q['sort']) || $q['sort'] === 'foryou')) {
        foreach ($rows as $i => &$r) { $r['_rel'] = search_relevance($r, $tokens); $r['_i'] = $i; } unset($r);
        usort($rows, fn($a, $b) => ($b['_rel'] <=> $a['_rel']) ?: ($a['_i'] <=> $b['_i']));
        foreach ($rows as &$r) unset($r['_rel'], $r['_i']); unset($r);
    }
    if ($ids) usort($rows, fn($a, $b) => array_search($a['id'], $ids) <=> array_search($b['id'], $ids));
    return array_map(fn($p) => product_out($p, $admin), $rows);
}

route('GET', '/api/products', fn(Req $req) => product_query($req->query));
route('GET', '/api/products/facets', function (Req $req) {
    $rows = product_query(['category' => $req->query['category'] ?? null, 'q' => $req->query['q'] ?? null, 'limit' => 200]);
    $count = function (array $arr) { $m = []; foreach ($arr as $x) if ($x !== null && $x !== '' && $x !== 0 && $x !== 0.0) { $k = (string)$x; $m[$k] = ($m[$k] ?? 0) + 1; } arsort($m); $o = []; foreach ($m as $k => $n) $o[] = ['v' => (string)$k, 'n' => $n]; return $o; };
    $storages = $count(array_map(fn($p) => attrs_of($p)['storage'] ?? null, $rows));
    usort($storages, fn($a, $b) => (float)$a['v'] <=> (float)$b['v']);
    return ['brands' => $count(array_map(fn($p) => $p['brand'] ? trim($p['brand']) : null, $rows)), 'storages' => $storages,
        'min' => $rows ? min(array_column($rows, 'price')) : 0, 'max' => $rows ? max(array_column($rows, 'price')) : 0];
});

route('GET', '/api/products/:id', function (Req $req) {
    $p = one('SELECT p.*, ' . VARIANT_COUNT_SQL . ' FROM products p WHERE p.id = ? AND p.active = 1', [toint($req->params['id'])]);
    if (!$p) fail(404, 'not_found');
    $related = array_map('product_out', all('SELECT p.*, ' . VARIANT_COUNT_SQL . ' FROM products p WHERE p.active = 1 AND p.category_id <=> ? AND p.id != ? ORDER BY p.sold DESC LIMIT 8', [$p['category_id'], $p['id']]));
    $product = product_out($p);
    $product['variants'] = array_map('public_variant', variants_of((int)$p['id']));
    $product['tags'] = tags_of((int)$p['id']);
    $viewers = (int)val('SELECT COUNT(DISTINCT visitor) FROM page_views WHERE product_id = ? AND created_at > ?', [$p['id'], ms() - 15 * 60 * 1000]);
    $sold30 = (int)val("SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = ? AND o.status != 'cancelled' AND o.created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY", [$p['id']]);
    return ['product' => $product, 'related' => $related, 'bundle' => bought_together($p), 'proof' => ['viewers' => $viewers, 'sold30' => $sold30]];
});

// ---- accessory compatibility ("frequently bought together" must fit the phone) ----
const FAMILIES = ['iphone', 'galaxy', 'redmi', 'poco', 'pixel', 'honor', 'infinix', 'tecno', 'huawei'];
const MODIFIERS = ['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'edge'];
function model_sig(string $text): ?array {
    $t = ' ' . search_normalize($text) . ' ';
    $t = str_replace([' برو ', ' ماكس ', ' ايفون '], [' pro ', ' max ', ' iphone '], $t);
    $t = preg_replace('/ (جالكسي|كالاكسي|كالكسي) /u', ' galaxy ', $t);
    $w = array_values(array_filter(explode(' ', $t), fn($x) => $x !== ''));
    $fi = -1; foreach ($w as $i => $x) if (in_array($x, FAMILIES, true)) { $fi = $i; break; }
    if ($fi < 0) return null;
    $rest = array_slice($w, $fi + 1, 5);
    $ni = -1; foreach ($rest as $i => $x) if (preg_match('/^\d{1,3}$/', $x)) { $ni = $i; break; }
    $series = $ni > 0 && preg_match('/^[a-z]$/', $rest[$ni - 1]) ? $rest[$ni - 1] : '';
    $n = $ni >= 0 ? $rest[$ni] : '';
    $mods = array_values(array_filter(array_slice($rest, $ni >= 0 ? $ni + 1 : 0), fn($x) => in_array($x, MODIFIERS, true)));
    sort($mods);
    return ['family' => $w[$fi], 'model' => $series . $n, 'mods' => implode('+', $mods)];
}
function all_names(array $x): string { return implode(' ', array_filter([$x['name_en'] ?? '', $x['name_ar'] ?? '', $x['name_ku'] ?? ''])); }
function compatible_with(array $phone, array $acc): bool {
    $ps = model_sig(all_names($phone));
    if (!$ps) return true;
    $as = model_sig(all_names($acc));
    if ($as && ($as['family'] !== $ps['family'] || ($as['model'] !== '' && $as['model'] !== $ps['model']) || $as['mods'] !== $ps['mods'])) return false;
    if (preg_match('/lightning|لايتنينغ|لايتننغ/iu', all_names($acc)) && !($ps['family'] === 'iphone' && (int)$ps['model'] > 0 && (int)$ps['model'] <= 14)) return false;
    return true;
}
function is_phone_row(array $p): bool { return !empty(attrs_of($p)['os']); }
function bundle_discount(array $lines, ?array $s = null): int {
    $s = $s ?? settings();
    $pct = min(max(num($s['bundle_discount_percent'] ?? 0), 0), 50);
    if (!$pct) return 0;
    $phones = array_values(array_filter($lines, fn($l) => is_phone_row($l['p'])));
    $nPhones = array_sum(array_column($phones, 'qty'));
    if (!$nPhones) return 0;
    $off = 0;
    foreach ($lines as $l) {
        if (is_phone_row($l['p'])) continue;
        $fits = false; foreach ($phones as $ph) if (compatible_with($ph['p'], $l['p'])) { $fits = true; break; }
        if ($fits) $off += (int)floor(($l['price'] * min($l['qty'], $nPhones) * $pct) / 100);
    }
    return $off;
}
function lines_from_priced(array $items): array {
    $out = [];
    foreach ($items as $it) if ($it['available']) $out[] = ['p' => one('SELECT * FROM products WHERE id = ?', [$it['id']]), 'price' => $it['price'], 'qty' => $it['qty']];
    return $out;
}
function bought_together(array $p): array {
    $isPhone = is_phone_row($p);
    $fits = fn($x) => !$isPhone || compatible_with($p, $x);
    $pick = function (array $ids) { return $ids ? all('SELECT p.*, ' . VARIANT_COUNT_SQL . ' FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.id IN (' . in_list($ids) . ')', $ids) : []; };
    $has = fn($list, $x) => in_array($x['id'], array_column($list, 'id'), true);
    $list = array_values(array_filter($pick(array_slice(array_values(array_filter(array_map('toint', parse_json($p['bundle_ids'] ?? '[]', [])))), 0, 4)), $fits));
    if (count($list) < 3) {
        $co = array_column(all('SELECT oi2.product_id id, COUNT(*) n FROM order_items oi1 JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id != oi1.product_id WHERE oi1.product_id = ? GROUP BY oi2.product_id ORDER BY n DESC LIMIT 6', [$p['id']]), 'id');
        foreach ($pick(array_values(array_filter($co))) as $x) if ($fits($x) && !$has($list, $x)) $list[] = $x;
    }
    if (count($list) < 3) {
        $more = all('SELECT p.*, ' . VARIANT_COUNT_SQL . ' FROM products p WHERE p.active = 1 AND p.stock > 0 AND p.id != ? AND p.price < ?
            AND (p.category_id IS NULL OR p.category_id NOT IN (SELECT id FROM categories WHERE id = ? OR parent_id <=> (SELECT parent_id FROM categories WHERE id = ?)))
            ORDER BY p.sold DESC LIMIT 30', [$p['id'], max($p['price'] * 0.5, 50000), $p['category_id'] ?? 0, $p['category_id'] ?? 0]);
        foreach ($more as $x) if ($fits($x) && !($isPhone && is_phone_row($x)) && !$has($list, $x)) $list[] = $x;
    }
    $list = array_values(array_filter($list, fn($x) => $x['id'] !== $p['id']));
    return array_map('product_out', array_slice($list, 0, 4));
}

// ================= customer account =================
function user_stats(int $uid): array {
    $by = array_fill_keys(ORDER_STATUSES, 0);
    foreach (all('SELECT status, COUNT(*) n FROM orders WHERE user_id = ? GROUP BY status', [$uid]) as $r) $by[$r['status']] = $r['n'];
    return ['by_status' => $by,
        'total_spent' => (int)val("SELECT COALESCE(SUM(total + wallet_used), 0) FROM orders WHERE user_id = ? AND status = 'delivered'", [$uid]),
        'orders' => (int)val('SELECT COUNT(*) FROM orders WHERE user_id = ?', [$uid]),
        'invited' => (int)val('SELECT COUNT(*) FROM users WHERE referred_by = ?', [$uid])];
}
route('GET', '/api/me', function (Req $req) {
    $out = ['user' => public_user($req->user), 'stats' => user_stats((int)$req->user['id'])];
    if (is_staff($req->user['role'])) { $out['admin_path'] = admin_path(); $out['sections'] = ROLE_SECTIONS[$req->user['role']]; }
    return $out;
}, ['user']);
route('PUT', '/api/me', function (Req $req) {
    $u = $req->user;
    $name = tostr($req->body['name'] ?? '', 80) ?: $u['name'];
    $phone = norm_phone($req->body['phone'] ?? '') ?: $u['phone'];
    if ($phone !== $u['phone']) {
        if (one('SELECT 1 FROM users WHERE phone = ? AND id != ?', [$phone, $u['id']])) fail(409, 'phone_taken');
        verify_otp($phone, 'change_phone', $req->body['code'] ?? '');
    }
    run('UPDATE users SET name = ?, phone = ? WHERE id = ?', [$name, $phone, $u['id']]);
    if (!empty($req->body['new_password'])) {
        if (!verify_pw((string)($req->body['current_password'] ?? ''), $u['password_hash'])) fail(401, 'wrong_credentials');
        if (mb_strlen((string)$req->body['new_password']) < 6) fail(400, 'password_short');
        run('UPDATE users SET password_hash = ? WHERE id = ?', [hash_pw((string)$req->body['new_password']), $u['id']]);
    }
    return ['user' => public_user(one('SELECT * FROM users WHERE id = ?', [$u['id']]))];
}, ['user']);
route('POST', '/api/me/2fa/setup', function (Req $req) {
    if ($req->user['totp_enabled']) fail(400, 'already_enabled');
    $secret = totp_new_secret();
    run('UPDATE users SET totp_secret = ? WHERE id = ?', [$secret, $req->user['id']]);
    return ['secret' => $secret, 'otpauth' => otpauth_url($secret, $req->user['phone'], (string)(settings()['store_name'] ?? '') ?: 'Store')];
}, ['user']);
route('POST', '/api/me/2fa/enable', function (Req $req) {
    if (!$req->user['totp_secret'] || !totp_verify($req->user['totp_secret'], $req->body['code'] ?? '')) fail(400, 'wrong_2fa_code');
    run('UPDATE users SET totp_enabled = 1 WHERE id = ?', [$req->user['id']]);
    run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [$req->user['id'], $req->token]);
    log_admin($req, '2fa_enabled', '');
    return ['ok' => true];
}, ['user']);
route('POST', '/api/me/2fa/disable', function (Req $req) {
    if (!verify_pw((string)($req->body['password'] ?? ''), $req->user['password_hash'])) fail(401, 'wrong_credentials');
    if (!totp_verify($req->user['totp_secret'], $req->body['code'] ?? '')) fail(400, 'wrong_2fa_code');
    run('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [$req->user['id']]);
    log_admin($req, '2fa_disabled', '');
    return ['ok' => true];
}, ['user']);
route('GET', '/api/me/addresses', fn(Req $req) => all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [$req->user['id']]), ['user']);
route('POST', '/api/me/addresses', function (Req $req) {
    $city = tostr($req->body['city'] ?? '', 60); $details = tostr($req->body['details'] ?? '', 300);
    if ($city === '' || $details === '') fail(400, 'invalid_input');
    $first = !one('SELECT 1 FROM addresses WHERE user_id = ?', [$req->user['id']]);
    $def = $first || !empty($req->body['is_default']) ? 1 : 0;
    if ($def) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [$req->user['id']]);
    run('INSERT INTO addresses(user_id, city, area, details, is_default) VALUES(?,?,?,?,?)', [$req->user['id'], $city, tostr($req->body['area'] ?? '', 100), $details, $def]);
    return one('SELECT * FROM addresses WHERE id = ?', [last_id()]);
}, ['user']);
route('DELETE', '/api/me/addresses/:id', function (Req $req) {
    run('DELETE FROM addresses WHERE id = ? AND user_id = ?', [toint($req->params['id']), $req->user['id']]);
    return ['ok' => true];
}, ['user']);

// ================= orders =================
function order_with_items(?array $o): ?array {
    if (!$o) return $o;
    $t = $o['tradein_id'] ? one('SELECT id, label, estimate, final_value, status, answers FROM tradeins WHERE id = ?', [$o['tradein_id']]) : null;
    if ($t) $t['answers'] = obj(parse_json($t['answers'], []));
    $o['items'] = array_map(function ($it) { unset($it['cost']); return $it; }, all('SELECT * FROM order_items WHERE order_id = ?', [$o['id']]));
    $o['tradein'] = $t;
    return $o;
}
function norm_code($c): string { return preg_replace('/\s+/', '', strtoupper(tostr($c, 30))); }
function evaluate_coupon($code, ?int $userId, int $subtotal): array {
    $c = one('SELECT * FROM coupons WHERE code = ?', [norm_code($code)]);
    if (!$c || !$c['active']) fail(400, 'coupon_invalid');
    if ($c['expires_at'] && strtotime($c['expires_at']) !== false && strtotime($c['expires_at']) < time()) fail(400, 'coupon_expired');
    if ($c['max_uses'] && $c['uses'] >= $c['max_uses']) fail(400, 'coupon_used_up');
    if ($subtotal < $c['min_order']) fail(400, 'coupon_min_order', ['detail' => $c['min_order']]);
    if ($c['once_per_customer'] && $userId && one("SELECT 1 FROM orders WHERE user_id = ? AND coupon_code = ? AND status != 'cancelled'", [$userId, $c['code']])) fail(400, 'coupon_already_used');
    $d = $c['type'] === 'fixed' ? (int)$c['value'] : (int)floor(($subtotal * $c['value']) / 100);
    if ($c['max_discount']) $d = min($d, (int)$c['max_discount']);
    return ['coupon' => $c, 'discount' => max(0, min($d, $subtotal))];
}
function price_items($raw): array {
    $out = [];
    foreach (array_slice(is_array($raw) ? $raw : [], 0, 50) as $it) {
        $qty = max(1, min(toint($it['qty'] ?? 1, 1), 99));
        $p = one('SELECT * FROM products WHERE id = ? AND active = 1', [toint($it['id'] ?? 0)]);
        if (!$p) { $out[] = ['id' => toint($it['id'] ?? 0), 'variant_id' => $it['variant_id'] ?? null, 'qty' => $qty, 'available' => false]; continue; }
        $v = !empty($it['variant_id']) ? one('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [toint($it['variant_id']), $p['id']]) : null;
        if (!empty($it['variant_id']) && !$v) { $out[] = ['id' => $p['id'], 'variant_id' => $it['variant_id'], 'qty' => $qty, 'available' => false]; continue; }
        $out[] = ['id' => $p['id'], 'variant_id' => $v ? $v['id'] : null, 'variant_label' => $v ? $v['label'] : null, 'name_ku' => $p['name_ku'], 'name_ar' => $p['name_ar'], 'name_en' => $p['name_en'],
            'image' => $p['image'], 'price' => $v ? $v['price'] : $p['price'], 'stock' => $v ? $v['stock'] : $p['stock'], 'qty' => $qty, 'available' => true];
    }
    return $out;
}
function priced_subtotal(array $items): int { $s = 0; foreach ($items as $it) if ($it['available']) $s += $it['price'] * $it['qty']; return $s; }

route('POST', '/api/coupons/check', function (Req $req) {
    $keys = ["coupon:{$req->ip}"];
    check_limit($keys);
    $items = price_items($req->body['items'] ?? []);
    $sub = priced_subtotal($items) - bundle_discount(lines_from_priced($items));
    try { $r = evaluate_coupon($req->body['code'] ?? '', $req->user['id'] ?? null, $sub); }
    catch (HttpError $e) { if ($e->errCode === 'coupon_invalid') record_failure($keys); throw $e; }
    return ['code' => $r['coupon']['code'], 'type' => $r['coupon']['type'], 'value' => $r['coupon']['value'], 'discount' => $r['discount']];
});

route('POST', '/api/cart/quote', function (Req $req) {
    $s = settings();
    $items = price_items($req->body['items'] ?? []);
    $sub = priced_subtotal($items);
    $bundle = bundle_discount(lines_from_priced($items), $s);
    try { $delivery = delivery_for(tostr($req->body['city'] ?? '', 60), $sub - $bundle, $s); } catch (HttpError $e) { $delivery = null; }
    return ['items' => $items, 'subtotal' => $sub, 'bundle_discount' => $bundle, 'delivery' => $delivery];
});

route('POST', '/api/orders', function (Req $req) {
    $s = settings();
    $items = array_slice(is_array($req->body['items'] ?? null) ? $req->body['items'] : [], 0, 50);
    $name = tostr($req->body['name'] ?? '', 80) ?: $req->user['name'];
    $phone = norm_phone($req->body['phone'] ?? '') ?: $req->user['phone'];
    $city = tostr($req->body['city'] ?? '', 60);
    $address = tostr($req->body['address'] ?? '', 300);
    if (!$items) fail(400, 'cart_empty');
    if ($city === '' || $address === '') fail(400, 'invalid_input');
    if (($s['maintenance_mode'] ?? '') === '1' && !is_staff($req->user['role'])) fail(503, 'maintenance');
    if ($req->user['blocked']) fail(403, 'account_blocked');
    $maxPending = toint($s['max_pending_orders'] ?? 2, 2);
    if ($maxPending > 0 && (int)val("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'pending'", [$req->user['id']]) >= $maxPending) fail(400, 'too_many_pending');

    $order = tx(function () use ($req, $s, $items, $name, $phone, $city, $address) {
        $subtotal = 0; $lines = [];
        foreach ($items as $it) {
            $qty = max(1, min(toint($it['qty'] ?? 1, 1), 99));
            $p = one('SELECT * FROM products WHERE id = ? AND active = 1 FOR UPDATE', [toint($it['id'] ?? 0)]);
            if (!$p) fail(400, 'product_unavailable');
            $variants = variants_of((int)$p['id']);
            $price = $p['price']; $variant = null;
            if ($variants) {
                foreach ($variants as $v) if ($v['id'] === toint($it['variant_id'] ?? 0)) $variant = $v;
                if (!$variant) fail(400, 'choose_variant', ['detail' => $p['name_ku']]);
                if ($variant['stock'] < $qty) fail(400, 'out_of_stock', ['detail' => "{$p['name_ku']} ({$variant['label']})"]);
                $price = $variant['price'];
                run('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [$qty, $variant['id']]);
            } elseif ($p['stock'] < $qty) fail(400, 'out_of_stock', ['detail' => $p['name_ku']]);
            run('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?', [$qty, $qty, $p['id']]);
            $subtotal += $price * $qty;
            $lines[] = ['p' => $p, 'qty' => $qty, 'price' => $price, 'variant' => $variant];
        }
        $bundleOff = bundle_discount($lines, $s);
        $subtotal -= $bundleOff;
        $discount = 0; $couponCode = null;
        if (!empty($req->body['coupon'])) {
            $c = evaluate_coupon($req->body['coupon'], (int)$req->user['id'], $subtotal);
            $discount = $c['discount']; $couponCode = $c['coupon']['code'];
            run('UPDATE coupons SET uses = uses + 1 WHERE id = ?', [$c['coupon']['id']]);
        }
        $delivery = delivery_for($city, $subtotal - $discount, $s);
        $tradein = null; $tradeinCredit = 0;
        if (!empty($req->body['tradein']['model_id'])) {
            if (($s['tradein_enabled'] ?? '') !== '1') fail(400, 'tradein_disabled');
            $tradein = quote_tradein($s, $req->body['tradein']['model_id'], $req->body['tradein']['answers'] ?? []);
            if (!empty($tradein['error'])) fail(400, $tradein['error']);
            $tradeinCredit = min($tradein['estimate'], $subtotal - $discount);
        }
        $wallet = (int)val('SELECT wallet FROM users WHERE id = ?', [$req->user['id']]);
        $walletUsed = !empty($req->body['use_wallet']) ? min($wallet, $subtotal - $discount - $tradeinCredit + $delivery) : 0;
        $total = $subtotal - $discount - $tradeinCredit + $delivery - $walletUsed;
        $source = in_array($req->body['source'] ?? '', ORDER_SOURCES, true) ? $req->body['source'] : null;
        $utm = preg_replace('/[^\w\-.:\/ ]/', '', tostr($req->body['utm'] ?? '', 100)) ?: null;
        run('INSERT INTO orders(user_id, customer_name, phone, city, address, note, subtotal, delivery_fee, wallet_used, total, discount, coupon_code, source, utm, bundle_discount, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
            [$req->user['id'], $name, $phone, $city, $address, tostr($req->body['note'] ?? '', 500), $subtotal + $bundleOff, $delivery, $walletUsed, $total, $discount, $couponCode, $source, $utm, $bundleOff]);
        $oid = last_id();
        foreach ($lines as $l) {
            $cost = $l['variant'] && $l['variant']['cost_price'] !== null ? $l['variant']['cost_price'] : $l['p']['cost_price'];
            run('INSERT INTO order_items(order_id, product_id, variant_id, variant_label, name, image, price, qty, cost) VALUES(?,?,?,?,?,?,?,?,?)',
                [$oid, $l['p']['id'], $l['variant']['id'] ?? null, $l['variant']['label'] ?? null, $l['p']['name_ku'], $l['p']['image'], $l['price'], $l['qty'], $cost]);
            record_stock((int)$l['p']['id'], $l['variant']['id'] ?? null, -$l['qty'], 'order', "#$oid", $name);
        }
        run('DELETE FROM carts WHERE user_id = ?', [$req->user['id']]);
        if ($tradein) {
            run('INSERT INTO tradeins(user_id, order_id, model_id, label, answers, estimate, created_at, updated_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
                [$req->user['id'], $oid, $tradein['model']['id'], $tradein['label'], json_encode(obj($tradein['answers']), JSON_UNESCAPED_UNICODE), $tradein['estimate']]);
            run('UPDATE orders SET tradein_id = ?, tradein_credit = ? WHERE id = ?', [last_id(), $tradeinCredit, $oid]);
        }
        if ($walletUsed) run('UPDATE users SET wallet = wallet - ? WHERE id = ?', [$walletUsed, $req->user['id']]);
        return one('SELECT * FROM orders WHERE id = ?', [$oid]);
    });
    $full = order_with_items($order);
    $high = toint($s['confirm_over'] ?? 0) > 0 && $order['total'] + $order['wallet_used'] >= toint($s['confirm_over']);
    notify(order_message($full + ['tradein_label' => $full['tradein']['label'] ?? null], $full['items'], $high));
    return $full;
}, ['user']);

route('GET', '/api/orders', function (Req $req) {
    $st = in_array($req->query['status'] ?? '', ORDER_STATUSES, true) ? $req->query['status'] : null;
    $rows = $st ? all('SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC', [$req->user['id'], $st]) : all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [$req->user['id']]);
    return array_map('order_with_items', $rows);
}, ['user']);
route('GET', '/api/orders/:id', function (Req $req) {
    $o = one('SELECT * FROM orders WHERE id = ? AND user_id = ?', [toint($req->params['id']), $req->user['id']]);
    if (!$o) fail(404, 'not_found');
    return order_with_items($o);
}, ['user']);
function cancel_order(array $o, ?string $userName = null): void {
    foreach (all('SELECT * FROM order_items WHERE order_id = ?', [$o['id']]) as $it) {
        if ($it['product_id']) run('UPDATE products SET stock = stock + ?, sold = GREATEST(sold - ?, 0) WHERE id = ?', [$it['qty'], $it['qty'], $it['product_id']]);
        if ($it['variant_id']) run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [$it['qty'], $it['variant_id']]);
        if ($it['product_id']) record_stock((int)$it['product_id'], $it['variant_id'], (int)$it['qty'], 'cancel', "#{$o['id']}", $userName);
    }
    if ($o['cashback'] && $o['user_id']) run('UPDATE users SET wallet = GREATEST(wallet - ?, 0) WHERE id = ?', [$o['cashback'], $o['user_id']]);
    if ($o['wallet_used'] && $o['user_id']) run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [$o['wallet_used'], $o['user_id']]);
    if ($o['coupon_code']) run('UPDATE coupons SET uses = GREATEST(uses - 1, 0) WHERE code = ?', [$o['coupon_code']]);
    if ($o['tradein_id']) run("UPDATE tradeins SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$o['tradein_id']]);
}
route('POST', '/api/orders/:id/cancel', function (Req $req) {
    $o = one('SELECT * FROM orders WHERE id = ? AND user_id = ?', [toint($req->params['id']), $req->user['id']]);
    if (!$o) fail(404, 'not_found');
    if ($o['status'] !== 'pending') fail(400, 'cannot_cancel');
    tx(function () use ($o, $req) { cancel_order($o, $req->user['name']); run("UPDATE orders SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$o['id']]); });
    notify("❌ الزبون ألغى الطلب #{$o['id']} — " . tg_esc($o['customer_name']) . ' (' . tg_esc($o['phone']) . ')');
    return order_with_items(one('SELECT * FROM orders WHERE id = ?', [$o['id']]));
}, ['user']);

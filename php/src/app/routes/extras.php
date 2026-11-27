<?php
// Staff roles & sections, stock log, abandoned carts, expenses & profit, bulk prices, presets, tags, analytics, staff, FAQ.

const ROLE_SECTIONS = [
    'admin' => '*',
    'manager' => ['dashboard', 'orders', 'customers', 'carts', 'tradein', 'repairs', 'products', 'catalog', 'stock', 'coupons', 'expenses', 'analytics', 'faqs', 'banners', 'reviews'],
    'orders' => ['dashboard', 'orders', 'customers', 'carts', 'tradein', 'repairs'],
    'technician' => ['dashboard', 'repairs'],
    'products' => ['dashboard', 'products', 'catalog', 'stock', 'reviews'],
];
const SECTION_OF = [
    'stats' => 'dashboard', 'orders' => 'orders', 'users' => 'customers', 'carts' => 'carts',
    'products' => 'products', 'upload' => 'products', 'bulk-price' => 'products', 'variant-presets' => 'products',
    'categories' => 'catalog', 'tags' => 'catalog', 'stock' => 'stock', 'coupons' => 'coupons',
    'expenses' => 'expenses', 'profit' => 'expenses', 'tradeins' => 'tradein', 'tradein-models' => 'tradein', 'tradein-rules' => 'tradein',
    'repairs' => 'repairs', 'repair-prices' => 'repairs', 'repair-services' => 'repairs', 'analytics' => 'analytics', 'faqs' => 'faqs', 'banners' => 'banners', 'reviews' => 'reviews',
];
function can_access(string $role, string $section): bool { $a = ROLE_SECTIONS[$role] ?? null; return $a === '*' || (is_array($a) && in_array($section, $a, true)); }
function admin_guard(Req $req): void {
    if (!$req->user || !is_staff($req->user['role'])) fail(403, 'forbidden');
    $seg = explode('/', substr($req->path, strlen('/api/admin/')))[0] ?? '';
    if ($seg === 'settings' && $req->method === 'GET') return;
    if ($seg === 'upload' && (can_access($req->user['role'], 'products') || can_access($req->user['role'], 'repairs'))) return;
    if (!can_access($req->user['role'], SECTION_OF[$seg] ?? 'admin_only')) fail(403, 'forbidden');
}

// ================= stock movements =================
function record_stock(int $productId, $variantId, int $delta, string $reason, ?string $ref = null, ?string $userName = null): void {
    if (!$delta) return;
    $p = one('SELECT name_ku, stock FROM products WHERE id = ?', [$productId]);
    $v = $variantId ? one('SELECT label, stock FROM product_variants WHERE id = ?', [$variantId]) : null;
    run('INSERT INTO stock_movements(product_id, variant_id, product_name, variant_label, delta, stock_after, reason, ref, user_name, created_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())',
        [$productId, $variantId ?: null, $p['name_ku'] ?? null, $v['label'] ?? null, $delta, $v ? $v['stock'] : ($p['stock'] ?? null), $reason, $ref, $userName]);
}
route('GET', '/api/admin/stock', function (Req $req) {
    $pid = toint($req->query['product_id'] ?? 0);
    return $pid ? all('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 300', [$pid]) : all('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 300');
});
route('POST', '/api/admin/stock/adjust', function (Req $req) {
    $b = $req->body;
    $pid = toint($b['product_id'] ?? 0); $vid = !empty($b['variant_id']) ? toint($b['variant_id']) : null; $delta = toint($b['delta'] ?? 0);
    $reason = in_array($b['reason'] ?? '', ['restock', 'damage', 'correction', 'return'], true) ? $b['reason'] : 'correction';
    if (!$delta) fail(400, 'invalid_input');
    tx(function () use ($pid, $vid, $delta, $reason, $b, $req) {
        if ($vid) {
            $v = one('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [$vid, $pid]);
            if (!$v) fail(404, 'not_found');
            if ($v['stock'] + $delta < 0) fail(400, 'invalid_input');
            run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [$delta, $vid]);
            run('UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?', [$pid, $pid]);
        } else {
            $p = one('SELECT * FROM products WHERE id = ?', [$pid]);
            if (!$p) fail(404, 'not_found');
            if ($p['stock'] + $delta < 0) fail(400, 'invalid_input');
            run('UPDATE products SET stock = stock + ? WHERE id = ?', [$delta, $pid]);
        }
        record_stock($pid, $vid, $delta, $reason, tostr($b['note'] ?? '', 200) ?: null, $req->user['name']);
    });
    log_admin($req, 'stock_adjust', ['product' => $pid, 'variant' => $vid, 'delta' => $delta, 'reason' => $reason]);
    return ['ok' => true, 'stock' => (int)val('SELECT stock FROM products WHERE id = ?', [$pid])];
});

// ================= abandoned carts =================
route('POST', '/api/cart/sync', function (Req $req) {
    $items = array_values(array_filter(price_items($req->body['items'] ?? []), fn($i) => $i['available']));
    if (!$items) { run('DELETE FROM carts WHERE user_id = ?', [$req->user['id']]); return ['ok' => true]; }
    $value = 0; foreach ($items as $i) $value += $i['price'] * $i['qty'];
    $slim = array_map(fn($i) => ['id' => $i['id'], 'variant_id' => $i['variant_id'], 'qty' => $i['qty']], $items);
    run('INSERT INTO carts(user_id, items, value, updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE items = VALUES(items), value = VALUES(value), updated_at = VALUES(updated_at)',
        [$req->user['id'], json_encode($slim), $value]);
    return ['ok' => true];
}, ['user']);
route('GET', '/api/admin/carts', function () {
    $rows = all('SELECT c.*, u.name, u.phone, TIMESTAMPDIFF(SECOND, c.updated_at, UTC_TIMESTAMP()) / 3600 AS hours FROM carts c JOIN users u ON u.id = c.user_id ORDER BY c.updated_at DESC LIMIT 300');
    return array_map(function ($r) { $r['hours'] = (float)$r['hours']; $r['items'] = price_items(parse_json($r['items'], [])); return $r; }, $rows);
});
route('POST', '/api/admin/carts/:userId/reminded', function (Req $req) {
    run('UPDATE carts SET reminded_at = UTC_TIMESTAMP() WHERE user_id = ?', [toint($req->params['userId'])]);
    return ['ok' => true];
});

// ================= expenses & profit =================
const EXPENSE_CATS = ['rent', 'salaries', 'ads', 'delivery', 'utilities', 'stock_purchase', 'other'];
route('GET', '/api/admin/expenses', function (Req $req) {
    $m = preg_match('/^\d{4}-\d{2}$/', (string)($req->query['month'] ?? '')) ? $req->query['month'] : gmdate('Y-m');
    return all('SELECT * FROM expenses WHERE SUBSTR(date, 1, 7) = ? ORDER BY date DESC, id DESC', [$m]);
});
route('POST', '/api/admin/expenses', function (Req $req) {
    $b = $req->body;
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['date'] ?? '')) ? $b['date'] : gmdate('Y-m-d');
    $cat = in_array($b['category'] ?? '', EXPENSE_CATS, true) ? $b['category'] : 'other';
    $amount = max(0, toint($b['amount'] ?? 0));
    if (!$amount) fail(400, 'invalid_input');
    run('INSERT INTO expenses(date, category, amount, note, created_by, created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())', [$date, $cat, $amount, tostr($b['note'] ?? '', 300), $req->user['name']]);
    $id = last_id();
    log_admin($req, 'expense_add', ['id' => $id, 'category' => $cat, 'amount' => $amount]);
    return one('SELECT * FROM expenses WHERE id = ?', [$id]);
});
route('DELETE', '/api/admin/expenses/:id', function (Req $req) {
    $e = one('SELECT * FROM expenses WHERE id = ?', [toint($req->params['id'])]);
    run('DELETE FROM expenses WHERE id = ?', [toint($req->params['id'])]);
    log_admin($req, 'expense_delete', $e ? ['id' => $e['id'], 'amount' => $e['amount'], 'category' => $e['category']] : new stdClass());
    return ['ok' => true];
});
route('GET', '/api/admin/profit', function (Req $req) {
    $months = min(max(toint($req->query['months'] ?? 6, 6), 1), 24);
    $out = []; $y = (int)gmdate('Y'); $mo = (int)gmdate('n');
    for ($i = 0; $i < $months; $i++) {
        $m = gmdate('Y-m', gmmktime(0, 0, 0, $mo - $i, 1, $y));
        $o = one("SELECT COUNT(*) orders, COALESCE(SUM(subtotal - discount - bundle_discount), 0) sales, COALESCE(SUM(wallet_used), 0) wallet, COALESCE(SUM(delivery_fee), 0) delivery FROM orders WHERE status = 'delivered' AND SUBSTR(updated_at, 1, 7) = ?", [$m]);
        $c = one("SELECT COALESCE(SUM(CASE WHEN oi.cost IS NOT NULL THEN oi.cost * oi.qty END), 0) cogs, COALESCE(SUM(CASE WHEN oi.cost IS NULL THEN 1 END), 0) missing FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'delivered' AND SUBSTR(o.updated_at, 1, 7) = ?", [$m]);
        $ex = (int)val('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE SUBSTR(date, 1, 7) = ?', [$m]);
        $rp = one("SELECT COUNT(*) n, COALESCE(SUM(COALESCE(final_price, quoted_price + approved_extra)), 0) revenue, COALESCE(SUM(parts_cost), 0) parts FROM repairs WHERE status = 'delivered' AND SUBSTR(updated_at, 1, 7) = ?", [$m]);
        $byCat = all('SELECT category, SUM(amount) amount FROM expenses WHERE SUBSTR(date, 1, 7) = ? GROUP BY category ORDER BY 2 DESC', [$m]);
        foreach (['sales', 'wallet', 'delivery', 'orders'] as $k) $o[$k] = (int)$o[$k];
        foreach (['cogs', 'missing'] as $k) $c[$k] = (int)$c[$k];
        foreach (['revenue', 'parts', 'n'] as $k) $rp[$k] = (int)$rp[$k];
        foreach ($byCat as &$bc) $bc['amount'] = (int)$bc['amount']; unset($bc);
        $out[] = ['month' => $m, 'orders' => $o['orders'], 'sales' => $o['sales'], 'delivery' => $o['delivery'], 'wallet' => $o['wallet'], 'cogs' => $c['cogs'], 'missing_cost' => $c['missing'],
            'gross' => $o['sales'] - $c['cogs'], 'expenses' => $ex, 'expenses_by_cat' => $byCat, 'repairs' => $rp['n'], 'repair_revenue' => $rp['revenue'], 'repair_parts' => $rp['parts'],
            'net' => $o['sales'] - $c['cogs'] - $o['wallet'] - $ex + $rp['revenue'] - $rp['parts']];
    }
    return $out;
});

// ================= bulk price change =================
route('POST', '/api/admin/bulk-price', function (Req $req) {
    $s = settings(); $b = $req->body;
    $mode = ($b['mode'] ?? '') === 'amount' ? 'amount' : 'percent';
    $value = num($b['value'] ?? 0);
    if (!$value || ($mode === 'percent' && ($value <= -90 || $value > 300))) fail(400, 'invalid_input');
    $step = max(1, toint($b['round'] ?? null, toint($s['usd_round'] ?? 250, 250)));
    $where = []; $p = [];
    if (!empty($b['category_id'])) { $c = toint($b['category_id']); $where[] = '(category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))'; array_push($p, $c, $c); }
    if (!empty($b['brand'])) { $where[] = 'LOWER(brand) = LOWER(?)'; $p[] = tostr($b['brand'], 80); }
    $products = all('SELECT * FROM products ' . ($where ? 'WHERE ' . implode(' AND ', $where) : ''), $p);
    $roundTo = fn($n) => (int)max($step, round($n / $step) * $step);
    $change = fn($x) => $roundTo($mode === 'percent' ? $x * (1 + $value / 100) : $x + $value);
    $changes = [];
    foreach ($products as $pr) {
        if ($pr['usd_priced']) { if ($mode !== 'percent') continue; $changes[] = ['id' => $pr['id'], 'name' => $pr['name_ku'], 'usd' => true, 'from' => $pr['price_usd'], 'to' => round($pr['price_usd'] * (1 + $value / 100) * 100) / 100]; continue; }
        $vs = all('SELECT * FROM product_variants WHERE product_id = ?', [$pr['id']]);
        if ($vs) foreach ($vs as $v) $changes[] = ['id' => $pr['id'], 'variant_id' => $v['id'], 'name' => "{$pr['name_ku']} ({$v['label']})", 'from' => $v['price'], 'to' => $change($v['price'])];
        else $changes[] = ['id' => $pr['id'], 'name' => $pr['name_ku'], 'from' => $pr['price'], 'to' => $change($pr['price'])];
    }
    if (!empty($b['preview'])) return ['count' => count($changes), 'changes' => array_slice($changes, 0, 200), 'skipped_usd' => $mode === 'amount' ? count(array_filter($products, fn($x) => $x['usd_priced'])) : 0];
    tx(function () use ($changes, $value) {
        foreach ($changes as $c) {
            if (!empty($c['usd'])) { run('UPDATE products SET price_usd = ? WHERE id = ?', [$c['to'], $c['id']]); run('UPDATE product_variants SET price_usd = ROUND(price_usd * ?, 2) WHERE product_id = ? AND price_usd IS NOT NULL', [1 + $value / 100, $c['id']]); }
            elseif (!empty($c['variant_id'])) run('UPDATE product_variants SET price = ? WHERE id = ?', [$c['to'], $c['variant_id']]);
            else run('UPDATE products SET price = ? WHERE id = ?', [$c['to'], $c['id']]);
        }
        foreach (array_unique(array_column(array_filter($changes, fn($c) => !empty($c['variant_id'])), 'id')) as $id) sync_product_from_variants((int)$id);
        if (array_filter($changes, fn($c) => !empty($c['usd']))) reprice_usd();
    });
    log_admin($req, 'bulk_price', ['mode' => $mode, 'value' => $value, 'count' => count($changes), 'category' => $b['category_id'] ?? null ?: null, 'brand' => $b['brand'] ?? null ?: null]);
    return ['ok' => true, 'count' => count($changes)];
});

// ================= variant presets =================
route('PUT', '/api/admin/variant-presets', function (Req $req) {
    $presets = [];
    foreach (array_slice(is_array($req->body['presets'] ?? null) ? $req->body['presets'] : [], 0, 10) as $g) {
        $name = tostr($g['name'] ?? '', 40);
        $vals = array_slice(array_values(array_filter(array_map(fn($v) => tostr($v, 40), is_array($g['values'] ?? null) ? $g['values'] : []))), 0, 30);
        if ($name !== '' && $vals) $presets[] = ['name' => $name, 'values' => $vals];
    }
    set_setting('variant_presets', json_encode($presets, JSON_UNESCAPED_UNICODE));
    log_admin($req, 'variant_presets', ['groups' => array_column($presets, 'name')]);
    return $presets;
});

// ================= product tags =================
function tag_values(array $b): array {
    $v = ['name_ku' => tostr($b['name_ku'] ?? '', 40), 'name_ar' => tostr($b['name_ar'] ?? '', 40), 'name_en' => tostr($b['name_en'] ?? '', 40),
        'color' => preg_match('/^#[0-9a-f]{6}$/i', (string)($b['color'] ?? '')) ? $b['color'] : '#8B5CF6'];
    if ($v['name_ku'] === '') fail(400, 'invalid_input');
    return $v;
}
route('GET', '/api/admin/tags', fn() => all('SELECT t.*, (SELECT COUNT(*) FROM product_tags pt WHERE pt.tag_id = t.id) AS products FROM tags t ORDER BY t.id'));
route('POST', '/api/admin/tags', function (Req $req) { run('INSERT INTO tags(name_ku, name_ar, name_en, color) VALUES(?,?,?,?)', array_values(tag_values($req->body))); return one('SELECT * FROM tags WHERE id = ?', [last_id()]); });
route('PUT', '/api/admin/tags/:id', function (Req $req) {
    run('UPDATE tags SET name_ku=?, name_ar=?, name_en=?, color=? WHERE id=?', array_merge(array_values(tag_values($req->body)), [toint($req->params['id'])]));
    return one('SELECT * FROM tags WHERE id = ?', [toint($req->params['id'])]);
});
route('DELETE', '/api/admin/tags/:id', function (Req $req) { run('DELETE FROM tags WHERE id = ?', [toint($req->params['id'])]); return ['ok' => true]; });

// ================= visitor analytics (no cookies, no third parties) =================
const BOT_RE = '/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|headless/i';
route('POST', '/api/track', function (Req $req) {
    $k = "track:{$req->ip}";
    if (rl_failures($k) >= 120) return ['ok' => true];
    record_failure([$k]);
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua === '' || preg_match(BOT_RE, $ua) || ($req->user && is_staff($req->user['role']))) return ['ok' => true];
    $secret = settings()['analytics_secret'] ?? '';
    if ($secret === '') { $secret = rand_hex(16); set_setting('analytics_secret', $secret); }
    $day = gmdate('Y-m-d');
    $visitor = substr(hash('sha256', "$secret|$day|{$req->ip}|$ua"), 0, 16);
    run('INSERT INTO page_views(day, visitor, path, product_id, src, created_at) VALUES(?,?,?,?,?,?)',
        [$day, $visitor, tostr($req->body['path'] ?? '', 120), !empty($req->body['product_id']) ? toint($req->body['product_id']) : null, preg_replace('/[^\w\-.]/', '', tostr($req->body['src'] ?? '', 60)) ?: null, ms()]);
    return ['ok' => true];
});
route('GET', '/api/admin/analytics', function (Req $req) {
    $days = min(max(toint($req->query['days'] ?? 30, 30), 1), 180);
    $since = gmdate('Y-m-d', time() - ($days - 1) * 86400);
    $daily = all('SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_views WHERE day >= ? GROUP BY day ORDER BY day', [$since]);
    $orders = [];
    foreach (all("SELECT SUBSTR(created_at, 1, 10) day, COUNT(*) n FROM orders WHERE SUBSTR(created_at, 1, 10) >= ? AND status != 'cancelled' GROUP BY 1", [$since]) as $r) $orders[$r['day']] = (int)$r['n'];
    $visitors = (int)val('SELECT COUNT(DISTINCT CONCAT(day, visitor)) FROM page_views WHERE day >= ?', [$since]);
    $total = array_sum($orders);
    return ['days' => $days,
        'daily' => array_map(fn($d) => $d + ['orders' => $orders[$d['day']] ?? 0], $daily),
        'totals' => ['views' => array_sum(array_column($daily, 'views')), 'visitors' => $visitors, 'orders' => $total, 'conversion' => $visitors ? round(($total / $visitors) * 1000) / 10 : 0],
        'top_products' => array_map(fn($r) => ['id' => $r['id'], 'name' => $r['name'], 'views' => (int)$r['views'], 'visitors' => (int)$r['visitors'], 'sold' => (int)$r['sold']], all("SELECT pv.product_id id, p.name_ku name, COUNT(*) views, COUNT(DISTINCT CONCAT(pv.day, pv.visitor)) visitors,
            (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = pv.product_id AND SUBSTR(o.created_at,1,10) >= ? AND o.status != 'cancelled') sold
            FROM page_views pv JOIN products p ON p.id = pv.product_id WHERE pv.day >= ? GROUP BY pv.product_id, p.name_ku ORDER BY views DESC LIMIT 15", [$since, $since])),
        'sources' => all("SELECT COALESCE(src, 'direct') src, COUNT(DISTINCT CONCAT(day, visitor)) visitors FROM page_views WHERE day >= ? GROUP BY 1 ORDER BY 2 DESC LIMIT 10", [$since]),
        'pages' => all('SELECT path, COUNT(*) views FROM page_views WHERE day >= ? GROUP BY path ORDER BY 2 DESC LIMIT 10', [$since])];
});
function prune_analytics(): void { run('DELETE FROM page_views WHERE day < ?', [gmdate('Y-m-d', time() - 180 * 86400)]); }

// ================= staff =================
route('GET', '/api/admin/staff', fn() => array_map(fn($u) => ['totp_enabled' => (bool)$u['totp_enabled']] + $u, all("SELECT id, name, phone, role, totp_enabled, created_at FROM users WHERE role != 'customer' ORDER BY id")));
route('POST', '/api/admin/staff', function (Req $req) {
    $phone = preg_replace('/[^\d+]/', '', tostr($req->body['phone'] ?? '', 20));
    $role = $req->body['role'] ?? '';
    if (!in_array($role, STAFF_ROLES, true)) fail(400, 'invalid_input');
    $u = one('SELECT * FROM users WHERE phone = ?', [$phone]);
    if (!$u) fail(404, 'phone_not_found');
    run('UPDATE users SET role = ? WHERE id = ?', [$role, $u['id']]);
    run('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
    log_admin($req, 'staff_role', ['phone' => $phone, 'from' => $u['role'], 'to' => $role]);
    return ['ok' => true];
});
route('PUT', '/api/admin/staff/:id', function (Req $req) {
    $id = toint($req->params['id']);
    if ($id === (int)$req->user['id']) fail(400, 'cannot_demote_self');
    $role = $req->body['role'] ?? '';
    if ($role !== 'customer' && !in_array($role, STAFF_ROLES, true)) fail(400, 'invalid_input');
    $u = one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) fail(404, 'not_found');
    run('UPDATE users SET role = ? WHERE id = ?', [$role, $id]);
    run('DELETE FROM sessions WHERE user_id = ?', [$id]);
    log_admin($req, 'staff_role', ['phone' => $u['phone'], 'from' => $u['role'], 'to' => $role]);
    return ['ok' => true];
});

// ================= FAQ =================
route('GET', '/api/faqs', fn() => all('SELECT * FROM faqs WHERE active = 1 ORDER BY sort, id'));
const FAQ_FIELDS = ['q_ku', 'q_ar', 'q_en', 'a_ku', 'a_ar', 'a_en', 'sort', 'active'];
function faq_values(array $b): array {
    $v = ['q_ku' => tostr($b['q_ku'] ?? '', 300), 'q_ar' => tostr($b['q_ar'] ?? '', 300), 'q_en' => tostr($b['q_en'] ?? '', 300), 'a_ku' => tostr($b['a_ku'] ?? '', 3000),
        'a_ar' => tostr($b['a_ar'] ?? '', 3000), 'a_en' => tostr($b['a_en'] ?? '', 3000), 'sort' => toint($b['sort'] ?? 0), 'active' => array_key_exists('active', $b) && ($b['active'] === false || $b['active'] === 0) ? 0 : 1];
    if ($v['q_ku'] === '' || $v['a_ku'] === '') fail(400, 'invalid_input');
    return array_values($v);
}
route('GET', '/api/admin/faqs', fn() => all('SELECT * FROM faqs ORDER BY sort, id'));
route('POST', '/api/admin/faqs', function (Req $req) { run('INSERT INTO faqs(' . implode(',', FAQ_FIELDS) . ') VALUES(' . in_list(FAQ_FIELDS) . ')', faq_values($req->body)); return one('SELECT * FROM faqs WHERE id = ?', [last_id()]); });
route('PUT', '/api/admin/faqs/:id', function (Req $req) {
    run('UPDATE faqs SET ' . implode(', ', array_map(fn($f) => "$f = ?", FAQ_FIELDS)) . ' WHERE id = ?', array_merge(faq_values($req->body), [toint($req->params['id'])]));
    return one('SELECT * FROM faqs WHERE id = ?', [toint($req->params['id'])]);
});
route('DELETE', '/api/admin/faqs/:id', function (Req $req) { run('DELETE FROM faqs WHERE id = ?', [toint($req->params['id'])]); return ['ok' => true]; });

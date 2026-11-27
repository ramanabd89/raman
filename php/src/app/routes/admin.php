<?php
// Admin panel API (/api/admin/*). Every request passes admin_guard(): staff only, and each role only its sections.

route('POST', '/api/reviews/upload', function (Req $req) {
    check_limit(["revup:{$req->user['id']}"]); record_failure(["revup:{$req->user['id']}"]);
    if (empty($_FILES['file'])) fail(400, 'invalid_file');
    return ['url' => process_upload($_FILES['file'])];
}, ['user']);
route('POST', '/api/admin/upload', function () {
    if (empty($_FILES['file'])) fail(400, 'invalid_file');
    return ['url' => process_upload($_FILES['file'])];
});

function admin_order_extras(array $o): array {
    $confirm = toint(settings()['confirm_over'] ?? 0);
    $u = $o['user_id'] ? one('SELECT blocked FROM users WHERE id = ?', [$o['user_id']]) : null;
    $o['high_value'] = $confirm > 0 && $o['total'] + $o['wallet_used'] >= $confirm;
    $o['customer_blocked'] = (bool)($u['blocked'] ?? false);
    $o['phone_cancelled'] = (int)val("SELECT COUNT(*) FROM orders WHERE phone = ? AND status = 'cancelled' AND id != ?", [$o['phone'], $o['id']]);
    return $o;
}

route('GET', '/api/admin/stats', function (Req $req) {
    $v = fn($sql, $p = []) => val($sql, $p);
    return [
        'revenue' => (int)$v("SELECT COALESCE(SUM(total + wallet_used),0) FROM orders WHERE status = 'delivered'"),
        'orders' => (int)$v('SELECT COUNT(*) FROM orders'),
        'pending' => (int)$v("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
        'today' => (int)$v('SELECT COUNT(*) FROM orders WHERE DATE(created_at) = UTC_DATE()'),
        'customers' => (int)$v("SELECT COUNT(*) FROM users WHERE role = 'customer'"),
        'products' => (int)$v('SELECT COUNT(*) FROM products'),
        'low_stock' => all('SELECT id, name_ku, stock FROM products WHERE stock <= 3 ORDER BY stock LIMIT 10'),
        'top' => all('SELECT id, name_ku, sold, price FROM products ORDER BY sold DESC LIMIT 5'),
        'recent' => array_map('admin_order_extras', all('SELECT * FROM orders ORDER BY id DESC LIMIT 8')),
        'open_repairs' => (int)$v("SELECT COUNT(*) FROM repairs WHERE status NOT IN ('delivered', 'cancelled')"),
        'repairs_today' => (int)$v("SELECT COUNT(*) FROM repairs WHERE SUBSTR(appointment, 1, 10) = DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR) AND status != 'cancelled'"),
        'sources' => all("SELECT COALESCE(source, 'unknown') source, COUNT(*) orders, COALESCE(SUM(CASE WHEN status = 'delivered' THEN total + wallet_used END), 0) revenue FROM orders WHERE status != 'cancelled' GROUP BY 1 ORDER BY 2 DESC"),
        'utm' => all("SELECT utm, COUNT(*) orders FROM orders WHERE utm IS NOT NULL AND status != 'cancelled' GROUP BY utm ORDER BY 2 DESC LIMIT 10"),
        'warnings' => array_values(array_filter([
            verify_pw('admin123', $req->user['password_hash']) ? 'default_password' : null,
            !$req->user['totp_enabled'] ? 'no_2fa' : null,
            sms_provider() === 'console' ? 'sms_console' : null,
            !telegram_enabled() ? 'no_telegram' : null,
        ])),
    ];
});

route('GET', '/api/admin/orders', function (Req $req) {
    $st = in_array($req->query['status'] ?? '', ORDER_STATUSES, true) ? $req->query['status'] : null;
    $q = tostr($req->query['q'] ?? '', 50);
    $where = []; $p = [];
    if ($st) { $where[] = 'status = ?'; $p[] = $st; }
    if ($q !== '') { $where[] = '(customer_name LIKE ? OR phone LIKE ? OR CAST(id AS CHAR) = ?)'; array_push($p, "%$q%", "%$q%", $q); }
    $rows = all('SELECT * FROM orders ' . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 300', $p);
    return array_map(fn($o) => admin_order_extras(order_with_items($o)), $rows);
});

route('PUT', '/api/admin/orders/:id', function (Req $req) {
    $o = one('SELECT * FROM orders WHERE id = ?', [toint($req->params['id'])]);
    if (!$o) fail(404, 'not_found');
    $status = $req->body['status'] ?? null;
    if (!in_array($status, ORDER_STATUSES, true)) fail(400, 'invalid_status');
    if ($o['status'] === 'cancelled' && $status !== 'cancelled') fail(400, 'order_cancelled');
    tx(function () use ($o, $status, $req) {
        if ($status === 'cancelled' && $o['status'] !== 'cancelled') cancel_order($o, $req->user['name']);
        run('UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = UTC_TIMESTAMP() WHERE id = ?',
            [$status, array_key_exists('admin_note', $req->body) && $req->body['admin_note'] !== null ? tostr($req->body['admin_note'], 500) : null, $o['id']]);
        $pct = num(settings()['cashback_percent'] ?? 0);
        if ($status === 'delivered' && $o['user_id'] && !$o['cashback'] && $pct > 0) {
            $cb = (int)floor((($o['subtotal'] - $o['discount']) * min($pct, 50)) / 100);
            if ($cb > 0) { run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [$cb, $o['user_id']]); run('UPDATE orders SET cashback = ? WHERE id = ?', [$cb, $o['id']]); }
        }
        if ($status === 'delivered' && $o['user_id']) {
            $u = one('SELECT * FROM users WHERE id = ?', [$o['user_id']]);
            if ($u && $u['referred_by'] && !$u['referral_paid']) {
                $reward = toint(settings()['referral_reward'] ?? 0);
                if ($reward > 0) run('UPDATE users SET wallet = wallet + ? WHERE id = ?', [$reward, $u['referred_by']]);
                run('UPDATE users SET referral_paid = 1 WHERE id = ?', [$u['id']]);
            }
        }
    });
    log_admin($req, 'order_status', ['order' => $o['id'], 'from' => $o['status'], 'to' => $status]);
    return order_with_items(one('SELECT * FROM orders WHERE id = ?', [$o['id']]));
});

// ---------------- products ----------------
const PRODUCT_FIELDS = ['category_id', 'name_ku', 'name_ar', 'name_en', 'desc_ku', 'desc_ar', 'desc_en', 'brand', 'price', 'old_price', 'stock', 'image', 'images', 'featured', 'trending', 'flash_sale', 'active', 'usd_priced', 'price_usd', 'old_price_usd', 'cost_price', 'specs', 'bundle_ids', 'attrs', 'video_url'];
function clean_attrs($a): array {
    if (!is_array($a) || !in_array($a['os'] ?? null, ['ios', 'android'], true)) return [];
    $n = fn($x, $max) => max(0, min(num($x), $max));
    $o = ['os' => $a['os'], 'tier' => in_array($a['tier'] ?? '', ['flagship', 'upper', 'mid', 'entry'], true) ? $a['tier'] : 'mid',
        'ram' => $n($a['ram'] ?? 0, 32), 'storage' => $n($a['storage'] ?? 0, 2048), 'battery' => $n($a['battery'] ?? 0, 10000), 'camera' => $n($a['camera'] ?? 0, 300),
        'screen' => $n($a['screen'] ?? 0, 10), 'charging' => $n($a['charging'] ?? 0, 300), 'g5' => !empty($a['g5'])];
    foreach (['ram', 'storage', 'battery', 'camera', 'screen', 'charging'] as $k) if (floor($o[$k]) == $o[$k]) $o[$k] = (int)$o[$k]; // 256 not 256.0
    return $o;
}
function product_values(array $b): array {
    $falsy = fn($x) => $x === false || $x === 0 || $x === '0';
    $v = [
        'category_id' => !empty($b['category_id']) ? toint($b['category_id']) : null,
        'name_ku' => tostr($b['name_ku'] ?? '', 200), 'name_ar' => tostr($b['name_ar'] ?? '', 200), 'name_en' => tostr($b['name_en'] ?? '', 200),
        'desc_ku' => tostr($b['desc_ku'] ?? '', 5000), 'desc_ar' => tostr($b['desc_ar'] ?? '', 5000), 'desc_en' => tostr($b['desc_en'] ?? '', 5000),
        'brand' => tostr($b['brand'] ?? '', 80),
        'price' => max(0, toint($b['price'] ?? 0)), 'old_price' => !empty($b['old_price']) ? max(0, toint($b['old_price'])) : null,
        'stock' => max(0, toint($b['stock'] ?? 0)), 'image' => tostr($b['image'] ?? '', 500),
        'images' => json_encode(array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 500), is_array($b['images'] ?? null) ? $b['images'] : []))), 0, 10), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'featured' => !empty($b['featured']) ? 1 : 0, 'trending' => !empty($b['trending']) ? 1 : 0, 'flash_sale' => !empty($b['flash_sale']) ? 1 : 0,
        'active' => array_key_exists('active', $b) && $falsy($b['active']) ? 0 : 1,
        'cost_price' => isset($b['cost_price']) && $b['cost_price'] !== '' ? max(0, toint($b['cost_price'])) : null,
        'specs' => json_encode(array_values(array_filter(array_map(fn($x) => ['k' => tostr($x['k'] ?? '', 60), 'v' => tostr($x['v'] ?? '', 200)], array_slice(is_array($b['specs'] ?? null) ? $b['specs'] : [], 0, 30)), fn($x) => $x['k'] !== '' && $x['v'] !== '')), JSON_UNESCAPED_UNICODE),
        'bundle_ids' => json_encode(array_slice(array_values(array_filter(array_map('toint', is_array($b['bundle_ids'] ?? null) ? $b['bundle_ids'] : []), fn($x) => $x > 0)), 0, 4)),
        'attrs' => json_encode(obj(clean_attrs($b['attrs'] ?? null))),
        'video_url' => preg_match('#^(https://[^\s"\'<>]+|/uploads/[\w.-]+)$#', tostr($b['video_url'] ?? '', 500)) ? tostr($b['video_url'], 500) : null,
    ];
    $v['tag_ids'] = array_slice(array_values(array_filter(array_map('toint', is_array($b['tag_ids'] ?? null) ? $b['tag_ids'] : []), fn($x) => $x > 0)), 0, 10);
    $st = settings();
    $usd = fn($x) => max(0, round(num($x) * 100) / 100);
    $v['usd_priced'] = !empty($b['usd_priced']) ? 1 : 0;
    if ($v['usd_priced'] && !(num($st['usd_rate'] ?? 0) > 0)) fail(400, 'usd_rate_missing');
    if ($v['usd_priced']) {
        $v['price_usd'] = $usd($b['price'] ?? 0) ?: null; $v['old_price_usd'] = $usd($b['old_price'] ?? 0) ?: null;
        $v['price'] = to_iqd($v['price_usd'], $st) ?: 0; $v['old_price'] = to_iqd($v['old_price_usd'], $st);
    } else { $v['price_usd'] = null; $v['old_price_usd'] = null; }
    $v['variants'] = [];
    foreach (array_slice(is_array($b['variants'] ?? null) ? $b['variants'] : [], 0, 30) as $i => $x) {
        $pu = $v['usd_priced'] ? ($usd($x['price'] ?? 0) ?: null) : null;
        $opu = $v['usd_priced'] ? ($usd($x['old_price'] ?? 0) ?: null) : null;
        $row = ['id' => !empty($x['id']) ? toint($x['id']) : null, 'label' => tostr($x['label'] ?? '', 80),
            'price' => $v['usd_priced'] ? (to_iqd($pu, $st) ?: 0) : max(0, toint($x['price'] ?? 0)),
            'old_price' => $v['usd_priced'] ? to_iqd($opu, $st) : (!empty($x['old_price']) ? max(0, toint($x['old_price'])) : null),
            'price_usd' => $pu, 'old_price_usd' => $opu, 'stock' => max(0, toint($x['stock'] ?? 0)), 'sort' => $i,
            'cost_price' => isset($x['cost_price']) && $x['cost_price'] !== '' ? max(0, toint($x['cost_price'])) : null];
        if ($row['label'] !== '' && $row['price']) $v['variants'][] = $row;
    }
    $all = [$v['price_usd'], $v['old_price_usd']]; foreach ($v['variants'] as $x) array_push($all, $x['price_usd'], $x['old_price_usd']);
    if ($v['usd_priced'] && max(array_map(fn($x) => (float)($x ?? 0), $all)) > 50000) fail(400, 'usd_price_too_high');
    if ($v['variants']) { $v['price'] = min(array_column($v['variants'], 'price')); $v['stock'] = array_sum(array_column($v['variants'], 'stock')); }
    if ($v['name_ku'] === '' || !$v['price']) fail(400, 'invalid_input');
    return $v;
}
function save_variants(int $pid, array $vs): void {
    $keep = array_values(array_filter(array_column($vs, 'id')));
    run('DELETE FROM product_variants WHERE product_id = ?' . ($keep ? ' AND id NOT IN (' . in_list($keep) . ')' : ''), array_merge([$pid], $keep));
    foreach ($vs as $x) {
        $exists = $x['id'] && one('SELECT 1 FROM product_variants WHERE id = ? AND product_id = ?', [$x['id'], $pid]);
        if ($exists) run('UPDATE product_variants SET label=?, price=?, old_price=?, price_usd=?, old_price_usd=?, stock=?, sort=?, cost_price=? WHERE id=?', [$x['label'], $x['price'], $x['old_price'], $x['price_usd'], $x['old_price_usd'], $x['stock'], $x['sort'], $x['cost_price'], $x['id']]);
        else run('INSERT INTO product_variants(product_id, label, price, old_price, price_usd, old_price_usd, stock, sort, cost_price) VALUES(?,?,?,?,?,?,?,?,?)', [$pid, $x['label'], $x['price'], $x['old_price'], $x['price_usd'], $x['old_price_usd'], $x['stock'], $x['sort'], $x['cost_price']]);
    }
    sync_product_from_variants($pid);
}
function save_tags(int $pid, array $ids): void {
    run('DELETE FROM product_tags WHERE product_id = ?', [$pid]);
    foreach ($ids as $t) if (one('SELECT 1 FROM tags WHERE id = ?', [$t])) run('INSERT IGNORE INTO product_tags(product_id, tag_id) VALUES(?,?)', [$pid, $t]);
}
function admin_decorate(array $list): array {
    $min = toint(settings()['min_profit'] ?? 0);
    foreach ($list as &$p) {
        $p['tag_ids'] = array_map('intval', array_column(all('SELECT tag_id FROM product_tags WHERE product_id = ?', [$p['id']]), 'tag_id'));
        $pairs = !empty($p['variants']) ? array_map(fn($v) => [$v['price'], $v['cost_price'] ?? $p['cost_price']], $p['variants']) : [[$p['price'], $p['cost_price']]];
        $p['low_margin'] = false; foreach ($pairs as [$pr, $c]) if ($c !== null && $pr - $c < $min) $p['low_margin'] = true;
    }
    return $list;
}
function admin_product(int $id): array { return admin_decorate(attach_variants([product_out(one('SELECT p.*, ' . VARIANT_COUNT_SQL . ' FROM products p WHERE p.id = ?', [$id]), true)]))[0]; }

route('GET', '/api/admin/products', fn(Req $req) => admin_decorate(attach_variants(product_query(array_merge($req->query, ['sort' => $req->query['sort'] ?? 'newest', 'limit' => 200]), true))));
route('POST', '/api/admin/products', function (Req $req) {
    $v = product_values($req->body);
    $id = tx(function () use ($v, $req) {
        run('INSERT INTO products(' . implode(',', PRODUCT_FIELDS) . ', created_at) VALUES(' . in_list(PRODUCT_FIELDS) . ', UTC_TIMESTAMP())', array_map(fn($f) => $v[$f], PRODUCT_FIELDS));
        $pid = last_id();
        save_variants($pid, $v['variants']); save_tags($pid, $v['tag_ids']); index_product($pid);
        $created = (int)val('SELECT stock FROM products WHERE id = ?', [$pid]);
        if ($created) record_stock($pid, null, $created, 'initial', null, $req->user['name']);
        return $pid;
    });
    log_admin($req, 'product_create', ['id' => $id, 'name' => $v['name_ku'], 'price' => $v['price']]);
    return admin_product($id);
});
route('PUT', '/api/admin/products/:id', function (Req $req) {
    $v = product_values($req->body);
    $id = toint($req->params['id']);
    $before = one('SELECT price, stock FROM products WHERE id = ?', [$id]);
    if (!$before) fail(404, 'not_found');
    $bv = []; foreach (variants_of($id) as $x) $bv[$x['id']] = $x['stock'];
    tx(function () use ($v, $id, $before, $bv, $req) {
        run('UPDATE products SET ' . implode(', ', array_map(fn($f) => "$f = ?", PRODUCT_FIELDS)) . ' WHERE id = ?', array_merge(array_map(fn($f) => $v[$f], PRODUCT_FIELDS), [$id]));
        save_variants($id, $v['variants']); save_tags($id, $v['tag_ids']); index_product($id);
        $after = variants_of($id);
        if ($after) foreach ($after as $x) record_stock($id, $x['id'], $x['stock'] - ($bv[$x['id']] ?? 0), 'admin_edit', null, $req->user['name']);
        else record_stock($id, null, $v['stock'] - $before['stock'], 'admin_edit', null, $req->user['name']);
    });
    log_admin($req, 'product_update', ['id' => $id, 'name' => $v['name_ku'], 'price' => [$before['price'], $v['price']], 'stock' => [$before['stock'], $v['stock']]]);
    return admin_product($id);
});
route('DELETE', '/api/admin/products/:id', function (Req $req) {
    $id = toint($req->params['id']);
    $p = one('SELECT name_ku FROM products WHERE id = ?', [$id]);
    run('DELETE FROM products WHERE id = ?', [$id]);
    log_admin($req, 'product_delete', ['id' => $id, 'name' => $p['name_ku'] ?? null]);
    return ['ok' => true];
});

// ---------------- categories ----------------
route('GET', '/api/admin/categories', fn() => all('SELECT * FROM categories ORDER BY parent_id IS NOT NULL, sort, id'));
function cat_values(array $b): array {
    $v = ['parent_id' => !empty($b['parent_id']) ? toint($b['parent_id']) : null, 'name_ku' => tostr($b['name_ku'] ?? '', 100), 'name_ar' => tostr($b['name_ar'] ?? '', 100),
        'name_en' => tostr($b['name_en'] ?? '', 100), 'image' => tostr($b['image'] ?? '', 500), 'sort' => toint($b['sort'] ?? 0)];
    if ($v['name_ku'] === '') fail(400, 'invalid_input');
    return $v;
}
route('POST', '/api/admin/categories', function (Req $req) {
    $v = cat_values($req->body);
    run('INSERT INTO categories(parent_id, name_ku, name_ar, name_en, image, sort) VALUES(?,?,?,?,?,?)', array_values($v));
    $id = last_id();
    log_admin($req, 'category_create', ['id' => $id, 'name' => $v['name_ku']]);
    rebuild_search_index();
    return one('SELECT * FROM categories WHERE id = ?', [$id]);
});
route('PUT', '/api/admin/categories/:id', function (Req $req) {
    $v = cat_values($req->body); $id = toint($req->params['id']);
    if ($v['parent_id'] === $id) fail(400, 'invalid_input');
    run('UPDATE categories SET parent_id=?, name_ku=?, name_ar=?, name_en=?, image=?, sort=? WHERE id=?', array_merge(array_values($v), [$id]));
    rebuild_search_index();
    return one('SELECT * FROM categories WHERE id = ?', [$id]);
});
route('DELETE', '/api/admin/categories/:id', function (Req $req) {
    run('DELETE FROM categories WHERE id = ?', [toint($req->params['id'])]);
    log_admin($req, 'category_delete', ['id' => toint($req->params['id'])]);
    return ['ok' => true];
});

// ---------------- banners ----------------
const BANNER_FIELDS = ['tag_ku', 'tag_ar', 'tag_en', 'title_ku', 'title_ar', 'title_en', 'subtitle_ku', 'subtitle_ar', 'subtitle_en', 'image', 'link', 'sort', 'active'];
function banner_values(array $b): array {
    return array_map(fn($f) => $f === 'sort' ? toint($b['sort'] ?? 0) : ($f === 'active' ? (array_key_exists('active', $b) && ($b['active'] === false || $b['active'] === 0) ? 0 : 1) : tostr($b[$f] ?? '', 500)), BANNER_FIELDS);
}
route('GET', '/api/admin/banners', fn() => all('SELECT * FROM banners ORDER BY sort, id'));
route('POST', '/api/admin/banners', function (Req $req) {
    run('INSERT INTO banners(' . implode(',', BANNER_FIELDS) . ') VALUES(' . in_list(BANNER_FIELDS) . ')', banner_values($req->body));
    return one('SELECT * FROM banners WHERE id = ?', [last_id()]);
});
route('PUT', '/api/admin/banners/:id', function (Req $req) {
    run('UPDATE banners SET ' . implode(', ', array_map(fn($f) => "$f = ?", BANNER_FIELDS)) . ' WHERE id = ?', array_merge(banner_values($req->body), [toint($req->params['id'])]));
    return one('SELECT * FROM banners WHERE id = ?', [toint($req->params['id'])]);
});
route('DELETE', '/api/admin/banners/:id', function (Req $req) {
    run('DELETE FROM banners WHERE id = ?', [toint($req->params['id'])]);
    log_admin($req, 'banner_delete', ['id' => toint($req->params['id'])]);
    return ['ok' => true];
});

// ---------------- customers ----------------
route('GET', '/api/admin/users', function (Req $req) {
    $q = tostr($req->query['q'] ?? '', 50);
    $rows = $q !== '' ? all('SELECT * FROM users WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 300', ["%$q%", "%$q%"]) : all('SELECT * FROM users ORDER BY id DESC LIMIT 300');
    return array_map(fn($u) => public_user($u) + ['blocked' => (bool)$u['blocked'], 'block_reason' => $u['block_reason'],
        'orders' => (int)val('SELECT COUNT(*) FROM orders WHERE user_id = ?', [$u['id']]),
        'cancelled' => (int)val("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'cancelled'", [$u['id']])], $rows);
});
route('PUT', '/api/admin/users/:id', function (Req $req) {
    $id = toint($req->params['id']);
    $u = one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) fail(404, 'not_found');
    $b = $req->body;
    if (isset($b['wallet']) && !in_array($req->user['role'], ['admin', 'manager'], true)) fail(403, 'forbidden');
    $wallet = isset($b['wallet']) ? max(0, toint($b['wallet'])) : (int)$u['wallet'];
    $blocked = isset($b['blocked']) ? ($b['blocked'] ? 1 : 0) : (int)$u['blocked'];
    if ($id === (int)$req->user['id'] && $blocked) fail(400, 'cannot_demote_self');
    $reason = isset($b['block_reason']) ? tostr($b['block_reason'], 200) : $u['block_reason'];
    run('UPDATE users SET wallet = ?, blocked = ?, block_reason = ? WHERE id = ?', [$wallet, $blocked, $reason, $id]);
    $ch = [];
    if ($wallet !== (int)$u['wallet']) $ch['wallet'] = [$u['wallet'], $wallet];
    if ($blocked !== (int)$u['blocked']) $ch['blocked'] = [(bool)$u['blocked'], (bool)$blocked];
    if ($ch) log_admin($req, 'user_update', ['id' => $id, 'phone' => $u['phone']] + $ch);
    return public_user(one('SELECT * FROM users WHERE id = ?', [$id]));
});

// ---------------- coupons ----------------
route('GET', '/api/admin/coupons', fn() => all("SELECT c.*,
    (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS orders,
    (SELECT COALESCE(SUM(o.total + o.wallet_used), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status = 'delivered') AS revenue,
    (SELECT COALESCE(SUM(o.discount), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS discount_given
  FROM coupons c ORDER BY c.id DESC"));
const COUPON_FIELDS = ['code', 'owner', 'type', 'value', 'max_discount', 'min_order', 'max_uses', 'once_per_customer', 'expires_at', 'active'];
function coupon_values(array $b): array {
    $falsy = fn($x) => $x === false || $x === 0;
    $v = ['code' => norm_code($b['code'] ?? ''), 'owner' => tostr($b['owner'] ?? '', 80), 'type' => ($b['type'] ?? '') === 'fixed' ? 'fixed' : 'percent', 'value' => max(0, toint($b['value'] ?? 0)),
        'max_discount' => !empty($b['max_discount']) ? max(0, toint($b['max_discount'])) : null, 'min_order' => max(0, toint($b['min_order'] ?? 0)),
        'max_uses' => !empty($b['max_uses']) ? max(1, toint($b['max_uses'])) : null, 'once_per_customer' => array_key_exists('once_per_customer', $b) && $falsy($b['once_per_customer']) ? 0 : 1,
        'expires_at' => !empty($b['expires_at']) ? tostr($b['expires_at'], 40) : null, 'active' => array_key_exists('active', $b) && $falsy($b['active']) ? 0 : 1];
    if (!preg_match('/^[A-Z0-9_-]{3,30}$/', $v['code']) || !$v['value'] || ($v['type'] === 'percent' && $v['value'] > 90)) fail(400, 'invalid_input');
    return $v;
}
route('POST', '/api/admin/coupons', function (Req $req) {
    $v = coupon_values($req->body);
    if (one('SELECT 1 FROM coupons WHERE code = ?', [$v['code']])) fail(409, 'coupon_exists');
    run('INSERT INTO coupons(' . implode(',', COUPON_FIELDS) . ', created_at) VALUES(' . in_list(COUPON_FIELDS) . ', UTC_TIMESTAMP())', array_values($v));
    $id = last_id();
    log_admin($req, 'coupon_create', ['code' => $v['code'], 'owner' => $v['owner'], 'value' => $v['value'], 'type' => $v['type']]);
    return one('SELECT * FROM coupons WHERE id = ?', [$id]);
});
route('PUT', '/api/admin/coupons/:id', function (Req $req) {
    $v = coupon_values($req->body); $id = toint($req->params['id']);
    if (one('SELECT 1 FROM coupons WHERE code = ? AND id != ?', [$v['code'], $id])) fail(409, 'coupon_exists');
    run('UPDATE coupons SET ' . implode(', ', array_map(fn($f) => "$f = ?", COUPON_FIELDS)) . ' WHERE id = ?', array_merge(array_values($v), [$id]));
    log_admin($req, 'coupon_update', ['code' => $v['code'], 'active' => (bool)$v['active']]);
    return one('SELECT * FROM coupons WHERE id = ?', [$id]);
});
route('DELETE', '/api/admin/coupons/:id', function (Req $req) {
    $c = one('SELECT code FROM coupons WHERE id = ?', [toint($req->params['id'])]);
    run('DELETE FROM coupons WHERE id = ?', [toint($req->params['id'])]);
    log_admin($req, 'coupon_delete', ['code' => $c['code'] ?? null]);
    return ['ok' => true];
});

// ---------------- settings ----------------
route('GET', '/api/admin/settings', fn() => obj(settings(true)));
route('PUT', '/api/admin/settings', function (Req $req) {
    $before = settings(true); $changed = []; $b = $req->body;
    if (array_key_exists('delivery_zones', $b)) {
        $zones = is_string($b['delivery_zones']) ? json_decode($b['delivery_zones'], true) : $b['delivery_zones'];
        if (!is_array($zones) || ($zones && array_keys($zones) !== range(0, count($zones) - 1))) fail(400, 'invalid_input');
        $clean = array_values(array_filter(array_map(fn($z) => ['name' => tostr($z['name'] ?? '', 60), 'fee' => max(0, toint($z['fee'] ?? 0)), 'eta' => tostr($z['eta'] ?? '', 40)], array_slice($zones, 0, 100)), fn($z) => $z['name'] !== ''));
        $b['delivery_zones'] = json_encode($clean, JSON_UNESCAPED_UNICODE);
        $b['cities'] = implode(',', array_column($clean, 'name'));
    }
    foreach (array_merge(PUBLIC_SETTINGS, ADMIN_EXTRA_SETTINGS) as $k) if (array_key_exists($k, $b)) {
        $v = tostr($b[$k], 5000);
        if (($before[$k] ?? '') !== $v) $changed[$k] = [$before[$k] ?? '', $v];
        set_setting($k, $v);
    }
    if ($changed) log_admin($req, 'settings_update', $changed);
    if (isset($changed['usd_rate']) || isset($changed['usd_round'])) {
        $n = tx(fn() => reprice_usd());
        if ($n) log_admin($req, 'usd_reprice', ['products' => $n, 'rate' => settings()['usd_rate'] ?? '']);
    }
    return obj(settings(true));
});

route('GET', '/api/admin/log', fn() => all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 300'));
route('GET', '/api/admin/backups', fn() => list_backups());
route('GET', '/api/admin/backups/download', function (Req $req) {
    $name = (string)($req->query['name'] ?? '');
    if ($name === 'now') { $file = sql_dump(backup_dir() . '/manual-' . ms() . '.sql'); $temp = true; $dl = 'store-' . gmdate('Y-m-d-H-i') . '.sql'; }
    else {
        if (!preg_match('/^store-\d{4}-\d{2}-\d{2}\.sql$/', $name)) fail(400, 'invalid_input');
        $file = backup_dir() . "/$name"; $temp = false; $dl = $name;
        if (!is_file($file)) fail(404, 'not_found');
    }
    log_admin($req, 'backup_download', $name);
    header('Content-Type: application/sql');
    header('Content-Disposition: attachment; filename="' . $dl . '"');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    if ($temp) @unlink($file);
    exit;
});

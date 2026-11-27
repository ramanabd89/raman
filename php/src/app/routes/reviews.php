<?php
// Product reviews: stars + comment + up to 3 photos. Buyers (a delivered order with the product) get a
// "verified purchase" badge and are published at once; others only if the shop allows it, after approval.

const REVIEW_STATUSES = ['pending', 'approved', 'hidden'];
function review_recalc(int $pid): void {
    $r = one("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id = ? AND status = 'approved'", [$pid]);
    run('UPDATE products SET rating_count = ?, rating_avg = ? WHERE id = ?', [$r['n'], $r['n'] ? round((float)$r['a'] * 10) / 10 : 0, $pid]);
}
function bought_it(int $uid, int $pid): bool {
    return (bool)one("SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'delivered' LIMIT 1", [$uid, $pid]);
}
function short_name($name): string {
    $w = array_values(array_filter(preg_split('/\s+/u', trim((string)$name)), fn($x) => $x !== ''));
    if (!$w) return '—';
    return count($w) > 1 ? $w[0] . ' ' . mb_substr($w[1], 0, 1) . '.' : $w[0];
}
function review_pub(array $r): array {
    return ['id' => $r['id'], 'rating' => $r['rating'], 'comment' => $r['comment'], 'photos' => parse_json($r['photos'], []), 'name' => $r['name'], 'city' => $r['city'],
        'verified' => (bool)$r['verified'], 'reply' => $r['reply'], 'created_at' => $r['created_at']];
}
function can_review(?array $user, int $pid): string {
    $s = settings();
    if (($s['reviews_enabled'] ?? '1') === '0') return 'off';
    if (!$user) return 'login';
    if (bought_it((int)$user['id'], $pid)) return 'yes';
    return ($s['reviews_buyers_only'] ?? '1') === '0' ? 'yes' : 'buy';
}
function round1($x): float|int { $v = round((float)$x * 10) / 10; return $v == (int)$v ? (int)$v : $v; }

route('GET', '/api/products/:id/reviews', function (Req $req) {
    $pid = toint($req->params['id']);
    $limit = min(toint($req->query['limit'] ?? 5, 5), 30); $offset = max(toint($req->query['offset'] ?? 0), 0);
    $photosOnly = ($req->query['photos'] ?? '') === '1';
    $sum = one("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE product_id = ? AND status = 'approved'", [$pid]);
    $dist = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];
    foreach (all("SELECT rating, COUNT(*) n FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating", [$pid]) as $r) $dist[$r['rating']] = (int)$r['n'];
    $list = array_map('review_pub', all("SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' " . ($photosOnly ? "AND photos != '[]' " : '') . "ORDER BY verified DESC, (photos != '[]') DESC, id DESC LIMIT $limit OFFSET $offset", [$pid]));
    $photos = [];
    foreach (all("SELECT photos FROM reviews WHERE product_id = ? AND status = 'approved' AND photos != '[]' ORDER BY id DESC LIMIT 12", [$pid]) as $r) $photos = array_merge($photos, parse_json($r['photos'], []));
    $mine = $req->user ? one('SELECT * FROM reviews WHERE product_id = ? AND user_id = ?', [$pid, $req->user['id']]) : null;
    return ['avg' => $sum['n'] ? round1($sum['a']) : 0, 'count' => (int)$sum['n'], 'dist' => $dist, 'list' => $list, 'photos' => array_slice($photos, 0, 12),
        'mine' => $mine ? review_pub($mine) + ['status' => $mine['status']] : null, 'can_review' => can_review($req->user, $pid)];
});
route('POST', '/api/products/:id/reviews', function (Req $req) {
    $pid = toint($req->params['id']);
    if (!one('SELECT id FROM products WHERE id = ? AND active = 1', [$pid])) fail(404, 'not_found');
    $can = can_review($req->user, $pid);
    if ($can === 'off') fail(400, 'reviews_off');
    if ($can === 'buy') fail(403, 'review_buyers_only');
    $rating = toint($req->body['rating'] ?? 0);
    if ($rating < 1 || $rating > 5) fail(400, 'invalid_input');
    $comment = tostr($req->body['comment'] ?? '', 1000);
    // only photos this shop processed (our own uploads)
    $photos = array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 120), is_array($req->body['photos'] ?? null) ? $req->body['photos'] : []), fn($x) => preg_match('#^/uploads/[a-f0-9]{24}\.(webp|jpg)$#', $x))), 0, 3);
    $verified = bought_it((int)$req->user['id'], $pid) ? 1 : 0;
    $status = $verified ? 'approved' : 'pending';
    $city = val('SELECT city FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$req->user['id']]) ?: null;
    $name = short_name($req->user['name']);
    $old = one('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', [$pid, $req->user['id']]);
    if ($old) run('UPDATE reviews SET rating = ?, comment = ?, photos = ?, verified = ?, status = ?, name = ?, city = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [$rating, $comment, json_encode($photos, JSON_UNESCAPED_SLASHES), $verified, $status, $name, $city, $old['id']]);
    else run('INSERT INTO reviews(product_id, user_id, rating, comment, photos, verified, status, name, city, created_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())', [$pid, $req->user['id'], $rating, $comment, json_encode($photos, JSON_UNESCAPED_SLASHES), $verified, $status, $name, $city]);
    review_recalc($pid);
    return ['ok' => true, 'status' => $status];
}, ['user']);
route('GET', '/api/me/to-review', fn(Req $req) => all("SELECT p.id, p.name_ku, p.name_ar, p.name_en, p.image, MAX(o.id) last_order FROM order_items oi JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id WHERE o.user_id = ? AND o.status = 'delivered' AND p.active = 1
    AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.user_id = ?) GROUP BY p.id, p.name_ku, p.name_ar, p.name_en, p.image ORDER BY last_order DESC LIMIT 10", [$req->user['id'], $req->user['id']]), ['user']);

route('GET', '/api/admin/reviews/pending-count', fn() => ['n' => (int)val("SELECT COUNT(*) FROM reviews WHERE status = 'pending'")]);
route('GET', '/api/admin/reviews', function (Req $req) {
    $st = in_array($req->query['status'] ?? '', REVIEW_STATUSES, true) ? $req->query['status'] : null;
    $rows = all("SELECT r.*, p.name_ku product_name, p.image product_image, u.phone FROM reviews r JOIN products p ON p.id = r.product_id LEFT JOIN users u ON u.id = r.user_id "
        . ($st ? 'WHERE r.status = ? ' : '') . "ORDER BY (r.status = 'pending') DESC, r.id DESC LIMIT 300", $st ? [$st] : []);
    $counts = []; foreach (REVIEW_STATUSES as $s) $counts[$s] = (int)val('SELECT COUNT(*) FROM reviews WHERE status = ?', [$s]);
    return ['list' => array_map(function ($r) { $r['photos'] = parse_json($r['photos'], []); return $r; }, $rows), 'counts' => $counts];
});
route('PATCH', '/api/admin/reviews/:id', function (Req $req) {
    $r = one('SELECT * FROM reviews WHERE id = ?', [toint($req->params['id'])]);
    if (!$r) fail(404, 'not_found');
    $status = in_array($req->body['status'] ?? '', REVIEW_STATUSES, true) ? $req->body['status'] : $r['status'];
    $reply = array_key_exists('reply', $req->body) ? (tostr($req->body['reply'], 1000) ?: null) : $r['reply'];
    run('UPDATE reviews SET status = ?, reply = ? WHERE id = ?', [$status, $reply, $r['id']]);
    review_recalc((int)$r['product_id']);
    log_admin($req, 'review_update', ['id' => $r['id'], 'status' => $status]);
    return ['ok' => true];
});
route('DELETE', '/api/admin/reviews/:id', function (Req $req) {
    $r = one('SELECT * FROM reviews WHERE id = ?', [toint($req->params['id'])]);
    if (!$r) fail(404, 'not_found');
    run('DELETE FROM reviews WHERE id = ?', [$r['id']]);
    review_recalc((int)$r['product_id']);
    log_admin($req, 'review_delete', ['id' => $r['id']]);
    return ['ok' => true];
});

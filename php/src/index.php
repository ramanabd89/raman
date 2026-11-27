<?php
// RamanPhone — PHP version. Every request that is not a real file (css/js/images) comes here:
// /api/*  → JSON API,  /p/12 → product link preview,  admin address → admin panel,  everything else → the shop.

require __DIR__ . '/app/lib/core.php';

if (!is_file(__DIR__ . '/config.php')) { header('Location: install.php'); exit; }

require APP . '/lib/search.php';
require APP . '/lib/services.php';
require APP . '/routes/extras.php';
require APP . '/routes/main.php';
require APP . '/routes/admin.php';
require APP . '/routes/smart.php';
require APP . '/routes/repair.php';
require APP . '/routes/reviews.php';

// ---------- security headers (same as the Node version) ----------
header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

$path = '/' . ltrim(rawurldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH)), '/');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// once a day: backup + tidy up (shared hosting has no background jobs)
daily_backup_if_due();
if ((settings()['last_db_prune_date'] ?? '') !== gmdate('Y-m-d')) {
    try { prune_analytics(); run('DELETE FROM auth_failures WHERE ts < ?', [ms() - 86400000]); set_setting('last_db_prune_date', gmdate('Y-m-d')); } catch (Throwable $e) { error_log($e->getMessage()); }
}

// ---------------- API ----------------
if (strncmp($path, '/api/', 5) === 0 || $path === '/api') {
    $req = new Req();
    $req->method = $method; $req->path = rtrim($path, '/') ?: '/'; $req->ip = client_ip(); $req->query = $_GET;
    $ctype = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_contains($ctype, 'application/json')) {
        $raw = file_get_contents('php://input');
        if (strlen($raw) > 1024 * 1024) json_out(413, ['error' => 'too_large']);
        if ($raw !== '') { $j = json_decode($raw, true); if (!is_array($j)) json_out(400, ['error' => 'invalid_json']); $req->body = $j; }
    } else $req->body = $_POST;
    dispatch_api($req);
}

// ---------------- pages ----------------
function base_url(): string {
    if (public_url()) return public_url();
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}
function attr($v): string { return htmlspecialchars((string)($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function render_index(array $meta = []): never {
    $html = file_get_contents(APP . '/index.html');
    $s = settings();
    $base = base_url();
    $title = $meta['title'] ?? ($s['store_name'] ?? '') ?: 'Store';
    $desc = $meta['description'] ?? (($s['seo_description'] ?? '') ?: (($s['slogan'] ?? '') ?: 'مۆبایل و ئەکسسوار — گەیاندن بۆ هەموو شارەکان | موبايلات وإكسسوارات مع التوصيل'));
    $image = $meta['image'] ?? null;
    if (!$image) { $b = one('SELECT image FROM banners WHERE active = 1 ORDER BY sort, id LIMIT 1'); $image = $b ? og_image_for($b['image']) : null; }
    $tags = array_filter([
        '<meta property="og:type" content="' . attr($meta['type'] ?? 'website') . '">',
        '<meta property="og:site_name" content="' . attr($s['store_name'] ?? '') . '">',
        '<meta property="og:title" content="' . attr($title) . '">',
        '<meta property="og:description" content="' . attr($desc) . '">',
        '<meta property="og:url" content="' . attr($base . ($meta['path'] ?? ($_SERVER['REQUEST_URI'] ?? '/'))) . '">',
        $image ? '<meta property="og:image" content="' . attr($base . $image) . '">' : '',
        $image ? '<meta name="twitter:card" content="summary_large_image">' : '',
        !empty($meta['price']) ? '<meta property="product:price:amount" content="' . (int)$meta['price'] . '"><meta property="product:price:currency" content="IQD">' : '',
        !empty($meta['redirect']) ? '<meta http-equiv="refresh" content="0;url=' . attr($meta['redirect']) . '">' : '',
    ]);
    $html = preg_replace('#<title>[^<]*</title>#', '<title>' . attr($title) . '</title>', $html, 1);
    $html = preg_replace('#<meta name="description" content="[^"]*">#', '<meta name="description" content="' . attr($desc) . '">', $html, 1);
    $html = str_replace('</head>', '  ' . implode("\n  ", $tags) . "\n</head>", $html);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    echo $html;
    exit;
}

if (preg_match('#^/p/(\d+)$#', $path, $m)) {
    $p = one('SELECT * FROM products WHERE id = ? AND active = 1', [(int)$m[1]]);
    if (!$p) { header('Location: /'); exit; }
    $s = settings();
    $price = money_fmt($p['price']);
    $name = implode(' | ', array_filter([$p['name_ku'], $p['name_ar'] && $p['name_ar'] !== $p['name_ku'] ? $p['name_ar'] : null]));
    render_index(['title' => "{$p['name_ku']} — $price د.ع", 'description' => "$name — $price د.ع" . ($p['stock'] > 0 ? '' : ' (نەماوە / نفذت الكمية)') . ' · ' . ($s['store_name'] ?? ''),
        'image' => og_image_for($p['image']), 'type' => 'product', 'price' => $p['price'], 'path' => "/p/{$p['id']}", 'redirect' => "/#/product/{$p['id']}"]);
}
if ($path === '/robots.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: " . base_url() . "/sitemap.xml\n";
    exit;
}
if ($path === '/sitemap.xml') {
    header('Content-Type: application/xml; charset=utf-8');
    $base = base_url();
    $urls = array_merge(["$base/"], array_map(fn($r) => "$base/p/{$r['id']}", all('SELECT id FROM products WHERE active = 1 ORDER BY id')));
    echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" . implode("\n", array_map(fn($u) => '  <url><loc>' . attr($u) . '</loc></url>', $urls)) . "\n</urlset>\n";
    exit;
}
$ap = admin_path();
if ($path === $ap || strncmp($path, "$ap/", strlen($ap) + 1) === 0) {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    header('Cache-Control: no-cache');
    readfile(APP . '/admin.html');
    exit;
}
render_index();

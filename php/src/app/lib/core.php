<?php
// Core of the PHP version: config, database, tiny router, helpers shared by every route file.
// Same behaviour and JSON as the Node version (server/index.js), so the storefront and admin work unchanged.


define('ROOT', dirname(__DIR__, 2));            // the folder uploaded to public_html
define('APP', dirname(__DIR__));               // app/ (not reachable from the web)

// ---------------- config ----------------
function cfg(string $key, $default = null) {
    static $c = null;
    if ($c === null) {
        $file = ROOT . '/config.php';
        $c = is_file($file) ? (require $file) : [];
        if (!is_array($c)) $c = [];
    }
    $env = getenv('RP_' . strtoupper($key)); // lets tests / servers override without editing config.php
    if ($env !== false && $env !== '') return $env;
    return array_key_exists($key, $c) && $c[$key] !== '' && $c[$key] !== null ? $c[$key] : $default;
}
function is_prod(): bool { return cfg('env', 'production') === 'production'; }
define('UPLOAD_DIR', rtrim((string)cfg('upload_dir', ROOT . '/uploads'), '/'));
define('DATA_DIR', rtrim((string)cfg('data_dir', ROOT . '/data'), '/'));

// ---------------- errors ----------------
class HttpError extends Exception {
    public int $status; public string $errCode; public array $extra;
    public function __construct(int $status, string $code, array $extra = []) {
        parent::__construct($code); $this->status = $status; $this->errCode = $code; $this->extra = $extra;
    }
}
function fail(int $status, string $code, array $extra = []): never { throw new HttpError($status, $code, $extra); }

// ---------------- database ----------------
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', cfg('db_host', 'localhost'), cfg('db_port', '3306'), cfg('db_name', ''));
    $pdo = new PDO($dsn, (string)cfg('db_user', ''), (string)cfg('db_pass', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,   // real numbers come back as numbers (the JS does math on them)
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00', sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $st = db()->prepare($sql); $st->execute(array_values($p)); return $st; }
// SUM()/AVG() come back from MySQL as DECIMAL strings ("50000"); the storefront does math with them, so make them numbers.
function decimal_cols(PDOStatement $st): array {
    $cols = [];
    for ($i = 0, $n = $st->columnCount(); $i < $n; $i++) { $m = $st->getColumnMeta($i); if ($m && in_array($m['native_type'] ?? '', ['NEWDECIMAL', 'DECIMAL'], true)) $cols[] = $m['name']; }
    return $cols;
}
function fix_row(?array $r, array $dec): ?array {
    if ($r) foreach ($dec as $c) if (isset($r[$c]) && is_string($r[$c])) $r[$c] = str_contains($r[$c], '.') && (float)$r[$c] != (int)$r[$c] ? (float)$r[$c] : (int)$r[$c];
    return $r;
}
function one(string $sql, array $p = []): ?array { $st = q($sql, $p); $r = $st->fetch(); return $r === false ? null : fix_row($r, decimal_cols($st)); }
function all(string $sql, array $p = []): array { $st = q($sql, $p); $rows = $st->fetchAll(); $dec = $rows ? decimal_cols($st) : []; return $dec ? array_map(fn($r) => fix_row($r, $dec), $rows) : $rows; }
function val(string $sql, array $p = []) { $r = one($sql, $p); if (!$r) return null; $v = reset($r); return $v === false ? null : $v; }
function run(string $sql, array $p = []): int { return q($sql, $p)->rowCount(); }
function last_id(): int { return (int)db()->lastInsertId(); }
function in_list(array $xs): string { return implode(',', array_fill(0, max(1, count($xs)), '?')); }
function tx(callable $fn) {
    $pdo = db(); $pdo->beginTransaction();
    try { $r = $fn(); $pdo->commit(); return $r; } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
function now_utc(): string { return gmdate('Y-m-d H:i:s'); }
function ms(): int { return (int)floor(microtime(true) * 1000); }

// ---------------- small helpers (same meaning as the JS ones) ----------------
function toint($v, int $d = 0): int {
    if (is_int($v)) return $v;
    if (is_float($v)) return is_finite($v) ? (int)$v : $d;
    if (is_bool($v) || $v === null || is_array($v)) return $d;
    return preg_match('/^\s*([+-]?\d+)/', (string)$v, $m) ? (int)$m[1] : $d;
}
function num($v): float { return is_numeric($v) ? (float)$v : 0.0; }   // JS Number(x) || 0
function tostr($v, int $max = 500): string {
    if ($v === null || is_array($v)) return '';
    if (is_bool($v)) $v = $v ? 'true' : 'false';
    return mb_substr(trim((string)$v), 0, $max);
}
function norm_phone($p): string { return preg_replace('/[^\d+]/', '', tostr($p, 20)); }
function parse_json($v, $d) { if ($v === null || $v === '') return $d; $x = json_decode((string)$v, true); return $x ?? $d; }
function obj($a) { return is_array($a) && !$a ? new stdClass() : $a; }      // {} instead of [] in JSON
function pick(array $a, array $keys): array { $o = []; foreach ($keys as $k) $o[$k] = $a[$k] ?? null; return $o; }
function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }
function esc_html($s): string { return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function money_fmt($n): string { return number_format((float)$n, 0, '.', ','); }

// ---------------- settings ----------------
function settings(bool $fresh = false): array {
    static $s = null;
    if ($s === null || $fresh) { $s = []; foreach (all('SELECT `key`, `value` FROM settings') as $r) $s[$r['key']] = $r['value']; }
    return $s;
}
function set_setting(string $k, $v): void {
    run('INSERT INTO settings(`key`, `value`) VALUES(?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)', [$k, $v === null ? '' : (string)$v]);
    settings(true);
}

const ORDER_STATUSES = ['pending', 'preparing', 'shipping', 'delivered', 'cancelled'];
const ORDER_SOURCES = ['tiktok', 'instagram', 'facebook', 'snapchat', 'friend', 'influencer', 'google', 'store', 'other'];
const PUBLIC_SETTINGS = ['store_name', 'delivery_fee', 'free_delivery_over', 'referral_reward', 'flash_sale_end',
    'search_tags', 'cities', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'support_phone', 'delivery_zones', 'store_address', 'store_map_url', 'exchange_days', 'warranty_text',
    'slogan', 'seo_description', 'maintenance_mode', 'maintenance_message', 'price_display', 'cashback_percent', 'usd_rate', 'tradein_enabled', 'repair_enabled', 'proof_enabled',
    'reviews_enabled', 'reviews_buyers_only', 'bundle_discount_percent', 'store_hours'];
const ADMIN_EXTRA_SETTINGS = ['max_pending_orders', 'confirm_over', 'usd_round', 'min_profit',
    'repair_pickup', 'repair_pickup_fee', 'repair_free_diagnosis', 'repair_honest_pct', 'repair_open', 'repair_close', 'repair_closed_days', 'repair_slot_capacity'];
function admin_path(): string { return '/' . preg_replace('/[^\w-]/', '', trim((string)cfg('admin_path', '/admin'), '/')); }
function public_url(): string { return rtrim((string)cfg('public_url', ''), '/'); }

// ---------------- request ----------------
final class Req {
    public array $body = []; public array $query = []; public array $params = [];
    public ?array $user = null; public ?string $token = null; public string $ip = ''; public string $method = 'GET'; public string $path = '/';
}
function client_ip(): string {
    if (cfg('trust_proxy') && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) return trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    if (cfg('trust_proxy') && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return $_SERVER['HTTP_CF_CONNECTING_IP'];
    return $_SERVER['REMOTE_ADDR'] ?? '';
}
function auth_header(): string {
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $k) if (!empty($_SERVER[$k])) return $_SERVER[$k];
    if (function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') return $v;
    return '';
}

// ---------------- users & sessions ----------------
const STAFF_ROLES = ['admin', 'manager', 'orders', 'technician', 'products'];
function is_staff($role): bool { return in_array($role, STAFF_ROLES, true); }
function load_user(Req $req): void {
    $h = auth_header();
    if (strncmp($h, 'Bearer ', 7) !== 0) return;
    $token = substr($h, 7);
    $row = one('SELECT u.*, TIMESTAMPDIFF(SECOND, s.created_at, UTC_TIMESTAMP()) / 86400 AS session_age FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', [$token]);
    if (!$row) return;
    $days = $row['role'] === 'customer' ? 30 : 7; // staff sessions expire sooner
    if ((float)$row['session_age'] <= $days) { unset($row['session_age']); $req->user = $row; $req->token = $token; }
    else run('DELETE FROM sessions WHERE token = ?', [$token]);
}
function require_user(Req $req): void { if (!$req->user) fail(401, 'unauthorized'); }
function public_user(?array $u): ?array {
    if (!$u) return null;
    return ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'role' => $u['role'], 'wallet' => $u['wallet'], 'referral_code' => $u['referral_code'],
        'avatar' => $u['avatar'], 'created_at' => $u['created_at'], 'totp_enabled' => (bool)$u['totp_enabled']];
}
function hash_pw(string $p): string { return password_hash($p, PASSWORD_DEFAULT); }
function verify_pw(string $p, string $h): bool { return password_verify($p, $h); }
function new_referral_code(): string {
    for (;;) { $c = strtoupper(substr(rand_hex(4), 0, 8)); if (!one('SELECT 1 FROM users WHERE referral_code = ?', [$c])) return $c; }
}
function create_session(int $userId): string {
    $t = rand_hex(32);
    run('INSERT INTO sessions(token, user_id, created_at) VALUES(?, ?, UTC_TIMESTAMP())', [$t, $userId]);
    return $t;
}

// ---------------- rate limits (stored in the database) ----------------
const RL_WINDOW_MS = 15 * 60 * 1000;
const RL_LIMITS = ['ip' => 30, 'phone' => 8, 'coupon' => 15, 'revup' => 12];
function rl_failures(string $key): int { return (int)val('SELECT COUNT(*) FROM auth_failures WHERE `key` = ? AND ts > ?', [$key, ms() - RL_WINDOW_MS]); }
function check_limit(array $keys): void { foreach ($keys as $k) if (rl_failures($k) >= (RL_LIMITS[explode(':', $k)[0]] ?? 30)) fail(429, 'too_many_attempts'); }
function record_failure(array $keys): void { foreach ($keys as $k) run('INSERT INTO auth_failures(`key`, ts) VALUES(?, ?)', [$k, ms()]); }
function rate_limit(Req $req): void { $k = ["ip:{$req->ip}"]; check_limit($k); record_failure($k); }
function log_admin(Req $req, string $action, $details): void {
    run('INSERT INTO admin_log(user_id, user_name, action, details, created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())',
        [$req->user['id'] ?? null, $req->user['name'] ?? '', $action, is_string($details) ? $details : json_encode($details ?? '', JSON_UNESCAPED_UNICODE)]);
}

// ---------------- products ----------------
const VARIANT_COUNT_SQL = '(SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count';
function product_out(?array $p, bool $admin = false): ?array {
    if (!$p) return $p;
    $p['images'] = parse_json($p['images'] ?? '[]', []);
    $p['specs'] = parse_json($p['specs'] ?? '[]', []);
    $p['bundle_ids'] = parse_json($p['bundle_ids'] ?? '[]', []);
    $p['attrs'] = obj(parse_json($p['attrs'] ?? '{}', []));
    foreach (['featured', 'trending', 'flash_sale', 'active'] as $k) $p[$k] = (bool)($p[$k] ?? 0);
    $p['has_variants'] = ($p['variant_count'] ?? 0) > 0;
    if (!$admin) unset($p['cost_price'], $p['search_text'], $p['bundle_ids']);
    return $p;
}
function attrs_of(array $p): array { $a = $p['attrs'] ?? '{}'; return is_array($a) ? $a : (is_object($a) ? (array)$a : parse_json($a, [])); }
function public_variant(array $v): array { unset($v['cost_price']); return $v; }
function tags_of(int $pid): array { return all('SELECT t.id, t.name_ku, t.name_ar, t.name_en, t.color FROM tags t JOIN product_tags pt ON pt.tag_id = t.id WHERE pt.product_id = ? ORDER BY t.id', [$pid]); }
function variants_of(int $pid): array { return all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort, id', [$pid]); }
function attach_variants(array $list): array {
    $ids = array_values(array_map(fn($p) => $p['id'], array_filter($list, fn($p) => !empty($p['has_variants']))));
    if (!$ids) return $list;
    $rows = all('SELECT * FROM product_variants WHERE product_id IN (' . in_list($ids) . ') ORDER BY sort, id', $ids);
    foreach ($list as &$p) if (!empty($p['has_variants'])) $p['variants'] = array_values(array_filter($rows, fn($v) => $v['product_id'] === $p['id']));
    return $list;
}
function sync_product_from_variants(int $pid): void {
    $vs = variants_of($pid);
    if (!$vs) return;
    $c = $vs[0]; foreach ($vs as $v) if ($v['price'] < $c['price']) $c = $v;
    run('UPDATE products SET price = ?, old_price = ?, stock = ? WHERE id = ?', [$c['price'], $c['old_price'], array_sum(array_column($vs, 'stock')), $pid]);
}
function zones_of(array $s): array {
    $z = parse_json($s['delivery_zones'] ?? '[]', []);
    return is_array($z) ? array_values(array_filter($z, fn($x) => is_array($x) && !empty($x['name']))) : [];
}
function delivery_for(string $city, int $subtotal, array $s): int {
    $zones = zones_of($s);
    $zone = null; foreach ($zones as $z) if ($z['name'] === $city) { $zone = $z; break; }
    if ($zones && $city !== '' && !$zone) fail(400, 'invalid_city');
    $free = toint($s['free_delivery_over'] ?? 0);
    if ($free && $subtotal >= $free) return 0;
    return $zone ? max(0, toint($zone['fee'])) : toint($s['delivery_fee'] ?? 0);
}
function to_iqd($usd, ?array $s = null): ?int {
    $s = $s ?? settings();
    $rate = num($s['usd_rate'] ?? 0); $step = max(1, toint($s['usd_round'] ?? 250, 250));
    return $usd ? (int)(round(($usd * $rate) / $step) * $step) : null;
}
function reprice_usd(): int {
    $s = settings();
    if (!(num($s['usd_rate'] ?? 0) > 0)) return 0;
    $ps = all('SELECT id, price_usd, old_price_usd FROM products WHERE usd_priced = 1');
    foreach ($ps as $p) {
        run('UPDATE products SET price = ?, old_price = ? WHERE id = ?', [to_iqd($p['price_usd'], $s) ?: 0, to_iqd($p['old_price_usd'], $s), $p['id']]);
        foreach (all('SELECT id, price_usd, old_price_usd FROM product_variants WHERE product_id = ?', [$p['id']]) as $v)
            run('UPDATE product_variants SET price = ?, old_price = ? WHERE id = ?', [to_iqd($v['price_usd'], $s) ?: 0, to_iqd($v['old_price_usd'], $s), $v['id']]);
        sync_product_from_variants((int)$p['id']);
    }
    return count($ps);
}
function index_product(int $id): void {
    $p = one('SELECT p.name_ku, p.name_ar, p.name_en, p.brand, c.name_ku ck, c.name_ar ca, c.name_en ce FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [$id]);
    if (!$p) return;
    $labels = array_column(all('SELECT label FROM product_variants WHERE product_id = ?', [$id]), 'label');
    run('UPDATE products SET search_text = ? WHERE id = ?', [' ' . search_normalize(implode(' ', array_filter(array_merge(array_values($p), $labels)))) . ' ', $id]);
}
function rebuild_search_index(): void { foreach (all('SELECT id FROM products') as $r) index_product((int)$r['id']); }

// ---------------- router ----------------
$GLOBALS['ROUTES'] = [];
/** route('GET', '/api/products/:id', fn(Req $r) => [...], ['user']) — opts: 'user' (signed in) */
function route(string $method, string $pattern, callable $fn, array $opts = []): void {
    $re = '#^' . preg_replace('#:(\w+)#', '(?P<$1>[^/]+)', $pattern) . '$#';
    $GLOBALS['ROUTES'][] = [$method, $re, $fn, $opts, $pattern];
}
function json_out(int $status, $data): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function dispatch_api(Req $req): void {
    try {
        load_user($req);
        $allowed = false;
        foreach ($GLOBALS['ROUTES'] as [$m, $re, $fn, $opts]) {
            if (!preg_match($re, $req->path, $mm)) continue;
            if ($m !== $req->method) { $allowed = true; continue; }
            foreach ($mm as $k => $v) if (is_string($k)) $req->params[$k] = urldecode($v);
            if (in_array('user', $opts, true)) require_user($req);
            if (strncmp($req->path, '/api/admin/', 11) === 0 || $req->path === '/api/admin') admin_guard($req);
            $out = $fn($req);
            json_out(200, $out);
        }
        fail(404, 'not_found');
    } catch (HttpError $e) {
        json_out($e->status, array_merge(['error' => $e->errCode], $e->extra));
    } catch (OtpError $e) {
        $status = ['otp_wait' => 429, 'too_many_attempts' => 429, 'otp_send_failed' => 502][$e->errCode] ?? 400;
        json_out($status, array_merge(['error' => $e->errCode], $e->extra));
    } catch (Throwable $e) {
        error_log('[RamanPhone] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        json_out(500, ['error' => 'server_error'] + (is_prod() ? [] : ['message' => $e->getMessage(), 'at' => basename($e->getFile()) . ':' . $e->getLine()]));
    }
}

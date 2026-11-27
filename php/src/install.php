<?php
// One-time installer: checks the server, creates the tables + starter products, the admin account and config.php.
// It locks itself once config.php exists (delete install.php afterwards anyway).
$root = __DIR__;
$locked = is_file("$root/config.php");
$errors = []; $done = false;
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

$checks = [
    'PHP 8.1+' => version_compare(PHP_VERSION, '8.1.0', '>='),
    'PDO MySQL' => extension_loaded('pdo_mysql'),
    'GD (photos)' => extension_loaded('gd'),
    'cURL (SMS / Telegram)' => extension_loaded('curl'),
    'mbstring' => extension_loaded('mbstring'),
    'uploads/ writable' => is_writable("$root/uploads"),
    'data/ writable' => is_writable("$root/data"),
    'folder writable (config.php)' => is_writable($root),
];

if (!$locked && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $in = fn($k, $d = '') => trim((string)($_POST[$k] ?? $d));
    $db = ['host' => $in('db_host', 'localhost'), 'name' => $in('db_name'), 'user' => $in('db_user'), 'pass' => (string)($_POST['db_pass'] ?? '')];
    $phone = preg_replace('/[^\d+]/', '', $in('admin_phone'));
    $pass = (string)($_POST['admin_password'] ?? '');
    $adminPath = '/' . preg_replace('/[^\w-]/', '', trim($in('admin_path', 'admin'), '/'));
    $publicUrl = rtrim($in('public_url'), '/');
    if (in_array(false, $checks, true)) $errors[] = 'Fix the red items in the server check first.';
    if ($db['name'] === '' || $db['user'] === '') $errors[] = 'Database name and user are required.';
    if (strlen($phone) < 7) $errors[] = 'Admin phone is required.';
    if (strlen($pass) < 8 || $pass === 'admin123') $errors[] = 'Admin password: at least 8 characters (not admin123).';
    if ($adminPath === '/') $errors[] = 'Admin address is required.';
    if (!$errors) {
        try {
            $pdo = new PDO("mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4", $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $pdo->exec("SET time_zone = '+00:00', sql_mode = 'NO_ENGINE_SUBSTITUTION'");
            if ($pdo->query("SHOW TABLES LIKE 'products'")->fetch()) throw new RuntimeException('This database already has the store tables. Use an empty database (or delete the tables in phpMyAdmin).');
            foreach (['schema.sql', 'seed.sql'] as $f) {
                $sql = file_get_contents("$root/app/install/$f");
                foreach (preg_split('/;\s*\n(?=(?:INSERT|CREATE|SET|DROP|ALTER)\b)/', $sql) as $stmt) {
                    $stmt = trim(preg_replace('/^--.*$/m', '', $stmt));
                    if ($stmt !== '' && $stmt !== ';') $pdo->exec(rtrim($stmt, ';'));
                }
            }
            $code = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
            $pdo->prepare("INSERT INTO users(name, phone, password_hash, role, referral_code, created_at) VALUES('Admin', ?, ?, 'admin', ?, UTC_TIMESTAMP())")
                ->execute([$phone, password_hash($pass, PASSWORD_DEFAULT), $code]);
            $config = [
                'db_host' => $db['host'], 'db_name' => $db['name'], 'db_user' => $db['user'], 'db_pass' => $db['pass'],
                'admin_path' => $adminPath, 'public_url' => $publicUrl,
                'sms_provider' => 'console', 'whatsapp_token' => '', 'whatsapp_phone_number_id' => '', 'whatsapp_template' => '', 'whatsapp_template_lang' => 'en',
                'twilio_account_sid' => '', 'twilio_auth_token' => '', 'twilio_from' => '', 'twilio_messaging_service_sid' => '', 'otp_allowed_prefixes' => '+964',
                'telegram_bot_token' => $in('telegram_bot_token'), 'telegram_chat_id' => $in('telegram_chat_id'),
                'trust_proxy' => false, 'backup_keep' => 14, 'env' => 'production',
            ];
            file_put_contents("$root/config.php", "<?php\n// Written by install.php on " . gmdate('Y-m-d H:i') . " UTC. Never share this file.\nreturn " . var_export($config, true) . ";\n", LOCK_EX);
            @chmod("$root/config.php", 0640);
            // search index for the starter products
            define('RP_INSTALLING', true);
            require "$root/app/lib/core.php";
            require "$root/app/lib/search.php";
            rebuild_search_index();
            $done = true; $locked = true;
        } catch (Throwable $e) { $errors[] = $e->getMessage(); }
    }
}
$suggestPath = '/panel-' . substr(bin2hex(random_bytes(3)), 0, 6);
$detected = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
?><!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>تنصيب المتجر</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#F4F5F8;color:#1A1D2E;margin:0;padding:24px 16px}
.box{max-width:640px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
h1{margin:0 0 6px;font-size:24px}h2{font-size:17px;margin:22px 0 10px}p{color:#5B6070;line-height:1.7}
label{display:block;font-weight:700;margin:12px 0 6px}input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #DDE1E8;border-radius:12px;font-size:16px}
small{color:#7A8092}button,.btn{display:block;width:100%;margin-top:20px;padding:15px;border:0;border-radius:14px;background:#EE6C2D;color:#fff;font-size:17px;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}
.ok{color:#1F9D55}.bad{color:#D93B3B}.err{background:#FDECEC;color:#B42318;padding:12px 14px;border-radius:12px;margin:10px 0}
.good{background:#E7F7EE;color:#14632F;padding:14px;border-radius:12px}ul{padding-inline-start:20px;line-height:1.9}code{background:#F2F4F7;padding:2px 6px;border-radius:6px;direction:ltr;display:inline-block}
</style></head><body><div class="box">
<h1>🛒 تنصيب المتجر</h1>
<?php if ($done): ?>
  <div class="good"><b>✅ تم التنصيب بنجاح!</b></div>
  <ul>
    <li>المتجر: <a href="/">افتح المتجر</a></li>
    <li>لوحة الإدارة: <a href="<?= $h($adminPath) ?>"><code><?= $h($adminPath) ?></code></a> — احفظ هذا الرابط</li>
    <li>سجّل دخول برقمك وكلمة السر الي كتبتها، وفعّل التحقق بخطوتين من صفحة الأمان.</li>
    <li><b>امسح ملف <code>install.php</code></b> من File Manager (هو مقفول هسة، بس الأفضل تمسحه).</li>
  </ul>
<?php elseif ($locked): ?>
  <div class="good">المتجر منصّب. لإعادة التنصيب امسح <code>config.php</code> وجداول قاعدة البيانات أولاً.<br><b>امسح install.php</b> من File Manager.</div>
<?php else: ?>
  <p>عبّي المعلومات مرة وحدة، والصفحة تسوي قاعدة البيانات والمنتجات التجريبية وحساب المدير.</p>
  <h2>فحص السيرفر</h2>
  <ul><?php foreach ($checks as $k => $ok): ?><li class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✔' : '✘' ?> <?= $h($k) ?></li><?php endforeach; ?></ul>
  <?php foreach ($errors as $e): ?><div class="err"><?= $h($e) ?></div><?php endforeach; ?>
  <form method="post" autocomplete="off">
    <h2>قاعدة البيانات (من Hostinger ← Databases)</h2>
    <label>Host</label><input name="db_host" value="<?= $h($_POST['db_host'] ?? 'localhost') ?>" dir="ltr">
    <label>اسم قاعدة البيانات</label><input name="db_name" value="<?= $h($_POST['db_name'] ?? '') ?>" dir="ltr" required placeholder="u123456789_store">
    <label>اسم المستخدم</label><input name="db_user" value="<?= $h($_POST['db_user'] ?? '') ?>" dir="ltr" required placeholder="u123456789_admin">
    <label>كلمة سر قاعدة البيانات</label><input name="db_pass" type="password" dir="ltr">
    <h2>حساب المدير</h2>
    <label>رقم موبايلك</label><input name="admin_phone" value="<?= $h($_POST['admin_phone'] ?? '') ?>" dir="ltr" required placeholder="07501234567">
    <label>كلمة سر قوية (8 أحرف أو أكثر)</label><input name="admin_password" type="password" dir="ltr" required minlength="8">
    <label>رابط لوحة الإدارة السري</label><input name="admin_path" value="<?= $h($_POST['admin_path'] ?? $suggestPath) ?>" dir="ltr"><small>مثل <?= $h($suggestPath) ?> — محد يعرفه غيرك</small>
    <label>رابط موقعك</label><input name="public_url" value="<?= $h($_POST['public_url'] ?? $detected) ?>" dir="ltr">
    <h2>إشعارات التلكرام (اختياري)</h2>
    <label>Bot token</label><input name="telegram_bot_token" value="<?= $h($_POST['telegram_bot_token'] ?? '') ?>" dir="ltr">
    <label>Chat ID</label><input name="telegram_chat_id" value="<?= $h($_POST['telegram_chat_id'] ?? '') ?>" dir="ltr">
    <button>نصّب المتجر</button>
  </form>
<?php endif; ?>
</div></body></html>

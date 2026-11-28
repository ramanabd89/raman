<?php
// One-time installer (Kurdish / Arabic / English): server check → database tables + starter data → admin account
// → config.php. Locks itself once config.php exists, and can delete itself with one click.
declare(strict_types=1);

define('ROOT', __DIR__);
define('APP', ROOT . '/app');
require APP . '/Core/helpers.php';
require APP . '/Core/Autoloader.php';
App\Core\Autoloader::register(APP);

use App\Core\Installer;
use App\Core\Lang;

$lang = in_array($_GET['lang'] ?? '', Lang::LANGS, true) ? $_GET['lang'] : (in_array($_POST['lang'] ?? '', Lang::LANGS, true) ? $_POST['lang'] : 'ku');
Lang::set($lang);
header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");

$locked = is_file(ROOT . '/config.php');
$errors = []; $done = null; $deleted = false;

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && ($_POST['action'] ?? '') === 'delete' && $locked) {
    $deleted = @unlink(__FILE__);
}

if (!$locked && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && ($_POST['action'] ?? '') === 'install') {
    $in = fn($k, $d = '') => trim((string)($_POST[$k] ?? $d));
    $data = ['db_host' => $in('db_host', 'localhost'), 'db_port' => $in('db_port', '3306'), 'db_name' => $in('db_name'), 'db_user' => $in('db_user'), 'db_pass' => (string)($_POST['db_pass'] ?? ''),
        'admin_phone' => norm_phone($in('admin_phone')), 'admin_password' => (string)($_POST['admin_password'] ?? ''),
        'admin_path' => preg_replace('/[^\w-]/', '', trim($in('admin_path'), '/')) ?: Installer::randomAdminPath(),
        'store_name' => tostr($in('store_name'), 80), 'default_lang' => $in('default_lang', 'ku')];
    if (in_array(false, Installer::checks(), true)) $errors[] = __('install.fix_checks');
    if ($data['db_name'] === '' || $data['db_user'] === '') $errors[] = __('install.db_required');
    if (strlen($data['admin_phone']) < 7) $errors[] = __('install.phone_required');
    if (strlen($data['admin_password']) < 8 || $data['admin_password'] === 'admin123') $errors[] = __('install.password_rule');
    if (in_array($data['admin_path'], ['api', 'ku', 'ar', 'en', 'p', 'print', 'certificate', 'css', 'js', 'img', 'admin', 'uploads', 'vendor'], true)) $errors[] = __('install.path_reserved');
    if (!$errors) {
        try { Installer::install($data); $done = $data; $locked = true; }
        catch (RuntimeException $e) { $errors[] = __('install.err_' . $e->getMessage()); }
        catch (Throwable $e) { $errors[] = __('install.err_db') . ' ' . $e->getMessage(); }
    }
}
$checks = Installer::checks();
$suggest = Installer::randomAdminPath();
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/install.php')), '/.') . '/';
$v = fn($k, $d = '') => e($_POST[$k] ?? $d);
?><!doctype html>
<html lang="<?= Lang::HREFLANG[$lang] ?>" dir="<?= Lang::dir() ?>">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title><?= e(__('install.title')) ?></title>
<link rel="stylesheet" href="<?= e($base) ?>css/install.css">
</head>
<body><div class="box">
  <nav class="langs"><?php foreach (Lang::LANGS as $l): ?><a class="<?= $l === $lang ? 'on' : '' ?>" href="?lang=<?= $l ?>"><?= e(__('lang.name', [], $l)) ?></a><?php endforeach; ?></nav>
  <h1>🛒 <?= e(__('install.title')) ?></h1>
<?php if ($deleted): ?>
  <div class="good"><?= e(__('install.deleted')) ?></div>
  <a class="btn" href="<?= e($base) ?>"><?= e(__('install.open_store')) ?></a>
<?php elseif ($done): ?>
  <div class="good"><b>✅ <?= e(__('install.done')) ?></b></div>
  <ul>
    <li><a href="<?= e($base) ?>"><?= e(__('install.open_store')) ?></a></li>
    <li><?= e(__('install.admin_at')) ?> <a href="<?= e($base . $done['admin_path']) ?>"><code><?= e($base . $done['admin_path']) ?></code></a> — <?= e(__('install.save_link')) ?></li>
    <li><?= e(__('install.next_steps')) ?></li>
  </ul>
  <form method="post"><input type="hidden" name="action" value="delete"><input type="hidden" name="lang" value="<?= e($lang) ?>"><button class="btn danger"><?= e(__('install.delete_me')) ?></button></form>
<?php elseif ($locked): ?>
  <div class="good"><?= e(__('install.locked')) ?></div>
  <form method="post"><input type="hidden" name="action" value="delete"><input type="hidden" name="lang" value="<?= e($lang) ?>"><button class="btn danger"><?= e(__('install.delete_me')) ?></button></form>
<?php else: ?>
  <p><?= e(__('install.intro')) ?></p>
  <h2><?= e(__('install.checks')) ?></h2>
  <ul class="checks"><?php foreach ($checks as $k => $ok): ?><li class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✔' : '✘' ?> <?= e(__('install.check_' . $k)) ?></li><?php endforeach; ?></ul>
  <?php foreach ($errors as $err): ?><div class="err"><?= e($err) ?></div><?php endforeach; ?>
  <form method="post" autocomplete="off">
    <input type="hidden" name="action" value="install"><input type="hidden" name="lang" value="<?= e($lang) ?>">
    <h2><?= e(__('install.database')) ?></h2>
    <label><?= e(__('install.db_host')) ?></label><input name="db_host" value="<?= $v('db_host', 'localhost') ?>" dir="ltr">
    <label><?= e(__('install.db_name')) ?></label><input name="db_name" value="<?= $v('db_name') ?>" dir="ltr" required placeholder="u123456789_store">
    <label><?= e(__('install.db_user')) ?></label><input name="db_user" value="<?= $v('db_user') ?>" dir="ltr" required placeholder="u123456789_admin">
    <label><?= e(__('install.db_pass')) ?></label><input name="db_pass" type="password" dir="ltr">
    <h2><?= e(__('install.store')) ?></h2>
    <label><?= e(__('install.store_name')) ?></label><input name="store_name" value="<?= $v('store_name', 'RamanPhone') ?>">
    <label><?= e(__('install.default_lang')) ?></label>
    <select name="default_lang"><?php foreach (Lang::LANGS as $l): ?><option value="<?= $l ?>" <?= ($_POST['default_lang'] ?? $lang) === $l ? 'selected' : '' ?>><?= e(__('lang.name', [], $l)) ?></option><?php endforeach; ?></select>
    <h2><?= e(__('install.admin')) ?></h2>
    <label><?= e(__('install.admin_phone')) ?></label><input name="admin_phone" value="<?= $v('admin_phone') ?>" dir="ltr" required placeholder="07501234567">
    <label><?= e(__('install.admin_password')) ?></label><input name="admin_password" type="password" dir="ltr" required minlength="8">
    <label><?= e(__('install.admin_path')) ?></label><input name="admin_path" value="<?= $v('admin_path', $suggest) ?>" dir="ltr"><small><?= e(__('install.admin_path_hint')) ?></small>
    <button class="btn"><?= e(__('install.submit')) ?></button>
  </form>
<?php endif; ?>
</div></body></html>

<?php
/** @var int $status @var string $key */
use App\Core\Lang;
use App\Models\Setting;
$store = 'RamanPhone';
try { $store = Setting::get('store_name', 'RamanPhone'); } catch (\Throwable) {}
?><!doctype html>
<html lang="<?= Lang::HREFLANG[Lang::current()] ?>" dir="<?= Lang::dir() ?>">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
  <title><?= e(__("page.$key")) ?> — <?= e($store) ?></title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="<?= e(path('favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(path('css/style.css')) ?>">
</head>
<body>
  <main class="container error-page">
    <div class="empty">
      <div class="err-code num"><?= (int)$status ?></div>
      <h1><?= e(__("page.$key")) ?></h1>
      <p><?= e($status === 503 ? (Setting::get('maintenance_message') ?: __('page.maintenance_sub')) : __("page.{$key}_sub")) ?></p>
      <?php if ($status !== 503): ?><a class="btn btn-primary" href="<?= e(path(Lang::current() . '/')) ?>"><?= e(__('page.back_home')) ?></a><?php endif; ?>
    </div>
  </main>
</body>
</html>

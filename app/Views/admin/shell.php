<?php use App\Core\Url; ?><!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="rp-base" content="<?= e(Url::base()) ?>">
  <title>Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="<?= e(path('favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/style.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('admin/admin.css')) ?>">
</head>
<body>
  <div id="root"></div>
  <div class="toast" id="toast"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
  <script src="<?= e(asset('admin/i18n.js')) ?>"></script>
  <script src="<?= e(asset('admin/admin.js')) ?>"></script>
</body>
</html>

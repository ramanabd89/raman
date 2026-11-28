<?php
/** @var App\Services\SeoService $seo  @var string $content */
use App\Core\Lang;
use App\Core\Url;
use App\Models\Setting;
$lang = Lang::current();
$store = Setting::get('store_name', 'RamanPhone');
?><!doctype html>
<html lang="<?= Lang::HREFLANG[$lang] ?>" dir="<?= Lang::dir() ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#ffffff">
  <meta name="rp-base" content="<?= e(Url::base()) ?>">
  <meta name="rp-lang" content="<?= e($lang) ?>">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="<?= e($store) ?>">
  <?= $seo->head() ?>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="icon" href="<?= e(path('favicon.svg')) ?>" type="image/svg+xml">
  <link rel="apple-touch-icon" href="<?= e(path('img/icon-192.png')) ?>">
  <link rel="manifest" href="<?= e(path('manifest.json')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/style.css')) ?>">
</head>
<body>
  <header class="header">
    <div class="container">
      <a href="<?= e(path($lang . '/')) ?>" class="logo"><span id="storeName"><?= e($store) ?></span><span class="dot"></span></a>
      <nav class="desktop-nav" id="desktopNav">
        <a href="<?= e(path($lang . '/')) ?>"><?= e(__('page.home')) ?></a>
        <a href="<?= e(path($lang . '/repair')) ?>"><?= e(__('page.repair')) ?></a>
        <a href="<?= e(path($lang . '/tradein')) ?>"><?= e(__('page.tradein')) ?></a>
        <a href="<?= e(path($lang . '/finder')) ?>"><?= e(__('page.finder')) ?></a>
        <a href="<?= e(path($lang . '/used')) ?>"><?= e(__('page.used')) ?></a>
        <a href="<?= e(path($lang . '/faq')) ?>"><?= e(__('page.faq')) ?></a>
      </nav>
      <div class="header-actions">
        <button class="icon-btn" id="btnSearch" aria-label="search"></button>
        <span class="sep"></span>
        <a class="icon-btn brand" id="btnCart" href="<?= e(path($lang . '/cart')) ?>" aria-label="cart"></a>
        <button class="icon-btn" id="btnMenu" aria-label="menu"></button>
      </div>
    </div>
  </header>

  <main id="app"><?= $content ?></main>
  <noscript><p class="container ssr-note"><?= e(__('page.noscript')) ?></p></noscript>

  <footer class="footer">
    <div class="container">
      <div class="logo"><span class="js-store-name"><?= e($store) ?></span><span class="dot"></span></div>
      <nav class="footer-langs" aria-label="language">
        <?php foreach (Lang::LANGS as $l): ?><a href="<?= e(path($l . '/' . $seo->path)) ?>" hreflang="<?= Lang::HREFLANG[$l] ?>" lang="<?= Lang::HREFLANG[$l] ?>"><?= e(__('lang.name', [], $l)) ?></a><?php endforeach; ?>
      </nav>
      <div>© <span id="year"><?= gmdate('Y') ?></span></div>
    </div>
  </footer>

  <nav class="tabbar" id="tabbar" aria-label="main"></nav>
  <div class="buybar hidden" id="buybar"></div>
  <div class="overlay" id="overlay"></div>
  <div class="sheet" id="searchSheet"></div>
  <div class="sheet ui-sheet" id="uiSheet"></div>
  <aside class="drawer" id="menuDrawer"></aside>
  <aside class="drawer full" id="catDrawer"></aside>
  <div class="toast" id="toast"></div>

  <script src="<?= e(asset('js/i18n.js')) ?>" defer></script>
  <script src="<?= e(asset('js/app.js')) ?>" defer></script>
</body>
</html>

<?php
/** @var array $categories @var array $products @var array $banners */
use App\Core\Lang;
use App\Models\Category;
use App\Services\SeoService;
$l = Lang::current();
?>
<div class="container ssr">
  <h1 class="ssr-title"><?= e(__('seo.home_title', ['store' => SeoService::store()])) ?></h1>
  <p class="ssr-lead"><?= e(__('seo.home_desc')) ?></p>
  <nav class="ssr-cats" aria-label="<?= e(__('page.categories')) ?>">
    <?php foreach ($categories as $c): ?><a href="<?= e(path("$l/category/" . Category::urlKey($c))) ?>"><?= e(SeoService::L($c, 'name')) ?></a><?php endforeach; ?>
    <a href="<?= e(path("$l/repair")) ?>"><?= e(__('page.repair')) ?></a>
    <a href="<?= e(path("$l/tradein")) ?>"><?= e(__('page.tradein')) ?></a>
    <a href="<?= e(path("$l/finder")) ?>"><?= e(__('page.finder')) ?></a>
  </nav>
  <h2 class="section-title"><?= e(__('page.featured')) ?></h2>
  <div class="grid"><?php foreach ($products as $p) require __DIR__ . '/_card.php'; ?></div>
</div>

<?php
/** @var array $cat @var array $products @var array $crumbs */
use App\Services\SeoService;
?>
<div class="container ssr">
  <?php require __DIR__ . '/_crumbs.php'; ?>
  <h1 class="ssr-title"><?= e(SeoService::L($cat, 'name')) ?></h1>
  <div class="grid"><?php foreach ($products as $p) require __DIR__ . '/_card.php'; ?></div>
</div>

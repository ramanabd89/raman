<?php
/** @var array $p @var array $variants @var array $crumbs @var array $related */
use App\Services\SeoService;
$src = preg_match('#^https?://#', (string)$p['image']) ? $p['image'] : path((string)($p['image'] ?: 'img/placeholder.svg'));
?>
<div class="container ssr">
  <?php require __DIR__ . '/_crumbs.php'; ?>
  <article class="ssr-product">
    <img src="<?= e($src) ?>" alt="<?= e(SeoService::L($p, 'name')) ?>" width="480" height="480">
    <div>
      <?php if (!empty($p['brand'])): ?><div class="c-brand"><?= e($p['brand']) ?></div><?php endif; ?>
      <h1><?= e(SeoService::L($p, 'name')) ?></h1>
      <p class="prices"><span class="price"><span class="num"><?= iqd($p['price']) ?></span> <small><?= e(__('currency')) ?></small></span>
        <?php if (!empty($p['old_price']) && $p['old_price'] > $p['price']): ?> <s class="old-price num"><?= iqd($p['old_price']) ?></s><?php endif; ?></p>
      <p><?= e(__($p['stock'] > 0 ? 'seo.in_stock' : 'seo.out_of_stock')) ?></p>
      <?php if ($variants): ?><ul class="ssr-variants"><?php foreach ($variants as $v): ?><li><?= e($v['label']) ?> — <span class="num"><?= iqd($v['price']) ?></span> <?= e(__('currency')) ?></li><?php endforeach; ?></ul><?php endif; ?>
      <?php if (SeoService::L($p, 'desc')): ?><h2><?= e(__('page.description')) ?></h2><p><?= nl2br(e(SeoService::L($p, 'desc'))) ?></p><?php endif; ?>
      <?php if (!empty($p['specs'])): ?><h2><?= e(__('page.specs')) ?></h2><table class="specs"><?php foreach ($p['specs'] as $s): ?><tr><th><?= e($s['k']) ?></th><td><?= e($s['v']) ?></td></tr><?php endforeach; ?></table><?php endif; ?>
    </div>
  </article>
  <?php if ($related): ?><div class="grid"><?php foreach ($related as $p) require __DIR__ . '/_card.php'; ?></div><?php endif; ?>
</div>

<?php
/** @var array $p one product (Product::out) */
use App\Core\Lang;
use App\Models\Product;
use App\Services\SeoService;
$src = preg_match('#^https?://#', (string)$p['image']) ? $p['image'] : path((string)($p['image'] ?: 'img/placeholder.svg'));
?>
<a class="p-card ssr-card" href="<?= e(path(Lang::current() . '/product/' . Product::urlKey($p))) ?>">
  <div class="img"><img src="<?= e($src) ?>" alt="<?= e(SeoService::L($p, 'name')) ?>" loading="lazy" width="300" height="300"></div>
  <div class="body">
    <?php if (!empty($p['brand'])): ?><div class="c-brand"><?= e($p['brand']) ?></div><?php endif; ?>
    <div class="nm"><?= e(SeoService::L($p, 'name')) ?></div>
    <div class="prices"><span class="price"><span class="num"><?= iqd($p['price']) ?></span> <small><?= e(__('currency')) ?></small></span>
      <?php if (!empty($p['old_price']) && $p['old_price'] > $p['price']): ?><s class="old-price num"><?= iqd($p['old_price']) ?></s><?php endif; ?></div>
  </div>
</a>

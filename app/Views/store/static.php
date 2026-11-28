<?php
/** @var string $seg  @var array $faqs */
use App\Services\SeoService;
?>
<div class="container ssr">
  <h1 class="ssr-title"><?= e(__("page.$seg")) ?></h1>
  <?php if ($seg === 'faq'): ?>
    <?php foreach ($faqs as $f): ?><details class="card faq"><summary><?= e(SeoService::L($f, 'q')) ?></summary><p><?= nl2br(e(SeoService::L($f, 'a'))) ?></p></details><?php endforeach; ?>
  <?php else: ?>
    <p class="ssr-lead"><?= e(__("page.{$seg}_intro")) ?></p>
    <p class="ssr-loading"><?= e(__('page.loading')) ?></p>
  <?php endif; ?>
</div>

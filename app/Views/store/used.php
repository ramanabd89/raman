<?php
/** @var array $products @var array $crumbs */
?>
<div class="container ssr">
  <?php require __DIR__ . '/_crumbs.php'; ?>
  <h1 class="ssr-title"><?= e(__('page.used')) ?></h1>
  <p class="ssr-lead"><?= e(__('page.used_intro')) ?></p>
  <ul class="ssr-grades">
    <?php foreach (['A+', 'A', 'B', 'C'] as $g): ?><li><b><?= e($g) ?></b> — <?= e(__('used.grade_' . strtolower(str_replace('+', 'plus', $g)))) ?></li><?php endforeach; ?>
  </ul>
  <?php if ($products): ?>
    <div class="grid"><?php foreach ($products as $p) require __DIR__ . '/_card.php'; ?></div>
  <?php else: ?>
    <p class="ssr-loading"><?= e(__('page.used_empty')) ?></p>
  <?php endif; ?>
</div>

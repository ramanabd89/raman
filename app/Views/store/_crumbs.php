<?php /** @var array $crumbs [name, path] */ use App\Core\Lang; ?>
<nav class="ssr-crumbs" aria-label="breadcrumb"><?php foreach ($crumbs as $i => [$name, $cpath]): ?><?= $i ? ' › ' : '' ?><a href="<?= e(path(Lang::current() . "/" . $cpath)) ?>"><?= e($name) ?></a><?php endforeach; ?></nav>

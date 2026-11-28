<?php
/** @var array $w Repair::warranty() */
use App\Core\Lang;
use App\Models\Setting;
use App\Services\SeoService;
$size = 'a4';
$title = __('print.warranty_cert') . ' ' . $w['code'];
require __DIR__ . '/_head.php';
$verify = url(Lang::current() . '/warranty/' . $w['code']);
?>
<div class="toolbar no-print"><button class="pbtn" data-print><?= e(__('print.print')) ?></button></div>
<div class="sheet cert">
  <b class="store"><?= e(Setting::get('store_name', 'RamanPhone')) ?></b>
  <h1><?= e(__('print.warranty_cert')) ?></h1>
  <div class="code num"><?= e($w['code']) ?></div>
  <p class="dev"><?= e($w['brand'] . ' ' . $w['model']) ?> · <?= e(SeoService::L($w['service'], 'name')) ?> · <?= e(__('print.q_' . $w['quality'])) ?></p>
  <p class="valid <?= $w['valid'] ? 'ok' : 'no' ?>"><?= e($w['valid'] ? __('print.valid_until', ['x' => $w['warranty_until']]) : __('print.expired')) ?></p>
  <div class="qr-box"><div class="qr" data-qr="<?= e($verify) ?>"></div><small><?= e(__('print.scan')) ?></small><div class="num url"><?= e($verify) ?></div></div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="<?= e(path('js/print.js')) ?>"></script>
</body></html>

<?php
/** @var array $r repair (Repair::out, staff)  @var string $size */
use App\Core\Lang;
use App\Models\Setting;
use App\Services\SeoService;
$title = __('print.repair_ticket') . ' ' . $r['code'];
require __DIR__ . '/_head.php';
$track = url(Lang::current() . '/repairs/' . $r['code']);
?>
<div class="toolbar no-print">
  <button class="pbtn" data-print><?= e(__('print.print')) ?></button>
  <a class="pbtn" href="?size=a4"><?= e(__('print.a4')) ?></a><a class="pbtn" href="?size=80"><?= e(__('print.thermal')) ?></a>
</div>
<div class="sheet">
  <header class="ph">
    <div><b class="store"><?= e(Setting::get('store_name', 'RamanPhone')) ?></b><?php if ($t = Setting::get('support_phone')): ?><div class="num"><?= e($t) ?></div><?php endif; ?></div>
    <div class="doc"><b><?= e(__('print.repair_ticket')) ?></b><div class="code num"><?= e($r['code']) ?></div><div class="num"><?= e(substr($r['created_at'], 0, 16)) ?></div></div>
  </header>
  <section class="who">
    <div><span><?= e(__('print.customer')) ?></span><b><?= e($r['customer_name']) ?></b></div>
    <div><span><?= e(__('print.phone')) ?></span><b class="num"><?= e($r['phone']) ?></b></div>
    <div><span><?= e(__('print.device')) ?></span><b><?= e($r['brand'] . ' ' . $r['model']) ?></b></div>
    <div><span><?= e(__('print.service')) ?></span><b><?= e(SeoService::L($r['service'], 'name')) ?></b></div>
    <div><span><?= e(__('print.quality')) ?></span><b><?= e(__('print.q_' . $r['quality'])) ?></b></div>
    <div><span><?= e(__('print.quoted')) ?></span><b class="num"><?= $r['quality'] === 'diagnosis' ? e(__('print.q_diagnosis')) : iqd($r['total']) . ' ' . e(__('currency')) ?></b></div>
    <?php if ($r['imei']): ?><div><span><?= e(__('print.imei')) ?></span><b class="num"><?= e($r['imei']) ?></b></div><?php endif; ?>
    <?php if ($r['problem']): ?><div class="wide"><span><?= e(__('print.problem')) ?></span><b><?= e($r['problem']) ?></b></div><?php endif; ?>
  </section>
  <div class="qr-box"><div class="qr" data-qr="<?= e($track) ?>"></div><small><?= e(__('print.track')) ?></small></div>
  <p class="sign"><?= e(__('print.signature')) ?>: ____________________</p>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="<?= e(path('js/print.js')) ?>"></script>
</body></html>

<?php
/** @var array $o order with items  @var string $size */
use App\Models\Setting;
$title = __('print.invoice') . ' #' . $o['id'];
require __DIR__ . '/_head.php';
$store = Setting::get('store_name', 'RamanPhone');
$rows = [[__('print.subtotal'), $o['subtotal'], false]];
if ($o['bundle_discount']) $rows[] = [__('print.bundle'), -$o['bundle_discount'], true];
if ($o['discount']) $rows[] = [__('print.coupon') . ' ' . $o['coupon_code'], -$o['discount'], true];
if ($o['tradein_credit']) $rows[] = [__('print.tradein') . (!empty($o['tradein']['label']) ? ' (' . $o['tradein']['label'] . ')' : ''), -$o['tradein_credit'], true];
$rows[] = [__('print.delivery'), $o['delivery_fee'], false];
if ($o['wallet_used']) $rows[] = [__('print.wallet'), -$o['wallet_used'], true];
?>
<div class="toolbar no-print">
  <button class="pbtn" data-print><?= e(__('print.print')) ?></button>
  <a class="pbtn" href="?size=a4"><?= e(__('print.a4')) ?></a><a class="pbtn" href="?size=80"><?= e(__('print.thermal')) ?></a>
</div>
<div class="sheet">
  <header class="ph">
    <div><b class="store"><?= e($store) ?></b><?php if ($a = Setting::get('store_address')): ?><div><?= e($a) ?></div><?php endif; ?><?php if ($t = Setting::get('support_phone')): ?><div class="num"><?= e($t) ?></div><?php endif; ?></div>
    <div class="doc"><b><?= e(__('print.invoice')) ?></b><div class="num"><?= e(__('print.order_no', ['id' => $o['id']])) ?></div><div class="num"><?= e(substr($o['created_at'], 0, 16)) ?></div></div>
  </header>
  <section class="who">
    <div><span><?= e(__('print.customer')) ?></span><b><?= e($o['customer_name']) ?></b></div>
    <div><span><?= e(__('print.phone')) ?></span><b class="num"><?= e($o['phone']) ?></b></div>
    <div class="wide"><span><?= e(__('print.address')) ?></span><b><?= e($o['city'] . ' — ' . $o['address']) ?></b></div>
  </section>
  <table class="items">
    <thead><tr><th><?= e(__('print.item')) ?></th><th><?= e(__('print.qty')) ?></th><th><?= e(__('print.unit_price')) ?></th><th><?= e(__('print.line_total')) ?></th></tr></thead>
    <tbody><?php foreach ($o['items'] as $i): ?>
      <tr><td><?= e($i['name']) ?><?= $i['variant_label'] ? ' <small>(' . e($i['variant_label']) . ')</small>' : '' ?><?= $i['imei'] ? '<div class="imei num">' . e(__('print.imei')) . ': ' . e($i['imei']) . '</div>' : '' ?></td>
        <td class="num"><?= (int)$i['qty'] ?></td><td class="num"><?= iqd($i['price']) ?></td><td class="num"><?= iqd($i['price'] * $i['qty']) ?></td></tr>
    <?php endforeach; ?></tbody>
  </table>
  <table class="totals">
    <?php foreach ($rows as [$label, $amount, $minus]): ?><tr><td><?= e($label) ?></td><td class="num"><?= $minus ? '-' : '' ?><?= iqd(abs($amount)) ?></td></tr><?php endforeach; ?>
    <tr class="grand"><td><?= e(__('print.total')) ?></td><td class="num"><?= iqd($o['total']) ?> <?= e(__('currency')) ?></td></tr>
    <tr><td><?= e(__('print.payment')) ?></td><td><?= e(__('print.cod')) ?></td></tr>
  </table>
  <?php if (Setting::int('exchange_days') > 0): ?><p class="note"><?= e(__('print.exchange', ['x' => Setting::int('exchange_days')])) ?></p><?php endif; ?>
  <p class="thanks"><?= e(__('print.thanks')) ?></p>
</div>
<script src="<?= e(path('js/print.js')) ?>"></script>
</body></html>

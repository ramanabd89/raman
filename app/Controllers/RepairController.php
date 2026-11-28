<?php
namespace App\Controllers;

use App\Config\Config;
use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Core\Url;
use App\Models\Repair;
use App\Services\TelegramService;

/** Customer side of the repair center: catalogue, quote, booking, tracking, approval, comments, warranty lookup. */
final class RepairController extends Controller
{
    private function needEnabled(): void { if (!Repair::enabled()) throw new HttpException(400, 'repair_disabled'); }

    public function catalog(): array { return Repair::enabled() ? Repair::catalog() : ['enabled' => false]; }
    public function quote(): array
    {
        $this->needEnabled();
        $q = Repair::quote(tostr($this->qs('brand', ''), 40), tostr($this->qs('model', ''), 80), $this->qs('service', 0));
        return ['options' => $q['options'], 'duration_min' => $q['duration_min'], 'advice' => $q['advice'], 'needs_diagnosis' => (bool)$q['service']['needs_diagnosis']];
    }
    public function slots(): array { return Repair::slots((string)$this->qs('date', '')); }

    public function book(): array
    {
        $this->needEnabled();
        $r = Repair::book($this->user(), $this->req->body);
        TelegramService::newRepair($r);
        return Repair::out($r);
    }
    public function list(): array { return array_map(fn($r) => Repair::out($r), Model::all('SELECT * FROM repairs WHERE user_id = ? ORDER BY id DESC', [$this->uid()])); }
    public function show(): array { return Repair::out(Repair::ofUser($this->req->param('code'), $this->uid())); }

    public function decision(): array
    {
        $r = Repair::ofUser($this->req->param('code'), $this->uid());
        $ok = (bool)$this->in('approve');
        Repair::decide($r, $ok, $this->user()['name']);
        TelegramService::event('tg_repair_decision', $ok ? 'tg.repair_approved' : 'tg.repair_rejected', ['code' => $r['code'], 'x' => iqd($r['extra_price'])]);
        return Repair::out(Repair::find((int)$r['id']));
    }

    public function comment(): array
    {
        $r = Repair::ofUser($this->req->param('code'), $this->uid());
        Repair::comment($r, 'customer', $this->user()['name'], $this->in('body'));
        TelegramService::event('tg_repair_comment', 'tg.repair_comment', ['code' => $r['code'], 'name' => $r['customer_name'], 'device' => "{$r['brand']} {$r['model']}",
            'body' => tostr($this->in('body'), 1000), 'link' => Url::to(Config::adminPath()) . '#/repairs']);
        return Repair::out(Repair::find((int)$r['id']));
    }

    public function cancel(): array
    {
        $r = Repair::ofUser($this->req->param('code'), $this->uid());
        if ($r['status'] !== 'booked') throw new HttpException(409, 'cannot_cancel');
        Model::run("UPDATE repairs SET status = 'cancelled', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$r['id']]);
        Repair::event((int)$r['id'], 'cancelled', null, $this->user()['name']);
        TelegramService::event('tg_repair_decision', 'tg.repair_cancelled', ['code' => $r['code']]);
        return ['ok' => true];
    }

    /** Public: repair certificate code (R…) or the IMEI of a phone bought here. No personal data. */
    public function warranty(): array
    {
        $code = tostr($this->req->param('code'), 20);
        if ($w = Repair::warranty($code)) return $w;
        if (preg_match('/^[\dA-Za-z]{8,20}$/', $code)) {
            $s = Model::one("SELECT oi.name, oi.variant_label, oi.imei, o.updated_at FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.imei = ? AND o.status = 'delivered' ORDER BY o.id DESC LIMIT 1", [$code]);
            if ($s) return ['kind' => 'sale', 'code' => $s['imei'], 'model' => trim($s['name'] . ' ' . ($s['variant_label'] ?? '')), 'sold_at' => substr($s['updated_at'], 0, 10), 'valid' => true];
        }
        throw new HttpException(404, 'not_found');
    }
}

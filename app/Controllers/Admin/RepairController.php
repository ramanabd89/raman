<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Repair;

final class RepairController extends Controller
{
    private function ticket(): array { $r = Repair::find($this->id()); if (!$r) throw new HttpException(404, 'not_found'); return $r; }

    public function list(): array { return Repair::adminList((string)$this->qs('status', ''), tostr($this->qs('q', ''), 40)); }
    public function comment(): array
    {
        $r = $this->ticket();
        Repair::comment($r, 'staff', $this->user()['name'], $this->in('body'));
        return Repair::out(Repair::find((int)$r['id']), false);
    }
    public function update(): array
    {
        $r = $this->ticket();
        $status = Repair::update($r, $this->req->body, $this->user()['name']);
        if ($status !== $r['status']) AuditLog::add($this->req, 'repair_status', ['code' => $r['code'], 'from' => $r['status'], 'to' => $status]);
        return Repair::out(Repair::find((int)$r['id']), false);
    }
    public function extra(): array
    {
        $r = $this->ticket();
        $price = Repair::askExtra($r, $this->in('price'), $this->in('note'), $this->user()['name']);
        AuditLog::add($this->req, 'repair_extra', ['code' => $r['code'], 'price' => $price]);
        return Repair::out(Repair::find((int)$r['id']), false);
    }
    public function prices(): array { return ['services' => Model::all('SELECT * FROM repair_services ORDER BY sort, id'), 'prices' => Model::all('SELECT * FROM repair_prices ORDER BY brand, model, service_id')]; }
    public function createPrice(): array
    {
        Model::run('INSERT INTO repair_prices(' . implode(',', Repair::PRICE_FIELDS) . ') VALUES(' . Model::marks(Repair::PRICE_FIELDS) . ')', array_values(Repair::priceValues($this->req->body)));
        return Model::one('SELECT * FROM repair_prices WHERE id = ?', [Model::lastId()]);
    }
    public function updatePrice(): array
    {
        $v = Repair::priceValues($this->req->body); $id = $this->id();
        Model::run('UPDATE repair_prices SET ' . implode(', ', array_map(fn($f) => "$f = ?", Repair::PRICE_FIELDS)) . ' WHERE id = ?', array_merge(array_values($v), [$id]));
        AuditLog::add($this->req, 'repair_price', ['id' => $id, 'model' => $v['model'], 'service' => $v['service_id'], 'original' => $v['price_original'], 'copy' => $v['price_copy']]);
        return Model::one('SELECT * FROM repair_prices WHERE id = ?', [$id]);
    }
    public function deletePrice(): array { Model::run('DELETE FROM repair_prices WHERE id = ?', [$this->id()]); return ['ok' => true]; }
    public function updateService(): array
    {
        $b = $this->req->body;
        Model::run('UPDATE repair_services SET name_ku = ?, name_ar = ?, name_en = ?, active = ?, needs_diagnosis = ? WHERE id = ?',
            [tostr($b['name_ku'] ?? '', 60), tostr($b['name_ar'] ?? '', 60), tostr($b['name_en'] ?? '', 60), ($b['active'] ?? null) === false ? 0 : 1, !empty($b['needs_diagnosis']) ? 1 : 0, $this->id()]);
        return ['ok' => true];
    }
}

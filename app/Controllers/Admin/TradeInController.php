<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Setting;
use App\Models\TradeIn;

final class TradeInController extends Controller
{
    public function models(): array { return TradeIn::models(true); }
    public function createModel(): array
    {
        $v = TradeIn::modelValues($this->req->body);
        Model::run('INSERT INTO tradein_models(brand, model, storage_gb, base_price, active, sort) VALUES(?,?,?,?,?,?)', array_values($v));
        $id = Model::lastId();
        AuditLog::add($this->req, 'tradein_model', ['id' => $id] + $v);
        return Model::one('SELECT * FROM tradein_models WHERE id = ?', [$id]);
    }
    public function updateModel(): array
    {
        $v = TradeIn::modelValues($this->req->body); $id = $this->id();
        $before = Model::one('SELECT base_price FROM tradein_models WHERE id = ?', [$id]);
        Model::run('UPDATE tradein_models SET brand=?, model=?, storage_gb=?, base_price=?, active=?, sort=? WHERE id=?', array_merge(array_values($v), [$id]));
        if ($before && $before['base_price'] !== $v['base_price']) AuditLog::add($this->req, 'tradein_model', ['id' => $id, 'price' => [$before['base_price'], $v['base_price']]]);
        return Model::one('SELECT * FROM tradein_models WHERE id = ?', [$id]);
    }
    public function deleteModel(): array { Model::run('DELETE FROM tradein_models WHERE id = ?', [$this->id()]); return ['ok' => true]; }
    public function rules(): array
    {
        $out = TradeIn::saveRules(is_array($this->in('rules')) ? $this->in('rules') : []);
        if ($this->in('enabled') !== null) Setting::set('tradein_enabled', $this->in('enabled') ? '1' : '0');
        AuditLog::add($this->req, 'tradein_rules', $out);
        return ['rules' => $out, 'enabled' => Setting::on('tradein_enabled')];
    }
    public function list(): array { return TradeIn::adminList(); }
    public function review(): array
    {
        $r = TradeIn::review($this->id(), (string)$this->in('status', ''), $this->in('final_value'), tostr($this->in('imei', ''), 20), tostr($this->in('note', ''), 300));
        AuditLog::add($this->req, 'tradein_review', ['id' => $r['t']['id'], 'order' => $r['t']['order_id'], 'status' => $this->in('status'), 'estimate' => $r['t']['estimate'], 'final' => $r['final']]);
        return ['ok' => true, 'final_value' => $r['final']];
    }
}

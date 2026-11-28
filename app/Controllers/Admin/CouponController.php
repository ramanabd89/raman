<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Coupon;

final class CouponController extends Controller
{
    public function list(): array { return Coupon::adminList(); }
    public function create(): array
    {
        $v = Coupon::values($this->req->body);
        if (Model::one('SELECT 1 FROM coupons WHERE code = ?', [$v['code']])) throw new HttpException(409, 'coupon_exists');
        Model::run('INSERT INTO coupons(' . implode(',', Coupon::FIELDS) . ', created_at) VALUES(' . Model::marks(Coupon::FIELDS) . ', UTC_TIMESTAMP())', array_values($v));
        $id = Model::lastId();
        AuditLog::add($this->req, 'coupon_create', ['code' => $v['code'], 'owner' => $v['owner'], 'value' => $v['value'], 'type' => $v['type']]);
        return Model::one('SELECT * FROM coupons WHERE id = ?', [$id]);
    }
    public function update(): array
    {
        $v = Coupon::values($this->req->body); $id = $this->id();
        if (Model::one('SELECT 1 FROM coupons WHERE code = ? AND id != ?', [$v['code'], $id])) throw new HttpException(409, 'coupon_exists');
        Model::run('UPDATE coupons SET ' . implode(', ', array_map(fn($f) => "$f = ?", Coupon::FIELDS)) . ' WHERE id = ?', array_merge(array_values($v), [$id]));
        AuditLog::add($this->req, 'coupon_update', ['code' => $v['code'], 'active' => (bool)$v['active']]);
        return Model::one('SELECT * FROM coupons WHERE id = ?', [$id]);
    }
    public function delete(): array
    {
        $c = Model::one('SELECT code FROM coupons WHERE id = ?', [$this->id()]);
        Model::run('DELETE FROM coupons WHERE id = ?', [$this->id()]);
        AuditLog::add($this->req, 'coupon_delete', ['code' => $c['code'] ?? null]);
        return ['ok' => true];
    }
}

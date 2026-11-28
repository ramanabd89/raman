<?php
namespace App\Controllers\Admin;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\User;

/** Customers (wallet, blocking) and staff roles (owner only). */
final class CustomerController extends Controller
{
    public function list(): array { return User::adminList(tostr($this->qs('q', ''), 50)); }

    public function update(): array
    {
        $id = $this->id();
        $u = User::find($id);
        if (!$u) throw new HttpException(404, 'not_found');
        $b = $this->req->body;
        if (isset($b['wallet']) && !in_array($this->user()['role'], ['admin', 'manager'], true)) throw new HttpException(403, 'forbidden');
        $wallet = isset($b['wallet']) ? max(0, toint($b['wallet'])) : (int)$u['wallet'];
        $blocked = isset($b['blocked']) ? ($b['blocked'] ? 1 : 0) : (int)$u['blocked'];
        if ($id === $this->uid() && $blocked) throw new HttpException(422, 'cannot_demote_self');
        $reason = isset($b['block_reason']) ? tostr($b['block_reason'], 200) : $u['block_reason'];
        Model::run('UPDATE users SET wallet = ?, blocked = ?, block_reason = ? WHERE id = ?', [$wallet, $blocked, $reason, $id]);
        $ch = [];
        if ($wallet !== (int)$u['wallet']) $ch['wallet'] = [$u['wallet'], $wallet];
        if ($blocked !== (int)$u['blocked']) $ch['blocked'] = [(bool)$u['blocked'], (bool)$blocked];
        if ($ch) AuditLog::add($this->req, 'user_update', ['id' => $id, 'phone' => $u['phone']] + $ch);
        return Auth::publicUser(User::find($id));
    }

    public function staff(): array { return User::staff(); }
    public function addStaff(): array
    {
        $phone = norm_phone($this->in('phone', ''));
        $role = (string)$this->in('role', '');
        if (!in_array($role, Auth::STAFF_ROLES, true)) throw new HttpException(422, 'invalid_input', ['fields' => ['role']]);
        $u = User::byPhone($phone);
        if (!$u) throw new HttpException(404, 'phone_not_found');
        User::setRole((int)$u['id'], $role);
        AuditLog::add($this->req, 'staff_role', ['phone' => $phone, 'from' => $u['role'], 'to' => $role]);
        return ['ok' => true];
    }
    public function updateStaff(): array
    {
        $id = $this->id();
        if ($id === $this->uid()) throw new HttpException(422, 'cannot_demote_self');
        $role = (string)$this->in('role', '');
        if ($role !== 'customer' && !in_array($role, Auth::STAFF_ROLES, true)) throw new HttpException(422, 'invalid_input', ['fields' => ['role']]);
        $u = User::find($id);
        if (!$u) throw new HttpException(404, 'not_found');
        User::setRole($id, $role);
        AuditLog::add($this->req, 'staff_role', ['phone' => $u['phone'], 'from' => $u['role'], 'to' => $role]);
        return ['ok' => true];
    }
}

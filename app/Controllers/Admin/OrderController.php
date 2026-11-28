<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Cart;
use App\Models\Order;

final class OrderController extends Controller
{
    public function list(): array
    {
        $st = in_array($this->qs('status', ''), Order::STATUSES, true) ? $this->qs('status') : null;
        $q = tostr($this->qs('q', ''), 50);
        $where = []; $p = [];
        if ($st) { $where[] = 'status = ?'; $p[] = $st; }
        if ($q !== '') { $where[] = '(customer_name LIKE ? OR phone LIKE ? OR CAST(id AS CHAR) = ?)'; array_push($p, "%$q%", "%$q%", $q); }
        $rows = Model::all('SELECT * FROM orders ' . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 300', $p);
        return array_map(fn($o) => Order::adminExtras(Order::withItems($o, true)), $rows);
    }

    public function update(): array
    {
        $o = Order::find($this->id());
        if (!$o) throw new HttpException(404, 'not_found');
        $status = (string)$this->in('status', '');
        $note = array_key_exists('admin_note', $this->req->body) && $this->in('admin_note') !== null ? tostr($this->in('admin_note'), 500) : null;
        Order::setStatus($o, $status, $note, $this->user()['name']);
        AuditLog::add($this->req, 'order_status', ['order' => $o['id'], 'from' => $o['status'], 'to' => $status]);
        return Order::withItems(Order::find((int)$o['id']), true);
    }

    public function imei(): array
    {
        Order::setImei($this->id(), $this->id('item'), tostr($this->in('imei', ''), 30));
        AuditLog::add($this->req, 'order_imei', ['order' => $this->id(), 'item' => $this->id('item')]);
        return Order::withItems(Order::find($this->id()), true);
    }

    public function carts(): array { return Cart::abandoned(); }
    public function reminded(): array { Model::run('UPDATE carts SET reminded_at = UTC_TIMESTAMP() WHERE user_id = ?', [$this->id('userId')]); return ['ok' => true]; }
}

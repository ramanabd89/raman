<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Review;

final class ReviewController extends Controller
{
    public function list(): array { return Review::adminList($this->qs('status')); }
    public function pending(): array { return ['n' => (int)Model::val("SELECT COUNT(*) FROM reviews WHERE status = 'pending'")]; }
    public function update(): array
    {
        $r = Model::one('SELECT * FROM reviews WHERE id = ?', [$this->id()]);
        if (!$r) throw new HttpException(404, 'not_found');
        $status = in_array($this->in('status'), Review::STATUSES, true) ? $this->in('status') : $r['status'];
        $reply = array_key_exists('reply', $this->req->body) ? (tostr($this->in('reply'), 1000) ?: null) : $r['reply'];
        Model::run('UPDATE reviews SET status = ?, reply = ? WHERE id = ?', [$status, $reply, $r['id']]);
        Review::recalc((int)$r['product_id']);
        AuditLog::add($this->req, 'review_update', ['id' => $r['id'], 'status' => $status]);
        return ['ok' => true];
    }
    public function delete(): array
    {
        $r = Model::one('SELECT * FROM reviews WHERE id = ?', [$this->id()]);
        if (!$r) throw new HttpException(404, 'not_found');
        Model::run('DELETE FROM reviews WHERE id = ?', [$r['id']]);
        Review::recalc((int)$r['product_id']);
        AuditLog::add($this->req, 'review_delete', ['id' => $r['id']]);
        return ['ok' => true];
    }
}

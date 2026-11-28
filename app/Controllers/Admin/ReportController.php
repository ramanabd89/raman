<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Models\Analytics;
use App\Models\AuditLog;
use App\Models\Expense;

/** Profit & loss (monthly or any date range), expenses, visitor analytics. */
final class ReportController extends Controller
{
    public function profit(): array
    {
        $from = (string)$this->qs('from', ''); $to = (string)$this->qs('to', '');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            if ($from > $to) [$from, $to] = [$to, $from];
            return [Expense::profit($from, $to, "$from → $to")];
        }
        $months = min(max(toint($this->qs('months', 6), 6), 1), 24);
        $out = []; $y = (int)gmdate('Y'); $m = (int)gmdate('n');
        for ($i = 0; $i < $months; $i++) {
            $t = gmmktime(0, 0, 0, $m - $i, 1, $y);
            $out[] = Expense::profit(gmdate('Y-m-01', $t), gmdate('Y-m-t', $t), gmdate('Y-m', $t));
        }
        return $out;
    }
    public function expenses(): array { $m = (string)$this->qs('month', ''); return Expense::month(preg_match('/^\d{4}-\d{2}$/', $m) ? $m : gmdate('Y-m')); }
    public function addExpense(): array
    {
        $id = Expense::add($this->req->body, $this->user()['name']);
        $e = Expense::find($id);
        AuditLog::add($this->req, 'expense_add', ['id' => $id, 'category' => $e['category'], 'amount' => $e['amount']]);
        return $e;
    }
    public function deleteExpense(): array
    {
        $e = Expense::find($this->id());
        Expense::remove($this->id());
        AuditLog::add($this->req, 'expense_delete', $e ? ['id' => $e['id'], 'amount' => $e['amount'], 'category' => $e['category']] : new \stdClass());
        return ['ok' => true];
    }
    public function analytics(): array { return Analytics::report(toint($this->qs('days', 30), 30)); }
}

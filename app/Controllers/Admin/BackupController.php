<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Response;
use App\Models\AuditLog;
use App\Services\BackupService;

final class BackupController extends Controller
{
    public function list(): array { return BackupService::list(); }
    public function download(): never
    {
        $name = (string)$this->qs('name', '');
        if ($name === 'now') {
            $file = BackupService::dump(BackupService::dir() . '/manual-' . ms() . '.sql');
            AuditLog::add($this->req, 'backup_download', 'now');
            Response::download($file, 'store-' . gmdate('Y-m-d-H-i') . '.sql', 'application/sql', true);
        }
        $file = BackupService::path($name);
        if (!$file) throw new HttpException(404, 'not_found');
        AuditLog::add($this->req, 'backup_download', $name);
        Response::download($file, $name, 'application/sql');
    }
}

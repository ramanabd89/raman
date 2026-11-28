<?php
namespace App\Middleware;

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Request;
use App\Models\Setting;

/** Maintenance mode (Admin → Settings): customers can't place orders or book repairs; staff can. */
final class MaintenanceMiddleware
{
    public function handle(Request $req): void
    {
        if (Setting::get('maintenance_mode') === '1' && !($req->user && Auth::isStaff($req->user['role']))) throw new HttpException(503, 'maintenance');
    }
}

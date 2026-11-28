<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Setting;
use App\Services\ImageUploadService;
use App\Services\TelegramService;

final class DashboardController extends Controller
{
    public function stats(): array
    {
        $v = fn($sql, $p = []) => (int)Model::val($sql, $p);
        $u = $this->user();
        return [
            'revenue' => $v("SELECT COALESCE(SUM(total + wallet_used),0) FROM orders WHERE status = 'delivered'"),
            'orders' => $v('SELECT COUNT(*) FROM orders'),
            'pending' => $v("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
            'today' => $v('SELECT COUNT(*) FROM orders WHERE DATE(created_at) = UTC_DATE()'),
            'customers' => $v("SELECT COUNT(*) FROM users WHERE role = 'customer'"),
            'products' => $v('SELECT COUNT(*) FROM products'),
            'low_stock' => Model::all('SELECT id, name_ku, stock FROM products WHERE stock <= ? ORDER BY stock LIMIT 10', [Setting::int('low_stock_threshold', 3)]),
            'top' => Model::all('SELECT id, name_ku, sold, price FROM products ORDER BY sold DESC LIMIT 5'),
            'recent' => array_map([Order::class, 'adminExtras'], Model::all('SELECT * FROM orders ORDER BY id DESC LIMIT 8')),
            'open_repairs' => $v("SELECT COUNT(*) FROM repairs WHERE status NOT IN ('delivered', 'cancelled')"),
            'repairs_today' => $v("SELECT COUNT(*) FROM repairs WHERE SUBSTR(appointment, 1, 10) = DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR) AND status != 'cancelled'"),
            'sources' => Model::all("SELECT COALESCE(source, 'unknown') source, COUNT(*) orders, COALESCE(SUM(CASE WHEN status = 'delivered' THEN total + wallet_used END), 0) revenue FROM orders WHERE status != 'cancelled' GROUP BY 1 ORDER BY 2 DESC"),
            'utm' => Model::all("SELECT utm, COUNT(*) orders FROM orders WHERE utm IS NOT NULL AND status != 'cancelled' GROUP BY utm ORDER BY 2 DESC LIMIT 10"),
            'warnings' => array_values(array_filter([
                password_verify('admin123', $u['password_hash']) ? 'default_password' : null,
                !$u['totp_enabled'] ? 'no_2fa' : null,
                Setting::get('otpiq_api_key') === '' ? 'sms_console' : null,
                !TelegramService::enabled() ? 'no_telegram' : null,
            ])),
        ];
    }
    public function log(): array { return AuditLog::recent(); }
    public function upload(): array { return ['url' => ImageUploadService::store($this->req->files['file'] ?? null)]; }
}

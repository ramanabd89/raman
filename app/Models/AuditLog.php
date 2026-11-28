<?php
namespace App\Models;

use App\Core\Model;
use App\Core\Request;

/** Who changed what in the admin (prices, stock, roles, settings…). */
final class AuditLog extends Model
{
    public static function add(Request $req, string $action, $details): void
    {
        self::run('INSERT INTO admin_log(user_id, user_name, action, details, created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())',
            [$req->user['id'] ?? null, $req->user['name'] ?? '', $action, is_string($details) ? $details : json_enc($details ?? '')]);
    }
    public static function recent(): array { return self::all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 300'); }
}

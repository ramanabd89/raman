<?php
namespace App\Middleware;

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Request;

/**
 * /api/admin/*: staff only, and each role only its sections.
 * admin = everything; manager = most; orders = orders/customers/repairs; technician = repairs; products = catalogue/stock/reviews.
 */
final class StaffRbacMiddleware
{
    public const ROLE_SECTIONS = [
        'admin' => '*',
        'manager' => ['dashboard', 'orders', 'customers', 'carts', 'tradein', 'repairs', 'products', 'catalog', 'stock', 'coupons', 'expenses', 'analytics', 'faqs', 'banners', 'reviews'],
        'orders' => ['dashboard', 'orders', 'customers', 'carts', 'tradein', 'repairs'],
        'technician' => ['dashboard', 'repairs'],
        'products' => ['dashboard', 'products', 'catalog', 'stock', 'reviews'],
    ];
    /** first path segment after /api/admin/ → section */
    public const SECTION_OF = [
        'stats' => 'dashboard', 'orders' => 'orders', 'users' => 'customers', 'carts' => 'carts',
        'products' => 'products', 'upload' => 'products', 'bulk-price' => 'products', 'variant-presets' => 'products',
        'categories' => 'catalog', 'tags' => 'catalog', 'stock' => 'stock', 'coupons' => 'coupons',
        'expenses' => 'expenses', 'profit' => 'expenses', 'tradeins' => 'tradein', 'tradein-models' => 'tradein', 'tradein-rules' => 'tradein',
        'repairs' => 'repairs', 'repair-prices' => 'repairs', 'repair-services' => 'repairs', 'analytics' => 'analytics', 'faqs' => 'faqs',
        'banners' => 'banners', 'reviews' => 'reviews', 'print' => 'orders',
    ];

    public static function canAccess(string $role, string $section): bool
    {
        $a = self::ROLE_SECTIONS[$role] ?? null;
        return $a === '*' || (is_array($a) && in_array($section, $a, true));
    }

    public function handle(Request $req): void
    {
        if (!$req->user || !Auth::isStaff($req->user['role'])) throw new HttpException(403, 'forbidden');
        $seg = explode('/', substr($req->path, strlen('/api/admin/')))[0] ?? '';
        $role = $req->user['role'];
        if ($seg === 'settings' && $req->method === 'GET') return; // read-only, product forms need it
        if ($seg === 'upload' && (self::canAccess($role, 'products') || self::canAccess($role, 'repairs'))) return;
        if ($seg === 'print' && (self::canAccess($role, 'orders') || self::canAccess($role, 'repairs'))) return;
        if (!self::canAccess($role, self::SECTION_OF[$seg] ?? 'admin_only')) throw new HttpException(403, 'forbidden');
    }
}

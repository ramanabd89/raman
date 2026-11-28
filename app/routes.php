<?php
// Every API endpoint. Pages (/, /ku/product/12-iphone…, sitemap…) are handled by SeoController in index.php.

use App\Controllers\AccountController as Account;
use App\Controllers\Admin;
use App\Controllers\AuthController as AuthC;
use App\Controllers\CartOrderController as CartOrder;
use App\Controllers\FinderController as Finder;
use App\Controllers\RepairController as RepairC;
use App\Controllers\ReviewController as ReviewC;
use App\Controllers\StorefrontController as Store;
use App\Controllers\TradeInController as TradeInC;
use App\Core\Router;
use App\Middleware\AuthMiddleware as Signed;
use App\Middleware\CsrfMiddleware as Csrf;
use App\Middleware\MaintenanceMiddleware as Maint;
use App\Middleware\RateLimitMiddleware as Throttle;
use App\Middleware\StaffRbacMiddleware as Staff;

$r = new Router();
$U = [Csrf::class, Signed::class];          // signed-in customer, state change
$A = [Staff::class];                        // admin read
$AW = [Csrf::class, Staff::class];          // admin write

// ---------- catalogue ----------
$r->get('/api/settings', [Store::class, 'settings']);
$r->get('/api/categories', [Store::class, 'categories']);
$r->get('/api/banners', [Store::class, 'banners']);
$r->get('/api/faqs', [Store::class, 'faqs']);
$r->get('/api/products', [Store::class, 'products']);
$r->get('/api/products/facets', [Store::class, 'facets']);
$r->get('/api/products/:id', [Store::class, 'product']);
$r->post('/api/track', [Store::class, 'track'], [Csrf::class]);

// ---------- sign-in ----------
$r->post('/api/auth/otp', [AuthC::class, 'otp'], [Csrf::class]);
$r->post('/api/auth/quick', [AuthC::class, 'quick'], [Csrf::class, Throttle::class]);
$r->post('/api/auth/reset', [AuthC::class, 'reset'], [Csrf::class, Throttle::class]);
$r->post('/api/auth/register', [AuthC::class, 'register'], [Csrf::class, Throttle::class]);
$r->post('/api/auth/login', [AuthC::class, 'login'], [Csrf::class]);
$r->post('/api/auth/login/2fa', [AuthC::class, 'twoFactor'], [Csrf::class]);
$r->post('/api/auth/logout', [AuthC::class, 'logout'], $U);

// ---------- account ----------
$r->get('/api/me', [Account::class, 'me'], [Signed::class]);
$r->put('/api/me', [Account::class, 'update'], $U);
$r->post('/api/me/2fa/setup', [Account::class, 'totpSetup'], $U);
$r->post('/api/me/2fa/enable', [Account::class, 'totpEnable'], $U);
$r->post('/api/me/2fa/disable', [Account::class, 'totpDisable'], $U);
$r->get('/api/me/addresses', [Account::class, 'addresses'], [Signed::class]);
$r->post('/api/me/addresses', [Account::class, 'addAddress'], $U);
$r->delete('/api/me/addresses/:id', [Account::class, 'deleteAddress'], $U);
$r->get('/api/me/wishlist', [Account::class, 'wishlist'], [Signed::class]);
$r->post('/api/me/wishlist', [Account::class, 'wishlistMerge'], $U);
$r->put('/api/me/wishlist/:id', [Account::class, 'wishlistAdd'], $U);
$r->delete('/api/me/wishlist/:id', [Account::class, 'wishlistRemove'], $U);
$r->get('/api/me/to-review', [ReviewC::class, 'toReview'], [Signed::class]);

// ---------- cart & orders ----------
$r->post('/api/cart/quote', [CartOrder::class, 'quote'], [Csrf::class]);
$r->post('/api/coupons/check', [CartOrder::class, 'checkCoupon'], [Csrf::class]);
$r->post('/api/cart/sync', [CartOrder::class, 'sync'], $U);
$r->post('/api/orders', [CartOrder::class, 'place'], [Csrf::class, Signed::class, Maint::class]);
$r->get('/api/orders', [CartOrder::class, 'list'], [Signed::class]);
$r->get('/api/orders/:id', [CartOrder::class, 'show'], [Signed::class]);
$r->post('/api/orders/:id/cancel', [CartOrder::class, 'cancel'], $U);

// ---------- reviews ----------
$r->get('/api/products/:id/reviews', [ReviewC::class, 'list']);
$r->post('/api/products/:id/reviews', [ReviewC::class, 'save'], $U);
$r->post('/api/reviews/upload', [ReviewC::class, 'upload'], $U);

// ---------- trade-in & finder ----------
$r->get('/api/tradein/models', [TradeInC::class, 'models']);
$r->post('/api/tradein/quote', [TradeInC::class, 'quote'], [Csrf::class]);
$r->get('/api/finder', [Finder::class, 'find']);

// ---------- repairs ----------
$r->get('/api/repair/catalog', [RepairC::class, 'catalog']);
$r->get('/api/repair/quote', [RepairC::class, 'quote']);
$r->get('/api/repair/slots', [RepairC::class, 'slots']);
$r->post('/api/repairs', [RepairC::class, 'book'], [Csrf::class, Signed::class, Maint::class]);
$r->get('/api/repairs', [RepairC::class, 'list'], [Signed::class]);
$r->get('/api/repairs/:code', [RepairC::class, 'show'], [Signed::class]);
$r->post('/api/repairs/:code/decision', [RepairC::class, 'decision'], $U);
$r->post('/api/repairs/:code/comments', [RepairC::class, 'comment'], $U);
$r->post('/api/repairs/:code/cancel', [RepairC::class, 'cancel'], $U);
$r->get('/api/warranty/:code', [RepairC::class, 'warranty']);

// ---------- admin ----------
$r->get('/api/admin/stats', [Admin\DashboardController::class, 'stats'], $A);
$r->get('/api/admin/log', [Admin\DashboardController::class, 'log'], $A);
$r->post('/api/admin/upload', [Admin\DashboardController::class, 'upload'], $AW);

$r->get('/api/admin/orders', [Admin\OrderController::class, 'list'], $A);
$r->put('/api/admin/orders/:id', [Admin\OrderController::class, 'update'], $AW);
$r->put('/api/admin/orders/:id/items/:item/imei', [Admin\OrderController::class, 'imei'], $AW);
$r->get('/api/admin/carts', [Admin\OrderController::class, 'carts'], $A);
$r->post('/api/admin/carts/:userId/reminded', [Admin\OrderController::class, 'reminded'], $AW);

$r->get('/api/admin/products', [Admin\ProductController::class, 'list'], $A);
$r->post('/api/admin/products', [Admin\ProductController::class, 'create'], $AW);
$r->put('/api/admin/products/:id', [Admin\ProductController::class, 'update'], $AW);
$r->delete('/api/admin/products/:id', [Admin\ProductController::class, 'delete'], $AW);
$r->post('/api/admin/bulk-price', [Admin\ProductController::class, 'bulkPrice'], $AW);
$r->put('/api/admin/variant-presets', [Admin\ProductController::class, 'presets'], $AW);
$r->get('/api/admin/stock', [Admin\ProductController::class, 'stock'], $A);
$r->post('/api/admin/stock/adjust', [Admin\ProductController::class, 'adjust'], $AW);

$r->get('/api/admin/categories', [Admin\CatalogController::class, 'categories'], $A);
$r->post('/api/admin/categories', [Admin\CatalogController::class, 'createCategory'], $AW);
$r->put('/api/admin/categories/:id', [Admin\CatalogController::class, 'updateCategory'], $AW);
$r->delete('/api/admin/categories/:id', [Admin\CatalogController::class, 'deleteCategory'], $AW);
$r->get('/api/admin/banners', [Admin\CatalogController::class, 'banners'], $A);
$r->post('/api/admin/banners', [Admin\CatalogController::class, 'createBanner'], $AW);
$r->put('/api/admin/banners/:id', [Admin\CatalogController::class, 'updateBanner'], $AW);
$r->delete('/api/admin/banners/:id', [Admin\CatalogController::class, 'deleteBanner'], $AW);
$r->get('/api/admin/tags', [Admin\CatalogController::class, 'tags'], $A);
$r->post('/api/admin/tags', [Admin\CatalogController::class, 'createTag'], $AW);
$r->put('/api/admin/tags/:id', [Admin\CatalogController::class, 'updateTag'], $AW);
$r->delete('/api/admin/tags/:id', [Admin\CatalogController::class, 'deleteTag'], $AW);
$r->get('/api/admin/faqs', [Admin\CatalogController::class, 'faqs'], $A);
$r->post('/api/admin/faqs', [Admin\CatalogController::class, 'createFaq'], $AW);
$r->put('/api/admin/faqs/:id', [Admin\CatalogController::class, 'updateFaq'], $AW);
$r->delete('/api/admin/faqs/:id', [Admin\CatalogController::class, 'deleteFaq'], $AW);

$r->get('/api/admin/users', [Admin\CustomerController::class, 'list'], $A);
$r->put('/api/admin/users/:id', [Admin\CustomerController::class, 'update'], $AW);
$r->get('/api/admin/staff', [Admin\CustomerController::class, 'staff'], $A);
$r->post('/api/admin/staff', [Admin\CustomerController::class, 'addStaff'], $AW);
$r->put('/api/admin/staff/:id', [Admin\CustomerController::class, 'updateStaff'], $AW);

$r->get('/api/admin/coupons', [Admin\CouponController::class, 'list'], $A);
$r->post('/api/admin/coupons', [Admin\CouponController::class, 'create'], $AW);
$r->put('/api/admin/coupons/:id', [Admin\CouponController::class, 'update'], $AW);
$r->delete('/api/admin/coupons/:id', [Admin\CouponController::class, 'delete'], $AW);

$r->get('/api/admin/settings', [Admin\SettingController::class, 'show'], $A);
$r->put('/api/admin/settings', [Admin\SettingController::class, 'update'], $AW);
$r->post('/api/admin/settings/test-otp', [Admin\SettingController::class, 'testOtp'], $AW);
$r->post('/api/admin/settings/test-telegram', [Admin\SettingController::class, 'testTelegram'], $AW);

$r->get('/api/admin/profit', [Admin\ReportController::class, 'profit'], $A);
$r->get('/api/admin/expenses', [Admin\ReportController::class, 'expenses'], $A);
$r->post('/api/admin/expenses', [Admin\ReportController::class, 'addExpense'], $AW);
$r->delete('/api/admin/expenses/:id', [Admin\ReportController::class, 'deleteExpense'], $AW);
$r->get('/api/admin/analytics', [Admin\ReportController::class, 'analytics'], $A);

$r->get('/api/admin/tradein-models', [Admin\TradeInController::class, 'models'], $A);
$r->post('/api/admin/tradein-models', [Admin\TradeInController::class, 'createModel'], $AW);
$r->put('/api/admin/tradein-models/:id', [Admin\TradeInController::class, 'updateModel'], $AW);
$r->delete('/api/admin/tradein-models/:id', [Admin\TradeInController::class, 'deleteModel'], $AW);
$r->put('/api/admin/tradein-rules', [Admin\TradeInController::class, 'rules'], $AW);
$r->get('/api/admin/tradeins', [Admin\TradeInController::class, 'list'], $A);
$r->put('/api/admin/tradeins/:id', [Admin\TradeInController::class, 'review'], $AW);

$r->get('/api/admin/repairs', [Admin\RepairController::class, 'list'], $A);
$r->post('/api/admin/repairs/:id/comments', [Admin\RepairController::class, 'comment'], $AW);
$r->put('/api/admin/repairs/:id', [Admin\RepairController::class, 'update'], $AW);
$r->post('/api/admin/repairs/:id/extra', [Admin\RepairController::class, 'extra'], $AW);
$r->get('/api/admin/repair-prices', [Admin\RepairController::class, 'prices'], $A);
$r->post('/api/admin/repair-prices', [Admin\RepairController::class, 'createPrice'], $AW);
$r->put('/api/admin/repair-prices/:id', [Admin\RepairController::class, 'updatePrice'], $AW);
$r->delete('/api/admin/repair-prices/:id', [Admin\RepairController::class, 'deletePrice'], $AW);
$r->put('/api/admin/repair-services/:id', [Admin\RepairController::class, 'updateService'], $AW);

$r->get('/api/admin/reviews', [Admin\ReviewController::class, 'list'], $A);
$r->get('/api/admin/reviews/pending-count', [Admin\ReviewController::class, 'pending'], $A);
$r->patch('/api/admin/reviews/:id', [Admin\ReviewController::class, 'update'], $AW);
$r->delete('/api/admin/reviews/:id', [Admin\ReviewController::class, 'delete'], $AW);

$r->get('/api/admin/backups', [Admin\BackupController::class, 'list'], $A);
$r->get('/api/admin/backups/download', [Admin\BackupController::class, 'download'], $A);

return $r;

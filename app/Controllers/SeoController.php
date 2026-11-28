<?php
namespace App\Controllers;

use App\Config\Config;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\Lang;
use App\Core\Model;
use App\Core\Response;
use App\Core\Url;
use App\Core\View;
use App\Middleware\StaffRbacMiddleware;
use App\Models\Banner;
use App\Models\Category;
use App\Models\Faq;
use App\Models\Order;
use App\Models\Product;
use App\Models\Repair;
use App\Models\Setting;
use App\Services\CacheService;
use App\Services\ImageUploadService;
use App\Services\SeoService;

/**
 * Server-rendered pages: clean multilingual URLs (/ku/…, /ar/…, /en/…) with full SEO <head> and crawlable
 * content; the storefront script then takes over for app-like navigation. Also sitemap.xml, robots.txt,
 * the secret admin address, print views and old-link redirects.
 */
final class SeoController extends Controller
{
    /** Pages that exist only inside the app (cart, account…): rendered as the app shell, never indexed. */
    private const APP_ONLY = ['cart', 'checkout', 'profile', 'orders', 'order', 'addresses', 'edit-profile', 'support', 'quick', 'login', 'register', 'reset', 'repairs', 'compare', 'wishlist', 'search'];
    private const STATIC = ['repair', 'tradein', 'finder', 'faq', 'warranty', 'accessories-finder'];

    public function handle(): never
    {
        $path = rtrim($this->req->path, '/') ?: '/';
        $parts = array_values(array_filter(explode('/', trim($path, '/')), fn($x) => $x !== ''));
        $first = $parts[0] ?? '';

        if ($path === '/') Response::redirect(Url::base() . Lang::current() . '/');
        if ($path === '/robots.txt') $this->robots();
        if ($path === '/sitemap.xml') $this->sitemap();
        if ($first === Config::adminPath() && count($parts) === 1) $this->admin();
        if ($first === 'p' && isset($parts[1]) && ctype_digit($parts[1])) $this->legacyProduct((int)$parts[1]);
        if ($first === 'print' && count($parts) === 3) $this->printView($parts[1], (int)$parts[2]);
        if ($first === 'certificate' && isset($parts[1])) $this->certificate($parts[1]);

        if (in_array($first, Lang::LANGS, true)) {
            Lang::set($first);
            setcookie('rp_lang', $first, ['expires' => time() + 86400 * 365, 'path' => Url::base(), 'secure' => Url::isHttps(), 'httponly' => false, 'samesite' => 'Lax']);
            $this->page(array_slice($parts, 1));
        }
        // a known page without a language prefix → the same page in the visitor's language
        if ($first === 'product' || $first === 'category' || $first === 'used' || in_array($first, self::STATIC, true) || in_array($first, self::APP_ONLY, true)) {
            $qs = $_SERVER['QUERY_STRING'] ?? '';
            Response::redirect(Url::base() . Lang::current() . $path . ($qs !== '' ? "?$qs" : ''), 301);
        }
        self::errorPage(404);
    }

    // ---------------- storefront pages ----------------
    private function page(array $p): never
    {
        if (Setting::on('maintenance_mode') && !($this->req->user && Auth::isStaff($this->req->user['role']))) self::errorPage(503);
        $seo = new SeoService(); $seo->defaults();
        $seg = $p[0] ?? '';
        $store = SeoService::store();
        $home = [__('page.home'), ''];
        $content = '';

        if ($seg === '') {
            $seo->jsonld = [SeoService::storeLd(), SeoService::websiteLd()];
            $data = CacheService::remember('catalog', 'ssr:home', 300, fn() => ['categories' => Category::tree(), 'products' => Product::list(['limit' => 24]), 'used' => Product::list(['used' => '1', 'limit' => 8])]);
            $content = View::render('store/home', $data + ['banners' => CacheService::remember('content', 'banners:active', 900, fn() => Banner::active())]);
        } elseif ($seg === 'product' && isset($p[1])) {
            $product = Product::find(toint($p[1]));
            if (!$product) self::errorPage(404);
            $product = Product::out($product);
            $key = Product::urlKey($product);
            if ($p[1] !== $key) Response::redirect(Url::base() . Lang::current() . '/product/' . $key, 301); // one canonical slug
            $name = SeoService::L($product, 'name');
            $seo->path = "product/$key"; $seo->type = 'product'; $seo->price = (int)$product['price'];
            $seo->title = __('seo.product_title', ['name' => $name, 'price' => iqd($product['price']), 'store' => $store]);
            $seo->description = __('seo.product_desc', ['name' => $name, 'price' => iqd($product['price']), 'stock' => __($product['stock'] > 0 ? 'seo.in_stock' : 'seo.out_of_stock')]);
            $seo->image = ImageUploadService::ogFor($product['image']) ?? $product['image'];
            $cat = $product['category_id'] ? Category::find((int)$product['category_id']) : null;
            $crumbs = [$home];
            if ($cat) $crumbs[] = [SeoService::L($cat, 'name'), 'category/' . Category::urlKey($cat)];
            $crumbs[] = [$name, $seo->path];
            $seo->jsonld = [SeoService::productLd($product, $seo->path), SeoService::breadcrumbLd($crumbs)];
            if ($product['is_used']) $seo->title = __('seo.used_product_title', ['name' => $name, 'grade' => $product['condition_grade'] ?? '', 'price' => iqd($product['price']), 'store' => $store]);
            $content = View::render('store/product', ['p' => $product, 'variants' => Product::variants((int)$product['id']), 'crumbs' => $crumbs, 'related' => Product::related($product)]);
        } elseif ($seg === 'category' && isset($p[1])) {
            $cat = Category::find(toint($p[1]));
            if (!$cat) self::errorPage(404);
            $key = Category::urlKey($cat);
            if ($p[1] !== $key) Response::redirect(Url::base() . Lang::current() . '/category/' . $key, 301);
            $name = SeoService::L($cat, 'name');
            $seo->path = "category/$key";
            $seo->title = __('seo.category_title', ['name' => $name, 'store' => $store]);
            $seo->description = __('seo.category_desc', ['name' => $name, 'store' => $store]);
            $seo->image = $cat['image'];
            $crumbs = [$home, [$name, $seo->path]];
            $seo->jsonld = [SeoService::breadcrumbLd($crumbs)];
            $content = View::render('store/category', ['cat' => $cat, 'products' => Product::list(['category' => $cat['id'], 'limit' => 40]), 'crumbs' => $crumbs]);
        } elseif ($seg === 'used' && count($p) === 1) {
            $seo->path = 'used';
            $seo->title = __('seo.used_title', ['store' => $store]);
            $seo->description = __('seo.used_desc', ['store' => $store]);
            $products = CacheService::remember('catalog', 'ssr:used', 300, fn() => Product::list(['used' => '1', 'limit' => 60]));
            $crumbs = [$home, [__('page.used'), 'used']];
            $seo->jsonld = [SeoService::usedListLd($products), SeoService::breadcrumbLd($crumbs)];
            $content = View::render('store/used', ['products' => $products, 'crumbs' => $crumbs]);
        } elseif (in_array($seg, self::STATIC, true) && count($p) <= 2) {
            $seo->path = implode('/', $p);
            $seo->title = __("seo.{$seg}_title", ['store' => $store]);
            $seo->description = __("seo.{$seg}_desc", ['store' => $store]);
            $faqs = $seg === 'faq' ? Faq::active() : [];
            if ($faqs) $seo->jsonld[] = SeoService::faqLd($faqs);
            $seo->jsonld[] = SeoService::breadcrumbLd([$home, [__("page.$seg"), $seg]]);
            if (isset($p[1])) $seo->noindex = true; // /warranty/RXXXX: personal lookups are not indexed
            $content = View::render('store/static', ['seg' => $seg, 'faqs' => $faqs]);
        } elseif (in_array($seg, self::APP_ONLY, true)) {
            $seo->path = implode('/', $p); $seo->noindex = true;
            $seo->title = Lang::has("seo.{$seg}_title") ? __("seo.{$seg}_title", ['store' => $store]) : __('page.' . ($seg === 'cart' || $seg === 'checkout' ? 'cart' : 'account')) . ' — ' . $store;
            header('X-Robots-Tag: noindex, nofollow');
            $content = '<div class="container ssr"><p class="ssr-loading">' . e(__('page.loading')) . '</p></div>';
        } else {
            self::errorPage(404);
        }
        Response::html(View::render('layouts/store', ['seo' => $seo, 'content' => $content]), 200, $seo->noindex);
    }

    // ---------------- redirects, admin, robots, sitemap ----------------
    private function legacyProduct(int $id): never
    {
        $p = Product::find($id);
        if (!$p) Response::redirect(Url::base() . Lang::current() . '/', 302);
        Response::redirect(Url::base() . Lang::current() . '/product/' . Product::urlKey(Product::out($p)), 301);
    }

    private function admin(): never
    {
        header('X-Robots-Tag: noindex, nofollow');
        Response::html(View::render('admin/shell', []), 200, true);
    }

    private function robots(): never
    {
        $lines = ['User-agent: *', 'Allow: /', 'Disallow: ' . Url::base() . 'api/', 'Disallow: ' . Url::base() . 'print/'];
        foreach (Lang::LANGS as $l) foreach (['cart', 'checkout', 'profile', 'orders', 'order/', 'login', 'quick', 'search/'] as $x) $lines[] = 'Disallow: ' . Url::base() . "$l/$x";
        $lines[] = 'Sitemap: ' . Url::to('sitemap.xml');
        Response::text(implode("\n", $lines) . "\n");
    }

    private function sitemap(): never
    {
        Response::text(CacheService::remember('sitemap', 'sitemap.xml:' . Url::base(), 3600, fn() => $this->sitemapXml()), 'application/xml');
    }

    private function sitemapXml(): string
    {
        $urls = []; // [path, lastmod]
        $urls[] = ['', null];
        $urls[] = ['used', null];
        foreach (self::STATIC as $s) $urls[] = [$s, null];
        foreach (Model::all('SELECT id, slug, name_en FROM categories ORDER BY sort, id') as $c) $urls[] = ['category/' . Category::urlKey($c), null];
        foreach (Model::all('SELECT id, slug, name_en, brand, created_at FROM products WHERE active = 1 ORDER BY id') as $p) $urls[] = ['product/' . Product::urlKey($p), substr((string)$p['created_at'], 0, 10)];
        $x = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
        foreach ($urls as [$path, $mod]) foreach (Lang::LANGS as $l) {
            $x[] = '  <url><loc>' . e(SeoService::pageUrl($l, $path)) . '</loc>' . ($mod ? "<lastmod>$mod</lastmod>" : '');
            foreach (Lang::LANGS as $alt) $x[] = '    <xhtml:link rel="alternate" hreflang="' . Lang::HREFLANG[$alt] . '" href="' . e(SeoService::pageUrl($alt, $path)) . '"/>';
            $x[] = '  </url>';
        }
        $x[] = '</urlset>';
        return implode("\n", $x) . "\n";
    }

    // ---------------- print views ----------------
    private function printView(string $kind, int $id): never
    {
        $u = $this->req->user;
        $section = $kind === 'repair' ? 'repairs' : 'orders';
        if (!$u || !Auth::isStaff($u['role']) || !StaffRbacMiddleware::canAccess($u['role'], $section)) self::errorPage(403);
        Lang::set(in_array($this->qs('lang'), Lang::LANGS, true) ? $this->qs('lang') : Lang::current());
        $size = $this->qs('size') === '80' ? '80' : 'a4';
        if ($kind === 'order') {
            $o = Order::withItems(Order::find($id), true);
            if (!$o) self::errorPage(404);
            Response::html(View::render('print/order', ['o' => $o, 'size' => $size]), 200, true);
        }
        if ($kind === 'repair') {
            $r = Repair::find($id);
            if (!$r) self::errorPage(404);
            Response::html(View::render('print/repair', ['r' => Repair::out($r, false), 'size' => $size]), 200, true);
        }
        self::errorPage(404);
    }

    /** Public warranty certificate (repair code); contains no personal data. */
    private function certificate(string $code): never
    {
        if (in_array($this->qs('lang'), Lang::LANGS, true)) Lang::set($this->qs('lang'));
        $w = Repair::warranty($code);
        if (!$w) self::errorPage(404);
        Response::html(View::render('print/certificate', ['w' => $w]), 200, true);
    }

    public static function errorPage(int $status): never
    {
        if ($status === 503) header('Retry-After: 3600');
        $key = match ($status) { 404 => 'not_found', 503 => 'maintenance', 403 => 'not_found', default => 'server_error' };
        try { $html = View::render('errors/error', ['status' => $status, 'key' => $key]); }
        catch (\Throwable) { $html = '<!doctype html><meta charset="utf-8"><title>' . $status . '</title><h1>' . $status . '</h1>'; }
        Response::html($html, $status, true);
    }
}

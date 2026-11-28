<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\Csrf;
use App\Core\HttpException;
use App\Models\Analytics;
use App\Models\Banner;
use App\Models\Category;
use App\Models\Faq;
use App\Models\Product;
use App\Models\Setting;
use App\Services\CacheService;
use App\Services\SearchService;

/** Public catalogue API. */
final class StorefrontController extends Controller
{
    // Read-mostly data comes from the file cache; admin changes clear it (CacheService::afterWrite).
    public function settings(): array { return CacheService::remember('settings', 'settings:public', 600, fn() => Setting::publicSettings()) + ['csrf' => Csrf::token()]; }
    public function categories(): array { return CacheService::remember('catalog', 'categories:tree', 900, fn() => Category::tree()); }
    public function banners(): array { return CacheService::remember('content', 'banners:active', 900, fn() => Banner::active()); }
    public function faqs(): array { return CacheService::remember('content', 'faqs:active', 900, fn() => Faq::active()); }

    /** Catalogue pages without a search word (home, categories, flash, used) are cached for 5 minutes per query. */
    public function products(): array
    {
        $q = $this->req->query;
        if (!empty($q['q'])) return Product::list($q);
        $keys = ['category', 'flash', 'featured', 'phones', 'ids', 'brand', 'min_price', 'max_price', 'storage', 'ram', 'in_stock', 'used', 'grade', 'sort', 'limit', 'offset'];
        $norm = array_intersect_key(array_map('strval', array_filter($q, 'is_scalar')), array_flip($keys)); ksort($norm);
        return CacheService::remember('catalog', 'products:' . http_build_query($norm), 300, fn() => Product::list($q));
    }
    public function facets(): array
    {
        $q = array_intersect_key(array_map('strval', array_filter($this->req->query, 'is_scalar')), array_flip(['category', 'q', 'used'])); ksort($q);
        return CacheService::remember('catalog', 'facets:' . http_build_query($q), 600, fn() => Product::facets($q));
    }
    public function suggest(): array { return SearchService::suggest((string)$this->qs('q', '')); }

    public function product(): array
    {
        $p = Product::find($this->id());
        if (!$p) throw new HttpException(404, 'not_found');
        $out = Product::out($p);
        $out['variants'] = array_map([Product::class, 'publicVariant'], Product::variants((int)$p['id']));
        $out['tags'] = Product::tags((int)$p['id']);
        return ['product' => $out, 'related' => Product::related($p), 'bundle' => Product::boughtTogether($p), 'proof' => Product::proof((int)$p['id'])];
    }

    public function track(): array { Analytics::track($this->req); return ['ok' => true]; }
}

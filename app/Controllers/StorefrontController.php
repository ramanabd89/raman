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

/** Public catalogue API. */
final class StorefrontController extends Controller
{
    public function settings(): array { return Setting::publicSettings() + ['csrf' => Csrf::token()]; }
    public function categories(): array { return Category::tree(); }
    public function banners(): array { return Banner::active(); }
    public function faqs(): array { return Faq::active(); }
    public function products(): array { return Product::list($this->req->query); }
    public function facets(): array { return Product::facets($this->req->query); }

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

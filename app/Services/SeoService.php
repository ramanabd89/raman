<?php
namespace App\Services;

use App\Core\Lang;
use App\Core\Url;
use App\Models\Setting;

/**
 * Builds the <head> for server-rendered pages: title, description, canonical, hreflang alternates (ckb / ar / en /
 * x-default), OpenGraph + Twitter cards, and JSON-LD (MobilePhoneStore, Product + Offer + AggregateRating,
 * FAQPage, BreadcrumbList). Every URL uses the detected base path.
 */
final class SeoService
{
    public string $title = '';
    public string $description = '';
    public string $path = '';          // page path without language, e.g. "product/12-iphone-15"
    public string $type = 'website';
    public ?string $image = null;      // site path "/uploads/…"
    public bool $noindex = false;
    public ?int $price = null;
    public array $jsonld = [];

    public static function store(): string { return Setting::get('store_name', 'RamanPhone'); }

    /** Absolute URL of a page in a language. */
    public static function pageUrl(string $lang, string $path = ''): string { return Url::to($lang . '/' . ltrim($path, '/')); }

    /** Absolute URL for a stored image path ("/uploads/x.webp" or an https link). */
    public static function imageUrl(?string $img): ?string
    {
        if (!$img) return null;
        if (preg_match('#^https?://#', $img)) return $img;
        return Url::origin() . Url::base() . ltrim($img, '/');
    }

    public static function L(array $row, string $field, ?string $lang = null): string
    {
        $lang = $lang ?? Lang::current();
        return (string)(($row["{$field}_$lang"] ?? '') ?: (($row["{$field}_ku"] ?? '') ?: ($row["{$field}_en"] ?? '')));
    }

    public function defaults(): void
    {
        $l = Lang::current();
        $this->title = Setting::get("seo_title_$l") ?: __('seo.home_title', ['store' => self::store()]);
        $this->description = Setting::get("seo_description_$l") ?: (Setting::get('seo_description') ?: __('seo.home_desc'));
    }

    public function head(): string
    {
        $lang = Lang::current();
        $canonical = self::pageUrl($lang, $this->path);
        $img = self::imageUrl($this->image) ?? self::imageUrl(self::defaultImage());
        $t = [];
        $t[] = '<title>' . e($this->title) . '</title>';
        $t[] = '<meta name="description" content="' . e(mb_substr($this->description, 0, 300)) . '">';
        if ($this->noindex) $t[] = '<meta name="robots" content="noindex, nofollow">';
        else {
            $t[] = '<link rel="canonical" href="' . e($canonical) . '">';
            foreach (Lang::LANGS as $l) $t[] = '<link rel="alternate" hreflang="' . Lang::HREFLANG[$l] . '" href="' . e(self::pageUrl($l, $this->path)) . '">';
            $t[] = '<link rel="alternate" hreflang="x-default" href="' . e(self::pageUrl(Setting::get('default_lang', 'ku'), $this->path)) . '">';
        }
        $t[] = '<meta property="og:type" content="' . e($this->type) . '">';
        $t[] = '<meta property="og:site_name" content="' . e(self::store()) . '">';
        $t[] = '<meta property="og:title" content="' . e($this->title) . '">';
        $t[] = '<meta property="og:description" content="' . e(mb_substr($this->description, 0, 300)) . '">';
        $t[] = '<meta property="og:url" content="' . e($canonical) . '">';
        $t[] = '<meta property="og:locale" content="' . ['ku' => 'ckb_IQ', 'ar' => 'ar_IQ', 'en' => 'en_US'][$lang] . '">';
        if ($img) { $t[] = '<meta property="og:image" content="' . e($img) . '">'; $t[] = '<meta name="twitter:card" content="summary_large_image">'; $t[] = '<meta name="twitter:image" content="' . e($img) . '">'; }
        $t[] = '<meta name="twitter:title" content="' . e($this->title) . '">';
        if ($this->price !== null) { $t[] = '<meta property="product:price:amount" content="' . (int)$this->price . '">'; $t[] = '<meta property="product:price:currency" content="IQD">'; }
        foreach ($this->jsonld as $ld) $t[] = '<script type="application/ld+json">' . json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . '</script>';
        return implode("\n  ", $t);
    }

    private static function defaultImage(): ?string
    {
        $b = \App\Core\Model::one('SELECT image FROM banners WHERE active = 1 ORDER BY sort, id LIMIT 1');
        return $b ? ImageUploadService::ogFor($b['image']) ?? $b['image'] : null;
    }

    // ---------------- JSON-LD ----------------
    public static function storeLd(): array
    {
        $ld = ['@context' => 'https://schema.org', '@type' => 'MobilePhoneStore', 'name' => self::store(), 'url' => self::pageUrl(Lang::current()),
            'image' => self::imageUrl(self::defaultImage()) ?? Url::to('favicon.svg'), 'priceRange' => 'IQD', 'currenciesAccepted' => 'IQD', 'paymentAccepted' => 'Cash'];
        if ($p = Setting::get('support_phone')) $ld['telephone'] = $p;
        $addr = Setting::get('store_address');
        if ($addr !== '') $ld['address'] = ['@type' => 'PostalAddress', 'streetAddress' => $addr, 'addressLocality' => Setting::get('store_city', 'Erbil'), 'addressCountry' => 'IQ'];
        if (is_numeric(Setting::get('store_lat')) && is_numeric(Setting::get('store_lng'))) $ld['geo'] = ['@type' => 'GeoCoordinates', 'latitude' => (float)Setting::get('store_lat'), 'longitude' => (float)Setting::get('store_lng')];
        if ($h = Setting::get('store_hours')) $ld['openingHours'] = $h;
        $same = array_values(array_filter([Setting::get('instagram'), Setting::get('facebook'), Setting::get('tiktok')], fn($u) => preg_match('#^https://[^/]+/.+#', $u)));
        if ($same) $ld['sameAs'] = $same;
        return $ld;
    }

    public static function websiteLd(): array
    {
        return ['@context' => 'https://schema.org', '@type' => 'WebSite', 'name' => self::store(), 'url' => self::pageUrl(Lang::current()),
            'potentialAction' => ['@type' => 'SearchAction', 'target' => self::pageUrl(Lang::current(), 'search/{search_term_string}'), 'query-input' => 'required name=search_term_string']];
    }

    /** @param array<array{0:string,1:string}> $items [name, path] */
    public static function breadcrumbLd(array $items): array
    {
        $list = [];
        foreach (array_values($items) as $i => [$name, $path]) $list[] = ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $name, 'item' => self::pageUrl(Lang::current(), $path)];
        return ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $list];
    }

    public static function productLd(array $p, string $path): array
    {
        $imgs = array_values(array_filter(array_map([self::class, 'imageUrl'], array_merge([$p['image'] ?? null], $p['images'] ?? []))));
        $ld = ['@context' => 'https://schema.org', '@type' => 'Product', 'name' => self::L($p, 'name'), 'sku' => (string)$p['id'], 'image' => $imgs,
            'description' => mb_substr(self::L($p, 'desc') ?: self::L($p, 'name'), 0, 500),
            'offers' => ['@type' => 'Offer', 'price' => (string)(int)$p['price'], 'priceCurrency' => 'IQD', 'url' => self::pageUrl(Lang::current(), $path),
                'availability' => $p['stock'] > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', 'itemCondition' => 'https://schema.org/NewCondition',
                'seller' => ['@type' => 'Organization', 'name' => self::store()]]];
        if (!empty($p['brand'])) $ld['brand'] = ['@type' => 'Brand', 'name' => $p['brand']];
        if (!empty($p['rating_count'])) $ld['aggregateRating'] = ['@type' => 'AggregateRating', 'ratingValue' => (float)$p['rating_avg'], 'reviewCount' => (int)$p['rating_count'], 'bestRating' => 5, 'worstRating' => 1];
        return $ld;
    }

    public static function faqLd(array $faqs): array
    {
        return ['@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => array_map(fn($f) => ['@type' => 'Question', 'name' => self::L($f, 'q'),
            'acceptedAnswer' => ['@type' => 'Answer', 'text' => self::L($f, 'a')]], $faqs)];
    }
}

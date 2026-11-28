<?php
namespace App\Models;

use App\Core\Model;

/** Key/value store settings (everything editable in Admin → Settings). */
final class Setting extends Model
{
    private static ?array $cache = null;

    /** Sent to every visitor (/api/settings) — never secrets. */
    public const PUBLIC = ['store_name', 'delivery_fee', 'free_delivery_over', 'referral_reward', 'flash_sale_end',
        'search_tags', 'cities', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'support_phone', 'delivery_zones', 'store_address', 'store_map_url',
        'exchange_days', 'warranty_text', 'slogan', 'seo_description', 'maintenance_mode', 'maintenance_message', 'cashback_percent',
        'tradein_enabled', 'repair_enabled', 'proof_enabled', 'reviews_enabled', 'reviews_buyers_only', 'bundle_discount_percent', 'store_hours', 'default_lang'];

    /** Editable by the owner but never public. */
    public const PRIVATE = ['max_pending_orders', 'confirm_over', 'usd_rate', 'usd_round', 'min_profit', 'low_stock_threshold', 'trust_proxy',
        'repair_pickup', 'repair_pickup_fee', 'repair_free_diagnosis', 'repair_honest_pct', 'repair_open', 'repair_close', 'repair_closed_days', 'repair_slot_capacity',
        'otpiq_api_key', 'otpiq_provider', 'otp_test_mode', 'otp_allowed_prefixes',
        'telegram_enabled', 'telegram_bot_token', 'telegram_chat_id', 'telegram_lang',
        'tg_new_order', 'tg_high_value', 'tg_order_cancelled', 'tg_new_repair', 'tg_repair_decision', 'tg_repair_comment', 'tg_low_stock',
        'seo_title_ku', 'seo_title_ar', 'seo_title_en', 'seo_description_ku', 'seo_description_ar', 'seo_description_en',
        'store_city', 'store_lat', 'store_lng'];

    /** Shown masked in the admin; a masked value sent back means "unchanged". */
    public const SECRETS = ['otpiq_api_key', 'telegram_bot_token'];
    public const MASK = '••••••••';

    public static function values(bool $fresh = false): array
    {
        if (self::$cache === null || $fresh) {
            self::$cache = [];
            foreach (self::all_rows() as $r) self::$cache[$r['key']] = $r['value'];
        }
        return self::$cache;
    }
    private static function all_rows(): array { return parent::all('SELECT `key`, `value` FROM settings'); }

    public static function get(string $key, string $default = ''): string { $s = self::values(); return isset($s[$key]) && $s[$key] !== null ? (string)$s[$key] : $default; }
    public static function int(string $key, int $default = 0): int { return toint(self::get($key, (string)$default), $default); }
    public static function on(string $key): bool { return self::get($key) === '1'; }

    public static function set(string $key, $value): void
    {
        parent::run('INSERT INTO settings(`key`, `value`) VALUES(?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)', [$key, $value === null ? '' : (string)$value]);
        self::$cache = null;
    }

    public static function publicSettings(): array
    {
        $s = self::values(); $out = [];
        foreach (self::PUBLIC as $k) $out[$k] = $s[$k] ?? '';
        return $out;
    }

    /** All settings for the admin, secrets masked. */
    public static function forAdmin(): array
    {
        $s = self::values(true);
        foreach (self::SECRETS as $k) if (!empty($s[$k])) $s[$k] = self::MASK . substr((string)$s[$k], -4);
        return $s;
    }

    public static function zones(): array
    {
        $z = parse_json(self::get('delivery_zones', '[]'), []);
        return is_array($z) ? array_values(array_filter($z, fn($x) => is_array($x) && !empty($x['name']))) : [];
    }
}

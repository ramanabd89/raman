<?php
namespace App\Services;

use App\Core\Url;
use App\Config\Config;
use App\Models\Setting;

/**
 * Notifications to the owner's Telegram (bot token + chat id from Admin → Settings), in the language chosen there.
 * Per-event switches: tg_new_order, tg_high_value, tg_order_cancelled, tg_new_repair, tg_repair_decision, tg_repair_comment, tg_low_stock.
 * All customer text is escaped for Telegram's HTML mode; short timeouts so Telegram can't slow checkout.
 */
final class TelegramService
{
    public static function enabled(): bool
    {
        return Setting::on('telegram_enabled') && Setting::get('telegram_bot_token') !== '' && Setting::get('telegram_chat_id') !== '';
    }
    private static function lang(): string { $l = Setting::get('telegram_lang', 'ar'); return in_array($l, ['ku', 'ar', 'en'], true) ? $l : 'ar'; }
    public static function esc($s): string { return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
    private static function t(string $key, array $p = []): string
    {
        return __($key, array_map(fn($v) => is_int($v) || is_float($v) ? (string)$v : self::esc($v), $p), self::lang());
    }
    private static function eventOn(string $key): bool { return Setting::get($key, '1') !== '0'; }
    private static function adminLink(string $page): ?string { return Url::to(Config::adminPath()) . '#/' . $page; }

    /** @return array{0:bool,1:string} [ok, error description] */
    public static function send(string $html, ?string $token = null, ?string $chat = null): array
    {
        $token = $token ?? Setting::get('telegram_bot_token');
        $chat = $chat ?? Setting::get('telegram_chat_id');
        if ($token === '' || $chat === '' || !preg_match('/^\d+:[\w-]+$/', $token)) return [false, 'not_configured'];
        [$st, $body] = HttpClient::post('https://api.telegram.org/bot' . $token . '/sendMessage', ['Content-Type: application/json'],
            json_encode(['chat_id' => $chat, 'text' => $html, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true]), 6);
        if ($st >= 200 && $st < 300) return [true, ''];
        $desc = json_decode($body, true)['description'] ?? ($st === 0 ? 'network_error' : "HTTP $st");
        error_log("Telegram notify failed: $desc");
        return [false, (string)$desc];
    }

    /** Sends one event message if Telegram and that event are switched on. */
    public static function event(string $toggle, string $key, array $params = []): void
    {
        if (!self::enabled() || !self::eventOn($toggle)) return;
        self::send(self::t($key, $params));
    }

    public static function newOrder(array $o): void
    {
        if (!self::enabled()) return;
        $high = Setting::int('confirm_over') > 0 && $o['total'] + $o['wallet_used'] >= Setting::int('confirm_over');
        $wantOrder = self::eventOn('tg_new_order'); $wantHigh = $high && self::eventOn('tg_high_value');
        if (!$wantOrder && !$wantHigh) return;
        $lines = array_map(fn($i) => '• ' . self::esc($i['name']) . ($i['variant_label'] ? ' (' . self::esc($i['variant_label']) . ')' : '') . " × {$i['qty']} = " . iqd($i['price'] * $i['qty']), $o['items']);
        $parts = [self::t('tg.new_order', ['id' => $o['id']]) . ($wantHigh ? "\n" . self::t('tg.high_value') : ''), '',
            '👤 ' . self::esc($o['customer_name']), '📞 ' . self::esc($o['phone']), '📍 ' . self::esc($o['city']) . ' — ' . self::esc($o['address']),
            $o['note'] ? '📝 ' . self::esc($o['note']) : null, '', ...$lines, '',
            $o['bundle_discount'] ? self::t('tg.bundle', ['x' => iqd($o['bundle_discount'])]) : null,
            $o['discount'] ? self::t('tg.coupon', ['code' => $o['coupon_code'], 'x' => iqd($o['discount'])]) : null,
            $o['tradein_credit'] ? self::t('tg.tradein', ['label' => $o['tradein']['label'] ?? '', 'x' => iqd($o['tradein_credit'])]) : null,
            self::t('tg.delivery', ['x' => iqd($o['delivery_fee'])]),
            $o['wallet_used'] ? self::t('tg.wallet', ['x' => iqd($o['wallet_used'])]) : null,
            self::t('tg.total', ['x' => iqd($o['total'])]),
            ($o['source'] || $o['utm']) ? self::t('tg.source', ['x' => implode(' · ', array_filter([$o['source'], $o['utm']]))]) : null,
            self::esc(self::adminLink('orders'))];
        self::send(implode("\n", array_filter($parts, fn($l) => $l !== null)));
    }

    public static function newRepair(array $r): void
    {
        if (!self::enabled() || !self::eventOn('tg_new_repair')) return;
        $price = $r['quality'] === 'diagnosis' ? self::t('tg.after_diagnosis') : iqd($r['quoted_price']) . ' ' . __('currency', [], self::lang()) . ' (' . self::t('tg.q_' . $r['quality']) . ')';
        $parts = [self::t('tg.new_repair', ['code' => $r['code']]), '👤 ' . self::esc($r['customer_name']) . ' — 📞 ' . self::esc($r['phone']),
            '📱 ' . self::esc("{$r['brand']} {$r['model']}") . ' — ' . self::esc($r['service_label']), '💰 ' . $price,
            $r['method'] === 'pickup' ? self::t('tg.pickup', ['city' => $r['city'], 'address' => $r['address']]) : self::t('tg.appointment', ['x' => $r['appointment']]),
            $r['lat'] !== null ? self::t('tg.location', ['x' => "https://www.google.com/maps/search/?api=1&query={$r['lat']},{$r['lng']}"]) : null,
            $r['pickup_note'] ? self::t('tg.courier_note', ['x' => $r['pickup_note']]) : null,
            $r['problem'] ? '📝 ' . self::esc($r['problem']) : null, self::esc(self::adminLink('repairs'))];
        self::send(implode("\n", array_filter($parts, fn($l) => $l !== null)));
    }

    /** Admin "Send test message" — uses the values typed in the form (or the saved ones). */
    public static function test(?string $token, ?string $chat): array
    {
        [$ok, $err] = self::send(self::t('tg.test', ['store' => Setting::get('store_name', 'Store'), 'time' => gmdate('Y-m-d H:i') . ' UTC']), $token ?: null, $chat ?: null);
        return ['ok' => $ok, 'error' => $ok ? null : $err];
    }
}

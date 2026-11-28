<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Core\RateLimiter;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\Setting;
use App\Services\OtpiqService;
use App\Services\TelegramService;

/** Admin → Settings: store, delivery zones, OTPIQ, Telegram, SEO, maintenance. Secrets are masked on the way out. */
final class SettingController extends Controller
{
    public function show(): array { return Setting::forAdmin(); }

    public function update(): array
    {
        $before = Setting::values(true); $changed = []; $b = $this->req->body;
        if (array_key_exists('delivery_zones', $b)) {
            $zones = is_string($b['delivery_zones']) ? json_decode($b['delivery_zones'], true) : $b['delivery_zones'];
            if (!is_array($zones) || ($zones && !array_is_list($zones))) throw new HttpException(422, 'invalid_input', ['fields' => ['delivery_zones']]);
            $clean = array_values(array_filter(array_map(fn($z) => ['name' => tostr($z['name'] ?? '', 60), 'fee' => max(0, toint($z['fee'] ?? 0)), 'eta' => tostr($z['eta'] ?? '', 40)], array_slice($zones, 0, 100)), fn($z) => $z['name'] !== ''));
            $b['delivery_zones'] = json_enc($clean);
            $b['cities'] = implode(',', array_column($clean, 'name'));
        }
        if (isset($b['otpiq_provider']) && !in_array($b['otpiq_provider'], OtpiqService::PROVIDERS, true)) throw new HttpException(422, 'invalid_input', ['fields' => ['otpiq_provider']]);
        if (isset($b['telegram_lang']) && !in_array($b['telegram_lang'], ['ku', 'ar', 'en'], true)) throw new HttpException(422, 'invalid_input', ['fields' => ['telegram_lang']]);
        if (isset($b['default_lang']) && !in_array($b['default_lang'], ['ku', 'ar', 'en'], true)) throw new HttpException(422, 'invalid_input', ['fields' => ['default_lang']]);
        foreach (array_merge(Setting::PUBLIC, Setting::PRIVATE) as $k) {
            if (!array_key_exists($k, $b)) continue;
            $v = tostr($b[$k], 5000);
            if (in_array($k, Setting::SECRETS, true) && str_starts_with($v, Setting::MASK)) continue; // masked = unchanged
            if (($before[$k] ?? '') === $v) continue;
            $changed[$k] = in_array($k, Setting::SECRETS, true) ? ['***', '***'] : [$before[$k] ?? '', $v];
            Setting::set($k, $v);
        }
        if ($changed) AuditLog::add($this->req, 'settings_update', $changed);
        if (isset($changed['usd_rate']) || isset($changed['usd_round'])) {
            $n = Model::tx(fn() => Product::repriceUsd());
            if ($n) AuditLog::add($this->req, 'usd_reprice', ['products' => $n, 'rate' => Setting::get('usd_rate')]);
        }
        return Setting::forAdmin();
    }

    /** "Send test OTP" — a real code to the given phone with the saved OTPIQ key / provider. */
    public function testOtp(): array
    {
        RateLimiter::throttle(["otpiq_test:{$this->uid()}"]);
        return OtpiqService::test((string)$this->in('phone', ''));
    }

    /** "Send test Telegram message" — with the token/chat typed in the form, or the saved ones. */
    public function testTelegram(): array
    {
        $token = tostr($this->in('telegram_bot_token', ''), 200);
        if (str_starts_with($token, Setting::MASK)) $token = '';
        return TelegramService::test($token, tostr($this->in('telegram_chat_id', ''), 60));
    }
}

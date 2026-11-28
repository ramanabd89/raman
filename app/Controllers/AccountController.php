<?php
namespace App\Controllers;

use App\Config\Config;
use App\Core\Auth;
use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Middleware\StaffRbacMiddleware;
use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Wishlist;
use App\Services\OtpiqService;
use App\Services\TotpService;

/** The signed-in customer: profile, addresses, two-step sign-in, favourites. */
final class AccountController extends Controller
{
    public function me(): array
    {
        $u = $this->user();
        $out = ['user' => Auth::publicUser($u), 'stats' => Order::stats((int)$u['id'])];
        if (Auth::isStaff($u['role'])) { $out['admin_path'] = path(Config::adminPath()); $out['sections'] = StaffRbacMiddleware::ROLE_SECTIONS[$u['role']]; }
        return $out;
    }

    public function update(): array
    {
        $u = $this->user();
        $name = tostr($this->in('name', ''), 80) ?: $u['name'];
        $phone = norm_phone($this->in('phone', '')) ?: $u['phone'];
        if ($phone !== $u['phone']) {
            if (Model::one('SELECT 1 FROM users WHERE phone = ? AND id != ?', [$phone, $u['id']])) throw new HttpException(409, 'phone_taken');
            OtpiqService::verify($phone, 'change_phone', $this->in('code'));
        }
        Model::run('UPDATE users SET name = ?, phone = ? WHERE id = ?', [$name, $phone, $u['id']]);
        if ($this->in('new_password')) {
            if (!password_verify((string)$this->in('current_password', ''), $u['password_hash'])) throw new HttpException(401, 'wrong_credentials');
            if (mb_strlen((string)$this->in('new_password')) < 6) throw new HttpException(422, 'password_short');
            User::setPassword((int)$u['id'], (string)$this->in('new_password'));
        }
        return ['user' => Auth::publicUser(User::find((int)$u['id']))];
    }

    public function totpSetup(): array
    {
        $u = $this->user();
        if ($u['totp_enabled']) throw new HttpException(409, 'already_enabled');
        $secret = TotpService::newSecret();
        Model::run('UPDATE users SET totp_secret = ? WHERE id = ?', [$secret, $u['id']]);
        return ['secret' => $secret, 'otpauth' => TotpService::url($secret, $u['phone'], Setting::get('store_name', 'Store'))];
    }
    public function totpEnable(): array
    {
        $u = $this->user();
        if (!$u['totp_secret'] || !TotpService::verify($u['totp_secret'], $this->in('code'))) throw new HttpException(422, 'wrong_2fa_code');
        Model::run('UPDATE users SET totp_enabled = 1 WHERE id = ?', [$u['id']]);
        Model::run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [$u['id'], $this->req->token]);
        AuditLog::add($this->req, '2fa_enabled', '');
        return ['ok' => true];
    }
    public function totpDisable(): array
    {
        $u = $this->user();
        if (!password_verify((string)$this->in('password', ''), $u['password_hash'])) throw new HttpException(401, 'wrong_credentials');
        if (!TotpService::verify($u['totp_secret'], $this->in('code'))) throw new HttpException(422, 'wrong_2fa_code');
        Model::run('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [$u['id']]);
        AuditLog::add($this->req, '2fa_disabled', '');
        return ['ok' => true];
    }

    public function addresses(): array { return Model::all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [$this->uid()]); }
    public function addAddress(): array
    {
        $v = $this->validate(['city' => 'required|len:60', 'details' => 'required|len:300', 'area' => 'len:100']);
        $first = !Model::one('SELECT 1 FROM addresses WHERE user_id = ?', [$this->uid()]);
        $def = $first || $this->in('is_default') ? 1 : 0;
        if ($def) Model::run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [$this->uid()]);
        Model::run('INSERT INTO addresses(user_id, city, area, details, is_default) VALUES(?,?,?,?,?)', [$this->uid(), $v['city'], $v['area'] ?? '', $v['details'], $def]);
        return Model::one('SELECT * FROM addresses WHERE id = ?', [Model::lastId()]);
    }
    public function deleteAddress(): array { Model::run('DELETE FROM addresses WHERE id = ? AND user_id = ?', [$this->id(), $this->uid()]); return ['ok' => true]; }

    public function wishlist(): array { return ['ids' => Wishlist::ids($this->uid())]; }
    public function wishlistMerge(): array { return ['ids' => Wishlist::merge($this->uid(), is_array($this->in('ids')) ? $this->in('ids') : [])]; }
    public function wishlistAdd(): array { Wishlist::add($this->uid(), $this->id()); return ['ids' => Wishlist::ids($this->uid())]; }
    public function wishlistRemove(): array { Wishlist::remove($this->uid(), $this->id()); return ['ids' => Wishlist::ids($this->uid())]; }
}

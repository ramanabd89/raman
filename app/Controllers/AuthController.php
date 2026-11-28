<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Core\RateLimiter;
use App\Models\User;
use App\Services\OtpiqService;
use App\Services\TotpService;

/** Sign-in / sign-up: passwordless (phone + OTPIQ code), password, reset, staff two-step. */
final class AuthController extends Controller
{
    private function phone(): string
    {
        $p = norm_phone($this->in('phone', ''));
        if (strlen($p) < 7) throw new HttpException(422, 'invalid_input', ['fields' => ['phone']]);
        return $p;
    }

    public function otp(): array
    {
        $phone = $this->phone();
        $purpose = (string)$this->in('purpose', '');
        $u = User::byPhone($phone);
        if ($purpose === 'register' && $u) throw new HttpException(409, 'phone_taken');
        if ($purpose === 'reset' && !$u) throw new HttpException(404, 'phone_not_found');
        if ($purpose === 'quick' && $u && $u['role'] !== 'customer') throw new HttpException(403, 'use_password');
        if ($purpose === 'change_phone') { if (!$this->req->user) throw new HttpException(401, 'unauthorized'); if ($u) throw new HttpException(409, 'phone_taken'); }
        $out = OtpiqService::send($phone, $purpose, $this->req->ip);
        if ($purpose === 'quick') $out['is_new'] = !$u;
        return $out;
    }

    public function quick(): array
    {
        $phone = $this->phone();
        $existing = User::byPhone($phone);
        if ($existing && $existing['role'] !== 'customer') throw new HttpException(403, 'use_password'); // staff: password (+2FA)
        $name = tostr($this->in('name', ''), 80);
        if (!$existing && $name === '') throw new HttpException(422, 'name_required');
        $ref = !$existing ? User::referrer(strtoupper(tostr($this->in('referral', ''), 20))) : null;
        OtpiqService::verify($phone, 'quick', $this->in('code'));
        $user = $existing ?: User::find(User::create($name, $phone, rand_hex(24), $ref));
        return Auth::login($this->req, (int)$user['id']) + ['user' => Auth::publicUser($user), 'created' => !$existing];
    }

    public function reset(): array
    {
        $phone = $this->phone();
        $password = (string)$this->in('password', '');
        if (mb_strlen($password) < 6) throw new HttpException(422, 'password_short');
        $user = User::byPhone($phone);
        if (!$user) throw new HttpException(404, 'phone_not_found');
        OtpiqService::verify($phone, 'reset', $this->in('code'));
        User::setPassword((int)$user['id'], $password);
        Model::run('DELETE FROM sessions WHERE user_id = ?', [$user['id']]); // sign out other devices
        return Auth::login($this->req, (int)$user['id']) + ['user' => Auth::publicUser($user)];
    }

    public function register(): array
    {
        $name = tostr($this->in('name', ''), 80);
        $phone = $this->phone();
        $password = (string)$this->in('password', '');
        if ($name === '') throw new HttpException(422, 'invalid_input', ['fields' => ['name']]);
        if (mb_strlen($password) < 6) throw new HttpException(422, 'password_short');
        if (User::byPhone($phone)) throw new HttpException(409, 'phone_taken');
        $ref = User::referrer(strtoupper(tostr($this->in('referral', ''), 20)));
        OtpiqService::verify($phone, 'register', $this->in('code'));
        $id = User::create($name, $phone, $password, $ref);
        return Auth::login($this->req, $id) + ['user' => Auth::publicUser(User::find($id))];
    }

    public function login(): array
    {
        $phone = norm_phone($this->in('phone', ''));
        $keys = ["ip:{$this->req->ip}", "phone:$phone"];
        RateLimiter::check($keys);
        $user = User::byPhone($phone);
        if (!$user || !password_verify((string)$this->in('password', ''), $user['password_hash'])) { RateLimiter::hit($keys); throw new HttpException(401, 'wrong_credentials'); }
        RateLimiter::clear("phone:$phone");
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) User::setPassword((int)$user['id'], (string)$this->in('password'));
        if ($user['totp_enabled']) {
            $ticket = rand_hex(24);
            Model::run('DELETE FROM login_tickets WHERE expires_at < ?', [ms()]);
            Model::run('INSERT INTO login_tickets(ticket, user_id, expires_at) VALUES(?,?,?)', [$ticket, $user['id'], ms() + 300000]);
            return ['need_2fa' => true, 'ticket' => $ticket];
        }
        return Auth::login($this->req, (int)$user['id']) + ['user' => Auth::publicUser($user)];
    }

    public function twoFactor(): array
    {
        $t = Model::one('SELECT * FROM login_tickets WHERE ticket = ?', [(string)$this->in('ticket', '')]);
        if (!$t || $t['expires_at'] < ms() || $t['attempts'] >= 5) throw new HttpException(401, 'login_expired');
        $user = User::find((int)$t['user_id']);
        if (!$user || !TotpService::verify($user['totp_secret'], $this->in('code'))) {
            Model::run('UPDATE login_tickets SET attempts = attempts + 1 WHERE ticket = ?', [$t['ticket']]);
            RateLimiter::hit(["ip:{$this->req->ip}"]);
            throw new HttpException(401, 'wrong_2fa_code');
        }
        Model::run('DELETE FROM login_tickets WHERE ticket = ?', [$t['ticket']]);
        return Auth::login($this->req, (int)$user['id']) + ['user' => Auth::publicUser($user)];
    }

    public function logout(): array { Auth::logout($this->req); return ['ok' => true]; }
}

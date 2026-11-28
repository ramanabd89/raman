<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/**
 * Repair center: price matrix (original / copy parts), honest advice, walk-in slots (Asia/Baghdad, UTC+3, no DST)
 * or home pickup with an exact map pin, ticket tracking, extra-cost approval, comments, warranty certificates.
 */
final class Repair extends Model
{
    public const STATUSES = ['booked', 'received', 'diagnosing', 'awaiting_approval', 'repairing', 'testing', 'ready', 'delivered', 'cancelled'];
    public const IRAQ_OFFSET = 10800;
    public const PRICE_FIELDS = ['service_id', 'brand', 'model', 'price_original', 'price_copy', 'duration_min', 'warranty_original', 'warranty_copy', 'active'];

    public static function iraqNow(): string { return gmdate('Y-m-d H:i', time() + self::IRAQ_OFFSET); }
    public static function enabled(): bool { return Setting::on('repair_enabled'); }
    public static function mapUrl(array $r): string { return "https://www.google.com/maps/search/?api=1&query={$r['lat']},{$r['lng']}"; }
    public static function newCode(): string
    {
        $A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (;;) { $c = 'R'; foreach (str_split(random_bytes(6)) as $b) $c .= $A[ord($b) % strlen($A)]; if (!self::one('SELECT 1 FROM repairs WHERE code = ?', [$c])) return $c; }
    }

    public static function catalog(): array
    {
        return ['enabled' => true, 'services' => self::all('SELECT * FROM repair_services WHERE active = 1 ORDER BY sort, id'),
            'models' => self::all('SELECT DISTINCT brand, model FROM repair_prices WHERE active = 1 ORDER BY brand, model'),
            'pickup' => Setting::on('repair_pickup'), 'pickup_fee' => Setting::int('repair_pickup_fee'), 'free_diagnosis' => Setting::on('repair_free_diagnosis'),
            'from_price' => self::val('SELECT MIN(p) FROM (SELECT price_copy p FROM repair_prices WHERE active = 1 AND price_copy > 0 UNION ALL SELECT price_original FROM repair_prices WHERE active = 1 AND price_original > 0) x') ?: null,
            'fastest_min' => self::val('SELECT MIN(duration_min) FROM repair_prices WHERE active = 1') ?: null];
    }

    public static function quote(string $brand, string $model, $serviceId): array
    {
        $svc = self::one('SELECT * FROM repair_services WHERE id = ? AND active = 1', [toint($serviceId)]);
        if (!$svc) throw new HttpException(422, 'repair_service');
        $row = self::one('SELECT * FROM repair_prices WHERE service_id = ? AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?) AND active = 1', [$svc['id'], $brand, $model]);
        $opts = [];
        if (!$svc['needs_diagnosis'] && $row) {
            if ($row['price_original']) $opts[] = ['quality' => 'original', 'price' => $row['price_original'], 'warranty_days' => $row['warranty_original']];
            if ($row['price_copy']) $opts[] = ['quality' => 'copy', 'price' => $row['price_copy'], 'warranty_days' => $row['warranty_copy']];
        }
        if (!$opts) $opts[] = ['quality' => 'diagnosis', 'price' => 0, 'warranty_days' => $row ? $row['warranty_original'] : 90];
        $value = self::val('SELECT MAX(base_price) FROM tradein_models WHERE active = 1 AND LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)', [$brand, $model]) ?: null;
        $prices = array_filter(array_column($opts, 'price'));
        $cheapest = $prices ? min($prices) : null;
        // honest advice: repair costs more than X% of what the phone is worth
        $advice = $value && $cheapest !== null && $cheapest > ($value * Setting::int('repair_honest_pct', 50)) / 100 ? ['phone_value' => $value, 'repair_price' => $cheapest] : null;
        return ['service' => $svc, 'options' => $opts, 'duration_min' => $row ? $row['duration_min'] : null, 'advice' => $advice];
    }

    public static function slots(string $date): array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return [];
        [$y, $m, $d] = array_map('intval', explode('-', $date));
        if (!checkdate($m, $d, $y)) return [];
        $dow = (int)gmdate('w', gmmktime(0, 0, 0, $m, $d, $y));
        $closed = array_map('intval', array_filter(array_map('trim', explode(',', Setting::get('repair_closed_days'))), fn($x) => $x !== ''));
        if (in_array($dow, $closed, true)) return [];
        $now = self::iraqNow(); $cap = max(1, Setting::int('repair_slot_capacity', 2)); $out = [];
        for ($hr = Setting::int('repair_open', 10); $hr < Setting::int('repair_close', 21); $hr++) {
            $slot = sprintf('%s %02d:00', $date, $hr);
            if (strcmp($slot, $now) <= 0) continue;
            $taken = (int)self::val("SELECT COUNT(*) FROM repairs WHERE appointment = ? AND status != 'cancelled'", [$slot]);
            $out[] = ['slot' => $slot, 'time' => substr($slot, 11), 'free' => max(0, $cap - $taken)];
        }
        return $out;
    }

    public static function out(?array $r, bool $customer = true): ?array
    {
        if (!$r) return $r;
        $r['photos'] = parse_json($r['photos'] ?? '[]', []);
        $r['old_part_returned'] = (bool)$r['old_part_returned'];
        $svc = $r['service_id'] ? self::one('SELECT name_ku, name_ar, name_en FROM repair_services WHERE id = ?', [$r['service_id']]) : null;
        $r['service'] = $svc ?: ['name_ku' => $r['service_label']];
        $r['events'] = self::all('SELECT status, note, created_at FROM repair_events WHERE repair_id = ? ORDER BY id', [$r['id']]);
        $r['comments'] = self::all('SELECT id, author, name, body, created_at FROM repair_comments WHERE repair_id = ? ORDER BY id', [$r['id']]);
        $r['map_url'] = $r['lat'] !== null ? self::mapUrl($r) : null;
        $r['total'] = ($r['final_price'] ?? ($r['quoted_price'] + $r['approved_extra'])) + $r['pickup_fee'];
        if ($customer) unset($r['parts_cost'], $r['technician']);
        return $r;
    }
    public static function find(int $id): ?array { return self::one('SELECT * FROM repairs WHERE id = ?', [$id]); }
    public static function ofUser(string $code, int $uid): array
    {
        $r = self::one('SELECT * FROM repairs WHERE code = ? AND user_id = ?', [strtoupper(tostr($code, 12)), $uid]);
        if (!$r) throw new HttpException(404, 'not_found');
        return $r;
    }

    public static function book(array $user, array $b): array
    {
        $brand = tostr($b['brand'] ?? '', 40); $model = tostr($b['model'] ?? '', 80);
        $q = self::quote($brand, $model, $b['service_id'] ?? 0);
        $opt = null; foreach ($q['options'] as $o) if ($o['quality'] === ($b['quality'] ?? null)) $opt = $o;
        if (!$opt && count($q['options']) === 1) $opt = $q['options'][0];
        if (!$opt) throw new HttpException(422, 'repair_quality');
        $method = ($b['method'] ?? '') === 'pickup' ? 'pickup' : 'walkin';
        $appointment = null; $city = null; $address = null; $lat = null; $lng = null; $acc = null;
        if ($method === 'walkin') {
            $appointment = tostr($b['appointment'] ?? '', 16);
            $slot = null; foreach (self::slots(substr($appointment, 0, 10)) as $x) if ($x['slot'] === $appointment) $slot = $x;
            if (!$slot || $slot['free'] < 1) throw new HttpException(409, 'repair_slot');
        } else {
            if (!Setting::on('repair_pickup')) throw new HttpException(400, 'repair_pickup');
            $city = tostr($b['city'] ?? '', 60); $address = tostr($b['address'] ?? '', 300);
            if ($city === '' || $address === '') throw new HttpException(422, 'invalid_input', ['fields' => $city === '' ? ['city'] : ['address']]);
            $lat = is_numeric($b['lat'] ?? null) ? (float)$b['lat'] : null; $lng = is_numeric($b['lng'] ?? null) ? (float)$b['lng'] : null;
            // the courier needs the exact spot: a pin on the map inside Iraq / Kurdistan
            if (!($lat !== null && $lng !== null && $lat >= 29 && $lat <= 37.5 && $lng >= 38.7 && $lng <= 48.8)) throw new HttpException(422, 'repair_location');
            $lat = round($lat * 1e6) / 1e6; $lng = round($lng * 1e6) / 1e6;
            $acc = isset($b['loc_accuracy']) && $b['loc_accuracy'] !== '' ? min(max(toint($b['loc_accuracy']), 0), 100000) : null;
        }
        $code = self::newCode();
        $id = self::tx(function () use ($user, $b, $code, $brand, $model, $q, $opt, $method, $appointment, $city, $address, $lat, $lng, $acc) {
            self::run('INSERT INTO repairs(code, user_id, customer_name, phone, brand, model, service_id, service_label, quality, quoted_price, pickup_fee, warranty_days, method, appointment, city, address, imei, problem, lat, lng, loc_accuracy, pickup_note, created_at, updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())',
                [$code, $user['id'], tostr($b['name'] ?? '', 80) ?: $user['name'], norm_phone($b['phone'] ?? '') ?: $user['phone'], $brand, $model,
                 $q['service']['id'], $q['service']['name_ku'], $opt['quality'], $opt['price'], $method === 'pickup' ? Setting::int('repair_pickup_fee') : 0, $opt['warranty_days'],
                 $method, $appointment, $city, $address, tostr($b['imei'] ?? '', 20) ?: null, tostr($b['problem'] ?? '', 1000) ?: null, $lat, $lng, $acc,
                 $method === 'pickup' ? (tostr($b['pickup_note'] ?? '', 300) ?: null) : null]);
            $rid = self::lastId();
            self::event($rid, 'booked', null, $user['name']);
            return $rid;
        });
        return self::find($id);
    }

    public static function event(int $id, string $status, ?string $note, ?string $by): void
    {
        self::run('INSERT INTO repair_events(repair_id, status, note, by_name, created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())', [$id, $status, $note, $by]);
    }

    public static function decide(array $r, bool $ok, string $by): void
    {
        if ($r['status'] !== 'awaiting_approval' || $r['extra_status'] !== 'pending') throw new HttpException(409, 'repair_no_request');
        self::tx(function () use ($r, $ok, $by) {
            if ($ok) self::run("UPDATE repairs SET extra_status = 'approved', approved_extra = approved_extra + extra_price, status = 'repairing', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$r['id']]);
            else self::run("UPDATE repairs SET extra_status = 'rejected', status = 'ready', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$r['id']]);
            self::event((int)$r['id'], $ok ? 'repairing' : 'ready', $ok ? "approved:{$r['extra_price']}" : 'rejected', $by);
        });
    }

    public static function comment(array $r, string $author, string $name, $body): void
    {
        $body = tostr($body, 1000);
        if ($body === '') throw new HttpException(422, 'invalid_input', ['fields' => ['body']]);
        if ($author === 'customer' && (int)self::val("SELECT COUNT(*) FROM repair_comments WHERE repair_id = ? AND author = 'customer' AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR", [$r['id']]) >= 20) throw new HttpException(429, 'too_many_attempts');
        self::run('INSERT INTO repair_comments(repair_id, author, name, body, created_at) VALUES(?, ?, ?, ?, UTC_TIMESTAMP())', [$r['id'], $author, $name, $body]);
    }

    public static function warranty(string $code): ?array
    {
        $r = self::one("SELECT code, brand, model, service_id, service_label, quality, warranty_days, warranty_until, status, updated_at FROM repairs WHERE code = ? AND status = 'delivered'", [strtoupper(tostr($code, 12))]);
        if (!$r) return null;
        $svc = $r['service_id'] ? self::one('SELECT name_ku, name_ar, name_en FROM repair_services WHERE id = ?', [$r['service_id']]) : null;
        return $r + ['kind' => 'repair', 'service' => $svc ?: ['name_ku' => $r['service_label']], 'valid' => $r['warranty_until'] && strcmp($r['warranty_until'], substr(self::iraqNow(), 0, 10)) >= 0];
    }

    // ---------- admin ----------
    public static function adminList(string $status, string $q): array
    {
        $where = []; $p = [];
        if (in_array($status, self::STATUSES, true)) { $where[] = 'status = ?'; $p[] = $status; }
        elseif ($status === 'open') $where[] = "status NOT IN ('delivered', 'cancelled')";
        if ($q !== '') { $where[] = '(code LIKE ? OR phone LIKE ? OR customer_name LIKE ? OR imei LIKE ?)'; array_push($p, "%$q%", "%$q%", "%$q%", "%$q%"); }
        $rows = self::all('SELECT * FROM repairs ' . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . " ORDER BY CASE WHEN status IN ('delivered','cancelled') THEN 1 ELSE 0 END, COALESCE(appointment, created_at) LIMIT 300", $p);
        $today = substr(self::iraqNow(), 0, 10);
        return array_map(function ($r) use ($today) {
            $prior = $r['imei'] ? self::one("SELECT code, service_label, warranty_until FROM repairs WHERE imei = ? AND id != ? AND status = 'delivered' AND warranty_until >= ?", [$r['imei'], $r['id'], $today]) : null;
            $o = self::out($r, false) + ['warranty_claim' => $prior];
            $o['awaiting_reply'] = $o['comments'] && end($o['comments'])['author'] === 'customer';
            return $o;
        }, $rows);
    }

    public static function update(array $r, array $b, string $by): string
    {
        $status = in_array($b['status'] ?? '', self::STATUSES, true) ? $b['status'] : $r['status'];
        if ($r['status'] === 'delivered' && $status !== 'delivered') throw new HttpException(409, 'repair_closed');
        $photos = $r['photos'];
        if (is_array($b['photos'] ?? null)) $photos = json_enc(array_slice(array_values(array_filter(array_map(fn($x) => tostr($x, 300), $b['photos']), fn($x) => strncmp($x, '/uploads/', 9) === 0)), 0, 12));
        $final = array_key_exists('final_price', $b) && $b['final_price'] !== '' && $b['final_price'] !== null ? max(0, toint($b['final_price'])) : $r['final_price'];
        $until = $r['warranty_until'];
        if ($status === 'delivered' && $r['status'] !== 'delivered' && $r['extra_status'] !== 'rejected' && $r['warranty_days'] > 0) $until = gmdate('Y-m-d', time() + self::IRAQ_OFFSET + $r['warranty_days'] * 86400);
        self::tx(function () use ($r, $b, $status, $final, $photos, $until, $by) {
            self::run('UPDATE repairs SET status = ?, technician = ?, imei = ?, final_price = ?, parts_cost = ?, photos = ?, old_part_returned = ?, warranty_until = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [
                $status, array_key_exists('technician', $b) ? tostr($b['technician'], 60) : $r['technician'], array_key_exists('imei', $b) ? (tostr($b['imei'], 20) ?: null) : $r['imei'],
                $final, array_key_exists('parts_cost', $b) && $b['parts_cost'] !== '' && $b['parts_cost'] !== null ? max(0, toint($b['parts_cost'])) : $r['parts_cost'], $photos,
                array_key_exists('old_part_returned', $b) ? ($b['old_part_returned'] ? 1 : 0) : $r['old_part_returned'], $until, $r['id']]);
            if ($status !== $r['status'] || !empty($b['note'])) self::event((int)$r['id'], $status, tostr($b['note'] ?? '', 300) ?: null, $by);
        });
        return $status;
    }

    public static function askExtra(array $r, $price, $note, string $by): int
    {
        $price = max(0, toint($price)); $note = tostr($note, 300);
        if (!$price || $note === '') throw new HttpException(422, 'invalid_input', ['fields' => !$price ? ['price'] : ['note']]);
        self::tx(function () use ($r, $price, $note, $by) {
            self::run("UPDATE repairs SET extra_price = ?, extra_note = ?, extra_status = 'pending', status = 'awaiting_approval', updated_at = UTC_TIMESTAMP() WHERE id = ?", [$price, $note, $r['id']]);
            self::event((int)$r['id'], 'awaiting_approval', "+$price: $note", $by);
        });
        return $price;
    }

    public static function priceValues(array $b): array
    {
        $n = fn($x) => $x === '' || $x === null ? null : max(0, toint($x));
        $v = ['service_id' => toint($b['service_id'] ?? 0), 'brand' => tostr($b['brand'] ?? '', 40), 'model' => tostr($b['model'] ?? '', 80), 'price_original' => $n($b['price_original'] ?? null), 'price_copy' => $n($b['price_copy'] ?? null),
            'duration_min' => max(5, toint($b['duration_min'] ?? 60, 60)), 'warranty_original' => max(0, toint($b['warranty_original'] ?? 90, 90)), 'warranty_copy' => max(0, toint($b['warranty_copy'] ?? 30, 30)), 'active' => ($b['active'] ?? null) === false ? 0 : 1];
        if (!$v['service_id'] || $v['brand'] === '' || $v['model'] === '') throw new HttpException(422, 'invalid_input');
        return $v;
    }
}

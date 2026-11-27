<?php
// Verification codes (SMS / WhatsApp), Telegram notifications, authenticator codes (2FA), photo processing, backups.

// ================= HTTP helper =================
function http_post(string $url, array $headers, string $body, int $timeout = 15): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$code, $res === false ? $err : (string)$res];
}

// ================= OTP =================
class OtpError extends Exception {
    public string $errCode; public array $extra;
    public function __construct(string $code, array $extra = []) { parent::__construct($code); $this->errCode = $code; $this->extra = $extra; }
}
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_PURPOSES = ['register', 'reset', 'change_phone', 'quick'];
function sms_provider(): string { return strtolower((string)cfg('sms_provider', 'console')); }
function to_e164(string $phone): string {
    $p = preg_replace('/[^\d+]/', '', $phone);
    if (strncmp($p, '00', 2) === 0) $p = '+' . substr($p, 2);
    if ($p !== '' && $p[0] === '+') return $p;
    if (strncmp($p, '964', 3) === 0) return '+' . $p;
    if ($p !== '' && $p[0] === '0') return '+964' . substr($p, 1);
    return '+' . $p;
}
function otp_hash(string $code, string $salt): string { return hash('sha256', "$salt:$code"); }
function otp_deliver(string $phone, string $code, string $lang, string $store): void {
    $to = to_e164($phone);
    $msgs = [
        'ku' => "$code کۆدی پشتڕاستکردنەوەی {$store}یە. بۆ کەس مەینێرە.",
        'ar' => "$code هو رمز التحقق الخاص بك في $store. لا تشاركه مع أحد.",
        'en' => "$code is your $store verification code. Do not share it.",
    ];
    $text = $msgs[$lang] ?? $msgs['ku'];
    $prov = sms_provider();
    if ($prov === 'twilio') {
        $sid = (string)cfg('twilio_account_sid', ''); $tok = (string)cfg('twilio_auth_token', '');
        $body = ['To' => $to, 'Body' => $text];
        if (cfg('twilio_messaging_service_sid')) $body['MessagingServiceSid'] = cfg('twilio_messaging_service_sid'); else $body['From'] = (string)cfg('twilio_from', '');
        [$st, $res] = http_post('https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages.json',
            ['Authorization: Basic ' . base64_encode("$sid:$tok"), 'Content-Type: application/x-www-form-urlencoded'], http_build_query($body));
        if ($st < 200 || $st >= 300) throw new RuntimeException("Twilio $st: " . substr($res, 0, 300));
        return;
    }
    if ($prov === 'whatsapp') {
        $payload = ['messaging_product' => 'whatsapp', 'to' => ltrim($to, '+'), 'type' => 'template', 'template' => [
            'name' => (string)cfg('whatsapp_template', ''), 'language' => ['code' => (string)cfg('whatsapp_template_lang', 'en')],
            'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $code]]], ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => $code]]]],
        ]];
        [$st, $res] = http_post('https://graph.facebook.com/v21.0/' . rawurlencode((string)cfg('whatsapp_phone_number_id', '')) . '/messages',
            ['Authorization: Bearer ' . cfg('whatsapp_token', ''), 'Content-Type: application/json'], json_encode($payload));
        if ($st < 200 || $st >= 300) throw new RuntimeException("WhatsApp $st: " . substr($res, 0, 300));
        return;
    }
    error_log("[OTP] $to: $text");
}
function send_otp(string $phone, string $purpose, string $ip, string $lang, string $store): array {
    if (!in_array($purpose, OTP_PURPOSES, true)) throw new OtpError('invalid_input');
    $e164 = to_e164($phone);
    $prefixes = array_filter(array_map('trim', explode(',', (string)cfg('otp_allowed_prefixes', '+964'))));
    $okPrefix = false; foreach ($prefixes as $pre) if (strncmp($e164, $pre, strlen($pre)) === 0) $okPrefix = true;
    if (!$okPrefix || !preg_match('/^\+\d{10,15}$/', $e164)) throw new OtpError('phone_not_allowed');
    $now = ms();
    run('DELETE FROM otp_codes WHERE created_at < ?', [$now - 24 * 3600 * 1000]);
    $last = one('SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1', [$phone]);
    if ($last && $now - $last['created_at'] < OTP_RESEND_MS) throw new OtpError('otp_wait', ['retry_in' => (int)ceil((OTP_RESEND_MS - ($now - $last['created_at'])) / 1000)]);
    $perPhone = (int)val('SELECT COUNT(*) FROM otp_codes WHERE phone = ? AND created_at > ?', [$phone, $now - 3600 * 1000]);
    $perIp = (int)val('SELECT COUNT(*) FROM otp_codes WHERE ip = ? AND created_at > ?', [$ip, $now - 3600 * 1000]);
    if ($perPhone >= 5 || $perIp >= 20) throw new OtpError('too_many_attempts');
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $salt = rand_hex(8);
    run('UPDATE otp_codes SET used = 1 WHERE phone = ? AND purpose = ? AND used = 0', [$phone, $purpose]);
    run('INSERT INTO otp_codes(phone, purpose, code_hash, salt, ip, expires_at, created_at) VALUES(?,?,?,?,?,?,?)', [$phone, $purpose, otp_hash($code, $salt), $salt, $ip, $now + OTP_TTL_MS, $now]);
    $id = last_id();
    try { otp_deliver($phone, $code, $lang, $store ?: 'Store'); }
    catch (Throwable $e) { error_log('OTP delivery failed: ' . $e->getMessage()); run('DELETE FROM otp_codes WHERE id = ?', [$id]); throw new OtpError('otp_send_failed'); }
    $out = ['resend_in' => 60, 'expires_in' => 300];
    if (sms_provider() === 'console' && !is_prod()) $out['dev_code'] = $code;
    return $out;
}
function verify_otp(string $phone, string $purpose, $code): void {
    $row = one('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1', [$phone, $purpose]);
    if (!$row || $row['expires_at'] < ms() || $row['attempts'] >= 5) throw new OtpError('otp_expired');
    $given = otp_hash(preg_replace('/\D/', '', (string)($code ?? '')), $row['salt']);
    if (!hash_equals($row['code_hash'], $given)) {
        run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
        throw new OtpError('otp_invalid', ['attempts_left' => max(0, 5 - $row['attempts'] - 1)]);
    }
    run('UPDATE otp_codes SET used = 1 WHERE id = ?', [$row['id']]);
}

// ================= Telegram =================
function telegram_enabled(): bool { return cfg('telegram_bot_token') && cfg('telegram_chat_id'); }
function tg_esc($s): string { return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], (string)($s ?? '')); }
function notify(string $html): void {
    if (!telegram_enabled()) return;
    try {
        [$st, $res] = http_post('https://api.telegram.org/bot' . cfg('telegram_bot_token') . '/sendMessage', ['Content-Type: application/json'],
            json_encode(['chat_id' => cfg('telegram_chat_id'), 'text' => $html, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true]), 8);
        if ($st < 200 || $st >= 300) error_log("Telegram notify failed: $st " . substr($res, 0, 200));
    } catch (Throwable $e) { error_log('Telegram notify failed: ' . $e->getMessage()); }
}
function order_message(array $o, array $items, bool $highValue): string {
    $lines = array_map(fn($i) => '• ' . tg_esc($i['name']) . ($i['variant_label'] ? ' (' . tg_esc($i['variant_label']) . ')' : '') . " × {$i['qty']} = " . money_fmt($i['price'] * $i['qty']), $items);
    $out = ["🛒 <b>طلب جديد #{$o['id']}</b>" . ($highValue ? "\n⚠️ <b>طلب بقيمة عالية — اتصل بالزبون للتأكيد</b>" : ''), '',
        '👤 ' . tg_esc($o['customer_name']), '📞 ' . tg_esc($o['phone']), '📍 ' . tg_esc($o['city']) . ' — ' . tg_esc($o['address']),
        $o['note'] ? '📝 ' . tg_esc($o['note']) : null, '', ...$lines, '',
        !empty($o['bundle_discount']) ? '📦 خصم البكج: -' . money_fmt($o['bundle_discount']) : null,
        $o['discount'] ? '🏷️ كوبون ' . tg_esc($o['coupon_code']) . ': -' . money_fmt($o['discount']) : null,
        $o['tradein_credit'] ? '🔄 تبديل جهاز (' . tg_esc($o['tradein_label'] ?? '') . '): -' . money_fmt($o['tradein_credit']) . ' — <b>افحص الجهاز عند التسليم</b>' : null,
        '🚚 التوصيل: ' . money_fmt($o['delivery_fee']),
        $o['wallet_used'] ? '👛 من المحفظة: -' . money_fmt($o['wallet_used']) : null,
        '💰 <b>المطلوب: ' . money_fmt($o['total']) . ' د.ع</b>',
        ($o['source'] || $o['utm']) ? '📣 المصدر: ' . tg_esc(implode(' · ', array_filter([$o['source'], $o['utm']]))) : null,
        public_url() ? "\n" . tg_esc(public_url()) . admin_path() . '#/orders' : null];
    return implode("\n", array_filter($out, fn($l) => $l !== null));
}

// ================= TOTP (Google Authenticator etc.) =================
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32_encode(string $bin): string {
    $bits = 0; $value = 0; $out = '';
    foreach (str_split($bin) as $ch) { $value = (($value << 8) | ord($ch)) & 0xFFFFFF; $bits += 8; while ($bits >= 5) { $out .= B32[($value >> ($bits - 5)) & 31]; $bits -= 5; } }
    if ($bits > 0) $out .= B32[($value << (5 - $bits)) & 31];
    return $out;
}
function b32_decode(string $s): string {
    $bits = 0; $value = 0; $out = '';
    foreach (str_split(preg_replace('/[^A-Z2-7]/', '', strtoupper($s))) as $ch) { if ($ch === '') continue; $value = (($value << 5) | strpos(B32, $ch)) & 0xFFFFFF; $bits += 5; if ($bits >= 8) { $out .= chr(($value >> ($bits - 8)) & 255); $bits -= 8; } }
    return $out;
}
function hotp(string $secret, int $counter): string {
    $h = hash_hmac('sha1', pack('J', $counter), b32_decode($secret), true);
    $o = ord($h[19]) & 15;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}
function totp_new_secret(): string { return b32_encode(random_bytes(20)); }
function totp_verify(?string $secret, $code): bool {
    $c = preg_replace('/\D/', '', (string)($code ?? ''));
    if (strlen($c) !== 6 || !$secret) return false;
    $step = intdiv(ms(), 30000);
    for ($w = -1; $w <= 1; $w++) if (hash_equals(hotp($secret, $step + $w), $c)) return true;
    return false;
}
function otpauth_url(string $secret, string $account, string $issuer): string {
    return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($account) . "?secret=$secret&issuer=" . rawurlencode($issuer) . '&algorithm=SHA1&digits=6&period=30';
}

// ================= photos =================
// Checked by content, re-encoded (drops EXIF/GPS and anything hidden in the file), shrunk to 1400px, saved as WebP
// (or JPEG if this server's GD has no WebP) plus a 1200×630 JPEG used for link previews.
function process_upload(array $file): string {
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name']) && !getenv('RP_TEST_UPLOADS')) fail(400, 'invalid_file');
    if (($file['size'] ?? 0) > 15 * 1024 * 1024) fail(400, 'file_too_large');
    $info = @getimagesize($file['tmp_name']);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) fail(400, 'invalid_file');
    $src = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($file['tmp_name']), IMAGETYPE_PNG => @imagecreatefrompng($file['tmp_name']),
        IMAGETYPE_GIF => @imagecreatefromgif($file['tmp_name']), IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file['tmp_name']) : false,
    };
    if (!$src) fail(400, 'invalid_file');
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) { // phone photos: apply the rotation flag
        $exif = @exif_read_data($file['tmp_name']);
        $rot = [3 => 180, 6 => -90, 8 => 90][$exif['Orientation'] ?? 0] ?? 0;
        if ($rot) { $r = imagerotate($src, $rot, 0); if ($r) { imagedestroy($src); $src = $r; } }
    }
    $w = imagesx($src); $h = imagesy($src);
    $scale = min(1, 1400 / max($w, $h));
    $nw = max(1, (int)round($w * $scale)); $nh = max(1, (int)round($h * $scale));
    $img = imagecreatetruecolor($nw, $nh);
    imagealphablending($img, false); imagesavealpha($img, true);
    imagecopyresampled($img, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    $base = rand_hex(12);
    $webp = function_exists('imagewebp');
    $name = $base . ($webp ? '.webp' : '.jpg');
    $ok = $webp ? imagewebp($img, UPLOAD_DIR . "/$name", 80) : imagejpeg(flatten_white($img), UPLOAD_DIR . "/$name", 82);
    if (!$ok) fail(400, 'invalid_file');
    // link preview 1200×630 on white
    $og = imagecreatetruecolor(1200, 630); imagefill($og, 0, 0, imagecolorallocate($og, 255, 255, 255));
    $s2 = min(1200 / $w, 630 / $h); $ow = (int)round($w * $s2); $oh = (int)round($h * $s2);
    imagecopyresampled($og, $src, (int)((1200 - $ow) / 2), (int)((630 - $oh) / 2), 0, 0, $ow, $oh, $w, $h);
    imagejpeg($og, UPLOAD_DIR . "/$base-og.jpg", 82);
    imagedestroy($og); imagedestroy($img); imagedestroy($src);
    @unlink($file['tmp_name']);
    return "/uploads/$name";
}
function flatten_white($img) {
    $w = imagesx($img); $h = imagesy($img);
    $out = imagecreatetruecolor($w, $h); imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopy($out, $img, 0, 0, 0, 0, $w, $h);
    return $out;
}
function og_image_for($url): ?string {
    if (preg_match('#^/uploads/([a-f0-9]+)\.(webp|jpg)$#', (string)$url, $m) && is_file(UPLOAD_DIR . "/{$m[1]}-og.jpg")) return "/uploads/{$m[1]}-og.jpg";
    return preg_match('/\.(jpe?g|png|webp)$/i', (string)$url) ? (string)$url : null;
}

// ================= backups (SQL dump of every table) =================
function backup_dir(): string { return DATA_DIR . '/backups'; }
function sql_dump(string $file): string {
    if (!is_dir(dirname($file))) mkdir(dirname($file), 0750, true);
    $fh = fopen($file, 'w');
    fwrite($fh, "-- RamanPhone backup " . gmdate('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");
    $pdo = db();
    foreach (all('SHOW TABLES') as $t) {
        $table = array_values($t)[0];
        $create = one("SHOW CREATE TABLE `$table`");
        fwrite($fh, "DROP TABLE IF EXISTS `$table`;\n" . array_values($create)[1] . ";\n");
        $st = $pdo->query("SELECT * FROM `$table`");
        while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
            $vals = array_map(fn($v) => $v === null ? 'NULL' : (is_int($v) || is_float($v) ? (string)$v : $pdo->quote((string)$v)), $r);
            fwrite($fh, "INSERT INTO `$table` (`" . implode('`,`', array_keys($r)) . '`) VALUES (' . implode(',', $vals) . ");\n");
        }
        fwrite($fh, "\n");
    }
    fwrite($fh, "SET FOREIGN_KEY_CHECKS = 1;\n");
    fclose($fh);
    return $file;
}
// Shared hosting has no background jobs: the first request of the day writes that day's backup.
function daily_backup_if_due(): void {
    $dir = backup_dir();
    $file = "$dir/store-" . gmdate('Y-m-d') . '.sql';
    if (is_file($file)) return;
    try {
        if (!is_dir($dir)) { mkdir($dir, 0750, true); file_put_contents("$dir/.htaccess", "Require all denied\n"); }
        $lock = fopen("$dir/.lock", 'c'); if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return;
        if (!is_file($file)) sql_dump($file);
        $files = glob("$dir/store-*.sql"); sort($files);
        $keep = max(1, toint(cfg('backup_keep', 14), 14));
        foreach (array_slice($files, 0, max(0, count($files) - $keep)) as $f) @unlink($f);
        flock($lock, LOCK_UN);
    } catch (Throwable $e) { error_log('Backup failed: ' . $e->getMessage()); }
}
function list_backups(): array {
    $out = [];
    foreach (glob(backup_dir() . '/store-*.sql') ?: [] as $f) $out[] = ['name' => basename($f), 'size' => filesize($f)];
    usort($out, fn($a, $b) => strcmp($b['name'], $a['name']));
    return $out;
}

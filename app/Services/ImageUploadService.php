<?php
namespace App\Services;

use App\Core\HttpException;

/**
 * Photo uploads: checked by content (getimagesize, not the file name or browser type), re-encoded with GD
 * (drops EXIF/GPS and anything hidden in the file), shrunk to max 1400px, saved as WebP (JPEG if GD has no WebP)
 * plus a 1200×630 JPEG for link previews. Returns "/uploads/<random>.webp".
 */
final class ImageUploadService
{
    public const MAX_BYTES = 15 * 1024 * 1024;
    public const MAX_SIDE = 1400;

    public static function dir(): string { return ROOT . '/uploads'; }

    public static function store(?array $file): string
    {
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) throw new HttpException(422, 'invalid_file');
        if (($file['size'] ?? 0) > self::MAX_BYTES) throw new HttpException(413, 'file_too_large');
        $info = @getimagesize($file['tmp_name']);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) throw new HttpException(422, 'invalid_file');
        $src = match ($info[2]) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($file['tmp_name']), IMAGETYPE_PNG => @imagecreatefrompng($file['tmp_name']),
            IMAGETYPE_GIF => @imagecreatefromgif($file['tmp_name']), IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file['tmp_name']) : false,
        };
        if (!$src) throw new HttpException(422, 'invalid_file');
        if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) { // phone photos: apply the rotation flag before it is stripped
            $exif = @exif_read_data($file['tmp_name']);
            $rot = [3 => 180, 6 => -90, 8 => 90][$exif['Orientation'] ?? 0] ?? 0;
            if ($rot && ($r = imagerotate($src, $rot, 0))) { imagedestroy($src); $src = $r; }
        }
        $w = imagesx($src); $h = imagesy($src);
        $scale = min(1, self::MAX_SIDE / max($w, $h));
        $nw = max(1, (int)round($w * $scale)); $nh = max(1, (int)round($h * $scale));
        $img = imagecreatetruecolor($nw, $nh);
        imagealphablending($img, false); imagesavealpha($img, true);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        if (!is_dir(self::dir())) mkdir(self::dir(), 0755, true);
        $base = rand_hex(12);
        $webp = function_exists('imagewebp');
        $name = $base . ($webp ? '.webp' : '.jpg');
        $ok = $webp ? imagewebp($img, self::dir() . "/$name", 80) : imagejpeg(self::onWhite($img), self::dir() . "/$name", 82);
        if (!$ok) throw new HttpException(500, 'upload_failed');
        $og = imagecreatetruecolor(1200, 630);
        imagefill($og, 0, 0, imagecolorallocate($og, 255, 255, 255));
        $s2 = min(1200 / $w, 630 / $h); $ow = (int)round($w * $s2); $oh = (int)round($h * $s2);
        imagecopyresampled($og, $src, (int)((1200 - $ow) / 2), (int)((630 - $oh) / 2), 0, 0, $ow, $oh, $w, $h);
        imagejpeg($og, self::dir() . "/$base-og.jpg", 82);
        imagedestroy($og); imagedestroy($img); imagedestroy($src);
        @unlink($file['tmp_name']);
        return "/uploads/$name";
    }

    private static function onWhite($img)
    {
        $w = imagesx($img); $h = imagesy($img);
        $out = imagecreatetruecolor($w, $h); imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
        imagecopy($out, $img, 0, 0, 0, 0, $w, $h);
        return $out;
    }

    /** link-preview image for a stored photo, when there is one */
    public static function ogFor($url): ?string
    {
        if (preg_match('#^/uploads/([a-f0-9]+)\.(webp|jpg)$#', (string)$url, $m) && is_file(self::dir() . "/{$m[1]}-og.jpg")) return "/uploads/{$m[1]}-og.jpg";
        return preg_match('/\.(jpe?g|png|webp)$/i', (string)$url) ? (string)$url : null;
    }
}

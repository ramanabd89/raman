<?php
namespace App\Models;

use App\Core\Model;

final class Banner extends Model
{
    public const FIELDS = ['tag_ku', 'tag_ar', 'tag_en', 'title_ku', 'title_ar', 'title_en', 'subtitle_ku', 'subtitle_ar', 'subtitle_en', 'image', 'link', 'sort', 'active'];

    public static function active(): array { return self::all('SELECT * FROM banners WHERE active = 1 ORDER BY sort, id'); }
    public static function adminList(): array { return self::all('SELECT * FROM banners ORDER BY sort, id'); }
    public static function find(int $id): ?array { return self::one('SELECT * FROM banners WHERE id = ?', [$id]); }
    public static function values(array $b): array
    {
        return array_map(fn($f) => $f === 'sort' ? toint($b['sort'] ?? 0) : ($f === 'active' ? (array_key_exists('active', $b) && ($b['active'] === false || $b['active'] === 0) ? 0 : 1) : tostr($b[$f] ?? '', 500)), self::FIELDS);
    }
    public static function create(array $b): int { self::run('INSERT INTO banners(' . implode(',', self::FIELDS) . ') VALUES(' . self::marks(self::FIELDS) . ')', self::values($b)); return self::lastId(); }
    public static function update(int $id, array $b): void { self::run('UPDATE banners SET ' . implode(', ', array_map(fn($f) => "$f = ?", self::FIELDS)) . ' WHERE id = ?', array_merge(self::values($b), [$id])); }
    public static function remove(int $id): void { self::run('DELETE FROM banners WHERE id = ?', [$id]); }
}

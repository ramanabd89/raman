<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

/** Custom product labels ("New", "Best for gaming"…) with a colour. */
final class Tag extends Model
{
    public static function adminList(): array { return self::all('SELECT t.*, (SELECT COUNT(*) FROM product_tags pt WHERE pt.tag_id = t.id) AS products FROM tags t ORDER BY t.id'); }
    public static function find(int $id): ?array { return self::one('SELECT * FROM tags WHERE id = ?', [$id]); }
    public static function values(array $b): array
    {
        $v = ['name_ku' => tostr($b['name_ku'] ?? '', 40), 'name_ar' => tostr($b['name_ar'] ?? '', 40), 'name_en' => tostr($b['name_en'] ?? '', 40),
            'color' => preg_match('/^#[0-9a-f]{6}$/i', (string)($b['color'] ?? '')) ? $b['color'] : '#8B5CF6'];
        if ($v['name_ku'] === '') throw new HttpException(422, 'invalid_input', ['fields' => ['name_ku']]);
        return array_values($v);
    }
    public static function create(array $b): int { self::run('INSERT INTO tags(name_ku, name_ar, name_en, color) VALUES(?,?,?,?)', self::values($b)); return self::lastId(); }
    public static function update(int $id, array $b): void { self::run('UPDATE tags SET name_ku=?, name_ar=?, name_en=?, color=? WHERE id=?', array_merge(self::values($b), [$id])); }
    public static function remove(int $id): void { self::run('DELETE FROM tags WHERE id = ?', [$id]); }
}

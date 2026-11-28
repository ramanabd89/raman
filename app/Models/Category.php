<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

final class Category extends Model
{
    public static function find(int $id): ?array { return self::one('SELECT * FROM categories WHERE id = ?', [$id]); }

    /** Top-level categories with children and active product counts. */
    public static function tree(): array
    {
        $rows = self::all('SELECT * FROM categories ORDER BY sort, id');
        $counts = [];
        foreach (self::all('SELECT category_id, COUNT(*) n FROM products WHERE active = 1 GROUP BY category_id') as $r) $counts[$r['category_id'] ?? ''] = (int)$r['n'];
        $top = [];
        foreach ($rows as $c) {
            if ($c['parent_id']) continue;
            $kids = array_values(array_map(fn($s) => $s + ['count' => $counts[$s['id']] ?? 0], array_filter($rows, fn($s) => $s['parent_id'] === $c['id'])));
            $c['count'] = ($counts[$c['id']] ?? 0) + array_sum(array_column($kids, 'count'));
            $c['children'] = $kids;
            $top[] = $c;
        }
        return $top;
    }
    public static function adminList(): array { return self::all('SELECT * FROM categories ORDER BY parent_id IS NOT NULL, sort, id'); }
    public static function urlKey(array $c): string { $s = $c['slug'] ?: slugify($c['name_en'] ?? ''); return $c['id'] . ($s ? "-$s" : ''); }

    public static function values(array $b): array
    {
        $v = ['parent_id' => !empty($b['parent_id']) ? toint($b['parent_id']) : null, 'name_ku' => tostr($b['name_ku'] ?? '', 100), 'name_ar' => tostr($b['name_ar'] ?? '', 100),
            'name_en' => tostr($b['name_en'] ?? '', 100), 'image' => tostr($b['image'] ?? '', 500), 'sort' => toint($b['sort'] ?? 0)];
        if ($v['name_ku'] === '') throw new HttpException(422, 'invalid_input', ['fields' => ['name_ku']]);
        $v['slug'] = slugify($v['name_en']) ?: null;
        return $v;
    }
    public static function create(array $v): int
    {
        self::run('INSERT INTO categories(parent_id, name_ku, name_ar, name_en, image, sort, slug) VALUES(?,?,?,?,?,?,?)', array_values($v));
        return self::lastId();
    }
    public static function update(int $id, array $v): void
    {
        if ($v['parent_id'] === $id) throw new HttpException(422, 'invalid_input', ['fields' => ['parent_id']]);
        self::run('UPDATE categories SET parent_id=?, name_ku=?, name_ar=?, name_en=?, image=?, sort=?, slug=? WHERE id=?', array_merge(array_values($v), [$id]));
    }
    public static function remove(int $id): void { self::run('DELETE FROM categories WHERE id = ?', [$id]); }
}

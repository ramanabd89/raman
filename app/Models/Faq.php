<?php
namespace App\Models;

use App\Core\HttpException;
use App\Core\Model;

final class Faq extends Model
{
    public const FIELDS = ['q_ku', 'q_ar', 'q_en', 'a_ku', 'a_ar', 'a_en', 'sort', 'active'];

    public static function active(): array { return self::all('SELECT * FROM faqs WHERE active = 1 ORDER BY sort, id'); }
    public static function adminList(): array { return self::all('SELECT * FROM faqs ORDER BY sort, id'); }
    public static function find(int $id): ?array { return self::one('SELECT * FROM faqs WHERE id = ?', [$id]); }
    public static function values(array $b): array
    {
        $v = ['q_ku' => tostr($b['q_ku'] ?? '', 300), 'q_ar' => tostr($b['q_ar'] ?? '', 300), 'q_en' => tostr($b['q_en'] ?? '', 300), 'a_ku' => tostr($b['a_ku'] ?? '', 3000),
            'a_ar' => tostr($b['a_ar'] ?? '', 3000), 'a_en' => tostr($b['a_en'] ?? '', 3000), 'sort' => toint($b['sort'] ?? 0), 'active' => array_key_exists('active', $b) && ($b['active'] === false || $b['active'] === 0) ? 0 : 1];
        if ($v['q_ku'] === '' || $v['a_ku'] === '') throw new HttpException(422, 'invalid_input', ['fields' => $v['q_ku'] === '' ? ['q_ku'] : ['a_ku']]);
        return array_values($v);
    }
    public static function create(array $b): int { self::run('INSERT INTO faqs(' . implode(',', self::FIELDS) . ') VALUES(' . self::marks(self::FIELDS) . ')', self::values($b)); return self::lastId(); }
    public static function update(int $id, array $b): void { self::run('UPDATE faqs SET ' . implode(', ', array_map(fn($f) => "$f = ?", self::FIELDS)) . ' WHERE id = ?', array_merge(self::values($b), [$id])); }
    public static function remove(int $id): void { self::run('DELETE FROM faqs WHERE id = ?', [$id]); }
}

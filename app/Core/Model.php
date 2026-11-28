<?php
namespace App\Core;

use App\Config\Database;
use PDO;
use PDOStatement;
use Throwable;

/** Base model: prepared-statement helpers. Every query in the app goes through these (no string-built SQL values). */
abstract class Model
{
    public static function db(): PDO { return Database::pdo(); }

    public static function q(string $sql, array $p = []): PDOStatement
    {
        $st = self::db()->prepare($sql);
        $st->execute(array_values($p));
        return $st;
    }

    /** SUM()/AVG() arrive as DECIMAL strings; the storefront does math with them, so turn them into numbers. */
    private static function decimalCols(PDOStatement $st): array
    {
        $cols = [];
        for ($i = 0, $n = $st->columnCount(); $i < $n; $i++) {
            $m = $st->getColumnMeta($i);
            if ($m && in_array($m['native_type'] ?? '', ['NEWDECIMAL', 'DECIMAL'], true)) $cols[] = $m['name'];
        }
        return $cols;
    }
    private static function fix(?array $r, array $dec): ?array
    {
        if ($r) foreach ($dec as $c) if (isset($r[$c]) && is_string($r[$c])) $r[$c] = (float)$r[$c] != (int)$r[$c] ? (float)$r[$c] : (int)$r[$c];
        return $r;
    }

    public static function one(string $sql, array $p = []): ?array
    {
        $st = self::q($sql, $p);
        $r = $st->fetch();
        return $r === false ? null : self::fix($r, self::decimalCols($st));
    }
    public static function all(string $sql, array $p = []): array
    {
        $st = self::q($sql, $p);
        $rows = $st->fetchAll();
        $dec = $rows ? self::decimalCols($st) : [];
        return $dec ? array_map(fn($r) => self::fix($r, $dec), $rows) : $rows;
    }
    public static function val(string $sql, array $p = [])
    {
        $r = self::one($sql, $p);
        if (!$r) return null;
        $v = reset($r);
        return $v === false ? null : $v;
    }
    public static function run(string $sql, array $p = []): int { return self::q($sql, $p)->rowCount(); }
    public static function lastId(): int { return (int)self::db()->lastInsertId(); }
    public static function marks(array $xs): string { return implode(',', array_fill(0, max(1, count($xs)), '?')); }

    public static function tx(callable $fn)
    {
        $pdo = self::db();
        if ($pdo->inTransaction()) return $fn();
        $pdo->beginTransaction();
        try { $r = $fn(); $pdo->commit(); return $r; }
        catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }
}

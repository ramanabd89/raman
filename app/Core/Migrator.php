<?php
namespace App\Core;

use App\Config\Database;
use App\Models\Product;
use App\Models\Setting;
use App\Services\CacheService;
use PDOException;

/**
 * Brings an older database up to date on the first request after an update (shared hosting has no shell).
 * Each step is a .sql file in database/; parts that already exist (column, index, table) are skipped,
 * so a half-applied or hand-applied migration is safe to run again. One request at a time (file lock).
 */
final class Migrator
{
    public const VERSION = 2;
    private const STEPS = [2 => 'migration_phase2.sql'];
    // duplicate column · duplicate key name · table exists · can't drop (missing) · duplicate entry
    private const ALREADY_DONE = [1060, 1061, 1050, 1091, 1062];

    public static function upToDate(): bool { return Setting::int('schema_version', 1) >= self::VERSION; }

    public static function run(): void
    {
        if (self::upToDate()) return;
        $dir = ROOT . '/storage/cache';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $lock = @fopen($dir . '/.migrate.lock', 'c');
        if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return; } // another request is migrating
        try {
            Setting::values(true);
            $from = Setting::int('schema_version', 1);
            $pdo = Database::pdo();
            foreach (self::STEPS as $v => $file) {
                if ($v <= $from) continue;
                foreach (SqlRunner::split((string)file_get_contents(ROOT . '/database/' . $file)) as $stmt) {
                    try { $pdo->exec($stmt); }
                    catch (PDOException $e) { if (!in_array((int)($e->errorInfo[1] ?? 0), self::ALREADY_DONE, true)) throw $e; }
                }
                Setting::set('schema_version', (string)$v);
            }
            Product::rebuildIndex();
            CacheService::clear();
            error_log('[RamanPhone] database upgraded to schema ' . self::VERSION);
        } finally {
            if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        }
    }
}

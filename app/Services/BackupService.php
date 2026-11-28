<?php
namespace App\Services;

use App\Core\Model;
use App\Models\Setting;
use PDO;
use Throwable;

/**
 * SQL backups of every table into storage/backups (never web-reachable).
 * Shared hosting has no background jobs, so the first request of each day writes that day's backup (keeps 14).
 */
final class BackupService
{
    public static function dir(): string { return ROOT . '/storage/backups'; }

    public static function dump(string $file): string
    {
        if (!is_dir(dirname($file))) mkdir(dirname($file), 0750, true);
        $pdo = Model::db();
        $fh = fopen($file, 'w');
        fwrite($fh, '-- RamanPhone backup ' . gmdate('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_NUM) as [$table]) {
            $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
            fwrite($fh, "DROP TABLE IF EXISTS `$table`;\n{$create[1]};\n");
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

    public static function dailyIfDue(): void
    {
        $dir = self::dir();
        $file = "$dir/store-" . gmdate('Y-m-d') . '.sql';
        if (is_file($file)) return;
        try {
            if (!is_dir($dir)) mkdir($dir, 0750, true);
            $lock = fopen("$dir/.lock", 'c');
            if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return;
            if (!is_file($file)) self::dump($file);
            $files = glob("$dir/store-*.sql") ?: []; sort($files);
            foreach (array_slice($files, 0, max(0, count($files) - 14)) as $f) @unlink($f);
            flock($lock, LOCK_UN);
        } catch (Throwable $e) { error_log('Backup failed: ' . $e->getMessage()); }
    }

    public static function list(): array
    {
        $out = [];
        foreach (glob(self::dir() . '/store-*.sql') ?: [] as $f) $out[] = ['name' => basename($f), 'size' => filesize($f)];
        usort($out, fn($a, $b) => strcmp($b['name'], $a['name']));
        return $out;
    }

    public static function path(string $name): ?string
    {
        if (!preg_match('/^store-\d{4}-\d{2}-\d{2}\.sql$/', $name)) return null;
        $f = self::dir() . "/$name";
        return is_file($f) ? $f : null;
    }

    /** daily housekeeping: backup, old analytics and rate-limit rows */
    public static function housekeeping(): void
    {
        self::dailyIfDue();
        if (Setting::get('last_db_prune_date') === gmdate('Y-m-d')) return;
        try {
            Model::run('DELETE FROM page_views WHERE day < ?', [gmdate('Y-m-d', time() - 180 * 86400)]);
            Model::run('DELETE FROM auth_failures WHERE ts < ?', [ms() - 86400000]);
            Model::run('DELETE FROM sessions WHERE created_at < UTC_TIMESTAMP() - INTERVAL 31 DAY');
            Setting::set('last_db_prune_date', gmdate('Y-m-d'));
        } catch (Throwable $e) { error_log($e->getMessage()); }
    }
}

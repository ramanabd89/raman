<?php
namespace App\Core;

use App\Config\Database;
use App\Models\Product;
use RuntimeException;

/** Creates the tables, starter data, admin account and config.php. Used by install.php (and the test setup). */
final class Installer
{
    public static function checks(): array
    {
        return [
            'php' => version_compare(PHP_VERSION, '8.1.0', '>='),
            'pdo_mysql' => extension_loaded('pdo_mysql'),
            'gd' => extension_loaded('gd'),
            'curl' => extension_loaded('curl'),
            'mbstring' => extension_loaded('mbstring'),
            'uploads' => is_writable(ROOT . '/uploads'),
            'storage' => is_writable(ROOT . '/storage') && (is_writable(ROOT . '/storage/backups') || !is_dir(ROOT . '/storage/backups')),
            'config' => is_writable(ROOT),
        ];
    }

    public static function randomAdminPath(): string { return 'panel-' . substr(rand_hex(4), 0, 7); }

    /**
     * @param array $in db_host db_port db_name db_user db_pass admin_phone admin_password admin_path store_name default_lang env
     */
    public static function install(array $in): array
    {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $in['db_host'], $in['db_port'] ?? '3306', $in['db_name']);
        $pdo = Database::connect($dsn, $in['db_user'], $in['db_pass']);
        if ($pdo->query("SHOW TABLES LIKE 'products'")->fetch()) throw new RuntimeException('tables_exist');
        SqlRunner::runFile($pdo, ROOT . '/database/schema.sql');
        SqlRunner::runFile($pdo, ROOT . '/database/seed.sql');
        $code = strtoupper(substr(rand_hex(4), 0, 8));
        $pdo->prepare("INSERT INTO users(name, phone, password_hash, role, referral_code, created_at) VALUES('Admin', ?, ?, 'admin', ?, UTC_TIMESTAMP())")
            ->execute([$in['admin_phone'], password_hash($in['admin_password'], PASSWORD_DEFAULT), $code]);
        $set = $pdo->prepare('INSERT INTO settings(`key`, `value`) VALUES(?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
        if (!empty($in['store_name'])) $set->execute(['store_name', $in['store_name']]);
        if (in_array($in['default_lang'] ?? '', Lang::LANGS, true)) $set->execute(['default_lang', $in['default_lang']]);
        $set->execute(['analytics_secret', rand_hex(16)]);
        $config = ['db_host' => $in['db_host'], 'db_port' => $in['db_port'] ?? '3306', 'db_name' => $in['db_name'], 'db_user' => $in['db_user'], 'db_pass' => $in['db_pass'],
            'admin_path' => $in['admin_path'], 'public_url' => '', 'env' => $in['env'] ?? 'production'];
        $php = "<?php\n// Written by install.php on " . gmdate('Y-m-d H:i') . " UTC. Keep it private (database password).\n"
            . "// Everything else (OTPIQ, Telegram, store info) is in Admin → Settings.\nreturn " . var_export($config, true) . ";\n";
        if (file_put_contents(ROOT . '/config.php', $php, LOCK_EX) === false) throw new RuntimeException('config_write');
        @chmod(ROOT . '/config.php', 0640);
        Product::rebuildIndex();
        return $config;
    }
}

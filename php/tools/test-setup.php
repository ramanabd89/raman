<?php
// Test helper: empties the test database, loads schema + starter data, creates the admin 07500000000 / admin123
// and writes config.php in the built folder. NEVER run against a real store.
//   php php/tools/test-setup.php php/dist/ramanphone <db_name> <db_user> <db_pass>
[$_, $dir, $name, $user, $pass] = $argv + [null, null, 'ramanphone_test', 'root', ''];
$dir = realpath((string)$dir) ?: $dir;
if (!$dir || !is_dir($dir)) { fwrite(STDERR, "usage: test-setup.php <built-dir> <db> <user> <pass>\n"); exit(1); }
$pdo = new PDO('mysql:host=localhost;charset=utf8mb4', $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("DROP DATABASE IF EXISTS `$name`; CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE `$name`");
$pdo->exec("SET time_zone = '+00:00', sql_mode = 'NO_ENGINE_SUBSTITUTION'");
foreach (['schema.sql', 'seed.sql'] as $f) {
    foreach (preg_split('/;\s*\n(?=(?:INSERT|CREATE|SET|DROP|ALTER)\b)/', file_get_contents("$dir/app/install/$f")) as $stmt) {
        $stmt = trim(preg_replace('/^--.*$/m', '', $stmt));
        if ($stmt !== '' && $stmt !== ';') $pdo->exec(rtrim($stmt, ';'));
    }
}
$pdo->prepare("INSERT INTO users(name, phone, password_hash, role, referral_code, created_at) VALUES('Admin','07500000000',?, 'admin', 'ADMIN001', UTC_TIMESTAMP())")->execute([password_hash('admin123', PASSWORD_DEFAULT)]);
file_put_contents("$dir/config.php", "<?php\nreturn " . var_export(['db_host' => 'localhost', 'db_name' => $name, 'db_user' => $user, 'db_pass' => $pass, 'admin_path' => '/admin', 'env' => 'test', 'sms_provider' => 'console'], true) . ";\n");
define('ROOT_OVERRIDE', $dir);
chdir($dir);
require "$dir/app/lib/core.php";
require "$dir/app/lib/search.php";
rebuild_search_index();
echo "test database ready\n";

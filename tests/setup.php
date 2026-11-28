<?php
// Test helper — empties a TEST database and installs the store into it (admin 07500000000 / admin123, verification
// codes in test mode). Writes config.php in the project root. NEVER point it at a real store's database.
//   php tests/setup.php <db_name> <db_user> <db_pass>
if (PHP_SAPI !== 'cli') exit;
define('ROOT', dirname(__DIR__));
define('APP', ROOT . '/app');
require APP . '/Core/helpers.php';
require APP . '/Core/Autoloader.php';
App\Core\Autoloader::register(APP);

[$_, $name, $user, $pass] = $argv + [null, 'ramanphone_test', 'root', ''];
if (!preg_match('/_test$/', (string)$name)) { fwrite(STDERR, "The database name must end with _test\n"); exit(1); }
$pdo = new PDO('mysql:host=localhost;charset=utf8mb4', $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("DROP DATABASE IF EXISTS `$name`");
$pdo->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
@unlink(ROOT . '/config.php');
App\Core\Installer::install(['db_host' => 'localhost', 'db_name' => $name, 'db_user' => $user, 'db_pass' => $pass,
    'admin_phone' => '07500000000', 'admin_password' => 'admin123', 'admin_path' => 'admin', 'store_name' => 'RamanPhone', 'default_lang' => 'ku', 'env' => 'test']);
App\Models\Setting::set('otp_test_mode', '1');
echo "test store installed\n";

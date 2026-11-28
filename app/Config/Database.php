<?php
namespace App\Config;

use PDO;

/** One PDO connection per request (UTC, utf8mb4, real numbers, exceptions on errors). */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            Config::get('db_host', 'localhost'), Config::get('db_port', '3306'), Config::get('db_name', ''));
        self::$pdo = self::connect($dsn, (string)Config::get('db_user', ''), (string)Config::get('db_pass', ''));
        return self::$pdo;
    }

    public static function connect(string $dsn, string $user, string $pass): PDO
    {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,   // integers come back as integers
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00', sql_mode = 'NO_ENGINE_SUBSTITUTION'");
        return $pdo;
    }
}

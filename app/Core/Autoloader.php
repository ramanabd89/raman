<?php
namespace App\Core;

/** Loads App\Foo\Bar from app/Foo/Bar.php (no Composer needed). */
final class Autoloader
{
    public static function register(string $appDir): void
    {
        spl_autoload_register(static function (string $class) use ($appDir): void {
            if (strncmp($class, 'App\\', 4) !== 0) return;
            $file = $appDir . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
            if (is_file($file)) require $file;
        });
    }
}

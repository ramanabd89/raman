<?php
namespace App\Core;

/** Renders PHP templates from app/Views (variables are extracted; output is escaped in the templates with e()). */
final class View
{
    public static function render(string $template, array $data = []): string
    {
        $file = APP . '/Views/' . $template . '.php';
        if (!is_file($file)) throw new \RuntimeException("View not found: $template");
        extract($data, EXTR_SKIP);
        $level = ob_get_level();
        ob_start();
        try { require $file; }
        catch (\Throwable $e) { while (ob_get_level() > $level) ob_end_clean(); throw $e; }
        return (string)ob_get_clean();
    }
}

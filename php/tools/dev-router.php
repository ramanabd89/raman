<?php
// Local testing with PHP's built-in server (mimics .htaccess):  php -S localhost:8080 -t php/dist/ramanphone php/tools/dev-router.php
$root = $_SERVER['DOCUMENT_ROOT'];
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^/(app|data)(/|$)|^/config(\.sample)?\.php$|/\.#', $path)) { http_response_code(403); exit('Forbidden'); }
if ($path !== '/' && is_file($root . $path)) {
    if (substr($path, -4) === '.php') { require $root . $path; return true; }
    return false; // static file
}
require $root . '/index.php';

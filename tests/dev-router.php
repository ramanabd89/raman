<?php
// Local development / tests with PHP's built-in server (mimics .htaccess):
//   php -S 127.0.0.1:8080 tests/dev-router.php        (run from the project root)
$root = dirname(__DIR__);
$path = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#(^|/)(app|lang|database|storage|tests)(/|$)|(^|/)(config\.php|config\.sample\.php|\.user\.ini|README\.md)$|/\.#', $path)) { http_response_code(403); exit('Forbidden'); }
if ($path !== '/' && is_file($root . $path)) {
    if (substr($path, -4) === '.php') { $_SERVER['SCRIPT_NAME'] = $path; chdir($root); require $root . $path; return true; }
    return false; // static file
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
chdir($root);
require $root . '/index.php';

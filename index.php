<?php
// RamanPhone — every request that is not a real file (css/js/images) comes here.
declare(strict_types=1);

define('ROOT', __DIR__);
define('APP', ROOT . '/app');

if (PHP_VERSION_ID < 80100) { http_response_code(500); exit('RamanPhone needs PHP 8.1 or newer.'); }

require APP . '/Core/helpers.php';
require APP . '/Core/Autoloader.php';
App\Core\Autoloader::register(APP);

App\Core\Kernel::run();

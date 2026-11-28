<?php
namespace App\Core;

use App\Config\Config;
use App\Controllers\SeoController;
use App\Models\Setting;
use App\Services\BackupService;
use Throwable;

/** Request lifecycle: install check → headers → language → session → API router or server-rendered page. */
final class Kernel
{
    public static function run(): void
    {
        if (!Config::exists()) Response::redirect(Url::base() . 'install.php');
        Response::securityHeaders();
        $isApi = strncmp(Url::requestPath(), '/api/', 5) === 0;
        try {
            Lang::set(Lang::detect(Setting::get('default_lang', 'ku')));
            $req = new Request();
            Auth::load($req);
            Csrf::token();
            BackupService::housekeeping();
            if ($isApi) {
                $router = require APP . '/routes.php';
                Response::json($router->dispatch($req));
            }
            (new SeoController($req))->handle();
        } catch (HttpException $e) {
            if ($isApi) Response::json(['error' => $e->errCode, 'message' => Lang::has('err.' . $e->errCode) ? __('err.' . $e->errCode) : __('err.generic')] + $e->extra, $e->status);
            SeoController::errorPage($e->status);
        } catch (Throwable $e) {
            error_log('[RamanPhone] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $debug = Config::isProd() ? [] : ['debug' => $e->getMessage(), 'at' => basename($e->getFile()) . ':' . $e->getLine()];
            if ($isApi) Response::json(['error' => 'server_error', 'message' => __('err.server_error')] + $debug, 500);
            SeoController::errorPage(500);
        }
    }
}

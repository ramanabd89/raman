<?php
namespace App\Middleware;

use App\Core\Csrf;
use App\Core\Request;

/** State-changing requests must carry the CSRF header (see App\Core\Csrf). */
final class CsrfMiddleware
{
    public function handle(Request $req): void { Csrf::verify($req); }
}

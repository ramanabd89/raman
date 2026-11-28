<?php
namespace App\Middleware;

use App\Core\HttpException;
use App\Core\Request;

/** Route needs a signed-in user. */
final class AuthMiddleware
{
    public function handle(Request $req): void
    {
        if (!$req->user) throw new HttpException(401, 'unauthorized');
    }
}

<?php
namespace App\Middleware;

use App\Core\RateLimiter;
use App\Core\Request;

/** Generic throttle: 30 counted calls per IP per 15 minutes (sign-in / sign-up style routes). */
final class RateLimitMiddleware
{
    public function handle(Request $req): void { RateLimiter::throttle(["ip:{$req->ip}"]); }
}

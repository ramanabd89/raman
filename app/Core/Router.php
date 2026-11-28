<?php
namespace App\Core;

/**
 * Tiny router: route('GET', '/api/products/:id', [Controller::class, 'show'], [Middleware::class, ...]).
 * Answers 404 when nothing matches and 405 (with Allow) when the path exists for another method.
 */
final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, array $handler, array $middleware = []): void
    {
        $re = '#^' . preg_replace('#:(\w+)#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $re, $handler, $middleware];
    }
    public function get(string $p, array $h, array $m = []): void { $this->add('GET', $p, $h, $m); }
    public function post(string $p, array $h, array $m = []): void { $this->add('POST', $p, $h, $m); }
    public function put(string $p, array $h, array $m = []): void { $this->add('PUT', $p, $h, $m); }
    public function patch(string $p, array $h, array $m = []): void { $this->add('PATCH', $p, $h, $m); }
    public function delete(string $p, array $h, array $m = []): void { $this->add('DELETE', $p, $h, $m); }

    /** Returns the handler's result; throws HttpException(404/405) when nothing fits. */
    public function dispatch(Request $req)
    {
        $allowed = [];
        foreach ($this->routes as [$method, $re, $handler, $middleware]) {
            if (!preg_match($re, $req->path, $m)) continue;
            if ($method !== $req->method) { $allowed[] = $method; continue; }
            foreach ($m as $k => $v) if (is_string($k)) $req->params[$k] = $v;
            foreach ($middleware as $mw) (new $mw())->handle($req);
            [$class, $action] = $handler;
            return (new $class($req))->$action();
        }
        if ($allowed) {
            header('Allow: ' . implode(', ', array_unique($allowed)));
            throw new HttpException(405, 'method_not_allowed');
        }
        throw new HttpException(404, 'not_found');
    }
}

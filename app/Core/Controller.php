<?php
namespace App\Core;

/** Base controller: the request, plus shortcuts for errors and validation. */
abstract class Controller
{
    public function __construct(protected Request $req) {}

    protected function fail(int $status, string $code, array $extra = []): never { throw new HttpException($status, $code, $extra); }
    protected function user(): array { return $this->req->user ?? []; }
    protected function uid(): int { return $this->req->uid(); }
    protected function in(string $k, $d = null) { return $this->req->body[$k] ?? $d; }
    protected function qs(string $k, $d = null) { return $this->req->query[$k] ?? $d; }
    protected function id(string $k = 'id'): int { return toint($this->req->params[$k] ?? 0); }
    protected function validate(array $rules): array { return Validator::check($this->req->body, $rules); }
}

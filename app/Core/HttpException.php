<?php
namespace App\Core;

use Exception;

/** Thrown anywhere to stop and answer with an HTTP status + error code (translated message added by the router). */
final class HttpException extends Exception
{
    public function __construct(public int $status, public string $errCode, public array $extra = [])
    {
        parent::__construct($errCode);
    }
}

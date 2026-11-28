<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\RateLimiter;
use App\Models\Review;
use App\Services\ImageUploadService;

final class ReviewController extends Controller
{
    public function list(): array
    {
        return Review::forProduct($this->id(), $this->req->user, min(max(toint($this->qs('limit', 5), 5), 1), 30), max(toint($this->qs('offset', 0)), 0), $this->qs('photos', '') === '1');
    }
    public function save(): array
    {
        return ['ok' => true, 'status' => Review::save($this->user(), $this->id(), $this->in('rating'), $this->in('comment', ''), $this->in('photos', []))];
    }
    /** customer photo for a review: 12 per 15 minutes per account */
    public function upload(): array
    {
        RateLimiter::throttle(["revup:{$this->uid()}"]);
        return ['url' => ImageUploadService::store($this->req->files['file'] ?? null)];
    }
    public function toReview(): array { return Review::toReview($this->uid()); }
}

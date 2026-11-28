<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\HttpException;
use App\Models\Wishlist;

/** Signed-in customers' favourites (guests keep theirs in the browser until they sign in). */
final class WishlistController extends Controller
{
    public function list(): array { return ['ids' => Wishlist::ids($this->uid())]; }

    public function toggle(): array
    {
        $pid = toint($this->in('product_id', 0));
        if ($pid <= 0) throw new HttpException(422, 'invalid_input', ['fields' => ['product_id']]);
        return Wishlist::toggle($this->uid(), $pid);
    }

    public function merge(): array
    {
        $ids = $this->in('ids', []);
        return ['ids' => Wishlist::merge($this->uid(), is_array($ids) ? $ids : [])];
    }
}

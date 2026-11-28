<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Models\AuditLog;
use App\Models\Banner;
use App\Models\Category;
use App\Models\Faq;
use App\Models\Product;
use App\Models\Tag;

/** Categories, banners, product tags and FAQ. */
final class CatalogController extends Controller
{
    public function categories(): array { return Category::adminList(); }
    public function createCategory(): array
    {
        $v = Category::values($this->req->body); $id = Category::create($v);
        AuditLog::add($this->req, 'category_create', ['id' => $id, 'name' => $v['name_ku']]);
        Product::rebuildIndex();
        return Category::find($id);
    }
    public function updateCategory(): array { Category::update($this->id(), Category::values($this->req->body)); Product::rebuildIndex(); return Category::find($this->id()); }
    public function deleteCategory(): array { Category::remove($this->id()); AuditLog::add($this->req, 'category_delete', ['id' => $this->id()]); return ['ok' => true]; }

    public function banners(): array { return Banner::adminList(); }
    public function createBanner(): array { return Banner::find(Banner::create($this->req->body)); }
    public function updateBanner(): array { Banner::update($this->id(), $this->req->body); return Banner::find($this->id()); }
    public function deleteBanner(): array { Banner::remove($this->id()); AuditLog::add($this->req, 'banner_delete', ['id' => $this->id()]); return ['ok' => true]; }

    public function tags(): array { return Tag::adminList(); }
    public function createTag(): array { return Tag::find(Tag::create($this->req->body)); }
    public function updateTag(): array { Tag::update($this->id(), $this->req->body); return Tag::find($this->id()); }
    public function deleteTag(): array { Tag::remove($this->id()); return ['ok' => true]; }

    public function faqs(): array { return Faq::adminList(); }
    public function createFaq(): array { return Faq::find(Faq::create($this->req->body)); }
    public function updateFaq(): array { Faq::update($this->id(), $this->req->body); return Faq::find($this->id()); }
    public function deleteFaq(): array { Faq::remove($this->id()); return ['ok' => true]; }
}

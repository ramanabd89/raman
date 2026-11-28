<?php
namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\HttpException;
use App\Core\Model;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\Setting;
use App\Models\StockMovement;
use App\Models\Variant;

final class ProductController extends Controller
{
    public function list(): array
    {
        return Product::decorateAdmin(Product::attachVariants(Product::list(array_merge($this->req->query, ['sort' => $this->qs('sort', 'newest'), 'limit' => 200]), true)));
    }

    public function create(): array
    {
        $v = Product::values($this->req->body);
        $id = Model::tx(function () use ($v) {
            Model::run('INSERT INTO products(' . implode(',', Product::FIELDS) . ', created_at) VALUES(' . Model::marks(Product::FIELDS) . ', UTC_TIMESTAMP())', array_map(fn($f) => $v[$f], Product::FIELDS));
            $pid = Model::lastId();
            Product::saveVariants($pid, $v['variants']); Product::saveTags($pid, $v['tag_ids']); Product::saveCompat($pid, $v['compatible_models']); Product::index($pid);
            $stock = (int)Model::val('SELECT stock FROM products WHERE id = ?', [$pid]);
            if ($stock) StockMovement::record($pid, null, $stock, 'initial', null, $this->user()['name']);
            return $pid;
        });
        AuditLog::add($this->req, 'product_create', ['id' => $id, 'name' => $v['name_ku'], 'price' => $v['price']]);
        return Product::adminOne($id);
    }

    public function update(): array
    {
        $v = Product::values($this->req->body);
        $id = $this->id();
        $before = Model::one('SELECT price, stock FROM products WHERE id = ?', [$id]);
        if (!$before) throw new HttpException(404, 'not_found');
        $bv = []; foreach (Product::variants($id) as $x) $bv[$x['id']] = $x['stock'];
        Model::tx(function () use ($v, $id, $before, $bv) {
            Model::run('UPDATE products SET ' . implode(', ', array_map(fn($f) => "$f = ?", Product::FIELDS)) . ' WHERE id = ?', array_merge(array_map(fn($f) => $v[$f], Product::FIELDS), [$id]));
            Product::saveVariants($id, $v['variants']); Product::saveTags($id, $v['tag_ids']); Product::saveCompat($id, $v['compatible_models']); Product::index($id);
            $after = Product::variants($id);
            if ($after) foreach ($after as $x) StockMovement::record($id, $x['id'], $x['stock'] - ($bv[$x['id']] ?? 0), 'admin_edit', null, $this->user()['name']);
            else StockMovement::record($id, null, $v['stock'] - $before['stock'], 'admin_edit', null, $this->user()['name']);
        });
        AuditLog::add($this->req, 'product_update', ['id' => $id, 'name' => $v['name_ku'], 'price' => [$before['price'], $v['price']], 'stock' => [$before['stock'], $v['stock']]]);
        return Product::adminOne($id);
    }

    public function delete(): array
    {
        $p = Model::one('SELECT name_ku FROM products WHERE id = ?', [$this->id()]);
        Model::run('DELETE FROM products WHERE id = ?', [$this->id()]);
        AuditLog::add($this->req, 'product_delete', ['id' => $this->id(), 'name' => $p['name_ku'] ?? null]);
        return ['ok' => true];
    }

    /** % or fixed IQD change by category/brand, preview first. Dollar-linked products only take % changes. */
    public function bulkPrice(): array
    {
        $b = $this->req->body;
        $mode = ($b['mode'] ?? '') === 'amount' ? 'amount' : 'percent';
        $value = num($b['value'] ?? 0);
        if (!$value || ($mode === 'percent' && ($value <= -90 || $value > 300))) throw new HttpException(422, 'invalid_input', ['fields' => ['value']]);
        $step = max(1, toint($b['round'] ?? null, Setting::int('usd_round', 250)));
        $where = []; $p = [];
        if (!empty($b['category_id'])) { $c = toint($b['category_id']); $where[] = '(category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))'; array_push($p, $c, $c); }
        if (!empty($b['brand'])) { $where[] = 'LOWER(brand) = LOWER(?)'; $p[] = tostr($b['brand'], 80); }
        $products = Model::all('SELECT * FROM products ' . ($where ? 'WHERE ' . implode(' AND ', $where) : ''), $p);
        $round = fn($n) => (int)max($step, round($n / $step) * $step);
        $change = fn($x) => $round($mode === 'percent' ? $x * (1 + $value / 100) : $x + $value);
        $changes = [];
        foreach ($products as $pr) {
            if ($pr['usd_priced']) { if ($mode !== 'percent') continue; $changes[] = ['id' => $pr['id'], 'name' => $pr['name_ku'], 'usd' => true, 'from' => $pr['price_usd'], 'to' => round($pr['price_usd'] * (1 + $value / 100) * 100) / 100]; continue; }
            $vs = Product::variants((int)$pr['id']);
            if ($vs) foreach ($vs as $v) $changes[] = ['id' => $pr['id'], 'variant_id' => $v['id'], 'name' => "{$pr['name_ku']} ({$v['label']})", 'from' => $v['price'], 'to' => $change($v['price'])];
            else $changes[] = ['id' => $pr['id'], 'name' => $pr['name_ku'], 'from' => $pr['price'], 'to' => $change($pr['price'])];
        }
        if (!empty($b['preview'])) return ['count' => count($changes), 'changes' => array_slice($changes, 0, 200), 'skipped_usd' => $mode === 'amount' ? count(array_filter($products, fn($x) => $x['usd_priced'])) : 0];
        Model::tx(function () use ($changes, $value) {
            foreach ($changes as $c) {
                if (!empty($c['usd'])) { Model::run('UPDATE products SET price_usd = ? WHERE id = ?', [$c['to'], $c['id']]); Model::run('UPDATE product_variants SET price_usd = ROUND(price_usd * ?, 2) WHERE product_id = ? AND price_usd IS NOT NULL', [1 + $value / 100, $c['id']]); }
                elseif (!empty($c['variant_id'])) Model::run('UPDATE product_variants SET price = ? WHERE id = ?', [$c['to'], $c['variant_id']]);
                else Model::run('UPDATE products SET price = ? WHERE id = ?', [$c['to'], $c['id']]);
            }
            foreach (array_unique(array_column(array_filter($changes, fn($c) => !empty($c['variant_id'])), 'id')) as $id) Product::syncFromVariants((int)$id);
            if (array_filter($changes, fn($c) => !empty($c['usd']))) Product::repriceUsd();
        });
        AuditLog::add($this->req, 'bulk_price', ['mode' => $mode, 'value' => $value, 'count' => count($changes), 'category' => ($b['category_id'] ?? null) ?: null, 'brand' => ($b['brand'] ?? null) ?: null]);
        return ['ok' => true, 'count' => count($changes)];
    }

    public function presets(): array
    {
        $out = [];
        foreach (array_slice(is_array($this->in('presets')) ? $this->in('presets') : [], 0, 10) as $g) {
            $name = tostr($g['name'] ?? '', 40);
            $vals = array_slice(array_values(array_filter(array_map(fn($v) => tostr($v, 40), is_array($g['values'] ?? null) ? $g['values'] : []))), 0, 30);
            if ($name !== '' && $vals) $out[] = ['name' => $name, 'values' => $vals];
        }
        Setting::set('variant_presets', json_enc($out));
        AuditLog::add($this->req, 'variant_presets', ['groups' => array_column($out, 'name')]);
        return $out;
    }

    public function stock(): array { return StockMovement::list(toint($this->qs('product_id', 0))); }
    public function adjust(): array
    {
        $b = $this->req->body;
        $stock = Variant::adjustStock(toint($b['product_id'] ?? 0), !empty($b['variant_id']) ? toint($b['variant_id']) : null, toint($b['delta'] ?? 0), (string)($b['reason'] ?? 'correction'), tostr($b['note'] ?? '', 200) ?: null, $this->user()['name']);
        AuditLog::add($this->req, 'stock_adjust', ['product' => toint($b['product_id'] ?? 0), 'variant' => $b['variant_id'] ?? null, 'delta' => toint($b['delta'] ?? 0), 'reason' => $b['reason'] ?? 'correction']);
        return ['ok' => true, 'stock' => $stock];
    }
}

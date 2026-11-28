<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\HttpException;
use App\Models\Setting;
use App\Models\TradeIn;

/** "Swap your old phone": model list and instant estimate (confirmed by inspection at delivery). */
final class TradeInController extends Controller
{
    public function models(): array
    {
        return Setting::on('tradein_enabled') ? ['enabled' => true, 'models' => TradeIn::models()] : ['enabled' => false, 'models' => []];
    }

    public function quote(): array
    {
        if (!Setting::on('tradein_enabled')) throw new HttpException(400, 'tradein_disabled');
        $q = TradeIn::quote($this->in('model_id', 0), $this->in('answers', []));
        if (!empty($q['error'])) throw new HttpException(422, $q['error']);
        return ['estimate' => $q['estimate'], 'label' => $q['label'], 'deduction_pct' => $q['deduction_pct'], 'breakdown' => $q['breakdown']];
    }
}

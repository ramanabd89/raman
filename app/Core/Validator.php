<?php
namespace App\Core;

/**
 * Input validation. Rules: required, int, min:N, max:N, len:N (max length), in:a|b|c, phone, regex:/…/.
 * On failure: 422 invalid_input with the field names that failed.
 */
final class Validator
{
    public static function check(array $data, array $rules): array
    {
        $out = []; $bad = [];
        foreach ($rules as $field => $spec) {
            $v = $data[$field] ?? null;
            $list = is_array($spec) ? $spec : explode('|', $spec);
            $required = in_array('required', $list, true);
            if ($v === null || $v === '' || (is_string($v) && trim($v) === '')) {
                if ($required) $bad[] = $field;
                $out[$field] = null;
                continue;
            }
            $ok = true;
            foreach ($list as $r) {
                [$name, $arg] = array_pad(explode(':', $r, 2), 2, null);
                switch ($name) {
                    case 'int': $ok = is_numeric($v); $v = toint($v); break;
                    case 'min': $ok = $ok && (is_numeric($v) ? $v >= (float)$arg : mb_strlen((string)$v) >= (int)$arg); break;
                    case 'max': $ok = $ok && (is_numeric($v) ? $v <= (float)$arg : mb_strlen((string)$v) <= (int)$arg); break;
                    case 'len': $v = tostr($v, (int)$arg); break;
                    case 'in': $ok = $ok && in_array((string)$v, explode(',', (string)$arg), true); break;
                    case 'phone': $v = norm_phone($v); $ok = $ok && strlen($v) >= 7; break;
                    case 'regex': $ok = $ok && preg_match((string)$arg, (string)$v); break;
                }
            }
            if (!$ok) $bad[] = $field;
            $out[$field] = is_string($v) ? trim($v) : $v;
        }
        if ($bad) throw new HttpException(422, 'invalid_input', ['fields' => array_values(array_unique($bad))]);
        return $out;
    }
}

<?php
/** shared <head> for printable pages; @var string $title @var string $size 'a4'|'80' */
use App\Core\Lang;
use App\Core\Url;
?><!doctype html>
<html lang="<?= Lang::HREFLANG[Lang::current()] ?>" dir="<?= Lang::dir() ?>">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
  <meta name="rp-base" content="<?= e(Url::base()) ?>">
  <title><?= e($title) ?></title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="<?= e(path('css/print.css')) ?>">
</head>
<body class="print-<?= $size === '80' ? 'thermal' : 'a4' ?>">

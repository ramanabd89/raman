#!/usr/bin/env bash
# Builds the upload package for Hostinger: php/dist/ramanphone/ and php/dist/ramanphone-php.zip
# The storefront and admin (public/) are shared with the Node version, so both stay identical.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=php/dist/ramanphone
rm -rf php/dist && mkdir -p "$OUT"
cp -R public/. "$OUT/"
rm -f "$OUT/index.html" "$OUT/admin/index.html"
cp -R php/src/. "$OUT/"
cp public/index.html "$OUT/app/index.html"
cp public/admin/index.html "$OUT/app/admin.html"
rm -f "$OUT/config.php"
(cd php/dist && zip -qr ramanphone-php.zip ramanphone -x '*/.DS_Store')
echo "Built php/dist/ramanphone-php.zip ($(du -h php/dist/ramanphone-php.zip | cut -f1))"

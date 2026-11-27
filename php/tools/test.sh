#!/usr/bin/env bash
# Runs the API test suite (test/api.test.js) against the PHP version on a throwaway MySQL database.
#   DB_USER=root DB_PASS= bash php/tools/test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
bash php/build.sh >/dev/null
php php/tools/test-setup.php php/dist/ramanphone "${DB_NAME:-ramanphone_test}" "${DB_USER:-root}" "${DB_PASS:-}"
PORT=${PORT:-8765}
php -S 127.0.0.1:$PORT -t php/dist/ramanphone php/tools/dev-router.php >/tmp/rp-php-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
API_URL="http://127.0.0.1:$PORT/api" node --no-warnings test/api.test.js

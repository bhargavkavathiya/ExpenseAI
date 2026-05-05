#!/usr/bin/env bash
# End-to-end smoke test for the UC10 backend.
# Assumes the stack is up (docker compose up -d) and the sample receipt exists.

set -euo pipefail

BASE=${UC10_API:-http://localhost:8080}
RECEIPT=${UC10_RECEIPT:-demo-data/sample-receipts/tinyreceipt.jpg}

say() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$*"; }

say "health"
curl -fsS "$BASE/health" && echo

say "login as customer"
TOKEN=$(curl -fsS -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"customer@demo.local","password":"Customer@123"}' \
  | python -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
echo "token head: ${TOKEN:0:40}..."

say "submit receipt"
SUB=$(curl -fsS -X POST "$BASE/api/expenses" \
  -H "authorization: Bearer $TOKEN" \
  -F "receipt=@${RECEIPT};type=image/jpeg")
echo "$SUB"
REF=$(echo "$SUB" | python -c "import json,sys; print(json.load(sys.stdin)['refId'])")

say "poll decision (≤ 10 s)"
for i in 1 2 3 4 5 6 7 8 9 10; do
  R=$(curl -fsS "$BASE/api/expenses/$REF/decision" -H "authorization: Bearer $TOKEN")
  ST=$(echo "$R" | python -c "import json,sys; print(json.load(sys.stdin).get('status','?'))")
  echo "  t=$i  status=$ST"
  case "$ST" in approved|needs_review|rejected|failed) break;; esac
  sleep 1
done

say "verify audit chain (as compliance)"
COMP=$(curl -fsS -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"compliance@demo.local","password":"Compliance@123"}' \
  | python -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
curl -fsS "$BASE/api/admin/audit-logs/verify-chain" -H "authorization: Bearer $COMP" | python -m json.tool

say "dashboard (as admin)"
ADMIN=$(curl -fsS -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@demo.local","password":"Admin@123"}' \
  | python -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
curl -fsS "$BASE/api/admin/dashboard" -H "authorization: Bearer $ADMIN" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('kpis:', d['kpis']); print('integrations:', [i['name']+'='+i['health'] for i in d['integrations']])"

echo -e "\n\033[1;32mSmoke OK.\033[0m"

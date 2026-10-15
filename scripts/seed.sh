#!/usr/bin/env bash
set -euo pipefail

api="${API_URL:-http://localhost:3000/api}"

post() {
  curl -fsS -X POST "$api$1" -H 'content-type: application/json' -d "${2:-}"
}

id_of() {
  sed -E 's/.*"id":"([^"]+)".*/\1/'
}

wait_for_api() {
  for _ in $(seq 1 60); do
    curl -fsS "$api/accounts" >/dev/null 2>&1 && return
    sleep 1
  done
  echo "The API at $api did not answer." >&2
  exit 1
}

wait_for_api

ana=$(post /accounts '{"holder":"Ana Ribeiro","currency":"BRL"}' | id_of)
bruno=$(post /accounts '{"holder":"Bruno Carvalho","currency":"BRL"}' | id_of)
clara=$(post /accounts '{"holder":"Clara Nunes","currency":"BRL"}' | id_of)
post /accounts '{"holder":"Diego Alves","currency":"USD"}' >/dev/null

post "/accounts/$ana/deposits" '{"amount":2500}' >/dev/null
post "/accounts/$bruno/deposits" '{"amount":400}' >/dev/null
post "/accounts/$ana/withdrawals" '{"amount":120.5}' >/dev/null

sleep 1

post /transfers "{\"sourceAccountId\":\"$ana\",\"destinationAccountId\":\"$bruno\",\"amount\":300}" >/dev/null
post /transfers "{\"sourceAccountId\":\"$bruno\",\"destinationAccountId\":\"$ana\",\"amount\":5000}" >/dev/null
post /transfers "{\"sourceAccountId\":\"$ana\",\"destinationAccountId\":\"$clara\",\"amount\":80}" >/dev/null
post "/accounts/$clara/close" >/dev/null

echo "Seeded four accounts and three transfers: one completes, one fails, one is reversed."

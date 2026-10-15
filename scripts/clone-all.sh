#!/usr/bin/env bash
set -euo pipefail

workspace="$(cd "$(dirname "$0")/../.." && pwd)"
repositories=(
  eventbank-building-blocks
  eventbank-contracts
  eventbank-accounts
  eventbank-transfers
  eventbank-gateway
  eventbank-shell
  eventbank-mfe-accounts
  eventbank-mfe-transfers
  eventbank-mfe-operations
)

for repository in "${repositories[@]}"; do
  if [ -d "$workspace/$repository" ]; then
    echo "$repository is already there."
    continue
  fi
  git clone "https://github.com/marcelo-roman/$repository.git" "$workspace/$repository"
done

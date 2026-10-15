#!/usr/bin/env bash
set -euo pipefail

workspace="$(cd "$(dirname "$0")/../.." && pwd)"
repositories=(
  eventbank-building-blocks
  eventbank-contracts
  eventbank-accounts
  eventbank-transfers
  eventbank-identity
  eventbank-customers
  eventbank-cards
  eventbank-notifications
  eventbank-gateway
  eventbank-shell
  eventbank-mfe-accounts
  eventbank-mfe-transfers
  eventbank-mfe-operations
  eventbank-mfe-onboarding
  eventbank-mfe-cards
  eventbank-mfe-backoffice
)

for repository in "${repositories[@]}"; do
  if [ -d "$workspace/$repository" ]; then
    echo "$repository is already there."
    continue
  fi
  git clone "https://github.com/marcelo-roman/$repository.git" "$workspace/$repository"
done

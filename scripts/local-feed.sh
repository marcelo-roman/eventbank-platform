#!/usr/bin/env bash
set -euo pipefail

workspace="$(cd "$(dirname "$0")/../.." && pwd)"
feed="$workspace/.feed"
packages="${NUGET_PACKAGES:-$HOME/.nuget/packages}"

mkdir -p "$feed"
rm -f "$feed"/EventBank.*.nupkg
rm -rf "$packages"/eventbank.buildingblocks.* "$packages"/eventbank.contracts

for library in eventbank-building-blocks eventbank-contracts; do
  if [ ! -d "$workspace/$library" ]; then
    echo "Clone $library next to eventbank-platform first." >&2
    exit 1
  fi
  dotnet pack "$workspace/$library" --configuration Release --output "$feed"
done

echo "Packages are in $feed; the service repositories restore from it automatically."

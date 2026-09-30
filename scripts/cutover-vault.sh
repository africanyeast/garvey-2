#!/usr/bin/env bash
# Phase 3 cutover (artifacts/V2_SPEC.md). Stop the dev server first.
# Fresh backup -> migrate -> verify -> swap by rename. Stops at the first
# failure, before anything is renamed. Never deletes vault data.
# Usage: scripts/cutover-vault.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f vault/VERSION ] && { echo "refusing: vault/ is already v2"; exit 1; }
for port in 3000 3001; do
  if lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "refusing: something is listening on :$port (dev server?)"; exit 1; fi
done

echo "== 1. backup (Phase 1 steps)"
scripts/backup-vault.sh

echo "== 2. migrate vault/ -> vault.next/"
# --replace only ever replaces a vault.next/ this script wrote (it has VERSION).
bun scripts/migrate-vault.ts --replace

echo "== 3. verify (the Phase 2 gate, against the backup just taken)"
bun scripts/verify-migration.ts

TS=$(date +%Y%m%d%H%M%S)
echo "== 4. swap"
mv vault "vault.v1-$TS"
mv vault.next vault
mv vault.next-report.md "vault.v1-$TS.migration-report.md"
mv vault.next-report.json "vault.v1-$TS.migration-report.json"

echo
echo "OK: vault/ is now v2; the v1 tree is vault.v1-$TS/ (report beside it)."
echo "Rollback: mv vault vault.v2-rolled-back-$TS && mv vault.v1-$TS vault, then revert lib/vault."
echo "(Anything written after the swap lives only in the v2 tree.)"

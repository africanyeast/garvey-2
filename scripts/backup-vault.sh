#!/usr/bin/env bash
# Phase 1 backup (artifacts/V2_SPEC.md). Stop the dev server first.
# Manifest -> copy beside project -> archive in ~/GarveyBackups -> verify both -> read-only.
# Never deletes anything. Usage: scripts/backup-vault.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TS=$(date +%Y%m%d%H%M%S)
COPY="vault.bak-$TS"
OFF="$HOME/GarveyBackups"
MANIFEST="$OFF/manifest-$TS.sha256"
ARCHIVE="$OFF/garvey-backup-$TS.tar.gz"

[ -e "$COPY" ] && { echo "refusing: $COPY exists"; exit 1; }
for port in 3000 3001; do
  if lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "refusing: something is listening on :$port (dev server?)"; exit 1; fi
done
mkdir -p "$OFF"

# verify_dir <dir-containing-vault-and-.os> : every manifest line matches, and no extra files
verify_dir() {
  local dir=$1 bad=0 n=0
  while IFS= read -r line; do
    local want=${line%%  *} path=${line#*  }
    local got; got=$(shasum -a 256 < "$dir/$path" 2>/dev/null | cut -d' ' -f1 || true)
    [ "$got" = "$want" ] || { echo "MISMATCH: $path"; bad=$((bad+1)); }
    n=$((n+1))
  done < "$MANIFEST"
  local extra; extra=$(cd "$dir" && find vault .os -type f | wc -l | tr -d ' ')
  echo "  checked $n files, $bad mismatches, $extra files present (manifest has $(wc -l < "$MANIFEST" | tr -d ' '))"
  [ "$bad" -eq 0 ] && [ "$extra" -eq "$(wc -l < "$MANIFEST" | tr -d ' ')" ]
}

echo "1. manifest"
find vault .os -type f -print0 | sort -z | while IFS= read -r -d '' f; do
  printf '%s  %s\n' "$(shasum -a 256 < "$f" | cut -d' ' -f1)" "$f"
done > "$MANIFEST"
echo "  $(wc -l < "$MANIFEST" | tr -d ' ') files ($(find vault -type f | wc -l | tr -d ' ') vault, $(find .os -type f | wc -l | tr -d ' ') .os)"

echo "2. copy -> $COPY"
mkdir "$COPY"; cp -Rp vault "$COPY/vault"; cp -Rp .os "$COPY/.os"; cp -p "$MANIFEST" "$COPY/MANIFEST.sha256"

echo "3. archive -> $ARCHIVE"
tar -czf "$ARCHIVE" vault .os

echo "4. verify copy"; verify_dir "$COPY"
echo "5. verify archive"
TMP=$(mktemp -d); tar -xzf "$ARCHIVE" -C "$TMP"; verify_dir "$TMP"; rm -rf "$TMP"

echo "6. read-only"
chmod -R a-w "$COPY"; chmod a-w "$ARCHIVE" "$MANIFEST"
echo "OK: $COPY, $ARCHIVE, $MANIFEST"

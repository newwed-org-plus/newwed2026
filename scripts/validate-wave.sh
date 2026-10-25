#!/usr/bin/env bash
set -euo pipefail
wave="${1:?Informe a onda}"
[[ "$wave" =~ ^[0-9]+$ ]] || exit 2
mkdir -p tmp
for step in cf:types lint typecheck test test:workers test:d1:wave2 test:d1:wave3 test:d1:wave4 build test:visual; do
  log="tmp/wave-${wave}-${step//:/-}.log"
  printf '%s\n' "Validando $step"
  if ! npm run "$step" >"$log" 2>&1; then tail -65 "$log"; exit 1; fi
done
npm audit --omit=dev
node scripts/preflight-launch.mjs production
node scripts/preflight-launch.mjs staging
git diff --check
printf '%s\n' "Gate da onda $wave aprovado."

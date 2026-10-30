#!/bin/bash
# seq.sh <screen> [<screen> ...] — build screens one at a time and wait for each result (never flood the watcher).
cd "$(dirname "$0")/.."
for n in "$@"; do
  err=$(node -e "import('./scripts/compile.mjs').then(m=>m.compile('$n')).then(()=>process.exit(0)).catch(e=>{console.log(e.message.split(String.fromCharCode(10)).slice(0,3).join(' | ').slice(0,400));process.exit(1)})"); if [ $? -ne 0 ]; then echo "$n COMPILE-ERROR $err"; continue; fi
  before=$(curl -s localhost:8787/result | python3 -c "import sys,json;print((json.load(sys.stdin) or {}).get('ts',0))" 2>/dev/null || echo 0)
  curl -s -X POST localhost:8787/push/$n >/dev/null
  for i in $(seq 1 90); do
    sleep 2
    r=$(curl -s localhost:8787/result)
    if echo "$r" | python3 -c "import sys,json; r=json.load(sys.stdin) or {}; sys.exit(0 if r.get('name')=='$n' and r.get('ts',0)>$before else 1)" 2>/dev/null; then
      echo "$r" | python3 -c "
import sys,json; r=json.load(sys.stdin); res=r.get('res') or {}
w=[x for x in (res.get('warnings') or []) if 'imported' not in x]
print('$n', 'OK' if r.get('ok') else 'FAIL', res.get('roots'), w[:6], r.get('error') or '')"; break; fi
  done
done

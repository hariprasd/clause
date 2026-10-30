#!/bin/bash
# shot.sh <screen> [width=1100] — build one screen, snapshot its root through the plugin, save a PNG at /tmp/shot-<screen>.png (prints the path)
cd "$(dirname "$0")/.."
n=$1; w=${2:-1100}
out=$(scripts/seq.sh $n); echo "$out" | cut -c1-260
id=$(echo "$out" | python3 -c "import sys,re;m=re.search(r\"\\['([0-9]+:[0-9]+)'\\]\",sys.stdin.read());print(m.group(1) if m else '')")
[ -z "$id" ] && exit 1
rm -f ".clause/snaps/${id/:/-}.png"
node scripts/look.mjs snap $id $w >/dev/null 2>&1
cp ".clause/snaps/${id/:/-}.png" /tmp/shot-$n.png 2>/dev/null && echo /tmp/shot-$n.png || echo "snapshot failed for $id"

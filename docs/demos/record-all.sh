#!/bin/bash
# PingOS Demo Recording Pipeline
# Generates GIFs + MP4s from all .tape files
# Usage: ./record-all.sh [tape-number]

set -e
cd "$(dirname "$0")"

VHS="${HOME}/go/bin/vhs"
ASSETS_DIR="../assets"
RECORDINGS_DIR="../recordings"

mkdir -p "$ASSETS_DIR" "$RECORDINGS_DIR"

if [ ! -x "$VHS" ]; then
  echo "❌ VHS not found at $VHS"
  exit 1
fi

record_tape() {
  local tape="$1"
  local name=$(basename "$tape" .tape)
  echo "🎬 Recording: $name"
  echo "   Tape: $tape"
  
  # VHS generates both GIF and MP4 (defined in Output lines)
  "$VHS" "$tape" 2>&1 | tail -3
  
  # Optimize GIF if gifsicle is available
  local gif="$ASSETS_DIR/${name}.gif"
  if [ -f "$gif" ] && command -v gifsicle &>/dev/null; then
    echo "   Optimizing GIF..."
    gifsicle -O3 --lossy=80 "$gif" -o "$gif" 2>/dev/null || true
  fi
  
  local gif_size=$(du -h "$gif" 2>/dev/null | cut -f1)
  local mp4_size=$(du -h "$RECORDINGS_DIR/${name}.mp4" 2>/dev/null | cut -f1)
  echo "   ✅ GIF: $gif_size | MP4: $mp4_size"
  echo ""
}

if [ -n "$1" ]; then
  # Record specific tape
  tape=$(ls ${1}*.tape 2>/dev/null | head -1)
  if [ -z "$tape" ]; then
    echo "❌ No tape matching: $1"
    exit 1
  fi
  record_tape "$tape"
else
  # Record all tapes in order
  echo "🎬 PingOS Demo Recording Pipeline"
  echo "=================================="
  echo ""
  
  for tape in $(ls *.tape | sort); do
    record_tape "$tape"
  done
  
  echo "=================================="
  echo "📁 Assets:"
  ls -lh "$ASSETS_DIR"/*.gif 2>/dev/null
  echo ""
  echo "📁 Recordings:"  
  ls -lh "$RECORDINGS_DIR"/*.mp4 2>/dev/null
  echo ""
  echo "✅ All demos recorded!"
fi

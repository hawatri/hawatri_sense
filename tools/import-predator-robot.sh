#!/usr/bin/env bash
# HawatriSense - import your own PredatorSense robot model, by Kia Hawatri
#
# HawatriSense does not ship Acer's robot (fighter.glb). If you own an Acer laptop with
# PredatorSense installed on Windows, this copies the model from that install into
# ~/.config/hawatri-sense/ so HawatriSense Center shows it instead of the Hawatri mech.
# The model stays on your machine: never commit or share it.
#
# Usage:
#   tools/import-predator-robot.sh                 # search mounted Windows partitions
#   tools/import-predator-robot.sh /path/to/fighter.glb
set -euo pipefail

DEST_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/hawatri-sense"
DEST="$DEST_DIR/fighter.glb"
SUB="app/resources/app.asar.unpacked/dist/widgets/main/assets/robot/fighter.glb"

src="${1:-}"
if [[ -z "$src" ]]; then
  user="$(id -un)"
  for mnt in /mnt/* /media/* "/media/$user"/* "/run/media/$user"/*; do
    [[ -d "$mnt/Program Files/WindowsApps" ]] || continue
    for pkg in "$mnt/Program Files/WindowsApps"/ULICTekInc.PredatorSense*; do
      [[ -f "$pkg/$SUB" ]] && src="$pkg/$SUB"
    done
  done
fi

if [[ -z "$src" || ! -f "$src" ]]; then
  cat >&2 <<EOF
Could not find fighter.glb.
Mount your Windows partition (for example: sudo mount -o ro /dev/nvme0n1p3 /mnt/windows)
and run this again, or pass the file path:
  $0 /path/to/fighter.glb
On Windows it is inside:
  C:\\Program Files\\WindowsApps\\ULICTekInc.PredatorSenseforNotebook_*\\${SUB//\//\\}
EOF
  exit 1
fi

if [[ "$(head -c 4 "$src")" != "glTF" ]]; then
  echo "$src is not a glTF binary (.glb) file" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$src" "$DEST"
echo "Copied $src"
echo "    -> $DEST"
echo "Restart HawatriSense Center to see the PredatorSense robot (run with --no-robot to hide it)."

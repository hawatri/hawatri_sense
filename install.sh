#!/usr/bin/env bash
# HawatriSense - one-command installer, by Kia Hawatri
# Installs the hawatri_sense kernel driver (via DKMS when available), its boot service and
# permissions, and the HawatriSense Center desktop app.
#
#   sudo ./install.sh              install / update
#   sudo ./install.sh --uninstall  remove everything
#   sudo ./install.sh --no-app     driver only
set -euo pipefail

VERSION=1.0.0
NAME=hawatri-sense
MOD=hawatri_sense
APPDIR=/opt/hawatri-sense-center
ELECTRON_VERSION=37
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_USER="${SUDO_USER:-${USER:-root}}"
SYSFS=/sys/module/$MOD/drivers/platform:acer-wmi/acer-wmi

c() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Linux ] || die "HawatriSense runs on Linux only."
[ "$(id -u)" -eq 0 ] || exec sudo -E bash "$0" "$@"

# ---------------------------------------------------------------- uninstall
uninstall() {
  c "Removing HawatriSense"
  systemctl disable --now $MOD.service 2>/dev/null || true
  rm -f /etc/systemd/system/$MOD.service
  systemctl daemon-reload
  rmmod $MOD 2>/dev/null || true
  if command -v dkms >/dev/null && dkms status $NAME 2>/dev/null | grep -q $NAME; then
    dkms remove $NAME/$VERSION --all || true
  fi
  rm -rf /usr/src/$NAME-$VERSION
  find /lib/modules -name "$MOD.ko*" -delete 2>/dev/null || true
  depmod -a
  rm -f /etc/modprobe.d/blacklist-acer_wmi.conf /etc/modprobe.d/$MOD.conf /etc/modules-load.d/$MOD.conf /etc/tmpfiles.d/$MOD.conf
  rm -rf "$APPDIR" /usr/bin/hawatri-sense-center /usr/share/applications/hawatri-sense-center.desktop \
    /usr/share/icons/hicolor/scalable/apps/hawatri-sense-center.svg
  getent group $MOD >/dev/null && groupdel $MOD || true
  modprobe acer_wmi 2>/dev/null || true
  c "HawatriSense removed. The stock acer_wmi driver is back."
}

WITH_APP=1
case "${1:-}" in
  --uninstall) uninstall; exit 0 ;;
  --no-app) WITH_APP=0 ;;
  ""|--install) ;;
  *) die "Unknown option: $1 (use --uninstall or --no-app)" ;;
esac

# ---------------------------------------------------------------- checks
vendor="$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || true)"
product="$(cat /sys/class/dmi/id/product_name 2>/dev/null || true)"
c "HawatriSense $VERSION installer - $product ($vendor)"
if [[ "$vendor" != *Acer* ]]; then
  warn "This does not look like an Acer laptop. The driver targets Acer Predator / Nitro models."
  read -rp "Continue anyway? [y/N] " a; [[ "$a" =~ ^[Yy] ]] || exit 1
fi
if command -v mokutil >/dev/null && mokutil --sb-state 2>/dev/null | grep -qi enabled; then
  warn "Secure Boot is ON. Unsigned kernel modules will not load."
  warn "DKMS on Ubuntu/Fedora can sign it with a MOK key (you'll be asked to enroll it on reboot),"
  warn "otherwise disable Secure Boot in the BIOS."
fi

# ---------------------------------------------------------------- dependencies
KREL="$(uname -r)"
if command -v pacman >/dev/null; then
  pkgbase="$(cat /usr/lib/modules/$KREL/pkgbase 2>/dev/null || echo linux)"
  pkgs=(base-devel dkms "$pkgbase-headers")
  [ $WITH_APP = 1 ] && pkgs+=(electron)
  c "Installing packages (pacman): ${pkgs[*]}"
  pacman -S --needed --noconfirm "${pkgs[@]}"
elif command -v apt-get >/dev/null; then
  pkgs=(build-essential dkms "linux-headers-$KREL")
  [ $WITH_APP = 1 ] && pkgs+=(nodejs npm)
  c "Installing packages (apt): ${pkgs[*]}"
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y "${pkgs[@]}"
elif command -v dnf >/dev/null; then
  pkgs=(gcc make dkms "kernel-devel-$KREL")
  [ $WITH_APP = 1 ] && pkgs+=(nodejs npm)
  c "Installing packages (dnf): ${pkgs[*]}"
  dnf install -y "${pkgs[@]}"
elif command -v zypper >/dev/null; then
  pkgs=(gcc make dkms kernel-default-devel)
  [ $WITH_APP = 1 ] && pkgs+=(nodejs npm)
  c "Installing packages (zypper): ${pkgs[*]}"
  zypper --non-interactive install "${pkgs[@]}"
else
  warn "Unknown package manager: make sure gcc, make, kernel headers for $KREL$([ $WITH_APP = 1 ] && echo ', nodejs and npm') are installed."
fi
[ -d "/lib/modules/$KREL/build" ] || die "Kernel headers for $KREL are missing (no /lib/modules/$KREL/build). Install them and re-run."

# ---------------------------------------------------------------- driver
c "Building and installing the $MOD driver"
rmmod $MOD 2>/dev/null || true
if command -v dkms >/dev/null; then
  dkms status $NAME 2>/dev/null | grep -q "$NAME/$VERSION" && dkms remove $NAME/$VERSION --all >/dev/null || true
  rm -rf /usr/src/$NAME-$VERSION
  install -d /usr/src/$NAME-$VERSION/src
  install -m644 "$REPO/src/$MOD.c" /usr/src/$NAME-$VERSION/src/
  install -m644 "$REPO/Makefile" /usr/src/$NAME-$VERSION/
  sed "s/#MODULE_VERSION#/$VERSION/" "$REPO/packaging/dkms.conf" > /usr/src/$NAME-$VERSION/dkms.conf
  dkms add $NAME/$VERSION
  dkms build $NAME/$VERSION
  dkms install $NAME/$VERSION --force
  c "Driver registered with DKMS: it rebuilds itself on kernel updates."
else
  make -C "/lib/modules/$KREL/build" M="$REPO" modules
  install -Dm644 "$REPO/src/$MOD.ko" "/lib/modules/$KREL/kernel/drivers/platform/x86/$MOD.ko"
  make -C "/lib/modules/$KREL/build" M="$REPO" clean >/dev/null
  depmod -a
  warn "Installed without DKMS: re-run this script after every kernel update."
fi

echo "blacklist acer_wmi" > /etc/modprobe.d/blacklist-acer_wmi.conf
echo "$MOD" > /etc/modules-load.d/$MOD.conf

# group-writable controls for the hawatri_sense group (applied by the service at every boot)
getent group $MOD >/dev/null || groupadd --system $MOD
if [ "$REAL_USER" != root ]; then usermod -aG $MOD "$REAL_USER"; fi
{
  for d in predator_sense nitro_sense; do
    for f in fan_speed battery_limiter battery_calibration usb_charging backlight_timeout boot_animation_sound lcd_override; do
      echo "z $SYSFS/$d/$f 0660 root $MOD"
    done
  done
  echo "z $SYSFS/four_zoned_kb/four_zone_mode 0660 root $MOD"
  echo "z $SYSFS/four_zoned_kb/per_zone_mode 0660 root $MOD"
  echo "z /sys/firmware/acpi/platform_profile 0660 root $MOD"
} > /etc/tmpfiles.d/$MOD.conf

install -m644 "$REPO/$MOD.service" /etc/systemd/system/$MOD.service
systemctl daemon-reload
rmmod acer_wmi 2>/dev/null || true
systemctl enable $MOD.service >/dev/null
systemctl restart $MOD.service || warn "The driver did not load yet - see: sudo dmesg | grep -i hawatri"
if [ -d "$SYSFS" ]; then
  c "Driver loaded: $(ls "$SYSFS" | grep -E 'predator_sense|nitro_sense' || echo 'controls available')"
fi

# ---------------------------------------------------------------- app
if [ $WITH_APP = 1 ]; then
  c "Installing HawatriSense Center to $APPDIR"
  rm -rf "$APPDIR"
  install -d "$APPDIR/assets"
  install -m644 "$REPO/app/package.json" "$REPO/app/main.js" "$REPO/app/preload.js" "$APPDIR/"
  cp -r "$REPO/app/renderer" "$APPDIR/"
  install -m644 "$REPO"/app/assets/* "$APPDIR/assets/"

  if command -v electron >/dev/null; then
    ELECTRON="$(command -v electron)"
  else
    command -v npm >/dev/null || die "npm is required to download Electron. Install nodejs + npm and re-run."
    c "Downloading Electron $ELECTRON_VERSION (no distro package found)"
    install -d "$APPDIR/runtime"
    npm install --prefix "$APPDIR/runtime" --no-audit --no-fund "electron@$ELECTRON_VERSION" >/dev/null
    # npm 11 may skip Electron's download script, so run it explicitly
    (cd "$APPDIR/runtime/node_modules/electron" && node install.js)
    ELECTRON="$APPDIR/runtime/node_modules/electron/dist/electron"
    chown root:root "$APPDIR/runtime/node_modules/electron/dist/chrome-sandbox"
    chmod 4755 "$APPDIR/runtime/node_modules/electron/dist/chrome-sandbox"
  fi
  cat > /usr/bin/hawatri-sense-center <<EOF
#!/bin/sh
# HawatriSense Center launcher - by Kia Hawatri
exec "$ELECTRON" --ozone-platform-hint=auto "$APPDIR" "\$@"
EOF
  chmod 755 /usr/bin/hawatri-sense-center
  install -Dm644 "$REPO/app/hawatri-sense-center.desktop" /usr/share/applications/hawatri-sense-center.desktop
  install -Dm644 "$REPO/app/assets/icon.svg" /usr/share/icons/hicolor/scalable/apps/hawatri-sense-center.svg
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q /usr/share/icons/hicolor 2>/dev/null || true
  command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi

echo
c "Done! HawatriSense is installed."
[ "$REAL_USER" != root ] && echo "   - Log out and back in once so '$REAL_USER' gets the $MOD group."
[ $WITH_APP = 1 ] && echo "   - Open 'HawatriSense Center' from your app menu, or run: hawatri-sense-center"
echo "   - Remove everything with: sudo ./install.sh --uninstall"

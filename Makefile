obj-m := src/hawatri_sense.o

KVER  ?= $(shell uname -r)
KDIR  := /lib/modules/$(KVER)/build
PWD   := $(shell pwd)

MDIR  := /lib/modules/$(KVER)/kernel/drivers/platform/x86
MODNAME := hawatri_sense
REAL_USER := $(shell echo $${SUDO_USER:-$$(whoami)})
APPDIR := /opt/hawatri-sense-center

.PHONY: all clean install uninstall install-app uninstall-app

all:
	$(MAKE) -C $(KDIR) M=$(PWD) modules

clean:
	$(MAKE) -C $(KDIR) M=$(PWD) clean

uninstall:
	@sudo rm -f /etc/modules-load.d/$(MODNAME).conf
	@sudo rm -f /etc/modprobe.d/blacklist-acer_wmi.conf
	@sudo systemctl stop hawatri_sense.service
	@sudo systemctl disable hawatri_sense.service
	@sudo rm -f /etc/systemd/system/hawatri_sense.service
	@sudo systemctl daemon-reload
	@sudo rmmod $(MODNAME) 2>/dev/null || true
	@sudo modprobe acer_wmi
	@echo "Removing current user from hawatri_sense group if exists..."
	@if getent group hawatri_sense >/dev/null; then \
		sudo gpasswd -d $(REAL_USER) hawatri_sense || true; \
		sudo groupdel hawatri_sense || true; \
	else \
		echo "Group hawatri_sense does not exist."; \
	fi
	@sudo rm -f /etc/tmpfiles.d/$(MODNAME).conf
	@sudo rm -f $(MDIR)/$(MODNAME).ko
	@sudo depmod -a
	@echo "Uninstalled $(MODNAME) and cleaned up related configuration."

install: all
	@sudo rmmod acer_wmi 2>/dev/null || true
	@echo "blacklist acer_wmi" | sudo tee /etc/modprobe.d/blacklist-acer_wmi.conf > /dev/null
	sudo install -d $(MDIR)
	sudo install -m 644 src/$(MODNAME).ko $(MDIR)
	sudo depmod -a
	@echo "$(MODNAME)" | sudo tee /etc/modules-load.d/$(MODNAME).conf > /dev/null
	sudo modprobe $(MODNAME)
	@sleep 2
	@sudo cp hawatri_sense.service /etc/systemd/system/
	@sudo systemctl daemon-reload
	@sudo systemctl enable hawatri_sense.service
	@sudo systemctl start hawatri_sense.service
	@echo "Setting up group and permissions..."
	@echo "Detected user: $(REAL_USER)"
	@if ! getent group hawatri_sense >/dev/null; then \
		sudo groupadd hawatri_sense; \
	fi; 
	sudo usermod -aG hawatri_sense $(REAL_USER)
	@echo "Setting permissions via tmpfiles..."
	@model_path=$$(ls /sys/module/$(MODNAME)/drivers/platform:acer-wmi/acer-wmi/ | grep -E 'predator_sense|nitro_sense' || true); \
	if [ -n "$$model_path" ]; then \
		echo "Detected model directory: $$model_path"; \
		conf_file="/etc/tmpfiles.d/$(MODNAME).conf"; \
		[ -f $$conf_file ] || sudo touch $$conf_file; \
		if echo "$$model_path" | grep -q "nitro_sense"; then \
			supported_fields="fan_speed battery_limiter battery_calibration usb_charging"; \
		else \
			supported_fields="backlight_timeout battery_calibration battery_limiter boot_animation_sound fan_speed lcd_override usb_charging"; \
		fi; \
		for f in $$supported_fields; do \
			entry="f /sys/module/$(MODNAME)/drivers/platform:acer-wmi/acer-wmi/$$model_path/$$f 0660 root $(MODNAME)"; \
			grep -qxF "$$entry" $$conf_file || echo "$$entry" | sudo tee -a $$conf_file > /dev/null; \
		done; \
		kb_base="/sys/module/$(MODNAME)/drivers/platform:acer-wmi/acer-wmi/four_zoned_kb"; \
		if [ -d "$$kb_base" ]; then \
			for z in four_zone_mode per_zone_mode; do \
				entry="f $$kb_base/$$z 0660 root $(MODNAME)"; \
				grep -qxF "$$entry" $$conf_file || echo "$$entry" | sudo tee -a $$conf_file > /dev/null; \
			done; \
		fi; \
		entry="f /sys/firmware/acpi/platform_profile 0660 root $(MODNAME)"; \
		grep -qxF "$$entry" $$conf_file || echo "$$entry" | sudo tee -a $$conf_file > /dev/null; \
		sudo systemd-tmpfiles --create $$conf_file; \
	else \
		echo "Warning: Could not detect predator_sense or nitro_sense in sysfs."; \
	fi
	@echo "Module $(MODNAME) installed and configured to load at boot."

install-app:
	@command -v electron >/dev/null || { echo "electron not found - install it first: sudo pacman -S electron"; exit 1; }
	sudo rm -rf $(APPDIR)
	sudo install -d $(APPDIR)/assets
	sudo install -m 644 app/package.json app/main.js app/preload.js $(APPDIR)/
	sudo cp -r app/renderer $(APPDIR)/
	sudo install -m 644 app/assets/* $(APPDIR)/assets/
	sudo install -m 755 app/hawatri-sense-center.sh /usr/bin/hawatri-sense-center
	sudo install -m 644 app/hawatri-sense-center.desktop /usr/share/applications/hawatri-sense-center.desktop
	sudo install -m 644 app/assets/icon.svg /usr/share/icons/hicolor/scalable/apps/hawatri-sense-center.svg
	@echo "HawatriSense Center installed. Launch it from your app menu or run: hawatri-sense-center"

uninstall-app:
	sudo rm -rf $(APPDIR)
	sudo rm -f /usr/bin/hawatri-sense-center /usr/share/applications/hawatri-sense-center.desktop
	sudo rm -f /usr/share/icons/hicolor/scalable/apps/hawatri-sense-center.svg
	@echo "HawatriSense Center removed."


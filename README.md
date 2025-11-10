# HawatriSense

A Linux kernel module that enhances hardware control for Acer Predator and Nitro series laptops, providing access to features not fully supported by the standard `acer_wmi` driver.

## Overview

HawatriSense is designed as a replacement for the `acer_wmi` kernel module on specific Acer gaming laptops. It exposes additional hardware controls through sysfs interfaces, allowing users to fine-tune their laptop's performance and power management features from userspace.

This module is particularly useful for Predator and Nitro series laptops that have advanced thermal management, RGB keyboard lighting, and other gaming-specific features that aren't fully accessible through the standard Linux kernel drivers.

## Features

- Fan speed control (CPU and GPU)
- Battery charge limiting (80% mode)
- Battery calibration mode
- USB charging control
- Keyboard backlight customization
- Thermal profile management
- Boot animation/sound control
- LCD override functionality
- Backlight timeout settings

## Supported Models

The module has specific support for:

- Acer Predator series (PH315-53, PHN16-71, PHN16-72, PH16-71, PH18-71)
- Acer Nitro series (AN16-41, ANV16-41, AN16-43, AN515-58, ANV15-41, ANV15-51, AN515-55)

## Installation

### Prerequisites

- Linux kernel headers for your running kernel
- make
- sudo privileges

### Building and Installing

```bash
# Clone the repository
git clone https://github.com/yourusername/HawatriSense.git
cd HawatriSense

# Build the module
make

# Install the module (this will remove acer_wmi and install hawatri_sense)
sudo make install
```

### Uninstalling

```bash
# Remove the module and restore acer_wmi
sudo make uninstall
```

## Usage

After installation, the module creates sysfs entries under:
```
/sys/module/hawatri_sense/drivers/platform:acer-wmi/
```

### Fan Control

Control CPU and GPU fan speeds (0-100%):
```bash
# Read current fan speeds
cat /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/fan_speed

# Set CPU fan to 70% and GPU fan to 80%
echo "70,80" | sudo tee /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/fan_speed
```

### Battery Management

Enable/disable battery charge limiting (80% mode):
```bash
# Check current status
cat /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/battery_limiter

# Enable 80% charge limit
echo 1 | sudo tee /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/battery_limiter

# Disable 80% charge limit
echo 0 | sudo tee /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/battery_limiter
```

### Keyboard Backlight (Predator models)

For per-zone RGB control:
```bash
# Read current per-zone settings
cat /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/four_zoned_kb/per_zone_mode

# Set different colors for each zone (RRGGBB format)
echo "FF0000,00FF00,0000FF,FFFFFF,50" | sudo tee /sys/module/hawatri_sense/drivers/platform:acer-wmi/*/four_zoned_kb/per_zone_mode
```

### Thermal Profiles

Switch between thermal profiles:
```bash
# Check available profiles
cat /sys/firmware/acpi/platform_profile_choices

# Set performance mode
echo "performance" | sudo tee /sys/firmware/acpi/platform_profile
```

## Sysfs Interface

The module exposes the following attributes:

| Attribute | Description | Values |
|-----------|-------------|--------|
| `fan_speed` | CPU and GPU fan speeds | "CPU,GPU" (0-100%) |
| `battery_limiter` | Charge limiting mode | 0 (disabled), 1 (enabled) |
| `battery_calibration` | Battery calibration mode | 0 (disabled), 1 (enabled) |
| `usb_charging` | USB charging when off | 0, 10, 20, 30 (mA) |
| `lcd_override` | LCD override mode | 0 (disabled), 1 (enabled) |
| `backlight_timeout` | Backlight timeout | 0 (disabled), 1 (enabled) |
| `boot_animation_sound` | Boot animation sound | 0 (disabled), 1 (enabled) |

For RGB keyboards:
- `four_zoned_kb/four_zone_mode`: Mode,speed,brightness,direction,R,G,B
- `four_zoned_kb/per_zone_mode`: Zone1,Zone2,Zone3,Zone4,brightness (RRGGBB format)

## Troubleshooting

### Module Loading Issues

If the module fails to load:
1. Ensure you have the correct kernel headers installed
2. Check that `acer_wmi` is properly blacklisted:
   ```bash
   lsmod | grep acer_wmi  # Should return no results
   ```

### Permissions

All sysfs attributes require root privileges to modify. Users can be added to the `hawatri_sense` group for access:
```bash
sudo usermod -aG hawatri_sense $USER
```

Note: You'll need to log out and back in for group changes to take effect.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Based on the original `acer-wmi` kernel module
- Inspired by PredatorSense and NitroSense community projects
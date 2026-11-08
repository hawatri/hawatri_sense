// HawatriSense Center - by Kia Hawatri
// Electron main process: talks to the hawatri_sense kernel module through sysfs.

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const MODULE_BASE = '/sys/module/hawatri_sense/drivers/platform:acer-wmi/acer-wmi';
const PROFILE = '/sys/firmware/acpi/platform_profile';
const PROFILE_CHOICES = '/sys/firmware/acpi/platform_profile_choices';

const DEMO = process.argv.includes('--demo') || process.platform !== 'linux' || !fs.existsSync(MODULE_BASE);

// ---------- helpers ----------
const readText = (p) => {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
};
const readNum = (p) => {
  const v = readText(p);
  return v === null || v === '' ? null : Number(v);
};

function findSenseDir() {
  for (const d of ['predator_sense', 'nitro_sense']) {
    const p = path.join(MODULE_BASE, d);
    if (fs.existsSync(p)) return { dir: p, family: d };
  }
  return { dir: null, family: null };
}

function findHwmon(name) {
  try {
    for (const h of fs.readdirSync('/sys/class/hwmon')) {
      const p = path.join('/sys/class/hwmon', h);
      if (readText(path.join(p, 'name')) === name) return p;
    }
  } catch {}
  return null;
}

// Only these files may ever be written, and only with values matching the pattern.
function writableTargets() {
  const { dir } = findSenseDir();
  const kb = path.join(MODULE_BASE, 'four_zoned_kb');
  const t = {
    platform_profile: [PROFILE, /^(low-power|quiet|balanced|balanced-performance|performance)$/],
    four_zone_mode: [path.join(kb, 'four_zone_mode'), /^[0-7],[0-9],\d{1,3},[0-2],\d{1,3},\d{1,3},\d{1,3}$/],
    per_zone_mode: [path.join(kb, 'per_zone_mode'), /^([0-9a-fA-F]{6},){4}\d{1,3}$/],
  };
  if (dir) {
    t.fan_speed = [path.join(dir, 'fan_speed'), /^\d{1,3},\d{1,3}$/];
    for (const k of ['battery_limiter', 'battery_calibration', 'lcd_override', 'backlight_timeout', 'boot_animation_sound'])
      t[k] = [path.join(dir, k), /^[01]$/];
    t.usb_charging = [path.join(dir, 'usb_charging'), /^(0|10|20|30)$/];
  }
  return t;
}

function writeSysfs(file, value) {
  return new Promise((resolve) => {
    fs.writeFile(file, value, (err) => {
      if (!err) return resolve({ ok: true });
      if (err.code !== 'EACCES' && err.code !== 'EPERM') return resolve({ ok: false, error: err.message });
      // Not in the hawatri_sense group yet: ask for elevation through polkit.
      const p = spawn('pkexec', ['tee', file], { stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      p.stderr.on('data', (d) => (stderr += d));
      p.on('error', (e) => resolve({ ok: false, error: e.message }));
      p.on('close', (code) => resolve(code === 0 ? { ok: true, elevated: true } : { ok: false, error: stderr.trim() || 'Permission denied' }));
      p.stdin.end(value);
    });
  });
}

// ---------- live stats ----------
let lastCpu = null;
function cpuUsage() {
  const line = readText('/proc/stat')?.split('\n')[0];
  if (!line) return null;
  const n = line.split(/\s+/).slice(1).map(Number);
  const idle = n[3] + (n[4] || 0);
  const total = n.reduce((a, b) => a + b, 0);
  let pct = null;
  if (lastCpu) {
    const dt = total - lastCpu.total;
    pct = dt > 0 ? Math.round(100 * (1 - (idle - lastCpu.idle) / dt)) : 0;
  }
  lastCpu = { idle, total };
  return pct;
}

function memUsage() {
  const m = readText('/proc/meminfo');
  if (!m) return null;
  const get = (k) => Number((m.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')) || [])[1]);
  const total = get('MemTotal');
  return Math.round(100 * (1 - get('MemAvailable') / total));
}

let gpuCache = { temp: null, usage: null, name: null, freq: null };
function pollGpu() {
  execFile('nvidia-smi', ['--query-gpu=temperature.gpu,utilization.gpu,name,clocks.gr', '--format=csv,noheader,nounits'], { timeout: 2500 }, (err, out) => {
    if (err) return;
    const [temp, usage, name, freq] = out.trim().split('\n')[0].split(',').map((s) => s.trim());
    gpuCache = { temp: Number(temp), usage: Number(usage), name, freq: Number(freq) };
  });
}

function cpuFreq() {
  try {
    const cpus = fs.readdirSync('/sys/devices/system/cpu').filter((d) => /^cpu\d+$/.test(d));
    const f = cpus.map((c) => readNum(`/sys/devices/system/cpu/${c}/cpufreq/scaling_cur_freq`)).filter((v) => v);
    return f.length ? Math.round(Math.max(...f) / 1000) : null;
  } catch { return null; }
}

function cpuName() {
  const m = (readText('/proc/cpuinfo') || '').match(/^model name\s*:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function ramGB() {
  const m = readText('/proc/meminfo');
  if (!m) return null;
  const get = (k) => Number((m.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')) || [])[1]);
  return Math.round(((get('MemTotal') - get('MemAvailable')) / 1048576) * 10) / 10;
}

let lastNet = null;
function netRates() {
  const txt = readText('/proc/net/dev');
  if (!txt) return null;
  const sum = { eth: [0, 0], wifi: [0, 0] };
  for (const line of txt.split('\n').slice(2)) {
    const [iface, rest] = line.split(':');
    if (!rest) continue;
    const n = rest.trim().split(/\s+/).map(Number);
    const kind = /^(wl|wlan)/.test(iface.trim()) ? 'wifi' : /^(en|eth)/.test(iface.trim()) ? 'eth' : null;
    if (kind) { sum[kind][0] += n[0]; sum[kind][1] += n[8]; }
  }
  const now = Date.now();
  let out = null;
  if (lastNet) {
    const dt = (now - lastNet.t) / 1000;
    const kbps = (a, b) => Math.max(0, Math.round(((a - b) * 8) / 1000 / dt * 10) / 10);
    out = {
      eth: { down: kbps(sum.eth[0], lastNet.eth[0]), up: kbps(sum.eth[1], lastNet.eth[1]) },
      wifi: { down: kbps(sum.wifi[0], lastNet.wifi[0]), up: kbps(sum.wifi[1], lastNet.wifi[1]) },
    };
  }
  lastNet = { t: now, ...sum };
  return out;
}

function battery() {
  try {
    const bat = fs.readdirSync('/sys/class/power_supply').find((d) => d.startsWith('BAT'));
    const ac = fs.readdirSync('/sys/class/power_supply').find((d) => /^(AC|ADP|ACAD)/.test(d));
    return {
      level: bat ? readNum(`/sys/class/power_supply/${bat}/capacity`) : null,
      status: bat ? readText(`/sys/class/power_supply/${bat}/status`) : null,
      ac: ac ? readNum(`/sys/class/power_supply/${ac}/online`) === 1 : null,
    };
  } catch { return { level: null, status: null, ac: null }; }
}

function realStats() {
  const acer = findHwmon('acer');
  const core = findHwmon('coretemp');
  const cpuTemp = core ? readNum(path.join(core, 'temp1_input')) : acer ? readNum(path.join(acer, 'temp1_input')) : null;
  return {
    cpu: { temp: cpuTemp !== null ? Math.round(cpuTemp / 1000) : null, usage: cpuUsage(), freq: cpuFreq(), name: cpuName() },
    gpu: {
      temp: gpuCache.temp ?? (acer ? Math.round((readNum(path.join(acer, 'temp2_input')) || 0) / 1000) || null : null),
      usage: gpuCache.usage,
      name: gpuCache.name,
      freq: gpuCache.freq,
    },
    ram: ramGB(),
    net: netRates(),
    sys: { temp: acer ? Math.round((readNum(path.join(acer, 'temp3_input')) || 0) / 1000) || null : null },
    fans: {
      cpu: acer ? readNum(path.join(acer, 'fan1_input')) : null,
      gpu: acer ? readNum(path.join(acer, 'fan2_input')) : null,
    },
    mem: memUsage(),
    battery: battery(),
  };
}

// ---------- demo backend (Windows / no driver) ----------
const demoState = {
  platform_profile: 'balanced',
  fan_speed: '0,0',
  battery_limiter: '1', battery_calibration: '0', usb_charging: '0',
  lcd_override: '0', backlight_timeout: '1', boot_animation_sound: '1',
  four_zone_mode: '3,4,80,1,0,0,0',
  per_zone_mode: '00E5FF,7C4DFF,FF2E88,FFB300,80',
};
let demoT = 0;
function demoStats() {
  demoT += 1;
  const load = { 'low-power': 0.2, quiet: 0.3, balanced: 0.5, 'balanced-performance': 0.7, performance: 0.9 }[demoState.platform_profile];
  const w = (a, f) => a * Math.sin(demoT / f);
  const [fc, fg] = demoState.fan_speed.split(',').map(Number);
  const rpm = (manual, base) => Math.round(manual ? 1200 + manual * 52 : base + 2600 * load + w(180, 4));
  return {
    cpu: { temp: Math.round(48 + 35 * load + w(4, 5)), usage: Math.round(18 + 60 * load + w(12, 3)), freq: Math.round(2200 + 2400 * load + w(150, 3)), name: '13th Gen Intel(R) Core(TM) i7-13700HX' },
    gpu: { temp: Math.round(44 + 30 * load + w(3, 7)), usage: Math.round(10 + 70 * load + w(15, 4)), name: 'NVIDIA GeForce RTX 4060 Laptop GPU', freq: Math.round(1500 + 1300 * load + w(60, 4)) },
    sys: { temp: Math.round(40 + 12 * load) },
    fans: { cpu: rpm(fc, 1900), gpu: rpm(fg, 1800) },
    mem: Math.round(41 + w(3, 9)),
    ram: Math.round((6.6 + w(0.3, 9)) * 10) / 10,
    net: { eth: { down: 0, up: 0 }, wifi: { down: Math.round(120 + w(110, 2)), up: Math.round(18 + w(15, 3)) } },
    battery: { level: 87, status: 'Charging', ac: true },
  };
}

// ---------- IPC ----------
ipcMain.handle('info', () => {
  const { family } = findSenseDir();
  const choices = DEMO ? 'low-power quiet balanced balanced-performance performance' : readText(PROFILE_CHOICES) || '';
  return {
    demo: DEMO,
    family: DEMO ? 'predator_sense' : family,
    hasKeyboard: DEMO || fs.existsSync(path.join(MODULE_BASE, 'four_zoned_kb')),
    profiles: choices.split(/\s+/).filter(Boolean),
    host: DEMO ? 'Predator Helios Neo 16' : (readText('/sys/class/dmi/id/product_name') || 'Acer laptop'),
    version: app.getVersion(),
  };
});

ipcMain.handle('read-settings', () => {
  if (DEMO) return { ...demoState };
  const out = {};
  for (const [k, [file]] of Object.entries(writableTargets())) out[k] = readText(file);
  return out;
});

ipcMain.handle('write', async (_e, key, value) => {
  value = String(value).trim();
  if (DEMO) {
    if (!(key in demoState)) return { ok: false, error: 'Unknown setting' };
    demoState[key] = value;
    return { ok: true, demo: true };
  }
  const target = writableTargets()[key];
  if (!target) return { ok: false, error: `${key} is not supported on this laptop` };
  if (!target[1].test(value)) return { ok: false, error: `Invalid value for ${key}` };
  return writeSysfs(target[0], value);
});

ipcMain.handle('stats', () => (DEMO ? demoStats() : realStats()));

// 3D model + pose data for the renderer (only files directly inside assets/).
ipcMain.handle('asset', (_e, name) => {
  if (!/^[\w.-]+\.(glb|json)$/.test(name)) return null;
  try { return fs.readFileSync(path.join(__dirname, 'assets', name)); } catch { return null; }
});

// ---------- optional user-supplied PredatorSense robot ----------
// HawatriSense never ships Acer's robot model. If the user has their own copy of fighter.glb
// (from a PredatorSense install they own), the app shows it instead of the Hawatri mech.
// Looked up in: $HAWATRI_ROBOT, ~/.config/hawatri-sense/fighter.glb, then a PredatorSense
// install on this PC (Windows) or on a mounted Windows partition (Linux dual boot).
const os = require('os');
const ROBOT_SUBPATH = ['app', 'resources', 'app.asar.unpacked', 'dist', 'widgets', 'main', 'assets', 'robot', 'fighter.glb'];
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const listDirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)); } catch { return []; } };

function predatorInstalls(programFiles) {
  const apps = path.join(programFiles, 'WindowsApps');
  return listDirs(apps)
    .filter((d) => /^ULICTekInc\.PredatorSense/i.test(path.basename(d)))
    .sort().reverse() // newest version first
    .map((d) => path.join(d, ...ROBOT_SUBPATH));
}

function findRobot() {
  const candidates = [];
  if (process.env.HAWATRI_ROBOT) candidates.push(process.env.HAWATRI_ROBOT);
  candidates.push(path.join(os.homedir(), '.config', 'hawatri-sense', 'fighter.glb'));
  if (process.platform === 'win32') {
    // WindowsApps can't be listed, but the package's own folder can be read once we know it
    try {
      const out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command',
        "Get-AppxPackage -Name 'ULICTekInc.PredatorSense*' | Sort-Object Version -Descending | ForEach-Object { $_.InstallLocation }"],
      { encoding: 'utf8', timeout: 8000, windowsHide: true });
      for (const dir of out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) candidates.push(path.join(dir, ...ROBOT_SUBPATH));
    } catch {}
  } else {
    const user = os.userInfo().username;
    const mounts = ['/mnt', '/media', `/media/${user}`, `/run/media/${user}`].flatMap(listDirs);
    for (const m of mounts) candidates.push(...predatorInstalls(path.join(m, 'Program Files')));
  }
  return candidates.find(isFile) || null;
}

ipcMain.handle('robot', () => {
  if (process.argv.includes('--no-robot')) return null;
  const p = findRobot();
  if (!p) return null;
  try { return { path: p, data: fs.readFileSync(p) }; } catch { return null; }
});

ipcMain.on('window', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (action === 'min') w.minimize();
  else if (action === 'max') (w.isMaximized() ? w.unmaximize() : w.maximize());
  else if (action === 'close') w.close();
});

// ---------- window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 1080,
    minHeight: 680,
    frame: false,
    backgroundColor: '#05070a',
    title: 'HawatriSense Center',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.setName('HawatriSense Center');
app.whenReady().then(() => {
  if (!DEMO) { pollGpu(); setInterval(pollGpu, 2000); cpuUsage(); }
  createWindow();
});
app.on('window-all-closed', () => app.quit());

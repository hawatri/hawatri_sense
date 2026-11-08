// HawatriSense - by Kia Hawatri
import { createMech } from './mech.js';
import { paintBackdrop } from './backdrop.js';
paintBackdrop(document.getElementById('backdrop-canvas'));

const api = window.hawatri;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? '--' : v);

const MODES = [
  { id: 'low-power', name: 'Eco', intro: 'Lowest power draw and coolest temperatures for long battery sessions.',
    icon: '<path d="M14 42C14 22 28 10 46 10c0 20-12 32-30 32"/><path d="M12 46 32 26"/>' },
  { id: 'quiet', name: 'Quiet', intro: 'Keeps fan noise to a minimum. Ideal for study, calls and late nights.',
    icon: '<rect x="6" y="10" width="44" height="36" rx="10"/><path d="M32 18a10 10 0 1 0 6 18 12 12 0 0 1-6-18z"/><path d="M40 16l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z"/>' },
  { id: 'balanced', name: 'Balanced', intro: 'Recommended for standard, everyday use.',
    icon: '<path d="M6 12h44L28 44z"/><path d="M14 18h28L28 36z"/><path d="M22 24h12l-6 8z"/>' },
  { id: 'balanced-performance', name: 'Performance', intro: 'Higher power limits for gaming and creative work. Plug in the charger.',
    icon: '<path d="M10 40a20 20 0 1 1 36 0"/><path d="M28 40 40 20"/><circle cx="28" cy="40" r="3"/><path d="M4 30h8M6 22h7M10 15l5 4"/>' },
  { id: 'performance', name: 'Turbo', intro: 'Maximum performance with the most aggressive fan curve. Plug in the charger.',
    icon: '<circle cx="30" cy="28" r="16"/><circle cx="30" cy="28" r="4"/><path d="M30 24c0-6 4-10 8-10M34 28c6 0 10 4 10 8M30 32c0 6-4 10-8 10M26 28c-6 0-10-4-10-8"/><path d="M2 22h10M4 30h8M2 38h10"/>' },
];
const FAN_MODES = [
  { id: 'auto', name: 'Auto', icon: '<g>' + swirlPaths(28, 28, 22, 10, 1.2) + '</g><text x="28" y="34" text-anchor="middle" font-size="16" fill="currentColor" stroke="none" font-weight="700">A</text>' },
  { id: 'max', name: 'Max', icon: '<g>' + swirlPaths(28, 28, 24, 16, 1.6) + '</g>' },
  { id: 'custom', name: 'Custom', icon: '<g>' + swirlPaths(28, 28, 22, 10, 1.2) + '</g><path d="M30 26l12 12M40 40l4 4" stroke-width="4"/>' },
];
const EFFECTS = [
  { id: 0, name: 'Static', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M10 13h12v6H10z"/>' },
  { id: 1, name: 'Breathing', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M9 18c3-6 11-6 14 0"/>' },
  { id: 2, name: 'Neon', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M11 21V11l10 10V11"/>' },
  { id: 3, name: 'Wave', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M7 18c3-4 6-4 9 0s6 4 9 0"/>' },
  { id: 4, name: 'Shifting', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M9 16h12M17 12l4 4-4 4"/>' },
  { id: 5, name: 'Zoom', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><circle cx="16" cy="16" r="3"/><circle cx="16" cy="16" r="7"/>' },
  { id: 6, name: 'Meteor', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M9 10l9 9"/><circle cx="20" cy="21" r="2"/>' },
  { id: 7, name: 'Twinkling', icon: '<path d="M16 3 28 10v12L16 29 4 22V10z"/><path d="M16 9v4M16 19v4M9 16h4M19 16h4"/>' },
];
const PROFILES = {
  'Daily Use':     { mode: 'balanced', fan: 'auto', effect: 3 },
  Gaming:          { mode: 'performance', fan: 'max', effect: 2 },
  'Quiet Night':   { mode: 'quiet', fan: 'auto', effect: 1 },
  'Battery Saver': { mode: 'low-power', fan: 'auto', effect: 0 },
};
const DOTS = ['#1a9cff', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#ffffff'];

const store = {
  get(k, d) { try { const v = localStorage.getItem('hs.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hs.' + k, JSON.stringify(v)); } catch {} },
};

let info = {};
let settings = {};
let currentMode = 'balanced';
let mech = null;

function swirlPaths(cx, cy, r, n, w) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(1)} ${(cy + Math.sin(ang) * rad).toFixed(1)}`;
    d += `<path d="M${p(a, r * 0.35)} Q${p(a + 0.5, r * 0.8)} ${p(a + 1.1, r)}" stroke-width="${w * 2}"/>`;
  }
  return d;
}

// Large fan: thin blades that leave an open hub (about 46% of the radius) and sweep outwards
function fanBlades(cx, cy, R, n) {
  const p = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(1)} ${(cy + Math.sin(ang) * rad).toFixed(1)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d += `<path d="M${p(a, R * 0.46)} Q${p(a + 0.75, R * 0.6)} ${p(a + 1.15, R)}"/>`;
  }
  return d;
}

// ---------- helpers ----------
function toast(msg, err = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3200);
}
async function write(key, value, okMsg) {
  const r = await api.write(key, value);
  if (r.ok) { settings[key] = String(value); if (okMsg) toast(okMsg); }
  else toast(r.error || 'Failed to apply', true);
  return r.ok;
}
const setFill = (el) => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- navigation ----------
function go(page, sub) {
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('on', p.id === 'page-' + page));
  if (sub) showSub(sub);
}
function showSub(sub) {
  if (sub !== 'light' && $('#area-editor') && !$('#area-editor').hidden) openArea(false);
  $$('.subtab').forEach((t) => t.classList.toggle('on', t.dataset.sub === sub));
  $$('.sub').forEach((s) => s.classList.toggle('on', s.id === 'sub-' + sub));
}
$$('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.page)));
$$('.subtab').forEach((t) => t.addEventListener('click', () => showSub(t.dataset.sub)));
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) go(g.dataset.goto, g.dataset.sub);
});
$$('.win').forEach((b) => b.addEventListener('click', () => api.window(b.dataset.win)));
$('#dock-toggle').addEventListener('click', () => document.body.classList.toggle('dock-hidden'));

// ---------- gauges ----------
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><defs>
  <linearGradient id="hs-grad" x1="0" y1="1" x2="0" y2="0"><stop offset=".15" stop-color="#1ee8a0"/><stop offset=".85" stop-color="#1a9bff"/></linearGradient>
  <linearGradient id="temp-grad" gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="156"><stop offset="0" stop-color="#1a9bff"/><stop offset="1" stop-color="#1ee8a0"/></linearGradient>
  <radialGradient id="temp-disc" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#0f3a46"/><stop offset="1" stop-color="#03141a"/></radialGradient>
  <radialGradient id="fan-grad" gradientUnits="userSpaceOnUse" cx="100" cy="100" r="92"><stop offset=".42" stop-color="#0a5266"/><stop offset="1" stop-color="#25b9d8"/></radialGradient>
</defs></svg>`);
// PredatorSense-style temperature dial: tick ring, thick blue->green arc counter-clockwise from 12 o'clock, dark centre disc
const TG = { c: 90, r: 66 };
function tempArc(frac) {
  frac = clamp(frac, 0, 0.9999);
  if (frac <= 0) return '';
  const a0 = -Math.PI / 2, a1 = a0 - frac * Math.PI * 2;
  const p = (a) => `${(TG.c + Math.cos(a) * TG.r).toFixed(2)} ${(TG.c + Math.sin(a) * TG.r).toFixed(2)}`;
  return `M${p(a0)} A${TG.r} ${TG.r} 0 ${frac > 0.5 ? 1 : 0} 0 ${p(a1)}`;
}
function buildTemp(el) {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2, r1 = 88, r2 = i % 6 ? 84 : 81;
    return `<line x1="${(90 + Math.cos(a) * r1).toFixed(1)}" y1="${(90 + Math.sin(a) * r1).toFixed(1)}" x2="${(90 + Math.cos(a) * r2).toFixed(1)}" y2="${(90 + Math.sin(a) * r2).toFixed(1)}"/>`;
  }).join('');
  $('svg', el).innerHTML = `
    <g stroke="rgba(0,150,178,.45)" stroke-width="1.6">${ticks}</g>
    <circle cx="90" cy="90" r="77" fill="#031015" stroke="#0a3540" stroke-width="1.5"/>
    <circle cx="90" cy="90" r="${TG.r}" fill="none" stroke="#062630" stroke-width="16"/>
    <path class="tg-val" d="" fill="none" stroke="url(#temp-grad)" stroke-width="16"/>
    <circle cx="90" cy="90" r="54" fill="url(#temp-disc)" stroke="#0e4a58" stroke-width="2.5"/>`;
}
function ring(el, frac, arc = 1) {
  const c = $('.rg-val', el);
  const r = Number(c.getAttribute('r'));
  const C = 2 * Math.PI * r;
  c.style.strokeDasharray = `${C * arc * clamp(frac, 0, 1)} ${C}`;
}
for (const id of ['#g-gpu-temp', '#g-cpu-temp', '#g-sys-temp']) buildTemp($(id));
function setTemp(id, v) {
  const el = $(id);
  $('b', el).textContent = fmt(v);
  $('.tg-val', el).setAttribute('d', tempArc((v || 0) / 100));
}

// Home keeps PredatorSense's fixed 1136 x 690 layout and scales down to fit smaller windows
const homeEl = $('#page-home .home');
new ResizeObserver(() => {
  const c = $('.content');
  const z = Math.min(1, (c.clientWidth - 24) / 1136, (c.clientHeight - 8) / 690);
  homeEl.style.setProperty('--home-zoom', Math.max(0.5, z).toFixed(3));
}).observe($('.content'));

function buildSpeedo(el) {
  const ticks = Array.from({ length: 40 }, (_, i) => {
    const a = (135 + (i / 39) * 270) * Math.PI / 180;
    const r1 = 86, r2 = i % 5 ? 80 : 76;
    return `<line x1="${100 + Math.cos(a) * r1}" y1="${100 + Math.sin(a) * r1}" x2="${100 + Math.cos(a) * r2}" y2="${100 + Math.sin(a) * r2}"/>`;
  }).join('');
  const R = 68, C = 2 * Math.PI * R;
  el.innerHTML = `<svg viewBox="0 0 200 200">
    <g stroke="#0f4552" stroke-width="2">${ticks}</g>
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="#0a242b" stroke-width="18" stroke-dasharray="${C * 0.75} ${C}" transform="rotate(135 100 100)"/>
    <circle class="sv" cx="100" cy="100" r="${R}" fill="none" stroke="url(#hs-grad)" stroke-width="18" stroke-dasharray="0 ${C}" transform="rotate(135 100 100)" style="transition:stroke-dasharray 1s ease"/>
    <circle cx="100" cy="100" r="44" fill="none" stroke="#0e3943" stroke-width="10"/>
    <circle cx="100" cy="100" r="34" fill="#03090b"/>
    <g class="needle"><path d="M100 100 L164 100" stroke="#3fd0ff" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #3fd0ff)"/></g>
  </svg>`;
  el._C = C;
}
function setSpeedo(el, frac) {
  frac = clamp(frac || 0, 0, 1);
  $('.sv', el).setAttribute('stroke-dasharray', `${el._C * 0.75 * frac} ${el._C}`);
  $('.needle', el).style.transform = `rotate(${135 + 270 * frac}deg)`;
}
buildSpeedo($('#sp-gpu'));
buildSpeedo($('#sp-cpu'));

// ---------- modes ----------
function availableModes() {
  return MODES.filter((m) => !info.profiles?.length || info.profiles.includes(m.id));
}
function renderModes() {
  $('#mode-tiles').innerHTML = availableModes().map((m) =>
    `<button class="tile" data-mode="${m.id}"><svg viewBox="0 0 56 56">${m.icon}</svg><span>${m.name}</span></button>`).join('');
  $$('#mode-tiles .tile').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
}
function showMode(id) {
  currentMode = id;
  document.body.dataset.mode = id;
  const m = MODES.find((x) => x.id === id) || MODES[2];
  $('#mode-name').textContent = m.name;
  $('#d-mode').textContent = m.name;
  $('#mode-intro').textContent = m.intro;
  $$('#mode-tiles .tile').forEach((b) => b.classList.toggle('on', b.dataset.mode === id));
  mech?.setMode(id);
}
async function setMode(id, quiet = false) {
  if (id === currentMode) return true;
  const ok = await write('platform_profile', id, quiet ? null : `${MODES.find((m) => m.id === id).name} mode`);
  if (ok) showMode(id);
  return ok;
}

// ---------- fans ----------
let fanMode = 'auto';
const sliders = { gpu: $('#gpu-fan-slider'), cpu: $('#cpu-fan-slider') };
function renderFans() {
  $('#fan-tiles').innerHTML = FAN_MODES.map((f) => `<button class="tile" data-fan="${f.id}"><svg viewBox="0 0 56 56">${f.icon}</svg><span>${f.name}</span></button>`).join('');
  $$('#fan-tiles .tile').forEach((b) => b.addEventListener('click', () => pickFan(b.dataset.fan)));
  $$('.swirl').forEach((s) => (s.innerHTML = `<g>${fanBlades(100, 100, 92, 24)}</g>`));
  for (const [k, s] of Object.entries(sliders)) {
    s.addEventListener('input', () => { $(`#${k}-fan-val`).textContent = s.value + '%'; setFill(s); });
  }
  $('#fan-apply').addEventListener('click', () => {
    store.set('fanCustom', [sliders.cpu.value, sliders.gpu.value]);
    write('fan_speed', `${sliders.cpu.value},${sliders.gpu.value}`, 'Custom fan speed applied');
  });
}
function showFan(mode) {
  fanMode = mode;
  $$('#fan-tiles .tile').forEach((b) => b.classList.toggle('on', b.dataset.fan === mode));
  $('#custom-fans').hidden = mode !== 'custom';
  $('#d-fan').textContent = FAN_MODES.find((f) => f.id === mode).name;
}
async function pickFan(mode, quiet = false) {
  if (mode === 'custom') { showFan('custom'); return true; }
  const ok = await write('fan_speed', mode === 'max' ? '100,100' : '0,0', quiet ? null : `Fan: ${mode === 'max' ? 'Max' : 'Auto'}`);
  if (ok) showFan(mode);
  return ok;
}
function parseFan(v) {
  const [c, g] = (v || '0,0').split(',').map(Number);
  if (!c && !g) return 'auto';
  if (c === 100 && g === 100) return 'max';
  sliders.cpu.value = c; sliders.gpu.value = g;
  return 'custom';
}

// ---------- lighting ----------
const light = store.get('light3', { tab: 'effect', effect: 3, color: '#00cdff', speed: 1, bright: 100, dir: 1, zone: 0, zones: ['#00cdff', '#1ee8a0', '#a855f7', '#ff3b6b'] });
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (r) => '#' + r.map((v) => clamp(Math.round(v || 0), 0, 255).toString(16).padStart(2, '0')).join('');
function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}

// PredatorSense-style colour picker: wheel (hue/saturation), vertical value bar, preset dots, RGB fields
function createPicker(root, onChange) {
  root.innerHTML = `<div class="picker">
    <div class="wheel"><span class="wdot"></span><b class="wlabel"></b></div>
    <input type="range" class="vbar" min="5" max="100" step="1">
    <div class="color-side">
      <div class="dots"><button class="none" data-c="#000000" title="Off"></button>${DOTS.map((c) => `<button data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="rgb">${['R', 'G', 'B'].map((k) => `<label>${k}<input type="number" min="0" max="255"></label>`).join('')}</div>
    </div></div>`;
  const wheel = $('.wheel', root), dot = $('.wdot', root), vbar = $('.vbar', root);
  let hsv = [0, 0, 1], hex = '#ffffff', locked = false;
  const emit = () => { hex = rgbToHex(hsvToRgb(...hsv)); render(); onChange(hex); };
  function render() {
    const a = hsv[0] * Math.PI / 180; // conic-gradient(from 90deg): red at 3 o'clock, hue runs clockwise
    dot.style.left = 50 + Math.cos(a) * 46 * hsv[1] + '%';
    dot.style.top = 50 + Math.sin(a) * 46 * hsv[1] + '%';
    dot.style.background = hex;
    vbar.value = Math.round(hsv[2] * 100);
    vbar.style.setProperty('--vb', rgbToHex(hsvToRgb(hsv[0], hsv[1], 1)));
    const rgb = hexToRgb(hex);
    $$('.rgb input', root).forEach((i, n) => (i.value = rgb[n]));
    $$('.dots button', root).forEach((d) => d.classList.toggle('on', d.dataset.c === hex));
  }
  wheel.addEventListener('pointerdown', (e) => {
    if (locked) return;
    const pick = (ev) => {
      const r = wheel.getBoundingClientRect();
      const x = ev.clientX - r.left - r.width / 2, y = ev.clientY - r.top - r.height / 2;
      hsv = [(Math.atan2(y, x) * 180 / Math.PI + 360) % 360, clamp(Math.hypot(x, y) / (r.width * 0.46), 0, 1), hsv[2] || 1];
      emit();
    };
    pick(e);
    const up = () => { removeEventListener('pointermove', pick); removeEventListener('pointerup', up); };
    addEventListener('pointermove', pick);
    addEventListener('pointerup', up);
  });
  vbar.addEventListener('input', () => { hsv[2] = vbar.value / 100; emit(); });
  $$('.dots button', root).forEach((d) => d.addEventListener('click', () => { api.set(d.dataset.c); onChange(hex); }));
  $$('.rgb input', root).forEach((i) => i.addEventListener('change', () => {
    api.set(rgbToHex($$('.rgb input', root).map((x) => Number(x.value))));
    onChange(hex);
  }));
  const api = {
    set(h) { hex = h; hsv = rgbToHsv(hexToRgb(h)); render(); },
    lock(on, label = '') { locked = on; root.classList.toggle('locked', on); $('.wlabel', root).textContent = label; dot.hidden = on; },
  };
  return api;
}

// keyboard layout in key units (1u = one key pitch): main block 15u, gap, numpad 4u
const KB_W = 19.4;
function keyboardLayout() {
  const keys = [];
  const row = (y, h, widths, x0 = 0) => { let x = x0; for (const w of widths) { keys.push({ x, y, w, h }); x += w; } };
  const ones = (n) => Array(n).fill(1);
  row(0, 0.65, ones(15)); row(0, 0.65, ones(4), 15.4);
  row(0.75, 1, [...ones(13), 2]); row(0.75, 1, ones(4), 15.4);
  row(1.75, 1, [1.5, ...ones(12), 1.5]); row(1.75, 1, ones(3), 15.4); keys.push({ x: 18.4, y: 1.75, w: 1, h: 2 });
  row(2.75, 1, [1.75, ...ones(11), 2.25]); row(2.75, 1, ones(3), 15.4);
  row(3.75, 1, [2.25, ...ones(10), 1.75, 1]); row(3.75, 1, ones(3), 15.4); keys.push({ x: 18.4, y: 3.75, w: 1, h: 2 });
  row(4.75, 1, [1.25, 1, 1.25, 1.25, 4.75, 1.25, 1.25, 1, 1, 1]); row(4.75, 1, [2, 1], 15.4);
  for (const k of keys) k.zone = Math.min(3, Math.floor(((k.x + k.w / 2) / KB_W) * 4));
  return keys;
}

let globalPicker, areaPicker;
const applyLight = debounce(() => {
  store.set('light3', light);
  if (light.tab === 'zones') return write('per_zone_mode', light.zones.map((c) => c.slice(1).toUpperCase()).join(',') + ',' + light.bright);
  const [r, g, b] = hexToRgb(light.color);
  const dir = [3, 4].includes(light.effect) ? light.dir : 0;
  write('four_zone_mode', `${light.effect},${light.effect === 0 ? 0 : light.speed},${light.bright},${dir},${r},${g},${b}`);
}, 350);

function renderKeyboard() {
  $$('#keyboard rect').forEach((r) => {
    const z = Number(r.dataset.zone), c = light.zones[z];
    r.style.stroke = c;
    r.style.fill = c + (z === light.zone ? '30' : '12');
    r.classList.toggle('sel', z === light.zone);
  });
  $$('#markers button').forEach((m, i) => m.classList.toggle('on', i === light.zone));
  $('#zone-select').value = String(light.zone);
}
function renderLight() {
  $$('#light-tabs .tile').forEach((t) => t.classList.toggle('on', t.dataset.light === light.tab));
  const fx = light.tab === 'effect';
  $('#global-view').hidden = !fx;
  $('#area-intro').hidden = fx;
  $$('.effect').forEach((e) => e.classList.toggle('on', Number(e.dataset.id) === light.effect));
  const auto = [2, 3].includes(light.effect);
  globalPicker.lock(auto, auto ? 'Auto' : '');
  if (!auto) globalPicker.set(light.color);
  $('#speed-box').classList.toggle('disabled', light.effect === 0);
  $('#dir-box').classList.toggle('disabled', ![3, 4].includes(light.effect));
  $$('.dirs button').forEach((b) => b.classList.toggle('on', Number(b.dataset.dir) === light.dir));
  for (const id of ['#light-speed', '#light-bright', '#area-bright']) {
    const el = $(id);
    el.value = id === '#light-speed' ? light.speed : light.bright;
    setFill(el);
  }
  areaPicker.set(light.zones[light.zone]);
  renderKeyboard();
  $('#d-effect').textContent = fx ? EFFECTS[light.effect].name : 'Area';
}
function lightChanged() { renderLight(); applyLight(); }
function openArea(on) {
  $('#light-main').hidden = on;
  $('#area-editor').hidden = !on;
  $('#area-back').hidden = !on;
  $('.subtabs').hidden = on;
  if (on && light.tab !== 'zones') { light.tab = 'zones'; lightChanged(); }
}
function buildLight() {
  $('#effects').innerHTML = EFFECTS.map((e) => `<button class="effect" data-id="${e.id}"><svg viewBox="0 0 32 32">${e.icon}</svg>${e.name}</button>`).join('');
  globalPicker = createPicker($('#global-picker'), (hex) => { light.color = hex; lightChanged(); });
  areaPicker = createPicker($('#area-picker'), (hex) => { light.zones[light.zone] = hex; lightChanged(); });

  const keys = keyboardLayout();
  const U = 36, H = 5.75 * U;
  $('#keyboard').setAttribute('viewBox', `-4 -4 ${KB_W * U + 8} ${H + 8}`);
  $('#keyboard').innerHTML = keys.map((k) =>
    `<rect data-zone="${k.zone}" x="${k.x * U + 2}" y="${k.y * U + 2}" width="${k.w * U - 4}" height="${k.h * U - 4}" rx="3"/>`).join('');
  $('#markers').innerHTML = [0, 1, 2, 3].map((z) => `<button style="left:${((z + 0.5) / 4) * 100}%">${z + 1}</button>`).join('');
  $$('#keyboard rect').forEach((r) => r.addEventListener('click', () => { light.zone = Number(r.dataset.zone); renderLight(); }));
  $$('#markers button').forEach((m, i) => m.addEventListener('click', () => { light.zone = i; renderLight(); }));
  $('#zone-select').addEventListener('change', (e) => { light.zone = Number(e.target.value); renderLight(); });

  $$('#light-tabs .tile').forEach((t) => t.addEventListener('click', () => { light.tab = t.dataset.light; lightChanged(); }));
  $$('.effect').forEach((e) => e.addEventListener('click', () => { light.effect = Number(e.dataset.id); lightChanged(); }));
  $('#light-speed').addEventListener('input', (e) => { light.speed = Number(e.target.value); lightChanged(); });
  for (const id of ['#light-bright', '#area-bright']) $(id).addEventListener('input', (e) => { light.bright = Number(e.target.value); lightChanged(); });
  $$('.dirs button').forEach((b) => b.addEventListener('click', () => { light.dir = Number(b.dataset.dir); lightChanged(); }));
  $('#to-area').addEventListener('click', () => openArea(true));
  $('#area-back').addEventListener('click', () => openArea(false));
  $('#light-reset').addEventListener('click', () => {
    Object.assign(light, { tab: 'effect', effect: 3, color: '#00cdff', speed: 1, bright: 100, dir: 1 });
    openArea(false);
    lightChanged();
    toast('Lighting reset');
  });
  $('#kb-timeout-link').addEventListener('click', () => toggleSetting('backlight_timeout'));
  renderLight();
}

// ---------- profiles ----------
async function applyProfile(name) {
  const p = PROFILES[name];
  store.set('profile', name);
  $$('#profile-select, #profile-select-main').forEach((s) => (s.value = name));
  if (!p) return;
  await setMode(p.mode, true);
  await pickFan(p.fan, true);
  if (info.hasKeyboard) { light.tab = 'effect'; light.effect = p.effect; openArea(false); lightChanged(); }
  toast(`Profile: ${name}`);
}
function buildProfiles() {
  const opts = Object.keys(PROFILES).map((n) => `<option>${n}</option>`).join('');
  $$('#profile-select, #profile-select-main').forEach((s) => {
    s.innerHTML = opts;
    s.value = store.get('profile', 'Daily Use');
    s.addEventListener('change', () => applyProfile(s.value));
  });
}

// ---------- personal settings ----------
async function toggleSetting(key) {
  const next = settings[key] === '1' ? '0' : '1';
  if (await write(key, next, 'Saved')) renderPersonal();
}
function renderPersonal() {
  $$('.psec .switch[data-key]').forEach((s) => {
    const v = settings[s.dataset.key];
    s.classList.toggle('on', v === '1');
    s.closest('.psec').querySelectorAll('h4, .desc').length; // keep layout
    s.classList.toggle('unsupported', v === null || v === undefined);
  });
  $$('.radio').forEach((r) => r.classList.toggle('on', settings[r.dataset.key] === r.dataset.val));
  const usb = settings.usb_charging;
  $('#usb-switch').classList.toggle('on', !!usb && usb !== '0');
  $('#usb-switch').classList.toggle('unsupported', usb === null || usb === undefined);
  if (usb && usb !== '0') $('#usb-limit').value = usb;
  $('#kb-timeout-state').textContent = settings.backlight_timeout === '1' ? '(On)' : '(Off)';
}
function buildPersonal() {
  $$('.psec .switch[data-key]').forEach((s) => s.addEventListener('click', () => toggleSetting(s.dataset.key)));
  $$('.radio').forEach((r) => r.addEventListener('click', async () => {
    if (await write(r.dataset.key, r.dataset.val, 'Battery charge mode saved')) renderPersonal();
  }));
  $('#usb-switch').addEventListener('click', async () => {
    const on = settings.usb_charging && settings.usb_charging !== '0';
    if (await write('usb_charging', on ? '0' : $('#usb-limit').value, 'Saved')) renderPersonal();
  });
  $('#usb-limit').addEventListener('change', async () => {
    if (settings.usb_charging && settings.usb_charging !== '0') await write('usb_charging', $('#usb-limit').value, 'Saved');
  });
  $$('#pnav button').forEach((b) => b.addEventListener('click', () => {
    $$('#pnav button').forEach((x) => x.classList.toggle('on', x === b));
    $('#' + b.dataset.sec).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  renderPersonal();
}

// ---------- charts ----------
const N = 90;
const H = { gpuT: [], gpuU: [], cpuT: [], cpuU: [], sysT: [] };
const MM = {};
function push(k, v) {
  if (v === null || v === undefined) return;
  H[k].push(v); if (H[k].length > N) H[k].shift();
  MM[k] = MM[k] || { min: v, max: v };
  MM[k].min = Math.min(MM[k].min, v); MM[k].max = Math.max(MM[k].max, v);
}
function canvas2d(cv) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return null;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  return { g, w, h };
}
function drawBars(cv, data, color) {
  const c = canvas2d(cv); if (!c) return;
  const { g, w, h } = c, bw = w / N;
  data.forEach((v, i) => {
    const x = w - (data.length - i) * bw, bh = (h - 2) * clamp(v / 100, 0, 1);
    const gr = g.createLinearGradient(0, h - bh, 0, h); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x, h - bh, Math.max(1, bw - 1), bh);
    g.fillStyle = color; g.fillRect(x, h - bh, Math.max(1, bw - 1), 1.5);
  });
}
function drawLine(cv, series, clear = true) {
  const c = canvas2d(cv); if (!c) return;
  const { g, w, h } = c;
  if (clear) { g.strokeStyle = 'rgba(40,120,135,.25)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, h * i / 4); g.lineTo(w, h * i / 4); g.stroke(); } }
  for (const { data, color, fill, bars } of series) {
    if (!data.length) continue;
    const px = (i) => w - (data.length - 1 - i) * (w / (N - 1));
    const py = (v) => h - 2 - (h - 4) * clamp(v / 100, 0, 1);
    if (bars) {
      data.forEach((v, i) => { g.fillStyle = color; g.globalAlpha = 0.85; g.fillRect(px(i) - 1.5, py(v), 3, h - py(v)); });
      g.globalAlpha = 1;
      continue;
    }
    g.beginPath(); data.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
    g.strokeStyle = color; g.lineWidth = 1.6; g.stroke();
    if (fill) { g.lineTo(px(data.length - 1), h); g.lineTo(px(0), h); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, fill); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fill(); }
  }
}
const mm = (k) => (MM[k] ? `Min : ${MM[k].min}°   Max : ${MM[k].max}°` : '');

// ---------- live stats ----------
const fanDur = (rpm) => (rpm > 0 ? Math.max(0.12, 900 / rpm).toFixed(2) + 's' : '0s');
async function tick() {
  const s = await api.stats();
  // home
  const gf = $('#g-gpu-freq');
  $('b', gf).textContent = fmt(s.gpu.freq);
  ring(gf, (s.gpu.freq || 0) / 3000, 0.83);
  setTemp('#g-gpu-temp', s.gpu.temp); setTemp('#g-cpu-temp', s.cpu.temp); setTemp('#g-sys-temp', s.sys.temp);
  $('#h-gpu-usage').textContent = fmt(s.gpu.usage) + '%';
  $('#h-cpu-usage').textContent = fmt(s.cpu.usage) + '%';
  push('gpuU', s.gpu.usage); push('cpuU', s.cpu.usage); push('gpuT', s.gpu.temp); push('cpuT', s.cpu.temp); push('sysT', s.sys.temp);
  if ($('#page-home').classList.contains('on')) {
    drawBars($('#spark-gpu'), H.gpuU.slice(-40), '#16c8e0');
    drawLine($('#spark-cpu'), [{ data: H.cpuU.slice(-40), color: '#16c8e0', fill: 'rgba(22,200,224,.35)' }], false);
  }
  // scenario
  $('#power-title').textContent = s.battery.ac === false ? 'On Battery' : 'AC Plugged In';
  $('#sp-gpu-clock').textContent = fmt(s.gpu.freq); $('#sp-gpu-usage').textContent = fmt(s.gpu.usage) + '%';
  $('#sp-cpu-clock').textContent = fmt(s.cpu.freq); $('#sp-cpu-usage').textContent = fmt(s.cpu.usage) + '%';
  setSpeedo($('#sp-gpu'), (s.gpu.freq || 0) / 3000);
  setSpeedo($('#sp-cpu'), (s.cpu.freq || 0) / 5400);
  $$('.fan-block').forEach((b) => {
    const rpm = s.fans[b.dataset.which];
    $('.rpm', b).textContent = fmt(rpm);
    $('.swirl', b).style.setProperty('--dur', fanDur(rpm));
  });
  // monitoring
  if (s.gpu.name) $('#m-gpu-name').textContent = s.gpu.name;
  if (s.cpu.name) $('#m-cpu-name').textContent = s.cpu.name;
  $('#m-gpu-temp').textContent = fmt(s.gpu.temp); $('#m-gpu-usage').textContent = fmt(s.gpu.usage);
  $('#m-cpu-temp').textContent = fmt(s.cpu.temp); $('#m-cpu-usage').textContent = fmt(s.cpu.usage);
  $('#m-sys-temp').textContent = fmt(s.sys.temp);
  $('#m-gpu-fan').textContent = fmt(s.fans.gpu); $('#m-cpu-fan').textContent = fmt(s.fans.cpu);
  $('#m-gpu-freq').textContent = fmt(s.gpu.freq); $('#m-cpu-freq').textContent = fmt(s.cpu.freq);
  $('#m-ram').textContent = fmt(s.ram); $('#m-ram-pct').textContent = s.mem !== null ? `[${s.mem}%]` : '';
  $('#m-eth-d').textContent = fmt(s.net?.eth.down); $('#m-eth-u').textContent = fmt(s.net?.eth.up);
  $('#m-wifi-d').textContent = fmt(s.net?.wifi.down); $('#m-wifi-u').textContent = fmt(s.net?.wifi.up);
  $('#m-gpu-mm').textContent = mm('gpuT'); $('#m-cpu-mm').textContent = mm('cpuT'); $('#m-sys-mm').textContent = mm('sysT');
  if ($('#page-monitoring').classList.contains('on')) {
    drawLine($('#c-gpu'), [{ data: H.gpuU, color: '#1ee8a0', bars: true }, { data: H.gpuT, color: '#1fb6ff' }]);
    drawLine($('#c-cpu'), [{ data: H.cpuU, color: '#1ee8a0', fill: 'rgba(30,232,160,.25)' }, { data: H.cpuT, color: '#1fb6ff' }]);
    drawLine($('#c-sys'), [{ data: H.sysT, color: '#1fb6ff', fill: 'rgba(31,182,255,.3)' }]);
  }
  // dock tiles
  $('#t-gpu-u').textContent = fmt(s.gpu.usage); $('#t-gpu-t').textContent = fmt(s.gpu.temp);
  $('#t-cpu-u').textContent = fmt(s.cpu.usage); $('#t-cpu-t').textContent = fmt(s.cpu.temp);
  $('#t-sys-t').textContent = fmt(s.sys.temp); $('#t-ram').textContent = fmt(s.mem);
}

function driverStatus() {
  $('#driver-status').textContent = info.demo ? 'Demo mode · hawatri_sense not loaded'
    : `hawatri_sense loaded · ${info.family === 'nitro_sense' ? 'Nitro' : 'Predator'} series`;
}

// ---------- boot ----------
(async function init() {
  info = await api.info();
  settings = await api.readSettings();
  $('#demo-badge').hidden = !info.demo;
  $('#version').textContent = info.version;
  $('#host').textContent = info.host;
  $('#family').textContent = info.family === 'nitro_sense' ? 'Nitro series' : info.family ? 'Predator series' : 'not detected';
  driverStatus();
  $('#check-now').addEventListener('click', async () => { settings = await api.readSettings(); renderPersonal(); showFan(parseFan(settings.fan_speed)); toast('Settings refreshed'); });

  mech = createMech($('#mech-canvas'));
  renderModes();
  showMode(settings.platform_profile || 'balanced');

  renderFans();
  const [cc, cg] = store.get('fanCustom', [50, 60]);
  sliders.cpu.value = cc; sliders.gpu.value = cg;
  Object.entries(sliders).forEach(([k, s]) => { $(`#${k}-fan-val`).textContent = s.value + '%'; setFill(s); });
  showFan(parseFan(settings.fan_speed));

  if (info.hasKeyboard) buildLight();
  else { $('#subtab-light').hidden = true; $('#d-effect-row').hidden = true; }
  buildProfiles();
  buildPersonal();
  tick();
  setInterval(tick, 1000);
})();

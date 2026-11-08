// HawatriSense - Hawatri mech viewer, by Kia Hawatri
// Renders assets/hawatri-mech.glb on a glowing platform and plays the mech's looping clips
// (idle / run / fly / kneel) with cross-fades when the system mode changes:
//   Balanced = idle, Performance = run, Turbo = take off and fly, Quiet/Eco = kneel and rest.
// Feet (or the knee when kneeling) stay planted on the platform. It never reacts to the mouse.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const BEHAVIOUR = {
  'low-power':            { clip: 'kneel', fade: 1.4, speed: 1,    glow: 0.3, energy: 0.15, ring: 0.45, yaw: 0.55, cam: 7.6, fly: 0 },
  quiet:                  { clip: 'kneel', fade: 1.4, speed: 1,    glow: 0.5, energy: 0.3,  ring: 0.65, yaw: 0.55, cam: 7.6, fly: 0 },
  balanced:               { clip: 'idle',  fade: 0.9, speed: 1,    glow: 1.0, energy: 0.6,  ring: 1.0,  yaw: 0.12, cam: 7.6, fly: 0 },
  'balanced-performance': { clip: 'run',   fade: 0.5, speed: 1.25, glow: 1.5, energy: 1.2,  ring: 1.5,  yaw: 0.95, cam: 7.5, fly: 0 },
  performance:            { clip: 'fly',   fade: 0.9, speed: 1,    glow: 2.6, energy: 2.4,  ring: 2.2,  yaw: 0,    cam: 8.6, fly: 1 },
};
// User-supplied PredatorSense robot (fighter.glb): each mode has an intro clip `<Name>Mode`
// that plays once, then `<Name>ModeLoop` repeats while the mode stays active.
const ROBOT_CLIPS = {
  'low-power': 'Eco',
  quiet: 'Quiet',
  balanced: 'Default',
  'balanced-performance': 'Turbo',
  performance: 'Extreme',
};
const ROBOT_LOOK = { exposure: 0.9, env: 0.12, rig: Math.PI, logo: 0x16b8e0, logoGlow: 1.0, cam: 6.2 };
const FLY_HEIGHT = 0.62;
const KNEE_RADIUS = 0.07;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (t) => t * t * (3 - 2 * t);

export function createMech(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
  const camLook = new THREE.Vector3(0, 0.9, 0);

  const key = new THREE.DirectionalLight(0xdff6ff, 2.2); key.position.set(2, 4, 4); scene.add(key);
  const rimL = new THREE.DirectionalLight(0x22e0ff, 3.0); rimL.position.set(-4, 2, -2); scene.add(rimL);
  const rimR = new THREE.DirectionalLight(0x1aa8ff, 2.4); rimR.position.set(4, 1.5, -3); scene.add(rimR);
  const hemi = new THREE.HemisphereLight(0x2bb7d6, 0x02080a, 0.6); scene.add(hemi);
  const underLight = new THREE.PointLight(0x2ce8ff, 0, 2.5); scene.add(underLight);

  // ---------- textures + platform ----------
  const radial = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  };
  const vertical = (stops) => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 128;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
    return new THREE.CanvasTexture(c);
  };
  const additive = (map, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

  const platform = new THREE.Group();
  scene.add(platform);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.86, 0.07, 64), new THREE.MeshStandardMaterial({ color: 0x06161b, metalness: 0.8, roughness: 0.35 }));
  disc.position.y = -0.04;
  platform.add(disc);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2ce8ff });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.018, 12, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  platform.add(ring);
  // dashed inner ring that spins with the mode's energy (fast while running)
  const dash = document.createElement('canvas'); dash.width = 512; dash.height = 8;
  const dg = dash.getContext('2d'); for (let i = 0; i < 24; i++) { dg.fillStyle = 'rgba(40,200,230,.9)'; dg.fillRect(i * 21.3, 0, 13, 8); }
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.61, 96, 1), additive(new THREE.CanvasTexture(dash), 0.8));
  inner.material.map.wrapS = THREE.RepeatWrapping;
  { // map the dash texture around the ring
    const uv = inner.geometry.attributes.uv, pos = inner.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.atan2(pos.getY(i), pos.getX(i)) / (Math.PI * 2) + 1) % 1, uv.getY(i));
  }
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.004;
  platform.add(inner);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), additive(radial([[0, 'rgba(40,230,255,0)'], [0.62, 'rgba(40,230,255,0)'], [0.75, 'rgba(40,230,255,.6)'], [1, 'rgba(40,230,255,0)']])));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  platform.add(glow);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), additive(radial([[0, 'rgba(70,225,255,.7)'], [1, 'rgba(70,225,255,0)']]), 0));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.012;
  platform.add(pool);

  const waves = [];
  const waveTex = radial([[0, 'rgba(120,240,255,0)'], [0.86, 'rgba(120,240,255,0)'], [0.94, 'rgba(160,250,255,1)'], [1, 'rgba(120,240,255,0)']]);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), additive(waveTex, 0));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.015;
    m.visible = false;
    platform.add(m);
    waves.push({ m, t: 2, speed: 1, power: 1 });
  }
  let waveIdx = 0;
  const shockwave = (delay = 0, power = 1, speed = 1) => Object.assign(waves[waveIdx++ % waves.length], { t: -delay, power, speed });

  // thruster flames (feet) + repulsor glows (hands), shown while flying
  const flameTex = vertical([[0, 'rgba(220,255,255,1)'], [0.25, 'rgba(60,220,255,.9)'], [1, 'rgba(20,120,255,0)']]);
  const flames = ['footL', 'footR'].map((bone) => {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.62, 20, 1, true), additive(flameTex, 0));
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.36, 16, 1, true), additive(flameTex, 0));
    outer.rotation.x = core.rotation.x = Math.PI; // apex pointing down
    outer.position.y = -0.31; core.position.y = -0.18;
    g.add(outer, core);
    scene.add(g);
    return { bone, g, outer, core };
  });
  const handTex = radial([[0, 'rgba(200,255,255,1)'], [0.35, 'rgba(60,220,255,.6)'], [1, 'rgba(60,220,255,0)']]);
  const repulsors = ['handL', 'handR'].map((bone) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: handTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    s.scale.setScalar(0.28);
    scene.add(s);
    return { bone, s };
  });

  const N = 220;
  const pPos = new Float32Array(N * 3);
  const pData = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.7, y: Math.random() * 2.6, v: 0.25 + Math.random() * 0.6 }));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.028, map: radial([[0, 'rgba(180,250,255,1)'], [0.4, 'rgba(60,220,255,.6)'], [1, 'rgba(60,220,255,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
  scene.add(new THREE.Points(pGeo, pMat));

  // ---------- mech ----------
  let mech = null, mixer = null;
  const actions = {};
  let active = null;
  const nodes = {};
  const emissive = [];
  let restAnkleY = 0;
  let mode = 'balanced';
  let beh = { ...BEHAVIOUR.balanced };
  const cur = { ...BEHAVIOUR.balanced };
  let flare = 0, shake = 0, burst = 0;

  let robot = false; // true when showing the user's own PredatorSense robot
  const loader = new GLTFLoader();
  const parse = (glb) => {
    const u8 = new Uint8Array(glb);
    return loader.parseAsync(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), '');
  };
  const loadMech = () => window.hawatri.asset('hawatri-mech.glb').then(parse);
  Promise.resolve(window.hawatri.robot ? window.hawatri.robot() : null)
    .then((r) => (r ? parse(r.data).then((g) => { robot = true; console.info('Using PredatorSense robot from', r.path); return g; }) : loadMech()))
    .catch((e) => { console.warn('robot load failed, using Hawatri mech', e); robot = false; return loadMech(); })
    .then((gltf) => {
      if (robot) return setupRobot(gltf);
      mech = gltf.scene;
      mech.traverse((o) => {
        if (o.name) nodes[o.name] = o;
        if (o.isMesh) {
          o.frustumCulled = false;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.05) emissive.push({ m, base: m.emissiveIntensity || 1 });
            m.envMapIntensity = 1.2;
          }
        }
      });
      const box = new THREE.Box3().setFromObject(mech);
      const s = 1.9 / (box.max.y - box.min.y);
      mech.scale.setScalar(s);
      mech.userData.baseY = -box.min.y * s;
      mech.position.y = mech.userData.baseY;
      scene.add(mech);

      mixer = new THREE.AnimationMixer(mech);
      for (const clip of gltf.animations) {
        const a = mixer.clipAction(clip);
        a.setLoop(THREE.LoopRepeat, Infinity);
        actions[clip.name] = a;
      }
      // measure where the ankles sit when standing (the floor reference)
      if (actions.idle) { actions.idle.play(); mixer.update(0); }
      mech.updateMatrixWorld(true);
      restAnkleY = lowest(['footL', 'footR']);
      if (actions.idle) actions.idle.stop();
      setMode(mode, true);
    })
    .catch((e) => console.error('mech load failed', e));

  function setupRobot(gltf) {
    mech = gltf.scene;
    // The robot ships its own light rig (soft blue key, blue/green rims) and dark, very metallic
    // textures. Light it with that rig instead of the mech's bright studio lights, and keep the
    // reflection environment faint, or the chrome mirrors it and washes out to white.
    key.intensity = rimL.intensity = rimR.intensity = 0;
    hemi.intensity = 0.15;
    renderer.toneMappingExposure = ROBOT_LOOK.exposure;
    scene.environmentIntensity = ROBOT_LOOK.env;
    mech.traverse((o) => {
      if (o.isLight) o.intensity *= ROBOT_LOOK.rig; // authored for legacy (non-physical) light units
      if (o.isMesh) {
        o.frustumCulled = false;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.envMapIntensity = 1;
          if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.05) {
            // the logo is pure white emissive; make it a cyan glow that matches the platform
            m.color.setHex(0x05232b);
            m.metalness = 0;
            m.emissive.setHex(ROBOT_LOOK.logo);
            m.toneMapped = false; // keep the cyan saturated instead of burning out to white
            emissive.push({ m, base: ROBOT_LOOK.logoGlow });
          }
        }
      }
    });
    mixer = new THREE.AnimationMixer(mech);
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      if (clip.name.endsWith('Loop')) a.setLoop(THREE.LoopRepeat, Infinity);
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[clip.name] = a;
    }
    // when a mode's intro clip ends, blend into that mode's loop
    mixer.addEventListener('finished', (e) => {
      const loop = actions[e.action.getClip().name + 'Loop'];
      if (!loop || e.action !== active) return;
      loop.reset().setEffectiveWeight(1).play();
      e.action.crossFadeTo(loop, 0.35, false);
      active = loop;
    });
    // size it from its standing pose (skinned bounds) to the same height as the Hawatri mech
    const idle = actions.DefaultModeLoop;
    if (idle) { idle.play(); mixer.update(0); }
    mech.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mech, true);
    const s = 1.9 / (box.max.y - box.min.y);
    mech.scale.setScalar(s);
    mech.userData.baseY = -box.min.y * s;
    mech.position.y = mech.userData.baseY;
    if (idle) idle.stop();
    scene.add(mech);
    setMode(mode, true);
  }

  function setRobotMode(m, instant) {
    const name = ROBOT_CLIPS[m] || ROBOT_CLIPS.balanced;
    const loop = actions[name + 'ModeLoop'];
    const intro = actions[name + 'Mode'];
    const next = instant || !intro ? loop : intro;
    if (!next || next === active) return;
    next.enabled = true;
    next.reset().setEffectiveWeight(1).play();
    if (active) active.crossFadeTo(next, 0.35, false);
    active = next;
  }

  const tmpV = new THREE.Vector3();
  const worldY = (n) => (nodes[n] ? nodes[n].getWorldPosition(tmpV).y : Infinity);
  const lowest = (names) => Math.min(...names.map(worldY));

  function setMode(m, instant = false) {
    const prev = beh;
    mode = m;
    beh = { ...(BEHAVIOUR[m] || BEHAVIOUR.balanced) };
    if (robot) { beh.fly = 0; beh.yaw = 0; beh.cam = ROBOT_LOOK.cam; } // the robot's own clips handle the motion
    if (!mixer) return;
    if (robot) {
      setRobotMode(m, instant);
      if (instant) { for (const k in cur) if (typeof cur[k] === 'number') cur[k] = beh[k]; return; }
      shockwave(0.05, 0.9, 1.2); flare = m === 'performance' ? 1.6 : 0.6;
      return;
    }
    const next = actions[beh.clip];
    if (!next) return;
    next.enabled = true;
    next.setEffectiveTimeScale(beh.speed);
    if (instant || !active) {
      next.reset().setEffectiveWeight(1).play();
      for (const k in cur) if (typeof cur[k] === 'number') cur[k] = beh[k];
    } else if (active !== next) {
      next.reset().setEffectiveWeight(1).play();
      active.crossFadeTo(next, beh.fade, false);
    }
    active = next;
    if (instant) return;
    // effects for the change
    if (beh.fly && !prev.fly) { shockwave(0.05, 1.7, 1.3); shockwave(0.3, 1.2, 1); shockwave(0.55, 0.8, 0.8); flare = 2.2; shake = 1; burst = 1; }
    else if (prev.fly && !beh.fly) { shockwave(0.55, 1.1, 1.1); flare = 0.8; shake = 0.4; } // landing
    else if (beh.clip === 'run') { shockwave(0.05, 0.9, 1.2); flare = 0.7; }
    else if (beh.clip === 'kneel') flare = -0.6;
    else shockwave(0.05, 0.6, 1);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);

  const q = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0);
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!canvas.clientWidth) return;
    const t = now / 1000;
    for (const k of ['glow', 'energy', 'ring', 'cam']) cur[k] = lerp(cur[k], beh[k], 1 - Math.exp(-dt * 2.2));
    cur.yaw = lerp(cur.yaw, beh.yaw, 1 - Math.exp(-dt * 1.8));
    // take-off is slower than landing feels natural: ease the fly weight
    cur.fly = lerp(cur.fly, beh.fly, 1 - Math.exp(-dt * (beh.fly ? 1.6 : 2.4)));
    flare *= Math.exp(-dt * 1.8);
    shake *= Math.exp(-dt * 5);
    burst *= Math.exp(-dt * 1.2);

    if (mech && mixer && robot) {
      mixer.update(dt);
      mech.position.set(0, mech.userData.baseY, 0);
      mech.rotation.set(0, Math.sin(t * 0.3) * 0.05, 0);
      const glowNow = Math.max(0.2, cur.glow + flare);
      for (const e of emissive) e.m.emissiveIntensity = e.base * glowNow * (0.88 + 0.12 * Math.sin(t * 3));
      underLight.position.set(0, 0.1, 0);
      underLight.intensity = Math.max(0, flare) * 1.5;
    } else if (mech && mixer) {
      mixer.update(dt);
      if (nodes.chest) nodes.chest.quaternion.multiply(q.setFromAxisAngle(AX, Math.sin(t * 1.5) * 0.012)); // breathing
      // plant the lowest contact (a foot, or the knee when kneeling) on the platform
      mech.position.set(0, mech.userData.baseY, 0);
      mech.rotation.y = cur.yaw + Math.sin(t * 0.3) * 0.05;
      const fl8 = smooth(clamp01(cur.fly));
      mech.rotation.x = fl8 * (0.1 + 0.03 * Math.sin(t * 1.1));   // lean into the hover
      mech.rotation.z = fl8 * 0.045 * Math.sin(t * 0.8);          // gentle banking
      mech.updateMatrixWorld(true);
      const ground = -Math.min(lowest(['footL', 'footR']) - restAnkleY, lowest(['shinL', 'shinR']) - KNEE_RADIUS);
      const f = smooth(clamp01(cur.fly));
      const airborne = FLY_HEIGHT * f + f * 0.05 * Math.sin(t * 2.2);
      mech.position.y = mech.userData.baseY + ground * (1 - f) + airborne;
      mech.updateMatrixWorld(true);

      const glowNow = Math.max(0.05, cur.glow + flare);
      for (const e of emissive) e.m.emissiveIntensity = e.base * glowNow * (0.88 + 0.12 * Math.sin(t * 3) + f * 0.1 * Math.sin(t * 23));

      // thrusters follow the feet, pointing straight down
      for (const fl of flames) {
        const n = nodes[fl.bone];
        if (!n) continue;
        n.getWorldPosition(fl.g.position);
        fl.g.position.y -= 0.06;
        const flick = 0.85 + 0.15 * Math.sin(t * 40 + fl.g.position.x * 50) + 0.1 * Math.random();
        fl.g.scale.set(1, (0.4 + f * 0.9) * flick, 1);
        fl.outer.material.opacity = f * 0.75;
        fl.core.material.opacity = f;
      }
      for (const r of repulsors) {
        const n = nodes[r.bone];
        if (!n) continue;
        n.getWorldPosition(r.s.position);
        r.s.material.opacity = f * (0.7 + 0.3 * Math.sin(t * 17));
      }
      underLight.position.set(0, mech.position.y + 0.1, 0);
      underLight.intensity = f * 3 + Math.max(0, flare) * 1.5;
    }

    // platform + effects
    const r = Math.max(0.2, cur.ring + flare * 0.6);
    ringMat.color.setRGB(0.17 * r, 0.9 * Math.min(r, 1.4), Math.min(r, 1.4));
    glow.material.opacity = Math.min(1, 0.45 * r);
    glow.scale.setScalar(1 + 0.04 * Math.sin(t * 2) + burst * 0.08);
    pool.material.opacity = Math.min(0.95, Math.max(0, (cur.ring - 0.8) * 0.3 + flare * 0.25 + cur.fly * 0.6));
    inner.material.map.offset.x -= dt * 0.08 * cur.energy * (beh.clip === 'run' ? 3 : 1);
    for (const w of waves) {
      if (w.t > 1.2) { w.m.visible = false; continue; }
      w.t += dt * w.speed;
      const k = clamp01(w.t);
      w.m.visible = w.t >= 0;
      w.m.scale.setScalar(0.35 + k * 1.5);
      w.m.material.opacity = (1 - k) * w.power;
    }
    const speed = 0.35 + cur.energy * 0.55 + burst * 2.5;
    for (let i = 0; i < N; i++) {
      const d = pData[i];
      d.y += dt * d.v * speed;
      d.a += dt * 0.25 * (1 + cur.energy * 0.4);
      if (d.y > 2.6) { d.y = 0; d.r = 0.25 + Math.random() * 0.7; }
      const spread = d.r * (1 + burst * 0.5);
      pPos[i * 3] = Math.cos(d.a) * spread;
      pPos[i * 3 + 1] = d.y;
      pPos[i * 3 + 2] = Math.sin(d.a) * spread;
    }
    pGeo.attributes.position.needsUpdate = true;
    pMat.opacity = Math.min(1, 0.12 + cur.energy * 0.32 + burst * 0.4);

    const sx = (Math.random() - 0.5) * 0.05 * shake, sy = (Math.random() - 0.5) * 0.05 * shake;
    camera.position.set(sx, 2.3 + sy + cur.fly * 0.2, cur.cam);
    camLook.y = 0.9 + cur.fly * 0.32;
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return { setMode };
}

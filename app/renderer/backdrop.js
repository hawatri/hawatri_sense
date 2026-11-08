// HawatriSense - procedural sci-fi corridor backdrop, by Kia Hawatri
// Painted once per resize on a canvas: a dark teal hallway receding to a vanishing point, with
// lit wall panels, glowing floor slabs and a haze at the far end. Original artwork (no images).

export function paintBackdrop(canvas) {
  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    const vx = W * 0.4, vy = H * 0.4; // vanishing point (behind the robot)
    // base: deep navy-teal, darker toward the far end of the corridor
    const base = g.createRadialGradient(vx, vy, 0, vx, vy, Math.max(W, H));
    base.addColorStop(0, '#01070a'); base.addColorStop(0.2, '#02151b'); base.addColorStop(0.55, '#05282f'); base.addColorStop(1, '#021419');
    g.fillStyle = base; g.fillRect(0, 0, W, H);

    // perspective helper: point at depth z (0 = viewer plane, 1 = vanishing point)
    const P = (x, y, z) => [vx + (x - vx) * (1 - z), vy + (y - vy) * (1 - z)];
    const quad = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };

    const depths = [0, 0.32, 0.52, 0.66, 0.76, 0.83, 0.88, 0.92, 0.95];
    g.filter = 'blur(2.5px)';
    // floor slabs with glowing front edges
    for (let i = 0; i < depths.length - 1; i++) {
      const z0 = depths[i], z1 = depths[i + 1] - 0.02;
      for (let s = -3; s <= 3; s++) {
        const x0 = vx + s * W * 0.26, x1 = x0 + W * 0.24;
        const a = P(x0, H * 1.25, z0), b = P(x1, H * 1.25, z0), c = P(x1, H * 1.25, z1), d = P(x0, H * 1.25, z1);
        const lit = 0.02 + rnd() * 0.06;
        quad([a, b, c, d], `rgba(20, 110, 130, ${lit})`);
        if (rnd() > 0.7) { // bright edge strip
          g.strokeStyle = `rgba(60, 220, 240, ${0.12 + rnd() * 0.3})`; g.lineWidth = 2 * (1 - z0) + 0.5;
          g.beginPath(); g.moveTo(...d); g.lineTo(...c); g.stroke();
        }
      }
    }
    // side walls: stacked panels, some lit
    for (const side of [-1, 1]) {
      for (let i = 0; i < depths.length - 1; i++) {
        const z0 = depths[i], z1 = depths[i + 1] - 0.015;
        for (let r = 0; r < 4; r++) {
          const y0 = -H * 0.3 + r * H * 0.38, y1 = y0 + H * 0.32;
          const x = side < 0 ? -W * 0.15 : W * 1.15;
          const a = P(x, y0, z0), b = P(x, y0, z1), c = P(x, y1, z1), d = P(x, y1, z0);
          quad([a, b, c, d], `rgba(12, 80, 96, ${0.04 + rnd() * 0.1})`);
          if (rnd() > 0.68) {
            const m0 = P(x, y0 + (y1 - y0) * 0.45, z0), m1 = P(x, y0 + (y1 - y0) * 0.45, z1);
            g.strokeStyle = `rgba(70, 225, 245, ${0.18 + rnd() * 0.3})`; g.lineWidth = 3 * (1 - z0) + 0.6;
            g.beginPath(); g.moveTo(...m0); g.lineTo(...m1); g.stroke();
          }
        }
      }
    }
    // ceiling beams
    for (let i = 1; i < depths.length - 1; i++) {
      const z = depths[i];
      const a = P(-W * 0.15, -H * 0.3, z), b = P(W * 1.15, -H * 0.3, z);
      g.strokeStyle = `rgba(40, 170, 190, ${0.04 + 0.08 * (1 - z)})`; g.lineWidth = 6 * (1 - z) + 1;
      g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    }
    g.filter = 'none';
    // far-end haze and soft vignette
    const haze = g.createRadialGradient(vx, vy * 1.05, 0, vx, vy * 1.05, W * 0.45);
    haze.addColorStop(0, 'rgba(40, 190, 210, .16)'); haze.addColorStop(0.5, 'rgba(20, 120, 140, .08)'); haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = haze; g.fillRect(0, 0, W, H);
    const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0, 6, 9, .65)');
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
  };
  new ResizeObserver(draw).observe(canvas);
  draw();
}

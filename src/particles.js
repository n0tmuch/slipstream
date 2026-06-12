// particles.js — 2D additive overlay, two layers:
//  - sparks/bursts: spawned in CSS-pixel screen space
//  - stardust: spawned in WORLD space, projected every frame, so the trail
//    recedes and parallaxes as the camera flies past it (sells 3D depth)

const MAX = 600;
const DUST_MAX = 400;

export function createParticles(canvas) {
  const ctx = canvas.getContext('2d');
  const pool = [];
  const dust = [];
  let dpr = 1;

  function resize(cssW, cssH, ratio) {
    dpr = ratio;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function spawn(x, y, opts = {}) {
    if (pool.length >= MAX) pool.shift();
    const a = opts.angle ?? Math.random() * Math.PI * 2;
    const sp = (opts.speed ?? 120) * (0.4 + Math.random() * 0.9);
    pool.push({
      x, y,
      vx: Math.cos(a) * sp + (opts.vx ?? 0),
      vy: Math.sin(a) * sp + (opts.vy ?? 0),
      life: 0,
      ttl: (opts.ttl ?? 0.5) * (0.6 + Math.random() * 0.8),
      size: (opts.size ?? 2.5) * (0.5 + Math.random()),
      color: opts.color ?? '255,40,220', // magenta default
      drag: opts.drag ?? 2.2,
    });
  }

  function burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) spawn(x, y, opts);
  }

  function spawnDust(x, y, z) {
    if (dust.length >= DUST_MAX) dust.shift();
    dust.push({
      x: x + (Math.random() - 0.5) * 0.24,
      y: y + (Math.random() - 0.5) * 0.24,
      z: z + (Math.random() - 0.5) * 0.2,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      vz: -1.2 - Math.random() * 1.0, // drift backward off the mote
      life: 0,
      ttl: 0.45 + Math.random() * 0.55,
    });
  }

  function update(dt) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life += dt;
      if (d.life >= d.ttl) { dust.splice(i, 1); continue; }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
    }
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life += dt;
      if (p.life >= p.ttl) { pool.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // project: (worldPos[3]) => {x, y} in CSS px, or null if behind camera
  function draw(project) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.globalCompositeOperation = 'lighter';
    if (project) {
      for (const d of dust) {
        const pos = project([d.x, d.y, d.z]);
        if (!pos) continue;
        const f = 1 - d.life / d.ttl;
        ctx.fillStyle = `rgba(185,242,255,${(f * 0.4).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 0.9 + f * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of pool) {
      const f = 1 - p.life / p.ttl;
      ctx.fillStyle = `rgba(${p.color},${(f * 0.9).toFixed(3)})`;
      const s = p.size * (0.5 + f);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function clear() { pool.length = 0; dust.length = 0; }

  return { resize, spawn, burst, spawnDust, update, draw, clear, count: () => pool.length + dust.length };
}

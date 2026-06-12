// particles.js — 2D additive overlay for sparks, bursts, and trails.
// Positions arrive already projected to CSS pixels.

const MAX = 600;

export function createParticles(canvas) {
  const ctx = canvas.getContext('2d');
  const pool = [];
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

  function update(dt) {
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

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.globalCompositeOperation = 'lighter';
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

  function clear() { pool.length = 0; }

  return { resize, spawn, burst, update, draw, clear, count: () => pool.length };
}

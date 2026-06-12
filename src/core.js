// core.js — pure game logic. No DOM, no WebGL, no audio. Tests import only this file.
// NOTE: canyonCenter/canyonRadius/difficultyEnv are mirrored in GLSL in render_gl.js.

export const VERSION = '0.5.0';

// Difficulty: shapes both the canyon (envK = how fast it tightens/wanders with
// distance, shrink = how narrow it ends up, wander = bend amplitude) and the
// speed curve. 'flow' is the original tuning; defaults below keep it that way.
export const DIFFICULTY = {
  glide: { key: 'glide', envK: 0.0011, shrink: 0.16, wander: 0.78, speedBase: 22, speedRamp: 46, rampT: 95, tail: 0.07 },
  flow:  { key: 'flow',  envK: 0.0018, shrink: 0.28, wander: 1.00, speedBase: 26, speedRamp: 64, rampT: 75, tail: 0.16 },
  surge: { key: 'surge', envK: 0.0028, shrink: 0.34, wander: 1.15, speedBase: 32, speedRamp: 84, rampT: 55, tail: 0.26 },
};

export const BASE_RADIUS = 6.0;
export const WALL_MARGIN = 0.35; // gameplay margin under the visual fbm bumps
export const MULT_MAX = 12;

// ---------- seeded RNG ----------

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailySeedString(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- canyon ----------

export function makeCanyon(seedStr, diff = DIFFICULTY.flow) {
  const rand = mulberry32(hashSeed(seedStr));
  const harm = (n, aLo, aHi, fLo, fHi) =>
    Array.from({ length: n }, () => ({
      a: aLo + rand() * (aHi - aLo),
      f: fLo + rand() * (fHi - fLo),
      p: rand() * Math.PI * 2,
    }));
  return {
    seed: seedStr,
    cx: harm(4, 0.8, 2.6, 0.010, 0.060),
    cy: harm(4, 0.6, 2.0, 0.012, 0.070),
    r: harm(3, 0.4, 1.1, 0.020, 0.080),
    baseRadius: BASE_RADIUS,
    envK: diff.envK,
    shrink: diff.shrink,
    wander: diff.wander,
  };
}

export function difficultyEnv(z, k = DIFFICULTY.flow.envK) {
  return 1 - Math.exp(-z * k);
}

function sumHarm(hs, z) {
  let s = 0;
  for (const h of hs) s += h.a * Math.sin(h.f * z + h.p);
  return s;
}

export function canyonCenter(canyon, z) {
  const e = (0.25 + 0.75 * difficultyEnv(z, canyon.envK)) * (canyon.wander ?? 1);
  return { x: sumHarm(canyon.cx, z) * e, y: sumHarm(canyon.cy, z) * e };
}

export function canyonRadius(canyon, z) {
  const e = difficultyEnv(z, canyon.envK);
  const r = canyon.baseRadius * (1 - (canyon.shrink ?? 0.28) * e) + sumHarm(canyon.r, z);
  return Math.max(2.2, r);
}

// Signed clearance to the playable wall (analytic radius minus margin).
// <= 0 means collision.
export function wallDistance(canyon, x, y, z) {
  const c = canyonCenter(canyon, z);
  const d = Math.hypot(x - c.x, y - c.y);
  return canyonRadius(canyon, z) - WALL_MARGIN - d;
}

// ---------- speed & scoring ----------

// Ramps quickly early, then keeps climbing forever (linear tail).
export function speedAt(t, diff = DIFFICULTY.flow) {
  return diff.speedBase + diff.speedRamp * (1 - Math.exp(-t / diff.rampT)) + t * diff.tail;
}

export function createScore() {
  return { distance: 0, score: 0, mult: 1, peakMult: 1, nearMissTime: 0 };
}

// Score accrues as the integral of speed × current multiplier, so final
// score ≈ distance × average multiplier. Returns true while skimming.
export function updateScore(s, dt, speed, wallDist, threshold) {
  s.distance += speed * dt;
  const near = wallDist >= 0 && wallDist < threshold;
  if (near) {
    const depth = 1 - wallDist / threshold; // deeper graze builds faster
    s.mult = Math.min(MULT_MAX, s.mult + dt * (0.9 + 2.6 * depth));
    s.nearMissTime += dt;
  } else {
    s.mult = Math.max(1, s.mult - dt * 0.55);
  }
  if (s.mult > s.peakMult) s.peakMult = s.mult;
  s.score += speed * dt * s.mult;
  return near;
}

// ---------- palette drift ----------

// Wall-tint hue (degrees) vs distance. Zone 0→1 is constant base cyan so the
// game always starts classic; then 2km zones ease azure → violet → cyan → teal.
// The void stays indigo and magenta stays the reward color — only this drifts.
export const HUE_BASE = 187;
// violet capped at 265° to keep clear daylight from magenta (~310°), the reward color
export const HUE_ANCHORS = [187, 187, 222, 265, 187, 160];
export const HUE_ZONE_M = 2000;

export function wallHueAt(z) {
  const n = HUE_ANCHORS.length;
  const f = Math.max(0, z) / HUE_ZONE_M;
  const i = Math.floor(f) % n;
  const t = f - Math.floor(f);
  const s = t * t * (3 - 2 * t);
  const a = HUE_ANCHORS[i], b = HUE_ANCHORS[(i + 1) % n];
  const d = ((b - a + 540) % 360) - 180; // shortest-path hue blend
  return (a + d * s + 360) % 360;
}

// ---------- daily streak ----------

function utcDayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// prevStreak: stored streak count; lastDate: last daily-run date string or null.
export function updateStreak(prevStreak, lastDate, today) {
  if (!lastDate) return 1;
  if (lastDate === today) return Math.max(1, prevStreak);
  if (utcDayNumber(today) - utcDayNumber(lastDate) === 1) return prevStreak + 1;
  return 1;
}

// ---------- share card ----------

export function shareCard({ mode, dateStr, distance, peakMult, streak, best, difficulty = 'flow' }) {
  const m = Math.floor(distance);
  // log-scaled bar: full at ~30km
  const frac = Math.max(0, Math.min(1, Math.log10(1 + m) / 4.5));
  const filled = Math.round(frac * 10);
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const lines = [
    `🛸 SLIPSTREAM ${mode === 'daily' ? dateStr : '∞ endless'} · ${difficulty.toUpperCase()}`,
    `${bar} ${m.toLocaleString('en-US')}m`,
    `⚡ x${peakMult.toFixed(1)} peak`,
  ];
  if (mode === 'daily' && streak > 1) lines.push(`🔥 ${streak}-day streak`);
  if (best) lines.push(`🏆 new best`);
  return lines.join('\n');
}

// main.js — game state machine, physics, feel variants, camera, HUD, share.
import {
  VERSION, dailySeedString, makeCanyon, canyonCenter, canyonRadius,
  wallDistance, speedAt, createScore, updateScore, updateStreak, shareCard,
  WALL_MARGIN, MULT_MAX, wallHueAt, HUE_BASE, DIFFICULTY,
} from './core.js';
import { createGLRenderer } from './render_gl.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';

// ---------- feel variants (debug panel, ` key) ----------
const FEEL = {
  A: { name: 'A · floaty',  gravity: 16, lift: 38, maxFall: 14, maxRise: 12, vDamp: 1.6, steer: 3.4, threshold: 1.7 },
  B: { name: 'B · tight',   gravity: 34, lift: 82, maxFall: 22, maxRise: 20, vDamp: 3.6, steer: 4.6, threshold: 1.05 },
  C: { name: 'C · heavy',   gravity: 24, lift: 46, maxFall: 30, maxRise: 24, vDamp: 0.5, steer: 2.6, threshold: 1.35 },
};

const LS = (k) => 'slipstream.' + k;
const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(LS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch {} },
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const fxCanvas = $('fx');
const hud = $('hud'), hudScore = $('hud-score'), hudMult = $('hud-mult'), hudDist = $('hud-dist');
const titleOv = $('title'), deadOv = $('dead');
const debugPanel = $('debug');

let sceneCanvas = $('scene');
function freshSceneCanvas() {
  const c = sceneCanvas.cloneNode(false);
  sceneCanvas.replaceWith(c);
  sceneCanvas = c;
  return c;
}

// ---------- state ----------
let renderer = null;
let particles = createParticles(fxCanvas);
let audio = createAudio();
let state = 'boot'; // boot | title | playing | hitstop | dead
let mode = store.get('mode', 'daily');
let feelKey = store.get('feel', 'B');
let diffKey = store.get('difficulty', 'flow');
let hueDrift = store.get('hueDrift', true); // off = classic all-cyan (v0.1.0 look)
let godMode = false;
let hold = false;
let run = null;
let attractZ = 0;
let camX = 0, camY = 0, fov = 72;
let near01 = 0, shake = 0, flash = 0, deathGlow = 0, hitstopT = 0, deadAt = 0;
let lastTime = 0, fpsEma = 60, frameCount = 0;
let cssW = 0, cssH = 0, dpr = 1;
let titleCanyon = null;

function feel() { return FEEL[feelKey]; }
function diff() { return DIFFICULTY[diffKey] || DIFFICULTY.flow; }

function currentSeed() {
  return mode === 'daily' ? dailySeedString() : 'endless-' + Math.random().toString(36).slice(2, 10);
}

// ---------- sizing ----------
function resize() {
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  if (renderer) renderer.resize(cssW * dpr, cssH * dpr);
  particles.resize(cssW, cssH, dpr);
}
window.addEventListener('resize', resize);

// ---------- renderer selection: timed probe, fall back to Three.js ----------
function probeGL(r, canyon) {
  r.setCanyon(canyon);
  const st = {
    time: 0, camPos: [0, 0, 2], lookAt: [0, 0, 12], fovDeg: 72,
    player: [0, 0, 9], speed01: 0.5, near01: 0, death: 0,
    ca: 0.004, streak: 0.01, flash: 0, dim: 1, tint: [0.1, 0.95, 1],
  };
  r.render(st); r.readPixel(); // warm up compile
  const t0 = performance.now();
  const N = 8;
  for (let i = 0; i < N; i++) { st.time = i * 0.016; r.render(st); }
  r.readPixel(); // force GPU sync
  return (performance.now() - t0) / N;
}

async function chooseRenderer(canyon) {
  let r = null;
  try {
    r = createGLRenderer(freshSceneCanvas());
    r.resize(cssW * dpr, cssH * dpr);
    let ms = probeGL(r, canyon);
    if (ms > 26) {
      r.setScale(0.55);
      ms = probeGL(r, canyon);
    }
    if (ms > 30) throw new Error(`gpu too slow: ${ms.toFixed(1)}ms/frame`);
    console.info(`slipstream: raymarch renderer, probe ${ms.toFixed(1)}ms/frame, scale ${r.getScale()}`);
    return r;
  } catch (e) {
    console.info('slipstream: falling back to ring renderer —', e.message || e);
    if (r) { try { r.dispose(); } catch {} }
    const three = await createThreeFallback();
    return three;
  }
}

async function createThreeFallback() {
  const { createThreeRenderer } = await import('./render_three.js');
  const r = await createThreeRenderer(freshSceneCanvas());
  r.resize(cssW * dpr, cssH * dpr);
  return r;
}

// ---------- run lifecycle ----------
function startRun() {
  const seed = currentSeed();
  const canyon = makeCanyon(seed, diff());
  renderer.setCanyon(canyon);
  const c0 = canyonCenter(canyon, 0);
  run = {
    seed, canyon,
    diff: diff(), diffKey,
    score: createScore(),
    t: 0, z: 0,
    px: c0.x, py: c0.y, vy: 0,
    nearWas: false, nearTimer: 0, sparkAcc: 0,
  };
  camX = c0.x; camY = c0.y;
  near01 = 0; shake = 0; flash = 0; deathGlow = 0;
  particles.clear();
  audio.resetLadder();
  state = 'playing';
  titleOv.classList.add('hidden');
  deadOv.classList.add('hidden');
  hud.classList.remove('hidden');
}

function die() {
  state = 'hitstop';
  hitstopT = 0.115;
  flash = 0.9;
  deathGlow = 1;
  audio.death();
}

function finishDeath() {
  state = 'dead';
  deadAt = performance.now();
  shake = 1.5;
  const pos = renderer.project([run.px, run.py, run.z], cssW, cssH) || { x: cssW / 2, y: cssH / 2 };
  particles.burst(pos.x, pos.y, 60, { color: '255,40,220', speed: 360, ttl: 0.9, size: 3.2, drag: 2.8 });
  particles.burst(pos.x, pos.y, 50, { color: '60,240,255', speed: 280, ttl: 1.1, size: 2.6, drag: 2.2 });

  // bests + streak
  const s = run.score;
  const today = dailySeedString();
  let isBest = false, streak = 0;
  const prev = bestFor(mode, today, run.diffKey);
  isBest = s.score > prev;
  if (isBest) store.set(bestKey(mode, today, run.diffKey), Math.floor(s.score));
  if (mode === 'daily') {
    // streak counts any daily run, on any difficulty
    const lastDate = store.get('daily.last', null);
    streak = updateStreak(store.get('daily.streak', 0), lastDate, today);
    store.set('daily.streak', streak);
    store.set('daily.last', today);
  }
  run.isBest = isBest;
  run.streak = streak;

  $('dead-score').textContent = Math.floor(s.score).toLocaleString('en-US');
  $('dead-detail').textContent =
    `${Math.floor(s.distance).toLocaleString('en-US')}m · ⚡x${s.peakMult.toFixed(1)} peak`;
  $('dead-best').textContent = isBest ? '🏆 new best' :
    `best ${bestFor(mode, today, run.diffKey).toLocaleString('en-US')}`;
  $('dead-streak').textContent = mode === 'daily' && streak > 1 ? `🔥 ${streak}-day streak` : '';
  setTimeout(() => deadOv.classList.remove('hidden'), 650);
}

// ---------- input ----------
function press() {
  audio.start();
  if (state === 'title') { startRun(); hold = true; }
  else if (state === 'dead' && performance.now() - deadAt > 600) { startRun(); hold = true; }
  else if (state === 'playing') hold = true;
}
function release() { hold = false; }

window.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) press(); });
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Backquote') { debugPanel.classList.toggle('hidden'); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  press();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Backquote' || e.code === 'KeyM') return;
  release();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- UI buttons ----------
function toggleMute() {
  const m = !audio.isMuted();
  audio.setMuted(m);
  store.set('muted', m);
  $('mute').textContent = m ? '🔇' : '🔊';
}
$('mute').addEventListener('click', (e) => { e.stopPropagation(); audio.start(); toggleMute(); });

// per-difficulty bests; pre-0.3.0 saves count as flow's
function bestKey(m, today, dk) {
  return m === 'daily' ? `best.daily.${today}.${dk}` : `best.endless.${dk}`;
}
function bestFor(m, today, dk) {
  let best = store.get(bestKey(m, today, dk), 0);
  if (dk === 'flow') {
    const legacy = store.get(m === 'daily' ? 'best.daily.' + today : 'best.endless', 0);
    best = Math.max(best, legacy);
  }
  return best;
}

function updateModeButtons() {
  for (const el of document.querySelectorAll('[data-mode]')) {
    el.classList.toggle('active', el.dataset.mode === mode);
  }
  $('title-stats').textContent = statsLine();
}
function statsLine() {
  const today = dailySeedString();
  const best = bestFor(mode, today, diffKey);
  if (mode === 'daily') {
    const streak = store.get('daily.streak', 0);
    return `${today} · ${diffKey} best ${best.toLocaleString('en-US')}` + (streak > 1 ? ` · 🔥${streak}` : '');
  }
  return `endless · ${diffKey} best ${best.toLocaleString('en-US')}`;
}
for (const el of document.querySelectorAll('[data-mode]')) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    mode = el.dataset.mode;
    store.set('mode', mode);
    updateModeButtons();
  });
}

function updateDiffButtons() {
  for (const el of document.querySelectorAll('[data-diff]')) {
    el.classList.toggle('active', el.dataset.diff === diffKey);
  }
  $('title-stats').textContent = statsLine();
}
for (const el of document.querySelectorAll('[data-diff]')) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    diffKey = el.dataset.diff;
    store.set('difficulty', diffKey);
    updateDiffButtons();
    if (state === 'title') titleCanyon = makeCanyon(currentSeed(), diff());
  });
}

$('again').addEventListener('click', (e) => { e.stopPropagation(); startRun(); });
$('share').addEventListener('click', async (e) => {
  e.stopPropagation();
  const s = run.score;
  const card = shareCard({
    mode, dateStr: dailySeedString(), distance: s.distance,
    peakMult: s.peakMult, streak: run.streak || 0, best: !!run.isBest,
    difficulty: run.diffKey,
  });
  try {
    await navigator.clipboard.writeText(card);
    $('share').textContent = 'copied ✓';
  } catch {
    $('share').textContent = 'copy failed';
  }
  setTimeout(() => { $('share').textContent = 'share'; }, 1500);
});

// debug panel
for (const k of Object.keys(FEEL)) {
  const btn = document.createElement('button');
  btn.textContent = FEEL[k].name;
  btn.dataset.feel = k;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    feelKey = k;
    store.set('feel', k);
    updateFeelButtons();
  });
  $('debug-feels').appendChild(btn);
}
function updateFeelButtons() {
  for (const el of document.querySelectorAll('[data-feel]')) {
    el.classList.toggle('active', el.dataset.feel === feelKey);
  }
}
$('debug-god').addEventListener('change', (e) => { godMode = e.target.checked; });
$('debug-hue').checked = hueDrift;
$('debug-hue').addEventListener('change', (e) => {
  hueDrift = e.target.checked;
  store.set('hueDrift', hueDrift);
});

// electric palette: hue in degrees → rgb at full glow saturation
function hsv(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}
function tintAt(z) {
  return hsv(hueDrift ? wallHueAt(z) : HUE_BASE, 0.9, 1);
}

// ---------- per-frame update ----------
function update(dt, time) {
  const f = feel();

  if (state === 'hitstop') {
    hitstopT -= dt;
    if (hitstopT <= 0) finishDeath();
  }

  if (state === 'playing') {
    const speed = speedAt(run.t, run.diff);
    run.t += dt;
    run.z += speed * dt;

    // lateral auto-steer with lag — sharp bends push you toward side walls
    const c = canyonCenter(run.canyon, run.z);
    run.px += (c.x - run.px) * (1 - Math.exp(-f.steer * dt));

    // one-button vertical: hold = rise, release = dive
    const accel = (hold ? f.lift : 0) - f.gravity - f.vDamp * run.vy;
    run.vy = Math.max(-f.maxFall, Math.min(f.maxRise, run.vy + accel * dt));
    run.py += run.vy * dt;

    const wd = wallDistance(run.canyon, run.px, run.py, run.z);
    const near = updateScore(run.score, dt, speed, wd, f.threshold);
    const speed01 = Math.max(0, Math.min(1, (speed - run.diff.speedBase) / 110));
    audio.setSpeed(speed01);

    // near-miss events: rising edge + every 0.45s sustained
    if (near) {
      if (!run.nearWas) { audio.nearMiss(); run.nearTimer = 0; }
      run.nearTimer += dt;
      if (run.nearTimer > 0.45) { audio.nearMiss(); run.nearTimer = 0; }
      const depth = 1 - wd / f.threshold;
      near01 += (Math.min(1, depth * 1.3) - near01) * Math.min(1, dt * 10);
      shake = Math.max(shake, 0.06 * depth);

      // magenta sparks at the graze point
      run.sparkAcc += dt * (14 + 50 * depth);
      while (run.sparkAcc >= 1) {
        run.sparkAcc -= 1;
        const dx = run.px - c.x, dy = run.py - c.y;
        const dl = Math.hypot(dx, dy) || 1;
        const r = canyonRadius(run.canyon, run.z) - WALL_MARGIN;
        const wall = [c.x + (dx / dl) * r, c.y + (dy / dl) * r, run.z + 0.5];
        const pos = renderer.project(wall, cssW, cssH);
        if (pos) particles.spawn(pos.x, pos.y, {
          color: '255,40,220', speed: 90 + 220 * depth, ttl: 0.45, size: 2.2,
          vx: 0, vy: 30,
        });
      }
    } else {
      near01 += (0 - near01) * Math.min(1, dt * 5);
      if (run.score.mult <= 1.001) audio.resetLadder();
    }
    run.nearWas = near;

    if (wd <= 0 && !godMode) die();
  }

  if (state === 'title') {
    attractZ += 18 * dt;
  }

  // decay envelopes
  shake *= Math.exp(-dt * 5.5);
  flash *= Math.exp(-dt * 7);
  deathGlow *= Math.exp(-dt * 2.5);

  particles.update(dt);
}

function render(time) {
  let player, z, speed01;
  if (state === 'title') {
    z = attractZ;
    const c = canyonCenter(titleCanyon, z);
    player = [c.x, c.y, z];
    speed01 = 0.12;
    if (renderer) renderer.setCanyon(titleCanyon);
  } else {
    z = run.z;
    player = [run.px, run.py, run.z];
    speed01 = Math.max(0, Math.min(1, (speedAt(run.t, run.diff) - run.diff.speedBase) / 110));
  }

  // eased chase camera
  const camZ = z - 7;
  const cc = canyonCenter(state === 'title' ? titleCanyon : run.canyon, camZ);
  const tx = cc.x + (player[0] - cc.x) * 0.55;
  const ty = cc.y + (player[1] - cc.y) * 0.55 + 0.4;
  const ease = 1 - Math.exp(-6 * (1 / 60));
  camX += (tx - camX) * ease;
  camY += (ty - camY) * ease;
  const sx = (Math.random() - 0.5) * 2 * shake;
  const sy = (Math.random() - 0.5) * 2 * shake;

  const targetFov = 70 + 16 * speed01 + 7 * near01; // subtle fov-kick
  fov += (targetFov - fov) * 0.08;

  const ahead = canyonCenter(state === 'title' ? titleCanyon : run.canyon, z + 9);
  renderer.render({
    time: time / 1000,
    camPos: [camX + sx, camY + sy, camZ],
    lookAt: [(player[0] + ahead.x) / 2, (player[1] + ahead.y) / 2, z + 9],
    fovDeg: fov,
    player,
    speed01,
    near01,
    death: deathGlow,
    ca: 0.0025 + speed01 * 0.011 + deathGlow * 0.02,
    streak: 0.003 + speed01 * 0.016,
    flash,
    dim: state === 'dead' ? 0.55 : 1,
    tint: tintAt(z),
  });
  particles.draw();
}

// ---------- HUD + adaptive quality ----------
function hudTick() {
  if (state === 'playing' || state === 'hitstop') {
    const s = run.score;
    hudScore.textContent = Math.floor(s.score).toLocaleString('en-US');
    hudMult.textContent = 'x' + s.mult.toFixed(1);
    hudMult.classList.toggle('hot', s.mult > 1.5);
    hudDist.textContent = Math.floor(s.distance).toLocaleString('en-US') + 'm';
  }
  if (!debugPanel.classList.contains('hidden')) {
    $('debug-stats').textContent =
      `${fpsEma.toFixed(0)}fps · ${renderer.kind} @${renderer.getScale().toFixed(2)} · ` +
      (run ? `${run.diffKey} v=${speedAt(run.t, run.diff).toFixed(0)} mult=${run.score.mult.toFixed(2)}` : 'attract') +
      ` · particles=${particles.count()}`;
  }
}

function adaptQuality() {
  if (renderer.kind !== 'gl') return;
  const s = renderer.getScale();
  if (fpsEma < 50 && s > 0.4) renderer.setScale(Math.max(0.4, s - 0.15));
  else if (fpsEma > 58 && s < 1) renderer.setScale(Math.min(1, s + 0.05));
}

// ---------- main loop ----------
function frame(time) {
  requestAnimationFrame(frame);
  if (!lastTime) { lastTime = time; return; }
  let dt = (time - lastTime) / 1000;
  lastTime = time;
  if (dt > 0.05) dt = 0.05;
  if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.05;
  frameCount++;
  if (frameCount % 150 === 0) adaptQuality();

  update(dt, time);
  render(time);
  hudTick();
}

// ---------- boot ----------
async function boot() {
  resize();
  titleCanyon = makeCanyon(currentSeed(), diff());
  renderer = await chooseRenderer(titleCanyon);
  audio.setMuted(store.get('muted', false));
  $('mute').textContent = store.get('muted', false) ? '🔇' : '🔊';
  $('version').textContent = 'v' + VERSION;
  $('title-date').textContent = dailySeedString();
  updateModeButtons();
  updateDiffButtons();
  updateFeelButtons();
  state = 'title';
  titleOv.classList.remove('hidden');
  requestAnimationFrame(frame);
}

boot();

// dev hook for the headless verify harness — not a public API
window.__slip = {
  warp(z) {
    if (!run) return;
    run.z = z;
    const c = canyonCenter(run.canyon, z);
    run.px = c.x; run.py = c.y; run.vy = 0;
    camX = c.x; camY = c.y;
  },
  god(v) { godMode = !!v; },
  hue(v) { hueDrift = !!v; },
};

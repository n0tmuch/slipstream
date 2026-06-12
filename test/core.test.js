import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSeed, mulberry32, dailySeedString, makeCanyon,
  canyonCenter, canyonRadius, wallDistance, speedAt,
  createScore, updateScore, updateStreak, shareCard,
  wallHueAt, HUE_BASE, HUE_ANCHORS, HUE_ZONE_M, DIFFICULTY,
  BASE_RADIUS, WALL_MARGIN, MULT_MAX,
} from '../src/core.js';

test('dailySeedString uses UTC date', () => {
  // 2026-06-11 23:30 UTC stays June 11; local timezones must not leak in.
  const d = new Date(Date.UTC(2026, 5, 11, 23, 30));
  assert.equal(dailySeedString(d), '2026-06-11');
  const early = new Date(Date.UTC(2026, 0, 2, 0, 0, 1));
  assert.equal(dailySeedString(early), '2026-01-02');
});

test('hashSeed and mulberry32 are deterministic', () => {
  assert.equal(hashSeed('2026-06-11'), hashSeed('2026-06-11'));
  assert.notEqual(hashSeed('2026-06-11'), hashSeed('2026-06-12'));
  const a = mulberry32(12345), b = mulberry32(12345);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('same date seed → identical canyon, sampled along 10km', () => {
  const c1 = makeCanyon('2026-06-11');
  const c2 = makeCanyon('2026-06-11');
  assert.deepEqual(c1, c2);
  for (let z = 0; z <= 10000; z += 37) {
    assert.deepEqual(canyonCenter(c1, z), canyonCenter(c2, z));
    assert.equal(canyonRadius(c1, z), canyonRadius(c2, z));
  }
});

test('different seeds → different canyons', () => {
  const c1 = makeCanyon('2026-06-11');
  const c2 = makeCanyon('2026-06-12');
  let diff = 0;
  for (let z = 0; z <= 1000; z += 50) {
    const a = canyonCenter(c1, z), b = canyonCenter(c2, z);
    if (a.x !== b.x || a.y !== b.y) diff++;
  }
  assert.ok(diff > 15, 'canyons should diverge almost everywhere');
});

test('canyon radius stays flyable forever', () => {
  const c = makeCanyon('worst-case-check');
  for (let z = 0; z <= 200000; z += 13) {
    const r = canyonRadius(c, z);
    assert.ok(r >= 2.2, `radius ${r} too small at z=${z}`);
    assert.ok(r <= BASE_RADIUS + 3.5, `radius ${r} too big at z=${z}`);
  }
});

test('wallDistance: center is safe, outside wall collides', () => {
  const c = makeCanyon('2026-06-11');
  const z = 500;
  const ctr = canyonCenter(c, z);
  assert.ok(wallDistance(c, ctr.x, ctr.y, z) > 0);
  const r = canyonRadius(c, z);
  assert.ok(wallDistance(c, ctr.x + r, ctr.y, z) <= 0, 'at analytic radius → collision');
  // exactly at the margin boundary
  assert.ok(Math.abs(wallDistance(c, ctr.x + r - WALL_MARGIN, ctr.y, z)) < 1e-9);
});

test('speed ramps up forever', () => {
  assert.ok(speedAt(0) > 0);
  let prev = 0;
  for (const t of [0, 10, 60, 300, 1200, 9000]) {
    const v = speedAt(t);
    assert.ok(v > prev, `speed must increase: ${v} at t=${t}`);
    prev = v;
  }
});

test('scoring: multiplier builds while skimming, decays when safe, never below 1', () => {
  const s = createScore();
  // 2 seconds of deep skimming at speed 50
  for (let i = 0; i < 120; i++) updateScore(s, 1 / 60, 50, 0.2, 1.5);
  assert.ok(s.mult > 3, `mult should build, got ${s.mult}`);
  assert.ok(s.mult <= MULT_MAX);
  const peak = s.peakMult;
  assert.equal(peak, s.mult);
  // 20 seconds safely in the middle
  for (let i = 0; i < 1200; i++) updateScore(s, 1 / 60, 50, 5, 1.5);
  assert.equal(s.mult, 1);
  assert.equal(s.peakMult, peak, 'peak is sticky');
  assert.ok(Math.abs(s.distance - (122 * 50) / 60 - (1200 * 50) / 60 + 2 * 50 / 60) < 1.0);
});

test('scoring: score ≈ distance × avg multiplier and beats unmultiplied distance', () => {
  const s = createScore();
  for (let i = 0; i < 600; i++) updateScore(s, 1 / 60, 60, 0.3, 1.5);
  assert.ok(s.score > s.distance, 'skimming must outscore raw distance');
  const s2 = createScore();
  for (let i = 0; i < 600; i++) updateScore(s2, 1 / 60, 60, 5, 1.5);
  assert.ok(Math.abs(s2.score - s2.distance) < 1e-6, 'mult=1 → score == distance');
});

test('multiplier caps at MULT_MAX', () => {
  const s = createScore();
  for (let i = 0; i < 6000; i++) updateScore(s, 1 / 60, 50, 0.01, 1.5);
  assert.equal(s.mult, MULT_MAX);
});

test('streak: consecutive days increment, gaps reset, same day idempotent', () => {
  assert.equal(updateStreak(0, null, '2026-06-11'), 1);
  assert.equal(updateStreak(1, '2026-06-10', '2026-06-11'), 2);
  assert.equal(updateStreak(5, '2026-06-11', '2026-06-11'), 5);
  assert.equal(updateStreak(7, '2026-06-08', '2026-06-11'), 1);
  // month boundary
  assert.equal(updateStreak(3, '2026-05-31', '2026-06-01'), 4);
  // year boundary
  assert.equal(updateStreak(9, '2025-12-31', '2026-01-01'), 10);
});

test('difficulty: glide is slower and roomier than flow; surge faster and tighter', () => {
  const { glide, flow, surge } = DIFFICULTY;
  for (const t of [0, 30, 120, 600]) {
    assert.ok(speedAt(t, glide) < speedAt(t, flow), `glide slower at t=${t}`);
    assert.ok(speedAt(t, flow) < speedAt(t, surge), `surge faster at t=${t}`);
  }
  const seed = '2026-06-11';
  const cg = makeCanyon(seed, glide), cf = makeCanyon(seed, flow), cs = makeCanyon(seed, surge);
  // deep in: glide never narrower than flow, surge never wider (the 2.2m
  // radius floor can make them momentarily equal); surge wanders hardest
  for (let z = 3000; z <= 12000; z += 500) {
    assert.ok(canyonRadius(cg, z) >= canyonRadius(cf, z), `glide narrower at z=${z}`);
    assert.ok(canyonRadius(cs, z) <= canyonRadius(cf, z), `surge wider at z=${z}`);
    const g = canyonCenter(cg, z), s = canyonCenter(cs, z);
    assert.ok(Math.hypot(s.x, s.y) >= Math.hypot(g.x, g.y), `surge wanders more at z=${z}`);
  }
  assert.ok(canyonRadius(cg, 5000) > canyonRadius(cf, 5000));
  assert.ok(canyonRadius(cs, 5000) < canyonRadius(cf, 5000));
});

test('difficulty is deterministic and default stays flow-compatible', () => {
  const seed = '2026-06-11';
  assert.deepEqual(makeCanyon(seed, DIFFICULTY.surge), makeCanyon(seed, DIFFICULTY.surge));
  // no diff arg === flow (pre-0.3.0 behavior preserved)
  assert.deepEqual(makeCanyon(seed), makeCanyon(seed, DIFFICULTY.flow));
  assert.equal(speedAt(42), speedAt(42, DIFFICULTY.flow));
  // same seed, different difficulty → same harmonics, different geometry
  const g = makeCanyon(seed, DIFFICULTY.glide), s = makeCanyon(seed, DIFFICULTY.surge);
  assert.deepEqual(g.cx, s.cx);
  assert.notEqual(canyonRadius(g, 5000), canyonRadius(s, 5000));
});

test('palette drift: classic cyan start, smooth, periodic, in range', () => {
  // the whole first zone is exactly the base hue — game always starts classic
  for (let z = 0; z <= HUE_ZONE_M; z += 100) assert.equal(wallHueAt(z), HUE_BASE);
  // drifts away after that
  assert.notEqual(Math.round(wallHueAt(HUE_ZONE_M * 2.5)), HUE_BASE);
  const period = HUE_ANCHORS.length * HUE_ZONE_M;
  for (const z of [0, 1234, 5000, 9999]) {
    assert.ok(Math.abs(wallHueAt(z) - wallHueAt(z + period)) < 1e-9, `periodic at z=${z}`);
  }
  // smooth: steepest legit blend (violet→cyan, 88°/zone) peaks ~0.66°/10m;
  // a zone-boundary discontinuity would be tens of degrees
  let prev = wallHueAt(0);
  for (let z = 10; z <= period; z += 10) {
    const h = wallHueAt(z);
    const d = Math.abs(((h - prev + 540) % 360) - 180);
    assert.ok(d < 0.8, `hue jump ${d.toFixed(3)}° at z=${z}`);
    assert.ok(h >= 0 && h < 360);
    prev = h;
  }
});

test('share card formats deterministically', () => {
  const card = shareCard({
    mode: 'daily', dateStr: '2026-06-11', distance: 4231.7,
    peakMult: 7.23, streak: 3, best: true,
  });
  assert.equal(card, [
    '🛸 SLIPSTREAM 2026-06-11 · FLOW',
    '▰▰▰▰▰▰▰▰▱▱ 4,231m',
    '⚡ x7.2 peak',
    '🔥 3-day streak',
    '🏆 new best',
  ].join('\n'));
  const endless = shareCard({
    mode: 'endless', dateStr: '2026-06-11', distance: 0,
    peakMult: 1, streak: 0, best: false,
  });
  assert.match(endless, /∞ endless/);
  assert.match(endless, /▱{10} 0m/);
});

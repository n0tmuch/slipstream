# Changelog

## 0.2.0 — 2026-06-11
- Palette drift: wall/glow hue now eases through 2km zones (cyan → azure → violet → cyan → teal, 12km cycle). First 2km stays classic cyan; the indigo void and magenta reward color never drift; violet capped at 265° to keep sparks distinct.
- Rollback: debug-panel toggle "hue drift" (off = exact v0.1.0 all-cyan look, persisted), or `git checkout v0.1.0`. Release tags v0.1.0 / v0.2.0 added.
- Default feel variant confirmed as B (tight) — unchanged.
- Unit test for the palette function (classic start zone, smoothness, periodicity).

## 0.1.0 — 2026-06-11
Initial release.
- One-button flight (hold = rise, release = dive; touch / mouse / any key) through an endless seeded-harmonic canyon; speed ramps forever.
- Near-miss skimming builds a score multiplier (cap x12) with magenta spark particles; collision ends the run with hit-stop, screen shake, and a particle burst.
- WebGL2 raymarched fbm-displaced tube renderer (bloom-ish glow accumulation, chromatic aberration + radial streaks scaling with speed, fov-kick, vignette) with timed GPU probe and Three.js instanced-ring fallback + adaptive resolution scaling.
- Synthesized audio (Tone.js): generative E-minor-pentatonic pad, arpeggio density/filter cutoff keyed to speed, near-misses climb the scale, filtered thud + silence on death, mute button, gesture-gated start.
- Daily mode (UTC-date seed, local best + day streak) and endless mode; score = distance × multiplier (integrated); emoji share card to clipboard.
- Hidden debug panel (` key): feel variants A floaty / B tight / C heavy, god mode, fps/renderer stats.
- Unit tests: seed determinism, canyon flyability, scoring, streak math, share card.

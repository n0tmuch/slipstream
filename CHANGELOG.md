# Changelog

## 0.1.0 — 2026-06-11
Initial release.
- One-button flight (hold = rise, release = dive; touch / mouse / any key) through an endless seeded-harmonic canyon; speed ramps forever.
- Near-miss skimming builds a score multiplier (cap x12) with magenta spark particles; collision ends the run with hit-stop, screen shake, and a particle burst.
- WebGL2 raymarched fbm-displaced tube renderer (bloom-ish glow accumulation, chromatic aberration + radial streaks scaling with speed, fov-kick, vignette) with timed GPU probe and Three.js instanced-ring fallback + adaptive resolution scaling.
- Synthesized audio (Tone.js): generative E-minor-pentatonic pad, arpeggio density/filter cutoff keyed to speed, near-misses climb the scale, filtered thud + silence on death, mute button, gesture-gated start.
- Daily mode (UTC-date seed, local best + day streak) and endless mode; score = distance × multiplier (integrated); emoji share card to clipboard.
- Hidden debug panel (` key): feel variants A floaty / B tight / C heavy, god mode, fps/renderer stats.
- Unit tests: seed determinism, canyon flyability, scoring, streak math, share card.

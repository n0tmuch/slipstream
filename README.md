# SLIPSTREAM

One-button flow-state flight through an endless, procedurally generated glowing canyon.

**Play it: https://n0tmuch.github.io/slipstream/**

**Hold** to rise. **Release** to dive. Graze the walls to charge the slipstream multiplier — touch them and the run ends. Speed ramps forever.

- **Daily mode** — everyone flies the same canyon (seeded by the UTC date). Build a streak.
- **Endless mode** — a fresh canyon every run.
- Score = distance × multiplier. Share your result card with one tap.

## Tech
- Single static page, zero build step. WebGL2 raymarched fbm-displaced tube in a full-screen fragment shader; auto-fallback to a Three.js instanced-ring canyon on weak GPUs (timed probe).
- All audio synthesized live with Tone.js — generative pad, speed-keyed arpeggio, near-misses climb a pentatonic scale.
- Press <kbd>`</kbd> for the debug panel (feel variants A/B/C, god mode, fps).
- <kbd>M</kbd> or the corner button mutes.

## Develop
```sh
npm test        # unit tests (seeded generator, scoring, streaks, share card)
npm run serve   # http://localhost:8765
```

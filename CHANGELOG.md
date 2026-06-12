# Changelog

## 0.5.1 — 2026-06-11
- Cloudflare deploy: live at https://slipstream.n0tmuch.workers.dev (Workers static assets, free tier). `wrangler.jsonc` + `.assetsignore` (keeps node_modules/tests/docs out of the upload — verified 404). Deploy with `npx wrangler deploy`. GitHub Pages remains live in parallel.
- verify/run.js honors `PAGE_URL` env like the other harness scripts.

## 0.5.0 — 2026-06-11
- Light trail replaces stardust: the mote now leaves a volumetric ribbon of light along its actual flight path, rendered in the raymarcher (chain of 16 glow points — bright/tight at the head, dimmer/wider with age). Tinted by the palette, heats toward magenta while skimming, bloomed by the post pass. Foreshortens when flying straight, arcs visibly on climbs/dives/bends.
- Three.js fallback gets an additive polyline version of the same trail.
- Options label renamed stardust → "light trail" (same toggle, same persisted setting); 2D dust particles removed entirely.

## 0.4.0 — 2026-06-11
- Stardust: the mote sheds a subtle comet trail of world-space dust that recedes and parallaxes as you fly (sells the 3D depth). Toggle in options ("stardust" on/off, persisted, default on). Spawn rate scales with speed; visual-only — no gameplay effect.
- Menu redesign: title and death screens slimmed to essentials; all choices moved into a grouped ⚙ options sheet — **course** (daily/endless), **intensity** (glide/flow/surge), **stardust** (on/off). Sheet backdrop swallows presses (can't accidentally launch), Esc or done closes, returns to wherever it was opened from.

## 0.3.0 — 2026-06-11
- Difficulty select: **glide** (chill — wider canyon, gentler bends, slower ramp), **flow** (the original tuning, still the default), **surge** (expert — faster ramp, narrower walls, wilder wander). Buttons on title + death screens, persisted.
- Difficulty shapes the canyon itself (envK/shrink/wander baked into the canyon object, mirrored as shader uniforms) and the speed curve — not just a score scalar.
- Best scores tracked per difficulty (pre-0.3.0 bests count as flow's); daily streak counts any difficulty; share card names the difficulty so runs can't masquerade.
- Tests: difficulty speed/width/wander ordering, determinism, flow back-compat.

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

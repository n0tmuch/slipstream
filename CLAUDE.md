# Slipstream
A one-button flow-state flight game: a mote of light flying through an endless, procedurally generated glowing canyon. Browser-based, single static page, zero build step. "Great" = trance-inducing 60fps flow (Race The Sun × Tron), instant restart, daily-seeded competition.

## Architecture map
- Zero build: `index.html` + ES modules in `src/`, served statically. Tone.js via CDN `<script>`; Three.js dynamically imported from CDN **only** when the GL fallback triggers.
- `src/core.js` — pure logic, no DOM/WebGL: seeded RNG (mulberry32+xmur3-style hash), canyon math, scoring, streak, share card. This is the ONLY file tests import.
- Canyon = analytic sum of seeded sine harmonics (center x/y + radius vs z). The SAME math is duplicated in GLSL (`render_gl.js` shader) and JS (`core.js`) — **if you change one, change the other** (uniforms carry the seeded coefficients, so only the formula shape must match).
- fbm wall displacement is visual-only; gameplay collision uses analytic radius − `WALL_MARGIN` (0.35) so visuals never kill unfairly.
- `src/render_gl.js` — WebGL2 raymarcher, 2 passes (raymarch → post: chromatic aberration, radial streaks/bloom, vignette). `src/render_three.js` — instanced-ring fallback for weak GPUs, chosen by a timed probe in `main.js` (>26ms/frame → half res → still slow → Three.js).
- Renderers share an interface: `resize / setCanyon / render(state) / project(worldPos) / dispose`. Particles are a 2D canvas overlay (`src/particles.js`): sparks live in screen space, stardust (0.4.0) lives in WORLD space and is re-projected every frame via the projector passed to `draw()`.
- Menu (0.4.0): title/death overlays are minimal; all settings live in the `#options` sheet (course/intensity/stardust groups). The sheet's backdrop has pointer-events:auto + a guard in `press()` so opening it can never start a run.
- `src/audio.js` — all synthesized (Tone.js, no audio files). E-minor-pentatonic everywhere. Starts on first user gesture only (autoplay policy).
- Feel variants A/B/C (gravity/lift/near-miss threshold) live in `FEEL` in `main.js`, switchable in the debug panel (` key).
- Daily seed = UTC date string `YYYY-MM-DD`; endless = random seed. localStorage keys all prefixed `slipstream.`.
- Difficulty (0.3.0): glide/flow/surge in `DIFFICULTY` (core.js) — envK/shrink/wander bake into the canyon object (and shader uniforms via setCanyon); speedAt takes the diff. Bests are per-difficulty; streak is difficulty-agnostic.
- Palette drift (0.2.0): `wallHueAt(z)` in core.js → tint computed JS-side, passed as `uTint` uniform (no GLSL parity needed). Void + magenta never drift. Debug toggle "hue drift" off = exact v0.1.0 look. `window.__slip` is a dev hook for the verify harness (warp/god/hue).

## Rules
- Single static page, no bundler, no npm runtime deps (CDN only). `puppeteer-core` is a devDependency for verification only.
- Run `npm test` before every commit — new mechanics/features get a test in `test/`.
- Bump version in `package.json` + `src/core.js` (`VERSION`) + log every change in `CHANGELOG.md`.
- Never break: determinism of `makeCanyon` (same seed → identical canyon), JS↔GLSL canyon-math parity, audio only after user gesture.

## Deploy policy
- [x] Deploy after every green test run — push to `main` auto-publishes GitHub Pages (preview = production for this static page)

## Session contract
- [x] Tier 1 (iterative): every turn ships a complete reversible increment; tests gate commits; changelog logs changes

## Model & cost
- Main model: Fable 5 for design/debugging/shader work; delegate mechanical searches to cheap subagents

## Commands
- test: `npm test`   serve: `npm run serve` (http://localhost:8765)   deploy: `git push` (Pages serves `main`)

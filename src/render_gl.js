// render_gl.js — WebGL2 raymarched canyon, two passes:
//   1) raymarch fbm-displaced tube into an offscreen framebuffer (scalable res)
//   2) post: chromatic aberration, radial streaks/bloom, vignette, flash
// Canyon math (env/center/radius) MUST mirror src/core.js exactly.

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const MARCH_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamFwd, uCamRight, uCamUp;
uniform float uFocal;          // 1/tan(fov/2)
uniform vec3 uPlayer;
uniform float uSpeed01;        // 0..1 normalized speed
uniform float uNear01;         // 0..1 near-miss intensity
uniform float uDeath;          // 1 briefly on death
uniform vec3 uTint;            // wall/glow color (palette drift; classic = cyan)
uniform vec4 uTrail[16];       // mote flight history: xyz pos, w fade (1=head)
uniform int uTrailN;

uniform vec3 uCX[4];           // (amp, freq, phase) — seeded harmonics
uniform vec3 uCY[4];
uniform vec3 uRH[3];
uniform float uBaseR;
uniform float uEnvK, uShrink, uWander; // difficulty — must mirror core.js

const vec3 VOID    = vec3(0.016, 0.012, 0.075); // deep indigo — never drifts
const vec3 MAGENTA = vec3(1.00, 0.15, 0.85);    // reward color — never drifts

float env(float z) { return 1.0 - exp(-z * uEnvK); }

vec2 center(float z) {
  float e = (0.25 + 0.75 * env(z)) * uWander;
  float x = 0.0, y = 0.0;
  for (int i = 0; i < 4; i++) {
    x += uCX[i].x * sin(uCX[i].y * z + uCX[i].z);
    y += uCY[i].x * sin(uCY[i].y * z + uCY[i].z);
  }
  return vec2(x, y) * e;
}

float radius(float z) {
  float r = uBaseR * (1.0 - uShrink * env(z));
  for (int i = 0; i < 3; i++) r += uRH[i].x * sin(uRH[i].y * z + uRH[i].z);
  return max(2.2, r);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

// distance to wall from inside the tube; fbm bumps protrude inward (visual only)
float map(vec3 p) {
  float d = radius(p.z) - length(p.xy - center(p.z));
  float bump = 0.35 * fbm(vec3(p.xy * 0.7, p.z * 0.35));
  return d - bump;
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamFwd * uFocal);

  float maxDist = 70.0;
  float t = 0.0, d = 1.0, glow = 0.0;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    d = map(p);
    glow += exp(-abs(d) * 2.4) * 0.0085;
    if (d < 0.004 * (1.0 + t) || t > maxDist) break;
    t += d * 0.6; // safety factor: SDF is not exact (z-varying radius)
  }

  vec3 col;
  if (t < maxDist && d < 0.05) {
    vec3 p = ro + rd * t;
    vec2 q = p.xy - center(p.z);
    float ang = atan(q.y, q.x);
    // glowing contour rings + longitudinal ribs, Tron-style
    float rings = smoothstep(0.965, 1.0, abs(sin(p.z * 1.55)));
    float ribs  = smoothstep(0.90, 1.0, abs(sin(ang * 7.0 + p.z * 0.12)));
    float n = fbm(vec3(q * 0.6, p.z * 0.3));
    vec3 wall = VOID * 2.2
              + uTint * (rings * (1.4 + uSpeed01) + ribs * 0.55) * (0.55 + 0.9 * n);
    float fog = 1.0 - exp(-t * 0.05);
    col = mix(wall, VOID, fog);
  } else {
    col = VOID;
  }

  col += uTint * glow * (0.85 + uNear01 * 1.3 + uSpeed01 * 0.45);

  // magenta energy clinging to walls near the player while skimming
  if (uNear01 > 0.001) {
    vec3 p = ro + rd * min(t, maxDist);
    col += MAGENTA * uNear01 * 1.1 * exp(-length(p - uPlayer) * 0.5);
  }

  // light ribbon: the mote's recent path as a chain of volumetric glows,
  // bright/tight at the head, dimmer/wider as it ages; heats up while skimming
  vec3 trailCol = mix(uTint * 0.85 + vec3(0.18), MAGENTA, uNear01 * 0.55);
  for (int i = 0; i < 16; i++) {
    if (i >= uTrailN) break;
    vec3 toT = uTrail[i].xyz - ro;
    float fade = uTrail[i].w;
    float tt = max(dot(toT, rd), 0.0);
    if (t > tt - 0.4) {
      float h2 = dot(toT - rd * tt, toT - rd * tt);
      col += trailCol * min(0.0016 * fade / (h2 + 0.0012 + 0.006 * (1.0 - fade)), 2.0);
    }
  }

  // the player mote: bright point glow, occluded by walls
  vec3 toP = uPlayer - ro;
  float tp = max(dot(toP, rd), 0.0);
  if (t > tp - 0.4) {
    float h = length(toP - rd * tp);
    float mote = min(0.0035 / (h * h + 0.0008), 5.0);
    col += (uTint * 0.7 + vec3(0.5)) * mote;
    col += MAGENTA * uNear01 * min(0.0012 / (h * h + 0.001), 2.0);
  }

  col = mix(col, MAGENTA * 0.6 + vec3(0.3), uDeath * 0.7);
  outColor = vec4(col, 1.0);
}`;

const POST_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uCA;       // chromatic aberration amount
uniform float uStreak;   // radial streak length
uniform float uFlash;    // white death flash
uniform float uDim;      // overlay dim

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 off = (uv - 0.5) * uCA;
  vec3 col = vec3(
    texture(uTex, uv + off).r,
    texture(uTex, uv).g,
    texture(uTex, uv - off).b);

  // radial streaks double as cheap bloom: gather bright energy toward center
  vec2 dir = (vec2(0.5) - uv) * uStreak;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 1; i <= 6; i++) {
    float w = 1.0 / float(i);
    acc += texture(uTex, uv + dir * float(i)).rgb * w;
    wsum += w;
  }
  acc /= wsum;
  col += max(acc - 0.55, 0.0) * 1.5;
  col += max(col - 0.85, 0.0) * 0.5;

  float vig = smoothstep(1.45, 0.4, length(uv - 0.5) * 1.8);
  col *= vig;
  col = mix(col, vec3(1.0), uFlash);
  col *= uDim;
  col = pow(col, vec3(0.85));
  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function program(gl, fragSrc) {
  const pr = gl.createProgram();
  gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(pr));
  }
  return pr;
}

export function createGLRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    depth: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('no webgl2');

  const march = program(gl, MARCH_FRAG);
  const post = program(gl, POST_FRAG);
  const uni = (pr, n) => gl.getUniformLocation(pr, n);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // offscreen target for pass 1
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let fbW = 0, fbH = 0;
  let scale = 1.0; // internal resolution scale (quality knob)
  let W = 0, H = 0, focal = 1.0, camPos = [0, 0, 0], right = [1, 0, 0], up = [0, 1, 0], fwd = [0, 0, 1];

  function allocTarget() {
    fbW = Math.max(2, Math.round(W * scale));
    fbH = Math.max(2, Math.round(H * scale));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fbW, fbH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function setCanyon(canyon) {
    gl.useProgram(march);
    const pack = (hs) => hs.flatMap((h) => [h.a, h.f, h.p]);
    gl.uniform3fv(uni(march, 'uCX'), new Float32Array(pack(canyon.cx)));
    gl.uniform3fv(uni(march, 'uCY'), new Float32Array(pack(canyon.cy)));
    gl.uniform3fv(uni(march, 'uRH'), new Float32Array(pack(canyon.r)));
    gl.uniform1f(uni(march, 'uBaseR'), canyon.baseRadius);
    gl.uniform1f(uni(march, 'uEnvK'), canyon.envK ?? 0.0018);
    gl.uniform1f(uni(march, 'uShrink'), canyon.shrink ?? 0.28);
    gl.uniform1f(uni(march, 'uWander'), canyon.wander ?? 1.0);
  }

  function resize(w, h) {
    W = Math.max(2, Math.round(w));
    H = Math.max(2, Math.round(h));
    canvas.width = W;
    canvas.height = H;
    allocTarget();
  }

  function setScale(s) {
    scale = s;
    if (W) allocTarget();
  }

  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  // state: {time, camPos, lookAt, fovDeg, player, speed01, near01, death, ca, streak, flash, dim}
  function render(s) {
    camPos = s.camPos;
    fwd = norm([s.lookAt[0] - s.camPos[0], s.lookAt[1] - s.camPos[1], s.lookAt[2] - s.camPos[2]]);
    right = norm(cross(fwd, [0, 1, 0]));
    up = cross(right, fwd);
    focal = 1 / Math.tan((s.fovDeg * Math.PI) / 360);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fbW, fbH);
    gl.useProgram(march);
    gl.uniform2f(uni(march, 'uRes'), fbW, fbH);
    gl.uniform1f(uni(march, 'uTime'), s.time);
    gl.uniform3fv(uni(march, 'uCamPos'), camPos);
    gl.uniform3fv(uni(march, 'uCamFwd'), fwd);
    gl.uniform3fv(uni(march, 'uCamRight'), right);
    gl.uniform3fv(uni(march, 'uCamUp'), up);
    gl.uniform1f(uni(march, 'uFocal'), focal);
    gl.uniform3fv(uni(march, 'uPlayer'), s.player);
    gl.uniform1f(uni(march, 'uSpeed01'), s.speed01);
    gl.uniform1f(uni(march, 'uNear01'), s.near01);
    gl.uniform1f(uni(march, 'uDeath'), s.death);
    gl.uniform3fv(uni(march, 'uTint'), s.tint);
    const tr = s.trail || [];
    const trArr = new Float32Array(64);
    for (let i = 0; i < Math.min(tr.length, 16); i++) trArr.set(tr[i], i * 4);
    gl.uniform4fv(uni(march, 'uTrail'), trArr);
    gl.uniform1i(uni(march, 'uTrailN'), Math.min(tr.length, 16));
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(post);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uni(post, 'uTex'), 0);
    gl.uniform2f(uni(post, 'uRes'), W, H);
    gl.uniform1f(uni(post, 'uCA'), s.ca);
    gl.uniform1f(uni(post, 'uStreak'), s.streak);
    gl.uniform1f(uni(post, 'uFlash'), s.flash);
    gl.uniform1f(uni(post, 'uDim'), s.dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // world → CSS-pixel screen coords (for the particle overlay)
  function project(p, cssW, cssH) {
    const v = [p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]];
    const z = v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2];
    if (z <= 0.01) return null;
    const x = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) * focal / z;
    const y = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) * focal / z;
    return { x: cssW / 2 + (x * cssH) / 2, y: cssH / 2 - (y * cssH) / 2 };
  }

  function readPixel() {
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  function dispose() {
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(march);
    gl.deleteProgram(post);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
  }

  return { kind: 'gl', resize, setScale, getScale: () => scale, setCanyon, render, project, readPixel, dispose };
}

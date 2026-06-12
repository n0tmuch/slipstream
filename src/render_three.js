// render_three.js — fallback canyon for weak GPUs: glowing ring cross-sections
// of the same analytic tube, additive-blended, fogged into the indigo void.
import { canyonCenter, canyonRadius } from './core.js';

const THREE_CDN = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const RING_SPACING = 2.0;
const RING_COUNT = 64;
const SEGMENTS = 40;

export async function createThreeRenderer(canvas) {
  const THREE = await import(THREE_CDN);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setClearColor(0x04031a);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x04031a, 10, RING_COUNT * RING_SPACING * 0.85);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);

  let canyon = null;

  // unit-circle template; each ring is scaled/positioned per frame
  const circlePts = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    circlePts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePts);

  const rings = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const mat = new THREE.LineBasicMaterial({
      color: 0x19f2ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const ring = new THREE.Line(circleGeo, mat);
    scene.add(ring);
    rings.push(ring);
  }

  // player mote: additive sprite from a tiny radial-gradient canvas
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 64;
  const c2 = spriteCanvas.getContext('2d');
  const grad = c2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(120,250,255,0.9)');
  grad.addColorStop(1, 'rgba(120,250,255,0)');
  c2.fillStyle = grad;
  c2.fillRect(0, 0, 64, 64);
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: spriteTex, blending: THREE.AdditiveBlending, depthTest: false })
  );
  sprite.scale.set(1.6, 1.6, 1);
  scene.add(sprite);

  // light ribbon fallback: additive polyline through the trail history
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(16 * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    color: 0x9ff8ff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthTest: false,
  }));
  scene.add(trailLine);

  let W = 0, H = 0;

  function resize(w, h) {
    W = w; H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setCanyon(c) { canyon = c; }
  function setScale() {} // quality knob not needed; rings are cheap

  function render(s) {
    if (!canyon) return;
    camera.position.set(...s.camPos);
    camera.fov = s.fovDeg;
    camera.updateProjectionMatrix();
    camera.lookAt(...s.lookAt);

    const z0 = Math.floor(s.camPos[2] / RING_SPACING) * RING_SPACING;
    for (let i = 0; i < RING_COUNT; i++) {
      const z = z0 + i * RING_SPACING;
      const ctr = canyonCenter(canyon, z);
      const r = canyonRadius(canyon, z);
      const ring = rings[i];
      ring.position.set(ctr.x, ctr.y, z);
      ring.scale.set(r, r, 1);
      const heat = s.near01 * 0.8;
      const [tr, tg, tb] = s.tint;
      ring.material.color.setRGB(
        tr + heat * (1.0 - tr),
        tg + heat * (0.16 - tg) * 0.7,
        tb + heat * (0.86 - tb) * 0.7);
      ring.material.opacity = 0.35 + s.speed01 * 0.4;
    }

    sprite.position.set(...s.player);

    const tr = s.trail || [];
    trailLine.visible = tr.length >= 2;
    if (trailLine.visible) {
      for (let i = 0; i < Math.min(tr.length, 16); i++) trailPos.set(tr[i].slice(0, 3), i * 3);
      trailGeo.setDrawRange(0, Math.min(tr.length, 16));
      trailGeo.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  const v3 = null;
  function project(p, cssW, cssH) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  }

  function dispose() {
    renderer.dispose();
    circleGeo.dispose();
    spriteTex.dispose();
  }

  return { kind: 'three', resize, setScale, getScale: () => 1, setCanyon, render, project, dispose };
}

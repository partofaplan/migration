'use strict';
/* Small shared helpers. Loaded as a classic script so the game runs straight
   from the file system (double-click index.html) on any OS. */

const TAU = Math.PI * 2;

/** Seeded PRNG so every world is reproducible from one integer. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential approach. */
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build a Matrix4 from translate / scale / euler rotation. */
function TRS(px, py, pz, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
}

/** Matrix for a unit Y-axis cylinder stretched between two points. */
function limbMatrix(a, b, radius) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius, len, radius));
}

/**
 * Merge several coloured primitives into one flat-shaded, vertex-coloured
 * geometry (one draw call instead of many).
 * parts: [{ geo, color, m? }]
 */
function mergeParts(parts) {
  const geos = [];
  let count = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.m) g.applyMatrix4(p.m);
    geos.push(g);
    count += g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  let o = 0;
  parts.forEach((p, i) => {
    const a = geos[i].attributes.position.array;
    pos.set(a, o * 3);
    c.set(p.color);
    const n = a.length / 3;
    for (let k = 0; k < n; k++) {
      col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b;
    }
    o += n;
    geos[i].dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

/** Cached canvas textures for icons / sprites. */
const _texCache = {};
function drawnTexture(key, draw, size = 128) {
  if (_texCache[key]) return _texCache[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  _texCache[key] = tex;
  return tex;
}

function glyphTexture(ch, fill, stroke = 'rgba(30,20,10,.85)') {
  return drawnTexture('glyph:' + ch + fill, (g, s) => {
    g.font = 'bold ' + Math.round(s * 0.74) + 'px "Segoe UI Symbol","Apple Symbols","Arial Unicode MS",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = s * 0.09; g.strokeStyle = stroke;
    g.strokeText(ch, s / 2, s * 0.54);
    g.fillStyle = fill;
    g.fillText(ch, s / 2, s * 0.54);
  });
}

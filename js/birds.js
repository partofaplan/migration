'use strict';
/* Low-poly bird models. A bird faces +Z; its body is one merged mesh and the
   two wings are separate so they can flap or fold. */

const BIRD_PAL = {
  sparrow: { back: 0x8b5e3c, belly: 0xdccdae, cap: 0x7a7570, cheek: 0xeee5d0, beak: 0x2f2a25, bib: 0x191614, tail: 0x5e4029, wing: 0x70492c, wingTip: 0x4a3120, eye: 0x0c0c0c },
  player:  { back: 0xb5682a, belly: 0xf6e9c8, cap: 0x93401c, cheek: 0xfff6e0, beak: 0x2f2a25, bib: 0x191614, tail: 0x74421f, wing: 0x8c5226, wingTip: 0x5c3418, eye: 0x0c0c0c },
  hawk:    { back: 0x4b3b31, belly: 0xbfa98d, cap: 0x3b2e26, cheek: 0x8f7a64, beak: 0xe0a92a, bib: 0x191614, tail: 0x3a2d25, wing: 0x43342b, wingTip: 0x241b16, eye: 0xffd23c },
};

const _uSphere = new THREE.SphereGeometry(1, 9, 7);
const _uCone = new THREE.ConeGeometry(1, 1, 6);
const _uBox = new THREE.BoxGeometry(1, 1, 1);

const BIRD_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const WING_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

/** bib: 0..1 — size of the black throat patch (a real status badge in house sparrows). */
function buildBirdBody(pal, bib) {
  const parts = [
    { geo: _uSphere, color: pal.back,  m: TRS(0, 0, 0, 0.30, 0.29, 0.50) },
    { geo: _uSphere, color: pal.belly, m: TRS(0, -0.07, 0.03, 0.27, 0.25, 0.44) },
    { geo: _uSphere, color: pal.cap,   m: TRS(0, 0.22, 0.36, 0.215, 0.20, 0.22) },
    { geo: _uSphere, color: pal.cheek, m: TRS(0, 0.15, 0.40, 0.225, 0.13, 0.19) },
    { geo: _uCone,   color: pal.beak,  m: TRS(0, 0.17, 0.64, 0.065, 0.2, 0.065, Math.PI / 2, 0, 0) },
    { geo: _uSphere, color: pal.eye,   m: TRS(0.155, 0.25, 0.46, 0.042) },
    { geo: _uSphere, color: pal.eye,   m: TRS(-0.155, 0.25, 0.46, 0.042) },
    { geo: _uBox,    color: pal.tail,  m: TRS(0, 0.05, -0.62, 0.2, 0.045, 0.5, 0.16, 0, 0) },
  ];
  if (bib > 0.01) {
    parts.push({
      geo: _uSphere, color: pal.bib,
      m: TRS(0, 0.035 - 0.09 * bib, 0.405, 0.09 + 0.13 * bib, 0.07 + 0.2 * bib, 0.14),
    });
  }
  return mergeParts(parts);
}

const _wingGeoCache = {};
function wingGeo(kind) {
  if (_wingGeoCache[kind]) return _wingGeoCache[kind];
  const pal = BIRD_PAL[kind];
  // A (root front), B (root back), M (leading edge), T (tip) — flat in XZ, pointing +X.
  const A = [0, 0, 0.22], B = [0, 0, -0.26], M = [0.48, 0, 0.14], T = [0.86, 0, -0.2];
  const pos = new Float32Array([...A, ...M, ...B, ...M, ...T, ...B]);
  const c1 = new THREE.Color(pal.wing), c2 = new THREE.Color(pal.wingTip);
  const col = new Float32Array([
    c1.r, c1.g, c1.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b,
    c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, c2.r, c2.g, c2.b,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  _wingGeoCache[kind] = g;
  return g;
}

function makeBird(opts = {}) {
  const kind = opts.kind || 'sparrow';
  const pal = BIRD_PAL[kind];
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const body = new THREE.Mesh(buildBirdBody(pal, opts.bib == null ? 0.5 : opts.bib), BIRD_MAT);
  const wl = new THREE.Mesh(wingGeo(kind), WING_MAT);
  const wr = new THREE.Mesh(wingGeo(kind), WING_MAT);
  wl.position.set(0.2, 0.1, 0.04);
  wr.position.set(-0.2, 0.1, 0.04);
  wr.scale.x = -1;
  g.add(body, wl, wr);
  const scale = opts.scale || 1;
  g.scale.setScalar(scale);
  return {
    g, body, wl, wr, scale,
    phase: Math.random() * TAU,
    flapRate: opts.flapRate || 24 + Math.random() * 6,
    folded: false,
  };
}

function setWings(b, angle) {
  if (b.folded) { b.folded = false; b.wl.scale.x = 1; b.wr.scale.x = -1; }
  b.wl.rotation.z = angle;
  b.wr.rotation.z = -angle;
}

function flapBird(b, dt, intensity = 1) {
  b.phase += dt * b.flapRate * intensity;
  setWings(b, Math.sin(b.phase) * 0.9 + 0.12);
}

function foldWings(b) {
  if (b.folded) return;
  b.folded = true;
  b.wl.scale.x = 0.36; b.wr.scale.x = -0.36;
  b.wl.rotation.z = -1.15; b.wr.rotation.z = 1.15;
}

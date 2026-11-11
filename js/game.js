/* Before the Frost — main game logic.
   Modes: menu → fly ⇄ perch / forage → depart → over */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

const DIFFS = {
  easy:   { label: 'Gentle Autumn', time: 540, target: 12, hawks: 1, hawkSpeed: 24,   distract: 1.3, hunger: 0.8 },
  normal: { label: 'Crisp October', time: 420, target: 18, hawks: 1, hawkSpeed: 26,   distract: 1.0, hunger: 1.0 },
  hard:   { label: 'Early Frost',   time: 330, target: 22, hawks: 2, hawkSpeed: 27.5, distract: 0.8, hunger: 1.15 },
};
const CRUISE = 18, SPRINT = 30, CALL_RANGE = 22;
const DISTRACTIONS = [
  'chasing a butterfly', 'eyeing a shiny bottle cap', 'splashing in a puddle',
  'squabbling over a crumb', 'admiring its own reflection', 'investigating a scarecrow',
];

// ───────────────────────────────────────────────── renderer & permanent scene
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  $('menu').classList.add('hidden');
  $('nowebgl').classList.remove('hidden');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 2800);
const camLook = new V3();
scene.fog = new THREE.Fog(0xf6dfb8, 150, 720);

const hemi = new THREE.HemisphereLight(0xdcecff, 0x8f7b52, 0.95);
const sun = new THREE.DirectionalLight(0xffedc8, 0.85);
const SUN_DIR = new V3(0.22, 0.34, 1).normalize();   // the sun sits in the south
sun.position.copy(SUN_DIR);
scene.add(hemi, sun);

const SKY = {
  topA: new THREE.Color(0x4f93d8), topB: new THREE.Color(0x8794a3),
  botA: new THREE.Color(0xf6dfb8), botB: new THREE.Color(0xdde5ea),
};
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vDir; void main(){ float h = normalize(vDir).y; float t = pow(clamp(h * 1.15 + 0.02, 0.0, 1.0), 0.55); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2200, 24, 12), skyMat);
sky.renderOrder = -10; sky.frustumCulled = false;
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(52, 18, 12), new THREE.MeshBasicMaterial({ color: 0xfff4cf, fog: false }));
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: drawnTexture('glow', (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,236,180,.9)'); gr.addColorStop(0.35, 'rgba(255,214,140,.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }, 256),
  transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
}));
sunGlow.scale.setScalar(620);
scene.add(sky, sunDisc, sunGlow);

function makeParticles(count, half, size, tex) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() * 2 - 1) * half;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: tex, size, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pos, count, half, mat, geo, pts };
}
const leaves = makeParticles(240, 46, 0.6, drawnTexture('leaf', (g, s) => {
  g.fillStyle = '#e08a2c'; g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.44, s * 0.24, 0.6, 0, TAU); g.fill();
}, 32));
const snow = makeParticles(1100, 42, 0.42, drawnTexture('flake', (g, s) => {
  g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, TAU); g.fill();
}, 32));
function updateParticles(P, dt, fall, drift, t) {
  P.pts.visible = P.mat.opacity > 0.01;
  if (!P.pts.visible) return;
  const c = camera.position, h = P.half, w = 2 * h, a = P.pos;
  for (let i = 0; i < P.count; i++) {
    const k = i * 3;
    a[k] += (Math.sin(t * 0.9 + i) * drift + 1.4) * dt;
    a[k + 1] -= fall * (0.6 + (i % 5) * 0.12) * dt;
    a[k + 2] += Math.cos(t * 0.7 + i * 1.3) * drift * dt;
    a[k]     = c.x + ((((a[k] - c.x + h) % w) + w) % w) - h;
    a[k + 1] = c.y + ((((a[k + 1] - c.y + h) % w) + w) % w) - h;
    a[k + 2] = c.z + ((((a[k + 2] - c.z + h) % w) + w) % w) - h;
  }
  P.geo.attributes.position.needsUpdate = true;
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ───────────────────────────────────────────────── DOM
const el = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), end: $('end'),
  flockN: $('flockN'), flockT: $('flockT'), flockBar: $('flockBar'), flockNote: $('flockNote'),
  foodBar: $('foodBar'), foodNote: $('foodNote'),
  clock: $('clock'), clockPanel: $('clockPanel'), seasonBar: $('seasonBar'), objective: $('objective'),
  alert: $('alert'), toasts: $('toasts'), prompt: $('prompt'),
  perchPanel: $('perchPanel'), ppHint: $('ppHint'), ppStrikes: $('ppStrikes'), keysHint: $('keysHint'),
  frost: $('frostVignette'), danger: $('dangerVignette'),
  mm: $('minimap'),
};
const mmCtx = el.mm.getContext('2d');
function setText(node, v) { if (node._v !== v) { node._v = v; node.textContent = v; } }
function setClass(node, cls, on) { if (!!node['_c' + cls] !== !!on) { node['_c' + cls] = !!on; node.classList.toggle(cls, !!on); } }
function setPrompt(html) {
  if (el.prompt._v === html) return;
  el.prompt._v = html;
  if (html) { el.prompt.innerHTML = html; el.prompt.classList.remove('hidden'); }
  else el.prompt.classList.add('hidden');
}
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  el.toasts.appendChild(t);
  while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  setTimeout(() => t.remove(), 5600);
}

// ───────────────────────────────────────────────── session
let W = null, S = null, dyn = null, lastDiff = 'normal';
const keys = Object.create(null);

function teardown() {
  for (const grp of [W && W.root, dyn]) {
    if (!grp) continue;
    scene.remove(grp);
    grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
  }
  W = null; dyn = null; S = null;
  el.toasts.innerHTML = '';
}

function newSession(diffKey, menu) {
  teardown();
  const diff = DIFFS[diffKey];
  W = buildWorld((Math.random() * 2147483647) | 0);
  dyn = new THREE.Group();
  scene.add(W.root, dyn);

  const bird = makeBird({ kind: 'player', bib: 0.75, scale: 1.3 });
  dyn.add(bird.g);
  const sx = W.start.x, sz = menu ? -150 : W.start.z;
  const pos = new V3(sx, W.ground(sx, sz) + (menu ? 24 : 17), sz);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  const selMarker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 4), new THREE.MeshBasicMaterial({ color: 0xffd23c, fog: false }));
  selMarker.rotation.x = Math.PI;
  selMarker.visible = false;
  dyn.add(shadow, selMarker);

  S = {
    diffKey, diff, mode: menu ? 'menu' : 'fly', paused: false, t: 0, won: false,
    total: diff.time, left: diff.time, target: diff.target,
    food: 70, starveT: 0,
    player: { bird, pos, yaw: 0, turnV: 0, speed: CRUISE, vy: 0 },
    followers: [], fleeing: [], fx: [], hawks: [],
    lost: 0, treesWon: 0, treesSpooked: 0, peak: 1,
    distractT: 34, ready: false, tree: null, perch: null, forage: null, ctx: null,
    frostApplied: -1, departT: 0, nagT: 0, peckT: 0, penaltyT: 0, hover: -1,
    shadow, selMarker,
    tips: menu ? [] : [
      [1.2, 'Golden beams mark the oaks where flocks roost. Fly to one and press E to perch.'],
      [10, 'Keep an eye on Food. Berry bushes and sunflowers are marked on your map.'],
      [20, 'The sun hangs in the south — that is where you must lead your flock.'],
    ],
  };
  if (!menu) {
    for (let i = 0; i < diff.hawks; i++) {
      const hb = makeBird({ kind: 'hawk', bib: 0, scale: 2.7, flapRate: 8 });
      dyn.add(hb.g);
      const c = new V3((Math.random() - 0.5) * 500, 0, (Math.random() - 0.3) * 400);
      S.hawks.push({ bird: hb, pos: new V3(c.x, 70, c.z), yaw: 0, state: 'patrol', center: c, centerT: 20, ang: Math.random() * TAU, cool: 45 + i * 25, huntT: 0, shelterT: 0, retreatT: 0 });
    }
  }
  camera.position.set(pos.x, pos.y + 4, pos.z - 10);
  camLook.copy(pos);

  setText(el.flockT, String(diff.target));
  el.hud.classList.toggle('hidden', !!menu);
  el.perchPanel.classList.add('hidden');
  setClass(el.alert, 'hidden', true);
  el.keysHint.classList.remove('hidden');
  el.danger.style.opacity = 0;
  setPrompt('');
}

const followCount = () => { let n = 0; for (const f of S.followers) if (f.state === 'follow') n++; return n; };
const flockSize = () => 1 + followCount();
const inPlay = () => S && (S.mode === 'fly' || S.mode === 'perch' || S.mode === 'forage');

// ───────────────────────────────────────────────── effects
function fx(tex, pos, o = {}) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, depthTest: o.depthTest !== false });
  const s = new THREE.Sprite(m);
  s.position.copy(pos);
  s.scale.setScalar(o.size || 1);
  dyn.add(s);
  S.fx.push({ s, age: 0, life: o.life || 1, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, size: o.size || 1, grow: o.grow || 0 });
}
const TEX = {
  note: () => glyphTexture('♪', '#fff3c2'),
  heart: () => glyphTexture('♥', '#ff6b81'),
  cross: () => glyphTexture('✕', '#ff5a4d'),
  bang: () => glyphTexture('!', '#ffd23c'),
  ring: () => drawnTexture('ring', (g, s) => {
    g.strokeStyle = 'rgba(255,240,190,.95)'; g.lineWidth = s * 0.035;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, 0, TAU); g.stroke();
  }, 256),
};
function updateEffects(dt) {
  for (let i = S.fx.length - 1; i >= 0; i--) {
    const e = S.fx[i];
    e.age += dt;
    const k = e.age / e.life;
    if (k >= 1) { dyn.remove(e.s); e.s.material.dispose(); S.fx.splice(i, 1); continue; }
    e.s.position.x += e.vx * dt; e.s.position.y += e.vy * dt; e.s.position.z += e.vz * dt;
    e.s.scale.setScalar(e.size * (1 + e.grow * k));
    e.s.material.opacity = 1 - k * k;
  }
}
function burst(tex, pos, n, spread = 1.5) {
  for (let i = 0; i < n; i++) {
    fx(tex, pos, { size: 0.7, life: 0.9 + Math.random() * 0.5, vx: (Math.random() - 0.5) * spread, vy: 1.2 + Math.random() * 1.4, vz: (Math.random() - 0.5) * spread, depthTest: false });
  }
}

// ───────────────────────────────────────────────── flight
function placeBird(bird, pos, yaw, pitch = 0, roll = 0) {
  bird.g.position.copy(pos);
  bird.g.rotation.set(pitch, yaw, roll);
}

function movePlayer(dt) {
  const p = S.player;
  p.yaw += p.turnV * dt;
  p.pos.x += Math.sin(p.yaw) * p.speed * dt;
  p.pos.z += Math.cos(p.yaw) * p.speed * dt;
  p.pos.y += p.vy * dt;
  const floor = W.ground(p.pos.x, p.pos.z) + 1.3;
  if (p.pos.y < floor) { p.pos.y = floor; if (p.vy < 0) p.vy = 0; }
  if (p.pos.y > 125) { p.pos.y = 125; if (p.vy > 0) p.vy = 0; }
}

function updateFly(dt) {
  const p = S.player;
  const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const climb = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const sprint = !!keys.Space;
  p.sprinting = sprint;
  p.turnV = damp(p.turnV, turn * 1.95, 7, dt);
  let target = sprint ? SPRINT : CRUISE;
  if (S.food <= 0) target *= 0.72;                    // starving birds are slow
  p.speed = damp(p.speed, target, 2.6, dt);
  p.vy = damp(p.vy, climb > 0 ? 13 : climb < 0 ? -17 : 0, 5, dt);
  movePlayer(dt);
  p.pos.x = clamp(p.pos.x, -WORLD, WORLD);
  if (p.pos.z < -WORLD) p.pos.z = -WORLD;

  placeBird(p.bird, p.pos, p.yaw, -p.vy * 0.035, -p.turnV * 0.33);
  if (climb < 0 && !sprint) setWings(p.bird, 0.22);   // glide on the way down
  else flapBird(p.bird, dt, 0.75 + (climb > 0 ? 0.5 : 0) + (sprint ? 0.45 : 0));

  // The southern border.
  if (p.pos.z >= DEPART_Z) {
    if (S.ready) startDepart();
    else {
      p.pos.z = DEPART_Z;
      if (S.t > S.nagT) {
        S.nagT = S.t + 5;
        toast('Too few to survive the journey — you need ' + (S.target - flockSize()) + ' more sparrows.', 'bad');
      }
    }
  }
}

function context() {
  const p = S.player.pos;
  let best = null, bd = CALL_RANGE * CALL_RANGE;
  for (const f of S.followers) {
    if (f.state !== 'distracted') continue;
    const d = f.pos.distanceToSquared(p);
    if (d < bd) { bd = d; best = f; }
  }
  if (best) return { type: 'call', f: best };
  for (const fd of W.foods) {
    if (fd.amount <= 0.5) continue;
    const dx = fd.x - p.x, dz = fd.z - p.z;
    if (dx * dx + dz * dz < FOOD_REACH * FOOD_REACH && p.y - fd.pos.y < 18) return { type: 'food', fd };
  }
  for (const tr of W.trees) {
    if (tr.status !== 'open') continue;
    const dx = tr.x - p.x, dz = tr.z - p.z;
    if (dx * dx + dz * dz < TREE_REACH * TREE_REACH && p.y < tr.top + 24) return { type: 'tree', tr };
  }
  return null;
}

function actionE() {
  const p = S.player;
  Sound.chirp(1);
  fx(TEX.ring(), p.pos, { size: 2, grow: 14, life: 0.55 });
  fx(TEX.note(), new V3(p.pos.x, p.pos.y + 0.9, p.pos.z), { size: 0.8, life: 0.8, vy: 2.2, depthTest: false });
  const c = context();
  if (!c) return;
  if (c.type === 'call') {
    let n = 0;
    for (const f of S.followers) {
      if (f.state === 'distracted' && f.pos.distanceToSquared(p.pos) < CALL_RANGE * CALL_RANGE) { recall(f); n++; }
    }
    if (n) { toast('Your wanderer hears you and darts back to the flock.', 'good'); Sound.peep(1.2, 0.1); }
  } else if (c.type === 'food') {
    if (S.food < 96) enterForage(c.fd);
  } else if (c.type === 'tree') {
    enterPerch(c.tr);
  }
}

// ───────────────────────────────────────────────── flock
function makeFollower(bird) {
  return {
    bird, pos: bird.g.position.clone(), yaw: bird.g.rotation.y, state: 'follow',
    seed: Math.random(), agility: 3.3 + Math.random() * 2.3, timer: 0, vel: null, dpoint: null, marker: null,
  };
}

function steer(f, tx, ty, tz, k, maxSp, dt) {
  const ox = f.pos.x, oy = f.pos.y, oz = f.pos.z;
  let dx = damp(ox, tx, k, dt) - ox, dy = damp(oy, ty, k, dt) - oy, dz = damp(oz, tz, k, dt) - oz;
  const d = Math.hypot(dx, dy, dz), m = maxSp * dt;
  if (d > m) { const s = m / d; dx *= s; dy *= s; dz *= s; }
  f.pos.set(ox + dx, oy + dy, oz + dz);
  if (dx * dx + dz * dz > 1e-5) f.yaw = dampAngle(f.yaw, Math.atan2(dx, dz), 12, dt);
}

function dropMarker(f) {
  if (f.marker) { dyn.remove(f.marker); f.marker.material.dispose(); f.marker = null; }
}
function recall(f) {
  f.state = 'follow';
  dropMarker(f);
  burst(TEX.heart(), f.pos, 3);
}
function loseFollower(f) {
  if (f.state === 'leaving') return;
  dropMarker(f);
  const a = Math.random() * TAU;
  f.state = 'leaving';
  f.timer = 4.5;
  f.vel = new V3(Math.cos(a) * 13, 4.5, Math.sin(a) * 13);
  S.lost++;
  Sound.lost();
}
function removeBirdObject(bird) {
  if (bird.g.parent) bird.g.parent.remove(bird.g);
  bird.body.geometry.dispose();
}

function updateFollowers(dt) {
  const p = S.player, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let slot = 0, removed = false;
  for (const f of S.followers) {
    if (f.state === 'leaving') {
      f.timer -= dt;
      f.pos.addScaledVector(f.vel, dt);
      placeBird(f.bird, f.pos, Math.atan2(f.vel.x, f.vel.z), -0.2);
      flapBird(f.bird, dt, 1.2);
      if (f.timer <= 0) { removeBirdObject(f.bird); f.dead = true; removed = true; }
      continue;
    }
    let tx, ty, tz, maxSp = 46, k = f.agility, landed = false;
    if (f.state === 'distracted') {
      if (S.mode === 'fly') f.timer -= dt;
      if (f.timer <= 0) {
        loseFollower(f);
        toast('Your wanderer lost interest in the flock and is gone for good.', 'bad');
        continue;
      }
      const a = S.t * 1.8 + f.seed * TAU;
      tx = f.dpoint.x + Math.cos(a) * 2.6; tz = f.dpoint.z + Math.sin(a) * 2.6;
      ty = f.dpoint.y + Math.sin(S.t * 2.3 + f.seed * 9) * 0.5;
      maxSp = 17; k = 2.5;
      if (f.marker) {
        f.marker.position.set(f.pos.x, f.pos.y + 1.7, f.pos.z);
        f.marker.visible = f.timer > 5 || Math.sin(S.t * 14) > -0.2;
      }
    } else if (S.mode === 'perch' && S.tree) {
      // Your flock wheels above the oak while you negotiate.
      const tr = S.tree, a = S.t * 0.9 + f.seed * TAU, r = 6 + ((f.seed * 37) % 1) * 4.5;
      tx = tr.base.x + Math.cos(a) * r; tz = tr.base.z + Math.sin(a) * r;
      ty = tr.top + 3 + ((f.seed * 13) % 1) * 4;
    } else if (S.mode === 'forage' && S.forage) {
      const fd = S.forage.fd, a = f.seed * TAU * 3, r = 2.4 + ((f.seed * 17) % 1) * 4.6;
      tx = fd.x + Math.cos(a) * r; tz = fd.z + Math.sin(a) * r;
      ty = W.ground(tx, tz) + 0.42;
      landed = Math.abs(f.pos.x - tx) + Math.abs(f.pos.z - tz) + Math.abs(f.pos.y - ty) < 0.9;
    } else {
      // Loose V formation trailing the leader.
      const row = (slot >> 1) + 1, side = (slot & 1) ? 1 : -1;
      const lx = side * (0.4 + row * 1.0), lz = -row * 1.0 - 0.3;
      tx = p.pos.x + lx * cy + lz * sy;
      tz = p.pos.z - lx * sy + lz * cy;
      ty = p.pos.y + ((slot * 7) % 5 - 2) * 0.28 + 0.2 + Math.sin(S.t * 1.7 + f.seed * 40) * 0.3;
      slot++;
    }
    steer(f, tx, ty, tz, k, maxSp, dt);
    const floor = W.ground(f.pos.x, f.pos.z) + 0.4;
    if (f.pos.y < floor) f.pos.y = floor;
    if (landed) {
      foldWings(f.bird);
      placeBird(f.bird, f.pos, f.yaw, Math.max(0, Math.sin(S.t * 10 + f.seed * 20)) * 0.6);
    } else {
      placeBird(f.bird, f.pos, f.yaw);
      flapBird(f.bird, dt, f.state === 'distracted' ? 0.8 : 1);
    }
  }
  if (removed) S.followers = S.followers.filter(f => !f.dead);

  for (let i = S.fleeing.length - 1; i >= 0; i--) {
    const f = S.fleeing[i];
    f.t -= dt;
    f.bird.g.position.addScaledVector(f.vel, dt);
    f.bird.g.rotation.set(-0.25, Math.atan2(f.vel.x, f.vel.z), 0);
    flapBird(f.bird, dt, 1.3);
    if (f.t <= 0) { removeBirdObject(f.bird); S.fleeing.splice(i, 1); }
  }
}

function updateDistraction(dt) {
  const n = followCount();
  if (!n) return;
  S.distractT -= dt * (1 + n * 0.035) * (S.food < 25 ? 1.5 : 1);
  if (S.distractT > 0) return;
  S.distractT = (17 + Math.random() * 13) * S.diff.distract;
  if (S.followers.some(f => f.state === 'distracted')) return;   // one drama at a time
  const pool = S.followers.filter(f => f.state === 'follow');
  const f = pool[Math.floor(Math.random() * pool.length)];
  const p = S.player, sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const lx = (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 13), lz = -4 + Math.random() * 26;
  const x = clamp(p.pos.x + lx * cy + lz * sy, -WORLD, WORLD);
  const z = clamp(p.pos.z - lx * sy + lz * cy, -WORLD, RIVER_Z - 25);
  f.state = 'distracted';
  f.timer = 16;
  f.dpoint = new V3(x, W.ground(x, z) + 3 + Math.random() * 2.5, z);
  f.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.bang(), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false }));
  f.marker.scale.setScalar(0.05);
  dyn.add(f.marker);
  Sound.peep(0.7, 0.12);
  toast('A sparrow peeled away, ' + DISTRACTIONS[Math.floor(Math.random() * DISTRACTIONS.length)] + '! Fly close and chirp (E) to call it back.', 'bad');
}

// ───────────────────────────────────────────────── clock, hunger
function tickClock(dt) {
  S.left -= dt;
  const n = flockSize();
  let drain = (0.3 + 0.042 * n) * S.diff.hunger;
  if (S.mode === 'fly' && S.player.sprinting) drain *= 1.6;
  if (S.mode === 'perch') drain *= 0.6;
  if (S.mode === 'forage') drain = 0;
  S.food = Math.max(0, S.food - drain * dt);

  if (S.food <= 0 && S.mode !== 'forage') {
    S.starveT += dt;
    if (S.starveT > 7) {
      S.starveT = 0;
      const pool = S.followers.filter(f => f.state === 'follow');
      if (pool.length) {
        loseFollower(pool[Math.floor(Math.random() * pool.length)]);
        toast('A starving sparrow abandoned the flock to forage alone. Find food!', 'bad');
      }
    }
  } else S.starveT = Math.max(0, S.starveT - dt);

  const ready = flockSize() >= S.target;
  if (ready && !S.ready) { toast('Your flock is big enough! Lead them SOUTH across the river.', 'good'); Sound.ready(); }
  else if (!ready && S.ready) toast('Your flock has shrunk below ' + S.target + ' — gather more before heading south.', 'bad');
  S.ready = ready;
  S.peak = Math.max(S.peak, flockSize());

  while (S.tips.length && S.t > S.tips[0][0]) toast(S.tips.shift()[1]);
  if (S.left <= 0) { S.left = 0; endGame(false); }
}

// ───────────────────────────────────────────────── foraging
function enterForage(fd) {
  const p = S.player;
  let dx = p.pos.x - fd.x, dz = p.pos.z - fd.z;
  const d = Math.hypot(dx, dz) || 1;
  const sx = fd.x + dx / d * 3.6, sz = fd.z + dz / d * 3.6;
  S.mode = 'forage';
  S.forage = { fd, t: 0, spot: new V3(sx, W.ground(sx, sz) + 0.55, sz) };
  p.sprinting = false;
}
function leaveForage(msg) {
  const p = S.player;
  S.mode = 'fly';
  S.forage = null;
  p.vy = 9; p.speed = 9; p.turnV = 0;
  if (msg) toast(msg, 'good');
}
function updateForage(dt) {
  const fo = S.forage, fd = fo.fd, p = S.player;
  fo.t += dt;
  p.pos.x = damp(p.pos.x, fo.spot.x, 3.2, dt);
  p.pos.y = damp(p.pos.y, fo.spot.y, 3.2, dt);
  p.pos.z = damp(p.pos.z, fo.spot.z, 3.2, dt);
  p.yaw = dampAngle(p.yaw, Math.atan2(fd.x - p.pos.x, fd.z - p.pos.z), 6, dt);
  const near = p.pos.distanceTo(fo.spot) < 2.2;
  if (near) {
    foldWings(p.bird);
    placeBird(p.bird, p.pos, p.yaw, Math.max(0, Math.sin(S.t * 11)) * 0.6);
    const take = Math.min(30 * dt, fd.amount, 100 - S.food);
    S.food += take; fd.amount -= take;
    updateFoodVisual(fd);
    S.peckT -= dt;
    if (S.peckT <= 0) { S.peckT = 0.16; Sound.peck(); }
    if (S.food >= 99.9) return leaveForage('Bellies full — back to the sky.');
    if (fd.amount <= 0.5) { fd.amount = 0; updateFoodVisual(fd); return leaveForage('This patch is picked clean.'); }
  } else {
    placeBird(p.bird, p.pos, p.yaw, 0.15);
    flapBird(p.bird, dt, 1);
  }
}

// ───────────────────────────────────────────────── perching: find the alpha
function enterPerch(tr) {
  const p = S.player;
  const right = new V3(tr.front.z, 0, -tr.front.x);        // screen-right as seen from the front
  const spot = tr.base.clone().addScaledVector(tr.front, 5.6).addScaledVector(right, -5.3);
  spot.y = Math.max(tr.base.y + 4.3, W.ground(spot.x, spot.z) + 1.5);
  S.mode = 'perch';
  S.tree = tr;
  S.perch = { t: 0, lock: 0, result: null, spot, songT: 0.9, clock: 0, queue: [], ambT: 1, heartT: 0 };
  p.sprinting = false;
  if (tr.birds[tr.sel].struck) moveSel(1);
  el.perchPanel.classList.remove('hidden');
  el.keysHint.classList.add('hidden');
  setText(el.ppHint, TELLS[tr.tell]);
  showStrikes(tr);
  setPrompt('');
}
function showStrikes(tr) {
  el.ppStrikes.innerHTML = 'Wariness <b>' + '●'.repeat(tr.strikes) + '○'.repeat(2 - tr.strikes) + '</b>';
}
function leavePerch() {
  S.mode = 'fly';
  S.tree = null; S.perch = null;
  S.selMarker.visible = false;
  S.player.turnV = 0; S.player.speed = 8; S.player.vy = 4;
  el.perchPanel.classList.add('hidden');
  el.keysHint.classList.remove('hidden');
}
function moveSel(dir) {
  const tr = S.tree;
  if (!tr || S.perch.lock > 0) return;
  const n = tr.birds.length;
  for (let i = 1; i <= n; i++) {
    const k = ((tr.sel + dir * i) % n + n) % n;
    if (!tr.birds[k].struck) { if (k !== tr.sel) Sound.peep(1.1, 0.04); tr.sel = k; return; }
  }
}
function singBird(b, lead) {
  b.sing = 0.4;
  Sound.chirp(lead ? 1.18 : 0.82 + b.seed * 0.2, lead ? 0.15 : 0.07);
  fx(TEX.note(), new V3(b.home.x, b.home.y + 0.9, b.home.z), { size: lead ? 0.95 : 0.8, life: 0.9, vy: 1.7, vx: (Math.random() - 0.5) * 0.6, depthTest: false });
}
function pickBird() {
  const tr = S.tree, pr = S.perch;
  if (!tr || pr.lock > 0) return;
  const b = tr.birds[tr.sel];
  if (b.struck) return;
  Sound.chirp(1);
  fx(TEX.note(), new V3(S.player.pos.x, S.player.pos.y + 1, S.player.pos.z), { size: 0.8, life: 0.8, vy: 2, depthTest: false });
  if (b.alpha) {
    pr.lock = 1.7; pr.result = 'win';
    Sound.good();
    burst(TEX.heart(), new V3(b.home.x, b.home.y + 0.6, b.home.z), 6);
    toast('The alpha chirps back — you have a friend! ' + tr.birds.length + ' sparrows join your flock.', 'good');
  } else {
    b.struck = true; b.fluster = 0.8;
    tr.strikes++;
    S.left -= 6; S.penaltyT = 1;
    Sound.bad();
    b.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.cross(), transparent: true, depthWrite: false, depthTest: false, fog: false }));
    b.mark.scale.setScalar(0.75);
    b.mark.position.set(b.home.x, b.home.y + 1.15, b.home.z);
    dyn.add(b.mark);
    showStrikes(tr);
    if (tr.strikes >= 2) {
      pr.lock = 1.3; pr.result = 'scatter';
      toast('Wrong again — the whole flock takes fright and scatters!', 'bad');
    } else {
      toast('Just a follower. The flock grows wary — one more mistake and they will scatter.', 'bad');
      moveSel(1);
    }
  }
}
function clearMarks(tr) {
  for (const b of tr.birds) if (b.mark) { dyn.remove(b.mark); b.mark.material.dispose(); b.mark = null; }
}
function resolvePerch() {
  const tr = S.tree, pr = S.perch;
  clearMarks(tr);
  tr.beam.visible = false;
  if (pr.result === 'win') {
    tr.status = 'friend';
    S.treesWon++;
    for (const b of tr.birds) {
      b.bird.g.scale.setScalar(b.bird.scale);
      S.followers.push(makeFollower(b.bird));
    }
  } else {
    tr.status = 'spooked';
    S.treesSpooked++;
    for (const b of tr.birds) {
      const a = Math.random() * TAU;
      b.bird.g.scale.setScalar(b.bird.scale);
      S.fleeing.push({ bird: b.bird, vel: new V3(Math.cos(a) * 12, 6 + Math.random() * 3, Math.sin(a) * 12), t: 5 });
    }
  }
  tr.birds = [];
  leavePerch();
}

function updatePerch(dt) {
  const tr = S.tree, pr = S.perch, p = S.player;
  pr.t += dt;

  // You hover beside the oak, facing it.
  p.pos.x = damp(p.pos.x, pr.spot.x, 3, dt);
  p.pos.y = damp(p.pos.y, pr.spot.y + Math.sin(S.t * 3) * 0.12, 3, dt);
  p.pos.z = damp(p.pos.z, pr.spot.z, 3, dt);
  p.yaw = dampAngle(p.yaw, Math.atan2(tr.base.x - p.pos.x, tr.base.z - p.pos.z), 5, dt);
  placeBird(p.bird, p.pos, p.yaw, -0.25);
  flapBird(p.bird, dt, 1.25);

  // The tells.
  const alpha = tr.birds[tr.alphaIdx];
  if (pr.lock <= 0) {
    if (tr.tell === 'song') {
      pr.songT -= dt;
      if (pr.songT <= 0) {
        const rest = shuffle(tr.birds.filter(b => !b.alpha));
        pr.queue = [{ t: 0, b: alpha, lead: true }].concat(rest.map((b, i) => ({ t: 0.7 + i * 0.27, b, lead: false })));
        pr.clock = 0;
        pr.songT = 0.7 + rest.length * 0.27 + 1.8;
      }
      pr.clock += dt;
      while (pr.queue.length && pr.queue[0].t <= pr.clock) { const q = pr.queue.shift(); singBird(q.b, q.lead); }
    } else {
      pr.ambT -= dt;
      if (pr.ambT <= 0) {
        pr.ambT = 1.3 + Math.random() * 2.5;
        const b = tr.birds[Math.floor(Math.random() * tr.birds.length)];
        b.sing = 0.3;
        Sound.peep(0.8 + Math.random() * 0.5, 0.045);
      }
    }
  }
  for (const b of tr.birds) {
    b.lookT -= dt;
    if (b.lookT <= 0) {
      if (tr.tell === 'gaze' && !b.alpha) {
        if (b.gazing) { b.gazing = false; b.lookYaw = b.baseYaw + (Math.random() - 0.5) * 0.5; b.lookT = 1.5 + Math.random() * 2.4; }
        else { b.gazing = true; b.lookYaw = Math.atan2(alpha.home.x - b.home.x, alpha.home.z - b.home.z); b.lookT = 0.95 + Math.random() * 0.6; }
      } else {
        b.lookYaw = b.baseYaw + (Math.random() - 0.5) * (tr.tell === 'gaze' ? 0.9 : 1.3);
        b.lookT = 1.4 + Math.random() * 3;
      }
    }
    b.yaw = dampAngle(b.yaw, b.lookYaw, 8, dt);
    let y = b.home.y, pitch = 0, roll = 0, sy = 1;
    if (b.sing > 0) { b.sing -= dt; const k = Math.sin(Math.PI * clamp(b.sing / 0.4, 0, 1)); sy = 1 + 0.2 * k; pitch = -0.35 * k; }
    if (b.fluster > 0) { b.fluster -= dt; y += Math.abs(Math.sin(b.fluster * 18)) * 0.22; roll = Math.sin(b.fluster * 40) * 0.3; }
    if (pr.result === 'win') y += Math.abs(Math.sin(pr.t * 9 + b.seed * 6)) * 0.18;   // happy hopping
    b.bird.g.position.set(b.home.x, y, b.home.z);
    b.bird.g.rotation.set(pitch, b.yaw, roll);
    b.bird.g.scale.set(b.bird.scale, b.bird.scale * sy, b.bird.scale);
  }

  // Selection marker.
  const sb = tr.birds[tr.sel];
  S.selMarker.visible = pr.lock <= 0 && !!sb;
  if (sb) {
    S.selMarker.position.set(sb.home.x, sb.home.y + 1.35 + Math.sin(S.t * 5) * 0.1, sb.home.z);
    S.selMarker.rotation.y = S.t * 2.5;
  }

  if (pr.lock > 0) {
    pr.lock -= dt;
    if (pr.result === 'win') {
      pr.heartT -= dt;
      if (pr.heartT <= 0) { pr.heartT = 0.25; burst(TEX.heart(), new V3(alpha.home.x, alpha.home.y + 0.6, alpha.home.z), 2); }
    }
    if (pr.lock <= 0) resolvePerch();
  }
}

// ───────────────────────────────────────────────── hawks
function retreat(h, cool) {
  h.state = 'retreat'; h.retreatT = 5; h.cool = cool;
}
function updateHawks(dt) {
  const p = S.player.pos;
  let hunting = false;
  for (const h of S.hawks) {
    h.cool -= dt;
    let tx, ty, tz, speed = 15;
    if (h.state === 'patrol') {
      h.centerT -= dt;
      if (h.centerT <= 0) {
        h.centerT = 22 + Math.random() * 10;
        const a = Math.random() * TAU, d = 50 + Math.random() * 110;
        h.center.set(clamp(p.x + Math.cos(a) * d, -WORLD, WORLD), 0, clamp(p.z + Math.sin(a) * d, -WORLD, RIVER_Z - 30));
      }
      h.ang += dt * 0.24;
      tx = h.center.x + Math.cos(h.ang) * 52; tz = h.center.z + Math.sin(h.ang) * 52;
      ty = W.ground(tx, tz) + 46;
      if (S.mode === 'fly' && h.cool <= 0 && followCount() > 0 && h.pos.distanceTo(p) < 88 && !W.sheltered(p)) {
        h.state = 'hunt'; h.huntT = 0; h.shelterT = 0;
        Sound.hawk();
        toast('A hawk has spotted your flock! Dive under the trees or outrun it.', 'bad');
      }
    } else if (h.state === 'hunt') {
      h.huntT += dt;
      speed = S.diff.hawkSpeed;
      tx = p.x; ty = p.y + 0.6; tz = p.z;
      const safe = S.mode !== 'fly' || W.sheltered(p);
      h.shelterT = safe ? h.shelterT + dt : Math.max(0, h.shelterT - dt * 0.5);
      const d = h.pos.distanceTo(p);
      if (!inPlay()) retreat(h, 30);
      else if (h.shelterT > 1.3) { retreat(h, 24); toast('The hawk loses you among the branches.', 'good'); }
      else if (!safe && d < 4.4) {
        const pool = S.followers.filter(f => f.state === 'follow');
        if (pool.length) {
          loseFollower(pool[Math.floor(Math.random() * pool.length)]);
          toast('The hawk tore through your flock — a sparrow fled in panic!', 'bad');
        }
        retreat(h, 28);
      } else if (h.huntT > 15 || d > 135) { retreat(h, 22); toast('The hawk gives up the chase.', 'good'); }
      else hunting = true;
    } else {
      h.retreatT -= dt;
      speed = 21;
      tx = h.pos.x + Math.sin(h.yaw) * 40; tz = h.pos.z + Math.cos(h.yaw) * 40;
      ty = W.ground(h.pos.x, h.pos.z) + 52;
      if (h.retreatT <= 0) { h.state = 'patrol'; h.centerT = 0; }
    }
    const dx = tx - h.pos.x, dy = ty - h.pos.y, dz = tz - h.pos.z;
    const len = Math.hypot(dx, dy, dz) || 1, step = Math.min(len, speed * dt);
    h.pos.x += dx / len * step; h.pos.y += dy / len * step; h.pos.z += dz / len * step;
    if (dx * dx + dz * dz > 0.01) h.yaw = dampAngle(h.yaw, Math.atan2(dx, dz), 3.5, dt);
    placeBird(h.bird, h.pos, h.yaw, clamp(-dy / len, -0.6, 0.6) * 0.8);
    if (h.state === 'hunt') flapBird(h.bird, dt, 1.4);
    else setWings(h.bird, 0.12 + Math.sin(S.t * 1.3 + h.ang) * 0.1);   // soaring
  }
  S.hunting = hunting;
}

// ───────────────────────────────────────────────── endings
function startDepart() {
  S.mode = 'depart';
  S.departT = 0;
  S.won = true;
  setPrompt('');
  setClass(el.alert, 'hidden', true);
  for (const f of S.followers) if (f.state === 'distracted') recall(f);
  toast('South! The whole flock wheels toward the sun.', 'good');
  Sound.win();
}
function updateDepart(dt) {
  const p = S.player;
  S.departT += dt;
  p.turnV = 0;
  p.yaw = dampAngle(p.yaw, Math.atan2(SUN_DIR.x, SUN_DIR.z), 1.4, dt);
  p.speed = damp(p.speed, 25, 2, dt);
  p.vy = damp(p.vy, 6.5, 1.5, dt);
  movePlayer(dt);
  placeBird(p.bird, p.pos, p.yaw, -0.2);
  flapBird(p.bird, dt, 1);
  if (S.mode === 'depart' && S.departT > 6) endGame(true);
}

function endGame(win) {
  const n = flockSize();
  S.mode = 'over';
  S.won = win;
  if (S.tree) { S.selMarker.visible = false; S.tree = null; S.perch = null; }
  S.forage = null;
  el.hud.classList.add('hidden');
  el.danger.style.opacity = 0;
  const left = Math.max(0, Math.floor(S.left));
  const score = Math.max(0, n * 100 + left * 3 + S.treesWon * 50 - S.lost * 40 - S.treesSpooked * 60);
  let eyebrow, title, text;
  if (win) {
    const rank = n >= S.target + 10 ? 'Legendary Wingleader' : n >= S.target + 4 ? 'Seasoned Navigator' : 'Fledgling Leader';
    eyebrow = rank;
    title = 'The flock flies south';
    text = 'With ' + fmtTime(left) + ' to spare, ' + n + ' sparrows crossed the river behind you and turned toward warmer skies. Winter will find the oaks empty.';
  } else {
    eyebrow = 'The first frost';
    title = 'Winter caught you';
    text = n >= S.target
      ? 'So close. You had the numbers, but the frost reached the river before you did.'
      : 'Snow settles on the oaks. A flock of ' + n + ' was not enough — you needed ' + S.target + ' to brave the journey.';
    W.setFrost(1);
    Sound.lose();
  }
  $('endEyebrow').textContent = eyebrow;
  $('endTitle').textContent = title;
  $('endText').textContent = text;
  const stat = (v, l) => '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>';
  $('endStats').innerHTML =
    stat(n, 'Flock size') + stat(fmtTime(left), 'Time left') + stat(score, 'Score') +
    stat(S.treesWon, 'Alphas befriended') + stat(S.treesSpooked, 'Flocks spooked') + stat(S.lost, 'Sparrows lost');
  el.end.classList.remove('hidden');
}

// ───────────────────────────────────────────────── camera & environment
function updateCamera(dt) {
  const p = S.player;
  let tx, ty, tz, lx, ly, lz, k = 4.2;
  if (S.mode === 'perch' && S.tree) {
    const tr = S.tree;
    tx = tr.base.x + tr.front.x * 13.5; tz = tr.base.z + tr.front.z * 13.5; ty = tr.base.y + 7.2;
    lx = tr.base.x; ly = tr.base.y + 6.3; lz = tr.base.z;
    k = 3;
  } else if (S.mode === 'depart' || S.mode === 'over') {
    if (S.won) {
      // Pull back and rise so the whole V is framed against the sun.
      const pull = Math.min(S.departT, 14);
      tx = p.pos.x - Math.sin(p.yaw) * (13 + pull * 2.2); tz = p.pos.z - Math.cos(p.yaw) * (13 + pull * 2.2);
      ty = p.pos.y + 5 + pull * 0.9;
      k = 1.6;
    } else { tx = camera.position.x; tz = camera.position.z; ty = camera.position.y; }
    lx = p.pos.x; ly = p.pos.y; lz = p.pos.z;
  } else {
    const rows = Math.min(Math.ceil(followCount() / 2), 14);
    const back = 7 + rows * 1.0, up = 2.8 + rows * 0.55;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    tx = p.pos.x - sy * back; tz = p.pos.z - cy * back; ty = p.pos.y + up;
    lx = p.pos.x + sy * 5; ly = p.pos.y + 0.8; lz = p.pos.z + cy * 5;
  }
  const c = camera.position;
  c.x = damp(c.x, tx, k, dt); c.y = damp(c.y, ty, k, dt); c.z = damp(c.z, tz, k, dt);
  const floor = W.ground(c.x, c.z) + 1.6;
  if (c.y < floor) c.y = floor;
  camLook.x = damp(camLook.x, lx, 8, dt); camLook.y = damp(camLook.y, ly, 8, dt); camLook.z = damp(camLook.z, lz, 8, dt);
  camera.lookAt(camLook);

  // Blob shadow so altitude is readable.
  const g = W.ground(p.pos.x, p.pos.z);
  const alt = p.pos.y - g;
  S.shadow.position.set(p.pos.x, g + 0.25, p.pos.z);
  S.shadow.scale.setScalar(clamp(1.6 - alt * 0.03, 0.5, 1.6));
  S.shadow.material.opacity = clamp(0.32 - alt * 0.006, 0.05, 0.32);
}

function updateEnvironment(dt) {
  const season = S.mode === 'menu' ? 0.12 : clamp(1 - S.left / S.total, 0, 1);
  const cold = smoothstep(0.3, 1, season);
  skyMat.uniforms.top.value.copy(SKY.topA).lerp(SKY.topB, cold);
  skyMat.uniforms.bottom.value.copy(SKY.botA).lerp(SKY.botB, cold);
  scene.fog.color.copy(skyMat.uniforms.bottom.value);
  scene.fog.near = lerp(150, 50, cold);
  scene.fog.far = lerp(720, 380, cold);
  sun.intensity = lerp(0.85, 0.45, cold);
  sunGlow.material.opacity = lerp(1, 0.45, cold);

  const frost = smoothstep(0.5, 1, season);
  if (Math.abs(frost - S.frostApplied) > 0.025 || (frost >= 1 && S.frostApplied < 1)) {
    if (S.mode !== 'over' || !S.won) W.setFrost(frost);
    S.frostApplied = frost;
  }
  leaves.mat.opacity = 0.95 * (1 - smoothstep(0.75, 1, season));
  snow.mat.opacity = 0.9 * smoothstep(0.55, 0.92, season);
  updateParticles(leaves, dt, 2.2, 1.6, S.t);
  updateParticles(snow, dt, 3.2, 0.9, S.t);

  sky.position.copy(camera.position);
  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 1700);
  sunGlow.position.copy(camera.position).addScaledVector(SUN_DIR, 1650);
  el.frost.style.opacity = S.mode === 'menu' ? 0 : (smoothstep(0.72, 1, season) * 0.9).toFixed(2);
  W.update(dt);
  Sound.wind(S.mode === 'menu' || S.paused ? 0.05 : 0.07 + (S.player.speed / SPRINT) * 0.16 + cold * 0.12);
}

// ───────────────────────────────────────────────── HUD
function updateHUD(dt) {
  if (S.mode === 'menu' || S.mode === 'over') return;
  const n = flockSize();
  let wandering = 0;
  for (const f of S.followers) if (f.state === 'distracted') wandering++;
  setText(el.flockN, String(n));
  el.flockBar.style.width = clamp(n / S.target, 0, 1) * 100 + '%';
  setClass(el.flockBar, 'full', n >= S.target);
  setText(el.flockNote, wandering ? wandering + ' wandering off — chirp nearby!' : n >= S.target ? 'Ready to migrate' : (S.target - n) + ' more needed');
  setClass(el.flockNote, 'warn', wandering > 0);

  el.foodBar.style.width = S.food.toFixed(1) + '%';
  setClass(el.foodBar, 'low', S.food < 25);
  setText(el.foodNote, S.food <= 0 ? 'Starving — sparrows are deserting!' : S.food < 25 ? 'Hungry — find berries or sunflowers' : '');
  setClass(el.foodNote, 'warn', S.food < 25);

  setText(el.clock, fmtTime(S.left));
  el.seasonBar.style.width = clamp(1 - S.left / S.total, 0, 1) * 100 + '%';
  S.penaltyT = Math.max(0, S.penaltyT - dt);
  setClass(el.clockPanel, 'penalty', S.penaltyT > 0);
  setClass(el.clockPanel, 'urgent', S.left < 45 && S.penaltyT <= 0);
  setText(el.objective, S.ready ? 'Fly SOUTH across the river!' : 'Befriend alphas to grow your flock');
  setClass(el.objective, 'go', S.ready);

  // Contextual prompt.
  let prompt = '';
  if (S.mode === 'fly') {
    const c = context();
    if (c && c.type === 'call') prompt = 'Press <kbd>E</kbd> to call your wanderer back';
    else if (c && c.type === 'food') prompt = S.food < 96 ? 'Press <kbd>E</kbd> to forage here' : 'Your flock is not hungry yet';
    else if (c && c.type === 'tree') prompt = 'Press <kbd>E</kbd> to perch and meet this flock';
    else if (S.ready && S.player.pos.z > RIVER_Z - 70) prompt = 'Keep flying south — over the river!';
  } else if (S.mode === 'forage') prompt = 'Foraging… press any flight key to take off';
  setPrompt(prompt);

  // Hawk warning.
  const sheltered = S.hunting && W.sheltered(S.player.pos);
  setClass(el.alert, 'hidden', !S.hunting);
  if (S.hunting) setText(el.alert, sheltered ? 'Under cover — stay low until the hawk gives up' : 'HAWK! Dive under the trees or outrun it');
  el.danger.style.opacity = S.hunting ? (0.5 + 0.3 * Math.sin(S.t * 8)).toFixed(2) : 0;

  drawMinimap();
}

function drawMinimap() {
  const g = mmCtx, s = el.mm.width, E = WORLD + 26, k = s / (2 * E);
  const X = x => (x + E) * k, Z = z => (z + E) * k;
  g.clearRect(0, 0, s, s);
  g.fillStyle = 'rgba(64,72,44,0.9)';
  g.fillRect(0, 0, s, s);

  // The south bank lights up when you are ready.
  const zs = Z(DEPART_Z - 10);
  g.fillStyle = S.ready ? 'rgba(255,205,90,' + (0.5 + 0.3 * Math.sin(S.t * 5)).toFixed(2) + ')' : 'rgba(255,255,255,0.10)';
  g.fillRect(0, zs, s, s - zs);
  g.strokeStyle = '#6fb1d6'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath();
  for (let x = -E; x <= E; x += 20) { if (x === -E) g.moveTo(X(x), Z(W.riverZ(x))); else g.lineTo(X(x), Z(W.riverZ(x))); }
  g.stroke();

  for (const fd of W.foods) {
    g.fillStyle = fd.amount > 0.5 ? (fd.kind === 'berry' ? '#e8506a' : '#f4c531') : 'rgba(255,255,255,0.22)';
    g.beginPath(); g.arc(X(fd.x), Z(fd.z), 3.6, 0, TAU); g.fill();
  }
  for (const tr of W.trees) {
    const x = X(tr.x), z = Z(tr.z);
    if (tr.status === 'open') {
      g.fillStyle = 'rgba(255,200,70,0.25)';
      g.beginPath(); g.arc(x, z, 8 + Math.sin(S.t * 3 + tr.idx) * 1.5, 0, TAU); g.fill();
      g.fillStyle = '#ffc94a'; g.strokeStyle = '#3a2a12'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, z, 5, 0, TAU); g.fill(); g.stroke();
    } else if (tr.status === 'friend') {
      g.fillStyle = '#9ad06f';
      g.beginPath(); g.arc(x, z, 3.5, 0, TAU); g.fill();
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x - 3, z - 3); g.lineTo(x + 3, z + 3); g.moveTo(x + 3, z - 3); g.lineTo(x - 3, z + 3); g.stroke();
    }
  }
  for (const f of S.followers) {
    if (f.state !== 'distracted' || Math.sin(S.t * 10) < -0.3) continue;
    g.strokeStyle = '#ff7ae0'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(X(f.pos.x), Z(f.pos.z), 6, 0, TAU); g.stroke();
  }
  for (const h of S.hawks) {
    g.save();
    g.translate(clamp(X(h.pos.x), 5, s - 5), clamp(Z(h.pos.z), 5, s - 5));
    g.rotate(Math.PI - h.yaw);
    g.fillStyle = h.state === 'hunt' ? '#ff2d20' : '#c0392b';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 5); g.lineTo(0, 2); g.lineTo(-6, 5); g.closePath(); g.fill();
    g.restore();
  }
  const p = S.player;
  g.save();
  g.translate(X(p.pos.x), Z(p.pos.z));
  g.rotate(Math.PI - p.yaw);
  g.fillStyle = '#fff'; g.strokeStyle = '#2a1e12'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 2.5); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
  g.restore();

  g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText('N', s / 2, 10);
  g.fillStyle = S.ready ? '#2a1c0c' : 'rgba(255,255,255,0.75)';
  g.fillText('S', s / 2, s - 9);
}

// ───────────────────────────────────────────────── main loop
function updateMenu(dt) {
  const p = S.player;
  p.turnV = 0.16; p.speed = 12; p.vy = 0;
  p.pos.y = damp(p.pos.y, W.ground(p.pos.x, p.pos.z) + 24, 1, dt);
  movePlayer(dt);
  placeBird(p.bird, p.pos, p.yaw, 0, -0.12);
  flapBird(p.bird, dt, 0.7);
}

function update(dt) {
  S.t += dt;
  switch (S.mode) {
    case 'menu': updateMenu(dt); break;
    case 'fly': updateFly(dt); if (S.mode === 'fly') { updateDistraction(dt); tickClock(dt); } break;
    case 'perch': updatePerch(dt); if (S.mode === 'perch') tickClock(dt); break;
    case 'forage': updateForage(dt); if (S.mode === 'forage') tickClock(dt); break;
    case 'depart': updateDepart(dt); break;
    case 'over':
      if (S.won) updateDepart(dt);
      else { placeBird(S.player.bird, S.player.pos, S.player.yaw, -0.2); flapBird(S.player.bird, dt, 1.1); }
      break;
  }
  updateFollowers(dt);
  updateHawks(dt);
  updateEffects(dt);
  updateCamera(dt);
  updateEnvironment(dt);
  updateHUD(dt);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (S && !S.paused) update(dt);
  renderer.render(scene, camera);
}

// ───────────────────────────────────────────────── input
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'Enter']);
const FLIGHT_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ']);

function setPaused(on) {
  if (!inPlay()) return;
  S.paused = on;
  el.pause.classList.toggle('hidden', !on);
  if (on) Sound.wind(0); else last = performance.now();
}

window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const playing = S && S.mode !== 'menu' && S.mode !== 'over';
  if (playing && GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (!playing) return;
  Sound.init();
  if (e.code === 'KeyM') { toast(Sound.toggleMute() ? 'Sound off' : 'Sound on'); return; }
  if (e.code === 'KeyP') { setPaused(!S.paused); return; }
  if (e.code === 'Escape') {
    if (S.mode === 'perch' && !S.paused) leavePerch(); else setPaused(!S.paused);
    return;
  }
  if (S.paused) return;
  if (S.mode === 'fly') {
    if (e.code === 'KeyE' || e.code === 'Enter') actionE();
  } else if (S.mode === 'perch') {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') moveSel(-1);
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') moveSel(1);
    else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') pickBird();
    else if (e.code === 'KeyQ') { if (S.perch.lock <= 0) leavePerch(); }
  } else if (S.mode === 'forage') {
    if (FLIGHT_KEYS.has(e.code) && S.forage.t > 0.5) leaveForage();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && inPlay() && !S.paused) setPaused(true); });

// Mouse can also pick a bird while perched.
const _proj = new V3();
function birdUnderMouse(e) {
  const tr = S.tree;
  let best = -1, bd = 70 * 70;
  tr.birds.forEach((b, i) => {
    if (b.struck) return;
    _proj.copy(b.home).project(camera);
    if (_proj.z > 1) return;
    const dx = (_proj.x * 0.5 + 0.5) * window.innerWidth - e.clientX;
    const dy = (-_proj.y * 0.5 + 0.5) * window.innerHeight - e.clientY;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
canvas.addEventListener('mousemove', e => {
  if (!S || S.mode !== 'perch' || S.paused || S.perch.lock > 0) return;
  const i = birdUnderMouse(e);
  canvas.style.cursor = i >= 0 ? 'pointer' : '';
  if (i >= 0 && i !== S.tree.sel) { S.tree.sel = i; Sound.peep(1.1, 0.04); }
});
canvas.addEventListener('click', e => {
  if (!S || S.mode !== 'perch' || S.paused || S.perch.lock > 0) return;
  const i = birdUnderMouse(e);
  if (i >= 0) { S.tree.sel = i; pickBird(); }
});

// ───────────────────────────────────────────────── menus
function startGame(diffKey) {
  lastDiff = diffKey;
  Sound.init();
  el.menu.classList.add('hidden');
  el.end.classList.add('hidden');
  el.pause.classList.add('hidden');
  canvas.style.cursor = '';
  newSession(diffKey, false);
  last = performance.now();
}
function showMenu() {
  el.end.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.menu.classList.remove('hidden');
  newSession(lastDiff, true);
}
document.querySelectorAll('#menu .diff').forEach(b => b.addEventListener('click', () => startGame(b.dataset.diff)));
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('quitBtn').addEventListener('click', showMenu);
$('againBtn').addEventListener('click', () => startGame(lastDiff));
$('menuBtn').addEventListener('click', showMenu);

newSession('normal', true);
requestAnimationFrame(frame);

// Handle for poking at the game from the browser console.
window.__frost = {
  get state() { return S; }, get world() { return W; },
  camera, start: startGame, perch: enterPerch, forage: enterForage, pick: pickBird, end: endGame, step: update,
};
})();

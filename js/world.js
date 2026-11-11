'use strict';
/* Procedural world: rolling autumn terrain, a river marking the southern
   border, roost oaks (each with a small flock and one alpha), food patches
   and scenery. Everything hangs off one root group so a new game can simply
   throw the old world away. */

const WORLD = 400;        // playable half-extent (x and north z)
const WATER_Y = -5.5;
const RIVER_Z = 345;      // the river you must cross to migrate
const DEPART_Z = 376;     // crossing this line (with enough birds) wins
const TREE_REACH = 26;    // how close you must be to perch
const FOOD_REACH = 15;

const TELLS = {
  perch: 'This flock’s leader always claims the highest perch.',
  bib:   'Among sparrows, the biggest black bib marks the boss.',
  song:  'The leader sings first — the others only echo.',
  gaze:  'Followers keep glancing at their leader. The leader glances at no one.',
};

const _uCyl = new THREE.CylinderGeometry(1, 1, 1, 6);
const _uTrunk = new THREE.CylinderGeometry(0.62, 1, 1, 7);
const _uIco = new THREE.IcosahedronGeometry(1, 1);
const _uIco0 = new THREE.IcosahedronGeometry(1, 0);
const SOLID_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

function buildWorld(seed) {
  const rng = mulberry32(seed);
  const R = (a, b) => a + (b - a) * rng();
  const root = new THREE.Group();
  const ph = Array.from({ length: 7 }, () => rng() * TAU);

  const riverZ = x => RIVER_Z + 13 * Math.sin(x * 0.017 + ph[6]);
  function H(x, z) {
    const base =
      7 * Math.sin(x * 0.011 + ph[0]) * Math.cos(z * 0.013 + ph[1]) +
      4 * Math.sin(x * 0.027 + ph[2]) * Math.sin(z * 0.023 + ph[3]) +
      1.4 * Math.sin(x * 0.07 + ph[4]) * Math.cos(z * 0.063 + ph[5]) + 2.5;
    const d = (z - riverZ(x)) / 15;
    const e = Math.exp(-d * d);
    return base * (1 - 0.85 * e) - 12 * e;
  }
  const ground = (x, z) => Math.max(H(x, z), WATER_Y);

  // ------------------------------------------------------------ terrain
  let tg = new THREE.PlaneGeometry(1900, 1900, 150, 150);
  tg.rotateX(-Math.PI / 2);
  tg = tg.toNonIndexed();
  const tp = tg.attributes.position;
  const vCount = tp.count;
  const baseCol = new Float32Array(vCount * 3);
  const frostW = new Float32Array(vCount);
  const colArr = new Float32Array(vCount * 3);
  const cA = new THREE.Color(0x76893a), cB = new THREE.Color(0xb9983f), cSand = new THREE.Color(0xc4b183),
        cHill = new THREE.Color(0x8a6a40), cMud = new THREE.Color(0x6d6a4d), tmp = new THREE.Color();
  let faceShade = 1;
  for (let i = 0; i < vCount; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const h = H(x, z);
    tp.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.031 + ph[1]) * Math.cos(z * 0.043 - x * 0.02 + ph[3]);
    tmp.copy(cA).lerp(cB, n);
    tmp.lerp(cHill, smoothstep(6, 13, h) * 0.7);
    tmp.lerp(cSand, 1 - smoothstep(WATER_Y + 0.3, WATER_Y + 2.6, h));
    if (h < WATER_Y) tmp.lerp(cMud, 0.7);
    if (i % 3 === 0) faceShade = 0.93 + rng() * 0.14;   // one shade per triangle = faceted look
    baseCol[i * 3] = tmp.r * faceShade; baseCol[i * 3 + 1] = tmp.g * faceShade; baseCol[i * 3 + 2] = tmp.b * faceShade;
    frostW[i] = (0.5 + 0.5 * n) * (h < WATER_Y ? 0.2 : 1);
  }
  colArr.set(baseCol);
  tg.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, SOLID_MAT);
  root.add(terrain);

  const waterMat = new THREE.MeshLambertMaterial({ color: 0x4a7f9c, transparent: true, opacity: 0.84 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1900, 1900), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  root.add(water);

  const frostCol = new THREE.Color(0xe9eff3), waterWarm = new THREE.Color(0x4a7f9c), waterIce = new THREE.Color(0xb9d3df);
  function setFrost(f) {
    for (let i = 0; i < vCount; i++) {
      const w = f * frostW[i], k = i * 3;
      colArr[k] = baseCol[k] + (frostCol.r - baseCol[k]) * w;
      colArr[k + 1] = baseCol[k + 1] + (frostCol.g - baseCol[k + 1]) * w;
      colArr[k + 2] = baseCol[k + 2] + (frostCol.b - baseCol[k + 2]) * w;
    }
    tg.attributes.color.needsUpdate = true;
    waterMat.color.copy(waterWarm).lerp(waterIce, f);
  }

  // ------------------------------------------------------------ placement helpers
  const START = { x: 0, z: -362 };
  function place(list, minD, tries, test) {
    for (let t = 0; t < tries; t++) {
      const c = test();
      if (!c) continue;
      const relax = minD * (t > tries * 0.6 ? 0.7 : 1);
      if (list.every(o => (o.x - c.x) ** 2 + (o.z - c.z) ** 2 > relax * relax)) return c;
    }
    return null;
  }

  // ------------------------------------------------------------ roost oaks
  const trees = [];
  const treeSpots = [];
  for (let i = 0; i < 12; i++) {
    const c = place(treeSpots, 118, 400, () => {
      const x = R(-345, 345), z = R(-315, 292);
      if (H(x, z) < WATER_Y + 3.5) return null;
      if ((x - START.x) ** 2 + (z - START.z) ** 2 < 65 * 65) return null;
      return { x, z };
    });
    if (c) treeSpots.push(c);
  }
  // Nearest trees get the gentler tells so the game teaches itself.
  treeSpots.sort((a, b) => ((a.x - START.x) ** 2 + (a.z - START.z) ** 2) - ((b.x - START.x) ** 2 + (b.z - START.z) ** 2));
  const tellOrder = ['perch', 'bib', 'song', 'gaze'];
  const canopyCols = [0xd98a2b, 0xc9652a, 0xe0a83a, 0xb8482a, 0xd9b03f];

  treeSpots.forEach((spot, idx) => {
    const base = new THREE.Vector3(spot.x, H(spot.x, spot.z) - 0.3, spot.z);
    const frontA = rng() * TAU;
    const front = new THREE.Vector3(Math.sin(frontA), 0, Math.cos(frontA));
    const tell = idx < 4 ? tellOrder[idx] : tellOrder[Math.floor(rng() * 4)];
    const n = 3 + Math.floor(rng() * 4);           // 3–6 birds per tree
    const alphaIdx = Math.floor(rng() * n);

    const parts = [{ geo: _uTrunk, color: 0x5b4635, m: TRS(0, 5.5, 0, 1.15, 11, 1.15) }];
    for (let k = 0; k < 6; k++) {
      const a = rng() * TAU, d = R(0.4, 3.2), r = R(3, 4.2);
      parts.push({
        geo: _uIco, color: canopyCols[Math.floor(rng() * canopyCols.length)],
        m: TRS(Math.cos(a) * d - front.x * 1.2, R(13.4, 16), Math.sin(a) * d - front.z * 1.2, r, r * 0.85, r, rng() * 3, rng() * 3, 0),
      });
    }

    const birds = [];
    for (let k = 0; k < n; k++) {
      const delta = lerp(-1.3, 1.3, n === 1 ? 0.5 : k / (n - 1)) + R(-0.07, 0.07);
      const rad = R(3.5, 4.3);
      let y = R(4.7, 7.5);
      if (tell === 'perch') y = k === alphaIdx ? 8.1 : R(4.7, 6.7);
      const a = frontA + delta;
      const perch = new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
      const tip = perch.clone().multiplyScalar(1).add(new THREE.Vector3(Math.sin(a) * 0.7, 0.25, Math.cos(a) * 0.7));
      parts.push({ geo: _uCyl, color: 0x5b4635, m: limbMatrix(new THREE.Vector3(0, y - 1.5, 0), tip, 0.13) });

      let bib = R(0.2, 0.75);
      if (tell === 'bib') bib = k === alphaIdx ? 1.2 : R(0.08, 0.38);
      const bird = makeBird({ bib, scale: 1.15 });
      const home = new THREE.Vector3(base.x + perch.x, base.y + perch.y + 0.5, base.z + perch.z);
      const baseYaw = frontA + delta * 0.35 + R(-0.15, 0.15);
      bird.g.position.copy(home);
      bird.g.rotation.y = baseYaw;
      foldWings(bird);
      root.add(bird.g);
      birds.push({
        bird, home, baseYaw, yaw: baseYaw, lookYaw: baseYaw, lookT: R(0.3, 3), gazing: false,
        alpha: k === alphaIdx, struck: false, sing: 0, fluster: 0, mark: null, seed: rng(),
      });
    }

    const mesh = new THREE.Mesh(mergeParts(parts), SOLID_MAT);
    mesh.position.copy(base);
    root.add(mesh);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 90, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd866, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    beam.position.set(base.x, base.y + 19 + 45, base.z);
    root.add(beam);

    trees.push({
      idx, x: spot.x, z: spot.z, base, frontA, front, tell, birds, alphaIdx,
      status: 'open', strikes: 0, sel: Math.floor(n / 2), beam, top: base.y + 19,
    });
  });

  // ------------------------------------------------------------ food
  const foods = [];
  const foodSpots = [];
  const berryGeo = new THREE.SphereGeometry(0.3, 6, 5);
  const berryMat = new THREE.MeshLambertMaterial({ color: 0xc8233c });
  const headGeo = mergeParts([
    { geo: _uCyl, color: 0xf2c230, m: TRS(0, 0, 0, 0.62, 0.07, 0.62) },
    { geo: _uCyl, color: 0x5a3a1c, m: TRS(0, 0.05, 0, 0.3, 0.08, 0.3) },
  ]);
  const berryIcon = drawnTexture('icon:berry', (g, s) => {
    g.fillStyle = 'rgba(30,20,12,.55)'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, 0, TAU); g.fill();
    g.fillStyle = '#d6304a';
    [[0.4, 0.56, 0.17], [0.62, 0.6, 0.15], [0.52, 0.4, 0.14]].forEach(([x, y, r]) => { g.beginPath(); g.arc(s * x, s * y, s * r, 0, TAU); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,.55)';
    [[0.36, 0.51], [0.59, 0.56], [0.49, 0.36]].forEach(([x, y]) => { g.beginPath(); g.arc(s * x, s * y, s * 0.04, 0, TAU); g.fill(); });
  });
  const seedIcon = drawnTexture('icon:seed', (g, s) => {
    g.fillStyle = 'rgba(30,20,12,.55)'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, 0, TAU); g.fill();
    g.fillStyle = '#f4c531';
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      g.beginPath(); g.ellipse(s / 2 + Math.cos(a) * s * 0.22, s / 2 + Math.sin(a) * s * 0.22, s * 0.11, s * 0.06, a, 0, TAU); g.fill();
    }
    g.fillStyle = '#6b4520'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.15, 0, TAU); g.fill();
  });

  function addFood(x, z, kind) {
    const pos = new THREE.Vector3(x, H(x, z), z);
    const grp = new THREE.Group();
    grp.position.copy(pos);
    const items = [];
    if (kind === 'berry') {
      const parts = [], blobs = [];
      for (let k = 0; k < 4; k++) {
        const b = { x: R(-1.6, 1.6), y: R(1, 1.7), z: R(-1.6, 1.6), r: R(1.5, 2.1) };
        blobs.push(b);
        parts.push({ geo: _uIco0, color: k % 2 ? 0x3f6b35 : 0x4b7a3a, m: TRS(b.x, b.y, b.z, b.r, b.r * 0.85, b.r, rng() * 3, rng() * 3, 0) });
      }
      grp.add(new THREE.Mesh(mergeParts(parts), SOLID_MAT));
      for (let k = 0; k < 18; k++) {
        const b = blobs[k % blobs.length];
        const a = rng() * TAU, e = R(0.1, 1.2);
        const m = new THREE.Mesh(berryGeo, berryMat);
        m.position.set(b.x + Math.cos(a) * Math.cos(e) * b.r * 0.95, b.y + Math.sin(e) * b.r * 0.8, b.z + Math.sin(a) * Math.cos(e) * b.r * 0.95);
        grp.add(m); items.push(m);
      }
    } else {
      const parts = [];
      for (let k = 0; k < 8; k++) {
        const a = rng() * TAU, d = R(0.3, 3), hgt = R(2.2, 3.4);
        const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
        parts.push({ geo: _uCyl, color: 0x55772f, m: TRS(sx, hgt / 2, sz, 0.07, hgt, 0.07) });
        parts.push({ geo: _uIco0, color: 0x55772f, m: TRS(sx + 0.25, hgt * 0.5, sz, 0.3, 0.08, 0.2) });
        const head = new THREE.Mesh(headGeo, SOLID_MAT);
        head.position.set(sx, hgt, sz + 0.05);
        head.rotation.set(1.05, R(-0.4, 0.4), 0);
        grp.add(head); items.push(head);
      }
      grp.add(new THREE.Mesh(mergeParts(parts), SOLID_MAT));
    }
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: kind === 'berry' ? berryIcon : seedIcon, transparent: true, depthWrite: false, sizeAttenuation: false, fog: false }));
    icon.scale.setScalar(0.042);
    icon.position.set(0, 7.5, 0);
    grp.add(icon);
    root.add(grp);
    foods.push({ kind, x, z, pos, amount: 110, max: 110, items, icon });
    foodSpots.push({ x, z });
  }

  // One guaranteed snack close to the start, then scatter the rest.
  const first = place([], 0, 300, () => {
    const x = R(-70, 70), z = R(-345, -280);
    if (H(x, z) < WATER_Y + 2.5) return null;
    return treeSpots.every(t => (t.x - x) ** 2 + (t.z - z) ** 2 > 45 * 45) ? { x, z } : null;
  });
  if (first) addFood(first.x, first.z, 'berry');
  for (let i = 0; i < 11; i++) {
    const c = place(foodSpots, 85, 300, () => {
      const x = R(-350, 350), z = R(-330, 300);
      if (H(x, z) < WATER_Y + 2.5) return null;
      return treeSpots.every(t => (t.x - x) ** 2 + (t.z - z) ** 2 > 46 * 46) ? { x, z } : null;
    });
    if (c) addFood(c.x, c.z, i % 2 ? 'berry' : 'seed');
  }

  // ------------------------------------------------------------ scenery trees (instanced)
  const cover = [];   // places a small bird can hide from a hawk
  const leafy = [], pines = [];
  const clear = (x, z) =>
    H(x, z) > WATER_Y + 1.5 &&
    treeSpots.every(t => (t.x - x) ** 2 + (t.z - z) ** 2 > 27 * 27) &&
    foodSpots.every(f => (f.x - x) ** 2 + (f.z - z) ** 2 > 13 * 13);
  for (let c = 0; c < 70; c++) {
    const cx = R(-640, 640), cz = R(-640, 640);
    const pineGrove = rng() < 0.28;
    const count = 2 + Math.floor(rng() * 8);
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 30;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!clear(x, z)) continue;
      (pineGrove ? pines : leafy).push({ x, z, y: H(x, z) });
    }
  }
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const leafCols = [0xd9822b, 0xc7532b, 0xe3b23c, 0xa63d2a, 0x8f9a3a, 0xcf9a2e, 0x6f8f3a];

  if (leafy.length) {
    const trunkG = new THREE.CylinderGeometry(0.32, 0.5, 1, 6); trunkG.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5b4635 }), leafy.length);
    const crownG = new THREE.IcosahedronGeometry(1, 1);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff }), leafy.length);
    leafy.forEach((t, i) => {
      const th = R(3, 5.2), r = R(2.6, 4.3);
      dummy.position.set(t.x, t.y - 0.3, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, th + 0.5, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + th + r * 0.7, t.z); dummy.rotation.set(rng() * 3, rng() * 3, 0); dummy.scale.set(r, r * 0.95, r); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      col.set(leafCols[Math.floor(rng() * leafCols.length)]).multiplyScalar(R(0.88, 1.08));
      crowns.setColorAt(i, col);
      cover.push({ x: t.x, z: t.z, r: r + 5, top: t.y + th + r * 1.7 + 3 });
    });
    trunks.frustumCulled = crowns.frustumCulled = false;
    crowns.instanceColor.needsUpdate = true;
    root.add(trunks, crowns);
  }
  if (pines.length) {
    const pineG = new THREE.ConeGeometry(1, 1, 7); pineG.translate(0, 0.5, 0);
    const cones = new THREE.InstancedMesh(pineG, new THREE.MeshLambertMaterial({ color: 0xffffff }), pines.length);
    const stemG = new THREE.CylinderGeometry(0.3, 0.4, 1, 5); stemG.translate(0, 0.5, 0);
    const stems = new THREE.InstancedMesh(stemG, new THREE.MeshLambertMaterial({ color: 0x4d3a2c }), pines.length);
    pines.forEach((t, i) => {
      const hgt = R(8, 12.5), r = R(2.1, 3);
      dummy.rotation.set(0, rng() * 3, 0);
      dummy.position.set(t.x, t.y - 0.3, t.z); dummy.scale.set(1, 2.4, 1); dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + 1.6, t.z); dummy.scale.set(r, hgt, r); dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
      col.set(rng() < 0.5 ? 0x2f5a3a : 0x3b6b42).multiplyScalar(R(0.9, 1.1));
      cones.setColorAt(i, col);
      cover.push({ x: t.x, z: t.z, r: r + 5, top: t.y + hgt + 4 });
    });
    stems.frustumCulled = cones.frustumCulled = false;
    cones.instanceColor.needsUpdate = true;
    root.add(stems, cones);
  }
  for (const t of trees) cover.push({ x: t.x, z: t.z, r: 10, top: t.top + 3 });

  function sheltered(p) {
    for (let i = 0; i < cover.length; i++) {
      const c = cover[i], dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz < c.r * c.r && p.y < c.top) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ clouds
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  for (let i = 0; i < 16; i++) {
    const parts = [];
    const blobs = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < blobs; k++) {
      const r = R(14, 26);
      parts.push({ geo: _uIco, color: 0xffffff, m: TRS(k * 17 - blobs * 8 + R(-4, 4), R(-3, 3), R(-8, 8), r, r * 0.42, r * 0.8) });
    }
    const m = new THREE.Mesh(mergeParts(parts), cloudMat);
    m.position.set(R(-800, 800), R(120, 185), R(-800, 800));
    root.add(m);
    clouds.push(m);
  }

  function update(dt) {
    for (const c of clouds) {
      c.position.x += dt * 2.2;
      if (c.position.x > 850) c.position.x = -850;
    }
  }

  return { root, H, ground, riverZ, trees, foods, sheltered, setFrost, update, start: START };
}

function updateFoodVisual(fd) {
  const show = Math.ceil((fd.amount / fd.max) * fd.items.length - 0.001);
  fd.items.forEach((m, i) => { m.visible = i < show; });
  fd.icon.visible = fd.amount > 0.5;
}

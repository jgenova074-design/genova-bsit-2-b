'use strict';

/* ---------- Renderer / Scene ---------- */
const host = document.getElementById('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec2ef);
scene.fog = new THREE.Fog(0xa8cdea, 60, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
host.appendChild(renderer.domElement);
const canvasEl = renderer.domElement;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- Lights ---------- */
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x4e7d3c, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
sun.position.set(60, 95, 40);
scene.add(sun);

/* ---------- Ground ---------- */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ color: 0x4e7d3c, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

/* ---------- World props: houses, trees, grass ---------- */
const colliders = [];
const solidObjects = [];

function pointInCollider(x, z, pad) {
  for (const c of colliders) {
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
  }
  return false;
}

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

const wallMats = [0xe9dcc2, 0xd9b98a, 0xc9d9e8, 0xd7c7e0, 0xcfe0c0].map(
  c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })
);
const roofMats = [0x9c3f31, 0x35566e, 0x6d4a2f, 0x8a3d55].map(
  c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
);
const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 });
const windowMat = new THREE.MeshStandardMaterial({
  color: 0xffd98a, emissive: 0xffb347, emissiveIntensity: 0.55, roughness: 0.4,
});
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 });
const leafMats = [0x2f6b35, 0x3c7d3e, 0x246027].map(
  c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })
);

function makeHouse(x, z, w, d, h, rotY) {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pick(wallMats));
  body.position.y = h / 2;
  g.add(body);

  const roofH = Math.min(w, d) * 0.5;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.78, roofH, 4),
    pick(roofMats)
  );
  roof.position.y = h + roofH / 2 - 0.02;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  // door on the +Z face
  const dh = Math.min(2.3, h * 0.72);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, dh, 0.12), doorMat);
  door.position.set(0, dh / 2, d / 2 + 0.06);
  g.add(door);

  // lit windows either side of the door
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.1), windowMat);
    win.position.set(sx * Math.min(w * 0.3, 2.2), h * 0.62, d / 2 + 0.06);
    g.add(win);
  }

  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  solidObjects.push(g);

  // axis-aligned footprint that covers the rotated box
  const c = Math.abs(Math.cos(rotY));
  const s = Math.abs(Math.sin(rotY));
  const hw = (w * c + d * s) / 2;
  const hd = (w * s + d * c) / 2;
  colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
}

function makeTree(x, z, scale) {
  const g = new THREE.Group();
  const trunkH = 3.4 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.32 * scale, trunkH, 6),
    trunkMat
  );
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const leafMat = pick(leafMats);
  if (Math.random() < 0.45) {
    // broad canopy
    for (let i = 0; i < 3; i++) {
      const r = (1.4 + Math.random() * 0.5) * scale;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leafMat);
      blob.position.set(
        (Math.random() - 0.5) * 1.3 * scale,
        trunkH + i * 0.5 * scale,
        (Math.random() - 0.5) * 1.3 * scale
      );
      g.add(blob);
    }
  } else {
    // pine
    for (let i = 0; i < 3; i++) {
      const r = (1.9 - i * 0.45) * scale;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.9 * scale, 7), leafMat);
      cone.position.y = trunkH * (0.72 + i * 0.26);
      g.add(cone);
    }
  }

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  solidObjects.push(g);

  const r = 0.45 * scale;
  colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
}

// Grass tufts: two crossed tapered quads, drawn as one instanced mesh.
function makeGrass(count) {
  const pos = [];
  const idx = [];
  let v = 0;
  for (const rot of [0, Math.PI / 2]) {
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const pts = [[-0.085, 0, 0], [0.085, 0, 0], [0.025, 0.55, 0.05], [-0.025, 0.55, 0.05]];
    for (const [px, py, pz] of pts) {
      pos.push(px * cs - pz * sn, py, px * sn + pz * cs);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let i = 0;
  let guard = 0;
  while (i < count && guard < count * 4) {
    guard++;
    const x = -105 + Math.random() * 210;
    const z = -105 + Math.random() * 210;
    if (pointInCollider(x, z, 0.2)) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.7 + Math.random() * 0.45;
    dummy.scale.set(s, s * (0.7 + Math.random() * 0.6), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const t = Math.random();
    col.setRGB(0.22 + t * 0.12, 0.42 + t * 0.14, 0.16 + t * 0.08);
    mesh.setColorAt(i, col);
    i++;
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

// Place houses, then trees, then scatter grass around everything.
let houses = 0;
for (let tries = 0; tries < 400 && houses < 9; tries++) {
  const w = 6 + Math.random() * 5;
  const d = 6 + Math.random() * 4;
  const h = 3 + Math.random() * 1.8;
  const x = -88 + Math.random() * 176;
  const z = -88 + Math.random() * 176;
  if (Math.hypot(x, z) < 20) continue;
  if (pointInCollider(x, z, Math.max(w, d) / 2 + 4)) continue;
  makeHouse(x, z, w, d, h, Math.random() * Math.PI * 2);
  houses++;
}

let trees = 0;
for (let tries = 0; tries < 1200 && trees < 55; tries++) {
  const x = -100 + Math.random() * 200;
  const z = -100 + Math.random() * 200;
  if (Math.hypot(x, z) < 12) continue;
  if (pointInCollider(x, z, 2)) continue;
  makeTree(x, z, 0.8 + Math.random() * 0.7);
  trees++;
}

makeGrass(16000);

/* ---------- Zone ---------- */
const zone = { r0: 95, r1: 16, r: 95, t: 0, dur: 150 };

const zoneMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 45, 64, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })
);
zoneMesh.position.y = 22;
scene.add(zoneMesh);

const zoneRing = new THREE.Mesh(
  new THREE.RingGeometry(0.985, 1, 128),
  new THREE.MeshBasicMaterial({ color: 0xff5566, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
);
zoneRing.rotation.x = -Math.PI / 2;
zoneRing.position.y = 0.06;
scene.add(zoneRing);

/* ---------- Player ---------- */
const player = {
  pos: new THREE.Vector3(0, 0, 0),
  y: 0,
  vy: 0,
  grounded: true,
  yaw: 0,
  pitch: 0,
  hp: 100,
  alive: true,
  kills: 0,
  fireCd: 0,
};
let mouseDown = false;
const keys = {};

/* ---------- First-person weapon ---------- */
// The gun is parented to the camera, so it must be part of the scene graph.
scene.add(camera);

const GUN_REST = new THREE.Vector3(0.26, -0.245, -0.52);
const gun = new THREE.Group();
gun.position.copy(GUN_REST);
gun.rotation.y = -0.05;
gun.rotation.x = 0.02;
gun.scale.setScalar(0.85);
gun.visible = false;
camera.add(gun);

const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a525d, roughness: 0.45, metalness: 0.7 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc08a63, roughness: 1 });

function part(w, h, d, x, y, z, mat, rx) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  gun.add(m);
  return m;
}

// receiver, barrel, muzzle, sight, stock, grip, magazine
part(0.075, 0.085, 0.34, 0, 0.02, -0.14, metalMat);
part(0.035, 0.035, 0.28, 0, 0.032, -0.42, darkMat);
part(0.05, 0.05, 0.03, 0, 0.032, -0.56, darkMat);
part(0.02, 0.035, 0.02, 0, 0.077, -0.3, darkMat);
part(0.06, 0.07, 0.13, 0, 0.015, 0.07, metalMat);
part(0.07, 0.19, 0.085, 0, -0.105, 0.03, darkMat, -0.25);
part(0.055, 0.14, 0.07, 0, -0.085, -0.145, darkMat, 0.16);

// hand on the grip + forearm running off screen-right
part(0.085, 0.1, 0.11, 0.005, -0.115, 0.02, skinMat);
const arm = part(0.095, 0.095, 0.3, 0.045, -0.19, 0.2, skinMat);
arm.rotation.x = -0.55;
arm.rotation.y = -0.12;

// muzzle flash: a soft additive flare made from a canvas gradient
function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.3, 'rgba(255,205,110,0.9)');
  grd.addColorStop(0.65, 'rgba(255,140,40,0.35)');
  grd.addColorStop(1, 'rgba(255,110,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const muzzleFlash = new THREE.Mesh(
  new THREE.PlaneGeometry(0.17, 0.17),
  new THREE.MeshBasicMaterial({
    map: makeFlashTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
);
muzzleFlash.position.set(0, 0.032, -0.585);
muzzleFlash.visible = false;
muzzleFlash.renderOrder = 999;
gun.add(muzzleFlash);

let recoil = 0;
let muzzleT = 0;
let bobPhase = 0;

// Small light riding with the camera so the view model is never a black silhouette.
const gunLight = new THREE.PointLight(0xdfe9ff, 0.85, 2.6);
gunLight.position.set(0.15, 0.3, 0.1);
camera.add(gunLight);

/* ---------- Bots ---------- */
const BOT_COUNT = 9;
let bots = [];

// Enemy photo texture. Bots are drawn as camera-facing billboards.
const ENEMY_TEX_ASPECT = 292 / 498;
const ENEMY_TEX_H = 2.6;
let enemyTexReady = false;
const enemyTex = new THREE.TextureLoader().load(
  'enemy.png',
  () => {
    enemyTexReady = true;
    for (const b of bots) if (b.fallback) b.fallback.visible = false;
  }
);
if (THREE.sRGBEncoding) enemyTex.encoding = THREE.sRGBEncoding;

function makeBot(id) {
  const group = new THREE.Group();

  // Fallback block figure, shown only until the photo texture loads.
  const mat = new THREE.MeshStandardMaterial({ color: 0xd13b3b, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), mat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat);
  head.position.y = 1.72;
  body.userData.botId = id;
  head.userData.botId = id;
  group.add(body);
  group.add(head);

  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: enemyTex,
    transparent: true,
    depthWrite: false,
  }));
  spr.scale.set(ENEMY_TEX_H * ENEMY_TEX_ASPECT, ENEMY_TEX_H, 1);
  spr.position.y = ENEMY_TEX_H / 2;
  spr.userData.botId = id;
  group.add(spr);

  if (enemyTexReady) { body.visible = false; head.visible = false; }

  const b = {
    id,
    mesh: group,
    fallback: body,
    pos: new THREE.Vector3(),
    hp: 100,
    alive: true,
    fireCd: 1 + Math.random(),
    wander: new THREE.Vector3(),
    wanderT: 0,
  };

  let x, z;
  do {
    x = -70 + Math.random() * 140;
    z = -70 + Math.random() * 140;
  } while (Math.hypot(x, z) < 16 || pointInCollider(x, z, 1.2));

  b.pos.set(x, 0, z);
  group.position.copy(b.pos);
  scene.add(group);
  return b;
}

/* ---------- Collision ---------- */
function resolveCollisions(p, radius) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (radius - d);
        p.z += (dz / d) * (radius - d);
      } else {
        const left = p.x - c.minX;
        const right = c.maxX - p.x;
        const front = p.z - c.minZ;
        const back = c.maxZ - p.z;
        const m = Math.min(left, right, front, back);
        if (m === left) p.x = c.minX - radius;
        else if (m === right) p.x = c.maxX + radius;
        else if (m === front) p.z = c.minZ - radius;
        else p.z = c.maxZ + radius;
      }
    }
  }
  p.x = Math.max(-97, Math.min(97, p.x));
  p.z = Math.max(-97, Math.min(97, p.z));
}

/* ---------- Audio ---------- */
let audioCtx = null;
let noiseBuf = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    const len = Math.floor(audioCtx.sampleRate * 0.4);
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// Synthesised gunshot: a filtered noise crack plus a low body thump.
function playGunshot(volume, pan) {
  if (!audioCtx || audioCtx.state === 'closed' || volume <= 0) return;
  const t = audioCtx.currentTime;

  const out = audioCtx.createGain();
  out.gain.value = 1;
  let tail = out;
  if (audioCtx.createStereoPanner) {
    const p = audioCtx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    out.connect(p);
    tail = p;
  }
  tail.connect(audioCtx.destination);

  // crack
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.85 + Math.random() * 0.3;

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500 + Math.random() * 900;
  bp.Q.value = 0.8;

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(7000, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.16);

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);

  src.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.3);

  // body thump
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(44, t + 0.15);

  const og = audioCtx.createGain();
  og.gain.setValueAtTime(volume * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

  osc.connect(og);
  og.connect(out);
  osc.start(t);
  osc.stop(t + 0.22);
}

// -1 = hard left, +1 = hard right, relative to where the player is facing.
function panFor(x, z) {
  const dx = x - camera.position.x;
  const dz = z - camera.position.z;
  const d = Math.hypot(dx, dz) || 1;
  return (dx / d) * Math.cos(player.yaw) + (dz / d) * -Math.sin(player.yaw);
}

/* ---------- Shooting ---------- */
const raycaster = new THREE.Raycaster();
const tracers = [];

function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, life: 0.08 });
}

function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.08);
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

function shoot() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const targets = bots.filter(b => b.alive).map(b => b.mesh).concat(solidObjects);
  const hits = raycaster.intersectObjects(targets, true);
  const end = new THREE.Vector3();
  if (hits.length > 0) {
    end.copy(hits[0].point);
    const botId = hits[0].object.userData.botId;
    if (botId !== undefined) {
      const bot = bots.find(b => b.id === botId);
      if (bot && bot.alive) damageBot(bot, 34);
    }
    // otherwise the shot hit a house or tree and simply stops there
  } else {
    end.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 90);
  }
  spawnTracer(camera.position.clone(), end);

  // view model kick + muzzle flash
  recoil = Math.min(recoil + 0.055, 0.1);
  muzzleT = 0.045;
  muzzleFlash.visible = true;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
  playGunshot(0.42, 0);
}

/* ---------- Damage ---------- */
function damageBot(bot, dmg) {
  bot.hp -= dmg;
  if (bot.hp <= 0 && bot.alive) {
    bot.alive = false;
    scene.remove(bot.mesh);
    player.kills++;
    updateHUD();
    if (bots.every(b => !b.alive)) endGame(true);
  }
}

let flashTimer = 0;
function damagePlayer(dmg) {
  if (!player.alive) return;
  player.hp -= dmg;
  const el = document.getElementById('damageFlash');
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 90);
  updateHUD();
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    endGame(false);
  }
}

/* ---------- Bot AI ---------- */
function segHitsBox(x1, z1, x2, z2, c) {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - c.minX, c.maxX - x1, z1 - c.minZ, c.maxZ - z1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

function hasLineOfSight(a, b) {
  for (const c of colliders) {
    if (segHitsBox(a.x, a.z, b.x, b.z, c)) return false;
  }
  return true;
}

function botShoot(b, dist) {
  spawnTracer(
    new THREE.Vector3(b.pos.x, 1.6, b.pos.z),
    new THREE.Vector3(player.pos.x, 1.6, player.pos.z)
  );
  // quieter with distance, panned to the side the bot is on
  playGunshot(0.34 * Math.max(0.06, 1 - dist / 45), panFor(b.pos.x, b.pos.z));
  const chance = Math.max(0.18, 0.8 - dist * 0.014);
  if (Math.random() < chance) damagePlayer(6 + Math.random() * 8);
}

function updateBots(dt) {
  for (const b of bots) {
    if (!b.alive) continue;
    b.fireCd -= dt;
    const dist = Math.hypot(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
    let target = null;

    if (player.alive && dist < 45) {
      if (dist > 7) target = player.pos;
      if (dist < 34 && b.fireCd <= 0 && hasLineOfSight(b.pos, player.pos)) {
        b.fireCd = 0.9 + Math.random() * 0.6;
        botShoot(b, dist);
      }
    } else {
      b.wanderT -= dt;
      if (b.wanderT <= 0) {
        b.wanderT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * zone.r * 0.8;
        b.wander.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      target = b.wander;
    }

    if (target) {
      const dx = target.x - b.pos.x;
      const dz = target.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        b.pos.x += (dx / d) * 4.2 * dt;
        b.pos.z += (dz / d) * 4.2 * dt;
        resolveCollisions(b.pos, 0.45);
      }
    }

    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(player.pos.x, b.pos.y, player.pos.z);
  }
}

/* ---------- Player Update ---------- */
function updatePlayer(dt) {
  const speed = 8.5;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);
  let mx = 0;
  let mz = 0;
  if (keys['w']) { mx += fx; mz += fz; }
  if (keys['s']) { mx -= fx; mz -= fz; }
  if (keys['d']) { mx += rx; mz += rz; }
  if (keys['a']) { mx -= rx; mz -= rz; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    player.pos.x += (mx / len) * speed * dt;
    player.pos.z += (mz / len) * speed * dt;
    resolveCollisions(player.pos, 0.5);
  }

  player.fireCd = Math.max(0, player.fireCd - dt);
  if (mouseDown && player.fireCd <= 0) {
    player.fireCd = 0.13;
    shoot();
  }

  // ---- view model animation: recoil, walk bob, muzzle flash ----
  recoil = Math.max(0, recoil - dt * 0.75);
  if (muzzleT > 0) {
    muzzleT -= dt;
    if (muzzleT <= 0) muzzleFlash.visible = false;
  }
  const moving = len > 0 && player.grounded;
  bobPhase += dt * (moving ? 9.5 : 2.2);
  const bobAmp = moving ? 0.013 : 0.0035;
  gun.position.set(
    GUN_REST.x + Math.cos(bobPhase) * bobAmp,
    GUN_REST.y + Math.abs(Math.sin(bobPhase)) * bobAmp - recoil * 0.12,
    GUN_REST.z + recoil * 0.38
  );
  gun.rotation.x = 0.02 - recoil * 1.5;
  gun.rotation.z = Math.sin(bobPhase) * bobAmp * 1.6;

  player.vy -= 18 * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.grounded = true;
  }

  camera.position.set(player.pos.x, 1.7 + player.y, player.pos.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

/* ---------- Zone Update ---------- */
function updateZone(dt) {
  zone.t += dt;
  const k = Math.min(1, zone.t / zone.dur);
  const e = k * k * (3 - 2 * k);
  zone.r = zone.r0 + (zone.r1 - zone.r0) * e;
  zoneMesh.scale.set(zone.r, 1, zone.r);
  zoneRing.scale.set(zone.r, zone.r, 1);
  if (player.alive) {
    const d = Math.hypot(player.pos.x, player.pos.z);
    if (d > zone.r) damagePlayer(dt * 10);
  }
}

/* ---------- HUD ---------- */
const hpFill = document.getElementById('hpFill');
const killsEl = document.getElementById('kills');
const aliveEl = document.getElementById('alive');
const zoneEl = document.getElementById('zone');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startBtn = document.getElementById('startBtn');
const lockHint = document.getElementById('lockHint');

function updateHUD() {
  hpFill.style.width = Math.max(0, Math.min(100, player.hp)) + '%';
  killsEl.textContent = player.kills;
  aliveEl.textContent = bots.filter(b => b.alive).length + (player.alive ? 1 : 0);
  zoneEl.textContent = Math.round(zone.r);
}

/* ---------- Game Flow ---------- */
let started = false;
let gameOver = false;

function resetGame() {
  player.pos.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.hp = 100;
  player.alive = true;
  player.kills = 0;
  player.fireCd = 0;
  player.y = 0;
  player.vy = 0;
  player.grounded = true;

  for (const b of bots) scene.remove(b.mesh);
  bots = [];
  for (let i = 0; i < BOT_COUNT; i++) bots.push(makeBot(i));

  for (const t of tracers) {
    scene.remove(t.line);
    t.line.geometry.dispose();
    t.line.material.dispose();
  }
  tracers.length = 0;

  zone.t = 0;
  zone.r = zone.r0;
  zoneMesh.scale.set(zone.r, 1, zone.r);
  zoneRing.scale.set(zone.r, zone.r, 1);

  started = true;
  gameOver = false;
  mouseDown = false;
  recoil = 0;
  muzzleT = 0;
  bobPhase = 0;
  muzzleFlash.visible = false;
  gun.position.copy(GUN_REST);
  gun.rotation.set(0.02, -0.05, 0);
  document.getElementById('hud').classList.add('on');
  overlay.classList.add('hidden');
  updateHUD();
}

function endGame(victory) {
  gameOver = true;
  mouseDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  lockHint.style.display = 'none';
  overlayTitle.textContent = victory ? 'Victory!' : 'You were eliminated';
  overlayText.textContent = victory ? 'You are the last one standing!' : 'Better luck next time.';
  startBtn.textContent = 'Play Again';
  overlay.classList.remove('hidden');
}

function startGame() {
  ensureAudio();
  resetGame();
  try {
    const p = canvasEl.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    /* pointer lock unavailable */
  }
}

/* ---------- Input ---------- */
document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key === ' ' && started && !gameOver && player.alive && player.grounded) {
    player.vy = 6.5;
    player.grounded = false;
  }
});
document.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvasEl) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch));
});

document.addEventListener('mousedown', e => {
  if (e.button === 0 && document.pointerLockElement === canvasEl) mouseDown = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvasEl;
  lockHint.style.display = (started && !gameOver && !locked) ? 'block' : 'none';
});

canvasEl.addEventListener('click', () => {
  ensureAudio();
  if (started && !gameOver && document.pointerLockElement !== canvasEl) {
    try {
      const p = canvasEl.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }
});

startBtn.addEventListener('click', startGame);

/* ---------- Loop ---------- */
let last = performance.now();

function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;
  if (started && !gameOver) {
    updatePlayer(dt);
    updateBots(dt);
    updateZone(dt);
    updateTracers(dt);
    updateHUD();
  } else {
    camera.position.set(player.pos.x, 1.7 + player.y, player.pos.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }
  gun.visible = started && !gameOver && player.alive;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

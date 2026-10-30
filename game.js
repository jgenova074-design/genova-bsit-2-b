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
  weapon: 0,
  ammo: 15,
  maxAmmo: 15,
  reloading: false,
  reloadT: 0,
  reloadDur: 1.6,
};
let mouseDown = false;
const keys = {};

/* ---------- First-person weapons ---------- */
// The guns are parented to the camera, so the camera must be in the scene graph.
scene.add(camera);

const WEAPONS = [
  { name: 'Rifle',  damage: 34,  fireRate: 0.13, reloadDur: 1.6, maxAmmo: 15, volume: 0.42, zoom: false },
  { name: 'Sniper', damage: 100, fireRate: 1.25, reloadDur: 2.6, maxAmmo: 5,  volume: 0.75, zoom: true  },
];

const GUN_REST = new THREE.Vector3(0.26, -0.245, -0.52);
const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a525d, roughness: 0.45, metalness: 0.7 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc08a63, roughness: 1 });

function part(parent, w, h, d, x, y, z, mat, rx, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  if (ry) m.rotation.y = ry;
  parent.add(m);
  return m;
}

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

const flashTex = makeFlashTexture();

function makeGun(type) {
  const g = new THREE.Group();
  g.position.copy(GUN_REST);
  g.rotation.y = -0.05;
  g.rotation.x = 0.02;
  g.scale.setScalar(type === 1 ? 0.9 : 0.85);
  g.visible = false;

  if (type === 0) {
    // assault rifle
    part(g, 0.075, 0.085, 0.34, 0, 0.02, -0.14, metalMat);
    part(g, 0.035, 0.035, 0.28, 0, 0.032, -0.42, darkMat);
    part(g, 0.05, 0.05, 0.03, 0, 0.032, -0.56, darkMat);
    part(g, 0.02, 0.035, 0.02, 0, 0.077, -0.3, darkMat);
    part(g, 0.06, 0.07, 0.13, 0, 0.015, 0.07, metalMat);
    part(g, 0.07, 0.19, 0.085, 0, -0.105, 0.03, darkMat, -0.25);
    part(g, 0.055, 0.14, 0.07, 0, -0.085, -0.145, darkMat, 0.16);
  } else {
    // sniper rifle: long barrel, scope, wooden stock
    part(g, 0.06, 0.07, 0.62, 0, 0.02, -0.28, metalMat);
    part(g, 0.028, 0.028, 0.55, 0, 0.032, -0.78, darkMat);
    part(g, 0.04, 0.04, 0.04, 0, 0.032, -1.06, darkMat);
    part(g, 0.05, 0.05, 0.18, 0, 0.095, -0.35, darkMat);
    part(g, 0.025, 0.025, 0.06, 0, 0.095, -0.22, darkMat);
    part(g, 0.025, 0.025, 0.06, 0, 0.095, -0.48, darkMat);
    part(g, 0.06, 0.05, 0.22, 0, 0.015, 0.12, woodMat);
    part(g, 0.07, 0.16, 0.09, 0, -0.1, 0.06, darkMat, -0.2);
    part(g, 0.05, 0.12, 0.06, 0, -0.07, -0.1, darkMat, 0.15);
  }

  // hand + forearm (shared)
  part(g, 0.085, 0.1, 0.11, 0.005, -0.115, 0.02, skinMat);
  const arm = part(g, 0.095, 0.095, 0.3, 0.045, -0.19, 0.22, skinMat);
  arm.rotation.x = -0.55;
  arm.rotation.y = -0.12;

  // muzzle flash
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    })
  );
  flash.position.set(0, 0.032, type === 1 ? -1.1 : -0.585);
  flash.visible = false;
  flash.renderOrder = 999;
  g.add(flash);
  g.userData.flash = flash;

  camera.add(g);
  return g;
}

const gunGroups = [makeGun(0), makeGun(1)];
let activeGun = gunGroups[0];
let muzzleFlash = activeGun.userData.flash;

let recoil = 0;
let muzzleT = 0;
let bobPhase = 0;
let reloadAnim = 0;
let zoomed = false;

function setZoom(on) {
  if (!WEAPONS[player.weapon].zoom) on = false;
  zoomed = on;
  camera.fov = on ? 18 : 75;
  camera.updateProjectionMatrix();
}

function applyWeapon(w) {
  if (w < 0 || w >= WEAPONS.length) return;
  player.weapon = w;
  const cfg = WEAPONS[w];
  player.maxAmmo = cfg.maxAmmo;
  player.reloadDur = cfg.reloadDur;
  player.ammo = cfg.maxAmmo;
  player.reloading = false;
  player.reloadT = 0;
  player.fireCd = 0;
  zoomed = false;
  camera.fov = 75;
  camera.updateProjectionMatrix();
  for (let i = 0; i < gunGroups.length; i++) gunGroups[i].visible = (i === w);
  activeGun = gunGroups[w];
  muzzleFlash = activeGun.userData.flash;
  activeGun.position.copy(GUN_REST);
  activeGun.rotation.set(0.02, -0.05, 0);
  activeGun.scale.setScalar(w === 1 ? 0.9 : 0.85);
  reloadAnim = 0;
  updateHUD();
}

function playSwitchSound() {
  if (!audioCtx || audioCtx.state === 'closed') return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + 0.12);
}

// Small light riding with the camera so the view model is never a black silhouette.
const gunLight = new THREE.PointLight(0xdfe9ff, 0.85, 2.6);
gunLight.position.set(0.15, 0.3, 0.1);
camera.add(gunLight);
/* ---------- Bots ---------- */
const BOT_COUNT = 9;
let bots = [];

// Enemy photos: the first 5 bots use the new one, the rest the original.
const ENEMY_TEX_H = 2.6;
const ENEMY_TEX_LIST = [
  { path: 'enemy.png',  aspect: 292 / 498, tex: null, ready: false },
  { path: 'enemy2.png', aspect: 443 / 533, tex: null, ready: false },
];
for (const e of ENEMY_TEX_LIST) {
  e.tex = new THREE.TextureLoader().load(e.path, () => {
    e.ready = true;
    for (const b of bots) if (b.fallback && b.texInfo === e) b.fallback.visible = false;
  });
  if (THREE.sRGBEncoding) e.tex.encoding = THREE.sRGBEncoding;
}

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

  // Which photo this bot uses: first 5 -> new picture, rest -> original.
  const texInfo = id < 5 ? ENEMY_TEX_LIST[1] : ENEMY_TEX_LIST[0];

  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texInfo.tex,
    transparent: true,
    depthWrite: false,
  }));
  spr.scale.set(ENEMY_TEX_H * texInfo.aspect, ENEMY_TEX_H, 1);
  spr.position.y = ENEMY_TEX_H / 2;
  spr.userData.botId = id;
  group.add(spr);

  if (texInfo.ready) { body.visible = false; head.visible = false; }

  const b = {
    id,
    mesh: group,
    fallback: body,
    texInfo,
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
function playGunshot(volume, pan, sniper) {
  if (!audioCtx || audioCtx.state === 'closed' || volume <= 0) return;
  const t = audioCtx.currentTime;
  sniper = !!sniper;

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
  src.playbackRate.value = sniper ? 0.5 + Math.random() * 0.12 : 0.85 + Math.random() * 0.3;

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = sniper ? 700 + Math.random() * 300 : 1500 + Math.random() * 900;
  bp.Q.value = sniper ? 1.2 : 0.8;

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(sniper ? 4000 : 7000, t);
  lp.frequency.exponentialRampToValueAtTime(sniper ? 280 : 500, t + (sniper ? 0.3 : 0.16));

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (sniper ? 0.55 : 0.26));

  src.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + (sniper ? 0.6 : 0.3));

  // body thump
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(sniper ? 80 : 150, t);
  osc.frequency.exponentialRampToValueAtTime(sniper ? 32 : 44, t + (sniper ? 0.3 : 0.15));

  const og = audioCtx.createGain();
  og.gain.setValueAtTime(volume * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + (sniper ? 0.35 : 0.2));

  osc.connect(og);
  og.connect(out);
  osc.start(t);
  osc.stop(t + (sniper ? 0.4 : 0.22));
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
  if (!player.alive || player.reloading || player.ammo <= 0) return;
  player.ammo--;
  if (player.ammo <= 0) startReload();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const targets = bots.filter(b => b.alive).map(b => b.mesh).concat(solidObjects);
  const hits = raycaster.intersectObjects(targets, true);
  const end = new THREE.Vector3();
  if (hits.length > 0) {
    end.copy(hits[0].point);
    const botId = hits[0].object.userData.botId;
    if (botId !== undefined) {
      const bot = bots.find(b => b.id === botId);
      if (bot && bot.alive) damageBot(bot, WEAPONS[player.weapon].damage);
    }
    // otherwise the shot hit a house or tree and simply stops there
  } else {
    end.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 90);
  }
  spawnTracer(camera.position.clone(), end);

  // view model kick + muzzle flash
  recoil = Math.min(recoil + (player.weapon === 1 ? 0.14 : 0.055), 0.16);
  muzzleT = 0.045;
  muzzleFlash.visible = true;
  muzzleFlash.rotation.z = Math.random() * Math.PI;
  muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
  playGunshot(WEAPONS[player.weapon].volume, 0, player.weapon === 1);
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

/* ---------- Reload ---------- */

function playReloadSound(stage) {
  if (!audioCtx || audioCtx.state === 'closed') return;
  const t = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.value = 1;
  let tail = out;
  if (audioCtx.createStereoPanner) {
    const p = audioCtx.createStereoPanner();
    p.pan.value = 0;
    out.connect(p);
    tail = p;
  }
  tail.connect(audioCtx.destination);

  // metallic tap
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = stage === 'in' ? 1.6 : 1.1;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = stage === 'in' ? 3200 : 1800;
  bp.Q.value = 4;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.12);

  // low clack
  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(stage === 'in' ? 120 : 90, t);
  osc.frequency.exponentialRampToValueAtTime(stage === 'in' ? 60 : 50, t + 0.12);
  const og = audioCtx.createGain();
  og.gain.setValueAtTime(0.16, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(og);
  og.connect(out);
  osc.start(t);
  osc.stop(t + 0.16);
}

function startReload() {
  if (!player.alive || player.reloading || player.ammo >= player.maxAmmo) return;
  player.reloading = true;
  player.reloadT = player.reloadDur;
  playReloadSound('out');
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
    player.fireCd = WEAPONS[player.weapon].fireRate;
    shoot();
  }

  // ---- reload ----
  if (player.reloading) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      player.ammo = player.maxAmmo;
      player.reloading = false;
      player.reloadT = 0;
      playReloadSound('in');
    }
  }

  // ---- view model animation: recoil, walk bob, reload tilt, muzzle flash ----
  recoil = Math.max(0, recoil - dt * 0.75);
  if (muzzleT > 0) {
    muzzleT -= dt;
    if (muzzleT <= 0) muzzleFlash.visible = false;
  }
  const targetReloadAnim = player.reloading ? 1 : 0;
  reloadAnim += (targetReloadAnim - reloadAnim) * Math.min(1, dt * 7);
  const moving = len > 0 && player.grounded;
  bobPhase += dt * (moving ? 9.5 : 2.2);
  const bobAmp = moving ? 0.013 : 0.0035;
  activeGun.position.set(
    GUN_REST.x + Math.cos(bobPhase) * bobAmp,
    GUN_REST.y + Math.abs(Math.sin(bobPhase)) * bobAmp - recoil * 0.12 + reloadAnim * 0.15,
    GUN_REST.z + recoil * 0.38
  );
  activeGun.rotation.x = 0.02 - recoil * 1.5 + reloadAnim * 0.5;
  activeGun.rotation.z = Math.sin(bobPhase) * bobAmp * 1.6 + reloadAnim * 0.25;

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
const ammoEl = document.getElementById('ammo');
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
  if (ammoEl) {
    const name = WEAPONS[player.weapon].name;
    if (player.reloading) ammoEl.textContent = name + ' | Reloading...';
    else ammoEl.textContent = name + ' | ' + player.ammo + ' / ' + player.maxAmmo;
  }
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
  applyWeapon(0);

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
  activeGun.position.copy(GUN_REST);
  activeGun.rotation.set(0.02, -0.05, 0);
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
  if (e.key.toLowerCase() === 'r') {
    if (started && !gameOver && player.alive) startReload();
  }
  if (e.key === '1') {
    if (started && !gameOver && player.alive) { applyWeapon(0); playSwitchSound(); }
  }
  if (e.key === '2') {
    if (started && !gameOver && player.alive) { applyWeapon(1); playSwitchSound(); }
  }
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
  if (e.button === 2) {
    if (started && !gameOver && player.alive) setZoom(true);
    return;
  }
  if (e.button === 0 && document.pointerLockElement === canvasEl) mouseDown = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 2) setZoom(false);
  if (e.button === 0) mouseDown = false;
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvasEl;
  lockHint.style.display = (started && !gameOver && !locked) ? 'block' : 'none';
});

canvasEl.addEventListener('wheel', (e) => {
  if (!started || gameOver || !player.alive) return;
  e.preventDefault();
  const dir = e.deltaY > 0 ? 1 : -1;
  applyWeapon((player.weapon + dir + WEAPONS.length) % WEAPONS.length);
  playSwitchSound();
}, { passive: false });

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
  activeGun.visible = started && !gameOver && player.alive;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

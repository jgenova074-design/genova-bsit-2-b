'use strict';

/* ---------- Renderer / Scene ---------- */
const host = document.getElementById('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 70, 190);

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
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a2430, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(50, 90, 30);
scene.add(sun);

/* ---------- Ground ---------- */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(220, 220),
  new THREE.MeshStandardMaterial({ color: 0x16222e, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(220, 55, 0x2e4a66, 0x1e3348);
grid.position.y = 0.02;
scene.add(grid);

/* ---------- Obstacles ---------- */
const colliders = [];
const boxMat = new THREE.MeshStandardMaterial({ color: 0x33506e, roughness: 0.9 });

function pointInCollider(x, z, pad) {
  for (const c of colliders) {
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
  }
  return false;
}

let placed = 0;
while (placed < 26) {
  const w = 2 + Math.random() * 6;
  const d = 2 + Math.random() * 6;
  const h = 2 + Math.random() * 9;
  const x = -85 + Math.random() * 170;
  const z = -85 + Math.random() * 170;
  if (Math.hypot(x, z) < 14) continue;
  if (pointInCollider(x, z, Math.max(w, d) / 2 + 1)) continue;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
  mesh.position.set(x, h / 2, z);
  scene.add(mesh);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  placed++;
}

/* ---------- Zone ---------- */
const zone = { r0: 95, r1: 16, r: 95, t: 0, dur: 150 };

const zoneMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 60, 64, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })
);
zoneMesh.position.y = 30;
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

/* ---------- Bots ---------- */
const BOT_COUNT = 9;
let bots = [];

function makeBot(id) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd13b3b, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), mat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat);
  head.position.y = 1.72;
  group.add(body);
  group.add(head);
  body.userData.botId = id;
  head.userData.botId = id;

  const b = {
    id,
    mesh: group,
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
  const meshes = bots.filter(b => b.alive).map(b => b.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  const end = new THREE.Vector3();
  if (hits.length > 0) {
    end.copy(hits[0].point);
    const botId = hits[0].object.userData.botId;
    const bot = bots.find(b => b.id === botId);
    if (bot && bot.alive) damageBot(bot, 34);
  } else {
    end.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 90);
  }
  spawnTracer(camera.position.clone(), end);
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
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

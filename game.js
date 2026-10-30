'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startBtn = document.getElementById('startBtn');

const VIEW_W = 960;
const VIEW_H = 540;
const WORLD_W = 3600;
const WORLD_H = 3600;
const PLAYER_R = 30;
const PLAYER_SPEED = 320;
const BOT_R = 24;
const BOT_SPEED = 150;
// How much of the world fits on screen. Smaller = more zoomed in.
const VIEW_WORLD_W = 1500;
const S = VIEW_W / VIEW_WORLD_W;

// Enemy sprite (the photo). Aspect is baked into the cropped PNG.
const ENEMY_IMG = new Image();
const ENEMY_ASPECT = 292 / 498;
const ENEMY_WORLD_H = 110;
let enemyReady = false;
ENEMY_IMG.onload = () => { enemyReady = true; };
ENEMY_IMG.src = 'enemy.png';

canvas.width = VIEW_W;
canvas.height = VIEW_H;

const WEAPONS = {
  pistol:   { name: 'Pistol',   damage: 26, range: 950,  fireRate: 0.30, spread: 0.03, pellets: 1, reload: 0.9 },
  rifle:    { name: 'Rifle',    damage: 48, range: 1600, fireRate: 0.09, spread: 0.010, pellets: 1, reload: 0 },
  shotgun:  { name: 'Shotgun',  damage: 80, range: 560,  fireRate: 0.85, spread: 0.06, pellets: 6, reload: 1.2 },
};

const BOT_TEMPLATES = [
  { weapon: 'pistol',   speed: 165, hp: 80 },
  { weapon: 'pistol',   speed: 150, hp: 90 },
  { weapon: 'shotgun',  speed: 150, hp: 70 },
  { weapon: 'rifle',    speed: 195, hp: 70 },
  { weapon: 'pistol',   speed: 160, hp: 90 },
  { weapon: 'rifle',    speed: 200, hp: 70 },
  { weapon: 'shotgun',  speed: 140, hp: 80 },
  { weapon: 'pistol',   speed: 180, hp: 85 },
  { weapon: 'rifle',    speed: 185, hp: 70 },
];

let player, bots, pickups, bullets, killFeed, zone, elapsed, started, gameOver, win;
let keys = {};
let mouseDown = false;
let mouse = { x: VIEW_W / 2, y: VIEW_H / 2 };
let fireCooldown = 0;
let camX = 0;
let camY = 0;
let last = performance.now();

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Bots spawn in a ring around the middle so they are reachable on screen.
function botSpawnPoint() {
  const a = Math.random() * Math.PI * 2;
  const r = 260 + Math.random() * 1000;
  return {
    x: clamp(WORLD_W / 2 + Math.cos(a) * r, 120, WORLD_W - 120),
    y: clamp(WORLD_H / 2 + Math.sin(a) * r, 120, WORLD_H - 120),
  };
}

function createBot(i) {
  const t = BOT_TEMPLATES[i % BOT_TEMPLATES.length];
  const p = botSpawnPoint();
  return {
    id: i, name: 'Bot-' + (i + 1),
    x: p.x, y: p.y,
    r: BOT_R, hp: t.hp, maxHp: t.hp, weapon: t.weapon, speed: t.speed,
    alive: true, cooldown: 0, state: 'loot', stateTimer: Math.random() * 2, targetId: null, respawnT: 0,
  };
}

function respawnBot(b) {
  const p = botSpawnPoint();
  b.alive = true;
  b.hp = b.maxHp;
  b.cooldown = 0;
  b.state = 'loot';
  b.stateTimer = 0;
  b.targetId = null;
  b.x = p.x;
  b.y = p.y;
}

function respawnPlayer() {
  player.alive = true;
  player.hp = 100;
  player.weapon = 'pistol';
  player.respawnT = 0;
  player.x = 200 + Math.random() * (WORLD_W - 400);
  player.y = 200 + Math.random() * (WORLD_H - 400);
}

function resetWorld() {
  player = { x: WORLD_W / 2, y: WORLD_H / 2, r: PLAYER_R, hp: 100, weapon: 'pistol', kills: 0, alive: true, respawnT: 0 };
  bots = [];
  for (let i = 0; i < 9; i++) bots.push(createBot(i));
  pickups = [];
  const names = Object.keys(WEAPONS);
  for (let i = 0; i < 6; i++) {
    pickups.push({ x: 150 + Math.random() * (WORLD_W - 300), y: 150 + Math.random() * (WORLD_H - 300), weapon: names[Math.floor(Math.random() * names.length)] });
  }
  bullets = [];
  killFeed = [];
  zone = { cx: WORLD_W / 2, cy: WORLD_H / 2, r0: 1400, r1: 300, t0: 0, dur: 200 };
  elapsed = 0;
  win = false;
  gameOver = false;
  fireCooldown = 0;
}

function checkWin() {
  if (player.alive && bots.length > 0 && bots.every(b => !b.alive)) {
    win = true;
    gameOver = true;
    overlayTitle.textContent = 'Victory!';
    overlayText.textContent = 'You are the last one standing!';
    startBtn.textContent = 'Play Again';
    overlay.classList.remove('hidden');
  }
}

function firePlayer() {
  const w = WEAPONS[player.weapon];
  const base = player.angle;
  for (let i = 0; i < w.pellets; i++) {
    const a = base + (Math.random() - 0.5) * w.spread * 2;
    bullets.push({ x: player.x + Math.cos(a) * player.r, y: player.y + Math.sin(a) * player.r, dx: Math.cos(a), dy: Math.sin(a), dmg: w.damage, life: 1.5, owner: player });
  }
}

function fireBot(b, ang) {
  const w = WEAPONS[b.weapon];
  for (let i = 0; i < w.pellets; i++) {
    const a = ang + (Math.random() - 0.5) * w.spread * 2;
    bullets.push({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, dx: Math.cos(a), dy: Math.sin(a), dmg: w.damage, life: 1.5, owner: b });
  }
}

function damageBot(b, dmg, killer) {
  b.hp -= dmg;
  if (b.hp <= 0 && b.alive) {
    b.alive = false;
    b.respawnT = 3;
    killFeed.push(killer === player ? 'You eliminated ' + b.name : killer.name + ' eliminated ' + b.name);
    if (killer === player) player.kills++;
    if (player.alive && bots.every(o => !o.alive)) checkWin();
  }
}

function damagePlayer(dmg) {
  player.hp -= dmg;
  if (player.hp <= 0 && player.alive) {
    player.alive = false;
    player.respawnT = 3;
    killFeed.push('You were eliminated');
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bl = bullets[i];
    bl.x += bl.dx * 1500 * dt;
    bl.y += bl.dy * 1500 * dt;
    bl.life -= dt;
    let dead = bl.life <= 0;
    if (!dead) {
      if (bl.owner === player) {
        for (const b of bots) {
          if (!b.alive) continue;
          if (Math.hypot(b.x - bl.x, b.y - bl.y) < b.r + 2) { dead = true; damageBot(b, bl.dmg, player); break; }
        }
      } else {
        for (const b of bots) {
          if (!b.alive || b === bl.owner) continue;
          if (Math.hypot(b.x - bl.x, b.y - bl.y) < b.r + 2) { dead = true; damageBot(b, bl.dmg, bl.owner); break; }
        }
        if (!dead && player.alive && Math.hypot(player.x - bl.x, player.y - bl.y) < player.r + 2) { dead = true; damagePlayer(bl.dmg); }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

function updateBot(b, dt) {
  b.cooldown = Math.max(0, b.cooldown - dt);
  b.stateTimer -= dt;
  if (b.stateTimer <= 0) {
    b.stateTimer = 0.8;
    let target = null;
    let best = Infinity;
    const consider = (t) => { if (!t) return; const d = Math.hypot(t.x - b.x, t.y - b.y); if (d < best) { best = d; target = t; } };
    for (const o of bots) { if (o.id === b.id || !o.alive) continue; consider(o); }
    consider(player);
    if (target) { b.state = 'fight'; b.targetId = target.id; }
    else { b.state = 'loot'; b.targetId = null; }
  }
  let tx = b.x, ty = b.y, hasTarget = false;
  if (b.state === 'fight' && b.targetId != null) {
    const t = b.targetId === 'player' ? player : bots.find(o => o.id === b.targetId);
    if (t && t.alive) { tx = t.x; ty = t.y; hasTarget = true; }
  }
  if (!hasTarget) {
    let bestP = null, bd = Infinity;
    for (const p of pickups) { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; bestP = p; } }
    if (bestP) { tx = bestP.x; ty = bestP.y; hasTarget = true; }
  }
  const dx = tx - b.x, dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  if (hasTarget && d > 30) {
    const speed = b.speed * Math.min(1, d / 250);
    b.x = clamp(b.x + (dx / d) * speed * dt, b.r, WORLD_W - b.r);
    b.y = clamp(b.y + (dy / d) * speed * dt, b.r, WORLD_H - b.r);
    b.angle = Math.atan2(dy, dx);
  }
  if (hasTarget) {
    const t = b.targetId === 'player' ? player : bots.find(o => o.id === b.targetId);
    if (t && t.alive) {
      const w = WEAPONS[b.weapon];
      const dd = Math.hypot(t.x - b.x, t.y - b.y);
      if (dd < w.range && b.cooldown <= 0) {
        const diff = Math.atan2(t.y - b.y, t.x - b.x) - b.angle;
        const diff2 = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
        if (diff2 < w.spread) { b.cooldown = w.fireRate; fireBot(b, Math.atan2(t.y - b.y, t.x - b.x)); }
      }
    }
  }
}

function movePlayer(dt) {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['ArrowUp']) dy -= 1;
  if (keys['s'] || keys['ArrowDown']) dy += 1;
  if (keys['a'] || keys['ArrowLeft']) dx -= 1;
  if (keys['d'] || keys['ArrowRight']) dx += 1;
  let len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  player.x = clamp(player.x + dx * PLAYER_SPEED * dt, player.r, WORLD_W - player.r);
  player.y = clamp(player.y + dy * PLAYER_SPEED * dt, player.r, WORLD_H - player.r);
}

function update(dt) {
  elapsed += dt;
  const t = clamp(elapsed / zone.dur, 0, 1);
  const e = t * t * (3 - 2 * t);
  zone.r = zone.r0 + (zone.r1 - zone.r0) * e;

  camX = clamp(player.x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W));
  camY = clamp(player.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H));

  const mwx = camX + mouse.x / S;
  const mwy = camY + mouse.y / S;
  player.angle = Math.atan2(mwy - player.y, mwx - player.x);

  if (!player.alive) { player.respawnT -= dt; if (player.respawnT <= 0) respawnPlayer(); }

  if (player.alive) {
    movePlayer(dt);
    const w = WEAPONS[player.weapon];
    if ((mouseDown || keys[' '] === true) && fireCooldown <= 0) { firePlayer(); fireCooldown = w.fireRate; }
  }
  fireCooldown = Math.max(0, fireCooldown - dt);

  for (const b of bots) {
    if (!b.alive) { b.respawnT -= dt; if (b.respawnT <= 0) respawnBot(b); continue; }
    updateBot(b, dt);
  }

  updateBullets(dt);

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (Math.hypot(p.x - player.x, p.y - player.y) < 45) { player.weapon = p.weapon; pickups.splice(i, 1); }
  }

  if (player.alive) {
    const d = Math.hypot(player.x - zone.cx, player.y - zone.cy);
    if (d > zone.r) damagePlayer(dt * 12);
  }

  checkWin();
}

function render() {
  camX = clamp(player.x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W));
  camY = clamp(player.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H));
  const sx = x => (x - camX) * S;
  const sy = y => (y - camY) * S;

  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Zone
  ctx.beginPath();
  ctx.arc(sx(zone.cx), sy(zone.cy), zone.r * S, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,60,60,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,70,70,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Pickups
  for (const p of pickups) {
    const x = sx(p.x), y = sy(p.y);
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd54a';
    ctx.fill();
    ctx.strokeStyle = '#8a6d00';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#3a2c00';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.weapon === 'pistol' ? 'P' : p.weapon === 'rifle' ? 'R' : 'S', x, y);
  }

  // Bullets
  ctx.lineCap = 'round';
  for (const bl of bullets) {
    ctx.beginPath();
    ctx.moveTo(sx(bl.x), sy(bl.y));
    ctx.lineTo(sx(bl.x + bl.dx * 14), sy(bl.y + bl.dy * 14));
    ctx.strokeStyle = '#7df9ff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Bots (drawn as the enemy photo, centred on their hitbox)
  const spriteH = ENEMY_WORLD_H * S;
  const spriteW = spriteH * ENEMY_ASPECT;
  for (const b of bots) {
    if (!b.alive) continue;
    const x = sx(b.x);
    const y = sy(b.y);

    // shadow at the feet
    const feetY = y + spriteH / 2;
    ctx.beginPath();
    ctx.ellipse(x, feetY, spriteW * 0.32, spriteW * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    if (enemyReady) {
      // red rim so the dark sprite separates from the dark ground
      ctx.save();
      ctx.shadowColor = 'rgba(255,70,70,0.9)';
      ctx.shadowBlur = 14;
      ctx.drawImage(ENEMY_IMG, x - spriteW / 2, y - spriteH / 2, spriteW, spriteH);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, b.r * S, 0, Math.PI * 2);
      ctx.fillStyle = '#c0392b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // aim indicator
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(b.angle) * (b.r * 1.6 * S), y + Math.sin(b.angle) * (b.r * 1.6 * S));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // hp bar above the head
    if (b.hp < b.maxHp) {
      const bw2 = spriteW * 0.8;
      const bx2 = x - bw2 / 2;
      const by2 = y - spriteH / 2 - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx2, by2, bw2, 5);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(bx2, by2, bw2 * Math.max(0, b.hp / b.maxHp), 5);
    }
  }

  // Player
  if (player.alive) {
    ctx.beginPath();
    ctx.arc(sx(player.x), sy(player.y), player.r * S, 0, Math.PI * 2);
    ctx.fillStyle = '#27ae60';
    ctx.fill();
    ctx.strokeStyle = '#e8f8ef';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Crosshair (screen space)
  const cx2 = mouse.x;
  const cy2 = mouse.y;
  ctx.beginPath();
  ctx.moveTo(cx2 - 8, cy2);
  ctx.lineTo(cx2 + 8, cy2);
  ctx.moveTo(cx2, cy2 - 8);
  ctx.lineTo(cx2, cy2 + 8);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // HP bar
  const bx = VIEW_W / 2 - 100, by = 12, bw = 200, bh = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = player.hp > 30 ? '#27ae60' : '#e74c3c';
  ctx.fillRect(bx, by, bw * Math.min(1, Math.max(0, player.hp / 100)), bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(WEAPONS[player.weapon].name, VIEW_W - 16, 36);

  // Kill feed
  ctx.textAlign = 'left';
  ctx.font = '13px monospace';
  const recent = killFeed.slice(-4);
  recent.forEach((k, i) => {
    const y = 12 + i * 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(12, y - 12, 280, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(k, 20, y);
  });

  // Low HP warning
  if (player.alive && player.hp < 30) {
    ctx.fillStyle = 'rgba(231,76,60,0.25)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function startGame() {
  resetWorld();
  started = true;
  overlayTitle.textContent = 'Genova Battle Royale';
  overlayText.textContent = 'Last one standing wins.';
  startBtn.textContent = 'Start';
  overlay.classList.add('hidden');
}

function loop(ts) {
  const dt = Math.min((ts - last) / 1000, 0.05);
  last = ts;
  if (started) { update(dt); render(); }
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Enter') startGame();
  if (e.key === ' ') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W;
  mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H;
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
canvas.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
startBtn.addEventListener('click', startGame);

requestAnimationFrame(loop);

# genova-bsit-2-b

Browser games built with vanilla JavaScript and Three.js. No build step — just open the HTML files.

## 2D Battle Royale

Open `index.html` in a browser.

Top-down arena shooter vs 9 bots with a shrinking zone. Last one standing wins.

**Controls:** WASD / Arrows to move · Mouse to aim · Left click or Space to shoot

## 3D Battle Royale

Open `br3d/index.html` in a browser.

First-person shooter vs 9 bots with a shrinking zone. Last one standing wins.

**Controls:** WASD to move · Space to jump · Mouse to look · Left click to shoot

The player holds a first-person weapon model (built from boxes in `br3d/game.js`) with a muzzle flash, recoil
kick, and walk bob. In the 2D game the player avatar carries a barrel that follows the aim direction.

`br3d/three.min.js` is bundled locally, so the 3D game works offline.

## Enemy sprite

The enemies are the photo in `enemy.png` (cropped to its transparent edges). In the 2D game it is drawn as a
sprite with a red rim glow; in the 3D game it is a camera-facing billboard. Both games fall back to simple
shapes if the image fails to load.


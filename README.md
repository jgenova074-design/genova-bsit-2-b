# genova-bsit-2-b

Browser games built with vanilla JavaScript and Three.js. No build step — just open `index.html`.

## 3D Battle Royale (main page)

Open `index.html` in a browser.

First-person shooter vs 9 bots with a shrinking zone. Last one standing wins.

**Controls:** WASD to move · Space to jump · Mouse to look · Left click to shoot

The player holds a first-person weapon model (built from boxes in `game.js`) with a muzzle flash, recoil
kick, and walk bob. `three.min.js` is bundled locally, so the game works offline.

## 2D Battle Royale

Open `2d/index.html` in a browser — or click "Play the 2D version" on the main page.

Top-down arena shooter vs 9 bots with a shrinking zone. Last one standing wins.

**Controls:** WASD / Arrows to move · Mouse to aim · Left click or Space to shoot

The player avatar carries a barrel that follows the aim direction.

## Enemy sprite

The enemies are the photo in `enemy.png` (cropped to its transparent edges, with a copy in `2d/`). In the 3D
game it is a camera-facing billboard; in the 2D game it is a sprite with a red rim glow. Both games fall back
to simple shapes if the image fails to load.

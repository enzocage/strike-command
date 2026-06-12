# Strike Command: Fog of War

Strike Command: Fog of War is a premium, procedurally generated 3D artillery tactical game built with **Three.js** and styled with a sleek futuristic cyber-military aesthetic. Players engage in tactical turn-based combat, controlling a squad of tanks, capturing control points, and outmaneuvering the enemy under dynamic weather and atmospheric lighting.

---

## 📸 Screenshots & Showcase

### 1. Tactical Battlefield & Procedural Terrain
Procedurally generated heights, custom coastal ocean swells, and dynamic lighting create a vibrant and immersive battlefield.
![Strike Command Gameplay - 3D Tactical Battlefield](gfx/ss1.png)

### 2. Aiming & Projectile Cam (Missile View)
Aim your turret, adjust power, and watch your shells fly in a picture-in-picture missile cam view.
![Combat Phase - Aiming and Target Acquisition](gfx/ss2.jpg)

### 3. Detailed Kampfbericht (After-Action Statistics)
Track your shots fired, hit accuracy, total damage, neutralizations, and captured control points.
![Victory Kampfbericht - End-of-game Statistics](gfx/ss3.jpg)

---

## 🇩🇪 Deutsche Spielanleitung

### 🎯 Ziel des Spiels
Es gibt zwei Wege, um die Partie zu gewinnen:
1. **Vernichtung**: Vernichten Sie alle 10 feindlichen Panzer des Gegners.
2. **Kontrollpunkte**: Sammeln Sie als Erster **12 Kontrollpunkt-Punkte**. Am Ende jeder Runde erhalten Sie für jeden vollständig gehaltenen Kontrollpunkt (+3 Runden Präsenz) **+1 Punkt**.

### 🎮 Rundenablauf & Aktionspunkte (AP)
Jede Runde erhalten Sie **3 Aktionspunkte (AP)** pro aktivem Panzer. Verwalten Sie Ihre AP weise:
- **Bewegen (WASD / D-Pad)** (Kostet **1 AP**): Fahren Sie Ihren Panzer. Der verbleibende Treibstoff wird im HUD angezeigt. Sie können die Bewegung beliebig oft unterbrechen, solange Sie Treibstoff haben.
- **Feuern** (Kostet **2 AP**): Richten Sie Ihren Turm aus und feuern Sie Ihr Projektil. Nach dem Schuss wechselt das Spiel in die **Positionierungsphase**, in der Sie verbleibenden Treibstoff nutzen können, um in Deckung zu fahren.
- **Schild aktivieren** (Kostet **2 AP**): Erzeugt eine Energiekuppel mit einem Radius von **67.5 Einheiten**. Projektile prallen von der Kuppel ab. Der Schild schrumpft jede Runde um 10% und erlischt nach 5 Runden.

### ⌨️ Steuerung
- **Auswahlphase**:
  - `A` / `D` oder Pfeiltasten `◀`/`▶`: Panzer wechseln.
  - `Enter` oder `Ziel Bestätigen`: Auswahl einloggen.
- **Aktionsphase**:
  - `W`, `A`, `S`, `D` oder D-Pad: Panzer fahren & lenken.
  - **Maus ziehen auf Panzer**: Turm horizontal drehen und Neigungswinkel anpassen.
  - **Mausrad scrollen auf Panzer**: Schusskraft (Kraft) einstellen.
  - **Maus ziehen auf freier Fläche**: Kamera um den Panzer rotieren (Orbit).
  - **Mausrad scrollen auf freier Fläche**: Kamera zoomen.
  - `Enter` oder `Feuer`-Button: Schuss abgeben.
  - `3` oder `Schild`-Button: Schild aktivieren.

### 💣 Munitionstypen
Wählen Sie Ihre Munition vor dem Schuss links unten im HUD aus:
1. **Standard (💥)** (Vorrat: `∞`): Basis-Schadensprofil (1.0x Schaden, 1.0x Explosionsradius).
2. **Panzerbrechend (⚡)** (Vorrat: `4`): 1.8x Schaden, aber kleinerer Explosionsradius (0.4x). Perfekt für direkte Treffer.
3. **Splitter (💣)** (Vorrat: `4`): 0.7x Schaden, aber doppelter Explosionsradius (2.0x). Ideal gegen eng beieinanderstehende Gegner.
4. **Rauchgranate (🌫️)** (Vorrat: `3`): Verursacht 0 Schaden. Erzeugt für 10 Sekunden dichten Rauch, der die Sichtlinie (LOS) blockiert. **Taktischer Tipp**: KI-Panzer können keine Ziele ohne LOS angreifen.

---

## 🇺🇸 English Guide

### 🎯 Objective
Achieve victory through one of two methods:
1. **Annihilation**: Destroy all 10 enemy tanks.
2. **Control Points**: Be the first to reach **12 Control Point (CP) points**. Amass +1 point at the end of each round for every captured CP (+3 turns of continuous presence).

### 🎮 Turn Loop & Action Points (AP)
Each turn grants **3 Action Points (AP)**. Manage your resources carefully:
- **Move (WASD / D-Pad)** (Costs **1 AP**): Drive your tank. Fuel levels are displayed on the HUD. You can interrupt movement at any time as long as you have fuel.
- **Fire** (Costs **2 AP**): Position your turret, set velocity, and shoot. Once fired, the game transitions into the **Positioning Phase**, allowing you to use remaining fuel to drive to safety.
- **Deploy Shield** (Costs **2 AP**): Generates a protective force field (radius of **67.5 units**). Projectiles bounce off the dome. The shield shrinks by 10% each round and expires after 5 rounds.

### ⌨️ Controls
- **Selection Phase**:
  - `A` / `D` or Left/Right arrow keys: Cycle active tanks.
  - `Enter` or `Confirm Target`: Lock in selection.
- **Action Phase**:
  - `W`, `A`, `S`, `D` or HUD D-Pad: Drive and steer.
  - **Click and drag on tank**: Rotate turret horizontally and adjust inclination angle.
  - **Scroll wheel on tank**: Adjust firing power.
  - **Click and drag on empty ground**: Orbit the camera.
  - **Scroll wheel on empty ground**: Zoom camera.
  - `Enter` or `Fire` button: Shoot.
  - `3` or `Shield` button: Deploy shield.

### 💣 Ammunition Properties
Select ammunition in the bottom-left HUD before firing:
1. **Standard (💥)** (Quantity: `∞`): Balanced profile (1.0x damage, 1.0x blast radius).
2. **Armor-Piercing (⚡)** (Quantity: `4`): High single-target impact (1.8x damage, 0.4x blast radius).
3. **Splinter (💣)** (Quantity: `4`): Wide area splash (0.7x damage, 2.0x blast radius).
4. **Smoke Grenade (🌫️)** (Quantity: `3`): 0 damage. Deploys dense smoke for 10 seconds, blocking Line of Sight (LOS). **Tactical Tip**: AI tanks cannot target units without direct LOS.

---

## ⚙️ Technical Design & Deep-Dive

Strike Command: Fog of War is engineered using a custom modular vanilla web system. It does not rely on bundlers, making it lightweight and directly executable in modern browsers.

### 📁 Directory Layout

```
strike-commander/
├── index.html        # Main HTML skeleton linking stylesheet and scripts
├── style.css         # Responsive glassmorphism interface, scanlines & animations
├── README.md         # Full project documentation & screenshots
├── gfx/              # Game screenshots and visual assets
└── js/
    ├── globals.js    # Declares all shared global variables
    ├── constants.js  # Static configurations (MAP_SIZE, gravity, ammunition properties)
    ├── audio.js      # Procedural sound effects synthesizer using HTML5 Web Audio API
    ├── tacfeed.js    # Tactical notifications and combat log compiler
    ├── lighting.js   # LightingDirector managing time-of-day scenes and tone mapping
    ├── camera.js     # Camera director protecting manual zoom/yaw during action phases
    ├── weather.js    # Weather animator processing procedural rain, wind, and lightning flashes
    ├── world.js      # Generates procedural 3D terrain, custom ocean waves, and structures
    ├── fx.js         # Particle explosions, shockwaves, shield ripples, and shrapnel geometry
    ├── tank.js       # Models tank meshes, aligns them to uneven terrain, and processes FOW checks
    ├── ai.js         # A* pathfinding navgrid, dynamic role allocation, and adaptive rubber-banding
    └── game.js       # Main state machine, keyboard triggers, render loop, and turn flow orchestrator
```

### 🔊 Procedural Audio Synthesis (`js/audio.js`)
Rather than downloading large audio assets, the game synthesizes all sound effects procedurally in real-time using the browser's **Web Audio API**:
- **Diesel Engines**: A combination of sawtooth, square, and triangle oscillators modulated by an LFO. The base frequency is dynamically modified relative to the tank's speed (from a 38Hz idle rumble to an 85Hz full-throttle roar).
- **Explosions**: Pink noise buffers are generated in JavaScript, then filtered through wave-shaping distortion curves and a lowpass filter sweep. A separate sine oscillator adds a deep sub-bass thump.
- **Projectile Whistle**: An ultrasonic sine frequency sweep that pitches down rapidly prior to projectile impact to create tension.
- **Reload ratchet**: Synthesized mechanical slider clicks using square waves and quick exponential ramps.

### 🗻 Procedural World Generation & Shaders (`js/world.js`)
- **Heightmap Terrain**: The terrain is generated procedurally by evaluating sum-of-sines equations at vertices. The heights are colored dynamically based on altitude (Sand below sea level, Grass, Rock, and Snow peaks).
- **Ocean Waves & Foam**: A custom WebGL shader deforms the water vertices using trigonometric wave swells. It computes the wave crests to blend in coastal foam textures.

### 🧠 Tactical AI & Pathfinding (`js/ai.js`)
The AI operates on a dynamic navigation grid generated based on terrain height and obstacles:
- **A* Pathfinding**: Finds optimal navigation routes on a cell-grid, bypassing trees, bunkers, and enemy shields.
- **Role Allocation**: AI units are divided into Attackers, Defenders (Holders), Flankers, and Supports. Defenders focus on control points, Flankers flank around, and Supports assist weakened allies.
- **Friendly-Fire Mitigation**: Before firing, the AI simulates the shot trajectory and checks if any allies fall within the explosion radius.
- **Rubber-Banding / Adaptive Heuristics**: The AI adjusts its targeting accuracy based on the match score difference. If the AI is trailing, it receives a minor accuracy boost; if leading, its shots contain more random offset.

---

## 🚀 Running Locally

Since the game uses custom shaders and Web Audio modules, it is best run through a local web server (to avoid CORS policies on local file access):

1. **Serve the folder**:
   Using python:
   ```bash
   python -m http.server 8000
   ```
   Or using node:
   ```bash
   npx serve .
   ```
2. **Open your browser**:
   Navigate to `http://localhost:8000` (or the port specified).

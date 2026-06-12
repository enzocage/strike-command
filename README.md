# Strike Command: Fog of War

Strike Command: Fog of War is a premium, procedurally generated 3D artillery tactical game built with **Three.js** and styled with a sleek futuristic cyber-military aesthetic.

---

## 🇩🇪 Deutsche Spielanleitung

### 🎯 Ziel des Spiels
Es gibt zwei Wege, um die Partie zu gewinnen:
1. **Alle feindlichen Panzer vernichten.**
2. **Als Erster 12 Kontrollpunkt-Punkte sammeln.** (Punkte werden am Ende jeder Runde vergeben: +1 Punkt pro Runde für jeden besetzten Kontrollpunkt).

### 🎮 Rundenablauf & Aktionspunkte (AP)
Jede Runde gibt Ihnen **3 Aktionspunkte (AP)**, die Sie für folgende Aktionen nutzen können:
- **Bewegen (WASD / D-Pad)**: Kostet **1 AP**. Sie können sich so weit bewegen, wie Ihr Treibstoff reicht.
- **Feuern**: Kostet **2 AP**. Sie visieren Ihr Ziel über Winkel, Ausrichtung und Stärke an und schießen.
- **Schild aktivieren**: Kostet **2 AP**. Erzeugt eine schützende Barriere gegen Geschosse.

### ⌨️ Steuerung
- **Bewegen**: `W`, `A`, `S`, `D` oder D-Pad im HUD.
- **Zielen**: Klicken und ziehen Sie direkt auf dem Panzer, um den Turm auszurichten.
- **Schusskraft**: Mausrad während des Zielens scrollen.
- **Kamera**: Klicken und ziehen Sie auf freier Fläche, um die Kamera zu rotieren. Scrollen zum Zoomen.
- **Auswahl bestätigen / Feuern**: `Enter` oder Buttons im HUD.
- **Panzerwahl**: Pfeiltasten `◀`/`▶` oder `A`/`D` im HUD-Overlay.

### 💣 Munitionstypen
- **Standard (💥)**: Unbegrenzt, ausgewogener Schaden und Radius.
- **Panzerbrechend (⚡)**: 4x Vorrat, 1.8x Schaden, aber kleinerer Radius.
- **Splitter (💣)**: 4x Vorrat, 2.0x Radius, aber geringerer Schaden.
- **Rauchgranate (🌫️)**: 3x Vorrat, verursacht keinen Schaden, nimmt der KI für 10 Sekunden die Sichtlinie.

---

## 🇺🇸 English Guide

### 🎯 Objective
Achieve victory in one of two ways:
1. **Destroy all enemy tanks.**
2. **Be the first to reach 12 Control Point (CP) points.** (Amass +1 point at the end of each round for every captured CP).

### 🎮 Turn Loop & Action Points (AP)
Each turn grants **3 Action Points (AP)**. Choose your strategy:
- **Move (WASD / D-Pad)**: Costs **1 AP**. Navigate as far as fuel permits.
- **Fire**: Costs **2 AP**. Direct your turret angle, yaw, and velocity to shoot.
- **Deploy Shield**: Costs **2 AP**. Generates an energy dome reflecting projectiles.

### ⌨️ Controls
- **Movement**: `W`, `A`, `S`, `D` or the HUD D-Pad.
- **Aiming**: Click and drag directly on your tank to align the turret.
- **Velocity**: Scroll wheel while aiming to adjust power.
- **Camera**: Click and drag on empty ground to rotate camera. Scroll to zoom.
- **Confirm / Fire**: Press `Enter` or click the HUD buttons.
- **Cycle Tanks**: Left/Right Arrow keys or `A`/`D` during selection overlay.

---

## 🛠️ Technical Architecture & Directory Structure

The project has been refactored from a single monolithic file into a clean, modular structure:

```
strike-commander/
├── index.html        # Main HTML skeleton linking script files
├── style.css         # Custom premium CSS styling (glassmorphism & animations)
├── README.md         # Documentation
└── js/
    ├── globals.js    # Declares all shared global variables
    ├── constants.js  # Static configurations (MAP_SIZE, gravity, ammunition properties)
    ├── audio.js      # Custom Synthesizer using Web Audio API (diesel engine sounds, explosions, fanfares)
    ├── tacfeed.js    # Real-time tactical notifications combat log
    ├── lighting.js   # LightingDirector managing time-of-day scenes and tone mapping
    ├── camera.js     # Camera director protecting manual zoom/yaw during action phases
    ├── weather.js    # Weather animator processing procedural rain, wind, and lightning flashes
    ├── world.js      # Generates procedural 3D terrain, custom ocean waves, vegetation, bunkers, and CPs
    ├── fx.js         # Particle explosions, shockwaves, shield ripples, and shrapnel geometry
    ├── tank.js       # Models tank meshes, aligns them to uneven terrain normal vectors, and processes FOW checks
    ├── ai.js         # A* pathfinding navgrid, dynamic role allocation, and adaptive rubber-banding heuristics
    └── game.js       # Main state machine, keyboard triggers, render loop, and turn flow orchestrator
```

### 🔊 Procedural Audio Synthesis
The audio engine (`js/audio.js`) runs purely on the HTML5 **Web Audio API**. It uses custom oscillators, gain nodes, bi-quad filters, and wave-shaping distortion curves to generate:
- Procedural sub-bass kicks and noise explosions tailored to the ammunition type.
- An interactive diesel motor drone whose pitch shifts dynamically relative to velocity.
- Synthesized brass fanfares and mechanical slide clicks for UI feedback.

### 🗻 Landscape & Shaders
Terrain is procedurally calculated on load using mathematical wave equations. The custom ocean shader dynamically deforms vertices to create swelling waves and computes coastal foam lines using custom fresnel approximations.

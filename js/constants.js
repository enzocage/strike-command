// ─── Constants ───
let MAP_SIZE = 1800; // wird pro Schwierigkeit in createWorld() gesetzt (siehe difficulty.js)
const SEGMENTS = 150;
const TANKS_PER_PLAYER = 10; 
const GRAVITY = 60;
const FOG_COLOR = 0x0a1520; 

const GRID_CELL_SIZE = 30;

// ─── Aktionspunkte ───
const MAX_AP = 3;

// ─── Munitionstypen ───
const AMMO_TYPES = {
    standard: { name: 'Standard', icon: '💥', desc: 'Ausgewogener Schaden', color: 0xffdd00, splashMult: 1.0, speedMult: 1.0, dmgMult: 1.0, count: Infinity, trailColor: 0xffaa00 },
    ap:        { name: 'Panzerbrechend', icon: '⚡', desc: 'Hoher Schaden, kleines Gebiet', color: 0x00ffaa, splashMult: 0.4, speedMult: 1.4, dmgMult: 1.8, count: 4, trailColor: 0x00ffaa },
    frag:      { name: 'Splitter', icon: '💣', desc: 'Großes Gebiet, geringerer Schaden', color: 0xff6600, splashMult: 2.0, speedMult: 0.85, dmgMult: 0.7, count: 4, trailColor: 0xff3300 },
    smoke:     { name: 'Rauchgranate', icon: '🌫️', desc: 'Kein Schaden - Sichtblock 10s', color: 0x99bbcc, splashMult: 0, speedMult: 0.8, dmgMult: 0, count: 3, trailColor: 0x8899aa }
};

// ─── Kontrollpunkte ───
// Anzahl und Siegschwelle kommen pro Schwierigkeit aus difficulty.js;
// CP_POINTS_TO_WIN dient nur noch als Fallback.
const CP_CAPTURE_RADIUS = 55;
const CP_POINTS_TO_WIN = 12;

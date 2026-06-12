// ─── Globals ───
let scene, camera, renderer, clock;
let terrain, water, cloudsGroup, heightData;
let teams = [[], []], trees = [], bunkers = []; 
let shields = []; 
let shieldsRemaining = [2, 2]; // Limit: 2 Schilde pro Spieler
let activeTankIdx = [0, 0];
let currentPlayer = 0;
let gameState = 'MENU';
let projectile, projectileVel, projectileLight;
let explosionLight;
let selectionMarker, impactMarker;
let trajectoryPoints; 
let fuel = 100;

let particles = [], smokeTrail = [], physicalDebris = [], blastAreas = [];
let screenShake = 0;
let uniformsWater;

// Pathfinding & AI Globals
let navGrid = [];
const keys = {};

let isSinglePlayer = false;
let aiDifficulty = 2; // 1: Easy, 2: Medium, 3: Hard

// ─── Aktionspunkte ───
let apRemaining = 3;
let apUsedMove = false;
let apUsedFire = false;

// ─── Munitionstypen ───
let selectedAmmo = 'standard';
let ammoInventory = {};
let smokeScreens = [];
let fogOfWarEnabled = true;
let killsThisTurn = 0; // Kettenbonus-Tracking

// ─── Kontrollpunkte ───
let controlPoints = [];
let cpScores = [0, 0]; // Punkte pro Runde halten
let cpMeshes = [];

// ─── Statistiken ───
let gameStats = [
    { shotsFired: 0, shotsHit: 0, totalDamage: 0, tanksDestroyed: 0, cpTurns: 0, ammoUsed: {} },
    { shotsFired: 0, shotsHit: 0, totalDamage: 0, tanksDestroyed: 0, cpTurns: 0, ammoUsed: {} }
];
let aiDriveParams = { active: false, target: null, path: [], pathIndex: 0, retryShot: false };

let camTarget; // Will be initialized in init
let camPostExplosionTimer = 0;
let camLookAt; // Will be initialized in init
let camOrbit = { theta: Math.PI/4, phi: Math.PI/3, dist: 130 };

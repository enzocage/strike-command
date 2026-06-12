// ─── Schwierigkeitssystem ───
// Zentrale Presets: steuern Welt, Sichtbarkeit, KI-Stärke und Ressourcen.
// Zugriff immer über diffCfg() — nie direkt über aiDifficulty vergleichen.
const DIFFICULTY_PRESETS = {
    1: {
        name: 'REKRUT',
        // ── Welt ──
        mapSize: 1500,          // kompakte, übersichtliche Karte
        ruggedness: 0.6,        // sanfte Hügel — freie Schusslinien
        treeCount: 150,
        bunkerCount: 9,
        numControlPoints: 3,
        cpWinPoints: 14,
        // ── Sichtbarkeit ──
        fowEnabled: false,      // Spieler sieht alles
        playerVisionFrac: 1.0,
        aiVisionFrac: 0.22,
        // ── KI-Aktionsökonomie ──
        tanksPerTurn: 1,
        fuelTurn: 100,
        // ── KI-Zielen ──
        aimNoise: 1.1,
        shotThreshold: 175,
        fineSearch: 0,          // 0: keine Feinsuche, 1: grob, 2: fein
        obstacleAwareShots: false,
        needsLOS: true,         // ohne Sichtlinie kein Ziel
        // ── KI-Taktik ──
        shieldIQ: 0,            // 0: nie, 1: Notfall, 2: taktisch, 3: proaktiv
        ammoIQ: 0,              // 0: nur Standard, 1: simpel, 2: situativ, 3: aggressiv
        coverSeeking: false,
        cpEndgame: false,
        shootAndScoot: false,   // kein Bewegen nach dem Schuss
        hideRepositionCount: 0,
        // ── Ressourcen ──
        aiHP: 90,
        aiShields: 1,
        aiAmmo:     { ap: 0, frag: 0, smoke: 0 },
        playerAmmo: { ap: 4, frag: 4, smoke: 3 },
        // ── Dynamik ──
        rubberband: -1,         // -1: hilft Spieler, 0: neutral, 1-2: hilft KI
        aimDuration: 1750, fireDelay: 450, thinkDelay: 320
    },
    2: {
        name: 'VETERAN',
        mapSize: 1800,
        ruggedness: 1.0,
        treeCount: 250,
        bunkerCount: 16,
        numControlPoints: 3,
        cpWinPoints: 12,
        fowEnabled: true,
        playerVisionFrac: 0.45,
        aiVisionFrac: 0.40,
        tanksPerTurn: 2,
        fuelTurn: 100,
        aimNoise: 0.25,
        shotThreshold: 100,
        fineSearch: 1,
        obstacleAwareShots: false,
        needsLOS: false,
        shieldIQ: 1,
        ammoIQ: 1,
        coverSeeking: false,
        cpEndgame: true,
        shootAndScoot: true,
        hideRepositionCount: 1,
        aiHP: 100,
        aiShields: 2,
        aiAmmo:     { ap: 2, frag: 2, smoke: 1 },
        playerAmmo: { ap: 4, frag: 4, smoke: 3 },
        rubberband: 0,
        aimDuration: 1200, fireDelay: 450, thinkDelay: 320
    },
    3: {
        name: 'ELITE',
        mapSize: 2100,
        ruggedness: 1.35,       // zerklüftet — Höhenzüge blockieren Sicht
        treeCount: 300,
        bunkerCount: 22,
        numControlPoints: 4,
        cpWinPoints: 11,
        fowEnabled: true,
        playerVisionFrac: 0.34,
        aiVisionFrac: 0.62,
        tanksPerTurn: 3,
        fuelTurn: 115,
        aimNoise: 0.07,
        shotThreshold: 55,
        fineSearch: 2,
        obstacleAwareShots: true,
        needsLOS: false,
        shieldIQ: 2,
        ammoIQ: 2,
        coverSeeking: true,
        cpEndgame: true,
        shootAndScoot: true,
        hideRepositionCount: 1,
        aiHP: 100,
        aiShields: 3,
        aiAmmo:     { ap: 4, frag: 4, smoke: 3 },
        playerAmmo: { ap: 4, frag: 4, smoke: 4 },
        rubberband: 1,
        aimDuration: 850, fireDelay: 220, thinkDelay: 180
    },
    4: {
        name: 'ALBTRAUM',
        mapSize: 2400,
        ruggedness: 1.65,       // Bergrücken und tiefe Täler
        treeCount: 340,
        bunkerCount: 28,
        numControlPoints: 5,
        cpWinPoints: 10,
        fowEnabled: true,
        playerVisionFrac: 0.28,
        aiVisionFrac: 0.85,
        tanksPerTurn: 4,
        fuelTurn: 130,
        aimNoise: 0.02,
        shotThreshold: 38,
        fineSearch: 2,
        obstacleAwareShots: true,
        needsLOS: false,
        shieldIQ: 3,
        ammoIQ: 3,
        coverSeeking: true,
        cpEndgame: true,
        shootAndScoot: true,
        hideRepositionCount: 2,
        aiHP: 110,
        aiShields: 3,
        aiAmmo:     { ap: 6, frag: 6, smoke: 4 },
        playerAmmo: { ap: 4, frag: 4, smoke: 5 },
        rubberband: 2,
        aimDuration: 650, fireDelay: 180, thinkDelay: 140
    }
};

function diffCfg() {
    return DIFFICULTY_PRESETS[aiDifficulty] || DIFFICULTY_PRESETS[2];
}

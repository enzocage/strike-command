// ════════════════════════════════════════════════════════════════════════
//  LightingDirector — 8 atmosphärische Szenen, 60s Zyklus, 10s Übergang
// ════════════════════════════════════════════════════════════════════════
const LightingDirector = {
    SCENE_DURATION: 60,   // Sekunden pro Szene
    TRANSITION_DURATION: 10, // Sekunden Übergang
    timer: 0,
    sceneIdx: 0,
    transitioning: false,
    transTimer: 0,

    // Jede Szene: sunColor, sunIntensity, sunPos(norm),
    //             hemiSky, hemiGround, hemiIntensity,
    //             fillColor, fillIntensity,
    //             rimColor, rimIntensity,
    //             atmoColor, atmoIntensity,
    //             fogColor, fogDensity,
    //             bgColor,
    //             treeEmissive, treeEmissiveIntensity,
    //             tankEmissiveBoost  (multiplier on tank emissiveIntensity)
    scenes: [
        { // 0 — Goldener Nachmittag
            name: 'Golden Hour',
            sunColor: 0xffcc44, sunIntensity: 2.2, sunPos: [0.6, 0.7, -0.3],
            hemiSky: 0xffaa33, hemiGround: 0x331100, hemiIntensity: 0.8,
            fillColor: 0xff6622, fillIntensity: 0.5,
            rimColor: 0xff9900, rimIntensity: 0.3,
            atmoColor: 0xff8800, atmoIntensity: 0.15,
            fogColor: 0x331a00, fogDensity: 0.0006,
            bgColor: 0x331a00,
            treeEmissive: 0x441100, treeEmissiveIntensity: 0.5,
            tankEmissiveBoost: 1.0,
        },
        { // 1 — Mitternacht Neon
            name: 'Neon Night',
            sunColor: 0x1122aa, sunIntensity: 0.3, sunPos: [-0.2, 0.3, 0.9],
            hemiSky: 0x000033, hemiGround: 0x000011, hemiIntensity: 0.4,
            fillColor: 0xff00ff, fillIntensity: 0.8,
            rimColor: 0x00ffff, rimIntensity: 0.9,
            atmoColor: 0x8800ff, atmoIntensity: 0.4,
            fogColor: 0x000011, fogDensity: 0.0012,
            bgColor: 0x000011,
            treeEmissive: 0x00ff44, treeEmissiveIntensity: 1.2,
            tankEmissiveBoost: 3.0,
        },
        { // 2 — Marsrot / Wüstenkrieg
            name: 'Desert Inferno',
            sunColor: 0xff4400, sunIntensity: 2.8, sunPos: [0.1, 0.9, 0.4],
            hemiSky: 0xff2200, hemiGround: 0x220800, hemiIntensity: 0.9,
            fillColor: 0xff6600, fillIntensity: 0.6,
            rimColor: 0xffaa00, rimIntensity: 0.4,
            atmoColor: 0xff3300, atmoIntensity: 0.2,
            fogColor: 0x220800, fogDensity: 0.0009,
            bgColor: 0x220800,
            treeEmissive: 0x331100, treeEmissiveIntensity: 0.3,
            tankEmissiveBoost: 1.5,
        },
        { // 3 — Arktisches Blau
            name: 'Arctic Blue',
            sunColor: 0xaaccff, sunIntensity: 1.2, sunPos: [0.0, 0.5, -1.0],
            hemiSky: 0x88aaff, hemiGround: 0x002244, hemiIntensity: 0.7,
            fillColor: 0x0044ff, fillIntensity: 0.5,
            rimColor: 0x00ccff, rimIntensity: 0.6,
            atmoColor: 0x0088ff, atmoIntensity: 0.25,
            fogColor: 0x001122, fogDensity: 0.0007,
            bgColor: 0x001122,
            treeEmissive: 0x002244, treeEmissiveIntensity: 0.6,
            tankEmissiveBoost: 1.2,
        },
        { // 4 — Giftiges Grün / Biogefahr
            name: 'Toxic Zone',
            sunColor: 0x88ff44, sunIntensity: 1.5, sunPos: [-0.4, 0.8, 0.4],
            hemiSky: 0x224400, hemiGround: 0x001100, hemiIntensity: 0.8,
            fillColor: 0x00ff44, fillIntensity: 0.7,
            rimColor: 0xaaff00, rimIntensity: 0.5,
            atmoColor: 0x00ff22, atmoIntensity: 0.35,
            fogColor: 0x001100, fogDensity: 0.0010,
            bgColor: 0x001100,
            treeEmissive: 0x00ff22, treeEmissiveIntensity: 1.5,
            tankEmissiveBoost: 2.0,
        },
        { // 5 — Lila Dämmerung
            name: 'Purple Dusk',
            sunColor: 0xcc44ff, sunIntensity: 1.0, sunPos: [-0.8, 0.4, 0.4],
            hemiSky: 0x440066, hemiGround: 0x110022, hemiIntensity: 0.6,
            fillColor: 0xff00aa, fillIntensity: 0.6,
            rimColor: 0xaa00ff, rimIntensity: 0.7,
            atmoColor: 0x6600cc, atmoIntensity: 0.3,
            fogColor: 0x110022, fogDensity: 0.0008,
            bgColor: 0x110022,
            treeEmissive: 0x440044, treeEmissiveIntensity: 0.8,
            tankEmissiveBoost: 2.5,
        },
        { // 6 — Reines Weiß / Atomarer Winter
            name: 'Nuclear Winter',
            sunColor: 0xffffff, sunIntensity: 3.5, sunPos: [0.0, 1.0, 0.0],
            hemiSky: 0xddeeff, hemiGround: 0x334455, hemiIntensity: 1.2,
            fillColor: 0xaabbcc, fillIntensity: 0.4,
            rimColor: 0xffffff, rimIntensity: 0.2,
            atmoColor: 0xccddff, atmoIntensity: 0.1,
            fogColor: 0x445566, fogDensity: 0.0014,
            bgColor: 0x445566,
            treeEmissive: 0x002211, treeEmissiveIntensity: 0.1,
            tankEmissiveBoost: 0.5,
        },
        { // 7 — Feuer-Apokalypse
            name: 'Apocalypse',
            sunColor: 0xff2200, sunIntensity: 1.8, sunPos: [0.3, 0.5, -0.8],
            hemiSky: 0xff1100, hemiGround: 0x110000, hemiIntensity: 1.0,
            fillColor: 0xff4400, fillIntensity: 0.8,
            rimColor: 0xff8800, rimIntensity: 1.0,
            atmoColor: 0xff3300, atmoIntensity: 0.5,
            fogColor: 0x110000, fogDensity: 0.0011,
            bgColor: 0x110000,
            treeEmissive: 0xff2200, treeEmissiveIntensity: 2.0,
            tankEmissiveBoost: 3.5,
        },
    ],

    // Aktuell interpolierte Szenen-Werte (werden jeden Frame berechnet)
    _current: null,
    _prev: null,

    init() {
        this.sceneIdx = 0;
        this.timer = 0;
        this._prev    = this.scenes[0];
        this._current = this.scenes[0];
        this._apply(this.scenes[0], 1.0);
    },

    update(dt) {
        if(!window._hemi || gameState === 'MENU') return;

        this.timer += dt;

        // Scene-Label updaten
        const lbl = document.getElementById('scene-label');
        if(lbl && this._current) lbl.textContent = this._current.name;

        if(!this.transitioning && this.timer >= this.SCENE_DURATION) {
            this.transitioning = true;
            this.transTimer = 0;
            this._prev = this.scenes[this.sceneIdx];
            this.sceneIdx = (this.sceneIdx + 1) % this.scenes.length;
            this._current = this.scenes[this.sceneIdx];
            if(typeof TacFeed !== 'undefined') TacFeed.log('🌅 ' + this._current.name.toUpperCase(), 'adapt');
            if(typeof Audio !== 'undefined' && Audio.ctx) Audio.play('sceneChange');
        }

        if(this.transitioning) {
            this.transTimer += dt;
            const t = Math.min(1.0, this.transTimer / this.TRANSITION_DURATION);
            // Smoothstep
            const s = t * t * (3 - 2 * t);
            this._blend(this._prev, this._current, s);
            if(t >= 1.0) {
                this.transitioning = false;
                this.timer = 0;
                this._apply(this._current, 1.0);
            }
        }

        // Lebendige Puls-Effekte innerhalb einer Szene
        const pulse = 0.5 + 0.5 * Math.sin(this.timer * 0.8);
        const fastPulse = 0.5 + 0.5 * Math.sin(this.timer * 2.5);

        // Atmo-Licht pulsiert leicht
        if(window._atmoLight && this._current) {
            const base = this._current.atmoIntensity;
            window._atmoLight.intensity = base * (0.85 + 0.3 * pulse);
        }
        // Baum-Emissive pulsiert
        if(window._treeLeavesMat && this._current) {
            window._treeLeavesMat.emissiveIntensity =
                this._current.treeEmissiveIntensity * (0.7 + 0.6 * fastPulse);
        }
        // Tank-Emissive pulsiert
        if(this._current) {
            const boost = this._current.tankEmissiveBoost;
            scene.traverse(obj => {
                if(obj.isMesh && obj.material && obj.material.userData && obj.material.userData.isTankMat) {
                    obj.material.emissiveIntensity = 0.15 * boost * (0.8 + 0.4 * fastPulse);
                }
            });
        }
    },

    _lerp(a, b, t) { return a + (b - a) * t; },

    _lerpColor(ca, cb, t) {
        const ar = (ca >> 16) & 0xff, ag = (ca >> 8) & 0xff, ab = ca & 0xff;
        const br = (cb >> 16) & 0xff, bg = (cb >> 8) & 0xff, bb = cb & 0xff;
        const r = Math.round(ar + (br-ar)*t);
        const g = Math.round(ag + (bg-ag)*t);
        const b2 = Math.round(ab + (bb-ab)*t);
        return (r << 16) | (g << 8) | b2;
    },

    _blend(prev, next, t) {
        const s = {
            sunColor:        this._lerpColor(prev.sunColor, next.sunColor, t),
            sunIntensity:    this._lerp(prev.sunIntensity, next.sunIntensity, t),
            sunPos: [
                this._lerp(prev.sunPos[0], next.sunPos[0], t),
                this._lerp(prev.sunPos[1], next.sunPos[1], t),
                this._lerp(prev.sunPos[2], next.sunPos[2], t),
            ],
            hemiSky:         this._lerpColor(prev.hemiSky, next.hemiSky, t),
            hemiGround:      this._lerpColor(prev.hemiGround, next.hemiGround, t),
            hemiIntensity:   this._lerp(prev.hemiIntensity, next.hemiIntensity, t),
            fillColor:       this._lerpColor(prev.fillColor, next.fillColor, t),
            fillIntensity:   this._lerp(prev.fillIntensity, next.fillIntensity, t),
            rimColor:        this._lerpColor(prev.rimColor, next.rimColor, t),
            rimIntensity:    this._lerp(prev.rimIntensity, next.rimIntensity, t),
            atmoColor:       this._lerpColor(prev.atmoColor, next.atmoColor, t),
            atmoIntensity:   this._lerp(prev.atmoIntensity, next.atmoIntensity, t),
            fogColor:        this._lerpColor(prev.fogColor, next.fogColor, t),
            fogDensity:      this._lerp(prev.fogDensity, next.fogDensity, t),
            bgColor:         this._lerpColor(prev.bgColor, next.bgColor, t),
            treeEmissive:    this._lerpColor(prev.treeEmissive, next.treeEmissive, t),
            treeEmissiveIntensity: this._lerp(prev.treeEmissiveIntensity, next.treeEmissiveIntensity, t),
            tankEmissiveBoost: this._lerp(prev.tankEmissiveBoost, next.tankEmissiveBoost, t),
        };
        this._apply(s, t);
    },

    _apply(s, _t) {
        const sun = window._hemi ? window._hemi.parent && scene.children.find(c => c.isDirectionalLight && c.castShadow) : null;
        // Sun
        scene.children.forEach(c => {
            if(c.isDirectionalLight && c.castShadow) {
                c.color.setHex(s.sunColor);
                c.intensity = s.sunIntensity;
                const len = Math.sqrt(s.sunPos[0]**2 + s.sunPos[1]**2 + s.sunPos[2]**2);
                c.position.set(s.sunPos[0]/len*500, s.sunPos[1]/len*500, s.sunPos[2]/len*500);
            }
        });
        // Hemi
        if(window._hemi) {
            window._hemi.color.setHex(s.hemiSky);
            window._hemi.groundColor.setHex(s.hemiGround);
            window._hemi.intensity = s.hemiIntensity;
        }
        // Fill
        if(window._fillLight) {
            window._fillLight.color.setHex(s.fillColor);
            window._fillLight.intensity = s.fillIntensity;
        }
        // Rim
        if(window._rimLight) {
            window._rimLight.color.setHex(s.rimColor);
            window._rimLight.intensity = s.rimIntensity;
        }
        // Atmo
        if(window._atmoLight) {
            window._atmoLight.color.setHex(s.atmoColor);
            window._atmoLight.intensity = s.atmoIntensity;
        }
        // Fog + Background (Regen erhöht Dichte additiv)
        if(scene.fog) {
            scene.fog.color.setHex(s.fogColor);
            const rainBoost = weather && weather.isRaining ? weather.rainIntensity * 0.002 : 0;
            scene.fog.density = s.fogDensity + rainBoost;
        }
        if(scene.background) scene.background.setHex(s.bgColor);
        // Trees
        if(window._treeLeavesMat) {
            window._treeLeavesMat.emissive.setHex(s.treeEmissive);
            window._treeLeavesMat.emissiveIntensity = s.treeEmissiveIntensity;
        }
        // toneMapping exposure — heller in nuklearem Winter, dunkler in Neon Night
        if(renderer) {
            renderer.toneMappingExposure = s.sunIntensity > 2.5 ? 1.2 : s.sunIntensity < 0.5 ? 0.85 : 1.05;
        }
        // Bunker-Schlitze pulsieren in Szenen-Accent-Farbe
        if(window._bunkerSlitMat) {
            // Accent-Farbe = Rim-Farbe der Szene
            window._bunkerSlitMat.emissive.setHex(s.rimColor || 0xff1100);
        }
    }
};

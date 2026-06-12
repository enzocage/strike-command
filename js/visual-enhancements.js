// ═══════════════════════════════════════════════════════════════
// STRIKE COMMANDER — Visual Enhancement Layer
// Himmelskuppel, Sonnen-Glow, Atmosphären-Staub, Vogelschwärme,
// Baum-Wind, Projektil-Tracer, pulsierende Gameplay-Marker
// ═══════════════════════════════════════════════════════════════

const Visuals = {
    skyDome: null,
    sunSprite: null,
    dust: null,
    birds: [],
    tracers: [],
    time: 0,
    _glowTex: null,

    // ── Radial-Glow-Textur (für Sonne, Projektil, Tracer) ──
    glowTexture() {
        if (this._glowTex) return this._glowTex;
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        this._glowTex = new THREE.CanvasTexture(c);
        return this._glowTex;
    },

    // ── Himmelskuppel: Gradient + Sonnen-Halo, folgt der Nebelfarbe ──
    createSkyDome() {
        const geo = new THREE.SphereGeometry(3200, 24, 14);
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                topColor:     { value: new THREE.Color(0x0a1430) },
                horizonColor: { value: new THREE.Color(FOG_COLOR) },
                sunDir:       { value: new THREE.Vector3(200, 500, -200).normalize() },
                sunColor:     { value: new THREE.Color(0xffc070) },
            },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                uniform vec3 sunDir;
                uniform vec3 sunColor;
                varying vec3 vDir;
                void main() {
                    float h = clamp(vDir.y, 0.0, 1.0);
                    // Horizont → Zenit Verlauf
                    vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
                    // Warmer Schimmer knapp über dem Horizont
                    float band = exp(-abs(vDir.y) * 9.0);
                    col += sunColor * band * 0.22;
                    // Sonnen-Halo
                    float s = max(dot(normalize(vDir), sunDir), 0.0);
                    col += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 14.0) * 0.28);
                    gl_FragColor = vec4(col, 1.0);
                }`
        });
        this.skyDome = new THREE.Mesh(geo, mat);
        this.skyDome.renderOrder = -100;
        scene.add(this.skyDome);

        // Sonnen-Sprite (weicher Glow am Himmel)
        const sunMat = new THREE.SpriteMaterial({
            map: this.glowTexture(), color: 0xffd9a0,
            transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        });
        this.sunSprite = new THREE.Sprite(sunMat);
        this.sunSprite.position.set(200, 500, -200).normalize().multiplyScalar(2900);
        this.sunSprite.position.y = Math.max(this.sunSprite.position.y, 300);
        this.sunSprite.scale.set(700, 700, 1);
        scene.add(this.sunSprite);
    },

    // ── Atmosphären-Staub: feine schwebende Lichtpunkte ──
    createDust() {
        const N = 260;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 1500;
            pos[i * 3 + 1] = 5 + Math.random() * 220;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 1500;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            map: this.glowTexture(), color: 0xffe8c0,
            size: 2.2, transparent: true, opacity: 0.16,
            blending: THREE.AdditiveBlending, depthWrite: false,
            sizeAttenuation: true
        });
        this.dust = new THREE.Points(geo, mat);
        scene.add(this.dust);
    },

    // ── Vogelschwärme: Silhouetten, die weite Kreise ziehen ──
    createBirds() {
        const birdMat = new THREE.MeshBasicMaterial({ color: 0x060a10 });
        for (let f = 0; f < 3; f++) {
            const flock = {
                angle: Math.random() * Math.PI * 2,
                radius: 280 + Math.random() * 420,
                height: 150 + Math.random() * 110,
                speed: (0.04 + Math.random() * 0.05) * (Math.random() < 0.5 ? 1 : -1),
                members: []
            };
            const count = 4 + Math.floor(Math.random() * 4);
            for (let b = 0; b < count; b++) {
                const bird = new THREE.Group();
                const lw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.1), birdMat);
                lw.position.x = -1.6;
                const rw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.1), birdMat);
                rw.position.x = 1.6;
                bird.add(lw, rw);
                bird.userData = {
                    lw, rw,
                    phase: Math.random() * Math.PI * 2,
                    off: new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 50)
                };
                scene.add(bird);
                flock.members.push(bird);
            }
            this.birds.push(flock);
        }
    },

    // ── Projektil: Glow-Sprite + nachgezogener Leucht-Tracer ──
    updateProjectileFX(dt) {
        if (typeof projectile !== 'undefined' && projectile && projectile.visible) {
            if (!projectile.userData._glow) {
                const glowMat = new THREE.SpriteMaterial({
                    map: this.glowTexture(), color: 0xffcc66,
                    transparent: true, opacity: 0.9,
                    blending: THREE.AdditiveBlending, depthWrite: false
                });
                const glow = new THREE.Sprite(glowMat);
                glow.scale.set(11, 11, 1);
                projectile.add(glow);
                projectile.userData._glow = glow;
            }
            projectile.userData._glow.material.color.copy(projectile.material.color).lerp(new THREE.Color(0xffffff), 0.35);

            // Tracer-Sprite ablegen — distanzbasiert, unabhängig von der Framerate
            if (!this._lastTracerPos) this._lastTracerPos = new THREE.Vector3(1e9, 1e9, 1e9);
            if (projectile.position.distanceTo(this._lastTracerPos) >= 4) {
                this._lastTracerPos.copy(projectile.position);
                const tMat = new THREE.SpriteMaterial({
                    map: this.glowTexture(), color: projectile.material.color.clone(),
                    transparent: true, opacity: 0.7,
                    blending: THREE.AdditiveBlending, depthWrite: false
                });
                const t = new THREE.Sprite(tMat);
                t.position.copy(projectile.position);
                t.scale.set(6, 6, 1);
                t.userData = { life: 0.4, maxLife: 0.4 };
                scene.add(t);
                this.tracers.push(t);
            }
        }
        for (let i = this.tracers.length - 1; i >= 0; i--) {
            const t = this.tracers[i];
            t.userData.life -= dt;
            const f = Math.max(t.userData.life / t.userData.maxLife, 0);
            t.material.opacity = f * 0.7;
            const s = 1 + (1 - f) * 1.5;
            t.scale.set(6 * s * f + 0.5, 6 * s * f + 0.5, 1);
            if (t.userData.life <= 0) {
                scene.remove(t);
                t.material.dispose();
                this.tracers.splice(i, 1);
            }
        }
    },

    init() {
        this.createSkyDome();
        this.createDust();
        this.createBirds();
    },

    update(dt) {
        this.time += dt;
        const time = this.time;

        // Himmel folgt der Lichtstimmung (LightingDirector ändert Nebelfarbe)
        if (this.skyDome && scene.fog) {
            const u = this.skyDome.material.uniforms;
            u.horizonColor.value.copy(scene.fog.color);
            u.topColor.value.copy(scene.fog.color).multiplyScalar(0.35)
                .lerp(new THREE.Color(0x0a1430), 0.55);
        }

        // Staub: langsame Drift + Atmen
        if (this.dust) {
            this.dust.rotation.y += dt * 0.006;
            this.dust.position.y = Math.sin(time * 0.18) * 4;
            this.dust.material.opacity = 0.12 + Math.sin(time * 0.4) * 0.05;
        }

        // Vögel: kreisen + Flügelschlag
        this.birds.forEach(flock => {
            flock.angle += flock.speed * dt;
            const cx = Math.cos(flock.angle) * flock.radius;
            const cz = Math.sin(flock.angle) * flock.radius;
            const heading = flock.angle + (flock.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
            flock.members.forEach(bird => {
                const ud = bird.userData;
                bird.position.set(cx + ud.off.x, flock.height + ud.off.y + Math.sin(time * 0.7 + ud.phase) * 4, cz + ud.off.z);
                bird.rotation.y = -heading;
                const flap = Math.sin(time * 9 + ud.phase) * 0.55;
                ud.lw.rotation.z = flap;
                ud.rw.rotation.z = -flap;
            });
        });

        // Bäume: sanfter Wind
        if (typeof trees !== 'undefined') {
            for (const tr of trees) {
                if (!tr.alive) continue;
                const m = tr.mesh;
                if (m.userData.swayPhase === undefined) m.userData.swayPhase = Math.random() * Math.PI * 2;
                const p = m.userData.swayPhase;
                m.rotation.z = Math.sin(time * 0.9 + p) * 0.018;
                m.rotation.x = Math.cos(time * 0.7 + p * 1.3) * 0.014;
            }
        }

        // Aufschlag-Marker: pulsieren statt statisch
        if (typeof impactMarker !== 'undefined' && impactMarker && impactMarker.visible) {
            const s = 1 + Math.sin(time * 7) * 0.14;
            impactMarker.scale.set(s, s, 1);
            impactMarker.material.opacity = 0.55 + Math.abs(Math.sin(time * 7)) * 0.35;
        }

        // Auswahl-Säule: rotieren + atmen
        if (typeof selectionMarker !== 'undefined' && selectionMarker && selectionMarker.visible) {
            selectionMarker.rotation.y += dt * 0.6;
            selectionMarker.material.opacity = 0.14 + Math.abs(Math.sin(time * 2.2)) * 0.12;
        }

        // Kontrollpunkte: Lichtsäulen drehen, Flaggen wehen, Ringe pulsieren
        if (typeof controlPoints !== 'undefined') {
            controlPoints.forEach((cp, i) => {
                if (cp.beam) {
                    cp.beam.rotation.y += dt * 0.4;
                    const base = cp.beam.userData.baseOpacity || 0.1;
                    cp.beam.material.opacity = base + Math.sin(time * 1.8 + i) * base * 0.45;
                }
                if (cp.flag) {
                    cp.flag.rotation.y = Math.sin(time * 2.2 + i * 1.7) * 0.28;
                    cp.flag.scale.y = 1 + Math.sin(time * 5 + i) * 0.05;
                }
                if (cp.ring) {
                    const rs = 1 + Math.sin(time * 1.6 + i * 0.9) * 0.025;
                    cp.ring.scale.set(rs, rs, 1);
                }
            });
        }

        // Bunker-Schlitze: bedrohliches Glimmen
        if (typeof window._bunkerSlitMat !== 'undefined' && window._bunkerSlitMat) {
            window._bunkerSlitMat.emissiveIntensity = 1.3 + Math.sin(time * 3.1) * 0.5;
        }

        this.updateProjectileFX(dt);
    }
};

function initVisualEnhancements() { Visuals.init(); }
function updateVisualEffects(dt) { Visuals.update(dt); }

window.Visuals = Visuals;

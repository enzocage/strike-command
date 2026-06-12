// ═══════════════════════════════════════════════════════════════
// STRIKE COMMANDER — Tactical Spatial Minimap
// Vollständige Terrain-Darstellung, alle Gameplay-Elemente,
// Sichtlinien, Munitionsreichweite, Taktische Übersicht
// ═══════════════════════════════════════════════════════════════

const Minimap = {
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    terrainMesh: null,
    waterMesh: null,
    contourLines: null,
    waterBorder: null,
    gridGroup: null,
    treeMarkers: [],
    unitMarkers: [],
    enabled: true,
    size: 360,

    init() {
        let canvas = document.getElementById('minimap-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'minimap-canvas';
            canvas.width = this.size;
            canvas.height = this.size;
            document.getElementById('ui-layer').appendChild(canvas);
        }
        this.canvas = canvas;

        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                alpha: false,
                powerPreference: 'low-power'
            });
            this.renderer.setSize(this.size, this.size);
            this.renderer.setPixelRatio(1);
            this.renderer.setClearColor(0x0a1520, 1);
            this.renderer.shadowMap.enabled = false;
        } catch (e) {
            console.warn('Minimap WebGL init failed:', e);
            return;
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(
            -MAP_SIZE / 2, MAP_SIZE / 2,
            MAP_SIZE / 2, -MAP_SIZE / 2,
            0.1, 10000
        );
        this.camera.position.set(0, 600, 0);
        this.camera.lookAt(0, 0, 0);

        // Helles Licht für Minimap-Lesbarkeit
        const light = new THREE.DirectionalLight(0xffffff, 1.4);
        light.position.set(400, 900, 400);
        this.scene.add(light);
        const ambient = new THREE.AmbientLight(0xddddff, 0.9);
        this.scene.add(ambient);

        this.createGridLines();
        this.createTerrainMesh();
        this.createWaterMesh();
        this.createTreeMarkers();
        this.createContourLines();
        this.setupToggle();
        this.setupTooltip();
    },

    createGridLines() {
        // Raster für räumliche Orientierung
        this.gridGroup = new THREE.Group();
        const gridSpacing = 200;
        const gridLines = Math.ceil(MAP_SIZE / gridSpacing);
        const gridMat = new THREE.LineBasicMaterial({
            color: 0x334455,
            transparent: true,
            opacity: 0.25,
            linewidth: 1
        });

        for (let i = 0; i <= gridLines; i++) {
            const pos = (i - gridLines / 2) * gridSpacing;

            // Vertikale Linien
            const geo1 = new THREE.BufferGeometry();
            geo1.setAttribute('position', new THREE.BufferAttribute(
                new Float32Array([
                    pos, 10, -MAP_SIZE / 2,
                    pos, 10, MAP_SIZE / 2
                ]), 3
            ));
            this.gridGroup.add(new THREE.Line(geo1, gridMat));

            // Horizontale Linien
            const geo2 = new THREE.BufferGeometry();
            geo2.setAttribute('position', new THREE.BufferAttribute(
                new Float32Array([
                    -MAP_SIZE / 2, 10, pos,
                    MAP_SIZE / 2, 10, pos
                ]), 3
            ));
            this.gridGroup.add(new THREE.Line(geo2, gridMat));
        }

        this.scene.add(this.gridGroup);
    },

    createTerrainMesh() {
        if (!terrain || !heightData) return;

        const seg = SEGMENTS / 2;
        const geo = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        for (let iz = 0; iz <= seg; iz++) {
            for (let ix = 0; ix <= seg; ix++) {
                const x = (ix / seg - 0.5) * MAP_SIZE;
                const z = (iz / seg - 0.5) * MAP_SIZE;
                const h = getH(x, z);

                positions.push(x, h, z);

                // Detaillierte CIA-Kartenstil-Färbung
                let col;
                if (h < 2.5) {
                    // Tiefes Wasser
                    col = new THREE.Color(0x0a2850);
                } else if (h < 4) {
                    // Flachwasser/Strand
                    col = new THREE.Color(0x4a6a8a);
                } else if (h < 6) {
                    // Sand/Ufer
                    col = new THREE.Color(0x9a8a6a);
                } else if (h < 10) {
                    // Tiefes Gras
                    col = new THREE.Color(0x2a5a1a);
                } else if (h < 16) {
                    // Helles Grasland
                    col = new THREE.Color(0x4a7a2a);
                } else if (h < 22) {
                    // Hügel
                    col = new THREE.Color(0x7a8a4a);
                } else if (h < 28) {
                    // Berge
                    col = new THREE.Color(0x8a8a7a);
                } else {
                    // Schneeberge
                    col = new THREE.Color(0xd0d0c0);
                }

                colors.push(col.r, col.g, col.b);
            }
        }

        const indices = [];
        for (let iz = 0; iz < seg; iz++) {
            for (let ix = 0; ix < seg; ix++) {
                const a = iz * (seg + 1) + ix;
                const b = iz * (seg + 1) + ix + 1;
                const c = (iz + 1) * (seg + 1) + ix;
                const d = (iz + 1) * (seg + 1) + ix + 1;

                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            metalness: 0.05,
            flatShading: false
        });

        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.scene.add(this.terrainMesh);
    },

    createWaterMesh() {
        // Echte Wasserflächen basierend auf Höhe < 3
        const waterGeo = new THREE.BufferGeometry();
        const positions = [];
        const indices = [];

        const step = MAP_SIZE / 20;
        let vertexIndex = 0;

        for (let x = -MAP_SIZE / 2; x < MAP_SIZE / 2; x += step) {
            for (let z = -MAP_SIZE / 2; z < MAP_SIZE / 2; z += step) {
                const h = getH(x, z);
                if (h < 3) {
                    positions.push(x, 1, z);
                    vertexIndex++;
                }
            }
        }

        if (positions.length > 0) {
            // Einfache Triangulation für Wasserflächen
            const cols = Math.sqrt(vertexIndex);
            for (let i = 0; i < vertexIndex - cols - 1; i++) {
                if ((i + 1) % cols === 0) continue;
                indices.push(i, i + cols, i + 1);
                indices.push(i + 1, i + cols, i + cols + 1);
            }

            waterGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
            if (indices.length > 0) {
                waterGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            }

            const waterMat = new THREE.MeshStandardMaterial({
                color: 0x1a4a8a,
                transparent: true,
                opacity: 0.7,
                roughness: 0.6,
                metalness: 0.2
            });

            this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
            this.scene.add(this.waterMesh);
        }
    },

    createTreeMarkers() {
        // Kleine grüne Dreiecke für Bäume
        if (typeof trees === 'undefined') return;

        const treeMat = new THREE.MeshBasicMaterial({ color: 0x2a8a2a });
        const treeGeo = new THREE.ConeGeometry(2, 4, 3);

        trees.forEach(tree => {
            if (!tree.alive) return;
            const m = new THREE.Mesh(treeGeo, treeMat);
            const pos = tree.mesh.position;
            m.position.set(pos.x, getH(pos.x, pos.z) + 2, pos.z);
            m.castShadow = false;
            this.scene.add(m);
            this.treeMarkers.push(m);
        });
    },

    createContourLines() {
        // Höhenlinien alle 4 Einheiten
        const contourGroup = new THREE.Group();
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x6699aa,
            transparent: true,
            opacity: 0.4,
            linewidth: 1
        });

        const contourInterval = 4;
        const step = MAP_SIZE / 50;

        for (let h = contourInterval; h < 35; h += contourInterval) {
            const points = [];

            for (let x = -MAP_SIZE / 2; x < MAP_SIZE / 2; x += step) {
                for (let z = -MAP_SIZE / 2; z < MAP_SIZE / 2; z += step) {
                    const h1 = getH(x, z);
                    const h2 = getH(x + step, z);

                    if ((h1 < h && h2 >= h) || (h1 >= h && h2 < h)) {
                        const t = (h - h1) / (h2 - h1);
                        points.push(new THREE.Vector3(x + t * step, h + 0.1, z));
                    }
                }
            }

            if (points.length > 1) {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(
                    new Float32Array(points.flatMap(p => [p.x, p.y, p.z])), 3
                ));
                const line = new THREE.Line(geo, lineMat);
                contourGroup.add(line);
            }
        }

        this.scene.add(contourGroup);
        this.contourLines = contourGroup;
    },

    setupToggle() {
        let btn = document.getElementById('minimap-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'minimap-toggle';
            btn.innerHTML = '🗺 TAKTIK<br><span style="font-size: 8px; opacity: 0.6;">[M]</span>';
            btn.style.position = 'absolute';
            btn.style.top = '14px';
            btn.style.right = '14px';
            btn.style.fontSize = '10px';
            btn.style.padding = '6px 12px';
            btn.style.zIndex = '25';
            btn.style.background = 'rgba(0,240,255,0.08)';
            btn.style.border = '1px solid rgba(0,240,255,0.2)';
            btn.style.color = 'var(--p1-color)';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.2s';
            btn.style.letterSpacing = '1px';
            btn.style.fontFamily = "'Orbitron', monospace";
            btn.style.fontWeight = '600';
            btn.style.display = 'none';
            btn.style.lineHeight = '1.2';
            btn.style.minWidth = '70px';
            btn.style.textAlign = 'center';
            document.getElementById('ui-layer').appendChild(btn);

            const toggleMap = () => {
                this.enabled = !this.enabled;
                this.canvas.style.opacity = this.enabled ? '1' : '0.25';
                this.canvas.style.pointerEvents = this.enabled ? 'auto' : 'none';
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => { btn.style.transform = 'scale(1)'; }, 100);
            };

            btn.addEventListener('click', toggleMap);

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(0,240,255,0.15)';
                btn.style.borderColor = 'rgba(0,240,255,0.5)';
                btn.style.boxShadow = '0 0 12px rgba(0,240,255,0.2)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(0,240,255,0.08)';
                btn.style.borderColor = 'rgba(0,240,255,0.2)';
                btn.style.boxShadow = 'none';
            });

            window.addEventListener('keydown', (e) => {
                if ((e.key.toLowerCase() === 'm' || e.key === 'ß') &&
                    gameState !== 'MENU' && gameState !== 'TRANSITION' &&
                    !e.target.closest('input')) {
                    toggleMap();
                }
            });
        }
        window._minimapToggle = btn;
    },

    setupTooltip() {
        this.canvas.title = 'Taktische Minimap: Terrain mit echten Seen, Höhenlinien, alle Einheiten (Panzer/Bunker/CPs/Bäume)';
    },

    updateGameplayElements() {
        // Lösche alte Marker
        this.unitMarkers.forEach(m => this.scene.remove(m));
        this.unitMarkers = [];

        // ── Panzer mit HP-Anzeige ──
        const drawTank = (tank, color) => {
            if (!tank || !tank.alive) return;

            const tanksGrp = new THREE.Group();

            // Panzer-Körper (Kegel)
            const bodyGeo = new THREE.ConeGeometry(5, 8, 8);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.7,
                metalness: 0.85
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.x = Math.PI / 2;
            body.rotation.y = tank.heading;
            tanksGrp.add(body);

            // HP-Balken (oben)
            const hpPct = Math.max(0, tank.hp / tank.maxHP);
            const hpGeo = new THREE.PlaneGeometry(8 * hpPct, 1);
            const hpCol = hpPct > 0.6 ? 0x00ff88 : hpPct > 0.3 ? 0xffaa00 : 0xff3333;
            const hpMat = new THREE.MeshBasicMaterial({ color: hpCol });
            const hp = new THREE.Mesh(hpGeo, hpMat);
            hp.position.y = 5;
            tanksGrp.add(hp);

            const pos = tank.mesh.position;
            tanksGrp.position.set(pos.x, getH(pos.x, pos.z) + 6, pos.z);

            this.scene.add(tanksGrp);
            this.unitMarkers.push(tanksGrp);
        };

        teams.forEach((team, idx) => {
            const color = idx === 0 ? 0x00e5ff : 0xff2d55;
            team.forEach(tank => drawTank(tank, color));
        });

        // ── Bunker ──
        if (typeof bunkers !== 'undefined') {
            bunkers.forEach(bunker => {
                if (!bunker.alive) return;
                const geo = new THREE.CylinderGeometry(4, 5, 4, 6);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xffaa33,
                    metalness: 0.6,
                    roughness: 0.6
                });
                const mesh = new THREE.Mesh(geo, mat);
                const pos = bunker.mesh.position;
                mesh.position.set(pos.x, getH(pos.x, pos.z) + 2.5, pos.z);
                this.scene.add(mesh);
                this.unitMarkers.push(mesh);
            });
        }

        // ── Kontrollpunkte mit Status ──
        if (typeof controlPoints !== 'undefined') {
            controlPoints.forEach(cp => {
                const grp = new THREE.Group();

                // Flagge
                const col = cp.holder === 0 ? 0x00e5ff : cp.holder === 1 ? 0xff2d55 : 0xffffff;
                const flagGeo = new THREE.BoxGeometry(7, 14, 2.5);
                const flagMat = new THREE.MeshStandardMaterial({
                    color: col,
                    emissive: col,
                    emissiveIntensity: 0.9,
                    metalness: 0.7
                });
                const flag = new THREE.Mesh(flagGeo, flagMat);
                flag.position.y = 8;
                grp.add(flag);

                // Mast
                const mastGeo = new THREE.CylinderGeometry(0.8, 0.8, 14, 4);
                const mastMat = new THREE.MeshStandardMaterial({
                    color: 0x777777,
                    metalness: 0.9
                });
                const mast = new THREE.Mesh(mastGeo, mastMat);
                grp.add(mast);

                grp.position.copy(cp.pos);
                grp.position.y = getH(cp.pos.x, cp.pos.z);

                this.scene.add(grp);
                this.unitMarkers.push(grp);
            });
        }

        // ── Schilde (Sphären) ──
        if (typeof shields !== 'undefined') {
            shields.forEach(shield => {
                const shieldGeo = new THREE.SphereGeometry(
                    shield.currentRadius, 16, 12
                );
                const col = shield.team === 0 ? 0x00e5ff : 0xff2d55;
                const shieldMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.15,
                    wireframe: true
                });
                const mesh = new THREE.Mesh(shieldGeo, shieldMat);
                mesh.position.copy(shield.pos);
                mesh.position.y = getH(shield.pos.x, shield.pos.z);
                this.scene.add(mesh);
                this.unitMarkers.push(mesh);
            });
        }

        // ── Projektil mit Tracer ──
        if (typeof projectile !== 'undefined' && projectile && projectile.visible) {
            const projGeo = new THREE.SphereGeometry(4, 8, 8);
            const projMat = new THREE.MeshBasicMaterial({
                color: projectile.material.color,
                emissive: projectile.material.color,
                transparent: true,
                opacity: 0.95
            });
            const proj = new THREE.Mesh(projGeo, projMat);
            proj.position.copy(projectile.position);
            this.scene.add(proj);
            this.unitMarkers.push(proj);

            // Tracer-Linie zum nächsten Punkt
            if (typeof projectileVel !== 'undefined' && projectileVel) {
                const nextPos = projectile.position.clone()
                    .add(projectileVel.clone().multiplyScalar(0.08));
                const lineGeo = new THREE.BufferGeometry();
                lineGeo.setAttribute('position', new THREE.BufferAttribute(
                    new Float32Array([
                        projectile.position.x, projectile.position.y, projectile.position.z,
                        nextPos.x, nextPos.y, nextPos.z
                    ]), 3
                ));
                const lineMat = new THREE.LineBasicMaterial({
                    color: projectile.material.color,
                    transparent: true,
                    opacity: 0.7,
                    linewidth: 2
                });
                const line = new THREE.Line(lineGeo, lineMat);
                this.scene.add(line);
                this.unitMarkers.push(line);
            }
        }
    },

    draw(dt) {
        if (!this.enabled || !this.renderer || !this.scene) return;

        this.updateGameplayElements();

        try {
            this.renderer.render(this.scene, this.camera);
        } catch (e) {
            console.warn('Minimap render failed:', e);
        }
    },

    showToggleButton() {
        if (window._minimapToggle) {
            window._minimapToggle.style.display = 'block';
        }
    },

    hideToggleButton() {
        if (window._minimapToggle) {
            window._minimapToggle.style.display = 'none';
        }
    }
};

function initMinimap() {
    Minimap.init();
}

function updateMinimap(dt) {
    Minimap.draw(dt);
}

window.Minimap = Minimap;

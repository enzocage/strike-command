// ═══════════════════════════════════════════════════════════════
// STRIKE COMMANDER — 3D Tactical Minimap (CIA-Style)
// Höhenlinien, Seegrenzen, Terrain-Färbung, 3D-Einheiten
// ═══════════════════════════════════════════════════════════════

const Minimap = {
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    terrainMesh: null,
    contourLines: null,
    waterBorder: null,
    unitMarkers: [],
    enabled: true,
    size: 320,

    init() {
        // Canvas & WebGL-Renderer
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
                alpha: true,
                powerPreference: 'low-power'
            });
            this.renderer.setSize(this.size, this.size);
            this.renderer.setPixelRatio(1);
            this.renderer.setClearColor(0x0a1520, 0.95);
            this.renderer.shadowMap.enabled = false;
        } catch (e) {
            console.warn('Minimap WebGL init failed:', e);
            return;
        }

        // Scene & orthografische Kamera (Draufsicht)
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(
            -MAP_SIZE / 2, MAP_SIZE / 2,
            MAP_SIZE / 2, -MAP_SIZE / 2,
            0.1, 10000
        );
        this.camera.position.set(0, 500, 0);
        this.camera.lookAt(0, 0, 0);

        // Beleuchtung (flach für Minimap)
        const light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(500, 800, 500);
        this.scene.add(light);
        const ambient = new THREE.AmbientLight(0xaabbcc, 0.8);
        this.scene.add(ambient);

        this.createTerrainMesh();
        this.createContourLines();
        this.createWaterBorder();
        this.setupToggle();
        this.setupTooltip();
    },

    createTerrainMesh() {
        if (!terrain || !heightData) return;

        // Vereinfachtes Terrain-Mesh (jeder 2. Vertex, um Performance zu sparen)
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

                // CIA-Kartenstil: Farbe nach Höhe
                // Wasser: Dunkelblau, Sand: Hell, Gras: Grün, Berge: Grau/Beige
                let col;
                if (h < 3) {
                    col = new THREE.Color(0x1a4a7a); // Wasser-Blau
                } else if (h < 5) {
                    col = new THREE.Color(0x8a7a5a); // Sand
                } else if (h < 15) {
                    col = new THREE.Color(0x3a6a2a); // Gras
                } else if (h < 22) {
                    col = new THREE.Color(0x6a7a5a); // Grüne Hügel
                } else if (h < 28) {
                    col = new THREE.Color(0x8a8a7a); // Graue Berge
                } else {
                    col = new THREE.Color(0xd0d0c0); // Schnee
                }

                colors.push(col.r, col.g, col.b);
            }
        }

        // Indizes für Triangles
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
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false
        });

        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.scene.add(this.terrainMesh);
    },

    createContourLines() {
        // Höhenlinien: Linen alle 5 Höhen-Einheiten
        const contourGroup = new THREE.Group();
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x8899aa,
            transparent: true,
            opacity: 0.5,
            linewidth: 1
        });

        const contourInterval = 5;
        const maxH = 35;

        for (let h = contourInterval; h < maxH; h += contourInterval) {
            const points = [];

            // Marching-Squares-ähnlich: Finde Punkte auf dieser Höhe
            const step = MAP_SIZE / 40; // Grobe Auflösung für Performance
            for (let x = -MAP_SIZE / 2; x < MAP_SIZE / 2; x += step) {
                for (let z = -MAP_SIZE / 2; z < MAP_SIZE / 2; z += step) {
                    const h1 = getH(x, z);
                    const h2 = getH(x + step, z);
                    const h3 = getH(x, z + step);

                    // Punkt liegt zwischen h1 und h2 (linear interpolieren)
                    if ((h1 < h && h2 >= h) || (h1 >= h && h2 < h)) {
                        const t = (h - h1) / (h2 - h1);
                        points.push(new THREE.Vector3(x + t * step, h + 0.1, z));
                    }
                    if ((h1 < h && h3 >= h) || (h1 >= h && h3 < h)) {
                        const t = (h - h1) / (h3 - h1);
                        points.push(new THREE.Vector3(x, h + 0.1, z + t * step));
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

    createWaterBorder() {
        // Seegrenze: Kontur der Landmasse bei Höhe ~2
        const waterLevel = 2;
        const points = [];
        const step = MAP_SIZE / 60;

        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 60) {
            let r = 20;
            let found = false;
            while (r < MAP_SIZE * 0.6 && !found) {
                const x = Math.cos(angle) * r;
                const z = Math.sin(angle) * r;
                const h = getH(x, z);
                if (h > waterLevel && !found) {
                    points.push(new THREE.Vector3(x, waterLevel + 0.2, z));
                    found = true;
                }
                r += step;
            }
        }

        if (points.length > 3) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(
                new Float32Array(points.flatMap(p => [p.x, p.y, p.z])), 3
            ));
            const mat = new THREE.LineBasicMaterial({
                color: 0x4488cc,
                transparent: true,
                opacity: 0.8,
                linewidth: 2
            });
            this.waterBorder = new THREE.Line(geo, mat);
            this.scene.add(this.waterBorder);
        }
    },

    setupToggle() {
        let btn = document.getElementById('minimap-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'minimap-toggle';
            btn.textContent = '🗺 KARTE: AN';
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
            document.getElementById('ui-layer').appendChild(btn);

            btn.addEventListener('click', () => {
                this.enabled = !this.enabled;
                btn.textContent = this.enabled ? '🗺 KARTE: AN' : '🗺 KARTE: AUS';
                this.canvas.style.opacity = this.enabled ? '1' : '0.3';
                this.canvas.style.pointerEvents = this.enabled ? 'auto' : 'none';
            });

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
        }
        window._minimapToggle = btn;
    },

    setupTooltip() {
        this.canvas.title = '3D Taktische Minimap: Grün=Grasland, Beige=Berge, Blau=Wasser, Linien=Höhenkonturen';
    },

    updateUnitMarkers() {
        // Lösche alte Marker
        this.unitMarkers.forEach(m => this.scene.remove(m));
        this.unitMarkers = [];

        // Panzer (kleine Kegel mit Richtung)
        const drawTank = (tank, color) => {
            if (!tank || !tank.alive) return;

            const tankGeo = new THREE.ConeGeometry(4, 8, 8);
            const tankMat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.6,
                metalness: 0.8
            });
            const tankMesh = new THREE.Mesh(tankGeo, tankMat);

            const pos = tank.mesh.position;
            tankMesh.position.set(pos.x, getH(pos.x, pos.z) + 5, pos.z);
            tankMesh.rotation.x = Math.PI / 2;
            tankMesh.rotation.y = tank.heading;
            tankMesh.castShadow = false;

            this.scene.add(tankMesh);
            this.unitMarkers.push(tankMesh);
        };

        teams.forEach((team, idx) => {
            const color = idx === 0 ? 0x00e5ff : 0xff2d55;
            team.forEach(tank => drawTank(tank, color));
        });

        // Bunker (kleine Zylinder)
        if (typeof bunkers !== 'undefined') {
            bunkers.forEach(bunker => {
                if (!bunker.alive) return;
                const geo = new THREE.CylinderGeometry(3.5, 4, 3, 6);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xffaa33,
                    metalness: 0.5
                });
                const mesh = new THREE.Mesh(geo, mat);
                const pos = bunker.mesh.position;
                mesh.position.set(pos.x, getH(pos.x, pos.z) + 2, pos.z);
                this.scene.add(mesh);
                this.unitMarkers.push(mesh);
            });
        }

        // Kontrollpunkte (Flaggen)
        if (typeof controlPoints !== 'undefined') {
            controlPoints.forEach(cp => {
                const col = cp.holder === 0 ? 0x00e5ff : cp.holder === 1 ? 0xff2d55 : 0xffffff;
                const geo = new THREE.BoxGeometry(6, 12, 2);
                const mat = new THREE.MeshStandardMaterial({
                    color: col,
                    emissive: col,
                    emissiveIntensity: 0.8
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(cp.pos);
                mesh.position.y = getH(cp.pos.x, cp.pos.z) + 8;
                mesh.castShadow = false;
                this.scene.add(mesh);
                this.unitMarkers.push(mesh);
            });
        }

        // Projektil (Sphäre)
        if (typeof projectile !== 'undefined' && projectile && projectile.visible) {
            const geo = new THREE.SphereGeometry(3, 8, 8);
            const mat = new THREE.MeshBasicMaterial({
                color: projectile.material.color,
                emissive: projectile.material.color,
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(projectile.position);
            this.scene.add(mesh);
            this.unitMarkers.push(mesh);
        }
    },

    draw(dt) {
        if (!this.enabled || !this.renderer || !this.scene) return;

        this.updateUnitMarkers();

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

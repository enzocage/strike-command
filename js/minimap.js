// ═══════════════════════════════════════════════════════════════
// STRIKE COMMANDER — Taktische 3D-Minimap
// Echtes Terrain (hypsometrische Färbung), reale Seen & Küstenlinien
// (Marching Squares), Höhenlinien, alle Gameplay-Elemente live,
// Fog-of-War-treu, toggbar per Button & [M]-Taste.
//
// Architektur: init() einmalig · rebuild() pro Partie (statisches
// Terrain) · draw() pro Frame (nur Marker-Sync, keine Allokationen)
// ═══════════════════════════════════════════════════════════════

const Minimap = {
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    enabled: true,
    size: 360,

    staticGroup: null,      // Terrain, Wasser, Konturen, Grid, Küste
    treeGroup: null,        // Baum-Marker (alive-Sync)
    bunkerGroup: null,
    tankMarkers: [],        // [{tank, group, body, hpBar, hpMat}]
    cpMarkers: [],          // [{cp, flagMat}]
    shieldPool: [],
    projMarker: null,
    projTracer: null,       // Projektil-Geschwindigkeitstracer
    camWedge: null,
    closeBtn: null,         // Schließen-Button am Minimap-Kopf
    _treeRefs: [],
    _bunkerRefs: [],

    // ── Einmalige Initialisierung ──
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

        let closeBtn = document.getElementById('minimap-close-btn');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'minimap-close-btn';
            closeBtn.innerHTML = '✖';
            document.getElementById('ui-layer').appendChild(closeBtn);

            closeBtn.addEventListener('click', () => {
                if (this.enabled) {
                    window._minimapToggle.click();
                }
            });
        }
        this.closeBtn = closeBtn;

        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas, antialias: true, alpha: false, powerPreference: 'low-power'
            });
            this.renderer.setSize(this.size, this.size);
            this.renderer.setPixelRatio(1);
            this.renderer.setClearColor(0x060c14, 1);
        } catch (e) {
            console.warn('Minimap WebGL init failed:', e);
            return;
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
        this.camera.up.set(0, 0, -1);           // Norden (-z) ist oben
        this.camera.position.set(0, 1200, 0);
        this.camera.lookAt(0, 0, 0);

        const sun = new THREE.DirectionalLight(0xfff4e0, 1.54);
        sun.position.set(400, 900, 300);
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0xc8d8ee, 0.85));

        this.setupToggle();
        this.canvas.title = 'Taktische Karte — Höhenlinien, Seen, Einheiten · [M] zum Umschalten';

        this.rebuild();
    },

    // ── Statisches Terrain entsorgen ──
    _disposeStatic() {
        const kill = (grp) => {
            if (!grp) return;
            grp.traverse(c => {
                if (c.isMesh || c.isLine || c.isLineSegments) {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material && !c.material._shared) c.material.dispose();
                }
            });
            this.scene.remove(grp);
        };
        kill(this.staticGroup); this.staticGroup = null;
        kill(this.treeGroup); this.treeGroup = null;
        kill(this.bunkerGroup); this.bunkerGroup = null;
        this.tankMarkers.forEach(m => kill(m.group));
        this.tankMarkers = [];
        this.cpMarkers.forEach(m => kill(m.group));
        this.cpMarkers = [];
        this.shieldPool.forEach(m => kill(m));
        this.shieldPool = [];
        if (this.projMarker) { kill(this.projMarker); this.projMarker = null; }
        if (this.projTracer) { kill(this.projTracer); this.projTracer = null; }
        if (this.camWedge) { kill(this.camWedge); this.camWedge = null; }
    },

    // ── Pro Partie: Terrain & Marker neu aufbauen (Kartengröße ändert sich!) ──
    rebuild() {
        if (!this.scene || typeof MAP_SIZE === 'undefined' || !heightData) return;
        this._disposeStatic();

        // Kamera-Frustum an aktuelle Kartengröße anpassen
        const half = MAP_SIZE * 0.52;
        this.camera.left = -half; this.camera.right = half;
        this.camera.top = half; this.camera.bottom = -half;
        this.camera.updateProjectionMatrix();

        this.staticGroup = new THREE.Group();
        this._buildTerrain();
        this._buildWater();
        this._buildContours();
        this._buildGrid();
        this.scene.add(this.staticGroup);

        this._buildTrees();
        this._buildBunkers();
        this._buildTanks();
        this._buildCPs();
        this._buildProjectileAndCam();
    },

    // ── Hypsometrisch gefärbtes Terrain (tatsächliche Höhendaten) ──
    _buildTerrain() {
        const seg = Math.floor(SEGMENTS / 2);
        const positions = [], colors = [];

        const bands = [
            { h: 1.5,  c: new THREE.Color(0x0f2a4a) },  // Tiefwasser
            { h: 3.0,  c: new THREE.Color(0x1a4a75) },  // Flachwasser
            { h: 5.0,  c: new THREE.Color(0xd2b48c) },  // Sand
            { h: 12.0, c: new THREE.Color(0x3e7c32) },  // Gras
            { h: 20.0, c: new THREE.Color(0x5a8f42) },  // Hügel
            { h: 28.0, c: new THREE.Color(0x7c7c5c) },  // Berge
            { h: 35.0, c: new THREE.Color(0x908d86) },  // Hochgebirge
            { h: 99.0, c: new THREE.Color(0xe8ecee) },  // Schnee
        ];
        const colAt = (h) => {
            for (let i = 0; i < bands.length; i++) {
                if (h < bands[i].h) {
                    if (i === 0) return bands[0].c.clone();
                    const lo = bands[i - 1], hi = bands[i];
                    const t = (h - lo.h) / (hi.h - lo.h);
                    return lo.c.clone().lerp(hi.c, Math.max(0, Math.min(1, t)));
                }
            }
            return bands[bands.length - 1].c.clone();
        };

        for (let iz = 0; iz <= seg; iz++) {
            for (let ix = 0; ix <= seg; ix++) {
                const x = (ix / seg - 0.5) * MAP_SIZE;
                const z = (iz / seg - 0.5) * MAP_SIZE;
                const h = getH(x, z);
                positions.push(x, h, z);

                // Hangschattierung für plastisches Relief
                const e = MAP_SIZE / seg;
                const sx = (getH(x + e, z) - getH(x - e, z)) / (2 * e);
                const sz = (getH(x, z + e) - getH(x, z - e)) / (2 * e);
                const shade = 1 - Math.max(-0.25, Math.min(0.3, (sx + sz) * 0.55));
                const c = colAt(h).multiplyScalar(shade);
                colors.push(c.r, c.g, c.b);
            }
        }

        const indices = [];
        for (let iz = 0; iz < seg; iz++) {
            for (let ix = 0; ix < seg; ix++) {
                const a = iz * (seg + 1) + ix, b = a + 1;
                const c = a + seg + 1, d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.9, metalness: 0.0
        });
        this.staticGroup.add(new THREE.Mesh(geo, mat));
    },

    // ── Reale Wasserflächen: Ebene auf Seehöhe → Seen/Meer exakt wo Terrain absinkt ──
    _buildWater() {
        const geo = new THREE.PlaneGeometry(MAP_SIZE * 1.04, MAP_SIZE * 1.04);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x0d3a66, transparent: true, opacity: 0.92,
            roughness: 0.4, metalness: 0.15
        });
        const water = new THREE.Mesh(geo, mat);
        water.position.y = 3.0;   // Spielmechanische Wassergrenze (h<3 = unpassierbar)
        this.staticGroup.add(water);
    },

    // ── Marching Squares: Küstenlinie (h=3) + Höhenlinien ──
    _marchingSquares(level, step) {
        const segs = [];
        const half = MAP_SIZE / 2;
        for (let x = -half; x < half; x += step) {
            for (let z = -half; z < half; z += step) {
                const h00 = getH(x, z),         h10 = getH(x + step, z);
                const h01 = getH(x, z + step),  h11 = getH(x + step, z + step);
                const pts = [];
                // Kantenschnittpunkte (lineare Interpolation)
                if ((h00 < level) !== (h10 < level)) {
                    const t = (level - h00) / (h10 - h00);
                    pts.push([x + t * step, z]);
                }
                if ((h10 < level) !== (h11 < level)) {
                    const t = (level - h10) / (h11 - h10);
                    pts.push([x + step, z + t * step]);
                }
                if ((h01 < level) !== (h11 < level)) {
                    const t = (level - h01) / (h11 - h01);
                    pts.push([x + t * step, z + step]);
                }
                if ((h00 < level) !== (h01 < level)) {
                    const t = (level - h00) / (h01 - h00);
                    pts.push([x, z + t * step]);
                }
                if (pts.length === 2) {
                    segs.push(pts[0], pts[1]);
                } else if (pts.length === 4) {
                    segs.push(pts[0], pts[1], pts[2], pts[3]);
                }
            }
        }
        return segs;
    },

    _lineSegsMesh(segs, y, mat) {
        if (segs.length < 2) return null;
        const arr = new Float32Array(segs.length * 3);
        segs.forEach((p, i) => {
            arr[i * 3] = p[0]; arr[i * 3 + 1] = y; arr[i * 3 + 2] = p[1];
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        return new THREE.LineSegments(geo, mat);
    },

    _buildContours() {
        const step = MAP_SIZE / 90;

        // Küstenlinie: kräftig hell, exakt an der Spielmechanik-Grenze h=3
        const coastMat = new THREE.LineBasicMaterial({
            color: 0x9fd8ff, transparent: true, opacity: 0.85
        });
        const coast = this._lineSegsMesh(this._marchingSquares(3, step), 3.2, coastMat);
        if (coast) this.staticGroup.add(coast);

        // Höhenlinien alle 4 Einheiten, jede 2. kräftiger (Index-Kontur wie auf echten Karten)
        const minorMat = new THREE.LineBasicMaterial({
            color: 0x3a2c14, transparent: true, opacity: 0.22
        });
        const majorMat = new THREE.LineBasicMaterial({
            color: 0x40300f, transparent: true, opacity: 0.4
        });
        for (let h = 4, idx = 0; h < 36; h += 4, idx++) {
            const line = this._lineSegsMesh(
                this._marchingSquares(h, step), h + 0.3,
                idx % 2 === 0 ? majorMat : minorMat
            );
            if (line) this.staticGroup.add(line);
        }
    },

    // ── Koordinaten-Raster ──
    _buildGrid() {
        const half = MAP_SIZE / 2;
        const n = 6;
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const p = -half + (i / n) * MAP_SIZE;
            pts.push([p, -half], [p, half], [-half, p], [half, p]);
        }
        const mat = new THREE.LineBasicMaterial({
            color: 0x88bbdd, transparent: true, opacity: 0.12
        });
        const grid = this._lineSegsMesh(pts, 40, mat);
        if (grid) this.staticGroup.add(grid);
    },

    // ── Bäume (alive-Sync pro Frame) ──
    _buildTrees() {
        this.treeGroup = new THREE.Group();
        this._treeRefs = [];
        if (typeof trees === 'undefined') return;
        const geo = new THREE.ConeGeometry(8, 24, 4);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x154f12, transparent: true, opacity: 0.9
        });
        mat._shared = true;
        trees.forEach(tree => {
            const m = new THREE.Mesh(geo, mat);
            const p = tree.mesh.position;
            m.position.set(p.x, getH(p.x, p.z) + 12, p.z);
            this.treeGroup.add(m);
            this._treeRefs.push({ tree, marker: m });
        });
        this.scene.add(this.treeGroup);
    },

    // ── Bunker ──
    _buildBunkers() {
        this.bunkerGroup = new THREE.Group();
        this._bunkerRefs = [];
        if (typeof bunkers === 'undefined') return;
        const geo = new THREE.CylinderGeometry(50, 50, 25, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffcc00
        });
        mat._shared = true;
        bunkers.forEach(b => {
            const m = new THREE.Mesh(geo, mat);
            const p = b.mesh.position;
            m.position.set(p.x, getH(p.x, p.z) + 12.5, p.z);
            this.bunkerGroup.add(m);
            this._bunkerRefs.push({ bunker: b, marker: m });
        });
        this.scene.add(this.bunkerGroup);
    },

    // ── Panzer-Marker: Richtungspfeil + HP-Balken, einmal erzeugt ──
    _buildTanks() {
        if (typeof teams === 'undefined') return;
        const arrowGeo = new THREE.ConeGeometry(18, 48, 4);
        arrowGeo.rotateX(Math.PI / 2);    // zeigt +z (= heading 0)
        const barGeo = new THREE.PlaneGeometry(36, 6);
        barGeo.rotateX(-Math.PI / 2);
        barGeo.translate(0, 0, -38);

        teams.forEach((team, ti) => {
            const col = ti === 0 ? 0x00e5ff : 0xff2d55;
            team.forEach(tank => {
                const group = new THREE.Group();
                const bodyMat = new THREE.MeshBasicMaterial({ color: col });
                const body = new THREE.Mesh(arrowGeo, bodyMat);
                // Umriss für Lesbarkeit auf hellem Terrain
                const ringGeo = new THREE.RingGeometry(22, 28, 16);
                ringGeo.rotateX(-Math.PI / 2);
                const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                    color: col, transparent: true, opacity: 0.45
                }));
                const hpMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
                const hpBar = new THREE.Mesh(barGeo.clone(), hpMat);
                group.add(body, ring, hpBar);
                this.scene.add(group);
                this.tankMarkers.push({ tank, group, hpBar, hpMat });
            });
        });
    },

    // ── Kontrollpunkte: Ring + Flagge, Farbe folgt Besitzstatus ──
    _buildCPs() {
        if (typeof controlPoints === 'undefined') return;
        controlPoints.forEach(cp => {
            const group = new THREE.Group();
            const ringGeo = new THREE.RingGeometry(CP_CAPTURE_RADIUS * 0.85, CP_CAPTURE_RADIUS, 28);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);

            // Flagpole
            const poleGeo = new THREE.CylinderGeometry(2.5, 2.5, 60, 5);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 30;

            // Flag banner
            const flagGeo = new THREE.BoxGeometry(3, 20, 35);
            flagGeo.translate(0, 0, 17.5); // offset so it starts at pole and extends along Z
            const flagMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const flag = new THREE.Mesh(flagGeo, flagMat);
            flag.position.y = 48;

            group.add(ring, pole, flag);
            group.position.set(cp.pos.x, getH(cp.pos.x, cp.pos.z) + 2, cp.pos.z);
            this.scene.add(group);
            this.cpMarkers.push({ cp, group, ringMat, flagMat });
        });
    },

    // ── Projektil-Marker & Kamerablick-Pfeil ──
    _buildProjectileAndCam() {
        const projGeo = new THREE.SphereGeometry(15, 8, 8);
        const projMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        this.projMarker = new THREE.Mesh(projGeo, projMat);
        this.projMarker.visible = false;
        this.scene.add(this.projMarker);

        // Velocity tracer line
        const tracerGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(6); // 2 vertices, 3 coords each
        tracerGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const tracerMat = new THREE.LineBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        this.projTracer = new THREE.Line(tracerGeo, tracerMat);
        this.projTracer.visible = false;
        this.scene.add(this.projTracer);

        // Blickrichtung der Hauptkamera (räumliche Orientierung)
        const wedgeGeo = new THREE.ConeGeometry(25, 60, 3);
        wedgeGeo.rotateX(Math.PI / 2);
        const wedgeMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.35
        });
        this.camWedge = new THREE.Mesh(wedgeGeo, wedgeMat);
        this.scene.add(this.camWedge);
    },

    // ── Toggle: Button + [M]-Taste ──
    setupToggle() {
        let btn = document.getElementById('minimap-toggle');
        if (btn) { window._minimapToggle = btn; return; }

        btn = document.createElement('button');
        btn.id = 'minimap-toggle';
        document.getElementById('ui-layer').appendChild(btn);

        const render = () => {
            btn.innerHTML = `🗺️ KARTE [M]: ${this.enabled ? 'AN' : 'AUS'}`;
        };
        render();

        const toggleMap = () => {
            this.enabled = !this.enabled;
            this.canvas.style.display = this.enabled && gameState !== 'MENU' ? 'block' : 'none';
            if (this.closeBtn) {
                if (this.enabled && gameState !== 'MENU') this.closeBtn.classList.add('show');
                else this.closeBtn.classList.remove('show');
            }
            render();
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => { btn.style.transform = 'scale(1)'; }, 100);
        };
        btn.addEventListener('click', toggleMap);
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'm' &&
                gameState !== 'MENU' && gameState !== 'TRANSITION' &&
                !(e.target && e.target.closest && e.target.closest('input'))) {
                toggleMap();
            }
        });
        window._minimapToggle = btn;
    },

    show() {
        if (this.canvas && this.enabled) {
            this.canvas.style.display = 'block';
            if (this.closeBtn) this.closeBtn.classList.add('show');
        }
        if (window._minimapToggle) window._minimapToggle.classList.add('show');
        const hBtn = document.getElementById('help-toggle');
        if (hBtn) hBtn.classList.add('show');
    },

    hide() {
        if (this.canvas) this.canvas.style.display = 'none';
        if (this.closeBtn) this.closeBtn.classList.remove('show');
        if (window._minimapToggle) window._minimapToggle.classList.remove('show');
        const hBtn = document.getElementById('help-toggle');
        if (hBtn) hBtn.classList.remove('show');
    },

    // ── Pro Frame: nur Marker synchronisieren, nichts allokieren ──
    draw(dt) {
        if (!this.enabled || !this.renderer || gameState === 'MENU') return;
        if (this.canvas.style.display === 'none') return;

        // Bäume & Bunker: alive-Status
        this._treeRefs.forEach(r => { r.marker.visible = r.tree.alive; });
        this._bunkerRefs.forEach(r => { r.marker.visible = r.bunker.alive; });

        // Panzer: Position, Richtung, HP, Fog of War
        this.tankMarkers.forEach(m => {
            const t = m.tank;
            const fogHidden = t.team === 1 && t.mesh && !t.mesh.visible;
            m.group.visible = t.alive && !fogHidden;
            if (!m.group.visible) return;
            const p = t.mesh.position;
            m.group.position.set(p.x, getH(p.x, p.z) + 15, p.z);
            m.group.rotation.y = t.heading;
            const hp = Math.max(0.01, t.hp / t.maxHP);
            m.hpBar.scale.x = hp;
            m.hpMat.color.setHex(hp > 0.6 ? 0x00ff88 : hp > 0.3 ? 0xffaa00 : 0xff3333);
        });

        // Kontrollpunkte: Besitz/Eroberung
        this.cpMarkers.forEach(m => {
            const cp = m.cp;
            const col = cp.holder === 0 ? 0x00e5ff
                : cp.holder === 1 ? 0xff2d55
                : cp.capturingTeam === 0 ? 0x007a99
                : cp.capturingTeam === 1 ? 0x99203a
                : 0xc8d8e0;
            m.ringMat.color.setHex(col);
            m.flagMat.color.setHex(col);
        });

        // Schilde: Pool an aktuelle Anzahl angleichen
        const sh = (typeof shields !== 'undefined') ? shields : [];
        while (this.shieldPool.length < sh.length) {
            const g = new THREE.SphereGeometry(1, 14, 10);
            const mt = new THREE.MeshBasicMaterial({
                transparent: true, opacity: 0.35, wireframe: true
            });
            const mesh = new THREE.Mesh(g, mt);
            this.scene.add(mesh);
            this.shieldPool.push(mesh);
        }
        this.shieldPool.forEach((mesh, i) => {
            const s = sh[i];
            mesh.visible = !!s;
            if (!s) return;
            mesh.position.copy(s.pos);
            mesh.scale.setScalar(s.currentRadius);
            mesh.material.color.setHex(s.team === 0 ? 0x00e5ff : 0xff2d55);
        });

        // Projektil
        if (this.projMarker) {
            const liveProj = typeof projectile !== 'undefined' && projectile && projectile.visible;
            this.projMarker.visible = !!liveProj;
            if (this.projTracer) this.projTracer.visible = !!liveProj;
            if (liveProj) {
                this.projMarker.position.copy(projectile.position);
                this.projMarker.material.color.copy(projectile.material.color);

                if (typeof projectileVel !== 'undefined' && projectileVel) {
                    const posAttr = this.projTracer.geometry.attributes.position;
                    // Start of line at current projectile position
                    posAttr.setXYZ(0, projectile.position.x, projectile.position.y, projectile.position.z);
                    // End of line pointing backward along velocity
                    const backVec = projectileVel.clone().multiplyScalar(-0.15);
                    posAttr.setXYZ(1, 
                        projectile.position.x + backVec.x, 
                        projectile.position.y + backVec.y, 
                        projectile.position.z + backVec.z
                    );
                    posAttr.needsUpdate = true;
                    this.projTracer.material.color.copy(projectile.material.color);
                }
            }
        }

        // Hauptkamera-Blickrichtung
        if (this.camWedge && typeof camera !== 'undefined') {
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            this.camWedge.position.set(camera.position.x, 60, camera.position.z);
            this.camWedge.rotation.y = Math.atan2(dir.x, dir.z);
        }

        this.renderer.render(this.scene, this.camera);
    }
};

function initMinimap() { Minimap.init(); }
function updateMinimap(dt) { Minimap.draw(dt); }

window.Minimap = Minimap;

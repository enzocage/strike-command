function PlaneGeometryMod(w, h, ws, hs) { return new THREE.PlaneGeometry(w, h, ws, hs); }

// ─── Prozedurales Terrain: zufällige Phasen/Frequenzen pro Partie,
//     Amplitude und Bergrücken skalieren mit der Schwierigkeits-Rauheit ───
let terrainParams = null;

function rollTerrainParams(ruggedness) {
    const P = () => Math.random() * Math.PI * 2;
    terrainParams = {
        r: ruggedness,
        p1: P(), p2: P(), p3: P(), p4: P(),
        f1: 0.010 + Math.random() * 0.006,
        f2: 0.011 + Math.random() * 0.007,
        f3: 0.030 + Math.random() * 0.016,
        f4: 0.024 + Math.random() * 0.012,
        f5: 0.006 + Math.random() * 0.004,
        f6: 0.007 + Math.random() * 0.004,
        ridge: Math.max(0, ruggedness - 1.0)
    };
}

function hash2D(x, y) {
    const sx = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return sx - Math.floor(sx);
}

function valueNoise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);

    const a = hash2D(ix, iy);
    const b = hash2D(ix + 1, iy);
    const c = hash2D(ix, iy + 1);
    const d = hash2D(ix + 1, iy + 1);

    return a * (1 - ux) * (1 - uy) +
           b * ux * (1 - uy) +
           c * (1 - ux) * uy +
           d * ux * uy;
}

function calcTerrainH(x, z) {
    const tp = terrainParams;
    const maxRadius = MAP_SIZE * 0.45;
    const distFromCenter = Math.sqrt(x*x + z*z);
    let mask = 1 - Math.pow(distFromCenter / maxRadius, 4);
    mask = Math.max(0, Math.min(1, mask));
    const amp = 0.55 + 0.45 * tp.r;

    const scale = 0.0035;
    const nx = x * scale + tp.p1;
    const nz = z * scale + tp.p2;

    const n1 = valueNoise2D(nx, nz);
    const n2 = valueNoise2D(nx * 2.1 + tp.p3, nz * 2.1 + tp.p4) * 0.5;
    const n3 = valueNoise2D(nx * 4.4 - tp.p2, nz * 4.4 + tp.p1) * 0.25;
    const n4 = valueNoise2D(nx * 8.9 + tp.p4, nz * 8.9 - tp.p3) * 0.125;
    const noiseVal = (n1 + n2 + n3 + n4) / 1.875;

    let h = noiseVal * 42 * amp;

    if (tp.ridge > 0) {
        const rVal = valueNoise2D(nx * 3.2 + tp.p4, nz * 3.2 - tp.p1);
        const ridge = 1.0 - Math.abs(rVal * 2.0 - 1.0);
        h += ridge * ridge * 18 * tp.ridge;
    }

    h += Math.sin(x*0.085 + tp.p2) * Math.cos(z*0.092 + tp.p4) * 1.8 * amp;
    h += 12;
    return h * mask - 3;
}

function disposeWorldMeshes() {
    [terrain, water, window._foamRing].forEach(m => {
        if(m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    });
    terrain = null; water = null; window._foamRing = null;
    if(cloudsGroup) {
        scene.remove(cloudsGroup);
        cloudsGroup.traverse(c => { if(c.isMesh) c.geometry.dispose(); });
        cloudsGroup = null;
    }
    if(window._scatterGroup) {
        scene.remove(window._scatterGroup);
        window._scatterGroup.traverse(c => { if(c.isMesh) c.geometry.dispose(); });
        window._scatterGroup = null;
    }
}

// ─── Streudekoration: Felsbrocken & Grasbüschel ───
function spawnScatter() {
    const g = new THREE.Group();
    const rockMats = [
        new THREE.MeshStandardMaterial({ color: 0x4a4f4c, roughness: 0.95, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 0.95, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x3a4040, roughness: 0.95, flatShading: true }),
    ];
    let placed = 0, tries = 0;
    const rockCount = Math.round(MAP_SIZE / 18);
    while(placed < rockCount && tries < rockCount * 10) {
        tries++;
        const x = (Math.random()-0.5) * MAP_SIZE * 0.85;
        const z = (Math.random()-0.5) * MAP_SIZE * 0.85;
        const h = getH(x, z);
        if(h < 1 || h > 30) continue;
        placed++;
        const size = 1.5 + Math.random() * 5;
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(size, 0),
            rockMats[Math.floor(Math.random() * rockMats.length)]
        );
        rock.position.set(x, h + size * 0.15, z);
        rock.scale.set(1 + Math.random()*0.6, 0.55 + Math.random()*0.35, 1 + Math.random()*0.6);
        rock.rotation.set(Math.random()*0.4, Math.random()*Math.PI*2, Math.random()*0.4);
        rock.castShadow = true; rock.receiveShadow = true;
        g.add(rock);
    }

    // Grasbüschel: kleine helle Kegel, nur auf Grasland
    const tuftMat = new THREE.MeshStandardMaterial({
        color: 0x3e6b2e, emissive: 0x142a0a, emissiveIntensity: 0.3,
        roughness: 1, flatShading: true
    });
    const tuftGeo = new THREE.ConeGeometry(0.8, 2.4, 4);
    let tPlaced = 0, tTries = 0;
    const tuftCount = Math.round(MAP_SIZE / 6);
    while(tPlaced < tuftCount && tTries < tuftCount * 8) {
        tTries++;
        const x = (Math.random()-0.5) * MAP_SIZE * 0.8;
        const z = (Math.random()-0.5) * MAP_SIZE * 0.8;
        const h = getH(x, z);
        if(h < 4 || h > 20) continue;
        tPlaced++;
        const cluster = new THREE.Group();
        const n = 2 + Math.floor(Math.random()*3);
        for(let k=0; k<n; k++) {
            const t = new THREE.Mesh(tuftGeo, tuftMat);
            t.position.set((Math.random()-0.5)*3, 1.0, (Math.random()-0.5)*3);
            t.scale.setScalar(0.7 + Math.random()*0.8);
            t.rotation.z = (Math.random()-0.5)*0.3;
            cluster.add(t);
        }
        cluster.position.set(x, h, z);
        g.add(cluster);
    }

    scene.add(g);
    window._scatterGroup = g;
}

function createWorld(cfg) {
    cfg = cfg || diffCfg();
    MAP_SIZE = cfg.mapSize;
    disposeWorldMeshes();
    rollTerrainParams(cfg.ruggedness);
    if(scene.fog) scene.fog.density = 1.44 / MAP_SIZE;

    let geo = new PlaneGeometryMod(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI/2);
    geo = geo.toNonIndexed();

    const pos = geo.attributes.position.array;
    const colors = new Float32Array(pos.length);
    heightData = new Float32Array((SEGMENTS+1)*(SEGMENTS+1));

    const calcH = calcTerrainH;

    for(let iz=0; iz<=SEGMENTS; iz++) {
        for(let ix=0; ix<=SEGMENTS; ix++) {
            const x = (ix / SEGMENTS - 0.5) * MAP_SIZE;
            const z = (iz / SEGMENTS - 0.5) * MAP_SIZE;
            heightData[iz * (SEGMENTS+1) + ix] = calcH(x, z);
        }
    }

    const cWetSand = new THREE.Color(0x5a4a32);
    const cSand    = new THREE.Color(0x8a7448);
    const cGrass   = new THREE.Color(0x1d4022);
    const cGrass2  = new THREE.Color(0x2e5526);   // sonnigere Grasflecken
    const cDry     = new THREE.Color(0x4f5a2a);   // trockene Steppe
    const cRock    = new THREE.Color(0x474f4a);
    const cRock2   = new THREE.Color(0x32383a);
    const cSnow    = new THREE.Color(0xcfdde4);

    for(let i=0; i<pos.length; i+=3) {
        const x = pos[i], z = pos[i+2];
        const h = calcH(x, z);
        pos[i+1] = h;

        // Hangneigung per Differenzenquotient → Felsen an Steilhängen
        const e = 2.0;
        const sx = (calcH(x+e, z) - calcH(x-e, z)) / (2*e);
        const sz = (calcH(x, z+e) - calcH(x, z-e)) / (2*e);
        const slope = Math.sqrt(sx*sx + sz*sz);

        // Großflächige Gras-Variation (Flecken aus Sinus-Rauschen)
        const patch = Math.sin(x*0.021 + z*0.017) + Math.sin(x*0.008 - z*0.011) * 0.7;

        let col = cGrass.clone();
        if(patch > 0.4)       col.lerp(cGrass2, Math.min(1, (patch-0.4)*1.2));
        else if(patch < -0.8) col.lerp(cDry,    Math.min(1, (-patch-0.8)*1.4));

        if(h < 1.2)       col.copy(cWetSand);
        else if(h < 4)    col.lerp(cSand, Math.max(0, 1 - ((h-1.2)/2.8)));
        else if(h > 20 && h < 28) col.lerp(cRock, (h-20)/8);
        else if(h >= 28)  col.copy(cSnow);

        // Steile Flächen werden felsig — unabhängig von der Höhe
        if(slope > 0.5 && h < 28) col.lerp(slope > 0.85 ? cRock2 : cRock, Math.min(1, (slope-0.5)*1.6));

        // Hangschattierung: Süd-/Westhänge dunkler, plus feines Rauschen
        const slopeShade = 1.0 - Math.max(0, Math.min(0.22, (sx + sz) * 0.12));
        const shade = slopeShade * (1.0 - Math.random() * 0.1);
        colors[i] = col.r * shade; colors[i+1] = col.g * shade; colors[i+2] = col.b * shade;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.02 });
    terrain = new THREE.Mesh(geo, mat); terrain.receiveShadow = true; scene.add(terrain);

    // ── Verbessertes Wasser ──
    const waterGeo = new THREE.PlaneGeometry(MAP_SIZE*1.6, MAP_SIZE*1.6, 96, 96);
    waterGeo.rotateX(-Math.PI/2);

    uniformsWater = {
        time:      { value: 0 },
        deepColor: { value: new THREE.Color(0x001225) },
        shallowColor: { value: new THREE.Color(0x0a3060) },
        foamColor: { value: new THREE.Color(0x88bbdd) },
    };

    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x0a2848,
        metalness: 0.08,
        roughness: 0.04,
        transparent: true,
        opacity: 0.88,
    });

    waterMat.onBeforeCompile = (shader) => {
        shader.uniforms.time       = uniformsWater.time;
        shader.uniforms.deepColor  = uniformsWater.deepColor;
        shader.uniforms.shallowColor = uniformsWater.shallowColor;
        shader.uniforms.foamColor  = uniformsWater.foamColor;

        shader.vertexShader = `
uniform float time;
varying float vWaveHeight;
varying vec2  vUv2;
` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
            vUv2 = vec2(position.x, position.z);
            // Large ocean swell
            float swell = sin(position.x * 0.018 + time * 0.55) * 3.2
                        + cos(position.z * 0.022 + time * 0.42) * 2.8;
            // Mid-frequency chop
            float chop  = sin(position.x * 0.055 + position.z * 0.04 + time * 1.1) * 1.1
                        + cos(position.x * 0.04  - position.z * 0.06 + time * 0.9) * 0.9;
            // High-freq ripple
            float ripple= sin(position.x * 0.14 + position.z * 0.11 + time * 2.2) * 0.35;
            float wave  = swell + chop + ripple;
            transformed.y += wave;
            vWaveHeight = wave;`
        );

        shader.fragmentShader = `
uniform vec3  deepColor;
uniform vec3  shallowColor;
uniform vec3  foamColor;
varying float vWaveHeight;
varying vec2  vUv2;
` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <color_fragment>`,
            `#include <color_fragment>
            // Depth gradient: peaks = lighter
            float t = clamp((vWaveHeight + 4.0) / 9.0, 0.0, 1.0);
            diffuseColor.rgb = mix(deepColor, shallowColor, t * 0.6);
            // Foam on crests
            float foam = smoothstep(2.8, 5.5, vWaveHeight);
            diffuseColor.rgb = mix(diffuseColor.rgb, foamColor, foam * 0.55);
            // Fresnel-ish: add specular tint at high angles (approx via vUv distance)
            float distCenter = length(vUv2) / 800.0;
            diffuseColor.rgb = mix(diffuseColor.rgb, shallowColor * 1.3, clamp(distCenter * 0.4, 0.0, 0.3));`
        );
    };

    water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -3.5;
    water.receiveShadow = false;
    scene.add(water);

    // Küstenschaum: flache helle Scheibe direkt über Wasser
    const foamGeo = new THREE.PlaneGeometry(MAP_SIZE*0.98, MAP_SIZE*0.98, 1, 1);
    foamGeo.rotateX(-Math.PI/2);
    const foamMat = new THREE.MeshBasicMaterial({
        color: 0x5588aa, transparent: true, opacity: 0.18,
        depthWrite: false, blending: THREE.AdditiveBlending
    });
    const foamRing = new THREE.Mesh(foamGeo, foamMat);
    foamRing.position.y = -1.2;
    scene.add(foamRing);
    window._foamRing = foamRing;

    spawnScatter();
    spawnClouds();
}

function spawnClouds() {
    cloudsGroup = new THREE.Group();

    // 5 Wolkentypen mit unterschiedlichen Eigenschaften
    const cloudTypes = [
        { blobs:[6,14],  size:[18,45], spread:60,  hMin:70,  hMax:120, sy:[0.45,0.75], op:[0.6,0.8],  col:0x8a9db8, count:22 }, // Cumulus
        { blobs:[3,6],   size:[30,70], spread:100, hMin:50,  hMax:80,  sy:[0.22,0.38], op:[0.3,0.55], col:0x7a8fa5, count:12 }, // Stratus
        { blobs:[2,4],   size:[12,22], spread:80,  hMin:160, hMax:220, sy:[0.18,0.28], op:[0.15,0.30],col:0xaabbd0, count:10 }, // Cirrus
        { blobs:[10,20], size:[25,55], spread:50,  hMin:55,  hMax:95,  sy:[0.6,0.95],  op:[0.7,0.92], col:0x4a5e78, count:8  }, // Gewitterwolke
        { blobs:[2,5],   size:[10,20], spread:25,  hMin:85,  hMax:140, sy:[0.5,0.8],   op:[0.4,0.65], col:0x99aabb, count:18 }, // Kleine Wolken
    ];

    cloudTypes.forEach(ct => {
        for(let i=0; i<ct.count; i++) {
            const cg = new THREE.Group();

            const groupRot = Math.random() * Math.PI * 2;
            const groupScaleX = 0.7 + Math.random() * 1.6;
            const groupScaleZ = 0.5 + Math.random() * 1.2;

            const blobCount = ct.blobs[0] + Math.floor(Math.random()*(ct.blobs[1]-ct.blobs[0]));
            const op = ct.op[0] + Math.random()*(ct.op[1]-ct.op[0]);
            const cloudMat = new THREE.MeshStandardMaterial({
                color: ct.col,
                flatShading: true, roughness: 1,
                transparent: true, opacity: op
            });

            for(let j=0; j<blobCount; j++) {
                const size = ct.size[0] + Math.random()*(ct.size[1]-ct.size[0]);
                const geoType = Math.random();
                let pGeo;
                if(geoType < 0.5)      pGeo = new THREE.DodecahedronGeometry(size, 0);
                else if(geoType < 0.8) pGeo = new THREE.IcosahedronGeometry(size, 0);
                else                   pGeo = new THREE.OctahedronGeometry(size, 0);

                const pos2 = pGeo.attributes.position;
                const flatY = -size * (0.1 + Math.random()*0.3);
                for(let k=0; k<pos2.count; k++) {
                    if(pos2.getY(k) < flatY) pos2.setY(k, flatY);
                }
                pGeo.computeVertexNormals();

                const p = new THREE.Mesh(pGeo, cloudMat);

                const t3 = j / Math.max(blobCount-1, 1);
                const mainOffset = (t3 - 0.5) * ct.spread * groupScaleX;
                const crossOffset = (Math.random()-0.5) * ct.spread * 0.4 * groupScaleZ;
                const heightOff = (Math.random()-0.5) * size * 0.5;
                p.position.set(mainOffset, heightOff, crossOffset);

                const sy = ct.sy[0] + Math.random()*(ct.sy[1]-ct.sy[0]);
                const sx = 0.8 + Math.random()*0.7;
                const sz = 0.8 + Math.random()*0.7;
                p.scale.set(sx, sy, sz);

                p.rotation.y = Math.random() * Math.PI * 2;
                p.rotation.z = (Math.random()-0.5) * 0.4;

                p.castShadow = true;
                cg.add(p);
            }

            const height = ct.hMin + Math.random()*(ct.hMax-ct.hMin);
            cg.position.set(
                (Math.random()-0.5) * MAP_SIZE * 1.1,
                height,
                (Math.random()-0.5) * MAP_SIZE * 1.1
            );
            cg.rotation.y = groupRot;
            cg.rotation.z = (Math.random()-0.5) * 0.12;
            cg.scale.set(groupScaleX, 1, groupScaleZ);

            cg.userData.speed = 1.5 + Math.random() * 3.5;
            cg.userData.drift = (Math.random()-0.5) * 0.4;

            cloudsGroup.add(cg);
        }
    });

    scene.add(cloudsGroup);
}

function spawnTrees(count) {
    count = count || diffCfg().treeCount;
    const trunkGeo = new THREE.CylinderGeometry(1.5, 2, 10, 5); trunkGeo.translate(0, 5, 0);
    const leavesGeo1 = new THREE.ConeGeometry(9, 20, 5); leavesGeo1.translate(0, 15, 0);
    const leavesGeo2 = new THREE.ConeGeometry(7, 18, 5); leavesGeo2.translate(0, 25, 0);
    const leavesGeo3 = new THREE.ConeGeometry(5, 15, 5); leavesGeo3.translate(0, 35, 0);
    const canopyGeo1 = new THREE.IcosahedronGeometry(8, 0);  canopyGeo1.translate(0, 16, 0);
    const canopyGeo2 = new THREE.IcosahedronGeometry(6, 0);  canopyGeo2.translate(2.5, 22, 1);
    const canopyGeo3 = new THREE.IcosahedronGeometry(5, 0);  canopyGeo3.translate(-2.5, 21, -1.5);
    const tallTrunkGeo = new THREE.CylinderGeometry(0.9, 1.5, 16, 5); tallTrunkGeo.translate(0, 8, 0);
    const branchGeo = new THREE.CylinderGeometry(0.25, 0.5, 7, 4);

    const trunkMat = new THREE.MeshStandardMaterial({color: 0x1a0e06, flatShading: true, roughness: 1});
    const deadMat  = new THREE.MeshStandardMaterial({color: 0x2e2620, flatShading: true, roughness: 1});
    // Drei Laub-Paletten — alle werden vom LightingDirector mitgetönt
    const leafMats = [
        new THREE.MeshStandardMaterial({ color: 0x0d2210, emissive: 0x001a05, emissiveIntensity: 0.4, flatShading: true, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: 0x15301a, emissive: 0x001a05, emissiveIntensity: 0.4, flatShading: true, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: 0x2a3d12, emissive: 0x0a1a02, emissiveIntensity: 0.4, flatShading: true, roughness: 0.8 }),
    ];
    window._treeLeavesMat = leafMats[0];
    window._treeLeafMats = leafMats;

    // Zufallspositionen verwerfen oft (Wasser/Gipfel) — daher Versuche statt fixe Schleife
    let placedTrees = 0, treeTries = 0;
    while(placedTrees < count && treeTries < count * 12) {
        treeTries++;
        const x = (Math.random()-0.5) * MAP_SIZE * 0.7;
        const z = (Math.random()-0.5) * MAP_SIZE * 0.7;
        const h = getH(x,z);
        if(h > 3 && h < 25) {
            placedTrees++;
            const treeGroup = new THREE.Group();
            const leaves = [];
            const roll = Math.random();
            const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)];

            if(roll < 0.55) {
                // Kiefer (3 Kegel-Etagen)
                const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.castShadow = true; treeGroup.add(trunk);
                [leavesGeo1, leavesGeo2, leavesGeo3].forEach(geo => {
                    const l = new THREE.Mesh(geo, leafMat); l.castShadow = true;
                    treeGroup.add(l); leaves.push(l);
                });
            } else if(roll < 0.85) {
                // Laubbaum (runde Kronen-Blobs)
                const trunk = new THREE.Mesh(tallTrunkGeo, trunkMat); trunk.castShadow = true; treeGroup.add(trunk);
                [canopyGeo1, canopyGeo2, canopyGeo3].forEach(geo => {
                    const l = new THREE.Mesh(geo, leafMat); l.castShadow = true;
                    treeGroup.add(l); leaves.push(l);
                });
            } else {
                // Toter Baum (kahle Äste)
                const trunk = new THREE.Mesh(tallTrunkGeo, deadMat); trunk.castShadow = true; treeGroup.add(trunk);
                for(let b = 0; b < 3; b++) {
                    const br = new THREE.Mesh(branchGeo, deadMat);
                    br.position.set(0, 8 + b * 3, 0);
                    br.rotation.z = 0.7 + Math.random() * 0.6;
                    br.rotation.y = b * 2.1 + Math.random();
                    br.castShadow = true;
                    treeGroup.add(br);
                }
            }

            const s = 0.75 + Math.random() * 0.55;
            treeGroup.scale.setScalar(s);
            treeGroup.position.set(x, h, z);
            treeGroup.rotation.y = Math.random() * Math.PI;

            scene.add(treeGroup);
            trees.push({ mesh: treeGroup, hp: 100, alive: true, leaves });
        }
    }
}

function spawnBunkers(count) {
    count = count || diffCfg().bunkerCount;
    const bMat = new THREE.MeshStandardMaterial({color: 0x2e2e2e, roughness: 0.9, metalness: 0.2, flatShading: true});
    const darkMat = new THREE.MeshStandardMaterial({color: 0x040404, roughness: 1.0, flatShading: true});
    const slitGlowMat = new THREE.MeshStandardMaterial({
        color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 1.5,
        roughness: 0, metalness: 0.8
    });
    window._bunkerSlitMat = slitGlowMat;

    const baseGeo = new THREE.CylinderGeometry(18, 22, 15, 6); baseGeo.translate(0, 7.5, 0);
    const roofGeo = new THREE.CylinderGeometry(20, 20, 3, 6); roofGeo.translate(0, 16.5, 0);
    const slitGeo = new THREE.BoxGeometry(16, 2.5, 10); slitGeo.translate(0, 10, 14);

    const bBase = new THREE.Mesh(baseGeo, bMat); bBase.castShadow = true; bBase.receiveShadow = true;
    const bRoof = new THREE.Mesh(roofGeo, bMat); bRoof.castShadow = true; bRoof.receiveShadow = true;
    const bSlit = new THREE.Mesh(slitGeo, slitGlowMat || darkMat);

    let placedBunkers = 0, bunkerTries = 0;
    while(placedBunkers < count && bunkerTries < count * 40) {
        bunkerTries++;
        const x = (Math.random()-0.5) * MAP_SIZE * 0.6;
        const z = (Math.random()-0.5) * MAP_SIZE * 0.6;
        const h = getH(x,z);
        if(h > 3 && h < 26) {
            placedBunkers++;
            const b = new THREE.Group();
            b.add(bBase.clone()); b.add(bRoof.clone()); b.add(bSlit.clone());
            b.position.set(x, h - 3, z);
            b.rotation.y = Math.random() * Math.PI;
            scene.add(b);
            bunkers.push({ mesh: b, hp: 400, alive: true });
        }
    }
}

function getH(x, z) {
    const gx = (x / MAP_SIZE + 0.5) * SEGMENTS; const gz = (z / MAP_SIZE + 0.5) * SEGMENTS;
    const ix = Math.floor(gx); const iz = Math.floor(gz);
    if (ix < 0 || ix >= SEGMENTS || iz < 0 || iz >= SEGMENTS) return -3;
    const fx = gx - ix; const fz = gz - iz;
    const h00 = heightData[iz * (SEGMENTS + 1) + ix] || -10; 
    const h10 = heightData[iz * (SEGMENTS + 1) + Math.min(ix + 1, SEGMENTS)] || -10;
    const h01 = heightData[Math.min(iz + 1, SEGMENTS) * (SEGMENTS + 1) + ix] || -10; 
    const h11 = heightData[Math.min(iz + 1, SEGMENTS) * (SEGMENTS + 1) + Math.min(ix + 1, SEGMENTS)] || -10;
    const h0 = h00 * (1 - fx) + h10 * fx; const h1 = h01 * (1 - fx) + h11 * fx;
    return Math.max(h0 * (1 - fz) + h1 * fz, -3);
}

function getNormal(x, z) {
    const eps = 0.5;
    const hL = getH(x - eps, z); const hR = getH(x + eps, z);
    const hD = getH(x, z - eps); const hU = getH(x, z + eps);
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
}

function spawnControlPoints() {
    cpMeshes.forEach(m => scene.remove(m));
    cpMeshes = [];
    controlPoints = [];

    // Prozedurale Verteilung: ein CP im Zentrum, die übrigen auf einem Ring
    // mit zufälligem Startwinkel. Punkte im Wasser werden an Land geschoben.
    const num = diffCfg().numControlPoints;
    const positions = [new THREE.Vector3(0, 0, 0)];
    const ringR = MAP_SIZE * 0.21;
    const a0 = Math.random() * Math.PI * 2;
    for(let i = 1; i < num; i++) {
        const ang = a0 + (i - 1) * (Math.PI * 2 / (num - 1));
        positions.push(new THREE.Vector3(Math.cos(ang) * ringR, 0, Math.sin(ang) * ringR));
    }
    positions.forEach(p => {
        if(getH(p.x, p.z) > 2) return;
        for(let r = 30; r <= 300; r += 30) {
            let found = false;
            for(let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                const nx = p.x + Math.cos(a) * r, nz = p.z + Math.sin(a) * r;
                if(getH(nx, nz) > 3) { p.x = nx; p.z = nz; found = true; break; }
            }
            if(found) break;
        }
    });

    positions.forEach((p, i) => {
        p.y = getH(p.x, p.z) + 1;
        const geo = new THREE.CylinderGeometry(CP_CAPTURE_RADIUS * 0.18, CP_CAPTURE_RADIUS * 0.2, 3, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.8, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(p);
        scene.add(mesh);

        const ringGeo = new THREE.RingGeometry(CP_CAPTURE_RADIUS - 4, CP_CAPTURE_RADIUS, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x445566, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(p);
        ring.position.y = p.y + 2;
        ring.renderOrder = 5;
        scene.add(ring);

        const poleGeo = new THREE.CylinderGeometry(0.8, 0.8, 25, 5);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.copy(p);
        pole.position.y = p.y + 14;
        scene.add(pole);

        // Vertikale Lichtsäule (weithin sichtbar, Farbe = Besitzstatus)
        const beamGeo = new THREE.CylinderGeometry(3, 5, 90, 8, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x445566, transparent: true, opacity: 0.1,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.copy(p); beam.position.y = p.y + 45;
        beam.userData.baseOpacity = 0.08;
        beam.renderOrder = 4;
        scene.add(beam);

        // Wehende Flagge am Mast
        const flagGeo = new THREE.PlaneGeometry(9, 5, 1, 1);
        flagGeo.translate(4.5, 0, 0);
        const flagMat = new THREE.MeshStandardMaterial({
            color: 0x445566, emissive: 0x222a33, emissiveIntensity: 0.5,
            side: THREE.DoubleSide, flatShading: true
        });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.copy(p); flag.position.y = p.y + 23;
        scene.add(flag);

        cpMeshes.push(mesh, ring, pole, beam, flag);
        controlPoints.push({
            pos: p.clone(), holder: -1, ring, pole, platform: mesh, beam, flag, index: i,
            captureProgress: 0,   // 0..3: Runden ununterbrochener Präsenz
            capturingTeam: -1,    // Wer gerade einnimmt
            prevHolder: -1,       // Für Rückeroberungs-Bonus
            bonusNextRound: -1    // Team das nächste Runde +1 Bonus bekommt
        });
    });
}

function updateControlPoints() {
    const CAPTURE_ROUNDS = 3;
    let p1Holds = 0, p2Holds = 0;
    const statusEl = document.getElementById('cp-status');
    statusEl.innerHTML = '';
    const names = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO'];

    controlPoints.forEach((cp, i) => {
        const isShielded = (team, tank) =>
            shields.some(s => s.team === team && tank.mesh.position.distanceTo(s.pos) <= s.currentRadius);

        const p1Active = teams[0].some(t =>
            t.alive && t.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS && !isShielded(0, t));
        const p2Active = teams[1].some(t =>
            t.alive && t.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS && !isShielded(1, t));

        const contested = p1Active && p2Active;

        if (contested) {
            cp.capturingTeam = -2;
        } else if (p1Active) {
            if (cp.capturingTeam !== 0) { cp.capturingTeam = 0; cp.captureProgress = 0; }
            cp.captureProgress++;
            if (cp.captureProgress >= CAPTURE_ROUNDS) {
                const wasEnemy = cp.holder === 1;
                if(cp.holder !== 0) { Audio.play('cpCapture'); fxCPCapture(cp.pos, 0x00e5ff); TacFeed.cp(0, 'CP'); }
                cp.holder = 0; cp.captureProgress = CAPTURE_ROUNDS;
                if (wasEnemy) cp.bonusNextRound = 0;
            }
        } else if (p2Active) {
            if (cp.capturingTeam !== 1) { cp.capturingTeam = 1; cp.captureProgress = 0; }
            cp.captureProgress++;
            if (cp.captureProgress >= CAPTURE_ROUNDS) {
                const wasEnemy = cp.holder === 0;
                if(cp.holder !== 1) { Audio.play('cpCapture'); fxCPCapture(cp.pos, 0xff2d55); TacFeed.cp(1, 'CP'); }
                cp.holder = 1; cp.captureProgress = CAPTURE_ROUNDS;
                if (wasEnemy) cp.bonusNextRound = 1;
            }
        } else {
            cp.captureProgress = Math.max(0, cp.captureProgress - 1);
            if (cp.captureProgress === 0) cp.capturingTeam = -1;
        }

        if (cp.holder === 0 && cp.captureProgress >= CAPTURE_ROUNDS) p1Holds++;
        else if (cp.holder === 1 && cp.captureProgress >= CAPTURE_ROUNDS) p2Holds++;

        if (cp.bonusNextRound === 0) { p1Holds++; cp.bonusNextRound = -1; }
        else if (cp.bonusNextRound === 1) { p2Holds++; cp.bonusNextRound = -1; }

        const progress = cp.captureProgress / CAPTURE_ROUNDS;
        const ringCol = contested ? 0xf0b429
            : cp.holder === 0 && progress >= 1 ? 0x00e5ff
            : cp.holder === 1 && progress >= 1 ? 0xff2d55
            : cp.capturingTeam === 0 ? 0x006688
            : cp.capturingTeam === 1 ? 0x881122
            : 0x334455;
        cp.ring.material.color.setHex(ringCol);
        cp.ring.material.opacity = progress >= 1 ? 0.7 : 0.35 + progress * 0.35;

        // Lichtsäule + Flagge folgen dem Besitzstatus
        if (cp.beam) {
            cp.beam.material.color.setHex(ringCol);
            cp.beam.userData.baseOpacity =
                (cp.holder >= 0 && progress >= 1) ? 0.22 :
                cp.capturingTeam >= 0 ? 0.14 : 0.06;
        }
        if (cp.flag) {
            cp.flag.material.color.setHex(ringCol);
            cp.flag.material.emissive.setHex(ringCol);
        }

        const platCol = cp.holder === 0 ? 0x003344 : cp.holder === 1 ? 0x440011 : 0x223344;
        cp.platform.material.color.setHex(platCol);

        if (!cp._progressBars) {
            cp._progressBars = [];
            for (let b = 0; b < CAPTURE_ROUNDS; b++) {
                const bg = new THREE.BoxGeometry(4, 7, 4);
                const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
                const bx = new THREE.Mesh(bg, bm);
                bx.position.set(8, -5 + b * 9, 0);
                cp.pole.add(bx);
                cp._progressBars.push(bx);
            }
        }
        const barCol = cp.capturingTeam === 0 ? 0x00e5ff : cp.capturingTeam === 1 ? 0xff2d55 : 0x445566;
        cp._progressBars.forEach((bar, b) => {
            bar.material.color.setHex(barCol);
            bar.material.opacity = b < cp.captureProgress ? 0.85 : 0.12;
        });

        const div = document.createElement('div');
        div.className = 'cp-marker-ui';
        let label = names[i];
        if (contested) {
            div.classList.add('contested'); label += ' [UMKÄMPFT]';
        } else if (cp.holder === 0 && cp.captureProgress >= CAPTURE_ROUNDS) {
            div.classList.add('p1-held'); label += ' [BLAU]';
        } else if (cp.holder === 1 && cp.captureProgress >= CAPTURE_ROUNDS) {
            div.classList.add('p2-held'); label += ' [ROT]';
        } else if (cp.capturingTeam === 0) {
            div.classList.add('p1-held'); label += ' [BLAU ' + cp.captureProgress + '/3]';
        } else if (cp.capturingTeam === 1) {
            div.classList.add('p2-held'); label += ' [ROT ' + cp.captureProgress + '/3]';
        } else {
            label += ' [NEUTRAL]';
        }
        div.textContent = label;
        statusEl.appendChild(div);
    });

    window._cpWinThreshold = diffCfg().cpWinPoints;

    cpScores[0] += p1Holds;
    cpScores[1] += p2Holds;
    gameStats[0].cpTurns += p1Holds;
    gameStats[1].cpTurns += p2Holds;

    document.getElementById('cp-p1-pts').textContent = cpScores[0];
    document.getElementById('cp-p2-pts').textContent = cpScores[1];
}

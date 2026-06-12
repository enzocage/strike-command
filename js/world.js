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

function calcTerrainH(x, z) {
    const tp = terrainParams;
    const maxRadius = MAP_SIZE * 0.45;
    const distFromCenter = Math.sqrt(x*x + z*z);
    let mask = 1 - Math.pow(distFromCenter / maxRadius, 4);
    mask = Math.max(0, Math.min(1, mask));
    const amp = 0.55 + 0.45 * tp.r;
    let h = Math.sin(x*tp.f1 + tp.p1) * 15 * amp
          + Math.cos(z*tp.f2 + tp.p2) * 15 * amp
          + Math.sin(x*tp.f3 + z*tp.f4 + tp.p3) * 8 * amp;
    if(tp.ridge > 0) {
        const rv = 1 - Math.abs(Math.sin(x*tp.f5 + z*tp.f6 + tp.p4));
        h += rv * rv * 18 * tp.ridge;
    }
    h += 20;
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

    const cSand = new THREE.Color(0x7a6642);
    const cGrass = new THREE.Color(0x1a3a1f);
    const cRock = new THREE.Color(0x3d4540);
    const cSnow = new THREE.Color(0xb8ccd4);

    for(let i=0; i<pos.length; i+=3) {
        const x = pos[i], z = pos[i+2];
        const h = calcH(x, z);
        pos[i+1] = h;
        
        let col = cGrass.clone();
        if(h < 3) col.lerp(cSand, Math.max(0, 1 - (h/3)));
        else if(h > 20 && h < 28) col.lerp(cRock, (h-20)/8);
        else if(h >= 28) col = cSnow;

        const shade = 1.0 - (Math.random() * 0.15);
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

    const trunkMat = new THREE.MeshStandardMaterial({color: 0x1a0e06, flatShading: true, roughness: 1});
    const leavesMat = new THREE.MeshStandardMaterial({
        color: 0x0d2210, emissive: 0x001a05, emissiveIntensity: 0.4,
        flatShading: true, roughness: 0.8
    });
    window._treeLeavesMat = leavesMat;

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
            const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.castShadow = true;
            const l1 = new THREE.Mesh(leavesGeo1, leavesMat); l1.castShadow = true;
            const l2 = new THREE.Mesh(leavesGeo2, leavesMat); l2.castShadow = true;
            const l3 = new THREE.Mesh(leavesGeo3, leavesMat); l3.castShadow = true;
            
            treeGroup.add(trunk); treeGroup.add(l1); treeGroup.add(l2); treeGroup.add(l3);
            treeGroup.position.set(x, h, z);
            treeGroup.rotation.y = Math.random() * Math.PI;

            scene.add(treeGroup);
            trees.push({ mesh: treeGroup, hp: 100, alive: true, leaves: [l1, l2, l3] });
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

        cpMeshes.push(mesh, ring, pole);
        controlPoints.push({
            pos: p.clone(), holder: -1, ring, pole, platform: mesh, index: i,
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

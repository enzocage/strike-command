function createTank(pIdx, id) {
    const mainColor = pIdx === 0 ? 0x00e5ff : 0xff2d55;
    const group = new THREE.Group(); const parts = {};
    const mat = new THREE.MeshStandardMaterial({
        color: mainColor, emissive: mainColor, emissiveIntensity: 0.15,
        metalness: 0.7, roughness: 0.4, flatShading: true
    });
    mat.userData.baseColor = mainColor;
    mat.userData.isTankMat = true;
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8, metalness: 0.4, flatShading: true });
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x505050, metalness: 0.9, roughness: 0.3, flatShading: true });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x6a7075, metalness: 0.95, roughness: 0.22, flatShading: true });
    const glowMat = new THREE.MeshStandardMaterial({
        color: mainColor, emissive: mainColor, emissiveIntensity: 1.6,
        metalness: 0.2, roughness: 0.4
    });
    glowMat.userData.baseColor = mainColor;
    glowMat.userData.isTankMat = true;
    glowMat.userData.emissiveBase = 1.6;

    const bodyGroup = new THREE.Group(); bodyGroup.position.y = 1.8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 9), mat); body.castShadow = true; bodyGroup.add(body);

    // Geneigte Frontpanzerung (Glacis) + Heckplatte
    const glacis = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.6, 3.2), mat);
    glacis.position.set(0, 1.15, 3.6); glacis.rotation.x = -0.42; glacis.castShadow = true; bodyGroup.add(glacis);
    const rearPlate = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.5, 2.2), mat);
    rearPlate.position.set(0, 1.1, -3.8); rearPlate.rotation.x = 0.35; rearPlate.castShadow = true; bodyGroup.add(rearPlate);

    // Leuchtende Team-Streifen entlang der Flanken
    [-3.55, 3.55].forEach(x => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 7.5), glowMat);
        strip.position.set(x, 0.4, 0); bodyGroup.add(strip);
    });

    // Auspuffrohre
    const exGeo = new THREE.CylinderGeometry(0.32, 0.38, 1.8, 6);
    [-2, 2].forEach(x => {
        const ex = new THREE.Mesh(exGeo, darkMat);
        ex.rotation.x = 0.5; ex.position.set(x, 1.5, -4.4); ex.castShadow = true; bodyGroup.add(ex);
    });

    // Werkzeugkiste + Tankfässer auf dem Heck
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.4), darkMat);
    toolbox.position.set(-1.8, 1.4, -2.8); toolbox.castShadow = true; bodyGroup.add(toolbox);
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 8), detailMat);
    barrel1.rotation.z = Math.PI/2; barrel1.position.set(1.6, 1.45, -3.0); barrel1.castShadow = true; bodyGroup.add(barrel1);

    group.add(bodyGroup); parts.body = bodyGroup;

    parts.tracks = [];
    [-3.5, 3.5].forEach(x => {
        const tGroup = new THREE.Group(); tGroup.position.set(x, 1.25, 0);
        const track = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 10), darkMat); track.castShadow = true; tGroup.add(track);
        // Seitenschürze über der Kette
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 9.6), mat);
        skirt.position.set(x > 0 ? 0.95 : -0.95, 0.9, 0); skirt.castShadow = true; tGroup.add(skirt);
        for(let wz = -3.5; wz <= 3.5; wz += 2.3) {
            // Laufrolle: Felge + Gummi-Lauffläche + Nabe
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.9, 10), steelMat);
            rim.rotation.z = Math.PI/2; rim.position.set(0, -0.2, wz); rim.castShadow = true; tGroup.add(rim);
            const tread = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 1.2, 10), darkMat);
            tread.rotation.z = Math.PI/2; tread.position.set(0, -0.2, wz); tGroup.add(tread);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.05, 6), detailMat);
            hub.rotation.z = Math.PI/2; hub.position.set(0, -0.2, wz); tGroup.add(hub);
        }
        group.add(tGroup); parts.tracks.push(tGroup);
    });

    const turretGroup = new THREE.Group(); turretGroup.position.y = 3.5;
    // Turmdrehkranz
    const tRing = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 12), steelMat);
    tRing.position.y = -0.9; tRing.castShadow = true; turretGroup.add(tRing);
    const head = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.8, 5.5), mat); head.castShadow = true; turretGroup.add(head);
    // Geneigte Turmfront
    const tFront = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.6, 1.8), mat);
    tFront.position.set(0, 0.85, 2.4); tFront.rotation.x = -0.5; tFront.castShadow = true; turretGroup.add(tFront);
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 8), darkMat); hatch.position.set(0, 1.0, -1); turretGroup.add(hatch);
    // Kommandanten-Optik (leuchtet in Teamfarbe)
    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), glowMat);
    optic.position.set(1.4, 1.05, 0.8); turretGroup.add(optic);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 4.5), detailMat); antenna.position.set(-1.5, 2.2, -1.5); turretGroup.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), glowMat);
    antennaTip.position.set(-1.5, 4.45, -1.5); turretGroup.add(antennaTip);
    // Nebelwerfer-Batterien an den Turmseiten
    [-1, 1].forEach(s => {
        for(let k = 0; k < 3; k++) {
            const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 6), detailMat);
            sl.position.set(s * 2.4, 0.3, 1.2 - k * 0.7);
            sl.rotation.x = -0.7; sl.rotation.z = s * 0.45;
            turretGroup.add(sl);
        }
    });

    const barrelJoint = new THREE.Group(); barrelJoint.position.z = 2.5;
    // Verschlussblock
    const breech = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 1.6), darkMat);
    breech.position.z = -0.3; breech.castShadow = true; barrelJoint.add(breech);
    // Hauptrohr
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 7.2, 10), steelMat);
    barrel.rotation.x = Math.PI/2; barrel.position.z = 3.9; barrel.castShadow = true; barrelJoint.add(barrel);
    // Thermoschutzhülse
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 1.6, 10), darkMat);
    sleeve.rotation.x = Math.PI/2; sleeve.position.z = 2.4; barrelJoint.add(sleeve);
    // Mündungsbremse (Spitze bei z≈9, passend zum Abschusspunkt)
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 1.5, 10), darkMat);
    muzzle.rotation.x = Math.PI/2; muzzle.position.z = 8.2; muzzle.castShadow = true; barrelJoint.add(muzzle);
    turretGroup.add(barrelJoint); group.add(turretGroup); parts.turret = turretGroup;

    let placed = false; let x, z, y; let attempts = 0;
    
    while(!placed && attempts < 2000) {
        // Spawn-Zonen skalieren mit der Kartengröße (Spieler West, KI Ost)
        x = pIdx === 0 ? -MAP_SIZE * 0.39 + Math.random() * MAP_SIZE * 0.17
                       :  MAP_SIZE * 0.22 + Math.random() * MAP_SIZE * 0.17;
        z = (id - 4.5) * (MAP_SIZE / 15) + Math.random() * MAP_SIZE * 0.045;
        y = getH(x,z);
        
        if(y > 4) {
            let overlap = false;
            const testPos = new THREE.Vector3(x, y, z);
            
            const dirs = [[1,0], [-1,0], [0,1], [0,-1], [0.7,0.7], [-0.7,0.7], [0.7,-0.7], [-0.7,-0.7]];
            for(let d of dirs) {
                if (getH(x + d[0]*30, z + d[1]*30) < 2) overlap = true;
            }

            for(let tree of trees) { if(tree.alive && tree.mesh.position.distanceTo(testPos) < 35) overlap = true; }
            for(let bunker of bunkers) { if(bunker.alive && bunker.mesh.position.distanceTo(testPos) < 50) overlap = true; }
            
            if (teams[pIdx]) {
                for (let existingTank of teams[pIdx]) {
                    if (existingTank && existingTank.mesh && existingTank.mesh.position.distanceTo(testPos) < 35) {
                        overlap = true;
                    }
                }
            }

            if(!overlap) placed = true;
        }
        attempts++;
    }
    if (!placed) { y = Math.max(4, getH(x, z)); }
    
    group.position.set(x, y, z); scene.add(group);
    const hpEl = document.createElement('div'); hpEl.className = 'hp-container'; hpEl.innerHTML = '<div class="hp-fill"></div>'; document.getElementById('fx-layer').appendChild(hpEl);

    const maxHP = (pIdx === 1 && isSinglePlayer) ? diffCfg().aiHP : 100;
    const tObj = {
        mesh: group, parts: parts, turret: turretGroup, barrelJoint: barrelJoint,
        hp: maxHP, maxHP, alive: true, hpEl, team: pIdx,
        revealedUntil: 0,
        heading: Math.random() * Math.PI * 2,
        settings: { rot: 0, ang: 45, pow: 60 }, speed: 0, turnSpeed: 0
    };
    alignTankToTerrain(tObj, true); return tObj;
}

function alignTankToTerrain(t, instant = false) {
    const normal = getNormal(t.mesh.position.x, t.mesh.position.z);
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.heading);
    forward.sub(normal.clone().multiplyScalar(forward.dot(normal))).normalize();
    const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
    forward.crossVectors(right, normal).normalize();
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, forward));
    const targetY = getH(t.mesh.position.x, t.mesh.position.z);
    
    if (instant) { t.mesh.quaternion.copy(targetQuat); t.mesh.position.y = targetY; } 
    else { t.mesh.quaternion.slerp(targetQuat, 0.25); t.mesh.position.y += (targetY - t.mesh.position.y) * 0.4; }
}

function shatterTank(t) {
    if(t.team === 0) {
        const idx = teams[0].indexOf(t);
        if(idx >= 0) delete playerRoles[idx];
        setTimeout(() => { if(teams && teams[0] && teams[0].length > 0) updateRoleIcons(); }, 200);
    }
    t.alive = false; t.hpEl.style.display = 'none'; scene.remove(t.mesh); 
    const explodePart = (meshPart, upVelocity) => {
        const wPos = new THREE.Vector3(); meshPart.getWorldPosition(wPos);
        const wQuat = new THREE.Quaternion(); meshPart.getWorldQuaternion(wQuat);
        scene.add(meshPart); meshPart.position.copy(wPos); meshPart.quaternion.copy(wQuat);
        meshPart.traverse(c => { if(c.isMesh) c.material = new THREE.MeshStandardMaterial({color: 0x050505, roughness: 1.0, flatShading: true}); });
        physicalDebris.push({ mesh: meshPart, vel: new THREE.Vector3((Math.random()-0.5)*25, upVelocity + Math.random()*30, (Math.random()-0.5)*25), rot: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(5) });
    };
    explodePart(t.parts.turret, 60); explodePart(t.parts.body, 30); t.parts.tracks.forEach(tr => explodePart(tr, 20));
}

function shatterProp(prop, isBunker) {
    prop.alive = false; scene.remove(prop.mesh);
    const pCount = isBunker ? 40 : 20; 
    const geo = isBunker ? new THREE.BoxGeometry(4, 4, 4) : new THREE.BoxGeometry(2, 4, 2);
    const mat = new THREE.MeshStandardMaterial({ color: isBunker ? 0x333333 : 0x1c100a, flatShading: true });
    for(let i=0; i<pCount; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(prop.mesh.position).add(new THREE.Vector3(0, 5+Math.random()*10, 0));
        scene.add(p);
        physicalDebris.push({
            mesh: p, vel: new THREE.Vector3((Math.random()-0.5)*35, 15+Math.random()*40, (Math.random()-0.5)*35),
            rot: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(10)
        });
    }
}

function cpResupply(playerIdx) {
    const held = controlPoints.filter(cp => cp.holder === playerIdx).length;
    if(held === 0) return;

    const isHuman = (playerIdx === 0);
    const inv = ammoInventory[playerIdx];
    let msgs = [];

    if(held >= 1) {
        if((inv['frag'] || 0) < 2) {
            inv['frag'] = (inv['frag'] || 0) + 1;
            msgs.push('+1 Splitter');
        } else if((inv['ap'] || 0) < 2) {
            inv['ap'] = (inv['ap'] || 0) + 1;
            msgs.push('+1 AP-Granate');
        }
    }
    if(held >= 2) {
        if((inv['smoke'] || 0) < 3) {
            inv['smoke'] = (inv['smoke'] || 0) + 1;
            msgs.push('+1 Rauchgranate');
        }
    }
    if(held >= 3) {
        if(shieldsRemaining[playerIdx] < 3) {
            shieldsRemaining[playerIdx]++;
            updateShieldButton();
            msgs.push('+1 Schild');
        }
    }

    if(msgs.length > 0) {
        if(isHuman) Audio.play('apRefill');
        const who = isSinglePlayer ? (playerIdx === 0 ? 'Spieler' : 'KI') : (playerIdx === 0 ? 'Spieler 1' : 'Spieler 2');
        TacFeed.log(`\u2690  CP-Nachschub [${who}]: ${msgs.join(', ')}`, 'cp');
    }
}

// Nebel des Krieges — immer aus Sicht des menschlichen Spielers (Team Blau):
// KI-Panzer sind nur sichtbar, wenn ein eigener Panzer sie in Sichtweite hat
// oder sie sich kürzlich durch Mündungsfeuer verraten haben (revealedUntil).
// Die KI selbst braucht keine Mesh-Sichtbarkeit — sie rechnet mit getAIVisionRange().
function updateFogOfWar() {
    if(!isSinglePlayer || !teams[1]) return;
    if(!fogOfWarEnabled) {
        teams[1].forEach(t => { if(t.alive && t.mesh) t.mesh.visible = true; });
        return;
    }
    const now = performance.now();
    const visionRange = MAP_SIZE * diffCfg().playerVisionFrac;
    const spotters = teams[0].filter(t => t.alive);
    teams[1].forEach(t => {
        if(!t.alive || !t.mesh) return;
        const revealed = (t.revealedUntil || 0) > now;
        t.mesh.visible = revealed || spotters.some(f =>
            f.mesh.position.distanceTo(t.mesh.position) < visionRange);
    });
}

function hasLineOfSight(fromPos, toPos) {
    const dir = toPos.clone().sub(fromPos);
    const dist = dir.length();
    if(dist < 1) return true;
    const step = dir.clone().normalize();
    const steps = Math.ceil(dist / 15);

    for(let i = 1; i < steps; i++) {
        const checkPos = fromPos.clone().add(step.clone().multiplyScalar(i * 15));
        for(let b of bunkers) {
            if(!b.alive) continue;
            const bd = checkPos.distanceTo(b.mesh.position);
            if(bd < 28) return false;
        }
        for(let t of trees) {
            if(!t.alive) continue;
            const td = checkPos.distanceTo(t.mesh.position);
            if(td < 10 && Math.random() > 0.5) return false;
        }
    }
    return true;
}

function hasLineOfSightDeterministic(fromPos, toPos) {
    const dir = toPos.clone().sub(fromPos);
    const dist = dir.length();
    if(dist < 1) return true;
    const step = dir.clone().normalize();
    const steps = Math.ceil(dist / 15);
    for(let i = 1; i < steps; i++) {
        const checkPos = fromPos.clone().add(step.clone().multiplyScalar(i * 15));
        for(let b of bunkers) {
            if(!b.alive) continue;
            if(checkPos.distanceTo(b.mesh.position) < 28) return false;
        }
        let treesInLine = 0;
        for(let t of trees) {
            if(!t.alive) continue;
            if(checkPos.distanceTo(t.mesh.position) < 10) treesInLine++;
        }
        if(treesInLine >= 3) return false;
    }
    return true;
}

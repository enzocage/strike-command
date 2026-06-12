let aiRoles = {}; // KI-Tank-Index → Rolle
let playerRoles = {}; // Spieler-Tank-Index → Rolle (auto-assigned at game start)
const ROLE_ICONS = { attacker: '\u2694', holder: '\ud83d\udee1', flanker: '\u26a1', support: '\ud83c\udfaf' };
const ROLE_NAMES_DE = { attacker: 'Angreifer', holder: 'Verteidiger', flanker: 'Flanker', support: 'Support' };
let aiLastActive = -1; // (D) letzter aktivierter Tank-Index
let aiTurnQueue = []; // (A) Warteschlange für Multi-Tank-Runden
let aiCurrentQueueIdx = 0;
let aiPostShotMove = false;

function buildNavigationGrid(movingTeam) {
    const cells = MAP_SIZE / GRID_CELL_SIZE;
    navGrid = Array.from({length: cells}, () => Array(cells).fill(0));
    
    for(let r=0; r<cells; r++) {
        for(let c=0; c<cells; c++) {
            const x = (c - cells/2) * GRID_CELL_SIZE + GRID_CELL_SIZE/2;
            const z = (r - cells/2) * GRID_CELL_SIZE + GRID_CELL_SIZE/2;
            if (getH(x, z) < 1) navGrid[r][c] = 1; 
        }
    }
    
    const markObstacle = (pos, radius) => {
        const cC = Math.floor((pos.x + MAP_SIZE/2) / GRID_CELL_SIZE);
        const cR = Math.floor((pos.z + MAP_SIZE/2) / GRID_CELL_SIZE);
        
        if(cR>=0 && cR<cells && cC>=0 && cC<cells) navGrid[cR][cC] = 1;
        
        if (radius > GRID_CELL_SIZE / 2) {
             for(let r=cR-1; r<=cR+1; r++) {
                 for(let c=cC-1; c<=cC+1; c++) {
                     if(r>=0 && r<cells && c>=0 && c<cells) {
                          const cx = (c - cells/2) * GRID_CELL_SIZE + GRID_CELL_SIZE/2;
                          const cz = (r - cells/2) * GRID_CELL_SIZE + GRID_CELL_SIZE/2;
                          if (Math.hypot(cx - pos.x, cz - pos.z) < radius + 8) navGrid[r][c] = 1;
                     }
                 }
             }
        }
    };
    
    trees.forEach(t => { if(t.alive) markObstacle(t.mesh.position, 8); });
    bunkers.forEach(b => { if(b.alive) markObstacle(b.mesh.position, 22); });
    
    shields.forEach(s => {
        if (s.team !== movingTeam) markObstacle(s.pos, s.currentRadius);
    });
}

function findPath(start, target) {
    const cells = MAP_SIZE / GRID_CELL_SIZE;
    const getC = (val) => Math.max(0, Math.min(cells-1, Math.floor((val + MAP_SIZE/2) / GRID_CELL_SIZE)));
    let startC = getC(start.x), startR = getC(start.z);
    let targetC = getC(target.x), targetR = getC(target.z);

    if(navGrid[targetR][targetC] === 1) {
        let found = false;
        for(let r=1; r<10 && !found; r++) {
            for(let dr=-r; dr<=r; dr++) {
                for(let dc=-r; dc<=r; dc++) {
                    let nr = targetR+dr, nc = targetC+dc;
                    if(nr>=0 && nr<cells && nc>=0 && nc<cells && navGrid[nr][nc] === 0) {
                        targetR = nr; targetC = nc; found = true; break;
                    }
                }
                if(found) break;
            }
        }
    }

    let open = [{r: startR, c: startC, f: 0, g: 0, h: 0, parent: null}];
    let closed = Array.from({length: cells}, () => Array(cells).fill(false));
    
    let iterations = 0;
    while(open.length > 0 && iterations < 2500) { 
        iterations++;
        
        let minIdx = 0;
        for(let i=1; i<open.length; i++) {
            if(open[i].f < open[minIdx].f) minIdx = i;
        }
        let current = open[minIdx];
        open.splice(minIdx, 1);
        
        if(current.r === targetR && current.c === targetC) {
            let path = [];
            let curr = current;
            while(curr) {
                path.unshift(new THREE.Vector3(
                    (curr.c - cells/2) * GRID_CELL_SIZE + GRID_CELL_SIZE/2,
                    0,
                    (curr.r - cells/2) * GRID_CELL_SIZE + GRID_CELL_SIZE/2
                ));
                curr = curr.parent;
            }
            return path;
        }
        
        closed[current.r][current.c] = true;
        
        const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
        for(let d of dirs) {
            let nr = current.r + d[0], nc = current.c + d[1];
            if(nr>=0 && nr<cells && nc>=0 && nc<cells && navGrid[nr][nc] === 0 && !closed[nr][nc]) {
                if (d[0] !== 0 && d[1] !== 0) {
                    if (navGrid[current.r + d[0]][current.c] === 1 || navGrid[current.r][current.c + d[1]] === 1) continue;
                }
                
                let g = current.g + (d[0]===0||d[1]===0 ? 10 : 14);
                let h = (Math.abs(targetR - nr) + Math.abs(targetC - nc)) * 10;
                let f = g + h;
                
                let existing = open.find(n => n.r === nr && n.c === nc);
                if(!existing) {
                    open.push({r: nr, c: nc, f, g, h, parent: current});
                } else if(g < existing.g) {
                    existing.g = g; existing.f = f; existing.parent = current;
                }
            }
        }
    }
    return []; 
}

const AdaptiveAI = {
    getDelta() {
        const p1Alive = teams[0].filter(t => t.alive).length;
        const p2Alive = teams[1].filter(t => t.alive).length;
        const p1HP    = teams[0].filter(t => t.alive).reduce((s,t) => s+t.hp, 0);
        const p2HP    = teams[1].filter(t => t.alive).reduce((s,t) => s+t.hp, 0);
        const cpDelta = cpScores[0] - cpScores[1];
        return (p1Alive - p2Alive) * 12 + (p1HP - p2HP) * 0.08 + cpDelta * 4;
    },
    bonusActions() {
        if(!isSinglePlayer) return 0;
        const delta = this.getDelta();
        if(delta >= 35) return 2;
        if(delta >= 18) return 1;
        return 0;
    },
    accuracyMod() {
        if(!isSinglePlayer) return 0;
        const delta = this.getDelta();
        if(delta >= 25) return  0.35;
        if(delta <= -20) return -0.25;
        return 0;
    },
    hasBonusShot() {
        if(!isSinglePlayer || aiDifficulty === 3) return false;
        return this.getDelta() >= 30;
    }
};

function getAIVisionRange() {
    if(aiDifficulty === 3) return MAP_SIZE * 0.62;
    if(aiDifficulty === 2) return MAP_SIZE * 0.40;
    return MAP_SIZE * 0.22;
}

function updateRoleIcons() {
    if(!teams || !teams[0] || teams[0].length === 0) return;
    teams[0].forEach((t, idx) => {
        if(!t.hpEl) return;
        const icon = t.hpEl.querySelector('.tank-role-icon');
        if(!icon) return;
        const role = playerRoles[idx];
        if(role) {
            icon.textContent = ROLE_ICONS[role] + ' ' + ROLE_NAMES_DE[role];
            icon.style.color = role === 'attacker' ? '#ff6644' :
                               role === 'holder'   ? '#44aaff' :
                               role === 'flanker'  ? '#ffee44' : '#88ffaa';
        }
    });
    teams[0].forEach((t, idx) => {
        if(!t.alive && playerRoles[idx]) delete playerRoles[idx];
    });
}

function assignPlayerRoles() {
    const alive = teams[0].filter(t => t.alive);
    const n = alive.length;
    playerRoles = {};
    alive.forEach((t, i) => {
        const idx = teams[0].indexOf(t);
        const f = i / Math.max(n - 1, 1);
        if(f < 0.35)      playerRoles[idx] = 'attacker';
        else if(f < 0.60) playerRoles[idx] = 'holder';
        else if(f < 0.80) playerRoles[idx] = 'flanker';
        else               playerRoles[idx] = 'support';
    });
}

function assignAIRoles() {
    const alive = teams[1].filter(t => t.alive);
    const n = alive.length;
    if(n === 0) return;

    alive.forEach((t, i) => {
        const frac = i / n;
        if(frac < 0.40)      aiRoles[teams[1].indexOf(t)] = 'attacker';
        else if(frac < 0.70) aiRoles[teams[1].indexOf(t)] = 'holder';
        else if(frac < 0.90) aiRoles[teams[1].indexOf(t)] = 'flanker';
        else                  aiRoles[teams[1].indexOf(t)] = 'support';
    });
}

function buildAITurnQueue() {
    const alive = teams[1].filter(t => t.alive);
    if(alive.length === 0) return [];

    const adaptDelta = isSinglePlayer ? AdaptiveAI.getDelta() : 0;
    if(isSinglePlayer && adaptDelta >= 18) TacFeed.adapt('KI erhält Verstärkung');
    else if(isSinglePlayer && adaptDelta <= -20) TacFeed.adapt('KI nimmt sich zurück');

    const baseSlots = aiDifficulty === 3 ? Math.min(3, alive.length)
                    : aiDifficulty === 2 ? Math.min(2, alive.length)
                    : 1;
    const bonus = isSinglePlayer ? AdaptiveAI.bonusActions() : 0;
    const slots = Math.min(alive.length, baseSlots + bonus);

    const scored = alive.map(t => {
        const idx = teams[1].indexOf(t);
        const role = aiRoles[idx] || 'attacker';
        let score = 0;

        if(role === 'attacker') {
            const vis = teams[0].filter(e => e.alive &&
                e.mesh.position.distanceTo(t.mesh.position) <= getAIVisionRange()).length;
            score += vis * 25;
        }
        if(role === 'holder') {
            controlPoints.forEach(cp => {
                const d = t.mesh.position.distanceTo(cp.pos);
                if(d < CP_CAPTURE_RADIUS) score += 60;
                else if(d < CP_CAPTURE_RADIUS * 3) score += 20;
                if(cp.capturingTeam === 0 && d < CP_CAPTURE_RADIUS * 4) score += 50;
            });
        }
        if(role === 'flanker') score += 30 + Math.random() * 20;
        if(role === 'support') {
            const weakAlly = alive.find(a => a !== t && a.hp < 50 &&
                a.mesh.position.distanceTo(t.mesh.position) < 300);
            if(weakAlly) score += 40;
        }

        if(idx === aiLastActive && alive.length > 1) score -= 50;
        if(t.hp < 30) score += 15;

        return { tank: t, idx, score, role };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, slots).map(s => s.idx);
}

function simulateShot(tipPos, aimDir, power, speedMult) {
    let px = tipPos.x, py = tipPos.y, pz = tipPos.z;
    const spd = power * 1.5 * (speedMult || 1.0);
    let vx = aimDir.x * spd, vy = aimDir.y * spd, vz = aimDir.z * spd;
    const dt = 0.04;
    for(let i = 0; i < 500; i++) {
        vy -= GRAVITY * dt;
        px += vx * dt; py += vy * dt; pz += vz * dt;
        if(py <= getH(px, pz)) return new THREE.Vector3(px, py, pz);
        if(Math.abs(px) > MAP_SIZE || Math.abs(pz) > MAP_SIZE) return null;
    }
    return null;
}

function findBestShot(shooter, targetPos, ammoSpeedMult) {
    ammoSpeedMult = ammoSpeedMult || 1.0;
    const origRot = shooter.settings.rot, origAng = shooter.settings.ang, origPow = shooter.settings.pow;

    const dx = targetPos.x - shooter.mesh.position.x;
    const dz = targetPos.z - shooter.mesh.position.z;
    let localYaw = Math.atan2(dx, dz) - shooter.heading;
    while(localYaw >  Math.PI) localYaw -= Math.PI*2;
    while(localYaw < -Math.PI) localYaw += Math.PI*2;
    const exactRot = Math.max(-180, Math.min(180, -localYaw * 180/Math.PI));

    let best = { rot: exactRot, ang: 45, pow: 60, landDist: 9e9, impactPos: null };

    for(let testAng = 5; testAng <= 85; testAng += 5) {
        for(let testPow = 20; testPow <= 150; testPow += 10) {
            shooter.settings.rot = exactRot; shooter.settings.ang = testAng; shooter.settings.pow = testPow;
            shooter.turret.rotation.y = -exactRot * Math.PI/180;
            shooter.barrelJoint.rotation.x = -testAng * Math.PI/180;
            shooter.mesh.updateMatrixWorld(true);
            const tip = new THREE.Vector3(0,0,9).applyMatrix4(shooter.barrelJoint.matrixWorld);
            const dir = new THREE.Vector3(0,0,1).applyQuaternion(
                new THREE.Quaternion().setFromRotationMatrix(shooter.barrelJoint.matrixWorld)).normalize();
            const impact = simulateShot(tip, dir, testPow, ammoSpeedMult);
            if(!impact) continue;
            const d = impact.distanceTo(targetPos);
            if(d < best.landDist) best = { rot: exactRot, ang: testAng, pow: testPow, landDist: d, impactPos: impact.clone() };
        }
    }

    if(aiDifficulty >= 2 && best.landDist < 400) {
        const fAS = aiDifficulty === 3 ? 1 : 2, fPS = aiDifficulty === 3 ? 3 : 5;
        for(let ta = Math.max(5, best.ang-8); ta <= Math.min(85, best.ang+8); ta += fAS) {
            for(let tp = Math.max(20, best.pow-15); tp <= Math.min(150, best.pow+15); tp += fPS) {
                shooter.settings.rot = exactRot; shooter.settings.ang = ta; shooter.settings.pow = tp;
                shooter.turret.rotation.y = -exactRot * Math.PI/180;
                shooter.barrelJoint.rotation.x = -ta * Math.PI/180;
                shooter.mesh.updateMatrixWorld(true);
                const tip = new THREE.Vector3(0,0,9).applyMatrix4(shooter.barrelJoint.matrixWorld);
                const dir = new THREE.Vector3(0,0,1).applyQuaternion(
                    new THREE.Quaternion().setFromRotationMatrix(shooter.barrelJoint.matrixWorld)).normalize();
                const impact = simulateShot(tip, dir, tp, ammoSpeedMult);
                if(!impact) continue;
                const d = impact.distanceTo(targetPos);
                if(d < best.landDist) best = { rot: exactRot, ang: ta, pow: tp, landDist: d, impactPos: impact.clone() };
            }
        }
    }

    shooter.settings.rot = origRot; shooter.settings.ang = origAng; shooter.settings.pow = origPow;
    shooter.turret.rotation.y = -origRot * Math.PI/180;
    shooter.barrelJoint.rotation.x = -origAng * Math.PI/180;
    shooter.mesh.updateMatrixWorld(true);
    return best;
}

function aiShotThreshold() {
    const ammoBonus = selectedAmmo === 'frag' ? 60 : 0;
    if(aiDifficulty === 3) return 55  + ammoBonus;
    if(aiDifficulty === 2) return 100 + ammoBonus;
    return 180 + ammoBonus;
}

function aiScoreTarget(aiTank, enemyTank) {
    const dist = aiTank.mesh.position.distanceTo(enemyTank.mesh.position);
    if(dist > getAIVisionRange()) return -1;
    for(let sm of smokeScreens) if(enemyTank.mesh.position.distanceTo(sm.pos) < sm.radius) return -1;
    const hasLOS = hasLineOfSightDeterministic(aiTank.mesh.position, enemyTank.mesh.position);
    if(!hasLOS && aiDifficulty === 1) return -1;
    const losMalus = hasLOS ? 0 : -25;
    const myH = getH(aiTank.mesh.position.x, aiTank.mesh.position.z);
    const enemyH = getH(enemyTank.mesh.position.x, enemyTank.mesh.position.z);
    const heightBonus = (myH - enemyH) * 1.2;
    let score = (100 - enemyTank.hp) * 1.3 + (1 - dist / getAIVisionRange()) * 55 + losMalus + heightBonus;
    for(let cp of controlPoints) {
        const onCP = enemyTank.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS;
        if(onCP && cp.holder === 0)  score += 45;
        if(onCP && cp.holder === -2) score += 22;
    }
    return score;
}

function aiPickAmmo(aiTank, targetTank) {
    if(aiDifficulty === 1) return 'standard';
    const dist = aiTank.mesh.position.distanceTo(targetTank.mesh.position);
    if((ammoInventory['smoke'] || 0) > 0) {
        for(let cp of controlPoints) {
            if(cp.holder === 0) {
                const count = teams[0].filter(t => t.alive && t.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS).length;
                if(count >= 2 && dist > 350) return 'smoke';
            }
        }
    }
    if((ammoInventory['ap'] || 0) > 0 && (targetTank.hp < 40 || dist < 180)) return 'ap';
    if((ammoInventory['frag'] || 0) > 0) {
        const cluster = teams[0].filter(t => t.alive && t.mesh.position.distanceTo(targetTank.mesh.position) < 110).length;
        if(cluster >= 2) return 'frag';
    }
    return 'standard';
}

function aiShouldShield(aiTank) {
    if(shieldsRemaining[1] <= 0) return false;
    if(shields.some(s => s.team === 1 && aiTank.mesh.position.distanceTo(s.pos) <= s.currentRadius)) return false;
    if(aiTank.hp < 32 && aiDifficulty >= 2) return true;
    if(aiTank.hp < 55 && aiDifficulty === 3 && Math.random() < 0.45) return true;
    if(aiDifficulty === 3) {
        const allies = teams[1].filter(t => t.alive && t !== aiTank && t.mesh.position.distanceTo(aiTank.mesh.position) < 110);
        if(allies.length >= 2 && shieldsRemaining[1] >= 1) return true;
    }
    return false;
}

function aiPickMoveTarget(aiTank) {
    const diff = aiDifficulty;
    const visRange = getAIVisionRange();
    const playerTanks = teams[0].filter(t => t.alive);
    const role = aiRoles[teams[1].indexOf(aiTank)] || 'attacker';
    let candidates = [];

    if(aiTank.hp < 28 || (aiTank.hp < 50 && diff === 3)) {
        let nearest = null, minD = 9e9;
        playerTanks.forEach(e => { const d = e.mesh.position.distanceTo(aiTank.mesh.position); if(d < minD) { minD = d; nearest = e; }});
        if(nearest) {
            const away = aiTank.mesh.position.clone().sub(nearest.mesh.position).normalize();
            let bestCP = null, bestCPDist = 9e9;
            controlPoints.forEach(cp => {
                if(cp.holder === 1 || cp.capturingTeam === 1) {
                    const d = aiTank.mesh.position.distanceTo(cp.pos);
                    if(d < bestCPDist) { bestCPDist = d; bestCP = cp; }
                }
            });
            if(bestCP && bestCPDist < 600) {
                candidates.push({ pos: bestCP.pos.clone(), score: aiTank.hp < 28 ? 180 : 100 });
            } else {
                const lateral = new THREE.Vector3(-away.z, 0, away.x);
                const retreatDir = away.clone().add(lateral.multiplyScalar(0.4 * (Math.random() > 0.5 ? 1 : -1))).normalize();
                const rp = aiTank.mesh.position.clone().add(retreatDir.multiplyScalar(300));
                rp.x = Math.max(-MAP_SIZE*0.44, Math.min(MAP_SIZE*0.44, rp.x));
                rp.z = Math.max(-MAP_SIZE*0.44, Math.min(MAP_SIZE*0.44, rp.z));
                candidates.push({ pos: rp, score: aiTank.hp < 28 ? 200 : 120 });
            }
        }
    }

    if(role === 'holder' || diff <= 1) {
        const cpUrgency = cpScores[0] >= 7 ? 2.2 : (cpScores[0] >= 4 ? 1.6 : 1.0);
        controlPoints.forEach(cp => {
            const dist = aiTank.mesh.position.distanceTo(cp.pos);
            let sc = 0;
            if(cp.holder === 0)             sc = 90 * cpUrgency;
            else if(cp.capturingTeam === 0) sc = 70 * cpUrgency;
            else if(cp.holder === -2)       sc = 45 * cpUrgency;
            else if(cp.holder !== 1)        sc = 50 * cpUrgency;
            else sc = 8;
            sc += Math.max(0, (700 - dist) * 0.05);
            if(sc > 0) candidates.push({ pos: cp.pos.clone(), score: sc });
        });
    }

    if(role === 'flanker') {
        const visibleEnemies = playerTanks.filter(t => {
            if(t.mesh.position.distanceTo(aiTank.mesh.position) > visRange) return false;
            for(let sm of smokeScreens) if(t.mesh.position.distanceTo(sm.pos) < sm.radius) return false;
            return true;
        });
        visibleEnemies.forEach(enemy => {
            const toEnemy = enemy.mesh.position.clone().sub(aiTank.mesh.position).normalize();
            const perpDir = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x);
            const side = Math.random() > 0.5 ? 1 : -1;
            const flankPos = enemy.mesh.position.clone()
                .add(perpDir.multiplyScalar(side * 200))
                .add(toEnemy.clone().negate().multiplyScalar(250));
            flankPos.x = Math.max(-MAP_SIZE*0.44, Math.min(MAP_SIZE*0.44, flankPos.x));
            flankPos.z = Math.max(-MAP_SIZE*0.44, Math.min(MAP_SIZE*0.44, flankPos.z));
            candidates.push({ pos: flankPos, score: 70 + (100 - enemy.hp) * 0.3 });
        });
        if(candidates.length === 0) {
            const neutralCP = controlPoints.find(cp => cp.holder !== 1);
            if(neutralCP) candidates.push({ pos: neutralCP.pos.clone(), score: 45 });
        }
    }

    if(role === 'attacker' || role === 'support') {
        const visibleEnemies = playerTanks.filter(t => {
            if(t.mesh.position.distanceTo(aiTank.mesh.position) > visRange) return false;
            for(let sm of smokeScreens) if(t.mesh.position.distanceTo(sm.pos) < sm.radius) return false;
            return true;
        });
        const optRange = role === 'support' ? 380 : 280;
        visibleEnemies.forEach(enemy => {
            const dist = aiTank.mesh.position.distanceTo(enemy.mesh.position);
            if(dist > optRange + 80) {
                const toEnemy = enemy.mesh.position.clone().sub(aiTank.mesh.position).normalize();
                const offset = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x).multiplyScalar((Math.random()-0.5)*160);
                const ap = enemy.mesh.position.clone().add(toEnemy.clone().negate().multiplyScalar(optRange)).add(offset);
                ap.x = Math.max(-MAP_SIZE*0.44, Math.min(MAP_SIZE*0.44, ap.x));
                ap.z = Math.max(-MAP_SIZE*0.44, Math.min(MAP_SIZE*0.44, ap.z));
                const posH = getH(ap.x, ap.z);
                const heightScore = Math.max(0, posH * 1.5);
                candidates.push({ pos: ap, score: 65 + (100 - enemy.hp) * 0.4 + heightScore });
            } else if(dist < optRange - 80) {
                const backDir = aiTank.mesh.position.clone().sub(enemy.mesh.position).normalize();
                const bp = aiTank.mesh.position.clone().add(backDir.multiplyScalar(150));
                candidates.push({ pos: bp, score: 50 });
            }
        });
        if(candidates.length === 0 && role === 'attacker') {
            const px = -200 - Math.random() * 500;
            const pz = (Math.random()-0.5) * 1000;
            candidates.push({ pos: new THREE.Vector3(px, 0, pz), score: 20 });
        }
    }

    if(candidates.length === 0) {
        const urgentCP = controlPoints.find(cp => cp.capturingTeam === 0 || cp.holder === 0);
        if(urgentCP) return urgentCP.pos.clone();
        const anyCP = controlPoints.find(cp => cp.holder !== 1);
        if(anyCP) return anyCP.pos.clone();
        return null;
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].pos;
}

function aiNextTankOrEnd() {
    aiCurrentQueueIdx++;
    if(aiCurrentQueueIdx >= aiTurnQueue.length) {
        aiTurnQueue = [];
        aiCurrentQueueIdx = 0;
        endTurnSequence();
        return;
    }
    const nextIdx = aiTurnQueue[aiCurrentQueueIdx];
    if(!teams[1][nextIdx] || !teams[1][nextIdx].alive) {
        aiNextTankOrEnd();
        return;
    }
    activeTankIdx[1] = nextIdx;
    aiLastActive = nextIdx;
    syncUIToTank(); updateUI();
    buildNavigationGrid(1);
    initAP();
    aiPostShotMove = false;
    aiDriveParams.retryShot = false;

    const tank = teams[1][nextIdx];
    const moveTarget = aiPickMoveTarget(tank);
    if(moveTarget) {
        aiDriveParams.target = moveTarget;
        aiDriveParams.path = findPath(tank.mesh.position, moveTarget);
        if(aiDriveParams.path.length === 0) aiDriveParams.path = [tank.mesh.position.clone(), moveTarget];
        aiDriveParams.pathIndex = 1;
    } else {
        pickNewAITarget(tank);
    }
    gameState = 'AI_DRIVE';
    aiDriveParams.active = true;
    aiDriveParams.turnOverride = 0;
}

function doAITurn() {
    if(gameState !== 'PLAY') { aiNextTankOrEnd(); return; }
    const aiTank = teams[1][activeTankIdx[1]];
    if(!aiTank || !aiTank.alive) { aiNextTankOrEnd(); return; }

    if(aiShouldShield(aiTank)) {
        TacFeed.aiAction('Schild aktiviert');
        deployShield();
        return;
    }

    const cpThreaten = controlPoints.some(cp =>
        cp.capturingTeam === 0 && cp.captureProgress >= 2 &&
        aiTank.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS * 5);
    const role = aiRoles[activeTankIdx[1]] || 'attacker';
    if(cpThreaten && role === 'holder' && !apUsedMove) {
        TacFeed.aiAction('Verteidigt Kontrollpunkt!');
        const threatenedCP = controlPoints.find(cp =>
            cp.capturingTeam === 0 && cp.captureProgress >= 2 &&
            aiTank.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS * 5);
        if(threatenedCP) {
            aiDriveParams.path = findPath(aiTank.mesh.position, threatenedCP.pos);
            if(aiDriveParams.path.length === 0) aiDriveParams.path = [aiTank.mesh.position.clone(), threatenedCP.pos.clone()];
            aiDriveParams.pathIndex = 1;
            aiDriveParams.retryShot = false;
            aiDriveParams.turnOverride = 0;
            gameState = 'AI_DRIVE';
            return;
        }
    }

    let bestTarget = null, bestScore = -1;
    teams[0].filter(t => t.alive).forEach(enemy => {
        const s = aiScoreTarget(aiTank, enemy);
        if(s > bestScore) { bestScore = s; bestTarget = enemy; }
    });

    if(!bestTarget) {
        setTimeout(aiNextTankOrEnd, 800);
        return;
    }

    selectionMarker.visible = false;
    const chosenAmmo = aiPickAmmo(aiTank, bestTarget);
    selectedAmmo = chosenAmmo;
    const ammoData = AMMO_TYPES[chosenAmmo];
    const shot = findBestShot(aiTank, bestTarget.mesh.position, ammoData.speedMult);
    const threshold = aiShotThreshold();

    const allyInBlast = isSinglePlayer && aiDifficulty <= 2 && teams[1].some(ally => {
        if(!ally.alive || ally === aiTank) return false;
        const toAlly = ally.mesh.position.clone().sub(aiTank.mesh.position);
        const toTarget = bestTarget.mesh.position.clone().sub(aiTank.mesh.position);
        const cos = toAlly.dot(toTarget) / (toAlly.length() * toTarget.length() + 0.001);
        return cos > 0.92 && toAlly.length() < toTarget.length() * 0.85;
    });
    if(allyInBlast) {
        TacFeed.aiAction('Kein Beschuss — eigener Alliierter im Weg');
        const altTarget = teams[0].filter(t => t.alive && t !== bestTarget)
            .find(enemy => {
                const shot2 = findBestShot(aiTank, enemy.mesh.position, ammoData.speedMult);
                const allyBlocked = teams[1].some(ally => {
                    if(!ally.alive || ally === aiTank) return false;
                    const ta = ally.mesh.position.clone().sub(aiTank.mesh.position);
                    const te = enemy.mesh.position.clone().sub(aiTank.mesh.position);
                    const c = ta.dot(te) / (ta.length() * te.length() + 0.001);
                    return c > 0.92 && ta.length() < te.length() * 0.85;
                });
                return !allyBlocked && shot2.landDist <= threshold;
            });
        if(altTarget) { bestTarget = altTarget; }
        else { setTimeout(aiNextTankOrEnd, 600); return; }
    }

    if(shot.landDist > threshold && !apUsedMove && apRemaining >= 1) {
        const toTarget = bestTarget.mesh.position.clone().sub(aiTank.mesh.position).normalize();
        const rushPos = aiTank.mesh.position.clone().add(toTarget.multiplyScalar(200));
        aiDriveParams.path = findPath(aiTank.mesh.position, rushPos);
        if(aiDriveParams.path.length === 0) aiDriveParams.path = [aiTank.mesh.position.clone(), rushPos];
        aiDriveParams.pathIndex = 1;
        aiDriveParams.turnOverride = 0;
        aiPostShotMove = false;
        aiDriveParams.retryShot = true;
        gameState = 'AI_DRIVE';
        return;
    }

    aiDriveParams.retryShot = false;

    const baseNm = aiDifficulty === 1 ? 1.1 : (aiDifficulty === 2 ? 0.22 : 0.03);
    const accMod = isSinglePlayer ? AdaptiveAI.accuracyMod() : 0;
    const nm = Math.max(0.01, baseNm * (1.0 - accMod));
    shot.rot = Math.max(-180, Math.min(180, shot.rot + (Math.random()-0.5)*22*nm));
    shot.ang = Math.max(0,    Math.min(85,  shot.ang + (Math.random()-0.5)*16*nm));
    shot.pow = Math.max(10,   Math.min(150, shot.pow + (Math.random()-0.5)*25*nm));

    aiPostShotMove = !apUsedMove;

    const aimDur = aiDifficulty === 3 ? 850 : (aiDifficulty === 2 ? 1200 : 1750);
    animateAIAiming(aiTank, shot, aimDur, () => {
        setTimeout(fire, aiDifficulty === 3 ? 220 : 450);
    });
}

function doAIPostShotMove() {
    aiPostShotMove = false;
    const aiTank = teams[1][activeTankIdx[1]];
    if(!aiTank || !aiTank.alive) { aiNextTankOrEnd(); return; }

    const moveTarget = aiPickMoveTarget(aiTank);
    if(!moveTarget) { aiNextTankOrEnd(); return; }

    aiDriveParams.target = moveTarget;
    aiDriveParams.path = findPath(aiTank.mesh.position, moveTarget);
    if(aiDriveParams.path.length === 0) { aiNextTankOrEnd(); return; }
    aiDriveParams.pathIndex = 1;
    aiDriveParams.turnOverride = 0;
    aiDriveParams.retryShot = false;
    gameState = 'AI_DRIVE';
}

function aiHideReposition() {
    if(gameState !== 'HIDE') return;
    const aiTanks = teams[1].filter(t => t.alive);
    if(aiTanks.length === 0) return;

    let mostExposed = null, minSafeScore = 9e9;
    aiTanks.forEach(t => {
        const closestEnemyDist = Math.min(...teams[0].filter(e => e.alive).map(e => e.mesh.position.distanceTo(t.mesh.position)));
        const onEnemyCP = controlPoints.some(cp => cp.holder === 0 && t.mesh.position.distanceTo(cp.pos) < CP_CAPTURE_RADIUS * 2);
        const score = closestEnemyDist - (onEnemyCP ? 500 : 0);
        if(score < minSafeScore) { minSafeScore = score; mostExposed = t; }
    });
    if(!mostExposed) return;

    activeTankIdx[1] = teams[1].indexOf(mostExposed);
    const repoTarget = aiPickMoveTarget(mostExposed);
    if(!repoTarget) return;

    aiDriveParams.target = repoTarget;
    aiDriveParams.path = findPath(mostExposed.mesh.position, repoTarget);
    if(aiDriveParams.path.length === 0) return;
    aiDriveParams.pathIndex = 1;
    aiDriveParams.turnOverride = 0;
    aiDriveParams.retryShot = false;
    gameState = 'AI_DRIVE';
    setTimeout(() => {
        if(gameState === 'AI_DRIVE') gameState = 'HIDE';
    }, 3500);
}

function startAIDrive() {
    killsThisTurn = 0;
    const aiTanks = teams[1].filter(t => t.alive);
    if(aiTanks.length === 0) { endTurnSequence(); return; }

    if(Object.keys(aiRoles).length === 0) { assignAIRoles(); assignPlayerRoles(); updateRoleIcons(); }

    aiTurnQueue = buildAITurnQueue();
    aiCurrentQueueIdx = 0;

    if(aiTurnQueue.length === 0) { endTurnSequence(); return; }

    const firstIdx = aiTurnQueue[0];
    aiLastActive = firstIdx;
    activeTankIdx[1] = firstIdx;
    syncUIToTank(); updateUI();
    buildNavigationGrid(1);
    initAP();
    aiPostShotMove = false;
    aiDriveParams.retryShot = false;

    const tank = teams[1][firstIdx];
    const moveTarget = aiPickMoveTarget(tank);
    if(moveTarget) {
        aiDriveParams.target = moveTarget;
        aiDriveParams.path = findPath(tank.mesh.position, moveTarget);
        if(aiDriveParams.path.length === 0) aiDriveParams.path = [tank.mesh.position.clone(), moveTarget];
        aiDriveParams.pathIndex = 1;
    } else {
        pickNewAITarget(tank);
    }

    gameState = 'AI_DRIVE';
    aiDriveParams.active = true;
    aiDriveParams.turnOverride = 0;
}

function pickNewAITarget(tank) {
    const role = aiRoles[teams[1].indexOf(tank)] || 'attacker';
    let retries = 6;
    aiDriveParams.path = [];
    while(aiDriveParams.path.length === 0 && retries > 0) {
        let tx, tz;
        if(role === 'holder' || role === 'support') {
            tx = 200 + Math.random() * 500;
            tz = (Math.random()-0.5) * 900;
        } else {
            tx = -200 - Math.random() * 500;
            tz = (Math.random()-0.5) * 900;
        }
        aiDriveParams.target = new THREE.Vector3(tx, 0, tz);
        aiDriveParams.path = findPath(tank.mesh.position, aiDriveParams.target);
        retries--;
    }
    if(aiDriveParams.path.length === 0) {
        aiDriveParams.target = new THREE.Vector3(role === 'holder' ? 400 : -400, 0, 0);
        aiDriveParams.path = [tank.mesh.position.clone(), aiDriveParams.target];
    }
    aiDriveParams.pathIndex = 1;
}

function animateAIAiming(tank, targetShot, duration, callback) {
    const startRot = tank.settings.rot, startAng = tank.settings.ang, startPow = tank.settings.pow;
    const startTime = performance.now();
    function step(time) {
        const progress = Math.min(1, (time - startTime) / duration);
        const ease = 1 - Math.pow(1 - progress, 3);
        tank.settings.rot = startRot + (targetShot.rot - startRot) * ease;
        tank.settings.ang = startAng + (targetShot.ang - startAng) * ease;
        tank.settings.pow = startPow + (targetShot.pow - startPow) * ease;
        syncUIToTank();
        if(progress < 1) requestAnimationFrame(step);
        else callback();
    }
    requestAnimationFrame(step);
}

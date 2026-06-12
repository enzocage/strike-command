function setupFX() {
    const ptGeo = new THREE.SphereGeometry(1.2, 4, 4);
    const ptMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }); 
    trajectoryPoints = new THREE.InstancedMesh(ptGeo, ptMat, 250); 
    scene.add(trajectoryPoints);

    impactMarker = new THREE.Mesh(
        new THREE.RingGeometry(2, 6, 32), 
        new THREE.MeshBasicMaterial({color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false})
    );
    impactMarker.renderOrder = 999; scene.add(impactMarker);

    selectionMarker = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 150, 16), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.2, additiveBlending: THREE.AdditiveBlending, depthWrite: false}));
    selectionMarker.geometry.translate(0, 75, 0); selectionMarker.visible = false; scene.add(selectionMarker);

    projectileLight = new THREE.PointLight(0xffaa00, 3, 150);
    projectileLight.visible = false; scene.add(projectileLight);
}

// ── FX 1: Improved multi-layer explosion ──
function createExplosion(pos) {
    const fGeo = new THREE.SphereGeometry(2.8, 5, 5);
    for(let i=0; i<55; i++) {
        const c = Math.random() > 0.5 ? 0xff4400 : 0xff9900;
        const p = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:0.9}));
        p.position.copy(pos);
        const spd = 38 + Math.random()*48;
        const theta = Math.random()*Math.PI*2, phi = Math.random()*Math.PI;
        p.userData = { velocity: new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.sin(phi)*Math.sin(theta)+0.6,Math.cos(phi)).multiplyScalar(spd), life: 0.9+Math.random()*0.5, maxLife: 1.4, type: 'fire' };
        scene.add(p); particles.push(p);
    }
    const sGeo = new THREE.DodecahedronGeometry(4.5, 0);
    for(let i=0; i<30; i++) {
        const p = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({color:0x111111,transparent:true,opacity:0.7}));
        p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*8,(Math.random()-0.5)*8,(Math.random()-0.5)*8));
        const spd = 18 + Math.random()*25;
        p.userData = { velocity: new THREE.Vector3((Math.random()-0.5)*spd, spd*0.4+Math.random()*spd*0.6,(Math.random()-0.5)*spd), life: 1.8+Math.random()*1.2, maxLife: 3.0, type: 'smoke' };
        scene.add(p); particles.push(p);
    }
    const spGeo = new THREE.BoxGeometry(0.6,0.6,0.6);
    for(let i=0; i<60; i++) {
        const c = Math.random()>0.5 ? 0xffee00 : 0xffffff;
        const p = new THREE.Mesh(spGeo, new THREE.MeshBasicMaterial({color:c}));
        p.position.copy(pos);
        p.userData = { velocity: new THREE.Vector3((Math.random()-0.5)*130, Math.random()*110,(Math.random()-0.5)*130), life: 0.5+Math.random()*0.4, maxLife: 0.9, type: 'spark' };
        scene.add(p); particles.push(p);
    }
    fxShockwave(pos.clone());
    explosionLight.position.copy(pos).add(new THREE.Vector3(0,10,0));
    explosionLight.intensity = 30; screenShake = 50;
    Cam.onExplosion(pos);
}

// ── FX 2: Shockwave ring expanding on ground ──
function fxShockwave(pos) {
    const geo = new THREE.RingGeometry(2, 5, 32);
    const mat = new THREE.MeshBasicMaterial({color:0xff8800,transparent:true,opacity:0.9,side:THREE.DoubleSide,depthWrite:false});
    const ring = new THREE.Mesh(geo, mat);
    pos.y = getH(pos.x, pos.z) + 0.5;
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI/2;
    ring.userData = { life: 0.7, maxLife: 0.7, type: 'shockwave', growSpeed: 280 };
    scene.add(ring); particles.push(ring);
}

// ── FX 3: Muzzle flash at barrel tip ──
function fxMuzzleFlash(pos, dir) {
    const flash = new THREE.Mesh(
        new THREE.SphereGeometry(5, 8, 8),
        new THREE.MeshBasicMaterial({color:0xffffaa,transparent:true,opacity:0.95})
    );
    flash.position.copy(pos);
    flash.userData = { life: 0.08, maxLife: 0.08, type: 'muzzleFlash', velocity: new THREE.Vector3(0,0,0) };
    scene.add(flash); particles.push(flash);
    for(let i=0; i<12; i++) {
        const p = new THREE.Mesh(
            new THREE.SphereGeometry(1.5+Math.random()*2, 5, 5),
            new THREE.MeshBasicMaterial({color:0x888888,transparent:true,opacity:0.6})
        );
        p.position.copy(pos);
        const spread = dir.clone().add(new THREE.Vector3((Math.random()-0.5)*0.5,(Math.random()-0.5)*0.5,(Math.random()-0.5)*0.5)).normalize();
        p.userData = { velocity: spread.multiplyScalar(15+Math.random()*18), life: 0.6+Math.random()*0.4, maxLife: 1.0, type: 'muzzleSmoke' };
        scene.add(p); particles.push(p);
    }
}

// ── FX 4: Shield hit ripple ──
function fxShieldRipple(hitPos, shieldCenter, shieldRadius) {
    const geo = new THREE.RingGeometry(3, 6, 24);
    const mat = new THREE.MeshBasicMaterial({color:0x44eeff,transparent:true,opacity:0.95,side:THREE.DoubleSide,depthWrite:false});
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(hitPos);
    const normal = hitPos.clone().sub(shieldCenter).normalize();
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), normal);
    ring.userData = { life: 0.5, maxLife: 0.5, type: 'shieldRipple', growSpeed: 180, shieldRadius };
    scene.add(ring); particles.push(ring);
    for(let i=0; i<20; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), new THREE.MeshBasicMaterial({color:0x00ffff}));
        sp.position.copy(hitPos);
        const spreadDir = normal.clone().add(new THREE.Vector3((Math.random()-0.5)*2,(Math.random()-0.5)*2,(Math.random()-0.5)*2)).normalize();
        sp.userData = { velocity: spreadDir.multiplyScalar(20+Math.random()*30), life: 0.4+Math.random()*0.3, maxLife: 0.7, type: 'shieldSpark' };
        scene.add(sp); particles.push(sp);
    }
}

// ── FX 5: CP capture beam (vertical column of light) ──
function fxCPCapture(pos, teamColor) {
    for(let i=0; i<25; i++) {
        const p = new THREE.Mesh(
            new THREE.BoxGeometry(1.5,3,1.5),
            new THREE.MeshBasicMaterial({color:teamColor,transparent:true,opacity:0.8})
        );
        const angle = (i/25)*Math.PI*2;
        p.position.set(pos.x+Math.cos(angle)*8, pos.y+Math.random()*40, pos.z+Math.sin(angle)*8);
        p.userData = { velocity: new THREE.Vector3(0, 25+Math.random()*20, 0), life: 1.0+Math.random()*0.5, maxLife: 1.5, type: 'cpBeam', baseX: p.position.x, baseZ: p.position.z, angle, radius:8 };
        scene.add(p); particles.push(p);
    }
    fxShockwave(pos.clone().add(new THREE.Vector3(0,1,0)));
}

// ── FX 6: Tank engine smoke trail (continuous) ──
function fxEngineSmoke(tankPos, intensity) {
    if(Math.random() > 0.35 * intensity) return;
    const p = new THREE.Mesh(
        new THREE.SphereGeometry(1.8+Math.random()*1.5, 5, 5),
        new THREE.MeshBasicMaterial({color:0x555555,transparent:true,opacity:0.35+Math.random()*0.2})
    );
    p.position.copy(tankPos).add(new THREE.Vector3((Math.random()-0.5)*3, 2+Math.random()*2, (Math.random()-0.5)*3));
    p.userData = { velocity: new THREE.Vector3((Math.random()-0.5)*2, 4+Math.random()*3, (Math.random()-0.5)*2), life: 1.2+Math.random()*0.8, maxLife: 2.0, type: 'engineSmoke' };
    scene.add(p); particles.push(p);
}

// ── FX 7: Destruction shrapnel burst ──
function fxShrapnel(pos) {
    for(let i=0; i<35; i++) {
        const length = 1.5+Math.random()*3;
        const p = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, length, 0.4),
            new THREE.MeshBasicMaterial({color: Math.random()>0.5 ? 0x888888 : 0x333333})
        );
        p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*5,Math.random()*4,(Math.random()-0.5)*5));
        const spd = 30+Math.random()*60;
        p.userData = { velocity: new THREE.Vector3((Math.random()-0.5)*spd, spd*0.3+Math.random()*spd,(Math.random()-0.5)*spd), life: 2.5+Math.random(), maxLife: 3.5, type: 'shrapnel', rot: new THREE.Vector3(Math.random()*8-4,Math.random()*8-4,Math.random()*8-4) };
        scene.add(p); particles.push(p);
    }
}

// ── FX 8: Ground crater dust cloud ──
function fxCraterDust(pos) {
    for(let i=0; i<20; i++) {
        const p = new THREE.Mesh(
            new THREE.SphereGeometry(3+Math.random()*4, 5, 5),
            new THREE.MeshBasicMaterial({color:0x887766,transparent:true,opacity:0.5+Math.random()*0.3})
        );
        const angle = Math.random()*Math.PI*2;
        const dist = 5+Math.random()*20;
        p.position.set(pos.x+Math.cos(angle)*dist, getH(pos.x,pos.z)+1, pos.z+Math.sin(angle)*dist);
        p.userData = { velocity: new THREE.Vector3(Math.cos(angle)*12, 8+Math.random()*14, Math.sin(angle)*12), life: 2.0+Math.random()*1.5, maxLife: 3.5, type: 'dust' };
        scene.add(p); particles.push(p);
    }
}

function spawnDamageText(pos, damage, isDestroyed) {
    const el = document.createElement('div'); 
    el.className = 'damage-number'; 
    if(isDestroyed) {
        el.innerHTML = `-${damage}<br><span style="font-size:18px;color:#ffcc00;text-shadow:0 0 10px #ff0000;">VERNICHTET</span>`;
    } else {
        el.innerText = '-' + damage;
    }
    document.getElementById('fx-layer').appendChild(el);
    const p = pos.clone(); p.y += 15; p.project(camera);
    el.style.left = `${(p.x * .5 + .5) * window.innerWidth}px`; el.style.top = `${(p.y * -.5 + .5) * window.innerHeight}px`;
    setTimeout(() => el.remove(), 3000); 
}

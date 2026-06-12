function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0008); 

    camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 1, 4000);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    document.getElementById('game-canvas').appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0x334466, 0x080c10, 0.7);
    scene.add(hemiLight);
    window._hemi = hemiLight;

    const sun = new THREE.DirectionalLight(0xffd580, 1.5);
    sun.position.set(200, 500, -200); sun.castShadow = true;
    sun.shadow.camera.left = -500; sun.shadow.camera.right = 500;
    sun.shadow.camera.top = 500; sun.shadow.camera.bottom = -500;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x3366aa, 0.3);
    fillLight.position.set(-200, 100, 200);
    scene.add(fillLight);
    window._fillLight = fillLight;

    const rimLight = new THREE.DirectionalLight(0xff6600, 0.0);
    rimLight.position.set(0, 300, 400);
    scene.add(rimLight);
    window._rimLight = rimLight;

    const atmoLight = new THREE.PointLight(0xffffff, 0, 2000);
    atmoLight.position.set(0, 80, 0);
    scene.add(atmoLight);
    window._atmoLight = atmoLight;

    explosionLight = new THREE.PointLight(0xff6600, 0, 600); scene.add(explosionLight);

    weather.init(sun, hemiLight);
    
    const muzzleLight = new THREE.PointLight(0xffaa00, 0, 150);
    scene.add(muzzleLight);
    window._muzzleLight = muzzleLight;

    createWorld();
    spawnTrees(); spawnBunkers(); // Menü-Hintergrund
    setupFX();
    initVisualEnhancements();
    TacFeed.init();
    LightingDirector.init();
    Cam.init();
    clock = new THREE.Clock();

    window.missileRenderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('missile-canvas'),
        antialias: false,
        alpha: false
    });
    window.missileRenderer.setPixelRatio(1);
    window.missileRenderer.setSize(320, 200);
    window.missileRenderer.setClearColor(0x0a0d0a, 1);

    window.missileCamera = new THREE.PerspectiveCamera(62, 320 / 200, 1, 8000);
    window.missileCamera.position.set(0, 200, 300);

    window.addEventListener('pointerdown', e => { 
        if(e.target.closest('.glass-panel') || e.target.closest('button')) return;
        
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        if (gameState === 'SELECT') {
            if (isSinglePlayer && currentPlayer === 1) return;
            const intersects = raycaster.intersectObjects(scene.children, true);
            for(let hit of intersects) {
                let foundObj = hit.object;
                while(foundObj.parent && foundObj.parent !== scene) foundObj = foundObj.parent;
                
                let foundTank = false;
                for(let i=0; i<TANKS_PER_PLAYER; i++) {
                    if (teams[currentPlayer][i].mesh === foundObj && teams[currentPlayer][i].alive) {
                        activeTankIdx[currentPlayer] = i; syncUIToTank(); updateUI();
                        Audio.play('select'); foundTank = true; break;
                    }
                }
                if(foundTank) return;
            }
        } else if (gameState === 'PLAY') {
            if (isSinglePlayer && currentPlayer === 1) return; 
            const activeT = teams[currentPlayer][activeTankIdx[currentPlayer]];
            const intersects = raycaster.intersectObject(activeT.mesh, true);
            if(intersects.length > 0) {
                isAiming = true; lastAimPointer = {x: e.clientX, y: e.clientY};
                return;
            }
        }
        isPointerDown = true; lastAimPointer = {x: e.clientX, y: e.clientY}; 
    });

    window.addEventListener('pointerup', () => { isPointerDown = false; isAiming = false; });

    window.addEventListener('pointermove', e => {
        if (isAiming && gameState === 'PLAY') {
            if (isSinglePlayer && currentPlayer === 1) return;
            const dx = e.clientX - lastAimPointer.x; const dy = e.clientY - lastAimPointer.y;
            const t = teams[currentPlayer][activeTankIdx[currentPlayer]];
            t.settings.rot = Math.max(-180, Math.min(180, t.settings.rot - dx * 0.5));
            t.settings.ang = Math.max(0, Math.min(85, t.settings.ang + dy * 0.5));
            syncUIToTank(); lastAimPointer = {x: e.clientX, y: e.clientY};
            Cam.onManualInput();
            return;
        }

        if(isPointerDown) {
            const dx = e.clientX - lastAimPointer.x;
            const dy = e.clientY - lastAimPointer.y;
            camOrbit.theta -= dx * 0.008;
            camOrbit.phi    = Math.max(0.08, Math.min(Math.PI / 2.05, camOrbit.phi + dy * 0.008));
            Cam.onManualInput();
            lastAimPointer = {x: e.clientX, y: e.clientY};
        }
        if (gameState === 'PLAY' && !apUsedMove && apRemaining >= 1) {
            const k2 = e.key ? e.key.toLowerCase() : '';
            if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k2)) {
                spendAP('move');
            }
        }
    });

    window.addEventListener('wheel', e => { 
        if (isAiming && gameState === 'PLAY') {
            if (isSinglePlayer && currentPlayer === 1) return;
            const t = teams[currentPlayer][activeTankIdx[currentPlayer]];
            t.settings.pow = Math.max(10, Math.min(150, t.settings.pow - e.deltaY * 0.05));
            syncUIToTank(); return;
        }
        camOrbit.dist = Math.max(50, Math.min(500, camOrbit.dist + e.deltaY * 0.15));
        Cam.onManualInput(); 
    });

    window.addEventListener('resize', () => { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    window.addEventListener('keydown', e => {
        const k = e.key.toLowerCase(); keys[k] = true;
        if (e.key === 'Enter') {
            if (isSinglePlayer && currentPlayer === 1) return;
            if (gameState === 'SELECT') document.getElementById('btn-confirm').click();
            else if (gameState === 'PLAY') fire();
        }
        if (gameState === 'SELECT') {
            if (isSinglePlayer && currentPlayer === 1) return;
            if (k === 'arrowright' || k === 'd') cycleTank(1);
            if (k === 'arrowleft' || k === 'a') cycleTank(-1);
        }
    });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    document.getElementById('btn-1p').onclick = () => {
        document.getElementById('menu-opts').style.display = 'none';
        document.getElementById('ai-opts').style.display = 'block';
        Audio.play('click');
    };
    document.getElementById('btn-2p').onclick = () => {
        isSinglePlayer = false;
        Audio.init(); startGame();
    };

    document.getElementById('btn-rules').onclick = () => {
        Audio.play('click');
        document.getElementById('rules-modal').classList.add('visible');
    };
    document.getElementById('btn-rules-close').onclick = () => {
        Audio.play('click');
        document.getElementById('rules-modal').classList.remove('visible');
    };
    document.getElementById('rules-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('rules-modal')) {
            Audio.play('click');
            document.getElementById('rules-modal').classList.remove('visible');
        }
    });
    window.showMenuOpts = () => {
        document.getElementById('ai-opts').style.display = 'none';
        document.getElementById('menu-opts').style.display = 'block';
        Audio.play('click');
    };
    window.startGameMode = (diff) => {
        isSinglePlayer = true; aiDifficulty = diff;
        Audio.init(); startGame();
    };

    document.getElementById('fire-btn').onclick = () => {
        if (isSinglePlayer && currentPlayer === 1) return;
        fire();
    };
    document.getElementById('shield-btn').onclick = () => {
        if (isSinglePlayer && currentPlayer === 1) return;
        deployShield();
    };
    document.getElementById('btn-next').onclick = () => cycleTank(1);
    document.getElementById('btn-prev').onclick = () => cycleTank(-1);
    document.getElementById('btn-confirm').onclick = () => {
        if(isSinglePlayer && currentPlayer === 1) return;
        Audio.play('confirm');
        document.getElementById('select-overlay').classList.remove('active');
        document.getElementById('ammo-selector').classList.remove('visible');
        selectionMarker.visible = false;
        initAP();
        document.getElementById('ap-display').classList.add('visible');
        const selT = teams[currentPlayer][activeTankIdx[currentPlayer]];
        if(selT && Cam.anchor) Cam.anchor.copy(selT.mesh.position.clone().add(new THREE.Vector3(0,5,0)));
        gameState = 'PLAY';
    };

    const moveState = { f:0, r:0 };
    const setupMove = (id, f, r) => {
        const b = document.getElementById(id);
        const start = (e) => { 
            e.preventDefault(); 
            if((gameState==='PLAY' || gameState === 'HIDE') && !(isSinglePlayer && currentPlayer === 1)) {
                if (gameState === 'PLAY' && !apUsedMove && apRemaining < 1) {
                    showMessage("KEINE AKTIONSPUNKTE!", "#ffaa00"); return;
                }
                if (gameState === 'PLAY' && !apUsedMove) { spendAP('move'); }
                moveState.f = f; moveState.r = r; 
            }
        };
        const end = (e) => { e.preventDefault(); moveState.f = 0; moveState.r = 0; };
        b.addEventListener('pointerdown', start); window.addEventListener('pointerup', end); 
    };
    setupMove('m-up', 1, 0); setupMove('m-down', -1, 0); setupMove('m-left', 0, 1); setupMove('m-right', 0, -1);
    
    ['rot', 'ang', 'pow'].forEach(id => {
        const s = document.getElementById('i-'+id);
        s.addEventListener('input', e => { 
            if (isSinglePlayer && currentPlayer === 1) return; 
            const t = teams[currentPlayer][activeTankIdx[currentPlayer]];
            if(t) t.settings[id] = parseFloat(e.target.value);
            syncUIToTank();
            Cam.onManualInput();
        });
    });
    window.moveState = moveState; animate();
}

function updateShieldButton() {
    const btn = document.getElementById('shield-btn');
    btn.innerHTML = `SCHILD<br>[${shieldsRemaining[currentPlayer]}]`;
    if(shieldsRemaining[currentPlayer] <= 0) {
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        btn.style.filter = 'grayscale(100%)';
    } else {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.filter = 'none';
    }
}

function initAP() {
    apRemaining = MAX_AP;
    apUsedMove = false;
    apUsedFire = false;
    renderAP();
}

function renderAP() {
    const pips = ['ap-1', 'ap-2', 'ap-3'];
    pips.forEach((id, i) => {
        const el = document.getElementById(id);
        el.className = 'ap-pip';
        if (i >= apRemaining) {
            el.classList.add('used');
        } else if (apUsedMove && i === 0) {
            el.classList.add('move-pip');
        } else if (apUsedFire) {
            el.classList.add('fire-pip');
        } else {
            el.classList.add('move-pip');
        }
    });
    const hint = document.getElementById('ap-hint');
    if (apRemaining === 0) hint.textContent = 'KEINE AP — WARTEN';
    else if (!apUsedMove && !apUsedFire) hint.textContent = 'BEWEGEN+FEUERN';
    else if (apUsedMove && !apUsedFire) hint.textContent = 'NOCH: FEUERN';
    else if (!apUsedMove && apUsedFire) hint.textContent = 'NOCH: BEWEGEN';
    else hint.textContent = 'FERTIG';
}

function spendAP(type) {
    const cost = type === 'move' ? 1 : 2;
    if (apRemaining < cost) return false;
    apRemaining -= cost;
    if (type === 'move') apUsedMove = true;
    if (type === 'fire') apUsedFire = true;
    renderAP();
    return true;
}

function buildAmmoSelector() {
    const container = document.getElementById('ammo-selector');
    container.innerHTML = '';
    const inv = ammoInventory[currentPlayer] || {};
    Object.entries(AMMO_TYPES).forEach(([key, ammo]) => {
        const count = key === 'standard' ? '∞' : (inv[key] || 0);
        if (count === 0 && key !== 'standard') return;
        const btn = document.createElement('div');
        btn.className = 'ammo-btn' + (key === selectedAmmo ? ' selected' : '');
        btn.dataset.ammo = key;
        const countSpan = '<span class="ammo-count">' + count + '</span>';
        const nameSpan = '<span class="ammo-name">' + ammo.name + '</span>';
        const descSpan = '<span class="ammo-desc">' + ammo.desc + '</span>';
        btn.innerHTML = '<span class="ammo-icon">' + ammo.icon + '</span>' +
            '<div class="ammo-info">' + nameSpan + descSpan + '</div>' + countSpan;
        btn.addEventListener('click', () => selectAmmo(key));
        container.appendChild(btn);
    });
}

function selectAmmo(key) {
    if (key !== 'standard' && ((ammoInventory[currentPlayer] || {})[key] || 0) <= 0) return;
    selectedAmmo = key;
    buildAmmoSelector();
    Audio.play('select');
}

function initAmmoInventory() {
    const cfg = diffCfg();
    // Getrennte Vorräte: Index 0 = Spieler/Team Blau, Index 1 = KI/Team Rot
    ammoInventory = [
        Object.assign({}, cfg.playerAmmo),
        Object.assign({}, isSinglePlayer ? cfg.aiAmmo : cfg.playerAmmo)
    ];
    selectedAmmo = 'standard';
}

function showStatsScreen(winner) {
    const screen = document.getElementById('stats-screen');
    const title = document.getElementById('stats-winner-title');
    const mvp = document.getElementById('stats-mvp');
    const grid = document.getElementById('stats-grid');

    const p1Col = '#00f0ff', p2Col = '#ff2d55';
    const winnerColor = winner === 0 ? p1Col : p2Col;
    const winnerName = winner === 0 ? 'Spieler' : 'KI';
    title.textContent = winnerName + ' SIEGT';
    title.style.color = winnerColor;

    const s0 = gameStats[0], s1 = gameStats[1];
    const mvpTeam = s0.totalDamage >= s1.totalDamage ? 'Spieler' : 'KI';
    const mvpCol = s0.totalDamage >= s1.totalDamage ? p1Col : p2Col;
    const acc0 = s0.shotsFired > 0 ? Math.round(s0.shotsHit / s0.shotsFired * 100) : 0;
    const acc1 = s1.shotsFired > 0 ? Math.round(s1.shotsHit / s1.shotsFired * 100) : 0;
    mvp.innerHTML = '&#9733; MVP &mdash; <span style="color:' + mvpCol + '">' + mvpTeam + '</span> &mdash; Meistschaden';

    function row(label, val, col) {
        return '<div class="stats-row"><span class="stats-row-label">' + label + '</span>' +
               '<span class="stats-row-val" style="color:' + col + '">' + val + '</span></div>';
    }
    grid.innerHTML =
        '<div class="stats-col">' +
        '<div class="stats-col-title" style="color:' + p1Col + '">' + (isSinglePlayer ? 'Spieler' : 'Spieler 1') + '</div>' +
        row('Sch\u00fcsse abgefeuert', s0.shotsFired, p1Col) +
        row('Treffer', s0.shotsHit, p1Col) +
        row('Trefferquote', acc0 + '%', p1Col) +
        row('Gesamtschaden', s0.totalDamage, p1Col) +
        row('Zerst\u00f6rte Feinde', s0.tanksDestroyed, p1Col) +
        row('CP-Runden gehalten', s0.cpTurns, p1Col) +
        '</div>' +
        '<div class="stats-col">' +
        '<div class="stats-col-title" style="color:' + p2Col + '">' + (isSinglePlayer ? 'KI' : 'Spieler 2') + '</div>' +
        row('Sch\u00fcsse abgefeuert', s1.shotsFired, p2Col) +
        row('Treffer', s1.shotsHit, p2Col) +
        row('Trefferquote', acc1 + '%', p2Col) +
        row('Gesamtschaden', s1.totalDamage, p2Col) +
        row('Zerst\u00f6rte Feinde', s1.tanksDestroyed, p2Col) +
        row('CP-Runden gehalten', s1.cpTurns, p2Col) +
        '</div>';

    screen.classList.add('visible'); Audio.play('victory');
}

function startGame() {
    const cfg = diffCfg();
    if(Audio.ctx) Audio.setAmbient(1.0);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    teams.flat().forEach(t => { scene.remove(t.mesh); if(t.hpEl) t.hpEl.remove(); });
    physicalDebris.forEach(d => scene.remove(d.mesh)); physicalDebris = [];
    blastAreas.forEach(b => scene.remove(b.mesh)); blastAreas = [];
    shields.forEach(s => scene.remove(s.mesh)); shields = [];
    shieldsRemaining = [2, isSinglePlayer ? cfg.aiShields : 2];

    trees.forEach(t => scene.remove(t.mesh)); trees = [];
    bunkers.forEach(b => scene.remove(b.mesh)); bunkers = [];
    smokeScreens.forEach(s => { scene.remove(s.mesh); clearTimeout(s.timer); }); smokeScreens = [];

    gameStats = [
        { shotsFired: 0, shotsHit: 0, totalDamage: 0, tanksDestroyed: 0, cpTurns: 0, ammoUsed: {} },
        { shotsFired: 0, shotsHit: 0, totalDamage: 0, tanksDestroyed: 0, cpTurns: 0, ammoUsed: {} }
    ];
    cpScores = [0, 0];
    aiRoles = {}; aiLastActive = -1; aiTurnQueue = []; aiCurrentQueueIdx = 0;

    // Nebel des Krieges & Anzeige pro Schwierigkeit
    fogOfWarEnabled = isSinglePlayer && cfg.fowEnabled;
    const fogInd = document.getElementById('fog-indicator');
    if(isSinglePlayer) {
        fogInd.style.display = 'block';
        fogInd.textContent = (cfg.fowEnabled ? '🌫️ NEBEL DES KRIEGES' : '☀️ VOLLE SICHT') + ' · KI: ' + cfg.name;
    } else {
        fogInd.style.display = 'none';
    }

    // Welt pro Schwierigkeit neu generieren (Größe, Terrain, Dichte, CPs)
    createWorld(cfg);
    spawnTrees(cfg.treeCount); spawnBunkers(cfg.bunkerCount); spawnControlPoints();
    initAmmoInventory();
    buildNavigationGrid(currentPlayer);

    teams = [[], []];

    for(let p=0; p<2; p++) {
        const container = document.getElementById(`p${p+1}-tanks`); container.innerHTML = '';
        for(let i=0; i<TANKS_PER_PLAYER; i++) {
            teams[p].push(createTank(p, i));
            const dot = document.createElement('div'); dot.className = `tank-dot p${p+1}-dot`; dot.id = `dot-p${p}-t${i}`; container.appendChild(dot);
        }
    }
    currentPlayer = 0; activeTankIdx = [0, 0]; gameState = 'TRANSITION';
    assignAIRoles();
    assignPlayerRoles();
    updateRoleIcons();
    setTimeout(announceTurn, 500);
}

function showMessage(text, color) {
    const msg = document.getElementById('msg-center');
    msg.innerText = text; msg.style.color = color;
    msg.style.opacity = 1; msg.style.transform = 'scale(1)';
    setTimeout(() => { msg.style.opacity = 0; msg.style.transform = 'scale(0.8)'; }, 2000);
}

function endTurnSequence() {
    document.getElementById('ap-display').classList.remove('visible');
    if(teams[0].every(t => !t.alive)) {
        showMessage("KI SIEGT!", "#ff2d55");
        setTimeout(() => showStatsScreen(1), 2000); return;
    }
    if(teams[1].every(t => !t.alive)) {
        showMessage("Spieler SIEGT!", "#00f0ff");
        setTimeout(() => showStatsScreen(0), 2000); return;
    }

    Cam.userOrbit = false;
    gameState = 'HIDE'; fuel = 55; document.getElementById('fuel-fill').style.width = '55%';

    if(!isSinglePlayer || currentPlayer === 0) {
        showMessage("⚡ FEUER! Jetzt Deckung suchen!", "#ffff00");
        const hideBanner = document.getElementById('turn-banner');
        const tbTeam2 = document.getElementById('tb-team');
        const tbScore2 = document.getElementById('tb-score');
        tbTeam2.textContent = "DECKUNG SUCHEN!";
        tbTeam2.style.color = "#ffff00";
        tbScore2.textContent = "Du kannst deinen Tank noch kurz bewegen!";
        hideBanner.style.display = 'block';
        hideBanner.style.animation = 'none';
        void hideBanner.offsetWidth;
        hideBanner.style.animation = 'banner-reveal 2.5s forwards ease-in-out';
        setTimeout(() => { hideBanner.style.display = 'none'; }, 2500);
    } else {
        const hideTips = [
            "KI POSITIONIERT…", "KI SUCHT DECKUNG…", "KI MANÖVRIERT…"
        ];
        showMessage(hideTips[Math.floor(Math.random() * hideTips.length)], "#ffaa00");
    }
    document.body.classList.remove('ui-hidden');

    const hidingPlayer = currentPlayer;
    if(isSinglePlayer && hidingPlayer === 0) {
        // Human just finished
    } else if(isSinglePlayer && hidingPlayer === 1) {
        setTimeout(() => { aiHideReposition(); }, 800);
    }

    setTimeout(() => {
        currentPlayer = 1 - currentPlayer;
        // Die KI bekommt auf großen Karten mehr Treibstoff (Mobilitätsausgleich)
        fuel = (isSinglePlayer && currentPlayer === 1) ? diffCfg().fuelTurn : 100;
        document.getElementById('fuel-fill').style.width = Math.min(100, fuel) + '%';
        announceTurn();
    }, 6000);
}

function announceTurn() {
    gameState = 'TURN_ANNOUNCEMENT';
    const banner = document.getElementById('turn-banner');
    const tbTeam = document.getElementById('tb-team');
    const tbScore = document.getElementById('tb-score');
    
    for (let i = shields.length - 1; i >= 0; i--) {
        let s = shields[i];
        if (s.team === currentPlayer) {
            s.age++;
            if (s.age >= 5) {
                scene.remove(s.mesh);
                shields.splice(i, 1);
            } else {
                let scale = 1 - (0.1 * s.age);
                s.currentRadius = s.initialRadius * scale;
                s.mesh.scale.set(s.initialRadius * scale, s.initialRadius * scale, s.initialRadius * scale);
            }
        }
    }

    updateControlPoints();
    cpResupply(currentPlayer);
    document.getElementById('cp-score').classList.add('visible');
    document.getElementById('cp-status').classList.add('visible');

    const winThresh = window._cpWinThreshold || CP_POINTS_TO_WIN;
    if (cpScores[0] >= winThresh || cpScores[1] >= winThresh) {
        const cpWinner = cpScores[0] >= winThresh ? 0 : 1;
        showStatsScreen(cpWinner);
        return;
    }

    const pCol = currentPlayer === 0 ? "var(--p1-color)" : "var(--p2-color)";
    let teamName = isSinglePlayer ? (currentPlayer === 0 ? "Spieler" : "KI") : (currentPlayer === 0 ? "Spieler 1" : "Spieler 2");
    
    const p1Alive = teams[0].filter(t => t.alive).length;
    const p2Alive = teams[1].filter(t => t.alive).length;

    tbTeam.innerText = `${teamName} IST AM ZUG`;
    tbTeam.style.color = pCol;
    tbScore.innerHTML = `<span style="color:var(--p1-color)">BLUE: ${p1Alive}</span> &nbsp;|&nbsp; <span style="color:var(--p2-color)">RED: ${p2Alive}</span>`;
    
    banner.style.display = 'block';
    banner.style.animation = 'none';
    void banner.offsetWidth; 
    banner.style.animation = 'banner-reveal 3s forwards ease-in-out';
    Audio.play('turnAnnounce');
    Cam.onNewTurn();

    setTimeout(() => {
        banner.style.display = 'none';
        startSelectionPhase();
    }, 2500);
}

function startSelectionPhase() {
    killsThisTurn = 0;
    gameState = 'SELECT'; document.body.classList.remove('ui-hidden');
    trajectoryPoints.visible = false; impactMarker.visible = false;
    while(!teams[currentPlayer][activeTankIdx[currentPlayer]].alive) { activeTankIdx[currentPlayer] = (activeTankIdx[currentPlayer] + 1) % TANKS_PER_PLAYER; }
    
    const pCol = currentPlayer === 0 ? "var(--p1-color)" : "var(--p2-color)";
    document.getElementById('btn-confirm').style.backgroundColor = pCol;
    impactMarker.material.color.set(currentPlayer === 0 ? 0x00e5ff : 0xff0055); 
    
    document.getElementById('select-overlay').classList.add('active');
    selectionMarker.visible = true; selectionMarker.material.color.set(currentPlayer === 0 ? 0x00e5ff : 0xff0055);
    
    if (!(isSinglePlayer && currentPlayer === 1)) {
        document.getElementById('ammo-selector').classList.add('visible');
        buildAmmoSelector();
    }

    updateShieldButton();
    syncUIToTank(); updateUI();

    if (isSinglePlayer && currentPlayer === 1) {
        document.getElementById('dashboard').style.opacity = '0.5';
        document.getElementById('dashboard').style.pointerEvents = 'none';
        document.getElementById('select-overlay').classList.remove('active');
        setTimeout(startAIDrive, 800); 
    } else {
        document.getElementById('dashboard').style.opacity = '1';
        document.getElementById('dashboard').style.pointerEvents = 'auto';
    }
}

function cycleTank(dir) {
    if(gameState !== 'SELECT') return; Audio.play('select');
    let idx = activeTankIdx[currentPlayer]; let found = false;
    for(let i=0; i<TANKS_PER_PLAYER; i++) {
        idx = (idx + dir + TANKS_PER_PLAYER) % TANKS_PER_PLAYER;
        if(teams[currentPlayer][idx].alive) { activeTankIdx[currentPlayer] = idx; found = true; break; }
    }
    if(found) {
        syncUIToTank(); updateUI();
        const newT = teams[currentPlayer][activeTankIdx[currentPlayer]];
        if(newT && newT.alive && Cam.smoothAnchor) {
            const p = newT.mesh.position.clone(); p.y += 5;
            Cam.smoothAnchor.copy(p);
        }
    }
}

function syncUIToTank() {
    const t = teams[currentPlayer][activeTankIdx[currentPlayer]]; if(!t) return;
    document.getElementById('i-rot').value = Math.round(t.settings.rot); document.getElementById('i-ang').value = Math.round(t.settings.ang); document.getElementById('i-pow').value = Math.round(t.settings.pow);
    [['v-rot', Math.round(t.settings.rot) + '°'], ['v-ang', Math.round(t.settings.ang) + '°'], ['v-pow', Math.round(t.settings.pow) + '%']].forEach(([id, txt]) => {
        const el = document.getElementById(id);
        if(el.innerText !== txt) {
            el.innerText = txt;
            el.classList.remove('changed'); void el.offsetWidth; el.classList.add('changed');
        }
    });
    document.documentElement.style.setProperty('--p1-color', currentPlayer === 0 ? '#00e5ff' : '#ff0055'); 
    t.turret.rotation.y = -t.settings.rot * Math.PI/180; t.barrelJoint.rotation.x = -t.settings.ang * Math.PI/180;
}

function updateUI() {
    for(let p=0; p<2; p++) {
        for(let i=0; i<TANKS_PER_PLAYER; i++) {
            const dot = document.getElementById(`dot-p${p}-t${i}`); dot.className = `tank-dot p${p+1}-dot`;
            if(!teams[p][i].alive) dot.classList.add('dead-dot'); else if(p === currentPlayer && i === activeTankIdx[p]) dot.classList.add('active-dot');
        }
    }
}

function fire() {
    if(gameState !== 'PLAY') return;
    if (!spendAP('fire')) { showMessage("KEINE AKTIONSPUNKTE!", "#ffaa00"); Audio.play('error'); return; }
    if(apRemaining === 1) Audio.play('lowAP');
    
    Audio.play('shoot');
    document.body.classList.add('ui-hidden');
    document.getElementById('ap-display').classList.remove('visible');
    trajectoryPoints.visible = false; impactMarker.visible = false;
    gameState = 'FLY';

    gameStats[currentPlayer].shotsFired++;
    if (selectedAmmo !== 'standard') {
        const inv = ammoInventory[currentPlayer];
        inv[selectedAmmo] = Math.max(0, (inv[selectedAmmo] || 0) - 1);
    }

    const ammo = AMMO_TYPES[selectedAmmo];
    const t = teams[currentPlayer][activeTankIdx[currentPlayer]];
    // Mündungsfeuer verrät die Position: KI-Panzer wird im FOW kurz enttarnt
    if (isSinglePlayer && currentPlayer === 1) t.revealedUntil = performance.now() + 7000;
    if(t && t.barrelJoint) {
        const tipPos = new THREE.Vector3(0,0,9).applyMatrix4(t.barrelJoint.matrixWorld);
        const barrelDir = new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(t.barrelJoint.matrixWorld)).normalize();
        fxMuzzleFlash(tipPos, barrelDir);
    }
    const tip = new THREE.Vector3(0,0,9).applyMatrix4(t.barrelJoint.matrixWorld);
    const dir = new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(t.barrelJoint.matrixWorld)).normalize();

    const sparkColor = ammo.trailColor;
    for(let i=0; i<15; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2), new THREE.MeshBasicMaterial({color: sparkColor}));
        p.position.copy(tip);
        const spread = new THREE.Vector3((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15);
        p.userData = { velocity: dir.clone().multiplyScalar(40).add(spread), life: 0.15, type: 'spark' };
        scene.add(p); particles.push(p);
    }

    if(!projectile) { projectile = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({color: ammo.color})); scene.add(projectile); }
    projectile.material.color.setHex(ammo.color);
    projectileLight.color.setHex(ammo.trailColor);

    projectile.position.copy(tip);
    projectileVel = dir.multiplyScalar(t.settings.pow * 1.5 * ammo.speedMult);
    projectile.userData = { shooterPos: t.mesh.position.clone(), ammoType: selectedAmmo, shooter: t };
    projectile.visible = true; projectileLight.visible = true;

    {
        const arcImpact = simulateShot(tip, dir.clone().normalize(), t.settings.pow, ammo.speedMult);
        if(arcImpact) {
            Cam.shotArcImpact = arcImpact.clone();
            Cam.shotArcDist   = tip.distanceTo(arcImpact);
            Cam.shotArcMid    = tip.clone().add(arcImpact).multiplyScalar(0.5);
            const neededDist = Math.min(500, Math.max(Cam.shotArcDist * 0.72, 150));
            const neededPhi  = Math.max(0.45, Math.min(0.75, 0.45 + Cam.shotArcDist * 0.0005));
            const arcCenter  = tip.clone().add(arcImpact).multiplyScalar(0.5);
            arcCenter.y += Cam.shotArcDist * 0.08;
            let snapTheta = camOrbit.theta;
            const shotDir2 = arcImpact.clone().sub(tip); shotDir2.y=0;
            if(shotDir2.length()>10) snapTheta = Math.atan2(-shotDir2.x,-shotDir2.z)+Math.PI;
            if(Cam.anchor) Cam.snapTo(arcCenter, neededDist, neededPhi, snapTheta);
        }
    }
    setTimeout(() => Audio.play('reload'), 600);
    if (selectedAmmo !== 'standard') selectedAmmo = 'standard';
}

function deployShield() {
    if(gameState !== 'PLAY' || shieldsRemaining[currentPlayer] <= 0) return;
    if (!spendAP('fire')) { showMessage("KEINE AKTIONSPUNKTE!", "#ffaa00"); Audio.play('error'); return; }
    if(apRemaining === 1) Audio.play('lowAP');
    shieldsRemaining[currentPlayer]--;
    updateShieldButton();

    Audio.play('shieldDeploy');
    document.body.classList.add('ui-hidden');
    trajectoryPoints.visible = false; impactMarker.visible = false;
    
    const t = teams[currentPlayer][activeTankIdx[currentPlayer]];
    const radius = 67.5;
    
    const geo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const color = currentPlayer === 0 ? 0x00e5ff : 0xff0055;
    
    const mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.25, 
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(radius, radius, radius);
    mesh.position.copy(t.mesh.position);
    mesh.position.y = getH(mesh.position.x, mesh.position.z);
    
    const wireMat = new THREE.MeshBasicMaterial({color: color, wireframe: true, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending});
    const wireMesh = new THREE.Mesh(geo, wireMat);
    mesh.add(wireMesh);
    
    scene.add(mesh);
    shields.push({ mesh, team: currentPlayer, pos: mesh.position.clone(), initialRadius: radius, currentRadius: radius, age: 0 });
    
    showMessage("SCHILD AKTIVIERT!", color === 0x00e5ff ? "#00e5ff" : "#ff0055");
    
    gameState = 'FLY'; 
    setTimeout(() => {
        endTurnSequence();
    }, 2000);
}

function handleExplosion(pos, shooterPos) {
    const ammoType = (projectile && projectile.userData.ammoType) || 'standard';
    const ammo = AMMO_TYPES[ammoType];
    projectileLight.visible = false;

    if (ammoType === 'smoke') {
        const smokeGroup = new THREE.Group();
        for (let i = 0; i < 18; i++) {
            const sg = new THREE.Mesh(
                new THREE.DodecahedronGeometry(12 + Math.random()*10, 0),
                new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.55 + Math.random()*0.2 })
            );
            sg.position.set((Math.random()-0.5)*50, i*4, (Math.random()-0.5)*50);
            smokeGroup.add(sg);
        }
        smokeGroup.position.copy(pos);
        scene.add(smokeGroup);
        const timer = setTimeout(() => { scene.remove(smokeGroup); smokeScreens = smokeScreens.filter(s => s.mesh !== smokeGroup); }, 10000);
        smokeScreens.push({ mesh: smokeGroup, pos: pos.clone(), radius: 60, timer });
        showMessage("RAUCHSCHLEIER!", "#99bbcc"); Audio.play('smokeDeployFX');
        endTurnSequence(); return;
    }

    Audio.playExplosion((projectile&&projectile.userData.ammoType)||'standard'); createExplosion(pos); fxShrapnel(pos); fxCraterDust(pos);
    
    const MAX_DIST = 140 * ammo.splashMult; 
    const OFFSET = 25;    
    const SPREAD = 12;    
    let killOccurred = false;
    let anyHit = false;

    let blastDir = new THREE.Vector3(0,0,1);
    let hasDir = false;
    if (shooterPos) {
        blastDir = pos.clone().sub(shooterPos).setY(0).normalize();
        if (blastDir.lengthSq() > 0.1) hasDir = true;
    }

    if (hasDir) {
        const shape = new THREE.Shape();
        shape.moveTo(0, -OFFSET);
        for(let y = -OFFSET; y <= MAX_DIST; y += 5) shape.lineTo(Math.sqrt(Math.max(0, y + OFFSET)) * SPREAD, y);
        for(let y = MAX_DIST; y >= -OFFSET; y -= 5) shape.lineTo(-Math.sqrt(Math.max(0, y + OFFSET)) * SPREAD, y);
        shape.lineTo(0, -OFFSET);
        
        const bGeo = new THREE.ShapeGeometry(shape);
        bGeo.rotateX(-Math.PI/2); 

        const bMat = new THREE.MeshBasicMaterial({
            color: 0xff5500, 
            transparent: true, 
            opacity: 0.6, 
            depthWrite: false, 
            depthTest: false, 
            blending: THREE.AdditiveBlending, 
            side: THREE.DoubleSide
        });
        
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.copy(pos);
        bMesh.renderOrder = 999; 
        
        bMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), blastDir);
        scene.add(bMesh);
        blastAreas.push({ mesh: bMesh, life: 1.0 });
    }

    let blastRight = new THREE.Vector3(blastDir.z, 0, -blastDir.x);

    teams.flat().forEach(t => {
        if(!t.alive) return;
        
        let vec = t.mesh.position.clone().sub(pos).setY(0);
        let dist = vec.length();
        let isHit = false;

        if (hasDir) {
            let fwdDist = vec.dot(blastDir); 
            let sideDist = vec.dot(blastRight); 
            
            let maxSide = Math.sqrt(Math.max(0, fwdDist + OFFSET)) * SPREAD + 10; 
            if (fwdDist > -OFFSET && fwdDist < MAX_DIST && Math.abs(sideDist) < maxSide) {
                isHit = true;
            }
        } else {
            if (dist < MAX_DIST) isHit = true; 
        }

        if(isHit) {
            let protectedByShield = false;
            for (let s of shields) {
                if (s.team === t.team && t.mesh.position.distanceTo(s.pos) <= s.currentRadius) {
                    if (pos.distanceTo(s.pos) > s.currentRadius - 5) {
                        protectedByShield = true;
                        break;
                    }
                }
            }

            if (!protectedByShield) {
                const baseDmg = Math.floor(Math.max(0, 1 - (dist / Math.max(MAX_DIST, 1))) * 120);
                const isFriendly = t.team === currentPlayer;
                const friendlyMult = isFriendly ? 0.15 : 1.0;
                const shooterH = shooterPos ? getH(shooterPos.x, shooterPos.z) : 0;
                const targetH  = getH(t.mesh.position.x, t.mesh.position.z);
                const heightDiff = Math.max(-15, Math.min(20, shooterH - targetH));
                const terrainMult = 1.0 + heightDiff * 0.015;
                const damage = Math.floor(baseDmg * ammo.dmgMult * friendlyMult * terrainMult);
                if (damage > 0) {
                    t.hp -= damage;
                    anyHit = true;
                    gameStats[currentPlayer].totalDamage += damage;
                    let isDestroyed = t.hp <= 0;
                    
                    if(!isDestroyed) Audio.play('tankHit');
                    spawnDamageText(t.mesh.position, damage, isDestroyed || damage >= 100);
                    TacFeed.hit(damage, t.team === 0, isDestroyed);
                    
                    const fill = t.hpEl.querySelector('.hp-fill'); fill.style.width = Math.max(0, Math.min(100, t.hp / (t.maxHP || 100) * 100)) + '%';
                    if(t.hp < 30) fill.style.background = '#ff0055'; else if(t.hp < 60) fill.style.background = '#ffaa00';
                    
                    if(isDestroyed) {
                        shatterTank(t); Audio.play('tankDestroyed');
                        if(t.team !== currentPlayer) {
                            killOccurred = true;
                            gameStats[currentPlayer].tanksDestroyed++;
                            killsThisTurn++;
                            if(killsThisTurn >= 2) {
                                apRemaining = Math.min(MAX_AP, apRemaining + 1);
                                TacFeed.log('⚡ KETTENBONUS! +1 AP', 'adapt');
                                showMessage('KETTENBONUS! +1 AP', '#ffff00');
                                Audio.play('chainBonus');
                            }
                        }
                    }
                }
            }
        }
    });

    if(killOccurred) Audio.play('killFanfare');
    else if(!anyHit) Audio.play('ricochet');
    if(anyHit) gameStats[currentPlayer].shotsHit++;

    trees.forEach(t => {
        if(!t.alive) return;
        let vec = t.mesh.position.clone().sub(pos).setY(0);
        let dist = vec.length();
        if (hasDir) {
            let fwdDist = vec.dot(blastDir);
            let sideDist = vec.dot(blastRight);
            if (fwdDist > -OFFSET && fwdDist < 80 && Math.abs(sideDist) < Math.sqrt(Math.max(0, fwdDist + OFFSET)) * SPREAD + 10) {
                t.hp -= Math.floor(Math.max(0, 80-dist) * 1.5);
                if(t.hp < 30) t.leaves.forEach(l => l.material.color.setHex(0x111111)); 
                if(t.hp <= 0) shatterProp(t, false);
            }
        }
    });

    bunkers.forEach(b => {
        if(!b.alive) return;
        let vec = b.mesh.position.clone().sub(pos).setY(0);
        let dist = vec.length();
        if (hasDir) {
            let fwdDist = vec.dot(blastDir);
            let sideDist = vec.dot(blastRight);
            if (fwdDist > -OFFSET && fwdDist < 80 && Math.abs(sideDist) < Math.sqrt(Math.max(0, fwdDist + OFFSET)) * SPREAD + 10) {
                b.hp -= Math.floor(Math.max(0, 80-dist) * 2.5);
                if(b.hp <= 0) shatterProp(b, true);
            }
        }
    });

    if(isSinglePlayer && currentPlayer === 1 && aiPostShotMove) {
        setTimeout(doAIPostShotMove, 600);
        return;
    }
    if(isSinglePlayer && currentPlayer === 1 && aiTurnQueue.length > 0 &&
       aiCurrentQueueIdx < aiTurnQueue.length - 1) {
        setTimeout(aiNextTankOrEnd, 800);
        return;
    }

    endTurnSequence();
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if(uniformsWater) uniformsWater.time.value += dt;

    if(gameState !== 'MENU') weather.update(dt);
    LightingDirector.update(dt);
    if(cloudsGroup) {
        cloudsGroup.children.forEach(c => {
            const spd = c.userData.speed || 3;
            const drft = c.userData.drift || 0;
            c.position.x += dt * spd;
            c.position.z += dt * drft;
            if(c.position.x > MAP_SIZE*0.6)  c.position.x = -MAP_SIZE*0.6;
            if(c.position.z >  MAP_SIZE*0.6) c.position.z = -MAP_SIZE*0.6;
            if(c.position.z < -MAP_SIZE*0.6) c.position.z =  MAP_SIZE*0.6;
        });
    }

    teams.flat().forEach(t => {
        if(t.alive && t.hpEl) {
            if (t.team !== currentPlayer && gameState !== 'MENU') {
                t.hpEl.style.opacity = 0;
            } else {
                const pos = t.mesh.position.clone(); pos.y += 12; pos.project(camera);
                if(pos.z < 1) { t.hpEl.style.left = `${(pos.x * .5 + .5) * window.innerWidth}px`; t.hpEl.style.top = `${(pos.y * -.5 + .5) * window.innerHeight}px`; t.hpEl.style.opacity = 1; } 
                else t.hpEl.style.opacity = 0;
            }
        }
    });

    const activeT = teams[currentPlayer][activeTankIdx[currentPlayer]];

    if(gameState === 'SELECT' && activeT) {
        selectionMarker.position.copy(activeT.mesh.position);
        if(Cam.anchor) Cam.anchor.copy(activeT.mesh.position.clone().add(new THREE.Vector3(0,5,0)));
        const activeRole = playerRoles[activeTankIdx[0]];
        if(activeRole) {
            const apHint2 = document.getElementById('ap-hint');
            if(apHint2) apHint2.textContent = ROLE_ICONS[activeRole] + ' ' + ROLE_NAMES_DE[activeRole];
        }
    }

    if((gameState === 'PLAY' || gameState === 'HIDE' || gameState === 'AI_DRIVE') && activeT && activeT.alive) {
        
        let finalF = 0, finalR = 0;

        if (gameState === 'AI_DRIVE') {
            const visionRange = getAIVisionRange();
            const playerTanks = teams[0].filter(t => t.alive);

            let visibleEnemies = playerTanks.filter(t => {
                if(t.mesh.position.distanceTo(activeT.mesh.position) > visionRange) return false;
                for(let sm of smokeScreens) if(t.mesh.position.distanceTo(sm.pos) < sm.radius) return false;
                return true;
            });

            const pathDone = !aiDriveParams.path || aiDriveParams.pathIndex >= aiDriveParams.path.length;
            const shouldStop = pathDone || fuel <= 2 ||
                (aiDriveParams.retryShot && visibleEnemies.length > 0);

            if(shouldStop) {
                gameState = 'PLAY';
                aiDriveParams.active = false;
                activeT.speed = 0; activeT.turnSpeed = 0;

                if(aiDriveParams.retryShot) {
                    aiDriveParams.retryShot = false;
                    spendAP('move');
                    setTimeout(doAITurn, diffCfg().thinkDelay);
                } else if(apUsedFire) {
                    setTimeout(aiNextTankOrEnd, 300);
                } else {
                    spendAP('move');
                    setTimeout(doAITurn, diffCfg().thinkDelay);
                }
            } else {
                let p = aiDriveParams.path;
                let idx = aiDriveParams.pathIndex;

                if(p && idx < p.length) {
                    let nextWP = p[idx];
                    let distToWP = Math.hypot(nextWP.x - activeT.mesh.position.x, nextWP.z - activeT.mesh.position.z);

                    if(distToWP < 22) {
                        aiDriveParams.pathIndex++;
                    } else {
                        let dx2 = nextWP.x - activeT.mesh.position.x;
                        let dz2 = nextWP.z - activeT.mesh.position.z;
                        let desiredAngle = Math.atan2(dx2, dz2);
                        let angleDiff = desiredAngle - activeT.heading;
                        while(angleDiff >  Math.PI) angleDiff -= Math.PI*2;
                        while(angleDiff < -Math.PI) angleDiff += Math.PI*2;

                        finalR = angleDiff > 0.12 ? 1 : (angleDiff < -0.12 ? -1 : 0);
                        finalF = Math.abs(angleDiff) > 0.7 ? 0.4 : 1;

                        const fwd = new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), activeT.heading);
                        let blocked = false;
                        for(let step2 = 1; step2 <= 2; step2++) {
                            let fp = activeT.mesh.position.clone().add(fwd.clone().multiplyScalar(20 * step2));
                            for(let tree of trees)    { if(tree.alive   && tree.mesh.position.distanceTo(fp) < 14) blocked = true; }
                            for(let bunker of bunkers) { if(bunker.alive && bunker.mesh.position.distanceTo(fp) < 26) blocked = true; }
                            if(getH(fp.x, fp.z) < 1.5) blocked = true;
                            for(let s of shields) {
                                if(s.team !== activeT.team && fp.distanceTo(s.pos) <= s.currentRadius + 5) blocked = true;
                            }
                        }
                        if(blocked) {
                            if(aiDriveParams.turnOverride === 0) aiDriveParams.turnOverride = Math.random() > 0.5 ? 1 : -1;
                            finalR = aiDriveParams.turnOverride * 1.5;
                            finalF = 0.4;
                        } else {
                            aiDriveParams.turnOverride = 0;
                        }
                    }
                } else {
                    aiDriveParams.pathIndex = 99999;
                }
            }
        } 
        else if (!(isSinglePlayer && currentPlayer === 1)) {
            if(keys['w'] || keys['arrowup']) finalF = 1; if(keys['s'] || keys['arrowdown']) finalF = -1;
            if(keys['a'] || keys['arrowleft']) finalR = 1; if(keys['d'] || keys['arrowright']) finalR = -1;
            
            if (window.moveState.f !== 0) finalF = window.moveState.f;
            if (window.moveState.r !== 0) finalR = window.moveState.r;
        }

        let inputActive = false;
        if (fuel > 0 && (finalF !== 0 || finalR !== 0)) {
            inputActive = true; if(!Audio.engineRunning) { Audio.setEngineRunning(true); Audio.engineRunning = true; }
            // Kein Abgasrauch für im Nebel versteckte KI-Panzer (würde Position verraten)
            if(activeT && activeT.alive && activeT.mesh.visible) fxEngineSmoke(activeT.mesh.position, 1.0);
            const pRole = playerRoles[activeTankIdx[currentPlayer]] || 'attacker';
            const speedMod = pRole === 'flanker' ? 1.25 : pRole === 'holder' ? 0.85 : 1.0;
            activeT.speed += finalF * 45 * speedMod * dt; activeT.turnSpeed += (finalR * 2.2 - activeT.turnSpeed) * 8 * dt;
            fuel -= 3.75 * dt; document.getElementById('fuel-fill').style.width = Math.min(100, Math.max(0, fuel)) + '%';
        } else {
            if (fuel <= 0 && (finalF !== 0 || finalR !== 0) && Audio.engineRunning) {
                Audio.play('error'); Audio.setEngineRunning(false); Audio.engineRunning = false;
            }
            if(!inputActive && Audio.engineRunning) { Audio.setEngineRunning(false); Audio.engineRunning = false; }
            activeT.speed = 0; activeT.turnSpeed = 0; 
        }

        if(inputActive) {
            Audio.updateEnginePitch(activeT.speed, 30);
            Audio.updateTrackSound(activeT.speed, dt);
            const tankForward = new THREE.Vector3(0,0,1).applyQuaternion(activeT.mesh.quaternion);
            activeT.speed -= tankForward.y * GRAVITY * 0.45 * dt; 
        }

        activeT.speed = Math.max(-15, Math.min(30, activeT.speed));

        if (Math.abs(activeT.speed) > 0 || Math.abs(activeT.turnSpeed) > 0.01) {
            activeT.heading += activeT.turnSpeed * dt;
            const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), activeT.heading);
            const nextPos = activeT.mesh.position.clone().add(dir.multiplyScalar(activeT.speed * dt));
            
            let hitProp = false;
            for(let tree of trees) { if(tree.alive && tree.mesh.position.distanceTo(nextPos) < 6) { hitProp = true; break; } }
            for(let bunker of bunkers) { if(bunker.alive && bunker.mesh.position.distanceTo(nextPos) < 22) { hitProp = true; break; } }
            
            for(let s of shields) {
                if (s.team !== activeT.team) {
                    if (nextPos.distanceTo(s.pos) <= s.currentRadius) {
                        hitProp = true; break;
                    }
                }
            }

            const distFromCenter = Math.sqrt(nextPos.x*nextPos.x + nextPos.z*nextPos.z);
            if(!hitProp && distFromCenter < MAP_SIZE * 0.45 && getH(nextPos.x, nextPos.z) > -0.5) {
                activeT.mesh.position.x = nextPos.x; activeT.mesh.position.z = nextPos.z;
            } else { 
                activeT.speed = 0; 
                if (gameState === 'AI_DRIVE') {
                    aiDriveParams.pathIndex = 9999;
                }
            }
        }
        
        alignTankToTerrain(activeT, false); activeT.mesh.updateMatrixWorld(true);

        if (gameState === 'PLAY') {
            const tip = new THREE.Vector3(0,0,9).applyMatrix4(activeT.barrelJoint.matrixWorld);
            const aimDir = new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(activeT.barrelJoint.matrixWorld)).normalize();
            let simPos = tip.clone(); let simVel = aimDir.multiplyScalar(activeT.settings.pow * 1.5);
            
            const dummy = new THREE.Object3D(); let hitGround = false; let pCount = 0;
            
            for(let i=0; i<250; i++) {
                if(!hitGround) {
                    simVel.y -= GRAVITY * 0.05; simPos.addScaledVector(simVel, 0.05);
                    dummy.position.copy(simPos); dummy.updateMatrix();
                    trajectoryPoints.setMatrixAt(i, dummy.matrix);
                    pCount++;
                    
                    let markerPlaced = false;

                    for(let s of shields) {
                        if (s.team !== currentPlayer && simPos.distanceTo(s.pos) <= s.currentRadius) {
                            hitGround = true; impactMarker.position.copy(simPos);
                            let n = simPos.clone().sub(s.pos).normalize(); 
                            impactMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), n);
                            markerPlaced = true;
                            break;
                        }
                    }

                    if(!markerPlaced) {
                        for(const b of bunkers) {
                            if(b.alive && simPos.y < b.mesh.position.y + 21 &&
                               Math.hypot(simPos.x - b.mesh.position.x, simPos.z - b.mesh.position.z) < 20) {
                                hitGround = true; impactMarker.position.copy(simPos);
                                const n = getNormal(simPos.x, simPos.z);
                                impactMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), n);
                                markerPlaced = true;
                                break;
                            }
                        }
                    }

                    if(!markerPlaced && simPos.y <= getH(simPos.x, simPos.z)) {
                        hitGround = true; impactMarker.position.copy(simPos);
                        const n = getNormal(simPos.x, simPos.z);
                        impactMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), n);
                    }
                } else {
                    trajectoryPoints.setMatrixAt(i, new THREE.Matrix4().scale(new THREE.Vector3(0,0,0))); 
                }
            }
            trajectoryPoints.count = pCount; trajectoryPoints.instanceMatrix.needsUpdate = true;
            trajectoryPoints.visible = true; impactMarker.visible = true;
            if(activeT) {
                const targetPos = impactMarker.position.clone();
                const losOK = hasLineOfSight(activeT.mesh.position, targetPos);
                trajectoryPoints.material.color.setHex(losOK ? 0xffffff : 0xff3300);
                impactMarker.material.color.setHex(losOK ? 0xff0000 : 0xff6600);
            }
        } else {
            trajectoryPoints.visible = false; impactMarker.visible = false;
        }
    }

    // ─── Projektil-Flugphysik ───
    if(gameState === 'FLY' && projectile && projectile.visible && projectileVel) {
        const shooterTank = projectile.userData.shooter;
        const sub = 3; // Substeps gegen Tunneling bei hoher Geschwindigkeit
        const sdt = dt / sub;
        let exploded = false;

        for(let s2 = 0; s2 < sub && !exploded; s2++) {
            projectileVel.y -= GRAVITY * sdt;
            projectile.position.addScaledVector(projectileVel, sdt);
            const pp = projectile.position;

            // Gegnerische Schilde stoppen das Projektil an der Oberfläche
            for(let s of shields) {
                if(s.team !== currentPlayer && pp.distanceTo(s.pos) <= s.currentRadius) {
                    fxShieldRipple(pp.clone(), s.pos, s.currentRadius);
                    exploded = true; break;
                }
            }
            if(exploded) break;

            // Direkter Panzertreffer (Schütze selbst ausgenommen)
            for(const t of teams.flat()) {
                if(!t.alive || t === shooterTank) continue;
                const center = t.mesh.position.clone(); center.y += 3;
                if(pp.distanceTo(center) < 8) { exploded = true; break; }
            }
            if(exploded) break;

            // Bunker
            for(const b of bunkers) {
                if(b.alive && pp.y < b.mesh.position.y + 21 &&
                   Math.hypot(pp.x - b.mesh.position.x, pp.z - b.mesh.position.z) < 20) {
                    exploded = true; break;
                }
            }
            if(exploded) break;

            // Terrain / Wasseroberfläche
            if(pp.y <= getH(pp.x, pp.z)) { exploded = true; break; }

            // Sicherheitsnetz: weit außerhalb der Karte
            if(Math.abs(pp.x) > MAP_SIZE * 1.2 || Math.abs(pp.z) > MAP_SIZE * 1.2 || pp.y < -40) {
                exploded = true; break;
            }
        }

        projectileLight.position.copy(projectile.position);

        if(!exploded && Math.random() < 0.6) {
            const puff = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.6 })
            );
            puff.position.copy(projectile.position);
            puff.userData = { life: 0.8 };
            scene.add(puff); smokeTrail.push(puff);
        }

        if(exploded) {
            const impactPos = projectile.position.clone();
            projectile.visible = false;
            handleExplosion(impactPos, projectile.userData.shooterPos);
        }
    }

    // ─── Nebel des Krieges (gedrosselt, ~4×/s) ───
    window._fowTimer = (window._fowTimer || 0) + dt;
    if(window._fowTimer > 0.25 && gameState !== 'MENU') {
        window._fowTimer = 0;
        updateFogOfWar();
    }

    if(gameState !== 'MENU') {
        Cam.update(dt, gameState, activeT, projectile);
    }

    if(gameState === 'FLY' && projectile && projectile.visible && window.missileRenderer && window.missileCamera) {
        const mv = document.getElementById('missile-view');
        mv.style.display = 'block';

        const pPos = projectile.position;
        const pVelN = projectileVel.clone().normalize();

        const target = Cam.shotArcImpact
            ? Cam.shotArcImpact.clone()
            : pPos.clone().add(pVelN.clone().multiplyScalar(80));

        const back = pVelN.clone().negate().multiplyScalar(18);
        const mcPos = pPos.clone().add(back).add(new THREE.Vector3(0, 6, 0));

        window.missileCamera.position.copy(mcPos);
        window.missileCamera.lookAt(target);

        window.missileRenderer.render(scene, window.missileCamera);
    } else if(gameState !== 'FLY') {
        const mv = document.getElementById('missile-view');
        if(mv) mv.style.display = 'none';
    }

    for(let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const ud = p.userData;
        ud.life -= dt;
        const t2 = ud.life;
        const lifeF = ud.maxLife ? (t2 / ud.maxLife) : t2;

        switch(ud.type) {

        case 'fire':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.y -= GRAVITY * 0.15 * dt;
            ud.velocity.x *= 0.985; ud.velocity.z *= 0.985;
            p.scale.setScalar(Math.max(0.05, lifeF * 3.2));
            p.material.opacity = Math.min(0.95, lifeF * 2);
            if(t2 < 0.35) p.material.color.setHex(0x111111);
            else if(t2 < 0.55) p.material.color.setHex(0x882200);
            break;

        case 'smoke':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.x *= 0.97; ud.velocity.z *= 0.97;
            p.scale.setScalar(1.0 + (1-lifeF) * 5.0);
            p.material.opacity = lifeF * 0.55;
            break;

        case 'spark':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.y -= GRAVITY * 0.9 * dt;
            p.scale.setScalar(Math.max(0.01, lifeF));
            if(p.position.y < getH(p.position.x, p.position.z) + 0.5) {
                p.position.y = getH(p.position.x, p.position.z) + 0.5;
                ud.velocity.y *= -0.4; ud.velocity.x *= 0.6; ud.velocity.z *= 0.6;
            }
            break;

        case 'shockwave':
            ud.growSpeed = ud.growSpeed || 220;
            p.scale.x += ud.growSpeed * dt * 0.012;
            p.scale.y += ud.growSpeed * dt * 0.012;
            p.material.opacity = lifeF * 0.85;
            break;

        case 'muzzleFlash':
            p.scale.setScalar(1.0 + (1-lifeF) * 1.8);
            p.material.opacity = lifeF * 0.95;
            break;

        case 'muzzleSmoke':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.multiplyScalar(0.95);
            p.scale.setScalar(0.6 + (1-lifeF) * 3.5);
            p.material.opacity = lifeF * 0.5;
            break;

        case 'shieldRipple':
            p.scale.x += ud.growSpeed * dt * 0.01;
            p.scale.y += ud.growSpeed * dt * 0.01;
            p.material.opacity = lifeF * 0.85;
            break;

        case 'shieldSpark':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.multiplyScalar(0.90);
            p.scale.setScalar(Math.max(0.01, lifeF));
            break;

        case 'cpBeam':
            p.position.addScaledVector(ud.velocity, dt);
            p.material.opacity = Math.sin(lifeF * Math.PI) * 0.8;
            p.scale.setScalar(0.5 + lifeF * 1.5);
            break;

        case 'engineSmoke':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.x *= 0.96; ud.velocity.z *= 0.96;
            p.scale.setScalar(0.5 + (1-lifeF) * 4.0);
            p.material.opacity = lifeF * 0.3;
            break;

        case 'shrapnel':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.y -= GRAVITY * dt;
            if(ud.rot) { p.rotation.x+=ud.rot.x*dt; p.rotation.y+=ud.rot.y*dt; p.rotation.z+=ud.rot.z*dt; }
            if(p.position.y < getH(p.position.x,p.position.z)) {
                p.position.y = getH(p.position.x,p.position.z);
                ud.velocity.y *= -0.25; ud.velocity.x *= 0.6; ud.velocity.z *= 0.6;
                if(ud.rot) ud.rot.multiplyScalar(0.5);
            }
            break;

        case 'dust':
            p.position.addScaledVector(ud.velocity, dt);
            ud.velocity.y -= GRAVITY*0.12*dt; ud.velocity.x*=0.975; ud.velocity.z*=0.975;
            p.scale.setScalar(0.4+(1-lifeF)*3.5);
            p.material.opacity = lifeF * 0.45;
            break;

        default:
            p.position.addScaledVector(ud.velocity, dt);
            p.userData.velocity.y -= GRAVITY * 0.5 * dt;
            p.scale.setScalar(Math.max(0.01, lifeF));
            break;
        }

        if(ud.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    }
    for(let i = smokeTrail.length - 1; i >= 0; i--) {
        const p = smokeTrail[i]; p.userData.life -= dt * 1.5;
        const lf = p.userData.life;
        p.scale.setScalar(Math.max(0.01, lf));
        p.position.y += dt * 3;
        p.material.opacity = lf * 0.6;
        if(lf <= 0) { scene.remove(p); smokeTrail.splice(i, 1); }
    }
    if(explosionLight.intensity > 0) explosionLight.intensity = Math.max(0, explosionLight.intensity - dt * 25);
    if(screenShake > 0) {
        camera.position.x += (Math.random() - 0.5) * screenShake; camera.position.y += (Math.random() - 0.5) * screenShake;
        screenShake -= dt * 60; if(screenShake < 0) screenShake = 0;
    }

    updateVisualEffects(dt);
    renderer.render(scene, camera);
}

window.onload = init;

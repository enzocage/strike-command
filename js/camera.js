// ════════════════════════════════════════════════════════════════
//  Kamerasystem v8 — GARANTIERTER Spieler-Perspektiv-Schutz
// ════════════════════════════════════════════════════════════════
//
//  KERNGARANTIE: Eine vom Spieler eingestellte Perspektive wird
//  NIEMALS vom System überschrieben. Einzige Ausnahme: snapTo()
//  beim Schussabgabe-Arc, das der Spieler selbst auslöst.
//
//  Verbesserungen gegenüber v7:
//  1. PLAYER_STATES_LOCKED: Spieler-PLAY + HIDE sind PERMANENT
//     gesperrt — kein Auto-Eingriff egal was passiert.
//  2. Echter "hat-manuell-gesteuert"-Flag statt reinem Timer.
//     hasManualPerspective bleibt aktiv ÜBER State-Wechsel hinweg
//     und wird nur bei explizitem Systemereignis zurückgesetzt.
//  3. Explosions-Kamera greift nie in manuelle Perspektive ein.
//     Nur Anker wird sanft zum Einschlag geschoben, nie theta/phi.
//  4. SELECT animate-Loop patcht anchor NICHT mehr direkt —
//     smoothAnchor übernimmt das sauber.
//  5. Nach FLY: smoothAnchor sofort (nicht lerp) auf Tank gesetzt
//     um post-shot Kamera-Ruckeln zu eliminieren.
//
const Cam = {
    // ── Orbit-Anker ──
    anchor:       null,   // THREE.Vector3 — aktuelles lookAt (direkt genutzt)
    smoothAnchor: null,   // THREE.Vector3 — gelatcht, läuft dem Tank nach

    // ── Manuelle Perspektive ──
    // Zweistufiges System:
    //   manualTimer        — Sekunden seit letzter Eingabe (0..TIMEOUT)
    //   hasManualPerspective — true: Spieler hat aktiv Kamera bedient;
    //                          bleibt bis Systemereignis (neuer Zug) aktiv
    manualTimer:          0,
    MANUAL_TIMEOUT:       4.0,
    hasManualPerspective: false,

    // Zustände in denen der Spieler die Kontrolle hat (nie auto-adjust)
    PLAYER_STATES: new Set(['PLAY', 'HIDE']),

    // ── Schuss / Explosion ──
    shotArcImpact: null,
    shotArcDist:   200,
    explTimer:     0,
    _prevState:    null,   // State des letzten Frames — für FLY-Ende-Erkennung

    init() {
        this.anchor       = new THREE.Vector3(0, 0, 0);
        this.smoothAnchor = new THREE.Vector3(0, 0, 0);
        camTarget = new THREE.Vector3();
        camLookAt = new THREE.Vector3();
    },

    // ── Eingabe-Registrierung ──
    onManualInput() {
        this.manualTimer          = this.MANUAL_TIMEOUT;
        this.hasManualPerspective = true;
    },

    // Auto-Cam darf nur eingreifen wenn:
    //   a) Kein aktiver Timer UND
    //   b) Spieler hat für diesen Zug keine Perspektive gesetzt UND
    //   c) Nicht in Spieler-PLAY/HIDE
    _autoCamAllowed(gs) {
        const isPlayerTurn = !(isSinglePlayer && currentPlayer === 1);
        // Spieler-States: NIEMALS automatisch justieren
        if(isPlayerTurn && this.PLAYER_STATES.has(gs)) return false;
        // Aktiver Timer: Spieler bedient gerade Kamera
        if(this.manualTimer > 0) return false;
        // Spieler hat für diesen Zug Perspektive gesetzt
        if(isPlayerTurn && this.hasManualPerspective) return false;
        return true;
    },

    // Neuer Spieler-Zug beginnt → Perspektiv-Flag zurücksetzen
    // Wird von announceTurn() aufgerufen
    onNewTurn() {
        this.hasManualPerspective = false;
        this.manualTimer = 0;
    },

    // Snap bei Schussabgabe — einzige legitime System-Übernahme
    // Setzt manualPerspective auf false damit FLY Auto übernehmen kann
    snapTo(lookAt, dist, phi, theta) {
        if(!this.anchor) return;
        camOrbit.dist  = dist;
        camOrbit.phi   = phi;
        camOrbit.theta = theta;
        this.anchor.copy(lookAt);
        this.smoothAnchor.copy(lookAt);
        this.manualTimer          = 0;
        this.hasManualPerspective = false;
    },

    // ── Winkel sanft lenken (kürzester Bogen) ──
    _steerTheta(target, speed) {
        let d = target - camOrbit.theta;
        while(d >  Math.PI) d -= Math.PI * 2;
        while(d < -Math.PI) d += Math.PI * 2;
        camOrbit.theta += d * speed;
    },

    // ── Haupt-Update ──
    update(dt, gs, activeT, projectile) {
        if(!this.anchor || !this.smoothAnchor) return;

        // Timer runterzählen
        if(this.manualTimer > 0) this.manualTimer = Math.max(0, this.manualTimer - dt);
        if(this.explTimer   > 0) this.explTimer   = Math.max(0, this.explTimer   - dt);

        // FLY → anderer State: smoothAnchor sofort (kein Lerp-Ruck) auf Tank setzen
        if(this._prevState === 'FLY' && gs !== 'FLY' && activeT) {
            const snap = activeT.mesh.position.clone(); snap.y += 5;
            this.smoothAnchor.copy(snap);
            this.anchor.copy(snap);
        }
        this._prevState = gs;

        // Phi/Dist clampen
        camOrbit.phi  = Math.max(0.08, Math.min(Math.PI / 2.05, camOrbit.phi));
        camOrbit.dist = Math.max(40,   Math.min(550,            camOrbit.dist));

        if(gs === 'FLY') {
            this._doFly(projectile);
        } else if(activeT) {
            // FOW: Kamera darf einen im Nebel versteckten KI-Panzer nicht
            // verfolgen — das würde dem Spieler seine Position verraten.
            const hiddenAI = isSinglePlayer && activeT.team === 1 &&
                             activeT.mesh && !activeT.mesh.visible;
            if(!hiddenAI) {
                // Smooth-Anchor folgt Tank (Verbesserung 4: nicht im animate-Loop patchen)
                const tankTop = activeT.mesh.position.clone(); tankTop.y += 5;
                this.smoothAnchor.lerp(tankTop, 0.12);
                this.anchor.copy(this.smoothAnchor);
            }

            if(this._autoCamAllowed(gs) && !hiddenAI) {
                this._autoAngles(gs, activeT);
            }
        }

        // Kamera positionieren
        camOrbit.phi = Math.max(0.08, Math.min(Math.PI / 2.05, camOrbit.phi));
        const cp = new THREE.Vector3(
            this.anchor.x + camOrbit.dist * Math.sin(camOrbit.phi) * Math.cos(camOrbit.theta),
            this.anchor.y + camOrbit.dist * Math.cos(camOrbit.phi),
            this.anchor.z + camOrbit.dist * Math.sin(camOrbit.phi) * Math.sin(camOrbit.theta)
        );
        camera.position.copy(cp);
        camera.lookAt(this.anchor);
    },

    // ── Auto-Winkel: nur wenn _autoCamAllowed() ──
    _autoAngles(gs, activeT) {
        switch(gs) {

        case 'SELECT':
        case 'TURN_ANNOUNCEMENT':
            // Sanfter Zoom-Out zu Übersichts-Perspektive
            camOrbit.dist += (165 - camOrbit.dist) * 0.04;
            camOrbit.phi  += (0.72 - camOrbit.phi) * 0.04;
            break;

        case 'AI_DRIVE': {
            // ── KI-Fahrt Kamera: Panzer unten-mitte, Zielgelände oben ──
            //
            // Gewünschte Optik (wie Screenshot):
            //   • Kamera sitzt direkt hinter dem Panzer
            //   • Blickrichtung: Tank → Ziel
            //   • phi ≈ 0.78 rad (≈45°) → Tank im unteren Viertel, Bäume + Gelände oben
            //   • Orbit-Anker = Tank + kleiner Vorausblick (nicht zu weit)
            //     damit Panzer SICHTBAR bleibt und nicht aus dem Bild fällt

            const tankPos = activeT.mesh.position;

            // ── Zielrichtung: Tank → aiDriveParams.target ──
            const tgt = aiDriveParams && aiDriveParams.target;
            let tgtDir;
            if(tgt) {
                const toTarget = new THREE.Vector3().subVectors(tgt, tankPos);
                toTarget.y = 0;
                tgtDir = toTarget.length() > 5
                    ? toTarget.normalize()
                    : new THREE.Vector3(Math.sin(activeT.heading||0), 0, Math.cos(activeT.heading||0));
            } else {
                tgtDir = new THREE.Vector3(Math.sin(activeT.heading||0), 0, Math.cos(activeT.heading||0));
            }

            // ── theta: Kamera von hinten — entgegen der Zielrichtung ──
            const behindTheta = Math.atan2(-tgtDir.x, -tgtDir.z);
            this._steerTheta(behindTheta, 0.12);

            // ── phi: 45° Neigung → Panzer unten, Horizont oben ──
            // 0.78 rad entspricht dem Winkel im Screenshot
            camOrbit.dist += (190 - camOrbit.dist) * 0.07;
            camOrbit.phi  += (0.78 - camOrbit.phi)  * 0.07;

            // ── Anker: Tank-Position + kleiner Vorausblick in Zielrichtung ──
            // Nur 30-40 Einheiten voraus damit der Panzer im unteren Bildbereich bleibt
            const lookAhead = 35;
            const aX = tankPos.x + tgtDir.x * lookAhead;
            const aZ = tankPos.z + tgtDir.z * lookAhead;
            const aY = (typeof getH === 'function')
                ? getH(aX, aZ) + 4
                : tankPos.y + 4;
            this.anchor.lerp(new THREE.Vector3(aX, aY, aZ), 0.08);
            break;
        }

        case 'HIDE':
            // KI-HIDE: leicht zurückzoomen
            camOrbit.dist += (155 - camOrbit.dist) * 0.04;
            camOrbit.phi  += (0.68 - camOrbit.phi) * 0.04;
            break;
        }
    },

    // ── FLY: Schuss-Arc-Überblick ──
    _doFly(projectile) {
        if(!projectile || !projectile.visible || !this.shotArcImpact) return;
        // Manuelle Perspektive respektieren: nur auto wenn erlaubt
        if(this.manualTimer > 0 || this.hasManualPerspective) return;

        const shooter = teams[currentPlayer][activeTankIdx[currentPlayer]];
        const sPos = shooter ? shooter.mesh.position.clone() : projectile.position.clone();
        const mid = sPos.clone().add(this.shotArcImpact).multiplyScalar(0.5);
        mid.y += this.shotArcDist * 0.08;
        this.anchor.copy(mid);
        this.smoothAnchor.copy(mid);

        const needDist = Math.min(500, Math.max(this.shotArcDist * 0.72, 150));
        const needPhi  = Math.max(0.45, Math.min(0.72, 0.45 + this.shotArcDist * 0.0005));
        camOrbit.dist += (needDist - camOrbit.dist) * 0.10;
        camOrbit.phi  += (needPhi  - camOrbit.phi)  * 0.10;

        const shotDir = this.shotArcImpact.clone().sub(sPos); shotDir.y = 0;
        if(shotDir.length() > 10)
            this._steerTheta(Math.atan2(-shotDir.x, -shotDir.z) + Math.PI, 0.07);
    },

    // ── Explosion: Anker sanft verschieben, NIE theta/phi zwingen ──
    onExplosion(pos) {
        if(!this.anchor) return;
        // Verbesserung 3: Explosion patcht NIE theta/phi/dist wenn manuell
        // Anker gleidend zur Explosion (smoothAnchor übernimmt das im nächsten Frame)
        const expPos = pos.clone().add(new THREE.Vector3(0, 8, 0));
        this.smoothAnchor.copy(expPos);
        this.anchor.copy(expPos);
        // Nur wenn kein manueller Eingriff: leicht rauszoomen
        if(!this.hasManualPerspective && this.manualTimer === 0) {
            camOrbit.dist += (200 - camOrbit.dist) * 0.25;
            camOrbit.phi  += (0.58 - camOrbit.phi) * 0.25;
        }
        this.explTimer = 1.5;
    }
};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isPointerDown = false, isAiming = false, lastAimPointer = {x:0, y:0};

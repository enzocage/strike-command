// ═══════════════════════════════════════════════════════════════
// STRIKE COMMANDER — Tactical Minimap
// 2D Top-Down View: Panzer, Bunker, Bäume, Kontrollpunkte, Granatenfeuerlinie
// ═══════════════════════════════════════════════════════════════

const Minimap = {
    canvas: null,
    ctx: null,
    enabled: true,
    scale: 1,    // pixels per world unit
    offsetX: 0,  // canvas center in world coords
    offsetY: 0,

    init() {
        // Canvas erstellen oder finden
        let canvas = document.getElementById('minimap-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'minimap-canvas';
            canvas.width = 280;
            canvas.height = 280;
            document.getElementById('ui-layer').appendChild(canvas);
        }
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.updateSize();
        this.setupToggle();
        this.setupTooltip();
    },

    setupToggle() {
        // Toggle-Button im Menu
        let btn = document.getElementById('minimap-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'minimap-toggle';
            btn.textContent = '🗺 MINIMAP: AN';
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
                btn.textContent = this.enabled ? '🗺 MINIMAP: AN' : '🗺 MINIMAP: AUS';
                this.canvas.style.opacity = this.enabled ? '1' : '0.2';
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
        this.canvas.title = 'Taktische Minimap: Blau=Spieler, Rot=KI, Grün=Baum, Gelb=Bunker, Weiß=CP';
    },

    updateSize() {
        if (!terrain || !MAP_SIZE) return;
        const mapHalf = MAP_SIZE / 2;
        this.scale = this.canvas.width / MAP_SIZE * 0.95; // 95% padding
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;
    },

    worldToCanvas(x, z) {
        const mapHalf = MAP_SIZE / 2;
        const cx = this.offsetX + (x / MAP_SIZE) * this.canvas.width * 0.95;
        const cy = this.offsetY + (z / MAP_SIZE) * this.canvas.height * 0.95;
        return [cx, cy];
    },

    draw(dt) {
        if (!this.enabled || !this.canvas) return;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Hintergrund: dunkles Terrain
        ctx.fillStyle = '#0a1520';
        ctx.fillRect(0, 0, w, h);

        // Rahmen
        ctx.strokeStyle = 'rgba(0,240,255,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);

        // Grid (optional)
        ctx.strokeStyle = 'rgba(0,240,255,0.08)';
        ctx.lineWidth = 0.5;
        const gridSpacing = w / 6;
        for (let i = 0; i <= 6; i++) {
            ctx.beginPath();
            ctx.moveTo(i * gridSpacing, 0);
            ctx.lineTo(i * gridSpacing, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * gridSpacing);
            ctx.lineTo(w, i * gridSpacing);
            ctx.stroke();
        }

        // Wasser-Ring (Kartenrand)
        const waterRadius = (MAP_SIZE * 0.5) * this.scale;
        ctx.fillStyle = 'rgba(10, 40, 80, 0.25)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, waterRadius, 0, Math.PI * 2);
        ctx.fill();

        // ── Bäume (grün, klein) ──
        ctx.fillStyle = '#2a6b2e';
        if (typeof trees !== 'undefined') {
            trees.forEach(tree => {
                if (!tree.alive) return;
                const [cx, cy] = this.worldToCanvas(tree.mesh.position.x, tree.mesh.position.z);
                ctx.beginPath();
                ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // ── Bunker (gelb, Quadrat) ──
        ctx.fillStyle = '#ffaa33';
        if (typeof bunkers !== 'undefined') {
            bunkers.forEach(bunker => {
                if (!bunker.alive) return;
                const [cx, cy] = this.worldToCanvas(bunker.mesh.position.x, bunker.mesh.position.z);
                ctx.fillRect(cx - 3.5, cy - 3.5, 7, 7);
            });
        }

        // ── Kontrollpunkte (weiß/Teamfarbe, Ring) ──
        if (typeof controlPoints !== 'undefined') {
            controlPoints.forEach(cp => {
                const [cx, cy] = this.worldToCanvas(cp.pos.x, cp.pos.z);

                // Neutral/Besitz-Farbe
                if (cp.holder === 0) {
                    ctx.strokeStyle = '#00e5ff';
                    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
                } else if (cp.holder === 1) {
                    ctx.strokeStyle = '#ff2d55';
                    ctx.fillStyle = 'rgba(255, 45, 85, 0.15)';
                } else {
                    ctx.strokeStyle = '#ffffff';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                }

                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Capture-Progress-Balken (oben)
                if (cp.capturingTeam >= 0 && cp.captureProgress > 0) {
                    const pCol = cp.capturingTeam === 0 ? '#00e5ff' : '#ff2d55';
                    ctx.fillStyle = pCol;
                    const barW = 6 * (cp.captureProgress / 3);
                    ctx.fillRect(cx - 3, cy - 12, barW, 2);
                }
            });
        }

        // ── Panzer (Dreiecke, Team-Farbe, zeigen Richtung) ──
        const drawTank = (tank, color) => {
            if (!tank || !tank.alive) return;
            const [cx, cy] = this.worldToCanvas(tank.mesh.position.x, tank.mesh.position.z);
            const heading = tank.heading;

            // Richtungs-Dreieck
            const size = 5.5;
            const x1 = cx + Math.cos(heading) * size;
            const y1 = cy + Math.sin(heading) * size;
            const x2 = cx + Math.cos(heading - 2.5) * size * 0.6;
            const y2 = cy + Math.sin(heading - 2.5) * size * 0.6;
            const x3 = cx + Math.cos(heading + 2.5) * size * 0.6;
            const y3 = cy + Math.sin(heading + 2.5) * size * 0.6;

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.closePath();
            ctx.fill();

            // HP-Balken (oben)
            const hpPct = tank.hp / tank.maxHP;
            ctx.fillStyle = hpPct > 0.5 ? '#00ff88' : hpPct > 0.25 ? '#ffaa00' : '#ff3333';
            ctx.fillRect(cx - 4, cy - 10, 8 * hpPct, 2);
        };

        teams.forEach((team, teamIdx) => {
            const color = teamIdx === 0 ? '#00e5ff' : '#ff2d55';
            team.forEach(tank => drawTank(tank, color));
        });

        // ── Projektil (wenn aktiv) ──
        if (typeof projectile !== 'undefined' && projectile && projectile.visible) {
            const [cx, cy] = this.worldToCanvas(projectile.position.x, projectile.position.z);
            ctx.fillStyle = projectile.material.color.getStyle();
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();

            // Projektil-Traj: Tracer zur nächsten erwarteten Position
            if (typeof projectileVel !== 'undefined' && projectileVel) {
                const nextX = projectile.position.x + projectileVel.x * 0.1;
                const nextZ = projectile.position.z + projectileVel.z * 0.1;
                const [nx, ny] = this.worldToCanvas(nextX, nextZ);
                ctx.strokeStyle = projectile.material.color.getStyle();
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(nx, ny);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // ── Schilde (halbdurchsichtig) ──
        if (typeof shields !== 'undefined') {
            shields.forEach(shield => {
                const [cx, cy] = this.worldToCanvas(shield.pos.x, shield.pos.z);
                const shieldRadius = shield.currentRadius * this.scale;
                ctx.strokeStyle = shield.team === 0 ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 45, 85, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(cx, cy, shieldRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            });
        }

        // ── Info-Text (oben links) ──
        ctx.fillStyle = 'rgba(0,240,255,0.7)';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText('TAKTISCHE MINIMAP', 6, 12);
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

// ════════════════════════════════════════════════════════════════════
//  WETTERSYSTEM — Regen in 30% der Spielzeit
// ════════════════════════════════════════════════════════════════════
const weather = {
    isRaining: false,
    rainIntensity: 0,       // 0–1
    targetIntensity: 0,
    fogDensityBase: 0.0008, // Schönwetter
    fogDensityRain: 0.0028, // Regen
    lightningTimer: 0,
    lightningInterval: 0,
    flashPhase: 0,          // 0=idle, 1=flash1, 2=dark, 3=flash2
    flashTimer: 0,
    sunIntensityBase: 1.5,
    sunColorBase: new THREE.Color(0xffd580),
    sunColorRain: new THREE.Color(0x8899bb),
    rainCanvas: null,
    rainCtx: null,
    drops: [],
    NUM_DROPS: 320,
    sunLight: null,
    hemiLight: null,
    weatherCheckTimer: 0,
    WEATHER_CHECK_INTERVAL: 18, // Sekunden zwischen Wetterwechseln
    thunderAudio: null,

    init(sun, hemi) {
        this.sunLight = sun;
        this.hemiLight = hemi;
        this.rainCanvas = document.getElementById('rain-canvas');
        this.rainCtx = this.rainCanvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this._spawnDrops();
        // Zufälliger Start: 30% Chance auf Regen beim Spielstart
        if(Math.random() < 0.30) {
            setTimeout(() => this.startRain(), 2000 + Math.random() * 3000);
        }
    },

    resize() {
        this.rainCanvas.width  = window.innerWidth;
        this.rainCanvas.height = window.innerHeight;
    },

    _spawnDrops() {
        this.drops = [];
        for(let i = 0; i < this.NUM_DROPS; i++) {
            this.drops.push(this._newDrop(true));
        }
    },

    _newDrop(randomY) {
        return {
            x: Math.random() * window.innerWidth,
            y: randomY ? Math.random() * window.innerHeight : -10,
            len: 12 + Math.random() * 18,
            speed: 420 + Math.random() * 260,
            opacity: 0.25 + Math.random() * 0.45,
            width: 0.8 + Math.random() * 0.7
        };
    },

    startRain() {
        if(this.isRaining) return;
        this.isRaining = true;
        this.targetIntensity = 0.55 + Math.random() * 0.45;
        this.lightningInterval = 6 + Math.random() * 12;
        this.lightningTimer = this.lightningInterval * 0.5;
        document.getElementById('rain-canvas').classList.add('active');
        document.getElementById('fog-overlay').classList.add('active');
        document.getElementById('weather-indicator').classList.add('active');
    },

    stopRain() {
        if(!this.isRaining) return;
        this.isRaining = false;
        this.targetIntensity = 0;
        document.getElementById('rain-canvas').classList.remove('active');
        document.getElementById('fog-overlay').classList.remove('active');
        document.getElementById('weather-indicator').classList.remove('active');
    },

    triggerLightning() {
        // Blitz-Sequenz: flash → kurz dunkel → flash → weg
        this.flashPhase = 1;
        this.flashTimer = 0;
        this._playThunder();
    },

    _playThunder() {
        if(!Audio.ctx) return;
        try {
            const ctx = Audio.ctx;
            const t = ctx.currentTime + 0.08 + Math.random() * 0.3;
            // Donner: Rauschen + tiefer Subton
            const buf = ctx.createBuffer(1, ctx.sampleRate * 2.8, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for(let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 0.6);
            const src = ctx.createBufferSource(); src.buffer = buf;
            const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 280;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(1.4 * this.rainIntensity, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 2.6);
            src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
            src.start(t);
        } catch(e) {}
    },

    update(dt) {
        // Wettercheck-Timer
        this.weatherCheckTimer += dt;
        if(this.weatherCheckTimer >= this.WEATHER_CHECK_INTERVAL) {
            this.weatherCheckTimer = 0;
            if(this.isRaining) {
                // 55% Chance aufzuhören
                if(Math.random() < 0.55) this.stopRain();
            } else {
                // 30% Chance anzufangen
                if(Math.random() < 0.30) this.startRain();
            }
        }

        // Intensität interpolieren
        this.rainIntensity += (this.targetIntensity - this.rainIntensity) * Math.min(1, dt * 0.8);

        // Szenen-Beleuchtung anpassen
        if(this.sunLight) {
            const t = this.rainIntensity;
            this.sunLight.intensity = this.sunIntensityBase * (1 - t * 0.7);
            this.sunLight.color.lerpColors(this.sunColorBase, this.sunColorRain, t);
        }
        if(this.hemiLight) {
            this.hemiLight.intensity = 0.7 - this.rainIntensity * 0.45;
        }

        // Nebeldichte
        if(scene && scene.fog) {
            const targetDensity = this.fogDensityBase + (this.fogDensityRain - this.fogDensityBase) * this.rainIntensity;
            scene.fog.density += (targetDensity - scene.fog.density) * Math.min(1, dt * 0.5);
        }

        // Blitz-Timer
        if(this.isRaining && this.rainIntensity > 0.3) {
            this.lightningTimer -= dt;
            if(this.lightningTimer <= 0) {
                this.lightningTimer = this.lightningInterval * (0.6 + Math.random() * 0.8);
                this.triggerLightning();
            }
        }

        // Blitz-Flash animieren
        const flash = document.getElementById('lightning-flash');
        if(this.flashPhase > 0) {
            this.flashTimer += dt;
            if(this.flashPhase === 1) {
                flash.style.background = 'rgba(210,230,255,0.88)';
                if(this.flashTimer > 0.045) { this.flashPhase = 2; this.flashTimer = 0; }
            } else if(this.flashPhase === 2) {
                flash.style.background = 'rgba(210,230,255,0.0)';
                if(this.flashTimer > 0.08) { this.flashPhase = 3; this.flashTimer = 0; }
            } else if(this.flashPhase === 3) {
                flash.style.background = 'rgba(210,230,255,0.55)';
                if(this.flashTimer > 0.06) { this.flashPhase = 0; flash.style.background = 'rgba(210,230,255,0)'; }
            }
        }

        // Regen zeichnen
        if(this.rainIntensity > 0.01) {
            this._drawRain(dt);
        } else {
            const ctx = this.rainCtx;
            ctx.clearRect(0, 0, this.rainCanvas.width, this.rainCanvas.height);
        }
    },

    _drawRain(dt) {
        const ctx = this.rainCtx;
        const W = this.rainCanvas.width, H = this.rainCanvas.height;
        const windX = 55 * this.rainIntensity; // leichter Wind
        const activeDrops = Math.floor(this.drops.length * Math.min(1, this.rainIntensity * 1.6));

        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.strokeStyle = 'rgba(180,210,255,1)';
        ctx.lineWidth = 1;

        for(let i = 0; i < activeDrops; i++) {
            const drop = this.drops[i];
            drop.x += windX * dt;
            drop.y += drop.speed * dt;

            if(drop.y > H + drop.len || drop.x > W + 20) {
                this.drops[i] = this._newDrop(false);
                this.drops[i].x = Math.random() * (W + 40) - 20;
                continue;
            }

            ctx.globalAlpha = drop.opacity * this.rainIntensity;
            ctx.lineWidth = drop.width;
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x + windX * 0.08, drop.y + drop.len);
            ctx.stroke();
        }
        ctx.restore();
    }
};

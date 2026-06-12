function makeDistortionCurve(amount) {
    let k = amount; let n = 44100; let curve = new Float32Array(n); let deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) { let x = i * 2 / n - 1; curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x)); }
    return curve;
}

// ════════════════════════════════════════════════════════════════
//  AUDIO ENGINE v2 — vollständiges Klangsystem
// ════════════════════════════════════════════════════════════════
const Audio = {
    ctx: null,
    master: null,
    // Motor-Nodes (immer aktiv wenn Tank fährt)
    engineOsc: null, engineGain: null, engineRunning: false, _e2: null,
    // Ambient-Drone (Hintergrundatmosphäre)
    ambientNode: null, ambientGain: null,
    // Projektil-Whistle (während Schuss fliegt)
    whistleOsc: null, whistleGain: null,
    // Reload-Ratchet Node
    _reloadActive: false,

    init() {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        // Kompressor für konsistenten Mix
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.18;

        this.master = this.ctx.createGain(); this.master.gain.value = 0.78;
        this.compressor.connect(this.ctx.destination);
        this.master.connect(this.compressor);
        this._startAmbient();
    },

    _o() { return this.master || this.ctx.destination; },
    _nb(dur, pink=false) {
        const s = this.ctx.sampleRate, n = Math.ceil(s*dur), b = this.ctx.createBuffer(1,n,s), d = b.getChannelData(0);
        if(pink) {
            let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
            for(let i=0;i<n;i++){
                const wh=Math.random()*2-1;
                b0=0.99886*b0+wh*0.0555179; b1=0.99332*b1+wh*0.0750759;
                b2=0.96900*b2+wh*0.1538520; b3=0.86650*b3+wh*0.3104856;
                b4=0.55000*b4+wh*0.5329522; b5=-0.7616*b5-wh*0.0168980;
                d[i]=(b0+b1+b2+b3+b4+b5+b6+wh*0.5362)*0.11; b6=wh*0.115926;
            }
        } else {
            for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
        }
        return b;
    },
    _src(buf) { const s=this.ctx.createBufferSource(); s.buffer=buf; return s; },
    _osc(tp,fr) { const o=this.ctx.createOscillator(); o.type=tp; o.frequency.value=fr; return o; },
    _g(v) { const g=this.ctx.createGain(); g.gain.value=v; return g; },
    _f(tp,fr,q) { const f=this.ctx.createBiquadFilter(); f.type=tp; f.frequency.value=fr; if(q)f.Q.value=q; return f; },

    // ── Hintergrund-Ambient: tiefer Kriegsfeld-Drone ──
    _startAmbient() {
        if(!this.ctx) return;
        const C=this.ctx, OUT=this._o();
        // Sehr tiefer Summ-Drone
        const d1 = this._osc('sine', 28); const d2 = this._osc('sine', 42);
        const d3 = this._osc('triangle', 71);
        // Leichtes LFO-Tremolo
        const lfo = this._osc('sine', 0.18); const lfoG = this._g(3);
        lfo.connect(lfoG); lfoG.connect(d1.frequency);
        this.ambientGain = this._g(0);
        const hp = this._f('highpass', 18);
        d1.connect(hp); d2.connect(hp); d3.connect(hp);
        hp.connect(this.ambientGain);
        this.ambientGain.connect(OUT);
        d1.start(); d2.start(); d3.start(); lfo.start();
        this.ambientNode = {d1,d2,d3,lfo};
    },

    setAmbient(intensity) {
        if(!this.ctx || !this.ambientGain) return;
        const t = this.ctx.currentTime;
        this.ambientGain.gain.cancelScheduledValues(t);
        this.ambientGain.gain.setTargetAtTime(intensity * 0.07, t, 1.5);
    },

    play(type) {
        if(!this.ctx) return;
        const C=this.ctx, t=C.currentTime, OUT=this._o();
        switch(type) {

        // ─── UI ────────────────────────────────────────────────────────
        case 'hover': {
            const o=this._osc('sine',3800),g=this._g(0);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.013,t+0.003);
            g.gain.exponentialRampToValueAtTime(0.001,t+0.03);
            o.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.032); break;
        }
        case 'click': {
            // Mechanischer Ratchet-Klick
            const o=this._osc('square',480),d=C.createWaveShaper(),g=this._g(0);
            d.curve=makeDistortionCurve(60);
            o.frequency.exponentialRampToValueAtTime(38,t+0.06);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.28,t+0.002);
            g.gain.exponentialRampToValueAtTime(0.001,t+0.065);
            o.connect(d); d.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.07); break;
        }
        case 'select': {
            // Militärisches Doppel-Beep mit etwas Hall
            [380,620].forEach((f,i)=>{
                const o=this._osc('square',f),hp=this._f('highpass',200),g=this._g(0),st=t+i*0.09;
                g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(0.065,st+0.006);
                g.gain.exponentialRampToValueAtTime(0.001,st+0.11);
                o.connect(hp); hp.connect(g); g.connect(OUT); o.start(st); o.stop(st+0.12);
            }); break;
        }
        case 'confirm': {
            // Kraftvoller 3-Ton-Akkord aufsteigend + Sub-Kick
            const kick=this._osc('sine',120),kg=this._g(0.35);
            kick.frequency.exponentialRampToValueAtTime(28,t+0.18);
            kg.gain.exponentialRampToValueAtTime(0.001,t+0.18);
            kick.connect(kg); kg.connect(OUT); kick.start(t); kick.stop(t+0.19);
            [523,659,784].forEach((f,i)=>{
                const o=this._osc('sawtooth',f),fl=this._f('lowpass',1600),g=this._g(0),st=t+i*0.09;
                g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(0.08,st+0.015);
                g.gain.exponentialRampToValueAtTime(0.001,st+0.42);
                o.connect(fl); fl.connect(g); g.connect(OUT); o.start(st); o.stop(st+0.44);
            }); break;
        }
        case 'sliderTick': {
            const o=this._osc('triangle',4600),g=this._g(0);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.018,t+0.002);
            g.gain.exponentialRampToValueAtTime(0.001,t+0.018);
            o.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.02); break;
        }
        case 'error': {
            // Tiefer Buzz-Alarm: zwei Töne alternierend
            [0,0.12,0.24].forEach(d=>{
                const o=this._osc('sawtooth',d%0.24===0?108:86),fl=this._f('bandpass',200,0.7),g=this._g(0);
                g.gain.setValueAtTime(0,t+d); g.gain.linearRampToValueAtTime(0.18,t+d+0.01);
                g.gain.exponentialRampToValueAtTime(0.001,t+d+0.11);
                o.connect(fl); fl.connect(g); g.connect(OUT); o.start(t+d); o.stop(t+d+0.12);
            }); break;
        }

        // ─── WAFFE ─────────────────────────────────────────────────────
        case 'shoot': {
            // 4-Layer Kanone: Crack + Rückstoß-Körper + Mündungsfeuer + Tiefbass-Boom
            // CRACK — ultraschneller Hochfrequenz-Transient
            const cr=this._src(this._nb(0.025)),chp=this._f('highpass',3200),cg=this._g(0);
            cg.gain.setValueAtTime(0,t); cg.gain.linearRampToValueAtTime(6.5,t+0.0008);
            cg.gain.exponentialRampToValueAtTime(0.001,t+0.025);
            cr.connect(chp); chp.connect(cg); cg.connect(OUT); cr.start(t);
            // KÖRPER — abfallender Sinus (Rohr-Resonanz)
            const bd=this._osc('sine',210),bg=this._g(2.8);
            bd.frequency.setValueAtTime(210,t);
            bd.frequency.exponentialRampToValueAtTime(18,t+0.85);
            bg.gain.setValueAtTime(2.8,t); bg.gain.exponentialRampToValueAtTime(0.001,t+0.85);
            bd.connect(bg); bg.connect(OUT); bd.start(t); bd.stop(t+0.87);
            // MÜNDUNGSFEUER — pink noise burst
            const mn=this._src(this._nb(0.6,true)),mf=this._f('bandpass',700,0.45),mg=this._g(1.8);
            mf.frequency.exponentialRampToValueAtTime(60,t+0.55);
            mg.gain.setValueAtTime(1.8,t); mg.gain.exponentialRampToValueAtTime(0.001,t+0.55);
            mn.connect(mf); mf.connect(mg); mg.connect(OUT); mn.start(t);
            // DISTANZ-BOOM — sehr tief, verzögert (Schallwelle)
            const bm=this._osc('sine',55),bmg=this._g(0);
            bm.frequency.exponentialRampToValueAtTime(12,t+0.6);
            bmg.gain.setValueAtTime(0,t+0.08); bmg.gain.linearRampToValueAtTime(1.4,t+0.12);
            bmg.gain.exponentialRampToValueAtTime(0.001,t+0.9);
            bm.connect(bmg); bmg.connect(OUT); bm.start(t+0.08); bm.stop(t+0.92);
            break;
        }
        case 'reload': {
            // Mechanisches Nachladen: Metall-Schlitten + Klick + Kammerschluss
            const n1=this._src(this._nb(0.05)),f1=this._f('bandpass',2800,1.8),g1=this._g(0.55);
            g1.gain.exponentialRampToValueAtTime(0.001,t+0.05); n1.connect(f1); f1.connect(g1); g1.connect(OUT); n1.start(t);
            // Metallisches Gleiten
            const sl=this._osc('sawtooth',1800),sg=this._g(0);
            sl.frequency.linearRampToValueAtTime(900,t+0.22);
            sg.gain.setValueAtTime(0,t+0.06); sg.gain.linearRampToValueAtTime(0.06,t+0.08);
            sg.gain.exponentialRampToValueAtTime(0.001,t+0.28);
            sl.connect(sg); sg.connect(OUT); sl.start(t+0.06); sl.stop(t+0.29);
            // Kammer-Klick am Ende
            const n2=this._src(this._nb(0.03)),f2=this._f('bandpass',3200,2.5),g2=this._g(0.8);
            g2.gain.exponentialRampToValueAtTime(0.001,t+0.38); n2.connect(f2); f2.connect(g2); g2.connect(OUT); n2.start(t+0.35);
            break;
        }
        case 'ricochet': {
            // Metall-Zing variabel + Panzer-Dumpf
            const freq = 3200+Math.random()*2000;
            const o=this._osc('sine',freq),hp=this._f('highpass',1800),g=this._g(0.32);
            o.frequency.exponentialRampToValueAtTime(180+Math.random()*150,t+0.5);
            g.gain.setValueAtTime(0.32,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
            o.connect(hp); hp.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.52);
            // Metall-Impact
            const ni=this._src(this._nb(0.03)),nif=this._f('highpass',4000),nig=this._g(0.5);
            nig.gain.exponentialRampToValueAtTime(0.001,t+0.03); ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t);
            // Tiefer Hull-Dumpf
            const h=this._osc('sine',95+Math.random()*30),hg=this._g(0);
            hg.gain.setValueAtTime(0,t); hg.gain.linearRampToValueAtTime(0.22,t+0.005);
            hg.gain.exponentialRampToValueAtTime(0.001,t+0.18);
            h.connect(hg); hg.connect(OUT); h.start(t); h.stop(t+0.19); break;
        }

        // ─── PANZER-ZERSTÖRUNG ─────────────────────────────────────────
        case 'tankDestroyed': {
            // Primäre Explosion + 3 Sekundär-Detonationen + Metall-Regen
            // Primary
            const p1=this._src(this._nb(2.2,true)),pf=this._f('lowpass',1200),pd=C.createWaveShaper();
            pd.curve=makeDistortionCurve(100); pf.frequency.exponentialRampToValueAtTime(22,t+2.0);
            const pg=this._g(2.0); pg.gain.exponentialRampToValueAtTime(0.001,t+2.0);
            p1.connect(pf); pf.connect(pd); pd.connect(pg); pg.connect(OUT); p1.start(t);
            const ps=this._osc('sine',70),psg=this._g(3.5);
            ps.frequency.exponentialRampToValueAtTime(6,t+2.2); psg.gain.exponentialRampToValueAtTime(0.001,t+2.2);
            ps.connect(psg); psg.connect(OUT); ps.start(t); ps.stop(t+2.2);
            // Sekundär-Detonationen
            [0.3,0.62,1.1].forEach((d,i)=>{
                const ns=this._src(this._nb(1.4,true)),nf2=this._f('lowpass',800),ng=this._g(1.2-i*0.3);
                nf2.frequency.exponentialRampToValueAtTime(25,t+d+1.2); ng.gain.exponentialRampToValueAtTime(0.001,t+d+1.2);
                ns.connect(nf2); nf2.connect(ng); ng.connect(OUT); ns.start(t+d);
            });
            // Metall-Trümmer-Regen (viele kleine Klicks)
            for(let i=0;i<6;i++){
                const ni=this._src(this._nb(0.02)),nif=this._f('highpass',2500+i*300),nig=this._g(0.3);
                nig.gain.exponentialRampToValueAtTime(0.001,t+0.6+i*0.18);
                ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t+0.5+i*0.18);
            }
            break;
        }
        case 'killFanfare': {
            // Blechbläser-Fanfare 4 Töne + Snare-Roll
            for(let i=0;i<5;i++){
                const sn=this._src(this._nb(0.035)),sf=this._f('bandpass',180+i*12,2.0),sg2=this._g(0.22-i*0.03);
                sg2.gain.exponentialRampToValueAtTime(0.001,t+i*0.045+0.035);
                sn.connect(sf); sf.connect(sg2); sg2.connect(OUT); sn.start(t+i*0.04);
            }
            [440,554,659,880].forEach((f,i)=>{
                const o=this._osc('sawtooth',f),fl=this._f('lowpass',2000),g=this._g(0),st=t+0.22+i*0.12;
                g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(0.1,st+0.022);
                g.gain.exponentialRampToValueAtTime(0.001,st+0.55);
                o.connect(fl); fl.connect(g); g.connect(OUT); o.start(st); o.stop(st+0.57);
            }); break;
        }

        // ─── SCHILDER ──────────────────────────────────────────────────
        case 'shieldDeploy': {
            // Energie-Kuppel steigt auf — Frequenz-Sweep + Oberton-Shimmer
            const o=this._osc('sine',55),fl=this._f('bandpass',320,1.2),g=this._g(0);
            o.frequency.exponentialRampToValueAtTime(1600,t+1.1);
            fl.frequency.exponentialRampToValueAtTime(1300,t+1.1);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.22,t+0.1);
            g.gain.linearRampToValueAtTime(0,t+1.1);
            o.connect(fl); fl.connect(g); g.connect(OUT); o.start(t); o.stop(t+1.12);
            const o2=this._osc('triangle',110),g2=this._g(0);
            o2.frequency.exponentialRampToValueAtTime(3200,t+1.1);
            g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(0.1,t+0.15);
            g2.gain.linearRampToValueAtTime(0,t+1.1);
            o2.connect(g2); g2.connect(OUT); o2.start(t); o2.stop(t+1.12);
            // Power-Charge-Klang
            const pc=this._src(this._nb(0.8,true)),pf=this._f('highpass',3000),pg=this._g(0.3);
            pg.gain.exponentialRampToValueAtTime(0.001,t+0.8); pc.connect(pf); pf.connect(pg); pg.connect(OUT); pc.start(t);
            break;
        }
        case 'shieldHit': {
            // Resonanter Kuppel-Einschlag — harmonisches Klingen
            [168,336,672,1344].forEach((f,i)=>{
                const o=this._osc('sine',f),g=this._g(0.1/(i*0.5+1));
                o.frequency.exponentialRampToValueAtTime(f*0.5,t+0.85);
                g.gain.exponentialRampToValueAtTime(0.001,t+0.85);
                o.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.87);
            });
            const ni=this._src(this._nb(0.035)),nif=this._f('highpass',6000),nig=this._g(0.5);
            nig.gain.exponentialRampToValueAtTime(0.001,t+0.035); ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t);
            break;
        }

        // ─── KONTROLLPUNKTE ────────────────────────────────────────────
        case 'cpCapture': {
            // Trommel-Roll + Triumpf-Fanfare
            for(let i=0; i<8; i++){
                const ns=this._src(this._nb(0.035)),nf=this._f('bandpass',180+i*14,2.4),ng=this._g(0.28-i*0.025);
                ng.gain.exponentialRampToValueAtTime(0.001,t+i*0.048+0.035);
                ns.connect(nf); nf.connect(ng); ng.connect(OUT); ns.start(t+i*0.045);
            }
            [330,415,523,659,880].forEach((f,i)=>{
                const o=this._osc('square',f),lp=this._f('lowpass',2200),g=this._g(0),st=t+0.38+i*0.09;
                g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(0.09,st+0.016);
                g.gain.exponentialRampToValueAtTime(0.001,st+0.38);
                o.connect(lp); lp.connect(g); g.connect(OUT); o.start(st); o.stop(st+0.4);
            }); break;
        }

        // ─── RAUCH ─────────────────────────────────────────────────────
        case 'smokeDeployFX': {
            // Druckventil-Zischen + dumpfer Aufprall
            const ns=this._src(this._nb(1.2,true)),nf=this._f('bandpass',3200,0.35),ng=this._g(0.48);
            nf.frequency.exponentialRampToValueAtTime(800,t+1.1);
            ng.gain.exponentialRampToValueAtTime(0.001,t+1.1);
            ns.connect(nf); nf.connect(ng); ng.connect(OUT); ns.start(t);
            const sub=this._osc('sine',88),sg=this._g(0.32);
            sub.frequency.exponentialRampToValueAtTime(22,t+0.3); sg.gain.exponentialRampToValueAtTime(0.001,t+0.3);
            sub.connect(sg); sg.connect(OUT); sub.start(t); sub.stop(t+0.32); break;
        }

        // ─── SPIELFLUSS ────────────────────────────────────────────────
        case 'turnAnnounce': {
            // Taktisches Radio-Piep-Doppel + aufsteigender Ton
            [0,0.08].forEach(d=>{
                const ns=this._src(this._nb(0.032)),nf=this._f('bandpass',2200,3.5),ng=this._g(0.42);
                ng.gain.exponentialRampToValueAtTime(0.001,t+d+0.032);
                ns.connect(nf); nf.connect(ng); ng.connect(OUT); ns.start(t+d);
            });
            const o=this._osc('square',380),g=this._g(0);
            o.frequency.exponentialRampToValueAtTime(1280,t+0.28);
            g.gain.setValueAtTime(0,t+0.14); g.gain.linearRampToValueAtTime(0.08,t+0.16);
            g.gain.exponentialRampToValueAtTime(0.001,t+0.45);
            o.connect(g); g.connect(OUT); o.start(t+0.14); o.stop(t+0.47); break;
        }
        case 'victory': {
            // Epische 8-Ton-Fanfare mit Pauken-Roll
            // Pauken
            for(let i=0;i<10;i++){
                const sn=this._src(this._nb(0.04)),sf=this._f('bandpass',160+i*8,1.8),sg2=this._g(0.25);
                sg2.gain.exponentialRampToValueAtTime(0.001,t+i*0.055+0.04);
                sn.connect(sf); sf.connect(sg2); sg2.connect(OUT); sn.start(t+i*0.05);
            }
            // Fanfare
            [523,659,784,1047,784,1047,1175,1568].forEach((f,i)=>{
                const o=this._osc(i<4?'square':'sawtooth',f),fl=this._f('lowpass',2400),g=this._g(0),st=t+0.5+i*0.17;
                g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(0.12,st+0.035);
                g.gain.exponentialRampToValueAtTime(0.001,st+0.7);
                o.connect(fl); fl.connect(g); g.connect(OUT); o.start(st); o.stop(st+0.72);
            }); break;
        }

        // ─── NEU: TREFFER-SCHADEN ──────────────────────────────────────
        case 'tankHit': {
            // Metallischer Einschlag-Dumpf
            const ni=this._src(this._nb(0.04)),nif=this._f('bandpass',1800,1.4),nig=this._g(0.7);
            nig.gain.exponentialRampToValueAtTime(0.001,t+0.04); ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t);
            const h=this._osc('sine',68),hg=this._g(0.55);
            h.frequency.exponentialRampToValueAtTime(18,t+0.22); hg.gain.exponentialRampToValueAtTime(0.001,t+0.22);
            h.connect(hg); hg.connect(OUT); h.start(t); h.stop(t+0.23); break;
        }

        // ─── NEU: PROJEKTIL-PFEIFEN ────────────────────────────────────
        case 'projectileWhistle': {
            // Kurzer Überschall-Pfiff beim Einschlag
            const o=this._osc('sine',2400+Math.random()*600),g=this._g(0.18);
            o.frequency.exponentialRampToValueAtTime(400,t+0.35);
            g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
            o.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.37); break;
        }

        // ─── NEU: TERRAIN-SCHADEN ──────────────────────────────────────
        case 'terrainImpact': {
            // Erde und Steine: tiefer Thud + Splitter
            const sub=this._osc('sine',52),sg=this._g(1.2);
            sub.frequency.exponentialRampToValueAtTime(10,t+0.5); sg.gain.exponentialRampToValueAtTime(0.001,t+0.5);
            sub.connect(sg); sg.connect(OUT); sub.start(t); sub.stop(t+0.52);
            const ns=this._src(this._nb(0.8,true)),nf=this._f('bandpass',1200,0.6),ng=this._g(0.9);
            nf.frequency.exponentialRampToValueAtTime(80,t+0.7); ng.gain.exponentialRampToValueAtTime(0.001,t+0.7);
            ns.connect(nf); nf.connect(ng); ng.connect(OUT); ns.start(t); break;
        }

        // ─── NEU: KETTENBONUS ──────────────────────────────────────────
        case 'chainBonus': {
            // Elektrischer Surge + Aufsteigende Töne
            const o=this._osc('sawtooth',180),hp=this._f('highpass',150),g=this._g(0);
            o.frequency.exponentialRampToValueAtTime(720,t+0.4);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.15,t+0.05);
            g.gain.linearRampToValueAtTime(0,t+0.4);
            o.connect(hp); hp.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.42);
            [440,554,880].forEach((f,i)=>{
                const o2=this._osc('sine',f),g2=this._g(0),st=t+0.3+i*0.1;
                g2.gain.setValueAtTime(0,st); g2.gain.linearRampToValueAtTime(0.12,st+0.02);
                g2.gain.exponentialRampToValueAtTime(0.001,st+0.3);
                o2.connect(g2); g2.connect(OUT); o2.start(st); o2.stop(st+0.32);
            }); break;
        }

        // ─── NEU: AP-BONUS ─────────────────────────────────────────────
        case 'apRefill': {
            // Power-Up Chime
            [660,880,1100,1320].forEach((f,i)=>{
                const o=this._osc('triangle',f),g=this._g(0),st=t+i*0.07;
                g.gain.setValueAtTime(0,st); g.gain.linearRampToValueAtTime(0.11,st+0.012);
                g.gain.exponentialRampToValueAtTime(0.001,st+0.28);
                o.connect(g); g.connect(OUT); o.start(st); o.stop(st+0.3);
            }); break;
        }

        // ─── NEU: SZENEN-WECHSEL ───────────────────────────────────────
        case 'sceneChange': {
            // Tiefer atmosphärischer Sweep
            const o=this._osc('sine',38),g=this._g(0);
            o.frequency.exponentialRampToValueAtTime(180,t+2.5);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.12,t+0.5);
            g.gain.linearRampToValueAtTime(0,t+2.5);
            o.connect(g); g.connect(OUT); o.start(t); o.stop(t+2.6);
            const o2=this._osc('triangle',76),g2=this._g(0);
            o2.frequency.exponentialRampToValueAtTime(360,t+2.5);
            g2.gain.setValueAtTime(0,t); g2.gain.linearRampToValueAtTime(0.06,t+0.8);
            g2.gain.linearRampToValueAtTime(0,t+2.5);
            o2.connect(g2); g2.connect(OUT); o2.start(t); o2.stop(t+2.6); break;
        }

        // ─── NEU: WARNUNG / NIEDRIG-AP ─────────────────────────────────
        case 'lowAP': {
            // Nervöser Alarm-Tick
            [0,0.18].forEach(d=>{
                const o=this._osc('square',640),g=this._g(0);
                g.gain.setValueAtTime(0,t+d); g.gain.linearRampToValueAtTime(0.1,t+d+0.008);
                g.gain.exponentialRampToValueAtTime(0.001,t+d+0.09);
                o.connect(g); g.connect(OUT); o.start(t+d); o.stop(t+d+0.1);
            }); break;
        }

        } // end switch
    },

    playExplosion(ammoType='standard') {
        if(!this.ctx) return;
        const C=this.ctx, t=C.currentTime, OUT=this._o();

        // Terrain-Impact-Klang kurz vorher (Einschlag-Pfeif)
        this.play('projectileWhistle');

        // Parameter nach Munitionstyp
        const isFrag  = ammoType==='frag';
        const isAP    = ammoType==='ap';
        const isSmoke = ammoType==='smoke';
        const subFreq  = isAP  ? 110 : isFrag ? 65  : 80;
        const subLevel = isAP  ? 5.5 : isFrag ? 3.5 : 4.2;
        const bodyLevel= isAP  ? 2.5 : isFrag ? 4.2 : 3.2;
        const decay    = isAP  ? 2.0 : isFrag ? 3.8 : 2.8;
        const lpStart  = isAP  ? 4000: isFrag ? 2200: 3000;

        if(isSmoke) { this.play('smokeDeployFX'); return; }

        // CRACK — ultraschneller Transient
        const cr=this._src(this._nb(0.018)),chp=this._f('highpass',3500),cg=this._g(0);
        cg.gain.setValueAtTime(0,t); cg.gain.linearRampToValueAtTime(7.0,t+0.0006);
        cg.gain.exponentialRampToValueAtTime(0.001,t+0.018);
        cr.connect(chp); chp.connect(cg); cg.connect(OUT); cr.start(t);

        // HAUPTKÖRPER — geformtes rosa Rauschen
        const bs=Math.ceil(C.sampleRate*decay*1.1), buf=C.createBuffer(1,bs,C.sampleRate), bd=buf.getChannelData(0);
        // Pink noise
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
        for(let i=0;i<bs;i++){
            const wh=Math.random()*2-1;
            b0=0.99886*b0+wh*0.0555179; b1=0.99332*b1+wh*0.0750759;
            b2=0.96900*b2+wh*0.1538520; b3=0.86650*b3+wh*0.3104856;
            b4=0.55000*b4+wh*0.5329522; b5=-0.7616*b5-wh*0.0168980;
            bd[i]=(b0+b1+b2+b3+b4+b5+b6+wh*0.5362)*0.11*Math.pow(1-i/bs,0.25); b6=wh*0.115926;
        }
        const ns=this._src(buf),lp=this._f('lowpass',lpStart),dst=C.createWaveShaper();
        dst.curve=makeDistortionCurve(isAP?160:120); dst.oversample='4x';
        lp.frequency.exponentialRampToValueAtTime(28,t+decay);
        const ng=this._g(bodyLevel); ng.gain.exponentialRampToValueAtTime(0.001,t+decay);
        ns.connect(lp); lp.connect(dst); dst.connect(ng); ng.connect(OUT); ns.start(t);

        // TIEFER SUB-BASS
        const sub=this._osc('sine',subFreq),sg=this._g(subLevel);
        sub.frequency.exponentialRampToValueAtTime(6,t+decay*0.85);
        sg.gain.exponentialRampToValueAtTime(0.001,t+decay*0.85);
        sub.connect(sg); sg.connect(OUT); sub.start(t); sub.stop(t+decay*0.87);

        // MID-RUMBLE (Erdvibrationen)
        const ru=this._osc('sawtooth',240+Math.random()*40),rf=this._f('lowpass',500),rg=this._g(isAP?0.5:0.9);
        ru.frequency.exponentialRampToValueAtTime(24,t+1.1);
        rg.gain.exponentialRampToValueAtTime(0.001,t+1.1);
        ru.connect(rf); rf.connect(rg); rg.connect(OUT); ru.start(t); ru.stop(t+1.15);

        // FRAG: extra Splitter-Regen
        if(isFrag) {
            for(let i=0;i<5;i++){
                const ni=this._src(this._nb(0.025)),nif=this._f('highpass',2200+i*400),nig=this._g(0.35);
                nig.gain.exponentialRampToValueAtTime(0.001,t+0.15+i*0.12+0.025);
                ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t+0.12+i*0.12);
            }
        }

        // AP: metallischer Durchschlags-Zing
        if(isAP) {
            const zi=this._osc('sine',4200),zig=this._g(0.28);
            zi.frequency.exponentialRampToValueAtTime(320,t+0.6);
            zig.gain.exponentialRampToValueAtTime(0.001,t+0.6);
            zi.connect(zig); zig.connect(OUT); zi.start(t); zi.stop(t+0.62);
        }
    },

    setEngineRunning(isRunning) {
        if(!this.ctx) return;
        if(isRunning && !this.engineOsc) {
            // Basis-Diesel-Sound: Sägezahn + Square + Oberton
            this.engineOsc  = this._osc('sawtooth', 38);
            this._e2        = this._osc('square', 76);
            this._e3        = this._osc('triangle', 152);
            this.engineGain = this._g(0);
            const f1 = this._f('lowpass', 220);
            const f2 = this._f('lowpass', 400);
            const g2 = this._g(0.28);
            const g3 = this._g(0.12);
            this.engineOsc.connect(f1); f1.connect(this.engineGain);
            this._e2.connect(g2); g2.connect(this.engineGain);
            this._e3.connect(g3); g3.connect(this.engineGain);
            this.engineGain.connect(this._o());
            this.engineOsc.start(); this._e2.start(); this._e3.start();
            this.engineGain.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + 0.5);
            // Anlauf-Geräusch
            this.play('engineStart');
        } else if(!isRunning && this.engineOsc) {
            this.engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
            setTimeout(()=>{
                if(this.engineOsc){this.engineOsc.stop(); this.engineOsc=null;}
                if(this._e2){this._e2.stop(); this._e2=null;}
                if(this._e3){this._e3.stop(); this._e3=null;}
            }, 520);
        }
    },

    // Echtzeit Motor-Pitch Update — aufgerufen im Animate-Loop
    updateEnginePitch(speed, maxSpeed) {
        if(!this.ctx || !this.engineOsc) return;
        const norm = Math.min(1.0, Math.abs(speed) / maxSpeed);
        // Leerlauf 38Hz → Vollgas 85Hz
        const baseFreq = 38 + norm * 47;
        const t = this.ctx.currentTime;
        this.engineOsc.frequency.setTargetAtTime(baseFreq,      t, 0.08);
        this._e2.frequency.setTargetAtTime(baseFreq*2,          t, 0.08);
        if(this._e3) this._e3.frequency.setTargetAtTime(baseFreq*4, t, 0.08);
        // Lautstärke beim Gas geben leicht erhöhen
        const vol = 0.18 + norm * 0.12;
        this.engineGain.gain.setTargetAtTime(vol, t, 0.12);
    },

    // Ketten-Rost-Geräusch beim Fahren über Gelände
    _trackTimer: 0,
    updateTrackSound(speed, dt) {
        if(!this.ctx || Math.abs(speed) < 1) return;
        this._trackTimer = (this._trackTimer||0) + dt;
        const interval = 0.18 / (0.4 + Math.abs(speed)/30);
        if(this._trackTimer >= interval) {
            this._trackTimer = 0;
            // Kurzes Metall-Klirren
            const C=this.ctx, t=C.currentTime, OUT=this._o();
            const ni=this._src(this._nb(0.018)),nif=this._f('bandpass',1400+Math.random()*600,2.2),nig=this._g(0.08+Math.random()*0.04);
            nig.gain.exponentialRampToValueAtTime(0.001,t+0.018); ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t);
        }
    }
};

// Engine-Start wird separat definiert damit play() es nutzen kann
Audio.play = (function(origPlay){
    return function(type) {
        if(type === 'engineStart') {
            if(!this.ctx) return;
            const C=this.ctx, t=C.currentTime, OUT=this._o();
            // Anlauf: kurzer Turbo-Spool
            const o=this._osc('sawtooth',22),g=this._g(0);
            o.frequency.linearRampToValueAtTime(48,t+0.6);
            g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.18,t+0.3);
            g.gain.exponentialRampToValueAtTime(0.001,t+0.8);
            o.connect(g); g.connect(OUT); o.start(t); o.stop(t+0.85);
            return;
        }
        return origPlay.call(this, type);
    };
})(Audio.play);

// Setup UI Audio Hooks when script loads
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('button, .btn-move').forEach(el => {
        el.addEventListener('pointerenter', () => Audio.play('hover'));
        el.addEventListener('pointerdown', () => Audio.play('click'));
    });
    document.querySelectorAll('input[type=range]').forEach(el => {
        el.addEventListener('input', () => Audio.play('sliderTick'));
    });
});

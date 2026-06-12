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
    // Motor (aktiv wenn Tank fährt) — engine bündelt alle Nodes,
    // engineOsc bleibt als Kompatibilitäts-Referenz erhalten
    engine: null, engineOsc: null, engineRunning: false,
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

    // ── Panzermotor: Diesel-Knattern statt statischem Drone ──
    // Aufbau: Zündpuls-LFO (Sägezahn → Puls-Former) moduliert die Lautstärke
    // eines Layer-Busses aus Sub-Fundament, Block-Rumpeln, verzerrtem Growl
    // und Auspuff-Rauschen. Ein Rausch-Jitter macht die Drehzahl unregelmäßig,
    // ein leises Getriebesirren läuft unmoduliert obendrauf.
    setEngineRunning(isRunning) {
        if(!this.ctx) return;
        const C = this.ctx;
        if(isRunning && !this.engine) {
            const E = {};
            E.master = this._g(0);
            E.master.connect(this._o());

            // Zündpuls: Sägezahn-Rampe → scharfe Spitze einmal pro Zyklus
            E.chug = this._osc('sawtooth', 11);
            E.chugShaper = C.createWaveShaper();
            const pn = 1024, pc = new Float32Array(pn);
            for(let i = 0; i < pn; i++) { const x = i / (pn - 1); pc[i] = Math.pow(x, 5) * 2 - 1; }
            E.chugShaper.curve = pc;
            E.chugDepth = this._g(0.4);
            E.bus = this._g(0.55); // Basis-Pegel, vom Zündpuls auf-/abmoduliert
            E.chug.connect(E.chugShaper); E.chugShaper.connect(E.chugDepth);
            E.chugDepth.connect(E.bus.gain);
            E.bus.connect(E.master);

            // Drehzahl-Jitter: tieffrequentes Rauschen auf Zündrate und Tonhöhe
            E.jitterSrc = this._src(this._nb(2, true)); E.jitterSrc.loop = true;
            E.jitterFilt = this._f('lowpass', 6);
            E.jitterChug = this._g(2.2);
            E.jitterPitch = this._g(1.4);
            E.jitterSrc.connect(E.jitterFilt);
            E.jitterFilt.connect(E.jitterChug); E.jitterChug.connect(E.chug.frequency);
            E.jitterFilt.connect(E.jitterPitch);

            // Sub-Fundament
            E.sub = this._osc('sine', 15); E.subG = this._g(0.6);
            E.sub.connect(E.subG); E.subG.connect(E.bus);
            // Block-Rumpeln (Grundton)
            E.fund = this._osc('sawtooth', 30); E.fundLP = this._f('lowpass', 150); E.fundG = this._g(0.5);
            E.jitterPitch.connect(E.fund.frequency);
            E.fund.connect(E.fundLP); E.fundLP.connect(E.fundG); E.fundG.connect(E.bus);
            // Growl: leicht verstimmt + verzerrt — Schwebung gegen den Grundton
            E.growl = this._osc('sawtooth', 30.4); E.growlDist = C.createWaveShaper();
            E.growlDist.curve = makeDistortionCurve(40);
            E.growlLP = this._f('lowpass', 320); E.growlG = this._g(0.22);
            E.growl.connect(E.growlDist); E.growlDist.connect(E.growlLP);
            E.growlLP.connect(E.growlG); E.growlG.connect(E.bus);
            // Auspuff-Rasseln: rosa Rauschen, bandbegrenzt
            E.exh = this._src(this._nb(2.5, true)); E.exh.loop = true;
            E.exhBP = this._f('bandpass', 200, 0.6); E.exhG = this._g(0.45);
            E.exh.connect(E.exhBP); E.exhBP.connect(E.exhG); E.exhG.connect(E.bus);
            // Getriebesirren (leise, nicht puls-moduliert)
            E.whine = this._osc('triangle', 270); E.whineHP = this._f('highpass', 350); E.whineG = this._g(0.0);
            E.whine.connect(E.whineHP); E.whineHP.connect(E.whineG); E.whineG.connect(E.master);

            [E.chug, E.sub, E.fund, E.growl, E.whine].forEach(o => o.start());
            E.jitterSrc.start(); E.exh.start();

            E.master.gain.linearRampToValueAtTime(0.28, C.currentTime + 0.45);
            this.engine = E;
            this.engineOsc = E.fund; // Kompatibilität
            this.play('engineStart');
        } else if(!isRunning && this.engine) {
            const E = this.engine;
            E.master.gain.cancelScheduledValues(C.currentTime);
            E.master.gain.setTargetAtTime(0, C.currentTime, 0.15);
            setTimeout(() => {
                [E.chug, E.sub, E.fund, E.growl, E.whine, E.jitterSrc, E.exh]
                    .forEach(n => { try { n.stop(); } catch(e) {} });
                E.master.disconnect();
            }, 600);
            this.engine = null;
            this.engineOsc = null;
        }
    },

    // Echtzeit Motor-Pitch Update — aufgerufen im Animate-Loop
    updateEnginePitch(speed, maxSpeed) {
        if(!this.ctx || !this.engine) return;
        const E = this.engine, t = this.ctx.currentTime;
        const norm = Math.min(1.0, Math.abs(speed) / maxSpeed);
        // Drehzahl: Leerlauf 30 Hz → Volllast 58 Hz
        const f = 30 + norm * 28;
        E.fund.frequency.setTargetAtTime(f, t, 0.1);
        E.growl.frequency.setTargetAtTime(f * 1.013, t, 0.1);
        E.sub.frequency.setTargetAtTime(f * 0.5, t, 0.1);
        // Zündfolge: träges Leerlauf-Knattern → schnelles Hämmern unter Last
        E.chug.frequency.setTargetAtTime(10 + norm * 14, t, 0.1);
        // Unter Last wird der Puls flacher (Motor läuft "runder")
        E.chugDepth.gain.setTargetAtTime(0.42 - norm * 0.18, t, 0.15);
        E.bus.gain.setTargetAtTime(0.55 + norm * 0.15, t, 0.15);
        // Auspuff öffnet mit der Last
        E.exhBP.frequency.setTargetAtTime(180 + norm * 240, t, 0.12);
        E.exhG.gain.setTargetAtTime(0.4 + norm * 0.5, t, 0.12);
        // Getriebesirren steigt mit der Geschwindigkeit
        E.whine.frequency.setTargetAtTime(f * 9, t, 0.1);
        E.whineG.gain.setTargetAtTime(0.012 + norm * 0.05, t, 0.12);
        E.master.gain.setTargetAtTime(0.26 + norm * 0.14, t, 0.12);
    },

    // Kettengeräusch: dumpfes Glieder-Klacken + Boden-Wummern + seltenes Quietschen
    _trackTimer: 0,
    updateTrackSound(speed, dt) {
        if(!this.ctx || Math.abs(speed) < 1) return;
        this._trackTimer = (this._trackTimer||0) + dt;
        const interval = 0.16 / (0.4 + Math.abs(speed)/30);
        if(this._trackTimer >= interval) {
            this._trackTimer = 0;
            const C=this.ctx, t=C.currentTime, OUT=this._o();
            // Dumpfes Ketten-Klacken (Glied auf Laufrolle)
            const ni=this._src(this._nb(0.03)),nif=this._f('bandpass',650+Math.random()*500,1.1),nig=this._g(0.07+Math.random()*0.05);
            nig.gain.exponentialRampToValueAtTime(0.001,t+0.03);
            ni.connect(nif); nif.connect(nig); nig.connect(OUT); ni.start(t);
            // Boden-Wummern: jedes Glied drückt in den Untergrund
            const th=this._osc('sine',55+Math.random()*20),thg=this._g(0.085);
            th.frequency.exponentialRampToValueAtTime(30,t+0.07);
            thg.gain.exponentialRampToValueAtTime(0.001,t+0.07);
            th.connect(thg); thg.connect(OUT); th.start(t); th.stop(t+0.08);
            // Gelegentliches Metall-Quietschen der Kette
            if(Math.random() < 0.07) {
                const sq=this._osc('sine',900+Math.random()*500),sqg=this._g(0);
                sq.frequency.linearRampToValueAtTime(600+Math.random()*300,t+0.18);
                sqg.gain.setValueAtTime(0,t); sqg.gain.linearRampToValueAtTime(0.025,t+0.04);
                sqg.gain.exponentialRampToValueAtTime(0.001,t+0.2);
                sq.connect(sqg); sqg.connect(OUT); sq.start(t); sq.stop(t+0.22);
            }
        }
    }
};

// Engine-Start wird separat definiert damit play() es nutzen kann
Audio.play = (function(origPlay){
    return function(type) {
        if(type === 'engineStart') {
            if(!this.ctx) return;
            const C=this.ctx, t=C.currentTime, OUT=this._o();
            // Anlasser-Orgeln (Starter dreht den Block durch)
            const st=this._osc('sawtooth',52),stf=this._f('lowpass',480),stg=this._g(0);
            st.frequency.linearRampToValueAtTime(72,t+0.28);
            stg.gain.setValueAtTime(0,t); stg.gain.linearRampToValueAtTime(0.05,t+0.05);
            stg.gain.linearRampToValueAtTime(0.001,t+0.32);
            st.connect(stf); stf.connect(stg); stg.connect(OUT); st.start(t); st.stop(t+0.34);
            // Erste Zündungen: dumpfe Schläge in beschleunigender Folge
            [0.16, 0.30, 0.40, 0.47].forEach((d,i)=>{
                const o=this._osc('sine',75),g=this._g(0);
                o.frequency.exponentialRampToValueAtTime(32,t+d+0.09);
                g.gain.setValueAtTime(0,t+d); g.gain.linearRampToValueAtTime(0.22+i*0.03,t+d+0.008);
                g.gain.exponentialRampToValueAtTime(0.001,t+d+0.1);
                o.connect(g); g.connect(OUT); o.start(t+d); o.stop(t+d+0.11);
            });
            // Auspuff-Husten: Rauschstoß beim Anspringen
            const co=this._src(this._nb(0.45,true)),cof=this._f('bandpass',260,0.7),cog=this._g(0);
            cog.gain.setValueAtTime(0,t+0.14); cog.gain.linearRampToValueAtTime(0.5,t+0.2);
            cog.gain.exponentialRampToValueAtTime(0.001,t+0.6);
            co.connect(cof); cof.connect(cog); cog.connect(OUT); co.start(t+0.14);
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

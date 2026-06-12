// ── Gefechtsbericht ──
const TacFeed = {
    _el: null,
    init() { this._el = document.getElementById('tac-feed'); },
    log(msg, type) {
        if(!this._el) return;
        const div = document.createElement('div');
        div.className = 'tac-entry ' + (type || 'info');
        div.textContent = msg;
        this._el.prepend(div);
        setTimeout(() => div.remove(), 6000);
        // Keep max 6 entries
        while(this._el.children.length > 6) this._el.lastChild.remove();
    },
    hit(dmg, isPlayer, isDestroyed) {
        const who = isPlayer ? '🔵 Spieler' : '🔴 KI';
        const msg = isDestroyed
            ? `${who} Tank VERNICHTET!`
            : `${who} −${dmg} HP Treffer`;
        this.log(msg, 'hit');
    },
    cp(teamIdx, cpName) {
        const who = teamIdx === 0 ? '🔵 Spieler' : '🔴 KI';
        this.log(`${who} nimmt ${cpName} ein`, 'cp');
    },
    aiAction(msg) { this.log(`🤖 KI: ${msg}`, 'ai'); },
    adapt(msg)    { this.log(`⚖️ ${msg}`, 'adapt'); }
};

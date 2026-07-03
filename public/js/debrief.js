'use strict';

const Debrief = (() => {
  const el = document.getElementById('tab-debrief');
  const CS_KEY = 'tacview.callsign';

  const empty = () => ({ kills: 0, deaths: 0 });
  let session = empty();
  let match = empty();
  let sessionMatches = 0;
  let matchStart = null;
  let matchDirty = false;
  let manualCallsign = localStorage.getItem(CS_KEY) || '';

  function callsign() {
    const cfg = typeof OverlayCfg !== 'undefined' && OverlayCfg.getConfig && OverlayCfg.getConfig();
    const fromCfg = cfg && typeof cfg.playerName === 'string' ? cfg.playerName.trim() : '';
    return fromCfg || manualCallsign.trim();
  }

  function outcome(msg, cs) {
    const low = msg.toLowerCase();
    const idx = low.indexOf(cs.toLowerCase());
    if (idx < 0) return null;
    const selfLoss = low.search(/has crashed|has been wrecked/);
    if (selfLoss >= 0 && idx <= selfLoss) return 'death';
    const kill = low.search(/shot down|destroyed/);
    if (kill >= 0) return idx < kill ? 'kill' : 'death';
    return null;
  }

  function ingest(entries) {
    const cs = callsign();
    if (!cs) return;
    for (const entry of entries) {
      const msg = String(entry.msg || '').replace(/<\/?color[^>]*>/gi, '');
      if (/NET_PLAYER_/.test(msg)) continue;
      const result = outcome(msg, cs);
      if (!result) continue;
      if (matchStart === null) matchStart = Date.now();
      matchDirty = true;
      if (result === 'kill') { match.kills++; session.kills++; }
      else { match.deaths++; session.deaths++; }
    }
  }

  function reset() {
    if (matchDirty) sessionMatches++;
    match = empty();
    matchStart = null;
    matchDirty = false;
  }

  function ratio(k, d) {
    if (d === 0) return k > 0 ? k.toFixed(2) : '0.00';
    return (k / d).toFixed(2);
  }

  function fmtClock(ms) {
    if (ms === null) return '--:--';
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function render() {
    const cs = callsign();
    const csFromCfg = typeof OverlayCfg !== 'undefined' && OverlayCfg.getConfig &&
      OverlayCfg.getConfig() && (OverlayCfg.getConfig().playerName || '').trim();
    const clock = fmtClock(matchStart === null ? null : Date.now() - matchStart);

    el.innerHTML =
      '<div class="db-beta">DEBRIEF is a beta trial. Kill/death detection reads your ' +
      'callsign out of the battle log, so it needs an exact match and can miss assists ' +
      'or team-kills.</div>' +
      (csFromCfg
        ? `<div class="db-cs-note">Tracking callsign <b>${escHtml(cs)}</b> (from overlay config)</div>`
        : `<label class="db-cs">CALLSIGN <input type="text" id="db-cs-input" placeholder="your exact in-game name" value="${escHtml(manualCallsign)}"></label>`) +
      '<div class="db-grid">' +
      card('MATCH', match, clock) +
      card('SESSION', session, `${sessionMatches} MATCH${sessionMatches === 1 ? '' : 'ES'}`) +
      '</div>' +
      (cs ? '' : '<div class="db-hint">Set your callsign above to start tracking.</div>');

    const input = el.querySelector('#db-cs-input');
    if (input) {
      input.addEventListener('change', () => {
        manualCallsign = input.value.trim();
        localStorage.setItem(CS_KEY, manualCallsign);
        render();
      });
    }
  }

  function card(title, s, sub) {
    return (
      `<div class="db-card"><div class="db-card-title">${title}</div>` +
      `<div class="db-kd"><span class="db-k">${s.kills}</span><span class="db-sep">/</span><span class="db-d">${s.deaths}</span></div>` +
      `<div class="db-ratio">K/D ${ratio(s.kills, s.deaths)}</div>` +
      `<div class="db-sub">${sub}</div></div>`
    );
  }

  function escHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  render();
  setInterval(() => { if (!el.classList.contains('hidden')) render(); }, 1000);

  return { ingest, reset };
})();

'use strict';

const Overlay = (() => {
  const btn = document.getElementById('btn-overlay');
  const STORE_KEY = 'tacview.overlay';
  const DEFAULTS = { dim: 100, nav: true, threat: true, ship: true };

  let pip = null;
  let timer = null;
  let opening = false;
  let arrowAngle = 0;
  let settings = loadSettings();

  function sv(st, prefix) {
    if (!st) return undefined;
    const key = Object.keys(st).find((k) => k.startsWith(prefix));
    return key === undefined ? undefined : st[key];
  }

  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  }

  const CSS = `
    html { height: 100%; background: #04070a; }
    body { margin: 0; color: #b8d4cd; background: #04070a;
      font: 13px 'Consolas', monospace; overflow: hidden;
      border: 1px solid #1f4a56; height: 100%; box-sizing: border-box;
      display: flex; flex-direction: column; justify-content: space-evenly;
      padding: 14px 10px 4px; position: relative; }
    #o-title { position: absolute; top: 2px; left: 10px; font-size: 8px;
      letter-spacing: 3px; color: #2b5a52; user-select: none; }
    .row { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    .row.off { display: none; }
    .lbl { font-size: 9px; letter-spacing: 2px; color: #4e6f6c; width: 42px; }
    #o-arrow { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
    #o-arrow svg { transition: transform 0.25s ease; filter: drop-shadow(0 0 4px #35c4e8); }
    #o-arrow svg.aligned { filter: drop-shadow(0 0 5px #29ff9e); }
    #o-arrow svg.hidden { visibility: hidden; }
    #o-mark { color: #35c4e8; font-size: 15px; }
    #o-wp { color: #35c4e8; font-size: 16px; }
    #o-threat { font-size: 13px; }
    #o-threat.hot { color: #ff3b3b; }
    #o-threat.cold { color: #ffb02e; }
    #o-threat.none { color: #4e6f6c; }
    .tele span { color: #dffef2; margin-right: 14px; }
    .tele b { color: #29ff9e; font-weight: normal; }
    #o-gear { position: absolute; top: 3px; right: 5px; background: none;
      border: none; color: #4e6f6c; cursor: pointer; font-size: 13px; padding: 2px; }
    #o-gear:hover { color: #29ff9e; }
    #o-settings { position: absolute; inset: 0; background: rgba(4, 7, 10, 0.97);
      display: flex; flex-direction: column; justify-content: center; gap: 8px;
      padding: 8px 14px; box-sizing: border-box; z-index: 5; }
    #o-settings.hidden { display: none; }
    #o-settings label { display: flex; align-items: center; gap: 8px;
      font-size: 11px; letter-spacing: 1px; color: #b8d4cd; cursor: pointer; }
    #o-settings input[type=range] { flex: 1; accent-color: #29ff9e; }
    #o-settings input[type=checkbox] { accent-color: #29ff9e; }
    #o-close-settings { align-self: flex-end; background: none; border: 1px solid #1f4a56;
      color: #29ff9e; font: 10px 'Consolas', monospace; letter-spacing: 2px;
      padding: 2px 10px; cursor: pointer; }
  `;

  function fmtRange(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)}KM` : `${Math.round(m)}M`;
  }
  function pad3(deg) { return String(Math.round(deg)).padStart(3, '0'); }

  function applySettings() {
    if (!pip) return;
    const d = pip.document;
    d.body.style.filter = `brightness(${settings.dim / 100})`;
    d.getElementById('o-row-nav').classList.toggle('off', !settings.nav);
    d.getElementById('o-row-threat').classList.toggle('off', !settings.threat);
    d.getElementById('o-row-ship').classList.toggle('off', !settings.ship);
  }

  function buildDoc(doc) {
    doc.title = 'TacView Overlay';
    const style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.appendChild(style);
    doc.body.innerHTML =
      '<div id="o-title">TACVIEW OVERLAY</div>' +
      '<button id="o-gear" title="Overlay settings">⚙</button>' +
      '<div class="row" id="o-row-nav"><span class="lbl">NAV</span>' +
      '<span id="o-arrow"><svg width="16" height="16" viewBox="0 0 22 22" class="hidden">' +
      '<path d="M 11,1 L 19,20 L 11,14.5 L 3,20 Z" fill="#35c4e8"/></svg></span>' +
      '<span id="o-mark"></span><span id="o-wp">NO WAYPOINT</span></div>' +
      '<div class="row" id="o-row-threat"><span class="lbl">THREAT</span><span id="o-threat" class="none">—</span></div>' +
      '<div class="row tele" id="o-row-ship"><span class="lbl">SHIP</span><span id="o-tele">—</span></div>' +
      '<div id="o-settings" class="hidden">' +
      `<label>BRIGHTNESS <input type="range" id="o-alpha" min="35" max="100" value="${settings.dim}"></label>` +
      `<label><input type="checkbox" id="o-chk-nav" ${settings.nav ? 'checked' : ''}> NAV — waypoint steering</label>` +
      `<label><input type="checkbox" id="o-chk-threat" ${settings.threat ? 'checked' : ''}> THREAT — nearest hostile</label>` +
      `<label><input type="checkbox" id="o-chk-ship" ${settings.ship ? 'checked' : ''}> SHIP — speed / alt / heading</label>` +
      '<button id="o-close-settings">DONE</button>' +
      '</div>';

    const panel = doc.getElementById('o-settings');
    doc.getElementById('o-gear').addEventListener('click', () => panel.classList.toggle('hidden'));
    doc.getElementById('o-close-settings').addEventListener('click', () => panel.classList.add('hidden'));
    doc.getElementById('o-alpha').addEventListener('input', (e) => {
      settings = { ...settings, dim: Number(e.target.value) };
      saveSettings();
      applySettings();
    });
    for (const key of ['nav', 'threat', 'ship']) {
      doc.getElementById(`o-chk-${key}`).addEventListener('change', (e) => {
        settings = { ...settings, [key]: e.target.checked };
        saveSettings();
        applySettings();
      });
    }
    applySettings();
  }

  function update() {
    if (!pip) return;
    const d = pip.document;
    const ind = TacApi.state.indicators;
    const st = TacApi.state.vehicleState || {};
    const hdg = ind ? (ind.compass || 0) : null;

    if (settings.nav) {
      const ws = Waypoints.activeStatus();
      const wpNotice = Waypoints.getNotice();
      const svg = d.querySelector('#o-arrow svg');
      const elMark = d.getElementById('o-mark');
      const elWp = d.getElementById('o-wp');
      let arrowShown = false;
      elMark.textContent = '';
      if (wpNotice) {
        elMark.textContent = '✔';
        elWp.textContent = wpNotice;
      } else if (ws) {
        if (ws.kind === 'poi' && ws.arrived) {
          elMark.textContent = '◎';
          elWp.textContent = `AT ${ws.label}`;
        } else {
          let text = `${ws.label} ${pad3(ws.bearing)}° ${fmtRange(ws.range)}`;
          if (hdg !== null) {
            const rel = ((ws.bearing - hdg + 540) % 360) - 180;
            text += `  ${rel < 0 ? 'L' : 'R'}${Math.abs(Math.round(rel))}°`;
            const delta = (((rel - arrowAngle) % 360) + 540) % 360 - 180;
            arrowAngle += delta;
            svg.style.transform = `rotate(${arrowAngle}deg)`;
            const aligned = Math.abs(rel) < 8;
            svg.classList.toggle('aligned', aligned);
            svg.querySelector('path').setAttribute('fill', aligned ? '#29ff9e' : '#35c4e8');
            arrowShown = true;
          }
          elWp.textContent = text;
        }
      } else {
        elWp.textContent = Waypoints.getAll().length ? 'NAV SET — AWAITING OWNSHIP' : 'NO WAYPOINT';
      }
      svg.classList.toggle('hidden', !arrowShown);
    }

    if (settings.threat) {
      const top = Threats.getTop();
      const elThreat = d.getElementById('o-threat');
      if (top) {
        elThreat.textContent =
          `${top.label} ${fmtRange(top.range)} BRG ${pad3(top.bearing)}°${top.air ? (top.hot ? ' — HOT' : ' — COLD') : ''}`;
        elThreat.className = top.hot ? 'hot' : 'cold';
      } else {
        elThreat.textContent = 'NO HOSTILE CONTACTS';
        elThreat.className = 'none';
      }
    }

    if (settings.ship) {
      const elTele = d.getElementById('o-tele');
      if (ind) {
        if (ind.army === 'tank') {
          elTele.innerHTML = `SPD <b>${Math.round(ind.speed || 0)}</b> HDG <b>${pad3(hdg)}</b>`;
        } else {
          const ias = sv(st, 'IAS,');
          const alt = sv(st, 'H,');
          elTele.innerHTML =
            `IAS <b>${ias !== undefined ? Math.round(ias) : '—'}</b> ` +
            `ALT <b>${alt !== undefined ? Math.round(alt) : '—'}</b> ` +
            `HDG <b>${pad3(hdg)}</b>`;
        }
      } else {
        elTele.textContent = 'NO VEHICLE FEED';
      }
    }
  }

  async function toggle(forcePip = false) {
    if (pip) { pip.close(); return; }
    if (opening) return;
    opening = true;
    try {
      await doOpen(forcePip);
    } finally {
      opening = false;
    }
  }

  async function doOpen(forcePip) {
    if (!forcePip) {
      try {
        const res = await fetch(`${TacApi.syncBase}/sync/overlay`, { method: 'POST' });
        if (res.ok) {
          btn.textContent = 'NATIVE ▸ UP';
          setTimeout(() => { btn.textContent = 'OVERLAY'; }, 2500);
          return;
        }
      } catch (_) {}
    }

    if (!('documentPictureInPicture' in window)) {
      btn.textContent = 'OVERLAY N/A';
      btn.title = 'Document Picture-in-Picture requires Chrome/Edge 116+';
      return;
    }
    try {
      pip = await documentPictureInPicture.requestWindow({ width: 400, height: 140 });
    } catch (err) {
      console.error('[Overlay] PiP request failed:', err);
      return;
    }
    buildDoc(pip.document);
    pip.addEventListener('pagehide', () => {
      pip = null;
      clearInterval(timer);
      btn.classList.remove('on');
    });
    timer = setInterval(update, 250);
    update();
    btn.classList.add('on');
  }

  btn.addEventListener('click', (e) => toggle(e.shiftKey));
  return { toggle };
})();

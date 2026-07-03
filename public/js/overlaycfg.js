'use strict';

const OverlayCfg = (() => {
  const btn = document.getElementById('btn-overlay-cfg');
  const panel = document.getElementById('overlay-cfg-panel');

  const WIDGETS = [
    { key: 'nav', label: 'NAV — waypoint steering' },
    { key: 'threat', label: 'THREAT — nearest hostile' },
    { key: 'ship', label: 'SHIP — speed / alt / heading' },
    { key: 'fuel', label: 'FUEL — remaining + endurance' },
    { key: 'caution', label: 'CAUTION — alerts only when wrong' },
    { key: 'feed', label: 'FEED — your latest kill/damage' },
  ];

  let config = null;

  async function load() {
    try {
      const res = await fetch(`${TacApi.syncBase}/sync/overlay-config`);
      if (!res.ok) throw new Error('bad status');
      config = await res.json();
      btn.classList.remove('hidden');
    } catch (_) {
      config = null;
      btn.classList.add('hidden');
    }
  }

  const PALETTE = ['#35c4e8', '#29ff9e', '#ffb02e', '#e8f4f0', '#ff5050', '#b48cff'];

  const HOTKEY_RE = /^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z0-9]|F([1-9]|1[0-2]))$/;

  let pushTimer = null;
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const { widgets, opacity, fontScale, playerName, navColor, textColor,
        navPopout, clickThrough, hotkeyToggle, hotkeyCycle } = config;
      fetch(`${TacApi.syncBase}/sync/overlay-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets, opacity, fontScale, playerName, navColor, textColor,
          navPopout, clickThrough, hotkeyToggle, hotkeyCycle }),
      }).catch(() => {});
    }, 250);
  }

  function swatchRow(label, key) {
    const swatches = PALETTE.map((c) =>
      `<span class="sw ${config[key] === c ? 'sel' : ''}" data-k="${key}" data-c="${c}" style="background:${c}"></span>`
    ).join('');
    return `<div class="cfg-row swatches"><span class="sw-label">${label}</span>${swatches}</div>`;
  }

  const PRESETS = {
    DOGFIGHT: { nav: false, threat: true, ship: true, fuel: false, caution: true, feed: true },
    'NAV/STRIKE': { nav: true, threat: true, ship: true, fuel: true, caution: true, feed: false },
    GROUND: { nav: true, threat: true, ship: true, fuel: false, caution: true, feed: true },
  };

  function render() {
    if (!config) return;
    const rows = WIDGETS.map((w) =>
      `<label class="cfg-row"><input type="checkbox" data-w="${w.key}" ${config.widgets[w.key] ? 'checked' : ''}> ${w.label}</label>`
    ).join('');
    const presetBtns = Object.keys(PRESETS).map((p) =>
      `<button class="cfg-preset" data-p="${p}">${p}</button>`
    ).join('');
    panel.innerHTML =
      '<div class="cfg-title">NATIVE OVERLAY CONFIG <span class="cfg-live">LIVE</span></div>' +
      `<div class="cfg-presets">${presetBtns}</div>` +
      rows +
      `<label class="cfg-row slider">OPACITY <input type="range" id="cfg-opacity" min="20" max="100" value="${config.opacity}"><span id="cfg-opacity-v">${config.opacity}%</span></label>` +
      `<label class="cfg-row slider">TEXT SIZE <input type="range" id="cfg-font" min="70" max="160" value="${config.fontScale}"><span id="cfg-font-v">${config.fontScale}%</span></label>` +
      `<label class="cfg-row">CALLSIGN <input type="text" id="cfg-player" placeholder="filters FEED to you" value="${(config.playerName || '').replace(/"/g, '&quot;')}"></label>` +
      swatchRow('NAV COLOR', 'navColor') +
      swatchRow('TEXT COLOR', 'textColor') +
      `<label class="cfg-row"><input type="checkbox" id="cfg-popout" ${config.navPopout ? 'checked' : ''}> NAV POPOUT — separate window</label>` +
      `<label class="cfg-row" title="Mouse clicks pass straight through the overlay. Turn off to drag it again."><input type="checkbox" id="cfg-clickthrough" ${config.clickThrough ? 'checked' : ''}> CLICK-THROUGH — overlay ignores the mouse</label>` +
      `<label class="cfg-row hotkey">SHOW/HIDE KEY <input type="text" id="cfg-hk-toggle" placeholder="Ctrl+Alt+T" value="${(config.hotkeyToggle || '').replace(/"/g, '&quot;')}"></label>` +
      `<label class="cfg-row hotkey">CYCLE NAV KEY <input type="text" id="cfg-hk-cycle" placeholder="Ctrl+Alt+N" value="${(config.hotkeyCycle || '').replace(/"/g, '&quot;')}"></label>` +
      '<div class="cfg-hint">Hotkeys work in-game. Format: Ctrl+Alt+T, Shift+F6, A-Z / 0-9 / F1-F12.</div>';

    panel.querySelectorAll('.cfg-preset').forEach((el) => {
      el.addEventListener('click', () => {
        config = { ...config, widgets: { ...PRESETS[el.dataset.p] } };
        push();
        render();
      });
    });
    panel.querySelector('#cfg-player').addEventListener('input', (e) => {
      config = { ...config, playerName: e.target.value };
      push();
    });
    panel.querySelectorAll('.sw').forEach((el) => {
      el.addEventListener('click', () => {
        config = { ...config, [el.dataset.k]: el.dataset.c };
        push();
        render();
      });
    });
    panel.querySelector('#cfg-popout').addEventListener('change', (e) => {
      config = { ...config, navPopout: e.target.checked };
      push();
    });
    panel.querySelector('#cfg-clickthrough').addEventListener('change', (e) => {
      config = { ...config, clickThrough: e.target.checked };
      push();
    });
    [['#cfg-hk-toggle', 'hotkeyToggle'], ['#cfg-hk-cycle', 'hotkeyCycle']].forEach(([sel, key]) => {
      const input = panel.querySelector(sel);
      input.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        const ok = value === '' || HOTKEY_RE.test(value);
        e.target.classList.toggle('bad', !ok);
        if (!ok) return;
        config = { ...config, [key]: value };
        push();
      });
    });
    panel.querySelectorAll('input[data-w]').forEach((el) => {
      el.addEventListener('change', () => {
        config = { ...config, widgets: { ...config.widgets, [el.dataset.w]: el.checked } };
        push();
      });
    });
    panel.querySelector('#cfg-opacity').addEventListener('input', (e) => {
      config = { ...config, opacity: Number(e.target.value) };
      panel.querySelector('#cfg-opacity-v').textContent = `${config.opacity}%`;
      push();
    });
    panel.querySelector('#cfg-font').addEventListener('input', (e) => {
      config = { ...config, fontScale: Number(e.target.value) };
      panel.querySelector('#cfg-font-v').textContent = `${config.fontScale}%`;
      push();
    });
  }

  btn.addEventListener('click', async () => {
    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      return;
    }
    await load();
    render();
    panel.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(panel) && !path.includes(btn)) panel.classList.add('hidden');
  });

  load();
  return { load, getConfig: () => config };
})();

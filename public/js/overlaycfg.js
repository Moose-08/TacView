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

  let pushTimer = null;
  function push() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const { widgets, opacity, fontScale, playerName, navColor, textColor, navPopout } = config;
      fetch(`${TacApi.syncBase}/sync/overlay-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets, opacity, fontScale, playerName, navColor, textColor, navPopout }),
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
      `<label class="cfg-row"><input type="checkbox" id="cfg-popout" ${config.navPopout ? 'checked' : ''}> NAV POPOUT — separate window</label>`;

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
  return { load };
})();

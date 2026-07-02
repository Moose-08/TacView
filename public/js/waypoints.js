'use strict';

const Waypoints = (() => {
  const elList = document.getElementById('wp-list');
  const NOTICE_MS = 5000;
  const ARRIVE_RADIUS_M = { air: 2000, ground: 300, ship: 600 };

  let list = [];
  let uid = 1;
  let wpSeq = 1;
  let poiSeq = 1;
  let activeId = null;
  let notice = null;

  function add(fx, fy, kind = 'wp') {
    const label = kind === 'poi' ? `POI${poiSeq++}` : `WP${wpSeq++}`;
    const wp = { id: uid++, kind, label, x: fx, y: fy };
    list = [...list, wp];
    if (activeId === null) activeId = wp.id;
    renderPanel();
  }

  function remove(id) {
    list = list.filter((w) => w.id !== id);
    if (activeId === id) {
      const next = list.find((w) => w.kind === 'wp') || list[0] || null;
      activeId = next ? next.id : null;
    }
    renderPanel();
  }

  function clear() {
    list = [];
    activeId = null;
    uid = 1;
    wpSeq = 1;
    poiSeq = 1;
    notice = null;
    renderPanel();
  }

  function getAll() { return list; }
  function isActive(id) { return id === activeId; }

  function arriveRadius() {
    const ind = TacApi.state.indicators;
    if (ind && ind.army === 'tank') return ARRIVE_RADIUS_M.ground;
    if (ind && typeof ind.army === 'string' && ind.army.startsWith('ship')) return ARRIVE_RADIUS_M.ship;
    return ARRIVE_RADIUS_M.air;
  }

  function statusOf(wp) {
    const info = TacApi.state.mapInfo;
    const player = TacApi.state.mapObjects.find((o) => o.icon === 'Player');
    if (!info || !player) return null;
    const world = info.map_max[0] - info.map_min[0];
    const dxm = (wp.x - player.x) * world;
    const dym = (wp.y - player.y) * world;
    return {
      range: Math.hypot(dxm, dym),
      bearing: (Math.atan2(dxm, -dym) * 180 / Math.PI + 360) % 360,
    };
  }

  function activeStatus() {
    const wp = list.find((w) => w.id === activeId);
    if (!wp) return null;
    const s = statusOf(wp);
    if (!s) return null;
    return {
      id: wp.id,
      label: wp.label,
      kind: wp.kind,
      range: s.range,
      bearing: s.bearing,
      arrived: s.range < arriveRadius(),
    };
  }

  function getNotice() {
    return notice && Date.now() < notice.until ? notice.text : null;
  }

  function checkArrival() {
    const wp = list.find((w) => w.id === activeId);
    if (!wp || wp.kind !== 'wp') return;
    const s = statusOf(wp);
    if (!s || s.range >= arriveRadius()) return;

    list = list.filter((w) => w.id !== wp.id);
    const next = list.find((w) => w.kind === 'wp') || list[0] || null;
    activeId = next ? next.id : null;
    notice = {
      text: `${wp.label} REACHED${next ? ` ▸ NEXT ${next.label}` : ' ▸ ROUTE COMPLETE'}`,
      until: Date.now() + NOTICE_MS,
    };
    renderPanel();
  }

  function fmtRange(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)}KM` : `${Math.round(m)}M`;
  }

  function navTextFor(wp) {
    const s = statusOf(wp);
    if (!s) return 'NO OWNSHIP';
    if (wp.kind === 'poi' && s.range < arriveRadius()) return 'AT POI';
    return `${String(Math.round(s.bearing)).padStart(3, '0')}° · ${fmtRange(s.range)}`;
  }

  function renderPanel() {
    const noticeHtml = getNotice()
      ? `<div class="wp-notice">✔ ${getNotice()}</div>` : '';
    if (!list.length) {
      elList.innerHTML = noticeHtml ||
        '<div class="dim-note">R-CLICK MAP: WAYPOINT<br>SHIFT+R-CLICK: POI</div>';
      return;
    }
    elList.innerHTML = noticeHtml + list.map((wp) =>
      `<div class="wp-row ${wp.kind} ${wp.id === activeId ? 'active' : ''}" data-id="${wp.id}">` +
      `<span class="wi">${wp.label}</span>` +
      `<span class="wn"></span>` +
      `<button class="wx" data-del="${wp.id}" title="Remove">✕</button></div>`
    ).join('');
    updateNavTexts();
  }

  function updateNavTexts() {
    elList.querySelectorAll('.wp-row').forEach((row) => {
      const wp = list.find((w) => w.id === Number(row.dataset.id));
      if (!wp) return;
      const nav = navTextFor(wp);
      const wn = row.querySelector('.wn');
      if (wn && wn.textContent !== nav) wn.textContent = nav;
    });
  }

  function tick() {
    checkArrival();
    if (elList.querySelector('.wp-notice') && !getNotice()) {
      renderPanel();
      return;
    }
    updateNavTexts();
  }

  elList.addEventListener('pointerdown', (e) => {
    const del = e.target.getAttribute('data-del');
    if (del !== null) {
      e.preventDefault();
      e.stopPropagation();
      remove(Number(del));
    }
  });

  elList.addEventListener('click', (e) => {
    if (e.target.getAttribute('data-del') !== null) return;
    const row = e.target.closest('.wp-row');
    if (row) { activeId = Number(row.dataset.id); renderPanel(); }
  });
  document.getElementById('wp-clear').addEventListener('click', clear);

  renderPanel();
  return { add, remove, clear, getAll, isActive, activeStatus, getNotice, tick };
})();

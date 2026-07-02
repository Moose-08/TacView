'use strict';

const Threats = (() => {
  const elList = document.getElementById('threat-list');
  const elCount = document.getElementById('threat-count');
  let topThreat = null;
  const MAX_ROWS = 10;
  const HOT_CONE_RAD = Math.PI / 5;

  const TYPE_LABELS = {
    LightTank: 'LT', MediumTank: 'MT', HeavyTank: 'HT', SPAA: 'AA',
    TankDestroyer: 'TD', SPG: 'SPG', Wheeled: 'WHL', Ship: 'SHP',
    TorpedoBoat: 'TB', Fighter: 'FTR', Assault: 'ATK', Bomber: 'BMB',
    Airdefence: 'SAM', Structure: 'STR',
  };

  function isHostile(o) {
    const [r, g, b] = o['color[]'] || [128, 128, 128];
    return r > 180 && g < 110 && b < 110;
  }

  function typeLabel(o) {
    if (TYPE_LABELS[o.icon]) return TYPE_LABELS[o.icon];
    if (o.type === 'aircraft') return 'AIR';
    return 'GND';
  }

  function fmtRange(metres) {
    return metres >= 1000 ? `${(metres / 1000).toFixed(1)}KM` : `${Math.round(metres)}M`;
  }

  function severity(t) {
    if (t.o.type === 'aircraft') {
      if (t.range < 5000) return 'danger';
      if (t.range < 15000) return 'warn';
    } else {
      if (t.range < 2000) return 'danger';
      if (t.range < 5000) return 'warn';
    }
    return '';
  }

  function assess(o, player, world) {
    const dxm = (o.x - player.x) * world;
    const dym = (o.y - player.y) * world;
    const range = Math.hypot(dxm, dym);
    const bearing = (Math.atan2(dxm, -dym) * 180 / Math.PI + 360) % 360;

    let hot = false;
    if (o.type === 'aircraft' && o.dx !== undefined) {
      const heading = Math.atan2(o.dy, o.dx);
      const toPlayer = Math.atan2(player.y - o.y, player.x - o.x);
      let diff = Math.abs(heading - toPlayer);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      hot = diff < HOT_CONE_RAD;
    }
    return { o, range, bearing, hot };
  }

  function rowHtml(t, idx) {
    const air = t.o.type === 'aircraft';
    const aspect = air ? `<span class="th ${t.hot ? 'hot' : 'cold'}">${t.hot ? 'HOT' : 'COLD'}</span>` : '<span class="th"></span>';
    const sector = typeof TacMap !== 'undefined' ? TacMap.sectorName(t.o.x, t.o.y) : '—';
    return `<div class="threat-row ${severity(t)}">` +
      `<span class="ti">${String(idx + 1).padStart(2, '0')}</span>` +
      `<span class="tt">${typeLabel(t.o)}</span>` +
      `<span class="tr">${fmtRange(t.range)}</span>` +
      `<span class="tb">${String(Math.round(t.bearing)).padStart(3, '0')}°</span>` +
      `<span class="ts">${sector}</span>` +
      aspect +
      `</div>`;
  }

  function update(objects) {
    const info = TacApi.state.mapInfo;
    const player = objects.find((o) => o.icon === 'Player');
    if (!player || !info) {
      topThreat = null;
      elCount.textContent = '';
      elList.innerHTML = '<div class="dim-note">NO OWNSHIP REFERENCE</div>';
      return;
    }
    const world = info.map_max[0] - info.map_min[0];

    const threats = objects
      .filter((o) => (o.type === 'aircraft' || o.type === 'ground_model') && o.x !== undefined && isHostile(o))
      .map((o) => assess(o, player, world))
      .sort((a, b) => a.range - b.range);

    elCount.textContent = threats.length ? `${threats.length} TRACKED` : '';
    if (!threats.length) {
      topThreat = null;
      elList.innerHTML = '<div class="dim-note">NO HOSTILE CONTACTS</div>';
      return;
    }
    const t = threats[0];
    topThreat = {
      label: typeLabel(t.o),
      range: t.range,
      bearing: t.bearing,
      hot: t.hot,
      air: t.o.type === 'aircraft',
    };
    elList.innerHTML = threats.slice(0, MAX_ROWS).map(rowHtml).join('');
  }

  function getTop() { return topThreat; }

  return { update, getTop };
})();

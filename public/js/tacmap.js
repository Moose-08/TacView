'use strict';

const TacMap = (() => {
  const canvas = document.getElementById('tacmap');
  const ctx = canvas.getContext('2d');
  const readout = document.getElementById('map-readout');

  const view = { zoom: 1, panX: 0, panY: 0 };
  const options = { grid: true, labels: true, trail: true, follow: false };

  let mapImage = null;
  let mapInfo = null;
  let objects = [];
  let trail = [];
  let mouse = { x: 0, y: 0, inside: false };
  let dragging = false;
  let dragStart = null;

  const HOSTILE = '#ff3b3b';
  const FRIENDLY = '#35c4e8';
  const PLAYER = '#29ff9e';

  function baseFit() {
    const w = canvas.width, h = canvas.height;
    const size = Math.min(w, h);
    return { scale: size, offX: (w - size) / 2, offY: (h - size) / 2 };
  }

  function toScreen(fx, fy) {
    const f = baseFit();
    return {
      x: (fx * f.scale + f.offX) * view.zoom + view.panX,
      y: (fy * f.scale + f.offY) * view.zoom + view.panY,
    };
  }

  function toMapFraction(sx, sy) {
    const f = baseFit();
    return {
      x: ((sx - view.panX) / view.zoom - f.offX) / f.scale,
      y: ((sy - view.panY) / view.zoom - f.offY) / f.scale,
    };
  }

  function resetView() {
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const newZoom = Math.min(40, Math.max(0.5, view.zoom * factor));
    const applied = newZoom / view.zoom;
    view.panX = e.offsetX - (e.offsetX - view.panX) * applied;
    view.panY = e.offsetY - (e.offsetY - view.panY) * applied;
    view.zoom = newZoom;
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    dragStart = { x: e.offsetX - view.panX, y: e.offsetY - view.panY };
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('mousemove', (e) => {
    mouse = { x: e.offsetX, y: e.offsetY, inside: true };
    if (dragging && dragStart) {
      options.follow = false;
      const followBox = document.getElementById('opt-follow');
      if (followBox) followBox.checked = false;
      view.panX = e.offsetX - dragStart.x;
      view.panY = e.offsetY - dragStart.y;
    }
  });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
  canvas.addEventListener('dblclick', resetView);

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (typeof Waypoints === 'undefined') return;
    for (const wp of Waypoints.getAll()) {
      const p = toScreen(wp.x, wp.y);
      if (Math.hypot(p.x - e.offsetX, p.y - e.offsetY) < 14) {
        Waypoints.remove(wp.id);
        return;
      }
    }
    const f = toMapFraction(e.offsetX, e.offsetY);
    if (f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1) {
      Waypoints.add(f.x, f.y, e.shiftKey ? 'poi' : 'wp');
    }
  });

  function gridFractions() {
    if (!mapInfo) return null;
    const world = mapInfo.map_max[0] - mapInfo.map_min[0];
    const [stepX, stepY] = mapInfo.grid_steps;
    const [zeroX, zeroY] = mapInfo.grid_zero;
    const [sizeX, sizeY] = mapInfo.grid_size;
    return {
      stepFx: stepX / world,
      stepFy: stepY / world,
      startFx: (zeroX - mapInfo.map_min[0]) / world,
      startFy: (mapInfo.map_max[1] - zeroY) / world,
      cols: Math.round(Math.abs(sizeX) / stepX),
      rows: Math.round(Math.abs(sizeY) / stepY),
    };
  }

  function drawGrid() {
    const g = gridFractions();
    if (!g) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(41, 255, 158, 0.14)';
    ctx.fillStyle = 'rgba(41, 255, 158, 0.5)';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.lineWidth = 1;

    for (let c = 0; c <= g.cols; c++) {
      const fx = g.startFx + c * g.stepFx;
      if (fx < 0 || fx > 1) continue;
      const a = toScreen(fx, 0);
      const b = toScreen(fx, 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (c < g.cols) {
        const mid = toScreen(fx + g.stepFx / 2, 0);
        ctx.fillText(String.fromCharCode(65 + c), mid.x - 4, Math.max(a.y, 14) + 14);
      }
    }
    for (let r = 0; r <= g.rows; r++) {
      const fy = g.startFy + r * g.stepFy;
      if (fy < 0 || fy > 1) continue;
      const a = toScreen(0, fy);
      const b = toScreen(1, fy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (r < g.rows) {
        const mid = toScreen(0, fy + g.stepFy / 2);
        ctx.fillText(String(r + 1), Math.max(a.x, 4) + 6, mid.y + 4);
      }
    }
    ctx.restore();
  }

  function sectorName(fx, fy) {
    const g = gridFractions();
    if (!g) return '—';
    const col = Math.floor((fx - g.startFx) / g.stepFx);
    const row = Math.floor((fy - g.startFy) / g.stepFy);
    if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return 'OFF-GRID';
    return String.fromCharCode(65 + col) + (row + 1);
  }

  function isPlayer(o) { return o.icon === 'Player'; }

  function relationColor(o) {
    if (isPlayer(o)) return PLAYER;
    const [r, g, b] = o['color[]'] || [128, 128, 128];
    if (r > 180 && g < 110 && b < 110) return HOSTILE;
    return FRIENDLY;
  }

  function labelFor(o) {
    const map = {
      LightTank: 'LT', MediumTank: 'MT', HeavyTank: 'HT', SPAA: 'AA',
      TankDestroyer: 'TD', SPG: 'SPG', Wheeled: 'WHL', Ship: 'SHP',
      TorpedoBoat: 'TB', Fighter: 'FTR', Assault: 'ATK', Bomber: 'BMB',
      Airdefence: 'AD', Structure: 'STR',
    };
    return map[o.icon] || (o.icon && o.icon !== 'none' ? o.icon.slice(0, 3).toUpperCase() : '');
  }

  function drawAircraft(o, color) {
    const p = toScreen(o.x, o.y);
    const angle = Math.atan2(o.dy || 0, o.dx || 1);
    const size = isPlayer(o) ? 11 : 8;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.62, size * 0.85);
    ctx.lineTo(0, size * 0.4);
    ctx.lineTo(-size * 0.62, size * 0.85);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fill();
    ctx.restore();

    if (isPlayer(o)) {
      ctx.save();
      ctx.strokeStyle = PLAYER;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(Date.now() / 300);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGroundUnit(o, color) {
    const p = toScreen(o.x, o.y);
    const s = 4.5;
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    ctx.restore();
    if (options.labels && view.zoom > 3) {
      ctx.fillStyle = color;
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.fillText(labelFor(o), p.x + s + 2, p.y + 3);
    }
  }

  function drawAirfield(o, color) {
    const a = toScreen(o.sx, o.sy);
    const b = toScreen(o.ex, o.ey);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
    if (options.labels) {
      ctx.fillStyle = color;
      ctx.font = '10px "Share Tech Mono", monospace';
      ctx.fillText('AF', (a.x + b.x) / 2 - 6, (a.y + b.y) / 2 - 8);
    }
  }

  function drawZone(o, color) {
    const p = toScreen(o.x, o.y);
    const radius = o.type === 'respawn_base_tank' || o.type === 'respawn_base_fighter' ||
      o.type === 'respawn_base_bomber' ? 10 : 14;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (o.type === 'capture_zone') {
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObject(o) {
    const color = relationColor(o);
    if (o.blink) {
      ctx.globalAlpha = Date.now() % 700 < 380 ? 1 : 0.25;
    }
    switch (o.type) {
      case 'aircraft': drawAircraft(o, color); break;
      case 'airfield': drawAirfield(o, color); break;
      case 'ground_model': drawGroundUnit(o, color); break;
      case 'capture_zone':
      case 'bombing_point':
      case 'defending_point':
      case 'respawn_base_tank':
      case 'respawn_base_fighter':
      case 'respawn_base_bomber': drawZone(o, color); break;
      default:
        if (o.x !== undefined) drawGroundUnit(o, color);
    }
    ctx.globalAlpha = 1;
  }

  function updateTrail() {
    const player = objects.find(isPlayer);
    if (!player) return;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(player.x - last.x, player.y - last.y) > 0.0012) {
      trail.push({ x: player.x, y: player.y });
      if (trail.length > 600) trail = trail.slice(-600);
    }
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.save();
    ctx.strokeStyle = PLAYER;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    trail.forEach((pt, i) => {
      const p = toScreen(pt.x, pt.y);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawWaypoints() {
    if (typeof Waypoints === 'undefined') return;
    const player = objects.find(isPlayer);
    for (const wp of Waypoints.getAll()) {
      const p = toScreen(wp.x, wp.y);
      const active = Waypoints.isActive(wp.id);
      const isPoi = wp.kind === 'poi';
      const color = isPoi
        ? (active ? '#ffb02e' : '#c98a2a')
        : (active ? '#35c4e8' : '#7fd7ef');

      if (active && player) {
        const pp = toScreen(player.x, player.y);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 2 : 1.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      if (isPoi) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-6, -6, 12, 12);
      }
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = '10px "Share Tech Mono", monospace';
      ctx.fillText(wp.label, p.x + 10, p.y - 9);
    }
  }

  function updateReadout() {
    if (!mouse.inside) {
      const player = objects.find(isPlayer);
      if (player) {
        readout.textContent = `OWN POS ▸ SECTOR ${sectorName(player.x, player.y)}`;
      } else {
        readout.textContent = 'CURSOR ▸ —';
      }
      return;
    }
    const f = toMapFraction(mouse.x, mouse.y);
    let text = `CURSOR ▸ SECTOR ${sectorName(f.x, f.y)}`;

    let best = null;
    let bestDist = 18;
    for (const o of objects) {
      if (o.x === undefined) continue;
      const p = toScreen(o.x, o.y);
      const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
      if (d < bestDist) { bestDist = d; best = o; }
    }
    if (best) {
      const rel = isPlayer(best) ? 'PLAYER' : (relationColor(best) === HOSTILE ? 'HOSTILE' : 'FRIENDLY');
      const kind = best.icon !== 'none' && best.icon ? best.icon.toUpperCase() : best.type.toUpperCase();
      text += `  //  ${rel} ${kind}`;
    }
    readout.textContent = text;
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const toolbarH = document.getElementById('map-toolbar').offsetHeight;
    canvas.width = rect.width;
    canvas.height = rect.height - toolbarH;
  }

  function render() {
    ctx.fillStyle = '#01050a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (options.follow) {
      const player = objects.find(isPlayer);
      if (player) {
        const f = baseFit();
        view.panX = canvas.width / 2 - (player.x * f.scale + f.offX) * view.zoom;
        view.panY = canvas.height / 2 - (player.y * f.scale + f.offY) * view.zoom;
      }
    }

    if (mapImage) {
      const f = baseFit();
      ctx.save();
      ctx.imageSmoothingEnabled = view.zoom < 4;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(
        mapImage,
        f.offX * view.zoom + view.panX,
        f.offY * view.zoom + view.panY,
        f.scale * view.zoom,
        f.scale * view.zoom
      );
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(20, 80, 60, 0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else if (objects.length) {
      ctx.fillStyle = 'rgba(41, 255, 158, 0.45)';
      ctx.font = '12px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MAP IMAGE UNAVAILABLE — RETRYING', canvas.width / 2, 24);
      ctx.textAlign = 'left';
    }

    if (options.grid) drawGrid();
    if (options.trail) drawTrail();
    drawWaypoints();

    objects.filter((o) => o.type !== 'aircraft' && o.type !== 'ground_model').forEach(drawObject);
    objects.filter((o) => o.type === 'ground_model').forEach(drawObject);
    objects.filter((o) => o.type === 'aircraft' && !isPlayer(o)).forEach(drawObject);
    const player = objects.find(isPlayer);
    if (player) drawObject(player);

    updateReadout();
    requestAnimationFrame(render);
  }

  function setObjects(list) {
    objects = list;
    updateTrail();
  }

  function setMapInfo(info) { mapInfo = info; }

  let imageRetryTimer = null;

  function loadMapImage(url) {
    clearTimeout(imageRetryTimer);
    const img = new Image();
    img.onload = () => { mapImage = img; };
    img.onerror = () => {
      mapImage = null;
      imageRetryTimer = setTimeout(() => loadMapImage(url), 3000);
    };
    img.src = url;
  }

  function hasMapImage() { return mapImage !== null; }

  function onMapChanged(url) {
    trail = [];
    resetView();
    loadMapImage(url);
  }

  function bindToolbar() {
    for (const key of ['grid', 'labels', 'trail', 'follow']) {
      const el = document.getElementById(`opt-${key}`);
      el.checked = options[key];
      el.addEventListener('change', () => { options[key] = el.checked; });
    }
  }

  window.addEventListener('resize', resize);

  function start() {
    bindToolbar();
    resize();
    requestAnimationFrame(render);
  }

  return { start, setObjects, setMapInfo, loadMapImage, onMapChanged, sectorName, hasMapImage };
})();

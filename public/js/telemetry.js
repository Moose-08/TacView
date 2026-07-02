'use strict';

const Telemetry = (() => {
  const elPrimary = document.getElementById('telemetry-primary');
  const elSystems = document.getElementById('telemetry-systems');
  const elVehicle = document.getElementById('vehicle-name');
  const elFuelBar = document.getElementById('fuel-bar');
  const elFuelText = document.getElementById('fuel-text');
  const elNoVehicle = document.getElementById('no-vehicle');
  const compass = document.getElementById('compass');
  const cctx = compass.getContext('2d');
  let steerBearing = null;

  function fmt(n, digits = 0) {
    if (n === undefined || n === null || Number.isNaN(n)) return '—';
    return Number(n).toFixed(digits);
  }

  function sv(st, prefix) {
    if (!st) return undefined;
    const key = Object.keys(st).find((k) => k.startsWith(prefix));
    return key === undefined ? undefined : st[key];
  }

  function cell(label, value, unit, severity) {
    return `<div class="tele-cell ${severity || ''}">` +
      `<span class="k">${label}</span>` +
      `<span class="v">${value}</span><span class="u">${unit || ''}</span></div>`;
  }

  function prettyVehicleName(type) {
    if (!type) return '';
    return type.replace(/_/g, ' ').toUpperCase();
  }

  function renderAircraft(ind, st) {
    const s = st || {};
    const ias = sv(s, 'IAS,');
    const alt = sv(s, 'H,');
    const vy = sv(s, 'Vy,');
    const g = ind.g_meter;
    const aoa = ind.aoa;

    elPrimary.innerHTML = [
      cell('IAS', fmt(ias), 'KM/H'),
      cell('TAS', fmt(sv(s, 'TAS,')), 'KM/H'),
      cell('ALT', fmt(alt), 'M'),
      cell('MACH', fmt(ind.mach, 2), ''),
      cell('CLIMB', fmt(vy, 1), 'M/S', vy < -80 ? 'danger' : (vy < -30 ? 'warn' : '')),
      cell('G-LOAD', fmt(g, 1), 'G', Math.abs(g) > 9 ? 'danger' : (Math.abs(g) > 6 ? 'warn' : '')),
      cell('AOA', fmt(aoa, 1), '°', Math.abs(aoa) > 20 ? 'danger' : (Math.abs(aoa) > 12 ? 'warn' : '')),
      cell('HDG', fmt(ind.compass), '°'),
    ].join('');

    const gearDown = (ind.gears || 0) > 0.5;
    const sys = [
      cell('THR', fmt((ind.throttle || 0) * 100), '%'),
      cell('FLAPS', fmt((ind.flaps || 0) * 100), '%'),
      cell('GEAR', gearDown ? 'DOWN' : 'UP', '', gearDown && (ias || 0) > 500 ? 'warn' : ''),
    ];
    if (s['RPM 1'] !== undefined) sys.push(cell('RPM', fmt(s['RPM 1']), ''));
    const thrust = sv(s, 'thrust 1,');
    if (thrust !== undefined) sys.push(cell('THRUST', fmt(thrust), 'KGF'));
    const oil = sv(s, 'oil temp 1,');
    if (oil !== undefined) {
      sys.push(cell('OIL', fmt(oil), '°C', oil > 110 ? 'danger' : (oil > 95 ? 'warn' : '')));
    }
    elSystems.innerHTML = sys.join('');

    renderFuel(sv(s, 'Mfuel,'), sv(s, 'Mfuel0,'));
    renderCompass(ind.compass || 0);
  }

  function renderTank(ind, st) {
    const s = st || {};
    elPrimary.innerHTML = [
      cell('SPEED', fmt(ind.speed), 'KM/H'),
      cell('GEAR', fmt(ind.gear), ''),
      cell('RPM', fmt(ind.rpm), ''),
      cell('CREW', ind.crew_total !== undefined ? `${fmt(ind.crew_current)}/${fmt(ind.crew_total)}` : '—', ''),
    ].join('');

    const sys = [];
    if (ind.gear_neutral !== undefined) sys.push(cell('NEUTRAL', ind.gear_neutral ? 'YES' : 'NO', ''));
    if (ind.stabilizer !== undefined) sys.push(cell('STAB', ind.stabilizer ? 'ON' : 'OFF', ''));
    if (ind.lws !== undefined) sys.push(cell('LWS', ind.lws ? 'ALERT' : 'CLR', '', ind.lws ? 'danger' : ''));
    elSystems.innerHTML = sys.join('') || '<div class="dim-note">NO SYSTEM DATA</div>';

    renderFuel(sv(s, 'Mfuel,'), sv(s, 'Mfuel0,'));
    renderCompass(ind.compass || 0);
  }

  function renderFuel(current, total) {
    if (current === undefined || !total) {
      elFuelBar.style.width = '0%';
      elFuelText.textContent = '— / —';
      return;
    }
    const pct = Math.max(0, Math.min(100, (current / total) * 100));
    elFuelBar.style.width = `${pct}%`;
    elFuelBar.classList.toggle('low', pct < 20);
    elFuelText.textContent = `${fmt(current)} / ${fmt(total)} KG (${fmt(pct)}%)`;
  }

  function renderCompass(heading) {
    const w = compass.width, h = compass.height;
    cctx.clearRect(0, 0, w, h);
    cctx.fillStyle = '#0c141b';
    cctx.fillRect(0, 0, w, h);

    cctx.font = '10px "Share Tech Mono", monospace';
    cctx.textAlign = 'center';
    const pxPerDeg = 2.2;
    const cardinal = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

    for (let d = -80; d <= 80; d += 5) {
      let deg = Math.round((heading + d) / 5) * 5;
      const x = w / 2 + (deg - heading) * pxPerDeg;
      deg = ((deg % 360) + 360) % 360;
      if (x < 0 || x > w) continue;
      const major = deg % 45 === 0;
      cctx.strokeStyle = major ? '#29ff9e' : '#1f4a56';
      cctx.beginPath();
      cctx.moveTo(x, h);
      cctx.lineTo(x, h - (major ? 16 : 8));
      cctx.stroke();
      if (major) {
        cctx.fillStyle = '#29ff9e';
        cctx.fillText(cardinal[deg] !== undefined ? cardinal[deg] : String(deg), x, h - 20);
      }
    }
    if (steerBearing !== null) {
      const rel = ((steerBearing - heading + 540) % 360) - 180;
      const x = Math.max(8, Math.min(w - 8, w / 2 + rel * pxPerDeg));
      cctx.fillStyle = '#35c4e8';
      cctx.beginPath();
      cctx.moveTo(x, h - 2);
      cctx.lineTo(x - 5, h - 10);
      cctx.lineTo(x + 5, h - 10);
      cctx.closePath();
      cctx.fill();
    }

    cctx.strokeStyle = '#ffb02e';
    cctx.lineWidth = 2;
    cctx.beginPath();
    cctx.moveTo(w / 2, h);
    cctx.lineTo(w / 2, h - 24);
    cctx.stroke();
    cctx.lineWidth = 1;
    cctx.fillStyle = '#ffb02e';
    cctx.fillText(`${String(Math.round(((heading % 360) + 360) % 360)).padStart(3, '0')}°`, w / 2, 12);
  }

  function update({ indicators, vehicleState }) {
    if (!indicators) {
      elVehicle.textContent = '';
      elPrimary.innerHTML = '';
      elSystems.innerHTML = '';
      renderFuel(undefined, undefined);
      renderCompass(0);
      elNoVehicle.classList.remove('hidden');
      return;
    }
    elNoVehicle.classList.add('hidden');
    elVehicle.textContent = prettyVehicleName(indicators.type);

    if (indicators.army === 'tank') {
      renderTank(indicators, vehicleState);
    } else {
      renderAircraft(indicators, vehicleState);
    }
  }

  function setSteerCue(bearing) { steerBearing = bearing; }

  return { update, setSteerCue };
})();

'use strict';

(() => {
  const elConnDot = document.getElementById('conn-status');
  const elConnText = document.getElementById('conn-text');
  const elMission = document.getElementById('mission-status');
  const elClock = document.getElementById('clock');
  const elMapOffline = document.getElementById('map-offline');
  const elSbMap = document.getElementById('sb-map');
  const elSbObjects = document.getElementById('sb-objects');
  const elSbGen = document.getElementById('sb-gen');

  TacApi.on('connection', (online) => {
    elConnDot.className = `conn-dot ${online ? 'online' : 'offline'}`;
    elConnText.textContent = online ? 'LINKED' : 'NO SIGNAL';
    elMapOffline.classList.toggle('hidden', online);
    if (!online) {
      elMission.textContent = 'STANDBY';
      elMission.classList.add('warn');
    }
  });

  TacApi.on('mapInfo', (info) => {
    TacMap.setMapInfo(info);
    if (!TacMap.hasMapImage()) TacMap.loadMapImage(TacApi.mapImageUrl());
    const [sx, sy] = info.grid_size;
    elSbMap.textContent = `MAP: ${(sx / 1000).toFixed(0)}×${(Math.abs(sy) / 1000).toFixed(0)} KM AO`;
    elSbGen.textContent = `GEN: ${info.map_generation}`;
  });

  TacApi.on('mapChanged', () => {
    TacMap.onMapChanged(TacApi.mapImageUrl());
    Feed.clearAll();
    Waypoints.clear();
  });

  let lastNavPush = 0;
  function pushNavSync(nav) {
    const now = Date.now();
    if (now - lastNavPush < 500) return;
    lastNavPush = now;
    fetch(`${TacApi.syncBase}/sync/nav`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nav, notice: Waypoints.getNotice() }),
    }).catch(() => {});
  }

  TacApi.on('objects', (objects) => {
    TacMap.setObjects(objects);
    Threats.update(objects);
    Waypoints.tick();
    const nav = Waypoints.activeStatus();
    Telemetry.setSteerCue(nav ? nav.bearing : null);
    pushNavSync(nav);
    const contacts = objects.filter((o) => o.type === 'aircraft' || o.type === 'ground_model').length;
    elSbObjects.textContent = `CONTACTS: ${contacts}`;
  });

  TacApi.on('telemetry', Telemetry.update);

  TacApi.on('mission', (mission) => {
    const status = (mission && mission.status) || 'unknown';
    const labels = { running: 'MISSION ACTIVE', success: 'MISSION SUCCESS', fail: 'MISSION FAILED' };
    elMission.textContent = labels[status] || status.toUpperCase();
    elMission.classList.toggle('warn', status !== 'running');
  });

  TacApi.on('battleLog', Feed.addBattleLog);
  TacApi.on('chat', Feed.addChat);

  setInterval(() => {
    const now = new Date();
    elClock.textContent = now.toISOString().slice(11, 19);
  }, 1000);

  TacMap.start();
  TacApi.start();
})();

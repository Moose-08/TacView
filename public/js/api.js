'use strict';

const TacApi = (() => {
  const IS_EXTENSION = location.protocol.endsWith('-extension:');
  const BASE = IS_EXTENSION ? 'http://localhost:8111' : '/api';
  const SYNC_BASE = IS_EXTENSION ? 'http://localhost:3111' : '';

  const listeners = {};
  const state = {
    online: false,
    mapInfo: null,
    mapObjects: [],
    indicators: null,
    vehicleState: null,
    mission: null,
    mapGeneration: -1,
  };

  let lastDmgId = 0;
  let lastEvtId = 0;
  let lastChatId = 0;

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[TacApi] listener error for ${event}:`, e); }
    });
  }

  async function getJson(path) {
    const res = await fetch(`${BASE}/${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    const body = await res.json();
    if (body && body.error === 'game_unreachable') throw new Error('game unreachable');
    return body;
  }

  function setOnline(online) {
    if (state.online !== online) {
      state.online = online;
      emit('connection', online);
    }
  }

  async function fastPoll() {
    try {
      const [objects, indicators, vstate] = await Promise.all([
        getJson('map_obj.json'),
        getJson('indicators'),
        getJson('state'),
      ]);
      state.mapObjects = Array.isArray(objects) ? objects : [];
      state.indicators = indicators && indicators.valid ? indicators : null;
      state.vehicleState = vstate && vstate.valid ? vstate : null;
      setOnline(true);
      emit('objects', state.mapObjects);
      emit('telemetry', { indicators: state.indicators, vehicleState: state.vehicleState });
    } catch (_) {
      setOnline(false);
    }
  }

  async function slowPoll() {
    try {
      const info = await getJson('map_info.json');
      if (info && info.valid) {
        state.mapInfo = info;
        if (info.map_generation !== state.mapGeneration) {
          state.mapGeneration = info.map_generation;
          lastDmgId = 0;
          lastEvtId = 0;
          lastChatId = 0;
          emit('mapChanged', info);
        }
        emit('mapInfo', info);
      }
    } catch (_) {}

    try {
      const mission = await getJson('mission.json');
      state.mission = mission;
      emit('mission', mission);
    } catch (_) {}

    try {
      const hud = await getJson(`hudmsg?lastEvt=${lastEvtId}&lastDmg=${lastDmgId}`);
      const damage = (hud && hud.damage) || [];
      const events = (hud && hud.events) || [];
      if (damage.length) {
        lastDmgId = Math.max(...damage.map((d) => d.id));
        emit('battleLog', damage);
      }
      if (events.length) {
        lastEvtId = Math.max(...events.map((e) => e.id));
      }
    } catch (_) {}

    try {
      const chat = await getJson(`gamechat?lastId=${lastChatId}`);
      if (Array.isArray(chat) && chat.length) {
        lastChatId = Math.max(...chat.map((c) => c.id));
        emit('chat', chat);
      }
    } catch (_) {}
  }

  function mapImageUrl() {
    return `${BASE}/map.img?gen=${state.mapGeneration}`;
  }

  function start() {
    fastPoll();
    slowPoll();
    setInterval(fastPoll, 250);
    setInterval(slowPoll, 2000);
  }

  return { on, start, state, mapImageUrl, syncBase: SYNC_BASE };
})();

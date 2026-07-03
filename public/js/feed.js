'use strict';

const Feed = (() => {
  const elLog = document.getElementById('tab-log');
  const elChat = document.getElementById('tab-chat');
  const MAX_LINES = 250;

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-body').forEach((body) => {
        body.classList.toggle('hidden', body.id !== `tab-${btn.dataset.tab}`);
      });
    });
  });

  elChat.addEventListener('click', (e) => {
    const chip = e.target.closest('.grid-chip');
    if (!chip || typeof TacMap === 'undefined' || typeof Waypoints === 'undefined') return;
    const f = TacMap.gridRefToFraction(chip.dataset.col, Number(chip.dataset.row));
    if (f) Waypoints.add(f.x, f.y, 'poi', chip.dataset.col + chip.dataset.row);
  });

  function fmtTime(seconds) {
    if (seconds === undefined) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function stripMarkup(text) {
    return String(text || '').replace(/<\/?color[^>]*>/gi, '').trim();
  }

  function linkifyGrid(html) {
    if (typeof TacMap === 'undefined' || !TacMap.gridRefToFraction) return html;
    return html.replace(/\b([A-Za-z])[\s-]?(\d{1,2})\b/g, (m, letter, num) => {
      if (!TacMap.gridRefToFraction(letter, Number(num))) return m;
      const ref = letter.toUpperCase() + num;
      return `<span class="grid-chip" data-col="${letter.toUpperCase()}" data-row="${num}" title="Drop POI at ${ref}">${m}</span>`;
    });
  }

  function isEngineNoise(msg) {
    return /NET_PLAYER_|^\s*$/.test(msg);
  }

  const VERBS = [
    { re: /(shot down|destroyed|has crashed|has been wrecked)/, cls: 'kill' },
    { re: /(critically damaged|severely damaged|set afire|damaged)/, cls: 'dmg' },
    { re: /(has achieved|has delivered|first strike|final blow)/, cls: 'award' },
    { re: /(disconnected from the game|entered the game)/, cls: 'sys' },
  ];

  function classify(msg) {
    for (const v of VERBS) {
      const m = msg.match(v.re);
      if (m) return { cls: v.cls, verb: m[0] };
    }
    return { cls: 'sys', verb: null };
  }

  function decorate(msg, verb) {
    let html = esc(msg);
    if (verb) {
      html = html.replace(esc(verb), `<span class="verb">${esc(verb)}</span>`);
    }
    html = html.replace(/\(([^()]{1,40})\)/g, '<span class="vehicle">($1)</span>');
    return html;
  }

  function appendLine(container, html, cls, time) {
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    const line = document.createElement('div');
    line.className = `feed-line ${cls}`;
    line.innerHTML = (time !== undefined ? `<span class="t">${fmtTime(time)}</span>` : '') + html;
    container.appendChild(line);
    while (container.children.length > MAX_LINES) container.removeChild(container.firstChild);
    if (atBottom) container.scrollTop = container.scrollHeight;
    return line;
  }

  const btnTranslate = document.getElementById('btn-translate');
  const TR_KEY = 'tacview.translateChat';
  const TR_BATCH_MAX = 20;
  let translateOn = localStorage.getItem(TR_KEY) === '1';
  let translateAvailable = false;
  const trCache = new Map();

  function updateTranslateBtn() {
    btnTranslate.classList.toggle('active', translateOn);
  }

  btnTranslate.addEventListener('click', () => {
    translateOn = !translateOn;
    localStorage.setItem(TR_KEY, translateOn ? '1' : '0');
    updateTranslateBtn();
  });

  fetch(`${TacApi.syncBase}/sync/translate`, { method: 'POST' })
    .then((res) => {
      if (res.status === 400) {
        translateAvailable = true;
        btnTranslate.classList.remove('hidden');
        updateTranslateBtn();
      }
    })
    .catch(() => {});

  function translate(text) {
    if (trCache.has(text)) return trCache.get(text);
    const job = fetch(`${TacApi.syncBase}/sync/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (data === null) trCache.delete(text);
        return data;
      });
    if (trCache.size >= 300) trCache.delete(trCache.keys().next().value);
    trCache.set(text, job);
    return job;
  }

  function attachTranslation(line, container, msg) {
    if (!/\p{L}/u.test(msg)) return;
    translate(msg).then((result) => {
      if (!result || !result.text || result.lang === 'en') return;
      if (result.text.trim().toLowerCase() === msg.trim().toLowerCase()) return;
      if (!line.isConnected) return;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
      const tr = document.createElement('div');
      tr.className = 'tr-txt';
      tr.textContent = `↳ ${result.text}`;
      line.appendChild(tr);
      if (atBottom) container.scrollTop = container.scrollHeight;
    });
  }

  function addBattleLog(entries) {
    for (const entry of entries) {
      const msg = stripMarkup(entry.msg);
      if (isEngineNoise(msg)) continue;
      const { cls, verb } = classify(msg);
      appendLine(elLog, decorate(msg, verb), cls, entry.time);
    }
  }

  function addChat(entries) {
    const items = entries
      .map((entry) => ({ entry, msg: stripMarkup(entry.msg) }))
      .filter((it) => it.msg);
    const trFrom = items.length - TR_BATCH_MAX;
    items.forEach(({ entry, msg }, i) => {
      const sender = stripMarkup(entry.sender);
      const mode = entry.mode ? `[${esc(entry.mode.toUpperCase())}] ` : '';
      const who = sender ? `<span class="actor">${esc(sender)}</span>: ` : '';
      const cls = entry.enemy ? 'kill' : 'sys';
      const line = appendLine(elChat, `${mode}${who}${linkifyGrid(esc(msg))}`, cls, entry.time);
      if (translateOn && translateAvailable && i >= trFrom) attachTranslation(line, elChat, msg);
    });
  }

  function clearAll() {
    elLog.innerHTML = '';
    elChat.innerHTML = '';
    appendLine(elLog, '<span class="verb">— NEW ENGAGEMENT — LOG RESET —</span>', 'award');
  }

  return { addBattleLog, addChat, clearAll };
})();

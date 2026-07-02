'use strict';

const Feed = (() => {
  const elLog = document.getElementById('tab-log');
  const elChat = document.getElementById('tab-chat');
  const MAX_LINES = 250;

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      elLog.classList.toggle('hidden', btn.dataset.tab !== 'log');
      elChat.classList.toggle('hidden', btn.dataset.tab !== 'chat');
    });
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
  }

  function addBattleLog(entries) {
    for (const entry of entries) {
      if (isEngineNoise(entry.msg)) continue;
      const { cls, verb } = classify(entry.msg);
      appendLine(elLog, decorate(entry.msg, verb), cls, entry.time);
    }
  }

  function addChat(entries) {
    for (const entry of entries) {
      const mode = entry.mode ? `[${esc(entry.mode.toUpperCase())}] ` : '';
      const sender = entry.sender ? `<span class="actor">${esc(entry.sender)}</span>: ` : '';
      const cls = entry.enemy ? 'kill' : 'sys';
      appendLine(elChat, `${mode}${sender}${esc(entry.msg)}`, cls, entry.time);
    }
  }

  function clearAll() {
    elLog.innerHTML = '';
    elChat.innerHTML = '';
    appendLine(elLog, '<span class="verb">— NEW ENGAGEMENT — LOG RESET —</span>', 'award');
  }

  return { addBattleLog, addChat, clearAll };
})();

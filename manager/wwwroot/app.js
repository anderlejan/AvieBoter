/* AvieBoter – page logic. Talks to the app (C#) through WebView2 postMessage RPC. */
(function () {
  'use strict';
  const wv = window.chrome && window.chrome.webview;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- RPC ----------
  let seq = 0;
  const pending = new Map();
  const rpc = (m, ...a) => new Promise((res, rej) => {
    if (!wv) { rej(new Error('Open this page from AvieBoter.')); return; }
    const id = ++seq;
    pending.set(id, { res, rej });
    wv.postMessage({ id, m, a });
  });
  if (wv) wv.addEventListener('message', e => {
    const r = e.data || {};
    if (r.type === 'state') { onState(r.bots); return; }
    if (r.type === 'update') { S.update = r.update; renderUpdate(); return; }
    if (r.type === 'open') { if (S.bots.some(b => b.id === r.bot)) { current = r.bot; section = r.section || 'chat'; closeDialogs(); renderList(); renderMain(); navPush(); } return; }
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    if (r.ok) p.res(r.v); else p.rej(new Error(r.err || 'failed'));
  });

  // ---------- toast ----------
  let toastTimer = 0;
  function toast(text, kind) {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, kind === 'bad' ? 5200 : 2800);
  }
  const fail = e => toast(e && e.message ? e.message : String(e), 'bad');

  // ---------- themes ----------
  // bg, bg2, bg3, fg, fg2, fg3, line, acc, acc2, onAcc
  const THEMES = [
    ['storm', 'Storm blue', true, '#3E5470', '#445A77', '#384C66', '#F5F8FC', '#DDE5EF', '#C4D0DE', '#61789A', '#B0DCFF', '#B0DCFF', '#0E2238'],
    ['midnight', 'Midnight', true, '#121826', '#1A2233', '#222C40', '#E6EBF5', '#B4BDD1', '#939EB8', '#303C55', '#A3B0FF', '#4655CC', '#FFFFFF'],
    ['graphite', 'Graphite', true, '#1E1F22', '#26282C', '#2F3136', '#ECEDEF', '#C3C6CC', '#A0A5AD', '#3C3F45', '#78BDFF', '#1F66C4', '#FFFFFF'],
    ['slate', 'Slate', true, '#4A5563', '#505B69', '#434D5A', '#F7F9FB', '#E2E7ED', '#CCD4DD', '#6C7989', '#B3DEFF', '#B3DEFF', '#0E2238'],
    ['teal-stone', 'Teal stone', true, '#3F5B5B', '#456262', '#395353', '#F3F9F8', '#DBEAE8', '#C1D6D3', '#5F7E7D', '#A6EFE3', '#A6EFE3', '#0E2E2A'],
    ['contrast', 'High contrast', true, '#000000', '#0A0A0A', '#161616', '#FFFFFF', '#FFFFFF', '#D6D6D6', '#FFFFFF', '#FFD400', '#FFD400', '#000000'],
    ['sky', 'Sky', false, '#EAF1F8', '#F4F8FC', '#DCE7F2', '#1B2733', '#3D4F61', '#56697C', '#C1D1E2', '#1A5896', '#1D62A6', '#FFFFFF'],
    ['paper', 'Paper', false, '#F3F1EC', '#FAF9F6', '#E8E5DE', '#2A2825', '#4F4B45', '#65605A', '#D3CEC4', '#1D5A9E', '#1F5FA8', '#FFFFFF'],
  ];
  function hexMix(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
    const x = p(a), y = p(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function applyTheme(id) {
    const t = THEMES.find(x => x[0] === id) || THEMES[0];
    const [, , dark, bg, bg2, bg3, fg, fg2, fg3, line, acc, acc2, on] = t;
    const r = document.documentElement.style;
    const set = (k, v) => r.setProperty(k, v);
    set('--bg', bg); set('--bg2', bg2); set('--bg3', bg3); set('--bg4', hexMix(bg2, fg, dark ? 0.12 : 0.08));
    set('--fg', fg); set('--fg2', fg2); set('--fg3', fg3); set('--line', line);
    set('--acc', acc); set('--acc2', acc2); set('--on-acc', on);
    set('--sel-bg', hexMix(bg2, acc, dark ? 0.22 : 0.15));
    set('--row-line', hexMix(bg2, fg, 0.08));
    set('--ok', dark ? '#8fe3a7' : '#1d7a3c'); set('--warn', dark ? '#ffd37a' : '#8a5a00'); set('--bad', dark ? '#ff9c9c' : '#b3261e');
    set('--bad-bg', dark ? '#5a2730' : '#fbe3e1'); set('--bad-fg', dark ? '#ffd9d9' : '#7a1610'); set('--bad-line', dark ? '#b25a66' : '#e0a39d');
    r.colorScheme = dark ? 'dark' : 'light';
    rpc('setBg', bg).catch(() => {});
  }
  function applyFont(pct) {
    document.documentElement.style.setProperty('--fs', (14 * pct / 100).toFixed(1) + 'px');
    document.documentElement.style.setProperty('--reader-size', (15 * pct / 100).toFixed(1) + 'px');
  }

  // ---------- state ----------
  let S = { settings: {}, bots: [], version: '' };
  let current = '';
  let section = 'overview';
  let commands = [];
  const ui = {};           // remembered small choices (search text, filters)
  const saveUi = (k, v) => { ui[k] = v; rpc('setting', 'ui', { [k]: String(v) }).catch(() => {}); };
  const bot = () => S.bots.find(b => b.id === current);

  const STATE_TEXT = { online: 'Online', starting: 'Starting', connecting: 'Logging in', stopping: 'Logging out', failed: 'Problem', stopped: 'Stopped', waiting: 'Reconnecting' };
  const GRID_TEXT = { sl: 'Second Life', aditi: 'Second Life Beta (Aditi)', custom: 'Other grid' };

  function fmtDur(iso) {
    if (!iso) return '–';
    let s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`;
  }
  function where(b) {
    const st = b.status;
    if (b.state !== 'online' || !st || !st.online) return b.state === 'connecting' && b.loginStep ? b.loginStep : '–';
    return `${st.region} (${Math.round(st.x)}, ${Math.round(st.y)}, ${Math.round(st.z)})`;
  }

  // ---------- Back / Forward ----------
  // Every place you open (a bot's section, Settings, Help) goes into a history like a web browser's:
  // ◀ / ▶ in the title bar, Alt+← / Alt+→, the mouse's back/forward buttons, and 🕘 lists the places visited.
  const NAV = { list: [], i: -1, lock: false };
  const openDialogs = new Set();
  let navClosing = false;
  const secName = k => (SECTIONS.find(x => x[0] === k) || [k, k])[1];
  const locLabel = l => !l ? '' : l.kind === 'bot' ? ((S.bots.find(x => x.id === l.bot) || {}).label || 'Bot') + ' › ' + secName(l.section)
    : l.kind === 'settings' ? '⚙ Settings' : l.kind === 'help' ? '? Help' : 'Start';
  const sameLoc = (a, b) => !!a && !!b && a.kind === b.kind && a.bot === b.bot && a.section === b.section;
  const navHere = () => current ? { kind: 'bot', bot: current, section } : { kind: 'home' };
  function navPush(loc) {
    if (NAV.lock) return;
    loc = loc || navHere();
    if (sameLoc(NAV.list[NAV.i], loc)) return;
    NAV.list = NAV.list.slice(0, NAV.i + 1);
    NAV.list.push(loc);
    if (NAV.list.length > 60) NAV.list.shift();
    NAV.i = NAV.list.length - 1;
    navButtons();
  }
  function closeDialogs() { navClosing = true; try { [...openDialogs].forEach(f => f()); } finally { navClosing = false; } }
  function navGo(j) {
    if (j < 0 || j >= NAV.list.length || j === NAV.i) return;
    NAV.i = j;
    const l = NAV.list[j];
    NAV.lock = true;
    try {
      closeDialogs();
      if (l.kind === 'bot' && S.bots.some(x => x.id === l.bot)) {
        current = l.bot; section = l.section;
        rpc('setting', 'lastBot', current).catch(() => {});
        rpc('setting', 'lastSection', section).catch(() => {});
        renderList(); renderMain();
      }
      else if (l.kind === 'settings') openSettings();
      else if (l.kind === 'help') openHelp();
    } finally { NAV.lock = false; }
    navButtons();
  }
  function navButtons() {
    const bk = $('#navBack'), fw = $('#navFwd');
    if (!bk) return;
    bk.disabled = NAV.i <= 0;
    fw.disabled = NAV.i >= NAV.list.length - 1;
    bk.title = NAV.i > 0 ? 'Back to ' + locLabel(NAV.list[NAV.i - 1]) + '  (Alt+←)' : 'Back';
    fw.title = NAV.i < NAV.list.length - 1 ? 'Forward to ' + locLabel(NAV.list[NAV.i + 1]) + '  (Alt+→)' : 'Forward';
  }
  $('#navBack').onclick = () => navGo(NAV.i - 1);
  $('#navFwd').onclick = () => navGo(NAV.i + 1);
  $('#navList').onclick = e => showMenu(e.currentTarget, [{ hd: 'Places you visited (newest first)' }]
    .concat(NAV.list.map((l, j) => ({ t: (j === NAV.i ? '● ' : '   ') + locLabel(l), f: () => navGo(j) })).reverse()));
  document.addEventListener('keydown', e => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || (window.__notes && window.__notes.isOpen())) return;
    e.preventDefault(); navGo(NAV.i + (e.key === 'ArrowLeft' ? -1 : 1));
  });
  document.addEventListener('mouseup', e => { if (e.button === 3 || e.button === 4) { e.preventDefault(); navGo(NAV.i + (e.button === 3 ? -1 : 1)); } });

  // ---------- bot list ----------
  function renderList() {
    const el = $('#botList');
    el.innerHTML = S.bots.map(b => `
      <div class="card ${b.id === current ? 'sel' : ''}" data-bot="${b.id}">
        <div class="t"><span class="dot ${b.state}"></span><span class="nm">${esc(b.label)}</span>${unreadBadges(b)}</div>
        <div class="l">${esc(STATE_TEXT[b.state] || b.state)} · ${esc(where(b))}</div>
        <div class="l muted">${b.ramMb ? `${b.ramMb.toFixed(0)} MB · CPU ${b.cpu.toFixed(1)} %` : esc(GRID_TEXT[b.grid] || '')}</div>
      </div>`).join('') + `<div class="card addcard" id="addCard">＋ Add bot</div>`;
    const on = S.bots.filter(b => b.state === 'online').length;
    const ram = S.bots.reduce((a, b) => a + (b.ramMb || 0), 0);
    $('#summary').textContent = S.bots.length ? `${on} of ${S.bots.length} bot${S.bots.length > 1 ? 's' : ''} online${ram ? ` · ${ram.toFixed(0)} MB RAM in use` : ''}` : '';
  }
  $('#botList').addEventListener('click', e => {
    const c = e.target.closest('[data-bot]');
    if (c) { selectBot(c.dataset.bot); return; }
    if (e.target.closest('#addCard')) openBotDialog(null);
  });

  function selectBot(id) {
    current = id;
    rpc('setting', 'lastBot', id).catch(() => {});
    renderList();
    renderMain();
    navPush();
  }

  function onState(bots) {
    const prev = bot();
    S.bots = bots || [];
    if (current && !bot()) current = S.bots.length ? S.bots[0].id : '';
    renderList();
    const b = bot();
    if (!b) { renderMain(); return; }
    // only the live parts are redrawn, so typing in a form is never disturbed
    updateHead(b);
    if (section === 'overview') updateOverview(b);
    if (section === 'hud') updateHudLive(b);
    updateEnabled(b);
    if (section === 'commands' && prev && prev.state !== b.state && selCmd) drawForm();
  }

  // ---------- main area ----------
  const SECTIONS = [['overview', '🛈 Overview'], ['chat', '💬 Chat'], ['radar', '📡 Radar'], ['world', '🌍 Nearby'], ['hud', '🎮 HUD'], ['commands', '⌘ Commands'], ['groups', '👥 Groups'], ['inventory', '🎒 Inventory'], ['log', '📜 Log'], ['bot', '✎ Bot settings']];

  function renderMain() {
    stopLogTimer();
    stopChatTimer();
    stopRadarTimer();
    stopWorldTimer();
    const m = $('#main');
    const b = bot();
    if (!b) {
      m.innerHTML = `<div class="content"><div class="welcome">
        <h1>Welcome to AvieBoter</h1>
        <p class="muted">Run a Second Life avatar on this PC without a viewer – no graphics, very little memory – and control it from the app or from a HUD you wear in Second Life.</p>
        <ol class="steps" style="margin-top:20px">
          <li><b>Add your bot avatar</b><br><span class="muted">Its name and password stay on this PC, encrypted for your Windows account.</span></li>
          <li><b>Start it</b><br><span class="muted">It logs in by itself. You can watch everything in its Log.</span></li>
          <li><b>Get the HUD</b><br><span class="muted">In the bot's 🎮 HUD section press "Send me a new HUD": the bot builds it and gives it to you, paired. "Sit with me" makes the bot a passenger in your vehicle.</span></li>
        </ol>
        <button class="btn pri" id="welcomeAdd">＋ Add your first bot</button>
      </div></div>`;
      $('#welcomeAdd').onclick = () => openBotDialog(null);
      return;
    }
    m.innerHTML = `
      <div class="bothead">
        <h1>${esc(b.label)}</h1>
        <span class="pill ${b.state}" id="hState"></span>
        <span class="muted small" id="hSub"></span>
        <span class="grow"></span>
        <button class="btn pri" id="bStart">▶ Start</button>
        <button class="btn" id="bStop">■ Stop</button>
        <button class="btn" id="bRestart" title="Log out and in again">⟳ Restart</button>
      </div>
      <div class="sections">${SECTIONS.map(([k, t]) => `<button class="sec ${k === section ? 'on' : ''}" data-sec="${k}">${t}${k === 'chat' ? '<span class="badge hidden" id="chatBadge"></span>' : ''}</button>`).join('')}</div>
      <div class="content" id="content"></div>`;
    $('#bStart').onclick = () => act('bot.start', 'Starting…');
    $('#bStop').onclick = () => act('bot.stop', 'Logging out…');
    $('#bRestart').onclick = () => act('bot.restart', 'Restarting…');
    m.querySelectorAll('[data-sec]').forEach(x => x.onclick = () => { section = x.dataset.sec; rpc('setting', 'lastSection', section).catch(() => {}); renderMain(); navPush(); });
    updateHead(b);
    updateEnabled(b);
    ({ overview: renderOverview, chat: renderChat, radar: renderRadar, world: renderWorld, hud: renderHud, commands: renderCommands, groups: renderGroups, inventory: renderInventory, log: renderLog, bot: renderBotSettings })[section](b);
  }

  async function act(m, msg) {
    const b = bot();
    if (!b) return;
    toast(msg);
    try { await rpc(m, b.id); } catch (e) { fail(e); }
  }

  function updateHead(b) {
    const s = $('#hState'); if (!s) return;
    const cb = $('#chatBadge');
    if (cb) { cb.innerHTML = unreadShort(b); cb.classList.toggle('hidden', !b.unread || section === 'chat'); }
    if (section === 'chat') chatChipCounts(b);
    s.className = 'pill ' + b.state;
    s.innerHTML = `<span class="dot ${b.state}"></span>${esc(STATE_TEXT[b.state] || b.state)}`;
    const sub = $('#hSub');
    const fol = b.state === 'online' && b.status && b.status.following ? b.status.following : '';
    const txt = b.state === 'online' ? `online for ${fmtDur(b.onlineSince)}` : b.state === 'connecting' ? (b.loginStep || '') : '';
    const html = esc(txt) + (fol ? ` · 👣 following <b>${esc(fol)}</b> <a href="#" data-unfollow>stop</a>` : '');
    if (sub.dataset.h !== html) { sub.innerHTML = html; sub.dataset.h = html; }
  }
  $('#main').addEventListener('click', async e => {
    if (!e.target.closest('[data-unfollow]')) return;
    e.preventDefault();
    const b = bot(); if (!b) return;
    try { await rpc('bot.run', b.id, 'CompanionFollow', ['stop', '0', '0', 'none']); toast('Stopped following'); } catch (er) { fail(er); }
  });
  function updateEnabled(b) {
    const running = ['starting', 'connecting', 'online', 'stopping', 'waiting'].includes(b.state);
    if ($('#bStart')) { $('#bStart').disabled = running; $('#bStop').disabled = !running; $('#bRestart').disabled = !running; }
    document.querySelectorAll('[data-needs-online]').forEach(x => { x.disabled = b.state !== 'online'; });
  }

  // ---------- Overview ----------
  function renderOverview(b) {
    const c = $('#content');
    c.innerHTML = `
      <div id="ovBanner"></div>
      <div class="grid">
        <div class="box"><h3>Where</h3><div class="big" id="ovRegion">–</div><div class="muted" id="ovPos"></div><div id="ovSeat" class="small"></div></div>
        <div class="box"><h3>Avatar</h3><div class="kv"><b>Name</b><span><span id="ovName" class="sel"></span> <button class="cp" data-copy="ovName" title="Copy the name">📋</button></span><b>Key</b><span><span id="ovUuid" class="mono sel"></span> <button class="cp" data-copy="ovUuid" title="Copy the key">📋</button></span><b>Grid</b><span>${esc(GRID_TEXT[b.grid])}</span><b>Logs in at</b><span id="ovStart"></span></div></div>
        <div class="box"><h3>Load on this PC</h3><div class="kv"><b>Memory</b><span id="ovRam"></span><b>CPU</b><span id="ovCpu"></span><b>Running</b><span id="ovUp"></span></div><div class="note">A Second Life viewer typically needs several GB of memory and the graphics card.</div></div>
      </div>
      <h2>Quick actions</h2>
      <div class="actions">
        <span class="split"><button class="btn" data-needs-online id="ovCome" title="The bot comes to you – it walks or teleports when it can see you, else it sends you a teleport request (no HUD needed)">🙋 Come to me</button><button class="btn dd2" data-needs-online id="ovComeDd" title="Come to someone else">▾</button></span>
        <button class="btn" data-needs-online data-cmd="Stand">Stand up</button>
        <button class="btn" data-needs-online data-cmd="GoHome" title="Teleports to the bot's home location in Second Life">Go home</button>
        <button class="btn" data-needs-online data-cmd="CompanionSetHome" title="Makes the place where the bot stands its home (SL allows it only on land where the bot may set home)">Set home here</button>
        <button class="btn" data-needs-online data-cmd="CompanionStatus">Refresh status</button>
        <button class="btn" data-needs-online data-cmd="ResetAnimations">Reset animations</button>
        <button class="btn" data-needs-online data-cmd="CompanionUndeform" title="After an outfit change left the bot deformed: stops all its animations and sends its appearance again, so viewers redraw it">Undeform</button>
        <button class="btn" id="ovPuppet" title="A small window that stays above the viewer: walk, turn, fly the bot by hand, with a map around it">🕹 Puppeteer</button>
      </div>
      <h2>Sit on</h2>
      <div id="seatList" class="seats"></div>
      <div class="row" style="margin-top:8px">
        <input class="in" id="seatName" placeholder="Name (optional)" style="width:190px">
        <input class="in w" id="seatUuid" placeholder="Object key (UUID) – in your viewer: Edit the object → General → Copy Keys">
        <button class="btn" data-needs-online id="seatSitNow" title="Sit on it without saving">Sit now</button>
        <button class="btn" id="seatAdd" title="Keep it in the list">☆ Save</button>
      </div>
      <div class="actions"><button class="btn" id="seatSaveCurrent" disabled title="Saves the object the bot is sitting on now">☆ Save the seat it sits on now</button></div>
      <h2>Outfit</h2>
      <div class="row">
        <div class="combo"><input class="in" id="outfitName" placeholder="Folder name – My Outfits/<name> first, then any folder with that name"><button class="dd" id="outfitDd" title="Recently worn and My Outfits">▾</button></div>
        <button class="btn" data-needs-online id="outfitWear" title="Takes off the current outfit and wears this folder">Wear (replaces outfit)</button>
      </div>
      <h2>Go to a place</h2>
      <div class="row">
        <div class="combo"><input class="in" id="tpUrl" placeholder="SLURL, Region/x/y/z, or x y z in the bot's region"><button class="dd" id="tpDd" title="Saved and recent places">▾</button></div>
        <button class="btn" data-needs-online id="tpWalk" title="Walks there when it is near; a far place gets a teleport close by first">🚶 Walk to</button>
        <button class="btn" data-needs-online id="tpGo">Teleport</button>
      </div>
      <h2>Say something as the bot</h2>
      <div class="row">
        <select class="in" id="sayKind"><option value="Say">Say</option><option value="Shout">Shout</option><option value="Whisper">Whisper</option></select>
        <input class="in" id="sayCh" type="number" value="0" style="width:80px" title="Chat channel (0 = local chat everyone sees)">
        <input class="in w" id="sayText" placeholder="Text for local chat">
        <button class="btn" data-needs-online id="sayGo">Send</button>
      </div>
      <div class="row">
        <div class="combo"><input class="in" id="imTo" placeholder="Avatar name or key"><button class="dd" id="imDd" title="Choose">▾</button></div>
        <input class="in w" id="imText" placeholder="Instant message text">
        <button class="btn" data-needs-online id="imGo">Send IM</button>
      </div>
      <div id="ovResult"></div>`;
    c.querySelectorAll('[data-cmd]').forEach(x => x.onclick = () => runShow(x.dataset.cmd, []));
    c.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => rpc('copy', $('#' + x.dataset.copy).textContent).then(() => toast('Copied')).catch(fail));
    if ($('#ovPuppet')) $('#ovPuppet').onclick = () => rpc('puppet.open', b.id).catch(fail);
    const placeArg = () => { const u = $('#tpUrl').value.trim(); if (!u) toast('Paste a SLURL or choose a place first', 'bad'); else rpc('addRecentSlurl', u).then(l => { S.settings.recentSlurls = l; }).catch(() => {}); return u; };
    // Teleport takes a full SLURL: "Region/x/y/z" and "x y z" (in the bot's region) are turned into one
    const toSlurl = u => {
      if (/^(https?|secondlife):/i.test(u)) return u;
      const n = u.split(/[ ,;]+/).filter(Boolean);
      const st = b.status || {};
      if (n.length >= 2 && n.length <= 3 && n.every(x => !isNaN(+x)) && st.region) return `http://maps.secondlife.com/secondlife/${encodeURIComponent(st.region)}/${n[0]}/${n[1]}/${n[2] || Math.round(st.z || 25)}`;
      return 'http://maps.secondlife.com/secondlife/' + u.split('/').map((x, i) => i ? x : encodeURIComponent(x.trim())).join('/');
    };
    $('#tpGo').onclick = () => { const u = placeArg(); if (u) runShow('TeleportSLURL', [toSlurl(u)]); };
    $('#tpWalk').onclick = () => { const u = placeArg(); if (u) runShow('CompanionWalkTo', [u]); };
    $('#tpUrl').addEventListener('keydown', e => { if (e.key === 'Enter') $('#tpWalk').click(); });
    $('#tpDd').onclick = e => placeMenu(e.currentTarget, v => { $('#tpUrl').value = v; }, b, $('#tpUrl').value.trim());
    const comeTo = who => { if (!who) { toast('Add yourself under "Who may command it" first', 'bad'); return; } runShow('CompanionComeTo', [who]); };
    $('#ovCome').onclick = () => comeTo((b.masters || [])[0]);
    $('#ovComeDd').onclick = e => avatarMenu(e.currentTarget, comeTo);
    $('#sayGo').onclick = () => { const t = $('#sayText').value; if (!t) return; runShow($('#sayKind').value, [String(parseInt($('#sayCh').value, 10) || 0), t]).then(ok => { if (ok) $('#sayText').value = ''; }); };
    $('#sayText').addEventListener('keydown', e => { if (e.key === 'Enter') $('#sayGo').click(); });
    $('#imDd').onclick = e => avatarMenu(e.currentTarget, v => { $('#imTo').value = v; });
    $('#imGo').onclick = async () => {
      const to = $('#imTo').value.trim(), t = $('#imText').value;
      if (!to || !t) return;
      try { toast('Sending…'); await rpc('bot.sendChat', b.id, 'im', to, to, t); $('#imText').value = ''; toast('IM sent to ' + to); }
      catch (e) { fail(e); }
    };
    $('#outfitDd').onclick = async e => {
      const anchor = e.currentTarget, me = bot();
      const pick = n => ({ t: n, f: () => { $('#outfitName').value = n; } });
      const items = [{ hd: 'Recently worn' }].concat((me.recentOutfits || []).length ? me.recentOutfits.map(pick) : [{ hd: '(none yet)' }]);
      items.push({ hd: 'My Outfits' });
      if (me.state === 'online') {
        try { const l = await rpc('bot.outfits', me.id); items.push(...(l.length ? l.map(pick) : [{ hd: '(empty)' }])); }
        catch (err) { items.push({ hd: '(could not read: ' + err.message + ')' }); }
      } else items.push({ hd: '(the bot is not online)' });
      showMenu(anchor, items);
    };
    $('#outfitWear').onclick = async () => {
      const name = $('#outfitName').value.trim();
      if (!name) { toast('Type or pick the folder name first', 'bad'); return; }
      toast('Changing outfit…');
      try {
        const r = await rpc('bot.wear', b.id, name);
        toast(r.ok ? r.reply : r.reply, r.ok ? '' : 'bad');
        $('#ovResult').innerHTML = `<h2>Result: Outfit</h2><div class="result ${r.ok ? '' : 'bad'}">${esc(r.reply)}</div>`;
      } catch (err) { fail(err); }
    };
    $('#outfitName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#outfitWear').click(); });
    $('#seatAdd').onclick = () => saveSeat(b, '', $('#seatName').value, $('#seatUuid').value, true);
    $('#seatSitNow').onclick = () => sitOn(b, '', $('#seatUuid').value.trim());
    $('#seatUuid').addEventListener('keydown', e => { if (e.key === 'Enter') $('#seatSitNow').click(); });
    $('#seatSaveCurrent').onclick = () => {
      const st = bot().status;
      if (!st || !st.sitting) return;
      saveSeat(b, '', st.seatName || '', st.seatId, false, st.region);
    };
    seatsDrawn = '';
    drawSeats(b);
    updateOverview(b);
    updateEnabled(b);
  }

  // ---------- saved seats ----------
  let seatsDrawn = '', seatEditing = '';
  async function saveSeat(b, id, name, uuid, clearInputs, region) {
    try {
      await rpc('seats.save', b.id, id, (name || '').trim(), (uuid || '').trim(), region || '');
      if (clearInputs) { $('#seatName').value = ''; $('#seatUuid').value = ''; }
      seatEditing = '';
      await refreshState();
      toast(id ? 'Renamed' : 'Saved in the list');
      return true;
    } catch (e) { fail(e); return false; }
  }
  async function sitOn(b, seatId, uuid) {
    if (!seatId && !uuid) { toast('Paste the object key (UUID) first', 'bad'); return; }
    toast('Sitting…');
    try {
      const r = await rpc('seats.sit', b.id, seatId, uuid);
      toast(r.ok ? 'Seated' : r.reply, r.ok ? '' : 'bad');
      const out = $('#ovResult');
      if (out) out.innerHTML = `<h2>Result: Sit on</h2><div class="result ${r.ok ? '' : 'bad'}">${esc(r.reply)}</div>`;
      await refreshState();
    } catch (e) { fail(e); }
  }
  function drawSeats(b) {
    const el = $('#seatList'); if (!el) return;
    const seats = b.seats || [];
    const key = JSON.stringify(seats) + '|' + b.state + '|' + seatEditing;
    if (key === seatsDrawn) return;
    const ae = document.activeElement;
    if (seatEditing && el.contains(ae) && ae.dataset.rename === seatEditing) return;   // never redraw under the cursor while renaming
    seatsDrawn = key;
    const online = b.state === 'online';
    el.innerHTML = seats.length ? seats.map(s => `
      <div class="seat" data-seat="${s.id}">
        ${seatEditing === s.id
          ? `<input class="in" data-rename="${s.id}" value="${esc(s.name)}" style="flex:1">
             <button class="btn sm pri" data-rsave="${s.id}">Save</button><button class="btn sm" data-rcancel>Cancel</button>`
          : `<div class="sn"><b>${esc(s.name)}</b><div class="muted small mono">${esc(s.uuid)}${s.region ? ' · ' + esc(s.region) : ''}${s.uses ? ` · used ${s.uses}×` : ''}</div></div>
             <button class="btn sm pri" data-sit="${s.id}" ${online ? '' : 'disabled'}>Sit</button>
             <button class="btn sm" data-more="${s.id}" title="Rename, copy key, delete">⋯</button>`}
      </div>`).join('')
      : '<div class="muted small">No saved seats yet. Paste an object key below and press ☆ Save, or seat the bot and save the seat it sits on.</div>';
    const ren = el.querySelector('[data-rename]');
    if (ren) {
      ren.focus(); ren.select();
      ren.addEventListener('keydown', e => {
        if (e.key === 'Enter') { const s = seats.find(x => x.id === ren.dataset.rename); saveSeat(b, s.id, ren.value, s.uuid, false); }
        if (e.key === 'Escape') { e.stopPropagation(); seatEditing = ''; drawSeats(bot()); }
      });
    }
  }
  $('#main').addEventListener('click', e => {
    const b = bot(); if (!b) return;
    const t = e.target.closest('[data-sit],[data-more],[data-rsave],[data-rcancel],[data-del],[data-delno]');
    if (!t) return;
    const seats = b.seats || [];
    if (t.dataset.sit) sitOn(b, t.dataset.sit, '');
    else if (t.dataset.rsave) { const s = seats.find(x => x.id === t.dataset.rsave); saveSeat(b, s.id, $(`[data-rename="${s.id}"]`).value, s.uuid, false); }
    else if (t.hasAttribute('data-rcancel')) { seatEditing = ''; drawSeats(b); }
    else if (t.dataset.more) {
      const s = seats.find(x => x.id === t.dataset.more);
      showMenu(t, [
        { t: '✎ Rename', f: () => { seatEditing = s.id; drawSeats(bot()); } },
        { t: '⧉ Copy key', f: () => rpc('copy', s.uuid).then(() => toast('Key copied')) },
        { t: '🗑 Delete…', f: () => {
          const row = $(`[data-seat="${s.id}"]`);
          row.insertAdjacentHTML('beforeend', `<span class="delask">Delete "${esc(s.name)}"? <button class="btn sm danger" data-del="${s.id}">Yes, delete</button><button class="btn sm" data-delno>No</button></span>`);
        } },
      ]);
    }
    else if (t.dataset.del) { rpc('seats.delete', b.id, t.dataset.del).then(refreshState).then(() => toast('Deleted')).catch(fail); }
    else if (t.hasAttribute('data-delno')) { const a = t.closest('.delask'); if (a) a.remove(); }
  });
  async function refreshState() { try { onState(await rpc('state')); } catch { } }

  const setText = (sel, t) => { const e = $(sel); if (e && e.textContent !== t) e.textContent = t; };
  const setHtml = (sel, h) => { const e = $(sel); if (e && e.dataset.h !== h) { e.innerHTML = h; e.dataset.h = h; } };
  const startText = v => !v || v === 'last' ? 'the last place' : v === 'home' ? 'its home' : v;
  function updateOverview(b) {
    if (!$('#ovRegion')) return;
    drawSeats(b);
    const sc = $('#seatSaveCurrent');
    if (sc) {
      const st = b.status;
      const saved = st && st.sitting && (b.seats || []).some(x => x.uuid === String(st.seatId).toLowerCase());
      sc.disabled = !(st && st.sitting) || saved;
      sc.textContent = saved ? '★ The current seat is in the list' : '☆ Save the seat it sits on now';
    }
    const st = b.status && b.status.online ? b.status : null;
    // only what changed is written, so a selection (to copy the key or a name) survives the refresh
    setText('#ovRegion', st ? st.region : (b.state === 'online' ? '…' : STATE_TEXT[b.state]));
    setText('#ovPos', st ? `x ${st.x} · y ${st.y} · z ${st.z}` : (b.state === 'connecting' ? (b.loginStep || '') : ''));
    setHtml('#ovSeat', st ? (st.sitting ? `🪑 Sitting on <b>${esc(st.seatName || 'an object')}</b>` : 'Standing') : '');
    setText('#ovName', (st && st.name) || b.botName || b.username);
    setText('#ovUuid', (st && st.uuid) || b.botUuid || 'known after the first login');
    setText('#ovStart', startText(b.startLocation));
    setText('#ovRam', b.ramMb ? `${b.ramMb.toFixed(0)} MB` : '–');
    setText('#ovCpu', b.ramMb ? `${b.cpu.toFixed(1)} %` : '–');
    setText('#ovUp', b.startedAt && b.ramMb ? fmtDur(b.startedAt) : '–');
    const ban = $('#ovBanner');
    const html = b.lastError ? `<div class="banner bad"><span class="grow">⚠ ${esc(b.lastError)}</span><button class="btn sm" id="banLog">Show log</button></div>`
      : (b.state === 'stopped' && !b.hasPassword ? `<div class="banner info"><span class="grow">Enter the avatar's password under ✎ Bot settings, then press ▶ Start.</span></div>` : '');
    if (ban.dataset.h !== html) { ban.innerHTML = html; ban.dataset.h = html; const l = $('#banLog'); if (l) l.onclick = () => { section = 'log'; renderMain(); navPush(); }; }
  }

  async function runShow(cmd, args) {
    const b = bot(); if (!b) return false;
    const out = $('#ovResult');
    try {
      const r = await rpc('bot.run', b.id, cmd, args);
      if (out) out.innerHTML = `<h2>Result: ${esc(cmd)}</h2><div class="result ${r.ok ? '' : 'bad'}">${esc(pretty(r.reply))}</div>`;
      toast(r.ok ? `${cmd}: done` : `${cmd}: ${r.reply}`, r.ok ? '' : 'bad');
      return r.ok;
    } catch (e) { fail(e); return false; }
  }
  function pretty(x) {
    if (x == null) return '';
    if (typeof x !== 'string') return JSON.stringify(x, null, 2);
    const t = x.trim();
    if (t.startsWith('{') || t.startsWith('[')) { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { } }
    return x;
  }

  // ---------- pick menus ----------
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  document.addEventListener('mousedown', e => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
  function showMenu(anchor, items) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu';
    items.forEach(it => {
      const d = document.createElement('div');
      d.textContent = it.hd || it.t;
      if (it.hd) d.className = 'hd';
      else d.onclick = () => { closeMenu(); it.f(); };
      m.appendChild(d);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = Math.max(m.offsetWidth, 220);
    m.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)) + 'px';
    const below = r.bottom + 4, h = m.offsetHeight;
    m.style.top = (below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below) + 'px';
    openMenu = m;
  }
  let nearby = [];
  // saved places (named), recent ones, and where the bot is now – for "Go to a place" and the login place
  function slurlOf(st) { return st && st.online ? `http://maps.secondlife.com/secondlife/${encodeURIComponent(st.region)}/${Math.round(st.x)}/${Math.round(st.y)}/${Math.round(st.z)}` : ''; }
  function placeMenu(anchor, pick, b, current) {
    const saved = S.settings.savedPlaces || [], recent = S.settings.recentSlurls || [];
    const here = slurlOf(b && b.status);
    const items = [];
    if (here) items.push({ t: '📍 Where the bot is now', f: () => pick(here) });
    items.push({ hd: 'Saved places' });
    if (saved.length) saved.forEach(p => items.push({ t: '★ ' + p.name, f: () => pick(p.slurl) }));
    else items.push({ hd: '(none yet)' });
    if (current) items.push({ t: '☆ Save the place in the field…', f: async () => {
      const name = await askText('Name for this place', current.replace(/^.*secondlife\//, '').replace(/\//g, ' '));
      if (!name) return;
      try { S.settings.savedPlaces = await rpc('places.save', name, current); toast('Saved: ' + name); } catch (er) { fail(er); }
    } });
    if (saved.length) items.push({ t: '🗑 Remove a saved place…', f: () => showMenu(anchor, [{ hd: 'Remove' }].concat(saved.map(p => ({ t: '✕ ' + p.name, f: async () => { S.settings.savedPlaces = await rpc('places.delete', p.slurl); toast('Removed: ' + p.name); } })))) });
    items.push({ hd: 'Recent' });
    if (recent.length) recent.forEach(u => items.push({ t: u, f: () => pick(u) }));
    else items.push({ hd: '(none yet)' });
    showMenu(anchor, items);
  }

  async function avatarMenu(anchor, pick) {
    const b = bot();
    const items = [{ hd: 'People who may command the bot' }].concat((b.masters || []).map(n => ({ t: n, f: () => pick(n) })));
    items.push({ hd: 'Nearby the bot' });
    if (b.state === 'online') {
      try {
        const r = await rpc('bot.run', b.id, 'Nearme', []);
        if (r.ok && r.reply) { const d = JSON.parse(r.reply); nearby = Array.isArray(d) ? d : Object.values(d || {}); }
      } catch { }
    }
    const names = nearby.map(x => typeof x === 'string' ? x : (x.name || '')).filter(Boolean);
    if (names.length) names.slice(0, 30).forEach(n => items.push({ t: n, f: () => pick(n) }));
    else items.push({ hd: b.state === 'online' ? '(nobody nearby)' : '(bot is not online)' });
    showMenu(anchor, items);
  }

  // born "M/D/YYYY" (profile) -> days of age; text like "2 y 3 m" / "40 days", new avatars marked
  function ageDays(born) {
    const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(born || ''); if (!m) return null;
    return Math.floor((Date.now() - new Date(+m[3], +m[1] - 1, +m[2]).getTime()) / 86400000);
  }
  function ageText(born) {
    const d = ageDays(born);
    if (d == null) return '<span class="muted">…</span>';
    const y = Math.floor(d / 365.25), mo = Math.floor((d - y * 365.25) / 30.44);
    const t = d < 60 ? d + ' day' + (d === 1 ? '' : 's') : y ? y + ' y' + (mo ? ' ' + mo + ' m' : '') : mo + ' months';
    return `<span class="${d < 30 ? 'warn' : ''}" title="In Second Life since ${esc(born)}">${t}</span>`;
  }

  // a ✕ inside search and filter fields: clears the text (Esc in the field does the same)
  function clearable(sel) {
    const inp = typeof sel === 'string' ? $(sel) : sel;
    if (!inp || inp.parentNode.classList.contains('clr')) return;
    const w = document.createElement('span');
    w.className = 'clr' + (inp.classList.contains('w') ? ' w' : '');
    if (inp.style.maxWidth) { w.style.maxWidth = inp.style.maxWidth; inp.style.maxWidth = ''; }
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.title = 'Clear'; x.tabIndex = -1;
    w.appendChild(x);
    const sync = () => x.classList.toggle('hidden', !inp.value);
    const clear = () => { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); sync(); inp.focus(); };
    x.onclick = clear;
    inp.addEventListener('input', sync);
    inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); clear(); } });
    sync();
  }

  // ---------- Radar ----------
  let radarTimer = 0, pendingIm = null;
  function stopRadarTimer() { clearInterval(radarTimer); radarTimer = 0; }
  const EV_TEXT = {
    arrive: ['→', 'arrived'], leave: ['←', 'left'], hud: ['🎮', 'wore the HUD'], 'hud-off': ['🎮', 'took the HUD off'],
    use: ['▶', 'started using the bot'], refused: ['⛔', 'HUD refused – not one of the bot\'s people'],
    follow: ['👣', 'is followed by the bot'], 'follow-lost': ['👣', 'out of sight for 10 minutes – the bot stopped following'], 'hud-check': ['🎮', 'asked for a HUD update check'], young: ['🐣', 'is new in Second Life'], 'group-invite': ['👥', 'group invitation for the bot – answer it under Groups'], region: ['🗺', 'the bot entered the region']
  };
  function renderRadar(b) {
    const c = $('#content');
    const newDays = b.youngAlertDays > 0 ? b.youngAlertDays : (+ui.radarNewDays || 30);
    c.innerHTML = `
      <div class="row" style="align-items:center;gap:8px;margin-bottom:8px">
        <input class="in" id="radQ" placeholder="Filter names" style="max-width:220px" value="${esc(ui.radarQ || '')}">
        <label class="switch small" title="Only avatars within 20 m of the bot – they read its local chat (whisper 10 m, shout 100 m)"><input type="checkbox" id="radChat" ${ui.radarChat === '1' ? 'checked' : ''}><span class="tr"></span>In chat range</label>
        <label class="switch small" title="Only avatars younger than the age chosen on the right"><input type="checkbox" id="radNew" ${ui.radarNew === '1' ? 'checked' : ''}><span class="tr"></span>New only</label>
        <select class="in sm" id="radNewDays" title="New means: in Second Life for less than…" style="width:auto">${[7, 14, 30, 90].map(d => `<option value="${d}" ${newDays === d ? 'selected' : ''}>under ${d} days</option>`).join('')}</select>
        <span class="muted small" id="radInfo"></span>
      </div>
      <table class="tbl radar"><thead id="radHead"></thead><tbody id="radBody"></tbody></table>
      <div class="row" style="align-items:center;gap:8px;margin-top:16px"><h2 style="margin:0">Comings and goings</h2><span class="grow"></span>
        <label class="switch small" title="A Windows popup when an avatar younger than the chosen age is in the bot's region – also while the Radar is closed. The bot then asks Second Life for the age of each avatar arriving there (off by default)."><input type="checkbox" id="radAlert" ${b.youngAlertDays > 0 ? 'checked' : ''}><span class="tr"></span>Alert me about new avatars</label>
        <label class="switch small" title="Off: comings and goings are only listed here while the app runs. On: also written to daily files on this PC (one JSON object per line, for other tools)."><input type="checkbox" id="radSave" ${b.saveEvents ? 'checked' : ''}><span class="tr"></span>Save comings and goings to files</label>
        <button class="btn sm" id="radFiles" title="Daily files with who came and went – one JSON object per line, for other tools">📂 Files</button></div>
      <div class="log evlog" id="radLog"></div>`;
    let rows = [];
    const ss = String(ui.radarSort || 'dist:1').split(':'), sort = { k: ss[0] || 'dist', d: ss[1] === '-1' ? -1 : 1 };
    const COLS = [['name', 'Name', ''], ['age', 'Age', 'num'], ['dist', 'Distance', 'num'], ['where', 'Where', '']];
    const keyOf = (r, k) => k === 'name' ? (r.name || '~').toLowerCase() : k === 'age' ? (ageDays(r.born) ?? 1e9) : k === 'where' ? (r.region || '') + ' ' + String(r.x).padStart(3, '0') + String(r.y).padStart(3, '0') : r.dist;
    const drawHead = () => {
      $('#radHead').innerHTML = '<tr>' + COLS.map(([k, t, cl]) => `<th class="${cl} sortable" data-sort="${k}" title="Sort by ${t.toLowerCase()} – click again to reverse">${t}${sort.k === k ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '<th></th></tr>';
    };
    $('#radHead').onclick = e => {
      const th = e.target.closest('[data-sort]'); if (!th) return;
      if (sort.k === th.dataset.sort) sort.d = -sort.d; else { sort.k = th.dataset.sort; sort.d = 1; }
      saveUi('radarSort', sort.k + ':' + sort.d); drawHead(); draw();
    };
    drawHead();
    const draw = () => {
      const q = ($('#radQ').value || '').toLowerCase(), chatOnly = $('#radChat').checked, newOnly = $('#radNew').checked, nd = +$('#radNewDays').value;
      const list = rows.filter(r => (!q || (r.name || '').toLowerCase().includes(q)) && (!chatOnly || r.dist <= 20) && (!newOnly || (ageDays(r.born) ?? 1e9) < nd))
        .sort((x, y) => { const a = keyOf(x, sort.k), c = keyOf(y, sort.k); return (a < c ? -1 : a > c ? 1 : x.dist - y.dist) * sort.d; });
      const near = rows.filter(r => r.dist <= 20).length;
      $('#radInfo').textContent = b.state !== 'online' ? 'The bot is not online.' : `${rows.length} avatar${rows.length === 1 ? '' : 's'} around, ${near} in chat range · updated every 3 s`;
      const fol = b.status && b.status.following;
      $('#radBody').innerHTML = list.map(r => `<tr data-av="${esc(r.uuid)}">
        <td><b>${esc(r.name || '(name loading…)')}</b>${fol && fol === r.name ? ' <span class="pill online" style="padding:0 6px">👣 followed</span>' : ''}${(b.masters || []).some(m => sameAvatar(m, r.name)) ? ' <span class="muted small">🤝 uses the bot</span>' : ''}</td>
        <td class="num">${ageText(r.born)}</td>
        <td class="num">${r.dist <= 20 ? '<span class="chatr" title="Within 20 m: reads the bot\'s local chat">💬</span> ' : ''}${r.precise ? '' : '≈ '}${r.dist < 10 ? r.dist.toFixed(1) : Math.round(r.dist)} m</td>
        <td class="muted small">${r.sitting ? '🪑 ' : ''}${esc(r.region)} (${r.x}, ${r.y}${r.precise ? ', ' + r.z : ''})</td>
        <td><button class="btn sm" data-avm="${esc(r.uuid)}" title="Actions">⋯</button></td></tr>`).join('')
        || `<tr><td colspan="5" class="muted">${b.state === 'online' ? (rows.length ? 'Nobody matches the filters.' : 'Nobody around the bot right now.') : 'Start the bot to see who is around.'}</td></tr>`;
    };
    const drawLog = ev => {
      $('#radLog').innerHTML = (ev || []).map(e => {
        const [ic, tx] = EV_TEXT[e.type] || ['•', e.type];
        const t = new Date(e.t).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const who = e.type === 'region' ? esc(e.region) + ` <span class="muted">(${esc(e.extra)})</span>` : `<b>${esc(e.name || e.uuid)}</b>`;
        const extra = ['hud', 'hud-off', 'hud-check', 'use', 'refused', 'young', 'group-invite'].includes(e.type) && e.extra ? ` <span class="muted">${esc(e.extra)}</span>` : '';
        return `<div><span class="muted">${esc(t)}</span> ${ic} ${who} ${esc(tx)}${e.type === 'region' ? '' : ` <span class="muted">· ${esc(e.region)}</span>`}${extra}</div>`;
      }).join('') || '<div class="muted">Nothing yet. Arrivals and departures in the bot\'s region, HUDs worn and taken off, and people starting to use the bot are listed here and saved to daily files.</div>';
    };
    const pull = async () => {
      const cur = bot();
      if (section !== 'radar' || !cur || cur.id !== b.id) return;
      b = cur;
      try { rows = b.state === 'online' ? (await rpc('bot.radar', b.id)) || [] : []; } catch { rows = []; }
      draw();
      try { drawLog(await rpc('bot.events', b.id)); } catch { }
    };
    $('#radQ').oninput = () => { saveUi('radarQ', $('#radQ').value); draw(); };
    $('#radChat').onchange = e => { saveUi('radarChat', e.target.checked ? '1' : ''); draw(); };
    $('#radNew').onchange = e => { saveUi('radarNew', e.target.checked ? '1' : ''); draw(); };
    const setAlert = on => rpc('bot.youngAlert', b.id, on ? +$('#radNewDays').value : 0).then(() => { b.youngAlertDays = on ? +$('#radNewDays').value : 0; });
    $('#radNewDays').onchange = e => { saveUi('radarNewDays', e.target.value); draw(); if ($('#radAlert').checked) setAlert(true).catch(fail); };
    $('#radAlert').onchange = e => setAlert(e.target.checked).then(() => toast(e.target.checked ? `A popup when an avatar under ${$('#radNewDays').value} days is in ${b.label}'s region` : 'No popups about new avatars')).catch(fail);
    clearable('#radQ');
    $('#radFiles').onclick = () => rpc('bot.openEvents', b.id).catch(fail);
    $('#radSave').onchange = e => { b.saveEvents = e.target.checked; rpc('bot.saveEvents', b.id, e.target.checked).then(() => toast(e.target.checked ? 'Comings and goings of ' + b.label + ' are saved to daily files from now on.' : 'Comings and goings of ' + b.label + ' are no longer saved (files already written stay).')).catch(fail); };
    $('#radBody').onclick = e => {
      const btn = e.target.closest('[data-avm]') || e.target.closest('[data-av]');
      if (!btn) return;
      const id = btn.dataset.avm || btn.dataset.av;
      const r = rows.find(x => x.uuid === id); if (!r) return;
      const run = async (cmd, args, msg) => { try { const x = await rpc('bot.run', b.id, cmd, args); if (x && x.ok === false) throw new Error(x.reply || 'failed'); toast(msg); } catch (er) { fail(er); } };
      const name = r.name || r.uuid;
      const items = [{ hd: name },
        { t: '💬 Send an IM', f: () => { pendingIm = { id: r.uuid, name }; section = 'chat'; navPush(); renderMain(); } },
        { t: '🧭 Go to them', f: () => run('CompanionGoTo', [r.uuid, 'none'], b.label + ' is on the way to ' + name) },
        b.status && b.status.following === name
          ? { t: '✋ Stop following', f: () => run('CompanionFollow', ['stop', '0', '0', 'none'], 'Stopped following') }
          : { t: '👣 Follow them', f: () => run('CompanionFollow', [r.uuid, '2', '180', 'none'], b.label + ' follows ' + name) },
        { t: '📍 Offer a teleport to the bot', f: () => run('CompanionOfferTeleport', [r.uuid], 'Teleport offered to ' + name) },
        { t: '👤 Open their profile', f: () => rpc('openUrl', 'https://world.secondlife.com/resident/' + r.uuid).catch(fail) },
        { t: '📋 Copy name', f: () => rpc('copy', name).then(() => toast('Copied')) },
        { t: '📋 Copy key', f: () => rpc('copy', r.uuid).then(() => toast('Copied')) }];
      if (!(b.masters || []).some(m => sameAvatar(m, name)) && r.name)
        items.push({ t: '🤝 Let them use this bot', f: async () => { try { await rpc('people.add', b.id, name); toast(name + ' may use the bot – send them a HUD in 🎮 HUD'); } catch (er) { fail(er); } } });
      showMenu(btn, items);
    };
    draw();
    pull();
    radarTimer = setInterval(pull, 3000);
  }

  // ---------- HUD ----------
  function renderHud(b) {
    const c = $('#content');
    const you = (b.masters || []).join(' or ') || '(nobody yet – add your avatar under ✎ Bot settings)';
    const botName = b.botName || b.username;
    const alsoBot = S.bots.filter(x => x.id !== b.id && (b.masters || []).some(m => sameAvatar(m, x.botName || x.username)));
    c.innerHTML = `
      <div class="roles">
        <div class="role"><div class="ri">👤</div><div><div class="muted small">YOU – log in with your viewer as</div><b>${esc(you)}</b><div class="small">wear the HUD (the bot can send it to you)</div></div></div>
        <div class="arrow">controls →</div>
        <div class="role"><div class="ri">🤖</div><div><div class="muted small">THE BOT – runs in this app as</div><b>${esc(botName)}</b><div class="small">never log in as this one with your viewer while it runs here</div></div></div>
      </div>
      ${alsoBot.length ? `<div class="banner info"><span class="grow">${esc(alsoBot.map(x => x.label).join(', '))} is also set up as a bot in this app. While you play it in your viewer, do not start it here – Second Life allows one login per account.</span></div>` : ''}
      <p class="muted">The HUD is a shiny sphere with a glowing ring that <b>you</b> wear. Touch it for a menu that controls <b>${esc(botName)}</b> from wherever you are – no ports to open on this PC.</p>
      <h2>Get the HUD</h2>
      <p>The bot builds the HUD in Second Life and gives it to you – <b>already paired</b>. Accept it as ${esc(you)}, then in your inventory right-click it → <b>Add</b>. That's all.</p>
      <p class="muted small">Already wearing a HUD? <b>Update my HUD</b> adds every bot of this app you may use to it (Bot ▸ in the HUD switches between them). It goes silently when a bot your HUD already uses is online; otherwise each online bot sends you an IM with a one-click link (it works once, for your HUD only).</p>
      <div class="actions">
        <button class="btn pri" id="hudSend" title="The bot builds a new HUD where it stands and gives it to ${esc((b.masters || [])[0] || 'you')}">🎁 Send me a new HUD</button>
        <button class="btn" id="hudUpd" title="Puts every bot of this app that ${esc((b.masters || [])[0] || 'you')} may use into the HUD you already wear – no new HUD">🔄 Update my HUD</button>
        <span class="small" id="hudJob"></span>
      </div>
      <h2>People who use this bot</h2>
      <p class="muted">Everyone here can have their own HUD and use ${esc(botName)} at the same time – share the bot with a friend by adding them and sending them a HUD (＋ Add alone sends no HUD – for someone who already has one). Removing someone stops their HUD at once. Who came and went is listed under 📡 Radar.</p>
      <div class="people" id="ppl">${(b.masters || []).map((m, i) => `<div class="prow"><span class="grow">${i === 0 ? '👤' : '🤝'} <b>${esc(m)}</b>${i === 0 ? ' <span class="muted small">(you)</span>' : ''}</span>
        <button class="btn sm" data-psend="${esc(m)}" title="The bot builds a HUD and gives it to ${esc(m)}">🎁 Send HUD</button>
        <button class="btn sm" data-pupd="${esc(m)}" title="Puts every bot of this app that ${esc(m)} may use into the HUD ${esc(m)} wears">🔄 Update HUD</button>
        ${i === 0 ? '' : `<button class="btn sm" data-prm="${esc(m)}" title="${esc(m)} may no longer use the bot">✕ Remove</button>`}</div>`).join('')}</div>
      <div class="actions"><input class="in" id="pplIn" placeholder="Friend's avatar name, e.g. Jane Resident" style="max-width:300px"><button class="btn" id="pplAdd" title="They may use the bot – no HUD is sent (someone who already has a HUD keeps using it)">＋ Add</button><button class="btn" id="pplAddSend" title="Add them and let the bot build a new HUD and give it to them">＋ Add and send a HUD</button></div>
      <p class="muted small">The bot needs a spot where it may build for a minute (your own land usually works; else a public sandbox such as Sandbox Cordova). The first time it also makes its <i>courier</i> – a tiny object it wears as its own HUD, which nobody sees – that delivers HUD updates.</p>
      <label class="switch" style="margin-top:4px"><input type="checkbox" id="hudAuto" ${b.autoUpdateHud !== false ? 'checked' : ''}><span class="tr"></span>Update HUDs automatically</label>
      <div class="muted small" style="margin:4px 0 0 47px">When this app has a newer HUD, a HUD made by the bot updates itself a few seconds after you wear it (the bot must be in the same region). Your pairings stay. Update HUD pressed in the HUD's Settings works even when this is off, and first looks on GitHub for a newer HUD.</div>
      <div class="small" id="hudVer" style="margin-top:8px"></div>
      <details style="margin-top:14px"><summary class="muted">Or make the HUD by hand (it cannot update itself)</summary>
      <ol class="steps">
        <li><b>Make the HUD box</b> (once, as ${esc(you)})<br><span class="muted">The HUD has two scripts. In Second Life: Build → create a cube → tab Content → New Script → open it, select all, paste the <b>main</b> script, Save. Then a second New Script for the <b>menu</b> script. The box turns into the HUD button by itself.</span>
          <div class="actions" style="margin-top:8px"><button class="btn" id="hudCopy">Copy main script</button><button class="btn" id="hudCopyMenu">Copy menu script</button></div></li>
        <li><b>Wear it</b> (as ${esc(you)})<br><span class="muted">Right-click the box → Attach to HUD → Center (or any HUD spot). Then delete the cube you rezzed if it is still on the ground.</span></li>
        <li><b>Pair it with ${esc(botName)}</b><br><span class="muted">Copy the pairing line and paste it into local chat <b>as ${esc(you)}</b>, wearing the HUD (it starts with /7, so nobody else sees it). One HUD can hold several bots – paste the line of another bot to add it.</span>
          <div class="actions" style="margin-top:8px"><button class="btn" id="hudPair">Copy pairing line</button><span class="muted small" id="pairNote"></span></div></li>
      </ol></details>
      <h2>Use it</h2>
      <p class="muted">Sit in your vehicle, touch the HUD, choose <b>Sit with me</b>. The bot teleports next to you and takes a free seat.</p>
      <div style="margin-top:10px" class="hudmock"><span>Bot ▸</span><span>More ▸</span><span>Settings ▸</span><span>Teleport me</span><span>Fly ON</span><span>Adjust ▸</span><span>Sit on…</span><span>Outfit…</span><span>Go home</span><span>Sit with me</span><span>Come to me</span><span>Follow ▸</span></div>
      <p class="muted small">Teleport me: the bot sends you a teleport offer to where it is. Fly ON / Fly OFF: the bot takes off or lands (the button says Stand while it sits). Adjust ▸ moves the seated bot: Up/Down always, Forward/Backward/Left/Right on seats without a fixed sit spot. Settings ▸ makes the HUD smaller or bigger (or stretch it in Edit), picks the ring colour and shows or hides the floating text. The ring shows the state: your colour = ready, amber = working, red = failed.</p>
      <h2>Security</h2>
      <p class="muted">Commands from the HUD are signed with this bot's secret, so other people's scripts cannot control your bot. If a HUD is lost or given away, make a new secret – every HUD then has to be paired again.</p>
      <div class="actions"><button class="btn" id="hudSecret">Make a new secret…</button></div>`;
    const sendHud = async to => {
      try { $('#hudJob').textContent = 'Asking the bot…'; await rpc('hud.send', b.id, to); toast('The bot is building a HUD for ' + to + ' – about a minute'); }
      catch (e) { $('#hudJob').textContent = ''; fail(e); }
    };
    $('#ppl').onclick = async e => {
      const sd = e.target.closest('[data-psend]'), rm = e.target.closest('[data-prm]'), up = e.target.closest('[data-pupd]');
      if (sd) sendHud(sd.dataset.psend);
      if (up) updateHud(up.dataset.pupd, up);
      if (rm) { try { await rpc('people.remove', b.id, rm.dataset.prm); toast(rm.dataset.prm + ' can no longer use the bot'); await refresh(); renderMain(); } catch (er) { fail(er); } }
    };
    const addPerson = async send => {
      const n = $('#pplIn').value.trim();
      if (!n) { toast('Type the friend\'s avatar name first', 'bad'); return; }
      try {
        const r = await rpc('people.add', b.id, n);
        toast(n + ' may use the bot' + (r && r.restartNeeded ? ' (their HUD works now; IM commands and teleport offers from them after the next bot restart)' : '')
          + (send ? '' : ' – no HUD sent; use 🎁 Send HUD or 🔄 Update HUD in their row when needed'));
        if (send) { if (b.state === 'online') await sendHud(n); else toast('The bot is offline – no HUD sent. Start it, then press 🎁 Send HUD in their row.', 'bad'); }
        await refresh(); renderMain();
      } catch (er) { fail(er); }
    };
    $('#pplAdd').onclick = () => addPerson(false);
    $('#pplAddSend').onclick = () => addPerson(true);
    $('#hudUpd').onclick = e => updateHud((b.masters || [])[0] || '', e.currentTarget);
    $('#hudSend').onclick = async () => {
      const to = (b.masters || [])[0] || '';
      try { $('#hudJob').textContent = 'Asking the bot…'; await rpc('hud.send', b.id, to); toast('The bot is building your HUD – about a minute'); }
      catch (e) { $('#hudJob').textContent = ''; fail(e); }
    };
    $('#hudAuto').onchange = async e => { try { await rpc('bot.hudAuto', b.id, e.target.checked); } catch (er) { fail(er); } };
    updateHudLive(b);
    $('#hudCopyMenu').onclick = async () => { try { await rpc('copy', await rpc('hud.script', 'menu')); toast('Menu script copied – paste it into a second new script in the HUD box'); } catch (e) { fail(e); } };
    $('#hudCopy').onclick = async () => { try { await rpc('copy', await rpc('hud.script')); toast('Main script copied – paste it into a new script in the HUD box'); } catch (e) { fail(e); } };
    $('#hudPair').onclick = async () => {
      try { const code = await rpc('bot.pairCode', b.id); await rpc('copy', '/7 pair ' + code); toast('Pairing line copied – paste it into local chat in Second Life'); }
      catch (e) { fail(e); }
    };
    $('#pairNote').textContent = b.botUuid ? '' : 'Available after the bot has been online once.';
    $('#hudPair').disabled = !b.botUuid;
    $('#hudSecret').onclick = () => confirmDlg('Make a new secret?', 'Every HUD paired with this bot stops working until you paste the new pairing line. A running bot is restarted.', 'Make new secret', async () => {
      try { const r = await rpc('bot.newSecret', b.id); if (r === 'restart') await rpc('bot.restart', b.id); toast('New secret made. Copy the pairing line again.'); } catch (e) { fail(e); }
    });
  }

  async function updateHud(person, btn) {
    if (!person) { toast('Add your avatar under ✎ Bot settings first', 'bad'); return; }
    if (btn) btn.disabled = true;
    try {
      const r = await rpc('hud.update', person);
      const list = a => (a || []).join(', ');
      if (r.way === 'silent') toast('Done: ' + person + '\'s HUD now has ' + list(r.bots) + ' (through ' + r.through + ')' + (r.hud ? '; it also checks for HUD ' + r.hud : '') + '.');
      else if (r.way === 'invite') toast(list(r.invited) + ' sent ' + person + ' an IM with a one-click link – wearing the HUD, ' + person + ' clicks it once per bot.' + ((r.offline || []).length ? ' Offline, not sent: ' + list(r.offline) + '.' : ''));
      else if (r.way === 'none') toast('No bot that ' + person + ' may use is online – start one of them first.', 'bad');
      else toast('That did not work – see the log.', 'bad');
      if ((r.neverOnline || []).length) toast(list(r.neverOnline) + ': start once first (the app needs its avatar key).', 'bad');
    } catch (e) { fail(e); }
    if (btn) btn.disabled = false;
  }

  function updateHudLive(b) {
    const st = b.status || {};
    const job = $('#hudJob'), ver = $('#hudVer'), send = $('#hudSend');
    if (!job || !ver) return;
    const busy = st.hudJob === 'building';
    send.disabled = b.state !== 'online' || busy;
    send.title = b.state !== 'online' ? 'Start the bot first – it builds the HUD in Second Life' : 'The bot builds a new HUD where it stands and gives it to you';
    if (busy) job.textContent = '⏳ Building the HUD in Second Life… (about a minute)';
    else if ((st.hudJob || '').startsWith('sent')) job.textContent = '✓ ' + st.hudJob.replace(/^sent/, 'Sent') + ' – accept it in Second Life';
    else if (st.hudJob) job.textContent = '✗ ' + st.hudJob;
    else if (job.textContent === 'Asking the bot…' && b.state !== 'online') job.textContent = '';
    const latest = st.hudLatest || '';
    if (!st.hudSeen) ver.innerHTML = `<span class="muted">${latest ? `The app's HUD is version ${esc(latest)}. ` : ''}No HUD has reported to the bot yet since it started (HUDs older than 0.5.0 never report).</span>`;
    else {
      const when = new Date(st.hudSeen * 1000).toLocaleTimeString();
      const cur = st.hudVersion === latest;
      ver.innerHTML = `Last HUD that reported: version <b>${esc(st.hudVersion || '?')}</b> at ${esc(when)} – ` + (cur ? '<span class="ok">up to date</span>' : `<span class="warn">older than the app's ${esc(latest)}</span>${b.autoUpdateHud !== false ? ' (a HUD made by the bot updates itself)' : ''}`);
    }
  }

  function sameAvatar(a, b) {
    const n = s => String(s || '').toLowerCase().replace(/\./g, ' ').replace(/\s+resident$/, '').replace(/\s+/g, ' ').trim();
    return n(a) !== '' && n(a) === n(b);
  }

  // ---------- Chat ----------
  let chatTimer = 0, chatSeq = 0, chatItems = [], imTarget = null;
  function stopChatTimer() { clearInterval(chatTimer); chatTimer = 0; }
  // unread chat per kind, so an IM is seen without opening every chat filter
  const UNREAD_KINDS = [['im', '✉', 'IM', 'IMs'], ['group', '👥', 'group or conference message', 'group or conference messages'], ['local', '💬', 'local chat line', 'local chat lines'], ['object', '⚙', 'object or system message', 'object or system messages']];
  const unreadOf = (b, k) => (b.unreadBy || {})[k] || 0;
  function unreadBadges(b) {
    return UNREAD_KINDS.filter(([k]) => unreadOf(b, k)).map(([k, ic, one, many]) => { const n = unreadOf(b, k); return `<span class="badge k-${k}" title="${n} new ${n === 1 ? one : many}">${ic} ${n}</span>`; }).join('');
  }
  function unreadShort(b) { return UNREAD_KINDS.filter(([k]) => unreadOf(b, k)).map(([k, ic]) => `${ic}${unreadOf(b, k)}`).join(' '); }
  const CHIP_KIND = { local: 'local', im: 'im', group: 'group', object: 'object' };
  function chatChipCounts(b) {
    document.querySelectorAll('#chatFilter [data-f]').forEach(ch => {
      const k = CHIP_KIND[ch.dataset.f], n = k ? unreadOf(b, k) : 0, cnt = ch.querySelector('.cnt');
      if (cnt) { cnt.textContent = n || ''; cnt.classList.toggle('hidden', !n); }
    });
  }
  // the sound of each kind: a bell inside its chat filter (bright = on, crossed and dim = off)
  const SND_KEY = { im: 'notifyImSound', group: 'notifyGroupSound', local: 'notifyLocalSound' };
  const SND_NAME = { notifyImSound: 'IMs', notifyGroupSound: 'group chats', notifyLocalSound: 'local chat' };
  const bellHtml = k => `<span class="bell ${S.settings[k] ? 'on' : ''}" data-snd="${k}" title="Sound for ${SND_NAME[k]}: ${S.settings[k] ? 'on' : 'off'} – click to switch">${S.settings[k] ? '🔔' : '🔕'}</span>`;
  const CHAT_KINDS = { local: 'Local', whisper: 'Whisper', shout: 'Shout', im: 'IM', group: 'Group', conference: 'Conference', object: 'Object', ownersay: 'Object', objectim: 'Object IM', system: 'System', notice: 'Notice' };
  function renderChat(b) {
    const c = $('#content');
    c.className = 'content full';
    chatSeq = 0; chatItems = [];
    c.innerHTML = `
      <div class="logbar">
        <span class="chips" id="chatFilter">${[['all', 'All'], ['im', 'IMs'], ['group', 'Groups'], ['local', 'Local chat'], ['object', 'Objects & system']].map(([k, t]) => `<span class="chip ${(ui.chatFilter || 'all') === k ? 'on' : ''}" data-f="${k}" title="${k === 'all' ? 'Everything' : 'New ones are counted here until you look at them'}">${t}<span class="cnt hidden"></span>${SND_KEY[k] ? bellHtml(SND_KEY[k]) : ''}</span>`).join('')}</span>
        <span class="grow"></span>
        <button class="btn sm" id="chatOpen" title="Daily chat files">📂 Chat folder</button>
      </div>
      <div class="log chatbox" id="chatBox"></div>
      <div class="row" style="margin-top:8px">
        <select class="in" id="chatMode"><option value="local">Local chat</option><option value="whisper">Whisper</option><option value="shout">Shout</option><option value="im">IM to…</option></select>
        <div class="combo hidden" id="imBox" style="max-width:280px"><input class="in" id="imWho" placeholder="Avatar name or key"><button class="dd" id="imWhoDd" title="People from the chat">▾</button></div>
        <input class="in w" id="chatText" placeholder="Write as ${esc(b.botName || b.label)} – Enter sends">
        <button class="btn pri" id="chatSend" data-needs-online>Send</button>
      </div>`;
    const box = $('#chatBox');
    const show = k => {
      const f = ui.chatFilter || 'all';
      if (f === 'all') return true;
      if (f === 'local') return ['local', 'whisper', 'shout'].includes(k);
      if (f === 'im') return k === 'im';
      if (f === 'group') return ['group', 'conference'].includes(k);
      return ['object', 'ownersay', 'objectim', 'system', 'notice'].includes(k);
    };
    const draw = () => {
      const near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      box.innerHTML = chatItems.filter(i => show(i.kind)).map(i => {
        const t = new Date(i.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const who = i.out ? `${esc(b.botName || b.label)} → ${esc(i.from)}` : `<a href="#" data-im="${esc(i.fromId)}" data-name="${esc(i.from)}">${esc(i.from || '?')}</a>`;
        return `<div class="ln ck-${i.kind} ${i.out ? 'out' : ''}"><span class="tm">${t}</span><span class="kd">${CHAT_KINDS[i.kind] || i.kind}</span> <b>${who}</b>: ${esc(i.text)}</div>`;
      }).join('') || '<div class="muted">No chat yet. Local chat near the bot and IMs to the bot appear here while it is online.</div>';
      if (near) box.scrollTop = box.scrollHeight;
    };
    const pull = async (first) => {
      try {
        const add = await rpc('bot.chat', b.id, chatSeq, (ui.chatFilter || 'all') === 'all' ? true : ui.chatFilter);
        if (add.length) { chatItems = chatItems.concat(add).slice(-1500); chatSeq = add[add.length - 1].seq; draw(); if (first) box.scrollTop = box.scrollHeight; }
        else if (first) draw();
      } catch { }
    };
    const setMode = m => { $('#chatMode').value = m; $('#imBox').classList.toggle('hidden', m !== 'im'); };
    $('#chatMode').onchange = () => setMode($('#chatMode').value);
    $('#chatFilter').onclick = e => {
      const bell = e.target.closest('[data-snd]');
      if (bell) {
        e.stopPropagation();
        const k = bell.dataset.snd, on = !S.settings[k];
        S.settings[k] = on; bell.outerHTML = bellHtml(k);
        rpc('setting', k, on).then(() => toast((on ? 'Sound on for ' : 'Sound off for ') + SND_NAME[k])).catch(fail);
        return;
      } const x = e.target.closest('[data-f]'); if (!x) return; saveUi('chatFilter', x.dataset.f); $('#chatFilter').querySelectorAll('.chip').forEach(ch => ch.classList.toggle('on', ch === x)); draw(); rpc('bot.chat', b.id, 1e15, x.dataset.f === 'all' ? true : x.dataset.f).catch(() => { }); };
    chatChipCounts(b);
    box.onclick = e => {
      const a = e.target.closest('[data-im]'); if (!a) return;
      e.preventDefault();
      imTarget = { id: a.dataset.im, name: a.dataset.name };
      setMode('im'); $('#imWho').value = a.dataset.name; $('#chatText').focus();
    };
    $('#imWho').oninput = () => { imTarget = null; };
    $('#imWhoDd').onclick = e => {
      const seen = new Map();
      chatItems.filter(i => !i.out && i.fromId && ['local', 'whisper', 'shout', 'im'].includes(i.kind)).forEach(i => seen.set(i.fromId, i.from));
      (b.masters || []).forEach(m => { if (![...seen.values()].includes(m)) seen.set(m, m); });
      showMenu(e.currentTarget, [{ hd: 'People from the chat' }].concat([...seen].map(([id, name]) => ({ t: name, f: () => { imTarget = { id, name }; $('#imWho').value = name; } }))));
    };
    const send = async () => {
      const text = $('#chatText').value;
      if (!text.trim()) return;
      const mode = $('#chatMode').value;
      let target = '', name = '';
      if (mode === 'im') {
        name = $('#imWho').value.trim();
        target = imTarget && imTarget.name === name ? imTarget.id : name;
        if (!target) { toast('Choose who gets the IM', 'bad'); return; }
      }
      try { await rpc('bot.sendChat', b.id, mode, target, name, text); $('#chatText').value = ''; pull(); }
      catch (e) { fail(e); }
    };
    $('#chatSend').onclick = send;
    $('#chatText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    $('#chatOpen').onclick = () => rpc('bot.openChat', b.id);
    setMode('local');
    if (pendingIm) { imTarget = pendingIm; setMode('im'); $('#imWho').value = pendingIm.name; pendingIm = null; setTimeout(() => $('#chatText').focus(), 0); }
    pull(true);
    chatTimer = setInterval(pull, 1500);
    updateEnabled(b);
  }

  // ---------- Commands ----------
  const HIDDEN_MODULES = ['Discord', 'RabbitMQ', 'StreamAdmin', 'Services', 'Funds'];
  let selCmd = '';
  // ---------- a text editor for notecards and scripts (in the inventory or inside an object) ----------
  // save(text) → the bot's reply ({saved, messages} for scripts); a script's compile messages show under the text
  function textEditor(title, text, opts) {
    const o = opts || {};
    const body = `<textarea class="in mono" id="edT" spellcheck="false" style="width:100%;height:58vh;resize:vertical;font-family:Consolas,monospace;font-size:13px;white-space:pre;tab-size:4" ${o.save ? '' : 'readonly'}>${esc(text)}</textarea>
      <div id="edMsg" class="small" style="margin-top:6px;white-space:pre-wrap;max-height:120px;overflow:auto"></div>
      ${o.save ? '' : `<p class="muted small">${esc(o.why || 'Read only – the bot may not change it.')}</p>`}`;
    const btns = [];
    if (o.save) btns.push({ t: o.script ? 'Save and compile' : 'Save', cls: 'pri', f: async () => {
      const msg = $('#edMsg'); msg.textContent = 'Saving…'; msg.style.color = '';
      try {
        const r = await o.save($('#edT').value);
        let j = null; try { j = JSON.parse(r); } catch { }
        const m = j && j.messages ? j.messages.filter(x => x && x.trim()) : [];
        const bad = m.some(x => /error/i.test(x)) || m.includes('did not compile');
        msg.style.color = bad ? 'var(--bad,#e66)' : 'var(--good,#6c6)';
        msg.textContent = (bad ? '✗ Saved, but it did not compile:\n' : o.script ? '✓ Saved and compiled' + (j && j.running === true ? ' – it runs' : j && j.running === false ? ' – but it does not run (scripts may be off on this land)' : '') + (m.length ? ':\n' : '') : '✓ Saved') + m.join('\n');
      } catch (er) { msg.style.color = 'var(--bad,#e66)'; msg.textContent = '✗ ' + er.message; }
    } });
    btns.push({ t: 'Close', f: c => c() });
    dialog(title, body, btns, { wide: true });
    const ta = $('#edT');
    // Tab inserts spaces in scripts instead of leaving the box
    ta.onkeydown = e => { if (e.key === 'Tab' && o.save) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); } };
    ta.focus();
  }

  // ---------- Nearby (the world around the bot) ----------
  // objects around the bot like a viewer's: touch, sit, go to, take, copy, wear, delete, return, look inside
  let worldTimer = 0;
  function stopWorldTimer() { clearInterval(worldTimer); worldTimer = 0; }
  const W_FILTERS = [['all', 'All'], ['mine', 'The bot\'s'], ['touch', '👆 Touch'], ['sit', '🪑 Seats'], ['sale', '🏷 For sale']];
  async function renderWorld(b) {
    const c = $('#content');
    if (b.state !== 'online') { c.innerHTML = '<p class="muted">Start the bot to see what is around it.</p>'; return; }
    const st = ui.world = ui.world || { range: '20', f: 'all', q: '' };
    if (!['5', '10', '20', '40', '64', '128', '256'].includes(st.range)) st.range = '256';
    c.innerHTML = `<div class="row" style="align-items:center;gap:6px;flex-wrap:wrap">
        <div class="seg" id="wF">${W_FILTERS.map(([k, t]) => `<button data-wf="${k}" class="${st.f === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <input class="in" id="wQ" placeholder="Name – Enter searches the whole range" title="Typing filters the list; Enter (or 🔍) asks the bot to search every object in the chosen range by name" style="max-width:240px" value="${esc(st.q)}"><button class="btn sm" id="wFind" title="Search every object in the range by name">🔍</button>
        <select class="in sm" id="wR" style="width:auto;flex:0 0 auto" title="How far around the bot. Further than 64 m: the bot looks further for a few minutes (takes a few seconds)">${[5, 10, 20, 40, 64, 128, 256].map(r => `<option value="${r}" ${st.range === String(r) ? 'selected' : ''}>${r === 256 ? 'the whole region' : 'within ' + r + ' m'}</option>`).join('')}</select>
        <span class="grow"></span>
        <label class="switch small" title="Menus, text boxes and questions that objects send the bot also appear as a blue menu on the HUD of the person who uses the bot (HUD 1.7.2 or newer); your answer there goes back to the bot"><input type="checkbox" id="wHud"><span class="tr"></span>Menus on my HUD</label>
        <span id="wSit"></span>
        <button class="btn sm" id="wBox" title="Rezzes a 0.5 m box in front of the bot (where it may build)">＋ Box</button>
        <button class="btn sm" id="wRef" title="Look again">⟳</button></div>
      <div id="wInfo" class="muted small" style="margin:6px 0"></div>
      <table class="tbl"><thead><tr><th style="width:52px"></th><th>Name</th><th>Owner</th><th style="text-align:right">Distance</th><th></th></tr></thead><tbody id="wBody"></tbody></table>`;
    const run = async (cmd, args) => { const r = await rpc('bot.run', b.id, cmd, args); if (!r || r.ok === false) throw new Error((r && r.reply) || 'failed'); return r.reply; };
    let objs = [], sitting = 0, busy = false, total = 0, unnamed = 0;
    const shown = () => objs.filter(o => {
      if (st.q && !(o.name || '').toLowerCase().includes(st.q.toLowerCase())) return false;
      return st.f === 'all' || (st.f === 'mine' ? o.mine : st.f === 'touch' ? o.touch : st.f === 'sit' ? (o.sit || o.seated) : o.sale);
    });
    const marks = o => (o.seated ? '🧍' : o.sit ? '🪑' : '') + (o.touch ? '👆' : '') + (o.sale ? '🏷' : '') + (o.temp ? '⏱' : '');
    const draw = () => {
      const list = shown();
      $('#wBody').innerHTML = list.map(o => `<tr data-o="${o.lid}">
          <td title="🪑 seat · 👆 touchable · 🏷 for sale · ⏱ temporary · 🧍 the bot sits here">${marks(o)}</td>
          <td><a href="#" data-om="${o.lid}" title="${esc(o.desc || '')}">${esc(o.name || '(no name yet)')}</a>${o.seated ? ' <span class="pill online" style="padding:0 6px">sitting here</span>' : ''}${o.mine ? ' <span class="muted small">the bot\'s</span>' : ''}</td>
          <td class="small">${esc(o.ownerName || '')}</td>
          <td style="text-align:right;white-space:nowrap">${o.dist} m</td>
          <td style="text-align:right;white-space:nowrap">${o.touch ? `<button class="btn sm" data-oa="touch" data-l="${o.lid}" title="Touch it">👆</button>` : ''}${o.sit && !o.seated ? `<button class="btn sm" data-oa="sit" data-l="${o.lid}" title="Sit on it">🪑</button>` : ''}<button class="btn sm" data-om="${o.lid}">⋯</button></td></tr>`).join('')
        || `<tr><td colspan="5" class="muted">${objs.length ? 'Nothing matches the filter.' : 'Nothing found in this range.'}</td></tr>`;
      $('#wInfo').innerHTML = (st.find ? `🔍 "${esc(st.find)}": ${objs.length} found among ${total} objects` + (unnamed ? ` (${unnamed} did not tell their name yet – search again)` : '') + ' <a href="#" id="wFindX">show all again</a>'
        : objs.length ? `${list.length} of ${objs.length} objects` + (total > objs.length ? ` (the nearest ${objs.length} of ${total}, and all of the bot's – Enter in the name box searches them all)` : '') : '')
        + (+st.range > 64 ? ' · the bot looks further than usual for a few minutes' : '');
      const fx = $('#wFindX'); if (fx) fx.onclick = e => { e.preventDefault(); st.find = ''; st.q = ''; $('#wQ').value = ''; load(); };
      $('#wSit').innerHTML = sitting ? '<button class="btn sm" id="wStand">🧍 Stand up</button>' : '';
      if (sitting) $('#wStand').onclick = () => act('stand', 0);
    };
    async function load(quiet) {
      if (busy) return;
      if (!$('#wBody')) { stopWorldTimer(); return; }
      if (quiet && (openMenu || openDialogs.size)) return;   // keep a menu or dialog where it is
      busy = true;
      if (!quiet) $('#wInfo').textContent = st.find ? 'Searching every object in range by name – this can take a few seconds…' : +st.range > 64 ? 'Looking further around – this takes a few seconds…' : 'Looking around…';
      try { const r = JSON.parse(await run('CompanionNearby', [st.range, st.find || 'none'])); objs = r.objects || []; total = r.total || objs.length; unnamed = r.unnamed || 0; sitting = r.sitting || 0; if ($('#wBody')) draw(); }
      catch (er) { if (!quiet && $('#wInfo')) $('#wInfo').textContent = 'Could not look around: ' + er.message; }
      finally { busy = false; }
    }
    const DONE_RELOAD = ['sit', 'stand', 'take', 'copy', 'delete', 'return', 'wear', 'go', 'rename', 'newbox'];
    async function act(action, lid, arg) {
      try { toast(await run('CompanionObjectDo', [action, String(lid), arg === undefined || arg === '' ? 'none' : arg])); if (DONE_RELOAD.includes(action)) setTimeout(() => load(true), action === 'go' ? 4000 : 1500); }
      catch (er) { fail(er); }
    }
    const pre = t => `<pre style="white-space:pre-wrap;max-height:60vh;overflow:auto;margin:0">${esc(t)}</pre>`;
    async function about(o) {
      try {
        const i = JSON.parse(await run('CompanionObjectDo', ['info', String(o.lid), 'none']));
        const rows = [['Description', i.desc], ['Owner', i.owner], ['Creator', i.creator], ['The owner may', i.ownerPerms], ['Next owner may', i.nextPerms],
          ['Anyone may copy', i.everyoneCopy ? 'yes' : 'no'], ['For sale', i.sale === 'Not' ? 'no' : `${i.sale} · L$ ${i.price}`], ['Prims', i.prims], ['Scripted', i.scripted ? 'yes' : 'no'], ['Position', i.pos], ['Key', i.id]];
        dialog(i.name || o.name, `<table class="tbl">${rows.map(([k, v]) => `<tr><td class="muted" style="width:150px">${k}</td><td>${esc(String(v ?? ''))}</td></tr>`).join('')}</table>`, [{ t: 'Close', f: x => x() }], { wide: true });
      } catch (er) { fail(er); }
    }
    async function inside(o) {
      const nm = o.name || 'the object', canMod = o.mine || o.modify, L = String(o.lid);
      let l = [];
      const get = async () => { l = JSON.parse(await run('CompanionObjectDo', ['contents', L, 'none'])); };
      const table = () => l.length ? `<table class="tbl">${l.map(x => `<tr data-ti="${esc(x.id)}"><td style="width:28px">${INV_ICON[x.kind] || '·'}</td><td>${esc(x.name)}</td><td style="text-align:right;white-space:nowrap">${x.kind === 'Notecard' || x.kind === 'LSL' ? `<button class="btn sm" data-ta="open">${canMod && x.mod ? '✎ Open' : '📝 Read'}</button>` : ''}${canMod ? '<button class="btn sm" data-ta="take" title="Into the bot\'s inventory">🎒</button><button class="btn sm" data-ta="delete" title="Delete it from inside">🗑</button>' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">Empty – or the bot may not look inside.</p>';
      try { await get(); } catch (er) { fail(er); return; }
      dialog('Inside ' + nm, `<div id="tiBox">${table()}</div>` + (canMod ? '<div class="row" style="gap:6px;margin-top:8px;align-items:center"><button class="btn sm" id="tiNS">＋ New script</button><button class="btn sm" id="tiNN">＋ New notecard</button><span class="muted small">To put something from the inventory in: Inventory › ⋯ › Put into an object nearby</span></div>' : ''), [{ t: 'Close', f: x => x() }], { wide: true });
      const again = () => setTimeout(async () => { try { await get(); const b2 = $('#tiBox'); if (b2) b2.innerHTML = table(); } catch { } }, 1500);
      $('#tiBox').onclick = async e => {
        const btn = e.target.closest('[data-ta]'); if (!btn) return;
        const id = btn.closest('[data-ti]').dataset.ti, x = l.find(y => y.id === id); if (!x) return;
        const ta = btn.dataset.ta;
        if (ta === 'open') {
          try { const t = await run('CompanionTaskDo', ['read', L, id, 'none']); textEditor(x.name + ' – inside ' + nm, t, { script: x.kind === 'LSL', save: canMod && x.mod ? txt => run('CompanionTaskDo', ['save', L, id, txt === '' ? 'none' : txt]) : null }); }
          catch (er) { fail(er); }
        } else if (ta === 'delete') confirmDlg('Delete ' + x.name + '?', 'It is removed from inside ' + nm + ' for good.', 'Delete', async () => { try { toast(await run('CompanionTaskDo', ['delete', L, id, 'none'])); again(); } catch (er) { fail(er); } });
        else if (ta === 'take') { try { toast(await run('CompanionTaskDo', ['take', L, id, 'none'])); again(); } catch (er) { fail(er); } }
      };
      const mkIn = async (action, def) => { const n = await askText('Name', def); if (!n) return; try { toast(await run('CompanionTaskDo', [action, L, 'none', n])); again(); } catch (er) { fail(er); } };
      if (canMod) { $('#tiNS').onclick = () => mkIn('newscript', 'New Script'); $('#tiNN').onclick = () => mkIn('newnote', 'New Note'); }
    }
    function objMenu(anchor, o) {
      const m = [{ hd: o.name || 'Object' }];
      m.push({ t: '👆 Touch', f: () => act('touch', o.lid) });
      m.push(o.seated ? { t: '🧍 Stand up', f: () => act('stand', 0) } : { t: '🪑 Sit on it', f: () => act('sit', o.lid) });
      m.push({ t: '🚶 Go to it', f: () => act('go', o.lid) });
      m.push({ t: 'ℹ About it', f: () => about(o) });
      m.push({ t: o.mine || o.modify ? '🔍 Contents (scripts, notecards…)' : '🔍 Look inside', f: () => inside(o) });
      if (o.mine || o.modify) {
        m.push({ t: '✎ Rename…', f: async () => { const n = await askText('New name', o.name || ''); if (n && n !== o.name) act('rename', o.lid, n); } });
        m.push({ t: '✎ Description…', f: async () => { const n = await askText('Description', o.desc || ''); if (n && n !== o.desc) act('describe', o.lid, n); } });
      }
      if (o.mine) {
        m.push({ t: '🎒 Take into the inventory', f: () => act('take', o.lid) });
        m.push({ t: '👕 Wear it', f: () => act('wear', o.lid) });
      }
      if (o.copy) m.push({ t: '📄 Take a copy', f: () => act('copy', o.lid) });
      if (o.mine || o.modify) m.push({ t: '🗑 Delete (to the bot\'s Trash)', f: () => confirmDlg('Delete ' + (o.name || 'this object') + '?', 'It goes to the bot\'s Trash in its inventory – you can bring it back from there.', 'Delete', () => act('delete', o.lid)) });
      m.push({ t: o.mine ? '↩ Return (to Lost and Found)' : '↩ Return to its owner', f: () => confirmDlg('Return ' + (o.name || 'this object') + '?', o.mine ? 'It goes back into the bot\'s inventory (Lost and Found).' : 'It goes back to its owner. Only the land owner or an estate manager may return other people\'s things.', 'Return', () => act('return', o.lid)) });
      m.push({ t: '🔑 Copy its key', f: () => { navigator.clipboard.writeText(o.id); toast('Key copied'); } });
      showMenu(anchor, m);
    }
    $('#wBody').onclick = e => {
      const a = e.target.closest('[data-oa]');
      if (a) { act(a.dataset.oa, a.dataset.l); return; }
      const mm = e.target.closest('[data-om]');
      if (mm) { e.preventDefault(); const o = objs.find(x => String(x.lid) === mm.dataset.om); if (o) objMenu(mm, o); }
    };
    $('#wF').onclick = e => { const x = e.target.closest('[data-wf]'); if (!x) return; st.f = x.dataset.wf; $('#wF').querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); draw(); };
    $('#wQ').oninput = e => { st.q = e.target.value; draw(); };
    const search = () => { const q = $('#wQ').value.trim(); if (q.length < 2) { toast('Type at least two letters'); return; } st.find = q; st.q = ''; load(); };
    $('#wQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
    $('#wFind').onclick = search;
    $('#wR').onchange = e => { st.range = e.target.value; load(); };
    $('#wRef').onclick = () => load();
    $('#wBox').onclick = async () => { const n = await askText('Name of the new box', 'Object'); if (n) act('newbox', 0, n); };
    run('CompanionMenusToHud', ['ask']).then(v => { const x = $('#wHud'); if (x) x.checked = v === 'on'; }).catch(() => { const x = $('#wHud'); if (x) x.disabled = true; });
    $('#wHud').onchange = async e => { try { const v = await run('CompanionMenusToHud', [e.target.checked ? 'on' : 'off']); toast(v === 'on' ? 'Object menus also go to your HUD' : 'Object menus only here in the app'); } catch (er) { fail(er); } };
    stopWorldTimer();
    worldTimer = setInterval(() => load(true), 8000);
    await load();
  }

  // ---------- Menus that objects send the bot (llDialog, llTextBox, permissions, links) ----------
  // shown like a viewer's blue menus, top right, for the bot that is open; answered from here
  const PERM_TEXT = { Debit: 'take Linden dollars from the bot', TakeControls: 'take the bot\'s controls', RemapControls: 'remap the bot\'s controls', TriggerAnimation: 'animate the bot', Attach: 'attach to the bot', ReleaseOwnership: 'release its ownership', ChangeLinks: 'change its links', ChangeJoints: 'change joints', ChangePermissions: 'change permissions', TrackCamera: 'track the bot\'s camera', ControlCamera: 'control the bot\'s camera', Teleport: 'teleport the bot' };
  const menuGone = new Set();
  let menuBusy = false;
  function menuStack() {
    let s = document.getElementById('menuStack');
    if (!s) { s = document.createElement('div'); s.id = 'menuStack'; document.body.appendChild(s); }
    return s;
  }
  // llDialog buttons fill rows of three from the bottom left, as viewers show them
  function dialogRows(btns) {
    const rows = [];
    for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
    return rows.reverse();
  }
  async function pollMenus() {
    const b = bot(), s = menuStack();
    if (!b || b.state !== 'online') { s.innerHTML = ''; s.dataset.bot = ''; return; }
    if (menuBusy) return;
    menuBusy = true;
    try {
      const r = await rpc('bot.run', b.id, 'CompanionMenus', []);
      if (!r || r.ok === false) return;
      const list = JSON.parse(r.reply || '[]').filter(m => !menuGone.has(b.id + ':' + m.id));
      if (s.dataset.bot !== b.id) { s.innerHTML = ''; s.dataset.bot = b.id; }
      const want = new Set(list.map(m => String(m.id)));
      s.querySelectorAll('[data-mid]').forEach(el => { if (!want.has(el.dataset.mid) && !el.contains(document.activeElement)) el.remove(); });
      list.forEach(m => { if (!s.querySelector(`[data-mid="${m.id}"]`)) s.appendChild(menuCard(b, m)); });
    } catch { } finally { menuBusy = false; }
  }
  function menuCard(b, m) {
    const d = document.createElement('div');
    d.className = 'mcard';
    d.dataset.mid = m.id;
    const head = `<div class="mh"><b>${m.kind === 'permission' ? '🔐' : m.kind === 'url' ? '🔗' : '📋'} ${esc(m.object || 'Object')}</b><span class="grow"></span><button class="x" data-ans="!!close!!" title="Ignore">✕</button></div>
      <div class="muted small">${esc(b.label)}${m.owner ? ' · owner ' + esc(m.owner) : ''}</div>`;
    let body = '';
    if (m.kind === 'menu') body = `<div class="mmsg">${esc(m.message)}</div><div class="mbtns">${dialogRows(m.buttons).map(row => row.map(t => `<button class="btn sm" data-ans="${esc(t)}">${esc(t)}</button>`).join('')).join('')}</div>`;
    else if (m.kind === 'text') body = `<div class="mmsg">${esc(m.message)}</div><div class="row" style="gap:6px"><input class="in w" data-tx placeholder="Your answer – Enter sends"><button class="btn sm pri" data-send>Send</button></div>`;
    else if (m.kind === 'permission') body = `<div class="mmsg">It asks to ${esc((m.perms || []).map(p => PERM_TEXT[p] || p).join(', '))}.</div>${m.debit ? '<div class="mmsg" style="color:var(--bad,#e66)">⚠ With this it can take the bot\'s Linden dollars. Only allow it for something you trust.</div>' : ''}<div class="mbtns"><button class="btn sm ${m.debit ? '' : 'pri'}" data-ans="yes">Allow</button><button class="btn sm" data-ans="no">Refuse</button></div>`;
    else body = `<div class="mmsg">${esc(m.message)}</div><div class="small" style="word-break:break-all">${esc(m.url)}</div><div class="mbtns"><button class="btn sm pri" data-open>Open in the browser</button></div>`;
    d.innerHTML = head + body;
    const answer = async a => {
      menuGone.add(b.id + ':' + m.id); d.remove();
      try { const r = await rpc('bot.run', b.id, 'CompanionMenuAnswer', [String(m.id), a]); if (!r || r.ok === false) throw new Error((r && r.reply) || 'failed'); if (a !== '!!close!!') toast(r.reply); }
      catch (er) { fail(er); }
    };
    d.onclick = e => {
      const x = e.target.closest('[data-ans]'); if (x) { answer(x.dataset.ans); return; }
      if (e.target.closest('[data-send]')) { answer(d.querySelector('[data-tx]').value); return; }
      if (e.target.closest('[data-open]')) { rpc('openUrl', m.url).catch(fail); answer('!!close!!'); }
    };
    const tx = d.querySelector('[data-tx]');
    if (tx) tx.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answer(tx.value); } };
    return d;
  }
  setInterval(pollMenus, 2000);

  // ---------- Inventory ----------
  // the bot's inventory like a viewer's: folders, search, what it wears, and the usual actions on items and folders
  const INV_ICON = { Object: '📦', Attachment: '📦', Wearable: '👕', Notecard: '📝', LSL: '📜', Texture: '🖼', Snapshot: '🖼', Sound: '🔊', Animation: '🏃', Gesture: '👋', Landmark: '📍', CallingCard: '🪪', Settings: '🌤', Material: '🎨', link: '🔗' };
  async function renderInventory(b) {
    const c = $('#content');
    if (b.state !== 'online') { c.innerHTML = '<p class="muted">Start the bot to see its inventory.</p>'; return; }
    ui.inv = ui.inv || {};
    const st = ui.inv[b.id] = ui.inv[b.id] || { folder: '', view: 'folder', cut: null };
    c.innerHTML = `<div class="row" style="align-items:center;gap:6px;flex-wrap:wrap">
        <div class="seg"><button id="invVF" class="${st.view === 'folder' ? 'on' : ''}">📁 Folders</button><button id="invVW" class="${st.view === 'worn' ? 'on' : ''}">👕 Worn</button><button id="invVT" class="${st.view === 'trash' ? 'on' : ''}">🗑 Trash</button><button id="invVO" class="${st.view === 'outfits' ? 'on' : ''}">👗 Outfits</button></div>
        <input class="in" id="invQ" placeholder="Search the whole inventory – Enter" style="max-width:280px" value="${esc(st.q || '')}">
        <span class="grow"></span>
        <span id="invCut" class="small"></span>
        <button class="btn sm" id="invNew" title="A new folder, notecard or script here">＋ New ▾</button>
        <button class="btn sm" id="invRef">⟳</button></div>
      <div id="invPath" class="small" style="margin:8px 0 4px"></div>
      <div id="invInfo" class="muted small"></div>
      <table class="tbl"><tbody id="invBody"></tbody></table>`;
    const run = async (cmd, args) => { const r = await rpc('bot.run', b.id, cmd, args); if (!r || r.ok === false) throw new Error((r && r.reply) || 'failed'); return r.reply; };
    const info = t => { $('#invInfo').textContent = t || ''; };
    if (st.view === 'outfits') {
      // the outfit gallery: My Outfits as cards with pictures kept on this PC (paste with Ctrl+V)
      ['#invQ', '#invNew', '#invCut'].forEach(s => $(s).classList.add('hidden'));
      $('#invBody').closest('table').outerHTML = '<div class="ogrid" id="oGrid"></div>';
      $('#invPath').innerHTML = '<button class="btn sm pri" id="oSave" data-needs-online title="Makes a new outfit in My Outfits from what the bot wears now (links, as a viewer does)">＋ Save what the bot wears…</button> <span class="muted small">Click a card, then Ctrl+V pastes a picture onto it.</span>';
      let outfits = [], sel = st.outfitSel || '';
      const pics = {};
      const card = o => `<div class="ocard ${o.id === sel ? 'sel' : ''}" data-oc="${esc(o.id)}" title="${esc(o.name)}">
          <div class="opic" data-pic="${esc(o.id)}">${pics[o.id] ? `<img alt="" src="${pics[o.id]}">` : '<span>👗</span>'}</div>
          <div class="oname">${o.current ? '<span class="pill online" style="padding:0 6px">worn</span> ' : ''}${esc(o.name)}</div>
          <div class="obtns"><button class="btn sm pri" data-ow="${esc(o.id)}">Wear</button><button class="btn sm" data-oadd="${esc(o.id)}" title="Add to what the bot wears">➕</button><button class="btn sm" data-om2="${esc(o.id)}">⋯</button></div></div>`;
      const draw = () => {
        $('#oGrid').innerHTML = outfits.map(card).join('') || '<p class="muted">No outfits in My Outfits yet – wear something and press "Save what the bot wears".</p>';
        info(outfits.length ? `${outfits.length} outfits` : '');
      };
      const loadPics = async () => {
        for (const o of outfits) {
          if (o.id in pics) continue;
          try { pics[o.id] = await rpc('outfit.image', b.id, o.id) || ''; } catch { pics[o.id] = ''; }
          if (pics[o.id]) { const p = document.querySelector(`[data-pic="${o.id}"]`); if (p) p.innerHTML = `<img alt="" src="${pics[o.id]}">`; }
        }
      };
      const loadOutfits = async () => {
        info('Asking Second Life…');
        try { const r = JSON.parse(await run('CompanionOutfitList', [])); outfits = r.outfits || []; draw(); loadPics(); }
        catch (er) { info('Could not read the outfits: ' + er.message); }
      };
      // a picture (file or pasted) → at most 512 px JPEG → saved on this PC for this outfit
      const setPic = (id, file) => new Promise(res => {
        if (!file || !file.type.startsWith('image/')) { toast('That is not a picture', 'bad'); return res(); }
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = async () => {
          URL.revokeObjectURL(url);
          const k = Math.min(1, 512 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          const g = cv.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
          const data = cv.toDataURL('image/jpeg', 0.86);
          try { await rpc('outfit.setImage', b.id, id, data); pics[id] = data; draw(); toast('Picture saved'); } catch (er) { fail(er); }
          res();
        };
        img.onerror = () => { URL.revokeObjectURL(url); toast('That picture could not be read', 'bad'); res(); };
        img.src = url;
      });
      const pickFile = id => { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.onchange = () => setPic(id, f.files[0]); f.click(); };
      const imageOf = e => { for (const it of (e.clipboardData || e.dataTransfer || {}).items || []) if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile(); return null; };
      const onPaste = e => {
        if (!$('#oGrid')) { document.removeEventListener('paste', onPaste); return; }
        if (openDialogs.size || e.target.closest && e.target.closest('input,textarea')) return;
        const f = imageOf(e); if (!f) return;
        e.preventDefault();
        if (!sel) { toast('Click the outfit the picture is for first'); return; }
        setPic(sel, f);
      };
      if (renderInventory.paste) document.removeEventListener('paste', renderInventory.paste);
      renderInventory.paste = onPaste;
      document.addEventListener('paste', onPaste);
      const grid = $('#oGrid');
      grid.ondragover = e => { if (e.target.closest('[data-oc]')) e.preventDefault(); };
      grid.ondrop = e => { const c2 = e.target.closest('[data-oc]'); if (!c2) return; e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setPic(c2.dataset.oc, f); };
      const wearDo = async (action, o) => { try { toast(await run('CompanionInvDo', [action, o.id, 'none'])); setTimeout(loadOutfits, 2500); } catch (er) { fail(er); } };
      grid.onclick = e => {
        const c2 = e.target.closest('[data-oc]'); if (!c2) return;
        const o = outfits.find(x => x.id === c2.dataset.oc); if (!o) return;
        sel = st.outfitSel = o.id;
        grid.querySelectorAll('.ocard').forEach(x => x.classList.toggle('sel', x === c2));
        if (e.target.closest('[data-ow]')) { wearDo('wear', o); return; }
        if (e.target.closest('[data-oadd]')) { wearDo('add', o); return; }
        const mb = e.target.closest('[data-om2]'); if (!mb) return;
        showMenu(mb, [{ hd: o.name },
          { t: '👗 Wear (replaces the outfit)', f: () => wearDo('wear', o) },
          { t: '➕ Add (keeps what is worn)', f: () => wearDo('add', o) },
          { t: '➖ Take it off', f: () => wearDo('remove', o) },
          { t: '📁 Show what is in it', f: () => { st.view = 'folder'; st.folder = o.id; renderInventory(b); } },
          { t: '🖼 Picture from a file…', f: () => pickFile(o.id) },
          { t: '📋 Paste a picture (Ctrl+V)', f: () => toast('Press Ctrl+V now – the picture goes onto "' + o.name + '"') },
          ...(pics[o.id] ? [{ t: '✕ Remove the picture', f: async () => { try { await rpc('outfit.setImage', b.id, o.id, ''); pics[o.id] = ''; draw(); } catch (er) { fail(er); } } }] : []),
          { t: '✎ Rename…', f: async () => { const n = await askText('New name', o.name); if (n && n !== o.name) { try { toast(await run('CompanionInvDo', ['rename', o.id, n])); setTimeout(loadOutfits, 1200); } catch (er) { fail(er); } } } },
          { t: '🗑 Delete the outfit (to the Trash)', f: () => confirmDlg('Delete "' + o.name + '"?', 'The outfit folder goes to the bot\'s Trash. The things in it stay where they are – an outfit holds links to them.', 'Delete', async () => { try { toast(await run('CompanionInvDo', ['trash', o.id, 'none'])); setTimeout(loadOutfits, 1200); } catch (er) { fail(er); } }) }]);
      };
      $('#oSave').onclick = async () => {
        const n = await askText('Name of the new outfit', 'Outfit ' + new Date().toLocaleDateString());
        if (!n) return;
        info('Saving…');
        try { toast(await run('CompanionOutfitSave', [n])); setTimeout(loadOutfits, 1500); } catch (er) { info(''); fail(er); }
      };
      $('#invRef').onclick = () => { Object.keys(pics).forEach(k => delete pics[k]); loadOutfits(); };
      $('#invVF').onclick = () => { st.view = 'folder'; renderInventory(b); };
      $('#invVW').onclick = () => { st.view = 'worn'; renderInventory(b); };
      $('#invVT').onclick = () => { st.view = 'trash'; renderInventory(b); };
      $('#invVO').onclick = () => renderInventory(b);
      updateEnabled(b);
      loadOutfits();
      return;
    }
    let cur = null;
    const showCut = () => {
      $('#invCut').innerHTML = st.cut ? `✂ ${esc(st.cut.name)} <button class="btn sm" id="invPaste">Move here</button> <button class="btn sm" id="invUncut" title="Forget">✕</button>` : '';
      if (!st.cut) return;
      $('#invPaste').onclick = async () => { if (!cur) return; try { toast(await run('CompanionInvDo', ['move', st.cut.id, cur.id])); st.cut = null; showCut(); setTimeout(load, 800); } catch (er) { fail(er); } };
      $('#invUncut').onclick = () => { st.cut = null; showCut(); };
    };
    const badge = it => (it.worn ? ` <span class="pill online" style="padding:0 6px">${it.worn === 'worn' ? 'worn' : 'on ' + esc(it.worn)}</span>` : '')
      + (!it.copy || !it.mod || !it.trans ? ` <span class="muted small" title="What the bot may do with it">${[!it.copy && 'no copy', !it.mod && 'no modify', !it.trans && 'no transfer'].filter(Boolean).join(' · ')}</span>` : '');
    const itemRow = (it, extra) => `<tr data-i="${esc(it.id)}"><td style="width:28px">${INV_ICON[it.kind] || '·'}</td><td>${esc(it.name)}${badge(it)}${extra || ''}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-m="${esc(it.id)}">⋯</button></td></tr>`;
    const folderRow = f => `<tr data-f="${esc(f.id)}" style="cursor:pointer"><td style="width:28px">📁</td><td><b>${esc(f.name)}</b>${f.type && f.type !== 'None' ? ' <span class="muted small">system</span>' : ''}</td><td style="text-align:right"><button class="btn sm" data-fm="${esc(f.id)}">⋯</button></td></tr>`;
    let items = {}, folders = {};
    async function load() {
      info('Asking Second Life…');
      try {
        if (st.view === 'worn') {
          const w = JSON.parse(await run('CompanionInvWorn', []));
          cur = null; $('#invPath').textContent = 'What the bot wears now';
          items = {};
          const rows = w.wearables.map(x => { items[x.id] = { id: x.id, name: x.name, kind: 'Wearable', worn: 'worn', copy: true, mod: true, trans: true }; return itemRow(items[x.id], ` <span class="muted small">${esc(x.type)}</span>`); })
            .concat(w.attachments.map(x => { items[x.id] = { id: x.id, name: x.name, kind: 'Object', worn: x.point, copy: true, mod: true, trans: true }; return itemRow(items[x.id]); }));
          $('#invBody').innerHTML = rows.join('') || '<tr><td class="muted">Nothing worn (still loading?)</td></tr>';
          info(`${w.wearables.length} clothing / body parts · ${w.attachments.length} attachments`);
          return;
        }
        if (st.view === 'search') {
          const r = JSON.parse(await run('CompanionInvSearch', [st.q]));
          cur = null; $('#invPath').innerHTML = `Search: <b>${esc(st.q)}</b>`;
          items = {}; folders = {};
          $('#invBody').innerHTML = r.hits.map(h => h.isFolder ? (folders[h.id] = { id: h.id, name: h.name }, folderRow(h).replace('</b>', `</b> <span class="muted small">in ${esc(h.folderName)}</span>`))
            : (items[h.item.id] = Object.assign({ folder: h.folder }, h.item), itemRow(h.item, ` <span class="muted small">in <a href="#" data-go="${esc(h.folder)}">${esc(h.folderName)}</a></span>`))).join('') || '<tr><td class="muted">Nothing found</td></tr>';
          info(`${r.hits.length} found${r.complete ? '' : ' (search stopped early – narrow it down)'}`);
          return;
        }
        let fid = st.folder;
        if (st.view === 'trash') { if (!st.trash) { const top = JSON.parse(await run('CompanionInvList', [''])); st.trash = top.trash; } fid = st.trash; }
        const r = JSON.parse(await run('CompanionInvList', [fid || '']));
        cur = r; if (!st.trash) st.trash = r.trash;
        if (st.view === 'folder') st.folder = r.id;
        $('#invPath').innerHTML = r.path.map((p, i) => i === r.path.length - 1 ? `<b>${esc(p.name)}</b>` : `<a href="#" data-go="${esc(p.id)}">${esc(p.name)}</a>`).join(' › ');
        items = {}; folders = {};
        r.items.forEach(x => items[x.id] = x); r.folders.forEach(f => folders[f.id] = f);
        $('#invBody').innerHTML = r.folders.map(folderRow).join('') + r.items.map(x => itemRow(x)).join('') || '<tr><td class="muted">Empty</td></tr>';
        info(`${r.folders.length} folders · ${r.items.length} items` + (st.view === 'trash' && (r.folders.length || r.items.length) ? ' · ⋯ on an entry brings it back' : ''));
        if (st.view === 'trash') $('#invPath').innerHTML += ' <button class="btn sm danger" id="invEmpty">Empty the Trash…</button>';
        const e = $('#invEmpty'); if (e) e.onclick = () => confirmDlg('Empty the Trash', 'Everything in the bot\'s Trash will be deleted for good.', 'Empty it', async () => { try { toast(await run('CompanionInvDo', ['emptytrash', 'none', 'none'])); setTimeout(load, 1000); } catch (er) { fail(er); } });
      } catch (er) { info('Could not read the inventory: ' + er.message); }
    }
    // puts an inventory item into one of the objects nearby that the bot may change
    async function putInto(it) {
      let objs;
      try { objs = (JSON.parse(await run('CompanionNearby', ['20', 'none'])).objects || []).filter(o => o.mine || o.modify); } catch (er) { fail(er); return; }
      if (!objs.length) { toast('No object within 20 m that the bot may change', 'bad'); return; }
      dialog('Put ' + it.name + ' into…', `<table class="tbl">${objs.map(o => `<tr><td><a href="#" data-pi="${o.lid}">${esc(o.name || '(no name)')}</a></td><td class="small muted">${o.dist} m</td></tr>`).join('')}</table>`, [{ t: 'Cancel', f: c => c() }], { wide: true });
      $('#dlgHost').querySelectorAll('[data-pi]').forEach(a => a.onclick = async e => {
        e.preventDefault();
        [...openDialogs].pop()();
        try { toast(await run('CompanionTaskDo', ['add', a.dataset.pi, it.id, 'none'])); } catch (er) { fail(er); }
      });
    }
    const doIt = async (action, id, arg, reload) => { try { toast(await run('CompanionInvDo', [action, id, arg || 'none'])); if (reload !== false) setTimeout(load, 1200); } catch (er) { fail(er); } };
    const give = (anchor, id) => showMenu(anchor, [{ hd: 'Give to' }].concat((b.masters || []).map(n => ({ t: n, f: () => doIt('give', id, n, false) })),
      [{ t: 'Someone else…', f: async () => { const who = await askText('Give to (avatar name or key)', ''); if (who) doIt('give', id, who, false); } }]));
    function itemMenu(anchor, it) {
      const m = [{ hd: it.name }];
      const wearable = ['Object', 'Attachment', 'Wearable'].includes(it.kind) || (it.kind === 'link');
      if (st.view === 'trash') m.push({ t: '↩ Bring back', f: () => doIt('restore', it.id) });
      else {
        if (wearable) {
          if (it.kind !== 'Wearable') m.push({ t: '➕ Add (keep what is worn)', f: () => doIt('add', it.id) });
          m.push({ t: it.kind === 'Wearable' ? '👕 Wear' : '🔁 Wear (replace on that point)', f: () => doIt('wear', it.id) });
          if (it.worn) m.push({ t: '➖ Take off', f: () => doIt('remove', it.id) });
        }
        if (it.kind === 'Object') {
          m.push({ t: '📦 Rez in front of the bot', f: () => doIt('rez', it.id, 'front', false) });
          m.push({ t: '📦 Rez on the ground (in front of the bot)', f: () => doIt('rez', it.id, 'ground', false) });
          m.push({ t: '📦 Rez in front of you', f: () => doIt('rez', it.id, 'me', false) });
          m.push({ t: '📦 Rez at a place in the region…', f: async () => { const v = await askText('Where in the region? x, y (on the ground) or x, y, z', ''); if (v) doIt('rez', it.id, v, false); } });
        }
        if (it.kind === 'Notecard' || (it.kind === 'LSL' && it.copy && it.mod && it.trans)) m.push({ t: it.mod ? (it.kind === 'LSL' ? '✎ Open the script' : '✎ Open (read / edit)') : '📝 Read', f: async () => {
          try {
            const t = await run('CompanionInvDo', ['read', it.id, 'none']);
            textEditor(it.name, t, { script: it.kind === 'LSL', save: it.mod ? txt => run('CompanionInvSave', [it.id, txt === '' ? 'none' : txt]) : null });
          } catch (er) { fail(er); } } });
        if (st.view !== 'trash') m.push({ t: '📥 Put into an object nearby…', f: () => putInto(it) });
        if (it.kind === 'Sound') {
          m.push({ t: '🎧 Listen here (on this PC)', f: async () => { try { info('Getting the sound…'); const d = await run('CompanionInvDo', ['sound', it.id, 'none']); info(''); dialog('🔊 ' + it.name, `<audio controls autoplay style="width:100%" src="data:audio/ogg;base64,${d}"></audio>`, [{ t: 'Close', f: c => c() }]); } catch (er) { info(''); fail(er); } } });
          m.push({ t: '🔊 Play in-world (at the bot)', f: () => doIt('play', it.id, '', false) });
        }
        if (it.kind === 'Animation') {
          m.push({ t: '▶ Play on the bot', f: () => doIt('play', it.id, '', false) });
          m.push({ t: '■ Stop it', f: () => doIt('stop', it.id, '', false) });
        }
        if (it.kind === 'Gesture') m.push({ t: '▶ Play the gesture', f: () => doIt('play', it.id, '', false) });
        if (it.kind === 'Texture' || it.kind === 'Snapshot') m.push({ t: '🖼 Show the picture', f: async () => { try { info('Getting the picture…'); const d = await run('CompanionInvDo', ['image', it.id, 'none']); info(''); dialog('🖼 ' + it.name, `<div style="text-align:center"><img alt="" style="max-width:100%;max-height:68vh;background:repeating-conic-gradient(#888 0 25%,#666 0 50%) 0 0/16px 16px" src="data:image/png;base64,${d}"></div>`, [{ t: 'Close', f: c => c() }], { wide: true }); } catch (er) { info(''); fail(er); } } });
        if (it.kind === 'Landmark') m.push({ t: '📍 Teleport the bot there', f: () => doIt('teleport', it.id, '', false) });
        if (it.trans) m.push({ t: '🎁 Give…', f: () => give(anchor, it.id) });
        if (it.mod !== false) m.push({ t: '✎ Rename…', f: async () => { const n = await askText('New name', it.name); if (n && n !== it.name) doIt('rename', it.id, n); } });
        m.push({ t: '✂ Move… (then open the target folder)', f: () => { st.cut = { id: it.id, name: it.name }; showCut(); if (st.view !== 'folder') { st.view = 'folder'; renderInventory(b); } } });
        if (it.folder) m.push({ t: '📁 Open its folder', f: () => { st.view = 'folder'; st.folder = it.folder; renderInventory(b); } });
        m.push({ t: '🗑 Delete (to the Trash)', f: () => doIt('trash', it.id) });
      }
      m.push({ t: '📋 Copy its key', f: () => { navigator.clipboard.writeText(it.id); toast('Key copied'); } });
      showMenu(anchor, m);
    }
    function folderMenu(anchor, f) {
      const m = [{ hd: f.name }];
      if (st.view === 'trash') m.push({ t: '↩ Bring back (to the top level)', f: () => doIt('restore', f.id) });
      else if (f.id === st.trash) m.push({ t: '🗑 Open the Trash', f: () => { st.view = 'trash'; renderInventory(b); } });
      else {
        m.push({ t: '📂 Open', f: () => { st.view = 'folder'; st.folder = f.id; renderInventory(b); } });
        m.push({ t: '➕ Add everything in it', f: () => doIt('add', f.id) });
        m.push({ t: '🔁 Wear it (replaces the outfit)', f: () => doIt('wear', f.id) });
        m.push({ t: '➖ Take off everything in it', f: () => doIt('remove', f.id) });
        m.push({ t: '🎁 Give…', f: () => give(anchor, f.id) });
        if (!f.type || f.type === 'None') {
          m.push({ t: '✎ Rename…', f: async () => { const n = await askText('New name', f.name); if (n && n !== f.name) doIt('rename', f.id, n); } });
          m.push({ t: '✂ Move… (then open the target folder)', f: () => { st.cut = { id: f.id, name: f.name }; showCut(); } });
          m.push({ t: '🗑 Delete (to the Trash)', f: () => doIt('trash', f.id) });
        }
      }
      m.push({ t: '📋 Copy its key', f: () => { navigator.clipboard.writeText(f.id); toast('Key copied'); } });
      showMenu(anchor, m);
    }
    $('#invBody').onclick = e => {
      const go = e.target.closest('[data-go]');
      if (go) { e.preventDefault(); st.view = 'folder'; st.folder = go.dataset.go; renderInventory(b); return; }
      const mb = e.target.closest('[data-m]'); if (mb) { itemMenu(mb, items[mb.dataset.m]); return; }
      const fb = e.target.closest('[data-fm]'); if (fb) { folderMenu(fb, folders[fb.dataset.fm]); return; }
      const fr = e.target.closest('[data-f]'); if (fr && st.view !== 'trash') { st.view = fr.dataset.f === st.trash ? 'trash' : 'folder'; if (st.view === 'folder') st.folder = fr.dataset.f; renderInventory(b); }
    };
    $('#invPath').onclick = e => { const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); st.view = 'folder'; st.folder = go.dataset.go; renderInventory(b); } };
    $('#invVF').onclick = () => { st.view = 'folder'; renderInventory(b); };
    $('#invVW').onclick = () => { st.view = 'worn'; renderInventory(b); };
    $('#invVT').onclick = () => { st.view = 'trash'; renderInventory(b); };
    $('#invVO').onclick = () => { st.view = 'outfits'; renderInventory(b); };
    $('#invRef').onclick = load;
    $('#invQ').onkeydown = e => { if (e.key === 'Enter') { const q = e.target.value.trim(); if (q.length < 2) { toast('Type at least two letters'); return; } st.q = q; st.view = 'search'; renderInventory(b); } };
    $('#invNew').onclick = () => {
      if (st.view !== 'folder' || !cur) { toast('Open the folder where the new one should go'); return; }
      const mk = async (kind, def) => {
        const n = await askText('Name of the new ' + kind, def); if (!n) return;
        try { const r = JSON.parse(await run('CompanionInvNew', [kind, cur.id, n])); toast('Made ' + r.name + (r.note ? ' – ' + r.note : '')); setTimeout(load, 1200);
          if (kind === 'script' || kind === 'notecard') { const t = await run('CompanionInvDo', ['read', r.id, 'none']).catch(() => kind === 'script' ? '' : ''); textEditor(r.name, t, { script: kind === 'script', save: txt => run('CompanionInvSave', [r.id, txt === '' ? 'none' : txt]) }); }
        } catch (er) { fail(er); }
      };
      showMenu($('#invNew'), [{ hd: 'New in ' + (cur.name || 'this folder') },
        { t: '📁 Folder', f: async () => { const n = await askText('Name of the new folder', 'New folder'); if (n) doIt('newfolder', cur.id, n); } },
        { t: '📝 Notecard', f: () => mk('notecard', 'New Note') },
        { t: '📜 Script', f: () => mk('script', 'New Script') }]);
    };
    showCut();
    load();
  }

  // ---------- Groups ----------
  // the bot's groups, like a viewer's Groups window: active group and title, notices, invite, members and roles
  async function grpRun(b, cmd, args) {
    const r = await rpc('bot.run', b.id, cmd, args);
    if (!r || r.ok === false) throw new Error((r && r.reply) || cmd + ' failed');
    return r.reply;
  }
  async function renderGroups(b) {
    const c = $('#content');
    if (b.state !== 'online') { c.innerHTML = '<p class="muted">Start the bot to see and manage its groups.</p>'; return; }
    c.innerHTML = `<div class="row" style="align-items:center;gap:8px"><span class="muted" id="grpInfo">Asking Second Life for the bot's groups…</span><span class="grow"></span>
        <button class="btn sm" id="grpRefresh">⟳ Refresh</button></div>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Group</th><th>Notices</th><th>In profile</th><th></th></tr></thead><tbody id="grpBody"></tbody></table>
      <div class="actions" style="margin-top:10px"><input class="in" id="grpJoinKey" placeholder="Group key (UUID) of an open group" style="max-width:340px"><button class="btn" id="grpJoin">Join group</button>
        <button class="btn" id="grpNone" title="Show no group tag over the bot">No active group</button></div>
      <div id="grpInv"></div>
      <div id="grpDetail" style="margin-top:16px"></div>`;
    let data = { groups: [] };
    const loadInv = async () => {
      let inv = [];
      try { inv = JSON.parse(await grpRun(b, 'CompanionGroupInvites', [])); } catch { return; }
      if (section !== 'groups') return;
      $('#grpInv').innerHTML = inv.length ? `<h2 style="margin-top:14px">Invitations</h2><table class="tbl"><tbody>${inv.map(i => `<tr data-inv="${esc(i.group)}"><td>${esc(i.message)}<div class="muted small">${esc(i.from)} · ${new Date(i.t * 1000).toLocaleString()}</div></td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm pri" data-ia="accept">Accept</button> <button class="btn sm" data-ia="decline">Decline</button></td></tr>`).join('')}</tbody></table>
        <p class="muted small">Joining may cost a fee – the invitation says so. The bot can be in a limited number of groups.</p>` : '';
    };
    $('#grpInv').onclick = async e => {
      const btn = e.target.closest('[data-ia]'); if (!btn) return;
      const g = btn.closest('[data-inv]').dataset.inv;
      try { toast('Invitation ' + await grpRun(b, 'CompanionGroupInviteAnswer', [g, btn.dataset.ia])); } catch (er) { fail(er); }
      loadInv(); setTimeout(load, 2500);
    };
    const load = async () => {
      loadInv();
      try { data = JSON.parse(await grpRun(b, 'CompanionGroupList', [])); }
      catch (e) { $('#grpInfo').textContent = 'Could not read the groups: ' + e.message; return; }
      if (section !== 'groups') return;
      const g = data.groups || [];
      $('#grpInfo').textContent = g.length ? `${b.botName || b.label} is in ${g.length} group${g.length === 1 ? '' : 's'}` + (g.some(x => x.active) ? '' : ' · no active group') : `${b.botName || b.label} is in no group.`;
      $('#grpBody').innerHTML = g.map(x => `<tr data-g="${esc(x.id)}">
        <td>${x.active ? '<span class="pill online" style="padding:0 8px" title="The active group: its tag shows over the bot">★ active</span> ' : ''}<b>${esc(x.name)}</b></td>
        <td><label class="switch small"><input type="checkbox" data-gnot ${x.notices ? 'checked' : ''}><span class="tr"></span></label></td>
        <td><label class="switch small"><input type="checkbox" data-gprof ${x.profile ? 'checked' : ''}><span class="tr"></span></label></td>
        <td style="text-align:right;white-space:nowrap">${x.active ? '' : '<button class="btn sm" data-gact>Activate</button> '}<button class="btn sm ${ui.groupSel === x.id ? 'pri' : ''}" data-gopen>Members and more ▸</button> <button class="btn sm" data-gleave>Leave…</button></td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">No groups.</td></tr>';
      const sel = g.find(x => x.id === ui.groupSel);
      if (sel) detail(sel); else $('#grpDetail').innerHTML = '';
    };
    const doAct = async (gid, action, avatar, role, msg, reload) => {
      try { const r = await grpRun(b, 'CompanionGroupDo', [gid, action, avatar || 'none', role || 'none']); toast(msg || r); if (reload) setTimeout(load, 1500); return true; }
      catch (e) { fail(e); return false; }
    };
    $('#grpRefresh').onclick = load;
    $('#grpNone').onclick = () => doAct('none', 'none', '', '', 'No active group', true);
    $('#grpJoin').onclick = () => {
      const k = $('#grpJoinKey').value.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) { toast('Paste the group\'s key (UUID) – in a viewer: the group\'s profile → Copy key', 'bad'); return; }
      doAct(k, 'join', '', '', 'Joined the group', true);
    };
    $('#grpBody').onclick = e => {
      const tr = e.target.closest('[data-g]'); if (!tr) return;
      const g = (data.groups || []).find(x => x.id === tr.dataset.g); if (!g) return;
      if (e.target.closest('[data-gact]')) doAct(g.id, 'activate', '', '', g.name + ' is the active group now', true);
      if (e.target.closest('[data-gopen]')) { saveUi('groupSel', ui.groupSel === g.id ? '' : g.id); load(); }
      if (e.target.closest('[data-gleave]')) confirmDlg('Leave ' + g.name + '?', b.label + ' leaves the group. Joining again may need a new invitation (or a fee).', 'Leave', () => { if (ui.groupSel === g.id) saveUi('groupSel', ''); doAct(g.id, 'leave', '', '', 'Left ' + g.name, true); });
    };
    $('#grpBody').onchange = e => {
      const tr = e.target.closest('[data-g]'); if (!tr) return;
      if (e.target.matches('[data-gnot]')) doAct(tr.dataset.g, 'notices', e.target.checked ? 'on' : 'off', '', e.target.checked ? 'Notices from this group: on' : 'Notices from this group: off');
      if (e.target.matches('[data-gprof]')) doAct(tr.dataset.g, 'profile', e.target.checked ? 'on' : 'off', '', e.target.checked ? 'Shown in the bot\'s profile' : 'Hidden from the bot\'s profile');
    };

    const detail = async g => {
      const d = $('#grpDetail');
      d.innerHTML = `<h2>${esc(g.name)}</h2><p class="muted">Loading roles, titles and members…</p>`;
      let info;
      try { info = JSON.parse(await grpRun(b, 'CompanionGroupDetail', [g.id, '500'])); }
      catch (e) { d.innerHTML = `<h2>${esc(g.name)}</h2><p class="warn">${esc(e.message)}</p>`; return; }
      if (section !== 'groups' || ui.groupSel !== g.id) return;
      const roles = info.roles || [], titles = info.titles || [], members = info.members || [];
      const roleName = id => (roles.find(r => r.id === id) || {}).name || '?';
      const roleOpts = (list, sel) => list.map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}${r.title ? ' – “' + esc(r.title) + '”' : ''}</option>`).join('');
      const curTitle = (titles.find(t => t.selected) || {}).role;
      d.innerHTML = `<h2>${esc(g.name)} <span class="muted small mono sel">${esc(g.id)}</span></h2>
        <div class="row ${titles.length ? '' : 'hidden'}"><label>Bot's title</label><select class="in" id="grpTitle">${titles.map(t => `<option value="${esc(t.role)}" ${t.role === curTitle ? 'selected' : ''}>${esc(t.title || '(no title)')}</option>`).join('')}</select>
          <span class="muted small">${g.active ? 'shown over the bot' : 'shows while this group is active'}</span></div>
        ${g.canInvite ? `<div class="row"><label>Invite</label><div class="combo" style="max-width:300px"><input class="in" id="grpInvWho" placeholder="Avatar name or key"><button class="dd" id="grpInvDd" title="Choose">▾</button></div>
          <select class="in" id="grpInvRole">${roleOpts(roles, '00000000-0000-0000-0000-000000000000')}</select><button class="btn" id="grpInv">Send invitation</button></div>` : '<p class="muted small">The bot may not invite people to this group.</p>'}
        <div class="row"><label>Group chat</label><input class="in w" id="grpChat" placeholder="Message to the group chat as ${esc(b.botName || b.label)} – Enter sends"><button class="btn" id="grpChatSend">Send</button></div>
        ${g.canNotice ? `<details style="margin:6px 0"><summary>Send a group notice</summary>
          <div class="row"><label>Subject</label><input class="in w" id="grpNotSub" maxlength="63"></div>
          <div class="row"><label>Text</label><textarea class="in" id="grpNotText" maxlength="500" rows="3"></textarea></div>
          <div class="actions"><button class="btn" id="grpNotSend">Send notice</button></div></details>` : ''}
        <h3 style="margin-top:12px">Members <span class="muted small">${members.length}${info.memberCount > members.length ? ' of ' + info.memberCount + ' (online first)' : ''}</span></h3>
        ${members.length ? '' : '<p class="muted small">Second Life sent no member list for this group – very large groups and groups that hide their members do that. Invite, title and notices still work.</p>'}
        <div class="row" style="align-items:center"><input class="in" id="grpMemQ" placeholder="Filter members (name, title, role)" style="max-width:300px" value="${esc(ui.grpMemQ || '')}">
          <label class="switch small"><input type="checkbox" id="grpMemOn" ${ui.grpMemOn === '1' ? 'checked' : ''}><span class="tr"></span>Online only</label></div>
        <table class="tbl radar"><thead><tr><th>Name</th><th>Title</th><th>Roles</th><th>Last online</th><th></th></tr></thead><tbody id="grpMem"></tbody></table>`;
      const drawMem = () => {
        const q = ($('#grpMemQ').value || '').toLowerCase(), on = $('#grpMemOn').checked;
        const list = members.filter(m => (!on || m.online === 'Online') && (!q || [m.name, m.title, ...m.roles.map(roleName)].join(' ').toLowerCase().includes(q)));
        $('#grpMem').innerHTML = list.map(m => `<tr data-m="${esc(m.id)}"><td><b>${esc(m.name || m.id)}</b>${m.owner ? ' <span class="muted small">owner</span>' : ''}</td><td>${esc(m.title || '')}</td>
          <td class="small">${esc(m.roles.map(roleName).filter(n => n !== 'Everyone').join(', '))}</td><td class="small ${m.online === 'Online' ? 'ok' : 'muted'}">${esc(m.online || '')}</td>
          <td><button class="btn sm" data-mm title="Actions">⋯</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nobody matches.</td></tr>';
      };
      drawMem();
      $('#grpMemQ').oninput = () => { saveUi('grpMemQ', $('#grpMemQ').value); drawMem(); };
      $('#grpMemOn').onchange = e => { saveUi('grpMemOn', e.target.checked ? '1' : ''); drawMem(); };
      clearable('#grpMemQ');
      $('#grpTitle').onchange = e => doAct(g.id, 'title', '', e.target.value, 'Title changed');
      const sendChat = async () => {
        const t = $('#grpChat').value.trim(); if (!t) return;
        try { await grpRun(b, 'Groupchat', [g.id, t]); $('#grpChat').value = ''; toast('Sent to the group chat'); } catch (er) { fail(er); }
      };
      $('#grpChatSend').onclick = sendChat;
      $('#grpChat').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
      if (g.canInvite) {
        $('#grpInvDd').onclick = e => avatarMenu(e.currentTarget, n => { $('#grpInvWho').value = n; });
        $('#grpInv').onclick = () => {
          const who = $('#grpInvWho').value.trim(); if (!who) { toast('Type or choose an avatar first', 'bad'); return; }
          const role = $('#grpInvRole').value;
          doAct(g.id, 'invite', who, role === '00000000-0000-0000-0000-000000000000' ? 'none' : role, 'Invitation sent to ' + who);
        };
      }
      if (g.canNotice) $('#grpNotSend').onclick = async () => {
        const sub = $('#grpNotSub').value.trim(), txt = $('#grpNotText').value.trim();
        if (!sub || !txt) { toast('Write a subject and a text', 'bad'); return; }
        try { await grpRun(b, 'CompanionGroupNotice', [g.id, sub, txt]); toast('Notice sent to ' + g.name); $('#grpNotSub').value = ''; $('#grpNotText').value = ''; } catch (er) { fail(er); }
      };
      $('#grpMem').onclick = e => {
        const btn = e.target.closest('[data-mm]') || e.target.closest('[data-m]'); if (!btn) return;
        const m = members.find(x => x.id === btn.closest('[data-m]').dataset.m); if (!m) return;
        const name = m.name || m.id;
        const others = roles.filter(r => r.id !== '00000000-0000-0000-0000-000000000000');
        const items = [{ hd: name },
          { t: '💬 Send an IM', f: () => { pendingIm = { id: m.id, name }; section = 'chat'; navPush(); renderMain(); } },
          { t: '👤 Open their profile', f: () => rpc('openUrl', 'https://world.secondlife.com/resident/' + m.id).catch(fail) },
          { t: '📋 Copy key', f: () => rpc('copy', m.id).then(() => toast('Copied')) }];
        if (g.canRoles) {
          const give = others.filter(r => !m.roles.includes(r.id));
          if (give.length) { items.push({ hd: 'Give a role' }); give.forEach(r => items.push({ t: '＋ ' + r.name, f: async () => { if (await doAct(g.id, 'addrole', m.id, r.id, name + ' got the role ' + r.name)) { m.roles.push(r.id); drawMem(); } } })); }
        }
        if (g.canRemoveRoles) {
          const take = others.filter(r => m.roles.includes(r.id));
          if (take.length) { items.push({ hd: 'Take a role away' }); take.forEach(r => items.push({ t: '− ' + r.name, f: async () => { if (await doAct(g.id, 'removerole', m.id, r.id, name + ' no longer has the role ' + r.name)) { m.roles = m.roles.filter(x => x !== r.id); drawMem(); } } })); }
        }
        if (g.canEject && !m.owner) items.push({ t: '⛔ Eject from the group…', f: () => confirmDlg('Eject ' + name + '?', name + ' is removed from ' + g.name + '.', 'Eject', async () => { if (await doAct(g.id, 'eject', m.id, '', name + ' was ejected')) { members.splice(members.indexOf(m), 1); drawMem(); } }) });
        showMenu(btn, items);
      };
    };
    load();
  }

  function renderCommands(b) {
    const c = $('#content');
    c.className = 'content full';
    c.innerHTML = `
      <div class="logbar">
        <input class="in w" id="cmdSearch" placeholder="Search commands (name or description)" value="${esc(ui.cmdSearch || '')}">
        <span class="muted small" id="cmdCount"></span>
        <label class="switch" title="Discord, RabbitMQ, money and service commands need services this app keeps switched off"><input type="checkbox" id="cmdAll" ${ui.cmdAll === 'true' ? 'checked' : ''}><span class="tr"></span>Show all modules</label>
      </div>
      <div class="chips" id="cmdTypes" style="margin-bottom:8px"></div>
      <div class="cmdwrap"><div class="cmdlist"><div class="items" id="cmdItems"></div></div><div class="cmdform" id="cmdForm"></div></div>`;
    const types = [['', 'All'], ['Get', 'Read (Get)'], ['Set', 'Change (Set)'], ['Do', 'Act (Do)']];
    const chips = $('#cmdTypes');
    const drawChips = () => { chips.innerHTML = types.map(([k, t]) => `<span class="chip ${(ui.cmdType || '') === k ? 'on' : ''}" data-ty="${k}">${t}</span>`).join(''); };
    drawChips();
    chips.onclick = e => { const x = e.target.closest('[data-ty]'); if (!x) return; saveUi('cmdType', x.dataset.ty); drawChips(); drawList(); };
    const drawList = () => {
      const q = $('#cmdSearch').value.trim().toLowerCase();
      const all = $('#cmdAll').checked;
      const list = commands.filter(x => (all || !HIDDEN_MODULES.includes(x.module)) && (!ui.cmdType || x.type === ui.cmdType)
        && (!q || x.name.toLowerCase().includes(q) || x.about.toLowerCase().includes(q) || x.module.toLowerCase().includes(q)));
      $('#cmdCount').textContent = `${list.length} found`;
      let mod = '', html = '';
      list.forEach(x => {
        if (x.module !== mod) { mod = x.module; html += `<div class="modhd">${esc(mod)}</div>`; }
        html += `<div class="cmdi ${x.name === selCmd ? 'sel' : ''}" data-c="${x.name}"><span class="ty">${x.type}</span><div class="n">${esc(x.name)}</div><div class="a">${esc(clean(x.about))}</div></div>`;
      });
      $('#cmdItems').innerHTML = html || '<div class="cmdi muted">Nothing found</div>';
    };
    $('#cmdSearch').oninput = () => { saveUi('cmdSearch', $('#cmdSearch').value); drawList(); };
    clearable('#cmdSearch');
    $('#cmdAll').onchange = () => { saveUi('cmdAll', $('#cmdAll').checked); drawList(); };
    $('#cmdItems').onclick = e => { const x = e.target.closest('[data-c]'); if (!x) return; selCmd = x.dataset.c; drawList(); drawForm(); };
    drawList();
    drawForm();
  }
  const clean = s => String(s || '').replace(/<br\s*\/?>/g, ' ').replace(/\\n/g, ' ');

  function argKind(hint) {
    const ty = String((hint && hint[2]) || '').toUpperCase();
    if (ty === 'BOOL' || ty === 'TRUE|FALSE') return 'bool';
    if (ty === 'AVATAR') return 'avatar';
    if (ty === 'SMART') return 'smart';
    if (['NUMBER', 'INT', 'INTEGER', 'FLOAT', 'DOUBLE'].includes(ty)) return 'number';
    if (ty === 'UUID') return 'uuid';
    return 'text';
  }
  function drawForm() {
    const f = $('#cmdForm');
    const x = commands.find(c => c.name === selCmd);
    const b = bot();
    if (!x) { f.innerHTML = `<div class="box muted">Choose a command on the left. Each one shows a form for its values; the bot must be online to run it.</div>`; return; }
    const hints = x.argHints || [];
    const fields = x.params.map((p, i) => {
      const h = hints.find(hh => (hh[0] || '').toLowerCase() === p.toLowerCase()) || hints[i] || [p, ''];
      const kind = argKind(h);
      const accepted = (h.slice(4) || []).filter(Boolean);
      let input;
      if (accepted.length > 1) input = `<select class="in w" data-arg="${i}">${accepted.map(a => `<option>${esc(a)}</option>`).join('')}</select>`;
      else if (kind === 'bool') input = `<span class="seg" data-arg="${i}" data-seg="true"><button class="on" data-v="true">true</button><button data-v="false">false</button></span>`;
      else if (kind === 'avatar') input = `<div class="combo"><input class="in" data-arg="${i}" placeholder="Avatar name or key"><button class="dd" data-av="${i}">▾</button></div>`;
      else if (kind === 'smart') input = `<input class="in w" data-arg="${i}" value="none" title="Where an answer that comes later is sent: none, a chat channel, an avatar, or an http URL">`;
      else input = `<input class="in w" data-arg="${i}" ${kind === 'number' ? 'inputmode="decimal"' : ''} placeholder="${esc(h[3] || (kind === 'uuid' ? '00000000-0000-0000-0000-000000000000' : ''))}">`;
      return `<div class="row"><label title="${esc(clean(h[1] || ''))}">${esc(p)}</label>${input}</div>${h[1] ? `<div class="note" style="margin-left:128px">${esc(clean(h[1]))}</div>` : ''}`;
    }).join('');
    f.innerHTML = `<div class="box">
      <h3>${esc(x.module)} · ${esc(x.type)}</h3>
      <div class="big" style="font-size:1.25em">${esc(x.name)}</div>
      <p class="muted">${esc(clean(x.about))}</p>
      ${fields || '<p class="muted">No values needed.</p>'}
      <div class="actions"><button class="btn pri" id="cmdRun" data-needs-online ${b.state === 'online' ? '' : 'disabled'}>Run on ${esc(b.label)}</button>
      ${b.state === 'online' ? '' : '<span class="muted small">Start the bot to run commands.</span>'}</div>
      </div><div id="cmdResult" style="margin-top:12px"></div>`;
    f.querySelectorAll('[data-seg]').forEach(s => s.onclick = e => { const v = e.target.closest('[data-v]'); if (!v) return; s.querySelectorAll('button').forEach(bb => bb.classList.toggle('on', bb === v)); });
    f.querySelectorAll('[data-av]').forEach(d => d.onclick = () => avatarMenu(d, v => { f.querySelector(`input[data-arg="${d.dataset.av}"]`).value = v; }));
    $('#cmdRun').onclick = async () => {
      const args = x.params.map((p, i) => {
        const el = f.querySelector(`[data-arg="${i}"]`);
        if (!el) return '';
        if (el.dataset.seg) return (el.querySelector('.on') || {}).dataset ? el.querySelector('.on').dataset.v : 'true';
        return el.value;
      });
      const out = $('#cmdResult');
      out.innerHTML = '<div class="muted">Running…</div>';
      try {
        const r = await rpc('bot.run', b.id, x.name, args);
        out.innerHTML = `<div class="row"><b>${r.ok ? '✔ Done' : '✖ Failed'}</b><span class="grow"></span><button class="btn sm" id="resCopy">Copy</button></div><div class="result ${r.ok ? '' : 'bad'}">${esc(pretty(r.reply))}</div>`;
        $('#resCopy').onclick = () => rpc('copy', pretty(r.reply)).then(() => toast('Copied'));
      } catch (e) { out.innerHTML = `<div class="result bad">${esc(e.message)}</div>`; }
    };
  }

  // ---------- Log ----------
  let logTimer = 0, logSeq = 0;
  function stopLogTimer() { clearInterval(logTimer); logTimer = 0; }
  function renderLog(b) {
    const c = $('#content');
    c.className = 'content full';
    c.innerHTML = `<div class="logbar">
        <input class="in w" id="logFilter" placeholder="Filter lines" value="${esc(ui.logFilter || '')}">
        <label class="switch"><input type="checkbox" id="logErr" ${ui.logErr === 'true' ? 'checked' : ''}><span class="tr"></span>Problems only</label>
        <label class="switch"><input type="checkbox" id="logFollow" ${ui.logFollow !== 'false' ? 'checked' : ''}><span class="tr"></span>Follow new lines</label>
        <button class="btn sm" id="logCopy">Copy shown</button>
        <button class="btn sm" id="logOpen">📂 Log folder</button>
      </div><div class="log" id="logBox"></div>`;
    const box = $('#logBox');
    let lines = [];
    logSeq = 0;
    const isBad = l => /fail|error|exception|crit|warn|denied|unable/i.test(l.x) || l.k === 'err';
    const draw = () => {
      const q = $('#logFilter').value.toLowerCase(), errOnly = $('#logErr').checked;
      const shown = lines.filter(l => (!q || l.x.toLowerCase().includes(q)) && (!errOnly || isBad(l)));
      box.innerHTML = shown.map(l => `<div class="ln ${l.k} ${isBad(l) ? 'bad' : ''}"><span class="tm">${l.t}</span>${esc(l.x)}</div>`).join('') || '<div class="muted">No lines yet. Start the bot to see what it does.</div>';
      if ($('#logFollow').checked) box.scrollTop = box.scrollHeight;
      return shown;
    };
    const pull = async () => {
      try {
        const add = await rpc('bot.log', b.id, logSeq);
        if (add.length) { lines = lines.concat(add).slice(-3000); logSeq = add[add.length - 1].seq; draw(); }
        else if (!lines.length) draw();
      } catch { }
    };
    $('#logFilter').oninput = () => { saveUi('logFilter', $('#logFilter').value); draw(); };
    clearable('#logFilter');
    $('#logErr').onchange = () => { saveUi('logErr', $('#logErr').checked); draw(); };
    $('#logFollow').onchange = () => { saveUi('logFollow', $('#logFollow').checked); draw(); };
    $('#logCopy').onclick = () => rpc('copy', draw().map(l => l.t + ' ' + l.x).join('\n')).then(() => toast('Copied'));
    $('#logOpen').onclick = () => rpc('bot.openLogs', b.id);
    pull();
    logTimer = setInterval(pull, 1200);
  }

  // ---------- Bot settings (edit) & Add dialog ----------
  function botFormHtml(b) {
    const g = b ? b.grid : 'sl';
    return `
      <div class="row"><label>Name in this app</label><input class="in w" id="fLabel" value="${esc(b ? b.label : '')}" placeholder="e.g. Passenger"></div>
      <div class="row"><label>Grid</label><span class="seg" id="fGrid">
        <button data-v="sl" class="${g === 'sl' ? 'on' : ''}">Second Life</button><button data-v="aditi" class="${g === 'aditi' ? 'on' : ''}">SL Beta (Aditi)</button><button data-v="custom" class="${g === 'custom' ? 'on' : ''}">Other grid (OpenSim)</button></span></div>
      <div class="row ${g === 'custom' ? '' : 'hidden'}" id="fUriRow"><label>Login URI</label>
        <div class="combo"><input class="in" id="fUri" value="${esc(b ? b.loginUri : '')}" placeholder="http://127.0.0.1:9000/"><button class="dd" id="fUriDd">▾</button></div></div>
      <div class="row"><label>Avatar username</label><input class="in w" id="fUser" value="${esc(b ? b.username : '')}" placeholder="username (or First Last for old names)"></div>
      <div class="row"><label>Password</label><input class="in w" id="fPass" type="password" autocomplete="off" placeholder="${b && b.hasPassword ? '•••••••• saved – type to replace' : 'the avatar\'s password'}"></div>
      <div class="note" style="margin-left:128px">Stored encrypted for your Windows account. It is only handed to the bot program when it starts.</div>
      <div class="row"><label>Who may command it</label><div class="chips" id="fMasters"></div></div>
      <div class="row"><label></label><div class="combo" style="max-width:360px"><input class="in" id="fMasterIn" placeholder="Your main avatar's username"><button class="dd" id="fMasterAdd">＋</button></div></div>
      <div class="note" style="margin-left:128px">These avatars can command the bot by IM, send it teleport offers and items. The HUD works through its pairing secret.</div>
      <div class="row"><label>Options</label><div>
        <label class="switch"><input type="checkbox" id="fAuto" ${b && b.autoStart ? 'checked' : ''}><span class="tr"></span>Start this bot when the app starts</label><br>
        <label class="switch" style="margin-top:6px"><input type="checkbox" id="fTp" ${!b || b.acceptTeleports ? 'checked' : ''}><span class="tr"></span>Accept teleport offers from these avatars</label><br>
        <label class="switch" style="margin-top:6px"><input type="checkbox" id="fInv" ${!b || b.acceptInventory ? 'checked' : ''}><span class="tr"></span>Accept items (e.g. outfits) from these avatars</label><br>
        <label class="switch" style="margin-top:6px" title="Off: when someone pulls the bot into a conference (an ad-hoc group IM), it leaves at once; nothing is shown or announced"><input type="checkbox" id="fConf" ${b && b.joinConferences === true ? 'checked' : ''}><span class="tr"></span>Take part in conference chats (off = leave them at once)</label></div></div>
      <div class="row"><label>Logs in at</label><span class="seg" id="fStart">${[['last', 'Last place'], ['home', 'Home'], ['place', 'A place']].map(([k, t]) => `<button type="button" data-v="${k}" class="${startKind(b) === k ? 'on' : ''}">${t}</button>`).join('')}</span>
        <div class="combo ${startKind(b) === 'place' ? '' : 'hidden'}" id="fStartBox" style="max-width:380px;margin-left:8px"><input class="in" id="fStartUrl" placeholder="SLURL of the place" value="${esc(startKind(b) === 'place' ? b.startLocation : '')}"><button class="dd" id="fStartDd" title="Saved and recent places">▾</button></div></div>
      <div class="row"><label>Hover height</label><input class="in" id="fHover" type="number" step="0.05" min="-2" max="2" style="width:100px" value="${b ? b.hoverHeight : 0}">
        <span class="chips">${[0, 0.1, 0.2, 0.3].map(v => `<span class="chip" data-hover="${v}">${v}</span>`).join('')}</span><span class="muted small" style="margin-left:8px">m · a running bot changes at once</span></div>
      <div class="err" id="fErr"></div>`;
  }

  function startKind(b) { const v = (b && b.startLocation) || 'last'; return v === 'last' || v === 'home' ? v : 'place'; }
  function wireBotForm(root, b, onChange) {
    let masters = b ? (b.masters || []).slice() : [];
    const draw = () => {
      $('#fMasters', root).innerHTML = masters.map((m, i) => `<span class="chip on">${esc(m)}<span class="x" data-rm="${i}" title="Remove">✕</span></span>`).join('') || '<span class="muted">nobody yet – add your main avatar</span>';
    };
    draw();
    $('#fMasters', root).onclick = e => { const x = e.target.closest('[data-rm]'); if (!x) return; masters.splice(+x.dataset.rm, 1); draw(); onChange(); };
    const add = () => {
      const v = $('#fMasterIn', root).value.trim();
      if (!v) return;
      if (masters.some(m => m.toLowerCase().replace(/\s/g, '') === v.toLowerCase().replace(/\s/g, ''))) { toast('Already in the list', 'bad'); return; }
      masters.push(v); $('#fMasterIn', root).value = ''; draw(); onChange();
    };
    $('#fMasterAdd', root).onclick = add;
    $('#fMasterIn', root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    $('#fGrid', root).onclick = e => {
      const v = e.target.closest('[data-v]'); if (!v) return;
      $('#fGrid', root).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === v));
      $('#fUriRow', root).classList.toggle('hidden', v.dataset.v !== 'custom');
      onChange();
    };
    $('#fUriDd', root).onclick = e => showMenu(e.currentTarget, [
      { hd: 'Common login addresses' },
      { t: 'This PC – OpenSim standalone (http://127.0.0.1:9000/)', f: () => { $('#fUri', root).value = 'http://127.0.0.1:9000/'; onChange(); } },
      { t: 'OSgrid (http://login.osgrid.org/)', f: () => { $('#fUri', root).value = 'http://login.osgrid.org/'; onChange(); } },
    ]);
    root.querySelectorAll('[data-hover]').forEach(x => x.onclick = () => { $('#fHover', root).value = x.dataset.hover; onChange(); });
    $('#fStart', root).onclick = e => {
      const v = e.target.closest('[data-v]'); if (!v) return;
      $('#fStart', root).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === v));
      $('#fStartBox', root).classList.toggle('hidden', v.dataset.v !== 'place');
      if (v.dataset.v === 'place') $('#fStartUrl', root).focus();
      if (v.dataset.v !== 'place' || $('#fStartUrl', root).value.trim()) onChange();
    };
    $('#fStartUrl', root).addEventListener('change', onChange);
    $('#fStartDd', root).onclick = e => placeMenu(e.currentTarget, u => { $('#fStartUrl', root).value = u; onChange(); }, b, $('#fStartUrl', root).value.trim());
    ['#fLabel', '#fUser', '#fUri', '#fHover'].forEach(s => $(s, root).addEventListener('input', onChange));
    ['#fAuto', '#fTp', '#fInv', '#fConf'].forEach(s => $(s, root).addEventListener('change', onChange));
    return () => ({
      id: b ? b.id : '',
      label: $('#fLabel', root).value.trim(),
      grid: ($('#fGrid', root).querySelector('.on') || { dataset: { v: 'sl' } }).dataset.v,
      loginUri: $('#fUri', root).value.trim(),
      username: $('#fUser', root).value.trim(),
      masters,
      autoStart: $('#fAuto', root).checked,
      acceptTeleports: $('#fTp', root).checked,
      acceptInventory: $('#fInv', root).checked,
      joinConferences: $('#fConf', root).checked,
      hoverHeight: $('#fHover', root).value,
      startLocation: (() => { const k = ($('#fStart', root).querySelector('.on') || { dataset: { v: 'last' } }).dataset.v; return k === 'place' ? ($('#fStartUrl', root).value.trim() || 'last') : k; })(),
    });
  }

  function renderBotSettings(b) {
    const c = $('#content');
    c.innerHTML = `<div class="box" style="max-width:820px">
      <div class="banner info hidden" id="restartBan"><span class="grow">Saved. The running bot uses the new settings after a restart.</span><button class="btn sm" id="restartNow">⟳ Restart now</button></div>
      ${botFormHtml(b)}
      <div class="muted small" id="saveState">Changes are saved as you type.</div></div>
      <h2>Danger zone</h2>
      <div class="actions"><button class="btn danger" id="delBot">Remove this bot from the app…</button></div>
      <p class="note">Removing only forgets the bot here (name, password, logs stay in the data folder's backups). The avatar's account is not touched.</p>`;
    let timer = 0;
    const get = wireBotForm(c, b, () => { clearTimeout(timer); timer = setTimeout(save, 500); $('#saveState').textContent = 'Saving…'; });
    const save = async (pw) => {
      try {
        const r = await rpc('bot.save', get(), pw || null);
        $('#fErr').textContent = '';
        $('#saveState').textContent = pw ? 'Password saved.' : 'Saved.';
        if (r && r.restartNeeded) $('#restartBan').classList.remove('hidden');
        $('h1', $('#main')).textContent = get().label || b.label;
      } catch (e) { $('#fErr').textContent = e.message; $('#saveState').textContent = 'Not saved – see the note above.'; }
    };
    const pass = $('#fPass');
    const savePw = () => { if (pass.value) { const v = pass.value; pass.value = ''; pass.placeholder = '•••••••• saved – type to replace'; save(v); } };
    pass.addEventListener('change', savePw);
    pass.addEventListener('keydown', e => { if (e.key === 'Enter') savePw(); });
    $('#restartNow').onclick = () => { $('#restartBan').classList.add('hidden'); act('bot.restart', 'Restarting…'); };
    $('#delBot').onclick = () => confirmDlg('Remove ' + b.label + '?', 'The bot is logged out and removed from this app. Its account in Second Life is not changed.', 'Remove', async () => {
      try { await rpc('bot.delete', b.id); current = ''; toast('Removed'); } catch (e) { fail(e); }
    });
  }

  // ---------- dialogs ----------
  function dialog(title, bodyHtml, buttons, opts) {
    const host = $('#dlgHost');
    const ov = document.createElement('div');
    ov.className = 'ov';
    ov.innerHTML = `<div class="dlg ${opts && opts.wide ? 'wide' : ''}"><div class="dh"><h2>${esc(title)}</h2><button class="x" title="Close">✕</button></div><div class="db">${bodyHtml}</div>${buttons && buttons.length ? '<div class="df"></div>' : ''}</div>`;
    host.appendChild(ov);
    const d = $('.dlg', ov);
    // Settings and Help are places in the Back/Forward history; closing them by hand is a step back to the bot view
    const navKind = title === 'Settings' ? 'settings' : title === 'Help' ? 'help' : '';
    if (navKind) navPush({ kind: navKind });
    const close = () => {
      ov.remove(); document.removeEventListener('keydown', onKey, true); openDialogs.delete(close);
      if (navKind && !navClosing) navPush();
    };
    openDialogs.add(close);
    // Esc closes only the topmost dialog (an editor opened from another dialog leaves that one open)
    const onKey = e => { if (e.key === 'Escape' && !(window.__notes && window.__notes.isOpen()) && [...openDialogs].pop() === close) { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    $('.x', ov).onclick = close;
    (buttons || []).forEach(bt => {
      const el = document.createElement('button');
      el.className = 'btn ' + (bt.cls || '');
      el.textContent = bt.t;
      el.onclick = () => bt.f(close);
      $('.df', ov).appendChild(el);
    });
    // movable by the title bar
    const hd = $('.dh', ov);
    hd.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      const r = d.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      d.style.position = 'fixed'; d.style.left = r.left + 'px'; d.style.top = r.top + 'px'; d.style.margin = '0';
      const mv = ev => { d.style.left = Math.max(0, Math.min(window.innerWidth - 80, r.left + ev.clientX - sx)) + 'px'; d.style.top = Math.max(0, Math.min(window.innerHeight - 40, r.top + ev.clientY - sy)) + 'px'; };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    return { root: d, close };
  }
  function askText(title, value) {
    return new Promise(res => {
      const d = dialog(title, `<input class="in w" id="askIn" value="${esc(value || '')}" style="width:100%">`, [
        { t: 'Cancel', f: c => { c(); res(''); } },
        { t: 'Save', cls: 'pri', f: c => { const v = $('#askIn', d.root).value.trim(); c(); res(v); } }]);
      const i = $('#askIn', d.root); i.focus(); i.select();
      i.addEventListener('keydown', e => { if (e.key === 'Enter') d.root.querySelector('.df .btn.pri').click(); });
    });
  }

  function confirmDlg(title, text, okText, f) {
    dialog(title, `<p>${esc(text)}</p>`, [{ t: 'Cancel', f: c => c() }, { t: okText, cls: 'danger', f: c => { c(); f(); } }]);
  }

  function openBotDialog() {
    const d = dialog('Add a bot', botFormHtml(null), [
      { t: 'Cancel', f: c => c() },
      { t: 'Add bot', cls: 'pri', f: async c => {
        const v = get();
        const pw = $('#fPass', d.root).value;
        if (!v.username) { $('#fErr', d.root).textContent = 'Enter the avatar\'s username.'; return; }
        if (!pw) { $('#fErr', d.root).textContent = 'Enter the avatar\'s password.'; return; }
        if (!v.masters.length && $('#fMasterIn', d.root).value.trim()) v.masters.push($('#fMasterIn', d.root).value.trim());
        if (!v.masters.length) { $('#fErr', d.root).textContent = 'Add your main avatar under "Who may command it" (press ＋).'; return; }
        try {
          const r = await rpc('bot.save', v, pw);
          c();
          current = r.id; section = 'overview';
          await refresh(); navPush();
          toast('Bot added. Press ▶ Start to log it in.');
        } catch (e) { $('#fErr', d.root).textContent = e.message; }
      } }]);
    const get = wireBotForm(d.root, null, () => {});
    setTimeout(() => $('#fLabel', d.root).focus(), 30);
  }

  function openSettings() {
    const s = S.settings;
    const d = dialog('Settings', `
      <h3>Look</h3>
      <div class="swatches" id="sTheme">${THEMES.map(t => `<div class="sw ${t[0] === s.theme ? 'on' : ''}" data-t="${t[0]}"><i style="background:linear-gradient(135deg, ${t[3]} 55%, ${t[11]} 55%)"></i>${t[1]}</div>`).join('')}</div>
      <div class="row" style="margin-top:12px"><label>Text size</label><button class="btn sm" id="fsDown">A−</button><b id="fsVal" style="min-width:52px;text-align:center"></b><button class="btn sm" id="fsUp">A+</button>
        <span class="chips">${[90, 100, 115, 130].map(v => `<span class="chip" data-fs="${v}">${v} %</span>`).join('')}</span></div>
      <h3 style="margin-top:18px">Starting and closing</h3>
      <label class="switch"><input type="checkbox" id="sWin" ${s.startWithWindows ? 'checked' : ''}><span class="tr"></span>Start AvieBoter when I sign in to Windows</label><br>
      <label class="switch" style="margin-top:8px"><input type="checkbox" id="sTray" ${s.startInTray ? 'checked' : ''}><span class="tr"></span>When started with Windows, stay in the tray (no window)</label><br>
      <label class="switch" style="margin-top:8px"><input type="checkbox" id="sBots" ${s.startBotsWithApp ? 'checked' : ''}><span class="tr"></span>Start the bots marked "Start this bot when the app starts"</label>
      <div class="row" style="margin-top:12px"><label>The window's ✕</label><span class="seg" id="sClose"><button data-v="tray" class="${s.closeAction !== 'quit' ? 'on' : ''}">Hides to the tray (bots keep running)</button><button data-v="quit" class="${s.closeAction === 'quit' ? 'on' : ''}">Quits (logs bots out)</button></span></div>
      <h3 style="margin-top:18px">Notifications – also while the window is hidden in the tray</h3>
      <div class="note">When someone writes to a bot, Windows shows a popup from the tray icon (click it to open that bot's Chat) and/or a short sound. Nothing is announced while you are looking at that bot's Chat.</div>
      <div class="ntable">
        <span></span><b>Popup</b><b>Sound</b>
        <span>✉ IMs to the bot (also IMs from objects) <button class="btn sm" data-tsnd="im" title="Play this sound">▶</button></span>
        <label class="switch"><input type="checkbox" id="nImPop" ${s.notifyImPopup ? 'checked' : ''}><span class="tr"></span></label>
        <label class="switch"><input type="checkbox" id="nImSnd" ${s.notifyImSound ? 'checked' : ''}><span class="tr"></span></label>
        <span>👥 Group and conference chats <button class="btn sm" data-tsnd="group" title="Play this sound">▶</button></span>
        <label class="switch"><input type="checkbox" id="nGrPop" ${s.notifyGroupPopup ? 'checked' : ''}><span class="tr"></span></label>
        <label class="switch"><input type="checkbox" id="nGrSnd" ${s.notifyGroupSound ? 'checked' : ''}><span class="tr"></span></label>
        <span>💬 Local chat near the bot <button class="btn sm" data-tsnd="local" title="Play this sound">▶</button></span>
        <label class="switch"><input type="checkbox" id="nLcPop" ${s.notifyLocalPopup ? 'checked' : ''}><span class="tr"></span></label>
        <label class="switch"><input type="checkbox" id="nLcSnd" ${s.notifyLocalSound ? 'checked' : ''}><span class="tr"></span></label>
      </div>
      <div class="note">Each kind has its own sound. A busy group rings at most every 8 s, local chat every 15 s; IMs every time. The sounds can also be switched in the Chat section (🔔 buttons).</div>
      <div class="actions" style="margin-top:8px"><button class="btn" id="nTest">🔔 Test popup and sound</button></div>
      <h3 style="margin-top:18px">Updates</h3>
      <div class="note">Once a day AvieBoter asks GitHub (github.com/anderlejan/AvieBoter) whether there is a newer version of the app or of the HUD. Nothing else is sent. Updates keep your bots, passwords, people and chats; a newer HUD needs no app update – the bots hand it out and worn HUDs update themselves.</div>
      <label class="switch"><input type="checkbox" id="uCheck" ${(S.update || {}).check ? 'checked' : ''}><span class="tr"></span>Check for updates once a day</label><br>
      <label class="switch" style="margin-top:8px"><input type="checkbox" id="uAuto" ${(S.update || {}).auto ? 'checked' : ''}><span class="tr"></span>Install updates by itself while no bot is online (running bots are never logged out for an update)</label>
      <div class="row" style="margin-top:10px"><span class="grow"><span id="uState"></span><br><span class="muted small" id="uHud"></span></span><button class="btn" id="uNow">Check now</button><button class="btn pri hidden" id="uInst">Install</button></div>
      <h3 style="margin-top:18px">Other</h3>
      <label class="switch"><input type="checkbox" id="sNotes" ${s.showNotesButton ? 'checked' : ''}><span class="tr"></span>Show the 📝 User notes button</label>
      <div class="actions" style="margin-top:12px"><button class="btn" id="sData">📂 Open data folder</button><button class="btn danger" id="sQuit">⏻ Quit AvieBoter</button></div>
      <p class="note">Data folder: <span class="mono sel">${esc(S.dataDir)}</span></p>`, [], { wide: true });
    const r = d.root;
    const fsShow = () => { $('#fsVal', r).textContent = (s.fontPercent || 100) + ' %'; };
    const setFs = v => { s.fontPercent = Math.max(70, Math.min(200, v)); applyFont(s.fontPercent); fsShow(); rpc('setting', 'fontPercent', s.fontPercent).catch(fail); };
    fsShow();
    $('#fsDown', r).onclick = () => setFs((s.fontPercent || 100) - 5);
    $('#fsUp', r).onclick = () => setFs((s.fontPercent || 100) + 5);
    r.querySelectorAll('[data-fs]').forEach(x => x.onclick = () => setFs(+x.dataset.fs));
    $('#sTheme', r).onclick = e => { const x = e.target.closest('[data-t]'); if (!x) return; s.theme = x.dataset.t; applyTheme(s.theme); r.querySelectorAll('.sw').forEach(w => w.classList.toggle('on', w === x)); rpc('setting', 'theme', s.theme).catch(fail); };
    const sw = (id, key, after) => $(id, r).onchange = e => { s[key] = e.target.checked; rpc('setting', key, e.target.checked).then(() => after && after()).catch(fail); };
    sw('#sWin', 'startWithWindows'); sw('#sTray', 'startInTray'); sw('#sBots', 'startBotsWithApp');
    sw('#sNotes', 'showNotesButton', () => $('#btnNotes').classList.toggle('hidden', !s.showNotesButton));
    sw('#nImPop', 'notifyImPopup'); sw('#nImSnd', 'notifyImSound'); sw('#nLcPop', 'notifyLocalPopup'); sw('#nLcSnd', 'notifyLocalSound');
    sw('#nGrPop', 'notifyGroupPopup'); sw('#nGrSnd', 'notifyGroupSound');
    r.querySelectorAll('[data-tsnd]').forEach(x => x.onclick = e => { e.preventDefault(); rpc('notify.test', x.dataset.tsnd).catch(fail); });
    $('#nTest', r).onclick = () => rpc('notify.test').catch(fail);
    $('#sClose', r).onclick = e => { const v = e.target.closest('[data-v]'); if (!v) return; s.closeAction = v.dataset.v; $('#sClose', r).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === v)); rpc('setting', 'closeAction', s.closeAction).catch(fail); };
    const uShow = () => { const u = S.update || {}; $('#uState', r).textContent = updateText(u); $('#uHud', r).textContent = u.hud ? 'HUD handed out by the bots: ' + u.hud : ''; $('#uInst', r).classList.toggle('hidden', !u.available || u.status === 'installing' || /^downloading/.test(u.status || '')); };
    uShow(); settingsUpdate = uShow;
    const usw = (id, key, prop) => $(id, r).onchange = e => { S.update = S.update || {}; S.update[prop] = e.target.checked; rpc('setting', key, e.target.checked).then(uShow).catch(fail); };
    usw('#uCheck', 'checkForUpdates', 'check'); usw('#uAuto', 'installUpdatesAutomatically', 'auto');
    $('#uNow', r).onclick = async () => { $('#uState', r).textContent = 'Checking…'; try { S.update = await rpc('update.check'); renderUpdate(); if (!S.update.available && !/^error/.test(S.update.status || '')) toast('AvieBoter ' + S.update.current + ' is the newest version.'); } catch (e) { fail(e); } uShow(); };
    $('#uInst', r).onclick = installUpdate;
    $('#sData', r).onclick = () => rpc('openData');
    $('#sQuit', r).onclick = () => confirmDlg('Quit AvieBoter?', 'All running bots are logged out.', 'Quit', () => rpc('quit'));
  }

  // ---------- updates ----------
  let settingsUpdate = null;
  function updateText(u) {
    const st = u.status || '';
    if (st === 'checking') return 'Checking for updates…';
    if (/^downloading/.test(st)) return 'Downloading the update… ' + st.replace('downloading', '').trim();
    if (st === 'installing') return 'Installing the update – AvieBoter restarts in a moment.';
    if (/^error/.test(st)) return 'The last update attempt failed: ' + st.replace(/^error:?\s*/, '');
    if (u.available) return 'Version ' + u.available.version + ' is available (you have ' + u.current + ').' + (u.auto ? (u.botsOnline ? ' It installs itself when no bot is online.' : '') : '');
    return 'You have ' + (u.current || S.version) + '.' + (u.lastCheck ? ' Last check: ' + new Date(u.lastCheck).toLocaleString() + '.' : '');
  }
  function installUpdate() {
    const u = S.update || {};
    if (!u.available) return;
    const go = () => rpc('update.install').then(() => { S.update.status = 'downloading'; renderUpdate(); }).catch(fail);
    if (u.botsOnline) confirmDlg('Install AvieBoter ' + u.available.version + ' now?', 'AvieBoter closes for a moment: the running bots log out and log in again by themselves after the update.', 'Install', go);
    else go();
  }
  function renderUpdate() {
    const b = $('#updBanner'), u = S.update || {};
    const st = u.status || '';
    const busy = st === 'installing' || /^downloading/.test(st);
    const show = !!u.available || busy || (/^error/.test(st) && !!u.available);
    b.classList.toggle('hidden', !show);
    if (show) {
      b.innerHTML = `<span class="grow">⬆ ${esc(updateText(u))}</span>` +
        (u.available && u.available.page ? `<button class="btn sm" id="updNew">What's new</button>` : '') +
        (busy ? '' : `<button class="btn sm pri" id="updGo">Install now</button>`);
      const n = $('#updNew'); if (n) n.onclick = () => rpc('openUrl', u.available.page);
      const g = $('#updGo'); if (g) g.onclick = installUpdate;
    }
    if (settingsUpdate && document.getElementById('uState')) settingsUpdate();
  }

  function openHelp() {
    dialog('Help', `<div class="help">
      <h3>What this app does</h3>
      <p>It runs Second Life avatars ("bots") on this PC with SecondBot – a program that speaks Second Life's protocol without drawing anything. A bot needs a little memory and almost no CPU, and no graphics card at all.</p>
      <h3>Adding and starting a bot</h3>
      <ul><li><b>＋ Add bot</b>: the avatar's username and password, and your own avatar under "Who may command it".</li>
      <li><b>▶ Start</b> logs the bot in; <b>■ Stop</b> logs it out properly. If the login fails (e.g. wrong password) the app stops the bot at once so it does not keep retrying.</li>
      <li>Second Life requires accounts used <i>mainly</i> as bots to be marked as "scripted agent" in the account settings. An alt that is mostly a normal avatar does not need it.</li></ul>
      <h3>The HUD</h3>
      <p>See the 🎮 HUD section of a bot. "Send me a new HUD" makes the bot build a HUD where it stands (it needs a spot where it may build) and give it to you, already paired. Such a HUD has a tiny second prim with an updater: when the app has a newer HUD, it updates itself a few seconds after you wear it, keeping its pairings – the bot hands the new script over with its courier, a small object it wears as its own HUD. A HUD you made by hand from the copied script works too, but you update it by pasting the new script.</p>
      <h3>Sharing a bot with friends</h3>
      <p>In a bot's 🎮 HUD section, add your friend under "People who use this bot" and send them a HUD – it arrives paired. Everyone listed can use the bot at the same time with their own HUD; removing someone stops their HUD at once.</p>
      <p>One HUD can control several bots (Bot ▸ switches). 🔄 Update HUD next to a person puts every bot here that this person may use into the HUD they already wear. If a bot their HUD already uses is online, it goes silently; otherwise each online bot sends them an IM with a link – wearing the HUD, they click it once per bot. The link carries a one-time code that only works for their own HUD, so nobody who overhears it can use it.</p>
      <p>HUD → Teleport me: the bot sends you a teleport offer to where it is. HUD → Fly ON / Fly OFF makes it take off or land; while it sits, the same button says Stand.</p>
      <p>New HUD versions can come from GitHub without a new AvieBoter: the daily check (Settings → Updates) also looks for a newer HUD that works with your version. The bots then hand it out, and a worn HUD updates itself the next time it talks to a bot in the same region – Update HUD makes it ask at once.</p>
      <h3>Radar, comings and goings</h3>
      <p>📡 Radar lists the avatars around the bot (its region and the neighbouring ones), nearest first; ⋯ on a name offers an IM, going to them, following them, offering them a teleport, their profile and more. Below it, "Comings and goings" lists arrivals and departures in the bot's region, HUDs worn and taken off, and people starting to use the bot. With "Save comings and goings to files" switched on (off by default, per bot) they are also written to daily files (📂 Files, one JSON object per line: t, type, uuid, name, region, extra, bot) for other tools. The watching itself sends nothing to the grid: it uses the positions Second Life sends every viewer anyway.</p>
      <p>Click a column header to sort (again to reverse): name, age (from the profile, as viewers' radars show it – under 30 days in amber), distance or place. 💬 marks avatars within 20 m, who read the bot's local chat; "In chat range" lists only them, "New only" only avatars under the age you choose. Ages are asked from Second Life a few at a time while the Radar is open. "Alert me about new avatars" (off by default) pops up a Windows notice when such an avatar is in the bot's region, also with the Radar closed – the bot then asks for the age of each avatar arriving there.</p>
      <h3>Following and getting to you</h3>
      <p>HUD → Follow ▸ makes the bot follow you at a place you choose (Closer/Farther, behind, beside, in front – remembered). Blocked by walls, it teleports next to you; if teleports do not get it to you, it sends you a teleport request – click Offer Teleport. "Come to me" and "Sit with me" walk when you are close, else teleport; when a parcel's landing point or a telehub reroutes the teleport, the bot walks the rest, and if it still cannot reach you it sends you a teleport request – click Offer Teleport in it and the bot accepts.</p>
      <h3>Finding your way back</h3>
      <p>◀ and ▶ at the top left (or Alt+← / Alt+→, or the mouse's back and forward buttons) go back and forward through the places you opened, like a web browser; 🕘 lists them all.</p>
      <p>"Sit with me": sit on a vehicle first, then choose it – the bot teleports next to you and sits on a free seat. "Come to me" only teleports it beside you.</p>
      <p>Answers come back to the HUD's own web address in Second Life, so nothing on this PC is opened to the internet. The bot's control port listens only on this PC (127.0.0.1).</p>
      <h3>Groups</h3>
      <p>👥 Groups lists the bot's groups like a viewer's Groups window: ★ the active group (its tag shows over the bot), Activate or No active group, Notices and In profile switches, Leave…, and Join group with the key of an open group. "Members and more ▸" opens a group: the bot's title, Invite (with a role), group chat, a group notice, and the members (online first, filter, Online only) with ⋯ for an IM, the profile, giving or taking a role, or Eject. Buttons appear only where the bot's role in that group allows it. Group invitations to the bot wait under "Invitations" (with a Windows notice) until you Accept or Decline them.</p>
      <h3>Nearby and menus</h3>
      <p>🌍 Nearby lists the objects around the bot, nearest first – from 5 m to the whole region (further than 64 m the bot looks further for a few minutes, which takes a few seconds; the region sends what is within 256 m of the bot, so from a sky platform things far below may be missing): Typing in the name box filters the list; Enter searches every object in the range by name. 🪑 seats, 👆 touchable things, 🏷 things for sale. The buttons in a row touch it or sit on it; ⋯ also goes to it, tells about it, looks inside, and for the bot's own things takes it, wears it, renames it, deletes it to the bot's Trash or returns it to Lost and Found. Contents lists what is inside an object the bot may change: open and save notecards and scripts (scripts compile and show their errors), take things out, delete them, or make a new script or notecard inside. ＋ Box rezzes a new box. Return also works on other people's things where the bot is the land owner or an estate manager.</p>
      <p>Menus, text boxes, permission questions and links that objects send the bot appear at the bottom right, like a viewer's blue menus – click a button, type an answer, or allow / refuse. ✕ ignores one; unanswered ones go away after 10 minutes. With "Menus on my HUD" (Nearby, on by default) they also pop up as a blue menu on the HUD of whoever uses the bot – answer there and the bot clicks it.</p>
      <h3>Inventory</h3>
      <p>🎒 Inventory shows the bot's folders, what it wears and its Trash, with a search over everything. ⋯ on an item: add or wear it, take it off, rez it in front of the bot, read notecards and full-permission scripts, open and edit notecards and scripts (＋ New ▾ makes a folder, notecard or script), rez objects in front of the bot, on the ground, in front of you or at a place, put things into an object nearby, listen to sounds here or play them in-world, play and stop animations and gestures on the bot, show pictures, teleport the bot to a landmark, give, rename, move or delete it. 👗 Outfits shows My Outfits as a gallery: wear, add, take off, rename or delete an outfit, save what the bot wears as a new one, and give each a picture – click the card and press Ctrl+V, drop a file on it, or choose a file. The pictures stay on this PC.</p>
      <h3>Puppeteer</h3>
      <p>Overview → 🕹 Puppeteer opens a small window that stays above other windows, also above your viewer: hold ▲ ▼ ↶ ↷ (or W A S D / the arrow keys) to walk and turn the bot, ◀ ▶ (Q / E) to step aside, ⤒ ⤓ (R / C) up and down, F to fly, Space or ■ to stop. 📷 turns on the camera of your HUD (1.6 or newer): your view stays behind the bot and looks the way it faces while you steer it – set distance, height, tilt and side in the HUD (More ▸ Cam ▸), where Cam OFF gives your camera back. 🗺 shows a map around the bot (off by default). The slider at the bottom makes the window see-through. Moving by hand ends following.</p>
      <h3>Coming back</h3>
      <p>A bot that lost its connection, or whose program or AvieBoter itself ended unexpectedly, comes back by itself (after 20 s, then 1, 2 and 5 minutes while Second Life cannot be reached) and does again what it did: it sits down on the same seat or follows the same person. "Reconnecting" shows the time of the next try; ■ Stop ends it. A bot stopped by you, logged off from the HUD, refused at login or logged in elsewhere is not brought back.</p>
      <h3>Undeform</h3>
      <p>Sounds: IMs, group chats and local chat each have their own sound and their own switch – in Settings → Notifications and as the bell in each Chat filter (🔔 on, 🔕 off), so a busy local chat can be quiet while IMs still ring.</p>
      <p>Places: Overview → Go to a place takes a SLURL, Region/x/y/z or just x y z in the bot's region. 🚶 Walk to walks when the place is near (a far place gets a teleport close by first); Teleport jumps there. ▾ lists where the bot is now, your saved places (☆ saves the one in the field) and recent ones. 🙋 Come to me brings the bot to you without a HUD: it walks or teleports when it can see you, else it sends you a teleport request – accept it in your viewer. ▾ next to it calls it to someone else.</p>
      <p>Logging in: ✎ Bot settings → Logs in at: the last place, its home, or a place (a SLURL, also from your saved places). It applies at the next login.</p>
      <p>Overview → Undeform helps when an outfit change left the bot deformed: it stops every animation the bot plays and sends its appearance again, so viewers redraw it. While the bot sits it keeps its seat's animations (only the appearance is sent again) – stand it up first for a full undeform. A viewer that still shows it deformed keeps an old skeleton in memory: there, right-click the bot → Reset skeleton.</p>
      <h3>Commands</h3>
      <p>⌘ Commands lists everything SecondBot can do (about 190 commands), with a form for each. Money, Discord and service commands are switched off in this app; "Show all modules" lists them anyway.</p>
      <h3>Log</h3>
      <p>Everything the bot prints, live. "Problems only" shows warnings and errors. Daily log files are in the log folder.</p>
      <h3>User notes</h3>
      <p>📝 User notes keeps a list of changes you want. You set each note's status by hand (open → queued → sent → done). Tick notes and make a <b>Full</b> prompt (everything a new AI session needs) or a <b>Short</b> one (only the changes, for the same session), or plain <b>User feedback</b>. Ticked notes can be changed together with the bar under the list; deletions can be undone (Ctrl+Z); A− / A+ change the text size; done notes can be printed or saved as PDF. The notes file is <span class="mono">user-notes.json</span> in the data folder.</p>
      <h3>Outfits, home and conferences</h3>
      <p>Overview → Outfit wears a folder by name and replaces the current outfit: "My Outfits/&lt;name&gt;" first, otherwise any folder with that name (not Trash). ▾ lists the recently worn names and the bot's My Outfits. "Set home here" makes the bot's current place its home (Second Life allows it only on land where the bot may set home; the app shows the region's answer). Bot settings → "Take part in conference chats" off makes the bot leave every conference it is pulled into.</p>
      <h3>Notifications</h3>
      <p>Settings → Notifications: a Windows popup and/or a sound when someone IMs a bot (on by default) or talks in local chat near it (off by default). Clicking the popup opens that bot's Chat.</p>
      <h3>Closing</h3>
      <p>By default ✕ hides the window to the tray and the bots keep running. Quit from the tray menu or Settings logs all bots out. Settings → "The window's ✕" changes this.</p>
      <h3>Updates</h3>
      <p>Once a day AvieBoter looks for a newer version on GitHub. While no bot is online it installs it by itself (it checks the download's SHA-256 first) and starts again; otherwise a bar at the top offers "Install now" – the running bots then log out and come back by themselves. Your bots, passwords, people and chats stay. Settings → Updates switches this off or checks at once.</p>
      <h3>About</h3>
      <p><b>AvieBoter ${esc(S.version)} is experimental software.</b> It is provided "as is", without any warranty; use it at your own risk and not for anything serious. You are responsible for following the Terms of Service and the scripted-agent rules of the grid you log in to, and for logging in only accounts that are yours.</p>
      <p>Source code, releases and the licence: <a href="#" data-url="https://github.com/anderlejan/AvieBoter">github.com/anderlejan/AvieBoter</a> (GPL-3.0).</p>
      <p>AvieBoter is built on <a href="#" data-url="https://github.com/Madpeterz/SecondBot">SecondBot</a> by Madpeterz (GPL-3.0), patched with AvieBoter's own modules, which uses <a href="#" data-url="https://github.com/cinderblocks/libremetaverse">LibreMetaverse</a> (BSD 3-Clause). The window uses Microsoft Edge WebView2.</p>
      <p>Second Life is a trademark of Linden Research, Inc. AvieBoter is not affiliated with or endorsed by Linden Lab. OpenSimulator is a project of its own contributors; AvieBoter is not part of it.</p>
      </div>`, [], { wide: true }).root.querySelectorAll('[data-url]').forEach(a => a.onclick = e => { e.preventDefault(); rpc('openUrl', a.dataset.url).catch(fail); });
  }

  // ---------- user notes ----------
  const notesApi = {
    get: async () => UserNotesCore.migrate(await rpc('notes.get')).notes,
    save: list => rpc('notes.save', list),
    saveText: (text, kind) => rpc('notes.saveText', text, kind),
    copy: text => rpc('copy', text),
    openFolder: file => rpc('notes.openFolder', file || ''),
    print: (html, o) => rpc('notes.print', html, o || {}),
  };
  window.__notes = UserNotesUI.create({
    api: notesApi,
    title: 'User notes',
    toast,
    fontControl: true,
    config: () => Object.assign({
      appName: 'AvieBoter', version: S.version,
      appDescription: 'A Windows tray app that runs Second Life bot avatars with a patched SecondBot (no viewer), controlled from the app and from an in-world HUD – e.g. a passenger bot that sits in your vehicle.',
      docs: ['README.md'],
      location: 'Source code: https://github.com/anderlejan/AvieBoter (manager\\ = C# WPF + WebView2 app, bot\\ = SecondBot patch, hud\\ = LSL scripts, build\\build.ps1 = build and installer).',
      rules: ['Keep older installers; a fix after a build is a new version.', 'Back up before changing files in place.'],
      deliver: ['Bump the version, run build\\build.ps1, install it and check that the app starts.'],
      extraShort: ['Bump the version, build, install and verify.'],
    }, S.notesConfig || {}, { version: S.version }),
  });
  $('#btnNotes').onclick = () => window.__notes.open();

  // ---------- header ----------
  $('#btnAdd').onclick = () => openBotDialog(null);
  $('#btnSettings').onclick = openSettings;
  $('#btnHelp').onclick = openHelp;
  document.addEventListener('keydown', e => {
    if (window.__notes.isOpen()) return;
    if (e.key === 'F1') { e.preventDefault(); openHelp(); }
  });

  async function refresh() {
    const bots = await rpc('state');
    S.bots = bots;
    renderList();
    renderMain();
  }

  // ---------- start ----------
  (async function init() {
    try {
      const r = await rpc('init');
      S = r;
      Object.assign(ui, S.settings.ui || {});
      applyTheme(S.settings.theme);
      applyFont(S.settings.fontPercent || 100);
      $('#ver').textContent = 'v' + S.version;
      renderUpdate();
      $('#btnNotes').classList.toggle('hidden', !S.settings.showNotesButton);
      section = S.settings.lastSection || 'overview';
      if (!SECTIONS.some(x => x[0] === section)) section = 'overview';
      current = S.bots.some(b => b.id === S.settings.lastBot) ? S.settings.lastBot : (S.bots[0] ? S.bots[0].id : '');
      try { commands = await (await fetch('commands.json')).json(); } catch { commands = []; }
      renderList();
      renderMain();
      navPush();
      if (!S.botExeFound) toast('The bot program is missing from the installation – reinstall AvieBoter.', 'bad');
      setInterval(() => { const b = bot(); if (b) { updateHead(b); if (section === 'overview') updateOverview(b); } }, 1000);
    } catch (e) { document.body.innerHTML = '<p style="padding:30px">' + esc(e.message) + '</p>'; }
  })();
})();

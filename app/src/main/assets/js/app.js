/* ========== 拾光手账 · 界面与路由（原生 JS，无依赖） ========== */
(function () {
  'use strict';

  /* ---------- 素材 ---------- */
  const MOODS = ['😊', '🥰', '😌', '😐', '😢', '😠', '😴'];
  const WEATHERS = ['☀️', '⛅', '🌧️', '⛈️', '❄️', '🌫️'];
  const TAPE_COLORS = ['#F2D591', '#E8B4A0', '#BFD7D3', '#CDB4DB', '#F6DDD0'];
  const NOTE_COLORS = ['#FDF3D8', '#FDE4DC', '#E7EFDF', '#E3EEF2'];
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  /** 近期手账列表固定显示的条数 */
  const LIST_LIMIT = 30;

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  /** 用日期哈希取胶带颜色，每篇固定 */
  function tapeColor(date) {
    let h = 0;
    for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return TAPE_COLORS[Math.abs(h) % TAPE_COLORS.length];
  }

  /** 时间戳精确到秒 */
  function fmtTime(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** 只有时分秒 */
  function fmtClock(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** 复古中文短日期：今年显示「10月29日」，往年带年份，避免日期行过长重叠 */
  function fmtDateCn(ds) {
    const [y, m, d] = ds.split('-').map(Number);
    return y === new Date().getFullYear() ? `${m}月${d}日` : `${y}年${m}月${d}日`;
  }

  /** 关键词高亮（先转义再包 mark） */
  function highlight(text, q) {
    const t = esc(text);
    if (!q) return t;
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return t.replace(new RegExp(safe, 'gi'), m => `<mark>${m}</mark>`);
  }

  /** 命中片段：命中处前后各取一段 */
  function makeSnippet(entry, q) {
    const hay = (entry.title ? entry.title + ' ' : '') + entry.content;
    const idx = hay.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) {
      return esc(hay.slice(0, 60)) + (hay.length > 60 ? '…' : '');
    }
    const start = Math.max(0, idx - 15);
    return (start > 0 ? '…' : '') +
      esc(hay.slice(start, idx + q.length + 30)).replace(/\n/g, ' ') + '…';
  }

  /* ---------- 复古线性图标（内联 SVG，颜色随上下文） ---------- */
  const ICONS = {
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/><path d="M7.8 10.5a2.7 2.7 0 0 1 2.7-2.7" opacity=".45"/>',
    back:   '<path d="M14.5 5 7.5 12l7 7"/>',
    prev:   '<path d="M14.5 5 7.5 12l7 7"/>',
    next:   '<path d="M9.5 5l7 7-7 7"/>',
    edit:   '<path d="M4.5 19.5l.9-3.6L16.2 5.1a2.1 2.1 0 0 1 3 3L8.4 18.9l-3.9.6z"/><path d="M14.5 6.8l3 3" opacity=".5"/>',
    send:   '<path d="M21 3 10.5 13.5"/><path d="M21 3l-7 18-3.5-7.5L3 10z"/>',
    close:  '<path d="M6 6l12 12M18 6 6 18"/>',
    book:   '<path d="M12 6.5C10 4.8 7.3 4.2 4 4.4V19c3.3-.2 6 .4 8 2 2-1.6 4.7-2.2 8-2V4.4c-3.3-.2-6 .4-8 2.1z"/><path d="M12 6.5V21"/>',
    backup: '<path d="M4 7.5h16V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V7.5z"/><path d="M3 3.8h18v3.7H3z"/><path d="M10 11.5h4" opacity=".5"/>',
    down:   '<path d="M12 4v11.5"/><path d="M6.5 10 12 15.5 17.5 10"/><path d="M5 20h14" opacity=".5"/>',
    up:     '<path d="M12 15.5V4"/><path d="M6.5 9.5 12 4l5.5 5.5"/><path d="M5 20h14" opacity=".5"/>'
  };

  function icon(name, size = 20) {
    return `<svg class="ri" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
      + `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" `
      + `aria-hidden="true">${ICONS[name]}</svg>`;
  }

  /* ---------- 状态 ---------- */
  const state = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),   // 0 基
    homeView: 'list',                   // 主页视图：list=近期手账（默认）/ calendar=月历
    searchQ: '',
    draft: { mood: 0, weather: 0 },     // 编辑页心情/天气选中值
    editDate: null,                     // 当前新建日记的目标日期
    editId: null,                       // 当前修改的日记 id（null=新建）
    isBackfill: false,                  // 是否补写历史日记
    editingNote: null                   // 正在编辑的批注 id
  };

  /* ---------- 路由 ---------- */
  function route() {
    const hash = location.hash || '#/';
    const mDay = hash.match(/^#\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (mDay) return renderDay(mDay[1]);
    const m = hash.match(/^#\/entry\/(.+)$/);
    if (m) return renderDetail(decodeURIComponent(m[1]));
    if (hash.startsWith('#/write') || hash.startsWith('#/edit/')) return renderEditor();
    if (hash.startsWith('#/search')) return renderSearch();
    if (hash.startsWith('#/settings')) return renderSettings();
    return renderHome();
  }
  window.addEventListener('hashchange', route);

  /* ---------- 首页：默认近期手账列表，可切到月历 ---------- */
  function renderHome() {
    const entries = DB.getEntries();
    const counts = DB.annotationCountMap();
    const today = DB.todayStr();
    const isCal = state.homeView === 'calendar';

    $app.innerHTML = `
      <header class="topbar">
        <div>
          <h1>拾光手账</h1>
          <div class="sub">${isCal ? `${state.viewYear} 年 ${state.viewMonth + 1} 月 · ` : ''}共 ${entries.length} 篇</div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" data-action="go-search" aria-label="搜索">${icon('search', 21)}</button>
          <button class="icon-btn" data-action="go-settings" aria-label="数据备份">${icon('backup', 20)}</button>
          <span class="seal" aria-hidden="true">拾光</span>
        </div>
      </header>
      <main>
        <div class="view-tabs">
          <button class="${!isCal ? 'on' : ''}" data-action="home-view" data-view="list">近期手账</button>
          <button class="${isCal ? 'on' : ''}" data-action="home-view" data-view="calendar">月历</button>
        </div>
        ${isCal
          ? calendarHtml(entries)
          : (entries.length
              ? `<div class="list-scroll">
                  ${entries.slice(0, LIST_LIMIT).map(e => cardHtml(e, counts[e.id] || 0, e.date === today)).join('')}
                  ${entries.length > LIST_LIMIT
                    ? `<div class="hint pad" style="text-align:center;margin-top:0.75rem">已显示最近 ${LIST_LIMIT} 篇 · 更早的手账请用月历或 🔍 搜索查看</div>`
                    : ''}
                </div>`
              : emptyHtml())}
        <div class="bottom-space"></div>
      </main>
      <button class="fab" data-action="go-write">${icon('edit', 16)}<span>写今天</span></button>
    `;
  }

  function calendarHtml(entries) {
    const y = state.viewYear, m = state.viewMonth;
    const byDate = {};
    entries.forEach(e => { byDate[e.date] = e; });

    let offset = new Date(y, m, 1).getDay() - 1;   // 周一为一周开始
    if (offset < 0) offset = 6;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = DB.todayStr();

    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span class="day empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = 'day'
        + (byDate[ds] ? ' has' : '')
        + (ds === today ? ' today' : '')
        + (ds > today ? ' future' : '');
      cells += `<button class="${cls}" data-action="open-day" data-date="${ds}">
                  <span class="badge"></span>
                  <span class="inner"><span class="num">${d}</span><span class="dot"></span></span>
                </button>`;
    }

    return `
      <div class="calendar">
        <div class="cal-head">
          <button data-action="prev-month" aria-label="上个月">${icon('prev', 20)}</button>
          <div class="cal-title">${y} 年 ${m + 1} 月</div>
          <button data-action="next-month" aria-label="下个月">${icon('next', 20)}</button>
        </div>
        <div class="cal-week">${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  }

  function cardHtml(entry, noteCount, isToday) {
    // 主页选取任何日记（含今天）都进详情页：批注输入栏立即可用；今天的日记从详情页 ✎ 修改正文
    return `
      <article class="card diary-card" data-action="open-entry" data-id="${entry.id}">
        <span class="tape" style="background:${tapeColor(entry.date)}"></span>
        <div class="row">
          <div class="date">${fmtDateCn(entry.date)}<span class="time">${fmtClock(entry.createdAt)}</span></div>
          ${isToday ? '<span class="stamp green">今天</span>' : ''}
          <div class="mw">${MOODS[entry.mood] || ''} ${WEATHERS[entry.weather] || ''}</div>
        </div>
        ${entry.title ? `<div class="title">${esc(entry.title)}</div>` : ''}
        <div class="preview">${esc(entry.content)}</div>
        ${noteCount ? `<div class="notes-count">✎ ${noteCount} 条批注</div>` : ''}
      </article>`;
  }

  function emptyHtml() {
    return `
      <div class="empty">
        <div class="big">${icon('book', 44)}</div>
        <div class="t">还没有日记</div>
        <div class="d">点右下角「写今天」，记录下第一页吧</div>
      </div>`;
  }

  /* ---------- 编辑页：新建（当天/补写）或修改今天的日记 ---------- */
  function renderEditor() {
    const today = DB.todayStr();
    const mDate = location.hash.match(/^#\/write\/(\d{4}-\d{2}-\d{2})$/);
    const mEdit = location.hash.match(/^#\/edit\/(.+)$/);
    const editing = mEdit ? DB.getEntryById(decodeURIComponent(mEdit[1])) : null;

    let targetDate, pageTitle, hint, btnLabel, editId = null, existing = null;

    if (editing) {
      // 修改模式：仅今天的日记可改，历史日记封存
      if (editing.date !== today) { location.replace('#/entry/' + editing.id); return; }
      targetDate = editing.date;
      editId = editing.id;
      existing = editing;
      pageTitle = '修改日记';
      hint = '今天写的内容现在还能修改 ✏️ 过了今晚就会封存，只能批注。';
      btnLabel = '保存修改';
    } else {
      targetDate = mDate ? mDate[1] : today;
      if (targetDate > today) { location.hash = '#/'; return; }
      const isBackfill = targetDate < today;
      pageTitle = isBackfill ? '补写日记' : '写日记';
      hint = isBackfill
        ? '补写的日记保存后立即封存 🔒 之后只能批注，不能再修改。'
        : '一天可以写多篇 ✍️ 过了今晚就会封存，只能批注。';
      btnLabel = isBackfill ? '保存并封存' : '保存';
    }

    state.editId = editId;
    state.editDate = targetDate;
    state.isBackfill = !editing && targetDate < today;
    state.draft.mood = existing ? existing.mood : 0;
    state.draft.weather = existing ? existing.weather : 0;

    const d = new Date(targetDate + 'T00:00:00');
    const weekday = '星期' + '日一二三四五六'[d.getDay()];

    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div>
          <div class="page-title">${pageTitle}</div>
          <div class="sub">${fmtDateCn(targetDate)} · ${weekday}</div>
        </div>
      </header>
      <main class="editor">
        <div class="label">心情</div>
        <div class="picker" id="moodPicker"></div>
        <div class="label">天气</div>
        <div class="picker" id="weatherPicker"></div>
        <input id="titleInput" class="input" placeholder="标题（可不填）"
               value="${esc(existing && existing.title || '')}">
        <textarea id="contentInput" class="input textarea"
               placeholder="今天发生了什么…">${esc(existing && existing.content || '')}</textarea>
        <div class="hint">${hint}</div>
        <button class="primary-btn" data-action="save-today">${btnLabel}</button>
        <div class="bottom-space"></div>
      </main>
    `;
    renderPickers();
  }

  function renderPickers() {
    const moodEl = document.getElementById('moodPicker');
    const weatherEl = document.getElementById('weatherPicker');
    if (!moodEl || !weatherEl) return;
    moodEl.innerHTML = MOODS.map((m, i) =>
      `<button class="pick ${i === state.draft.mood ? 'on' : ''}"
               data-action="pick-mood" data-index="${i}">${m}</button>`).join('');
    weatherEl.innerHTML = WEATHERS.map((w, i) =>
      `<button class="pick ${i === state.draft.weather ? 'on' : ''}"
               data-action="pick-weather" data-index="${i}">${w}</button>`).join('');
  }

  function saveToday() {
    const title = document.getElementById('titleInput').value;
    const content = document.getElementById('contentInput').value.trim();
    if (!content) { toast('写点什么再保存吧～'); return; }
    const payload = {
      title, content,
      mood: state.draft.mood,
      weather: state.draft.weather
    };
    const id = state.editId
      ? DB.updateEntry(state.editId, payload)
      : DB.saveNew(state.editDate, payload);
    if (id == null) { toast('未来的日子还不能书写 ✋'); return; }
    toast(state.editId ? '已修改 ✨' : (state.isBackfill ? '已补写并封存 ✨' : '已保存 ✨'));
    // 补写的新日记保存后立即封存，直接进入只读详情页
    location.hash = '#/entry/' + id;
  }

  /* ---------- 某天的日记列表：一天可有多篇 ---------- */
  function renderDay(date) {
    const today = DB.todayStr();
    if (date > today) { location.hash = '#/'; return; }
    const list = DB.getEntriesByDate(date);
    const counts = DB.annotationCountMap();
    const isToday = date === today;
    const d = new Date(date + 'T00:00:00');
    const weekday = '星期' + '日一二三四五六'[d.getDay()];

    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div>
          <div class="page-title">${fmtDateCn(date)}</div>
          <div class="sub">${weekday} · ${list.length} 篇</div>
        </div>
        ${isToday ? `<button class="icon-btn" data-action="go-write" aria-label="写新日记">${icon('edit', 20)}</button>` : ''}
      </header>
      <main>
        ${list.length
          ? list.map(e => cardHtml(e, counts[e.id] || 0, isToday)).join('')
          : `<div class="hint pad" style="margin-top:24px">这一天还没有日记${isToday ? '，点右下角写一篇吧' : ''}</div>`}
        <div class="bottom-space"></div>
      </main>
      <button class="fab" data-action="${isToday ? 'go-write' : 'go-backfill'}" data-date="${date}">
        ${icon('edit', 16)}<span>${isToday ? '再写一篇' : '补写一篇'}</span>
      </button>
    `;
  }

  /* ---------- 详情页：正文只读 + 批注 ---------- */
  function renderDetail(id) {
    const entry = DB.getEntryById(id);
    if (!entry) {
      $app.innerHTML = `
        <header class="topbar">
          <button class="icon-btn" data-action="back">${icon('back', 21)}</button>
          <div class="page-title">日记</div>
        </header>
        <main><div class="center">这篇日记不存在</div></main>`;
      return;
    }
    const isToday = entry.date === DB.todayStr();
    const notes = DB.getAnnotations(id);

    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div>
          <div class="page-title">${fmtDateCn(entry.date)}</div>
          <div class="sub">${isToday ? '今天' : '已封存 · 仅可批注'}</div>
        </div>
        ${isToday ? `<button class="icon-btn" data-action="edit-entry" data-id="${id}" aria-label="修改正文">${icon('edit', 20)}</button>` : ''}
      </header>
      <main>
        <article class="card diary-card">
          <span class="tape" style="background:${tapeColor(entry.date)}"></span>
          <div class="row">
            <div class="mw">${MOODS[entry.mood] || ''} ${WEATHERS[entry.weather] || ''}</div>
            <div style="flex:1"></div>
            ${isToday
              ? '<span class="stamp green">今天</span>'
              : '<span class="stamp">已封存</span>'}
          </div>
          ${entry.title ? `<div class="title big">${esc(entry.title)}</div>` : ''}
          <div class="content-full">${esc(entry.content)}</div>
          <div class="meta">${fmtTime(entry.createdAt)}${entry.updatedAt > entry.createdAt ? ' · ' + fmtTime(entry.updatedAt) : ''}</div>
        </article>
        ${isToday
          ? `<button class="link-btn" data-action="edit-entry" data-id="${id}">今天还没过完，去修改正文 →</button>`
          : '<div class="hint pad">日记已封存，正文不可修改；点批注可随时修改，或在下方新增 ✍️</div>'}
        <div class="section-title pad">批注 · ${notes.length}</div>
        ${notes.length
          ? notes.map((n, i) => `
              <div class="note" style="background:${NOTE_COLORS[i % NOTE_COLORS.length]}">
                <div class="note-body">
                  ${state.editingNote === n.id ? `
                    <textarea class="input note-edit" id="noteEditInput">${esc(n.content)}</textarea>
                    <div class="note-actions">
                      <button class="mini-btn" data-action="save-note" data-id="${n.id}">保存</button>
                      <button class="mini-btn ghost" data-action="cancel-note">取消</button>
                    </div>`
                  : `
                    <div class="note-text" data-action="edit-note" data-id="${n.id}">${esc(n.content)}</div>
                    <div class="note-time">${fmtTime(n.createdAt)}${n.updatedAt ? ' · ' + fmtTime(n.updatedAt) : ''}</div>`}
                </div>
              </div>`).join('')
          : '<div class="hint pad">还没有批注。在下方写下你想补充的话吧～</div>'}
        <div class="bottom-space"></div>
      </main>
      <div class="input-bar">
        <input id="noteInput" class="input grow" placeholder="写一条批注…">
        <button class="send-btn" data-action="add-note" data-id="${id}" aria-label="添加批注">${icon('send', 19)}</button>
      </div>
    `;

    const inp = document.getElementById('noteInput');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') addNote(id);
    });
  }

  function addNote(entryId) {
    const inp = document.getElementById('noteInput');
    const text = (inp && inp.value || '').trim();
    if (!text) return;
    DB.addAnnotation(entryId, text);
    route();
  }

  /* ---------- 搜索页 ---------- */
  function renderSearch() {
    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div class="search-input-wrap">
          <input id="searchInput" class="input" placeholder="搜索标题、正文或批注…">
        </div>
      </header>
      <main><div id="searchResults"></div></main>
    `;
    const inp = document.getElementById('searchInput');
    inp.value = state.searchQ;
    inp.focus();
    inp.addEventListener('input', () => {
      state.searchQ = inp.value;
      renderResults();
    });
    renderResults();
  }

  function renderResults() {
    const box = document.getElementById('searchResults');
    if (!box) return;
    const q = state.searchQ.trim();

    if (!q) {
      box.innerHTML = '<div class="hint pad" style="margin-top:24px">输入关键词找回忆 🔍<br>可搜标题、正文和批注内容</div>';
      return;
    }
    const results = DB.search(q);
    if (!results.length) {
      box.innerHTML = `<div class="hint pad" style="margin-top:24px">没有找到与「${esc(q)}」相关的内容</div>`;
      return;
    }
    box.innerHTML = `
      <div class="hint pad" style="margin-top:10px">找到 ${results.length} 篇相关日记</div>
      ${results.map(r => `
        <article class="card diary-card" data-action="open-entry" data-id="${r.entry.id}">
          <span class="tape" style="background:${tapeColor(r.entry.date)}"></span>
          <div class="row">
            <div class="date">${fmtDateCn(r.entry.date)}</div>
            <div class="mw">${MOODS[r.entry.mood] || ''} ${WEATHERS[r.entry.weather] || ''}</div>
          </div>
          ${r.entry.title ? `<div class="title">${highlight(r.entry.title, q)}</div>` : ''}
          <div class="preview">${highlight(makeSnippet(r.entry, q), q)}</div>
          ${r.hitNoteCount ? `<div class="notes-count">批注中有 ${r.hitNoteCount} 处匹配</div>` : ''}
        </article>`).join('')}
    `;
  }

  /* ---------- 备份页：一键导出 / 导入 ---------- */
  function renderSettings() {
    const entries = DB.getEntries();
    const totalNotes = Object.values(DB.annotationCountMap()).reduce((a, b) => a + b, 0);

    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div>
          <div class="page-title">数据备份</div>
          <div class="sub">${entries.length} 篇日记 · ${totalNotes} 条批注</div>
        </div>
      </header>
      <main>
        <article class="card diary-card">
          <span class="tape" style="background:${tapeColor('backup')}"></span>
          <div class="title big">📦 备份手账箱</div>
          <div class="hint" style="margin-top:8px">所有数据只保存在本设备浏览器里。换手机、重装或清除浏览器数据前，请先导出备份文件。</div>
          <button class="primary-btn" data-action="export-data" style="margin-top:16px">${icon('down', 16)}<span>一键导出全部数据</span></button>
          <button class="ghost-btn" data-action="import-data">${icon('up', 16)}<span>一键导入全部数据</span></button>
          <input type="file" id="importFile" accept=".json,application/json" hidden>
          <div class="hint" style="margin-top:12px">⚠️ 导入会覆盖当前设备上的全部日记和批注，且历史日记一经写入仍不可修改。</div>
        </article>
        <div class="bottom-space"></div>
      </main>
    `;

    document.getElementById('importFile').addEventListener('change', ev => {
      const file = ev.target.files[0];
      if (file) importData(file);
      ev.target.value = '';
    });
  }

  function exportData() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const name = `拾光手账备份-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
    const data = DB.exportAll();

    // APP（WebView 壳）内：走原生桥保存到系统「下载」目录
    if (window.AppBridge && typeof window.AppBridge.saveFile === 'function') {
      window.AppBridge.saveFile(name, data);
      toast('备份已保存到「下载」📦');
      return;
    }

    // 浏览器：普通下载
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('备份文件已导出 📦');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let ok = false;
      try {
        ok = Array.isArray(JSON.parse(reader.result).entries);
      } catch (e) { ok = false; }
      if (!ok) { toast('备份文件格式不正确 ⚠️'); return; }
      if (!confirm('导入将覆盖当前设备上的全部日记和批注，确定继续？')) return;
      try {
        DB.importAll(reader.result);
        toast('导入成功 ✨');
        location.hash = '#/';
      } catch (e) {
        toast('导入失败，文件可能已损坏 ⚠️');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 全局事件委托 ---------- */
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'go-write':      location.hash = '#/write'; break;
      case 'home-view':
        state.homeView = el.dataset.view;
        renderHome();
        break;
      case 'go-search':     location.hash = '#/search'; break;
      case 'go-settings':   location.hash = '#/settings'; break;
      case 'export-data':   exportData(); break;
      case 'import-data':   document.getElementById('importFile').click(); break;
      case 'open-entry':    location.hash = '#/entry/' + encodeURIComponent(el.dataset.id); break;
      case 'edit-entry':    location.hash = '#/edit/' + encodeURIComponent(el.dataset.id); break;
      case 'go-backfill':   location.hash = '#/write/' + el.dataset.date; break;
      case 'edit-note':
        state.editingNote = el.dataset.id;
        route();
        break;
      case 'cancel-note':
        state.editingNote = null;
        route();
        break;
      case 'save-note': {
        const ta = document.getElementById('noteEditInput');
        const text = (ta && ta.value || '').trim();
        if (!text) { toast('批注内容不能为空'); return; }
        DB.updateAnnotation(el.dataset.id, text);
        state.editingNote = null;
        toast('批注已修改 ✨');
        route();
        break;
      }
      case 'back':          history.back(); break;
      case 'prev-month':
        state.viewMonth--;
        if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
        route();
        break;
      case 'next-month':
        state.viewMonth++;
        if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
        route();
        break;
      case 'open-day': {
        const date = el.dataset.date;
        const today = DB.todayStr();
        if (date > today) {
          toast('未来的日子还不能书写 ✋');
        } else if (DB.getEntriesByDate(date).length > 0) {
          // 当天/过去有日记：进入某天列表页（一天可多篇）
          location.hash = '#/day/' + date;
        } else if (date === today) {
          location.hash = '#/write';
        } else {
          // 过去且没日记：直接补写（保存即封存）
          location.hash = '#/write/' + date;
        }
        break;
      }
      case 'pick-mood':
        state.draft.mood = +el.dataset.index;
        renderPickers();
        break;
      case 'pick-weather':
        state.draft.weather = +el.dataset.index;
        renderPickers();
        break;
      case 'save-today':  saveToday(); break;
      case 'add-note':    addNote(el.dataset.id); break;
    }
  });

  /* ---------- 启动 ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  route();
})();

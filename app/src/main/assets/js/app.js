/* ========== 拾光手账 · 界面与路由（原生 JS，无依赖） ========== */
(function () {
  'use strict';

  /* ---------- 素材 ---------- */
  const TAPE_COLORS = ['#F2D591', '#E8B4A0', '#BFD7D3', '#CDB4DB', '#F6DDD0'];
  const NOTE_COLORS = ['#FDF3D8', '#FDE4DC', '#E7EFDF', '#E3EEF2'];
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

  /* 心情 / 天气：复古线性图案（与全局图标同一笔触） */
  const MOOD_LABELS = ['开心', '心动', '平静', '一般', '难过', '生气', '疲惫'];
  const WEATHER_LABELS = ['晴', '多云', '雨', '雷雨', '雪', '雾'];

  /* OpenMoji（CC BY-SA 4.0）手绘风图案文件名 */
  const MOOD_FILES = ['1F60A', '1F970', '1F60C', '1F610', '1F622', '1F620', '1F634'];
  const WEATHER_FILES = ['2600', '26C5', '1F327', '26C8', '1F328', '1F32B'];

  function moodIcon(i, size = 18) {
    const f = MOOD_FILES[i];
    return f ? `<img class="emoji-ico" src="icons/emoji/${f}.svg" style="width:${size}px;height:${size}px" alt="${MOOD_LABELS[i] || ''}" draggable="false">` : '';
  }

  function weatherIcon(i, size = 18) {
    const f = WEATHER_FILES[i];
    return f ? `<img class="emoji-ico" src="icons/emoji/${f}.svg" style="width:${size}px;height:${size}px" alt="${WEATHER_LABELS[i] || ''}" draggable="false">` : '';
  }

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

  /** 卡片用：时:分（减少视觉噪音） */
  function fmtClockShort(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** 心情兼容：历史数据为数字，新数据为数组 */
  function moodList(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.mood)) return entry.mood;
    if (typeof entry.mood === 'number') return [entry.mood];
    return [];
  }

  /* ---------- 偏好设置 ---------- */
  function themeSetting() {
    return localStorage.getItem('shiguang.theme') || 'auto';
  }

  function applyTheme() {
    const s = themeSetting();
    const dark = s === 'dark' ||
      (s === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  function weekStart() {
    return localStorage.getItem('shiguang.weekStart') || 'mon';
  }

  function reminderSetting() {
    try {
      const r = JSON.parse(localStorage.getItem('shiguang.reminder'));
      if (r && r.time) return { enabled: !!r.enabled, time: r.time };
    } catch (e) { /* 使用默认值 */ }
    return { enabled: false, time: '20:00' };
  }

  /** 把提醒设置应用到原生壳（浏览器内无效） */
  function applyReminder() {
    if (!window.AppBridge) return;
    const r = reminderSetting();
    if (r.enabled && window.AppBridge.setDailyReminder) {
      const parts = r.time.split(':').map(Number);
      window.AppBridge.setDailyReminder(parts[0] || 20, parts[1] || 0);
    } else if (window.AppBridge.cancelDailyReminder) {
      window.AppBridge.cancelDailyReminder();
    }
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

  /** 搜索结果摘要：正文 → 批注 → 位置 */
  function snippetFor(r, q) {
    if (r.hitInEntry) return highlight(makeSnippet(r.entry, q), q);
    if (r.hitNotes.length) return highlight('批注：' + r.hitNotes[0].content.slice(0, 60), q);
    if (r.entry.place) return highlight('📍 ' + r.entry.place, q);
    return '';
  }

  function resultMeta(r) {
    const bits = [];
    if (r.hitNoteCount) bits.push('✎ 批注命中 ' + r.hitNoteCount + ' 处');
    if (r.entry.images && r.entry.images.length) bits.push('📷 ' + r.entry.images.length);
    if (r.entry.place) bits.push('📍 ' + esc(r.entry.place));
    return bits.length ? bits.join('　') : '　';
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
    up:     '<path d="M12 15.5V4"/><path d="M6.5 9.5 12 4l5.5 5.5"/><path d="M5 20h14" opacity=".5"/>',
    image:  '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 16.5l4.5-4.5 3 3L15 12l4.5 4.5"/>',
    pin:    '<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
    trash:  '<path d="M4.5 6.5h15"/><path d="M8.5 6.5V4.2h7v2.3"/><path d="M6.5 6.5l.9 13h9.2l.9-13"/><path d="M10 10.5v5.5M14 10.5v5.5" opacity=".5"/>'
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
    searchMonth: '',                    // 搜索页月份筛选
    draft: { weather: 0 },              // 编辑页天气选中值
    draftMoods: [],                     // 编辑页心情选中值（可多选）
    editDate: null,                     // 当前新建日记的目标日期
    editId: null,                       // 当前修改的日记 id（null=新建）
    isBackfill: false,                  // 是否补写历史日记
    editingNote: null,                  // 正在编辑的批注 id
    editorImages: [],                   // 编辑页当前日记的图片 id（≤18）
    editorTags: [],                     // 编辑页当前日记的标签 id
    tagFilter: '',                      // 主页列表的标签筛选
    noteImages: []                      // 正在编写/编辑的批注图片 id（≤18）
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
    if (hash.startsWith('#/stats')) return renderStats();
    return renderHome();
  }
  window.addEventListener('hashchange', route);

  /* ---------- 首页：默认近期手账列表，可切到月历 ---------- */
  function renderHome() {
    const entries = DB.getEntries();
    const counts = DB.annotationCountMap();
    const today = DB.todayStr();
    const isCal = state.homeView === 'calendar';
    const filteredEntries = state.tagFilter
      ? entries.filter(e => (e.tags || []).includes(state.tagFilter))
      : entries;

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
              ? `${tagFilterHtml()}
                <div class="list-scroll">
                  ${filteredEntries.slice(0, LIST_LIMIT).map(e => cardHtml(e, counts[e.id] || 0, e.date === today)).join('')}
                  ${filteredEntries.length > LIST_LIMIT
                    ? `<div class="hint pad" style="text-align:center;margin-top:0.75rem">已显示最近 ${LIST_LIMIT} 篇 · 更早的手账请用月历或 🔍 搜索查看</div>`
                    : (state.tagFilter && !filteredEntries.length
                        ? '<div class="hint pad" style="text-align:center;margin-top:0.75rem">该标签下还没有日记</div>'
                        : '')}
                </div>`
              : emptyHtml())}
        <div class="bottom-space"></div>
      </main>
      ${!isCal ? '<button class="to-top" id="toTop" data-action="to-top" aria-label="回到顶部">↑</button>' : ''}
      <button class="fab" data-action="go-write">${icon('edit', 16)}<span>写今天</span></button>
    `;

    if (!isCal) {
      const ls = document.querySelector('.list-scroll');
      const topBtn = document.getElementById('toTop');
      if (ls && topBtn) {
        ls.addEventListener('scroll', () => {
          topBtn.classList.toggle('show', ls.scrollTop > 400);
        });
      }
    }
  }

  function calendarHtml(entries) {
    const y = state.viewYear, m = state.viewMonth;
    const byDate = {};
    entries.forEach(e => { byDate[e.date] = e; });

    const sunFirst = weekStart() === 'sun';
    let offset = new Date(y, m, 1).getDay() - (sunFirst ? 0 : 1);   // 周起始可设置
    if (offset < 0) offset += 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = DB.todayStr();
    const weekLabels = sunFirst ? ['日', '一', '二', '三', '四', '五', '六'] : WEEKDAYS;

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
        <div class="cal-week">${weekLabels.map(w => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  }

  function cardHtml(entry, noteCount, isToday) {
    // 主页选取任何日记（含今天）都进详情页：批注输入栏立即可用；今天的日记从详情页 ✎ 修改正文
    return `
      <article class="card diary-card" data-action="open-entry" data-id="${entry.id}">
        <span class="tape" style="background:${tapeColor(entry.date)}"></span>
        <div class="row">
          <div class="date">${fmtDateCn(entry.date)}<span class="time">${fmtClockShort(entry.createdAt)}</span></div>
          ${isToday ? '<span class="stamp green">今天</span>' : ''}
          <div class="mw">${moodList(entry).map(i => moodIcon(i, 17)).join('')} ${weatherIcon(entry.weather, 17)}</div>
        </div>
        ${entry.title ? `<div class="title">${esc(entry.title)}</div>` : ''}
        <div class="preview">${esc(entry.content)}</div>
        ${(entry.tags || []).length ? `<div class="notes-count">${tagNamesText(entry)}</div>` : ''}
        ${metaBitsHtml(entry, noteCount)}
      </article>`;
  }

  /** 卡片底部小字：批注数 / 图片数 / 位置 */
  function metaBitsHtml(entry, noteCount) {
    const bits = [];
    if (noteCount) bits.push('✎ ' + noteCount + ' 条批注');
    if (entry.images && entry.images.length) bits.push('📷 ' + entry.images.length);
    if (entry.place) bits.push('📍 ' + esc(entry.place));
    return bits.length ? `<div class="notes-count">${bits.join('　')}</div>` : '';
  }

  /** 主页标签筛选行 */
  function tagFilterHtml() {
    const tags = DB.getTags();
    if (!tags.length) return '';
    return `<div class="tag-row filter">
      <button class="tag-chip ${!state.tagFilter ? 'on' : ''}"
              data-action="tag-filter" data-id="">全部</button>
      ${tags.map(t => `
        <button class="tag-chip ${state.tagFilter === t.id ? 'on' : ''}"
                data-action="tag-filter" data-id="${t.id}"
                style="--tagc:${t.color}"># ${esc(t.name)}</button>`).join('')}
    </div>`;
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
    state.draftMoods = moodList(existing).slice();
    state.draft.weather = existing ? existing.weather : 0;
    state.editorImages = existing ? (existing.images || []).slice() : [];
    state.editorTags = existing ? (existing.tags || []).slice() : [];

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
        <div class="label">📍 位置（可选，可被搜索）</div>
        <input id="placeInput" class="input" placeholder="在哪里？"
               value="${esc(existing && existing.place || '')}">
        <div class="label">标签（可多选）</div>
        <div class="tag-row" id="tagRow"></div>
        <div class="label">图片（最多 ${IMG.LIMIT} 张）</div>
        <div class="img-strip" id="imgStrip"></div>
        <input type="file" id="imgInput" accept="image/*" multiple hidden>
        <div class="hint">${hint}</div>
        <button class="primary-btn" data-action="save-today">${btnLabel}</button>
        <div class="bottom-space"></div>
      </main>
    `;
    renderPickers();
    renderEditorTags();
    renderEditorImages();
    document.getElementById('imgInput').addEventListener('change', async ev => {
      const files = Array.from(ev.target.files || []);
      ev.target.value = '';
      if (!files.length) return;
      const room = IMG.LIMIT - state.editorImages.length;
      if (room <= 0) { toast(`最多 ${IMG.LIMIT} 张哦`); return; }
      if (files.length > room) toast(`最多再选 ${room} 张，已自动截取`);
      const ids = await IMG.saveImages(files, room);
      state.editorImages.push(...ids);
      renderEditorImages();
    });
  }

  /** 生成缩略图条 HTML（编辑页/批注共用） */
  async function stripHtml(ids, removeAction, addAction) {
    let html = '';
    for (const id of ids) {
      const u = await IMG.url(id);
      if (!u) continue;
      html += `<div class="img-thumb">
                 <img src="${u}" data-action="preview-img" data-id="${id}" alt="">
                 <button class="img-x" data-action="${removeAction}" data-id="${id}">✕</button>
               </div>`;
    }
    if (ids.length < IMG.LIMIT) {
      html += `<button class="img-add" data-action="${addAction}">＋<small>${ids.length}/${IMG.LIMIT}</small></button>`;
    }
    return html;
  }

  async function renderEditorImages() {
    const strip = document.getElementById('imgStrip');
    if (strip) strip.innerHTML = await stripHtml(state.editorImages, 'remove-img', 'pick-img');
  }

  /** 编辑页标签选择 */
  async function renderEditorTags() {
    const row = document.getElementById('tagRow');
    if (!row) return;
    const tags = DB.getTags();
    if (!tags.length) {
      row.innerHTML = '<div class="hint">还没有标签，可在「设置 → 标签管理」创建</div>';
      return;
    }
    row.innerHTML = tags.map(t => `
      <button class="tag-chip ${state.editorTags.includes(t.id) ? 'on' : ''}"
              data-action="toggle-editor-tag" data-id="${t.id}"
              style="--tagc:${t.color}"># ${esc(t.name)}</button>`).join('');
  }

  /** 只读标签行（详情页） */
  function tagChipsRow(ids) {
    const tags = DB.getTags();
    const chips = ids.map(id => {
      const t = tags.find(x => x.id === id);
      return t ? `<span class="tag-chip static" style="--tagc:${t.color}"># ${esc(t.name)}</span>` : '';
    }).filter(Boolean).join('');
    return chips ? `<div class="tag-row">${chips}</div>` : '';
  }

  /** 卡片小字：#标签名 */
  function tagNamesText(entry) {
    const tags = DB.getTags();
    return (entry.tags || [])
      .map(id => { const t = tags.find(x => x.id === id); return t ? '#' + t.name : ''; })
      .filter(Boolean).join(' ');
  }

  async function renderNoteImages() {
    const editStrip = document.getElementById('noteEditStrip');
    if (editStrip) {
      editStrip.innerHTML = await stripHtml(state.noteImages, 'remove-note-img', 'pick-note-img');
    }
    const compose = document.getElementById('noteStrip');
    if (compose) {
      compose.innerHTML = (state.editingNote || !state.noteImages.length)
        ? ''
        : '<div class="img-strip">' + await stripHtml(state.noteImages, 'remove-note-img', 'pick-note-img') + '</div>';
    }
  }

  function renderPickers() {
    const moodEl = document.getElementById('moodPicker');
    const weatherEl = document.getElementById('weatherPicker');
    if (!moodEl || !weatherEl) return;
    moodEl.innerHTML = MOOD_ICONS.map((_, i) =>
      `<button class="pick ${state.draftMoods.includes(i) ? 'on' : ''}"
               data-action="pick-mood" data-index="${i}" title="${MOOD_LABELS[i]}">${moodIcon(i, 24)}</button>`).join('');
    weatherEl.innerHTML = WEATHER_ICONS.map((_, i) =>
      `<button class="pick ${i === state.draft.weather ? 'on' : ''}"
               data-action="pick-weather" data-index="${i}" title="${WEATHER_LABELS[i]}">${weatherIcon(i, 24)}</button>`).join('');
  }

  function saveToday() {
    const title = document.getElementById('titleInput').value;
    const content = document.getElementById('contentInput').value.trim();
    if (!content) { toast('写点什么再保存吧～'); return; }
    const place = document.getElementById('placeInput');
    const payload = {
      title, content,
      mood: state.draftMoods.slice(),
      weather: state.draft.weather,
      place: place ? place.value : '',
      images: state.editorImages.slice(),
      tags: state.editorTags.slice()
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
        ${isToday ? `
          <button class="icon-btn" data-action="edit-entry" data-id="${id}" aria-label="修改正文">${icon('edit', 20)}</button>
          <button class="icon-btn" data-action="del-entry" data-id="${id}" aria-label="删除日记">${icon('trash', 20)}</button>` : ''}
      </header>
      <main>
        <article class="card diary-card">
          <span class="tape" style="background:${tapeColor(entry.date)}"></span>
          <div class="row">
            <div class="mw">${moodList(entry).map(i => moodIcon(i, 19)).join('')} ${weatherIcon(entry.weather, 19)}</div>
            <div style="flex:1"></div>
            ${isToday
              ? '<span class="stamp green">今天</span>'
              : '<span class="stamp">已封存</span>'}
          </div>
          ${entry.title ? `<div class="title big">${esc(entry.title)}</div>` : ''}
          ${(entry.tags || []).length ? tagChipsRow(entry.tags) : ''}
          ${entry.place ? `<div class="place">📍 ${esc(entry.place)}</div>` : ''}
          <div class="content-full">${esc(entry.content)}</div>
          ${(entry.images || []).length ? '<div class="img-grid" id="detailImgs"></div>' : ''}
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
                    <div id="noteEditStrip"></div>
                    <div class="note-actions">
                      <button class="mini-btn" data-action="save-note" data-id="${n.id}">保存</button>
                      <button class="mini-btn ghost" data-action="cancel-note">取消</button>
                    </div>`
                  : `
                    <div class="note-text" data-action="edit-note" data-id="${n.id}">${esc(n.content)}</div>
                    ${(n.images || []).length ? `<div class="img-grid small" data-note-imgs="${n.id}"></div>` : ''}
                    <div class="note-time">${fmtTime(n.createdAt)}${n.updatedAt ? ' · ' + fmtTime(n.updatedAt) : ''}</div>`}
                </div>
              </div>`).join('')
          : '<div class="hint pad">还没有批注。在下方写下你想补充的话吧～</div>'}
        <div class="bottom-space"></div>
      </main>
      <div class="input-bar">
        <div id="noteStrip"></div>
        <div class="input-row">
          <input id="noteInput" class="input grow" placeholder="写一条批注…">
          <button class="icon-btn" data-action="pick-note-img" aria-label="添加图片">${icon('image', 20)}</button>
          <button class="send-btn" data-action="add-note" data-id="${id}" aria-label="添加批注">${icon('send', 19)}</button>
        </div>
        <input type="file" id="noteImgInput" accept="image/*" multiple hidden>
      </div>
    `;

    const inp = document.getElementById('noteInput');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') addNote(id);
    });

    document.getElementById('noteImgInput').addEventListener('change', async ev => {
      const files = Array.from(ev.target.files || []);
      ev.target.value = '';
      if (!files.length) return;
      const room = IMG.LIMIT - state.noteImages.length;
      if (room <= 0) { toast(`最多 ${IMG.LIMIT} 张哦`); return; }
      if (files.length > room) toast(`最多再选 ${room} 张，已自动截取`);
      const ids = await IMG.saveImages(files, room);
      state.noteImages.push(...ids);
      renderNoteImages();
    });

    fillDetailImages(entry);
    renderNoteImages();
    fillNoteImages();
  }

  /** 异步填充详情页图片网格 */
  async function fillDetailImages(entry) {
    const grid = document.getElementById('detailImgs');
    if (!grid) return;
    let html = '';
    for (const imgId of (entry.images || [])) {
      const u = await IMG.url(imgId);
      if (u) html += `<img src="${u}" data-action="preview-img" data-id="${imgId}" alt="">`;
    }
    grid.innerHTML = html;
  }

  /** 异步填充批注卡片里的图片 */
  async function fillNoteImages() {
    const grids = document.querySelectorAll('[data-note-imgs]');
    for (const grid of grids) {
      const note = DB.getAnnotations(grid.getAttribute('data-note-imgs'))[0];
      if (!note) continue;
      let html = '';
      for (const imgId of (note.images || [])) {
        const u = await IMG.url(imgId);
        if (u) html += `<img src="${u}" data-action="preview-img" data-id="${imgId}" alt="">`;
      }
      grid.innerHTML = html;
    }
  }

  function addNote(entryId) {
    const inp = document.getElementById('noteInput');
    const text = (inp && inp.value || '').trim();
    if (!text && !state.noteImages.length) { toast('写点什么或选张图片吧～'); return; }
    DB.addAnnotation(entryId, text || '📷', state.noteImages.slice());
    state.noteImages = [];
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
      <main>
        <select id="monthFilter" class="input month-filter">
          <option value="">全部月份</option>
          ${[...new Set(DB.getEntries().map(e => e.date.slice(0, 7)))]
            .sort().reverse()
            .map(mo => `<option value="${mo}" ${state.searchMonth === mo ? 'selected' : ''}>${mo.replace('-', ' 年 ')} 月</option>`)
            .join('')}
        </select>
        <div id="searchResults"></div>
      </main>
    `;
    const inp = document.getElementById('searchInput');
    inp.value = state.searchQ;
    inp.focus();
    inp.addEventListener('input', () => {
      state.searchQ = inp.value;
      renderResults();
    });
    document.getElementById('monthFilter').addEventListener('change', ev => {
      state.searchMonth = ev.target.value;
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
    const results = DB.search(q)
      .filter(r => !state.searchMonth || r.entry.date.startsWith(state.searchMonth));
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
            <div class="mw">${moodList(r.entry).map(i => moodIcon(i, 17)).join('')} ${weatherIcon(r.entry.weather, 17)}</div>
          </div>
          ${r.entry.title ? `<div class="title">${highlight(r.entry.title, q)}</div>` : ''}
          <div class="preview">${snippetFor(r, q)}</div>
          <div class="notes-count">${resultMeta(r)}</div>
        </article>`).join('')}
    `;
  }

  /* ---------- 设置页：备份 / 偏好 / 维护 ---------- */
  function renderSettings() {
    const entries = DB.getEntries();
    const totalNotes = Object.values(DB.annotationCountMap()).reduce((a, b) => a + b, 0);
    const themeNames = { auto: '跟随系统', light: '浅色', dark: '深色' };
    const reminder = reminderSetting();

    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div>
          <div class="page-title">设置</div>
          <div class="sub">${entries.length} 篇日记 · ${totalNotes} 条批注</div>
        </div>
      </header>
      <main>
        <div class="section-title">数据备份</div>
        <article class="card diary-card">
          <span class="tape" style="background:${tapeColor('backup')}"></span>
          <div class="hint" style="margin-top:6px">所有数据只保存在本设备。换手机、重装或清除数据前，请先导出备份（含图片）。</div>
          <button class="primary-btn" data-action="export-data" style="margin-top:14px">${icon('down', 16)}<span>一键导出全部数据</span></button>
          <button class="ghost-btn" data-action="import-data">${icon('up', 16)}<span>一键导入全部数据</span></button>
          <input type="file" id="importFile" accept=".json,application/json" hidden>
          <div class="hint" style="margin-top:12px">⚠️ 导入会覆盖当前设备上的全部日记和批注。</div>
          <button class="ghost-btn" data-action="export-text">${icon('down', 16)}<span>导出纯文本长文</span></button>
        </article>

        <div class="section-title pad">标签管理</div>
        <article class="card diary-card">
          <div id="tagManageList">${tagManageHtml()}</div>
          <div class="set-row" style="margin-top:0.5rem">
            <input id="newTagInput" class="input" placeholder="新标签名称，如：工作" style="flex:1;margin-top:0">
            <button class="mini-btn" data-action="add-tag">添加</button>
          </div>
          <div class="hint">标签可自由创建、改名、删除；删除会从所有日记上摘除，日记本身不受影响。</div>
        </article>

        <div class="section-title pad">偏好</div>
        <article class="card diary-card">
          <div class="set-row">
            <span>主题 · ${themeNames[themeSetting()]}</span>
            <button class="mini-btn" data-action="cycle-theme">切换</button>
          </div>
          <div class="set-row">
            <span>一周从${weekStart() === 'mon' ? '周一' : '周日'}开始</span>
            <button class="mini-btn ghost" data-action="cycle-weekstart">切换</button>
          </div>
          <div class="set-row">
            <span>每日提醒 · ${reminder.enabled ? '已开启' : '已关闭'}</span>
            <input type="time" id="reminderTime" class="input time-input" value="${reminder.time}">
            <button class="mini-btn ${reminder.enabled ? '' : 'ghost'}" data-action="toggle-reminder">${reminder.enabled ? '关闭' : '开启'}</button>
          </div>
          <div class="hint">提醒需在 APP 内使用；浏览器中设置不生效。</div>
        </article>

        <div class="section-title pad">维护</div>
        <article class="card diary-card">
          <div class="set-row">
            <span>写作统计</span>
            <button class="mini-btn" data-action="go-stats">进入</button>
          </div>
          <div class="set-row">
            <span>清理未引用图片</span>
            <button class="mini-btn ghost" data-action="cleanup-images">清理</button>
          </div>
        </article>
        <div class="bottom-space"></div>
      </main>
    `;

    document.getElementById('importFile').addEventListener('change', ev => {
      const file = ev.target.files[0];
      if (file) importData(file);
      ev.target.value = '';
    });
    document.getElementById('reminderTime').addEventListener('change', ev => {
      const r = reminderSetting();
      r.time = ev.target.value || r.time;
      localStorage.setItem('shiguang.reminder', JSON.stringify(r));
      if (r.enabled) { applyReminder(); toast(`提醒时间已改为 ${r.time}`); }
    });
    const newTagInput = document.getElementById('newTagInput');
    newTagInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        const name = newTagInput.value;
        if (!name.trim()) { toast('先输入标签名称'); return; }
        DB.addTag(name);
        toast('标签已添加 🏷');
        renderSettings();
      }
    });
  }

  function tagManageHtml() {
    const tags = DB.getTags();
    if (!tags.length) return '<div class="hint">还没有标签，在下方添加第一个吧～</div>';
    return tags.map(t => `
      <div class="set-row">
        <span><span class="tag-dot" style="background:${t.color}"></span># ${esc(t.name)}</span>
        <button class="mini-btn ghost" data-action="rename-tag" data-id="${t.id}">改名</button>
        <button class="mini-btn ghost" data-action="delete-tag" data-id="${t.id}">删除</button>
      </div>`).join('');
  }

  /* ---------- 写作统计 ---------- */
  function renderStats() {
    const entries = DB.getEntries();
    const totalNotes = Object.values(DB.annotationCountMap()).reduce((a, b) => a + b, 0);
    const totalChars = entries.reduce((s, e) => s + (e.content || '').length, 0);
    const totalImgs = entries.reduce((s, e) => s + (e.images || []).length, 0);
    const days = new Set(entries.map(e => e.date));

    // 连续天数：从今天（或昨天）往前数
    const shift = ds => {
      const dt = new Date(ds + 'T00:00:00');
      dt.setDate(dt.getDate() - 1);
      const p = n => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    };
    const today = DB.todayStr();
    let cursor = days.has(today) ? today : shift(today);
    let streak = 0;
    while (days.has(cursor)) { streak++; cursor = shift(cursor); }

    const moodDist = {};
    entries.forEach(e => moodList(e).forEach(i => { moodDist[i] = (moodDist[i] || 0) + 1; }));
    const weatherDist = {};
    entries.forEach(e => { weatherDist[e.weather] = (weatherDist[e.weather] || 0) + 1; });
    const moodMax = Math.max(1, ...Object.values(moodDist));
    const weatherMax = Math.max(1, ...Object.values(weatherDist));

    $app.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-action="back" aria-label="返回">${icon('back', 21)}</button>
        <div>
          <div class="page-title">写作统计</div>
          <div class="sub">所有数据一目了然</div>
        </div>
      </header>
      <main>
        <div class="stat-grid">
          <div class="card stat-card"><div class="stat-num">${streak}</div><div class="stat-label">连续天数 🔥</div></div>
          <div class="card stat-card"><div class="stat-num">${entries.length}</div><div class="stat-label">日记总篇数</div></div>
          <div class="card stat-card"><div class="stat-num">${totalChars}</div><div class="stat-label">累计字数</div></div>
          <div class="card stat-card"><div class="stat-num">${days.size}</div><div class="stat-label">写作天数</div></div>
          <div class="card stat-card"><div class="stat-num">${totalNotes}</div><div class="stat-label">批注条数</div></div>
          <div class="card stat-card"><div class="stat-num">${totalImgs}</div><div class="stat-label">图片张数</div></div>
        </div>
        <div class="section-title pad">心情分布</div>
        ${Object.keys(moodDist).length
          ? Object.entries(moodDist).sort((a, b) => b[1] - a[1]).map(([i, c]) => `
              <div class="bar-row">
                <span class="bar-emoji">${moodIcon(+i, 20)}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c / moodMax * 100)}%"></div></div>
                <span class="bar-count">${c}</span>
              </div>`).join('')
          : '<div class="hint pad">还没有数据</div>'}
        <div class="section-title pad">天气分布</div>
        ${Object.keys(weatherDist).length
          ? Object.entries(weatherDist).sort((a, b) => b[1] - a[1]).map(([i, c]) => `
              <div class="bar-row">
                <span class="bar-emoji">${weatherIcon(+i, 20)}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c / weatherMax * 100)}%"></div></div>
                <span class="bar-count">${c}</span>
              </div>`).join('')
          : '<div class="hint pad">还没有数据</div>'}
        <div class="bottom-space"></div>
      </main>`;
  }

  async function exportData() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const name = `拾光手账备份-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
    toast('正在打包备份（含图片）…');
    const data = await DB.exportAll();

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

  /** 通用文本保存：APP 走原生桥，浏览器走下载 */
  async function saveTextFile(name, content) {
    if (window.AppBridge && typeof window.AppBridge.saveFile === 'function') {
      window.AppBridge.saveFile(name, content);
      toast('已保存到「下载」📦');
      return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('文件已导出 📦');
  }

  /** 导出纯文本长文（按日期分组，含批注） */
  async function exportText() {
    const entries = DB.getEntries();
    if (!entries.length) { toast('还没有日记可导出'); return; }
    let out = '拾光手账\n';
    let lastDate = '';
    for (const e of entries) {
      if (e.date !== lastDate) { out += `\n━━━ ${e.date} ━━━\n`; lastDate = e.date; }
      const moods = moodList(e).map(i => MOOD_LABELS[i]).filter(Boolean).join('、');
      out += `\n[${fmtTime(e.createdAt)}] ${moods || '—'} · ${WEATHER_LABELS[e.weather] || '—'}${e.place ? ' · 📍' + e.place : ''}\n`;
      if (e.title) out += e.title + '\n';
      out += e.content + '\n';
      DB.getAnnotations(e.id).forEach(n => {
        out += `  └ 批注(${fmtTime(n.createdAt)})：${n.content}\n`;
      });
    }
    await saveTextFile(`拾光手账文本-${DB.todayStr()}.txt`, out);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let ok = false;
      try {
        ok = Array.isArray(JSON.parse(reader.result).entries);
      } catch (e) { ok = false; }
      if (!ok) { toast('备份文件格式不正确 ⚠️'); return; }
      if (!confirm('导入将覆盖当前设备上的全部日记和批注，确定继续？')) return;
      try {
        await DB.importAll(reader.result);
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
      case 'go-stats':      location.hash = '#/stats'; break;
      case 'export-text':   exportText(); break;
      case 'to-top': {
        const ls = document.querySelector('.list-scroll');
        if (ls) ls.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      }
      case 'cycle-theme': {
        const order = ['auto', 'light', 'dark'];
        const next = order[(order.indexOf(themeSetting()) + 1) % 3];
        localStorage.setItem('shiguang.theme', next);
        applyTheme();
        toast('主题：' + ({ auto: '跟随系统', light: '浅色', dark: '深色' })[next]);
        renderSettings();
        break;
      }
      case 'cycle-weekstart':
        localStorage.setItem('shiguang.weekStart', weekStart() === 'mon' ? 'sun' : 'mon');
        toast(weekStart() === 'sun' ? '一周从周日开始' : '一周从周一开始');
        renderSettings();
        break;
      case 'toggle-reminder': {
        const timeInput = document.getElementById('reminderTime');
        const r = reminderSetting();
        r.time = (timeInput && timeInput.value) || r.time;
        r.enabled = !r.enabled;
        localStorage.setItem('shiguang.reminder', JSON.stringify(r));
        applyReminder();
        toast(r.enabled ? `每天 ${r.time} 提醒你写手账 ⏰` : '已关闭提醒');
        renderSettings();
        break;
      }
      case 'cleanup-images': {
        const ref = new Set();
        DB.getEntries().forEach(e => (e.images || []).forEach(i => ref.add(i)));
        DB.getEntries().forEach(e => DB.getAnnotations(e.id)
          .forEach(n => (n.images || []).forEach(i => ref.add(i))));
        IMG.cleanup(ref).then(n =>
          toast(n ? `已清理 ${n} 张未引用图片 🧹` : '没有需要清理的图片 ✨'));
        break;
      }
      case 'del-entry':
        if (confirm('删除这篇日记？其批注会一并删除，不可恢复。')) {
          if (DB.deleteEntry(el.dataset.id)) {
            toast('已删除');
            location.hash = '#/';
          } else {
            toast('只有今天的日记可以删除');
          }
        }
        break;
      case 'export-data':   exportData(); break;
      case 'import-data':   document.getElementById('importFile').click(); break;
      case 'open-entry':    location.hash = '#/entry/' + encodeURIComponent(el.dataset.id); break;
      case 'pick-img':      document.getElementById('imgInput').click(); break;
      case 'remove-img':
        state.editorImages = state.editorImages.filter(x => x !== el.dataset.id);
        renderEditorImages();
        break;
      case 'pick-note-img': document.getElementById('noteImgInput').click(); break;
      case 'remove-note-img':
        state.noteImages = state.noteImages.filter(x => x !== el.dataset.id);
        renderNoteImages();
        break;
      case 'preview-img':
        IMG.url(el.dataset.id).then(u => {
          if (!u) return;
          document.getElementById('lightboxImg').src = u;
          document.getElementById('lightbox').classList.add('show');
        });
        break;
      case 'close-lightbox':
        document.getElementById('lightbox').classList.remove('show');
        break;
      case 'edit-entry':    location.hash = '#/edit/' + encodeURIComponent(el.dataset.id); break;
      case 'go-backfill':   location.hash = '#/write/' + el.dataset.date; break;
      case 'add-tag': {
        const inp = document.getElementById('newTagInput');
        const name = inp ? inp.value : '';
        if (!name.trim()) { toast('先输入标签名称'); return; }
        DB.addTag(name);
        toast('标签已添加 🏷');
        renderSettings();
        break;
      }
      case 'rename-tag': {
        const t = DB.getTags().find(x => x.id === el.dataset.id);
        const name = t ? prompt('修改标签名', t.name) : null;
        if (name && name.trim()) {
          DB.renameTag(el.dataset.id, name);
          renderSettings();
        }
        break;
      }
      case 'delete-tag':
        if (confirm('删除该标签？会从所有日记上摘除（日记本身不受影响）。')) {
          DB.deleteTag(el.dataset.id);
          renderSettings();
        }
        break;
      case 'toggle-editor-tag': {
        const tid = el.dataset.id;
        const pos = state.editorTags.indexOf(tid);
        if (pos >= 0) state.editorTags.splice(pos, 1);
        else state.editorTags.push(tid);
        renderEditorTags();
        break;
      }
      case 'tag-filter':
        state.tagFilter = state.tagFilter === el.dataset.id ? '' : el.dataset.id;
        renderHome();
        break;
      case 'edit-note': {
        const note = DB.getAnnotation(el.dataset.id);
        state.editingNote = el.dataset.id;
        state.noteImages = note ? (note.images || []).slice() : [];
        route();
        break;
      }
      case 'cancel-note':
        state.editingNote = null;
        state.noteImages = [];
        route();
        break;
      case 'save-note': {
        const ta = document.getElementById('noteEditInput');
        const text = (ta && ta.value || '').trim();
        if (!text && !state.noteImages.length) { toast('批注内容不能为空'); return; }
        DB.updateAnnotation(el.dataset.id, text || '📷', state.noteImages.slice());
        state.editingNote = null;
        state.noteImages = [];
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
      case 'pick-mood': {
        const i = +el.dataset.index;
        const pos = state.draftMoods.indexOf(i);
        if (pos >= 0) state.draftMoods.splice(pos, 1);
        else state.draftMoods.push(i);
        renderPickers();
        break;
      }
      case 'pick-weather':
        state.draft.weather = +el.dataset.index;
        renderPickers();
        break;
      case 'save-today':  saveToday(); break;
      case 'add-note':    addNote(el.dataset.id); break;
    }
  });

  /* ---------- 启动 ---------- */
  applyTheme();
  applyReminder();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) {
      mq.addEventListener('change', () => { if (themeSetting() === 'auto') applyTheme(); });
    }
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  route();
})();

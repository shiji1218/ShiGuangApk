/* ========== 数据层：localStorage ========== */
const DB = (() => {
  'use strict';

  const ENTRIES_KEY = 'shiguang.entries';
  const NOTES_KEY = 'shiguang.annotations';

  function read(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  return {
    /** 本地时区的今天，yyyy-MM-dd */
    todayStr() {
      const d = new Date();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },

    /** 全部日记：日期倒序，同日按写作时间倒序 */
    getEntries() {
      return read(ENTRIES_KEY, []).slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    },

    getEntryByDate(date) {
      return read(ENTRIES_KEY, []).find(e => e.date === date) || null;
    },

    getEntryById(id) {
      return read(ENTRIES_KEY, []).find(e => e.id === id) || null;
    },

    /**
     * 新建一篇日记（核心规则落点）：
     * - 未来日期：拒绝，返回 null
     * - 当天 / 过去（补写）：均允许新建，一天可多篇
     */
    saveNew(date, { title, content, mood, weather }) {
      const today = this.todayStr();
      if (date > today) return null;
      const entries = read(ENTRIES_KEY, []);
      const now = Date.now();
      const id = 'e' + now + Math.random().toString(36).slice(2, 5);
      entries.push({
        id, date,
        title: title.trim(),
        content: content.trim(),
        mood, weather,
        createdAt: now, updatedAt: now
      });
      write(ENTRIES_KEY, entries);
      return id;
    },

    /**
     * 修改日记：仅「今天」的日记允许修改；
     * 历史日记已封存——不做任何改动，原样返回其 id。
     */
    updateEntry(id, { title, content, mood, weather }) {
      const entries = read(ENTRIES_KEY, []);
      const e = entries.find(x => x.id === id);
      if (!e) return null;
      if (e.date !== this.todayStr()) return e.id;   // 已封存，原样返回
      Object.assign(e, {
        title: title.trim(),
        content: content.trim(),
        mood, weather, updatedAt: Date.now()
      });
      write(ENTRIES_KEY, entries);
      return e.id;
    },

    /** 某天的全部日记，按写作时间正序 */
    getEntriesByDate(date) {
      return read(ENTRIES_KEY, [])
        .filter(e => e.date === date)
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    /** 修改批注：随时可改，记录最后修改时间 */
    updateAnnotation(id, content) {
      const notes = read(NOTES_KEY, []);
      const n = notes.find(x => x.id === id);
      if (!n) return;
      n.content = content.trim();
      n.updatedAt = Date.now();
      write(NOTES_KEY, notes);
    },

    getAnnotations(entryId) {
      return read(NOTES_KEY, [])
        .filter(a => a.entryId === entryId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    /** 每篇日记的批注数，key = 日记 id */
    annotationCountMap() {
      const map = {};
      read(NOTES_KEY, []).forEach(a => {
        map[a.entryId] = (map[a.entryId] || 0) + 1;
      });
      return map;
    },

    addAnnotation(entryId, content) {
      const text = content.trim();
      if (!text) return;
      const notes = read(NOTES_KEY, []);
      notes.push({
        id: 'a' + Date.now() + Math.random().toString(36).slice(2, 6),
        entryId,
        content: text,
        createdAt: Date.now()
      });
      write(NOTES_KEY, notes);
    },

    deleteAnnotation(id) {
      write(NOTES_KEY, read(NOTES_KEY, []).filter(a => a.id !== id));
    },

    /**
     * 搜索：匹配标题、正文、批注内容（不区分大小写）。
     * 返回 [{ entry, hitNoteCount, hitInEntry }]
     */
    search(keyword) {
      const q = keyword.trim().toLowerCase();
      if (!q) return [];
      return this.getEntries().map(entry => {
        const notes = this.getAnnotations(entry.id);
        const hitNotes = notes.filter(n => n.content.toLowerCase().includes(q));
        const hitInEntry =
          (entry.title || '').toLowerCase().includes(q) ||
          entry.content.toLowerCase().includes(q);
        if (!hitInEntry && hitNotes.length === 0) return null;
        return { entry, hitNoteCount: hitNotes.length, hitInEntry };
      }).filter(Boolean);
    },

    /** 导出全部数据（JSON 字符串），用于备份 */
    exportAll() {
      return JSON.stringify({
        version: 1,
        exportedAt: Date.now(),
        entries: read(ENTRIES_KEY, []),
        annotations: read(NOTES_KEY, [])
      }, null, 2);
    },

    /** 从备份 JSON 恢复 */
    importAll(jsonText) {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data.entries)) throw new Error('格式不正确');
      write(ENTRIES_KEY, data.entries);
      write(NOTES_KEY, Array.isArray(data.annotations) ? data.annotations : []);
    }
  };
})();

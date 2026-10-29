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
     * - place：位置（可搜索）；images：图片 id 数组（最多 18）
     */
    saveNew(date, { title, content, mood, weather, place, images }) {
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
        place: (place || '').trim(),
        images: images || [],
        createdAt: now, updatedAt: now
      });
      write(ENTRIES_KEY, entries);
      return id;
    },

    /**
     * 修改日记：仅「今天」的日记允许修改；
     * 历史日记已封存——不做任何改动，原样返回其 id。
     */
    updateEntry(id, { title, content, mood, weather, place, images }) {
      const entries = read(ENTRIES_KEY, []);
      const e = entries.find(x => x.id === id);
      if (!e) return null;
      if (e.date !== this.todayStr()) return e.id;   // 已封存，原样返回
      Object.assign(e, {
        title: title.trim(),
        content: content.trim(),
        mood, weather,
        place: (place || '').trim(),
        images: images || [],
        updatedAt: Date.now()
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

    /** 修改批注：随时可改（含图片），记录最后修改时间 */
    updateAnnotation(id, content, images) {
      const notes = read(NOTES_KEY, []);
      const n = notes.find(x => x.id === id);
      if (!n) return;
      n.content = content.trim();
      if (images) n.images = images;
      n.updatedAt = Date.now();
      write(NOTES_KEY, notes);
    },

    getAnnotations(entryId) {
      return read(NOTES_KEY, [])
        .filter(a => a.entryId === entryId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    getAnnotation(id) {
      return read(NOTES_KEY, []).find(a => a.id === id) || null;
    },

    /** 每篇日记的批注数，key = 日记 id */
    annotationCountMap() {
      const map = {};
      read(NOTES_KEY, []).forEach(a => {
        map[a.entryId] = (map[a.entryId] || 0) + 1;
      });
      return map;
    },

    addAnnotation(entryId, content, images) {
      const text = content.trim();
      if (!text) return;
      const notes = read(NOTES_KEY, []);
      notes.push({
        id: 'a' + Date.now() + Math.random().toString(36).slice(2, 6),
        entryId,
        content: text,
        images: images || [],
        createdAt: Date.now()
      });
      write(NOTES_KEY, notes);
    },

    deleteAnnotation(id) {
      write(NOTES_KEY, read(NOTES_KEY, []).filter(a => a.id !== id));
    },

    /**
     * 搜索：支持「+」多关键词 AND 匹配，
     * 范围：标题、正文、位置、批注内容（不区分大小写）。
     * 例：「好玩+烤鱼」= 四个范围内同时包含两个词的日记。
     * 返回 [{ entry, hitNoteCount, hitInEntry, hitNotes }]
     */
    search(keyword) {
      const terms = keyword.split('+').map(t => t.trim().toLowerCase()).filter(Boolean);
      if (!terms.length) return [];

      return this.getEntries().map(entry => {
        const notes = this.getAnnotations(entry.id);
        const entryHay = [
          entry.title || '',
          entry.content || '',
          entry.place || ''
        ].join('\n').toLowerCase();
        const notesHay = notes.map(n => n.content.toLowerCase());

        // 每个关键词都要在（标题/正文/位置/批注）范围内命中
        const allHit = terms.every(t =>
          entryHay.includes(t) || notesHay.some(c => c.includes(t)));
        if (!allHit) return null;

        const hitInEntry = terms.every(t => entryHay.includes(t));
        const hitNotes = notes.filter(n =>
          terms.some(t => n.content.toLowerCase().includes(t)));
        const hitNoteCount = hitNotes.reduce((sum, n) =>
          sum + terms.filter(t => n.content.toLowerCase().includes(t)).length, 0);

        return { entry, hitNoteCount, hitInEntry, hitNotes };
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

    /** 从备份 JSON 恢复（v2 含图片，异步写入 IndexedDB） */
    async importAll(jsonText) {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data.entries)) throw new Error('格式不正确');
      write(ENTRIES_KEY, data.entries);
      write(NOTES_KEY, Array.isArray(data.annotations) ? data.annotations : []);
      if (Array.isArray(data.images)) {
        for (const img of data.images) {
          if (img && img.id && img.data) {
            await IMG.importDataUrl(img.id, img.data);
          }
        }
      }
    }
  };
})();

/* ========== 图片存储：IndexedDB 存 Blob（写入前压缩，最多 18 张/条目） ========== */
const IMG = (() => {
  'use strict';

  let dbPromise = null;
  const urlCache = {};

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const req = indexedDB.open('shiguang-files', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('images');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    }
    return dbPromise;
  }

  function put(id, blob) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction('images', 'readwrite');
      t.objectStore('images').put(blob, id);
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
    }));
  }

  function get(id) {
    return open().then(db => new Promise((res, rej) => {
      const r = db.transaction('images').objectStore('images').get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    }));
  }

  function all() {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction('images');
      const keysReq = t.objectStore('images').getAllKeys();
      const valsReq = t.objectStore('images').getAll();
      t.oncomplete = () => res({ keys: keysReq.result, values: valsReq.result });
      t.onerror = () => rej(t.error);
    }));
  }

  /** 长边压到 1600px、JPEG 85%，减小存储体积 */
  function compress(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => resolve(b || file), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /** 保存一组图片文件，最多 room 张；返回图片 id 数组 */
  async function saveImages(files, room) {
    const ids = [];
    for (const f of Array.from(files || [])) {
      if (ids.length >= room) break;
      if (!f.type || !f.type.startsWith('image/')) continue;
      const blob = await compress(f);
      const id = 'i' + Date.now() + Math.random().toString(36).slice(2, 6);
      await put(id, blob);
      ids.push(id);
    }
    return ids;
  }

  /** 取图片的对象 URL（带缓存） */
  async function url(id) {
    if (urlCache[id]) return urlCache[id];
    const blob = await get(id);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    urlCache[id] = u;
    return u;
  }

  function toDataUrl(blob) {
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  function dataURLtoBlob(dataUrl) {
    try {
      const head = dataUrl.slice(0, dataUrl.indexOf(','));
      const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
      const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  /** 导出：全部图片转 dataURL */
  async function exportDataUrls() {
    const { keys, values } = await all();
    const out = [];
    for (let i = 0; i < keys.length; i++) {
      if (!values[i]) continue;
      out.push({ id: keys[i], data: await toDataUrl(values[i]) });
    }
    return out;
  }

  async function importDataUrl(id, dataUrl) {
    const blob = dataURLtoBlob(dataUrl);
    if (blob) await put(id, blob);
  }

  return { LIMIT: 18, saveImages, url, exportDataUrls, importDataUrl };
})();

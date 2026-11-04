// Sunucu ile konuşma. İnternet yokken kayıt işlemleri telefonda (IndexedDB) bekler,
// bağlantı gelince sırayla gönderilir.

export class ApiError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const DB_NAME = 'yks-takip', STORE = 'kuyruk';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function qAdd(item) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).add(item);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function qAll() {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function qDel(id) {
  const db = await idb();
  return new Promise((res) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(id);
    t.oncomplete = res;
  });
}

async function raw(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url, opt);
  if (!r.ok) {
    let msg = 'Bir hata oluştu';
    try { const j = await r.json(); msg = typeof j.detail === 'string' ? j.detail : (j.detail?.[0]?.msg || msg); } catch {}
    throw new ApiError(r.status, msg);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function call(method, url, body) {
  try {
    return await raw(method, url, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !url.endsWith('/giris')) onUnauthorized();
    throw e;
  }
}

export const api = {
  get: (u) => call('GET', u),
  post: (u, b) => call('POST', u, b ?? {}),
  put: (u, b) => call('PUT', u, b ?? {}),
  patch: (u, b) => call('PATCH', u, b ?? {}),
  del: (u) => call('DELETE', u),
  /** Kayıt işlemi; internet yoksa kuyruğa alır ve {queued:true} döner. */
  async save(method, url, body) {
    try {
      return await call(method, url, body);
    } catch (e) {
      if (e instanceof ApiError) throw e;      // sunucu cevap verdi: gerçek hata
      await qAdd({ method, url, body, at: Date.now() });
      updateOfflineBar();
      return { queued: true };
    }
  },
};

export async function pendingCount() {
  try { return (await qAll()).length; } catch { return 0; }
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of await qAll()) {
      try {
        await raw(item.method, item.url, item.body);
        await qDel(item.id); sent++;
      } catch (e) {
        if (e instanceof ApiError) { await qDel(item.id); continue; } // sunucu reddetti: atla
        break; // hâlâ internet yok
      }
    }
  } finally { flushing = false; updateOfflineBar(); }
  return sent;
}

export async function updateOfflineBar() {
  const bar = document.getElementById('offline');
  if (!bar) return;
  const n = await pendingCount();
  bar.hidden = navigator.onLine && n === 0;
  bar.textContent = navigator.onLine
    ? `${n} kayıt gönderilmeyi bekliyor…`
    : (n ? `İnternet yok · ${n} kayıt telefonda bekliyor, bağlanınca gönderilecek` : 'İnternet yok · girdiklerin telefonda bekleyecek');
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

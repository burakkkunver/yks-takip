import { api, flushQueue, setUnauthorizedHandler, updateOfflineBar } from './api.js';
import { $, bind, html, toast } from './ui.js';
import * as student from './student.js';
import * as mistake from './mistake.js';
import * as exam from './exam.js';
import * as history from './history.js';
import * as coach from './coach.js';

export const ctx = {
  user: null,
  meta: null,
  go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  async reloadMeta() { ctx.meta = await api.get('/api/meta'); return ctx.meta; },
  subject(id) { return ctx.meta.subjects.find((s) => s.id === id); },
  subjectByCode(code) { return ctx.meta.subjects.find((s) => s.code === code); },
  topicName(id) {
    for (const s of ctx.meta.subjects) for (const t of s.topics) {
      if (t.id === id) return t.name;
      for (const c of t.children) if (c.id === id) return `${t.name} › ${c.name}`;
    }
    return '';
  },
  isStudent() { return ctx.user?.role === 'ogrenci'; },
};

const STUDENT_NAV = [
  ['#/', '🏠', 'Bugün'], ['#/defter', '📕', 'Defter'], ['#/deneme', '📈', 'Deneme'], ['#/gecmis', '🔗', 'Geçmiş'],
];
const COACH_NAV = [
  ['#/', '📊', 'Özet'], ['#/program', '🗓️', 'Program'], ['#/konular', '🧭', 'Konular'],
  ['#/deneme', '📈', 'Deneme'], ['#/gecmis', '🔗', 'Geçmiş'],
];

const ROUTES = {
  ogrenci: {
    '': student.home, 'hata-ekle': mistake.addFlow, 'defter': mistake.notebook, 'hata': mistake.detail,
    'deneme': exam.list, 'deneme-ekle': exam.add, 'deneme-detay': exam.detail,
    'gecmis': history.calendar, 'gun': history.day, 'gorev-ekle': student.addTask,
  },
  takipci: {
    '': coach.summary, 'program': coach.program, 'konular': coach.topics, 'defter': mistake.notebook,
    'hata': mistake.detail, 'deneme': exam.list, 'deneme-detay': exam.detail,
    'gecmis': history.calendar, 'gun': history.day,
  },
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/');
  return { name: name || '', args: rest, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function renderNav(name) {
  const nav = $('#nav');
  const items = ctx.user.role === 'ogrenci' ? STUDENT_NAV : COACH_NAV;
  nav.hidden = false;
  const active = { 'hata-ekle': '#/', 'gorev-ekle': '#/', hata: '#/defter', 'deneme-ekle': '#/deneme', 'deneme-detay': '#/deneme', gun: '#/gecmis' }[name]
    || `#/${name}`;
  nav.innerHTML = html`<div class="nav-inner">${items.map(([href, ic, label]) =>
    html`<a href="${href}" class="${href === active ? 'on' : ''}"><span class="ic" aria-hidden="true">${ic}</span>${label}</a>`)}</div>`.s;
}

let renderSeq = 0;
export async function route() {
  if (!ctx.user) return;
  const { name, args, query } = parseHash();
  const view = ROUTES[ctx.user.role][name] || ROUTES[ctx.user.role][''];
  renderNav(name);
  const el = $('#app');
  const seq = ++renderSeq;
  try {
    await view(el, { args, query, isCurrent: () => seq === renderSeq });
  } catch (e) {
    if (seq !== renderSeq) return;
    el.innerHTML = html`<div class="card alert"><b>Yüklenemedi.</b><div class="small">${e.message}</div>
      <button class="btn block" style="margin-top:10px" data-act="retry">Tekrar dene</button></div>`.s;
    bind(el, { retry: route });
  }
  window.scrollTo(0, 0);
}

function loginView() {
  $('#nav').hidden = true;
  const el = $('#app');
  el.innerHTML = html`<form class="login card" id="login">
    <div class="logo" aria-hidden="true">📚</div>
    <h1 class="center">YKS Takip</h1>
    <p class="center muted small">Yanlışları kapat, zinciri kırma.</p>
    <label class="field"><span>Kullanıcı adı</span><input class="input" name="u" autocomplete="username" autocapitalize="none" required></label>
    <label class="field"><span>Şifre</span><input class="input" name="p" type="password" autocomplete="current-password" required></label>
    <div class="err" id="err" hidden></div>
    <button class="btn primary block big" style="margin-top:16px">Giriş yap</button>
  </form>`.s;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      ctx.user = await api.post('/api/giris', { username: f.u.value.trim(), password: f.p.value });
      await start();
    } catch (err) {
      const box = $('#err'); box.hidden = false; box.textContent = err.message;
    }
  };
}

export async function logout() {
  try { await api.post('/api/cikis'); } catch {}
  ctx.user = null;
  location.hash = '';
  loginView();
}

async function start() {
  await ctx.reloadMeta();
  document.title = ctx.user.role === 'ogrenci' ? 'YKS Takip' : 'YKS Takip · Takipçi';
  window.onhashchange = route;
  await route();
}

async function boot() {
  setUnauthorizedHandler(() => { ctx.user = null; loginView(); });
  window.addEventListener('online', async () => {
    const n = await flushQueue();
    if (n) { toast(`${n} bekleyen kayıt gönderildi`); route(); }
    updateOfflineBar();
  });
  window.addEventListener('offline', updateOfflineBar);
  updateOfflineBar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    ctx.user = await api.get('/api/ben');
  } catch {
    return loginView();
  }
  flushQueue().then((n) => { if (n) { toast(`${n} bekleyen kayıt gönderildi`); route(); } });
  await start();
}

boot();

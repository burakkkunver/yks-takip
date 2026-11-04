// Küçük arayüz yardımcıları: güvenli HTML şablonu, bildirim, alt sayfa, fotoğraf küçültme, tarih biçimleri.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

/** html`...${değer}...` — değerler otomatik kaçışlanır; dizi ve raw() olduğu gibi eklenir. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    if (v instanceof Raw) out += v.s;
    else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
    else if (v === false || v === null || v === undefined) out += '';
    else out += esc(v);
    out += strings[i + 1];
  });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Kök elemana tıklama yönlendirmesi: data-act="isim" olan öğelere tıklanınca handlers[isim](el, event) */
export function bind(root, handlers) {
  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  };
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Alt sayfa aç. render(el, close) içeriği doldurur. Kapanınca Promise çözülür. */
export function sheet(render) {
  return new Promise((resolve) => {
    const root = $('#sheet-root');
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div><div class="sheet-body"></div></div>';
    root.appendChild(bg);
    document.body.style.overflow = 'hidden';
    const close = (val) => {
      bg.remove();
      if (!root.children.length) document.body.style.overflow = '';
      window.removeEventListener('popstate', onPop);
      resolve(val);
    };
    const onPop = () => close();
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    render($('.sheet-body', bg), close);
    window.addEventListener('popstate', onPop);
  });
}

export function confirmSheet(text, okLabel = 'Evet', danger = false) {
  return sheet((el, close) => {
    el.innerHTML = html`<p style="font-size:1.05rem">${text}</p>
      <div class="btn-grid"><button class="btn" data-act="no">Vazgeç</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="yes">${okLabel}</button></div>`.s;
    bind(el, { no: () => close(false), yes: () => close(true) });
  });
}

/** Görseli tarayıcıda küçültür (en uzun kenar 1280px, JPEG) ve data URL döner. */
export function compressImage(file, max = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel açılamadı')); };
    img.src = url;
  });
}

/** Dosya seçtirir (Android: kamera veya galeri), küçültülmüş data URL döner. */
export function pickImage() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      try { resolve(await compressImage(f)); } catch { toast('Görsel açılamadı'); resolve(null); }
    };
    inp.click();
  });
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const fmtDate = (s, withDay = false) => {
  const d = parseDate(s);
  return `${d.getDate()} ${AYLAR[d.getMonth()]}${withDay ? ' ' + GUN[d.getDay()] : ''}`;
};
export const fmtShort = (s) => { const d = parseDate(s); return `${d.getDate()}.${d.getMonth() + 1}`; };
export const monthName = (m) => AYLAR[m];
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

export function relDay(s, today) {
  const n = daysBetween(today, s);
  if (n === 0) return 'bugün';
  if (n === 1) return 'yarın';
  if (n === -1) return 'dün';
  return n > 0 ? `${n} gün sonra` : `${-n} gün önce`;
}

export const photoUrl = (name) => (name ? `/api/foto/${encodeURIComponent(name)}` : '');
export const fmtNet = (n) => (Math.round(n * 100) / 100).toLocaleString('tr-TR');

export const STATE_LABEL = {
  green: 'Tam gün', yellow: 'Eksik kaldı', red: 'Kaçırıldı', excused: 'Mazeretli (donduruldu)',
  open: 'Devam ediyor', empty: 'Görev yoktu', future: 'Gelecek', before: 'Başlamadan önce',
};

export function ringsHtml(days) {
  return html`<div class="rings" aria-label="Son 14 gün">${days.map((d) =>
    html`<span class="ring ${d.state}" title="${fmtDate(d.date)}: ${STATE_LABEL[d.state] || ''}"></span>`)}</div>`;
}

// Geçmiş: zincir takvimi ve gün ayrıntısı (öğrenci ve takipçi aynı ekranı görür).
import { api } from './api.js';
import { ctx } from './app.js';
import { STATE_LABEL, bind, fmtDate, html, monthName, parseDate } from './ui.js';

let shownMonth = null;

export async function calendar(el, { query, isCurrent }) {
  const today = (await api.get('/api/ben')).today;
  const month = query.ay || shownMonth || today.slice(0, 7);
  shownMonth = month;
  const data = await api.get(`/api/gecmis?month=${month}`);
  if (!isCurrent()) return;
  const first = parseDate(`${month}-01`);
  const lead = (first.getDay() + 6) % 7; // pazartesi başlangıç
  const [y, m] = month.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const counts = {};
  data.days.forEach((d) => { counts[d.state] = (counts[d.state] || 0) + 1; });
  el.innerHTML = html`
    <div class="topbar"><h1>Geçmiş</h1></div>
    <div class="card chain" style="margin-top:8px"><div class="chain-count">🔗 ${data.chain.current}</div>
      <div class="grow"><div><b>gün zincir</b></div><div class="small muted">En uzun zincir: ${data.chain.best} gün</div></div></div>
    <div class="row spread" style="margin:16px 0 10px">
      <button class="btn sm" data-act="month" data-v="${prev}" aria-label="Önceki ay">‹</button>
      <b>${monthName(m - 1)} ${y}</b>
      <button class="btn sm" data-act="month" data-v="${next}" aria-label="Sonraki ay" ${next > today.slice(0, 7) ? 'disabled' : ''}>›</button></div>
    <div class="cal">
      ${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => html`<div class="wd">${d}</div>`)}
      ${Array.from({ length: lead }, () => html`<div></div>`)}
      ${data.days.map((d) => html`<button class="day ${d.state} ${d.date === today ? 'today' : ''}" data-act="day" data-v="${d.date}"
          aria-label="${fmtDate(d.date)}: ${STATE_LABEL[d.state]}" ${d.state === 'future' || d.state === 'before' ? 'disabled' : ''}>${Number(d.date.slice(8))}</button>`)}
    </div>
    <div class="legend">
      <span><i class="ring green"></i>Tam gün (${counts.green || 0})</span>
      <span><i class="ring red"></i>Kaçırıldı (${counts.red || 0})</span>
      <span><i class="ring yellow"></i>Eksik kaldı</span>
      <span><i class="ring excused"></i>Mazeretli (${counts.excused || 0})</span>
      <span><i class="ring empty"></i>Görev yoktu</span>
    </div>
    <p class="small muted">Tam gün = o günün bütün görevleri bitti, yanlışlar kapatıldı ve o güne düşen tekrarlar yapıldı.
      Unuttuğun bir şeyi 2 gün içinde tamamlayabilirsin; daha eskisi kilitlenir.</p>`.s;
  bind(el, {
    month: (b) => { shownMonth = b.dataset.v; calendar(el, { query: {}, isCurrent }); },
    day: (b) => ctx.go(`#/gun/${b.dataset.v}`),
  });
}

export async function day(el, { args, isCurrent }) {
  const d = await api.get(`/api/gun/${args[0]}`);
  if (!isCurrent()) return;
  const st = d.state;
  const badge = { green: 'good', red: 'bad', yellow: 'warn', excused: '', open: 'brand' }[st.state] ?? '';
  const RES = { cozdum: '✓ Çözdü', yapamadim: '✗ Yapamadı' };
  el.innerHTML = html`
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">‹</button>
      <h1 class="grow">${fmtDate(d.date)} ${d.weekday}</h1></div>
    <div class="row wrap"><span class="badge ${badge}">${STATE_LABEL[st.state]}</span>
      <span class="badge">Görev ${st.tasks_done}/${st.tasks}</span><span class="badge">Tekrar ${st.reviews_done}/${st.reviews}</span></div>
    ${d.day.excused ? html`<div class="card info" style="margin-top:10px">Mazeret: ${d.day.excuse}</div>` : ''}
    ${d.day.reflected_at ? html`<div class="card" style="margin-top:10px">🌙 <b>Zorlandığı yer:</b>
      ${d.day.hard_topic || d.day.hard_subject || ''}${d.day.reflection ? html` — “${d.day.reflection}”` : ''}</div>` : ''}

    <h2>Görevler</h2>
    ${d.tasks.length ? d.tasks.map((t) => html`<div class="card tight ${t.done ? '' : 'alert'}">
      <div class="row spread"><div class="grow"><b>${t.done ? '✓' : '✗'} ${t.title}</b>
        <div class="card-sub">${t.kind === 'soru' ? (t.correct + t.wrong + t.blank
            ? `D ${t.correct} · Y ${t.wrong} · B ${t.blank}${t.wrong + t.blank ? (t.closed ? ' · yanlışlar kapatıldı' : ' · yanlışlar kapatılmadı') : ''}`
            : 'Başlanmadı') : t.kind === 'tik' ? (t.ticked ? 'Yapıldı' : 'Yapılmadı') : (t.done ? 'Deneme girildi' : 'Deneme girilmedi')}</div></div></div></div>`)
      : html`<div class="card muted small">Görev yok.</div>`}

    <h2>Tekrarlar</h2>
    ${d.reviews.length ? d.reviews.map((r) => html`<a class="list-row" href="#/hata/${r.mistake_id}"><div class="grow">
        <b>${r.topic || r.subject}</b><div class="card-sub">${r.subject} · planlanan ${fmtDate(r.due_date)}${r.done_date ? ` · yapıldı ${fmtDate(r.done_date)}` : ''}</div></div>
        <span class="badge ${r.result === 'cozdum' ? 'good' : r.result ? 'bad' : ''}">${r.result ? RES[r.result] : 'Bekliyor'}</span></a>`)
      : html`<div class="card muted small">Tekrar yok.</div>`}

    <h2>O gün eklenen hatalar <span class="count">${d.mistakes.length}</span></h2>
    ${d.mistakes.map((m) => html`<a class="list-row" href="#/hata/${m.id}"><div class="grow"><b>${m.topic || m.subject}</b>
      <div class="card-sub">${m.subject} · ${m.reason}</div></div><span aria-hidden="true">›</span></a>`)}

    ${d.exams.length ? html`<h2>Denemeler</h2>${d.exams.map((e) => html`<a class="list-row" href="#/deneme-detay/${e.id}"><b>${e.type} denemesi</b><span aria-hidden="true">›</span></a>`)}` : ''}`.s;
  bind(el, { back: () => history.back() });
}

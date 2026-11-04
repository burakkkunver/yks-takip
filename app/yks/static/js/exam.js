// Deneme takibi: liste + ders bazında net trendi, giriş, ayrıntı ve "yanlışları deftere ekle".
import { api, uid } from './api.js';
import { ctx } from './app.js';
import { attachTips, lineChart } from './chart.js';
import { $, $$, addDays, bind, confirmSheet, fmtDate, fmtNet, html, photoUrl, pickImage, raw, toast } from './ui.js';

const net = (c, w) => c - w / 4;
let lastType = 'TYT';

export function trendBlock(tr) {
  if (!tr.total.length) return html`<div class="card muted small">Henüz ${tr.type} denemesi girilmedi.</div>`;
  const keys = Object.keys(tr.series);
  return html`
    <div class="card"><div class="row spread"><div class="card-title">${tr.type} toplam net</div>
      <span class="badge brand">son ${tr.total.length} deneme</span></div>
      ${raw(lineChart({ dates: tr.dates, values: tr.total, labels: tr.labels, height: 170 }))}
      <div class="chart-tip">Noktaya dokun: tarih ve net</div></div>
    <div class="minis" style="margin-top:10px">${keys.map((k) => {
      const sr = tr.series[k];
      const v = sr.points;
      const diff = v.length > 1 ? v[v.length - 1] - v[0] : 0;
      return html`<div class="mini"><div class="row spread"><span class="t">${sr.name}</span>
          ${v.length > 1 ? html`<span class="small ${diff >= 0 ? '' : 'muted'}">${diff >= 0 ? '▲' : '▼'} ${fmtNet(Math.abs(diff))}</span>` : ''}</div>
        ${raw(lineChart({ dates: tr.dates, values: v, labels: tr.labels, height: 96, compact: true }))}
        <div class="chart-tip small"></div></div>`;
    })}</div>
    <details><summary>Tablo olarak gör</summary>
      <div style="overflow-x:auto"><table class="data"><thead><tr><th>Tarih</th>${keys.map((k) => html`<th>${tr.series[k].name}</th>`)}<th>Toplam</th></tr></thead>
      <tbody>${tr.dates.map((d, i) => html`<tr><td>${fmtDate(d)}</td>${keys.map((k) => html`<td>${fmtNet(tr.series[k].points[i])}</td>`)}<td><b>${fmtNet(tr.total[i])}</b></td></tr>`)}</tbody></table></div>
    </details>`;
}

export async function list(el, { query, isCurrent }) {
  const type = query.tur || lastType;
  lastType = type;
  const [exams, trend] = await Promise.all([api.get(`/api/denemeler?type=${type}`), api.get('/api/net-trend')]);
  if (!isCurrent()) return;
  el.innerHTML = html`
    <div class="topbar"><h1>Denemeler</h1>
      ${ctx.isStudent() ? html`<button class="btn primary sm" data-act="add">+ Deneme gir</button>` : ''}</div>
    <div class="seg" style="margin:10px 0 12px">${['TYT', 'AYT'].map((t) => html`<button class="${t === type ? 'on' : ''}" data-act="type" data-v="${t}">${t}</button>`)}</div>
    ${trendBlock(trend[type])}
    <h2>Girilen denemeler <span class="count">${exams.length}</span></h2>
    ${exams.length ? exams.map((e) => {
      const wb = e.sections.reduce((a, s) => a + s.wrong + s.blank, 0);
      return html`<a class="list-row" href="#/deneme-detay/${e.id}">
        <div class="grow"><div class="card-title">${e.source || e.name || `${e.type} denemesi`}</div>
          <div class="card-sub">${fmtDate(e.date, true)}</div>
          <div class="row wrap small" style="margin-top:4px">${e.sections.map((s) => html`<span class="badge">${s.name} ${fmtNet(s.net)}</span>`)}</div>
          ${wb ? html`<div class="small" style="margin-top:4px">${e.mistakes_logged}/${wb} yanlış/boş deftere eklendi</div>` : ''}</div>
        <div class="center"><div style="font-size:1.4rem;font-weight:800">${fmtNet(e.total_net)}</div><div class="small muted">net</div></div></a>`;
    }) : html`<div class="card muted">Henüz ${type} denemesi yok.</div>`}`.s;
  attachTips(el);
  bind(el, {
    add: () => ctx.go(`#/deneme-ekle?tur=${type}`),
    type: (b) => ctx.go(`#/deneme?tur=${b.dataset.v}`),
  });
}

export async function add(el, { query }) {
  const today = (await api.get('/api/ben')).today;
  const f = { type: query.tur === 'AYT' ? 'AYT' : 'TYT', date: today, source_id: null, photo: null, results: {} };
  const draw = () => {
    const secs = ctx.meta.exam_sections[f.type];
    const pubs = ctx.meta.sources.filter((s) => s.kind === 'yayin');
    el.innerHTML = html`
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">‹</button><h1 class="grow">Deneme gir</h1></div>
      <div class="seg" style="margin-top:8px">${['TYT', 'AYT'].map((t) => html`<button class="${t === f.type ? 'on' : ''}" data-act="type" data-v="${t}">${t}</button>`)}</div>
      <label class="field"><span>Tarih</span><div class="chips">
        ${[[0, 'Bugün'], [-1, 'Dün'], [-2, '2 gün önce']].map(([n, l]) => { const d = addDays(today, n); return html`<button class="chip ${f.date === d ? 'on' : ''}" data-act="date" data-v="${d}">${l}</button>`; })}
        <input type="date" class="chip" id="date" max="${today}" value="${f.date}" aria-label="Tarih seç"></div></label>
      <label class="field"><span>Yayın</span><div class="chips">
        ${pubs.map((p) => html`<button class="chip ${p.id === f.source_id ? 'on' : ''}" data-act="pub" data-id="${p.id}">${p.name}</button>`)}
        <button class="chip" data-act="newpub">+ Yeni yayın</button></div></label>
      <div class="card" style="margin-top:14px">
        <div class="num-grid"><span class="h" style="text-align:left">Ders</span><span class="h">Doğru</span><span class="h">Yanlış</span><span class="h">Boş</span><span class="h">Net</span>
        ${secs.map((s) => {
          const r = f.results[s.key] || {};
          const v = (k) => (r[k] ?? '');
          return html`<span class="name">${s.name}<div class="small muted">${s.key === 'mat' || s.key === 'geo' ? '' : `${s.max} soru`}</div></span>
            <input class="input" inputmode="numeric" data-sec="${s.key}" data-k="correct" value="${v('correct')}" aria-label="${s.name} doğru">
            <input class="input" inputmode="numeric" data-sec="${s.key}" data-k="wrong" value="${v('wrong')}" aria-label="${s.name} yanlış">
            <input class="input" inputmode="numeric" data-sec="${s.key}" data-k="blank" value="${v('blank')}" aria-label="${s.name} boş">
            <span class="net" id="net-${s.key}">–</span>`;
        })}</div>
        <div class="row spread" style="margin-top:12px"><b>Toplam net</b><b id="total" style="font-size:1.3rem">0</b></div>
        <div class="small muted">4 yanlış 1 doğruyu götürür. Matematik + geometri en fazla 40 soru.</div>
      </div>
      <button class="btn block ${f.photo ? 'has' : ''}" style="margin-top:12px" data-act="photo">📷 ${f.photo ? 'Karne eklendi ✓' : 'Sonuç karnesi fotoğrafı (isteğe bağlı)'}</button>
      <button class="btn primary block big" style="margin-top:14px" data-act="save">Kaydet</button>`.s;
    $$('input[data-sec]', el).forEach((inp) => { inp.oninput = () => { readInputs(); recalc(); }; inp.onfocus = () => inp.select(); });
    $('#date', el).onchange = (e) => { if (e.target.value) { readInputs(); f.date = e.target.value; draw(); } };
    recalc();
    bind(el, {
      back: () => history.back(),
      type: (b) => { f.type = b.dataset.v; f.results = {}; draw(); },
      date: (b) => { readInputs(); f.date = b.dataset.v; draw(); },
      pub: (b) => { readInputs(); f.source_id = f.source_id === Number(b.dataset.id) ? null : Number(b.dataset.id); draw(); },
      newpub: async () => {
        readInputs();
        const name = prompt('Yayın adı (örn: 3D, Limit, Bilgi Sarmal)');
        if (!name?.trim()) return;
        const r = await api.post('/api/kaynaklar', { kind: 'yayin', name: name.trim() });
        ctx.meta.sources.push(r); f.source_id = r.id; draw();
      },
      photo: async () => { readInputs(); const p = await pickImage(); if (p) { f.photo = p; draw(); } },
      save,
    });
  };
  const readInputs = () => {
    $$('input[data-sec]', el).forEach((inp) => {
      const r = (f.results[inp.dataset.sec] ||= {});
      r[inp.dataset.k] = inp.value === '' ? '' : Math.max(0, parseInt(inp.value, 10) || 0);
    });
  };
  const recalc = () => {
    let total = 0;
    for (const s of ctx.meta.exam_sections[f.type]) {
      const r = f.results[s.key] || {};
      const c = Number(r.correct || 0), w = Number(r.wrong || 0), b = Number(r.blank || 0);
      const n = net(c, w);
      total += n;
      const cell = $(`#net-${s.key}`, el);
      cell.textContent = c || w || b ? fmtNet(n) : '–';
      cell.style.color = c + w + b > s.max ? 'var(--critical-ink)' : '';
    }
    $('#total', el).textContent = fmtNet(total);
  };
  const save = async () => {
    readInputs();
    const results = {};
    for (const [k, r] of Object.entries(f.results)) {
      const c = Number(r.correct || 0), w = Number(r.wrong || 0), b = Number(r.blank || 0);
      if (c || w || b) results[k] = { correct: c, wrong: w, blank: b };
    }
    if (!Object.keys(results).length) return toast('En az bir dersin sonucunu gir');
    const src = ctx.meta.sources.find((s) => s.id === f.source_id);
    try {
      const r = await api.save('POST', '/api/denemeler', { type: f.type, date: f.date, source_id: f.source_id, name: src?.name || null, photo: f.photo, results, client_id: uid() });
      if (r.queued) { toast('İnternet yok; deneme kaydedildi, bağlanınca gönderilecek'); return ctx.go('#/deneme'); }
      toast('Deneme kaydedildi');
      ctx.go(`#/deneme-detay/${r.id}`);
    } catch (e) { toast(e.message); }
  };
  draw();
}

export async function detail(el, { args, isCurrent }) {
  const e = await api.get(`/api/denemeler/${args[0]}`);
  const logged = await api.get(`/api/hatalar?exam_id=${e.id}&limit=500`);
  if (!isCurrent()) return;
  const loggedBySubject = {};
  logged.forEach((m) => { loggedBySubject[m.subject_id] = (loggedBySubject[m.subject_id] || 0) + 1; });
  const withErrors = e.sections.filter((s) => s.wrong + s.blank > 0);
  el.innerHTML = html`
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">‹</button>
      <h1 class="grow">${e.source || e.name || `${e.type} denemesi`}</h1></div>
    <div class="small muted">${e.type} · ${fmtDate(e.date, true)}</div>
    <div class="card kpi" style="margin-top:10px"><span class="big">${fmtNet(e.total_net)}</span><span class="muted">toplam net</span></div>
    <div class="card" style="margin-top:10px"><table class="data">
      <thead><tr><th>Ders</th><th>D</th><th>Y</th><th>B</th><th>Net</th></tr></thead>
      <tbody>${e.sections.map((s) => html`<tr><td>${s.name}</td><td>${s.correct}</td><td>${s.wrong}</td><td>${s.blank}</td><td><b>${fmtNet(s.net)}</b></td></tr>`)}</tbody></table></div>

    ${withErrors.length ? html`<h2>Bu denemedeki yanlışları hata defterine ekle</h2>
      <p class="small muted">Her yanlış/boş için konu ve sebep seç. Hepsini eklemek zorunda değilsin ama en azından yanlışları ekle.</p>
      ${withErrors.map((s) => {
        const subj = ctx.subjectByCode(s.subject_code);
        const n = loggedBySubject[subj?.id] || 0;
        const total = s.wrong + s.blank;
        return html`<div class="list-row" ${ctx.isStudent() ? raw(`data-act="log" data-sec="${s.key}"`) : ''}>
          <div class="grow"><div class="card-title">${s.name}</div>
            <div class="card-sub">${s.wrong} yanlış, ${s.blank} boş</div>
            <div class="progress" style="margin-top:6px"><i style="width:${Math.min(100, (100 * n) / total)}%"></i></div></div>
          <span class="badge ${n >= total ? 'good' : n ? 'warn' : 'bad'}">${n}/${total}</span>
          ${ctx.isStudent() ? html`<span aria-hidden="true">›</span>` : ''}</div>`;
      })}` : html`<div class="card" style="margin-top:10px">Yanlış/boş yok 🎉</div>`}

    ${e.photo ? html`<h3>Sonuç karnesi</h3><img class="photo" src="${photoUrl(e.photo)}" alt="Karne">` : ''}
    ${ctx.isStudent() ? html`<button class="btn ghost block" style="margin-top:20px;color:var(--critical-ink)" data-act="del">Denemeyi sil</button>` : ''}`.s;
  bind(el, {
    back: () => ctx.go(`#/deneme?tur=${e.type}`),
    log: (b) => ctx.go(`#/hata-ekle?deneme=${e.id}&bolum=${b.dataset.sec}`),
    del: async () => {
      if (!(await confirmSheet('Bu deneme silinsin mi? (Deftere eklenen hatalar kalır.)', 'Sil', true))) return;
      await api.del(`/api/denemeler/${e.id}`); toast('Silindi'); ctx.go('#/deneme');
    },
  });
}

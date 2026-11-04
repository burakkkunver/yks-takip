// Hata defteri: 3 dokunuşta hata ekleme (ders → konu → sebep), liste ve ayrıntı.
import { api, uid } from './api.js';
import { ctx } from './app.js';
import { expandHandler, subjectButtons, topicButtons } from './picker.js';
import { $, bind, compressImage, confirmSheet, fmtDate, html, photoUrl, pickImage, sheet, toast } from './ui.js';

const LAST_SRC = 'yks-son-kaynak';
const loadLastSource = () => { try { return JSON.parse(localStorage.getItem(LAST_SRC)) || {}; } catch { return {}; } };
const saveLastSource = (v) => { try { localStorage.setItem(LAST_SRC, JSON.stringify(v)); } catch {} };

async function sharedImage() {
  try {
    const cache = await caches.open('paylasim');
    const r = await cache.match('/paylasim-gorsel');
    if (!r) return null;
    await cache.delete('/paylasim-gorsel');
    return await compressImage(await r.blob());
  } catch { return null; }
}

export async function addFlow(el, { query }) {
  const f = {
    subject_id: query.ders ? Number(query.ders) : null, topic_id: null, kind: 'yanlis', reason: null,
    photo: null, solution_photo: null, source_id: null, page: '', qno: '', note: '',
    origin: 'serbest', task_id: null, exam_id: null,
  };
  // toplu giriş (görev ya da deneme yanlışları)
  const batch = { total: 0, done: 0, wrong: 0, label: '' };
  let fixedTopic = false;

  if (query.gorev) {
    const t = await api.get(`/api/gorevler/${query.gorev}`);
    Object.assign(f, { subject_id: t.subject_id, topic_id: t.topic_id, origin: 'gorev', task_id: t.id });
    // görevin konusu alt başlıklıysa (örn. Problemler) alt konuyu seçtir
    const parent = ctx.subject(t.subject_id)?.topics.find((x) => x.id === t.topic_id);
    if (parent?.children.length) { f.topic_id = null; f._expand = parent.id; }
    fixedTopic = !!f.topic_id;
    const logged = await api.get(`/api/hatalar?task_id=${t.id}`);
    batch.total = t.wrong + t.blank; batch.wrong = t.wrong; batch.done = logged.length;
    batch.wrongDone = logged.filter((m) => m.kind === 'yanlis').length;
    batch.label = t.title;
  } else if (query.deneme) {
    const e = await api.get(`/api/denemeler/${query.deneme}`);
    const sec = e.sections.find((s) => s.key === query.bolum);
    const subj = ctx.subjectByCode(sec.subject_code);
    Object.assign(f, { subject_id: subj.id, origin: 'deneme', exam_id: e.id, date: e.date });
    const logged = (await api.get(`/api/hatalar?exam_id=${e.id}`)).filter((m) => m.subject_id === subj.id);
    batch.total = sec.wrong + sec.blank; batch.wrong = sec.wrong; batch.done = logged.length;
    batch.wrongDone = logged.filter((m) => m.kind === 'yanlis').length;
    batch.label = `${e.type} denemesi · ${sec.name}`;
  }
  if (query.paylasim) f.photo = await sharedImage();
  const last = loadLastSource();
  const defaultKind = () => (batch.total && batch.wrongDone >= batch.wrong ? 'bos' : 'yanlis');
  f.kind = defaultKind();

  const header = (title, back = true) => html`
    <div class="topbar">${back ? html`<button class="icon-btn" data-act="back" aria-label="Geri">‹</button>` : ''}
      <h1 class="grow">${title}</h1>
      ${batch.total ? html`<span class="counter">${batch.done}/${batch.total}</span>` : ''}</div>
    ${batch.total ? html`<div class="small muted">${batch.label}</div>` : ''}`;

  const crumbs = () => html`<div class="crumbs">
      ${f.subject_id ? html`<button data-act="to-subject">${ctx.subject(f.subject_id).name}</button>` : ''}
      ${f.topic_id ? html`<button data-act="to-topic">${ctx.topicName(f.topic_id)}</button>` : ''}</div>`;

  const stepSubject = () => {
    el.innerHTML = html`${header('Hata ekle')}${f.photo ? html`<img class="photo" style="max-height:160px;object-fit:contain;margin-bottom:10px" src="${f.photo}" alt="">` : ''}
      <div class="step-title">1 · Hangi ders?</div>${subjectButtons(f.subject_id)}`.s;
    bind(el, { back: () => history.back(), subject: (b) => { f.subject_id = Number(b.dataset.id); f.topic_id = null; stepTopic(); } });
  };

  const stepTopic = () => {
    const s = ctx.subject(f.subject_id);
    el.innerHTML = html`${header('Hata ekle')}${crumbs()}<div class="step-title">2 · Hangi konu?</div>
      ${topicButtons(s, { general: true })}
      ${batch.total ? html`<button class="btn ghost block" style="margin-top:14px" data-act="finish">Bitir</button>` : ''}`.s;
    bind(el, {
      back: () => (query.deneme ? finish() : stepSubject()),
      'to-subject': stepSubject,
      expand: expandHandler(el),
      topic: (b) => { f.topic_id = b.dataset.id ? Number(b.dataset.id) : null; stepReason(); },
      finish,
    });
    if (f._expand) { const b = el.querySelector(`[data-act=expand][data-id="${f._expand}"]`); if (b) expandHandler(el)(b); }
  };

  const stepReason = () => {
    const reasons = ctx.meta.reasons[f.kind];
    const src = ctx.meta.sources.find((x) => x.id === f.source_id);
    el.innerHTML = html`${header('Hata ekle')}${crumbs()}
      <div class="seg">
        <button class="${f.kind === 'yanlis' ? 'on' : ''}" data-act="kind" data-v="yanlis">Yanlış</button>
        <button class="${f.kind === 'bos' ? 'on' : ''}" data-act="kind" data-v="bos">Boş</button></div>
      <div class="small muted" style="margin:14px 0 6px">İsteğe bağlı ekler</div>
      <div class="attach-row">
        <button class="btn ${f.photo ? 'has' : ''}" data-act="photo">📷 ${f.photo ? 'Soru eklendi ✓' : 'Soru fotoğrafı'}</button>
        <button class="btn ${f.solution_photo ? 'has' : ''}" data-act="solphoto">✅ ${f.solution_photo ? 'Çözüm eklendi ✓' : 'Çözüm fotoğrafı'}</button>
        <button class="btn ${src ? 'has' : ''}" data-act="source">📖 ${src ? `${src.name}${f.page ? ` s.${f.page}` : ''}${f.qno ? ` #${f.qno}` : ''}` : 'Kitap / sayfa'}</button>
        <button class="btn ${f.note ? 'has' : ''}" data-act="note">✏️ ${f.note ? 'Not eklendi ✓' : 'Kısa not'}</button>
      </div>
      ${f.photo ? html`<img class="photo" style="max-height:180px;object-fit:contain;margin-top:8px" src="${f.photo}" alt="Soru fotoğrafı">` : ''}
      <div class="step-title" style="margin-top:18px">3 · Neden ${f.kind === 'bos' ? 'boş bıraktın' : 'yanlış yaptın'}?</div>
      <div class="btn-list">${reasons.map((r) => html`<button class="btn big" data-act="reason" data-v="${r}">${r}</button>`)}</div>
      <p class="small muted">Sebebe dokununca kaydedilir.</p>
      ${batch.total ? html`<button class="btn ghost block" data-act="finish">Bitir</button>` : ''}`.s;
    bind(el, {
      back: () => (fixedTopic ? history.back() : stepTopic()),
      'to-subject': stepSubject,
      'to-topic': stepTopic,
      kind: (b) => { f.kind = b.dataset.v; stepReason(); },
      photo: async () => { const p = await pickImage(); if (p) { f.photo = p; stepReason(); } },
      solphoto: async () => { const p = await pickImage(); if (p) { f.solution_photo = p; stepReason(); } },
      source: async () => { await sourceSheet(f, last); stepReason(); },
      note: async () => { await noteSheet(f); stepReason(); },
      reason: (b) => save(b.dataset.v),
      finish,
    });
  };

  const save = async (reason) => {
    const body = { ...f, reason, client_id: uid() };
    if (!body.topic_id) delete body.topic_id;
    try {
      const r = await api.save('POST', '/api/hatalar', body);
      if (f.source_id) saveLastSource({ source_id: f.source_id, page: f.page });
      ctx.meta.recent_subjects = [f.subject_id, ...ctx.meta.recent_subjects.filter((x) => x !== f.subject_id)];
      if (f.topic_id) ctx.meta.recent_topics = [f.topic_id, ...ctx.meta.recent_topics.filter((x) => x !== f.topic_id)];
      if (batch.total) {
        batch.done++;
        if (f.kind === 'yanlis') batch.wrongDone++;
        Object.assign(f, { photo: null, solution_photo: null, note: '', qno: '' });
        f.kind = defaultKind();
        if (batch.done >= batch.total) {
          toast(r.queued ? 'Hepsi kaydedildi (internet gelince gönderilecek)' : 'Hepsi deftere eklendi ✓');
          return finish();
        }
        toast(`Kaydedildi (${batch.done}/${batch.total})`);
        return fixedTopic ? stepReason() : stepTopic();
      }
      doneScreen(r.queued);
    } catch (e) { toast(e.message); }
  };

  const doneScreen = (queued) => {
    el.innerHTML = html`<div class="card center" style="margin-top:30px;padding:26px 16px">
        <div style="font-size:2.6rem">✅</div>
        <h2 style="justify-content:center">Hata deftere eklendi</h2>
        <p class="muted">${queued ? 'İnternet yok; bağlanınca gönderilecek. ' : ''}2 gün sonra “Bugün tekrar çöz” listende çıkacak.</p>
      </div>
      <div class="stack" style="margin-top:14px">
        <button class="btn primary block big" data-act="again">+ Bir hata daha (${ctx.subject(f.subject_id).name})</button>
        <button class="btn block" data-act="new">+ Başka dersten hata</button>
        <button class="btn ghost block" data-act="home">Ana ekrana dön</button></div>`.s;
    bind(el, {
      again: () => { Object.assign(f, { photo: null, solution_photo: null, note: '', qno: '', topic_id: null }); stepTopic(); },
      new: () => { Object.assign(f, { photo: null, solution_photo: null, note: '', qno: '', topic_id: null, subject_id: null }); stepSubject(); },
      home: () => ctx.go('#/'),
    });
  };

  function finish() {
    if (query.deneme) ctx.go(`#/deneme-detay/${query.deneme}`);
    else ctx.go('#/');
  }

  if (!f.subject_id) stepSubject();
  else if (!f.topic_id) stepTopic();
  else stepReason();
}

function sourceSheet(f, last) {
  return sheet((s, close) => {
    const draw = () => {
      const books = ctx.meta.sources.filter((x) => x.kind === 'kitap');
      if (!f.source_id && last.source_id && books.some((b) => b.id === last.source_id)) { f.source_id = last.source_id; f.page = f.page || last.page || ''; }
      s.innerHTML = html`<h2>Kitap / sayfa</h2>
        <div class="chips">${books.map((b) => html`<button class="chip ${b.id === f.source_id ? 'on' : ''}" data-act="pick" data-id="${b.id}">${b.name}</button>`)}
          <button class="chip" data-act="newbook">+ Yeni kitap</button></div>
        <div class="row" style="margin-top:12px">
          <label class="field grow"><span>Sayfa</span><input class="input" id="page" inputmode="numeric" value="${f.page}" maxlength="10"></label>
          <label class="field grow"><span>Soru no</span><input class="input" id="qno" inputmode="numeric" value="${f.qno}" maxlength="10"></label></div>
        <div class="btn-grid" style="margin-top:14px"><button class="btn" data-act="clear">Kaldır</button>
          <button class="btn primary" data-act="ok">Tamam</button></div>`.s;
      bind(s, {
        pick: (b) => { keep(); f.source_id = Number(b.dataset.id); draw(); },
        newbook: async () => {
          keep();
          const name = prompt('Kitabın adı (örn: 345 TYT Matematik)');
          if (!name?.trim()) return;
          try {
            const r = await api.post('/api/kaynaklar', { kind: 'kitap', name: name.trim() });
            ctx.meta.sources.push(r); f.source_id = r.id; draw();
          } catch (e) { toast(e.message); }
        },
        clear: () => { Object.assign(f, { source_id: null, page: '', qno: '' }); close(); },
        ok: () => { keep(); close(); },
      });
    };
    const keep = () => { f.page = $('#page', s).value.trim(); f.qno = $('#qno', s).value.trim(); };
    draw();
    setTimeout(() => $('#qno', s)?.focus(), 50);
  });
}

function noteSheet(f) {
  return sheet((s, close) => {
    s.innerHTML = html`<h2>Kısa not</h2>
      <textarea class="input" id="n" maxlength="500" placeholder="Örn: işaret hatası yaptım / formülü unuttum">${f.note}</textarea>
      <button class="btn primary block" style="margin-top:12px" data-act="ok">Tamam</button>`.s;
    bind(s, { ok: () => { f.note = $('#n', s).value.trim(); close(); } });
    setTimeout(() => $('#n', s).focus(), 50);
  });
}

// ---------------------------------------------------------------- hata defteri listesi

export async function notebook(el, { query, isCurrent }) {
  const flt = { subject_id: query.ders ? Number(query.ders) : null, topic_id: query.konu ? Number(query.konu) : null, status: query.durum || 'acik' };
  let items = [];
  let offset = 0;
  const load = async (more = false) => {
    const p = new URLSearchParams({ limit: 50, offset: more ? offset : 0 });
    if (flt.subject_id) p.set('subject_id', flt.subject_id);
    if (flt.topic_id) p.set('topic_id', flt.topic_id);
    if (flt.status !== 'hepsi') p.set('status', flt.status);
    const res = await api.get(`/api/hatalar?${p}`);
    items = more ? items.concat(res) : res;
    offset = items.length;
    return res.length;
  };
  let lastCount = await load();
  if (!isCurrent()) return;
  const draw = () => {
    el.innerHTML = html`
      <div class="topbar"><h1>Hata defteri</h1>
        ${ctx.isStudent() ? html`<button class="btn primary sm" data-act="add">+ Hata ekle</button>` : ''}</div>
      <div class="seg" style="margin:10px 0">${[['acik', 'Açık'], ['kapandi', 'Kapandı'], ['hepsi', 'Tümü']].map(([k, l]) =>
        html`<button class="${flt.status === k ? 'on' : ''}" data-act="status" data-v="${k}">${l}</button>`)}</div>
      <div class="hscroll"><button class="chip ${!flt.subject_id ? 'on' : ''}" data-act="subj" data-id="">Tümü</button>
        ${ctx.meta.subjects.map((s) => html`<button class="chip ${flt.subject_id === s.id ? 'on' : ''}" data-act="subj" data-id="${s.id}">${s.name}</button>`)}</div>
      ${flt.topic_id ? html`<div style="margin-top:8px"><button class="chip on" data-act="untopic">Konu: ${ctx.topicName(flt.topic_id)} ✕</button></div>` : ''}
      <div style="margin-top:12px">
      ${items.length ? items.map((m) => html`<a class="list-row" href="#/hata/${m.id}">
          ${m.photo ? html`<img class="thumb" src="${photoUrl(m.photo)}" alt="" loading="lazy">` : html`<div class="thumb" style="display:grid;place-items:center">${m.kind === 'bos' ? '⭕' : '❌'}</div>`}
          <div class="grow"><div class="card-title">${m.topic || m.subject}</div>
            <div class="card-sub">${m.subject} · ${m.reason}</div>
            <div class="row wrap small" style="margin-top:4px">
              <span class="muted">${fmtDate(m.created_date)}</span>
              ${m.status === 'kapandi' ? html`<span class="badge good">✓ Kapandı</span>`
                : m.next_review ? html`<span class="badge brand">Tekrar: ${fmtDate(m.next_review)}</span>` : ''}
              ${m.fail_count ? html`<span class="badge warn">${m.fail_count} kez yapamadı</span>` : ''}</div>
          </div></a>`)
        : html`<div class="card muted center">Bu filtrede kayıt yok.</div>`}
      </div>
      ${lastCount === 50 ? html`<button class="btn block" style="margin-top:10px" data-act="more">Daha fazla</button>` : ''}
      ${ctx.isStudent() ? html`<button class="fab" data-act="add">+ Hata ekle</button>` : ''}`.s;
    bind(el, {
      add: () => ctx.go('#/hata-ekle' + (flt.subject_id ? `?ders=${flt.subject_id}` : '')),
      status: async (b) => { flt.status = b.dataset.v; lastCount = await load(); draw(); },
      subj: async (b) => { flt.subject_id = b.dataset.id ? Number(b.dataset.id) : null; flt.topic_id = null; lastCount = await load(); draw(); },
      untopic: async () => { flt.topic_id = null; lastCount = await load(); draw(); },
      more: async () => { lastCount = await load(true); draw(); },
    });
  };
  draw();
}

// ---------------------------------------------------------------- hata ayrıntısı

export async function detail(el, { args, isCurrent }) {
  const m = await api.get(`/api/hatalar/${args[0]}`);
  if (!isCurrent()) return;
  const RES = { cozdum: '✓ Çözdü', yapamadim: '✗ Yine yapamadı' };
  el.innerHTML = html`
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">‹</button>
      <h1 class="grow">${m.topic || m.subject}</h1></div>
    <div class="row wrap"><span class="badge">${m.subject}</span><span class="badge">${m.kind === 'bos' ? 'Boş' : 'Yanlış'} · ${m.reason}</span>
      ${m.status === 'kapandi' ? html`<span class="badge good">✓ Kapandı</span>` : html`<span class="badge brand">Açık</span>`}
      ${m.source ? html`<span class="badge">📖 ${m.source}${m.page ? ` s.${m.page}` : ''}${m.qno ? ` #${m.qno}` : ''}</span>` : ''}</div>
    <p class="small muted">${fmtDate(m.created_date, true)} · ${{ serbest: 'serbest giriş', gorev: 'görevden', deneme: 'denemeden' }[m.origin]}</p>
    ${m.photo ? html`<h3>Soru</h3><img class="photo" src="${photoUrl(m.photo)}" alt="Soru">` : ''}
    ${m.note ? html`<div class="card" style="margin-top:10px">✏️ ${m.note}</div>` : ''}
    ${m.solution_photo ? html`<details><summary>Çözümü göster</summary><img class="photo" src="${photoUrl(m.solution_photo)}" alt="Çözüm"></details>` : ''}
    <h3>Tekrarlar</h3>
    <div class="card tight">${m.reviews.map((r) => html`<div class="row spread" style="padding:6px 0">
        <span>${r.stage === 1 ? '7. gün' : '2. gün'} · ${fmtDate(r.due_date)}</span>
        <span class="badge ${r.result === 'cozdum' ? 'good' : r.result ? 'bad' : ''}">${r.result ? RES[r.result] : 'Bekliyor'}</span></div>`)}</div>
    ${ctx.isStudent() ? html`<div class="stack" style="margin-top:16px">
      ${m.photo ? '' : html`<button class="btn block" data-act="photo">📷 Soru fotoğrafı ekle</button>`}
      ${m.solution_photo ? '' : html`<button class="btn block" data-act="sol">✅ Çözüm fotoğrafı ekle</button>`}
      <button class="btn block" data-act="note">✏️ Notu düzenle</button>
      <button class="btn ghost block" data-act="del" style="color:var(--critical-ink)">Kaydı sil (yanlış girdiysem)</button></div>` : ''}`.s;
  bind(el, {
    back: () => history.back(),
    photo: async () => { const p = await pickImage(); if (p) { await api.patch(`/api/hatalar/${m.id}`, { photo: p }); detail(el, { args, isCurrent }); } },
    sol: async () => { const p = await pickImage(); if (p) { await api.patch(`/api/hatalar/${m.id}`, { solution_photo: p }); detail(el, { args, isCurrent }); } },
    note: async () => { const f = { note: m.note || '' }; await noteSheet(f); await api.patch(`/api/hatalar/${m.id}`, { note: f.note }); detail(el, { args, isCurrent }); },
    del: async () => {
      if (!(await confirmSheet('Bu hata kaydı ve tekrarları silinsin mi?', 'Sil', true))) return;
      try { await api.del(`/api/hatalar/${m.id}`); toast('Silindi'); history.back(); } catch (e) { toast(e.message); }
    },
  });
}

// Takipçi: haftalık özet (pano + bölümler), konu durumu ve yönetimi.
import { api } from './api.js';
import { ctx } from './app.js';
import { attachTips } from './chart.js';
import { trendBlock } from './exam.js';
import { $, STATE_LABEL, addDays, bind, fmtDate, html, parseDate, toast } from './ui.js';

let weekShown = null;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const SECTIONS = {
  kapatilmamis: { ic: '🔴', t: 'Kapatılmamış görevler', render: secUnclosed },
  uyum: { ic: '📋', t: 'Programa uyum', render: secAdherence },
  tekrar: { ic: '🔁', t: 'Tekrarlar', render: secReviews },
  hatalar: { ic: '📊', t: 'Hata analizi', render: secMistakes },
  aksam: { ic: '🌙', t: 'Akşam notları', render: secReflections },
  net: { ic: '📈', t: 'Net trendi', render: secTrend },
  hedef: { ic: '🎯', t: 'Hedef ve öğrenciye not', render: secGoalNote },
  paylas: { ic: '📤', t: 'Paylaş ve dışa aktar', render: secShare },
};

export async function summary(el, { args, isCurrent }) {
  const sm = await api.get('/api/ozet' + (weekShown ? `?week=${weekShown}` : ''));
  if (!isCurrent()) return;
  const again = () => summary(el, { args, isCurrent });
  const sec = SECTIONS[args?.[0]];
  const weekNav = (title) => {
    const isThisWeek = sm.today >= sm.week_start && sm.today <= sm.week_end;
    return html`<div class="topbar">
      ${sec ? html`<button class="icon-btn" data-act="back" aria-label="Geri">‹</button>` : ''}
      <div class="grow"><h1>${title}</h1><div class="sub">${fmtDate(sm.week_start)} – ${fmtDate(sm.week_end)}</div></div>
      <button class="icon-btn" data-act="week" data-v="${addDays(sm.week_start, -7)}" aria-label="Önceki hafta">‹</button>
      <button class="icon-btn" data-act="week" data-v="${addDays(sm.week_start, 7)}" aria-label="Sonraki hafta" ${isThisWeek ? 'disabled' : ''}>›</button></div>`;
  };
  const common = {
    back: () => ctx.go('#/'),
    week: (b) => { weekShown = b.dataset.v; again(); },
  };

  if (sec) {
    const { body, handlers = {} } = sec.render(sm, again, el);
    el.innerHTML = html`${weekNav(`${sec.ic} ${sec.t}`)}<div style="margin-top:8px">${body}</div>`.s;
    attachTips(el);
    bind(el, { ...common, ...handlers });
    return;
  }

  // ---- pano
  const stuck = sm.stuck.length;
  const tiles = [
    ['kapatilmamis', `${sm.unclosed.length} görev`, sm.unclosed.length > 0],
    ['uyum', sm.adherence_rate === null ? 'görev yok' : `%${sm.adherence_rate}${sm.most_skipped ? ` · en çok atlanan: ${sm.most_skipped.subject}` : ''}`],
    ['tekrar', `${sm.missed_reviews.length} kaçırılmış · ${sm.pending_reviews_today} bugün`, sm.missed_reviews.length > 0],
    ['hatalar', `${sm.mistakes_week} yeni hata${stuck ? ` · ${stuck} takılan konu` : ''}`, stuck > 0],
    ['aksam', `${sm.reflections.length} not`],
    ['net', sm.trend.TYT.total.length ? `TYT son: ${sm.trend.TYT.total.at(-1)}` : 'deneme yok'],
    ['hedef', sm.goal ? sm.goal.text : 'hedef yazılmadı'],
    ['paylas', 'WhatsApp · CSV'],
  ];
  el.innerHTML = html`${weekNav('Haftalık özet')}
    <div class="card" style="margin-top:8px">
      <div class="small muted">Bu hafta yanlışların kapatılma oranı</div>
      <div class="kpi"><span class="big">${sm.close_rate === null ? '–' : `%${sm.close_rate}`}</span>
        <span class="muted">${sm.close_done}/${sm.close_total} yanlış/boş kapatıldı</span></div>
      <div class="progress" style="margin-top:8px"><i style="width:${sm.close_rate || 0}%"></i></div>
    </div>
    <div class="kpi-grid">
      <div class="card"><div class="v">${sm.tasks_done}/${sm.tasks_total}</div><div class="l">görev tamamlandı (bugüne kadar)</div></div>
      <div class="card"><div class="v">🔗 ${sm.chain.current}</div><div class="l">gün zincir · rekor ${sm.chain.best}</div></div>
    </div>
    <div class="card" style="margin-top:10px"><div class="row spread">${sm.week_days.map((d) => html`<a class="center small" style="text-decoration:none;color:inherit" href="#/gun/${d.date}">
        <div class="muted">${KISA[(parseDate(d.date).getDay() + 6) % 7]}</div>
        <span class="ring ${d.state}" style="display:inline-block;width:22px;height:22px" title="${STATE_LABEL[d.state]}"></span></a>`)}</div></div>
    <div class="tiles">${tiles.map(([k, d, alert]) => html`<a class="tile ${alert ? 'alert' : ''}" href="#/ozet/${k}">
        <span class="ic" aria-hidden="true">${SECTIONS[k].ic}</span><span><div class="t">${SECTIONS[k].t}</div><div class="d">${d}</div></span></a>`)}</div>`.s;
  bind(el, common);
}

function secUnclosed(sm) {
  return { body: html`
    <p class="small muted">Yanlış/boş girilmiş ama “yanlışlar kapatıldı” işaretlenmemiş görevler.</p>
    ${sm.unclosed.length ? html`<div class="red-list">${sm.unclosed.map((t) => html`<a class="list-row" href="#/gun/${t.date}">
        <div class="grow"><b>${t.title}</b><div class="card-sub">${fmtDate(t.date, true)} · ${t.wrong} yanlış, ${t.blank} boş · deftere ${t.mistakes_logged} eklendi</div></div></a>`)}</div>`
      : html`<div class="card">Hepsi kapatılmış 👍</div>`}
    <h2>Hiç başlanmamış görevler <span class="count">${sm.not_started.length}</span></h2>
    ${sm.not_started.length ? sm.not_started.map((t) => html`<a class="list-row" href="#/gun/${t.date}"><div class="grow">${t.title}<div class="card-sub">${fmtDate(t.date, true)}</div></div></a>`)
      : html`<div class="card small muted">Yok.</div>`}` };
}

function secAdherence(sm) {
  return { body: html`
    <div class="card"><div class="kpi"><span class="big">${sm.adherence_rate === null ? '–' : `%${sm.adherence_rate}`}</span><span class="muted">programın uygulanma oranı</span></div></div>
    <div class="card" style="margin-top:10px">${sm.adherence.length ? sm.adherence.map((a) => html`<div class="bar-row"><span>${a.subject}</span>
        <div class="bar good"><i style="width:${pct(a.done, a.total)}%"></i></div><span class="small">${a.done}/${a.total}</span></div>`)
      : html`<span class="muted small">Bu hafta görev yok.</span>`}</div>
    ${sm.most_skipped ? html`<p>En çok atlanan: <b>${sm.most_skipped.subject}</b> görevleri.
      ${sm.adherence_rate !== null && sm.adherence_rate < 60 ? 'Program fazla yüklü olabilir; birkaç görevi azaltmayı düşün.' : ''}</p>` : ''}
    <a class="btn block" href="#/program">🗓️ Haftalık programa git</a>` };
}

function secReviews(sm) {
  return { body: html`
    <div class="row wrap"><span class="badge brand">Bugün bekleyen: ${sm.pending_reviews_today}</span>
      <span class="badge ${sm.missed_reviews.length ? 'bad' : 'good'}">Kaçırılmış: ${sm.missed_reviews.length}</span>
      <span class="badge">İleride planlı: ${sm.upcoming_reviews}</span></div>
    <div class="kpi-grid"><div class="card"><div class="v">${sm.reviews_week.cozdum} ✓</div><div class="l">bu hafta çözdü</div></div>
      <div class="card"><div class="v">${sm.reviews_week.yapamadim} ✗</div><div class="l">bu hafta yine yapamadı</div></div></div>
    <h2>Kaçırılmış tekrarlar</h2>
    ${sm.missed_reviews.length ? sm.missed_reviews.map((r) => html`<div class="list-row"><div class="grow"><b>${r.topic || r.subject}</b>
        <div class="card-sub">${r.subject} · ${r.reason} · planlanan ${fmtDate(r.due_date)}</div></div></div>`)
      : html`<div class="card small">Kaçırılmış tekrar yok 👍</div>`}` };
}

function secMistakes(sm) {
  const reasons = sm.reasons_week.length ? sm.reasons_week : sm.reasons_all;
  const reasonMax = Math.max(1, ...reasons.map((r) => r[1]));
  return { body: html`
    ${sm.stuck.length ? html`<div class="card alert"><b>⚠️ Takıldığı konular</b>
        <div class="small">Aynı konuda en az 2 kez “yine yapamadım” dedi. Soru çözdürmek yerine konu tekrarı / anlatım öner.</div>
        <div class="chips" style="margin-top:8px">${sm.stuck.map((t) => html`<a class="chip" href="#/defter?konu=${t.id}&durum=hepsi">${t.subject}: ${t.name} (${t.fails}✗)</a>`)}</div></div>` : ''}
    <h2>En çok hata biriken 5 konu</h2>
    <div class="card">${sm.top_topics.length ? sm.top_topics.map((t, i) => html`<a class="bar-row" style="text-decoration:none;color:inherit" href="#/defter?${t.id ? `konu=${t.id}` : `ders=${t.subject_id}`}&durum=hepsi">
        <span>${i + 1}. ${t.topic || t.subject}<div class="small muted">${t.subject}</div></span>
        <div class="bar"><i style="width:${pct(t.count, sm.top_topics[0].count)}%"></i></div>
        <span class="small">${t.count} <span class="muted">(${t.open_count} açık)</span></span></a>`)
      : html`<span class="muted small">Henüz hata kaydı yok.</span>`}</div>
    <h2>Hata sebepleri <span class="count">${sm.reasons_week.length ? 'bu hafta' : 'tüm zamanlar'}</span></h2>
    <div class="card">${reasons.length ? reasons.map(([r, n]) => html`<div class="bar-row"><span>${r}</span>
        <div class="bar"><i style="width:${(100 * n) / reasonMax}%"></i></div><span class="small">${n}</span></div>`)
      : html`<span class="muted small">Henüz veri yok.</span>`}</div>
    <div class="btn-grid" style="margin-top:12px"><a class="btn" href="#/konular">🧭 Konu durumu</a><a class="btn" href="#/defter">📕 Hata defteri</a></div>` };
}

function secReflections(sm) {
  return { body: html`<p class="small muted">Öğrencinin “Bugün en çok nerede zorlandın?” cevapları ve mazeretli günler.</p>
    ${sm.reflections.length ? sm.reflections.map((r) => html`<div class="card tight"><b>${fmtDate(r.date, true)}</b><div>
        ${r.excused ? html`<span class="badge">Mazeret: ${r.excuse}</span>` : html`${r.topic || r.subject || ''}${r.reflection ? html` — “${r.reflection}”` : ''}`}</div></div>`)
      : html`<div class="card muted small">Bu hafta not yok.</div>`}` };
}

function secTrend(sm) {
  return { body: html`${trendBlock(sm.trend.TYT)}<div style="margin-top:12px">${trendBlock(sm.trend.AYT)}</div>
    <a class="btn block" style="margin-top:12px" href="#/deneme">Tüm denemeler</a>` };
}

function secGoalNote(sm, again, el) {
  const nextWeek = addDays(sm.week_start, 7);
  return {
    body: html`
      <div class="card">
        ${sm.goal ? html`<div class="small muted">Bu hafta</div><div class="card-title">${sm.goal.text}</div>
          <div class="seg" style="margin-top:8px"><button class="${sm.goal.result === 'tuttu' ? 'on' : ''}" data-act="goalres" data-v="tuttu">✅ Tuttu</button>
            <button class="${sm.goal.result === 'tutmadi' ? 'on' : ''}" data-act="goalres" data-v="tutmadi">❌ Tutmadı</button></div>`
          : html`<button class="btn block" data-act="goal" data-week="${sm.week_start}">Bu haftaya hedef yaz</button>`}
        <div style="margin-top:12px"><div class="small muted">Gelecek hafta (${fmtDate(nextWeek)})</div>
          ${sm.next_goal ? html`<div class="card-title">${sm.next_goal.text}</div>` : ''}
          <button class="btn sm" style="margin-top:6px" data-act="goal" data-week="${nextWeek}">${sm.next_goal ? 'Değiştir' : 'Gelecek haftanın hedefini yaz'}</button></div>
      </div>
      <h2>💬 Öğrenciye not</h2>
      <div class="card"><textarea class="input" id="note" maxlength="500" placeholder="Örn: Bu hafta geometride çok iyi gidiyorsun, aynen devam!"></textarea>
        <button class="btn primary block" style="margin-top:8px" data-act="note">Gönder</button>
        ${sm.notes.map((n) => html`<div class="row spread small" style="margin-top:8px"><span class="grow">${n.text}</span>
          <span class="badge ${n.read_at ? 'good' : ''}">${n.read_at ? 'okundu' : 'okunmadı'}</span>
          <button class="icon-btn" data-act="delnote" data-id="${n.id}" aria-label="Sil">✕</button></div>`)}</div>`,
    handlers: {
      goal: async (b) => {
        const text = prompt('Haftanın hedefi (örn: Üçgende açı konusunu kapat)');
        if (!text?.trim()) return;
        await api.put('/api/hedef', { week_start: b.dataset.week, text: text.trim() });
        toast('Hedef kaydedildi'); again();
      },
      goalres: async (b) => { await api.post(`/api/hedef/${sm.week_start}/sonuc`, { result: b.dataset.v }); again(); },
      note: async () => {
        const t = $('#note', el).value.trim();
        if (!t) return toast('Notu yaz');
        await api.post('/api/notlar', { text: t }); toast('Not gönderildi, öğrencinin ana ekranında görünecek'); again();
      },
      delnote: async (b) => { await api.del(`/api/notlar/${b.dataset.id}`); again(); },
    },
  };
}

function secShare() {
  const q = weekShown ? `?week=${weekShown}` : '';
  return {
    body: html`<p class="small muted">Haftalık özeti WhatsApp'a gönderebilir ya da tüm verileri Excel'de açılan CSV olarak indirebilirsin.</p>
      <div class="btn-grid"><button class="btn good big" data-act="wa">WhatsApp'a gönder</button><button class="btn big" data-act="copy">Özeti kopyala</button></div>
      <h2>CSV dışa aktar</h2>
      <div class="btn-list"><a class="btn" href="/api/disari/hatalar.csv">📕 Hata defteri (CSV)</a>
        <a class="btn" href="/api/disari/gorevler.csv">📋 Görevler (CSV)</a><a class="btn" href="/api/disari/denemeler.csv">📈 Denemeler (CSV)</a></div>`,
    handlers: {
      wa: async () => { const { text } = await api.get('/api/whatsapp' + q); window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); },
      copy: async () => {
        const { text } = await api.get('/api/whatsapp' + q);
        try { await navigator.clipboard.writeText(text); toast('Özet kopyalandı'); } catch { prompt('Kopyala:', text); }
      },
    },
  };
}

// ---------------------------------------------------------------- konular: ısı haritası + yönetim

export async function topics(el, { query, isCurrent }) {
  const heat = await api.get('/api/isi-haritasi');
  if (!isCurrent()) return;
  el.innerHTML = html`
    <div class="topbar"><h1>Konu durumu</h1><button class="btn sm" data-act="manage">Konuları düzenle</button></div>
    <div class="legend" style="margin:6px 0 4px">
      <span><i class="ring red"></i>Çok hata / takılıyor</span><span><i class="ring yellow"></i>Kapatılıyor</span>
      <span><i class="ring green"></i>2 haftadır hata yok</span><span><i class="ring empty"></i>Veri yok</span></div>
    <p class="small muted">Konuya dokun: o konunun hata defteri açılır.</p>
    ${heat.map((s) => html`<h3>${s.name}</h3><div class="heat">${s.topics.map((t) => html`<button class="${t.color}" data-act="open" data-id="${t.id}"
        title="${t.total} hata, ${t.open} açık">${t.color === 'kirmizi' ? '● ' : t.color === 'sari' ? '◐ ' : t.color === 'yesil' ? '✓ ' : ''}${t.name}${t.total ? ` (${t.open}/${t.total})` : ''}${t.stuck ? ' ⚠️' : ''}</button>`)}</div>`)}
    <h2>Kitaplar ve yayınlar</h2>
    <div class="chips">${ctx.meta.sources.map((s) => html`<span class="chip">${s.kind === 'kitap' ? '📖' : '📈'} ${s.name}
      <button class="icon-btn" style="min-width:28px;min-height:28px" data-act="hidesrc" data-id="${s.id}" aria-label="Kaldır">✕</button></span>`)}</div>
    <div class="btn-grid" style="margin-top:10px"><button class="btn sm" data-act="addsrc" data-k="kitap">+ Kitap</button>
      <button class="btn sm" data-act="addsrc" data-k="yayin">+ Deneme yayını</button></div>`.s;
  const again = () => topics(el, { query, isCurrent });
  bind(el, {
    open: (b) => ctx.go(`#/defter?konu=${b.dataset.id}&durum=hepsi`),
    manage: () => manageTopics(el),
    hidesrc: async (b) => { await api.del(`/api/kaynaklar/${b.dataset.id}`); await ctx.reloadMeta(); again(); },
    addsrc: async (b) => {
      const name = prompt(b.dataset.k === 'kitap' ? 'Kitap adı (örn: 345 TYT Matematik)' : 'Yayın adı (örn: 3D)');
      if (!name?.trim()) return;
      await api.post('/api/kaynaklar', { kind: b.dataset.k, name: name.trim() }); await ctx.reloadMeta(); again();
    },
  });
}

async function manageTopics(el) {
  const data = await api.get('/api/konular/tum');
  let sid = data.subjects[0].id;
  const draw = () => {
    const mains = data.topics.filter((t) => t.subject_id === sid && !t.parent_id);
    el.innerHTML = html`
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">‹</button><h1 class="grow">Konuları düzenle</h1></div>
      <p class="small muted">ÖSYM kılavuzunda değişiklik olursa buradan konu ekle, adını değiştir ya da gizle. Gizlenen konu listelerden kalkar, eski kayıtlar silinmez.</p>
      <div class="hscroll">${data.subjects.map((s) => html`<button class="chip ${s.id === sid ? 'on' : ''}" data-act="subj" data-id="${s.id}">${s.name}</button>`)}</div>
      <div style="margin-top:12px">${mains.map((t) => html`
        <div class="card tight" style="${t.hidden ? 'opacity:.5' : ''}"><div class="row">
          <b class="grow">${t.name}</b>
          <button class="btn sm" data-act="rename" data-id="${t.id}">Ad</button>
          <button class="btn sm" data-act="toggle" data-id="${t.id}">${t.hidden ? 'Göster' : 'Gizle'}</button>
          <button class="btn sm" data-act="addsub" data-id="${t.id}">+ Alt</button></div>
          ${data.topics.filter((c) => c.parent_id === t.id).map((c) => html`<div class="row small" style="padding:4px 0 4px 14px;${c.hidden ? 'opacity:.5' : ''}">
            <span class="grow">› ${c.name}</span>
            <button class="btn sm" data-act="rename" data-id="${c.id}">Ad</button>
            <button class="btn sm" data-act="toggle" data-id="${c.id}">${c.hidden ? 'Göster' : 'Gizle'}</button></div>`)}
        </div>`)}</div>
      <button class="btn primary block" style="margin-top:12px" data-act="addmain">+ Bu derse konu ekle</button>`.s;
    bind(el, {
      back: () => topics(el, { query: {}, isCurrent: () => true }),
      subj: (b) => { sid = Number(b.dataset.id); draw(); },
      rename: async (b) => {
        const t = data.topics.find((x) => x.id === Number(b.dataset.id));
        const name = prompt('Yeni ad', t.name);
        if (!name?.trim()) return;
        await api.patch(`/api/konular/${t.id}`, { name: name.trim() }); t.name = name.trim(); done();
      },
      toggle: async (b) => {
        const t = data.topics.find((x) => x.id === Number(b.dataset.id));
        await api.patch(`/api/konular/${t.id}`, { hidden: !t.hidden });
        data.topics.forEach((x) => { if (x.id === t.id || x.parent_id === t.id) x.hidden = t.hidden ? 0 : 1; });
        done();
      },
      addsub: async (b) => {
        const name = prompt('Alt konu adı');
        if (!name?.trim()) return;
        const r = await api.post('/api/konular', { subject_id: sid, parent_id: Number(b.dataset.id), name: name.trim() });
        data.topics.push({ id: r.id, subject_id: sid, parent_id: Number(b.dataset.id), name: name.trim(), hidden: 0 }); done();
      },
      addmain: async () => {
        const name = prompt('Konu adı');
        if (!name?.trim()) return;
        const r = await api.post('/api/konular', { subject_id: sid, name: name.trim() });
        data.topics.push({ id: r.id, subject_id: sid, parent_id: null, name: name.trim(), hidden: 0 }); done();
      },
    });
  };
  const done = async () => { draw(); await ctx.reloadMeta(); };
  draw();
}


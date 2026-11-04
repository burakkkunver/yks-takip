// Takipçi: haftalık özet, haftalık (kalıcı) program, konu durumu ve yönetimi.
import { api } from './api.js';
import { ctx, logout } from './app.js';
import { attachTips } from './chart.js';
import { trendBlock } from './exam.js';
import { chooseSubjectTopic } from './picker.js';
import { $, STATE_LABEL, addDays, bind, confirmSheet, fmtDate, html, parseDate, sheet, toast } from './ui.js';

let weekShown = null;

export async function summary(el, { isCurrent }) {
  const sm = await api.get('/api/ozet' + (weekShown ? `?week=${weekShown}` : ''));
  if (!isCurrent()) return;
  const isThisWeek = sm.today >= sm.week_start && sm.today <= sm.week_end;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const reasons = sm.reasons_week.length ? sm.reasons_week : sm.reasons_all;
  const reasonMax = Math.max(1, ...reasons.map((r) => r[1]));
  const nextWeek = addDays(sm.week_start, 7);
  el.innerHTML = html`
    <div class="topbar"><div><h1>Haftalık özet</h1><div class="sub">${fmtDate(sm.week_start)} – ${fmtDate(sm.week_end)}</div></div>
      <div class="row"><button class="icon-btn" data-act="week" data-v="${addDays(sm.week_start, -7)}" aria-label="Önceki hafta">‹</button>
      <button class="icon-btn" data-act="week" data-v="${nextWeek}" aria-label="Sonraki hafta" ${isThisWeek ? 'disabled' : ''}>›</button>
      <button class="icon-btn" data-act="menu" aria-label="Menü">⋯</button></div></div>

    <div class="card" style="margin-top:8px">
      <div class="small muted">Bu hafta yanlışların kapatılma oranı</div>
      <div class="kpi"><span class="big">${sm.close_rate === null ? '–' : `%${sm.close_rate}`}</span>
        <span class="muted">${sm.close_done}/${sm.close_total} yanlış/boş kapatıldı</span></div>
      <div class="progress" style="margin-top:8px"><i style="width:${sm.close_rate || 0}%"></i></div>
    </div>
    <div class="kpi-grid">
      <div class="card"><div class="v">${sm.tasks_done}/${sm.tasks_total}</div><div class="l">görev tamamlandı (bugüne kadar)</div></div>
      <div class="card"><div class="v">🔗 ${sm.chain.current}</div><div class="l">gün zincir · rekor ${sm.chain.best}</div></div>
      <div class="card"><div class="v">${sm.mistakes_week}</div><div class="l">hata deftere eklendi</div></div>
      <div class="card"><div class="v">${sm.reviews_week.cozdum}✓ ${sm.reviews_week.yapamadim}✗</div><div class="l">tekrar: çözdü / yapamadı</div></div>
    </div>
    <div class="card" style="margin-top:10px"><div class="small muted" style="margin-bottom:6px">Haftanın günleri</div>
      <div class="row spread">${sm.week_days.map((d) => html`<div class="center small"><div class="muted">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][(parseDate(d.date).getDay() + 6) % 7]}</div>
        <span class="ring ${d.state}" style="display:inline-block;width:22px;height:22px" title="${STATE_LABEL[d.state]}"></span></div>`)}</div></div>

    <h2>🔴 Yanlışları kapatılmamış görevler <span class="count">${sm.unclosed.length}</span></h2>
    ${sm.unclosed.length ? html`<div class="red-list">${sm.unclosed.map((t) => html`<a class="list-row" href="#/gun/${t.date}">
        <div class="grow"><b>${t.title}</b><div class="card-sub">${fmtDate(t.date, true)} · ${t.wrong} yanlış, ${t.blank} boş · deftere ${t.mistakes_logged} eklendi</div></div></a>`)}</div>`
      : html`<div class="card small">Hepsi kapatılmış 👍</div>`}
    ${sm.not_started.length ? html`<details><summary>Hiç başlanmamış görevler (${sm.not_started.length})</summary>
      ${sm.not_started.map((t) => html`<div class="list-row"><div class="grow">${t.title}<div class="card-sub">${fmtDate(t.date, true)}</div></div></div>`)}</details>` : ''}

    <h2>Programa uyum ${sm.adherence_rate !== null ? html`<span class="count">%${sm.adherence_rate}</span>` : ''}</h2>
    <div class="card">${sm.adherence.length ? sm.adherence.map((a) => html`<div class="bar-row"><span>${a.subject}</span>
        <div class="bar good"><i style="width:${pct(a.done, a.total)}%"></i></div><span class="small">${a.done}/${a.total}</span></div>`)
      : html`<span class="muted small">Bu hafta görev yok.</span>`}
      ${sm.most_skipped ? html`<p class="small" style="margin-bottom:0">En çok atlanan: <b>${sm.most_skipped.subject}</b> görevleri.
        ${sm.adherence_rate !== null && sm.adherence_rate < 60 ? 'Program fazla yüklü olabilir.' : ''}</p>` : ''}</div>

    <h2>Tekrarlar</h2>
    <div class="card"><div class="row wrap"><span class="badge brand">Bugün bekleyen: ${sm.pending_reviews_today}</span>
      <span class="badge ${sm.missed_reviews.length ? 'bad' : 'good'}">Kaçırılmış: ${sm.missed_reviews.length}</span>
      <span class="badge">İleride planlı: ${sm.upcoming_reviews}</span></div>
      ${sm.missed_reviews.slice(0, 8).map((r) => html`<div class="small" style="margin-top:6px">⏰ ${fmtDate(r.due_date)} · ${r.subject} – ${r.topic || ''}</div>`)}</div>

    ${sm.stuck.length ? html`<h2>⚠️ Takıldığı konular</h2>
      <div class="card alert small">Aynı konuda en az 2 kez “yine yapamadım” dedi. Soru çözdürmek yerine konu tekrarı / anlatım öner.
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

    <h2>🌙 Akşam notları</h2>
    <div class="card">${sm.reflections.length ? sm.reflections.map((r) => html`<div style="padding:5px 0"><b>${fmtDate(r.date, true)}:</b>
        ${r.excused ? html`<span class="badge">Mazeret: ${r.excuse}</span>` : html`${r.topic || r.subject || ''}${r.reflection ? html` — “${r.reflection}”` : ''}`}</div>`)
      : html`<span class="muted small">Bu hafta not yok.</span>`}</div>

    <h2>Net trendi</h2>
    ${trendBlock(sm.trend.TYT)}
    <div style="margin-top:12px">${sm.trend.AYT.total.length ? trendBlock(sm.trend.AYT) : ''}</div>

    <h2>🎯 Haftalık hedef</h2>
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
        <button class="icon-btn" data-act="delnote" data-id="${n.id}" aria-label="Sil">✕</button></div>`)}</div>

    <h2>Paylaş ve dışa aktar</h2>
    <div class="btn-grid"><button class="btn good" data-act="wa">WhatsApp'a gönder</button><button class="btn" data-act="copy">Özeti kopyala</button></div>
    <div class="btn-grid three" style="margin-top:10px">
      <a class="btn sm" href="/api/disari/hatalar.csv">Hatalar CSV</a><a class="btn sm" href="/api/disari/gorevler.csv">Görevler CSV</a><a class="btn sm" href="/api/disari/denemeler.csv">Denemeler CSV</a></div>`.s;
  attachTips(el);
  const again = () => summary(el, { isCurrent });
  bind(el, {
    week: (b) => { weekShown = b.dataset.v; again(); },
    menu: () => menuSheet(),
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
    wa: async () => {
      const { text } = await api.get('/api/whatsapp' + (weekShown ? `?week=${weekShown}` : ''));
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    },
    copy: async () => {
      const { text } = await api.get('/api/whatsapp' + (weekShown ? `?week=${weekShown}` : ''));
      try { await navigator.clipboard.writeText(text); toast('Özet kopyalandı'); } catch { prompt('Kopyala:', text); }
    },
  });
}

function menuSheet() {
  return sheet((s, close) => {
    s.innerHTML = html`<h2>${ctx.user.display_name}</h2><div class="btn-list">
      <button class="btn" data-act="go" data-h="#/defter">📕 Hata defteri</button>
      <button class="btn" data-act="out">Çıkış yap</button></div>`.s;
    bind(s, { go: (b) => { close(); ctx.go(b.dataset.h); }, out: () => { close(); logout(); } });
  });
}

// ---------------------------------------------------------------- haftalık program

let dayShown = null;

export async function program(el, { isCurrent }) {
  const [prog, sm, me] = await Promise.all([api.get('/api/program'), api.get('/api/ozet'), api.get('/api/ben')]);
  if (!isCurrent()) return;
  const todayWd = (parseDate(me.today).getDay() + 6) % 7;
  if (dayShown === null) dayShown = todayWd;
  const day = prog.days[dayShown];
  const KIND = { soru: '📝 Soru', tik: '☑️ Tik', deneme: '📈 Deneme' };
  el.innerHTML = html`
    <div class="topbar"><h1>Haftalık program</h1></div>
    <p class="small muted" style="margin-top:4px">Program <b>her hafta aynen tekrar eder</b>. Değiştirmezsen sürekli devam eder;
      eklediğin/kaldırdığın madde bugünden itibaren geçerli olur, geçmiş günler değişmez.</p>
    <div class="day-tabs">${prog.days.map((d) => html`<button class="${d.weekday === dayShown ? 'on' : ''}" data-act="day" data-v="${d.weekday}">
        ${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][d.weekday]}<small>${d.items.length}</small></button>`)}</div>
    <h2>${day.name}${day.weekday === todayWd ? ' (bugün)' : ''}</h2>
    ${day.items.length ? day.items.map((i) => html`<div class="card tight"><div class="row">
        <div class="grow"><b>${i.title}</b><div class="card-sub">${KIND[i.kind]}${i.subject ? ` · ${i.subject}` : ''}${i.target ? ` · hedef ${i.target}` : ''}${i.exam_type ? ` · ${i.exam_type}` : ''}</div></div>
        <button class="icon-btn" data-act="del" data-id="${i.id}" aria-label="Kaldır">🗑</button></div></div>`)
      : html`<div class="card muted small">Bu gün boş.</div>`}
    <button class="btn primary block big" style="margin-top:12px" data-act="add">+ Programa ekle</button>

    ${sm.suggestions.length ? html`<h2>💡 Öneri: en çok hata biriken konular</h2>
      <p class="small muted">Açık hatası çok olan ya da tekrarda takılan konular. Dokununca programa eklenir.</p>
      ${sm.suggestions.map((s) => html`<div class="list-row" data-act="suggest" data-s="${s.subject_id}" data-t="${s.topic_id || ''}">
        <div class="grow"><b>${s.topic || s.subject}</b><div class="card-sub">${s.subject} · ${s.open_count} açık hata${s.fails ? ` · ${s.fails} kez yapamadı` : ''}</div></div>
        <span class="badge brand">+ ekle</span></div>`)}` : ''}

    <h2>Tek seferlik görevler <span class="count">${prog.one_offs.length}</span></h2>
    <p class="small muted">Belli bir güne özel görev (programda tekrar etmez).</p>
    ${prog.one_offs.map((t) => html`<div class="card tight"><div class="row"><div class="grow"><b>${t.title}</b>
      <div class="card-sub">${fmtDate(t.date, true)} · ${t.creator_role === 'ogrenci' ? 'öğrenci ekledi' : 'sen ekledin'}</div></div>
      ${t.creator_role === 'takipci' ? html`<button class="icon-btn" data-act="deloneoff" data-id="${t.id}" aria-label="Sil">🗑</button>` : ''}</div></div>`)}
    <button class="btn block" style="margin-top:8px" data-act="oneoff">+ Tek seferlik görev</button>`.s;
  const again = () => program(el, { isCurrent });
  bind(el, {
    day: (b) => { dayShown = Number(b.dataset.v); again(); },
    add: async () => { if (await itemSheet({ weekdays: [dayShown] })) again(); },
    suggest: async (b) => {
      if (await itemSheet({ weekdays: [dayShown], subject_id: Number(b.dataset.s), topic_id: b.dataset.t ? Number(b.dataset.t) : null })) again();
    },
    del: async (b) => {
      if (!(await confirmSheet('Bu madde programdan kaldırılsın mı? (Bugünden itibaren gelmez, geçmiş kalır.)', 'Kaldır', true))) return;
      await api.del(`/api/program/${b.dataset.id}`); toast('Kaldırıldı'); again();
    },
    oneoff: async () => { if (await itemSheet({ oneoff: true, date: me.today })) again(); },
    deloneoff: async (b) => {
      try { await api.del(`/api/gorevler/${b.dataset.id}`); again(); } catch (e) { toast(e.message); }
    },
  });
}

function itemSheet(init) {
  const f = { kind: 'soru', subject_id: null, topic_id: null, title: '', target: 20, exam_type: 'TYT', weekdays: [], ...init };
  return sheet((s, close) => {
    const draw = () => {
      const label = f.topic_id ? ctx.topicName(f.topic_id) : f.subject_id ? ctx.subject(f.subject_id).name : null;
      const GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
      s.innerHTML = html`<h2>${f.oneoff ? 'Tek seferlik görev' : 'Programa ekle'}</h2>
        <div class="seg">${[['soru', 'Soru çözme'], ['tik', 'Tik görevi'], ['deneme', 'Deneme']].map(([k, l]) =>
          html`<button class="${f.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}">${l}</button>`)}</div>
        ${f.kind === 'deneme' ? html`<label class="field"><span>Deneme türü</span><div class="seg">${['TYT', 'AYT'].map((t) =>
            html`<button class="${f.exam_type === t ? 'on' : ''}" data-act="etype" data-v="${t}">${t}</button>`)}</div></label>
            <p class="small muted">Öğrenci o gün deneme sonucunu girince görev kendiliğinden tiklenir.</p>` : html`
          <label class="field"><span>Ders / konu${f.kind === 'tik' ? ' (isteğe bağlı)' : ''}</span>
            <button class="btn block" data-act="topic" style="justify-content:flex-start">${label || 'Seç…'}</button></label>`}
        ${f.kind === 'tik' ? html`<label class="field"><span>Ne yapacak?</span>
          <input class="input" id="title" maxlength="120" value="${f.title}" placeholder="Örn: Türev konu anlatımı videosu izle"></label>` : ''}
        ${f.kind === 'soru' ? html`<label class="field"><span>Hedef soru</span><div class="chips">${[10, 15, 20, 30, 40, 60].map((n) =>
          html`<button class="chip ${f.target === n ? 'on' : ''}" data-act="target" data-v="${n}">${n}</button>`)}</div></label>
          <label class="field"><span>Başlık (boş bırakılırsa konu adı)</span><input class="input" id="title" maxlength="120" value="${f.title}" placeholder="Örn: Açıortay 20 soru"></label>` : ''}
        ${f.oneoff ? html`<label class="field"><span>Tarih</span><input type="date" class="input" id="date" value="${f.date}"></label>` : html`
          <label class="field"><span>Hangi günler?</span>
          <div class="chips">${GUN.map((g, i) => html`<button class="chip ${f.weekdays.includes(i) ? 'on' : ''}" data-act="wd" data-v="${i}">${g}</button>`)}</div>
          <div class="chips" style="margin-top:8px"><button class="chip" data-act="preset" data-v="0,1,2,3,4,5,6">Her gün</button>
            <button class="chip" data-act="preset" data-v="0,1,2,3,4">Hafta içi</button><button class="chip" data-act="preset" data-v="5,6">Hafta sonu</button>
            <button class="chip" data-act="preset" data-v="0,2,4">Pzt-Çar-Cum</button></div></label>`}
        <button class="btn primary block big" style="margin-top:16px" data-act="save">Kaydet</button>`.s;
      bind(s, {
        kind: (b) => { keep(); f.kind = b.dataset.v; draw(); },
        etype: (b) => { f.exam_type = b.dataset.v; draw(); },
        target: (b) => { keep(); f.target = Number(b.dataset.v); draw(); },
        wd: (b) => { keep(); const v = Number(b.dataset.v); f.weekdays = f.weekdays.includes(v) ? f.weekdays.filter((x) => x !== v) : [...f.weekdays, v]; draw(); },
        preset: (b) => { keep(); f.weekdays = b.dataset.v.split(',').map(Number); draw(); },
        topic: async () => {
          keep();
          const r = await chooseSubjectTopic({ title: 'Hangi ders?' });
          if (r) Object.assign(f, r);
          draw();
        },
        save: async () => {
          keep();
          const body = { kind: f.kind, title: f.title || null, subject_id: f.subject_id, topic_id: f.topic_id,
            target: f.kind === 'soru' ? f.target : null, exam_type: f.kind === 'deneme' ? f.exam_type : null };
          if (f.kind === 'deneme') { body.subject_id = null; body.topic_id = null; }
          try {
            if (f.oneoff) await api.post('/api/gorevler', { ...body, date: f.date });
            else {
              if (!f.weekdays.length) return toast('En az bir gün seç');
              await api.post('/api/program', { ...body, weekdays: f.weekdays });
            }
            toast('Eklendi'); close(true);
          } catch (e) { toast(e.message); }
        },
      });
    };
    const keep = () => {
      const t = $('#title', s); if (t) f.title = t.value.trim();
      const d = $('#date', s); if (d) f.date = d.value;
    };
    draw();
  });
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


// Haftalık Program sekmesi (öğrenci ve takipçi ortak).
// Pazartesi-Pazar; her güne ayrı ayrı görev eklenir. Öğrenci görevi yapınca tik atar.
import { api, uid } from './api.js';
import { ctx } from './app.js';
import { chooseSubjectTopic } from './picker.js';
import { taskCard } from './student.js';
import { $, STATE_LABEL, addDays, bind, confirmSheet, fmtDate, html, sheet, toast } from './ui.js';

const KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const KIND = { soru: '📝 Soru', tik: '☑️ Tik', deneme: '📈 Deneme' };
let weekStart = null;
let dayIdx = null;

export async function weekView(el, { isCurrent }) {
  const w = await api.get('/api/hafta' + (weekStart ? `?start=${weekStart}` : ''));
  if (!isCurrent()) return;
  weekStart = w.week_start;
  const thisWeek = w.today >= w.week_start && w.today <= w.week_end;
  if (dayIdx === null || dayIdx > 6) dayIdx = thisWeek ? w.days.findIndex((d) => d.is_today) : 0;
  const day = w.days[dayIdx];
  const coach = !ctx.isStudent();
  const real = w.days.flatMap((d) => d.tasks.filter((t) => !t.preview));
  const weekDone = real.filter((t) => t.done).length;
  const sugg = coach ? await api.get('/api/ozet').then((s) => s.suggestions).catch(() => []) : [];
  row.idx = 0;

  el.innerHTML = html`
    <div class="topbar"><div><h1>Haftalık Program</h1><div class="sub">${fmtDate(w.week_start)} – ${fmtDate(w.week_end)}</div></div>
      <div class="row"><button class="icon-btn" data-act="week" data-v="${addDays(w.week_start, -7)}" aria-label="Önceki hafta">‹</button>
      ${thisWeek ? '' : html`<button class="btn sm" data-act="week" data-v="">Bu hafta</button>`}
      <button class="icon-btn" data-act="week" data-v="${addDays(w.week_start, 7)}" aria-label="Sonraki hafta">›</button></div></div>

    ${real.length ? html`<div class="card tight" style="margin-top:6px"><div class="row spread small"><span>Bu haftanın ilerlemesi</span><b>${weekDone}/${real.length} görev</b></div>
      <div class="progress" style="margin-top:6px"><i style="width:${(100 * weekDone) / real.length}%"></i></div></div>` : ''}

    <div class="day-tabs" style="margin-top:10px">${w.days.map((d, i) => {
      const r = d.tasks.filter((t) => !t.preview);
      const sub = d.is_future ? `${d.tasks.length}` : `${r.filter((t) => t.done).length}/${r.length}`;
      return html`<button class="${i === dayIdx ? 'on' : ''} ${d.is_today ? 'today-tab' : ''}" data-act="day" data-v="${i}">
        ${KISA[i]}<small>${sub}</small><span class="tab-dot ${d.state}"></span></button>`;
    })}</div>

    <div class="row spread" style="margin-top:16px">
      <h2 style="margin:0">${day.name} <span class="count">${fmtDate(day.date)}${day.is_today ? ' · bugün' : ''}</span></h2>
      ${day.is_future ? html`<span class="badge">Planlı</span>` : html`<span class="badge ${{ green: 'good', red: 'bad', yellow: 'warn', open: 'brand' }[day.state] || ''}">${STATE_LABEL[day.state]}</span>`}
    </div>

    <div style="margin-top:10px">${day.tasks.length ? day.tasks.map((t) => row(t, coach)) : html`<div class="card muted small">Bu gün için görev yok.</div>`}</div>

    ${coach ? html`<button class="btn primary block big" style="margin-top:12px" data-act="add">+ ${day.name} gününe görev ekle</button>`
      : !day.is_future && !day.tasks.some((t) => t.editable) && day.date < w.today ? ''
      : html`<button class="btn block" style="margin-top:12px" data-act="selfadd">+ ${day.name} gününe kendime görev ekle</button>`}

    ${!coach && day.is_future ? html`<p class="small muted">Bu günün görevleri o gün gelince tiklenebilir.</p>` : ''}
    ${!coach && !day.is_future && day.tasks.length && !day.tasks[0].editable ? html`<p class="small muted">2 günden eski günler kilitlidir.</p>` : ''}

    ${coach ? html`<p class="small muted" style="margin-top:14px">🔁 <b>Her hafta</b> etiketli görevler sen kaldırana kadar her hafta aynı günde tekrar eder.
      <b>Sadece bu gün</b> etiketliler bir kez çıkar.</p>
      ${sugg.length ? html`<h2>💡 Öneri: en çok hata biriken konular</h2>
        <p class="small muted">Dokununca ${day.name} gününe eklemek için açılır.</p>
        ${sugg.map((s) => html`<div class="list-row" data-act="suggest" data-s="${s.subject_id}" data-t="${s.topic_id || ''}">
          <div class="grow"><b>${s.topic || s.subject}</b><div class="card-sub">${s.subject} · ${s.open_count} açık hata${s.fails ? ` · ${s.fails} kez yapamadı` : ''}</div></div>
          <span class="badge brand">+ ekle</span></div>`)}` : ''}` : ''}`.s;

  const again = () => weekView(el, { isCurrent });
  const find = (b) => day.tasks[Number(b.dataset.i)];
  bind(el, {
    week: (b) => { weekStart = b.dataset.v || null; dayIdx = null; again(); },
    day: (b) => { dayIdx = Number(b.dataset.v); again(); },
    add: async () => { if (await itemSheet({ day, today: w.today })) again(); },
    suggest: async (b) => {
      if (await itemSheet({ day, today: w.today, subject_id: Number(b.dataset.s), topic_id: b.dataset.t ? Number(b.dataset.t) : null })) again();
    },
    selfadd: () => ctx.go(`#/gorev-ekle?tarih=${day.date}`),
    tick: async (b) => {
      const t = find(b);
      const r = await api.save('PATCH', `/api/gorevler/${t.id}`, { ticked: !t.ticked });
      if (r.queued) toast('İnternet yok; bağlanınca gönderilecek');
      else if (r.completed_at) toast('Görev tamamlandı ✓');
      again();
    },
    open: async (b) => { await taskSheet(find(b)); again(); },
    exam: (b) => ctx.go(`#/deneme-ekle?tur=${find(b).exam_type || 'TYT'}`),
    del: async (b) => {
      const t = find(b);
      if (t.repeats) {
        if (!(await confirmSheet(`“${t.title}” her ${day.name} tekrar ediyor. Programdan kaldırılsın mı? (Bugünden itibaren gelmez, geçmiş kalır.)`, 'Kaldır', true))) return;
        await api.del(`/api/program/${t.program_item_id}`);
      } else {
        if (!(await confirmSheet(`“${t.title}” silinsin mi?`, 'Sil', true))) return;
        try { await api.del(`/api/gorevler/${t.id}`); } catch (e) { return toast(e.message); }
      }
      toast('Kaldırıldı'); again();
    },
  });
}

function row(t, coach) {
  const i = row.idx++;
  const tag = t.repeats ? html`<span class="badge brand">🔁 Her hafta</span>` : html`<span class="badge">Sadece bu gün</span>`;
  const own = t.creator_role === 'ogrenci' ? html`<span class="badge">öğrenci ekledi</span>` : '';
  const nums = t.kind === 'soru' && t.correct + t.wrong + t.blank
    ? html`<div class="small" style="margin-top:3px">D ${t.correct} · Y ${t.wrong} · B ${t.blank}${t.wrong + t.blank
      ? (t.closed ? ' · yanlışlar kapatıldı ✓' : html` · <b style="color:var(--critical-ink)">yanlışlar kapatılmadı</b>`) : ''}</div>` : '';
  const sub = html`<div class="card-sub">${KIND[t.kind]}${t.subject ? ` · ${t.subject}` : ''}${t.target ? ` · hedef ${t.target} soru` : ''}</div>`;
  // tik kutusu: öğrenci düzenleyebildiği günlerde dokunur, diğer durumlarda sadece durumu gösterir
  let act = '';
  if (!coach && t.editable) act = t.kind === 'tik' ? 'tick' : t.kind === 'soru' ? 'open' : 'exam';
  const box = html`<span class="check ${t.done ? 'on' : ''} ${act ? '' : 'static'}" role="checkbox" aria-checked="${t.done ? 'true' : 'false'}">✓</span>`;
  const status = t.preview ? html`<span class="badge">Planlı</span>`
    : t.done ? html`<span class="badge good">Yapıldı</span>`
    : t.editable ? '' : html`<span class="badge bad">Yapılmadı</span>`;
  return html`<div class="card tight ${t.done ? 'done' : ''}" style="margin-top:8px">
    <div class="task-head" ${act ? html`data-act="${act}" data-i="${i}" style="cursor:pointer"` : ''}>
      ${box}
      <div class="grow"><div class="card-title">${t.title}</div>${sub}${nums}
        <div class="row wrap" style="margin-top:4px">${coach || t.preview ? tag : ''}${own}${status}</div></div>
      ${coach && (t.repeats || t.creator_role === 'takipci') ? html`<button class="icon-btn" data-act="del" data-i="${i}" aria-label="Kaldır">🗑</button>` : ''}
    </div>
    ${act === 'open' && !t.done ? html`<div class="small muted" style="margin:6px 0 0 56px">Dokun: doğru/yanlış/boş gir</div>` : ''}
  </div>`;
}
row.idx = 0;

// soru görevi: doğru/yanlış/boş girişi ve "yanlışlar kapatıldı" onayı (Bugün ekranındaki kartın aynısı)
function taskSheet(task) {
  const t = { ...task };
  return sheet((s, close) => {
    const draw = () => {
      s.innerHTML = html`${taskCard(t)}<button class="btn block" style="margin-top:12px" data-act="done">Tamam</button>`.s;
      s.querySelectorAll('input[data-f]').forEach((inp) => {
        inp.onfocus = () => inp.select();
        inp.onchange = () => set(inp.dataset.f, Math.max(0, parseInt(inp.value || '0', 10) || 0));
      });
    };
    let timer;
    const save = async (body) => {
      const r = await api.save('PATCH', `/api/gorevler/${t.id}`, body);
      if (!r.queued) Object.assign(t, { ...r, done: !!r.completed_at });
      draw();
      if (r.completed_at && !task._toasted) { task._toasted = true; toast('Görev tamamlandı ✓'); }
    };
    const set = (f, v) => {
      t[f] = v;
      if (t.wrong + t.blank === 0) t.closed = 0;
      draw();
      clearTimeout(timer);
      timer = setTimeout(() => save({ correct: t.correct, wrong: t.wrong, blank: t.blank }), 400);
    };
    bind(s, {
      inc: (b) => set(b.dataset.f, Math.max(0, t[b.dataset.f] + Number(b.dataset.d))),
      close: () => { clearTimeout(timer); save({ correct: t.correct, wrong: t.wrong, blank: t.blank, closed: !t.closed }); },
      tomistake: () => { close(); ctx.go(`#/hata-ekle?gorev=${t.id}`); },
      done: async () => { clearTimeout(timer); await save({ correct: t.correct, wrong: t.wrong, blank: t.blank }); close(); },
    });
    draw();
  });
}

// takipçi: belli bir güne görev ekleme (her hafta tekrar / sadece bu gün)
export function itemSheet(init) {
  const { day, today } = init;
  const past = day.date < today;
  const f = { kind: 'soru', subject_id: null, topic_id: null, title: '', target: 20, exam_type: 'TYT',
    repeat: true, weekdays: [day.weekday], ...init };
  return sheet((s, close) => {
    const draw = () => {
      const label = f.topic_id ? ctx.topicName(f.topic_id) : f.subject_id ? ctx.subject(f.subject_id).name : null;
      s.innerHTML = html`<h2>${day.name} gününe görev</h2>
        <div class="seg">${[['soru', 'Soru çözme'], ['tik', 'Tik görevi'], ['deneme', 'Deneme']].map(([k, l]) =>
          html`<button class="${f.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}">${l}</button>`)}</div>
        ${f.kind === 'deneme' ? html`<label class="field"><span>Deneme türü</span><div class="seg">${['TYT', 'AYT'].map((t) =>
            html`<button class="${f.exam_type === t ? 'on' : ''}" data-act="etype" data-v="${t}">${t}</button>`)}</div></label>
            <p class="small muted">Öğrenci o gün deneme sonucunu girince kendiliğinden tiklenir.</p>` : html`
          <label class="field"><span>Ders / konu${f.kind === 'tik' ? ' (isteğe bağlı)' : ''}</span>
            <button class="btn block" data-act="topic" style="justify-content:flex-start">${label || 'Seç…'}</button></label>`}
        ${f.kind === 'tik' ? html`<label class="field"><span>Ne yapacak?</span>
          <input class="input" id="title" maxlength="120" value="${f.title}" placeholder="Örn: Türev konu anlatımı videosu izle"></label>` : ''}
        ${f.kind === 'soru' ? html`<label class="field"><span>Hedef soru</span><div class="chips">${[10, 15, 20, 30, 40, 60].map((n) =>
          html`<button class="chip ${f.target === n ? 'on' : ''}" data-act="target" data-v="${n}">${n}</button>`)}</div></label>
          <label class="field"><span>Başlık (boş bırakılırsa konu adı)</span><input class="input" id="title" maxlength="120" value="${f.title}" placeholder="Örn: Açıortay 20 soru"></label>` : ''}
        ${past ? html`<p class="small card info">${day.name} bu hafta geçti. Görev <b>gelecek ${day.name}</b> gününden itibaren her hafta çıkar.</p>`
          : html`<label class="field"><span>Tekrar</span><div class="seg">
          <button class="${f.repeat ? 'on' : ''}" data-act="repeat" data-v="1">🔁 Her hafta</button>
          <button class="${f.repeat ? '' : 'on'}" data-act="repeat" data-v="0">Sadece ${fmtDate(day.date)}</button></div></label>`}
        ${f.repeat ? html`<label class="field"><span>Hangi günler? (başka günlere de aynı anda ekleyebilirsin)</span>
          <div class="chips">${KISA.map((g, i) => html`<button class="chip ${f.weekdays.includes(i) ? 'on' : ''}" data-act="wd" data-v="${i}">${g}</button>`)}</div>
          <div class="chips" style="margin-top:8px"><button class="chip" data-act="preset" data-v="0,1,2,3,4,5,6">Her gün</button>
            <button class="chip" data-act="preset" data-v="0,1,2,3,4">Hafta içi</button><button class="chip" data-act="preset" data-v="5,6">Hafta sonu</button></div></label>` : ''}
        <button class="btn primary block big" style="margin-top:16px" data-act="save">Kaydet</button>`.s;
      bind(s, {
        kind: (b) => { keep(); f.kind = b.dataset.v; draw(); },
        etype: (b) => { f.exam_type = b.dataset.v; draw(); },
        target: (b) => { keep(); f.target = Number(b.dataset.v); draw(); },
        repeat: (b) => { keep(); f.repeat = b.dataset.v === '1'; draw(); },
        wd: (b) => { keep(); const v = Number(b.dataset.v); f.weekdays = f.weekdays.includes(v) ? f.weekdays.filter((x) => x !== v) : [...f.weekdays, v]; draw(); },
        preset: (b) => { keep(); f.weekdays = b.dataset.v.split(',').map(Number); draw(); },
        topic: async () => { keep(); const r = await chooseSubjectTopic({ title: 'Hangi ders?' }); if (r) Object.assign(f, r); draw(); },
        save: async () => {
          keep();
          const body = { kind: f.kind, title: f.title || null, subject_id: f.subject_id, topic_id: f.topic_id,
            target: f.kind === 'soru' ? f.target : null, exam_type: f.kind === 'deneme' ? f.exam_type : null };
          if (f.kind === 'deneme') { body.subject_id = null; body.topic_id = null; }
          try {
            if (f.repeat) {
              if (!f.weekdays.length) return toast('En az bir gün seç');
              await api.post('/api/program', { ...body, weekdays: f.weekdays });
            } else {
              await api.post('/api/gorevler', { ...body, date: day.date, client_id: uid() });
            }
            toast('Eklendi'); close(true);
          } catch (e) { toast(e.message); }
        },
      });
    };
    const keep = () => { const t = $('#title', s); if (t) f.title = t.value.trim(); };
    draw();
  });
}

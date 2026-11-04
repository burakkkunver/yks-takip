// Öğrenci: ana ekran (bugünün görevleri → bugünkü tekrarlar → hata ekle) ve görev ekleme.
import { api, uid } from './api.js';
import { ctx, logout } from './app.js';
import { chooseSubjectTopic, expandHandler, subjectButtons, topicButtons } from './picker.js';
import { $, addDays, bind, esc, fmtDate, html, photoUrl, relDay, ringsHtml, sheet, toast } from './ui.js';

let state = null;

export async function home(el, { isCurrent }) {
  const data = await api.get('/api/bugun');
  if (!isCurrent()) return;
  state = data;
  draw(el);
}

function draw(el) {
  const d = state;
  const doneN = d.tasks.filter((t) => t.done).length;
  const unread = d.notes.filter((n) => !n.read_at);
  el.innerHTML = html`
    <div class="topbar">
      <div><h1>Bugün</h1><div class="sub">${fmtDate(d.date, true)}</div></div>
      <button class="icon-btn" data-act="menu" aria-label="Menü">⋯</button>
    </div>

    <div class="card chain" style="margin-top:8px">
      <div class="chain-count" title="Zincir">🔗 ${d.chain.current}</div>
      <div class="grow">
        <div class="small muted">gün zincir · rekor ${d.chain.best}</div>
        ${ringsHtml(d.chain.last14)}
      </div>
    </div>

    ${d.day.excused ? html`<div class="card info" style="margin-top:10px">
        <b>Bugün mazeretli:</b> ${d.day.excuse}. Zincir donduruldu, kırılmaz.
        <div><button class="btn ghost sm" data-act="unexcuse">Geri al</button></div></div>` : ''}

    ${d.goal ? html`<div class="card goal" style="margin-top:10px"><div class="small muted">🎯 Haftanın hedefi</div>
        <div class="card-title">${d.goal.text}</div></div>` : ''}

    ${unread.map((n) => html`<div class="card info" style="margin-top:10px">
        <div class="small muted">💬 Takipçinden not · ${fmtDate(n.created_at.slice(0, 10))}</div>
        <div style="white-space:pre-wrap">${n.text}</div>
        <button class="btn sm" style="margin-top:8px" data-act="readnote" data-id="${n.id}">Okudum 👍</button></div>`)}

    <h2>Bugünün görevleri <span class="count">${doneN}/${d.tasks.length}</span></h2>
    ${d.tasks.length ? '' : html`<div class="card muted">Bugün için görev yok.</div>`}
    <div id="tasks">${d.tasks.map(taskCard)}</div>
    <button class="btn ghost block" data-act="addtask">+ Kendime görev ekle</button>

    <h2>Bugün tekrar çöz <span class="count">${d.reviews.length}</span></h2>
    ${d.reviews.length ? d.reviews.map(reviewRow)
      : html`<div class="card muted small">Bugün tekrar edilecek soru yok. Hata ekledikçe 2. ve 7. günde burada çıkacak.</div>`}

    ${d.ask_reflection ? html`<div class="card" style="margin-top:22px">
        <div class="card-title">🌙 Günün kapanışı</div>
        <div class="card-sub">Bugün en çok nerede zorlandın?</div>
        <div class="btn-grid" style="margin-top:10px">
          <button class="btn" data-act="reflect">Konu seç</button>
          <button class="btn" data-act="reflect-none">Zorlanmadım</button>
        </div></div>` : d.day.reflected_at ? html`<p class="small muted center" style="margin-top:18px">🌙 Günün kapanışı yapıldı${d.day.reflection ? `: “${esc(d.day.reflection)}”` : ''}</p>` : ''}

    ${!d.day.excused ? html`<p class="center" style="margin-top:20px">
        <button class="btn ghost sm" data-act="excuse">Bugün çalışamadım${d.excuses_left ? '' : ' (bu hafta hakkın kalmadı)'}</button></p>` : ''}

    <button class="fab" data-act="addmistake">+ Hata ekle</button>`.s;

  bind(el, {
    menu: () => menuSheet(),
    addmistake: () => ctx.go('#/hata-ekle'),
    addtask: () => ctx.go('#/gorev-ekle'),
    inc: (b) => changeCount(el, Number(b.dataset.task), b.dataset.f, Number(b.dataset.d)),
    tick: (b) => patchTask(el, Number(b.dataset.task), { ticked: !findTask(b.dataset.task).ticked }),
    close: (b) => patchTask(el, Number(b.dataset.task), { closed: !findTask(b.dataset.task).closed }),
    tomistake: (b) => ctx.go(`#/hata-ekle?gorev=${b.dataset.task}`),
    exam: (b) => ctx.go(`#/deneme-ekle?tur=${b.dataset.type || 'TYT'}`),
    review: (b) => reviewSheet(el, Number(b.dataset.id)),
    readnote: async (b) => {
      await api.save('POST', `/api/notlar/${b.dataset.id}/okundu`);
      state.notes.find((n) => n.id === Number(b.dataset.id)).read_at = 'now';
      draw(el);
    },
    reflect: () => reflectSheet(el),
    'reflect-none': async () => {
      await api.save('POST', '/api/gun/kapanis', { date: state.date, none: true });
      toast('Günün kapanışı kaydedildi 🌙');
      refresh(el);
    },
    excuse: () => excuseSheet(el),
    unexcuse: async () => {
      try { await api.del(`/api/gun/mazeret?date=${state.date}`); refresh(el); } catch (e) { toast(e.message); }
    },
  });
  // elle sayı girişi
  el.querySelectorAll('input[data-f]').forEach((inp) => {
    inp.onchange = () => {
      const t = findTask(inp.dataset.task);
      const v = Math.max(0, Math.min(999, parseInt(inp.value || '0', 10) || 0));
      changeCount(el, t.id, inp.dataset.f, v - t[inp.dataset.f]);
    };
    inp.onfocus = () => inp.select();
  });
}

async function refresh(el) {
  state = await api.get('/api/bugun');
  draw(el);
}

const findTask = (id) => state.tasks.find((t) => t.id === Number(id));

function taskCard(t) {
  const creator = t.creator_role === 'ogrenci' ? html`<span class="badge">kendi görevim</span>` : '';
  if (t.kind === 'tik') {
    return html`<div class="card ${t.done ? 'done' : ''}" id="task-${t.id}">
      <div class="task-head" data-act="tick" data-task="${t.id}" style="cursor:pointer">
        <span class="check ${t.ticked ? 'on' : ''}" role="checkbox" aria-checked="${t.ticked ? 'true' : 'false'}">✓</span>
        <div class="grow"><div class="card-title">${t.title}</div>
        <div class="card-sub">${t.subject || ''} ${creator}</div></div>
      </div></div>`;
  }
  if (t.kind === 'deneme') {
    return html`<div class="card ${t.done ? 'done' : ''}" id="task-${t.id}">
      <div class="task-head">
        <span class="check static ${t.done ? 'on' : ''}">✓</span>
        <div class="grow"><div class="card-title">${t.title}</div>
        <div class="card-sub">${t.done ? 'Deneme girildi' : 'Deneme sonucunu girince kendiliğinden tiklenir'}</div></div>
      </div>
      ${t.done ? '' : html`<button class="btn primary block" style="margin-top:10px" data-act="exam" data-type="${t.exam_type || 'TYT'}">Deneme sonucunu gir</button>`}
    </div>`;
  }
  const wb = t.wrong + t.blank;
  const answered = t.correct + t.wrong + t.blank;
  const stepper = (f, label, cls) => html`<div class="stepper ${cls}"><label>${label}</label><div class="ctl">
      <button data-act="inc" data-task="${t.id}" data-f="${f}" data-d="-1" aria-label="${label} azalt">−</button>
      <input inputmode="numeric" pattern="[0-9]*" value="${t[f]}" data-task="${t.id}" data-f="${f}" aria-label="${label}">
      <button data-act="inc" data-task="${t.id}" data-f="${f}" data-d="1" aria-label="${label} artır">+</button></div></div>`;
  return html`<div class="card ${t.done ? 'done' : ''}" id="task-${t.id}">
    <div class="task-head">
      <span class="check static ${t.done ? 'on' : ''}" aria-label="${t.done ? 'Tamamlandı' : 'Tamamlanmadı'}">✓</span>
      <div class="grow"><div class="card-title">${t.title}</div>
        <div class="card-sub">${t.subject || ''}${t.target ? ` · hedef ${t.target} soru` : ''}${answered ? ` · ${answered} soru girildi` : ''} ${creator}</div></div>
    </div>
    ${t.editable ? html`<div class="steppers">${stepper('correct', 'Doğru', 'd')}${stepper('wrong', 'Yanlış', 'y')}${stepper('blank', 'Boş', 'b')}</div>` : ''}
    ${wb > 0 ? (t.closed
      ? html`<div class="close-box ok"><div class="close-toggle" data-act="close" data-task="${t.id}">
          <span class="check on">✓</span><span>Yanlışlar kapatıldı</span></div></div>`
      : html`<div class="close-box">
          <div class="small"><b>${t.wrong} yanlış, ${t.blank} boş</b> kapatılmadan görev tamamlanmaz.
          Çözümüne bak, anla, hata defterine ekle.</div>
          <button class="btn block" style="margin-top:8px" data-act="tomistake" data-task="${t.id}">
            📕 Hata defterine ekle (${t.mistakes_logged}/${wb} eklendi)</button>
          <div class="close-toggle" style="margin-top:6px" data-act="close" data-task="${t.id}">
            <span class="check"></span><span>Yanlışlarımı kapattım</span></div>
        </div>`) : ''}
  </div>`;
}

function reviewRow(r) {
  const late = r.overdue ? html`<span class="badge bad">${relDay(r.due_date, state.date)} gecikti</span>` : '';
  return html`<div class="list-row" data-act="review" data-id="${r.review_id}">
    ${r.photo ? html`<img class="thumb" src="${photoUrl(r.photo)}" alt="" loading="lazy">` : html`<div class="thumb" style="display:grid;place-items:center">🔁</div>`}
    <div class="grow"><div class="card-title">${r.topic || r.subject}</div>
      <div class="card-sub">${r.subject} · ${r.reason}${r.source ? ` · ${r.source}` : ''}${r.page ? ` s.${r.page}` : ''}${r.qno ? ` #${r.qno}` : ''}</div>
      <div class="row wrap" style="margin-top:4px">${late}${r.review_stage === 1 ? html`<span class="badge brand">7. gün</span>` : html`<span class="badge">2. gün</span>`}
      ${r.fail_count ? html`<span class="badge warn">${r.fail_count} kez yapamadı</span>` : ''}</div>
    </div><span aria-hidden="true">›</span></div>`;
}

async function changeCount(el, id, field, delta) {
  const t = findTask(id);
  const v = Math.max(0, t[field] + delta);
  if (v === t[field]) return;
  t[field] = v;
  if (t.wrong + t.blank === 0) t.closed = 0;
  redrawTask(el, t);
  clearTimeout(t._timer);
  t._timer = setTimeout(() => patchTask(el, id, { correct: t.correct, wrong: t.wrong, blank: t.blank }, false), 500);
}

async function patchTask(el, id, body, optimistic = true) {
  const t = findTask(id);
  if (optimistic) { Object.assign(t, Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)]))); redrawTask(el, t); }
  try {
    const r = await api.save('PATCH', `/api/gorevler/${id}`, body);
    if (r.queued) {
      toast('İnternet yok, kaydedildi; bağlanınca gönderilecek');
    } else {
      const wasDone = t.done;
      Object.assign(t, { correct: r.correct, wrong: r.wrong, blank: r.blank, closed: r.closed, ticked: r.ticked, completed_at: r.completed_at, done: !!r.completed_at });
      redrawTask(el, t);
      if (!wasDone && t.done) {
        toast(state.tasks.every((x) => x.done) ? 'Bugünün görevleri tamam! 🔗' : 'Görev tamamlandı ✓');
        if (state.tasks.every((x) => x.done)) refresh(el);
      }
    }
  } catch (e) { toast(e.message); refresh(el); }
}

function redrawTask(el, t) {
  const node = $(`#task-${t.id}`, el);
  if (!node) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = taskCard(t).s;
  node.replaceWith(tmp.firstElementChild);
  el.querySelectorAll(`#task-${t.id} input[data-f]`).forEach((inp) => {
    inp.onchange = () => {
      const v = Math.max(0, Math.min(999, parseInt(inp.value || '0', 10) || 0));
      changeCount(el, t.id, inp.dataset.f, v - t[inp.dataset.f]);
    };
    inp.onfocus = () => inp.select();
  });
  const doneN = state.tasks.filter((x) => x.done).length;
  const cnt = el.querySelector('h2 .count');
  if (cnt) cnt.textContent = `${doneN}/${state.tasks.length}`;
}

function reviewSheet(el, reviewId) {
  const r = state.reviews.find((x) => x.review_id === reviewId);
  return sheet((s, close) => {
    s.innerHTML = html`
      <div class="small muted">${r.subject} · ${r.review_stage === 1 ? '7. gün tekrarı' : '2. gün tekrarı'}</div>
      <h2 style="margin-top:2px">${r.topic || r.subject}</h2>
      <div class="row wrap"><span class="badge">${r.kind === 'bos' ? 'Boş' : 'Yanlış'} · ${r.reason}</span>
        ${r.source ? html`<span class="badge brand">📖 ${r.source}${r.page ? ` s.${r.page}` : ''}${r.qno ? ` #${r.qno}` : ''}</span>` : ''}</div>
      ${r.photo ? html`<img class="photo" style="margin-top:12px" src="${photoUrl(r.photo)}" alt="Soru">`
        : html`<div class="card muted small" style="margin-top:12px">Fotoğraf yok. ${r.source ? 'Kitaptan soruyu bul ve yeniden çöz.' : 'Soruyu bulup yeniden çöz.'}</div>`}
      ${r.note ? html`<div class="card" style="margin-top:10px">✏️ ${r.note}</div>` : ''}
      ${r.solution_photo ? html`<details style="margin-top:8px"><summary>Önce kendin çöz, sonra: Çözümü göster</summary>
        <img class="photo" src="${photoUrl(r.solution_photo)}" alt="Çözüm"></details>` : ''}
      <p class="small muted">Soruyu yeniden çöz. Bakmadan çözebildin mi?</p>
      <div class="btn-grid"><button class="btn danger big" data-act="fail">✗ Yine yapamadım</button>
        <button class="btn good big" data-act="ok">✓ Çözdüm</button></div>`.s;
    const done = async (result) => {
      const res = await api.save('POST', `/api/tekrar/${reviewId}`, { result });
      close();
      if (res.queued) toast('Kaydedildi; internet gelince gönderilecek');
      else if (result === 'yapamadim') toast('Sorun değil. 2 gün sonra tekrar karşına çıkacak.');
      else toast(res.next_due ? `Harika! ${fmtDate(res.next_due)} günü bir kez daha çıkacak.` : 'Harika! Bu hata kapandı ✓', 3200);
      refresh(el);
    };
    bind(s, { fail: () => done('yapamadim'), ok: () => done('cozdum') });
  });
}

function reflectSheet(el) {
  return sheet((s, close) => {
    let pick = { subject_id: null, topic_id: null };
    const step1 = () => {
      s.innerHTML = html`<h2>Bugün en çok nerede zorlandın?</h2>${subjectButtons()}`.s;
      bind(s, { subject: (b) => { pick.subject_id = Number(b.dataset.id); step2(); } });
    };
    const step2 = () => {
      const sub = ctx.subject(pick.subject_id);
      s.innerHTML = html`<div class="crumbs"><button data-act="back">‹ ${sub.name}</button></div><h2>Hangi konu?</h2>${topicButtons(sub, { general: true })}`.s;
      bind(s, { back: step1, expand: expandHandler(s), topic: (b) => { pick.topic_id = b.dataset.id ? Number(b.dataset.id) : null; step3(); } });
    };
    const step3 = () => {
      const name = pick.topic_id ? ctx.topicName(pick.topic_id) : ctx.subject(pick.subject_id).name;
      s.innerHTML = html`<h2>${name}</h2>
        <label class="field"><span>Kısa not (isteğe bağlı)</span>
        <textarea class="input" id="rnote" maxlength="300" placeholder="Örn: hareket problemlerinde denklemi kuramıyorum"></textarea></label>
        <button class="btn primary block big" style="margin-top:12px" data-act="save">Kaydet</button>`.s;
      bind(s, {
        save: async () => {
          await api.save('POST', '/api/gun/kapanis', { date: state.date, ...pick, note: $('#rnote', s).value.trim() || null });
          close(); toast('Günün kapanışı kaydedildi 🌙'); refresh(el);
        },
      });
    };
    step1();
  });
}

function excuseSheet(el) {
  if (!state.excuses_left) { toast('Bu hafta mazeret hakkını kullandın (haftada 1 gün)'); return; }
  return sheet((s, close) => {
    s.innerHTML = html`<h2>Bugün çalışamadın mı?</h2>
      <p class="small muted">Zincir kırılmaz, <b>donar</b>. Haftada 1 gün hakkın var. Takipçin sebebi görür.</p>
      <div class="btn-list">${['Hastayım', 'Okulda sınav / etkinlik', 'Ailevi durum', 'Yolculuk', 'Diğer'].map((x) =>
        html`<button class="btn" data-act="pick" data-v="${x}">${x}</button>`)}</div>`.s;
    bind(s, {
      pick: async (b) => {
        try {
          await api.post('/api/gun/mazeret', { date: state.date, excuse: b.dataset.v });
          close(); toast('Bugün mazeretli işaretlendi'); refresh(el);
        } catch (e) { toast(e.message); }
      },
    });
  });
}

function menuSheet() {
  return sheet((s, close) => {
    s.innerHTML = html`<h2>${ctx.user.display_name}</h2>
      <div class="btn-list">
        <button class="btn" data-act="go" data-h="#/gecmis">🔗 Geçmiş ve zincir</button>
        <button class="btn" data-act="go" data-h="#/defter">📕 Hata defteri</button>
        <button class="btn" data-act="out">Çıkış yap</button>
      </div>`.s;
    bind(s, { go: (b) => { close(); ctx.go(b.dataset.h); }, out: () => { close(); logout(); } });
  });
}

// ---------------------------------------------------------------- görev ekleme (öğrenci)

export async function addTask(el) {
  const today = (await api.get('/api/ben')).today;
  const f = { kind: 'soru', subject_id: null, topic_id: null, title: '', target: 20, date: today };
  const draw2 = () => {
    const label = f.topic_id ? ctx.topicName(f.topic_id) : f.subject_id ? ctx.subject(f.subject_id).name : null;
    el.innerHTML = html`
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Geri">‹</button><h1 class="grow">Kendime görev ekle</h1></div>
      <div class="seg" style="margin-top:8px">
        <button class="${f.kind === 'soru' ? 'on' : ''}" data-act="kind" data-v="soru">Soru çözme</button>
        <button class="${f.kind === 'tik' ? 'on' : ''}" data-act="kind" data-v="tik">Tik görevi</button></div>
      <label class="field"><span>Ders / konu</span>
        <button class="btn block" data-act="topic" style="justify-content:flex-start">${label || 'Seç…'}</button></label>
      ${f.kind === 'tik' ? html`<label class="field"><span>Ne yapacaksın?</span>
        <input class="input" id="title" maxlength="120" value="${f.title}" placeholder="Örn: Türev konu anlatımı izle"></label>` : html`
        <label class="field"><span>Hedef soru sayısı</span>
        <div class="chips">${[10, 20, 30, 40, 50].map((n) => html`<button class="chip ${f.target === n ? 'on' : ''}" data-act="target" data-v="${n}">${n}</button>`)}</div></label>`}
      <label class="field"><span>Ne zaman?</span>
        <div class="chips">${[[0, 'Bugün'], [1, 'Yarın'], [2, 'Öbür gün']].map(([n, l]) => {
          const ds = addDays(today, n);
          return html`<button class="chip ${f.date === ds ? 'on' : ''}" data-act="date" data-v="${ds}">${l}</button>`;
        })}</div></label>
      <button class="btn primary block big" style="margin-top:20px" data-act="save">Görevi ekle</button>`.s;
    bind(el, {
      back: () => history.back(),
      kind: (b) => { f.kind = b.dataset.v; draw2(); },
      target: (b) => { f.target = Number(b.dataset.v); draw2(); },
      date: (b) => { f.date = b.dataset.v; draw2(); },
      topic: async () => {
        keepTitle();
        const r = await chooseSubjectTopic({ title: 'Hangi ders?' });
        if (r) Object.assign(f, r);
        draw2();
      },
      save: async () => {
        keepTitle();
        if (!f.subject_id && !(f.kind === 'tik' && f.title.trim())) return toast('Ders/konu seç' + (f.kind === 'tik' ? ' ya da ne yapacağını yaz' : ''));
        try {
          await api.save('POST', '/api/gorevler', { ...f, target: f.kind === 'soru' ? f.target : null, client_id: uid() });
          toast('Görev eklendi'); ctx.go('#/');
        } catch (e) { toast(e.message); }
      },
    });
  };
  const keepTitle = () => { const t = $('#title', el); if (t) f.title = t.value; };
  draw2();
}


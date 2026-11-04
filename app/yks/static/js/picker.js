// Ders ve konu seçicileri: her şey dokunarak seçilir, son kullanılanlar üstte.
import { ctx } from './app.js';
import { $$, bind, html, sheet } from './ui.js';

export function subjectButtons(selectedId = null, filter = null) {
  const recent = ctx.meta.recent_subjects;
  let subs = ctx.meta.subjects.filter((s) => !filter || filter(s));
  subs = [...subs.filter((s) => recent.includes(s.id)).sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id)),
    ...subs.filter((s) => !recent.includes(s.id))];
  return html`<div class="btn-grid">${subs.map((s) =>
    html`<button class="btn ${recent.includes(s.id) ? 'recent' : ''} ${s.id === selectedId ? 'primary' : ''}"
      data-act="subject" data-id="${s.id}">${s.name}</button>`)}</div>`;
}

export function topicButtons(subject, { general = false } = {}) {
  const recentIds = ctx.meta.recent_topics;
  const all = [];
  subject.topics.forEach((t) => { all.push({ id: t.id, name: t.name }); t.children.forEach((c) => all.push({ id: c.id, name: `${t.name} › ${c.name}` })); });
  const recent = recentIds.map((id) => all.find((x) => x.id === id)).filter(Boolean).slice(0, 6);
  return html`
    ${recent.length ? html`<div class="small muted" style="margin-bottom:6px">Son kullanılanlar</div>
      <div class="btn-list" style="margin-bottom:14px">${recent.map((t) =>
        html`<button class="btn recent" data-act="topic" data-id="${t.id}">${t.name}</button>`)}</div>
      <div class="small muted" style="margin-bottom:6px">Tüm konular</div>` : ''}
    <div class="btn-list">
      ${general ? html`<button class="btn" data-act="topic" data-id="">Konu seçmeden devam et<span class="tag">genel</span></button>` : ''}
      ${subject.topics.map((t) => t.children.length
        ? html`<button class="btn" data-act="expand" data-id="${t.id}">${t.name}<span class="tag">${t.children.length} alt konu ›</span></button>
          <div class="btn-list sub" data-parent="${t.id}" hidden style="padding-left:16px">
            <button class="btn" data-act="topic" data-id="${t.id}">${t.name} (genel)</button>
            ${t.children.map((c) => html`<button class="btn" data-act="topic" data-id="${c.id}">${c.name}</button>`)}
          </div>`
        : html`<button class="btn" data-act="topic" data-id="${t.id}">${t.name}</button>`)}
    </div>`;
}

export function expandHandler(root) {
  return (el) => {
    const box = root.querySelector(`[data-parent="${el.dataset.id}"]`);
    const open = box.hidden;
    $$('.sub', root).forEach((b) => { b.hidden = true; });
    box.hidden = !open;
    if (open) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
}

/** Alt sayfada ders → konu seçtirir. {subject_id, topic_id} ya da null döner. */
export function chooseSubjectTopic({ title = 'Ders seç', topicOptional = true, subjectId = null } = {}) {
  return sheet((el, close) => {
    const showSubjects = () => {
      el.innerHTML = html`<h2>${title}</h2>${subjectButtons()}`.s;
      bind(el, { subject: (b) => showTopics(Number(b.dataset.id)) });
    };
    const showTopics = (sid) => {
      const s = ctx.subject(sid);
      el.innerHTML = html`<div class="crumbs"><button data-act="back">‹ ${s.name}</button></div>
        <h2>Konu seç</h2>${topicButtons(s, { general: topicOptional })}`.s;
      bind(el, {
        back: showSubjects,
        expand: expandHandler(el),
        topic: (b) => close({ subject_id: sid, topic_id: b.dataset.id ? Number(b.dataset.id) : null }),
      });
    };
    if (subjectId) showTopics(subjectId); else showSubjects();
  });
}

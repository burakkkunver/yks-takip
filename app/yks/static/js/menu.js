// Menü sekmesi: uygulamanın bütün bölümleri büyük kutucuklar halinde.
import { ctx, logout } from './app.js';
import { bind, html } from './ui.js';

const STUDENT = [
  ['#/', '🏠', 'Bugün', 'Bugünün görevleri ve tekrarlar', true],
  ['#/program', '🗓️', 'Haftalık Program', 'Pazartesi–Pazar görevlerin, tik at', true],
  ['#/hata-ekle', '➕', 'Hata ekle', '3 dokunuşta deftere yaz'],
  ['#/defter', '📕', 'Hata defteri', 'Açık ve kapanan hatalar'],
  ['#/deneme-ekle', '📝', 'Deneme gir', 'TYT / AYT sonuçları'],
  ['#/deneme', '📈', 'Denemeler', 'Net grafikleri'],
  ['#/gecmis', '🔗', 'Geçmiş ve zincir', 'Takvim, gün gün ne yapıldı'],
  ['#/gorev-ekle', '✍️', 'Kendime görev ekle', 'Programa ek görev'],
];
const COACH = [
  ['#/', '📊', 'Haftalık özet', 'Kapatma oranı ve durum', true],
  ['#/program', '🗓️', 'Haftalık Program', 'Günlere görev ekle, tikleri gör', true],
  ['#/konular', '🧭', 'Konu durumu', 'Hangi konuda hata birikiyor'],
  ['#/defter', '📕', 'Hata defteri', 'Öğrencinin hataları'],
  ['#/deneme', '📈', 'Denemeler', 'Net trendi'],
  ['#/gecmis', '🔗', 'Geçmiş ve zincir', 'Takvim, gün gün ne yapıldı'],
  ['#/ozet/hedef', '🎯', 'Hedef ve not', 'Haftalık hedef, öğrenciye mesaj'],
  ['#/ozet/paylas', '📤', 'Paylaş', 'WhatsApp özeti, CSV'],
];

export function menu(el) {
  const items = ctx.isStudent() ? STUDENT : COACH;
  el.innerHTML = html`
    <div class="topbar"><div><h1>Menü</h1><div class="sub">${ctx.user.display_name} · ${ctx.isStudent() ? 'öğrenci' : 'takipçi'}</div></div></div>
    <div class="tiles">${items.map(([href, ic, t, d, hl]) => html`<a class="tile ${hl ? 'hl' : ''}" href="${href}">
      <span class="ic" aria-hidden="true">${ic}</span><span><div class="t">${t}</div><div class="d">${d}</div></span></a>`)}
      <button class="tile wide" data-act="out"><span class="ic" aria-hidden="true">🚪</span><span class="t">Çıkış yap</span></button>
    </div>`.s;
  bind(el, { out: () => logout() });
}

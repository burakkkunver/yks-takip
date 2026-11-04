// Basit, bağımlılıksız SVG çizgi grafik. Tek seri (ders başına küçük grafik) — renk tek, açıklama başlıkta.
import { esc, fmtNet, fmtShort } from './ui.js';

/**
 * @param {object} o  dates: ['2026-11-01',...], values: [..], height, yMin, yMax, unit
 */
export function lineChart({ dates, values, height = 160, yMin = null, yMax = null, compact = false, labels = [] }) {
  const W = compact ? 170 : 320, H = height;
  const pad = compact ? { l: 22, r: 8, t: 16, b: 8 } : { l: 30, r: 14, t: 16, b: 22 };
  if (!values.length) return '<p class="small muted">Henüz deneme yok.</p>';
  let lo = yMin ?? Math.min(0, ...values), hi = yMax ?? Math.max(...values);
  if (hi - lo < 4) hi = lo + 4;
  const niceStep = (hi - lo) / 3;
  const ticks = [0, 1, 2, 3].map((i) => lo + niceStep * i);
  const x = (i) => pad.l + (values.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (values.length - 1));
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const step = values.length > 1 ? (W - pad.l - pad.r) / (values.length - 1) : W;
  const last = values.length - 1;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Net grafiği">`;
  ticks.forEach((t) => {
    s += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    s += `<text x="${pad.l - 5}" y="${y(t) + 3.5}" text-anchor="end">${Math.round(t)}</text>`;
  });
  if (!compact) {
    const every = Math.ceil(values.length / 6);
    dates.forEach((d, i) => {
      if (i % every === 0 || i === last) s += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle">${fmtShort(d)}</text>`;
    });
  }
  if (values.length > 1) s += `<polyline class="line" points="${pts}"/>`;
  values.forEach((v, i) => {
    s += `<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="${i === last ? 5 : 4}"/>`;
  });
  // son değer etiketi
  s += `<text class="val" x="${Math.min(x(last), W - pad.r)}" y="${y(values[last]) - 9}" text-anchor="${values.length > 1 ? 'end' : 'middle'}">${fmtNet(values[last])}</text>`;
  // dokunma alanları (işaretten geniş)
  values.forEach((v, i) => {
    const tip = `${fmtShort(dates[i])}${labels[i] ? ' · ' + labels[i] : ''}: ${fmtNet(v)} net`;
    s += `<rect class="hit" x="${x(i) - step / 2}" y="0" width="${step}" height="${H}" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`;
  });
  return s + '</svg>';
}

/** Grafik üstünde dokununca/üzerine gelince değeri yanındaki .chart-tip alanında gösterir. */
export function attachTips(root) {
  root.querySelectorAll('.chart').forEach((svg) => {
    const tip = svg.parentElement.querySelector('.chart-tip');
    if (!tip) return;
    const show = (e) => { const r = e.target.closest('.hit'); if (r) tip.textContent = r.dataset.tip; };
    svg.addEventListener('pointerover', show);
    svg.addEventListener('click', show);
  });
}

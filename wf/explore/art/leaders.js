export const RULES = { maxLen: 300, headlineMax: 740, labelInkMax: 0.02, bgDiff: 36, landRadius: 6, overModelWarn: 0.5, textPad: 6, tailSkip: 40 };
const svgNS = 'http://www.w3.org/2000/svg';

export function segHitsRect(p, q, r) {
  let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
  for (const [pp, qq] of [[-dx, p.x - r.left], [dx, r.right - p.x], [-dy, p.y - r.top], [dy, r.bottom - p.y]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-3;
}
export function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 1.5;
  if (near(a, c) || near(a, d) || near(b, c) || near(b, d)) return false;
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
const segLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
const lineRects = (el, pad = 0) => { const rg = document.createRange(); rg.selectNodeContents(el);
  return [...rg.getClientRects()].filter((r) => r.width > 0).map((r) => ({ left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad, width: r.width })); };

function frameReader(canvas, width, height, paperHex) {
  if (!canvas) return null;
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, width, height);
  const px = g.getImageData(0, 0, width, height).data;
  const h = paperHex.replace('#', ''); const P = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ink = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = (y * width + x) * 4; return Math.max(Math.abs(px[i] - P[0]), Math.abs(px[i + 1] - P[1]), Math.abs(px[i + 2] - P[2])) > RULES.bgDiff; };
  return { ink };
}

export function layoutLeaders(o) {
  const { svg, host, width: W, height: H, callouts, project, pick, partOf, canvas, paper = '#E0DDD6', headline } = o;
  svg.replaceChildren(); host.replaceChildren();
  const els = callouts.map((c) => {
    const el = document.createElement('div');
    el.className = 'callout' + (c.accent ? ' accent' : '') + (c.side === 'right' ? ' right' : '') + (c.kind === 'tag' ? ' tag' : '');
    el.innerHTML = '<div class="t"></div>' + (c.s ? '<div class="s"></div>' : '');
    el.querySelector('.t').textContent = c.t; if (c.s) el.querySelector('.s').textContent = c.s;
    el.style.position = 'absolute';
    if (c.side === 'right') el.style.right = (W - c.x) + 'px'; else el.style.left = c.x + 'px';
    el.style.top = c.y + 'px'; if (c.w) el.style.maxWidth = c.w + 'px'; host.appendChild(el); return el;
  });
  const HM = o.headlineMax ?? RULES.headlineMax;
  if (headline) headline.style.maxWidth = HM + 'px';
  const sel = '.callout .t, .callout .s, h1, .kicker, .lede, .caption' + (o.textSelector ? ', ' + o.textSelector : '');
  const texts = [...document.querySelectorAll(sel)].flatMap((e) => lineRects(e, RULES.textPad).map((r) => ({ ...r, owner: e.closest('.callout') })));
  const report = { ok: true, violations: [], warnings: [], leaders: [], headline: null };
  const bad = (rule, id, detail) => { report.violations.push({ rule, id, detail }); report.ok = false; };
  const warn = (rule, id, detail) => report.warnings.push({ rule, id, detail });
  const placed = [];
  callouts.forEach((c, k) => {
    const el = els[k], r = el.getBoundingClientRect(), a = project(c.id);
    if (!a || !a.visible || a.x < 0 || a.y < 0 || a.x > W || a.y > H) { bad('anchor', c.id, 'anchor off frame or behind the camera'); return; }
    const A = { x: a.x, y: a.y }, above = a.y < r.top;
    const uy = above ? r.top - (c.kind === 'tag' ? 8 : 12) : r.bottom + (c.kind === 'tag' ? 6 : 10);
    const far = c.side === 'left' ? r.left : r.right, near = c.side === 'left' ? r.right : r.left, out = c.side === 'left' ? 1 : -1;
    const s = { x: near, y: uy };
    const cands = [[s, A], [s, { x: near + out * 60, y: uy }, A], [s, { x: A.x, y: uy }, A], [s, { x: near + out * 140, y: uy }, A], [s, { x: near + out * 240, y: uy }, A]]
      .filter((pts) => pts.every((p, i) => i === 0 || i === pts.length - 1 || (out > 0 ? p.x >= near : p.x <= near)));
    const score = (route) => {
      const full = [{ x: far, y: uy }, ...route]; let t = 0, x = 0;
      for (let i = 1; i < route.length; i++) for (const b of texts) if (b.owner !== el && segHitsRect(route[i - 1], route[i], b)) t++;
      for (const q of placed) for (let i = 1; i < full.length; i++) for (let j = 1; j < q.length; j++) if (segsCross(full[i - 1], full[i], q[j - 1], q[j])) x++;
      return { t, x, len: segLen(route), cost: (t + x) * 1e5 + segLen(route) };
    };
    let best = null; for (const rt of cands) { const sc = score(rt); if (!best || sc.cost < best.sc.cost) best = { rt, sc }; }
    const route = best.rt, full = [{ x: far, y: uy }, ...route]; placed.push(full);
    const pl = document.createElementNS(svgNS, 'polyline');
    pl.setAttribute('points', full.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', c.accent ? 'var(--accent)' : 'var(--ink)');
    pl.setAttribute('stroke-width', c.accent ? '3' : '2'); pl.setAttribute('stroke-linejoin', 'round'); pl.dataset.id = c.id; svg.appendChild(pl);
    const ring = document.createElementNS(svgNS, 'circle'); ring.setAttribute('cx', A.x); ring.setAttribute('cy', A.y); ring.setAttribute('r', c.kind === 'tag' ? '7' : '9');
    ring.setAttribute('fill', 'var(--bg-paper)'); ring.setAttribute('stroke', 'var(--ink)'); ring.setAttribute('stroke-width', '2'); svg.appendChild(ring);
    const dot = document.createElementNS(svgNS, 'circle'); dot.setAttribute('cx', A.x); dot.setAttribute('cy', A.y); dot.setAttribute('r', c.kind === 'tag' ? '3' : '4');
    dot.setAttribute('fill', c.accent ? 'var(--accent)' : 'var(--ink)'); svg.appendChild(dot);
    report.leaders.push({ id: c.id, k, A, route, full, el, best: best.sc });
  });
  const fr = frameReader(canvas, W, H, paper);
  for (let i = 0; i < report.leaders.length; i++) for (let j = i + 1; j < report.leaders.length; j++) {
    const p = report.leaders[i].full, q = report.leaders[j].full;
    for (let a = 1; a < p.length; a++) for (let b = 1; b < q.length; b++) if (segsCross(p[a - 1], p[a], q[b - 1], q[b])) bad('cross', report.leaders[i].id + ' x ' + report.leaders[j].id, 'leaders cross');
  }
  report.leaders = report.leaders.map((L) => {
    const c = callouts[L.k], part = c.part || (partOf ? partOf(c.id) : c.id);
    const length = Math.round(segLen(L.route)), bends = Math.max(0, L.route.length - 2);
    if (length > RULES.maxLen) warn('length', c.id, `${length} px > ${RULES.maxLen}`);
    for (let i = 1; i < L.route.length; i++) for (const b of texts) if (b.owner !== L.el && segHitsRect(L.route[i - 1], L.route[i], b)) { bad('text', c.id, 'leader runs through text'); break; }
    let landed = null, hit = null;
    if (pick) { const pts = [[0, 0], ...[...Array(8)].map((_, q) => [Math.cos(q * Math.PI / 4) * RULES.landRadius, Math.sin(q * Math.PI / 4) * RULES.landRadius])];
      landed = false; for (const [dx, dy] of pts) { const ids = pick(L.A.x + dx, L.A.y + dy); if (!hit && ids) hit = ids.slice(0, 6); if (ids && ids.includes(part)) { landed = true; break; } }
      if (!landed) bad('landing', c.id, `dot does not land on ${part} (hit: ${hit ? hit.join(',') : 'nothing'})`); }
    let labelInk = null, overModel = null;
    if (fr) {
      let n = 0, m = 0;
      for (const e of L.el.querySelectorAll('.t, .s')) for (const r of lineRects(e)) for (let y = r.top; y < r.bottom; y += 3) for (let x = r.left; x < r.right; x += 3) { n++; if (fr.ink(x, y)) m++; }
      labelInk = n ? +(m / n).toFixed(4) : 0; if (labelInk > RULES.labelInkMax) bad('paper', c.id, `label over the model: ${(labelInk * 100).toFixed(1)}% of its pixels`);
      const total = segLen(L.route) - RULES.tailSkip; let walked = 0, over = 0, cnt = 0;
      for (let i = 1; i < L.route.length && walked < total; i++) { const p = L.route[i - 1], q = L.route[i], l = Math.hypot(q.x - p.x, q.y - p.y);
        for (let d = 0; d < l && walked + d < total; d += 4) { cnt++; if (fr.ink(p.x + (q.x - p.x) * d / l, p.y + (q.y - p.y) * d / l)) over++; } walked += l; }
      overModel = cnt ? +(over / cnt).toFixed(3) : 0; if (overModel > RULES.overModelWarn) warn('overModel', c.id, `${Math.round(overModel * 100)}% of the leader is drawn over the model`);
    }
    return { id: c.id, part, length, bends, anchor: { x: Math.round(L.A.x), y: Math.round(L.A.y) }, landed, hit, labelInk, overModel, label: L.el.getBoundingClientRect().toJSON() };
  });
  if (headline) { const ws = lineRects(headline.querySelector('h1') || headline).map((r) => r.width); const w = Math.round(Math.max(0, ...ws));
    report.headline = { width: w, max: HM }; if (w > HM) bad('headline', 'headline', `${w} px > ${HM}`);
    if (fr) { let n = 0, m = 0; for (const e of headline.querySelectorAll('h1, .kicker, .lede')) for (const r of lineRects(e)) for (let y = r.top; y < r.bottom; y += 3) for (let x = r.left; x < r.right; x += 3) { n++; if (fr.ink(x, y)) m++; }
      report.headline.ink = n ? +(m / n).toFixed(4) : 0; if (report.headline.ink > RULES.labelInkMax) bad('paper', 'headline', `headline over the model: ${(report.headline.ink * 100).toFixed(1)}% of its pixels`); } }
  window.__leaderReport = report;
  return report;
}

export function pickerFor(model, studio, width, height) {
  return (x, y) => { const h = model.pick((x / width) * 2 - 1, -((y / height) * 2 - 1), studio.camera); return h ? h.ids : null; };
}

export function figureBBox(roots, camera, width, height) {
  const out = [];
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  for (const root of roots) {
    const list = (Array.isArray(root) ? root : [root]).filter(Boolean); if (!list.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of list) { r.updateMatrixWorld(true); r.traverse((m) => {
      if (!m.isMesh || !shown(m)) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!mats.some((t) => t && t.visible !== false && (!t.transparent || (t.opacity ?? 1) >= 0.35))) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox, v = b.min.clone();
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).project(camera);
        if (v.z > 1) continue;
        const x = (v.x + 1) / 2 * width, y = (1 - v.y) / 2 * height;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }); }
    if (x1 > x0) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(width, x1); y1 = Math.min(height, y1);
      out.push({ x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }); }
  }
  return out;
}

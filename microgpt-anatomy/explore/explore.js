import * as THREE from 'three';
import { DATA } from './run/scenes/style-frame/data.js';
import { XDATA, XSTRINGS } from './data-explore.js';
import { createStack, loadFonts, tokens, LAYERS } from './art/stack.js';

const Q = new URLSearchParams(location.search);
const LANG = Q.get('lang') === 'ko' ? 'ko' : 'en';
const S = XSTRINGS[LANG], X = S.scenes.explore;
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (LANG === 'ko') { document.documentElement.lang = 'ko'; document.body.classList.add('ko'); }

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const Xf = (t) => ((ax * t + bx) * t + cx) * t, Yf = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { x = clamp(x, 0, 1); let t = x; for (let i = 0; i < 8; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t = clamp(t - (Xf(t) - x) / d, 0, 1); } return Yf(t); };
}
const { tok, num } = tokens();
const easeOf = (name) => { const m = tok(name).match(/cubic-bezier\(([^)]+)\)/); return bezier(...(m ? m[1] : '0.65,0,0.35,1').split(',').map(Number)); };
const EASE = easeOf('--ease-move');
const DUR = parseFloat(tok('--dur-mid')) || 0.8;

$('headline').textContent = X.headline;
if (LANG === 'ko') document.querySelector('.kicker').textContent = X.kicker;
$('stage').setAttribute('aria-label', X.aria);
$('tab-nums').textContent = X.sec_nums; $('tab-files').textContent = X.sec_files; $('tab-by').textContent = X.sec_by;
$('explode-label').textContent = X.explode; $('reset').textContent = X.reset; $('hint').textContent = X.hint;
$('plates').setAttribute('aria-label', X.plates);
await loadFonts(LANG, S);

const canvas = $('stage');
let W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const ST = createStack(THREE, { DATA, S, LANG, current: null, renderer });
const { scene, plates, COL, C, PW, PD, PT, GAP, PIERCE } = ST;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const EL0 = num('--cam-elevation'), AZ0 = num('--cam-azimuth');

const veilCol = new THREE.Color(ST.mix(C.face, '#EEECE7', 0.3));
for (const p of plates) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshBasicMaterial({ color: veilCol, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.006; m.renderOrder = 2; p.grp.add(m); p.veil = m;
}

const st = {
  sel: LAYERS.includes(Q.get('sel')) ? Q.get('sel') : null,
  tab: ['nums', 'files', 'by'].includes(Q.get('tab')) ? Q.get('tab') : 'nums',
  explode: clamp(Number(Q.get('explode') ?? 25), 0, 100) / 100,
  az: clamp(Number(Q.get('az') ?? AZ0), -70, 70), el: clamp(Number(Q.get('el') ?? EL0), 12, 72),
  zoom: clamp(Number(Q.get('zoom') ?? 1), 1, 4),
};
$('explode').value = String(Math.round(st.explode * 100));
const cur = { ys: plates.map((p) => p.y), veil: plates.map(() => 0), focus: 0 };
let anim = null;

const baseYs = () => plates.map((p, i) => (LAYERS.length - 1 - i) * GAP * (1 + 0.9 * st.explode));
const focusEl = () => clamp(st.el + 30, 50, 72);
const LIFT = 30;
function targets() {
  const s = st.sel ? LAYERS.indexOf(st.sel) : -1, b = baseYs();
  const ys = b.map((y, i) => (s < 0 ? y : i < s ? y + LIFT : y));
  const veil = plates.map((p) => (st.sel && p.layer !== st.sel ? 0.5 : 0));
  return { ys, veil, focus: s < 0 ? 0 : 1 };
}
function apply(v) {
  plates.forEach((p, i) => { ST.setPlateY(p.layer, v.ys[i]); p.veil.material.opacity = v.veil[i]; p.veil.visible = v.veil[i] > 0.001;
    p.edges.material.opacity = st.sel ? (p.layer === st.sel ? 0.9 : 0.25) : 0.55; });
  ST.setThread(1, Math.max(...v.ys) + 1.4, Math.min(...v.ys) - 2.2);
}
function go(snap) {
  const T = targets();
  if (snap || reduced) { cur.ys = T.ys; cur.veil = T.veil; cur.focus = T.focus; anim = null; apply(cur); draw(); return; }
  anim = { t0: performance.now(), from: { ys: cur.ys.slice(), veil: cur.veil.slice(), focus: cur.focus }, to: T };
  requestAnimationFrame(tick);
}
function tick(now) {
  if (!anim) return;
  const f = EASE(clamp((now - anim.t0) / (DUR * 1000), 0, 1));
  cur.ys = anim.from.ys.map((a, i) => a + (anim.to.ys[i] - a) * f);
  cur.veil = anim.from.veil.map((a, i) => a + (anim.to.veil[i] - a) * f);
  cur.focus = anim.from.focus + (anim.to.focus - anim.from.focus) * f;
  apply(cur); draw();
  if (f < 1) requestAnimationFrame(tick); else anim = null;
}

const narrow = () => W < 760;
function freeRect() {
  const hb = document.querySelector('.head').getBoundingClientRect();
  if (narrow()) {
    const pt = $('panel').getBoundingClientRect().top;
    return { x0: W * 0.05, x1: W * 0.95, y0: hb.bottom + 14, y1: pt - 10 };
  }
  const pl = $('panel').getBoundingClientRect().left;
  return { x0: W * 0.05 + 170, x1: pl - 36, y0: hb.bottom + 44, y1: H * 0.95 - 22 };
}
function focusRect() {
  const R = freeRect();
  return narrow() ? R : { x0: W * 0.05, x1: R.x1, y0: R.y0, y1: R.y1 };
}
function fitPlate(rect, el, az, y) {
  const c = new THREE.Vector3(0, ST.stackH / 2, 0);
  const tmp = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  tmp.position.copy(c).addScaledVector(ST.camDir(el, az), 120); tmp.lookAt(c); tmp.updateMatrixWorld();
  const pts = [];
  for (const x of [-PW / 2, PIERCE.x + 1.2]) for (const sz of [-1, 1]) for (const d of [0, -PT]) pts.push(new THREE.Vector3(x, y + d, sz * PD / 2));
  const v = pts.map((q) => q.applyMatrix4(tmp.matrixWorldInverse));
  const umin = Math.min(...v.map((q) => q.x)), umax = Math.max(...v.map((q) => q.x)), vmin = Math.min(...v.map((q) => q.y)), vmax = Math.max(...v.map((q) => q.y));
  const sc = Math.min((rect.x1 - rect.x0) / (umax - umin), (rect.y1 - rect.y0) / (vmax - vmin));
  const uc = (umin + umax) / 2, vc = (vmin + vmax) / 2, Xc = (rect.x0 + rect.x1) / 2, Yc = (rect.y0 + rect.y1) / 2;
  return { el, az, target: c, s: sc, X0: Xc - uc * sc, Y0: Yc + vc * sc };
}
function zoomPose(P, rect, z) {
  const Xc = (rect.x0 + rect.x1) / 2, Yc = (rect.y0 + rect.y1) / 2;
  return { ...P, s: P.s * z, X0: Xc + (P.X0 - Xc) * z, Y0: Yc + (P.Y0 - Yc) * z };
}
const toScreen = (p) => { const n = p.clone().project(cam); return { x: (n.x + 1) / 2 * W, y: (1 - n.y) / 2 * H }; };

const NS = 'http://www.w3.org/2000/svg', svg = $('leaders');
const labs = plates.map((p) => {
  const el = document.createElement('div'); el.className = 'lab callout';
  const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = COL[p.layer]; el.appendChild(sw);
  el.appendChild(document.createTextNode(S.layers[p.layer]));
  el.addEventListener('click', () => select(p.layer, true, true));
  $('labels').appendChild(el); return el;
});
$('thread-callout').textContent = S.thread;

let view = null;
function draw() {
  W = innerWidth; H = innerHeight;
  const R = freeRect(), z = st.zoom, fo = cur.focus;
  const close = z > 1.05 || fo > 0.02;
  document.body.classList.toggle('zoomed', close);
  let P = zoomPose(ST.fitPose(R, st.el, st.az, baseYs()), R, z);
  if (st.sel && fo > 0.001) {
    const RF = focusRect(), i = LAYERS.indexOf(st.sel);
    P = ST.lerpPose(P, zoomPose(fitPlate(RF, focusEl(), st.az, baseYs()[i]), RF, z), fo);
  }
  ST.applyPose(cam, P, W, H);
  renderer.render(scene, cam);
  if (close) {
    const hb = document.querySelector('.head').getBoundingClientRect(), pr = $('panel').getBoundingClientRect();
    const e1 = pr.left - 44, e0 = e1 - 60;
    view = narrow() ? { x1: W, y0: hb.bottom + 8, y1: pr.top - 8 } : { x1: e1, y0: hb.bottom + 16, y1: H };
    canvas.style.clipPath = `inset(${view.y0}px ${W - view.x1}px ${H - view.y1}px 0)`;
    canvas.style.maskImage = narrow() ? '' : `linear-gradient(to right, #000 ${e0}px, transparent ${e1}px)`;
  } else { view = null; canvas.style.clipPath = ''; canvas.style.maskImage = ''; }
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  if (narrow() || close) return;
  plates.forEach((p, i) => {
    const a = toScreen(new THREE.Vector3(-PW / 2, cur.ys[i] - PT / 2, PD / 2 - 0.4));
    const el = labs[i]; el.classList.toggle('on', p.layer === st.sel);
    const r = el.getBoundingClientRect();
    const x = Math.max(W * 0.05, a.x - 30 - r.width);
    el.style.left = x + 'px'; el.style.top = clamp(a.y - r.height / 2, H * 0.05, H * 0.95 - r.height) + 'px';
    const on = p.layer === st.sel;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', x + r.width + 4); ln.setAttribute('y1', a.y); ln.setAttribute('x2', a.x - 6); ln.setAttribute('y2', a.y);
    ln.setAttribute('stroke', on ? C.ink : 'rgba(23,25,28,0.4)'); ln.setAttribute('stroke-width', on ? 2 : 1.25); svg.appendChild(ln);
    const d = document.createElementNS(NS, 'circle'); d.setAttribute('cx', a.x - 4); d.setAttribute('cy', a.y); d.setAttribute('r', 3.5);
    d.setAttribute('fill', on ? C.ink : 'rgba(23,25,28,0.6)'); svg.appendChild(d);
  });
  const e = toScreen(new THREE.Vector3(PIERCE.x, Math.min(...cur.ys) - 2.2, PIERCE.z));
  const co = $('thread-callout'); const maxX = $('panel').getBoundingClientRect().left - 40;
  co.style.maxWidth = Math.max(140, maxX - e.x - 24) + 'px'; co.style.left = (e.x + 22) + 'px';
  co.style.top = Math.min(H * 0.95 - co.offsetHeight, e.y - 12) + 'px';
  const t = document.createElementNS(NS, 'line'); t.setAttribute('x1', e.x + 8); t.setAttribute('y1', e.y); t.setAttribute('x2', e.x + 18); t.setAttribute('y2', e.y);
  t.setAttribute('stroke', C.thread); t.setAttribute('stroke-width', 3); svg.appendChild(t);
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const swatch = (layer) => { const s = el('span', 'sw'); s.style.background = COL[layer]; return s; };
const btns = [];
{
  const all = el('button', 'all', X.all); all.dataset.layer = ''; btns.push(all);
  for (const k of LAYERS) { const b = el('button'); b.appendChild(swatch(k)); b.appendChild(document.createTextNode(S.layers[k])); b.dataset.layer = k; btns.push(b); }
  for (const b of btns) {
    b.setAttribute('role', 'radio'); $('plates').appendChild(b);
    b.addEventListener('click', () => select(b.dataset.layer || null, true));
  }
}
function rows(pairs, cls) {
  const dl = el('dl', 'rows' + (cls ? ' ' + cls : ''));
  for (const [k, v, layer] of pairs) {
    const dt = el('dt'); if (layer) { const s = el('span', 'lay'); s.appendChild(swatch(layer)); s.appendChild(document.createTextNode(k)); dt.appendChild(s); } else dt.textContent = k;
    dl.appendChild(dt); dl.appendChild(el('dd', null, v));
  }
  return dl;
}
const MAX_TYPE_MIN = Math.max(...Object.values(XDATA.branches).flatMap((b) => {
  const m = {}; for (const s of b.subs) m[s.type] = (m[s.type] || 0) + s.min; return Object.values(m); }));
function subsBlock(b) {
  const box = document.createDocumentFragment();
  const byType = {};
  for (const s of b.subs) (byType[s.type] = byType[s.type] || []).push(s);
  const types = Object.keys(byType).sort((a, c) => byType[c].length - byType[a].length || a.localeCompare(c));
  const maxMin = MAX_TYPE_MIN;
  const g = el('div', 'subs');
  for (const t of types) {
    const list = byType[t], mins = list.reduce((a, s) => a + s.min, 0), calls = list.reduce((a, s) => a + s.calls, 0);
    g.appendChild(el('span', 'ty', t));
    const bar = el('span', 'bar');
    for (const s of list) {
      const i = el('i', t === 'general-purpose' ? 'gp' : ''); i.style.width = `calc(${(100 * s.min / maxMin).toFixed(2)}% - 2px)`;
      i.title = `${t} · ${s.min} ${X.col_min} · ${s.calls} ${X.col_calls}`; bar.appendChild(i);
    }
    g.appendChild(bar);
    g.appendChild(el('span', 'sum', `×${list.length} · ${mins.toFixed(1)} ${X.col_min} · ${calls} ${X.col_calls}`));
  }
  box.appendChild(g);
  return box;
}
function branchBlock(kind, id) {
  const b = XDATA.branches[id], f = document.createDocumentFragment();
  const p = el('p', 'by'); p.appendChild(el('span', 'k', X[kind] + ' ')); p.appendChild(document.createTextNode(X.branch[id])); f.appendChild(p);
  f.appendChild(rows([[X.sub_sum, `${b.sub_n} · ${b.sub_min.toFixed(1)} ${X.col_min} · ${b.sub_calls} ${X.col_calls}`],
    [X.branch_calls, b.tool_calls.toLocaleString('en-US')], [X.branch_hours, b.active_hours.toFixed(2)]]));
  f.appendChild(subsBlock(b));
  return f;
}
function panel() {
  const k = st.sel, L = k ? XDATA.layers[k] : null;
  btns.forEach((b) => { const on = (b.dataset.layer || null) === k; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  $('t-chip').style.background = k ? COL[k] : 'transparent'; $('t-chip').style.display = k ? '' : 'none';
  $('t-name').textContent = k ? S.layers[k] : X.all;
  $('t-note').textContent = k ? S.layer_notes[k] : X.overview;
  $('tabs').hidden = !k;
  for (const t of ['nums', 'files', 'by']) { const on = !k ? t === 'nums' : t === st.tab; $('tab-' + t).setAttribute('aria-selected', String(on)); $('tab-' + t).tabIndex = on ? 0 : -1; $('pane-' + t).hidden = !on; }
  const pn = $('pane-nums'), pf = $('pane-files'), pb = $('pane-by');
  pn.replaceChildren(); pf.replaceChildren(); pb.replaceChildren();
  if (!k) {
    pn.appendChild(el('p', 'sec', S.thread));
    pn.appendChild(rows(LAYERS.map((l) => [S.layers[l], DATA.thread[l], l]), 'thread'));
    return;
  }
  pn.appendChild(el('p', 'sec', X.sec_thread));
  pn.appendChild(rows(L.thread.map(([key, v]) => [X.th[key], v]), 'thread'));
  pn.appendChild(el('p', 'sec', X.sec_nums));
  pn.appendChild(rows(L.nums.map(([key, v]) => [X.num[key], v])));
  const ul = el('ul', 'files');
  for (const f of L.files) {
    const i = f.path.lastIndexOf('/'); const li = el('li', 'p'); li.appendChild(el('span', 'dir', f.path.slice(0, i + 1))); li.appendChild(document.createTextNode(f.path.slice(i + 1)));
    ul.appendChild(li); ul.appendChild(el('li', 'n', `${f.lines.toLocaleString('en-US')} ${X.lines}`));
  }
  pf.appendChild(ul);
  if (L.files_total) pf.appendChild(el('p', 'small', `${X.files_more}: ${L.files_total.n} · ${L.files_total.lines.toLocaleString('en-US')} ${X.lines}`));
  if (!L.by) { pb.appendChild(el('p', 'small', X.none_by)); return; }
  pb.appendChild(branchBlock(L.how === 'read' ? 'how_read' : 'how_built', L.by));
  if (L.checked) pb.appendChild(branchBlock('checked', L.checked));
  pb.appendChild(el('p', 'small', `${X.record_note} ${X.snapshot}: ${XDATA.snapshot.slice(0, 10)}`));
}
function select(layer, animate, toggle = false) {
  if (toggle && layer === st.sel) layer = null;
  st.sel = layer; panel(); go(!animate);
}
for (const t of ['nums', 'files', 'by']) $('tab-' + t).addEventListener('click', () => { st.tab = t; panel(); });
$('tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const order = ['nums', 'files', 'by']; const i = (order.indexOf(st.tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
  st.tab = order[i]; panel(); $('tab-' + st.tab).focus(); e.preventDefault(); e.stopPropagation();
});
$('explode').addEventListener('input', (e) => { st.explode = Number(e.target.value) / 100; go(true); });
$('reset').addEventListener('click', () => { st.az = AZ0; st.el = EL0; st.zoom = 1; st.explode = 0.25; $('explode').value = '25'; go(false); });

addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const i = st.sel ? LAYERS.indexOf(st.sel) : (e.key === 'ArrowDown' ? -1 : LAYERS.length);
    const j = clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, LAYERS.length - 1);
    st.sel = LAYERS[j]; panel(); go(false);
    if (t && t.closest && t.closest('#plates')) btns[j + 1].focus();
    e.preventDefault();
  } else if ((e.key === '+' || e.key === '=' || e.key === '-') && !(t instanceof HTMLInputElement)) {
    st.zoom = clamp(st.zoom * (e.key === '-' ? 1 / 1.25 : 1.25), 1, 4); draw(); e.preventDefault();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(t.closest && t.closest('#plates, #tabs'))) {
    st.az = clamp(st.az + (e.key === 'ArrowLeft' ? -8 : 8), -70, 70); draw(); e.preventDefault();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.closest && t.closest('#plates')) {
    const i = btns.indexOf(t); const j = (i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
    btns[j].focus(); select(btns[j].dataset.layer || null, true); e.preventDefault();
  }
});

const ray = new THREE.Raycaster();
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: st.az, el: st.el, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  if (!drag.moved) return;
  st.az = clamp(drag.az - dx * 0.25, -70, 70); st.el = clamp(drag.el + dy * 0.18, 12, 72); draw();
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
    const hit = ray.intersectObjects(plates.flatMap((p) => [p.body, p.top]), false)[0];
    const p = hit && plates.find((q) => q.body === hit.object || q.top === hit.object);
    select(p ? p.layer : null, true, true);
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => { st.zoom = clamp(st.zoom * Math.exp(-e.deltaY * 0.0015), 1, 4); draw(); e.preventDefault(); }, { passive: false });
addEventListener('resize', () => { W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); draw(); });

panel(); go(true);
window.__figureBBox = () => ST.screenBoxes(cam, W, H).map((b) => {
  if (!view) return b;
  const x1 = Math.min(b.x + b.w, view.x1), y0 = Math.max(b.y, view.y0), y1 = Math.min(b.y + b.h, view.y1);
  return { x: b.x, y: y0, w: x1 - b.x, h: y1 - y0 };
}).filter((b) => b.w > 1 && b.h > 1);
window.__scene = {
  duration: 0, width: W, height: H,
  async seek() { go(true); },
};
await document.fonts.ready;
go(true);
window.__ready = true;

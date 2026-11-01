import * as THREE from 'three';
import { createStudio, createModel, CAMERAS, lerpCamera } from './art/model.js';
import { layoutLeaders, pickerFor, figureBBox, segHitsRect, segsCross } from './art/leaders.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.get('still') === '1';

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { x = clamp01(x); let t = x; for (let i = 0; i < 8; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t = clamp01(t - (X(t) - x) / d); } return Y(t); };
}
const css = getComputedStyle(document.documentElement);
const easeTok = (name, dflt) => { const m = css.getPropertyValue(name).match(/cubic-bezier\(([^)]+)\)/); const v = (m ? m[1] : dflt).split(',').map(Number); return bezier(...v); };
const durTok = (name, d) => parseFloat(css.getPropertyValue(name)) || d;
const EASE = { move: easeTok('--ease-move', '0.65,0,0.35,1'), enter: easeTok('--ease-enter', '0.16,1,0.3,1'), exit: easeTok('--ease-exit', '0.7,0,0.84,0') };
const DUR = { short: durTok('--dur-short', 0.35), mid: durTok('--dur-mid', 0.8), long: durTok('--dur-long', 1.6) };

const CORE5 = ['core.rules', 'core.skills', 'core.agents', 'core.enforcement', 'core.tools'];
const LOOP_TEXT = 'An orange pipe is the loop. It starts at a wrap-up hopper on each floor; just below the hopper one branch turns back into the same floor. Lower down the pipe splits again: one branch ends in the pool, the other runs to the plant room through a valve that only the user opens.';
const LOOP_LABEL = ['Improvement loop', 'wrap-up → topic, pool, core (approved)'];
const INTAKE_CALLOUT = { anchor: '@manifold', part: 'plant', label: ['Plant room (core)'], tag: true };
const LAYERS = [
  { id: 'all', name: 'All', focus: null, callouts: [
      { anchor: 'ws.desk', label: ['Topic workspace', 'One floor per topic'] },
      { anchor: 'plant', label: ['Core', 'Loaded by every session'] },
      { anchor: 'loop.split', label: LOOP_LABEL, accent: true, w: 196 } ],
    text: 'WF is a shared core, a workspace per topic, and a loop between them. Pick a layer, a moment of work, or run one task.' },
  { id: 'core', name: 'Core', focus: ['plant', ...CORE5], callouts: [
      { anchor: 'core.rules', label: ['Rules board'], tag: true }, { anchor: 'core.skills', label: ['7 skill cabinets'], tag: true },
      { anchor: 'core.agents', label: ['4 agent booths'], tag: true }, { anchor: 'core.enforcement', label: ['Gate and sensors'], tag: true },
      { anchor: 'core.tools', label: ['Tool wall'], tag: true } ],
    text: 'The core is not one document. It is five pieces that every session has: a rules document, global skills, global agents, enforcement through settings permissions and hooks, and shared tools. No floor chooses its frame.' },
  { id: 'workspace', name: 'Topic workspace', focus: ['floor.3'], view: { del: 10 }, margin: 0.045, callouts: [
      { anchor: 'ws.card', label: ['Re-entry card'], tag: true }, { anchor: 'ws.decisions', label: ['Decision log'], tag: true },
      { anchor: '@wrapBody', part: 'ws.wrap', label: ['Wrap-up', 'where the loop starts'] } ],
    text: 'Each floor above the plant room houses one topic’s workspace. The re-entry card puts the purpose at the top and is overwritten; the decision log deletes nothing and marks overturned decisions as superseded.' },
  { id: 'pool', name: 'Pool', focus: ['pool', 'loop.pool'], anchor: 'pool.bin', label: ['Pool', 'Used in two or more topics'], accent: true,
    text: 'The pool carries one topic’s improvement to another. At wrap-up, changes that help other topics go upstream, and other topics pick them up the next time they open. An item enters the pool only after real use in two or more topics.' },
  { id: 'loop', name: 'Loop', focus: ['loop', 'loop.approve', 'ws.wrap', 'pool'], solid: true,
    callouts: [{ anchor: 'loop.split', label: LOOP_LABEL, accent: true, w: 196 }, INTAKE_CALLOUT],
    text: LOOP_TEXT },
];
const SKILL = 'global skill (one of 7)';
const MOMENTS = [
  { m: 'A session opens', w: 'Rules and the category document load; the hook shows purpose, state, and next action', focus: ['core.rules', 'core.enforcement'], extra: { hookCard: 1 },
    callouts: [{ anchor: 'core.rules', label: ['Rules board', 'with the category document'] },
      { anchor: 'core.enforcement.card', label: ['Re-entry card', 'raised by the hook'] },
      { anchor: 'core.enforcement.arm', label: ['Gate and sensors', 'session-start hook'], near: [-150, -10] }] },
  { m: 'New topic, long-idle topic, or change of direction', w: '/wf-project-init, with the scout and researcher agents', focus: ['core.skills', 'core.agents', 'core.sockets'], cab: 0, label: ['/wf-project-init', 'global skill + 2 agents'], extra: { plug: 1 }, margin: 0.10 },
  { m: 'Asking the user for judgment, approval, or action', w: '/wf-review-page', focus: ['core.skills'], cab: 1, label: ['/wf-review-page', SKILL] },
  { m: 'Splitting work', w: 'The delegation rules', focus: ['core.rules', 'core.agents'], anchor: 'core.rules', label: ['The delegation rules', 'rules document'] },
  { m: 'Looking for past knowledge', w: '/wf-ask', focus: ['core.skills'], cab: 4, label: ['/wf-ask', SKILL] },
  { m: 'An idea comes up', w: '/wf-idea', focus: ['core.skills'], cab: 5, label: ['/wf-idea', SKILL] },
  { m: 'After a forced shutdown or long absence', w: '/wf-recover', focus: ['core.skills'], cab: 6, label: ['/wf-recover', SKILL] },
  { m: 'Not sure what to use', w: '/wf-help, answered from the maps', focus: ['core.skills', 'lobby.map'], cab: 3, extra: { mapPrint: 1 }, noRoute: true, margin: 0.07,
    fitOnly: ['core.skills', 'lobby.map'], view: { daz: 0, del: -10 },
    callouts: [{ cab: 3, label: ['/wf-help', 'answered from the maps'] }, { anchor: 'lobby.map', label: ['Maps', 'built by a machine'] },
      { anchor: 'lobby.map.machine', label: ['Map builder'], tag: true, near: [-20, -70] }] },
  { m: 'Closing a session or round', w: '/wf-project-wrap, with the refiner and, when judgment is involved, the second reader', focus: ['core.skills', 'core.agents'], cab: 2, label: ['/wf-project-wrap', 'refiner; second reader if judgment'], margin: 0.05 },
];
const RUN_DUR = 10;
const STAGES = [
  { t0: 0.0, name: 'A session opens', text: 'A service riser runs through the building and loads the same things into every floor when a session opens.', focus: ['riser', 'plant', 'frame', ...CORE5], fitAll: true, solid: true, anchor: 'riser', label: ['Riser', 'Next session loads it'] },
  { t0: 1.4, name: 'Init', text: 'Init reads the request and the few map lines that fit the job, then writes an understanding sheet that marks each line as original, precedent, or inference.', focus: ['floor.3'], anchor: 'ws.card', label: ['Re-entry card', 'Purpose first, overwritten'] },
  { t0: 2.9, name: 'During the work', text: 'The main session decides, commits, and talks to the user, while agents get reading, research, and verification under a written contract.', focus: null, fitAll: true,
    callouts: [{ anchor: 'ws.desk', label: ['Main session', 'decides, commits, talks'] }, { anchor: 'core.agents', label: ['Sub-agents', 'read, research, verify under a contract'] }] },
  { t0: 4.4, name: 'Wrap-up', text: 'Wrap-up writes a process record, and the refiner sorts its lessons.', focus: ['floor.3', 'ws.wrap', 'loop'], solid: true, anchor: 'ws.wrap', label: ['Wrap-up', 'process record, refiner'] },
  { t0: 5.7, name: 'The pipe branches', text: 'Just below the hopper one branch turns back into the same floor. Lower down the pipe splits again: one branch ends in the pool, the other runs to the plant room through a valve that only the user opens.', focus: ['loop', 'loop.approve', 'pool', 'ws.wrap'], solid: true,
    callouts: [{ anchor: 'loop.split', label: LOOP_LABEL, accent: true, w: 196 }, INTAKE_CALLOUT] },
  { t0: 7.2, name: 'The valve waits for the user', text: 'A category or core change becomes one line for the user to mark. Nothing enters the core without that mark.', focus: ['loop', 'loop.approve', 'plant', 'pool'], solid: true, anchor: 'loop.approve', label: ['Approval valve', 'Core changes need the user'], accent: true, phoneZoom: true,
    near: [90, -72] },
  { t0: 8.5, name: 'Into the core, up the riser', text: 'Once the user marks it, the valve opens and the riser carries the change up to the next session.', focus: ['loop', 'loop.approve', 'riser', 'plant', 'frame', ...CORE5], fitAll: true, solid: true, anchor: 'riser', label: ['Riser', 'Next session loads it'] },
];
const APPROVE_AT = 8.5;

const canvas = $('stage');
const portrait = () => innerHeight > innerWidth;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const size = () => ({ w: innerWidth, h: Math.round(portrait() ? canvas.getBoundingClientRect().height || innerHeight * 0.56 : innerHeight) });
let S = size();
const studio = createStudio({ canvas, width: S.w, height: S.h, quality: Q.get('quality') === 'fast' ? 'fast' : 'high', pixelRatio: dpr });
const model = createModel(studio.tokens);
studio.scene.add(model.root);
const has = (id) => !!(model.parts[id] || model.members[id] || model.anchors?.[id]);
const ids = (list) => list ? list.filter(has) : null;

const VIEW = { az: CAMERAS.hero.az, el: CAMERAS.hero.el, fov: CAMERAS.hero.fov };
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
function focusBox(list, any = false) {
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  const roots = list ? list.flatMap((id) => model.members[id] || (model.parts[id] ? [model.parts[id]] : [])) : [model.root];
  model.root.updateMatrixWorld(true);
  for (const r of roots) r?.traverse((m) => {
    if (!m.isMesh || !shown(m)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!any && !mats.some((t) => t && t.visible !== false && (!t.transparent || (t.opacity ?? 1) >= 0.35))) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); if (tmp.min.y < -1) return; box.union(tmp);
  });
  return box.isEmpty() ? null : box;
}
const momentInset = new Map();
function area() {
  if (portrait()) return { x0: 0, x1: S.w, y0: 0.01 * S.h, y1: 0.99 * S.h, fill: 0.84 };
  const pr = $('panel').getBoundingClientRect().right + 44;
  const inset = st.mode === 'moment' ? (momentInset.get(st.moment) || 0) : 0;
  return { x0: pr + inset, x1: S.w, y0: 0, y1: S.h, margin: st.mode === 'moment' ? (MOMENTS[st.moment].margin ?? 0.13) : st.mode === 'layer' ? (LAYERS[st.layer].margin ?? 0.06) : 0.06 };
}
const _v = new THREE.Vector3();
function screenBox(skip = null, only = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  model.root.updateMatrixWorld(true);
  model.root.traverse((m) => {
    if (!m.isMesh || !shown(m) || (skip && skip.has(m)) || (only && !only.has(m))) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!mats.some((t) => t && t.visible !== false && (!t.transparent || (t.opacity ?? 1) >= 0.35))) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    for (let k = 0; k < 8; k++) {
      _v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).project(studio.camera);
      if (_v.z > 1) continue;
      const x = (_v.x + 1) / 2 * S.w, y = (1 - _v.y) / 2 * S.h;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  });
  return { x0, y0, x1, y1 };
}
const fitCache = new Map();
const meshSet = (idList) => idList ? new Set(idList.flatMap((id) => { const out = []; for (const o of (model.members[id] || (model.parts[id] ? [model.parts[id]] : []))) o?.traverse((m) => out.push(m)); return out; })) : null;
function fitCam(list, key, all = false, skipIds = null, onlyIds = null, viewOver = null) {
  const A = area(), k = key + '|' + S.w + 'x' + S.h + '|' + A.x0.toFixed(0);
  if (fitCache.has(k)) return fitCache.get(k);
  const box = all ? focusBox(null, true) : focusBox(onlyIds || list); if (!box) return { ...CAMERAS.hero };
  const c = new THREE.Vector3(); box.getCenter(c);
  const vo = viewOver || {};
  const cam = { ...VIEW, az: VIEW.az + (vo.daz || 0), el: VIEW.el + (vo.del || 0), target: c.toArray(), dist: 40, shiftX: ((A.x0 + A.x1) / 2) / S.w - 0.5, shiftY: 0.5 - ((A.y0 + A.y1) / 2) / S.h };
  const corners = [...Array(8)].map((_, i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  const ext = () => { studio.setCamera(cam); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const v of corners) { const p = studio.project(v); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, x1, y0, y1 }; };
  const Aw = A.x1 - A.x0, Ah = A.y1 - A.y0;
  for (let i = 0; i < 4; i++) { const e = ext(); cam.dist *= Math.max((e.x1 - e.x0) / Aw, (e.y1 - e.y0) / Ah); }
  if (portrait() && onlyIds) cam.dist *= 1.08;
  if (!portrait()) {
    const skip = meshSet(skipIds), only = meshSet(onlyIds);
    const visBox = () => { studio.setCamera(cam); studio.camera.updateMatrixWorld(true); return screenBox(skip, only); };
    const mx = A.margin * Aw, my = A.margin * Ah, cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2;
    for (let i = 0; i < 8; i++) {
      let b = visBox(); if (!(b.x1 > b.x0)) break;
      cam.dist *= Math.max((b.x1 - b.x0) / (Aw - 2 * mx), (b.y1 - b.y0) / (Ah - 2 * my));
      b = visBox(); cam.shiftX += (cx - (b.x0 + b.x1) / 2) / S.w; cam.shiftY -= (cy - (b.y0 + b.y1) / 2) / S.h;
    }
    fitCache.set(k, cam); return cam;
  }
  const roots = onlyIds ? [onlyIds.flatMap((id) => model.members[id] || (model.parts[id] ? [model.parts[id]] : []))] : [[model.root]];
  const fill = onlyIds ? 0.46 : A.fill;
  const figArea = () => { studio.setCamera(cam); const g = new Uint8Array(Math.ceil(S.w / 8) * Math.ceil(S.h / 8)), gw = Math.ceil(S.w / 8); let n = 0;
    for (const q of figureBBox(roots, studio.camera, S.w, S.h)) for (let y = q.y >> 3; y < (q.y + q.h) / 8; y++) for (let x = q.x >> 3; x < (q.x + q.w) / 8; x++) if (!g[y * gw + x]) { g[y * gw + x] = 1; n++; }
    return n / g.length; };
  const recentre = () => { if (!onlyIds) return; studio.setCamera(cam); const q = figureBBox(roots, studio.camera, S.w, S.h)[0]; if (!q) return;
    const sb = screenBox(null, meshSet(onlyIds)); if (!(sb.x1 > sb.x0)) return;
    cam.shiftX += (S.w / 2 - (sb.x0 + sb.x1) / 2) / S.w; cam.shiftY -= (S.h / 2 - (sb.y0 + sb.y1) / 2) / S.h; };
  for (let i = 0; i < 24 && figArea() < fill; i++) { cam.dist *= 0.95; recentre(); }
  fitCache.set(k, cam); return cam;
}

const st = {
  mode: Q.has('run') ? 'run' : Q.has('moment') ? 'moment' : 'layer',
  layer: Math.max(0, LAYERS.findIndex((l) => l.id === Q.get('layer'))),
  moment: clamp((parseInt(Q.get('moment'), 10) || 1) - 1, 0, 8),
  runT: clamp01(parseFloat(Q.get('run')) || 0) * RUN_DUR,
  view: { daz: parseFloat(Q.get('daz')) || 0, del: parseFloat(Q.get('del')) || 0, zoom: parseFloat(Q.get('zoom')) || 1 },
  fade: 1,
  playing: false,
};

function applyView(c) {
  const v = st.view;
  return { ...c, az: clamp(c.az + v.daz, c.az - 40, c.az + 35), el: clamp(c.el + v.del, 6, 58), dist: c.dist * clamp(v.zoom, 0.55, 1.3) };
}

const BASE = { cut: 1, explode: 0, coreExplode: 0, loop: 1, loopTopic: null, loopPool: null, loopCore: null, approve: 0,
  route: 0, routeLit: 0, hookCard: 0, plug: 0, reviewIn: 0, marks: 0, mapPrint: null, decisionsAdd: 0, rulesLine: 0, focusAmount: 1, focusHide: 0 };

const stageAt = (t) => { let k = 0; STAGES.forEach((s, i) => { if (t >= s.t0) k = i; }); return k; };
const stageOff = (i) => Math.min(DUR.long, ((STAGES[i + 1]?.t0 ?? RUN_DUR) - STAGES[i].t0) - 0.05);
const stageLand = (i) => STAGES[i].t0 + stageOff(i);
function runParams(t) {
  t = clamp(t, 0, RUN_DUR);
  const k = stageAt(t), s = STAGES[k], prev = STAGES[Math.max(0, k - 1)];
  const u = EASE.move(clamp01((t - s.t0) / DUR.mid));
  const camFn = () => lerpCamera(fitCam(ids(prev.focus), 'run' + Math.max(0, k - 1), !!prev.fitAll), fitCam(ids(s.focus), 'run' + k, !!s.fitAll), k === 0 ? 1 : u);
  const hide = 0.6 + 0.4 * EASE.enter(clamp01((t - s.t0) / DUR.mid));
  const draw = (a, b) => EASE.move(clamp01((t - a) / (b - a)));
  const lp = t < STAGES[3].t0 ? 0 : draw(STAGES[3].t0 + 0.4, STAGES[4].t0);
  const branch = (off) => t < STAGES[4].t0 ? 0 : draw(STAGES[4].t0 + off, STAGES[4].t0 + off + 0.6);
  return {
    k, camFn, phoneZoom: !!s.phoneZoom, anchor: s.anchor, label: s.label, accent: !!s.accent, callouts: s.callouts, near: s.near,
    p: { ...BASE, time: t, loop: lp,
      hookCard: k === 0 ? EASE.enter(clamp01(t / DUR.mid)) : 0,
      decisionsAdd: k === 2 ? EASE.move(clamp01((t - s.t0) / DUR.long)) * 0.55 : k > 2 ? 0.55 : 0,
      rulesLine: k === 6 ? EASE.move(clamp01((t - s.t0 - 0.5) / DUR.mid)) : 0,
      loopTopic: Math.max(lp * 0.35, branch(0)), loopPool: Math.max(lp * 0.35, branch(0.2)), loopCore: branch(0.3),
      approve: EASE.move(clamp01((t - APPROVE_AT) / DUR.mid)),
      focus: withSolid(ids(s.focus), s.solid), focusHide: hide },
  };
}
const SOLID = ['frame', 'ctx.plinth', 'ctx.manifold'];
const withSolid = (focus, solid) => (focus && solid ? ids([...new Set([...focus, ...SOLID])]) : focus);

function cabinetAnchor(k) {
  const g = model.parts['core.skills'];
  const kids = g?.children || [];
  if (kids.length < 42) return model.anchorOf('core.skills');
  const v = kids[k * 6].getWorldPosition(kids[k * 6].position.clone()); v.y += 1.05; return v;
}

function wrapBody() { const a = model.anchorOf('ws.wrap'); const c = studio.camera.position; const d = new THREE.Vector3(c.x - a.x, 0, c.z - a.z).normalize();
  return a.clone().add(new THREE.Vector3(0, -0.22, 0)).addScaledVector(d, 0.3); }
function manifoldPt() { const mf = model.members['ctx.manifold']?.[0]; if (!mf) return model.anchorOf('plant');
  const a = mf.getWorldPosition(new THREE.Vector3()); const c = studio.camera.position; const d = new THREE.Vector3(c.x - a.x, 0, c.z - a.z).normalize();
  return a.add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(d, 0.42); }
function rawBox(idList) {
  const box = new THREE.Box3(), tmp = new THREE.Box3(); model.root.updateMatrixWorld(true);
  for (const id of idList) for (const r of (model.members[id] || (model.parts[id] ? [model.parts[id]] : []))) r?.traverse((m) => {
    if (!m.isMesh) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); if (tmp.min.y < -1) return; box.union(tmp); });
  return box;
}
const ROUTE_GAP = 1.5;
const routeGaps = new Map();
function routeFar(i) {
  if (!routeGaps.size) MOMENTS.forEach((m, j) => { const a = rawBox(m.fitOnly || m.focus), b = rawBox(['route.' + (j + 1)]);
    const gap = (lo, hi) => Math.max(0, lo - hi);
    const g = a.isEmpty() || b.isEmpty() ? 0 : Math.hypot(gap(b.min.x, a.max.x) || gap(a.min.x, b.max.x), gap(b.min.y, a.max.y) || gap(a.min.y, b.max.y), gap(b.min.z, a.max.z) || gap(a.min.z, b.max.z));
    routeGaps.set(j, +g.toFixed(2)); });
  window.__routeGaps = Object.fromEntries(routeGaps);
  return routeGaps.get(i) > ROUTE_GAP;
}
function sceneParams(t) {
  const hide = 0.6 + 0.4 * st.fade;
  if (st.mode === 'run') return runParams(st.runT + t);
  if (st.mode === 'moment') {
    const m = MOMENTS[st.moment];
    const routeId = !m.noRoute && !portrait() && has('route.' + (st.moment + 1)) && !routeFar(st.moment) ? 'route.' + (st.moment + 1) : null;
    const fit = ids([...(m.fitOnly || m.focus), ...(routeId ? [routeId] : [])]);
    const focus = ids([...m.focus, ...(routeId ? [routeId] : []), 'ctx.room', 'ctx.plinth', ...(m.focus.some((id) => id === 'core.rules' || id === 'core.tools') ? ['ctx.wall'] : [])]);
    return { fit, camFn: () => fitCam(fit, 'moment' + st.moment, false, null, fit, m.view || null), anchor: m.anchor, cab: m.cab, label: m.label, accent: false, callouts: m.callouts,
      p: { ...BASE, time: t, ...(m.extra || {}), route: 0, routeLit: routeId ? st.moment + 1 : 0, focus, focusHide: hide } };
  }
  const L = LAYERS[st.layer], focus = ids(L.focus);
  return { camFn: () => fitCam(focus, 'layer' + st.layer, false, null, null, L.view || null), anchor: L.anchor, label: L.label, accent: !!L.accent, callouts: L.callouts,
    p: { ...BASE, time: t, focus: withSolid(focus, L.solid), focusHide: focus ? hide : 0 } };
}

const svgNS = 'http://www.w3.org/2000/svg';
function marker(A, accent) {
  const ring = document.createElementNS(svgNS, 'circle'); ring.setAttribute('cx', A.x); ring.setAttribute('cy', A.y); ring.setAttribute('r', '9');
  ring.setAttribute('fill', 'var(--bg-paper)'); ring.setAttribute('stroke', 'var(--ink)'); ring.setAttribute('stroke-width', '2.5');
  const dot = document.createElementNS(svgNS, 'circle'); dot.setAttribute('cx', A.x); dot.setAttribute('cy', A.y); dot.setAttribute('r', '4'); dot.setAttribute('fill', accent ? 'var(--accent)' : 'var(--ink)');
  return [ring, dot];
}
function inkReader(W, H, thr = 30) {
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g = c2.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const P = studio.tokens['bg-paper'].replace('#', ''); const bg = [0, 2, 4].map((i) => parseInt(P.slice(i, i + 2), 16));
  const I = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
    row += Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) > thr ? 1 : 0; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const rect = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return 1; return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
  return { rect, at: (x, y) => rect(x, y, x + 1, y + 1) > 0 };
}
function measure(c) {
  const el = document.createElement('div'); el.className = 'callout' + (c.tag ? ' tag' : '') + (c.accent ? ' accent' : '');
  el.style.left = '0'; el.style.top = '-600px'; if (c.w) el.style.maxWidth = c.w + 'px'; el.innerHTML = '<div class="t"></div>' + (c.label[1] ? '<div class="s"></div>' : '');
  el.querySelector('.t').textContent = c.label[0]; if (c.label[1]) el.querySelector('.s').textContent = c.label[1];
  document.body.appendChild(el); const r = el.getBoundingClientRect(); el.remove(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
}
const distToSeg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; const t = l2 ? clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
function place(list, project, W, H) {
  const ink = inkReader(W, H), A0 = area();
  const boxes = [...document.querySelectorAll('#panel h1, #panel .kicker, #panel p, #panel button, #panel .tabs, #panel input')].filter((e) => e.getClientRects().length)
    .map((e) => { const r = e.getBoundingClientRect(); return { left: r.left - 16, right: r.right + 16, top: r.top - 16, bottom: r.bottom + 16 }; });
  const segs = [], out = [];
  const X0 = Math.max(0.05 * W, A0.x0 - 40), X1 = W - 0.05 * W, Y0 = 0.05 * H, Y1 = H - 0.05 * H;
  for (const c of list) {
    const a = project(c.id), A = { x: a.x, y: a.y }, { w, h } = measure(c), ul = c.tag ? 7 : 11;
    let best = null;
    for (const nr of (c.near ? [{ x: c.near[0] >= 0 ? A.x + c.near[0] : A.x + c.near[0] - w, y: A.y + c.near[1] }, null] : [null])) {
    if (best) break;
    for (let by = Y0; by + h <= Y1; by += 12) for (let bx = X0; bx + w <= X1; bx += 16) {
      if (nr && (Math.abs(bx - nr.x) > 48 || Math.abs(by - nr.y) > 36)) continue;
      const side = bx + w < A.x - 8 ? 'left' : bx > A.x + 8 ? 'right' : null; if (!side) continue;
      const r = { left: bx, right: bx + w, top: by, bottom: by + h }, uy = A.y < r.top ? r.top - ul : r.bottom + ul;
      const near = { x: side === 'left' ? r.right : r.left, y: uy }, far = { x: side === 'left' ? r.left : r.right, y: uy };
      const L = Math.hypot(A.x - near.x, A.y - near.y); if (L > 700) continue;
      let pen = 0; const inkF = ink.rect(r.left - 10, r.top - 8, r.right + 10, r.bottom + 8); if (inkF > 0.003) pen += nr ? 2e3 * inkF : 1e5 + 1e5 * inkF;
      if (boxes.some((b) => !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom))) pen += 1e6;
      for (const s of segs) if (segHitsRect(s[0], s[1], { left: r.left - 8, right: r.right + 8, top: r.top - 14, bottom: r.bottom + 14 })) pen += 1e6;
      for (const s of segs) if (segsCross(far, near, s[0], s[1]) || segsCross(near, A, s[0], s[1])) pen += 1e6;
      for (const b of boxes) if (segHitsRect(near, A, b)) pen += 1e6;
      if (L > 300) pen += 50 * (L - 300);
      if (L > 150) pen += 8 * (L - 150);
      for (let d = 0; d < L - 10; d += 6) { const p = { x: near.x + (A.x - near.x) * d / L, y: near.y + (A.y - near.y) * d / L };
        if (segs.some((s) => distToSeg(p, s[0], s[1]) < 12)) { pen += 2e5; break; } }
      let over = 0, cnt = 0; for (let d = 0; d < L - 40; d += 6) { cnt++; if (ink.at(near.x + (A.x - near.x) * d / L, near.y + (A.y - near.y) * d / L)) over++; }
      pen += 400 * (cnt ? over / cnt : 0);
      const cost = pen + L; if (!best || cost < best.cost) best = { cost, r, side, near, far, A };
    }
    }
    if (!best) continue;
    boxes.push({ left: best.r.left - 12, right: best.r.right + 12, top: best.r.top - 16, bottom: best.r.bottom + 16 });
    segs.push([best.far, best.near], [best.near, best.A]);
    out.push({ id: c.id, part: c.part, t: c.label[0], s: c.label[1], accent: !!c.accent, w: c.w, kind: c.tag ? 'tag' : 'callout', side: best.side, x: Math.round(best.side === 'left' ? best.r.left : best.r.right), y: Math.round(best.r.top) });
  }
  return out;
}
function drawCallout(sp) {
  const svg = $('leaders'), host = $('callouts');
  svg.replaceChildren(); host.replaceChildren();
  const list = (sp.callouts || [{ anchor: sp.anchor, cab: sp.cab, label: sp.label, accent: sp.accent, near: sp.near }])
    .filter((c) => c.label && (c.anchor || c.cab != null))
    .map((c) => ({ ...c, id: c.cab != null ? '@cab' + c.cab : c.anchor, part: c.part || (c.cab != null ? 'core.skills' : undefined) }));
  const project = (id) => studio.project(id.startsWith('@cab') ? cabinetAnchor(+id.slice(4)) : id === '@wrapBody' ? wrapBody() : id === '@manifold' ? manifoldPt() : model.anchorOf(id));
  const W = S.w, H = S.h;
  if (portrait()) {
    if (list.length === 1) { const c = list[0], a = project(c.id); svg.append(...marker(a, c.accent));
      const el = document.createElement('div'); el.className = 'callout chip' + (c.accent ? ' accent' : '');
      el.innerHTML = '<div class="t"></div>'; el.querySelector('.t').textContent = c.label[0]; host.appendChild(el); }
    window.__leaderReport = null; window.__leaderCrossings = []; return;
  }
  const callouts = place(list, project, W, H);
  const report = layoutLeaders({ svg, host, width: W, height: H, callouts, project, pick: pickerFor(model, studio, W, H), partOf: model.partOf,
    canvas, paper: studio.tokens['bg-paper'], textSelector: '#panel p, #panel button' });
  window.__leaderCrossings = report.violations.filter((v) => v.rule === 'text' || v.rule === 'cross').map((v) => v.id);
}

const TK = studio.tokens;
const CLIP = { gap: 44, fade: 160, edge: 0.06 };
const clipA = { value: new THREE.Vector4(-1e5, 1, 0, 1) }, clipB = { value: new THREE.Vector4(1e5, 0, 0, 0) };
const clipG = { value: new THREE.Vector4(-1e5, 1, 0, 1) };
function addClip(mat, mode, U = clipA) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uClipA = U; sh.uniforms.uClipB = clipB;
    const body = `
      float cfX = clamp((gl_FragCoord.x - uClipA.x) / uClipA.y, 0.0, 1.0);
      if (uClipA.z > 0.0) cfX *= clamp(gl_FragCoord.y / uClipA.z, 0.0, 1.0) * clamp((uClipA.w - gl_FragCoord.y) / uClipA.z, 0.0, 1.0) * clamp((uClipB.x - gl_FragCoord.x) / uClipA.z, 0.0, 1.0);
      if (cfX <= 0.0) discard;
      cfX *= cfX;   // r5: an eased ramp (a grid line 20 px past x0 is at 1.6%, not 12.5%: lint seam)
      gl_FragColor.a *= cfX;
    `;
    const i = sh.fragmentShader.lastIndexOf('}');
    sh.fragmentShader = 'uniform vec4 uClipA;\nuniform vec4 uClipB;\n' + sh.fragmentShader.slice(0, i) + body + '}\n';
  };
  mat.customProgramCacheKey = () => 'r5clip-' + mode + (U === clipG ? 'G' : 'A');
  mat.needsUpdate = true; return mat;
}
const clipX0 = () => (portrait() ? -1e5 : $('panel').getBoundingClientRect().right + CLIP.gap);
function updateClip() {
  const d = dpr, H = S.h * d, Wd = S.w * d;
  const x0 = clipX0() * d;
  clipA.value.set(x0, CLIP.fade * d, CLIP.edge * S.h * d, H); clipB.value.set(Wd, 0, 0, 0);
  clipG.value.set(x0, CLIP.fade * d, 0, H);
  window.__clipLine = portrait() ? null : { x: Math.round(clipX0()), side: 20 };
}
const gtaoPass = studio.composer.passes.find((p) => /GTAO/i.test(p.constructor.name));
const aoPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6);
const cutPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6);
const cutR = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6), cutB = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6);
const CUTS = [cutPlane, cutR, cutB];
if (gtaoPass) { gtaoPass.normalMaterial.clippingPlanes = [aoPlane, ...CUTS]; gtaoPass.normalMaterial.needsUpdate = true; }
function updateAOClip() {
  if (!gtaoPass) return;
  if (portrait()) { aoPlane.set(new THREE.Vector3(1, 0, 0), 1e6); return; }
  const cam = studio.camera; cam.updateMatrixWorld(true);
  const xN = (($('panel').getBoundingClientRect().right + CLIP.gap) / S.w) * 2 - 1;
  const C = cam.position.clone(), P1 = new THREE.Vector3(xN, -1, 0.5).unproject(cam), P2 = new THREE.Vector3(xN, 1, 0.5).unproject(cam);
  aoPlane.setFromCoplanarPoints(C, P1, P2);
  if (aoPlane.distanceToPoint(new THREE.Vector3(Math.min(1, xN + 0.5), 0, 0.5).unproject(cam)) < 0) aoPlane.negate();
}
const gridMesh = studio.scene.children.find((o) => o.isMesh && o.geometry?.parameters?.width === 64);
if (gridMesh) addClip(gridMesh.material, 'alpha', clipG);
if (studio.ground) addClip(studio.ground.material, 'alpha', clipG);

const ctxMat = addClip(new THREE.LineBasicMaterial({ color: TK.ink, transparent: true, opacity: 0.15, depthWrite: false }), 'alpha');
const ctxLines = new THREE.LineSegments(new THREE.BufferGeometry(), ctxMat); ctxLines.name = 'r4.context'; ctxLines.renderOrder = 2; ctxLines.frustumCulled = false;
studio.scene.add(ctxLines);
const CTX_MIN = 2.4;
const MM = model.materials;
const STRUCT = new Set([MM.steel, MM.concrete, MM.concrete2, MM.facade, MM.sectionWall, MM.section, MM.plantFloor, ...(MM.tint || [])].filter(Boolean));
const ctxSize = new Map();
function bigEnough(m) {
  if (ctxSize.has(m)) return ctxSize.get(m);
  if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
  const s = new THREE.Vector3(); m.geometry.boundingBox.getSize(s); const w = new THREE.Vector3(); m.getWorldScale(w);
  const ok = Math.max(s.x * Math.abs(w.x), s.y * Math.abs(w.y), s.z * Math.abs(w.z)) >= CTX_MIN; ctxSize.set(m, ok); return ok;
}
const roofG = model.parts.roof;
const CONTAINERS = new Set([model.root, ...model.levels.map((l) => l.group), ...model.levels.map((l) => l.frame), model.parts.pool, roofG].filter(Boolean));
const plinthMesh = model.root.children.find((o) => { if (!o.isMesh) return false; const b = new THREE.Box3().setFromObject(o); return b.max.y < 0.4 && b.max.y > 0.3 && b.max.x - b.min.x > 12; });
const _bx = new THREE.Box3();
function updateContext(sp) {
  const boxes = new Map();
  if (sp.p.focus && st.mode !== 'moment') {
    model.root.updateMatrixWorld(true);
    const poolHidden = !model.parts.pool.visible;
    const roots = [...model.levels.map((l) => l.group), model.parts.pool, plinthMesh].filter(Boolean);
    for (const r of roots) r.traverse((m) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const ghostHidden = mats.every((x) => x && x.userData && x.userData.src && x.visible === false);
      let up = true; for (let p = m; p; p = p.parent) { if (p === model.parts.pool && poolHidden) break; if (!p.visible) { up = false; break; } }
      const inPool = poolHidden && (() => { for (let p = m; p; p = p.parent) if (p === model.parts.pool) return true; return false; })();
      if (!up || !(ghostHidden || inPool) || !bigEnough(m)) return;
      const src = mats.map((x) => (x && x.userData && x.userData.src) || x);
      if (!src.some((x) => STRUCT.has(x)) || src.every((x) => x && x.transparent && (x.opacity ?? 1) < 0.6)) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      _bx.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      const key = CONTAINERS.has(m.parent) ? m : m.parent;
      const b = boxes.get(key); if (b) b.union(_bx); else boxes.set(key, _bx.clone());
    });
  }
  const list = [...boxes.values()].map((b) => { const s = new THREE.Vector3(); b.getSize(s); return { b, v: s.x * s.y * s.z }; }).sort((a, c) => c.v - a.v);
  const kept = [];
  for (const it of list) { if (kept.some((k) => k.min.x - 0.06 <= it.b.min.x && k.min.y - 0.06 <= it.b.min.y && k.min.z - 0.06 <= it.b.min.z && k.max.x + 0.06 >= it.b.max.x && k.max.y + 0.06 >= it.b.max.y && k.max.z + 0.06 >= it.b.max.z)) continue; kept.push(it.b); }
  const pos = new Float32Array(kept.length * 24 * 3); let n = 0;
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const b of kept) {
    const c = [...Array(8)].map((_, i) => [i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z]);
    for (const [a, z] of E) { pos.set(c[a], n); pos.set(c[z], n + 3); n += 6; }
  }
  ctxLines.geometry.dispose();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ctxLines.geometry = g;
  ctxLines.visible = kept.length > 0;
  window.__ctxBoxes = kept.length;
}
model.root.updateMatrixWorld(true);
let sill0 = [];
{ const L0 = model.levels[0].group, y0 = model.levels[0].y0;
  model.members['ctx.plinth'] = plinthMesh ? [plinthMesh] : [];
  const shell0 = (model.members.shell || []).filter((o) => o.parent === L0 && o.isMesh);
  sill0 = shell0;
  const room = [], wall = [];
  for (const o of L0.children) {
    if (!o.isMesh) continue;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld), s = new THREE.Vector3(); b.getSize(s);
    const floor = s.y < 0.05 && s.x > 8 && s.z > 5;
    const show = s.x > 4 && s.y > 3 && s.z < 0.3 && b.max.z < 0;
    const bar = s.x > 5 && s.y < 0.1 && s.z < 0.2 && b.min.y > y0 + 2;
    const line = s.y < 0.02 && s.z < 0.1 && s.x > 5;
    if (floor) room.push(o); else if (show || bar || line) wall.push(o);
  }
  model.members['ctx.room'] = [...room, ...shell0]; model.members['ctx.wall'] = wall;
  const mf = L0.children.find((o) => o.isMesh && Math.abs(o.position.x - 1.35) < 1e-3 && Math.abs(o.position.z + 1.45) < 1e-3);
  model.members['ctx.manifold'] = mf ? [mf] : [];
}
const clipMats = new Map();
const clipOf = (src) => { let c = clipMats.get(src); if (!c) { c = src.clone(); c.clippingPlanes = [...(src.clippingPlanes || []), ...CUTS]; c.clipShadows = true;
  clipMats.set(src, c); } return c; };
const ctxSwaps = [];
function clearCtxSolid() { for (const [o, m] of ctxSwaps) o.material = m; ctxSwaps.length = 0; }
const CTX_SOLID = ['ctx.room', 'ctx.wall', 'ctx.plinth'];
function applyCtxSolid(sp) {
  const f = sp.p.focus; if (!f) return;
  for (const id of CTX_SOLID) { if (!f.includes(id)) continue;
    for (const r of model.members[id]) r.traverse((o) => { if (!(o.isMesh || o.isLineSegments) || !o.material) return;
      ctxSwaps.push([o, o.material]); o.material = Array.isArray(o.material) ? o.material.map(clipOf) : clipOf(o.material); }); }
}
const CUT = { gap: 56, tilt: 9, edgeX: 0.06, edgeY: 0.05 };
const capMeshes = [[], [], []];
const capGroup = new THREE.Group(); capGroup.name = 'r5.sectionCaps'; studio.scene.add(capGroup);
function capMesh(i, pi = 0) {
  if (capMeshes[pi][i]) return capMeshes[pi][i];
  const others = CUTS.filter((_, j) => j !== pi);
  const mk = (src) => { const m = src.clone(); m.map = src.map.clone(); m.map.needsUpdate = true; m.clippingPlanes = others; return m; };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk(MM.section)); mesh.userData.slab = mesh.material; mesh.userData.wall = mk(MM.sectionWall);
  mesh.castShadow = false; mesh.receiveShadow = true; capGroup.add(mesh); capMeshes[pi][i] = mesh; return mesh;
}
const _cb = new THREE.Box3(), _cv = new THREE.Vector3();
function ctxSolidBoxes(sp) {
  const f = sp.p.focus, out = []; if (!f) return out;
  model.root.updateMatrixWorld(true);
  for (const id of CTX_SOLID) { if (!f.includes(id)) continue;
    for (const r of model.members[id]) r.traverse((o) => { if (!o.isMesh || !shown(o)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = _cb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).clone();
      out.push({ b, o, wall: id !== 'ctx.plinth' && b.max.y - b.min.y > 0.3 }); }); }
  return out;
}
const stubHidden = [];
function updateSection(sp) {
  for (const pool of capMeshes) for (const m of pool) { m.visible = false; m.userData.src = null; }
  for (const o of stubHidden) o.visible = true; stubHidden.length = 0;
  for (const P of CUTS) { P.normal.set(1, 0, 0); P.constant = 1e6; }
  window.__sectionCut = null;
  if (portrait()) return;
  const boxes = ctxSolidBoxes(sp); if (!boxes.length) return;
  const cam = studio.camera; cam.updateMatrixWorld(true);
  const xmin = clipX0() + CUT.gap;
  const fw = new THREE.Vector3(); cam.getWorldDirection(fw);
  const f = fw.clone(); f.y = 0; f.normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x);
  const pp = cam.position.clone().add(fw).project(cam), ppx = (pp.x + 1) / 2 * S.w;
  const fpx = (S.h / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  const tilt = THREE.MathUtils.degToRad(CUT.tilt);
  const beta = Math.atan2(ppx - xmin, fpx), alpha = beta + tilt;
  const n = right.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(f, Math.sin(alpha)).normalize();
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corners = (b) => [...Array(8)].map((_, i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  const boxC = boxes.map(({ b }) => corners(b));
  const keptPts = (nn, cs, c) => { const out = cs.filter((p) => nn.dot(p) >= c);
    for (const [a, z] of E) { const da = nn.dot(cs[a]) - c, dz = nn.dot(cs[z]) - c; if (da * dz < 0) out.push(cs[a].clone().lerp(cs[z], da / (da - dz))); }
    return out; };
  const worst = (nn, c, over) => { let m = -Infinity;
    for (const cs of boxC) for (const p of keptPts(nn, cs, c)) { _cv.copy(p).project(cam); if (_cv.z > 1) continue; m = Math.max(m, over((_cv.x + 1) / 2 * S.w, (1 - _cv.y) / 2 * S.h)); }
    return m; };
  const solve = (nn, over) => { let lo = Infinity, hi = -Infinity;
    for (const cs of boxC) for (const p of cs) { const v = nn.dot(p); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (worst(nn, lo - 1e-3, over) <= 0) return null;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (worst(nn, mid, over) <= 0) hi = mid; else lo = mid; }
    return hi; };
  const caps = (nn, c, pi) => {
    const d = new THREE.Vector3(-nn.z, 0, nn.x);
    let k = 0;
    for (const { b, wall, o: src } of boxes) {
      const h = b.max.y - b.min.y; if (h < 0.05) continue;
      const o = nn.clone().multiplyScalar(c);
      let t0 = -Infinity, t1 = Infinity;
      for (const [ax, lo2, hi2] of [['x', b.min.x, b.max.x], ['z', b.min.z, b.max.z]]) {
        const dd = d[ax], oo = o[ax];
        if (Math.abs(dd) < 1e-9) { if (oo < lo2 || oo > hi2) { t0 = 1; t1 = 0; } continue; }
        let a = (lo2 - oo) / dd, z = (hi2 - oo) / dd; if (a > z) [a, z] = [z, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, z);
      }
      if (!(t1 - t0 > 0.05)) continue;
      const m = capMesh(k++, pi); m.visible = true; m.userData.src = src; m.material = wall ? m.userData.wall : m.userData.slab;
      m.material.map.repeat.set((t1 - t0) / 1.2, h / 1.2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn.clone().negate());
      m.scale.set(t1 - t0, h, 1);
      m.position.copy(o).addScaledVector(d, (t0 + t1) / 2).addScaledVector(nn, -0.003); m.position.y = (b.min.y + b.max.y) / 2;
    }
  };
  const feet = []; for (const id of (sp.p.focus || []).filter((x) => !CTX_SOLID.includes(x))) { let y0 = Infinity; const bs = [];
    for (const r of (model.members[id] || (model.parts[id] ? [model.parts[id]] : []))) r?.traverse((o) => {
      if (!o.isMesh || !shown(o)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); if (b.min.y < -1) return; bs.push(b); y0 = Math.min(y0, b.min.y); });
    for (const b of bs) if (b.min.y < y0 + 0.15) for (const p of corners(b)) if (p.y < y0 + 0.15) feet.push(p); }
  const feetOut = (nn, c) => feet.filter((p) => nn.dot(p) < c + 0.1).length;
  const c = solve(n, (x) => xmin - x);
  if (c != null) {
    cutPlane.normal.copy(n); cutPlane.constant = -c;
    const seen = n.dot(cam.position) < c;
    window.__sectionCut = { normal: [+n.x.toFixed(3), +n.z.toFixed(3)], c: +c.toFixed(3), face_seen: seen, feet_out: feetOut(n, c), feet: feet.length, feet_min: feet.length ? +(Math.min(...feet.map((p) => n.dot(p))) - c).toFixed(3) : null };
    if (seen) caps(n, c, 0);
  }
  if (st.mode !== 'moment') return;
  const out = window.__sectionCut || (window.__sectionCut = { normal: null, c: null, face_seen: false, feet_out: 0, feet: feet.length });
  const xmax = S.w * (1 - CUT.edgeX), ymax = S.h * (1 - CUT.edgeY);
  const guard = (nn) => { let m = Infinity; for (const p of feet) m = Math.min(m, nn.dot(p)); return m - 0.05; };
  const b2 = Math.atan2(xmax - ppx, fpx);
  const sides = [
    { P: cutR, pi: 1, key: 'right', cands: [b2 + tilt, b2 - tilt].map((a) => right.clone().multiplyScalar(-Math.cos(a)).addScaledVector(f, Math.sin(a)).normalize()), over: (x) => x - xmax },
    { P: cutB, pi: 2, key: 'bottom', cands: [f.clone()], over: (x, y) => y - ymax },
  ];
  for (const s of sides) {
    for (const nn of s.cands) {
      let cc = solve(nn, s.over); if (cc == null) break;
      cc = Math.min(cc, guard(nn));
      if (!(nn.dot(cam.position) < cc)) continue;
      s.P.normal.copy(nn); s.P.constant = -cc; caps(nn, cc, s.pi);
      out[s.key] = { normal: [+nn.x.toFixed(3), +nn.z.toFixed(3)], c: +cc.toFixed(3) }; break;
    }
  }
  const stubs = [];
  for (const o of sill0) { if (!o.isMesh || !o.visible) continue;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = _cb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld), sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, len = Math.max(sx, sz);
    const y = (b.min.y + b.max.y) / 2, N = 48; let kept = 0;
    for (let i = 0; i <= N; i++) { const t = i / N, p = sx >= sz ? _cv.set(b.min.x + t * sx, y, (b.min.z + b.max.z) / 2) : _cv.set((b.min.x + b.max.x) / 2, y, b.min.z + t * sz);
      if (CUTS.every((P) => P.distanceToPoint(p) >= 0)) kept++; }
    const keptLen = len * kept / (N + 1);
    if (kept <= N && keptLen < 0.8) { o.visible = false; stubHidden.push(o); stubs.push(+keptLen.toFixed(2)); } }
  for (const pool of capMeshes) for (const m of pool) if (m.visible && m.userData.src && stubHidden.includes(m.userData.src)) m.visible = false;
  out.stubs = stubs;
}
function valveWithPipe(sp) { const v = model.parts['loop.approve']; if (!v) return; const d = sp.p.loopCore ?? sp.p.loop; v.visible = d == null || d > 0.05; }
{ const a = model.materials.accent; a.roughness = 0.62; a.clearcoat = 0.25; a.clearcoatRoughness = 0.7; a.needsUpdate = true; }
model.parts.plant.traverse((o) => { if (o.isPointLight && Math.abs(o.position.x - 1.8) < 1e-3 && Math.abs(o.position.z - 1.0) < 1e-3) o.position.y += 0.4; });
const riserGlow = new THREE.Group(); riserGlow.name = 'r2.riserGlow'; studio.scene.add(riserGlow);
const riserPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const riserMat = new THREE.MeshStandardMaterial({ color: TK['light-plant'], emissive: TK['light-plant'], emissiveIntensity: 0.75, roughness: 0.7, clippingPlanes: [riserPlane] });
let riserY = null;
function buildRiserGlow() {
  model.root.updateMatrixWorld(true); const bb = new THREE.Box3(), tb = new THREE.Box3(), sz = new THREE.Vector3();
  for (const g0 of (model.members.riser || [model.parts.riser])) g0.traverse((m) => { if (!m.isMesh) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    tb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); tb.getSize(sz);
    if (sz.y < 1.5 || Math.max(sz.x, sz.z) > 0.4 || Math.max(sz.x, sz.z) < 0.15) return;
    const g = new THREE.Mesh(m.geometry, riserMat); g.matrixAutoUpdate = false; g.matrix.copy(m.matrixWorld); g.scale.setScalar(1); g.renderOrder = 1;
    g.matrix.multiply(new THREE.Matrix4().makeScale(1.12, 1.0, 1.12)); riserGlow.add(g); bb.union(tb); });
  riserY = bb.isEmpty() ? false : [bb.min.y, bb.max.y];
}
function updateRiser(sp) {
  const on = st.mode === 'run' && sp.k === STAGES.length - 1; riserGlow.visible = on && !!riserY; if (!riserGlow.visible) return;
  const t = st.runT + lastT, u = EASE.move(clamp01((t - APPROVE_AT - 0.3) / (RUN_DUR - APPROVE_AT - 0.5)));
  riserPlane.constant = riserY[0] + u * (riserY[1] - riserY[0]);
}
const hl = [];
const glowPlate = new THREE.MeshStandardMaterial({ color: TK['mat-paper'], emissive: TK['glow-screen'], emissiveIntensity: 1.1, roughness: 0.6 });
const dimCache = new Map();
const dimOf = (m, f = 0.65) => { const k = m.uuid + f; let d = dimCache.get(k); if (!d) { d = m.clone(); if (d.color) d.color.multiplyScalar(f); if (d.emissive) d.emissiveIntensity = 0; dimCache.set(k, d); } return d; };
function clearHighlight() { for (const [o, m] of hl) o.material = m; hl.length = 0; }
function applyHighlight(sp) {
  if (st.mode !== 'moment') return;
  const rp = model.parts['route.' + (st.moment + 1)];
  rp?.traverse((o) => { if (o.isMesh && o.material && o.material.emissiveIntensity > 0) o.material.emissiveIntensity *= 0.35; });
  if (sp.cab == null) return;
  const kids = model.parts['core.skills']?.children || []; if (kids.length < 42) return;
  for (let c = 0; c < 7; c++) for (let j = 0; j < 6; j++) {
    const o = kids[c * 6 + j]; if (!o.isMesh) continue;
    if (c === sp.cab) { if (j === 4) { hl.push([o, o.material]); o.material = glowPlate; } }
    else if (j === 0 || j === 4 || j === 5) { hl.push([o, o.material]); o.material = dimOf(o.material, j === 4 ? 0.45 : 0.65); }
  }
}
const wraps = (model.members['ws.wrap'] || []).map((g, i) => {
  const kids = g.children.filter((o) => o.isMesh); let plate = null, sheet = null;
  for (const o of kids) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const s = new THREE.Vector3(); o.geometry.boundingBox.getSize(s);
    if (s.x > 0.5 && s.y < 0.1 && s.z > 0.5) plate = o; else if (s.y < 0.02 && s.x < 0.35) sheet = o; }
  return { floor: 'floor.' + (i + 1), plate, sheet };
});
function ownParts(sp) {
  const f = sp.p.focus;
  for (const w of wraps) { if (w.plate) w.plate.visible = !f || f.includes(w.floor) || f.includes('plant');
    if (w.sheet && !st.playing) w.sheet.visible = false; }
}
const flangeMat = model.materials.steel;
const FL = (r, len, axis) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), flangeMat); if (axis === 'z') m.rotation.x = Math.PI / 2; m.castShadow = true; m.receiveShadow = true; studio.scene.add(m); m.visible = false; return m; };
const R0 = 0.17, POOL_WALL_Z = 5.3, DXP = 5.25;
const inletFl = FL(R0 * 1.75, 0.09, 'y'); inletFl.position.set(1.35, model.levels[0].y0 + 0.9 + 0.045, -1.45);
const wallFl = FL(R0 * 1.9, 0.08, 'z'); wallFl.position.set(DXP, 1.3, POOL_WALL_Z - 0.04);
const wallFl2 = FL(R0 * 1.45, 0.16, 'z'); wallFl2.position.set(DXP, 1.3, POOL_WALL_Z + 0.02);
const poolClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), POOL_WALL_Z);
const tipFl = [...Array(8)].map(() => FL(R0 * 1.35, 0.08, 'y'));
const pipeClipMats = new Map(), pipeSwaps = [];
const pipeClipOf = (src) => { let c = pipeClipMats.get(src); if (!c) { c = src.clone(); c.clippingPlanes = [...(src.clippingPlanes || []), poolClip]; pipeClipMats.set(src, c); } return c; };
function clearPipeEnds() { for (const [o, m] of pipeSwaps) o.material = m; pipeSwaps.length = 0; }
function pipeEnds(sp) {
  const f = sp.p.focus, poolOn = model.parts.pool.visible;
  const dCore = sp.p.loopCore ?? sp.p.loop, dPool = sp.p.loopPool ?? sp.p.loop;
  const drawn = (id) => !f || f.includes('loop') || f.includes(id);
  const coreG = model.members['loop.core']?.[0];
  inletFl.visible = !!coreG && shown(coreG) && drawn('loop.core') && dCore > 0.98 && (!f || f.includes('plant') || f.includes('ctx.manifold'));
  const poolG = model.members['loop.pool']?.[0];
  const cut = !poolOn && !!poolG && shown(poolG) && drawn('loop.pool') && dPool > 0.2;
  wallFl.visible = wallFl2.visible = cut;
  for (const t of tipFl) t.visible = false;
  let n = 0; const runs = model.parts.loop?.userData?.runs || [];
  for (const run of runs) {
    if (n >= tipFl.length || !(run.drawn > 0.03 && run.drawn < 0.985) || !drawn('loop.' + run.kind)) continue;
    const u = run.drawn, p = run.path.getPointAt(u), tg = run.path.getTangentAt(u);
    if (run.kind === 'pool' && cut && p.z > POOL_WALL_Z) continue;
    const m = tipFl[n++]; m.position.copy(p); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); m.scale.set(run.r / R0, 1, run.r / R0); m.visible = true;
  }
  if (cut) poolG.traverse((o) => { if (!o.isMesh || !o.material) return; pipeSwaps.push([o, o.material]); o.material = Array.isArray(o.material) ? o.material.map(pipeClipOf) : pipeClipOf(o.material); });
}
const hookCard = model.parts['core.enforcement']?.getObjectByName('core.enforcement.card');
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10), model.materials.steel); stem.castShadow = true; stem.visible = false; studio.scene.add(stem);
const SENSOR_TOP = model.levels[0].y0 + 2.39;
function hookStem(sp) {
  const f = sp.p.focus;
  const on = !!hookCard && shown(hookCard) && (sp.p.hookCard ?? 0) > 0.95 && (!f || f.includes('core.enforcement'));
  stem.visible = on; if (!on) return;
  hookCard.updateMatrixWorld(true); const c = new THREE.Vector3(); hookCard.getWorldPosition(c);
  const s = hookCard.scale.y, bottom = c.y - 0.28 * s, len = Math.max(0.01, bottom - SENSOR_TOP);
  stem.scale.set(1, len, 1); stem.position.set(c.x, SENSOR_TOP + len / 2, c.z - 0.03);
}
const FRAME_GREY = new THREE.MeshStandardMaterial({ color: '#7d786f', roughness: 0.72, metalness: 0.12 });
const KEEP_DARK = (o) => { for (let p = o; p; p = p.parent) if (p.parent && /^frame\.\d$/.test(p.parent.name) && Math.abs(p.position.x - 5.65) < 0.02 && Math.abs(p.position.z - 3.65) < 0.02) return true; return false; };
const frameMeshes = [];
for (const fr of model.members.frame || []) fr.traverse((o) => { if (o.isMesh) frameMeshes.push({ o, dark: KEEP_DARK(o) }); });
const stubs = [];
model.levels.forEach((lv, i) => { if (!i || !lv.frame) return;
  for (const c of lv.frame.children) { if (!c.isGroup || Math.abs(c.position.y - lv.y0) > 1e-3) continue;
    let cap = false; c.traverse((o) => { if (o.isMesh && o.material === MM.section) cap = true; }); if (cap) stubs.push([i, c]); } });
const frameSwaps = [], visSwaps = [];
function clearFrame() { for (const [o, m] of frameSwaps) o.material = m; frameSwaps.length = 0; for (const [o, v] of visSwaps) o.visible = v; visSwaps.length = 0; }
function applyFrame(sp) {
  const f = sp.p.focus; if (!f || !f.includes('frame')) return;
  for (const { o, dark } of frameMeshes) { if (dark || !o.material || o.material.map) continue; frameSwaps.push([o, o.material]); o.material = FRAME_GREY; }
  for (const [i, c] of stubs) if (!f.includes('floor.' + i)) { visSwaps.push([c, c.visible]); c.visible = false; }
}
const RT = 0.17 * 0.7;
const drops = [1, 2, 3].map((i) => {
  const y1 = model.levels[i].y0 + 0.7, y0 = model.levels[i].y0;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(RT, RT, y1 - y0 + 0.05, 20), model.materials.accent); pipe.position.set(4.2, (y0 + y1) / 2 - 0.02, 0.4);
  const fl = new THREE.Mesh(new THREE.CylinderGeometry(RT * 1.9, RT * 1.9, 0.05, 24), MM.steel); fl.position.set(4.2, y0 + 0.025, 0.4);
  for (const m of [pipe, fl]) { m.castShadow = true; m.receiveShadow = true; m.visible = false; studio.scene.add(m); }
  return { i, pipe, fl };
});
function topicDrops(sp) {
  const f = sp.p.focus, runs = model.parts.loop?.userData?.runs || [];
  const topicRuns = runs.filter((r) => r.kind === 'topic');
  for (const d of drops) { const run = topicRuns[d.i - 1];
    const on = !!f && (f.includes('loop') || f.includes('loop.topic')) && !f.includes('floor.' + d.i) && !!run && run.drawn > 0.98 && shown(model.parts.loop);
    d.pipe.visible = d.fl.visible = on; }
}
for (let k = 1; k <= 9; k++) { const g = model.parts['route.' + k]; const rep = g?.children.find((o) => o.isGroup && Math.abs(o.scale.x - 1.5) < 1e-6); if (rep) rep.visible = false; }
{ const lobby = model.parts['lobby.map']; if (lobby) { lobby.position.set(3.0, model.levels[0].y0 + 0.02, 2.8); lobby.rotation.y = -0.66; } }
model.levels[3].group.traverse((o) => { if (!o.isGroup || o === model.levels[3].group) return;
  if (Math.abs(o.position.x - 1.05) < 1e-3 && Math.abs(o.position.z - 1.75) < 1e-3) o.position.x += 0.6;
  else if (Math.abs(o.position.x - 1.0) < 1e-3 && Math.abs(o.position.z - 3.45) < 1e-3) { o.position.x += 0.7; o.position.z -= 0.15; } });

function labelPlates(callouts) {
  const host = $('callouts'); if (!host || !callouts) return;
  const W = S.w, H = S.h, ink = inkReader(W, H, 60);
  [...host.children].forEach((el) => { const r = el.getBoundingClientRect(); el.style.background = ink.rect(r.left, r.top, r.right, r.bottom) > 0.01 ? '' : 'transparent'; });
}
function figureBox() {
  const x0c = portrait() ? 0 : $('panel').getBoundingClientRect().right + CLIP.gap; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  model.root.updateMatrixWorld(true); studio.camera.updateMatrixWorld(true);
  model.root.traverse((m) => {
    if (!m.isMesh || !shown(m)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!mats.some((t) => t && t.visible !== false && (!t.transparent || (t.opacity ?? 1) >= 0.35))) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox; let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (let k = 0; k < 8; k++) { _v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).project(studio.camera);
      if (_v.z > 1) continue; const x = (_v.x + 1) / 2 * S.w, y = (1 - _v.y) / 2 * S.h; a0 = Math.min(a0, x); b0 = Math.min(b0, y); a1 = Math.max(a1, x); b1 = Math.max(b1, y); }
    a0 = Math.max(a0, x0c); b0 = Math.max(b0, 0); a1 = Math.min(a1, S.w); b1 = Math.min(b1, S.h);
    if (a1 - a0 < 1 || b1 - b0 < 1) return;
    x0 = Math.min(x0, a0); y0 = Math.min(y0, b0); x1 = Math.max(x1, a1); y1 = Math.max(y1, b1);
  });
  return x1 > x0 ? [{ x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }] : figureBBox([[model.root]], studio.camera, S.w, S.h);
}

let lastT = 0;
function draw(t = lastT) {
  lastT = t;
  const sp = sceneParams(t);
  for (const o of stubHidden) o.visible = true; stubHidden.length = 0;
  clearHighlight(); clearCtxSolid(); clearPipeEnds(); clearFrame();
  model.update(sp.p);
  model.parts.pool.visible = !sp.p.focus || sp.p.focus.includes('pool');
  valveWithPipe(sp);
  { const f = sp.p.focus, on = !f || f.some((id) => id === 'plant' || id.startsWith('core.') || id === 'lobby.map' || id.startsWith('route'));
    model.parts.plant.traverse((o) => { if (!o.isPointLight) return; if (o.userData.i0 == null) o.userData.i0 = o.intensity; o.intensity = on ? o.userData.i0 : 0; }); }
  studio.ground.visible = !sp.p.focus || ['frame', 'plant', 'pool', 'riser', 'ctx.room'].some((id) => sp.p.focus.includes(id));
  applyHighlight(sp);
  ownParts(sp); applyCtxSolid(sp); pipeEnds(sp); applyFrame(sp); topicDrops(sp);
  if (gridMesh) gridMesh.material.opacity = st.mode === 'moment' ? 0.5 : 1;
  if (riserY === null && model.parts.riser) buildRiserGlow();
  updateRiser(sp);
  let cam = sp.camFn();
  if (portrait() && sp.phoneZoom) { const a = model.anchorOf(sp.anchor); if (a) cam = { ...cam, target: cam.target.map((v, i) => v + (a.getComponent(i) - v) * 0.35), dist: cam.dist * 0.85, shiftY: (cam.shiftY || 0) - 30 / S.h }; }
  studio.setCamera(applyView(cam));
  updateClip(); updateAOClip(); updateSection(sp);
  const neutral = st.view.daz === 0 && st.view.del === 0 && st.view.zoom === 1;
  for (let i = 0; i < 8 && st.mode === 'moment' && neutral && !portrait(); i++) {
    const sc = window.__sectionCut; if (!sc || sc.feet_min == null || sc.feet_min >= 0.1) break;
    momentInset.set(st.moment, (momentInset.get(st.moment) || 0) + 40);
    cam = sp.camFn(); studio.setCamera(applyView(cam)); updateClip(); updateAOClip(); updateSection(sp);
  }
  window.__momentInset = st.mode === 'moment' ? (momentInset.get(st.moment) || 0) : 0;
  { const hb = st.mode === 'moment' && sp.fit ? (studio.camera.updateMatrixWorld(true), screenBox(null, meshSet(sp.fit))) : null;
    window.__heroBBox = hb && hb.x1 > hb.x0 ? { x0: Math.round(Math.max(0, hb.x0)), y0: Math.round(Math.max(0, hb.y0)), x1: Math.round(Math.min(S.w, hb.x1)), y1: Math.round(Math.min(S.h, hb.y1)) } : null; }
  updateContext(sp); hookStem(sp);
  studio.render();
  window.__figureBBox = figureBox();
  drawCallout(sp);
  if (!portrait()) labelPlates(sp);
  return sp;
}

const heavy = studio.composer.passes.filter((p) => /GTAO|Bloom/i.test(p.constructor.name));
let settleTimer = 0;
function setLight(on) { for (const p of heavy) p.enabled = !on; }
let rafPending = false;
function requestDraw(interactive = false) {
  if (interactive) { setLight(true); clearTimeout(settleTimer); settleTimer = setTimeout(() => { setLight(false); requestDraw(); }, 220); }
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => { rafPending = false; draw(); });
}

function syncText() {
  const L = LAYERS[st.layer], M = MOMENTS[st.moment], k = stageAt(st.runT), R = STAGES[k];
  $('layer-text').textContent = L.text;
  $('moment-name').textContent = `${st.moment + 1}. ${M.m}`;
  $('moment-text').textContent = 'What steps in: ' + M.w + '.';
  $('run-name').textContent = `${k + 1} / ${STAGES.length} · ${R.name}`;
  $('run-text').textContent = R.text;
  for (const b of $('layer-opts').children) b.setAttribute('aria-checked', String(+b.dataset.i === st.layer));
  for (const b of $('moment-opts').children) b.setAttribute('aria-checked', String(+b.dataset.i === st.moment));
  $('scrub').value = String(Math.round(st.runT / RUN_DUR * 1000));
  $('scrub').setAttribute('aria-valuetext', `${R.name}, ${st.runT.toFixed(1)} of ${RUN_DUR} seconds`);
  for (const tb of document.querySelectorAll('[role=tab]')) {
    const on = tb.id === 'tab-' + st.mode; tb.setAttribute('aria-selected', String(on)); tb.tabIndex = on ? 0 : -1;
    $(tb.getAttribute('aria-controls')).hidden = !on;
  }
  $('play').textContent = st.playing ? 'Pause' : st.runT >= RUN_DUR - 1e-3 ? 'Run again' : st.runT > 0 ? 'Resume' : 'Run one task';
  window.__state = { mode: st.mode, layer: LAYERS[st.layer].id, moment: st.moment + 1, runT: +st.runT.toFixed(3), stage: k + 1 };
}
function announce() {
  const msg = st.mode === 'layer' ? LAYERS[st.layer].name : st.mode === 'moment' ? MOMENTS[st.moment].m + ': ' + MOMENTS[st.moment].w : STAGES[stageAt(st.runT)].name;
  $('live').textContent = msg;
}
function syncURL() {
  const q = new URLSearchParams();
  if (st.mode === 'layer' && st.layer > 0) q.set('layer', LAYERS[st.layer].id);
  if (st.mode === 'moment') q.set('moment', String(st.moment + 1));
  if (st.mode === 'run') q.set('run', (st.runT / RUN_DUR).toFixed(2));
  try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch { }
}

let fadeRaf = 0;
function fadeIn() {
  cancelAnimationFrame(fadeRaf);
  if (reduced) { st.fade = 1; requestDraw(); return; }
  const t0 = performance.now(), d = DUR.mid * 1000;
  setLight(true);
  const step = () => { const u = clamp01((performance.now() - t0) / d); st.fade = 0.25 + 0.75 * EASE.enter(u); draw();
    if (u < 1) fadeRaf = requestAnimationFrame(step); else { setLight(false); draw(); } };
  step();
}
function choose(fn) { stop(); fn(); syncText(); syncURL(); announce(); fadeIn(); }

let playRaf = 0;
function stop() { if (st.playing) { st.playing = false; cancelAnimationFrame(playRaf); setLight(false); syncText(); requestDraw(); } }
function play() {
  if (st.playing) { stop(); return; }
  if (st.runT >= RUN_DUR - 1e-3) st.runT = 0;
  if (reduced) {
    const k = stageAt(st.runT); st.runT = k + 1 < STAGES.length ? stageLand(k + 1) : RUN_DUR;
    syncText(); syncURL(); announce(); requestDraw(); return;
  }
  st.playing = true; setLight(true); syncText();
  let prev = performance.now(), lastStage = stageAt(st.runT);
  const step = (now) => {
    st.runT = Math.min(RUN_DUR, st.runT + (now - prev) / 1000); prev = now;
    draw(0);
    const k = stageAt(st.runT); if (k !== lastStage) { lastStage = k; announce(); }
    syncText();
    if (st.runT >= RUN_DUR) { st.playing = false; setLight(false); syncText(); syncURL(); draw(0); return; }
    playRaf = requestAnimationFrame(step);
  };
  playRaf = requestAnimationFrame(step);
}

LAYERS.forEach((L, i) => {
  const b = document.createElement('button'); b.textContent = L.name; b.dataset.i = i; b.setAttribute('role', 'radio');
  b.addEventListener('click', () => choose(() => { st.mode = 'layer'; st.layer = i; }));
  $('layer-opts').appendChild(b);
});
MOMENTS.forEach((M, i) => {
  const b = document.createElement('button'); b.textContent = String(i + 1); b.dataset.i = i; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${i + 1}. ${M.m}`);
  b.addEventListener('click', () => choose(() => { st.mode = 'moment'; st.moment = i; }));
  $('moment-opts').appendChild(b);
});
for (const g of [$('layer-opts'), $('moment-opts')]) g.addEventListener('keydown', (e) => {
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
  e.preventDefault(); const bs = [...g.children]; const i = (bs.indexOf(document.activeElement) + d + bs.length) % bs.length; bs[i].focus(); bs[i].click();
});
const tabs = [...document.querySelectorAll('[role=tab]')];
tabs.forEach((tb, i) => {
  tb.addEventListener('click', () => choose(() => { st.mode = tb.id.slice(4); }));
  tb.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault(); const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); n.click(); });
});
$('play').addEventListener('click', () => { st.mode = 'run'; play(); });
$('scrub').addEventListener('input', (e) => { stop(); st.mode = 'run'; st.runT = +e.target.value / 1000 * RUN_DUR; syncText(); announce(); requestDraw(true); });
$('scrub').addEventListener('change', syncURL);
$('scrub').addEventListener('keydown', (e) => {
  const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return;
  e.preventDefault(); stop(); const k = stageAt(st.runT);
  const atStart = st.runT - STAGES[k].t0 <= stageOff(k) + 1e-3;
  const nextK = clamp(d > 0 ? k + 1 : (atStart ? k - 1 : k), 0, STAGES.length - 1);
  st.runT = d > 0 && k === STAGES.length - 1 ? RUN_DUR : stageLand(nextK); syncText(); syncURL(); announce(); requestDraw();
});
$('reset').addEventListener('click', () => { st.view = { daz: 0, del: 0, zoom: 1 }; requestDraw(); });

const pts = new Map(); let pinch0 = 0, zoom0 = 1;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); zoom0 = st.view.zoom; } });
canvas.addEventListener('pointermove', (e) => {
  const p0 = pts.get(e.pointerId); if (!p0) return;
  const dx = e.clientX - p0.x, dy = e.clientY - p0.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 2) { const [p, q] = [...pts.values()]; st.view.zoom = clamp(zoom0 * pinch0 / Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), 0.55, 1.3); }
  else { const c = VIEW; st.view.daz = clamp(st.view.daz - dx * 0.25, -40, 35); st.view.del = clamp(st.view.del + dy * 0.2, 6 - c.el, 58 - c.el); }
  requestDraw(true);
});
const up = (e) => { pts.delete(e.pointerId); };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.view.zoom = clamp(st.view.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.3); requestDraw(true); }, { passive: false });
canvas.addEventListener('keydown', (e) => {
  const v = st.view, c = VIEW;
  const map = { ArrowLeft: () => (v.daz = clamp(v.daz + 5, -40, 35)), ArrowRight: () => (v.daz = clamp(v.daz - 5, -40, 35)),
    ArrowUp: () => (v.del = clamp(v.del + 4, 6 - c.el, 58 - c.el)), ArrowDown: () => (v.del = clamp(v.del - 4, 6 - c.el, 58 - c.el)),
    '+': () => (v.zoom = clamp(v.zoom * 0.9, 0.55, 1.3)), '=': () => (v.zoom = clamp(v.zoom * 0.9, 0.55, 1.3)), '-': () => (v.zoom = clamp(v.zoom / 0.9, 0.55, 1.3)),
    '0': () => { st.view = { daz: 0, del: 0, zoom: 1 }; } };
  if (map[e.key]) { e.preventDefault(); map[e.key](); requestDraw(true); }
});
addEventListener('resize', () => { fitCache.clear(); S = size(); studio.setSize(S.w, S.h); window.__scene.width = innerWidth; window.__scene.height = innerHeight; requestDraw(); });

window.__scene = {
  duration: RUN_DUR, width: innerWidth, height: innerHeight,
  async seek(t) { st.fade = 1; draw(t); window.__renderMs = studio.renderMs(); window.__state = { mode: st.mode, layer: LAYERS[st.layer].id, moment: st.moment + 1, runT: st.runT + (st.mode === 'run' ? t : 0) }; },
};
syncText(); announce();
await document.fonts.ready;
S = size(); studio.setSize(S.w, S.h);
await window.__scene.seek(0);
window.__ready = true;

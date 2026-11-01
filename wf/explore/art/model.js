import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FALLBACK = {
  'bg-paper': '#E0DDD6', 'ink': '#1B1F24', 'ink-2': '#3C4249',
  'mat-plaster': '#E9E4DA', 'mat-facade': '#C9C2B6', 'mat-concrete': '#B5AFA4', 'mat-concrete-2': '#8F897F', 'mat-steel': '#36404C',
  'mat-wood': '#A2856A', 'mat-paper': '#F6F3EC', 'mat-glass': '#A9BCC6', 'mat-section': '#2E2A26',
  'mat-hatch': '#8C8174', 'light-plant': '#FFD7A6', 'mat-fabric': '#7A5E4C', 'zone-1': '#DED8CC', 'zone-2': '#C6BDAD', 'zone-3': '#ADA290', 'accent': '#D9502B',
  'tint-0': '#F1EEE8', 'tint-1': '#EDE3D2', 'tint-2': '#E0E5DA', 'tint-3': '#DCE1E7',
  'mat-plant-floor': '#CEC9C0', 'mat-section-wall': '#3B3530', 'glow-screen': '#BFD9E8', 'glow-lamp': '#FFE2B8',
  'light-key': '#FFE6CC', 'light-fill': '#C4D6EC',
};
export function readTokens(el = (typeof document !== 'undefined' ? document.documentElement : null)) {
  const t = { ...FALLBACK };
  if (el) {
    const cs = getComputedStyle(el);
    for (const k of Object.keys(FALLBACK)) { const v = cs.getPropertyValue('--' + k).trim(); if (v) t[k] = v; }
  }
  return t;
}

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const frac = (x) => x - Math.floor(x);

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 4;
  return t;
}
function grainTex(hex, amp, seed, size = 256) {
  const r = rng(seed); const col = new THREE.Color(hex);
  return canvasTex(size, size, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const n = (r() - 0.5) * amp * 255;
      img.data[i * 4] = col.r * 255 + n; img.data[i * 4 + 1] = col.g * 255 + n; img.data[i * 4 + 2] = col.b * 255 + n; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
function hatchTex(base, line, seed, cross = false) {
  const r = rng(seed);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 9;
    for (let k = -h; k < w + h; k += 64) { g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); }
    if (cross) { g.lineWidth = 6; for (let k = -h; k < w + h; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); } }
    else { g.fillStyle = line; for (let k = 0; k < 60; k++) g.fillRect(r() * w, r() * h, 4, 4); }
  }, [1, 1]);
}
function floorTex(hex, kind, seed) {
  const r = rng(seed); const c = new THREE.Color(hex); const dk = c.clone().multiplyScalar(0.82).getStyle(), lt = c.clone().lerp(new THREE.Color('#ffffff'), 0.25).getStyle();
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    if (kind === 'plank') {
      const n = 6, ph = h / n;
      for (let k = 0; k < n; k++) { g.fillStyle = c.clone().multiplyScalar(0.93 + r() * 0.1).getStyle(); g.fillRect(0, k * ph, w, ph);
        g.fillStyle = dk; g.fillRect(0, k * ph, w, 2.5); const j = (k % 2 ? 0.35 : 0.8) * w; g.fillRect(j, k * ph, 2.5, ph); }
    } else if (kind === 'tile') {
      g.fillStyle = dk; for (const p of [0, w / 2]) { g.fillRect(p, 0, 3, h); g.fillRect(0, p, w, 3); }
      g.fillStyle = lt; for (const p of [3, w / 2 + 3]) { g.fillRect(p, 3, 1.5, h); g.fillRect(3, p, w, 1.5); }
    } else {
      g.globalAlpha = 0.18; g.strokeStyle = dk; g.lineWidth = 1.5;
      for (let k = 0; k < 9; k++) { g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 20 * (r() - 0.5), w * 0.7, y + 20 * (r() - 0.5), w, y); g.stroke(); }
      g.globalAlpha = 0.5; g.fillStyle = dk; for (let k = 0; k < 220; k++) g.fillRect(r() * w, r() * h, 1.6, 1.6);
      g.globalAlpha = 1; g.fillStyle = dk; g.fillRect(0, 0, w, 2);
    }
  });
}
function docTex(paper, ink, seed, opts = {}) {
  const r = rng(seed);
  return canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.fillStyle = opts.band || ink; g.fillRect(0, 0, w, opts.bandH ?? 34);
    g.fillStyle = ink; g.globalAlpha = 0.55;
    let y = (opts.bandH ?? 34) + 26;
    while (y < h - 18) {
      const indent = r() < 0.2 ? 34 : 18;
      const len = (w - indent - 18) * (0.45 + 0.55 * r());
      g.fillRect(indent, y, len, 5); y += r() < 0.15 ? 30 : 17;
    }
    g.globalAlpha = 1;
  });
}
function screenTex(glow, seed, kind = 'code') {
  const r = rng(seed);
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#0D1216'; g.fillRect(0, 0, w, h);
    g.fillStyle = glow;
    if (kind === 'code') {
      let y = 14; while (y < h - 10) { const ind = 14 + Math.floor(r() * 4) * 12; g.globalAlpha = 0.35 + r() * 0.5; g.fillRect(ind, y, (w - ind - 20) * (0.25 + 0.7 * r()), 5); y += 11; }
    } else if (kind === 'board') {
      for (let k = 0; k < 4; k++) { g.globalAlpha = 0.5; g.fillRect(14 + k * 60, 18, 48, h - 36); g.globalAlpha = 1; g.fillStyle = '#0D1216';
        for (let j = 0; j < 4; j++) if (r() < 0.8) g.fillRect(18 + k * 60, 24 + j * 30, 40, 22); g.fillStyle = glow; }
    } else {
      g.globalAlpha = 0.85; g.lineWidth = 3; g.strokeStyle = glow; g.beginPath();
      for (let x = 10; x < w - 10; x += 4) { const y = h / 2 + Math.sin(x / 13 + seed) * 28 * (0.6 + 0.4 * Math.sin(x / 47)); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

export const DIM = { W: 12, D: 8, T: 0.3, WALL: 0.22, H0: 3.6, H: 2.9, FLOORS: 3, PLINTH: 0.35 };
const { W, D, T, WALL } = DIM;
export const NOTCH = { X: [-99, 0.5, 0.9, 1.3, 99], Z: [99, -1.0, -1.3, -1.6, -2.7] };
function levelY(i) { return DIM.PLINTH + (i === 0 ? 0 : DIM.H0 + T + (i - 1) * (DIM.H + T)); }
function levelH(i) { return i === 0 ? DIM.H0 : DIM.H; }
const SILL = 0.42;
const RISER = { x: 0.3, z: -1.35, half: 0.5 };
const ENTRY = { x: -2.3 };
export const FLOW_PERIOD = 6;
const inNotch = (k, x, z) => x < NOTCH.X[k] && z > NOTCH.Z[k];

function makeMaterials(tk) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const tinted = (hex, seed) => std({ color: 0xffffff, map: grainTex(hex, 0.03, seed), roughness: 0.92 });
  const m = {
    concrete: std({ color: 0xffffff, map: grainTex(tk['mat-concrete'], 0.07, 11), roughness: 0.88 }),
    concrete2: std({ color: 0xffffff, map: grainTex(tk['mat-concrete-2'], 0.08, 12), roughness: 0.9 }),
    plantFloor: std({ color: 0xffffff, map: grainTex(tk['mat-plant-floor'], 0.05, 16), roughness: 0.42 }),
    plaster: std({ color: 0xffffff, map: grainTex(tk['mat-plaster'], 0.035, 13), roughness: 0.93 }),
    tint: [0, 1, 2, 3].map((i) => tinted(tk['tint-' + i], 40 + i)),
    facade: std({ color: 0xffffff, map: grainTex(tk['mat-facade'], 0.05, 15), roughness: 0.8 }),
    section: std({ color: 0xffffff, map: hatchTex(tk['mat-section'], tk['mat-hatch'], 17), roughness: 1 }),
    sectionWall: std({ color: 0xffffff, map: hatchTex(tk['mat-section-wall'], tk['mat-hatch'], 18, true), roughness: 1 }),
    steel: new THREE.MeshPhysicalMaterial({ color: tk['mat-steel'], metalness: 0.6, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    steelLight: new THREE.MeshPhysicalMaterial({ color: '#8A939C', metalness: 0.75, roughness: 0.32 }),
    wood: std({ color: 0xffffff, map: grainTex(tk['mat-wood'], 0.06, 14), roughness: 0.62 }),
    woodLight: std({ color: 0xffffff, map: grainTex('#C2A888', 0.05, 19), roughness: 0.6 }),
    paper: std({ color: tk['mat-paper'], roughness: 0.85 }),
    ink: std({ color: tk['ink'], roughness: 0.55, metalness: 0.1 }),
    dark: std({ color: '#2A2F35', roughness: 0.5, metalness: 0.2 }),
    screenOff: new THREE.MeshPhysicalMaterial({ color: '#20262D', roughness: 0.15, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glass: new THREE.MeshPhysicalMaterial({ color: tk['mat-glass'], roughness: 0.06, metalness: 0, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
    zone: [1, 2, 3].map((k) => std({ color: tk['zone-' + k], roughness: 0.8 })),
    floorZone: [null, ...['plank', 'tile', 'concrete'].map((kind, f) => [1, 2, 3].map((k) =>
      std({ color: 0xffffff, map: floorTex(tk['zone-' + k], kind, 300 + f * 10 + k), roughness: kind === 'tile' ? 0.45 : kind === 'plank' ? 0.7 : 0.6 })))],
    accent: new THREE.MeshPhysicalMaterial({ color: tk['accent'], roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.18 }),
    pulse: new THREE.MeshStandardMaterial({ color: tk['mat-paper'], roughness: 0.55 }),
    emptyPipe: new THREE.MeshStandardMaterial({ color: tk['mat-paper'], roughness: 0.92 }),
    outline: new THREE.MeshBasicMaterial({ color: tk['ink'], side: THREE.BackSide }),
    kioskGlass: new THREE.MeshPhysicalMaterial({ color: tk['mat-glass'], roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shellGlass: new THREE.MeshPhysicalMaterial({ color: '#56636D', roughness: 0.14, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
    figure: std({ color: '#3F464F', roughness: 0.85 }),
    fabric: std({ color: tk['mat-fabric'], roughness: 0.95 }),
    rug: std({ color: 0xffffff, map: grainTex('#8E7663', 0.05, 23), roughness: 0.98 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#FFF6E8', emissive: tk['glow-lamp'], emissiveIntensity: 1.7, roughness: 0.4 }),
    led: new THREE.MeshStandardMaterial({ color: '#E9F4F7', emissive: tk['glow-screen'], emissiveIntensity: 2.0, roughness: 0.4 }),
    binder: [tk['ink'], '#5A6470', '#8C7A62', '#3E4A58', '#6B5E4F'].map((c) => std({ color: c, roughness: 0.6 })),
    crate: std({ color: '#C8B79C', roughness: 0.7 }),
    cushion: std({ color: '#4E5660', roughness: 0.9 }),
    edge: new THREE.LineBasicMaterial({ color: tk['ink'], transparent: true, opacity: 0.3 }),
  };
  const scr = (seed, kind) => { const t = screenTex(tk['glow-screen'], seed, kind);
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85, roughness: 0.22 }); };
  m.screens = [scr(61, 'code'), scr(62, 'code'), scr(63, 'board'), scr(64, 'wave'), scr(65, 'code'), scr(66, 'board')];
  return m;
}

const TILE = 1.2;
function worldUV(g, w, h, d) {
  const uv = g.attributes.uv; const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; const per = uv.count / 6;
  for (let f = 0; f < 6; f++) for (let k = 0; k < per; k++) { const i = f * per + k; uv.setXY(i, uv.getX(i) * size[f][0] / TILE, uv.getY(i) * size[f][1] / TILE); }
  uv.needsUpdate = true;
}
let ROUND = true;
function box(w, h, d, mat, x = 0, y = 0, z = 0, opts = {}) {
  const mn = Math.min(w, h, d), round = ROUND && opts.round !== false && mn >= 0.04;
  const g = round ? new RoundedBoxGeometry(w, h, d, 1, Math.min(0.025, mn * 0.22)) : new THREE.BoxGeometry(w, h, d); if (opts.uv !== false) worldUV(g, w, h, d);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(x, y, z); mesh.castShadow = opts.cast !== false; mesh.receiveShadow = true;
  return mesh;
}
function slab(x0, x1, y0, y1, z0, z1, mat, opts = {}) { return box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, { round: false, ...opts }); }
function withEdges(mesh, mat) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), mat); mesh.add(e); return mesh; }
function cyl(r, h, mat, x, y, z, seg = 32, r2 = r) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }
function iBeam(len, axis, mat, size = 0.26) {
  const g = new THREE.Group(); const f = size, tf = 0.05, tw = 0.045, o = { round: false };
  if (axis === 'y') { g.add(box(f, len, tf, mat, 0, 0, f / 2 - tf / 2, o), box(f, len, tf, mat, 0, 0, -f / 2 + tf / 2, o), box(tw, len, f, mat, 0, 0, 0, o)); }
  else if (axis === 'x') { g.add(box(len, tf, f, mat, 0, f / 2 - tf / 2, 0, o), box(len, tf, f, mat, 0, -f / 2 + tf / 2, 0, o), box(len, f, tw, mat, 0, 0, 0, o)); }
  else { g.add(box(f, tf, len, mat, 0, f / 2 - tf / 2, 0, o), box(f, tf, len, mat, 0, -f / 2 + tf / 2, 0, o), box(tw, f, len, mat, 0, 0, 0, o)); }
  return g;
}
function roundedPath(pts, radius) {
  const path = new THREE.CurvePath();
  const P = pts.map((p) => new THREE.Vector3(...p));
  let cur = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const r = Math.min(radius, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const inP = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(r));
    const outP = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(r));
    if (cur.distanceTo(inP) > 1e-4) path.add(new THREE.LineCurve3(cur.clone(), inP));
    path.add(new THREE.QuadraticBezierCurve3(inP, b.clone(), outP));
    cur = outP;
  }
  path.add(new THREE.LineCurve3(cur, P[P.length - 1]));
  return path;
}
function chair(M, x, y, z, ry, kind = 'office') {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  if (kind === 'wood') {
    g.add(box(0.44, 0.05, 0.42, M.wood, 0, 0.46, 0), box(0.42, 0.36, 0.04, M.wood, 0, 0.76, -0.19));
    for (const [ox, oz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) g.add(box(0.04, 0.46, 0.04, M.wood, ox, 0.23, oz));
  } else if (kind === 'stool') {
    g.add(cyl(0.2, 0.06, M.dark, 0, 0.68, 0, 20), cyl(0.025, 0.65, M.steel, 0, 0.34, 0, 10), new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 24), M.steel).rotateX(Math.PI / 2).translateZ(-0.28), cyl(0.22, 0.03, M.steel, 0, 0.02, 0, 16));
  } else if (kind === 'arm') {
    g.add(box(0.8, 0.36, 0.74, M.fabric, 0, 0.26, 0), box(0.8, 0.5, 0.18, M.fabric, 0, 0.62, -0.28), box(0.14, 0.24, 0.74, M.fabric, -0.33, 0.54, 0), box(0.14, 0.24, 0.74, M.fabric, 0.33, 0.54, 0));
  } else {
    g.add(box(0.46, 0.07, 0.44, M.cushion, 0, 0.46, 0), box(0.44, 0.48, 0.06, M.cushion, 0, 0.78, -0.21), cyl(0.03, 0.42, M.steel, 0, 0.22, 0, 10), cyl(0.24, 0.03, M.steel, 0, 0.02, 0, 16));
  }
  return g;
}
function monitor(M, mat, x, y, z, ry = 0, w = 0.62, h = 0.38) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  g.add(box(w + 0.04, h + 0.04, 0.035, M.dark, 0, 0.2 + h / 2, -0.01), box(w, h, 0.01, mat, 0, 0.2 + h / 2, 0.012, { uv: false }),
    box(0.05, 0.2, 0.05, M.steel, 0, 0.1, -0.04), box(0.24, 0.015, 0.16, M.steel, 0, 0.008, -0.04));
  return g;
}

export function createModel(tokens = readTokens(), init = {}) {
  const M = makeMaterials(tokens);
  const root = new THREE.Group(); root.name = 'wf-building';
  const parts = {}; const anchors = {}; const members = {};
  const cutWalls = [];
  const cutStubs = [];
  const cutSlabs = [];
  const reg = (id, obj, anchor) => { obj.name = id; parts[id] = obj; if (anchor) anchors[id] = anchor; return obj; };

  const plinth = slab(-W / 2 - 0.35, W / 2 + 0.35, 0, DIM.PLINTH, -D / 2 - 0.35, D / 2 + 0.35,
    [M.concrete2, M.concrete2, M.concrete, M.concrete, M.concrete2, M.concrete2]);
  withEdges(plinth, M.edge); root.add(plinth);

  const levels = []; const shell = []; let swapCol = null; let entrance = null;
  const xs = [-W / 2 + 0.35, -2, 2, W / 2 - 0.35], zs = [-D / 2 + 0.35, 0, D / 2 - 0.35];
  for (let i = 0; i <= DIM.FLOORS; i++) {
    const lv = new THREE.Group(); lv.name = 'level.' + i; root.add(lv);
    const y0 = levelY(i), h = levelH(i), tint = M.tint[i];
    const nx = i ? NOTCH.X[i] : -W / 2, nz = i ? NOTCH.Z[i] : D / 2;
    if (i > 0) {
      const e = 0.12, X0 = -W / 2 - e, X1 = W / 2 + e, Z0 = -D / 2 - e, Z1 = D / 2 + e;
      const sm = [M.concrete2, M.concrete2, M.concrete, M.concrete, M.concrete2, M.concrete2];
      const back = slab(X0, X1, y0 - T, y0, Z0, nz, [M.concrete2, M.concrete2, M.concrete, M.concrete, M.section, M.concrete2]);
      const right = slab(nx, X1, y0 - T, y0, nz, Z1, [M.concrete2, M.section, M.concrete, M.concrete, M.concrete2, M.concrete2]);
      const notch = slab(X0, nx, y0 - T, y0, nz, Z1, sm);
      for (const s of [back, right]) { withEdges(s, M.edge); lv.add(s); }
      lv.add(notch); cutSlabs.push({ mesh: notch, cx: nx, cz: nz, x0: X0, x1: nx, z0: nz, z1: Z1 });
    } else {
      lv.add(slab(-W / 2 + WALL, W / 2 - WALL, y0, y0 + 0.02, -D / 2 + WALL, D / 2 - WALL, M.plantFloor, { cast: false }));
    }
    const winB = 0.9, winT = h - 0.55;
    const farWall = (axis) => {
      const g = new THREE.Group();
      if (axis === 'z') {
        const f = [M.facade, M.facade, M.facade, M.facade, tint, M.facade];
        g.add(slab(-W / 2, W / 2, y0, y0 + winB, -D / 2, -D / 2 + WALL, f), slab(-W / 2, W / 2, y0 + winT, y0 + h, -D / 2, -D / 2 + WALL, f));
        for (let x = -W / 2; x < W / 2 - 0.1; x += 2.0) g.add(slab(x, x + 0.5, y0 + winB, y0 + winT, -D / 2, -D / 2 + WALL, f));
        const gl = slab(-W / 2, W / 2, y0 + winB, y0 + winT, -D / 2 + 0.09, -D / 2 + 0.13, M.glass, { cast: false }); gl.receiveShadow = false; g.add(gl);
      } else {
        const f = [M.facade, tint, M.facade, M.facade, M.facade, M.facade];
        g.add(slab(W / 2 - WALL, W / 2, y0, y0 + winB, -D / 2, D / 2, f), slab(W / 2 - WALL, W / 2, y0 + winT, y0 + h, -D / 2, D / 2, f));
        for (let z = -D / 2; z < D / 2 - 0.1; z += 2.0) g.add(slab(W / 2 - WALL, W / 2, y0 + winB, y0 + winT, z, z + 0.5, f));
        const gl = slab(W / 2 - 0.13, W / 2 - 0.09, y0 + winB, y0 + winT, -D / 2, D / 2, M.glass, { cast: false }); gl.receiveShadow = false; g.add(gl);
      }
      lv.add(g); shell.push(g); return g;
    };
    farWall('z'); farWall('x');
    const nearWall = (x0, x1, z0, z1, to, mats) => {
      const m = slab(x0, x1, 0, 1, z0, z1, mats); m.userData = {}; lv.add(m); shell.push(m);
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), y0 + h);
      const gm = M.shellGlass.clone(); gm.clippingPlanes = [plane]; const fm = M.steel.clone(); fm.clippingPlanes = [plane];
      const wins = new THREE.Group(); lv.add(wins); shell.push(wins);
      const alongX = z1 - z0 < x1 - x0, a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
      for (let p = -(alongX ? W : D) / 2; p < (alongX ? W : D) / 2 - 0.1; p += 2.0) {
        const b0 = p + 0.5, b1 = p + 2.0, c = (b0 + b1) / 2;
        if (c < a0 || c > a1) continue;
        if (i === 0 && alongX && b0 < ENTRY.x + 0.8 && b1 > ENTRY.x - 0.8) continue;
        const bw = b1 - b0, bh = winT - winB, yc = y0 + (winB + winT) / 2;
        if (alongX) { const zf = D / 2 + 0.016;
          wins.add(box(bw - 0.08, bh - 0.08, 0.02, gm, c, yc, zf, { round: false, cast: false }));
          wins.add(box(bw, 0.05, 0.05, fm, c, y0 + winB, zf + 0.01, { round: false }), box(bw, 0.05, 0.05, fm, c, y0 + winT, zf + 0.01, { round: false }), box(0.04, bh, 0.04, fm, c, yc, zf + 0.012, { round: false }));
        } else { const xf = -W / 2 - 0.016;
          wins.add(box(0.02, bh - 0.08, bw - 0.08, gm, xf, yc, c, { round: false, cast: false }));
          wins.add(box(0.05, 0.05, bw, fm, xf - 0.01, y0 + winB, c, { round: false }), box(0.05, 0.05, bw, fm, xf - 0.01, y0 + winT, c, { round: false }), box(0.04, bh, 0.04, fm, xf - 0.012, yc, c, { round: false }));
        }
      }
      cutWalls.push({ mesh: m, y0, full: h, to, plane, wins, lv, winB });
    };
    const fM = [M.sectionWall, M.sectionWall, M.sectionWall, tint, M.facade, tint];
    const lM = [tint, M.facade, M.sectionWall, tint, M.sectionWall, M.sectionWall];
    if (i === 0) { nearWall(-W / 2, W / 2, D / 2 - WALL, D / 2, SILL, fM); nearWall(-W / 2, -W / 2 + WALL, -D / 2, D / 2 - WALL, SILL, lM); }
    else {
      nearWall(nx, W / 2, D / 2 - WALL, D / 2, SILL, fM); nearWall(-W / 2, nx, D / 2 - WALL, D / 2, 0, fM);
      nearWall(-W / 2, -W / 2 + WALL, -D / 2, nz, SILL, lM); nearWall(-W / 2, -W / 2 + WALL, nz, D / 2 - WALL, 0, lM);
    }
    if (i === 0) {
      const plane = cutWalls[cutWalls.length - 2].plane;
      const gm = M.shellGlass.clone(); gm.clippingPlanes = [plane]; const fm = M.steel.clone(); fm.clippingPlanes = [plane];
      const ent = new THREE.Group(); ent.name = 'shell.entrance'; lv.add(ent); shell.push(ent); entrance = ent;
      const zf = D / 2 + 0.02, X = ENTRY.x, DW = 1.6, DH = 2.5;
      ent.add(box(0.1, DH, 0.12, fm, X - DW / 2, y0 + DH / 2, zf, { round: false }), box(0.1, DH, 0.12, fm, X + DW / 2, y0 + DH / 2, zf, { round: false }), box(DW + 0.1, 0.12, 0.12, fm, X, y0 + DH, zf, { round: false }));
      ent.add(box(DW / 2 - 0.06, DH - 0.1, 0.03, gm, X - DW / 4, y0 + (DH - 0.1) / 2, zf, { round: false, cast: false }), box(DW / 2 - 0.06, DH - 0.1, 0.03, gm, X + DW / 4, y0 + (DH - 0.1) / 2, zf, { round: false, cast: false }));
      ent.add(box(0.04, DH - 0.1, 0.05, fm, X, y0 + (DH - 0.1) / 2, zf + 0.01, { round: false }));
      for (const s of [-1, 1]) ent.add(box(0.03, 0.5, 0.05, fm, X + s * 0.12, y0 + 1.05, zf + 0.05, { round: false }));
      ent.add(box(DW + 0.9, 0.1, 1.1, fm, X, y0 + DH + 0.32, zf + 0.5, { round: false }));
      ent.userData.doorTop = DH + 0.42;
      ent.add(box(DW + 1.0, 0.16, 0.7, M.concrete, X, 0.08, D / 2 + 0.35 + 0.35, { round: false }));
    }
    const fr = new THREE.Group(); fr.name = 'frame.' + i; const k1 = i + 1;
    for (const cx of xs) for (const cz of zs) {
      const c = new THREE.Group(); c.position.set(cx, y0, cz);
      const col = iBeam(h, 'y', M.steel); col.position.y = h / 2; c.add(col); fr.add(c);
      if (i === 0 && cx === 2 && cz === zs[2]) swapCol = { c, col, h };
      if (inNotch(k1, cx, cz) || (i > 0 && inNotch(i, cx, cz))) {
        const cap = box(0.3, 0.035, 0.3, M.section, 0, 1, 0, { round: false }); c.add(cap);
        cutStubs.push({ obj: c, col, cap, full: h, to: i > 0 && inNotch(i, cx, cz) ? 0 : SILL });
      }
    }
    const beamY = y0 + h - 0.15;
    const capAt = (g, axis, at) => { const cp = axis === 'x' ? box(0.035, 0.32, 0.32, M.section, at, 0, 0, { round: false }) : box(0.32, 0.32, 0.035, M.section, 0, 0, at, { round: false }); g.add(cp); };
    const addBeam = (axis, a0, a1, fixed) => {
      const mid = (a0 + a1) / 2, b = iBeam(a1 - a0, axis, M.steel, 0.3);
      if (axis === 'x') b.position.set(mid, beamY, fixed); else b.position.set(fixed, beamY, mid);
      fr.add(b);
      let k0 = a0, k1e = a1;
      if (axis === 'x' && fixed > NOTCH.Z[k1]) k0 = Math.max(a0, NOTCH.X[k1] - 0.02);
      if (axis === 'z' && fixed < NOTCH.X[k1]) k1e = Math.min(a1, NOTCH.Z[k1] + 0.02);
      if (k0 === a0 && k1e === a1) return;
      cutStubs.push({ obj: b, beam: true });
      if (k1e - k0 < 0.3) return;
      const kb = new THREE.Group(), kb0 = iBeam(k1e - k0, axis, M.steel, 0.3); kb.add(kb0);
      if (axis === 'x') { kb.position.set((k0 + k1e) / 2, beamY, fixed); capAt(kb, 'x', -(k1e - k0) / 2); }
      else { kb.position.set(fixed, beamY, (k0 + k1e) / 2); capAt(kb, 'z', (k1e - k0) / 2); }
      kb.visible = false; fr.add(kb); cutStubs.push({ obj: kb, beamClip: true });
    };
    for (const cz of zs) for (let a = 0; a < xs.length - 1; a++) addBeam('x', xs[a] + 0.13, xs[a + 1] - 0.13, cz);
    for (const cx of xs) for (let a = 0; a < zs.length - 1; a++) addBeam('z', zs[a] + 0.13, zs[a + 1] - 0.13, cx);
    lv.add(fr);
    levels.push({ group: lv, y0, h, frame: fr, nx, nz });
  }
  members.frame = levels.map((l) => l.frame); members.shell = shell;
  parts.frame = levels[1].frame;
  anchors['frame'] = new THREE.Vector3(2, levelY(1) + 1.6, D / 2 - 0.35);
  anchors['shell'] = new THREE.Vector3(W / 2, levelY(1) + 1.5, D / 2);
  parts['shell.entrance'] = entrance; anchors['shell.entrance'] = new THREE.Vector3(ENTRY.x, levelY(0) + 1.3, D / 2 + 0.06);

  const yr = levelY(DIM.FLOORS) + DIM.H;
  const roof = reg('roof', new THREE.Group());
  { const z1 = NOTCH.Z[4];
    const kept = slab(-W / 2 - 0.12, W / 2 + 0.12, yr, yr + T, -D / 2 - 0.12, z1, [M.concrete2, M.concrete2, M.concrete, M.concrete, M.section, M.concrete2]); withEdges(kept, M.edge);
    const lid = slab(-W / 2 - 0.12, W / 2 + 0.12, yr, yr + T, z1, D / 2 + 0.12, [M.concrete2, M.concrete2, M.concrete, M.concrete, M.concrete2, M.concrete2]);
    roof.add(kept, lid); cutSlabs.push({ mesh: lid, cx: 0, cz: z1, x0: -W / 2 - 0.12, x1: W / 2 + 0.12, z0: z1, z1: D / 2 + 0.12, zOnly: true });
    roof.add(slab(-W / 2 - 0.12, W / 2 + 0.12, yr + T, yr + T + 0.45, -D / 2 - 0.12, -D / 2 + 0.1, M.facade));
    roof.add(withEdges(slab(2.6, 4.6, yr + T, yr + T + 0.9, -3.7, -2.9, M.facade), M.edge));
  }
  levels[DIM.FLOORS].group.add(roof);

  const riser = reg('riser', new THREE.Group()); root.add(riser);
  const riserLv = [];
  { const { x: rx, z: rz, half } = RISER;
    for (let i = 0; i <= DIM.FLOORS; i++) {
      const g = new THREE.Group(); g.name = 'riser.' + i; levels[i].group.add(g); riserLv.push(g);
      const y0 = levelY(i), h = levelH(i) + (i < DIM.FLOORS ? T : 0.55);
      g.add(slab(rx - half, rx + half, y0, y0 + levelH(i), rz - half, rz - half + 0.06, M.tint[0], { cast: false }));
      g.add(slab(rx + half - 0.06, rx + half, y0, y0 + levelH(i), rz - half, rz + half, M.tint[0], { cast: false }));
      for (const [dx, dz] of [[-half, half], [half, half], [-half, -half]]) g.add(box(0.07, levelH(i), 0.07, M.steel, rx + dx, y0 + levelH(i) / 2, rz + dz));
      for (const [dx, r] of [[-0.24, 0.16], [0.06, 0.13], [0.3, 0.1]]) g.add(cyl(r, h, M.steelLight, rx + dx, y0 + h / 2, rz - 0.18, 24));
      if (i > 0) g.add(slab(rx - half - 0.08, rx + half + 0.08, y0 - 0.06, y0 + 0.04, rz - half - 0.08, rz + half + 0.08, M.steel));
      if (i < DIM.FLOORS) for (const [dx, r] of [[-0.24, 0.16], [0.06, 0.13]]) {
        const b = cyl(r * 0.8, 0.9, M.steelLight, rx + dx + 0.45 + 0.2, y0 + levelH(i) - 0.45 - (dx > 0 ? 0.32 : 0), rz - 0.18, 16); b.rotation.z = Math.PI / 2; g.add(b); }
    }
    const top = levelY(DIM.FLOORS) + DIM.H + T;
    riserLv[DIM.FLOORS].add(cyl(0.2, 1.2, M.steelLight, rx - 0.24, top + 0.6, rz - 0.18, 24), cyl(0.3, 0.1, M.steel, rx - 0.24, top + 1.25, rz - 0.18, 24));
  }
  members.riser = riserLv;
  anchors['riser'] = new THREE.Vector3(RISER.x - 0.3, levelY(2) + 1.6, RISER.z + 0.2);

  const L0 = levels[0].group, y0 = levelY(0), H0 = DIM.H0;
  const core = {};
  { const pz = NOTCH.Z[1];
    L0.add(slab(-W / 2 + WALL, RISER.x - RISER.half, y0, y0 + H0, pz - 0.2, pz, [M.tint[0], M.tint[0], M.tint[0], M.tint[0], M.tint[0], M.facade], { cast: false }));
    L0.add(box(5.4, 0.08, 0.12, M.lamp, -3.05, y0 + H0 - 0.35, pz + 0.08, { cast: false }));
    L0.add(slab(-W / 2 + 0.5, RISER.x - 0.6, y0 + 0.02, y0 + 0.028, 2.5, 2.56, M.ink, { cast: false }));
  }
  core.rules = reg('core.rules', new THREE.Group());
  { const z = NOTCH.Z[1] + 0.05, x = -4.25;
    const face = new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 21, { bandH: 44, band: tokens['mat-steel'] }), roughness: 0.85 });
    core.rules.add(box(2.2, 2.3, 0.06, [M.paper, M.paper, M.paper, M.paper, face, M.paper], x, y0 + 2.05, z, { uv: false }));
    core.rules.add(box(2.36, 0.08, 0.14, M.steel, x, y0 + 0.86, z + 0.03), box(2.36, 0.08, 0.14, M.steel, x, y0 + 3.24, z + 0.03));
    core.rules.add(box(0.5, 0.06, 0.1, M.lamp, x, y0 + 3.33, z + 0.12, { cast: false })); }
  anchors['core.rules'] = new THREE.Vector3(-4.25, y0 + 2.8, NOTCH.Z[1] + 0.1);
  core.tools = reg('core.tools', new THREE.Group());
  { const z = NOTCH.Z[1] + 0.04, x = -1.55;
    const peg = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#B79C7E'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,30,20,0.55)';
      for (let yy = 8; yy < h; yy += 14) for (let xx = 8; xx < w; xx += 14) { g.beginPath(); g.arc(xx, yy, 2.2, 0, 7); g.fill(); } });
    core.tools.add(box(2.3, 1.4, 0.05, [M.wood, M.wood, M.wood, M.wood, new THREE.MeshStandardMaterial({ map: peg, roughness: 0.8 }), M.wood], x, y0 + 1.95, z, { uv: false }));
    const shapes = [[0.12, 0.85, 'steel'], [0.34, 0.26, 'steelLight'], [0.07, 1.0, 'steel'], [0.28, 0.5, 'dark'], [0.16, 0.66, 'steelLight']];
    shapes.forEach(([w, hh, mm], k) => core.tools.add(box(w, hh, 0.07, M[mm], x - 0.82 + k * 0.41, y0 + 2.45 - hh / 2, z + 0.07)));
    core.tools.add(box(2.3, 0.07, 0.62, M.woodLight, x, y0 + 0.9, z + 0.34), box(2.2, 0.8, 0.52, M.steel, x, y0 + 0.45, z + 0.32));
    core.tools.add(box(0.5, 0.05, 0.1, M.lamp, x, y0 + 2.75, z + 0.12, { cast: false })); }
  anchors['core.tools'] = new THREE.Vector3(-1.55, y0 + 2.75, NOTCH.Z[1] + 0.2);
  core.skills = reg('core.skills', new THREE.Group());
  for (let k = 0; k < 7; k++) {
    const z = -0.2 + k * 0.6, x = 1.3;
    const cab = box(0.66, 2.0, 0.56, M.steel, x, y0 + 1.0, z); withEdges(cab, M.edge); core.skills.add(cab);
    for (let d = 0; d < 3; d++) core.skills.add(box(0.04, 0.05, 0.3, M.steelLight, x - 0.35, y0 + 0.42 + d * 0.55, z));
    core.skills.add(box(0.02, 0.15, 0.42, M.paper, x - 0.34, y0 + 1.78, z), box(0.02, 0.05, 0.05, M.led, x - 0.34, y0 + 1.94, z + 0.17, { cast: false }));
  }
  anchors['core.skills'] = new THREE.Vector3(0.95, y0 + 2.1, 1.6);
  core.agents = reg('core.agents', new THREE.Group()); const agentBands = [];
  for (let k = 0; k < 4; k++) {
    const x = -4.3 + k * 1.2, z = 1.0, g = new THREE.Group(); g.position.set(x, y0, z); core.agents.add(g);
    const bandMat = M.screenOff.clone(); bandMat.emissive = new THREE.Color(tokens['glow-lamp']); bandMat.emissiveIntensity = 0;
    agentBands.push(bandMat);
    const S = 0.88, HB = 0.07, HT = 1.52;
    g.add(box(S + 0.04, HB, S + 0.04, M.dark, 0, HB / 2, 0));
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.035, HT - HB, 0.035, M.steel, ox * S / 2, HB + (HT - HB) / 2, oz * S / 2, { round: false }));
    const fas = box(S + 0.04, 0.16, S + 0.04, [bandMat, bandMat, M.steel, M.steel, bandMat, bandMat], 0, HT + 0.08, 0, { uv: false }); g.add(fas);
    for (const [w, d, ox, oz] of [[S - 0.04, 0.012, 0, S / 2], [S - 0.04, 0.012, 0, -S / 2], [0.012, S - 0.04, S / 2, 0], [0.012, S - 0.04, -S / 2, 0]])
      g.add(box(w, HT - HB - 0.06, d, M.kioskGlass, ox, HB + (HT - HB) / 2, oz, { round: false, cast: false }));
    g.add(box(S - 0.1, 0.04, 0.26, M.woodLight, 0, 0.78, -S / 2 + 0.16), box(0.04, 0.7, 0.2, M.steel, 0, 0.43, -S / 2 + 0.16, { round: false }));
    g.add(monitor(M, M.screens[k % 2 ? 0 : 4], 0, 0.8, -S / 2 + 0.12, 0, 0.42, 0.26));
    g.add(chair(M, 0, HB, 0.12, 0, 'stool'));
    g.add(box(0.32, 0.4, 0.2, M.figure, 0, HB + 0.92, 0.12), new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), M.figure).translateY(HB + 1.24).translateZ(0.1));
    g.add(box(0.3, 0.12, 0.34, M.figure, 0, HB + 0.72, -0.02), box(0.07, 0.26, 0.24, M.figure, -0.17, HB + 1.0, -0.02), box(0.07, 0.26, 0.24, M.figure, 0.17, HB + 1.0, -0.02));
    g.add(cyl(0.14, 0.025, M.lamp, 0, HT + 0.17, 0, 20));
  }
  anchors['core.agents'] = new THREE.Vector3(-2.5, y0 + 1.5, 1.0);
  core.enforcement = reg('core.enforcement', new THREE.Group());
  { const gx = -2.3, gz = 3.1, half = 0.75;
    core.enforcement.add(box(0.16, 2.5, 0.16, M.steel, gx - half, y0 + 1.25, gz), box(0.16, 2.5, 0.16, M.steel, gx + half, y0 + 1.25, gz), box(1.7, 0.18, 0.22, M.steel, gx, y0 + 2.5, gz));
    core.enforcement.add(box(0.36, 0.95, 0.3, M.tint[0], gx - half - 0.3, y0 + 0.475, gz));
    const armPivot = new THREE.Group(); armPivot.position.set(gx - half - 0.3, y0 + 0.98, gz + 0.2);
    armPivot.add(box(1.72, 0.08, 0.08, M.ink, 0.86, 0, 0), box(0.22, 0.12, 0.12, M.steel, -0.1, 0, 0), box(0.06, 0.06, 0.2, M.steel, 0, 0, -0.1));
    core.enforcement.add(armPivot); core.enforcement.userData.armPivot = armPivot;
    core.enforcement.add(box(0.12, 0.12, 0.12, M.ink, gx - half - 0.3, y0 + 0.98, gz));
    core.enforcement.add(box(0.36, 0.2, 0.26, M.dark, gx, y0 + 2.29, gz + 0.02), cyl(0.06, 0.03, M.led, gx, y0 + 2.27, gz + 0.16, 16).rotateX(Math.PI / 2)); }
  anchors['core.enforcement'] = new THREE.Vector3(-2.3, y0 + 2.6, 3.1);
  for (const k of Object.keys(core)) { L0.add(core[k]); core[k].userData.home = core[k].position.clone(); }
  L0.add(withEdges(box(1.6, 1.0, 1.0, M.steel, 3.6, y0 + 0.5, -2.6), M.edge), cyl(0.45, 1.1, M.facade, 4.9, y0 + 0.55, -2.6, 28), withEdges(box(1.0, 0.7, 0.8, M.dark, 3.4, y0 + 0.35, 1.8), M.edge));
  const plantLights = [new THREE.PointLight(tokens['light-plant'], 24, 0, 2), new THREE.PointLight(tokens['light-plant'], 18, 0, 2), new THREE.PointLight(tokens['light-plant'], 7, 0, 2)];
  plantLights[0].position.set(-1.8, y0 + 3.4, 2.8); plantLights[1].position.set(1.8, y0 + 3.0, 1.0); plantLights[2].position.set(-3.6, y0 + 3.2, 2.2); L0.add(...plantLights);
  { const yc = levelY(1) - T - 0.06;
    for (const z of [-0.4, 1.4, 3.2]) L0.add(box(0.12, 0.05, 1.3, M.lamp, 0.85, yc, z, { cast: false, round: false }), box(0.2, 0.06, 1.4, M.steel, 0.85, yc + 0.05, z, { round: false })); }
  reg('plant', L0); anchors['plant'] = new THREE.Vector3(-3.3, y0 + 1.5, 2.2);

  const ws = { card: [], decisions: [], knowledge: [], boundary: [], desk: [], wrap: [] };
  const hoppers = [];
  for (let i = 1; i <= DIM.FLOORS; i++) {
    const lv = levels[i].group, y = levelY(i), r = rng(100 + i), { nx, nz } = levels[i];
    const tint = M.tint[i];
    reg('floor.' + i, lv); anchors['floor.' + i] = new THREE.Vector3(3.0, y + 1.2, 1.5);
    const bz = new THREE.Group(); const zx = [-W / 2 + WALL, -1.8, 2.4, W / 2 - WALL];
    [0, 1, 2].forEach((k) => {
      const a = zx[k], b = zx[k + 1];
      bz.add(slab(a, b, y, y + 0.025, -D / 2 + WALL, nz, M.floorZone[i][k], { cast: false }));
      if (b > nx) bz.add(slab(Math.max(a, nx), b, y, y + 0.025, nz, D / 2 - WALL, M.floorZone[i][k], { cast: false }));
    });
    for (const sx of [zx[1], zx[2]]) { bz.add(slab(sx - 0.03, sx + 0.03, y, y + 0.03, -D / 2 + WALL, nz, M.ink, { cast: false }));
      if (sx > nx) bz.add(slab(sx - 0.03, sx + 0.03, y, y + 0.03, nz, D / 2 - WALL, M.ink, { cast: false })); }
    lv.add(bz); ws.boundary.push(bz);
    const card = new THREE.Group(); card.position.set(-4.75, y, nz - 0.5);
    card.add(box(0.06, 1.25, 0.06, M.steel, 0, 0.62, 0), box(0.4, 0.04, 0.3, M.steel, 0, 0.02, 0));
    const band = new THREE.Color(tokens['tint-' + i]).lerp(new THREE.Color(tokens['mat-steel']), 0.72).getStyle();
    const face = new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 30 + i, { bandH: 64, band }), roughness: 0.8 });
    card.add(box(0.95, 1.2, 0.05, [M.paper, M.paper, M.paper, M.paper, face, M.paper], 0, 1.5, 0.04, { uv: false }));
    card.rotation.y = 0.35; lv.add(card); ws.card.push(card);
    const dec = new THREE.Group();
    dec.add(withEdges(box(1.9, 0.95, 0.6, tint, -2.9, y + 0.475, -D / 2 + WALL + 0.32), M.edge));
    let bx = -3.78; const nb = 12 + Math.floor(r() * 6); const binders = [];
    const bxMax = i === DIM.FLOORS ? -2.22 : -2.02;
    for (let k = 0; k < nb && bx < bxMax; k++) { const bw = 0.08 + r() * 0.05, bh = 0.42 + r() * 0.12; const b = box(bw, bh, 0.38, M.binder[k % 5], bx + bw / 2, y + 0.95 + bh / 2, -D / 2 + WALL + 0.3); dec.add(b); binders.push({ b, bh }); bx += bw + 0.012; }
    dec.userData.endX = bx; dec.userData.binders = binders;
    lv.add(dec); ws.decisions.push(dec);
    const kn = new THREE.Group(); const kx0 = -1.6, kx1 = 1.2, kz = -D / 2 + WALL + 0.25;
    for (const sy of [0.05, 0.85, 1.65]) kn.add(box(kx1 - kx0, 0.05, 0.45, M.wood, (kx0 + kx1) / 2, y + sy, kz));
    kn.add(box(0.05, 1.7, 0.45, M.wood, kx0, y + 0.85, kz), box(0.05, 1.7, 0.45, M.wood, kx1, y + 0.85, kz));
    for (let x = kx0 + 0.08; x < kx1 - 0.45; x += 0.5) kn.add(box(0.44, 0.5, 0.36, M.crate, x + 0.22, y + 0.33, kz));
    let qx = kx0 + 0.08; for (let k = 0; qx < kx1 - 0.15; k++) { const bw = 0.06 + r() * 0.06, bh = 0.4 + r() * 0.25; kn.add(box(bw, bh, 0.3, k % 3 ? M.paper : M.binder[(k + i) % 5], qx + bw / 2, y + 0.875 + bh / 2, kz)); qx += bw + 0.01; }
    lv.add(kn); ws.knowledge.push(kn);
    const desk = new THREE.Group(); const dx = 2.9, dz = 0.4;
    desk.add(box(2.4, 0.06, 1.0, M.woodLight, dx, y + 0.75, dz));
    for (const [ox, oz] of [[-1.1, -0.42], [1.1, -0.42], [-1.1, 0.42], [1.1, 0.42]]) desk.add(box(0.05, 0.72, 0.05, M.steel, dx + ox, y + 0.36, dz + oz));
    desk.add(monitor(M, M.screens[(i * 2) % 6], dx - 0.35, y + 0.78, dz - 0.25, 0, 0.78, 0.46));
    desk.add(box(0.5, 0.012, 0.36, M.paper, dx + 0.6, y + 0.79, dz + 0.1), box(0.42, 0.012, 0.3, M.paper, dx + 0.62, y + 0.80, dz + 0.08));
    desk.add(chair(M, dx - 0.3, y, dz + 0.85, Math.PI, ['', 'wood', 'stool', 'office'][i]));
    lv.add(desk); ws.desk.push(desk);
    const theme = new THREE.Group(); lv.add(theme);
    if (i === 1) {
      for (const bx0 of [1.6, 2.75]) { theme.add(box(1.05, 2.2, 0.4, M.wood, bx0 + 0.52, y + 1.1, -D / 2 + WALL + 0.22));
        for (let s = 0; s < 4; s++) { let q = bx0 + 0.06; while (q < bx0 + 0.98) { const bw = 0.05 + r() * 0.05, bh = 0.28 + r() * 0.16;
          theme.add(box(bw, bh, 0.28, (r() < 0.6 ? M.paper : M.binder[Math.floor(r() * 5)]), q + bw / 2, y + 0.12 + s * 0.52 + bh / 2, -D / 2 + WALL + 0.48)); q += bw + 0.012; } } }
      theme.add(box(2.0, 0.05, 0.9, M.woodLight, 3.2, y + 0.74, 2.3));
      for (const [ox, oz] of [[-0.9, -0.38], [0.9, -0.38], [-0.9, 0.38], [0.9, 0.38]]) theme.add(box(0.05, 0.72, 0.05, M.steel, 3.2 + ox, y + 0.36, 2.3 + oz));
      for (let s = 0; s < 3; s++) theme.add(box(0.36, 0.06 + s * 0.04, 0.28, M.paper, 2.6 + s * 0.45, y + 0.8 + s * 0.02, 2.25));
      theme.add(cyl(0.02, 0.4, M.steel, 3.95, y + 0.96, 2.1, 8), cyl(0.12, 0.1, M.lamp, 3.95, y + 1.18, 2.1, 16, 0.07));
      theme.add(chair(M, 3.2, y, 2.95, Math.PI, 'wood'));
      theme.add(box(1.9, 0.014, 1.5, M.rug, 1.55, y + 0.032, 2.55, { cast: false, round: false }));
      theme.add(chair(M, 1.45, y + 0.04, 2.75, 2.5, 'arm'));
      theme.add(cyl(0.018, 1.45, M.steel, 0.95, y + 0.75, 3.35, 8), cyl(0.2, 0.05, M.steel, 0.95, y + 0.05, 3.35, 18), cyl(0.09, 0.24, M.lamp, 0.95, y + 1.5, 3.35, 18, 0.2));
      for (let s = 0; s < 4; s++) theme.add(box(0.34 - s * 0.03, 0.07, 0.26, s % 2 ? M.binder[2] : M.paper, 2.05, y + 0.07 + s * 0.072, 3.25));
    } else if (i === 2) {
      theme.add(withEdges(box(0.9, 2.0, 0.6, M.dark, 2.0, y + 1.0, -D / 2 + WALL + 0.32), M.edge));
      for (let s = 0; s < 6; s++) for (let c = 0; c < 3; c++) theme.add(box(0.05, 0.03, 0.03, (s + c) % 3 ? M.led : M.lamp, 1.72 + c * 0.12, y + 0.45 + s * 0.26, -D / 2 + WALL + 0.63, { cast: false }));
      for (let s = 0; s < 4; s++) for (let c = 0; c < 5; c++) theme.add(box(0.3, 0.2, 0.3, (s + c) % 4 ? M.crate : M.tint[2], 2.85 + c * 0.34, y + 0.35 + s * 0.3, -D / 2 + WALL + 0.2));
      theme.add(box(2.3, 0.06, 0.8, M.woodLight, 3.3, y + 0.9, 2.2), box(2.2, 0.85, 0.7, M.steel, 3.3, y + 0.43, 2.2));
      for (let k = 0; k < 3; k++) theme.add(monitor(M, M.screens[3 + k % 2], 2.6 + k * 0.72, y + 0.93, 2.0, 0, 0.56, 0.34));
      theme.add(chair(M, 3.3, y, 2.95, Math.PI, 'stool'));
      theme.add(box(0.42, 0.28, 0.32, M.dark, 4.15, y + 1.07, 2.35), box(0.22, 0.16, 0.01, M.screens[3], 4.08, y + 1.09, 2.515, { uv: false, round: false }));
      const cart = new THREE.Group(); cart.position.set(1.35, y, 2.7); theme.add(cart);
      for (const sy of [0.18, 0.62, 1.02]) cart.add(box(0.8, 0.04, 0.5, M.steelLight, 0, sy, 0));
      for (const [ox, oz] of [[-0.38, -0.23], [0.38, -0.23], [-0.38, 0.23], [0.38, 0.23]]) cart.add(box(0.03, 1.02, 0.03, M.steel, ox, 0.53, oz, { round: false }), cyl(0.04, 0.04, M.dark, ox, 0.04, oz, 10));
      cart.add(box(0.36, 0.22, 0.3, M.dark, -0.18, 0.75, 0), box(0.3, 0.16, 0.28, M.crate, 0.2, 0.72, 0), box(0.5, 0.3, 0.36, M.tint[2], 0, 0.35, 0), box(0.04, 0.03, 0.02, M.led, -0.3, 0.8, 0.155, { cast: false }));
      theme.add(box(3.4, 0.05, 0.3, M.steelLight, 2.7, y + DIM.H - 0.25, -0.9, { round: false }));
    } else {
      theme.add(box(2.4, 1.3, 0.04, M.woodLight, 2.9, y + 1.55, -D / 2 + WALL + 0.03));
      for (let k = 0; k < 14; k++) theme.add(box(0.26, 0.2, 0.012, M.paper, 1.95 + (k % 7) * 0.32, y + 1.95 - Math.floor(k / 7) * 0.5 - (k % 2) * 0.08, -D / 2 + WALL + 0.06, { cast: false }));
      theme.add(box(0.05, 1.0, 1.7, M.dark, W / 2 - WALL - 0.03, y + 1.55, 0.2), box(0.01, 0.92, 1.62, M.screens[2], W / 2 - WALL - 0.06, y + 1.55, 0.2, { uv: false }));
      theme.add(box(1.6, 0.05, 0.8, M.woodLight, 3.4, y + 0.74, 2.3));
      for (const [ox, oz] of [[-0.7, -0.33], [0.7, -0.33], [-0.7, 0.33], [0.7, 0.33]]) theme.add(box(0.05, 0.72, 0.05, M.steel, 3.4 + ox, y + 0.36, 2.3 + oz));
      theme.add(monitor(M, M.screens[5], 3.2, y + 0.77, 2.15, 0, 0.6, 0.36), chair(M, 3.1, y, 2.95, Math.PI));
      theme.add(box(0.05, 1.5, 0.05, M.steel, 1.85, y + 0.75, 2.8), box(0.9, 0.62, 0.03, M.paper, 1.85, y + 1.25, 2.84));
      theme.add(box(2.4, 0.014, 1.6, M.rug, 3.3, y + 0.032, 2.35, { cast: false, round: false }));
      const rig = (x, z, h) => { const g = new THREE.Group(); g.position.set(x, y, z); theme.add(g);
        for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4, leg = cyl(0.014, h * 1.02, M.steel, Math.cos(a) * 0.17, h / 2, Math.sin(a) * 0.17, 6); leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); g.add(leg); }
        g.add(cyl(0.02, 0.3, M.steel, 0, h + 0.1, 0, 8)); return g; };
      const cam = rig(1.05, 1.75, 1.25); cam.rotation.y = -0.35;
      cam.add(box(0.26, 0.17, 0.14, M.dark, 0, 1.36, 0), cyl(0.06, 0.16, M.ink, 0.19, 1.37, 0, 16).rotateZ(Math.PI / 2), box(0.08, 0.06, 0.1, M.dark, -0.04, 1.48, 0));
      const soft = rig(1.0, 3.45, 1.55); soft.rotation.y = 0.55;
      soft.add(box(0.12, 0.6, 0.6, M.dark, -0.06, 1.75, 0), box(0.012, 0.52, 0.52, M.lamp, 0.005, 1.75, 0, { cast: false, round: false }));
    }
    if (i < DIM.FLOORS) theme.add(box(1.6, 0.06, 0.14, M.lamp, 2.9, y + DIM.H - 0.45, 0.4, { cast: false }), box(0.02, 0.4, 0.02, M.steel, 2.3, y + DIM.H - 0.22, 0.4), box(0.02, 0.4, 0.02, M.steel, 3.5, y + DIM.H - 0.22, 0.4));
    else theme.add(cyl(0.02, 1.6, M.steel, 5.2, y + 0.8, -0.9, 8), cyl(0.16, 0.2, M.lamp, 5.2, y + 1.65, -0.9, 18, 0.1));
    const lamp = new THREE.PointLight('#FFEFD9', 6, 0, 2); lamp.position.set(2.6, y + 2.3, 0.6); lv.add(lamp);
    const wrap = new THREE.Group(); const wx = 4.75, wz = 3.0;
    const hop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.16, 0.55, 32, 1, true), M.steel); hop.position.set(wx, y + 1.15, wz); hop.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 32), M.steel); rim.rotation.x = Math.PI / 2; rim.position.set(wx, y + 1.42, wz);
    wrap.add(hop, rim, cyl(0.16, 0.6, M.steel, wx, y + 0.6, wz, 24), box(0.6, 0.06, 0.6, M.steel, wx, y + 0.03, wz));
    const sheet = box(0.3, 0.012, 0.4, M.paper, wx, y + 1.6, wz, { cast: false }); wrap.add(sheet); hoppers.push({ sheet, x: wx, z: wz, y, i });
    lv.add(wrap); ws.wrap.push(wrap);
  }
  const top = levelY(DIM.FLOORS);
  for (const k of Object.keys(ws)) members['ws.' + k] = ws[k];
  for (let i = 1; i <= DIM.FLOORS; i++) members['floor.' + i] = [levels[i].group];
  members.plant = [levels[0].group];
  reg('ws.card', ws.card[2]); anchors['ws.card'] = new THREE.Vector3(-4.75, top + 2.15, NOTCH.Z[3] - 0.45);
  reg('ws.decisions', ws.decisions[2]); anchors['ws.decisions'] = new THREE.Vector3(-2.9, top + 1.5, -D / 2 + 0.6);
  reg('ws.knowledge', ws.knowledge[2]); anchors['ws.knowledge'] = new THREE.Vector3(-1.0, top + 1.8, -D / 2 + 0.6);
  reg('ws.boundary', ws.boundary[2]); anchors['ws.boundary'] = new THREE.Vector3(-4.0, top + 0.05, NOTCH.Z[3] - 0.4);
  reg('ws.desk', ws.desk[2]); anchors['ws.desk'] = new THREE.Vector3(2.6, top + 1.5, 0.15);
  reg('ws.wrap', ws.wrap[2]); anchors['ws.wrap'] = new THREE.Vector3(4.75, top + 1.45, 3.0);

  const pool = reg('pool', new THREE.Group()); root.add(pool); const poolCrates = [];
  { const ax0 = 2.6, ax1 = 8.8, az0 = 5.3, az1 = 9.1, ay = 0.25, ah = 2.3;
    pool.add(withEdges(slab(ax0 - 0.2, ax1 + 0.2, 0, ay, az0 - 0.2, az1 + 0.2, [M.concrete2, M.concrete2, M.concrete, M.concrete, M.concrete2, M.concrete2]), M.edge));
    pool.add(slab(ax0, ax1, ay, ay + 0.02, az0, az1, M.zone[0], { cast: false }));
    pool.add(slab(ax0, ax1, ay, ay + ah, az0, az0 + WALL, [M.facade, M.facade, M.sectionWall, M.facade, M.tint[0], M.facade]));
    pool.add(slab(ax1 - WALL, ax1, ay, ay + ah, az0, az1, [M.facade, M.tint[0], M.sectionWall, M.facade, M.sectionWall, M.facade]));
    pool.add(slab(ax0, ax1 - WALL, ay, ay + SILL, az1 - WALL, az1, [M.facade, M.sectionWall, M.sectionWall, M.facade, M.facade, M.tint[0]]));
    pool.add(slab(ax0, ax0 + WALL, ay, ay + SILL, az0 + WALL, az1 - WALL, [M.tint[0], M.facade, M.sectionWall, M.facade, M.sectionWall, M.sectionWall]));
    for (const cx of [ax0 + 0.15, ax1 - 0.15]) for (const cz of [az0 + 0.15, az1 - 0.15]) { const c = iBeam(ah, 'y', M.steel, 0.2); c.position.set(cx, ay + ah / 2, cz); pool.add(c); }
    const rx = ax1 - WALL - 0.4;
    for (const sy of [0.05, 0.95]) pool.add(box(0.7, 0.05, 3.3, M.wood, rx, ay + sy, (az0 + az1) / 2));
    for (const sz of [(az0 + az1) / 2 - 1.62, (az0 + az1) / 2 + 1.62]) pool.add(box(0.05, 1.3, 0.05, M.steel, rx + 0.32, ay + 0.65, sz), box(0.05, 1.3, 0.05, M.steel, rx - 0.32, ay + 0.65, sz));
    for (let k = 0; k < 11; k++) { const row = k < 6 ? 0 : 1, col = row ? k - 6 : k; const cz = az0 + 0.55 + col * 0.52 + row * 0.26;
      const cr = box(0.46, 0.42, 0.44, k >= 9 ? M.tint[3] : M.crate, rx, ay + 0.29 + row * 0.9, cz); pool.add(cr); poolCrates.push(cr); }
    pool.add(box(1.6, 0.8, 0.9, M.wood, ax0 + 1.4, ay + 0.4, az0 + 1.5), box(0.46, 0.42, 0.44, M.crate, ax0 + 1.2, ay + 1.01, az0 + 1.5));
    pool.add(box(1.2, 0.06, 0.14, M.lamp, (ax0 + ax1) / 2, ay + ah - 0.25, az0 + 0.35, { cast: false }));
    const pl = new THREE.PointLight('#FFEFD9', 5, 0, 2); pl.position.set(6.0, 2.0, 7.0); pool.add(pl); }
  anchors['pool'] = new THREE.Vector3(8.2, 1.55, 7.6);

  const loop = reg('loop', new THREE.Group()); root.add(loop);
  const valve = reg('loop.approve', new THREE.Group()); root.add(valve);
  let loopKey = '';
  const R = 0.17, DX = 5.25, DZ = D / 2 + 0.5, VX = 3.7, VY = levelY(0) + 2.4, VZ = DZ;
  const MF = { x: 1.35, z: -1.45 };
  L0.add(withEdges(box(0.8, 0.9, 0.8, M.steel, MF.x, levelY(0) + 0.45, MF.z), M.edge));
  const wheel = new THREE.Group();
  { valve.add(cyl(R * 1.6, 0.5, M.steel, VX, VY, VZ, 28).rotateZ(Math.PI / 2), box(0.2, 0.2, 0.2, M.steel, VX, VY + 0.18, VZ), cyl(0.05, 0.4, M.steel, VX, VY + 0.42, VZ, 12));
    wheel.position.set(VX, VY + 0.64, VZ);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 40), M.ink); rim.rotation.x = Math.PI / 2; rim.castShadow = true; wheel.add(rim);
    for (let k = 0; k < 3; k++) { const sp = box(0.6, 0.03, 0.03, M.ink, 0, 0, 0); sp.rotation.y = k * Math.PI / 3; wheel.add(sp); }
    wheel.add(box(0.03, 0.12, 0.03, M.ink, 0.3, 0.06, 0));
    valve.add(wheel, box(0.2, 0.26, 0.012, M.paper, VX + 0.05, VY + 0.24, VZ + 0.26, { cast: false })); }
  pool.add(slab(7.05, 7.75, 0.27, 0.62, 7.15, 7.85, M.wood), slab(7.12, 7.68, 0.6, 0.63, 7.22, 7.78, M.tint[0], { cast: false }));
  function buildLoop(off, d, open) {
    loop.clear();
    const yy = (i) => levelY(i) + off[i];
    const G = { topic: new THREE.Group(), pool: new THREE.Group(), core: new THREE.Group() };
    for (const k in G) { G[k].name = 'loop.' + k; loop.add(G[k]); members['loop.' + k] = [G[k]]; }
    members['loop.core'].push(valve);
    const runs = [];
    runs.push({ kind: 'pool', r: R, path: roundedPath([[4.75, yy(3) + 0.7, 3.0], [4.75, yy(3) + 0.7, DZ], [DX, yy(3) + 0.7, DZ], [DX, 1.3, DZ], [DX, 1.3, 6.3], [7.4, 1.3, 6.3], [7.4, 1.3, 7.5], [7.4, 0.8, 7.5]], 0.5) });
    for (const i of [1, 2]) runs.push({ kind: 'pool', r: R * 0.8, short: true, path: roundedPath([[4.75, yy(i) + 0.7, 3.0], [4.75, yy(i) + 0.7, DZ], [DX - R, yy(i) + 0.7, DZ]], 0.45) });
    runs.push({ kind: 'core', r: R, gate: DX - VX, path: roundedPath([[DX, VY, VZ], [2.2, VY, VZ], [2.2, VY, MF.z], [MF.x, VY, MF.z], [MF.x, levelY(0) + 0.9, MF.z]], 0.5) });
    for (const i of [1, 2, 3]) runs.push({ kind: 'topic', r: R * 0.7, short: true, cap: true, path: roundedPath([[4.75, yy(i) + 0.7, 3.0], [4.75, yy(i) + 0.7, 0.4], [4.2, yy(i) + 0.7, 0.4]], 0.4) });
    const up = new THREE.Vector3(0, 1, 0), VIEW = new THREE.Vector3(-0.6, 0.38, 0.71).normalize();
    const subCurve = (path, L, s0, s1) => { const c = new THREE.Curve(); c.getPoint = (u, t = new THREE.Vector3()) => path.getPointAt(clamp01((s0 + u * (s1 - s0)) / L), t); return c; };
    const tubeSeg = (g, path, L, s0, s1, r, mat, shadow = true) => { if (s1 - s0 < 0.01) return;
      const m = new THREE.Mesh(new THREE.TubeGeometry(subCurve(path, L, s0, s1), Math.max(6, Math.round((s1 - s0) * 14)), r, 18, false), mat); m.castShadow = shadow; m.receiveShadow = true; g.add(m); };
    const chevron = (g, path, L, s, r, mat = M.ink) => {
      const u = clamp01(s / L), P = path.getPointAt(u), T = path.getTangentAt(u).normalize();
      const n = VIEW.clone().addScaledVector(T, -VIEW.dot(T)); if (n.lengthSq() < 1e-4) n.copy(up); n.normalize(); const B = T.clone().cross(n);
      const on = (th, ds) => P.clone().addScaledVector(T, ds).addScaledVector(n, Math.cos(th) * (r + 0.012)).addScaledVector(B, Math.sin(th) * (r + 0.012));
      for (const sg of [1, -1]) { const pts = []; for (let k = 0; k <= 6; k++) { const f = k / 6; pts.push(on(sg * 0.85 * (1 - f), -0.1 + 0.2 * f)); }
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, Math.max(0.018, r * 0.15), 6, false), mat); g.add(m); }
    };
    for (const run of runs) {
      const g = G[run.kind], path = run.path, L = path.getLength(), drawn = clamp01(d[run.kind]), Ld = L * drawn;
      run.L = L; run.drawn = drawn;
      if (drawn > 0.001) {
        let accEnd = Ld;
        if (run.gate) { const sP = run.gate + 0.3; accEnd = Math.min(Ld, sP + open * (L - sP));
          tubeSeg(g, path, L, 0, accEnd, run.r, M.accent);
          if (Ld > accEnd + 0.01) { tubeSeg(g, path, L, accEnd, Ld, run.r, M.emptyPipe); tubeSeg(g, path, L, accEnd, Ld, run.r + 0.022, M.outline, false); }
        } else tubeSeg(g, path, L, 0, Ld, run.r, M.accent);
        run.accEnd = accEnd;
        if (run.short) chevron(g, path, L, L * Math.min(0.55, drawn * 0.9), run.r);
        else {
          for (let s = 0.8; s < Ld - 0.2; s += 3.2) { const u = s / L, f = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.35, 0.08, 24), M.steel); f.position.copy(path.getPointAt(u)); f.quaternion.setFromUnitVectors(up, path.getTangentAt(u)); f.castShadow = true; g.add(f); }
          for (let s = 2.0; s < accEnd - 0.5; s += 1.6) if (!run.gate || Math.abs(s - run.gate) > 0.6) chevron(g, path, L, s, run.r);
        }
        if (run.cap && drawn > 0.98) { const p = path.getPointAt(1); g.add(cyl(run.r * 1.6, 0.1, M.steel, p.x, p.y, p.z, 20).rotateZ(Math.PI / 2)); }
      }
      run.pulses = [];
      const n = Math.max(2, Math.round(L / 1.4));
      for (let k = 0; k < n; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(run.r * 1.13, run.r * 1.13, 0.2, 20), M.pulse); b.visible = false; g.add(b); run.pulses.push(b); }
    }
    const tee = (g, p, axis, rr, len, marks) => {
      const body = cyl(rr, len, M.accent, p.x, p.y, p.z, 28); if (axis === 'z') body.rotation.x = Math.PI / 2; else if (axis === 'x') body.rotation.z = Math.PI / 2; g.add(body);
      for (const s of [-1, 1]) { const f = cyl(rr * 1.22, 0.07, M.steel, p.x, p.y, p.z, 28); if (axis === 'z') { f.rotation.x = Math.PI / 2; f.position.z += s * len / 2; } else if (axis === 'x') { f.rotation.z = Math.PI / 2; f.position.x += s * len / 2; } else f.position.y += s * len / 2; g.add(f); }
      for (const m of marks || []) chevron(g, m.path, m.L, m.s, rr);
    };
    for (const i of [1, 2, 3]) {
      if (d.topic < 0.001 && d.pool < 0.001) continue;
      const big = i === DIM.FLOORS, rr = R * (big ? 2.05 : 1.45), len = big ? 0.95 : 0.6, p = new THREE.Vector3(4.75, yy(i) + 0.7, 3.0);
      const g = d.pool >= 0.001 ? G.pool : G.topic;
      const line = roundedPath([[4.75, p.y, 3.0 - len / 2], [4.75, p.y, 3.0 + len / 2]], 0), back = roundedPath([[4.75, p.y, 3.0 + len / 2], [4.75, p.y, 3.0 - len / 2]], 0);
      tee(g, p, 'z', rr, len, big ? [{ path: line, L: len, s: len * 0.78 }, { path: back, L: len, s: len * 0.78 }] : null);
    }
    if (d.core >= 0.001) { const p = new THREE.Vector3(DX, VY, VZ); tee(G.core, p, 'y', R * 1.7, 0.75, null);
      const stub = cyl(R * 1.7, 0.5, M.accent, DX - 0.25, VY, VZ, 28); stub.rotation.z = Math.PI / 2; G.core.add(stub); }
    for (const i of [1, 2]) if (d.pool >= 0.001) G.pool.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.35, 24, 14), M.steel).translateX(DX).translateY(yy(i) + 0.7).translateZ(DZ));
    loop.userData.runs = runs;
  }
  anchors['loop'] = new THREE.Vector3(DX, 1.3, 5.9);
  anchors['loop.pool'] = new THREE.Vector3(7.4, 1.3, 6.9);
  anchors['loop.core'] = new THREE.Vector3(2.2, VY, 2.0);
  anchors['loop.topic'] = new THREE.Vector3(4.75, levelY(2) + 0.7, 1.4);
  anchors['loop.approve'] = new THREE.Vector3(VX, VY + 0.7, VZ);
  anchors['loop.split'] = new THREE.Vector3(4.75, levelY(3) + 0.7 + R * 2.05, 3.0);
  anchors['loop.split2'] = new THREE.Vector3(DX, VY, VZ + R * 1.7);
  anchors['loop.topic.3'] = new THREE.Vector3(4.75, levelY(3) + 0.7 + R * 0.7, 1.2);
  anchors['pool.bin'] = new THREE.Vector3(7.4, 0.63, 7.5);

  const dyn = {};
  const at = (obj, x = 0, y = 0, z = 0) => () => { root.updateMatrixWorld(true); return obj.localToWorld(new THREE.Vector3(x, y, z)); };
  const FACE = -0.66;
  const PF = levelY(0) + 0.025;
  const topY = levelY(DIM.FLOORS);
  const levelOfY = (yy) => { let n = 0; for (let i = 1; i <= DIM.FLOORS; i++) if (yy >= levelY(i) - T - 0.01) n = i; return n; };
  const numTex = (n, ring = true) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = tokens['mat-paper']; g.fillRect(0, 0, w, h);
    if (ring) { g.strokeStyle = tokens['ink']; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
    g.fillStyle = tokens['ink']; g.font = '700 86px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 4);
  });
  const faceBox = (w, h, d, faceMat, x, y, z, side = M.paper) => box(w, h, d, [side, side, side, side, faceMat, side], x, y, z, { uv: false });
  const V3 = {};

  const docs = reg('docs.stack', new THREE.Group()); root.add(docs); docs.visible = false;
  { const edge = canvasTex(64, 128, (g, w, h) => { g.fillStyle = tokens['mat-paper']; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(60,52,44,0.32)';
      for (let yy = 1; yy < h; yy += 3) g.fillRect(0, yy, w, 1); });
    const side = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.9 });
    const tops = [0, 1, 2].map((k) => new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 200 + k, { bandH: 30, band: tokens['ink-2'] }), roughness: 0.85 }));
    const r = rng(77); const piles = [[-9.6, 6.3, 14], [-8.5, 6.9, 9], [-10.5, 5.3, 6]];
    const bundles = [];
    piles.forEach(([px, pz, n], p) => { for (let k = 0; k < n; k++) bundles.push({ p, k, px, pz }); });
    bundles.sort((a, b) => a.k - b.k || a.p - b.p);
    const BH = 0.3;
    for (const [j, b] of bundles.entries()) {
      const m = box(0.95, BH - 0.01, 1.25, [side, side, tops[j % 3], side, side, side], 0, 0, 0, { uv: false });
      m.userData = { home: new THREE.Vector3(b.px + (r() - 0.5) * 0.08, BH * b.k + BH / 2, b.pz + (r() - 0.5) * 0.08), ry: 0.25 + (r() - 0.5) * 0.16 };
      docs.add(m); b.mesh = m;
    }
    V3.docs = bundles;
  }
  dyn['docs.stack'] = () => { let y = 0.3; for (const b of V3.docs) if (b.p === 0 && b.mesh.visible) y = Math.max(y, b.mesh.position.y + 0.15); return new THREE.Vector3(-9.6, y, 6.3); };

  const ROUTE_ST = [[-6.6, 0.008, 5.7], [-5.0, 0.008, 5.7], [-3.4, 0.008, 5.7], [-1.0, PF, 2.2], [0.3, PF, 0.6],
    [1.5, levelY(1) + 0.01, -1.5], [1.5, levelY(2) + 0.01, -1.5], [1.5, topY + 0.01, -1.75], [4.7, topY + 0.01, 2.1]];
  const RISE_X = 0.735, RISE_Z = -1.15;
  const ROUTE_MAIN = [[-7.6, 0.008, 5.7], ROUTE_ST[0], ROUTE_ST[1], ROUTE_ST[2], [-2.3, 0.008, 5.7], [-2.3, 0.008, 4.45], [-2.3, PF, 3.7], [-2.3, PF, 2.2],
    ROUTE_ST[3], [0.3, PF, 2.2], ROUTE_ST[4], [0.3, PF, -0.6], [RISE_X - 0.01, PF, RISE_Z], [RISE_X, topY + 0.02, RISE_Z], [0.9, topY + 0.01, -1.75], ROUTE_ST[7], [4.7, topY + 0.01, -1.75], ROUTE_ST[8]];
  const routeGroups = []; const routeDash = []; const routeSt = [];
  for (let i = 0; i <= DIM.FLOORS; i++) { const g = new THREE.Group(); g.name = 'route.level' + i; levels[i].group.add(g); routeGroups.push(g); }
  members['route'] = routeGroups;
  { const tape = new THREE.MeshStandardMaterial({ color: tokens['ink-2'], roughness: 0.7 });
    const xAxis = new THREE.Vector3(1, 0, 0);
    const lay = (pts, s0) => {
      let s = s0;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = new THREE.Vector3(...pts[k]), b = new THREE.Vector3(...pts[k + 1]), len = a.distanceTo(b), dir = b.clone().sub(a).normalize();
        for (let d = 0; d < len - 0.05; d += 0.5) {
          const dl = Math.min(0.3, len - d); const m = new THREE.Mesh(new THREE.BoxGeometry(dl, 0.016, 0.15), tape);
          m.position.copy(a).addScaledVector(dir, d + dl / 2); m.quaternion.setFromUnitVectors(xAxis, dir); m.receiveShadow = true;
          const lvl = levelOfY(m.position.y); m.position.y += 0; routeGroups[lvl].add(m); routeDash.push({ m, s: s + d });
        }
        s += len;
      }
      return s - s0;
    };
    V3.routeLen = lay(ROUTE_MAIN, 0);
    const sAlong = (p) => { let s = 0, best = 1e9, bs = 0; for (let k = 0; k < ROUTE_MAIN.length - 1; k++) { const a = new THREE.Vector3(...ROUTE_MAIN[k]), b = new THREE.Vector3(...ROUTE_MAIN[k + 1]);
      const l = a.distanceTo(b); const t = clamp01(new THREE.Vector3(...p).sub(a).dot(b.clone().sub(a)) / (l * l || 1)); const d = a.clone().lerp(b, t).distanceTo(new THREE.Vector3(...p)); if (d < best) { best = d; bs = s + t * l; } s += l; } return bs; };
    V3.routeAt = ROUTE_ST.map((p) => sAlong(p));
    for (const i of [1, 2]) { const s0 = sAlong([RISE_X, levelY(i), RISE_Z]); V3.routeAt[4 + i] = s0 + 0.7; lay([[0.85, levelY(i) + 0.01, -1.5], ROUTE_ST[4 + i]], s0); }
    const kinds = ['card', 'cabinet', 'board', 'booth', 'cabinet', 'cabinet', 'cabinet', 'cabinet', 'cabinet'];
    ROUTE_ST.forEach((p, k) => {
      const lvl = levelOfY(p[1]); const g = new THREE.Group(); g.position.set(...p); routeGroups[lvl].add(g); reg('route.' + (k + 1), g);
      const glow = new THREE.MeshStandardMaterial({ color: tokens['mat-paper'], emissive: tokens['glow-lamp'], emissiveIntensity: 0, roughness: 0.5 });
      const disc = cyl(0.46, 0.02, glow, 0, 0.012, 0, 40); disc.castShadow = false; g.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 8, 56), M.ink); ring.rotation.x = Math.PI / 2; ring.position.y = 0.024; g.add(ring);
      const post = new THREE.Group(); post.position.set(0.34, 0, -0.34); g.add(post);
      post.add(box(0.06, 1.3, 0.06, M.steel, 0, 0.65, 0));
      const plate = faceBox(0.6, 0.6, 0.04, new THREE.MeshStandardMaterial({ map: numTex(k + 1), roughness: 0.7 }), 0, 1.6, 0); plate.rotation.y = FACE; post.add(plate);
      post.add(cyl(0.08, 0.07, glow, 0, 1.94, 0, 16));
      const rep = new THREE.Group(); rep.position.set(-0.1, 0.025, 0.08); rep.scale.setScalar(1.5); g.add(rep);
      if (kinds[k] === 'cabinet') rep.add(box(0.16, 0.3, 0.14, M.steel, 0, 0.15, 0), box(0.02, 0.03, 0.03, glow, -0.085, 0.26, 0.03, { cast: false }));
      else if (kinds[k] === 'booth') rep.add(box(0.17, 0.02, 0.17, M.dark, 0, 0.01, 0), box(0.15, 0.22, 0.15, M.kioskGlass, 0, 0.13, 0, { round: false }), box(0.17, 0.04, 0.17, glow, 0, 0.26, 0, { round: false }), box(0.06, 0.1, 0.05, M.figure, 0, 0.1, 0));
      else if (kinds[k] === 'board') { const bd = box(0.26, 0.2, 0.02, glow, 0, 0.26, 0); bd.rotation.y = FACE; rep.add(bd, box(0.02, 0.18, 0.02, M.steel, 0, 0.08, 0)); }
      else { const cd = box(0.22, 0.16, 0.02, glow, 0, 0.3, 0); cd.rotation.y = FACE; rep.add(cd, box(0.12, 0.08, 0.1, M.dark, 0, 0.18, 0), box(0.03, 0.14, 0.03, M.steel, 0, 0.07, 0)); }
      routeSt.push({ g, glow, ring, s: V3.routeAt[k] });
      dyn['route.' + (k + 1)] = at(g, 0.34, 1.6, -0.34);
    });
    for (const g of routeGroups) g.visible = false;
  }
  dyn['route'] = at(routeSt[3].g, 0, 0.4, 0);

  const rails = new THREE.Group(); rails.name = 'core.sockets.rails'; core.skills.add(rails);
  const cables = new THREE.Group(); cables.name = 'core.sockets'; L0.add(cables); parts['core.sockets'] = cables;
  const sockMat = new THREE.MeshStandardMaterial({ color: tokens['mat-concrete-2'], roughness: 0.6, metalness: 0.2 });
  const sockHint = new THREE.MeshStandardMaterial({ color: tokens['mat-concrete-2'], emissive: tokens['glow-screen'], emissiveIntensity: 0, roughness: 0.6 });
  const SOCK = (cab, step) => new THREE.Vector3(0.935, y0 + 0.5 + step * 0.33, -0.2 + cab * 0.6 + 0.205);
  const CABLES = [{ booth: 3, cab: 1, step: 1 }, { booth: 2, cab: 2, step: 2 }, { booth: 1, cab: 4, step: 0 }, { booth: 0, cab: 5, step: 1 }];
  const HINT = { cab: 3, step: 2 };
  { const tick = canvasTex(16, 128, (g, w, h) => { g.fillStyle = '#2A2F35'; g.fillRect(0, 0, w, h); g.fillStyle = tokens['mat-paper']; for (let k = 0; k < 5; k++) g.fillRect(0, Math.round(h * (0.02 + k * 0.24)), w, 3); });
    const railMat = new THREE.MeshStandardMaterial({ map: tick, roughness: 0.5 });
    for (let c = 0; c < 7; c++) {
      rails.add(box(0.02, 1.3, 0.09, [railMat, railMat, railMat, railMat, railMat, railMat], 0.955, y0 + 0.99, -0.2 + c * 0.6 + 0.205, { uv: false }));
      for (let s = 0; s < 4; s++) { const p = SOCK(c, s); const isHint = c === HINT.cab && s === HINT.step;
        rails.add(cyl(0.034, 0.03, isHint ? sockHint : sockMat, p.x, p.y, p.z, 16).rotateZ(Math.PI / 2)); }
    }
  }
  let cableKey = '';
  function buildCables(plug) {
    cables.clear();
    const so = core.skills.position.clone().sub(core.skills.userData.home), ao = core.agents.position.clone().sub(core.agents.userData.home);
    CABLES.forEach((c, k) => {
      const f = clamp01(plug * 4 - k); c.f = f; if (f <= 0.001) return;
      const S = SOCK(c.cab, c.step).add(so), bx = -4.3 + c.booth * 1.2 + ao.x, bz = 1.0 + ao.z, lane = bz + 0.62 + k * 0.1;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(bx + 0.45, y0 + 0.62, bz), new THREE.Vector3(bx + 0.62, y0 + 0.06, bz + 0.25), new THREE.Vector3(bx + 0.9, y0 + 0.05, lane),
        new THREE.Vector3(S.x - 0.75, y0 + 0.05, lane), new THREE.Vector3(S.x - 0.4, y0 + 0.06, S.z), new THREE.Vector3(S.x - 0.16, S.y, S.z), new THREE.Vector3(S.x - 0.02, S.y, S.z)], false, 'centripetal');
      const sub = new THREE.Curve(); sub.getPoint = (u, t = new THREE.Vector3()) => curve.getPointAt(u * f, t);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(sub, 64, 0.025, 10, false), M.ink); tube.castShadow = true; cables.add(tube);
      const head = cyl(0.045, 0.1, M.steelLight, 0, 0, 0, 14); head.position.copy(curve.getPointAt(f)); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(f)); cables.add(head);
    });
  }
  members['core.sockets'] = [cables, rails]; members['core.skills'] = [core.skills, cables]; members['core.agents'] = [core.agents, cables];
  dyn['core.sockets'] = () => SOCK(CABLES[0].cab, CABLES[0].step).add(core.skills.position.clone().sub(core.skills.userData.home));
  dyn['core.sockets.hint'] = () => SOCK(HINT.cab, HINT.step).add(core.skills.position.clone().sub(core.skills.userData.home));

  const hook = new THREE.Group(); hook.name = 'core.enforcement.card'; core.enforcement.add(hook); hook.visible = false;
  { const face = new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 41, { bandH: 70, band: tokens['mat-steel'] }), roughness: 0.75 });
    hook.add(faceBox(0.8, 0.56, 0.025, face, 0, 0, 0)); }
  const GATE = { x: -2.3, z: 3.1 };
  dyn['core.enforcement.card'] = at(hook, 0, 0.3, 0);
  dyn['core.enforcement.arm'] = at(core.enforcement.userData.armPivot, 1.2, 0, 0);
  const sensorLed = core.enforcement.children.find((o) => o.material === M.led) || null;
  const ledHook = M.led.clone(); if (sensorLed) sensorLed.material = ledHook;

  { const z = NOTCH.Z[1] + 0.05 + 0.031, x = -4.25;
    core.rules.add(box(2.12, 0.3, 0.004, M.paper, x, y0 + 1.12, z, { cast: false }));
    const ln = box(1.6, 0.05, 0.006, M.ink, 0, 0, 0, { cast: false }); ln.geometry.translate(0.8, 0, 0);
    ln.position.set(x - 0.95, y0 + 1.12, z + 0.004); core.rules.add(ln); V3.rulesLine = ln; ln.visible = false; }
  dyn['core.rules.line'] = at(core.rules, -4.25 + 0.7, y0 + 1.12, NOTCH.Z[1] + 0.1);

  { const dec = ws.decisions[DIM.FLOORS - 1], yb = topY + 0.95, zb = -D / 2 + WALL + 0.3;
    const bw = 0.11, bh = 0.5; const nb = box(bw, bh, 0.38, M.binder[2], 0, 0, 0); nb.userData.home = new THREE.Vector3(dec.userData.endX + bw / 2, yb + bh / 2, zb);
    nb.visible = false; dec.add(nb); V3.newBinder = nb;
    const old = dec.userData.binders[Math.min(3, dec.userData.binders.length - 1)];
    const tab = box(0.05, 0.12, 0.12, new THREE.MeshStandardMaterial({ color: tokens['ink-2'], roughness: 0.6 }), old.b.position.x, yb + old.bh + 0.06, zb + 0.1); tab.visible = false; dec.add(tab); V3.supTab = tab;
    dyn['ws.decisions.add'] = at(nb, 0, 0.3, 0); }

  const review = reg('ws.review', new THREE.Group()); levels[DIM.FLOORS].group.add(review); review.visible = false;
  { review.position.set(1.8, topY, 1.75); review.rotation.y = FACE;
    const BW = 1.1, BH = 1.4, Y1 = 1.95;
    const tex = canvasTex(220, 280, (g, w, h) => {
      g.fillStyle = tokens['mat-paper']; g.fillRect(0, 0, w, h);
      g.fillStyle = tokens['ink-2']; g.fillRect(0, 0, w, 26);
      g.fillStyle = tokens['ink']; [[12, 52], [80, 60], [150, 60]].forEach(([x0, ww]) => g.fillRect(x0, 36, ww * 0.6, 7));
      g.globalAlpha = 0.5; const r = rng(91);
      for (let row = 0; row < 5; row++) { const yy = 58 + row * 28; g.fillRect(8, yy - 6, w - 16, 1.5);
        g.fillRect(12, yy + 4, 40 + r() * 16, 5); g.fillRect(80, yy + 4, 34 + r() * 26, 5); g.fillRect(150, yy + 4, 34 + r() * 26, 5); g.fillRect(80, yy + 13, 20 + r() * 20, 4); g.fillRect(150, yy + 13, 20 + r() * 24, 4); }
      g.globalAlpha = 1; g.fillRect(74, 50, 1.5, 140); g.fillRect(144, 50, 1.5, 140);
      g.strokeStyle = tokens['ink']; g.lineWidth = 4; for (const cx of [24, 110]) g.strokeRect(cx, 214, 44, 44);
      g.fillStyle = tokens['ink']; g.globalAlpha = 0.55; g.fillRect(74, 230, 26, 5); g.fillRect(160, 230, 34, 5); g.globalAlpha = 1;
    });
    review.add(faceBox(BW, BH, 0.05, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), 0, Y1 - BH / 2, 0, M.steel));
    review.add(box(0.05, Y1 - BH + 0.05, 0.05, M.steel, -BW / 2 + 0.1, (Y1 - BH) / 2, -0.03), box(0.05, Y1 - BH + 0.05, 0.05, M.steel, BW / 2 - 0.1, (Y1 - BH) / 2, -0.03));
    review.add(box(0.12, 0.03, 0.5, M.steel, -BW / 2 + 0.1, 0.015, 0), box(0.12, 0.03, 0.5, M.steel, BW / 2 - 0.1, 0.015, 0));
    const px = (u) => -BW / 2 + u / 220 * BW, py = (v) => Y1 - v / 280 * BH;
    V3.marks = [46, 132].map((u) => { const m = box(0.17, 0.17, 0.012, M.ink, px(u), py(236), 0.03, { cast: false }); m.scale.set(0.001, 0.001, 1); review.add(m); return m; });
    dyn['ws.review'] = at(review, 0, 1.55, 0.03); dyn['ws.review.marks'] = at(review, px(89), py(236), 0.03); }

  const feed = new THREE.Group(); feed.name = 'loop.feed'; root.add(feed); members['loop.feed'] = [feed];
  let feedKey = ''; V3.feed = null;
  const FEED = { x: 6.45, z: 4.5, xin: 4.9, zin: 1.8 };
  function buildFeed(off) {
    feed.clear();
    const y1 = levelY(1) + off[1] + 2.4, y2 = levelY(2) + off[2] + 2.4;
    const foot = [[FEED.x, 0.9, 5.85], [FEED.x, 1.2, FEED.z]];
    const A = [...foot, [FEED.x, y1, FEED.z], [FEED.x, y1, FEED.zin], [FEED.xin, y1, FEED.zin]];
    const B = [...foot, [FEED.x, y2, FEED.z], [FEED.x, y2, FEED.zin], [FEED.xin, y2, FEED.zin]];
    const pa = roundedPath(A, 0.4), pb = roundedPath(B, 0.4);
    for (const [p, r] of [[pa, 0.083], [pb, 0.085]]) { const t = new THREE.Mesh(new THREE.TubeGeometry(p, Math.round(p.getLength() * 10), r, 12, false), M.steelLight); t.castShadow = true; feed.add(t);
      const e = p.getPointAt(1); feed.add(cyl(0.12, 0.08, M.steelLight, e.x, e.y, e.z, 16).rotateZ(Math.PI / 2)); }
    const beads = [];
    for (const [p, n] of [[pa, 3], [pb, 3]]) for (let k = 0; k < n; k++) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.055, 10, 24), M.pulse); feed.add(b); beads.push({ b, p, k }); }
    V3.feed = { pa, pb, beads };
  }
  dyn['loop.feed'] = () => new THREE.Vector3(FEED.x, levelY(1) + levels[1].group.position.y - 0.6, FEED.z);
  for (const i of [1, 2]) dyn['loop.feed.' + i] = () => new THREE.Vector3(FEED.xin + 0.04, levelY(i) + levels[i].group.position.y + 2.4, FEED.zin);

  const build = new THREE.Group(); build.name = 'build'; root.add(build); build.visible = false;
  const drawings = reg('build.drawings', new THREE.Group()); build.add(drawings);
  const stamp = reg('build.stamp', new THREE.Group());
  const installer = reg('build.installer', new THREE.Group()); build.add(installer);
  const inspect = reg('build.inspect', new THREE.Group()); L0.add(inspect); inspect.visible = false;
  members['build'] = [build, inspect];
  {
    drawings.position.set(-8.9, 0, 1.3); drawings.scale.setScalar(1.25);
    for (const [ox, oz] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) drawings.add(box(0.06, 0.92, 0.06, M.steel, ox, 0.46, oz));
    const topG = new THREE.Group(); topG.position.set(0, 0.98, 0); topG.rotation.x = 0.22; drawings.add(topG);
    topG.add(box(1.9, 0.05, 1.25, M.woodLight, 0, 0, 0));
    const dtex = canvasTex(320, 220, (g, w, h) => { g.fillStyle = tokens['mat-paper']; g.fillRect(0, 0, w, h);
      g.strokeStyle = tokens['ink']; g.globalAlpha = 0.75; g.lineWidth = 2.2; g.strokeRect(10, 10, w - 20, h - 20);
      g.lineWidth = 2; g.strokeRect(30, 30, 120, 80); g.strokeRect(160, 30, 130, 80); g.strokeRect(30, 120, 260, 70);
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(40 + k * 18, 40); g.lineTo(40 + k * 18, 100); g.stroke(); }
      g.globalAlpha = 0.45; for (let k = 0; k < 5; k++) g.fillRect(172, 44 + k * 12, 70 + (k % 2) * 30, 3);
      g.globalAlpha = 1; g.fillStyle = tokens['mat-paper']; g.fillRect(44, 146, 230, 14); });
    topG.add(faceBox(1.6, 0.012, 1.1, M.paper, 0, 0.031, 0));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ map: dtex, roughness: 0.85 })); sheet.rotation.x = -Math.PI / 2; sheet.position.y = 0.038; sheet.receiveShadow = true; topG.add(sheet);
    const ln = box(1.15, 0.006, 0.04, M.ink, 0, 0, 0, { cast: false }); ln.geometry.translate(0.575, 0, 0); ln.position.set(-0.52, 0.043, 0.24); topG.add(ln); V3.drawLine = ln;
    stamp.position.set(0.45, 0.043, -0.22); topG.add(stamp);
    const block = new THREE.Group(); stamp.add(block);
    block.add(box(0.2, 0.08, 0.2, M.dark, 0, 0.04, 0), cyl(0.035, 0.18, M.wood, 0, 0.17, 0, 12), new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), M.wood).translateY(0.28));
    const imp = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = tokens['ink-2']; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.lineWidth = 7; g.beginPath(); g.moveTo(16, 34); g.lineTo(28, 46); g.lineTo(50, 18); g.stroke(); });
    const imprint = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), new THREE.MeshBasicMaterial({ map: imp, transparent: true, depthWrite: false })); imprint.rotation.x = -Math.PI / 2; imprint.position.y = 0.002; stamp.add(imprint);
    V3.stamp = { block, imprint };
    dyn['build.drawings'] = at(topG, -0.1, 0.05, 0.24); dyn['build.stamp'] = at(stamp, 0, 0.1, 0);
    installer.position.set(-7.45, 0, 2.0);
    installer.add(box(0.9, 0.12, 0.9, M.concrete2, 0, 0.06, 0), iBeam(5.3, 'y', M.steel, 0.22).translateY(2.77));
    const boom = new THREE.Group(); boom.position.y = 5.35; installer.add(boom);
    boom.add(iBeam(2.75, 'x', M.steel, 0.2).translateX(1.25), box(0.08, 0.7, 0.08, M.steel, 0, 0.35, 0), box(2.09, 0.035, 0.035, M.steel, 1.0, 0.36, 0).rotateZ(-0.29));
    boom.add(box(0.6, 0.4, 0.5, M.concrete2, -0.35, 0, 0));
    const trolley = box(0.22, 0.12, 0.26, M.dark, 2.2, -0.16, 0); boom.add(trolley);
    const rope = box(0.02, 1, 0.02, M.ink, 2.2, 0, 0); rope.geometry.translate(0, -0.5, 0); boom.add(rope);
    const piece = new THREE.Group(); boom.add(piece);
    piece.add(withEdges(box(0.5, 0.85, 0.46, M.steel, 0, -0.425, 0), M.edge), box(0.02, 0.05, 0.05, M.led, -0.26, -0.12, 0.15, { cast: false }), box(0.02, 0.12, 0.34, M.paper, -0.26, -0.25, 0));
    piece.add(box(0.36, 0.03, 0.03, M.ink, 0, 0.01, 0));
    V3.hoist = { boom, rope, piece, trolley };
    dyn['build.installer'] = at(piece, 0, -0.2, 0);
    inspect.position.set(0.3, PF, -0.4);
    inspect.add(box(0.07, 1.45, 0.07, M.steel, -0.42, 0.725, 0), box(0.07, 1.45, 0.07, M.steel, 0.42, 0.725, 0), box(0.94, 0.08, 0.1, M.steel, 0, 1.45, 0));
    const tagF = new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 51, { bandH: 70, band: tokens['ink-2'] }), roughness: 0.8 });
    const tickT = canvasTex(128, 96, (g, w, h) => { g.fillStyle = tokens['mat-paper']; g.fillRect(0, 0, w, h); g.fillStyle = tokens['ink-2']; g.fillRect(0, 0, w, 16);
      g.strokeStyle = tokens['ink']; g.lineWidth = 11; g.beginPath(); g.moveTo(38, 56); g.lineTo(58, 76); g.lineTo(94, 32); g.stroke(); });
    const tagB = new THREE.MeshStandardMaterial({ map: tickT, roughness: 0.8 });
    const tag = new THREE.Group(); tag.position.set(0, 1.4, 0.06); inspect.add(tag);
    tag.add(box(0.012, 0.12, 0.012, M.ink, 0, -0.06, 0), box(0.3, 0.22, 0.012, [M.paper, M.paper, M.paper, M.paper, tagF, tagB], 0, -0.23, 0, { uv: false }));
    V3.tag = tag;
    dyn['build.inspect'] = at(tag, 0, -0.23, 0.02);
  }

  const lobby = reg('lobby.map', new THREE.Group()); root.add(lobby); lobby.visible = false;
  { lobby.position.set(-7.4, 0, 4.4); lobby.rotation.y = FACE;
    const BW = 1.3, BH = 1.3, YT = 2.3;
    const mapDraw = (alpha, seed) => (g, w, h) => { const r = rng(seed); g.fillStyle = tokens['mat-paper']; g.fillRect(0, 0, w, h); g.globalAlpha = alpha;
      g.fillStyle = tokens['ink']; g.fillRect(0, 0, w, 18);
      for (let q = 0; q < 4; q++) { const ox = 10 + (q % 2) * 124, oy = 28 + Math.floor(q / 2) * 112; g.strokeStyle = tokens['ink']; g.lineWidth = 2; g.strokeRect(ox, oy, 116, 104);
        g.fillStyle = tokens['ink-2']; g.fillRect(ox, oy, 116, 12); g.fillStyle = tokens['ink'];
        const pts = []; for (let k = 0; k < 6; k++) pts.push([ox + 14 + r() * 88, oy + 24 + r() * 70]);
        g.lineWidth = 1.5; g.beginPath(); pts.forEach(([x, y], k) => { if (k) { g.moveTo(pts[k - 1][0], pts[k - 1][1]); g.lineTo(x, y); } }); g.stroke();
        for (const [x, y] of pts) g.fillRect(x - 4, y - 4, 8, 8); }
      g.globalAlpha = 1; };
    const fresh = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, mapDraw(0.95, 61)), roughness: 0.8 });
    const old = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, mapDraw(0.22, 62)), roughness: 0.8 });
    lobby.add(faceBox(BW, BH, 0.04, fresh, 0, YT - BH / 2, 0, M.steel));
    const cover = faceBox(BW - 0.02, BH - 0.02, 0.01, old, 0, 0, 0.027, M.paper); cover.geometry.translate(0, -(BH - 0.02) / 2, 0); cover.position.y = YT - 0.01; lobby.add(cover);
    const head = box(BW + 0.08, 0.05, 0.08, M.dark, 0, YT, 0.05); lobby.add(head);
    lobby.add(box(0.06, YT - BH + 0.02, 0.06, M.steel, -BW / 2 + 0.1, (YT - BH) / 2, -0.03), box(0.06, YT - BH + 0.02, 0.06, M.steel, BW / 2 - 0.1, (YT - BH) / 2, -0.03));
    lobby.add(withEdges(box(0.5, 0.55, 0.42, M.dark, BW / 2 + 0.38, 0.275, 0.05), M.edge), box(0.3, 0.012, 0.22, M.paper, BW / 2 + 0.38, 0.56, 0.12), box(0.05, 0.03, 0.02, M.led, BW / 2 + 0.25, 0.45, 0.27, { cast: false }));
    V3.lobby = { cover, head, YT, BH };
    dyn['lobby.map'] = at(lobby, 0, YT - 0.35, 0.03); dyn['lobby.map.machine'] = at(lobby, BW / 2 + 0.38, 0.58, 0.05); }

  const retired = reg('pool.retired', new THREE.Group()); pool.add(retired); retired.visible = false;
  { const ay = 0.25, sx = 3.9, sz = 5.78;
    for (const sy of [1.05, 1.65]) retired.add(box(1.9, 0.05, 0.5, M.concrete2, sx, ay + sy, sz));
    for (const ox of [-0.85, 0.85]) for (const sy of [1.05, 1.65]) retired.add(box(0.05, 0.3, 0.05, M.steel, sx + ox, ay + sy - 0.15, sz - 0.2), box(0.05, 0.05, 0.4, M.steel, sx + ox, ay + sy - 0.05, sz));
    retired.add(faceBox(0.9, 0.12, 0.02, new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 71, { bandH: 320, band: tokens['ink-2'] }), roughness: 0.8 }), sx, ay + 1.0, sz + 0.26));
    retired.add(box(0.4, 0.3, 0.38, new THREE.MeshStandardMaterial({ color: '#9C958A', roughness: 0.8 }), sx + 0.5, ay + 1.675 + 0.15, sz));
    const crate = poolCrates[1]; crate.userData.home = crate.position.clone(); crate.userData.mat0 = crate.material;
    const dim = M.crate.clone(); dim.color.lerp(new THREE.Color(tokens['mat-concrete-2']), 0.8);
    const tag = new THREE.Group(); crate.add(tag); tag.position.set(-0.245, 0.2, 0.0);
    tag.add(box(0.012, 0.1, 0.012, M.ink, 0, -0.05, 0), faceBox(0.02, 0.26, 0.3, M.paper, 0, -0.23, 0, M.paper));
    tag.children[1].material = [new THREE.MeshStandardMaterial({ map: docTex(tokens['mat-paper'], tokens['ink'], 72, { bandH: 90, band: tokens['ink-2'] }), roughness: 0.8 }), M.paper, M.paper, M.paper, M.paper, M.paper];
    tag.children[1].material = [M.paper, tag.children[1].material[0], M.paper, M.paper, M.paper, M.paper];
    tag.visible = false;
    V3.retire = { crate, dim, tag, shelf: new THREE.Vector3(sx - 0.35, ay + 1.075 + 0.21, sz) };
    dyn['pool.retired'] = at(retired, sx - 0.3, ay + 1.0, sz + 0.27); dyn['pool.candidate'] = at(crate, -0.26, -0.03, 0); }

  { const { c, col, h } = swapCol;
    const ghostSteel = M.steel.clone(); ghostSteel.transparent = true; ghostSteel.depthWrite = false;
    const gcol = col.clone(true); gcol.traverse((o) => { if (o.isMesh) o.material = ghostSteel; }); gcol.visible = false; c.add(gcol);
    const ncol = col.clone(true); ncol.visible = false; c.add(ncol);
    V3.swap = { col, gcol, ncol, ghostSteel, h };
    dyn['frame.swap'] = at(c, 0, h * 0.55, 0); }

  const paper = new THREE.Color(tokens['bg-paper']);
  const ghostMats = new Map();
  const ghostOf = (src) => { let g = ghostMats.get(src); if (!g) { g = src.clone(); g.userData.src = src; g.transparent = true; g.depthWrite = false; if (src.clippingPlanes) g.clippingPlanes = src.clippingPlanes; ghostMats.set(src, g); } return g; };
  let ghosted = [];
  function applyFocus(ids, amount, hide = 0) {
    for (const o of ghosted) { o.material = o.userData.mat0; o.castShadow = o.userData.cast0; }
    ghosted = [];
    if (!ids || amount <= 0.001) return;
    const keep = new Set();
    for (const id of ids) for (const ob of (members[id] || (parts[id] ? [parts[id]] : []))) ob?.traverse((o) => keep.add(o));
    root.traverse((o) => {
      if (!(o.isMesh || o.isLineSegments) || keep.has(o)) return;
      o.userData.mat0 = o.material; o.userData.cast0 = o.castShadow;
      o.material = Array.isArray(o.material) ? o.material.map(ghostOf) : ghostOf(o.material); o.castShadow = amount < 0.5 && hide < 0.001; ghosted.push(o);
    });
    for (const [src, g] of ghostMats) {
      if (g.color && src.color) g.color.copy(src.color).lerp(paper, 0.8 * amount);
      g.opacity = (src.opacity ?? 1) * lerp(1, 0.16, amount) * (1 - clamp01(hide)); g.visible = (src.visible !== false) && hide < 0.999;
      if ('map' in src) g.map = amount > 0.6 ? null : src.map;
      if (src.emissive) g.emissiveIntensity = src.emissiveIntensity * (1 - amount);
      g.needsUpdate = true;
    }
  }

  const state = { cut: 1, explode: 0, coreExplode: 0, flow: 0, time: null, focus: null, focusAmount: 1, loop: 1, loopTopic: null, loopPool: null, loopCore: null, approve: 0,
    coreExplodeOrder: 'build', coreRules: null, coreSkills: null, coreAgents: null, coreGate: null, coreTools: null,
    stack: 0, route: 0, routeLit: 0, plug: 0, socketHint: 0, gateArm: 1, hookCard: 0, rulesLine: 0, decisionsAdd: 0,
    reviewIn: 0, marks: 0, loopBranch: null, riserFlow: 0, build: null, mapPrint: null, retire: null, frameSwap: 0,
    focusHide: 0 };
  let focusKey = '';
  function updateV3(off) {
    const S = state;
    { const n = V3.docs.length, v = clamp01(S.stack) * n; docs.visible = v > 0.001;
      for (const [j, b] of V3.docs.entries()) { const f = clamp01(v - j), m = b.mesh; m.visible = f > 0.001;
        if (m.visible) { const d = 1 - smooth(f); m.position.copy(m.userData.home); m.position.y += d * 1.6; m.rotation.set(0, m.userData.ry + d * 0.5, d * 0.15); } } }
    { const lit = Math.max(0, Math.min(9, +S.routeLit || 0)), need = lit > 0 ? V3.routeAt[Math.ceil(lit) - 1] + 0.01 : 0;
      const drawS = Math.max(clamp01(S.route) * V3.routeLen, need), any = drawS > 0.001;
      for (const g of routeGroups) g.visible = any;
      for (const d of routeDash) d.m.visible = d.s <= drawS;
      routeSt.forEach((st, k) => { st.g.visible = st.s <= drawS + 0.01 || lit > k;
        const f = smooth(clamp01(lit - k)); st.glow.emissiveIntensity = 1.9 * f; st.glow.color.set(tokens['mat-paper']).lerp(new THREE.Color('#FFF6E8'), f); }); }
    { const so = core.skills.position.clone().sub(core.skills.userData.home), ao = core.agents.position.clone().sub(core.agents.userData.home);
      const k = clamp01(S.plug).toFixed(4) + '|' + so.toArray().map((v) => v.toFixed(3)).join(',') + '|' + ao.toArray().map((v) => v.toFixed(3)).join(',');
      if (k !== cableKey) { buildCables(clamp01(S.plug)); cableKey = k; }
      CABLES.forEach((c) => { agentBands[c.booth].emissiveIntensity = 0.75 * smooth(((c.f || 0) - 0.85) / 0.15); });
      sockHint.emissiveIntensity = 0.9 * clamp01(S.socketHint); }
    { core.enforcement.userData.armPivot.rotation.z = (1 - smooth(S.gateArm)) * 1.25;
      const h = smooth(S.hookCard); hook.visible = h > 0.001;
      hook.position.set(GATE.x, y0 + 2.29 + h * 0.85, GATE.z + 0.12 + h * 0.1); hook.rotation.set(0, FACE * h, 0); hook.scale.setScalar(0.15 + 0.85 * h);
      ledHook.emissiveIntensity = M.led.emissiveIntensity * (1 + 1.2 * h); }
    { const f = clamp01(S.rulesLine); V3.rulesLine.visible = f > 0.001; V3.rulesLine.scale.x = Math.max(1e-3, smooth(f)); }
    { const f = smooth(S.decisionsAdd), b = V3.newBinder; b.visible = f > 0.001; b.position.copy(b.userData.home); b.position.z += (1 - f) * 0.9;
      const t = smooth((S.decisionsAdd - 0.6) / 0.3); V3.supTab.visible = t > 0.001; V3.supTab.scale.y = Math.max(1e-3, t); }
    { const f = smooth(S.reviewIn); review.visible = f > 0.001; review.scale.set(1, Math.max(1e-3, f), 1);
      V3.marks.forEach((m, k) => { const g = smooth(clamp01((+S.marks || 0) - k)); m.visible = g > 0.001; m.scale.set(Math.max(1e-3, g), Math.max(1e-3, g), 1); }); }
    { const rf = clamp01(S.riserFlow); feed.visible = rf > 0.001;
      if (feed.visible) { const k = off.map((v) => v.toFixed(4)).join(','); if (k !== feedKey) { buildFeed(off); feedKey = k; }
        for (const { b, p, k: j } of V3.feed.beads) { const L = p.getLength(), u = clamp01(rf * 1.35 - j * 0.12), s = u * (L - 0.2 - j * 0.4);
          b.visible = u > 0.01; if (b.visible) { const uu = clamp01(s / L); p.getPointAt(uu, b.position); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.getTangentAt(uu)); } } } }
    { const on = S.build != null; build.visible = on; inspect.visible = on; const b = on ? clamp01(S.build) : 0;
      V3.drawLine.scale.x = Math.max(1e-3, smooth(b / 0.25));
      const sp = clamp01((b - 0.25) / 0.25), press = sp < 0.5 ? smooth(sp * 2) : 1 - smooth((sp - 0.5) * 2);
      V3.stamp.block.position.y = 0.35 * (1 - press); V3.stamp.imprint.visible = sp >= 0.5;
      const hp = clamp01((b - 0.5) / 0.3), slew = smooth(hp / 0.5), low = smooth((hp - 0.5) / 0.5), H = V3.hoist;
      H.boom.rotation.y = (1 - slew) * 1.5;
      const drop = lerp(0.9, 5.35 - (PF + 0.86), low); H.rope.scale.y = drop; H.piece.position.set(2.2, -drop, 0);
      V3.tag.rotation.y = smooth((b - 0.8) / 0.2) * Math.PI; }
    { const on = S.mapPrint != null; lobby.visible = on; const p = on ? clamp01(S.mapPrint) : 0, L = V3.lobby;
      L.cover.scale.y = Math.max(1e-3, 1 - p); L.cover.position.y = L.YT - 0.01 - p * (L.BH - 0.02); L.cover.visible = p < 0.999;
      L.head.position.y = L.YT - p * L.BH; }
    { const on = S.retire != null; retired.visible = on; const r = on ? clamp01(S.retire) : 0, R = V3.retire;
      const d = smooth(r / 0.3); R.crate.material = d > 0.001 ? R.dim : R.crate.userData.mat0; R.dim.color.copy(M.crate.color).lerp(new THREE.Color(tokens['mat-concrete-2']), 0.8 * d);
      const t = smooth((r - 0.25) / 0.25); R.tag.visible = t > 0.001; R.tag.scale.set(1, Math.max(1e-3, t), 1); R.tag.rotation.x = (1 - t) * 0.6;
      const m = smooth((r - 0.5) / 0.5); R.crate.position.copy(R.crate.userData.home).lerp(R.shelf, m); R.crate.position.y += Math.sin(Math.PI * m) * 1.1; }
    { const f = clamp01(S.frameSwap), W = V3.swap; W.col.visible = f <= 0.001; W.gcol.visible = f > 0.001 && f < 0.999;
      W.ghostSteel.opacity = lerp(1, 0.3, smooth(f / 0.5)); const n = smooth((f - 0.5) / 0.5); W.ncol.visible = f > 0.5; W.ncol.position.y = W.h / 2 + (1 - n) * 2.6; }
  }
  function update(p = {}) {
    Object.assign(state, p);
    const cut = smooth(state.cut);
    const off = levels.map((_, i) => i * 1.9 * smooth(state.explode));
    levels.forEach((lv, i) => { lv.group.position.y = off[i]; });
    for (const w of cutWalls) { const hh = Math.max(0.0001, lerp(w.full, w.to, cut)); w.mesh.scale.y = hh; w.mesh.position.y = w.y0 + hh / 2; w.mesh.visible = hh > 0.002;
      w.plane.constant = w.lv.position.y + w.y0 + hh + 0.001; w.wins.visible = hh > w.winB + 0.04; w.hh = hh; }
    entrance.visible = cutWalls[0].hh > 0.6;
    for (const s of cutStubs) {
      if (s.beam) { s.obj.visible = cut < 0.5; continue; }
      if (s.beamClip) { s.obj.visible = cut >= 0.5; continue; }
      const hh = Math.max(0.0001, lerp(s.full, s.to, cut)); s.col.scale.y = hh / s.full; s.col.position.y = hh / 2; s.cap.position.y = hh; s.cap.visible = cut > 0.02 && hh > 0.01; s.obj.visible = hh > 0.002;
    }
    for (const s of cutSlabs) {
      const k = 1 - cut; const m = s.mesh; m.visible = k > 0.002;
      if (s.zOnly) { const z1 = lerp(s.z0, s.z1, k); m.scale.set(1, 1, Math.max(1e-4, (z1 - s.z0) / (s.z1 - s.z0))); m.position.z = (s.z0 + z1) / 2; }
      else { const x0 = lerp(s.x1, s.x0, k), z1 = lerp(s.z0, s.z1, k);
        m.scale.set(Math.max(1e-4, (s.x1 - x0) / (s.x1 - s.x0)), 1, Math.max(1e-4, (z1 - s.z0) / (s.z1 - s.z0))); m.position.x = (x0 + s.x1) / 2; m.position.z = (s.z0 + z1) / 2; }
    }
    const NARR = { rules: 0, skills: 1, agents: 2, enforcement: 3, tools: 4 }, OVR = { rules: 'coreRules', skills: 'coreSkills', agents: 'coreAgents', enforcement: 'coreGate', tools: 'coreTools' };
    ['rules', 'tools', 'skills', 'agents', 'enforcement'].forEach((k, j) => {
      let e = state.coreExplodeOrder === 'narration' ? smooth(state.coreExplode * 5 - NARR[k]) : smooth(state.coreExplode * 1.6 - j * 0.15);
      if (state[OVR[k]] != null) e = smooth(state[OVR[k]]);
      core[k].position.copy(core[k].userData.home).add(new THREE.Vector3(0, e * 0.25, e * (2.4 + j * 0.2)));
    });
    const lp = clamp01(state.loop), lb = state.loopBranch;
    const dr = { topic: state.loopTopic ?? (lb != null ? clamp01(lb * 3) : lp), pool: state.loopPool ?? (lb != null ? clamp01(lb * 3 - 1) : lp), core: state.loopCore ?? (lb != null ? clamp01(lb * 3 - 2) : lp) };
    const open = smooth(state.approve);
    const key = off.map((v) => v.toFixed(4)).join(',') + '|' + [dr.topic, dr.pool, dr.core].map((v) => clamp01(v).toFixed(4)).join(',') + '|' + open.toFixed(4);
    if (key !== loopKey) { buildLoop(off, dr, open); loopKey = key; }
    const phase = state.time != null ? frac(state.time / FLOW_PERIOD) : frac(state.flow);
    const moving = state.time != null || state.flow > 0;
    wheel.rotation.y = open * Math.PI * 0.75;
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const run of loop.userData.runs) {
      const n = run.pulses.length;
      run.pulses.forEach((b, k) => {
        const u = frac(phase + k / n); let s = u * run.L, show = moving;
        if (run.gate && open < 0.5) {
          s = run.gate - 0.42 - k * 0.27; show = run.drawn > 0.05 && k < 3;
        } else if (run.gate) s = Math.min(s, run.accEnd ?? run.L);
        b.visible = show && run.drawn > 0.05 && s > 0.05 && s <= run.L * run.drawn;
        if (b.visible) { const uu = s / run.L; run.path.getPointAt(uu, b.position); b.quaternion.setFromUnitVectors(yAxis, run.path.getTangentAt(uu)); }
      });
    }
    for (const h of hoppers) { const f = frac(phase * 3 + h.i / 3); const s = h.sheet;
      s.visible = (state.time != null || state.flow > 0) && f < 0.7; s.position.y = h.y + 1.9 - smooth(f / 0.7) * 0.75; s.rotation.set(0.3 * Math.sin(f * 6), f * 2.4, 0.2); }
    updateV3(off);
    const ids = state.focus == null ? null : [].concat(state.focus);
    const fk = (ids ? ids.join(',') : '') + '|' + (+state.focusAmount).toFixed(3) + '|' + (+state.focusHide || 0).toFixed(3) + '|' + loopKey + '|' + cableKey + '|' + feedKey;
    if (fk !== focusKey) { applyFocus(ids, ids ? state.focusAmount : 0, +state.focusHide || 0); focusKey = fk; }
    return state;
  }
  update(init);

  const anchorOf = (id) => {
    if (dyn[id]) return dyn[id]();
    const a = anchors[id]; if (!a) return null; const v = a.clone();
    if (/^(floor\.|ws\.)/.test(id)) { const n = id.startsWith('floor.') ? +id.slice(6) : DIM.FLOORS; v.y += levels[n].group.position.y; }
    if (id === 'frame') v.y += levels[1].group.position.y;
    if (id === 'riser' || id === 'loop.topic') v.y += levels[2].group.position.y;
    if (id === 'loop.split' || id === 'loop.topic.3') v.y += levels[3].group.position.y;
    if (id.startsWith('core.')) { const k = id.slice(5); v.add(core[k].position.clone().sub(core[k].userData.home)); }
    return v;
  };
  const focus = (ids, amount = 1) => update({ focus: ids, focusAmount: amount });
  const PART_OF = { 'loop.split': 'loop', 'loop.split2': 'loop.core', 'loop.topic.3': 'loop.topic', 'pool.bin': 'pool', 'core.sockets.hint': 'core.sockets',
    'core.enforcement.card': 'core.enforcement', 'core.enforcement.arm': 'core.enforcement', 'core.rules.line': 'core.rules', 'ws.decisions.add': 'ws.decisions',
    'ws.review.marks': 'ws.review', 'lobby.map.machine': 'lobby.map', 'pool.candidate': 'pool', 'frame.swap': 'frame', 'docs.stack': 'docs.stack' };
  const partOf = (id) => { if (PART_OF[id]) return PART_OF[id]; let k = id; while (k && !(members[k] || parts[k])) k = k.includes('.') ? k.slice(0, k.lastIndexOf('.')) : null; return k || id; };
  const ray = new THREE.Raycaster(); let owners = null, ownersKey = '';
  const ownerIndex = () => { const k = loopKey + '|' + cableKey + '|' + feedKey; if (owners && k === ownersKey) return owners; owners = new Map(); ownersKey = k;
    const ids = new Set([...Object.keys(parts), ...Object.keys(members)]);
    for (const id of ids) for (const ob of (members[id] || [parts[id]])) ob?.traverse((o) => { if (!owners.has(o)) owners.set(o, new Set()); owners.get(o).add(id); });
    return owners; };
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const pick = (nx, ny, camera) => {
    root.updateMatrixWorld(true); ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    for (const h of ray.intersectObject(root, true)) {
      const o = h.object; if (!o.isMesh || !shown(o)) continue;
      const mat = Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material;
      if (!mat || mat.visible === false || (mat.transparent && (mat.opacity ?? 1) < 0.35)) continue;
      if (mat.clippingPlanes && mat.clippingPlanes.some((pl) => pl.distanceToPoint(h.point) < 0)) continue;
      const idx = ownerIndex(); const out = new Set(); for (let p = o; p; p = p.parent) for (const id of (idx.get(p) || [])) out.add(id);
      return { object: o, point: h.point, ids: [...out] };
    }
    return null;
  };
  return { root, parts, members, anchors, anchorOf, update, focus, levels, materials: M, state, pick, partOf,
    routeAt: V3.routeAt.map((s) => s / V3.routeLen), anchorIds: () => [...new Set([...Object.keys(anchors), ...Object.keys(dyn)])] };
}

export const CAMERAS = {
  hero:      { az: 40, el: 22, dist: 60, fov: 24, target: [1.6, 6.0, 1.8], shiftX: 0.215, shiftY: 0.03 },
  heroTall:  { az: 38, el: 23, dist: 79, fov: 26, target: [1.6, 6.4, 1.8], shiftX: -0.04, shiftY: -0.075 },
  heroThumb: { az: 40, el: 22, dist: 55, fov: 24, target: [1.4, 5.6, 1.8], shiftX: 0.235, shiftY: 0.0 },
  heroClose: { az: 40, el: 22, dist: 52, fov: 24, target: [1.6, 6.0, 1.8], shiftX: 0.19, shiftY: 0.0 },
  core:      { az: 36, el: 24, dist: 30, fov: 24, target: [-1.4, 1.6, 0.8], shiftX: 0.1, shiftY: 0 },
  workspace: { az: 36, el: 26, dist: 30, fov: 24, target: [1.2, 11.2, -0.4], shiftX: 0.1, shiftY: 0 },
  floor1:    { az: 36, el: 26, dist: 30, fov: 24, target: [1.2, 5.0, -0.4], shiftX: 0.1, shiftY: 0 },
  floor2:    { az: 36, el: 26, dist: 30, fov: 24, target: [1.2, 8.2, -0.4], shiftX: 0.1, shiftY: 0 },
  floor3:    { az: 36, el: 26, dist: 30, fov: 24, target: [1.2, 11.2, -0.4], shiftX: 0.1, shiftY: 0 },
  loop:      { az: 24, el: 18, dist: 52, fov: 24, target: [4.0, 5.0, 3.8], shiftX: 0.05, shiftY: 0 },
  pool:      { az: 28, el: 26, dist: 30, fov: 24, target: [4.6, 1.2, 6.2], shiftX: 0.08, shiftY: 0 },
  stack:     { az: 40, el: 18, dist: 34, fov: 24, target: [-7.5, 2.0, 4.5], shiftX: 0, shiftY: 0 },
  route:     { az: 34, el: 24, dist: 54, fov: 24, target: [-0.8, 5.6, 2.6], shiftX: 0.1, shiftY: 0 },
  sockets:   { az: 52, el: 28, dist: 20, fov: 24, target: [-1.2, 1.0, 1.6], shiftX: 0.05, shiftY: 0 },
  rules:     { az: 18, el: 12, dist: 15, fov: 24, target: [-4.25, 2.2, -0.9], shiftX: 0.1, shiftY: 0 },
  gate:      { az: 30, el: 14, dist: 15, fov: 24, target: [-2.5, 2.0, 3.0], shiftX: 0.1, shiftY: 0 },
  lobby:     { az: 32, el: 16, dist: 15, fov: 24, target: [-4.3, 1.4, 3.0], shiftX: 0.1, shiftY: 0 },
  build:     { az: 40, el: 22, dist: 27, fov: 24, target: [-4.9, 2.0, 1.2], shiftX: 0.05, shiftY: 0 },
  review:    { az: 34, el: 22, dist: 16, fov: 24, target: [2.4, 11.75, 1.3], shiftX: 0.08, shiftY: 0 },
  decisions: { az: 30, el: 22, dist: 16, fov: 24, target: [-2.6, 11.6, -3.2], shiftX: 0.08, shiftY: 0 },
  feed:      { az: 30, el: 22, dist: 44, fov: 24, target: [3.8, 4.4, 2.6], shiftX: 0.06, shiftY: 0 },
  retired:   { az: 30, el: 26, dist: 18, fov: 24, target: [5.8, 0.9, 6.4], shiftX: 0.05, shiftY: 0 },
};
export function lerpCamera(a, b, u) {
  const L = (k, d = 0) => lerp(a[k] ?? d, b[k] ?? d, u);
  return { az: L('az'), el: L('el'), dist: L('dist'), fov: L('fov', 24), target: a.target.map((v, i) => lerp(v, b.target[i], u)), shiftX: L('shiftX'), shiftY: L('shiftY') };
}

export function createStudio({ canvas, width = 1920, height = 1080, quality = 'high', tokens = readTokens(), pixelRatio = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const bg = new THREE.Color(tokens['bg-paper']);
  scene.background = new THREE.Color(bg.r + 0.04, bg.g + 0.04, bg.b + 0.04);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.24;

  const key = new THREE.DirectionalLight(tokens['light-key'], 3.6);
  key.position.set(-20, 26, 6); key.target.position.set(2, 3, -1);
  key.castShadow = true; key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -14, near: 1, far: 80 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(tokens['light-fill'], 0.5);
  const hemi = new THREE.HemisphereLight('#F4F1EA', '#8F887C', 0.14);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.ShadowMaterial({ color: '#2A2620', opacity: 0.26 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const contactTex = (inner, mid) => canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    gr.addColorStop(0, `rgba(30,26,22,${inner})`); gr.addColorStop(0.5, `rgba(30,26,22,${mid})`); gr.addColorStop(1, 'rgba(30,26,22,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(24, 17), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: contactTex(0.34, 0.14) }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(0.6, 0.005, 1.0); scene.add(contact);
  const contact2 = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.5), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: contactTex(0.3, 0.12) }));
  contact2.rotation.x = -Math.PI / 2; contact2.position.set(5.7, 0.006, 7.2); scene.add(contact2);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(52, 40), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: contactTex(0.11, 0.06) }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(1.6, 0.002, 2.0); scene.add(pool);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    map: canvasTex(1024, 1024, (g, w, h) => { const step = w / 32; g.strokeStyle = 'rgba(27,31,36,0.15)'; g.lineWidth = 1.5;
      for (let k = 0; k <= 32; k++) { g.beginPath(); g.moveTo(k * step, 0); g.lineTo(k * step, h); g.stroke(); g.beginPath(); g.moveTo(0, k * step); g.lineTo(w, k * step); g.stroke(); }
      g.globalCompositeOperation = 'destination-in'; const gr = g.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w * 0.5);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
  grid.rotation.x = -Math.PI / 2; grid.position.set(2.2, 0.003, 0); scene.add(grid);

  const camera = new THREE.PerspectiveCamera(24, width / height, 1, 400);
  let gtao = null, bloom = null;
  const rt = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio); composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'high') {
    { const mr = Math.random; Math.random = rng(7331); try { gtao = new GTAOPass(scene, camera, width, height); } finally { Math.random = mr; } }
    gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 1.0;
    gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.0, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
    bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.16, 0.25, 1.25);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());

  let W0 = width, H0 = height, lastMs = 0;
  function setCamera(c) {
    const az = THREE.MathUtils.degToRad(c.az), el = THREE.MathUtils.degToRad(c.el);
    const t = new THREE.Vector3(...c.target);
    camera.fov = c.fov; camera.aspect = W0 / H0;
    camera.position.set(t.x - Math.sin(az) * Math.cos(el) * c.dist, t.y + Math.sin(el) * c.dist, t.z + Math.cos(az) * Math.cos(el) * c.dist);
    camera.lookAt(t);
    camera.setViewOffset(W0, H0, -(c.shiftX || 0) * W0, (c.shiftY || 0) * H0, W0, H0);
    camera.updateProjectionMatrix();
  }
  function render() { const a = performance.now(); composer.render(); renderer.getContext().finish?.(); lastMs = performance.now() - a; }
  function project(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W0, y: (1 - p.y) / 2 * H0, visible: p.z < 1 }; }
  function setSize(w, h) { W0 = w; H0 = h; renderer.setSize(w, h, false); composer.setSize(w, h); gtao?.setSize(w, h); bloom?.setSize(w, h); }
  return { renderer, scene, camera, composer, tokens, render, setCamera, project, setSize, renderMs: () => lastMs, lights: { key, fill, hemi }, ground };
}

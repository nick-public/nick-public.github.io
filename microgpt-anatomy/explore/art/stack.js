export const LAYERS = ['service', 'loop', 'python', 'integer', 'spec', 'rtl', 'cells'];

export function tokens() {
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const num = (n) => Number(tok(n));
  return { tok, num };
}

export function fontsFor(LANG) {
  return {
    body: LANG === 'ko' ? '"IBM Plex Sans KR", "IBM Plex Sans"' : '"IBM Plex Sans"',
    mono: LANG === 'ko' ? '"IBM Plex Mono", "IBM Plex Sans KR"' : '"IBM Plex Mono"',
  };
}

export async function loadFonts(LANG, S, extraText = '') {
  const FONT = fontsFor(LANG);
  const koText = LANG === 'ko' ? JSON.stringify(S) + extraText : '';
  await Promise.all([
    document.fonts.load(`400 26px ${FONT.mono}`), document.fonts.load(`500 26px ${FONT.mono}`), document.fonts.load(`600 26px ${FONT.mono}`),
    document.fonts.load('400 26px "IBM Plex Sans"'), document.fonts.load('500 26px "IBM Plex Sans"'), document.fonts.load('600 26px "IBM Plex Sans"'),
    ...(LANG === 'ko' ? [document.fonts.load('400 26px "IBM Plex Sans KR"', koText), document.fonts.load('600 26px "IBM Plex Sans KR"', koText), document.fonts.load('700 26px "IBM Plex Sans KR"', koText)] : []),
  ]);
}

export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function hex2rgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
function rgba(rgb, a) { return rgb.replace('rgb', 'rgba').replace(')', `,${a})`); }

export function squarify(items, x, y, w, h) {
  const out = []; let rest = items.slice();
  const worst = (row, short, total, area) => { const s = row.reduce((a, i) => a + i.v, 0) * area / total; let mx = 0; for (const i of row) { const r = i.v * area / total; mx = Math.max(mx, short * short * r / (s * s), s * s / (short * short * r)); } return mx; };
  while (rest.length) {
    const total = rest.reduce((s, i) => s + i.v, 0), short = Math.min(w, h); let row = [rest[0]], best = worst(row, short, total, w * h), k = 1;
    while (k < rest.length) { const r2 = row.concat(rest[k]); const w2 = worst(r2, short, total, w * h); if (w2 > best) break; row = r2; best = w2; k++; }
    const rs = row.reduce((s, i) => s + i.v, 0), f = rs / total;
    if (w >= h) { const rw = w * f; let yy = y; for (const it of row) { const hh = h * it.v / rs; out.push({ ...it, x, y: yy, w: rw, h: hh }); yy += hh; } x += rw; w -= rw; }
    else { const rh = h * f; let xx = x; for (const it of row) { const ww = w * it.v / rs; out.push({ ...it, x: xx, y, w: ww, h: rh }); xx += ww; } y += rh; h -= rh; }
    rest = rest.slice(row.length);
  }
  return out;
}

export function createStack(THREE, opts) {
  const { DATA, S, LANG } = opts;
  const { tok, num } = tokens();
  const FONT = fontsFor(LANG);
  const CURRENT = opts.current === undefined ? 'integer' : opts.current;
  const COL = Object.fromEntries(LAYERS.map((k) => [k, tok('--layer-' + k)]));
  const C = {
    paper: tok('--bg-paper'), face: tok('--plate-face'), ink: tok('--ink'), ink2: tok('--ink-2'), ink3: tok('--ink-3'),
    thread: tok('--thread'), threadInk: tok('--thread-ink'), human: tok('--human'), agent: tok('--agent'),
    neg: tok('--data-neg'), pos: tok('--data-pos'), zero: tok('--data-zero'),
  };

  const PW = num('--plate-w'), PD = num('--plate-d'), PT = num('--plate-t'), GAP = num('--plate-gap');
  const TPX = 100, TW = PW * TPX, TH = PD * TPX;
  const PIERCE = { x: PW * 0.25, z: 0.9 };
  const pierceTex = { x: (PW / 2 + PIERCE.x) * TPX, y: (PD / 2 + PIERCE.z) * TPX };
  const CONTENT = { x0: 70, x1: pierceTex.x - 90, y0: 115, y1: TH - 52 };
  const SLOT = DATA.thread;
  const slotState = Object.fromEntries(LAYERS.map((k) => [k, (opts.slots && opts.slots[k]) || 'on']));
  const res = opts.res || {};

  function caption(g, layer, text) {
    g.fillStyle = COL[layer]; g.font = `600 34px ${FONT.mono}`; g.textBaseline = 'alphabetic';
    g.fillText(text, CONTENT.x0, TH - 14);
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  function drawSlot(g, layer) {
    const st = slotState[layer];
    if (st === 'off') return;
    const { x, y } = pierceTex;
    g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
    if (st === 'hole') return;
    g.strokeStyle = C.thread; g.lineWidth = 6; g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.stroke();
    g.font = `600 34px ${FONT.mono}`; const label = SLOT[layer]; const w = g.measureText(label).width + 44;
    const bx = x + 46, by = y - 30;
    g.fillStyle = '#FFFFFF'; rrect(g, bx, by, w, 60, 6); g.fill();
    g.strokeStyle = C.thread; g.lineWidth = layer === CURRENT ? 5 : 3; rrect(g, bx, by, w, 60, 6); g.stroke();
    g.fillStyle = C.threadInk; g.textBaseline = 'middle'; g.fillText(label, bx + 22, by + 31); g.textBaseline = 'alphabetic';
  }

  let serviceState = opts.serviceState || null;
  function chatGeometry() {
    const x0 = CONTENT.x0, y0 = CONTENT.y0 + 60, w = CONTENT.x1 - x0, h = CONTENT.y1 - y0;
    return { x0, y0, w, h };
  }
  function drawChatVideo(g) {
    const st = serviceState; const { x0, y0, w, h } = chatGeometry();
    g.fillStyle = '#FFFFFF'; rrect(g, x0, y0, w, h, 10); g.fill();
    g.strokeStyle = C.ink3; g.lineWidth = 2; rrect(g, x0, y0, w, h, 10); g.stroke();
    g.font = `400 40px ${FONT.body}`; const ut = st.user; const uw = g.measureText(ut).width + 56;
    g.fillStyle = mix(C.face, COL.service, 0.18); rrect(g, x0 + w - uw - 36, y0 + 30, uw, 74, 37); g.fill();
    g.fillStyle = C.ink; g.fillText(ut, x0 + w - uw - 8, y0 + 80);
    const letters = []; st.names.forEach((nm, i) => { if (i) letters.push(' '); for (const ch of nm) letters.push(ch); });
    const fs = st.fontPx || 64; g.font = `500 ${fs}px ${FONT.mono}`; const cw = g.measureText('m').width; const by = y0 + 110 + fs * 1.25; let cx = x0 + 40;
    const n = Math.min(st.reveal, letters.length); let hl = null;
    for (let i = 0; i < n; i++) {
      const ch = letters[i];
      if (ch !== ' ') {
        const isHl = st.freeze && i === n - 1;
        if (isHl) hl = { x: cx, y: by };
        else {
          g.fillStyle = C.ink; g.fillText(ch, cx, by);
          g.fillStyle = mix('#FFFFFF', C.ink3, 0.55); g.fillRect(cx + 3, by + fs * 0.22, cw - 6, 3);
        }
      }
      cx += cw;
    }
    if (!st.freeze && n < letters.length) { if ((st.caretOn ?? true)) { g.fillStyle = C.ink; g.fillRect(cx + 2, by - fs * 0.84, 5, fs * 1.03); } }
    if (st.dim > 0) { g.fillStyle = rgba(mix('#FFFFFF', C.face, 0.2), 0.62 * st.dim); g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4); }
    if (hl) {
      const p = st.pulse || 0; const grow = 6 * Math.sin(Math.PI * p);
      const bh = fs * 1.19, bt = by - fs * 0.9;
      g.fillStyle = mix('#FFFFFF', C.thread, 0.16); g.fillRect(hl.x - 6 - grow, bt - grow, cw + 12 + 2 * grow, bh + 2 * grow);
      g.strokeStyle = C.thread; g.lineWidth = 4; g.strokeRect(hl.x - 6 - grow, bt - grow, cw + 12 + 2 * grow, bh + 2 * grow);
      g.fillStyle = C.threadInk; g.fillText(letters[n - 1], hl.x, by);
      g.fillStyle = C.ink; g.fillRect(hl.x + cw + 10, by - fs * 0.84, 5, fs * 1.03);
      if (st.leader > 0) {
        const pts = [[hl.x + cw + 30, by - fs * 0.33], [pierceTex.x - 26, pierceTex.y]];
        const segs = []; let L = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); L += d; }
        let left = L * Math.min(1, st.leader);
        g.strokeStyle = C.thread; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(...pts[0]);
        for (let i = 1; i < pts.length && left > 0; i++) { const f = Math.min(1, left / segs[i - 1]); g.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); left -= segs[i - 1]; }
        g.stroke(); g.lineCap = 'butt';
      }
    }
  }

  const DRAW = {
    service(g) {
      caption(g, 'service', S.plate.service_cap);
      if (serviceState) { drawChatVideo(g); return; }
      const { x0, y0, w, h } = chatGeometry();
      g.fillStyle = '#FFFFFF'; rrect(g, x0, y0, w, h, 10); g.fill();
      g.strokeStyle = C.ink3; g.lineWidth = 2; rrect(g, x0, y0, w, h, 10); g.stroke();
      g.font = `400 40px ${FONT.body}`; const ut = S.plate.service_user; const uw = g.measureText(ut).width + 56;
      g.fillStyle = mix(C.face, COL.service, 0.18); rrect(g, x0 + w - uw - 36, y0 + 30, uw, 74, 37); g.fill();
      g.fillStyle = C.ink; g.fillText(ut, x0 + w - uw - 8, y0 + 80);
      const name = S.plate.service_bot; const shown = name.slice(0, 4), tokn = name[4], rest = name.slice(5);
      g.font = `500 64px ${FONT.mono}`; let cx = x0 + 40; const by = y0 + 210;
      g.fillStyle = C.ink; g.fillText(shown, cx, by); cx += g.measureText(shown).width;
      const tw = g.measureText(tokn).width;
      g.fillStyle = mix('#FFFFFF', C.thread, 0.16); g.fillRect(cx - 4, by - 56, tw + 8, 72);
      g.fillStyle = C.threadInk; g.fillText(tokn, cx, by); cx += tw + 6;
      g.fillStyle = C.ink; g.fillRect(cx + 2, by - 54, 5, 66);
      g.fillStyle = mix('#FFFFFF', C.ink3, 0.35); g.fillText(rest, cx + 16, by);
    },
    loop(g) {
      caption(g, 'loop', S.plate.loop_cap);
      const seq = ['BOS', 'k', 'a', 'r', 'i', 'l', 'e', 'n', 'BOS'];
      const x0 = CONTENT.x0, y0 = CONTENT.y0 + 70; let x = x0;
      g.font = `500 34px ${FONT.mono}`; g.textBaseline = 'middle';
      seq.forEach((s, i) => {
        const w = s.length > 1 ? 104 : 64; const on = i === 5, done = i < 5;
        g.fillStyle = on ? mix('#FFFFFF', C.thread, 0.16) : (done ? '#FFFFFF' : mix(C.face, COL.loop, 0.05));
        g.fillRect(x, y0, w, 64);
        g.strokeStyle = on ? C.thread : (done ? COL.loop : mix('#FFFFFF', C.ink3, 0.5)); g.lineWidth = on ? 5 : 2;
        if (!done && !on) g.setLineDash([8, 6]); g.strokeRect(x, y0, w, 64); g.setLineDash([]);
        g.fillStyle = on ? C.threadInk : (done ? C.ink : C.ink3); g.fillText(s, x + w / 2 - g.measureText(s).width / 2, y0 + 33);
        g.font = `400 24px ${FONT.mono}`; g.fillStyle = C.ink3; g.fillText(String(i), x + w / 2 - 7, y0 + 90); g.font = `500 34px ${FONT.mono}`;
        x += w + 14;
      });
      const ty = y0 + 190, steps = S.plate.loop_steps; const tx0 = x0, tx1 = CONTENT.x1 - 40;
      g.strokeStyle = COL.loop; g.lineWidth = 6; g.beginPath();
      g.moveTo(tx0 + 40, ty); g.lineTo(tx1 - 40, ty); g.arc(tx1 - 40, ty + 40, 40, -Math.PI / 2, Math.PI / 2); g.lineTo(tx0 + 40, ty + 80); g.arc(tx0 + 40, ty + 40, 40, Math.PI / 2, Math.PI * 1.5); g.stroke();
      const seg = (tx1 - tx0 - 80) / steps.length;
      g.font = `500 32px ${FONT.body}`;
      steps.forEach((s, i) => {
        const sx = tx0 + 40 + seg * i + seg * 0.12;
        g.fillStyle = mix(C.face, COL.loop, 0.07); const w = g.measureText(s).width + 28; g.fillRect(sx - 6, ty - 22, w, 44);
        g.fillStyle = C.ink; g.fillText(s, sx + 8, ty + 1);
        const cx = tx0 + 40 + seg * (i + 1) - 18; g.strokeStyle = COL.loop; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 8, ty - 12); g.lineTo(cx + 4, ty); g.lineTo(cx - 8, ty + 12); g.stroke();
      });
      g.font = `500 28px ${FONT.mono}`; g.fillStyle = COL.loop; g.fillText(`${S.plate.loop_kv}: k, v × 5`, tx0 + 70, ty + 42);
      g.textBaseline = 'alphabetic';
    },
    python(g) {
      caption(g, 'python', S.plate.python_cap);
      const kw = /\b(for|in|if|range|def|return|break)\b/g;
      let y = CONTENT.y0 + 92; g.textBaseline = 'alphabetic';
      for (const ln of DATA.code.lines) {
        const hot = ln.n === 194;
        if (hot) { g.fillStyle = mix('#FFFFFF', C.thread, 0.12); g.fillRect(CONTENT.x0 - 10, y - 38, CONTENT.x1 - CONTENT.x0 + 20, 52); }
        g.font = `400 34px ${FONT.mono}`; g.fillStyle = C.ink3; g.fillText(String(ln.n), CONTENT.x0, y);
        let text = ln.text; const maxCh = Math.floor((CONTENT.x1 - CONTENT.x0 - 96) / 20.4);
        if (text.length > maxCh) text = text.slice(0, maxCh - 1) + '…';
        let x = CONTENT.x0 + 96; let last = 0; let m; kw.lastIndex = 0;
        const put = (s, c, w8) => { g.font = `${w8} 34px ${FONT.mono}`; g.fillStyle = c; g.fillText(s, x, y); x += g.measureText(s).width; };
        while ((m = kw.exec(text))) { put(text.slice(last, m.index), C.ink, 400); put(m[0], COL.python, 600); last = m.index + m[0].length; }
        put(text.slice(last), C.ink, 400);
        y += 54;
      }
    },
    integer(g) {
      const M = DATA.int8; caption(g, 'integer', `${M.name} · ${S.plate.integer_cap} · ${M.rows}×${M.cols}`);
      const x0 = CONTENT.x0, y0 = CONTENT.y0 + 52, w = CONTENT.x1 - x0 - 150, h = CONTENT.y1 - y0;
      const cw = w / M.cols, ch = h / M.rows;
      for (let r = 0; r < M.rows; r++) for (let c = 0; c < M.cols; c++) {
        const v = M.values[r][c] / 127; g.fillStyle = v >= 0 ? mix(C.zero, C.pos, Math.min(1, v)) : mix(C.zero, C.neg, Math.min(1, -v));
        g.fillRect(x0 + c * cw, y0 + r * ch, Math.ceil(cw) - 1, Math.ceil(ch) - 1);
      }
      g.strokeStyle = C.ink3; g.lineWidth = 2; g.strokeRect(x0 - 1, y0 - 1, w + 2, h + 2);
      const lx = x0 + w + 30, ly0 = y0, lh = h; for (let i = 0; i < lh; i++) { const v = 1 - 2 * i / lh; g.fillStyle = v >= 0 ? mix(C.zero, C.pos, v) : mix(C.zero, C.neg, -v); g.fillRect(lx, ly0 + i, 26, 1); }
      g.font = `500 26px ${FONT.mono}`; g.fillStyle = C.ink2; g.fillText('+127', lx + 36, ly0 + 22); g.fillText('0', lx + 36, ly0 + lh / 2 + 9); g.fillText('-127', lx + 36, ly0 + lh - 4);
    },
    spec(g) {
      caption(g, 'spec', `${DATA.spec.version} · ${S.plate.spec_cap}`);
      let y = CONTENT.y0 + 52; const rh = 48;
      for (const id of DATA.spec.rows) {
        g.strokeStyle = mix(C.face, COL.spec, 0.35); g.lineWidth = 2; g.beginPath(); g.moveTo(CONTENT.x0, y + rh); g.lineTo(CONTENT.x1, y + rh); g.stroke();
        g.textBaseline = 'middle';
        g.font = `600 30px ${FONT.mono}`; g.fillStyle = COL.spec; g.fillText(id, CONTENT.x0 + 4, y + rh / 2);
        g.font = `400 32px ${FONT.body}`; g.fillStyle = C.ink; g.fillText(S.plate.spec_rows[id], CONTENT.x0 + 110, y + rh / 2);
        g.font = `500 24px ${FONT.body}`; const t = S.tags.agent_assumption; const tw = g.measureText(t).width + 26;
        const tx = CONTENT.x1 - tw; g.setLineDash([7, 5]); g.strokeStyle = C.agent; g.lineWidth = 2; g.strokeRect(tx, y + 7, tw, rh - 14); g.setLineDash([]);
        g.fillStyle = C.agent; g.fillText(t, tx + 13, y + rh / 2 + 1);
        g.textBaseline = 'alphabetic'; y += rh;
      }
    },
    rtl(g) {
      caption(g, 'rtl', `${DATA.rtl.release} · ${S.plate.rtl_cap} · ${DATA.rtl.total.toLocaleString('en-US')}`);
      const L = DATA.rtl.lines;
      const box = (x, y, w, h, name, depth) => {
        g.fillStyle = mix(C.face, COL.rtl, 0.05 + depth * 0.06); g.fillRect(x, y, w, h);
        g.strokeStyle = COL.rtl; g.lineWidth = depth === 0 ? 3 : 2; g.strokeRect(x, y, w, h);
        g.font = `600 26px ${FONT.mono}`; g.fillStyle = C.ink; g.textBaseline = 'top'; g.fillText(name, x + 12, y + 10);
        g.font = `400 24px ${FONT.mono}`; g.fillStyle = C.ink3; g.fillText(String(L[name] ?? ''), x + 16 + g.measureText(name).width * 26 / 24, y + 12);
        g.textBaseline = 'alphabetic';
      };
      const x0 = CONTENT.x0, y0 = CONTENT.y0 + 50, x1 = CONTENT.x1, y1 = CONTENT.y1;
      box(x0, y0, x1 - x0, y1 - y0, 'mg_soc_top', 0);
      box(x0 + 24, y0 + 50, x1 - x0 - 48, y1 - y0 - 66, 'mg_top', 1);
      const sx0 = x0 + 48, sy0 = y0 + 100, sw = (x1 - x0) - 96 - 250, sh = y1 - y0 - 130;
      box(sx0, sy0, sw, sh, 'mg_seq', 2);
      const kids = [['mg_mac16'], ['mg_rmsnorm', 'mg_rsqrt_rom'], ['mg_softmax', 'mg_exp2_rom'], ['mg_sample', 'mg_exp2_rom'], ['mg_rq']];
      const kw = (sw - 24 - 12 * (kids.length - 1)) / kids.length;
      kids.forEach(([k, rom], i) => {
        const kx = sx0 + 12 + i * (kw + 12), ky = sy0 + 50, kh = sh - 62;
        box(kx, ky, kw, kh, k, 3);
        if (rom) { g.setLineDash([]); g.fillStyle = '#FFFFFF'; g.fillRect(kx + 12, ky + kh - 52, kw - 24, 40); g.strokeStyle = COL.rtl; g.lineWidth = 1.5; g.strokeRect(kx + 12, ky + kh - 52, kw - 24, 40);
          g.font = `400 22px ${FONT.mono}`; g.fillStyle = C.ink2; g.textBaseline = 'middle'; g.fillText(rom.replace('mg_', ''), kx + 22, ky + kh - 31); g.textBaseline = 'alphabetic'; }
      });
      const rx = sx0 + sw + 16, rw = x1 - 48 - rx, rh = (sh - 18) / 4;
      for (let i = 0; i < 4; i++) {
        const ry = sy0 + i * (rh + 6); g.fillStyle = mix(C.face, COL.rtl, 0.14); g.fillRect(rx, ry, rw, rh);
        g.strokeStyle = COL.rtl; g.lineWidth = 1.5; g.strokeRect(rx, ry, rw, rh);
        g.font = `400 22px ${FONT.mono}`; g.fillStyle = C.ink2; g.textBaseline = 'middle'; g.fillText('sram_1rw', rx + 12, ry + rh / 2); g.textBaseline = 'alphabetic';
      }
    },
    cells(g) {
      const Cc = DATA.cells;
      caption(g, 'cells', `${S.plate.cells_cap} · ${(Cc.area_um2 / 1e6).toFixed(3)} mm² · ${Cc.cells.toLocaleString('en-US')} cells`);
      const rects = cellsRects();
      const rnd = mulberry32(42);
      rects.forEach((r, i) => {
        g.fillStyle = mix(C.face, COL.cells, 0.10 + 0.05 * (i % 3)); g.fillRect(r.x, r.y, r.w, r.h);
        cellRows(g, r, rnd);
        g.strokeStyle = COL.cells; g.lineWidth = 3; g.strokeRect(r.x, r.y, r.w, r.h);
        if (opts.cellsLabels !== false && r.w > 170 && r.h > 70) {
          const pct = (100 * r.v / Cc.area_um2).toFixed(1) + '%';
          g.fillStyle = 'rgba(248,247,243,0.92)'; g.font = `600 26px ${FONT.mono}`; const tw = Math.max(g.measureText(r.k).width, g.measureText(pct).width) + 20;
          g.fillRect(r.x + 8, r.y + 8, Math.min(tw, r.w - 16), 72);
          g.fillStyle = C.ink; g.fillText(r.k, r.x + 18, r.y + 38); g.font = `400 26px ${FONT.mono}`; g.fillStyle = C.ink2; g.fillText(pct, r.x + 18, r.y + 70);
        }
      });
    },
  };
  function cellRows(g, r, rnd, shade = 0.30) {
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.strokeStyle = mix(C.face, COL.cells, shade); g.lineWidth = 1;
    for (let yy = r.y + 9; yy < r.y + r.h; yy += 9) {
      g.beginPath(); g.moveTo(r.x, yy + 0.5); g.lineTo(r.x + r.w, yy + 0.5); g.stroke();
      let xx = r.x + rnd() * 10; while (xx < r.x + r.w) { g.beginPath(); g.moveTo(Math.round(xx) + 0.5, yy - 9); g.lineTo(Math.round(xx) + 0.5, yy); g.stroke(); xx += 5 + rnd() * 22; }
    }
    g.restore();
  }
  function cellsRects() {
    const m = DATA.cells.modules;
    const items = [
      { k: S.plate.seq_own, id: 'mg_seq', v: m.mg_seq.own_um2 }, { k: 'mg_mac16', id: 'mg_mac16', v: m.mg_mac16.own_um2 }, { k: 'mg_softmax', id: 'mg_softmax', v: m.mg_softmax.own_um2 },
      { k: 'mg_sample', id: 'mg_sample', v: m.mg_sample.own_um2 }, { k: 'mg_rmsnorm', id: 'mg_rmsnorm', v: m.mg_rmsnorm.own_um2 }, { k: 'mg_rq', id: 'mg_rq', v: m.mg_rq.own_um2 },
      { k: S.plate.top_own, id: 'mg_top', v: m.mg_top.own_um2 }, { k: 'rsqrt_rom', id: 'mg_rsqrt_rom', v: m.mg_rsqrt_rom.own_um2 },
      { k: 'exp2_rom', id: 'mg_exp2_rom', v: m.mg_exp2_rom.own_um2 }, { k: 'exp2_rom', id: 'mg_exp2_rom', v: m.mg_exp2_rom.own_um2 },
    ].sort((a, b) => b.v - a.v);
    const r = opts.cellsBox || { x0: CONTENT.x0, y0: CONTENT.y0 + 50, x1: CONTENT.x1, y1: CONTENT.y1 };
    return squarify(items, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }

  function paintPlate(cv, layer) {
    const k = res[layer] || 1;
    const g = cv.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = mix(C.face, COL[layer], num('--layer-tint')); g.fillRect(0, 0, TW, TH);
    g.strokeStyle = mix(C.face, COL[layer], 0.16); g.lineWidth = 1;
    for (let x = 0; x <= TW; x += 50) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, TH); g.stroke(); }
    for (let y = 0; y <= TH; y += 50) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(TW, y + 0.5); g.stroke(); }
    DRAW[layer](g);
    if (CURRENT !== null && layer !== CURRENT) { g.fillStyle = mix(C.face, COL[layer], 0.05).replace('rgb', 'rgba').replace(')', ',0.30)'); g.fillRect(0, 0, TW, TH); }
    drawSlot(g, layer);
    if (opts.afterPaint) opts.afterPaint(g, layer, { TW, TH, CONTENT, pierceTex });
  }
  function plateCanvas(layer) {
    const k = res[layer] || 1;
    const cv = document.createElement('canvas'); cv.width = TW * k; cv.height = TH * k;
    paintPlate(cv, layer);
    return cv;
  }

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, num('--light-ambient')));
  const key = new THREE.DirectionalLight(0xffffff, num('--light-key'));
  const KEY_DIR = new THREE.Vector3(-0.35, 1, 0.75).normalize();
  const stackH = (LAYERS.length - 1) * GAP;
  key.position.copy(KEY_DIR).multiplyScalar(40).add(new THREE.Vector3(0, stackH / 2, 0));
  key.target.position.set(0, stackH / 2, 0); scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  key.shadow.intensity = num('--shadow-strength');
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
  scene.add(key);

  const maxAniso = opts.renderer ? opts.renderer.capabilities.getMaxAnisotropy() : 1;
  const plates = [];
  LAYERS.forEach((layer, i) => {
    const y = (LAYERS.length - 1 - i) * GAP;
    const grp = new THREE.Group(); grp.position.y = y; scene.add(grp);
    const side = new THREE.MeshLambertMaterial({ color: new THREE.Color(COL[layer]) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(PW, PT, PD), side);
    body.position.y = -PT / 2; body.castShadow = true; body.receiveShadow = true; grp.add(body);
    const canvas = plateCanvas(layer);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
    const topMat = new THREE.MeshLambertMaterial({ map: tex });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), topMat);
    top.rotation.x = -Math.PI / 2; top.position.y = 0.002; top.receiveShadow = true; grp.add(top);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(C.ink), transparent: true, opacity: layer === CURRENT ? 0.9 : 0.4 }));
    edges.position.copy(body.position); grp.add(edges);
    plates.push({ layer, i, y, grp, canvas, tex, body, top, edges });
  });
  const T_TOP = stackH + 1.4, T_BOT = -2.2;
  const threadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.thread) });
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 16), threadMat);
  const ends = [T_TOP, T_BOT].map((yy) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), threadMat); s.position.set(PIERCE.x, yy, PIERCE.z); scene.add(s); return s; });
  scene.add(thread);
  function setThread(f, top = T_TOP, bot = T_BOT) {
    const len = (top - bot) * Math.max(0, Math.min(1, f));
    thread.visible = len > 1e-3; ends[0].visible = f > 0; ends[1].visible = f >= 0.999;
    thread.scale.set(1, Math.max(len, 1e-3), 1); thread.position.set(PIERCE.x, top - len / 2, PIERCE.z);
    ends[0].position.y = top; ends[1].position.y = bot;
  }
  setThread(1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ color: new THREE.Color(C.ink), opacity: 0.07 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.4; ground.receiveShadow = true; scene.add(ground);

  function repaint(layer) { const p = plates.find((q) => q.layer === layer); paintPlate(p.canvas, layer); p.tex.needsUpdate = true; }
  function setSlot(layer, st) { if (slotState[layer] !== st) { slotState[layer] = st; repaint(layer); } }
  function setService(state) { serviceState = state; repaint('service'); }
  function setPlateY(layer, y) { const p = plates.find((q) => q.layer === layer); p.grp.position.y = y; }

  function camDir(el, az) { const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)); }
  function applyPose(cam, P, W, H) {
    cam.position.copy(P.target).addScaledVector(camDir(P.el, P.az), 120); cam.up.set(0, 1, 0); cam.lookAt(P.target); cam.updateMatrixWorld();
    cam.left = -P.X0 / P.s; cam.right = (W - P.X0) / P.s; cam.top = P.Y0 / P.s; cam.bottom = -(H - P.Y0) / P.s;
    cam.updateProjectionMatrix();
  }
  function fitPose(rect, el = num('--cam-elevation'), az = num('--cam-azimuth'), ys = null) {
    const yy = ys || plates.map((p) => p.y);
    const c = new THREE.Vector3(0, stackH / 2, 0);
    const tmp = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    tmp.position.copy(c).addScaledVector(camDir(el, az), 120); tmp.lookAt(c); tmp.updateMatrixWorld();
    const pts = [];
    for (const y of yy) for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const d of [0, -PT]) pts.push(new THREE.Vector3(sx * PW / 2, y + d, sz * PD / 2));
    const v = pts.map((p) => p.clone().applyMatrix4(tmp.matrixWorldInverse));
    const umin = Math.min(...v.map((p) => p.x)), umax = Math.max(...v.map((p) => p.x)), vmin = Math.min(...v.map((p) => p.y)), vmax = Math.max(...v.map((p) => p.y));
    const s = Math.min((rect.x1 - rect.x0) / (umax - umin), (rect.y1 - rect.y0) / (vmax - vmin));
    const uc = (umin + umax) / 2, vc = (vmin + vmax) / 2, Xc = (rect.x0 + rect.x1) / 2, Yc = (rect.y0 + rect.y1) / 2;
    return { el, az, target: c, s, X0: Xc - uc * s, Y0: Yc + vc * s };
  }
  function lerpPose(A, B, f) {
    const L = (a, b) => a + (b - a) * f;
    return { el: L(A.el, B.el), az: L(A.az, B.az), target: A.target.clone().lerp(B.target, f), s: Math.exp(L(Math.log(A.s), Math.log(B.s))), X0: L(A.X0, B.X0), Y0: L(A.Y0, B.Y0) };
  }
  function texToWorld(layer, x, y) { const p = plates.find((q) => q.layer === layer); return new THREE.Vector3(x / TPX - PW / 2, p.grp.position.y + 0.002, y / TPX - PD / 2); }

  function screenBoxes(cam, W, H, only = null) {
    const out = [];
    for (const p of plates) {
      if (!p.grp.visible || (only && !only.includes(p.layer))) continue;
      const xs = [], ys = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const d of [0, -PT]) {
        const n = new THREE.Vector3(sx * PW / 2, p.grp.position.y + d, sz * PD / 2).project(cam);
        xs.push((n.x + 1) / 2 * W); ys.push((1 - n.y) / 2 * H);
      }
      const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(W, Math.max(...xs)), y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(H, Math.max(...ys));
      if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    return out;
  }

  return {
    screenBoxes,
    scene, plates, key, ground, thread, threadEnds: ends, LAYERS, COL, C, FONT, PW, PD, PT, GAP, TPX, TW, TH, PIERCE, pierceTex, CONTENT, T_TOP, T_BOT, stackH,
    setThread, setSlot, setService, setPlateY, repaint, cellsRects, cellRows, chatGeometry,
    camDir, applyPose, fitPose, lerpPose, texToWorld, mix, rrect,
  };
}

/* =====================================================
   O'YIN MEXANIKASI:
   Har strelka — katakchalar ketma-ketligi (path).
   path[0]     — dum (oxirgi uchi, bosh yo'nalishining teskarisi)
   path[N-1]   — bosh (o'q uchi)
   Bosh yo'nalishi — path[N-2] → path[N-1] vektori.

   Chiqib ketish animatsiyasi:
   Strelka butun path uzunligida (tana+uchi) "stroke-dashoffset"
   orqali progressiv ravishda chiziladi. Oldinga siljishda
   dum tomon bo'shaydi, bosh taxtadan chiqadi.

   Bu uchun biz "kengaytirilgan path" yaratamiz:
   [dum_tashqarisi, path[0], path[1], ..., path[N-1], bosh_tashqarisi]
   dashoffsetni tanglash bilan strelka taxta ustidan to'liq o'tib ketadi.
===================================================== */

const DIRS = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 }
};
const DIR_NAMES = ['up','down','left','right'];
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e'];

const CELL_DESKTOP = 48;
const GAP = 4;
const BOARD_PAD = 14;

let state = {
  rows: 6, cols: 6,
  arrows: [],
  occupancy: [],
  level: 1,
  moves: 0,
  history: [],
  soundOn: true,
  initialSnapshot: null,
  animating: false,
  cellSize: CELL_DESKTOP,
  hearts: 3,
  hints: 3,
  streak: 0,
  animSpeed: 1,      // 1 = normal, 0.5 = fast
  bestStars: {},     // { levelNum: 1|2|3 }
  maxLevel: 1,
  initialArrowCount: 0
};

/* ---------- Yordamchi ---------- */
function inBounds(x, y) { return x >= 0 && x < state.cols && y >= 0 && y < state.rows; }
function emptyOccupancy(rows, cols) {
  return Array.from({length: rows}, () => Array(cols).fill(-1));
}
function cloneArrows(arrs) {
  return arrs.map(a => ({ ...a, path: a.path.map(p => ({...p})) }));
}

function canRemoveArrow(arrow, occ) {
  const head = arrow.path[arrow.path.length - 1];
  const dir = DIRS[arrow.headDir];
  let nx = head.x + dir.dx, ny = head.y + dir.dy;
  while (inBounds(nx, ny)) {
    if (occ[ny][nx] !== -1 && occ[ny][nx] !== arrow.id) return false;
    nx += dir.dx; ny += dir.dy;
  }
  return true;
}

function rebuildOccupancy() {
  const occ = emptyOccupancy(state.rows, state.cols);
  for (const a of state.arrows) {
    for (const p of a.path) {
      if (inBounds(p.x, p.y)) occ[p.y][p.x] = a.id;
    }
  }
  state.occupancy = occ;
}

/* ============ GENERATOR ============ */

function tryPlaceArrow(occ, id, rows, cols) {
  const length = 2 + Math.floor(Math.random() * 3);
  const headDir = DIR_NAMES[Math.floor(Math.random() * 4)];

  for (let tries = 0; tries < 30; tries++) {
    const hx = Math.floor(Math.random() * cols);
    const hy = Math.floor(Math.random() * rows);
    if (occ[hy][hx] !== -1) continue;

    const path = [{x: hx, y: hy}];
    let cx = hx, cy = hy;
    const headVec = DIRS[headDir];
    let currentStepDir = { dx: -headVec.dx, dy: -headVec.dy };

    let ok = true;
    for (let step = 1; step < length; step++) {
      let opts;
      if (step === 1) {
        opts = [currentStepDir];
      } else {
        opts = [
          currentStepDir,
          {dx: currentStepDir.dy, dy: -currentStepDir.dx},
          {dx: -currentStepDir.dy, dy: currentStepDir.dx}
        ];
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]];
        }
      }
      let placed = false;
      for (const d of opts) {
        const nx = cx + d.dx, ny = cy + d.dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (occ[ny][nx] !== -1) continue;
        if (path.some(p => p.x === nx && p.y === ny)) continue;
        cx = nx; cy = ny;
        path.push({x: nx, y: ny});
        currentStepDir = d;
        placed = true;
        break;
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;
    path.reverse();
    return { id, path, headDir };
  }
  return null;
}

function isSolvable(initialArrows, rows, cols) {
  function buildOcc(arrows) {
    const occ = Array.from({length: rows}, () => Array(cols).fill(-1));
    for (const a of arrows)
      for (const p of a.path)
        if (p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows)
          occ[p.y][p.x] = a.id;
    return occ;
  }
  function canRem(a, occ) {
    const h = a.path[a.path.length - 1];
    const d = DIRS[a.headDir];
    let nx = h.x + d.dx, ny = h.y + d.dy;
    while (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      if (occ[ny][nx] !== -1 && occ[ny][nx] !== a.id) return false;
      nx += d.dx; ny += d.dy;
    }
    return true;
  }
  const key = arrs => arrs.map(a => a.id).sort((a,b)=>a-b).join(',');
  const seen = new Set();
  const q = [initialArrows];
  seen.add(key(initialArrows));
  while (q.length) {
    if (seen.size > 50000) return false;
    const arrs = q.shift();
    if (arrs.length === 0) return true;
    const occ = buildOcc(arrs);
    for (const a of arrs) {
      if (canRem(a, occ)) {
        const next = arrs.filter(x => x.id !== a.id);
        const k = key(next);
        if (!seen.has(k)) {
          seen.add(k);
          if (next.length === 0) return true;
          q.push(next);
        }
      }
    }
  }
  return false;
}

function generateLevel(level) {
  // Grid size grows every 4 levels, up to 9x9 max.
  const size = Math.min(5 + Math.floor((level - 1) / 4), 9);
  state.rows = size;
  state.cols = size;
  
  // Number of arrows grows with level but is capped by board area
  const maxArrows = Math.floor((size * size) * 0.45);
  // Start with 3, add 1-2 per level, cap at maxArrows
  let currentTargetCount = Math.min(2 + Math.ceil(level * 0.8), maxArrows);

  while (currentTargetCount >= 2) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const occ = emptyOccupancy(size, size);
      const arrows = [];
      for (let i = 0; i < currentTargetCount; i++) {
        const arr = tryPlaceArrow(occ, i, size, size);
        if (!arr) continue;
        for (const p of arr.path) occ[p.y][p.x] = arr.id;
        arrows.push(arr);
      }
      if (arrows.length < Math.max(2, currentTargetCount - 2)) continue;
      if (isSolvable(arrows, size, size)) {
        arrows.forEach((a, idx) => a.color = COLORS[idx % COLORS.length]);
        return arrows;
      }
    }
    // If it fails after 150 attempts, relax the target count and try again
    currentTargetCount--;
  }

  // Absolute fallback in extremely rare cases
  state.rows = 5; state.cols = 5;
  return [
    {id:0, path:[{x:0,y:0}, {x:1,y:0}], headDir:'right', color: COLORS[0]},
    {id:1, path:[{x:2,y:1},{x:2,y:2}], headDir:'down', color: COLORS[1]}
  ];
}

/* ============ RENDER ============ */

function updateCellSize() {
  const isMobile = window.innerWidth <= 480;
  const isLandscape = window.innerWidth > window.innerHeight;
  const sidePad = isMobile ? 20 : 40;
  const vw = Math.min(window.innerWidth - sidePad, 420);
  const maxCellByWidth = Math.floor((vw - 2*BOARD_PAD - (state.cols-1)*GAP) / state.cols);

  let uiH;
  if (isLandscape && isMobile) {
    uiH = 90;
  } else if (isMobile) {
    uiH = 200;
  } else {
    uiH = 250;
  }
  const availH = window.innerHeight - uiH;
  const maxCellByHeight = Math.floor((availH - 2*BOARD_PAD - (state.rows-1)*GAP) / state.rows);

  state.cellSize = Math.max(26, Math.min(maxCellByWidth, maxCellByHeight, CELL_DESKTOP));
}

function cellCenter(x, y, size) {
  return {
    cx: x * (size + GAP) + size / 2,
    cy: y * (size + GAP) + size / 2
  };
}

function isDarkMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function drawDots() {
  const size = state.cellSize;
  const W = state.cols * size + (state.cols - 1) * GAP;
  const H = state.rows * size + (state.rows - 1) * GAP;
  const canvas = document.getElementById('dotsLayer');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const dark = isDarkMode();
  const cellBg = dark ? '#111827' : '#ffffff';
  const dotColor = dark ? '#4b5563' : '#d1d5db';
  const rad = 6;

  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const px = x * (size + GAP);
      const py = y * (size + GAP);
      ctx.fillStyle = cellBg;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(px, py, size, size, rad);
        ctx.fill();
      } else {
        ctx.fillRect(px, py, size, size);
      }
    }
  }

  ctx.fillStyle = dotColor;
  const r = 1.8;
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const { cx, cy } = cellCenter(x, y, size);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderHearts() {
  const h = document.getElementById('hearts');
  h.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const empty = i >= state.hearts;
    h.innerHTML += `<svg class="heart${empty ? ' empty' : ''}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9.5C1 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6 4 4.5 7.5C19 16.5 12 21 12 21z"/></svg>`;
  }
}

function render() {
  updateCellSize();
  const size = state.cellSize;
  const W = state.cols * size + (state.cols - 1) * GAP;
  const H = state.rows * size + (state.rows - 1) * GAP;

  const wrap = document.getElementById('boardWrap');
  wrap.style.width = (W + 2 * BOARD_PAD) + 'px';
  wrap.style.height = (H + 2 * BOARD_PAD) + 'px';

  drawDots();

  const svg = document.getElementById('boardSVG');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.style.width = W + 'px';
  svg.style.height = H + 'px';
  // viewBox kengaytirilgan — tashqi segmentlar uchun
  const pad = size * 3;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${W + 2*pad} ${H + 2*pad}`);
  svg.style.left = (BOARD_PAD - pad) + 'px';
  svg.style.top = (BOARD_PAD - pad) + 'px';
  svg.style.width = (W + 2*pad) + 'px';
  svg.style.height = (H + 2*pad) + 'px';
  svg.innerHTML = '';

  const layer = document.getElementById('arrowLayer');
  layer.innerHTML = '';
  layer.style.width = W + 'px';
  layer.style.height = H + 'px';

  rebuildOccupancy();

  for (const a of state.arrows) drawArrow(svg, layer, a, size);

  document.getElementById('levelNum').textContent = state.level;
  document.getElementById('flagCount').textContent = state.arrows.length;
  document.getElementById('undoBtn').disabled = state.history.length === 0;
  document.getElementById('hintBadge').textContent = state.hints;
  renderHearts();

  if (state.arrows.length === 0 && !state.animating) setTimeout(showWin, 280);
}

/* Strelkani chizamiz. path'ni "tashqariga cho'zilgan" qilib hosil qilamiz:
   dum tomondan 1 katakli tashqi davomi + path + bosh tomondan cho'zilgan tashqi chiqish yo'li.
   Chiqib ketish animatsiyasi SVG stroke-dashoffset bilan qilinadi. */
function drawArrow(svg, layer, a, size) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const blocked = !canRemoveArrow(a, state.occupancy);

  // Kengaytirilgan path: dum tashqari + path + bosh tashqari
  // Bu path butun strelkaning "harakat trayektoriyasi"
  const points = a.path.map(p => cellCenter(p.x, p.y, size));
  const headDir = DIRS[a.headDir];
  // Dum (path[0]) dan teskari yo'nalishda 1 katak tashqariga
  let tailDir;
  if (a.path.length >= 2) {
    const p0 = a.path[0], p1 = a.path[1];
    tailDir = { dx: p0.x - p1.x, dy: p0.y - p1.y };
  } else {
    tailDir = { dx: -headDir.dx, dy: -headDir.dy };
  }
  const tailExt = cellCenter(a.path[0].x + tailDir.dx, a.path[0].y + tailDir.dy, size);
  // Bosh tashqari: bosh yo'nalishi bo'yicha taxta chetigacha + 1 katak
  const head = a.path[a.path.length - 1];
  const distToEdge =
    headDir.dx > 0 ? state.cols - head.x :
    headDir.dx < 0 ? head.x + 1 :
    headDir.dy > 0 ? state.rows - head.y :
    head.y + 1;
  const extraCells = a.path.length + 2;
  const headExt = cellCenter(head.x + headDir.dx * (distToEdge + extraCells), head.y + headDir.dy * (distToEdge + extraCells), size);

  const visiblePoints = points;   // hozir ko'rinadigan qismi (tana)
  const fullPoints = [tailExt, ...points, headExt]; // animatsiya uchun

  // VISIBLE path (hozirda ko'rinayotgan qismi)
  const dVisible = 'M ' + visiblePoints.map(p => `${p.cx} ${p.cy}`).join(' L ');
  // FULL path (animatsiya uchun, initial holatda — dashoffset bilan faqat visible ko'rinadi)
  const dFull = 'M ' + fullPoints.map(p => `${p.cx} ${p.cy}`).join(' L ');

  const strokeW = Math.max(4, Math.floor(size * 0.08));
  const color = a.color || '#1e2a3a';

  // Path elementi — stati holatda "visible" qismini ko'rsatadi
  const mainPath = document.createElementNS(SVG_NS, 'path');
  mainPath.setAttribute('d', dVisible);
  mainPath.setAttribute('stroke', color);
  mainPath.setAttribute('stroke-width', strokeW);
  mainPath.setAttribute('stroke-linecap', 'round');
  mainPath.setAttribute('stroke-linejoin', 'round');
  mainPath.setAttribute('fill', 'none');
  mainPath.setAttribute('data-arrow-id', a.id);
  mainPath.setAttribute('data-role', 'main');
  svg.appendChild(mainPath);

  // O'q uchi — alohida polygon (kichik uchburchak), bosh katagining markazida,
  // bosh yo'nalishi bo'yicha
  const h = points[points.length - 1];
  const tipLen = size * 0.32;
  const tipWidth = size * 0.32;
  const tipX = h.cx + headDir.dx * (size * 0.22);
  const tipY = h.cy + headDir.dy * (size * 0.22);
  const baseX = h.cx + headDir.dx * (-size * 0.02);
  const baseY = h.cy + headDir.dy * (-size * 0.02);
  const perpX = -headDir.dy, perpY = headDir.dx;
  const p1x = baseX + perpX * tipWidth / 2;
  const p1y = baseY + perpY * tipWidth / 2;
  const p2x = baseX - perpX * tipWidth / 2;
  const p2y = baseY - perpY * tipWidth / 2;
  const headPoly = document.createElementNS(SVG_NS, 'polygon');
  headPoly.setAttribute('points', `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`);
  headPoly.setAttribute('fill', color);
  headPoly.setAttribute('stroke', color);
  headPoly.setAttribute('stroke-width', '1');
  headPoly.setAttribute('stroke-linejoin', 'round');
  headPoly.setAttribute('data-arrow-id', a.id);
  headPoly.setAttribute('data-role', 'head');
  svg.appendChild(headPoly);

  // Hit area — path ustidan o'zgaruvchan
  const minX = Math.min(...visiblePoints.map(p => p.cx)) - size/2;
  const maxX = Math.max(...visiblePoints.map(p => p.cx)) + size/2;
  const minY = Math.min(...visiblePoints.map(p => p.cy)) - size/2;
  const maxY = Math.max(...visiblePoints.map(p => p.cy)) + size/2;
  const hit = document.createElement('div');
  hit.className = 'arrow-hit' + (blocked ? ' blocked' : '');
  hit.dataset.id = a.id;
  hit.style.left = minX + 'px';
  hit.style.top = minY + 'px';
  hit.style.width = (maxX - minX) + 'px';
  hit.style.height = (maxY - minY) + 'px';
  attachDragHandlers(hit, a);
  layer.appendChild(hit);

  // Saqlab qo'yamiz — animatsiya paytida kerak bo'ladi
  a._renderData = { fullPoints, dVisible, dFull, strokeW, color, headDir, head: points[points.length-1], distToEdge };
}

/* ============ DRAG ============ */

function attachDragHandlers(el, arrow) {
  let startX = 0, startY = 0, curDX = 0, curDY = 0;
  let dragging = false;
  const THRESHOLD = 12;

  const onStart = (e) => {
    if (state.animating || el.classList.contains('flying')) return;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY;
    curDX = curDY = 0;
    dragging = true;
    e.preventDefault();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, {passive: false});
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    const d = DIRS[arrow.headDir];
    const proj = dx * d.dx + dy * d.dy;
    const max = 24;
    const m = Math.max(0, Math.min(proj, max));
    curDX = d.dx * m;
    curDY = d.dy * m;
    el.style.transform = `translate(${curDX}px, ${curDY}px)`;
    const svg = document.getElementById('boardSVG');
    svg.querySelectorAll(`[data-arrow-id="${arrow.id}"]`).forEach(p => {
      p.setAttribute('transform', `translate(${curDX}, ${curDY})`);
    });
    e.preventDefault();
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
    const moved = Math.hypot(curDX, curDY);
    // qaytaramiz
    const svg = document.getElementById('boardSVG');
    svg.querySelectorAll(`[data-arrow-id="${arrow.id}"]`).forEach(p => p.removeAttribute('transform'));
    el.style.transform = '';
    if (moved >= THRESHOLD) tryLaunch(arrow);
  };
  el.addEventListener('mousedown', onStart);
  el.addEventListener('touchstart', onStart, {passive: false});
  el.addEventListener('click', () => {
    if (state.animating) return;
    if (!dragging && curDX === 0 && curDY === 0) tryLaunch(arrow);
  });
  el.addEventListener('mouseenter', () => {
    if (state.animating) return;
    document.getElementById('boardSVG')
      .querySelectorAll(`[data-arrow-id="${arrow.id}"]`)
      .forEach(p => p.classList.add('arrow-hovered'));
  });
  el.addEventListener('mouseleave', () => {
    document.getElementById('boardSVG')
      .querySelectorAll(`[data-arrow-id="${arrow.id}"]`)
      .forEach(p => p.classList.remove('arrow-hovered'));
  });
}

/* ============ UCHIB CHIQISH ANIMATSIYASI (YO'L BO'YICHA) ============
   Ishlash printsipi:
   Biz strelkaning tana chizig'ini "kengaytirilgan path" ustida joylashtiramiz.
   stroke-dasharray = [pathLen, 1000] va stroke-dashoffset ni
   bosh oldinga siljiganda — kattalashtiramiz. Bu visual ravishda strelka
   yo'l bo'yicha oldinga sirg'alib, taxtadan chiqib ketganini ko'rsatadi.

   Shu bilan bir vaqtda o'q uchini bosh yo'nalishi bo'yicha animatsiya bilan siljitamiz. */
function tryLaunch(arrow) {
  if (state.animating) return;
  const live = state.arrows.find(a => a.id === arrow.id);
  if (!live) return;
  rebuildOccupancy();
  if (!canRemoveArrow(live, state.occupancy)) {
    playSound('fail');
    vibrate([40, 20, 40]);
    shakeElementsForArrow(live.id);
    state.streak = 0;
    state.hearts--;
    renderHearts();
    if (state.hearts <= 0) {
      setTimeout(showLose, 300);
    }
    return;
  }
  state.animating = true;
  state.history.push({
    arrows: cloneArrows(state.arrows),
    moves: state.moves,
    hearts: state.hearts,
    streak: state.streak
  });
  state.streak++;
  playSound('move');
  vibrate(8);
  if (state.streak >= 2) showComboToast(state.streak);

  // Render data
  const rd = live._renderData;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('boardSVG');

  // Hit area o'chiriladi
  const hit = document.querySelector(`.arrow-hit[data-id="${live.id}"]`);
  if (hit) hit.classList.add('flying');

  // Existing main va head ni o'chirib, "kengaytirilgan" animatsiya path yaratamiz
  const oldMain = svg.querySelector(`[data-arrow-id="${live.id}"][data-role="main"]`);
  const oldHead = svg.querySelector(`[data-arrow-id="${live.id}"][data-role="head"]`);
  if (oldMain) oldMain.remove();
  if (oldHead) oldHead.remove();

  // Yangi path (full + clip)
  const fullPath = document.createElementNS(SVG_NS, 'path');
  const d = 'M ' + rd.fullPoints.map(p => `${p.cx} ${p.cy}`).join(' L ');
  fullPath.setAttribute('d', d);
  fullPath.setAttribute('stroke', rd.color);
  fullPath.setAttribute('stroke-width', rd.strokeW);
  fullPath.setAttribute('stroke-linecap', 'round');
  fullPath.setAttribute('stroke-linejoin', 'round');
  fullPath.setAttribute('fill', 'none');
  svg.appendChild(fullPath);

  // Total path uzunlik
  const totalLen = fullPath.getTotalLength();
  // Strelka tana uzunligi (dum tashqarisi dan bosh katakgacha)
  // visible body: boshlang'ichda tana ko'rinadigan uzunlik
  // Biz strelkani "tana uzunligi" sifatida: path[0] dan path[N-1] gacha masofa (asl ko'rinish uzunligi)
  // Lekin dash animatsiyasi uchun biz butun pathni kesmalar bilan ko'rsatamiz:
  // dasharray = [bodyLen, totalLen] — shunda bir paytning o'zida faqat bir kesim ko'rinadi.
  // bodyLen — tana asl uzunligi (path bo'ylab)
  let bodyLen = 0;
  for (let i = 1; i < live.path.length; i++) {
    const a1 = cellCenter(live.path[i-1].x, live.path[i-1].y, state.cellSize);
    const a2 = cellCenter(live.path[i].x, live.path[i].y, state.cellSize);
    bodyLen += Math.hypot(a2.cx - a1.cx, a2.cy - a1.cy);
  }
  // Agar path bitta katakdan iborat bo'lsa — bodyLen = 0, uni biroz kattalashtiramiz
  if (bodyLen === 0) bodyLen = state.cellSize * 0.3;

  // Initial holatda strelka tanasi path ning [tailExtSegment, tana, ...] qismidagi
  // tana qismida ko'rinadi. Ya'ni dashoffset = tailExtLen (dum tashqi segmenti uzunligi)
  const tailExtLen = state.cellSize + GAP;
  // Set initial dash state via CSS styles not attributes
  fullPath.style.strokeDasharray = `${bodyLen}px ${totalLen + 100}px`;
  fullPath.style.strokeDashoffset = `-${tailExtLen}px`;
  // Force layout flush to prevent animating from 0 (which causes backward slide)
  fullPath.getBoundingClientRect();

  // O'q uchini ham qayta yaratamiz — u ham path bo'ylab harakat qiladi
  const arrowHead = document.createElementNS(SVG_NS, 'polygon');
  // o'q uchining boshlang'ich joyi — bosh katak markazi
  const tipLen = state.cellSize * 0.32;
  const tipWidth = state.cellSize * 0.32;
  const hd = rd.headDir;
  // uchi bosh joylashuvidan keyin chizilsin — animatsiya paytida translate bilan siljitiladi
  const h = rd.head;
  const tipX = h.cx + hd.dx * (state.cellSize * 0.22);
  const tipY = h.cy + hd.dy * (state.cellSize * 0.22);
  const baseX = h.cx + hd.dx * (-state.cellSize * 0.02);
  const baseY = h.cy + hd.dy * (-state.cellSize * 0.02);
  const perpX = -hd.dy, perpY = hd.dx;
  const p1x = baseX + perpX * tipWidth / 2;
  const p1y = baseY + perpY * tipWidth / 2;
  const p2x = baseX - perpX * tipWidth / 2;
  const p2y = baseY - perpY * tipWidth / 2;
  arrowHead.setAttribute('points', `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`);
  arrowHead.setAttribute('fill', rd.color);
  arrowHead.setAttribute('stroke', rd.color);
  arrowHead.setAttribute('stroke-width', '1');
  arrowHead.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(arrowHead);

  // ANIMATSIYA:
  // Dashoffset ni kattalashtiramiz — shunda visible segment ko'rinishi path bo'ylab oldinga suriladi.
  // Bosh yo'nalishi bo'yicha chiqib ketish masofasi = distToEdge * (cellSize + GAP) + biroz qo'shimcha
  const flyPathLen = bodyLen + (rd.distToEdge + 1) * (state.cellSize + GAP);
  // totalLen ichida oldinga siljiymiz: offset dan = -tailExtLen dan = -(tailExtLen + flyPathLen)
  const finalOffset = -(tailExtLen + flyPathLen);

  const duration = Math.round(600 * state.animSpeed);

  // CSS transition orqali smooth
  fullPath.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.45, 0, 0.55, 1)`;
  // O'q uchi — path bo'ylab harakat qilishi kerak. SVG da <animateMotion> orqali
  // yoki transform bilan oddiyroq: uni bosh katagining yo'nalishi bo'yicha linear siljitamiz.
  // Aslida uchi L-shaklli path uzun joylarida ham to'g'ri siljishi kerak.
  // Buning uchun SMIL <animateMotion> ishlatamiz.
  // animateMotion: path attribute bilan head'ni kengaytirilgan path bo'ylab animatsiya qilamiz.
  // Path u faqat bosh katagidan oldinga (head exit direction) chiqishi kerak, shuning uchun
  // biz o'q uchi uchun qisqaroq path yaratamiz: head markazi -> head exit
  // Lekin agar strelkaning ko'rinadigan qismi L-shakl bo'lsa, uch ham path bo'ylab bukilib harakat qilishi kerak.
  // Soddaroq va to'g'ri variant: head'ning boshlanish nuqtasi — fullPath bo'yicha tailExtLen + bodyLen
  // dagi nuqta (ya'ni hozirgi boshning oldida). Keyin biz uchini path bo'ylab harakatlantiramiz.
  // Buning uchun animateMotion + mpath ishlatamiz.

  // Path uchun unique id
  const motionPathId = 'motion-path-' + live.id + '-' + Date.now();
  fullPath.setAttribute('id', motionPathId);

  // Animate motion: keyMotion bo'yicha
  const am = document.createElementNS(SVG_NS, 'animateMotion');
  am.setAttribute('dur', duration + 'ms');
  am.setAttribute('fill', 'freeze');
  am.setAttribute('rotate', 'auto');
  am.setAttribute('calcMode', 'spline');
  am.setAttribute('keySplines', '0.45 0 0.55 1');
  // keyPoints: 0 dan 1 gacha, bosh katak markazidan tashqariga chiqguncha
  // path to'liq uzunligi bo'yicha: head markazi = tailExtLen + bodyLen / totalLen
  const headStart = (tailExtLen + bodyLen) / totalLen;
  const headEnd = (tailExtLen + bodyLen + flyPathLen) / totalLen;
  am.setAttribute('keyPoints', `${headStart};${Math.min(headEnd, 1)}`);
  am.setAttribute('keyTimes', '0;1');
  const mp = document.createElementNS(SVG_NS, 'mpath');
  mp.setAttribute('href', '#' + motionPathId);
  am.appendChild(mp);
  // animateMotion avval qo'llaniladi — boshlang'ich o'rnini uchi bosh katagida oladi
  // Buning uchun arrowHead ning joriy `points` lari absolut koordinatalarda bo'lsa ham,
  // animateMotion ularni ustiga translate qiladi. Shuning uchun polygon`ni
  // (0,0) atrofida yarataylik va animatsiyada siljitaylik.
  // Qayta quramiz:
  arrowHead.setAttribute('points', `${hd.dx * (state.cellSize * 0.22)},${hd.dy * (state.cellSize * 0.22)} ${(hd.dx * (-state.cellSize * 0.02)) + perpX * tipWidth / 2},${(hd.dy * (-state.cellSize * 0.02)) + perpY * tipWidth / 2} ${(hd.dx * (-state.cellSize * 0.02)) - perpX * tipWidth / 2},${(hd.dy * (-state.cellSize * 0.02)) - perpY * tipWidth / 2}`);
  // rotate="auto" bilan polygon path tangens bo'yicha aylantirilishi uchun
  // asosiy uchi + tomonga qaragan qilib chizish kerak. Lekin head ning "asosiy yo'nalishi"
  // allaqachon headDir. animateMotion rotate auto bilan path tangensi bo'ylab buriladi.
  // Shuning uchun polygonni +x yo'nalishga qaragan qilib chizaylik — keyin rotate auto bilan
  // avtomatik bukiladi.
  const tipX0 = state.cellSize * 0.22;
  const baseX0 = -state.cellSize * 0.02;
  arrowHead.setAttribute('points',
    `${tipX0},0 ${baseX0},${tipWidth/2} ${baseX0},${-tipWidth/2}`);
  arrowHead.appendChild(am);

  // Trigger animation
  requestAnimationFrame(() => {
    fullPath.style.strokeDashoffset = `${finalOffset}px`;
    am.beginElement();
  });

  setTimeout(() => {
    // Tozalash
    fullPath.remove();
    arrowHead.remove();
    if (hit) hit.remove();
    state.arrows = state.arrows.filter(a => a.id !== live.id);
    state.moves++;
    state.animating = false;
    render();
  }, duration + 50);
}

function shakeElementsForArrow(id) {
  const svg = document.getElementById('boardSVG');
  const hit = document.querySelector(`.arrow-hit[data-id="${id}"]`);
  const targets = [...svg.querySelectorAll(`[data-arrow-id="${id}"]`)];
  if (hit) targets.push(hit);
  targets.forEach(t => {
    t.animate([
      { transform: 'translate(0,0)' },
      { transform: 'translate(-4px, 0)' },
      { transform: 'translate(4px, 0)' },
      { transform: 'translate(-2px, 0)' },
      { transform: 'translate(0, 0)' }
    ], { duration: 260 });
  });
}

/* ============ OVOZ ============ */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(type) {
  if (!state.soundOn) return;
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    if (type === 'move') {
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(960, t + 0.18);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.start(t); o.stop(t + 0.3);
    } else if (type === 'fail') {
      o.type = 'square';
      o.frequency.setValueAtTime(160, t);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.start(t); o.stop(t + 0.14);
    } else if (type === 'win') {
      [523, 659, 784, 1046].forEach((f, i) => {
        const oo = ctx.createOscillator();
        const gg = ctx.createGain();
        oo.connect(gg); gg.connect(ctx.destination);
        oo.frequency.value = f;
        const tt = t + i * 0.11;
        gg.gain.setValueAtTime(0.1, tt);
        gg.gain.exponentialRampToValueAtTime(0.001, tt + 0.3);
        oo.start(tt); oo.stop(tt + 0.32);
      });
    }
  } catch(e) {}
}

/* ============ YULDUZ HISOBI ============ */
function calcStars() {
  const n = state.initialArrowCount || state.moves;
  if (state.moves <= n) return 3;
  if (state.moves <= n * 2) return 2;
  return 1;
}

function showWinStars(stars) {
  const el = document.getElementById('winStars');
  el.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const s = document.createElement('span');
    s.className = 'star';
    s.textContent = i <= stars ? '⭐' : '☆';
    if (i <= stars) {
      s.classList.add('earned');
      s.style.animationDelay = (i * 0.12) + 's';
    }
    el.appendChild(s);
  }
}

/* ============ COMBO TOAST ============ */
let comboTimer = null;
function showComboToast(streak) {
  const el = document.getElementById('comboToast');
  const emojis = ['','','🔥','🔥🔥','⚡🔥','💥⚡🔥'];
  const emoji = emojis[Math.min(streak, emojis.length - 1)] || '💥';
  el.textContent = emoji + ' x' + streak + ' Combo!';
  el.classList.add('show');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => el.classList.remove('show'), 1100);
}

/* ============ HAPTIC ============ */
function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
}

/* ============ LEVEL SELECT ============ */
function openLevelSelect() {
  const grid = document.getElementById('levelGrid');
  grid.innerHTML = '';
  const max = state.maxLevel + 1;
  for (let i = 1; i <= max; i++) {
    const cell = document.createElement('div');
    cell.className = 'level-cell' + (i === state.level ? ' current' : '');
    const stars = state.bestStars[i] || 0;
    const starsStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    cell.innerHTML = `<span>${i}</span><span class="cell-stars">${starsStr}</span>`;
    cell.addEventListener('click', () => {
      closeLevelSelect();
      state.level = i;
      newLevel();
    });
    grid.appendChild(cell);
  }
  document.getElementById('levelOverlay').classList.add('show');
}

function closeLevelSelect() {
  document.getElementById('levelOverlay').classList.remove('show');
}

/* ============ URL SYNC ============ */
function syncURL() {
  const url = new URL(location.href);
  url.searchParams.set('level', state.level);
  history.replaceState(null, '', url);
}

/* ============ G'ALABA ============ */
function showWin() {
  playSound('win');
  vibrate([50, 30, 80]);
  launchConfetti();
  const stars = calcStars();
  if (!state.bestStars[state.level] || stars > state.bestStars[state.level]) {
    state.bestStars[state.level] = stars;
    saveSettings();
  }
  showWinStars(stars);
  document.getElementById('winText').innerHTML = TRANSLATIONS[currentLang].winDesc(state.level, state.moves);
  document.getElementById('winOverlay').classList.add('show');
}
function launchConfetti() {
  const colors = ['#1e2a3a','#3b82f6','#ef4444','#22c55e','#f59e0b'];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.top = '-10px';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.animationDuration = (1.5 + Math.random()) + 's';
    c.style.width = c.style.height = (6 + Math.random() * 6) + 'px';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}

function showLose() {
  document.getElementById('loseOverlay').classList.add('show');
}

function watchAd() {
  // Reklama ko'rish logic simulated
  state.hearts = 3;
  document.getElementById('loseOverlay').classList.remove('show');
  renderHearts();
}

function restartFromZero() {
  document.getElementById('loseOverlay').classList.remove('show');
  restart();
}

/* ============ TUGMALAR ============ */
function newLevel() {
  if (state._winTimeout) clearTimeout(state._winTimeout);
  document.getElementById('winOverlay').classList.remove('show');
  state.arrows = generateLevel(state.level);
  state.initialSnapshot = cloneArrows(state.arrows);
  state.initialArrowCount = state.arrows.length;
  state.moves = 0;
  state.history = [];
  state.hearts = 3;
  state.hints = 3;
  state.streak = 0;
  if (state.level > state.maxLevel) {
    state.maxLevel = state.level;
    saveSettings();
  }
  syncURL();
  render();
}
function nextLevel() { state.level++; saveSettings(); newLevel(); }
function restart() {
  if (!state.initialSnapshot) return;
  state.arrows = cloneArrows(state.initialSnapshot);
  state.moves = 0;
  state.history = [];
  state.hearts = 3;
  state.hints = 3;
  state.streak = 0;
  render();
}
function undo() {
  if (state.history.length === 0) return;
  const prev = state.history.pop();
  state.arrows = prev.arrows;
  state.moves = prev.moves;
  if (prev.hearts !== undefined) state.hearts = prev.hearts;
  if (prev.streak !== undefined) state.streak = prev.streak;
  render();
}


const TRANSLATIONS = {
  en: {
    title: "Clear<br>the board",
    level: "Level",
    soundBtn: "Sound",
    hintBtn: "Hint",
    hintDesc: "Drag the arrow towards its head — it will slide along its path and leave the board.",
    winTitle: "🎉 Awesome!",
    winDesc: (lvl, moves) => `You solved <b>Level ${lvl}</b> in <b>${moves}</b> moves!`,
    winBtn: "Next Level →",
    loseTitle: "💔 Game Over",
    loseText: "No hearts left!",
    adBtn: "📺 Watch Ad (+3 ❤️)",
    restartZero: "⟲ Restart Level",
    undoBtn: "↶ Undo",
    restartBtn: "⟲ Restart",
    movesText: "moves",
    langToggle: "O'Z"
  },
  uz: {
    title: "Maydonni<br>tozalang",
    level: "Daraja",
    soundBtn: "Ovoz",
    hintBtn: "Yordam",
    hintDesc: "Strelkani boshi tomonga torting — u yo'l bo'ylab siljib, taxtadan chiqib ketadi.",
    winTitle: "🎉 Ajoyib!",
    winDesc: (lvl, moves) => `Siz <b>${lvl}-darajani</b> <b>${moves}</b> ta harakatda hal qildingiz!`,
    winBtn: "Keyingi daraja →",
    loseTitle: "💔 O'yin tugadi",
    loseText: "Yuraklar qolmadi!",
    adBtn: "📺 Reklama ko'rish (+3 ❤️)",
    restartZero: "⟲ Qayta boshlash",
    undoBtn: "↶ Bekor",
    restartBtn: "⟲ Qayta",
    movesText: "harakat",
    langToggle: "EN"
  }
};

let currentLang = 'en';

function updateUI() {
  const t = TRANSLATIONS[currentLang];
  document.getElementById('mainTitle').innerHTML = t.title;
  document.getElementById('levelText').innerText = t.level;
  document.getElementById('langBtn').innerText = t.langToggle;
  document.getElementById('soundBtn').title = t.soundBtn;
  document.getElementById('hintBtn').title = t.hintBtn;
  document.getElementById('hintDesc').innerText = t.hintDesc;
  document.getElementById('winTitle').innerHTML = t.winTitle;
  document.getElementById('winBtn').innerText = t.winBtn;
  document.getElementById('loseTitle').innerText = t.loseTitle;
  document.getElementById('loseText').innerText = t.loseText;
  document.getElementById('adBtn').innerText = t.adBtn;
  document.getElementById('restartZeroBtn').innerText = t.restartZero;
  document.getElementById('undoBtn').innerText = t.undoBtn;
  document.getElementById('restartBtn').innerText = t.restartBtn;
  if (document.getElementById('winOverlay').classList.contains('show')) {
    document.getElementById('winText').innerHTML = t.winDesc(state.level, state.moves);
  }
}

/* ============ LOCALSTORAGE ============ */
function saveSettings() {
  try {
    localStorage.setItem('arrowGame_v1', JSON.stringify({
      level: state.level,
      soundOn: state.soundOn,
      animSpeed: state.animSpeed,
      lang: currentLang,
      bestStars: state.bestStars,
      maxLevel: state.maxLevel
    }));
  } catch(e) {}
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem('arrowGame_v1') || '{}');
    if (data.lang === 'en' || data.lang === 'uz') currentLang = data.lang;
    if (data.soundOn !== undefined) state.soundOn = data.soundOn;
    if (data.animSpeed) state.animSpeed = data.animSpeed;
    if (data.bestStars) state.bestStars = data.bestStars;
    if (data.maxLevel && data.maxLevel > 1) state.maxLevel = data.maxLevel;
    // URL param overrides saved level
    const urlLevel = parseInt(new URLSearchParams(location.search).get('level'));
    if (urlLevel > 0) {
      state.level = urlLevel;
    } else if (data.level && data.level > 0) {
      state.level = data.level;
    }
  } catch(e) {}
}

function applySoundUI() {
  document.getElementById('soundBtn').classList.toggle('sound-off', !state.soundOn);
}

function applySpeedUI() {
  document.getElementById('speedBtn').classList.toggle('speed-fast', state.animSpeed < 1);
}

/* ============ EVENT LISTENERS ============ */
document.getElementById('langBtn').addEventListener('click', () => {
  currentLang = currentLang === 'en' ? 'uz' : 'en';
  updateUI();
  saveSettings();
});

document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('restartBtn').addEventListener('click', restart);

document.getElementById('soundBtn').addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  applySoundUI();
  saveSettings();
});

document.getElementById('speedBtn').addEventListener('click', () => {
  state.animSpeed = state.animSpeed < 1 ? 1 : 0.4;
  applySpeedUI();
  saveSettings();
});

document.getElementById('hintBtn').addEventListener('click', () => {
  if (state.hints <= 0 || state.animating) return;
  rebuildOccupancy();
  const movable = state.arrows.find(a => canRemoveArrow(a, state.occupancy));
  if (!movable) return;

  state.hints--;
  document.getElementById('hintBadge').textContent = state.hints;

  const svg = document.getElementById('boardSVG');
  const els = svg.querySelectorAll(`[data-arrow-id="${movable.id}"]`);
  els.forEach(el => {
    el.animate([
      { filter: 'drop-shadow(0 0 0 rgba(59,130,246,0))' },
      { filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.9))' },
      { filter: 'drop-shadow(0 0 0 rgba(59,130,246,0))' }
    ], { duration: 900, iterations: 2 });
  });
});

/* ============ KEYBOARD SHORTCUTS ============ */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'u': undo(); break;
    case 'r': restart(); break;
    case 'h': document.getElementById('hintBtn').click(); break;
  }
});

window.addEventListener('resize', () => render());

/* ============ START ============ */
loadSettings();
applySoundUI();
applySpeedUI();
updateUI();
newLevel();

/* Service Worker ro'yxatdan o'tkazish */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/* Dark mode o'zgarganda canvasni qayta chiz */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
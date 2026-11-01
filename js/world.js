// ===================================================================
// world.js — 탑(코스)·배경·캐릭터 만들기. 학생 게임과 TV 중계 화면이 같이 씀
// ===================================================================
"use strict";

// ---------- 크기·물리 값 ----------
const RISE = 1.0;          // 발판 하나 오를 때마다 높아지는 높이
const GAP = 1.65;          // 발판 사이 틈 (13차: 초등 3학년용으로 조금 완화)
const PLAZA = 6;           // 문제 광장 크기
const OPT = 2.8;           // 정답 발판 크기
const OPT_SPACING = 3.4;   // 정답 발판 사이 간격(중심 기준)
const LANE_GAP = 1.6;      // 광장 → 정답 발판 → 착지대 틈
const STRIP_W = 10;        // 착지대 폭
const RINGS = [{ r: 15, dir: 1 }, { r: 20, dir: -1 }];
const BOUNCE_H = 6;        // 점프대 → 다음 구역 착지대 높이 차
const PLAYER_R = 0.4, PLAYER_H = 2.0;
const GRAVITY = 32, JUMP_V = 12.4, FALL_MULT = 1.3, SPEED = 7.2;
const BOUNCE_V = Math.sqrt(2 * GRAVITY * (BOUNCE_H + 1.6));
const BOUNCY_V = 16.5, BOUNCY_RISE = 2.2;
const OPT_COLORS = ["#3d82f0", "#f08a24", "#9b59e8"];
const OPT_ALONG = PLAZA / 2 + LANE_GAP + OPT / 2;
const QSEC = OPT_ALONG + OPT / 2 + LANE_GAP + 1.5;
const FONT = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// ---------- 충돌 상자 ----------
// 모든 발판은 코스 방향으로 돌아간 직사각형. 로컬 x = 코스 옆 방향, 로컬 z = 코스 진행 방향
function makeSolid(cx, cz, theta, hx, hz, top, info, thick = 1) {
  return { cx, cz, theta, c: Math.cos(theta), sn: Math.sin(theta), hx, hz, minY: top - thick, maxY: top, active: true, ...info };
}
function setTheta(s, t) { s.theta = t; s.c = Math.cos(t); s.sn = Math.sin(t); }
function toLocal(s, x, z) {
  const dx = x - s.cx, dz = z - s.cz;
  return [dx * s.c - dz * s.sn, dx * s.sn + dz * s.c];
}
function toWorld(s, lx, lz) { return [s.cx + lx * s.c + lz * s.sn, s.cz - lx * s.sn + lz * s.c]; }
function footOverlaps(s, x, z, r = PLAYER_R) {
  const [lx, lz] = toLocal(s, x, z);
  const ex = lx - Math.max(-s.hx, Math.min(lx, s.hx));
  const ez = lz - Math.max(-s.hz, Math.min(lz, s.hz));
  return ex * ex + ez * ez < r * r - 1e-6;
}
function pointInside(s, x, z, m = 0) {
  const [lx, lz] = toLocal(s, x, z);
  return Math.abs(lx) <= s.hx + m && Math.abs(lz) <= s.hz + m;
}

// ---------- 글자 그림 ----------
function wrapLines(g, text, maxW) {
  const words = String(text).split(/(\s+)/), lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur + w;
    if (g.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w.trimStart(); }
    else cur = t;
  }
  if (cur.trim()) lines.push(cur.trim());
  // 띄어쓰기 없이 긴 글은 글자 단위로 자름
  const out = [];
  for (const l of lines) {
    if (g.measureText(l).width <= maxW) { out.push(l); continue; }
    let c = "";
    for (const ch of l) { if (g.measureText(c + ch).width > maxW) { out.push(c); c = ch; } else c += ch; }
    if (c) out.push(c);
  }
  return out;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function textCanvas(text, o = {}) {
  const size = o.size || 56, pad = o.pad ?? 22, maxW = o.maxW || 760, lh = size * 1.22;
  const c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = `${o.weight || 800} ${size}px ${FONT}`;
  const lines = wrapLines(g, text, maxW).slice(0, o.maxLines || 3);
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width), o.minW || 0)) + pad * 2;
  const h = Math.ceil(lines.length * lh) + pad * 2 - (lh - size) + (o.extraH || 0);
  c.width = w; c.height = h;
  g.font = `${o.weight || 800} ${size}px ${FONT}`;
  if (o.bg) {
    g.fillStyle = o.bg; roundRect(g, 0, 0, w, h, o.radius ?? 20); g.fill();
    if (o.border) { g.lineWidth = 8; g.strokeStyle = o.border; roundRect(g, 4, 4, w - 8, h - 8, (o.radius ?? 20) - 3); g.stroke(); }
  }
  g.textAlign = "center"; g.textBaseline = "top";
  lines.forEach((l, i) => {
    const y = pad + i * lh + (o.extraH || 0) / 2;
    if (o.stroke) { g.lineWidth = size * 0.16; g.strokeStyle = o.stroke; g.lineJoin = "round"; g.strokeText(l, w / 2, y); }
    g.fillStyle = o.color || "#fff"; g.fillText(l, w / 2, y);
  });
  return c;
}
function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function textSprite(text, o = {}, height = 1) {
  const c = textCanvas(text, o);
  const mat = new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: o.depthTest ?? true, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set((height * c.width) / c.height, height, 1);
  sp.userData.h = height;
  return sp;
}
function setSpriteText(sp, text, o = {}, height = sp.userData.h || 1) {
  const c = textCanvas(text, o);
  sp.material.map.dispose();
  sp.material.map = canvasTexture(c);
  sp.material.needsUpdate = true;
  // o.px: 글자 크기를 일정하게(픽셀 → 월드 비율), 줄이 늘면 판이 커짐
  if (o.px) sp.scale.set(c.width * o.px, c.height * o.px, 1);
  else sp.scale.set((height * c.width) / c.height, height, 1);
}
const PAD_LABEL = (i) => ({ size: 52, bg: OPT_COLORS[i], color: "#fff", maxW: 300, pad: 18, px: 0.0092, maxLines: 3 });

// 앞뒤 어느 쪽에서 봐도 글자가 바로 보이는 판 (카메라를 따라 돌지 않음)
function boardMesh(text, o = {}, height = 1) {
  const c = textCanvas(text, o);
  const geo = new THREE.PlaneGeometry((height * c.width) / c.height, height);
  const mat = new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true });
  const g = new THREE.Group(), front = new THREE.Mesh(geo, mat), back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI; g.add(front, back);
  return g;
}

// ---------- 색 ----------
function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color("#ffffff"), k); else c.lerp(new THREE.Color("#000000"), -k);
  return c;
}

// ===================================================================
// 코스 만들기: 단원(unit)의 구역 수·장애물에 맞춰 나선형 탑을 쌓음
// ===================================================================
// 37차: 무작위 장애물. 같은 시드면 같은 코스 (반 전체·TV가 같은 코스를 봄)
function seededRandom(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const OBSTACLE_POOLS = [
  ["pad", "pad", "wind", "lift", "bouncy", "sweep"],
  ["pad", "hurdle", "spinner", "wind", "crumble", "lift", "sweep", "pusher"],
  ["pad", "crumble", "wind", "spinner", "mover", "sweep", "pusher", "lift"],
  ["lift", "mover", "spinner", "pusher", "crumble", "sweep", "hurdle", "pad"],
  ["mover", "cross", "crumble", "pusher", "sweep", "spinner", "lift"],
  ["cross", "mover", "crumble", "pusher", "sweep", "spinner", "wind"],
];
function randomObstacles(rnd, zi) {
  const pool = OBSTACLE_POOLS[Math.min(zi, OBSTACLE_POOLS.length - 1)], out = [];
  while (out.length < 3) {
    const k = pool[Math.floor(rnd() * pool.length)];
    if (k !== "pad" && out.includes(k)) continue;
    if (k === "bouncy" && out.includes("bouncy")) continue;
    out.push(k);
  }
  return out;
}
function buildCourse(unit, seed) {
  const rnd = seed ? seededRandom(seed) : null;
  const zones = unit.zones, FPZ = unit.floorsPerZone || 3, TOTAL = zones.length * FPZ;
  const C = {
    unit, zones, FPZ, TOTAL,
    solids: [], plazas: [], strips: [], landings: [], floors: [], gates: [], bounces: [],
    movers: [], lifts: [], spinners: [], crumbles: [], winds: [], bouncies: [], walls: [], sweeps: [], pushers: [], seed: seed || 0,
    path: [], // TV 연습용 로봇이 따라가는 길 (발판 차례)
  };
  let ang = 0, top = 1, prevHalf = PLAZA / 2, rad = RINGS[0].r, dir = RINGS[0].dir;
  const step = (d) => { ang += (dir * d) / rad; };
  const rp = (a, r = rad, d = dir) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, theta: d > 0 ? -a : Math.PI - a });
  const add = (p, tp, w, l, color, info, thick) => {
    const s = makeSolid(p.x, p.z, p.theta, w / 2, l / 2, tp, { color, ...info }, thick);
    C.solids.push(s); return s;
  };
  const way = (s, extra) => C.path.push({ s, ...extra });

  C.ground = makeSolid(0, 0, 0, 200, 200, 0, { kind: "ground", floor: 0, zone: 0, color: null }, 4);
  C.solids.push(C.ground);
  C.plazas[0] = add(rp(0), top, PLAZA, PLAZA, "#efe7d6", { kind: "plaza", floor: 0, zone: 0, cp: 0 });
  way(C.plazas[0]);

  for (let f = 1; f <= TOTAL; f++) {
    const zi = Math.floor((f - 1) / FPZ), zone = zones[zi];
    const pad = zi < 2 ? 3 : zi < 4 ? 2.7 : 2.5;
    let bonusRise = 0;
    const kinds = rnd ? randomObstacles(rnd, zi) : (zone.obstacles || ["pad", "pad", "pad"]);
    const R = rnd || (() => 0.5);
    for (const kind of kinds) {
      const base = { floor: f, zone: zi };
      if (kind === "hurdle") {
        const len = 5;
        step(prevHalf + GAP + len / 2); top += RISE + bonusRise; bonusRise = 0;
        const pt = rp(ang);
        const s = add(pt, top, 3, len, zone.color, { kind: "pad", ...base });
        const w = makeSolid(pt.x, pt.z, pt.theta, 1.5, 0.25, top + 1.0, { kind: "wall", color: "#ffffff", stripe: zone.color, ...base }, 1.0);
        C.solids.push(w); C.walls.push(w); way(s);
        prevHalf = len / 2;
      } else if (kind === "spinner" || kind === "cross") {
        const size = 8;
        step(prevHalf + GAP + size / 2); top += RISE + bonusRise; bonusRise = 0;
        const pt = rp(ang);
        const s = add(pt, top, size, size, zone.light, { kind: "pad", ...base });
        const arms = kind === "cross" ? [0, Math.PI / 2] : [0];
        const speed = (1.15 + zi * 0.12) * (kind === "cross" ? 0.75 : 1) * (rnd ? (R() < 0.5 ? 1 : -1) * (0.85 + R() * 0.3) : (f % 2 ? 1 : -1));
        for (const off of arms) {
          const bar = makeSolid(pt.x, pt.z, pt.theta + off, 3.9, 0.28, top + 0.9, { kind: "spinner", base: pt.theta + off, speed, pad: s, ...base }, 0.6);
          C.spinners.push(bar);
        }
        way(s); prevHalf = size / 2;
      } else if (kind === "sweep") {
        // 발목 높이로 도는 막대: 점프해서 넘어가요
        const size = 7;
        step(prevHalf + GAP + size / 2); top += RISE + bonusRise; bonusRise = 0;
        const pt = rp(ang);
        const s = add(pt, top, size, size, zone.light, { kind: "pad", ...base });
        const speed = (0.7 + Math.min(zi, 5) * 0.06) * (R() < 0.5 ? 1 : -1), base0 = pt.theta + R() * Math.PI;
        // 가운데(반지름 1m)는 안전한 쉼터: 막대는 바깥쪽 양팔만
        const r0 = 1.0, r1 = size / 2 - 0.25;
        for (const arm of [1, -1]) {
          const bar = makeSolid(pt.x, pt.z, base0, (r1 - r0) / 2, 0.2, top + 0.42, { kind: "sweep", base: base0, speed, pad: s, arm, dist: (r0 + r1) / 2, ...base }, 0.37);
          C.sweeps.push(bar);
        }
        way(s); prevHalf = size / 2;
      } else if (kind === "pusher") {
        // 양옆으로 왔다 갔다 하는 블록 두 개: 틈을 보고 지나가요
        const w = 5.6, len = 4.2;
        step(prevHalf + GAP + len / 2); top += RISE + bonusRise; bonusRise = 0;
        const pt = rp(ang);
        const s = add(pt, top, w, len, zone.color, { kind: "pad", ...base });
        const period = 3.4 - Math.min(zi, 5) * 0.15, ph = R() * 6;
        for (const [lz, off] of [[-0.95, 0], [0.95, Math.PI]]) {
          const b = makeSolid(pt.x, pt.z, pt.theta, 0.6, 0.45, top + 1.15, { kind: "pusher", pad: s, ...base }, 1.15);
          C.pushers.push({ b, pad: s, lz, reach: w / 2 - 0.75, phase: ph + off, period });
        }
        way(s); prevHalf = len / 2;
      } else if (kind === "wind") {
        const size = 7;
        step(prevHalf + GAP + size / 2); top += RISE + bonusRise; bonusRise = 0;
        const pt = rp(ang);
        const s = add(pt, top, size, 6, zone.light, { kind: "pad", ...base });
        C.winds.push({ pad: s, side: rnd ? (R() < 0.5 ? 1 : -1) : f % 2 ? 1 : -1, phase: rnd ? R() * 4 : f * 1.3, period: 4.2, on: false, power: 3.4 + zi * 0.2 });
        way(s); prevHalf = 3;
      } else if (kind === "crumble") {
        step(prevHalf + GAP + pad / 2); top += RISE + bonusRise; bonusRise = 0;
        const s = add(rp(ang), top, pad, pad, "#c9a27a", { kind: "pad", crumble: true, crumbleAt: 0, ...base });
        C.crumbles.push(s); way(s); prevHalf = pad / 2;
      } else if (kind === "mover") {
        const span = 7;
        step(prevHalf + GAP + span / 2); top += RISE + bonusRise; bonusRise = 0;
        const mid = rp(ang);
        const s = add(mid, top, 2.8, 2.8, zone.color, { kind: "pad", mover: true, dx: 0, dz: 0, dy: 0, ...base });
        C.movers.push({ s, mid, reach: span / 2 - 1.4 - 0.1, phase: f * 1.9, period: 5.5 });
        way(s); prevHalf = span / 2;
      } else if (kind === "lift") {
        step(prevHalf + GAP + pad / 2); top += RISE + bonusRise; bonusRise = 0;
        const s = add(rp(ang), top, pad, pad, zone.color, { kind: "pad", mover: true, dx: 0, dz: 0, dy: 0, ...base });
        C.lifts.push({ s, base: top, amp: 1.1, phase: f * 1.1, period: 3.6 });
        way(s); prevHalf = pad / 2;
      } else if (kind === "bouncy") {
        step(prevHalf + GAP + pad / 2); top += RISE + bonusRise; bonusRise = 0;
        const s = add(rp(ang), top, pad, pad, "#ff7eb3", { kind: "bouncy", ...base });
        C.bouncies.push(s); way(s); prevHalf = pad / 2;
        bonusRise = BOUNCY_RISE; // 다음 발판은 통통 발판으로만 오를 수 있게 높임
      } else {
        step(prevHalf + GAP + pad / 2); top += RISE + bonusRise; bonusRise = 0;
        const s = add(rp(ang), top, pad, pad, zone.color, { kind: "pad", ...base });
        way(s); prevHalf = pad / 2;
      }
    }
    // 문제 광장
    step(prevHalf + GAP + PLAZA / 2); top += RISE + bonusRise;
    const aPlaza = ang, aStrip = aPlaza + dir * 2 * Math.asin(QSEC / (2 * rad));
    const px = Math.cos(aPlaza) * rad, pz = Math.sin(aPlaza) * rad;
    const ux = (Math.cos(aStrip) * rad - px) / QSEC, uz = (Math.sin(aStrip) * rad - pz) / QSEC;
    const theta = Math.atan2(ux, uz);
    // along: 진행 방향 거리, lateral: + 이면 진행 방향의 왼쪽
    const frame = (along, lateral = 0) => ({ x: px + ux * along + uz * lateral, z: pz + uz * along - ux * lateral, theta });
    C.plazas[f] = add(frame(0), top, PLAZA, PLAZA, zone.light, { kind: "plaza", floor: f, zone: zi, cp: 2 * f });
    way(C.plazas[f], { plaza: true });
    top += RISE;
    const fl = { zone: zi, frame, top, pads: [], ux, uz, theta };
    for (let i = 0; i < 3; i++) {
      const p = frame(OPT_ALONG, (1 - i) * OPT_SPACING);
      const s = add(p, top, OPT, OPT, OPT_COLORS[i], { kind: "option", floor: f, zone: zi, index: i });
      fl.pads.push(s);
    }
    C.floors[f] = fl;
    way(fl.pads[1], { option: true, floor: f });
    top += RISE;
    const lastOfZone = f % FPZ === 0;
    const nextZone = Math.min(zones.length - 1, lastOfZone ? zi : zi);
    C.strips[f] = add(frame(QSEC), top, STRIP_W, 3, zones[nextZone].light, { kind: "strip", floor: f, zone: zi, cp: 2 * f + 1 });
    way(C.strips[f]);
    ang = aStrip; prevHalf = 1.5;

    if (lastOfZone) {
      // 관문: 착지대 끝에 빨간 막. 단답형 문제를 맞혀야 사라짐
      const wp = frame(QSEC + 1.5 + 0.2);
      const wall = makeSolid(wp.x, wp.z, theta, STRIP_W / 2 + 2, 0.2, top + 3.4, { kind: "gate", zone: zi, floor: f }, 3.4);
      C.solids.push(wall);
      const gate = { zone: zi, floor: f, strip: C.strips[f], wall, cleared: false };
      C.strips[f].gate = gate;
      C.gates[zi] = gate;
      if (f < TOTAL) {
        step(prevHalf + 1.8 + 1.5); top += RISE;
        const b = add(rp(ang), top, 3, 3, "#ff5fa2", { kind: "bounce", floor: f, zone: zi + 1 });
        C.bounces.push(b); way(b);
        step(6.5); top += BOUNCE_H;
        const next = RINGS[(zi + 1) % 2];
        C.landings[zi + 1] = add(rp(ang, (rad + next.r) / 2, next.dir), top, PLAZA, PLAZA, zones[zi + 1].light,
          { kind: "strip", floor: f, zone: zi + 1, cp: 2 * f + 1.5, landing: true });
        way(C.landings[zi + 1]);
        b.target = C.landings[zi + 1];
        rad = next.r; dir = next.dir;
        prevHalf = PLAZA / 2;
      }
    }
  }
  step(prevHalf + 2 + 4.5); top += RISE;
  C.goal = add(rp(ang), top, 9, 9, "#f2c94c", { kind: "goal", floor: TOTAL + 1, zone: zones.length - 1, cp: 2 * TOTAL + 2 });
  way(C.goal);
  C.top = top;
  C.MAX_CP = 2 * TOTAL + 2;
  C.zoneStart = (zi) => (zi === 0 ? C.plazas[0] : C.landings[zi]);
  C.courseStart = (f) => ((f - 1) % FPZ === 0 ? C.zoneStart((f - 1) / FPZ) : C.strips[f - 1]);
  C.cpSolid = (cp) => C.solids.find((s) => s.cp === cp) || C.plazas[0];
  return C;
}

// 움직이는 발판·회전 막대·바람 상태를 시간 t에 맞춰 갱신
function updateDynamics(C, t, dt) {
  for (const b of C.spinners) setTheta(b, b.base + b.speed * t);
  for (const b of C.sweeps || []) {
    setTheta(b, b.base + b.speed * t);
    b.cx = b.pad.cx + b.c * b.dist * b.arm; b.cz = b.pad.cz - b.sn * b.dist * b.arm;
  }
  for (const p of C.pushers || []) {
    const k = Math.sin((t / p.period) * Math.PI * 2 + p.phase) * p.reach;
    const [x, z] = toWorld(p.pad, k, p.lz);
    p.b.cx = x; p.b.cz = z; p.b.maxY = p.pad.maxY + 1.15; p.b.minY = p.pad.maxY;
  }
  for (const m of C.movers) {
    const s = m.s, k = Math.sin((t / m.period) * Math.PI * 2 + m.phase) * m.reach;
    const nx = m.mid.x + Math.sin(m.mid.theta) * k, nz = m.mid.z + Math.cos(m.mid.theta) * k;
    s.dx = nx - s.cx; s.dz = nz - s.cz; s.dy = 0;
    s.cx = nx; s.cz = nz;
  }
  for (const l of C.lifts) {
    const s = l.s, y = l.base + Math.sin((t / l.period) * Math.PI * 2 + l.phase) * l.amp;
    s.dy = y - s.maxY; s.dx = 0; s.dz = 0;
    s.maxY = y; s.minY = y - 1;
  }
  for (const w of C.winds) {
    const ph = ((t + w.phase) % w.period) / w.period;
    w.on = ph > 0.45;   // 절반 조금 넘게 쉬고 나머지 동안 바람이 붊
    w.warn = ph > 0.3 && ph <= 0.45;
  }
  for (const s of C.crumbles) {
    if (!s.crumbleAt) continue;
    const e = t - s.crumbleAt;
    if (e > 0.6 && s.active) s.active = false;
    if (e > 3.2) { s.active = true; s.crumbleAt = 0; }
  }
}

// ===================================================================
// 9차 그래픽: 6종 스테이지(하늘섬·숲·얼음·바다·우주·화산) 3D 맵
//   첨부한 「과학 점프맵」 맵 그림을 바탕으로 다시 꾸밈.
//   ※ 보이는 모양만 바꿈 — 발판 크기·위치·충돌·물리·문제 규칙은 그대로
//   구역마다 unit 파일의 zones[].stage 로 스테이지를 고름 (없으면 차례대로)
// ===================================================================
const STAGES = {
  sky: {
    name: "하늘섬", top: "#3f9ff2", bottom: "#e2f5ff", fog: "#d2efff", hemiSky: "#ffffff", hemiGround: "#a3c486", sun: "#fff4dc",
    ground: "#79cf48", soil: "#9a6b3f", rock: "#b98b5c", rockDark: "#8a6440",
    pads: ["#45c85a", "#ff7fb5", "#ffd23f", "#3fb0ff", "#ff9a3d"], padStyle: "candy", plaza: "#7fd34e",
    spinA: "#e8403d", spinB: "#ffffff", hub: "#2d6fd6", emblem: "star", emblemBg: "#2d74e0", emblemFg: "#ffd53d", deco: "tree",
  },
  forest: {
    name: "숲", top: "#58b4ef", bottom: "#e6f8ef", fog: "#d4eedb", hemiSky: "#f4fff0", hemiGround: "#6f8f4a", sun: "#fff6d8",
    ground: "#5db83a", soil: "#7a5230", rock: "#8c6a45", rockDark: "#5f4529",
    pads: ["#6cc94a", "#58b53b", "#7fd658"], padStyle: "grass", plaza: "#63bf3e",
    spinA: "#8a5a33", spinB: "#b07a45", hub: "#6b4424", emblem: "leaf", emblemBg: "#7a5230", emblemFg: "#7be05a", deco: "bigtree",
  },
  ice: {
    name: "얼음", top: "#6cbcf5", bottom: "#f1fbff", fog: "#e4f6ff", hemiSky: "#ffffff", hemiGround: "#a9cfe8", sun: "#ffffff",
    ground: "#f5fbff", soil: "#b9dcf2", rock: "#9cc8e6", rockDark: "#6a99c2",
    pads: ["#8fd6ff", "#a9e2ff", "#7ccaf7"], padStyle: "ice", plaza: "#f3faff",
    spinA: "#2f6fe0", spinB: "#ffffff", hub: "#2f6fe0", emblem: "snow", emblemBg: "#2f7fe0", emblemFg: "#ffffff", deco: "pine",
  },
  sea: {
    name: "바다", top: "#40b2f6", bottom: "#e0f8ff", fog: "#cdf0fb", hemiSky: "#ffffff", hemiGround: "#d9c48f", sun: "#fff3d6",
    ground: "#f1dca2", soil: "#d8be7f", rock: "#cdb382", rockDark: "#9c8459",
    pads: ["#c98c4f", "#b97b41", "#d69a5b"], padStyle: "wood", plaza: "#f2dea6",
    spinA: "#ff6f2b", spinB: "#ffffff", hub: "#2f84e0", emblem: "shell", emblemBg: "#2d84e6", emblemFg: "#ffffff", deco: "palm",
  },
  space: {
    name: "우주", top: "#070826", bottom: "#3a2a84", fog: "#221d55", hemiSky: "#c9c3ff", hemiGround: "#2a2550", sun: "#e8e6ff",
    ground: "#7b84a0", soil: "#5d5878", rock: "#5f5a7c", rockDark: "#3c3956",
    pads: ["#8e97ab", "#7f889f", "#9ba4b9"], padStyle: "metal", plaza: "#727b94",
    spinA: "#a64dff", spinB: "#3a1a6a", hub: "#4b5370", emblem: "star", emblemBg: "#2f5fe0", emblemFg: "#ffd53d", deco: "crystal", stars: 1,
  },
  volcano: {
    name: "화산", top: "#8a2f1c", bottom: "#ffbb73", fog: "#eb9a6b", hemiSky: "#ffd3b3", hemiGround: "#5a2a1a", sun: "#ffd9b0",
    ground: "#4d3631", soil: "#3b2925", rock: "#3e2c28", rockDark: "#2a1d1a",
    pads: ["#4a3532", "#3f2c29", "#56403b"], padStyle: "lava", plaza: "#4d3732",
    spinA: "#ff6a1a", spinB: "#5a2414", hub: "#3a2420", emblem: "fire", emblemBg: "#d93a2b", emblemFg: "#ffd04a", deco: "lava",
  },
};
const STAGE_ORDER = ["sky", "forest", "ice", "sea", "space", "volcano"];
function zoneStageKey(C, zi) { const z = C.zones[Math.max(0, Math.min(C.zones.length - 1, zi))]; return (z && STAGES[z.stage]) ? z.stage : STAGE_ORDER[zi % STAGE_ORDER.length]; }
function zoneStage(C, zi) { return STAGES[zoneStageKey(C, zi)]; }

// ---------------- 작은 도구들 ----------------
const _rand = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _sv = new THREE.Vector3();
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _sv.set(sx, sy, sz));
}
// 모서리가 둥근 상자 (윗면이 y=0)
const _geoCache = new Map();
function roundedBoxGeo(w, h, d, r = 0.18) {
  const key = [w, h, d, r].map((v) => v.toFixed(2)).join("|");
  if (_geoCache.has(key)) return _geoCache.get(key);
  r = Math.max(0.02, Math.min(r, w / 2 - 0.02, d / 2 - 0.02, h / 2 - 0.01));
  const bs = r * 0.7, bt = Math.min(r * 0.7, h / 2 - 0.01);
  const iw = w / 2 - bs, id = d / 2 - bs, rr = Math.max(0.01, r - bs);
  const sh = new THREE.Shape();
  sh.moveTo(-iw + rr, -id); sh.lineTo(iw - rr, -id); sh.quadraticCurveTo(iw, -id, iw, -id + rr);
  sh.lineTo(iw, id - rr); sh.quadraticCurveTo(iw, id, iw - rr, id); sh.lineTo(-iw + rr, id);
  sh.quadraticCurveTo(-iw, id, -iw, id - rr); sh.lineTo(-iw, -id + rr); sh.quadraticCurveTo(-iw, -id, -iw + rr, -id);
  const depth = Math.max(0.01, h - 2 * bt);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: 3 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(depth + bt), 0);
  _geoCache.set(key, g);
  return g;
}
// 울퉁불퉁한 바위 원뿔 (떠 있는 섬 아래쪽)
function rockConeGeo(r, h, seed, seg = 9) {
  const g = new THREE.ConeGeometry(r, h, seg, 3, true);
  g.rotateX(Math.PI); // 꼭짓점이 아래로
  const p = g.attributes.position, rnd = _rand(seed);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > h / 2 - 0.01) continue; // 윗면 고리는 그대로
    const k = 1 + (rnd() - 0.5) * 0.35;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y + (rnd() - 0.5) * h * 0.12);
  }
  g.translate(0, -h / 2, 0);
  return g;
}

// 여러 장식을 한 덩어리로 합쳐 그리기 (태블릿에서도 가볍게)
class Batch {
  constructor() { this.parts = []; }
  add(geo, matrix, color) { this.parts.push([geo, matrix, new THREE.Color(color)]); return this; }
  build(material) {
    if (!this.parts.length) return null;
    let n = 0;
    const list = this.parts.map(([g, m, c]) => {
      const gg = g.index ? g.toNonIndexed() : g.clone();
      gg.applyMatrix4(m);
      if (!gg.attributes.normal) gg.computeVertexNormals();
      n += gg.attributes.position.count;
      return [gg, c];
    });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const [gg, c] of list) {
      const P = gg.attributes.position.array, N = gg.attributes.normal.array, cnt = gg.attributes.position.count;
      pos.set(P, o * 3); nor.set(N, o * 3);
      for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += cnt;
      gg.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, material);
  }
}

// ---------------- 그림(텍스처) ----------------
const _texCache = new Map();
function cachedTex(key, draw, w = 256, h = 256, repeat) {
  if (_texCache.has(key)) return _texCache.get(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = canvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  _texCache.set(key, t);
  return t;
}
function starPath(g, cx, cy, R, r, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, rad = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}
// 발판 윗면 무늬 (투명 바탕)
function decalTex(type, color = "#ffffff") {
  return cachedTex(`decal-${type}-${color}`, (g, w, h) => {
    g.fillStyle = color; g.strokeStyle = color; g.lineCap = "round"; g.lineJoin = "round";
    const cx = w / 2, cy = h / 2;
    if (type === "chevron") {
      g.lineWidth = 26; g.globalAlpha = 0.6;
      for (const dy of [-34, 30]) { g.beginPath(); g.moveTo(cx - 62, cy + dy + 30); g.lineTo(cx, cy + dy - 22); g.lineTo(cx + 62, cy + dy + 30); g.stroke(); }
    } else if (type === "star") {
      starPath(g, cx, cy, 92, 40); g.fill();
    } else if (type === "snow") {
      g.lineWidth = 16;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3, ex = cx + Math.cos(a) * 92, ey = cy + Math.sin(a) * 92;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
        for (const s of [-1, 1]) {
          const mx = cx + Math.cos(a) * 58, my = cy + Math.sin(a) * 58, b = a + s * 0.7;
          g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(b) * 30, my + Math.sin(b) * 30); g.stroke();
        }
      }
    } else if (type === "leaf") {
      g.beginPath(); g.moveTo(cx, cy + 90); g.quadraticCurveTo(cx - 100, cy - 10, cx, cy - 90); g.quadraticCurveTo(cx + 100, cy - 10, cx, cy + 90); g.fill();
      g.globalCompositeOperation = "destination-out"; g.lineWidth = 10; g.beginPath(); g.moveTo(cx, cy + 80); g.lineTo(cx, cy - 70); g.stroke();
    } else if (type === "shell") {
      g.beginPath(); g.moveTo(cx, cy + 80);
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; g.lineTo(cx + Math.cos(a) * 92, cy - 10 + Math.sin(a) * 82); }
      g.closePath(); g.fill();
      g.globalCompositeOperation = "destination-out"; g.lineWidth = 8;
      for (let k = 1; k < 8; k++) { const a = Math.PI + (k / 8) * Math.PI; g.beginPath(); g.moveTo(cx, cy + 74); g.lineTo(cx + Math.cos(a) * 84, cy - 10 + Math.sin(a) * 74); g.stroke(); }
    } else if (type === "fire") {
      g.beginPath(); g.moveTo(cx, cy - 96);
      g.bezierCurveTo(cx + 40, cy - 40, cx + 92, cy - 10, cx + 70, cy + 50);
      g.bezierCurveTo(cx + 50, cy + 100, cx - 50, cy + 100, cx - 70, cy + 50);
      g.bezierCurveTo(cx - 90, cy, cx - 30, cy - 30, cx, cy - 96); g.fill();
    } else if (type === "planks") {
      g.globalAlpha = 0.35; g.fillStyle = "#3b240f";
      for (let k = 1; k < 4; k++) g.fillRect(0, (k * h) / 4 - 3, w, 6);
      for (let k = 0; k < 4; k++) { const x = (k % 2 ? 0.3 : 0.7) * w; g.fillRect(x, (k * h) / 4, 5, h / 4); }
      g.globalAlpha = 0.7; g.fillStyle = "#e9c48c";
      for (let k = 0; k < 4; k++) for (const x of [24, w - 24]) { g.beginPath(); g.arc(x, (k + 0.5) * (h / 4), 6, 0, 7); g.fill(); }
    } else if (type === "cracks") {
      g.strokeStyle = "#ff8a1f"; g.shadowColor = "#ffcc33"; g.shadowBlur = 14; g.lineWidth = 9;
      const rnd = _rand(7);
      for (let k = 0; k < 7; k++) {
        g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
        for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 120; y += (rnd() - 0.5) * 120; g.lineTo(x, y); }
        g.stroke();
      }
    } else if (type === "flowers") {
      const rnd = _rand(3), cols = ["#ffffff", "#ffe066", "#ff8fc0"];
      for (let k = 0; k < 9; k++) {
        const x = 30 + rnd() * (w - 60), y = 30 + rnd() * (h - 60);
        g.fillStyle = cols[k % 3];
        for (let p = 0; p < 5; p++) { const a = (p / 5) * 6.28; g.beginPath(); g.arc(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 6, 0, 7); g.fill(); }
        g.fillStyle = "#ffcc33"; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
      }
    } else if (type === "tiles") {
      g.globalAlpha = 0.28; g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12); g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.moveTo(6, h / 2); g.lineTo(w - 6, h / 2); g.stroke();
    } else if (type === "q") {
      g.font = `900 190px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", cx, cy + 10);
    }
  });
}
function stripeTex(a, b) {
  return cachedTex(`stripe-${a}-${b}`, (g, w, h) => {
    g.fillStyle = b; g.fillRect(0, 0, w, h); g.fillStyle = a;
    for (let x = -h; x < w + h; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 32, 0); g.lineTo(x + 32 - h, h); g.lineTo(x - h, h); g.closePath(); g.fill(); }
  }, 256, 64, true);
}
function waterfallTex(color) {
  return cachedTex(`fall-${color}`, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    const rnd = _rand(11);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`; g.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 6, 20 + rnd() * 60); }
  }, 64, 128, true);
}
// 캐릭터 얼굴 (구 하나에 머리카락·얼굴을 한 번에)
function faceTex(hair, skin = "#ffd7b5") {
  return cachedTex(`face-${hair}-${skin}`, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    // 머리카락: 윗부분 + 뒤통수 (u=0.25 가 얼굴 앞)
    g.fillStyle = hair;
    g.fillRect(0, 0, w, h * 0.36);
    g.fillRect(w * 0.5, 0, w * 0.5, h * 0.72);
    g.beginPath(); g.moveTo(w * 0.5, h * 0.36);
    for (let k = 0; k <= 10; k++) g.lineTo(w * (0.5 - k * 0.05), h * (0.36 + (k % 2 ? 0.07 : 0.02)));
    g.lineTo(0, h * 0.36); g.closePath(); g.fill();
    g.fillRect(0, 0, w * 0.04, h * 0.66);
    // 얼굴
    const cx = w * 0.25, cy = h * 0.55;
    g.fillStyle = "#2a1a12";
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 30, cy, 11, 16, 0, 0, 7); g.fill(); }
    g.fillStyle = "#ffffff";
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 30 + 4, cy - 6, 5, 0, 7); g.fill(); }
    g.fillStyle = "rgba(255,120,120,.45)";
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 48, cy + 22, 12, 7, 0, 0, 7); g.fill(); }
    g.strokeStyle = "#b8483e"; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath(); g.arc(cx, cy + 20, 12, 0.2, Math.PI - 0.2); g.stroke();
  }, 512, 256);
}

// ===================================================================
// 장면: 하늘(위아래 두 색), 별, 빛 — 구역 높이에 따라 색이 바뀜
// ===================================================================
function makeSceneStage(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#d2efff", 140, 520);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color("#3f9ff2") }, bottom: { value: new THREE.Color("#e2f5ff") } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float k = smoothstep(-0.15, 0.75, vP.y); gl_FragColor = vec4(mix(bottom, top, k), 1.0); }",
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  // 우주 구역에서만 보이는 별
  const n = 900, sp = new Float32Array(n * 3), rnd = _rand(42);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 600;
    sp[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * r; sp[i * 3 + 1] = u * r; sp[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);
  const hemi = new THREE.HemisphereLight("#ffffff", "#a3c486", 1.75);
  const sun = new THREE.DirectionalLight("#fff4dc", 2.0);
  sun.position.set(60, 140, 40);
  scene.add(hemi, sun);
  scene.userData = { skyMat, stars, hemi, sun, sky };
  return scene;
}
// 카메라 높이에 맞춰 하늘·안개·빛을 그 구역 스테이지 색으로 부드럽게
const _cA = new THREE.Color(), _cB = new THREE.Color();
function updateStageSky(M, dt, camY) {
  const U = scene && scene.userData;
  if (!U || !U.skyMat || !M.zoneBands) return;
  let zi = 0;
  for (let i = 0; i < M.zoneBands.length; i++) if (camY >= M.zoneBands[i] - 4) zi = i;
  const st = M.zoneStages[zi];
  const k = Math.min(1, dt * 1.6);
  U.skyMat.uniforms.top.value.lerp(_cA.set(st.top), k);
  U.skyMat.uniforms.bottom.value.lerp(_cA.set(st.bottom), k);
  scene.fog.color.lerp(_cA.set(st.fog), k);
  U.hemi.color.lerp(_cA.set(st.hemiSky), k);
  U.hemi.groundColor.lerp(_cB.set(st.hemiGround), k);
  U.sun.color.lerp(_cA.set(st.sun), k);
  U.stars.material.opacity += ((st.stars ? 0.95 : 0) - U.stars.material.opacity) * k;
  if (U.sky) U.sky.position.copy(camera.position);
  U.stars.position.copy(camera.position);
}

// ===================================================================
// 맵 그리기
// ===================================================================
function buildWorldMeshesStage(scene, C) {
  const unit = C.unit, root = new THREE.Group();
  scene.add(root);
  const M = { root, solidMesh: new Map(), padLabels: [], floorSigns: [], gateMeshes: [], spinnerMeshes: [], bounceFx: [], windFx: [], falls: [], spinners3: [], flag: null, goalFx: null, notes: [], glows: [], qblocks: [] };
  const matCache = new Map();
  const phong = (color, o = {}) => {
    const key = (typeof color === "string" ? color : color.getHexString()) + JSON.stringify(o);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshPhongMaterial({ color, shininess: 55, specular: "#333333", ...o }));
    return matCache.get(key);
  };
  const lambert = (color) => {
    const key = "L" + (typeof color === "string" ? color : color.getHexString());
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
    return matCache.get(key);
  };
  const decalMat = (type, color, opacity = 1, blend) => {
    const key = `D${type}${color}${opacity}${blend || ""}`;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ map: decalTex(type, color), transparent: true, opacity, depthWrite: false, blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending }));
    return matCache.get(key);
  };
  const plane = new THREE.PlaneGeometry(1, 1);
  const addDecal = (g, type, color, w, d, y = 0.012, opacity = 1, blend) => {
    const m = new THREE.Mesh(plane, decalMat(type, color, opacity, blend));
    m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.y = y; g.add(m); return m;
  };
  const batch = new Batch(), glowBatch = new Batch(), cloudBatch = new Batch();
  const rnd = _rand(1234 + C.TOTAL);

  // 구역 높이 띠 (하늘색 바꾸기용)
  M.zoneStages = C.zones.map((_, zi) => zoneStage(C, zi));
  M.zoneBands = C.zones.map((_, zi) => (zi === 0 ? -999 : C.zoneStart(zi).maxY - 2));
  const zoneRange = (zi) => {
    const lo = zi === 0 ? 0 : C.zoneStart(zi).maxY - 3;
    const hi = C.gates[zi] ? C.gates[zi].strip.maxY + 4 : C.top + 4;
    return [lo, hi];
  };

  // ---------- 떠 있는 섬 하나 (장식) ----------
  const islandTop = new THREE.CylinderGeometry(1, 1.05, 1, 10);
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const octa = new THREE.OctahedronGeometry(1, 0);
  function decoOn(st, x, y, z, s) {
    const r = rnd;
    if (st.deco === "tree" || st.deco === "bigtree") {
      const big = st.deco === "bigtree" ? 1.6 : 1;
      batch.add(cyl, mat4(x, y + 0.9 * s * big, z, 0, 0, 0, 0.22 * s * big, 1.8 * s * big, 0.22 * s * big), "#8a5a32");
      for (let k = 0; k < 3; k++) batch.add(sphere, mat4(x + (r() - 0.5) * s, y + (2.1 + k * 0.45) * s * big, z + (r() - 0.5) * s, 0, 0, 0, (0.9 - k * 0.15) * s * big), k % 2 ? "#4fb848" : "#3fa23e");
      if (st.deco === "bigtree" && r() < 0.6) { // 빨간 버섯
        const mx = x + s * 0.9, mz = z + s * 0.4;
        batch.add(cyl, mat4(mx, y + 0.35 * s, mz, 0, 0, 0, 0.12 * s, 0.7 * s, 0.12 * s), "#f6ead2");
        batch.add(sphere, mat4(mx, y + 0.75 * s, mz, 0, 0, 0, 0.45 * s, 0.25 * s, 0.45 * s), "#e5383b");
      }
    } else if (st.deco === "pine") {
      batch.add(cyl, mat4(x, y + 0.5 * s, z, 0, 0, 0, 0.18 * s, 1 * s, 0.18 * s), "#7a5532");
      for (let k = 0; k < 3; k++) batch.add(cone, mat4(x, y + (1.3 + k * 0.7) * s, z, 0, 0, 0, (1.0 - k * 0.25) * s, 1.1 * s, (1.0 - k * 0.25) * s), k === 2 ? "#ffffff" : "#2f7d4f");
      if (r() < 0.35) { // 눈사람
        const sx = x + s, sz = z - s * 0.4;
        batch.add(sphere, mat4(sx, y + 0.45 * s, sz, 0, 0, 0, 0.45 * s), "#ffffff");
        batch.add(sphere, mat4(sx, y + 1.05 * s, sz, 0, 0, 0, 0.32 * s), "#ffffff");
        batch.add(cone, mat4(sx, y + 1.05 * s, sz + 0.32 * s, Math.PI / 2, 0, 0, 0.06 * s, 0.3 * s, 0.06 * s), "#ff8a1f");
      }
    } else if (st.deco === "palm") {
      const lean = (r() - 0.5) * 0.5;
      batch.add(cyl, mat4(x, y + 1.3 * s, z, lean, 0, lean, 0.16 * s, 2.6 * s, 0.16 * s), "#9b6b3c");
      for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28; batch.add(cone, mat4(x + Math.cos(a) * 0.8 * s + lean * 2.4 * s, y + 2.6 * s, z + Math.sin(a) * 0.8 * s + lean * 2.4 * s, Math.PI / 2 - 0.4, 0, -a + Math.PI / 2, 0.35 * s, 1.6 * s, 0.12 * s), "#3fae4a"); }
    } else if (st.deco === "lava") {
      glowBatch.add(cyl, mat4(x, y + 0.06, z, 0, 0, 0, 0.9 * s, 0.1, 0.9 * s), "#ff7a1a");
      batch.add(cone, mat4(x - s, y + 0.6 * s, z + 0.5 * s, 0, 0, 0, 0.5 * s, 1.2 * s, 0.5 * s), "#2e1f1c");
    } else if (st.deco === "crystal") {
      for (let k = 0; k < 3; k++) glowBatch.add(octa, mat4(x + (r() - 0.5) * s * 1.4, y + (0.6 + r() * 0.5) * s, z + (r() - 0.5) * s * 1.4, 0, r() * 3, 0, 0.3 * s, 0.75 * s, 0.3 * s), k % 2 ? "#b46cff" : "#5fd7ff");
    }
  }
  function floatIsland(st, x, y, z, r, withDeco = true, seed = 1) {
    batch.add(islandTop, mat4(x, y - 0.35, z, 0, rnd() * 3, 0, r, 0.7, r), st.ground);
    batch.add(islandTop, mat4(x, y - 0.95, z, 0, rnd() * 3, 0, r * 1.02, 0.5, r * 1.02), st.soil);
    batch.add(rockConeGeo(r * 1.0, r * 1.5, seed), mat4(x, y - 1.2, z), st.rock);
    batch.add(rockConeGeo(r * 0.55, r * 0.9, seed + 7), mat4(x + r * 0.2, y - 1.2 - r * 1.1, z), st.rockDark);
    if (withDeco) decoOn(st, x + (rnd() - 0.5) * r * 0.6, y, z + (rnd() - 0.5) * r * 0.6, Math.max(0.7, r * 0.35));
  }
  function waterfall(x, y, z, w, h, faceA, color) {
    const mat = new THREE.MeshBasicMaterial({ map: waterfallTex(color).clone(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    mat.map.needsUpdate = true; mat.map.repeat.set(1, h / 6);
    const m = new THREE.Mesh(plane, mat);
    m.scale.set(w, h, 1); m.position.set(x, y - h / 2, z); m.rotation.y = faceA;
    root.add(m); M.falls.push(m);
    batch.add(sphere, mat4(x, y - h, z, 0, 0, 0, w * 0.7, w * 0.3, w * 0.7), "#ffffff");
  }

  // ---------- 바닥: 구름 바다 위에 떠 있는 큰 섬 ----------
  const st0 = M.zoneStages[0];
  batch.add(islandTop, mat4(0, -0.4, 0, 0, 0, 0, 34, 1.2, 34), st0.ground);
  batch.add(islandTop, mat4(0, -1.4, 0, 0, 0, 0, 34.5, 1.0, 34.5), st0.soil);
  batch.add(rockConeGeo(34, 34, 99, 16), mat4(0, -1.9, 0), st0.rock);
  batch.add(rockConeGeo(18, 22, 77, 12), mat4(5, -24, -3), st0.rockDark);
  for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.4; waterfall(Math.cos(a) * 34.3, -0.6, Math.sin(a) * 34.3, 3.2, 24, -a + Math.PI / 2, "#7fd2ff"); }
  // 구름 바다
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = 30 + Math.sqrt(rnd()) * 330, s = 5 + rnd() * 9;
    cloudBatch.add(sphere, mat4(Math.cos(a) * r, -22 - rnd() * 8, Math.sin(a) * r, 0, 0, 0, s * 1.6, s * 0.6, s), "#ffffff");
  }
  const cloudFloor = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({ color: "#f4fbff" }));
  cloudFloor.rotation.x = -Math.PI / 2; cloudFloor.position.y = -27; root.add(cloudFloor);
  // 바닥 섬 장식: 나무, 풍차, 집, 울타리, 꽃
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Math.sin(i * 7) * 0.1, r = 24 + (i % 3) * 3.2;
    decoOn(STAGES.sky, Math.cos(a) * r, 0.2, Math.sin(a) * r, 0.9 + (i % 4) * 0.18);
  }
  { // 풍차
    const a = 2.3, x = Math.cos(a) * 27, z = Math.sin(a) * 27;
    batch.add(cyl, mat4(x, 2.6, z, 0, 0, 0, 1.6, 5, 1.6), "#f3e6cc");
    batch.add(cone, mat4(x, 6.0, z, 0, 0, 0, 2.2, 2, 2.2), "#d9534f");
    const wm = new THREE.Group(); wm.position.set(x + Math.cos(a) * 1.8, 5, z + Math.sin(a) * 1.8); wm.rotation.y = -a + Math.PI / 2;
    for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(box, lambert("#e9d3a6")); bl.scale.set(0.5, 3.6, 0.1); bl.position.y = 1.8; const p = new THREE.Group(); p.rotation.z = (k * Math.PI) / 2; p.add(bl); wm.add(p); }
    root.add(wm); M.notes.push({ mill: wm });
  }
  for (const a of [4.0, 5.2]) { // 작은 집
    const x = Math.cos(a) * 28, z = Math.sin(a) * 28;
    batch.add(box, mat4(x, 1.3, z, 0, -a, 0, 3, 2.6, 2.6), "#fff1d6");
    batch.add(cone, mat4(x, 3.4, z, 0, -a + Math.PI / 4, 0, 2.6, 1.8, 2.6), "#e05a47");
  }
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; batch.add(box, mat4(Math.cos(a) * 33, 0.7, Math.sin(a) * 33, 0, -a, 0, 0.25, 1.0, 0.25), "#a8743f"); }

  // ---------- 가운데 기둥: 구역마다 그 스테이지 바위 기둥 ----------
  let y0 = -1;
  C.zones.forEach((z, zi) => {
    const st = M.zoneStages[zi];
    const y1 = C.gates[zi] ? C.gates[zi].strip.maxY + 2 : C.top + 0.2;
    const h = Math.max(1, y1 - y0);
    const g = new THREE.CylinderGeometry(7, 7.4, h, 14, Math.max(2, Math.round(h / 4)));
    const p = g.attributes.position, rr = _rand(zi + 5);
    for (let i = 0; i < p.count; i++) { const k = 1 + (rr() - 0.5) * 0.12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    batch.add(g, mat4(0, y0 + h / 2, 0), st.rock);
    batch.add(islandTop, mat4(0, y1 - 0.2, 0, 0, 0, 0, 7.8, 0.8, 7.8), st.ground);
    if (["sky", "forest", "ice"].includes(zoneStageKey(C, zi))) waterfall(7.3, y1 - 0.3, 0.5, 2.2, Math.min(h, 22), Math.PI / 2, zoneStageKey(C, zi) === "ice" ? "#bfe8ff" : "#7fd2ff");
    if (zoneStageKey(C, zi) === "volcano") { const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: "#ff7a1a", side: THREE.DoubleSide })); m.scale.set(1.8, Math.min(h, 18), 1); m.position.set(-7.25, y1 - 0.3 - Math.min(h, 18) / 2, 0); m.rotation.y = Math.PI / 2; root.add(m); }
    // 구역 이름 현수막
    const cv = textCanvas(`${zi + 1}구역 · ${STAGES[zoneStageKey(C, zi)].name} · ${z.name}`, { size: 54, bg: z.color, color: "#fff", stroke: "rgba(0,0,0,.25)", border: "#ffffff" });
    const tex = canvasTexture(cv), bh = 1.3, bw = (bh * cv.width) / cv.height;
    const bannerM = new THREE.MeshBasicMaterial({ map: tex });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + zi * 0.8;
      const r = 7.6 + (7 - Math.sqrt(Math.max(1, 49 - (bw / 2) ** 2)));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bannerM);
      m.position.set(Math.cos(a) * r, y0 + h / 2, Math.sin(a) * r); m.rotation.y = Math.PI / 2 - a;
      root.add(m);
    }
    // 구역 둘레에 떠 있는 장식 섬
    const [lo, hi] = zoneRange(zi);
    const cnt = 9;
    for (let k = 0; k < cnt; k++) {
      const a = (k / cnt) * Math.PI * 2 + zi * 0.9 + rnd() * 0.4, r = 40 + rnd() * 38, y = lo + rnd() * (hi - lo + 6);
      const s = 2.6 + rnd() * 3.6;
      floatIsland(st, Math.cos(a) * r, y, Math.sin(a) * r, s, true, zi * 31 + k);
      if (k % 4 === 1 && ["sky", "forest", "ice"].includes(zoneStageKey(C, zi))) waterfall(Math.cos(a) * (r + s), y - 0.4, Math.sin(a) * (r + s), s * 0.5, 10 + s * 2, -a + Math.PI / 2, "#8ad8ff");
    }
    const key = zoneStageKey(C, zi), mid = (lo + hi) / 2;
    if (key === "sky") { // 무지개 + 열기구
      const arc = new THREE.TorusGeometry(26, 1.4, 6, 40, Math.PI);
      ["#ff5a5a", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa"].forEach((c, i) => glowBatch.add(arc, mat4(Math.cos(zi + 2) * 85, mid - 4, Math.sin(zi + 2) * 85, 0, -(zi + 2) + Math.PI / 2, 0, 1 - i * 0.055, 1 - i * 0.055, 0.5), c));
      for (let k = 0; k < 2; k++) {
        const a = zi + k * 2.6, r = 58, bx = Math.cos(a) * r, bz = Math.sin(a) * r, by = mid + 6 + k * 5;
        const bal = new THREE.Group();
        const env = new THREE.Mesh(sphere, phong(k ? "#ff8fc0" : "#ffd23f")); env.scale.set(2.4, 2.8, 2.4); env.position.y = 2.6; bal.add(env);
        const bas = new THREE.Mesh(box, lambert("#8a5a32")); bas.scale.set(1, 0.8, 1); bal.add(bas);
        bal.position.set(bx, by, bz); root.add(bal); M.notes.push({ balloon: bal, y0: by, ph: k + zi });
      }
    } else if (key === "space") { // 고리 있는 행성
      const a = zi + 1.3, px = Math.cos(a) * 140, pz = Math.sin(a) * 140;
      const pl = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), phong("#ff9f5a", { emissive: "#401a10" })); pl.position.set(px, mid + 18, pz); root.add(pl);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(25, 1.6, 4, 48), new THREE.MeshBasicMaterial({ color: "#ffd7a1", transparent: true, opacity: 0.8 }));
      ring.position.copy(pl.position); ring.rotation.set(1.2, 0, 0.35); root.add(ring);
      const pl2 = new THREE.Mesh(new THREE.SphereGeometry(8, 20, 12), phong("#6aa8ff", { emissive: "#0a2050" })); pl2.position.set(Math.cos(a + 2) * 120, mid - 4, Math.sin(a + 2) * 120); root.add(pl2);
    } else if (key === "volcano") { // 큰 화산
      const a = zi + 0.7, vx = Math.cos(a) * 110, vz = Math.sin(a) * 110;
      batch.add(rockConeGeo(26, 34, 5, 12), mat4(vx, mid + 30, vz, Math.PI, 0, 0), "#3b2622");
      glowBatch.add(cyl, mat4(vx, mid + 31, vz, 0, 0, 0, 6, 1, 6), "#ff8a1f");
    } else if (key === "sea") { // 바다 고리 + 등대
      const water = new THREE.Mesh(new THREE.RingGeometry(26, 120, 48), new THREE.MeshPhongMaterial({ color: "#38c5ea", transparent: true, opacity: 0.55, shininess: 90, side: THREE.FrontSide, depthWrite: false }));
      water.rotation.x = -Math.PI / 2; water.position.y = lo - 2; root.add(water);
      const a = zi + 2.1, lx = Math.cos(a) * 62, lz = Math.sin(a) * 62;
      floatIsland(st, lx, lo + 4, lz, 4, false, 5);
      batch.add(cyl, mat4(lx, lo + 8, lz, 0, 0, 0, 0.9, 8, 0.9), "#ffffff");
      for (let k = 0; k < 3; k++) batch.add(cyl, mat4(lx, lo + 5.5 + k * 2.4, lz, 0, 0, 0, 0.93, 0.8, 0.93), "#e5383b");
      glowBatch.add(sphere, mat4(lx, lo + 12.6, lz, 0, 0, 0, 0.8), "#ffe066");
    }
  });

  // ---------- 발판 ----------
  const OPT_DARK = OPT_COLORS.map((c) => shade(c, -0.25));
  for (const s of C.solids) {
    if (s.kind === "ground") continue;
    const g = new THREE.Group();
    const thick = s.maxY - s.minY;
    const zi = Math.max(0, Math.min(C.zones.length - 1, s.zone || 0));
    const st = M.zoneStages[zi], key = zoneStageKey(C, zi);
    const W = s.hx * 2, D = s.hz * 2;
    const hsh = Math.abs(Math.round(s.cx * 7 + s.cz * 13 + s.maxY * 3));
    if (s.kind === "gate") {
      // 돌 아치 + 빨간 빛의 막
      const wmat = new THREE.MeshBasicMaterial({ color: "#ff4d6a", transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(box, wmat);
      m.scale.set(W, thick, D); m.position.y = -thick / 2; g.add(m);
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(roundedBoxGeo(0.9, thick + 1.2, 0.9, 0.2), phong("#cfc6b8")); // 윗면 y=0 기준 → 바닥까지
        p.position.set(sx * (s.hx + 0.45), 1.2, 0); g.add(p);
        const cap = new THREE.Mesh(cone, phong("#e5383b")); cap.scale.set(0.7, 0.9, 0.7); cap.position.set(sx * (s.hx + 0.45), 1.65, 0); g.add(cap);
      }
      const lintel = new THREE.Mesh(roundedBoxGeo(W + 2.6, 0.7, 1.0, 0.2), phong("#bdb3a4")); lintel.position.y = 0.95; g.add(lintel);
      const cv = textCanvas("관문 · 정답을 써야 열려요", { size: 50, bg: "#1d2433", color: "#fff", border: "#ffd23f" });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry((1.1 * cv.width) / cv.height, 1.1), new THREE.MeshBasicMaterial({ map: canvasTexture(cv), transparent: true, side: THREE.DoubleSide }));
      sign.position.set(0, -thick + 2.2, -0.3); sign.rotation.y = Math.PI; g.add(sign);
      M.gateMeshes[s.zone] = { group: g, wall: m, sign, open: 0 };
    } else if (s.kind === "wall") {
      // 줄무늬 장애물 벽
      const m = new THREE.Mesh(new THREE.BoxGeometry(W, thick, D), new THREE.MeshPhongMaterial({ map: stripeTex(st.spinA, st.spinB), shininess: 60 }));
      m.material.map.repeat.set(W / 1.2, 1); m.position.y = -thick / 2; g.add(m);
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(cyl, phong(st.hub)); p.scale.set(0.22, thick + 0.3, 0.22); p.position.set(sx * s.hx, -thick / 2 + 0.15, 0); g.add(p); }
    } else if (s.kind === "option") {
      const body = new THREE.Mesh(roundedBoxGeo(W, 0.9, D, 0.3), phong(s.color, { shininess: 90, specular: "#666666" }));
      g.add(body);
      const base = new THREE.Mesh(roundedBoxGeo(W - 0.2, 0.6, D - 0.2, 0.2), phong(OPT_DARK[s.index])); base.position.y = -0.85; g.add(base);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: canvasTexture(textCanvas(String(s.index + 1), { size: 120, color: "#fff", pad: 10, stroke: "rgba(0,0,0,.25)" })), transparent: true }));
      num.rotation.x = -Math.PI / 2; num.rotation.z = Math.PI; num.position.y = 0.02; g.add(num);
      const label = textSprite("…", PAD_LABEL(s.index), 0.95);
      label.center.set(0.5, 0); label.position.y = 1.5; g.add(label);
      s.label = label; M.padLabels.push(s);
    } else if (s.kind === "bounce") {
      // 별 점프대 (구역 사이를 날아가는 큰 점프대)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(s.hx * 1.05, s.hx * 1.12, 0.6, 28), phong("#e9eef5", { shininess: 80 })); rim.position.y = -0.3; g.add(rim);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(s.hx * 0.82, s.hx * 0.82, 0.62, 28), phong(st.emblemBg, { shininess: 90 })); disc.position.y = -0.29; g.add(disc);
      addDecal(g, st.emblem, st.emblemFg, s.hx * 1.5, s.hx * 1.5, 0.03);
      const pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), new THREE.MeshBasicMaterial({ color: "#7ff0ff", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.06; g.add(pulse);
      M.bounceFx.push({ pulse, phase: s.floor || 0, r: s.hx });
      const arrow = textSprite("점프대 ▲", { size: 46, bg: "#ff5fa2", color: "#fff" }, 0.7); arrow.position.y = 1.6; g.add(arrow);
    } else if (s.kind === "bouncy") {
      // 통통 발판: 빨간 스프링 버섯
      const base = new THREE.Mesh(new THREE.CylinderGeometry(s.hx * 0.75, s.hx * 0.85, 0.35, 20), phong("#4b5370")); base.position.y = -0.85; g.add(base);
      for (let k = 0; k < 3; k++) { const coil = new THREE.Mesh(new THREE.TorusGeometry(s.hx * 0.45, 0.09, 6, 20), phong("#c9d1dc", { shininess: 100 })); coil.rotation.x = Math.PI / 2; coil.position.y = -0.62 + k * 0.17; g.add(coil); }
      const capm = new THREE.Mesh(new THREE.CylinderGeometry(s.hx * 1.0, s.hx * 1.05, 0.4, 24), phong("#ef3b3b", { shininess: 90 })); capm.position.y = -0.2; g.add(capm);
      addDecal(g, "star", "#ffe066", s.hx * 1.2, s.hx * 1.2, 0.02);
      const arrow = textSprite("통통!", { size: 46, bg: "#ff5fa2", color: "#fff" }, 0.62); arrow.position.y = 1.5; g.add(arrow);
    } else if (s.crumble) {
      // 사라지는 발판: 분홍빛 유리 상자
      const body = new THREE.Mesh(roundedBoxGeo(W, 0.9, D, 0.15), new THREE.MeshPhongMaterial({ color: "#ff9bd8", transparent: true, opacity: 0.55, shininess: 120, depthWrite: false }));
      g.add(body);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.9, D)), new THREE.LineBasicMaterial({ color: "#ffffff" }));
      edges.position.y = -0.45; g.add(edges);
      addDecal(g, "tiles", "#ffffff", W * 0.95, D * 0.95, 0.015);
    } else if (s.kind === "plaza" || s.kind === "goal" || (s.kind === "strip" && s.landing)) {
      // 문제 광장·착지 섬: 떠 있는 작은 섬
      const top = s.kind === "goal" ? "#f3e7c9" : st.plaza;
      const slab = new THREE.Mesh(roundedBoxGeo(W, 0.6, D, 0.35), phong(top, { shininess: key === "ice" ? 80 : 25 })); g.add(slab);
      const soil = new THREE.Mesh(roundedBoxGeo(W - 0.1, 0.7, D - 0.1, 0.3), lambert(st.soil)); soil.position.y = -0.55; g.add(soil);
      const under = new THREE.Mesh(rockConeGeo(Math.min(W, D) * 0.6, Math.min(W, D) * 0.9, hsh, 9), new THREE.MeshLambertMaterial({ color: st.rock, flatShading: true }));
      under.position.y = -1.2; g.add(under);
      if (s.kind === "goal") addDecal(g, "tiles", "#c9b78f", W * 0.96, D * 0.96, 0.015, 0.8);
      else if (key === "sky" || key === "forest") addDecal(g, "flowers", "#ffffff", W * 0.9, D * 0.9, 0.015);
      else if (key === "space") addDecal(g, "tiles", "#7ff0ff", W * 0.95, D * 0.95, 0.015, 0.8, true);
      else if (key === "volcano") addDecal(g, "cracks", "#ff8a1f", W * 0.95, D * 0.95, 0.015, 0.9, true);
      // 모서리 울타리 기둥
      if (s.kind === "plaza") for (const [ix, iz] of [[-1, 1], [1, 1]]) {
        const post = new THREE.Mesh(roundedBoxGeo(0.32, 0.9, 0.32, 0.08), lambert(key === "space" ? "#9aa3b8" : key === "ice" ? "#ffffff" : "#a8743f"));
        post.position.set(ix * (s.hx - 0.3), 0.9, iz * (s.hz - 0.3)); g.add(post);
      }
    } else if (s.kind === "strip") {
      // 착지대: 나무 다리 (우주는 금속 다리)
      const deck = key === "space" ? "#8e97ab" : key === "volcano" ? "#5a3f36" : "#c98c4f";
      const body = new THREE.Mesh(roundedBoxGeo(W, 0.5, D, 0.12), phong(deck, { shininess: 20 })); g.add(body);
      addDecal(g, key === "space" ? "tiles" : "planks", key === "space" ? "#7ff0ff" : "#ffffff", W, D, 0.012, 1, key === "space");
      for (const ix of [-1, 1]) for (const iz of [-1, 1]) {
        const post = new THREE.Mesh(cyl, lambert(key === "space" ? "#5d6680" : "#7a4f28"));
        post.scale.set(0.16, 1.6, 0.16); post.position.set(ix * (s.hx - 0.2), -0.3, iz * (s.hz - 0.15)); g.add(post);
      }
    } else {
      // 보통 점프 발판 — 스테이지마다 모양이 다름
      const big = W > 4 || D > 4;
      const style = st.padStyle;
      const color = s.mover || C.lifts.some((l) => l.s === s) ? st.pads[(hsh + 1) % st.pads.length] : st.pads[hsh % st.pads.length];
      if (style === "candy") {
        g.add(new THREE.Mesh(roundedBoxGeo(W, 1.0, D, big ? 0.35 : 0.28), phong(color, { shininess: 85, specular: "#555555" })));
        addDecal(g, big ? "tiles" : hsh % 2 ? "chevron" : "tiles", "#ffffff", W * 0.85, D * 0.85, 0.015, big ? 1 : 0.9);
      } else if (style === "grass") {
        const soil = new THREE.Mesh(roundedBoxGeo(W - 0.08, 0.95, D - 0.08, 0.2), lambert("#8a5a32")); soil.position.y = -0.2; g.add(soil);
        g.add(new THREE.Mesh(roundedBoxGeo(W, 0.42, D, 0.2), phong(color, { shininess: 15 })));
        if (hsh % 3 === 0) addDecal(g, "flowers", "#ffffff", W * 0.9, D * 0.9);
        if (hsh % 2) addDecal(g, "chevron", "#ffffff", W * 0.7, D * 0.7, 0.02, 0.5);
      } else if (style === "ice") {
        const ice = new THREE.Mesh(roundedBoxGeo(W, 1.0, D, 0.25), new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.88, shininess: 120, specular: "#ffffff" }));
        g.add(ice);
        const snow = new THREE.Mesh(roundedBoxGeo(W * 0.96, 0.3, D * 0.96, 0.15), phong("#ffffff", { shininess: 10 })); snow.position.y = 0.06; g.add(snow);
        addDecal(g, "snow", "#7cc7f5", Math.min(W, D) * 0.7, Math.min(W, D) * 0.7, 0.08, 0.9);
      } else if (style === "wood") {
        g.add(new THREE.Mesh(roundedBoxGeo(W, 0.5, D, 0.1), phong(color, { shininess: 15 })));
        addDecal(g, "planks", "#ffffff", W, D);
        for (const ix of [-1, 1]) for (const iz of [-1, 1]) { const post = new THREE.Mesh(cyl, lambert("#7a4f28")); post.scale.set(0.15, 1.4, 0.15); post.position.set(ix * (s.hx - 0.15), -0.4, iz * (s.hz - 0.15)); g.add(post); }
        if (hsh % 3 === 0) addDecal(g, "chevron", "#ffffff", W * 0.6, D * 0.6, 0.02, 0.55);
      } else if (style === "lava") {
        g.add(new THREE.Mesh(roundedBoxGeo(W, 1.0, D, 0.18), new THREE.MeshLambertMaterial({ color, flatShading: true })));
        addDecal(g, "cracks", "#ff8a1f", W, D, 0.015, 1, true);
        const glow = new THREE.Mesh(roundedBoxGeo(W * 0.9, 0.2, D * 0.9, 0.1), new THREE.MeshBasicMaterial({ color: "#ff6a1a" })); glow.position.y = -0.95; g.add(glow);
      } else if (style === "metal") {
        g.add(new THREE.Mesh(roundedBoxGeo(W, 0.8, D, 0.2), phong(color, { shininess: 100, specular: "#888888" })));
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W * 0.92, 0.01, D * 0.92)), new THREE.LineBasicMaterial({ color: "#6ff3ff" }));
        edge.position.y = 0.02; g.add(edge);
        addDecal(g, hsh % 2 ? "star" : "chevron", hsh % 2 ? "#ffd53d" : "#7ff0ff", Math.min(W, D) * 0.6, Math.min(W, D) * 0.6, 0.02, 0.95);
      }
    }
    g.position.set(s.cx, s.maxY, s.cz);
    g.rotation.y = s.theta;
    root.add(g);
    M.solidMesh.set(s, g);
  }

  // 층 번호 나무 표지판 + 「?」 문제 상자
  for (let f = 1; f <= C.TOTAL; f++) {
    const p = C.plazas[f];
    const sp = boardMesh(`↑ ${f}층`, { size: 64, bg: "#8a5a2e", color: "#fff3d0", border: "#5a3518" }, 0.85);
    const [x, z] = toWorld(p, -PLAZA / 2 + 0.4, -PLAZA / 2 + 0.4);
    sp.position.set(x, p.maxY + 2.4, z); sp.rotation.y = p.theta; root.add(sp);
    const pole = new THREE.Mesh(cyl, lambert("#6b4424")); pole.scale.set(0.1, 2.2, 0.1); pole.position.set(x, p.maxY + 1.1, z); root.add(pole);
    M.floorSigns[f] = sp;
    const [qx, qz] = toWorld(p, PLAZA / 2 - 0.6, -PLAZA / 2 + 0.6);
    const qb = new THREE.Group();
    const qm = new THREE.Mesh(roundedBoxGeo(0.9, 0.9, 0.9, 0.14), phong("#ffb321", { shininess: 90 })); qm.position.y = 0.45; qb.add(qm);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const d = new THREE.Mesh(plane, decalMat("q", "#ffffff")); d.scale.set(0.7, 0.7, 1); d.position.set(Math.sin(ry) * 0.46, 0.0, Math.cos(ry) * 0.46); d.rotation.y = ry; qb.add(d); }
    qb.position.set(qx, p.maxY + 2.2, qz); root.add(qb);
    M.qblocks.push({ g: qb, y0: p.maxY + 2.2, f });
  }
  { // 출발 표지
    const p = C.plazas[0];
    const sp = boardMesh("출발!", { size: 70, bg: "#2fbf71", color: "#fff", border: "#ffffff" }, 1.1);
    const [x, z] = toWorld(p, PLAZA / 2 - 0.4, -PLAZA / 2 + 0.4);
    sp.position.set(x, p.maxY + 2.7, z); sp.rotation.y = p.theta; root.add(sp);
    const pole = new THREE.Mesh(cyl, lambert("#6b4424")); pole.scale.set(0.1, 2.2, 0.1); pole.position.set(x, p.maxY + 1.1, z); root.add(pole);
  }
  // 회전 막대: 줄무늬 원통 + 별 기둥
  for (const b of C.spinners) {
    const st = M.zoneStages[Math.max(0, Math.min(C.zones.length - 1, b.zone || 0))];
    const g = new THREE.Group();
    const tex = stripeTex(st.spinA, st.spinB);
    const barMat = new THREE.MeshPhongMaterial({ map: tex, shininess: 80 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, b.hx * 2, 16), barMat);
    bar.rotation.z = Math.PI / 2; g.add(bar);
    for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), phong(st.hub, { shininess: 80 })); cap.rotation.z = Math.PI / 2; cap.position.x = sx * b.hx; g.add(cap); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.3, 16), new THREE.MeshPhongMaterial({ map: stripeTex(st.hub, "#ffffff"), shininess: 70 }));
    hub.position.y = -0.45; g.add(hub);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 20), phong(st.hub)); top.position.y = 0.38; g.add(top);
    const star = new THREE.Mesh(plane, decalMat("star", "#ffd53d")); star.rotation.x = -Math.PI / 2; star.scale.set(0.9, 0.9, 1); star.position.y = 0.5; g.add(star);
    g.position.set(b.cx, b.maxY - 0.3, b.cz);
    root.add(g);
    M.spinnerMeshes.push({ b, g });
  }
  // 바람 발판: 선풍기 + 바람 줄무늬
  for (const w of C.winds) {
    const s = w.pad, g = new THREE.Group();
    const fan = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.18, 8, 24), phong("#ffffff", { shininess: 80 })); housing.rotation.y = Math.PI / 2; fan.add(housing);
    const stand = new THREE.Mesh(cyl, phong("#2d6fd6")); stand.scale.set(0.15, 1.3, 0.15); stand.position.y = -0.9; fan.add(stand);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) { const bl = new THREE.Mesh(roundedBoxGeo(0.12, 2.0, 0.5, 0.05), phong("#7cc4f5")); bl.position.y = 1.0; const p = new THREE.Group(); p.rotation.x = (i / 3) * Math.PI * 2; p.add(bl); blades.add(p); }
    fan.add(blades);
    fan.position.set(-w.side * (s.hx + 0.8), 1.4, 0);
    g.add(fan);
    const streaks = [];
    for (let i = 0; i < 8; i++) {
      const st2 = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
      st2.scale.set(1.6, 0.06, 0.06); st2.position.set(0, 0.5 + (i % 4) * 0.5, -2.4 + i * 0.68); g.add(st2); streaks.push(st2);
    }
    const sign = textSprite("바람 조심!", { size: 44, bg: "#2b6cb0", color: "#fff" }, 0.6);
    sign.position.set(-w.side * (s.hx + 0.8), 3.1, 0); g.add(sign);
    g.position.set(s.cx, s.maxY, s.cz); g.rotation.y = s.theta;
    root.add(g);
    M.windFx.push({ w, blades, streaks, g });
  }
  // 정상: 별이 달린 성과 빛나는 도착 문
  {
    const s = C.goal, g = new THREE.Group();
    const back = new THREE.Group(); back.position.z = s.hz - 1.2;
    const wall = new THREE.Mesh(roundedBoxGeo(7.4, 3.6, 1.2, 0.15), phong("#efe3c8")); wall.position.y = 3.6; back.add(wall);
    for (let k = -3; k <= 3; k++) { const c = new THREE.Mesh(box, phong("#efe3c8")); c.scale.set(0.6, 0.5, 1.2); c.position.set(k * 1.05, 3.85, 0); back.add(c); }
    for (const sx of [-1, 1]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 6, 16), phong("#f3e9d2")); tw.position.set(sx * 3.9, 3, 0); back.add(tw);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 16), phong("#2f6fe0", { shininess: 80 })); roof.position.set(sx * 3.9, 7.1, 0); back.add(roof);
      const flagP = new THREE.Mesh(cyl, lambert("#ffffff")); flagP.scale.set(0.05, 1.2, 0.05); flagP.position.set(sx * 3.9, 8.6, 0); back.add(flagP);
      const fl = new THREE.Mesh(plane, new THREE.MeshLambertMaterial({ color: "#ff5a7a", side: THREE.DoubleSide })); fl.scale.set(0.9, 0.5, 1); fl.position.set(sx * 3.9 + 0.45, 8.95, 0); back.add(fl);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.3, 10, 32, Math.PI), phong("#ffd23f", { shininess: 90 })); arch.position.set(0, 2.6, -0.65); back.add(arch);
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: "#5fe3ff", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    portal.position.set(0, 2.6, -0.62); back.add(portal);
    const portalLow = new THREE.Mesh(plane, portal.material); portalLow.scale.set(3.2, 2.6, 1); portalLow.position.set(0, 1.3, -0.62); back.add(portalLow);
    const starM = new THREE.Mesh(new THREE.CircleGeometry(1, 5), new THREE.MeshBasicMaterial({ map: decalTex("star", "#ffd53d"), transparent: true, side: THREE.DoubleSide }));
    starM.scale.set(1.6, 1.6, 1); starM.position.set(0, 6.0, -0.7); back.add(starM);
    back.rotation.y = Math.PI;
    back.position.z = s.hz - 1.2;
    g.add(back);
    const sp = textSprite("정상 · 도착!", { size: 70, bg: "#f2c94c", color: "#5a3d00", border: "#ffffff" }, 1.1); sp.position.set(0, 6.4, s.hz - 2); g.add(sp);
    g.position.set(s.cx, s.maxY, s.cz); g.rotation.y = s.theta; root.add(g);
    M.goalFx = { g, portal, star: starM };
  }
  // 체크포인트 깃발 (작은 잔디 받침 + 깃발 + 금빛 고리)
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 16), phong("#2d6fd6")); base.position.y = 0.12; g.add(base);
    const pole = new THREE.Mesh(cyl, phong("#ffffff")); pole.scale.set(0.07, 3, 0.07); pole.position.y = 1.5; g.add(pole);
    const ball = new THREE.Mesh(sphere, phong("#ffd23f")); ball.scale.setScalar(0.14); ball.position.y = 3.05; g.add(ball);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshLambertMaterial({ color: "#ff4d4d", side: THREE.DoubleSide }));
    cloth.position.set(0.65, 2.55, 0); g.add(cloth);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.09, 8, 32), new THREE.MeshBasicMaterial({ color: "#ffe37b", transparent: true, opacity: 0.7, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; g.add(halo);
    root.add(g); M.flag = g; M.flagCloth = cloth; M.flagHalo = halo;
  }
  // 떠다니는 구름
  const cloudM = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#c9d8e8", transparent: true, opacity: 0.94 });
  M.clouds = [];
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(sphere, cloudM); p.scale.setScalar(2 + (k % 2)); p.position.set(k * 2.2 - 3, Math.sin(k) * 0.6, (k % 2) * 1.2); c.add(p);
    }
    const a = i * 1.7, r = 50 + (i % 5) * 16;
    c.position.set(Math.cos(a) * r, 18 + ((i * 37) % (C.top + 30)), Math.sin(a) * r);
    c.userData = { a, r, sp: 0.01 + (i % 3) * 0.006 };
    root.add(c); M.clouds.push(c);
  }
  // 소리 단원: 떠다니는 음표
  if (unit.theme === "music") {
    const marks = ["♪", "♫", "♬", "♩"];
    for (let i = 0; i < 24; i++) {
      const sp = textSprite(marks[i % 4], { size: 120, color: ["#ff7eb3", "#9b8cf2", "#5cc1a6", "#f5a65b"][i % 4], pad: 4, stroke: "#fff" }, 2.2);
      const a = i * 2.1, r = 28 + (i % 4) * 5;
      sp.position.set(Math.cos(a) * r, 6 + ((i * 13) % C.top), Math.sin(a) * r);
      sp.userData = { y0: sp.position.y, ph: i };
      root.add(sp); M.notes.push({ note: sp });
    }
  }
  // ---------- 13차 나선형 타워: 높이 띠 · 5층마다 체크포인트 고리 · 층 표시판 (보이는 장식만) ----------
  {
    const deco = new THREE.Group(); deco.name = "SpiralTowerObbyDecor"; root.add(deco);
    for (let zi = 0; zi < C.zones.length; zi++) {
      const y = C.gates[zi] ? C.gates[zi].strip.maxY + 2 : C.top;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7.9, 0.16, 7, 64), new THREE.MeshBasicMaterial({ color: C.zones[zi].color }));
      ring.rotation.x = Math.PI / 2; ring.position.y = y + 0.25; deco.add(ring);
    }
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.35, 10, 64), phong("#f7c848"));
    baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.42; deco.add(baseRing);
    for (let f = 5; f <= C.TOTAL; f += 5) {
      const s = C.strips[f];
      if (s) {
        const a = Math.atan2(s.cz, s.cx);
        const marker = textSprite(`${f}F / ${C.TOTAL}F`, { size: 58, color: "#fff", bg: "#214b8e", border: "#bdefff", pad: 20 }, 1.6);
        marker.position.set(Math.cos(a) * 9.6, s.maxY + 3.1, Math.sin(a) * 9.6); deco.add(marker);
      }
      const p = C.plazas[f];
      if (!p) continue;
      const mark = new THREE.Group(); mark.position.set(p.cx, p.maxY + 0.06, p.cz);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.15, 8, 40), new THREE.MeshBasicMaterial({ color: f === C.TOTAL ? "#ffdc55" : "#61f1d7" }));
      rim.rotation.x = Math.PI / 2; mark.add(rim);
      const core = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.1, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }));
      core.rotation.x = -Math.PI / 2; core.position.y = 0.02; mark.add(core);
      const notice = textSprite(f === C.TOTAL ? `${f}층 · 마지막 문제!` : `${f}층 · 체크포인트`, { size: 45, color: "#ffffff", bg: "#1768a8", border: "#8ffde7", pad: 18 }, 0.9);
      notice.position.y = 3.6; mark.add(notice);
      deco.add(mark);
      M.notes.push({ ckRing: rim, ph: f });
    }
  }
  // 합친 장식 넣기
  const b1 = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  if (b1) root.add(b1);
  const b3 = cloudBatch.build(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: "#c9d8e8" }));
  if (b3) root.add(b3);
  const b2 = glowBatch.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (b2) root.add(b2);
  return M;
}

// 매 프레임: 움직이는 것들 모양 갱신
function animateWorldStage(C, M, t, dt) {
  for (const { b, g } of M.spinnerMeshes) g.rotation.y = b.theta;
  for (const fx of M.bounceFx) {
    const k = (t * 1.2 + fx.phase * 0.21) % 1;
    const sc = fx.r * (0.6 + k * 0.9);
    fx.pulse.scale.set(sc, sc, sc);
    fx.pulse.material.opacity = 0.8 * (1 - k);
  }
  for (const m of C.movers) { const g = M.solidMesh.get(m.s); g.position.set(m.s.cx, m.s.maxY, m.s.cz); }
  for (const l of C.lifts) { const g = M.solidMesh.get(l.s); g.position.y = l.s.maxY; }
  for (const s of C.crumbles) {
    const g = M.solidMesh.get(s);
    if (!s.crumbleAt) { g.position.set(s.cx, s.maxY, s.cz); g.visible = true; g.rotation.z = 0; continue; }
    const e = t - s.crumbleAt;
    if (e < 0.6) { g.position.x = s.cx + Math.sin(e * 70) * 0.06; g.rotation.z = Math.sin(e * 50) * 0.03; }
    else if (e < 1.6) { g.position.y = s.maxY - 6 * (e - 0.6) * (e - 0.6); }
    else g.visible = false;
  }
  for (const fx of M.windFx) {
    const w = fx.w;
    fx.blades.rotation.x += dt * (w.on ? 22 : w.warn ? 6 : 1.5);
    fx.streaks.forEach((st, i) => {
      st.material.opacity = w.on ? 0.75 : 0;
      if (w.on) st.position.x = (((t * 9 + i * 1.3) % 8) - 4) * w.side;
    });
  }
  for (const b of C.bouncies) {
    const g = M.solidMesh.get(b);
    const k = b.squash ? Math.max(0, 1 - (t - b.squash) * 4) : 0;
    g.scale.y = 1 - 0.35 * Math.sin(k * Math.PI);
  }
  for (const gm of M.gateMeshes) {
    if (!gm) continue;
    if (gm.opening) {
      gm.open = Math.min(1, gm.open + dt * 1.4);
      gm.wall.material.opacity = 0.5 * (1 - gm.open);
      gm.wall.scale.y = Math.max(0.01, 1 - gm.open);
      gm.sign.material.opacity = 1 - gm.open;
      if (gm.open >= 1) gm.group.visible = false;
    } else gm.wall.material.opacity = 0.4 + Math.sin(t * 4) * 0.12;
  }
  if (M.goalFx) {
    M.goalFx.portal.material.opacity = 0.7 + Math.sin(t * 3) * 0.15;
    M.goalFx.star.rotation.z = Math.sin(t * 1.5) * 0.15;
  }
  for (const q of M.qblocks) { q.g.rotation.y = t * 1.2 + q.f; q.g.position.y = q.y0 + Math.sin(t * 2 + q.f) * 0.12; }
  for (const m of M.falls) m.material.map.offset.y = (m.material.map.offset.y + dt * 0.9) % 1;
  for (const c of M.clouds) {
    c.userData.a += c.userData.sp * dt;
    c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r;
  }
  for (const n of M.notes) {
    if (n.note) n.note.position.y = n.note.userData.y0 + Math.sin(t + n.note.userData.ph) * 0.8;
    if (n.mill) n.mill.rotation.z += dt * 0.8;
    if (n.balloon) n.balloon.position.y = n.y0 + Math.sin(t * 0.5 + n.ph) * 1.5;
    if (n.ckRing) n.ckRing.scale.setScalar(1 + Math.sin(t * 3 + n.ph) * 0.04);
  }
  if (M.flagCloth) M.flagCloth.rotation.y = Math.sin(t * 5) * 0.25;
  if (typeof camera !== "undefined" && camera) updateStageSky(M, dt, camera.position.y);
}



// ===================================================================
// 30층 고화질 나선형 타워 맵 (첨부 「30floor_hd_map_only」의 world.js에서 가져옴)
// ===================================================================
// ===================================================================
// 3D 장면 만들기
// ===================================================================
function makeSceneHD(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#bfe6ff", 120, 420);
  // 하늘: 위는 진한 파랑, 아래는 옅은 하늘색
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const cols = [], pos = skyGeo.attributes.position;
  const topC = new THREE.Color("#5aa8ec"), botC = new THREE.Color("#d9f1ff");
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, (pos.getY(i) + 60) / 400));
    const c = botC.clone().lerp(topC, k); cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  scene.add(new THREE.HemisphereLight("#ffffff", "#7a8a6a", 1.9));
  const sun = new THREE.DirectionalLight("#fff6e0", 2.1);
  sun.position.set(60, 140, 40);
  scene.add(sun);
  return scene;
}

function buildWorldMeshesHD(scene, C) {
  const unit = C.unit, root = new THREE.Group();
  scene.add(root);
  const M = { root, solidMesh: new Map(), padLabels: [], floorSigns: [], gateMeshes: [], spinnerMeshes: [], bounceFx: [], windFx: [], flag: null, goalFx: null, notes: [] };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  const mat = (color) => {
    const key = typeof color === "string" ? color : color.getHexString();
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
    return matCache.get(key);
  };

  // ---------- 바다·섬 ----------
  const sea = new THREE.Mesh(new THREE.CircleGeometry(700, 64), new THREE.MeshLambertMaterial({ color: unit.theme === "music" ? "#6c8fe0" : "#3aa0d8" }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; root.add(sea);
  M.sea = sea;
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 1.2, 48), mat("#f2deb0"));
  sand.position.y = -0.6; root.add(sand);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(34, 37, 1.2, 48), mat("#86c95c"));
  grass.position.y = -0.4; root.add(grass);
  // 물결 고리
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(47 + i * 6, 47.6 + i * 6, 64), new THREE.MeshBasicMaterial({ color: "#d9f3ff", transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.55; root.add(ring);
    M.notes.push({ wave: ring, i });
  }
  // 나무·바위
  const trunkM = mat("#8a5a34"), leafM = mat("#4caf50"), leafM2 = mat("#3f9a45"), rockM = mat("#a8a29a");
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7) * 0.1, r = 26 + (i % 3) * 3;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6), trunkM); trunk.position.y = 1.3; t.add(trunk);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.6, 7), i % 2 ? leafM : leafM2); leaf.position.y = 4; t.add(leaf);
    t.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r); t.scale.setScalar(0.8 + (i % 4) * 0.15);
    root.add(t);
  }
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, r = 38 + (i % 3) * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + (i % 3) * 0.6, 0), rockM);
    rock.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); rock.rotation.set(i, i * 2, 0); root.add(rock);
  }

  // ---------- 가운데 기둥: 구역 색 띠 ----------
  const zoneTops = [];
  for (let zi = 0; zi < C.zones.length; zi++) {
    const g = C.gates[zi]; zoneTops.push(g ? g.strip.maxY + 2 : C.top);
  }
  let y0 = 0;
  zoneTops.forEach((y1, zi) => {
    const h = Math.max(1, y1 - y0);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, h, 24), mat(shade(C.zones[zi].color, -0.15)));
    col.position.y = y0 + h / 2; root.add(col);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.3, 0.6, 24), mat("#ffffff"));
    band.position.y = y1; root.add(band);
    // 기둥에 구역 이름 (네 방향)
    // 기둥에 붙은 구역 이름 현수막 (네 방향)
    const cv = textCanvas(`${zi + 1}구역 · ${C.zones[zi].name}`, { size: 54, bg: C.zones[zi].color, color: "#fff", stroke: "rgba(0,0,0,.25)" });
    const tex = canvasTexture(cv), bh = 1.3, bw = (bh * cv.width) / cv.height;
    const bannerM = new THREE.MeshBasicMaterial({ map: tex });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + zi * 0.8;
      const r = 7 + (7 - Math.sqrt(Math.max(1, 49 - (bw / 2) ** 2))) + 0.1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), bannerM);
      m.position.set(Math.cos(a) * r, y0 + h / 2, Math.sin(a) * r);
      m.rotation.y = Math.PI / 2 - a;
      root.add(m);
    }
    y0 = y1;
  });
  const capY = C.top + 0.2;
  if (y0 < capY) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, capY - y0, 24), mat("#e9d27a"));
    col.position.y = (y0 + capY) / 2; root.add(col);
  }

  // ---------- 타워 오비 전용: 높이별로 바뀌는 벽 띠·층 눈금 ----------
  // 충돌 오브젝트에는 손대지 않고 별도의 장식 그룹만 추가한다.
  const obbyDecor = new THREE.Group();
  obbyDecor.name = "SpiralTowerObbyDecor";
  root.add(obbyDecor);
  const biomeColors = ["#68c8ff", "#a4ebff", "#ff7855", "#74d88c", "#42cce1", "#b48aff"];
  const perBand = C.top / 6;
  for (let i = 0; i < 6; i++) {
    const height = (i + 1) * perBand;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.28, 0.13, 7, 64),
      new THREE.MeshBasicMaterial({ color: biomeColors[i] })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height;
    obbyDecor.add(ring);
    // 얇은 발광색 띠를 추가해 멀리서도 높이를 구별한다.
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(7.16, 7.16, 0.27, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: biomeColors[i], transparent: true, opacity: 0.78, side: THREE.DoubleSide })
    );
    band.position.y = height - 0.17;
    obbyDecor.add(band);
  }
  // 출발점에서 수직 상승 구조가 눈에 띄도록 타워 아래에 장식 고리.
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(9.2, 0.35, 10, 64),
    new THREE.MeshLambertMaterial({ color: "#f7c848" })
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.42;
  obbyDecor.add(baseRing);
  // 층 표시판은 게임의 각 층(정답을 풀고 올라간 높이)에 맞춘다.
  for (let f = 5; f <= C.TOTAL; f += 5) {
    const s = C.strips[f];
    if (!s) continue;
    const a = Math.atan2(s.cz, s.cx);
    const marker = textSprite(`${f}F / ${C.TOTAL}F`, {
      size: 58, color: "#fff", bg: "#214b8e", border: "#bdefff", pad: 20
    }, 2.2);
    marker.position.set(Math.cos(a) * 10, s.maxY + 3.1, Math.sin(a) * 10);
    obbyDecor.add(marker);
  }

  // 진행 경로 안내: 5층마다 금빛 광장 고리 + 다음 목표 층 표시
  // collision solids는 수정하지 않으며 전부 시각 장식으로만 처리한다.
  for (let floor = 5; floor <= C.TOTAL; floor += 5) {
    const plaza = C.plazas[floor];
    if (!plaza) continue;
    const mark = new THREE.Group();
    mark.position.set(plaza.cx, plaza.maxY + 0.06, plaza.cz);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.15, 8, 40),
      new THREE.MeshBasicMaterial({ color: floor === C.TOTAL ? "#ffdc55" : "#61f1d7" })
    );
    rim.rotation.x = Math.PI / 2;
    mark.add(rim);
    const core = new THREE.Mesh(
      new THREE.RingGeometry(1.85, 2.10, 40),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.02;
    mark.add(core);
    const notice = textSprite(floor === C.TOTAL ? "30층 · 도착!" : `${floor}층 · 체크포인트`,
      { size: 45, color: "#ffffff", bg: "#1768a8", border: "#8ffde7", pad: 18 }, 1.3);
    notice.position.y = 3.0;
    mark.add(notice);
    obbyDecor.add(mark);
  }

  // 21차: 타워 외벽 석재 층선(시각 요소만) — 낮은 폴리곤 수
  const stoneLineMat = new THREE.MeshBasicMaterial({color:"#ffe7c4",transparent:true,opacity:.46});
  for(let y=3; y < C.top; y+=4){
    const seam=new THREE.Mesh(new THREE.TorusGeometry(7.045,.035,4,32),stoneLineMat);
    seam.rotation.x=Math.PI/2;seam.position.y=y;root.add(seam);
  }
  // 23차: 석재 원통 외벽의 마디와 따뜻한 조명 색감 보강.
  // 높이마다 배치하지만 기존 타워 반지름·충돌 범위는 바꾸지 않는다.
  const masonryMat = new THREE.MeshLambertMaterial({color:"#e4cfaf",transparent:true,opacity:.50,side:THREE.DoubleSide});
  const keystoneGeo=new THREE.BoxGeometry(.64,.30,.13);
  for(let y=5;y<C.top;y+=9){
    for(let k=0;k<16;k++){
      const a=(k+(Math.floor(y/9)%2)*.5)*Math.PI/8;
      const stone=new THREE.Mesh(keystoneGeo,masonryMat);
      stone.position.set(Math.cos(a)*7.15,y,Math.sin(a)*7.15);
      stone.rotation.y=-a;
      obbyDecor.add(stone);
    }
  }
  // 22차: 타워 외벽의 금빛 수직 리브와 층별 등불. 시각 오브젝트 전용.
  const towerRibMat = new THREE.MeshLambertMaterial({color:"#f5dcad"});
  const towerLampMat = new THREE.MeshBasicMaterial({color:"#ffeaa0"});
  for(let aIndex=0;aIndex<12;aIndex++){
    const a=aIndex*Math.PI/6;
    const rib=new THREE.Mesh(new THREE.BoxGeometry(.15,Math.max(1,C.top-1),.20),towerRibMat);
    rib.position.set(Math.cos(a)*7.11,C.top/2,Math.sin(a)*7.11);
    rib.rotation.y=-a;
    obbyDecor.add(rib);
  }
  for(let y=8;y<C.top;y+=14){
    for(let k=0;k<4;k++){
      const a=k*Math.PI/2+Math.PI/4;
      const lamp=new THREE.Mesh(new THREE.OctahedronGeometry(.27,0),towerLampMat);
      lamp.position.set(Math.cos(a)*7.4,y,Math.sin(a)*7.4);
      obbyDecor.add(lamp);
    }
  }
  // 화면 가까이서도 선명하게 보이는 가벼운 절차 생성형 발판 무늬.
  // 반복 사용 가능한 3종 텍스처만 만들어 태블릿의 텍스처 메모리 사용량을 제한한다.
  function makeTopDecal(kind){
    const c=document.createElement("canvas");c.width=c.height=512;
    const ctx=c.getContext("2d");ctx.clearRect(0,0,512,512);
    ctx.scale(2,2);
    // 표면 질감은 캔버스에서 생성: 서버 요청 없이 선명한 재질을 공유한다.
    const N=256;
    if(kind==="wood"){
      ctx.fillStyle="rgba(126,71,30,.17)";ctx.fillRect(0,0,N,N);
      for(let j=8;j<N;j+=27){
        ctx.strokeStyle="rgba(77,45,23,.42)";ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(4,j);ctx.bezierCurveTo(70,j-9,176,j+7,252,j);ctx.stroke();
        ctx.strokeStyle="rgba(255,238,178,.34)";ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(8,j+6);ctx.bezierCurveTo(110,j+2,170,j+9,247,j+5);ctx.stroke();
      }
      for(let k=0;k<5;k++){let x=28+k*49,y=22+(k%3)*67;ctx.strokeStyle="rgba(85,45,23,.38)";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,8,4,.2,0,Math.PI*2);ctx.stroke();}
    }else if(kind==="stone"){
      ctx.fillStyle="rgba(43,88,123,.08)";ctx.fillRect(0,0,N,N);
      const stoneLight=ctx.createLinearGradient(0,0,256,256);
      stoneLight.addColorStop(0,"rgba(255,255,255,.14)");stoneLight.addColorStop(1,"rgba(0,20,60,.14)");
      ctx.fillStyle=stoneLight;ctx.fillRect(0,0,N,N);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const xx=x*32+(y%2)*15,yy=y*32;
        ctx.strokeStyle="rgba(29,62,99,.30)";ctx.lineWidth=2;ctx.strokeRect(xx+2,yy+2,28,28);
        ctx.strokeStyle="rgba(255,255,255,.30)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx+3,yy+28);ctx.lineTo(xx+3,yy+3);ctx.lineTo(xx+27,yy+3);ctx.stroke();
      }
    }else{
      const g=ctx.createRadialGradient(128,128,12,128,128,110);
      g.addColorStop(0,"rgba(255,255,255,.10)");g.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle=g;ctx.fillRect(0,0,N,N);
      ctx.beginPath();for(let k=0;k<10;k++){
        const t=-Math.PI/2+k*Math.PI/5,r=k%2?39:80;
        const x=128+Math.cos(t)*r,y=128+Math.sin(t)*r;
        if(!k)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }ctx.closePath();ctx.fillStyle="rgba(255,255,255,.79)";ctx.fill();
      ctx.strokeStyle="rgba(255,229,122,.90)";ctx.lineWidth=9;ctx.stroke();
      ctx.lineWidth=3;ctx.strokeStyle="rgba(255,255,255,.85)";ctx.stroke();
    }
    const t=new THREE.CanvasTexture(c);
    t.anisotropy=8; t.minFilter=THREE.LinearMipmapLinearFilter; t.magFilter=THREE.LinearFilter;
    return new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:kind==="star"?.78:.53,depthWrite:false,side:THREE.DoubleSide});
  }
  const topDecals={star:makeTopDecal("star"),stone:makeTopDecal("stone"),wood:makeTopDecal("wood")};
  const topDecalGeo=new THREE.PlaneGeometry(1,1);
  // 24차: 재사용 가능한 광택 금속 고정 볼트. 새로운 충돌체가 아니다.
  const hdBoltGeo = new THREE.CylinderGeometry(.095,.095,.055,8);
  const hdBoltMat = new THREE.MeshPhongMaterial({color:0xffe7a5,specular:0xffffff,shininess:110});
  const hdEdgeGold = new THREE.MeshPhongMaterial({color:0xe8ad36,specular:0xfff3c8,shininess:95});
  const hdEdgeWhite = new THREE.MeshPhongMaterial({color:0xe0f9ff,specular:0xffffff,shininess:105});
  const hdStoneTrim = new THREE.MeshLambertMaterial({color:0xffdfac});
  // ---------- 발판 ----------
  for (const s of C.solids) {
    if (s.kind === "ground") continue;
    const g = new THREE.Group();
    const thick = s.maxY - s.minY;
    if (s.kind === "gate") {
      const wmat = new THREE.MeshLambertMaterial({ color: "#ff4d5a", transparent: true, opacity: 0.55, emissive: "#801820" });
      const m = new THREE.Mesh(boxGeo, wmat);
      m.scale.set(s.hx * 2, thick, s.hz * 2); m.position.y = -thick / 2;
      g.add(m);
      // 기둥 두 개
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(boxGeo, mat("#7a1f28"));
        p.scale.set(0.5, thick + 0.6, 0.6); p.position.set(sx * (s.hx + 0.25), -thick / 2 + 0.3, 0); g.add(p);
      }
      const cv = textCanvas("관문 · 정답을 써야 열려요", { size: 50, bg: "#1d2433", color: "#fff", border: "#ff4d5a" });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry((1.1 * cv.width) / cv.height, 1.1), new THREE.MeshBasicMaterial({ map: canvasTexture(cv), transparent: true, side: THREE.DoubleSide }));
      sign.position.set(0, -thick + 2.2, -0.25); sign.rotation.y = Math.PI; g.add(sign);
      M.gateMeshes[s.zone] = { group: g, wall: m, sign, open: 0 };
    } else if (s.kind === "wall") {
      const m = new THREE.Mesh(boxGeo, mat("#ffffff"));
      m.scale.set(s.hx * 2, thick, s.hz * 2); m.position.y = -thick / 2; g.add(m);
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(boxGeo, mat(s.stripe || "#ff5f5f"));
        st.scale.set(0.4, thick + 0.02, s.hz * 2 + 0.02); st.position.set(-s.hx + 0.5 + i * (s.hx - 0.5), -thick / 2, 0); g.add(st);
      }
    } else {
      const base = s.kind === "option" ? "#ffffff" : s.color || "#cccccc";
      const body = new THREE.Mesh(boxGeo, mat(shade(base, -0.2)));
      body.scale.set(s.hx * 2, thick, s.hz * 2); body.position.y = -thick / 2 - 0.05; g.add(body);
      const topm = new THREE.Mesh(boxGeo, mat(s.kind === "option" ? s.color : base));
      topm.scale.set(s.hx * 2 + 0.04, 0.22, s.hz * 2 + 0.04); topm.position.y = -0.11; g.add(topm);
      // 21차: 실제 3D 나선 코스용 고화질 마감 장식. 충돌체에는 영향 없음.
      if (s.hx > 0.7 && s.hz > 0.7 && s.kind !== "option") {
        const inset = new THREE.Mesh(boxGeo, new THREE.MeshPhongMaterial({color: shade(base, .26), shininess: 110, specular: "#ffffff"}));
        inset.scale.set(Math.max(0.8,s.hx*2-.42), .04, Math.max(0.8,s.hz*2-.42));
        inset.position.y = .035; g.add(inset);
        const gild = mat("#ffe7a2");
        for (const xx of [-1,1]) for (const zz of [-1,1]) {
          const corner = new THREE.Mesh(boxGeo,gild);
          corner.scale.set(.26,.10,.26);
          corner.position.set(xx*(s.hx-.12),.06,zz*(s.hz-.12)); g.add(corner);
        }
        if (s.kind === "pad" && s.hx < 4.5) {
          const emblem = new THREE.Mesh(new THREE.RingGeometry(.34,.49,20),new THREE.MeshBasicMaterial({color:"#ffffff",side:THREE.DoubleSide}));
          emblem.rotation.x=-Math.PI/2;emblem.position.y=.075;g.add(emblem);
        }
      }
      // 23차: 발판 모서리 마감띠 (시각 전용, 추가 충돌 없음).
      if(s.kind!=="option" && s.hx >= .85 && s.hz >= .85){
        const trimMat=new THREE.MeshLambertMaterial({color:shade(base,.50)});
        const sideMat=new THREE.MeshLambertMaterial({color:shade(base,-.36)});
        const W=s.hx*2, D=s.hz*2;
        for(const dz of [-1,1]){
          const lip=new THREE.Mesh(boxGeo,trimMat);
          lip.scale.set(W+.04,.105,.12);lip.position.set(0,-.205,dz*(s.hz-.065));g.add(lip);
          const lipShadow=new THREE.Mesh(boxGeo,sideMat);
          lipShadow.scale.set(W-.14,.055,.07);lipShadow.position.set(0,-.34,dz*(s.hz-.065));g.add(lipShadow);
        }
        for(const dx of [-1,1]){
          const lip=new THREE.Mesh(boxGeo,trimMat);
          lip.scale.set(.12,.105,D-.10);lip.position.set(dx*(s.hx-.065),-.205,0);g.add(lip);
        }
      }
      // 22차: 발판 표면을 완전히 덮지 않는 투명 문양 (마찰/충돌 무변경).
      if(s.kind !== "option" && s.hx > .7 && s.hz > .7){
        const style=s.crumble ? "stone" : (s.kind==="strip" ? "wood" : "star");
        const decal=new THREE.Mesh(topDecalGeo,topDecals[style]);
        decal.rotation.x=-Math.PI/2;
        decal.scale.set(Math.min(s.hx*1.2,2.5),Math.min(s.hz*1.2,2.5),1);
        decal.position.y=.094;
        g.add(decal);
      }
      // 4차 그래픽: 각 발판에 반짝이는 하이라이트와 금속/흰색 모서리 장식.
      // 장식은 충돌 판정을 바꾸지 않도록 기존 충돌체가 아닌 시각 요소로만 추가.
      const bright = (s.kind === "option" ? s.color : base) || "#5bc3ef";
      const rim = new THREE.Mesh(boxGeo, mat(shade(bright, 0.54)));
      rim.scale.set(s.hx * 2 + 0.16, 0.075, s.hz * 2 + 0.16);
      rim.position.y = -0.20; g.add(rim);
      // 모서리 고정 장식: 한 발판당 4개의 작은 반짝이는 코너 볼트
      if (s.kind !== "option" && s.hx >= 0.7 && s.hz >= 0.7) {
        for (const ix of [-1,1]) for (const iz of [-1,1]) {
          const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.115, 6, 4), mat("#fff1b8"));
          bolt.position.set(ix*(s.hx-0.24), 0.045, iz*(s.hz-0.24)); g.add(bolt);
        }
      }
      if (s.kind === "plaza" || s.kind === "goal") {
        const emblem = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.96, 24),
          new THREE.MeshBasicMaterial({color: s.kind === "goal" ? "#ffe35e" : "#ffffff", side:THREE.DoubleSide}));
        emblem.rotation.x = -Math.PI/2; emblem.position.y=0.11; g.add(emblem);
      }
      if (s.kind === "plaza" || s.kind === "strip" || s.kind === "goal") {
        // 체크무늬 테두리
        const edge = new THREE.Mesh(boxGeo, mat(shade(base, 0.45)));
        edge.scale.set(s.hx * 2 - 0.6, 0.06, s.hz * 2 - 0.6); edge.position.y = 0.01; g.add(edge);
      }
      if (s.kind === "bounce" || s.kind === "bouncy") {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(s.hx, s.hz) * 0.6, 0.12, 8, 24), mat("#ffffff"));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring);
        // 5차 그래픽: 점프대별 발광 엠블럼과 맥동하는 이중 링 (시각 효과 전용).
        const glowMat = new THREE.MeshBasicMaterial({ color: s.kind === "bounce" ? "#67f2ff" : "#ffe476", transparent:true, opacity:0.75, depthWrite:false, side:THREE.DoubleSide });
        const inner = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.47, 32), glowMat.clone());
        inner.rotation.x = -Math.PI/2; inner.position.y=0.13; g.add(inner);
        const pulse = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.76, 36), glowMat.clone());
        pulse.rotation.x = -Math.PI/2; pulse.position.y=0.15; g.add(pulse);
        const central = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.55, 4), mat("#fff9c1"));
        central.rotation.y=Math.PI/4; central.position.y=0.36; g.add(central);
        M.bounceFx.push({pulse, inner, central, phase:s.floor || 0});
        const arrow = textSprite(s.kind === "bounce" ? "점프대 ▲" : "통통!", { size: 46, bg: "#ff5fa2", color: "#fff" }, 0.7);
        arrow.position.y = 1.4; g.add(arrow);
      }
      // 24차: 작은 발판도 두께와 모서리를 알아보기 쉽도록 금속 마감 및 리벳 추가.
      // 메시 개수는 작은 발판당 4개, 광장·체크포인트당 8개로 제한한다.
      if (s.hx >= .65 && s.hz >= .65 && s.kind !== "option") {
        const longX=s.hx*2, longZ=s.hz*2;
        const edgeMat = s.kind === "bounce" ? hdEdgeGold : hdEdgeWhite;
        for (const side of [-1,1]) {
          const stripX=new THREE.Mesh(boxGeo,edgeMat);
          stripX.scale.set(longX,.095,.10);
          stripX.position.set(0,.045,side*(s.hz-.06));g.add(stripX);
          const stripZ=new THREE.Mesh(boxGeo,edgeMat);
          stripZ.scale.set(.10,.095,longZ);
          stripZ.position.set(side*(s.hx-.06),.045,0);g.add(stripZ);
        }
        // 중앙 원형 표식은 기존 데칼과 겹치지 않는 광장에만 배치.
        if (s.kind === "plaza") {
          const ring24=new THREE.Mesh(new THREE.TorusGeometry(Math.min(1.42,s.hx*.48),.075,6,32),hdEdgeGold);
          ring24.rotation.x=Math.PI/2;ring24.position.y=.085;g.add(ring24);
        }
        const dx=Math.max(.12,s.hx-.22),dz=Math.max(.12,s.hz-.22);
        for(const xx of [-dx,dx])for(const zz of [-dz,dz]){
          const bolt=new THREE.Mesh(hdBoltGeo,hdBoltMat);
          bolt.position.set(xx,.12,zz);g.add(bolt);
        }
      }
      if (s.kind === "option") {
        const num = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({
          map: canvasTexture(textCanvas(String(s.index + 1), { size: 120, color: "#fff", pad: 10, stroke: "rgba(0,0,0,.25)" })), transparent: true,
        }));
        num.rotation.x = -Math.PI / 2; num.rotation.z = Math.PI; num.position.y = 0.02; g.add(num);
        const label = textSprite("…", PAD_LABEL(s.index), 0.95);
        label.center.set(0.5, 0); label.position.y = 1.5; g.add(label);
        s.label = label;
        M.padLabels.push(s);
      }
    }
    g.position.set(s.cx, s.maxY, s.cz);
    g.rotation.y = s.theta;
    root.add(g);
    M.solidMesh.set(s, g);
  }
  // 25차: 체크포인트 광장의 하부 보강재와 장식용 원형 지지대.
  // 물리 충돌·발판 위치와 무관한 가벼운 렌더링 메시만 추가.
  const supportGold = new THREE.MeshPhongMaterial({color:0xe5b85f,specular:0xffedb0,shininess:75});
  const supportDark = new THREE.MeshLambertMaterial({color:0x617d98});
  const supportBeamGeo = new THREE.BoxGeometry(1,1,1);
  for (let f=0; f<=C.TOTAL; f+=5) {
    const pad=C.plazas[f]; if (!pad) continue;
    const support=new THREE.Group();
    const bracket=new THREE.Mesh(new THREE.CylinderGeometry(0.72,1.02,0.60,10),supportDark);
    bracket.position.y=-0.58;support.add(bracket);
    const trim=new THREE.Mesh(new THREE.TorusGeometry(.84,.09,6,20),supportGold);
    trim.rotation.x=Math.PI/2; trim.position.y=-.65; support.add(trim);
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2;
      const beam=new THREE.Mesh(supportBeamGeo,supportDark);
      beam.scale.set(.32,.26,Math.max(1,pad.hz*.7));
      beam.position.set(Math.sin(a)*(pad.hx*.43),-.41,Math.cos(a)*(pad.hz*.43));
      beam.rotation.y=a;support.add(beam);
    }
    support.position.set(pad.cx,pad.maxY,pad.cz);support.rotation.y=pad.theta;root.add(support);
  }
  // 24차: 5층 간격의 금빛 타워 장식 띠와 발광 표식. 기둥 반지름과 충돌체 불변.
  const levelBandGeo=new THREE.TorusGeometry(7.075,.085,6,48);
  const levelBandMat=new THREE.MeshPhongMaterial({color:0xe5b15b,specular:0xfff0c1,shininess:80});
  const gemGeo=new THREE.OctahedronGeometry(.23,0);
  const gemMat=new THREE.MeshBasicMaterial({color:0xffed9c});
  for(let f=5;f<=C.TOTAL;f+=5){
    const platform=C.plazas[f];if(!platform)continue;
    const y=platform.maxY-1.0;
    const band=new THREE.Mesh(levelBandGeo,levelBandMat);
    band.rotation.x=Math.PI/2;band.position.y=y;obbyDecor.add(band);
    for(let k=0;k<4;k++){
      const a=k*Math.PI/2+f*.11;
      const gem=new THREE.Mesh(gemGeo,gemMat);
      gem.position.set(7.33*Math.cos(a),y+.55,7.33*Math.sin(a));obbyDecor.add(gem);
    }
  }
  // 층 번호 표지판
  for (let f = 1; f <= C.TOTAL; f++) {
    const p = C.plazas[f];
    const sp = boardMesh(`↑ ${f}층`, { size: 64, bg: C.zones[p.zone].color, color: "#fff", stroke: "rgba(0,0,0,.2)" }, 0.9);
    const [x, z] = toWorld(p, -PLAZA / 2 + 0.4, -PLAZA / 2 + 0.4);
    sp.position.set(x, p.maxY + 2.6, z); sp.rotation.y = p.theta; root.add(sp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), mat("#555"));
    pole.position.set(x, p.maxY + 1.1, z); root.add(pole);
    M.floorSigns[f] = sp;
  }
  // 출발 표지
  {
    const p = C.plazas[0];
    const sp = boardMesh("출발!", { size: 70, bg: "#2fbf71", color: "#fff" }, 1.1);
    const [x, z] = toWorld(p, PLAZA / 2 - 0.4, -PLAZA / 2 + 0.4);
    sp.position.set(x, p.maxY + 2.7, z); sp.rotation.y = p.theta; root.add(sp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), mat("#555"));
    pole.position.set(x, p.maxY + 1.1, z); root.add(pole);
  }
  // 회전 막대
  for (const b of C.spinners) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(boxGeo, mat("#ff6a3d"));
    bar.scale.set(b.hx * 2, 0.5, b.hz * 2); g.add(bar);
    for (let i = -2; i <= 2; i++) {
      const st = new THREE.Mesh(boxGeo, mat("#ffffff"));
      st.scale.set(0.3, 0.52, b.hz * 2 + 0.02); st.position.x = i * 1.5; g.add(st);
    }
    // 5차 그래픽: 위험 회전봉을 장난감처럼 굵고 선명하게 표시.
    const warning = new THREE.Mesh(new THREE.TorusGeometry(0.5,0.115,8,24), mat("#ffde57"));
    warning.rotation.x=Math.PI/2; warning.position.y=0.30; g.add(warning);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.2, 12), mat("#284b8f"));
    hub.position.y = -0.4; g.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.39,0.39,0.12,16),mat("#fff2a6"));
    cap.position.y=0.29; g.add(cap);
    const rivetMat=mat("#ffe5a1");
    for (const x of [-3.3,-1.65,1.65,3.3]) {
      const rivet=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,6),rivetMat);
      rivet.position.set(x,0.31,0);g.add(rivet);
    }
    // 25차: 회전봉의 끝부분에 높은 대비의 보호 캡을 더해 위험 영역을 구분.
    for(const side of [-1,1]){
      const endCap=new THREE.Mesh(new THREE.SphereGeometry(.34,10,8),mat("#ffe48c"));
      endCap.position.set(side*Math.max(.35,b.hx-.18),0,0);g.add(endCap);
    }
    g.position.set(b.cx, b.maxY - 0.3, b.cz);
    root.add(g);
    M.spinnerMeshes.push({ b, g });
  }
  // 바람 발판: 옆에 선풍기, 바람 줄무늬
  for (const w of C.winds) {
    const s = w.pad, g = new THREE.Group();
    const fan = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 20), mat("#dfe6ee"));
    housing.rotation.z = Math.PI / 2; fan.add(housing);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Mesh(boxGeo, mat("#7cc4f5")); bl.scale.set(0.1, 2.1, 0.45);
      bl.rotation.x = (i / 3) * Math.PI * 2; blades.add(bl);
    }
    blades.position.x = -0.3 * w.side; fan.add(blades);
    fan.position.set(-w.side * (s.hx + 0.8), 1.3, 0);
    g.add(fan);
    const streaks = [];
    for (let i = 0; i < 8; i++) {
      const st = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
      st.scale.set(1.6, 0.06, 0.06); st.position.set(0, 0.5 + (i % 4) * 0.5, -2.4 + i * 0.68); g.add(st); streaks.push(st);
    }
    const sign = textSprite("바람 조심!", { size: 44, bg: "#2b6cb0", color: "#fff" }, 0.6);
    sign.position.set(-w.side * (s.hx + 0.8), 3.0, 0); g.add(sign);
    g.position.set(s.cx, s.maxY, s.cz); g.rotation.y = s.theta;
    root.add(g);
    M.windFx.push({ w, blades, streaks, g });
  }
  // 정상: 트로피
  {
    const s = C.goal, g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.5, 1.6, 16), mat("#ffd23f"));
    cup.position.y = 2.6; g.add(cup);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), mat("#e0b020")); stem.position.y = 1.4; g.add(stem);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), mat("#8a5a34")); base.position.y = 0.7; g.add(base);
    // 별빛 도착 게이트: 빛나는 원형 포털 + 양쪽 기둥 (시각용)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.24, 10, 40),
      new THREE.MeshPhongMaterial({color:"#81dcff", emissive:"#1264b6", shininess:95}));
    arch.position.y=3.1; g.add(arch);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.87, 40),
      new THREE.MeshBasicMaterial({color:"#2ddaff",transparent:true,opacity:0.28,depthWrite:false,side:THREE.DoubleSide}));
    inner.position.set(0,3.1,-0.15); g.add(inner);
    for (const side of [-1,1]) {
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.51,3.6,12),mat("#ceeafc"));
      tower.position.set(side*2.4,1.85,0);g.add(tower);
      const cap=new THREE.Mesh(new THREE.ConeGeometry(0.75,1.15,8),mat("#458cf5"));
      cap.position.set(side*2.4,4.2,0);g.add(cap);
    }
    // 25차: 정상의 결정형 장식과 오색 별빛 링 (시각 전용).
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.25,0),
        new THREE.MeshPhongMaterial({color:i%2?0xffe88a:0xa4f4ff,emissive:i%2?0x503509:0x09344d,shininess:95}));
      crystal.position.set(Math.cos(a)*2.65,3.05+Math.sin(a*2)*.30,Math.sin(a)*.38);
      g.add(crystal);
    }
    const innerHalo=new THREE.Mesh(new THREE.TorusGeometry(1.64,.07,8,48),
      new THREE.MeshBasicMaterial({color:0xfef7c8,transparent:true,opacity:.80,depthWrite:false}));
    innerHalo.position.y=3.1;g.add(innerHalo);
    const sp = textSprite("정상", { size: 70, bg: "#f2c94c", color: "#5a3d00" }, 1.2); sp.position.y = 4.6; g.add(sp);
    g.position.set(s.cx, s.maxY, s.cz); root.add(g);
    M.goalFx = g;
  }
  // 체크포인트 깃발
  {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), mat("#ffffff")); pole.position.y = 1.5; g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshLambertMaterial({ color: "#2fbf71", side: THREE.DoubleSide }));
    cloth.position.set(0.65, 2.55, 0); g.add(cloth);
    // 체크포인트 위치를 한눈에 알아보는 금색 바닥 링
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.86,.09,8,32),
      new THREE.MeshBasicMaterial({color:"#ffe37b",transparent:true,opacity:.7,depthWrite:false}));
    halo.rotation.x = -Math.PI/2; halo.position.y=.06; g.add(halo);
    const checkpointOuter = new THREE.Mesh(new THREE.TorusGeometry(1.10,.045,6,32),
      new THREE.MeshBasicMaterial({color:0x80fbea,transparent:true,opacity:.78,depthWrite:false}));
    checkpointOuter.rotation.x=-Math.PI/2;checkpointOuter.position.y=.075;g.add(checkpointOuter);
    const cpStar=new THREE.Mesh(new THREE.OctahedronGeometry(.22,0),
      new THREE.MeshBasicMaterial({color:0xfff2a4}));
    cpStar.position.set(0,3.2,0);g.add(cpStar);
    root.add(g); M.flag = g; M.flagCloth = cloth; M.flagHalo = halo;
  }
  // 구름
  const cloudM = new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.92 });
  M.clouds = [];
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(2 + (k % 2), 10, 8), cloudM);
      p.position.set(k * 2.2 - 3, Math.sin(k) * 0.6, (k % 2) * 1.2); c.add(p);
    }
    const a = i * 1.7, r = 45 + (i % 5) * 14;
    c.position.set(Math.cos(a) * r, 20 + ((i * 37) % (C.top + 30)), Math.sin(a) * r);
    c.userData = { a, r, sp: 0.01 + (i % 3) * 0.006 };
    root.add(c); M.clouds.push(c);
  }
  // 음악 단원: 떠다니는 음표
  if (unit.theme === "music") {
    const marks = ["♪", "♫", "♬", "♩"];
    for (let i = 0; i < 30; i++) {
      const sp = textSprite(marks[i % 4], { size: 120, color: ["#ff7eb3", "#9b8cf2", "#5cc1a6", "#f5a65b"][i % 4], pad: 4, stroke: "#fff" }, 2.2);
      const a = i * 2.1, r = 26 + (i % 4) * 5;
      sp.position.set(Math.cos(a) * r, 6 + ((i * 13) % C.top), Math.sin(a) * r);
      sp.userData = { y0: sp.position.y, ph: i };
      root.add(sp); M.notes.push({ note: sp });
    }
  }
  return M;
}

// 매 프레임: 움직이는 것들 모양 갱신
function animateWorldHD(C, M, t, dt) {
  for (const { b, g } of M.spinnerMeshes) g.rotation.y = b.theta;
  // 점프대 링 펄스는 시각 효과만 변경하며 실제 점프 힘은 그대로 유지.
  for (const fx of M.bounceFx) {
    const k=(t*1.5+fx.phase*0.21)%(Math.PI*2);
    const pulseSize=0.88+0.24*(0.5+0.5*Math.sin(k));
    fx.pulse.scale.set(pulseSize,pulseSize,pulseSize);
    fx.pulse.material.opacity=0.38+0.42*(0.5+0.5*Math.cos(k));
    fx.inner.material.opacity=0.65+0.25*Math.sin(k)*Math.sin(k);
    fx.central.position.y=0.36+0.09*Math.sin(k);
  }
  for (const m of C.movers) { const g = M.solidMesh.get(m.s); g.position.set(m.s.cx, m.s.maxY, m.s.cz); }
  for (const l of C.lifts) { const g = M.solidMesh.get(l.s); g.position.y = l.s.maxY; }
  for (const s of C.crumbles) {
    const g = M.solidMesh.get(s);
    if (!s.crumbleAt) { g.position.set(s.cx, s.maxY, s.cz); g.visible = true; g.rotation.z = 0; continue; }
    const e = t - s.crumbleAt;
    if (e < 0.6) { g.position.x = s.cx + Math.sin(e * 70) * 0.06; g.rotation.z = Math.sin(e * 50) * 0.03; }
    else if (e < 1.6) { g.position.y = s.maxY - 6 * (e - 0.6) * (e - 0.6); }
    else g.visible = false;
  }
  for (const fx of M.windFx) {
    const w = fx.w;
    fx.blades.rotation.x += dt * (w.on ? 22 : w.warn ? 6 : 1.5);
    fx.streaks.forEach((st, i) => {
      st.material.opacity = w.on ? 0.75 : 0;
      if (w.on) st.position.x = (((t * 9 + i * 1.3) % 8) - 4) * w.side;
    });
  }
  for (const b of C.bouncies) {
    const g = M.solidMesh.get(b);
    const k = b.squash ? Math.max(0, 1 - (t - b.squash) * 4) : 0;
    g.scale.y = 1 - 0.35 * Math.sin(k * Math.PI);
  }
  for (const gm of M.gateMeshes) {
    if (!gm) continue;
    if (gm.opening) {
      gm.open = Math.min(1, gm.open + dt * 1.4);
      gm.wall.material.opacity = 0.55 * (1 - gm.open);
      gm.wall.scale.y = Math.max(0.01, 1 - gm.open);
      gm.sign.material.opacity = 1 - gm.open;
      if (gm.open >= 1) gm.group.visible = false;
    } else gm.wall.material.opacity = 0.45 + Math.sin(t * 4) * 0.12;
  }
  if (M.goalFx) M.goalFx.rotation.y = t * 0.6;
  for (const c of M.clouds) {
    c.userData.a += c.userData.sp * dt;
    c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r;
  }
  for (const n of M.notes) {
    if (n.note) n.note.position.y = n.note.userData.y0 + Math.sin(t + n.note.userData.ph) * 0.8;
    if (n.wave) { const k = 1 + ((t * 0.08 + n.i / 3) % 1) * 0.15; n.wave.scale.setScalar(k); n.wave.material.opacity = 0.5 * (1 - ((t * 0.08 + n.i / 3) % 1)); }
  }
  if (M.flagCloth) M.flagCloth.rotation.y = Math.sin(t * 5) * 0.25;
}

function setGateOpen(M, zi, animate) {
  const gm = M.gateMeshes[zi];
  if (!gm) return;
  if (animate) gm.opening = true;
  else { gm.opening = true; gm.open = 1; gm.group.visible = false; }
}
function resetGateMesh(M, zi) {
  const gm = M.gateMeshes[zi];
  if (!gm) return;
  gm.opening = false; gm.open = 0; gm.group.visible = true; gm.wall.scale.y = 1; gm.sign.material.opacity = 1;
}

// 정답 발판 글자 바꾸기 (null이면 빈 발판)
function setPadLabel(s, text) {
  if (!s.label) return;
  s.label.visible = !!text;
  if (text && s.label.userData.text !== text) {
    setSpriteText(s.label, text, PAD_LABEL(s.index));
    s.label.userData.text = text;
  }
}

// ===================================================================
// 캐릭터 16종 (첨부 「캐릭터 선택」 그림 바탕, 머리가 큰 귀여운 모양)
//   body 색이 캐릭터를 구분하는 열쇠예요 (방 기록·친구 화면에 이 색이 저장됨)
// ===================================================================

// ===================================================================
// 맵 고르기: "hd" = 30층 고화질 맵 / "stage" = 스테이지 6종 맵(예전 맵)
//   선생님 화면 「맵 선택」에서 바꾸면 모든 학생·TV 화면에 바로 반영
// ===================================================================
const MAP_STYLES = { hd: "30층 고화질 맵", stage: "스테이지 6종 맵" };
let MAP_STYLE = (() => { const q = new URLSearchParams(location.search).get("map"); return q === "stage" || q === "hd" ? q : "hd"; })();
function makeScene(renderer) { return makeSceneStage(renderer); }
function buildWorldMeshes(scene, C) {
  const style = MAP_STYLE === "stage" ? "stage" : "hd";
  const M = style === "stage" ? buildWorldMeshesStage(scene, C) : buildWorldMeshesHD(scene, C);
  M.style = style;
  buildCourseFx(M, C);
  const U = scene.userData;
  if (style === "hd" && U && U.skyMat) {   // 고화질 맵: 늘 맑은 하늘
    U.skyMat.uniforms.top.value.set("#5aa8ec"); U.skyMat.uniforms.bottom.value.set("#d9f1ff");
    scene.fog.color.set("#bfe6ff"); U.hemi.color.set("#ffffff"); U.hemi.groundColor.set("#7a8a6a"); U.sun.color.set("#fff6e0");
    U.stars.material.opacity = 0;
  }
  return M;
}
function animateWorld(C, M, t, dt) {
  animateCourseFx(C, M, t, dt);
  if (M.style === "stage") animateWorldStage(C, M, t, dt);
  else { animateWorldHD(C, M, t, dt); const U = scene && scene.userData; if (U && U.sky) { U.sky.position.copy(camera.position); U.stars.position.copy(camera.position); } }
}

const AVATARS = [
  { name: "파란 후드 소년", body: "#2f6fdc" },
  { name: "분홍 후드 소녀", body: "#ff7fb0" },
  { name: "초록 공룡 후드", body: "#3fbf55" },
  { name: "노란 리본 소녀", body: "#ffc93c" },
  { name: "하얀 과학자", body: "#7cc4f5" },
  { name: "보라 고양이", body: "#8b5cf6" },
  { name: "빨간 모자", body: "#e23b3b" },
  { name: "탐험가 소녀", body: "#b07a4f" },
  { name: "우주비행사", body: "#4a8fe8" },
  { name: "토끼 후드", body: "#ffb3cf" },
  { name: "판다 후드", body: "#4b4f5c" },
  { name: "마법사", body: "#6a3fd0" },
  { name: "기사", body: "#d4a72c" },
  { name: "닌자", body: "#2a2a35" },
  { name: "로봇", body: "#3ec8f0" },
  { name: "체육소년", body: "#f05a28" },
];
const AVATAR_NAMES = AVATARS.map((a) => a.name);
const SKIN_COLORS = AVATARS.map((a) => a.body);
const AVATAR_IMG = (i) => `assets/avatars/av_${String(i + 1).padStart(2, "0")}.jpg`;

// ---------- 캐릭터: 그림(앞·옆·뒤)을 3D 세상에 세워서 보여줌 ----------
// assets/chars/ch_XX.png = [앞(동작 포즈) | 옆 | 뒤 | 앞(서 있기)] 4칸
const CHAR_MAT = {};
function charMaterial(i) {
  if (CHAR_MAT[i]) return CHAR_MAT[i];
  const tex = new THREE.TextureLoader().load(`assets/chars/ch_${String(i + 1).padStart(2, "0")}.webp`);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
  return (CHAR_MAT[i] = m);
}
const CHAR_W = 2.0, CHAR_H = 2.5;
function setCharFrame(av, frame, mirror) {
  if (av.frame === frame && av.mirror === mirror) return;
  av.frame = frame; av.mirror = mirror;
  const uv = av.mesh.geometry.attributes.uv, u0 = frame / 4 + 0.002, u1 = (frame + 1) / 4 - 0.002;
  const L = mirror ? u1 : u0, R = mirror ? u0 : u1;
  uv.setXY(0, L, 1); uv.setXY(1, R, 1); uv.setXY(2, L, 0); uv.setXY(3, R, 0);
  uv.needsUpdate = true;
}
function makeAvatarSprite(color, name, opts = {}) {
  let ai = SKIN_COLORS.indexOf(color);
  if (ai < 0) ai = 0;
  const group = new THREE.Group(), inner = new THREE.Group();
  group.add(inner);
  const geo = new THREE.PlaneGeometry(CHAR_W, CHAR_H); geo.translate(0, CHAR_H / 2, 0);
  const mesh = new THREE.Mesh(geo, charMaterial(ai));
  mesh.renderOrder = 1;
  inner.add(mesh);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  let tag = null;
  if (name) {
    tag = textSprite(name, { size: 48, bg: "rgba(20,40,90,.82)", color: "#fff", pad: 14, border: "#ffffff" }, opts.tagH || 0.55);
    tag.position.y = 3.05; group.add(tag);
  }
  const av = { group, inner, mesh, blob, tag, walk: Math.random() * 6, color, styleIndex: ai, frame: -1, mirror: null };
  setCharFrame(av, 0, false);
  return av;
}
const _wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function animateAvatarSprite(av, dt, hs, grounded, extra = {}) {
  const k = Math.min(1, dt * 12);
  const g = av.group.position, facing = av.group.rotation.y;
  // 카메라 쪽을 보게 세우고, 보는 방향에 따라 앞·옆·뒤 그림 고르기
  //  (36차) 경계에서 그림이 깜빡이지 않게: 여유 각도(히스테리시스) + 0.18초 이상 같은 쪽일 때만 바꿈
  const camYaw = camera ? Math.atan2(camera.position.x - g.x, camera.position.z - g.z) : facing;
  const rel = _wrapA(camYaw - facing), ar = Math.abs(rel);
  const H = 0.22;
  let view = av.view || "back";
  if (view === "front") { if (ar > 0.85 + H) view = "side"; }
  else if (view === "back") { if (ar < 2.3 - H) view = "side"; }
  else { if (ar < 0.85 - H) view = "front"; else if (ar > 2.3 + H) view = "back"; }
  const side = view === "side" ? (rel < 0) : false;
  if (view !== av.wantView || side !== av.wantSide) { av.wantView = view; av.wantSide = side; av.viewT = 0; }
  av.viewT = (av.viewT || 0) + dt;
  if (av.view === undefined || av.viewT > 0.18) { av.view = av.wantView; av.side = av.wantSide; }
  // 앞모습: 걷는 중이면 "서 있기" 그림, 멈추거나 공중·응원이면 "동작 포즈" (0.25초 넘게 이어질 때만 바꿈)
  const posey = !!extra.cheer || hs < 0.08 || !grounded;
  if (posey !== av.wantPose) { av.wantPose = posey; av.poseT = 0; }
  av.poseT = (av.poseT || 0) + dt;
  if (av.pose === undefined || av.poseT > 0.35) av.pose = av.wantPose;
  if (av.view === "front") setCharFrame(av, av.pose ? 0 : 3, false);
  else if (av.view === "back") setCharFrame(av, 2, false);
  else setCharFrame(av, 1, av.side);
  av.inner.rotation.y = camYaw - facing;
  // 걷기: 통통 튀고 살짝 기우뚱 / 점프: 웅크렸다 늘어남 / 착지: 꾹 눌림 / 응원: 깡충
  if (grounded) av.walk += dt * (hs > 0.05 ? 9 + hs * 5 : 2);
  if (av.wasGrounded && !grounded) av.takeoff = 0.12;
  if (av.wasGrounded === false && grounded) av.landFX = 0.16;
  av.wasGrounded = grounded;
  av.takeoff = Math.max(0, (av.takeoff || 0) - dt); av.landFX = Math.max(0, (av.landFX || 0) - dt);
  let bob = 0, lean = 0, sy = 1, sx = 1;
  if (grounded && hs > 0.08) { bob = Math.abs(Math.sin(av.walk)) * 0.12 * hs; lean = Math.sin(av.walk) * 0.06 * hs; sy = 1 - Math.abs(Math.cos(av.walk)) * 0.035 * hs; }
  else if (grounded) { sy = 1 + Math.sin(av.walk * 1.5) * 0.012; }
  else { const vy = extra.verticalSpeed; sy = vy === undefined ? 1.05 : vy > 2 ? 1.09 : vy < -4 ? 1.03 : 1.05; sx = 2 - sy; }
  if (av.takeoff > 0) { const t = av.takeoff / 0.12; sy = 1.12 - 0.04 * t; sx = 0.9; }
  if (av.landFX > 0) { const t = Math.sin((av.landFX / 0.16) * Math.PI); sy = 1 - 0.16 * t; sx = 1 + 0.12 * t; bob = 0; }
  if (extra.cheer) { bob = Math.abs(Math.sin(extra.cheer * 7)) * 0.45; sy = 1 + Math.sin(extra.cheer * 14) * 0.04; }
  if (extra.tilt) lean += extra.tilt * 0.6;
  const m = av.mesh, kk = av.landFX > 0 || av.takeoff > 0 ? Math.min(1, dt * 30) : k;
  m.position.y += (bob - m.position.y) * k;
  m.rotation.z += (lean - m.rotation.z) * k;
  m.scale.y += (sy - m.scale.y) * kk; m.scale.x += (sx - m.scale.x) * kk;
}


// ===================================================================
// 33차: 캐릭터 방식 3가지 (비교용) — ?chars=sprite | block | sheet3d
//   sprite  : 캐릭터 시트 그림을 세워 보여 줌 (32차)
//   block   : 올려 주신 패키지의 네모 블록형 3D 사람
//   sheet3d : 캐릭터 시트 16종을 블록형 3D로 (얼굴은 시트 그림, 팔다리가 움직임)
// ===================================================================
let CHAR_MODE = (() => { const q = new URLSearchParams(location.search).get("chars"); return ["sprite", "block", "sheet3d"].includes(q) ? q : "sprite"; })();
function makeAvatar(color, name, opts = {}) {
  let ai = SKIN_COLORS.indexOf(color); if (ai < 0) ai = 0;
  const av = CHAR_MODE === "block" ? makeAvatarPkg(PKG_COLORS[ai], name, opts) : CHAR_MODE === "sheet3d" ? makeAvatarSheet3D(ai, name, opts) : makeAvatarSprite(color, name, opts);
  av.mode = CHAR_MODE; av.color = color; return av;
}
function animateAvatar(av, dt, hs, grounded, extra = {}) {
  if (av.mode === "sprite" || !av.mode && av.mesh) animateAvatarSprite(av, dt, hs, grounded, extra);
  else animateAvatarBlock(av, dt, hs, grounded, extra);
}

// ---------- 패키지 블록형 (올려 주신 world.js 그대로) ----------
const PKG_NAMES = ["빨강 탐험가", "주황 모험가", "노랑 탐험가", "초록 공룡", "민트 요정", "파랑 히어로", "우주 탐험가", "보라 마법사", "분홍 고양이", "회색 로봇", "하늘 수호자", "라임 개구리", "산호 토끼", "남색 닌자", "금빛 발명가", "자주 왕관"];
const PKG_COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9", "#4dabf7", "#748ffc", "#da77f2", "#f783ac", "#adb5bd", "#74c0fc", "#a9e34b", "#ff8787", "#364fc7", "#fcc419", "#be4bdb"];
function pkgFaceTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffd9b3"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#1d2433"; g.fillRect(16, 24, 8, 10); g.fillRect(40, 24, 8, 10);
  g.fillStyle = "#e8737a"; g.fillRect(24, 44, 16, 4);
  g.fillStyle = "rgba(255,120,120,.35)"; g.fillRect(8, 38, 10, 5); g.fillRect(46, 38, 10, 5);
  const t = canvasTexture(c); t.magFilter = THREE.NearestFilter;
  return t;
}
let _pkgFace = null;
function makeAvatarPkg(color, name, opts = {}) {
  _pkgFace = _pkgFace || pkgFaceTexture();
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const body = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: shade(color, -0.35) });
  const skin = new THREE.MeshLambertMaterial({ color: "#ffd9b3" });
  const faceM = new THREE.MeshLambertMaterial({ map: _pkgFace });
  const group = new THREE.Group(), inner = new THREE.Group();
  group.add(inner);
  const legL = new THREE.Group(), legR = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  const leg = () => { const m = box(0.3, 0.75, 0.32, dark); m.position.y = -0.37; return m; };
  legL.add(leg()); legR.add(leg());
  legL.position.set(-0.18, 0.78, 0); legR.position.set(0.18, 0.78, 0);
  const torso = box(0.78, 0.8, 0.44, body); torso.position.y = 1.18;
  const arm = () => { const m = box(0.22, 0.72, 0.26, body); m.position.y = -0.32; const h = box(0.2, 0.18, 0.22, skin); h.position.y = -0.74; const g = new THREE.Group(); g.add(m, h); return g; };
  armL.add(arm()); armR.add(arm());
  armL.position.set(-0.52, 1.5, 0); armR.position.set(0.52, 1.5, 0);
  const head = box(0.62, 0.6, 0.6, [skin, skin, dark, skin, faceM, skin]);
  head.position.y = 1.9;
  const hair = box(0.66, 0.16, 0.64, dark); hair.position.y = 2.22;
  inner.add(legL, legR, torso, armL, armR, head, hair);
  const ai = Math.max(0, PKG_COLORS.indexOf(color));
  const deco = new THREE.MeshLambertMaterial({color: ["#fff1a3", "#ffffff", "#ffb3c7", "#c5f6fa"][ai % 4]});
  const hat = box(.76,.18,.75, ai % 3 === 0 ? dark : deco);
  if ([0,1,2,5,6,8,10,13,14].includes(ai)) { hat.position.set(0,2.3,0); inner.add(hat); }
  if ([3,7,9,11,12,15].includes(ai)) { const ear1 = box(.17,.34,.2,deco), ear2 = ear1.clone(); ear1.position.set(-.22,2.46,0); ear2.position.set(.22,2.46,0); inner.add(ear1,ear2); }
  if ([4,6,9,10,14].includes(ai)) { const badge = box(.22,.2,.07,deco); badge.position.set(0,1.26,.26); inner.add(badge); }
  if ([5,7,13,15].includes(ai)) { const cape = box(.68,.8,.07,deco); cape.position.set(0,1.1,-.29); inner.add(cape); }
  const accent = new THREE.MeshPhongMaterial({color: ["#ffdc72", "#9cf2ff", "#fff1ad", "#fda9dd"][ai % 4], shininess:85});
  const addBall = (r, x, y, z, material=accent) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material); m.position.set(x,y,z); inner.add(m); return m; };
  if ([3,11].includes(ai)) { addBall(.13,-.24,2.48,.10); addBall(.13,.24,2.48,.10); for (let j=0;j<3;j++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(.16,.28,5),accent); spike.rotation.x = Math.PI/2; spike.position.set(0,1.55-j*.37,-.33); inner.add(spike); } }
  if ([8,12].includes(ai)) { for(const dir of [-1,1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(.17, ai===12?.57:.39, 5),accent); ear.position.set(dir*.23,2.58,0); inner.add(ear); } }
  if ([6,9,10].includes(ai)) { const visor = box(.56,.19,.08,new THREE.MeshPhongMaterial({color: ai===9?"#9bfef8":"#b1f5ff", shininess:100})); visor.position.set(0,1.96,.35); inner.add(visor); const antenna = box(.055,.32,.055,accent); antenna.position.set(0,2.53,0); inner.add(antenna); addBall(.095,0,2.71,0); }
  if ([7,15].includes(ai)) { const crown = new THREE.Mesh(new THREE.ConeGeometry(.39,.62, ai===7?7:5),accent); crown.position.set(0,2.57,0); inner.add(crown); }
  if ([0,1,2,14].includes(ai)) { const pack = box(.56,.61,.18,accent);pack.position.set(0,1.23,-.34);inner.add(pack); }
  const trim = new THREE.MeshPhongMaterial({ color: ["#ffe082", "#b9ecff", "#ffd2f3", "#aff2bf"][ai%4], shininess: 92 });
  const sole = new THREE.MeshLambertMaterial({ color: "#f4f7ff" });
  const beltMat = new THREE.MeshLambertMaterial({ color: "#27334e" });
  for(const [side, pivot] of [[-1,legL],[1,legR]]) { const shoe = box(.33,.15,.47,sole); shoe.position.set(0,-.72,.07); pivot.add(shoe); const stripe = box(.31,.07,.035,trim); stripe.position.set(0,-.70,.31); pivot.add(stripe); const cuff = box(.34,.075,.34,trim); cuff.position.set(0,-.12,0); pivot.add(cuff); }
  const belt = box(.8,.085,.48,beltMat); belt.position.y=.86; inner.add(belt);
  const chest = box(.22,.20,.035,trim); chest.position.set(0,1.31,.245); inner.add(chest);
  const collar = box(.67,.11,.52,trim); collar.position.set(0,1.61,0); inner.add(collar);
  const zipper = box(.038,.38,.035,sole); zipper.position.set(0,1.28,.257);inner.add(zipper);
  if ([0,1,2,5,10,14].includes(ai)) { for(const x of [-.20,.20]) { const lens = new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.055,10),new THREE.MeshPhongMaterial({color:"#56d6ff",shininess:110})); lens.rotation.x=Math.PI/2;lens.position.set(x,2.34,.29);inner.add(lens); } }
  if ([4,8,12].includes(ai)) { const knot = new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),trim);knot.position.set(.26,2.33,.1);inner.add(knot); for(const dir of [-1,1]) {const wing=box(.18,.14,.055,trim); wing.rotation.z=dir*.38;wing.position.set(.26+dir*.13,2.34,.1);inner.add(wing);} }
  if ([6,9,10].includes(ai)) { for(const dir of [-1,1]) {const pod=box(.14,.28,.22,trim);pod.position.set(dir*.38,2.0,0);inner.add(pod);} }
  if ([13].includes(ai)) { const mask = box(.60,.16,.05,beltMat);mask.position.set(0,1.83,.33);inner.add(mask); }
  if ([7,15].includes(ai)) { const jewel=new THREE.Mesh(new THREE.OctahedronGeometry(.13),trim);jewel.position.set(0,1.30,.33);inner.add(jewel); }
  const hairMat = new THREE.MeshLambertMaterial({color: ["#6b3e2b","#e77298","#243b29","#f4c661","#b8dffd","#382c59","#ad2c25","#8e5e42"][ai%8]});
  if (![6,9,10,11,13].includes(ai)) {
    for (let j=0;j<3;j++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(.12 + j*.014,.24 + (j%2)*.055,5), hairMat); tuft.position.set(-.20+j*.20,2.36,.12); tuft.rotation.z=.24-j*.20; inner.add(tuft); }
    for (const dir of [-1,1]) { const sideHair=box(.085,.21,.40,hairMat);sideHair.position.set(dir*.33,2.04,-.04);inner.add(sideHair); }
  }
  if (![6,9,10,13].includes(ai)) { const fringe=box(.54,.085,.065,hairMat); fringe.position.set(0,2.15,.328);inner.add(fringe); }
  return blockFinish({ group, inner, legL, legR, armL, armR, head, styleIndex: ai }, name, opts);
}
function blockFinish(av, name, opts) {
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  let tag = null;
  if (name) { tag = textSprite(name, { size: 48, bg: "rgba(20,40,90,.82)", color: "#fff", pad: 14, border: "#ffffff" }, opts.tagH || 0.55); tag.position.y = 3.05; av.group.add(tag); }
  return Object.assign(av, { blob, tag, walk: 0, wasGrounded: true, landingFX: 0, animTime: 0 });
}
function animateAvatarBlock(av, dt, hs, grounded, extra = {}) {
  const k = Math.min(1, dt * 12);
  const variant = (av.styleIndex || 0) % 4;
  const stride = [0.78, 0.68, 0.9, 0.72][variant];
  const pace = [10, 12, 9, 11][variant];
  const pose = { legL: 0.35, legR: -0.35, armL: -0.4, armR: 0.4 };
  if (grounded) {
    av.walk += dt * (hs > .05 ? hs * pace : 1.4);
    const sw = Math.sin(av.walk) * stride * hs;
    pose.legL = sw; pose.legR = -sw; pose.armL = -sw * .85; pose.armR = sw * .85;
  } else {
    const falling = typeof extra.verticalSpeed === "number" && extra.verticalSpeed < -1;
    pose.legL = falling ? -.18 : .46; pose.legR = falling ? .35 : -.42;
    pose.armL = falling ? -.8 : -1.45 - variant * .08; pose.armR = falling ? .8 : -1.35 - variant * .07;
  }
  if (extra.cheer) { pose.armL = -2.9 + Math.sin(extra.cheer * 9) * 0.3; pose.armR = -2.9 - Math.sin(extra.cheer * 9) * 0.3; }
  for (const n of ["legL", "legR", "armL", "armR"]) av[n].rotation.x += (pose[n] - av[n].rotation.x) * k;
  const turnLean = grounded && hs > .25 ? Math.sin(av.walk * .5) * .035 : 0;
  av.inner.rotation.z += (turnLean - av.inner.rotation.z) * k;
  av.inner.rotation.x += ((extra.tilt || 0) - av.inner.rotation.x) * k;
  av.inner.rotation.y += ((extra.spin || 0) - av.inner.rotation.y) * k;
  if (av.wasGrounded === false && grounded) av.landingFX = .13;
  av.wasGrounded = grounded;
  av.landingFX = Math.max(0, (av.landingFX || 0) - dt);
  const squash = av.landingFX > 0 ? Math.sin((av.landingFX / .13) * Math.PI) * .075 : 0;
  const pre = !grounded && extra.verticalSpeed > 1 ? .025 : 0;
  av.inner.scale.y += (1 - squash + pre - av.inner.scale.y) * k;
  av.inner.scale.x += (1 + squash * .42 - av.inner.scale.x) * k;
  av.inner.scale.z += (1 + squash * .42 - av.inner.scale.z) * k;
  const cheerBounce = extra.cheer ? Math.abs(Math.sin(extra.cheer * 8)) * .11 : 0;
  const bob = cheerBounce + (grounded && hs > .1 ? Math.abs(Math.sin(av.walk)) * .07 * hs : (!grounded ? .035 : 0));
  av.inner.position.y += (bob - av.inner.position.y) * k;
}

// ---------- 캐릭터 시트 16종을 블록형 3D로 ----------
//  top: 윗옷, acc: 포인트색, pants: 바지(skirt면 치마), shoe, hair, long: 긴 머리, x: 소품
const SHEET3D = [
  { top: "#ffffff", acc: "#2f6fdc", pants: "#1f2533", shoe: "#2f6fdc", hair: "#6b3e22", x: ["goggles", "pack"] },
  { top: "#ffd1e3", acc: "#ff7fb0", pants: "#ff9cc3", skirt: 1, shoe: "#ff7fb0", hair: "#ff8fbf", long: 1, x: ["catphones", "pack"] },
  { top: "#2f9e44", acc: "#8ce99a", pants: "#1f2533", shoe: "#2f9e44", hair: "#2b2b2b", x: ["dino", "pack"] },
  { top: "#fff3bf", acc: "#ffc93c", pants: "#ffd43b", skirt: 1, shoe: "#ffc93c", hair: "#ffd25e", long: 1, x: ["bow", "pack"] },
  { top: "#ffffff", acc: "#4dabf7", pants: "#1f2533", shoe: "#74c0fc", hair: "#e9ecef", x: ["goggles", "flask", "coat"] },
  { top: "#2b2140", acc: "#8b5cf6", pants: "#8b5cf6", skirt: 1, shoe: "#5f3dc4", hair: "#2b2140", long: 1, x: ["catphones", "pack"] },
  { top: "#1d1d24", acc: "#e23b3b", pants: "#1d1d24", shoe: "#e23b3b", hair: "#e03131", x: ["cap", "pack"] },
  { top: "#f3e3cf", acc: "#b07a4f", pants: "#c9a27a", shoe: "#f8f1e7", hair: "#8e5e42", long: 1, x: ["buns", "pack"] },
  { top: "#ffffff", acc: "#4a8fe8", pants: "#ffffff", shoe: "#4a8fe8", hair: "#6b3e22", x: ["helmet", "pack"] },
  { top: "#ffd6e7", acc: "#ff8fbf", pants: "#ffb3cf", skirt: 1, shoe: "#ff8fbf", hair: "#ff9cc8", long: 1, x: ["bunny", "pack"] },
  { top: "#ffffff", acc: "#1d1d24", pants: "#1d1d24", shoe: "#1d1d24", hair: "#3a2a20", x: ["panda", "pack"] },
  { top: "#4c2a99", acc: "#ffd43b", pants: "#6a3fd0", skirt: 1, shoe: "#4c2a99", hair: "#2b2140", long: 1, x: ["wizard", "staff"] },
  { top: "#cfd8e8", acc: "#d4a72c", pants: "#9aa7bd", shoe: "#cfd8e8", hair: "#ffd25e", x: ["knight", "cape", "sword"] },
  { top: "#1d1d24", acc: "#e03131", pants: "#1d1d24", shoe: "#1d1d24", hair: "#1d1d24", x: ["ninja", "sword"] },
  { top: "#a5d8ff", acc: "#1c7ed6", pants: "#74c0fc", shoe: "#1c7ed6", hair: null, x: ["robot"] },
  { top: "#e03131", acc: "#ffffff", pants: "#1d1d24", shoe: "#ffffff", hair: "#6b3e22", x: ["headband", "pack", "num10"] },
];
let _sheetFaces = null, _faceLoaded = false;
const _sheetFaceMat = {}, _faceClones = [];
function sheetFaceMat(i) {
  if (_sheetFaceMat[i]) return _sheetFaceMat[i];
  if (!_sheetFaces) {
    _sheetFaces = new THREE.TextureLoader().load("assets/chars/faces.jpg", () => { _faceLoaded = true; _faceClones.forEach((t) => (t.needsUpdate = true)); });
    _sheetFaces.colorSpace = THREE.SRGBColorSpace;
  }
  const t = _sheetFaces.clone(); t.repeat.set(0.25, 0.25); t.offset.set((i % 4) * 0.25, 1 - 0.25 - Math.floor(i / 4) * 0.25);
  if (_faceLoaded) t.needsUpdate = true; else _faceClones.push(t);
  return (_sheetFaceMat[i] = new THREE.MeshLambertMaterial({ map: t }));
}
function numTex(n, bg, fg) {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 64, 64); g.fillStyle = fg; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(n, 32, 36);
  return canvasTexture(c);
}
function makeAvatarSheet3D(ai, name, opts = {}) {
  const S = SHEET3D[ai] || SHEET3D[0];
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const Ph = (c, sh = 80) => new THREE.MeshPhongMaterial({ color: c, shininess: sh });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const topM = L(S.top), accM = L(S.acc), pantsM = L(S.pants), shoeM = L(S.shoe), skinM = L("#ffd9b3"), soleM = L("#f4f7ff");
  const hairM = S.hair ? L(S.hair) : L(S.acc);
  const group = new THREE.Group(), inner = new THREE.Group(); group.add(inner);
  const legL = new THREE.Group(), legR = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  const leg = () => { const g = new THREE.Group(); const m = box(0.3, 0.6, 0.32, pantsM); m.position.y = -0.3; g.add(m); const sk = box(0.29, 0.12, 0.31, skinM); sk.position.y = -0.62; if (S.skirt) g.add(sk); const sh = box(0.34, 0.2, 0.48, shoeM); sh.position.set(0, -0.72, 0.06); g.add(sh); const so = box(0.35, 0.06, 0.49, soleM); so.position.set(0, -0.83, 0.06); g.add(so); return g; };
  legL.add(leg()); legR.add(leg());
  legL.position.set(-0.18, 0.86, 0); legR.position.set(0.18, 0.86, 0);
  const torso = box(0.8, 0.78, 0.46, topM); torso.position.y = 1.24; inner.add(torso);
  // 포인트: 소매·밑단·가운데 줄
  const hem = box(0.82, 0.12, 0.48, accM); hem.position.y = 0.9; inner.add(hem);
  const stripe = box(0.14, 0.62, 0.02, accM); stripe.position.set(0, 1.26, 0.235); if (!S.x.includes("num10")) inner.add(stripe);
  if (S.skirt) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 0.36, 8), pantsM); sk.position.y = 0.72; inner.add(sk); }
  const arm = (side) => { const g = new THREE.Group(); const m = box(0.24, 0.64, 0.28, topM); m.position.y = -0.3; const cuff = box(0.26, 0.12, 0.3, accM); cuff.position.y = -0.58; const h = box(0.22, 0.18, 0.24, skinM); h.position.y = -0.72; g.add(m, cuff, h); return g; };
  armL.add(arm(-1)); armR.add(arm(1));
  armL.position.set(-0.53, 1.56, 0); armR.position.set(0.53, 1.56, 0);
  inner.add(legL, legR, armL, armR);
  // 머리: 앞면은 캐릭터 시트의 얼굴 그림
  const head = box(0.74, 0.7, 0.66, [hairM, hairM, hairM, skinM, sheetFaceMat(ai), hairM]);
  head.position.y = 2.0; inner.add(head);
  if (S.hair) { const top = box(0.8, 0.16, 0.72, hairM); top.position.set(0, 2.38, -0.02); inner.add(top); }
  if (S.long) { const back = box(0.82, 0.9, 0.18, hairM); back.position.set(0, 1.78, -0.36); inner.add(back); }
  const at = (m, x, y, z) => { m.position.set(x, y, z); inner.add(m); return m; };
  const ball = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
  for (const it of S.x) switch (it) {
    case "pack": at(box(0.56, 0.6, 0.22, accM), 0, 1.26, -0.35); break;
    case "goggles": { const band = box(0.8, 0.09, 0.7, L("#1f2533")); at(band, 0, 2.3, 0); for (const sx of [-0.18, 0.18]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), Ph(ai === 4 ? "#4dabf7" : "#56d6ff", 120)); l.rotation.x = Math.PI / 2 - 0.4; at(l, sx, 2.36, 0.3); } } break;
    case "catphones": { const band = box(0.84, 0.08, 0.16, accM); at(band, 0, 2.42, 0); for (const sx of [-1, 1]) { at(box(0.12, 0.3, 0.3, accM), sx * 0.43, 2.02, 0); const e = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), accM); e.rotation.y = Math.PI / 4; at(e, sx * 0.24, 2.6, 0); } } break;
    case "dino": { const hood = box(0.86, 0.82, 0.74, topM); at(hood, 0, 2.06, -0.06); for (let j = 0; j < 4; j++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 4), L(S.acc)); sp.rotation.x = -0.3 - j * 0.35; at(sp, 0, 2.5 - j * 0.12, 0.1 - j * 0.24); } at(box(0.2, 0.1, 0.08, L("#ffffff")), -0.22, 2.44, 0.34); at(box(0.2, 0.1, 0.08, L("#ffffff")), 0.22, 2.44, 0.34); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), topM); tail.rotation.x = -1.9; at(tail, 0, 0.85, -0.45); } break;
    case "bow": { const knot = box(0.16, 0.16, 0.12, accM); at(knot, 0, 2.5, 0.1); for (const sx of [-1, 1]) { const w = box(0.3, 0.24, 0.08, accM); w.rotation.z = sx * 0.3; at(w, sx * 0.22, 2.52, 0.1); } } break;
    case "flask": { const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), Ph("#4dabf7", 120)); f.position.set(0, -0.86, 0.06); armR.add(f); } break;
    case "coat": { const c = box(0.84, 0.5, 0.06, topM); at(c, 0, 0.66, -0.2); } break;
    case "cap": { const c = box(0.82, 0.2, 0.76, L("#1d1d24")); at(c, 0, 2.43, 0); const brim = box(0.6, 0.06, 0.34, L("#1d1d24")); at(brim, 0, 2.36, -0.48); at(box(0.2, 0.1, 0.05, accM), 0, 2.46, 0.39); } break;
    case "buns": { for (const sx of [-1, 1]) { at(ball(0.2, hairM), sx * 0.3, 2.5, -0.05); at(ball(0.08, L("#ffffff")), sx * 0.3, 2.64, 0.08); } } break;
    case "helmet": { const h = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), new THREE.MeshPhongMaterial({ color: "#d8ecff", shininess: 140, transparent: true, opacity: 0.32, depthWrite: false })); at(h, 0, 2.02, 0); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 20), L("#ffffff")); ring.rotation.x = Math.PI / 2; at(ring, 0, 1.58, 0); for (const sx of [-1, 1]) at(box(0.14, 0.3, 0.3, accM), sx * 0.46, 2.02, 0); } break;
    case "bunny": { for (const sx of [-1, 1]) { const e = box(0.16, 0.56, 0.12, L("#ffffff")); e.rotation.z = -sx * 0.12; at(e, sx * 0.2, 2.72, 0); at(box(0.08, 0.4, 0.02, accM), sx * 0.2, 2.72, 0.07).rotation.z = -sx * 0.12; } } break;
    case "panda": { const hood = box(0.86, 0.8, 0.74, L("#ffffff")); at(hood, 0, 2.06, -0.06); for (const sx of [-1, 1]) at(ball(0.16, L("#1d1d24")), sx * 0.34, 2.5, 0); } break;
    case "wizard": { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 16), L(S.top)); at(br, 0, 2.38, 0); const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 12), L(S.top)); hat.rotation.z = 0.25; at(hat, -0.1, 2.85, 0); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.43, 0.08, 12), accM); at(band, 0, 2.45, 0); } break;
    case "staff": { const st = box(0.06, 1.2, 0.06, L("#8b5a2b")); st.position.set(0, -0.6, 0.12); armR.add(st); const gem = ball(0.12, Ph("#da77f2", 120)); gem.position.set(0, -0.02, 0.12); armR.add(gem); } break;
    case "knight": { const hel = box(0.82, 0.78, 0.74, Ph("#cfd8e8", 100)); at(hel, 0, 2.04, -0.05); at(box(0.6, 0.3, 0.05, sheetFaceMat(ai)), 0, 2.0, 0.33); const plume = box(0.1, 0.3, 0.5, L("#4a8fe8")); at(plume, 0, 2.56, -0.05); at(box(0.86, 0.08, 0.78, accM), 0, 2.36, -0.05); } break;
    case "cape": { const c = box(0.78, 1.0, 0.05, L("#2f6fdc")); at(c, 0, 1.12, -0.3); } break;
    case "sword": { const sw = box(0.08, 0.95, 0.04, Ph(ai === 13 ? "#e03131" : "#9ec5ff", 120)); sw.rotation.z = 0.6; at(sw, 0, 1.3, -0.42); } break;
    case "ninja": { const hood = box(0.8, 0.76, 0.72, L("#1d1d24")); at(hood, 0, 2.02, -0.04); at(box(0.62, 0.22, 0.05, sheetFaceMat(ai)), 0, 2.0, 0.33); at(box(0.82, 0.08, 0.74, accM), 0, 2.2, -0.04); const tail = box(0.08, 0.3, 0.05, accM); tail.rotation.z = 0.5; at(tail, 0.3, 2.1, -0.4); } break;
    case "robot": { const ear = Ph("#1c7ed6", 100); for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), ear); at(e, sx * 0.28, 2.5, 0); at(box(0.12, 0.26, 0.26, ear), sx * 0.43, 2.0, 0); } at(box(0.3, 0.24, 0.06, Ph("#74f0ff", 150)), 0, 1.3, 0.24); } break;
    case "headband": at(box(0.78, 0.1, 0.7, L("#e03131")), 0, 2.26, 0); break;
    case "num10": { const n = box(0.4, 0.4, 0.02, new THREE.MeshLambertMaterial({ map: numTex("10", S.top, "#ffffff") })); at(n, 0, 1.28, 0.235); } break;
  }
  return blockFinish({ group, inner, legL, legR, armL, armR, head, styleIndex: ai }, name, opts);
}


// ===================================================================
// 37차: 발판 효과 · 새 장애물 모양 · 체크포인트 깃발 (두 맵 공통으로 덧붙임)
// ===================================================================
function buildCourseFx(M, C) {
  const root = new THREE.Group(); M.root.add(root);
  const FX = (M.fx = { root, sweeps: [], pushers: [], pulses: [], arrows: [], flags: [], next: null });
  const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
  const phong = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, shininess: 80, ...o });
  const glowMat = (c, op = 0.8) => basic(c, { transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
  // 낮은 회전 막대 (양팔) + 가운데 안전 원판
  const sweepPads = new Set();
  for (const b of C.sweeps || []) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, b.hx * 2, 14), new THREE.MeshPhongMaterial({ map: stripeTex("#ff4d4d", "#ffffff"), shininess: 90 }));
    bar.rotation.z = Math.PI / 2; g.add(bar);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), phong("#ffd43b")); cap.position.x = b.hx * b.arm; g.add(cap);
    root.add(g); FX.sweeps.push({ b, g });
    if (!sweepPads.has(b.pad)) {
      sweepPads.add(b.pad);
      const p = b.pad, hub = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 28), phong("#8ce99a")); disc.position.y = 0.04; hub.add(disc);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.42, 14), phong("#3b5bdb")); post.position.y = 0.25; hub.add(post);
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.dist + b.hx - 0.1, b.dist + b.hx + 0.12, 48), glowMat("#ff8787", 0.35)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; hub.add(ring);
      hub.position.set(p.cx, p.maxY, p.cz); root.add(hub);
      FX.sweepHubs = FX.sweepHubs || []; FX.sweepHubs.push({ hub, b });
    }
  }
  // 미는 블록
  for (const p of C.pushers || []) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(roundedBoxGeo(1.2, 1.15, 0.9, 0.16), new THREE.MeshPhongMaterial({ map: stripeTex("#ffd43b", "#2b2d42"), shininess: 60 }));
    body.position.y = 0.575; g.add(body);
    const face = new THREE.Mesh(roundedBoxGeo(0.7, 0.4, 0.95, 0.1), phong("#ff6b6b")); face.position.y = 0.75; g.add(face);
    root.add(g); FX.pushers.push({ p, g });
    // 다니는 길 표시
    const track = new THREE.Mesh(new THREE.PlaneGeometry(p.reach * 2 + 1.2, 0.18), glowMat("#ffe066", 0.55));
    track.rotation.x = -Math.PI / 2; const [tx, tz] = toWorld(p.pad, 0, p.lz); track.position.set(tx, p.pad.maxY + 0.03, tz); track.rotation.z = p.pad.theta; root.add(track);
  }
  // 움직이는 발판: 민트색 레일 + 화살표 (패키지 33차), 오르내리는 발판: 위아래 화살표, 통통 발판: 퍼지는 고리
  const moveMat = basic(0x7bfff0, { transparent: true, opacity: 0.85, depthWrite: false });
  for (const m of C.movers) {
    const g = M.solidMesh.get(m.s); if (!g) continue;
    for (const side of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), moveMat); rail.scale.set(m.s.hx * 1.45, 0.035, 0.065); rail.position.set(0, 0.125, side * m.s.hz * 0.65); g.add(rail); }
    for (const dz of [-1, 1]) { const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), moveMat); arrow.rotation.x = Math.PI / 2; arrow.rotation.z = dz > 0 ? 0 : Math.PI; arrow.position.set(0, 0.16, dz * 0.55); g.add(arrow); FX.arrows.push({ m: arrow, base: 0.16, ph: dz }); }
  }
  for (const l of C.lifts) {
    const g = M.solidMesh.get(l.s); if (!g) continue;
    for (const k of [0, 1]) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 4), glowMat("#9cf6ff", 0.9)); ar.position.set(l.s.hx * 0.62, 0.35 + k * 0.32, l.s.hz * 0.62); g.add(ar); FX.arrows.push({ m: ar, base: 0.35 + k * 0.32, ph: k * 1.2, up: true }); }
  }
  for (const b of C.bouncies) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), glowMat("#ff8fc8", 0.7)); ring.rotation.x = -Math.PI / 2;
    ring.position.set(b.cx, b.maxY + 0.06, b.cz); root.add(ring); FX.pulses.push({ m: ring, ph: b.cx });
  }
  // 다음에 뛸 발판 표시 (빛나는 고리 + 내려가는 화살표) — 게임이 위치를 정함
  {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), glowMat("#fff3a0", 0.85)); ring.rotation.x = -Math.PI / 2; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), glowMat("#ffffff", 0.7)); ring2.rotation.x = -Math.PI / 2; g.add(ring2);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), glowMat("#ffd43b", 0.95)); arrow.rotation.x = Math.PI; arrow.position.y = 1.4; g.add(arrow);
    g.visible = false; root.add(g); FX.next = { g, ring, ring2, arrow };
  }
  // 체크포인트 깃발: 5층마다 (5·10·15·20·25층 문제를 풀고 내려서는 착지대) — 노란색, 닿으면 빨간색
  for (let f = 5; f < C.TOTAL; f += 5) {
    const s = C.strips[f]; if (!s) continue;
    const zi = f;   // 깃발 번호 = 층
    const g = new THREE.Group();
    const [x, z] = toWorld(s, 0, s.hz * 0.35);   // 착지대 한가운데, 다음 발판 쪽 (누구나 지나가는 길목)
    g.position.set(x, s.maxY, z); g.rotation.y = s.theta;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.18, 20), phong("#ffffff")); base.position.y = 0.09; g.add(base);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 36), glowMat("#ffe066", 0.75)); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; g.add(halo);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 10), phong("#f1f3f5", { shininess: 120 })); pole.position.y = 1.3; g.add(pole);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), phong("#ffd43b", { shininess: 120 })); ball.position.y = 2.65; g.add(ball);
    const clothGeo = new THREE.PlaneGeometry(1.2, 0.8, 8, 2); clothGeo.translate(0.6, 0, 0);
    const clothMat = new THREE.MeshPhongMaterial({ color: "#ffd43b", side: THREE.DoubleSide, shininess: 40, emissive: "#3a2a00" });
    const cloth = new THREE.Mesh(clothGeo, clothMat); cloth.position.set(0.05, 2.15, 0); g.add(cloth);
    const label = textSprite("체크포인트", { size: 40, bg: "rgba(255,193,7,.95)", color: "#5a3a00", pad: 12, border: "#ffffff" }, 0.42); label.position.y = 3.1; g.add(label);
    M.root.add(g);
    FX.flags.push({ s, zi, g, cloth, clothMat, halo, ball, label, on: false, pos: new THREE.Vector3(x, s.maxY, z), base0: clothGeo.attributes.position.array.slice() });
  }
}
function setCheckpointFlag(M, zi, on) {
  const f = M && M.fx && M.fx.flags.find((q) => q.zi === zi); if (!f) return;
  f.on = on;
  f.clothMat.color.set(on ? "#ff3b3b" : "#ffd43b"); f.clothMat.emissive.set(on ? "#4a0000" : "#3a2a00");
  f.halo.material.color.set(on ? "#ff6b6b" : "#ffe066"); f.ball.material.color.set(on ? "#ff3b3b" : "#ffd43b");
  setSpriteText(f.label, on ? "여기서 다시 시작!" : "체크포인트", { size: 40, bg: on ? "rgba(229,56,59,.95)" : "rgba(255,193,7,.95)", color: on ? "#ffffff" : "#5a3a00", pad: 12, border: "#ffffff" }, 0.42);
}
function animateCourseFx(C, M, t, dt) {
  const FX = M.fx; if (!FX) return;
  for (const { b, g } of FX.sweeps) { g.position.set(b.cx, b.maxY - 0.2, b.cz); g.rotation.y = b.theta; }
  for (const { hub, b } of FX.sweepHubs || []) hub.children[1].rotation.y = b.theta;
  for (const { p, g } of FX.pushers) { g.position.set(p.b.cx, p.pad.maxY, p.b.cz); g.rotation.y = p.pad.theta; }
  for (const a of FX.arrows) {
    if (a.up) { const k = ((t * 0.9 + a.ph) % 1); a.m.position.y = a.base + k * 0.35; a.m.material.opacity = 0.9 * (1 - k); }
    else a.m.position.y = a.base + Math.sin(t * 4 + a.ph) * 0.04;
  }
  for (const p of FX.pulses) { const k = (t * 0.8 + p.ph * 0.1) % 1; p.m.scale.setScalar(0.8 + k * 0.9); p.m.material.opacity = 0.75 * (1 - k); }
  for (const f of FX.flags) {
    const arr = f.cloth.geometry.attributes.position.array, b0 = f.base0;
    for (let i = 0; i < arr.length; i += 3) { const x = b0[i]; arr[i + 2] = Math.sin(t * 6 + x * 4) * 0.12 * (x / 1.2); }
    f.cloth.geometry.attributes.position.needsUpdate = true;
    f.halo.scale.setScalar(1 + Math.sin(t * 3 + f.zi) * 0.06);
    f.label.visible = true;
  }
  if (FX.next && FX.next.g.visible) {
    FX.next.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08); FX.next.ring2.rotation.z = t * 1.5;
    FX.next.arrow.position.y = 1.35 + Math.sin(t * 4) * 0.18; FX.next.arrow.rotation.y = t * 2;
  }
}

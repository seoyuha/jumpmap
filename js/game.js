// ===================================================================
// game.js — 학생 게임: 움직임·문제·관문·체크포인트·결과, 방(Firebase)에 진행 상황 보내기
// ===================================================================
"use strict";
const $ = (id) => document.getElementById(id);
const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normAns = (s) => String(s || "").replace(/[\s.,!?·()'"]/g, "").toLowerCase();
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const chosung = (s) => [...s].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join("");

let now = 0;
const G = {
  unit: null, C: null, M: null, hero: null,
  state: "title",          // title | lobby | play | paused | menu | finish
  room: null,              // { code, pid, name, num, color, ref }
  settings: { wrongTo: "course", gates: true, photos: true },
  off: {},
  color: SKIN_COLORS[5],
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, yaw: 0, pitch: 0.47, camDist: 9.5,
  grounded: false, ground: null, lastGrounded: -1, jumpQueued: -1, launching: false, hop: null,
  checkpoint: null, maxCp: 0, stunUntil: 0, pendingWrong: null,
  floorQ: [], solved: [], qFloor: 0, correct: 0, wrong: 0, falls: 0, gatesCleared: 0, streak: 0,
  wrongLog: [], runTime: 0, finishTime: 0, cheer: 0,
  gateOpenFor: null, gateTries: 0, gateQ: null,
  lastManualCam: -9, lastInput: 0,
  pub: { t: 0, x: 0, y: 0, z: 0, f: 0, a: -1, prog: "" },
};
const keys = new Set();
let stick = null, turnHold = 0;

// ---------------- 세계 만들기 ----------------
function setupWorld(unit) {
  if (G.unit === unit && G.C) return;
  if (G.M) { scene.remove(G.M.root); }
  G.unit = unit;
  G.C = buildCourse(unit);
  G.M = buildWorldMeshes(scene, G.C);
  if (!G.hero) {
    G.hero = makeAvatar(G.color);
    scene.add(G.hero.group, G.hero.blob);
  }
  G.checkpoint = G.C.plazas[0];
  placeAt(G.C.plazas[0]);
  buildProgressBar();
  $("titleEyebrow").textContent = `과학 ${unit.grade.replace("학년 ", "-").replace("학기", "")} · ${unit.no}단원 「${unit.title}」`;
}
// 맵 바꾸기 (선생님이 「맵 선택」을 바꾸면): 코스는 그대로, 보이는 모습만 다시 만듦
function applyMapStyle(style) {
  style = style === "stage" ? "stage" : "hd";
  if (style === MAP_STYLE && G.M && G.M.style === style) return;
  MAP_STYLE = style;
  if (!G.C) return;
  scene.remove(G.M.root);
  G.M = buildWorldMeshes(scene, G.C);
  // 진행 상황을 새 맵에 다시 칠하기: 열린 관문, 발판 글자, 무너진 발판, 깃발
  G.C.gates.forEach((g, zi) => { if (g && g.cleared) setGateOpen(G.M, zi, false); });
  for (let f = 1; f <= G.C.TOTAL; f++) {
    const fq = G.floorQ[f];
    G.C.floors[f].pads.forEach((pd, i) => {
      const gone = !pd.active;
      G.M.solidMesh.get(pd).visible = !gone;
      setPadLabel(pd, !fq || G.solved[f] || gone || fq.removed.includes(i) ? null : fq.opts[i]);
    });
  }
  moveFlag();
  if (G.state === "play") toast(`🗺 맵이 「${MAP_STYLES[style]}」으로 바뀌었어요`);
}
function setHeroColor(c) {
  G.color = c;
  if (!G.hero) return;
  scene.remove(G.hero.group, G.hero.blob);
  G.hero = makeAvatar(c);
  scene.add(G.hero.group, G.hero.blob);
}
function buildProgressBar() {
  const C = G.C, el = $("progress");
  el.innerHTML = "";
  for (let f = 1; f <= C.TOTAL; f++) {
    const sp = document.createElement("span");
    sp.dataset.f = f; el.appendChild(sp);
    if (f % C.FPZ === 0 && f < C.TOTAL) { const g = document.createElement("span"); g.className = "gap"; el.appendChild(g); }
  }
}

// ---------------- 한 판 준비 ----------------
function assignQuestions() {
  const U = G.unit, C = G.C;
  const pools = U.zones.map((z, zi) => {
    let p = U.questions.filter((q) => q.zone === zi + 1 && !G.off[q.id]);
    if (!p.length) p = U.questions.filter((q) => q.zone === zi + 1);
    if (!p.length) p = U.questions.slice();
    return G.settings.order === "seq" ? p : shuffle(p);
  });
  const used = U.zones.map(() => 0);
  G.floorQ = []; G.solved = [];
  for (let f = 1; f <= C.TOTAL; f++) {
    const zi = C.floors[f].zone, pool = pools[zi];
    const q = pool[used[zi]++ % pool.length];
    const right = q.options[q.answer];
    const wrongs = shuffle(q.options.filter((_, i) => i !== q.answer)).slice(0, 2);
    const opts = shuffle([right, ...wrongs]);
    G.floorQ[f] = { q, opts, correct: opts.indexOf(right), removed: [], tries: 0 };
    G.solved[f] = false;
    C.floors[f].pads.forEach((p, i) => {
      p.active = true;
      const g = G.M.solidMesh.get(p);
      g.visible = true; g.position.y = p.maxY; g.rotation.z = 0; p.drop = 0; p.glow = 0;
      setPadLabel(p, opts[i]);
    });
  }
}
function prepareRun() {
  const C = G.C;
  G.hints = 3; G.boostUntil = 0; G.skillReady = 0;
  rankSubmitted = false;
  dropQueue.length = 0;
  resetStageFX();
  assignQuestions();
  C.gates.forEach((g, zi) => {
    if (!g) return;
    const open = !G.settings.gates;
    g.cleared = open; g.wall.active = !open;
    if (open) setGateOpen(G.M, zi, false); else resetGateMesh(G.M, zi);
  });
  for (const s of C.crumbles) { s.active = true; s.crumbleAt = 0; }
  Object.assign(G, { correct: 0, wrong: 0, falls: 0, gatesCleared: 0, streak: 0, wrongLog: [], runTime: 0, finishTime: 0, maxCp: 0, pendingWrong: null, qFloor: 0, cheer: 0, hop: null, launching: false, stunUntil: 0 });
  G.checkpoint = C.plazas[0];
  placeAt(C.plazas[0]);
  closeGatePanel(); hideQPanel(); hideFeedback();
  updateHud();
  publishProgress(true);
}
function startRun() {
  G.state = "play";
  showScreen(null);
  $("hud").classList.remove("hidden");
  $("keysHint").classList.remove("hidden", "fade");
  if (isTouch) $("touchUi").classList.remove("hidden");
  setTimeout(() => $("keysHint").classList.add("fade"), 12000);
  toast(`1구역 「${G.unit.zones[0].name}」 출발!`);
  Sound.play("start");
  $("game").focus();
}

function placeAt(s) {
  G.camSnap = true; _camIdx = Math.max(0, G.C.path.findIndex((w) => w.s === s));
  G.pos.set(s.cx, s.maxY + 0.02, s.cz);
  G.vel.set(0, 0, 0);
  G.facing = s.theta; G.yaw = s.theta + Math.PI;
  G.grounded = false; G.ground = null; G.hop = null; G.launching = false;
  moveFlag();
}
function moveFlag() {
  const s = G.checkpoint, f = G.M && G.M.flag;
  if (!f || !s) return;
  if (G.M.flagCloth) G.M.flagCloth.material.color.setHex(s.cp > 0 ? 0x59edac : 0xffd55b);
  const [x, z] = toWorld(s, s.hx - 0.5, -s.hz + 0.5);
  f.position.set(x, s.maxY, z);
}

// ---------------- 입력 ----------------
const isTyping = () => document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
const isKey = (...c) => c.some((k) => keys.has(k));
addEventListener("keydown", (e) => {
  if (MODE !== "student") return;
  if (isTyping()) { if (e.code === "Escape") document.activeElement.blur(); return; }
  keys.add(e.code);
  if (e.code === "Space") { e.preventDefault(); G.jumpQueued = now; }
  if (G.state === "play") {
    if (/^Digit[123]$|^Numpad[123]$/.test(e.code)) chooseOption(Number(e.code.slice(-1)) - 1);
    if (e.code === "KeyR") toFlag();
  }
  if (e.code === "KeyM") toggleSound();
  if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && G.state === "play") useSkill();
  if (e.code === "Escape") { if (G.state === "play") openMenu(); else if (G.state === "menu" || G.state === "paused" && !G.room) resumeFromMenu(); }
  if (/Arrow/.test(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

let isTouch = false;
function useTouch() { if (isTouch) return; isTouch = true; document.body.classList.add("touch"); if (G.state === "play") $("touchUi").classList.remove("hidden"); }
if (matchMedia("(pointer: coarse)").matches) useTouch();

// 시점 끌기 (마우스·손가락 공통)
let drag = null;
$("game").addEventListener("pointerdown", (e) => {
  if (MODE !== "student") return;
  if (e.pointerType === "touch") useTouch();
  Sound.init();
  if (drag) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: now };
});
addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  G.yaw -= dx * 0.0065;
  G.pitch = Math.max(0.05, Math.min(1.25, G.pitch + dy * 0.004));
  G.lastManualCam = now;
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // 오른쪽 화면을 톡 치면 점프 (태블릿)
  if (e.pointerType === "touch" && drag.moved < 12 && now - drag.t < 0.3 && G.state === "play") G.jumpQueued = now;
  drag = null;
};
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);
// 태블릿: 두 손가락 벌리기/모으기로 카메라 거리 조절
{
  let pinch = 0;
  const pd = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  $("game").addEventListener("touchstart", (e) => { if (e.touches.length === 2) { pinch = pd(e); drag = null; } }, { passive: true });
  $("game").addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || !pinch) return;
    const d = pd(e); G.camDist = Math.max(6, Math.min(16, G.camDist * (pinch / d))); pinch = d; G.lastManualCam = now;
  }, { passive: true });
  $("game").addEventListener("touchend", (e) => { if (e.touches.length < 2) pinch = 0; }, { passive: true });
}
$("game").addEventListener("wheel", (e) => { G.camDist = Math.max(6, Math.min(16, G.camDist + e.deltaY * 0.01)); }, { passive: true });

// 조이스틱
{
  const joy = $("joy"), knob = $("knob");
  let jid = null, cx = 0, cy = 0;
  joy.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); Sound.init();
    jid = e.pointerId; joy.setPointerCapture(jid);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  const move = (e) => {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy), max = 50;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick = { dx, dy };
  };
  joy.addEventListener("pointermove", move);
  const end = (e) => { if (e.pointerId !== jid) return; jid = null; stick = null; knob.style.transform = ""; };
  joy.addEventListener("pointerup", end); joy.addEventListener("pointercancel", end);
  // 오른쪽 방향 버튼 (누르고 있는 동안 화면이 돌아요)
  for (const [id, d] of [["turnL", 1], ["turnR", -1]]) {
    const b = $(id);
    b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); Sound.init(); try { b.setPointerCapture(e.pointerId); } catch (_) {} turnHold = d; b.classList.add("on"); });
    const up = (e) => { if (turnHold === d) turnHold = 0; b.classList.remove("on"); };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
  }
  $("jumpBtn").addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); Sound.init(); G.jumpQueued = now; });
}

// ---------------- 물리 ----------------
function moveHorizontal(dx, dz) {
  G.pos.x += dx; G.pos.z += dz;
  for (const s of G.C.solids) {
    if (!s.active || s.kind === "ground") continue;
    if (G.pos.y >= s.maxY - 0.05 || G.pos.y + PLAYER_H <= s.minY) continue;
    const [lx, lz] = toLocal(s, G.pos.x, G.pos.z);
    const cx = Math.max(-s.hx, Math.min(lx, s.hx)), cz = Math.max(-s.hz, Math.min(lz, s.hz));
    const ex = lx - cx, ez = lz - cz, d2 = ex * ex + ez * ez;
    if (d2 >= PLAYER_R * PLAYER_R) continue;
    let nlx = lx, nlz = lz;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), push = PLAYER_R - d; nlx += (ex / d) * push; nlz += (ez / d) * push; }
    else if (s.hx - Math.abs(lx) < s.hz - Math.abs(lz)) nlx = Math.sign(lx || 1) * (s.hx + PLAYER_R);
    else nlz = Math.sign(lz || 1) * (s.hz + PLAYER_R);
    const [wx, wz] = toWorld(s, nlx, nlz);
    G.pos.x = wx; G.pos.z = wz;
  }
}
function moveVertical(dy) {
  const prevY = G.pos.y;
  G.pos.y += dy;
  if (dy <= 0) {
    let best = null;
    for (const s of G.C.solids) {
      if (!s.active) continue;
      if (s.maxY <= prevY + 0.03 && s.maxY >= G.pos.y && footOverlaps(s, G.pos.x, G.pos.z, PLAYER_R * 0.75)) {
        if (!best || s.maxY > best.maxY) best = s;
      }
    }
    if (best) { G.pos.y = best.maxY; G.vel.y = 0; G.grounded = true; G.ground = best; }
  } else {
    for (const s of G.C.solids) {
      if (!s.active || s.kind === "ground") continue;
      if (s.minY >= prevY + PLAYER_H - 0.03 && s.minY <= G.pos.y + PLAYER_H && footOverlaps(s, G.pos.x, G.pos.z, PLAYER_R * 0.7)) {
        G.pos.y = s.minY - PLAYER_H; G.vel.y = 0;
      }
    }
  }
}
function knock(b) {
  const [, lz] = toLocal(b, G.pos.x, G.pos.z);
  const side = Math.sign(lz) || 1;
  // 막대의 로컬 z 방향(막대에 수직)으로 튕김
  const wx = b.sn * side, wz = b.c * side;
  G.vel.set(wx * 6.5, 6.2, wz * 6.5);
  G.stunUntil = now + 0.75; G.hop = null; G.launching = false;
  Sound.play("knock");
}
function startHop(target) {
  G.hop = { sx: G.pos.x, sy: G.pos.y, sz: G.pos.z, tx: target.cx, ty: target.maxY, tz: target.cz, t: 0, dur: 0.6, target };
  G.vel.set(0, 0, 0);
  G.facing = Math.atan2(target.cx - G.pos.x, target.cz - G.pos.z);
  Sound.play("jump");
}
function stepHop(dt) {
  const h = G.hop;
  h.t += dt;
  const k = Math.min(1, h.t / h.dur);
  G.pos.x = h.sx + (h.tx - h.sx) * k;
  G.pos.z = h.sz + (h.tz - h.sz) * k;
  G.pos.y = h.sy + (h.ty - h.sy) * k + Math.sin(k * Math.PI) * 2.2;
  G.grounded = false;
  if (k >= 1) { G.pos.y = h.ty + 0.02; G.vel.set(0, -1, 0); G.hop = null; }
}
function launchTo(target, v = BOUNCE_V) {
  // 14차: 6m 상승 구간에서 발사 높이가 달라져도 착지대보다 최소 2.4m 높게 뜨도록 보정.
  // 일반 점프 높이와 발판 충돌은 변경하지 않음.
  const h = target.maxY - G.pos.y;
  const safeV = Math.max(v, Math.sqrt(2 * GRAVITY * (Math.max(0, h) + 2.4)));
  const apex = (safeV * safeV) / (2 * GRAVITY);
  const t = safeV / GRAVITY + Math.sqrt((2 * Math.max(0, apex - h)) / (GRAVITY * FALL_MULT));
  G.vel.set((target.cx - G.pos.x) / Math.max(t, 0.1), safeV, (target.cz - G.pos.z) / Math.max(t, 0.1));
  G.facing = Math.atan2(G.vel.x, G.vel.z);
  G.launching = true; G.lastGrounded = -1; G.jumpQueued = -1;
  Sound.play("bounce");
  spawnStageFX("jump", G.pos, 0x8ceaff);
}

// 6차 그래픽: 3D 경량 이펙트. 물리/문제/기록 저장에는 관여하지 않음.
const stageFX = [];
const fxRingGeo = new THREE.RingGeometry(0.50, 0.61, 36);
const fxSparkGeo = new THREE.OctahedronGeometry(0.13, 0);
function spawnStageFX(kind, point, color = 0xffd43b) {
  if (!point || !scene) return;
  const center = point.clone ? point.clone() : new THREE.Vector3(point.x, point.y, point.z);
  const ring = new THREE.Mesh(fxRingGeo, new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.88, side:THREE.DoubleSide, depthWrite:false}));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(center); ring.position.y += .08;
  scene.add(ring);
  const sparks = [];
  const count = kind === 'finish' ? 15 : kind === 'checkpoint' ? 11 : 6;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, radius = .25 + Math.random() * .45;
    const m = new THREE.Mesh(fxSparkGeo, new THREE.MeshBasicMaterial({color: i%3===0 ? 0xffffff : color, transparent:true, opacity:1, depthWrite:false}));
    m.position.set(center.x + Math.cos(a)*radius, center.y + .2, center.z + Math.sin(a)*radius);
    scene.add(m);
    sparks.push({m, vx: Math.cos(a)*(kind==='finish'?3.5:2), vy: 1.8+Math.random()*2.4, vz: Math.sin(a)*(kind==='finish'?3.5:2)});
  }
  stageFX.push({ring,sparks, age:0, dur:kind === 'finish' ? 1.5 : .75});
  if (stageFX.length > 16) clearStageFX(stageFX.shift());
}
function clearStageFX(fx) {
  scene.remove(fx.ring);
  fx.ring.material.dispose();
  for (const p of fx.sparks) { scene.remove(p.m); p.m.material.dispose(); }
}
function animateStageFX(dt) {
  for(let i=stageFX.length-1;i>=0;i--) {
    const f=stageFX[i]; f.age+=dt;
    const ratio=Math.min(1,f.age/f.dur), alpha=Math.pow(1-ratio,1.3);
    f.ring.scale.setScalar(.65+ratio*2.6);
    f.ring.material.opacity=.78*alpha;
    for(const p of f.sparks) {
      p.m.position.x += p.vx*dt; p.m.position.y += p.vy*dt; p.m.position.z += p.vz*dt;
      p.vy -= 8*dt; p.m.rotation.y += 3*dt;
      p.m.material.opacity=alpha; p.m.scale.setScalar(Math.max(.01,alpha));
    }
    if (ratio>=1) {clearStageFX(f);stageFX.splice(i,1);}
  }
}
function resetStageFX(){ while(stageFX.length) clearStageFX(stageFX.pop()); }

const dropQueue = [];
function physicsStep(dt) {
  const C = G.C;
  // 틀린 발판: 잠깐 뒤 무너짐
  for (let i = dropQueue.length - 1; i >= 0; i--) {
    const d = dropQueue[i];
    if (now >= d.at) { d.pad.active = false; d.pad.drop = now; setPadLabel(d.pad, null); dropQueue.splice(i, 1); }
  }
  const playing = G.state === "play" || G.state === "menu";
  if (playing && now >= G.stunUntil) {
    for (const b of C.spinners) {
      if (G.pos.y < b.maxY + 0.1 && G.pos.y + PLAYER_H > b.minY && footOverlaps(b, G.pos.x, G.pos.z, PLAYER_R + 0.05)) { knock(b); break; }
    }
  }
  if (G.hop) { stepHop(dt); return; }
  let f = 0, r = 0, turn = 0;
  const stunned = now < G.stunUntil;
  const can = (G.state === "play" || G.state === "finish") && !stunned && !isTyping();
  if (can) {
    if (isKey("KeyW", "ArrowUp")) f += 1;
    if (isKey("KeyS", "ArrowDown")) f -= 1;
    if (isKey("KeyD")) r += 1;
    if (isKey("KeyA")) r -= 1;
    if (isKey("ArrowLeft", "KeyQ")) turn += 1;
    if (isKey("ArrowRight", "KeyE")) turn -= 1;
    if (stick) { f -= stick.dy / 50; r += stick.dx / 50; }
    if (turnHold) turn += turnHold;
  }
  if (turn) { G.yaw += turn * 2.4 * dt; G.lastManualCam = now; }
  if (f || r || turn) G.lastInput = now;
  const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw), rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
  let mx = fx * f + rx * r, mz = fz * f + rz * r;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const amount = Math.min(1, len);
  const accel = Math.min(1, dt * (stunned ? (G.grounded ? 2.5 : 0.6) : G.grounded ? 14 : 7));
  if (!G.launching) {
    const sp = SPEED * (now < (G.boostUntil || 0) ? 1.45 : 1);
    G.vel.x += (mx * sp - G.vel.x) * accel;
    G.vel.z += (mz * sp - G.vel.z) * accel;
    if (amount > 0.1) G.facing = angleLerp(G.facing, Math.atan2(mx, mz), Math.min(1, dt * 14));
  }
  // 타워를 돌아 올라갈 때 카메라가 이동 방향을 부드럽게 따라오도록 한다.
  // 사용자가 직접 화면을 돌리는 동안은 자동 회전을 멈춰 조작을 방해하지 않는다.
  // (33차) 이동 방향을 따라 도는 자동 회전은 없앰 → 카메라는 updateCamera에서 "다음 발판" 기준으로만 천천히 맞춤

  // 바람: 발판 위에 있을 때 옆으로 밀림
  for (const w of C.winds) {
    if (!w.on) continue;
    const s = w.pad;
    if (G.pos.y > s.maxY - 0.5 && G.pos.y < s.maxY + 3 && pointInside(s, G.pos.x, G.pos.z, 0.4)) {
      const k = w.side * w.power * dt;
      G.pos.x += s.c * k; G.pos.z -= s.sn * k;
      if (!w.heard || now - w.heard > 1.2) { w.heard = now; Sound.play("wind"); }
    }
  }

  if (can && G.jumpQueued > 0 && now - G.jumpQueued < 0.15 && now - G.lastGrounded < 0.12) {
    G.vel.y = JUMP_V; G.jumpQueued = -1; G.lastGrounded = -1;
    Sound.play("jump");
    spawnStageFX("jump", G.pos, 0x8ceaff);
  }
  G.vel.y = Math.max(G.vel.y - GRAVITY * (G.vel.y < 0 ? FALL_MULT : 1) * dt, -40);
  moveHorizontal(G.vel.x * dt, G.vel.z * dt);
  const was = G.grounded;
  G.grounded = false;
  moveVertical(G.vel.y * dt);
  if (G.grounded) {
    G.lastGrounded = now; G.launching = false;
    if (!was) spawnStageFX("land", G.pos, 0xffd43b);
    if (!was || G.ground.kind === "bouncy") onLanded();
    if (G.ground && G.ground.crumble && !G.ground.crumbleAt) { G.ground.crumbleAt = now; Sound.play("crack"); }
  }
  if (G.state === "play" && G.pos.y < G.checkpoint.maxY - 9) fellOff();
  if (G.state === "finish" && G.pos.y < C.goal.maxY - 5) placeAt(C.goal);
}

// ---------------- 착지했을 때 ----------------
function onLanded() {
  const s = G.ground, C = G.C;
  if (!s || (G.state !== "play" && G.state !== "menu")) return;
  if (s.kind === "ground") { fellOff(); return; }
  // 체크포인트보다 한참 아래(아래층 코스)에 내려앉으면 떨어진 것으로 봄
  if (s.maxY < G.checkpoint.maxY - 2.5) { fellOff(); return; }
  if (G.pendingWrong && s.kind !== "option") G.pendingWrong = null;   // 무너지기 전에 광장으로 되돌아옴
  if (G.gateOpenFor && s !== G.gateOpenFor.strip) closeGatePanel();
  if (G.qFloor && !(s.kind === "plaza" && s.floor === G.qFloor) && s.kind !== "option") hideQPanel();
  if (s.kind === "bouncy") {
    G.vel.y = BOUNCY_V; G.grounded = false; s.squash = now;
    Sound.play("boing");
    if (G.unit.theme === "music") Sound.play("note", [523, 587, 659, 698, 784, 880][s.floor % 6]);
    return;
  }
  if (s.kind === "bounce") { launchTo(s.target); return; }
  if (s.kind === "goal") { finishRun(); return; }
  if (s.kind === "option") { onOptionLanded(s); return; }
  if (s.kind === "pad" && G.unit.theme === "music") Sound.play("note", [262, 294, 330, 349, 392, 440, 494, 523][(s.floor * 3 + C.solids.indexOf(s)) % 8]);
  if (s.kind === "plaza" || s.kind === "strip") {
    saveCheckpoint(s);
    if (s.kind === "plaza" && s.floor > 0 && !G.solved[s.floor]) showQPanel(s.floor);
    const gate = s.gate;
    if (gate && !gate.cleared) openGate(gate);
  }
}
function saveCheckpoint(s) {
  const gate = s.gate, locked = gate && !gate.cleared;
  if (locked || s.cp <= G.checkpoint.cp) return;
  const newZone = s.zone !== G.checkpoint.zone;
  G.checkpoint = s;
  if (s.cp > G.maxCp) G.maxCp = s.cp;
  moveFlag();
  spawnStageFX("checkpoint", new THREE.Vector3(s.cx, s.maxY, s.cz), 0x75faad);
  updateHud();
  if (newZone) {
    toast(`${s.zone + 1}구역 「${G.unit.zones[s.zone].name}」에 들어왔어요!`);
    Sound.play("zone");
    pushEvent("zone", `${s.zone + 1}구역 「${G.unit.zones[s.zone].name}」 도착`);
  } else if (s.kind === "plaza") { showCpBadge(); Sound.play("checkpoint"); }
  else Sound.play("checkpoint");
  publishProgress();
}
function wrongTarget(f) {
  const C = G.C, w = G.settings.wrongTo;
  if (w === "floor") return C.plazas[f];
  if (w === "zone") return C.zoneStart(C.floors[f].zone);
  return C.courseStart(f);
}
function fellOff() {
  if (G.pendingWrong) {
    G.checkpoint = wrongTarget(G.pendingWrong);
    G.pendingWrong = null;
  } else {
    G.falls++;
    Sound.play("fall");
    toast("앗! 떨어졌어요. 깃발에서 다시!");
  }
  placeAt(G.checkpoint);
  hideQPanel();
  if (G.checkpoint.kind === "plaza" && G.checkpoint.floor > 0 && !G.solved[G.checkpoint.floor]) showQPanel(G.checkpoint.floor);
  updateHud(); publishProgress();
}
function toFlag() {
  if (G.state !== "play") return;
  G.pendingWrong = null;
  placeAt(G.checkpoint);
  hideQPanel();
  if (G.checkpoint.kind === "plaza" && G.checkpoint.floor > 0 && !G.solved[G.checkpoint.floor]) showQPanel(G.checkpoint.floor);
}

// ---------------- 층 문제 ----------------
function showQPanel(f) {
  const fq = G.floorQ[f], q = fq.q;
  G.qFloor = f;
  $("qTag").innerHTML = `<span class="qtIc">📖</span><b>과학 문제</b><em>${f}층 · ${esc(G.unit.zones[G.C.floors[f].zone].name)}</em>`;
  $("qText").textContent = q.q;
  const img = $("qImg");
  if (q.img && G.settings.photos !== false) { img.src = G.unit.imgBase + q.img; img.classList.remove("hidden", "big"); }
  else img.classList.add("hidden");
  const box = $("qOpts");
  box.innerHTML = "";
  fq.opts.forEach((t, i) => {
    const b = document.createElement("button");
    b.style.background = OPT_COLORS[i];
    b.innerHTML = `<span class="n">${i + 1}</span>${esc(t)}`;
    if (fq.removed.includes(i)) b.classList.add("gone");
    b.addEventListener("click", () => chooseOption(i));
    box.appendChild(b);
  });
  $("qHelp").textContent = isTouch ? "버튼을 누르면 그 발판으로 폴짝 뛰어요" : "알맞은 발판으로 점프하거나 1 · 2 · 3을 눌러요";
  $("qPanel").classList.remove("hidden");
  hideFeedback();
  publishProgress();
}
function hideQPanel() { G.qFloor = 0; $("qPanel").classList.add("hidden"); $("qImg").classList.remove("big"); }
$("qImg").addEventListener("click", () => $("qImg").classList.toggle("big"));
function chooseOption(i) {
  const f = G.qFloor;
  if (!f || G.state !== "play" || G.hop) return;
  const fq = G.floorQ[f];
  if (fq.removed.includes(i)) return;
  const pad = G.C.floors[f].pads[i];
  if (!pad.active) return;
  // 광장이나 정답 발판 위에 서 있을 때만 (공중에서는 안 됨)
  if (!G.grounded || !(G.ground === G.C.plazas[f] || (G.ground.kind === "option" && G.ground.floor === f))) { toast("광장에 서서 골라요"); return; }
  startHop(pad);
}
function onOptionLanded(s) {
  const f = s.floor, fq = G.floorQ[f];
  if (G.solved[f]) return;
  if (fq.removed.includes(s.index)) return;
  const q = fq.q;
  if (s.index === fq.correct) {
    G.solved[f] = true;
    G.correct++; G.streak++;
    recordAnswer(q.id, fq.tries === 0);
    s.glow = now;
    showFeedback(true, fq.tries === 0 ? "정답!" : "정답! 다시 도전해서 맞혔어요", q.explain || "");
    Sound.play("correct");
    hideQPanel();
    // 푼 층의 발판 글자는 지움 (카메라 가까이에서 크게 보이지 않게)
    G.C.floors[f].pads.forEach((p) => setPadLabel(p, null));
    if (G.streak === 5 || G.streak === 10) pushEvent("streak", `${G.streak}문제 연속 정답!`);
    updateHud(); publishProgress();
  } else {
    G.wrong++; G.streak = 0; fq.tries++;
    if (fq.tries === 1) recordAnswer(q.id, false);
    fq.removed.push(s.index);
    if (!G.wrongLog.includes(fq)) G.wrongLog.push(fq);
    showFeedback(false, "앗, 틀렸어요!", "발판이 무너져요. 다시 와서 남은 보기 중에서 골라 보세요.");
    Sound.play("wrong");
    G.pendingWrong = f;
    dropQueue.push({ pad: s, at: now + 0.28 });
    hideQPanel();
    updateHud(); publishProgress();
  }
}
function animatePads() {
  for (let f = 1; f <= G.C.TOTAL; f++) {
    for (const p of G.C.floors[f].pads) {
      const g = G.M.solidMesh.get(p);
      if (p.drop) {
        const e = now - p.drop;
        g.position.y = p.maxY - 9 * e * e; g.rotation.z = Math.sin(e * 30) * 0.06;
        if (e > 1.4) { g.visible = false; }
      }
      if (p.glow) {
        const e = now - p.glow;
        g.scale.setScalar(1 + Math.max(0, 0.15 * Math.sin(Math.min(1, e * 3) * Math.PI)));
      } else g.scale.setScalar(1);
    }
  }
}

// ---------------- 관문 ----------------
function openGate(gate) {
  if (G.gateOpenFor === gate) return;
  G.gateOpenFor = gate; G.gateTries = 0;
  const list = G.unit.gates.filter((g) => g.zone === gate.zone + 1);
  G.gateQ = list.length ? list[Math.floor(Math.random() * list.length)] : { q: "다음 구역으로 가려면 '통과'라고 써요.", answers: ["통과"] };
  $("gTag").textContent = `${gate.zone + 1}구역 관문 · 직접 써서 답해요`;
  $("gQ").textContent = G.gateQ.q;
  $("gHint").textContent = "";
  $("gInput").value = "";
  $("gatePanel").classList.remove("hidden");
  hideQPanel();
  if (!isTouch) setTimeout(() => $("gInput").focus(), 50);
  publishProgress();
}
function closeGatePanel() {
  G.gateOpenFor = null;
  $("gatePanel").classList.add("hidden");
  if (isTyping()) document.activeElement.blur();
}
$("gForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const gate = G.gateOpenFor;
  if (!gate) return;
  const v = normAns($("gInput").value);
  if (!v) return;
  if (G.gateQ.answers.some((a) => normAns(a) === v)) clearGate(gate);
  else {
    G.gateTries++;
    const ans = G.gateQ.answers[0];
    const hint = G.gateTries === 1 ? `힌트: 초성은 「${chosung(ans)}」` :
      G.gateTries === 2 ? `힌트: 「${ans[0]}${"○".repeat(Math.max(0, ans.length - 1))}」` : `정답은 「${ans}」예요. 직접 써 보세요!`;
    $("gHint").textContent = hint;
    $("gInput").value = "";
    const p = $("gatePanel"); p.classList.remove("shake"); void p.offsetWidth; p.classList.add("shake");
    Sound.play("gateWrong");
    G.cameraShake = now + 0.3;
  }
});
function clearGate(gate) {
  gate.cleared = true; gate.wall.active = false;
  setGateOpen(G.M, gate.zone, true);
  closeGatePanel();
  G.gatesCleared++;
  Sound.play("gate");
  const last = gate.zone === G.unit.zones.length - 1;
  toast(last ? "마지막 관문 통과! 정상으로!" : `${gate.zone + 1}구역 관문 통과! 점프대로 가요`);
  pushEvent("gate", `${gate.zone + 1}구역 관문 통과!`);
  if (G.ground === gate.strip) saveCheckpoint(gate.strip);
  $("game").focus();
  publishProgress();
}

// ---------------- 끝 ----------------
function finishRun() {
  if (G.state === "finish") return;
  G.state = "finish";
  G.finishTime = G.runTime;
  G.cheer = now;
  G.maxCp = G.C.MAX_CP;
  hideQPanel(); closeGatePanel();
  Sound.play("finish");
  launchConfetti();
  spawnStageFX("finish", G.pos, 0xffd43b);
  toast("정상 도착!");
  pushEvent("finish", `정상 도착! 기록 ${fmtTime(G.finishTime)}`);
  submitRank();
  publishProgress(true);
  // 혼자 연습 기록 저장
  if (!G.room) {
    try {
      const k = "st-best-" + G.unit.id, best = JSON.parse(localStorage.getItem(k) || "null");
      if (!best || G.finishTime < best.time) localStorage.setItem(k, JSON.stringify({ time: G.finishTime, correct: G.correct, wrong: G.wrong }));
    } catch (e) {}
  }
  setTimeout(() => showResults(true), 2600);
}
function showResults(reached) {
  $("resUnit").textContent = `${G.unit.no}단원 「${G.unit.title}」`;
  $("resTitle").classList.toggle("txt", !reached);
  $("resTitle").innerHTML = reached ? '<img src="assets/ui/r_title.png" alt="정상 도착!">' : "게임이 끝났어요";
  const total = G.correct + G.wrong;
  const solvedCount = G.solved.filter(Boolean).length;
  $("resStats").innerHTML = `
    <div><b>${reached ? fmtTime(G.finishTime) : `${solvedCount}층`}</b><small>${reached ? "기록" : "푼 층"}</small></div>
    <div><b>${G.correct}</b><small>맞힌 문제</small></div>
    <div><b>${G.wrong}</b><small>틀린 횟수</small></div>
    <div><b>${total ? Math.round((G.solved.filter((s, f) => s && G.floorQ[f].tries === 0).length / Math.max(1, solvedCount)) * 100) : 0}%</b><small>한 번에 맞힘</small></div>`;
  const rv = $("resReview");
  if (!G.wrongLog.length) rv.innerHTML = `<div class="allGood">틀린 문제가 하나도 없어요. 대단해요!</div>`;
  else rv.innerHTML = G.wrongLog.map((fq) => `
    <div class="review">${esc(fq.q.q)}<br><span class="a">정답: ${esc(fq.q.options[fq.q.answer])}</span>${fq.q.explain ? `<br><span class="e">${esc(fq.q.explain)}</span>` : ""}</div>`).join("");
  $("againBtn").classList.remove("hidden");
  renderResultRank();
  $("hud").classList.add("hidden"); $("touchUi").classList.add("hidden"); $("keysHint").classList.add("hidden");
  showScreen("resultScreen");
}

// 꽃가루
let confetti = null;
function launchConfetti() {
  if (confetti) scene.remove(confetti.mesh);
  const n = 160, geo = new THREE.BoxGeometry(0.18, 0.18, 0.04);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const parts = [], cols = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2", "#ffa94d"];
  for (let i = 0; i < n; i++) {
    parts.push({ p: new THREE.Vector3(G.pos.x, G.pos.y + 3, G.pos.z), v: new THREE.Vector3((Math.random() - 0.5) * 10, 8 + Math.random() * 8, (Math.random() - 0.5) * 10), r: Math.random() * 6 });
    mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  scene.add(mesh);
  confetti = { mesh, parts, t: now };
}
function animateConfetti(dt) {
  if (!confetti) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  confetti.parts.forEach((pt, i) => {
    pt.v.y -= 9 * dt; pt.v.multiplyScalar(0.99); pt.p.addScaledVector(pt.v, dt); pt.r += dt * 5;
    e.set(pt.r, pt.r * 0.7, 0); q.setFromEuler(e); m.compose(pt.p, q, one); confetti.mesh.setMatrixAt(i, m);
  });
  confetti.mesh.instanceMatrix.needsUpdate = true;
  if (now - confetti.t > 6) { scene.remove(confetti.mesh); confetti = null; }
}

// ---------------- 화면 표시 ----------------
let toastTimer = 0;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2400);
}
let fbTimer = 0;
function showFeedback(ok, title, detail) {
  const f = $("feedback");
  f.className = "card fb2 " + (ok ? "ok" : "bad");
  f.innerHTML = `<img class="fbImg" src="assets/ui/${ok ? "b_ok" : "b_bad"}.png" alt="${esc(title)}"><div class="ft">${esc(title)}</div>${detail ? `<div class="fd">${esc(detail)}</div>` : ""}`;
  clearTimeout(fbTimer); fbTimer = setTimeout(hideFeedback, ok ? 3600 : 2600);
}
function hideFeedback() { clearTimeout(fbTimer); $("feedback").classList.add("hidden"); }
function showScreen(id) {
  for (const s of ["titleScreen", "lobbyScreen", "pauseScreen", "resultScreen", "howScreen", "rankScreen"]) $(s).classList.toggle("hidden", s !== id);
}
function currentFloor() {
  const s = G.grounded && G.ground && G.ground.kind !== "ground" ? G.ground : G.checkpoint;
  return Math.max(0, Math.min(G.C.TOTAL, s.floor || 0));
}
function updateHud() {
  if (!G.C) return;
  const C = G.C, s = G.checkpoint, zi = Math.min(C.zones.length - 1, s.zone || 0), z = C.zones[zi];
  $("zoneDot").style.background = z.color;
  $("zoneText").textContent = `${zi + 1}구역 · ${z.name}`;
  const solved = G.solved.filter(Boolean).length;
  $("floorText").textContent = `${solved}층 / ${C.TOTAL}층 통과 · 관문 ${G.gatesCleared}/${C.zones.length}`;
  $("progress").querySelectorAll("span[data-f]").forEach((sp) => {
    const f = Number(sp.dataset.f);
    sp.style.background = G.solved[f] ? C.zones[C.floors[f].zone].color : "";
  });
  $("sOk").textContent = G.correct; $("sBad").textContent = G.wrong;
  const u = G.unit;
  $("usGrade").textContent = `${u.grade.replace(" 2학기", "")} 과학 ${u.no === "종합" ? "종합" : u.no + "단원"}`;
  $("usTitle").textContent = u.no === "종합" ? "2·3단원 종합" : u.title;
  $("floorNow").textContent = `${solved}층`; $("floorTot").textContent = `${C.TOTAL}층`;
  $("floorFill").style.width = `${Math.round((solved / C.TOTAL) * 100)}%`;
  renderRankCard();
  renderLiveRank();
  if (typeof renderItems === "function" && G.hints !== undefined) renderItems();
}
// 체크포인트 도착 배지
let cpTimer = 0;
function showCpBadge() {
  const b = $("cpBadge"); b.classList.remove("hidden"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  clearTimeout(cpTimer); cpTimer = setTimeout(() => b.classList.add("hidden"), 1800);
}
// 실시간 순위: 같은 교실 친구들 중 많이 올라간 순서 (TOP 5 + 내가 밖이면 내 줄)
let livePlayers = {};
function renderLiveRank() {
  const me = { pid: "me", name: G.room ? G.room.name : "나", color: G.color, solved: G.solved.filter(Boolean).length, finished: G.state === "finish", time: G.finishTime || G.runTime, me: true };
  const list = [me];
  if (G.room) for (const [pid, p] of Object.entries(livePlayers)) if (pid !== G.room.pid && p && p.online !== false) list.push({ pid, name: p.name, color: p.color, solved: p.solved || 0, finished: !!p.finished, time: p.time || 0 });
  list.sort((a, b) => (!!b.finished - !!a.finished) || (a.finished && b.finished ? a.time - b.time : 0) || b.solved - a.solved);
  const myIdx = list.findIndex((x) => x.me);
  $("mrPlace").textContent = `${myIdx + 1}등`; $("mrTotal").textContent = `/ ${list.length}명`;
  $("mrFace").src = AVATAR_IMG(Math.max(0, SKIN_COLORS.indexOf(G.color)));
  const show = list.slice(0, 5);
  if (myIdx >= 5) show.push(list[myIdx]);
  $("lrCount").textContent = G.room ? `👥 ${list.length}명` : "혼자 도전";
  $("lrList").innerHTML = show.map((p) => {
    const rank = list.indexOf(p) + 1, ai = Math.max(0, SKIN_COLORS.indexOf(p.color));
    return `<li class="${p.me ? "me" : ""} r${rank}"><span class="lrN">${rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}</span><img src="${AVATAR_IMG(ai)}" alt=""><span class="lrNm">${esc(p.name)}</span><b>${p.finished ? "완주!" : p.solved + "층"}</b></li>`;
  }).join("");
}
function toggleSound() {
  const m = Sound.toggle();
  $("soundBtn").classList.toggle("off", m);
}
$("soundBtn").addEventListener("click", () => { toggleSound(); $("game").focus(); });
$("flagBtn").addEventListener("click", () => { toFlag(); $("game").focus(); });
// 지도: 탑 전체를 멀리서 보기 (다시 누르거나 6초 뒤 돌아옴)
let mapTimer = 0;
function setMapView(on) {
  G.mapView = on; $("mapHint").classList.toggle("hidden", !on); $("mapBtn").classList.toggle("on", on);
  clearTimeout(mapTimer); if (on) mapTimer = setTimeout(() => setMapView(false), 6000);
}
$("mapBtn").addEventListener("click", () => { setMapView(!G.mapView); $("game").focus(); });
// 게임 중 대화: 대기실과 같은 말풍선 창을 게임 화면에서도 씀
$("chatBtn").addEventListener("click", (e) => {
  e.stopPropagation(); Sound.init();
  const p = $("sayPanel");
  if (p.parentElement !== document.body) document.body.appendChild(p);
  p.classList.add("inGame"); p.classList.toggle("hidden");
});
$("menuBtn").addEventListener("click", () => openMenu());
function openMenu() {
  if (G.state !== "play") return;
  if (G.room) {
    G.state = "menu";
    $("pauseTitle").textContent = "메뉴";
    $("pauseMsg").textContent = "게임은 계속 진행 중이에요. 시간도 계속 흘러요!";
    $("restartBtn").classList.add("hidden");
    $("quitBtn").textContent = "방 나가기";
  } else {
    G.state = "paused";
    $("pauseTitle").textContent = "잠시 멈춤";
    $("pauseMsg").textContent = "시간이 멈췄어요";
    $("restartBtn").classList.remove("hidden");
    $("quitBtn").textContent = "시작 화면으로";
  }
  $("pauseBtns").classList.remove("hidden");
  showScreen("pauseScreen");
}
function resumeFromMenu() {
  if (G.state === "menu" || G.state === "paused") { G.state = "play"; showScreen(null); $("game").focus(); }
}
$("resumeBtn").addEventListener("click", resumeFromMenu);
$("restartBtn").addEventListener("click", () => { prepareRun(); startRun(); });
$("quitBtn").addEventListener("click", () => { if (G.room) leaveRoom(); goTitle(); });
$("againBtn").addEventListener("click", () => { prepareRun(); startRun(); });
$("resTitleBtn").addEventListener("click", () => { if (G.room) leaveRoom(); goTitle(); });
// 첫 화면(「과학 점프맵」 그림) ↔ 반·별명·캐릭터 고르는 화면
function showIntro() {}
function goTitle() {
  G.state = "title";
  $("hud").classList.add("hidden"); $("touchUi").classList.add("hidden"); $("keysHint").classList.add("hidden");
  $("onAir").classList.add("hidden");
  hideQPanel(); closeGatePanel(); hideFeedback();
  prepareRun();
  renderTitle();
  showScreen("titleScreen");
}

// ---------------- 카메라 ----------------
// 순간이동/리스폰 시에는 즉시 추적, 일반 이동에는 부드럽게 추적한다.
const obbyCameraTarget = new THREE.Vector3();
const obbyCameraLook = new THREE.Vector3();
const obbyCameraPosition = new THREE.Vector3();
let obbyCameraReady = false;
let obbyCameraLookReady = false;
// 카메라용: 지금 서 있는(또는 마지막) 발판 다음의 코스 발판
let _camIdx = 0;
function camNextPad(k = 1) {
  const P = G.C && G.C.path; if (!P || !P.length) return null;
  const cur = G.grounded && G.ground ? G.ground : null;
  if (cur) {
    let i = -1;
    if (cur.kind === "option") i = P.findIndex((w) => w.option && w.floor === cur.floor);
    else i = P.findIndex((w) => w.s === cur);
    if (i >= 0) _camIdx = i;
  }
  let j = _camIdx + k;
  // 이미 푼 층의 정답 발판은 건너뛰고 그다음 착지대를 봄
  if (P[j] && P[j].option && G.solved[P[j].floor]) j++;
  const n = P[Math.min(P.length - 1, j)];
  return n ? n.s : null;
}
function updateCamera(dt) {
  if (G.mapView && (G.state === "play" || G.state === "menu")) {
    const a = Math.atan2(G.pos.z, G.pos.x), R = 70;
    const target = new THREE.Vector3(Math.cos(a) * R, G.pos.y + 22, Math.sin(a) * R);
    camera.position.lerp(target, Math.min(1, dt * 4));
    camera.lookAt(0, G.pos.y + 4, 0);
    if (typeof obbyCameraReady !== "undefined") obbyCameraReady = false;
    return;
  }
  if (G.state === "title" || G.state === "lobby") {
    const a = now * 0.06, R = 120, shift = innerWidth > 860 ? -30 : 0, top = G.C.top;
    camera.position.set(Math.cos(a) * R, top * 0.62, Math.sin(a) * R);
    camera.lookAt(Math.sin(a) * shift, top * 0.5, -Math.cos(a) * shift);
    obbyCameraReady = false;
    obbyCameraLookReady = false;
    return;
  }
  if (G.state === "finish" && now - G.lastInput > 1.2) {
    const k = Math.min(1, dt * 2);
    G.yaw = angleLerp(G.yaw, G.facing, k);
    G.camDist += (6.5 - G.camDist) * k;
  }
  // (36차) 점프해도 카메라가 같이 튀지 않게: "발 딛는 높이"를 부드럽게 따라가고,
  //   공중에서는 높이의 25%만 따라감. 떨어질 때(발판보다 아래)는 바로 따라감.
  if (G.grounded || G.camGroundY === undefined) G.camGroundY = G.camGroundY === undefined ? G.pos.y : G.camGroundY + (G.pos.y - G.camGroundY) * (1 - Math.exp(-dt * 6));
  const above = G.pos.y - G.camGroundY;
  const followY = G.grounded ? G.pos.y : above >= 0 ? G.camGroundY + above * 0.25 : G.pos.y + 0.5;
  G.camY = G.camY === undefined || G.camSnap ? followY : G.camY + (followY - G.camY) * (1 - Math.exp(-dt * (above < -1 ? 10 : 5)));
  if (!G.grounded && above < -1.5) G.camGroundY = Math.min(G.camGroundY, G.pos.y + 1.5);
  const tx = G.pos.x, ty = G.camY + 1.6, tz = G.pos.z;
  // (33차) 코스 카메라: "다음 발판" 쪽을 향하도록 카메라를 플레이어 뒤·바깥쪽에 두고,
  //   시선은 플레이어와 다음 발판 사이를 봐서 다음 발판이 화면에 잘 보이게 한다.
  const nxt = camNextPad();
  let fx = 0, fz = 0;
  if (nxt) { fx = nxt.cx - tx; fz = nxt.cz - tz; }
  let fl = Math.hypot(fx, fz);
  if (fl < 0.8) { fx = -Math.sin(G.yaw); fz = -Math.cos(G.yaw); fl = 1; }
  fx /= fl; fz /= fl;
  const pr = Math.hypot(tx, tz) || 1, ox = tx / pr, oz = tz / pr;           // 타워 바깥 방향
  // 다음다음 발판 방향을 섞어서 지그재그 발판에서도 좌우로 덜 흔들리게
  const nn = camNextPad(2);
  if (nn && nn !== nxt) { let gx = nn.cx - tx, gz = nn.cz - tz; const gl = Math.hypot(gx, gz) || 1; fx = fx * 0.55 + (gx / gl) * 0.45; fz = fz * 0.55 + (gz / gl) * 0.45; const l2 = Math.hypot(fx, fz) || 1; fx /= l2; fz /= l2; }
  const dx = -fx * 0.86 + ox * 0.5, dz = -fz * 0.86 + oz * 0.5;           // 뒤 + 바깥쪽
  const rawYaw = Math.atan2(dx, dz);
  if (G.camWant === undefined || G.camSnap) G.camWant = rawYaw;
  else if (Math.abs(Math.atan2(Math.sin(rawYaw - G.camWant), Math.cos(rawYaw - G.camWant))) > 0.12) G.camWant = angleLerp(G.camWant, rawYaw, 1 - Math.exp(-dt * 2.5));   // 7° 안쪽 작은 흔들림은 무시
  const wantYaw = G.camWant;
  const manual = now - G.lastManualCam < 3.0;
  if (!manual && (G.state === "play" || G.state === "menu")) {
    G.yaw = angleLerp(G.yaw, wantYaw, G.camSnap ? 1 : 1 - Math.exp(-dt * 1.6));
    G.camSnap = false;
  }
  const camDistance = Math.max(6, Math.min(16, G.camDist || 9.5));
  const pitch = Math.max(0.12, Math.min(1.2, G.pitch));
  obbyCameraPosition.set(tx + Math.sin(G.yaw) * Math.cos(pitch) * camDistance,
    ty + Math.sin(pitch) * camDistance, tz + Math.cos(G.yaw) * Math.cos(pitch) * camDistance);
  // 시선: 다음 발판 쪽으로 30% (최대 4.5m), 높이는 다음 발판 높이를 살짝 반영
  const look = nxt ? Math.min(4.5, fl * 0.3) : 0;
  obbyCameraTarget.set(tx + fx * look, ty + 0.4 + (nxt ? Math.max(-0.6, Math.min(1.4, (nxt.maxY - G.camY) * 0.35)) : 0), tz + fz * look);
  // 가운데 타워 벽 안으로 카메라가 들어가지 않게만 밀어냄
  const camR = Math.hypot(obbyCameraPosition.x, obbyCameraPosition.z);
  if (camR < 10) { const k = 10 / Math.max(0.1, camR); obbyCameraPosition.x *= k; obbyCameraPosition.z *= k; }
  // 플레이어가 리스폰할 때 먼 거리를 천천히 날아가지 않도록 추적 위치 초기화
  if (!obbyCameraReady || camera.position.distanceTo(obbyCameraPosition) > 23) {
    camera.position.copy(obbyCameraPosition);
    obbyCameraLook.copy(obbyCameraTarget);
    obbyCameraLookReady = true;
    obbyCameraReady = true;
  } else {
    camera.position.lerp(obbyCameraPosition, 1 - Math.exp(-Math.max(0, dt) * 11));
  }
  if (!obbyCameraLookReady) { obbyCameraLook.copy(obbyCameraTarget); obbyCameraLookReady = true; }
  obbyCameraLook.lerp(obbyCameraTarget, 1 - Math.exp(-Math.max(0, dt) * 9));
  if (G.cameraShake && now < G.cameraShake) { camera.position.x += (Math.random() - 0.5) * 0.3; camera.position.y += (Math.random() - 0.5) * 0.3; }
  camera.lookAt(obbyCameraLook);
  G.camSnap = false;
}

// ---------------- 매 프레임 ----------------
function gameFrame(dt, t) {
  now = t;
  const C = G.C;
  if (!C) return;
  const frozen = G.state === "paused" || G.state === "lobby";
  if (!frozen) {
    // 움직이는 발판 갱신 (서 있으면 같이 움직임)
    updateDynamics(C, t, dt);
    if (G.grounded && G.ground && G.ground.mover) { G.pos.x += G.ground.dx; G.pos.z += G.ground.dz; G.pos.y += G.ground.dy; }
    if (G.state !== "title") {
      const n = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < n; i++) physicsStep(dt / n);
    }
    if (G.state === "play" || G.state === "menu") G.runTime += dt;
  }
  if (G.state === "play" || G.state === "menu") $("timer").textContent = fmtTime(G.runTime);
  $("friendBadge").classList.toggle("hidden", !(G.room && (G.state === "play" || G.state === "menu" || G.state === "finish")));
  $("onAir").classList.toggle("hidden", !(G.room && G.featured && (G.state === "play" || G.state === "menu")));
  const hudOn = !$("hud").classList.contains("hidden") && (G.state === "play" || G.state === "finish");
  $("jumpBtn").classList.toggle("hidden", !hudOn);
  $("turnPad").classList.toggle("hidden", !(hudOn && isTouch));
  if (!hudOn && turnHold) turnHold = 0;
  $("skillBtn").classList.toggle("hidden", !hudOn);
  $("myRank").classList.toggle("hidden", !(hudOn && G.room));
  if (hudOn) tickSkill();
  // 배경음악: 대기 → 달리기 ↔ 문제 풀이 → 완주
  if (Sound.ctx) {
    const st = G.state;
    Sound.music(st === "finish" ? "finish" : st === "play" || st === "menu" || st === "paused" ? (G.qFloor && !G.solved[G.qFloor] ? "quiz" : "play") : "lobby");
    Sound.duck(st === "paused" || st === "menu");
  }
  $("chatBtn").classList.toggle("hidden", !(hudOn && G.room));
  if (!hudOn && $("sayPanel").classList.contains("inGame")) $("sayPanel").classList.add("hidden");
  if (G.hero && G.hero.bubble) tickBubble(G.hero);
  $("rankCard").classList.toggle("hidden", !(G.room && Net.enabled && !$("hud").classList.contains("hidden")));
  // 캐릭터
  const av = G.hero;
  av.group.position.copy(G.pos);
  av.group.rotation.y = G.facing;
  const left = G.stunUntil - now;
  const hs = Math.min(1, Math.hypot(G.vel.x, G.vel.z) / SPEED);
  animateAvatar(av, dt, hs, G.grounded, {
    tilt: left > 0 ? -Math.sin((1 - left / 0.75) * Math.PI) * 1.3 : 0,
    cheer: G.state === "finish" && G.grounded && hs < 0.2 ? now - G.cheer : 0,
    verticalSpeed: G.vel.y,
  });
  updateBlob(av);
  av.group.visible = G.state !== "title" && G.state !== "lobby";
  av.blob.visible = av.group.visible;
  animateWorld(C, G.M, t, dt);
  animateVisibleFriends(dt);
  animatePads();
  animateConfetti(dt);
  animateStageFX(dt);
  if (G.M && G.M.flagCloth && G.M.flag && G.state === "play") {
    const glow = .86 + Math.sin(now * 5) * .14;
    G.M.flagCloth.scale.set(glow, glow, 1);
    if (G.M.flagHalo) {
      G.M.flagHalo.material.color.setHex(G.checkpoint && G.checkpoint.cp > 0 ? 0x65ffc2 : 0xffd97b);
      G.M.flagHalo.material.opacity=.5+.22*Math.sin(now*3.4);
      G.M.flagHalo.scale.setScalar(.95+.08*Math.sin(now*3.4));
    }
  }
  updateCamera(dt);
  netTick();
}
function updateBlob(av) {
  let floorY = -0.5;
  for (const s of G.C.solids) {
    if (s.active && s.kind !== "ground" && s.maxY <= G.pos.y + 0.05 && s.maxY > floorY && pointInside(s, G.pos.x, G.pos.z)) floorY = s.maxY;
  }
  if (floorY < 0) floorY = 0.25;
  const drop = G.pos.y - floorY;
  av.blob.position.set(G.pos.x, floorY + 0.03, G.pos.z);
  av.blob.scale.setScalar(Math.max(0.4, 1 - drop / 12));
}

// ===================================================================
// 방(Firebase) 연결
// ===================================================================
let roomOffs = [];
const otherPlayers = new Map();
function clearOtherPlayers() {
  otherPlayers.forEach(({avatar}) => {
    scene.remove(avatar.group, avatar.blob);
  });
  otherPlayers.clear();
  const c = document.getElementById("friendCount"); if(c) c.textContent = "0";
}
function watchVisibleFriends() {
  if (!G.room) return;
  const ref = G.room.ref.child("players");
  const fn = (snap) => {
    const players = snap.val() || {}, live = new Set();
    livePlayers = players;
    Object.entries(players).forEach(([pid, data]) => {
      if (pid === G.room.pid || !data || data.online === false || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
      live.add(pid);
      let other = otherPlayers.get(pid);
      if (!other) {
        const avatar = makeAvatar(SKIN_COLORS.includes(data.color) ? data.color : SKIN_COLORS[0], String(data.name || "친구").slice(0,8));
        scene.add(avatar.group, avatar.blob);
        other = {avatar, pos:new THREE.Vector3(data.x,data.y || 0,data.z), target:new THREE.Vector3(), facing:0, moving:false, airborne:false, lastUpdate:now, speed:0};
        otherPlayers.set(pid, other);
      }
      const nx = Number(data.x), ny = Number(data.y)||0, nz = Number(data.z);
      const dist = other.target.distanceTo(new THREE.Vector3(nx,ny,nz));
      // 리스폰·순간 이동은 보간하지 않아 멀리 날아가는 현상을 방지.
      if (dist > 12) other.pos.set(nx, ny, nz);
      const elapsed = Math.max(.08, now - other.lastUpdate);
      other.speed = Math.min(1, dist / elapsed / 7);
      other.lastUpdate = now;
      other.target.set(nx, ny, nz);
      other.facing = Number(data.f)||0;
      other.moving = data.a === 1; other.airborne = data.a === 2;
      if (data.say && data.say.t && data.say.t !== other.sayT) { other.sayT = data.say.t; if (Net.now() - data.say.t < 4500) setAvatarBubble(other.avatar, data.say); }
    });
    for(const [pid, other] of otherPlayers) if(!live.has(pid)) { scene.remove(other.avatar.group, other.avatar.blob); otherPlayers.delete(pid); }
    const count=document.getElementById("friendCount"); if(count) count.textContent = String(otherPlayers.size);
  };
  ref.on("value",fn);
  roomOffs.push(()=>ref.off("value",fn));
}
function animateVisibleFriends(dt) {
  otherPlayers.forEach((other) => {
    const av = other.avatar;
    other.pos.lerp(other.target, 1 - Math.exp(-10 * dt));
    av.group.position.copy(other.pos);
    av.group.rotation.y += Math.atan2(Math.sin(other.facing-av.group.rotation.y),Math.cos(other.facing-av.group.rotation.y))*Math.min(1,dt*9);
    av.group.visible = G.state === "play" || G.state === "menu" || G.state === "finish";
    animateAvatar(av,dt,other.moving?Math.max(.36,other.speed):0,!other.airborne);
    av.blob.position.set(other.pos.x,Math.max(.02,other.pos.y-.1),other.pos.z);
    av.blob.visible=av.group.visible;
    if (av.bubble) tickBubble(av);
    // 멀리 있는 친구의 이름표는 투명도를 낮춰 점프 경로를 가리지 않게 한다.
    if (av.tag && av.tag.material) {
      const distance = camera.position.distanceTo(av.group.position);
      const alpha = Math.max(0,Math.min(1,(52-distance)/17));
      av.tag.visible = av.group.visible && alpha > .03;
      av.tag.material.transparent = true;
      av.tag.material.opacity = alpha;
    }
  });
}

async function joinRoom(code, name, grade, cls) {
  const num = `${cls}반`;
  const ok = await Net.init();
  if (!ok) throw new Error(Net.error === "not-configured" ? "공동 플레이 연결이 아직 설정되지 않았어요. 선생님께 알려주세요." : "인터넷 연결을 확인해 주세요.");
  let meta = await Net.roomExists(code);
  if (!meta) {
    // 선생님이 화면을 열지 않았어도 첫 학생이 교실(0000)을 열고 바로 시작 (단원은 2단원)
    meta = { unit: UNITS[0].id, createdAt: Net.TS() };
    await Net.room(code).update({ meta, state: { status: "lobby", t: Net.TS() }, settings: { wrongTo: "course", gates: true, photos: true } });
  }
  const unit = UNITS.find((u) => u.id === meta.unit) || UNITS[0];
  const key = `st-pid-${code}-${grade}-${cls}-${name}`;
  // 탭마다 다른 학생 (같은 컴퓨터에서 창 여러 개로 시험해 봐도 섞이지 않게). 새로 고침하면 같은 학생으로 다시 들어옴
  let pid = null;
  try { pid = sessionStorage.getItem(key); } catch (e) {}
  if (!pid) { pid = Net.newPid(); try { sessionStorage.setItem(key, pid); } catch (e) {} }
  const roomRef = Net.room(code);
  const me = roomRef.child("players/" + pid);
  await me.update({ name, num, grade, cls, color: G.color, online: true, ready: false, say: null, joinedAt: Net.TS(), cp: 0, floor: 0, zone: 0, correct: 0, wrong: 0, gates: 0, falls: 0, finished: false, time: 0, q: null, t: Net.TS() });
  me.child("online").onDisconnect().set(false);
  G.room = { code, pid, name, num, grade, cls, ref: roomRef, me, joinT: Net.now() };
  setupWorld(unit);
  Rank.watch(unit.id);
  const on = (path, ev, fn) => { const r = roomRef.child(path); r.on(ev, fn); roomOffs.push(() => r.off(ev, fn)); };
  on("settings", "value", (s) => {
    const v = s.val() || {};
    G.settings = { wrongTo: v.wrongTo || "course", gates: v.gates !== false, photos: v.photos !== false, order: v.order || "random" };
    applyMapStyle(v.map);
    if (!G.settings.gates && G.C) G.C.gates.forEach((g, zi) => { if (g && !g.cleared) { g.cleared = true; g.wall.active = false; setGateOpen(G.M, zi, true); if (G.gateOpenFor === g) closeGatePanel(); } });
  });
  on("off", "value", (s) => { G.off = s.val() || {}; });
  on("feature", "value", (s) => { G.featured = s.val() === pid; });
  on("meta/unit", "value", (s) => {
    const u = UNITS.find((x) => x.id === s.val());
    if (!u || u === G.unit) return;
    const playing = G.state === "play" || G.state === "menu" || G.state === "finish";
    hideQPanel(); closeGatePanel();
    setupWorld(u); prepareRun(); Rank.watch(u.id);
    if (playing) { startRun(); toast(`선생님이 「${u.title}」 문제로 바꿨어요. 1층부터 출발!`); }
  });
  on("msg", "value", (s) => {
    const m = s.val();
    if (!m || !m.text || m.t < G.room.joinT - 5000) return;
    const b = $("banner");
    b.innerHTML = `<small>선생님</small>${esc(m.text)}`;
    b.classList.remove("hidden");
    Sound.play("ding");
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.add("hidden"), 7000);
  });
  on("cmd/" + pid, "value", (s) => {
    const c = s.val();
    if (!c || c.t < G.room.joinT) return;
    if (c.type === "kick") { leaveRoom(); goTitle(); $("titleErr").textContent = "선생님이 방에서 내보냈어요."; }
    if (c.type === "reset") { prepareRun(); startRun(); toast("선생님이 처음부터 다시 시작하게 했어요"); }
    if (c.type === "flag") toFlag();
  });
  watchVisibleFriends();
  $("lobbyTitle").textContent = `${grade}학년 ${cls}반 대기실`;
  on("state", "value", (s) => onRoomState(s.val() || { status: "lobby" }));
}
// 대기실: 우리 반 친구 카드 + 준비 표시 + 말풍선
let lobbyData = {}, lobbyTimer = 0;
function watchLobby() {
  if (!G.room || G.room.stopLobby) return;
  const playersRef = G.room.ref.child("players");
  const fn = (s) => { lobbyData = s.val() || {}; renderLobby(); };
  playersRef.on("value", fn);
  G.room.stopLobby = () => playersRef.off("value", fn);
}
function renderLobby() {
  if (!G.room) return;
  const all = Object.entries(lobbyData).map(([pid, p]) => ({ pid, ...p })).filter((p) => p.online !== false);
  const mine = all.filter((p) => Number(p.grade) === Number(G.room.grade) && Number(p.cls) === Number(G.room.cls))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  $("lobbyCount").textContent = mine.length;
  const nowT = Net.now();
  let nextExpire = Infinity;
  const cards = mine.map((p) => {
    const ai = Math.max(0, SKIN_COLORS.indexOf(p.color));
    let bub = "";
    const sy = p.say;
    if (sy && nowT - sy.t < 4500) {
      nextExpire = Math.min(nextExpire, sy.t + 4500 - nowT);
      bub = sy.stk ? `<div class="bub stk"><img src="assets/ui/k_${esc(sy.stk)}.png" alt=""></div>` : `<div class="bub c-${esc(sy.c || "b")}">${esc(sy.text)}</div>`;
    }
    return `<div class="lbCard${p.pid === G.room.pid ? " me" : ""}">${bub}${p.ready ? '<b class="rdy">준비 ✓</b>' : ""}<div class="face"><img src="${AVATAR_IMG(ai)}" alt=""></div><span>${esc(p.name || "친구")}</span></div>`;
  });
  const slots = Math.max(18, Math.ceil((cards.length + 1) / 6) * 6);
  while (cards.length < slots) cards.push(`<div class="lbCard empty"><div class="face">···</div><span>대기중</span></div>`);
  $("lobbyNames").innerHTML = cards.join("");
  const me = lobbyData[G.room.pid] || {};
  $("lbReady").querySelector("img").src = me.ready ? "assets/ui/l_unready.png" : "assets/ui/l_ready.png";
  $("lbReady").setAttribute("aria-label", me.ready ? "준비 취소" : "준비 완료");
  const readyN = mine.filter((p) => p.ready).length;
  $("lobbyStatus").src = readyN && readyN === mine.length ? "assets/ui/l_st_wait.png" : mine.length > 1 ? "assets/ui/l_st_join.png" : "assets/ui/l_st_teacher.png";
  clearTimeout(lobbyTimer);
  if (nextExpire < Infinity) lobbyTimer = setTimeout(renderLobby, nextExpire + 60);
}
function showLobby() {
  G.state = "lobby";
  $("lbLate").classList.add("hidden");
  watchLobby();
  const u = G.unit;
  $("lobbyUnit").textContent = `📚 오늘의 문제 · ${u.no === "종합" ? "2·3단원 종합" : u.no + "단원 「" + u.title + "」"}`;
  $("hud").classList.add("hidden"); $("touchUi").classList.add("hidden"); $("keysHint").classList.add("hidden");
  hideQPanel(); closeGatePanel(); hideFeedback();
  const sp = $("sayPanel"); sp.classList.add("hidden"); sp.classList.remove("inGame");
  if (sp.parentElement !== document.querySelector(".lbStage")) document.querySelector(".lbStage").appendChild(sp);
  showScreen("lobbyScreen");
  renderLobby();
}
// 대기실 버튼
$("lbReady").addEventListener("click", () => {
  if (!G.room) return;
  Sound.init(); Sound.play("pop");
  const me = lobbyData[G.room.pid] || {};
  G.room.me.update({ ready: !me.ready });
});
$("lbExit").addEventListener("click", () => { if (G.room) leaveRoom(); goTitle(); });
$("lbSay").addEventListener("click", (e) => { e.stopPropagation(); Sound.init(); $("sayPanel").classList.toggle("hidden"); });
$("sayClose").addEventListener("click", () => $("sayPanel").classList.add("hidden"));
let lastSay = 0;
function say(obj) {
  if (!G.room) return;
  const t = Date.now();
  if (t - lastSay < 1200) return;   // 너무 자주 누르지 않게
  lastSay = t;
  Sound.play("pop");
  G.room.me.update({ say: { ...obj, t: Net.TS() } });
  $("sayPanel").classList.add("hidden");
  if (G.state === "play" || G.state === "finish") setAvatarBubble(G.hero, obj);
}
document.querySelectorAll("#sayPanel .sayP").forEach((b) => b.addEventListener("click", () => say({ text: b.dataset.say, c: (b.className.match(/c-(\w)/) || [])[1] || "b" })));
document.querySelectorAll("#sayPanel .sayS").forEach((b) => b.addEventListener("click", () => say({ stk: b.dataset.stk })));
// 출발 카운트다운 (3·2·1)
let cdRunning = false;
function lobbyCountdown(done) {
  if (cdRunning) return;
  cdRunning = true;
  const box = $("lbCountdown"), num = $("lbCdNum");
  const steps = ["3", "2", "1", "go"];
  let i = 0;
  const show = () => {
    const k = steps[i];
    num.src = `assets/ui/cd_${k}.png`; num.alt = k === "go" ? "GO!" : k;
    num.classList.toggle("go", k === "go");
    num.style.animation = "none"; void num.offsetWidth; num.style.animation = "";
    Sound.play(k === "go" ? "checkpoint" : "note", 523 + i * 130);
  };
  box.classList.remove("hidden"); show();
  const tick = setInterval(() => {
    i++;
    if (i >= steps.length) { clearInterval(tick); box.classList.add("hidden"); $("lbLate").classList.add("hidden"); cdRunning = false; if (G.state === "lobby") done(); return; }
    show();
  }, 800);
}
// 게임 중에 들어온 학생: 대기실에서 3초 → 3·2·1·GO → 출발
function lateJoin() {
  prepareRun(); showLobby();
  $("lbLate").classList.remove("hidden");
  setTimeout(() => {
    if (G.state !== "lobby" || !G.room || G.room.status !== "play") return;
    if (G.room.stopLobby) { G.room.stopLobby(); G.room.stopLobby = null; }
    lobbyCountdown(() => { prepareRun(); startRun(); });
  }, 3000);
}
// 방 상태: lobby(대기실) → play(진행) → paused(멈춤) → ended(끝)
//   진행 중에 들어온 학생은 대기실 없이 바로 출발 (중간 합류)
function onRoomState(st) {
  const status = ["lobby", "play", "paused", "ended"].includes(st.status) ? st.status : "lobby";
  const prev = G.room.status;
  G.room.status = status;
  if (status === "lobby") {
    if (G.state !== "lobby") { prepareRun(); G.room.me.update({ ready: false }); showLobby(); }
  } else if (status === "play") {
    if (G.room.stopLobby) { G.room.stopLobby(); G.room.stopLobby = null; }
    if (G.state === "lobby") lobbyCountdown(() => { prepareRun(); startRun(); });
    else if (G.state === "title") lateJoin();
    else if (G.state === "paused") { G.state = "play"; showScreen(null); toast("다시 시작!"); Sound.play("resume"); }
    else if (prev === "ended") { prepareRun(); startRun(); }
  } else if (status === "paused") {
    if (G.state === "play" || G.state === "menu" || G.state === "title" || G.state === "lobby") {
      if (G.state === "title" || G.state === "lobby") { if (G.room.stopLobby) { G.room.stopLobby(); G.room.stopLobby = null; } prepareRun(); startRun(); }
      G.state = "paused";
      Sound.play("pause");
      $("pauseTitle").textContent = "선생님이 잠시 멈췄어요";
      $("pauseMsg").textContent = "선생님 말씀을 들어요. 시간도 멈춰 있어요.";
      $("pauseBtns").classList.add("hidden");
      showScreen("pauseScreen");
    }
  } else if (status === "ended") {
    if (G.state === "title") { prepareRun(); showLobby(); }   // 끝난 뒤 들어온 학생은 다음 판까지 대기실에서
    else if (G.state !== "finish" && G.state !== "lobby") {
      G.state = "finish";
      hideQPanel(); closeGatePanel();
      $("hud").classList.add("hidden"); $("touchUi").classList.add("hidden");
      submitRank();
      showResults(false);
    }
  }
}
function leaveRoom() {
  if (!G.room) return;
  try { G.room.me.update({ online: false }); } catch (e) {}
  roomOffs.forEach((f) => f()); roomOffs = [];
  clearOtherPlayers();
  if (G.room.stopLobby) G.room.stopLobby();
  G.room = null; G.featured = false;
  Rank.unwatch();
  G.settings = { wrongTo: "course", gates: true, photos: true };
  G.off = {};
}
function progressPayload() {
  const fq = G.qFloor ? G.floorQ[G.qFloor] : null;
  return {
    cp: G.maxCp, floor: currentFloor(), zone: G.checkpoint.zone || 0,
    solved: G.solved.filter(Boolean).length,
    correct: G.correct, wrong: G.wrong, gates: G.gatesCleared, falls: G.falls,
    finished: G.state === "finish" && G.finishTime > 0, time: Math.round((G.finishTime || G.runTime) * 10) / 10,
    q: fq ? { f: G.qFloor, id: fq.q.id, o: fq.opts, r: fq.removed } : G.gateOpenFor ? { g: G.gateOpenFor.zone, text: G.gateQ.q } : null,
  };
}
function publishProgress(force) {
  if (!G.room) return;
  const p = progressPayload(), key = JSON.stringify(p);
  if (!force && key === G.pub.prog) return;
  G.pub.prog = key;
  G.room.me.update({ ...p, t: Net.TS() });
}
function netTick() {
  if (!G.room || !(G.state === "play" || G.state === "menu" || G.state === "finish")) return;
  const P = G.pub;
  if (now - P.t < 0.25) return;
  P.t = now;
  if (now - (P.pt || 0) > 2) { P.pt = now; publishProgress(); }   // 시간 등은 2초마다
  const a = G.hop || !G.grounded ? 2 : Math.hypot(G.vel.x, G.vel.z) > 1 ? 1 : 0;
  const x = Math.round(G.pos.x * 100) / 100, y = Math.round(G.pos.y * 100) / 100, z = Math.round(G.pos.z * 100) / 100, f = Math.round(G.facing * 100) / 100;
  if (Math.abs(x - P.x) + Math.abs(y - P.y) + Math.abs(z - P.z) + Math.abs(f - P.f) < 0.04 && a === P.a) return;
  Object.assign(P, { x, y, z, f, a });
  G.room.me.update({ x, y, z, f, a });
}
function recordAnswer(qid, ok) {
  if (!G.room) return;
  G.room.ref.child(`answers/${qid}/${G.room.pid}`).set(ok ? 1 : 0);
}
function pushEvent(type, text) {
  if (!G.room) return;
  G.room.ref.child("events").push({ t: Net.TS(), pid: G.room.pid, name: G.room.name, num: G.room.num || "", type, text });
}

// ===================================================================
// 시작 화면
// ===================================================================
let titleTab = "room", soloUnit = null;
const pick = { grade: Number(Object.keys(SCHOOL)[0]), cls: 0 };
function renderClassPicker() {
  const grades = Object.keys(SCHOOL).map(Number);
  const lbl = $("gradeLbl");
  if (grades.length > 1) {
    lbl.innerHTML = grades.map((g) => `<button type="button" class="gBtn ${g === pick.grade ? "on" : ""}" data-g="${g}">${g}학년</button>`).join(" ") + " · 우리 반";
    lbl.querySelectorAll(".gBtn").forEach((b) => (b.onclick = () => { pick.grade = Number(b.dataset.g); pick.cls = 0; renderClassPicker(); }));
  } else lbl.textContent = `${pick.grade}학년`;
  const box = $("clsBtns");
  box.innerHTML = "";
  for (let c = 1; c <= SCHOOL[pick.grade]; c++) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = `${c}반`;
    if (c === pick.cls) b.classList.add("on");
    b.onclick = () => { pick.cls = c; renderClassPicker(); };
    box.appendChild(b);
  }
}
function renderTitle() {
  renderClassPicker();
  // 캐릭터: 시안 그림의 16칸 위에 같은 초상화 버튼
  document.querySelectorAll("#swatches .ssAv").forEach((b) => {
    const i = Number(b.dataset.i), c = SKIN_COLORS[i];
    const img = b.querySelector("img");
    if (!img.getAttribute("src")) img.src = AVATAR_IMG(i);
    img.alt = AVATAR_NAMES[i]; b.title = AVATAR_NAMES[i]; b.setAttribute("aria-label", AVATAR_NAMES[i]);
    b.classList.toggle("on", c === G.color);
    b.onclick = () => { Sound.init(); Sound.play("pop"); setHeroColor(c); try { localStorage.setItem("st-color", c); } catch (e) {} renderTitle(); };
  });
  $("ssCount").textContent = `${$("nameInput").value.length}/10`;
  renderTitleUnit();
}
// 첫 화면 「오늘의 문제」: 선생님이 정한 단원 (교실이 아직 없으면 2단원)
function renderTitleUnit() {
  const u = G.unit || UNITS[0];
  $("titleEyebrow").textContent = `📚 오늘의 문제 · ${u.grade.replace(" 2학기", "")} 과학 ${u.no === "종합" ? "2·3단원 종합" : u.no + "단원 「" + u.title + "」"}`;
}
// 첫 화면에서도 선생님이 단원을 바꾸면 바로 반영
let titleUnitOff = null;
async function watchTitleUnit() {
  if (!Net.configured() || titleUnitOff) return;
  if (!(await Net.init())) return;
  const mref = Net.room("0000").child("settings/map");
  const mfn = (snap) => { if (G.state === "title") applyMapStyle(snap.val()); };
  mref.on("value", mfn);
  const ref = Net.room("0000").child("meta/unit");
  const fn = (snap) => {
    const u = UNITS.find((x) => x.id === snap.val());
    if (u && u !== G.unit && G.state === "title") { setupWorld(u); prepareRun(); }
    if (G.state === "title") renderTitleUnit();
  };
  ref.on("value", fn);
  titleUnitOff = () => { ref.off("value", fn); mref.off("value", mfn); };
}
$("nameInput").addEventListener("input", () => { $("ssCount").textContent = `${$("nameInput").value.length}/10`; $("titleErr").textContent = ""; });
$("ssSoundBtn").addEventListener("click", () => { Sound.init(); toggleSound(); $("ssSoundBtn").classList.toggle("off", Sound.muted); });
$("ssSetBtn").addEventListener("click", (e) => { e.stopPropagation(); $("ssMenu").classList.toggle("hidden"); });
document.addEventListener("click", (e) => { if (!e.target.closest || !e.target.closest("#ssMenu")) $("ssMenu").classList.add("hidden"); });
$("startBtn").addEventListener("click", async () => {
  Sound.init();
  $("titleErr").textContent = "";
  const code = "0000", name = $("nameInput").value.trim().replace(/\s+/g, " ");
  if (!pick.cls) { $("titleErr").textContent = "우리 반을 먼저 눌러 주세요!"; return; }
  if (!name) { $("titleErr").textContent = "별명을 써 주세요!"; $("nameInput").focus(); return; }
  if (/[.#$\[\]\/]/.test(name)) { $("titleErr").textContent = "별명에 . # $ [ ] / 는 쓸 수 없어요."; return; }
  try { localStorage.setItem("st-name", name); localStorage.setItem("st-grade", pick.grade); localStorage.setItem("st-cls", pick.cls); } catch (e) {}
  if (!Net.configured()) {
    // 공동 접속 서버(Firebase)가 아직 없으면: 혼자서 바로 게임
    setupWorld(soloUnit || UNITS[0]);
    prepareRun(); startRun();
    toast("지금은 혼자 도전 중이에요 · 선생님이 서버를 연결하면 친구들과 함께해요");
    return;
  }
  const btn = $("startBtn");
  btn.disabled = true; btn.textContent = "들어가는 중…";
  try {
    await joinRoom(code, name, pick.grade, pick.cls);
  } catch (e) {
    $("titleErr").textContent = e.message;
  } finally { btn.disabled = false; renderTitle(); }
});
$("howBtn").addEventListener("click", () => showScreen("howScreen"));
$("titleRankBtn").addEventListener("click", () => openRankScreen("titleScreen"));
$("menuRankBtn").addEventListener("click", () => openRankScreen("pauseScreen"));
$("rcMore").addEventListener("click", () => { if (G.state === "play") { openMenu(); openRankScreen("pauseScreen"); } });
$("howClose").addEventListener("click", () => {
  if (G.state === "title") showScreen("titleScreen");
  else if (G.state === "menu" || G.state === "paused") showScreen("pauseScreen");
  else showScreen(null);
});

function initStudent() {
  try {
    const c = localStorage.getItem("st-color"); if (c && SKIN_COLORS.includes(c)) G.color = c;
    $("nameInput").value = localStorage.getItem("st-name") || "";
    const gr = Number(localStorage.getItem("st-grade")), cl = Number(localStorage.getItem("st-cls"));
    if (SCHOOL[gr]) { pick.grade = gr; if (cl >= 1 && cl <= SCHOOL[gr]) pick.cls = cl; }
  } catch (e) {}
  const params = new URLSearchParams(location.search);
  if (params.get("room")) $("roomInput").value = params.get("room");
  const uParam = params.get("unit");
  soloUnit = UNITS.find((u) => u.id === uParam) || UNITS[0];
  titleTab = "room";
  setupWorld(soloUnit);
  prepareRun();
  renderTitle();
  showScreen("titleScreen");
  $("soundBtn").classList.toggle("off", Sound.muted);
  $("ssSoundBtn").classList.toggle("off", Sound.muted);
  watchTitleUnit();
}

// ===================================================================
// 랭킹 (rank.js 의 점수 계산을 씀)
// ===================================================================
function runRecord() {
  let firstTry = 0, retry = 0;
  for (let f = 1; f <= G.C.TOTAL; f++) if (G.solved[f]) { if (G.floorQ[f].tries === 0) firstTry++; else retry++; }
  const finished = G.state === "finish" && G.finishTime > 0;
  const time = Math.round(finished ? G.finishTime : G.runTime);
  return { firstTry, retry, finished, time, score: calcScore({ firstTry, retry, finished, time }).total };
}
function myRankKey() { return G.room ? rankKey(G.room.grade, G.room.cls, G.room.name) : null; }
let rankSubmitted = false;
async function submitRank() {
  if (!G.room || !Net.enabled || rankSubmitted) return;
  const r = runRecord();
  if (!r.firstTry && !r.retry) return;
  rankSubmitted = true;
  try {
    await Rank.submit(G.unit.id, { nick: G.room.name, grade: G.room.grade, cls: G.room.cls, ...r });
  } catch (e) { console.warn(e); }
}
function renderRankCard() {
  if (!G.room || !$("rankCard")) return;
  const { grade, cls } = G.room, key = myRankKey();
  const cl = Rank.classList(grade, cls), gl = Rank.gradeList(grade);
  $("rcUnit").textContent = `${G.unit.no}단원`;
  const top = (list, who, sc) => {
    if (list[0]) { $(who).textContent = rankWho(list[0]); $(sc).textContent = list[0].score + "점"; }
    else { $(who).textContent = "아직 없어요"; $(sc).textContent = ""; }
  };
  top(gl, "rcGr1", "rcGr1s");
  const mine = cl.find((r) => r.key === key);
  if (mine) {
    $("rcMe").textContent = `반 ${Rank.placeOf(key, cl)}위 · 학년 ${Rank.placeOf(key, gl)}위`;
    $("rcMes").textContent = mine.score + "점";
  } else { $("rcMe").textContent = `${cls}반 ${G.room.name}`; $("rcMes").textContent = "기록 없음"; }
  const r = runRecord();
  if (G.state === "play" || G.state === "menu") {
    const sc = calcScore(r);
    $("rcNow").innerHTML = `이번 판 <b>${sc.total}점</b> (문제 ${sc.q}) · 지금 이 점수면 반 <b>${Rank.wouldPlace(sc.total, r.time, false, cl, key)}위</b>`;
  } else $("rcNow").textContent = "";
  // 1위가 바뀌면 살짝 반짝
  const sig = (cl[0] && cl[0].key) + "|" + (gl[0] && gl[0].key);
  if (renderRankCard.sig && renderRankCard.sig !== sig) { const c = $("rankCard"); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }
  renderRankCard.sig = sig;
}
function renderResultRank() {
  const el = $("resRank");
  if (!G.room || !Net.enabled) { el.innerHTML = ""; return; }
  const r = runRecord(), sc = calcScore(r), key = myRankKey();
  const cl = Rank.classList(G.room.grade, G.room.cls), gl = Rank.gradeList(G.room.grade);
  const mine = cl.find((x) => x.key === key);
  const best = mine && mine.score > sc.total;
  el.innerHTML = `<div class="resRank">
    <div><b>${sc.total}점</b><small>이번 판 점수</small></div>
    <div><b>${mine ? Rank.placeOf(key, cl) + "위" : "-"}</b><small>${G.room.cls}반 랭킹</small></div>
    <div><b>${mine ? Rank.placeOf(key, gl) + "위" : "-"}</b><small>${G.room.grade}학년 랭킹</small></div>
    <div class="sub">문제 점수 ${sc.q} + 시간 점수 ${sc.t}${best ? ` · 내 최고 기록은 ${mine.score}점이에요` : ""}</div>
  </div>`;
}
Rank.listeners.add(() => {
  renderRankCard();
  if (!$("resultScreen").classList.contains("hidden")) renderResultRank();
  if (!$("rankScreen").classList.contains("hidden")) renderRankScreen();
});

// 랭킹 전체 보기 화면
const RS = { back: "titleScreen", unit: null, grade: 3, cls: 1, tempWatch: false };
async function openRankScreen(back) {
  RS.back = back;
  RS.unit = G.unit || UNITS[0];
  RS.grade = G.room ? G.room.grade : pick.grade;
  RS.cls = G.room ? G.room.cls : pick.cls || 1;
  showScreen("rankScreen");
  if (!(await Net.init())) {
    $("rsClsList").innerHTML = `<div class="rkEmpty">랭킹은 선생님이 방 기능(Firebase)을 설정하면 볼 수 있어요.</div>`;
    $("rsGradeList").innerHTML = "";
    return;
  }
  if (!G.room || Rank.unitId !== RS.unit.id) { Rank.watch(RS.unit.id); RS.tempWatch = !G.room; }
  renderRankScreen();
}
function renderRankScreen() {
  const u = RS.unit;
  $("rsUnitName").textContent = `${u.grade} ${u.no}단원 「${u.title}」`;
  $("rsUnits").innerHTML = UNITS.map((x) => `<button data-u="${x.id}" class="${x === u ? "on" : ""}">${x.no}단원 ${esc(x.title)}</button>`).join("");
  $("rsUnits").querySelectorAll("button").forEach((b) => (b.onclick = () => { RS.unit = UNITS.find((x) => x.id === b.dataset.u); Rank.watch(RS.unit.id); renderRankScreen(); }));
  $("rsRule").textContent = `점수 = 문제 점수(한 번에 맞히면 ${SCORE.first}점, 다시 맞히면 ${SCORE.retry}점) + 시간 점수(정상 도착 시 최대 ${SCORE.timeMax}점, ${SCORE.secPerPoint}초마다 1점씩 줄고 최소 ${SCORE.timeMin}점). 점수가 같으면 빨리 도착한 친구가 위예요.`;
  // 학생은 반별 순위표를 탐색하지 않고 자신의 반 순위만 확인합니다.
  // 교사 전체 순위표는 teacher.js에서 별도 유지합니다.
  if (G.room) { RS.grade = G.room.grade; RS.cls = G.room.cls; }
  $("rsCls").innerHTML = G.room
    ? `<span class="studentOwnClass">내 반 · ${RS.grade}학년 ${RS.cls}반</span>`
    : `<span class="studentOwnClass">입장한 뒤 내 반 순위를 확인할 수 있어요</span>`;
  $("rsGradeTitle").textContent = `${RS.grade}학년 랭킹 TOP 10`;
  const key = myRankKey();
  const mine = Rank.classList(RS.grade, RS.cls).find((r) => r.key === key);
  const myPlace = Rank.placeOf(key, Rank.classList(RS.grade, RS.cls));
  $("rsClsList").innerHTML = mine ? `<div class="myRankBig"><span>내 반 순위</span><strong>${myPlace}위</strong><p>${esc(mine.nick)} · ${mine.score}점 · ${fmtTime(mine.time)}</p></div>` : `<div class="myRankBig"><span>내 반 순위</span><strong>도전 전!</strong><p>게임을 완료하면 내 순위가 나와요.</p></div>`;
  $("rsGradeList").innerHTML = rankTableHTML(Rank.gradeList(RS.grade), key);
}
$("rsClose").addEventListener("click", () => {
  if (G.room && Rank.unitId !== G.unit.id) Rank.watch(G.unit.id);
  if (!G.room && RS.tempWatch) Rank.unwatch();
  showScreen(RS.back);
});

// ===================================================================
// 게임 중 말풍선: 캐릭터 머리 위에 4.5초 동안
// ===================================================================
const _stkTex = {};
function setAvatarBubble(av, say) {
  if (!av) return;
  if (av.bubble) { av.group.remove(av.bubble); av.bubble.material.map.dispose(); av.bubble.material.dispose(); av.bubble = null; }
  let sp;
  if (say.stk) {
    const tex = _stkTex[say.stk] || (_stkTex[say.stk] = new THREE.TextureLoader().load(`assets/ui/k_${say.stk}.png`));
    tex.colorSpace = THREE.SRGBColorSpace;
    sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.clone ? tex : tex, transparent: true, depthTest: false }));
    sp.scale.set(1.5, 1.3, 1);
  } else {
    const col = { b: "#2f7fe0", p: "#ef4f9a", g: "#22a85a", y: "#d99a00", v: "#8a55e0", o: "#f07a1a", r: "#e5383b" }[say.c] || "#2f7fe0";
    sp = textSprite(say.text, { size: 50, bg: "#ffffff", color: col, border: col, pad: 18, depthTest: false }, 0.62);
  }
  sp.position.y = av.tag ? 3.75 : 3.15;
  sp.renderOrder = 10;
  av.group.add(sp);
  av.bubble = sp; av.bubbleAt = performance.now();
}
function tickBubble(av) {
  const e = (performance.now() - av.bubbleAt) / 1000;
  if (e > 4.5) { av.group.remove(av.bubble); av.bubble = null; return; }
  const k = Math.min(1, e * 6), bob = Math.sin(e * 4) * 0.04;
  av.bubble.material.opacity = e > 4 ? (4.5 - e) * 2 : 1;
  av.bubble.position.y = (av.tag ? 3.75 : 3.15) + bob;
  av.bubble.scale.multiplyScalar(1);   // 크기는 처음 그대로
  if (k < 1) av.bubble.material.opacity = k;
}

// ===================================================================
// 버튼: 아이템(힌트 돋보기·날개) · 스킬(점프업 = 5초 빠르게) · 랭킹 · 소리
// ===================================================================
const SKILL = { dur: 5, cool: 20 };
function useSkill() {
  if (G.state !== "play" || now < (G.skillReady || 0)) return;
  G.boostUntil = now + SKILL.dur; G.skillReady = now + SKILL.cool;
  Sound.play("bounce"); toast("⚡ 점프업! 5초 동안 빨라져요");
}
function tickSkill() {
  const left = Math.max(0, (G.skillReady || 0) - now);
  const cd = $("skillCd"), btn = $("skillBtn");
  btn.classList.toggle("cool", left > 0);
  btn.classList.toggle("boost", now < (G.boostUntil || 0));
  cd.textContent = left > 0 ? Math.ceil(left) : "";
  cd.style.setProperty("--p", `${Math.round((left / SKILL.cool) * 100)}%`);
  const bl = $("bootLeft"); if (bl) bl.textContent = left > 0 ? `${Math.ceil(left)}초` : "준비";
}
$("skillBtn").addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); Sound.init(); useSkill(); });
function renderItems() {
  $("hintLeft").textContent = `${G.hints}개`; $("itemDot").textContent = G.hints;
  $("itemDot").classList.toggle("hidden", !G.hints);
  $("useHint").disabled = !G.hints;
}
$("itemBtn").addEventListener("click", (e) => { e.stopPropagation(); Sound.init(); renderItems(); $("itemPanel").classList.toggle("hidden"); });
$("ipClose").addEventListener("click", () => $("itemPanel").classList.add("hidden"));
$("useWing").addEventListener("click", () => { $("itemPanel").classList.add("hidden"); toFlag(); Sound.play("bounce"); $("game").focus(); });
$("useBoot").addEventListener("click", () => { $("itemPanel").classList.add("hidden"); useSkill(); });
$("useHint").addEventListener("click", () => {
  const f = G.qFloor;
  if (!f) { toast("🔍 문제 광장에 서 있을 때 쓸 수 있어요"); return; }
  if (!G.hints) return;
  const fq = G.floorQ[f];
  const cand = [0, 1, 2].filter((i) => i !== fq.correct && !fq.removed.includes(i));
  if (!cand.length) { toast("이미 정답만 남았어요!"); return; }
  const i = cand[Math.floor(Math.random() * cand.length)];
  fq.removed.push(i); G.hints--;
  dropQueue.push({ pad: G.C.floors[f].pads[i], at: now + 0.05 });
  const b = $("qOpts").children[i]; if (b) b.classList.add("gone");
  Sound.play("ding"); toast(`🔍 ${i + 1}번은 정답이 아니에요!`);
  renderItems(); $("itemPanel").classList.add("hidden"); $("game").focus();
});
$("hudRankBtn").addEventListener("click", () => { if (G.state === "play") { openMenu(); openRankScreen("pauseScreen"); } });
$("menuSoundBtn").addEventListener("click", () => { toggleSound(); toast(Sound.muted ? "🔇 소리를 껐어요" : "🔊 소리를 켰어요"); });
$("game").addEventListener("pointerdown", () => $("itemPanel").classList.add("hidden"));

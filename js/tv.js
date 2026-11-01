// ===================================================================
// tv.js — TV 중계 화면: 학생들이 탑을 오르는 모습을 스포츠 중계처럼 보여 줌
//   카메라가 학생을 차례로 따라가고(관문 통과·완주 같은 소식이 나오면 바로 그 학생으로),
//   가끔 탑 전체를 비춤. 오른쪽에 순위표, 아래에 자막과 소식 띠.
//   ?tv=1234 : 그 방을 중계 · ?tv=demo : 연습 로봇으로 미리보기
// ===================================================================
"use strict";
const TV = {
  code: null, demo: false, room: null, unit: null, C: null, M: null,
  players: new Map(),      // pid → { data, av, x,y,z,f, tx,ty,tz,tf, ... }
  status: "lobby", events: [], seenEv: new Set(),
  shot: { type: "wide", pid: null, start: 0, len: 6, n: 0 }, breaking: null,
  camPos: new THREE.Vector3(0, 60, 90), camLook: new THREE.Vector3(0, 30, 0),
  clockStart: 0, overlayT: 0, auto: true, pinned: null,
};
let tvNow = 0;

async function startTV(code) {
  TV.code = code;
  TV.watchOnly = new URLSearchParams(location.search).has("watch");   // 학생 「구경하기」
  TV.demo = code === "demo" || !Net.configured();
  $("titleScreen").classList.add("hidden");
  $("tvHud").classList.remove("hidden");
  document.body.style.cursor = "none";
  addEventListener("mousemove", () => { document.body.style.cursor = ""; clearTimeout(TV.curT); TV.curT = setTimeout(() => (document.body.style.cursor = "none"), 2500); });
  buildTvHud();
  if (TV.demo) {
    TV.seed = 1 + Math.floor(Math.random() * 1e9);
    setupTvWorld(UNITS.find((u) => u.id === new URLSearchParams(location.search).get("unit")) || UNITS[0]);
    startDemo();
    return;
  }
  const ok = await Net.init();
  if (!ok) { TV.demo = true; setupTvWorld(UNITS[0]); startDemo(); return; }
  TV.room = Net.room(code);
  const meta = await Net.roomExists(code);
  if (!meta) { $("tvWait").innerHTML = `<div><h2>방 ${esc(code)}이(가) 없어요</h2><p>교사 화면에서 「TV 중계 화면 열기」를 눌러 주세요.</p></div>`; setupTvWorld(UNITS[0]); return; }
  // 반의 장애물 배치(시드)가 바뀌면 TV 코스도 같이
  TV.room.child("settings/seed").on("value", (s) => { const sd = s.val() || 0; if (sd !== (TV.seed || 0)) { TV.seed = sd; if (TV.unit) setupTvWorld(TV.unit); } });
  TV.room.child("settings/map").on("value", (s) => { const st = s.val() === "stage" ? "stage" : "hd"; if (st !== MAP_STYLE || (TV.M && TV.M.style !== st)) { MAP_STYLE = st; if (TV.unit) setupTvWorld(TV.unit); } });
  TV.room.child("meta/unit").on("value", (s) => { const u = UNITS.find((x) => x.id === s.val()) || UNITS[0]; if (u !== TV.unit) setupTvWorld(u); });
  TV.room.child("state").on("value", (s) => { const v = (s.val() || {}).status; onTvState(["lobby", "play", "paused", "ended"].includes(v) ? v : "lobby"); });
  const pr = TV.room.child("players");
  pr.on("child_added", (s) => tvUpsert(s.key, s.val()));
  pr.on("child_changed", (s) => tvUpsert(s.key, s.val()));
  pr.on("child_removed", (s) => tvRemove(s.key));
  TV.room.child("events").limitToLast(20).on("child_added", (s) => tvEvent(s.key, s.val()));
}

function setupTvWorld(unit) {
  if (TV.M) scene.remove(TV.M.root);
  TV.unit = unit;
  TV.C = buildCourse(unit, TV.seed || 0);
  TV.M = buildWorldMeshes(scene, TV.C);
  scene.remove(TV.M.flag);
  // TV 화면에서는 관문 막을 반투명하게 열어 둠(학생마다 다름)
  TV.C.gates.forEach((g, zi) => g && setGateOpen(TV.M, zi, false));
  for (let f = 1; f <= TV.C.TOTAL; f++) TV.C.floors[f].pads.forEach((p) => setPadLabel(p, null));
  for (const p of TV.players.values()) { scene.add(p.av.group, p.av.blob); }
  $("tvUnit").textContent = `${unit.grade} ${unit.no}단원 「${unit.title}」`;
}

// ---------------- 화면 틀 ----------------
function buildTvHud() {
  $("tvHud").innerHTML = `
    <div class="tvFlash" id="tvFlash"></div>
    <div class="tvTop"><div class="tvLive"><i></i>LIVE</div><div class="tvTitle">과학 타워 레이스 생중계<small id="tvUnit"></small></div></div>
    <div class="tvClock" id="tvClock">00:00</div>
    <div class="tvCam" id="tvCam">CAM 1</div>
    <div class="tvBoard"><h3>실시간 순위 <small id="tvCount"></small></h3><div id="tvRows"></div></div>
    <div class="tvLower out" id="tvLower"><div class="lcol" id="tvLcol"></div><div class="lbox"><div class="ln" id="tvLn"></div><div class="ls" id="tvLs"></div><div class="lq hidden" id="tvLq"></div></div></div>
    <div class="tvBreaking" id="tvBreaking"></div>
    <div class="tvTicker"><b>속보</b><div class="tk" id="tvTicker"></div></div>
    <div class="tvWait hidden" id="tvWait"></div>
    <div class="tvPodium hidden" id="tvPodium"></div>
    <div class="tvCorner" id="tvCorner">${TV.watchOnly ? '<a class="tvBack" href="./">🎮 나도 게임하러 가기</a>' : ""}<button id="tvAuto">카메라: 자동</button><button id="tvFull">전체 화면</button></div>`;
  $("tvFull").onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); };
  $("tvAuto").onclick = () => { TV.auto = !TV.auto; TV.pinned = TV.auto ? null : TV.shot.pid; $("tvAuto").textContent = TV.auto ? "카메라: 자동" : "카메라: 고정"; };
  setTicker(["중계를 시작합니다! 과학 탑 꼭대기에 가장 먼저 오를 친구는 누구일까요?"]);
}
function setTicker(items) {
  const el = $("tvTicker");
  el.innerHTML = items.map((t) => `<span>${t}</span>`).join("");
  el.style.animationDuration = Math.max(18, el.textContent.length * 0.28) + "s";
}
function onTvState(st) {
  TV.status = st;
  if (st === "play" && !TV.clockStart) TV.clockStart = performance.now();
  if (st === "lobby") TV.clockStart = 0;
  const wait = $("tvWait");
  if (st === "lobby") {
    wait.classList.remove("hidden");
    const url = `${location.origin}${location.pathname}?room=${TV.code}`;
    wait.innerHTML = `<div><h2>곧 경기가 시작돼요!</h2><p>태블릿에서 게임을 열고 반·별명·캐릭터를 골라요</p><b>대기실</b><p style="font-size:2vh">${esc(url)}</p><p id="tvWaitN" style="margin-top:2vh"></p></div>`;
  } else wait.classList.add("hidden");
  if (st === "ended") showPodium(); else $("tvPodium").classList.add("hidden");
  if (st === "paused") showBreaking("잠시 쉬어 가요", "선생님 말씀 시간");
}

// ---------------- 선수(학생) ----------------
function tvUpsert(pid, d) {
  if (!d) return;
  let p = TV.players.get(pid);
  if (!p) {
    const label = `${d.num ? d.num + " " : ""}${d.name || "?"}`;
    const av = makeAvatar(d.color || "#4dabf7", label, { tagH: 0.6 });
    scene.add(av.group, av.blob);
    p = { pid, data: d, av, label, x: d.x ?? 0, y: d.y ?? 0, z: d.z ?? 0, f: d.f ?? 0, vis: 0 };
    if (d.x === undefined && TV.C) { const s = TV.C.plazas[0]; p.x = s.cx + (Math.random() - 0.5) * 4; p.y = s.maxY; p.z = s.cz + (Math.random() - 0.5) * 4; }
    TV.players.set(pid, p);
  }
  p.data = d;
  if (d.x !== undefined) { p.tx = d.x; p.ty = d.y; p.tz = d.z; p.tf = d.f; }
}
function tvRemove(pid) {
  const p = TV.players.get(pid);
  if (!p) return;
  scene.remove(p.av.group, p.av.blob);
  TV.players.delete(pid);
}
function tvEvent(key, e) {
  if (!e || TV.seenEv.has(key)) return;
  TV.seenEv.add(key);
  TV.events.push(e);
  if (TV.events.length > 12) TV.events.shift();
  setTicker(TV.events.slice().reverse().map((x) => `<em>${esc((x.num ? x.num + " " : "") + x.name)}</em> ${esc(x.text)}`));
  // 큰 소식이면 그 학생으로 바로 화면 전환
  if (["gate", "finish", "streak"].includes(e.type) && TV.players.has(e.pid) && (Date.now() - (e.t || Date.now()) < 15000 || TV.demo)) {
    TV.breaking = { pid: e.pid, at: tvNow };
    cutTo("follow", e.pid, 7);
    const title = e.type === "finish" ? "정상 도착!" : e.type === "gate" ? "관문 통과!" : "연속 정답!";
    showBreaking(`${(e.num ? e.num + " " : "") + e.name} ${title}`, e.type === "finish" ? "축하합니다" : "속보");
  }
}
let breakTimer = 0;
function showBreaking(text, small) {
  const b = $("tvBreaking");
  b.innerHTML = `<small>${esc(small || "속보")}</small>${esc(text)}`;
  b.classList.add("on");
  clearTimeout(breakTimer); breakTimer = setTimeout(() => b.classList.remove("on"), 3600);
}
function tvRanked() {
  return [...TV.players.values()].filter((p) => p.data.online !== false)
    .sort((a, b) => (!!b.data.finished - !!a.data.finished) || (a.data.finished && b.data.finished ? a.data.time - b.data.time : 0) || (b.data.cp || 0) - (a.data.cp || 0) || (b.data.correct || 0) - (a.data.correct || 0));
}

// ---------------- 카메라 감독 ----------------
function cutTo(type, pid, len) {
  const s = TV.shot;
  if (s.type === type && s.pid === pid) { s.len = Math.max(s.len, tvNow - s.start + len); return; }
  TV.shot = { type, pid, start: tvNow, len, n: s.n + 1 };
  const fl = $("tvFlash"); fl.classList.add("on"); requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove("on")));
  $("tvCam").textContent = type === "wide" ? "CAM 1 · 전체" : type === "top" ? "CAM 2 · 하늘" : `CAM ${3 + (TV.shot.n % 4)} · 선수`;
  if (TV.room && !TV.watchOnly && type === "follow") TV.room.child("feature").set(pid);
  if (TV.room && !TV.watchOnly && type !== "follow") TV.room.child("feature").set(null);
  // 바로 다음 위치로 (부드럽게 따라가지 않고 화면이 바뀌는 느낌)
  TV.jump = true;
  updateLowerThird(true);
}
function pickNextShot() {
  const list = tvRanked().filter((p) => p.vis > 0.5);
  const n = TV.shot.n;
  if (!list.length || TV.status === "lobby") { cutTo("wide", null, 10); return; }
  if (!TV.auto && TV.pinned && TV.players.has(TV.pinned)) { cutTo("follow", TV.pinned, 30); return; }
  if (n % 4 === 3) { cutTo(n % 8 === 7 ? "top" : "wide", null, 6); return; }
  // 1위 → 아직 덜 나온 학생 → 문제 푸는 중인 학생 순서로 고루 비춤
  const shown = TV.shownCount || (TV.shownCount = new Map());
  const candidates = list.filter((p) => !p.data.finished || list.every((q) => q.data.finished));
  let best = null, bestScore = -1e9;
  candidates.forEach((p, i) => {
    let sc = -(shown.get(p.pid) || 0) * 3 + (i === 0 ? 2 : 0) + (p.data.q ? 1.5 : 0) + Math.random();
    if (p.pid === TV.shot.pid) sc -= 10;
    if (sc > bestScore) { bestScore = sc; best = p; }
  });
  if (!best) best = list[0];
  shown.set(best.pid, (shown.get(best.pid) || 0) + 1);
  cutTo("follow", best.pid, 8);
}
function updateTvCamera(dt) {
  const s = TV.shot, C = TV.C;
  if (tvNow - s.start > s.len) pickNextShot();
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const p = s.pid && TV.players.get(s.pid);
  if (s.type === "follow" && p) {
    const back = 8.5, a = p.f + Math.sin((tvNow - s.start) * 0.25) * 0.35;
    pos.set(p.x - Math.sin(a) * back, p.y + 4.2, p.z - Math.cos(a) * back);
    look.set(p.x, p.y + 1.4, p.z);
  } else if (s.type === "top") {
    const list = tvRanked(); const lead = list[0];
    const y = lead ? lead.y : C.top * 0.5;
    const a = tvNow * 0.08;
    pos.set(Math.cos(a) * 30, y + 28, Math.sin(a) * 30);
    look.set(0, y - 4, 0);
  } else {
    const list = tvRanked();
    const ys = list.map((q) => q.y);
    const mid = ys.length ? (Math.max(...ys) + Math.min(...ys)) / 2 : C.top * 0.45;
    const span = ys.length ? Math.max(...ys) - Math.min(...ys) : C.top;
    const R = 55 + Math.min(80, span * 0.9), a = tvNow * 0.07;
    pos.set(Math.cos(a) * R, mid + 12, Math.sin(a) * R);
    look.set(0, mid, 0);
  }
  if (TV.jump) { TV.camPos.copy(pos); TV.camLook.copy(look); TV.jump = false; }
  else { const k = Math.min(1, dt * (s.type === "follow" ? 4 : 1.5)); TV.camPos.lerp(pos, k); TV.camLook.lerp(look, k); }
  camera.position.copy(TV.camPos);
  camera.lookAt(TV.camLook);
}

// ---------------- 자막·순위표 ----------------
function findQuestion(id) { return TV.unit.questions.find((q) => q.id === id); }
function updateLowerThird(force) {
  const el = $("tvLower"), s = TV.shot, p = s.pid && TV.players.get(s.pid);
  if (s.type !== "follow" || !p) { el.classList.add("out"); return; }
  const d = p.data, rank = tvRanked().findIndex((x) => x.pid === p.pid) + 1;
  $("tvLcol").style.background = d.color || "#4dabf7";
  $("tvLn").innerHTML = `${esc(p.label)} <small>${rank ? rank + "위" : ""}</small>`;
  const zone = TV.unit.zones[Math.min(TV.unit.zones.length - 1, d.zone || 0)];
  $("tvLs").textContent = d.finished ? `정상 도착! 기록 ${fmtTime(d.time)} · 맞힌 문제 ${d.correct || 0}개`
    : `${(d.zone || 0) + 1}구역 「${zone.name}」 · ${d.solved || 0}층 통과 · 맞힘 ${d.correct || 0} · 관문 ${d.gates || 0}`;
  const lq = $("tvLq");
  if (d.q && d.q.id) {
    const q = findQuestion(d.q.id);
    lq.textContent = q ? `지금 푸는 문제 · ${q.q}` : "";
    lq.classList.toggle("hidden", !q);
  } else if (d.q && d.q.text) { lq.textContent = `관문 문제 · ${d.q.text}`; lq.classList.remove("hidden"); }
  else lq.classList.add("hidden");
  if (force) { el.classList.add("out"); setTimeout(() => el.classList.remove("out"), 350); }
  else el.classList.remove("out");
  // 선수가 문제 광장에 있으면 그 층 발판에 보기 글자를 띄움
  if (TV.labelFloor && TV.labelFloor !== (d.q && d.q.f)) { TV.C.floors[TV.labelFloor].pads.forEach((pd) => setPadLabel(pd, null)); TV.labelFloor = 0; }
  if (d.q && d.q.f && TV.C.floors[d.q.f]) {
    TV.C.floors[d.q.f].pads.forEach((pd, i) => setPadLabel(pd, (d.q.r || []).includes(i) ? null : d.q.o[i]));
    TV.labelFloor = d.q.f;
  }
}
function updateBoard() {
  const list = tvRanked();
  $("tvCount").textContent = `${list.length}명`;
  $("tvRows").innerHTML = list.slice(0, 12).map((p, i) => {
    const d = p.data;
    return `<div class="tvRow ${TV.shot.pid === p.pid ? "feat" : ""}"><span class="rk">${i + 1}</span><span class="nm"><i style="background:${esc(d.color)}"></i>${esc(p.label)}</span><span class="fl ${d.finished ? "done" : ""}">${d.finished ? fmtTime(d.time) : `${d.solved || 0}층`}</span></div>`;
  }).join("") || `<div class="tvRow"><span></span><span class="nm">들어온 학생을 기다려요</span><span></span></div>`;
  const wn = $("tvWaitN");
  if (wn) wn.textContent = `지금 ${list.length}명 들어왔어요`;
  if (TV.status === "play" && TV.clockStart) $("tvClock").textContent = fmtTime((performance.now() - TV.clockStart) / 1000);
  else { const d = new Date(); $("tvClock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
}
function showPodium() {
  const list = tvRanked().slice(0, 5), medal = ["1위", "2위", "3위", "4위", "5위"];
  $("tvPodium").innerHTML = `<div class="pbox"><h2>오늘의 순위</h2>${list.map((p, i) => `<div class="prow"><span class="m">${medal[i]}</span><span>${esc(p.label)}</span><small>맞힘 ${p.data.correct || 0}</small><span>${p.data.finished ? fmtTime(p.data.time) : `${p.data.solved || 0}층`}</span></div>`).join("") || "<p>기록이 없어요</p>"}</div>`;
  $("tvPodium").classList.remove("hidden");
}

// ---------------- 매 프레임 ----------------
function tvFrame(dt, t) {
  tvNow = t;
  if (Sound.ctx) Sound.music("play");   // 교실 TV: 화면을 한 번 누르면 음악이 나와요
  if (!TV.C) return;
  updateDynamics(TV.C, t, dt);
  if (TV.demo) demoStep(dt);
  for (const p of TV.players.values()) {
    if (p.tx !== undefined) {
      const k = Math.min(1, dt * 9);
      const jumpFar = Math.hypot(p.tx - p.x, p.ty - p.y, p.tz - p.z) > 12;   // 순간이동(떨어져서 깃발로)은 바로
      if (jumpFar) { p.x = p.tx; p.y = p.ty; p.z = p.tz; }
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.z += (p.tz - p.z) * k;
      p.f = angleLerp(p.f, p.tf || 0, k);
    }
    const online = p.data.online !== false;
    p.vis += ((online ? 1 : 0) - p.vis) * Math.min(1, dt * 3);
    const av = p.av;
    av.group.visible = av.blob.visible = p.vis > 0.05;
    av.group.position.set(p.x, p.y, p.z);
    av.group.rotation.y = p.f;
    const a = p.data.a || 0;
    animateAvatar(av, dt, a === 1 ? 1 : 0, a !== 2, { cheer: p.data.finished && a === 0 ? t : 0 });
    av.blob.position.set(p.x, p.y + 0.03, p.z);
    av.blob.visible = av.group.visible && a !== 2;
    // 카메라 바로 앞 학생의 이름표는 숨김 (화면을 가리지 않게)
    // 선수 화면에서는 주인공 이름표만 (가까이 몰려 있으면 이름표가 겹쳐 보이지 않게)
    if (av.tag) av.tag.visible = p.pid === TV.shot.pid || TV.shot.type !== "follow" || camera.position.distanceTo(av.group.position) > 14;
  }
  animateWorld(TV.C, TV.M, t, dt);
  updateTvCamera(dt);
  if (t - TV.overlayT > 0.5) { TV.overlayT = t; updateBoard(); updateLowerThird(false); }
}

// ===================================================================
// 연습 로봇 (Firebase 없이 미리보기)
// ===================================================================
const BOT_NAMES = ["민준", "서연", "도윤", "하윤", "시우", "지우", "주원", "서아", "하준", "지아", "예준", "수아"];
function startDemo() {
  onTvState("play");
  TV.bots = [];
  const C = TV.C;
  BOT_NAMES.forEach((name, i) => {
    const pid = "bot" + i;
    const bot = { pid, idx: 0, k: 0, wait: Math.random() * 3, speed: 0.75 + Math.random() * 0.5, careful: 0.55 + Math.random() * 0.4, correct: 0, wrong: 0, gates: 0, time: 0, finished: false, from: null, to: null };
    TV.bots.push(bot);
    tvUpsert(pid, { name, num: String(i + 1), color: SKIN_COLORS[i % SKIN_COLORS.length], online: true, cp: 0, zone: 0, solved: 0, correct: 0, wrong: 0, gates: 0, finished: false, time: 0 });
    const p = TV.players.get(pid), s = C.plazas[0];
    p.x = p.tx = s.cx + ((i % 4) - 1.5) * 1.2; p.y = p.ty = s.maxY; p.z = p.tz = s.cz + (Math.floor(i / 4) - 1) * 1.2; p.f = p.tf = s.theta;
  });
  TV.demoT0 = tvNow;
}
let evId = 0;
function demoEvent(bot, type, text) {
  const d = TV.players.get(bot.pid).data;
  tvEvent("demo" + evId++, { t: Date.now(), pid: bot.pid, name: d.name, num: d.num, type, text });
}
function demoStep(dt) {
  const C = TV.C, path = C.path;
  for (const bot of TV.bots) {
    const p = TV.players.get(bot.pid), d = p.data;
    if (!bot.finished) bot.time += dt;
    if (bot.finished) { d.a = 0; continue; }
    if (bot.wait > 0) {
      bot.wait -= dt; d.a = 0;
      continue;
    }
    const cur = path[bot.idx], next = path[bot.idx + 1];
    if (!next) {
      bot.finished = true; d.finished = true; d.time = Math.round(bot.time); d.cp = C.MAX_CP; d.q = null;
      demoEvent(bot, "finish", `정상 도착! 기록 ${fmtTime(bot.time)}`);
      continue;
    }
    // 문제 광장: 잠깐 생각하고 답을 고름
    if (cur.plaza && !bot.thought) {
      const f = cur.s.floor, zi = C.floors[f].zone;
      const pool = TV.unit.questions.filter((q) => q.zone === zi + 1);
      const q = pool[(f * 7 + bot.pid.length + Number(bot.pid.slice(3))) % pool.length];
      const right = q.options[q.answer], others = q.options.filter((_, i) => i !== q.answer).slice(0, 2);
      bot.q = { f, id: q.id, o: [others[0], right, others[1]], r: [] };
      d.q = bot.q;
      bot.thought = true; bot.wait = 1.5 + Math.random() * 3.5;
      continue;
    }
    const isOpt = next.option;
    const sx = cur.s.cx, sy = cur.s.maxY, sz = cur.s.cz;
    let ex = next.s.cx, ey = next.s.maxY, ez = next.s.cz;
    let wrongPad = false;
    if (isOpt) {
      wrongPad = bot.q && Math.random() > bot.careful && !bot.retry;
      const pad = C.floors[next.floor].pads[wrongPad ? 0 : 1];
      ex = pad.cx; ey = pad.maxY; ez = pad.cz;
    }
    const dist = Math.hypot(ex - sx, ez - sz), dur = Math.max(0.45, dist / (6.5 * bot.speed));
    bot.k += dt / dur;
    const k = Math.min(1, bot.k);
    p.tx = sx + (ex - sx) * k; p.tz = sz + (ez - sz) * k;
    p.ty = sy + (ey - sy) * k + Math.sin(k * Math.PI) * (next.s.kind === "bounce" || cur.s.kind === "bounce" ? 6 : 1.8);
    p.tf = Math.atan2(ex - sx, ez - sz);
    d.a = 2;
    if (k >= 1) {
      bot.k = 0;
      if (isOpt && wrongPad) {
        // 틀림: 그 층 처음으로 돌아감
        bot.wrong++; d.wrong = bot.wrong; bot.retry = true; bot.q.r = [0]; d.q = { ...bot.q };
        let back = bot.idx; while (back > 0 && path[back].s.kind !== "strip") back--;
        bot.idx = back; bot.thought = false; bot.wait = 0.8;
        const s = path[back].s; p.x = p.tx = s.cx; p.y = p.ty = s.maxY; p.z = p.tz = s.cz;
        continue;
      }
      bot.idx++;
      const s = path[bot.idx].s;
      if (isOpt) { bot.correct++; d.correct = bot.correct; d.solved = (d.solved || 0) + 1; bot.retry = false; bot.thought = false; d.q = null; if (bot.correct % 5 === 0 && Math.random() < 0.5) demoEvent(bot, "streak", `${bot.correct}문제째 정답!`); }
      if (s.cp) d.cp = Math.max(d.cp || 0, s.cp);
      d.zone = s.zone || 0;
      if (s.gate) { bot.wait = 2 + Math.random() * 3; d.q = { g: s.gate.zone, text: (TV.unit.gates.find((g) => g.zone === s.gate.zone + 1) || {}).q || "" }; bot.atGate = s.gate.zone; }
      else if (bot.atGate !== undefined) { bot.gates++; d.gates = bot.gates; demoEvent(bot, "gate", `${bot.atGate + 1}구역 관문 통과!`); bot.atGate = undefined; d.q = null; }
      bot.wait = Math.max(bot.wait, s.kind === "pad" ? 0.05 : 0.25);
    }
  }
}

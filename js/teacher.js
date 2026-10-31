// ===================================================================
// teacher.js — 교사 화면: 방 만들기, 시작·멈춤·끝, 설정, 학생 현황, 문제 끄고 켜기, 알림, 결과 내려받기
// ===================================================================
"use strict";
const T = {
  code: null, room: null, meta: null, state: { status: "lobby" }, settings: { wrongTo: "course", gates: true, photos: true },
  off: {}, players: {}, answers: {}, events: [], unit: UNITS[0], playStart: 0, renderTimer: 0, offs: [],
  rankGrade: Number(Object.keys(SCHOOL)[0]), rankCls: 1, sortBy: "floor",
};
const tEl = () => $("teacherApp");
const STATUS_TXT = { lobby: "대기 중", play: "진행 중", paused: "일시정지", ended: "종료" };
const WRONG_TO = [["floor", "그 층 광장"], ["course", "그 층 처음"], ["zone", "구역 처음"]];
const joinUrl = (code) => `${location.origin}${location.pathname}?room=${code}`;
const tvUrl = (code) => `${location.origin}${location.pathname}?tv=${code}`;

async function startTeacher() {
  document.body.style.touchAction = "auto";
  tEl().classList.remove("hidden");
  $("titleScreen").classList.add("hidden");
  $("game").classList.add("hidden");
  if (!Net.configured()) { renderSetupGuide(); return; }
  tEl().innerHTML = `<div class="tWrap"><div class="empty">연결하는 중…</div></div>`;
  const ok = await Net.init();
  if (!ok) { tEl().innerHTML = `<div class="tWrap"><div class="tCard"><h2>연결할 수 없어요</h2><p class="tNote">인터넷 연결과 firebase-config.js 설정을 확인해 주세요.</p></div></div>`; return; }
  await ensureEasyRoom();
}

// 학생은 별도 코드를 쓰지 않고 이 학교의 기본 교실(0000)에 입장합니다.
async function ensureEasyRoom() {
  const code = "0000";
  if (!(await Net.roomExists(code))) {
    await Net.room(code).set({
      meta: { unit: T.unit.id, createdAt: Net.TS() },
      state: { status: "lobby", t: Net.TS() },
      settings: { wrongTo: "course", gates: true, photos: true }
    });
  }
  openTeacherRoom(code);
}

function renderSetupGuide() {
  tEl().innerHTML = `
  <div class="tWrap setup">
    <div class="tCard">
      <h2>교사 화면을 쓰려면 Firebase를 한 번 연결해 주세요</h2>
      <p class="tNote">학생 기기와 교사 화면, TV 화면이 실시간으로 이어지려면 무료 Firebase 실시간 데이터베이스가 필요해요. 처음 한 번만 하면 돼요. (README.md에 그림 없이 같은 내용이 있어요)</p>
      <ol>
        <li><b>console.firebase.google.com</b>에서 프로젝트 만들기 (이름 예: science-tower, 애널리틱스는 꺼도 돼요)</li>
        <li>왼쪽 메뉴 <b>빌드 → Realtime Database → 데이터베이스 만들기</b> · 위치는 <b>싱가포르(asia-southeast1)</b> · <b>테스트 모드</b>로 시작</li>
        <li><b>규칙</b> 탭에 아래 내용을 붙여 넣고 <b>게시</b></li>
      </ol>
<pre>{
  "rules": {
    "rooms": {
      "$code": {
        ".read": true,
        ".write": true,
        ".validate": "$code.matches(/^[0-9]{4}$/)"
      }
    },
    "ranks": {
      ".read": true,
      ".write": true
    }
  }
}</pre>
      <ol start="4">
        <li><b>프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱 추가(&lt;/&gt;)</b> · 이름만 쓰고 등록</li>
        <li>나오는 <code>firebaseConfig = { … }</code> 안의 값을 <b>firebase-config.js</b>에 붙여 넣기</li>
        <li>GitHub에 다시 올리고 이 화면을 새로 고침</li>
      </ol>
      <div class="tRow" style="margin-top:14px">
        <a class="tBtn tv" href="?tv=demo" target="_blank">TV 중계 화면 미리보기 (연습 로봇)</a>
        <a class="tBtn" href="./?solo">학생 게임 해 보기</a>
      </div>
    </div>
  </div>`;
}

function renderCreate() {
  tEl().innerHTML = `
  <div class="tWrap" style="max-width:640px">
    <div class="tTop"><h1>과학 점프맵 · 선생님 관리실</h1></div>
    <div class="tCard">
      <h2>새 방 만들기</h2>
      <div class="tLabel">단원</div>
      <div class="unitPick" id="tUnits"></div>
      <div class="tRow" style="margin-top:14px"><button class="tBtn primary" id="tCreate">방 만들기</button></div>
      <div class="tLabel">이미 만든 방 열기</div>
      <div class="tRow"><input class="tField" id="tOpenCode" inputmode="numeric" maxlength="4" placeholder="방 번호 4자리" style="max-width:180px"><button class="tBtn" id="tOpen">열기</button></div>
      <p class="tNote" id="tErr"></p>
    </div>
    <div class="tRow"><a class="tBtn tv" href="?tv=demo" target="_blank">TV 중계 화면 미리보기 (연습 로봇)</a></div>
  </div>`;
  const box = $("tUnits");
  const draw = () => {
    box.innerHTML = "";
    for (const u of UNITS) {
      const b = document.createElement("button");
      b.className = "unitCard" + (T.unit === u ? " on" : "");
      b.innerHTML = `<span class="ub" style="background:${u.zones[0].color}">${u.no}</span><span><b>${esc(u.title)} ${u.draft ? '<span class="badge">문제 초안</span>' : ""}</b><small>${esc(u.grade)} ${u.no === "종합" ? "2·3단원 통합" : u.no + "단원"} · 문제 ${u.questions.length}개 · 관문 ${u.gates.length}개 · ${u.zones.length * (u.floorsPerZone || 3)}층</small></span>`;
      b.onclick = () => { T.unit = u; draw(); };
      box.appendChild(b);
    }
  };
  draw();
  $("tCreate").onclick = createRoom;
  $("tOpen").onclick = async () => {
    const c = $("tOpenCode").value.trim();
    if (!/^\d{4}$/.test(c)) return ($("tErr").textContent = "4자리 숫자를 써 주세요.");
    if (!(await Net.roomExists(c))) return ($("tErr").textContent = "그 방이 없어요.");
    openTeacherRoom(c);
  };
}

async function createRoom() {
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    const m = await Net.roomExists(c);
    // 하루 넘게 지난 방 번호는 다시 써도 됨
    if (!m || Net.now() - (m.createdAt || 0) > 86400000) code = c;
  }
  if (!code) { alert("방 번호를 만들지 못했어요. 다시 눌러 주세요."); return; }
  await Net.room(code).set({
    meta: { unit: T.unit.id, createdAt: Net.TS() },
    state: { status: "lobby", t: Net.TS() },
    settings: { wrongTo: "course", gates: true, photos: true },
  });
  openTeacherRoom(code);
}

function openTeacherRoom(code) {
  T.offs.forEach((f) => f()); T.offs = [];
  T.code = code; T.room = Net.room(code);
  try { localStorage.setItem("st-teacher-room", code); } catch (e) {}
  history.replaceState(null, "", `?teacher=${code}`);
  const on = (path, ev, fn) => { const r = T.room.child(path); r.on(ev, fn); T.offs.push(() => r.off(ev, fn)); };
  on("meta", "value", (s) => { T.meta = s.val() || {}; T.unit = UNITS.find((u) => u.id === T.meta.unit) || UNITS[0]; scheduleRender(true); });
  on("state", "value", (s) => { T.state = s.val() || { status: "lobby" }; if (T.state.status === "play" && !T.playStart) T.playStart = Date.now(); scheduleRender(true); });
  on("settings", "value", (s) => { T.settings = { wrongTo: "course", gates: true, photos: true, ...(s.val() || {}) }; scheduleRender(true); });
  on("off", "value", (s) => { T.off = s.val() || {}; scheduleRender(true); });
  on("players", "value", (s) => { T.players = s.val() || {}; scheduleRender(); });
  on("answers", "value", (s) => { T.answers = s.val() || {}; scheduleRender(); });
  const evRef = T.room.child("events").limitToLast(40);
  const evFn = (s) => { T.events.push(s.val()); if (T.events.length > 40) T.events.shift(); scheduleRender(); };
  evRef.on("child_added", evFn); T.offs.push(() => evRef.off("child_added", evFn));
  renderTeacherShell();
}

let renderQueued = false;
function scheduleRender(full) {
  if (full) { renderTeacherShell(); return; }
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; renderLive(); }, 600);
}
function setState(status) { T.room.child("state").set({ status, t: Net.TS() }); }
function setSetting(k, v) { T.room.child("settings/" + k).set(v); }
function sendCmd(pid, type) { T.room.child("cmd/" + pid).set({ type, t: Net.TS() }); }

function renderTeacherShell() {
  const st = ["lobby", "play", "paused", "ended"].includes(T.state.status) ? T.state.status : "lobby", u = T.unit, S = T.settings;
  const scroll = tEl().scrollTop;
  const diff = S.wrongTo === "floor" ? "easy" : S.wrongTo === "zone" ? "hard" : "normal";
  const UI = (f) => `assets/ui/${f}.png`;
  const hd = (f, alt, id = "") => `<h2 class="twHd"${id ? ` id="${id}"` : ""}><img src="${UI(f)}" alt="${alt}"></h2>`;
  const unitIcon = (x) => (x.id === "u2" ? "🌍" : x.id === "u3" ? "🔊" : "📚");
  const STATE_BADGE = { lobby: ["t_s_wait", "대기 중"], play: ["t_s_play", "진행 중"], paused: ["t_s_pause", "일시정지"], ended: ["t_s_off", "종료"] };
  tEl().innerHTML = `
  <div class="tWrap tw">
    <header class="twTop">
      <img class="twLogo" src="${UI("t_logo")}" alt="과학 점프맵 교사 관리창">
      <nav class="twNav twNavImg">
        <a href="#twGame" class="on"><img src="${UI("tb_nav_dash")}" alt="대시보드"></a>
        <a href="#tSectionProblems"><img src="${UI("tb_nav_prob")}" alt="문제 관리"></a>
        <a href="#tSectionPlayers"><img src="${UI("tb_nav_stu")}" alt="학생 현황"></a>
        <a href="#tSectionRanking"><img src="${UI("tb_nav_crank")}" alt="반별 랭킹"></a>
        <a href="#tRankGrBox"><img src="${UI("tb_nav_grank")}" alt="학년 랭킹"></a>
        <a href="#twUnit"><img src="${UI("tb_nav_set")}" alt="설정"></a>
      </nav>
      <div class="twState"><img src="${UI(STATE_BADGE[st][0])}" alt="${STATE_BADGE[st][1]}"><button class="twTv imgTb" id="tTv" title="TV 중계 화면 열기"><img src="${UI("tb_p_preview")}" alt="미리보기 (TV 중계)"></button></div>
    </header>

    <div class="twGrid3">
      <section class="twPanel" id="twUnit">
        ${hd("t_hd_unit", "단원 선택")}
        <div class="twUnits" id="tUnitSeg">${UNITS.map((x) => `<button data-u="${x.id}" class="twUnitImg ${x === u ? "on" : ""}"><img src="${UI("tb_" + (x.id === "u2" ? "u2" : x.id === "u3" ? "u3" : "mix") + (x === u ? "_on" : "_off"))}" alt="${x.no === "종합" ? "종합" : x.no + "단원"}"><small>${esc(x.title)}</small>${x.draft ? '<em>초안</em>' : ""}</button>`).join("")}</div>
        <p class="twNote">고른 단원이 <b>학생 첫 화면·대기실·게임</b>에 바로 반영돼요. 게임 중에 바꾸면 모두 새 문제로 1층부터 다시 출발해요.</p>
      </section>

      <section class="twPanel">
        ${hd("t_hd_diff", "게임 난이도")}
        <div class="twDiff" id="tWrongSeg">
          <button data-k="floor" class="${diff === "easy" ? "on" : ""}"><img src="${UI(diff === "easy" ? "tb_d_easy_on" : "tb_d_easy_off")}" alt="쉬움"><small>틀리면 그 층 광장으로</small></button>
          <button data-k="course" class="${diff === "normal" ? "on" : ""}"><img src="${UI(diff === "normal" ? "tb_d_norm_on" : "tb_d_norm_off")}" alt="보통"><small>틀리면 그 층 처음으로</small></button>
          <button data-k="zone" class="${diff === "hard" ? "on" : ""}"><img src="${UI(diff === "hard" ? "tb_d_hard_on" : "tb_d_hard_off")}" alt="어려움"><small>틀리면 구역 처음으로</small></button>
        </div>
        <h2 class="twH" id="twMap">🗺 맵 선택</h2>
        <div class="twMaps" id="tMapSeg">
          <button data-m="hd" class="${S.map !== "stage" ? "on" : ""}"><img src="assets/maps/map_hd.jpg" alt=""><b>30층 고화질 맵</b><small>석재 타워 · 금빛 장식</small></button>
          <button data-m="stage" class="${S.map === "stage" ? "on" : ""}"><img src="assets/maps/map_stage.jpg" alt=""><b>스테이지 6종 맵</b><small>하늘섬·숲·얼음·바다·우주·화산</small></button>
        </div>
        <p class="twNote">바꾸면 게임 중인 학생·TV 화면의 맵도 바로 바뀌어요 (진행 상황은 그대로).</p>
        ${hd("t_hd_qmode", "문제 출제 방식")}
        <div class="twSeg twSegImg" id="tOrderSeg">
          <button data-o="seq" class="${S.order === "seq" ? "on" : ""}"><img src="${UI("tb_x_order")}" alt="순서대로"></button>
          <button data-o="random" class="${S.order !== "seq" ? "on" : ""}"><img src="${UI("tb_x_random")}" alt="랜덤"></button>
        </div>
        <p class="twNote">순차: 단원 파일에 적힌 순서대로 · 랜덤: 학생마다 다른 순서 (다음 판부터 적용)</p>
      </section>

      <section class="twPanel" id="twGame">
        ${hd("t_hd_play", "게임 진행")}
        <div class="twPlay">
          <button id="tStart" class="imgBtn" ${st === "play" ? "disabled" : ""}><img src="${UI("tb_p_start")}" alt="${st === "paused" ? "다시 시작" : "게임 시작"}"></button>
          <button id="tPause" class="imgBtn" ${st !== "play" ? "disabled" : ""}><img src="${UI("tb_p_pause")}" alt="일시정지"></button>
          <button id="tEnd" class="imgBtn" ${st === "play" || st === "paused" ? "" : "disabled"}><img src="${UI("tb_p_end")}" alt="게임 종료"></button>
        </div>
        <div class="twPlay2"><button id="tLobby" class="imgBtn"><img src="${UI("t_btn_restart")}" alt="다시 시작 (새 판)"></button><span class="twNote">새 판: 기록을 지우고 모두 대기실로</span></div>
        <p class="twNote twFlow">${st === "lobby" ? "📣 학생들이 대기실에 모이는 중이에요. 「게임 시작」을 누르면 3·2·1 후 다 함께 출발해요." : st === "play" ? "🏃 게임 진행 중 · 지금 들어오는 학생은 대기실 없이 바로 출발해요." : st === "paused" ? "⏸ 일시정지 중 · 「게임 시작」을 누르면 이어서 진행해요." : "🏁 게임이 끝났어요 · 학생 화면에 결과가 나와 있어요. 「다시 시작」으로 새 판을 열어요."}</p>
        <div id="twEtc">${hd("t_hd_etc", "기타 설정")}</div>
        <div class="twToggles">
          <label class="twTg"><input type="checkbox" id="tGates" ${S.gates !== false ? "checked" : ""}><span>🚪 구역 끝 관문</span><i></i></label>
          <label class="twTg"><input type="checkbox" id="tPhotos" ${S.photos !== false ? "checked" : ""}><span>🖼 문제 사진</span><i></i></label>
        </div>
      </section>
    </div>

    <div class="twGrid2">
      <section class="twPanel">
        ${hd("t_hd_status", "학생 현황", "tSectionPlayers")}
        <div class="twBar"><span class="tNote" id="tSummary"></span>
          <span class="twSort" id="tSortSeg">${[["floor", "🔥 현재 층수"], ["time", "⏱ 완주 시간"], ["correct", "⭐ 정답 수"], ["name", "가나 이름순"]].map(([k, t]) => `<button data-s="${k}" class="${T.sortBy === k ? "on" : ""}">${t}</button>`).join("")}</span></div>
        <div style="overflow:auto"><table class="tTable" id="tPlayers"></table></div>
      </section>
      <section class="twPanel">
        ${hd("t_hd_class", "반 선택", "tSectionRanking")}
        <div class="twCls twClsImg" id="tRankCls">${Array.from({ length: SCHOOL[T.rankGrade] || 0 }, (_, i) => `<button data-c="${i + 1}" class="${T.rankCls === i + 1 ? "on" : ""}">${i < 7 ? `<img src="${UI("tb_c" + (i + 1))}" alt="${i + 1}반">` : `${i + 1}반`}</button>`).join("")}</div>
        <div class="tRankGrid">
          <div><div class="twSub"><span id="tRankClsTitle"></span></div><div id="tRankClsList"></div></div>
          <div id="tRankGrBox"><div class="twSub"><img src="${UI("t_top10")}" alt="">${T.rankGrade}학년 TOP 10</div><div id="tRankGrList"></div></div>
        </div>
        <div class="twBar"><span class="twNote">점수 = 문제(한 번에 ${SCORE.first}점·다시 ${SCORE.retry}점) + 시간(완주 시 최대 ${SCORE.timeMax}점)</span><button class="imgTb" id="tRankReset" title="랭킹 초기화"><img src="${UI("tb_p_reset")}" alt="랭킹 초기화"></button></div>
      </section>
    </div>

    <div class="twGrid2">
      <section class="twPanel">
        <h2 class="twH" id="tSectionHard">📊 많이 틀린 문제 <small>첫 시도 기준</small></h2>
        <ol class="hardList" id="tHard"></ol>
        <h2 class="twH">📣 학생 화면에 알림 보내기</h2>
        <div class="tRow"><input class="tField" id="tMsg" maxlength="40" placeholder="예: 5분 남았어요!" style="flex:1;font-size:15px"><button class="tBtn primary" id="tSend">보내기</button></div>
        <div class="tRow">${["5분 남았어요!", "손 내리고 선생님 봐요", "서로 도와 가며 해요", "정상까지 힘내요!"].map((m) => `<button class="tBtn sm qm">${m}</button>`).join("")}</div>
        <h2 class="twH">🔔 최근 소식</h2>
        <div id="tEvents" class="tNote"></div>
        <div class="tRow" style="margin-top:12px"><button class="imgTb" id="tCsv" title="결과 내려받기 (CSV)"><img src="${UI("tb_x_export")}" alt="내보내기"></button><span class="twNote">결과를 CSV 파일로 내려받아요</span></div>
      </section>
      <section class="twPanel">
        <h2 class="twH" id="tSectionProblems">📝 문제 관리 ${u.draft ? '<span class="badge">문제 초안 · 교과서와 확인해 주세요</span>' : ""}<small>끈 문제는 다음 판부터 안 나와요</small></h2>
        <div class="qList" id="tQList"></div>
        <p class="tNote">문제를 고치거나 더하려면 <code>units/unit${u.no}.js</code> 파일을 고쳐요. 종합은 2·3단원 문제를 합쳐 써요.</p>
      </section>
    </div>
    <p class="twFoot">학생 주소: <code>${esc(location.origin + location.pathname)}</code> · 반·별명·캐릭터만 고르면 들어와요</p>
  </div>`;
  tEl().scrollTop = scroll;
  const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  bind("tStart", () => { if (st === "ended") { $("tLobby").click(); return; } T.playStart = T.playStart || Date.now(); setState("play"); });
  bind("tPause", () => setState("paused"));
  bind("tEnd", () => { if (confirm("게임을 끝낼까요? 학생 화면에 결과가 나와요.")) setState("ended"); });
  document.querySelectorAll("#tMapSeg button").forEach((b) => (b.onclick = () => setSetting("map", b.dataset.m)));
  document.querySelectorAll("#tOrderSeg button").forEach((b) => (b.onclick = () => setSetting("order", b.dataset.o)));
  document.querySelectorAll("#tSortSeg button").forEach((b) => (b.onclick = () => { T.sortBy = b.dataset.s; document.querySelectorAll("#tSortSeg button").forEach((x) => x.classList.toggle("on", x === b)); renderLive(); }));
  bind("tLobby", async () => {
    if (!confirm("새 판을 열까요? 기록을 지우고 모든 학생이 대기실로 돌아가요.")) return;
    // 새 판: 이번 판 기록을 지우고 모두 1층부터 (먼저 「끝남」을 거쳐야 학생 화면이 새로 시작함)
    const upd = {};
    for (const pid of Object.keys(T.players)) Object.assign(upd, { [`players/${pid}/cp`]: 0, [`players/${pid}/floor`]: 0, [`players/${pid}/solved`]: 0, [`players/${pid}/correct`]: 0, [`players/${pid}/wrong`]: 0, [`players/${pid}/gates`]: 0, [`players/${pid}/falls`]: 0, [`players/${pid}/finished`]: false, [`players/${pid}/time`]: 0 });
    upd.answers = null; upd.events = null; upd.feature = null;
    upd.state = { status: "ended", t: Net.TS() };
    T.events = []; T.playStart = 0;
    for (const pid of Object.keys(T.players)) upd[`players/${pid}/ready`] = false;
    await T.room.update(upd);
    await T.room.child("state").set({ status: "lobby", t: Net.TS() });
  });
  bind("tTv", () => window.open(tvUrl(T.code), "science-tower-tv"));
  document.querySelectorAll("#tUnitSeg button").forEach((b) => (b.onclick = () => {
    if (b.dataset.u === u.id) return;
    const n = Object.values(T.players).filter((p) => p.online !== false).length;
    if (n && !confirm(`문제를 바꿀까요? 지금 뛰고 있는 ${n}명도 새 문제로 1층부터 다시 출발해요.`)) return;
    T.room.child("meta/unit").set(b.dataset.u);
  }));
  document.querySelectorAll("#tWrongSeg button").forEach((b) => (b.onclick = () => setSetting("wrongTo", b.dataset.k)));
  $("tGates").onchange = (e) => setSetting("gates", e.target.checked);
  $("tPhotos").onchange = (e) => setSetting("photos", e.target.checked);
  const send = (text) => { if (!text) return; T.room.child("msg").set({ text, t: Net.TS() }); $("tMsg").value = ""; };
  bind("tSend", () => send($("tMsg").value.trim()));
  $("tMsg").onkeydown = (e) => { if (e.key === "Enter") send($("tMsg").value.trim()); };
  document.querySelectorAll(".qm").forEach((b) => (b.onclick = () => send(b.textContent)));
  bind("tCsv", downloadCsv);
  bind("tNew", () => { T.offs.forEach((f) => f()); T.offs = []; history.replaceState(null, "", "?teacher"); try { localStorage.removeItem("st-teacher-room"); } catch (e) {} renderCreate(); });
  bind("tDel", async () => {
    if (!confirm(`현재 교실을 지울까요? 학생 기록이 모두 지워져요.`)) return;
    T.offs.forEach((f) => f()); T.offs = [];
    await T.room.remove();
    try { localStorage.removeItem("st-teacher-room"); } catch (e) {}
    history.replaceState(null, "", "?teacher");
    renderCreate();
  });
  document.querySelectorAll("#tRankCls button").forEach((b) => (b.onclick = () => { T.rankCls = Number(b.dataset.c); renderTeacherShell(); }));
  bind("tRankReset", async () => {
    if (!confirm("모든 단원의 랭킹 기록을 지울까요?\n반·학년 랭킹이 모두 사라지고 되돌릴 수 없어요.")) return;
    await Net.ref("ranks").remove();
    alert("랭킹을 초기화했어요.");
  });
  Rank.watch(u.id);
  renderQuestions();
  renderLive();
  renderTeacherRank();
}
function renderTeacherRank() {
  if (!$("tRankClsList")) return;
  $("tRankClsTitle").textContent = `${T.rankCls}반 전체 기록`;
  $("tRankClsList").innerHTML = rankTableHTML(Rank.classList(T.rankGrade, T.rankCls), null, 10000);
  $("tRankGrList").innerHTML = rankTableHTML(Rank.gradeList(T.rankGrade), null);
}
Rank.listeners.add(() => { if (MODE === "teacher") renderTeacherRank(); });

function rankedPlayers() {
  const L = Object.entries(T.players).map(([pid, p]) => ({ pid, ...p }));
  if (T.sortBy === "name") return L.sort((a, b) => (Number(a.cls) - Number(b.cls)) || String(a.name).localeCompare(String(b.name), "ko"));
  if (T.sortBy === "correct") return L.sort((a, b) => (b.correct || 0) - (a.correct || 0) || (b.cp || 0) - (a.cp || 0));
  if (T.sortBy === "time") return L.sort((a, b) => (!!b.finished - !!a.finished) || (a.time || 1e9) - (b.time || 1e9));
  return L.sort((a, b) => (b.finished - a.finished) || (a.finished && b.finished ? a.time - b.time : 0) || (b.cp || 0) - (a.cp || 0) || (b.correct || 0) - (a.correct || 0) || (a.time || 0) - (b.time || 0));
}

function statusBadge(p) {
  const st = T.state.status;
  const b = (f, t) => `<img class="twBadge" src="assets/ui/${f}.png" alt="${t}" title="${t}">`;
  if (p.online === false) return b("t_s_off", "미접속");
  if (p.finished) return b("t_done", "완주 완료");
  if (st === "lobby" || st === "ended") return p.ready ? b("t_s_ready", "준비 완료") : b("t_s_wait", "대기 중");
  if (st === "paused") return b("t_s_pause", "일시정지");
  return b("t_chal", "도전 중");
}
function renderLive() {
  if (!$("tPlayers")) return;
  const u = T.unit, TOTAL = u.zones.length * (u.floorsPerZone || 3), MAXCP = 2 * TOTAL + 2;
  const list = rankedPlayers();
  const online = list.filter((p) => p.online !== false).length, done = list.filter((p) => p.finished).length;
  const totC = list.reduce((a, p) => a + (p.correct || 0), 0), totW = list.reduce((a, p) => a + (p.wrong || 0), 0);
  $("tSummary").textContent = `접속 ${online}명 · 완주 ${done}명 · 정답률 ${totC + totW ? Math.round((totC / (totC + totW)) * 100) : 0}%`;
  if (!list.length) {
    $("tPlayers").innerHTML = `<tr><td class="empty">아직 들어온 학생이 없어요.<br>학생에게 게임 주소를 안내하고 반·별명·캐릭터를 선택하도록 해 주세요.</td></tr>`;
  } else {
    $("tPlayers").innerHTML = `<tr><th>#</th><th>학생</th><th>상태</th><th>진행</th><th>층</th><th class="num">맞힘</th><th class="num">틀림</th><th class="num">관문</th><th class="num">떨어짐</th><th class="num">시간</th><th></th></tr>` +
      list.map((p, i) => {
        const pct = Math.min(100, Math.round(((p.cp || 0) / MAXCP) * 100));
        const where = p.finished ? "완주!" : p.q && p.q.g !== undefined ? `${p.q.g + 1}구역 관문` : `${p.solved || 0}층 통과`;
        return `<tr class="${p.online === false ? "off" : ""}">
          <td>${i + 1}</td>
          <td><span class="nm"><img class="twFace" src="${AVATAR_IMG(Math.max(0, SKIN_COLORS.indexOf(p.color)))}" alt="">${esc(p.num ? p.num + " " : "")}${esc(p.name)}</span></td>
          <td>${statusBadge(p)}</td>
          <td><div class="bar"><i style="width:${pct}%"></i></div></td>
          <td style="white-space:nowrap">${where}</td>
          <td class="num">${p.correct || 0}</td><td class="num">${p.wrong || 0}</td><td class="num">${p.gates || 0}</td><td class="num">${p.falls || 0}</td>
          <td class="num">${fmtTime(p.time || 0)}</td>
          <td style="white-space:nowrap">
            <button class="tBtn sm" data-cmd="flag" data-pid="${p.pid}" title="체크포인트로 보내기">깃발로</button>
            <button class="tBtn sm" data-cmd="reset" data-pid="${p.pid}" title="이 학생만 처음부터">처음부터</button>
            <button class="tBtn sm danger" data-cmd="kick" data-pid="${p.pid}" title="방에서 내보내기">내보내기</button>
          </td></tr>`;
      }).join("");
    $("tPlayers").querySelectorAll("button[data-cmd]").forEach((b) => (b.onclick = async () => {
      const p = T.players[b.dataset.pid];
      if (b.dataset.cmd === "kick") {
        if (!confirm(`${p.name} 학생을 내보낼까요?`)) return;
        sendCmd(b.dataset.pid, "kick");
        setTimeout(() => T.room.child("players/" + b.dataset.pid).remove(), 1500);
      } else sendCmd(b.dataset.pid, b.dataset.cmd);
    }));
  }
  // 많이 틀린 문제
  const stats = questionStats();
  const hard = u.questions.map((q) => ({ q, ...stats[q.id] })).filter((x) => x.n >= 2).sort((a, b) => a.rate - b.rate).slice(0, 5);
  $("tHard").innerHTML = hard.length ? hard.map((x) => `<li>${esc(x.q.q)} <b class="qa">→ ${esc(x.q.options[x.q.answer])}</b> <span class="tNote">(${x.ok}/${x.n}명 정답)</span></li>`).join("")
    : `<li class="tNote" style="list-style:none">학생들이 문제를 풀면 여기에 나와요.</li>`;
  // 소식
  $("tEvents").innerHTML = T.events.slice(-8).reverse().map((e) => `<div>· <b>${esc(e.num ? e.num + " " : "")}${esc(e.name)}</b> ${esc(e.text)}</div>`).join("") || "아직 없어요.";
  // 문제별 정답률 갱신
  document.querySelectorAll("#tQList .rate").forEach((el) => {
    const s = stats[el.dataset.id];
    el.textContent = s && s.n ? `${Math.round(s.rate * 100)}% (${s.n}명)` : "-";
    el.classList.toggle("low", !!s && s.n >= 2 && s.rate < 0.5);
  });
}
function questionStats() {
  const out = {};
  for (const [qid, by] of Object.entries(T.answers || {})) {
    const v = Object.values(by || {}), n = v.length, ok = v.filter((x) => x === 1).length;
    out[qid] = { n, ok, rate: n ? ok / n : 1 };
  }
  return out;
}
function renderQuestions() {
  const u = T.unit, box = $("tQList");
  let html = "";
  u.zones.forEach((z, zi) => {
    const qs = u.questions.filter((q) => q.zone === zi + 1);
    const onCount = qs.filter((q) => !T.off[q.id]).length;
    html += `<div class="qZone">${zi + 1}구역 · ${esc(z.name)} <span class="tNote">(켜짐 ${onCount}/${qs.length})</span></div>`;
    for (const q of qs) {
      html += `<div class="qItem ${T.off[q.id] ? "off" : ""}">
        <label class="switch"><input type="checkbox" data-id="${q.id}" ${T.off[q.id] ? "" : "checked"}><span></span></label>
        <div class="qt">${esc(q.q)}<br><span class="qa">정답: ${esc(q.options[q.answer])}</span> <span class="tNote">· 보기: ${q.options.filter((_, i) => i !== q.answer).map(esc).join(", ")}</span></div>
        <div class="rate" data-id="${q.id}">-</div>
      </div>`;
    }
  });
  box.innerHTML = html;
  box.querySelectorAll("input[data-id]").forEach((el) => (el.onchange = () => T.room.child("off/" + el.dataset.id).set(el.checked ? null : true)));
}
function downloadCsv() {
  const u = T.unit, rows = [["순위", "반", "별명", "완주", "통과한 층", "맞힘", "틀림", "관문", "떨어짐", "시간(초)"]];
  rankedPlayers().forEach((p, i) => rows.push([i + 1, p.num || "", p.name, p.finished ? "O" : "", p.solved || 0, p.correct || 0, p.wrong || 0, p.gates || 0, p.falls || 0, p.time || 0]));
  rows.push([]);
  rows.push(["문제", "정답", "첫 시도 정답 수", "푼 학생 수"]);
  const st = questionStats();
  u.questions.forEach((q) => { const s = st[q.id]; if (s) rows.push([q.q, q.options[q.answer], s.ok, s.n]); });
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const d = new Date();
  a.download = `과학타워_${u.no}단원_${T.code}_${d.getMonth() + 1}월${d.getDate()}일.csv`;
  a.click();
}

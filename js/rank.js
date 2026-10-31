// ===================================================================
// rank.js — 기록 랭킹 (반별 TOP 10 · 학년 TOP 10)
//
// ▶ 학년·반 바꾸기: SCHOOL에 { 학년: 반 수 } 를 적어요. 예) { 3: 7, 4: 6 }
// ▶ 점수 비율 바꾸기: SCORE 숫자를 고쳐요.
//   문제 점수 = 한 번에 맞힌 문제 × first + 다시 도전해서 맞힌 문제 × retry   (15층이면 최대 600점)
//   시간 점수 = 정상에 도착했을 때만. timeMax − 걸린 초 ÷ secPerPoint, 아무리 늦어도 timeMin 점
//              (5분 → 300점, 10분 → 200점, 15분 넘으면 100점)
//   점수가 같으면 시간이 짧은 학생이 위
//
// 데이터: ranks/{단원id}/{학년-반-별명} = { nick, grade, cls, score, firstTry, retry, finished, time, t }
//   같은 반·같은 별명은 한 사람으로 보고 가장 좋은 기록만 남김
// ===================================================================
"use strict";
const SCHOOL = { 3: 7 };
const SCORE = { first: 40, retry: 20, timeMax: 400, timeMin: 100, secPerPoint: 3 };

function calcScore(r) {
  const q = (r.firstTry || 0) * SCORE.first + (r.retry || 0) * SCORE.retry;
  const t = r.finished ? Math.max(SCORE.timeMin, Math.round(SCORE.timeMax - (r.time || 0) / SCORE.secPerPoint)) : 0;
  return { q, t, total: q + t };
}
const rankKey = (grade, cls, nick) => `${grade}-${cls}-${encodeURIComponent(String(nick).trim()).replace(/\./g, "%2E")}`;
const rankCmp = (a, b) => (b.score - a.score) || (!!b.finished - !!a.finished) || ((a.time || 1e9) - (b.time || 1e9)) || ((a.t || 0) - (b.t || 0));
const rankWho = (r) => `${r.cls}반 ${r.nick}`;

const Rank = {
  unitId: null, data: {}, stop: null, listeners: new Set(),
  // 단원 랭킹을 실시간으로 받음
  watch(unitId) {
    if (!Net.enabled) return;
    if (this.unitId === unitId && this.stop) return;
    this.unwatch();
    this.unitId = unitId;
    const ref = Net.ref("ranks/" + unitId);
    const fn = (s) => { this.data = s.val() || {}; this.listeners.forEach((f) => f()); };
    ref.on("value", fn);
    this.stop = () => ref.off("value", fn);
  },
  unwatch() { if (this.stop) this.stop(); this.stop = null; this.unitId = null; this.data = {}; },
  all() { return Object.entries(this.data).map(([key, v]) => ({ key, ...v })).filter((r) => typeof r.score === "number").sort(rankCmp); },
  classList(grade, cls) { return this.all().filter((r) => r.grade == grade && r.cls == cls); },
  gradeList(grade) { return this.all().filter((r) => r.grade == grade); },
  // 내 기록이 몇 위인지 (없으면 0)
  placeOf(key, list) { return list.findIndex((r) => r.key === key) + 1; },
  // 이 점수면 몇 위가 될지 (아직 저장하지 않은 점수)
  wouldPlace(score, time, finished, list, myKey) {
    const me = { score, time, finished, t: Date.now() };
    return list.filter((r) => r.key !== myKey && rankCmp(r, me) < 0).length + 1;
  },
  // 기록 저장: 원래 기록보다 좋을 때만
  async submit(unitId, rec) {
    if (!Net.enabled) return false;
    const key = rankKey(rec.grade, rec.cls, rec.nick);
    const ref = Net.ref(`ranks/${unitId}/${key}`);
    const old = (await ref.once("value")).val();
    const next = { ...rec, t: Date.now() };
    if (old && typeof old.score === "number" && rankCmp(old, next) <= 0) return false;
    await ref.set(next);
    return true;
  },
};

// 랭킹 표 HTML (반·학년 공통)
function rankTableHTML(list, myKey, n = 10, emptyText = "아직 기록이 없어요") {
  if (!list.length) return `<div class="rkEmpty">${emptyText}</div>`;
  const medal = ["🥇", "🥈", "🥉"];
  return `<ol class="rkList">${list.slice(0, n).map((r, i) => `
    <li class="${r.key === myKey ? "me" : ""}">
      <span class="rkN">${medal[i] || i + 1}</span>
      <span class="rkWho">${esc(rankWho(r))}</span>
      <span class="rkSc">${r.score}점</span>
      <span class="rkMeta">${r.finished ? fmtTime(r.time) : "도전 중"} · 한 번에 ${r.firstTry || 0}</span>
    </li>`).join("")}</ol>`;
}

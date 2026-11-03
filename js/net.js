// ===================================================================
// net.js — Firebase 실시간 데이터베이스 연결 (방 만들기·학생 진행 상황·TV 중계)
//
// 데이터 구조: rooms/{방번호}/
//   meta     : { unit, createdAt }
//   state    : { status: "lobby" | "play" | "paused" | "ended", t }
//   settings : { wrongTo: "floor" | "course" | "zone", gates: true, photos: true }
//   off      : { 문제id: true }            ← 교사가 끈 문제
//   msg      : { text, t }                 ← 교사가 보낸 알림
//   feature  : 학생id                      ← 지금 TV에 나오는 학생
//   players/{pid} : 이름·번호·색·진행 상황·위치(x,y,z,f,a)
//   answers/{문제id}/{pid} : 1(첫 시도에 맞힘) | 0(틀림)
//   events/{자동}  : { t, pid, name, type, text }
//   cmd/{pid}      : { type: "reset" | "flag" | "kick", t }
// ===================================================================
"use strict";
const SDK_VER = "10.12.2";
const Net = {
  enabled: false, db: null, offset: 0, error: "",
  configured() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.databaseURL && !/x{4}|여기/.test(c.apiKey + c.databaseURL));
  },
  loadScript(src, ms = 12000) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      const t = setTimeout(() => rej(new Error("시간 초과 " + src)), ms);
      s.src = src; s.onload = () => { clearTimeout(t); res(); }; s.onerror = () => { clearTimeout(t); rej(new Error("불러오기 실패 " + src)); };
      document.head.appendChild(s);
    });
  },
  // 38차: 여러 곳에서 동시에 불러도 연결은 딱 한 번 (동시에 두 번 불러 서로 꼬이던 문제 수정)
  init() {
    if (this.enabled) return Promise.resolve(true);
    if (!this.configured()) { this.error = "not-configured"; return Promise.resolve(false); }
    if (!this._p) this._p = this._init().then((ok) => { if (!ok) this._p = null; return ok; });   // 실패하면 다음에 다시 시도
    return this._p;
  },
  async _init() {
    try {
      if (!(window.firebase && firebase.database)) {
        if (!window.firebase) await this.loadScript(`https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-app-compat.js`);
        if (!firebase.database) await this.loadScript(`https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-database-compat.js`);
      }
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
      this.db = firebase.database();
      this.db.ref(".info/serverTimeOffset").on("value", (s) => { this.offset = s.val() || 0; });
      this.enabled = true; this.error = ""; this.detail = "";
      return true;
    } catch (e) {
      console.warn(e);
      this.error = "offline"; this.detail = String(e && e.message || e);
      return false;
    }
  },
  // 연결 실패 이유를 알기 쉽게
  explain(e) {
    const m = String((e && (e.code || e.message)) || e || "");
    if (/permission|PERMISSION_DENIED/i.test(m)) return "Firebase 규칙에서 이 게임 폴더(jumpmap)를 아직 허용하지 않았어요. 선생님께 알려 주세요. (규칙에 \"jumpmap\": { \".read\": true, \".write\": true } 추가)";
    if (/불러오기 실패|시간 초과/.test(m)) return "게임 서버 파일(gstatic.com)을 불러오지 못했어요. 와이파이 연결 또는 학교 인터넷 차단을 확인해 주세요.";
    return "연결하지 못했어요: " + m.slice(0, 120);
  },
  now() { return Date.now() + this.offset; },
  // 다른 게임과 같은 Firebase를 써도 섞이지 않게 이 게임 폴더(FIREBASE_ROOT) 아래에만 저장
  root() { const r = (window.FIREBASE_ROOT || "").replace(/^\/+|\/+$/g, ""); return r ? r + "/" : ""; },
  ref(path) { return this.db.ref(this.root() + path); },
  room(code) { return this.db.ref(this.root() + "rooms/" + code); },
  TS() { return firebase.database.ServerValue.TIMESTAMP; },
  async roomExists(code) {
    const s = await this.room(code).child("meta").once("value");
    return s.exists() ? s.val() : null;
  },
  newPid() {
    return "p" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  },
};

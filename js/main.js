// ===================================================================
// main.js — 화면 종류 고르기(학생 / 교사 / TV)와 그리기 반복
//   index.html           : 학생 게임
//   index.html?teacher   : 교사 화면
//   index.html?tv=1234   : TV 중계 화면 (?tv=demo 는 연습 로봇 미리보기)
// ===================================================================
"use strict";
const PARAMS = new URLSearchParams(location.search);
const MODE = PARAMS.has("teacher") ? "teacher" : PARAMS.has("tv") ? "tv" : "student";
let renderer = null, camera = null, scene = null;

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: $("game"), antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MODE === "tv" ? 2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = makeScene(renderer);
  camera = new THREE.PerspectiveCamera(MODE === "tv" ? 55 : 62, innerWidth / innerHeight, 0.1, 900);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();
}

// 느린 기기: 계속 초당 40장 아래면 해상도를 낮춤
let perfAcc = 0, perfN = 0;
function adaptQuality(raw) {
  if (document.visibilityState !== "visible" || raw > 0.25) return;
  perfAcc += raw; perfN++;
  if (perfAcc < 3) return;
  const fps = perfN / perfAcc; perfAcc = 0; perfN = 0;
  const pr = renderer.getPixelRatio();
  if (fps < 40 && pr > 0.76) { renderer.setPixelRatio(Math.max(0.75, pr - 0.25)); renderer.setSize(innerWidth, innerHeight, false); }
}

let lastT = performance.now() / 1000;
function loop() {
  requestAnimationFrame(loop);
  const t = performance.now() / 1000, raw = t - lastT, dt = Math.min(0.05, raw);
  lastT = t;
  adaptQuality(raw);
  if (MODE === "tv") tvFrame(dt, t); else gameFrame(dt, t);
  renderer.render(scene, camera);
}

if (!window.UNITS || !UNITS.length) {
  document.body.innerHTML = "<p style='padding:20px'>units 폴더의 문제 파일을 찾지 못했어요.</p>";
} else if (MODE === "teacher") {
  startTeacher();
} else {
  initRenderer();
  if (MODE === "tv") startTV(PARAMS.get("tv") || "demo");
  else initStudent();
  loop();
}

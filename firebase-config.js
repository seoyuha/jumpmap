// ===================================================================
// Firebase 설정 — 과학 점프맵 전용 Firebase 프로젝트 (science-jumpmap)
// 게임 데이터는 "jumpmap" 폴더 안에만 저장돼요 (규칙도 이 폴더만 허용).
// null 로 바꾸면 학생 게임은 "혼자 연습"으로만 돌아가요.
// ===================================================================
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyD5yYAZ90uKKZTOCNJ8lkDB37o2I_8Nvno",
  authDomain: "science-jumpmap.firebaseapp.com",
  databaseURL: "https://science-jumpmap-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "science-jumpmap",
  storageBucket: "science-jumpmap.firebasestorage.app",
  messagingSenderId: "1035235248204",
  appId: "1:1035235248204:web:202574d73821e9a7008ce9",
};
window.FIREBASE_ROOT = "jumpmap";

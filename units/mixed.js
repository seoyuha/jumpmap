// 종합 복습: 업로드된 2단원·3단원 문제를 그대로 재사용합니다.
// 두 단원의 5개 구역을 교차 배치하여 총 10구역을 진행합니다.
(() => {
  const a = window.UNITS.find(u => u.id === 'u2');
  const b = window.UNITS.find(u => u.id === 'u3');
  if (!a || !b) return;
  const order = [];
  for (let i=0; i<Math.max(a.zones.length,b.zones.length); i++) {
    if (a.zones[i]) order.push({u:a, oldZone:i+1});
    if (b.zones[i]) order.push({u:b, oldZone:i+1});
  }
  window.UNITS.push({
    id:'mixed', grade:'3학년 2학기', no:'종합', title:'2·3단원 종합',
    imgBase:'img/unit2/', floorsPerZone:3, theme:'sky',
    zones:order.map(({u,oldZone}) => ({...u.zones[oldZone-1],name:`${u.no}단원 · ${u.zones[oldZone-1].name}`})),
    questions:order.flatMap(({u,oldZone},idx) => u.questions.filter(q=>q.zone===oldZone).map(q=>({
      ...q, zone:idx+1, img:q.img && u.id==='u3'?'../unit3/'+q.img:q.img
    }))),
    gates:order.flatMap(({u,oldZone},idx)=>u.gates.filter(q=>q.zone===oldZone).map(q=>({...q,zone:idx+1})))
  });
})();

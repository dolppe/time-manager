const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

function startApp(time = '2026-11-16T09:00:00', stored = {}) {
  let now = new Date(time).getTime();
  let failWrites = false;
  const elements = new Map();
  const element = () => ({
    innerHTML: '', className: '', textContent: '',
    addEventListener() {}, showModal() {}, close() {},
    querySelector() { return this.error ||= element(); },
    querySelectorAll() { return []; },
  });
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    addEventListener() {}, hidden: false,
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock, document, structuredClone, crypto: webcrypto,
    localStorage: {
      getItem: key => stored[key] ?? null,
      setItem(key, value) {
        if (failWrites) throw new Error('storage full');
        stored[key] = value;
      },
    },
    window: { addEventListener() {}, confirm: () => true }, navigator: {}, setInterval() {},
    FormData: class {
      constructor(form) { this.values = form.testValues; }
      get(name) { return this.values[name] ?? null; }
      getAll(name) { return this.values[name] ?? []; }
      has(name) { return name in this.values; }
    },
  });
  vm.runInContext(source, context);
  return {
    run: code => vm.runInContext(code, context),
    state: () => JSON.parse(stored['time-manager-v1']),
    html: () => document.querySelector('#app').innerHTML,
    setTime: value => { now = new Date(value).getTime(); },
    failWrites: () => { failWrites = true; },
    stored,
    form: () => document.querySelector('#form'),
  };
}

test('요일에 맞는 루틴을 등록 순서로 표시하고 완료를 날짜별로 기록한다', () => {
  const app = startApp(); // 월요일
  app.run("change(s => s.routines.push({id:'a',name:'먼저',when:'저녁',days:[1,3,5]}, {id:'b',name:'나중',when:'아침',days:[1]}, {id:'c',name:'화요일',when:'아침',days:[2]})); render();");
  assert.ok(app.html().indexOf('먼저') < app.html().indexOf('나중'));
  assert.doesNotMatch(app.html(), /화요일/);
  app.run("complete('routine','a'); complete('routine','a');");
  assert.equal(app.state().rewards.length, 1);
  assert.match(app.html(), /class="item done"/);
  app.setTime('2026-11-17T09:00:00');
  app.run('render()');
  assert.doesNotMatch(app.html(), /먼저/);
  assert.match(app.html(), /화요일/);
  app.setTime('2026-11-18T09:00:00');
  app.run('render()');
  assert.match(app.html(), /먼저/);
  assert.doesNotMatch(app.html(), /class="item done"/);
  app.run("complete('routine','a')");
  assert.equal(app.state().rewards.length, 2);
  assert.equal(app.state().food, 1);
});

test('여러 날 일정을 수정하면 ID가 유지되고 새 기간에 표시된다', () => {
  const app = startApp();
  app.run("change(s=>s.events.push({id:'e',name:'기존',color:'#123456',startDate:'2026-11-30',endDate:'2026-12-02',allDay:true}));page='calendar';selected='2026-12-01';openEditor('event','e')");
  assert.match(app.form().innerHTML, /value="2026-11-30"/);
  app.form().testValues = {name:'변경', color:'#123456', startDate:'2026-12-04', endDate:'2026-12-05', allDay:'on'};
  app.form().onsubmit({preventDefault() {}});
  assert.equal(app.state().events.length, 1);
  assert.equal(app.state().events[0].id, 'e');
  assert.equal(app.state().events[0].startDate, '2026-12-04');
  assert.equal(app.run("eventOnDate(state.events[0],'2026-12-01')"), false);
  assert.equal(app.run("eventOnDate(state.events[0],'2026-12-05')"), true);
});

test('잘못된 일정 기간은 저장하지 않고 입력 화면에 오류를 표시한다', () => {
  const app = startApp();
  app.run("change(s=>s.events.push({id:'e',name:'기존',color:'#123456',startDate:'2026-11-16',endDate:'2026-11-16',allDay:true}));openEditor('event','e')");
  app.form().testValues = {name:'변경', color:'#123456', startDate:'2026-11-16', endDate:'2026-11-16', startTime:'15:00', endTime:'15:00'};
  app.form().onsubmit({preventDefault() {}});
  assert.equal(app.state().events[0].name, '기존');
  assert.match(app.form().querySelector('#error').textContent, /확인/);
});

test('일정 삭제는 저장 실패 시 보존하고 성공 시 전체 기간에서 제거한다', () => {
  const app = startApp();
  app.run("change(s=>s.events.push({id:'e',name:'약속',color:'#123456',startDate:'2026-11-30',endDate:'2026-12-02',allDay:true}));deleteItem('event','e')");
  assert.equal(app.state().events.length, 0);
  const failed = startApp();
  failed.run("change(s=>s.events.push({id:'e',name:'약속',color:'#123456',startDate:'2026-11-30',endDate:'2026-12-02',allDay:true}));");
  failed.failWrites();
  failed.run("page='calendar';deleteItem('event','e')");
  assert.equal(failed.state().events.length, 1);
  assert.match(failed.html(), /저장하지 못했습니다/);
});

for (const [label, time, earnsReward] of [
  ['직전', '2026-11-16T10:59:59.999', true],
  ['정각', '2026-11-16T11:00:00.000', false],
  ['이후', '2026-11-16T11:00:00.001', false],
]) {
  test(`마감 ${label}에 완료한 할 일의 보상 판정`, () => {
    const app = startApp(time);
    app.run("change(s => s.todos.push({id:'t',name:'할 일',date:'2026-11-16',time:'11:00',color:'#d84d79',completedAt:null})); complete('todo','t'); complete('todo','t');");
    assert.ok(app.state().todos[0].completedAt);
    assert.equal(app.state().rewards.length, Number(earnsReward));
    assert.equal(app.state().pet, earnsReward ? 'egg' : 'none');
  });
}

test('할 일은 마감순으로 표시하고 지난 날짜는 달력에 보관한다', () => {
  const app = startApp('2026-11-16T15:00:00');
  app.run("change(s => s.todos.push({id:'late',name:'내일',date:'2026-11-17',time:'09:00',color:'#111111'}, {id:'past',name:'어제',date:'2026-11-15',time:'10:00',color:'#222222'}, {id:'today',name:'오늘',date:'2026-11-16',time:'10:00',color:'#333333'})); tab='todo'; render();");
  assert.ok(app.html().indexOf('data-id="today"') < app.html().indexOf('data-id="late"'));
  assert.doesNotMatch(app.html(), /어제/);
  app.run("page='calendar'; selected='2026-11-15'; render()");
  assert.match(app.html(), /어제/);
  app.setTime('2026-11-17T00:01:00');
  app.run("page='daily'; render()");
  assert.doesNotMatch(app.html(), /data-id="today"/);
  assert.match(app.html(), /내일/);
});

test('알 획득, 부화, 먹이 주기와 새로고침 후 복원을 확인한다', () => {
  const app = startApp();
  app.run("change(s=>s.routines.push({id:'a',name:'운동',when:'아침',days:[1]})); complete('routine','a'); feed();");
  assert.equal(app.state().pet, 'egg');
  assert.equal(app.state().food, 0);
  app.run("change(s=>s.todos.push({id:'t',name:'할 일',date:'2026-11-17',time:'10:00',color:'#d84d79'})); complete('todo','t'); feed();");
  assert.equal(app.state().pet, 'hatched');
  assert.equal(app.state().fed, 0);
  app.run("change(s=>s.todos.push({id:'u',name:'다른 일',date:'2026-11-17',time:'10:00',color:'#d84d79'})); complete('todo','u'); feed(); feed();");
  assert.equal(app.state().fed, 1);
  assert.equal(app.state().food, 0);
  const reopened = startApp('2026-11-16T09:00:00', app.stored);
  assert.match(reopened.html(), /먹인 횟수 1회/);
});

test('저장 실패 시 완료와 보상이 둘 다 반영되지 않는다', () => {
  const app = startApp();
  app.run("change(s=>s.routines.push({id:'a',name:'운동',when:'아침',days:[1]}))");
  const before = app.stored['time-manager-v1'];
  app.failWrites();
  app.run("complete('routine','a')");
  assert.equal(app.stored['time-manager-v1'], before);
  assert.match(app.html(), /저장하지 못했습니다/);
  assert.doesNotMatch(app.html(), /class="item done"/);
});

test('사용자 입력의 HTML 특수 문자를 화면에 안전하게 표시한다', () => {
  const app = startApp();
  app.run("change(s=>s.routines.push({id:'a',name:'<img onerror=alert(1)>',when:'아침',days:[1]})); render();");
  assert.match(app.html(), /&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(app.html(), /<img onerror/);
});

test('Phase 1 데이터에 일정 목록이 없어도 기존 보상과 육성을 보존한다', () => {
  const old = {routines: [], todos: [], completions: [], rewards: ['routine:a:2026-11-16'], food: 2, pet: 'hatched', fed: 3};
  const app = startApp('2026-11-16T09:00:00', {'time-manager-v1': JSON.stringify(old)});
  app.run("change(s=>s.events.push({id:'e',name:'약속',color:'#111111',startDate:'2026-11-16',endDate:'2026-11-16',allDay:true}));");
  assert.equal(app.state().events[0].name, '약속');
  assert.equal(app.state().food, 2);
  assert.equal(app.state().fed, 3);
  assert.equal(app.state().rewards.length, 1);
});

test('시간 지정 일정의 자정 종료와 종일 일정의 종료일을 구분한다', () => {
  const app = startApp();
  assert.equal(app.run("eventOnDate({startDate:'2026-11-30',endDate:'2026-12-01',allDay:false,endTime:'00:00'},'2026-11-30')"), true);
  assert.equal(app.run("eventOnDate({startDate:'2026-11-30',endDate:'2026-12-01',allDay:false,endTime:'00:00'},'2026-12-01')"), false);
  assert.equal(app.run("eventOnDate({startDate:'2026-11-30',endDate:'2026-12-01',allDay:true},'2026-12-01')"), true);
});

test('완료를 취소하고 다시 완료해도 기존 보상을 중복 지급하지 않는다', () => {
  const app = startApp();
  app.run("change(s=>{s.routines.push({id:'a',name:'루틴',when:'아침',days:[1]});s.todos.push({id:'t',name:'할 일',date:'2026-11-17',time:'10:00',color:'#d84d79'});}); complete('routine','a');complete('todo','t');feed();toggleComplete('routine','a');toggleComplete('todo','t');");
  assert.equal(app.state().completions.length, 0);
  assert.equal(app.state().todos[0].completedAt, null);
  app.run("toggleComplete('routine','a');toggleComplete('todo','t');");
  assert.equal(app.state().rewards.length, 2);
  assert.equal(app.state().pet, 'hatched');
  assert.equal(app.state().food, 0);
});

test('완료 취소 저장 실패 시 완료와 보상을 유지한다', () => {
  const app = startApp();
  app.run("change(s=>s.routines.push({id:'a',name:'운동',when:'아침',days:[1]}));complete('routine','a');");
  const before = app.stored['time-manager-v1'];
  app.failWrites();
  app.run("toggleComplete('routine','a')");
  assert.equal(app.stored['time-manager-v1'], before);
  assert.match(app.html(), /저장하지 못했습니다/);
});


test('먹이 다섯 번째에 성장하고 기존 기록과 저장 실패를 보존한다', () => {
  const app = startApp();
  app.run("change(s => { s.pet='hatched'; s.fed=3; s.food=3; }); render(); feed();");
  assert.match(app.html(), /성장까지 먹이 1회/);
  app.run('feed()');
  assert.match(app.html(), /성장 완료/);
  assert.match(app.html(), /axolotl-grown.png/);
  const reopened = startApp(undefined, app.stored);
  assert.match(reopened.html(), /성장 완료/);
  reopened.run('feed()');
  assert.equal(reopened.state().fed, 6);
  const failed = startApp();
  failed.run("change(s => { s.pet='hatched'; s.fed=4; s.food=1; });");
  failed.failWrites();
  failed.run('feed()');
  assert.equal(failed.state().fed, 4);
  assert.equal(failed.state().food, 1);
  assert.match(failed.html(), /저장하지 못했습니다/);
});

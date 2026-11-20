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
    window: { addEventListener() {} }, navigator: {}, setInterval() {},
  });
  vm.runInContext(source, context);
  return {
    run: code => vm.runInContext(code, context),
    state: () => JSON.parse(stored['time-manager-v1']),
    html: () => document.querySelector('#app').innerHTML,
    setTime: value => { now = new Date(value).getTime(); },
    failWrites: () => { failWrites = true; },
    stored,
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

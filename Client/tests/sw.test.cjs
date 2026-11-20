const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function startWorker({ failInstall = false } = {}) {
  const handlers = {};
  const calls = [];
  const cache = {
    async addAll(files) {
      calls.push(['addAll', Array.from(files)]);
      if (failInstall) throw new Error('cache failed');
    },
    async match(request) { calls.push(['match', request]); return 'cached response'; },
  };
  const self = {
    addEventListener(type, handler) { handlers[type] = handler; },
    async skipWaiting() { calls.push(['skipWaiting']); },
    clients: { async claim() { calls.push(['claim']); } },
  };
  const caches = {
    async open(name) { calls.push(['open', name]); return cache; },
    async keys() { return ['time-manager-v1', 'time-manager-v2', 'time-manager-v5', 'time-manager-v6', 'time-manager-v7', 'time-manager-v8', 'another-app']; },
    async delete(name) { calls.push(['delete', name]); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), {
    self, caches, fetch: async () => 'network response',
  });
  return { handlers, calls };
}

test('새 리소스를 모두 저장한 뒤 업데이트를 활성화한다', async () => {
  const worker = startWorker();
  let pending;
  worker.handlers.install({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(worker.calls.map(call => call[0]), ['open', 'addAll', 'skipWaiting']);
  assert.ok(worker.calls[1][1].includes('./app.js'));
});

test('리소스 저장 실패 시 업데이트를 활성화하지 않는다', async () => {
  const worker = startWorker({ failInstall: true });
  let pending;
  worker.handlers.install({ waitUntil(promise) { pending = promise; } });
  await assert.rejects(pending, /cache failed/);
  assert.equal(worker.calls.some(call => call[0] === 'skipWaiting'), false);
});

test('활성화 시 이전 앱 캐시만 정리하고 현재 창에 적용한다', async () => {
  const worker = startWorker();
  let pending;
  worker.handlers.activate({ waitUntil(promise) { pending = promise; } });
  await pending;
  assert.deepEqual(worker.calls.filter(call => call[0] === 'delete').map(call => call[1]), ['time-manager-v1', 'time-manager-v2', 'time-manager-v5', 'time-manager-v6', 'time-manager-v7']);
  assert.equal(worker.calls.at(-1)[0], 'claim');
});

test('요청은 현재 버전 캐시에서 조회한다', async () => {
  const worker = startWorker();
  let response;
  worker.handlers.fetch({ request: { method: 'GET', url: 'app.js' }, respondWith(promise) { response = promise; } });
  assert.equal(await response, 'cached response');
  assert.deepEqual(worker.calls[0], ['open', 'time-manager-v8']);
});

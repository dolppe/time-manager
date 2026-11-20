const KEY = 'time-manager-v1';
const fresh = () => ({routines: [], todos: [], events: [], completions: [], rewards: [], food: 0, pet: 'none', fed: 0});
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { state = fresh(); }
if (!Array.isArray(state.events)) state.events = [];
let page = 'daily', tab = 'routine', selected = null, month = new Date(new Date().getFullYear(), new Date().getMonth(), 1), message = '';
const app = document.querySelector('#app'), dialog = document.querySelector('#dialog'), form = document.querySelector('#form');
function dateKey(d) { return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function change(fn) { const next = structuredClone(state); fn(next); try { localStorage.setItem(KEY, JSON.stringify(next)); state = next; return true; } catch { message = '저장하지 못했습니다. 기기의 저장 공간을 확인해 주세요.'; return false; } }
function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function migrateRoutines() {
 const removed = state.routines.filter(item => !validTime(item.when)).map(item => item.id);
 if (!removed.length) return;
 change(next => {
  next.routines = next.routines.filter(item => !removed.includes(item.id));
  next.completions = next.completions.filter(entry => !removed.some(id => entry.startsWith(id + ':')));
 });
}
migrateRoutines();
function reward(s, key) { if (s.rewards.includes(key)) return; s.rewards.push(key); if (s.rewards.length === 1) { s.pet = 'egg'; message = '첫 퀘스트 완료! 알을 받았어요.'; } else { s.food++; message = '퀘스트 완료! 먹이 1개를 받았어요.'; } }
function complete(type, id) { const today = dateKey(new Date()); if (type === 'routine') { const key = id + ':' + today; if (state.completions.includes(key)) return; change(s => { s.completions.push(key); reward(s, 'routine:' + key); }); } else { const item = state.todos.find(t => t.id === id); if (!item || item.completedAt) return; const now = new Date(); change(s => { s.todos.find(t => t.id === id).completedAt = now.toISOString(); if (now < new Date(item.date + 'T' + item.time + ':00')) reward(s, 'todo:' + id); else message = '완료했어요.'; }); } render(); }
function feed() { if (!state.food || state.pet === 'none') return; change(s => { s.food--; if (s.pet === 'egg') { s.pet = 'hatched'; message = '알이 부화했어요!'; } else { s.fed++; message = s.fed === 5 ? '친구가 성장했어요!' : '맛있게 먹었어요!'; } }); render(); }
function items(list, type) {
 if (!list.length) return '<p class="empty">아직 등록된 항목이 없어요.</p>';
 return list.map(item => {
  const done = type === 'routine' ? state.completions.includes(item.id + ':' + dateKey(new Date())) : !!item.completedAt;
  const sub = type === 'routine' ? item.when : item.date + ' ' + item.time;
  return '<div class="item '+(done?'done':'')+'"><button type="button" data-complete="'+type+'" data-id="'+item.id+'" '+(done && page !== 'daily'?'disabled':'')+' aria-label="'+esc(item.name)+(done?' 완료 취소':' 완료하기')+'">'+(done?'✓':'')+'</button><div class="itemtext">'+esc(item.name)+'<div class="muted">'+esc(sub)+'</div></div>'+(type==='todo'?'<span class="dot" style="background:'+esc(item.color)+'"></span>':'')+'<button class="item-action" data-edit="'+type+'" data-id="'+item.id+'" aria-label="'+esc(item.name)+' 수정">수정</button><button class="item-action" data-delete="'+type+'" data-id="'+item.id+'" aria-label="'+esc(item.name)+' 삭제">삭제</button></div>';
 }).join('');
}
function eventOnDate(event, date) {
 if (date < event.startDate || date > event.endDate) return false;
 return event.allDay || date !== event.endDate || event.endTime !== '00:00';
}
function toggleComplete(type, id) {
 const key = id + ':' + dateKey(new Date());
 const done = type === 'routine' ? state.completions.includes(key) : !!state.todos.find(item => item.id === id)?.completedAt;
 if (!done) return complete(type, id);
 if (page !== 'daily') return;
 message = '';
 change(next => {
  if (type === 'routine') next.completions = next.completions.filter(entry => entry !== key);
  else next.todos.find(item => item.id === id).completedAt = null;
 });
 render();
}
function render() {
 document.querySelector('#dailyNav').className = page === 'daily' ? 'active' : ''; document.querySelector('#calendarNav').className = page === 'calendar' ? 'active' : '';
 if (page === 'daily') { const today = new Date(), routines = state.routines.filter(r => r.days.includes(today.getDay()) && validTime(r.when)).sort((a,b)=>a.when.localeCompare(b.when)), todos = state.todos.filter(t => t.date >= dateKey(today)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)); const pet = state.pet === 'none' ? '<div class="display">첫 퀘스트를 완료하고<br>알을 만나보세요!</div>' : '<img src="assets/sticker-diary/'+(state.pet==='egg'?'egg':state.fed>=5?'axolotl-grown':'axolotl')+'.png" alt="'+(state.pet==='egg'?'별무늬 알':state.fed>=5?'성장한 아홀로틀 친구':'아홀로틀 친구')+'"><div><h2>'+(state.pet==='egg'?'두근두근 알':'안녕, 친구!')+'</h2><p>먹이 '+state.food+'개'+(state.pet==='hatched'?' · '+(state.fed>=5?'성장 완료 · 먹인 횟수 '+state.fed+'회':'먹인 횟수 '+state.fed+'회 · 성장까지 먹이 '+(5-state.fed)+'회'):'')+'</p><button class="primary" id="feed" '+(state.food?'':'disabled')+'>'+(state.pet==='egg'?'알 부화하기':'먹이 주기')+'</button></div>'; app.innerHTML = '<div class="topline"><span class="display">MY LITTLE DIARY</span><span>♡</span></div><h1>오늘도 함께해요</h1><section class="hero">'+pet+'</section>'+(message?'<p class="notice" role="status">'+esc(message)+'</p>':'')+'<div class="tabs"><button data-tab="routine" class="'+(tab==='routine'?'active':'')+'">루틴</button><button data-tab="todo" class="'+(tab==='todo'?'active':'')+'">할 일</button></div><section class="panel"><div class="sectionhead"><h2>'+(tab==='routine'?'오늘의 루틴':'다가오는 할 일')+'</h2>'+(tab==='routine'?'<button class="primary" id="addRoutine">+ 추가</button>':'')+'</div>'+items(tab==='routine'?routines:todos,tab)+'</section>'; return; }
 const y=month.getFullYear(), m=month.getMonth(), start=new Date(y,m,1).getDay(), count=new Date(y,m+1,0).getDate(); let cells='<div class="day blank"></div>'.repeat(start);
 for(let d=1;d<=count;d++){
  const key=dateKey(new Date(y,m,d));
  const entries=[...state.todos.filter(t=>t.date===key), ...state.events.filter(event=>eventOnDate(event,key))];
  cells+='<button class="day '+(key===selected?'selected':'')+'" data-date="'+key+'"><span>'+d+'</span>'+entries.slice(0,5).map(item=>'<small style="color:'+esc(item.color)+'">'+esc(item.name)+'</small>').join('')+(entries.length>5?'<small class="day-more">+'+(entries.length-5)+'개</small>':'')+'</button>';
 }
 const chosen=state.todos.filter(t=>t.date===selected).sort((a,b)=>a.time.localeCompare(b.time));
 const events=state.events.filter(event=>eventOnDate(event,selected));
 const eventList=events.map(event=>'<div class="item"><span class="dot" style="background:'+esc(event.color)+'"></span><div class="itemtext">'+esc(event.name)+'<div class="muted">'+(event.allDay?'종일':esc(event.startDate+' '+event.startTime+' ~ '+event.endDate+' '+event.endTime))+'</div></div><button class="item-action" data-edit="event" data-id="'+esc(event.id)+'" aria-label="'+esc(event.name)+' 수정">수정</button><button class="item-action" data-delete="event" data-id="'+esc(event.id)+'" aria-label="'+esc(event.name)+' 삭제">삭제</button></div>').join('');
 app.innerHTML='<div class="topline"><span class="display">MY LITTLE DIARY</span><span>♡</span></div><h1>캘린더</h1>'+(message?'<p class="notice" role="status">'+esc(message)+'</p>':'')+'<section class="panel calendar-panel"><div class="calendar-head"><button id="prev" aria-label="이전 달">‹</button><h2>'+y+'년 '+(m+1)+'월</h2><button id="next" aria-label="다음 달">›</button></div><div class="grid">'+['일','월','화','수','목','금','토'].map(d=>'<div class="weekday">'+d+'</div>').join('')+cells+'</div></section>'+(selected?'<section class="panel details"><div class="sectionhead"><h2>'+selected.slice(5).replace('-','월 ')+'일</h2><div><button id="addTodo" class="primary">+ 할 일</button> <button id="addEvent" class="primary">+ 일정</button></div></div>'+eventList+items(chosen,'todo')+'</section>':'');
}
function setupEndOfDay(selector) {
 const checkbox = form.querySelector('#endOfDay'), time = form.querySelector(selector);
 checkbox.addEventListener('change', () => { if (checkbox.checked) time.value = '23:59'; time.readOnly = checkbox.checked; });
}
function openForm(type) { const routine=type==='routine'; form.innerHTML='<h2>'+(routine?'루틴 추가':'할 일 추가')+'</h2><label for="name">'+(routine?'루틴 내용':'할 일 이름')+'</label><input id="name" name="name" type="text" maxlength="100" required>'+(routine?'<label for="when">시간</label><input id="when" name="when" type="time" required><label>반복 요일</label><div class="days">'+['일','월','화','수','목','금','토'].map((d,i)=>'<label><input type="checkbox" name="days" value="'+i+'"><span>'+d+'</span></label>').join('')+'</div>':'<label for="date">마감일</label><input id="date" name="date" type="date" value="'+selected+'" required><label for="time">마감 시간</label><input id="time" name="time" type="time" required><label><input type="checkbox" id="endOfDay"> 23:59로 설정</label><label for="color">색상</label><input id="color" name="color" type="color" value="#d84d79">')+'<p id="error" class="error"></p><div class="actions"><button class="secondary" type="button" id="cancel">취소</button><button class="primary" type="submit">저장</button></div>';
 if (!routine) setupEndOfDay('#time');
 form.onsubmit=e=>{e.preventDefault();const data=new FormData(form),name=String(data.get('name')).trim();if(!name){form.querySelector('#error').textContent='내용을 입력해 주세요.';return;}if(routine){const days=data.getAll('days').map(Number),when=String(data.get('when')).trim();if(!validTime(when)||!days.length){form.querySelector('#error').textContent='유효한 시간과 반복 요일을 입력해 주세요.';return;}if(change(s=>s.routines.push({id:crypto.randomUUID(),name,when,days})))dialog.close();}else{const date=String(data.get('date')),time=String(data.get('time')),color=String(data.get('color'));if(change(s=>s.todos.push({id:crypto.randomUUID(),name,date,time,color,completedAt:null})))dialog.close();}render();}; dialog.showModal(); }
function openEditor(type, id) {
 const isEvent = type === 'event', isRoutine = type === 'routine';
 const collection = isEvent ? 'events' : isRoutine ? 'routines' : 'todos';
 const item = id ? state[collection].find(entry => entry.id === id) : null;
 if (id && !item) return;
 const field = (label, name, inputType, value, extra = '') => '<label for="edit-'+name+'">'+label+'</label><input id="edit-'+name+'" name="'+name+'" type="'+inputType+'" value="'+esc(value || '')+'" '+extra+'>';
 let fields = field(isRoutine?'루틴 내용':isEvent?'일정 이름':'할 일 이름','name','text',item?.name,'required maxlength="100"');
 if (isRoutine) {
  fields += field('시간','when','time',item.when,'required');
  fields += '<label>반복 요일</label><div class="days">'+['일','월','화','수','목','금','토'].map((day,index)=>'<label><input type="checkbox" name="days" value="'+index+'" '+(item.days.includes(index)?'checked':'')+'><span>'+day+'</span></label>').join('')+'</div>';
 } else if (isEvent) {
  const allDay = item ? item.allDay : true;
  fields += field('시작일','startDate','date',item?.startDate || selected,'required') + field('종료일','endDate','date',item?.endDate || selected,'required');
  fields += '<label><input type="checkbox" name="allDay" '+(allDay?'checked':'')+'> 종일</label><div id="event-times" '+(allDay?'hidden':'')+'>'+field('시작 시간','startTime','time',item?.startTime,allDay?'':'required')+field('종료 시간','endTime','time',item?.endTime,allDay?'':'required')+'</div>';
  fields += field('색상','color','color',item?.color || '#d84d79');
 } else {
  fields += field('마감일','date','date',item.date,'required') + field('마감 시간','time','time',item.time,'required') + '<label><input type="checkbox" id="endOfDay"> 23:59로 설정</label>' + field('색상','color','color',item.color);
 }
 form.innerHTML='<h2>'+(isEvent?(id?'일정 수정':'일정 추가'):isRoutine?'루틴 수정':'할 일 수정')+'</h2>'+fields+'<p id="error" class="error"></p><div class="actions"><button class="secondary" type="button" id="cancel">취소</button><button class="primary" type="submit">저장</button></div>';
 if (!isEvent && !isRoutine) setupEndOfDay('#edit-time');
 if (isEvent) {
  const allDay=form.querySelector('[name="allDay"]'), times=form.querySelector('#event-times');
  allDay.addEventListener('change',()=>{times.hidden=allDay.checked;times.querySelectorAll('input').forEach(input=>input.required=!allDay.checked);});
 }
 form.onsubmit=event=>{
  event.preventDefault();
  const data=new FormData(form), name=String(data.get('name') || '').trim(), error=form.querySelector('#error');
  if (!name) {error.textContent='내용을 입력해 주세요.';return;}
  let values;
  if (isRoutine) {
   const when=String(data.get('when') || '').trim(), days=data.getAll('days').map(Number);
   if (!validTime(when) || !days.length) {error.textContent='유효한 시간과 반복 요일을 입력해 주세요.';return;}
   values={name,when,days};
  } else if (isEvent) {
   const startDate=String(data.get('startDate') || ''), endDate=String(data.get('endDate') || ''), allDay=data.has('allDay'), startTime=String(data.get('startTime') || ''), endTime=String(data.get('endTime') || '');
   if (!startDate || !endDate || endDate<startDate || (!allDay && (!startTime || !endTime || endDate+'T'+endTime<=startDate+'T'+startTime))) {error.textContent='종료 날짜와 시간을 확인해 주세요.';return;}
   values={name,color:String(data.get('color')),startDate,endDate,allDay,startTime,endTime};
  } else values={name,date:String(data.get('date')),time:String(data.get('time')),color:String(data.get('color'))};
  if (id && !state[collection].some(entry=>entry.id===id)) {error.textContent='이미 삭제된 항목입니다.';return;}
  const saved=change(next=>{if(isEvent && !id) next.events.push({id:crypto.randomUUID(),...values}); else Object.assign(next[collection].find(entry=>entry.id===id),values);});
  if (saved) {dialog.close();message='';render();} else error.textContent=message;
 };
 dialog.showModal();
}
function deleteItem(type,id) {
 const collection=type==='routine'?'routines':type==='event'?'events':'todos', item=state[collection].find(entry=>entry.id===id);
 if (!item || !window.confirm('“'+item.name+'” 항목을 삭제할까요?')) return;
 message='';
 change(next=>{next[collection]=next[collection].filter(entry=>entry.id!==id);});
 render();
}
app.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tab){tab=b.dataset.tab;message='';render();}if(b.id==='addRoutine')openForm('routine');if(b.id==='addTodo')openForm('todo');if(b.id==='addEvent')openEditor('event');if(b.dataset.edit)openEditor(b.dataset.edit,b.dataset.id);if(b.dataset.delete)deleteItem(b.dataset.delete,b.dataset.id);if(b.id==='feed')feed();if(b.id==='prev'||b.id==='next'){month=new Date(month.getFullYear(),month.getMonth()+(b.id==='prev'?-1:1),1);selected=null;render();}if(b.dataset.date){selected=selected===b.dataset.date?null:b.dataset.date;render();}if(b.dataset.complete)toggleComplete(b.dataset.complete,b.dataset.id);});
form.addEventListener('click',e=>{if(e.target.id==='cancel')dialog.close();});
document.querySelector('#dailyNav').onclick=()=>{page='daily';message='';render();};document.querySelector('#calendarNav').onclick=()=>{page='calendar';selected=null;month=new Date(new Date().getFullYear(),new Date().getMonth(),1);message='';render();};
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){state=JSON.parse(e.newValue);if (!Array.isArray(state.events)) state.events=[];render();}});window.addEventListener('pageshow',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});setInterval(render,60000);
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();

(() => {
  const CATEGORIES = ['工作', '個人', '健康', '學習', '家庭', '其他'];
  const STORAGE_KEY = 'daily-order-planner-v1';
  const $ = (id) => document.getElementById(id);
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const shiftDate = (days) => { const d = new Date(); d.setDate(d.getDate()+days); return localDate(d); };
  const defaults = [
    {id:'sample-1',title:'每週產品進度會議',type:'event',category:'工作',date:shiftDate(0),start:'10:00',end:'11:00',allDay:false,location:'線上會議室',notes:'整理本週進度與待辦事項',completed:false},
    {id:'sample-2',title:'完成設計提案初稿',type:'task',category:'工作',date:shiftDate(1),start:'',end:'',allDay:true,location:'',notes:'完成後分享給團隊確認',completed:false},
    {id:'sample-3',title:'下班後瑜伽課',type:'event',category:'健康',date:shiftDate(2),start:'18:30',end:'19:30',allDay:false,location:'日光瑜伽教室',notes:'記得帶水壺與毛巾',completed:false}
  ];
  let items;
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); items = Array.isArray(saved) ? saved : defaults; } catch { items = defaults; }
  let activeCategory = '全部';
  let toastTimer;

  const dateLabel = (iso, options) => new Intl.DateTimeFormat('zh-TW', options).format(new Date(`${iso}T12:00:00`));
  const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  const toast = (message) => { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2200); };

  function renderFilters() {
    $('filterList').innerHTML = ['全部',...CATEGORIES].map(cat=>`<button type="button" class="filter-chip ${activeCategory===cat?'active':''}" data-filter="${cat}" aria-pressed="${activeCategory===cat}">${cat}</button>`).join('');
  }
  function renderStats() {
    const now=new Date(), today=localDate(now), month=today.slice(0,7);
    const monday=new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7)); monday.setHours(0,0,0,0);
    const sunday=new Date(monday); sunday.setDate(monday.getDate()+7);
    $('monthCount').textContent=items.filter(x=>x.date.startsWith(month)).length;
    $('weekCount').textContent=items.filter(x=>{const d=new Date(`${x.date}T12:00:00`);return d>=monday&&d<sunday;}).length;
    $('todayCount').textContent=items.filter(x=>x.date===today).length;
    const tasks=items.filter(x=>x.type==='task'), done=tasks.filter(x=>x.completed).length, rate=tasks.length?Math.round(done/tasks.length*100):0;
    $('completionRate').textContent=`${rate}%`; $('taskSummary').textContent=`${done} / ${tasks.length} 項任務`; $('completionProgress').style.width=`${rate}%`;
  }
  function render() {
    renderFilters(); renderStats();
    const query=$('searchInput').value.trim().toLocaleLowerCase();
    const filtered=items.filter(x=>(activeCategory==='全部'||x.category===activeCategory)&&(!query||[x.title,x.location,x.notes,x.category].some(v=>(v||'').toLocaleLowerCase().includes(query)))).sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||''));
    $('resultCount').textContent=`${filtered.length} 筆安排`;
    $('emptyState').hidden=filtered.length>0;
    $('scheduleList').innerHTML=filtered.map((x,index)=>{
      const time=x.allDay?'全天':(x.start&&x.end?`${x.start} – ${x.end}`:x.start||x.end||'未設定時間');
      const day=new Date(`${x.date}T12:00:00`).getDay();
      return `<article class="schedule-item ${x.completed?'completed':''}" style="animation-delay:${Math.min(index*35,180)}ms">
        <div class="date-tile"><span class="month">${dateLabel(x.date,{month:'short'})}</span><span class="day">${dateLabel(x.date,{day:'2-digit'})}</span><span class="weekday">${['週日','週一','週二','週三','週四','週五','週六'][day]}</span></div>
        <div class="schedule-main"><div class="item-title-row"><span class="item-title">${escapeHtml(x.title)}</span><span class="type-tag">${x.type==='task'?'任務':'行程'}</span><span class="category-tag" data-category="${escapeHtml(x.category)}">${escapeHtml(x.category)}</span></div><div class="item-meta"><span class="meta-piece"><span class="meta-icon">◷</span>${time}</span>${x.location?`<span class="meta-piece"><span class="meta-icon">⌖</span>${escapeHtml(x.location)}</span>`:''}</div>${x.notes?`<div class="item-note">${escapeHtml(x.notes)}</div>`:''}</div>
        <div class="item-actions"><button class="icon-button" type="button" data-action="view" data-id="${escapeHtml(x.id)}" aria-label="查看${escapeHtml(x.title)}" title="查看">⌕</button><button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(x.id)}" aria-label="編輯${escapeHtml(x.title)}" title="編輯">✎</button>${x.type==='task'?`<button class="icon-button done-action" type="button" data-action="toggle" data-id="${escapeHtml(x.id)}" aria-label="${x.completed?'取消完成':'標記完成'}" title="${x.completed?'取消完成':'標記完成'}">${x.completed?'✓':'○'}</button>`:''}<button class="icon-button delete-action" type="button" data-action="delete" data-id="${escapeHtml(x.id)}" aria-label="刪除${escapeHtml(x.title)}" title="刪除">⌫</button></div>
      </article>`;
    }).join('');
  }
  function setType(type) { const isTask=type==='task'; $('timeFields').hidden=isTask; $('allDayWrap').hidden=isTask; if(isTask){$('allDayInput').checked=false;} }
  function openForm(item=null, readOnly=false) {
    const form=$('eventForm'); form.reset();
    $('dialogTitle').textContent=readOnly?'查看安排':(item?'編輯安排':'新增安排');
    $('eventId').value=item?.id||''; $('titleInput').value=item?.title||''; $('typeInput').value=item?.type||'event';
    $('categoryInput').value=item?.category||'個人'; $('dateInput').value=item?.date||localDate(); $('startInput').value=item?.start||''; $('endInput').value=item?.end||'';
    $('allDayInput').checked=!!item?.allDay; $('locationInput').value=item?.location||''; $('notesInput').value=item?.notes||'';
    setType($('typeInput').value);
    form.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>el.disabled=readOnly);
    form.querySelector('[type=submit]').hidden=readOnly;
    $('eventDialog').showModal();
  }
  $('todayLabel').textContent=dateLabel(localDate(),{year:'numeric',month:'long',day:'numeric',weekday:'short'});
  $('categoryInput').innerHTML=CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('');
  render();
  $('addEventBtn').addEventListener('click',()=>openForm());
  $('googleLogin').addEventListener('click',()=>toast('Google 登入將於下一階段開放'));
  $('searchInput').addEventListener('input',render);
  $('filterList').addEventListener('click',e=>{const btn=e.target.closest('[data-filter]');if(btn){activeCategory=btn.dataset.filter;render();}});
  $('typeInput').addEventListener('change',e=>setType(e.target.value));
  document.querySelectorAll('.close-dialog').forEach(btn=>btn.addEventListener('click',()=>{ $('eventDialog').close(); $('eventForm').querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>el.disabled=false); $('eventForm').querySelector('[type=submit]').hidden=false; }));
  $('eventDialog').addEventListener('close',()=>{ $('eventForm').querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>el.disabled=false); $('eventForm').querySelector('[type=submit]').hidden=false; });
  $('eventForm').addEventListener('submit',e=>{
    e.preventDefault(); const id=$('eventId').value, type=$('typeInput').value, old=items.find(x=>x.id===id);
    const data={id:id||`item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,title:$('titleInput').value.trim(),type,category:$('categoryInput').value,date:$('dateInput').value,start:type==='task'||$('allDayInput').checked?'':$('startInput').value,end:type==='task'||$('allDayInput').checked?'':$('endInput').value,allDay:type==='task'?false:$('allDayInput').checked,location:$('locationInput').value.trim(),notes:$('notesInput').value.trim(),completed:old?.completed||false};
    if(data.start&&data.end&&data.end<data.start){$('endInput').setCustomValidity('結束時間需晚於開始時間');$('endInput').reportValidity();$('endInput').setCustomValidity('');return;}
    if(id)items=items.map(x=>x.id===id?data:x);else items.push(data);
    save(); $('eventDialog').close(); render(); toast(id?'已更新安排':'已新增安排');
  });
  $('scheduleList').addEventListener('click',e=>{
    const btn=e.target.closest('[data-action]'); if(!btn)return; const item=items.find(x=>x.id===btn.dataset.id); if(!item)return;
    if(btn.dataset.action==='view')openForm(item,true);
    if(btn.dataset.action==='edit')openForm(item);
    if(btn.dataset.action==='toggle'){item.completed=!item.completed;save();render();toast(item.completed?'任務已完成':'已取消完成標記');}
    if(btn.dataset.action==='delete'){items=items.filter(x=>x.id!==item.id);save();render();toast('已刪除安排');}
  });
})();

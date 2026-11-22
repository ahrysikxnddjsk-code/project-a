const firebaseConfig = {
  apiKey: "AIzaSyBJSVc9i_IVgjGZ878x5sv4kTmfx2UHeL0",
  authDomain: "projecta-bb75e.firebaseapp.com",
  projectId: "projecta-bb75e",
  storageBucket: "projecta-bb75e.firebasestorage.app",
  messagingSenderId: "516145080643",
  appId: "1:516145080643:web:128d10e34843c308c6a7f6",
  measurementId: "G-X9HTX92DWP"
};

(() => {
  const CATEGORIES = ['工作', '個人', '健康', '學習', '家庭', '其他'];
  const $ = (id) => document.getElementById(id);
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  let items = [];
  let activeCategory = '全部';
  let toastTimer;
  let firebaseAuth = null;
  let googleProvider = null;
  let signInWithPopup = null;
  let signOut = null;
  let db = null;
  let firestoreSdk = null;
  let activeUserId = null;
  let unsubscribeEvents = null;
  let eventsLoading = false;
  let eventsLoadError = '';

  const dateLabel = (iso, options) => new Intl.DateTimeFormat('zh-TW', options).format(new Date(`${iso}T12:00:00`));
  const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (message) => { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),4200); };

  function firestoreErrorMessage(error) {
    if(error?.code==='permission-denied') return '資料庫拒絕存取，請確認 Firestore 安全性規則允許登入者讀寫自己的資料。';
    if(error?.code==='unavailable'||error?.code==='network-request-failed') return '目前無法連線至雲端資料庫，請檢查網路後再試。';
    if(error?.code==='unauthenticated') return '登入狀態已失效，請重新登入 Google 帳號。';
    return `雲端資料操作失敗${error?.message?`：${error.message}`:'，請稍後再試。'}`;
  }

  function toDate(value) {
    if(value?.toDate) return value.toDate();
    if(value instanceof Date) return value;
    return new Date(value);
  }

  function toInputTime(value) {
    if(!value) return '';
    const date=toDate(value);
    return Number.isNaN(date.getTime())?'':`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  }

  function toViewItem(id, data) {
    const startDate=toDate(data.startAt);
    const endDate=toDate(data.endAt);
    return {
      id, title:data.title||'', type:data.type==='task'?'task':'event', category:data.category||'其他',
      date:Number.isNaN(startDate.getTime())?localDate():localDate(startDate),
      start:data.allDay?'':toInputTime(data.startAt), end:data.allDay?'':toInputTime(data.endAt),
      allDay:!!data.allDay, location:data.location||'', notes:data.description||'', completed:!!data.completed
    };
  }

  function fromFormValues(type, date, start, end, allDay) {
    const startValue=type==='task'||allDay?'00:00':(start||'00:00');
    const endValue=type==='task'||allDay?'00:00':(end||startValue);
    return {
      startAt:new Date(`${date}T${startValue}:00`).toISOString(),
      endAt:new Date(`${date}T${endValue}:00`).toISOString()
    };
  }

  function setSignInLoading(loading) {
    const button=$('googleLogin');
    button.disabled=loading;
    button.classList.toggle('is-loading',loading);
    button.innerHTML=loading?'<span class="loading-spinner" aria-hidden="true"></span><span>登入中…</span>':'<span class="google-g" aria-hidden="true">G</span><span>Google 登入</span>';
  }

  function showAuthUser(user) {
    const profile=$('userProfile'), login=$('googleLogin'), avatar=$('userAvatar'), initial=$('userInitial');
    $('addEventBtn').disabled=!user;
    if(!user) {
      profile.hidden=true; login.hidden=false; avatar.hidden=true; avatar.removeAttribute('src'); avatar.alt='';
      initial.textContent='訪'; initial.hidden=false; $('userName').textContent=''; return;
    }
    login.hidden=true; profile.hidden=false;
    const name=user.displayName||user.email||'Google 使用者';
    $('userName').textContent=name;
    initial.textContent=Array.from(name.trim())[0]||'使';
    if(user.photoURL) {
      avatar.onerror=()=>{avatar.hidden=true;avatar.removeAttribute('src');initial.hidden=false;};
      avatar.src=user.photoURL; avatar.alt=`${name} 的頭像`; avatar.hidden=false; initial.hidden=true;
    }
    else { avatar.hidden=true; avatar.removeAttribute('src'); initial.hidden=false; }
  }

  function authErrorMessage(error) {
    if(error?.code==='auth/popup-closed-by-user') return '你已取消 Google 登入。';
    if(error?.code==='auth/popup-blocked') return '瀏覽器封鎖了登入彈窗，請允許此網站開啟彈窗後再試。';
    if(error?.code==='auth/cancelled-popup-request') return '登入視窗已被另一個登入要求取代，請再試一次。';
    if(error?.code==='auth/unauthorized-domain') return '此網域尚未加入 Firebase 授權網域，請至 Firebase Authentication 設定新增目前網站網域。';
    if(error?.code==='auth/operation-not-allowed') return 'Firebase 尚未啟用 Google 登入提供者。';
    return `登入失敗${error?.message?`：${error.message}`:'，請稍後再試。'}`;
  }

  async function initializeFirebaseAuth() {
    setSignInLoading(true);
    const required=['apiKey','authDomain','projectId','appId'];
    if(required.some(key=>!firebaseConfig[key]||String(firebaseConfig[key]).includes('YOUR_'))) {
      setSignInLoading(false);
      $('googleLogin').title='請先設定 Firebase firebaseConfig';
      return;
    }
    try {
      const version='13.4.0';
      const [appSdk,authSdk,firestore]=await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
      ]);
      const firebaseApp=appSdk.initializeApp(firebaseConfig);
      firebaseAuth=authSdk.getAuth(firebaseApp);
      firestoreSdk=firestore;
      db=firestore.getFirestore(firebaseApp);
      googleProvider=new authSdk.GoogleAuthProvider();
      signInWithPopup=authSdk.signInWithPopup; signOut=authSdk.signOut;
      authSdk.onAuthStateChanged(firebaseAuth,user=>{
        showAuthUser(user);
        activeUserId=user?.uid||null;
        if(unsubscribeEvents){unsubscribeEvents();unsubscribeEvents=null;}
        if(!activeUserId){items=[];eventsLoading=false;eventsLoadError='';$('cloudPrompt').hidden=false;$('cloudLoading').hidden=true;$('cloudError').hidden=true;render();setSignInLoading(false);return;}
        items=[];eventsLoading=true;eventsLoadError='';$('cloudPrompt').hidden=true;$('cloudLoading').hidden=false;$('cloudError').hidden=true;render();setSignInLoading(false);
        const userEvents=firestore.collection(db,'users',activeUserId,'events');
        unsubscribeEvents=firestore.onSnapshot(userEvents,snapshot=>{
          items=snapshot.docs.map(entry=>toViewItem(entry.id,entry.data()));
          eventsLoading=false;eventsLoadError='';$('cloudLoading').hidden=true;$('cloudError').hidden=true;render();
        },error=>{
          items=[];eventsLoading=false;eventsLoadError=firestoreErrorMessage(error);$('cloudLoading').hidden=true;$('cloudError').hidden=false;$('cloudErrorMessage').textContent=eventsLoadError;render();toast(eventsLoadError);
        });
      },error=>{showAuthUser(null);activeUserId=null;items=[];setSignInLoading(false);toast(`無法取得登入狀態：${error.message||'請重新整理頁面。'}`);render();});
    } catch(error) {
      showAuthUser(null); setSignInLoading(false);
      toast(`Firebase 初始化失敗：${error.message||'請檢查網路連線與設定。'}`);
    }
  }

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
    const signedIn=!!activeUserId;
    $('cloudPrompt').hidden=signedIn;
    $('cloudLoading').hidden=!signedIn||!eventsLoading;
    $('cloudError').hidden=!signedIn||!eventsLoadError;
    $('emptyState').hidden=!signedIn||eventsLoading||!!eventsLoadError||filtered.length>0;
    $('scheduleList').innerHTML=filtered.map((x,index)=>{
      const time=x.type==='task'?'待完成':x.allDay?'全天':(x.start&&x.end?`${x.start} – ${x.end}`:x.start||x.end||'未設定時間');
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
  $('googleLogin').addEventListener('click',async()=>{
    if(!firebaseAuth||!googleProvider||!signInWithPopup){toast('Firebase 設定尚未完成，請先填入 Firebase firebaseConfig。');return;}
    setSignInLoading(true);
    try { await signInWithPopup(firebaseAuth,googleProvider); }
    catch(error) { setSignInLoading(false); toast(authErrorMessage(error)); }
  });
  $('signOutBtn').addEventListener('click',async()=>{
    if(!firebaseAuth||!signOut)return;
    $('signOutBtn').disabled=true;
    try { await signOut(firebaseAuth); }
    catch(error) { toast(`登出失敗：${error.message||'請稍後再試。'}`); }
    finally { $('signOutBtn').disabled=false; }
  });
  $('searchInput').addEventListener('input',render);
  $('filterList').addEventListener('click',e=>{const btn=e.target.closest('[data-filter]');if(btn){activeCategory=btn.dataset.filter;render();}});
  $('typeInput').addEventListener('change',e=>setType(e.target.value));
  document.querySelectorAll('.close-dialog').forEach(btn=>btn.addEventListener('click',()=>{ $('eventDialog').close(); $('eventForm').querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>el.disabled=false); $('eventForm').querySelector('[type=submit]').hidden=false; }));
  $('eventDialog').addEventListener('close',()=>{ $('eventForm').querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>el.disabled=false); $('eventForm').querySelector('[type=submit]').hidden=false; });
  $('eventForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!activeUserId||!db||!firestoreSdk){toast('請先登入 Google 帳號以管理雲端行程。');return;}
    const id=$('eventId').value, type=$('typeInput').value, old=items.find(x=>x.id===id);
    const date=$('dateInput').value, allDay=type==='event'&&$('allDayInput').checked;
    const start=allDay||type==='task'?'':$('startInput').value;
    const end=allDay||type==='task'?'':$('endInput').value;
    if(start&&end&&end<start){$('endInput').setCustomValidity('結束時間需晚於開始時間');$('endInput').reportValidity();$('endInput').setCustomValidity('');return;}
    const times=fromFormValues(type,date,start,end,allDay);
    const data={
      title:$('titleInput').value.trim(),type,category:$('categoryInput').value,
      startAt:times.startAt,endAt:times.endAt,allDay,location:$('locationInput').value.trim(),
      description:$('notesInput').value.trim(),completed:old?.completed||false,ownerId:activeUserId,
      updatedAt:firestoreSdk.serverTimestamp()
    };
    const submit=$('eventForm').querySelector('[type=submit]'); submit.disabled=true;
    try {
      if(id) await firestoreSdk.updateDoc(firestoreSdk.doc(db,'users',activeUserId,'events',id),data);
      else await firestoreSdk.addDoc(firestoreSdk.collection(db,'users',activeUserId,'events'),{...data,createdAt:firestoreSdk.serverTimestamp()});
      $('eventDialog').close();toast(id?'已更新雲端行程':'已新增雲端行程');
    } catch(error) { toast(firestoreErrorMessage(error)); }
    finally { submit.disabled=false; }
  });
  initializeFirebaseAuth();
  $('scheduleList').addEventListener('click',async e=>{
    const btn=e.target.closest('[data-action]'); if(!btn)return; const item=items.find(x=>x.id===btn.dataset.id); if(!item)return;
    if(btn.dataset.action==='view')openForm(item,true);
    if(btn.dataset.action==='edit')openForm(item);
    if(btn.dataset.action==='toggle'){
      if(!activeUserId)return;
      try { await firestoreSdk.updateDoc(firestoreSdk.doc(db,'users',activeUserId,'events',item.id),{completed:!item.completed,updatedAt:firestoreSdk.serverTimestamp()});toast(item.completed?'已取消完成標記':'任務已完成'); }
      catch(error) { toast(firestoreErrorMessage(error)); }
    }
    if(btn.dataset.action==='delete'){
      if(!activeUserId)return;
      try { await firestoreSdk.deleteDoc(firestoreSdk.doc(db,'users',activeUserId,'events',item.id));toast('已刪除雲端行程'); }
      catch(error) { toast(firestoreErrorMessage(error)); }
    }
  });
})();

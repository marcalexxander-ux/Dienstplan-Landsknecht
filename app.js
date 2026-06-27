const APP_VERSION="v5.5.2";
const MAX_EMPLOYEES=20;
const days=["Mo","Di","Mi","Do","Fr","Sa","So"];
const SERVICE_DEPARTMENTS=["Restaurantleitung","Service","Minijob Service","Bar","Minijob Bar"];
const KITCHEN_DEPARTMENTS=["Küche","Minijob Küche","Spüler","Reinigung"];
let sb,session,profile,profiles=[],lastSummaryRows=[],lastMinijobRows=[];

function $(id){return document.getElementById(id)}
function pad2(n){return String(n).padStart(2,"0")}
function localISODate(d){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
function parseISODateLocal(iso){const[y,m,d]=iso.split("-").map(Number);return new Date(y,m-1,d)}
function todayISO(){return localISODate(new Date())}
function mondayISO(d=new Date()){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return localISODate(x)}
function addDaysISO(iso,n){const d=parseISODateLocal(iso);d.setDate(d.getDate()+n);return localISODate(d)}
function addWeeksISO(iso,n){return addDaysISO(iso,n*7)}
function monthISO(d=new Date()){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`}
function firstOfMonthISO(m){return m+"-01"}
function lastDayOfMonth(m){const[y,mo]=m.split("-").map(Number);return new Date(y,mo,0).getDate()}
function weekdayMondayFirst(iso){const d=parseISODateLocal(iso).getDay();return d===0?6:d-1}
function fmtDate(iso){return parseISODateLocal(iso).toLocaleDateString("de-DE")}
function escapeHtml(s){return String(s||"").replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[m]))}
function effectiveBreakMinutes(totalMinutes,breakMin){
  const manual=Number(breakMin)||0;
  return totalMinutes>=240 ? Math.max(30,manual) : manual;
}
function hoursBetween(start,end,breakMin){
  if(!start||!end)return 0;
  let[sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);
  let a=sh*60+sm,b=eh*60+em;
  if(b<a)b+=1440;
  const total=b-a;
  const effectiveBreak=effectiveBreakMinutes(total,breakMin);
  return Math.max(0,(total-effectiveBreak)/60);
}
function euroHours(h){return(Number(h)||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})}
function isManagement(){return profile?.role==="management"||profile?.role==="admin"}
function plannable(){return profiles.filter(p=>p.plannable===true)}
function sanitizeDept(dept){return String(dept||"").replace(/\s+/g,"")}
function deptBadge(dept){return `<span class="deptBadge dept-${sanitizeDept(dept)}">${escapeHtml(dept||"—")}</span>`}
function setActiveTab(tabId){document.querySelectorAll(".sidebar button[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tabId));document.querySelectorAll(".tabPage").forEach(p=>p.classList.add("hidden"));$(tabId).classList.remove("hidden")}
function getISOWeek(iso){
  const d=parseISODateLocal(iso);
  const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=date.getUTCDay()||7;
  date.setUTCDate(date.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date-yearStart)/86400000)+1)/7);
}
function setPrintHeader(title,weekStart){
  const from=weekStart;
  const to=addDaysISO(weekStart,6);
  const kw=getISOWeek(weekStart);
  if($("printTitle")) $("printTitle").textContent=title;
  if($("printSubtitle")) $("printSubtitle").textContent=`Restaurant Landsknecht · KW ${kw} · ${fmtDate(from)} bis ${fmtDate(to)}`;
}
function printServicePlan(){
  setActiveTab("planService");
  setPrintHeader("Dienstplan Service",$("weekStartService").value||mondayISO());
  setTimeout(()=>window.print(),150);
}
function printKitchenPlan(){
  setActiveTab("planKitchen");
  setPrintHeader("Dienstplan Küche",$("weekStartKitchen").value||mondayISO());
  setTimeout(()=>window.print(),150);
}
function printMonthPlan(){
  if($("printTitle")) $("printTitle").textContent="Monatsübersicht";
  if($("printSubtitle")) $("printSubtitle").textContent=`Restaurant Landsknecht · ${$("monthSelect").value||monthISO()}`;
  setActiveTab("month");
  setTimeout(()=>window.print(),150);
}
function printCurrent(){window.print()}
function openStaffNew(){setActiveTab("staff");clearStaffForm();window.scrollTo({top:0,behavior:"smooth"})}

function shiftDisplayClass(val){
  const s=(val||"").toLowerCase().trim();
  if(!s)return"";
  if(s.includes("urlaub"))return"shiftVacation";
  if(s.includes("krank"))return"shiftSick";
  if(s.includes("frei"))return"shiftFree";
  const m=s.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if(!m)return"shiftWork";
  const start=Number(m[1]), end=Number(m[3]);
  if(end<=start || end>=23 || start>=18)return"shiftLate";
  if(start>=15)return"shiftEvening";
  if(end-start<=5)return"shiftShort";
  return"shiftMorning";
}

function shiftClass(val){
  const s=(val||"").toLowerCase();
  if(s.includes("urlaub"))return"vac";
  if(s.includes("krank"))return"sick";
  if(s.includes("frei"))return"free";
  const m=s.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if(!m)return s.trim()?"workMorning":"";
  const start=Number(m[1]), end=Number(m[3]);
  if(end<=start || end>=23 || start>=18)return"workLate";
  if(start>=15)return"workEvening";
  if(end-start<=5)return"workShort";
  return"workMorning";
}
function shiftPill(val){return val?`<span class="shift ${shiftClass(val)}">${escapeHtml(val)}</span>`:"<span class='small'>—</span>"}


function applyShiftInputColors(scope=document){
  scope.querySelectorAll("#planGridService input,#planGridKitchen input").forEach(inp=>{
    inp.classList.remove("shiftMorning","shiftEvening","shiftLate","shiftShort","shiftVacation","shiftSick","shiftFree","shiftWork");
    const cls=shiftDisplayClass(inp.value);
    if(cls) inp.classList.add(cls);
  });
}

function checkConfig(){
  const ok=window.SUPABASE_URL&&!window.SUPABASE_URL.includes("HIER_")&&window.SUPABASE_ANON_KEY&&!window.SUPABASE_ANON_KEY.includes("HIER_");
  $("setupNotice").classList.toggle("hidden",ok);
  return ok;
}

async function init(){
  if(!checkConfig())return;
  sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);
  const res=await sb.auth.getSession();
  session=res.data.session;
  if(session)await loadProfile();
  renderAuth();
  sb.auth.onAuthStateChange(async(_e,s)=>{session=s;if(session)await loadProfile();else profile=null;renderAuth()});
}

async function loadProfile(){
  const{data,error}=await sb.from("profiles").select("*").eq("id",session.user.id).single();
  if(error){
    profile={id:session.user.id,email:session.user.email,first_name:"",last_name:"",phone:"",role:"employee",department:"Service",plannable:true,active:true};
    await sb.from("profiles").upsert(profile);
  }else profile=data;
}

function renderAuth(){
  const logged=!!session;
  $("authView").classList.toggle("hidden",logged);
  $("appView").classList.toggle("hidden",!logged);
  document.querySelectorAll(".managementOnly").forEach(el=>el.classList.toggle("hidden",!logged||!isManagement()));
  if(logged){
    $("weekStartService").value ||= mondayISO();
    $("weekStartKitchen").value ||= mondayISO();
    $("monthSelect").value ||= monthISO();
    $("infoDate").value ||= todayISO(); $("vacMonthSelect").value ||= monthISO();
    $("timeDate").value ||= todayISO();
    $("vacFrom").value ||= todayISO();
    $("vacTo").value ||= todayISO();
    if($("minijobMonth")) $("minijobMonth").value ||= monthISO();$("sumFrom").value ||= mondayISO();
    $("sumTo").value ||= addDaysISO(mondayISO(),6);
    loadAll();
  }
}

$("loginBtn").onclick=async()=>{
  const{error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  if(error)alert(error.message);
};
$("registerBtn").onclick=async()=>{
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password)return alert("Bitte E-Mail und Passwort eingeben.");
  const{error}=await sb.auth.signUp({email,password});
  if(error)alert(error.message);else alert("Registrierung erstellt.");
};
$("logoutBtn").onclick=async()=>{await sb.auth.signOut()};
if($("refreshDashboard")) $("refreshDashboard").onclick=loadDashboardLight;

document.querySelectorAll(".sidebar button[data-tab]").forEach(btn=>btn.onclick=()=>setActiveTab(btn.dataset.tab));


async function loadDashboardLight(){
  if(!$("dashboardGrid") || !session || !profiles.length) return;
  const today=todayISO();
  const {data:schedules,error:scheduleError}=await sb.from("schedules").select("*").eq("work_date",today);
  const {data:infos}=await sb.from("daily_infos").select("*").eq("info_date",today);
  const {data:vacs}=await sb.from("vacation_requests").select("*").lte("date_from",today).gte("date_to",today).eq("status","genehmigt");
  if(scheduleError){
    $("dashboardGrid").innerHTML=`<div class="dashCard"><h3>Fehler</h3>${escapeHtml(scheduleError.message)}</div>`;
    return;
  }
  const scheduleList=schedules||[];
  const serviceDept=["Restaurantleitung","Service","Minijob Service","Bar","Minijob Bar"];
  const kitchenDept=["Küche","Spüler","Reinigung"];
  const todayInfo=(infos||[]).map(i=>escapeHtml(i.info_text)).join("<br>")||"Keine Tagesinfo für heute." ;
  const vacationCount=(vacs||[]).length;
  function personName(id){
    const p=profileById(id);
    return `${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}`.trim();
  }
  function renderWorkers(filterDepts){
    const rows=scheduleList
      .map(s=>({s,p:profileById(s.profile_id)}))
      .filter(x=>filterDepts.includes(x.p.department))
      .sort((a,b)=>(Number(a.p.sort_order??9999)-Number(b.p.sort_order??9999)));
    if(!rows.length)return `<p class="dashEmpty">Keine Einträge.</p>`;
    return `<div class="dashList">`+rows.map(({s,p})=>{
      const val=s.status==="arbeit"?`${s.start_time?.slice(0,5)||""}-${s.end_time?.slice(0,5)||""}`:s.status;
      return `<div class="dashWorker"><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b> ${deptBadge(p.department)}<br>${shiftPill(val)}</div>`;
    }).join("")+`</div>`;
  }
  const workCount=scheduleList.filter(s=>s.status==="arbeit").length;
  const sickCount=scheduleList.filter(s=>s.status==="krank").length;
  $("dashboardGrid").innerHTML=`
    <div class="dashCard"><h3>Heute</h3><div class="dashBig">${fmtDate(today)}</div><p>${todayInfo}</p></div>
    <div class="dashCard"><h3>Im Dienst</h3><div class="dashBig">${workCount}</div><p>Urlaub: <b>${vacationCount}</b><br>Krank: <b>${sickCount}</b></p></div>
    <div class="dashCard"><h3>Schnellzugriff</h3><button onclick="setActiveTab('planService')">Service öffnen</button><br><br><button onclick="setActiveTab('planKitchen')">Küche öffnen</button></div>
    <div class="dashCard" style="grid-column:1/-1"><h3>Service / Bar heute</h3>${renderWorkers(serviceDept)}</div>
    <div class="dashCard" style="grid-column:1/-1"><h3>Küche / Reinigung heute</h3>${renderWorkers(kitchenDept)}</div>
  `;
}

async function loadAll(){
  await loadProfiles();
  await Promise.all([loadDashboardLight(),loadPlanService(),loadPlanKitchen(),loadMonth(),loadInfos(),loadTimes(),loadVacations(),loadVacationCalendar(),loadSummary(),loadMinijobCenter()]);
}

async function loadProfiles(){
  const{data,error}=await sb.from("profiles").select("*").eq("active",true).order("department").order("sort_order").order("last_name");
  if(error)return alert(error.message);
  profiles=data||[];
  $("timeProfile").innerHTML=plannable().map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)} (${escapeHtml(p.department||"")})</option>`).join("");$("vacAdminProfile").innerHTML=plannable().map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)} (${escapeHtml(p.department||"")})</option>`).join("");
  if(isManagement())renderStaff();
}


$("prevWeekService").onclick=()=>{$("weekStartService").value=addWeeksISO($("weekStartService").value||mondayISO(),-1);loadPlanService()};
$("nextWeekService").onclick=()=>{$("weekStartService").value=addWeeksISO($("weekStartService").value||mondayISO(),1);loadPlanService()};
$("weekStartService").onchange=loadPlanService;
$("prevWeekKitchen").onclick=()=>{$("weekStartKitchen").value=addWeeksISO($("weekStartKitchen").value||mondayISO(),-1);loadPlanKitchen()};
$("nextWeekKitchen").onclick=()=>{$("weekStartKitchen").value=addWeeksISO($("weekStartKitchen").value||mondayISO(),1);loadPlanKitchen()};
$("weekStartKitchen").onchange=loadPlanKitchen;
$("servicePdfBtn").onclick=printServicePlan;$("kitchenPdfBtn").onclick=printKitchenPlan;$("monthPdfBtn").onclick=printMonthPlan;
$("serviceAddStaffBtn").onclick=openStaffNew;$("kitchenAddStaffBtn").onclick=openStaffNew;$("newStaffBtn").onclick=clearStaffForm;

async function loadPlanService(){await loadPlanFiltered("Service",$("weekStartService").value||mondayISO(),SERVICE_DEPARTMENTS,"planGridService")}
async function loadPlanKitchen(){await loadPlanFiltered("Küche",$("weekStartKitchen").value||mondayISO(),KITCHEN_DEPARTMENTS,"planGridKitchen")}


function renderPersonCell(p, people){
  const controls = isManagement()
    ? `<div class="orderControls">
         <span class="dragHandle" title="Ziehen zum Verschieben">☰</span>
         <button type="button" onclick="moveEmployee('${p.id}','up')" title="Nach oben">⬆️</button>
         <button type="button" onclick="moveEmployee('${p.id}','down')" title="Nach unten">⬇️</button>
       </div>`
    : "";
  return `${controls}<span class="orderCellName">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</span><br>${deptBadge(p.department)}${isManagement()?'<div class="orderHint">Ziehen oder Pfeile nutzen</div>':''}`;
}

async function normalizeSortOrder(){
  const people = plannable().slice().sort((a,b)=>(Number(a.sort_order??9999)-Number(b.sort_order??9999)) || String(a.department||"").localeCompare(String(b.department||"")) || String(a.last_name||"").localeCompare(String(b.last_name||"")));
  let changed=false;
  for(let i=0;i<people.length;i++){
    if(Number(people[i].sort_order)!==i+1){
      await sb.from("profiles").update({sort_order:i+1}).eq("id",people[i].id);
      changed=true;
    }
  }
  if(changed) await loadProfiles();
}

async function moveEmployee(id,direction){
  if(!isManagement()) return;
  const all = plannable().slice().sort((a,b)=>(Number(a.sort_order??9999)-Number(b.sort_order??9999)) || String(a.department||"").localeCompare(String(b.department||"")) || String(a.last_name||"").localeCompare(String(b.last_name||"")));
  const idx = all.findIndex(p=>p.id===id);
  if(idx<0) return;
  const swapIdx = direction==="up" ? idx-1 : idx+1;
  if(swapIdx<0 || swapIdx>=all.length) return;
  const current = all[idx], other = all[swapIdx];
  const currentOrder = Number(current.sort_order ?? idx+1);
  const otherOrder = Number(other.sort_order ?? swapIdx+1);
  const r1 = await sb.from("profiles").update({sort_order:otherOrder}).eq("id",current.id);
  const r2 = await sb.from("profiles").update({sort_order:currentOrder}).eq("id",other.id);
  if(r1.error || r2.error) alert((r1.error||r2.error).message);
  await loadProfiles();
  await loadPlanService();
  await loadPlanKitchen();
  await loadMonth();
}
window.moveEmployee=moveEmployee;

function setupDragAndDrop(targetId){
  if(!isManagement()) return;
  const rows=[...document.querySelectorAll(`#${targetId} tbody tr[data-profile-id]`)];
  let draggedId=null;
  rows.forEach(row=>{
    row.addEventListener("dragstart",e=>{
      draggedId=row.dataset.profileId;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed="move";
    });
    row.addEventListener("dragend",()=>{
      row.classList.remove("dragging");
      rows.forEach(r=>r.classList.remove("dragOver"));
    });
    row.addEventListener("dragover",e=>{
      e.preventDefault();
      row.classList.add("dragOver");
    });
    row.addEventListener("dragleave",()=>row.classList.remove("dragOver"));
    row.addEventListener("drop",async e=>{
      e.preventDefault();
      row.classList.remove("dragOver");
      const targetIdProfile=row.dataset.profileId;
      if(!draggedId || draggedId===targetIdProfile) return;
      await reorderEmployeeBefore(draggedId,targetIdProfile);
    });
  });
}

async function reorderEmployeeBefore(draggedId,targetIdProfile){
  const all=plannable().slice().sort((a,b)=>(Number(a.sort_order??9999)-Number(b.sort_order??9999)) || String(a.department||"").localeCompare(String(b.department||"")) || String(a.last_name||"").localeCompare(String(b.last_name||"")));
  const dragged=all.find(p=>p.id===draggedId);
  const target=all.find(p=>p.id===targetIdProfile);
  if(!dragged || !target) return;
  const list=all.filter(p=>p.id!==draggedId);
  const targetIndex=list.findIndex(p=>p.id===targetIdProfile);
  list.splice(targetIndex,0,dragged);
  for(let i=0;i<list.length;i++){
    await sb.from("profiles").update({sort_order:i+1}).eq("id",list[i].id);
  }
  await loadProfiles();
  await loadPlanService();
  await loadPlanKitchen();
  await loadMonth();
}


async function loadPlanFiltered(title,week,departments,targetId){
  const from=week,to=addDaysISO(week,6);
  const[{data:schedules},{data:infos}]=await Promise.all([
    sb.from("schedules").select("*").gte("work_date",from).lte("work_date",to),
    sb.from("daily_infos").select("*").gte("info_date",from).lte("info_date",to)
  ]);
  const byKey={};(schedules||[]).forEach(s=>byKey[`${s.profile_id}_${s.work_date}`]=s);
  const infoByDate={};(infos||[]).forEach(i=>infoByDate[i.info_date]=i.info_text);
  const people=plannable().filter(p=>departments.includes(p.department)).sort((a,b)=>(Number(a.sort_order??9999)-Number(b.sort_order??9999)) || String(a.last_name||"").localeCompare(String(b.last_name||"")));
  let html='<div class="planLegend"><span class="legendMorning">Früh/Arbeit</span><span class="legendEvening">Spät</span><span class="legendVacation">Urlaub</span><span class="legendSick">Krank</span><span class="legendFree">Frei</span></div><div class="grid"><table><thead><tr><th>Mitarbeiter / Bereich</th>';
  days.forEach((d,i)=>{const iso=addDaysISO(week,i);html+=`<th>${d}<br><span class="small">${fmtDate(iso)}</span>${infoByDate[iso]?`<div class="dayInfo">📢 ${escapeHtml(infoByDate[iso])}</div>`:""}</th>`});
  html+='</tr></thead><tbody>';
  people.forEach(p=>{
    html+=`<tr ${isManagement()?`draggable="true" data-profile-id="${p.id}"`:""}><td>${renderPersonCell(p, people)}</td>`;
    days.forEach((_,i)=>{
      const iso=addDaysISO(week,i),item=byKey[`${p.id}_${iso}`];
      const val=item?(item.status==="arbeit"?`${item.start_time?.slice(0,5)||""}-${item.end_time?.slice(0,5)||""}`:item.status):"";
      html+=isManagement()?`<td class="${shiftClass(val)}"><input class="${shiftDisplayClass(val)}" data-profile="${p.id}" data-date="${iso}" data-id="${item?.id||""}" value="${escapeHtml(val)}" placeholder="08:00-16:00 / frei / urlaub / krank"></td>`:`<td>${shiftPill(val)}</td>`;
    });
    html+="</tr>";
  });
  if(!people.length)html+=`<tr><td colspan="8"><span class="small">Keine einplanbaren Mitarbeiter für ${escapeHtml(title)}.</span></td></tr>`;
  html+="</tbody></table></div>";
  $(targetId).innerHTML=html;
  document.querySelectorAll(`#${targetId} input`).forEach(inp=>inp.onchange=()=>{applyShiftInputColors($(targetId));saveScheduleCell(inp)});
  setupDragAndDrop(targetId);
  applyShiftInputColors($(targetId));
}


async function saveScheduleCell(inp){
  if(!isManagement()) return;

  const profileId = inp.dataset.profile;
  const workDate = inp.dataset.date;
  const rawOriginal = (inp.value || "").trim();
  const raw = rawOriginal.toLowerCase();

  if(!profileId || !workDate) return;

  if(!raw){
    if(inp.dataset.id){
      const del = await sb.from("schedules").delete().eq("id", inp.dataset.id);
      if(del.error){
        alert("Fehler beim Löschen: " + del.error.message);
        return;
      }
      inp.dataset.id = "";
    }
    await loadMonth();
    await loadMinijobCenter();
    return;
  }

  let payload = {
    profile_id: profileId,
    work_date: workDate,
    status: raw,
    start_time: null,
    end_time: null
  };

  const match = raw.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);

  if(match){
    payload.status = "arbeit";
    payload.start_time = `${match[1].padStart(2,"0")}:${match[2]}`;
    payload.end_time = `${match[3].padStart(2,"0")}:${match[4]}`;
  }else if(raw.includes("frei")){
    payload.status = "frei";
  }else if(raw.includes("urlaub")){
    payload.status = "urlaub";
  }else if(raw.includes("krank")){
    payload.status = "krank";
  }else{
    alert("Bitte im Format 17:00-22:00 oder frei / urlaub / krank eintragen.");
    return;
  }

  const res = inp.dataset.id
    ? await sb.from("schedules").update(payload).eq("id", inp.dataset.id).select().single()
    : await sb.from("schedules").insert(payload).select().single();

  if(res.error){
    alert("Fehler beim Speichern: " + res.error.message);
    return;
  }

  inp.dataset.id = res.data.id;

  const displayValue = payload.status === "arbeit"
    ? `${payload.start_time}-${payload.end_time}`
    : payload.status;

  inp.value = displayValue;
  applyShiftInputColors(document);

  await loadDashboardLight();
  await loadMonth();
  await loadMinijobCenter();
}

$("prevMonth").onclick=()=>{const[y,m]=($("monthSelect").value||monthISO()).split("-").map(Number);$("monthSelect").value=monthISO(new Date(y,m-2,1));loadMonth()};
$("nextMonth").onclick=()=>{const[y,m]=($("monthSelect").value||monthISO()).split("-").map(Number);$("monthSelect").value=monthISO(new Date(y,m,1));loadMonth()};
$("monthSelect").onchange=loadMonth;

async function loadMonth(){
  if(!session||!profiles.length)return;
  const month=$("monthSelect").value||monthISO(),from=firstOfMonthISO(month),to=month+"-"+pad2(lastDayOfMonth(month));
  const[{data:schedules},{data:infos}]=await Promise.all([
    sb.from("schedules").select("*").gte("work_date",from).lte("work_date",to),
    sb.from("daily_infos").select("*").gte("info_date",from).lte("info_date",to)
  ]);
  const schedByDate={};(schedules||[]).forEach(s=>{schedByDate[s.work_date]||=[];schedByDate[s.work_date].push(s)});
  const infoByDate={};(infos||[]).forEach(i=>infoByDate[i.info_date]=i.info_text);
  let html='<div class="grid"><table class="monthTable"><thead><tr>'+days.map(d=>`<th>${d}</th>`).join("")+'</tr></thead><tbody><tr>';
  const total=lastDayOfMonth(month),first=weekdayMondayFirst(from);
  for(let i=0;i<first;i++)html+='<td class="monthCell"></td>';
  for(let day=1;day<=total;day++){
    const iso=month+"-"+pad2(day);
    if(day>1&&weekdayMondayFirst(iso)===0)html+="</tr><tr>";
    let c=`<div class="monthDate">${fmtDate(iso)}</div>`;
    if(infoByDate[iso])c+=`<div class="monthInfo">📢 ${escapeHtml(infoByDate[iso])}</div>`;
    (schedByDate[iso]||[]).forEach(s=>{
      const p=plannable().find(x=>x.id===s.profile_id);if(!p)return;
      const val=s.status==="arbeit"?`${s.start_time?.slice(0,5)||""}-${s.end_time?.slice(0,5)||""}`:s.status;
      c+=`<div class="monthShift"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b> ${deptBadge(p.department)}<br>${escapeHtml(val)}</div>`;
    });
    html+=`<td class="monthCell">${c}</td>`;
  }
  for(let i=weekdayMondayFirst(to)+1;i<7;i++)html+='<td class="monthCell"></td>';
  html+="</tr></tbody></table></div>";
  $("monthGrid").innerHTML=html;
}

$("saveInfo").onclick=async()=>{
  const d=$("infoDate").value,t=$("infoText").value.trim();
  if(!d||!t)return alert("Datum und Info ausfüllen.");
  const{error}=await sb.from("daily_infos").upsert({info_date:d,info_text:t,created_by:profile.id},{onConflict:"info_date"});
  if(error)alert(error.message);else{$("infoText").value="";await createNotification("Neue Tagesinfo",t);await loadInfos();await loadPlanService();await loadPlanKitchen();await loadMonth()}
};
$("deleteInfo").onclick=async()=>{const d=$("infoDate").value;if(!d)return;await sb.from("daily_infos").delete().eq("info_date",d);await loadInfos();await loadPlanService();await loadPlanKitchen();await loadMonth()};
async function loadInfos(){
  const{data}=await sb.from("daily_infos").select("*").order("info_date",{ascending:false}).limit(80);
  $("infoList").innerHTML=(data||[]).map(i=>`<div class="entry"><b>${fmtDate(i.info_date)}</b><br>${escapeHtml(i.info_text)}</div>`).join("")||"<p>Keine Tagesinfos.</p>";
}

$("saveTime").onclick=async()=>{
  const profileId=$("timeProfile").value,date=$("timeDate").value,start=$("timeStart").value,end=$("timeEnd").value;
  let br=Number($("timeBreak").value)||0;
  if(!date||!start||!end)return alert("Datum, Beginn und Ende ausfüllen.");
  let[sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);
  let a=sh*60+sm,b=eh*60+em;if(b<a)b+=1440;
  br=effectiveBreakMinutes(b-a,br);
  const{error}=await sb.from("time_entries").insert({profile_id:profileId,work_date:date,start_time:start,end_time:end,break_minutes:br,hours:hoursBetween(start,end,br),created_by:profile.id});
  if(error)alert(error.message);else{await loadTimes();await loadSummary()}
};
async function loadTimes(){
  let q=sb.from("time_entries").select("*, profiles(first_name,last_name)").order("work_date",{ascending:false}).limit(50);
  const{data}=await q;
  $("timeList").innerHTML=(data||[]).map(e=>`<div class="entry"><b>${escapeHtml(e.profiles?.first_name||"")} ${escapeHtml(e.profiles?.last_name||"")}</b><br>${fmtDate(e.work_date)}: ${e.start_time.slice(0,5)}-${e.end_time.slice(0,5)}, Pause ${e.break_minutes} Min.<br><b>${euroHours(e.hours)} Std.</b></div>`).join("")||"<p>Keine Zeiteinträge.</p>";
}



async function syncVacationToSchedule(profileId, from, to){
  if(!profileId || !from || !to) return;
  let d = from;
  while(d <= to){
    const existing = await sb.from("schedules").select("*").eq("profile_id",profileId).eq("work_date",d).maybeSingle();
    const payload = {profile_id:profileId,work_date:d,status:"urlaub",start_time:null,end_time:null};
    if(existing.data){
      await sb.from("schedules").update(payload).eq("id",existing.data.id);
    }else{
      await sb.from("schedules").insert(payload);
    }
    d = addDaysISO(d,1);
  }
}

async function removeVacationFromSchedule(profileId, from, to){
  if(!profileId || !from || !to) return;
  await sb.from("schedules")
    .delete()
    .eq("profile_id",profileId)
    .gte("work_date",from)
    .lte("work_date",to)
    .eq("status","urlaub");
}

async function syncApprovedVacationsToPlan(){
  if(!isManagement()) return;
  const {data} = await sb.from("vacation_requests").select("*").eq("status","genehmigt");
  for(const v of (data||[])){
    await syncVacationToSchedule(v.profile_id,v.date_from,v.date_to);
  }
}

$("requestVacation").onclick=async()=>{
  const from=$("vacFrom").value,to=$("vacTo").value;
  if(!from||!to)return alert("Von und Bis ausfüllen.");
  const{error}=await sb.from("vacation_requests").insert({profile_id:profile.id,date_from:from,date_to:to,note:$("vacNote").value,status:"beantragt"});
  if(error)alert(error.message);else{await createNotification("Urlaub beantragt",`${profile.first_name} ${profile.last_name} hat Urlaub beantragt.`);await loadVacations();await loadVacationCalendar()}
};

$("prevVacMonth").onclick=()=>{const[y,m]=($("vacMonthSelect").value||monthISO()).split("-").map(Number);$("vacMonthSelect").value=monthISO(new Date(y,m-2,1));loadVacationCalendar()};
$("nextVacMonth").onclick=()=>{const[y,m]=($("vacMonthSelect").value||monthISO()).split("-").map(Number);$("vacMonthSelect").value=monthISO(new Date(y,m,1));loadVacationCalendar()};
$("vacMonthSelect").onchange=loadVacationCalendar;
$("vacAdminFrom").onchange=loadVacationOverlap;
$("vacAdminTo").onchange=loadVacationOverlap;

$("addVacationAdmin").onclick=async()=>{
  if(!isManagement()) return;
  const profileId=$("vacAdminProfile").value, from=$("vacAdminFrom").value, to=$("vacAdminTo").value;
  if(!profileId||!from||!to)return alert("Mitarbeiter, Von und Bis ausfüllen.");
  const{error}=await sb.from("vacation_requests").insert({
    profile_id:profileId,
    date_from:from,
    date_to:to,
    note:$("vacAdminNote").value,
    status:"genehmigt",
    decided_by:profile.id,
    decided_at:new Date().toISOString()
  });
  if(error)alert(error.message);else{await syncVacationToSchedule(profileId,from,to);$("vacAdminNote").value="";await createNotification("Urlaub eingetragen","Ein Urlaub wurde eingetragen.");await loadVacations();await loadVacationCalendar();await loadVacationOverlap();await loadPlanService();await loadPlanKitchen();await loadMonth()}
};

async function setVacationStatus(id,status){
  const before = await sb.from("vacation_requests").select("*").eq("id",id).single();
  await sb.from("vacation_requests").update({status,decided_by:profile.id,decided_at:new Date().toISOString()}).eq("id",id);
  if(before.data){
    if(status==="genehmigt") await syncVacationToSchedule(before.data.profile_id,before.data.date_from,before.data.date_to);
    if(status==="abgelehnt") await removeVacationFromSchedule(before.data.profile_id,before.data.date_from,before.data.date_to);
  }
  await loadVacations();await loadVacationCalendar();await loadPlanService();await loadPlanKitchen();await loadMonth();
}
window.setVacationStatus=setVacationStatus;


function profileById(id){return profiles.find(p=>p.id===id)||{}}

async function loadVacations(){
  let q=sb.from("vacation_requests").select("*").order("date_from",{ascending:false});
  if(!isManagement())q=q.eq("profile_id",profile.id);
  const{data,error}=await q;
  if(error){
    $("vacList").innerHTML=`<div class="entry"><b>Fehler beim Laden der Urlaubsliste:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }
  $("vacList").innerHTML=(data||[]).map(v=>{
    const p=profileById(v.profile_id);
    return `<div class="entry">
      <b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b> ${deptBadge(p.department)}
      <br>${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)}
      <br>Status: <b>${escapeHtml(v.status)}</b>
      <br>${escapeHtml(v.note||"")}
      ${isManagement()&&v.status==="beantragt"?`<br><button class="ok" onclick="setVacationStatus('${v.id}','genehmigt')">Genehmigen</button> <button class="danger" onclick="setVacationStatus('${v.id}','abgelehnt')">Ablehnen</button>`:""}
    </div>`;
  }).join("")||"<p>Keine Urlaubsanträge oder Urlaube vorhanden.</p>";
}

async function loadVacationCalendar(){
  if(!session || !profiles.length) return;
  const month=$("vacMonthSelect").value||monthISO(), from=firstOfMonthISO(month), to=month+"-"+pad2(lastDayOfMonth(month));
  const{data,error}=await sb.from("vacation_requests").select("*").lte("date_from",to).gte("date_to",from).in("status",["beantragt","genehmigt"]);
  if(error){
    $("vacCalendar").innerHTML=`<div class="entry"><b>Fehler beim Laden des Urlaubskalenders:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }
  const byDate={};
  (data||[]).forEach(v=>{
    let d=v.date_from < from ? from : v.date_from;
    const end=v.date_to > to ? to : v.date_to;
    while(d<=end){
      byDate[d] ||= [];
      byDate[d].push(v);
      d=addDaysISO(d,1);
    }
  });
  let html='<div class="grid"><table class="vacCalendarTable"><thead><tr>'+days.map(d=>`<th>${d}</th>`).join("")+'</tr></thead><tbody><tr>';
  const total=lastDayOfMonth(month), first=weekdayMondayFirst(from);
  for(let i=0;i<first;i++)html+='<td></td>';
  for(let day=1;day<=total;day++){
    const iso=month+"-"+pad2(day);
    if(day>1&&weekdayMondayFirst(iso)===0)html+="</tr><tr>";
    const list=byDate[iso]||[];
    let cell=`<div class="vacDay">${day}.${list.length?`<span class="vacCount">${list.length}</span>`:""}</div>`;
    list.forEach(v=>{
      const p=profileById(v.profile_id);
      cell+=`<span class="vacPerson">${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} (${escapeHtml(v.status)})</span>`;
    });
    html+=`<td>${cell}</td>`;
  }
  for(let i=weekdayMondayFirst(to)+1;i<7;i++)html+='<td></td>';
  $("vacCalendar").innerHTML=html+"</tr></tbody></table></div>";
}

async function loadVacationOverlap(){
  if(!isManagement()) return;
  const from=$("vacAdminFrom").value, to=$("vacAdminTo").value;
  if(!from||!to){$("vacOverlapInfo").innerHTML="Zeitraum auswählen.";return}
  const{data,error}=await sb.from("vacation_requests").select("*").lte("date_from",to).gte("date_to",from).in("status",["beantragt","genehmigt"]);
  if(error){
    $("vacOverlapInfo").innerHTML=`Fehler: ${escapeHtml(error.message)}`;
    return;
  }
  const rows=(data||[]).map(v=>{
    const p=profileById(v.profile_id);
    return `${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} – ${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)} (${escapeHtml(v.status)})`;
  });
  $("vacOverlapInfo").innerHTML=rows.length?`<b>${rows.length} Überschneidung(en):</b><br>${rows.join("<br>")}`:"Keine Überschneidungen im gewählten Zeitraum.";
}

$("saveStaff").onclick=async()=>{
  const id=$("editingStaffId").value,first=$("staffFirstName").value.trim(),last=$("staffLastName").value.trim(),email=$("staffEmail").value.trim(),phone=$("staffPhone").value.trim(),role=$("staffRole").value,department=$("staffDepartment").value,plannableValue=$("staffPlannable").checked;
  if(!first||!last||!email)return alert("Vorname, Nachname und E-Mail sind Pflicht.");
  if(!id&&plannable().length>=MAX_EMPLOYEES&&plannableValue)return alert("Maximal 20 einplanbare Mitarbeiter erreicht.");
  const contract_type=$("staffContractType")?$("staffContractType").value:"minijob",hourly_rate=$("staffHourlyRate")?Number($("staffHourlyRate").value||0):0;const payload={first_name:first,last_name:last,email,phone,role,department:role==="management"?null:department,plannable:plannableValue,contract_type,hourly_rate,active:true};
  const res=id?await sb.from("profiles").update(payload).eq("id",id):await sb.from("profiles").insert(payload);
  if(res.error)alert(res.error.message);else{clearStaffForm();await loadProfiles();await loadPlanService();await loadPlanKitchen();await loadMonth()}
};
$("clearStaff").onclick=clearStaffForm;
function clearStaffForm(){["editingStaffId","staffFirstName","staffLastName","staffEmail","staffPhone"].forEach(id=>$(id).value="");$("staffRole").value="employee";$("staffDepartment").value="Service";if($("staffContractType"))$("staffContractType").value="minijob";if($("staffHourlyRate"))$("staffHourlyRate").value="";$("staffPlannable").checked=true}
function editStaff(id){
  const p=profiles.find(x=>x.id===id);
  $("editingStaffId").value=p.id;$("staffFirstName").value=p.first_name||"";$("staffLastName").value=p.last_name||"";$("staffEmail").value=p.email||"";$("staffPhone").value=p.phone||"";$("staffRole").value=p.role==="admin"?"management":p.role;$("staffDepartment").value=p.department||"Service";$("staffPlannable").checked=p.plannable===true;if($("staffContractType"))$("staffContractType").value=p.contract_type||"minijob";if($("staffHourlyRate"))$("staffHourlyRate").value=p.hourly_rate??"";
}
async function deactivateStaff(id){if(!confirm("Mitarbeiter deaktivieren?"))return;await sb.from("profiles").update({active:false}).eq("id",id);await loadProfiles();await loadPlanService();await loadPlanKitchen();await loadMonth()}
window.editStaff=editStaff;window.deactivateStaff=deactivateStaff;
function renderStaff(){
  $("staffList").innerHTML=profiles.map(p=>`<div class="entry"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><br>${escapeHtml(p.email||"")}<br>${escapeHtml(p.phone||"")}<br>Rolle: ${p.role==="management"||p.role==="admin"?"Geschäftsführung":"Mitarbeiter"}<br>Bereich: ${deptBadge(p.department)}<br>Einplanen: ${p.plannable?"Ja":"Nein"}<br>Vertragsart: ${escapeHtml(p.contract_type||"—")}<br>Stundenlohn: ${p.hourly_rate?Number(p.hourly_rate).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €":"—"}<br>Reihenfolge: ${p.sort_order??"—"}<div class="staffActions"><button class="secondary" onclick="editStaff('${p.id}')">Bearbeiten</button>${p.id!==profile.id?`<button class="danger" onclick="deactivateStaff('${p.id}')">Deaktivieren</button>`:""}</div></div>`).join("");
}

if($("loadMinijobCenter")) $("loadMinijobCenter").onclick=loadMinijobCenter;
if($("exportMinijobCsv")) $("exportMinijobCsv").onclick=exportMinijobCsv;
$("loadSummary").onclick=loadSummary;
$("exportCsv").onclick=()=>{
  if(!lastSummaryRows.length)return alert("Bitte zuerst Auswertung laden.");
  const rows=[["Mitarbeiter","Stunden","Einträge"],...lastSummaryRows.map(r=>[r.name,euroHours(r.hours),r.count])];
  const csv=rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(";")).join("\\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="stunden-auswertung.csv";a.click()
};
async function loadSummary(){
  if(!isManagement())return;
  const from=$("sumFrom").value||"0000-01-01",to=$("sumTo").value||"9999-12-31";
  const{data}=await sb.from("time_entries").select("*, profiles(first_name,last_name,department,role)").gte("work_date",from).lte("work_date",to);
  const totals={};
  (data||[]).forEach(e=>{
    if(e.profiles?.role==="management"||e.profiles?.role==="admin")return;
    const name=`${e.profiles?.first_name||""} ${e.profiles?.last_name||""} (${e.profiles?.department||""})`.trim();
    totals[name]||={hours:0,count:0};totals[name].hours+=Number(e.hours||0);totals[name].count++;
  });
  lastSummaryRows=Object.entries(totals).map(([name,v])=>({name,hours:v.hours,count:v.count}));
  let html='<div class="grid"><table><thead><tr><th>Mitarbeiter</th><th>Stunden</th><th>Einträge</th></tr></thead><tbody>';
  lastSummaryRows.forEach(r=>html+=`<tr><td>${escapeHtml(r.name)}</td><td><b>${euroHours(r.hours)}</b></td><td>${r.count}</td></tr>`);
  $("summaryList").innerHTML=html+"</tbody></table></div>";
}
async function createNotification(title,body){if(isManagement())await sb.from("notifications").insert({title,body,created_by:profile.id})}




const MINIJOB_DEPARTMENTS=["Minijob Service","Minijob Bar","Minijob Küche"];

function scheduleHoursForMinijobEntry(entry){
  if(!entry || entry.status !== "arbeit") return 0;

  const start = String(entry.start_time).slice(0,5);
  const end = String(entry.end_time).slice(0,5);

  let [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);

  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;

  if(endMin < startMin){
    endMin += 24 * 60;
  }

  let minutes = endMin - startMin;

  if(minutes >= 240){
    minutes -= 30;
  }

  return minutes / 60;
}

function minijobCenterEmployeeFilter(p){
  return MINIJOB_DEPARTMENTS.includes(p.department) && p.active!==false;
}

function exportMinijobCsv(){
  if(!lastMinijobRows.length){
    alert("Bitte zuerst Minijob-Center neu berechnen.");
    return;
  }
  const rows=[
    ["Mitarbeiter","Bereich","Stundenlohn","Geplante Stunden","Geplanter Verdienst","Restbetrag","Reststunden","ca. Schichten","Letzte Schicht","Status"],
    ...lastMinijobRows.map(r=>[
      r.name,r.department,
      r.hourly_rate.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}),
      r.hours.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}),
      r.earned.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}),
      r.rest.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}),
      r.rest_hours.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}),
      r.possible_shifts ?? "",
      r.last_shift ?? "",
      r.status
    ])
  ];
  const csv=rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(";")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`minijob-center-${$("minijobMonth")?.value||monthISO()}.csv`;
  a.click();
}


function plannedHoursFromSchedule(s){
  if(!s || s.status!=="arbeit" || !s.start_time || !s.end_time) return 0;
  return hoursBetween(String(s.start_time).slice(0,5),String(s.end_time).slice(0,5),0);
}


function minijobDepartments(){
  return ["Minijob Service","Minijob Bar","Minijob Küche"];
}
function isMinijobProfile(p){
  return minijobDepartments().includes(p?.department) && p?.active !== false;
}
function scheduleHoursForMinijobEntry(entry){
  if(!entry || entry.status !== "arbeit" || !entry.start_time || !entry.end_time) return 0;
  const start = String(entry.start_time).slice(0,5);
  const end = String(entry.end_time).slice(0,5);
  let [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if(endMin < startMin) endMin += 24 * 60;
  let minutes = endMin - startMin;
  if(minutes >= 240) minutes -= 30;
  return Math.max(0, minutes / 60);
}

async function loadMinijobCenter(){
  if(!$("minijobCenterList") || !isManagement()) return;

  const month = $("minijobMonth")?.value || monthISO();
  const limit = Number($("minijobLimit")?.value || 603);
  const from = firstOfMonthISO(month);
  const to = month + "-" + String(lastDayOfMonth(month)).padStart(2,"0");

  $("minijobCenterList").innerHTML = '<div class="entry">Minijob-Center wird aus dem Dienstplan neu berechnet...</div>';

  const { data, error } = await sb.from("schedules")
    .select("*")
    .gte("work_date", from)
    .lte("work_date", to);

  if(error){
    $("minijobCenterList").innerHTML = `<div class="entry"><b>Fehler beim Laden:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }

  const minijobbers = profiles
    .filter(isMinijobProfile)
    .sort((a,b)=>
      (Number(a.sort_order??9999)-Number(b.sort_order??9999)) ||
      String(a.last_name||"").localeCompare(String(b.last_name||""))
    );

  const totals = {};
  (data||[]).forEach(s=>{
    if(s.status !== "arbeit") return;
    totals[s.profile_id] ||= {hours:0,count:0,last:"—"};
    const h = scheduleHoursForMinijobEntry(s);
    totals[s.profile_id].hours += h;
    if(h > 0){
      totals[s.profile_id].count += 1;
      totals[s.profile_id].last = `${fmtDate(s.work_date)} ${String(s.start_time).slice(0,5)}-${String(s.end_time).slice(0,5)}`;
    }
  });

  lastMinijobRows = [];

  let html = `
    <div class="miniInfo">
      <b>Quelle:</b> Dienstplan · <b>Monat:</b> ${escapeHtml(month)} · <b>Grenze:</b> ${limit.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €<br>
      Nur Minijob Service, Minijob Bar und Minijob Küche. Ab 4 Stunden werden 30 Minuten Pause abgezogen.
    </div>
    <div class="grid"><table class="miniJobTable">
      <thead><tr>
        <th>Mitarbeiter</th><th>Bereich</th><th>Std.-Lohn</th><th>Schichten</th><th>Stunden</th><th>Verdienst</th><th>Rest</th><th>Status</th>
      </tr></thead><tbody>`;

  minijobbers.forEach(p=>{
    const t = totals[p.id] || {hours:0,count:0,last:"—"};
    const rate = Number(p.hourly_rate || 0);
    const earned = t.hours * rate;
    const rest = Math.max(0, limit - earned);
    const pct = limit ? Math.min(100, Math.round((earned / limit) * 100)) : 0;

    let status = "🟢 OK";
    let cls = "miniOk";
    if(earned >= limit){ status = "🔴 Grenze erreicht"; cls = "miniStop"; }
    else if(earned >= limit * 0.8){ status = "🟡 Achtung"; cls = "miniWarn"; }

    lastMinijobRows.push({
      name: `${p.first_name||""} ${p.last_name||""}`.trim(),
      department: p.department || "",
      hourly_rate: rate,
      hours: t.hours,
      earned,
      rest,
      status
    });

    html += `<tr>
      <td><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><span class="small">${escapeHtml(t.last)}</span></td>
      <td>${deptBadge(p.department)}</td>
      <td>${rate.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</td>
      <td>${t.count}</td>
      <td>${euroHours(t.hours)}</td>
      <td><b>${earned.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</b><div class="miniProgress"><span style="width:${pct}%"></span></div></td>
      <td>${rest.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</td>
      <td><span class="${cls}">${status}</span></td>
    </tr>`;
  });

  html += '</tbody></table></div>';

  if(!minijobbers.length){
    html = '<p>Keine Mitarbeiter in den Bereichen Minijob Service, Minijob Bar oder Minijob Küche gefunden.</p>';
  }

  $("minijobCenterList").innerHTML = html;
  applyMobileTableLabels();
}


function setupMobileNavigation(){
  const btn=document.getElementById("mobileMenuToggle");
  const sidebar=document.querySelector(".sidebar")||document.querySelector("nav");
  if(!btn||!sidebar)return;
  btn.onclick=()=>sidebar.classList.toggle("mobileOpen");
  sidebar.querySelectorAll("button,[data-tab]").forEach(el=>el.addEventListener("click",()=>sidebar.classList.remove("mobileOpen")));
}

function applyMobileTableLabels(){
  document.querySelectorAll("#minijobCenter table, #minijobCenterList table, .miniJobTable").forEach(table=>{
    const headers=[...table.querySelectorAll("thead th")].map(th=>th.textContent.trim());
    table.querySelectorAll("tbody tr").forEach(tr=>{
      [...tr.children].forEach((td,i)=>{
        if(headers[i]) td.dataset.label=headers[i];
      });
    });
  });
}

setupMobileNavigation();

function setupPasswordReset(){
  const btn = $("resetPasswordBtn");
  if(!btn) return;

  btn.onclick = async () => {
    if(!checkConfig()) return;
    if(!sb) sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

    const email = $("email")?.value?.trim();
    if(!email){
      alert("Bitte zuerst deine E-Mail-Adresse eingeben.");
      return;
    }

    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });

    if(error){
      alert("Fehler beim Passwort-Reset: " + error.message);
      return;
    }

    alert("Passwort-Reset wurde gesendet. Bitte prüfe dein E-Mail-Postfach.");
  };
}

setupPasswordReset();
init();

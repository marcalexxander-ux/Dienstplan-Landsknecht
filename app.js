document.body.classList.add("loggedOut");
const APP_VERSION="v6.0.15";
const MAX_EMPLOYEES=20;
const days=["Mo","Di","Mi","Do","Fr","Sa","So"];
const SERVICE_DEPARTMENTS=["Restaurantleitung","Service","Minijob Service","Bar","Minijob Bar"];
const KITCHEN_DEPARTMENTS=["Küche","Minijob Küche","Spüler","Reinigung"];
let sb,session,profile,profiles=[],lastSummaryRows=[],lastMinijobRows=[],dailyInfoCache=[];

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

function isOwnProfile(p){
  return !!profile && !!p && p.id === profile.id;
}
function ownShiftBadge(p){
  return "";
}
function ownShiftClass(p){
  return (!isManagement() && isOwnProfile(p)) ? " ownShiftHighlight" : "";
}
function sortOwnShiftFirst(rows){
  if(isManagement() || !profile) return rows;
  return rows.slice().sort((a,b)=>{
    const aOwn = a.p?.id === profile.id ? 1 : 0;
    const bOwn = b.p?.id === profile.id ? 1 : 0;
    if(aOwn !== bOwn) return bOwn - aOwn;
    const aTime = a.s?.start_time || a.item?.start_time || "";
    const bTime = b.s?.start_time || b.item?.start_time || "";
    return String(aTime).localeCompare(String(bTime)) || String(a.p?.last_name||"").localeCompare(String(b.p?.last_name||""));
  });
}

function isManagement(){return profile?.role==="management"||profile?.role==="admin"}
function plannable(){return profiles.filter(p=>p.plannable===true)}
function sanitizeDept(dept){return String(dept||"").replace(/\s+/g,"")}
function deptBadge(dept){return `<span class="deptBadge dept-${sanitizeDept(dept)}">${escapeHtml(dept||"—")}</span>`}
function setActiveTab(tabId){
  const normalized = (tabId==="today" || tabId==="home") ? "dashboard" : tabId;
  document.querySelectorAll(".sidebar button[data-tab], #mobileTouchNav button[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===normalized));
  document.querySelectorAll(".tabPage").forEach(p=>p.classList.add("hidden"));
  const target=$(normalized);
  if(target) target.classList.remove("hidden");
  const activeTouch = document.querySelector(`#mobileTouchNav button[data-tab="${normalized}"]`);
  if(activeTouch) activeTouch.scrollIntoView({behavior:"smooth", inline:"center", block:"nearest"});
  if(normalized==="events") loadEvents?.();
  if(normalized==="dashboard") loadDashboardV57?.();
  if(normalized==="minijobCenter") loadMinijobCenter?.();
  if(normalized==="vacation") loadVacationPlanner?.();
}
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

function setPrintMode(mode){
  document.body.classList.remove("printService","printKitchen","printMonth","printAll");
  if(mode) document.body.classList.add(mode);
}
function clearPrintMode(){
  document.body.classList.remove("printService","printKitchen","printMonth","printAll");
}
function printOnly(mode, tabId, title, subtitle){
  setActiveTab(tabId);
  setPrintMode(mode);
  if($("printTitle")) $("printTitle").textContent = title || "";
  if($("printSubtitle")) $("printSubtitle").textContent = subtitle || "";
  setTimeout(()=>{
    window.print();
    setTimeout(clearPrintMode,500);
  },150);
}

function printServicePlan(){
  const week=$("weekStartService").value||mondayISO();
  const to=addDaysISO(week,6);
  const kw=getISOWeek(week);
  printOnly("printService","planService","Dienstplan Service",`Restaurant Landsknecht · KW ${kw} · ${fmtDate(week)} bis ${fmtDate(to)}`);
}
function printKitchenPlan(){
  const week=$("weekStartKitchen").value||mondayISO();
  const to=addDaysISO(week,6);
  const kw=getISOWeek(week);
  printOnly("printKitchen","planKitchen","Dienstplan Küche",`Restaurant Landsknecht · KW ${kw} · ${fmtDate(week)} bis ${fmtDate(to)}`);
}
function printMonthPlan(){
  const month=$("monthSelect").value||monthISO();
  printOnly("printMonth","month","Monatsübersicht",`Restaurant Landsknecht · ${month}`);
}
function printCurrent(){
  setPrintMode("printAll");
  setTimeout(()=>{
    window.print();
    setTimeout(clearPrintMode,500);
  },100);
}
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
  const email = session?.user?.email || "";

  let res = await sb.from("profiles").select("*").eq("id",session.user.id).maybeSingle();

  if(res.data){
    profile = res.data;
    return;
  }

  if(email){
    const byEmail = await sb.from("profiles")
      .select("*")
      .eq("email",email)
      .eq("active",true)
      .maybeSingle();

    if(byEmail.data){
      profile = byEmail.data;
      return;
    }
  }

  profile={
    id:session.user.id,
    email:email,
    first_name:"",
    last_name:"",
    phone:"",
    role:"employee",
    department:"Service",
    plannable:true,
    active:true
  };

  await sb.from("profiles").upsert(profile);
}


function setAuthBodyState(logged){
  document.body.classList.toggle("loggedIn", !!logged);
  document.body.classList.toggle("loggedOut", !logged);
  document.body.classList.toggle("employeeMode", !!logged && !isManagement());
}

function renderAuth(){
  const logged=!!session;
  setAuthBodyState(logged);

  if($("authView")) $("authView").classList.toggle("hidden", logged);
  if($("appView")) $("appView").classList.toggle("hidden", !logged);

  document.querySelectorAll(".managementOnly").forEach(el=>el.classList.toggle("hidden",!logged||!isManagement()));

  if(logged){
    $("weekStartService").value ||= mondayISO();
    $("weekStartKitchen").value ||= mondayISO();
    $("monthSelect").value ||= monthISO();
    $("infoDate").value ||= todayISO();
    $("vacMonthSelect").value ||= monthISO();
    $("timeDate").value ||= todayISO();
    $("vacFrom").value ||= todayISO();
    $("vacTo").value ||= todayISO();
    if($("eventDate")) $("eventDate").value ||= todayISO();
    if($("minijobMonth")) $("minijobMonth").value ||= monthISO();
    $("sumFrom").value ||= mondayISO();
    $("sumTo").value ||= addDaysISO(mondayISO(),6);
    setActiveTab("dashboard");
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

document.querySelectorAll(".sidebar button[data-tab], #mobileTouchNav button[data-tab]").forEach(btn=>btn.onclick=()=>setActiveTab(btn.dataset.tab));





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


function dashboardV57Card(title,value,sub,cls=""){
  return `<div class="dashStatV57 ${cls}"><span>${escapeHtml(title)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(sub||"")}</small></div>`;
}
function dashboardV57ShiftText(s){
  if(!s) return "—";
  if(s.status==="arbeit") return `${String(s.start_time||"").slice(0,5)}-${String(s.end_time||"").slice(0,5)}`;
  return s.status || "—";
}
async function dashboardSafe(q){
  try{
    const res = await q;
    if(res.error) return [];
    return res.data || [];
  }catch(e){
    return [];
  }
}

function selectedEventRooms(){
  return [...document.querySelectorAll(".eventRooms input[type='checkbox']:checked")].map(x=>x.value);
}
function setEventRooms(rooms){
  const list = Array.isArray(rooms) ? rooms : String(rooms||"").split(",").map(x=>x.trim()).filter(Boolean);
  document.querySelectorAll(".eventRooms input[type='checkbox']").forEach(cb=>{
    cb.checked = list.includes(cb.value);
  });
}
function clearEventForm(){
  if($("editingEventId")) $("editingEventId").value="";
  if($("eventDate")) $("eventDate").value=todayISO();
  if($("eventStart")) $("eventStart").value="";
  if($("eventEnd")) $("eventEnd").value="";
  if($("eventType")) $("eventType").value="Geburtstag";
  if($("eventTitle")) $("eventTitle").value="";
  if($("eventGuests")) $("eventGuests").value="";
  if($("eventNote")) $("eventNote").value="";
  if($("eventDashboard")) $("eventDashboard").checked=true;
  if($("eventPlan")) $("eventPlan").checked=true;
  if($("eventImportant")) $("eventImportant").checked=false;
  setEventRooms([]);
}
function eventTypeIcon(type){
  const t=String(type||"").toLowerCase();
  if(t.includes("hochzeit")) return "💍";
  if(t.includes("geburtstag")) return "🎂";
  if(t.includes("trauer")) return "🕊️";
  if(t.includes("firma")) return "🥂";
  if(t.includes("tagung")||t.includes("konferenz")) return "👥";
  if(t.includes("sport")) return "⚽";
  if(t.includes("musik")) return "🎵";
  if(t.includes("wein")) return "🍷";
  if(t.includes("feiertag")||t.includes("saison")) return "🎄";
  return "📌";
}
function eventPlanLabel(e){
  const icon = eventTypeIcon(e.event_type);
  const title = e.title || "Event";
  const time = e.start_time ? ` · ${String(e.start_time).slice(0,5)}` : "";
  const guests = e.guests ? ` · ${e.guests} Gäste` : "";
  const rooms = e.rooms ? ` · ${e.rooms}` : "";
  return `${icon} ${title}${time}${guests}${rooms}`;
}
function eventTitleLine(e){
  const time = e.start_time ? `${String(e.start_time).slice(0,5)}${e.end_time ? "-"+String(e.end_time).slice(0,5) : ""}` : "";
  const guests = e.guests ? ` · ${e.guests} Gäste` : "";
  const rooms = e.rooms ? ` · ${escapeHtml(e.rooms)}` : "";
  return `${eventTypeIcon(e.event_type)} ${escapeHtml(e.title||"Event")} ${time ? "· "+escapeHtml(time) : ""}${guests}${rooms}`;
}
async function saveEvent(){
  if(!isManagement()) return;
  const date=$("eventDate")?.value;
  const title=$("eventTitle")?.value?.trim();
  if(!date || !title) return alert("Bitte Datum und Titel ausfüllen.");

  const payload={
    event_date:date,
    title:title,
    event_type:$("eventType")?.value || "Sonstiges",
    start_time:$("eventStart")?.value || null,
    end_time:$("eventEnd")?.value || null,
    guests:$("eventGuests")?.value ? Number($("eventGuests").value) : null,
    rooms:selectedEventRooms().join(", "),
    note:$("eventNote")?.value || "",
    show_dashboard:!!$("eventDashboard")?.checked,
    show_plan:!!$("eventPlan")?.checked,
    important:!!$("eventImportant")?.checked,
    created_by:profile?.id || null
  };

  const id=$("editingEventId")?.value;
  const res=id ? await sb.from("events").update(payload).eq("id",id) : await sb.from("events").insert(payload);
  if(res.error){
    alert("Fehler beim Speichern: "+res.error.message);
    return;
  }
  clearEventForm();
  await loadEvents();
  await loadDashboardV57?.();
  await loadMonth();
  await loadPlanService();
  await loadPlanKitchen();
}
async function loadEvents(){
  if(!$("eventList") || !isManagement()) return;
  const today=todayISO();
  const {data,error}=await sb.from("events").select("*").gte("event_date",today).order("event_date",{ascending:true}).order("start_time",{ascending:true}).limit(80);
  if(error){
    $("eventList").innerHTML=`<div class="entry"><b>Fehler beim Laden:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }
  $("eventList").innerHTML=(data||[]).map(e=>`
    <div class="entry eventEntry ${e.important?"eventImportant":""}">
      <div class="eventEntryText">
        <b>${fmtDate(e.event_date)}</b><br>
        ${eventTitleLine(e)}<br>
        ${e.note ? `<span class="small">${escapeHtml(e.note)}</span>` : ""}
      </div>
      <div class="eventEntryActions">
        <button class="secondary" onclick="editEvent('${e.id}')">Bearbeiten</button>
        <button class="danger" onclick="deleteEvent('${e.id}')">Löschen</button>
      </div>
    </div>
  `).join("") || "<p>Keine kommenden Events.</p>";
}
async function editEvent(id){
  const {data,error}=await sb.from("events").select("*").eq("id",id).single();
  if(error || !data) return alert("Event nicht gefunden.");
  $("editingEventId").value=data.id;
  $("eventDate").value=data.event_date || todayISO();
  $("eventStart").value=data.start_time ? String(data.start_time).slice(0,5) : "";
  $("eventEnd").value=data.end_time ? String(data.end_time).slice(0,5) : "";
  $("eventType").value=data.event_type || "Sonstiges";
  $("eventTitle").value=data.title || "";
  $("eventGuests").value=data.guests || "";
  $("eventNote").value=data.note || "";
  $("eventDashboard").checked=data.show_dashboard!==false;
  $("eventPlan").checked=data.show_plan!==false;
  $("eventImportant").checked=!!data.important;
  setEventRooms(data.rooms);
  setActiveTab("events");
  setTimeout(()=>$("eventTitle")?.focus(),100);
}
async function deleteEvent(id){
  if(!confirm("Dieses Event wirklich löschen?")) return;
  const {error}=await sb.from("events").delete().eq("id",id);
  if(error) return alert("Fehler beim Löschen: "+error.message);
  await loadEvents();
  await loadDashboardV57?.();
  await loadMonth();
  await loadPlanService();
  await loadPlanKitchen();
}
function setupEvents(){
  if($("eventDate")) $("eventDate").value ||= todayISO();
  if($("saveEvent")) $("saveEvent").onclick=saveEvent;
  if($("clearEvent")) $("clearEvent").onclick=clearEventForm;
}
window.editEvent=editEvent;
window.deleteEvent=deleteEvent;

async function loadDashboardV57(){
  if(!$("dashboardV57") || !session) return;
  if(!profiles.length) await loadProfiles();

  const today = todayISO();
  const month = monthISO();
  const fromMonth = firstOfMonthISO(month);
  const toMonth = month+"-"+pad2(lastDayOfMonth(month));

  if($("dashboardGreeting")){
    const h = new Date().getHours();
    const g = h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
    $("dashboardGreeting").textContent = `${g}${profile?.first_name ? " " + profile.first_name : ""} · ${fmtDate(today)}`;
  }

  const todaySchedules = await dashboardSafe(sb.from("schedules").select("*").eq("work_date",today));
  const infos = await dashboardSafe(sb.from("daily_infos").select("*").eq("info_date",today));
  const openVacations = await dashboardSafe(sb.from("vacation_requests").select("*").eq("status","beantragt").order("date_from",{ascending:true}).limit(8));
  const todayVacations = await dashboardSafe(sb.from("vacation_requests").select("*").lte("date_from",today).gte("date_to",today).eq("status","genehmigt"));
  const monthSchedules = await dashboardSafe(sb.from("schedules").select("*").gte("work_date",fromMonth).lte("work_date",toMonth));
  const events = await dashboardSafe(sb.from("events").select("*").gte("event_date",today).order("event_date",{ascending:true}).limit(6));

  const workToday = todaySchedules.filter(s=>s.status==="arbeit");
  const sickToday = todaySchedules.filter(s=>s.status==="krank");

  const minijobTotals = {};
  monthSchedules.forEach(s=>{
    const p = profileById(s.profile_id);
    if(!p || !isMinijobProfile(p) || s.status !== "arbeit") return;
    minijobTotals[s.profile_id] ||= {hours:0,earned:0,count:0};
    const h = scheduleHoursForMinijobEntry(s);
    const rate = Number(p.hourly_rate || 0);
    minijobTotals[s.profile_id].hours += h;
    minijobTotals[s.profile_id].earned += h * rate;
    if(h>0) minijobTotals[s.profile_id].count += 1;
  });

  const minijobLimit = Number($("minijobLimit")?.value || 603);
  const minijobWarnCount = Object.values(minijobTotals).filter(t=>minijobLimit && t.earned >= minijobLimit*0.8).length;

  if($("dashboardStatsV57")){
    $("dashboardStatsV57").innerHTML = isManagement() ? [
      dashboardV57Card("Heute im Dienst", String(workToday.length), "geplante Schichten"),
      dashboardV57Card("Krank", String(sickToday.length), "heute", sickToday.length ? "warn" : ""),
      dashboardV57Card("Urlaub", String(todayVacations.length), "heute"),
      dashboardV57Card("Offene Anträge", String(openVacations.length), "Urlaub"),
      dashboardV57Card("Events", String(events.length), "kommend")
    ].join("") : [
      dashboardV57Card("Heute im Dienst", String(workToday.length), "geplante Schichten"),
      dashboardV57Card("Events", String(events.length), "kommend")
    ].join("");
  }

  const sortedToday = sortOwnShiftFirst(workToday
    .map(s=>({s,p:profileById(s.profile_id)}))
    .sort((a,b)=>String(a.s.start_time||"").localeCompare(String(b.s.start_time||"")) || String(a.p.last_name||"").localeCompare(String(b.p.last_name||""))));

  if($("dashboardTodayWorkersV57")){
    $("dashboardTodayWorkersV57").innerHTML = sortedToday.length ? sortedToday.map(({s,p})=>`
      <div class="dashItemV57${ownShiftClass(p)}">
        <div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} ${ownShiftBadge(p)}</b><br><small>${deptBadge(p.department)}</small></div>
        <strong>${escapeHtml(dashboardV57ShiftText(s))}</strong>
      </div>
    `).join("") : `<div class="dashEmptyV57">Heute sind keine Schichten eingetragen.</div>`;
  }

  if($("dashboardInfosV57")){
    $("dashboardInfosV57").innerHTML = infos.length ? infos.map(i=>`
      <div class="dashItemV57"><div><b>${fmtDate(i.info_date)}</b><br>${escapeHtml(i.info_text)}</div></div>
    `).join("") : `<div class="dashEmptyV57">Keine Tagesinfo für heute.</div>`;
  }

  const minijobRows = profiles.filter(isMinijobProfile).map(p=>{
    const t = minijobTotals[p.id] || {hours:0,earned:0,count:0};
    const pct = minijobLimit ? Math.round((t.earned/minijobLimit)*100) : 0;
    const cls = pct >= 100 ? "stop" : pct >= 80 ? "warn" : "ok";
    return {p,t,pct,cls};
  }).sort((a,b)=>b.pct-a.pct);

  if($("dashboardMinijobV57")){
    $("dashboardMinijobV57").innerHTML = minijobRows.length ? minijobRows.slice(0,8).map(r=>`
      <div class="dashItemV57 ${r.cls}">
        <div><b>${escapeHtml(r.p.first_name||"")} ${escapeHtml(r.p.last_name||"")}</b><br><small>${euroHours(r.t.hours)} Std. · ${r.t.earned.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</small></div>
        <strong>${r.pct}%</strong>
      </div>
    `).join("") : `<div class="dashEmptyV57">Keine Minijobber gefunden.</div>`;
  }

  if($("dashboardVacationsV57")){
    $("dashboardVacationsV57").innerHTML = openVacations.length ? openVacations.map(v=>{
      const p=profileById(v.profile_id);
      return `<div class="dashItemV57"><div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)}</small></div><strong>Offen</strong></div>`;
    }).join("") : `<div class="dashEmptyV57">Keine offenen Urlaubsanträge.</div>`;
  }

  const upcomingBirthdays = profiles.filter(p=>p.birthday).map(p=>{
    const parts=String(p.birthday).split("-");
    if(parts.length<3) return null;
    const m=parts[1], d=parts[2], y=new Date().getFullYear();
    let next = `${y}-${m}-${d}`;
    if(next < today) next = `${y+1}-${m}-${d}`;
    const diff = Math.round((parseISODateLocal(next)-parseISODateLocal(today))/86400000);
    return {p,next,diff};
  }).filter(Boolean).filter(x=>x.diff>=0 && x.diff<=30).sort((a,b)=>a.diff-b.diff).slice(0,6);

  if($("dashboardBirthdaysV57")){
    $("dashboardBirthdaysV57").innerHTML = upcomingBirthdays.length ? upcomingBirthdays.map(x=>`
      <div class="dashItemV57"><div><b>${escapeHtml(x.p.first_name||"")} ${escapeHtml(x.p.last_name||"")}</b><br><small>${fmtDate(x.next)}</small></div><strong>${x.diff===0?"Heute":x.diff+" Tage"}</strong></div>
    `).join("") : `<div class="dashEmptyV57">Keine Geburtstage in den nächsten 30 Tagen.</div>`;
  }

  if($("dashboardEventsV57")){
    $("dashboardEventsV57").innerHTML = events.length ? events.map(e=>`
      <div class="dashItemV57"><div><b>${escapeHtml(eventPlanLabel(e))}</b><br><small>${fmtDate(e.event_date)}${e.note ? " · " + escapeHtml(e.note) : ""}</small></div></div>
    `).join("") : `<div class="dashEmptyV57">Keine kommenden Events eingetragen.</div>`;
  }
}
function setupDashboardV57(){
  if($("refreshDashboardV57")) $("refreshDashboardV57").onclick = loadDashboardV57;

  document.querySelectorAll(".sidebar button[data-tab], nav button[data-tab]").forEach(btn=>{
    if(btn.dataset.tab==="today" || btn.dataset.tab==="dashboard" || btn.dataset.tab==="home"){
      btn.addEventListener("click",()=>setTimeout(loadDashboardV57,100));
    }
  });
}


function employeeCanSeeOwnFinance(){
  return !!profile && isMinijobProfile(profile);
}

function currentMonthRangeFromInput(inputId){
  const month = $(inputId)?.value || monthISO();
  return {
    month,
    from:firstOfMonthISO(month),
    to:month+"-"+pad2(lastDayOfMonth(month))
  };
}


function myHoursDefaultRange(){
  const month = monthISO();
  return {
    from:firstOfMonthISO(month),
    to:month+"-"+pad2(lastDayOfMonth(month))
  };
}
function getMyHoursRange(){
  const def = myHoursDefaultRange();
  const fromEl = $("myHoursFrom");
  const toEl = $("myHoursTo");

  if(fromEl && !fromEl.value) fromEl.value = def.from;
  if(toEl && !toEl.value) toEl.value = def.to;

  const from = fromEl?.value || def.from;
  const to = toEl?.value || def.to;

  return from <= to ? {from,to} : {from:to,to:from};
}
function setupMyHoursRangeControls(){
  const fromEl = $("myHoursFrom");
  const toEl = $("myHoursTo");
  if(fromEl && toEl){
    const def = myHoursDefaultRange();
    fromEl.value ||= def.from;
    toEl.value ||= def.to;
  }
  if($("myHoursCalc")) $("myHoursCalc").onclick = loadEmployeeOwnOverview;
  if($("myHoursThisMonth")) $("myHoursThisMonth").onclick = ()=>{
    const def = myHoursDefaultRange();
    if($("myHoursFrom")) $("myHoursFrom").value = def.from;
    if($("myHoursTo")) $("myHoursTo").value = def.to;
    loadEmployeeOwnOverview();
  };
  if($("myHoursThisWeek")) $("myHoursThisWeek").onclick = ()=>{
    const from = mondayISO();
    const to = addDaysISO(from,6);
    if($("myHoursFrom")) $("myHoursFrom").value = from;
    if($("myHoursTo")) $("myHoursTo").value = to;
    loadEmployeeOwnOverview();
  };
}

async function loadEmployeeOwnOverview(){
  const targets = ["employeeOwnOverview","myHoursOverview"].map(id=>$(id)).filter(Boolean);
  if(!targets.length || !session || !profile || isManagement()) {
    targets.forEach(el=>el.innerHTML="");
    return;
  }

  setupMyHoursRangeControls();

  const {from,to} = getMyHoursRange();
  const rangeLabel = `${fmtDate(from)} bis ${fmtDate(to)}`;

  const [scheduleRes,timeRes] = await Promise.all([
    sb.from("schedules").select("*").eq("profile_id",profile.id).gte("work_date",from).lte("work_date",to).order("work_date",{ascending:true}),
    sb.from("time_entries").select("*").eq("profile_id",profile.id).gte("work_date",from).lte("work_date",to).order("work_date",{ascending:true})
  ]);

  if(scheduleRes.error || timeRes.error){
    const err = scheduleRes.error || timeRes.error;
    targets.forEach(el=>el.innerHTML = `<div class="entry"><b>Fehler beim Laden deiner Stunden:</b><br>${escapeHtml(err.message)}</div>`);
    return;
  }

  const schedules = scheduleRes.data || [];
  const times = timeRes.data || [];

  const plannedWork = schedules.filter(s=>s.status==="arbeit");
  const plannedHours = plannedWork.reduce((sum,s)=>sum+scheduleHoursForMinijobEntry(s),0);
  const realHours = times.reduce((sum,t)=>sum+Number(t.hours||0),0);

  const rate = Number(profile.hourly_rate || 0);
  const isMini = employeeCanSeeOwnFinance();
  const limit = 603;
  const earned = isMini ? plannedHours * rate : 0;
  const rest = isMini ? Math.max(0,limit-earned) : 0;
  const pct = isMini && limit ? Math.round((earned/limit)*100) : 0;

  let status = "OK";
  let cls = "ownOk";
  if(isMini && earned >= limit){ status="Grenze erreicht"; cls="ownStop"; }
  else if(isMini && earned >= limit*0.8){ status="Achtung"; cls="ownWarn"; }

  const plannedList = plannedWork.length ? plannedWork.map(s=>`
    <div class="ownRow">
      <span>${fmtDate(s.work_date)}</span>
      <b>${String(s.start_time||"").slice(0,5)}-${String(s.end_time||"").slice(0,5)}</b>
    </div>`).join("") : `<p class="small">Keine geplanten Arbeitsschichten in diesem Zeitraum.</p>`;

  const timeList = times.length ? times.map(t=>`
    <div class="ownRow">
      <span>${fmtDate(t.work_date)}</span>
      <b>${String(t.start_time||"").slice(0,5)}-${String(t.end_time||"").slice(0,5)} · ${euroHours(t.hours)} Std.</b>
    </div>`).join("") : `<p class="small">Keine Zeiteinträge in diesem Zeitraum.</p>`;

  const ownHtml = `
    <div class="ownHoursCard ${cls}">
      <div class="ownHoursHead">
        <div>
          <h3>Meine Stunden</h3>
          <p>${escapeHtml(rangeLabel)} · nur deine eigenen Daten</p>
        </div>
        ${isMini ? `<strong>${status}</strong>` : ""}
      </div>

      <div class="ownStats">
        <span><small>Geplant</small><b>${euroHours(plannedHours)}</b></span>
        <span><small>Erfasst</small><b>${euroHours(realHours)}</b></span>
        ${isMini ? `<span><small>Verdienst</small><b>${earned.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</b></span>` : ""}
        ${isMini ? `<span><small>Rest 603 €</small><b>${rest.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €</b></span>` : ""}
      </div>

      ${isMini ? `<div class="ownProgress"><span style="width:${Math.min(100,pct)}%"></span></div><p class="small">Stundenlohn: ${rate.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} € · Grenze: 603,00 €</p>` : ""}

      <h4>Meine geplanten Dienste</h4>
      ${plannedList}

      <h4>Meine erfassten Zeiten</h4>
      ${timeList}
    </div>
  `;
  targets.forEach(el=>el.innerHTML = ownHtml);
}

async function loadAll(){
  await loadProfiles();
  await loadDashboardV57();
  await Promise.all([loadDashboardLight(),loadPlanService(),loadPlanKitchen(),loadMonth(),loadInfos(),loadTimes(),loadVacations(),loadVacationCalendar(),loadVacationPlanner(),loadVacationYearOverview(),loadSummary(),loadMinijobCenter(),loadEmployeeOwnOverview()]);
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



function employeeVisibleScheduleItem(item){
  if(isManagement()) return true;
  return !!item && item.status === "arbeit";
}
function scheduleCellValueForVisibility(item){
  if(!item) return "";
  if(!isManagement() && item.status !== "arbeit") return "";
  if(item.status === "arbeit") return `${String(item.start_time||"").slice(0,5)}-${String(item.end_time||"").slice(0,5)}`;
  return item.status || "";
}

async function loadPlanFiltered(title,week,departments,targetId){
  const from=week,to=addDaysISO(week,6);
  const[{data:schedules},{data:infos},{data:events}]=await Promise.all([
    sb.from("schedules").select("*").gte("work_date",from).lte("work_date",to),
    sb.from("daily_infos").select("*").gte("info_date",from).lte("info_date",to),
    sb.from("events").select("*").gte("event_date",from).lte("event_date",to)
  ]);

  const byKey={};
  (schedules||[]).forEach(s=>byKey[`${s.profile_id}_${s.work_date}`]=s);

  const infoByDate={};
  (infos||[]).forEach(i=>infoByDate[i.info_date]=i.info_text);

  const eventsByDate={};
  (events||[]).filter(e=>e.show_plan!==false).forEach(e=>{
    eventsByDate[e.event_date] ||= [];
    eventsByDate[e.event_date].push(e);
  });

  let people=plannable()
    .filter(p=>departments.includes(p.department))
    .sort((a,b)=>
      (Number(a.sort_order??9999)-Number(b.sort_order??9999)) ||
      String(a.last_name||"").localeCompare(String(b.last_name||""))
    );

  if(!isManagement()){
    people = people.filter(p => days.some((_,i)=>{
      const iso=addDaysISO(week,i);
      const item=byKey[`${p.id}_${iso}`];
      return item && item.status === "arbeit";
    }));
  }

  function cellValue(item){
    return scheduleCellValueForVisibility(item);
  }

  let mobile = `<div class="mobilePlanCards"><h3>Mobile Übersicht ${escapeHtml(title)}</h3>`;
  days.forEach((d,i)=>{
    const iso=addDaysISO(week,i);
    const dayRows=sortOwnShiftFirst(people
      .map(p=>({p,item:byKey[`${p.id}_${iso}`]}))
      .filter(x=>isManagement() ? x.item : (x.item && x.item.status==="arbeit")));

    mobile += `<div class="mobileDayCard"><div class="mobileDayHead"><b>${d}, ${fmtDate(iso)}</b></div>`;
    if(infoByDate[iso]) mobile += `<div class="mobileDayInfo">📢 ${escapeHtml(infoByDate[iso])}</div>`;
    (eventsByDate[iso]||[]).forEach(e=>mobile += `<div class="mobileDayEvent">${escapeHtml(eventPlanLabel(e))}</div>`);

    if(dayRows.length){
      mobile += dayRows.map(({p,item})=>`
        <div class="mobileShiftRow ${shiftClass(cellValue(item))}${ownShiftClass(p)}">
          <div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} ${ownShiftBadge(p)}</b><br><small>${escapeHtml(p.department||"")}</small></div>
          <strong>${escapeHtml(cellValue(item))}</strong>
        </div>
      `).join("");
    }else{
      mobile += `<div class="mobileEmpty">${isManagement() ? "Keine Einträge." : "Keine Arbeitsschichten."}</div>`;
    }
    mobile += `</div>`;
  });
  mobile += `</div>`;

  let html=mobile;
  html += '<div class="planLegend"><span class="legendMorning">Früh/Arbeit</span><span class="legendEvening">Spät</span><span class="legendVacation">Urlaub</span><span class="legendSick">Krank</span><span class="legendFree">Frei</span></div>';
  html += '<div class="desktopPlanGrid grid"><table><thead><tr><th>Mitarbeiter / Bereich</th>';

  days.forEach((d,i)=>{
    const iso=addDaysISO(week,i);
    html+=`<th>${d}<br><span class="small">${fmtDate(iso)}</span>${infoByDate[iso]?`<div class="dayInfo">📢 ${escapeHtml(infoByDate[iso])}</div>`:""}${(eventsByDate[iso]||[]).map(e=>`<div class="dayInfo eventDayInfo">${escapeHtml(eventPlanLabel(e))}</div>`).join("")}</th>`;
  });

  html+='</tr></thead><tbody>';

  people.forEach(p=>{
    html+=`<tr class="${ownShiftClass(p)}" ${isManagement()?`draggable="true" data-profile-id="${p.id}"`:""}><td>${renderPersonCell(p, people)} ${ownShiftBadge(p)}</td>`;
    days.forEach((_,i)=>{
      const iso=addDaysISO(week,i),item=byKey[`${p.id}_${iso}`];
      const val=cellValue(item);
      html+=isManagement()
        ? `<td class="${shiftClass(val)}"><input class="${shiftDisplayClass(val)}" data-profile="${p.id}" data-date="${iso}" data-id="${item?.id||""}" value="${escapeHtml(val)}" placeholder="08:00-16:00 / frei / urlaub / krank"></td>`
        : `<td>${val ? shiftPill(val) : "<span class='small'>—</span>"}</td>`;
    });
    html+="</tr>";
  });

  if(!people.length){
    html+=`<tr><td colspan="8"><span class="small">${isManagement()?`Keine einplanbaren Mitarbeiter für ${escapeHtml(title)}.`:`Keine Arbeitsschichten in dieser Woche.`}</span></td></tr>`;
  }

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
  await loadEmployeeOwnOverview();
}

$("prevMonth").onclick=()=>{const[y,m]=($("monthSelect").value||monthISO()).split("-").map(Number);$("monthSelect").value=monthISO(new Date(y,m-2,1));loadMonth()};
$("nextMonth").onclick=()=>{const[y,m]=($("monthSelect").value||monthISO()).split("-").map(Number);$("monthSelect").value=monthISO(new Date(y,m,1));loadMonth()};
$("monthSelect").onchange=loadMonth;

async function loadMonth(){
  if(!session||!profiles.length)return;
  const month=$("monthSelect").value||monthISO(),from=firstOfMonthISO(month),to=month+"-"+pad2(lastDayOfMonth(month));

  const[{data:infos,error:infoError},{data:events,error:eventError}]=await Promise.all([
    sb.from("daily_infos").select("*").gte("info_date",from).lte("info_date",to),
    sb.from("events").select("*").gte("event_date",from).lte("event_date",to)
  ]);

  if(infoError){
    $("monthGrid").innerHTML=`<div class="entry"><b>Fehler beim Laden der Monatsübersicht:</b><br>${escapeHtml(infoError.message)}</div>`;
    return;
  }

  const infoByDate={};
  (infos||[]).forEach(i=>infoByDate[i.info_date]=i.info_text);

  const eventsByDate={};
  if(!eventError){
    (events||[]).filter(e=>e.show_plan!==false).forEach(e=>{
      eventsByDate[e.event_date] ||= [];
      eventsByDate[e.event_date].push(e);
    });
  }

  let html='<div class="grid"><table class="monthTable"><thead><tr>'+days.map(d=>`<th>${d}</th>`).join("")+'</tr></thead><tbody><tr>';
  const total=lastDayOfMonth(month),first=weekdayMondayFirst(from);

  for(let i=0;i<first;i++)html+='<td class="monthCell"></td>';

  for(let day=1;day<=total;day++){
    const iso=month+"-"+pad2(day);
    if(day>1&&weekdayMondayFirst(iso)===0)html+="</tr><tr>";

    let c=`<div class="monthDate">${fmtDate(iso)}</div>`;
    if(infoByDate[iso]){
      c+=`<div class="monthInfo">📢 ${escapeHtml(infoByDate[iso])}</div>`;
    }
    (eventsByDate[iso]||[]).forEach(e=>{
      c+=`<div class="monthInfo eventMonthInfo">${escapeHtml(eventPlanLabel(e))}</div>`;
    });

    html+=`<td class="monthCell">${c}</td>`;
  }

  for(let i=weekdayMondayFirst(to)+1;i<7;i++)html+='<td class="monthCell"></td>';
  html+="</tr></tbody></table></div>";
  $("monthGrid").innerHTML=html;
}

$("saveInfo").onclick=async()=>{
  if(!isManagement()) return alert("Tagesinfos dürfen nur von der Geschäftsführung bearbeitet werden.");
  const d=$("infoDate").value,t=$("infoText").value.trim();
  if(!d||!t)return alert("Datum und Info ausfüllen.");
  const{error}=await sb.from("daily_infos").upsert({info_date:d,info_text:t,created_by:profile.id},{onConflict:"info_date"});
  if(error)alert(error.message);else{$("infoText").value="";await createNotification("Neue Tagesinfo",t);await loadInfos();await loadPlanService();await loadPlanKitchen();await loadMonth()}
};
$("deleteInfo").onclick=async()=>{
  if(!isManagement()) return alert("Tagesinfos dürfen nur von der Geschäftsführung gelöscht werden.");
  const d=$("infoDate").value;
  if(!d)return alert("Bitte Datum auswählen.");
  if(!confirm("Tagesinfo für dieses Datum wirklich löschen?")) return;
  const{error}=await sb.from("daily_infos").delete().eq("info_date",d);
  if(error) alert(error.message);
  else{
    $("infoText").value="";
    await loadInfos();
    await loadPlanService();
    await loadPlanKitchen();
    await loadMonth();
    await loadDashboardV57?.();
  }
};

function editDailyInfo(date){
  if(!isManagement()) return alert("Tagesinfos dürfen nur von der Geschäftsführung bearbeitet werden.");
  const item = (dailyInfoCache||[]).find(x=>x.info_date===date);
  if(!item) return alert("Tagesinfo nicht gefunden.");

  if($("infoDate")) $("infoDate").value = item.info_date;
  if($("infoText")) $("infoText").value = item.info_text || "";

  setActiveTab("infos");
  setTimeout(()=>$("infoText")?.focus(),100);
}
window.editDailyInfo = editDailyInfo;

async function deleteDailyInfo(date){
  if(!isManagement()) return alert("Tagesinfos dürfen nur von der Geschäftsführung gelöscht werden.");
  if(!date) return;
  if(!confirm("Diese Tagesinfo wirklich löschen?")) return;

  const { error } = await sb.from("daily_infos").delete().eq("info_date",date);
  if(error){
    alert("Fehler beim Löschen: " + error.message);
    return;
  }

  if($("infoDate")?.value === date && $("infoText")) $("infoText").value = "";
  await loadInfos();
  await loadPlanService();
  await loadPlanKitchen();
  await loadMonth();
  await loadDashboardV57?.();
}
window.deleteDailyInfo = deleteDailyInfo;

async function loadInfos(){
  const{data,error}=await sb.from("daily_infos").select("*").order("info_date",{ascending:false}).limit(80);
  if(error){
    $("infoList").innerHTML=`<div class="entry"><b>Fehler beim Laden:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }

  dailyInfoCache = data || [];

  $("infoList").innerHTML=dailyInfoCache.map(i=>`
    <div class="entry infoEntry">
      <div class="infoEntryText">
        <b>${fmtDate(i.info_date)}</b><br>${escapeHtml(i.info_text)}
      </div>
      ${isManagement()?`<div class="infoEntryActions">
        <button type="button" class="secondary" onclick="editDailyInfo('${i.info_date}')">Bearbeiten</button>
        <button type="button" class="danger" onclick="deleteDailyInfo('${i.info_date}')">Löschen</button>
      </div>`:""}
    </div>
  `).join("")||"<p>Keine Tagesinfos.</p>";
}

$("saveTime").onclick=async()=>{
  const profileId=$("timeProfile").value,date=$("timeDate").value,start=$("timeStart").value,end=$("timeEnd").value;
  let br=Number($("timeBreak").value)||0;
  if(!date||!start||!end)return alert("Datum, Beginn und Ende ausfüllen.");
  let[sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);
  let a=sh*60+sm,b=eh*60+em;if(b<a)b+=1440;
  br=effectiveBreakMinutes(b-a,br);
  const{error}=await sb.from("time_entries").insert({profile_id:profileId,work_date:date,start_time:start,end_time:end,break_minutes:br,hours:hoursBetween(start,end,br),created_by:profile.id});
  if(error)alert(error.message);else{await loadTimes();await loadSummary();await loadEmployeeOwnOverview()}
};
async function loadTimes(){
  let q=sb.from("time_entries").select("*, profiles(first_name,last_name)").order("work_date",{ascending:false}).limit(50);
  if(!isManagement()) q = q.eq("profile_id",profile.id);
  const{data}=await q;
  $("timeList").innerHTML=(data||[]).map(e=>`<div class="entry"><b>${escapeHtml(e.profiles?.first_name||"")} ${escapeHtml(e.profiles?.last_name||"")}</b><br>${fmtDate(e.work_date)}: ${String(e.start_time||"").slice(0,5)}-${String(e.end_time||"").slice(0,5)}, Pause ${e.break_minutes} Min.<br><b>${euroHours(e.hours)} Std.</b></div>`).join("")||"<p>Keine Zeiteinträge.</p>";
  await loadEmployeeOwnOverview();
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
  if(error)alert(error.message);else{await createNotification("Urlaub beantragt",`${profile.first_name} ${profile.last_name} hat Urlaub beantragt.`);await loadVacations();await loadVacationCalendar();await loadVacationPlanner()}
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
  if(error)alert(error.message);else{await syncVacationToSchedule(profileId,from,to);$("vacAdminNote").value="";await createNotification("Urlaub eingetragen","Ein Urlaub wurde eingetragen.");await loadVacations();await loadVacationCalendar();await loadVacationPlanner();await loadVacationOverlap();await loadPlanService();await loadPlanKitchen();await loadMonth()}
};

async function setVacationStatus(id,status){
  const before = await sb.from("vacation_requests").select("*").eq("id",id).single();
  await sb.from("vacation_requests").update({status,decided_by:profile.id,decided_at:new Date().toISOString()}).eq("id",id);
  if(before.data){
    if(status==="genehmigt") await syncVacationToSchedule(before.data.profile_id,before.data.date_from,before.data.date_to);
    if(status==="abgelehnt") await removeVacationFromSchedule(before.data.profile_id,before.data.date_from,before.data.date_to);
  }
  await loadVacations();await loadVacationCalendar();await loadVacationPlanner();await loadPlanService();await loadPlanKitchen();await loadMonth();
}
window.setVacationStatus=setVacationStatus;


function profileById(id){return profiles.find(p=>p.id===id)||{}}


function vacationDayValue(v, iso){
  const note = String(v.note||"").toLowerCase();
  if(note.includes("halb") || note.includes("0,5") || note.includes("0.5")) return 0.5;
  return 1;
}
function vacationDaysInRange(v, monthFrom, monthTo){
  const out = {};
  let d = v.date_from < monthFrom ? monthFrom : v.date_from;
  const end = v.date_to > monthTo ? monthTo : v.date_to;
  while(d <= end){
    out[d] = vacationDayValue(v,d);
    d = addDaysISO(d,1);
  }
  return out;
}
function vacationEntitlement(p){
  const raw = p.vacation_days ?? p.urlaubstage ?? p.annual_vacation_days ?? p.vacation_entitlement;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}


function vacationRangeSummaries(dayMap){
  const entries = Object.entries(dayMap || {})
    .filter(([,x]) => x && (x.status === "genehmigt" || x.status === "dienstplan"))
    .sort((a,b)=>a[0].localeCompare(b[0]));
  if(!entries.length) return [];
  const groups = [];
  let current = null;
  entries.forEach(([iso,x])=>{
    const value = Number(x.value || 1);
    const status = x.status === "dienstplan" ? "Dienstplan" : "genehmigt";
    const key = `${status}|${value}`;
    if(!current){
      current = {from:iso,to:iso,value,status,total:value,key};
      return;
    }
    const expectedNext = addDaysISO(current.to,1);
    if(iso === expectedNext && current.key === key){
      current.to = iso;
      current.total += value;
    }else{
      groups.push(current);
      current = {from:iso,to:iso,value,status,total:value,key};
    }
  });
  if(current) groups.push(current);
  return groups.map(g=>{
    const daysText = euroHours(g.total).replace(",00","");
    const range = g.from === g.to ? fmtDate(g.from) : `${fmtDate(g.from)} bis ${fmtDate(g.to)}`;
    return `${range} · ${daysText} ${Number(g.total)===1 ? "Tag" : "Tage"} · ${g.status}`;
  });
}

async function loadVacationPlanner(){
  if(!$("vacPlannerGrid") || !isManagement() || !profiles.length) return;

  const month = $("vacPlannerMonth")?.value || monthISO();
  if($("vacPlannerMonth")) $("vacPlannerMonth").value = month;

  const from = firstOfMonthISO(month);
  const to = month + "-" + pad2(lastDayOfMonth(month));
  const today = todayISO();

  $("vacPlannerGrid").innerHTML = `<div class="entry">Urlaub wird berechnet...</div>`;

  const [vacRes, scheduleRes] = await Promise.all([
    sb.from("vacation_requests")
      .select("*")
      .lte("date_from",to)
      .gte("date_to",from)
      .in("status",["beantragt","genehmigt"]),
    sb.from("schedules")
      .select("*")
      .gte("work_date",from)
      .lte("work_date",to)
  ]);

  if(vacRes.error || scheduleRes.error){
    const err = vacRes.error || scheduleRes.error;
    $("vacPlannerGrid").innerHTML = `<div class="entry"><b>Fehler beim Berechnen:</b><br>${escapeHtml(err.message)}</div>`;
    return;
  }

  const vacationRequests = vacRes.data || [];
  const scheduleVacations = (scheduleRes.data || []).filter(s =>
    String(s.status || "").toLowerCase().includes("urlaub")
  );

  const rows = plannable()
    .slice()
    .sort((a,b)=>
      (Number(a.sort_order??9999)-Number(b.sort_order??9999)) ||
      String(a.department||"").localeCompare(String(b.department||"")) ||
      String(a.last_name||"").localeCompare(String(b.last_name||""))
    );

  const requestsByProfile = {};
  vacationRequests.forEach(v=>{
    requestsByProfile[v.profile_id] ||= [];
    requestsByProfile[v.profile_id].push(v);
  });

  const dayCount = lastDayOfMonth(month);
  let mobileHtml = `<div class="vacMobileCards">`;
  let html = `<div class="vacPlannerScroll"><table class="vacPlannerTable"><thead>`;
  html += `<tr><th class="vacNameHead">Mitarbeiter</th>`;

  for(let day=1; day<=dayCount; day++){
    const iso = month + "-" + pad2(day);
    const wd = days[weekdayMondayFirst(iso)];
    const cls = (weekdayMondayFirst(iso) >= 5 ? "weekend" : "") + (iso===today ? " today" : "");
    html += `<th class="vacDayHead ${cls}"><span>${wd}</span><b>${day}</b></th>`;
  }

  html += `<th class="vacSumHead">Anspruch</th><th class="vacTakenHead">Genommen</th><th class="vacRestHead">Rest</th></tr></thead><tbody>`;

  rows.forEach(p=>{
    const dayMap = {};

    (requestsByProfile[p.id] || []).forEach(v=>{
      const range = vacationDaysInRange(v,from,to);
      Object.entries(range).forEach(([iso,val])=>{
        dayMap[iso] = {value:val,status:v.status,source:"urlaubsliste",note:v.note||"",id:v.id};
      });
    });

    scheduleVacations.filter(s=>s.profile_id===p.id).forEach(s=>{
      const iso = s.work_date;
      if(!iso || iso < from || iso > to) return;
      if(!dayMap[iso] || dayMap[iso].status==="beantragt"){
        dayMap[iso] = {value:1,status:"dienstplan",source:"dienstplan",note:"Direkt im Dienstplan als Urlaub eingetragen",id:s.id};
      }
    });

    const entitlement = vacationEntitlement(p);
    const takenMonth = Object.values(dayMap)
      .filter(x => x.status === "genehmigt" || x.status === "dienstplan")
      .reduce((sum,x) => sum + Number(x.value || 0), 0);
    const rest = Math.max(0, entitlement - takenMonth);

    const vacDays = vacationRangeSummaries(dayMap);

    mobileHtml += `
      <div class="vacMobileCard ${takenMonth>0 ? "hasVacation" : ""}">
        <div class="vacMobileHead">
          <div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${escapeHtml(p.department||"")}</small></div>
          <strong>${takenMonth > 0 ? euroHours(takenMonth).replace(",00","") + " genommen" : "Kein Urlaub"}</strong>
        </div>
        <div class="vacMobileStats">
          <span><small>Anspruch</small><b>${euroHours(entitlement).replace(",00","")}</b></span>
          <span><small>Genommen</small><b>${euroHours(takenMonth).replace(",00","")}</b></span>
          <span><small>Rest</small><b>${euroHours(rest).replace(",00","")}</b></span>
        </div>
        <div class="vacMobileDays">${vacDays.length ? vacDays.map(x=>`<em>${escapeHtml(x)}</em>`).join("") : "<em>Kein Urlaub im Monat</em>"}</div>
      </div>`;

    html += `<tr><td class="vacNameCell"><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${escapeHtml(p.department||"")}</small></td>`;

    for(let day=1; day<=dayCount; day++){
      const iso = month + "-" + pad2(day);
      const wd = weekdayMondayFirst(iso);
      const item = dayMap[iso];

      let cls = wd>=5 ? "weekend" : "";
      if(iso===today) cls += " today";
      if(item) cls += (item.status==="genehmigt" || item.status==="dienstplan") ? " vacApproved" : " vacRequested";

      const label = item ? (Number(item.value)===0.5 ? "½" : "U") : "";
      const title = item ? `${item.status} ${item.note||""}` : "";
      html += `<td class="vacDayCell ${cls}" title="${escapeHtml(title)}">${label}</td>`;
    }

    html += `<td class="vacSumCell">${euroHours(entitlement).replace(",00","")}</td>`;
    html += `<td class="vacTakenCell">${euroHours(takenMonth).replace(",00","")}</td>`;
    html += `<td class="vacRestCell">${euroHours(rest).replace(",00","")}</td></tr>`;
  });

  if(!rows.length){
    html += `<tr><td colspan="${dayCount+4}">Keine einplanbaren Mitarbeiter gefunden.</td></tr>`;
  }

  html += `</tbody></table></div>`;
  mobileHtml += `</div>`;
  $("vacPlannerGrid").innerHTML = mobileHtml + html;
}

function setupVacationPlanner(){
  if($("recalcVacationPlanner")) $("recalcVacationPlanner").onclick = loadVacationPlanner;
  if($("vacPlannerMonth")) $("vacPlannerMonth").value ||= monthISO();
  if($("prevVacPlannerMonth")) $("prevVacPlannerMonth").onclick = ()=>{
    const [y,m]=($("vacPlannerMonth").value||monthISO()).split("-").map(Number);
    $("vacPlannerMonth").value = monthISO(new Date(y,m-2,1));
    loadVacationPlanner();
  };
  if($("nextVacPlannerMonth")) $("nextVacPlannerMonth").onclick = ()=>{
    const [y,m]=($("vacPlannerMonth").value||monthISO()).split("-").map(Number);
    $("vacPlannerMonth").value = monthISO(new Date(y,m,1));
    loadVacationPlanner();
  };
  if($("vacPlannerMonth")) $("vacPlannerMonth").onchange = loadVacationPlanner;
  if($("printVacPlanner")) $("printVacPlanner").onclick = ()=>{
    document.body.classList.add("printVacationPlanner");
    setTimeout(()=>{
      window.print();
      setTimeout(()=>document.body.classList.remove("printVacationPlanner"),500);
    },150);
  };
}
async function refreshVacationViews(){
  await loadVacations();
  await loadVacationCalendar();
  await loadVacationPlanner();
  await loadPlanService();
  await loadPlanKitchen();
  await loadMonth();
}

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

function appPublicUrl(){
  return window.location.origin + window.location.pathname;
}

function sendStaffInvite(profileId){
  const p = profiles.find(x=>x.id===profileId);
  if(!p) return alert("Mitarbeiter nicht gefunden.");
  if(!p.email) return alert("Für diesen Mitarbeiter ist keine E-Mail hinterlegt.");

  const name = `${p.first_name||""} ${p.last_name||""}`.trim() || "du";
  const appUrl = appPublicUrl();

  const subject = "Einladung zum Landsknecht Dienstplan";
  const body =
`Hallo ${name},

du wurdest für den digitalen Dienstplan vom Restaurant Landsknecht eingeladen.

Bitte öffne diesen Link:
${appUrl}

Wichtig:
1. Klicke auf „Registrieren“.
2. Verwende genau diese E-Mail-Adresse: ${p.email}
3. Lege dein eigenes Passwort fest.

Wenn du bereits registriert bist, nutze einfach „Anmelden“ oder „Passwort vergessen?“.

Liebe Grüße`;

  const mailto = `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}
window.sendStaffInvite = sendStaffInvite;

function renderStaff(){
  $("staffList").innerHTML=profiles.map(p=>`<div class="entry"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><br>${escapeHtml(p.email||"")}<br>${escapeHtml(p.phone||"")}<br>Rolle: ${p.role==="management"||p.role==="admin"?"Geschäftsführung":"Mitarbeiter"}<br>Bereich: ${deptBadge(p.department)}<br>Einplanen: ${p.plannable?"Ja":"Nein"}<br>Vertragsart: ${escapeHtml(p.contract_type||"—")}<br>Stundenlohn: ${p.hourly_rate?Number(p.hourly_rate).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €":"—"}<br>Reihenfolge: ${p.sort_order??"—"}<div class="staffActions"><button class="secondary" onclick="editStaff('${p.id}')">Bearbeiten</button> <button class="inviteBtn" onclick="sendStaffInvite('${p.id}')">✉️ Einladung senden</button>${p.id!==profile.id?`<button class="danger" onclick="deactivateStaff('${p.id}')">Deaktivieren</button>`:""}</div></div>`).join("");
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
  if(!isManagement()){
    if($("summaryList")) $("summaryList").innerHTML = "<p>Du siehst hier nur deine eigenen Stunden über die Zeiterfassung.</p>";
    await loadEmployeeOwnOverview();
    return;
  }
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
  if(!$("minijobCenterList")) return;
  if(!isManagement()){
    if(!employeeCanSeeOwnFinance()){
      $("minijobCenterList").innerHTML = `<div class="entry">Für dich ist kein Minijob-Center freigeschaltet.</div>`;
      return;
    }
  }

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
    .filter(p=>isManagement() ? isMinijobProfile(p) : p.id===profile.id && isMinijobProfile(p))
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
      ${isManagement() ? "<b>Quelle:</b> Dienstplan" : "<b>Meine Minijob-Übersicht</b>"} · <b>Monat:</b> ${escapeHtml(month)} · <b>Grenze:</b> ${limit.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €<br>
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




/* v6.0.0 Minijob-Center stabilisiert */
function minijobDepartmentsV6(){
  return ["Minijob Service","Minijob Bar","Minijob Küche"];
}
function isMinijobProfileV6(p){
  return minijobDepartmentsV6().includes(p?.department) && p?.active !== false;
}
function minijobRateV6(p){
  const n = Number(p?.hourly_rate);
  return Number.isFinite(n) && n > 0 ? n : 14;
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

  const limitInput = $("minijobLimit");
  if(limitInput && !limitInput.dataset.v6default){
    limitInput.value = "603";
    limitInput.dataset.v6default = "1";
  }

  const month = $("minijobMonth")?.value || monthISO();
  const limit = Number(limitInput?.value || 603);
  const from = firstOfMonthISO(month);
  const to = month + "-" + pad2(lastDayOfMonth(month));

  $("minijobCenterList").innerHTML = '<div class="entry">Minijob-Center wird direkt aus dem Dienstplan neu berechnet...</div>';

  const { data, error } = await sb.from("schedules")
    .select("*")
    .gte("work_date", from)
    .lte("work_date", to);

  if(error){
    $("minijobCenterList").innerHTML = `<div class="entry"><b>Fehler beim Laden:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }

  const minijobbers = profiles
    .filter(isMinijobProfileV6)
    .sort((a,b)=>
      (Number(a.sort_order??9999)-Number(b.sort_order??9999)) ||
      String(a.last_name||"").localeCompare(String(b.last_name||""))
    );

  const totals = {};
  (data||[]).forEach(s=>{
    const p = profiles.find(x=>x.id===s.profile_id);
    if(!isMinijobProfileV6(p) || s.status !== "arbeit") return;

    totals[s.profile_id] ||= {hours:0,count:0,last:"—"};
    const h = scheduleHoursForMinijobEntry(s);
    totals[s.profile_id].hours += h;
    if(h > 0){
      totals[s.profile_id].count += 1;
      totals[s.profile_id].last = `${fmtDate(s.work_date)} ${String(s.start_time).slice(0,5)}-${String(s.end_time).slice(0,5)}`;
    }
  });

  let totalHours = 0;
  let totalEarned = 0;
  let warnCount = 0;
  lastMinijobRows = [];

  minijobbers.forEach(p=>{
    const t = totals[p.id] || {hours:0,count:0,last:"—"};
    const rate = minijobRateV6(p);
    const earned = t.hours * rate;
    const rest = Math.max(0, limit - earned);
    const rest_hours = rate ? rest / rate : 0;
    const pct = limit ? Math.round((earned / limit) * 100) : 0;
    let status = "OK";
    let cls = "miniOk";
    if(earned >= limit){ status = "Grenze erreicht"; cls = "miniStop"; }
    else if(earned >= limit * 0.8){ status = "Achtung"; cls = "miniWarn"; warnCount++; }

    totalHours += t.hours;
    totalEarned += earned;

    lastMinijobRows.push({
      name:`${p.first_name||""} ${p.last_name||""}`.trim(),
      department:p.department||"",
      hourly_rate:rate,
      shifts:t.count,
      hours:t.hours,
      earned,
      rest,
      rest_hours,
      possible_shifts: rate ? Math.floor(rest / rate / 5.5) : 0,
      last_shift:t.last,
      status,
      cls
    });
  });

  const money = n => Number(n||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2});
  const number = n => Number(n||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2});

  let html = `
    <div class="miniInfo">
      <b>Quelle:</b> Dienstplan · <b>Monat:</b> ${escapeHtml(month)} · <b>Grenze:</b> ${money(limit)} €<br>
      Berücksichtigt werden nur Minijob Service, Minijob Bar und Minijob Küche. Ab 4 Stunden werden automatisch 30 Minuten Pause abgezogen.
    </div>
    <div class="miniStats">
      <div class="miniStatCard"><span>Minijobber</span><b>${minijobbers.length}</b></div>
      <div class="miniStatCard"><span>Geplante Stunden</span><b>${number(totalHours)}</b></div>
      <div class="miniStatCard"><span>Geplanter Verdienst</span><b>${money(totalEarned)} €</b></div>
      <div class="miniStatCard"><span>Warnungen</span><b>${warnCount}</b></div>
      <div class="miniStatCard"><span>Grenze</span><b>${money(limit)} €</b></div>
    </div>
    <div class="miniJobCards">
  `;

  lastMinijobRows.forEach(r=>{
    const pct = limit ? Math.min(100, Math.round((r.earned / limit) * 100)) : 0;
    html += `
      <div class="miniJobCard ${r.cls}">
        <div class="miniJobCardHead">
          <div><b>${escapeHtml(r.name)}</b><br><small>${escapeHtml(r.department)}</small></div>
          <strong>${escapeHtml(r.status)}</strong>
        </div>
        <div class="miniJobCardGrid">
          <span>Std.-Lohn</span><b>${money(r.hourly_rate)} €</b>
          <span>Schichten</span><b>${r.shifts}</b>
          <span>Stunden</span><b>${number(r.hours)}</b>
          <span>Verdienst</span><b>${money(r.earned)} €</b>
          <span>Restbetrag</span><b>${money(r.rest)} €</b>
          <span>Reststunden</span><b>${number(r.rest_hours)}</b>
        </div>
        <div class="miniProgress"><span style="width:${pct}%"></span></div>
        <small>Letzte Schicht: ${escapeHtml(r.last_shift)}</small>
      </div>
    `;
  });

  html += `</div>
    <div class="grid miniJobGrid"><table class="miniJobTable">
      <thead><tr>
        <th>Mitarbeiter</th><th>Bereich</th><th>Std.-Lohn</th><th>Schichten</th><th>Stunden</th><th>Verdienst</th><th>Restbetrag</th><th>Reststunden</th><th>Status</th>
      </tr></thead><tbody>`;

  lastMinijobRows.forEach(r=>{
    const pct = limit ? Math.min(100, Math.round((r.earned / limit) * 100)) : 0;
    html += `<tr>
      <td><b>${escapeHtml(r.name)}</b><br><span class="small">${escapeHtml(r.last_shift)}</span></td>
      <td>${deptBadge(r.department)}</td>
      <td>${money(r.hourly_rate)} €</td>
      <td>${r.shifts}</td>
      <td>${number(r.hours)}</td>
      <td><b>${money(r.earned)} €</b><div class="miniProgress"><span style="width:${pct}%"></span></div></td>
      <td>${money(r.rest)} €</td>
      <td>${number(r.rest_hours)}</td>
      <td><span class="${r.cls}">${escapeHtml(r.status)}</span></td>
    </tr>`;
  });

  html += '</tbody></table></div>';

  if(!minijobbers.length){
    html = '<p>Keine Mitarbeiter in den Bereichen Minijob Service, Minijob Bar oder Minijob Küche gefunden.</p>';
  }

  $("minijobCenterList").innerHTML = html;
  applyMobileTableLabels();
}
function exportMinijobCsv(){
  if(!lastMinijobRows.length){
    alert("Bitte zuerst Minijob-Center neu berechnen.");
    return;
  }
  const rows=[
    ["Mitarbeiter","Bereich","Stundenlohn","Schichten","Geplante Stunden","Geplanter Verdienst","Restbetrag","Reststunden","ca. weitere 5,5h-Schichten","Letzte Schicht","Status"],
    ...lastMinijobRows.map(r=>[
      r.name,r.department,
      r.hourly_rate.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}),
      r.shifts,
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
function setupMinijobCenterV6(){
  if($("minijobLimit")){
    $("minijobLimit").value="603";
    $("minijobLimit").dataset.v6default="1";
  }
  if($("loadMinijobCenter")) $("loadMinijobCenter").onclick=loadMinijobCenter;
  if($("exportMinijobCsv")) $("exportMinijobCsv").onclick=exportMinijobCsv;
  if($("minijobMonth")) $("minijobMonth").onchange=loadMinijobCenter;
}

function setupMobileNavigation(){
  const mobileLogout = document.getElementById("mobileTouchLogoutBtn");
  if(mobileLogout){
    mobileLogout.onclick = async()=>{
      if(sb?.auth) await sb.auth.signOut();
    };
  }
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

setupMinijobCenterV6();
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

async function publishPlan(kind){
  if(!isManagement()) return alert("Nur Geschäftsführung kann den Dienstplan veröffentlichen.");

  const isKitchen = kind === "kitchen";
  const weekInput = isKitchen ? $("weekStartKitchen") : $("weekStartService");
  const week = weekInput?.value || mondayISO();
  const to = addDaysISO(week,6);
  const title = isKitchen ? "Dienstplan Küche veröffentlicht" : "Dienstplan Service veröffentlicht";
  const body = `Der Dienstplan für ${fmtDate(week)} bis ${fmtDate(to)} wurde veröffentlicht. Bitte prüfe deine Schichten.`;

  let errorMessage = "";

  if(typeof createNotification === "function"){
    try{
      await createNotification(title, body);
    }catch(e){
      errorMessage = e?.message || String(e);
    }
  }else{
    const res = await sb.from("notifications").insert({
      title,
      body,
      created_by: profile?.id || null
    });
    if(res.error) errorMessage = res.error.message;
  }

  if(errorMessage){
    alert("Dienstplan wurde nicht veröffentlicht: " + errorMessage);
    return;
  }

  alert("Dienstplan wurde veröffentlicht. Die Benachrichtigung wurde erstellt.");
}

function setupPlanPublishButtons(){
  if($("publishServicePlanBtn")) $("publishServicePlanBtn").onclick = () => publishPlan("service");
  if($("publishKitchenPlanBtn")) $("publishKitchenPlanBtn").onclick = () => publishPlan("kitchen");
}

setupPlanPublishButtons();
setupMyHoursRangeControls();
setupDashboardV57();
setupEvents();

function vacationDateRangeDays(from,to,rangeFrom,rangeTo,value=1){
  const out = {};
  let d = from < rangeFrom ? rangeFrom : from;
  const end = to > rangeTo ? rangeTo : to;
  while(d <= end){
    out[d] = value;
    d = addDaysISO(d,1);
  }
  return out;
}

async function collectVacationDaysForYear(year){
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [vacRes, scheduleRes] = await Promise.all([
    sb.from("vacation_requests")
      .select("*")
      .lte("date_from",to)
      .gte("date_to",from)
      .in("status",["genehmigt"]),
    sb.from("schedules")
      .select("*")
      .gte("work_date",from)
      .lte("work_date",to)
  ]);

  if(vacRes.error || scheduleRes.error){
    throw new Error((vacRes.error || scheduleRes.error).message);
  }

  const byProfile = {};
  const sourceInfo = {};

  function ensure(profileId){
    byProfile[profileId] ||= {};
    sourceInfo[profileId] ||= {};
  }

  (vacRes.data || []).forEach(v=>{
    ensure(v.profile_id);
    const range = vacationDateRangeDays(v.date_from,v.date_to,from,to,vacationDayValue(v,v.date_from));
    Object.entries(range).forEach(([iso,val])=>{
      byProfile[v.profile_id][iso] = val;
      sourceInfo[v.profile_id][iso] = "Urlaubsliste";
    });
  });

  (scheduleRes.data || [])
    .filter(s=>String(s.status || "").toLowerCase().includes("urlaub"))
    .forEach(s=>{
      ensure(s.profile_id);
      const iso = s.work_date;
      if(!iso || iso < from || iso > to) return;
      if(!byProfile[s.profile_id][iso]){
        byProfile[s.profile_id][iso] = 1;
        sourceInfo[s.profile_id][iso] = "Dienstplan";
      }
    });

  return {byProfile,sourceInfo};
}

async function loadVacationYearOverview(){
  if(!$("vacYearGrid") || !isManagement() || !profiles.length) return;

  const year = Number($("vacYearSelect")?.value || new Date().getFullYear());
  if($("vacYearSelect")) $("vacYearSelect").value = year;

  $("vacYearGrid").innerHTML = `<div class="entry">Jahresübersicht wird berechnet...</div>`;

  let collected;
  try{
    collected = await collectVacationDaysForYear(year);
  }catch(e){
    $("vacYearGrid").innerHTML = `<div class="entry"><b>Fehler:</b><br>${escapeHtml(e.message)}</div>`;
    return;
  }

  const {byProfile,sourceInfo} = collected;
  const months = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

  const rows = plannable()
    .slice()
    .sort((a,b)=>
      (Number(a.sort_order??9999)-Number(b.sort_order??9999)) ||
      String(a.department||"").localeCompare(String(b.department||"")) ||
      String(a.last_name||"").localeCompare(String(b.last_name||""))
    );

  let mobile = `<div class="vacYearMobileCards">`;
  let html = `<div class="vacYearScroll"><table class="vacYearTable"><thead><tr>
    <th class="vacYearNameHead">Mitarbeiter</th>
    ${months.map(m=>`<th>${m}</th>`).join("")}
    <th>Anspruch</th>
    <th>Genommen</th>
    <th>Rest</th>
  </tr></thead><tbody>`;

  rows.forEach(p=>{
    const daysMap = byProfile[p.id] || {};
    const monthly = Array(12).fill(0);
    const detailByMonth = Array.from({length:12},()=>[]);

    Object.entries(daysMap).forEach(([iso,val])=>{
      const m = Number(iso.slice(5,7))-1;
      monthly[m] += Number(val||0);
      detailByMonth[m].push(`${fmtDate(iso)} ${sourceInfo[p.id]?.[iso] || ""}`);
    });

    const taken = monthly.reduce((a,b)=>a+b,0);
    const entitlement = vacationEntitlement(p);
    const rest = Math.max(0, entitlement - taken);

    html += `<tr>
      <td class="vacYearNameCell"><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${escapeHtml(p.department||"")}</small></td>
      ${monthly.map((v,i)=>`<td title="${escapeHtml(detailByMonth[i].join(" | "))}" class="${v>0?"vacYearHas":""}">${v ? euroHours(v).replace(",00","") : ""}</td>`).join("")}
      <td class="vacYearEnt">${euroHours(entitlement).replace(",00","")}</td>
      <td class="vacYearTaken">${euroHours(taken).replace(",00","")}</td>
      <td class="vacYearRest">${euroHours(rest).replace(",00","")}</td>
    </tr>`;

    const usedMonths = monthly.map((v,i)=>v>0 ? `<span><b>${months[i]}</b>${euroHours(v).replace(",00","")}</span>` : "").join("");
    mobile += `
      <div class="vacYearMobileCard ${taken>0 ? "hasVacation" : ""}">
        <div class="vacYearMobileHead">
          <div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${escapeHtml(p.department||"")}</small></div>
          <strong>${taken>0 ? euroHours(taken).replace(",00","") + " genommen" : "Kein Urlaub"}</strong>
        </div>
        <div class="vacYearMobileStats">
          <span><small>Anspruch</small><b>${euroHours(entitlement).replace(",00","")}</b></span>
          <span><small>Genommen</small><b>${euroHours(taken).replace(",00","")}</b></span>
          <span><small>Rest</small><b>${euroHours(rest).replace(",00","")}</b></span>
        </div>
        <div class="vacYearMonths">${usedMonths || "<em>Kein Urlaub im Jahr</em>"}</div>
      </div>`;
  });

  if(!rows.length){
    html += `<tr><td colspan="16">Keine einplanbaren Mitarbeiter gefunden.</td></tr>`;
  }

  html += `</tbody></table></div>`;
  mobile += `</div>`;
  $("vacYearGrid").innerHTML = mobile + html;
}

function setupVacationYearOverview(){
  if($("vacYearSelect")) $("vacYearSelect").value ||= new Date().getFullYear();
  if($("calcVacYear")) $("calcVacYear").onclick = loadVacationYearOverview;
  if($("prevVacYear")) $("prevVacYear").onclick = ()=>{
    $("vacYearSelect").value = Number($("vacYearSelect").value || new Date().getFullYear()) - 1;
    loadVacationYearOverview();
  };
  if($("nextVacYear")) $("nextVacYear").onclick = ()=>{
    $("vacYearSelect").value = Number($("vacYearSelect").value || new Date().getFullYear()) + 1;
    loadVacationYearOverview();
  };
}

setupVacationYearOverview();
setupVacationPlanner();
init();

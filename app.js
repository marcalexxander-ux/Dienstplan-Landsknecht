document.body.classList.add("loggedOut");
const APP_VERSION="v6.0.53";
const MAX_EMPLOYEES=20;
const days=["Mo","Di","Mi","Do","Fr","Sa","So"];
const SERVICE_DEPARTMENTS=["Restaurantleitung","Service","Minijob Service","Bar","Minijob Bar"];
const KITCHEN_DEPARTMENTS=["Küchenleitung","Küchen Leitung","Küche","Minijob Küche","Spüler","Reinigung"];
let sb,session,profile,profiles=[],lastSummaryRows=[],lastMinijobRows=[],dailyInfoCache=[];
let lastClockEvaluationRows=[];
let clockSaving=false;
let publishedPlanCache={};
let passwordRecoveryMode=false;

function $(id){return document.getElementById(id)}
function pad2(n){return String(n).padStart(2,"0")}
function localISODate(d){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
function parseISODateLocal(iso){const[y,m,d]=iso.split("-").map(Number);return new Date(y,m-1,d)}
function todayISO(){return localISODate(new Date())}
function mondayISO(d=new Date()){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return localISODate(x)}
function addDaysISO(iso,n){const d=parseISODateLocal(iso);d.setDate(d.getDate()+n);return localISODate(d)}
function addWeeksISO(iso,n){return addDaysISO(iso,n*7)}

function isoWeekNumber(iso){
  const d = parseISODateLocal(iso);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(),0,4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
function isoWeekYear(iso){
  const d = parseISODateLocal(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  return d.getFullYear();
}
function weekShortDate(iso){
  const d = parseISODateLocal(iso);
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
}
function mondayFromISOWeek(year, week){
  const y = Number(year), w = Number(week);
  if(!Number.isFinite(y) || !Number.isFinite(w) || w < 1 || w > 53) return null;
  const simple = new Date(y,0,1 + (w-1)*7);
  const dow = simple.getDay();
  const isoWeekStart = new Date(simple);
  if(dow <= 4){
    isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
  }else{
    isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  const iso = localISODate(isoWeekStart);
  return isoWeekNumber(iso) === w ? iso : null;
}
function parseTargetWeekInput(input, currentYear=new Date().getFullYear()){
  const raw = String(input||"").trim().toLowerCase();
  if(!raw) return null;

  // Datum als Montag oder irgendein Tag in der Woche: 2026-07-20 oder 20.07.2026
  const iso = normalizeDateInput(raw);
  if(iso && iso !== "__INVALID__"){
    return weekStartISO(iso);
  }

  // KW 32 / 2026, 32/2026, 32-2026, 32 2026
  let m = raw.match(/(?:kw\s*)?(\d{1,2})\s*[\/.\-\s]\s*(20\d{2})/i);
  if(m) return mondayFromISOWeek(Number(m[2]),Number(m[1]));

  // 2026 KW 32
  m = raw.match(/(20\d{2})\s*(?:kw)?\s*(\d{1,2})/i);
  if(m) return mondayFromISOWeek(Number(m[1]),Number(m[2]));

  // Nur KW-Zahl, aktuelles Jahr nehmen
  m = raw.match(/^(?:kw\s*)?(\d{1,2})$/i);
  if(m) return mondayFromISOWeek(currentYear,Number(m[1]));

  return null;
}
function weekDisplayLabel(week){
  const safeWeek = week || mondayISO();
  const end = addDaysISO(safeWeek,6);
  return `KW ${isoWeekNumber(safeWeek)} / ${isoWeekYear(safeWeek)} · ${weekShortDate(safeWeek)}–${weekShortDate(end)}`;
}
function weekSelectYearsFor(week){
  const y = isoWeekYear(week || mondayISO());
  return [y-1,y,y+1,y+2];
}
function populateWeekSelect(selectId, week){
  const sel = $(selectId);
  if(!sel) return;
  const current = week || mondayISO();
  const years = weekSelectYearsFor(current);
  const currentValue = current;
  const existing = sel.value;
  const options = [];

  years.forEach(year=>{
    for(let kw=1; kw<=53; kw++){
      const monday = mondayFromISOWeek(year,kw);
      if(!monday) continue;
      options.push(`<option value="${monday}">${weekDisplayLabel(monday)}</option>`);
    }
  });

  sel.innerHTML = options.join("");
  sel.value = currentValue;
  if(sel.value !== currentValue && existing) sel.value = existing;
}
function updateWeekLabels(){
  if($("weekSelectService")){
    const week = $("weekStartService")?.value || mondayISO();
    populateWeekSelect("weekSelectService",week);
    $("weekSelectService").title = `${fmtDate(week)} bis ${fmtDate(addDaysISO(week,6))}`;
  }
  if($("weekSelectKitchen")){
    const week = $("weekStartKitchen")?.value || mondayISO();
    populateWeekSelect("weekSelectKitchen",week);
    $("weekSelectKitchen").title = `${fmtDate(week)} bis ${fmtDate(addDaysISO(week,6))}`;
  }
}

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

function isKitchenLead(){
  const dept = String(profile?.department || "").trim().toLowerCase();
  const role = String(profile?.role || "").trim().toLowerCase();
  return role === "kitchenlead" || role === "kitchen_lead" || role === "kitchen-lead" || role === "küchenleitung" || dept === "küchenleitung" || dept === "küchen leitung";
}
function isKitchenDepartmentName(dept){
  const d = String(dept || "").trim().toLowerCase();
  return d.includes("küche") || d.includes("kueche") || d.includes("kitchen") || d === "küchenleitung" || d === "küchen leitung";
}
function isKitchenProfile(p){
  if(!p) return false;
  return isKitchenDepartmentName(p.department) || String(p.role||"").toLowerCase().includes("kitchen");
}
function canManageVacation(){
  return isManagement();
}
function canViewVacationTeam(){
  return isManagement() || isKitchenLead();
}
function canViewVacationProfile(p){
  if(!p?.id || !profile?.id) return false;
  if(isManagement()) return true;
  if(isKitchenLead()) return isKitchenProfile(p);
  return p.id === profile.id;
}
function vacationVisibleProfiles(){
  if(isManagement()) return alphaProfiles();
  if(isKitchenLead()) return alphaProfiles().filter(isKitchenProfile);
  return profile ? [profile] : [];
}
function vacationVisibleProfileIds(){
  return vacationVisibleProfiles().map(p=>p.id).filter(Boolean);
}
function vacationRoleDescription(){
  if(isManagement()) return {
    title:"Rechte: Geschäftsführung",
    text:"Du siehst alle Urlaubsanträge und Urlaubskonten. Du kannst Urlaub direkt eintragen, genehmigen und ablehnen."
  };
  if(isKitchenLead()) return {
    title:"Rechte: Küchenleitung",
    text:"Du siehst Urlaubsanträge und Urlaubskonten der Küche. Genehmigen, Ablehnen und direktes Eintragen bleibt Geschäftsführung."
  };
  return {
    title:"Rechte: Mitarbeiter",
    text:"Du siehst deinen eigenen Urlaubsstand und kannst eigenen Urlaub beantragen."
  };
}
function renderVacationRightsInfo(){
  const el = $("vacationRightsInfo");
  if(!el || !session) return;
  const info = vacationRoleDescription();
  el.innerHTML = `<b>${escapeHtml(info.title)}</b><br><span>${escapeHtml(info.text)}</span>`;
}
function canEditPlan(kind){
  return isManagement() || (kind === "kitchen" && isKitchenLead());
}
function canPublishPlan(kind){
  return isManagement() || (kind === "kitchen" && isKitchenLead());
}

function plannable(){return profiles.filter(p=>!isRemovedProfile(p) && p.plannable===true && !isRemovedProfile(p))}
function sanitizeDept(dept){return String(dept||"").replace(/\s+/g,"")}
function isRemovedProfile(p){
  const email = String(p?.email||"").toLowerCase();
  return p?.active === false || email.includes("@removed.local") || email.includes("@deleted.local");
}
function displayDept(dept){
  const val = String(dept||"").trim();
  return val || "Restaurantleitung";
}
function deptBadge(dept){const label=displayDept(dept);return `<span class="deptBadge dept-${sanitizeDept(label)}">${escapeHtml(label)}</span>`}
function setActiveTab(tabId){
  let normalized = (tabId==="today" || tabId==="home") ? "dashboard" : tabId;
  if(normalized==="timeClock" && session && !isManagement() && !isClockRoute()) normalized = "dashboard";
  document.querySelectorAll(".sidebar button[data-tab], #mobileTouchNav button[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===normalized));
  document.querySelectorAll(".tabPage").forEach(p=>p.classList.add("hidden"));
  const target=$(normalized);
  if(target) target.classList.remove("hidden");
  const activeTouch = document.querySelector(`#mobileTouchNav button[data-tab="${normalized}"]`);
  if(activeTouch) activeTouch.scrollIntoView({behavior:"smooth", inline:"center", block:"nearest"});
  if(normalized==="events") loadEvents?.();
  if(normalized==="dashboard") loadDashboardV57?.();
  if(normalized==="minijobCenter") loadMinijobCenter?.();
  if(normalized==="timeClock") loadTimeClock?.();
  if(normalized==="vacation"){ renderVacationRightsInfo?.(); loadVacationPlanner?.(); loadVacationAccountOverview?.(); loadVacationYearClosePreview?.(); updateVacationRequestCalc?.(); updateVacationAdminCalc?.(); }
}

function planKindForDepartment(dept){
  return KITCHEN_DEPARTMENTS.includes(dept) ? "kitchen" : "service";
}
function publishedKey(kind,weekStart){
  return `${kind}_${weekStart}`;
}
async function isPlanPublished(kind,weekStart){
  if(canEditPlan(kind)) return true;
  const key=publishedKey(kind,weekStart);
  if(Object.prototype.hasOwnProperty.call(publishedPlanCache,key)) return !!publishedPlanCache[key];
  try{
    const {data,error}=await sb.from("published_plans").select("id").eq("plan_kind",kind).eq("week_start",weekStart).maybeSingle();
    if(error){ publishedPlanCache[key]=false; return false; }
    publishedPlanCache[key]=!!data;
    return !!data;
  }catch(e){
    publishedPlanCache[key]=false;
    return false;
  }
}
async function publishedWeeksMap(from,to){
  const out={service:{},kitchen:{}};
  if(isManagement()){
    let d=from;
    while(d<=to){
      const w=mondayISO(parseISODateLocal(d));
      out.service[w]=true; out.kitchen[w]=true;
      d=addDaysISO(d,1);
    }
    return out;
  }
  try{
    const {data}=await sb.from("published_plans").select("*").lte("week_start",to).gte("week_start",addDaysISO(from,-6));
    (data||[]).forEach(r=>{
      if(r.plan_kind==="service" || r.plan_kind==="kitchen") out[r.plan_kind][r.week_start]=true;
    });
  }catch(e){}
  return out;
}
async function ensureEmployeeCanSeeWeek(kind,weekStart,targetId,title){
  if(isManagement()) return true;
  const ok=await isPlanPublished(kind,weekStart);
  if(!ok && targetId && $(targetId)){
    $(targetId).innerHTML=`<div class="entry unpublishedNotice"><b>${escapeHtml(title||"Dienstplan")} noch nicht veröffentlicht.</b><br><span class="small">Diese Woche ist für Mitarbeiter noch nicht freigegeben.</span></div>`;
  }
  return ok;
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

  // Client-only App: implicit flow ist für Passwort-Reset robuster als PKCE,
  // weil der Mitarbeiter den Mail-Link auch auf einem anderen Gerät öffnen kann.
  sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{auth:{detectSessionInUrl:true}});

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/,""));
  const queryType = url.searchParams.get("type");
  const hashType = hashParams.get("type");
  const hashError = hashParams.get("error_description") || hashParams.get("error");

  if(hashError){
    const readable = decodeURIComponent(String(hashError).replace(/\+/g," "));
    setTimeout(()=>alert("Passwort-Link konnte nicht geöffnet werden: " + readable + "\n\nBitte neuen Passwort-Reset anfordern. Wenn der Fehler wiederkommt, in Supabase die Redirect URL prüfen."),300);
    window.history.replaceState({},document.title,window.location.origin + window.location.pathname);
  }

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if((hashType==="recovery" || queryType==="recovery") && accessToken && refreshToken){
    const setRes = await sb.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
    if(!setRes.error){
      passwordRecoveryMode=true;
      window.history.replaceState({},document.title,window.location.origin + window.location.pathname);
    }
  }

  const code = url.searchParams.get("code");
  if(code){
    const exchange = await sb.auth.exchangeCodeForSession(code);
    if(!exchange.error){
      passwordRecoveryMode = true;
      window.history.replaceState({},document.title,window.location.origin + window.location.pathname);
    }else{
      setTimeout(()=>alert("Passwort-Link konnte nicht abgeschlossen werden: " + exchange.error.message + "\n\nBitte direkt auf demselben Gerät/Browser erneut „Passwort vergessen?“ auslösen oder die Redirect URL in Supabase prüfen."),300);
    }
  }

  if(hashType==="recovery" || queryType==="recovery"){
    passwordRecoveryMode = true;
  }

  const res=await sb.auth.getSession();
  session=res.data.session;
  if(session)await loadProfile();
  if(await handleInactiveProfileIfNeeded()) return;
  renderAuth();

  sb.auth.onAuthStateChange(async(_e,s)=>{
    if(_e==="PASSWORD_RECOVERY") passwordRecoveryMode=true;
    session=s;
    if(session && !passwordRecoveryMode) await loadProfile();
    if(!session) profile=null;
    renderAuth();
  });
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



async function handleInactiveProfileIfNeeded(){
  if(profile && (profile.active===false || profile.role==="deleted")){
    alert("Dieser Zugang ist in der App deaktiviert. Bitte melde dich bei der Restaurantleitung.");
    profile=null;
    session=null;
    try{ await sb.auth.signOut(); }catch(e){}
    renderAuth();
    return true;
  }
  return false;
}

function setAuthBodyState(logged){
  document.body.classList.toggle("loggedIn", !!logged);
  document.body.classList.toggle("loggedOut", !logged);
  document.body.classList.toggle("employeeMode", !!logged && !isManagement());
}

function renderAuth(){
  const logged=!!session;
  setAuthBodyState(logged);
  document.body.classList.toggle("employeeMode", !!logged && !isManagement());
  document.body.classList.toggle("clockRouteMode", !!logged && isClockRoute());

  if(passwordRecoveryMode){
    if($("authView")) $("authView").classList.add("hidden");
    if($("appView")) $("appView").classList.add("hidden");
    if($("passwordUpdateView")) $("passwordUpdateView").classList.remove("hidden");
    return;
  }

  if($("passwordUpdateView")) $("passwordUpdateView").classList.add("hidden");
  if($("authView")) $("authView").classList.toggle("hidden", logged);
  if($("appView")) $("appView").classList.toggle("hidden", !logged);

  document.querySelectorAll(".managementOnly").forEach(el=>el.classList.toggle("hidden",!logged||!isManagement()));
  document.querySelectorAll(".kitchenLeadOnly").forEach(el=>el.classList.toggle("hidden",!logged||!(isManagement()||isKitchenLead())));
  document.querySelectorAll(".employeeClockOnly").forEach(el=>el.classList.toggle("hidden",!logged||isManagement()));

  if(logged){
    $("weekStartService").value ||= mondayISO();
    $("weekStartKitchen").value ||= mondayISO();
    updateWeekLabels();
    $("monthSelect").value ||= monthISO();
    $("infoDate").value ||= todayISO();
    $("vacMonthSelect").value ||= monthISO();
    $("vacFrom").value ||= todayISO();
    $("vacTo").value ||= todayISO();
    if($("eventDate")) $("eventDate").value ||= todayISO();
    if($("minijobMonth")) $("minijobMonth").value ||= monthISO();
    setActiveTab(new URLSearchParams(window.location.search).has("stempeluhr") ? "timeClock" : "dashboard");
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
  if(error){
    const msg = String(error.message||"");
    if(msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")){
      alert("Diese E-Mail ist bereits registriert. Bitte nicht erneut registrieren, sondern „Passwort vergessen?“ nutzen.");
    }else{
      alert(msg);
    }
  }else{
    alert("Registrierung erstellt.");
  }
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
  let scheduleList=schedules||[];
  if(!isManagement()){
    const w=mondayISO(parseISODateLocal(today));
    const pub=await publishedWeeksMap(today,today);
    scheduleList=scheduleList.filter(s=>{
      const p=profileById(s.profile_id);
      const kind=planKindForDepartment(p.department);
      return (pub[kind]?.[w] || canEditPlan(kind)) && s.status==="arbeit";
    });
  }
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
        <button class="danger" onclick="deleteEvent('${e.id}')">Aus App entfernen</button>
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

  let visibleTodaySchedules = todaySchedules;
  let visibleMonthSchedules = monthSchedules;
  if(!isManagement()){
    const todayWeek = mondayISO(parseISODateLocal(today));
    const pub = await publishedWeeksMap(fromMonth,toMonth);
    visibleTodaySchedules = todaySchedules.filter(s=>{
      const p=profileById(s.profile_id);
      const kind=planKindForDepartment(p.department);
      return pub[kind]?.[todayWeek] || canEditPlan(kind);
    });
    visibleMonthSchedules = monthSchedules.filter(s=>{
      const p=profileById(s.profile_id);
      const kind=planKindForDepartment(p.department);
      const w=mondayISO(parseISODateLocal(s.work_date));
      return pub[kind]?.[w] || canEditPlan(kind);
    });
  }

  const workToday = visibleTodaySchedules.filter(s=>s.status==="arbeit");
  const sickToday = isManagement() ? visibleTodaySchedules.filter(s=>s.status==="krank") : [];

  const minijobTotals = {};
  visibleMonthSchedules.forEach(s=>{
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

  const vacationPanelV57 = $("dashboardVacationsPanelV57") || ($("dashboardVacationsV57") ? $("dashboardVacationsV57").closest(".dashPanelV57") : null);
  if(vacationPanelV57){
    vacationPanelV57.classList.toggle("hidden", !isManagement());
  }
  if($("dashboardVacationsV57")){
    $("dashboardVacationsV57").innerHTML = isManagement()
      ? (openVacations.length ? openVacations.map(v=>{
          const p=profileById(v.profile_id);
          return `<div class="dashItemV57"><div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)}</small></div><strong>Offen</strong></div>`;
        }).join("") : `<div class="dashEmptyV57">Keine offenen Urlaubsanträge.</div>`)
      : "";
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

  const birthdayPanelV57 = $("dashboardBirthdaysPanelV57") || ($("dashboardBirthdaysV57") ? $("dashboardBirthdaysV57").closest(".dashPanelV57") : null);
  if(birthdayPanelV57){
    birthdayPanelV57.classList.toggle("hidden", !upcomingBirthdays.length);
  }
  if($("dashboardBirthdaysV57")){
    $("dashboardBirthdaysV57").innerHTML = upcomingBirthdays.length ? upcomingBirthdays.map(x=>`
      <div class="dashItemV57"><div><b>${escapeHtml(x.p.first_name||"")} ${escapeHtml(x.p.last_name||"")}</b><br><small>${fmtDate(x.next)}</small></div><strong>${x.diff===0?"Heute":x.diff+" Tage"}</strong></div>
    `).join("") : "";
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
  await Promise.all([loadDashboardLight(),loadPlanService(),loadPlanKitchen(),loadMonth(),loadInfos(),loadVacations(),loadVacationCalendar(),loadVacationPlanner(),loadVacationYearOverview(),loadVacationAccountOverview(),loadMinijobCenter(),loadEmployeeOwnOverview(),loadTimeClock()]);
}


function alphaProfiles(){
  return plannable().slice().sort((a,b)=>{
    const ak = `${a.last_name||""} ${a.first_name||""}`.trim().toLowerCase();
    const bk = `${b.last_name||""} ${b.first_name||""}`.trim().toLowerCase();
    return ak.localeCompare(bk, "de", {sensitivity:"base"});
  });
}
function profileOptionHtml(p){
  return `<option value="${p.id}">${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} (${escapeHtml(p.department||"")})</option>`;
}

async function loadProfiles(){
  const{data,error}=await sb.from("profiles").select("*").eq("active",true).order("department").order("sort_order").order("last_name");
  if(error)return alert(error.message);
  profiles = (data||[]).filter(p=>!isRemovedProfile(p));
  if($("timeProfile")) $("timeProfile").innerHTML=plannable().map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)} (${escapeHtml(p.department||"")})</option>`).join("");
  if($("vacAdminProfile")) $("vacAdminProfile").innerHTML=alphaProfiles().map(profileOptionHtml).join("");
  updateVacationAdminCalc?.();
  if($("clockProfile")) $("clockProfile").innerHTML=alphaProfiles().map(profileOptionHtml).join("");
  if($("clockEvalProfile")) $("clockEvalProfile").innerHTML=`<option value="">Alle Mitarbeiter</option>`+alphaProfiles().map(profileOptionHtml).join("");
  if($("clockEventsProfileFilter")) $("clockEventsProfileFilter").innerHTML=`<option value="">Alle Mitarbeiter</option>`+alphaProfiles().map(profileOptionHtml).join("");
  if(isManagement())renderStaff();
}


$("prevWeekService").onclick=()=>{$("weekStartService").value=addWeeksISO($("weekStartService").value||mondayISO(),-1);updateWeekLabels();loadPlanService()};
$("nextWeekService").onclick=()=>{$("weekStartService").value=addWeeksISO($("weekStartService").value||mondayISO(),1);updateWeekLabels();loadPlanService()};
$("weekStartService").onchange=()=>{updateWeekLabels();loadPlanService()};
if($("weekSelectService")) $("weekSelectService").onchange=()=>{$("weekStartService").value=$("weekSelectService").value;updateWeekLabels();loadPlanService()};
$("prevWeekKitchen").onclick=()=>{$("weekStartKitchen").value=addWeeksISO($("weekStartKitchen").value||mondayISO(),-1);updateWeekLabels();loadPlanKitchen()};
$("nextWeekKitchen").onclick=()=>{$("weekStartKitchen").value=addWeeksISO($("weekStartKitchen").value||mondayISO(),1);updateWeekLabels();loadPlanKitchen()};
$("weekStartKitchen").onchange=()=>{updateWeekLabels();loadPlanKitchen()};
if($("weekSelectKitchen")) $("weekSelectKitchen").onchange=()=>{$("weekStartKitchen").value=$("weekSelectKitchen").value;updateWeekLabels();loadPlanKitchen()};
if($("copyServiceNextWeekBtn")) $("copyServiceNextWeekBtn").onclick=()=>openCopyPlanModal("service");
if($("copyKitchenNextWeekBtn")) $("copyKitchenNextWeekBtn").onclick=()=>openCopyPlanModal("kitchen");
setupCopyPlanModal();
if($("servicePdfBtn")) $("servicePdfBtn").onclick=printServicePlan;
if($("kitchenPdfBtn")) $("kitchenPdfBtn").onclick=printKitchenPlan;
if($("monthPdfBtn")) $("monthPdfBtn").onclick=printMonthPlan;
if($("newStaffBtn")) if($("newStaffBtn")) $("newStaffBtn").onclick=clearStaffForm;

function scheduleCopyShouldSkip(s){
  const status = String(s?.status || "").trim().toLowerCase();
  return status.includes("urlaub") || status.includes("krank");
}
function scheduleCopyPayload(s, targetDate){
  return {
    profile_id:s.profile_id,
    work_date:targetDate,
    status:s.status,
    start_time:s.start_time || null,
    end_time:s.end_time || null
  };
}
let copyPlanState = {kind:"service"};

function fillCopyWeekSelect(selectId, selectedWeek, baseWeek){
  const sel = $(selectId);
  if(!sel) return;
  const current = selectedWeek || baseWeek || mondayISO();
  const years = weekSelectYearsFor(current);
  const options = [];

  years.forEach(year=>{
    for(let kw=1; kw<=53; kw++){
      const monday = mondayFromISOWeek(year,kw);
      if(!monday) continue;
      options.push(`<option value="${monday}">${weekDisplayLabel(monday)}</option>`);
    }
  });

  sel.innerHTML = options.join("");
  sel.value = current;
}

function openCopyPlanModal(kind){
  const isKitchen = kind === "kitchen";
  if(!canEditPlan(kind)){
    alert("Du hast keine Berechtigung, diesen Dienstplan zu kopieren.");
    return;
  }

  copyPlanState = {kind};
  const title = isKitchen ? "Dienstplan Küche kopieren" : "Dienstplan Service kopieren";
  const currentWeek = (isKitchen ? $("weekStartKitchen") : $("weekStartService"))?.value || mondayISO();
  const targetWeek = addWeeksISO(currentWeek,1);

  if($("copyPlanModalTitle")) $("copyPlanModalTitle").textContent = title;
  if($("copyPlanModalSub")) $("copyPlanModalSub").textContent = "Quelle KW wählen, Ziel KW wählen und kopieren.";

  fillCopyWeekSelect("copySourceWeek",currentWeek,currentWeek);
  fillCopyWeekSelect("copyTargetWeek",targetWeek,currentWeek);
  updateCopyPlanPreview();

  $("copyPlanModal")?.classList.remove("hidden");
}

function closeCopyPlanModal(){
  $("copyPlanModal")?.classList.add("hidden");
}

function updateCopyPlanPreview(){
  const sourceWeek = $("copySourceWeek")?.value || mondayISO();
  const targetWeek = $("copyTargetWeek")?.value || addWeeksISO(sourceWeek,1);
  const box = $("copyPlanPreview");
  if(!box) return;

  const same = sourceWeek === targetWeek;
  box.innerHTML = `
    <div><strong>Von:</strong> ${weekDisplayLabel(sourceWeek)}</div>
    <div><strong>Nach:</strong> ${weekDisplayLabel(targetWeek)}</div>
    ${same ? `<div class="warnText">Quelle und Ziel sind identisch. Bitte eine andere Ziel-KW wählen.</div>` : ``}
  `;
}

function setupCopyPlanModal(){
  if($("copyPlanModalClose")) $("copyPlanModalClose").onclick = closeCopyPlanModal;
  if($("copyPlanCancel")) $("copyPlanCancel").onclick = closeCopyPlanModal;
  if($("copySourceWeek")) $("copySourceWeek").onchange = updateCopyPlanPreview;
  if($("copyTargetWeek")) $("copyTargetWeek").onchange = updateCopyPlanPreview;
  if($("copyPlanConfirm")) $("copyPlanConfirm").onclick = ()=>copyPlanBetweenWeeks(copyPlanState.kind);
  if($("copyPlanModal")){
    $("copyPlanModal").addEventListener("click",e=>{
      if(e.target && e.target.id === "copyPlanModal") closeCopyPlanModal();
    });
  }
}

async function copyPlanBetweenWeeks(kind){
  const isKitchen = kind === "kitchen";
  if(!canEditPlan(kind)){
    alert("Du hast keine Berechtigung, diesen Dienstplan zu kopieren.");
    return;
  }

  const input = isKitchen ? $("weekStartKitchen") : $("weekStartService");
  const departments = isKitchen ? KITCHEN_DEPARTMENTS : SERVICE_DEPARTMENTS;
  const title = isKitchen ? "Küche" : "Service";
  const sourceWeek = $("copySourceWeek")?.value || input?.value || mondayISO();
  const targetWeek = $("copyTargetWeek")?.value || addWeeksISO(sourceWeek,1);

  if(targetWeek === sourceWeek){
    alert("Quelle und Ziel sind dieselbe Woche. Bitte eine andere Ziel-KW wählen.");
    return;
  }

  const sourceTo = addDaysISO(sourceWeek,6);
  const targetTo = addDaysISO(targetWeek,6);

  const peopleIds = plannable()
    .filter(p=>departments.includes(p.department))
    .map(p=>p.id)
    .filter(Boolean);

  if(!peopleIds.length){
    alert(`Keine Mitarbeiter für ${title} gefunden.`);
    return;
  }

  if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = true;

  const sourceRes = await sb.from("schedules")
    .select("*")
    .gte("work_date",sourceWeek)
    .lte("work_date",sourceTo)
    .in("profile_id",peopleIds);

  if(sourceRes.error){
    if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
    alert("Fehler beim Laden der Quelle: " + sourceRes.error.message);
    return;
  }

  const sourceRows = sourceRes.data || [];
  const skippedRows = sourceRows.filter(scheduleCopyShouldSkip);
  const copyRows = sourceRows.filter(s=>!scheduleCopyShouldSkip(s));

  if(!sourceRows.length){
    if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
    alert(`In der Quelle gibt es für ${title} noch keine Einträge zum Kopieren.`);
    return;
  }

  if(!copyRows.length){
    if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
    alert(`In der Quelle gibt es keine kopierbaren Arbeit/Frei-Einträge. Urlaub und Krank werden bewusst nicht kopiert.`);
    return;
  }

  const targetRes = await sb.from("schedules")
    .select("*")
    .gte("work_date",targetWeek)
    .lte("work_date",targetTo)
    .in("profile_id",peopleIds);

  if(targetRes.error){
    if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
    alert("Fehler beim Prüfen der Ziel-KW: " + targetRes.error.message);
    return;
  }

  const publishedRes = await sb.from("published_plans")
    .select("*")
    .eq("plan_kind",kind)
    .eq("week_start",targetWeek)
    .maybeSingle();

  const existingCount = (targetRes.data||[]).length;
  let message =
    `Dienstplan ${title} kopieren?\n\n`+
    `Von: ${weekDisplayLabel(sourceWeek)}\n`+
    `Nach: ${weekDisplayLabel(targetWeek)}\n\n`+
    `${copyRows.length} Arbeit/Frei-Einträge werden übertragen.\n`;

  if(skippedRows.length){
    message += `\nUrlaub/Krank: ${skippedRows.length} Eintrag/Einträge werden ausgelassen und bleiben in der Ziel-KW leer.\n`;
  }
  if(existingCount){
    message += `\nAchtung: In der Ziel-KW gibt es bereits ${existingCount} Einträge in diesem Bereich. Diese werden überschrieben.\n`;
  }
  if(publishedRes.data){
    message += `\nAchtung: Die Ziel-KW wurde bereits veröffentlicht. Nach dem Kopieren bitte prüfen und ggf. erneut veröffentlichen.\n`;
  }
  message += `\nKopiert werden nur Arbeit und Frei.`;

  if(!confirm(message)){
    if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
    return;
  }

  if(existingCount){
    const del = await sb.from("schedules")
      .delete()
      .gte("work_date",targetWeek)
      .lte("work_date",targetTo)
      .in("profile_id",peopleIds);

    if(del.error){
      if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
      alert("Fehler beim Überschreiben der Ziel-KW: " + del.error.message);
      return;
    }
  }

  const dayOffset = Math.round((parseISODateLocal(targetWeek)-parseISODateLocal(sourceWeek))/86400000);
  const payload = copyRows.map(s=>scheduleCopyPayload(s, addDaysISO(s.work_date,dayOffset)));

  const ins = await sb.from("schedules").insert(payload);
  if(ins.error){
    if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
    alert("Fehler beim Kopieren: " + ins.error.message);
    return;
  }

  if(input) input.value = targetWeek;
  updateWeekLabels();

  if(isKitchen) await loadPlanKitchen();
  else await loadPlanService();

  await loadDashboardLight();
  await loadMonth();
  await loadMinijobCenter();

  if($("copyPlanConfirm")) $("copyPlanConfirm").disabled = false;
  closeCopyPlanModal();

  const skippedInfo = skippedRows.length ? `\n${skippedRows.length} Urlaub/Krank-Eintrag/Einträge wurden ausgelassen.` : "";
  alert(`Dienstplan ${title} wurde in ${weekDisplayLabel(targetWeek)} kopiert.${skippedInfo}`);
}

async function loadPlanService(){
  const week = $("weekStartService").value || mondayISO();
  $("weekStartService").value = week;
  updateWeekLabels();
  await loadPlanFiltered("Service",week,SERVICE_DEPARTMENTS,"planGridService");
}
async function loadPlanKitchen(){
  const week = $("weekStartKitchen").value || mondayISO();
  $("weekStartKitchen").value = week;
  updateWeekLabels();
  await loadPlanFiltered("Küche",week,KITCHEN_DEPARTMENTS,"planGridKitchen");
}


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
  await updateVacationRequestCalc?.();
  await updateVacationAdminCalc?.();
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
  const kind = title==="Küche" ? "kitchen" : "service";
  if(!(await ensureEmployeeCanSeeWeek(kind,week,targetId,`Dienstplan ${title}`))) return;
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

  const editablePlan = canEditPlan(kind);

  if(!editablePlan){
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
      .filter(x=>editablePlan ? x.item : (x.item && x.item.status==="arbeit")));

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
      html+=editablePlan
        ? `<td class="${shiftClass(val)}"><input class="${shiftDisplayClass(val)}" data-profile="${p.id}" data-date="${iso}" data-id="${item?.id||""}" value="${escapeHtml(val)}" placeholder="08:00-16:00 / frei / urlaub / krank"></td>`
        : `<td>${val ? shiftPill(val) : "<span class='small'>—</span>"}</td>`;
    });
    html+="</tr>";
  });

  if(!people.length){
    html+=`<tr><td colspan="8"><span class="small">${editablePlan?`Keine einplanbaren Mitarbeiter für ${escapeHtml(title)}.`:`Keine Arbeitsschichten in dieser Woche.`}</span></td></tr>`;
  }

  html+="</tbody></table></div>";

  $(targetId).innerHTML=html;
  document.querySelectorAll(`#${targetId} input`).forEach(inp=>inp.onchange=()=>{applyShiftInputColors($(targetId));saveScheduleCell(inp)});
  setupDragAndDrop(targetId);
  applyShiftInputColors($(targetId));
}


async function saveScheduleCell(inp){
  const profileId = inp.dataset.profile;
  const targetProfile = profileById(profileId);
  const targetKind = planKindForDepartment(targetProfile.department);
  if(!canEditPlan(targetKind)) return alert("Du hast keine Berechtigung, diesen Dienstplan zu bearbeiten.");
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

  let tableHtml='<div class="grid monthDesktopGrid"><table class="monthTable"><thead><tr>'+days.map(d=>`<th>${d}</th>`).join("")+'</tr></thead><tbody><tr>';
  const total=lastDayOfMonth(month),first=weekdayMondayFirst(from);

  for(let i=0;i<first;i++)tableHtml+='<td class="monthCell"></td>';

  const mobileDays = [];
  let eventCount = 0;
  let infoCount = 0;

  for(let day=1;day<=total;day++){
    const iso=month+"-"+pad2(day);
    if(day>1&&weekdayMondayFirst(iso)===0)tableHtml+="</tr><tr>";

    const dayInfos = infoByDate[iso] ? [infoByDate[iso]] : [];
    const dayEvents = eventsByDate[iso] || [];

    if(dayInfos.length) infoCount += dayInfos.length;
    if(dayEvents.length) eventCount += dayEvents.length;

    let c=`<div class="monthDate">${fmtDate(iso)}</div>`;
    if(infoByDate[iso]){
      c+=`<div class="monthInfo">📢 ${escapeHtml(infoByDate[iso])}</div>`;
    }
    dayEvents.forEach(e=>{
      c+=`<div class="monthInfo eventMonthInfo">${escapeHtml(eventPlanLabel(e))}</div>`;
    });

    tableHtml+=`<td class="monthCell">${c}</td>`;

    if(dayInfos.length || dayEvents.length){
      mobileDays.push({iso, infos:dayInfos, events:dayEvents});
    }
  }

  for(let i=weekdayMondayFirst(to)+1;i<7;i++)tableHtml+='<td class="monthCell"></td>';
  tableHtml+="</tr></tbody></table></div>";

  const mobileHtml = `
    <div class="monthMobileList">
      <div class="monthMobileTop">
        <div>
          <h3>${escapeHtml(new Date(from+"T12:00:00").toLocaleDateString("de-DE",{month:"long",year:"numeric"}))}</h3>
          <p>Nur Tage mit Tagesinfo oder Event.</p>
        </div>
        <div class="monthMobileStats">
          <span>${eventCount} Events</span>
          <span>${infoCount} Infos</span>
        </div>
      </div>
      ${mobileDays.length ? mobileDays.map(day=>{
        const d = new Date(day.iso+"T12:00:00");
        const weekday = d.toLocaleDateString("de-DE",{weekday:"short"});
        const dateLabel = d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
        return `<div class="monthMobileCard">
          <div class="monthMobileDate">
            <span>${escapeHtml(weekday)}</span>
            <b>${escapeHtml(dateLabel)}</b>
          </div>
          <div class="monthMobileItems">
            ${day.infos.map(txt=>`<div class="monthMobileItem info">📢 ${escapeHtml(txt)}</div>`).join("")}
            ${day.events.map(e=>`<div class="monthMobileItem event">${escapeHtml(eventPlanLabel(e))}</div>`).join("")}
          </div>
        </div>`;
      }).join("") : `<div class="monthMobileEmpty">Keine Tagesinfos oder Events in diesem Monat.</div>`}
    </div>
  `;

  $("monthGrid").innerHTML=tableHtml+mobileHtml;
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
        <button type="button" class="danger" onclick="deleteDailyInfo('${i.info_date}')">Aus App entfernen</button>
      </div>`:""}
    </div>
  `).join("")||"<p>Keine Tagesinfos.</p>";
}

if($("saveTime")) $("saveTime").onclick=async()=>{
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
  if(!$("timeList")) return;
  let q=sb.from("time_entries").select("*, profiles(first_name,last_name)").order("work_date",{ascending:false}).limit(50);
  if(!isManagement()) q = q.eq("profile_id",profile.id);
  const{data}=await q;
  $("timeList").innerHTML=(data||[]).map(e=>`<div class="entry"><b>${escapeHtml(e.profiles?.first_name||"")} ${escapeHtml(e.profiles?.last_name||"")}</b><br>${fmtDate(e.work_date)}: ${String(e.start_time||"").slice(0,5)}-${String(e.end_time||"").slice(0,5)}, Pause ${e.break_minutes} Min.<br><b>${euroHours(e.hours)} Std.</b></div>`).join("")||"<p>Keine Zeiteinträge.</p>";
  await loadEmployeeOwnOverview();
}



async function syncVacationToSchedule(profileId, from, to){
  if(!profileId || !from || !to) return;
  const p = profileById(profileId);
  let d = from;
  while(d <= to){
    if(vacationCountableWeekday(p,d)){
      const existing = await sb.from("schedules").select("*").eq("profile_id",profileId).eq("work_date",d).maybeSingle();
      const payload = {profile_id:profileId,work_date:d,status:"urlaub",start_time:null,end_time:null};
      if(existing.data){
        await sb.from("schedules").update(payload).eq("id",existing.data.id);
      }else{
        await sb.from("schedules").insert(payload);
      }
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
  const from=$("vacFrom").value,to=$("vacTo").value,note=$("vacNote").value;
  if(!from||!to)return alert("Von und Bis ausfüllen.");
  if(to < from)return alert("Bis-Datum darf nicht vor Von-Datum liegen.");
  const ok = await confirmVacationCalculation(profile.id,from,to,note,"request");
  if(!ok) return;
  const{error}=await sb.from("vacation_requests").insert({profile_id:profile.id,date_from:from,date_to:to,note,status:"beantragt"});
  if(error)alert(error.message);else{
    await createNotification("Urlaub beantragt",`${profile.first_name} ${profile.last_name} hat Urlaub beantragt.`);
    $("vacNote").value="";
    await refreshVacationViews();
    await updateVacationRequestCalc();
  }
};

$("prevVacMonth").onclick=()=>{const[y,m]=($("vacMonthSelect").value||monthISO()).split("-").map(Number);$("vacMonthSelect").value=monthISO(new Date(y,m-2,1));loadVacationCalendar()};
$("nextVacMonth").onclick=()=>{const[y,m]=($("vacMonthSelect").value||monthISO()).split("-").map(Number);$("vacMonthSelect").value=monthISO(new Date(y,m,1));loadVacationCalendar()};
$("vacMonthSelect").onchange=loadVacationCalendar;
if($("vacAdminProfile")) $("vacAdminProfile").onchange=async()=>{await loadVacationOverlap();await updateVacationAdminCalc();};
if($("vacAdminFrom")) $("vacAdminFrom").onchange=async()=>{await loadVacationOverlap();await updateVacationAdminCalc();};
if($("vacAdminTo")) $("vacAdminTo").onchange=async()=>{await loadVacationOverlap();await updateVacationAdminCalc();};
if($("vacAdminNote")) $("vacAdminNote").oninput=updateVacationAdminCalc;
if($("vacFrom")) $("vacFrom").onchange=updateVacationRequestCalc;
if($("vacTo")) $("vacTo").onchange=updateVacationRequestCalc;
if($("vacNote")) $("vacNote").oninput=updateVacationRequestCalc;

$("addVacationAdmin").onclick=async()=>{
  if(!isManagement()) return;
  const profileId=$("vacAdminProfile").value, from=$("vacAdminFrom").value, to=$("vacAdminTo").value, note=$("vacAdminNote").value;
  if(!profileId||!from||!to)return alert("Mitarbeiter, Von und Bis ausfüllen.");
  if(to < from)return alert("Bis-Datum darf nicht vor Von-Datum liegen.");
  const ok = await confirmVacationCalculation(profileId,from,to,note,"admin");
  if(!ok) return;
  const{error}=await sb.from("vacation_requests").insert({
    profile_id:profileId,
    date_from:from,
    date_to:to,
    note,
    status:"genehmigt",
    decided_by:profile.id,
    decided_at:new Date().toISOString()
  });
  if(error)alert(error.message);else{
    await syncVacationToSchedule(profileId,from,to);
    $("vacAdminNote").value="";
    await createNotification("Urlaub eingetragen","Ein Urlaub wurde eingetragen.");
    await refreshVacationViews();
    await loadVacationOverlap();
    await updateVacationAdminCalc();
  }
};

async function setVacationStatus(id,status){
  if(!canManageVacation()){
    alert("Nur Geschäftsführung kann Urlaub genehmigen oder ablehnen.");
    return;
  }
  const before = await sb.from("vacation_requests").select("*").eq("id",id).single();
  const {error} = await sb.from("vacation_requests").update({status,decided_by:profile.id,decided_at:new Date().toISOString()}).eq("id",id);
  if(error){
    alert(error.message);
    return;
  }
  if(before.data){
    if(status==="genehmigt") await syncVacationToSchedule(before.data.profile_id,before.data.date_from,before.data.date_to);
    if(status==="abgelehnt") await removeVacationFromSchedule(before.data.profile_id,before.data.date_from,before.data.date_to);
  }
  await refreshVacationViews();await updateVacationAdminCalc?.();await updateVacationRequestCalc?.();
}
window.setVacationStatus=setVacationStatus;


function profileById(id){return profiles.find(p=>p.id===id)||{}}


function vacationDayValue(v, iso){
  const note = String(v.note||"").toLowerCase();
  if(note.includes("halb") || note.includes("0,5") || note.includes("0.5")) return 0.5;
  return 1;
}
function vacationDaysInRange(v, monthFrom, monthTo, p=null){
  if(p) return vacationDateRangeDaysForProfile(v,p,monthFrom,monthTo,vacationDayValue(v,v.date_from));
  const out = {};
  let d = v.date_from < monthFrom ? monthFrom : v.date_from;
  const end = v.date_to > monthTo ? monthTo : v.date_to;
  while(d <= end){
    out[d] = vacationDayValue(v,d);
    d = addDaysISO(d,1);
  }
  return out;
}

function sumVacationDaysMap(map){
  return Object.values(map||{}).reduce((sum,val)=>sum+Number(val||0),0);
}
function vacationSelectionDetails(p, from, to, note=""){
  const out = {valid:false, days:0, countedDates:[], skippedDates:[], calendarDays:0, map:{}};
  if(!p || !from || !to || to < from) return out;
  let d = from;
  const value = vacationDayValue({note},from);
  while(d <= to){
    out.calendarDays++;
    if(vacationCountableWeekday(p,d)){
      out.map[d]=value;
      out.countedDates.push(d);
      out.days += value;
    }else{
      out.skippedDates.push(d);
    }
    d = addDaysISO(d,1);
  }
  out.days = vacationRoundDays(out.days);
  out.valid = true;
  return out;
}
function vacationDatesPreview(dates, max=6){
  if(!dates || !dates.length) return "";
  const shown = dates.slice(0,max).map(fmtDate).join(", ");
  return dates.length > max ? `${shown} +${dates.length-max}` : shown;
}
async function vacationBalanceForProfile(p, year){
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [collected, requestedRes] = await Promise.all([
    collectVacationDaysForYear(year,[p.id]),
    sb.from("vacation_requests")
      .select("*")
      .eq("profile_id",p.id)
      .lte("date_from",to)
      .gte("date_to",from)
      .eq("status","beantragt")
  ]);
  if(requestedRes.error) throw new Error(requestedRes.error.message);

  const approvedMap = collected.byProfile[p.id] || {};
  const approved = vacationRoundDays(sumVacationDaysMap(approvedMap));
  let requested = 0;
  (requestedRes.data||[]).forEach(v=>{
    requested += sumVacationDaysMap(vacationDateRangeDaysForProfile(v,p,from,to,vacationDayValue(v,v.date_from)));
  });
  requested = vacationRoundDays(requested);

  const entitlement = vacationEntitlement(p, year, true);
  const rest = vacationRoundDays(entitlement - approved);
  const restIfRequestedApproved = vacationRoundDays(entitlement - approved - requested);
  return {entitlement, approved, requested, rest, restIfRequestedApproved};
}
function vacationIsWorkStatus(status){
  const s = String(status||"").trim().toLowerCase();
  if(!s) return true;
  if(s.includes("frei") || s.includes("urlaub") || s.includes("krank") || s.includes("abwes") || s.includes("sperr")) return false;
  return true;
}
function vacationScheduleLabel(s){
  const status = s.status ? String(s.status) : "Dienst";
  const time = s.start_time ? `${String(s.start_time).slice(0,5)}${s.end_time ? "–"+String(s.end_time).slice(0,5) : ""}` : "";
  return `${fmtDate(s.work_date)}${time ? " · " + time : ""}${status ? " · " + status : ""}`;
}
function vacationRiskPush(list, severity, title, text, meta={}){
  list.push({severity,title,text,meta});
}
function vacationRiskScore(checks){
  if(!Array.isArray(checks) || !checks.length) return "ok";
  if(checks.some(c=>c.severity==="danger")) return "danger";
  if(checks.some(c=>c.severity==="warn")) return "warn";
  return "info";
}
function vacationPublicCheckText(check){
  if(!check) return "";
  return `${check.title}: ${check.text}`;
}
async function safeVacationQuery(promiseLike){
  try{
    const res = await promiseLike;
    if(res?.error) return {data:[],error:res.error};
    return {data:res?.data||[],error:null};
  }catch(e){
    return {data:[],error:e};
  }
}
async function buildVacationRiskCheck(p, from, to, selected){
  const checks = [];
  if(!p?.id || !from || !to || to < from){
    return {checks,score:"ok"};
  }

  const countedDates = selected?.countedDates || [];
  const dept = String(p.department||"").trim();
  const sameDeptProfiles = profiles.filter(x=>x.id!==p.id && String(x.department||"").trim().toLowerCase()===dept.toLowerCase() && x.active!==false);
  const sameDeptIds = sameDeptProfiles.map(x=>x.id).filter(Boolean);

  const [ownScheduleRes, eventRes, infoRes] = await Promise.all([
    safeVacationQuery(sb.from("schedules").select("*").eq("profile_id",p.id).gte("work_date",from).lte("work_date",to)),
    safeVacationQuery(sb.from("events").select("*").gte("event_date",from).lte("event_date",to).order("event_date",{ascending:true})),
    safeVacationQuery(sb.from("daily_infos").select("*").gte("info_date",from).lte("info_date",to).order("info_date",{ascending:true}))
  ]);

  const ownPlanned = (ownScheduleRes.data||[]).filter(s=>vacationIsWorkStatus(s.status) && (s.start_time || s.end_time || String(s.status||"").trim()));
  if(ownPlanned.length){
    vacationRiskPush(
      checks,
      "danger",
      "Dienstplan vorhanden",
      `${escapeHtml(p.first_name||"")} ist im gewählten Zeitraum bereits ${ownPlanned.length}x eingeplant: ${ownPlanned.slice(0,5).map(vacationScheduleLabel).join("; ")}${ownPlanned.length>5 ? " ..." : ""}`,
      {count:ownPlanned.length}
    );
  }

  const importantEvents = (eventRes.data||[])
    .filter(e=>e.show_plan!==false)
    .filter(e=>countedDates.includes(e.event_date) || (e.event_date>=from && e.event_date<=to));
  if(importantEvents.length){
    vacationRiskPush(
      checks,
      "warn",
      "Event / Messe im Zeitraum",
      importantEvents.slice(0,6).map(e=>`${fmtDate(e.event_date)} · ${eventPlanLabel(e)}`).join("; ") + (importantEvents.length>6 ? " ..." : ""),
      {count:importantEvents.length}
    );
  }

  const infos = (infoRes.data||[]).filter(i=>countedDates.includes(i.info_date));
  if(infos.length){
    vacationRiskPush(
      checks,
      "info",
      "Tagesinfo vorhanden",
      infos.slice(0,5).map(i=>`${fmtDate(i.info_date)} · ${i.info_text||""}`).join("; ") + (infos.length>5 ? " ..." : ""),
      {count:infos.length}
    );
  }

  // Team-Abwesenheiten im gleichen Bereich prüfen. Für Mitarbeiter werden keine Namen ausgegeben.
  if(sameDeptIds.length){
    const [teamVacRes, teamSchedRes] = await Promise.all([
      safeVacationQuery(sb.from("vacation_requests").select("*").in("profile_id",sameDeptIds).lte("date_from",to).gte("date_to",from).in("status",["beantragt","genehmigt"])),
      safeVacationQuery(sb.from("schedules").select("*").in("profile_id",sameDeptIds).gte("work_date",from).lte("work_date",to))
    ]);

    const absencesByDate = {};
    (teamVacRes.data||[]).forEach(v=>{
      const vp = profileById(v.profile_id);
      const range = vacationDateRangeDaysForProfile(v,vp,from,to,vacationDayValue(v,v.date_from));
      Object.keys(range).forEach(iso=>{
        absencesByDate[iso] ||= [];
        absencesByDate[iso].push({profile:vp,status:v.status,source:"Urlaub"});
      });
    });

    (teamSchedRes.data||[])
      .filter(s=>String(s.status||"").toLowerCase().includes("urlaub") || String(s.status||"").toLowerCase().includes("krank") || String(s.status||"").toLowerCase().includes("frei"))
      .forEach(s=>{
        const vp = profileById(s.profile_id);
        if(!vacationCountableWeekday(vp,s.work_date)) return;
        absencesByDate[s.work_date] ||= [];
        // Duplikate pro Profil/Datum vermeiden
        if(!absencesByDate[s.work_date].some(x=>x.profile?.id===s.profile_id)){
          absencesByDate[s.work_date].push({profile:vp,status:s.status||"abwesend",source:"Dienstplan"});
        }
      });

    const criticalDays = countedDates
      .map(iso=>({iso,items:absencesByDate[iso]||[]}))
      .filter(x=>x.items.length>=1)
      .sort((a,b)=>b.items.length-a.items.length);

    if(criticalDays.length){
      const maxSameDay = Math.max(...criticalDays.map(x=>x.items.length));
      const severity = maxSameDay>=2 ? "danger" : "warn";
      const text = criticalDays.slice(0,6).map(x=>{
        const names = canViewVacationTeam()
          ? x.items.map(it=>`${it.profile?.first_name||""} ${it.profile?.last_name||""}`.trim()).filter(Boolean).join(", ")
          : `${x.items.length} weitere Person(en)`;
        return `${fmtDate(x.iso)}: ${names}`;
      }).join("; ") + (criticalDays.length>6 ? " ..." : "");
      vacationRiskPush(
        checks,
        severity,
        `Weitere Abwesenheiten in ${dept||"Bereich"}`,
        text,
        {count:criticalDays.length,max:maxSameDay}
      );
    }
  }

  if(!selected?.days || selected.days<=0){
    vacationRiskPush(checks,"warn","0 Urlaubstage berechnet","Der Zeitraum enthält nach aktueller Einstellung keine berechneten Urlaubstage.",{count:0});
  }

  return {checks,score:vacationRiskScore(checks)};
}
async function buildVacationCalculation(profileId, from, to, note=""){
  const p = profileById(profileId);
  if(!p?.id) return {ok:false,error:"Mitarbeiter nicht gefunden."};
  if(!from || !to) return {ok:false,error:"Zeitraum auswählen."};
  if(to < from) return {ok:false,error:"Bis-Datum darf nicht vor Von-Datum liegen."};

  const year = Number(String(from).slice(0,4)) || new Date().getFullYear();
  const selected = vacationSelectionDetails(p,from,to,note);
  const balance = await vacationBalanceForProfile(p,year);

  const overlapRes = await sb.from("vacation_requests")
    .select("*")
    .eq("profile_id",profileId)
    .lte("date_from",to)
    .gte("date_to",from)
    .in("status",["beantragt","genehmigt"]);
  if(overlapRes.error) throw new Error(overlapRes.error.message);

  const overlaps = (overlapRes.data||[]).map(v=>`${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)} (${v.status})`);
  const risk = await buildVacationRiskCheck(p,from,to,selected);

  return {
    ok:true,
    p,
    year,
    selected,
    balance,
    overlaps,
    checks:risk.checks,
    checkScore:risk.score,
    restAfter: vacationRoundDays(balance.rest - selected.days),
    restAfterAllPending: vacationRoundDays(balance.restIfRequestedApproved - selected.days)
  };
}
function renderVacationCalculation(targetId, calc, mode="request"){
  const el=$(targetId);
  if(!el) return;
  if(!calc || !calc.ok){
    el.className="vacCalcBox";
    el.innerHTML = escapeHtml(calc?.error || "Zeitraum auswählen.");
    return;
  }
  const selected = calc.selected;
  const b = calc.balance;
  const score = calc.checkScore || vacationRiskScore(calc.checks||[]);
  const danger = calc.restAfter < 0 || score==="danger";
  const warn = danger || calc.overlaps.length || selected.days <= 0 || score==="warn";
  el.className = `vacCalcBox ${danger ? "danger" : warn ? "warn" : "ok"}`;

  const afterLabel = mode==="admin" ? "Rest nach Eintrag" : "Rest nach Antrag";
  const skipped = selected.skippedDates.length
    ? `<div class="vacCalcLine muted">Nicht berechnet: ${selected.skippedDates.length} Tag(e) · ${escapeHtml(vacationDatesPreview(selected.skippedDates))}</div>`
    : "";
  const counted = selected.countedDates.length
    ? `<div class="vacCalcLine muted">Berechnete Tage: ${escapeHtml(vacationDatesPreview(selected.countedDates))}</div>`
    : `<div class="vacCalcLine warnText">In diesem Zeitraum wurde kein Urlaubstag berechnet.</div>`;
  const overlaps = calc.overlaps.length
    ? `<div class="vacCalcLine warnText"><b>Überschneidung:</b> ${calc.overlaps.map(escapeHtml).join("<br>")}</div>`
    : "";
  const overRest = calc.restAfter < 0
    ? `<div class="vacCalcLine dangerText"><b>Achtung:</b> Resturlaub würde um ${vacationDaysText(Math.abs(calc.restAfter))} Tag(e) überschritten.</div>`
    : "";

  const checks = (calc.checks||[]).length ? `
    <div class="vacCheckBox">
      <b>Urlaubsprüfung</b>
      ${(calc.checks||[]).map(c=>`
        <div class="vacCheckItem ${escapeHtml(c.severity||"info")}">
          <strong>${escapeHtml(c.title||"Prüfung")}</strong>
          <span>${escapeHtml(c.text||"")}</span>
        </div>
      `).join("")}
    </div>` : `
    <div class="vacCheckBox ok">
      <b>Urlaubsprüfung</b>
      <div class="vacCheckItem ok"><strong>Keine Auffälligkeiten</strong><span>Keine direkte Überschneidung, kein kritisches Event und keine weiteren Abwesenheiten erkannt.</span></div>
    </div>`;

  el.innerHTML = `
    <div class="vacCalcMain">
      <div><small>Berechnet</small><b>${vacationDaysText(selected.days)} Urlaubstag(e)</b></div>
      <div><small>Kalendertage</small><b>${selected.calendarDays}</b></div>
      <div><small>Anspruch ${calc.year}</small><b>${vacationDaysText(b.entitlement)}</b></div>
      <div><small>Genehmigt</small><b>${vacationDaysText(b.approved)}</b></div>
      <div><small>Beantragt offen</small><b>${vacationDaysText(b.requested)}</b></div>
      <div><small>${afterLabel}</small><b>${vacationDaysText(calc.restAfter)}</b></div>
    </div>
    ${counted}
    ${skipped}
    ${overlaps}
    ${overRest}
    ${checks}
    <div class="vacCalcLine muted">Hinweis: Halber Tag wird erkannt, wenn in der Notiz „halb“, „0,5“ oder „0.5“ steht.</div>
  `;
}
async function updateVacationRequestCalc(){
  if(!$("vacRequestCalc") || !profile?.id) return;
  try{
    const calc = await buildVacationCalculation(profile.id,$("vacFrom")?.value,$("vacTo")?.value,$("vacNote")?.value||"");
    renderVacationCalculation("vacRequestCalc",calc,"request");
  }catch(e){
    renderVacationCalculation("vacRequestCalc",{ok:false,error:e.message||"Berechnung nicht möglich."},"request");
  }
}
async function updateVacationAdminCalc(){
  if(!$("vacAdminCalc") || !isManagement()) return;
  try{
    const calc = await buildVacationCalculation($("vacAdminProfile")?.value,$("vacAdminFrom")?.value,$("vacAdminTo")?.value,$("vacAdminNote")?.value||"");
    renderVacationCalculation("vacAdminCalc",calc,"admin");
  }catch(e){
    renderVacationCalculation("vacAdminCalc",{ok:false,error:e.message||"Berechnung nicht möglich."},"admin");
  }
}
async function confirmVacationCalculation(profileId, from, to, note, mode){
  let calc;
  try{
    calc = await buildVacationCalculation(profileId,from,to,note||"");
  }catch(e){
    alert(e.message || "Urlaubsberechnung nicht möglich.");
    return false;
  }
  if(!calc.ok){
    alert(calc.error || "Urlaubsberechnung nicht möglich.");
    return false;
  }
  if(calc.selected.days <= 0){
    return confirm("In diesem Zeitraum wurden 0 Urlaubstage berechnet. Trotzdem speichern?");
  }
  if(calc.restAfter < 0){
    return confirm(`Der Resturlaub würde überschritten.\n\nBerechnet: ${vacationDaysText(calc.selected.days)} Tag(e)\nRest aktuell: ${vacationDaysText(calc.balance.rest)} Tag(e)\nRest danach: ${vacationDaysText(calc.restAfter)} Tag(e)\n\nTrotzdem ${mode==="admin"?"eintragen":"beantragen"}?`);
  }

  const criticalChecks = (calc.checks||[]).filter(c=>c.severity==="danger" || c.severity==="warn");
  if(criticalChecks.length){
    const text = criticalChecks.slice(0,5).map(c=>`- ${c.title}: ${c.text}`).join("\n");
    return confirm(`Urlaubsprüfung mit Hinweis:\n\n${text}${criticalChecks.length>5 ? "\n..." : ""}\n\nTrotzdem ${mode==="admin"?"eintragen":"beantragen"}?`);
  }

  return true;
}
function valueOrNull(id){
  const el=$(id);
  if(!el) return null;
  const val=String(el.value||"").trim();
  return val ? val : null;
}

function normalizeDateInput(value){
  const raw = String(value||"").trim();
  if(!raw) return null;

  let y,m,d;

  // Bereits ISO: 1980-07-06
  let iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(iso){
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  }else{
    // Deutsch: 06.07.1980 oder 6/7/1980 oder 06-07-1980
    let de = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})$/);
    if(de){
      d = Number(de[1]); m = Number(de[2]); y = Number(de[3]);
      if(y < 100) y += y > 30 ? 1900 : 2000;
    }else{
      // Schnellformat: 06071980
      let compact = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
      if(compact){
        d = Number(compact[1]); m = Number(compact[2]); y = Number(compact[3]);
      }else{
        return "__INVALID__";
      }
    }
  }

  const dt = new Date(y, m-1, d);
  if(dt.getFullYear() !== y || dt.getMonth() !== m-1 || dt.getDate() !== d) return "__INVALID__";
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function formatISODateGerman(value){
  const iso = String(value||"").slice(0,10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return value || "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}
function dateInputOrNull(id){
  const val = $(id)?.value || "";
  const iso = normalizeDateInput(val);
  return iso === "__INVALID__" ? "__INVALID__" : iso;
}

function numberOrNull(id){
  const el=$(id);
  if(!el) return null;
  const val=String(el.value||"").trim().replace(",",".");
  if(!val) return null;
  const n=Number(val);
  return Number.isFinite(n) ? n : null;
}
function numberFromProfile(p, keys, fallback=null){
  for(const key of keys){
    const n=Number(p?.[key]);
    if(Number.isFinite(n)) return n;
  }
  return fallback;
}
function vacationWorkdaysPerWeek(p){
  const n = numberFromProfile(p, ["weekly_workdays","workdays_per_week","arbeitstage_pro_woche"], null);
  if(Number.isFinite(n) && n >= 0) return n;
  return 5;
}
function vacationLegalMinimum(p){
  return vacationWorkdaysPerWeek(p) * 4;
}
function vacationBaseAnnual(p){
  const configured = numberFromProfile(p, ["annual_vacation_days","vacation_days","urlaubstage","vacation_entitlement"], null);
  const minimum = vacationLegalMinimum(p);
  if(Number.isFinite(configured) && configured > 0) return Math.max(configured, minimum);
  return minimum;
}
function vacationCarryoverDays(p, year=new Date().getFullYear()){
  const days = numberFromProfile(p, ["vacation_carryover_days","carryover_vacation_days","resturlaub_vorjahr"], 0) || 0;
  if(days <= 0) return 0;

  const targetYear = Number(p?.vacation_carryover_year || p?.carryover_year || 0);
  const requestedYear = Number(year);
  if(Number.isFinite(targetYear) && targetYear > 0 && targetYear !== requestedYear) return 0;

  const expires = p?.vacation_carryover_expires_at || p?.carryover_expires_at || "";
  if(expires){
    const expiresYear = Number(String(expires).slice(0,4));
    if(Number.isFinite(expiresYear) && requestedYear > expiresYear) return 0;
    if(requestedYear === new Date().getFullYear() && todayISO() > String(expires)) return 0;
  }

  return days;
}
function employmentFullMonthsInYear(p, year){
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const hire = p?.hire_date || p?.employment_start || p?.start_date || "";
  const term = p?.termination_date || p?.employment_end || p?.end_date || "";
  if((!hire || hire <= yearStart) && (!term || term >= yearEnd)) return 12;
  let count=0;
  for(let m=1;m<=12;m++){
    const month = `${year}-${pad2(m)}`;
    const first = `${month}-01`;
    const last = `${month}-${pad2(lastDayOfMonth(month))}`;
    const employedAtMonthStart = !hire || hire <= first;
    const employedAtMonthEnd = !term || term >= last;
    if(employedAtMonthStart && employedAtMonthEnd) count++;
  }
  return count;
}
function vacationRoundDays(n){
  return Math.round((Number(n)||0)*100)/100;
}
function vacationEntitlement(p, year=new Date().getFullYear(), includeCarryover=true){
  const base = vacationBaseAnnual(p);
  const months = employmentFullMonthsInYear(p, year);
  const annual = months >= 12 ? base : base * (months/12);
  const carry = includeCarryover ? vacationCarryoverDays(p, year) : 0;
  return vacationRoundDays(annual + carry);
}
function vacationCountableWeekday(p, iso){
  const wd = weekdayMondayFirst(iso); // 0 Mo ... 6 So
  const workdays = vacationWorkdaysPerWeek(p);
  if(workdays >= 6) return wd <= 5; // Mo-Sa
  return wd <= 4; // Standard Mo-Fr; genaue Teilzeit-Tage können später ergänzt werden.
}
function vacationDateRangeDaysForProfile(v,p,rangeFrom,rangeTo,value=1){
  const out = {};
  let d = v.date_from < rangeFrom ? rangeFrom : v.date_from;
  const end = v.date_to > rangeTo ? rangeTo : v.date_to;
  while(d <= end){
    if(vacationCountableWeekday(p,d)) out[d] = value;
    d = addDaysISO(d,1);
  }
  return out;
}
function vacationDaysText(n){
  const val = vacationRoundDays(n);
  return euroHours(val).replace(",00","");
}
function vacationAccountWarnings(p, year, rest){
  const warnings=[];
  const expires = p?.vacation_carryover_expires_at || "";
  const carry = vacationCarryoverDays(p, year);
  if(carry > 0 && !expires) warnings.push("Übertrag ohne Frist");
  if(carry > 0 && expires && expires < todayISO()) warnings.push("Übertrag abgelaufen");
  if(carry > 0 && expires && !p?.vacation_notice_sent_at) warnings.push("Hinweis auf Verfall fehlt");
  if(rest < 0) warnings.push("Resturlaub überschritten");
  return warnings;
}
async function loadVacationAccountOverview(){
  if(!$("vacationAccountOverview") || !session || !profiles.length) return;
  renderVacationRightsInfo?.();

  const currentYear = new Date().getFullYear();
  const year = Number($("vacAccountYear")?.value || currentYear);
  if($("vacAccountYear")) $("vacAccountYear").value = year;

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = vacationVisibleProfiles();
  const ids = rows.map(p=>p.id).filter(Boolean);

  if(!rows.length){
    $("vacationAccountOverview").innerHTML = `<div class="entry">Keine Mitarbeiter für deine Berechtigung gefunden.</div>`;
    return;
  }

  $("vacationAccountOverview").innerHTML = `<div class="entry">Urlaubskonto wird berechnet...</div>`;

  let vacQuery = sb.from("vacation_requests").select("*").lte("date_from",to).gte("date_to",from).in("status",["beantragt","genehmigt"]);
  let schedQuery = sb.from("schedules").select("*").gte("work_date",from).lte("work_date",to);

  if(ids.length){
    vacQuery = vacQuery.in("profile_id",ids);
    schedQuery = schedQuery.in("profile_id",ids);
  }

  const [vacRes, schedRes] = await Promise.all([vacQuery, schedQuery]);
  if(vacRes.error || schedRes.error){
    const err = vacRes.error || schedRes.error;
    $("vacationAccountOverview").innerHTML = `<div class="entry"><b>Fehler beim Berechnen:</b><br>${escapeHtml(err.message)}</div>`;
    return;
  }

  const vacations = (vacRes.data || []).filter(v=>ids.includes(v.profile_id));
  const schedules = (schedRes.data || []).filter(s=>ids.includes(s.profile_id));

  const htmlRows = rows.map(p=>{
    const approvedDays = {};
    const requestedDays = {};

    vacations.filter(v=>v.profile_id===p.id).forEach(v=>{
      const val = vacationDayValue(v,v.date_from);
      const range = vacationDateRangeDaysForProfile(v,p,from,to,val);
      Object.entries(range).forEach(([iso,dayVal])=>{
        if(v.status==="genehmigt") approvedDays[iso] = dayVal;
        if(v.status==="beantragt") requestedDays[iso] = dayVal;
      });
    });

    schedules
      .filter(s=>s.profile_id===p.id)
      .filter(s=>String(s.status||"").toLowerCase().includes("urlaub"))
      .forEach(s=>{
        const iso=s.work_date;
        if(!iso || iso<from || iso>to) return;
        if(vacationCountableWeekday(p,iso) && !approvedDays[iso]) approvedDays[iso]=1;
      });

    const base = vacationBaseAnnual(p);
    const months = employmentFullMonthsInYear(p, year);
    const prorated = vacationRoundDays(months>=12 ? base : base*(months/12));
    const carry = vacationCarryoverDays(p, year);
    const entitlement = vacationEntitlement(p, year, true);
    const approved = Object.values(approvedDays).reduce((a,b)=>a+Number(b||0),0);
    const requested = Object.values(requestedDays).reduce((a,b)=>a+Number(b||0),0);
    const rest = vacationRoundDays(entitlement - approved);
    const warnings = vacationAccountWarnings(p, year, rest);
    const cls = rest < 0 ? "danger" : warnings.length ? "warn" : "ok";

    return `
      <div class="vacAccountRow ${cls}">
        <div class="vacAccountPerson">
          <b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b>
          <small>${escapeHtml(p.department||"")} · ${vacationDaysText(vacationWorkdaysPerWeek(p))} Arbeitstage/Woche</small>
        </div>
        <div class="vacAccountStats">
          <span><small>Basis</small><b>${vacationDaysText(base)}</b></span>
          <span><small>Anspruch ${year}</small><b>${vacationDaysText(prorated)}</b></span>
          <span><small>Übertrag</small><b>${vacationDaysText(carry)}</b></span>
          <span><small>Genehmigt</small><b>${vacationDaysText(approved)}</b></span>
          <span><small>Beantragt</small><b>${vacationDaysText(requested)}</b></span>
          <span><small>Rest</small><b>${vacationDaysText(rest)}</b></span>
        </div>
        ${warnings.length ? `<div class="vacAccountWarnings">${warnings.map(w=>`<span>${escapeHtml(w)}</span>`).join("")}</div>` : ""}
      </div>`;
  }).join("");

  $("vacationAccountOverview").innerHTML = `
    <div class="vacAccountIntro">
      <b>Berechnung ${year}</b>
      <span>Vorbereitung: Fehlende Urlaubsdaten blockieren nichts. Ohne gepflegte Werte rechnet die App vorläufig mit Standardwerten.</span>
    </div>
    <div class="vacAccountList">${htmlRows}</div>
  `;
}
let vacationYearClosePreviewRows = [];

function defaultCarryoverExpiryForYear(targetYear){
  return `${targetYear}-03-31`;
}
function vacationClosingInputId(prefix, id){
  return `${prefix}_${String(id||"").replace(/[^a-zA-Z0-9_-]/g,"_")}`;
}
async function buildVacationYearCloseRows(year){
  if(!isManagement()) return [];
  const targetYear = Number($("vacCloseTargetYear")?.value || (Number(year)+1));
  const ids = alphaProfiles().map(p=>p.id).filter(Boolean);
  if(!ids.length) return [];

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [yearData, requestedRes] = await Promise.all([
    collectVacationDaysForYear(year,ids),
    sb.from("vacation_requests")
      .select("*")
      .lte("date_from",to)
      .gte("date_to",from)
      .eq("status","beantragt")
      .in("profile_id",ids)
  ]);
  if(requestedRes.error) throw new Error(requestedRes.error.message);

  const requestedByProfile = {};
  (requestedRes.data||[]).forEach(v=>{
    const p=profileById(v.profile_id);
    requestedByProfile[v.profile_id] ||= 0;
    requestedByProfile[v.profile_id] += sumVacationDaysMap(vacationDateRangeDaysForProfile(v,p,from,to,vacationDayValue(v,v.date_from)));
  });

  return alphaProfiles().map(p=>{
    const workdays = vacationWorkdaysPerWeek(p);
    const legalMin = vacationLegalMinimum(p);
    const base = vacationBaseAnnual(p);
    const months = employmentFullMonthsInYear(p, year);
    const prorated = vacationRoundDays(months>=12 ? base : base*(months/12));
    const carryFromPrevious = vacationCarryoverDays(p, year);
    const totalEntitlement = vacationEntitlement(p, year, true);
    const approved = vacationRoundDays(sumVacationDaysMap(yearData.byProfile[p.id] || {}));
    const requested = vacationRoundDays(requestedByProfile[p.id] || 0);
    const remaining = vacationRoundDays(totalEntitlement - approved);
    const recommendedCarryover = Math.max(0, remaining);
    const warnings = [];
    if(requested > 0) warnings.push("offene Anträge vorhanden");
    if(remaining < 0) warnings.push("Resturlaub negativ");
    if(recommendedCarryover > 0 && !$("vacCloseNoticeSentAt")?.value) warnings.push("Hinweisdatum fehlt");
    return {
      profile_id:p.id,
      p,
      year:Number(year),
      target_year:targetYear,
      weekly_workdays:workdays,
      legal_minimum:vacationRoundDays(legalMin),
      annual_entitlement:vacationRoundDays(prorated),
      carryover_from_previous:vacationRoundDays(carryFromPrevious),
      total_entitlement:vacationRoundDays(totalEntitlement),
      approved_days:approved,
      requested_days:requested,
      remaining_days:remaining,
      recommended_carryover:vacationRoundDays(recommendedCarryover),
      warnings
    };
  });
}
function renderVacationYearClosePreview(rows){
  const el=$("vacYearCloseGrid");
  if(!el) return;
  vacationYearClosePreviewRows = rows || [];

  if(!vacationYearClosePreviewRows.length){
    el.innerHTML = `<div class="entry">Keine Mitarbeiter gefunden.</div>`;
    return;
  }

  const totalRest = vacationRoundDays(vacationYearClosePreviewRows.reduce((s,r)=>s+Math.max(0,Number(r.remaining_days||0)),0));
  const openRequests = vacationYearClosePreviewRows.filter(r=>Number(r.requested_days||0)>0).length;
  const targetYear = Number($("vacCloseTargetYear")?.value || (Number($("vacCloseYear")?.value||new Date().getFullYear())+1));

  const rowsHtml = vacationYearClosePreviewRows.map(r=>{
    const carryId = vacationClosingInputId("vacCarry", r.profile_id);
    const includeId = vacationClosingInputId("vacInclude", r.profile_id);
    const cls = r.remaining_days < 0 ? "danger" : r.warnings.length ? "warn" : r.recommended_carryover > 0 ? "ok" : "";
    return `
      <div class="vacCloseRow ${cls}">
        <label class="vacCloseInclude">
          <input id="${includeId}" type="checkbox" ${r.recommended_carryover>0 ? "checked" : ""}>
          <span></span>
        </label>
        <div class="vacClosePerson">
          <b>${escapeHtml(r.p.first_name||"")} ${escapeHtml(r.p.last_name||"")}</b>
          <small>${escapeHtml(r.p.department||"")} · ${vacationDaysText(r.weekly_workdays)} AT/Woche · gesetzl. Minimum ${vacationDaysText(r.legal_minimum)}</small>
        </div>
        <div class="vacCloseStats">
          <span><small>Anspruch ${r.year}</small><b>${vacationDaysText(r.annual_entitlement)}</b></span>
          <span><small>Übertrag alt</small><b>${vacationDaysText(r.carryover_from_previous)}</b></span>
          <span><small>Gesamt</small><b>${vacationDaysText(r.total_entitlement)}</b></span>
          <span><small>Genehmigt</small><b>${vacationDaysText(r.approved_days)}</b></span>
          <span><small>Offen</small><b>${vacationDaysText(r.requested_days)}</b></span>
          <span><small>Rest</small><b>${vacationDaysText(r.remaining_days)}</b></span>
        </div>
        <div class="vacCloseCarry">
          <label>Übertrag nach ${targetYear}</label>
          <input id="${carryId}" type="number" min="0" step="0.5" value="${r.recommended_carryover}">
        </div>
        ${r.warnings.length ? `<div class="vacCloseWarnings">${r.warnings.map(w=>`<em>${escapeHtml(w)}</em>`).join("")}</div>` : ""}
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="vacCloseSummary">
      <span><small>Mitarbeiter</small><b>${vacationYearClosePreviewRows.length}</b></span>
      <span><small>Empfohlener Übertrag</small><b>${vacationDaysText(totalRest)}</b></span>
      <span><small>Offene Anträge</small><b>${openRequests}</b></span>
      <span><small>Zieljahr</small><b>${targetYear}</b></span>
    </div>
    <div class="vacCloseRows">${rowsHtml}</div>
  `;
}
async function loadVacationYearClosePreview(){
  if(!$("vacYearCloseGrid") || !isManagement()) return;
  const year = Number($("vacCloseYear")?.value || new Date().getFullYear());
  const targetYear = Number($("vacCloseTargetYear")?.value || (year+1));
  if($("vacCloseYear")) $("vacCloseYear").value = year;
  if($("vacCloseTargetYear")) $("vacCloseTargetYear").value = targetYear;
  if($("vacCloseExpires")) $("vacCloseExpires").value ||= defaultCarryoverExpiryForYear(targetYear);

  $("vacYearCloseGrid").innerHTML = `<div class="entry">Jahresabschluss wird berechnet...</div>`;
  try{
    const rows = await buildVacationYearCloseRows(year);
    renderVacationYearClosePreview(rows);
  }catch(e){
    $("vacYearCloseGrid").innerHTML = `<div class="entry"><b>Fehler beim Jahresabschluss:</b><br>${escapeHtml(e.message||"Unbekannter Fehler")}</div>`;
  }
}
function readVacationYearCloseRowsFromInputs(){
  return (vacationYearClosePreviewRows||[]).map(r=>{
    const carryEl = $(vacationClosingInputId("vacCarry", r.profile_id));
    const includeEl = $(vacationClosingInputId("vacInclude", r.profile_id));
    const carry = Math.max(0, Number(String(carryEl?.value||"0").replace(",",".")) || 0);
    return {...r, carried_over_days: includeEl?.checked ? vacationRoundDays(carry) : 0};
  });
}
async function applyVacationYearClose(){
  if(!isManagement()) return alert("Nur Geschäftsführung kann den Jahresabschluss durchführen.");
  if(!vacationYearClosePreviewRows.length) await loadVacationYearClosePreview();

  const rows = readVacationYearCloseRowsFromInputs();
  const year = Number($("vacCloseYear")?.value || new Date().getFullYear());
  const targetYear = Number($("vacCloseTargetYear")?.value || (year+1));
  const expires = $("vacCloseExpires")?.value || defaultCarryoverExpiryForYear(targetYear);
  const reason = $("vacCloseReason")?.value || "Jahresabschluss";
  const notice = $("vacCloseNoticeSentAt")?.value || null;
  const note = $("vacCloseNote")?.value || null;
  const totalCarry = vacationRoundDays(rows.reduce((s,r)=>s+Number(r.carried_over_days||0),0));
  const withOpen = rows.filter(r=>Number(r.requested_days||0)>0).length;

  let msg = `Jahresabschluss ${year} durchführen?\n\nÜbertrag nach ${targetYear}: ${vacationDaysText(totalCarry)} Tag(e)\nGültig bis: ${fmtDate(expires)}\nMitarbeiter: ${rows.length}`;
  if(withOpen) msg += `\n\nAchtung: ${withOpen} Mitarbeiter haben noch offene Urlaubsanträge.`;
  if(!confirm(msg)) return;

  $("vacYearCloseGrid").insertAdjacentHTML("afterbegin", `<div id="vacCloseProgress" class="entry">Jahresabschluss wird gespeichert...</div>`);

  const historyRows = rows.map(r=>({
    profile_id:r.profile_id,
    vacation_year:year,
    target_year:targetYear,
    annual_entitlement:r.annual_entitlement,
    carryover_from_previous:r.carryover_from_previous,
    total_entitlement:r.total_entitlement,
    approved_days:r.approved_days,
    requested_days:r.requested_days,
    remaining_days:r.remaining_days,
    carried_over_days:r.carried_over_days,
    expires_at:expires,
    reason,
    notice_sent_at:notice,
    note,
    closed_by:profile?.id || null,
    closed_at:new Date().toISOString()
  }));

  const hist = await sb.from("vacation_year_closings").upsert(historyRows,{onConflict:"profile_id,vacation_year"});
  if(hist.error){
    alert("Jahresabschluss konnte nicht dokumentiert werden: " + hist.error.message + "\\n\\nBitte prüfen, ob das SQL für v6.0.41 ausgeführt wurde.");
    $("vacCloseProgress")?.remove();
    return;
  }

  for(const r of rows){
    const payload = {
      vacation_carryover_days:r.carried_over_days,
      vacation_carryover_year:targetYear,
      vacation_carryover_expires_at:expires,
      vacation_carryover_reason:reason,
      vacation_notice_sent_at:notice
    };
    const upd = await sb.from("profiles").update(payload).eq("id",r.profile_id);
    if(upd.error){
      alert(`Übertrag für ${r.p.first_name} ${r.p.last_name} konnte nicht gespeichert werden: ${upd.error.message}`);
      $("vacCloseProgress")?.remove();
      return;
    }
  }

  await createNotification("Urlaub Jahresabschluss",`Jahresabschluss ${year} wurde durchgeführt. Übertrag nach ${targetYear}: ${vacationDaysText(totalCarry)} Tag(e).`);
  $("vacCloseProgress")?.remove();
  alert("Jahresabschluss gespeichert und Überträge aktualisiert.");
  await loadProfiles();
  await loadVacationAccountOverview();
  await loadVacationYearOverview();
  await loadVacationYearClosePreview?.();
  await loadVacationYearClosePreview();
}
function setupVacationYearClose(){
  if($("vacCloseYear")) $("vacCloseYear").value ||= new Date().getFullYear();
  if($("vacCloseTargetYear")) $("vacCloseTargetYear").value ||= Number($("vacCloseYear")?.value || new Date().getFullYear()) + 1;
  if($("vacCloseExpires")) $("vacCloseExpires").value ||= defaultCarryoverExpiryForYear(Number($("vacCloseTargetYear")?.value || new Date().getFullYear()+1));
  if($("calcVacYearClose")) $("calcVacYearClose").onclick = loadVacationYearClosePreview;
  if($("applyVacYearClose")) $("applyVacYearClose").onclick = applyVacationYearClose;
  if($("vacCloseYear")) $("vacCloseYear").onchange = ()=>{
    const y = Number($("vacCloseYear").value || new Date().getFullYear());
    if($("vacCloseTargetYear")) $("vacCloseTargetYear").value = y+1;
    if($("vacCloseExpires")) $("vacCloseExpires").value = defaultCarryoverExpiryForYear(y+1);
    loadVacationYearClosePreview();
  };
  if($("vacCloseTargetYear")) $("vacCloseTargetYear").onchange = ()=>{
    const y = Number($("vacCloseTargetYear").value || new Date().getFullYear()+1);
    if($("vacCloseExpires")) $("vacCloseExpires").value = defaultCarryoverExpiryForYear(y);
    loadVacationYearClosePreview();
  };
  ["vacCloseExpires","vacCloseNoticeSentAt","vacCloseReason"].forEach(id=>{
    if($(id)) $(id).onchange = loadVacationYearClosePreview;
  });
}
function setupVacationAccountOverview(){
  if($("vacAccountYear")) $("vacAccountYear").value ||= new Date().getFullYear();
  if($("refreshVacationAccount")) $("refreshVacationAccount").onclick = loadVacationAccountOverview;
  if($("vacAccountYear")) $("vacAccountYear").onchange = loadVacationAccountOverview;
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
  if(!$("vacPlannerGrid") || !canViewVacationTeam() || !profiles.length) return;

  const month = $("vacPlannerMonth")?.value || monthISO();
  if($("vacPlannerMonth")) $("vacPlannerMonth").value = month;

  const from = firstOfMonthISO(month);
  const to = month + "-" + pad2(lastDayOfMonth(month));
  const year = Number(month.slice(0,4)) || new Date().getFullYear();
  const today = todayISO();
  const rows = vacationVisibleProfiles();
  const ids = rows.map(p=>p.id).filter(Boolean);

  $("vacPlannerGrid").innerHTML = `<div class="entry">Urlaub wird berechnet...</div>`;

  if(!ids.length){
    $("vacPlannerGrid").innerHTML = `<div class="entry">Keine Mitarbeiter für deine Berechtigung gefunden.</div>`;
    return;
  }

  let vacQuery = sb.from("vacation_requests")
    .select("*")
    .lte("date_from",to)
    .gte("date_to",from)
    .in("status",["beantragt","genehmigt"])
    .in("profile_id",ids);

  let scheduleQuery = sb.from("schedules")
    .select("*")
    .gte("work_date",from)
    .lte("work_date",to)
    .in("profile_id",ids);

  const [vacRes, scheduleRes, yearData] = await Promise.all([
    vacQuery,
    scheduleQuery,
    collectVacationDaysForYear(year,ids)
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

  const requestsByProfile = {};
  vacationRequests.forEach(v=>{
    requestsByProfile[v.profile_id] ||= [];
    requestsByProfile[v.profile_id].push(v);
  });

  const dayCount = lastDayOfMonth(month);
  let mobileHtml = `<div class="vacPlannerRoleHint">${isKitchenLead()&&!isManagement() ? "Küchenleitung sieht hier nur Küche. Genehmigung bleibt Geschäftsführung." : "Geschäftsführung sieht alle Mitarbeiter."}</div><div class="vacMobileCards">`;
  let html = `<div class="vacPlannerScroll"><table class="vacPlannerTable"><thead>`;
  html += `<tr><th class="vacNameHead">Mitarbeiter</th>`;

  for(let day=1; day<=dayCount; day++){
    const iso = month + "-" + pad2(day);
    const wd = days[weekdayMondayFirst(iso)];
    const cls = (weekdayMondayFirst(iso) >= 5 ? "weekend" : "") + (iso===today ? " today" : "");
    html += `<th class="vacDayHead ${cls}"><span>${wd}</span><b>${day}</b></th>`;
  }

  html += `<th class="vacSumHead">Anspruch</th><th class="vacTakenHead">Monat</th><th class="vacRestHead">Rest Jahr</th></tr></thead><tbody>`;

  rows.forEach(p=>{
    const dayMap = {};

    (requestsByProfile[p.id] || []).forEach(v=>{
      const range = vacationDateRangeDaysForProfile(v,p,from,to,vacationDayValue(v,v.date_from));
      Object.entries(range).forEach(([iso,val])=>{
        dayMap[iso] = {value:val,status:v.status,source:"urlaubsliste",note:v.note||"",id:v.id};
      });
    });

    scheduleVacations.filter(s=>s.profile_id===p.id).forEach(s=>{
      const iso = s.work_date;
      if(!iso || iso < from || iso > to) return;
      if(!vacationCountableWeekday(p,iso)) return;
      if(!dayMap[iso] || dayMap[iso].status==="beantragt"){
        dayMap[iso] = {value:1,status:"dienstplan",source:"dienstplan",note:"Direkt im Dienstplan als Urlaub eingetragen",id:s.id};
      }
    });

    const entitlement = vacationEntitlement(p, year, true);
    const takenYear = sumVacationDaysMap(yearData.byProfile[p.id] || {});
    const takenMonth = Object.values(dayMap)
      .filter(x => x.status === "genehmigt" || x.status === "dienstplan")
      .reduce((sum,x) => sum + Number(x.value || 0), 0);
    const rest = vacationRoundDays(entitlement - takenYear);

    const vacDays = vacationRangeSummaries(dayMap);

    mobileHtml += `
      <div class="vacMobileCard ${takenMonth>0 ? "hasVacation" : ""}">
        <div class="vacMobileHead">
          <div><b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br><small>${escapeHtml(p.department||"")}</small></div>
          <strong>${takenMonth > 0 ? vacationDaysText(takenMonth) + " im Monat" : "Kein Urlaub"}</strong>
        </div>
        <div class="vacMobileStats">
          <span><small>Anspruch</small><b>${vacationDaysText(entitlement)}</b></span>
          <span><small>Genommen Jahr</small><b>${vacationDaysText(takenYear)}</b></span>
          <span><small>Rest Jahr</small><b>${vacationDaysText(rest)}</b></span>
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

    html += `<td class="vacSumCell">${vacationDaysText(entitlement)}</td>`;
    html += `<td class="vacTakenCell">${vacationDaysText(takenMonth)}</td>`;
    html += `<td class="vacRestCell">${vacationDaysText(rest)}</td></tr>`;
  });

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
  renderVacationRightsInfo?.();
  await loadVacations();
  await loadVacationCalendar();
  await loadVacationPlanner();
  await loadVacationAccountOverview();
  await loadVacationYearOverview();
  await loadPlanService();
  await loadPlanKitchen();
  await loadMonth();
}

async function loadVacations(){
  if(!$("vacList") || !session || !profiles.length) return;
  renderVacationRightsInfo?.();

  const visible = vacationVisibleProfiles();
  const ids = visible.map(p=>p.id).filter(Boolean);

  if(!ids.length){
    $("vacList").innerHTML = `<div class="entry">Keine Urlaubsanträge für deine Berechtigung vorhanden.</div>`;
    return;
  }

  let q=sb.from("vacation_requests").select("*").order("date_from",{ascending:false}).in("profile_id",ids);

  const{data,error}=await q;
  if(error){
    $("vacList").innerHTML=`<div class="entry"><b>Fehler beim Laden der Urlaubsliste:</b><br>${escapeHtml(error.message)}</div>`;
    return;
  }

  $("vacList").innerHTML=(data||[]).filter(v=>ids.includes(v.profile_id)).map(v=>{
    const p=profileById(v.profile_id);
    const year = Number(String(v.date_from||"").slice(0,4)) || new Date().getFullYear();
    const daysMap = vacationDateRangeDaysForProfile(v,p,`${year}-01-01`,`${year}-12-31`,vacationDayValue(v,v.date_from));
    const calcDays = vacationRoundDays(sumVacationDaysMap(daysMap));
    const statusLabel = v.status==="beantragt" ? "Offen" : v.status;
    return `<div class="entry vacationEntryRole">
      <b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b> ${deptBadge(p.department)}
      <br>${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)}
      <br>Berechnet: <b>${vacationDaysText(calcDays)} Urlaubstag(e)</b>
      <br>Status: <b>${escapeHtml(statusLabel)}</b>
      <br>${escapeHtml(v.note||"")}
      ${canManageVacation()&&v.status==="beantragt"?`<br><button class="ok" onclick="setVacationStatus('${v.id}','genehmigt')">Genehmigen</button> <button class="danger" onclick="setVacationStatus('${v.id}','abgelehnt')">Ablehnen</button>`:""}
      ${isKitchenLead()&&!canManageVacation()?`<br><small class="vacReadOnlyNote">Küchenleitung: Nur Ansicht. Finale Entscheidung durch Geschäftsführung.</small>`:""}
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
  if(!isManagement() || !$("vacOverlapInfo")) return;
  const from=$("vacAdminFrom").value, to=$("vacAdminTo").value, profileId=$("vacAdminProfile")?.value;
  if(!from||!to){$("vacOverlapInfo").innerHTML="Zeitraum auswählen.";return}
  let query = sb.from("vacation_requests").select("*").lte("date_from",to).gte("date_to",from).in("status",["beantragt","genehmigt"]);
  if(profileId) query = query.eq("profile_id",profileId);
  const{data,error}=await query;
  if(error){
    $("vacOverlapInfo").innerHTML=`Fehler: ${escapeHtml(error.message)}`;
    return;
  }
  const rows=(data||[]).map(v=>{
    const p=profileById(v.profile_id);
    const y = Number(String(v.date_from||"").slice(0,4)) || new Date().getFullYear();
    const days = sumVacationDaysMap(vacationDateRangeDaysForProfile(v,p,`${y}-01-01`,`${y}-12-31`,vacationDayValue(v,v.date_from)));
    return `${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} – ${fmtDate(v.date_from)} bis ${fmtDate(v.date_to)} · ${vacationDaysText(days)} Tag(e) (${escapeHtml(v.status)})`;
  });
  $("vacOverlapInfo").innerHTML=rows.length?`<b>${rows.length} vorhandene Urlaubsüberschneidung(en):</b><br>${rows.join("<br>")}`:"Keine vorhandenen Urlaubsüberschneidungen im gewählten Zeitraum.";
}

$("saveStaff").onclick=async()=>{
  if(!isManagement()) return alert("Nur Geschäftsführung kann Mitarbeiter verwalten.");
  const id=$("editingStaffId").value,first=$("staffFirstName").value.trim(),last=$("staffLastName").value.trim(),email=$("staffEmail").value.trim(),phone=$("staffPhone").value.trim(),role=$("staffRole").value,department=$("staffDepartment").value,plannableValue=$("staffPlannable").checked;
  if(!first||!last||!email)return alert("Vorname, Nachname und E-Mail sind Pflicht.");
  if(!id&&plannable().length>=MAX_EMPLOYEES&&plannableValue)return alert("Maximal 20 einplanbare Mitarbeiter erreicht.");
  const contract_type=$("staffContractType")?$("staffContractType").value:"minijob",hourly_rate=$("staffHourlyRate")?Number($("staffHourlyRate").value||0):0;
  const birthdayValue = dateInputOrNull("staffBirthday");
  if(birthdayValue==="__INVALID__") return alert("Geburtsdatum bitte im Format TT.MM.JJJJ eingeben, z. B. 06.07.1980.");
  const payload={
    first_name:first,
    last_name:last,
    email,
    phone,
    role,
    department:department,
    plannable:plannableValue,
    contract_type,
    hourly_rate,
    active:true,
    birthday:birthdayValue,
    hire_date:valueOrNull("staffHireDate"),
    termination_date:valueOrNull("staffTerminationDate"),
    weekly_workdays:numberOrNull("staffWeeklyWorkdays"),
    annual_vacation_days:numberOrNull("staffAnnualVacationDays"),
    vacation_carryover_days:numberOrNull("staffCarryoverDays"),
    vacation_carryover_expires_at:valueOrNull("staffCarryoverExpires"),
    vacation_carryover_reason:valueOrNull("staffCarryoverReason"),
    vacation_notice_sent_at:valueOrNull("staffVacationNoticeSentAt")
  };
  const res=id?await sb.from("profiles").update(payload).eq("id",id):await sb.from("profiles").insert(payload);
  if(res.error)alert(res.error.message);else{clearStaffForm();await loadProfiles();await loadPlanService();await loadPlanKitchen();await loadMonth();await loadVacationAccountOverview?.();}
};
$("clearStaff").onclick=clearStaffForm;
function clearStaffForm(){
  ["editingStaffId","staffFirstName","staffLastName","staffEmail","staffPhone","staffBirthday","staffHireDate","staffTerminationDate","staffWeeklyWorkdays","staffAnnualVacationDays","staffCarryoverDays","staffCarryoverExpires","staffVacationNoticeSentAt","staffCarryoverReason"].forEach(id=>{if($(id))$(id).value=""});
  $("staffRole").value="employee";
  $("staffDepartment").value="Service";
  if($("staffContractType"))$("staffContractType").value="minijob";
  if($("staffHourlyRate"))$("staffHourlyRate").value="";
  $("staffPlannable").checked=true;
}
function editStaff(id){
  const p=profiles.find(x=>x.id===id);
  $("editingStaffId").value=p.id;
  $("staffFirstName").value=p.first_name||"";
  $("staffLastName").value=p.last_name||"";
  $("staffEmail").value=p.email||"";
  $("staffPhone").value=p.phone||"";
  $("staffRole").value=p.role==="admin"?"management":p.role;
  $("staffDepartment").value=p.department||"Service";
  $("staffPlannable").checked=p.plannable===true;
  if($("staffContractType"))$("staffContractType").value=p.contract_type||"minijob";
  if($("staffHourlyRate"))$("staffHourlyRate").value=p.hourly_rate??"";
  if($("staffBirthday"))$("staffBirthday").value=formatISODateGerman(p.birthday||"");
  if($("staffHireDate"))$("staffHireDate").value=p.hire_date||"";
  if($("staffTerminationDate"))$("staffTerminationDate").value=p.termination_date||"";
  if($("staffWeeklyWorkdays"))$("staffWeeklyWorkdays").value=p.weekly_workdays??"";
  if($("staffAnnualVacationDays"))$("staffAnnualVacationDays").value=p.annual_vacation_days??"";
  if($("staffCarryoverDays"))$("staffCarryoverDays").value=p.vacation_carryover_days??"";
  if($("staffCarryoverExpires"))$("staffCarryoverExpires").value=p.vacation_carryover_expires_at||"";
  if($("staffCarryoverReason"))$("staffCarryoverReason").value=p.vacation_carryover_reason||"";
  if($("staffVacationNoticeSentAt"))$("staffVacationNoticeSentAt").value=p.vacation_notice_sent_at||"";
}
async function deactivateStaff(id){
  if(!isManagement()) return;
  if(!confirm("Mitarbeiter deaktivieren?"))return;
  await sb.from("profiles").update({active:false}).eq("id",id);
  await loadProfiles();await loadPlanService();await loadPlanKitchen();await loadMonth();
}

async function deleteStaff(id){
  if(!isManagement()) return;
  if(id===profile?.id) return alert("Du kannst deinen eigenen Zugang nicht entfernen.");

  const p = profiles.find(x=>x.id===id);
  const name = `${p?.first_name||""} ${p?.last_name||""}`.trim() || "diesen Mitarbeiter";
  const oldEmail = p?.email || "";

  const sure = confirm(
    `Mitarbeiter wirklich aus der App entfernen?\n\n`+
    `${name}\n${oldEmail}\n\n`+
    `Der Mitarbeiter wird aus der App entfernt und ist nicht mehr einplanbar.\n`+
    `Bestehende Dienstplan-Einträge werden gelöscht.\n\n`+
    `Fortfahren?`
  );
  if(!sure) return;

  const {data,error} = await sb.rpc("remove_staff_from_app",{target_profile_id:id});

  if(error){
    alert(
      "Mitarbeiter konnte noch nicht entfernt werden.\n\n"+
      "Bitte einmalig die SQL-Datei aus v6.0.53 in Supabase ausführen:\n"+
      "supabase-mitarbeiter-entfernen-rpc-v6053.sql\n\n"+
      "Danach funktioniert der Button direkt in der App.\n\n"+
      "Fehler: " + error.message
    );
    return;
  }

  profiles = profiles.filter(x=>x.id!==id);
  schedules = (typeof schedules!=="undefined" && Array.isArray(schedules)) ? schedules.filter(x=>x.profile_id!==id) : schedules;

  clearStaffForm();
  renderStaff();

  await loadProfiles();
  await loadPlanService();
  await loadPlanKitchen();
  await loadMonth();
  await loadDashboardLight?.();
  await loadMinijobCenter?.();
  await loadVacationAccountOverview?.();
  await loadTimeClock?.();

  const mode = data?.mode || "entfernt";
  alert(`${name} wurde aus der App entfernt.\n\nStatus: ${mode}\n\nEr ist nicht mehr sichtbar und nicht mehr einplanbar.`);
}

window.editStaff=editStaff;window.deactivateStaff=deactivateStaff;window.deleteStaff=deleteStaff;

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
  $("staffList").innerHTML=profiles.filter(p=>!isRemovedProfile(p)).map(p=>`<div class="entry"><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><br>${escapeHtml(p.email||"")}<br>${escapeHtml(p.phone||"")}<br>Rolle: ${p.role==="management"||p.role==="admin"?"Geschäftsführung":"Mitarbeiter"}<br>Bereich: ${deptBadge(p.department)}<br>Einplanen: ${p.plannable?"Ja":"Nein"}<br>Vertragsart: ${escapeHtml(p.contract_type||"—")}<br>Stundenlohn: ${p.hourly_rate?Number(p.hourly_rate).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €":"—"}<br>Reihenfolge: ${p.sort_order??"—"}<div class="staffActions"><button class="secondary" onclick="editStaff('${p.id}')">Bearbeiten</button> <button class="inviteBtn" onclick="sendStaffInvite('${p.id}')">✉️ Einladung senden</button>${p.id!==profile.id?`<button class="danger" onclick="deactivateStaff('${p.id}')">Deaktivieren</button><button class="danger deleteStaffBtn" onclick="deleteStaff('${p.id}')">Aus App entfernen</button>`:""}</div></div>`).join("");
}

if($("loadMinijobCenter")) $("loadMinijobCenter").onclick=loadMinijobCenter;
if($("exportMinijobCsv")) $("exportMinijobCsv").onclick=exportMinijobCsv;
if($("loadSummary")) $("loadSummary").onclick=loadSummary;
if($("exportCsv")) $("exportCsv").onclick=()=>{
  if(!lastSummaryRows.length)return alert("Bitte zuerst Auswertung laden.");
  const rows=[["Mitarbeiter","Stunden","Einträge"],...lastSummaryRows.map(r=>[r.name,euroHours(r.hours),r.count])];
  const csv=rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(";")).join("\\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="stunden-auswertung.csv";a.click()
};
async function loadSummary(){
  if(!$("summaryList")) return;
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
async function createNotification(title,body){if(isManagement()||isKitchenLead())await sb.from("notifications").insert({title,body,created_by:profile.id})}





const CLOCK_ALLOWED_IPV4S=["84.181.139.221"];
const CLOCK_ALLOWED_IPV6_PREFIXES=["2003:ee:d737:2300:"];
let clockNetworkState={checked:false,allowed:false,ip:"",reason:"Noch nicht geprüft"};

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


function setupPasswordUpdate(){
  const saveBtn = $("updatePasswordBtn");
  const cancelBtn = $("cancelPasswordUpdateBtn");

  if(saveBtn){
    saveBtn.onclick = async()=>{
      const p1 = $("newPassword")?.value || "";
      const p2 = $("newPasswordRepeat")?.value || "";

      if(!p1 || !p2) return alert("Bitte neues Passwort zweimal eingeben.");
      if(p1.length < 6) return alert("Das Passwort muss mindestens 6 Zeichen haben.");
      if(p1 !== p2) return alert("Die Passwörter stimmen nicht überein.");

      const {error} = await sb.auth.updateUser({password:p1});
      if(error){
        alert("Passwort konnte nicht gespeichert werden: " + error.message);
        return;
      }

      alert("Passwort wurde gespeichert. Bitte melde dich jetzt neu an.");
      passwordRecoveryMode=false;
      $("newPassword").value="";
      $("newPasswordRepeat").value="";
      window.history.replaceState({},document.title,window.location.origin + window.location.pathname);
      await sb.auth.signOut();
      session=null;
      profile=null;
      renderAuth();
    };
  }

  if(cancelBtn){
    cancelBtn.onclick = async()=>{
      passwordRecoveryMode=false;
      window.history.replaceState({},document.title,window.location.origin + window.location.pathname);
      if(sb?.auth) await sb.auth.signOut();
      session=null;
      profile=null;
      renderAuth();
    };
  }
}

function setupPasswordReset(){
  const btn = $("resetPasswordBtn");
  if(!btn) return;

  btn.onclick = async () => {
    if(!checkConfig()) return;
    if(!sb) sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY,{auth:{detectSessionInUrl:true}});

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

    alert("Passwort-Reset wurde gesendet. Bitte öffne den Link in der Mail. Danach kannst du ein neues Passwort speichern.");
  };
}

setupPasswordReset();
setupPasswordUpdate();

async function publishPlan(kind){
  if(!canPublishPlan(kind)) return alert("Du hast keine Berechtigung, diesen Dienstplan zu veröffentlichen.");

  const isKitchen = kind === "kitchen";
  const weekInput = isKitchen ? $("weekStartKitchen") : $("weekStartService");
  const week = weekInput?.value || mondayISO();
  const to = addDaysISO(week,6);
  const title = isKitchen ? "Dienstplan Küche veröffentlicht" : "Dienstplan Service veröffentlicht";
  const body = `Der Dienstplan für ${fmtDate(week)} bis ${fmtDate(to)} wurde veröffentlicht. Bitte prüfe deine Schichten.`;

  const pub = await sb.from("published_plans").upsert({
    plan_kind: kind,
    week_start: week,
    published_by: profile?.id || null,
    published_at: new Date().toISOString()
  },{onConflict:"plan_kind,week_start"});

  if(pub.error){
    alert("Dienstplan konnte nicht veröffentlicht werden: " + pub.error.message + "\n\nBitte prüfen, ob das SQL für v6.0.19 in Supabase ausgeführt wurde.");
    return;
  }

  publishedPlanCache[publishedKey(kind,week)] = true;

  let errorMessage = "";
  if(typeof createNotification === "function"){
    try{ await createNotification(title, body); }catch(e){ errorMessage = e?.message || String(e); }
  }else{
    const res = await sb.from("notifications").insert({title,body,created_by: profile?.id || null});
    if(res.error) errorMessage = res.error.message;
  }

  if(errorMessage){
    alert("Dienstplan wurde veröffentlicht, aber die Benachrichtigung konnte nicht erstellt werden: " + errorMessage);
  }else{
    alert("Dienstplan wurde veröffentlicht. Mitarbeiter können diese Woche jetzt sehen.");
  }

  await loadDashboardV57?.();
  if(kind==="service") await loadPlanService();
  if(kind==="kitchen") await loadPlanKitchen();
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

async function collectVacationDaysForYear(year, profileIds=null){
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const ids = Array.isArray(profileIds) ? profileIds.filter(Boolean) : null;

  let vacQuery = sb.from("vacation_requests")
    .select("*")
    .lte("date_from",to)
    .gte("date_to",from)
    .in("status",["genehmigt"]);

  let schedQuery = sb.from("schedules")
    .select("*")
    .gte("work_date",from)
    .lte("work_date",to);

  if(ids && ids.length){
    vacQuery = vacQuery.in("profile_id",ids);
    schedQuery = schedQuery.in("profile_id",ids);
  }

  const [vacRes, scheduleRes] = await Promise.all([vacQuery, schedQuery]);

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
    const p = profileById(v.profile_id);
    if(ids && ids.length && !ids.includes(v.profile_id)) return;
    ensure(v.profile_id);
    const range = vacationDateRangeDaysForProfile(v,p,from,to,vacationDayValue(v,v.date_from));
    Object.entries(range).forEach(([iso,val])=>{
      byProfile[v.profile_id][iso] = val;
      sourceInfo[v.profile_id][iso] = "Urlaubsliste";
    });
  });

  (scheduleRes.data || [])
    .filter(s=>String(s.status || "").toLowerCase().includes("urlaub"))
    .forEach(s=>{
      if(ids && ids.length && !ids.includes(s.profile_id)) return;
      const p = profileById(s.profile_id);
      ensure(s.profile_id);
      const iso = s.work_date;
      if(!iso || iso < from || iso > to) return;
      if(!vacationCountableWeekday(p,iso)) return;
      if(!byProfile[s.profile_id][iso]){
        byProfile[s.profile_id][iso] = 1;
        sourceInfo[s.profile_id][iso] = "Dienstplan";
      }
    });

  return {byProfile,sourceInfo};
}

async function loadVacationYearOverview(){
  if(!$("vacYearGrid") || !canViewVacationTeam() || !profiles.length) return;

  const year = Number($("vacYearSelect")?.value || new Date().getFullYear());
  if($("vacYearSelect")) $("vacYearSelect").value = year;

  const rows = vacationVisibleProfiles();
  const ids = rows.map(p=>p.id).filter(Boolean);

  if(!ids.length){
    $("vacYearGrid").innerHTML = `<div class="entry">Keine Mitarbeiter für deine Berechtigung gefunden.</div>`;
    return;
  }

  $("vacYearGrid").innerHTML = `<div class="entry">Jahresübersicht wird berechnet...</div>`;

  let collected;
  try{
    collected = await collectVacationDaysForYear(year,ids);
  }catch(e){
    $("vacYearGrid").innerHTML = `<div class="entry"><b>Fehler:</b><br>${escapeHtml(e.message)}</div>`;
    return;
  }

  const {byProfile,sourceInfo} = collected;
  const months = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

  let mobile = `<div class="vacYearRoleHint">${isKitchenLead()&&!isManagement() ? "Küchenleitung sieht hier nur Küche." : "Geschäftsführung sieht alle Mitarbeiter."}</div><div class="vacYearMobileCards">`;
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
    const entitlement = vacationEntitlement(p, year, true);
    const rest = vacationRoundDays(entitlement - taken);

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

  html += `</tbody></table></div>`;
  mobile += `</div>`;
  $("vacYearGrid").innerHTML = mobile + html;
}


function localDateTimeInputValue(d=new Date()){
  const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,16);
}
function clockEventLabel(type){
  return ({
    clock_in:"Kommen",
    break_start:"Pause Start",
    break_end:"Pause Ende",
    clock_out:"Gehen"
  })[type] || type || "—";
}
function clockEventClass(type){
  return ({
    clock_in:"clockIn",
    break_start:"clockPause",
    break_end:"clockPauseEnd",
    clock_out:"clockOut"
  })[type] || "";
}
function clockStatusFromLast(type){
  if(type==="clock_in") return "Im Dienst";
  if(type==="break_start") return "In Pause";
  if(type==="break_end") return "Im Dienst";
  if(type==="clock_out") return "Ausgestempelt";
  return "Noch nicht gestempelt";
}
function isClockRoute(){
  return new URLSearchParams(window.location.search).has("stempeluhr");
}
function clockQrUrl(){
  const base = window.location.origin + window.location.pathname;
  return `${base}?stempeluhr=1&v=6053`;
}

function normalizeIpValue(ip){
  return String(ip||"").trim().toLowerCase();
}
function isAllowedClockIp(ip){
  const normalized = normalizeIpValue(ip);
  if(!normalized) return false;
  if(CLOCK_ALLOWED_IPV4S.includes(normalized)) return true;
  return CLOCK_ALLOWED_IPV6_PREFIXES.some(prefix => normalized.startsWith(String(prefix).toLowerCase()));
}
function renderClockNetworkStatus(){
  const el = $("clockNetworkStatus");
  const state = clockNetworkState || {};
  const managementOverride = isManagement();

  if(el){
    el.classList.remove("allowed","blocked","unknown");
    el.classList.add(managementOverride ? "allowed" : state.allowed ? "allowed" : state.checked ? "blocked" : "unknown");

    const ipLine = state.ip ? `<br><span>Erkannte IP: <b>${escapeHtml(state.ip)}</b></span>` : "";
    const allowedLine = `<br><span>Erlaubt für Mitarbeiter: IPv4 ${escapeHtml(CLOCK_ALLOWED_IPV4S.join(", "))}${CLOCK_ALLOWED_IPV6_PREFIXES.length ? " · IPv6-Präfix " + escapeHtml(CLOCK_ALLOWED_IPV6_PREFIXES.join(", ")) : ""}</span>`;

    if(managementOverride){
      el.innerHTML = `✅ <b>Geschäftsführung freigegeben.</b> Manuelle Stempelung ist unabhängig vom Restaurantnetz möglich.${ipLine}<br><small>Die Netzprüfung gilt weiterhin für Mitarbeiter über den QR-Code.</small>`;
    }else{
      el.innerHTML = state.allowed
        ? `✅ <b>Restaurantnetz erkannt.</b> Stempeln ist freigegeben.${ipLine}`
        : `⛔ <b>Stempeln blockiert.</b> Bitte im Landsknecht-WLAN öffnen.${ipLine}${allowedLine}<br><small>${escapeHtml(state.reason||"")}</small>`;
    }
  }

  document.querySelectorAll("#clockInBtn,#breakStartBtn,#breakEndBtn,#clockOutBtn").forEach(btn=>{
    const block = !managementOverride && !state.allowed;
    btn.disabled = block;
    btn.classList.toggle("disabled", block);
  });
}
async function checkClockNetwork(force=false){
  if(clockNetworkState.checked && !force) return clockNetworkState;

  clockNetworkState={checked:false,allowed:false,ip:"",reason:"Prüfung läuft..."};
  renderClockNetworkStatus();

  try{
    const res = await fetch(`/api/check-clock-network?ts=${Date.now()}`,{cache:"no-store"});
    if(res.ok){
      const data = await res.json();
      const ip = normalizeIpValue(data.ip || "");
      clockNetworkState={
        checked:true,
        allowed:!!data.allowed || isAllowedClockIp(ip),
        ip,
        reason:data.reason || "Prüfung über Cloudflare Function"
      };
      renderClockNetworkStatus();
      return clockNetworkState;
    }
  }catch(e){
    // Fallback unten
  }

  try{
    const res = await fetch(`https://api.ipify.org?format=json&ts=${Date.now()}`,{cache:"no-store"});
    if(res.ok){
      const data = await res.json();
      const ip = normalizeIpValue(data.ip || "");
      clockNetworkState={
        checked:true,
        allowed:isAllowedClockIp(ip),
        ip,
        reason:"Prüfung über Browser-Fallback"
      };
      renderClockNetworkStatus();
      return clockNetworkState;
    }
  }catch(e){
    // ignore
  }

  clockNetworkState={
    checked:true,
    allowed:false,
    ip:"",
    reason:"IP konnte nicht geprüft werden. Bitte Internetverbindung und Restaurant-WLAN prüfen."
  };
  renderClockNetworkStatus();
  return clockNetworkState;
}

function setupClockQr(){
  if(!$("clockQrImg")) return;
  const url = clockQrUrl();
  $("clockQrUrl").value = url;
  $("clockQrImg").src = "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=" + encodeURIComponent(url);
}
function selectedClockProfile(){
  return profiles.find(p=>p.id===$("clockProfile")?.value) || {};
}
async function loadTimeClock(){
  if(!$("timeClock") || !session) return;
  if(!isManagement() && !isClockRoute()){
    setActiveTab("dashboard");
    return;
  }
  if(!profiles.length) await loadProfiles();

  if(isManagement() && $("clockProfile") && !$("clockProfile").innerHTML){
    $("clockProfile").innerHTML=alphaProfiles().map(profileOptionHtml).join("");
  }
  if($("clockStampTitle")) $("clockStampTitle").textContent = isManagement() ? "Manuelle Stempelung" : "Meine Stempeluhr";
  if($("clockTodayTitle")) $("clockTodayTitle").textContent = isManagement() ? "Heute gestempelt" : "Meine Stempelungen heute";
  if($("clockRecentTitle")) $("clockRecentTitle").textContent = isManagement() ? "Letzte Stempel-Ereignisse" : "Meine letzten Stempelungen";
  if($("clockDateTime") && !$("clockDateTime").value) $("clockDateTime").value = localDateTimeInputValue();
  if($("clockEvalFrom") && !$("clockEvalFrom").value) $("clockEvalFrom").value = firstOfMonthISO(monthISO());
  if($("clockEvalTo") && !$("clockEvalTo").value) $("clockEvalTo").value = todayISO();
  setupClockQr();
  await checkClockNetwork(true);

  await loadClockEvents();
  if(isManagement()) await loadClockEvaluation();
}
async function loadClockEvents(){
  if(!$("clockEventList")) return;
  if(!profiles.length) await loadProfiles();

  const today = todayISO();
  const viewFilter = isManagement() ? ($("clockEventsProfileFilter")?.value || "") : (profile?.id || "");

  let q = sb.from("time_clock_events")
    .select("*")
    .order("event_time",{ascending:false})
    .limit(isManagement() ? 120 : 30);

  if(viewFilter){
    q = q.eq("profile_id", viewFilter);
  }

  const recent = await q;

  if(recent.error){
    $("clockEventList").innerHTML = `<div class="entry"><b>Fehler:</b><br>${escapeHtml(recent.error.message)}<br><span class="small">Bitte prüfen, ob das SQL für v6.0.27 ausgeführt wurde.</span></div>`;
    if($("clockTodayList")) $("clockTodayList").innerHTML = "";
    return;
  }

  const rows = recent.data || [];
  const todayRows = rows.filter(e => localISODate(new Date(e.event_time)) === today);

  const selectedForStatus = isManagement() ? ($("clockProfile")?.value || viewFilter) : profile?.id;
  const selectedLast = rows.find(e=>e.profile_id===selectedForStatus);

  if($("clockSelectedStatus")){
    const p = isManagement() ? (profileById(selectedForStatus) || selectedClockProfile()) : (profile || {});
    $("clockSelectedStatus").innerHTML = selectedForStatus
      ? `<b>${escapeHtml((p.first_name||"")+" "+(p.last_name||""))}</b>: ${escapeHtml(clockStatusFromLast(selectedLast?.event_type))}`
      : "Bitte Mitarbeiter auswählen.";
  }

  if($("clockEmployeeInfo") && !isManagement()){
    $("clockEmployeeInfo").innerHTML = `
      <div class="clockEmployeeName">${escapeHtml((profile?.first_name||"")+" "+(profile?.last_name||""))}</div>
      <div>${deptBadge(profile?.department)} · ${escapeHtml(clockStatusFromLast(selectedLast?.event_type))}</div>
      <small>Stempeln ist nur im Landsknecht-Netz möglich. Die Uhrzeit wird automatisch gespeichert.</small>
    `;
  }

  if($("clockTodayList")){
    const byEmployee = {};
    todayRows.forEach(e=>{
      byEmployee[e.profile_id] ||= [];
      byEmployee[e.profile_id].push(e);
    });

    const people = Object.keys(byEmployee).map(id=>profileById(id)).filter(p=>p.id);
    people.sort((a,b)=>String(a.last_name||"").localeCompare(String(b.last_name||"")));

    const emptyText = isManagement()
      ? (viewFilter ? "Für diesen Mitarbeiter wurde heute noch nicht gestempelt." : "Heute wurde noch nicht gestempelt.")
      : "Du hast heute noch nicht gestempelt.";

    $("clockTodayList").innerHTML = people.length ? people.map(p=>{
      const list = byEmployee[p.id].sort((a,b)=>String(a.event_time).localeCompare(String(b.event_time)));
      const last = list[list.length-1];
      return `<div class="clockTodayCard ${clockEventClass(last?.event_type)}">
        <div>
          <b>${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")}</b><br>
          <small>${deptBadge(p.department)} · ${escapeHtml(clockStatusFromLast(last?.event_type))}</small>
        </div>
        <div class="clockTodayEvents">
          ${list.map(e=>`<span>${new Date(e.event_time).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} ${escapeHtml(clockEventLabel(e.event_type))}</span>`).join("")}
        </div>
      </div>`;
    }).join("") : `<p>${emptyText}</p>`;
  }

  if($("clockRecentTitle") && isManagement()){
    const p = viewFilter ? profileById(viewFilter) : null;
    $("clockRecentTitle").textContent = p?.id
      ? `Letzte Stempel-Ereignisse · ${p.first_name||""} ${p.last_name||""}`.trim()
      : "Letzte Stempel-Ereignisse";
  }

  $("clockEventList").innerHTML = rows.length ? rows.map(e=>{
    const p=profileById(e.profile_id);
    return `<div class="entry clockEntry ${clockEventClass(e.event_type)}">
      <b>${escapeHtml(clockEventLabel(e.event_type))}</b>
      <span class="clockTime">${new Date(e.event_time).toLocaleString("de-DE")}</span><br>
      ${escapeHtml(p.first_name||"")} ${escapeHtml(p.last_name||"")} ${deptBadge(p.department)}
      ${e.note ? `<br><span class="small">Notiz: ${escapeHtml(e.note)}</span>` : ""}
    </div>`;
  }).join("") : `<p>${isManagement() ? "Keine Stempel-Ereignisse für diese Auswahl vorhanden." : "Noch keine eigenen Stempelungen vorhanden."}</p>`;
}

async function getLastClockEvent(profileId){
  if(!profileId) return {data:null,error:null};
  const res = await sb.from("time_clock_events")
    .select("*")
    .eq("profile_id",profileId)
    .order("event_time",{ascending:false})
    .limit(1);
  return {data:(res.data||[])[0]||null,error:res.error||null};
}
function validateClockAction(eventType,lastEvent){
  const lastType = lastEvent?.event_type || "";

  if(eventType==="clock_in"){
    if(["clock_in","break_start","break_end"].includes(lastType)){
      return isManagement()
        ? "Dieser Mitarbeiter ist bereits angemeldet. Bitte erst „Gehen“ stempeln."
        : "Du bist bereits angemeldet. Bitte erst „Gehen“ stempeln.";
    }
    return "";
  }

  if(eventType==="break_start"){
    if(lastType==="break_start") return "Die Pause wurde bereits gestartet.";
    if(!["clock_in","break_end"].includes(lastType)){
      return isManagement()
        ? "Pause kann nur gestartet werden, wenn der Mitarbeiter angemeldet ist."
        : "Pause kann nur gestartet werden, wenn du angemeldet bist.";
    }
    return "";
  }

  if(eventType==="break_end"){
    if(lastType!=="break_start") return "Pause beenden ist nur möglich, wenn vorher Pause gestartet wurde.";
    return "";
  }

  if(eventType==="clock_out"){
    if(lastType==="break_start") return "Bitte zuerst „Pause beenden“ und danach „Gehen“ stempeln.";
    if(!["clock_in","break_end"].includes(lastType)){
      return isManagement()
        ? "Dieser Mitarbeiter ist aktuell nicht angemeldet."
        : "Du bist aktuell nicht angemeldet.";
    }
    return "";
  }

  return "";
}

async function saveClockEvent(eventType){
  if(!session || !profile?.id) return alert("Bitte zuerst einloggen.");

  if(!isManagement() && !isClockRoute()){
    return alert("Stempeln ist nur über den QR-Code im Restaurant möglich.");
  }

  if(clockSaving) return;
  clockSaving = true;
  document.querySelectorAll("#clockInBtn,#breakStartBtn,#breakEndBtn,#clockOutBtn").forEach(btn=>btn.disabled=true);

  try{
    if(!isManagement()){
      const network = await checkClockNetwork(true);
      if(!network.allowed){
        alert("Stempeln ist nur im Landsknecht-WLAN möglich. Erkannte IP: " + (network.ip || "unbekannt"));
        return;
      }
    }else{
      // Geschäftsführung darf Mitarbeiter manuell unabhängig von der IP stempeln.
      await checkClockNetwork(true);
    }

    const profileId = isManagement() ? $("clockProfile")?.value : profile.id;
    if(!profileId){
      alert("Bitte Mitarbeiter auswählen.");
      return;
    }

    const last = await getLastClockEvent(profileId);
    if(last.error){
      alert("Letzte Stempelung konnte nicht geprüft werden: " + last.error.message);
      return;
    }

    const actionError = validateClockAction(eventType,last.data);
    if(actionError){
      alert(actionError);
      return;
    }

    const eventDate = isManagement()
      ? new Date($("clockDateTime")?.value || localDateTimeInputValue())
      : new Date();

    if(Number.isNaN(eventDate.getTime())){
      alert("Bitte gültigen Zeitpunkt eingeben.");
      return;
    }

    const payload = {
      profile_id: profileId,
      event_type: eventType,
      event_time: eventDate.toISOString(),
      work_date: localISODate(eventDate),
      source: isManagement() ? "management" : "employee_qr",
      note: isManagement() ? ($("clockNote")?.value || "") : "",
      created_by: profile?.id || null
    };

    const {error} = await sb.from("time_clock_events").insert(payload);
    if(error){
      alert("Stempelung konnte nicht gespeichert werden: " + error.message);
      return;
    }

    if($("clockNote")) $("clockNote").value = "";
    if($("clockDateTime")) $("clockDateTime").value = localDateTimeInputValue();

    await loadClockEvents();
    if(isManagement()) await loadClockEvaluation();

  }finally{
    clockSaving = false;
    renderClockNetworkStatus();
  }
}

function minutesBetweenDates(a,b){
  if(!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime()-a.getTime())/60000));
}
function clockMinutesText(minutes){
  const m = Math.max(0, Math.round(Number(minutes)||0));
  const h = Math.floor(m/60);
  const rest = m % 60;
  return `${h}:${pad2(rest)}`;
}
function clockDecimalHours(minutes){
  return ((Number(minutes)||0)/60).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function clockMoney(amount){
  return (Number(amount)||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €";
}
function clockEventTimeShort(iso){
  if(!iso) return "—";
  return new Date(iso).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
}
function clockEvalStatus(row){
  if(row.errors?.length) return "Prüfen";
  if(!row.outISO) return "Offen";
  return "OK";
}
function clockEvalStatusClass(row){
  const s = clockEvalStatus(row);
  if(s==="OK") return "ok";
  if(s==="Offen") return "open";
  return "warn";
}
function buildClockEvaluationRows(events,from,to,profileFilter){
  const byProfile = {};
  (events||[]).forEach(e=>{
    if(profileFilter && e.profile_id !== profileFilter) return;
    byProfile[e.profile_id] ||= [];
    byProfile[e.profile_id].push(e);
  });

  const rows = [];

  Object.entries(byProfile).forEach(([profileId,list])=>{
    list.sort((a,b)=>String(a.event_time).localeCompare(String(b.event_time)));

    let active = null;
    let activeBreakStart = null;

    function finishActive(forceError){
      if(!active) return;
      if(forceError) active.errors.push(forceError);
      const shiftDate = localISODate(active.startDate);
      if(shiftDate >= from && shiftDate <= to){
        active.date = shiftDate;
        active.status = clockEvalStatus(active);
        active.netMinutes = active.outDate ? Math.max(0, active.grossMinutes - active.pauseMinutes) : 0;
        rows.push(active);
      }
      active = null;
      activeBreakStart = null;
    }

    list.forEach(e=>{
      const dt = new Date(e.event_time);
      const type = e.event_type;

      if(type === "clock_in"){
        if(active){
          finishActive("Neues Kommen ohne vorheriges Gehen");
        }
        active = {
          profile_id: profileId,
          date: localISODate(dt),
          inISO: e.event_time,
          outISO: null,
          startDate: dt,
          outDate: null,
          grossMinutes: 0,
          pauseMinutes: 0,
          netMinutes: 0,
          errors: [],
          notes: e.note ? [e.note] : []
        };
        return;
      }

      if(type === "break_start"){
        if(!active){
          const orphanDate = localISODate(dt);
          if(orphanDate >= from && orphanDate <= to){
            rows.push({
              profile_id: profileId,
              date: orphanDate,
              inISO: null,
              outISO: null,
              startDate: dt,
              outDate: null,
              grossMinutes: 0,
              pauseMinutes: 0,
              netMinutes: 0,
              errors: ["Pause Start ohne Kommen"],
              notes: e.note ? [e.note] : []
            });
          }
          return;
        }
        if(activeBreakStart){
          active.errors.push("Pause doppelt gestartet");
          return;
        }
        activeBreakStart = dt;
        if(e.note) active.notes.push(e.note);
        return;
      }

      if(type === "break_end"){
        if(!active){
          const orphanDate = localISODate(dt);
          if(orphanDate >= from && orphanDate <= to){
            rows.push({
              profile_id: profileId,
              date: orphanDate,
              inISO: null,
              outISO: null,
              startDate: dt,
              outDate: null,
              grossMinutes: 0,
              pauseMinutes: 0,
              netMinutes: 0,
              errors: ["Pause Ende ohne Kommen"],
              notes: e.note ? [e.note] : []
            });
          }
          return;
        }
        if(!activeBreakStart){
          active.errors.push("Pause Ende ohne Pause Start");
          return;
        }
        active.pauseMinutes += minutesBetweenDates(activeBreakStart,dt);
        activeBreakStart = null;
        if(e.note) active.notes.push(e.note);
        return;
      }

      if(type === "clock_out"){
        if(!active){
          const orphanDate = localISODate(dt);
          if(orphanDate >= from && orphanDate <= to){
            rows.push({
              profile_id: profileId,
              date: orphanDate,
              inISO: null,
              outISO: e.event_time,
              startDate: dt,
              outDate: dt,
              grossMinutes: 0,
              pauseMinutes: 0,
              netMinutes: 0,
              errors: ["Gehen ohne Kommen"],
              notes: e.note ? [e.note] : []
            });
          }
          return;
        }
        if(activeBreakStart){
          active.pauseMinutes += minutesBetweenDates(activeBreakStart,dt);
          active.errors.push("Pause wurde nicht beendet");
          activeBreakStart = null;
        }
        active.outISO = e.event_time;
        active.outDate = dt;
        active.grossMinutes = minutesBetweenDates(active.startDate,dt);
        active.netMinutes = Math.max(0, active.grossMinutes - active.pauseMinutes);
        if(e.note) active.notes.push(e.note);
        finishActive();
      }
    });

    if(active){
      finishActive("Gehen fehlt");
    }
  });

  rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)) || String(profileById(a.profile_id).last_name||"").localeCompare(String(profileById(b.profile_id).last_name||"")) || String(a.inISO||"").localeCompare(String(b.inISO||"")));
  return rows;
}
function groupClockEvaluation(rows){
  const summary = {};
  rows.forEach(r=>{
    const p = profileById(r.profile_id);
    const key = r.profile_id;
    summary[key] ||= {
      profile_id:key,
      name:`${p.first_name||""} ${p.last_name||""}`.trim(),
      department:p.department||"",
      hourly_rate:Number(p.hourly_rate||0),
      shifts:0,
      grossMinutes:0,
      pauseMinutes:0,
      netMinutes:0,
      errors:0,
      rows:[]
    };
    summary[key].rows.push(r);
    if(r.inISO) summary[key].shifts += 1;
    summary[key].grossMinutes += Number(r.grossMinutes||0);
    summary[key].pauseMinutes += Number(r.pauseMinutes||0);
    summary[key].netMinutes += Number(r.netMinutes||0);
    if(r.errors?.length) summary[key].errors += 1;
  });
  return Object.values(summary).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
async function loadClockEvaluation(){
  if(!$("clockEvaluationList") || !isManagement()) return;
  if(!profiles.length) await loadProfiles();

  const from = $("clockEvalFrom")?.value || firstOfMonthISO(monthISO());
  const to = $("clockEvalTo")?.value || todayISO();
  const profileFilter = $("clockEvalProfile")?.value || "";

  if(from > to){
    alert("Der Zeitraum ist ungültig.");
    return;
  }

  $("clockEvaluationList").innerHTML = `<div class="entry">Zeiten werden ausgewertet...</div>`;

  const queryFrom = addDaysISO(from,-1);
  const queryTo = addDaysISO(to,1);

  let q = sb.from("time_clock_events")
    .select("*")
    .gte("work_date",queryFrom)
    .lte("work_date",queryTo)
    .order("event_time",{ascending:true});

  if(profileFilter) q = q.eq("profile_id",profileFilter);

  const {data,error} = await q;

  if(error){
    $("clockEvaluationList").innerHTML = `<div class="entry"><b>Fehler beim Laden:</b><br>${escapeHtml(error.message)}<br><span class="small">Bitte prüfen, ob das SQL für v6.0.23 ausgeführt wurde.</span></div>`;
    if($("clockEvalStats")) $("clockEvalStats").innerHTML = "";
    return;
  }

  const rows = buildClockEvaluationRows(data||[],from,to,profileFilter);
  lastClockEvaluationRows = rows;

  const groups = groupClockEvaluation(rows);
  const totalNet = groups.reduce((s,g)=>s+g.netMinutes,0);
  const totalPause = groups.reduce((s,g)=>s+g.pauseMinutes,0);
  const totalErrors = groups.reduce((s,g)=>s+g.errors,0);
  const totalShifts = groups.reduce((s,g)=>s+g.shifts,0);

  if($("clockEvalStats")){
    $("clockEvalStats").innerHTML = `
      <div class="clockEvalStat"><span>Schichten</span><b>${totalShifts}</b></div>
      <div class="clockEvalStat"><span>Netto</span><b>${clockDecimalHours(totalNet)} Std.</b></div>
      <div class="clockEvalStat"><span>Pause</span><b>${clockMinutesText(totalPause)}</b></div>
      <div class="clockEvalStat ${totalErrors ? "warn" : ""}"><span>Prüfen</span><b>${totalErrors}</b></div>
    `;
  }

  if(!groups.length){
    $("clockEvaluationList").innerHTML = `<p>Keine auswertbaren Stempelungen im gewählten Zeitraum.</p>`;
    return;
  }

  $("clockEvaluationList").innerHTML = groups.map(g=>{
    const pay = g.hourly_rate ? g.netMinutes/60*g.hourly_rate : 0;
    return `<div class="clockEvalEmployeeCard ${g.errors ? "hasErrors" : ""}">
      <div class="clockEvalEmployeeHead">
        <div>
          <h4>${escapeHtml(g.name || "Unbekannt")}</h4>
          <small>${deptBadge(g.department)}</small>
        </div>
        <div class="clockEvalNet">${clockDecimalHours(g.netMinutes)} Std.</div>
      </div>
      <div class="clockEvalMiniStats">
        <span>Schichten <b>${g.shifts}</b></span>
        <span>Brutto <b>${clockDecimalHours(g.grossMinutes)}</b></span>
        <span>Pause <b>${clockMinutesText(g.pauseMinutes)}</b></span>
        <span>Netto <b>${clockDecimalHours(g.netMinutes)}</b></span>
        ${g.hourly_rate ? `<span>Lohn <b>${clockMoney(pay)}</b></span>` : ""}
        <span class="${g.errors ? "warn" : "ok"}">Prüfen <b>${g.errors}</b></span>
      </div>
      <div class="clockEvalShiftList">
        ${g.rows.map(r=>`
          <div class="clockEvalShiftRow ${clockEvalStatusClass(r)}">
            <div>
              <b>${fmtDate(r.date)}</b><br>
              <small>${escapeHtml(clockEvalStatus(r))}${r.errors?.length ? " · " + escapeHtml(r.errors.join(", ")) : ""}</small>
            </div>
            <div>
              <span>Kommen</span><b>${clockEventTimeShort(r.inISO)}</b>
            </div>
            <div>
              <span>Gehen</span><b>${clockEventTimeShort(r.outISO)}</b>
            </div>
            <div>
              <span>Pause</span><b>${clockMinutesText(r.pauseMinutes)}</b>
            </div>
            <div>
              <span>Netto</span><b>${r.outISO ? clockDecimalHours(r.netMinutes) : "—"}</b>
            </div>
          </div>
        `).join("")}
      </div>
    </div>`;
  }).join("");
}
function exportClockEvaluationCsv(){
  if(!lastClockEvaluationRows.length){
    alert("Bitte zuerst die Auswertung laden.");
    return;
  }
  const rows = [["Mitarbeiter","Bereich","Datum","Kommen","Gehen","Brutto Stunden","Pause","Netto Stunden","Status","Hinweis","Stundenlohn","Lohn"]];
  lastClockEvaluationRows.forEach(r=>{
    const p=profileById(r.profile_id);
    const rate=Number(p.hourly_rate||0);
    const pay=rate ? (Number(r.netMinutes||0)/60*rate) : 0;
    rows.push([
      `${p.first_name||""} ${p.last_name||""}`.trim(),
      p.department||"",
      fmtDate(r.date),
      clockEventTimeShort(r.inISO),
      clockEventTimeShort(r.outISO),
      clockDecimalHours(r.grossMinutes),
      clockMinutesText(r.pauseMinutes),
      r.outISO ? clockDecimalHours(r.netMinutes) : "",
      clockEvalStatus(r),
      (r.errors||[]).join(", "),
      rate ? rate.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) : "",
      pay ? pay.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) : ""
    ]);
  });
  const csv = rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(";")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`stempeluhr-auswertung-${$("clockEvalFrom")?.value||""}-bis-${$("clockEvalTo")?.value||""}.csv`;
  a.click();
}
function setClockEvalRange(kind){
  const today = todayISO();
  if(kind==="today"){
    $("clockEvalFrom").value = today;
    $("clockEvalTo").value = today;
  }else if(kind==="week"){
    $("clockEvalFrom").value = mondayISO();
    $("clockEvalTo").value = addDaysISO(mondayISO(),6);
  }else{
    $("clockEvalFrom").value = firstOfMonthISO(monthISO());
    $("clockEvalTo").value = today;
  }
  loadClockEvaluation();
}

function setupTimeClock(){
  if($("refreshClockBtn")) $("refreshClockBtn").onclick = loadTimeClock;
  if($("clockProfile")) $("clockProfile").onchange = loadClockEvents;
  if($("clockEventsProfileFilter")) $("clockEventsProfileFilter").onchange = loadClockEvents;
  if($("clockInBtn")) $("clockInBtn").onclick = ()=>saveClockEvent("clock_in");
  if($("breakStartBtn")) $("breakStartBtn").onclick = ()=>saveClockEvent("break_start");
  if($("breakEndBtn")) $("breakEndBtn").onclick = ()=>saveClockEvent("break_end");
  if($("clockOutBtn")) $("clockOutBtn").onclick = ()=>saveClockEvent("clock_out");
  if($("copyClockQrUrl")) $("copyClockQrUrl").onclick = async()=>{
    const url = $("clockQrUrl")?.value || clockQrUrl();
    try{
      await navigator.clipboard.writeText(url);
      alert("Stempeluhr-Link kopiert.");
    }catch(e){
      prompt("Stempeluhr-Link kopieren:", url);
    }
  };
  if($("loadClockEvaluation")) $("loadClockEvaluation").onclick = loadClockEvaluation;
  if($("exportClockEvaluationCsv")) $("exportClockEvaluationCsv").onclick = exportClockEvaluationCsv;
  if($("clockEvalToday")) $("clockEvalToday").onclick = ()=>setClockEvalRange("today");
  if($("clockEvalWeek")) $("clockEvalWeek").onclick = ()=>setClockEvalRange("week");
  if($("clockEvalMonth")) $("clockEvalMonth").onclick = ()=>setClockEvalRange("month");
  if($("clockEvalProfile")) $("clockEvalProfile").onchange = loadClockEvaluation;
  if($("printClockQr")) $("printClockQr").onclick = ()=>{
    document.body.classList.add("printClockQr");
    setupClockQr();
    setTimeout(()=>{
      window.print();
      setTimeout(()=>document.body.classList.remove("printClockQr"),500);
    },150);
  };
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

setupTimeClock();
setupVacationYearOverview();
setupVacationPlanner();
setupVacationAccountOverview();
setupVacationYearClose();
init();

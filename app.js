/* CRIMEWATCH 360
   Configure a trusted backend in CONFIG.crimeStatsEndpoint.
   Expected GET response:
   { "area":"Ikeja, Lagos", "period":"Last 30 days", "total":42,
     "source":"Official agency name", "updatedAt":"2026-11-16T10:00:00Z",
     "categories":[{"name":"Theft","count":18},{"name":"Robbery","count":7}] }
   Only publish aggregate, lawfully obtained statistics. Never expose private criminal records.
*/
const CONFIG = {
  emergencyNumber: "112",
  crimeStatsEndpoint: "", // e.g. "https://your-authorized-api.example/v1/area-stats"
  refreshIntervalMs: 5 * 60 * 1000
};

const DEFAULT_CONTACTS = Array.from({length:5}, (_,i)=>({name:`Contact ${i+1}`,phone:""}));
const $ = id => document.getElementById(id);
let contacts = loadContacts();

function loadContacts(){
  try {
    const saved = JSON.parse(localStorage.getItem("cw360_contacts"));
    return Array.isArray(saved) ? Array.from({length:5},(_,i)=>saved[i]||DEFAULT_CONTACTS[i]) : DEFAULT_CONTACTS;
  } catch { return DEFAULT_CONTACTS; }
}
function saveContacts(){ localStorage.setItem("cw360_contacts",JSON.stringify(contacts)); }
function toast(message){
  const el=$("toast"); el.textContent=message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2800);
}
function dial(number){
  const clean=String(number||"").replace(/[^\d+]/g,"");
  if(!clean){toast("Add a phone number first.");return;}
  window.location.href=`tel:${clean}`;
}
function renderContacts(){
  $("contactsGrid").innerHTML="";
  contacts.forEach((contact,index)=>{
    const button=document.createElement("button");
    button.className="contact-btn"; button.type="button";
    const avatar=document.createElement("span"); avatar.className="contact-avatar"; avatar.textContent=contact.name?.trim()?.[0]?.toUpperCase()||String(index+1);
    const name=document.createElement("strong"); name.textContent=contact.name||`Contact ${index+1}`;
    const number=document.createElement("small"); number.textContent=contact.phone||"Tap to add number";
    button.append(avatar,name,number); button.addEventListener("click",()=>dial(contact.phone));
    $("contactsGrid").append(button);
  });
}
function openContactsEditor(){
  $("contactFields").innerHTML="";
  contacts.forEach((contact,index)=>{
    const wrap=document.createElement("div"); wrap.className="contact-field";
    const nameLabel=document.createElement("label"); nameLabel.textContent=`CONTACT ${index+1} NAME`;
    const name=document.createElement("input"); name.type="text"; name.maxLength=40; name.placeholder="e.g. Family member"; name.value=contact.name||""; name.autocomplete="off";
    const phoneLabel=document.createElement("label"); phoneLabel.textContent="PHONE NUMBER";
    const phone=document.createElement("input"); phone.type="tel"; phone.placeholder="+234…"; phone.value=contact.phone||""; phone.autocomplete="tel";
    nameLabel.append(name); phoneLabel.append(phone); wrap.append(nameLabel,phoneLabel); $("contactFields").append(wrap);
  });
  $("contactsDialog").showModal();
}
$("editContactsBtn").addEventListener("click",openContactsEditor);
$("cancelContacts").addEventListener("click",()=>$("contactsDialog").close());
$("contactsForm").addEventListener("submit",event=>{
  event.preventDefault();
  contacts=Array.from($("contactFields").querySelectorAll(".contact-field"),(field,i)=>{
    const inputs=field.querySelectorAll("input");
    return {name:inputs[0].value.trim()||`Contact ${i+1}`,phone:inputs[1].value.trim()};
  });
  saveContacts(); renderContacts(); $("contactsDialog").close(); toast("Emergency contacts saved on this device.");
});
$("sosButton").addEventListener("click",()=>{
  if(confirm(`Call emergency services on ${CONFIG.emergencyNumber} now? Only use this for a genuine emergency.`)) dial(CONFIG.emergencyNumber);
});

let currentPosition=null;
function detectLocation(){
  if(!navigator.geolocation){$("locationNote").textContent="This browser does not support location access.";return;}
  $("locationText").textContent="Detecting your area…";
  $("locationNote").textContent="Waiting for device location permission.";
  navigator.geolocation.getCurrentPosition(async position=>{
    currentPosition={latitude:position.coords.latitude,longitude:position.coords.longitude};
    $("locationText").textContent=`GPS acquired · ${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`;
    $("locationNote").textContent="Coordinates are available. Area name requires a reverse-geocoding service.";
    await refreshCrimeStats();
  },error=>{
    const messages={1:"Location permission was denied.",2:"Your location is currently unavailable.",3:"Location request timed out."};
    $("locationText").textContent="Location unavailable"; $("locationNote").textContent=messages[error.code]||"Unable to access location.";
  },{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
}
$("locateBtn").addEventListener("click",detectLocation);

function renderBreakdown(categories){
  const host=$("crimeBreakdown"); host.innerHTML="";
  const max=Math.max(1,...categories.map(item=>Number(item.count)||0));
  categories.forEach(item=>{
    const row=document.createElement("div"); row.className="bar-row";
    const label=document.createElement("div"); label.className="bar-label";
    const name=document.createElement("span"); name.textContent=item.name;
    const count=document.createElement("strong"); count.textContent=String(item.count);
    label.append(name,count);
    const track=document.createElement("div"); track.className="bar-track";
    const fill=document.createElement("div"); fill.className="bar-fill"; fill.style.width=`${Math.max(0,Math.min(100,(Number(item.count)||0)/max*100))}%`;
    track.append(fill); row.append(label,track); host.append(row);
  });
}
function clearStats(message){
  $("incidentCount").textContent="—"; $("topCategory").textContent="—";
  $("dataStatus").textContent="Unavailable"; $("dataSource").textContent=message;
  $("incidentPeriod").textContent="No verified figures loaded";
  $("crimeBreakdown").innerHTML=`<p class="empty-state">${message}</p>`;
}
async function refreshCrimeStats(){
  if(!CONFIG.crimeStatsEndpoint){
    clearStats("No authorized crime-data API is configured. Connect an official or otherwise trusted aggregate-data provider to display local statistics.");
    $("connectionStatus").textContent="Safety tools ready";
    $("updatedAt").textContent="Stats feed not configured";
    return;
  }
  try{
    const url=new URL(CONFIG.crimeStatsEndpoint);
    if(currentPosition){url.searchParams.set("lat",currentPosition.latitude);url.searchParams.set("lon",currentPosition.longitude);}
    const response=await fetch(url,{headers:{Accept:"application/json"},cache:"no-store"});
    if(!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    const data=await response.json();
    if(!Number.isFinite(Number(data.total))||!Array.isArray(data.categories)) throw new Error("Unexpected data format");
    $("incidentCount").textContent=String(data.total);
    $("topCategory").textContent=data.categories.slice().sort((a,b)=>Number(b.count)-Number(a.count))[0]?.name||"None reported";
    $("dataStatus").textContent="Connected"; $("dataSource").textContent=data.source||"Connected provider";
    $("incidentPeriod").textContent=data.period||"Reporting period not supplied";
    $("locationText").textContent=data.area||$("locationText").textContent;
    renderBreakdown(data.categories);
    const time=data.updatedAt?new Date(data.updatedAt):new Date();
    $("updatedAt").textContent=`Updated ${time.toLocaleString()}`;
    $("connectionStatus").textContent="Feed connected";
  }catch(error){
    clearStats(`Crime feed unavailable: ${error.message}. Displaying no unverified figures.`);
    $("connectionStatus").textContent="Feed unavailable";
    $("updatedAt").textContent="Update failed";
  }
}
$("refreshBtn").addEventListener("click",()=>{refreshCrimeStats();toast("Refreshing available safety data…");});
renderContacts();
refreshCrimeStats();
setInterval(refreshCrimeStats,CONFIG.refreshIntervalMs);

import{createClient}from"https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL="https://pqsedxfgtauxjclityjt.supabase.co";
const SUPABASE_KEY="sb_publishable_SN09xuS01Vha1mo3H6rBUQ_EZLR0-0I";
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);

const RPM_REF=2050;
const Q_REF_M3S=50*0.00047194745;
const AREA=0.091*0.091;
const RHO=1.204;
const CHORD=0.050;
const MU=1.81e-5;

let currentStep=0;
let liveRow=null;
let rpmChosen=null;
let qExpected=null;
let vExpected=null;
let reExpected=null;
let qOk=false,vOk=false,reOk=false;

const $=id=>document.getElementById(id);

function parsePt(v){
  if(v===null||v===undefined)return NaN;
  return Number(String(v).trim().replace(/\s/g,"").replace(",","."));
}
function fmt(n,d=2){
  return Number(n).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
}
function fresh(row){
  return !!row?.online && !!row?.updated_at && (Date.now()-new Date(row.updated_at).getTime()<8000);
}
function setFeedback(id,text,type=""){
  const el=$(id);
  el.className="feedback"+(type?" "+type:"");
  el.textContent=text;
}
function closeEnough(value,target,tol=0.04){
  if(!Number.isFinite(value)||!Number.isFinite(target)||target===0)return false;
  return Math.abs(value-target)/Math.abs(target)<=tol;
}
function showStep(n){
  currentStep=Math.max(0,Math.min(5,n));
  document.querySelectorAll(".lessonStep").forEach(el=>el.classList.toggle("active",Number(el.dataset.step)===currentStep));
  document.querySelectorAll("[data-side-step]").forEach(el=>{
    const s=Number(el.dataset.sideStep);
    el.classList.toggle("active",s===currentStep);
    el.classList.toggle("done",s<currentStep);
  });
  $("progressFill").style.width=((currentStep)/5*100)+"%";
  if(currentStep===2)$("qRpmEcho").textContent=rpmChosen?Math.round(rpmChosen).toLocaleString("pt-BR"):"—";
  if(currentStep===3)$("vQEcho").textContent=qExpected?fmt(qExpected,5):"—";
  if(currentStep===4)$("reVEcho").textContent=vExpected?fmt(vExpected,2):"—";
  if(currentStep===5)fillSummary();
  window.scrollTo({top:0,behavior:"smooth"});
}
function updateLive(row){
  liveRow=row||liveRow;
  if(!liveRow)return;
  const isFresh=fresh(liveRow);
  $("lessonStatus").className=isFresh?"status on":"status";
  $("lessonStatus").textContent=isFresh?"● Dados ao vivo recebidos":"● Túnel offline";
  $("liveBadge").textContent=isFresh?"AO VIVO":"Túnel offline";
  $("livePwm").textContent=isFresh?Math.round(Number(liveRow.pwm||0))+"%":"—";
  $("liveRpm").textContent=isFresh?Math.round(Number(liveRow.rpm||0)).toLocaleString("pt-BR")+" RPM":"—";
  $("liveSource").textContent=isFresh?"Arduino":"Manual";
}
async function loadLive(){
  const {data}=await supabase.from("tunel_status").select("*").eq("id",1).single();
  if(data)updateLive(data);
}
async function startRealtime(){
  await loadLive();
  supabase.channel("aula-tunel-live")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"tunel_status",filter:"id=eq.1"},payload=>updateLive(payload.new))
    .subscribe();
  setInterval(loadLive,5000);
}
function chooseRpm(){
  const rpm=parsePt($("rpmStudent").value);
  if(!Number.isFinite(rpm)||rpm<=0){
    rpmChosen=null;
    $("rpmNext").disabled=true;
    setFeedback("rpmFeedback","Digite um RPM maior que zero.","bad");
    return;
  }
  rpmChosen=rpm;
  qExpected=Q_REF_M3S*(rpmChosen/RPM_REF);
  vExpected=qExpected/AREA;
  reExpected=(RHO*vExpected*CHORD)/MU;
  qOk=vOk=reOk=false;
  $("qNext").disabled=true;$("vNext").disabled=true;$("reNext").disabled=true;
  setFeedback("rpmFeedback","RPM registrado. Agora você pode avançar.","ok");
  $("rpmNext").disabled=false;
}
function useLive(){
  if(!fresh(liveRow)){
    setFeedback("rpmFeedback","O túnel não está enviando um valor ao vivo agora. Digite o RPM manualmente.","hint");
    return;
  }
  $("rpmStudent").value=Math.round(Number(liveRow.rpm||0));
  chooseRpm();
}
function checkQ(){
  if(!rpmChosen){setFeedback("qFeedback","Volte uma etapa e registre primeiro o RPM.","bad");return}
  const val=parsePt($("qStudent").value);
  if(closeEnough(val,qExpected,0.04)){
    qOk=true;$("qNext").disabled=false;
    setFeedback("qFeedback","Correto. Você transformou o RPM em vazão estimada.","ok");
  }else{
    qOk=false;$("qNext").disabled=true;
    setFeedback("qFeedback","Ainda não. Use Q = 0,023597 × (RPM / 2050). Confira também se sua resposta está em m³/s.","bad");
  }
}
function checkV(){
  const val=parsePt($("vStudent").value);
  if(closeEnough(val,vExpected,0.04)){
    vOk=true;$("vNext").disabled=false;
    setFeedback("vFeedback","Correto. Agora você tem a velocidade média estimada do ar.","ok");
  }else{
    vOk=false;$("vNext").disabled=true;
    setFeedback("vFeedback","Revise a divisão V = Q / 0,008281. Use Q em m³/s.","bad");
  }
}
function checkRe(){
  const val=parsePt($("reStudent").value);
  if(closeEnough(val,reExpected,0.04)){
    reOk=true;$("reNext").disabled=false;
    setFeedback("reFeedback","Correto. Você chegou ao número de Reynolds do ensaio.","ok");
  }else{
    reOk=false;$("reNext").disabled=true;
    setFeedback("reFeedback","Revise a substituição: Re = (1,204 × V × 0,050) / (1,81×10⁻⁵). Reynolds não tem unidade.","bad");
  }
}
function fillSummary(){
  const group=$("groupName").value.trim()||"Não informado";
  $("sumGroup").textContent=group;
  $("sumRpm").textContent=rpmChosen?Math.round(rpmChosen).toLocaleString("pt-BR")+" RPM":"—";
  $("sumQ").textContent=qExpected?fmt(qExpected,5)+" m³/s":"—";
  $("sumV").textContent=vExpected?fmt(vExpected,2)+" m/s":"—";
  $("sumRe").textContent=reExpected?Math.round(reExpected).toLocaleString("pt-BR"):"—";
  $("sumDate").textContent=new Date().toLocaleDateString("pt-BR");
}
function resetLesson(){
  currentStep=0;rpmChosen=qExpected=vExpected=reExpected=null;qOk=vOk=reOk=false;
  ["rpmStudent","qStudent","vStudent","reStudent","observations"].forEach(id=>$(id).value="");
  $("groupName").value="";
  $("rpmNext").disabled=true;$("qNext").disabled=true;$("vNext").disabled=true;$("reNext").disabled=true;
  ["rpmFeedback","qFeedback","vFeedback","reFeedback"].forEach(id=>setFeedback(id,""));
  showStep(0);
}
document.querySelectorAll("[data-next]").forEach(b=>b.addEventListener("click",()=>{
  if(Number(b.dataset.next)===2)chooseRpm();
  showStep(Number(b.dataset.next));
}));
document.querySelectorAll("[data-prev]").forEach(b=>b.addEventListener("click",()=>showStep(Number(b.dataset.prev))));
$("rpmStudent").addEventListener("input",chooseRpm);
$("useLiveRpm").addEventListener("click",useLive);
$("checkQ").addEventListener("click",checkQ);
$("checkV").addEventListener("click",checkV);
$("checkRe").addEventListener("click",checkRe);
$("printLesson").addEventListener("click",()=>{fillSummary();window.print()});
$("resetLesson").addEventListener("click",resetLesson);

showStep(0);
startRealtime();
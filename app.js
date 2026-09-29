import{createClient}from"https://esm.sh/@supabase/supabase-js@2";
const S=createClient("https://pqsedxfgtauxjclityjt.supabase.co","sb_publishable_SN09xuS01Vha1mo3H6rBUQ_EZLR0-0I");
const R=2050,Q=50,C=.00047194745,A=.091*.091,L=.050,D=1.204,M=1.81e-5;
let port=null,reader=null,reading=false,rpm=0,showRe=false,pc=false,pwm=50,remote=false,online=false,last=0,hb=null,busy=false;
const $=x=>document.getElementById(x), quick=[...document.querySelectorAll("[data-p]")];
const fmt=(n,d)=>Number(n).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
function log(t){let e=$("log");e.textContent+=t+"\n";e.scrollTop=e.scrollHeight}
function setP(v){v=Math.max(0,Math.min(100,parseInt(v)||0));pwm=v;$("pwm").value=v;$("pwmBig").textContent=v+"%";$("gauge").style.setProperty("--p",v)}
function vals(){let q=rpm>0?(Q*C)*(rpm/R):0,v=q/A,re=D*v*L/M;return{q,v,re}}
function draw(){let{q,v,re}=vals();$("rpm").textContent=Math.round(rpm).toLocaleString("pt-BR");$("flow").textContent=fmt(q,4);$("vel").textContent=fmt(v,2);$("re").textContent=showRe?Math.round(re).toLocaleString("pt-BR"):"????"}
function ui(){
 const rc=!pc&&online&&remote,can=pc||rc;
 $("connect").disabled=pc||!("serial"in navigator);$("disconnect").disabled=!pc;$("send").disabled=!can;$("pwm").disabled=!can;quick.forEach(b=>b.disabled=!can);
 $("toggleRemote").style.display=pc?"inline-block":"none";$("toggleRemote").disabled=!pc;$("toggleRemote").textContent=remote?"BLOQUEAR NO CELULAR":"LIBERAR NO CELULAR";
 $("remoteGate").classList.toggle("allowed",remote&&online);
 $("remoteState").textContent=pc?(remote?"LIBERADO — o botão mestre está ativo e celulares podem alterar somente a velocidade do fan.":"BLOQUEADO — o botão mestre impede qualquer alteração pelo celular; celulares apenas acompanham os dados."):(online&&remote?"CONTROLE LIBERADO PELO PC — você pode alterar a velocidade do fan.":online?"MODO VISUALIZAÇÃO — o PC bloqueou alterações pelo celular.":"Túnel offline — aguardando o computador conectado ao Arduino.");
 $("status").className=(pc||online)?"status on":"status";$("status").textContent=pc?"● Arduino conectado • transmitindo":online?"● AO VIVO — túnel em operação":"● Túnel offline";
}
async function pub(force=false,sync=false){
 if(!pc)return;let n=Date.now();if(!force&&n-last<700)return;last=n;let{q,v,re}=vals();
 let p={rpm:Math.round(rpm),pwm,velocidade:v,vazao:q,reynolds:re,online:true,updated_at:new Date().toISOString()};if(sync)p.requested_pwm=pwm;
 let{error}=await S.from("tunel_status").update(p).eq("id",1);if(error)log("Nuvem: "+error.message)
}
async function serial(v,rem=false){
 if(!port||!port.writable)return;v=Math.max(0,Math.min(100,parseInt(v)||0));setP(v);let w=port.writable.getWriter();
 try{await w.write(new TextEncoder().encode(v+"\n"));log((rem?"Comando remoto":"PWM enviado")+": "+v+"%");await pub(true,!rem)}finally{w.releaseLock()}
}
async function execRemote(row){
 if(!pc||!row||!row.remote_control||busy)return;let r=Math.max(0,Math.min(100,parseInt(row.requested_pwm)||0));if(r===pwm)return;
 busy=true;try{await serial(r,true)}finally{busy=false}
}
function cloud(row){
 if(!row)return;online=!!row.online&&!!row.updated_at&&(Date.now()-new Date(row.updated_at).getTime()<8000);remote=!!row.remote_control&&online;
 if(pc){ui();execRemote(row);return}
 rpm=Number(row.rpm||0);setP(Number(row.pwm||0));$("rpm").textContent=Math.round(rpm).toLocaleString("pt-BR");$("flow").textContent=fmt(Number(row.vazao||0),4);$("vel").textContent=fmt(Number(row.velocidade||0),2);$("re").textContent=showRe?Math.round(Number(row.reynolds||0)).toLocaleString("pt-BR"):"????";ui()
}
async function startCloud(){
 let{data}=await S.from("tunel_status").select("*").eq("id",1).single();if(data)cloud(data);
 S.channel("tunel-status-live").on("postgres_changes",{event:"UPDATE",schema:"public",table:"tunel_status",filter:"id=eq.1"},p=>cloud(p.new)).subscribe();
 setInterval(async()=>{if(pc)return;let{data}=await S.from("tunel_status").select("*").eq("id",1).single();if(data)cloud(data)},5000)
}
function line(s){
 if(!s)return;log("Arduino: "+s);let p=s.match(/PWM\s*:\s*(\d+)/i);if(p)setP(parseInt(p[1]));let m=s.match(/RPM\s*:\s*(\d+(?:[.,]\d+)?)/i);if(m){rpm=parseFloat(m[1].replace(",","."));draw();pub()}
}
async function readLoop(){
 let d=new TextDecoder(),b="";reading=true;while(port&&port.readable&&reading){reader=port.readable.getReader();try{while(reading){let r=await reader.read();if(r.done)break;if(r.value){b+=d.decode(r.value,{stream:true});let a=b.split(/\r?\n/);b=a.pop();a.forEach(x=>line(x.trim()))}}}catch(e){log("Erro: "+e.message)}finally{try{reader.releaseLock()}catch(e){}reader=null}}
}
async function connect(){
 if(!("serial"in navigator)){alert("Neste dispositivo o painel funciona em modo de acompanhamento.");return}
 try{port=await navigator.serial.requestPort();await port.open({baudRate:9600});pc=true;online=true;remote=false;await S.from("tunel_status").update({online:true,remote_control:false,requested_pwm:pwm,updated_at:new Date().toISOString()}).eq("id",1);ui();log("Conectado em 9600 baud.");await pub(true,true);hb=setInterval(()=>pub(true,false),3000);readLoop()}catch(e){log("Falha: "+e.message);alert("Não foi possível conectar. Feche o Monitor Serial da IDE Arduino e tente novamente.")}
}
async function disconnect(){
 reading=false;if(hb){clearInterval(hb);hb=null}if(pc){let{q,v,re}=vals();await S.from("tunel_status").update({rpm:Math.round(rpm),pwm,velocidade:v,vazao:q,reynolds:re,online:false,remote_control:false,requested_pwm:pwm,updated_at:new Date().toISOString()}).eq("id",1)}
 try{if(reader)await reader.cancel()}catch(e){}try{if(port)await port.close()}catch(e){}port=null;pc=false;online=false;remote=false;ui();log("Desconectado.")
}
async function request(v){
 v=Math.max(0,Math.min(100,parseInt(v)||0));
 if(pc){await serial(v,false);return}
 if(!(online&&remote)){alert("O controle pelo celular está bloqueado pelo operador.");return}
 let old=pwm;setP(v);let{error}=await S.from("tunel_status").update({requested_pwm:v}).eq("id",1);if(error){setP(old);alert("Não foi possível enviar o comando.");log("Nuvem: "+error.message)}else log("Solicitação remota: "+v+"%")
}
async function toggleRemote(){
 if(!pc)return;let next=!remote;remote=next;let{error}=await S.from("tunel_status").update({remote_control:next,requested_pwm:pwm}).eq("id",1);if(error){remote=!next;log("Nuvem: "+error.message)}ui()
}
$("connect").onclick=connect;$("disconnect").onclick=disconnect;$("toggleRemote").onclick=toggleRemote;$("pwm").oninput=e=>{if(pc||(online&&remote))setP(e.target.value)};$("send").onclick=()=>request($("pwm").value);quick.forEach(b=>b.onclick=()=>request(b.dataset.p));
$("toggleRe").onclick=()=>{showRe=!showRe;$("toggleRe").textContent=showRe?"Ocultar resultado":"Mostrar resultado";if(pc)draw();else S.from("tunel_status").select("*").eq("id",1).single().then(({data})=>data&&cloud(data))};
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.tab).classList.add("active")});
navigator.serial?.addEventListener("disconnect",async()=>{port=null;if(hb){clearInterval(hb);hb=null}if(pc)await S.from("tunel_status").update({online:false,remote_control:false,requested_pwm:pwm,updated_at:new Date().toISOString()}).eq("id",1);pc=false;online=false;remote=false;ui();log("Arduino removido.")});
if(!("serial"in navigator)){$("connect").textContent="Modo acompanhamento";$("disconnect").style.display="none"}
setP(50);draw();ui();startCloud();
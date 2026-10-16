"use strict";
const DAY = 86400000;
const TODAY = (()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())})();

/* ---------- field mapping (header row → internal keys) ---------- */
const norm = s => String(s??"").toLowerCase().replace(/[\s.:_\-()\/]/g,"");
const FIELDS = {
  wo:["workorder"], job:["jobno"], open:["opendate"], fin:["finisheddate"], status:["status"],
  brand:["brand"], code:["code","idstation","stationid","stationcode"], name:["name"], inform:["informby"], user:["username"], sup:["sup"],
  problem:["problem"], other:["other"], deadline:["deadline"], addr:["address"], month:["month"],
  reqno:["เลขที่คำขอออนไลน์"], reqdate:["วันที่ยื่นคำขอ"], proc:["สถานะดำเนินการ"], next:["ครบรอบครั้งถัดไป"],
  serialF:["serialnumber","serialno","serial","sn"], installF:["installdate","installationdate"],
  warrantF:["warrantdate","warrantydate","warrantyexpire","warrantyexpiredate"]
};
const REQUIRED = {wo:"Work order", job:"Job no.", name:"Name", proc:"สถานะดำเนินการ", next:"ครบรอบครั้งถัดไป"};
const DATE_KEYS = ["open","fin","deadline","reqdate","next","installF","warrantF"];

function toDate(v){
  if(v===null||v===undefined||v==="") return null;
  if(v instanceof Date) return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==="number"){ if(v>20000&&v<90000){const u=new Date(Math.round((v-25569)*DAY));return new Date(u.getUTCFullYear(),u.getUTCMonth(),u.getUTCDate());} return null; }
  const s=String(v).trim(); let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1],+m[2],+m[3]);
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)$/))){
    let a=+m[1],b=+m[2],y=+m[3]; if(y<100) y+= (y>40?2500:2000);
    const us=/[AP]M/i.test(m[4]); return us?mk(y,a,b):mk(y,b,a);
  }
  return null;
  function mk(y,mo,d){ if(y>2400) y-=543; const dt=new Date(y,mo-1,d); return (dt.getMonth()===mo-1)?dt:null; }
}
function extractSerial(t){
  if(!t) return ""; t=String(t);
  const r=t.match(/(\d{8,})\s*(?:ถึง|-|–|~)\s*(\d{5,})/);
  if(r) return r[1]+" – "+r[2];
  const nums=[...new Set((t.match(/\d{8,}/g)||[]).filter(n=>!(n.length===10&&/^0[689]/.test(n))))];
  return nums.slice(0,3).join(", ")+(nums.length>3?" …":"");
}
function bucketOf(days){
  if(days===null) return "none";
  if(days<0) return "overdue"; if(days<=30) return "d30"; if(days<=60) return "d60"; if(days<=90) return "d90"; return "later";
}
const BUCKETS = [
  {k:"overdue",label:"เลยกำหนดแล้ว",color:"var(--bad)"},
  {k:"d30",label:"ภายใน 30 วัน",color:"var(--warn)"},
  {k:"d60",label:"31–60 วัน",color:"var(--soon)"},
  {k:"d90",label:"61–90 วัน",color:"var(--soon)"},
  {k:"later",label:"มากกว่า 90 วัน",color:"var(--ok)"},
  {k:"none",label:"ยังไม่มีวันครบรอบ",color:"var(--none)"}
];

/* Parse an array-of-arrays (header row + data rows) into job records. Same path for embedded data, uploads and a future SMS API. */
function parseAOA(aoa){
  let h=-1;
  for(let i=0;i<Math.min(aoa.length,10);i++){ const n=(aoa[i]||[]).map(norm); if(n.includes("jobno")||n.includes("workorder")){h=i;break;} }
  if(h<0) throw new Error("ไม่พบแถวหัวตาราง (ต้องมีคอลัมน์ Work order หรือ Job no.) — กรุณาใช้ไฟล์รูปแบบเดียวกับไฟล์ต้นฉบับ");
  const hdr=aoa[h].map(norm), idx={};
  for(const [k,alts] of Object.entries(FIELDS)){
    for(const a of alts){ const i=hdr.findIndex(x=>x===a||(a.length>6&&x.startsWith(a))); if(i>=0){idx[k]=i;break;} }
  }
  const missing=Object.entries(REQUIRED).filter(([k])=>idx[k]===undefined).map(([,l])=>l);
  if(missing.length>2) throw new Error("ไฟล์ไม่ตรงรูปแบบ ขาดคอลัมน์: "+missing.join(", "));
  const out=[];
  for(let r=h+1;r<aoa.length;r++){
    const row=aoa[r]||[]; if(!row.some(c=>c!==""&&c!==null&&c!==undefined)) continue;
    const o={};
    for(const k of Object.keys(FIELDS)){
      const v=idx[k]===undefined?"":row[idx[k]];
      o[k]=DATE_KEYS.includes(k)?toDate(v):(v===null||v===undefined?"":String(v).replace(/_x000D_/g,"").trim());
    }
    if(!o.wo&&!o.job&&!o.name) continue;
    o.serial=o.serialF; o.serialSrc=o.serialF?"file":"";
    o.install=o.installF; o.installSrc=o.installF?"file":"";
    o.warrant=o.warrantF; o.warrantSrc=o.warrantF?"file":"";
    o.due=o.next||o.warrantF;
    o.days=o.due?Math.round((o.due-TODAY)/DAY):null;
    o.bucket=bucketOf(o.days);
    {const k=String(o.job||o.wo||"").trim().replace(/[^A-Za-z0-9_\-.~:@+]/g,"_").slice(0,190); o.fuKey=(k&&k!=="."&&k!=="..")?k:null;}
    o.done=/เรียบร้อย|เสร็จ|complete/i.test(o.proc);
    o.hay=[o.wo,o.job,o.code,o.name,o.serial,o.reqno,o.addr,o.inform,o.user,o.sup,o.brand,o.problem].join(" ").toLowerCase();
    out.push(o);
  }
  return {rows:out, missing};
}

/* ---------- state ---------- */
const S={all:[],src:null,tab:"renew",bucket:"active",renewMonth:null,fu:{},names:{},fFu:"any",loadedV:null,
  f:{q:"",brand:"",proc:"",sup:"",user:"",month:""},
  sort:{renew:{k:"next",d:1},all:{k:"open",d:-1}}, page:{renew:0,all:0}};
const PAGE=50;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtD=d=>d?String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear():"";
const TH_M=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const mKey=d=>d.getFullYear()*100+d.getMonth();
const mLabel=k=>TH_M[k%100]+String((Math.floor(k/100)+543)%100);
const nf=n=>n.toLocaleString("th-TH");

function load(aoa,src){
  const {rows,missing}=parseAOA(aoa);
  S.all=rows; S.src=src; S.page={renew:0,all:0}; S.renewMonth=null;
  buildFilterOptions(); render();
  return missing;
}

function buildFilterOptions(){
  const opt=(id,label,key,sorter)=>{
    const cnt={}; S.all.forEach(r=>{const v=r[key];if(v)cnt[v]=(cnt[v]||0)+1;});
    let keys=Object.keys(cnt); keys=sorter?keys.sort(sorter):keys.sort((a,b)=>cnt[b]-cnt[a]);
    const sel=$(id), cur=S.f[id.slice(1).toLowerCase()];
    sel.innerHTML=`<option value="">${label}: ทั้งหมด</option>`+keys.map(k=>`<option value="${esc(k)}">${esc(k)} (${cnt[k]})</option>`).join("");
    sel.value=keys.includes(cur)?cur:"";
  };
  opt("fBrand","Brand","brand"); opt("fProc","สถานะดำเนินการ","proc"); opt("fSup","Sup.","sup"); opt("fUser","UserName","user");
  const mo={}; S.all.forEach(r=>{if(r.month&&r.open){mo[r.month]=Math.max(mo[r.month]||0,+r.open);}else if(r.month&&!(r.month in mo))mo[r.month]=0;});
  const ms=Object.keys(mo).sort((a,b)=>mo[b]-mo[a]);
  const cntM={}; S.all.forEach(r=>{if(r.month)cntM[r.month]=(cntM[r.month]||0)+1;});
  $("fMonth").innerHTML=`<option value="">Month: ทั้งหมด</option>`+ms.map(k=>`<option value="${esc(k)}">${esc(k)} (${cntM[k]})</option>`).join("");
  $("fMonth").value=ms.includes(S.f.month)?S.f.month:"";
}
function syncF(){ S.f.brand=$("fBrand").value; S.f.proc=$("fProc").value; S.f.sup=$("fSup").value; S.f.user=$("fUser").value; S.f.month=$("fMonth").value; }

function filtered(){
  const f=S.f, q=f.q.trim().toLowerCase();
  return S.all.filter(r=>(!f.brand||r.brand===f.brand)&&(!f.proc||r.proc===f.proc)&&(!f.sup||r.sup===f.sup)&&(!f.user||r.user===f.user)&&(!f.month||r.month===f.month)&&(!q||r.hay.includes(q)));
}

/* ---------- render ---------- */
function render(){
  for(const r of S.all){const f=r.fuKey&&S.fu[r.fuKey]; r.fuS=f&&f.s?FU.findIndex(o=>o.k===f.s):0;}
  const rows=filtered();
  renderSrc(); renderKpis(rows); renderMonth(rows); renderRenewChart(rows); renderBrand(rows);
  renderChips(rows); renderTables(rows);
}
function renderSrc(){ $("srcinfo").innerHTML=""; }
function renderKpis(rows){
  const done=rows.filter(r=>r.done).length, pend=rows.length-done;
  const soon=rows.filter(r=>["d30","d60","d90"].includes(r.bucket)).length;
  const over=rows.filter(r=>r.bucket==="overdue").length;
  const d30=rows.filter(r=>r.bucket==="d30").length;
  const pct=rows.length?Math.round(done/rows.length*100):0;
  $("kpis").innerHTML=`
    <div class="kpi">${S.src&&S.src.at?`<span class="upd">อัปเดต ${fmtDT(S.src.at)}</span>`:""}<span class="l">งานตีตราทั้งหมด</span><span class="v">${nf(rows.length)}</span><span class="s">ตามตัวกรองปัจจุบัน</span></div>
    <div class="kpi ok"><span class="l">ดำเนินการเรียบร้อย</span><span class="v">${nf(done)}</span><span class="s">${pct}% ของงานทั้งหมด</span></div>
    <button class="kpi warn click" type="button" data-proc="pending"><span class="l">รอดำเนินการ</span><span class="v">${nf(pend)}</span><span class="s">ยังไม่ได้ตีตรา / ยื่นคำขอ</span></button>
    <button class="kpi click" type="button" data-b="soon" style="${soon?'':''}"><span class="l">ครบรอบภายใน 90 วัน</span><span class="v" style="color:var(--warn)">${nf(soon)}</span><span class="s">ใน 30 วัน: ${nf(d30)} รายการ</span></button>
    <button class="kpi bad click" type="button" data-b="overdue"><span class="l">เลยกำหนดครบรอบ</span><span class="v">${nf(over)}</span><span class="s">ต้องติดต่อลูกค้าด่วน</span></button>`;
  $("kpis").querySelectorAll("[data-b]").forEach(b=>b.onclick=()=>{S.bucket=b.dataset.b==="soon"?"active":b.dataset.b;S.renewMonth=null;setTab("renew");render();$("panelRenew").scrollIntoView({behavior:"smooth",block:"start"});});
  $("kpis").querySelector("[data-proc]").onclick=()=>{const p=S.all.find(r=>!r.done&&r.proc);if(p){$("fProc").value=p.proc;syncF();}setTab("all");render();$("panelAll").scrollIntoView({behavior:"smooth",block:"start"});};
}
function colChart(el,items,opts={}){
  const max=Math.max(1,...items.map(i=>i.parts.reduce((a,p)=>a+p.v,0)));
  el.innerHTML=`<div class="cols">${items.map((it,i)=>{const t=it.parts.reduce((a,p)=>a+p.v,0);
    return `<${opts.click?'button type="button"':'div'} class="col${opts.click?' click':''}${it.sel?' sel':''}" data-i="${i}" title="${esc(it.title||'')}">
      <span class="val">${t||""}</span><span class="stack" style="height:${t/max*100}%">${it.parts.map(p=>`<span style="height:${t?p.v/t*100:0}%;background:${p.c}"></span>`).join("")}</span></${opts.click?'button':'div'}>`}).join("")}</div>
    <div class="xlab">${items.map(it=>`<span>${esc(it.label)}</span>`).join("")}</div>`;
  if(opts.click) el.querySelectorAll(".col").forEach(b=>b.onclick=()=>opts.click(items[+b.dataset.i]));
}
function renderMonth(rows){
  const m={}; rows.forEach(r=>{if(!r.open)return;const k=mKey(r.open);m[k]=m[k]||{d:0,p:0};r.done?m[k].d++:m[k].p++;});
  const ks=Object.keys(m).map(Number).sort((a,b)=>a-b).slice(-14);
  if(!ks.length){$("chMonth").innerHTML='<div class="empty">ไม่มีข้อมูล</div>';return;}
  colChart($("chMonth"),ks.map(k=>({label:mLabel(k),title:`${mLabel(k)} · เรียบร้อย ${m[k].d} · รอ ${m[k].p}`,parts:[{v:m[k].d,c:"var(--accent)"},{v:m[k].p,c:"var(--pending)"}]})));
}
function renderRenewChart(rows){
  const start=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);
  const items=[]; const over=rows.filter(r=>r.bucket==="overdue").length;
  items.push({label:"เลยกำหนด",key:"overdue",title:`เลยกำหนดแล้ว ${over} รายการ`,parts:[{v:over,c:"var(--bad)"}],sel:S.renewMonth==="overdue"});
  for(let i=0;i<12;i++){
    const d=new Date(start.getFullYear(),start.getMonth()+i,1), k=mKey(d);
    const inM=rows.filter(r=>r.due&&r.days>=0&&mKey(r.due)===k);
    const c=b=>inM.filter(r=>r.bucket===b).length;
    items.push({label:mLabel(k),key:k,title:`${mLabel(k)} · ${inM.length} รายการ`,sel:S.renewMonth===k,
      parts:[{v:c("d30"),c:"var(--warn)"},{v:c("d60")+c("d90"),c:"var(--soon)"},{v:c("later"),c:"var(--ok)"}]});
  }
  colChart($("chRenew"),items,{click:it=>{S.renewMonth=S.renewMonth===it.key?null:it.key;S.bucket="all";S.page.renew=0;setTab("renew");render();}});
}
function renderBrand(rows){
  const b={}; rows.forEach(r=>{const k=r.brand||"(ไม่ระบุ)";b[k]=b[k]||{d:0,p:0};r.done?b[k].d++:b[k].p++;});
  const ks=Object.keys(b).sort((x,y)=>(b[y].d+b[y].p)-(b[x].d+b[x].p));
  const max=Math.max(1,...ks.map(k=>b[k].d+b[k].p));
  $("chBrand").innerHTML=ks.length?ks.map(k=>{const t=b[k].d+b[k].p;return `<button type="button" class="hbar${S.f.brand===k?' sel':''}" data-k="${esc(k)}" title="${esc(k)} · เรียบร้อย ${b[k].d} · รอ ${b[k].p}">
    <span>${esc(k)}</span><span class="track"><span style="width:${b[k].d/max*100}%;background:var(--accent)"></span><span style="width:${b[k].p/max*100}%;background:var(--pending)"></span></span><span class="n">${t}</span></button>`}).join(""):'<div class="empty">ไม่มีข้อมูล</div>';
  $("chBrand").querySelectorAll(".hbar").forEach(x=>x.onclick=()=>{const k=x.dataset.k;$("fBrand").value=S.f.brand===k?"":k;syncF();S.page={renew:0,all:0};render();});
}
function renderChips(rows){
  const c={}; rows.forEach(r=>c[r.bucket]=(c[r.bucket]||0)+1);
  const active=(c.overdue||0)+(c.d30||0)+(c.d60||0)+(c.d90||0);
  const chips=[{k:"active",label:"ต้องติดตาม (เลยกำหนด + ≤90 วัน)",n:active,color:"var(--warn)"},...BUCKETS.map(b=>({...b,n:c[b.k]||0})),{k:"all",label:"ทั้งหมด",n:rows.length,color:"var(--muted)"}];
  let html=chips.map(ch=>`<button type="button" class="chipbtn" aria-pressed="${S.bucket===ch.k&&S.renewMonth===null}" data-k="${ch.k}"><span class="dot" style="background:${ch.color}"></span>${ch.label}<span class="num">${nf(ch.n)}</span></button>`).join("");
  if(S.renewMonth!==null) html+=`<button type="button" class="chipbtn" aria-pressed="true" data-k="clearMonth">${S.renewMonth==="overdue"?"เลยกำหนด":"ครบรอบเดือน "+mLabel(S.renewMonth)} ✕</button>`;
  $("bucketChips").innerHTML=html;
  $("bucketChips").querySelectorAll(".chipbtn").forEach(b=>b.onclick=()=>{if(b.dataset.k==="clearMonth"){S.renewMonth=null;}else{S.bucket=b.dataset.k;S.renewMonth=null;}S.page.renew=0;render();});
}

/* ---------- tables ---------- */
const pillProc=r=>r.proc?`<span class="pill ${r.done?'p-done':'p-pend'}">${esc(r.proc)}</span>`:"";
const pillDays=r=>{const b=BUCKETS.find(x=>x.k===r.bucket);
  const t=r.days===null?"ไม่มีวันครบรอบ":r.days<0?`เลยมา ${nf(-r.days)} วัน`:r.days===0?"ครบวันนี้":`อีก ${nf(r.days)} วัน`;
  return `<span class="pill p-${r.bucket}" title="${b.label}">${t}</span>`;};
const dCell=(d,src)=>d?(src==="calc"?`<span class="derived" title="คำนวณจากข้อมูลในไฟล์">${fmtD(d)}</span>`:fmtD(d)):"";
const snCell=r=>r.serial?`<span class="sn${r.serialSrc==='other'?' derived':''}" ${r.serialSrc==='other'?'title="ดึงจากช่อง Other"':''}>${esc(r.serial)}</span>`:'';
const txt=(k,cls)=>({k,cls,r:r=>cls==="clamp"?`<div>${esc(r[k])}</div>`:esc(r[k])});
/* เบอร์โทรไทย (มือถือ 10 หลัก / บ้าน 9 หลัก) → ลิงก์ tel: ให้ 3CX หรือโปรแกรมโทรศัพท์โทรออกได้ */
const TEL_RE=/(\+66[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}|(?<!\d)0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}(?!\d))/g;
function telify(s){
  return esc(s).replace(TEL_RE,m=>{let d=m.replace(/\D/g,""); if(d.startsWith("66")) d="0"+d.slice(2);
    if(d.length<9||d.length>10) return m;
    return `<a class="tel" href="tel:${d}" title="โทร ${d} ผ่าน 3CX">${m}</a>`;});
}
const telTxt=(k,cls)=>({k,cls,r:r=>cls==="clamp"?`<div>${telify(r[k])}</div>`:telify(r[k])});
const dt=k=>({k,cls:"nw",r:r=>fmtD(r[k])});

function fuCell(r){
  const key=r.fuKey, f=key&&S.fu[key], st=(f&&f.s)||"";
  const meta=f&&f.at?`<div class="fumeta">${f.note?esc(f.note)+"<br>":""}${esc(S.names[f.by]||"")} ${fmtDT(f.at)}</div>`:"";
  if(DB&&CAN_FU&&key) return `<select class="fusel" data-key="${esc(key)}" aria-label="สถานะการติดตาม">${FU.map(o=>`<option value="${o.k}"${o.k===st?" selected":""}>${o.label}</option>`).join("")}</select>${meta}`;
  const o=FU.find(x=>x.k===st)||FU[0]; return `<span class="pill p-${o.cls}">${o.label}</span>${meta}`;
}
const COLS_RENEW=[
  {k:"days",label:"สถานะครบรอบ",cls:"nw",r:pillDays},
  {k:"fuS",label:"การติดตาม",cls:"nw",hl:1,r:fuCell},
  {label:"ครบรอบครั้งถัดไป",...dt("next")},
  {label:"ID Station",...txt("code","nw")},{label:"Name",...txt("name","wide")},{label:"Brand",...txt("brand","nw")},
  {label:"Other (ผลตีตราครั้งที่แล้ว)",...txt("other","clamp")},
  {label:"InformBy (ผู้ติดต่อ)",...telTxt("inform","wide")},{label:"Address",...telTxt("addr","clamp")},
  {label:"เลขที่คำขอออนไลน์",...txt("reqno","nw")},{label:"Work order",...txt("wo","nw")},{label:"Job no.",...txt("job","nw")},{label:"Sup.",...txt("sup","wide")}
];
const COLS_ALL=[
  {k:"proc",label:"สถานะดำเนินการ",cls:"nw",r:pillProc},
  {label:"Work order",...txt("wo","nw")},{label:"Job no.",...txt("job","nw")},
  {label:"Open date",...dt("open")},{label:"Finished date",...dt("fin")},
  {label:"Brand",...txt("brand","nw")},{label:"ID Station",...txt("code","nw")},{label:"Name",...txt("name","wide")},
  {label:"InformBy",...telTxt("inform","wide")},{label:"UserName",...telTxt("user","wide")},{label:"Sup.",...txt("sup","wide")},
  {label:"Problem",...txt("problem","clamp")},{label:"Other",...txt("other","clamp")},
  {label:"Deadline",...dt("deadline")},{label:"Address",...telTxt("addr","clamp")},{label:"Month",...txt("month","nw")},
  {label:"เลขที่คำขอออนไลน์",...txt("reqno","nw")},{label:"วันที่ยื่นคำขอ",...dt("reqdate")},
  {label:"ครบรอบครั้งถัดไป",...dt("next")},
  {k:"serial",label:"SerialNumber",hl:1,r:snCell},
  {k:"install",label:"InstallDate",cls:"nw",hl:1,r:r=>dCell(r.install,r.installSrc)},
  {k:"warrant",label:"WarrantDate",cls:"nw",hl:1,r:r=>dCell(r.warrant,r.warrantSrc)}
];
function sortVal(r,k){const v=r[k]; if(v instanceof Date) return +v; if(v===null||v===undefined||v==="") return null; return typeof v==="number"?v:String(v);}
function sortRows(rows,s){
  return rows.slice().sort((a,b)=>{const x=sortVal(a,s.k),y=sortVal(b,s.k);
    if(x===null&&y===null) return 0; if(x===null) return 1; if(y===null) return -1;
    return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"th"))*s.d;});
}
function renderTable(which,rows,cols){
  const s=S.sort[which]; rows=sortRows(rows,s);
  const pages=Math.max(1,Math.ceil(rows.length/PAGE)); S.page[which]=Math.min(S.page[which],pages-1);
  const p=S.page[which], slice=rows.slice(p*PAGE,(p+1)*PAGE);
  const t=$(which==="renew"?"tRenew":"tAll");
  t.innerHTML=`<thead><tr>${cols.map(c=>`<th data-k="${c.k}" class="${c.hl?'hl':''}">${esc(c.label)}${s.k===c.k?`<span class="ar">${s.d>0?"▲":"▼"}</span>`:""}</th>`).join("")}</tr></thead>
    <tbody>${slice.length?slice.map(r=>`<tr data-i="${S.all.indexOf(r)}">${cols.map(c=>`<td class="${c.cls||''}">${c.r(r)}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${cols.length}" class="empty">ไม่มีรายการตามตัวกรองนี้</td></tr>`}</tbody>`;
  t.querySelectorAll("th").forEach(th=>th.onclick=()=>{const k=th.dataset.k;s.d=s.k===k?-s.d:1;s.k=k;render();});
  t.querySelectorAll("tbody tr[data-i]").forEach(tr=>tr.onclick=e=>{if(e.target.closest("select,button,textarea,a"))return;if(window.getSelection().toString())return;openDrawer(S.all[+tr.dataset.i]);});
  t.querySelectorAll(".fusel").forEach(sel=>sel.onchange=()=>{const k=sel.dataset.key;const f=S.fu[k];saveFU(k,sel.value,(f&&f.note)||"");});
  const pg=$(which==="renew"?"pRenew":"pAll");
  pg.innerHTML=`<span class="muted">แสดง ${rows.length?nf(p*PAGE+1):0}–${nf(Math.min((p+1)*PAGE,rows.length))} จาก ${nf(rows.length)} รายการ</span>
    <span class="b"><button class="btn" type="button" data-d="-1" ${p===0?"disabled":""}>ก่อนหน้า</button><span class="muted" style="align-self:center">หน้า ${p+1}/${pages}</span><button class="btn" type="button" data-d="1" ${p>=pages-1?"disabled":""}>ถัดไป</button></span>`;
  pg.querySelectorAll("button").forEach(b=>b.onclick=()=>{S.page[which]+= +b.dataset.d;render();});
}
function renderTables(rows){
  let ren=rows;
  if(S.renewMonth==="overdue") ren=rows.filter(r=>r.bucket==="overdue");
  else if(S.renewMonth!==null) ren=rows.filter(r=>r.due&&r.days>=0&&mKey(r.due)===S.renewMonth);
  else if(S.bucket==="active") ren=rows.filter(r=>["overdue","d30","d60","d90"].includes(r.bucket));
  else if(S.bucket!=="all") ren=rows.filter(r=>r.bucket===S.bucket);
  if(S.fFu!=="any") ren=ren.filter(r=>((r.fuKey&&S.fu[r.fuKey]&&S.fu[r.fuKey].s)||"")===S.fFu);
  $("cRenew").textContent=nf(ren.length); $("cAll").textContent=nf(rows.length);
  renderTable("renew",ren,COLS_RENEW); renderTable("all",rows,COLS_ALL);
}
function setTab(t){S.tab=t;$("tabRenew").setAttribute("aria-selected",t==="renew");$("tabAll").setAttribute("aria-selected",t==="all");$("panelRenew").hidden=t!=="renew";$("panelAll").hidden=t!=="all";try{localStorage.setItem("set-seal-tab",t)}catch(e){}}

function openDrawer(r){
  $("dSub").textContent=[r.brand,r.wo,r.job].filter(Boolean).join(" · ");
  $("dTitle").textContent=r.name||"(ไม่ระบุชื่อสถานี)";
  const rows=[["สถานะครบรอบ",pillDays(r)],["WarrantDate",dCell(r.warrant,r.warrantSrc)],["SerialNumber",snCell(r)],["InstallDate",dCell(r.install,r.installSrc)],
    ["สถานะดำเนินการ",pillProc(r)],["เลขที่คำขอออนไลน์",esc(r.reqno)],["วันที่ยื่นคำขอ",fmtD(r.reqdate)],["ครบรอบครั้งถัดไป",fmtD(r.next)],
    ["ID Station",esc(r.code)],["Work order",esc(r.wo)],["Job no.",esc(r.job)],["Open date",fmtD(r.open)],["Finished date",fmtD(r.fin)],["Deadline",fmtD(r.deadline)],["Month",esc(r.month)],
    ["InformBy",telify(r.inform)],["UserName",telify(r.user)],["Sup.",esc(r.sup)],["Address",telify(r.addr)],["Problem",esc(r.problem)],["Other",esc(r.other)]];
  $("dBody").innerHTML=rows.map(([k,v])=>`<dt>${k}</dt><dd>${v||'<span class="muted">—</span>'}</dd>`).join("");
  const key=r.fuKey, f=(key&&S.fu[key])||{}, box=$("dFu");
  box.hidden=!(DB&&key);
  if(DB&&key){
    const who=f.at?`ล่าสุด: ${esc(S.names[f.by]||"")} ${fmtDT(f.at)}`:"ยังไม่มีการบันทึก";
    if(CAN_FU){
      box.innerHTML=`<h3>การติดตามลูกค้า</h3>
        <select id="dFuS" aria-label="สถานะการติดตาม">${FU.map(o=>`<option value="${o.k}"${o.k===(f.s||"")?" selected":""}>${o.label}</option>`).join("")}</select>
        <textarea id="dFuN" rows="3" maxlength="1000" placeholder="บันทึก เช่น โทรคุยผู้จัดการสถานีแล้ว นัดยื่นคำขอสัปดาห์หน้า">${esc(f.note||"")}</textarea>
        <div class="furow"><button class="btn primary" id="dFuSave" type="button">บันทึกการติดตาม</button><span class="muted" id="dFuMsg">${who}</span></div>`;
      $("dFuSave").onclick=async()=>{$("dFuSave").disabled=true;const ok=await saveFU(key,$("dFuS").value,$("dFuN").value.trim());$("dFuSave").disabled=false;if(ok)$("dFuMsg").textContent="บันทึกแล้ว · ทุกคนเห็นทันที";};
    }else{
      const o=FU.find(x=>x.k===(f.s||""))||FU[0];
      box.innerHTML=`<h3>การติดตามลูกค้า</h3><div><span class="pill p-${o.cls}">${o.label}</span></div>${f.note?`<div style="white-space:pre-wrap">${esc(f.note)}</div>`:""}<div class="muted">${who}</div>`;
    }
  }
  $("drawer").hidden=false; $("dClose").focus();
}
$("dClose").onclick=()=>$("drawer").hidden=true;
$("drawer").onclick=e=>{if(e.target.id==="drawer")$("drawer").hidden=true;};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("drawer").hidden=true;});

/* ================= Supabase: login, shared data, realtime ================= */
const CFG = window.SET_CONFIG || {};
let DB = null, UID = null, ROLE = null, CAN_UP = false, CAN_FU = false, CH = null;
const FU = [
  {k:"",label:"ยังไม่ติดต่อ",cls:"none"},{k:"contacted",label:"ติดต่อแล้ว",cls:"d60"},
  {k:"waiting",label:"รอลูกค้าตัดสินใจ",cls:"d30"},{k:"renewed",label:"ตกลงต่อสัญญา",cls:"later"},
  {k:"declined",label:"ไม่ต่อสัญญา",cls:"overdue"}
];
const ROLES = {admin:"ผู้ดูแล (Upload ได้)", staff:"ทีมติดตาม (บันทึกได้)", viewer:"ดูอย่างเดียว"};
const SHARE_KEYS = Object.keys(FIELDS);
const isoD = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const fmtDT = s => { const d = new Date(s); return isNaN(d) ? "" : fmtD(d)+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); };
const toEmail = u => { u = u.trim(); return u.includes("@") ? u : u.toLowerCase()+"@"+(CFG.USERNAME_DOMAIN || "set.local"); };
function sbMsg(e){
  const m = (e && (e.message || e.error_description)) || "";
  if (e && (e.code === "42501" || /row-level security|permission denied/i.test(m))) return "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้";
  if (/Failed to fetch|NetworkError/i.test(m)) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";
  return m || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
}
function banner(msg, kind){ const b = $("banner"); b.className = "banner "+kind; b.textContent = msg; b.hidden = !msg; if (kind === "ok") setTimeout(()=>{ if (b.textContent === msg) b.hidden = true; }, 6000); }

async function fetchAll(table, cols, mod){
  const out = [];
  for (let from = 0; ; from += 1000){
    let q = DB.from(table).select(cols);
    if (mod) q = mod(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
async function loadProfiles(){
  S.profiles = await fetchAll("profiles", "id,username,display_name,role,created_at", q => q.order("created_at"));
  S.names = {}; S.profiles.forEach(p => S.names[p.id] = p.display_name || p.username || "");
}
async function loadState(){
  const { data, error } = await DB.from("app_state").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data || {};
}
async function loadJobs(st){
  S.loadedV = st.current_batch || null;
  if (!st.current_batch){
    S.all = []; S.src = {name:"ยังไม่มีข้อมูล", mode:"none"}; buildFilterOptions(); render();
    banner(CAN_UP ? "ยังไม่มีข้อมูล กด Upload ไฟล์ Excel เพื่อเริ่มใช้งาน" : "ยังไม่มีข้อมูล รอผู้ดูแล Upload ไฟล์", "err");
    return;
  }
  const rows = await fetchAll("jobs", "data", q => q.eq("batch_id", st.current_batch).order("id"));
  if (S.loadedV !== st.current_batch) return;
  const aoa = [SHARE_KEYS.map(k => FIELDS[k][0])];
  rows.forEach(r => aoa.push(SHARE_KEYS.map(k => (r.data && r.data[k] != null) ? r.data[k] : "")));
  load(aoa, {name: st.file_name, at: st.uploaded_at, by: st.uploaded_by, mode: "shared"});
}
async function loadFU(){
  const rows = await fetchAll("followups", "job_key,status,note,updated_by,updated_at");
  S.fu = {}; rows.forEach(r => S.fu[r.job_key] = {s: r.status, note: r.note, by: r.updated_by, at: r.updated_at});
}

async function publishShared(records, name){
  const batch = (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const rows = records.map(o => ({
    batch_id: batch, job_key: o.fuKey,
    data: Object.fromEntries(SHARE_KEYS.map(k => [k, o[k] instanceof Date ? isoD(o[k]) : (o[k] == null ? "" : o[k])]))
  }));
  try{
    for (let i = 0; i < rows.length; i += 400){
      banner(`กำลังบันทึกข้อมูล… ${nf(Math.min(i + 400, rows.length))}/${nf(rows.length)}`, "ok");
      const { error } = await DB.from("jobs").insert(rows.slice(i, i + 400));
      if (error) throw error;
    }
    const { error } = await DB.rpc("finish_upload", {p_batch: batch, p_file_name: name});
    if (error) throw error;
  }catch(e){
    try{ await DB.from("jobs").delete().eq("batch_id", batch); }catch(_){}
    throw e;
  }
}

const fuQueue = {};
async function saveFU(key, s, note){
  if (!DB || !CAN_FU){ banner("บัญชีนี้บันทึกการติดตามไม่ได้", "err"); return false; }
  const prev = S.fu[key];
  S.fu[key] = {s, note, by: UID, at: new Date().toISOString()}; render();
  const run = async () => {
    const { data, error } = await DB.from("followups").upsert({job_key: key, status: s, note}, {onConflict: "job_key"}).select().single();
    if (error) throw error;
    S.fu[key] = {s: data.status, note: data.note, by: data.updated_by, at: data.updated_at};
  };
  const p = (fuQueue[key] || Promise.resolve()).catch(()=>{}).then(run); fuQueue[key] = p;
  try{ await p; render(); return true; }
  catch(e){ if (prev) S.fu[key] = prev; else delete S.fu[key]; render(); banner(sbMsg(e), "err"); return false; }
}

function subscribe(){
  if (CH) DB.removeChannel(CH);
  CH = DB.channel("set-live")
    .on("postgres_changes", {event: "*", schema: "public", table: "followups"}, p => {
      const r = p.new;
      if (!r || !r.job_key) return;
      S.fu[r.job_key] = {s: r.status, note: r.note, by: r.updated_by, at: r.updated_at};
      if (r.updated_by && !(r.updated_by in S.names)) loadProfiles().then(render).catch(()=>{});
      render();
    })
    .on("postgres_changes", {event: "UPDATE", schema: "public", table: "app_state"}, p => {
      const st = p.new || {};
      if (st.current_batch && st.current_batch !== S.loadedV){
        banner("มีข้อมูลชุดใหม่ กำลังโหลด…", "ok");
        loadProfiles().catch(()=>{}).then(() => loadJobs(st)).then(() => banner(`อัปเดตเป็นข้อมูลชุดใหม่แล้ว · ${st.file_name || ""}`, "ok")).catch(e => banner(sbMsg(e), "err"));
      }
    })
    .subscribe();
}

/* ---------- upload ---------- */
async function handleFile(file){
  if (!file) return;
  if (!CAN_UP){ banner("เฉพาะผู้ดูแลที่ Upload ข้อมูลได้", "err"); return; }
  if (typeof XLSX === "undefined"){ banner("โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง", "err"); return; }
  try{
    const wb = XLSX.read(await file.arrayBuffer(), {type: "array", cellDates: false});
    let ws = null;
    for (const n of wb.SheetNames){ const a = XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, raw: true, defval: ""}).slice(0, 10); if (a.some(r => r.map(norm).includes("jobno"))){ ws = wb.Sheets[n]; break; } }
    ws = ws || wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: ""});
    const { rows, missing } = parseAOA(aoa);
    if (!rows.length) throw new Error("ไม่พบรายการงานในไฟล์นี้");
    $("uploadBtn").disabled = true;
    await publishShared(rows, file.name);
    const st = await loadState(); await loadProfiles(); await loadJobs(st);
    banner(`อัปเดตข้อมูลจาก ${file.name} แล้ว · ${nf(rows.length)} งาน — ทุกคนเห็นข้อมูลชุดนี้ทันที` + (missing.length ? ` (ไม่พบคอลัมน์: ${missing.join(", ")})` : ""), "ok");
  }catch(err){ banner(err && err.message && !err.code ? err.message : sbMsg(err), "err"); }
  finally{ $("uploadBtn").disabled = false; }
}
$("uploadBtn").onclick = () => $("file").click();
$("file").onchange = e => { handleFile(e.target.files[0]); e.target.value = ""; };
let dragN = 0;
window.addEventListener("dragenter", e => { if (!CAN_UP) return; if ([...e.dataTransfer.types].includes("Files")){ dragN++; $("dropover").hidden = false; } });
window.addEventListener("dragleave", () => { if (--dragN <= 0){ dragN = 0; $("dropover").hidden = true; } });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => { e.preventDefault(); dragN = 0; $("dropover").hidden = true; if (CAN_UP) handleFile(e.dataTransfer.files[0]); });

/* ---------- filters & tabs ---------- */
let qT; $("q").oninput = e => { clearTimeout(qT); qT = setTimeout(() => { S.f.q = e.target.value; S.page = {renew: 0, all: 0}; render(); }, 150); };
["fBrand","fProc","fSup","fUser","fMonth"].forEach(id => $(id).onchange = () => { syncF(); S.page = {renew: 0, all: 0}; render(); });
$("fFu").innerHTML = `<option value="any">การติดตาม: ทั้งหมด</option>` + FU.map(o => `<option value="${o.k}">${o.label}</option>`).join("");
$("fFu").onchange = e => { S.fFu = e.target.value; S.page.renew = 0; render(); };
$("clearF").onclick = () => { S.f = {q:"",brand:"",proc:"",sup:"",user:"",month:""}; $("q").value = ""; ["fBrand","fProc","fSup","fUser","fMonth"].forEach(id => $(id).value = ""); S.renewMonth = null; S.page = {renew: 0, all: 0}; render(); };
$("tabRenew").onclick = () => setTab("renew"); $("tabAll").onclick = () => setTab("all");

/* ---------- login / account ---------- */
const wrapEl = document.querySelector(".wrap");
function showLogin(msg){
  if (CH){ DB.removeChannel(CH); CH = null; }
  UID = null; ROLE = null; CAN_UP = CAN_FU = false; S.all = []; S.fu = {};
  wrapEl.classList.add("locked"); $("login").hidden = false; $("drawer").hidden = true; $("panel2").hidden = true;
  $("lgErr").textContent = msg || ""; $("lgErr").hidden = !msg;
  setTimeout(() => $("lgUser").focus(), 0);
}
$("lgForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u = $("lgUser").value, p = $("lgPass").value;
  if (!u.trim() || !p){ $("lgErr").textContent = "กรอกชื่อผู้ใช้และรหัสผ่าน"; $("lgErr").hidden = false; return; }
  $("lgBtn").disabled = true; $("lgBtn").textContent = "กำลังเข้าสู่ระบบ…"; $("lgErr").hidden = true;
  const { data, error } = await DB.auth.signInWithPassword({email: toEmail(u), password: p});
  $("lgBtn").disabled = false; $("lgBtn").textContent = "เข้าสู่ระบบ";
  if (error){ $("lgErr").textContent = /invalid/i.test(error.message) ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : sbMsg(error); $("lgErr").hidden = false; return; }
  $("lgPass").value = "";
  start(data.session);
});

async function start(session){
  UID = session.user.id;
  $("login").hidden = true; wrapEl.classList.remove("locked");
  S.src = {name: "กำลังโหลดข้อมูล…", mode: "wait"}; render();
  try{
    await loadProfiles();
    const me = S.profiles.find(p => p.id === UID);
    ROLE = me ? me.role : "viewer"; CAN_UP = ROLE === "admin"; CAN_FU = ROLE === "admin" || ROLE === "staff";
    S.me = {name: (me && (me.display_name || me.username)) || session.user.email, avatarUrl: ""};
    renderWho();
    $("uploadBtn").hidden = !CAN_UP; $("usersBtn").hidden = !CAN_UP;
    const st = await loadState();
    await Promise.all([loadJobs(st), loadFU()]);
    render(); subscribe();
  }catch(e){ banner(sbMsg(e), "err"); }
}

$("logoutBtn").onclick = async () => { await DB.auth.signOut(); showLogin(); };

/* side panel: users + password */
function openPanel(title, html){ $("p2Title").textContent = title; $("p2Body").innerHTML = html; $("panel2").hidden = false; }
$("p2Close").onclick = () => $("panel2").hidden = true;
$("panel2").onclick = e => { if (e.target.id === "panel2") $("panel2").hidden = true; };
document.addEventListener("keydown", e => { if (e.key === "Escape") $("panel2").hidden = true; });

$("pwBtn").onclick = () => {
  openPanel("เปลี่ยนรหัสผ่าน", `
    <form id="pwForm" class="stack">
      <label for="pw1">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input id="pw1" type="password" autocomplete="new-password" minlength="8" required>
      <label for="pw2">ยืนยันรหัสผ่านใหม่</label><input id="pw2" type="password" autocomplete="new-password" minlength="8" required>
      <div class="furow"><button class="btn primary" type="submit" id="pwSave">บันทึกรหัสผ่าน</button><span class="muted" id="pwMsg"></span></div>
    </form>`);
  $("pwForm").onsubmit = async e => {
    e.preventDefault();
    const a = $("pw1").value, b = $("pw2").value;
    if (a.length < 8){ $("pwMsg").textContent = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"; return; }
    if (a !== b){ $("pwMsg").textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน"; return; }
    $("pwSave").disabled = true;
    const { error } = await DB.auth.updateUser({password: a});
    $("pwSave").disabled = false;
    $("pwMsg").textContent = error ? sbMsg(error) : "เปลี่ยนรหัสผ่านแล้ว";
    if (!error){ $("pw1").value = ""; $("pw2").value = ""; }
  };
};

const DOMAIN = () => CFG.USERNAME_DOMAIN || "set.local";
const loginName = e => { if (!e) return ""; const d = "@" + DOMAIN(); return e.toLowerCase().endsWith(d) ? e.slice(0, -d.length) : e; };
function genPw(){ const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const a = crypto.getRandomValues(new Uint32Array(10)); return Array.from(a, x => c[x % c.length]).join(""); }
async function copyText(t, el){ try{ await navigator.clipboard.writeText(t); el.textContent = "คัดลอกแล้ว"; }catch(e){ el.textContent = "คัดลอกไม่ได้ กรุณาเลือกข้อความเอง"; } }
let U_EMAILS = null;
async function loadUserEmails(){
  const { data, error } = await DB.rpc("admin_list_users");
  if (error){ U_EMAILS = null; return false; }
  U_EMAILS = {}; data.forEach(u => U_EMAILS[u.id] = u); return true;
}
function roleSelect(p){ return `<select class="rolesel" data-id="${p.id}" aria-label="ระดับสิทธิ์">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${p.role === k ? " selected" : ""}>${v}</option>`).join("")}</select>`; }
function renderUsers(){
  const ready = !!U_EMAILS;
  const form = ready ? `
    <div class="ubox">
      <h3>เพิ่มผู้ใช้ใหม่</h3>
      <form id="nuForm" class="ugrid">
        <label>ชื่อผู้ใช้<input id="nuUser" autocomplete="off" placeholder="เช่น somchai หรืออีเมล" required></label>
        <label>ชื่อที่แสดง<input id="nuName" autocomplete="off" placeholder="เช่น สมชาย ใจดี"></label>
        <label>รหัสผ่านเริ่มต้น<span class="furow"><input id="nuPass" autocomplete="new-password" minlength="8" required><button class="btn" type="button" id="nuGen">สุ่ม</button></span></label>
        <label>ระดับสิทธิ์<select id="nuRole">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${k === "viewer" ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        <div class="furow"><button class="btn primary" type="submit" id="nuBtn">สร้างผู้ใช้</button></div>
      </form>
      <div id="nuMsg" class="muted" role="status"></div>
    </div>` : `<p class="lgerr">ยังสร้างผู้ใช้จากหน้านี้ไม่ได้ — ผู้ดูแลระบบต้องรันไฟล์ <code>supabase/admin-users.sql</code> ใน Supabase SQL Editor ก่อน (ดู README) ระหว่างนี้เปลี่ยนระดับสิทธิ์ได้ตามปกติ</p>`;
  const rows = S.profiles.map(p => {
    const u = U_EMAILS && U_EMAILS[p.id], self = p.id === UID;
    return `<div class="urow" data-id="${p.id}">
      <div class="u1"><input class="uname" value="${esc(p.display_name || "")}" aria-label="ชื่อที่แสดง"><div class="muted">เข้าระบบด้วย: <b>${esc(u ? loginName(u.email) : (p.username || ""))}</b>${self ? " · บัญชีของคุณ" : ""}</div></div>
      <div class="u2">${roleSelect(p)}</div>
      <div class="u3 muted">เข้าใช้ล่าสุด ${u && u.last_sign_in_at ? fmtDT(u.last_sign_in_at) : "—"}</div>
      <div class="u4">${ready ? `<button class="btn sm" type="button" data-act="pw">ตั้งรหัสใหม่</button>${self ? "" : `<button class="btn sm danger" type="button" data-act="del">ลบ</button>`}` : ""}</div>
      <div class="pwrow" hidden><input class="newpw" minlength="8" placeholder="รหัสใหม่ 8 ตัวขึ้นไป" aria-label="รหัสผ่านใหม่"><button class="btn sm" type="button" data-act="pwgen">สุ่ม</button><button class="btn sm primary" type="button" data-act="pwsave">บันทึก</button></div>
    </div>`;
  }).join("");
  openPanel("จัดการผู้ใช้", form + `
    <h3 style="margin:8px 0 0;font-size:14px">ผู้ใช้ทั้งหมด (${S.profiles.length})</h3>
    <div class="ulist">${rows}</div>
    <span class="muted" id="uMsg" role="status"></span>`);
  const box = $("p2Body"), msg = t => { $("uMsg").textContent = t; };
  if (ready){
    $("nuGen").onclick = () => { $("nuPass").value = genPw(); };
    $("nuForm").onsubmit = async e => {
      e.preventDefault();
      const user = $("nuUser").value.trim(), pass = $("nuPass").value, name = $("nuName").value.trim(), role = $("nuRole").value;
      if (pass.length < 8){ $("nuMsg").textContent = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"; return; }
      $("nuBtn").disabled = true;
      const { error } = await DB.rpc("admin_create_user", {p_username: user, p_password: pass, p_display_name: name || null, p_role: role, p_domain: DOMAIN()});
      $("nuBtn").disabled = false;
      if (error){ $("nuMsg").textContent = sbMsg(error); return; }
      const login = user.includes("@") ? user.toLowerCase() : user.toLowerCase();
      const note = `ลิงก์: ${location.origin + location.pathname}\nชื่อผู้ใช้: ${login}\nรหัสผ่าน: ${pass}`;
      await loadProfiles(); await loadUserEmails(); renderUsers();
      $("nuMsg").innerHTML = `<div class="okbox">สร้างผู้ใช้ <b>${esc(login)}</b> แล้ว ส่งข้อมูลนี้ให้ผู้ใช้ทางช่องทางส่วนตัว:<pre id="nuNote">${esc(note)}</pre><button class="btn sm" type="button" id="nuCopy">คัดลอก</button></div>`;
      $("nuCopy").onclick = () => copyText(note, $("nuCopy"));
    };
  }
  box.querySelectorAll(".rolesel").forEach(sel => sel.onchange = async () => {
    const { error } = await DB.from("profiles").update({role: sel.value}).eq("id", sel.dataset.id);
    if (error){ msg(sbMsg(error)); await loadProfiles(); renderUsers(); return; }
    await loadProfiles(); msg("บันทึกระดับสิทธิ์แล้ว");
  });
  box.querySelectorAll(".uname").forEach(inp => inp.onchange = async () => {
    const id = inp.closest(".urow").dataset.id, v = inp.value.trim();
    if (!v){ msg("ชื่อที่แสดงต้องไม่ว่าง"); return; }
    const { error } = await DB.from("profiles").update({display_name: v}).eq("id", id);
    if (error){ msg(sbMsg(error)); return; }
    await loadProfiles(); render(); msg("บันทึกชื่อแล้ว");
    if (id === UID){ S.me.name = v; renderWho(); }
  });
  box.querySelectorAll("button[data-act]").forEach(b => b.onclick = async () => {
    const tr = b.closest(".urow"), id = tr.dataset.id, pr = tr.querySelector(".pwrow");
    if (b.dataset.act === "pw"){ pr.hidden = !pr.hidden; if (!pr.hidden) pr.querySelector(".newpw").focus(); }
    if (b.dataset.act === "pwgen"){ pr.querySelector(".newpw").value = genPw(); }
    if (b.dataset.act === "pwsave"){
      const pw = pr.querySelector(".newpw").value;
      if (pw.length < 8){ msg("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
      const { error } = await DB.rpc("admin_set_password", {p_user: id, p_password: pw});
      if (error){ msg(sbMsg(error)); return; }
      pr.hidden = true; pr.querySelector(".newpw").value = "";
      const nm = tr.querySelector(".uname").value; msg(`ตั้งรหัสผ่านใหม่ให้ ${nm} แล้ว: ${pw} — ส่งให้ผู้ใช้ทางช่องทางส่วนตัว`);
    }
    if (b.dataset.act === "del"){
      if (b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = "กดอีกครั้งเพื่อยืนยันลบ"; setTimeout(() => { if (b.isConnected){ b.dataset.armed = ""; b.textContent = "ลบ"; } }, 4000); return; }
      const { error } = await DB.rpc("admin_delete_user", {p_user: id});
      if (error){ msg(sbMsg(error)); return; }
      await loadProfiles(); await loadUserEmails(); renderUsers(); msg("ลบผู้ใช้แล้ว");
    }
  });
}
$("usersBtn").onclick = async () => { try{ await loadProfiles(); await loadUserEmails(); }catch(e){} renderUsers(); };
function renderWho(){ $("whoami").innerHTML = S.me ? `<span aria-hidden="true">👤</span> <b>${esc(S.me.name)}</b><span class="muted"> · ${ROLES[ROLE] || ""}</span>` : ""; $("whoami").hidden = !S.me; }

/* ---------- boot ---------- */
(async function boot(){
  let t = "renew"; try{ t = localStorage.getItem("set-seal-tab") || "renew"; }catch(e){} setTab(t === "all" ? "all" : "renew");
  wrapEl.classList.add("locked");
  if (!window.supabase || !CFG.SUPABASE_URL || /YOUR-PROJECT/.test(CFG.SUPABASE_URL) || !CFG.SUPABASE_ANON_KEY || /YOUR-ANON-KEY/.test(CFG.SUPABASE_ANON_KEY)){
    $("login").hidden = false; $("lgForm").hidden = true;
    $("lgErr").textContent = "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase — แก้ไฟล์ config.js ตามคู่มือ README"; $("lgErr").hidden = false;
    return;
  }
  DB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  DB.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") showLogin(); });
  const { data } = await DB.auth.getSession();
  if (data && data.session) start(data.session); else showLogin();
})();

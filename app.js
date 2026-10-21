"use strict";
/* ===== เวอร์ชัน — ออกเวอร์ชันใหม่: เพิ่มเลขที่นี่ + ใน index.html (?v=) + บันทึกใน CHANGELOG.md ===== */
const APP_VERSION = "1.15.1", APP_RELEASED = "21/10/2026";
const DAY = 86400000;
const TODAY = (()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())})();

/* ---------- field mapping (header row → internal keys) ---------- */
const norm = s => String(s??"").toLowerCase().replace(/[\s.:_\-()\/]/g,"");
const FIELDS = {
  wo:["workorder"], job:["jobno"], open:["opendate"], fin:["finisheddate","finishdate"], status:["status"],
  brand:["brand"], code:["code","idstation","stationid","stationcode"], name:["name","station"], inform:["informby","informer"], phone:["inphone"],
  user:["username","technician"], sup:["sup","section"], province:["province"],
  problem:["problem"], other:["other"], deadline:["deadline"], addr:["address"], month:["month"],
  reqno:["เลขที่คำขอออนไลน์"], reqdate:["วันที่ยื่นคำขอ"], proc:["สถานะดำเนินการ"], next:["ครบรอบครั้งถัดไป"],
  serialF:["serialnumber","serialno","serial","sn"], installF:["installdate","installationdate"],
  warrantF:["warrantdate","warrantydate","warrantyexpire","warrantyexpiredate"]
};
const REQUIRED = {wo:"Work order", job:"Job no.", name:"Station", fin:"Finish date", other:"Other"};
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
const RENEW_BUCKETS = ["overdue","d30","d60"];
const BUCKETS = [
  {k:"overdue",label:"เลยกำหนดแล้ว",color:"var(--bad)"},
  {k:"d30",label:"ภายใน 30 วัน",color:"var(--warn)"},
  {k:"d60",label:"31–60 วัน",color:"var(--soon)"},
  {k:"d90",label:"61–90 วัน",color:"var(--soon)"},
  {k:"later",label:"มากกว่า 90 วัน",color:"var(--ok)"},
  {k:"none",label:"ยังไม่มีวันครบรอบ",color:"var(--none)"}
];

/* ===== WarrantDate / InstallDate จากข้อความในช่อง Other ===== */
const TH_MON={"มกราคม":1,"ม.ค.":1,"มค":1,"กุมภาพันธ์":2,"ก.พ.":2,"กพ":2,"มีนาคม":3,"มี.ค.":3,"มีค":3,"เมษายน":4,"เม.ย.":4,"เมย":4,"พฤษภาคม":5,"พ.ค.":5,"พค":5,"มิถุนายน":6,"มิ.ย.":6,"มิย":6,"กรกฎาคม":7,"ก.ค.":7,"กค":7,"สิงหาคม":8,"ส.ค.":8,"สค":8,"กันยายน":9,"ก.ย.":9,"กย":9,"ตุลาคม":10,"ต.ค.":10,"ตค":10,"พฤศจิกายน":11,"พ.ย.":11,"พย":11,"ธันวาคม":12,"ธ.ค.":12,"ธค":12};
/* รูปย่อที่ไม่มีจุดท้าย เช่น ธ.ค68 */
Object.keys(TH_MON).filter(k=>/\.$/.test(k)).forEach(k=>{TH_MON[k.slice(0,-1)]=TH_MON[k];});
const TH_MON_RE=Object.keys(TH_MON).sort((a,b)=>b.length-a.length).map(k=>k.replace(/\./g,"\\.")).join("|");
function mkYmd(d,m,y){
  if(y<100) y = y>=50 ? 2500+y : 2000+y;
  if(y>2400) y-=543;
  if(y<2015||y>2040||m<1||m>12||d<1||d>31) return null;
  const t=new Date(y,m-1,d); return t.getMonth()===m-1?t:null;
}
function findDates(s,noCompact){
  const out=[]; let m;
  const reTh=new RegExp(`(?<!\\d)(\\d{1,2})[\\s\\/\\-.]*(${TH_MON_RE})[\\s\\/\\-.]*(\\d{2,4})(?!\\d)`,"g");
  while((m=reTh.exec(s))){ const d=mkYmd(+m[1],TH_MON[m[2]],+m[3]); if(d) out.push({i:m.index,ds:[d]}); }
  /* ปี 4 หลักที่มีตัวเลขอื่นต่อท้ายติดกัน เช่น 5สิงหาคม256914หัวจ่าย */
  const reThY=new RegExp(`(?<!\\d)(\\d{1,2})[\\s\\/\\-.]*(${TH_MON_RE})[\\s\\/\\-.]*((?:25[5-8]|20[2-3])\\d)(?=\\d)`,"g");
  while((m=reThY.exec(s))){ const d=mkYmd(+m[1],TH_MON[m[2]],+m[3]); if(d) out.push({i:m.index,ds:[d]}); }
  /* เดือนภาษาอังกฤษ เช่น 06-Feb-26, 25 Nov 2026 */
  const reEn=/(?<!\d)(\d{1,2})[\s\/\-.]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s\/\-.,]*(\d{2,4})(?!\d)/gi;
  while((m=reEn.exec(s))){ const d=mkYmd(+m[1],EN_M.findIndex(x=>x.toLowerCase()===m[2].toLowerCase())+1,+m[3]); if(d) out.push({i:m.index,ds:[d]}); }
  /* ปี 4 หลัก (25xx / 20xx) ที่มีตัวเลขอื่นต่อท้ายติดกัน เช่น 13.02.256936มือจ่าย */
  const reSepY=/(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*((?:25[5-8]|20[2-3])\d)(?=\d)/g;
  while((m=reSepY.exec(s))){ let a=+m[1], b=+m[2]; if(b>12&&a<=12){const t=a;a=b;b=t;} const d=mkYmd(a,b,+m[3]); if(d) out.push({i:m.index,ds:[d]}); }
  const reSep=/(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})(?!\d)/g;
  while((m=reSep.exec(s))){ let a=+m[1], b=+m[2]; if(b>12&&a<=12){const t=a;a=b;b=t;} const d=mkYmd(a,b,+m[3]); if(d) out.push({i:m.index,ds:[d]}); }
  const reSp=/(?<!\d)(\d{1,2})\s{1,3}(\d{1,2})\s{1,3}(\d{2}|\d{4})(?!\d)/g;
  while((m=reSp.exec(s))){ const d=mkYmd(+m[1],+m[2],+m[3]); if(d) out.push({i:m.index,ds:[d]}); }
  /* ตัวเลขติดกันไม่มีตัวคั่น เช่น 12032570, 190370, 8112569, 11069 → ลองทุกแบบที่เป็นวันที่ได้ */
  const reCmp=/(?<!\d)(\d{4,8})(?!\d)/g;
  while(!noCompact&&(m=reCmp.exec(s))){
    const t=m[1], ds=[];
    for(const yl of [4,2]){ const rest=t.length-yl; if(rest<2||rest>4) continue; const y=+t.slice(rest);
      if(yl===4 && (y<2560||y>2580)) continue; if(yl===2 && (y<60||y>80)) continue;
      for(let dl=1;dl<=2;dl++){ const ml=rest-dl; if(ml<1||ml>2) continue;
        const dd=t.slice(0,dl), mm=t.slice(dl,rest); if(mm.length===2&&mm[0]==="0"&&false) continue;
        const d=mkYmd(+dd,+mm,y); if(d) ds.push(d); } }
    if(ds.length) out.push({i:m.index,ds});
  }
  return out.sort((a,b)=>a.i-b.i);
}
/* วันที่อายุรับรอง: วันที่ในช่อง Problem — ถ้ามีหลายวันที่ใช้วันที่ก่อนสุด
   (ไม่อ่านตัวเลขติดกันแบบไม่มีตัวคั่น เพื่อไม่ให้ไปจับเลขทะเบียน/จำนวนหัวจ่าย) · ต้องอยู่ในช่วง Open date −3 ปี ถึง +2 ปี */
function extractProblemDate(text, ref){
  if(!text) return null; const s=String(text).replace(/_x000D_/g," ");
  const lo=ref?+ref-3*366*86400000:-Infinity, hi=ref?+ref+2*366*86400000:Infinity;
  const ds=findDates(s,true).flatMap(x=>x.ds).filter(d=>+d>lo&&+d<hi);
  return ds.length?ds.reduce((a,b)=>a<b?a:b):null;
}
function extractExpiry(text, ref){
  if(!text) return null; const s=String(text).replace(/_x000D_/g," ");
  /* คีย์เวิร์ด: ทุกคำที่มี "อายุ" (หมดอายุ, สิ้นอายุ, ครบอายุ, อายุคำรับรอง และคำพิมพ์ผิด เช่น หดมอายุ / หทดอายุ / สิ้อายุ),
     "หมดอาย", "คำรับรอง" (หมดคำรับรอง, สิ้นคำรับรอง) และ "ครบกำหนด" — วันที่ต้องอยู่หลัง Open date 150 วัน – 2 ปี */
  const kw=/(อายุ|หมดอาย|คำรับรอง|ครบกำหนด)/g; let m; const cands=[];
  const lo=ref?+ref+150*86400000:0, hi=ref?+ref+2*366*86400000:Infinity, target=ref?+ref+365*86400000:null;
  while((m=kw.exec(s))){
    const win=s.slice(m.index, m.index+70);
    const next=/ถัดไป|ต่อไป|รอบถัด|ครั้งถัด|รอบหน้า|ครั้งหน้า/.test(win.slice(0,40));
    for(const x of findDates(win)) for(const d of x.ds){
      if(+d<=lo||+d>=hi) continue;
      cands.push({d, score:(next?2:0)+(x.i<45?1:0), pos:m.index+x.i, gap:target?Math.abs(d-target):0});
    }
  }
  if(!cands.length) return null;
  cands.sort((a,b)=>b.score-a.score||a.pos-b.pos||a.gap-b.gap);
  return cands[0].d;
}
function minusYear(d){ const t=new Date(d.getFullYear()-1,d.getMonth(),d.getDate()); if(t.getMonth()!==d.getMonth()) return new Date(d.getFullYear()-1,d.getMonth()+1,0); return t; }

/* Parse an array-of-arrays (header row + data rows) into job records. Same path for embedded data, uploads and a future SMS API. */
const EN_M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
    /* ไฟล์รูปแบบ MS_Track: Informer + InPhone, ไม่มีคอลัมน์สถานะดำเนินการ / Month → คำนวณจาก Finish date / Open date */
    if(o.phone&&!o.inform.includes(o.phone)) o.inform=(o.inform?o.inform+" ":"")+o.phone;
    o.province=o.province.replace(/\s+$/,"");
    if(!o.proc) o.proc=o.fin?"ดำเนินการเรียบร้อย":"รอดำเนินการ";
    { const md=/^\d{5}(\.\d+)?$/.test(o.month)?toDate(+o.month):/^\d{4}-\d{1,2}-\d{1,2}/.test(o.month)?toDate(o.month):null;
      const src=md||(!o.month?o.open:null); if(src) o.month=EN_M[src.getMonth()]+","+String(src.getFullYear()%100).padStart(2,"0"); }
    o.serial=o.serialF; o.serialSrc=o.serialF?"file":"";
    /* WarrantDate: ใช้คอลัมน์ในไฟล์ก่อน ถ้าไม่มีดึง "วันหมดอายุรอบถัดไป" จากช่อง Other
       InstallDate: ใช้คอลัมน์ในไฟล์ก่อน ถ้าไม่มีนับถอยหลัง 1 ปีจาก WarrantDate */
    if(o.warrantF){ o.warrant=o.warrantF; o.warrantSrc="file"; }
    else { o.warrant=extractExpiry(o.other, o.open||o.fin); o.warrantSrc=o.warrant?"other":""; }
    if(o.installF){ o.install=o.installF; o.installSrc="file"; }
    else { o.install=o.warrant?minusYear(o.warrant):null; o.installSrc=o.install?"minus1y":""; }
    /* วันอ้างอิงครบรอบ (KPI / กราฟ / แท็บต่อสัญญา): WarrantDate ก่อน ถ้าไม่มีใช้ "ครบรอบครั้งถัดไป" */
    o.certDate=extractProblemDate(o.problem, o.open||o.fin);
    o.due=o.warrant||o.next; o.dueSrc=o.warrant?"warrant":(o.next?"next":"");
    o.days=o.due?Math.round((o.due-TODAY)/DAY):null;
    o.bucket=bucketOf(o.days);
    {const k=String(o.job||o.wo||"").trim().replace(/[^A-Za-z0-9_\-.~:@+]/g,"_").slice(0,190); o.fuKey=(k&&k!=="."&&k!=="..")?k:null;}
    o.done=/เรียบร้อย|เสร็จ|complete/i.test(o.proc);
    o.hay=[o.wo,o.job,o.code,o.name,o.serial,o.reqno,o.addr,o.province,o.inform,o.user,o.sup,o.brand,o.problem].join(" ").toLowerCase();
    out.push(o);
  }
  return {rows:out, missing};
}

/* ---------- state ---------- */
const S={all:[],src:null,tab:"renew",bucket:"active",renewMonth:null,fu:{},names:{},fFu:"any",fAsg:"any",profiles:[],renRows:[],allRows:[],fuV2:false,loadedV:null,
  f:{q:"",brand:"",proc:"",sup:"",user:"",month:""},
  sort:{renew:{k:"due",d:1},all:{k:"open",d:-1},st:{k:"near",d:1}}, page:{renew:0,all:0,st:0}};
const PAGE=50;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtD=d=>d?String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear():"";
const TH_M=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const mKey=d=>d.getFullYear()*100+d.getMonth();
const mLabel=k=>TH_M[k%100]+String((Math.floor(k/100)+543)%100);
const mLab2=k=>TH_M[k%100]+"|"+String((Math.floor(k/100)+543)%100);
const nf=n=>n.toLocaleString("th-TH");

function load(aoa,src){
  const {rows,missing}=parseAOA(aoa);
  S.all=rows; S.src=src; markSuperseded(); S.page={renew:0,all:0,st:0}; S.renewMonth=null;
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
  opt("fBrand","Brand","brand"); opt("fProc","สถานะดำเนินการ","proc"); opt("fSup","Section","sup"); opt("fUser","Technician","user");
  const mo={}; S.all.forEach(r=>{if(r.month&&r.open){mo[r.month]=Math.max(mo[r.month]||0,+r.open);}else if(r.month&&!(r.month in mo))mo[r.month]=0;});
  const ms=Object.keys(mo).sort((a,b)=>mo[b]-mo[a]);
  const cntM={}; S.all.forEach(r=>{if(r.month)cntM[r.month]=(cntM[r.month]||0)+1;});
  $("fMonth").innerHTML=`<option value="">Month: ทั้งหมด</option>`+ms.map(k=>`<option value="${esc(k)}">${esc(k)} (${cntM[k]})</option>`).join("");
  $("fMonth").value=ms.includes(S.f.month)?S.f.month:"";
}
function syncF(){ S.f.brand=$("fBrand").value; S.f.proc=$("fProc").value; S.f.sup=$("fSup").value; S.f.user=$("fUser").value; S.f.month=$("fMonth").value; }

function filtered(){
  const f=S.f, q=f.q.trim().toLowerCase();
  return S.all.filter(r=>(!f.brand||r.brand===f.brand)&&(!f.proc||r.proc===f.proc)&&(!f.sup||r.sup===f.sup)&&(!f.user||r.user===f.user)&&(!f.month||r.month===f.month)&&(!S.fYr||yrGroup(r)===S.fYr)&&(!q||r.hay.includes(q)));
}

/* ---------- render ---------- */
function render(){
  for(const r of S.all){const f=r.fuKey&&S.fu[r.fuKey]; r.fuS=f&&f.s?FU.findIndex(o=>o.k===f.s):0;}
  const rows=filtered();
  const act=rows.filter(r=>!r.superseded); /* งานที่ยังไม่ได้ตีตรารอบใหม่ */
  renderSrc(); renderKpis(rows); renderMonth(rows); renderRenewChart(act); renderBrand(rows);
  renderChips(act); renderTables(rows);
}
function renderSrc(){ $("srcinfo").innerHTML=""; const u=$("updAt"); if(u) u.textContent=S.src&&S.src.at?`อัปเดต ${fmtDT(S.src.at)}`:""; }
/* กลุ่มปีของ WarrantDate: past = ปีที่ผ่านมา (ดำเนินการแล้ว), now = ปีนี้ (กำลังดำเนินการ), future = ปีถัดไป (จะดำเนินการ) */
const CUR_Y=TODAY.getFullYear(), BE=y=>y; /* แสดงปี ค.ศ. */
const yrGroup=r=>!r.due?null:r.due.getFullYear()<CUR_Y?"past":r.due.getFullYear()===CUR_Y?"now":"future";
function renderKpis(rows){
  const done=rows.filter(r=>r.done).length, pend=rows.length-done;
  const pct=rows.length?Math.round(done/rows.length*100):0;
  const g={past:[],now:[],future:[]}; rows.forEach(r=>{const k=yrGroup(r); if(k) g[k].push(r);});
  const byYear=list=>{const m={}; list.forEach(r=>{const y=BE(r.due.getFullYear()); m[y]=(m[y]||0)+1;}); return Object.keys(m).sort().map(y=>`${y}: ${nf(m[y])}`).join(" · ");};
  const nowOver=g.now.filter(r=>r.days<0).length, nowLeft=g.now.length-nowOver;
  const noDue=rows.filter(r=>!r.due).length;
  const yc=(k,cls,eye,label,list,sub)=>`<button type="button" class="kpi click yr ${cls}${S.fYr===k?" on":""}" data-yr="${k}" title="คลิกเพื่อกรองเฉพาะกลุ่มนี้"><span class="eye">${eye}</span><span class="l">${label}</span><span class="v">${nf(list.length)}</span><span class="s">${sub}</span></button>`;
  $("kpis").innerHTML=`
    <div class="kpi"><span class="eye none"></span><span class="l">งานตีตราทั้งหมด</span><span class="v">${nf(rows.length)}</span><span class="s">ไม่มี WarrantDate ${nf(noDue)} งาน</span></div>
    <div class="kpi ok"><span class="eye none"></span><span class="l">ดำเนินการเรียบร้อย</span><span class="v">${nf(done)}</span><span class="s">${pct}% ของงานทั้งหมด</span></div>
    <button class="kpi warn click" type="button" data-proc="pending"><span class="eye none"></span><span class="l">รอดำเนินการ</span><span class="v">${nf(pend)}</span><span class="s">ยังไม่ได้ตีตรา / ยื่นคำขอ</span></button>
    ${yc("past","past","ดำเนินการแล้ว","ครบรอบปีที่ผ่านมา",g.past,g.past.length?byYear(g.past):`ก่อนปี ${BE(CUR_Y)}`)}
    ${yc("now","now","กำลังดำเนินการ",`ครบรอบปีนี้ · ${BE(CUR_Y)}`,g.now,`เลยกำหนด ${nf(nowOver)} · รอถึงกำหนด ${nf(nowLeft)}`)}
    ${yc("future","future","จะดำเนินการในอนาคต","ครบรอบปีถัดไป",g.future,g.future.length?byYear(g.future):`ตั้งแต่ปี ${BE(CUR_Y+1)}`)}`;
  $("kpis").querySelectorAll("[data-yr]").forEach(b=>b.onclick=()=>{S.fYr=S.fYr===b.dataset.yr?null:b.dataset.yr;S.page={renew:0,all:0,st:0};render();});
  $("kpis").querySelector("[data-proc]").onclick=()=>{const p=S.all.find(r=>!r.done&&r.proc);if(p){$("fProc").value=p.proc;syncF();}setTab("all");render();$("panelAll").scrollIntoView({behavior:"smooth",block:"start"});};
}
function niceMax(v){ const s=Math.max(1,v/4), p=Math.pow(10,Math.floor(Math.log10(s))); for(const m of [1,2,2.5,3,4,5,6,8,10]){ const st=m*p; if(st>=s && Number.isInteger(st)) return st*4; } return 40*p; }
function colChart(el,items,opts={}){
  const tot=it=>it.parts.reduce((a,p)=>a+p.v,0);
  const top=niceMax(Math.max(1,...items.map(tot)));
  const grid=[0.25,0.5,0.75,1].map(f=>`<div class="gl" style="bottom:${f*100}%"><span>${nf(Math.round(top*f))}</span></div>`).join("");
  const tag=opts.click?'button':'div', attr=opts.click?' type="button"':'';
  el.innerHTML=`<div class="cwrap"><div class="cols">${grid}${items.map((it,i)=>{const t=tot(it);
    const parts=it.parts.filter(p=>p.v>0);
    return `<${tag}${attr} class="col${opts.click?' click':''}${it.sel?' sel':''}" data-i="${i}" aria-label="${esc(it.title||'')}">
      <span class="bar" style="height:${t/top*100}%"><span class="val">${t?nf(t):""}</span><span class="stack">${parts.map(p=>`<span style="flex:${p.v} 0 0;background:${p.c}"></span>`).join("")}</span></span></${tag}>`}).join("")}</div>
    <div class="xlab">${items.map(it=>{const [l1,l2]=String(it.label).split("|");return `<span>${esc(l1)}${l2!==undefined?`<br>${esc(l2)}`:""}</span>`}).join("")}</div></div>`;
  el.querySelectorAll(".col").forEach(b=>{
    const it=items[+b.dataset.i];
    if(opts.click) b.onclick=()=>opts.click(it);
    b.onmouseenter=()=>showTip(b,it); b.onmouseleave=hideTip; b.onfocus=()=>showTip(b,it); b.onblur=hideTip;
  });
}
function showTip(anchor,it){
  let tp=$("chartTip"); if(!tp){tp=document.createElement("div");tp.id="chartTip";tp.className="ctip";document.body.appendChild(tp);}
  const rows=(it.tip||[]).map(([c,l,v])=>`<div><i style="background:${c}"></i>${esc(l)}<b>${nf(v)}</b></div>`).join("");
  tp.innerHTML=`<strong>${esc(it.tipTitle||it.label.replace("|"," "))}</strong>${rows}`;
  tp.hidden=false;
  const r=anchor.getBoundingClientRect(), w=tp.offsetWidth, h=tp.offsetHeight;
  let x=r.left+r.width/2-w/2; x=Math.max(8,Math.min(x,innerWidth-w-8));
  let y=r.top-h-8; if(y<8) y=r.bottom+8;
  tp.style.left=x+"px"; tp.style.top=y+"px";
}
function hideTip(){ const tp=$("chartTip"); if(tp) tp.hidden=true; }
function renderMonth(rows){
  const m={}; rows.forEach(r=>{if(!r.open)return;const k=mKey(r.open);m[k]=m[k]||{d:0,p:0};r.done?m[k].d++:m[k].p++;});
  const ks=Object.keys(m).map(Number).sort((a,b)=>a-b).slice(-12);
  if(!ks.length){$("chMonth").innerHTML='<div class="empty">ไม่มีข้อมูล</div>';return;}
  colChart($("chMonth"),ks.map(k=>({label:mLab2(k),tipTitle:mLabel(k),title:`${mLabel(k)} · เรียบร้อย ${m[k].d} · รอ ${m[k].p}`,tip:[["var(--accent)","ดำเนินการเรียบร้อย",m[k].d],["var(--pending)","รอดำเนินการ",m[k].p]],parts:[{v:m[k].d,c:"var(--accent)"},{v:m[k].p,c:"var(--pending)"}]})));
}
function renderRenewChart(rows){
  const start=new Date(TODAY.getFullYear(),TODAY.getMonth(),1);
  const items=[]; const over=rows.filter(r=>r.bucket==="overdue").length;
  items.push({label:"ล่าช้า",tipTitle:"เลยกำหนดแล้ว",key:"overdue",title:`เลยกำหนดแล้ว ${over} รายการ`,tip:[["var(--bad)","เลยกำหนด",over]],parts:[{v:over,c:"var(--bad)"}],sel:S.renewMonth==="overdue"});
  for(let i=0;i<12;i++){
    const d=new Date(start.getFullYear(),start.getMonth()+i,1), k=mKey(d);
    const inM=rows.filter(r=>r.due&&r.days>=0&&mKey(r.due)===k);
    const c=b=>inM.filter(r=>r.bucket===b).length;
    items.push({label:mLab2(k),tipTitle:"ครบรอบ "+mLabel(k),key:k,title:`${mLabel(k)} · ${inM.length} รายการ`,sel:S.renewMonth===k,tip:[["var(--warn)","ภายใน 30 วัน",c("d30")],["var(--soon)","31–90 วัน",c("d60")+c("d90")],["var(--ok)","มากกว่า 90 วัน",c("later")]],
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
  $("chBrand").querySelectorAll(".hbar").forEach(x=>x.onclick=()=>{const k=x.dataset.k;$("fBrand").value=S.f.brand===k?"":k;syncF();S.page={renew:0,all:0,st:0};render();});
}
function renderChips(rows){
  const c={}; rows.forEach(r=>c[r.bucket]=(c[r.bucket]||0)+1);
  /* แท็บติดตามต่อสัญญา: แสดงสถานะถึง 60 วัน */
  const active=(c.overdue||0)+(c.d30||0)+(c.d60||0);
  const chips=[{k:"active",label:"ต้องติดตาม (เลยกำหนด – ครบรอบภายใน 60 วัน)",n:active,color:"var(--warn)"}];
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
const dCell=(d,src)=>d?(src==="other"?`<span title="ดึงจากข้อความวันหมดอายุรอบถัดไปในช่อง Other">${fmtD(d)}</span>`:src==="minus1y"?`<span title="นับถอยหลัง 1 ปีจาก WarrantDate">${fmtD(d)}</span>`:fmtD(d)):"";
const snCell=r=>r.serial?`<span class="sn${r.serialSrc==='other'?' derived':''}" ${r.serialSrc==='other'?'title="ดึงจากช่อง Other"':''}>${safe(r.serial)}</span>`:'';
/* ตัวเลขที่ไม่ใช่เบอร์โทร (Work order, Job no., เลขทะเบียน ฯลฯ) ถูกแบ่งเป็นช่วงสั้นๆ ข้างในหน้าเว็บ
   เพื่อไม่ให้ส่วนเสริม 3CX Click2Call จับไปเป็นเบอร์ — หน้าตาและการคัดลอกยังเหมือนเดิม */
const ntSpan=x=>x.match(/.{1,3}/g).map(y=>`<span class="nt">${y}</span>`).join("");
const noTel=h=>String(h).replace(/\d+(?:-\d+)+|\d{6,}/g,m=>m.split("-").map(ntSpan).join("-"));
const safe=s=>noTel(esc(s));
const txt=(k,cls)=>({k,cls,r:r=>cls==="clamp"?`<div>${safe(r[k])}</div>`:safe(r[k])});
/* เบอร์โทร: (1) ขึ้นต้นด้วย 0 และมีตัวเลขตั้งแต่ 9 หลักขึ้นไป (มีขีด - คั่นได้)
              (2) ขึ้นต้นด้วย +66 แล้วแปลงเป็น 0 นำหน้า เช่น +66 81 234 5678 → 0812345678
   นอกนั้นไม่ถือเป็นเบอร์ → ลิงก์ tel: ให้ 3CX โทรออก */
const TEL_RE=/(\+66[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}(?!\d)|(?<![\d-])0\d*(?:-\d+)*(?!\d))/g;
function telify(s){
  s=String(s??""); let out="", last=0;
  for(const mm of s.matchAll(TEL_RE)){
    const m=mm[0]; let d=m.replace(/\D/g,""); if(m.startsWith("+66")) d="0"+d.slice(2);
    if(d.length<9) continue;
    /* เบอร์ที่ผ่านเงื่อนไขปล่อยเป็นข้อความต่อเนื่อง ให้ 3CX Click2Call แปลงเป็นปุ่มโทร (โทรผ่าน 3CX Web Client) */
    out+=safe(s.slice(last,mm.index))+`<span class="tel" title="กดเพื่อโทรผ่าน 3CX">${esc(m)}</span>`;
    last=mm.index+m.length;
  }
  return out+safe(s.slice(last));
}
const telTxt=(k,cls)=>({k,cls,r:r=>cls==="clamp"?`<div>${telify(r[k])}</div>`:telify(r[k])});
const dt=k=>({k,cls:"nw",r:r=>fmtD(r[k])});

const fuOf=r=>(r.fuKey&&S.fu[r.fuKey])||{};
const CLOSED=["renewed","declined"];
function dueDays(f){ if(!f||!f.next||CLOSED.includes(f.s)) return null; const d=toDate(f.next); return d?Math.round((d-TODAY)/DAY):null; }
const isDue=r=>{const d=dueDays(fuOf(r)); return d!==null&&d<=0;};
const asgName=id=>id?(S.names[id]||"—"):"";
function nextTag(f){ if(!f.next) return ""; const d=dueDays(f), dt=toDate(f.next);
  const cls=d===null?"":d<0?" late":d===0?" today":"";
  const lab=d===null?"":d<0?` (เลยนัด ${-d} วัน)`:d===0?" (วันนี้)":"";
  return `<span class="ntag${cls}">📅 นัด ${fmtD(dt)}${lab}</span>`; }
function fuCell(r){
  const key=r.fuKey, f=fuOf(r), st=f.s||"";
  const tags=[f.asg?`<span class="atag">👤 ${esc(asgName(f.asg))}</span>`:"", nextTag(f)].filter(Boolean).join("");
  const meta=(tags?`<div class="futags">${tags}</div>`:"")+(f.at?`<div class="fumeta">${f.note?esc(f.note)+"<br>":""}${esc(S.names[f.by]||"")} ${fmtDT(f.at)}</div>`:"");
  if(DB&&CAN_FU&&key) return `<select class="fusel" data-key="${esc(key)}" aria-label="สถานะการติดตาม">${FU.map(o=>`<option value="${o.k}"${o.k===st?" selected":""}>${o.label}</option>`).join("")}</select>${meta}`;
  const o=FU.find(x=>x.k===st)||FU[0]; return `<span class="pill p-${o.cls}">${o.label}</span>${meta}`;
}
function dueCell(r){ if(!r.due) return "";
  if(r.dueSrc==="next") return `<span class="derived" title="ไม่พบวันหมดอายุในช่อง Other — ใช้ครบรอบครั้งถัดไปแทน">${fmtD(r.due)}</span>`;
  return `<span title="${r.warrantSrc==="file"?"WarrantDate จากไฟล์":"วันหมดอายุรอบถัดไปจากช่อง Other"}">${fmtD(r.due)}</span>`; }
/* ===== คอลัมน์รายปี (ค.ศ.): ปีที่แล้ว / ปีนี้ / ปีหน้า — เลื่อนเองทุกปี ===== */
const YR_COLS=[TODAY.getFullYear()-1, TODAY.getFullYear(), TODAY.getFullYear()+1];
const plusYear=d=>{const t=new Date(d.getFullYear()+1,d.getMonth(),d.getDate()); return t.getMonth()!==d.getMonth()?new Date(d.getFullYear()+1,d.getMonth()+1,0):t;};
function yearEvents(r,Y){
  const ev=[], f=fuOf(r);
  const ins=r.install||(r.dueSrc==="next"?r.fin:null), approx=!r.install&&!!ins;
  if(ins&&ins.getFullYear()===Y) ev.push({t:"done",d:ins,txt:`ตีตรา ${approx?"~":""}${fmtD(ins)}`});
  if(r.due&&r.due.getFullYear()===Y){
    const n=Math.round((r.due-TODAY)/DAY);
    const st=f.s==="renewed"?"renewed":n<0?"late":n<=90?"soon":"plan";
    const extra=st==="renewed"?" · ตกลงต่อสัญญาแล้ว":n<0?` (เลยมา ${nf(-n)} วัน)`:n<=90?` (อีก ${nf(n)} วัน)`:"";
    ev.push({t:st,d:r.due,txt:`ครบรอบ ${fmtD(r.due)}${extra}`});
  }
  if(r.due&&r.due.getFullYear()+1===Y){ const nx=plusYear(r.due); ev.push({t:"next",d:nx,txt:`รอบถัดไป ~${fmtD(nx)}`}); }
  return ev;
}
const YR_ICON={done:"✅",renewed:"✅",late:"🔴",soon:"🟠",plan:"📅",next:"📅"};
function yearCell(Y){ return r=>yearEvents(r,Y).map(e=>`<div class="yev ${e.t}">${YR_ICON[e.t]} ${e.txt}</div>`).join(""); }
const yrLabel=(Y,i)=>`${Y} · ${["ดำเนินการแล้ว","ปีนี้ / กำลังดำเนินการ","ติดตามรอบหน้า"][i]}`;
const COLS_RENEW=[
  {k:"days",label:"สถานะครบรอบ",cls:"nw",r:pillDays},
  {k:"fuS",label:"การติดตาม",cls:"nw",hl:1,r:fuCell},
  {k:"due",label:"WarrantDate (วันหมดอายุ)",cls:"nw",hl:1,r:dueCell},
  {label:"ID Station",...txt("code","nw")},{label:"Station",...txt("name","wide")},{label:"Brand",...txt("brand","nw")},
  {label:"Other (ผลตีตราครั้งที่แล้ว)",...txt("other","clamp")},
  {label:"Informer / InPhone",...telTxt("inform","wide")},{label:"Province",...txt("province","nw")},
  {label:"Work order",...txt("wo","nw")},{label:"Job no.",...txt("job","nw")},{label:"Section",...txt("sup","wide")}
];
const COLS_ALL=[
  {k:"proc",label:"สถานะดำเนินการ",cls:"nw",r:pillProc},
  {label:"Work order",...txt("wo","nw")},{label:"Job no.",...txt("job","nw")},
  {label:"Open date",...dt("open")},{label:"Finish date",...dt("fin")},
  {label:"Brand",...txt("brand","nw")},{label:"ID Station",...txt("code","nw")},{label:"Station",...txt("name","wide")},
  {label:"Informer / InPhone",...telTxt("inform","wide")},
  {label:"Problem",...txt("problem","clamp")},{label:"Other",...txt("other","clamp")},
  {label:"Province",...txt("province","nw")},{label:"Technician",...txt("user","nw")},{label:"Section",...txt("sup","wide")},
  {k:"serial",label:"SerialNumber",hl:1,r:snCell},
  {k:"install",label:"InstallDate",cls:"nw",hl:1,r:r=>dCell(r.install,r.installSrc)},
  {k:"warrant",label:"WarrantDate",cls:"nw",hl:1,r:r=>dCell(r.warrant,r.warrantSrc)}
];
function sortVal(r,k){ if(/^y[0-2]$/.test(k)){ const e=yearEvents(r,YR_COLS[+k[1]]); return e.length?+e[0].d:null; }
 const v=r[k]; if(v instanceof Date) return +v; if(v===null||v===undefined||v==="") return null; return typeof v==="number"?v:String(v);}
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
  t.querySelectorAll(".fusel").forEach(sel=>sel.onchange=()=>saveFU(sel.dataset.key,{s:sel.value}));
  const pg=$(which==="renew"?"pRenew":"pAll");
  pg.innerHTML=`<span class="muted">แสดง ${rows.length?nf(p*PAGE+1):0}–${nf(Math.min((p+1)*PAGE,rows.length))} จาก ${nf(rows.length)} รายการ</span>
    <span class="b"><button class="btn" type="button" data-d="-1" ${p===0?"disabled":""}>ก่อนหน้า</button><span class="muted" style="align-self:center">หน้า ${p+1}/${pages}</span><button class="btn" type="button" data-d="1" ${p>=pages-1?"disabled":""}>ถัดไป</button></span>`;
  pg.querySelectorAll("button").forEach(b=>b.onclick=()=>{S.page[which]+= +b.dataset.d;render();});
}
/* Job ที่สถานีตีตรารอบใหม่ไปแล้ว (มี Job ใหม่กว่าที่ปิดงานแล้วในสถานีเดียวกัน) = ดำเนินการแล้ว */
function markSuperseded(){
  const m=new Map();
  S.all.forEach(r=>{r.superseded=false; if(!r.done||!r.fin) return; const k=String(r.code||"").trim()||("name:"+String(r.name||"").trim()); if(!m.has(k)) m.set(k,[]); m.get(k).push(r);});
  m.forEach(rs=>{ if(rs.length<2) return; const last=Math.max(...rs.map(r=>+r.fin)); rs.forEach(r=>{ if(+r.fin<last) r.superseded=true; }); });
}
function renderTables(rows){
  /* ติดตามต่อสัญญารอบใหม่: เฉพาะงานที่ยังไม่ได้ดำเนินการ (ตัด Job ที่สถานีตีตรารอบใหม่แล้ว) จนถึงครบรอบไม่เกิน 60 วัน */
  const base=rows.filter(r=>!r.superseded); let ren;
  if(S.renewMonth==="overdue") ren=base.filter(r=>r.bucket==="overdue");
  else if(S.renewMonth!==null) ren=base.filter(r=>r.due&&r.days>=0&&mKey(r.due)===S.renewMonth);
  else if(S.bucket==="active"||!RENEW_BUCKETS.includes(S.bucket)) ren=base.filter(r=>RENEW_BUCKETS.includes(r.bucket));
  else ren=base.filter(r=>r.bucket===S.bucket);
  ren=ren.filter(r=>RENEW_BUCKETS.includes(r.bucket)); /* ไม่เกิน 60 วันเสมอ (รวมกรณีคลิกเดือนจากกราฟ) */
  if(typeof renderFuKpi==="function") renderFuKpi(ren);
  if(S.fFu==="__due") ren=ren.filter(isDue);
  else if(S.fFu==="__touched") ren=ren.filter(r=>!!fuOf(r).s);
  else if(S.fFu!=="any") ren=ren.filter(r=>(fuOf(r).s||"")===S.fFu);
  if(S.fAsg==="__me") ren=ren.filter(r=>fuOf(r).asg===UID);
  else if(S.fAsg==="__none") ren=ren.filter(r=>!fuOf(r).asg);
  else if(S.fAsg&&S.fAsg!=="any") ren=ren.filter(r=>fuOf(r).asg===S.fAsg);
  S.renRows=ren; S.allRows=rows;
  $("cRenew").textContent=nf(ren.length); $("cAll").textContent=nf(rows.length);
  if(typeof renderBulk==="function") renderBulk(ren);
  renderTable("renew",ren,COLS_RENEW); renderTable("all",rows,COLS_ALL);
  renderStations(rows);
}

/* ===== รายงานต่ออายุรับรอง (v1.12.0): 1 แถว = 1 สถานี · แต่ละปี (ค.ศ.) มี 4 คอลัมน์ Job | Finish date | วันที่อายุรับรอง | วันที่ตรวจรับรองครั้งถัดไป =====
   Job อยู่ในปีตามเลข Job (2 หลักแรก เช่น 2510D1973 → 2025)
   ทุกคอลัมน์อิง Job นั้นๆ (บรรทัดเดียวกัน ปีเดียวกับ Job): วันที่อายุรับรอง = วันที่ก่อนสุดในช่อง Problem · วันที่ตรวจรับรองครั้งถัดไป = วันหมดอายุรอบถัดไปจากช่อง Other ของ Job นี้ (อาจเป็นปีถัดไป)
   งานที่ยังไม่ปิดใช้ปีที่เปิดงาน · แสดงเฉพาะ Job ที่มีจริงในไฟล์ Excel / SMS */
/* ติดตามแบบทั้งสถานี: เอาเฉพาะ Job ที่ช่อง Problem มีคำเหล่านี้ (ไม่สนช่องว่าง) — แก้/เพิ่มคำได้ที่นี่ */
const REPORT_KEYWORDS=["ติดตั้งใหม่","ชั้นแรกทั้งสถานี","หมดอายุ"];
const KW_N=REPORT_KEYWORDS.map(k=>k.replace(/\s+/g,""));
const isReportJob=r=>{const t=String(r.problem||"").replace(/\s+/g,""); return KW_N.some(k=>t.includes(k));};
const stKey=r=>String(r.code||"").trim()||("name:"+String(r.name||"").trim());
/* วันตีตรา = Finish date (ปิดงาน) */
const sealDate=r=>r.done?(r.fin||null):null;
/* ปีของ Job = 2 หลักแรกของเลข Job (YYMM + ประเภทงาน + เลขรัน เช่น 2510D1973 → ปี 2025)
   ถ้าเลข Job ไม่ตรงรูปแบบ ใช้ปีของ Finish date / Open date แทน */
function jobYear(r){
  const m=String(r.job||"").trim().match(/^(\d{2})(\d{2})[A-Za-z]/);
  if(m&&+m[2]>=1&&+m[2]<=12) return 2000+ +m[1];
  const d=r.done?(r.fin||r.open):(r.open||r.fin); return d?d.getFullYear():null; }
function stDueCls(r){ if(!r.due) return ""; if(fuOf(r).s==="renewed") return "renewed"; return r.days<0?"late":r.days<=90?"soon":"plan"; }
const byD=(a,b)=>(a.d?+a.d:9e15)-(b.d?+b.d:9e15);
function stYear(rs,Y){
  const jobs=rs.filter(r=>jobYear(r)===Y).map(r=>({r,kind:r.done?"done":"pend",d:r.done?sealDate(r):r.open})).sort(byD);
  return {jobs};
}
function stGroups(rows){
  const m=new Map();
  rows.forEach(r=>{const k=stKey(r); if(!m.has(k)) m.set(k,[]); m.get(k).push(r);});
  return [...m.values()].map(rs=>{
    rs.sort((a,b)=>(+(a.open||0))-(+(b.open||0)));
    const last=rs[rs.length-1];
    /* ติดตามแบบทั้งสถานี: Job ที่มีการตีตรารอบใหม่ (Finish date ใหม่กว่า) แล้ว ถือว่าต่ออายุแล้ว */
    const sealed=rs.filter(r=>r.done&&sealDate(r));
    const sup=new Map();
    sealed.forEach(r=>{const sd=+sealDate(r); const nx=sealed.filter(x=>+sealDate(x)>sd).sort((a,b)=>sealDate(a)-sealDate(b))[0]; if(nx) sup.set(r,nx);});
    const open=rs.filter(r=>r.due&&!sup.has(r)&&fuOf(r).s!=="renewed"&&fuOf(r).s!=="declined");
    const near=open.length?open.reduce((a,b)=>a.days<=b.days?a:b):null;
    /* Job ที่ใช้บันทึกการติดตามของสถานี = Job ล่าสุดที่ตีตราแล้วและมีวันหมดอายุ (ไม่ถูกต่ออายุโดย Job ใหม่) */
    const cand=rs.filter(r=>r.done&&r.due&&!sup.has(r));
    const track=cand.length?cand.reduce((a,b)=>(+(sealDate(a)||0))>=(+(sealDate(b)||0))?a:b):last;
    return {rs,track,code:last.code,name:last.name,brand:last.brand,inform:last.inform,n:rs.length,near,
      years:YR_COLS.map(Y=>{const y=stYear(rs,Y); y.jobs.forEach(it=>it.by=sup.get(it.r)); return y;})};
  });
}
function stJobPart(it){
  const r=it.r, f=fuOf(r), fo=f.s?FU.find(o=>o.k===f.s):null;
  return `<b>${safe(r.job||r.wo)}</b>${fo?`<span class="sfu"><span class="pill p-${fo.cls}">${fo.label}</span></span>`:""}`;
}
const fmtS=d=>d?String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getFullYear()%100).padStart(2,"0"):"";
function stSealPart(it){
  if(it.kind==="pend") return `<span class="yev pend" title="รอดำเนินการ · เปิดงาน ${fmtD(it.r.open)}">⏳ รอ</span>`;
  return it.d?`<span class="yev done" title="Finish date ${fmtD(it.d)}">${fmtS(it.d)}</span>`:`<span class="muted">—</span>`;
}
function stAgePart(it){
  const r=it.r; if(!r.certDate) return `<span class="muted">—</span>`;
  return `<span class="yev plain" title="วันที่อายุรับรองจากช่อง Problem (Job ${esc(r.job||r.wo)}) · ${fmtD(r.certDate)}">${fmtS(r.certDate)}</span>`;
}
function stWarrPart(it){
  const r=it.r; if(!r.due) return `<span class="muted">—</span>`;
  if(it.by) return `<span class="yev renewed" title="Job ${esc(r.job||r.wo)} · ${fmtD(r.due)} · ต่ออายุแล้วโดย Job ${esc(it.by.job||it.by.wo)} (Finish date ${fmtD(sealDate(it.by))})">✅ ${fmtS(r.due)}</span>`;
  const c=stDueCls(r);
  const tip=c==="renewed"?"ตกลงต่อสัญญาแล้ว":r.days<0?`เลยกำหนด ${nf(-r.days)} วัน`:`อีก ${nf(r.days)} วัน`;
  return `<span class="yev ${c}" title="Job ${esc(r.job||r.wo)} · ${fmtD(r.due)} · ${tip}">${c==="renewed"?"✅ ":""}${fmtS(r.due)}</span>`;
}
const ST_COLS=[{k:"code",label:"ID Station"},{k:"name",label:"Station / Brand"},{k:"inform",label:"Informer / InPhone"},{k:"near",label:"ครบรอบใกล้สุด"}];
function stSortVal(g,k){ if(k==="fu"){const st=fuOf(g.track).s||""; return FU.findIndex(o=>o.k===st);} if(k==="near") return g.near?g.near.days:null; if(k==="n") return g.n; const v=g[k]; return v===null||v===undefined||v===""?null:String(v); }
/* คอลัมน์การติดตามของรายงาน: แสดงเฉพาะสถานีที่ครบรอบภายใน 60 วันข้างหน้า หรือเลยกำหนดแล้วแต่ยังไม่ได้ตีตรารอบใหม่
   (Job ล่าสุดของสถานี = ยังไม่ถูกต่ออายุ) — สถานีที่บันทึกการติดตามไว้แล้วยังแสดงเสมอ */
const ST_FU_DAYS=60;
const stIn60=g=>!!(g.track&&g.track.due&&g.track.days!==null&&g.track.days<=ST_FU_DAYS);
const stFuShow=g=>!!(g.track&&(stIn60(g)||fuOf(g.track).s));
function stFuCell(g){
  const r=g.track; if(!r||!stFuShow(g)) return "";
  const key=r.fuKey, f=fuOf(r), st=f.s||"";
  const tags=[f.asg?`<span class="atag">👤 ${esc(asgName(f.asg))}</span>`:"", nextTag(f)].filter(Boolean).join("");
  const meta=tags?`<div class="futags">${tags}</div>`:"";
  const tip=`title="บันทึกกับ Job ${esc(r.job||r.wo)}${f.at?` · ล่าสุด ${esc(S.names[f.by]||"")} ${fmtDT(f.at)}`:""}${f.note?" · "+esc(f.note):""}"`;
  if(DB&&CAN_FU&&key) return `<select class="fusel" data-key="${esc(key)}" aria-label="สถานะการติดตาม" ${tip}>${FU.map(o=>`<option value="${o.k}"${o.k===st?" selected":""}>${o.label}</option>`).join("")}</select>${meta}`;
  const o=FU.find(x=>x.k===st)||FU[0]; return `<span class="pill p-${o.cls}" ${tip}>${o.label}</span>${meta}`;
}
function renderStations(rows){
  const s=S.sort.st; const kept=rows.filter(isReportJob); let gs=stGroups(kept);
  gs.sort((a,b)=>{const x=stSortVal(a,s.k),y=stSortVal(b,s.k); if(x===null&&y===null)return 0; if(x===null)return 1; if(y===null)return -1;
    return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"th"))*s.d;});
  S.stRows=gs; $("cSt").textContent=nf(gs.length);
  const multi=gs.filter(g=>g.n>1).length;
  $("stInfo").innerHTML=`${nf(gs.length)} สถานี · มีมากกว่า 1 Job ${nf(multi)} สถานี · คลิกที่ Job / วันที่ เพื่อดูรายละเอียด / บันทึกการติดตาม<br><span class="kwnote">แสดงเฉพาะ Job ที่ช่อง Problem มีคำว่า ${REPORT_KEYWORDS.map(k=>`"${esc(k)}"`).join(", ")} — ${nf(kept.length)} จาก ${nf(rows.length)} Job (ไม่แสดง ${nf(rows.length-kept.length)} Job)</span>`;
  const pages=Math.max(1,Math.ceil(gs.length/PAGE)); S.page.st=Math.min(S.page.st||0,pages-1);
  const p=S.page.st, slice=gs.slice(p*PAGE,(p+1)*PAGE);
  const t=$("tSt"), NC=4;
  const head0=ST_COLS.map(c=>`<th rowspan="3" data-k="${c.k}">${esc(c.label)}${s.k===c.k?`<span class="ar">${s.d>0?"▲":"▼"}</span>`:""}</th>`).join("")
    +`<th colspan="${YR_COLS.length*NC}" class="rpt ysep">รายงานต่ออายุรับรอง</th>`;
  const head1=YR_COLS.map((Y,i)=>`<th colspan="${NC}" class="yh y${i} ysep">${Y}</th>`).join("");
  const head2=YR_COLS.map((Y,i)=>`<th class="sj y${i} ysep">Job</th><th class="sj y${i} vsep">Finish date</th><th class="sj y${i} vsep">วันที่อายุรับรอง</th><th class="sj y${i} vsep">วันที่ตรวจรับรองครั้งถัดไป</th>`).join("");
  const nearCell=g=>g.near?pillDays(g.near):'<span class="muted">—</span>';
  const ent=(L,fn)=>L.map(it=>`<div class="sent" data-i="${S.all.indexOf(it.r)}" title="คลิกเพื่อดูรายละเอียด / บันทึกการติดตาม">${fn(it)}</div>`).join("");
  const body=slice.map(g=>{
    const cells=g.years.map(({jobs})=>`<td class="ysep sjc">${ent(jobs,stJobPart)}</td><td class="vsep sdc">${ent(jobs,stSealPart)}</td><td class="vsep sdc">${ent(jobs,stAgePart)}</td><td class="vsep sdc">${ent(jobs,stWarrPart)}</td>`).join("");
    return `<tr><td class="nw"><b>${safe(g.code)}</b><div class="stsub">${nf(g.n)} Job</div></td><td class="stname">${safe(g.name)}<div class="stsub">${safe(g.brand)}</div></td><td class="stinf">${telify(g.inform)}</td><td class="nw">${nearCell(g)}</td>${cells}</tr>`;
  }).join("");
  t.innerHTML=`<thead><tr>${head0}</tr><tr>${head1}</tr><tr>${head2}</tr></thead><tbody>${body||`<tr><td colspan="${ST_COLS.length+YR_COLS.length*NC}" class="empty">ไม่มีรายการตามตัวกรองนี้</td></tr>`}</tbody>`;
  t.querySelectorAll("th[data-k]").forEach(th=>th.onclick=()=>{const k=th.dataset.k;s.d=s.k===k?-s.d:1;s.k=k;render();});
  requestAnimationFrame(()=>{const tr=t.querySelectorAll("thead tr");if(tr.length>2&&tr[0].offsetHeight){t.style.setProperty("--sth1",tr[0].offsetHeight+"px");t.style.setProperty("--sth2",(tr[0].offsetHeight+tr[1].offsetHeight)+"px");}});
  t.querySelectorAll(".sent").forEach(el=>{el.onclick=()=>{if(window.getSelection().toString())return;openDrawer(S.all[+el.dataset.i]);};
    el.onmouseenter=()=>t.querySelectorAll(`.sent[data-i="${el.dataset.i}"]`).forEach(x=>x.classList.add("hov"));
    el.onmouseleave=()=>t.querySelectorAll(".sent.hov").forEach(x=>x.classList.remove("hov"));});
  const pg=$("pSt");
  pg.innerHTML=`<span class="muted">แสดง ${gs.length?nf(p*PAGE+1):0}–${nf(Math.min((p+1)*PAGE,gs.length))} จาก ${nf(gs.length)} สถานี</span>
    <span class="b"><button class="btn" type="button" data-d="-1" ${p===0?"disabled":""}>ก่อนหน้า</button><span class="muted" style="align-self:center">หน้า ${p+1}/${pages}</span><button class="btn" type="button" data-d="1" ${p>=pages-1?"disabled":""}>ถัดไป</button></span>`;
  pg.querySelectorAll("button").forEach(b=>b.onclick=()=>{S.page.st+= +b.dataset.d;render();$("panelSt").scrollIntoView({block:"start"});});
}
function exportStations(){
  if (typeof XLSX === "undefined"){ banner("โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ กรุณารีเฟรชหน้า", "err"); return; }
  const gs=S.stRows||[]; if(!gs.length){ banner("ไม่มีรายการให้ Export ตามตัวกรองนี้", "err"); return; }
  const head=["ID Station","Station","Brand","Informer / InPhone","Job ทั้งหมด","ครบรอบใกล้สุด","WarrantDate ใกล้สุด",
    ...YR_COLS.flatMap(Y=>[`${Y} Job`,`${Y} Finish date`,`${Y} วันที่อายุรับรอง`,`${Y} วันที่ตรวจรับรองครั้งถัดไป`])];
  const aoa=[head,...gs.map(g=>[g.code,g.name,g.brand,g.inform,g.n,g.near?daysText(g.near):"",g.near?fmtD(g.near.due):"",
    ...g.years.flatMap(({jobs})=>[jobs.map(it=>it.r.job||it.r.wo||"").join("\n"),
      jobs.map(it=>it.kind==="pend"?"รอดำเนินการ":fmtD(it.d)).join("\n"),
      jobs.map(it=>fmtD(it.r.certDate)).join("\n"),
      jobs.map(it=>it.r.due?`${fmtD(it.r.due)}${it.by?" (ต่ออายุแล้ว)":""}`:"").join("\n")])].map(v=>v==null?"":String(v)))];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"]=head.map((h,i)=>({wch:i===1||i===3?34:i<7?13:(i-7)%4===3?26:14}));
  ws["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:aoa.length-1,c:head.length-1}})};
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"รายงานต่ออายุรับรอง");
  XLSX.writeFile(wb,`SETS-รายงานต่ออายุรับรอง-${isoD(new Date())}.xlsx`);
  banner(`Export ${nf(gs.length)} สถานีแล้ว`,"ok");
}
const TABS=[["renew","tabRenew","panelRenew"],["st","tabSt","panelSt"],["all","tabAll","panelAll"]];
function setTab(t){if(!TABS.some(x=>x[0]===t))t="renew";S.tab=t;TABS.forEach(([k,b,p])=>{$(b).setAttribute("aria-selected",k===t);$(p).hidden=k!==t;});try{localStorage.setItem("set-seal-tab",t)}catch(e){}}

function openDrawer(r){
  $("dSub").textContent=[r.brand,r.wo,r.job].filter(Boolean).join(" · ");
  $("dTitle").textContent=r.name||"(ไม่ระบุชื่อสถานี)";
  const rows=[["สถานะครบรอบ",pillDays(r)],["WarrantDate",dCell(r.warrant,r.warrantSrc)],["SerialNumber",snCell(r)],["InstallDate",dCell(r.install,r.installSrc)],
    ["สถานะดำเนินการ",pillProc(r)],
    ["ID Station",safe(r.code)],["Work order",safe(r.wo)],["Job no.",safe(r.job)],["Open date",fmtD(r.open)],["Finish date",fmtD(r.fin)],
    ["Informer / InPhone",telify(r.inform)],["Province",safe(r.province)],["Technician",safe(r.user)],["Section",safe(r.sup)],["Problem",safe(r.problem)],["Other",safe(r.other)]];
  $("dBody").innerHTML=rows.map(([k,v])=>`<dt>${k}</dt><dd>${v||'<span class="muted">—</span>'}</dd>`).join("");
  const key=r.fuKey, f=(key&&S.fu[key])||{}, box=$("dFu");
  box.hidden=!(DB&&key);
  if(DB&&key){
    const who=f.at?`ล่าสุด: ${esc(S.names[f.by]||"")} ${fmtDT(f.at)}`:"ยังไม่มีการบันทึก";
    if(CAN_FU){
      const people=S.profiles.filter(p=>p.role!=="viewer");
      box.innerHTML=`<h3>การติดตามลูกค้า</h3>
        <div class="fugrid">
          <label>สถานะ<select id="dFuS">${FU.map(o=>`<option value="${o.k}"${o.k===(f.s||"")?" selected":""}>${o.label}</option>`).join("")}</select></label>
          <label>นัดติดตามครั้งถัดไป<input type="date" id="dFuD" value="${esc(f.next||"")}"></label>
          <label>ผู้รับผิดชอบ<select id="dFuA"><option value="">— ยังไม่มอบหมาย —</option>${people.map(p=>`<option value="${p.id}"${p.id===f.asg?" selected":""}>${esc(p.display_name||p.username)}${p.id===UID?" (ฉัน)":""}</option>`).join("")}</select></label>
        </div>
        <textarea id="dFuN" rows="3" maxlength="1000" placeholder="บันทึก เช่น โทรคุยผู้จัดการสถานีแล้ว นัดยื่นคำขอสัปดาห์หน้า">${esc(f.note||"")}</textarea>
        <div class="furow"><button class="btn primary" id="dFuSave" type="button">บันทึกการติดตาม</button><span class="muted" id="dFuMsg">${who}</span></div>`;
      $("dFuSave").onclick=async()=>{$("dFuSave").disabled=true;
        const ok=await saveFU(key,{s:$("dFuS").value,note:$("dFuN").value.trim(),next:$("dFuD").value||null,asg:$("dFuA").value||null});
        $("dFuSave").disabled=false;if(ok)$("dFuMsg").textContent="บันทึกแล้ว · ทุกคนเห็นทันที";};
    }else{
      const o=FU.find(x=>x.k===(f.s||""))||FU[0];
      box.innerHTML=`<h3>การติดตามลูกค้า</h3><div class="futags"><span class="pill p-${o.cls}">${o.label}</span>${f.asg?`<span class="atag">👤 ${esc(asgName(f.asg))}</span>`:""}${nextTag(f)}</div>${f.note?`<div style="white-space:pre-wrap">${esc(f.note)}</div>`:""}<div class="muted">${who}</div>`;
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
  if (typeof buildAsgOptions === "function") buildAsgOptions();
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
const fuFromRow = r => ({s: r.status || "", note: r.note || "", next: r.next_date || null, asg: r.assignee || null, by: r.updated_by, at: r.updated_at});
async function loadFU(){
  let rows;
  try{ rows = await fetchAll("followups", "job_key,status,note,next_date,assignee,updated_by,updated_at"); S.fuV2 = true; }
  catch(e){ rows = await fetchAll("followups", "job_key,status,note,updated_by,updated_at"); S.fuV2 = false; }
  S.fu = {}; rows.forEach(r => S.fu[r.job_key] = fuFromRow(r));
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
function fuBody(key, f){ const b = {job_key: key, status: f.s || "", note: f.note || ""}; if (S.fuV2){ b.next_date = f.next || null; b.assignee = f.asg || null; } return b; }
async function saveFU(key, patch){
  if (!DB || !CAN_FU){ banner("บัญชีนี้บันทึกการติดตามไม่ได้", "err"); return false; }
  if (!S.fuV2 && (patch.next !== undefined || patch.asg !== undefined) && (patch.next || patch.asg)){ banner("ยังบันทึกวันนัด/ผู้รับผิดชอบไม่ได้ — ผู้ดูแลต้องรันไฟล์ supabase/v1.4.0.sql ก่อน", "err"); }
  const prev = S.fu[key], cur = Object.assign({s:"", note:"", next:null, asg:null}, prev || {}, patch);
  S.fu[key] = Object.assign({}, cur, {by: UID, at: new Date().toISOString()}); render();
  const run = async () => {
    const { data, error } = await DB.from("followups").upsert(fuBody(key, cur), {onConflict: "job_key"}).select().single();
    if (error) throw error;
    S.fu[key] = fuFromRow(data);
  };
  const p = (fuQueue[key] || Promise.resolve()).catch(()=>{}).then(run); fuQueue[key] = p;
  try{ await p; render(); return true; }
  catch(e){ if (prev) S.fu[key] = prev; else delete S.fu[key]; render(); banner(sbMsg(e), "err"); return false; }
}
async function bulkAssign(rows, asg){
  const keys = [...new Set(rows.map(r => r.fuKey).filter(Boolean))];
  const body = keys.map(k => fuBody(k, Object.assign({s:"", note:"", next:null}, S.fu[k] || {}, {asg})));
  for (let i = 0; i < body.length; i += 500){
    banner(`กำลังมอบหมาย… ${nf(Math.min(i + 500, body.length))}/${nf(body.length)}`, "ok");
    const { data, error } = await DB.from("followups").upsert(body.slice(i, i + 500), {onConflict: "job_key"}).select();
    if (error) throw error;
    (data || []).forEach(r => S.fu[r.job_key] = fuFromRow(r));
  }
  return keys.length;
}

function subscribe(){
  if (CH) DB.removeChannel(CH);
  CH = DB.channel("set-live")
    .on("postgres_changes", {event: "*", schema: "public", table: "followups"}, p => {
      const r = p.new;
      if (!r || !r.job_key) return;
      S.fu[r.job_key] = fuFromRow(r);
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
let qT; $("q").oninput = e => { clearTimeout(qT); qT = setTimeout(() => { S.f.q = e.target.value; S.page = {renew: 0, all: 0, st: 0}; render(); }, 150); };
["fBrand","fProc","fSup","fUser","fMonth"].forEach(id => $(id).onchange = () => { syncF(); S.page = {renew: 0, all: 0, st: 0}; render(); });
$("fFu").innerHTML = `<option value="any">การติดตาม: ทั้งหมด</option><option value="__due">📅 ถึงกำหนดนัด (วันนี้ / เลยนัด)</option><option value="__touched">ติดต่อแล้ว (ทุกสถานะ)</option>` + FU.map(o => `<option value="${o.k}">${o.label}</option>`).join("");
function buildAsgOptions(){
  const people = (S.profiles || []).filter(p => p.role !== "viewer"), cur = S.fAsg || "any";
  $("fAsg").innerHTML = `<option value="any">ผู้รับผิดชอบ: ทั้งหมด</option><option value="__me">👤 งานของฉัน</option><option value="__none">ยังไม่มอบหมาย</option>` + people.map(p => `<option value="${p.id}">${esc(p.display_name || p.username)}</option>`).join("");
  $("fAsg").value = [...$("fAsg").options].some(o => o.value === cur) ? cur : "any"; S.fAsg = $("fAsg").value;
}
$("fAsg").onchange = e => { S.fAsg = e.target.value; S.page.renew = 0; render(); };
function renderFuKpi(base){
  const c = {total: base.length, none: 0, contacted: 0, waiting: 0, renewed: 0, declined: 0, due: 0};
  base.forEach(r => { const f = fuOf(r); c[f.s || "none"]++; if (isDue(r)) c.due++; });
  const touched = c.total - c.none, pct = n => c.total ? Math.round(n / c.total * 100) + "%" : "0%";
  const box = (k, label, v, sub, cls) => `<button type="button" class="fk${cls ? " " + cls : ""}${S.fFu === k ? " on" : ""}" data-k="${k}"><span class="l">${label}</span><span class="v">${nf(v)}</span><span class="s">${sub}</span></button>`;
  $("fuKpi").innerHTML = `<div class="fkh">ผลการติดตาม <span class="muted">· กลุ่มที่แสดงอยู่ ${nf(c.total)} รายการ</span></div><div class="fkrow">`
    + box("__touched", "ติดต่อแล้ว", touched, `${pct(touched)} ของทั้งหมด`, "")
    + box("", "ยังไม่ติดต่อ", c.none, pct(c.none), "")
    + box("waiting", "รอลูกค้าตัดสินใจ", c.waiting, pct(c.waiting), "warn")
    + box("renewed", "ตกลงต่อสัญญา", c.renewed, pct(c.renewed), "ok")
    + box("declined", "ไม่ต่อสัญญา", c.declined, pct(c.declined), "bad")
    + box("__due", "ถึงกำหนดนัด", c.due, "วันนี้ / เลยนัด", c.due ? "bad" : "") + `</div>`;
  $("fuKpi").querySelectorAll(".fk").forEach(b => b.onclick = () => { S.fFu = (S.fFu === b.dataset.k ? "any" : b.dataset.k); $("fFu").value = S.fFu; S.page.renew = 0; render(); });
}
function renderBulk(rows){
  const el = $("bulkAsg");
  if (!CAN_UP || !S.fuV2){ el.innerHTML = ""; return; }
  const people = (S.profiles || []).filter(p => p.role !== "viewer");
  const keep = $("bkSel") ? $("bkSel").value : "";
  el.innerHTML = `<select id="bkSel" aria-label="มอบหมายให้"><option value="">มอบหมายรายการที่แสดงให้…</option><option value="__clear">— ล้างผู้รับผิดชอบ —</option>${people.map(p => `<option value="${p.id}">${esc(p.display_name || p.username)}</option>`).join("")}</select><button class="btn" type="button" id="bkBtn" disabled>มอบหมาย ${nf(rows.length)} รายการ</button>`;
  $("bkSel").value = keep; $("bkBtn").disabled = !keep || !rows.length;
  $("bkSel").onchange = () => { $("bkBtn").disabled = !$("bkSel").value || !rows.length; $("bkBtn").dataset.armed = ""; $("bkBtn").textContent = `มอบหมาย ${nf(rows.length)} รายการ`; };
  $("bkBtn").onclick = async () => {
    const b = $("bkBtn");
    if (b.dataset.armed !== "1"){ b.dataset.armed = "1"; b.textContent = `ยืนยันมอบหมาย ${nf(rows.length)} รายการ?`; return; }
    b.disabled = true; const v = $("bkSel").value;
    try{ const n = await bulkAssign(rows, v === "__clear" ? null : v); $("bkSel").value = ""; render(); banner(`มอบหมายแล้ว ${nf(n)} รายการ`, "ok"); }
    catch(e){ banner(sbMsg(e), "err"); render(); }
  };
}
/* ---------- Export Excel ---------- */
const daysText = r => r.days === null ? "ไม่มีวันครบรอบ" : r.days < 0 ? `เลยมา ${-r.days} วัน` : r.days === 0 ? "ครบวันนี้" : `อีก ${r.days} วัน`;
const fuLabel = r => (FU.find(o => o.k === (fuOf(r).s || "")) || FU[0]).label;
const EXP_FU = [["การติดตาม", fuLabel, 16], ["นัดติดตามครั้งถัดไป", r => fuOf(r).next ? fmtD(toDate(fuOf(r).next)) : "", 14], ["ผู้รับผิดชอบ", r => asgName(fuOf(r).asg), 16], ["บันทึกการติดตาม", r => fuOf(r).note || "", 40], ["บันทึกล่าสุดโดย", r => fuOf(r).by ? (S.names[fuOf(r).by] || "") : "", 16], ["บันทึกล่าสุดเมื่อ", r => fuOf(r).at ? fmtDT(fuOf(r).at) : "", 17]];
const EXP_RENEW = [["สถานะครบรอบ", daysText, 16], ["WarrantDate (วันหมดอายุ)", r => fmtD(r.due), 14], ["ที่มาของวันหมดอายุ", r => r.dueSrc === "next" ? "ครบรอบครั้งถัดไป (ไม่พบใน Other)" : r.warrantSrc === "file" ? "ไฟล์" : r.due ? "ช่อง Other" : "", 22], ...EXP_FU,
  ["ID Station", r => r.code, 11], ["Station", r => r.name, 36], ["Brand", r => r.brand, 9], ["Other", r => r.other, 50], ["Informer / InPhone", r => r.inform, 32], ["Province", r => r.province, 14], ["Work order", r => r.wo, 15], ["Job no.", r => r.job, 12], ["Section", r => r.sup, 26]];
const EXP_ALL = [["สถานะดำเนินการ", r => r.proc, 16], ["Work order", r => r.wo, 15], ["Job no.", r => r.job, 12], ["Open date", r => fmtD(r.open), 11], ["Finish date", r => fmtD(r.fin), 11], ["Brand", r => r.brand, 9], ["ID Station", r => r.code, 11], ["Station", r => r.name, 36], ["Informer / InPhone", r => r.inform, 32], ["Problem", r => r.problem, 40], ["Other", r => r.other, 50], ["Province", r => r.province, 14], ["Technician", r => r.user, 14], ["Section", r => r.sup, 26], ["SerialNumber", r => r.serial, 20], ["InstallDate", r => fmtD(r.install), 11], ["WarrantDate", r => fmtD(r.warrant), 11], ["สถานะครบรอบ", daysText, 16], ["การติดตาม", fuLabel, 16]];
function exportXlsx(which){
  if (typeof XLSX === "undefined"){ banner("โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ กรุณารีเฟรชหน้า", "err"); return; }
  const rows = sortRows((which === "renew" ? S.renRows : S.allRows) || [], S.sort[which]);
  if (!rows.length){ banner("ไม่มีรายการให้ Export ตามตัวกรองนี้", "err"); return; }
  const cols = which === "renew" ? EXP_RENEW : EXP_ALL, name = which === "renew" ? "ติดตามต่อสัญญา" : "งานตีตราทั้งหมด";
  const aoa = [cols.map(c => c[0]), ...rows.map(r => cols.map(c => { const v = c[1](r); return v == null ? "" : String(v); }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = cols.map(c => ({wch: c[2] || 14})); ws["!autofilter"] = {ref: XLSX.utils.encode_range({s: {r: 0, c: 0}, e: {r: aoa.length - 1, c: cols.length - 1}})};
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, name);
  XLSX.writeFile(wb, `SETS-${name}-${isoD(new Date())}.xlsx`);
  banner(`Export ${nf(rows.length)} รายการแล้ว`, "ok");
}
$("expRenew").onclick = () => exportXlsx("renew"); $("expAll").onclick = () => exportXlsx("all");
$("fFu").onchange = e => { S.fFu = e.target.value; S.page.renew = 0; render(); };
$("clearF").onclick = () => { S.f = {q:"",brand:"",proc:"",sup:"",user:"",month:""}; S.fYr = null; $("q").value = ""; ["fBrand","fProc","fSup","fUser","fMonth"].forEach(id => $(id).value = ""); S.renewMonth = null; S.page = {renew: 0, all: 0, st: 0}; render(); };
$("tabRenew").onclick = () => setTab("renew"); $("tabAll").onclick = () => setTab("all"); $("tabSt").onclick = () => setTab("st");
$("expSt").onclick = () => exportStations();

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
(function showVersion(){ const t=`SETS Seal Tracker v${APP_VERSION} · ${APP_RELEASED}`; ["verLogin","verFoot"].forEach(id=>{const e=document.getElementById(id); if(e) e.textContent=t;}); })();
(async function boot(){
  let t = "renew"; try{ t = localStorage.getItem("set-seal-tab") || "renew"; }catch(e){} setTab(t);
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

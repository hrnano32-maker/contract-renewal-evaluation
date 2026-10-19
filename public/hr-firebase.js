import {firebaseConfig} from './firebase-config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,addDoc,collection,query,where,onSnapshot,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const text=(id,s)=>{if($(id))$(id).textContent=s;};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const states={draft:'ฉบับร่าง',submitted:'รอ HR พิจารณา',approved:'อนุมัติแล้ว',returned:'ส่งกลับแก้ไข'};
let auth,db,user=null,role='',department='',unsub=()=>{},records=[],editingId=null,selectedData=null;
const formIds=['employee','job','department','reviewer','reviewerPosition','from','to','sick','personal','absent','late','attendanceNote','reason','strength1','strength2','strength3','improve1','improve2','improve3','decision','summary','reviewDate','approver','approverPosition'];
function tab(page){$('formPage').hidden=page!=='form';$('hrPage').hidden=page!=='hr';$('tabForm').className=page==='form'?'':'secondary';$('tabHR').className=page==='hr'?'':'secondary';}
$('tabForm').onclick=()=>tab('form');$('tabHR').onclick=()=>tab('hr');
const value=id=>$(id)?.value??'';
const scores=()=>Array.from({length:10},(_,i)=>value('score'+i));
function getForm(){const fields=Object.fromEntries(formIds.filter(id=>$(id)).map(id=>[id,value(id)]));const sc=scores();return {fields,scores:sc,total:sc.reduce((n,x)=>n+Number(x||0),0)};}
function fillForm(data){for(const [id,v] of Object.entries(data.fields||{}))if($(id))$(id).value=v;for(let i=0;i<10;i++)if($('score'+i))$('score'+i).value=data.scores?.[i]??'';if(typeof window.calculate==='function')window.calculate();}
function validate(){const f=getForm();if(!f.fields.employee||!f.fields.reviewer||!f.fields.department||!f.fields.decision||f.scores.some(x=>x===''))throw Error('กรอกชื่อพนักงาน แผนก ผู้ประเมิน ผลพิจารณา และคะแนนทั้ง 10 หัวข้อให้ครบ');if(f.scores.some(x=>!Number.isInteger(+x)||+x<0||+x>10))throw Error('คะแนนต้องอยู่ระหว่าง 0 ถึง 10');if(f.fields.department!==department)throw Error('หัวหน้างานส่งผลประเมินได้เฉพาะแผนกของตน');}
async function save(submit){
 if(!user||role!=='supervisor')throw Error('เฉพาะหัวหน้างานที่ได้รับสิทธิ์เท่านั้นที่บันทึกแบบประเมินได้');
 if(submit)validate();
 const f=getForm(),payload={...f,employeeName:f.fields.employee,department:department,reviewerUid:user.uid,reviewerEmail:user.email,status:submit?'submitted':'draft',updatedAt:serverTimestamp()};
 if(editingId){const ref=doc(db,'contractReviews',editingId),old=await getDoc(ref);if(!old.exists()||old.data().reviewerUid!==user.uid||!['draft','returned'].includes(old.data().status))throw Error('รายการนี้แก้ไขไม่ได้');await setDoc(ref,payload,{merge:true});}
 else{const ref=await addDoc(collection(db,'contractReviews'),{...payload,createdAt:serverTimestamp()});editingId=ref.id;}
 window.state=submit?'รออนุมัติ':'ฉบับร่าง';if(typeof window.updateStatus==='function')window.updateStatus();
 alert(submit?'ส่งผลประเมินให้ HR พิจารณาแล้ว':'บันทึกฉบับร่างแล้ว');
}
async function decide(id,status){
 if(!user||role!=='hr')throw Error('เฉพาะ HR มีสิทธิ์อนุมัติหรือส่งกลับ');
 const note=status==='returned'?prompt('ระบุเหตุผลที่ส่งกลับแก้ไข'):'';
 if(note===null||(status==='returned'&&!note.trim()))return;
 const ref=doc(db,'contractReviews',id);
 await runTransaction(db,async t=>{const s=await t.get(ref);if(!s.exists()||s.data().status!=='submitted')throw Error('รายการไม่อยู่ในสถานะรอพิจารณา');t.update(ref,{status,approverUid:user.uid,approverEmail:user.email,approvalNote:note,decidedAt:serverTimestamp(),updatedAt:serverTimestamp()});});
 alert('บันทึกผลพิจารณาเรียบร้อย');
}
function render(){
 const q=value('hrSearch').toLowerCase(),f=value('hrFilter');
 const filtered=records.filter(r=>(!f||r.status===f)&&[r.employeeName,r.department,r.fields?.employeeId].some(x=>String(x||'').toLowerCase().includes(q)));
 $('hrRows').innerHTML=filtered.map(r=>`<tr><td>${escape(r.employeeName)}</td><td>${escape(r.department)}</td><td>${escape(r.fields?.reviewer)}</td><td>${Number(r.total)||0}/100</td><td>${escape(states[r.status]||r.status)}</td><td><button type="button" data-view="${escape(r.id)}">ดูรายละเอียด</button></td></tr>`).join('')||'<tr><td colspan="6">ไม่พบรายการ</td></tr>';
}
$('hrSearch').oninput=render;$('hrFilter').onchange=render;
$('hrRows').onclick=e=>{
 const id=e.target.closest('[data-view]')?.dataset.view,r=records.find(x=>x.id===id);if(!r)return;
 selectedData=r;
 const d=$('hrDetail');d.hidden=false;
 d.innerHTML=`<h2>ผลประเมิน: ${escape(r.employeeName)}</h2><p>แผนก: ${escape(r.department)} · ผู้ประเมิน: ${escape(r.fields?.reviewer)} · คะแนน: ${Number(r.total)||0}/100 · สถานะ: ${escape(states[r.status])}</p><p>ผลการพิจารณาของหัวหน้า: ${escape(r.fields?.decision)}</p><p>เหตุผล: ${escape(r.fields?.reason)}</p><p>เหตุผลสรุป: ${escape(r.fields?.summary)}</p><div class="actions"><button id="openReview" type="button">เปิดแบบประเมิน</button>${r.status==='submitted'&&role==='hr'?'<button id="approveReview" type="button" class="success">HR อนุมัติ</button><button id="returnReview" type="button" class="secondary">ส่งกลับแก้ไข</button>':''}</div>`;
 d.querySelector('#openReview').onclick=()=>{fillForm(r);editingId=r.id;selectedData=r;window.state=states[r.status];if(typeof window.updateStatus==='function')window.updateStatus();tab('form');scrollTo(0,0);};
 if(d.querySelector('#approveReview'))d.querySelector('#approveReview').onclick=()=>decide(r.id,'approved').catch(e=>alert(e.message));
 if(d.querySelector('#returnReview'))d.querySelector('#returnReview').onclick=()=>decide(r.id,'returned').catch(e=>alert(e.message));
};
function listen(){
 unsub();
 const q=role==='hr'?query(collection(db,'contractReviews'),where('status','in',['submitted','approved','returned'])):query(collection(db,'contractReviews'),where('reviewerUid','==',user.uid));
 unsub=onSnapshot(q,s=>{records=s.docs.map(d=>({id:d.id,...d.data()}));render();if(selectedData){selectedData=records.find(r=>r.id===selectedData.id)||selectedData;if(selectedData.status==='approved'){window.state='อนุมัติแล้ว';if(typeof window.updateStatus==='function')window.updateStatus();}}},e=>text('authInfo','อ่านข้อมูลไม่ได้: '+e.message));
}
const guarded=[['บันทึกฉบับร่าง',()=>save(false)],['ส่งพิจารณาอนุมัติ',()=>save(true)],['อนุมัติ (ตัวอย่าง)',()=>Promise.reject(Error('ให้ HR อนุมัติผ่านหน้ารวมเท่านั้น'))],['ส่งกลับแก้ไข',()=>Promise.reject(Error('ให้ HR ส่งกลับผ่านหน้ารวมเท่านั้น'))]];
for(const [label,fn] of guarded){const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(btn){btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();fn().catch(x=>alert(x.message));},true);if(label.includes('ตัวอย่าง')||label==='ส่งกลับแก้ไข')btn.hidden=true;}}
for(const id of ['pdfBtn','wordBtn']){if($(id))$(id).addEventListener('click',e=>{if(!selectedData||selectedData.status!=='approved'||editingId!==selectedData.id){e.preventDefault();e.stopImmediatePropagation();alert('เปิดรายการที่ HR อนุมัติแล้วจากหน้ารวมก่อนดาวน์โหลด');}},true);}
try{
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 $('loginBtn').onclick=()=>signInWithEmailAndPassword(auth,value('loginEmail'),value('loginPassword')).catch(e=>alert('เข้าสู่ระบบไม่สำเร็จ: '+e.message));
 $('logoutBtn').onclick=()=>signOut(auth);
 onAuthStateChanged(auth,async u=>{
  unsub();user=u;role='';department='';editingId=null;selectedData=null;
  if(!u){text('authInfo','ยังไม่ได้เข้าสู่ระบบ');$('loginForm').hidden=false;$('loginBtn').hidden=false;$('logoutBtn').hidden=true;$('tabHR').hidden=true;tab('form');return;}
  try{
   const p=await getDoc(doc(db,'hrUsers',u.uid));
   if(!p.exists()||!p.data().active||!['hr','supervisor'].includes(p.data().role)){text('authInfo','บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน');$('tabHR').hidden=true;return;}
   role=p.data().role;department=p.data().department||'';
   text('authInfo',u.email+' · '+(role==='hr'?'HR':'หัวหน้างาน')+' · '+department);
   $('loginForm').hidden=true;$('loginBtn').hidden=true;$('logoutBtn').hidden=false;$('tabHR').hidden=role!=='hr';
   if(role==='supervisor'&&$('department'))$('department').value=department;
   listen();tab(role==='hr'?'hr':'form');
  }catch(e){text('authInfo','อ่านสิทธิ์ผู้ใช้ไม่ได้: '+e.message);}
 });
}catch(e){text('authInfo','เชื่อมต่อ Firebase ไม่สำเร็จ: '+e.message);}

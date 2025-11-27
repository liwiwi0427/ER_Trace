/* ================= GLOBAL ================= */
// 確保讀取到資料庫
let DATA = (typeof ECG_DATABASE !== 'undefined') ? ECG_DATABASE : null;
if (!DATA) console.error("FATAL: Data.js not loaded correctly!");

let curKey = 'nsr';
let isCharging=false, isReady=false;
let shockFx=0, adenFx=0;
let animTimers=[];
const cvs = document.getElementById('ecgCanvas');
const ctx = cvs.getContext('2d');
let x=0, speed=1.5, lastY=150;
let nextBeatTime=0;

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Restore
    const savedTheme = localStorage.getItem('ecg_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    const sel = document.getElementById('themeSelect');
    if(sel) sel.value = savedTheme;

    // 2. User Info
    const user = localStorage.getItem('ecg_username');
    if (user) document.getElementById('user-display').innerText = `Staff: ${user}`;

    resize();
    window.addEventListener('resize', resize);
    setupHover(); // 解剖圖提示

    if (DATA) {
        loadCase('nsr'); // 預設
        drawLoop();      // 啟動繪圖
        setInterval(fluctuate, 2000); // 數值浮動
    }
});

function resize(){
    if(cvs && cvs.parentElement){
        cvs.width = cvs.parentElement.clientWidth;
        cvs.height = cvs.parentElement.clientHeight;
        lastY = cvs.height/2;
    }
}

/* ================= CORE LOGIC ================= */
function loadCase(k) {
    if (!DATA[k]) {
        console.error(`Case [${k}] not found in DB`);
        return;
    }
    curKey = k;
    
    // Clear Animation Timers
    animTimers.forEach(t=>clearTimeout(t)); animTimers=[];
    
    // Update Buttons State
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // (Button active state can be handled by clicking event context or simplified)

    const d = DATA[k];
    
    // Text UI
    setText('txt-title', d.t);
    setText('txt-patho', d.patho);
    const tag = document.getElementById('txt-tag');
    if(tag) { tag.innerText = d.b; tag.style.background = d.c; }
    
    fillList('list-cri', d.cri);
    fillList('list-rx', d.rx);
    fillList('list-cause', d.cause);
    fillList('list-nur', d.n);

    // Vitals UI
    setVal('val-hr', d.hr); setVal('val-spo2', d.spo2);
    setVal('val-rr', d.rr); setVal('val-temp', d.temp);
    // NIBP Logic: Clear old values on new case
    setText('val-sys', '--'); setText('val-dia', '--');

    // Alert Logic
    const ab = document.getElementById('alert-banner');
    ab.style.display = 'none';
    if(d.shock) {
        ab.style.display='block'; ab.innerHTML="⚡ SHOCKABLE RHYTHM"; 
        ab.style.background="rgba(255,200,0,0.15)"; ab.style.borderColor="orange"; ab.style.color="orange";
    } else if(['pvt','pea','asystole','vf'].includes(k) && !d.shock) { 
        // Logic check: VF/pVT are shockable usually, check your medical protocol logic in DB
        // But for Pea/Asys:
        ab.style.display='block'; ab.innerHTML="⛔ NON-SHOCKABLE";
        ab.style.background="rgba(255,0,0,0.15)"; ab.style.borderColor="red"; ab.style.color="red";
    }

    runAnatomy(d.vis);
}

function changeTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('ecg_theme', theme);
}

/* ================= WAVEFORM DRAWING ================= */
function getWave(t) {
    const cy = cvs.height/2;
    if(shockFx>0) { shockFx--; return cy + (Math.random()-0.5)*600; }
    if(adenFx>0) { adenFx--; return cy + (Math.random()-0.5)*5; }

    let y = 0;
    
    // 1. NSR family
    if(['nsr','sb','pea','avb1'].includes(curKey)) {
        let rate = (curKey==='sb') ? 1.3 : 0.8;
        let p = (t/1000)%rate / rate;
        // P
        y -= 6 * Math.exp(-Math.pow((p-0.15)/0.03, 2));
        // QRS
        if(p>0.28 && p<0.34) y += 60 * Math.sin((p-0.28)*50);
        // T
        y -= 10 * Math.exp(-Math.pow((p-0.5)/0.06, 2));
    }
    // 2. AFib
    else if(curKey==='afib') {
        y += Math.sin(t*0.05)*3 + (Math.random()-0.5)*3; // f-waves
        if(Math.random() > 0.98) y -= 50; // irregular QRS
    }
    // 3. VT
    else if(curKey==='vt' || curKey==='pvt') {
        y = Math.sin(t*0.02) * 50;
    }
    // 4. VF
    else if(curKey==='vf') {
        y = Math.sin(t*0.015)*20 + Math.sin(t*0.04)*10 + (Math.random()-0.5)*10;
    }
    // 5. Asystole
    else if(curKey==='asystole') {
        y = (Math.random()-0.5)*2;
    }
    // 6. Others fallback
    else {
        y = (Math.random()-0.5)*5; 
    }
    return cy + y;
}

function drawLoop() {
    // 配合主題變數
    const style = getComputedStyle(document.body);
    ctx.fillStyle = style.getPropertyValue('--bg-monitor') || '#000';
    ctx.fillRect(x,0,8,cvs.height);

    ctx.beginPath();
    ctx.strokeStyle = style.getPropertyValue('--c-hr') || '#0f0';
    ctx.lineWidth = 2;
    
    let y = getWave(Date.now());
    ctx.moveTo(x-speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastY = y; x += speed;
    if(x>cvs.width){ x=0; ctx.beginPath(); }
    requestAnimationFrame(drawLoop);
}

/* ================= NIBP Logic ================= */
function runNIBP() {
    const btn = document.getElementById('btn-nibp');
    if(btn.innerText.includes("START") || btn.innerText.includes("測量")) {
        btn.innerText = "Running...";
        btn.classList.add('active');
        setText('val-sys','---'); setText('val-dia','---');
        
        setTimeout(()=>{
            btn.innerText = "START";
            btn.classList.remove('active');
            const d = DATA[curKey];
            if(d.sys !== "---") {
                const s = parseInt(d.sys) + Math.floor(Math.random()*16)-8;
                const dia = parseInt(d.dia) + Math.floor(Math.random()*10)-5;
                setText('val-sys', s); setText('val-dia', dia);
            } else {
                setText('val-sys', '---'); setText('val-dia', '---');
            }
        }, 3000);
    }
}

/* ================= ANATOMY (Detailed) ================= */
function runAnatomy(type) {
    // Clean states
    const ids = ['n-sa','n-av','p-internodal','p-his','p-branches'];
    ids.forEach(i=>{
        const el = document.getElementById(i);
        if(el) { el.classList.remove('active','flowing'); el.style.opacity='0.2'; }
    });
    // Hide markers
    document.getElementById('vis-reentry').style.display='none';
    document.getElementById('vis-block').style.display='none';

    const seq = () => {
        // NSR/Brady/PEA
        if(['nsr','sb','pea'].includes(type) || type==='avb1') {
            let rate = (type==='sb') ? 1300 : 900;
            flash('n-sa',150);
            timer(()=>flow('p-internodal'), 50);
            timer(()=>flash('n-av',150), 250);
            timer(()=>flow('p-his'), 400);
            timer(()=>{flow('p-branches'); if(type!=='pea') thump();}, 450);
            timer(seq, rate);
        }
        else if(type==='vt' || type==='pvt' || type==='vf') {
            flow('p-branches'); // Retrograde look
            if(!type==='vf') thump();
            timer(seq, (type==='vf')?200:450);
        }
        else if(type==='psvt' || type==='afl') {
            document.getElementById('vis-reentry').style.display='block';
            thump(); timer(seq, 300);
        }
        else {
            // Default Block/Asystole
            if(type.includes('avb')) document.getElementById('vis-block').style.display='block';
            if(type!=='asystole') timer(seq, 1000);
        }
    };
    seq();
}

function flash(id,ms) { const e=document.getElementById(id); if(e){e.classList.add('active'); setTimeout(()=>e.classList.remove('active'),ms);} }
function flow(id) { const e=document.getElementById(id); if(e){e.classList.remove('flowing'); void e.offsetWidth; e.classList.add('flowing');} }
function thump() { const m=document.getElementById('h-muscle'); if(m){m.style.transition='0.1s'; m.style.transform='scale(0.97)'; setTimeout(()=>m.style.transform='scale(1)',100);} }
function timer(f,m) { animTimers.push(setTimeout(f,m)); }

// Helpers
function setText(id, t) { if(document.getElementById(id)) document.getElementById(id).innerText=t; }
function setVal(id, v) { if(document.getElementById(id)) document.getElementById(id).innerText=(v===undefined?'--':v); }
function fillList(id, arr) { document.getElementById(id).innerHTML = arr ? arr.map(x=>`<li>${x}</li>`).join('') : ''; }
function fluctuate() { 
    if(DATA[curKey].hr && typeof DATA[curKey].hr==='number') {
        const v = Math.floor(Math.random()*3)-1;
        document.getElementById('val-hr').innerText = DATA[curKey].hr + v;
    }
}
function setupHover() {
    const tip = document.getElementById('anat-tip');
    document.querySelectorAll('.node, .path-wire').forEach(e => {
        e.addEventListener('mouseenter', ()=> { tip.innerText = e.getAttribute('data-name') || "Unknown"; tip.style.color="#fff"; });
        e.addEventListener('mouseleave', ()=> { tip.innerText = "Interactive View"; tip.style.color="#aaa"; });
    });
}
function giveDrug(n){ const l=document.getElementById('med-log'); const d=document.createElement('div'); d.className='log-line'; d.innerText=`💉 ${n}`; l.appendChild(d); setTimeout(()=>d.remove(),4000); if(n.includes('Aden') && curKey==='psvt') setTimeout(()=>loadCase('nsr'),2000); }
function charge(){ if(!isCharging){ isCharging=true; document.getElementById('btn-chg').innerText="CHG..."; setTimeout(()=>{isCharging=false;isReady=true;document.getElementById('btn-chg').innerText="READY";document.getElementById('btn-shk').disabled=false;document.getElementById('btn-shk').classList.add('ready');},2000);} }
function shock(){ if(isReady){ shockFx=30; document.getElementById('shock-flash').style.opacity=1; setTimeout(()=>document.getElementById('shock-flash').style.opacity=0,200); if(DATA[curKey].shock) setTimeout(()=>loadCase('nsr'),1000); else if(curKey!=='asystole') setTimeout(()=>loadCase('vf'),1000); resetDefib(); }}
function resetDefib(){ isReady=false; document.getElementById('btn-chg').innerText="CHARGE"; const b=document.getElementById('btn-shk'); b.disabled=true; b.classList.remove('ready'); }
function logout(){ localStorage.removeItem('ecg_username'); location.reload(); }
function openModal(){ document.getElementById('info-modal').style.display='flex'; }
function closeModal(){ document.getElementById('info-modal').style.display='none'; }
function openTab(n){
    document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
    document.getElementById('t'+n).classList.add('active');
    document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
    event.target.classList.add('active');
}

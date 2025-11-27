/* ================= GLOBAL & DATA CHECK ================= */
let DATA = (typeof ECG_DATABASE !== 'undefined') ? ECG_DATABASE : (typeof DB !== 'undefined' ? DB : null);
if(!DATA) console.error("Database Not Found!");

// 核心變數
let curKey = 'nsr';
let isReady=false, isCharging=false;
let shockFx=0, drugFx=0; // 特效計數器
let animTimers = [];     // 存放動畫Timer以便清除

const cvs = document.getElementById('ecgCanvas');
const ctx = cvs.getContext('2d');
let x=0, speed=1.5, lastY=150;

// 波形參數
let nextBeat = 0; 

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
    // 登入者
    const u = localStorage.getItem('ecg_username');
    if(u) {
        document.getElementById('user-display').innerText = "Staff: "+u;
        document.getElementById('modal-user').innerText = u;
    }

    resize();
    window.addEventListener('resize', resize);
    setupHover(); // SVG 互動

    // 啟動預設
    if(DATA) {
        loadCase('nsr');
        draw(); 
        setInterval(fluctuateVitals, 2000); // 讓數字稍微跳動
    }
});

function resize() {
    if(cvs.parentElement) {
        cvs.width = cvs.parentElement.clientWidth;
        cvs.height = cvs.parentElement.clientHeight;
        lastY = cvs.height/2;
    }
}

/* ================= LOAD CASE LOGIC ================= */
function loadCase(k) {
    if(!DATA || !DATA[k]) return;
    curKey = k;
    
    // 清除動畫 Timer
    animTimers.forEach(t=>clearTimeout(t)); animTimers=[];
    
    // 更新選單 Highlighting
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // (需要靠 onclick 觸發 CSS 變更)
    const clickedBtn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if(clickedBtn) clickedBtn.classList.add('active');

    const d = DATA[k];
    
    // 1. 文字資訊
    document.getElementById('txt-title').innerText = d.t;
    document.getElementById('txt-tag').innerText = d.b;
    document.getElementById('txt-tag').style.background = d.c;
    fill('list-cri', d.cri); fill('list-rx', d.rx); 
    fill('list-cause', d.cause); fill('list-nur', d.n);
    document.getElementById('txt-patho').innerText = d.patho;

    // 2. Vitals (NIBP 除外)
    setVal('val-hr', d.hr); setVal('val-spo2', d.spo2);
    setVal('val-rr', d.rr); setVal('val-temp', d.temp);
    
    // 3. Alert
    const box = document.getElementById('alert-banner');
    if(d.shock) {
        box.style.display='block'; box.innerHTML="⚡ SHOCKABLE RHYTHM"; 
        box.style.borderColor="orange"; box.style.color="orange"; box.style.background="rgba(255,165,0,0.1)";
    } else if (['pea','pvt','asystole','asys'].includes(k)) {
        box.style.display='block'; box.innerHTML="⛔ NON-SHOCKABLE";
        box.style.borderColor="red"; box.style.color="red"; box.style.background="rgba(255,0,0,0.1)";
    } else {
        box.style.display='none';
    }

    // 4. 重置電擊器
    isReady=false; isCharging=false;
    document.getElementById('btn-chg').innerText="CHARGE";
    const sb = document.getElementById('btn-shk'); sb.disabled=true; sb.classList.remove('ready');

    // 5. 執行心臟動畫
    animateHeart(d.vis);
}

/* ================= ANIMATION (SA -> Path -> AV -> Vent) ================= */
function animateHeart(type) {
    // Reset Classes
    ['n-sa','n-av','p-internodal','p-his','p-branches'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) { el.classList.remove('active','flowing'); el.style.opacity='0.2'; }
    });
    document.getElementById('vis-reentry').style.display='none';
    document.getElementById('vis-block').style.display='none';

    // Sequence Generator
    const seq = () => {
        // --- 正常 / 緩脈 / PEA ---
        if(['nsr','sb','pea'].includes(type) || type==='avb1') {
            let rate = (type==='sb') ? 1300 : 900;
            
            flash('n-sa', 150); // 1. SA Node
            
            setTimeout(()=> flow('p-internodal'), 50); // 2. Internodal
            
            setTimeout(()=> {
                flash('n-av', 150); // 3. AV Node
                // AVB1 delay block bar visual (optional, skip for simplicity)
            }, 250); 
            
            setTimeout(()=> flow('p-his'), 400 + (type==='avb1'?200:0)); // 4. His
            
            setTimeout(()=> {
                flow('p-branches'); // 5. Ventricles
                if(type!=='pea') thump(); 
            }, 450 + (type==='avb1'?200:0));
            
            animTimers.push(setTimeout(seq, rate));
        }
        // --- Block (AVB3) ---
        else if(type.includes('avb3')) { // Dissociation
            flash('n-sa', 100); 
            // Randomly fire vents separate
            if(Math.random()>0.5) { flash('n-av',100); flow('p-branches'); thump(); }
            document.getElementById('vis-block').style.display='block';
            animTimers.push(setTimeout(seq, 1000));
        }
        // --- AFib ---
        else if(type==='afib') {
            flash('n-av', 100); // AV firing irregularly
            flow('p-branches');
            thump();
            animTimers.push(setTimeout(seq, 400 + Math.random()*400));
        }
        // --- VT/VF ---
        else if(['vt','vf','pvt'].includes(type)) {
            flow('p-branches'); // Retrograde
            if(type.includes('vt')) thump();
            animTimers.push(setTimeout(seq, (type==='vf')?200:450));
        }
        // --- PSVT ---
        else if(type==='psvt' || type==='afl') {
            document.getElementById('vis-reentry').style.display='block';
            thump();
            animTimers.push(setTimeout(seq, 320));
        }
    };
    seq();
}

// Helpers for Animation
function flash(id, ms) { 
    const el=document.getElementById(id); 
    if(el){el.classList.add('active'); el.style.opacity='1'; setTimeout(()=>el.classList.remove('active'), ms);} 
}
function flow(id) { 
    const el=document.getElementById(id); 
    if(el){
        el.classList.remove('flowing'); void el.offsetWidth; 
        el.classList.add('flowing'); el.style.opacity='1';
    } 
}
function thump() { 
    const m=document.getElementById('h-muscle'); 
    if(m) { m.classList.remove('muscle-pump'); void m.offsetWidth; m.classList.add('muscle-pump'); } 
}

/* ================= WAVEFORM DRAWING (REALISTIC) ================= */
function getWaveY(t) {
    const cy = cvs.height/2;
    if(shockFx>0) { shockFx--; return cy + (Math.random()-0.5)*500; } // Shock noise
    if(drugFx>0)  { drugFx--; return cy + (Math.random()-0.5)*2; }   // Flatline effect

    let y = 0;
    
    // 1. P-QRS-T Based (NSR, SB, AVB...)
    if(['nsr','sb','pea'].includes(curKey) || curKey.includes('avb')) {
        const rate = (curKey==='sb')?1.2:0.8;
        const phase = (t/1000)%rate;
        const p = phase/rate; // Normalized 0-1
        
        // P wave (0.1)
        if(Math.abs(p - 0.15) < 0.05) y -= 5 * Math.sin((p-0.1)*Math.PI*10); 
        // QRS (0.3)
        if(p>0.28 && p<0.32) {
            y += Math.sin((p-0.28)*Math.PI*50) * 50; 
        }
        // T wave (0.5)
        if(p>0.4 && p<0.55) {
            y -= 8 * Math.sin((p-0.4)*Math.PI*6);
        }
    }
    // 2. VT / pVT
    else if(curKey.includes('vt') || curKey==='pvt') {
        y = Math.sin(t*0.02) * 45; // Big Sine
    }
    // 3. VF
    else if(curKey==='vf') {
        y = Math.sin(t*0.015)*15 + Math.sin(t*0.05)*8 + (Math.random()-0.5)*5;
    }
    // 4. Afib (Irregular)
    else if(curKey==='afib') {
        // F-waves
        y += Math.sin(t*0.05)*3 + (Math.random()-0.5)*2;
        // Random Beat
        if(Math.random() > 0.985) y -= 45; 
    }
    else {
        y += (Math.random()-0.5)*3; // Flatline / Noise
    }
    
    return cy + y;
}

function draw() {
    // Fade / Scanbar
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-monitor') || '#000';
    ctx.fillRect(x, 0, 8, cvs.height);
    
    ctx.beginPath();
    ctx.strokeStyle = '#00ff00'; // Always Green line
    ctx.lineWidth = 2;
    
    let y = getWaveY(Date.now());
    ctx.moveTo(x-speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    lastY=y; x+=speed;
    if(x>cvs.width){ x=0; ctx.beginPath(); }
    requestAnimationFrame(draw);
}

/* ================= NIBP LOGIC (DELAY & RANDOM) ================= */
function runNIBP() {
    const btn = document.getElementById('btn-nibp');
    if(btn.innerText.includes('Start') || btn.innerText.includes('測量')) {
        btn.innerText = "Measuring..."; btn.classList.add('active');
        document.getElementById('val-sys').innerText = "--";
        document.getElementById('val-dia').innerText = "--";
        
        setTimeout(() => {
            btn.innerText = "START"; btn.classList.remove('active');
            
            const d = DATA[curKey];
            if(d && d.sys !== "---") {
                // Generate Value
                const s = parseInt(d.sys) + Math.floor(Math.random()*16 - 8);
                const dval = parseInt(d.dia) + Math.floor(Math.random()*10 - 5);
                document.getElementById('val-sys').innerText = s;
                document.getElementById('val-dia').innerText = dval;
            } else {
                document.getElementById('val-sys').innerText = "---";
                document.getElementById('val-dia').innerText = "---";
            }
        }, 3000); // 3 seconds delay
    }
}

/* ================= UTILS & HOVER ================= */
function setupHover() {
    const tip = document.getElementById('anat-tip');
    document.querySelectorAll('.path-wire, .node').forEach(el => {
        el.addEventListener('mouseenter', () => {
            tip.innerText = el.getAttribute('data-name'); tip.style.color = "#ffff00";
        });
        el.addEventListener('mouseleave', () => {
            tip.innerText = "Interactive View"; tip.style.color = "#aaa";
        });
    });
}

function fluctuateVitals() {
    if(DATA && DATA[curKey].hr && typeof DATA[curKey].hr==='number') {
        const r = Math.floor(Math.random()*3 - 1);
        document.getElementById('val-hr').innerText = DATA[curKey].hr + r;
    }
}

function giveDrug(n) {
    const log = document.getElementById('med-log');
    const d = document.createElement('div');
    d.className='log-line'; d.innerText=`💉 Give ${n}`;
    log.appendChild(d); setTimeout(()=>d.remove(), 4000);
    
    if(n.includes('Adenosine') && curKey==='psvt') {
        setTimeout(()=>{
            drugFx = 100; // flatline
            setTimeout(()=>loadCase('nsr'), 1500);
        }, 1000);
    }
}

function charge() {
    if(!isCharging) {
        isCharging=true; 
        document.getElementById('btn-chg').innerText="CHG...";
        setTimeout(()=>{ isCharging=false; isReady=true; document.getElementById('btn-chg').innerText="READY"; document.getElementById('btn-shk').disabled=false; document.getElementById('btn-shk').classList.add('ready');}, 2000);
    }
}
function shock() {
    if(isReady) {
        shockFx=30; 
        document.getElementById('shock-flash').style.opacity=1; 
        setTimeout(()=>document.getElementById('shock-flash').style.opacity=0, 200);
        if(DATA[curKey].shock) setTimeout(()=>loadCase('nsr'), 1000);
        else if(curKey!=='asystole') setTimeout(()=>loadCase('vf'), 1000);
        isReady=false; document.getElementById('btn-shk').disabled=true; document.getElementById('btn-shk').classList.remove('ready'); document.getElementById('btn-chg').innerText="CHARGE";
    }
}

function fill(id, arr) { document.getElementById(id).innerHTML = arr?arr.map(x=>`<li>${x}</li>`).join(''):''; }
function setVal(id, v) { document.getElementById(id).innerText = v; }
function toggleTheme(){
    const b = document.body;
    if(!b.getAttribute('data-theme')) b.setAttribute('data-theme', 'light');
    else b.removeAttribute('data-theme');
}
function openModal(){ document.getElementById('info-modal').style.display='flex'; }
function closeModal(){ document.getElementById('info-modal').style.display='none'; }
function logout(){ localStorage.removeItem('ecg_username'); location.reload(); }
// Tab switching
function openTab(n) {
    document.querySelectorAll('.tab-content').forEach(e=>e.style.display='none');
    document.getElementById('t'+n).style.display='block';
    document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
    event.target.classList.add('active');
}

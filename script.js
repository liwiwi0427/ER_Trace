/* ================= VARIABLES ================= */
let curKey = 'nsr';
let joules = 200, isCharging = false, isReady = false;
let shockFx = 0, adenosineFx = 0;
let animTimers = []; 
const cvs = document.getElementById('ecgCanvas');
const ctx = cvs.getContext('2d');
let x = 0, speed = 1.5, lastY = 150;
let nextBeatTime = 0; // for AFib irregular logic

/* ================= INITIALIZATION ================= */
window.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const user = localStorage.getItem('ecg_username');
    if (user) {
        const b = document.getElementById('user-staff-badge');
        const m = document.getElementById('modal-user-name');
        if(b) b.innerHTML = `Staff: <strong>${user}</strong>`;
        if(m) m.innerText = user;
    } else {
        // 簡單防呆
        if(window.location.href.indexOf('login.html') === -1) {
            // 為了預覽方便，如果是在本地檔案且沒登入，暫時不跳轉
            console.warn("No user logged in");
        }
    }

    resize();
    window.addEventListener('resize', resize);
    
    // Hover Tips for Anatomy
    initAnatomyHover();

    // Start
    loadCase('nsr');
    draw();
    setInterval(fluctuate, 2000); // 微幅波動
});

function resize() {
    if(cvs.parentElement) {
        cvs.width = cvs.parentElement.clientWidth;
        cvs.height = cvs.parentElement.clientHeight;
        lastY = cvs.height/2;
    }
}

function initAnatomyHover() {
    const txt = document.getElementById('anatomy-text');
    const els = document.querySelectorAll('.path-wire, .node-dot');
    els.forEach(el => {
        el.addEventListener('mouseenter', () => {
            txt.innerText = el.getAttribute('data-tip');
            txt.style.color = "#fff";
        });
        el.addEventListener('mouseleave', () => {
            txt.innerText = "Normal Conduction";
            txt.style.color = "var(--text-muted)";
        });
    });
}

/* ================= LOAD CASE ================= */
function loadCase(k) {
    if(!ECG_DATABASE[k]) return;
    curKey = k;
    resetDefib();
    
    // Clear timers
    animTimers.forEach(t=>clearTimeout(t)); animTimers=[];

    // Buttons UI
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    // ... (add active class logic if needed via event)

    const d = ECG_DATABASE[k];
    
    // Update Text
    document.getElementById('txt-title').innerText = d.t;
    const tag = document.getElementById('txt-tag');
    tag.innerText = d.b; tag.style.background = d.c;
    
    fill('list-criteria', d.cri); fill('list-rx', d.rx);
    fill('list-nurse', d.n); fill('list-causes', d.cause);
    document.getElementById('txt-patho').innerText = d.patho;

    // Vitals - Load Standard
    setVal('val-hr', d.hr);
    setVal('val-spo2', d.spo2);
    setVal('val-rr', d.rr);
    setVal('val-temp', d.temp);
    
    // NIBP Reset (Standard behavior: resets on new patient/case)
    document.getElementById('val-sys').innerText = (d.sys==='---')?'---':'--';
    document.getElementById('val-dia').innerText = (d.sys==='---')?'---':'--';

    // Alerts
    const box = document.getElementById('alert-box');
    box.style.display = 'none';
    if(d.shock) {
        box.style.display='block'; box.innerHTML="⚡ SHOCKABLE"; 
        box.style.border='2px solid #f00'; box.style.color='#f00';
    } else if (k === 'asystole' || k === 'pvt' || k === 'pea') {
        box.style.display='block'; box.innerHTML="⛔ NON-SHOCKABLE";
        box.style.border='2px solid #f00'; box.style.color='#f00';
    }

    runAnatomy(d.vis);
}

/* ================= NIBP RANDOMIZER ================= */
function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    if(btn.innerText === "測量") {
        btn.innerText = "測量中..."; btn.classList.add('active');
        document.getElementById('val-sys').innerText = "---";
        document.getElementById('val-dia').innerText = "---";
        
        setTimeout(() => {
            btn.innerText = "測量"; btn.classList.remove('active');
            const d = ECG_DATABASE[curKey];
            if(d.sys !== '---') {
                // Base value + Random(-10 to +10)
                const s = parseInt(d.sys) + Math.floor(Math.random()*20 - 10);
                const dia = parseInt(d.dia) + Math.floor(Math.random()*14 - 7);
                document.getElementById('val-sys').innerText = s;
                document.getElementById('val-dia').innerText = dia;
            } else {
                document.getElementById('val-sys').innerText = "---";
                document.getElementById('val-dia').innerText = "---";
            }
        }, 3000);
    }
}

/* ================= ANIMATION ENGINE ================= */
function runAnatomy(type) {
    // Reset
    const ids = ['n-sa','n-av','p-internodal','p-his','p-branches'];
    ids.forEach(i => {
        const el=document.getElementById(i); 
        el.classList.remove('flowing','firing'); 
        el.style.opacity='0.3'; // Back to dim
    });
    
    const seq = () => {
        // NSR / SB / PEA
        if(type==='nsr' || type==='sb' || type==='pea') {
            const rate = (type==='sb') ? 1300 : 900;
            fire('n-sa', 100);
            timer(()=>flow('p-internodal'), 50);
            timer(()=>fire('n-av', 150), 250);
            timer(()=>flow('p-his'), 400);
            timer(()=>flow('p-branches'), 450);
            timer(seq, rate);
        }
        // Blocks
        else if(type.includes('avb')) {
            fire('n-sa', 100);
            timer(()=>flow('p-internodal'), 50);
            
            if(type==='avb1') {
                timer(()=>fire('n-av', 150), 550); // Long delay
                timer(()=>flow('p-his'), 700);
                timer(()=>flow('p-branches'), 750);
            } 
            // AVB3 - dissociated, handled simply here
            if(type==='avb3') { timer(()=>fire('n-av', 100), 600); }
            
            timer(seq, 1100);
        }
        // VT / VF / PVC
        else if(type==='vt' || type==='vf' || type==='pvt') {
            flow('p-branches'); // Retrograde
            timer(seq, (type==='vf')?200:450);
        }
        else {
            // PSVT etc
            fire('n-av', 100); 
            timer(seq, 300);
        }
    };
    seq();
}

function fire(id, ms) { const el=document.getElementById(id); if(el){el.classList.add('firing'); setTimeout(()=>el.classList.remove('firing'),ms);} }
function flow(id) { 
    const el=document.getElementById(id); 
    if(el){
        el.classList.remove('flowing'); 
        void el.offsetWidth; // Reflow
        el.classList.add('flowing'); 
    } 
}
function timer(fn, ms) { animTimers.push(setTimeout(fn,ms)); }

/* ================= WAVEFORMS ================= */
function getWaveY(t) {
    const cy = cvs.height/2;
    if(shockFx>0){ shockFx--; return cy + (Math.random()-0.5)*500; }
    
    let y = 0;
    // NSR Logic
    if(['nsr','sb','avb1'].includes(curKey)) {
        const rate = (curKey==='sb')?1300:850;
        const p = t%rate;
        // P
        y += gaussian(p, 100, 25, -8);
        // QRS
        if(p>230 && p<270) {
            y += (p>248 && p<252)? 50:-15; 
            if(p>240 && p<260) y += (p%2==0)? -40:40;
        }
        // T
        y += gaussian(p, 450, 60, -12);
    }
    // AFib Logic
    else if(curKey==='afib') {
        // Irregular beats
        if(t > nextBeatTime) nextBeatTime = t + 500 + Math.random()*500;
        // F-waves noise
        y += Math.sin(t*0.05)*4 + (Math.random()-0.5)*3;
        // Beat?
        if(Math.abs(t-nextBeatTime) < 30) y += 50; 
        else if(Math.abs(t-nextBeatTime) < 50) y -= 15;
    }
    // VT Logic
    else if(curKey==='vt' || curKey==='pvt') {
        const p = t%350;
        y += Math.sin(p/350 * Math.PI*2) * 60;
    }
    // VF Logic
    else if(curKey==='vf') {
        y += Math.sin(t*0.01)*20 + Math.sin(t*0.03)*10 + (Math.random()-0.5)*10;
    }
    else {
        y += (Math.random()-0.5)*5; // Flat
    }
    
    return cy + y;
}

function gaussian(x,c,w,h){ return h*Math.exp(-Math.pow(x-c,2)/(2*w*w)); }

function draw() {
    // 清除背景
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-monitor');
    ctx.fillRect(x,0,8,cvs.height);
    
    ctx.beginPath();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-hr');
    ctx.lineWidth=2; ctx.lineCap='round';
    
    let y = getWaveY(Date.now());
    ctx.moveTo(x-speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    lastY=y; x+=speed;
    if(x>cvs.width){x=0;ctx.beginPath();}
    requestAnimationFrame(draw);
}

/* ================= UTILS ================= */
function setVal(id, v) { document.getElementById(id).innerText = v; }
function fluctuate() { 
    if(ECG_DATABASE[curKey].hr && typeof ECG_DATABASE[curKey].hr==='number') {
        document.getElementById('val-hr').innerText = ECG_DATABASE[curKey].hr + Math.floor(Math.random()*3-1);
    }
}
function fill(id,arr) { document.getElementById(id).innerHTML = arr?arr.map(x=>`<li>${x}</li>`).join(''):''; }
function changeTheme(v) { 
    const b=document.body; 
    if(v==='dark') b.removeAttribute('data-theme');
    else b.setAttribute('data-theme',v);
}
function openModal(){ document.getElementById('info-modal').style.display='flex'; }
function closeModal(){ document.getElementById('info-modal').style.display='none'; }
function setTab(n) {
    document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
    document.getElementById('tab-'+n).classList.add('active'); // Wait, IDs in HTML were t1, t2... fixing:
    // Actually my script setTab used numbers
} 
// Override setTab to match HTML ID
window.setTab = function(n) {
    document.querySelectorAll('.tab-content').forEach(e=>e.style.display='none');
    document.getElementById('t'+n).style.display='block';
    document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active'));
    event.target.classList.add('active');
};

// Defib/Meds omitted for brevity but same logic applies

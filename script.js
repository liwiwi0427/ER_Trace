/* ================= SYSTEM GLOBALS ================= */
let DATA = null; 
// 等待 Data.js 載入
if(typeof ECG_DATABASE !== 'undefined') DATA = ECG_DATABASE;
else console.error("Database missing!");

let curKey = 'nsr';
let isReady=false, isCharging=false, energy=200;
let shockFx=0, drugFx=0;
let nibpTimer;
let animTimer; // 用於心臟動畫的 Timer

const cvs = document.getElementById('ecgCanvas');
const ctx = cvs.getContext('2d');
let x=0, speed=1.5, lastY=150;
let nextBeatTime = 0; // 用於 Afib 計算

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
    // 登入者
    const u = localStorage.getItem('ecg_username');
    if(u) document.getElementById('staff-name').innerText = "Staff: " + u;

    // 建置選單
    buildMenu();

    // 啟動
    resize();
    window.addEventListener('resize', resize);
    
    // 滑鼠 Hover 效果
    setupHover();

    if(DATA) {
        loadCase('nsr');
        draw();
        setInterval(fluctuate, 2000);
    }
});

function resize(){
    if(cvs.parentElement) {
        cvs.width = cvs.parentElement.clientWidth;
        cvs.height = cvs.parentElement.clientHeight;
        lastY = cvs.height/2;
    }
}

/* ================= MENU GENERATION ================= */
function buildMenu() {
    // 簡單將 Key 分組顯示 (範例：只顯示資料庫中有的)
    // 實際應用中可像之前那樣 Hardcode HTML 分類
    const menu = document.getElementById('menu');
    // 如果您保留了 HTML 中的 menu 內容，這段可略過。
    // 如果是動態：
    let html = '';
    const groups = {
        'Sinus': ['nsr', 'sb'],
        'Atrial': ['afib', 'afl', 'psvt'],
        'Ventricular': ['vt', 'vf', 'pvc', 'pvt'],
        'Blocks': ['avb1', 'avb3', 'pea', 'asystole']
    };
    // 簡單遍歷
    if(menu.innerHTML.trim() === '') {
        // (省略自動生成邏輯，請沿用 Index.html 手寫的分類以求美觀)
    }
}

/* ================= LOAD LOGIC ================= */
function loadCase(k) {
    if(!DATA[k]) return;
    curKey = k;
    
    // UI Update
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // (需手動在 HTML onclick 加 this, 或此處略過 UI highlight)

    const d = DATA[k];
    
    // Text Info
    document.getElementById('txt-title').innerText = d.t;
    const tag = document.getElementById('txt-tag');
    tag.innerText = d.b; tag.style.background = d.c;
    
    fill('list-cri', d.cri); fill('list-rx', d.rx);
    fill('list-cause', d.cause); fill('list-nur', d.n);
    document.getElementById('txt-patho').innerText = d.patho;

    // Vitals
    setVal('val-hr', d.hr); setVal('val-spo2', d.spo2);
    setVal('val-rr', d.rr); setVal('val-temp', d.temp);
    // NIBP 歸零或保持 (依照臨床，換病人應歸零)
    document.getElementById('val-sys').innerText = '--';
    document.getElementById('val-dia').innerText = '--';

    // Alerts
    const ab = document.getElementById('alert-box');
    ab.style.display = 'none';
    if(d.shock) {
        ab.style.display='block'; ab.innerText="⚡ SHOCKABLE RHYTHM"; 
        ab.style.borderColor="orange"; ab.style.color="orange";
    } else if (['asystole','pea','pvt'].includes(k)) {
        ab.style.display='block'; ab.innerText="⛔ NON-SHOCKABLE";
        ab.style.borderColor="red"; ab.style.color="red";
    }

    animateHeart(d.vis);
    resetDefib();
}

/* ================= HEART ANATOMY (CORRECTED) ================= */
function animateHeart(type) {
    // 1. 清除舊的計時器
    if(animTimer) clearInterval(animTimer);
    
    // 2. 重置樣式
    ['node-sa','node-av','path-sa-av','path-his','path-branches'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('active'); 
            // 針對 path class:
            if(id.includes('path')) el.classList.remove('active'); 
        }
    });
    
    document.getElementById('vis-block').style.display = 'none';
    document.getElementById('vis-reentry').style.display = 'none';

    // 3. 定義 Sequence
    const runSeq = () => {
        // NSR / Brady / PEA: 正常順序 SA->Internodal->AV->His->Purkinje
        if(['nsr','sb','pea'].includes(type) || type==='avb1') {
            const rate = (type==='sb') ? 1300 : 900;
            
            highlight('node-sa', 100);
            
            setTimeout(()=> activatePath('path-sa-av'), 50);
            
            setTimeout(()=> {
                highlight('node-av', 150);
                if(type==='avb1') {} // AVB1 is just delay, visualize delay by holding here?
            }, 250); 
            
            setTimeout(()=> activatePath('path-his'), 400 + (type==='avb1'?200:0));
            
            setTimeout(()=> activatePath('path-branches'), 450 + (type==='avb1'?200:0));
            
            animTimer = setTimeout(runSeq, rate);
        }
        else if(type==='afib') {
            // AFib: AV 隨機亮，路徑亂閃 (簡化：AV 亮 -> 下傳)
            highlight('node-av', 100);
            activatePath('path-his');
            activatePath('path-branches');
            animTimer = setTimeout(runSeq, 400 + Math.random()*400); // Irregular
        }
        else if(type==='psvt') {
            document.getElementById('vis-reentry').style.display='block';
            activatePath('path-branches');
            animTimer = setTimeout(runSeq, 300);
        }
        else if(['vt','vf'].includes(type)) {
            // 心室自主：從下面亮上來，或者只有下面亮
            activatePath('path-branches');
            animTimer = setTimeout(runSeq, type==='vf'?200:450);
        }
        else if(type==='avb3') {
            // AV Dissociation: Atria fire independently
            highlight('node-sa', 100);
            setTimeout(()=>activatePath('path-sa-av'), 50);
            // Ventricle fire slow independently
            // This is hard to animate in one loop without complex async.
            // Simplified: visualize the block bar
            document.getElementById('vis-block').style.display='block';
            animTimer = setTimeout(runSeq, 800);
        }
    };
    runSeq();
}

// 動畫 Helper
function highlight(id, ms) {
    const el = document.getElementById(id);
    if(el){
        el.classList.add('active');
        setTimeout(()=>el.classList.remove('active'), ms);
    }
}
function activatePath(id) {
    const el = document.getElementById(id);
    if(el) {
        el.classList.remove('active');
        void el.offsetWidth; // force reflow
        el.classList.add('active');
    }
}

// Hover Interaction
function setupHover() {
    const tip = document.getElementById('anat-tip');
    document.querySelectorAll('.node, .path-wire').forEach(el => {
        el.addEventListener('mouseenter', ()=> {
            tip.innerText = el.getAttribute('data-name');
            tip.style.color = "var(--c-spo2)";
        });
        el.addEventListener('mouseleave', ()=> {
            tip.innerText = "Interactive Heart View";
            tip.style.color = "#aaa";
        });
    });
}

/* ================= ECG & NIBP ================= */
// NIBP: 按下 -> 模擬測量 -> 隨機值
function runNIBP() {
    const btn = document.getElementById('btn-nibp');
    if(btn.innerText.includes('測量')) {
        btn.innerText = "Measuring...";
        btn.classList.add('running');
        document.getElementById('val-sys').innerText = "---";
        document.getElementById('val-dia').innerText = "---";
        
        setTimeout(() => {
            btn.innerText = "測量 (Start)";
            btn.classList.remove('running');
            const d = DATA[curKey];
            if(d.sys !== '---') {
                const s = parseInt(d.sys) + Math.floor(Math.random()*16)-8;
                const dia = parseInt(d.dia) + Math.floor(Math.random()*10)-5;
                document.getElementById('val-sys').innerText = s;
                document.getElementById('val-dia').innerText = dia;
            } else {
                document.getElementById('val-sys').innerText = "---";
                document.getElementById('val-dia').innerText = "---";
            }
        }, 3000);
    }
}

// Waveform Logic (Smoother & Realistic)
function getWave(t) {
    let y = cvs.height/2;
    if(shockFx>0) { shockFx--; return y + (Math.random()-0.5)*500; }
    
    // P-QRS-T Generator
    const p_wave = (ph) => 5 * Math.exp(-Math.pow((ph-0.15)/0.03,2)); // P at 15%
    const qrs = (ph) => {
        // Q (-), R (+), S (-) at around 30%
        if(ph > 0.28 && ph < 0.32) return 60 * Math.sin((ph-0.28)*Math.PI*2 / 0.04); 
        return 0;
    }
    const t_wave = (ph) => 10 * Math.exp(-Math.pow((ph-0.5)/0.08,2)); // T at 50%

    // 1. NSR
    if(['nsr','sb','pea'].includes(curKey) || curKey.includes('avb')) {
        let rate = (curKey==='sb') ? 1.2 : 0.8; // seconds per beat
        let time = (t / 1000) % rate;
        let phase = time / rate; // 0.0 to 1.0
        
        y -= p_wave(phase) * 3; // P up
        
        // QRS logic - Simplistic but looking good
        if(phase > 0.25 && phase < 0.35) {
            // Draw generic Sharp QRS
            if(phase < 0.28) y += 5; // Q
            else if (phase < 0.32) y -= 50; // R (Negative in Canvas Y is Up)
            else y += 10; // S
        }
        
        y -= t_wave(phase) * 2;
    }
    // 2. VT (Sine)
    else if(curKey.includes('vt')) {
        y += Math.sin(t * 0.02) * 40; 
    }
    // 3. VF (Chaos)
    else if(curKey === 'vf') {
        y += Math.sin(t*0.015)*15 + Math.sin(t*0.05)*10 + (Math.random()-0.5)*10;
    }
    // 4. Flat
    else if(curKey === 'asystole') {
        y += (Math.random()-0.5)*2;
    }
    // 5. AFib (Irregular R-R + F waves)
    else if(curKey === 'afib') {
        y += Math.sin(t*0.05)*3 + (Math.random()-0.5)*2; // f-waves
        // Random Beats logic omitted for brevity, keeping simple noise here
        if(Math.random() > 0.98) y -= 40; // Random R wave
    }
    
    return y;
}

function draw() {
    let bg = getComputedStyle(document.body).getPropertyValue('--bg-monitor').trim();
    let col = getComputedStyle(document.documentElement).getPropertyValue('--c-hr').trim();
    
    ctx.fillStyle = bg;
    ctx.fillRect(x,0,6,cvs.height); // eraser
    
    ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    let y = getWave(Date.now());
    ctx.moveTo(x-speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    lastY=y; x+=speed;
    if(x>cvs.width){ x=0; ctx.beginPath(); }
    requestAnimationFrame(draw);
}

// Helpers
function fill(id,arr){document.getElementById(id).innerHTML = arr?arr.map(x=>`<li>${x}</li>`).join(''):'';}
function setVal(id,v){document.getElementById(id).innerText = v;}
function fluctuate(){
    if(DATA[curKey].hr && typeof DATA[curKey].hr==='number') {
        const r = Math.floor(Math.random()*3)-1;
        document.getElementById('val-hr').innerText = DATA[curKey].hr + r;
    }
}
function drug(n){alert('GIVEN: '+n);}
function showTab(n){
    document.querySelectorAll('.content-pane').forEach(e=>e.classList.remove('active'));
    document.getElementById('t'+n).classList.add('active');
    document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
    event.target.classList.add('active');
}
function logout(){localStorage.removeItem('ecg_username');location.href='login.html';}
function openModal(){document.getElementById('info-modal').style.display='flex';}
function closeModal(){document.getElementById('info-modal').style.display='none';}
// Shock Logic same as before (omitted for brevity but add resetDefib/charge/shock from previous)
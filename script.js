// =================================================
// 1. GLOBAL & DATABASE CHECK
// =================================================
let DATA = null;
if (typeof ECG_DATABASE !== 'undefined') {
    DATA = ECG_DATABASE;
} else if (typeof DB !== 'undefined') {
    DATA = DB;
} else {
    alert("嚴重錯誤：找不到資料庫 (data.js)。請確認該檔案存在。");
}

let curKey = 'nsr';
let joules = 200, isCharging = false, isReady = false;
let shockFx = 0, adenosineFx = 0;
let animTimers = []; 

const canvas = document.getElementById('ecgCanvas');
const ctx = canvas.getContext('2d');
let x = 0, speed = 1.5, lastY = 150;

// =================================================
// 2. INITIALIZATION
// =================================================
window.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('ecg_username');
    if (user) {
        const badge = document.getElementById('user-staff-badge');
        const modalName = document.getElementById('modal-user-name');
        if(badge) badge.innerHTML = `Staff: <strong>${user}</strong>`;
        if(modalName) modalName.innerText = user;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    if (DATA) {
        loadCase('nsr');
        draw();
        setInterval(fluctuateVitals, 2000);
    }
});

function resizeCanvas() {
    if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        lastY = canvas.height / 2;
    }
}

// =================================================
// 3. CORE LOGIC: LOAD CASE
// =================================================
function loadCase(k) {
    if (!DATA || !DATA[k]) return;

    curKey = k;
    resetDefib();
    
    animTimers.forEach(id => clearTimeout(id));
    animTimers = [];

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if (btn) btn.classList.add('active');

    const d = DATA[k];
    updateVitalsUI(d);
    
    if(document.getElementById('txt-title')) document.getElementById('txt-title').innerText = d.t;
    if(document.getElementById('txt-tag')) {
        document.getElementById('txt-tag').innerText = d.b;
        document.getElementById('txt-tag').style.background = d.c;
    }

    fill('list-criteria', d.cri);
    fill('list-rx', d.rx);
    fill('list-nurse', d.n);
    fill('list-causes', d.cause);
    if(document.getElementById('txt-patho')) document.getElementById('txt-patho').innerText = d.patho;

    const alertBox = document.getElementById('alert-box');
    if (alertBox) {
        if (d.shock) {
            alertBox.style.display = 'block';
            alertBox.style.backgroundColor = 'rgba(255, 152, 0, 0.15)';
            alertBox.style.border = '2px solid #ff9800';
            alertBox.style.color = '#ff9800';
            alertBox.innerHTML = "⚡ SHOCKABLE RHYTHM (建議電擊)";
        } else if (k === 'pea' || k === 'asystole') {
            alertBox.style.display = 'block';
            alertBox.style.backgroundColor = 'rgba(244, 67, 54, 0.15)';
            alertBox.style.border = '2px solid #f44336';
            alertBox.style.color = '#f44336';
            alertBox.innerHTML = "⛔ NON-SHOCKABLE (僅 CPR/給藥)";
        } else {
            alertBox.style.display = 'none';
        }
    }

    runAnatomyLoop(d.vis);
}

// =================================================
// 4. HEART ANIMATION LOGIC (全新修正)
// =================================================
function runAnatomyLoop(type) {
    // Reset All
    const elements = ['node-sa', 'node-av', 'path-atria', 'path-vent', 'heart-muscle'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active-node', 'flowing', 'mech-fail');
            el.style.animation = 'none';
        }
    });
    ['vis-block', 'vis-psvt', 'vis-tdp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if(document.getElementById('anatomy-text')) document.getElementById('anatomy-text').innerText = "";

    // Animation Sequence
    const sequence = () => {
        // 1. 正常傳導 / 緩脈 / PEA
        if (type === 'nsr' || type === 'sb' || type === 'pea') {
            const rate = (type === 'sb') ? 1300 : 900;
            
            // Step 1: SA Node Firing (0ms)
            activateNode('node-sa', 100);
            
            // Step 2: Atrial Path Flow (50ms)
            schedule(() => activatePath('path-atria'), 50);
            
            // Step 3: AV Node Firing (250ms - slight delay)
            schedule(() => activateNode('node-av', 150), 250);
            
            // Step 4: Ventricular Path Flow (300ms)
            schedule(() => {
                activatePath('path-vent');
                if (type !== 'pea') pulseMuscle();
            }, 350);

            if (type === 'pea') document.getElementById('heart-muscle').classList.add('mech-fail');
            schedule(sequence, rate);
        }
        // 2. 傳導阻滯 (Blocks)
        else if (type && type.includes('block')) {
            const blockEl = document.getElementById('vis-block');
            if(blockEl) blockEl.style.display = 'block';
            
            activateNode('node-sa', 100);
            schedule(() => activatePath('path-atria'), 50);
            
            if (type === 'avb1') {
                // 延長 PR: AV 較晚亮
                schedule(() => activateNode('node-av', 150), 500);
                schedule(() => { activatePath('path-vent'); pulseMuscle(); }, 650);
            } else if (type === 'avb3') {
                // 房室分離: AV node 獨立跳動
                schedule(() => activateNode('node-av', 150), 600); 
                schedule(() => { activatePath('path-vent'); pulseMuscle(); }, 750);
            }
            schedule(sequence, 1100);
        }
        // 3. 快速心律 (PSVT / Flutter)
        else if (type === 'psvt' || type === 'afl') {
            document.getElementById('vis-psvt').style.display = 'block';
            pulseMuscle(300); // 快縮
            schedule(sequence, 350);
        }
        // 4. 室性心律 (VT / VF)
        else if (type && (type.includes('vt') || type === 'vf' || type === 'tdp')) {
            if (type === 'tdp') document.getElementById('vis-tdp').style.display = 'block';
            
            // 逆向或亂流：直接亮心室路徑
            activatePath('path-vent'); 
            if (type.includes('vt')) pulseMuscle(300);
            schedule(sequence, (type === 'vf') ? 200 : 450);
        }
    };

    sequence();
}

function activateNode(id, duration) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active-node');
        setTimeout(() => el.classList.remove('active-node'), duration);
    }
}

function activatePath(id) {
    const el = document.getElementById(id);
    if (el) {
        // 移除並重新加入 class 以重啟 CSS 動畫
        el.classList.remove('flowing');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('flowing');
    }
}

function pulseMuscle(dur = 200) {
    const m = document.getElementById('heart-muscle');
    if (m) {
        m.style.transition = `transform ${dur / 2}ms`;
        m.style.transform = 'scale(0.96)';
        setTimeout(() => m.style.transform = 'scale(1)', dur / 2);
    }
}

function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    animTimers.push(id);
}

// =================================================
// 5. ECG WAVEFORM
// =================================================
function getWaveY(time) {
    const centerY = canvas.height / 2;
    if (shockFx > 0) { shockFx--; return centerY + (Math.random() - 0.5) * 500; }
    if (adenosineFx > 0) { adenosineFx--; return centerY + (Math.random() - 0.5) * 5; }

    const t = time;
    let y = 0;

    if (['nsr', 'sb', 'pea', 'avb1'].includes(curKey)) {
        const rate = (curKey === 'sb') ? 1300 : 850;
        const phase = t % rate;
        // P
        y += gaussian(phase, 100, 30, -8);
        // QRS
        if (phase > 230 && phase < 270) {
            y += (phase > 248 && phase < 252) ? 50 : -15;
            if (phase > 240 && phase < 260) y += (phase % 2 === 0) ? -40 : 40;
        }
        // T
        y += gaussian(phase, 450, 60, -12);
    } 
    else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.03) * 15 + (Math.random()-0.5)*10;
    } 
    else if (curKey.includes('vt')) {
        y += Math.sin((t % 350) / 350 * Math.PI * 2) * 60;
    } 
    else if (curKey === 'asystole') {
        y += (Math.random() - 0.5) * 2;
    } 
    else {
        y += (Math.random() - 0.5) * 5;
    }
    return centerY + y;
}

function gaussian(x, c, w, h) { return h * Math.exp(-Math.pow(x - c, 2) / (2 * w * w)); }

function draw() {
    // 配合主題顏色
    let style = getComputedStyle(document.body);
    let bg = style.getPropertyValue('--bg-monitor').trim();
    let waveColor = getComputedStyle(document.documentElement).getPropertyValue('--c-hr').trim();

    ctx.fillStyle = bg;
    ctx.fillRect(x, 0, 8, canvas.height); 

    ctx.beginPath();
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    let y = getWaveY(Date.now());
    ctx.moveTo(x - speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastY = y;
    x += speed;
    if (x >= canvas.width) { x = 0; ctx.beginPath(); }
    requestAnimationFrame(draw);
}

// =================================================
// 6. UTILS & INTERACTION
// =================================================
function updateVitalsUI(d) {
    if(document.getElementById('val-sys')) document.getElementById('val-sys').innerText = d.sys;
    if(document.getElementById('val-dia')) document.getElementById('val-dia').innerText = d.dia;
    if(document.getElementById('val-spo2')) document.getElementById('val-spo2').innerText = d.spo2;
    if(document.getElementById('val-rr')) document.getElementById('val-rr').innerText = d.rr;
    if(document.getElementById('val-temp')) document.getElementById('val-temp').innerText = d.temp;
}

function fluctuateVitals() {
    if (DATA && DATA[curKey] && typeof DATA[curKey].hr === 'number') {
        const v = Math.floor(Math.random() * 3) - 1;
        const el = document.getElementById('val-hr');
        if(el) el.innerText = DATA[curKey].hr + v;
    }
}

function fill(id, arr) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = arr ? arr.map(i => `<li>${i}</li>`).join('') : '';
}

function changeTheme(theme) {
    if (theme === 'dark') document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', theme);
}

function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    if (btn.innerText.includes("測量")) {
        btn.innerText = "測量中...";
        btn.classList.add('active');
        document.getElementById('val-sys').innerText = "--";
        setTimeout(() => {
            btn.innerText = "測量";
            btn.classList.remove('active');
            if(DATA) updateVitalsUI(DATA[curKey]);
        }, 3000);
    }
}

function giveDrug(d) {
    const log = document.getElementById('med-log');
    const div = document.createElement('div');
    div.className = 'log-item'; div.innerText = `💉 Give ${d.toUpperCase()}`;
    log.appendChild(div); setTimeout(()=>div.remove(), 4000);
    if (d === 'adenosine' && curKey === 'psvt') setTimeout(() => loadCase('nsr'), 2000);
}

function charge() {
    if (!isCharging) {
        isCharging = true;
        document.getElementById('btn-charge').innerText = "CHARGING";
        setTimeout(() => {
            isCharging = false;
            isReady = true;
            document.getElementById('btn-charge').innerText = "READY";
            const shockBtn = document.getElementById('btn-shock');
            shockBtn.disabled = false;
            shockBtn.classList.add('ready');
        }, 2000);
    }
}

function shock() {
    if (isReady) {
        shockFx = 30;
        const flash = document.getElementById('screen-flash');
        if(flash) {
            flash.classList.add('flash-anim');
            setTimeout(() => flash.classList.remove('flash-anim'), 200);
        }
        
        if (DATA && DATA[curKey].shock) setTimeout(() => loadCase('nsr'), 1000);
        else if (curKey !== 'asystole') setTimeout(() => loadCase('vf'), 1000);
        
        resetDefib();
    }
}

function resetDefib() {
    isReady = false;
    document.getElementById('btn-charge').innerText = "CHARGE";
    const shockBtn = document.getElementById('btn-shock');
    shockBtn.disabled = true;
    shockBtn.classList.remove('ready');
}

function setTab(id) {
    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
    const targetContent = document.getElementById(`tab-${id}`);
    if(targetContent) targetContent.classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
    if (event) event.target.classList.add('active');
}

function openModal() { document.getElementById('info-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('info-modal').style.display = 'none'; }
function logout() {
    if (confirm('確定要登出嗎？')) {
        localStorage.removeItem('ecg_username');
        window.location.replace('login.html');
    }
}

// ================= GLOBAL VARIABLES =================
// 確保資料庫已載入，如果 data.js 沒改名，這裡做個相容性檢查
if (typeof ECG_DATABASE === 'undefined' && typeof DB !== 'undefined') {
    var ECG_DATABASE = DB;
}

let curKey = 'nsr';
let joules = 200, isCharging = false, isReady = false;
let shockFx = 0, adenosineFx = 0;
let nibpTimer;
const canvas = document.getElementById('ecgCanvas');
const ctx = canvas.getContext('2d');
let x = 0;
let speed = 1.5; 
let lastY = 150;
let animTimers = []; // 管理動畫計時器

// ================= INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
    // 1. 登入顯示
    const user = localStorage.getItem('ecg_username');
    if(user) {
        const badge = document.getElementById('user-staff-badge');
        const modalName = document.getElementById('modal-user-name');
        if(badge) badge.innerHTML = `Staff: <strong>${user}</strong>`;
        if(modalName) modalName.innerText = user;
    }

    // 2. 初始化 Canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 3. 確保資料庫載入後啟動
    if (typeof ECG_DATABASE !== 'undefined') {
        loadCase('nsr');
        draw(); 
        setInterval(fluctuateVitals, 2000);
    } else {
        alert("錯誤：無法讀取資料庫 (data.js)。請確認 data.js 中的變數名稱為 'ECG_DATABASE'。");
    }
});

function resizeCanvas() {
    if(canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        lastY = canvas.height / 2;
    }
}

// ================= CORE: LOAD CASE =================
function loadCase(k) {
    if (!ECG_DATABASE[k]) return; // 防呆

    curKey = k;
    resetDefib();
    
    // 清除舊動畫
    animTimers.forEach(t => clearTimeout(t));
    animTimers = [];

    // UI 更新
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if(btn) btn.classList.add('active');

    const d = ECG_DATABASE[k];
    
    // 填入文字
    updateVitalsUI(d);
    document.getElementById('txt-title').innerText = d.t;
    document.getElementById('txt-tag').innerText = d.b;
    document.getElementById('txt-tag').style.background = d.c;

    fill('list-criteria', d.cri);
    fill('list-rx', d.rx);
    fill('list-nurse', d.n);
    fill('list-causes', d.cause);
    document.getElementById('txt-patho').innerText = d.patho;

    // 警示框
    const alertBox = document.getElementById('alert-box');
    if(alertBox) {
        if (d.shock) {
            alertBox.style.display = 'block';
            alertBox.style.backgroundColor = 'rgba(255, 152, 0, 0.2)';
            alertBox.style.border = '2px solid #ff9800';
            alertBox.style.color = '#ff9800';
            alertBox.innerHTML = "⚡ SHOCKABLE (可電擊)";
        } else if (k === 'pea' || k === 'asystole') {
            alertBox.style.display = 'block';
            alertBox.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
            alertBox.style.border = '2px solid #f44336';
            alertBox.style.color = '#f44336';
            alertBox.innerHTML = "⛔ NON-SHOCKABLE (CPR Only)";
        } else {
            alertBox.style.display = 'none';
        }
    }

    runAnatomyLoop(d.vis);
}

// ================= HEART ANIMATION =================
function runAnatomyLoop(type) {
    // 重置
    ['node-sa', 'node-av', 'path-atria', 'path-vent', 'heart-muscle'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('active-node', 'active-path', 'mech-fail');
            el.style.animation = 'none';
        }
    });
    ['vis-block','vis-psvt','vis-tdp'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display='none';
    });
    document.getElementById('anatomy-text').innerText = "";

    // 動畫序列
    const flashSequence = () => {
        if(type === 'nsr' || type === 'sb' || type === 'pea') {
            const rate = (type === 'sb') ? 1300 : 800;
            activate('node-sa', 100);
            schedule(() => activate('path-atria', 150), 50);
            schedule(() => activate('node-av', 150), 200);
            schedule(() => {
                activate('path-vent', 200);
                if(type !== 'pea') pulseMuscle();
            }, 350);
            if(type === 'pea') document.getElementById('heart-muscle').classList.add('mech-fail');
            schedule(flashSequence, rate);
        }
        else if (type && type.includes('block')) {
            document.getElementById('vis-block').style.display = 'block';
            activate('node-sa', 100);
            schedule(() => activate('path-atria', 150), 50);
            if(type === 'avb1') {
                schedule(() => activate('node-av', 150), 400);
                schedule(() => { activate('path-vent', 200); pulseMuscle(); }, 550);
            } else if(type === 'avb3') {
                activate('node-av', 100); 
            }
            schedule(flashSequence, 1000);
        }
        else if (type === 'psvt' || type === 'afl') {
            document.getElementById('vis-psvt').style.display = 'block';
            pulseMuscle(300);
            schedule(flashSequence, 350);
        }
        else if (type && type.includes('vt') || type === 'vf' || type === 'tdp') {
            if(type === 'tdp') document.getElementById('vis-tdp').style.display = 'block';
            activate('path-vent', 100);
            if(type === 'vt_pulse') pulseMuscle(300);
            schedule(flashSequence, (type === 'vf') ? 200 : 400);
        }
    };
    flashSequence();
}

function activate(id, duration) {
    const el = document.getElementById(id);
    if(el) {
        const cls = id.includes('path') ? 'active-path' : 'active-node';
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), duration);
    }
}

function pulseMuscle(dur = 200) {
    const m = document.getElementById('heart-muscle');
    if(m) {
        m.style.transition = `transform ${dur/2}ms`;
        m.style.transform = 'scale(0.95)';
        setTimeout(() => m.style.transform = 'scale(1)', dur/2);
    }
}

function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    animTimers.push(id);
}

// ================= ECG DRAWING =================
function getWaveY(time) {
    const centerY = canvas.height / 2;
    if (shockFx > 0) { shockFx--; return centerY + (Math.random() - 0.5) * 500; }
    if (adenosineFx > 0) { adenosineFx--; return centerY + (Math.random() - 0.5) * 5; }

    const t = time;
    let y = 0;

    if (['nsr', 'sb', 'pea', 'avb1'].includes(curKey)) {
        const rate = (curKey === 'sb') ? 1300 : 850;
        const phase = t % rate;
        y += gaussian(phase, 100, 30, -8); // P
        if(phase > 230 && phase < 270) { // QRS
            y += (phase > 248 && phase < 252) ? 50 : -15;
            if(phase > 240 && phase < 260) y += (phase % 2 === 0) ? -40 : 40;
        }
        y += gaussian(phase, 450, 60, -12); // T
    } else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.03) * 15;
    } else if (curKey === 'asystole') {
        y += (Math.random() - 0.5) * 2;
    } else {
        y += (Math.random()-0.5) * 5; // Noise fallback
    }
    return centerY + y;
}

function gaussian(x, c, w, h) { return h * Math.exp(-Math.pow(x - c, 2) / (2 * w * w)); }

function draw() {
    // 修正：確保能抓到正確顏色
    let gridColor = getComputedStyle(document.body).getPropertyValue('--bg-monitor').trim() || '#000000';
    let waveColor = getComputedStyle(document.documentElement).getPropertyValue('--c-hr').trim() || '#00ff00';

    ctx.fillStyle = gridColor;
    ctx.fillRect(x, 0, 8, canvas.height); // 擦除條

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

// ================= UTILS =================
function updateVitalsUI(d) {
    document.getElementById('val-sys').innerText = d.sys;
    document.getElementById('val-dia').innerText = d.dia;
    document.getElementById('val-spo2').innerText = d.spo2;
    document.getElementById('val-rr').innerText = d.rr;
    document.getElementById('val-temp').innerText = d.temp;
}

function fluctuateVitals() {
    if(ECG_DATABASE[curKey] && typeof ECG_DATABASE[curKey].hr === 'number') {
        document.getElementById('val-hr').innerText = ECG_DATABASE[curKey].hr + Math.floor(Math.random()*3)-1;
    } else {
        document.getElementById('val-hr').innerText = "--";
    }
}

function fill(id, arr) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = arr ? arr.map(i => `<li>${i}</li>`).join('') : '';
}

function changeTheme(theme) {
    theme === 'dark' ? document.body.removeAttribute('data-theme') : document.body.setAttribute('data-theme', theme);
}

function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    if(btn.innerText.includes("測量")) {
        btn.innerText = "Running..."; btn.classList.add('active');
        document.getElementById('val-sys').innerText = "--";
        setTimeout(() => {
            btn.innerText = "測量"; btn.classList.remove('active');
            updateVitalsUI(ECG_DATABASE[curKey]);
        }, 3000);
    }
}

// Meds & Shock
function giveDrug(d) {
    const log = document.getElementById('med-log');
    const div = document.createElement('div');
    div.className = 'log-item'; div.innerText = `💉 ${d.toUpperCase()}`;
    log.appendChild(div); setTimeout(()=>div.remove(), 4000);
    if(d==='adenosine' && curKey==='psvt') setTimeout(()=>loadCase('nsr'), 2000);
}
function charge(){ if(!isCharging){ isCharging=true; document.getElementById('btn-charge').innerText="CHARGING"; setTimeout(()=>{isCharging=false;isReady=true;document.getElementById('btn-charge').innerText="READY";document.getElementById('btn-shock').disabled=false;document.getElementById('btn-shock').classList.add('ready');},2000);}}
function shock(){ if(isReady){ shockFx=30; document.getElementById('screen-flash').classList.add('flash-anim'); setTimeout(()=>document.getElementById('screen-flash').classList.remove('flash-anim'),200); if(ECG_DATABASE[curKey].shock) setTimeout(()=>loadCase('nsr'),1000); else if(curKey!=='asystole') setTimeout(()=>loadCase('vf'),1000); resetDefib();}}
function resetDefib(){ isReady=false; document.getElementById('btn-charge').innerText="CHARGE"; const btn=document.getElementById('btn-shock'); btn.disabled=true; btn.classList.remove('ready');}

function setTab(id) {
    document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active'));
    event.target.classList.add('active');
}

function openModal(){document.getElementById('info-modal').style.display='flex';}
function closeModal(){document.getElementById('info-modal').style.display='none';}
function logout(){if(confirm('Logout?')){localStorage.removeItem('ecg_username');window.location.replace('login.html');}}

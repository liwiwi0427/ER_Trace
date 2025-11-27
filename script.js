// ================= GLOBAL VARIABLES =================
let curKey = 'nsr';
let joules = 200, isCharging = false, isReady = false;
let shockFx = 0, adenosineFx = 0;
let nibpTimer;
const canvas = document.getElementById('ecgCanvas');
const ctx = canvas.getContext('2d');
let x = 0;
let speed = 1.5; // 掃描速度
let lastY = 150;

// 存放動畫 Timer，切換心律時要清除
let animTimers = [];

// ================= INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
    // 1. 登入檢查與顯示
    const user = localStorage.getItem('ecg_username');
    if(user) {
        document.getElementById('user-staff-badge').innerHTML = `Staff: <strong>${user}</strong>`;
        document.getElementById('modal-user-name').innerText = user;
    }

    // 2. 初始化 Canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 3. 啟動
    loadCase('nsr');
    draw(); // 開始繪圖迴圈
    
    // 4. 生命徵象浮動模擬
    setInterval(fluctuateVitals, 2000);
});

function resizeCanvas() {
    if(canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        lastY = canvas.height / 2; // 重置 Y
    }
}

// ================= CORE: LOAD CASE =================
function loadCase(k) {
    curKey = k;
    resetDefib();
    
    // 清除舊的動畫排程
    animTimers.forEach(t => clearTimeout(t));
    animTimers = [];

    // 更新 UI 狀態
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if(btn) btn.classList.add('active');

    // 讀取資料庫
    const d = ECG_DATABASE[k];
    if(!d) return;

    // 更新文字與數值
    updateVitalsUI(d);
    document.getElementById('txt-title').innerText = d.t;
    document.getElementById('txt-tag').innerText = d.b;
    document.getElementById('txt-tag').style.background = d.c;

    // 填入內容
    fill('list-criteria', d.cri);
    fill('list-rx', d.rx);
    fill('list-nurse', d.n);
    fill('list-causes', d.cause);
    document.getElementById('txt-patho').innerText = d.patho;

    // 警示框
    const alertBox = document.getElementById('alert-box');
    if (d.shock) {
        alertBox.style.display = 'block';
        alertBox.style.backgroundColor = 'rgba(255, 152, 0, 0.2)';
        alertBox.style.border = '2px solid #ff9800';
        alertBox.style.color = '#ff9800';
        alertBox.innerHTML = "⚡ SHOCKABLE RHYTHM (可電擊)";
    } else if (k === 'pea' || k === 'asystole') {
        alertBox.style.display = 'block';
        alertBox.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
        alertBox.style.border = '2px solid #f44336';
        alertBox.style.color = '#f44336';
        alertBox.innerHTML = "⛔ NON-SHOCKABLE (不可電擊) - CPR Only";
    } else {
        alertBox.style.display = 'none';
    }

    runAnatomyLoop(d.vis);
}

// ================= HEART ANATOMY ANIMATION =================
function runAnatomyLoop(type) {
    const els = ['node-sa', 'node-av', 'path-atria', 'path-vent', 'heart-muscle'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('active-node', 'active-path', 'mech-fail');
            el.style.animation = 'none';
        }
    });
    
    document.getElementById('vis-psvt').style.display = 'none';
    document.getElementById('vis-tdp').style.display = 'none';
    document.getElementById('vis-block').style.display = 'none';
    document.getElementById('anatomy-text').innerText = "";

    const flashSequence = () => {
        if(type === 'nsr' || type === 'sb' || type === 'pea') {
            // 正常傳導：SA(0ms) -> AtriaPath(50ms) -> AV(150ms) -> VentPath(200ms) -> Muscle(250ms)
            const rate = (type === 'sb') ? 1300 : 800;
            
            activate('node-sa', 100);
            schedule(() => activate('path-atria', 150), 50);
            schedule(() => activate('node-av', 150), 200);
            schedule(() => {
                activate('path-vent', 200);
                // 只有 PEA 不縮，其他正常縮
                if(type !== 'pea') pulseMuscle(); 
            }, 350);
            
            if(type === 'pea') document.getElementById('heart-muscle').classList.add('mech-fail');

            schedule(flashSequence, rate); // Loop
        }
        else if (type.includes('block')) {
            // 傳導阻滯
            document.getElementById('vis-block').style.display = 'block';
            activate('node-sa', 100);
            schedule(() => activate('path-atria', 150), 50);
            
            if(type === 'avb1') {
                // 延遲傳導
                schedule(() => activate('node-av', 150), 400); // 延遲久一點
                schedule(() => { activate('path-vent', 200); pulseMuscle(); }, 550);
            } else if(type === 'avb3') {
                // 完全阻滯：心房心室各自跳
                // 這裡簡化處理：SA 規律閃，心室偶爾閃
                activate('node-av', 100); // AV 偶爾自己跳
            }
            
            schedule(flashSequence, 1000);
        }
        else if (type === 'psvt' || type === 'afl') {
            document.getElementById('vis-psvt').style.display = 'block';
            pulseMuscle(300);
            schedule(flashSequence, 350);
        }
        else if (type === 'vt_pulse' || type === 'vt_pulseless' || type === 'vf' || type === 'tdp') {
            if(type === 'tdp') document.getElementById('vis-tdp').style.display = 'block';
            // 心室亂跳
            activate('path-vent', 100);
            if(type === 'vt_pulse') pulseMuscle(300);
            schedule(flashSequence, (type === 'vf') ? 200 : 400);
        }
        else {
            // Asystole: 什麼都不做
        }
    };

    flashSequence(); // Start loop
}

// Helper: 加入 class 讓它發光，時間到移除
function activate(id, duration) {
    const el = document.getElementById(id);
    if(!el) return;
    const cls = id.includes('path') ? 'active-path' : 'active-node';
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), duration);
}

function pulseMuscle(dur = 200) {
    const m = document.getElementById('heart-muscle');
    m.style.transition = `transform ${dur/2}ms`;
    m.style.transform = 'scale(0.95)';
    setTimeout(() => m.style.transform = 'scale(1)', dur/2);
}

function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    animTimers.push(id);
}

// ================= ECG WAVEFORM GENERATOR =================
// 改良版波形算法：使用數學函數合成 P-QRS-T
function getWaveY(time) {
    const centerY = canvas.height / 2;
    
    // 特效：電擊或藥物
    if (shockFx > 0) { shockFx--; return centerY + (Math.random() - 0.5) * 500; }
    if (adenosineFx > 0) { adenosineFx--; return centerY + (Math.random() - 0.5) * 5; }

    const t = time;
    let y = 0;

    // 1. 正常竇性 / 緩脈 / AVB1 / PEA
    if (['nsr', 'sb', 'pea', 'avb1'].includes(curKey)) {
        const rate = (curKey === 'sb') ? 1300 : 850; // 週期 ms
        const phase = t % rate;
        
        // P wave (at 100ms)
        y += gaussian(phase, 100, 30, -8);
        // QRS (at 250ms)
        if(phase > 230 && phase < 270) {
            y += (phase === 250) ? 50 : -15; // 簡化 QRS 尖峰
            if(phase > 240 && phase < 260) y += (phase % 2 === 0) ? -60 : 60; // Sharp logic
        }
        // T wave (at 450ms)
        y += gaussian(phase, 450, 60, -12);
        
        // AVB1: PR 延長 -> 將 QRS/T 往後推 (這裡僅示意)
        if(curKey === 'avb1') { /* Logic handled by timing above slightly */ }
    }
    // 2. 心室頻脈 (VT)
    else if (curKey.includes('vt')) {
        const phase = t % 350; // Fast rate
        y += Math.sin(phase / 350 * Math.PI * 2) * 60; // Large Sine wave
    }
    // 3. 心室顫動 (VF)
    else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.03) * 15 + (Math.random() - 0.5) * 10;
    }
    // 4. 心律停止 (Asystole)
    else if (curKey === 'asystole') {
        y += (Math.random() - 0.5) * 2; // Flat line noise
    }
    // 5. PSVT
    else if (curKey === 'psvt') {
        const phase = t % 300; // Very fast
        if(phase > 100 && phase < 140) y += (phase % 2 === 0) ? -50 : 50; // Narrow QRS
    }
    else {
        // Fallback noise
        y += (Math.random()-0.5)*5;
    }

    return centerY + y;
}

function gaussian(x, center, width, height) {
    return height * Math.exp(-Math.pow(x - center, 2) / (2 * width * width));
}

function draw() {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-monitor');
    ctx.fillRect(x, 0, 8, canvas.height); // Eraser bar

    ctx.beginPath();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-hr');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    let y = getWaveY(Date.now());
    ctx.moveTo(x - speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastY = y;
    x += speed;
    if (x >= canvas.width) {
        x = 0;
        ctx.beginPath(); // Reset path to avoid connecting end to start
    }

    requestAnimationFrame(draw);
}

// ================= UTILS & CONTROLS =================
function updateVitalsUI(d) {
    document.getElementById('val-sys').innerText = d.sys;
    document.getElementById('val-dia').innerText = d.dia;
    document.getElementById('val-spo2').innerText = d.spo2;
    document.getElementById('val-rr').innerText = d.rr;
    document.getElementById('val-temp').innerText = d.temp;
}

function fluctuateVitals() {
    // 讓 HR 稍微跳動增加真實感
    const d = ECG_DATABASE[curKey];
    if (d && typeof d.hr === 'number') {
        const variation = Math.floor(Math.random() * 3) - 1;
        document.getElementById('val-hr').innerText = d.hr + variation;
    } else {
        document.getElementById('val-hr').innerText = "--";
    }
}

// 主題切換
function changeTheme(theme) {
    if (theme === 'dark') document.body.removeAttribute('data-theme');
    else document.body.setAttribute('data-theme', theme);
}

function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    if(btn.innerText === "測量") {
        btn.innerText = "測量中...";
        btn.classList.add('active');
        document.getElementById('val-sys').innerText = "---";
        document.getElementById('val-dia').innerText = "---";
        setTimeout(() => {
            const d = ECG_DATABASE[curKey];
            if(d) {
                document.getElementById('val-sys').innerText = d.sys;
                document.getElementById('val-dia').innerText = d.dia;
            }
            btn.innerText = "測量";
            btn.classList.remove('active');
        }, 3000);
    }
}

// 藥物給予
function giveDrug(drug) {
    const log = document.getElementById('med-log');
    const entry = document.createElement('div');
    entry.className = 'log-item';
    entry.innerText = `💉 Give ${drug.toUpperCase()}`;
    log.appendChild(entry);
    setTimeout(() => entry.remove(), 5000);

    if(drug === 'adenosine' && curKey === 'psvt') {
        setTimeout(() => {
            adenosineFx = 120;
            setTimeout(() => loadCase('nsr'), 2000) // 轉回 NSR
        }, 1000);
    }
}

// 電擊邏輯
function charge() {
    if(isCharging || isReady) return;
    isCharging = true;
    const btn = document.getElementById('btn-charge');
    btn.innerText = "CHARGING...";
    setTimeout(() => {
        isCharging = false;
        isReady = true;
        btn.innerText = "CHARGED";
        document.getElementById('btn-shock').disabled = false;
        document.getElementById('btn-shock').classList.add('ready');
    }, 2000);
}

function shock() {
    if(!isReady) return;
    shockFx = 30; 
    const flash = document.getElementById('screen-flash');
    flash.classList.add('flash-anim');
    setTimeout(() => flash.classList.remove('flash-anim'), 200);

    const d = ECG_DATABASE[curKey];
    if(d.shock) {
        setTimeout(() => loadCase('nsr'), 1500);
    } else {
        if(curKey !== 'asystole') setTimeout(() => loadCase('vf'), 1000);
    }
    resetDefib();
}

function resetDefib() {
    isReady = false;
    isCharging = false;
    document.getElementById('btn-charge').innerText = "CHARGE";
    const shockBtn = document.getElementById('btn-shock');
    shockBtn.disabled = true;
    shockBtn.classList.remove('ready');
}

// Tab 系統
function setTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
    
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
}

// 輔助填入列表
function fill(id, arr) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = arr ? arr.map(i => `<li>${i}</li>`).join('') : '';
}

// Modal
function openModal() { document.getElementById('info-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('info-modal').style.display = 'none'; }
function logout() {
    if(confirm("確定要登出嗎？")) {
        localStorage.removeItem('ecg_username');
        window.location.replace('login.html');
    }
}

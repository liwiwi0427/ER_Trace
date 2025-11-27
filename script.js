// =================================================
// 1. GLOBAL & DATABASE CHECK
// =================================================
let DATA = null;
if (typeof ECG_DATABASE !== 'undefined') {
    DATA = ECG_DATABASE;
} else if (typeof DB !== 'undefined') {
    DATA = DB;
} else {
    alert("嚴重錯誤：找不到資料庫 (data.js)。");
}

let curKey = 'nsr';
let joules = 200, isCharging = false, isReady = false;
let shockFx = 0, adenosineFx = 0;
let animTimers = []; 

const canvas = document.getElementById('ecgCanvas');
const ctx = canvas.getContext('2d');
let x = 0, speed = 1.5, lastY = 150;

// 變數用於 AFib/PVC 等不規則心律計算
let nextBeatTime = 0; 

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
    initHoverEffects(); // SVG Hover

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

function initHoverEffects() {
    const textEl = document.getElementById('anatomy-text');
    const elements = document.querySelectorAll('.node, .path-conduction');
    elements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            const name = el.getAttribute('data-name');
            if(name) textEl.innerText = name;
        });
        el.addEventListener('mouseleave', () => {
            textEl.innerText = "Normal Conduction";
        });
    });
}

// =================================================
// 3. CORE LOGIC
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
    updateVitalsUI(d); // 初始載入標準值
    
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
            alertBox.innerHTML = "⚡ SHOCKABLE RHYTHM";
        } else if (k === 'pea' || k === 'asystole') {
            alertBox.style.display = 'block';
            alertBox.style.backgroundColor = 'rgba(244, 67, 54, 0.15)';
            alertBox.style.border = '2px solid #f44336';
            alertBox.style.color = '#f44336';
            alertBox.innerHTML = "⛔ NON-SHOCKABLE";
        } else {
            alertBox.style.display = 'none';
        }
    }

    runAnatomyLoop(d.vis);
}

// =================================================
// 4. HEART ANIMATION
// =================================================
function runAnatomyLoop(type) {
    const ids = ['node-sa', 'node-av', 'path-internodal', 'path-his', 'path-branches', 'heart-muscle'];
    ids.forEach(id => {
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

    const sequence = () => {
        if (type === 'nsr' || type === 'sb' || type === 'pea') {
            const rate = (type === 'sb') ? 1300 : 900;
            activateNode('node-sa', 100);
            schedule(() => activatePath('path-internodal'), 50);
            schedule(() => activateNode('node-av', 150), 200);
            schedule(() => activatePath('path-his'), 350);
            schedule(() => {
                activatePath('path-branches');
                if (type !== 'pea') pulseMuscle();
            }, 400);
            if (type === 'pea') document.getElementById('heart-muscle').classList.add('mech-fail');
            schedule(sequence, rate);
        }
        else if (type && type.includes('block')) {
            document.getElementById('vis-block').style.display = 'block';
            activateNode('node-sa', 100);
            schedule(() => activatePath('path-internodal'), 50);
            if (type === 'avb1') {
                schedule(() => activateNode('node-av', 150), 550);
                schedule(() => activatePath('path-his'), 700);
                schedule(() => { activatePath('path-branches'); pulseMuscle(); }, 750);
            } else if(type === 'avb3') {
                schedule(() => activateNode('node-av', 100), 600); 
            }
            schedule(sequence, 1200);
        }
        else if (type === 'psvt' || type === 'afl') {
            document.getElementById('vis-psvt').style.display = 'block';
            pulseMuscle(300);
            schedule(sequence, 350);
        }
        else if (type && (type.includes('vt') || type === 'vf' || type === 'tdp')) {
            if (type === 'tdp') document.getElementById('vis-tdp').style.display = 'block';
            activatePath('path-branches'); 
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
        el.classList.remove('flowing');
        void el.offsetWidth; 
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
// 5. ECG WAVEFORM GENERATOR (真實化修正)
// =================================================
function getWaveY(time) {
    const centerY = canvas.height / 2;
    if (shockFx > 0) { shockFx--; return centerY + (Math.random() - 0.5) * 500; }
    if (adenosineFx > 0) { adenosineFx--; return centerY + (Math.random() - 0.5) * 5; }

    const t = time;
    let y = 0;

    // --- 1. NSR / SB / PEA / AVB1 (規律 P-QRS-T) ---
    if (['nsr', 'sb', 'pea', 'avb1'].includes(curKey)) {
        const rate = (curKey === 'sb') ? 1300 : 850;
        const phase = t % rate;
        
        // P wave
        y += gaussian(phase, 100, 25, -6); 
        // QRS complex
        if (phase > 230 && phase < 270) {
            y += (phase > 248 && phase < 252) ? 60 : -15; // R wave high
            if (phase > 240 && phase < 260) y += (phase % 2 === 0) ? -45 : 45; // S wave
        }
        // T wave
        y += gaussian(phase, 450, 50, -10);
    } 
    // --- 2. AFib (不規則 + 雜訊) ---
    else if (curKey === 'afib') {
        // 使用隨機數控制下一次心跳的時間，模擬不規則
        if (t > nextBeatTime) {
            nextBeatTime = t + 600 + Math.random() * 400; // 600~1000ms 間隔
        }
        
        // 繪製 QRS (當時間接近 nextBeatTime)
        let beatOffset = nextBeatTime - t;
        if (beatOffset < 50 && beatOffset > 0) {
             y += 60; // R wave
             y -= 20; // S wave
        }
        
        // F waves (細小鋸齒)
        y += Math.sin(t * 0.05) * 3 + (Math.random() - 0.5) * 2;
    }
    // --- 3. A-Flutter (鋸齒波 + 規律 QRS) ---
    else if (curKey === 'afl') {
        // Sawtooth waves
        y += Math.sin(t * 0.02) * 15; 
        
        // Regular QRS (例如 3:1 或 2:1)
        const rate = 700; 
        const phase = t % rate;
        if (phase > 30 && phase < 70) {
            y += 50; // QRS overlay
        }
    }
    // --- 4. VT (寬大單型) ---
    else if (curKey.includes('vt')) {
        const phase = t % 350; // Fast rate
        // Sine wave with slight distortion for VT shape
        y += Math.sin(phase / 350 * Math.PI * 2) * 70;
    }
    // --- 5. VF (混亂) ---
    else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.023) * 15 + Math.sin(t * 0.05) * 5;
    } 
    // --- 6. Asystole (平線) ---
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
// 6. UTILS & NIBP RANDOMIZER
// =================================================
function updateVitalsUI(d) {
    // 這裡只更新除 BP 以外的數值，BP 由 toggleNIBP 控制
    if(document.getElementById('val-spo2')) document.getElementById('val-spo2').innerText = d.spo2;
    if(document.getElementById('val-rr')) document.getElementById('val-rr').innerText = d.rr;
    if(document.getElementById('val-temp')) document.getElementById('val-temp').innerText = d.temp;
    
    // 如果目前沒有在量血壓，且不是初始狀態，可以顯示上次數值或 --
    const sysEl = document.getElementById('val-sys');
    if(sysEl && sysEl.innerText === '--') {
        // Initial load specific logic if needed
    }
}

function fluctuateVitals() {
    if (DATA && DATA[curKey] && typeof DATA[curKey].hr === 'number') {
        const v = Math.floor(Math.random() * 3) - 1;
        document.getElementById('val-hr').innerText = DATA[curKey].hr + v;
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

// 修正：NIBP 隨機生成邏輯
function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    if (b

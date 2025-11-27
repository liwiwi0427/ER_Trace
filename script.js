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
    
    // 初始化 SVG Hover 互動
    initHoverEffects();

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
// 4. NEW ANATOMY LOOP (More Detailed)
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
            
            // 1. SA Node
            activateNode('node-sa', 100);
            
            // 2. Internodal (Atria)
            schedule(() => activatePath('path-internodal'), 50);
            
            // 3. AV Node (Pause)
            schedule(() => activateNode('node-av', 150), 200);
            
            // 4. Bundle of His
            schedule(() => activatePath('path-his'), 350);
            
            // 5. Branches & Muscle
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
                schedule(() => activateNode('node-av', 150), 550); // Long PR
                schedule(() => activatePath('path-his'), 700);
                schedule(() => { activatePath('path-branches'); pulseMuscle(); }, 750);
            } else if(type === 'avb3') {
                schedule(() => activateNode('node-av', 100), 600); // Independent
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
            // Retrograde or chaotic
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
// 5. DRAWING
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
        y += gaussian(phase, 100, 30, -8); // P
        if (phase > 230 && phase < 270) {
            y += (phase > 248 && phase < 252) ? 50 : -15;
            if (phase > 240 && phase < 260) y += (phase % 2 === 0) ? -40 : 40;
        }
        y += gaussian(phase, 450, 60, -12); // T
    } else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.03) * 15 + (Math.random()-0.5)*10;
    } else if (curKey.includes('vt')) {
        y += Math.sin((t % 350) / 350 * Math.PI * 2) * 60;
    } else if (curKey === 'asystole') {
        y += (Math.random() - 0.5) * 2;
    } else {
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
// 6. UTILS
// =================================================
function updateVitalsUI(d) {
    const els = {sys:'val-sys', dia:'val-dia', spo2:'val-spo2', rr:'val-rr', temp:'val-temp'};
    for(let k in els) {
        const el = document.getElementById(els[k]);
        if(el) el.innerText = d[k];
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
    theme === 'dark' ? document.body.removeAttribute('data-theme') : document.body.setAttribute('data-theme', theme);
}

function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    if (btn.innerText.includes("測量")) {
        btn.innerText = "Running...";
        btn.classList.add('active');
        document.getElementById('val-sys').innerText = "--";
        setTimeout(() => {
            btn.innerText = "測量"; btn.classList.remove('active');
            if(DATA) updateVitalsUI(DATA[curKey]);
        }, 3000);
    }
}

function giveDrug(d) {
    const log = document.getElementById('med-log');
    const div = document.createElement('div');
    div.className = 'log-item'; div.innerText = `💉 Give ${d.toUpperCase()}`;
    log.appendChild(div);
    setTimeout(() => div.remove(), 4000);
    if (d === 'adenosine' && curKey === 'psvt') setTimeout(() => loadCase('nsr'), 2000);
}

function charge() {
    if (!isCharging) {
        isCharging = true;
        document.getElementById('btn-charge').innerText = "CHARGING";
        setTimeout(() => {
            isCharging = false; isReady = true;
            document.getElementById('btn-charge').innerText = "READY";
            const b = document.getElementById('btn-shock'); b.disabled = false; b.classList.add('ready');
        }, 2000);
    }
}

function shock() {
    if (isReady) {
        shockFx = 30;
        const f = document.getElementById('screen-flash');
        if(f) { f.classList.add('flash-anim'); setTimeout(()=>f.classList.remove('flash-anim'), 200); }
        if (DATA && DATA[curKey].shock) setTimeout(() => loadCase('nsr'), 1000);
        else if (curKey !== 'asystole') setTimeout(() => loadCase('vf'), 1000);
        resetDefib();
    }
}

function resetDefib() {
    isReady = false; document.getElementById('btn-charge').innerText = "CHARGE";
    const b = document.getElementById('btn-shock'); b.disabled = true; b.classList.remove('ready');
}

function setTab(id) {
    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
    if (event) event.target.classList.add('active');
}

function openModal() { document.getElementById('info-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('info-modal').style.display = 'none'; }
function logout() { if (confirm('Logout?')) { localStorage.removeItem('ecg_username'); window.location.replace('login.html'); } }

// =================================================
// 1. GLOBAL & DATABASE CHECK
// =================================================
// 強制相容檢查：確保能抓到資料庫
let DATA = null;
if (typeof ECG_DATABASE !== 'undefined') {
    DATA = ECG_DATABASE;
} else if (typeof DB !== 'undefined') {
    DATA = DB;
} else {
    alert("嚴重錯誤：找不到資料庫 (data.js)。請確保該檔案存在且變數名稱正確。");
}

// 變數宣告
let curKey = 'nsr';
let joules = 200, isCharging = false, isReady = false;
let shockFx = 0, adenosineFx = 0;
let animTimers = []; // 用來管理所有 setTimeout，切換時清除

// Canvas 設定
const canvas = document.getElementById('ecgCanvas');
const ctx = canvas.getContext('2d');
let x = 0;
let speed = 1.5;
let lastY = 150;

// =================================================
// 2. INITIALIZATION
// =================================================
window.addEventListener('DOMContentLoaded', () => {
    // 顯示登入者
    const user = localStorage.getItem('ecg_username');
    if (user) {
        const badge = document.getElementById('user-staff-badge');
        if (badge) badge.innerHTML = `Staff: <strong>${user}</strong>`;
        const modalName = document.getElementById('modal-user-name');
        if (modalName) modalName.innerText = user;
    }

    // 調整 Canvas 大小
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 啟動程式
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

    // 清除所有舊的動畫計時器
    animTimers.forEach(id => clearTimeout(id));
    animTimers = [];

    // 1. 更新側邊欄按鈕狀態
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if (btn) btn.classList.add('active');

    // 2. 讀取資料
    const d = DATA[k];

    // 3. 更新文字與數值
    updateVitalsUI(d);
    
    const titleEl = document.getElementById('txt-title');
    if(titleEl) titleEl.innerText = d.t;
    
    const tagEl = document.getElementById('txt-tag');
    if(tagEl) {
        tagEl.innerText = d.b;
        tagEl.style.background = d.c;
    }

    fill('list-criteria', d.cri);
    fill('list-rx', d.rx);
    fill('list-nurse', d.n);
    fill('list-causes', d.cause);
    
    const pathoEl = document.getElementById('txt-patho');
    if(pathoEl) pathoEl.innerText = d.patho;

    // 4. 警示框
    const alertBox = document.getElementById('alert-box');
    if (alertBox) {
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
            alertBox.innerHTML = "⛔ NON-SHOCKABLE (不可電擊 - CPR Only)";
        } else {
            alertBox.style.display = 'none';
        }
    }

    // 5. 啟動解剖動畫
    runAnatomyLoop(d.vis);
}

// =================================================
// 4. HEART ANATOMY ANIMATION (FIXED)
// =================================================
function runAnatomyLoop(type) {
    // 重置所有樣式
    const ids = ['node-sa', 'node-av', 'path-atria', 'path-vent', 'heart-muscle'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active-node', 'active-path', 'mech-fail');
            el.style.animation = 'none';
            el.style.opacity = '0.3'; // 恢復暗淡
        }
    });

    ['vis-block', 'vis-psvt', 'vis-tdp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const txt = document.getElementById('anatomy-text');
    if(txt) txt.innerText = "";

    // 定義動畫序列
    const sequence = () => {
        if (type === 'nsr' || type === 'sb' || type === 'pea') {
            const rate = (type === 'sb') ? 1300 : 800;
            
            // SA Node 亮
            activate('node-sa', 100);
            
            // 50ms 後: 心房路徑亮
            schedule(() => activate('path-atria', 150), 50);
            
            // 200ms 後: AV Node 亮
            schedule(() => activate('node-av', 150), 200);
            
            // 350ms 後: 心室路徑亮 + 心肌收縮
            schedule(() => {
                activate('path-vent', 200);
                if (type !== 'pea') pulseMuscle();
            }, 350);

            if (type === 'pea') {
                const m = document.getElementById('heart-muscle');
                if(m) m.classList.add('mech-fail');
            }

            schedule(sequence, rate); // 循環
        }
        else if (type && type.includes('block')) {
            const blockEl = document.getElementById('vis-block');
            if(blockEl) blockEl.style.display = 'block';
            
            activate('node-sa', 100);
            schedule(() => activate('path-atria', 150), 50);
            
            if (type === 'avb1') {
                schedule(() => activate('node-av', 150), 450); // 延遲久一點
                schedule(() => { activate('path-vent', 200); pulseMuscle(); }, 600);
            } else if(type === 'avb3') {
                // AVB3: AV node 偶爾自己跳，不跟上面同步
                schedule(() => activate('node-av', 100), 500); 
            }
            
            schedule(sequence, 1000);
        }
        else if (type === 'psvt' || type === 'afl') {
            const psvtEl = document.getElementById('vis-psvt');
            if(psvtEl) psvtEl.style.display = 'block';
            pulseMuscle(300);
            schedule(sequence, 350);
        }
        else if (type === 'vf' || type === 'vt_pulse' || type === 'vt_pulseless' || type === 'tdp') {
            if (type === 'tdp') {
                const tdpEl = document.getElementById('vis-tdp');
                if(tdpEl) tdpEl.style.display = 'block';
            }
            activate('path-vent', 100);
            if (type === 'vt_pulse') pulseMuscle(300);
            schedule(sequence, (type === 'vf') ? 200 : 400);
        }
    };

    sequence(); // 啟動第一輪
}

// 點亮元件 helper
function activate(id, duration) {
    const el = document.getElementById(id);
    if (el) {
        const cls = id.includes('path') ? 'active-path' : 'active-node';
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), duration);
    }
}

// 心肌收縮 helper
function pulseMuscle(dur = 200) {
    const m = document.getElementById('heart-muscle');
    if (m) {
        m.style.transition = `transform ${dur / 2}ms`;
        m.style.transform = 'scale(0.95)';
        setTimeout(() => m.style.transform = 'scale(1)', dur / 2);
    }
}

// 安全的 setTimeout
function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    animTimers.push(id);
}

// =================================================
// 5. ECG WAVEFORM DRAWING
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
        
        // P Wave
        y += gaussian(phase, 100, 30, -8); 
        
        // QRS Complex
        if (phase > 230 && phase < 270) {
            y += (phase > 248 && phase < 252) ? 50 : -15; 
            if (phase > 240 && phase < 260) y += (phase % 2 === 0) ? -40 : 40;
        }
        
        // T Wave
        y += gaussian(phase, 450, 60, -12);
    } 
    else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.03) * 15 + (Math.random() - 0.5) * 10;
    } 
    else if (curKey.includes('vt')) {
        const phase = t % 350;
        y += Math.sin(phase / 350 * Math.PI * 2) * 60;
    } 
    else if (curKey === 'asystole') {
        y += (Math.random() - 0.5) * 2;
    } 
    else {
        // Default Noise
        y += (Math.random() - 0.5) * 5;
    }

    return centerY + y;
}

function gaussian(x, c, w, h) {
    return h * Math.exp(-Math.pow(x - c, 2) / (2 * w * w));
}

function draw() {
    // 抓取當前主題的顏色
    let style = getComputedStyle(document.body);
    let bg = style.getPropertyValue('--bg-monitor').trim() || '#000';
    let waveColor = getComputedStyle(document.documentElement).getPropertyValue('--c-hr').trim() || '#0f0';

    ctx.fillStyle = bg;
    ctx.fillRect(x, 0, 8, canvas.height); // 擦除

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
    if (x >= canvas.width) {
        x = 0;
        ctx.beginPath();
    }
    requestAnimationFrame(draw);
}

// =================================================
// 6. UTILITIES & INTERACTIONS
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
    div.className = 'log-item';
    div.innerText = `💉 Give ${d.toUpperCase()}`;
    log.appendChild(div);
    setTimeout(() => div.remove(), 4000);
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

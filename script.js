/* =================================================================
   1. GLOBAL VARIABLES & INIT
   ================================================================= */
let DATA = null;
if (typeof ECG_DATABASE !== 'undefined') DATA = ECG_DATABASE;
else if (typeof DB !== 'undefined') DATA = DB;
else console.error("Database (data.js) is missing!");

let curKey = 'nsr';
let animTimers = []; 
const cvs = document.getElementById('ecgCanvas');
const ctx = cvs.getContext('2d');

// 繪圖參數
let x = 0;
let speed = 1.2; // 掃描速度，稍慢一點看起來更像真實監測器
let lastY = 150;

// NIBP & 藥物特效
let isCharging=false, isReady=false;
let shockFx = 0, adenFx = 0;
let nextBeatTime = 0; // 用於計算不規則心律

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
    // 使用者與權限
    const user = localStorage.getItem('ecg_username');
    if (user) {
        const badge = document.getElementById('user-staff-badge');
        const modalUser = document.getElementById('modal-user-name');
        if(badge) badge.innerHTML = `Staff: <strong>${user}</strong>`;
        if(modalUser) modalUser.innerText = user;
    }

    resize();
    window.addEventListener('resize', resize);
    setupHover(); // SVG 互動提示

    // 啟動系統
    if (DATA) {
        loadCase('nsr'); // 預設載入 NSR
        drawLoop();
        setInterval(fluctuateVitals, 2000);
    }
});

function resize() {
    if(cvs.parentElement) {
        cvs.width = cvs.parentElement.clientWidth;
        cvs.height = cvs.parentElement.clientHeight;
        lastY = cvs.height / 2;
    }
}

/* =================================================================
   2. CORE WAVEFORM ENGINE (核心：波形數學模型)
   重點修正：完全區分不同心律的畫法
   ================================================================= */

// 數學工具：高斯函數 (用來產生尖銳或圓滑的波峰)
// t: 時間點, peak: 波峰位置, width: 波寬(越小越尖), height: 波高(+/-)
function gaussian(t, peak, width, height) {
    return height * Math.exp(-Math.pow((t - peak), 2) / (2 * width * width));
}

// 核心：取得當前時間點的 Y 軸高度
function getWaveY(t) {
    const baseLine = cvs.height / 2;
    
    // 特效層：電擊與 Adenosine 暫停
    if (shockFx > 0) { 
        shockFx--; 
        return baseLine + (Math.random() - 0.5) * 500; // 電擊亂波
    }
    if (adenFx > 0) { 
        adenFx--; 
        return baseLine + (Math.random() - 0.5) * 2; // Flatline
    }

    let y = 0;
    
    // ----------- 1. NSR (正常) / Sinus Brady / Sinus Tachy -----------
    // 特徵：清楚的 P, QRS (窄), T
    if (['nsr', 'sb', 'pea', 'psvt', 'avb1'].includes(curKey)) {
        // 設定心率週期
        let cycle = (curKey === 'sb') ? 1300 : (curKey === 'psvt') ? 350 : 850; 
        
        let localT = t % cycle;
        
        if (curKey === 'psvt') {
            // PSVT: P波融合看不見，QRS 很窄
            y += gaussian(localT, 150, 10, -50); // QRS
            // 微弱的 T
            y += gaussian(localT, 280, 40, -10); 
        } else {
            // NSR / Brady / AVB1
            // P Wave (在 100ms 處，寬度 30，高度 -8) (Canvas Y軸往下是正，所以負值是往上)
            y += gaussian(localT, 100, 30, -8); 
            
            // QRS Complex (在 250ms 處)
            // Q (微下) -> R (極高極尖) -> S (微下)
            y += gaussian(localT, 240, 5, 5);   // Q
            y += gaussian(localT, 250, 6, -60); // R (高聳)
            y += gaussian(localT, 260, 6, 10);  // S
            
            // T Wave (在 450ms 處，圓滑)
            let tPos = (curKey === 'avb1') ? 500 : 450; // AVB1 PR 延長，這裡簡單把T拉開
            y += gaussian(localT, tPos, 50, -12);
        }
    }

    // ----------- 2. Ventricular Tachycardia (VT) -----------
    // 特徵：寬大、單型性、像巨大的鋸齒或正弦波，沒有 P/T
    else if (curKey === 'vt' || curKey === 'vt_pulse' || curKey === 'vt_pulseless' || curKey === 'pvt') {
        const cycle = 330; // 快
        const localT = t % cycle;
        // 使用正弦波加上高斯波來模擬寬大 QRS
        // 形狀類似 ^v^v 但比較圓胖
        let shape = Math.sin((localT / cycle) * Math.PI * 2);
        y += shape * 50; 
    }

    // ----------- 3. Ventricular Fibrillation (VF) -----------
    // 特徵：混亂、大小不一、頻率不一 (Coarse VF)
    else if (curKey === 'vf') {
        // 疊加三個不同頻率的正弦波 + 隨機雜訊
        y += Math.sin(t * 0.015) * 15;
        y += Math.sin(t * 0.023) * 10;
        y += Math.sin(t * 0.050) * 5;
        y += (Math.random() - 0.5) * 5;
    }

    // ----------- 4. Atrial Fibrillation (AFib) -----------
    // 特徵：基線有細碎 F wave (雜訊)，QRS 出現時間不規則 (Irregularly Irregular)
    else if (curKey === 'afib') {
        // 1. 基線雜訊 (F waves)
        y += Math.sin(t * 0.04) * 2 + (Math.random() - 0.5) * 2;

        // 2. 不規則 QRS 產生器
        if (t > nextBeatTime) {
            // 下一次心跳時間隨機 (600ms ~ 1000ms 之間)
            nextBeatTime = t + 500 + Math.random() * 500;
        }
        
        // 繪製 QRS
        let dist = Math.abs(t - nextBeatTime);
        if (dist < 50) { // 在預定心跳前後 50ms 繪製
            // 用簡單數學模擬 QRS 形狀
            // 當 dist = 0 (正中心) 時 y 最大
            y += gaussian(dist, 0, 8, -50); 
        }
    }

    // ----------- 5. Atrial Flutter (A-FL) -----------
    // 特徵：明顯的鋸齒狀基線 (Sawtooth)，固定 QRS (例如 300ms 一個齒)
    else if (curKey === 'afl' || curKey === 'a-flutter') {
        // Sawtooth wave (F wave)
        const sawParams = (t % 250) / 250; // 250ms 一個鋸齒
        // 模擬下坡緩、上坡急
        y += (0.5 - sawParams) * 15;

        // 固定傳導比例 (例如每 3 個鋸齒傳 1 個 QRS = 750ms)
        const qrsCycle = 750;
        const qrsPhase = t % qrsCycle;
        y += gaussian(qrsPhase, 50, 8, -45); // QRS overlay
    }

    // ----------- 6. PVC (偶發心室早收) -----------
    // 特徵：背景是 NSR，偶爾出現一個寬大波
    else if (curKey === 'pvc') {
        const cycle = 900;
        const localT = t % cycle;
        
        // 模擬每 4 個心跳出現一次 PVC
        const beatCount = Math.floor(t / cycle);
        
        if (beatCount % 4 === 3) {
            // 這是 PVC 那一下：寬大、相反方向 T 波
            y += gaussian(localT, 200, 20, 50); // 寬大的 R (或倒置)
            y += gaussian(localT, 350, 40, -20); // ST 變化
        } else {
            // 正常 NSR
            y += gaussian(localT, 100, 20, -5);  // P
            y += gaussian(localT, 250, 6, -55);  // QRS (窄)
            y += gaussian(localT, 400, 40, -10); // T
        }
    }

    // ----------- 7. Asystole / PEA (No pulse but electrical in PEA?) -----------
    // Asystole: 幾乎平線
    else if (curKey === 'asystole' || curKey === 'asys') {
        y += (Math.random() - 0.5) * 2; // 只有極低電雜訊
    }
    // PEA: 看起來像正常，但沒脈搏 (邏輯與 NSR 相同，只是沒有血壓)
    // 已經在 NSR 邏輯處理了，這裡保留 fallback
    
    // ----------- 8. AV Blocks -----------
    else if (curKey.includes('avb')) {
        // AVB 2nd Type II: 固定 PR，隨機漏 QRS
        // AVB 3rd: P 與 QRS 脫鉤 (雙頻率)
        if(curKey === 'avb3') {
            // P波頻率 (快)
            let pRate = 800;
            let pTime = t % pRate;
            y += gaussian(pTime, 100, 30, -8);

            // QRS頻率 (慢, 寬大)
            let qRate = 1800; // 33 bpm
            let qTime = t % qRate;
            y += gaussian(qTime, 200, 15, -50);
            y += gaussian(qTime, 350, 50, -15); // Wide T
        } else {
            // Fallback simple view
            y += (Math.random()-0.5)*3;
        }
    }

    // 雜訊/飄移 (讓所有波形都有點「人氣」)
    y += (Math.random() - 0.5) * 2; 

    return baseLine + y;
}

// 繪圖迴圈
function drawLoop() {
    // 1. 清除前方一小段 (Scanning Bar 效果)
    const style = getComputedStyle(document.body);
    const bg = style.getPropertyValue('--bg-monitor').trim();
    // 這裡修正顏色讀取不到的問題：如果 CSS 變數沒抓到，預設純黑
    ctx.fillStyle = bg || '#000000';
    ctx.fillRect(x, 0, 10, cvs.height); // 擦除條寬度 10px

    // 2. 設定線條顏色
    const waveColor = style.getPropertyValue('--c-hr').trim() || '#00ff00';
    ctx.beginPath();
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    // 3. 取得現在要畫的高度
    let y = getWaveY(Date.now());
    
    // 4. 畫線
    ctx.moveTo(x - speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    // 5. 更新座標
    lastY = y;
    x += speed;
    if (x >= cvs.width) {
        x = 0;
        ctx.beginPath(); // 防止連線回頭
    }
    
    requestAnimationFrame(drawLoop);
}

/* =================================================================
   3. ANIMATION & ANATOMY ENGINE
   修正路徑邏輯：確保正確的電位流動順序
   ================================================================= */
function runAnatomy(type) {
    // 清除舊狀態
    ['n-sa','n-av','p-internodal','p-his','p-branches'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) { el.classList.remove('active','flowing'); el.style.opacity='0.2'; }
    });
    
    const blockEl = document.getElementById('vis-block');
    const reentryEl = document.getElementById('vis-reentry');
    if(blockEl) blockEl.style.display = 'none';
    if(reentryEl) reentryEl.style.display = 'none';

    // 定義各種心律的動畫序列
    const sequence = () => {
        // --- 標準傳導 (NSR, Sinus Brady, PEA, 1度Block) ---
        if(['nsr','sb','pea','avb1','pvc'].includes(type)) {
            const rate = (type === 'sb') ? 1300 : 900;
            
            // 1. SA Node 發火
            lightUp('n-sa', 150);
            
            // 2. 傳到 AV Node
            schedule(() => flowPath('p-internodal'), 50);
            
            // 3. AV Node 亮起 (1度 Block 會延遲)
            const avDelay = (type === 'avb1') ? 450 : 250;
            schedule(() => lightUp('n-av', 150), avDelay);
            
            // 4. His Bundle
            schedule(() => flowPath('p-his'), avDelay + 150);
            
            // 5. Purkinje Fibers & 收縮
            schedule(() => {
                flowPath('p-branches');
                if(type !== 'pea') beatHeart();
            }, avDelay + 200);

            // 迴圈
            animTimers.push(setTimeout(sequence, rate));
        }
        
        // --- 快速迴路 (PSVT, Flutter) ---
        else if(type === 'psvt' || type === 'afl' || type === 'afib') {
            if(reentryEl) reentryEl.style.display = (type==='afib') ? 'none' : 'block';
            
            // AV Node 狂閃
            lightUp('n-av', 100);
            flowPath('p-his');
            flowPath('p-branches');
            beatHeart();
            
            // Afib 亂數，PSVT 規律快
            const nextTime = (type === 'afib') ? (400 + Math.random()*300) : 320;
            animTimers.push(setTimeout(sequence, nextTime));
        }
        
        // --- 心室問題 (VT, VF) ---
        else if(['vt', 'vt_pulse', 'vt_pulseless', 'vf', 'tdp'].includes(type)) {
            // 電訊號只在心室
            flowPath('p-branches');
            if(type.includes('vt')) beatHeart(); // VF/TdP 不會有有效收縮
            animTimers.push(setTimeout(sequence, (type==='vf'||type==='tdp')?200:400));
        }
        
        // --- Block (AVB3 - 完全脫鉤) ---
        else if(type === 'avb3') {
            if(blockEl) blockEl.style.display = 'block';
            lightUp('n-sa', 100);
            schedule(()=>flowPath('p-internodal'), 50);
            
            // 隨機讓 AV Node 自己跳一下 (脫鉤)
            if(Math.random() > 0.6) {
                schedule(()=> {
                    lightUp('n-av', 150);
                    flowPath('p-his');
                    flowPath('p-branches');
                    beatHeart();
                }, 500);
            }
            animTimers.push(setTimeout(sequence, 1000));
        }
        
        // Asystole: 沒動畫
    };

    sequence();
}

// 點亮節點
function lightUp(id, ms) {
    const el = document.getElementById(id);
    if(el) { el.classList.add('active'); el.style.opacity = '1'; setTimeout(()=>el.classList.remove('active'), ms); }
}
// 線條流動
function flowPath(id) {
    const el = document.getElementById(id);
    if(el) {
        el.classList.remove('flowing');
        void el.offsetWidth; // 強制重繪
        el.classList.add('flowing');
        el.style.opacity = '1';
    }
}
// 心臟跳動效果
function beatHeart() {
    const h = document.getElementById('heart-muscle'); // 請確認 index.html id="heart-muscle" (如果原先叫 h-muscle 請改過來或改這裡)
    const altH = document.getElementById('h-muscle');
    const target = h || altH;
    
    if(target) {
        target.style.transition = 'transform 0.1s ease-in-out';
        target.style.transform = 'scale(0.95)';
        setTimeout(() => target.style.transform = 'scale(1)', 120);
    }
}
function schedule(fn, ms) {
    animTimers.push(setTimeout(fn, ms));
}

/* =================================================================
   4. SYSTEM FUNCTIONS (NIBP, Hover, Text)
   ================================================================= */

// 讀取資料並更新介面
function loadCase(k) {
    if (!DATA[k]) return;
    curKey = k;
    
    // Reset
    animTimers.forEach(t => clearTimeout(t)); animTimers=[];
    
    const d = DATA[k];
    
    // 更新側邊欄按鈕狀態 (簡單實作)
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active');
        // 用 innerText 判斷
        if(b.innerText.toLowerCase().includes(d.t.split(' ')[0].toLowerCase())) b.classList.add('active');
    });

    // 介面文字
    document.getElementById('txt-title').innerText = d.t;
    document.getElementById('txt-tag').innerText = d.b;
    document.getElementById('txt-tag').style.background = d.c;
    
    // 內容列表
    fill('list-cri', d.cri); fill('list-rx', d.rx);
    fill('list-nurse', d.n); fill('list-cause', d.cause);
    if(document.getElementById('txt-patho')) document.getElementById('txt-patho').innerText = d.patho;

    // Vitals (NIBP 除外)
    setVal('val-hr', d.hr);
    setVal('val-spo2', d.spo2);
    setVal('val-rr', d.rr);
    setVal('val-temp', d.temp);
    
    // 歸零血壓 (模擬換情境)
    document.getElementById('val-sys').innerText = '--';
    document.getElementById('val-dia').innerText = '--';

    // 警示橫幅
    const box = document.getElementById('alert-banner');
    if(d.shock) {
        box.style.display='block'; box.innerText="⚡ 可電擊 (SHOCKABLE)";
        box.style.borderColor="orange"; box.style.color="orange"; box.style.background="rgba(255,165,0,0.1)";
    } else if(['pvt','pea','asystole','vf'].includes(k)) { 
        // 註: vf 通常可電，這裡假設 vf 為 shockable (依 DB)
        // 假設 pvt 是 PEA/Asys 的邏輯
        // 修正邏輯依賴 DB shock 屬性
        // 若 db.shock 為 false 且是嚴重型 -> 不可電擊
        box.style.display = (d.b==='Arrest' && !d.shock) ? 'block' : 'none';
        if(box.style.display === 'block') {
            box.innerText="⛔ 不可電擊 (NON-SHOCKABLE)";
            box.style.borderColor="red"; box.style.color="red"; box.style.background="rgba(255,0,0,0.1)";
        }
    } else {
        box.style.display='none';
    }

    runAnatomy(d.vis);
}

// 壓下 NIBP 的行為
function runNIBP() {
    const btn = document.getElementById('btn-nibp');
    // 如果正在測量...
    if (btn.classList.contains('active')) return; 

    btn.innerText = "測量中...";
    btn.classList.add('active'); // CSS 要配合轉圈圈或變色
    
    // 歸零顯示
    document.getElementById('val-sys').innerText = "---";
    document.getElementById('val-dia').innerText = "---";

    setTimeout(() => {
        btn.innerText = "START";
        btn.classList.remove('active');
        
        const d = DATA[curKey];
        if(d.sys !== "---") {
            // 基於設定值做 ±10 浮動
            const s = parseInt(d.sys) + Math.floor(Math.random()*20 - 10);
            const dVal = parseInt(d.dia) + Math.floor(Math.random()*16 - 8);
            document.getElementById('val-sys').innerText = s;
            document.getElementById('val-dia').innerText = dVal;
        } else {
            // Asystole 等
            document.getElementById('val-sys').innerText = "---";
            document.getElementById('val-dia').innerText = "---";
        }
    }, 3000); // 3秒後出值
}

// Hover SVG
function setupHover() {
    const tip = document.getElementById('anat-tip');
    const els = document.querySelectorAll('.path-wire, .node, .node-dot'); // 涵蓋可能的新舊 class
    els.forEach(el => {
        el.addEventListener('mouseenter', ()=>{
            tip.innerText = el.getAttribute('data-name') || el.getAttribute('data-tip') || "Structure";
            tip.style.color = "white";
        });
        el.addEventListener('mouseleave', ()=>{
            tip.innerText = "Interactive View";
            tip.style.color = "#aaa";
        });
    });
}

function fluctuateVitals() {
    if(DATA[curKey].hr && typeof DATA[curKey].hr === 'number') {
        let r = Math.floor(Math.random()*3)-1; 
        document.getElementById('val-hr').innerText = DATA[curKey].hr + r;
    }
}

// Helper Wrappers
function fill(id, arr) { document.getElementById(id).innerHTML = arr?arr.map(i=>`<li>${i}</li>`).join(''):''; }
function setVal(id, v) { document.getElementById(id).innerText = (v===undefined?'--':v); }
function toggleTheme(){
    const b = document.body;
    // 簡單 Toggle: Dark <-> Light
    if(!b.getAttribute('data-theme')) b.setAttribute('data-theme', 'light');
    else b.removeAttribute('data-theme');
}
// 必須要有對應 Tab 的邏輯
function openTab(n) {
    document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
    document.getElementById('t'+n).classList.add('active');
    document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
    event.target.classList.add('active');
}
function logout(){ localStorage.removeItem('ecg_username'); location.reload(); }
function openModal(){document.getElementById('info-modal').style.display='flex';}
function closeModal(){document.getElementById('info-modal').style.display='none';}

// 藥物 & 電擊 (視覺用)
function giveDrug(n){
    const l=document.getElementById('med-log');
    const d=document.createElement('div'); d.className='log-entry'; // 確認 style.css 有 .log-entry
    d.innerText = `💉 ${n}`;
    l.appendChild(d); setTimeout(()=>d.remove(), 4000);
    
    if(n.includes('Adenosine') && curKey==='psvt') {
        setTimeout(()=>{ adenFx = 150; setTimeout(()=>loadCase('nsr'), 1500); }, 1000);
    }
}
function charge(){
    if(!isCharging){ 
        isCharging=true; 
        document.getElementById('btn-chg').innerText="CHG..."; 
        setTimeout(()=>{
            isCharging=false;isReady=true;
            document.getElementById('btn-chg').innerText="READY";
            document.getElementById('btn-shk').disabled=false;
            document.getElementById('btn-shk').classList.add('ready');
        },2000);
    }
}
function shock(){
    if(isReady){
        shockFx = 40; // 產生大亂波
        document.getElementById('shock-flash').style.opacity=1;
        setTimeout(()=>document.getElementById('shock-flash').style.opacity=0, 200);
        
        // 簡單邏輯：若是可電擊，轉 NSR，否則不變 (或轉 VF)
        if(DATA[curKey].shock) setTimeout(()=>loadCase('nsr'), 1000);
        else if(curKey!=='asystole') setTimeout(()=>loadCase('vf'), 1000); // 錯誤電擊致顫
        
        resetDefib();
    }
}
function resetDefib(){
    isReady=false; 
    document.getElementById('btn-chg').innerText="CHARGE"; 
    const b=document.getElementById('btn-shk'); b.disabled=true; b.classList.remove('ready');
}

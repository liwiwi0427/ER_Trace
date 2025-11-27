/* =================================================
   1. GLOBAL VARIABLES & DATABASE CHECK
   ================================================= */
let DATA = null;
if (typeof ECG_DATABASE !== 'undefined') DATA = ECG_DATABASE;
else if (typeof DB !== 'undefined') DATA = DB;
else alert("Error: 無法讀取資料庫 (data.js)，請確認檔案連結正確。");

let curKey = 'nsr';
let animTimers = []; 
const cvs = document.getElementById('ecgCanvas');
const ctx = cvs.getContext('2d');
let x = 0, speed = 1.5, lastY = 150;

// 波形演算專用變數
let nextBeatTime = 0; 
let shockFx = 0, adenosineFx = 0;

/* =================================================
   2. INITIALIZATION (初始化)
   ================================================= */
window.addEventListener('DOMContentLoaded', () => {
    // 1. 登入檢查與顯示
    const user = localStorage.getItem('ecg_username');
    if (user) {
        const badge = document.getElementById('user-staff-badge');
        //const modalUser = document.getElementById('modal-user-name');
        if(badge) badge.innerHTML = `Staff: <strong>${user}</strong>`;
        //if(modalUser) modalUser.innerText = user;
    }

    // 2. 初始化畫布與 Resize 監聽
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // 3. 初始化解剖圖 Hover 效果
    initAnatomyHover();

    // 4. 啟動系統
    if (DATA) {
        loadCase('nsr'); // 預設載入
        drawLoop();      // 開始繪圖
        setInterval(fluctuateVitals, 2000); // 數值微幅浮動
    }
});

function resizeCanvas() {
    if (cvs && cvs.parentElement) {
        cvs.width = cvs.parentElement.clientWidth;
        cvs.height = cvs.parentElement.clientHeight;
        lastY = cvs.height / 2;
    }
}

// 修正：針對您現有 HTML 結構的滑鼠互動提示
function initAnatomyHover() {
    const txt = document.getElementById('anatomy-text');
    // 定義部位名稱映射 (因為 HTML 中可能沒有 data-name)
    const map = new Map([
        ['node-sa', 'SA Node (竇房結)'],
        ['node-av', 'AV Node (房室結)'],
        ['heart-muscle', 'Myocardium (心肌)']
    ]);

    // 取得所有節點與路徑
    const nodes = document.querySelectorAll('.node');
    const paths = document.querySelectorAll('.path-conduction');

    // 綁定節點 Hover
    nodes.forEach(el => {
        el.addEventListener('mouseenter', () => {
            const name = map.get(el.id) || "Conduction Node";
            updateAnatText(name, '#fff');
        });
        el.addEventListener('mouseleave', resetAnatText);
    });

    // 綁定路徑 Hover (依照 HTML 順序判斷：0=心房路徑, 1=心室路徑)
    paths.forEach((el, index) => {
        el.addEventListener('mouseenter', () => {
            let name = (index === 0) ? "Internodal Pathway (結間路徑)" : "His-Purkinje System (希氏束/束支)";
            updateAnatText(name, '#fff');
        });
        el.addEventListener('mouseleave', resetAnatText);
    });
}

function updateAnatText(str, col) {
    const t = document.getElementById('anatomy-text');
    if(t) { t.innerText = str; t.style.color = col; }
}
function resetAnatText() {
    const d = DATA[curKey];
    updateAnatText(d ? d.t.split(' ')[0] : "Normal", "var(--text-muted)");
}

/* =================================================
   3. CORE LOGIC (核心邏輯)
   ================================================= */
function loadCase(k) {
    if (!DATA || !DATA[k]) return;
    curKey = k;
    
    // 清除所有舊動畫與效果
    animTimers.forEach(id => clearTimeout(id));
    animTimers = [];
    resetDefib();

    // 更新選單按鈕 UI
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const clickedBtn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if(clickedBtn) clickedBtn.classList.add('active');

    const d = DATA[k];
    
    // 更新標題與顏色標籤
    document.getElementById('txt-title').innerText = d.t;
    const tag = document.getElementById('txt-tag');
    tag.innerText = d.b; 
    tag.style.background = d.c;

    // 填入文字列表
    fill('list-criteria', d.cri);
    fill('list-rx', d.rx);
    fill('list-nurse', d.n);
    fill('list-causes', d.cause);
    document.getElementById('txt-patho').innerText = d.patho;

    // 重置並載入基本生命徵象 (不包含 NIBP，除非您想重置它)
    updateVitalValue('val-hr', d.hr);
    updateVitalValue('val-spo2', d.spo2);
    updateVitalValue('val-rr', d.rr);
    updateVitalValue('val-temp', d.temp);
    // NIBP 維持現狀或歸零 (視臨床情境)
    
    // 警示框邏輯
    const alert = document.getElementById('alert-box');
    alert.style.display = 'none';
    if (d.shock) {
        alert.style.display = 'block';
        alert.style.backgroundColor = 'rgba(255, 152, 0, 0.15)';
        alert.style.border = '1px solid #ff9800';
        alert.style.color = '#ff9800';
        alert.innerHTML = "⚡ <strong>SHOCKABLE RHYTHM</strong>";
    } else if (k === 'pea' || k === 'asystole') {
        alert.style.display = 'block';
        alert.style.backgroundColor = 'rgba(244, 67, 54, 0.15)';
        alert.style.border = '1px solid #f44336';
        alert.style.color = '#f44336';
        alert.innerHTML = "⛔ <strong>NON-SHOCKABLE</strong> (CPR Only)";
    }

    // 啟動心臟動畫
    runAnatomy(d.vis);
}

/* =================================================
   4. HEART ANATOMY ANIMATION (動畫修正)
   ================================================= */
function runAnatomy(type) {
    // 重置所有 CSS 狀態
    const nodes = ['node-sa', 'node-av'];
    const paths = document.querySelectorAll('.path-conduction'); // HTML 是 class
    const muscle = document.getElementById('heart-muscle');
    const vis = ['vis-block', 'vis-psvt', 'vis-tdp'];

    nodes.forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.style.animation = 'none'; el.style.opacity = '0.4'; }
    });
    paths.forEach(p => {
        p.style.animation = 'none'; p.style.opacity = '0.3';
    });
    if(muscle) {
        muscle.style.transform = 'scale(1)'; 
        muscle.style.opacity = '1';
        muscle.classList.remove('mech-fail'); // 若有 CSS 支援
    }
    vis.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    // 動畫序列
    const seq = () => {
        if (type === 'nsr' || type === 'sb' || type === 'pea') {
            const rate = (type === 'sb') ? 1300 : 900;
            // 1. SA Node 亮
            flashNode('node-sa', 150);
            
            // 2. Internodal (Path[0]) 傳導
            schedule(() => flashPath(0, 150), 50);
            
            // 3. AV Node 亮
            schedule(() => flashNode('node-av', 150), 200);
            
            // 4. Ventricles (Path[1]) 傳導
            schedule(() => {
                flashPath(1, 200);
                // PEA 不收縮，其他收縮
                if(type !== 'pea') pulseMuscle();
            }, 350);

            if(type === 'pea' && muscle) muscle.style.opacity = '0.6';

            schedule(seq, rate);
        }
        else if (type && type.includes('block')) { // AV Blocks
            document.getElementById('vis-block').style.display = 'block';
            flashNode('node-sa', 100);
            schedule(() => flashPath(0, 150), 50);
            
            if(type === 'avb1') { // 只是慢
                schedule(() => flashNode('node-av', 150), 500); // Late
                schedule(() => { flashPath(1, 200); pulseMuscle(); }, 650);
            } else if(type === 'avb3') { // 斷開，AV node 自己跳
                schedule(() => flashNode('node-av', 150), 400); // 隨機不同步
            }
            schedule(seq, 1200);
        }
        else if (type === 'psvt' || type === 'afl') {
            document.getElementById('vis-psvt').style.display = 'block';
            pulseMuscle(300);
            schedule(seq, 350); // Fast loop
        }
        else if (type === 'vt_pulse' || type === 'vt_pulseless' || type === 'vf' || type === 'tdp') {
            if(type === 'tdp') document.getElementById('vis-tdp').style.display = 'block';
            // 心室路徑直接亮
            flashPath(1, 150); 
            if(type.includes('vt') && !type.includes('pulseless')) pulseMuscle(300);
            schedule(seq, (type === 'vf') ? 200 : 450);
        }
    };
    seq();
}

// 動畫輔助函式
function flashNode(id, dur) {
    const el = document.getElementById(id);
    if(el) {
        el.style.fill = 'var(--c-rr)'; // 用黃色變亮
        el.style.opacity = '1';
        el.style.filter = 'drop-shadow(0 0 5px yellow)';
        setTimeout(() => {
            el.style.fill = ''; 
            el.style.opacity = '0.4';
            el.style.filter = 'none';
        }, dur);
    }
}
function flashPath(index, dur) {
    const paths = document.querySelectorAll('.path-conduction');
    if(paths[index]) {
        const p = paths[index];
        p.style.stroke = 'var(--c-rr)';
        p.style.opacity = '1';
        p.style.strokeDasharray = '5 2'; // 變成虛線模擬流動
        setTimeout(() => {
            p.style.stroke = '';
            p.style.opacity = '0.3';
            p.style.strokeDasharray = 'none';
        }, dur);
    }
}
function pulseMuscle(dur = 200) {
    const m = document.getElementById('heart-muscle');
    if(m) {
        m.style.transition = `transform ${dur/2}ms`;
        m.style.transform = 'scale(0.96)';
        setTimeout(() => m.style.transform = 'scale(1)', dur/2);
    }
}
function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    animTimers.push(id);
}

/* =================================================
   5. NIBP 修正 (點擊->等待->隨機產生)
   ================================================= */
function toggleNIBP() {
    const btn = document.getElementById('btn-nibp');
    
    // 如果目前不是在測量狀態，開始測量
    if (btn.innerText.trim() === "Start" || btn.innerText.trim() === "測量") {
        btn.innerText = "測量中...";
        btn.classList.add('active');
        btn.style.background = "var(--c-bp)";
        btn.style.color = "#000";
        
        // 介面歸零
        document.getElementById('val-sys').innerText = "---";
        document.getElementById('val-dia').innerText = "---";
        
        setTimeout(() => {
            const d = DATA[curKey];
            if(d && d.sys !== "---") {
                // 基準值 + 隨機(-12 ~ +12)
                const baseSys = parseInt(d.sys);
                const baseDia = parseInt(d.dia);
                const r = Math.floor(Math.random() * 25) - 12;
                
                document.getElementById('val-sys').innerText = baseSys + r;
                document.getElementById('val-dia').innerText = baseDia + Math.floor(r/2);
            } else {
                // 如果是 VF/Asystole 測不到
                document.getElementById('val-sys').innerText = "---";
                document.getElementById('val-dia').innerText = "---";
            }
            // 恢復按鈕
            btn.innerText = "Start";
            btn.classList.remove('active');
            btn.style.background = "";
            btn.style.color = "";
        }, 3000); // 等待 3 秒
    }
}

/* =================================================
   6. WAVEFORM GENERATOR (優化版波形)
   ================================================= */
function getWaveY(time) {
    const centerY = cvs.height / 2;
    
    // 特效干擾 (電擊或藥物)
    if (shockFx > 0) { shockFx--; return centerY + (Math.random() - 0.5) * 500; }
    if (adenosineFx > 0) { adenosineFx--; return centerY + (Math.random() - 0.5) * 5; }

    const t = time;
    let y = 0;

    // 1. NSR, SB, PEA, Blocks (規律 P-QRS-T)
    if (['nsr', 'sb', 'pea', 'avb1', 'avb2t1', 'avb2t2', 'avb3'].includes(curKey)) {
        // 設定速率
        let rate = (curKey === 'sb' || curKey === 'avb3') ? 1400 : 850;
        let phase = t % rate;
        
        // 繪製 P 波 (圓滑高斯波)
        // 修正：AV block 的 P 波會分離，這裡暫時簡化為跟隨 QRS 或獨立
        // 若要模擬房室分離很複雜，這裡先以主要特徵為主
        y += gaussian(phase, 100, 30, -8); 
        
        // 繪製 QRS (高聳尖銳)
        if (phase > 230 && phase < 270) {
            if (phase > 248 && phase < 252) y += 60; // R peak
            else if (phase > 240 && phase < 260) y -= 15; // S / Q
        }
        
        // 繪製 T 波
        y += gaussian(phase, 450, 60, -12);
    } 
    // 2. Afib (不規則 QRS + F wave 雜訊)
    else if (curKey === 'afib') {
        if (t > nextBeatTime) {
            nextBeatTime = t + 500 + Math.random() * 500; // 500~1000ms 不規則間距
        }
        // F-wave 基線雜訊
        y += Math.sin(t * 0.05) * 4 + (Math.random() - 0.5) * 3;
        
        // QRS 在 beat 時間點產生
        if (Math.abs(t - nextBeatTime) < 30) y += 60;
        else if (Math.abs(t - nextBeatTime) < 50) y -= 15;
    }
    // 3. VT (單型性大波浪)
    else if (curKey.includes('vt')) {
        const p = t % 350;
        // 使用正弦波模擬，但更寬
        y += Math.sin(p / 350 * Math.PI * 2) * 65; 
        y += Math.random() * 5; // 加一點毛邊看起來像真的
    }
    // 4. VF (混亂小波)
    else if (curKey === 'vf') {
        y += Math.sin(t * 0.01) * 20 + Math.sin(t * 0.023) * 15 + (Math.random() - 0.5) * 8;
    }
    // 5. PSVT (極快窄波，無 P)
    else if (curKey === 'psvt' || curKey === 'afl') {
        const p = t % 320;
        // QRS only
        if(p > 50 && p < 80) y += (p > 60 && p < 70) ? 55 : -10;
        
        // 如果是 Flutter，加入鋸齒基線
        if(curKey === 'afl') y += Math.sin(t * 0.02) * 10;
    }
    // 6. Asystole
    else if (curKey === 'asystole') {
        y += (Math.random() - 0.5) * 2;
    } 
    else {
        y += (Math.random() - 0.5) * 5; // 預設雜訊
    }

    return centerY + y;
}

// 數學輔助：高斯函數 (用來畫漂亮的 P/T 波)
function gaussian(x, center, width, height) {
    return height * Math.exp(-Math.pow(x - center, 2) / (2 * width * width));
}

function drawLoop() {
    // 使用透明色做 fade out 效果，或者使用背景色直接蓋掉 (這裏用背景色模擬監視器更新)
    // 注意：這裡必須獲取當前 CSS 變數中的顏色
    const style = getComputedStyle(document.body);
    const bg = style.getPropertyValue('--bg-monitor') || '#000';
    const color = style.getPropertyValue('--c-hr') || '#0f0';

    ctx.fillStyle = bg; // 確保顏色與主題一致
    ctx.fillRect(x, 0, 8, cvs.height); // 擦除前方一小段 (Scanning bar effect)

    ctx.beginPath();
    ctx.strokeStyle = color; // 綠色 (隨 CSS 變數)
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    let y = getWaveY(Date.now());
    ctx.moveTo(x - speed, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastY = y;
    x += speed;
    if (x > cvs.width) {
        x = 0;
        ctx.beginPath();
    }
    requestAnimationFrame(drawLoop);
}

/* =================================================
   7. UTILS & OTHERS
   ================================================= */
function updateVitalValue(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = (val === undefined) ? '--' : val;
}

function fluctuateVitals() {
    // 讓 HR 與 SpO2 稍微跳動，看起來更真實
    const d = DATA[curKey];
    if(d && typeof d.hr === 'number') {
        const noise = Math.floor(Math.random() * 3) - 1;
        document.getElementById('val-hr').innerText = d.hr + noise;
    }
}

function fill(id, arr) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = arr ? arr.map(i => `<li>${i}</li>`).join('') : '';
}

function toggleTheme() {
    // 如果想要 toggle button，這裡示範切換
    // 若側邊欄是用 <select> 則使用 onchange 呼叫別的函式
    const b = document.body;
    if(!b.getAttribute('data-theme')) b.setAttribute('data-theme', 'light');
    else b.removeAttribute('data-theme');
}

// 供 index.html 的 modal 使用
function openModal() { document.getElementById('info-modal').style.display='flex'; }
function closeModal() { document.getElementById('info-modal').style.display='none'; }
function logout() {
    if(confirm('Confirm Logout?')) {
        localStorage.removeItem('ecg_username');
        window.location.replace('login.html');
    }
}

// Drug & Defib stubs (與之前功能相同)
function giveDrug(d) {
    const log = document.getElementById('med-log');
    const div = document.createElement('div');
    div.className='log-entry'; div.innerText=`💉 Give ${d}`; // Ensure class name matches CSS
    if(!log.innerHTML) log.innerHTML = "";
    log.appendChild(div); setTimeout(()=>div.remove(), 4000);
    if(d.includes('adenosine') && curKey==='psvt') setTimeout(()=>loadCase('nsr'),2000);
}
function charge(){ 
    if(!isCharging) {
        isCharging=true; 
        document.getElementById('btn-charge').innerText="CHG..."; 
        setTimeout(()=>{
            isCharging=false;isReady=true;
            document.getElementById('btn-charge').innerText="READY";
            const b = document.getElementById('btn-shock'); b.disabled=false; b.classList.add('ready');
        },2000);
    } 
}
function shock(){ 
    if(isReady) {
        shockFx=30; 
        const f=document.getElementById('screen-flash'); 
        if(f){f.style.opacity=1; setTimeout(()=>f.style.opacity=0, 200);}
        if(DATA[curKey].shock) setTimeout(()=>loadCase('nsr'), 1000);
        else if(curKey!=='asystole') setTimeout(()=>loadCase('vf'), 1000);
        resetDefib();
    }
}
function resetDefib(){ isReady=false; document.getElementById('btn-charge').innerText="Charge"; const b=document.getElementById('btn-shock'); b.disabled=true; b.classList.remove('ready'); }
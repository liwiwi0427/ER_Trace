// 全域變數
let curKey = 'nsr';
let joules = 200, isCharging=false, isReady=false, shockFx=0, adenosineFx=0;
let nibpTimer, isNibp=false;
const canvas = document.getElementById('ecgCanvas'); 
const ctx = canvas.getContext('2d');
let x=0; const speed=1.5; let lastY=150;

// 初始化執行
window.addEventListener('DOMContentLoaded', () => {
    // 讀取並顯示名字
    const userBadge = document.getElementById('user-staff-badge');
    const storedName = localStorage.getItem('ecg_username');
    if(userBadge) {
        userBadge.innerHTML = storedName ? `醫護人員：<strong>${storedName}</strong>` : `醫護人員：<strong>訪客</strong>`;
    }

    // Canvas Resize 處理
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 啟動
    draw();
    loadCase('nsr');
    setInterval(fluctuateHR, 2000);
});

function resizeCanvas() {
    if(canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }
}

// 核心功能：載入心律
function loadCase(k) {
    curKey = k; 
    resetDefib();
    
    // 更新按鈕狀態
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const clickedBtn = document.querySelector(`.nav-btn[onclick="loadCase('${k}')"]`);
    if(clickedBtn) clickedBtn.classList.add('active');

    // 從 data.js 的 ECG_DATABASE 讀取資料
    const d = ECG_DATABASE[k];
    
    // 更新文字與數值
    updateVitals(d);
    document.getElementById('txt-title').innerText = d.t;
    document.getElementById('txt-tag').innerText = d.b;
    document.getElementById('txt-tag').style.background = d.c;
    
    // 填入列表
    fill('list-criteria', d.cri); 
    fill('list-rx', d.rx);
    fill('list-nurse', d.n); 
    fill('list-causes', d.cause);
    document.getElementById('txt-patho').innerText = d.patho;
    
    // 警示框邏輯
    const alert = document.getElementById('alert-box');
    if(d.shock) {
        alert.style.display='block'; alert.style.background='#FFF9C4'; alert.style.border='4px solid #FF9800'; alert.style.color='black';
        alert.innerHTML="⚡ <strong>【注意】視情形電擊！</strong> 在醫師或專科護理師監督下可執行電擊去顫！⚡";
    } else if(k==='pea'||k==='asystole') {
        alert.style.display='block'; alert.style.background='#FF5252'; alert.style.border='4px solid #D32F2F'; alert.style.color='white';
        alert.innerHTML="⛔ <strong>【重要】請不要電擊！</strong>給予CPR即可！⛔";
    } else {
        alert.style.display='none';
    }
    
    updateAnatomy(d.vis);
}

function updateVitals(d) {
    document.getElementById('val-hr').innerText = d.hr;
    document.getElementById('val-sys').innerText = d.sys;
    document.getElementById('val-dia').innerText = d.dia;
    document.getElementById('val-spo2').innerText = d.spo2;
    document.getElementById('val-rr').innerText = d.rr;
    document.getElementById('val-temp').innerText = d.temp;
}

function fluctuateHR() {
    const d = ECG_DATABASE[curKey];
    if(d.hr !== "---" && d.hr !== 0 && typeof d.hr === 'number') {
        document.getElementById('val-hr').innerText = d.hr + Math.floor(Math.random()*3)-1;
    }
}

function updateAnatomy(vis) {
    const m = document.getElementById('heart-muscle'); 
    m.classList.remove('mech-fail');
    
    // 取得所有元件
    const sa = document.getElementById('node-sa'); 
    const av = document.getElementById('node-av');
    const pathAtria = document.getElementById('path-atria');
    const pathVent = document.getElementById('path-vent');
    
    // 1. 重置所有動畫
    document.querySelectorAll('.node, .path-conduction').forEach(e => {
        e.style.animation = 'none';
        e.style.opacity = '0.3'; // 恢復預設暗淡
    });
    
    // 隱藏特殊標示
    ['vis-block','vis-psvt','vis-tdp'].forEach(id => document.getElementById(id).style.display='none');
    document.getElementById('anatomy-text').innerText = "";

    // 2. 依據病理設定動畫
    if(vis === 'nsr' || vis === 'sb' || vis === 'pea') {
        // 正常傳導順序：SA -> AtriaPath -> AV -> VentPath
        // 使用 animation-delay 創造流動感
        const dur = (vis === 'sb') ? '1.2s' : '0.8s'; // 慢心律動畫較慢
        
        sa.style.animation = `flash ${dur} infinite`;
        if(pathAtria) pathAtria.style.animation = `flash ${dur} infinite 0.1s`; // 延遲 0.1秒
        av.style.animation = `flash ${dur} infinite 0.2s`;
        if(pathVent) pathVent.style.animation = `flash ${dur} infinite 0.3s`;

        if(vis === 'pea') m.classList.add('mech-fail'); // PEA 機械衰竭
    }
    else if(vis === 'psvt' || vis === 'afl') {
        // 迴路動畫
        document.getElementById('vis-psvt').style.display = 'block';
        document.getElementById('vis-psvt').classList.add('reentry');
        // 快速閃爍
        if(pathVent) pathVent.style.animation = 'flash 0.3s infinite';
    }
    else if(vis === 'tdp' || vis === 'vt' || vis === 'vf') {
        // 心室問題
        document.getElementById('vis-tdp').style.display = 'block';
        if(pathVent) pathVent.style.animation = 'flash 0.4s infinite';
    }
    else if(vis.includes('block')) {
        // 傳導阻滯：顯示阻擋條
        document.getElementById('vis-block').style.display = 'block';
        sa.style.animation = 'flash 0.8s infinite';
        if(pathAtria) pathAtria.style.animation = 'flash 0.8s infinite 0.1s';
        // AV 與下方路徑不閃爍 (或閃爍頻率不同)，視阻滯程度而定
        if(vis === 'block-mild') {
            av.style.animation = 'flash 0.8s infinite 0.4s'; // 延遲更久 (PR prolong)
            if(pathVent) pathVent.style.animation = 'flash 0.8s infinite 0.5s';
        }
    }
}

// 繪圖邏輯
function getY(t) {
    let y = canvas.height/2;
    if(shockFx>0){shockFx--; return y+(Math.random()-0.5)*600;}
    if(adenosineFx>0){adenosineFx--; return y+(Math.random()-0.5)*2;}
    y+=(Math.random()-0.5)*2; const cyc=(d)=>t%d;
    
    if(['nsr','pea','sb','avb1', 'avb3'].includes(curKey)) {
        let dur=(curKey==='sb')?1300:800; let c=cyc(dur);
        if(c>50&&c<100)y-=5; 
        if(c>150&&c<200){if(c<160)y+=5;else if(c<180)y-=50;else y+=10;} 
        if(c>250&&c<350)y-=8*Math.sin((c-250)/100*Math.PI); 
    }
    else if(curKey==='psvt'){ let c=cyc(320); if(c>100&&c<150){if(c<110)y+=5;else if(c<130)y-=50;else y+=10;} }
    else if(curKey==='afib'){ y+=Math.sin(t*0.05)*3; if(cyc(600+Math.random()*200)<40)y-=40; }
    else if(curKey.includes('vt')){ let c=cyc(330); y+=Math.sin(c/330*Math.PI*2)*60; }
    else if(curKey==='vf'){ y+=Math.sin(t*0.01)*20+Math.sin(t*0.03)*10; }
    else if(curKey==='tdp'){ y+=Math.sin(t*0.03)*(Math.sin(t*0.002)*50+20); }
    return y;
}

function draw(){ 
    ctx.clearRect(x,0,6,canvas.height); ctx.beginPath(); ctx.strokeStyle='#4ade80'; ctx.lineWidth=2; 
    let y=getY(Date.now()); ctx.moveTo(x-speed,lastY); ctx.lineTo(x,y); ctx.stroke(); 
    lastY=y; x+=speed; if(x>=canvas.width){x=0;ctx.beginPath();} 
    requestAnimationFrame(draw); 
}

// 互動功能
function toggleTheme() { 
    const b = document.body;
    b.getAttribute('data-theme') === 'light' ? b.removeAttribute('data-theme') : b.setAttribute('data-theme', 'light');
}
function openModal() { document.getElementById('info-modal').style.display='flex'; }
function closeModal() { document.getElementById('info-modal').style.display='none'; }

function logout() {
    if(confirm("確定要登出系統嗎？")) {
        localStorage.removeItem('ecg_username');
        window.location.replace('login.html');
    }
}

function fill(id,arr){document.getElementById(id).innerHTML=arr?arr.map(i=>`<li>${i}</li>`).join(''):'';}
function setTab(id){
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    if(event) event.target.classList.add('active');
}

// 藥物與電擊
function giveDrug(d){
    const l=document.getElementById('med-log'); const i=document.createElement('div'); i.className='log-item';
    i.innerText=`💉 ${d}`; l.appendChild(i); setTimeout(()=>i.remove(),4000);
    if(d.includes('adenosine') && curKey==='psvt') { setTimeout(()=>{adenosineFx=150;setTimeout(()=>loadCase('nsr'),2000);},1000); }
}
function charge(){ if(!isCharging&&!isReady){ isCharging=true; document.getElementById('btn-charge').innerText="Charging..."; setTimeout(()=>{isCharging=false;isReady=true;document.getElementById('btn-charge').innerText="Charged";document.getElementById('btn-shock').disabled=false;document.getElementById('btn-shock').classList.add('ready');},2000); }}
function shock(){ if(isReady){ shockFx=20; document.getElementById('screen-flash').classList.add('flash-anim'); setTimeout(()=>document.getElementById('screen-flash').classList.remove('flash-anim'),200); if(ECG_DATABASE[curKey].shock) setTimeout(()=>loadCase('nsr'),1000); else if(curKey==='nsr') setTimeout(()=>loadCase('vf'),1000); resetDefib(); }}
function resetDefib(){ isReady=false;isCharging=false;document.getElementById('btn-charge').innerText="Charge";const s=document.getElementById('btn-shock');s.disabled=true;s.classList.remove('ready');}
function toggleNIBP(){
    const b=document.getElementById('btn-nibp'); 
    if(b.innerText==="Start"){ 
        b.innerText="Stop"; b.classList.add('active'); document.getElementById('val-sys').innerText="--";document.getElementById('val-dia').innerText="--"; 
        setTimeout(()=>{
            b.innerText="Start";b.classList.remove('active');
            document.getElementById('val-sys').innerText=ECG_DATABASE[curKey].sys;
            document.getElementById('val-dia').innerText=ECG_DATABASE[curKey].dia;
        },3000); 
    } else { 
        b.innerText="Start"; b.classList.remove('active'); 
    }
}

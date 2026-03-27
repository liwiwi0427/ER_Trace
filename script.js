const canvas = document.getElementById('ecg-canvas');
const ctx = canvas.getContext('2d');
let currentRhythm = "NORMAL";
let x = 0;
let points = [];
const speed = 2.5;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = 350;
}
window.onresize = resize;
resize();

// 核心：生成 ECG 波形的數學邏輯
function getWaveY() {
    const mid = canvas.height / 2;
    const cfg = RHYTHM_CONFIG[currentRhythm];
    const time = Date.now();
    
    // 根據不同類型返回波形高度
    if (currentRhythm === "ASYSTOLE") return mid + (Math.random() - 0.5) * 2;
    if (currentRhythm === "VF") return mid + (Math.random() - 0.5) * 60;
    
    // 正常波形組合 (簡化模型)
    let beatInterval = 60000 / cfg.bpm;
    let phase = (time % beatInterval) / beatInterval;
    
    if (phase < 0.1) return mid - Math.sin(phase * 10 * Math.PI) * 10; // P wave
    if (phase > 0.15 && phase < 0.2) return mid + 20; // Q
    if (phase >= 0.2 && phase < 0.25) return mid - 100; // R
    if (phase >= 0.25 && phase < 0.3) return mid + 40; // S
    if (phase > 0.4 && phase < 0.6) return mid - 15; // T
    
    return mid;
}

function animate() {
    const y = getWaveY();
    
    // 繪製線條
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, points[x] || y);
    x += speed;
    if (x > canvas.width) x = 0;
    
    // 擦除前方舊波形
    ctx.clearRect(x, 0, 50, canvas.height); 
    
    ctx.lineTo(x, y);
    points[x] = y;
    ctx.stroke();

    requestAnimationFrame(animate);
}

// 初始化按鈕
function init() {
    const rhythmList = document.getElementById('rhythm-list');
    Object.keys(RHYTHM_CONFIG).forEach(key => {
        const btn = document.createElement('button');
        btn.innerText = RHYTHM_CONFIG[key].name;
        btn.onclick = () => {
            currentRhythm = key;
            document.getElementById('rhythm-title').innerText = RHYTHM_CONFIG[key].name;
            document.getElementById('rhythm-desc').innerText = RHYTHM_CONFIG[key].description;
            document.getElementById('hr-value').innerText = RHYTHM_CONFIG[key].bpm;
        };
        rhythmList.appendChild(btn);
    });

    // 給藥邏輯範例
    const drugList = document.getElementById('drug-list');
    Object.keys(DRUG_CONFIG).forEach(key => {
        const btn = document.createElement('button');
        btn.innerText = DRUG_CONFIG[key].name;
        btn.onclick = () => {
            alert(`已給予 ${DRUG_CONFIG[key].name}，觀察病患反應...`);
            if (currentRhythm === "BRADY" && key === "atropine") {
                currentRhythm = "NORMAL"; // 模擬藥效轉復
            }
        };
        drugList.appendChild(btn);
    });
}

init();
animate();

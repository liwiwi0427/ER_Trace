const canvas = document.getElementById('ecgCanvas');
const ctx = canvas.getContext('2d');
let currentRhythm = "NORMAL";
let bpm = 72;
let x = 0;
let lastY = 150;

function initCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

// 繪製格線
function drawGrid() {
    const theme = document.documentElement.getAttribute('data-theme');
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color');
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 30) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 30) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }
}

// 核心波形算法
function getECGY() {
    const mid = canvas.height / 2;
    const time = Date.now();
    const cycle = (time % (60000 / bpm)) / (60000 / bpm);

    let y = 0;
    if (currentRhythm === "VF") return mid + (Math.random() - 0.5) * 80;
    if (currentRhythm === "ASYSTOLE") return mid + (Math.random() - 0.5) * 3;

    // P-QRS-T 邏輯
    if (cycle < 0.1) y = -Math.sin(cycle * 10 * Math.PI) * 10; 
    else if (cycle < 0.15) y = 0;
    else if (cycle < 0.18) y = 15; // Q
    else if (cycle < 0.22) y = -100; // R
    else if (cycle < 0.25) y = 40; // S
    else if (cycle < 0.4) y = 0;
    else if (cycle < 0.6) y = -20; // T
    
    return mid + y;
}

function render() {
    // 螢光尾跡效果：不使用 clearRect，而是覆蓋半透明層
    const theme = document.documentElement.getAttribute('data-theme');
    ctx.fillStyle = theme === 'paper' ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
    ctx.fillRect(x, 0, 10, canvas.height); 

    const nextY = getECGY();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-green');
    ctx.lineWidth = 3;
    ctx.shadowBlur = theme === 'paper' ? 0 : 10;
    ctx.shadowColor = ctx.strokeStyle;

    ctx.beginPath();
    ctx.moveTo(x, lastY);
    x += 3;
    ctx.lineTo(x, nextY);
    ctx.stroke();

    lastY = nextY;
    if (x > canvas.width) x = 0;

    requestAnimationFrame(render);
}

// 初始化按鈕與邏輯
function setupControls() {
    const fastGrid = document.getElementById('fast-rhythms');
    const lethalGrid = document.getElementById('lethal-rhythms');
    
    const rhythms = [
        { id: "NORMAL", name: "Normal", cat: "fast" },
        { id: "BRADY", name: "Bradycardia", cat: "lethal" },
        { id: "PSVT", name: "PSVT", cat: "fast" },
        { id: "AFIB", name: "A-Fib", cat: "fast" },
        { id: "VT", name: "VT", cat: "lethal" },
        { id: "VF", name: "VF", cat: "lethal" },
        { id: "ASYSTOLE", name: "Asystole", cat: "lethal" }
    ];

    rhythms.forEach(r => {
        const btn = document.createElement('button');
        btn.innerText = r.name;
        btn.onclick = () => {
            currentRhythm = r.id;
            if(r.id === "BRADY") bpm = 40;
            else if(r.id === "PSVT") bpm = 170;
            else bpm = 72;
            document.getElementById('hr-num').innerText = bpm;
            document.getElementById('rhythm-detail').innerText = r.name;
        };
        if(r.cat === "fast") fastGrid.appendChild(btn);
        else lethalGrid.appendChild(btn);
    });
}

// 給藥模擬
const drugs = [
    { name: "Atropine", effect: () => { bpm += 20; } },
    { name: "Adenosine", effect: () => { 
        const oldBpm = bpm; bpm = 1; 
        setTimeout(() => { bpm = oldBpm; }, 3000); 
    }},
    { name: "Amiodarone", effect: () => { currentRhythm = "NORMAL"; bpm = 72; } }
];

const drugGrid = document.getElementById('drug-actions');
drugs.forEach(d => {
    const btn = document.createElement('button');
    btn.className = "btn-drug";
    btn.innerText = d.name;
    btn.onclick = () => {
        d.effect();
        document.getElementById('hr-num').innerText = bpm;
    };
    drugGrid.appendChild(btn);
});

window.onload = () => {
    initCanvas();
    setupControls();
    render();
};

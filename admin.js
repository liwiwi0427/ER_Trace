function generateCode() {
    // 1. 取得基本資料
    const key = document.getElementById('id-key').value.trim() || 'unknown_id';
    const title = document.getElementById('id-title').value.trim();
    const tag = document.getElementById('id-tag').value.trim();
    const color = document.getElementById('id-color').value;
    const isShock = document.getElementById('id-shock').checked;
    const visual = document.getElementById('id-vis').value;

    // 2. 取得生命徵象 (自動處理型別)
    const hr = getValue('v-hr', 80, true);
    const sys = getValue('v-sys', '120');
    const dia = getValue('v-dia', '80');
    const spo2 = getValue('v-spo2', 98); // SpO2 可為 ?
    const rr = getValue('v-rr', 16, true);
    const temp = getValue('v-temp', 37.0);

    // 3. 處理文字區塊 (Textarea to Array)
    // 重點功能：依據換行 (\n) 切割，去除空白行
    const cri = parseList('txt-cri');
    const cause = parseList('txt-cause');
    const rx = parseList('txt-rx');
    const nur = parseList('txt-nur');
    
    // Patho 只是單純字串
    let patho = document.getElementById('txt-patho').value.trim();
    patho = patho.replace(/"/g, '\\"'); // 跳脫引號防止錯誤

    // 4. 組裝 JSON 模板
    // 注意：這邊手動拼湊字串是為了讓縮排更漂亮，方便你複製到 data.js
    let output = `    '${key}': {
        t: "${title}", 
        b: "${tag}", 
        c: "${color}", 
        shock: ${isShock}, 
        hr: ${hr}, sys: "${sys}", dia: "${dia}", spo2: "${spo2}", rr: ${rr}, temp: ${temp},
        vis: '${visual}', 
        cri: [
${formatArrayLines(cri)}
        ],
        patho: "${patho}",
        cause: [
${formatArrayLines(cause)}
        ], 
        rx: [
${formatArrayLines(rx)}
        ],
        n: [
${formatArrayLines(nur)}
        ]
    },`;

    // 顯示結果
    document.getElementById('output-box').textContent = output;
}

// Helper: 取得 Input 值，支援數字轉型
function getValue(id, def, isNum=false) {
    const v = document.getElementById(id).value;
    if(!v) return def;
    // 如果輸入 --- 或 ? 視為字串
    if(v === '---' || v === '?') return `"${v}"`;
    return isNum ? Number(v) : `"${v}"`; // sys/dia 常保留為字串以防 "---"
}

// Helper: 解析 Textarea 成為陣列
function parseList(id) {
    const raw = document.getElementById(id).value;
    if(!raw) return [];
    return raw.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0);
}

// Helper: 將陣列轉為美觀的縮排程式碼
function formatArrayLines(arr) {
    if(arr.length === 0) return '';
    // 加上引號並加上逗點與換行
    return arr.map(item => `            "${item.replace(/"/g, '\\"')}"`).join(',\n');
}

// 複製到剪貼簿
function copyToClip() {
    const txt = document.getElementById('output-box').textContent;
    navigator.clipboard.writeText(txt).then(() => {
        alert("已複製到剪貼簿！請打開 data.js 並貼入。");
    });
}

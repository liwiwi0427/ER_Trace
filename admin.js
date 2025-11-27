function gen() {
    const k = document.getElementById('a-key').value;
    const t = document.getElementById('a-title').value;
    const tg = document.getElementById('a-tag').value;
    const col = document.getElementById('a-color').value;
    const shock = document.getElementById('a-shock').checked;
    
    if(!k || !t) {
        alert("請至少輸入代號 (Key) 與標題 (Title)！");
        return;
    }

    const code = `
    '${k}': { 
        t: "${t}", 
        b: "${tg}", 
        c: "${col}", 
        shock: ${shock}, 
        hr: 80, sys: 120, dia: 80, spo2: 98, rr: 16, temp: 37.0, 
        vis: 'nsr', 
        cri: ["特徵 1", "特徵 2"], 
        patho: "請輸入病理機轉...", 
        cause: ["原因 A", "原因 B"], 
        rx: ["治療 A", "治療 B"], 
        n: ["護理重點 A"] 
    },`;
    
    document.getElementById('output').innerText = code;
    
    // 自動選取文字方便複製
    const range = document.createRange();
    range.selectNode(document.getElementById('output'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
}

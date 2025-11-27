function generate() {
    const key = document.getElementById('a-key').value;
    const t = document.getElementById('a-title').value;
    // ... get others
    
    // Template
    const json = `
    '${key}': { 
        t: "${t}", b: "Custom", c: "#9c27b0", 
        shock: false, hr: 80, sys: 120, dia: 80, 
        vis: 'nsr', 
        cri: ["Criterion 1"], patho: "Desc...", 
        cause: ["Cause 1"], rx: ["Treat 1"] 
    },`;
    
    document.getElementById('output').innerText = json;
    alert("Copy the green text and paste it into data.js!");
}
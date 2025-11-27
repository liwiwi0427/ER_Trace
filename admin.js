function gen() {
    const k = document.getElementById('a-key').value;
    const t = document.getElementById('a-title').value;
    const tg = document.getElementById('a-tag').value;
    
    const code = `'${k}': { t:"${t}", b:"${tg}", c:"#999", shock:false, hr:80, sys:120, dia:80, spo2:98, rr:16, temp:37.0, vis:'nsr', cri:["Feature 1"], patho:"Patho...", cause:["C1"], rx:["Rx1"], n:["Note 1"] },`;
    
    document.getElementById('output').innerText = code;
}

/* 
   ECG Pro 資料庫 
   格式說明：
   key: { 
       t: "標題", 
       b: "標籤文字", 
       c: "標籤顏色", 
       shock: 是否可電擊(true/false), 
       hr: 心跳, sys: 收縮壓, dia: 舒張壓, spo2: 血氧, rr: 呼吸, temp: 體溫,
       cri: ["特徵1", "特徵2"...], 
       patho: "病理機轉", 
       cause: ["成因1", "成因2"...], 
       rx: ["治療1", "治療2"...], 
       n: ["護理措施1", "護理措施2"...], 
       vis: '對應的動畫類型 (nsr, psvt, afib, vt, vf, tdp, block-mild, block-mod, block-comp, pea, asystole)'
   }
*/

const ECG_DATABASE = {
    'nsr': { 
        t:"NSR（正常竇性心律）", b:"Normal", c:"#4caf50", shock:false, 
        hr:72, sys:120, dia:80, spo2:98, rr:16, temp:37.0, 
        cri:["心率：60~100 bpm", "節律規則", "P波清楚，P-R Interval（P-R間隔）：120~200 ms"], 
        patho:"電訊號由SA Node（竇房結）開始，經AV Node（房室結）傳至心室（Ventricle），路徑完整。", 
        cause:["健康心臟", "休息狀態"], 
        rx:["無需特殊治療"], 
        n:["持續觀察"], 
        vis:'nsr' 
    },
    'sb': { 
        t:"Sinus Bradycardia（竇性緩脈）", b:"Brady", c:"#4caf50", shock:false, 
        hr:45, sys:95, dia:60, spo2:96, rr:14, temp:36.8, 
        cri:["心率：<60 bpm", "P、QRS、T波：波形正常"], 
        patho:"SA node（竇房結）功能異常，導致其放電功能減弱；或SA node（竇房結）發出的衝動被阻擋，造成心率過慢但傳導路徑正常。", 
        cause:["生理性：睡眠時或運動員", "病理性：迷走神經亢進、電解質不平衡", "藥物：β-blocker（乙型交感神經接受體阻斷劑）"], 
        rx:["O.B.S.（觀察）", "視情況給予Atropine", "必要時給予TCP（經皮心律調節）使用、藥物：Dopamine或是Epinephrine"], 
        n:["Monitoring V/S & Conscious（監測生命徵象與意識）"], 
        vis:'nsr' 
    },
    'psvt': { 
        t:"PSVT（陣發性室上性心搏過速）", b:"Tachy", c:"#ff9800", shock:false, 
        hr:187, sys:90, dia:60, spo2:94, rr:24, temp:37.2, 
        cri:["心率：150~250 bpm", "QRS波狹窄", "P波不明顯"], 
        patho:"心臟傳導系統出現異常，導致電訊號在心房或房室結處產生異常的迴路，引起心跳突然快速飆升；AV Node（房室結）折返形成房室結折返性心動過速（AVNRT）或房室折返性心動過速（AVRT）", 
        cause:["誘發因子：壓力、焦慮、咖啡因、脫水等", "先天性：WPW 症候群"], 
        rx:["迷走神經刺激法", "Adenosine IVP（快速的Push）、CCB（鈣離子通道阻斷劑）或β-blocker（乙型交感神經接受體阻斷劑）"], 
        n:["Monitoring V/S & Conscious（監測生命徵象與意識）", "給予氧氣使用", "IV接3-way", "施作12-lead E.K.G.", "準備DC Shock（電擊器）"], 
        vis:'psvt' 
    },
    'afib': { 
        t:"A-Fib（心房顫動）", b:"異常", c:"#ff9800", shock:false, 
        hr:130, sys:110, dia:70, spo2:95, rr:20, temp:36.9, 
        cri:["Irregularly Irregular（心率絕對不規則）", "P波消失（由F波代之）", "F波出現", "R-R Interval（R-R間隔）"], 
        patho:"心房內電流失常、心房無效收縮", 
        cause:["心臟結構異常", "迷走神經興奮", "心臟手術術後"], 
        rx:["Drug for Rate Control（心速控制用藥）：Digoxin（毛地黃）、CCB（鈣離子通道阻斷劑）或β-blocker（乙型交感神經接受體阻斷劑）", "Drug for Rhythm Control（心率控制用藥）：Amiodarone、Propafenone或Dronedarone", "Cardioversion（同步電擊）：200 J"], 
        n:["Monitoring V/S & Conscious（監測生命徵象與意識）", "給予氧氣使用", "準備插管用物", "準備抽痰用物", "準備DC Shock（電擊器）"], 
        vis:'afib' 
    },
    'afl': { 
        t:"A-Flutter（心房撲動）", b:"Tachy", c:"#ff9800", shock:false, 
        hr:150, sys:110, dia:70, spo2:95, rr:18, temp:37.0, 
        cri:["Flutter Wave（鋸齒狀撲動波）", "P波消失（由F波代之）", "快且規則的心率", "規則的心房與心室率", "規則的房室傳導比"], 
        patho:"大迴旋波、心房速波與AV Node（房室結）傳導異常", 
        cause:["誘發因子：壓力、焦慮、咖啡因、脫水等", "心臟結構異常", "心臟手術術後", "COPD（慢性阻塞性肺病）"], 
        rx:["Drug for Rate Control（心速控制用藥）：Digoxin（毛地黃）、CCB（鈣離子通道阻斷劑）或β-blocker（乙型交感神經接受體阻斷劑）", "Drug for Rhythm Control（心率控制用藥）：Amiodarone、Propafenone或Dronedarone", "Cardioversion（同步電擊）：50~ J"],  
		n:["Monitoring V/S & Conscious（監測生命徵象與意識）", "給予氧氣使用", "準備插管用物", "準備抽痰用物", "準備DC Shock（電擊器）"], 
        vis:'psvt' 
    },
    'pvc': { 
        t:"PVC (心室早期收縮)", b:"Ectopic", c:"#ff9800", shock:false, 
        hr:"Irreg", sys:115, dia:75, spo2:97, rr:16, temp:37.0, 
        cri:["寬大變形 QRS", "提早出現", "代償性暫停"], 
        patho:"心室異位點提早放電。", 
        cause:["低血鉀/鎂", "缺氧", "咖啡因"], 
        rx:["觀察", "治療病因"], 
        n:["監測頻率"], 
        vis:'nsr' 
    },
    'vt_pulse': { 
        t:"VT with Pulse (心室頻脈)", b:"Emergency", c:"#f44336", shock:false, 
        hr:170, sys:90, dia:50, spo2:92, rr:26, temp:37.0, 
        cri:["寬大 QRS", "規則快速", "單型性"], 
        patho:"心室折返或異位點主導。充血不足。", 
        cause:["心肌梗塞", "電解質異常"], 
        rx:["Amiodarone", "同步整流"], 
        n:["摸脈搏！", "12導程"], 
        vis:'vt' 
    },
    'vt_pulseless': { 
        t:"pVT (無脈性VT)", b:"Arrest", c:"#f44336", shock:true, 
        hr:180, sys:"---", dia:"---", spo2:"?", rr:0, temp:36.5, 
        cri:["寬大 QRS", "無脈搏"], 
        patho:"同 VT 但心輸出量為零。", 
        cause:["H's & T's"], 
        rx:["Defib 200J", "CPR"], 
        n:["Code Blue"], 
        vis:'vt' 
    },
    'vf': { 
        t:"VF (心室顫動)", b:"Arrest", c:"#f44336", shock:true, 
        hr:"---", sys:"---", dia:"---", spo2:"?", rr:0, temp:36.5, 
        cri:["波形混亂", "無 QRS", "無脈搏"], 
        patho:"心室肌纖維混亂顫動，無機械收縮。", 
        cause:["急性 MI", "R-on-T"], 
        rx:["立即電擊", "CPR"], 
        n:["Clear for Shock"], 
        vis:'vf' 
    },
    'tdp': { 
        t:"Torsades de Pointes", b:"Arrest", c:"#f44336", shock:true, 
        hr:220, sys:"---", dia:"---", spo2:"?", rr:0, temp:36.5, 
        cri:["多型性 VT", "波形扭轉"], 
        patho:"QT 延長導致 R-on-T 現象。", 
        cause:["低血鎂", "藥物副作用"], 
        rx:["Magnesium", "Defib"], 
        n:["備鎂離子"], 
        vis:'tdp' 
    },
    'avb1': { 
        t:"1st Degree AVB (一度房室阻滯)", b:"Block", c:"#9c27b0", shock:false, 
        hr:70, sys:118, dia:76, spo2:98, rr:16, temp:37.0, 
        cri:["PR Interval > 0.20s", "Rhythm 規則"], 
        patho:"房室結傳導延遲。", 
        cause:["藥物", "迷走神經"], 
        rx:["觀察"], 
        n:["監測"], 
        vis:'block-mild' 
    },
    'avb2t1': { 
        t:"2nd Degree Type I (二度一)", b:"Block", c:"#9c27b0", shock:false, 
        hr:60, sys:110, dia:70, spo2:97, rr:16, temp:37.0, 
        cri:["PR 漸長後漏跳 (Wenckebach)"], 
        patho:"房室結疲勞現象。", 
        cause:["下壁 MI", "中毒"], 
        rx:["觀察"], 
        n:["備藥"], 
        vis:'block-mod' 
    },
    'avb2t2': { 
        t:"2nd Degree Type II (二度二)", b:"Danger", c:"#9c27b0", shock:false, 
        hr:50, sys:100, dia:60, spo2:95, rr:18, temp:36.8, 
        cri:["PR 固定", "突然漏跳 QRS"], 
        patho:"希氏束下方病變。", 
        cause:["前壁 MI"], 
        rx:["TCP Standby", "PPM"], 
        n:["貼 Pacing Pads"], 
        vis:'block-mod' 
    },
    'avb3': { 
        t:"3rd Degree AVB (完全房室阻滯)", b:"Critical", c:"#9c27b0", shock:false, 
        hr:35, sys:80, dia:40, spo2:90, rr:12, temp:36.5, 
        cri:["房室分離", "P與QRS互不相干"], 
        patho:"房室傳導完全中斷。", 
        cause:["MI", "纖維化"], 
        rx:["TCP", "PPM"], 
        n:["防跌倒", "TCP"], 
        vis:'block-comp' 
    },
    'pea': { 
        t:"PEA (無脈性電活動)", b:"Arrest", c:"#f44336", shock:false, 
        hr:70, sys:"---", dia:"---", spo2:"?", rr:0, temp:36.5, 
        cri:["ECG 有波形", "<strong>但無脈搏</strong>"], 
        patho:"電氣正常但機械衰竭。", 
        cause:["5H5T"], 
        rx:["CPR", "Epi"], 
        n:["摸脈搏"], 
        vis:'pea' 
    },
    'asystole': { 
        t:"Asystole (心律停止)", b:"Arrest", c:"#f44336", shock:false, 
        hr:0, sys:"---", dia:"---", spo2:"?", rr:0, temp:36.0, 
        cri:["一直線"], 
        patho:"電氣活動停止。", 
        cause:["缺氧末期"], 
        rx:["CPR", "Epi", "不可電擊"], 
        n:["確認導程", "壓胸"], 
        vis:'asystole' 
    }
};
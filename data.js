const RHYTHM_CONFIG = {
    "NORMAL": { name: "Normal Sinus Rhythm", bpm: 72, type: "sinus", description: "正常的竇性心律，P-QRS-T 完整。" },
    "BRADY": { name: "Sinus Bradycardia", bpm: 40, type: "sinus", description: "竇性緩脈，HR < 60。" },
    "PSVT": { name: "PSVT", bpm: 180, type: "fast_narrow", description: "窄 QRS 波，看不見 P 波。" },
    "AFIB": { name: "A-Fib", bpm: 110, type: "irregular", description: "絕對不規則的 R-R 間距，無 P 波。" },
    "AFLUTTER": { name: "A-Flutter", bpm: 100, type: "sawtooth", description: "鋸齒狀 F 波。" },
    "VT": { name: "VT (Ventricular Tachycardia)", bpm: 160, type: "wide_tachy", description: "寬大 QRS 波，心室頻脈。" },
    "VF": { name: "VF (Ventricular Fibrillation)", bpm: 0, type: "chaotic", description: "混亂的顫動，無有效收縮。" },
    "ASYSTOLE": { name: "Asystole", bpm: 0, type: "flat", description: "心搏停止，一條直線。" },
    "TORSADES": { name: "Torsades de Pointes", bpm: 200, type: "twisting", description: "扭轉性心室頻脈。" }
};

const DRUG_CONFIG = {
    "atropine": { name: "Atropine", effect: "speed_up", target: ["BRADY"] },
    "amiodarone": { name: "Amiodarone", effect: "stabilize", target: ["VT", "VF"] },
    "bosmin": { name: "Bosmin (Epi)", effect: "restart", target: ["ASYSTOLE", "PEA"] },
    "adenosine": { name: "Adenosine", effect: "reset", target: ["PSVT"] }
};

/* ========================================================
   THEME MANAGER - 獨立主題管理系統
   功能：管理 CSS 變數與切換邏輯
   ======================================================== */

const ThemeManager = {
    currentTheme: localStorage.getItem('ecg_theme') || 'dark',

    init() {
        this.applyTheme(this.currentTheme);
        // 如果頁面上有選單，同步選單狀態
        const selector = document.getElementById('theme-select');
        if(selector) selector.value = this.currentTheme;
    },

    setTheme(themeName) {
        this.currentTheme = themeName;
        localStorage.setItem('ecg_theme', themeName);
        this.applyTheme(themeName);
    },

    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
    }
};

// 立即執行初始化
document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
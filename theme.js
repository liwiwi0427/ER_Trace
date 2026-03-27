const themeToggle = document.getElementById('theme-toggle');
themeToggle.onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'monitor' ? 'paper' : 'monitor';
    document.documentElement.setAttribute('data-theme', next);
};

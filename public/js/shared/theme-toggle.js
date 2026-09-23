document.addEventListener('DOMContentLoaded', function() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const storedTheme = localStorage.getItem('theme');
    
    if (storedTheme) {
        document.documentElement.setAttribute('data-theme', storedTheme);
        if (themeToggleBtn) {
            updateToggleButtonIcon(storedTheme);
        }
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggleBtn) {
            updateToggleButtonIcon('dark');
        }
    }
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
    
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        if (themeToggleBtn) {
            updateToggleButtonIcon(newTheme);
        }
    }
    
    function updateToggleButtonIcon(theme) {
        if (!themeToggleBtn) return;
        // Use SVGRegistry if available, otherwise fall back to minimal inline SVG
        const moonIcon = (typeof SVGRegistry !== 'undefined')
            ? SVGRegistry.get('moon-toggle')
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/></svg>`;
        const sunIcon  = (typeof SVGRegistry !== 'undefined')
            ? SVGRegistry.get('sun-toggle')
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="white"><path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/></svg>`;

        if (theme === 'dark') {
            themeToggleBtn.innerHTML = sunIcon;
            themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
        } else {
            themeToggleBtn.innerHTML = moonIcon;
            themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
        }
    }
});

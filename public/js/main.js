document.addEventListener('DOMContentLoaded', function() {
    const header = document.querySelector('.header');
    
    function updateHeaderScroll() {
        if (window.scrollY > 20) {
            header.classList.add('header--scrolled');
        } else {
            header.classList.remove('header--scrolled');
        }
    }
    
    window.addEventListener('scroll', updateHeaderScroll);
    updateHeaderScroll();
    
    // AI Toggle - Only slider is clickable
    const aiToggleLabel = document.querySelector('.ai-search-toggle');
    const aiToggleSlider = document.querySelector('.ai-toggle-slider');
    const aiToggleInput = document.querySelector('.ai-toggle-input');
    
    if (aiToggleLabel && aiToggleSlider && aiToggleInput) {
        // Prevent label from toggling the checkbox
        aiToggleLabel.addEventListener('click', function(e) {
            e.preventDefault();
        });
        
        // Only slider can toggle the checkbox
        aiToggleSlider.addEventListener('click', function(e) {
            e.stopPropagation();
            aiToggleInput.checked = !aiToggleInput.checked;
            
            // Trigger change event for any listeners
            const event = new Event('change', { bubbles: true });
            aiToggleInput.dispatchEvent(event);
        });
    }

    // Detect if this is a page refresh/reload
    const isReload = (window.performance && window.performance.navigation && window.performance.navigation.type === 1) || 
                     (window.performance && window.performance.getEntriesByType('navigation').length > 0 && window.performance.getEntriesByType('navigation')[0].type === 'reload');
                     
    if (isReload) {
        sessionStorage.removeItem('selectedProjectForViewDetails');
    }
    
    // Global active link setter for all navigation links
    const currentPath = window.location.pathname;
    const allNavLinks = document.querySelectorAll('.nav-link');
    
    const getBaseName = (path) => {
        let name = path.split('/').pop() || '';
        return name.split('?')[0].split('#')[0].replace('.html', '');
    };
    
    const currentBaseName = getBaseName(currentPath) || 'index';
    
    allNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        
        const linkBaseName = getBaseName(href);
        
        if (currentBaseName === linkBaseName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
});

/**
 * Scroll-Aware Header System
 * - Secondary header starts inside main header
 * - On scroll, main header hides proportionally to scroll amount
 * - Secondary header becomes sticky at top
 */

(function() {
    let lastScrollY = 0;
    let mainHeaderTranslateY = 0;
    const HEADER_HEIGHT = 72; // Approximate main header height
    const SCROLL_THRESHOLD = 20; // When to detach secondary header
    
    function initScrollAwareHeader() {
        const headerWrapper = document.querySelector('.header-wrapper');
        const header = document.querySelector('.header');
        const secondaryHeader = document.querySelector('.secondary-header');
        
        if (!headerWrapper || !header || !secondaryHeader) {
            console.warn('Header elements not found');
            return;
        }
        
        function handleScroll() {
            const currentScrollY = window.scrollY || window.pageYOffset;
            const scrollDelta = currentScrollY - lastScrollY;
            
            if (currentScrollY > SCROLL_THRESHOLD) {
                // User has scrolled past threshold
                
                // Detach secondary header immediately when scrolling past threshold
                if (!secondaryHeader.classList.contains('secondary-sticky-top')) {
                    secondaryHeader.classList.remove('secondary-inside-header');
                    secondaryHeader.classList.add('secondary-sticky-top');
                }
                
                // Calculate proportional movement for main header ONLY
                mainHeaderTranslateY = mainHeaderTranslateY - scrollDelta;
                
                // Clamp the translation
                mainHeaderTranslateY = Math.max(-HEADER_HEIGHT, Math.min(0, mainHeaderTranslateY));
                
                // Apply transform ONLY to main header, not the wrapper
                header.style.transform = `translateY(${mainHeaderTranslateY}px)`;
                
            } else {
                // Near top of page
                mainHeaderTranslateY = 0;
                header.style.transform = `translateY(0)`;
                
                // Reattach secondary header to main header
                secondaryHeader.classList.add('secondary-inside-header');
                secondaryHeader.classList.remove('secondary-sticky-top');
            }
            
            lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
        }
        
        // Throttle scroll event for better performance
        let ticking = false;
        function onScroll() {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }
        
        window.addEventListener('scroll', onScroll, { passive: true });
        
        // Initial check
        handleScroll();
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScrollAwareHeader);
    } else {
        initScrollAwareHeader();
    }
})();

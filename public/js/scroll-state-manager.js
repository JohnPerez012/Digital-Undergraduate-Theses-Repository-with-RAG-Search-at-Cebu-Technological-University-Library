/**
 * Per-View Scroll State Manager
 * 
 * Manages independent scroll positions for each view in the application.
 * Each view maintains its own scroll state that is saved, preserved, and restored independently.
 * 
 * Features:
 * - Independent scroll storage per view
 * - Automatic save on view change
 * - Automatic restore on view activation with smooth scroll animation
 * - Works with different DOM structures and content lengths
 * - Prevents cross-view scroll interference
 */

const ScrollStateManager = (function() {
    // Storage for scroll positions (per view)
    const scrollStates = {
        'index': 0,           // Home view
        'project-detail': 0,  // Project details view
        'ai-chatbot': 0       // AI Chatbot view
    };
    
    let currentActiveView = null;
    let isRestoring = false;
    
    /**
     * Save the current scroll position for a specific view
     * @param {string} viewId - The view identifier (e.g., 'index', 'project-detail', 'ai-chatbot')
     */
    function saveScrollPosition(viewId) {
        if (!viewId || isRestoring) return;
        
        const scrollY = window.scrollY || window.pageYOffset;
        scrollStates[viewId] = scrollY;
        
        console.log(`[ScrollStateManager] Saved scroll for "${viewId}": ${scrollY}px`);
    }
    
    /**
     * Restore the saved scroll position for a specific view with smooth animation
     * Fast at first, smooth at last (ease-in-out)
     * @param {string} viewId - The view identifier to restore
     */
    function restoreScrollPosition(viewId) {
        if (!viewId) return;
        
        const savedScroll = scrollStates[viewId] || 0;
        const currentScroll = window.scrollY || window.pageYOffset;
        
        console.log(`[ScrollStateManager] Restoring scroll for "${viewId}": ${savedScroll}px (from ${currentScroll}px)`);
        
        // Set flag to prevent saving during restoration
        isRestoring = true;
        
        const scrollDistance = Math.abs(savedScroll - currentScroll);
        const duration = Math.min(800, Math.max(400, scrollDistance * 0.3)); // Dynamic duration
        
        // Custom ease-in-out animation: fast at start, smooth at end
        const startTime = performance.now();
        const startScroll = currentScroll;
        
        function easeInOutCubic(t) {
            // Fast at first (ease-in), smooth at last (ease-out)
            return t < 0.5
                ? 4 * t * t * t // Fast acceleration at start
                : 1 - Math.pow(-2 * t + 2, 3) / 2; // Smooth deceleration at end
        }
        
        function animateScroll(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
                
            // Apply easing function
            const easedProgress = easeInOutCubic(progress);
            
            // Calculate current position
            const currentPosition = startScroll + (savedScroll - startScroll) * easedProgress;
            
            // Scroll to position
            window.scrollTo(0, currentPosition);
            
            // Continue animation if not complete
            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            } else {
                // Animation complete
                isRestoring = false;
                console.log(`[ScrollStateManager] Scroll animation complete`);
            }
        }
        
        // Start animation
        requestAnimationFrame(animateScroll);
    }
    
    /**
     * Handle view switch
     * @param {string} fromViewId - The view we're leaving
     * @param {string} toViewId - The view we're entering
     */
    function handleViewSwitch(fromViewId, toViewId) {
        console.log(`[ScrollStateManager] View switch: "${fromViewId}" → "${toViewId}"`);
        
        // Save scroll position of the view we're leaving
        if (fromViewId) {
            saveScrollPosition(fromViewId);
        }
        
        // Update current active view
        currentActiveView = toViewId;
        
        // Restore scroll position of the view we're entering
        if (toViewId) {
            // Small delay to ensure view is fully rendered before scrolling
            setTimeout(() => {
                restoreScrollPosition(toViewId);
            }, 100);
        }
    }
    
    /**
     * Get the current active view ID
     * @returns {string|null} The ID of the currently active view
     */
    function getCurrentActiveView() {
        // Try to find active view by checking for .active class
        const activeView = document.querySelector('.view-mode-container.active');
        
        if (activeView) {
            const viewId = activeView.id;
            
            // Map view container IDs to our view identifiers
            if (viewId === 'home-view') return 'index';
            if (viewId === 'details-view') return 'project-detail';
            if (viewId === 'chatbot-view') return 'ai-chatbot';
        }
        
        return null;
    }
    
    /**
     * Initialize scroll state manager
     */
    function init() {
        console.log('[ScrollStateManager] Initializing...');
        
        // Detect initial active view
        currentActiveView = getCurrentActiveView();
        
        if (currentActiveView) {
            console.log(`[ScrollStateManager] Initial view: "${currentActiveView}"`);
        }
        
        // Auto-save scroll position periodically for current view
        let scrollSaveTimeout;
        window.addEventListener('scroll', () => {
            if (isRestoring) return;
            
            clearTimeout(scrollSaveTimeout);
            scrollSaveTimeout = setTimeout(() => {
                const activeView = getCurrentActiveView();
                if (activeView) {
                    saveScrollPosition(activeView);
                }
            }, 150); // Debounce scroll saves
        }, { passive: true });
        
        // Save scroll before page unload
        window.addEventListener('beforeunload', () => {
            const activeView = getCurrentActiveView();
            if (activeView) {
                saveScrollPosition(activeView);
            }
        });
        
        console.log('[ScrollStateManager] Initialized successfully');
    }
    
    /**
     * Get all saved scroll states (for debugging)
     */
    function getScrollStates() {
        return { ...scrollStates };
    }
    
    /**
     * Reset all scroll states
     */
    function resetAllScrollStates() {
        Object.keys(scrollStates).forEach(key => {
            scrollStates[key] = 0;
        });
        console.log('[ScrollStateManager] All scroll states reset');
    }
    
    /**
     * Reset scroll state for a specific view
     * @param {string} viewId - The view to reset
     */
    function resetScrollState(viewId) {
        if (scrollStates.hasOwnProperty(viewId)) {
            scrollStates[viewId] = 0;
            console.log(`[ScrollStateManager] Reset scroll state for "${viewId}"`);
        }
    }
    
    // Public API
    return {
        init,
        handleViewSwitch,
        saveScrollPosition,
        restoreScrollPosition,
        getCurrentActiveView,
        getScrollStates,
        resetAllScrollStates,
        resetScrollState
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ScrollStateManager.init();
    });
} else {
    ScrollStateManager.init();
}

// Export for use in other modules
window.ScrollStateManager = ScrollStateManager;

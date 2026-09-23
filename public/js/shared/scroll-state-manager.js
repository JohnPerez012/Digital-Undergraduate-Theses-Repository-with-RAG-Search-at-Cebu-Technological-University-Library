/**
 * Per-View Scroll State Manager
 * 
 * Manages independent scroll positions for each view in the application.
 * Each view maintains its own scroll state that is saved, preserved, and restored
 * seamlessly without layout conflicts or jarring delays.
 * 
 * Features:
 * - Dynamic scroll storage supporting any view identifier
 * - Zero-conflict synchronization with SmoothScroll (window.smoothScroller)
 * - Lightweight, high-performance scroll tracking without redundant DOM querying
 * - Safe restoration when switching between search, project details, and chatbot
 */

const ScrollStateManager = (function() {
    "use strict";

    // Dynamic storage for scroll positions per view ID
    const scrollStates = new Map();
    let currentActiveView = null;
    let isRestoring = false;

    /**
     * Resolve the current view ID from DOM if not explicitly set
     */
    function resolveActiveViewId() {
        if (currentActiveView) return currentActiveView;
        const activeContainer = document.querySelector('.view-mode-container.active');
        if (activeContainer && activeContainer.id) {
            if (activeContainer.id === 'home-view') return 'index';
            if (activeContainer.id === 'details-view') return 'project-detail';
            if (activeContainer.id === 'chatbot-view') return 'ai-chatbot';
            return activeContainer.id;
        }
        return 'index';
    }

    /**
     * Save the current scroll position for a specific view
     * @param {string} [viewId] - Optional view identifier (defaults to active view)
     */
    function saveScrollPosition(viewId) {
        if (isRestoring) return;
        const targetView = viewId || resolveActiveViewId();
        if (!targetView) return;

        const scrollY = Math.max(0, window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0);
        scrollStates.set(targetView, scrollY);
    }

    /**
     * Restore the saved scroll position for a specific view
     * @param {string} viewId - The view identifier to restore
     * @param {boolean} [smooth=false] - Whether to use smooth scrolling
     */
    function restoreScrollPosition(viewId, smooth = false) {
        if (!viewId) return;

        const savedScroll = scrollStates.get(viewId) || 0;
        isRestoring = true;

        if (smooth && window.smoothScroller && typeof window.smoothScroller.scrollTo === 'function') {
            window.smoothScroller.scrollTo(savedScroll);
            setTimeout(() => { isRestoring = false; }, 300);
        } else {
            // Instant scroll to prevent visual jumping/sliding during view transition
            window.scrollTo(0, savedScroll);

            // Synchronize SmoothScroll internal state if available
            if (window.smoothScroller) {
                window.smoothScroller.currentY = savedScroll;
                window.smoothScroller.targetY = savedScroll;
            }

            // Allow DOM to settle before re-enabling scroll saves
            requestAnimationFrame(() => {
                isRestoring = false;
            });
        }
    }

    /**
     * Handle view switch: saves previous view's position and restores target view
     * @param {string} fromViewId - The view we are leaving
     * @param {string} toViewId - The view we are entering
     */
    function handleViewSwitch(fromViewId, toViewId) {
        if (fromViewId) {
            saveScrollPosition(fromViewId);
        }

        currentActiveView = toViewId;

        if (toViewId) {
            // Execute on next frame to ensure the new view container is displayed in the DOM
            requestAnimationFrame(() => {
                restoreScrollPosition(toViewId);
            });
        }
    }

    /**
     * Explicitly set the active view identifier
     * @param {string} viewId
     */
    function setActiveView(viewId) {
        currentActiveView = viewId;
    }

    /**
     * Reset saved scroll position for a specific view or all views
     * @param {string} [viewId] - Optional view to reset; if omitted, resets all
     */
    function reset(viewId) {
        if (viewId) {
            scrollStates.delete(viewId);
        } else {
            scrollStates.clear();
        }
    }

    /**
     * Initialize listeners
     */
    function init() {
        currentActiveView = resolveActiveViewId();

        // Passive scroll listener to keep the active view's position up-to-date
        let scrollTimer = null;
        window.addEventListener('scroll', () => {
            if (isRestoring) return;
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                if (!isRestoring && currentActiveView) {
                    saveScrollPosition(currentActiveView);
                }
            }, 100);
        }, { passive: true });

        // Save on unload
        window.addEventListener('beforeunload', () => {
            if (currentActiveView) {
                saveScrollPosition(currentActiveView);
            }
        });
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        handleViewSwitch,
        saveScrollPosition,
        restoreScrollPosition,
        setActiveView,
        getCurrentActiveView: resolveActiveViewId,
        reset,
        // Backward compatibility
        resetScrollState: reset,
        resetAllScrollStates: () => reset()
    };
})();

// Export globally
window.ScrollStateManager = ScrollStateManager;

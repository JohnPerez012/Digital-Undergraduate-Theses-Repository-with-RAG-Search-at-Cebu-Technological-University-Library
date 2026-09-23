/**
 * ==========================================================================
 * TEXT PROTECTION INDICATION MODULE
 * RE-CAPS (Cebu Technological University Library Capstone Repository)
 *
 * Explains to users why highlighting/selection and copying are restricted on
 * academic research titles, abstracts, citations, and project bodies in
 * compliance with:
 *   1. Republic Act 10173 (Data Privacy Act of the Philippines)
 *   2. CTU Academic Anti-Plagiarism & Intellectual Property Policies
 * ==========================================================================
 */

(function () {
    "use strict";

    // Selectors that contain protected academic/thesis intellectual property
    const PROTECTED_SELECTORS = [
        '.project-title',
        '.project-abstract',
        '.project-title-large',
        '.section-text',
        '#citation-text',
        '.citation-preview',
        '.protected-text',
        '[data-protected="true"]'
    ];

    let calloutEl = null;
    let lastTriggerTime = 0;
    const THROTTLE_MS = 300;

    /**
     * Check if a given DOM element or any of its ancestors is protected
     */
    function getProtectedAncestor(target) {
        if (!target || !(target instanceof Element)) return null;

        // Check explicit selectors
        for (const selector of PROTECTED_SELECTORS) {
            const matched = target.closest(selector);
            if (matched) return matched;
        }

        // Check if explicitly marked with user-select: none on specific project text classes
        const computed = window.getComputedStyle(target);
        if (computed && computed.userSelect === 'none') {
            const isTextContent = target.closest('.project-card, .project-section, .modal-body, .details-grid');
            if (isTextContent) return target;
        }

        return null;
    }

    /**
     * Create or retrieve the singleton floating callout element
     */
    function getCalloutElement() {
        if (calloutEl && document.body.contains(calloutEl)) {
            return calloutEl;
        }

        calloutEl = document.createElement('div');
        calloutEl.id = 'text-protection-callout';
        calloutEl.className = 'text-protection-callout';
        calloutEl.setAttribute('role', 'alert');
        calloutEl.setAttribute('aria-live', 'polite');

        calloutEl.innerHTML = `
            <div class="protection-callout-header">
                <div class="protection-icon-badge" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
                <div class="protection-callout-title">
                    <span>Protected Content</span>
                    <span class="protection-callout-badge">Restricted</span>
                </div>
                <button type="button" class="protection-close-btn" id="protection-callout-close" aria-label="Close notification" title="Close">✕</button>
            </div>
            <p class="protection-callout-message">
                Text highlighting and copying are disabled to protect intellectual property in compliance with the 
                <strong>Data Privacy Act (R.A. 10173)</strong> and <strong>Anti-Plagiarism</strong> regulations.
            </p>
            <div class="protection-callout-tags" aria-hidden="true">
                <span class="protection-mini-pill">🔒 R.A. 10173</span>
                <span class="protection-mini-pill">🛡️ Anti-Plagiarism</span>
                <span class="protection-mini-pill">🎓 CTU Library</span>
            </div>
        `;

        // Attach manual close button handler
        const closeBtn = calloutEl.querySelector('.protection-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                hideProtectionCallout();
            });
        }

        document.body.appendChild(calloutEl);
        return calloutEl;
    }

    /**
     * Display the floating callout positioned near the user's cursor / target element
     */
    function showProtectionCallout(x, y, protectedTarget) {
        const now = Date.now();
        const callout = getCalloutElement();

        // If currently visible and re-triggered rapidly, do a gentle shake animation
        if (callout.classList.contains('visible') && (now - lastTriggerTime) < 1500) {
            callout.classList.remove('shake');
            void callout.offsetWidth; // Force reflow
            callout.classList.add('shake');
            lastTriggerTime = now;
            return;
        }

        lastTriggerTime = now;

        // Position coordinates fallback to target bounds if x/y are missing
        if ((x === undefined || y === undefined || (x === 0 && y === 0)) && protectedTarget) {
            const rect = protectedTarget.getBoundingClientRect();
            x = rect.left + Math.min(rect.width / 2, 120);
            y = rect.top + Math.min(rect.height / 2, 40);
        }

        // Measure callout dimensions
        callout.style.visibility = 'hidden';
        callout.style.display = 'block';
        callout.classList.remove('fade-out', 'shake');

        const calloutWidth = 320;
        const calloutHeight = callout.offsetHeight || 130;

        // Keep inside viewport margins
        const margin = 16;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Default position: slightly above and to the right of cursor
        let targetX = (x || viewportWidth / 2) + 12;
        let targetY = (y || viewportHeight / 2) - calloutHeight - 10;

        // If too far right, flip to left of cursor
        if (targetX + calloutWidth > viewportWidth - margin) {
            targetX = (x || viewportWidth) - calloutWidth - 12;
        }
        // Clamp horizontal
        targetX = Math.max(margin, Math.min(targetX, viewportWidth - calloutWidth - margin));

        // If too close to top, show below cursor
        if (targetY < margin) {
            targetY = (y || 0) + 20;
        }
        // Clamp vertical
        targetY = Math.max(margin, Math.min(targetY, viewportHeight - calloutHeight - margin));

        callout.style.left = `${Math.round(targetX)}px`;
        callout.style.top = `${Math.round(targetY)}px`;
        callout.style.visibility = 'visible';
        callout.classList.add('visible');

        // Note: No auto-dismiss timer. User must manually close via close button or Escape key.
    }

    /**
     * Smoothly hide the callout with animation
     */
    function hideProtectionCallout() {
        if (!calloutEl || !calloutEl.classList.contains('visible')) return;

        calloutEl.classList.remove('shake');
        calloutEl.classList.add('fade-out');

        setTimeout(() => {
            if (calloutEl) {
                calloutEl.classList.remove('visible', 'fade-out');
                calloutEl.style.display = 'none';
            }
        }, 250);
    }

    // ---------- GLOBAL EVENT LISTENERS ----------

    // 1. Text Selection Start (User attempts to click-drag to select text)
    document.addEventListener('selectstart', function (e) {
        const protectedTarget = getProtectedAncestor(e.target);
        if (protectedTarget) {
            e.preventDefault();
            showProtectionCallout(e.clientX, e.clientY, protectedTarget);
        }
    }, true);

    // 2. Mouse Drag / Double Click on Protected Elements
    let isMouseDown = false;
    let mouseDownPos = { x: 0, y: 0 };
    let currentProtectedTarget = null;

    document.addEventListener('mousedown', function (e) {
        const protectedTarget = getProtectedAncestor(e.target);
        if (protectedTarget) {
            isMouseDown = true;
            mouseDownPos = { x: e.clientX, y: e.clientY };
            currentProtectedTarget = protectedTarget;

            // Handle double-click word selection attempt
            if (e.detail >= 2) {
                e.preventDefault();
                showProtectionCallout(e.clientX, e.clientY, protectedTarget);
            }
        } else {
            isMouseDown = false;
            currentProtectedTarget = null;
        }
    }, true);

    document.addEventListener('mousemove', function (e) {
        if (isMouseDown && currentProtectedTarget) {
            const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
            // If dragging more than 8 pixels, user is trying to select/highlight text
            if (dist > 8) {
                isMouseDown = false; // Only trigger once per drag
                showProtectionCallout(e.clientX, e.clientY, currentProtectedTarget);
            }
        }
    }, true);

    document.addEventListener('mouseup', function () {
        isMouseDown = false;
        currentProtectedTarget = null;
    }, true);

    // 3. Copy Shortcut (Ctrl+C / Cmd+C)
    document.addEventListener('keydown', function (e) {
        const isCopyShortcut = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C');
        if (!isCopyShortcut) return;

        // Check if hover or focus is within a protected element
        const hovered = document.querySelector(':hover');
        const protectedAncestor = getProtectedAncestor(hovered) || getProtectedAncestor(document.activeElement);

        if (protectedAncestor) {
            e.preventDefault();
            showProtectionCallout(window.innerWidth / 2 - 160, window.innerHeight - 180, protectedAncestor);

            // Optional: trigger warning toast if toast system is loaded
            if (typeof window.showToast === 'function') {
                window.showToast(
                    'Text copying is disabled in compliance with the Data Privacy Act (R.A. 10173) & Anti-Plagiarism Policy.',
                    'warning'
                );
            }
        }
    }, true);

    // 4. Copy Event (fallback)
    document.addEventListener('copy', function (e) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const node = selection.anchorNode ? (selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentElement : selection.anchorNode) : null;
            if (node && getProtectedAncestor(node)) {
                e.preventDefault();
                if (typeof window.showToast === 'function') {
                    window.showToast(
                        'Text copying is restricted under the Data Privacy Act (R.A. 10173) & Anti-Plagiarism Policy.',
                        'warning'
                    );
                }
            }
        }
    }, true);

    // 5. Close callout on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            hideProtectionCallout();
        }
    });

    // Expose utility globally for testing or manual triggers
    window.TextProtection = {
        show: showProtectionCallout,
        hide: hideProtectionCallout,
        isProtected: function (el) { return !!getProtectedAncestor(el); }
    };

})();

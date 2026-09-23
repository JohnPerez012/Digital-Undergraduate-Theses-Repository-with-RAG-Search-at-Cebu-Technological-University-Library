// Universal Toast System (Important & Unimportant Support)
(function() {
    "use strict";

    // ---------- CONFIG ----------
    const CONFIG = {
        baseOverlap: 60,
        maxOverlap: 110,
        tightnessFactor: 0.8,
        maxToastsForTightening: 15,
        minVisibleSliver: 8,
        // Reading speed configuration for unimportant toasts
        baseReadingTimeMs: 2500,    // Base minimum time to perceive notification
        msPerCharacter: 45,         // Average reading speed (~220 wpm / ~1300 cpm)
        minDurationMs: 3000,        // Absolute minimum display duration
        maxDurationMs: 12000,       // Absolute maximum display duration
    };

    // ---------- CONTAINERS ----------
    let centerContainer = null; // Important toasts (screen middle)
    let cornerContainer = null; // Unimportant toasts (left corner)

    function getCenterContainer() {
        if (!centerContainer || !centerContainer.parentNode) {
            centerContainer = document.createElement('div');
            centerContainer.className = 'toast-container toast-container-center';
            document.body.appendChild(centerContainer);
        }
        return centerContainer;
    }

    function getCornerContainer() {
        if (!cornerContainer || !cornerContainer.parentNode) {
            cornerContainer = document.createElement('div');
            cornerContainer.className = 'toast-container toast-container-corner';
            document.body.appendChild(cornerContainer);
        }
        return cornerContainer;
    }

    // ---------- CALCULATE OVERLAP FOR CENTER TOASTS ----------
    function calculateOverlap(totalToasts, positionIndex) {
        if (positionIndex === 0) {
            return { overlap: 0, scale: 1, opacity: 1 };
        }

        const progress = Math.min(totalToasts / CONFIG.maxToastsForTightening, 1);
        const overlapRange = CONFIG.maxOverlap - CONFIG.baseOverlap;
        const currentOverlap = CONFIG.baseOverlap + (overlapRange * Math.pow(progress, CONFIG.tightnessFactor));

        const positionFactor = 1 + (positionIndex / totalToasts) * 0.2;
        let finalOverlap = currentOverlap * positionFactor;

        const toastHeight = 70;
        const maxPossibleOverlap = toastHeight - CONFIG.minVisibleSliver;
        finalOverlap = Math.min(finalOverlap, maxPossibleOverlap);

        const scaleFactor = 1 - (positionIndex * 0.035);
        const clampedScale = Math.max(scaleFactor, 0.80);

        const opacityFactor = 1 - (positionIndex * 0.07);
        const clampedOpacity = Math.max(opacityFactor, 0.35);

        return {
            overlap: finalOverlap,
            scale: clampedScale,
            opacity: clampedOpacity,
        };
    }

    // ---------- UPDATE IMPORTANT TOASTS (CENTER) ----------
    function updateCenterPositions() {
        if (!centerContainer) return;

        const toasts = centerContainer.querySelectorAll('.toast:not(.removing)');
        const total = toasts.length;

        toasts.forEach((toast, index) => {
            // Remove any existing counter badge
            const counter = toast.querySelector('.toast-counter');
            if (counter) counter.remove();

            if (index === 0) {
                toast.style.transform = 'translateY(0) scale(1)';
                toast.style.opacity = '1';
                toast.style.marginTop = '0';
                toast.style.zIndex = '100';
                return;
            }

            const { overlap, scale, opacity } = calculateOverlap(total, index);

            toast.style.transform = `translateY(0) scale(${scale})`;
            toast.style.opacity = opacity;
            toast.style.marginTop = `-${overlap}px`;
            toast.style.zIndex = 100 - index;
        });
    }

    // ---------- SEQUENTIAL TIMER & STATIC BOTTOM STACK (CORNER) ----------
    function startActiveCornerTimer(toast) {
        if (toast._timerStarted) return; // already active
        toast._timerStarted = true;

        const duration = toast._duration || calculateReadingDuration(toast._rawMessage);
        toast._remainingTime = duration;
        toast._startTime = Date.now();

        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            progressBar.style.animationDuration = `${duration}ms`;
            progressBar.classList.add('active');
            progressBar.style.animationPlayState = 'running';
        }

        // ── BLUR-OUT THEN DISMISS ──────────────────────────────────────
        // When the timer fires, show a short blur-out effect (~800ms) so
        // the user sees a clear "time's up" signal before the toast exits.
        function triggerBlurOutThenRemove() {
            if (toast.classList.contains('removing') || toast.classList.contains('blurring-out')) return;
            toast.classList.add('blurring-out');
            setTimeout(() => { removeToast(toast); }, 800);
        }

        toast._dismissTimer = setTimeout(triggerBlurOutThenRemove, duration);

        // Hover pause handlers
        if (!toast._hoverAttached) {
            toast._hoverAttached = true;
            toast.addEventListener('mouseenter', () => {
                // Don't interrupt if already blurring out
                if (toast.classList.contains('blurring-out')) return;
                if (toast._dismissTimer) {
                    clearTimeout(toast._dismissTimer);
                    toast._dismissTimer = null;
                    const elapsed = Date.now() - toast._startTime;
                    toast._remainingTime = Math.max(toast._remainingTime - elapsed, 400);
                    if (progressBar) progressBar.style.animationPlayState = 'paused';
                }
            });

            toast.addEventListener('mouseleave', () => {
                if (toast.classList.contains('blurring-out')) return;
                if (!toast.classList.contains('removing') && toast._timerStarted && !toast._dismissTimer) {
                    toast._startTime = Date.now();
                    if (progressBar) progressBar.style.animationPlayState = 'running';
                    toast._dismissTimer = setTimeout(triggerBlurOutThenRemove, toast._remainingTime);
                }
            });
        }
    }

    function pauseQueuedCornerTimer(toast) {
        if (toast._dismissTimer) {
            clearTimeout(toast._dismissTimer);
            toast._dismissTimer = null;
        }
        toast._timerStarted = false;
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            progressBar.classList.remove('active');
        }
    }

    function updateCornerPositions() {
        if (!cornerContainer) return;

        const toasts = Array.from(cornerContainer.querySelectorAll('.toast:not(.removing)'));

        toasts.forEach((toast, index) => {
            // Remove any existing counter badge
            const counter = toast.querySelector('.toast-counter');
            if (counter) counter.remove();

            // STACKING & POSITIONING RULE:
            // Toast 0 (active) — bottom, scale 1, full opacity
            // Queued toasts — spaced with an EXACT EQUAL visible gap (14px) between all active toasts.
            // With transform-origin: bottom center, height scales down by toastHeight * (1 - scale).
            // We adjust yOffset so every toast's visible top edge has the exact same 14px step.
            const visibleGap  = 14;
            const toastHeight = toast.offsetHeight || 70;
            const scale       = index === 0 ? 1 : Math.max(1 - (index * 0.035), 0.82);
            const opacity     = index === 0 ? 1 : Math.max(0.88 - (index * 0.12), 0.35);
            const yOffset     = index === 0 ? 0 : Math.round(-(index * visibleGap) - (toastHeight * (1 - scale)));

            // --- SMOOTH PROMOTION DETECTION ---
            // A toast is "being promoted" when:
            //   • It's now at index 0 (newly the active toast)
            //   • It was already settled in the stack (entry animation finished)
            //   • It hasn't started its own timer yet (i.e. it was queued, not active)
            const isBeingPromoted = index === 0
                && toast.dataset.settled === 'true'
                && !toast._timerStarted;

            if (isBeingPromoted) {
                // Update destination CSS vars (--stack-y/scale stay at 0/1 for active slot)
                toast.style.setProperty('--stack-y',    `${yOffset}px`);
                toast.style.setProperty('--stack-scale', `${scale}`);

                // Clear inline transform & opacity so the CSS animation can own them.
                // (Inline styles override CSS animations — we MUST clear them first.)
                toast.style.transform = '';
                toast.style.opacity   = '';

                // Re-trigger the slide-in animation (same as entry — from left)
                toast.classList.remove('toast-promoting');
                void toast.offsetWidth; // force reflow so removing then re-adding restarts anim
                toast.classList.add('toast-promoting');

                // After the animation completes: freeze final state as inline style & clean up
                setTimeout(() => {
                    toast.classList.remove('toast-promoting');
                    toast.style.transform = `translateY(${yOffset}px) scale(${scale})`;
                    toast.style.opacity   = String(opacity);
                }, 560);

            } else {
                // Normal re-positioning — but SKIP if promotion animation is still playing
                // (updateCornerPositions fires multiple times during removeToast;
                //  without this guard the inline style would snap the animation mid-play)
                toast.style.setProperty('--stack-y',    `${yOffset}px`);
                toast.style.setProperty('--stack-scale', `${scale}`);
                if (!toast.classList.contains('toast-promoting')) {
                    toast.style.transform = `translateY(${yOffset}px) scale(${scale})`;
                    toast.style.opacity   = String(opacity);
                }
            }

            toast.style.zIndex = String(100 - index);

            // Mark this toast as "settled" after its entry animation finishes (~510ms).
            // Only settled toasts are eligible for the promotion animation.
            if (!toast.dataset.settled) {
                setTimeout(() => { toast.dataset.settled = 'true'; }, 510);
            }

            // SEQUENTIAL COUNTDOWN:
            // ONLY the active toast (index 0) runs its timer.
            // Queued toasts wait silently behind it.
            if (index === 0) {
                startActiveCornerTimer(toast);
            } else {
                pauseQueuedCornerTimer(toast);
            }
        });
    }


    // ---------- REMOVE TOAST ----------
    function removeToast(toast) {
        if (!toast || toast.classList.contains('removing')) return;

        const isCorner = toast.classList.contains('toast-unimportant');
        const container = toast.parentElement;
        const isAlreadyExiting = toast.classList.contains('blurring-out');
        toast.classList.add('removing');

        if (toast._dismissTimer) {
            clearTimeout(toast._dismissTimer);
            toast._dismissTimer = null;
        }

        if (isAlreadyExiting) {
            // The blurring-out animation already slid the toast off-screen.
            // Skip re-triggering the slide-out animation (it would snap back to
            // opacity:1 at its 0% keyframe before sliding, causing a flicker).
            // Just update stack positions immediately, then remove the DOM node.
            requestAnimationFrame(() => {
                if (isCorner) updateCornerPositions();
                else if (container) updateCenterPositions();
            });
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 50);
            return;
        }

        toast.addEventListener('animationend', function onEnd() {
            toast.remove();
            requestAnimationFrame(() => {
                if (isCorner) {
                    updateCornerPositions();
                } else if (container) {
                    updateCenterPositions();
                }
            });
        }, { once: true });

        // Safety fallback
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
                requestAnimationFrame(() => {
                    if (isCorner) {
                        updateCornerPositions();
                    } else if (container) {
                        updateCenterPositions();
                    }
                });
            }
        }, 500);

        requestAnimationFrame(() => {
            if (isCorner) {
                updateCornerPositions();
            } else if (container) {
                updateCenterPositions();
            }
        });
    }

    // ---------- CALCULATE READING DURATION ----------
    function calculateReadingDuration(message) {
        const rawText = message ? String(message).replace(/<[^>]*>/g, '').trim() : '';
        const charCount = rawText.length;
        const calculated = CONFIG.baseReadingTimeMs + (charCount * CONFIG.msPerCharacter);
        return Math.min(Math.max(calculated, CONFIG.minDurationMs), CONFIG.maxDurationMs);
    }

    // ---------- NORMALIZE TYPE ----------
    function normalizeType(rawType) {
        if (!rawType) return 'info';
        const t = String(rawType).toLowerCase().trim();
        if (t === '✅' || t === 'success') return 'success';
        if (t === '❌' || t === '⛔' || t === 'error' || t === 'danger') return 'error';
        if (t === '⚠️' || t === 'warning' || t === 'warn') return 'warning';
        return 'info';
    }

    // ---------- SHOW TOAST (MAIN ENTRY POINT) ----------
    window.showToast = function(message, typeOrOptions, options) {
        let type = 'info';
        let isImportant = false;
        let customDuration = null;

        if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
            type = typeOrOptions.type || 'info';
            isImportant = !!typeOrOptions.important;
            customDuration = typeOrOptions.duration || null;
        } else if (typeof typeOrOptions === 'string') {
            type = typeOrOptions;
            if (typeof options === 'boolean') {
                isImportant = options;
            } else if (typeof options === 'object' && options !== null) {
                isImportant = !!options.important;
                customDuration = options.duration || null;
            }
        }

        const normalizedType = normalizeType(type);
        const container = isImportant ? getCenterContainer() : getCornerContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${normalizedType} ${isImportant ? 'toast-important' : 'toast-unimportant'}`;
        toast._rawMessage = message;

        // Compute reading duration for unimportant toasts
        const duration = customDuration || calculateReadingDuration(message);
        toast._duration = duration;

        // Toast Markup
        toast.innerHTML = `
            <div class="toast-message">${message}</div>
            <button class="toast-close" aria-label="Close toast">✕</button>
            ${!isImportant ? `
                <div class="toast-progress">
                    <div class="toast-progress-bar"></div>
                </div>
            ` : ''}
        `;

        // NEW STACKING RULE:
        // Append toast so the 1st message (first in) stays at DOM index 0 and top layer!
        container.appendChild(toast);

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeToast(toast);
            });
        }

        // Trigger position update and sequential timer management
        requestAnimationFrame(() => {
            if (isImportant) {
                updateCenterPositions();
            } else {
                updateCornerPositions();
            }
        });

        return toast;
    };

    // ---------- DEDICATED HELPERS ----------
    window.showToast.important = function(message, type = 'warning') {
        return window.showToast(message, type, { important: true });
    };

    window.showToast.unimportant = function(message, type = 'info', duration) {
        return window.showToast(message, type, { important: false, duration });
    };

    // ---------- CLEAR ALL TOASTS ----------
    window.clearAllToasts = function() {
        [centerContainer, cornerContainer].forEach(container => {
            if (!container) return;
            const toasts = container.querySelectorAll('.toast:not(.removing)');
            toasts.forEach((t, index) => {
                setTimeout(() => {
                    if (t && !t.classList.contains('removing')) {
                        removeToast(t);
                    }
                }, index * 30);
            });
        });
    };

})();
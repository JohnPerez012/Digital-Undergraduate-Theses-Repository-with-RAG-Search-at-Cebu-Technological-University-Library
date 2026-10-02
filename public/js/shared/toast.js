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

        // Anti-Spam & Flooding Protection
        maxVisibleCorner: 3,        // Strict max concurrent toasts visible in corner
        maxVisibleCenter: 2,        // Strict max concurrent toasts in center
        burstWindowMs: 800,         // Sliding window for rate limiting
        maxBurstCount: 5,           // Max distinct toasts allowed in burst window
    };

    // ---------- BURST RATE LIMITER ----------
    const recentTriggerTimes = [];
    function isBurstFlooded() {
        const now = Date.now();
        while (recentTriggerTimes.length > 0 && (now - recentTriggerTimes[0] > CONFIG.burstWindowMs)) {
            recentTriggerTimes.shift();
        }
        if (recentTriggerTimes.length >= CONFIG.maxBurstCount) {
            return true;
        }
        recentTriggerTimes.push(now);
        return false;
    }

    // ---------- SEMANTIC TAG INFERENCE ----------
    function inferTag(message, customTag) {
        if (customTag) return String(customTag).trim().toLowerCase();
        if (!message) return null;
        const str = String(message).toLowerCase();
        if (/switched to (dark|light) mode/i.test(str) || (/theme/i.test(str) && /(dark|light)/i.test(str))) {
            return 'tag-theme-toggle';
        }
        if (/(added to|removed from) bookmark/i.test(str) || /bookmark (added|removed)/i.test(str)) {
            return 'tag-bookmark-toggle';
        }
        if (/(offline|online|connection lost|connection restored|network)/i.test(str)) {
            return 'tag-network-status';
        }
        if (/(citation|bibtex|ieee|apa|mla) (copied|generated)/i.test(str)) {
            return 'tag-citation-copy';
        }
        return null;
    }

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
            progressBar.classList.remove('active');
            void progressBar.offsetWidth; // Force CSS reflow to cleanly restart animation
            progressBar.style.animationDuration = `${duration}ms`;
            progressBar.classList.add('active');
            progressBar.style.animationPlayState = 'running';
        }

        // ── BLUR-OUT THEN DISMISS ──────────────────────────────────────
        function triggerBlurOutThenRemove() {
            if (toast.classList.contains('removing') || toast.classList.contains('blurring-out')) return;
            toast.classList.add('blurring-out');

            requestAnimationFrame(() => {
                updateCornerPositions();
            });

            setTimeout(() => { removeToast(toast); }, 520);
        }

        toast._dismissTimer = setTimeout(triggerBlurOutThenRemove, duration);

        // Hover pause handlers
        if (!toast._hoverAttached) {
            toast._hoverAttached = true;
            toast.addEventListener('mouseenter', () => {
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

        // Only select toasts that are actively visible in the stack (exclude exiting/blurring ones)
        const toasts = Array.from(cornerContainer.querySelectorAll('.toast:not(.removing):not(.blurring-out)'));

        toasts.forEach((toast, index) => {
            const visibleGap  = 14;
            const toastHeight = toast.offsetHeight || 70;
            const scale       = index === 0 ? 1 : Math.max(1 - (index * 0.035), 0.82);
            const opacity     = index === 0 ? 1 : Math.max(0.88 - (index * 0.12), 0.35);
            const yOffset     = index === 0 ? 0 : Math.round(-(index * visibleGap) - (toastHeight * (1 - scale)));

            // Visual classes for front (active) vs behind (queued)
            if (index === 0) {
                toast.classList.add('toast-active');
                toast.classList.remove('toast-queued');
            } else {
                toast.classList.add('toast-queued');
                toast.classList.remove('toast-active');
            }

            // Set stacking custom properties (used for entrance and exit keyframes)
            toast.style.setProperty('--stack-y', `${yOffset}px`);
            toast.style.setProperty('--stack-scale', `${scale}`);

            // Apply smooth position and opacity via CSS transition
            if (!toast.classList.contains('toast-entering')) {
                toast.style.transform = `translateY(${yOffset}px) scale(${scale})`;
                toast.style.opacity   = String(opacity);
            }

            toast.style.zIndex = String(100 - index);

            // SEQUENTIAL COUNTDOWN: Only active front toast runs timer
            if (index === 0) {
                startActiveCornerTimer(toast);
            } else {
                pauseQueuedCornerTimer(toast);
            }
        });
    }

    // ---------- FAST EVICT TOAST (FOR HARD CAP OVERFLOW) ----------
    function fastEvictToast(toast) {
        if (!toast || toast.classList.contains('removing') || toast.classList.contains('blurring-out')) return;
        toast.classList.add('blurring-out');
        if (toast._dismissTimer) {
            clearTimeout(toast._dismissTimer);
            toast._dismissTimer = null;
        }
        requestAnimationFrame(() => {
            if (toast.classList.contains('toast-unimportant')) {
                updateCornerPositions();
            } else {
                updateCenterPositions();
            }
        });
        setTimeout(() => {
            removeToast(toast);
        }, 220);
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
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 50);
            return;
        }

        requestAnimationFrame(() => {
            if (isCorner) updateCornerPositions();
            else if (container) updateCenterPositions();
        });

        toast.addEventListener('animationend', function onEnd() {
            if (toast.parentNode) toast.remove();
        }, { once: true });

        // Safety fallback
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 380);
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
        let customTag = null;

        if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
            type = typeOrOptions.type || 'info';
            isImportant = !!typeOrOptions.important;
            customDuration = typeOrOptions.duration || null;
            customTag = typeOrOptions.tag || null;
        } else if (typeof typeOrOptions === 'string') {
            type = typeOrOptions;
            if (typeof options === 'boolean') {
                isImportant = options;
            } else if (typeof options === 'object' && options !== null) {
                isImportant = !!options.important;
                customDuration = options.duration || null;
                customTag = options.tag || null;
            }
        }

        const normalizedType = normalizeType(type);
        const container = isImportant ? getCenterContainer() : getCornerContainer();

        // Active visible toasts in container
        const activeToasts = Array.from(container.querySelectorAll('.toast:not(.removing):not(.blurring-out)'));
        const normalizedMessage = String(message || '').trim();

        // ── 1. EXACT DUPLICATE DEDUPLICATION ─────────────────────────
        const existingDuplicate = activeToasts.find(t => String(t._rawMessage || '').trim() === normalizedMessage);
        if (existingDuplicate) {
            existingDuplicate._count = (existingDuplicate._count || 1) + 1;

            // Counter badge
            let counterBadge = existingDuplicate.querySelector('.toast-counter');
            if (!counterBadge) {
                counterBadge = document.createElement('span');
                counterBadge.className = 'toast-counter';
                const closeBtn = existingDuplicate.querySelector('.toast-close');
                if (closeBtn) {
                    existingDuplicate.insertBefore(counterBadge, closeBtn);
                } else {
                    existingDuplicate.appendChild(counterBadge);
                }
            }
            counterBadge.innerHTML = `<span class="icon">×</span>${existingDuplicate._count}`;
            counterBadge.style.animation = 'none';
            void counterBadge.offsetWidth;
            counterBadge.style.animation = 'toastCounterPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';

            // Micro-pulse feedback
            existingDuplicate.classList.remove('toast-pulsing');
            void existingDuplicate.offsetWidth;
            existingDuplicate.classList.add('toast-pulsing');
            setTimeout(() => existingDuplicate.classList.remove('toast-pulsing'), 400);

            // Reset reading countdown timer
            const duration = customDuration || existingDuplicate._duration || calculateReadingDuration(message);
            existingDuplicate._duration = duration;
            existingDuplicate._remainingTime = duration;
            existingDuplicate._startTime = Date.now();

            if (!isImportant) {
                if (existingDuplicate._dismissTimer) {
                    clearTimeout(existingDuplicate._dismissTimer);
                    existingDuplicate._dismissTimer = null;
                }
                existingDuplicate._timerStarted = false;
                startActiveCornerTimer(existingDuplicate);
            }
            return existingDuplicate;
        }

        // ── 2. SEMANTIC TAG / STATE REPLACEMENT (TOGGLES) ────────────
        const tag = inferTag(message, customTag);
        const existingTagged = tag ? activeToasts.find(t => t._tag === tag) : null;
        if (existingTagged) {
            existingTagged._rawMessage = message;

            // In-place text update with crossfade
            const msgEl = existingTagged.querySelector('.toast-message');
            if (msgEl) {
                msgEl.classList.add('toast-message-updating');
                setTimeout(() => {
                    msgEl.innerHTML = message;
                    msgEl.classList.remove('toast-message-updating');
                }, 90);
            }

            // Update variant accent
            ['toast-info', 'toast-success', 'toast-error', 'toast-warning'].forEach(c => existingTagged.classList.remove(c));
            existingTagged.classList.add(`toast-${normalizedType}`);

            // Remove previous counter badge if state flipped
            const oldCounter = existingTagged.querySelector('.toast-counter');
            if (oldCounter) oldCounter.remove();
            existingTagged._count = 1;

            // Pulse feedback
            existingTagged.classList.remove('toast-pulsing');
            void existingTagged.offsetWidth;
            existingTagged.classList.add('toast-pulsing');
            setTimeout(() => existingTagged.classList.remove('toast-pulsing'), 350);

            // Reset countdown timer
            const duration = customDuration || calculateReadingDuration(message);
            existingTagged._duration = duration;
            existingTagged._remainingTime = duration;
            existingTagged._startTime = Date.now();

            if (!isImportant) {
                if (existingTagged._dismissTimer) {
                    clearTimeout(existingTagged._dismissTimer);
                    existingTagged._dismissTimer = null;
                }
                existingTagged._timerStarted = false;
                startActiveCornerTimer(existingTagged);
            }
            return existingTagged;
        }

        // ── 3. BURST FLOOD RATE LIMITING ──────────────────────────────
        if (isBurstFlooded()) {
            console.warn('[ToastSystem] High frequency burst throttled');
            return null;
        }

        // ── 4. HARD MAXIMUM VISIBLE CAP (FIFO EVICTION) ────────────────
        const maxLimit = isImportant ? CONFIG.maxVisibleCenter : CONFIG.maxVisibleCorner;
        if (activeToasts.length >= maxLimit) {
            const evictCount = (activeToasts.length - maxLimit) + 1;
            for (let i = 0; i < evictCount; i++) {
                const oldest = activeToasts[i];
                if (oldest) {
                    fastEvictToast(oldest);
                }
            }
        }

        // ── 5. SPAWN NEW TOAST CARD ───────────────────────────────────
        const toast = document.createElement('div');
        toast.className = `toast toast-${normalizedType} ${isImportant ? 'toast-important' : 'toast-unimportant toast-entering'}`;
        toast._rawMessage = message;
        toast._tag = tag;
        toast._count = 1;

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

        container.appendChild(toast);

        // When entrance animation completes, remove .toast-entering so standard CSS transitions take over
        if (!isImportant) {
            const onEntryDone = () => {
                toast.classList.remove('toast-entering');
                toast.dataset.settled = 'true';
                toast.removeEventListener('animationend', onEntryDone);
                const y = toast.style.getPropertyValue('--stack-y') || '0px';
                const s = toast.style.getPropertyValue('--stack-scale') || '1';
                toast.style.transform = `translateY(${y}) scale(${s})`;
            };
            toast.addEventListener('animationend', onEntryDone, { once: true });
            setTimeout(onEntryDone, 460);
        }

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
    window.showToast.important = function(message, type = 'warning', options = {}) {
        const opts = (typeof options === 'object' && options !== null) ? { ...options, important: true } : { important: true };
        return window.showToast(message, type, opts);
    };

    window.showToast.unimportant = function(message, type = 'info', durationOrOptions) {
        let opts = { important: false };
        if (typeof durationOrOptions === 'number') {
            opts.duration = durationOrOptions;
        } else if (typeof durationOrOptions === 'object' && durationOrOptions !== null) {
            opts = { ...durationOrOptions, important: false };
        }
        return window.showToast(message, type, opts);
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
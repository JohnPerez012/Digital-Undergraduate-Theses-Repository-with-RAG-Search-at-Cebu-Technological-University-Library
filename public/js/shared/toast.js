// Universal Toast System
(function() {
    "use strict";

    // ---------- CONFIG ----------
    const CONFIG = {
        baseOverlap: 60,
        maxOverlap: 110,
        tightnessFactor: 0.8,
        maxToastsForTightening: 15,
        minVisibleSliver: 8,
    };

    // ---------- STATE ----------
    let toastContainer = null;

    // ---------- INIT ----------
    function init() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    // ---------- CALCULATE OVERLAP ----------
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
        const clampedOpacity = Math.max(opacityFactor, 0.30);

        return {
            overlap: finalOverlap,
            scale: clampedScale,
            opacity: clampedOpacity,
        };
    }

    // ---------- UPDATE POSITIONS ----------
    function updateToastPositions() {
        if (!toastContainer) return;

        const toasts = toastContainer.querySelectorAll('.toast:not(.removing)');
        const total = toasts.length;

        toasts.forEach((toast, index) => {
            // Update counter badge
            let counter = toast.querySelector('.toast-counter');
            const behindCount = total - index - 1;

            if (behindCount > 0) {
                if (!counter) {
                    counter = document.createElement('div');
                    counter.className = 'toast-counter';
                    toast.appendChild(counter);
                }
                counter.innerHTML = `<span class="icon">✦</span>${behindCount}`;
                counter.style.display = 'flex';
            } else {
                if (counter) counter.style.display = 'none';
            }

            // Position styling
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

    // ---------- REMOVE TOAST ----------
    function removeToast(toast) {
        if (!toast || toast.classList.contains('removing')) return;

        toast.classList.add('removing');

        toast.addEventListener('animationend', function onEnd() {
            toast.remove();
            requestAnimationFrame(() => {
                updateToastPositions();
            });
        }, { once: true });

        // Safety fallback
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
                requestAnimationFrame(() => {
                    updateToastPositions();
                });
            }
        }, 600);

        requestAnimationFrame(() => {
            updateToastPositions();
        });
    }

    // ---------- SHOW TOAST ----------
    window.showToast = function(message) {
        const container = init();

        const toast = document.createElement('div');
        toast.className = 'toast';

        toast.innerHTML = `
            <div class="toast-message">${message}</div>
            <button class="toast-close" aria-label="Close toast">✕</button>
        `;

        container.prepend(toast);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeToast(toast);
        });

        requestAnimationFrame(() => {
            updateToastPositions();
        });

        return toast;
    };

    // ---------- CLEAR ALL ----------
    window.clearAllToasts = function() {
        if (!toastContainer) return;
        const toasts = toastContainer.querySelectorAll('.toast:not(.removing)');
        toasts.forEach((t, index) => {
            setTimeout(() => {
                if (t && !t.classList.contains('removing')) {
                    removeToast(t);
                }
            }, index * 30);
        });
    };

})();
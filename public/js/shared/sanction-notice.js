/**
 * sanction-notice.js
 * RE-CAPS — Sanction Notice Modal (Important Account Notice)
 *
 * Shows an important notice modal to suspended / quarantined users
 * on session entry, right after the DramaticIntro animation completes.
 *
 * Rules:
 * - Appears only ONCE per browser session (sessionStorage-gated)
 * - Checks Firestore user document for status 'suspended' | 'quarantined'
 * - Dismissing (Noted button) stores the notice to the nav bell indicator
 * - Bell reopens the modal on click (without re-triggering session gate)
 * - Strictly zero emojis — SVG icons only
 * - AGENTS.md palette compliance enforced via CSS class names
 */
(function () {
    'use strict';

    var SESSION_KEY     = 'recaps-sanction-notice-shown';
    var NOTICE_DATA_KEY = 'recaps-sanction-notice-data';

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    /* ── Firestore check ─────────────────────────────────────────────────── */

    async function checkAndShowSanctionNotice() {
        // Only once per session
        if (sessionStorage.getItem(SESSION_KEY)) return;

        // Need an authenticated user
        if (typeof auth === 'undefined' || !auth.currentUser) return;
        if (typeof db  === 'undefined') return;

        var uid = auth.currentUser.uid;

        try {
            var snap = await db.collection('users').doc(uid).get();
            if (!snap.exists) return;

            var data   = snap.data();
            var status = data.status;

            if (status !== 'suspended' && status !== 'quarantined') return;

            var noticeData = { status: status };

            if (status === 'suspended') {
                noticeData.reason      = data.suspensionReason   || 'Academic / institutional policy violation';
                noticeData.duration    = data.suspendedDuration  || 'Indefinite';
                noticeData.category    = data.suspensionCategory || '';
                noticeData.issuedBy    = data.suspendedBy        || 'Administrator';
            } else {
                var purgeDate = data.scheduledPurgeAt;
                var purgeStr  = 'Within 14 days';

                if (purgeDate) {
                    var d = purgeDate.toDate ? purgeDate.toDate() : new Date(purgeDate);
                    purgeStr = d.toLocaleDateString('en-PH', {
                        year: 'numeric', month: 'long', day: 'numeric'
                    });
                }

                noticeData.reason        = data.deletionReason    || 'Administrative request';
                noticeData.category      = data.deletionCategory  || '';
                noticeData.scheduledPurge = purgeStr;
                noticeData.issuedBy      = data.quarantinedBy     || 'Administrator';
            }

            showSanctionModal(noticeData);

        } catch (err) {
            console.warn('[SanctionNotice] Failed to check user status:', err);
        }
    }

    /* ── Modal render ────────────────────────────────────────────────────── */

    function buildBodyHTML(noticeData) {
        var isSuspended = noticeData.status === 'suspended';

        var categoryRow = noticeData.category
            ? '<div class="sn-detail-row"><span class="sn-detail-label">Category</span><span class="sn-detail-value">' + escapeHtml(noticeData.category) + '</span></div>'
            : '';

        if (isSuspended) {
            return (
                '<p class="sn-intro">Your RE-CAPS account has been placed under a disciplinary suspension by Library Administration.</p>' +
                '<div class="sn-detail-grid">' +
                    '<div class="sn-detail-row"><span class="sn-detail-label">Status</span><span class="sn-detail-value sn-val-suspend">Suspended</span></div>' +
                    '<div class="sn-detail-row"><span class="sn-detail-label">Duration</span><span class="sn-detail-value">' + escapeHtml(noticeData.duration) + '</span></div>' +
                    categoryRow +
                    '<div class="sn-detail-row"><span class="sn-detail-label">Reason</span><span class="sn-detail-value">' + escapeHtml(noticeData.reason) + '</span></div>' +
                    '<div class="sn-detail-row"><span class="sn-detail-label">Issued By</span><span class="sn-detail-value">' + escapeHtml(noticeData.issuedBy) + '</span></div>' +
                '</div>' +
                '<p class="sn-contact-note">To appeal or inquire, contact the CTU Daanbantayan Library Office directly.</p>'
            );
        }

        return (
            '<p class="sn-intro">Your RE-CAPS account has been placed in a 14-Day Deletion Quarantine by Library Administration.</p>' +
            '<div class="sn-detail-grid">' +
                '<div class="sn-detail-row"><span class="sn-detail-label">Status</span><span class="sn-detail-value sn-val-quarantine">Quarantined</span></div>' +
                '<div class="sn-detail-row"><span class="sn-detail-label">Scheduled Deletion</span><span class="sn-detail-value">' + escapeHtml(noticeData.scheduledPurge) + '</span></div>' +
                categoryRow +
                '<div class="sn-detail-row"><span class="sn-detail-label">Reason</span><span class="sn-detail-value">' + escapeHtml(noticeData.reason) + '</span></div>' +
                '<div class="sn-detail-row"><span class="sn-detail-label">Issued By</span><span class="sn-detail-value">' + escapeHtml(noticeData.issuedBy) + '</span></div>' +
            '</div>' +
            '<p class="sn-contact-note">Contact Library Administration within the grace period to request account restoration.</p>'
        );
    }

    function buildIconSVG(isSuspended) {
        if (isSuspended) {
            /* Lock icon — amber */
            return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        }
        /* Trash / quarantine icon — danger red */
        return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    }

    function showSanctionModal(noticeData, fromBell) {
        var modal    = document.getElementById('sanction-notice-modal');
        if (!modal) return;

        var isSuspended = noticeData.status === 'suspended';

        var badge   = document.getElementById('sn-badge');
        var body    = document.getElementById('sn-body');
        var iconWrap = document.getElementById('sn-icon-wrap');
        var title   = document.getElementById('sn-modal-title');

        if (badge) {
            badge.textContent = isSuspended ? 'Account Suspended' : 'Account Quarantined';
            badge.className   = 'sn-badge ' + (isSuspended ? 'sn-badge-suspend' : 'sn-badge-quarantine');
        }

        if (title) {
            title.textContent = 'Important Account Notice';
        }

        if (iconWrap) {
            iconWrap.innerHTML = buildIconSVG(isSuspended);
        }

        if (body) {
            body.innerHTML = buildBodyHTML(noticeData);
        }

        /* Show overlay */
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                modal.classList.add('sn-active');
            });
        });

        /* Store notice data for bell reopen */
        try {
            sessionStorage.setItem(NOTICE_DATA_KEY, JSON.stringify(noticeData));
        } catch (_) {}

        /* Dismiss handler */
        var notedBtn = document.getElementById('sn-btn-noted');
        if (notedBtn) {
            var handler = function dismissNotice() {
                modal.classList.remove('sn-active');
                setTimeout(function () {
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                }, 360);

                if (!fromBell) {
                    /* First dismissal — set session gate & activate bell */
                    sessionStorage.setItem(SESSION_KEY, 'true');
                    activateBellIndicator(noticeData);
                }

                notedBtn.removeEventListener('click', handler);
            };
            notedBtn.addEventListener('click', handler, { once: true });
        }
    }

    /* ── Bell indicator ──────────────────────────────────────────────────── */

    function activateBellIndicator(noticeData) {
        var bells = document.querySelectorAll('.sn-notice-bell');
        bells.forEach(function (bell) {
            bell.style.display = 'inline-flex';
            bell.classList.add('has-notice');

            /* Remove old listeners by cloning */
            var fresh = bell.cloneNode(true);
            bell.parentNode.replaceChild(fresh, bell);

            fresh.addEventListener('click', function () {
                reopenFromBell(noticeData);
            });
        });
    }

    function reopenFromBell(noticeData) {
        showSanctionModal(noticeData, true /* fromBell */);
    }

    /* ── Entry points ────────────────────────────────────────────────────── */

    /* 1. After dramatic intro animation completes */
    window.addEventListener('recapsIntroCompleted', function () {
        setTimeout(checkAndShowSanctionNotice, 450);
    });

    /* 2. If intro was already shown this session (event will not fire again),
          wait for Firebase auth state confirmation */
    if (sessionStorage.getItem('recaps-intro-shown') && !sessionStorage.getItem(SESSION_KEY)) {
        if (typeof auth !== 'undefined') {
            var unsubscribe = auth.onAuthStateChanged(function (user) {
                if (user) {
                    setTimeout(checkAndShowSanctionNotice, 500);
                    if (typeof unsubscribe === 'function') unsubscribe();
                }
            });
        }
    }

    /* 3. On DOMContentLoaded — restore bell from session if notice was already dismissed */
    document.addEventListener('DOMContentLoaded', function () {
        if (sessionStorage.getItem(SESSION_KEY)) {
            var stored = sessionStorage.getItem(NOTICE_DATA_KEY);
            if (stored) {
                try {
                    var noticeData = JSON.parse(stored);
                    activateBellIndicator(noticeData);
                } catch (_) {}
            }
        }
    });

})();

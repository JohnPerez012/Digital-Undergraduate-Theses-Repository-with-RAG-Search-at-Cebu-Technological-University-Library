/**
 * rbac.js — Role-Based Access Control Guard
 *
 * Usage: add  data-required-role="student", "admin", or "librarian"
 *        to the <html> element of any protected page, then include this script
 *        AFTER firebase-config.js.
 *
 * How the flash is prevented:
 *   A <style> tag hiding body is injected synchronously as soon as this script
 *   runs (before DOMContentLoaded / any paint). The body is only made visible
 *   once the role is confirmed. Wrong-role users are redirected while the page
 *   is still invisible, so they never see the wrong content.
 */

(function () {
    const ROLE_MAP = {
        student:   'student_page.html',
        admin:     'admin_page.html',
        librarian: 'library_page.html',
        teacher:   'teacher_page.html',
    };

    const requiredRole = document.documentElement.dataset.requiredRole || null;
    if (!requiredRole) return;

    // ── Instantly hide the body BEFORE the first paint ────────────────────────
    const _style = document.createElement('style');
    _style.id = '__rbac_hide';
    _style.textContent = 'body { visibility: hidden !important; }';
    document.head.appendChild(_style);

    function _reveal() {
        const s = document.getElementById('__rbac_hide');
        if (s) s.remove();
    }

    function _redirect(url) {
        window.location.replace(url);
    }

    // ── Wait for Firebase auth ────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof auth === 'undefined') {
            console.warn('[rbac] Firebase auth not available — revealing page.');
            _reveal();
            return;
        }

        auth.onAuthStateChanged(async function (user) {
            // Not logged in → send to home (page still hidden, no flash)
            if (!user) {
                sessionStorage.setItem('openLoginModal', 'true');
                _redirect('index.html');
                return;
            }

            // Fetch userType — prefer sessionStorage to avoid extra Firestore hit
            let userType = sessionStorage.getItem('userType');

            if (!userType) {
                try {
                    const doc = await db.collection('users').doc(user.uid).get();
                    if (doc.exists) {
                        userType = doc.data().userType || '';
                        sessionStorage.setItem('userType', userType);
                    }
                } catch (e) {
                    console.error('[rbac] Firestore fetch failed:', e);
                }
            }

            // Role matches → reveal the page normally
            if (userType === requiredRole) {
                _reveal();
                return;
            }

            // Wrong role → redirect silently (page is still hidden)
            const correctPage = ROLE_MAP[userType];
            _redirect(correctPage || 'index.html');
        });
    });
})();

/**
 * ============================================================================
 * RE-CAPS Staff 2FA Mandatory Enforcement Shield Daemon
 * ============================================================================
 * - Enforces impenetrable UI & API lockout for Admin & Librarian Staff if no
 *   verified personal Gmail is linked for Two-Factor Authentication.
 * - Active 1-second continuous tamper evaluation & MutationObserver protection.
 * - Zero Emojis (SVGRegistry icons only) & Strict Institutional Palette.
 * ============================================================================
 */

(function () {
    'use strict';

    let activeUser = null;
    let activeUserData = null;
    let tamperInterval = null;
    let backgroundCheckInterval = null;
    let domObserver = null;
    let isEnforced = false;
    let resendCooldownTimer = null;
    let pendingProspectiveEmail = '';

    function getCandidateBackendUrls() {
        if (typeof window.BACKEND_API_BASE === 'string' && window.BACKEND_API_BASE.trim()) {
            return [window.BACKEND_API_BASE.replace(/\/+$/, '')];
        }
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        return isLocal
            ? ['http://localhost:3001', 'https://recap-backend-jy5b.onrender.com']
            : ['https://recap-backend-jy5b.onrender.com', 'http://localhost:3001'];
    }

    async function requestStaffApi(apiPath, options = {}) {
        const candidateBases = getCandidateBackendUrls();
        let lastError = null;

        for (const base of candidateBases) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            try {
                const url = `${base}${apiPath}`;
                const resp = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return resp;
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                console.warn(`[Staff2FALock] Endpoint failed (${base}${apiPath}): ${err.message}. Trying next candidate...`);
            }
        }
        throw lastError || new Error('Backend service unreachable. Please ensure the server is active.');
    }

    function icon(name) {
        if (window.SVGRegistry && typeof window.SVGRegistry.getIcon === 'function') {
            const svg = window.SVGRegistry.getIcon(name);
            if (svg) return svg;
        }
        // Crisp inline fallback SVGs
        const fallbacks = {
            'shield-check': '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>',
            'lock-sm': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
            'mail': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
            'logout': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
            'check': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        };
        return fallbacks[name] || '';
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Build the Mandatory 2FA Lockout Modal HTML
     */
    function buildModalHtml(user, userData) {
        const instEmail = userData.email || user.email || 'Staff Account';
        const role = (userData.userType || userData.role || 'Staff').toUpperCase();

        return `
            <div id="staff-2fa-enforce-container" role="dialog" aria-modal="true" aria-labelledby="staff-2fa-title-text">
                <div class="staff-2fa-card">
                    <!-- Header -->
                    <div class="staff-2fa-header">
                        <div class="staff-2fa-icon-wrap">
                            <span class="staff-2fa-pulse"></span>
                            ${icon('shield-check')}
                        </div>
                        <div class="staff-2fa-badge-row">
                            ${icon('lock-sm')}
                            <span>Institutional Security Mandate</span>
                        </div>
                        <h2 class="staff-2fa-title" id="staff-2fa-title-text">Mandatory 2FA Enrollment</h2>
                        <p class="staff-2fa-subtitle">
                            Administrative and Library Staff accounts must bind a verified personal Gmail address for Two-Factor Authentication before accessing repository holdings and controls.
                        </p>
                    </div>

                    <!-- Fixed Institutional Account Identity -->
                    <div class="staff-2fa-institution-box">
                        <div class="staff-2fa-inst-left">
                            <span class="staff-2fa-inst-icon">${icon('lock-sm')}</span>
                            <div class="staff-2fa-inst-meta">
                                <span class="staff-2fa-inst-label">Institutional Role: ${escapeHtml(role)}</span>
                                <span class="staff-2fa-inst-email" title="${escapeHtml(instEmail)}">${escapeHtml(instEmail)}</span>
                            </div>
                        </div>
                        <span class="staff-2fa-inst-tag">Locked</span>
                    </div>

                    <!-- Interactive Enrollment Body -->
                    <div class="staff-2fa-body">
                        <!-- Step 1: Input Prospective Personal Gmail -->
                        <div id="staff-2fa-step-1" style="display: block;">
                            <div class="staff-2fa-field">
                                <label class="staff-2fa-label" for="staff-2fa-gmail-input">
                                    <span>Personal 2FA Gmail Address</span>
                                    <span style="color: #08D488; font-size: 0.74rem;">(Verification Required)</span>
                                </label>
                                <input type="email" id="staff-2fa-gmail-input" class="staff-2fa-input"
                                    placeholder="e.g. yourname.personal@gmail.com" autocomplete="email" required>
                            </div>
                            <div id="staff-2fa-step1-feedback" class="staff-2fa-status-box" style="margin-top: 10px;"></div>
                            <button type="button" class="staff-2fa-btn-primary" id="staff-2fa-send-code-btn" style="margin-top: 14px;">
                                ${icon('mail')}
                                <span>Send 6-Digit Verification Code</span>
                            </button>
                        </div>

                        <!-- Step 2: Input 6-Digit Code -->
                        <div id="staff-2fa-step-2" style="display: none;">
                            <div class="staff-2fa-field">
                                <label class="staff-2fa-label" for="staff-2fa-code-input">
                                    <span>Enter 6-Digit Verification Code</span>
                                    <span id="staff-2fa-target-email-label" style="color: #94a3b8; font-size: 0.74rem;"></span>
                                </label>
                                <input type="text" id="staff-2fa-code-input" class="staff-2fa-input staff-2fa-code-input"
                                    maxlength="6" placeholder="000000" autocomplete="one-time-code" inputmode="numeric">
                            </div>
                            <div class="staff-2fa-step-meta">
                                <button type="button" class="staff-2fa-link-action" id="staff-2fa-change-email-btn">
                                    &larr; Change email address
                                </button>
                                <button type="button" class="staff-2fa-link-action" id="staff-2fa-resend-btn" disabled>
                                    Resend Code (60s)
                                </button>
                            </div>
                            <div id="staff-2fa-step2-feedback" class="staff-2fa-status-box" style="margin-top: 10px;"></div>
                            <button type="button" class="staff-2fa-btn-primary" id="staff-2fa-verify-btn" style="margin-top: 14px;">
                                ${icon('check')}
                                <span>Verify &amp; Unlock Repository</span>
                            </button>
                        </div>

                        <!-- Step 3: Verified Unlocking State -->
                        <div id="staff-2fa-step-3" style="display: none; text-align: center; padding: 1rem 0;">
                            <div style="color: #08D488; margin-bottom: 0.5rem; display: flex; justify-content: center;">
                                ${icon('check')}
                            </div>
                            <h3 style="margin: 0 0 0.5rem 0; color: #08D488; font-size: 1.25rem;">2FA Security Verified!</h3>
                            <p style="margin: 0; color: #cbd5e1; font-size: 0.85rem;">Personal Gmail successfully linked. Unlocking institutional repository...</p>
                        </div>
                    </div>

                    <!-- Footer: Daemon indicator & Sign Out -->
                    <div class="staff-2fa-footer">
                        <div class="staff-2fa-daemon-indicator">
                            <span class="staff-2fa-daemon-dot"></span>
                            <span>Daemon active &bull; Evaluated every 1s</span>
                        </div>
                        <button type="button" class="staff-2fa-logout-btn" id="staff-2fa-signout-btn">
                            ${icon('logout')}
                            <span>Sign Out of Staff Portal</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Enforces the hard UI & DOM lockdown
     */
    function enforce(user, userData) {
        activeUser = user;
        activeUserData = userData;
        isEnforced = true;

        applyDomLock();
        startTamperDaemon();
    }

    /**
     * Disarms the lock when 2FA is verified
     */
    function disarm() {
        isEnforced = false;
        if (tamperInterval) {
            clearInterval(tamperInterval);
            tamperInterval = null;
        }
        if (backgroundCheckInterval) {
            clearInterval(backgroundCheckInterval);
            backgroundCheckInterval = null;
        }
        if (resendCooldownTimer) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
        }
        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }

        document.documentElement.classList.remove('staff-2fa-locked');
        document.body.classList.remove('staff-2fa-locked');

        const container = document.getElementById('staff-2fa-enforce-container');
        if (container) {
            container.remove();
        }

        // Restore any inline pointer-events on direct children
        Array.from(document.body.children).forEach(el => {
            if (el.id !== 'staff-2fa-enforce-container') {
                el.style.pointerEvents = '';
                el.style.filter = '';
                el.style.opacity = '';
            }
        });

        console.log('🛡️ [Staff2FALock] 2FA verified. Institutional repository lockdown disarmed.');
    }

    /**
     * Applies DOM changes for the lockdown
     */
    function applyDomLock() {
        if (!isEnforced) return;

        document.documentElement.classList.add('staff-2fa-locked');
        document.body.classList.add('staff-2fa-locked');

        let container = document.getElementById('staff-2fa-enforce-container');
        if (!container) {
            const html = buildModalHtml(activeUser, activeUserData);
            document.body.insertAdjacentHTML('beforeend', html);
            container = document.getElementById('staff-2fa-enforce-container');
            bindModalEvents(container);
        } else {
            container.style.display = 'flex';
            container.style.visibility = 'visible';
            container.style.opacity = '1';
        }

        // Freeze direct siblings
        Array.from(document.body.children).forEach(el => {
            if (el !== container && el.id !== 'staff-2fa-enforce-container') {
                el.style.pointerEvents = 'none';
                el.style.filter = 'blur(14px) brightness(0.22) grayscale(75%)';
                el.style.opacity = '0.18';
            }
        });
    }

    /**
     * Starts the 1-second tamper evaluation daemon & MutationObserver
     */
    function startTamperDaemon() {
        if (tamperInterval) clearInterval(tamperInterval);

        // Evaluate every 1,000 milliseconds (1 second)
        tamperInterval = setInterval(() => {
            if (!isEnforced) return;

            const container = document.getElementById('staff-2fa-enforce-container');
            const hasClass = document.body.classList.contains('staff-2fa-locked');

            if (!container || !hasClass || container.style.display === 'none' || container.style.opacity === '0') {
                console.warn('⚠️ [Staff2FALock] Tampering detected! Forcibly re-applying institutional lock.');
                applyDomLock();
            }
        }, 1000);

        // Background sync with Firestore (every 20 seconds) in case verified in another tab
        if (!backgroundCheckInterval) {
            backgroundCheckInterval = setInterval(async () => {
                if (!isEnforced || !activeUser) return;
                try {
                    const db = window.firebaseFirestore || (window.firebase && window.firebase.firestore && window.firebase.firestore());
                    if (db) {
                        const doc = await db.collection('users').doc(activeUser.uid).get();
                        if (doc.exists) {
                            const data = doc.data() || {};
                            if (data.linkedEmail && data.linkedEmailVerified === true) {
                                disarm();
                            }
                        }
                    }
                } catch (e) {
                    // silent ignore
                }
            }, 20000);
        }

        // MutationObserver to immediately counter manual DOM node deletion
        if (!domObserver && window.MutationObserver) {
            domObserver = new MutationObserver(() => {
                if (isEnforced) {
                    const container = document.getElementById('staff-2fa-enforce-container');
                    if (!container) {
                        applyDomLock();
                    }
                }
            });
            domObserver.observe(document.body, { childList: true, subtree: false });
        }

        // Global Keydown Trap (block Escape, Tab cycling outside modal)
        window.addEventListener('keydown', handleKeyTrap, true);
    }

    function handleKeyTrap(e) {
        if (!isEnforced) return;
        const container = document.getElementById('staff-2fa-enforce-container');
        if (!container) return;

        // Block Escape
        if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // If focus escaped the container, redirect to container input
        if (!container.contains(document.activeElement)) {
            const input = container.querySelector('input:not([disabled])');
            if (input) input.focus();
        }
    }

    /**
     * Binds interactive events inside the enforcement modal
     */
    function bindModalEvents(container) {
        const step1 = container.querySelector('#staff-2fa-step-1');
        const step2 = container.querySelector('#staff-2fa-step-2');
        const step3 = container.querySelector('#staff-2fa-step-3');

        const gmailInput = container.querySelector('#staff-2fa-gmail-input');
        const sendCodeBtn = container.querySelector('#staff-2fa-send-code-btn');
        const step1Feedback = container.querySelector('#staff-2fa-step1-feedback');

        const codeInput = container.querySelector('#staff-2fa-code-input');
        const verifyBtn = container.querySelector('#staff-2fa-verify-btn');
        const step2Feedback = container.querySelector('#staff-2fa-step2-feedback');
        const targetEmailLabel = container.querySelector('#staff-2fa-target-email-label');
        const changeEmailBtn = container.querySelector('#staff-2fa-change-email-btn');
        const resendBtn = container.querySelector('#staff-2fa-resend-btn');
        const signoutBtn = container.querySelector('#staff-2fa-signout-btn');

        // Autofocus first input
        setTimeout(() => {
            if (gmailInput) gmailInput.focus();
        }, 150);

        // Sign Out action
        if (signoutBtn) {
            signoutBtn.addEventListener('click', async () => {
                signoutBtn.disabled = true;
                signoutBtn.textContent = 'Signing out...';
                try {
                    const auth = window.firebaseAuth || (window.firebase && window.firebase.auth && window.firebase.auth());
                    if (auth) await auth.signOut();
                    sessionStorage.clear();
                    window.location.href = '../index.html';
                } catch (e) {
                    window.location.href = '../index.html';
                }
            });
        }

        // Step 1: Send Verification Code
        if (sendCodeBtn) {
            sendCodeBtn.addEventListener('click', async () => {
                const email = (gmailInput ? gmailInput.value : '').trim();
                step1Feedback.className = 'staff-2fa-status-box';
                step1Feedback.style.display = 'none';
                step1Feedback.textContent = '';

                if (!email || !email.includes('@')) {
                    step1Feedback.textContent = 'Please enter a valid personal Gmail address.';
                    step1Feedback.className = 'staff-2fa-status-box error';
                    step1Feedback.style.display = 'block';
                    if (gmailInput) gmailInput.focus();
                    return;
                }

                sendCodeBtn.disabled = true;
                sendCodeBtn.innerHTML = `<span class="staff-2fa-spinner"></span> <span>Dispatching 6-Digit Code...</span>`;

                try {
                    const token = await activeUser.getIdToken(true);
                    const resp = await requestStaffApi('/api/auth/email/request-link-code', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email })
                    });

                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || !data.success) {
                        sendCodeBtn.disabled = false;
                        sendCodeBtn.innerHTML = `${icon('mail')}<span>Send 6-Digit Verification Code</span>`;
                        step1Feedback.textContent = data.error || 'Failed to dispatch verification code.';
                        step1Feedback.className = 'staff-2fa-status-box error';
                        step1Feedback.style.display = 'block';
                        return;
                    }

                    // Success! Transition to Step 2
                    pendingProspectiveEmail = email;
                    step1.style.display = 'none';
                    step2.style.display = 'block';

                    if (targetEmailLabel) {
                        targetEmailLabel.textContent = `(Sent to ${data.maskedEmail || email})`;
                    }

                    if (codeInput) {
                        codeInput.value = '';
                        codeInput.focus();
                    }

                    startResendCooldown(resendBtn);

                } catch (err) {
                    sendCodeBtn.disabled = false;
                    sendCodeBtn.innerHTML = `${icon('mail')}<span>Send 6-Digit Verification Code</span>`;
                    step1Feedback.textContent = err.message || 'Network error. Could not connect to verification server.';
                    step1Feedback.className = 'staff-2fa-status-box error';
                    step1Feedback.style.display = 'block';
                }
            });
        }

        // Step 2: Back / Change email
        if (changeEmailBtn) {
            changeEmailBtn.addEventListener('click', () => {
                if (resendCooldownTimer) {
                    clearInterval(resendCooldownTimer);
                    resendCooldownTimer = null;
                }
                step2Feedback.style.display = 'none';
                step2.style.display = 'none';
                step1.style.display = 'block';
                if (sendCodeBtn) {
                    sendCodeBtn.disabled = false;
                    sendCodeBtn.innerHTML = `${icon('mail')}<span>Send 6-Digit Verification Code</span>`;
                }
                if (gmailInput) gmailInput.focus();
            });
        }

        // Step 2: Resend Code
        if (resendBtn) {
            resendBtn.addEventListener('click', async () => {
                resendBtn.disabled = true;
                resendBtn.innerHTML = `<span class="staff-2fa-spinner"></span> <span>Resending...</span>`;

                try {
                    const token = await activeUser.getIdToken(true);
                    const resp = await requestStaffApi('/api/auth/email/request-link-code', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email: pendingProspectiveEmail })
                    });
                    const data = await resp.json().catch(() => ({}));

                    if (!resp.ok || !data.success) {
                        step2Feedback.textContent = data.error || 'Failed to resend code.';
                        step2Feedback.className = 'staff-2fa-status-box error';
                        step2Feedback.style.display = 'block';
                        resendBtn.disabled = false;
                        resendBtn.textContent = 'Resend Code';
                        return;
                    }

                    step2Feedback.textContent = 'A fresh 6-digit code was sent to your email!';
                    step2Feedback.className = 'staff-2fa-status-box info';
                    step2Feedback.style.display = 'block';
                    startResendCooldown(resendBtn);
                } catch (err) {
                    step2Feedback.textContent = err.message || 'Network error while resending code.';
                    step2Feedback.className = 'staff-2fa-status-box error';
                    step2Feedback.style.display = 'block';
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend Code';
                }
            });
        }

        // Step 2: Verify Code & Unlock
        if (verifyBtn) {
            verifyBtn.addEventListener('click', async () => {
                const code = (codeInput ? codeInput.value : '').trim();
                step2Feedback.className = 'staff-2fa-status-box';
                step2Feedback.style.display = 'none';
                step2Feedback.textContent = '';

                if (!code || !/^\d{6}$/.test(code)) {
                    step2Feedback.textContent = 'Please enter the exact 6-digit code received.';
                    step2Feedback.className = 'staff-2fa-status-box error';
                    step2Feedback.style.display = 'block';
                    if (codeInput) codeInput.focus();
                    return;
                }

                verifyBtn.disabled = true;
                verifyBtn.innerHTML = `<span class="staff-2fa-spinner"></span> <span>Verifying Code...</span>`;

                try {
                    const token = await activeUser.getIdToken(true);
                    const resp = await requestStaffApi('/api/auth/email/confirm-link', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ code })
                    });

                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || !data.success) {
                        verifyBtn.disabled = false;
                        verifyBtn.innerHTML = `${icon('check')}<span>Verify &amp; Unlock Repository</span>`;
                        step2Feedback.textContent = data.error || 'Verification failed. Code may be invalid or expired.';
                        step2Feedback.className = 'staff-2fa-status-box error';
                        step2Feedback.style.display = 'block';
                        return;
                    }

                    // Success! Show Step 3
                    step2.style.display = 'none';
                    step3.style.display = 'block';

                    // Update memory state
                    if (activeUserData) {
                        activeUserData.linkedEmail = pendingProspectiveEmail;
                        activeUserData.linkedEmailVerified = true;
                    }
                    window.dispatchEvent(new CustomEvent('admin:linked-email-updated', {
                        detail: { linkedEmail: pendingProspectiveEmail, linkedEmailVerified: true }
                    }));
                    if (window.AdminSettings && typeof window.AdminSettings.refreshLinkedEmailState === 'function') {
                        window.AdminSettings.refreshLinkedEmailState(null, activeUserData);
                    }

                    // Disarm lock after 1.2s smooth celebration
                    setTimeout(() => {
                        disarm();
                        if (typeof window.showToast === 'function') {
                            window.showToast('2FA Security Enrollment Complete. Access granted.', 'success');
                        }
                    }, 1200);

                } catch (err) {
                    verifyBtn.disabled = false;
                    verifyBtn.innerHTML = `${icon('check')}<span>Verify &amp; Unlock Repository</span>`;
                    step2Feedback.textContent = err.message || 'Network error during code verification.';
                    step2Feedback.className = 'staff-2fa-status-box error';
                    step2Feedback.style.display = 'block';
                }
            });
        }
    }

    function startResendCooldown(btnEl) {
        if (!btnEl) return;
        if (resendCooldownTimer) clearInterval(resendCooldownTimer);

        let remaining = 60;
        btnEl.disabled = true;
        btnEl.textContent = `Resend Code (${remaining}s)`;

        resendCooldownTimer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(resendCooldownTimer);
                resendCooldownTimer = null;
                btnEl.disabled = false;
                btnEl.textContent = 'Resend Code';
            } else {
                btnEl.textContent = `Resend Code (${remaining}s)`;
            }
        }, 1000);
    }

    /**
     * Primary Evaluation Entrypoint
     */
    async function evaluateStaff2FA(user) {
        if (!user) {
            disarm();
            return;
        }

        try {
            const db = window.firebaseFirestore || (window.firebase && window.firebase.firestore && window.firebase.firestore());
            if (!db) {
                console.warn('[Staff2FALock] Firestore not initialized, evaluating via backend status endpoint...');
                const idToken = await user.getIdToken();
                const resp = await requestStaffApi('/api/auth/staff-2fa-status', {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const data = await resp.json().catch(() => ({}));
                if (data.isStaff && !data.linkedEmailVerified) {
                    enforce(user, { role: data.role, email: user.email });
                } else {
                    disarm();
                }
                return;
            }

            const doc = await db.collection('users').doc(user.uid).get();
            if (!doc.exists) {
                disarm();
                return;
            }

            const userData = doc.data() || {};
            const role = (userData.userType || userData.role || '').toLowerCase();
            const isStaff = (role === 'admin' || role === 'librarian');

            if (!isStaff) {
                // Students, Teachers, and Guests do not require staff 2FA lock
                disarm();
                return;
            }

            const isVerified = Boolean(userData.linkedEmail && userData.linkedEmailVerified === true);

            if (isVerified) {
                disarm();
            } else {
                console.warn(`🛡️ [Staff2FALock] Staff account (${user.email} [${role}]) lacks verified 2FA Gmail. Total lockdown initiated.`);
                enforce(user, userData);
            }
        } catch (err) {
            console.error('[Staff2FALock] Evaluation error:', err);
        }
    }

    // Export to Global Scope
    window.Staff2FALock = {
        evaluate: evaluateStaff2FA,
        enforce: enforce,
        disarm: disarm,
        isLocked: () => isEnforced
    };

    // Auto-listen to Firebase Auth state
    function attachAuthListener() {
        const auth = window.firebaseAuth || (window.firebase && window.firebase.auth && window.firebase.auth());
        if (auth && typeof auth.onAuthStateChanged === 'function') {
            auth.onAuthStateChanged(user => {
                evaluateStaff2FA(user);
            });
        } else {
            setTimeout(attachAuthListener, 250);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachAuthListener);
    } else {
        attachAuthListener();
    }

    console.log('🛡️ [Staff2FALock] Continuous 1s Security Daemon loaded.');
})();

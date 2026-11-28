/**
 * ============================================================================
 * RE-CAPS Password Change Security Module (Production Cut-Ties Edition)
 * ============================================================================
 * - Bank-Grade Current Password Verification Gate (/api/auth/verify-step1)
 * - Persistent Firestore 3-Strike -> 24-Hour Security Lockout
 * - Zero Telegram Dependency (Clean, direct institutional security)
 * - Universal Transactional Email Notifications via Resend
 * - Strict RE-CAPS Institutional Palette adherence & Zero Emojis (SVGRegistry)
 * ============================================================================
 */

(function () {
    'use strict';

    const QUESTION_MAP = {
        'first-pet': 'What was the name of your first pet?',
        'elementary-school': 'What was the name of your elementary school?',
        'city-born': 'In what city or town were you born?',
        'mother-maiden': "What is your mother's maiden name?",
        'favorite-teacher': 'Who was your favorite teacher?',
        'childhood-street': 'What street did you grow up on?'
    };

    let activeLockoutInterval = null;

    function getBackendUrl() {
        if (typeof window.BACKEND_API_BASE === 'string' && window.BACKEND_API_BASE.trim()) {
            return window.BACKEND_API_BASE.replace(/\/+$/, '');
        }
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        return 'https://recap-backend-jy5b.onrender.com';
    }

    const FALLBACK_SVGS = {
        'shield-check': '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>',
        'lock-sm': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
        'cross': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        'check': '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        'eye-open': '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
        'eye-closed': '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
    };

    function icon(name) {
        if (window.SVGRegistry && typeof window.SVGRegistry.getIcon === 'function') {
            const svg = window.SVGRegistry.getIcon(name);
            if (svg) return svg;
        }
        return FALLBACK_SVGS[name] || '';
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatCountdown(ms) {
        const totalSecs = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return response;
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }

    function initPasswordChange() {
        const changePasswordBtn = document.getElementById('change-password-btn') ||
                                  document.querySelector('[data-action="change-password"]');
        if (changePasswordBtn && !changePasswordBtn.dataset.boundPasswordChange) {
            changePasswordBtn.dataset.boundPasswordChange = 'true';
            changePasswordBtn.addEventListener('click', openPasswordChangeModal);
        }
    }

    async function openPasswordChangeModal() {
        const auth = window.firebaseAuth || (window.firebase && window.firebase.auth && window.firebase.auth());
        const user = auth ? auth.currentUser : null;
        if (!user) {
            showToast('You must be logged in to change your password.', 'error');
            return;
        }

        const db = window.firebaseFirestore || (window.firebase && window.firebase.firestore && window.firebase.firestore());
        let userData = {};
        if (db) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    userData = userDoc.data() || {};
                }
            } catch (err) {
                console.warn('[PasswordChange] Profile read error:', err.message);
            }
        }

        createPasswordChangeModal(userData, user);
    }

    function createPasswordChangeModal(userData, user) {
        const existing = document.getElementById('password-change-modal');
        if (existing) existing.remove();

        if (activeLockoutInterval) {
            clearInterval(activeLockoutInterval);
            activeLockoutInterval = null;
        }

        const userRole = (userData.role || userData.userType || 'student').toLowerCase();
        const isStaff = (userRole === 'admin' || userRole === 'librarian');
        const questionKey = userData.securityQuestion || '';
        const questionText = QUESTION_MAP[questionKey] || questionKey || 'What was your childhood nickname?';
        const hasLinked2FA = Boolean(userData.linkedEmail && userData.linkedEmailVerified === true);

        const lockoutInfo = (userData.securityLockout && typeof userData.securityLockout === 'object')
            ? userData.securityLockout
            : {};
        const lockedUntil = Number(lockoutInfo.lockedUntil) || 0;
        const isLocked = lockedUntil > Date.now();

        const modalHtml = `
            <div class="password-change-modal" id="password-change-modal" role="dialog" aria-modal="true" aria-labelledby="pwd-modal-title">
                <div class="password-change-overlay" id="password-change-overlay"></div>
                <div class="password-change-content">
                    <div class="password-change-header">
                        <div class="password-change-header-left">
                            <span class="password-change-header-icon">${icon('shield-check')}</span>
                            <div>
                                <h3 class="password-change-title" id="pwd-modal-title">Change Account Password</h3>
                                <p class="password-change-subtitle">Institutional security gate for ${escapeHtml(userData.email || user.email || 'your account')}</p>
                            </div>
                        </div>
                        <button type="button" class="password-change-close" id="close-pwd-modal-btn" aria-label="Close dialog">
                            ${icon('cross')}
                        </button>
                    </div>

                    <div class="password-change-body">
                        <!-- Security Lockout Banner -->
                        <div class="security-lockout-banner" id="security-lockout-banner" style="${isLocked ? 'display: block;' : 'display: none;'}">
                            <div class="lockout-banner-header">
                                <span class="lockout-banner-icon">${icon('lock-sm')}</span>
                                <span>24-Hour Security Lockout Active</span>
                            </div>
                            <p class="lockout-banner-msg">
                                3 consecutive incorrect verification attempts detected. Password rotation is temporarily locked.
                            </p>
                            <div class="lockout-countdown-row">
                                <span>Time Remaining:</span>
                                <strong id="lockout-countdown-value">${isLocked ? formatCountdown(lockedUntil - Date.now()) : '00h 00m 00s'}</strong>
                            </div>
                        </div>

                        <!-- Step 1: Identity & Current Password Gate -->
                        <div class="password-change-step" id="pwd-step-1" style="${isLocked ? 'display: none;' : 'display: block;'}">
                            <div class="role-security-badge ${isStaff ? 'staff' : 'user'}">
                                <span class="badge-icon">${icon('shield-check')}</span>
                                <span>${isStaff ? (hasLinked2FA ? 'Staff Credential & 2FA Gate' : 'Staff Credential Gate: Current Password Required') : 'Verify Current Credentials'} (3 attempts max)</span>
                            </div>

                            <div class="password-change-form">
                                <div class="password-change-field">
                                    <label class="password-change-label" for="current-password-input">
                                        Current Password <span class="req-asterisk">*</span>
                                    </label>
                                    <div class="password-input-wrapper">
                                        <input type="password" id="current-password-input" class="password-change-input" placeholder="Enter your current password" autocomplete="current-password">
                                        <button type="button" class="password-toggle-btn" data-target="current-password-input" aria-label="Toggle password visibility">
                                            ${icon('eye-open')}
                                        </button>
                                    </div>
                                </div>

                                ${isStaff && hasLinked2FA ? `
                                    <div class="password-change-field" style="margin-top: 10px;">
                                        <label class="password-change-label" for="email-otp-input">
                                            2FA Security Code (${escapeHtml(userData.linkedEmail ? userData.linkedEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'Linked Gmail')}) <span class="req-asterisk">*</span>
                                        </label>
                                        <div style="display: flex; gap: 8px;">
                                            <input type="text" id="email-otp-input" class="password-change-input" maxlength="6" placeholder="6-digit OTP" style="letter-spacing: 3px; font-weight: 700; font-family: monospace; text-align: center;">
                                            <button type="button" class="password-change-btn secondary" id="send-otp-btn" style="white-space: nowrap; padding: 0 14px; font-size: 13px; flex-shrink: 0;">
                                                <span>Send OTP</span>
                                            </button>
                                        </div>
                                        <div id="otp-dispatch-feedback" style="display: none; font-size: 12px; margin-top: 4px; color: #08D488;"></div>
                                    </div>
                                ` : (isStaff ? `
                                    <div style="margin-top: 8px; padding: 8px 12px; background: rgba(252, 204, 86, 0.08); border: 1px solid rgba(252, 204, 86, 0.25); border-radius: 8px; font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 8px;">
                                        <span style="color: #FCCC56; flex-shrink: 0;">${icon('shield-check')}</span>
                                        <span>Tip: Link your personal Gmail in Admin Settings to enable 2FA code verification.</span>
                                    </div>
                                ` : '')}

                                ${!isStaff && questionKey ? `
                                    <div class="password-change-field" style="margin-top: 14px;">
                                        <label class="password-change-label" for="security-answer-input">
                                            Or Security Question: <em>${escapeHtml(questionText)}</em>
                                        </label>
                                        <input type="text" id="security-answer-input" class="password-change-input" placeholder="Enter your secret answer (optional)">
                                    </div>
                                ` : ''}

                                <div class="password-change-error" id="step1-error-box" style="display: none;"></div>

                                <div class="password-change-actions">
                                    <button type="button" class="password-change-btn secondary" id="cancel-pwd-btn">Cancel</button>
                                    <button type="button" class="password-change-btn primary" id="verify-step1-btn">
                                        <span>Verify &amp; Continue</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Step 2: Set New Password -->
                        <div class="password-change-step" id="pwd-step-2" style="display: none;">
                            <div class="role-security-badge success">
                                <span class="badge-icon">${icon('check')}</span>
                                <span>Credentials Verified. Enter your new password below.</span>
                            </div>

                            <div class="password-change-form">
                                <div class="password-change-field">
                                    <label class="password-change-label" for="new-password-input">
                                        New Password <span class="req-asterisk">*</span>
                                    </label>
                                    <div class="password-input-wrapper">
                                        <input type="password" id="new-password-input" class="password-change-input" placeholder="Enter new password" autocomplete="new-password">
                                        <button type="button" class="password-toggle-btn" data-target="new-password-input" aria-label="Toggle password visibility">
                                            ${icon('eye-open')}
                                        </button>
                                    </div>
                                </div>

                                <div class="password-change-field">
                                    <label class="password-change-label" for="confirm-password-input">
                                        Confirm New Password <span class="req-asterisk">*</span>
                                    </label>
                                    <div class="password-input-wrapper">
                                        <input type="password" id="confirm-password-input" class="password-change-input" placeholder="Re-enter new password" autocomplete="new-password">
                                        <button type="button" class="password-toggle-btn" data-target="confirm-password-input" aria-label="Toggle password visibility">
                                            ${icon('eye-open')}
                                        </button>
                                    </div>
                                </div>

                                <!-- Dynamic Password Policy & Real-Time Strength Meter -->
                                <div class="pwd-dynamic-requirements-container" id="pwd-rules-checklist">
                                    <div class="pwd-strength-header">
                                        <span class="pwd-strength-label">Password Strength:</span>
                                        <span class="pwd-strength-badge" id="pwd-strength-text">Enter password</span>
                                    </div>
                                    <div class="pwd-strength-track">
                                        <div class="pwd-strength-fill" id="pwd-strength-bar"></div>
                                    </div>
                                    <div class="pwd-rules-grid">
                                        <div class="pwd-rule-item" id="rule-length">
                                            <span class="rule-icon">${icon('check')}</span>
                                            <span class="rule-text">8+ characters</span>
                                        </div>
                                        <div class="pwd-rule-item" id="rule-uppercase">
                                            <span class="rule-icon">${icon('check')}</span>
                                            <span class="rule-text">At least 1 uppercase letter (A-Z)</span>
                                        </div>
                                        <div class="pwd-rule-item" id="rule-lowercase">
                                            <span class="rule-icon">${icon('check')}</span>
                                            <span class="rule-text">At least 1 lowercase letter (a-z)</span>
                                        </div>
                                        <div class="pwd-rule-item" id="rule-number">
                                            <span class="rule-icon">${icon('check')}</span>
                                            <span class="rule-text">At least 1 number (0-9)</span>
                                        </div>
                                        <div class="pwd-rule-item" id="rule-special">
                                            <span class="rule-icon">${icon('check')}</span>
                                            <span class="rule-text">At least 1 special character (!@#$%^&*)</span>
                                        </div>
                                    </div>
                                    <div class="pwd-match-indicator" id="pwd-match-status" style="display: none;"></div>
                                </div>

                                <div class="password-change-error" id="step2-error-box" style="display: none;"></div>

                                <div class="password-change-actions">
                                    <button type="button" class="password-change-btn secondary" id="back-step1-btn">Back</button>
                                    <button type="button" class="password-change-btn primary" id="submit-pwd-change-btn">
                                        <span>Update Password</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('password-change-modal');

        // Fade in
        requestAnimationFrame(() => {
            modalEl.classList.add('active');
        });

        // Setup Countdown if locked
        if (isLocked) {
            activeLockoutInterval = setInterval(() => {
                const remaining = lockedUntil - Date.now();
                if (remaining <= 0) {
                    clearInterval(activeLockoutInterval);
                    activeLockoutInterval = null;
                    const banner = document.getElementById('security-lockout-banner');
                    if (banner) banner.style.display = 'none';
                    const step1 = document.getElementById('pwd-step-1');
                    if (step1) step1.style.display = 'block';
                } else {
                    const valEl = document.getElementById('lockout-countdown-value');
                    if (valEl) valEl.textContent = formatCountdown(remaining);
                }
            }, 1000);
        }

        bindModalEvents(modalEl, user, userData);
    }

    function bindModalEvents(modalEl, user, userData = {}) {
        let activeVerificationToken = null;
        let otpCooldownTimer = null;

        const userRole = (userData.role || userData.userType || 'student').toLowerCase();
        const isStaff = (userRole === 'admin' || userRole === 'librarian');
        const hasLinked2FA = Boolean(userData.linkedEmail && userData.linkedEmailVerified === true);

        function closeModal() {
            if (activeLockoutInterval) {
                clearInterval(activeLockoutInterval);
                activeLockoutInterval = null;
            }
            if (otpCooldownTimer) {
                clearInterval(otpCooldownTimer);
                otpCooldownTimer = null;
            }
            modalEl.classList.remove('active');
            setTimeout(() => modalEl.remove(), 250);
        }

        // Close triggers
        const closeBtn = document.getElementById('close-pwd-modal-btn');
        const overlay = document.getElementById('password-change-overlay');
        const cancelBtn = document.getElementById('cancel-pwd-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // Password show/hide toggle
        modalEl.querySelectorAll('.password-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (!input) return;
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.innerHTML = isPassword ? icon('eye-closed') : icon('eye-open');
            });
        });

        // Step 1: Verify Current Password & 2FA OTP
        const verifyBtn = document.getElementById('verify-step1-btn');
        const currentPasswordInput = document.getElementById('current-password-input');
        const securityAnswerInput = document.getElementById('security-answer-input');
        const emailOtpInput = document.getElementById('email-otp-input');
        const sendOtpBtn = document.getElementById('send-otp-btn');
        const otpFeedback = document.getElementById('otp-dispatch-feedback');
        const step1Error = document.getElementById('step1-error-box');

        // Send OTP button event handler
        if (sendOtpBtn) {
            sendOtpBtn.addEventListener('click', async () => {
                sendOtpBtn.disabled = true;
                sendOtpBtn.innerHTML = `<span>Sending...</span>`;
                step1Error.style.display = 'none';
                if (otpFeedback) otpFeedback.style.display = 'none';

                try {
                    const idToken = await user.getIdToken(true);
                    const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/email/send-otp`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${idToken}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const resJson = await resp.json().catch(() => ({}));
                    if (!resp.ok || !resJson.success) {
                        sendOtpBtn.disabled = false;
                        sendOtpBtn.innerHTML = `<span>Send OTP</span>`;
                        step1Error.textContent = resJson.error || 'Failed to dispatch 2FA OTP.';
                        step1Error.style.display = 'block';
                        return;
                    }

                    if (otpFeedback) {
                        otpFeedback.textContent = resJson.message || 'OTP code dispatched to your linked Gmail!';
                        otpFeedback.style.display = 'block';
                    }
                    if (emailOtpInput) emailOtpInput.focus();

                    let cooldown = 60;
                    sendOtpBtn.disabled = true;
                    sendOtpBtn.innerHTML = `<span>Resend (${cooldown}s)</span>`;
                    otpCooldownTimer = setInterval(() => {
                        cooldown--;
                        if (cooldown <= 0) {
                            clearInterval(otpCooldownTimer);
                            otpCooldownTimer = null;
                            sendOtpBtn.disabled = false;
                            sendOtpBtn.innerHTML = `<span>Resend OTP</span>`;
                        } else {
                            sendOtpBtn.innerHTML = `<span>Resend (${cooldown}s)</span>`;
                        }
                    }, 1000);
                } catch (err) {
                    sendOtpBtn.disabled = false;
                    sendOtpBtn.innerHTML = `<span>Send OTP</span>`;
                    step1Error.textContent = 'Network error while requesting 2FA code.';
                    step1Error.style.display = 'block';
                }
            });
        }

        verifyBtn.addEventListener('click', async () => {
            step1Error.style.display = 'none';
            step1Error.textContent = '';

            const currentPassword = (currentPasswordInput ? currentPasswordInput.value : '').trim();
            const securityAnswer = (securityAnswerInput ? securityAnswerInput.value : '').trim();
            const otp = (emailOtpInput ? emailOtpInput.value : '').trim();

            if (!currentPassword && !securityAnswer) {
                step1Error.textContent = 'Please enter your current password to continue.';
                step1Error.style.display = 'block';
                if (currentPasswordInput) currentPasswordInput.focus();
                return;
            }

            if (isStaff && hasLinked2FA && !otp) {
                step1Error.textContent = 'Please enter the 6-digit 2FA code sent to your linked Gmail.';
                step1Error.style.display = 'block';
                if (emailOtpInput) emailOtpInput.focus();
                return;
            }

            verifyBtn.disabled = true;
            verifyBtn.innerHTML = `<span>Verifying...</span>`;

            try {
                const idToken = await user.getIdToken(true);
                const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/verify-step1`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${idToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ currentPassword, securityAnswer, otp })
                });

                const data = await resp.json().catch(() => ({}));

                if (!resp.ok || !data.success) {
                    verifyBtn.disabled = false;
                    verifyBtn.innerHTML = `<span>Verify &amp; Continue</span>`;
                    step1Error.textContent = data.error || 'Verification failed. Please check your credentials.';
                    step1Error.style.display = 'block';

                    if (data.code === 'ACCOUNT_LOCKED_24H' && data.lockedUntil) {
                        const step1El = document.getElementById('pwd-step-1');
                        if (step1El) step1El.style.display = 'none';
                        const banner = document.getElementById('security-lockout-banner');
                        if (banner) banner.style.display = 'block';
                    }
                    return;
                }

                // Step 1 Passed!
                activeVerificationToken = data.verificationToken;
                document.getElementById('pwd-step-1').style.display = 'none';
                document.getElementById('pwd-step-2').style.display = 'block';
                const newPwdInput = document.getElementById('new-password-input');
                if (newPwdInput) newPwdInput.focus();

            } catch (err) {
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = `<span>Verify &amp; Continue</span>`;
                step1Error.textContent = 'Network or server error during verification. Please try again.';
                step1Error.style.display = 'block';
            }
        });

        // Step 2: Password Rules live checklist
        const newPwdInput = document.getElementById('new-password-input');
        const confirmPwdInput = document.getElementById('confirm-password-input');
        const submitChangeBtn = document.getElementById('submit-pwd-change-btn');
        const step2Error = document.getElementById('step2-error-box');
        const backBtn = document.getElementById('back-step1-btn');

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.getElementById('pwd-step-2').style.display = 'none';
                document.getElementById('pwd-step-1').style.display = 'block';
                verifyBtn.disabled = false;
                verifyBtn.innerHTML = `<span>Verify &amp; Continue</span>`;
            });
        }

        function updatePasswordValidation() {
            const val = (newPwdInput ? newPwdInput.value : '');
            const confirmVal = (confirmPwdInput ? confirmPwdInput.value : '');

            const rules = {
                'rule-length': val.length >= 8,
                'rule-uppercase': /[A-Z]/.test(val),
                'rule-lowercase': /[a-z]/.test(val),
                'rule-number': /[0-9]/.test(val),
                'rule-special': /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val)
            };

            let metCount = 0;
            for (const [id, isMet] of Object.entries(rules)) {
                const item = document.getElementById(id);
                if (!item) continue;
                if (val.length === 0) {
                    item.className = 'pwd-rule-item';
                } else if (isMet) {
                    item.className = 'pwd-rule-item met';
                    metCount++;
                } else {
                    item.className = 'pwd-rule-item unmet';
                }
            }

            const strengthBar = document.getElementById('pwd-strength-bar');
            const strengthText = document.getElementById('pwd-strength-text');
            if (strengthBar && strengthText) {
                if (val.length === 0) {
                    strengthBar.style.width = '0%';
                    strengthBar.className = 'pwd-strength-fill';
                    strengthText.textContent = 'Enter password';
                    strengthText.className = 'pwd-strength-badge';
                } else if (metCount <= 2) {
                    strengthBar.style.width = '25%';
                    strengthBar.className = 'pwd-strength-fill weak';
                    strengthText.textContent = 'Weak';
                    strengthText.className = 'pwd-strength-badge weak';
                } else if (metCount <= 4) {
                    strengthBar.style.width = '65%';
                    strengthBar.className = 'pwd-strength-fill medium';
                    strengthText.textContent = 'Moderate';
                    strengthText.className = 'pwd-strength-badge medium';
                } else {
                    strengthBar.style.width = '100%';
                    strengthBar.className = 'pwd-strength-fill strong';
                    strengthText.textContent = 'Institutional Grade';
                    strengthText.className = 'pwd-strength-badge strong';
                }
            }

            const matchStatus = document.getElementById('pwd-match-status');
            if (matchStatus) {
                if (confirmVal.length > 0) {
                    matchStatus.style.display = 'flex';
                    if (val === confirmVal) {
                        matchStatus.className = 'pwd-match-indicator match';
                        matchStatus.innerHTML = `${icon('check')} <span>Passwords match</span>`;
                    } else {
                        matchStatus.className = 'pwd-match-indicator mismatch';
                        matchStatus.innerHTML = `${icon('cross')} <span>Passwords do not match yet</span>`;
                    }
                } else {
                    matchStatus.style.display = 'none';
                }
            }

            return metCount === 5;
        }

        if (newPwdInput) {
            newPwdInput.addEventListener('input', updatePasswordValidation);
        }
        if (confirmPwdInput) {
            confirmPwdInput.addEventListener('input', updatePasswordValidation);
        }

        submitChangeBtn.addEventListener('click', async () => {
            step2Error.style.display = 'none';
            step2Error.textContent = '';

            const newPassword = (newPwdInput ? newPwdInput.value : '').trim();
            const confirmPassword = (confirmPwdInput ? confirmPwdInput.value : '').trim();

            if (!newPassword || !confirmPassword) {
                step2Error.textContent = 'Please fill in both password fields.';
                step2Error.style.display = 'block';
                return;
            }

            if (!updatePasswordValidation()) {
                step2Error.textContent = 'Please satisfy all listed password requirements.';
                step2Error.style.display = 'block';
                return;
            }

            if (newPassword !== confirmPassword) {
                step2Error.textContent = 'New passwords do not match. Please verify.';
                step2Error.style.display = 'block';
                return;
            }

            submitChangeBtn.disabled = true;
            submitChangeBtn.innerHTML = `<span>Updating Password...</span>`;

            try {
                const idToken = await user.getIdToken(true);
                const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/change-password`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${idToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        newPassword,
                        verificationToken: activeVerificationToken
                    })
                });

                const data = await resp.json().catch(() => ({}));

                if (!resp.ok || !data.success) {
                    submitChangeBtn.disabled = false;
                    submitChangeBtn.innerHTML = `<span>Update Password</span>`;
                    step2Error.textContent = data.error || 'Failed to update password. Please try again.';
                    step2Error.style.display = 'block';
                    return;
                }

                // Success!
                closeModal();
                showToast('Password updated successfully! An institutional security alert was dispatched to your email.', 'success');

            } catch (err) {
                submitChangeBtn.disabled = false;
                submitChangeBtn.innerHTML = `<span>Update Password</span>`;
                step2Error.textContent = 'Network or server error while updating password.';
                step2Error.style.display = 'block';
            }
        });
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        alert(message);
    }

    window.PasswordChange = {
        init: initPasswordChange,
        open: openPasswordChangeModal,
        openPasswordChangeModal: openPasswordChangeModal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPasswordChange);
    } else {
        initPasswordChange();
    }

    console.log('🔒 [PasswordChange] Institutional Security Module loaded (Zero-Telegram Edition)');
})();

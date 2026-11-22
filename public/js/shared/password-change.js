/**
 * ============================================================================
 * Password Change with 6-Layer Enterprise Defense Architecture
 * ============================================================================
 *
 * - Layer 1: Hard Server-Side Step-1 Gate (POST /api/auth/verify-step1)
 *            Admin/Librarian: Current Password AND exact @RecapsOtpBot 6-digit OTP match
 *            Student/Teacher: Current Password OR Security Answer verified server-side
 * - Layer 2: Persistent Firestore 3-Strike -> 24-Hour Security Lockout
 *            Enforced across Step-1 OTP, Telegram Link Code, and Telegram Change/Unlink PIN
 * - Layer 3: Strict Password Policy (Complexity, Max Length 128, Personal Info & Breached Dict Check)
 * - Layer 4: Server-Side RBAC, Admin SDK Auth, Proof-of-Possession Telegram Enrollment & PIN-Gated Unlink
 * - Layer 5: Immediate Session Revocation across all devices via admin.auth().revokeRefreshTokens
 * - Layer 6: Security Notifications (Student/Teacher: Telegram only; Admin/Librarian: Telegram + Resend Email)
 *
 * @module PasswordChange
 * @version 3.0.0
 */

(function(window) {
    'use strict';

    const QUESTION_MAP = {
        'pet': 'What was the name of your first pet?',
        'school': 'What was the name of your first school?',
        'city': 'What city were you born in?',
        'maiden': "What is your mother's maiden name?",
        'book': 'What is your favorite book?'
    };

    const CHECK_ICON_SVG = '<svg class="req-icon req-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#08D488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="rgba(8, 212, 136, 0.15)"></circle><polyline points="16 9 10 15 8 13"></polyline></svg>';
    const CIRCLE_ICON_SVG = '<svg class="req-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>';

    function icon(key, fallback = '') {
        if (typeof SVGRegistry !== 'undefined' && SVGRegistry.has(key)) {
            return SVGRegistry.get(key);
        }
        return fallback;
    }

    function getBackendUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        return 'https://recap-backend-jy5b.onrender.com';
    }

    function maskChatId(chatId) {
        const s = String(chatId || '').trim();
        if (!s) return '';
        if (s.length <= 4) return s;
        return `${'•'.repeat(Math.min(6, s.length - 4))}${s.slice(-4)}`;
    }

    function formatCountdownHMS(ms) {
        const totalSecs = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        const pad = n => String(n).padStart(2, '0');
        return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function initPasswordChange() {
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (!changePasswordBtn) {
            return;
        }
        changePasswordBtn.addEventListener('click', openPasswordChangeModal);
    }

    async function openPasswordChangeModal() {
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        if (!user) {
            showToast('Please log in to change your password.', 'error');
            return;
        }

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) {
                showToast('User profile not found in database.', 'error');
                return;
            }

            const userData = userDoc.data() || {};
            createPasswordChangeModal(userData, user);
        } catch (error) {
            console.error('[PasswordChange] Error fetching user profile:', error);
            showToast('Error loading account credentials.', 'error');
        }
    }

    /**
     * Render the Telegram 2FA status / PIN-protected Change / 2-Step Enrollment card
     */
    function buildTelegramPanelHTML(state) {
        if (state.hasTelegram && state.pendingUnlinkPin) {
            const masked = escapeHtml(state.unlinkMaskedChatId || maskChatId(state.telegramChatId));
            return `
                <div class="telegram-link-helper-card unlink-challenge" id="telegram-link-card">
                    <div class="telegram-card-header warning-accent">
                        <span class="telegram-card-icon">${icon('shield-check')}</span>
                        <span>Authorize Telegram 2FA Change</span>
                    </div>
                    <div class="telegram-card-instructions">
                        A 6-digit authorization PIN was sent to your currently linked Telegram (<strong>${masked}</strong>) via <strong>@RecapsOtpBot</strong>. Enter the exact PIN to unlink and replace it:
                    </div>
                    <div class="telegram-inline-row">
                        <input
                            type="text"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            maxlength="6"
                            id="unlink-pin-input"
                            class="password-change-input telegram-compact-input"
                            placeholder="Enter 6-digit PIN"
                            autocomplete="one-time-code"
                        >
                        <button type="button" id="confirm-unlink-pin-btn" class="password-change-btn primary telegram-compact-btn">
                            Verify &amp; Unlink
                        </button>
                    </div>
                    <div class="telegram-challenge-footer">
                        <span class="telegram-ttl-note">PIN valid 5 min. 3 wrong attempts lock account for 24h.</span>
                        <button type="button" id="cancel-unlink-pin-btn" class="telegram-text-link-btn">Cancel</button>
                    </div>
                    <div class="telegram-inline-error" id="telegram-link-error" style="display: none;"></div>
                </div>
            `;
        }

        if (state.hasTelegram) {
            const masked = escapeHtml(maskChatId(state.telegramChatId));
            const isVerified = state.telegramVerified === true;
            return `
                <div class="telegram-status-card ${isVerified ? 'verified' : 'legacy'}" id="telegram-status-card">
                    <div class="telegram-status-left">
                        <span class="telegram-status-icon">${isVerified ? icon('link-chain') : icon('alert-triangle')}</span>
                        <div class="telegram-status-meta">
                            <div class="telegram-status-title">
                                ${isVerified ? 'Telegram 2FA Verified' : 'Telegram Linked (Unverified)'}
                                <span class="telegram-status-pill ${isVerified ? 'pill-verified' : 'pill-warning'}">
                                    ${isVerified ? 'Active' : 'Needs Check'}
                                </span>
                            </div>
                            <div class="telegram-status-sub">
                                Chat ID: <strong>${masked}</strong> via <strong>@RecapsOtpBot</strong>
                            </div>
                        </div>
                    </div>
                    <button type="button" id="unlink-chat-id-btn" class="telegram-unlink-btn" title="Requires PIN verification from your current Telegram to change">
                        ${icon('unlink')}
                        <span>Change</span>
                    </button>
                </div>
            `;
        }

        if (state.pendingVerification) {
            const masked = escapeHtml(state.pendingMaskedChatId || maskChatId(state.pendingChatId));
            return `
                <div class="telegram-link-helper-card challenge-active" id="telegram-link-card">
                    <div class="telegram-card-header verified-accent">
                        <span class="telegram-card-icon">${icon('shield-check')}</span>
                        <span>Step 2 of 2: Confirm Telegram Ownership</span>
                    </div>
                    <div class="telegram-card-instructions">
                        A 6-digit verification code was sent to Chat ID <strong>${masked}</strong> via <strong>@RecapsOtpBot</strong>. Enter it below to complete 2FA linking:
                    </div>
                    <div class="telegram-inline-row">
                        <input
                            type="text"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            maxlength="6"
                            id="link-verify-code-input"
                            class="password-change-input telegram-compact-input"
                            placeholder="Enter 6-digit code"
                            autocomplete="one-time-code"
                        >
                        <button type="button" id="confirm-chat-id-btn" class="password-change-btn primary telegram-compact-btn">
                            Confirm &amp; Link
                        </button>
                    </div>
                    <div class="telegram-challenge-footer">
                        <span class="telegram-ttl-note">Code valid 5 min. 3 wrong attempts trigger 24h lockout.</span>
                        <button type="button" id="edit-chat-id-btn" class="telegram-text-link-btn">Change Chat ID</button>
                    </div>
                    <div class="telegram-inline-error" id="telegram-link-error" style="display: none;"></div>
                </div>
            `;
        }

        return `
            <div class="telegram-link-helper-card" id="telegram-link-card">
                <div class="telegram-card-header warning-accent">
                    <span class="telegram-card-icon">${icon('alert-triangle')}</span>
                    <span>Step 1 of 2: Link &amp; Verify Telegram 2FA</span>
                </div>
                <div class="telegram-card-instructions">
                    1. Open <a href="https://t.me/RecapsOtpBot" target="_blank" rel="noopener" class="telegram-bot-link">@RecapsOtpBot</a> in Telegram and click <strong>Start</strong>.<br>
                    2. Paste the numeric Chat ID it replies with to receive a 6-digit ownership code:
                </div>
                <div class="telegram-inline-row">
                    <input
                        type="text"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        maxlength="15"
                        id="link-chat-id-input"
                        class="password-change-input telegram-compact-input"
                        placeholder="Numeric Chat ID (e.g. 123456789)"
                        autocomplete="off"
                    >
                    <button type="button" id="save-chat-id-btn" class="password-change-btn secondary telegram-compact-btn">
                        Send Code
                    </button>
                </div>
                <div class="telegram-inline-error" id="telegram-link-error" style="display: none;"></div>
            </div>
        `;
    }

    function createPasswordChangeModal(userData, user) {
        const existingModal = document.getElementById('password-change-modal');
        if (existingModal) existingModal.remove();

        const userRole = (userData.role || userData.userType || 'student').toLowerCase();
        const isStaff = (userRole === 'admin' || userRole === 'librarian');
        const questionKey = userData.securityQuestion || '';
        const questionText = QUESTION_MAP[questionKey] || questionKey || 'What is your security question?';

        const lockoutInfo = (userData.securityLockout && typeof userData.securityLockout === 'object')
            ? userData.securityLockout
            : {};
        const initialLockedUntil = Number(lockoutInfo.lockedUntil) || 0;

        const telegramState = {
            hasTelegram: Boolean(userData.telegramChatId),
            telegramChatId: userData.telegramChatId ? String(userData.telegramChatId).trim() : '',
            telegramVerified: userData.telegramVerified === true,
            pendingVerification: false,
            pendingChatId: '',
            pendingMaskedChatId: '',
            pendingUnlinkPin: false,
            unlinkMaskedChatId: '',
            lockedUntil: initialLockedUntil > Date.now() ? initialLockedUntil : 0
        };

        let verificationStepHTML = '';

        if (isStaff) {
            verificationStepHTML = `
                <div class="password-change-step" id="verification-step">
                    <div class="role-security-badge staff">
                        <span class="badge-icon">${icon('shield-check')}</span>
                        <span>Staff Security: Current Password &amp; Telegram 2FA OTP Required (3 attempts max)</span>
                    </div>

                    <div class="security-lockout-banner" id="security-lockout-banner" style="display: none;">
                        <div class="lockout-banner-header">
                            <span class="lockout-banner-icon">${icon('lock-sm')}</span>
                            <span>24-Hour Security Lockout Active</span>
                        </div>
                        <p class="lockout-banner-msg" id="lockout-banner-msg">
                            Too many consecutive incorrect verification codes (3/3). Password and 2FA changes are locked for 24 hours.
                        </p>
                        <div class="lockout-countdown-row">
                            <span>Time Remaining:</span>
                            <strong id="lockout-countdown-value">24h 00m 00s</strong>
                        </div>
                    </div>

                    <div class="password-change-form">
                        <div class="password-change-field">
                            <label class="password-change-label" for="current-password-input">
                                Current Password <span class="req-asterisk">*</span>
                            </label>
                            <div class="password-input-wrapper">
                                <input type="password" id="current-password-input" class="password-change-input" placeholder="Enter your current password" autocomplete="current-password">
                                <button type="button" class="password-toggle-btn" id="toggle-current-password" aria-label="Toggle current password visibility">
                                    ${icon('eye-open')}
                                </button>
                            </div>
                        </div>

                        <div id="telegram-enrollment-slot">
                            ${buildTelegramPanelHTML(telegramState)}
                        </div>

                        <div class="password-change-field">
                            <div class="otp-label-row">
                                <label class="password-change-label" for="telegram-otp-input" style="margin-bottom: 0;">
                                    Telegram OTP Code (6 Digits) <span class="req-asterisk">*</span>
                                </label>
                                <button
                                    type="button"
                                    class="otp-send-action-btn"
                                    id="send-otp-btn"
                                    ${!telegramState.hasTelegram ? 'disabled title="Link and verify your Telegram Chat ID first"' : ''}
                                >
                                    ${icon('telegram-send')}
                                    <span>Send OTP via Telegram</span>
                                </button>
                            </div>
                            <input
                                type="text"
                                inputmode="numeric"
                                pattern="[0-9]*"
                                id="telegram-otp-input"
                                class="password-change-input"
                                placeholder="Enter 6-digit OTP from @RecapsOtpBot"
                                maxlength="6"
                                autocomplete="one-time-code"
                            >
                            <div class="telegram-bot-note">
                                Must match the exact code dispatched by <strong>@RecapsOtpBot</strong>.
                                <a href="https://t.me/RecapsOtpBot" target="_blank" rel="noopener" class="telegram-bot-link">Open Bot</a>
                            </div>
                        </div>

                        <div class="password-change-error" id="step1-error" style="display: none;"></div>

                        <div class="password-change-actions">
                            <button type="button" class="password-change-btn secondary cancel-password-modal">
                                Cancel
                            </button>
                            <button type="button" class="password-change-btn primary" id="verify-step1-btn">
                                Verify &amp; Continue
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            verificationStepHTML = `
                <div class="password-change-step" id="verification-step">
                    <div class="security-lockout-banner" id="security-lockout-banner" style="display: none;">
                        <div class="lockout-banner-header">
                            <span class="lockout-banner-icon">${icon('lock-sm')}</span>
                            <span>24-Hour Security Lockout Active</span>
                        </div>
                        <p class="lockout-banner-msg" id="lockout-banner-msg">
                            3 consecutive failed verification attempts detected. Password change is locked for 24 hours.
                        </p>
                        <div class="lockout-countdown-row">
                            <span>Time Remaining:</span>
                            <strong id="lockout-countdown-value">24h 00m 00s</strong>
                        </div>
                    </div>

                    <div class="verification-tabs">
                        <button type="button" class="verification-tab active" data-tab="security">
                            Security Question
                        </button>
                        <button type="button" class="verification-tab" data-tab="password">
                            Current Password
                        </button>
                    </div>

                    <div class="password-change-form">
                        <div id="tab-security-content" class="tab-pane active">
                            <div class="password-change-field">
                                <label class="password-change-label">Your Security Question</label>
                                <div class="password-change-question-display">
                                    ${escapeHtml(questionText)}
                                </div>
                            </div>

                            <div class="password-change-field">
                                <label class="password-change-label" for="security-answer-input">
                                    Your Answer <span class="req-asterisk">*</span>
                                </label>
                                <input type="text" id="security-answer-input" class="password-change-input" placeholder="Enter your answer" autocomplete="off">
                            </div>
                        </div>

                        <div id="tab-password-content" class="tab-pane" style="display: none;">
                            <div class="password-change-field">
                                <label class="password-change-label" for="current-password-input">
                                    Current Password <span class="req-asterisk">*</span>
                                </label>
                                <div class="password-input-wrapper">
                                    <input type="password" id="current-password-input" class="password-change-input" placeholder="Enter your current password" autocomplete="current-password">
                                    <button type="button" class="password-toggle-btn" id="toggle-current-password" aria-label="Toggle current password visibility">
                                        ${icon('eye-open')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="password-change-error" id="step1-error" style="display: none;"></div>

                        <div class="password-change-actions">
                            <button type="button" class="password-change-btn secondary cancel-password-modal">
                                Cancel
                            </button>
                            <button type="button" class="password-change-btn primary" id="verify-step1-btn">
                                Verify &amp; Continue
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        const modalHTML = `
            <div class="password-change-modal active" id="password-change-modal">
                <div class="password-change-overlay"></div>
                <div class="password-change-content">
                    <div class="password-change-header">
                        <div class="password-change-icon">
                            ${icon('lock-lg')}
                        </div>
                        <h3 class="password-change-title">Change Password</h3>
                        <p class="password-change-description">
                            ${isStaff ? 'Staff accounts require server-verified 2-Factor authentication before updating credentials.' : 'Verify your identity before updating your account password.'}
                        </p>
                    </div>

                    ${verificationStepHTML}

                    <div class="password-change-step" id="password-step" style="display: none;">
                        <div class="password-change-success-indicator">
                            ${icon('check-success')}
                            <span class="verified-label-text">Identity &amp; 2FA Verified — Set Your New Password</span>
                        </div>

                        <div class="password-change-form">
                            <div class="password-change-field">
                                <label class="password-change-label" for="new-password-input">
                                    New Password <span class="req-asterisk">*</span>
                                </label>
                                <div class="password-input-wrapper">
                                    <input
                                        type="password"
                                        id="new-password-input"
                                        class="password-change-input"
                                        placeholder="Enter new password (min. 8 characters)"
                                        autocomplete="new-password"
                                        maxlength="128"
                                    >
                                    <button type="button" class="password-toggle-btn" id="toggle-new-password" aria-label="Toggle new password visibility">
                                        ${icon('eye-open')}
                                    </button>
                                </div>
                                <div class="password-strength-container" id="password-strength-container" style="display: none;">
                                    <div class="password-strength-bar">
                                        <div class="password-strength-fill" id="password-strength-fill"></div>
                                    </div>
                                    <div class="password-strength-text" id="password-strength-text"></div>
                                </div>
                            </div>

                            <div class="password-change-field">
                                <label class="password-change-label" for="confirm-password-input">
                                    Confirm New Password <span class="req-asterisk">*</span>
                                </label>
                                <div class="password-input-wrapper">
                                    <input
                                        type="password"
                                        id="confirm-password-input"
                                        class="password-change-input"
                                        placeholder="Re-enter new password"
                                        autocomplete="new-password"
                                        maxlength="128"
                                    >
                                    <button type="button" class="password-toggle-btn" id="toggle-confirm-password" aria-label="Toggle confirm password visibility">
                                        ${icon('eye-open')}
                                    </button>
                                </div>
                                <div class="password-change-error" id="password-error" style="display: none;"></div>
                            </div>

                            <div class="password-requirements">
                                <div class="password-requirement" id="req-length">
                                    <span class="req-icon-wrapper">${icon('req-circle', CIRCLE_ICON_SVG)}</span>
                                    <span class="req-text">At least 8 characters (max 128)</span>
                                </div>
                                <div class="password-requirement" id="req-number">
                                    <span class="req-icon-wrapper">${icon('req-circle', CIRCLE_ICON_SVG)}</span>
                                    <span class="req-text">At least 1 number (0-9)</span>
                                </div>
                                <div class="password-requirement" id="req-case">
                                    <span class="req-icon-wrapper">${icon('req-circle', CIRCLE_ICON_SVG)}</span>
                                    <span class="req-text">Uppercase &amp; lowercase letters (A-Z, a-z)</span>
                                </div>
                                <div class="password-requirement" id="req-special">
                                    <span class="req-icon-wrapper">${icon('req-circle', CIRCLE_ICON_SVG)}</span>
                                    <span class="req-text">At least 1 special character (!@#$%^&amp;*...)</span>
                                </div>
                                <div class="password-requirement" id="req-match">
                                    <span class="req-icon-wrapper">${icon('req-circle', CIRCLE_ICON_SVG)}</span>
                                    <span class="req-text">Passwords match</span>
                                </div>
                            </div>

                            <div class="password-change-actions">
                                <button type="button" class="password-change-btn secondary cancel-password-modal">
                                    Cancel
                                </button>
                                <button type="button" class="password-change-btn primary" id="update-password-btn">
                                    ${icon('lock-sm')}
                                    <span>Update Password</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        setupPasswordChangeEvents(userData, user, telegramState);
    }

    function setupPasswordChangeEvents(userData, user, telegramState) {
        const modal = document.getElementById('password-change-modal');
        if (!modal) return;

        const overlay = modal.querySelector('.password-change-overlay');
        const cancelButtons = modal.querySelectorAll('.cancel-password-modal');
        const verifyStep1Btn = document.getElementById('verify-step1-btn');
        const updateBtn = document.getElementById('update-password-btn');
        const sendOtpBtn = document.getElementById('send-otp-btn');
        const otpInputEl = document.getElementById('telegram-otp-input');

        const newPasswordInput = document.getElementById('new-password-input');
        const confirmPasswordInput = document.getElementById('confirm-password-input');
        const toggleNewPassword = document.getElementById('toggle-new-password');
        const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
        const toggleCurrentPassword = document.getElementById('toggle-current-password');

        const userRole = (userData.role || userData.userType || 'student').toLowerCase();
        const isStaff = (userRole === 'admin' || userRole === 'librarian');

        let activeTab = 'security';
        let verifiedStep1Token = '';
        let otpCooldownTimer = null;
        let lockoutCountdownTimer = null;

        function clearAllTimers() {
            if (otpCooldownTimer) {
                clearInterval(otpCooldownTimer);
                otpCooldownTimer = null;
            }
            if (lockoutCountdownTimer) {
                clearInterval(lockoutCountdownTimer);
                lockoutCountdownTimer = null;
            }
        }

        function isCurrentlyLocked() {
            return Boolean(telegramState.lockedUntil && telegramState.lockedUntil > Date.now());
        }

        function applyLockoutControlState(locked) {
            const controls = [
                document.getElementById('current-password-input'),
                document.getElementById('telegram-otp-input'),
                document.getElementById('security-answer-input'),
                document.getElementById('verify-step1-btn'),
                document.getElementById('send-otp-btn'),
                document.getElementById('unlink-chat-id-btn'),
                document.getElementById('save-chat-id-btn'),
                document.getElementById('confirm-chat-id-btn'),
                document.getElementById('confirm-unlink-pin-btn'),
                document.getElementById('link-chat-id-input'),
                document.getElementById('link-verify-code-input'),
                document.getElementById('unlink-pin-input')
            ];
            controls.forEach(el => {
                if (!el) return;
                el.disabled = locked;
            });
            if (!locked) {
                syncSendOtpButtonState();
            }
        }

        function activate24HourLockout(lockedUntilMs, customMessage) {
            const targetUntil = Number(lockedUntilMs) || (Date.now() + 24 * 60 * 60 * 1000);
            telegramState.lockedUntil = targetUntil;
            telegramState.pendingUnlinkPin = false;
            telegramState.pendingVerification = false;
            verifiedStep1Token = '';

            const step2 = document.getElementById('password-step');
            const step1 = document.getElementById('verification-step');
            if (step2) step2.style.display = 'none';
            if (step1) step1.style.display = 'block';

            if (isStaff) {
                rerenderTelegramSlot();
            }

            const banner = document.getElementById('security-lockout-banner');
            const msgEl = document.getElementById('lockout-banner-msg');
            const timerEl = document.getElementById('lockout-countdown-value');
            if (banner) banner.style.display = 'block';
            if (msgEl && customMessage) msgEl.textContent = customMessage;

            applyLockoutControlState(true);

            if (lockoutCountdownTimer) clearInterval(lockoutCountdownTimer);
            const tick = () => {
                const remaining = telegramState.lockedUntil - Date.now();
                if (remaining <= 0) {
                    clearInterval(lockoutCountdownTimer);
                    lockoutCountdownTimer = null;
                    telegramState.lockedUntil = 0;
                    if (banner) banner.style.display = 'none';
                    applyLockoutControlState(false);
                    return;
                }
                if (timerEl) timerEl.textContent = formatCountdownHMS(remaining);
            };
            tick();
            lockoutCountdownTimer = setInterval(tick, 1000);
        }

        function closeModal() {
            clearAllTimers();
            document.removeEventListener('keydown', escapeHandler);
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }

        function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        }

        cancelButtons.forEach(btn => btn.addEventListener('click', closeModal));
        if (overlay) overlay.addEventListener('click', closeModal);
        document.addEventListener('keydown', escapeHandler);

        if (otpInputEl) {
            otpInputEl.addEventListener('input', () => {
                otpInputEl.value = otpInputEl.value.replace(/\D/g, '').slice(0, 6);
            });
        }

        if (toggleNewPassword && newPasswordInput) {
            toggleNewPassword.addEventListener('click', () => togglePasswordVisibility(newPasswordInput, toggleNewPassword));
        }
        if (toggleConfirmPassword && confirmPasswordInput) {
            toggleConfirmPassword.addEventListener('click', () => togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword));
        }
        if (toggleCurrentPassword) {
            toggleCurrentPassword.addEventListener('click', () => {
                const currentPassInput = document.getElementById('current-password-input');
                if (currentPassInput) togglePasswordVisibility(currentPassInput, toggleCurrentPassword);
            });
        }

        // Student/Teacher Method Tabs
        const tabButtons = modal.querySelectorAll('.verification-tab');
        tabButtons.forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                if (isCurrentlyLocked()) return;
                tabButtons.forEach(b => b.classList.remove('active'));
                tabBtn.classList.add('active');
                activeTab = tabBtn.getAttribute('data-tab');

                const secContent = document.getElementById('tab-security-content');
                const passContent = document.getElementById('tab-password-content');
                if (activeTab === 'security') {
                    if (secContent) secContent.style.display = 'block';
                    if (passContent) passContent.style.display = 'none';
                } else {
                    if (secContent) secContent.style.display = 'none';
                    if (passContent) passContent.style.display = 'block';
                }
            });
        });

        function syncSendOtpButtonState() {
            if (!sendOtpBtn) return;
            if (isCurrentlyLocked()) {
                sendOtpBtn.disabled = true;
                sendOtpBtn.title = 'Locked for 24 hours after 3 failed verification attempts';
            } else if (!telegramState.hasTelegram || telegramState.pendingUnlinkPin) {
                sendOtpBtn.disabled = true;
                sendOtpBtn.title = 'Link and verify your Telegram Chat ID first';
            } else if (!otpCooldownTimer) {
                sendOtpBtn.disabled = false;
                sendOtpBtn.title = 'Send 6-digit OTP to your linked Telegram';
            }
        }

        function showTelegramLinkError(msg) {
            const errEl = document.getElementById('telegram-link-error');
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = 'block';
            }
        }

        function rerenderTelegramSlot(focusSelector) {
            const slot = document.getElementById('telegram-enrollment-slot');
            if (!slot) return;
            slot.innerHTML = buildTelegramPanelHTML(telegramState);
            bindTelegramSlotEvents();
            syncSendOtpButtonState();
            if (isCurrentlyLocked()) {
                applyLockoutControlState(true);
            } else if (focusSelector) {
                const el = slot.querySelector(focusSelector);
                if (el) el.focus();
            }
        }

        function bindTelegramSlotEvents() {
            const chatIdInput = document.getElementById('link-chat-id-input');
            const saveChatIdBtn = document.getElementById('save-chat-id-btn');
            const verifyCodeInput = document.getElementById('link-verify-code-input');
            const confirmChatIdBtn = document.getElementById('confirm-chat-id-btn');
            const editChatIdBtn = document.getElementById('edit-chat-id-btn');
            const unlinkBtn = document.getElementById('unlink-chat-id-btn');
            const unlinkPinInput = document.getElementById('unlink-pin-input');
            const confirmUnlinkPinBtn = document.getElementById('confirm-unlink-pin-btn');
            const cancelUnlinkPinBtn = document.getElementById('cancel-unlink-pin-btn');

            if (chatIdInput) {
                chatIdInput.addEventListener('input', () => {
                    chatIdInput.value = chatIdInput.value.replace(/\D/g, '').slice(0, 15);
                    const errEl = document.getElementById('telegram-link-error');
                    if (errEl) errEl.style.display = 'none';
                    chatIdInput.classList.remove('error');
                });
            }

            if (verifyCodeInput) {
                verifyCodeInput.addEventListener('input', () => {
                    verifyCodeInput.value = verifyCodeInput.value.replace(/\D/g, '').slice(0, 6);
                    const errEl = document.getElementById('telegram-link-error');
                    if (errEl) errEl.style.display = 'none';
                    verifyCodeInput.classList.remove('error');
                });
            }

            if (unlinkPinInput) {
                unlinkPinInput.addEventListener('input', () => {
                    unlinkPinInput.value = unlinkPinInput.value.replace(/\D/g, '').slice(0, 6);
                    const errEl = document.getElementById('telegram-link-error');
                    if (errEl) errEl.style.display = 'none';
                    unlinkPinInput.classList.remove('error');
                });
            }

            // Step 1 of 2 (Enroll): Verify Chat ID live via Telegram Bot API & send 6-digit ownership code
            if (saveChatIdBtn) {
                saveChatIdBtn.addEventListener('click', async () => {
                    if (isCurrentlyLocked()) return;
                    const chatIdVal = chatIdInput ? chatIdInput.value.trim() : '';
                    if (!/^\d{5,15}$/.test(chatIdVal)) {
                        if (chatIdInput) chatIdInput.classList.add('error');
                        showTelegramLinkError('Enter a valid 5–15 digit personal Telegram Chat ID from @RecapsOtpBot.');
                        return;
                    }

                    saveChatIdBtn.disabled = true;
                    saveChatIdBtn.innerHTML = `${icon('spinner')} <span>Verifying...</span>`;

                    try {
                        const idToken = await user.getIdToken();
                        const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/telegram/save-chat-id`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({ telegramChatId: chatIdVal })
                        });
                        const resData = await resp.json().catch(() => ({}));

                        if (resData.code === 'ACCOUNT_LOCKED_24H') {
                            activate24HourLockout(resData.lockedUntil, resData.error);
                            showToast(resData.error, 'error');
                            return;
                        }

                        if (resp.ok && resData.success && resData.requiresVerification) {
                            telegramState.pendingVerification = true;
                            telegramState.pendingChatId = chatIdVal;
                            telegramState.pendingMaskedChatId = resData.maskedChatId || maskChatId(chatIdVal);
                            showToast('Verification code sent via @RecapsOtpBot. Enter the 6-digit code to finish linking.', 'success');
                            rerenderTelegramSlot('#link-verify-code-input');
                        } else {
                            if (chatIdInput) chatIdInput.classList.add('error');
                            const errMsg = resData.error || 'Could not reach this Chat ID on Telegram. Open @RecapsOtpBot and click Start first.';
                            showTelegramLinkError(errMsg);
                            showToast(errMsg, 'error');
                            saveChatIdBtn.disabled = false;
                            saveChatIdBtn.textContent = 'Send Code';
                        }
                    } catch (err) {
                        const errMsg = err.name === 'AbortError'
                            ? 'Verification timed out. Check your connection and try again.'
                            : 'Network error while verifying Telegram Chat ID.';
                        showTelegramLinkError(errMsg);
                        showToast(errMsg, 'error');
                        saveChatIdBtn.disabled = false;
                        saveChatIdBtn.textContent = 'Send Code';
                    }
                });
            }

            // Step 2 of 2 (Enroll): Confirm 6-digit Proof-of-Possession challenge code -> Save to Firestore
            if (confirmChatIdBtn) {
                confirmChatIdBtn.addEventListener('click', async () => {
                    if (isCurrentlyLocked()) return;
                    const codeVal = verifyCodeInput ? verifyCodeInput.value.trim() : '';
                    if (!/^\d{6}$/.test(codeVal)) {
                        if (verifyCodeInput) verifyCodeInput.classList.add('error');
                        showTelegramLinkError('Enter the exact 6-digit verification code from @RecapsOtpBot.');
                        return;
                    }

                    confirmChatIdBtn.disabled = true;
                    confirmChatIdBtn.innerHTML = `${icon('spinner')} <span>Confirming...</span>`;

                    try {
                        const idToken = await user.getIdToken();
                        const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/telegram/confirm-link`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({ verificationCode: codeVal })
                        });
                        const resData = await resp.json().catch(() => ({}));

                        if (resData.code === 'ACCOUNT_LOCKED_24H') {
                            activate24HourLockout(resData.lockedUntil, resData.error);
                            showToast(resData.error, 'error');
                            return;
                        }

                        if (resp.ok && resData.success) {
                            telegramState.hasTelegram = true;
                            telegramState.telegramChatId = telegramState.pendingChatId;
                            telegramState.telegramVerified = true;
                            telegramState.pendingVerification = false;
                            telegramState.pendingChatId = '';
                            userData.telegramChatId = telegramState.telegramChatId;
                            userData.telegramVerified = true;
                            showToast('Telegram 2FA verified and linked. You can now request a password-change OTP.', 'success');
                            rerenderTelegramSlot();
                        } else {
                            if (verifyCodeInput) verifyCodeInput.classList.add('error');
                            const errMsg = resData.error || 'Verification code did not match.';
                            showTelegramLinkError(errMsg);
                            showToast(errMsg, 'error');
                            if (resData.code === 'LINK_CODE_EXPIRED' || resData.code === 'NO_PENDING_LINK') {
                                telegramState.pendingVerification = false;
                                rerenderTelegramSlot('#link-chat-id-input');
                                showTelegramLinkError(errMsg);
                            } else {
                                confirmChatIdBtn.disabled = false;
                                confirmChatIdBtn.textContent = 'Confirm & Link';
                            }
                        }
                    } catch (err) {
                        const errMsg = 'Network error while confirming Telegram verification code.';
                        showTelegramLinkError(errMsg);
                        showToast(errMsg, 'error');
                        confirmChatIdBtn.disabled = false;
                        confirmChatIdBtn.textContent = 'Confirm & Link';
                    }
                });
            }

            if (editChatIdBtn) {
                editChatIdBtn.addEventListener('click', () => {
                    telegramState.pendingVerification = false;
                    rerenderTelegramSlot('#link-chat-id-input');
                });
            }

            // PIN-Protected Change / Unlink Step 1: Request 6-digit Authorization PIN to CURRENT Telegram
            if (unlinkBtn) {
                unlinkBtn.addEventListener('click', async () => {
                    if (isCurrentlyLocked()) return;
                    unlinkBtn.disabled = true;
                    unlinkBtn.innerHTML = `${icon('spinner')} <span>Sending PIN...</span>`;

                    try {
                        const idToken = await user.getIdToken();
                        const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/telegram/request-unlink-otp`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            }
                        });
                        const resData = await resp.json().catch(() => ({}));

                        if (resp.status === 404) {
                            showToast('Backend server needs a restart to enable PIN-protected Telegram changes (404).', 'error');
                            unlinkBtn.disabled = false;
                            unlinkBtn.innerHTML = `${icon('unlink')} <span>Change</span>`;
                            return;
                        }

                        if (resData.code === 'ACCOUNT_LOCKED_24H') {
                            activate24HourLockout(resData.lockedUntil, resData.error);
                            showToast(resData.error, 'error');
                            return;
                        }

                        if (resp.ok && resData.success) {
                            if (resData.requiresUnlinkPin) {
                                telegramState.pendingUnlinkPin = true;
                                telegramState.unlinkMaskedChatId = resData.maskedChatId || maskChatId(telegramState.telegramChatId);
                                showToast(resData.message || 'Authorization PIN sent to your linked Telegram.', 'info');
                                rerenderTelegramSlot('#unlink-pin-input');
                            } else {
                                // Only unreachable unverified legacy records bypass PIN so users can recover
                                const unlinkResp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/telegram/unlink`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${idToken}`
                                    },
                                    body: JSON.stringify({})
                                });
                                const unlinkData = await unlinkResp.json().catch(() => ({}));
                                if (unlinkResp.ok && unlinkData.success) {
                                    completeLocalUnlink();
                                    showToast('Unreachable legacy Chat ID removed. Link and verify your valid Chat ID below.', 'info');
                                } else {
                                    showToast(unlinkData.error || 'Failed to unlink legacy Telegram ID.', 'error');
                                    unlinkBtn.disabled = false;
                                    unlinkBtn.innerHTML = `${icon('unlink')} <span>Change</span>`;
                                }
                            }
                        } else {
                            showToast(resData.error || 'Unable to send Telegram change authorization PIN.', 'error');
                            unlinkBtn.disabled = false;
                            unlinkBtn.innerHTML = `${icon('unlink')} <span>Change</span>`;
                        }
                    } catch (err) {
                        showToast('Network error while requesting Telegram change PIN.', 'error');
                        unlinkBtn.disabled = false;
                        unlinkBtn.innerHTML = `${icon('unlink')} <span>Change</span>`;
                    }
                });
            }

            // PIN-Protected Change / Unlink Step 2: Verify exact bot PIN -> Unlink
            if (confirmUnlinkPinBtn) {
                confirmUnlinkPinBtn.addEventListener('click', async () => {
                    if (isCurrentlyLocked()) return;
                    const pinVal = unlinkPinInput ? unlinkPinInput.value.trim() : '';
                    if (!/^\d{6}$/.test(pinVal)) {
                        if (unlinkPinInput) unlinkPinInput.classList.add('error');
                        showTelegramLinkError('Enter the exact 6-digit authorization PIN sent by @RecapsOtpBot.');
                        return;
                    }

                    confirmUnlinkPinBtn.disabled = true;
                    confirmUnlinkPinBtn.innerHTML = `${icon('spinner')} <span>Verifying...</span>`;

                    try {
                        const idToken = await user.getIdToken();
                        const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/telegram/unlink`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({ unlinkPin: pinVal })
                        });
                        const resData = await resp.json().catch(() => ({}));

                        if (resData.code === 'ACCOUNT_LOCKED_24H') {
                            activate24HourLockout(resData.lockedUntil, resData.error);
                            showToast(resData.error, 'error');
                            return;
                        }

                        if (resp.ok && resData.success) {
                            completeLocalUnlink();
                            showToast('Authorization PIN matched. Previous Telegram unlinked — link and verify your new Chat ID below.', 'success');
                        } else {
                            if (unlinkPinInput) unlinkPinInput.classList.add('error');
                            const errMsg = resData.error || 'Incorrect authorization PIN.';
                            showTelegramLinkError(errMsg);
                            showToast(errMsg, 'error');
                            if (resData.code === 'UNLINK_PIN_EXPIRED' || resData.code === 'NO_PENDING_UNLINK') {
                                telegramState.pendingUnlinkPin = false;
                                rerenderTelegramSlot();
                            } else {
                                confirmUnlinkPinBtn.disabled = false;
                                confirmUnlinkPinBtn.textContent = 'Verify & Unlink';
                            }
                        }
                    } catch (err) {
                        showTelegramLinkError('Network error while verifying authorization PIN.');
                        showToast('Network error while verifying authorization PIN.', 'error');
                        confirmUnlinkPinBtn.disabled = false;
                        confirmUnlinkPinBtn.textContent = 'Verify & Unlink';
                    }
                });
            }

            if (cancelUnlinkPinBtn) {
                cancelUnlinkPinBtn.addEventListener('click', () => {
                    telegramState.pendingUnlinkPin = false;
                    rerenderTelegramSlot();
                });
            }
        }

        function completeLocalUnlink() {
            telegramState.hasTelegram = false;
            telegramState.telegramChatId = '';
            telegramState.telegramVerified = false;
            telegramState.pendingVerification = false;
            telegramState.pendingUnlinkPin = false;
            verifiedStep1Token = '';
            delete userData.telegramChatId;
            delete userData.telegramVerified;
            if (otpCooldownTimer) {
                clearInterval(otpCooldownTimer);
                otpCooldownTimer = null;
            }
            if (sendOtpBtn) {
                sendOtpBtn.innerHTML = `${icon('telegram-send')} <span>Send OTP via Telegram</span>`;
            }
            rerenderTelegramSlot('#link-chat-id-input');
        }

        if (isStaff) {
            bindTelegramSlotEvents();
            syncSendOtpButtonState();
        }

        // If user is already under persistent 24-hour lockout on modal open, lock UI immediately
        if (isCurrentlyLocked()) {
            activate24HourLockout(
                telegramState.lockedUntil,
                'Security lockout active due to 3 consecutive failed verification attempts. Password and 2FA changes are locked for 24 hours.'
            );
        }

        // Send 2FA OTP via Telegram (uses verified server-stored Chat ID ONLY)
        if (sendOtpBtn) {
            sendOtpBtn.addEventListener('click', async () => {
                if (isCurrentlyLocked()) return;
                if (!telegramState.hasTelegram) {
                    showToast('Link and verify your Telegram Chat ID first.', 'error');
                    return;
                }

                sendOtpBtn.disabled = true;
                sendOtpBtn.innerHTML = `${icon('spinner')} <span>Sending OTP...</span>`;

                try {
                    const idToken = await user.getIdToken();
                    const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/telegram/send-otp`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify({})
                    });

                    const resData = await resp.json().catch(() => ({}));

                    if (resData.code === 'ACCOUNT_LOCKED_24H') {
                        activate24HourLockout(resData.lockedUntil, resData.error);
                        showToast(resData.error, 'error');
                        return;
                    }

                    if (resp.ok && resData.success) {
                        showToast(resData.message || 'OTP sent to your linked Telegram account.', 'success');
                        if (otpInputEl) otpInputEl.focus();

                        let secs = 30;
                        sendOtpBtn.innerHTML = `${icon('check-circle')} <span>Sent (${secs}s)</span>`;
                        if (otpCooldownTimer) clearInterval(otpCooldownTimer);
                        otpCooldownTimer = setInterval(() => {
                            secs--;
                            if (secs <= 0) {
                                clearInterval(otpCooldownTimer);
                                otpCooldownTimer = null;
                                sendOtpBtn.innerHTML = `${icon('refresh')} <span>Resend OTP</span>`;
                                syncSendOtpButtonState();
                            } else {
                                sendOtpBtn.innerHTML = `${icon('check-circle')} <span>Sent (${secs}s)</span>`;
                            }
                        }, 1000);
                    } else {
                        const errMsg = resData.error || 'Failed to dispatch OTP to Telegram.';
                        showToast(errMsg, 'error');
                        const step1Error = document.getElementById('step1-error');
                        if (step1Error) {
                            step1Error.textContent = errMsg;
                            step1Error.style.display = 'block';
                        }
                        sendOtpBtn.innerHTML = `${icon('telegram-send')} <span>Send OTP via Telegram</span>`;
                        syncSendOtpButtonState();
                    }
                } catch (err) {
                    showToast('Network error while sending OTP.', 'error');
                    sendOtpBtn.innerHTML = `${icon('telegram-send')} <span>Send OTP via Telegram</span>`;
                    syncSendOtpButtonState();
                }
            });
        }

        // HARD SERVER-VERIFIED Step 1 Gate (POST /api/auth/verify-step1)
        // Will NEVER advance to Step 2 if OTP or Current Password is incorrect!
        if (verifyStep1Btn) {
            verifyStep1Btn.addEventListener('click', async () => {
                if (isCurrentlyLocked()) return;

                const errorDiv = document.getElementById('step1-error');
                if (errorDiv) errorDiv.style.display = 'none';

                let payload = {};
                let focusOnFail = null;

                if (isStaff) {
                    const currPassInput = document.getElementById('current-password-input');
                    const currPass = currPassInput ? currPassInput.value : '';
                    const otp = otpInputEl ? otpInputEl.value.trim() : '';

                    if (!currPass) {
                        showError(errorDiv, currPassInput, 'Please enter your current password.');
                        return;
                    }
                    if (!telegramState.hasTelegram) {
                        showError(errorDiv, null, 'Please link and verify your Telegram Chat ID before continuing.');
                        return;
                    }
                    if (!/^\d{6}$/.test(otp)) {
                        showError(errorDiv, otpInputEl, 'Please enter the exact 6-digit OTP code from @RecapsOtpBot.');
                        return;
                    }

                    payload = { currentPassword: currPass, otp: otp };
                    focusOnFail = otpInputEl;
                } else {
                    if (activeTab === 'security') {
                        const secAnswerInput = document.getElementById('security-answer-input');
                        const ans = secAnswerInput ? secAnswerInput.value.trim() : '';
                        if (!ans) {
                            showError(errorDiv, secAnswerInput, 'Please enter your security question answer.');
                            return;
                        }
                        payload = { securityAnswer: ans };
                        focusOnFail = secAnswerInput;
                    } else {
                        const currPassInput = document.getElementById('current-password-input');
                        const currPass = currPassInput ? currPassInput.value : '';
                        if (!currPass) {
                            showError(errorDiv, currPassInput, 'Please enter your current password.');
                            return;
                        }
                        payload = { currentPassword: currPass };
                        focusOnFail = currPassInput;
                    }
                }

                verifyStep1Btn.disabled = true;
                verifyStep1Btn.innerHTML = `${icon('spinner')} <span>Verifying...</span>`;

                try {
                    const idToken = await user.getIdToken();
                    const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/verify-step1`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify(payload)
                    });

                    const resData = await resp.json().catch(() => ({}));

                    if (resp.status === 404) {
                        const errMsg = 'Backend server needs a restart to activate Step-1 verification (404).';
                        showError(errorDiv, null, errMsg);
                        showToast(errMsg, 'error');
                        verifyStep1Btn.disabled = false;
                        verifyStep1Btn.textContent = 'Verify & Continue';
                        return;
                    }

                    if (resData.code === 'ACCOUNT_LOCKED_24H') {
                        activate24HourLockout(resData.lockedUntil, resData.error);
                        showToast(resData.error, 'error');
                        return;
                    }

                    if (resp.ok && resData.success && resData.verificationToken) {
                        verifiedStep1Token = resData.verificationToken;
                        document.getElementById('verification-step').style.display = 'none';
                        document.getElementById('password-step').style.display = 'block';
                        if (newPasswordInput) newPasswordInput.focus();
                    } else {
                        const targetInput = resData.code === 'INVALID_CURRENT_PASSWORD'
                            ? document.getElementById('current-password-input')
                            : focusOnFail;
                        const errMsg = resData.error || 'Verification failed. Check your credentials and try again.';
                        showError(errorDiv, targetInput, errMsg);
                        showToast(errMsg, 'error');
                        verifyStep1Btn.disabled = false;
                        verifyStep1Btn.textContent = 'Verify & Continue';
                    }
                } catch (err) {
                    const errMsg = err.name === 'AbortError'
                        ? 'Verification timed out. Please try again.'
                        : 'Network error during security verification.';
                    showError(errorDiv, focusOnFail, errMsg);
                    showToast(errMsg, 'error');
                    verifyStep1Btn.disabled = false;
                    verifyStep1Btn.textContent = 'Verify & Continue';
                }
            });
        }

        // Real-time password validation
        if (newPasswordInput) newPasswordInput.addEventListener('input', validatePasswordRequirements);
        if (confirmPasswordInput) confirmPasswordInput.addEventListener('input', validatePasswordRequirements);

        // Step 2 Update Password (requires single-use server-issued verificationToken)
        if (updateBtn) {
            updateBtn.addEventListener('click', async () => {
                const newPasswordVal = newPasswordInput ? newPasswordInput.value : '';
                const confirmPasswordVal = confirmPasswordInput ? confirmPasswordInput.value : '';
                const errorDiv = document.getElementById('password-error');

                if (!verifiedStep1Token) {
                    showToast('Verification session expired. Please verify Step 1 again.', 'error');
                    document.getElementById('password-step').style.display = 'none';
                    document.getElementById('verification-step').style.display = 'block';
                    return;
                }

                if (!newPasswordVal || !confirmPasswordVal) {
                    showError(errorDiv, !newPasswordVal ? newPasswordInput : confirmPasswordInput, 'Please fill in both password fields.');
                    return;
                }

                if (newPasswordVal.length < 8) {
                    showError(errorDiv, newPasswordInput, 'Password must be at least 8 characters long.');
                    return;
                }

                if (newPasswordVal.length > 128) {
                    showError(errorDiv, newPasswordInput, 'Password cannot exceed 128 characters.');
                    return;
                }

                if (!/[0-9]/.test(newPasswordVal)) {
                    showError(errorDiv, newPasswordInput, 'Password must contain at least 1 number (0-9).');
                    return;
                }

                if (!/[a-z]/.test(newPasswordVal) || !/[A-Z]/.test(newPasswordVal)) {
                    showError(errorDiv, newPasswordInput, 'Password must contain uppercase and lowercase letters.');
                    return;
                }

                if (!/[^A-Za-z0-9]/.test(newPasswordVal)) {
                    showError(errorDiv, newPasswordInput, 'Password must contain at least 1 special character.');
                    return;
                }

                if (newPasswordVal !== confirmPasswordVal) {
                    showError(errorDiv, confirmPasswordInput, 'Passwords do not match.');
                    return;
                }

                updateBtn.disabled = true;
                updateBtn.innerHTML = `${icon('spinner')} <span>Updating Securely...</span>`;

                try {
                    const idToken = await user.getIdToken();
                    const resp = await fetchWithTimeout(`${getBackendUrl()}/api/auth/change-password`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify({
                            newPassword: newPasswordVal,
                            verificationToken: verifiedStep1Token
                        })
                    });

                    const resData = await resp.json().catch(() => ({}));

                    if (resData.code === 'ACCOUNT_LOCKED_24H') {
                        activate24HourLockout(resData.lockedUntil, resData.error);
                        showToast(resData.error, 'error');
                        return;
                    }

                    if (resp.ok && resData.success) {
                        verifiedStep1Token = '';
                        if (window.ActivityService && typeof window.ActivityService.logAuth === 'function') {
                            window.ActivityService.logAuth('password_change', 'Account password successfully updated with 6-layer defense');
                        }
                        showToast('Password updated successfully. All other sessions have been revoked.', 'success');
                        closeModal();
                    } else if (resData.code === 'STEP1_REQUIRED' || resData.code === 'STEP1_EXPIRED' || resData.code === 'INVALID_STEP1_TOKEN') {
                        verifiedStep1Token = '';
                        showToast(resData.error || 'Verification session expired. Verify Step 1 again.', 'error');
                        document.getElementById('password-step').style.display = 'none';
                        document.getElementById('verification-step').style.display = 'block';
                        if (verifyStep1Btn) {
                            verifyStep1Btn.disabled = false;
                            verifyStep1Btn.textContent = 'Verify & Continue';
                        }
                        updateBtn.disabled = false;
                        updateBtn.innerHTML = `${icon('lock-sm')} <span>Update Password</span>`;
                    } else {
                        showError(errorDiv, newPasswordInput, resData.error || 'Failed to update password.');
                        updateBtn.disabled = false;
                        updateBtn.innerHTML = `${icon('lock-sm')} <span>Update Password</span>`;
                    }
                } catch (err) {
                    console.error('[PasswordChange] Update error:', err);
                    showError(errorDiv, newPasswordInput, 'Network or server error while updating password.');
                    updateBtn.disabled = false;
                    updateBtn.innerHTML = `${icon('lock-sm')} <span>Update Password</span>`;
                }
            });
        }
    }

    function togglePasswordVisibility(input, button) {
        if (input.type === 'password') {
            input.type = 'text';
            button.classList.add('active');
            if (typeof SVGRegistry !== 'undefined' && SVGRegistry.has('eye-closed')) {
                button.innerHTML = SVGRegistry.get('eye-closed');
            }
        } else {
            input.type = 'password';
            button.classList.remove('active');
            if (typeof SVGRegistry !== 'undefined' && SVGRegistry.has('eye-open')) {
                button.innerHTML = SVGRegistry.get('eye-open');
            }
        }
    }

    function setRequirementStatus(reqElement, isMet) {
        if (!reqElement) return;
        const iconWrapper = reqElement.querySelector('.req-icon-wrapper');
        if (isMet) {
            reqElement.classList.add('met');
            if (iconWrapper) iconWrapper.innerHTML = CHECK_ICON_SVG;
        } else {
            reqElement.classList.remove('met');
            if (iconWrapper) iconWrapper.innerHTML = icon('req-circle', CIRCLE_ICON_SVG);
        }
    }

    function updatePasswordStrength(password, criteria) {
        const container = document.getElementById('password-strength-container');
        const fill = document.getElementById('password-strength-fill');
        const text = document.getElementById('password-strength-text');
        if (!container || !fill || !text) return;

        if (!password) {
            container.style.display = 'none';
            fill.style.width = '0%';
            return;
        }

        container.style.display = 'flex';
        const passedCount = criteria.filter(Boolean).length;

        if (passedCount <= 1) {
            fill.style.width = '25%';
            fill.style.backgroundColor = '#ef4444';
            text.style.color = '#ef4444';
            text.textContent = 'Weak password';
        } else if (passedCount === 2) {
            fill.style.width = '50%';
            fill.style.backgroundColor = '#FCCC56';
            text.style.color = '#FCCC56';
            text.textContent = 'Fair password';
        } else if (passedCount === 3) {
            fill.style.width = '75%';
            fill.style.backgroundColor = '#FCCC56';
            text.style.color = '#FCCC56';
            text.textContent = 'Good password';
        } else {
            fill.style.width = '100%';
            fill.style.backgroundColor = '#08D488';
            text.style.color = '#08D488';
            text.textContent = 'Strong password';
        }
    }

    function validatePasswordRequirements() {
        const newPasswordInput = document.getElementById('new-password-input');
        const confirmPasswordInput = document.getElementById('confirm-password-input');
        if (!newPasswordInput || !confirmPasswordInput) return;

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        const reqLength = document.getElementById('req-length');
        const reqNumber = document.getElementById('req-number');
        const reqCase = document.getElementById('req-case');
        const reqSpecial = document.getElementById('req-special');
        const reqMatch = document.getElementById('req-match');

        const hasLength = newPassword.length >= 8 && newPassword.length <= 128;
        const hasNumber = /[0-9]/.test(newPassword);
        const hasUpper = /[A-Z]/.test(newPassword);
        const hasLower = /[a-z]/.test(newPassword);
        const hasCase = hasUpper && hasLower;
        const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
        const hasMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);

        setRequirementStatus(reqLength, hasLength);
        setRequirementStatus(reqNumber, hasNumber);
        setRequirementStatus(reqCase, hasCase);
        setRequirementStatus(reqSpecial, hasSpecial);
        setRequirementStatus(reqMatch, hasMatch);

        updatePasswordStrength(newPassword, [hasLength, hasNumber, hasCase, hasSpecial]);
    }

    function showError(errorDiv, input, message) {
        if (!errorDiv) return;
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        if (input) {
            input.classList.add('error');
            input.addEventListener('input', function clearError() {
                errorDiv.style.display = 'none';
                input.classList.remove('error');
                input.removeEventListener('input', clearError);
            });
        }
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (window.ModalDialog) {
            ModalDialog.alert({
                title: type === 'success' ? 'Password Security' : 'Security Alert',
                message: message,
                type: type === 'success' ? 'success' : 'danger'
            });
        } else {
            alert(message);
        }
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return String(text || '').replace(/[&<>"']/g, m => map[m]);
    }

    window.PasswordChange = {
        init: initPasswordChange,
        open: openPasswordChangeModal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPasswordChange);
    } else {
        initPasswordChange();
    }

    console.log('[PasswordChange] 6-Layer Security Module v3.0 loaded');

})(window);

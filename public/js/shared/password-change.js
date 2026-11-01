/**
 * ============================================================================
 * Password Change with 6-Layer Enterprise Defense Architecture
 * ============================================================================
 * 
 * - Layer 1: Step-Up Verification (Admin/Librarian: Current Password AND Telegram OTP;
 *            Student/Teacher: Current Password OR Security Question)
 * - Layer 2: Rate Limiting & Lockout Guard (10 attempts/24h, 5 failures = 1 hour lockout)
 * - Layer 3: Strict Password Policy (Complexity, Max Length 128, Personal Info Check, Breached Dict Check)
 * - Layer 4: Server-Side RBAC & Admin SDK Token Authentication
 * - Layer 5: Immediate Session Revocation across all devices via admin.auth().revokeRefreshTokens
 * - Layer 6: Security Notifications (Student/Teacher: Telegram only; Admin/Librarian: Telegram + Resend Email)
 * 
 * @module PasswordChange
 * @version 2.0.0
 */

(function(window) {
    'use strict';

    // Question mapping
    const QUESTION_MAP = {
        'pet': 'What was the name of your first pet?',
        'school': 'What was the name of your first school?',
        'city': 'What city were you born in?',
        'maiden': "What is your mother's maiden name?",
        'book': 'What is your favorite book?'
    };

    // Requirement status icons
    const CHECK_ICON_SVG = '<svg class="req-icon req-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="rgba(39, 174, 96, 0.15)"></circle><polyline points="16 9 10 15 8 13"></polyline></svg>';
    const CIRCLE_ICON_SVG = '<svg class="req-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>';

    function getBackendUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        return 'https://recap-backend-jy5b.onrender.com';
    }

    /**
     * Initialize password change modal
     */
    function initPasswordChange() {
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (!changePasswordBtn) {
            return;
        }
        changePasswordBtn.addEventListener('click', openPasswordChangeModal);
    }

    /**
     * Open password change modal
     */
    async function openPasswordChangeModal() {
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        if (!user) {
            showToast('❌ Please log in to change your password', 'error');
            return;
        }

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) {
                showToast('❌ User profile not found in database', 'error');
                return;
            }

            const userData = userDoc.data() || {};
            createPasswordChangeModal(userData, user);
        } catch (error) {
            console.error('[PasswordChange] Error fetching user profile:', error);
            showToast('❌ Error loading account credentials', 'error');
        }
    }

    /**
     * Create password change modal
     */
    function createPasswordChangeModal(userData, user) {
        const existingModal = document.getElementById('password-change-modal');
        if (existingModal) existingModal.remove();

        const userRole = (userData.role || userData.userType || 'student').toLowerCase();
        const isStaff = (userRole === 'admin' || userRole === 'librarian');
        const questionKey = userData.securityQuestion || '';
        const questionText = QUESTION_MAP[questionKey] || questionKey || 'What is your security question?';
        const hasTelegram = Boolean(userData.telegramChatId);

        let verificationStepHTML = '';

        if (isStaff) {
            // ADMIN & LIBRARIAN: MUST be Current Password AND Telegram OTP
            verificationStepHTML = `
                <div class="password-change-step" id="verification-step">
                    <div class="role-security-badge staff">
                        <span class="badge-icon">🛡️</span>
                        <span>Staff Security: Current Password &amp; Telegram 2FA OTP Required</span>
                    </div>

                    <div class="password-change-form">
                        <div class="password-change-field">
                            <label class="password-change-label" for="current-password-input">
                                Current Password <span style="color: #e74c3c;">*</span>
                            </label>
                            <div class="password-input-wrapper">
                                <input type="password" id="current-password-input" class="password-change-input" placeholder="Enter your current password" autocomplete="current-password">
                                <button type="button" class="password-toggle-btn" id="toggle-current-password">
                                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('eye-open') : ''}
                                </button>
                            </div>
                        </div>

                        <div class="password-change-field">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <label class="password-change-label" for="telegram-otp-input" style="margin-bottom: 0;">
                                    Telegram OTP Code (6 Digits) <span style="color: #e74c3c;">*</span>
                                </label>
                                <button type="button" class="otp-send-action-btn" id="send-otp-btn">
                                    📲 Send OTP via Telegram
                                </button>
                            </div>
                            <input type="text" id="telegram-otp-input" class="password-change-input" placeholder="Enter 6-digit OTP" maxlength="6" autocomplete="one-time-code">
                            <div class="telegram-bot-note">
                                Sent via <strong>@RecapsOtpBot</strong> on Telegram.
                                <a href="https://t.me/RecapsOtpBot" target="_blank" rel="noopener" style="color: #08D488; text-decoration: underline; margin-left: 4px;">Open Bot</a>
                            </div>
                        </div>

                        ${!hasTelegram ? `
                            <div class="telegram-link-helper-card">
                                <div style="font-size: 0.8125rem; font-weight: 600; color: #f59e0b; margin-bottom: 0.25rem;">
                                    ⚠️ Telegram Chat ID Not Linked
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary, #999); margin-bottom: 0.5rem;">
                                    1. Open <a href="https://t.me/RecapsOtpBot" target="_blank" style="color: #08D488; font-weight: 600;">@RecapsOtpBot</a> and click <strong>Start</strong>.<br>
                                    2. Paste the Chat ID it sends you below:
                                </div>
                                <div style="display: flex; gap: 0.5rem;">
                                    <input type="text" id="link-chat-id-input" class="password-change-input" placeholder="Paste Telegram Chat ID (e.g. 123456789)" style="padding: 0.5rem 0.75rem; font-size: 0.8125rem;">
                                    <button type="button" id="save-chat-id-btn" class="password-change-btn secondary" style="min-height: 38px; padding: 0.5rem 1rem; font-size: 0.8125rem; white-space: nowrap;">
                                        Link Chat ID
                                    </button>
                                </div>
                            </div>
                        ` : ''}

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
            // STUDENT & TEACHER: Current Password OR Security Question
            verificationStepHTML = `
                <div class="password-change-step" id="verification-step">
                    <div class="verification-tabs">
                        <button type="button" class="verification-tab active" data-tab="security">
                            Security Question
                        </button>
                        <button type="button" class="verification-tab" data-tab="password">
                            Current Password
                        </button>
                    </div>

                    <div class="password-change-form">
                        <!-- Method 1: Security Question -->
                        <div id="tab-security-content" class="tab-pane active">
                            <div class="password-change-field">
                                <label class="password-change-label">Your Security Question</label>
                                <div class="password-change-question-display">
                                    ${escapeHtml(questionText)}
                                </div>
                            </div>

                            <div class="password-change-field">
                                <label class="password-change-label" for="security-answer-input">
                                    Your Answer <span style="color: #e74c3c;">*</span>
                                </label>
                                <input type="text" id="security-answer-input" class="password-change-input" placeholder="Enter your answer" autocomplete="off">
                            </div>
                        </div>

                        <!-- Method 2: Current Password -->
                        <div id="tab-password-content" class="tab-pane" style="display: none;">
                            <div class="password-change-field">
                                <label class="password-change-label" for="current-password-input">
                                    Current Password <span style="color: #e74c3c;">*</span>
                                </label>
                                <div class="password-input-wrapper">
                                    <input type="password" id="current-password-input" class="password-change-input" placeholder="Enter your current password" autocomplete="current-password">
                                    <button type="button" class="password-toggle-btn" id="toggle-current-password">
                                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('eye-open') : ''}
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
                    <!-- Header -->
                    <div class="password-change-header">
                        <div class="password-change-icon">
                            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('lock-lg') : ''}
                        </div>
                        <h3 class="password-change-title">Change Password</h3>
                        <p class="password-change-description">
                            ${isStaff ? 'Staff accounts require 2-Factor authentication before updating credentials.' : 'Verify your identity before updating your account password.'}
                        </p>
                    </div>

                    <!-- Step 1: Verification -->
                    ${verificationStepHTML}

                    <!-- Step 2: New Password (initially hidden) -->
                    <div class="password-change-step" id="password-step" style="display: none;">
                        <div class="password-change-success-indicator">
                            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('check-success') : ''}
                            <span style="color: #27ae60; font-weight: 600;">Identity Verified</span>
                        </div>

                        <div class="password-change-form">
                            <div class="password-change-field">
                                <label class="password-change-label" for="new-password-input">
                                    New Password <span style="color: #e74c3c;">*</span>
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
                                    <button type="button" class="password-toggle-btn" id="toggle-new-password">
                                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('eye-open') : ''}
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
                                    Confirm New Password <span style="color: #e74c3c;">*</span>
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
                                    <button type="button" class="password-toggle-btn" id="toggle-confirm-password">
                                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('eye-open') : ''}
                                    </button>
                                </div>
                                <div class="password-change-error" id="password-error" style="display: none;"></div>
                            </div>

                            <div class="password-requirements">
                                <div class="password-requirement" id="req-length">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">At least 8 characters (max 128)</span>
                                </div>
                                <div class="password-requirement" id="req-number">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">At least 1 number (0-9)</span>
                                </div>
                                <div class="password-requirement" id="req-case">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">Uppercase &amp; lowercase letters (A-Z, a-z)</span>
                                </div>
                                <div class="password-requirement" id="req-special">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">At least 1 special character (!@#$%^&*...)</span>
                                </div>
                                <div class="password-requirement" id="req-match">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">Passwords match</span>
                                </div>
                            </div>

                            <div class="password-change-actions">
                                <button type="button" class="password-change-btn secondary cancel-password-modal">
                                    Cancel
                                </button>
                                <button type="button" class="password-change-btn primary" id="update-password-btn">
                                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('lock-sm') : ''}
                                    Update Password
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        setupPasswordChangeEvents(userData, user);
    }

    /**
     * Setup event listeners for password change modal
     */
    function setupPasswordChangeEvents(userData, user) {
        const modal = document.getElementById('password-change-modal');
        if (!modal) return;

        const overlay = modal.querySelector('.password-change-overlay');
        const cancelButtons = modal.querySelectorAll('.cancel-password-modal');
        const verifyStep1Btn = document.getElementById('verify-step1-btn');
        const updateBtn = document.getElementById('update-password-btn');
        const sendOtpBtn = document.getElementById('send-otp-btn');
        const saveChatIdBtn = document.getElementById('save-chat-id-btn');

        const newPasswordInput = document.getElementById('new-password-input');
        const confirmPasswordInput = document.getElementById('confirm-password-input');
        const toggleNewPassword = document.getElementById('toggle-new-password');
        const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
        const toggleCurrentPassword = document.getElementById('toggle-current-password');

        const userRole = (userData.role || userData.userType || 'student').toLowerCase();
        const isStaff = (userRole === 'admin' || userRole === 'librarian');

        let activeTab = 'security'; // for student/teacher
        let verifiedCredentials = {};

        function closeModal() {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }

        cancelButtons.forEach(btn => btn.addEventListener('click', closeModal));
        if (overlay) overlay.addEventListener('click', closeModal);

        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        });

        // Toggle password visibility
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

        // Send OTP via Telegram button
        if (sendOtpBtn) {
            sendOtpBtn.addEventListener('click', async () => {
                sendOtpBtn.disabled = true;
                const origText = sendOtpBtn.innerHTML;
                sendOtpBtn.innerHTML = '⏳ Sending OTP...';

                try {
                    const idToken = await user.getIdToken();
                    const linkChatInput = document.getElementById('link-chat-id-input');
                    const tempChatId = linkChatInput ? linkChatInput.value.trim() : '';

                    const resp = await fetch(`${getBackendUrl()}/api/auth/telegram/send-otp`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify({ telegramChatId: tempChatId })
                    });

                    const resData = await resp.json().catch(() => ({}));
                    if (resp.ok && resData.success) {
                        showToast('📲 OTP sent to your Telegram account!', 'success');
                        sendOtpBtn.innerHTML = '✅ OTP Sent!';
                        setTimeout(() => {
                            sendOtpBtn.disabled = false;
                            sendOtpBtn.innerHTML = '🔄 Resend OTP';
                        }, 30000);
                    } else {
                        showToast(`❌ ${resData.error || 'Failed to dispatch OTP'}`, 'error');
                        sendOtpBtn.disabled = false;
                        sendOtpBtn.innerHTML = origText;
                    }
                } catch (err) {
                    showToast('❌ Network error while sending OTP', 'error');
                    sendOtpBtn.disabled = false;
                    sendOtpBtn.innerHTML = origText;
                }
            });
        }

        // Link Telegram Chat ID button
        if (saveChatIdBtn) {
            saveChatIdBtn.addEventListener('click', async () => {
                const linkChatInput = document.getElementById('link-chat-id-input');
                const chatIdVal = linkChatInput ? linkChatInput.value.trim() : '';
                if (!chatIdVal) {
                    showToast('Please enter your Telegram Chat ID', 'error');
                    return;
                }

                saveChatIdBtn.disabled = true;
                saveChatIdBtn.textContent = 'Linking...';

                try {
                    const idToken = await user.getIdToken();
                    const resp = await fetch(`${getBackendUrl()}/api/auth/telegram/save-chat-id`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify({ telegramChatId: chatIdVal })
                    });
                    const resData = await resp.json().catch(() => ({}));

                    if (resp.ok && resData.success) {
                        showToast('✅ Telegram account linked successfully!', 'success');
                        const card = modal.querySelector('.telegram-link-helper-card');
                        if (card) {
                            card.innerHTML = `<div style="color: #27ae60; font-size: 0.8125rem; font-weight: 600;">✅ Telegram linked! You can now click "Send OTP via Telegram".</div>`;
                        }
                    } else {
                        showToast(`❌ ${resData.error || 'Failed to link Telegram'}`, 'error');
                        saveChatIdBtn.disabled = false;
                        saveChatIdBtn.textContent = 'Link Chat ID';
                    }
                } catch (err) {
                    showToast('❌ Network error linking Telegram', 'error');
                    saveChatIdBtn.disabled = false;
                    saveChatIdBtn.textContent = 'Link Chat ID';
                }
            });
        }

        // Step 1 Verification
        if (verifyStep1Btn) {
            verifyStep1Btn.addEventListener('click', () => {
                const errorDiv = document.getElementById('step1-error');
                if (errorDiv) errorDiv.style.display = 'none';

                if (isStaff) {
                    const currPassInput = document.getElementById('current-password-input');
                    const otpInput = document.getElementById('telegram-otp-input');
                    const currPass = currPassInput ? currPassInput.value : '';
                    const otp = otpInput ? otpInput.value.trim() : '';

                    if (!currPass) {
                        showError(errorDiv, currPassInput, 'Please enter your current password');
                        return;
                    }
                    if (!otp || otp.length !== 6) {
                        showError(errorDiv, otpInput, 'Please enter the 6-digit OTP code from Telegram');
                        return;
                    }

                    verifiedCredentials = {
                        currentPassword: currPass,
                        otp: otp
                    };

                    // Reveal Step 2
                    document.getElementById('verification-step').style.display = 'none';
                    document.getElementById('password-step').style.display = 'block';
                    if (newPasswordInput) newPasswordInput.focus();

                } else {
                    if (activeTab === 'security') {
                        const secAnswerInput = document.getElementById('security-answer-input');
                        const ans = secAnswerInput ? secAnswerInput.value.trim() : '';
                        if (!ans) {
                            showError(errorDiv, secAnswerInput, 'Please enter your security question answer');
                            return;
                        }

                        // Compare case-insensitively with stored answer
                        const stored = (userData.securityAnswer || '').toString().trim().toLowerCase();
                        if (ans.toLowerCase() !== stored) {
                            showError(errorDiv, secAnswerInput, 'Incorrect security answer. Please try again.');
                            return;
                        }

                        verifiedCredentials = { securityAnswer: ans };
                    } else {
                        const currPassInput = document.getElementById('current-password-input');
                        const currPass = currPassInput ? currPassInput.value : '';
                        if (!currPass) {
                            showError(errorDiv, currPassInput, 'Please enter your current password');
                            return;
                        }
                        verifiedCredentials = { currentPassword: currPass };
                    }

                    // Reveal Step 2
                    document.getElementById('verification-step').style.display = 'none';
                    document.getElementById('password-step').style.display = 'block';
                    if (newPasswordInput) newPasswordInput.focus();
                }
            });
        }

        // Real-time password validation
        if (newPasswordInput) newPasswordInput.addEventListener('input', validatePasswordRequirements);
        if (confirmPasswordInput) confirmPasswordInput.addEventListener('input', validatePasswordRequirements);

        // Step 2 Update Password
        if (updateBtn) {
            updateBtn.addEventListener('click', async () => {
                const newPasswordVal = newPasswordInput ? newPasswordInput.value : '';
                const confirmPasswordVal = confirmPasswordInput ? confirmPasswordInput.value : '';
                const errorDiv = document.getElementById('password-error');

                if (!newPasswordVal || !confirmPasswordVal) {
                    showError(errorDiv, !newPasswordVal ? newPasswordInput : confirmPasswordInput, 'Please fill in both password fields');
                    return;
                }

                if (newPasswordVal.length < 8) {
                    showError(errorDiv, newPasswordInput, 'Password must be at least 8 characters long');
                    return;
                }

                if (newPasswordVal.length > 128) {
                    showError(errorDiv, newPasswordInput, 'Password cannot exceed 128 characters');
                    return;
                }

                if (!/[0-9]/.test(newPasswordVal)) {
                    showError(errorDiv, newPasswordInput, 'Password must contain at least 1 number (0-9)');
                    return;
                }

                if (!/[a-z]/.test(newPasswordVal) || !/[A-Z]/.test(newPasswordVal)) {
                    showError(errorDiv, newPasswordInput, 'Password must contain uppercase and lowercase letters');
                    return;
                }

                if (!/[^A-Za-z0-9]/.test(newPasswordVal)) {
                    showError(errorDiv, newPasswordInput, 'Password must contain at least 1 special character');
                    return;
                }

                if (newPasswordVal !== confirmPasswordVal) {
                    showError(errorDiv, confirmPasswordInput, 'Passwords do not match');
                    return;
                }

                updateBtn.disabled = true;
                updateBtn.innerHTML = `${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('spinner') : ''} Updating Securely...`;

                try {
                    const idToken = await user.getIdToken();
                    const payload = {
                        newPassword: newPasswordVal,
                        ...verifiedCredentials
                    };

                    const resp = await fetch(`${getBackendUrl()}/api/auth/change-password`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify(payload)
                    });

                    const resData = await resp.json().catch(() => ({}));

                    if (resp.ok && resData.success) {
                        if (window.ActivityService && typeof window.ActivityService.logAuth === 'function') {
                            window.ActivityService.logAuth('password_change', 'Account password successfully updated with 6-layer defense');
                        }
                        showToast('✅ Password updated successfully! All other sessions revoked.', 'success');
                        closeModal();
                    } else {
                        showError(errorDiv, newPasswordInput, resData.error || 'Failed to update password');
                        updateBtn.disabled = false;
                        updateBtn.innerHTML = `${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('lock-sm') : ''} Update Password`;
                    }
                } catch (err) {
                    console.error('[PasswordChange] Update error:', err);
                    showError(errorDiv, newPasswordInput, 'Network or server error while updating password');
                    updateBtn.disabled = false;
                    updateBtn.innerHTML = `${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('lock-sm') : ''} Update Password`;
                }
            });
        }
    }

    /**
     * Toggle password visibility
     */
    function togglePasswordVisibility(input, button) {
        if (input.type === 'password') {
            input.type = 'text';
            button.classList.add('active');
        } else {
            input.type = 'password';
            button.classList.remove('active');
        }
    }

    /**
     * Set requirement status with icon and class
     */
    function setRequirementStatus(reqElement, isMet) {
        if (!reqElement) return;
        const iconWrapper = reqElement.querySelector('.req-icon-wrapper');
        if (isMet) {
            reqElement.classList.add('met');
            if (iconWrapper) iconWrapper.innerHTML = CHECK_ICON_SVG;
        } else {
            reqElement.classList.remove('met');
            if (iconWrapper) iconWrapper.innerHTML = (typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG;
        }
    }

    /**
     * Update password strength meter
     */
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
            fill.style.backgroundColor = '#e74c3c';
            text.style.color = '#e74c3c';
            text.textContent = 'Weak password';
        } else if (passedCount === 2) {
            fill.style.width = '50%';
            fill.style.backgroundColor = '#e67e22';
            text.style.color = '#e67e22';
            text.textContent = 'Fair password';
        } else if (passedCount === 3) {
            fill.style.width = '75%';
            fill.style.backgroundColor = '#f39c12';
            text.style.color = '#f39c12';
            text.textContent = 'Good password';
        } else {
            fill.style.width = '100%';
            fill.style.backgroundColor = '#27ae60';
            text.style.color = '#27ae60';
            text.textContent = 'Strong password';
        }
    }

    /**
     * Validate password requirements in real-time
     */
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

    /**
     * Show error message
     */
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

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (window.ModalDialog) {
            ModalDialog.alert({
                title: type === 'success' ? 'Password Updated' : 'Security Alert',
                message: message,
                type: type === 'success' ? 'success' : 'danger'
            });
        } else {
            alert(message);
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
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

    // Export module
    window.PasswordChange = {
        init: initPasswordChange,
        open: openPasswordChangeModal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPasswordChange);
    } else {
        initPasswordChange();
    }

    console.log('[PasswordChange] 6-Layer Security Module loaded');

})(window);

/**
 * ============================================================================
 * Password Change with Security Question Verification
 * ============================================================================
 * 
 * Allows users to change their password after verifying their security question
 * 
 * @module PasswordChange
 * @version 1.0.0
 */

(function(window) {
    'use strict';

    // Question mapping (same as registration)
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

    /**
     * Initialize password change modal
     */
    function initPasswordChange() {
        const changePasswordBtn = document.getElementById('change-password-btn');
        
        if (!changePasswordBtn) {
            console.warn('[PasswordChange] Button not found on this page');
            return;
        }

        changePasswordBtn.addEventListener('click', openPasswordChangeModal);
    }

    /**
     * Open password change modal
     */
    async function openPasswordChangeModal() {
        // Get current user
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        
        if (!user) {
            showToast('❌ Please log in to change your password', 'error');
            return;
        }

        try {
            // Fetch user data from Firestore
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (!userDoc.exists) {
                showToast('❌ User data not found', 'error');
                return;
            }

            const userData = userDoc.data();

            // Check if user has security question set
            if (!userData.securityQuestion || !userData.securityAnswer) {
                showToast('❌ No security question set. Please contact admin.', 'error');
                return;
            }

            // Get readable question text
            const questionText = QUESTION_MAP[userData.securityQuestion] || userData.securityQuestion;

            // Create and show modal
            createPasswordChangeModal(questionText, userData.securityAnswer, user);

        } catch (error) {
            console.error('[PasswordChange] Error fetching user data:', error);
            showToast('❌ Error loading security question', 'error');
        }
    }

    /**
     * Create password change modal
     * @param {string} questionText - Security question text
     * @param {string} correctAnswer - Stored security answer
     * @param {firebase.User} user - Current Firebase user
     */
    function createPasswordChangeModal(questionText, correctAnswer, user) {
        // Remove existing modal if present
        const existingModal = document.getElementById('password-change-modal');
        if (existingModal) {
            existingModal.remove();
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
                            For security, please answer your security question before changing your password.
                        </p>
                    </div>

                    <!-- Security Question Verification -->
                    <div class="password-change-step" id="security-step">
                        <div class="password-change-form">
                            <div class="password-change-field">
                                <label class="password-change-label">Security Question</label>
                                <div class="password-change-question-display">
                                    ${escapeHtml(questionText)}
                                </div>
                            </div>

                            <div class="password-change-field">
                                <label class="password-change-label" for="security-answer-input">
                                    Your Answer <span style="color: #e74c3c;">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    id="security-answer-input" 
                                    class="password-change-input"
                                    placeholder="Enter your answer"
                                    autocomplete="off"
                                >
                                <div class="password-change-error" id="security-error" style="display: none;"></div>
                            </div>

                            <button class="password-change-btn primary" id="verify-security-btn">
                                Verify & Continue
                            </button>
                        </div>
                    </div>

                    <!-- New Password Step (hidden initially) -->
                    <div class="password-change-step" id="password-step" style="display: none;">
                        <div class="password-change-success-indicator">
                            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('check-success') : ''}
                            <span style="color: #27ae60; font-weight: 600;">Security Question Verified</span>
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
                                    <span class="req-text">At least 8 characters</span>
                                </div>
                                <div class="password-requirement" id="req-number">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">At least 1 number (0-9)</span>
                                </div>
                                <div class="password-requirement" id="req-case">
                                    <span class="req-icon-wrapper">${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG}</span>
                                    <span class="req-text">Uppercase & lowercase letters (A-Z, a-z)</span>
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

                            <button class="password-change-btn primary" id="update-password-btn">
                                ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('lock-sm') : ''}
                                Update Password
                            </button>
                        </div>
                    </div>

                    <!-- Cancel Button -->
                    <button class="password-change-btn secondary" id="cancel-password-change">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Initialize event listeners
        setupPasswordChangeEvents(correctAnswer, user);
    }

    /**
     * Setup event listeners for password change modal
     */
    function setupPasswordChangeEvents(correctAnswer, user) {
        const modal = document.getElementById('password-change-modal');
        const overlay = modal.querySelector('.password-change-overlay');
        const cancelBtn = document.getElementById('cancel-password-change');
        const verifyBtn = document.getElementById('verify-security-btn');
        const updateBtn = document.getElementById('update-password-btn');
        const securityInput = document.getElementById('security-answer-input');
        const newPasswordInput = document.getElementById('new-password-input');
        const confirmPasswordInput = document.getElementById('confirm-password-input');
        const toggleNewPassword = document.getElementById('toggle-new-password');
        const toggleConfirmPassword = document.getElementById('toggle-confirm-password');

        // Close modal function
        function closeModal() {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }

        // Cancel and overlay click
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);

        // Escape key to close
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        });

        // Toggle password visibility
        toggleNewPassword.addEventListener('click', () => {
            togglePasswordVisibility(newPasswordInput, toggleNewPassword);
        });

        toggleConfirmPassword.addEventListener('click', () => {
            togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword);
        });

        // Verify security question
        verifyBtn.addEventListener('click', () => {
            verifySecurityAnswer(correctAnswer);
        });

        // Enter key on security input
        securityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifySecurityAnswer(correctAnswer);
            }
        });

        // Update password
        updateBtn.addEventListener('click', () => {
            updatePassword(user, closeModal);
        });

        // Real-time password validation
        newPasswordInput.addEventListener('input', validatePasswordRequirements);
        confirmPasswordInput.addEventListener('input', validatePasswordRequirements);
    }

    /**
     * Verify security answer
     */
    function verifySecurityAnswer(correctAnswer) {
        const input = document.getElementById('security-answer-input');
        const errorDiv = document.getElementById('security-error');
        const userAnswer = input.value.trim();

        if (!userAnswer) {
            showError(errorDiv, input, 'Please enter your answer');
            return;
        }

        // Case-insensitive comparison
        if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
            // Correct answer - show password step
            document.getElementById('security-step').style.display = 'none';
            document.getElementById('password-step').style.display = 'block';
            document.getElementById('new-password-input').focus();
        } else {
            // Incorrect answer
            showError(errorDiv, input, 'Incorrect answer. Please try again.');
            input.value = '';
        }
    }

    /**
     * Update password
     */
    async function updatePassword(user, closeModal) {
        const newPasswordInput = document.getElementById('new-password-input');
        const confirmPasswordInput = document.getElementById('confirm-password-input');
        const errorDiv = document.getElementById('password-error');
        const updateBtn = document.getElementById('update-password-btn');

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validation
        if (!newPassword || !confirmPassword) {
            showError(errorDiv, !newPassword ? newPasswordInput : confirmPasswordInput, 'Please fill in both password fields');
            return;
        }

        if (newPassword.length < 8) {
            showError(errorDiv, newPasswordInput, 'Password must be at least 8 characters long');
            return;
        }

        if (!/[0-9]/.test(newPassword)) {
            showError(errorDiv, newPasswordInput, 'Password must contain at least 1 number (0-9)');
            return;
        }

        if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
            showError(errorDiv, newPasswordInput, 'Password must contain both uppercase and lowercase letters');
            return;
        }

        if (!/[^A-Za-z0-9]/.test(newPassword)) {
            showError(errorDiv, newPasswordInput, 'Password must contain at least 1 special character (e.g. !@#$%^&*)');
            return;
        }

        if (newPassword !== confirmPassword) {
            showError(errorDiv, confirmPasswordInput, 'Passwords do not match');
            return;
        }

        // Disable button and show loading
        updateBtn.disabled = true;
        updateBtn.innerHTML = `
            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('spinner') : ''}
            Updating...`;

        try {
            // Update password in Firebase Auth
            await user.updatePassword(newPassword);

            // Log activity
            if (window.ActivityService && typeof window.ActivityService.logAuth === 'function') {
                window.ActivityService.logAuth('password_change', 'Account password successfully updated');
            }

            // Success
            showToast('✅ Password updated successfully!', 'success');
            closeModal();

        } catch (error) {
            console.error('[PasswordChange] Error updating password:', error);
            
            let errorMessage = 'Failed to update password';
            
            if (error.code === 'auth/requires-recent-login') {
                errorMessage = 'Please log out and log back in, then try again';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password is too weak';
            }

            showError(errorDiv, newPasswordInput, errorMessage);
            
            // Re-enable button
            updateBtn.disabled = false;
            updateBtn.innerHTML = `
                ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('lock-sm') : ''}
                Update Password
            `;
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
            if (iconWrapper) {
                iconWrapper.innerHTML = CHECK_ICON_SVG;
            }
        } else {
            reqElement.classList.remove('met');
            if (iconWrapper) {
                iconWrapper.innerHTML = (typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : CIRCLE_ICON_SVG;
            }
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

        const hasLength = newPassword.length >= 8;
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
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        input.classList.add('error');
        
        // Remove error on input
        input.addEventListener('input', function clearError() {
            errorDiv.style.display = 'none';
            input.classList.remove('error');
            input.removeEventListener('input', clearError);
        });
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (window.ModalDialog) {
            ModalDialog.alert({
                title: type === 'success' ? 'Password Updated' : 'Password Error',
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

    // ========================================================================
    // EXPORTS & INITIALIZATION
    // ========================================================================

    window.PasswordChange = {
        init: initPasswordChange,
        open: openPasswordChangeModal
    };

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPasswordChange);
    } else {
        initPasswordChange();
    }

    console.log('[PasswordChange] Module loaded');

})(window);

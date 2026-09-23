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
                                        placeholder="Enter new password (min. 6 characters)"
                                        autocomplete="new-password"
                                    >
                                    <button type="button" class="password-toggle-btn" id="toggle-new-password">
                                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('eye-open') : ''}
                                    </button>
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
                                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : ''}
                                    At least 6 characters
                                </div>
                                <div class="password-requirement" id="req-match">
                                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('req-circle') : ''}
                                    Passwords match
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
            showError(errorDiv, newPasswordInput, 'Please fill in both password fields');
            return;
        }

        if (newPassword.length < 6) {
            showError(errorDiv, newPasswordInput, 'Password must be at least 6 characters');
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
     * Validate password requirements in real-time
     */
    function validatePasswordRequirements() {
        const newPassword = document.getElementById('new-password-input').value;
        const confirmPassword = document.getElementById('confirm-password-input').value;

        const reqLength = document.getElementById('req-length');
        const reqMatch = document.getElementById('req-match');

        // Length requirement
        if (newPassword.length >= 6) {
            reqLength.classList.add('met');
        } else {
            reqLength.classList.remove('met');
        }

        // Match requirement
        if (newPassword && confirmPassword && newPassword === confirmPassword) {
            reqMatch.classList.add('met');
        } else {
            reqMatch.classList.remove('met');
        }
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
            window.showToast(message, type === 'success' ? '✅' : '❌');
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

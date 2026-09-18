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
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
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
                                        <svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
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
                                        <svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    </button>
                                </div>
                                <div class="password-change-error" id="password-error" style="display: none;"></div>
                            </div>

                            <div class="password-requirements">
                                <div class="password-requirement" id="req-length">
                                    <svg class="req-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                    </svg>
                                    At least 6 characters
                                </div>
                                <div class="password-requirement" id="req-match">
                                    <svg class="req-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                    </svg>
                                    Passwords match
                                </div>
                            </div>

                            <button class="password-change-btn primary" id="update-password-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
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
            <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
            </svg>
            Updating...
        `;

        try {
            // Update password in Firebase Auth
            await user.updatePassword(newPassword);

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
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
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

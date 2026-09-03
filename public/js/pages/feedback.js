/**
 * Feedback Module
 * Handles feedback form submission with email notifications via Nodemailer
 */

const FeedbackModule = (() => {
    // Backend API endpoint
    const API_ENDPOINT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001/api/feedback'
        : 'https://recaps-backend.onrender.com/api/feedback';

    // Form state
    let isSubmitting = false;

    /**
     * Initialize feedback form
     * @param {string} formId - ID of the feedback form
     * @param {Object} options - Configuration options
     */
    function init(formId = 'feedback-form', options = {}) {
        const form = document.getElementById(formId);
        if (!form) {
            console.error(`Feedback form with ID "${formId}" not found`);
            return;
        }

        // Set default options
        const config = {
            showToast: true,
            resetOnSuccess: true,
            onSuccess: null,
            onError: null,
            ...options
        };

        // Attach submit handler
        form.addEventListener('submit', (e) => handleSubmit(e, form, config));

        // Add real-time validation
        const nameInput = form.querySelector('[name="name"]');
        const emailInput = form.querySelector('[name="email"]');
        const messageInput = form.querySelector('[name="message"]');

        if (nameInput) {
            nameInput.addEventListener('blur', () => validateField(nameInput, 'Name is required'));
        }

        if (emailInput) {
            emailInput.addEventListener('blur', () => validateEmail(emailInput));
        }

        if (messageInput) {
            messageInput.addEventListener('blur', () => validateField(messageInput, 'Message is required'));
            
            // Character counter
            const maxLength = messageInput.getAttribute('maxlength');
            if (maxLength) {
                messageInput.addEventListener('input', () => updateCharacterCounter(messageInput, maxLength));
            }
        }

        console.log('✓ Feedback module initialized');
    }

    /**
     * Handle form submission
     */
    async function handleSubmit(e, form, config) {
        e.preventDefault();

        // Prevent double submission
        if (isSubmitting) {
            console.warn('Feedback submission already in progress');
            return;
        }

        // Get form data
        const formData = new FormData(form);
        const data = {
            name: formData.get('name')?.trim(),
            email: formData.get('email')?.trim(),
            subject: formData.get('subject')?.trim() || '',
            message: formData.get('message')?.trim()
        };

        // Validate
        const validation = validateFormData(data);
        if (!validation.valid) {
            if (config.showToast && typeof showToast === 'function') {
                showToast(validation.error, '❌');
            } else {
                alert(validation.error);
            }
            return;
        }

        // Get submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

        try {
            isSubmitting = true;

            // Update button state
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `
                    <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="display:inline-block;vertical-align:middle;margin-right:8px;">
                        <circle cx="12" cy="12" r="10" stroke-width="4" stroke-opacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke-width="4" stroke-linecap="round"/>
                    </svg>
                    Sending...
                `;
            }

            // Send feedback
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success
                if (config.showToast && typeof showToast === 'function') {
                    showToast(result.message || 'Feedback sent successfully! Check your email.', '✅');
                } else {
                    alert(result.message || 'Feedback sent successfully!');
                }

                // Reset form
                if (config.resetOnSuccess) {
                    form.reset();
                    clearValidationStates(form);
                }

                // Call success callback
                if (typeof config.onSuccess === 'function') {
                    config.onSuccess(result);
                }

                // Show success modal (if available)
                showSuccessModal(data.name, data.email);

            } else {
                // Error
                throw new Error(result.error || 'Failed to send feedback');
            }

        } catch (error) {
            console.error('Feedback submission error:', error);

            const errorMessage = error.message || 'Failed to send feedback. Please try again.';
            
            if (config.showToast && typeof showToast === 'function') {
                showToast(errorMessage, '❌');
            } else {
                alert(errorMessage);
            }

            // Call error callback
            if (typeof config.onError === 'function') {
                config.onError(error);
            }

        } finally {
            isSubmitting = false;

            // Restore button state
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    }

    /**
     * Validate form data
     */
    function validateFormData(data) {
        if (!data.name || data.name.length < 2) {
            return { valid: false, error: 'Please enter your name (at least 2 characters)' };
        }

        if (!data.email) {
            return { valid: false, error: 'Please enter your email address' };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            return { valid: false, error: 'Please enter a valid email address' };
        }

        if (!data.message || data.message.length < 10) {
            return { valid: false, error: 'Please enter a message (at least 10 characters)' };
        }

        if (data.message.length > 2000) {
            return { valid: false, error: 'Message is too long (maximum 2000 characters)' };
        }

        return { valid: true };
    }

    /**
     * Validate individual field
     */
    function validateField(input, errorMessage) {
        const value = input.value.trim();
        const feedbackEl = input.nextElementSibling;

        if (!value) {
            input.classList.add('invalid');
            input.classList.remove('valid');
            if (feedbackEl && feedbackEl.classList.contains('field-feedback')) {
                feedbackEl.textContent = errorMessage;
                feedbackEl.style.display = 'block';
            }
            return false;
        } else {
            input.classList.remove('invalid');
            input.classList.add('valid');
            if (feedbackEl && feedbackEl.classList.contains('field-feedback')) {
                feedbackEl.textContent = '';
                feedbackEl.style.display = 'none';
            }
            return true;
        }
    }

    /**
     * Validate email field
     */
    function validateEmail(input) {
        const value = input.value.trim();
        const feedbackEl = input.nextElementSibling;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!value) {
            input.classList.add('invalid');
            input.classList.remove('valid');
            if (feedbackEl && feedbackEl.classList.contains('field-feedback')) {
                feedbackEl.textContent = 'Email is required';
                feedbackEl.style.display = 'block';
            }
            return false;
        } else if (!emailRegex.test(value)) {
            input.classList.add('invalid');
            input.classList.remove('valid');
            if (feedbackEl && feedbackEl.classList.contains('field-feedback')) {
                feedbackEl.textContent = 'Please enter a valid email address';
                feedbackEl.style.display = 'block';
            }
            return false;
        } else {
            input.classList.remove('invalid');
            input.classList.add('valid');
            if (feedbackEl && feedbackEl.classList.contains('field-feedback')) {
                feedbackEl.textContent = '';
                feedbackEl.style.display = 'none';
            }
            return true;
        }
    }

    /**
     * Update character counter
     */
    function updateCharacterCounter(textarea, maxLength) {
        const currentLength = textarea.value.length;
        let counterEl = textarea.parentElement.querySelector('.char-counter');

        if (!counterEl) {
            counterEl = document.createElement('div');
            counterEl.className = 'char-counter';
            textarea.parentElement.appendChild(counterEl);
        }

        counterEl.textContent = `${currentLength} / ${maxLength} characters`;
        
        if (currentLength > maxLength * 0.9) {
            counterEl.style.color = '#e74c3c';
        } else if (currentLength > maxLength * 0.7) {
            counterEl.style.color = '#f39c12';
        } else {
            counterEl.style.color = '#95a5a6';
        }
    }

    /**
     * Clear validation states
     */
    function clearValidationStates(form) {
        const inputs = form.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.classList.remove('valid', 'invalid');
        });

        const feedbacks = form.querySelectorAll('.field-feedback');
        feedbacks.forEach(feedback => {
            feedback.textContent = '';
            feedback.style.display = 'none';
        });

        const counters = form.querySelectorAll('.char-counter');
        counters.forEach(counter => counter.remove());
    }

    /**
     * Show success modal
     */
    function showSuccessModal(name, email) {
        // Check if modal exists
        let modal = document.getElementById('feedback-success-modal');
        
        if (!modal) {
            // Create modal
            modal = document.createElement('div');
            modal.id = 'feedback-success-modal';
            modal.className = 'feedback-modal';
            modal.innerHTML = `
                <div class="feedback-modal-overlay"></div>
                <div class="feedback-modal-content">
                    <div class="feedback-modal-icon">✅</div>
                    <h2 class="feedback-modal-title">Thank You!</h2>
                    <p class="feedback-modal-text">
                        We've received your feedback and sent a confirmation email to <strong class="feedback-email"></strong>.
                    </p>
                    <p class="feedback-modal-subtext">
                        Our team will review your message and get back to you soon.
                    </p>
                    <button class="btn btn-primary feedback-modal-close">Got it</button>
                </div>
            `;
            document.body.appendChild(modal);

            // Close button handler
            modal.querySelector('.feedback-modal-close').addEventListener('click', () => {
                modal.classList.remove('active');
            });

            // Overlay click handler
            modal.querySelector('.feedback-modal-overlay').addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }

        // Update content
        modal.querySelector('.feedback-email').textContent = email;

        // Show modal
        setTimeout(() => {
            modal.classList.add('active');
        }, 100);
    }

    /**
     * Public API
     */
    return {
        init,
        validateFormData
    };
})();

// Auto-initialize if feedback form exists
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('feedback-form')) {
        FeedbackModule.init('feedback-form');
    }
});

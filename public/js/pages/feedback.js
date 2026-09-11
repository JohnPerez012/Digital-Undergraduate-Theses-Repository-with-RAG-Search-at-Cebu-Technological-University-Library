/**
 * Feedback Module
 * Handles feedback form submission with emoji reactions, image attachments, and email notifications
 */

const FeedbackModule = (() => {
    // Backend API endpoint
    const API_ENDPOINT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001/api/feedback'
        : 'https://recap-backend-jy5b.onrender.com/api/feedback';

    // Form state
    let isSubmitting = false;
    let selectedImages = [];
    const MAX_IMAGES = 3;
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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

        // Initialize emoji reactions
        initEmojiReactions();

        // Initialize image upload
        initImageUpload();

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
     * Initialize emoji reaction buttons
     */
    function initEmojiReactions() {
        const emojiContainer = document.getElementById('emoji-reaction-container');
        const feelingInput = document.getElementById('feedback-feeling');
        
        if (!emojiContainer || !feelingInput) return;

        const emojiButtons = emojiContainer.querySelectorAll('.emoji-btn');

        emojiButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove selected class from all buttons
                emojiButtons.forEach(b => b.classList.remove('selected'));
                
                // Add selected class to clicked button
                btn.classList.add('selected');
                
                // Set hidden input value
                const feeling = btn.getAttribute('data-feeling');
                feelingInput.value = feeling;
                
                // Clear error state if exists
                const feedback = feelingInput.nextElementSibling;
                if (feedback && feedback.classList.contains('field-feedback')) {
                    feedback.style.display = 'none';
                    feedback.textContent = '';
                }
                
                console.log('Feeling selected:', feeling);
            });
        });
    }

    /**
     * Initialize image upload functionality
     */
    function initImageUpload() {
        const uploadBtn = document.getElementById('feedback-upload-btn');
        const fileInput = document.getElementById('feedback-images');
        const previewContainer = document.getElementById('feedback-image-preview');

        if (!uploadBtn || !fileInput || !previewContainer) return;

        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            handleImageSelection(e.target.files, previewContainer);
        });
    }

    /**
     * Handle image file selection
     */
    function handleImageSelection(files, previewContainer) {
        const fileArray = Array.from(files);

        // Check if adding these files exceeds max limit
        if (selectedImages.length + fileArray.length > MAX_IMAGES) {
            if (typeof showToast === 'function') {
                showToast(`Maximum ${MAX_IMAGES} images allowed`, '⚠️');
            } else {
                alert(`Maximum ${MAX_IMAGES} images allowed`);
            }
            return;
        }

        fileArray.forEach(file => {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                if (typeof showToast === 'function') {
                    showToast(`${file.name} is not an image`, '❌');
                }
                return;
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                if (typeof showToast === 'function') {
                    showToast(`${file.name} exceeds 5MB limit`, '❌');
                }
                return;
            }

            // Add to selected images
            selectedImages.push(file);
        });

        // Render preview
        renderImagePreviews(previewContainer);
        
        // Clear file input
        document.getElementById('feedback-images').value = '';
    }

    /**
     * Render image previews
     */
    function renderImagePreviews(container) {
        container.innerHTML = '';

        selectedImages.forEach((file, index) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const imageItem = document.createElement('div');
                imageItem.className = 'feedback-image-item';
                imageItem.innerHTML = `
                    <img src="${e.target.result}" alt="Preview ${index + 1}" />
                    <button type="button" class="feedback-image-remove" data-index="${index}" aria-label="Remove image">
                        ×
                    </button>
                `;

                // Add remove handler
                const removeBtn = imageItem.querySelector('.feedback-image-remove');
                removeBtn.addEventListener('click', () => {
                    removeImage(index, container);
                });

                container.appendChild(imageItem);
            };

            reader.readAsDataURL(file);
        });
    }

    /**
     * Remove image from selection
     */
    function removeImage(index, container) {
        selectedImages.splice(index, 1);
        renderImagePreviews(container);
        
        if (typeof showToast === 'function') {
            showToast('Image removed', 'ℹ️');
        }
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
            feeling: formData.get('feeling')?.trim(),
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

            // Upload images to Cloudinary (if any)
            let imageUrls = [];
            if (selectedImages.length > 0 && window.CloudinaryService) {
                try {
                    for (const imageFile of selectedImages) {
                        const url = await window.CloudinaryService.uploadImage(imageFile);
                        if (url) imageUrls.push(url);
                    }
                    console.log('Uploaded images:', imageUrls);
                } catch (imgError) {
                    console.warn('Image upload failed:', imgError);
                    // Continue with submission even if images fail
                }
            }

            // Add images to data
            data.images = imageUrls;

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

                // Reset form and images
                if (config.resetOnSuccess) {
                    form.reset();
                    selectedImages = [];
                    renderImagePreviews(document.getElementById('feedback-image-preview'));
                    clearValidationStates(form);
                    
                    // Clear emoji selection
                    document.querySelectorAll('.emoji-btn').forEach(btn => {
                        btn.classList.remove('selected');
                    });
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

        if (!data.feeling) {
            // Highlight emoji container
            const feelingInput = document.getElementById('feedback-feeling');
            const feedback = feelingInput ? feelingInput.nextElementSibling : null;
            if (feedback && feedback.classList.contains('field-feedback')) {
                feedback.textContent = 'Please select how you\'re feeling';
                feedback.style.display = 'block';
            }
            return { valid: false, error: 'Please select how you\'re feeling' };
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
                    <div class="feedback-modal-icon-wrapper">
                        <svg class="feedback-checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <circle class="feedback-checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                            <path class="feedback-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                        </svg>
                    </div>
                    <h2 class="feedback-modal-title">Thank You!</h2>
                    <p class="feedback-modal-greeting">Hi <span class="feedback-user-name"></span>! 👋</p>
                    <p class="feedback-modal-text">
                        We've received your feedback and sent a confirmation email to 
                        <strong class="feedback-email"></strong>
                    </p>
                    <div class="feedback-modal-info">
                        <div class="feedback-info-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            <span>Our team will review your message</span>
                        </div>
                        <div class="feedback-info-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                            <span>We'll get back to you soon</span>
                        </div>
                    </div>
                    <button class="btn btn-primary feedback-modal-close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Got it, thanks!
                    </button>
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
        modal.querySelector('.feedback-user-name').textContent = name;
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

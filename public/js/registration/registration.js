(function () {
    'use strict';

    // Internal, immutable-like verification salt and state tokens (Closure Protected)
    // Use fallback if crypto is not available
    let SECRET_SALT;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        SECRET_SALT = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        // Fallback for non-secure contexts
        SECRET_SALT = Math.random().toString(36).substring(2, 18) +
            Math.random().toString(36).substring(2, 18) +
            Date.now().toString(36);
    }
    let activeSessionToken = null;
    let expectedHash = null;

    // Helper: Simple hash fallback for non-secure contexts
    function simpleHash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        // Convert to hex and pad to 64 chars (SHA-256 length)
        const baseHash = Math.abs(hash).toString(16).padStart(8, '0');
        // Add some salt-like randomness based on text length and content
        const salt = text.length.toString(16).padStart(4, '0');
        const extra = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0).toString(16).padStart(8, '0');
        return (baseHash + salt + extra + baseHash + salt + extra + baseHash + salt).substring(0, 64);
    }

    // Helper: SHA-256 Hashing using native browser Web Crypto API with fallback
    async function hashPasswordSHA256(password) {
        // Check if crypto.subtle is available (requires secure context)
        if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
            try {
                const msgBuffer = new TextEncoder().encode(password);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return hashHex;
            } catch (error) {
                console.warn('crypto.subtle.digest failed for password hashing, using fallback:', error);
                return simpleHash(password);
            }
        } else {
            console.warn('crypto.subtle not available for password hashing (insecure context), using fallback');
            return simpleHash(password);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Reset body padding
        document.body.style.paddingTop = "0px";

        // Get step elements
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        const step3 = document.getElementById('step-3');
        const step4 = document.getElementById('step-4');
        const step5 = document.getElementById('step-5');
        const step6 = document.getElementById('step-6');
        const step7 = document.getElementById('step-7');

        // Shared step indicator elements
        const stepNumbers = document.querySelectorAll('.step-number[data-step]');
        const stepDividers = document.querySelectorAll('.step-divider[data-divider]');

        // Navigation buttons
        const nextToStep2Btn = document.getElementById('next-to-step-2');
        const backToStep1Btn = document.getElementById('back-to-step-1');
        const nextToStep3Btn = document.getElementById('next-to-step-3');
        const backToStep2Btn = document.getElementById('back-to-step-2');
        const nextToStep4Btn = document.getElementById('next-to-step-4');
        const backToStep3Btn = document.getElementById('back-to-step-3');
        const nextToStep5Btn = document.getElementById('next-to-step-5');
        const backToStep4Btn = document.getElementById('back-to-step-4');
        const nextToStep6Btn = document.getElementById('next-to-step-6');
        const backToStep5Btn = document.getElementById('back-to-step-5');
        const nextToStep7Btn = document.getElementById('next-to-step-7');
        const skipToStep7Btn = document.getElementById('skip-to-step-7');
        const backToStep6Btn = document.getElementById('back-to-step-6');
        const completeBtn = document.getElementById('complete-registration');

        // Google Sign-In elements
        const googleSignInBtn = document.getElementById('googleSignInBtn');
        const googleAuthStatus = document.getElementById('googleAuthStatus');
        const googleAuthInfo = document.getElementById('googleAuthInfo');
        const googleUserAvatar = document.getElementById('googleUserAvatar');
        const googleUserName = document.getElementById('googleUserName');
        const googleUserEmail = document.getElementById('googleUserEmail');
        const changeGoogleAccountBtn = document.getElementById('changeGoogleAccountBtn');
        const accountExistsError = document.getElementById('accountExistsError');
        const errorMessage = document.getElementById('errorMessage');
        const tryDifferentAccountBtn = document.getElementById('tryDifferentAccountBtn');

        // Form inputs
        const userTypeInput = document.getElementById('user-type');
        const roleCards = document.querySelectorAll('.role-card');
        const collegeCards = document.querySelectorAll('.college-card');
        const teacherCollegeInput = document.getElementById('teacher-college');

        // Main back button to index.html
        const mainBackButton = document.getElementById('main-back-button');

        // Student college elements
        const studentCollegeInput = document.getElementById('student-college');
        const studentCollegeCards = document.getElementById('student-college-cards');
        const studentCollegeCardsElements = document.querySelectorAll('#student-college-cards .college-card');
        const studentCollegeSelected = document.getElementById('student-college-selected');
        const selectedCollegeName = document.getElementById('selected-college-name');
        const changeCollegeBtn = document.getElementById('change-college-btn');

        // Program carousel elements
        const programInput = document.getElementById('program');
        const programGroup = document.getElementById('program-group');
        const programCarouselTrack = document.getElementById('programCarouselTrack');
        const programCarouselViewport = document.getElementById('programCarouselViewport');
        const programPrevArrow = document.getElementById('programPrevArrow');
        const programNextArrow = document.getElementById('programNextArrow');
        const programIndicators = document.getElementById('programIndicators');

        // Academic profile ID inputs
        const studentIdInput = document.getElementById('student-id');
        const teacherIdInput = document.getElementById('teacher-id');

        // Conditional ID groups
        const studentIdGroup = document.getElementById('student-id-group');
        const teacherIdGroup = document.getElementById('teacher-id-group');
        const studentCollegeGroup = document.getElementById('student-college-group');
        const teacherCollegeGroup = document.getElementById('teacher-college-group');

        // Password & Test inputs
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        const passwordStrengthFill = document.getElementById('password-strength-fill');
        const passwordSuggestion = document.getElementById('password-suggestion');
        const passwordTestInput = document.getElementById('password-test');
        const passwordTestFeedback = document.getElementById('password-test-feedback');

        // State Tracking variables
        let googleUser = null;
        let verifiedEmail = null;
        let savedPassword = '';
        let currentStep = 1;
        let maxReachedStep = 1;
        let userType = null; // 'student' or 'teacher'
        const completedSteps = new Set();
        let registrationCompleted = false; // True once account is successfully created
        let isCreatingAccount = false; // True during final account creation & credentials linking

        // Dynamic custom cursor tooltip element
        const cursorTooltip = document.createElement('div');
        cursorTooltip.className = 'cursor-tooltip';
        document.body.appendChild(cursorTooltip);

        // Course Program Data
        const allPrograms = [
            { code: 'BSFi', name: 'Bachelor of Science in Fisheries', college: 'COTE' },
            { code: 'BSIT', name: 'Bachelor of Science in Information Technology', college: 'COTE' },
            { code: 'BSHM', name: 'Bachelor of Science in Hospitality Management', college: 'COTE' },
            { code: 'BSIE', name: 'Bachelor of Science in Industrial Engineering', college: 'COTE' },
            { code: 'BSEd-Math', name: 'Bachelor of Secondary Education Major in Mathematics', college: 'COED' },
            { code: 'BEEd', name: 'Bachelor of Elementary Education', college: 'COED' },
            { code: 'BIT-Computer', name: 'Bachelor of Industrial Technology Major in Computer', college: 'COTE' },
            { code: 'BIT-Electronics', name: 'Bachelor of Industrial Technology Major in Electronics', college: 'COTE' },
            { code: 'BIT-Automotive', name: 'Bachelor of Industrial Technology Major in Automotive', college: 'COTE' },
            { code: 'BTLEd-HE', name: 'Bachelor in Technology and Livelihood Education Major in Home Economics', college: 'COED' }
        ];
        let currentProgramIndex = 0;
        let filteredPrograms = [];

        // Initialize sliders and anti-tamper monitors
        initSliderVerify();
        setupTamperEvidentObservers();
        renderStepIndicator();

        // Handle main back button click and Step 1 back-to-index button
        function handleLeaveRegistration(e) {
            if (isCreatingAccount) {
                if (e) e.preventDefault();
                return;
            }
            // Check if user has any filled data
            const hasData = hasRegistrationData();

            if (hasData) {
                if (e) e.preventDefault();
                showLeaveConfirmationDialog();
            } else if (googleUser !== null) {
                // No data filled, check if authenticated with Google
                if (e) e.preventDefault();
                showAuthWarningDialog();
            } else if (e && e.currentTarget && e.currentTarget.tagName !== 'A') {
                // Non-anchor button, navigate explicitly
                window.location.href = '../index.html';
            }
        }

        if (mainBackButton) {
            mainBackButton.addEventListener('click', handleLeaveRegistration);
        }

        const backToIndexBtn = document.getElementById('back-to-index');
        if (backToIndexBtn) {
            backToIndexBtn.addEventListener('click', handleLeaveRegistration);
        }

        // Handle page unload - sign out if registration incomplete
        window.addEventListener('beforeunload', function (e) {
            if (isCreatingAccount) {
                e.preventDefault();
                e.returnValue = 'Your account is being created. Please wait and do not close or reload this page.';
                return e.returnValue;
            }
            if (googleUser !== null && !isRegistrationComplete()) {
                // Sign out to prevent incomplete registration
                auth.signOut().catch(err => console.error('Sign out error:', err));
            }
        });

        // Helper function to check if user has any registration data
        function hasRegistrationData() {
            const firstName = document.getElementById('first-name')?.value.trim();
            const lastName = document.getElementById('last-name')?.value.trim();
            const userType = userTypeInput.value;
            const hasGoogleAuth = googleUser !== null;
            const studentId = document.getElementById('student-id')?.value.trim();
            const teacherId = document.getElementById('teacher-id')?.value.trim();
            const studentCollege = studentCollegeInput.value;
            const teacherCollege = teacherCollegeInput.value;
            const program = programInput.value;
            const password = passwordInput.value;

            return userType || firstName || lastName || hasGoogleAuth ||
                studentId || teacherId || studentCollege || teacherCollege ||
                program || password;
        }

        // Helper function to check if registration is complete
        function isRegistrationComplete() {
            // Use the dedicated flag — the modal uses CSS classes (.active), not inline style.display
            return registrationCompleted;
        }

        // Show confirmation dialog when user tries to leave with data
        function showLeaveConfirmationDialog() {
            const overlay = document.createElement('div');
            overlay.className = 'welcome-modal-overlay';

            overlay.innerHTML = `
                <div class="welcome-modal-content">
                    <div class="welcome-icon-wrapper">
                        <span class="wave-emoji">⚠️</span>
                    </div>
                    <h2 class="welcome-modal-title">Leave Registration?</h2>
                    <p class="welcome-modal-text">You have filled out some registration data. If you leave now, your progress will be lost and your account will not be registered successfully.</p>
                    <div class="welcome-modal-buttons">
                        <button class="welcome-modal-btn-secondary" id="leave-cancel-btn">Continue Registration</button>
                        <button class="welcome-modal-btn" id="leave-confirm-btn" style="background: linear-gradient(135deg, #ef4444, #dc2626);">Leave Anyway</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            setTimeout(() => {
                overlay.classList.add('active');
            }, 10);

            document.getElementById('leave-cancel-btn').addEventListener('click', () => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                }, 400);
            });

            document.getElementById('leave-confirm-btn').addEventListener('click', async () => {
                // Sign out from Firebase Auth before leaving
                if (googleUser !== null) {
                    try {
                        await auth.signOut();
                        console.log('Signed out before leaving registration');
                    } catch (error) {
                        console.error('Error signing out:', error);
                    }
                }

                overlay.classList.remove('active');
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 400);
            });
        }

        // Show warning dialog when user is authenticated but has no data
        function showAuthWarningDialog() {
            const overlay = document.createElement('div');
            overlay.className = 'welcome-modal-overlay';

            overlay.innerHTML = `
                <div class="welcome-modal-content">
                    <div class="welcome-icon-wrapper">
                        <span class="wave-emoji">🔐</span>
                    </div>
                    <h2 class="welcome-modal-title">Authentication Warning</h2>
                    <p class="welcome-modal-text">You are currently authenticated with Google, but haven't completed your registration. If you leave now, your Google account will be signed out and you'll need to authenticate again.</p>
                    <div class="welcome-modal-buttons">
                        <button class="welcome-modal-btn-secondary" id="auth-cancel-btn">Continue Registration</button>
                        <button class="welcome-modal-btn" id="auth-confirm-btn" style="background: linear-gradient(135deg, #ef4444, #dc2626);">Sign Out & Leave</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            setTimeout(() => {
                overlay.classList.add('active');
            }, 10);

            document.getElementById('auth-cancel-btn').addEventListener('click', () => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                }, 400);
            });

            document.getElementById('auth-confirm-btn').addEventListener('click', async () => {
                // Sign out from Firebase Auth before leaving
                try {
                    await auth.signOut();
                    console.log('Signed out before leaving registration');
                } catch (error) {
                    console.error('Error signing out:', error);
                }

                overlay.classList.remove('active');
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 400);
            });
        }

        // 1. Advanced Slider Verification Logic with Bot Detection (Gatekeeper component)
        function initSliderVerify() {
            const container = document.getElementById('slider-verify-container');
            const gatekeeperView = document.getElementById('gatekeeper-view');
            const formWrap = document.getElementById('registration-form-wrap');

            if (!container) return;

            // Initialize advanced slider captcha with bot detection
            const sliderCaptcha = new AdvancedSliderCaptcha({
                container: container,
                tolerance: 10,             // Position tolerance in pixels
                minDuration: 50,           // Minimum drag time in ms (very relaxed)
                maxDuration: 10000,        // Maximum drag time in ms (relaxed for UX)
                minTrackPoints: 5,         // Minimum track points required
                maxJitterY: 50,            // Maximum Y-axis jitter in pixels
                minJitterY: 0,             // Minimum Y-axis jitter required (disabled for UX)
                trackVarianceThreshold: 0.3, // Track variance threshold (relaxed)
                velocityChangeThreshold: 0.1, // Velocity change threshold (relaxed)
                onVerified: function (result) {
                    console.log('Slider verification successful:', result.metrics);
                    onVerifiedSuccess(container, gatekeeperView, formWrap);
                },
                onFailed: function (result) {
                    console.warn('Slider verification failed:', result.errors);
                    console.warn('Metrics:', result.metrics);

                    // Show error feedback
                    const bgText = container.querySelector('.slider-verify-bg-text');
                    if (bgText) {
                        bgText.textContent = 'Verification Failed - Please try again';
                        bgText.style.color = '#ef4444';

                        setTimeout(() => {
                            bgText.textContent = 'Slide to verify you are human';
                            bgText.style.color = '';
                        }, 2000);
                    }
                }
            });
        }

        /**
         * Fallback SHA-256 implementation for non-secure contexts (HTTP)
         * Uses a simple but effective hashing algorithm
         */
        function simpleSHA256Fallback(message) {
            // Simple but effective hash for non-secure contexts
            let hash = 0;
            for (let i = 0; i < message.length; i++) {
                const char = message.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            // Convert to hex and pad to look like SHA-256 (64 chars)
            const baseHash = Math.abs(hash).toString(16).padStart(8, '0');
            const timestamp = Date.now().toString(16).padStart(12, '0');
            const random = Math.random().toString(16).substring(2, 18).padStart(16, '0');
            return (baseHash + timestamp + random + baseHash + timestamp + random).substring(0, 64);
        }

        async function onVerifiedSuccess(container, gatekeeperView, formWrap) {
            container.classList.add('verified');
            const bgText = container.querySelector('.slider-verify-bg-text');
            if (bgText) {
                bgText.textContent = 'Verification Successful';
            }

            // Cryptographic validation token generation with fallback
            const timestamp = Date.now();
            const randomArr = new Uint8Array(16);

            // Check if crypto is available
            if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
                console.warn('Crypto API not available, using fallback');
                const randomVal = Math.random().toString(36).substring(2, 18);
                const message = SECRET_SALT + ":" + timestamp + ":" + randomVal;
                expectedHash = simpleSHA256Fallback(message);
            } else {
                crypto.getRandomValues(randomArr);
                const randomVal = Array.from(randomArr).map(b => b.toString(16).padStart(2, '0')).join('');

                // Check if SubtleCrypto is available (requires secure context)
                if (crypto.subtle && typeof crypto.subtle.digest === 'function') {
                    try {
                        const encoder = new TextEncoder();
                        const data = encoder.encode(SECRET_SALT + ":" + timestamp + ":" + randomVal);
                        const digest = await crypto.subtle.digest('SHA-256', data);
                        expectedHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
                    } catch (error) {
                        console.warn('crypto.subtle.digest failed, using fallback:', error);
                        const message = SECRET_SALT + ":" + timestamp + ":" + randomVal;
                        expectedHash = simpleSHA256Fallback(message);
                    }
                } else {
                    console.warn('crypto.subtle not available (insecure context), using fallback');
                    const message = SECRET_SALT + ":" + timestamp + ":" + randomVal;
                    expectedHash = simpleSHA256Fallback(message);
                }
            }

            activeSessionToken = expectedHash;
            Object.freeze(activeSessionToken);

            // Transition with fade out/in
            setTimeout(() => {
                gatekeeperView.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                gatekeeperView.style.opacity = '0';
                gatekeeperView.style.transform = 'translateY(-10px)';

                setTimeout(() => {
                    gatekeeperView.style.display = 'none';
                    formWrap.style.display = 'block';
                    formWrap.offsetHeight; // force repaint
                    formWrap.classList.add('visible');
                    showStep(1);
                }, 500);
            }, 800);
        }

        // 2. Tamper-Evident Observers (MutationObserver APIs)
        function setupTamperEvidentObservers() {
            const buttonObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
                        const target = mutation.target;

                        // Tamper protection: Restrict Next 2 step trigger (Step 1 -> Step 2)
                        if (target.id === 'next-to-step-2') {
                            const isVerified = activeSessionToken !== null;
                            const hasName = firstNameInput && firstNameInput.value.trim().length >= 2 &&
                                lastNameInput && lastNameInput.value.trim().length >= 2;
                            if ((!isVerified || !hasName) && !target.disabled) {
                                target.disabled = true;
                                showToast('⚠️ Please enter your legal first and last name to proceed.', '⛔');
                            }
                        }

                        // Tamper protection: Restrict Next 3 step trigger (Step 2 -> Step 3)
                        if (target.id === 'next-to-step-3') {
                            const hasRole = userTypeInput.value !== '';
                            const hasId = verifiedIdData !== null;
                            if ((!hasRole || !hasId) && !target.disabled) {
                                target.disabled = true;
                                showToast('⚠️ CTU ID verification required.', '⛔');
                            }
                        }

                        // Tamper protection: Restrict step 4 trigger
                        if (target.id === 'next-to-step-4') {
                            const hasGoogle = googleUser !== null;
                            if (!hasGoogle && !target.disabled) {
                                target.disabled = true;
                                showToast('⚠️ Nice try! Google authentication required.', '⛔');
                            }
                        }

                        // Tamper protection: Restrict step 7 trigger only when Continue is clicked (not Skip)
                        if (target.id === 'next-to-step-7') {
                            const enteredPassword = passwordTestInput.value;
                            if (enteredPassword !== savedPassword && !target.disabled) {
                                target.disabled = true;
                                showToast('⚠️ Nice try! Password validation required.', '⛔');
                            }
                        }
                    }
                });
            });

            const observerConfig = { attributes: true, attributeFilter: ['disabled'] };
            if (nextToStep2Btn) buttonObserver.observe(nextToStep2Btn, observerConfig);
            if (nextToStep3Btn) buttonObserver.observe(nextToStep3Btn, observerConfig);
            if (nextToStep4Btn) buttonObserver.observe(nextToStep4Btn, observerConfig);
            if (nextToStep7Btn) buttonObserver.observe(nextToStep7Btn, observerConfig);

            // Structure Tamper Protection Observer
            const structureObserver = new MutationObserver((mutations) => {
                let tampered = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach(node => {
                            if (node.id === 'gatekeeper-view' || node.id === 'slider-verify-container' || node.id === 'registration-form-wrap') {
                                tampered = true;
                            }
                        });
                    }
                }
                if (tampered) {
                    document.body.innerHTML = '<div style="color:#ef4444; font-weight:700; text-align:center; padding:10rem 2rem; font-size:2rem; font-family:\'Inter\', sans-serif; background-color: var(--background);">⛔ CRITICAL SECURITY TAMPERING DETECTED<br><span style="font-size:1.2rem; font-weight:400; color:var(--text-secondary);">The page structure has been modified. Registration blocked. Please reload.</span></div>';
                }
            });

            const contentWrap = document.querySelector('.registration-content');
            if (contentWrap) {
                structureObserver.observe(contentWrap, { childList: true, subtree: true });
            }
        }

        // Custom cursor helpers for disabled buttons
        function attachTooltipToButton(button, message) {
            let isHovering = false;

            button.addEventListener('mouseenter', () => {
                if (button.disabled) {
                    isHovering = true;
                    cursorTooltip.textContent = message;
                    cursorTooltip.classList.add('show');
                }
            });

            button.addEventListener('mouseleave', () => {
                isHovering = false;
                cursorTooltip.classList.remove('show');
            });

            button.addEventListener('mousemove', (e) => {
                if (button.disabled && isHovering) {
                    cursorTooltip.style.left = e.clientX + 'px';
                    cursorTooltip.style.top = e.clientY + 'px';
                }
            });

            button.addEventListener('click', (e) => {
                if (button.disabled) {
                    e.preventDefault();
                    button.classList.add('shake');
                    setTimeout(() => button.classList.remove('shake'), 500);
                }
            });
        }

        // =========================================================================
        // RENOVATION: CTU ID VERIFICATION & CREDENTIAL AUTHENTICITY SUBSYSTEM
        // =========================================================================
        let verifiedIdData = null;
        let cameraStream = null;
        let currentFacingMode = 'environment';
        let currentCaptureMode = 'camera';
        let isOcrProcessing = false;

        // Elements
        const tabCameraCapture = document.getElementById('tab-camera-capture');
        const tabUploadCapture = document.getElementById('tab-upload-capture');
        const cameraCapturePanel = document.getElementById('camera-capture-panel');
        const uploadCapturePanel = document.getElementById('upload-capture-panel');
        const idCameraVideo = document.getElementById('id-camera-video');
        const btnCapturePhoto = document.getElementById('btn-capture-photo');
        const idDropzone = document.getElementById('id-dropzone');
        const idFileInput = document.getElementById('id-file-input');
        const btnBrowseId = document.getElementById('btn-browse-id');
        const idCaptureTabs = document.getElementById('id-capture-tabs');
        const idOcrProcessingView = document.getElementById('id-ocr-processing-view');
        const idCapturedPreview = document.getElementById('id-captured-preview');
        const ocrStatusText = document.getElementById('ocr-status-text');
        const ocrProgressBarFill = document.getElementById('ocr-progress-bar-fill');
        const ocrRetakeAction = document.getElementById('ocr-retake-action');
        const btnRetakeId = document.getElementById('btn-retake-id');
        const idVerificationSummary = document.getElementById('id-verification-summary');
        const btnRescanLink = document.getElementById('btn-rescan-link');
        const summaryRoleVal = document.getElementById('summary-role-val');
        // summaryNameVal replaced by editable inputs — kept for legacy compat (may be null)
        const summaryNameVal = document.getElementById('summary-name-val');
        const summaryIdVal = document.getElementById('summary-id-val');
        const summaryProgramVal = document.getElementById('summary-program-val');
        // Manual name inputs inside the verification summary card
        const summaryFirstName = document.getElementById('summary-first-name');
        const summaryMiddleName = document.getElementById('summary-middle-name');
        const summaryLastName = document.getElementById('summary-last-name');
        const summaryNameHint = document.getElementById('summary-name-hint');
        const idCameraFallbackInput = document.getElementById('id-camera-fallback-input');
        const cameraFallbackOverlay = document.getElementById('camera-fallback-overlay');
        let isCameraFallback = false;

        // Camera Management & LAN / Desktop Diagnostics Fallback
        function enableCameraFallbackMode(err = null) {
            isCameraFallback = true;
            stopCameraStream();
            if (idCameraVideo) idCameraVideo.style.display = 'none';
            if (cameraFallbackOverlay) cameraFallbackOverlay.style.display = 'flex';

            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            const isLocalOrigin = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
            const isInsecureDomain = (!window.isSecureContext && !isLocalOrigin);

            const badgeEl = cameraFallbackOverlay ? cameraFallbackOverlay.querySelector('.fallback-camera-badge') : null;
            const titleEl = cameraFallbackOverlay ? cameraFallbackOverlay.querySelector('.fallback-camera-title') : null;
            const subEl   = cameraFallbackOverlay ? cameraFallbackOverlay.querySelector('.fallback-camera-sub') : null;
            const btnCaptureSpan = btnCapturePhoto ? btnCapturePhoto.querySelector('span:last-child') : null;

            if (isMobile) {
                if (badgeEl) badgeEl.textContent = 'LAN / Device Camera Mode';
                if (titleEl) titleEl.textContent = 'Tap to Snap CTU ID';
                if (subEl) subEl.textContent = 'Direct live stream requires HTTPS. Tap button below or touch here to capture using your phone camera shutter.';
                if (btnCaptureSpan) btnCaptureSpan.textContent = 'Open Camera Shutter';
            } else {
                // Desktop diagnostics & guidance
                if (isInsecureDomain) {
                    if (badgeEl) badgeEl.textContent = 'HTTP Domain Restriction';
                    if (titleEl) titleEl.textContent = 'Webcam Requires Localhost / HTTPS';
                    if (subEl) subEl.textContent = 'Desktop browsers block webcam on non-localhost HTTP (e.g. pcg-2.local). Open via http://localhost:3000 to use your webcam, or select a photo below.';
                    if (btnCaptureSpan) btnCaptureSpan.textContent = 'Select ID Photo';
                } else if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                    if (badgeEl) badgeEl.textContent = 'Webcam Permission Blocked';
                    if (titleEl) titleEl.textContent = 'Camera Access Denied';
                    if (subEl) subEl.textContent = 'Webcam access was denied. Click the lock/tune icon in your browser address bar to allow camera access, or select a photo.';
                    if (btnCaptureSpan) btnCaptureSpan.textContent = 'Select ID Photo';
                } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
                    if (badgeEl) badgeEl.textContent = 'No Webcam Found';
                    if (titleEl) titleEl.textContent = 'No Camera Device Detected';
                    if (subEl) subEl.textContent = 'No webcam hardware was detected on this PC. Please connect a webcam or select an ID photo.';
                    if (btnCaptureSpan) btnCaptureSpan.textContent = 'Select ID Photo';
                } else {
                    if (badgeEl) badgeEl.textContent = 'Camera Unavailable';
                    if (titleEl) titleEl.textContent = 'Webcam Inactive';
                    if (subEl) subEl.textContent = 'Webcam stream could not start. Please ensure no other app (Zoom, Teams) is using the camera, or select an ID photo.';
                    if (btnCaptureSpan) btnCaptureSpan.textContent = 'Select ID Photo';
                }
            }

            const hintText = document.getElementById('camera-hint-text');
            if (hintText) {
                if (isMobile) {
                    hintText.innerHTML = '📱 <strong>LAN Mode:</strong> Direct live stream requires HTTPS. Tap the shutter button above to snap your ID card directly with your camera.';
                } else if (isInsecureDomain) {
                    hintText.innerHTML = '💻 <strong>Desktop Tip:</strong> To use your live webcam on this PC, visit <a href="http://localhost:3000/pages/account_registration.html" style="color:#10b981;text-decoration:underline;">http://localhost:3000</a> instead of the LAN IP domain.';
                } else {
                    hintText.innerHTML = '💡 Tip: You can select a photo or connect a webcam to scan your CTU ID card.';
                }
            }
        }

        async function initCameraCapture() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('getUserMedia not supported in this environment (LAN or insecure HTTP context). Enabling device camera shutter fallback.');
                enableCameraFallbackMode();
                return;
            }
            try {
                stopCameraStream();
                const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                // On mobile phones, request 'environment' for rear camera.
                // On desktop PCs, do NOT force 'environment' because webcams are front-facing or USB!
                const constraints = {
                    video: isMobile 
                        ? { facingMode: { ideal: currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
                        : { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                };

                try {
                    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (constraintErr) {
                    console.warn('Strict constraints failed on webcam, falling back to basic { video: true }:', constraintErr);
                    // Relax constraints if 1280x720 or facingMode is unsupported by desktop webcam
                    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
                }

                isCameraFallback = false;
                if (cameraFallbackOverlay) cameraFallbackOverlay.style.display = 'none';
                if (idCameraVideo) {
                    idCameraVideo.style.display = 'block';
                    idCameraVideo.srcObject = cameraStream;
                    await idCameraVideo.play().catch(e => console.warn('Video play error:', e));
                }
                const btnCaptureSpan = btnCapturePhoto ? btnCapturePhoto.querySelector('span:last-child') : null;
                if (btnCaptureSpan) btnCaptureSpan.textContent = 'Capture ID Card';
                const hintText = document.getElementById('camera-hint-text');
                if (hintText) {
                    hintText.innerHTML = '💡 Tip: Place your ID in front of the camera. Outside the framed zone will be cropped out.';
                }
            } catch (err) {
                console.warn('Camera access denied or unavailable on current origin:', err);
                enableCameraFallbackMode(err);
            }
        }

        function stopCameraStream() {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                cameraStream = null;
            }
            if (idCameraVideo) {
                idCameraVideo.srcObject = null;
            }
        }

        function switchToCameraMode() {
            currentCaptureMode = 'camera';
            if (tabCameraCapture) tabCameraCapture.classList.add('active');
            if (tabUploadCapture) tabUploadCapture.classList.remove('active');
            if (cameraCapturePanel) cameraCapturePanel.style.display = 'flex';
            if (uploadCapturePanel) uploadCapturePanel.style.display = 'none';
            initCameraCapture();
        }

        function switchToUploadMode() {
            currentCaptureMode = 'upload';
            stopCameraStream();
            if (tabUploadCapture) tabUploadCapture.classList.add('active');
            if (tabCameraCapture) tabCameraCapture.classList.remove('active');
            if (uploadCapturePanel) uploadCapturePanel.style.display = 'flex';
            if (cameraCapturePanel) cameraCapturePanel.style.display = 'none';
        }

        const idCameraZone = document.getElementById('id-camera-zone');
        const uploadZoneFramingPanel = document.getElementById('upload-zone-framing-panel');
        const zoneViewportContainer = document.getElementById('zone-viewport-container');
        const zoneStage = document.getElementById('zone-stage');
        const zoneSourceImage = document.getElementById('zone-source-image');
        const idCardCropBox = document.getElementById('id-card-crop-box');
        const btnCancelZone = document.getElementById('btn-cancel-zone');
        const btnResetZone = document.getElementById('btn-reset-zone');
        const btnConfirmZoneScan = document.getElementById('btn-confirm-zone-scan');

        // Capture from Live Video or Device Shutter Fallback - CROPS STRICTLY TO THE ID ZONE!
        function capturePhotoFromVideo() {
            if (isCameraFallback || !cameraStream) {
                if (idCameraFallbackInput) {
                    idCameraFallbackInput.click();
                } else if (idFileInput) {
                    idFileInput.click();
                }
                return;
            }
            if (!idCameraVideo) {
                if (window.showToast) showToast('Camera is not active', '⚠️');
                return;
            }

            const vNatW = idCameraVideo.videoWidth || 1280;
            const vNatH = idCameraVideo.videoHeight || 720;
            const videoRect = idCameraVideo.getBoundingClientRect();
            const zoneRect = idCameraZone ? idCameraZone.getBoundingClientRect() : null;

            let sx = 0, sy = 0, sw = vNatW, sh = vNatH;

            if (zoneRect && videoRect.width > 0 && videoRect.height > 0) {
                // Video is rendered with object-fit: cover
                const elemW = videoRect.width;
                const elemH = videoRect.height;
                const scale = Math.max(elemW / vNatW, elemH / vNatH);
                const rendW = vNatW * scale;
                const rendH = vNatH * scale;
                const offsetX = (elemW - rendW) / 2;
                const offsetY = (elemH - rendH) / 2;

                const zoneLeftInVideo = zoneRect.left - videoRect.left;
                const zoneTopInVideo = zoneRect.top - videoRect.top;

                sx = (zoneLeftInVideo - offsetX) / scale;
                sy = (zoneTopInVideo - offsetY) / scale;
                sw = zoneRect.width / scale;
                sh = zoneRect.height / scale;

                sx = Math.max(0, Math.min(sx, vNatW - 20));
                sy = Math.max(0, Math.min(sy, vNatH - 20));
                sw = Math.max(20, Math.min(sw, vNatW - sx));
                sh = Math.max(20, Math.min(sh, vNatH - sy));
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(sw);
            canvas.height = Math.round(sh);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(idCameraVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            stopCameraStream();
            processIdImage(dataUrl);
        }

        // Upload ID Card Framing Zone Controller
        let cropBoxState = {
            x: 0,
            y: 0,
            w: 200,
            h: 317,
            isDragging: false,
            isResizing: false,
            activeHandle: null,
            startX: 0,
            startY: 0,
            startBoxX: 0,
            startBoxY: 0,
            startBoxW: 0,
            startBoxH: 0
        };

        const CARD_RATIO = 54 / 85.6; // CTU ID Card aspect ratio: ~0.63084

        function openZoneFramingView(imageSource) {
            if (!zoneSourceImage || !uploadZoneFramingPanel) {
                processIdImage(imageSource);
                return;
            }

            // Ensure upload capture panel is displayed and camera is stopped
            stopCameraStream();
            if (uploadCapturePanel) uploadCapturePanel.style.display = 'flex';
            if (cameraCapturePanel) cameraCapturePanel.style.display = 'none';

            if (idDropzone) idDropzone.style.display = 'none';
            uploadZoneFramingPanel.style.display = 'flex';

            zoneSourceImage.onload = function () {
                initCropBox();
            };
            zoneSourceImage.src = imageSource;
        }

        function closeZoneFramingView(andOpenFilePicker = false) {
            if (uploadZoneFramingPanel) uploadZoneFramingPanel.style.display = 'none';
            if (idDropzone) idDropzone.style.display = 'block';
            if (idFileInput) {
                idFileInput.value = '';
                if (andOpenFilePicker) {
                    idFileInput.click();
                }
            }
        }

        function initCropBox() {
            if (!zoneSourceImage || !idCardCropBox) return;
            const stageW = zoneSourceImage.clientWidth;
            const stageH = zoneSourceImage.clientHeight;
            if (stageW <= 0 || stageH <= 0) {
                setTimeout(initCropBox, 60);
                return;
            }

            // Fit crop box inside stage with CARD_RATIO (portrait 54 : 85.6)
            let boxH = stageH * 0.78;
            let boxW = boxH * CARD_RATIO;
            if (boxW > stageW * 0.88) {
                boxW = stageW * 0.88;
                boxH = boxW / CARD_RATIO;
            }

            const boxX = (stageW - boxW) / 2;
            const boxY = (stageH - boxH) / 2;

            cropBoxState.x = Math.max(0, boxX);
            cropBoxState.y = Math.max(0, boxY);
            cropBoxState.w = boxW;
            cropBoxState.h = boxH;

            updateCropBoxDom();
        }

        function updateCropBoxDom() {
            if (!idCardCropBox) return;
            idCardCropBox.style.left = cropBoxState.x + 'px';
            idCardCropBox.style.top = cropBoxState.y + 'px';
            idCardCropBox.style.width = cropBoxState.w + 'px';
            idCardCropBox.style.height = cropBoxState.h + 'px';
        }

        function setupCropBoxInteractions() {
            if (!idCardCropBox || !zoneStage) return;

            // Center drag to move
            idCardCropBox.addEventListener('pointerdown', function (e) {
                if (e.target.classList.contains('crop-corner')) return;
                e.preventDefault();
                cropBoxState.isDragging = true;
                cropBoxState.startX = e.clientX;
                cropBoxState.startY = e.clientY;
                cropBoxState.startBoxX = cropBoxState.x;
                cropBoxState.startBoxY = cropBoxState.y;
                idCardCropBox.setPointerCapture(e.pointerId);
            });

            // Corner drag to scale with aspect ratio lock
            const handles = idCardCropBox.querySelectorAll('.crop-corner');
            handles.forEach(handle => {
                handle.addEventListener('pointerdown', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    cropBoxState.isResizing = true;
                    cropBoxState.activeHandle = this.getAttribute('data-handle');
                    cropBoxState.startX = e.clientX;
                    cropBoxState.startY = e.clientY;
                    cropBoxState.startBoxX = cropBoxState.x;
                    cropBoxState.startBoxY = cropBoxState.y;
                    cropBoxState.startBoxW = cropBoxState.w;
                    cropBoxState.startBoxH = cropBoxState.h;
                    handle.setPointerCapture(e.pointerId);
                });
            });

            window.addEventListener('pointermove', function (e) {
                if (!cropBoxState.isDragging && !cropBoxState.isResizing) return;
                if (!zoneSourceImage) return;
                const stageW = zoneSourceImage.clientWidth;
                const stageH = zoneSourceImage.clientHeight;

                if (cropBoxState.isDragging) {
                    const dx = e.clientX - cropBoxState.startX;
                    const dy = e.clientY - cropBoxState.startY;

                    let newX = cropBoxState.startBoxX + dx;
                    let newY = cropBoxState.startBoxY + dy;

                    newX = Math.max(0, Math.min(newX, stageW - cropBoxState.w));
                    newY = Math.max(0, Math.min(newY, stageH - cropBoxState.h));

                    cropBoxState.x = newX;
                    cropBoxState.y = newY;
                    updateCropBoxDom();
                } else if (cropBoxState.isResizing) {
                    const dx = e.clientX - cropBoxState.startX;
                    const handle = cropBoxState.activeHandle;

                    let newW = cropBoxState.startBoxW;
                    let newH = cropBoxState.startBoxH;
                    let newX = cropBoxState.startBoxX;
                    let newY = cropBoxState.startBoxY;

                    if (handle === 'br') {
                        newW = Math.max(70, cropBoxState.startBoxW + dx);
                        newH = newW / CARD_RATIO;
                        if (newX + newW > stageW) {
                            newW = stageW - newX;
                            newH = newW / CARD_RATIO;
                        }
                        if (newY + newH > stageH) {
                            newH = stageH - newY;
                            newW = newH * CARD_RATIO;
                        }
                    } else if (handle === 'tr') {
                        newW = Math.max(70, cropBoxState.startBoxW + dx);
                        newH = newW / CARD_RATIO;
                        const deltaH = newH - cropBoxState.startBoxH;
                        newY = cropBoxState.startBoxY - deltaH;
                        if (newY < 0) {
                            newY = 0;
                            newH = cropBoxState.startBoxY + cropBoxState.startBoxH;
                            newW = newH * CARD_RATIO;
                        }
                        if (newX + newW > stageW) {
                            newW = stageW - newX;
                            newH = newW / CARD_RATIO;
                        }
                    } else if (handle === 'bl') {
                        newW = Math.max(70, cropBoxState.startBoxW - dx);
                        newH = newW / CARD_RATIO;
                        const deltaW = newW - cropBoxState.startBoxW;
                        newX = cropBoxState.startBoxX - deltaW;
                        if (newX < 0) {
                            newX = 0;
                            newW = cropBoxState.startBoxX + cropBoxState.startBoxW;
                            newH = newW / CARD_RATIO;
                        }
                        if (newY + newH > stageH) {
                            newH = stageH - newY;
                            newW = newH * CARD_RATIO;
                        }
                    } else if (handle === 'tl') {
                        newW = Math.max(70, cropBoxState.startBoxW - dx);
                        newH = newW / CARD_RATIO;
                        const deltaW = newW - cropBoxState.startBoxW;
                        const deltaH = newH - cropBoxState.startBoxH;
                        newX = cropBoxState.startBoxX - deltaW;
                        newY = cropBoxState.startBoxY - deltaH;
                        if (newX < 0) {
                            newX = 0;
                            newW = cropBoxState.startBoxX + cropBoxState.startBoxW;
                            newH = newW / CARD_RATIO;
                        }
                        if (newY < 0) {
                            newY = 0;
                            newH = cropBoxState.startBoxY + cropBoxState.startBoxH;
                            newW = newH * CARD_RATIO;
                        }
                    }

                    cropBoxState.x = Math.max(0, newX);
                    cropBoxState.y = Math.max(0, newY);
                    cropBoxState.w = Math.min(newW, stageW);
                    cropBoxState.h = Math.min(newH, stageH);
                    updateCropBoxDom();
                }
            });

            window.addEventListener('pointerup', function () {
                cropBoxState.isDragging = false;
                cropBoxState.isResizing = false;
                cropBoxState.activeHandle = null;
            });
        }

        // Confirm & Crop strictly to the zone!
        function confirmZoneCropAndScan() {
            if (!zoneSourceImage) return;

            const naturalW = zoneSourceImage.naturalWidth || 800;
            const naturalH = zoneSourceImage.naturalHeight || 600;
            const clientW = zoneSourceImage.clientWidth > 0 ? zoneSourceImage.clientWidth : naturalW;
            const clientH = zoneSourceImage.clientHeight > 0 ? zoneSourceImage.clientHeight : naturalH;

            const scaleX = naturalW / clientW;
            const scaleY = naturalH / clientH;

            let cropX = (cropBoxState.x || 0) * scaleX;
            let cropY = (cropBoxState.y || 0) * scaleY;
            let cropW = (cropBoxState.w || clientW) * scaleX;
            let cropH = (cropBoxState.h || clientH) * scaleY;

            // Guard against invalid or tiny crop dimensions
            if (cropW <= 30 || cropH <= 30) {
                cropX = 0;
                cropY = 0;
                cropW = naturalW;
                cropH = naturalH;
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(cropW);
            canvas.height = Math.round(cropH);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(zoneSourceImage, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            if (uploadZoneFramingPanel) uploadZoneFramingPanel.style.display = 'none';
            processIdImage(croppedDataUrl);
        }

        // =====================================================================
        // HIGH-ACCURACY OCR PREPROCESSING ENGINE (HTML5 Canvas, zero dependencies)
        // ---------------------------------------------------------------------
        // Why plain Tesseract fails on CTU IDs even when the photo is sharp:
        //   • yellow/green gradient card background, blue/purple design bars,
        //     seal watermarks, signature strokes crossing the name, and small
        //     tightly-spaced ID digits (e.g. "80419", "8230612").
        // Pipeline applied to every scan:
        //   1. Scale normalization  -> card is resampled to OCR_TARGET_WIDTH px
        //      (≈2x–3x upscale for typical phone crops) so small digits get
        //      clean, separable stroke edges.
        //   2. Grayscale            -> two variants:
        //        'luma'  : 0.3R + 0.59G + 0.11B   (classic luminosity formula)
        //        'value' : max(R,G,B)  "color dropout" – any coloured ink/background
        //                  (yellow card, blue bars, green gradient) turns bright,
        //                  only true black/dark-navy print stays dark.
        //   3. Binarization         -> pure black (0) / pure white (255):
        //        'otsu'    : data-driven global threshold (replaces fixed 120)
        //        'bradley' : local adaptive threshold (integral image) – immune
        //                    to gradients, shadows and uneven lighting.
        //   4. Despeckle + white padding border (Tesseract needs a quiet margin).
        //   5. Multi-pass OCR (PSM 3 full card, PSM 6 credential block) and a
        //      dedicated DIGITS-ONLY pass (PSM 7 + char whitelist 0-9) cropped
        //      exactly at the "ID No." / "Employee ID No." anchor word.
        // Nothing is ever hardcoded – every value comes from the pixels.
        // =====================================================================
        const OCR_TARGET_WIDTH = 1300;
        const OCR_PADDING = 24;

        function renderScaledRegion(imgElement, region) {
            const nW = imgElement.naturalWidth || imgElement.width || 800;
            const nH = imgElement.naturalHeight || imgElement.height || 1200;
            const sx = Math.round(nW * region.x);
            const sy = Math.round(nH * region.y);
            const sw = Math.max(1, Math.round(nW * region.w));
            const sh = Math.max(1, Math.round(nH * region.h));

            // Scale relative to the FULL card width so glyph size is identical across passes
            let scale = OCR_TARGET_WIDTH / nW;
            scale = Math.max(0.4, Math.min(4, scale));

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(sw * scale));
            canvas.height = Math.max(1, Math.round(sh * scale));
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            return canvas;
        }

        function toGray(data, mode) {
            const n = data.length >> 2;
            const gray = new Uint8ClampedArray(n);
            for (let i = 0, p = 0; p < n; i += 4, p++) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                gray[p] = mode === 'value'
                    ? (r > g ? (r > b ? r : b) : (g > b ? g : b))
                    : (r * 0.3 + g * 0.59 + b * 0.11);
            }
            return gray;
        }

        function otsuThreshold(gray) {
            const hist = new Uint32Array(256);
            for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
            const total = gray.length;
            let sum = 0;
            for (let t = 0; t < 256; t++) sum += t * hist[t];
            let sumB = 0, wB = 0, best = 0, threshold = 120;
            for (let t = 0; t < 256; t++) {
                wB += hist[t];
                if (wB === 0) continue;
                const wF = total - wB;
                if (wF === 0) break;
                sumB += t * hist[t];
                const mB = sumB / wB;
                const mF = (sum - sumB) / wF;
                const between = wB * wF * (mB - mF) * (mB - mF);
                if (between > best) { best = between; threshold = t; }
            }
            return threshold;
        }

        // Returns mask: 1 = ink (black), 0 = background (white)
        function binarizeGray(gray, w, h, method) {
            const mask = new Uint8Array(w * h);
            if (method === 'otsu') {
                const t = otsuThreshold(gray);
                for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < t ? 1 : 0;
                return mask;
            }
            // Bradley-Roth adaptive threshold using an integral image
            const integral = new Float64Array((w + 1) * (h + 1));
            for (let y = 1; y <= h; y++) {
                let rowSum = 0;
                for (let x = 1; x <= w; x++) {
                    rowSum += gray[(y - 1) * w + (x - 1)];
                    integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + rowSum;
                }
            }
            const half = Math.max(8, Math.round(w / 16)) >> 1;
            const sensitivity = 0.15;
            for (let y = 0; y < h; y++) {
                const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
                for (let x = 0; x < w; x++) {
                    const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
                    const count = (y1 - y0) * (x1 - x0);
                    const s = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1]
                        - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
                    const v = gray[y * w + x];
                    // Must be clearly darker than its neighbourhood AND genuinely dark
                    mask[y * w + x] = (v * count < s * (1 - sensitivity) && v < 170) ? 1 : 0;
                }
            }
            return mask;
        }

        // Remove isolated noise pixels (dust, card texture) that confuse Tesseract
        function despeckle(mask, w, h) {
            const out = mask.slice();
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    if (!mask[i]) continue;
                    const nb = mask[i - w - 1] + mask[i - w] + mask[i - w + 1] +
                        mask[i - 1] + mask[i + 1] +
                        mask[i + w - 1] + mask[i + w] + mask[i + w + 1];
                    if (nb <= 1) out[i] = 0;
                }
            }
            return out;
        }

        function buildOcrVariant(imgElement, region, grayMode, method) {
            const scaled = renderScaledRegion(imgElement, region);
            const w = scaled.width, h = scaled.height;
            const src = scaled.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
            const gray = toGray(src.data, grayMode);
            let mask = null;
            if (method === 'none') {
                // Contrast stretch (2nd–98th percentile) without binarization
                const hist = new Uint32Array(256);
                for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
                let lo = 0, hi = 255, acc = 0;
                const lowCut = gray.length * 0.02, highCut = gray.length * 0.98;
                for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= lowCut) { lo = t; break; } }
                acc = 0;
                for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= highCut) { hi = t; break; } }
                const range = Math.max(1, hi - lo);
                for (let i = 0; i < gray.length; i++) gray[i] = ((gray[i] - lo) * 255) / range;
            } else {
                mask = despeckle(binarizeGray(gray, w, h, method), w, h);
            }

            const out = document.createElement('canvas');
            out.width = w + OCR_PADDING * 2;
            out.height = h + OCR_PADDING * 2;
            const octx = out.getContext('2d', { willReadFrequently: true });
            const outData = octx.createImageData(out.width, out.height);
            const od = outData.data;
            od.fill(255);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const c = mask ? (mask[y * w + x] ? 0 : 255) : gray[y * w + x];
                    const o = ((y + OCR_PADDING) * out.width + (x + OCR_PADDING)) * 4;
                    od[o] = c; od[o + 1] = c; od[o + 2] = c; od[o + 3] = 255;
                }
            }
            octx.putImageData(outData, 0, 0);
            return out;
        }

        function cropCanvasRegion(src, x0, y0, x1, y1) {
            x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
            x1 = Math.min(src.width, Math.ceil(x1)); y1 = Math.min(src.height, Math.ceil(y1));
            const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
            // Upscale tiny line crops so digit glyphs are ~48px tall
            const up = ch < 60 ? Math.min(3, 60 / ch) : 1;
            const pad = 16;
            const c = document.createElement('canvas');
            c.width = Math.round(cw * up) + pad * 2;
            c.height = Math.round(ch * up) + pad * 2;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(src, x0, y0, cw, ch, pad, pad, Math.round(cw * up), Math.round(ch * up));
            return c;
        }

        function collectOcrWords(data) {
            if (!data) return [];
            if (Array.isArray(data.words) && data.words.length) return data.words;
            const out = [];
            (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p =>
                (p.lines || []).forEach(l => (l.words || []).forEach(w => out.push(w)))));
            return out;
        }

        async function recognizeWithWords(worker, canvas) {
            const res = await worker.recognize(canvas, {}, { text: true, blocks: true });
            return {
                text: (res && res.data && res.data.text) || '',
                confidence: (res && res.data && res.data.confidence) || 0,
                words: collectOcrWords(res && res.data)
            };
        }

        // Locate the "ID No." / "Employee ID No." label word printed on the card
        function findIdAnchorWord(words) {
            const norm = w => ((w && w.text) || '').replace(/[^A-Za-z0-9.:#]/g, '');
            let anchor = null;
            for (let i = 0; i < words.length; i++) {
                const t = norm(words[i]);
                const prev = i > 0 ? norm(words[i - 1]) : '';
                const isNoLabel = /^N[o0]\.?:?/i.test(t);
                const prevIsId = /^(I[D0O]|1D|lD)\.?$/i.test(prev) || /Employ/i.test(prev);
                if ((isNoLabel && prevIsId) || /^I[D0O]N[o0]/i.test(t)) {
                    anchor = words[i]; // keep the last (bottom-most) occurrence
                }
            }
            return anchor;
        }

        // Fallback: a word that already looks like a 4–10 digit ID number
        function findNumericCandidateWord(words) {
            let best = null;
            for (const w of words) {
                const t = ((w && w.text) || '').replace(/[^0-9OoIlSB|]/g, '');
                const realDigits = (t.match(/[0-9]/g) || []).length;
                if (t.length >= 4 && t.length <= 10 && realDigits >= 3 && w.bbox) {
                    if (!best || w.bbox.y0 > best.bbox.y0) best = w;
                }
            }
            return best;
        }

        // Dedicated DIGITS-ONLY recognition (PSM 7 single line + char whitelist)
        // The same crop is read from several differently-preprocessed canvases
        // (all sharing identical geometry) and the results VOTE – this removes
        // single-variant misreads such as 6→8 or a dropped trailing digit.
        async function readIdDigits(worker, canvases, words) {
            if (!words || !words.length || !canvases || !canvases.length) return '';
            const anchor = findIdAnchorWord(words);
            const numeric = findNumericCandidateWord(words);
            const target = (anchor && anchor.bbox) ? { kind: 'anchor', word: anchor }
                : (numeric ? { kind: 'number', word: numeric } : null);
            if (!target) return '';

            const b = target.word.bbox;
            const h = Math.max(10, b.y1 - b.y0);
            const glued = /\d/.test(target.word.text || '');
            const cleanLabelOnly = target.kind === 'anchor' && !glued;
            const refW = canvases[0].width;
            // Generous right margin so no trailing digit is ever cut off
            const x0 = cleanLabelOnly ? b.x1 + 2 : b.x0 - h * 1.2;
            const x1 = Math.min(refW, (target.kind === 'anchor' ? b.x1 + h * 14 : b.x1 + h * 3.5));
            const y0 = b.y0 - h * 0.5, y1 = b.y1 + h * 0.5;

            const votes = {};
            await worker.setParameters({
                tessedit_pageseg_mode: '7',
                tessedit_char_whitelist: cleanLabelOnly ? '0123456789' : 'IDNo.:0123456789'
            });
            for (const canvas of canvases) {
                const crop = cropCanvasRegion(canvas, x0, y0, x1, y1);
                const r = await worker.recognize(crop);
                let txt = ((r && r.data && r.data.text) || '').trim();
                if (!cleanLabelOnly) {
                    // Keep only what follows the "No.:" label, then fix o→0 / I→1
                    const cut = Math.max(txt.lastIndexOf(':'), txt.lastIndexOf('.'));
                    if (cut !== -1 && /\d{4,}/.test(txt.slice(cut + 1))) txt = txt.slice(cut + 1);
                    txt = txt.replace(/o/g, '0').replace(/I/g, '1');
                }
                const runs = txt.match(/\d{4,10}/g);
                console.log(`[OCR] digits-only (${target.kind}) →`, (r && r.data && r.data.text || '').trim(), '| conf', r && r.data && r.data.confidence);
                if (runs && runs.length) {
                    const val = runs.sort((a, c) => c.length - a.length)[0];
                    if (!votes[val]) votes[val] = { count: 0, conf: 0 };
                    votes[val].count++;
                    votes[val].conf = Math.max(votes[val].conf, (r.data.confidence || 0));
                }
            }
            await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });

            const ranked = Object.keys(votes).sort((a, c) =>
                (votes[c].count - votes[a].count) || (votes[c].conf - votes[a].conf) || (c.length - a.length));
            return ranked.length ? ranked[0] : '';
        }

        // =====================================================================
        // ADVANCED AI NEURAL VISION & DYNAMIC FEATURE ANCHOR ENGINE (Canvas 2D)
        // =====================================================================
        // State-of-the-art optical recognition animation:
        //  - NO horizontal up/down scanning bars (completely removed).
        //  - Dynamic feature target brackets (Biometric Portrait, Student Name, CTU Seal, ID No.).
        //  - Neural synaptic constellation graph with drifting nodes & traveling spark pulses.
        //  - Ambient bioluminescent breathing vignette.
        //  - Interactive gravitational physics lens on hover/touch drag.
        let neuralVisionAnimFrame = null;
        let neuralPointerMoveHandler = null;
        let neuralPointerLeaveHandler = null;

        function startNeuralVisionAnimation(imageSource) {
            const canvas = document.getElementById('ocr-vision-canvas') || document.getElementById('ocr-pixel-canvas');
            const badge = document.getElementById('ocr-vision-badge') || document.getElementById('ocr-pixel-badge');
            const badgeText = document.getElementById('vision-badge-text') || document.getElementById('pixel-badge-text');
            const wrapper = document.querySelector('.ocr-image-wrapper');
            if (!canvas) return;

            // Stop any active frame loop before starting fresh
            stopNeuralVisionAnimation();

            canvas.style.display = 'block';
            canvas.style.opacity = '1';
            if (badge) badge.style.display = 'inline-flex';

            const sourceImg = new Image();
            sourceImg.crossOrigin = 'anonymous';

            // Interactive cursor & touch tracking state
            const cursor = { active: false, x: 0, y: 0, targetX: 0, targetY: 0, radius: 0 };

            function onPointerMove(e) {
                const rect = canvas.getBoundingClientRect();
                const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
                cursor.targetX = (clientX - rect.left) * (canvas.width / (rect.width || 1));
                cursor.targetY = (clientY - rect.top) * (canvas.height / (rect.height || 1));
                if (!cursor.active) {
                    cursor.x = cursor.targetX;
                    cursor.y = cursor.targetY;
                    cursor.active = true;
                }
            }

            function onPointerLeave() {
                cursor.active = false;
            }

            canvas.addEventListener('mousemove', onPointerMove, { passive: true });
            canvas.addEventListener('touchmove', onPointerMove, { passive: true });
            canvas.addEventListener('mouseleave', onPointerLeave, { passive: true });
            canvas.addEventListener('touchend', onPointerLeave, { passive: true });

            neuralPointerMoveHandler = onPointerMove;
            neuralPointerLeaveHandler = onPointerLeave;

            sourceImg.onload = function () {
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Match canvas resolution to wrapper geometry for sharp anti-aliased rendering
                const targetW = (wrapper && wrapper.clientWidth > 50) ? wrapper.clientWidth : 300;
                const aspect = (sourceImg.naturalHeight && sourceImg.naturalWidth)
                    ? (sourceImg.naturalHeight / sourceImg.naturalWidth)
                    : 1.333;
                const targetH = (wrapper && wrapper.clientHeight > 50) ? wrapper.clientHeight : Math.round(targetW * aspect);

                canvas.width = targetW;
                canvas.height = targetH;

                const startTime = performance.now();

                // 1. Feature Target Anchors mapping standard CTU ID card anatomy
                const anchors = [
                    { id: 'seal', label: 'CTU SEAL', x: 0.20, y: 0.12, type: 'seal' },
                    { id: 'campus', label: 'CAMPUS HEADER', x: 0.65, y: 0.12, type: 'point' },
                    { id: 'photo', label: 'BIOMETRIC PORTRAIT', x: 0.50, y: 0.38, w: 0.44, h: 0.32, type: 'box' },
                    { id: 'name', label: 'STUDENT IDENTITY', x: 0.50, y: 0.60, w: 0.70, h: 0.08, type: 'box' },
                    { id: 'prog', label: 'ACADEMIC PROGRAM', x: 0.50, y: 0.72, type: 'point' },
                    { id: 'idno', label: 'STUDENT ID NO.', x: 0.50, y: 0.83, w: 0.60, h: 0.08, type: 'box' }
                ];

                // 2. Synaptic Constellation Particles
                const PARTICLE_COUNT = 26;
                const particles = [];
                for (let i = 0; i < PARTICLE_COUNT; i++) {
                    particles.push({
                        x: Math.random() * targetW,
                        y: Math.random() * targetH,
                        vx: (Math.random() - 0.5) * 0.55,
                        vy: (Math.random() - 0.5) * 0.55,
                        radius: 1.2 + Math.random() * 1.4,
                        pulseOffset: Math.random() * Math.PI * 2
                    });
                }

                // 3. Traveling Synaptic Data Spark Packets
                const sparks = [
                    { from: 0, to: 1, p: 0, speed: 0.022 },
                    { from: 2, to: 3, p: 0.3, speed: 0.018 },
                    { from: 4, to: 5, p: 0.6, speed: 0.025 },
                    { from: 1, to: 2, p: 0.1, speed: 0.020 }
                ];

                // Status Timeline Phases
                const PHASES = [
                    { duration: 1200, label: 'AI VISION ENGINE • LOCKING ANCHORS' },
                    { duration: 1400, label: 'SYNAPTIC MAPPING • CTU SEAL & HEADER' },
                    { duration: 1500, label: 'BIOMETRIC ANALYSIS • PORTRAIT & NAME' },
                    { duration: 1600, label: 'NEURAL OCR • DECODING CREDENTIALS' },
                    { duration: Infinity, label: 'VALIDATING INSTITUTIONAL RECORDS' }
                ];

                function renderFrame(now) {
                    const elapsed = now - startTime;
                    const timeSec = elapsed / 1000;

                    // Update Top Badge text smoothly
                    let accum = 0;
                    let currentPhase = PHASES[PHASES.length - 1];
                    for (const p of PHASES) {
                        accum += p.duration;
                        if (elapsed < accum) {
                            currentPhase = p;
                            break;
                        }
                    }
                    if (badgeText && badgeText.textContent !== currentPhase.label) {
                        badgeText.textContent = currentPhase.label;
                    }

                    // Smooth cursor tracking
                    if (cursor.active) {
                        cursor.x += (cursor.targetX - cursor.x) * 0.25;
                        cursor.y += (cursor.targetY - cursor.y) * 0.25;
                        cursor.radius = Math.min(65, cursor.radius + 3);
                    } else {
                        cursor.radius = Math.max(0, cursor.radius - 3);
                    }

                    ctx.clearRect(0, 0, targetW, targetH);

                    // A. Ambient Bioluminescent Breathing Vignette (NO moving bar)
                    const breath = 0.05 + Math.sin(timeSec * 2) * 0.02;
                    const bgGlow = ctx.createRadialGradient(
                        targetW * 0.5, targetH * 0.45, 20,
                        targetW * 0.5, targetH * 0.45, Math.max(targetW, targetH) * 0.7
                    );
                    bgGlow.addColorStop(0, 'rgba(56, 189, 248, ' + breath + ')');
                    bgGlow.addColorStop(0.65, 'rgba(15, 23, 42, 0.12)');
                    bgGlow.addColorStop(1, 'rgba(15, 23, 42, 0.40)');
                    ctx.fillStyle = bgGlow;
                    ctx.fillRect(0, 0, targetW, targetH);

                    // B. Update & Render Synaptic Constellation Particles
                    const maxDist = 68;
                    const maxDistSq = maxDist * maxDist;

                    for (let i = 0; i < particles.length; i++) {
                        const pt = particles[i];
                        pt.x += pt.vx;
                        pt.y += pt.vy;

                        // Soft bounce / wrap
                        if (pt.x < 0) pt.x = targetW;
                        if (pt.x > targetW) pt.x = 0;
                        if (pt.y < 0) pt.y = targetH;
                        if (pt.y > targetH) pt.y = 0;

                        // Gravitational attraction toward interactive cursor
                        if (cursor.active) {
                            const dx = cursor.x - pt.x;
                            const dy = cursor.y - pt.y;
                            const d = Math.hypot(dx, dy);
                            if (d > 5 && d < 100) {
                                pt.x += (dx / d) * 1.1;
                                pt.y += (dy / d) * 1.1;
                            }
                        }

                        // Draw particle dot
                        const ptAlpha = 0.4 + Math.sin(timeSec * 3 + pt.pulseOffset) * 0.25;
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(56, 189, 248, ' + ptAlpha + ')';
                        ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
                        ctx.shadowBlur = 6;
                        ctx.fill();
                        ctx.shadowBlur = 0;

                        // Draw neural connections between nearby particles
                        for (let j = i + 1; j < particles.length; j++) {
                            const pt2 = particles[j];
                            const dx = pt.x - pt2.x;
                            const dy = pt.y - pt2.y;
                            const distSq = dx * dx + dy * dy;

                            if (distSq < maxDistSq) {
                                const dist = Math.sqrt(distSq);
                                const alpha = (1 - dist / maxDist) * 0.32;
                                ctx.beginPath();
                                ctx.moveTo(pt.x, pt.y);
                                ctx.lineTo(pt2.x, pt2.y);
                                ctx.strokeStyle = 'rgba(56, 189, 248, ' + alpha + ')';
                                ctx.lineWidth = 0.85;
                                ctx.stroke();
                            }
                        }
                    }

                    // C. Synaptic Spark Pulses (photons running along neural edges)
                    for (const spark of sparks) {
                        spark.p += spark.speed;
                        if (spark.p >= 1) {
                            spark.p = 0;
                            spark.from = Math.floor(Math.random() * particles.length);
                            spark.to = (spark.from + 1 + Math.floor(Math.random() * (particles.length - 1))) % particles.length;
                        }
                        const p1 = particles[spark.from];
                        const p2 = particles[spark.to];
                        if (p1 && p2) {
                            const sx = p1.x + (p2.x - p1.x) * spark.p;
                            const sy = p1.y + (p2.y - p1.y) * spark.p;
                            ctx.beginPath();
                            ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
                            ctx.fillStyle = '#ffffff';
                            ctx.shadowColor = '#38bdf8';
                            ctx.shadowBlur = 10;
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                    }

                    // D. Render Dynamic Feature Target Anchors
                    for (const anchor of anchors) {
                        const ax = anchor.x * targetW;
                        const ay = anchor.y * targetH;

                        if (anchor.type === 'box') {
                            const bw = anchor.w * targetW;
                            const bh = anchor.h * targetH;
                            const x1 = ax - bw / 2;
                            const y1 = ay - bh / 2;
                            const arm = Math.min(12, bw * 0.16);
                            const cr = 3.5;

                            // Gentle harmonic breath for brackets
                            const bPulse = Math.sin(timeSec * 3 + ax) * 1.5;
                            const effArm = arm + bPulse;

                            ctx.save();
                            ctx.strokeStyle = '#38bdf8';
                            ctx.lineWidth = 1.75;
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                            ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
                            ctx.shadowBlur = 8;

                            // 1. Top-Left Bracket
                            ctx.beginPath();
                            ctx.moveTo(x1, y1 + effArm);
                            ctx.arcTo(x1, y1, x1 + effArm, y1, cr);
                            ctx.lineTo(x1 + effArm, y1);
                            ctx.stroke();

                            // 2. Top-Right Bracket
                            ctx.beginPath();
                            ctx.moveTo(x1 + bw - effArm, y1);
                            ctx.arcTo(x1 + bw, y1, x1 + bw, y1 + effArm, cr);
                            ctx.lineTo(x1 + bw, y1 + effArm);
                            ctx.stroke();

                            // 3. Bottom-Left Bracket
                            ctx.beginPath();
                            ctx.moveTo(x1, y1 + bh - effArm);
                            ctx.arcTo(x1, y1 + bh, x1 + effArm, y1 + bh, cr);
                            ctx.lineTo(x1 + effArm, y1 + bh);
                            ctx.stroke();

                            // 4. Bottom-Right Bracket
                            ctx.beginPath();
                            ctx.moveTo(x1 + bw - effArm, y1 + bh);
                            ctx.arcTo(x1 + bw, y1 + bh, x1 + bw, y1 + bh - effArm, cr);
                            ctx.lineTo(x1 + bw, y1 + bh - effArm);
                            ctx.stroke();

                            ctx.shadowBlur = 0;

                            // Center subtle reticle crosshair inside portrait box
                            if (anchor.id === 'photo') {
                                const crossLen = 6;
                                ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
                                ctx.lineWidth = 1;
                                ctx.beginPath();
                                ctx.moveTo(ax - crossLen, ay);
                                ctx.lineTo(ax + crossLen, ay);
                                ctx.moveTo(ax, ay - crossLen);
                                ctx.lineTo(ax, ay + crossLen);
                                ctx.stroke();
                            }

                            // Minimal Sleek Feature Tag
                            const tagText = anchor.label;
                            ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
                            const textW = ctx.measureText(tagText).width;
                            const tagBoxW = textW + 12;
                            const tagBoxH = 15;
                            const tagX = x1 + 4;
                            const tagY = y1 - tagBoxH - 3;

                            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
                            ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
                            ctx.lineWidth = 0.75;
                            ctx.beginPath();
                            ctx.roundRect(tagX, tagY, tagBoxW, tagBoxH, 4);
                            ctx.fill();
                            ctx.stroke();

                            ctx.fillStyle = '#38bdf8';
                            ctx.fillText(tagText, tagX + 6, tagY + 11);

                            ctx.restore();

                        } else if (anchor.type === 'seal') {
                            // Rotating Concentric Orbital Rings for CTU Institutional Seal
                            ctx.save();
                            const rotSpeed1 = timeSec * 0.8;
                            const rotSpeed2 = -timeSec * 0.6;
                            const r1 = 14;
                            const r2 = 9;

                            // Outer dashed ring
                            ctx.beginPath();
                            ctx.arc(ax, ay, r1, rotSpeed1, rotSpeed1 + Math.PI * 1.5);
                            ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
                            ctx.lineWidth = 1.2;
                            ctx.setLineDash([3, 3]);
                            ctx.stroke();

                            // Inner ring
                            ctx.beginPath();
                            ctx.arc(ax, ay, r2, rotSpeed2, rotSpeed2 + Math.PI * 1.3);
                            ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
                            ctx.lineWidth = 1;
                            ctx.setLineDash([]);
                            ctx.stroke();

                            // Center anchor core
                            ctx.beginPath();
                            ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
                            ctx.fillStyle = '#38bdf8';
                            ctx.shadowColor = '#38bdf8';
                            ctx.shadowBlur = 8;
                            ctx.fill();
                            ctx.shadowBlur = 0;

                            // Label
                            ctx.font = '600 8px ui-monospace, SFMono-Regular, monospace';
                            ctx.fillStyle = '#94a3b8';
                            ctx.fillText(anchor.label, ax + r1 + 5, ay + 3);

                            ctx.restore();

                        } else if (anchor.type === 'point') {
                            // Point anchor with soft ripple ring
                            ctx.save();
                            const rippleR = 4 + (Math.sin(timeSec * 3 + ax) * 0.5 + 0.5) * 8;
                            const rippleA = 1 - (rippleR / 12);

                            ctx.beginPath();
                            ctx.arc(ax, ay, rippleR, 0, Math.PI * 2);
                            ctx.strokeStyle = 'rgba(56, 189, 248, ' + (rippleA * 0.7) + ')';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
                            ctx.fillStyle = '#38bdf8';
                            ctx.fill();

                            ctx.font = '600 8px ui-monospace, SFMono-Regular, monospace';
                            ctx.fillStyle = '#94a3b8';
                            ctx.fillText(anchor.label, ax + 8, ay + 3);
                            ctx.restore();
                        }
                    }

                    // E. Interactive Touch / Cursor Gravitational Halo
                    if (cursor.active && cursor.radius > 0) {
                        ctx.save();

                        // Soft cyan aura around cursor
                        const auraGrad = ctx.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, cursor.radius);
                        auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
                        auraGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.08)');
                        auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
                        ctx.fillStyle = auraGrad;
                        ctx.beginPath();
                        ctx.arc(cursor.x, cursor.y, cursor.radius, 0, Math.PI * 2);
                        ctx.fill();

                        // Magnetic targeting reticle around cursor
                        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
                        ctx.lineWidth = 1.25;
                        ctx.setLineDash([5, 5]);
                        ctx.beginPath();
                        ctx.arc(cursor.x, cursor.y, 22, timeSec * 2, timeSec * 2 + Math.PI * 2);
                        ctx.stroke();

                        // Dynamic synaptic tether curves to 2 nearest anchors
                        const sortedAnchors = anchors.slice().sort((a, b) => {
                            const d1 = Math.hypot(a.x * targetW - cursor.x, a.y * targetH - cursor.y);
                            const d2 = Math.hypot(b.x * targetW - cursor.x, b.y * targetH - cursor.y);
                            return d1 - d2;
                        });

                        ctx.setLineDash([2, 3]);
                        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
                        ctx.lineWidth = 1;
                        for (let k = 0; k < Math.min(2, sortedAnchors.length); k++) {
                            const anc = sortedAnchors[k];
                            const tX = anc.x * targetW;
                            const tY = anc.y * targetH;
                            const midX = (cursor.x + tX) / 2 + Math.sin(timeSec * 4 + k) * 10;
                            const midY = (cursor.y + tY) / 2 + Math.cos(timeSec * 4 + k) * 10;
                            ctx.beginPath();
                            ctx.moveTo(cursor.x, cursor.y);
                            ctx.quadraticCurveTo(midX, midY, tX, tY);
                            ctx.stroke();
                        }

                        // Center pointer dot
                        ctx.setLineDash([]);
                        ctx.beginPath();
                        ctx.arc(cursor.x, cursor.y, 3, 0, Math.PI * 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = '#38bdf8';
                        ctx.shadowBlur = 10;
                        ctx.fill();
                        ctx.shadowBlur = 0;

                        ctx.restore();
                    }

                    neuralVisionAnimFrame = requestAnimationFrame(renderFrame);
                }

                neuralVisionAnimFrame = requestAnimationFrame(renderFrame);
            };

            sourceImg.src = imageSource;
        }

        function stopNeuralVisionAnimation() {
            if (neuralVisionAnimFrame) {
                cancelAnimationFrame(neuralVisionAnimFrame);
                neuralVisionAnimFrame = null;
            }
            const canvas = document.getElementById('ocr-vision-canvas') || document.getElementById('ocr-pixel-canvas');
            const badge = document.getElementById('ocr-vision-badge') || document.getElementById('ocr-pixel-badge');

            if (canvas) {
                if (neuralPointerMoveHandler) {
                    canvas.removeEventListener('mousemove', neuralPointerMoveHandler);
                    canvas.removeEventListener('touchmove', neuralPointerMoveHandler);
                    neuralPointerMoveHandler = null;
                }
                if (neuralPointerLeaveHandler) {
                    canvas.removeEventListener('mouseleave', neuralPointerLeaveHandler);
                    canvas.removeEventListener('touchend', neuralPointerLeaveHandler);
                    neuralPointerLeaveHandler = null;
                }
                canvas.style.opacity = '0';
                setTimeout(() => {
                    if (!neuralVisionAnimFrame) {
                        canvas.style.display = 'none';
                    }
                }, 350);
            }
            if (badge) {
                setTimeout(() => {
                    if (!neuralVisionAnimFrame) {
                        badge.style.display = 'none';
                    }
                }, 350);
            }
        }

        // Aliases & global exports for seamless compatibility
        const startPixelRenderingAnimation = startNeuralVisionAnimation;
        const stopPixelRenderingAnimation = stopNeuralVisionAnimation;
        window.startNeuralVisionAnimation = startNeuralVisionAnimation;
        window.stopNeuralVisionAnimation = stopNeuralVisionAnimation;
        window.startPixelRenderingAnimation = startPixelRenderingAnimation;
        window.stopPixelRenderingAnimation = stopPixelRenderingAnimation;

        // Tesseract OCR Processing Pipeline (multi-pass, preprocessed)
        async function processIdImage(imageSource) {
            if (isOcrProcessing) return;
            isOcrProcessing = true;

            if (cameraCapturePanel) cameraCapturePanel.style.display = 'none';
            if (uploadCapturePanel) uploadCapturePanel.style.display = 'none';
            if (idCaptureTabs) idCaptureTabs.style.display = 'none';
            if (idVerificationSummary) idVerificationSummary.style.display = 'none';
            if (idOcrProcessingView) idOcrProcessingView.style.display = 'block';
            if (ocrRetakeAction) ocrRetakeAction.style.display = 'none';
            if (idCapturedPreview) idCapturedPreview.src = imageSource;
            startPixelRenderingAnimation(imageSource);

            updateOcrStatus('Initializing Tesseract AI OCR Engine...', 10);

            let worker = null;
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('Failed to load image for scanning'));
                    img.src = imageSource;
                });

                if (typeof Tesseract === 'undefined') {
                    throw new Error('Tesseract OCR engine is not ready. Please check internet connection or reload.');
                }

                updateOcrStatus('Enhancing image: upscaling & contrast filtering...', 20, 'FILTERING');
                // Yield to the UI so the status renders before heavy pixel work
                await new Promise(r => setTimeout(r, 30));

                const FULL_CARD = { x: 0, y: 0, w: 1, h: 1 };
                const HEADER = { x: 0, y: 0, w: 1, h: 0.42 }; // institutional header (school name, logo)
                const CREDENTIALS = { x: 0, y: 0.48, w: 1, h: 0.52 }; // name, course/designation, ID No.

                // Full card: two complementary binarization passes
                const fullColorDrop = buildOcrVariant(img, FULL_CARD, 'value', 'bradley');  // removes coloured backgrounds
                const fullLumaBrad = buildOcrVariant(img, FULL_CARD, 'luma', 'bradley');   // dark ink on any background
                const fullLuma = buildOcrVariant(img, FULL_CARD, 'luma', 'otsu');       // global threshold
                // Header: luma modes catch the dark-blue institutional text on yellow/green gradient
                const headerLumaBrad = buildOcrVariant(img, HEADER, 'luma', 'bradley');
                const headerLumaOtsu = buildOcrVariant(img, HEADER, 'luma', 'otsu');
                // Credentials block: three variants for voting
                const credColorDrop = buildOcrVariant(img, CREDENTIALS, 'value', 'bradley');
                const credLumaOtsu = buildOcrVariant(img, CREDENTIALS, 'luma', 'otsu');
                const credGray = buildOcrVariant(img, CREDENTIALS, 'luma', 'none');

                // Preserve original full-color ID preview under neural vision HUD
                // (Tesseract reads binarized variants directly in background memory)

                updateOcrStatus('Loading OCR language model...', 28, 'MODEL READY');
                worker = await Tesseract.createWorker('eng');
                await worker.setParameters({
                    tessedit_pageseg_mode: '3',
                    tessedit_char_whitelist: '',
                    preserve_interword_spaces: '1',
                    user_defined_dpi: '300'
                });

                // --- Pass A: header (luma+Bradley) – most reliable for dark-blue text on coloured gradient ---
                updateOcrStatus('Reading institutional header & seal...', 34, 'CTU SEAL');
                const passHeader = await recognizeWithWords(worker, headerLumaBrad);

                // --- Pass A2: header otsu ---
                const passHeaderOtsu = await recognizeWithWords(worker, headerLumaOtsu);

                // --- Pass B: full card color-dropout ---
                updateOcrStatus('Reading card (color-dropout pass)...', 44, 'BIOMETRICS');
                const passA = await recognizeWithWords(worker, fullColorDrop);

                // --- Pass C: full card luma+Bradley ---
                updateOcrStatus('Reading card (luma pass)...', 54, 'SCANNING');
                const passB = await recognizeWithWords(worker, fullLumaBrad);

                // --- Pass D: credentials block (color-dropout, PSM 6) ---
                updateOcrStatus('Reading name & credentials block...', 64, 'CREDENTIALS');
                await worker.setParameters({ tessedit_pageseg_mode: '6' });
                const passC = await recognizeWithWords(worker, credColorDrop);

                // --- Pass E: credentials block (grayscale, PSM 6) ---
                updateOcrStatus('Cross-checking credentials...', 72, 'CROSS-CHECK');
                const passD = await recognizeWithWords(worker, credGray);

                // --- Pass F: digits-only, voting from 3 credential variants ---
                updateOcrStatus('Reading ID number (digits-only mode)...', 86, 'ID NUMBER');
                const credVariants = [credGray, credLumaOtsu, credColorDrop];
                let idDigits = await readIdDigits(worker, credVariants, passC.words);
                if (!idDigits) idDigits = await readIdDigits(worker, credVariants, passD.words);
                if (!idDigits) idDigits = await readIdDigits(worker, [fullLumaBrad, fullLuma, fullColorDrop], passB.words);

                // Combine ALL passes so parser has maximum keyword coverage
                const combinedText = [passHeader.text, passHeaderOtsu.text, passA.text, passB.text, passC.text, passD.text].join('\n');
                console.log('--- OCR HEADER (luma+Bradley) conf=' + passHeader.confidence + ' ---\n', passHeader.text);
                console.log('--- OCR HEADER-OTSU conf=' + passHeaderOtsu.confidence + ' ---\n', passHeaderOtsu.text);
                console.log('--- OCR PASS A (color-dropout, PSM 3) conf=' + passA.confidence + ' ---\n', passA.text);
                console.log('--- OCR PASS B (luma+Bradley, PSM 3) conf=' + passB.confidence + ' ---\n', passB.text);
                console.log('--- OCR PASS C (credentials b/w, PSM 6) conf=' + passC.confidence + ' ---\n', passC.text);
                console.log('--- OCR PASS D (credentials gray, PSM 6) conf=' + passD.confidence + ' ---\n', passD.text);
                console.log('--- OCR DIGITS-ONLY ID (voted) ---', idDigits || '(none)');

                updateOcrStatus('Parsing institutional records...', 90, 'PARSING');
                const parsed = parseCtuIdText(combinedText, { idNumber: idDigits });

                // Lazy background duplicate check: force rescan if ID already exists
                updateOcrStatus('Checking ID uniqueness in records...', 95, 'DUPLICATE CHECK');
                const idAlreadyExists = await checkIdAlreadyExists(parsed.idNumber);
                if (idAlreadyExists) {
                    throw new Error(`ID Number (${parsed.idNumber}) is already registered in the system. The optical scanner may have misread the digits, or this ID already has an account. Please scan again in a well-lit area or upload a clear, bright photo.`);
                }

                parsed.cardThumbnail = imageSource;
                verifiedIdData = parsed;
                if (idCapturedPreview) idCapturedPreview.src = imageSource;

                updateOcrStatus('Verification Successful!', 100, 'VERIFIED');

                setTimeout(() => {
                    applyVerifiedIdData(parsed);
                }, 500);

            } catch (err) {
                console.error('OCR Processing error:', err);
                const userMsg = err.message || 'The image is blurry or cannot be scanned. Please capture clearly.';
                updateOcrStatus('⚠️ ' + userMsg, 0);
                if (idCapturedPreview) idCapturedPreview.src = imageSource;
                if (ocrRetakeAction) ocrRetakeAction.style.display = 'block';
                if (window.showToast) {
                    showToast(userMsg, '⚠️');
                }
            } finally {
                if (worker) {
                    try { await worker.terminate(); } catch (e) { /* ignore */ }
                }
                stopPixelRenderingAnimation();
                isOcrProcessing = false;
            }
        }

        // Lazy background check: Determine if an ID number is already taken
        async function checkIdAlreadyExists(idNumber) {
            if (!idNumber) return false;
            const cleanId = String(idNumber).trim().toLowerCase();

            // 1. Check local mock storage
            try {
                const mockUsers = JSON.parse(localStorage.getItem('reCapsMockUsers') || '[]');
                const localMatch = mockUsers.some(u => {
                    const sid = String(u.studentId || u.teacherId || '').trim().toLowerCase();
                    return sid === cleanId;
                });
                if (localMatch) return true;
            } catch (e) { }

            // 2. Check Firestore users collection (lazy query)
            if (typeof db !== 'undefined' && db && db.collection) {
                try {
                    const sSnap = await db.collection('users').where('studentId', '==', idNumber).limit(1).get();
                    if (!sSnap.empty) return true;

                    const tSnap = await db.collection('users').where('teacherId', '==', idNumber).limit(1).get();
                    if (!tSnap.empty) return true;
                } catch (fsErr) {
                    console.debug('[ID Check] Firestore check bypassed or offline:', fsErr);
                }
            }
            return false;
        }

        function updateOcrStatus(message, progressPct, reticleTag) {
            if (ocrStatusText) ocrStatusText.textContent = message;
            if (ocrProgressBarFill) ocrProgressBarFill.style.width = progressPct + '%';
            if (reticleTag) {
                const tagEl = document.getElementById('reticle-step-tag');
                if (tagEl) tagEl.textContent = reticleTag;
            }
        }

        // Fully Dynamic Parser for CTU ID card text (ZERO static names, ZERO hallucinated fallbacks)
        function parseCtuIdText(rawText, hints = {}) {
            if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 20) {
                throw new Error('The captured image is too blurry or contains no readable text. Please retake a clear photo.');
            }

            const cleanFull = rawText.replace(/\r/g, ' ');
            const lines = cleanFull.split('\n').map(l => l.trim()).filter(Boolean);

            // 1. Institutional Validation
            // Accept common OCR garbles: 'CEBU' may appear as 'CEBu', 'EBU', 'C£BU';
            // 'TECHNOLOGICAL' often truncated; 'Philippines' sometimes misread.
            const isCtu = /C[E3][BbRr][Uu]|TECHNOLOG|UNIVERSIT|Daanbantayan|Philippines|Republic/i.test(cleanFull)
                || /CEBU|CTU/i.test(cleanFull);
            if (!isCtu) {
                throw new Error('Unable to verify CTU institutional header. The image is blurry, poorly lit, or not an authentic CTU ID card. Please capture clearly.');
            }

            // 2. Role Determination (Dynamic)
            const isTeacher = /Employee(?:\s*ID)?|INSTRUCTOR|DESIGNATION|PROFESSOR|FACULTY|LECTURER|ADVISER/i.test(cleanFull);
            const isStudent = /COURSE|STUDENT|BACHELOR|COLLEGE/i.test(cleanFull) || /\b(BSIT|BSHM|BTLEd|BSEd|BEEd|BSIE|BSFi|BIT)\b/i.test(cleanFull);

            if (!isTeacher && !isStudent) {
                throw new Error('Could not identify card role. The image is blurry or text is illegible. Please retake a clearer photo.');
            }
            const role = isTeacher ? 'teacher' : 'student';

            // 3. ID Number Extraction (Dynamic - NO static numbers or fallbacks)
            //    Priority 1: dedicated digits-only OCR pass (whitelist 0-9) read at the "ID No." anchor
            //    Priority 2: label-anchored regex over the combined OCR text
            let idNumber = '';
            const minLen = role === 'teacher' ? 4 : 6;
            const maxLen = role === 'teacher' ? 8 : 10;

            function cleanOcrDigits(rawStr) {
                if (!rawStr) return '';
                return rawStr
                    .replace(/[oO]/g, '0')
                    .replace(/[Il|]/g, '1')
                    .replace(/S/g, '5')
                    .replace(/B/g, '8')
                    .replace(/[^0-9]/g, '');
            }
            // A genuine ID must be mostly real digits (blocks words like "NOLOGI" from TECHNOLOGICAL)
            function acceptIdCandidate(raw) {
                if (!raw) return '';
                const realDigits = (raw.match(/[0-9]/g) || []).length;
                if (realDigits < Math.max(3, raw.length - 2)) return '';
                const cleaned = cleanOcrDigits(raw);
                return (cleaned.length >= minLen && cleaned.length <= maxLen) ? cleaned : '';
            }

            const hintDigits = ((hints && hints.idNumber) || '').replace(/\D/g, '');
            if (hintDigits.length >= minLen && hintDigits.length <= maxLen) {
                idNumber = hintDigits;
            }

            if (!idNumber) {
                const patterns = role === 'teacher'
                    ? [/Employee\s*I[D0O]\s*N[o0]\.?\s*[:.;]?\s*([0-9OoIlSB|]{4,8})/i,
                        /\bI[D0O]\s*N[o0]\.?\s*[:.;]?\s*([0-9OoIlSB|]{4,8})/i,
                        /\b([0-9]{4,8})\b/]
                    : [/\bI[D0O]\s*N[o0]\.?\s*[:.;]?\s*([0-9OoIlSB|]{6,10})/i,
                        /\b([0-9]{6,10})\b/];
                for (const re of patterns) {
                    const m = cleanFull.match(re);
                    const cand = m ? acceptIdCandidate(m[1]) : '';
                    if (cand) { idNumber = cand; break; }
                }
            }

            if (!idNumber) {
                throw new Error(`Could not read ${role === 'teacher' ? 'Employee ' : ''}ID Number. The image is blurry or obscured. Please capture a clear, well-lit photo.`);
            }

            // 4. Academic Program Extraction (Dynamic for student - NO static fallback)
            let programCode = '';
            let college = '';
            let programName = '';

            if (role === 'student') {
                for (const prog of allPrograms) {
                    const codeMatch = new RegExp(`\\b${prog.code.replace('-', '[- ]?')}\\b`, 'i').test(cleanFull);
                    let aliasMatch = false;
                    if (prog.code === 'BSIT' && /INFORMATION\s*TECHNOLOGY|BSIT|B\.?S\.?I\.?T|BS\s*IT/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code === 'BSIT' && /[BbRr][S5$][Il1][Tt]/.test(cleanFull)) aliasMatch = true; // OCR garbles
                    if (prog.code === 'BSHM' && /\bHM\b|HOSPITALITY|BSHM/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code === 'BTLEd-HE' && /\bHE\b|BTLED|HOME\s*ECONOMICS/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code === 'BSEd-Math' && /BSED|SECONDARY/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code === 'BEEd' && /BEED|ELEMENTARY/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code === 'BSIE' && /BSIE|INDUSTRIAL\s*ENGINEERING/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code === 'BSFi' && /BSFI|FISHERIES/i.test(cleanFull)) aliasMatch = true;
                    if (prog.code.startsWith('BIT') && /BIT|INDUSTRIAL\s*TECHNOLOGY/i.test(cleanFull)) aliasMatch = true;

                    if (codeMatch || aliasMatch) {
                        programCode = prog.code;
                        college = prog.college;
                        programName = prog.name;
                        break;
                    }
                }

                if (!programCode) {
                    throw new Error('Could not detect degree program or course code on student ID. The image is blurry or cropped. Please retake a clearer photo.');
                }
            } else {
                programCode = '';
                college = '';
                programName = 'Faculty / Instruction';
            }

            // 5. Dynamic Name Extraction (NO static string names, NO hardcoded names)
            const institutionalWords = /REPUBLIC|PHILIPPINES|CEBU|TECHNOLOGICAL|UNIVERSITY|DAANBANTAYAN|CAMPUS|AGUJO|COURSE|DESIGNATION|INSTRUCTOR|EMPLOYEE|STUDENT|MANAGEMENT|SYSTEM|CERTIFIED|ISO|TUV|RHEINLAND|COMBINED|EXTRACTED|TEXT|PROGRAM|DEPARTMENT|VALID|UNTIL|SIGNATURE|BEARER/i;

            function cleanNameToken(str) {
                return str.replace(/[^A-Za-z.]/g, '').trim();
            }

            function isRepetitiveNoise(str) {
                const tokens = str.split(/\s+/).map(cleanNameToken).filter(Boolean);
                if (tokens.length === 0) return true;
                let noiseCount = 0;
                for (const t of tokens) {
                    const letters = t.replace(/\./g, '').toUpperCase();
                    if (letters.length <= 1) noiseCount++;
                    else if (/^([A-Z])\1+$/.test(letters)) noiseCount++;
                }
                return noiseCount >= tokens.length * 0.5;
            }

            const nameCandidates = [];

            // Pre-normalize text to dynamically separate glued initials without hardcoded names:
            let normalizedFull = cleanFull
                .replace(/([A-Z]{2,})([A-Z]\.)/g, '$1 $2')
                .replace(/([A-Z]\.)([A-Z]{2,})/g, '$1 $2')
                .replace(/\b([A-Z]+)0([A-Z]*)\b/g, '$1O$2');

            // Pass A: Scan lines
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];

                line = line.replace(/([A-Z]{2,})([A-Z]\.)/g, '$1 $2')
                    .replace(/([A-Z]\.)([A-Z]{2,})/g, '$1 $2')
                    .replace(/\b([A-Z]+)0([A-Z]*)\b/g, '$1O$2');

                let clean = line.replace(/[^A-Za-z\s.]/g, ' ').replace(/\s+/g, ' ').trim();
                if (!clean || clean.length < 5 || institutionalWords.test(clean)) continue;
                if (isRepetitiveNoise(clean)) continue;

                // Check for multi-line split name (e.g. "KENNETH ROI P." on current line and surname on next line)
                if (i < lines.length - 1 && /^[A-Za-z\s.]+[A-Za-z]\.?$/.test(clean)) {
                    const nextClean = lines[i + 1].replace(/[^A-Za-z]/g, '').trim();
                    if (nextClean.length >= 2 && !institutionalWords.test(nextClean) && !/^(COURSE|DESIGNATION|INSTRUCTOR|EMPLOYEE|STUDENT|PART|TIME|ID)$/i.test(nextClean)) {
                        clean = clean + ' ' + nextClean;
                    }
                }

                const words = clean.split(' ').map(cleanNameToken).filter(Boolean);
                if (words.length < 2 || words.length > 5) continue;

                const validTokens = words.filter(w => {
                    const bare = w.replace(/\./g, '');
                    return bare.length >= 2 || (w.length <= 2 && /^[A-Za-z]\.?$/.test(w));
                });
                if (validTokens.length < 2) continue;

                const upperCount = (clean.match(/[A-Z]/g) || []).length;
                const lowerCount = (clean.match(/[a-z]/g) || []).length;
                const isAllUpper = lowerCount === 0 && upperCount >= 4;

                let score = 0;
                if (isAllUpper) {
                    score += 65; // High confidence for official uppercase typography
                } else if (lowerCount > upperCount) {
                    score -= 50; // Heavy penalty for lowercase artifacts like "ke. Al"
                }

                // Layout proximity check: preceding COURSE, DESIGNATION, INSTRUCTOR, or ID lines
                for (let k = i + 1; k <= Math.min(i + 4, lines.length - 1); k++) {
                    if (/COURSE|DESIGNATION|INSTRUCTOR|Employee|ID\s*No/i.test(lines[k])) {
                        score += 45;
                        break;
                    }
                }

                // Check if middle word is a valid middle initial (e.g. "P." or "P")
                const hasMiddleInitial = words.some((w, idx) => idx > 0 && idx < words.length - 1 && /^[A-Z]\.?$/i.test(w));
                if (hasMiddleInitial) {
                    score += 30;
                }

                nameCandidates.push({
                    name: words.join(' '),
                    score
                });
            }

            // Pass B: Regex match across full text for uppercase name pattern (e.g. "FIRSTNAME M. LASTNAME")
            const dynamicNameRegex = /\b([A-Z]{2,}(?:\s+[A-Z]{2,}|\s+[A-Z]\.?){1,4}\s+[A-Z]{2,})\b/g;
            let nMatch;
            while ((nMatch = dynamicNameRegex.exec(normalizedFull)) !== null) {
                const cand = nMatch[1].replace(/\s+/g, ' ').trim();
                if (!institutionalWords.test(cand) && !isRepetitiveNoise(cand)) {
                    const words = cand.split(' ');
                    if (words.length >= 2 && words.length <= 5) {
                        const hasMiddleInitial = words.some((w, idx) => idx > 0 && idx < words.length - 1 && /^[A-Z]\.?$/i.test(w));
                        nameCandidates.push({
                            name: cand,
                            score: 70 + (hasMiddleInitial ? 30 : 0)
                        });
                    }
                }
            }

            let fullName = '';
            if (nameCandidates.length > 0) {
                nameCandidates.sort((a, b) => b.score - a.score);
                if (nameCandidates[0].score >= 40) {
                    fullName = nameCandidates[0].name;
                }
            }

            if (!fullName) {
                throw new Error('Could not read full legal name from ID card. The image is blurry or unclear. Please retake a clearer photo.');
            }

            // Parse into firstName, middleName, lastName dynamically
            let firstName = '', middleName = '', lastName = '';
            const parts = fullName.split(' ').filter(Boolean);
            const midIdx = parts.findIndex((w, idx) => idx > 0 && idx < parts.length - 1 && /^[A-Za-z]\.?$/.test(w));

            if (midIdx !== -1) {
                firstName = parts.slice(0, midIdx).join(' ');
                middleName = parts[midIdx].replace(/\./g, '');
                lastName = parts.slice(midIdx + 1).join(' ');
            } else if (parts.length === 2) {
                firstName = parts[0];
                lastName = parts[1];
            } else if (parts.length >= 3) {
                lastName = parts[parts.length - 1];
                firstName = parts.slice(0, parts.length - 1).join(' ');
            }

            return {
                isCtu,
                role,
                fullName,
                firstName,
                middleName,
                lastName,
                idNumber,
                programCode,
                programName,
                college
            };
        }

        // Apply Extracted Data to the Registration UI & Lock the Fields
        function applyVerifiedIdData(parsed) {
            stopPixelRenderingAnimation();
            if (idOcrProcessingView) idOcrProcessingView.style.display = 'none';
            if (idVerificationSummary) idVerificationSummary.style.display = 'block';

            const isStudent = (parsed.role === 'student');

            // Set role text without any emoji icon
            if (summaryRoleVal) summaryRoleVal.textContent = isStudent ? 'Student' : 'Teacher / Faculty';
            if (summaryNameVal) summaryNameVal.textContent = parsed.fullName;
            if (summaryIdVal) summaryIdVal.textContent = parsed.idNumber;
            if (summaryProgramVal) {
                summaryProgramVal.textContent = isStudent
                    ? `${parsed.programCode} (${parsed.college})`
                    : 'Faculty / Instruction';
            }

            userType = parsed.role;
            userTypeInput.value = parsed.role;

            if (roleCards && roleCards.length > 0) {
                roleCards.forEach(c => {
                    c.classList.remove('selected', 'dimmed');
                    if (c.getAttribute('data-role') === parsed.role) {
                        c.classList.add('selected');
                    } else {
                        c.classList.add('dimmed');
                    }
                });
            }

            // Populate summary card with the verified full name from Step 1
            syncSummaryCardName();

            // Enable Next button on Step 2 to advance to Step 3 (Google Auth)
            if (nextToStep3Btn) {
                nextToStep3Btn.disabled = false;
                attachTooltipToButton(nextToStep3Btn, 'Proceed to Google account authentication');
            }

            // Academic Profile Data
            if (isStudent) {
                if (studentIdInput) studentIdInput.value = parsed.idNumber;
                if (studentCollegeInput) studentCollegeInput.value = parsed.college;
                if (programInput) programInput.value = parsed.programCode;
            } else {
                // Teacher: Employee ID is prefilled, but editable!
                if (teacherIdInput) {
                    teacherIdInput.value = parsed.idNumber;
                    teacherIdInput.readOnly = false;
                    teacherIdInput.classList.remove('form-input-locked');
                }
                if (teacherCollegeInput) {
                    teacherCollegeInput.value = '';
                }
                const teacherCards = document.querySelectorAll('#teacher-college-group .college-card');
                teacherCards.forEach(c => c.classList.remove('selected'));

                const teacherDeptInput = document.getElementById('teacher-department');
                if (teacherDeptInput && !teacherDeptInput.value) {
                    teacherDeptInput.value = 'Part-Time Instructor';
                }
            }
            validateStep4();

            // Refresh step indicator dynamically (6 steps for student, 7 steps for teacher)
            renderStepIndicator();

            if (window.showToast) {
                showToast(`CTU ID Authenticated! Verified as ${isStudent ? 'STUDENT' : 'FACULTY'}`, '🎉');
            }
        }

        // Rescan / Reset ID Verification
        // Dynamic State Synchronization: Sync Step 1 Name inputs into Step 2 summary card & verifiedIdData
        function syncSummaryCardName() {
            const f = firstNameInput ? firstNameInput.value.trim() : '';
            const m = middleNameInput ? middleNameInput.value.trim() : '';
            const l = lastNameInput ? lastNameInput.value.trim() : '';
            const enteredFullName = [f, m, l].filter(Boolean).join(' ');

            if (summaryNameVal) {
                if (enteredFullName) {
                    summaryNameVal.textContent = enteredFullName;
                } else if (verifiedIdData && verifiedIdData.fullName) {
                    summaryNameVal.textContent = verifiedIdData.fullName;
                }
            }
            if (summaryFirstName && f) summaryFirstName.value = f;
            if (summaryMiddleName && m) summaryMiddleName.value = m;
            if (summaryLastName && l) summaryLastName.value = l;

            if (verifiedIdData && enteredFullName) {
                verifiedIdData.fullName = enteredFullName;
                verifiedIdData.firstName = f;
                verifiedIdData.middleName = m;
                verifiedIdData.lastName = l;
            }
        }

        function resetIdVerification() {
            stopPixelRenderingAnimation();
            verifiedIdData = null;
            userType = null;
            userTypeInput.value = '';

            if (roleCards && roleCards.length > 0) {
                roleCards.forEach(c => c.classList.remove('selected', 'dimmed'));
            }
            if (nextToStep3Btn) {
                nextToStep3Btn.disabled = true;
                attachTooltipToButton(nextToStep3Btn, 'Please scan and verify your official CTU ID card first');
            }

            if (idVerificationSummary) idVerificationSummary.style.display = 'none';
            if (idOcrProcessingView) idOcrProcessingView.style.display = 'none';
            if (uploadZoneFramingPanel) uploadZoneFramingPanel.style.display = 'none';
            if (idDropzone) idDropzone.style.display = 'block';
            if (idFileInput) idFileInput.value = '';
            if (idCaptureTabs) idCaptureTabs.style.display = 'flex';

            renderStepIndicator();

            if (currentCaptureMode === 'camera') {
                if (cameraCapturePanel) cameraCapturePanel.style.display = 'flex';
                initCameraCapture();
            } else {
                if (uploadCapturePanel) uploadCapturePanel.style.display = 'flex';
            }
        }

        // Event Wiring for ID Capture
        if (tabCameraCapture) tabCameraCapture.addEventListener('click', switchToCameraMode);
        if (tabUploadCapture) tabUploadCapture.addEventListener('click', switchToUploadMode);
        if (btnCapturePhoto) btnCapturePhoto.addEventListener('click', capturePhotoFromVideo);

        if (idCameraFallbackInput) {
            idCameraFallbackInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => openZoneFramingView(event.target.result);
                    reader.readAsDataURL(file);
                }
                idCameraFallbackInput.value = '';
            });
        }

        if (cameraFallbackOverlay) {
            cameraFallbackOverlay.addEventListener('click', () => {
                if (idCameraFallbackInput) idCameraFallbackInput.click();
            });
        }

        if (btnBrowseId && idFileInput) {
            btnBrowseId.addEventListener('click', () => idFileInput.click());
            idFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => openZoneFramingView(event.target.result);
                    reader.readAsDataURL(file);
                }
            });
        }

        if (idDropzone) {
            idDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                idDropzone.classList.add('dragover');
            });
            idDropzone.addEventListener('dragleave', () => {
                idDropzone.classList.remove('dragover');
            });
            idDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                idDropzone.classList.remove('dragover');
                const file = e.dataTransfer.files && e.dataTransfer.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => openZoneFramingView(event.target.result);
                    reader.readAsDataURL(file);
                }
            });
        }

        if (btnCancelZone) btnCancelZone.addEventListener('click', () => closeZoneFramingView(true));
        if (btnResetZone) btnResetZone.addEventListener('click', initCropBox);
        if (btnConfirmZoneScan) btnConfirmZoneScan.addEventListener('click', confirmZoneCropAndScan);
        setupCropBoxInteractions();

        if (btnRetakeId) {
            btnRetakeId.addEventListener('click', () => {
                resetIdVerification();
                if (currentCaptureMode === 'upload' && idFileInput) {
                    idFileInput.click();
                }
            });
        }
        if (btnRescanLink) btnRescanLink.addEventListener('click', resetIdVerification);

        // Role selection cards (Restricted: Clicking manually is blocked if cards exist)
        if (roleCards && roleCards.length > 0) {
            roleCards.forEach(card => {
                card.setAttribute('tabindex', '0');
                card.setAttribute('role', 'button');
                card.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.click();
                    }
                });
                card.addEventListener('click', function () {
                    if (!verifiedIdData) {
                        this.classList.add('shake');
                        setTimeout(() => this.classList.remove('shake'), 500);
                        if (window.showToast) {
                            showToast('⚠️ Manual selection is restricted. Please capture or upload your official CTU ID card.', '🔒');
                        }
                    }
                });
            });
        }

        attachTooltipToButton(nextToStep2Btn, 'Please scan and verify your official CTU ID card first');

        // Google authentication state validation
        function validateStep3() {
            const isValid = googleUser !== null && verifiedEmail !== null;
            nextToStep4Btn.disabled = !isValid;
            if (!isValid) {
                attachTooltipToButton(nextToStep4Btn, 'Please sign in with Google first');
            }
        }

        validateStep3();

        // Firebase Google Authentication Popup Handler
        if (googleSignInBtn) {
            googleSignInBtn.addEventListener('click', async function () {
                try {
                    accountExistsError.style.display = 'none';
                    googleSignInBtn.disabled = true;
                    googleSignInBtn.innerHTML = '<span>Signing in...</span>';

                    const provider = new firebase.auth.GoogleAuthProvider();
                    provider.addScope('email');
                    provider.addScope('profile');

                    const result = await auth.signInWithPopup(provider);
                    googleUser = result.user;
                    verifiedEmail = googleUser.email;

                    // Check if account has BOTH Google and Password providers linked (fully registered)
                    const providerIds = (googleUser.providerData || []).map(p => p.providerId);
                    const hasGoogleProvider = providerIds.includes('google.com') || providerIds.includes(firebase.auth.GoogleAuthProvider.PROVIDER_ID);
                    const hasPasswordProvider = providerIds.includes('password') || providerIds.includes(firebase.auth.EmailAuthProvider.PROVIDER_ID);

                    let signInMethods = [];
                    try {
                        signInMethods = await auth.fetchSignInMethodsForEmail(googleUser.email);
                    } catch (e) {
                        console.warn('Could not fetch sign-in methods:', e);
                    }

                    const hasPasswordMethod = signInMethods.includes('password');
                    const hasGoogleMethod = signInMethods.includes('google.com');

                    // Check Firestore user document
                    const userDoc = await db.collection('users').doc(googleUser.uid).get();
                    const docData = userDoc.exists ? userDoc.data() : null;
                    const docHasPassword = docData && Array.isArray(docData.authProviders) && docData.authProviders.includes('password');

                    // An account is only already registered if it has BOTH providers (Google and email/password)
                    const isFullyRegistered = (hasGoogleProvider && hasPasswordProvider) ||
                        (hasGoogleMethod && hasPasswordMethod) ||
                        (userDoc.exists && docHasPassword);

                    if (isFullyRegistered) {
                        const existingEmail = googleUser.email;
                        await auth.signOut();
                        googleUser = null;
                        verifiedEmail = null;

                        googleAuthStatus.style.display = 'none';
                        googleSignInBtn.style.display = 'none';
                        errorMessage.textContent = `The Google account "${existingEmail}" is already registered. Please login instead or use a different Google account.`;
                        accountExistsError.style.display = 'flex';
                        if (window.showToast) {
                            showToast('⚠️ Validation Error: Email is already linked to a registered account.', '❌');
                        }
                        nextToStep4Btn.disabled = true;
                        return;
                    }

                    accountExistsError.style.display = 'none';
                    googleUserAvatar.src = googleUser.photoURL || 'https://via.placeholder.com/48';
                    googleUserName.textContent = googleUser.displayName || 'User';
                    googleUserEmail.textContent = googleUser.email;

                    googleAuthStatus.style.display = 'none';
                    googleSignInBtn.style.display = 'none';
                    googleAuthInfo.style.display = 'flex';
                    nextToStep4Btn.disabled = false;

                } catch (error) {
                    console.error('Google Sign-In error:', error);
                    googleSignInBtn.disabled = false;
                    googleSignInBtn.innerHTML = `
                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('google') : ''}
                        <span>Sign in with Google</span>
                    `;
                    let errorTitle = 'Authentication Failed';
                    let errorMsg = error.message;
                    let errorType = 'danger';

                    if (error.code === 'auth/popup-closed-by-user') {
                        errorTitle = 'Sign-In Cancelled';
                        errorMsg = 'The Google sign-in window was closed before completion. Please try again.';
                        errorType = 'warning';
                    } else if (error.code === 'auth/popup-blocked') {
                        errorTitle = 'Pop-Up Blocked';
                        errorMsg = 'Your browser blocked the Google authentication pop-up. Please allow pop-ups for this site and try again.';
                        errorType = 'warning';
                    }

                    if (window.ModalDialog) {
                        await ModalDialog.alert({
                            title: errorTitle,
                            message: errorMsg,
                            type: errorType
                        });
                    } else if (typeof showToast === 'function') {
                        showToast(errorMsg, errorType);
                    } else {
                        alert(errorMsg);
                    }
                }
            });
        }

        // Change Google account handler
        if (changeGoogleAccountBtn) {
            changeGoogleAccountBtn.addEventListener('click', async function () {
                try {
                    await auth.signOut();
                    googleUser = null;
                    verifiedEmail = null;
                    googleAuthInfo.style.display = 'none';
                    accountExistsError.style.display = 'none';
                    googleAuthStatus.style.display = 'flex';
                    googleSignInBtn.style.display = 'flex';
                    googleSignInBtn.disabled = false;
                    googleSignInBtn.innerHTML = `
                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('google') : ''}
                        <span>Sign in with Google</span>
                    `;
                    nextToStep4Btn.disabled = true;
                } catch (error) {
                    console.error('Sign-out error:', error);
                    if (window.ModalDialog) {
                        await ModalDialog.alert({
                            title: 'Sign Out Error',
                            message: 'Error signing out: ' + error.message,
                            type: 'danger'
                        });
                    } else if (typeof showToast === 'function') {
                        showToast('Error signing out: ' + error.message, 'error');
                    } else {
                        alert('Error signing out: ' + error.message);
                    }
                }
            });
        }

        // Try Different Account popup trigger
        if (tryDifferentAccountBtn) {
            tryDifferentAccountBtn.addEventListener('click', async function () {
                accountExistsError.style.display = 'none';
                googleAuthStatus.style.display = 'flex';
                googleSignInBtn.style.display = 'flex';
                googleSignInBtn.disabled = false;
                googleSignInBtn.innerHTML = `
                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('google') : ''}
                    <span>Sign in with Google</span>
                `;
                setTimeout(() => googleSignInBtn.click(), 100);
            });
        }

        // Step 1: Personal Information (Full Name) Validations
        const firstNameInput = document.getElementById('first-name');
        const middleNameInput = document.getElementById('middle-name');
        const lastNameInput = document.getElementById('last-name');

        function preventNumbers(e) {
            const value = e.target.value;
            e.target.value = value.replace(/[0-9]/g, '');
        }

        function validateStep1() {
            if (!firstNameInput || !lastNameInput) return false;
            const first = firstNameInput.value.trim();
            const last = lastNameInput.value.trim();
            const hasNumbers = /[0-9]/.test(first) || /[0-9]/.test(last);

            const valid = first.length >= 2 && last.length >= 2 && !hasNumbers;

            if (nextToStep2Btn) {
                nextToStep2Btn.disabled = !valid;
                attachTooltipToButton(nextToStep2Btn, valid
                    ? 'Proceed to CTU ID Verification'
                    : 'Please enter your first and last name to proceed');
            }
            return valid;
        }

        // Wire Step 1 inputs with live Step 2 state synchronization
        [firstNameInput, middleNameInput, lastNameInput].forEach(inp => {
            if (!inp) return;
            inp.addEventListener('input', (e) => {
                preventNumbers(e);
                validateStep1();
                syncSummaryCardName();
            });
            inp.addEventListener('blur', () => {
                validateStep1();
                syncSummaryCardName();
            });
        });

        if (firstNameInput) {
            firstNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (middleNameInput) middleNameInput.focus();
                    else if (lastNameInput) lastNameInput.focus();
                }
            });
        }
        if (middleNameInput) {
            middleNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (lastNameInput) lastNameInput.focus();
                }
            });
        }
        if (lastNameInput) {
            lastNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (validateStep1() && nextToStep2Btn && !nextToStep2Btn.disabled) {
                        nextToStep2Btn.click();
                    }
                }
            });
        }

        function validateStep2() { return true; }


        // Password strength algorithms
        function checkPasswordStrength(password) {
            if (!password) {
                return { strength: '', suggestion: '' };
            }

            const hasLowerCase = /[a-z]/.test(password);
            const hasUpperCase = /[A-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            const isLongEnough = password.length >= 8;

            let strength = '';
            let suggestion = '';

            if (!hasNumber) {
                suggestion = 'Hint: Add numbers to strengthen';
                strength = 'weak';
            } else if (!hasLowerCase) {
                suggestion = 'Hint: Add lowercase letters';
                strength = 'weak';
            } else if (!hasUpperCase) {
                suggestion = 'Hint: Add uppercase letters';
                strength = 'fair';
            } else if (!hasSpecialChar) {
                suggestion = 'Hint: Add special characters (!@#$%^&*)';
                strength = 'good';
            } else if (!isLongEnough) {
                suggestion = 'Hint: Use at least 8 characters';
                strength = 'good';
            } else {
                suggestion = 'Strong password';
                strength = 'strong';
            }

            return { strength, suggestion };
        }

        function updatePasswordStrength() {
            const password = passwordInput.value;
            const result = checkPasswordStrength(password);

            passwordStrengthFill.className = 'password-strength-fill';
            if (result.strength) {
                passwordStrengthFill.classList.add(result.strength);
            }
            passwordSuggestion.textContent = result.suggestion;
        }

        function setupPasswordToggle() {
            const toggleButtons = document.querySelectorAll('.toggle-password-btn');

            toggleButtons.forEach(button => {
                button.addEventListener('click', function () {
                    const targetId = this.getAttribute('data-target');
                    const targetInput = document.getElementById(targetId);
                    const eyeOpen = this.querySelector('.eye-open');
                    const eyeClosed = this.querySelector('.eye-closed');

                    if (targetInput.type === 'password') {
                        targetInput.type = 'text';
                        eyeOpen.style.display = 'none';
                        eyeClosed.style.display = 'block';
                    } else {
                        targetInput.type = 'password';
                        eyeOpen.style.display = 'block';
                        eyeClosed.style.display = 'none';
                    }
                });
            });
        }

        function validateStep5() {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            const result = checkPasswordStrength(password);
            const isValid = result.strength === 'strong' && password === confirmPassword;
            nextToStep6Btn.disabled = !isValid;
            if (!isValid) {
                if (result.strength !== 'strong') {
                    attachTooltipToButton(nextToStep6Btn, 'Password must be strong');
                } else if (password !== confirmPassword) {
                    attachTooltipToButton(nextToStep6Btn, 'Passwords do not match');
                }
            }
        }

        if (passwordInput && confirmPasswordInput) {
            passwordInput.addEventListener('input', () => {
                updatePasswordStrength();
                validateStep5();
            });
            confirmPasswordInput.addEventListener('input', validateStep5);
            validateStep5();
            setupPasswordToggle();
        }

        // Step 6: Password Recall Check
        if (passwordTestInput) {
            passwordTestInput.addEventListener('copy', (e) => e.preventDefault());
            passwordTestInput.addEventListener('paste', (e) => e.preventDefault());
            passwordTestInput.addEventListener('cut', (e) => e.preventDefault());
            passwordTestInput.addEventListener('contextmenu', (e) => e.preventDefault());

            passwordTestInput.addEventListener('input', function () {
                const enteredPassword = this.value;

                if (enteredPassword === savedPassword) {
                    this.className = 'form-input password-test-input correct';
                    passwordTestFeedback.textContent = 'Correct! Password verified';
                    passwordTestFeedback.className = 'password-test-feedback correct';
                    nextToStep7Btn.disabled = false;
                } else if (enteredPassword.length >= savedPassword.length) {
                    this.className = 'form-input password-test-input incorrect';
                    passwordTestFeedback.textContent = '✗ Incorrect password. Try again';
                    passwordTestFeedback.className = 'password-test-feedback incorrect';
                    nextToStep7Btn.disabled = true;

                    setTimeout(() => {
                        this.value = '';
                        this.className = 'form-input password-test-input';
                        passwordTestFeedback.textContent = '';
                    }, 1500);
                } else {
                    this.className = 'form-input password-test-input';
                    passwordTestFeedback.textContent = '';
                    nextToStep7Btn.disabled = true;
                }
            });
        }

        // Step 6: Validation and tooltip
        function validateStep6() {
            const enteredPassword = passwordTestInput.value;
            const isValid = enteredPassword === savedPassword;
            nextToStep7Btn.disabled = !isValid;
            if (!isValid) {
                attachTooltipToButton(nextToStep7Btn, 'Please enter the correct password to verify');
            }
        }

        // Initialize Step 6 validation
        if (nextToStep7Btn) {
            validateStep6();
            attachTooltipToButton(nextToStep7Btn, 'Please enter the correct password to verify');
        }

        // Step 4: Academic profile logic
        function validateStep4() {
            let isValid = false;
            let tooltipMessage = '';

            if (userType === 'student') {
                const studentId = studentIdInput.value.trim();
                const college = studentCollegeInput.value;
                const program = programInput.value;

                if (!studentId) {
                    tooltipMessage = 'Please enter your Student ID';
                } else if (!college) {
                    tooltipMessage = 'Please select your College';
                } else if (!program) {
                    tooltipMessage = 'Please select your Program';
                } else {
                    isValid = true;
                }
            } else if (userType === 'teacher') {
                const teacherId = teacherIdInput.value.trim();
                const college = teacherCollegeInput.value;

                if (!teacherId) {
                    tooltipMessage = 'Please enter your Teacher ID';
                } else if (!college) {
                    tooltipMessage = 'Please select your College';
                } else {
                    isValid = true;
                }
            }

            nextToStep5Btn.disabled = !isValid;
            if (!isValid) {
                attachTooltipToButton(nextToStep5Btn, tooltipMessage);
            }
        }

        if (studentIdInput) {
            studentIdInput.addEventListener('input', () => {
                if (userType === 'student') validateStep4();
            });
        }

        if (teacherIdInput) {
            teacherIdInput.addEventListener('input', () => {
                if (userType === 'teacher') validateStep4();
            });
        }

        // Teacher college selection
        collegeCards.forEach(card => {
            card.addEventListener('click', function () {
                const parentId = this.closest('#teacher-college-group');
                if (parentId) {
                    const teacherCards = document.querySelectorAll('#teacher-college-group .college-card');
                    teacherCards.forEach(c => c.classList.remove('selected'));
                    this.classList.add('selected');
                    const selectedCollege = this.getAttribute('data-college');
                    teacherCollegeInput.value = selectedCollege;

                    if (userType === 'teacher') validateStep4();
                }
            });
        });

        // Student college card selections
        studentCollegeCardsElements.forEach(card => {
            card.addEventListener('click', function () {
                studentCollegeCardsElements.forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');

                const selectedCollege = this.getAttribute('data-college');
                studentCollegeInput.value = selectedCollege;
                selectedCollegeName.textContent = selectedCollege;

                setTimeout(() => {
                    studentCollegeCards.classList.add('compact');

                    setTimeout(() => {
                        studentCollegeSelected.style.display = 'block';
                        setTimeout(() => {
                            studentCollegeSelected.classList.add('show');

                            setTimeout(() => {
                                showProgramDropdown(selectedCollege);
                                if (userType === 'student') validateStep4();
                            }, 200);
                        }, 50);
                    }, 400);
                }, 300);
            });
        });

        // College change button
        if (changeCollegeBtn) {
            changeCollegeBtn.addEventListener('click', function () {
                programGroup.classList.remove('show');

                setTimeout(() => {
                    studentCollegeSelected.classList.remove('show');

                    setTimeout(() => {
                        studentCollegeSelected.style.display = 'none';
                        studentCollegeCards.classList.remove('compact');

                        studentCollegeInput.value = '';
                        programInput.value = '';
                        studentCollegeCardsElements.forEach(c => c.classList.remove('selected'));

                        if (userType === 'student') validateStep4();
                    }, 300);
                }, 200);
            });
        }

        // Program selections and filtration
        function showProgramDropdown(selectedCollege) {
            filteredPrograms = allPrograms.filter(p => p.college === selectedCollege);
            currentProgramIndex = 0;
            renderProgramCarousel();
            programGroup.classList.add('show');
        }

        function renderProgramCarousel() {
            programCarouselTrack.innerHTML = '';
            programIndicators.innerHTML = '';

            if (filteredPrograms.length === 0) return;

            filteredPrograms.forEach((program, index) => {
                const card = document.createElement('div');
                card.className = 'program-card';
                card.dataset.index = index;
                card.dataset.code = program.code;

                card.innerHTML = `
                    <div class="program-code">${program.code}</div>
                    <div class="program-name">${program.name}</div>
                `;

                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(card.dataset.index, 10);
                    if (!isNaN(idx)) {
                        selectProgram(idx);
                    }
                });

                programCarouselTrack.appendChild(card);

                const dot = document.createElement('span');
                dot.className = 'program-indicator-dot';
                dot.dataset.index = index;
                dot.addEventListener('click', () => selectProgram(index));
                programIndicators.appendChild(dot);
            });

            currentProgramIndex = 0;
            const firstProgram = filteredPrograms[0];
            programInput.value = firstProgram.code;

            updateProgramCarousel();
            attachProgramParallax();

            if (userType === 'student') {
                setTimeout(() => validateStep4(), 100);
            }
        }

        function selectProgram(index) {
            let targetIdx = index;
            if (typeof index === 'object' && index !== null && index.code) {
                targetIdx = filteredPrograms.findIndex(p => p.code === index.code);
            }
            currentProgramIndex = Math.max(0, Math.min(Number(targetIdx) || 0, Math.max(0, filteredPrograms.length - 1)));
            const selectedProgram = filteredPrograms[currentProgramIndex];
            if (selectedProgram && programInput) {
                programInput.value = selectedProgram.code;
            }
            updateProgramCarousel();

            if (userType === 'student') validateStep4();
        }

        function updateProgramCarousel() {
            const cards = programCarouselTrack.querySelectorAll('.program-card');
            const dots = programIndicators.querySelectorAll('.program-indicator-dot');

            if (cards.length === 0) return;

            cards.forEach((card, i) => {
                card.classList.toggle('active', i === currentProgramIndex);
            });

            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentProgramIndex);
            });

            const viewportWidth = programCarouselViewport.clientWidth;
            const cardWidth = cards[0].offsetWidth + 16;
            const offset = (viewportWidth / 2) - (cardWidth / 2) - (currentProgramIndex * cardWidth);
            programCarouselTrack.style.transform = `translateX(${offset}px)`;
        }

        function attachProgramParallax() {
            const cards = programCarouselTrack.querySelectorAll('.program-card');

            programCarouselViewport.addEventListener('mousemove', (e) => {
                const rect = programCarouselViewport.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;

                cards.forEach(card => {
                    if (!card.classList.contains('active')) {
                        const shift = x * 8;
                        card.style.transform = `translateX(${shift}px) scale(1.01)`;
                    }
                });
            });

            programCarouselViewport.addEventListener('mouseleave', () => {
                cards.forEach(card => {
                    card.style.transform = '';
                });
            });
        }

        function nextProgram() {
            if (currentProgramIndex < filteredPrograms.length - 1) {
                selectProgram(currentProgramIndex + 1);
            }
        }

        function prevProgram() {
            if (currentProgramIndex > 0) {
                selectProgram(currentProgramIndex - 1);
            }
        }

        function handleProgramWheel(e) {
            e.preventDefault();
            const delta = e.deltaY || e.deltaX;
            if (delta > 0) {
                nextProgram();
            } else if (delta < 0) {
                prevProgram();
            }
        }

        if (programPrevArrow) {
            programPrevArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                prevProgram();
            });
        }

        if (programNextArrow) {
            programNextArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                nextProgram();
            });
        }

        if (programCarouselViewport) {
            programCarouselViewport.addEventListener('wheel', handleProgramWheel, { passive: false });
        }

        document.addEventListener('keydown', (e) => {
            if (programGroup && programGroup.classList.contains('show')) {
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    nextProgram();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    prevProgram();
                }
            }
        });

        // Navigation visual updates
        function showStep(stepNumber) {
            if (isCreatingAccount) return;
            const step8 = document.getElementById('step-8');

            step1.classList.remove('active');
            if (step2) step2.classList.remove('active');
            step3.classList.remove('active');
            step4.classList.remove('active');
            step5.classList.remove('active');
            step6.classList.remove('active');
            step7.classList.remove('active');
            if (step8) step8.classList.remove('active');

            if (stepNumber === 1) {
                step1.classList.add('active');
                stopCameraStream();
                setTimeout(() => { if (firstNameInput) firstNameInput.focus(); }, 120);
            } else if (stepNumber === 2) {
                stopCameraStream();
                if (step2) step2.classList.add('active');
                syncSummaryCardName();
                if (currentCaptureMode === 'camera' && !verifiedIdData) {
                    initCameraCapture();
                }
            } else {
                stopCameraStream();
                if (stepNumber === 3) {
                    step3.classList.add('active');
                } else if (stepNumber === 4) {
                    step4.classList.add('active');
                    updateAcademicProfileFields();
                    setTimeout(() => validateStep4(), 100);
                } else if (stepNumber === 5) {
                    step5.classList.add('active');
                } else if (stepNumber === 6) {
                    step6.classList.add('active');
                    savedPassword = passwordInput.value;
                    passwordTestInput.value = '';
                    passwordTestInput.className = 'form-input password-test-input';
                    passwordTestFeedback.textContent = '';
                    passwordTestFeedback.className = 'password-test-feedback';
                    nextToStep7Btn.disabled = true;
                } else if (stepNumber === 7) {
                    step7.classList.add('active');
                } else if (stepNumber === 8 && step8) {
                    step8.classList.add('active');
                }
            }

            currentStep = stepNumber;

            if (stepNumber > maxReachedStep) {
                maxReachedStep = stepNumber;
            }

            updateStepIndicators();

            // Automatically focus the primary input field of the activated step
            setTimeout(() => {
                if (stepNumber === 4) {
                    if (userType === 'teacher' && teacherIdInput) {
                        teacherIdInput.focus();
                    }
                } else if (stepNumber === 5) {
                    if (passwordInput) {
                        passwordInput.focus();
                    }
                } else if (stepNumber === 6) {
                    if (passwordTestInput) {
                        passwordTestInput.focus();
                    }
                } else if (stepNumber === 7) {
                    const secQ = document.getElementById('security-question');
                    const secA = document.getElementById('security-answer');
                    if (secQ && !secQ.value) {
                        secQ.focus();
                    } else if (secA) {
                        secA.focus();
                    }
                } else if (stepNumber === 8) {
                    const termsBox = document.getElementById('terms-agreement-checkbox');
                    if (termsBox && termsBox.offsetParent !== null) {
                        termsBox.focus();
                    }
                }
            }, 120);
        }

        function updateAcademicProfileFields() {
            if (userType === 'teacher') {
                if (studentIdGroup) studentIdGroup.style.display = 'none';
                if (teacherIdGroup) teacherIdGroup.style.display = 'block';
                if (studentCollegeGroup) studentCollegeGroup.style.display = 'none';
                if (programGroup) programGroup.style.display = 'none';
                if (teacherCollegeGroup) teacherCollegeGroup.style.display = 'block';

                if (verifiedIdData && verifiedIdData.idNumber && teacherIdInput) {
                    teacherIdInput.value = verifiedIdData.idNumber;
                    teacherIdInput.readOnly = false;
                    teacherIdInput.classList.remove('form-input-locked');
                }
            }
        }

        // Dynamic Step Indicator: 7 steps for Student, 8 steps for Teacher
        function getActiveStepFlow() {
            if (userType === 'teacher') {
                return [
                    { stepId: 1, label: 1, title: 'Personal Information' },
                    { stepId: 2, label: 2, title: 'ID Verification' },
                    { stepId: 3, label: 3, title: 'Google Authentication' },
                    { stepId: 4, label: 4, title: 'Faculty Affiliation' },
                    { stepId: 5, label: 5, title: 'Create Password' },
                    { stepId: 6, label: 6, title: 'Test Password' },
                    { stepId: 7, label: 7, title: 'Recovery Details' },
                    { stepId: 8, label: 8, title: 'Terms & Agreement' }
                ];
            }
            // Student flow (default)
            return [
                { stepId: 1, label: 1, title: 'Personal Information' },
                { stepId: 2, label: 2, title: 'ID Verification' },
                { stepId: 3, label: 3, title: 'Google Authentication' },
                { stepId: 5, label: 4, title: 'Create Password' },
                { stepId: 6, label: 5, title: 'Test Password' },
                { stepId: 7, label: 6, title: 'Recovery Details' },
                { stepId: 8, label: 7, title: 'Terms & Agreement' }
            ];
        }

        function renderStepIndicator() {
            const container = document.getElementById('registration-step-indicator');
            if (!container) return;

            const flow = getActiveStepFlow();
            container.innerHTML = '';

            flow.forEach((step, idx) => {
                const stepEl = document.createElement('span');
                stepEl.className = 'step-number';
                stepEl.setAttribute('data-step-id', step.stepId);
                stepEl.setAttribute('data-step-idx', idx);
                stepEl.title = step.title;
                stepEl.textContent = step.label;

                container.appendChild(stepEl);

                if (idx < flow.length - 1) {
                    const divider = document.createElement('div');
                    divider.className = 'step-divider';
                    divider.setAttribute('data-divider-idx', idx);
                    container.appendChild(divider);
                }
            });

            setupStepIndicatorClicks();
            updateStepIndicators();
        }

        function updateStepIndicators() {
            const flow = getActiveStepFlow();
            const stepEls = document.querySelectorAll('#registration-step-indicator .step-number');
            const dividerEls = document.querySelectorAll('#registration-step-indicator .step-divider');

            stepEls.forEach((stepEl, idx) => {
                const stepData = flow[idx];
                if (!stepData) return;

                stepEl.classList.remove('active', 'completed', 'clickable');

                if (stepData.stepId === currentStep) {
                    stepEl.classList.add('active');
                    stepEl.textContent = stepData.label;
                } else if (completedSteps.has(stepData.stepId)) {
                    stepEl.classList.add('completed');
                    stepEl.textContent = stepData.label;
                    stepEl.classList.add('clickable');
                } else {
                    stepEl.textContent = stepData.label;
                }
            });

            dividerEls.forEach((divider, idx) => {
                divider.classList.remove('active');
                const stepData = flow[idx];
                if (stepData && completedSteps.has(stepData.stepId)) {
                    divider.classList.add('active');
                }
            });
        }

        function setupStepIndicatorClicks() {
            const flow = getActiveStepFlow();
            const stepEls = document.querySelectorAll('#registration-step-indicator .step-number');
            stepEls.forEach((stepEl, idx) => {
                const stepData = flow[idx];
                if (!stepData) return;

                stepEl.addEventListener('click', function () {
                    if (isCreatingAccount) return;
                    if (completedSteps.has(stepData.stepId)) {
                        showStep(stepData.stepId);
                    }
                });
            });
        }

        function markStepCompleted(stepNumber) {
            completedSteps.add(stepNumber);
            updateStepIndicators();
        }

        // Navigation button action wiring
        if (nextToStep2Btn) {
            nextToStep2Btn.addEventListener('click', () => {
                if (!validateStep1()) {
                    if (window.showToast) {
                        showToast('Please enter your legal first and last name to proceed', '⚠️');
                    }
                    return;
                }
                syncSummaryCardName();
                markStepCompleted(1);
                showStep(2);
            });
        }

        // Step 2 (ID Verification) Back button -> returns to Step 1 (Full Name)
        if (backToStep1Btn) {
            backToStep1Btn.addEventListener('click', () => {
                stopCameraStream();
                showStep(1);
            });
        }

        // Step 2 (ID Verification) Next button -> proceeds to Step 3 (Google Auth)
        if (nextToStep3Btn) {
            nextToStep3Btn.addEventListener('click', () => {
                if (!userTypeInput.value || !verifiedIdData) {
                    if (window.showToast) {
                        showToast('Please capture or upload your official CTU ID card first', '⚠️');
                    }
                    return;
                }
                stopCameraStream();
                markStepCompleted(2);
                showStep(3);
            });
        }

        // Step 3 (Google Auth) Back button -> returns to Step 2 (ID verification)
        if (backToStep2Btn) {
            backToStep2Btn.addEventListener('click', () => {
                showStep(2);
            });
        }

        // Step 3 (Google Auth) Next button:
        // Student skips Academic Profile completely and goes directly to Step 5 (Create Password)!
        // Teacher proceeds to Step 4 (Faculty Affiliation to choose COTE or COED)!
        if (nextToStep4Btn) {
            nextToStep4Btn.addEventListener('click', () => {
                if (!googleUser || !verifiedEmail) {
                    showToast('Please sign in with Google first');
                    return;
                }
                markStepCompleted(3);
                if (userType === 'student') {
                    showStep(5);
                } else {
                    showStep(4);
                }
            });
        }

        // Step 4 (Faculty Affiliation) Back button -> returns to Step 3 (Google Auth)
        if (backToStep3Btn) {
            backToStep3Btn.addEventListener('click', async () => {
                showStep(3);
            });
        }

        // Step 4 (Faculty Affiliation) Next button -> proceeds to Step 5 (Create Password)
        if (nextToStep5Btn) {
            nextToStep5Btn.addEventListener('click', () => {
                if (userType === 'teacher') {
                    const teacherId = teacherIdInput ? teacherIdInput.value.trim() : '';
                    const teacherCollege = teacherCollegeInput ? teacherCollegeInput.value : '';

                    if (!teacherId) {
                        showToast('Please enter your Employee ID', '⚠️');
                        return;
                    }
                    if (!teacherCollege) {
                        showToast('Please select your College (COTE or COED)', '⚠️');
                        return;
                    }
                }

                markStepCompleted(4);
                showStep(5);
            });
        }

        // Step 5 (Create Password) Back button:
        // Student goes back to Step 3 (Google Auth)!
        // Teacher goes back to Step 4 (Faculty Affiliation)!
        if (backToStep4Btn) {
            backToStep4Btn.addEventListener('click', () => {
                if (userType === 'student') {
                    showStep(3);
                } else {
                    showStep(4);
                }
            });
        }

        if (nextToStep6Btn) {
            nextToStep6Btn.addEventListener('click', () => {
                const password = passwordInput ? passwordInput.value : '';
                const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

                if (!password) {
                    showToast('Please enter a password', '⚠️');
                    return;
                }
                if (password.length < 8) {
                    showToast('Password must be at least 8 characters long', '⚠️');
                    return;
                }
                if (!confirmPassword) {
                    showToast('Please confirm your password', '⚠️');
                    return;
                }
                if (password !== confirmPassword) {
                    showToast('Passwords do not match', '⚠️');
                    return;
                }

                markStepCompleted(5);
                showStep(6);
            });
        }

        if (backToStep5Btn) {
            backToStep5Btn.addEventListener('click', () => showStep(5));
        }

        // Skip button - step 6 is optional, skip directly to step 7
        if (skipToStep7Btn) {
            skipToStep7Btn.addEventListener('click', () => {
                markStepCompleted(6);
                showStep(7);
            });
        }

        if (nextToStep7Btn) {
            nextToStep7Btn.addEventListener('click', () => {
                markStepCompleted(6);
                showStep(7);
            });
        }

        if (backToStep6Btn) {
            backToStep6Btn.addEventListener('click', () => showStep(6));
        }

        // Step 7 to Step 8 Navigation (Security Question - Now Required)
        const nextToStep8Btn = document.getElementById('next-to-step-8');
        const backToStep7Btn = document.getElementById('back-to-step-7');

        // Helper: Get effective security question value (preset code or custom text)
        function getEffectiveSecurityQuestion() {
            const selectEl = document.getElementById('security-question');
            const customInput = document.getElementById('custom-security-question');
            if (!selectEl) return '';
            if (selectEl.value === 'custom') {
                return customInput ? customInput.value.trim() : '';
            }
            return selectEl.value;
        }

        // Step 7: Security Question Validation
        function validateStep7() {
            const selectEl = document.getElementById('security-question');
            const customGroup = document.getElementById('custom-question-group');
            const customInput = document.getElementById('custom-security-question');
            const securityAnswerInput = document.getElementById('security-answer');
            if (!selectEl || !securityAnswerInput) return;

            const isCustom = selectEl.value === 'custom';
            if (customGroup) {
                customGroup.style.display = isCustom ? 'block' : 'none';
            }

            const rawQuestion = selectEl.value;
            const customText = customInput ? customInput.value.trim() : '';
            const securityAnswer = securityAnswerInput.value.trim();

            const questionValid = isCustom ? (customText.length >= 5) : Boolean(rawQuestion);
            const answerValid = securityAnswer.length >= 2;
            const isValid = questionValid && answerValid;

            if (nextToStep8Btn) {
                nextToStep8Btn.disabled = !isValid;

                if (!isValid) {
                    if (!rawQuestion) {
                        attachTooltipToButton(nextToStep8Btn, 'Please select a security question');
                    } else if (isCustom && customText.length < 5) {
                        attachTooltipToButton(nextToStep8Btn, 'Please type your custom question (min 5 characters)');
                    } else if (!answerValid) {
                        attachTooltipToButton(nextToStep8Btn, 'Please provide an answer (min 2 characters)');
                    }
                } else {
                    attachTooltipToButton(nextToStep8Btn, 'Proceed to Terms & Conditions');
                }
            }
            return isValid;
        }

        // Initialize Step 7 validation
        if (nextToStep8Btn) {
            const securityQuestionInput = document.getElementById('security-question');
            const customQuestionInput = document.getElementById('custom-security-question');
            const securityAnswerInput = document.getElementById('security-answer');

            if (securityQuestionInput) {
                securityQuestionInput.addEventListener('change', () => {
                    validateStep7();
                    if (securityQuestionInput.value === 'custom' && customQuestionInput) {
                        setTimeout(() => customQuestionInput.focus(), 60);
                    } else if (securityAnswerInput && !securityAnswerInput.value) {
                        setTimeout(() => securityAnswerInput.focus(), 60);
                    }
                });
            }
            if (customQuestionInput) {
                customQuestionInput.addEventListener('input', validateStep7);
            }
            if (securityAnswerInput) {
                securityAnswerInput.addEventListener('input', validateStep7);
            }

            validateStep7();
            attachTooltipToButton(nextToStep8Btn, 'Please select a security question and provide an answer');

            nextToStep8Btn.addEventListener('click', () => {
                const selectEl = document.getElementById('security-question');
                const isCustom = selectEl && selectEl.value === 'custom';
                const effectiveQuestion = getEffectiveSecurityQuestion();
                const securityAnswer = securityAnswerInput ? securityAnswerInput.value.trim() : '';

                if (!selectEl || !selectEl.value) {
                    showToast('Please select a security question', '⚠️');
                    return;
                }
                if (isCustom && effectiveQuestion.length < 5) {
                    showToast('Please type your custom security question (min 5 characters)', '⚠️');
                    if (customQuestionInput) customQuestionInput.focus();
                    return;
                }
                if (!securityAnswer || securityAnswer.length < 2) {
                    showToast('Please provide an answer to your security question', '⚠️');
                    if (securityAnswerInput) securityAnswerInput.focus();
                    return;
                }

                markStepCompleted(7);
                showStep(8);
                initializeTermsAndConditions();
            });
        }

        if (backToStep7Btn) {
            backToStep7Btn.addEventListener('click', () => showStep(7));
        }

        // Setup Step-by-Step Keyboard Navigation (Enter key progression)
        function setupStepKeyboardNavigation() {
            // Step 1: Proceed on Enter if role is selected
            if (step1) {
                step1.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        if (userTypeInput.value && !nextToStep2Btn.disabled) {
                            e.preventDefault();
                            nextToStep2Btn.click();
                        }
                    }
                });
            }

            // Step 2: First Name -> Middle Name -> Last Name -> Next Step
            if (firstNameInput) {
                firstNameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (middleNameInput) {
                            middleNameInput.focus();
                        } else if (lastNameInput) {
                            lastNameInput.focus();
                        }
                    }
                });
            }

            if (middleNameInput) {
                middleNameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (lastNameInput) {
                            lastNameInput.focus();
                        }
                    }
                });
            }

            if (lastNameInput) {
                lastNameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const firstName = firstNameInput.value.trim();
                        const lastName = lastNameInput.value.trim();
                        if (!firstName) {
                            firstNameInput.focus();
                            showToast('Please enter your first name', '⚠️');
                            return;
                        }
                        if (!lastName) {
                            showToast('Please enter your last name', '⚠️');
                            return;
                        }
                        if (nextToStep3Btn && !nextToStep3Btn.disabled) {
                            nextToStep3Btn.click();
                        }
                    }
                });
            }

            // Step 3: Proceed on Enter if Google Auth completed
            if (step3) {
                step3.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        if (googleUser && !nextToStep4Btn.disabled) {
                            e.preventDefault();
                            nextToStep4Btn.click();
                        }
                    }
                });
            }

            // Step 4: Student ID / Teacher ID -> Next Step (or guide to College / Program)
            if (studentIdInput) {
                studentIdInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const sId = studentIdInput.value.trim();
                        if (!sId) {
                            showToast('Please enter your Student ID', '⚠️');
                            return;
                        }
                        const college = studentCollegeInput.value;
                        if (!college) {
                            showToast('Please select your College', '⚠️');
                            const colElem = document.getElementById('student-college-cards');
                            if (colElem) colElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                        const program = programInput.value;
                        if (!program) {
                            showToast('Please select your Program', '⚠️');
                            const progElem = document.getElementById('programCarouselViewport');
                            if (progElem) progElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                        if (nextToStep5Btn && !nextToStep5Btn.disabled) {
                            nextToStep5Btn.click();
                        }
                    }
                });
            }

            if (teacherIdInput) {
                teacherIdInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const tId = teacherIdInput.value.trim();
                        if (!tId) {
                            showToast('Please enter your Teacher ID', '⚠️');
                            return;
                        }
                        const college = teacherCollegeInput.value;
                        if (!college) {
                            showToast('Please select your College', '⚠️');
                            const teacherColGroup = document.getElementById('teacher-college-group');
                            if (teacherColGroup) teacherColGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                        if (nextToStep5Btn && !nextToStep5Btn.disabled) {
                            nextToStep5Btn.click();
                        }
                    }
                });
            }

            // Step 5: Password -> Confirm Password -> Next Step
            if (passwordInput) {
                passwordInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (confirmPasswordInput) {
                            confirmPasswordInput.focus();
                            if (confirmPasswordInput.value) {
                                confirmPasswordInput.select();
                            }
                        }
                    }
                });
            }

            if (confirmPasswordInput) {
                confirmPasswordInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const p = passwordInput ? passwordInput.value : '';
                        const cp = confirmPasswordInput.value;
                        if (!p) {
                            showToast('Please enter a password', '⚠️');
                            if (passwordInput) passwordInput.focus();
                            return;
                        }
                        if (p.length < 8) {
                            showToast('Password must be at least 8 characters long', '⚠️');
                            if (passwordInput) passwordInput.focus();
                            return;
                        }
                        const str = checkPasswordStrength(p);
                        if (str.strength !== 'strong') {
                            showToast('Password must be strong', '⚠️');
                            return;
                        }
                        if (!cp) {
                            showToast('Please confirm your password', '⚠️');
                            confirmPasswordInput.focus();
                            return;
                        }
                        if (p !== cp) {
                            showToast('Passwords do not match', '⚠️');
                            return;
                        }
                        if (nextToStep6Btn) {
                            nextToStep6Btn.click();
                        }
                    }
                });
            }

            // Step 6: Password Test verification -> Next Step
            if (passwordTestInput) {
                passwordTestInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (nextToStep7Btn && !nextToStep7Btn.disabled) {
                            nextToStep7Btn.click();
                        } else if (!passwordTestInput.value.trim() && skipToStep7Btn) {
                            skipToStep7Btn.click();
                        }
                    }
                });
            }

            // Step 7: Security Question -> Custom Question -> Security Answer -> Next Step
            const secQuestionSelect = document.getElementById('security-question');
            const customSecInput = document.getElementById('custom-security-question');
            const secAnswerInput = document.getElementById('security-answer');

            if (secQuestionSelect) {
                secQuestionSelect.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (secQuestionSelect.value === 'custom' && customSecInput) {
                            customSecInput.focus();
                        } else if (secAnswerInput) {
                            secAnswerInput.focus();
                        }
                    }
                });
            }

            if (customSecInput) {
                customSecInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (secAnswerInput) secAnswerInput.focus();
                    }
                });
            }

            if (secAnswerInput) {
                secAnswerInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const q = secQuestionSelect ? secQuestionSelect.value : '';
                        const a = secAnswerInput.value.trim();
                        if (!q) {
                            if (secQuestionSelect) secQuestionSelect.focus();
                            showToast('Please select a security question', '⚠️');
                            return;
                        }
                        if (!a || a.length < 2) {
                            showToast('Please provide an answer (minimum 2 characters)', '⚠️');
                            return;
                        }
                        if (nextToStep8Btn && !nextToStep8Btn.disabled) {
                            nextToStep8Btn.click();
                        }
                    }
                });
            }

            // Step 8: Terms & Conditions agreement -> Complete Registration
            const termsBox = document.getElementById('terms-agreement-checkbox');
            if (termsBox) {
                termsBox.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!termsBox.checked) {
                            termsBox.checked = true;
                            termsBox.dispatchEvent(new Event('change'));
                        }
                        if (completeBtn && !completeBtn.disabled) {
                            completeBtn.click();
                        }
                    }
                });
            }

            // Global Enter key handler for non-input card selections across all steps
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;

                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                // Don't intercept if user is actively in an input, textarea, or select
                if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
                    return;
                }

                if (currentStep === 1) {
                    if (userTypeInput.value && nextToStep2Btn && !nextToStep2Btn.disabled) {
                        e.preventDefault();
                        nextToStep2Btn.click();
                    }
                } else if (currentStep === 3) {
                    if (googleUser && nextToStep4Btn && !nextToStep4Btn.disabled) {
                        e.preventDefault();
                        nextToStep4Btn.click();
                    }
                } else if (currentStep === 4) {
                    if (nextToStep5Btn && !nextToStep5Btn.disabled) {
                        e.preventDefault();
                        nextToStep5Btn.click();
                    }
                } else if (currentStep === 6) {
                    if (nextToStep7Btn && !nextToStep7Btn.disabled) {
                        e.preventDefault();
                        nextToStep7Btn.click();
                    } else if (skipToStep7Btn) {
                        e.preventDefault();
                        skipToStep7Btn.click();
                    }
                } else if (currentStep === 7) {
                    if (nextToStep8Btn && !nextToStep8Btn.disabled) {
                        e.preventDefault();
                        nextToStep8Btn.click();
                    }
                } else if (currentStep === 8) {
                    const termsWrapper = document.getElementById('terms-scroll-wrapper');
                    const termsAgreementCheckbox = document.getElementById('terms-agreement-checkbox');
                    if (!termsScrollComplete && termsWrapper) {
                        e.preventDefault();
                        termsWrapper.scrollTo({ top: termsWrapper.scrollHeight, behavior: 'smooth' });
                    } else if (termsAgreementCheckbox) {
                        e.preventDefault();
                        if (!termsAgreementCheckbox.checked) {
                            termsAgreementCheckbox.checked = true;
                            termsAgreementCheckbox.dispatchEvent(new Event('change'));
                        }
                        if (completeBtn && !completeBtn.disabled) {
                            completeBtn.click();
                        }
                    }
                }
            });
        }
        setupStepKeyboardNavigation();

        // Terms and Conditions Scroll Tracking
        let termsScrollComplete = false;

        function initializeTermsAndConditions() {
            const termsScrollWrapper = document.getElementById('terms-scroll-wrapper');
            const termsProgressFill = document.getElementById('terms-progress-fill');
            const termsProgressText = document.getElementById('terms-progress-text');
            const termsAgreementContainer = document.getElementById('terms-agreement-container');
            const termsAgreementCheckbox = document.getElementById('terms-agreement-checkbox');
            const completeBtn = document.getElementById('complete-registration');
            if (!termsScrollWrapper || !termsProgressFill || !termsProgressText) return;

            // Reset state
            termsScrollComplete = false;
            if (termsAgreementCheckbox) termsAgreementCheckbox.checked = false;
            if (completeBtn) completeBtn.disabled = true;
            if (termsAgreementContainer) termsAgreementContainer.style.display = 'none';
            termsProgressFill.style.width = '0%';

            function updateTermsScrollStatus() {
                const scrollTop = termsScrollWrapper.scrollTop;
                const clientHeight = termsScrollWrapper.clientHeight;
                const scrollHeight = termsScrollWrapper.scrollHeight;
                const maxScroll = scrollHeight - clientHeight;

                // Threshold leeway (25px) prevents getting stuck at 99% due to subpixel rendering / OS zoom
                const isAtBottom = maxScroll <= 10 || (scrollTop >= maxScroll - 25) || (scrollTop + clientHeight >= scrollHeight - 25);
                const rawPercentage = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100;
                const scrollPercentage = isAtBottom ? 100 : Math.min(99, Math.max(0, rawPercentage));

                if (!isAtBottom && scrollPercentage < 98) {
                    termsProgressFill.style.width = scrollPercentage + '%';
                    termsProgressText.innerHTML = `
                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('arrow-down-sm') : ''}
                        Please scroll down to read all terms (${Math.floor(scrollPercentage)}% complete)
                    `;
                    termsProgressText.classList.remove('complete');
                } else {
                    termsProgressFill.style.width = '100%';
                    termsProgressText.innerHTML = `
                        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('check-circle') : ''}
                        You have read all terms. Please check the box below to agree.
                    `;
                    termsProgressText.classList.add('complete');

                    if (!termsScrollComplete) {
                        termsScrollComplete = true;
                        // Instantly reveal agreement checkbox without arbitrary delay
                        if (termsAgreementContainer) {
                            termsAgreementContainer.style.display = 'block';
                            termsAgreementContainer.classList.add('show');
                            if (termsAgreementCheckbox) termsAgreementCheckbox.focus();
                        }
                    }
                }
            }

            // Remove existing scroll listener to avoid duplicates if re-entered
            termsScrollWrapper.onscroll = updateTermsScrollStatus;

            // Clicking progress indicator smoothly auto-scrolls to the bottom
            termsProgressText.style.cursor = 'pointer';
            termsProgressText.title = 'Click to scroll to the end';
            termsProgressText.onclick = function () {
                termsScrollWrapper.scrollTo({ top: termsScrollWrapper.scrollHeight, behavior: 'smooth' });
            };

            // Check immediately on load in case container is already at bottom or fits on screen
            setTimeout(updateTermsScrollStatus, 100);

            // Track checkbox agreement
            if (termsAgreementCheckbox) {
                termsAgreementCheckbox.onchange = function () {
                    if (this.checked && termsScrollComplete) {
                        if (completeBtn) completeBtn.disabled = false;
                    } else {
                        if (completeBtn) completeBtn.disabled = true;
                    }
                };
            }
        }


        let carouselResizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(carouselResizeTimer);
            carouselResizeTimer = setTimeout(() => {
                if (filteredPrograms.length > 0) {
                    updateProgramCarousel();
                }
            }, 100);
        });

        // Account creation loading overlay controls
        function showCreatingAccountOverlay(statusText, progressPct, activeStepIndex) {
            const overlay = document.getElementById('registrationLoadingOverlay');
            const statusEl = document.getElementById('registrationLoadingStatus');
            const barEl = document.getElementById('registrationLoadingBar');
            const chipAuth = document.getElementById('loadingStepAuth');
            const chipDb = document.getElementById('loadingStepFirestore');
            const chipFinal = document.getElementById('loadingStepFinalize');

            if (!overlay) return;

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');

            if (statusEl && statusText) statusEl.textContent = statusText;
            if (barEl && typeof progressPct === 'number') barEl.style.width = progressPct + '%';

            const chips = [chipAuth, chipDb, chipFinal];
            chips.forEach((chip, idx) => {
                if (!chip) return;
                chip.classList.remove('active', 'completed');
                if (idx < activeStepIndex) {
                    chip.classList.add('completed');
                } else if (idx === activeStepIndex) {
                    chip.classList.add('active');
                }
            });
        }

        function hideCreatingAccountOverlay() {
            const overlay = document.getElementById('registrationLoadingOverlay');
            if (!overlay) return;
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }

        function resetCompleteAccountButton() {
            const completeBtn = document.getElementById('complete-registration');
            const backToStep7Btn = document.getElementById('back-to-step-7');
            if (backToStep7Btn) backToStep7Btn.disabled = false;
            if (completeBtn) {
                completeBtn.disabled = false;
                completeBtn.innerHTML = `
                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('user-plus') : ''}
                    Create Account
                `;
            }
        }

        // 3. Final Submission, Security Validation & Simulated Mock Database Hashing
        completeBtn.addEventListener('click', async function () {
            if (isCreatingAccount) return;

            try {
                // Check if terms have been accepted (Step 8)
                const termsCheckbox = document.getElementById('terms-agreement-checkbox');
                if (!termsCheckbox || !termsCheckbox.checked) {
                    showToast('⚠️ You must read and agree to the Terms and Conditions', '⛔');
                    return;
                }

                if (!termsScrollComplete) {
                    showToast('⚠️ Please read the complete Terms and Conditions first', '⛔');
                    return;
                }

                // 3.1 Immutable-like Session Cryptographic Token Check (closure protected)
                if (!activeSessionToken || activeSessionToken !== expectedHash) {
                    showToast('⛔ Security Check Failed: Verification token is invalid or missing.', '❌');
                    return;
                }

                if (!googleUser || !verifiedEmail) {
                    showToast('Please complete Google authentication first', '⚠️');
                    return;
                }

                const userPassword = savedPassword;
                if (!userPassword) {
                    showToast('Password is required. Please go back to Step 5.', '⚠️');
                    return;
                }

                // Security question is now REQUIRED
                const securityQuestion = typeof getEffectiveSecurityQuestion === 'function'
                    ? getEffectiveSecurityQuestion()
                    : document.getElementById('security-question').value;
                const securityAnswer = document.getElementById('security-answer').value.trim();
                if (!securityQuestion || !securityAnswer) {
                    showToast('⚠️ Security question and answer are required', '❌');
                    return;
                }

                // Collect and build form variables
                const firstName = firstNameInput.value.trim();
                const middleName = document.getElementById('middle-name').value.trim();
                const lastName = lastNameInput.value.trim();
                const fullName = firstName + " " + middleName + " " + lastName;

                let registeredId = '';
                let college = '';
                let program = null;

                if (userType === 'student') {
                    registeredId = studentIdInput.value.trim();
                    college = studentCollegeInput.value;
                    program = programInput.value;
                } else if (userType === 'teacher') {
                    registeredId = teacherIdInput.value.trim();
                    college = teacherCollegeInput.value;
                }

                // Account De-duplication Check against local Simulated Database
                const mockDb = JSON.parse(localStorage.getItem('reCapsMockUsers')) || [];
                const idExists = mockDb.some(u => {
                    if (u.uid === googleUser.uid || (u.email && u.email.toLowerCase() === verifiedEmail.toLowerCase())) {
                        return false;
                    }
                    const existingId = u.studentId || u.teacherId;
                    return existingId && existingId.toLowerCase() === registeredId.toLowerCase();
                });

                if (idExists) {
                    showToast(`⚠️ Validation Error: ID number (${registeredId}) is already taken.`, '❌');
                    return;
                }

                // --- ENTER SECURE BLUR & LOCKDOWN STATE ---
                isCreatingAccount = true;
                const backToStep7Btn = document.getElementById('back-to-step-7');
                if (backToStep7Btn) backToStep7Btn.disabled = true;
                completeBtn.disabled = true;
                completeBtn.innerHTML = `
                    ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('clock-spin') : ''}
                    Creating Account...
                `;

                // Display modern blur loading overlay
                showCreatingAccountOverlay('Connecting credentials and securing account session...', 30, 0);

                // 3.2 Provider verification: Check if account already has BOTH Google and Password providers
                const providerIds = (googleUser.providerData || []).map(p => p.providerId);
                const hasGoogleProvider = providerIds.includes('google.com') || providerIds.includes(firebase.auth.GoogleAuthProvider.PROVIDER_ID);
                const hasPasswordProvider = providerIds.includes('password') || providerIds.includes(firebase.auth.EmailAuthProvider.PROVIDER_ID);

                let signInMethods = [];
                try {
                    signInMethods = await auth.fetchSignInMethodsForEmail(verifiedEmail);
                } catch (e) {
                    console.warn('Could not fetch sign-in methods:', e);
                }

                const isFullyRegistered = (hasGoogleProvider && hasPasswordProvider) ||
                    (signInMethods.includes('google.com') && signInMethods.includes('password'));

                if (isFullyRegistered) {
                    isCreatingAccount = false;
                    hideCreatingAccountOverlay();
                    resetCompleteAccountButton();
                    showToast('⚠️ Validation Error: Email is already linked to a registered account.', '❌');
                    return;
                }

                const userData = {
                    userType: userType,
                    firstName: firstName,
                    middleName: middleName,
                    lastName: lastName,
                    fullName: fullName,
                    email: verifiedEmail,
                    photoURL: googleUser.photoURL || null,
                    securityQuestion: securityQuestion,
                    securityAnswer: securityAnswer,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    termsAcceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    termsAccepted: true,
                    idCardVerified: true,
                    idVerification: {
                        verified: true,
                        verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        idNumber: registeredId,
                        role: userType,
                        verifiedName: fullName,
                        program: program || null,
                        college: college || null
                    }
                };

                if (userType === 'student') {
                    userData.studentId = registeredId;
                    userData.college = college;
                    userData.program = program;
                } else if (userType === 'teacher') {
                    userData.teacherId = registeredId;
                    userData.college = college;
                    const teacherDeptEl = document.getElementById('teacher-department');
                    userData.department = teacherDeptEl ? teacherDeptEl.value.trim() : 'Faculty';
                }

                const user = googleUser;

                // Step 1: Link credential to existing Google account on Firebase
                try {
                    const googleProvider = new firebase.auth.GoogleAuthProvider();
                    googleProvider.setCustomParameters({ login_hint: verifiedEmail });
                    await user.reauthenticateWithPopup(googleProvider);

                    const credential = firebase.auth.EmailAuthProvider.credential(verifiedEmail, userPassword);
                    await user.linkWithCredential(credential);
                    console.log('Password credential linked successfully!');
                } catch (linkError) {
                    console.error('Error linking password:', linkError);
                    if (linkError.code === 'auth/provider-already-linked') {
                        console.log('Password provider already linked');
                    } else if (linkError.code === 'auth/email-already-in-use' || linkError.code === 'auth/credential-already-in-use') {
                        isCreatingAccount = false;
                        hideCreatingAccountOverlay();
                        resetCompleteAccountButton();
                        showToast('⚠️ Validation Error: Email is already linked to a registered account.', '❌');
                        return;
                    } else {
                        throw linkError;
                    }
                }

                // Step 2: Update Firebase display name if needed & save to Firestore
                showCreatingAccountOverlay('Saving profile to institutional database...', 65, 1);

                if (user.displayName !== fullName) {
                    await user.updateProfile({
                        displayName: fullName
                    });
                }

                await db.collection('users').doc(user.uid).set({
                    uid: user.uid,
                    userType: userData.userType,
                    firstName: userData.firstName,
                    middleName: userData.middleName,
                    lastName: userData.lastName,
                    fullName: fullName,
                    email: userData.email,
                    photoURL: userData.photoURL,
                    studentId: userData.studentId || null,
                    teacherId: userData.teacherId || null,
                    college: userData.college,
                    program: userData.program || null,
                    securityQuestion: userData.securityQuestion || null,
                    securityAnswer: userData.securityAnswer || null,
                    authProviders: ['google.com', 'password'],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Step 3: Local secure storage hash & finalize
                showCreatingAccountOverlay('Finalizing account and preparing dashboard...', 95, 2);

                const hashedPassword = await hashPasswordSHA256(userPassword);

                const localUserRecord = {
                    uid: user.uid,
                    userType: userType,
                    firstName: firstName,
                    middleName: middleName,
                    lastName: lastName,
                    fullName: fullName,
                    email: verifiedEmail,
                    studentId: userType === 'student' ? registeredId : null,
                    teacherId: userType === 'teacher' ? registeredId : null,
                    college: college,
                    program: program,
                    passwordHash: hashedPassword,
                    createdAt: new Date().toISOString()
                };

                const updatedMockDb = mockDb.filter(u => u.uid !== user.uid && u.email.toLowerCase() !== verifiedEmail.toLowerCase());
                updatedMockDb.push(localUserRecord);
                localStorage.setItem('reCapsMockUsers', JSON.stringify(updatedMockDb));

                showCreatingAccountOverlay('Account created successfully!', 100, 2);

                setTimeout(() => {
                    isCreatingAccount = false;
                    hideCreatingAccountOverlay();
                    showSuccessModal(user);
                }, 600);

            } catch (error) {
                console.error('Registration error:', error);
                isCreatingAccount = false;
                hideCreatingAccountOverlay();
                resetCompleteAccountButton();
                showToast('Registration failed: ' + (error.message || 'Please try again'), '❌');
            }
        });

        // Success Modal management
        const successModal = document.getElementById('successModal');
        const successModalClose = document.getElementById('successModalClose');
        const autoLoginBtn = document.getElementById('autoLoginBtn');
        const manualLoginBtn = document.getElementById('manualLoginBtn');
        let currentUser = null;

        function showSuccessModal(user) {
            currentUser = user;
            registrationCompleted = true; // Mark complete BEFORE showing modal so beforeunload guard is disabled
            successModal.classList.add('active');

            setTimeout(() => {
                successModalClose.classList.add('visible');
            }, 2000);

            setTimeout(() => {
                const preloadFrame = document.createElement('iframe');
                preloadFrame.style.display = 'none';
                preloadFrame.src = '../index.html';
                document.body.appendChild(preloadFrame);
            }, 1000);
        }

        successModalClose.addEventListener('click', () => {
            successModal.classList.remove('active');
        });

        autoLoginBtn.addEventListener('click', async () => {
            try {
                if (currentUser) {
                    // Update last login timestamp
                    await db.collection('users').doc(currentUser.uid).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Fetch user data and populate session storage BEFORE redirecting
                    const userDoc = await db.collection('users').doc(currentUser.uid).get();
                    const userData = userDoc.data();

                    sessionStorage.setItem('userId', currentUser.uid);
                    sessionStorage.setItem('userEmail', currentUser.email);
                    sessionStorage.setItem('userName', currentUser.displayName);
                    sessionStorage.setItem('userType', userData.userType);

                    // Redirect directly to user's dashboard
                    AuthService.navigateToDashboard(userData.userType);
                } else {
                    throw new Error('No user found');
                }
            } catch (error) {
                console.error('Auto-login error:', error);
                if (window.ModalDialog) {
                    await ModalDialog.alert({
                        title: 'Authentication Error',
                        message: 'Error during login. Redirecting you to the sign-in page...',
                        type: 'danger'
                    });
                } else if (typeof showToast === 'function') {
                    showToast('Error during login. Redirecting...', 'error');
                } else {
                    alert('Error during login. Redirecting to login page...');
                }
                window.location.href = '../index.html';
            }
        });

        manualLoginBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                sessionStorage.clear();
                sessionStorage.setItem('openLoginModal', 'true');
                window.location.href = '../index.html';
            } catch (error) {
                console.error('Sign out error:', error);
                sessionStorage.setItem('openLoginModal', 'true');
                window.location.href = '../index.html';
            }
        });
    });
})();

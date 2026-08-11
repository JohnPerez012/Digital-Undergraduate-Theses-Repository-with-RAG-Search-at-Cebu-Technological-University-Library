(function() {
    'use strict';

    // Internal, immutable-like verification salt and state tokens (Closure Protected)
    const SECRET_SALT = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    let activeSessionToken = null;
    let expectedHash = null;

    // Helper: SHA-256 Hashing using native browser Web Crypto API
    async function hashPasswordSHA256(password) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    document.addEventListener('DOMContentLoaded', function() {
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
        
        // Handle main back button click
        if (mainBackButton) {
            mainBackButton.addEventListener('click', function(e) {
                // Check if user has any filled data
                const hasData = hasRegistrationData();
                
                if (hasData) {
                    e.preventDefault();
                    showLeaveConfirmationDialog();
                } else {
                    // No data filled, check if authenticated with Google
                    if (googleUser !== null) {
                        e.preventDefault();
                        showAuthWarningDialog();
                    }
                }
            });
        }
        
        // Handle page unload - sign out if registration incomplete
        window.addEventListener('beforeunload', function(e) {
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
            // Registration is only complete if the success modal is shown
            const successModal = document.getElementById('successModal');
            return successModal && successModal.style.display === 'flex';
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
                        console.log('✓ Signed out before leaving registration');
                    } catch (error) {
                        console.error('Error signing out:', error);
                    }
                }
                
                overlay.classList.remove('active');
                setTimeout(() => {
                    window.location.href = 'index.html';
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
                    console.log('✓ Signed out before leaving registration');
                } catch (error) {
                    console.error('Error signing out:', error);
                }
                
                overlay.classList.remove('active');
                setTimeout(() => {
                    window.location.href = 'index.html';
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
                onVerified: function(result) {
                    console.log('Slider verification successful:', result.metrics);
                    onVerifiedSuccess(container, gatekeeperView, formWrap);
                },
                onFailed: function(result) {
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

        async function onVerifiedSuccess(container, gatekeeperView, formWrap) {
            container.classList.add('verified');
            const bgText = container.querySelector('.slider-verify-bg-text');
            if (bgText) {
                bgText.textContent = 'Verification Successful ✓';
            }
            
            // Cryptographic validation token generation
            const timestamp = Date.now();
            const randomArr = new Uint8Array(16);
            crypto.getRandomValues(randomArr);
            const randomVal = Array.from(randomArr).map(b => b.toString(16).padStart(2, '0')).join('');
            
            const encoder = new TextEncoder();
            const data = encoder.encode(SECRET_SALT + ":" + timestamp + ":" + randomVal);
            const digest = await crypto.subtle.digest('SHA-256', data);
            expectedHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
            
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
                        
                        // Tamper protection: Restrict Next 2 step trigger
                        if (target.id === 'next-to-step-2') {
                            const hasRole = userTypeInput.value !== '';
                            const isVerified = activeSessionToken !== null;
                            if ((!hasRole || !isVerified) && !target.disabled) {
                                target.disabled = true;
                                showToast('⚠️ Nice try! Slider verification required.', '⛔');
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

                        // Tamper protection: Restrict step 7 trigger
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

        // Role selection cards
        roleCards.forEach(card => {
            card.addEventListener('click', function() {
                roleCards.forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                const selectedRole = this.getAttribute('data-role');
                userTypeInput.value = selectedRole;
                userType = selectedRole;
                nextToStep2Btn.disabled = false;
            });
        });
        
        attachTooltipToButton(nextToStep2Btn, 'Please select your role first');
        
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
            googleSignInBtn.addEventListener('click', async function() {
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
                    
                    const userDoc = await db.collection('users').doc(googleUser.uid).get();
                    if (userDoc.exists) {
                        const existingEmail = googleUser.email;
                        await auth.signOut();
                        googleUser = null;
                        verifiedEmail = null;
                        
                        googleAuthStatus.style.display = 'none';
                        googleSignInBtn.style.display = 'none';
                        errorMessage.textContent = `The Google account "${existingEmail}" is already registered. Please login instead or use a different Google account.`;
                        accountExistsError.style.display = 'flex';
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
                        <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                        </svg>
                        <span>Sign in with Google</span>
                    `;
                    if (error.code === 'auth/popup-closed-by-user') {
                        alert('Sign-in cancelled. Please try again.');
                    } else if (error.code === 'auth/popup-blocked') {
                        alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
                    } else {
                        alert('Sign-in failed: ' + error.message);
                    }
                }
            });
        }
        
        // Change Google account handler
        if (changeGoogleAccountBtn) {
            changeGoogleAccountBtn.addEventListener('click', async function() {
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
                        <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                        </svg>
                        <span>Sign in with Google</span>
                    `;
                    nextToStep4Btn.disabled = true;
                } catch (error) {
                    console.error('Sign-out error:', error);
                    alert('Error signing out: ' + error.message);
                }
            });
        }
        
        // Try Different Account popup trigger
        if (tryDifferentAccountBtn) {
            tryDifferentAccountBtn.addEventListener('click', async function() {
                accountExistsError.style.display = 'none';
                googleAuthStatus.style.display = 'flex';
                googleSignInBtn.style.display = 'flex';
                googleSignInBtn.disabled = false;
                googleSignInBtn.innerHTML = `
                    <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                    </svg>
                    <span>Sign in with Google</span>
                `;
                setTimeout(() => googleSignInBtn.click(), 100);
            });
        }
        
        // Step 2 validations (Name fields)
        const firstNameInput = document.getElementById('first-name');
        const lastNameInput = document.getElementById('last-name');
        
        function preventNumbers(e) {
            const value = e.target.value;
            e.target.value = value.replace(/[0-9]/g, '');
        }
        
        function validateStep2() {
            const firstName = firstNameInput.value.trim();
            const lastName = lastNameInput.value.trim();
            const hasNumbers = /[0-9]/.test(firstName) || /[0-9]/.test(lastName);
            const isValid = firstName.length > 0 && lastName.length > 0 && !hasNumbers;
            nextToStep3Btn.disabled = !isValid;
            if (!isValid) {
                if (hasNumbers) {
                    attachTooltipToButton(nextToStep3Btn, 'Names cannot contain numbers');
                } else {
                    attachTooltipToButton(nextToStep3Btn, 'Please enter your first and last name');
                }
            }
        }
        
        if (firstNameInput && lastNameInput) {
            firstNameInput.addEventListener('input', (e) => {
                preventNumbers(e);
                validateStep2();
            });
            lastNameInput.addEventListener('input', (e) => {
                preventNumbers(e);
                validateStep2();
            });
            validateStep2();
        }
        
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
                button.addEventListener('click', function() {
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
            
            passwordTestInput.addEventListener('input', function() {
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
            card.addEventListener('click', function() {
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
            card.addEventListener('click', function() {
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
            changeCollegeBtn.addEventListener('click', function() {
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
            currentProgramIndex = Math.max(0, Math.min(index, filteredPrograms.length - 1));
            const selectedProgram = filteredPrograms[currentProgramIndex];
            programInput.value = selectedProgram.code;
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
            const step8 = document.getElementById('step-8');
            
            step1.classList.remove('active');
            step2.classList.remove('active');
            step3.classList.remove('active');
            step4.classList.remove('active');
            step5.classList.remove('active');
            step6.classList.remove('active');
            step7.classList.remove('active');
            if (step8) step8.classList.remove('active');

            if (stepNumber === 1) {
                step1.classList.add('active');
            } else if (stepNumber === 2) {
                step2.classList.add('active');
            } else if (stepNumber === 3) {
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

            currentStep = stepNumber;
            
            if (stepNumber > maxReachedStep) {
                maxReachedStep = stepNumber;
            }
            
            updateStepIndicators();
        }

        function updateAcademicProfileFields() {
            if (userType === 'student') {
                studentIdGroup.style.display = 'block';
                teacherIdGroup.style.display = 'none';
                studentCollegeGroup.style.display = 'block';
                programGroup.style.display = 'block';
                teacherCollegeGroup.style.display = 'none';
            } else if (userType === 'teacher') {
                studentIdGroup.style.display = 'none';
                teacherIdGroup.style.display = 'block';
                studentCollegeGroup.style.display = 'none';
                programGroup.style.display = 'none';
                teacherCollegeGroup.style.display = 'block';
            }
        }

        function updateStepIndicators() {
            stepNumbers.forEach(stepEl => {
                const stepNum = parseInt(stepEl.getAttribute('data-step'));
                stepEl.classList.remove('active', 'completed', 'clickable');
                
                if (stepNum === currentStep) {
                    stepEl.classList.add('active');
                } else if (completedSteps.has(stepNum)) {
                    stepEl.classList.add('completed');
                    stepEl.textContent = '✓';
                    stepEl.classList.add('clickable');
                } else {
                    stepEl.textContent = stepNum;
                }
            });

            stepDividers.forEach(divider => {
                const dividerNum = parseInt(divider.getAttribute('data-divider'));
                divider.classList.remove('active');
                if (completedSteps.has(dividerNum)) {
                    divider.classList.add('active');
                }
            });
        }

        function markStepCompleted(stepNumber) {
            completedSteps.add(stepNumber);
            updateStepIndicators();
        }

        // Navigation button action wiring
        nextToStep2Btn.addEventListener('click', () => {
            if (!userTypeInput.value) {
                showToast('Please select your role (Student or Teacher)');
                return;
            }
            markStepCompleted(1);
            showStep(2);
        });
        
        backToStep1Btn.addEventListener('click', () => showStep(1));
        
        nextToStep3Btn.addEventListener('click', () => {
            const firstName = firstNameInput.value.trim();
            const lastName = lastNameInput.value.trim();
            
            if (!firstName) {
                showToast('Please enter your first name', '⚠️');
                return;
            }
            if (!lastName) {
                showToast('Please enter your last name', '⚠️');
                return;
            }
            
            markStepCompleted(2);
            showStep(3);
        });
        
        backToStep2Btn.addEventListener('click', () => showStep(2));
        
        nextToStep4Btn.addEventListener('click', () => {
            if (!googleUser || !verifiedEmail) {
                showToast('Please sign in with Google first');
                return;
            }
            markStepCompleted(3);
            showStep(4);
        });
        
        backToStep3Btn.addEventListener('click', async () => {
            // If user has authenticated with Google but is going back, sign them out
            // to prevent the bug where they can navigate away and be logged in with null registration
            if (googleUser !== null) {
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
                        <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                        </svg>
                        <span>Sign in with Google</span>
                    `;
                    nextToStep4Btn.disabled = true;
                    console.log('✓ Signed out from Google when going back from step 3');
                } catch (error) {
                    console.error('Error signing out:', error);
                }
            }
            showStep(3);
        });
        
        nextToStep5Btn.addEventListener('click', () => {
            if (userType === 'student') {
                const studentId = studentIdInput.value;
                const studentCollege = studentCollegeInput.value;
                const program = programInput.value;
                
                if (!studentId) {
                    showToast('Please enter your Student ID', '⚠️');
                    return;
                }
                if (!studentCollege) {
                    showToast('Please select your College', '⚠️');
                    return;
                }
                if (!program) {
                    showToast('Please select your Program', '⚠️');
                    return;
                }
            } else if (userType === 'teacher') {
                const teacherId = teacherIdInput.value;
                const teacherCollege = teacherCollegeInput.value;
                
                if (!teacherId) {
                    showToast('Please enter your Teacher ID');
                    return;
                }
                if (!teacherCollege) {
                    showToast('Please select your College');
                    return;
                }
            }
            
            markStepCompleted(4);
            showStep(5);
        });
        
        backToStep4Btn.addEventListener('click', () => showStep(4));
        
        nextToStep6Btn.addEventListener('click', () => {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            
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
        
        backToStep5Btn.addEventListener('click', () => showStep(5));
        
        skipToStep7Btn.addEventListener('click', () => {
            markStepCompleted(6);
            showStep(7);
        });
        
        nextToStep7Btn.addEventListener('click', () => {
            markStepCompleted(6);
            showStep(7);
        });
        
        backToStep6Btn.addEventListener('click', () => showStep(6));

        // Step 7 to Step 8 Navigation
        const nextToStep8Btn = document.getElementById('next-to-step-8');
        const backToStep7Btn = document.getElementById('back-to-step-7');
        
        if (nextToStep8Btn) {
            nextToStep8Btn.addEventListener('click', () => {
                markStepCompleted(7);
                showStep(8);
                initializeTermsAndConditions();
            });
        }
        
        if (backToStep7Btn) {
            backToStep7Btn.addEventListener('click', () => showStep(7));
        }
        
        // Terms and Conditions Scroll Tracking
        let termsScrollComplete = false;
        
        function initializeTermsAndConditions() {
            const termsScrollWrapper = document.getElementById('terms-scroll-wrapper');
            const termsProgressFill = document.getElementById('terms-progress-fill');
            const termsProgressText = document.getElementById('terms-progress-text');
            const termsAgreementContainer = document.getElementById('terms-agreement-container');
            const termsAgreementCheckbox = document.getElementById('terms-agreement-checkbox');
            const completeBtn = document.getElementById('complete-registration');
            
            // Reset state
            termsScrollComplete = false;
            termsAgreementCheckbox.checked = false;
            completeBtn.disabled = true;
            termsAgreementContainer.style.display = 'none';
            termsProgressFill.style.width = '0%';
            
            // Track scroll progress
            termsScrollWrapper.addEventListener('scroll', function() {
                const scrollTop = termsScrollWrapper.scrollTop;
                const scrollHeight = termsScrollWrapper.scrollHeight - termsScrollWrapper.clientHeight;
                const scrollPercentage = (scrollTop / scrollHeight) * 100;
                
                termsProgressFill.style.width = scrollPercentage + '%';
                
                if (scrollPercentage < 100) {
                    termsProgressText.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="vertical-align: middle;">
                            <path d="M12 5v14M5 12l7 7 7-7"/>
                        </svg>
                        Please scroll down to read all terms (${Math.floor(scrollPercentage)}% complete)
                    `;
                    termsProgressText.classList.remove('complete');
                } else {
                    termsProgressText.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="vertical-align: middle;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        You have read all terms. Please check the box below to agree.
                    `;
                    termsProgressText.classList.add('complete');
                    
                    if (!termsScrollComplete) {
                        termsScrollComplete = true;
                        // Show agreement checkbox after fully reading
                        setTimeout(() => {
                            termsAgreementContainer.style.display = 'block';
                            setTimeout(() => {
                                termsAgreementContainer.classList.add('show');
                            }, 10);
                        }, 300);
                    }
                }
            });
            
            // Track checkbox agreement
            termsAgreementCheckbox.addEventListener('change', function() {
                if (this.checked && termsScrollComplete) {
                    completeBtn.disabled = false;
                } else {
                    completeBtn.disabled = true;
                }
            });
        }

        function setupStepIndicatorClicks() {
            stepNumbers.forEach(stepEl => {
                const stepNum = parseInt(stepEl.getAttribute('data-step'));
                stepEl.addEventListener('click', function() {
                    if (completedSteps.has(stepNum)) {
                        showStep(stepNum);
                    }
                });
            });
        }

        setupStepIndicatorClicks();
        
        let carouselResizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(carouselResizeTimer);
            carouselResizeTimer = setTimeout(() => {
                if (filteredPrograms.length > 0) {
                    updateProgramCarousel();
                }
            }, 100);
        });

        // 3. Final Submission, Security Validation & Simulated Mock Database Hashing
        completeBtn.addEventListener('click', async function() {
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
                
                completeBtn.disabled = true;
                completeBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="margin-right: 0.5rem; animation: spin 1s linear infinite;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 6v6l4 2"></path>
                    </svg>
                    Creating Account...
                `;
                
                // 3.1 Immutable-like Session Cryptographic Token Check (closure protected)
                if (!activeSessionToken || activeSessionToken !== expectedHash) {
                    showToast('⛔ Security Check Failed: Verification token is invalid or missing.', '❌');
                    completeBtn.disabled = false;
                    completeBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="margin-right: 0.5rem;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Complete Registration
                    `;
                    return;
                }

                if (!googleUser || !verifiedEmail) {
                    showToast('Please complete Google authentication first', '⚠️');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete';
                    return;
                }
                
                const userPassword = savedPassword;
                if (!userPassword) {
                    showToast('Password is required. Please go back to Step 5.', '⚠️');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete';
                    return;
                }
                
                // Collect and build form variables
                const firstName = firstNameInput.value.trim();
                const middleName = document.getElementById('middle-name').value.trim();
                const lastName = lastNameInput.value.trim();
                
                // Combined fullName variable as specified by request
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

                // 3.2 Account De-duplication Check against local Simulated Database
                const mockDb = JSON.parse(localStorage.getItem('reCapsMockUsers')) || [];
                const emailExists = mockDb.some(u => u.email.toLowerCase() === verifiedEmail.toLowerCase());
                const idExists = mockDb.some(u => {
                    const existingId = u.studentId || u.teacherId;
                    return existingId && existingId.toLowerCase() === registeredId.toLowerCase();
                });

                if (emailExists) {
                    showToast('⚠️ Validation Error: Email is already linked to a registered account.', '❌');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete';
                    return;
                }

                if (idExists) {
                    showToast(`⚠️ Validation Error: ID number (${registeredId}) is already taken.`, '❌');
                    completeBtn.disabled = false;
                    completeBtn.textContent = 'Complete';
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
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    termsAcceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    termsAccepted: true
                };
                
                if (userType === 'student') {
                    userData.studentId = registeredId;
                    userData.college = college;
                    userData.program = program;
                } else if (userType === 'teacher') {
                    userData.teacherId = registeredId;
                    userData.college = college;
                }
                
                const securityQuestion = document.getElementById('security-question').value;
                const securityAnswer = document.getElementById('security-answer').value.trim();
                if (securityQuestion && securityAnswer) {
                    userData.securityQuestion = securityQuestion;
                    userData.securityAnswer = securityAnswer;
                }
                
                const user = googleUser;
                
                // Link credential to existing Google account on Firebase
                try {
                    // Re-authenticate with Google first to satisfy Firebase's
                    // "requires-recent-login" requirement for sensitive operations.
                    // The multi-step form can take long enough to expire the session token.
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
                    } else if (linkError.code === 'auth/email-already-in-use') {
                        console.warn('Email already in use with password');
                    } else {
                        throw linkError;
                    }
                }
                
                // Update Firebase display name if needed
                if (user.displayName !== fullName) {
                    await user.updateProfile({
                        displayName: fullName
                    });
                }
                
                // Save user metadata to Firestore
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
                
                // 3.3 Secure Storage (Web Crypto SHA-256 Hashing of password for Simulated Database)
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

                // Commit to simulated local database
                mockDb.push(localUserRecord);
                localStorage.setItem('reCapsMockUsers', JSON.stringify(mockDb));

                // Success - trigger modal display
                showSuccessModal(user);
                
            } catch (error) {
                console.error('Registration error:', error);
                completeBtn.disabled = false;
                completeBtn.textContent = 'Complete';
                showToast('Registration failed: ' + error.message);
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
            successModal.classList.add('active');
            
            setTimeout(() => {
                successModalClose.classList.add('visible');
            }, 2000);
            
            setTimeout(() => {
                const preloadFrame = document.createElement('iframe');
                preloadFrame.style.display = 'none';
                preloadFrame.src = 'index.html';
                document.body.appendChild(preloadFrame);
            }, 1000);
        }
        
        successModalClose.addEventListener('click', () => {
            successModal.classList.remove('active');
        });
        
        autoLoginBtn.addEventListener('click', async () => {
            try {
                if (currentUser) {
                    await db.collection('users').doc(currentUser.uid).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                sessionStorage.setItem('autoLoggedIn', 'true');
                sessionStorage.setItem('justRegistered', 'true');
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Auto-login error:', error);
                alert('Error during login. Redirecting to login page...');
                window.location.href = 'index.html';
            }
        });
        
        manualLoginBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                sessionStorage.clear();
                sessionStorage.setItem('openLoginModal', 'true');
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Sign out error:', error);
                sessionStorage.setItem('openLoginModal', 'true');
                window.location.href = 'index.html';
            }
        });
    });
})();

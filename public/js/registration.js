document.addEventListener('DOMContentLoaded', function() {
    // Get step elements
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const step4 = document.getElementById('step-4');
    const step5 = document.getElementById('step-5');
    const step6 = document.getElementById('step-6');
    const step7 = document.getElementById('step-7');

    // Get shared step indicator elements
    const stepNumbers = document.querySelectorAll('.step-number[data-step]');
    const stepDividers = document.querySelectorAll('.step-divider[data-divider]');

    // Get transition buttons
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
    
    // Store Google user data
    let googleUser = null;
    let verifiedEmail = null;
    
    // User type selection
    const userTypeInput = document.getElementById('user-type');
    const roleCards = document.querySelectorAll('.role-card');
    
    // College selection for teachers
    const collegeCards = document.querySelectorAll('.college-card');
    const teacherCollegeInput = document.getElementById('teacher-college');
    
    // Student college selection elements
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
    
    // Program data
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
    
    // Field groups for conditional display
    const studentIdGroup = document.getElementById('student-id-group');
    const teacherIdGroup = document.getElementById('teacher-id-group');
    const studentCollegeGroup = document.getElementById('student-college-group');
    const teacherCollegeGroup = document.getElementById('teacher-college-group');

    // Track completed steps
    const completedSteps = new Set();
    let currentStep = 1;
    let maxReachedStep = 1;
    let userType = null; // 'student' or 'teacher'
    
    // Create cursor tooltip element
    const cursorTooltip = document.createElement('div');
    cursorTooltip.className = 'cursor-tooltip';
    document.body.appendChild(cursorTooltip);
    
    // Tooltip handler for disabled buttons
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
        
        // Shake animation on click when disabled
        button.addEventListener('click', (e) => {
            if (button.disabled) {
                e.preventDefault();
                button.classList.add('shake');
                setTimeout(() => button.classList.remove('shake'), 500);
            }
        });
    }

    // Role card selection handler
    roleCards.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selected class from all cards
            roleCards.forEach(c => c.classList.remove('selected'));
            
            // Add selected class to clicked card
            this.classList.add('selected');
            
            // Update hidden input and userType variable
            const selectedRole = this.getAttribute('data-role');
            userTypeInput.value = selectedRole;
            userType = selectedRole;
            
            // Enable next button
            nextToStep2Btn.disabled = false;
        });
    });
    
    // Attach tooltip to Step 1 Next button
    attachTooltipToButton(nextToStep2Btn, 'Please select your role first');
    
    // Step 3 validation (Google Sign-In)
    function validateStep3() {
        const isValid = googleUser !== null && verifiedEmail !== null;
        nextToStep4Btn.disabled = !isValid;
        if (!isValid) {
            attachTooltipToButton(nextToStep4Btn, 'Please sign in with Google first');
        }
    }
    
    // Initial validation for Step 3
    validateStep3();
    
    // Google Sign-In Handler
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', async function() {
            try {
                // Hide any previous errors
                accountExistsError.style.display = 'none';
                
                // Disable button during sign-in
                googleSignInBtn.disabled = true;
                googleSignInBtn.innerHTML = '<span>Signing in...</span>';
                
                // Create Google Auth Provider
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.addScope('email');
                provider.addScope('profile');
                
                // Sign in with popup
                const result = await auth.signInWithPopup(provider);
                
                // Get user info
                googleUser = result.user;
                verifiedEmail = googleUser.email;
                
                // CHECK IF ACCOUNT ALREADY EXISTS IN FIRESTORE
                const userDoc = await db.collection('users').doc(googleUser.uid).get();
                
                if (userDoc.exists) {
                    // Account already registered - show error
                    console.warn('Account already exists:', googleUser.uid);
                    
                    // Get user data to show in error
                    const existingEmail = googleUser.email;
                    
                    // Sign out the user
                    await auth.signOut();
                    
                    // Reset variables
                    googleUser = null;
                    verifiedEmail = null;
                    
                    // Hide status and main button
                    googleAuthStatus.style.display = 'none';
                    googleSignInBtn.style.display = 'none';
                    
                    // Show error message with user's email
                    errorMessage.textContent = `The Google account "${existingEmail}" is already registered. Please login instead or use a different Google account.`;
                    accountExistsError.style.display = 'flex';
                    
                    // Keep next button disabled
                    nextToStep4Btn.disabled = true;
                    
                    return;
                }
                
                // Account is NEW - proceed with registration
                console.log('Google Sign-In successful - New account:', googleUser);
                
                // Hide error message (if it was shown before)
                accountExistsError.style.display = 'none';
                
                // Update UI with user info
                googleUserAvatar.src = googleUser.photoURL || 'https://via.placeholder.com/48';
                googleUserName.textContent = googleUser.displayName || 'User';
                googleUserEmail.textContent = googleUser.email;
                
                // Hide status and button, show user info
                googleAuthStatus.style.display = 'none';
                googleSignInBtn.style.display = 'none';
                googleAuthInfo.style.display = 'flex';
                
                // Enable next button
                nextToStep4Btn.disabled = false;
                
            } catch (error) {
                console.error('Google Sign-In error:', error);
                
                // Re-enable button
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
                
                // Handle specific errors
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
    
    // Change Google Account Handler
    if (changeGoogleAccountBtn) {
        changeGoogleAccountBtn.addEventListener('click', async function() {
            try {
                // Sign out current user
                await auth.signOut();
                
                // Reset UI
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
                
                console.log('Signed out, ready for new account');
                
            } catch (error) {
                console.error('Sign-out error:', error);
                alert('Error signing out: ' + error.message);
            }
        });
    }
    
    // Try Different Account button in error message
    if (tryDifferentAccountBtn) {
        tryDifferentAccountBtn.addEventListener('click', async function() {
            // Hide error message
            accountExistsError.style.display = 'none';
            
            // Show status and button again
            googleAuthStatus.style.display = 'flex';
            googleSignInBtn.style.display = 'flex';
            googleSignInBtn.disabled = false;
            
            // Reset button text
            googleSignInBtn.innerHTML = `
                <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                </svg>
                <span>Sign in with Google</span>
            `;
            
            // Automatically trigger sign-in popup
            setTimeout(() => {
                googleSignInBtn.click();
            }, 100);
        });
    }
    
    // Real-time validation for Step 2 (Names)
    const firstNameInput = document.getElementById('first-name');
    const lastNameInput = document.getElementById('last-name');
    
    // Prevent numbers in name fields
    function preventNumbers(e) {
        const value = e.target.value;
        // Remove any numbers from the input
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
        validateStep2(); // Initial check
    }
    
    
    // Real-time validation for Step 5 (Password)
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const passwordStrengthFill = document.getElementById('password-strength-fill');
    const passwordSuggestion = document.getElementById('password-suggestion');
    
    // Password test elements (Step 6)
    const passwordTestInput = document.getElementById('password-test');
    const passwordTestFeedback = document.getElementById('password-test-feedback');
    let savedPassword = '';
    
    // Password strength checker
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
        
        // Determine suggestion (one at a time, priority order)
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
        
        // Update strength bar
        passwordStrengthFill.className = 'password-strength-fill';
        if (result.strength) {
            passwordStrengthFill.classList.add(result.strength);
        }
        
        // Update suggestion
        passwordSuggestion.textContent = result.suggestion;
    }
    
    // Toggle password visibility
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
        validateStep5(); // Initial check
        setupPasswordToggle();
    }
    
    // Password test functionality (Step 6)
    if (passwordTestInput) {
        // Prevent copy/paste
        passwordTestInput.addEventListener('copy', (e) => e.preventDefault());
        passwordTestInput.addEventListener('paste', (e) => e.preventDefault());
        passwordTestInput.addEventListener('cut', (e) => e.preventDefault());
        
        // Disable context menu
        passwordTestInput.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Check password on input
        passwordTestInput.addEventListener('input', function() {
            const enteredPassword = this.value;
            
            if (enteredPassword === savedPassword) {
                // Correct password
                this.className = 'form-input password-test-input correct';
                passwordTestFeedback.textContent = 'Correct! Password verified';
                passwordTestFeedback.className = 'password-test-feedback correct';
                nextToStep7Btn.disabled = false;
            } else if (enteredPassword.length >= savedPassword.length) {
                // Wrong password (full length entered)
                this.className = 'form-input password-test-input incorrect';
                passwordTestFeedback.textContent = '✗ Incorrect password. Try again';
                passwordTestFeedback.className = 'password-test-feedback incorrect';
                nextToStep7Btn.disabled = true;
                
                // Clear after showing error
                setTimeout(() => {
                    this.value = '';
                    this.className = 'form-input password-test-input';
                    passwordTestFeedback.textContent = '';
                }, 1500);
            } else {
                // Still typing
                this.className = 'form-input password-test-input';
                passwordTestFeedback.textContent = '';
                nextToStep7Btn.disabled = true;
            }
        });
    }
    
    // Real-time validation for Step 4 (Academic Profile)
    const studentIdInput = document.getElementById('student-id');
    const teacherIdInput = document.getElementById('teacher-id');
    
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
    
    // Attach input listeners for Step 4 fields
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

    // College card selection handler for teachers
    collegeCards.forEach(card => {
        card.addEventListener('click', function() {
            // Check if this is a teacher college card
            const parentId = this.closest('#teacher-college-group');
            if (parentId) {
                // Teacher college selection
                const teacherCards = document.querySelectorAll('#teacher-college-group .college-card');
                teacherCards.forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                const selectedCollege = this.getAttribute('data-college');
                teacherCollegeInput.value = selectedCollege;
                
                // Validate after selection
                if (userType === 'teacher') validateStep4();
            }
        });
    });

    // Student college card selection handler
    studentCollegeCardsElements.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selected class from all student college cards
            studentCollegeCardsElements.forEach(c => c.classList.remove('selected'));
            
            // Add selected class to clicked card
            this.classList.add('selected');
            
            // Get selected college
            const selectedCollege = this.getAttribute('data-college');
            studentCollegeInput.value = selectedCollege;
            selectedCollegeName.textContent = selectedCollege;
            
            // Animate transition: shrink cards and show compact display
            setTimeout(() => {
                studentCollegeCards.classList.add('compact');
                
                setTimeout(() => {
                    studentCollegeSelected.style.display = 'block';
                    setTimeout(() => {
                        studentCollegeSelected.classList.add('show');
                        
                        // Show program dropdown with filtered options
                        setTimeout(() => {
                            showProgramDropdown(selectedCollege);
                            // Validate after college selection
                            if (userType === 'student') validateStep4();
                        }, 200);
                    }, 50);
                }, 400);
            }, 300);
        });
    });

    // Change college button handler
    if (changeCollegeBtn) {
        changeCollegeBtn.addEventListener('click', function() {
            // Hide program dropdown
            programGroup.classList.remove('show');
            
            setTimeout(() => {
                // Hide compact display
                studentCollegeSelected.classList.remove('show');
                
                setTimeout(() => {
                    studentCollegeSelected.style.display = 'none';
                    
                    // Show cards again
                    studentCollegeCards.classList.remove('compact');
                    
                    // Clear selection
                    studentCollegeInput.value = '';
                    programInput.value = '';
                    studentCollegeCardsElements.forEach(c => c.classList.remove('selected'));
                    
                    // Re-validate after clearing
                    if (userType === 'student') validateStep4();
                }, 300);
            }, 200);
        });
    }

    // Function to show and filter program dropdown
    function showProgramDropdown(selectedCollege) {
        // Filter programs based on selected college
        filteredPrograms = allPrograms.filter(p => p.college === selectedCollege);
        currentProgramIndex = 0;
        
        // Render program carousel
        renderProgramCarousel();
        
        // Show program group with animation
        programGroup.classList.add('show');
    }
    
    // Render program carousel cards
    function renderProgramCarousel() {
        programCarouselTrack.innerHTML = '';
        programIndicators.innerHTML = '';
        
        if (filteredPrograms.length === 0) return;
        
        // Create program cards
        filteredPrograms.forEach((program, index) => {
            const card = document.createElement('div');
            card.className = 'program-card';
            card.dataset.index = index;
            card.dataset.code = program.code;
            
            card.innerHTML = `
                <div class="program-code">${program.code}</div>
                <div class="program-name">${program.name}</div>
            `;
            
            // Click handler
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(card.dataset.index, 10);
                if (!isNaN(idx)) {
                    selectProgram(idx);
                }
            });
            
            programCarouselTrack.appendChild(card);
            
            // Create indicator dot
            const dot = document.createElement('span');
            dot.className = 'program-indicator-dot';
            dot.dataset.index = index;
            dot.addEventListener('click', () => selectProgram(index));
            programIndicators.appendChild(dot);
        });
        
        // Auto-select first program
        currentProgramIndex = 0;
        const firstProgram = filteredPrograms[0];
        programInput.value = firstProgram.code;
        
        // Initialize carousel position
        updateProgramCarousel();
        attachProgramParallax();
        
        // Validate after rendering
        if (userType === 'student') {
            setTimeout(() => validateStep4(), 100);
        }
    }
    
    // Select a program
    function selectProgram(index) {
        currentProgramIndex = Math.max(0, Math.min(index, filteredPrograms.length - 1));
        const selectedProgram = filteredPrograms[currentProgramIndex];
        programInput.value = selectedProgram.code;
        updateProgramCarousel();
        
        // Validate after program selection
        if (userType === 'student') validateStep4();
    }
    
    // Update carousel visual state
    function updateProgramCarousel() {
        const cards = programCarouselTrack.querySelectorAll('.program-card');
        const dots = programIndicators.querySelectorAll('.program-indicator-dot');
        
        if (cards.length === 0) return;
        
        // Update active states
        cards.forEach((card, i) => {
            card.classList.toggle('active', i === currentProgramIndex);
        });
        
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentProgramIndex);
        });
        
        // Calculate scroll position to center active card
        const viewportWidth = programCarouselViewport.clientWidth;
        const cardWidth = cards[0].offsetWidth + 16; // includes gap
        const offset = (viewportWidth / 2) - (cardWidth / 2) - (currentProgramIndex * cardWidth);
        programCarouselTrack.style.transform = `translateX(${offset}px)`;
    }
    
    // Parallax effect on program carousel
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
    
    // Program carousel navigation
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
    
    // Wheel navigation for program carousel
    function handleProgramWheel(e) {
        e.preventDefault();
        const delta = e.deltaY || e.deltaX;
        if (delta > 0) {
            nextProgram();
        } else if (delta < 0) {
            prevProgram();
        }
    }
    
    // Attach carousel event listeners
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
    
    // Keyboard navigation for program carousel
    document.addEventListener('keydown', (e) => {
        // Only handle if program carousel is visible
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

    // Show a specific step
    function showStep(stepNumber) {
        step1.classList.remove('active');
        step2.classList.remove('active');
        step3.classList.remove('active');
        step4.classList.remove('active');
        step5.classList.remove('active');
        step6.classList.remove('active');
        step7.classList.remove('active');

        if (stepNumber === 1) {
            step1.classList.add('active');
        } else if (stepNumber === 2) {
            step2.classList.add('active');
        } else if (stepNumber === 3) {
            step3.classList.add('active');
        } else if (stepNumber === 4) {
            step4.classList.add('active');
            // Update academic profile fields based on user type
            updateAcademicProfileFields();
            // Trigger validation for Step 4
            setTimeout(() => validateStep4(), 100);
        } else if (stepNumber === 5) {
            step5.classList.add('active');
        } else if (stepNumber === 6) {
            step6.classList.add('active');
            // Save password and reset test input
            savedPassword = passwordInput.value;
            passwordTestInput.value = '';
            passwordTestInput.className = 'form-input password-test-input';
            passwordTestFeedback.textContent = '';
            passwordTestFeedback.className = 'password-test-feedback';
            nextToStep7Btn.disabled = true;
        } else if (stepNumber === 7) {
            step7.classList.add('active');
        }

        currentStep = stepNumber;
        
        // Update maxReachedStep if we've moved forward
        if (stepNumber > maxReachedStep) {
            maxReachedStep = stepNumber;
        }
        
        updateStepIndicators();
    }

    // Update academic profile fields based on user type
    function updateAcademicProfileFields() {
        if (userType === 'student') {
            // Show student fields
            studentIdGroup.style.display = 'block';
            teacherIdGroup.style.display = 'none';
            studentCollegeGroup.style.display = 'block';
            programGroup.style.display = 'block';
            teacherCollegeGroup.style.display = 'none';
        } else if (userType === 'teacher') {
            // Show teacher fields
            studentIdGroup.style.display = 'none';
            teacherIdGroup.style.display = 'block';
            studentCollegeGroup.style.display = 'none';
            programGroup.style.display = 'none';
            teacherCollegeGroup.style.display = 'block';
        }
    }

    // Update step indicators visual state
    function updateStepIndicators() {
        stepNumbers.forEach(stepEl => {
            const stepNum = parseInt(stepEl.getAttribute('data-step'));
            
            // Remove all state classes
            stepEl.classList.remove('active', 'completed', 'clickable');
            
            // Set appropriate state
            if (stepNum === currentStep) {
                stepEl.classList.add('active');
            } else if (completedSteps.has(stepNum)) {
                stepEl.classList.add('completed');
                stepEl.textContent = '✓';
                // Add clickable class ONLY to completed steps
                stepEl.classList.add('clickable');
            } else {
                stepEl.textContent = stepNum;
            }
        });

        // Update dividers
        stepDividers.forEach(divider => {
            const dividerNum = parseInt(divider.getAttribute('data-divider'));
            
            // Remove active class
            divider.classList.remove('active');
            
            // Add active class if the step before this divider is completed
            if (completedSteps.has(dividerNum)) {
                divider.classList.add('active');
            }
        });
    }

    // Mark a step as completed
    function markStepCompleted(stepNumber) {
        completedSteps.add(stepNumber);
        updateStepIndicators();
    }

    // Add click handlers to step indicators
    function setupStepIndicatorClicks() {
        stepNumbers.forEach(stepEl => {
            const stepNum = parseInt(stepEl.getAttribute('data-step'));
            
            stepEl.addEventListener('click', function() {
                // Allow navigation ONLY to completed steps
                if (completedSteps.has(stepNum)) {
                    showStep(stepNum);
                }
            });
        });
    }

    // Navigation Event Listeners
    nextToStep2Btn.addEventListener('click', () => {
        // Validate user type selection
        if (!userTypeInput.value) {
            showToast('Please select your role (Student or Teacher)');
            return;
        }
        markStepCompleted(1);
        showStep(2);
    });
    backToStep1Btn.addEventListener('click', () => showStep(1));
    nextToStep3Btn.addEventListener('click', () => {
        // Validate name fields
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        
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
        // Validate Google authentication
        if (!googleUser || !verifiedEmail) {
            showToast('Please sign in with Google first');
            return;
        }
        
        markStepCompleted(3);
        showStep(4);
    });
    backToStep3Btn.addEventListener('click', () => showStep(3));
    nextToStep5Btn.addEventListener('click', () => {
        // Validate academic profile based on user type
        if (userType === 'student') {
            const studentId = document.getElementById('student-id').value;
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
            const teacherId = document.getElementById('teacher-id').value;
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
        // Validate password fields
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
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

    // Initialize step indicator clicks
    setupStepIndicatorClicks();
    
    // Window resize handler for program carousel
    let carouselResizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(carouselResizeTimer);
        carouselResizeTimer = setTimeout(() => {
            if (filteredPrograms.length > 0) {
                updateProgramCarousel();
            }
        }, 100);
    });


    // Complete registration (Save to Firebase)
    completeBtn.addEventListener('click', async function() {
        try {
            // Disable button to prevent double submission
            completeBtn.disabled = true;
            completeBtn.textContent = 'Creating account...';
            
            // Check if user is authenticated with Google
            if (!googleUser || !verifiedEmail) {
                showToast('Please complete Google authentication first', '⚠️');
                completeBtn.disabled = false;
                completeBtn.textContent = 'Complete';
                return;
            }
            
            // Get the password from Step 5
            const userPassword = savedPassword;
            
            if (!userPassword) {
                showToast('Password is required. Please go back to Step 5.', '⚠️');
                completeBtn.disabled = false;
                completeBtn.textContent = 'Complete';
                return;
            }
            
            // Collect all form data
            const userData = {
                userType: userType, // 'student' or 'teacher'
                firstName: document.getElementById('first-name').value.trim(),
                middleName: document.getElementById('middle-name').value.trim(),
                lastName: document.getElementById('last-name').value.trim(),
                email: verifiedEmail, // Use Google email
                photoURL: googleUser.photoURL || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Add role-specific data
            if (userType === 'student') {
                userData.studentId = document.getElementById('student-id').value.trim();
                userData.college = studentCollegeInput.value;
                userData.program = programInput.value;
            } else if (userType === 'teacher') {
                userData.teacherId = document.getElementById('teacher-id').value.trim();
                userData.college = teacherCollegeInput.value;
            }
            
            // Add security question if provided
            const securityQuestion = document.getElementById('security-question').value;
            const securityAnswer = document.getElementById('security-answer').value.trim();
            if (securityQuestion && securityAnswer) {
                userData.securityQuestion = securityQuestion;
                userData.securityAnswer = securityAnswer;
            }
            
            // User is already authenticated with Google
            const user = googleUser;
            
            // LINK PASSWORD CREDENTIAL TO GOOGLE ACCOUNT
            try {
                // Create email/password credential
                const credential = firebase.auth.EmailAuthProvider.credential(verifiedEmail, userPassword);
                
                // Link the credential to the existing Google account
                await user.linkWithCredential(credential);
                
                console.log('Password credential linked successfully!');
            } catch (linkError) {
                console.error('Error linking password:', linkError);
                
                // If account already has password, just update it
                if (linkError.code === 'auth/provider-already-linked') {
                    console.log('Password provider already linked');
                } else if (linkError.code === 'auth/email-already-in-use') {
                    // Email/password account already exists, try to link differently
                    console.warn('Email already in use with password');
                } else {
                    throw linkError; // Re-throw other errors
                }
            }
            
            // Update display name if needed
            if (user.displayName !== `${userData.firstName} ${userData.lastName}`) {
                await user.updateProfile({
                    displayName: `${userData.firstName} ${userData.lastName}`
                });
            }
            
            // Save user data to Firestore
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                userType: userData.userType,
                firstName: userData.firstName,
                middleName: userData.middleName,
                lastName: userData.lastName,
                email: userData.email,
                photoURL: userData.photoURL,
                studentId: userData.studentId || null,
                teacherId: userData.teacherId || null,
                college: userData.college,
                program: userData.program || null,
                securityQuestion: userData.securityQuestion || null,
                securityAnswer: userData.securityAnswer || null,
                authProviders: ['google.com', 'password'], // Track both providers
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Success - show modal
            showSuccessModal(user);
            
        } catch (error) {
            console.error('Registration error:', error);
            completeBtn.disabled = false;
            completeBtn.textContent = 'Complete';
            
            // Handle specific errors
            showToast('Registration failed: ' + error.message);
        }
    });
    
    // Success Modal Functionality
    const successModal = document.getElementById('successModal');
    const successModalClose = document.getElementById('successModalClose');
    const autoLoginBtn = document.getElementById('autoLoginBtn');
    const manualLoginBtn = document.getElementById('manualLoginBtn');
    let currentUser = null;
    
    function showSuccessModal(user) {
        currentUser = user;
        
        // Show modal
        successModal.classList.add('active');
        
        // Make close button visible after 2 seconds
        setTimeout(() => {
            successModalClose.classList.add('visible');
        }, 2000);
        
        // Preload index.html in background (after 1 second)
        setTimeout(() => {
            // Create hidden iframe to load index.html
            const preloadFrame = document.createElement('iframe');
            preloadFrame.style.display = 'none';
            preloadFrame.src = 'index.html';
            document.body.appendChild(preloadFrame);
        }, 1000);
    }
    
    // Close modal button
    successModalClose.addEventListener('click', () => {
        successModal.classList.remove('active');
    });
    
    // Auto login button
    autoLoginBtn.addEventListener('click', async () => {
        try {
            // User is already logged in from registration
            // Update last login timestamp
            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Store auto-login flag
            sessionStorage.setItem('autoLoggedIn', 'true');
            sessionStorage.setItem('justRegistered', 'true');
            
            // Redirect to index
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Auto-login error:', error);
            alert('Error during login. Redirecting to login page...');
            window.location.href = 'index.html';
        }
    });
    
    // Manual login button
    manualLoginBtn.addEventListener('click', async () => {
        try {
            // Sign out the user
            await auth.signOut();
            
            // Clear session except for our flag
            sessionStorage.clear();
            // Set flag to open login modal on index.html
            sessionStorage.setItem('openLoginModal', 'true');
            
            // Redirect to index without auto-login
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Sign out error:', error);
            // Still set the flag even if sign-out fails
            sessionStorage.setItem('openLoginModal', 'true');
            window.location.href = 'index.html';
        }
    });
});

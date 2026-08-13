document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const loginModal = document.getElementById('login-modal');
    const loginNavLink = document.getElementById('login-nav-link');
    const profileLink = document.getElementById('profile-link');
    const profileImg = document.getElementById('profile-img');
    const closeButtons = document.querySelectorAll('.modal-close');
    const backdrop = document.querySelector('.modal-backdrop');

    // ── Login modal logic (Only if loginModal is present on the page) ──
    if (loginModal) {
        const loginEmailInput = document.getElementById('login-email');
        const loginPasswordInput = document.getElementById('login-password');
        const loginBtn = document.getElementById('login-btn');
        const googleLoginBtn = document.getElementById('google-login-btn');
        const emailError = document.getElementById('email-error');
        const passwordError = document.getElementById('password-error');
        const rememberMeCheckbox = document.getElementById('remember-me');
        const passwordToggleBtn = document.querySelector('.toggle-password-btn');

        // Open modal
        function openModal() {
            loginModal.classList.add('active');
        }

        // Close modal
        function closeModal() {
            loginModal.classList.remove('active');
            loginEmailInput.value = '';
            loginPasswordInput.value = '';
            clearErrors();
        }

        // Clear all error states
        function clearErrors() {
            emailError.classList.remove('show');
            passwordError.classList.remove('show');
            loginEmailInput.classList.remove('error');
            loginPasswordInput.classList.remove('error');
        }

        // Show field error
        function showFieldError(field, message) {
            const input = field === 'email' ? loginEmailInput : loginPasswordInput;
            const errorDiv = field === 'email' ? emailError : passwordError;
            
            input.classList.add('error');
            errorDiv.textContent = message;
            errorDiv.classList.add('show');
            
            setTimeout(() => {
                input.classList.remove('error');
            }, 500);
        }

        // Password toggle functionality
        if (passwordToggleBtn) {
            passwordToggleBtn.addEventListener('click', function() {
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
        }

        // Clear errors on input
        if (loginEmailInput) {
            loginEmailInput.addEventListener('input', () => {
                emailError.classList.remove('show');
                loginEmailInput.classList.remove('error');
            });
        }
        
        if (loginPasswordInput) {
            loginPasswordInput.addEventListener('input', () => {
                passwordError.classList.remove('show');
                loginPasswordInput.classList.remove('error');
            });
        }

        // Event listeners
        if (loginNavLink) {
            loginNavLink.addEventListener('click', function(e) {
                e.preventDefault();
                openModal();
            });
        }

        closeButtons.forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        if (backdrop) {
            backdrop.addEventListener('click', closeModal);
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && loginModal.classList.contains('active')) {
                closeModal();
            }
        });

        // Login functionality
        if (loginBtn) {
            loginBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                const email = loginEmailInput.value.trim();
                const password = loginPasswordInput.value;
                const rememberMe = rememberMeCheckbox.checked;
                
                clearErrors();
                
                if (!email) {
                    showFieldError('email', 'Please enter your email address');
                    return;
                }
                
                if (!password) {
                    showFieldError('password', 'Please enter your password');
                    return;
                }
                
                loginBtn.disabled = true;
                loginBtn.textContent = 'Logging in...';
                
                try {
                    const persistence = rememberMe 
                        ? firebase.auth.Auth.Persistence.LOCAL 
                        : firebase.auth.Auth.Persistence.SESSION;
                    
                    await auth.setPersistence(persistence);
                    
                    const userCredential = await auth.signInWithEmailAndPassword(email, password);
                    const user = userCredential.user;
                    
                    await db.collection('users').doc(user.uid).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    const userData = userDoc.data();
                    
                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', user.displayName);
                    sessionStorage.setItem('userType', userData.userType);
                    
                    closeModal();
                    
                    // Use AuthService for role-based redirect
                    AuthService.redirectAfterLogin(
                        userData.userType, 
                        user.displayName || email.split('@')[0], 
                        showWelcomeModal
                    );
                    
                } catch (error) {
                    console.error('Login error:', error);
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Login';
                    
                    if (error.code === 'auth/user-not-found') {
                        showFieldError('email', 'No account found with this email');
                    } else if (error.code === 'auth/wrong-password') {
                        showFieldError('password', 'Incorrect password');
                    } else if (error.code === 'auth/invalid-email') {
                        showFieldError('email', 'Invalid email address format');
                    } else if (error.code === 'auth/too-many-requests') {
                        showFieldError('password', 'Too many failed attempts. Try again later');
                    } else if (error.code === 'auth/invalid-credential') {
                        showFieldError('password', 'Invalid email or password');
                    } else {
                        showFieldError('password', 'Login failed. Please try again');
                    }
                }
            });
        }

        // Google Sign-In Login
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                googleLoginBtn.disabled = true;
                googleLoginBtn.innerHTML = '<span>Signing in...</span>';
                
                try {
                    const provider = new firebase.auth.GoogleAuthProvider();
                    provider.addScope('email');
                    provider.addScope('profile');
                    
                    const result = await auth.signInWithPopup(provider);
                    const user = result.user;
                    
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    
                    if (!userDoc.exists) {
                        await auth.signOut();
                        googleLoginBtn.disabled = false;
                        googleLoginBtn.innerHTML = `
                            <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                            </svg>
                        `;
                        showNoAccountModal();
                        return;
                    }
                    
                    await db.collection('users').doc(user.uid).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    const userData = userDoc.data();
                    
                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', user.displayName);
                    sessionStorage.setItem('userType', userData.userType);
                    
                    closeModal();
                    
                    // Use AuthService for role-based redirect
                    AuthService.redirectAfterLogin(
                        userData.userType,
                        user.displayName || user.email.split('@')[0],
                        showWelcomeModal
                    );
                    
                } catch (error) {
                    console.error('Google Sign-In error:', error);
                    googleLoginBtn.disabled = false;
                    googleLoginBtn.innerHTML = `
                        <svg class="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
                        </svg>
                    `;
                    showToast('Sign-in failed: ' + error.message, '❌');
                }
            });
        }
    }
    
    // ── Global Profile Dropdown logic ──
    const dropWrapper = document.getElementById('profile-link');
    const dropPanel = document.getElementById('profile-dropdown-panel');
    const trigger = document.getElementById('profile-img-trigger');
    const pdThemeToggle = document.getElementById('pd-theme-toggle');
    const pdLogoutBtn = document.getElementById('pd-logout-btn');
    const avatarImg = document.getElementById('pd-avatar-img');
    const userName = document.getElementById("user-name");

    if (dropWrapper && trigger && dropPanel) {
        function openDropdown() {
            dropPanel.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        function closeDropdown() {
            dropPanel.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        // Toggle dropdown on profile click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropPanel.classList.contains('open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!dropWrapper.contains(e.target)) {
                closeDropdown();
            }
        });

        // Dashboard Row Navigation
        const pdDashboardRow = document.getElementById('pd-dashboard-row');
        if (pdDashboardRow) {
            pdDashboardRow.addEventListener('click', () => {
                const userType = sessionStorage.getItem('userType');
                
                // Use AuthService
                if (AuthService.isOnCorrectDashboard(userType)) {
                    closeDropdown();
                } else {
                    AuthService.navigateToDashboard(userType);
                }
            });
        }

        // Sync theme switch inside dropdown
        function syncThemePill() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (pdThemeToggle) {
                pdThemeToggle.classList.toggle('dark-on', isDark);
            }
        }
        syncThemePill();

        // Listen for standard theme toggling on page so we stay synced
        window.addEventListener('themeChanged', syncThemePill);

        if (pdThemeToggle) {
            pdThemeToggle.addEventListener('click', () => {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const newTheme = isDark ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                syncThemePill();
                window.dispatchEvent(new Event('themeChanged'));
            });
        }

        // Dropdown Logout logic
        if (pdLogoutBtn) {
            pdLogoutBtn.addEventListener('click', async () => {
                await AuthService.logout();
            });
        }
    }

    // Function to update header based on auth state
    function updateHeader(user) {
        const themeToggleBtn = document.getElementById('theme-toggle');
        const aboutNavLink = document.getElementById('about-nav-link');
        if (user) {
            localStorage.setItem('cachedAuthState', 'true');
            if (loginNavLink) loginNavLink.style.display = 'none';
            if (profileLink) profileLink.style.display = 'block';
            if (profileImg) profileImg.src = user.photoURL || profileImg.src;
            if (avatarImg) avatarImg.src = user.photoURL || avatarImg.src;
            if (themeToggleBtn) themeToggleBtn.style.display = 'none';
            if (aboutNavLink) aboutNavLink.style.display = 'none'; // moved into dropdown
        } else {
            localStorage.removeItem('cachedAuthState');
            if (loginNavLink) loginNavLink.style.display = 'block';
            if (profileLink) profileLink.style.display = 'none';
            if (themeToggleBtn) themeToggleBtn.style.display = 'block';
            if (aboutNavLink) aboutNavLink.style.display = 'flex'; // show when logged out
        }
    }

    // Check auth state changes
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(async (user) => {
            updateHeader(user);
            
            if (user) {
                if (userName) {
                    userName.textContent = user.displayName || "User";
                }
                // Clear any leftover registration flags to prevent unexpected behavior
                sessionStorage.removeItem('justRegistered');
                sessionStorage.removeItem('autoLoggedIn');
            }
        });
    }
    
    // Check auto-open login modal state
    if (sessionStorage.getItem('openLoginModal') === 'true') {
        sessionStorage.removeItem('openLoginModal');
        setTimeout(() => {
            if (typeof openModal === 'function') openModal();
        }, 100);
    }

    // Modern Welcome Modal Function
    function showWelcomeModal(name, redirectTarget) {
        const overlay = document.createElement('div');
        overlay.className = 'welcome-modal-overlay';
        
        const safeName = (name || 'Guest').split(' ')[0];
        
        overlay.innerHTML = `
            <div class="welcome-modal-content">
                <div class="welcome-icon-wrapper">
                    <span class="wave-emoji">👋</span>
                </div>
                <h2 class="welcome-modal-title">Welcome back, <span>${safeName}</span>!</h2>
                <p class="welcome-modal-text">We're glad to see you again. Ready to dive into your capstone research?</p>
                <button class="welcome-modal-btn" id="welcome-lets-go-btn">Let's Go!</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);
        
        document.getElementById('welcome-lets-go-btn').addEventListener('click', () => {
            overlay.classList.remove('active');
            setTimeout(() => {
                // Handle different redirect types
                if (redirectTarget === 'reload') {
                    window.location.reload();
                } else if (AuthService.isValidRole(redirectTarget)) {
                    // It's a user role - navigate to their dashboard
                    AuthService.navigateToDashboard(redirectTarget);
                } else {
                    // Direct URL fallback
                    window.location.href = redirectTarget;
                }
            }, 400);
        });
    }

    // No Account Found Modal Function
    function showNoAccountModal() {
        const overlay = document.createElement('div');
        overlay.className = 'welcome-modal-overlay';
        
        overlay.innerHTML = `
            <div class="welcome-modal-content">
                <div class="welcome-icon-wrapper">
                    <span class="wave-emoji">🔍</span>
                </div>
                <h2 class="welcome-modal-title">No Account Found</h2>
                <p class="welcome-modal-text">The Google account you used is not registered in our system. Please register first to access RE-CAPS.</p>
                <div class="welcome-modal-buttons">
                    <button class="welcome-modal-btn-secondary" id="no-account-back-btn">Back to Login</button>
                    <button class="welcome-modal-btn" id="no-account-register-btn">Register Now</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);
        
        document.getElementById('no-account-back-btn').addEventListener('click', () => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
            }, 400);
        });
        
        document.getElementById('no-account-register-btn').addEventListener('click', () => {
            overlay.classList.remove('active');
            setTimeout(() => {
                AuthService.navigateToRegistration();
            }, 400);
        });
    }
});

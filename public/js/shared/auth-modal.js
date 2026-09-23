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
            // Reset and replay text animations
            restartLoginAnimations();
        }

        // Restart login panel animations
        function restartLoginAnimations() {
            // Get all animated elements
            const welcomeLine = loginModal.querySelector('.welcome-line');
            const letters = loginModal.querySelectorAll('.letter');
            const tagline = loginModal.querySelector('.tagline-animated');
            
            // Remove all animated elements temporarily
            const elementsToAnimate = [welcomeLine, ...letters, tagline].filter(el => el);
            
            elementsToAnimate.forEach(element => {
                // Clone the element to reset its animation
                const clone = element.cloneNode(true);
                element.parentNode.replaceChild(clone, element);
            });
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

                    if (typeof window.ActivityService !== 'undefined') {
                        window.ActivityService.logAuth('login', `Signed in via email as ${userData.userType || 'user'}`);
                    }
                    
                    closeModal();
                    
                    const proceedWithLogin = () => {
                        AuthService.redirectAfterLogin(
                            userData.userType, 
                            user.displayName || email.split('@')[0], 
                            showWelcomeModal
                        );
                    };

                    // Check if local device has guest saved projects
                    if (typeof window.GuestSavedProjects !== 'undefined' && window.GuestSavedProjects.hasSaved()) {
                        showSyncPromptModal(user, userData, proceedWithLogin);
                    } else {
                        proceedWithLogin();
                    }
                    
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
                        googleLoginBtn.innerHTML = (typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('google') : '';

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

                    if (typeof window.ActivityService !== 'undefined') {
                        window.ActivityService.logAuth('login', `Signed in via Google as ${userData.userType || 'user'}`);
                    }
                    
                    closeModal();
                    
                    const proceedWithLogin = () => {
                        AuthService.redirectAfterLogin(
                            userData.userType,
                            user.displayName || user.email.split('@')[0],
                            showWelcomeModal
                        );
                    };

                    // Check if local device has guest saved projects
                    if (typeof window.GuestSavedProjects !== 'undefined' && window.GuestSavedProjects.hasSaved()) {
                        showSyncPromptModal(user, userData, proceedWithLogin);
                    } else {
                        proceedWithLogin();
                    }
                    
                } catch (error) {
                    console.error('Google Sign-In error:', error);
                    googleLoginBtn.disabled = false;
                    googleLoginBtn.innerHTML = (typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('google') : '';

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
            pdDashboardRow.addEventListener('click', async () => {
                let userType = sessionStorage.getItem('userType');
                if (!userType && window.AuthService) {
                    userType = await AuthService.getUserType();
                }
                
                // Use AuthService
                if (window.AuthService && AuthService.isOnCorrectDashboard(userType)) {
                    closeDropdown();
                } else if (window.AuthService) {
                    await AuthService.navigateToDashboard(userType);
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
                    userName.textContent = user.displayName || sessionStorage.getItem('userName') || "User";
                }
                // Pre-fetch and cache user profile in session storage
                if (window.AuthService) {
                    await AuthService.getUserType(user.uid);
                    if (userName && !user.displayName) {
                        const cachedName = sessionStorage.getItem('userName');
                        if (cachedName) userName.textContent = cachedName;
                    }
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

    // Modal to sync local device saved projects on login (ONLY DELETE OR CONTINUE)
    function showSyncPromptModal(user, userData, onFinished) {
        const guestProjects = (typeof window.GuestSavedProjects !== 'undefined') ? window.GuestSavedProjects.getAll() : [];
        const count = guestProjects.length;

        const overlay = document.createElement('div');
        overlay.className = 'welcome-modal-overlay';
        overlay.id = 'sync-prompt-overlay';

        overlay.innerHTML = `
            <div class="sync-modal-content">
                <div class="sync-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <h2 class="sync-modal-title">Sync Local Saved Data?</h2>
                <p class="sync-modal-text">Your device has local saved data. Do you want to sync to your account or not?</p>
                <div class="sync-data-pill">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>${count} project${count === 1 ? '' : 's'} saved on this device</span>
                </div>
                <div class="sync-modal-actions">
                    <button class="btn-sync-delete" id="sync-btn-delete">DELETE</button>
                    <button class="btn-sync-continue" id="sync-btn-continue">CONTINUE</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);

        // DELETE: Delete the local data regarding to the save projects locally
        const deleteBtn = document.getElementById('sync-btn-delete');
        deleteBtn.addEventListener('click', () => {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'DELETING...';

            if (typeof window.GuestSavedProjects !== 'undefined') {
                window.GuestSavedProjects.clear();
            }

            if (typeof showToast === 'function') {
                showToast('Locally saved projects deleted', 'info');
            }

            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                if (typeof onFinished === 'function') {
                    onFinished();
                }
            }, 350);
        });

        // CONTINUE: Save data to user project save in firebase firestore and delete local data
        const continueBtn = document.getElementById('sync-btn-continue');
        continueBtn.addEventListener('click', async () => {
            continueBtn.disabled = true;
            continueBtn.textContent = 'SYNCING...';

            try {
                if (typeof window.GuestSavedProjects !== 'undefined') {
                    await window.GuestSavedProjects.syncToFirestore(user.uid, db);
                }

                if (typeof showToast === 'function') {
                    showToast('Projects synced to your account successfully', 'success');
                }
            } catch (err) {
                console.error('Error syncing projects to Firestore:', err);
                if (typeof window.GuestSavedProjects !== 'undefined') {
                    window.GuestSavedProjects.clear();
                }
            }

            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                if (typeof onFinished === 'function') {
                    onFinished();
                }
            }, 350);
        });
    }

    window.showSyncPromptModal = showSyncPromptModal;
});

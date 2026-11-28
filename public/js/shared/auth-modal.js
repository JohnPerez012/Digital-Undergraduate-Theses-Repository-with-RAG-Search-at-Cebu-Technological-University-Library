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
        const loginBtnLabel = document.getElementById('login-btn-label');
        const loginBtnIcon = document.getElementById('login-btn-icon');
        const loginBtnSpinner = document.getElementById('login-btn-spinner');
        const loginModalForm = document.getElementById('login-modal-form');
        const googleLoginBtn = document.getElementById('google-login-btn');
        const googleBtnLabel = document.getElementById('google-btn-label');
        const emailError = document.getElementById('email-error');
        const passwordError = document.getElementById('password-error');
        const rememberMeCheckbox = document.getElementById('remember-me');
        const passwordToggleBtn = loginModal.querySelector('.toggle-password-btn');

        // Calm UX elements
        const domainTag = document.getElementById('login-domain-tag');
        const emailValidMark = document.getElementById('login-email-valid');
        const capsWarning = document.getElementById('login-caps-warning');
        const inlineAlert = document.getElementById('login-inline-alert');
        const alertTitle = document.getElementById('login-alert-title');
        const alertDesc = document.getElementById('login-alert-desc');

        // Sub-views inside the modal
        const forgotView = document.getElementById('login-forgot-view');
        const forgotTrigger = document.getElementById('login-forgot-trigger');
        const backToSignInBtn = document.getElementById('login-back-to-signin');
        const forgotEmailInput = document.getElementById('forgot-email-input');
        const forgotSubmitBtn = document.getElementById('forgot-submit-btn');
        const forgotBtnLabel = document.getElementById('forgot-btn-label');
        const forgotBtnSpinner = document.getElementById('forgot-btn-spinner');
        const forgotAlert = document.getElementById('forgot-inline-alert');
        const forgotAlertTitle = document.getElementById('forgot-alert-title');
        const forgotAlertDesc = document.getElementById('forgot-alert-desc');

        const successView = document.getElementById('login-success-view');
        const successNameEl = document.getElementById('login-success-name');
        const successRoleEl = document.getElementById('login-success-role');

        // Interactive Role Access Explorer on left dossier
        const roleAccessSpecs = {
            student: {
                title: 'Student Researcher',
                quota: '25 AI / day',
                items: [
                    'Semantic RAG search & citation exports (APA, MLA, IEEE)',
                    'Cloud thesis bookmarks & 3 saved research threads'
                ]
            },
            teacher: {
                title: 'Faculty / Adviser',
                quota: '50 AI / day',
                items: [
                    'Student capstone discovery & research tracking tools',
                    'Expanded daily AI quota & 3 saved research threads'
                ]
            },
            librarian: {
                title: 'Campus Librarian',
                quota: '150 AI / day',
                items: [
                    'Physical shelf cataloging, Tesseract OCR & 45s mutex guard',
                    'Staff Copilot RAG & Email 2FA security protection'
                ]
            },
            admin: {
                title: 'System Administrator',
                quota: '150 AI / day',
                items: [
                    'User governance, approvals queue & Pinecone batch sync',
                    'Repository analytics, audit trail & Staff Email 2FA'
                ]
            }
        };

        const roleTabs = loginModal.querySelectorAll('.login-role-tab[data-role]');
        const roleTitleEl = document.getElementById('login-role-title');
        const roleQuotaEl = document.getElementById('login-role-quota');
        const roleListEl = document.getElementById('login-role-list');

        roleTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const roleKey = tab.getAttribute('data-role');
                const spec = roleAccessSpecs[roleKey];
                if (!spec) return;

                roleTabs.forEach(t => {
                    const isActive = t === tab;
                    t.classList.toggle('active', isActive);
                    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });

                if (roleTitleEl) roleTitleEl.textContent = spec.title;
                if (roleQuotaEl) roleQuotaEl.textContent = spec.quota;
                if (roleListEl) {
                    roleListEl.innerHTML = '';
                    spec.items.forEach(text => {
                        const li = document.createElement('li');
                        li.textContent = text;
                        roleListEl.appendChild(li);
                    });
                }
            });
        });

        function switchLoginView(viewName) {
            const views = [
                { key: 'login', el: loginModalForm },
                { key: 'forgot', el: forgotView },
                { key: 'success', el: successView }
            ];
            views.forEach(({ key, el }) => {
                if (!el) return;
                const show = key === viewName;
                el.hidden = !show;
                el.classList.toggle('active', show);
            });
        }

        function setLoginLoading(isLoading) {
            if (loginBtn) loginBtn.disabled = isLoading;
            if (loginEmailInput) loginEmailInput.disabled = isLoading;
            if (loginPasswordInput) loginPasswordInput.disabled = isLoading;
            if (googleLoginBtn) {
                googleLoginBtn.style.pointerEvents = isLoading ? 'none' : '';
                googleLoginBtn.style.opacity = isLoading ? '0.6' : '';
                googleLoginBtn.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
            }
            if (loginBtnSpinner) loginBtnSpinner.hidden = !isLoading;
            if (loginBtnIcon) loginBtnIcon.hidden = isLoading;
            if (loginBtnLabel) loginBtnLabel.textContent = isLoading ? 'Verifying credentials...' : 'Sign In';
        }

        function setGoogleLoading(isLoading) {
            if (googleLoginBtn) {
                // Do NOT set googleLoginBtn.disabled = true here:
                // Disabling the button synchronously cancels the browser's user activation context,
                // causing Chrome/Edge/Firefox to block the popup with auth/popup-blocked.
                googleLoginBtn.style.pointerEvents = isLoading ? 'none' : '';
                googleLoginBtn.style.opacity = isLoading ? '0.75' : '';
                googleLoginBtn.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
            }
            if (loginBtn) loginBtn.disabled = isLoading;
            if (googleBtnLabel) googleBtnLabel.textContent = isLoading ? 'Connecting to Google...' : 'Sign in with Google';
        }

        function showInlineAlert(title, desc, isSuccess = false) {
            if (!inlineAlert) return;
            inlineAlert.classList.toggle('is-success', Boolean(isSuccess));
            if (alertTitle) alertTitle.textContent = title;
            if (alertDesc) alertDesc.textContent = desc;
            inlineAlert.hidden = false;
        }

        function hideInlineAlert() {
            if (inlineAlert) inlineAlert.hidden = true;
        }

        function showForgotAlert(title, desc, isSuccess = false) {
            if (!forgotAlert) return;
            forgotAlert.classList.toggle('is-success', Boolean(isSuccess));
            if (forgotAlertTitle) forgotAlertTitle.textContent = title;
            if (forgotAlertDesc) forgotAlertDesc.textContent = desc;
            forgotAlert.hidden = false;
        }

        function hideForgotAlert() {
            if (forgotAlert) forgotAlert.hidden = true;
        }

        function evaluateEmailIndicator() {
            if (!loginEmailInput) return;
            const val = loginEmailInput.value.trim();
            const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
            if (emailValidMark) emailValidMark.hidden = !isValid;
            if (domainTag) {
                if (val.toLowerCase().endsWith('@ctu.edu.ph')) {
                    domainTag.textContent = 'CTU Institutional';
                    domainTag.hidden = false;
                } else if (isValid) {
                    domainTag.textContent = 'Registered Email';
                    domainTag.hidden = false;
                } else {
                    domainTag.hidden = true;
                }
            }
        }

        function showSuccessHandoff(displayName, roleType, onComplete) {
            const roleLabels = {
                admin: 'Opening Administrator Dashboard...',
                librarian: 'Opening Librarian Workspace...',
                teacher: 'Opening Faculty Dashboard...',
                faculty: 'Opening Faculty Dashboard...',
                student: 'Opening Student Workspace...'
            };
            const cleanName = (displayName || 'Researcher').trim();
            if (successNameEl) successNameEl.textContent = `Welcome back, ${cleanName}`;
            if (successRoleEl) successRoleEl.textContent = roleLabels[(roleType || '').toLowerCase()] || 'Preparing your workspace...';

            switchLoginView('success');
            setTimeout(() => {
                closeModal();
                if (typeof onComplete === 'function') onComplete();
            }, 680);
        }

        // Open modal
        function openModal() {
            switchLoginView('login');
            clearErrors();
            setLoginLoading(false);
            setGoogleLoading(false);
            evaluateEmailIndicator();
            loginModal.classList.add('active');
            setTimeout(() => {
                if (loginEmailInput) {
                    loginEmailInput.focus();
                }
            }, 140);
        }

        // Auto-focus email input whenever the login modal becomes active
        const modalObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class' && loginModal.classList.contains('active')) {
                    switchLoginView('login');
                    setTimeout(() => {
                        if (loginEmailInput) {
                            loginEmailInput.focus();
                        }
                    }, 140);
                }
            });
        });
        modalObserver.observe(loginModal, { attributes: true, attributeFilter: ['class'] });

        // Close modal
        function closeModal() {
            loginModal.classList.remove('active');
            if (loginEmailInput) loginEmailInput.value = '';
            if (loginPasswordInput) {
                loginPasswordInput.value = '';
                loginPasswordInput.type = 'password';
            }
            if (capsWarning) capsWarning.hidden = true;
            if (domainTag) domainTag.hidden = true;
            if (emailValidMark) emailValidMark.hidden = true;
            clearErrors();
            hideForgotAlert();
            setLoginLoading(false);
            setGoogleLoading(false);
            switchLoginView('login');
        }

        // Clear all error states
        function clearErrors() {
            if (emailError) emailError.classList.remove('show');
            if (passwordError) passwordError.classList.remove('show');
            if (loginEmailInput) loginEmailInput.classList.remove('error');
            if (loginPasswordInput) loginPasswordInput.classList.remove('error');
            hideInlineAlert();
        }

        // Show calm persistent field error (clears when user types)
        function showFieldError(field, message) {
            const input = field === 'email' ? loginEmailInput : loginPasswordInput;
            const errorDiv = field === 'email' ? emailError : passwordError;
            if (input) input.classList.add('error');
            if (errorDiv) {
                errorDiv.textContent = message;
                errorDiv.classList.add('show');
            }
        }

        // Password toggle functionality
        if (passwordToggleBtn) {
            passwordToggleBtn.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const targetInput = document.getElementById(targetId);
                const eyeOpen = this.querySelector('.eye-open');
                const eyeClosed = this.querySelector('.eye-closed');
                if (!targetInput) return;

                if (targetInput.type === 'password') {
                    targetInput.type = 'text';
                    if (eyeOpen) eyeOpen.style.display = 'none';
                    if (eyeClosed) eyeClosed.style.display = 'block';
                } else {
                    targetInput.type = 'password';
                    if (eyeOpen) eyeOpen.style.display = 'block';
                    if (eyeClosed) eyeClosed.style.display = 'none';
                }
            });
        }

        // Clear errors & update indicators smoothly on input
        if (loginEmailInput) {
            loginEmailInput.addEventListener('input', () => {
                if (emailError) emailError.classList.remove('show');
                loginEmailInput.classList.remove('error');
                hideInlineAlert();
                evaluateEmailIndicator();
            });
        }

        if (loginPasswordInput) {
            const syncCapsState = (e) => {
                if (!capsWarning || typeof e.getModifierState !== 'function') return;
                capsWarning.hidden = !e.getModifierState('CapsLock');
            };
            loginPasswordInput.addEventListener('keydown', syncCapsState);
            loginPasswordInput.addEventListener('keyup', syncCapsState);
            loginPasswordInput.addEventListener('blur', () => {
                if (capsWarning) capsWarning.hidden = true;
            });
            loginPasswordInput.addEventListener('input', () => {
                if (passwordError) passwordError.classList.remove('show');
                loginPasswordInput.classList.remove('error');
                hideInlineAlert();
            });
        }

        // Inline Forgot Password Flow
        if (forgotTrigger) {
            forgotTrigger.addEventListener('click', () => {
                hideForgotAlert();
                if (forgotEmailInput && loginEmailInput) {
                    forgotEmailInput.value = loginEmailInput.value.trim();
                }
                switchLoginView('forgot');
                setTimeout(() => {
                    if (forgotEmailInput) forgotEmailInput.focus();
                }, 80);
            });
        }

        if (backToSignInBtn) {
            backToSignInBtn.addEventListener('click', () => {
                hideForgotAlert();
                switchLoginView('login');
                setTimeout(() => {
                    if (loginEmailInput) loginEmailInput.focus();
                }, 80);
            });
        }

        if (forgotView && forgotSubmitBtn) {
            forgotView.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideForgotAlert();
                const email = forgotEmailInput ? forgotEmailInput.value.trim() : '';
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    showForgotAlert('Valid email required', 'Please enter the email address associated with your RE-CAPS account.');
                    if (forgotEmailInput) forgotEmailInput.focus();
                    return;
                }

                forgotSubmitBtn.disabled = true;
                if (forgotBtnSpinner) forgotBtnSpinner.hidden = false;
                if (forgotBtnLabel) forgotBtnLabel.textContent = 'Sending recovery link...';

                try {
                    if (!auth || typeof auth.sendPasswordResetEmail !== 'function') {
                        throw new Error('Password recovery service is currently unavailable.');
                    }
                    await auth.sendPasswordResetEmail(email);
                    showForgotAlert(
                        'Recovery link sent',
                        `If an account matches ${email}, a password reset link has been sent to your inbox.`,
                        true
                    );
                } catch (resetErr) {
                    console.error('[Auth] Password reset error:', resetErr);
                    if (resetErr.code === 'auth/invalid-email') {
                        showForgotAlert('Invalid email format', 'Please double-check the email address and try again.');
                    } else if (resetErr.code === 'auth/too-many-requests') {
                        showForgotAlert('Please wait a moment', 'Too many reset requests were sent recently. Try again shortly.');
                    } else {
                        showForgotAlert('Could not send link', 'Please verify your connection and try again.');
                    }
                } finally {
                    forgotSubmitBtn.disabled = false;
                    if (forgotBtnSpinner) forgotBtnSpinner.hidden = true;
                    if (forgotBtnLabel) forgotBtnLabel.textContent = 'Send Recovery Link';
                }
            });
        }

        // Keyboard navigation: Enter on Email moves cursor directly to Password
        if (loginEmailInput) {
            loginEmailInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (loginPasswordInput) {
                        loginPasswordInput.focus();
                        if (loginPasswordInput.value) {
                            loginPasswordInput.select();
                        }
                    }
                }
            });
        }

        // Keyboard navigation: Enter on Password evaluates credentials via login button
        if (loginPasswordInput) {
            loginPasswordInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const email = loginEmailInput ? loginEmailInput.value.trim() : '';
                    const password = loginPasswordInput.value;

                    if (!email) {
                        if (loginEmailInput) loginEmailInput.focus();
                        showFieldError('email', 'Please enter your email address');
                        return;
                    }

                    if (!password) {
                        showFieldError('password', 'Please enter your password');
                        return;
                    }

                    if (loginBtn && !loginBtn.disabled) {
                        loginBtn.click();
                    }
                }
            });
        }

        // Event listeners
        if (loginModalForm) {
            loginModalForm.addEventListener('submit', function(e) {
                e.preventDefault();
                if (loginBtn && !loginBtn.disabled) {
                    loginBtn.click();
                }
            });
        }

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
                const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

                clearErrors();

                if (!email) {
                    showFieldError('email', 'Please enter your email address');
                    loginEmailInput.focus();
                    return;
                }

                if (!password) {
                    showFieldError('password', 'Please enter your password');
                    loginPasswordInput.focus();
                    return;
                }

                setLoginLoading(true);

                try {
                    let persistence = 'local';
                    try {
                        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
                            persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
                        } else {
                            persistence = rememberMe ? 'local' : 'session';
                        }
                        if (auth && typeof auth.setPersistence === 'function') {
                            await auth.setPersistence(persistence);
                        }
                    } catch (persistErr) {
                        console.warn('[Auth] Persistence setup skipped:', persistErr);
                    }

                    if (!auth || typeof auth.signInWithEmailAndPassword !== 'function') {
                        throw new Error('Authentication service is currently unavailable. Please check your internet connection or reload the page.');
                    }

                    const userCredential = await auth.signInWithEmailAndPassword(email, password);
                    const user = userCredential.user;

                    const serverTimestampVal = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue && typeof firebase.firestore.FieldValue.serverTimestamp === 'function')
                        ? firebase.firestore.FieldValue.serverTimestamp()
                        : new Date().toISOString();

                    if (db && typeof db.collection === 'function') {
                        try {
                            await db.collection('users').doc(user.uid).update({
                                lastLogin: serverTimestampVal
                            });
                        } catch (updErr) {
                            console.warn('[Auth] Failed to update lastLogin:', updErr);
                        }
                    }

                    let userData = null;
                    if (db && typeof db.collection === 'function') {
                        const userDoc = await db.collection('users').doc(user.uid).get();
                        userData = (userDoc && typeof userDoc.data === 'function') ? userDoc.data() : null;
                    }

                    if (userData) {
                        if (userData.status === 'suspended') {
                            await auth.signOut();
                            sessionStorage.clear();
                            setLoginLoading(false);
                            const reason = userData.suspensionReason || 'Academic/institutional policy violation';
                            const duration = userData.suspendedDuration ? ` (${userData.suspendedDuration})` : '';
                            showInlineAlert(
                                `Account Suspended${duration}`,
                                `Access has been temporarily restricted by Library Administration (${reason}). Contact the CTU Daanbantayan Library Office for assistance.`
                            );
                            return;
                        }
                        if (userData.status === 'quarantined') {
                            await auth.signOut();
                            sessionStorage.clear();
                            setLoginLoading(false);
                            const reason = userData.deletionReason || 'Administrative request';
                            showInlineAlert(
                                'Account Quarantined',
                                `This account is scheduled for deletion (${reason}). Contact Library Administration within the 14-day grace period to restore access.`
                            );
                            return;
                        }
                        if (userData.deletionScheduled || userData.accountStatus === 'pending_deletion') {
                            const now = Date.now();
                            const scheduledTime = userData.scheduledDeletionTimestamp || 0;
                            if (scheduledTime > 0 && now >= scheduledTime) {
                                await auth.signOut();
                                sessionStorage.clear();
                                setLoginLoading(false);
                                const days = userData.deletionGraceDays || 15;
                                showInlineAlert(
                                    'Account Grace Period Expired',
                                    `The ${days}-day recovery window has expired and this account is marked for deletion. Contact Library Administration for inquiries.`
                                );
                                return;
                            } else {
                                // Logging in cancels and clears the deletion timer
                                try {
                                    const deleteFieldVal = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue && typeof firebase.firestore.FieldValue.delete === 'function')
                                        ? firebase.firestore.FieldValue.delete()
                                        : null;
                                    await db.collection('users').doc(user.uid).update({
                                        deletionScheduled: deleteFieldVal,
                                        scheduledDeletionTimestamp: deleteFieldVal,
                                        deletionGraceDays: deleteFieldVal,
                                        deletionReason: deleteFieldVal,
                                        deletionRequestedAt: deleteFieldVal,
                                        accountStatus: 'active'
                                    });
                                    localStorage.removeItem('recaps_account_pending_deletion_' + user.uid);
                                    userData.deletionScheduled = false;
                                    userData.accountStatus = 'active';
                                    console.log('[Auth] Deletion timer removed upon user login.');
                                } catch (delErr) {
                                    console.warn('[Auth] Failed to reset deletion fields on login:', delErr);
                                }
                            }
                        }
                    }

                    const resolvedRole = (userData && userData.userType) || 'student';
                    const resolvedName = user.displayName || (userData && (userData.fullName || userData.displayName)) || email.split('@')[0];

                    sessionStorage.setItem('userId', user.uid);
                    sessionStorage.setItem('userEmail', user.email);
                    sessionStorage.setItem('userName', resolvedName);
                    sessionStorage.setItem('userType', resolvedRole);

                    window.dispatchEvent(new CustomEvent('authRoleUpdated', { detail: { role: resolvedRole } }));

                    if (typeof window.ActivityService !== 'undefined') {
                        window.ActivityService.logAuth('login', `Signed in via email as ${resolvedRole}`);
                    }
                    if (window.DeviceManager && typeof window.DeviceManager.registerCurrentDevice === 'function') {
                        window.DeviceManager.registerCurrentDevice({ isFreshLogin: true }).catch(() => {});
                    }

                    const proceedWithLogin = () => {
                        AuthService.redirectAfterLogin(
                            resolvedRole,
                            resolvedName,
                            showWelcomeModal
                        );
                    };

                    showSuccessHandoff(resolvedName, resolvedRole, () => {
                        if (resolvedRole !== 'admin' && typeof window.GuestSavedProjects !== 'undefined' && window.GuestSavedProjects.hasSaved()) {
                            showSyncPromptModal(user, userData || { userType: resolvedRole }, proceedWithLogin);
                        } else {
                            proceedWithLogin();
                        }
                    });

                } catch (error) {
                    console.error('Login error:', error);
                    setLoginLoading(false);

                    if (error.code === 'auth/user-not-found') {
                        showFieldError('email', 'No account found with this email address.');
                        showInlineAlert('Account not found', 'Check your email spelling or create a new RE-CAPS account below.');
                    } else if (error.code === 'auth/wrong-password') {
                        showFieldError('password', 'Incorrect password.');
                        showInlineAlert('Incorrect password', 'Please try again or use "Forgot password?" to reset access.');
                    } else if (error.code === 'auth/invalid-email') {
                        showFieldError('email', 'Invalid email address format.');
                    } else if (error.code === 'auth/too-many-requests') {
                        showInlineAlert('Temporarily paused', 'Too many unsuccessful sign-in attempts. Please wait a few minutes before trying again.');
                    } else if (error.code === 'auth/invalid-credential') {
                        showFieldError('password', 'Check your email or password.');
                        showInlineAlert('Invalid email or password', 'Double-check your credentials or reset your password if needed.');
                    } else {
                        showInlineAlert('Unable to sign in', 'Please check your connection and try again.');
                    }
                }
            });
        }

        // Reusable Google Auth success handler (supports both popup and redirect results)
        async function processGoogleAuthSuccess(user) {
            let userDoc = null;
            if (db && typeof db.collection === 'function') {
                userDoc = await db.collection('users').doc(user.uid).get();
            }

            if (!userDoc || !userDoc.exists) {
                if (auth && typeof auth.signOut === 'function') {
                    await auth.signOut();
                }
                setGoogleLoading(false);
                showNoAccountModal();
                return;
            }

            const serverTimestampVal = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue && typeof firebase.firestore.FieldValue.serverTimestamp === 'function')
                ? firebase.firestore.FieldValue.serverTimestamp()
                : new Date().toISOString();

            if (db && typeof db.collection === 'function') {
                try {
                    await db.collection('users').doc(user.uid).update({
                        lastLogin: serverTimestampVal
                    });
                } catch (updErr) {
                    console.warn('[Auth] Failed to update lastLogin on Google login:', updErr);
                }
            }

            const userData = userDoc.data();

            if (userData) {
                if (userData.status === 'suspended') {
                    await auth.signOut();
                    sessionStorage.clear();
                    setGoogleLoading(false);
                    const reason = userData.suspensionReason || 'Academic/institutional policy violation';
                    const duration = userData.suspendedDuration ? ` (${userData.suspendedDuration})` : '';
                    showInlineAlert(
                        `Account Suspended${duration}`,
                        `Access has been temporarily restricted by Library Administration (${reason}). Contact the CTU Daanbantayan Library Office for assistance.`
                    );
                    return;
                }
                if (userData.status === 'quarantined') {
                    await auth.signOut();
                    sessionStorage.clear();
                    setGoogleLoading(false);
                    const reason = userData.deletionReason || 'Administrative request';
                    showInlineAlert(
                        'Account Quarantined',
                        `This account is scheduled for deletion (${reason}). Contact Library Administration within the 14-day grace period to restore access.`
                    );
                    return;
                }
                if (userData.deletionScheduled || userData.accountStatus === 'pending_deletion') {
                    const now = Date.now();
                    const scheduledTime = userData.scheduledDeletionTimestamp || 0;
                    if (scheduledTime > 0 && now >= scheduledTime) {
                        await auth.signOut();
                        sessionStorage.clear();
                        setGoogleLoading(false);
                        const days = userData.deletionGraceDays || 15;
                        showInlineAlert(
                            'Account Grace Period Expired',
                            `The ${days}-day recovery window has expired and this account is marked for deletion. Contact Library Administration for inquiries.`
                        );
                        return;
                    } else {
                        // Logging in cancels and clears the deletion timer
                        try {
                            const deleteFieldVal = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue && typeof firebase.firestore.FieldValue.delete === 'function')
                                ? firebase.firestore.FieldValue.delete()
                                : null;
                            await db.collection('users').doc(user.uid).update({
                                deletionScheduled: deleteFieldVal,
                                scheduledDeletionTimestamp: deleteFieldVal,
                                deletionGraceDays: deleteFieldVal,
                                deletionReason: deleteFieldVal,
                                deletionRequestedAt: deleteFieldVal,
                                accountStatus: 'active'
                            });
                            localStorage.removeItem('recaps_account_pending_deletion_' + user.uid);
                            userData.deletionScheduled = false;
                            userData.accountStatus = 'active';
                            console.log('[Auth] Deletion timer removed upon Google user login.');
                        } catch (delErr) {
                            console.warn('[Auth] Failed to reset deletion fields on Google login:', delErr);
                        }
                    }
                }
            }

            const resolvedRole = (userData && userData.userType) || 'student';
            const resolvedName = user.displayName || (userData && (userData.fullName || userData.displayName)) || user.email.split('@')[0];

            sessionStorage.setItem('userId', user.uid);
            sessionStorage.setItem('userEmail', user.email);
            sessionStorage.setItem('userName', resolvedName);
            sessionStorage.setItem('userType', resolvedRole);

            window.dispatchEvent(new CustomEvent('authRoleUpdated', { detail: { role: resolvedRole } }));

            if (typeof window.ActivityService !== 'undefined') {
                window.ActivityService.logAuth('login', `Signed in via Google as ${resolvedRole}`);
            }
            if (window.DeviceManager && typeof window.DeviceManager.registerCurrentDevice === 'function') {
                window.DeviceManager.registerCurrentDevice({ isFreshLogin: true }).catch(() => {});
            }

            const proceedWithLogin = () => {
                AuthService.redirectAfterLogin(
                    resolvedRole,
                    resolvedName,
                    showWelcomeModal
                );
            };

            showSuccessHandoff(resolvedName, resolvedRole, () => {
                if (resolvedRole !== 'admin' && typeof window.GuestSavedProjects !== 'undefined' && window.GuestSavedProjects.hasSaved()) {
                    showSyncPromptModal(user, userData || { userType: resolvedRole }, proceedWithLogin);
                } else {
                    proceedWithLogin();
                }
            });
        }

        // Check for Google redirect sign-in result when returning from redirect
        if (auth && typeof auth.getRedirectResult === 'function') {
            auth.getRedirectResult().then(async (result) => {
                if (result && result.user) {
                    console.log('[Auth] Processing Google Redirect sign-in result for:', result.user.email);
                    sessionStorage.removeItem('recaps_google_redirect_pending');
                    setGoogleLoading(true);
                    await processGoogleAuthSuccess(result.user);
                }
            }).catch((redirErr) => {
                sessionStorage.removeItem('recaps_google_redirect_pending');
                if (redirErr && redirErr.code !== 'auth/credential-already-in-use') {
                    console.warn('[Auth] getRedirectResult check:', redirErr.message || redirErr);
                    showInlineAlert('Google Sign-In paused', redirErr.message || 'Could not complete Google authentication.');
                }
            });
        }

        // Google Sign-In Login
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                clearErrors();
                setGoogleLoading(true);

                try {
                    if (typeof firebase === 'undefined' || !firebase.auth || !firebase.auth.GoogleAuthProvider) {
                        throw new Error('Google Sign-In is unavailable because Firebase Auth SDK could not be loaded.');
                    }
                    const provider = new firebase.auth.GoogleAuthProvider();
                    provider.addScope('email');
                    provider.addScope('profile');
                    provider.setCustomParameters({ prompt: 'select_account' });

                    if (!auth || typeof auth.signInWithPopup !== 'function') {
                        throw new Error('Authentication service is currently unavailable.');
                    }

                    let result = null;
                    try {
                        result = await auth.signInWithPopup(provider);
                    } catch (popupErr) {
                        const isPopupBlocked = popupErr.code === 'auth/popup-blocked' ||
                                             popupErr.code === 'auth/cancelled-popup-request' ||
                                             (popupErr.message && popupErr.message.toLowerCase().includes('popup')) ||
                                             (popupErr.message && popupErr.message.toLowerCase().includes('network error'));

                        if (popupErr.code === 'auth/popup-closed-by-user') {
                            setGoogleLoading(false);
                            return;
                        }

                        // Automatically fall back to signInWithRedirect when popups are blocked or cross-origin connection fails
                        if (isPopupBlocked && typeof auth.signInWithRedirect === 'function') {
                            console.warn('[Auth] Popup blocked or failed connection. Seamlessly falling back to signInWithRedirect:', popupErr);
                            showInlineAlert(
                                'Redirecting to Google...',
                                'Popup was blocked by your browser. Redirecting you directly to Google Sign-In...'
                            );
                            sessionStorage.setItem('recaps_google_redirect_pending', 'true');
                            setTimeout(async () => {
                                try {
                                    await auth.signInWithRedirect(provider);
                                } catch (redirErr) {
                                    console.error('[Auth] signInWithRedirect error:', redirErr);
                                    setGoogleLoading(false);
                                    showInlineAlert('Sign-In Paused', 'Popup was blocked. Please allow popups or use email and password to sign in.');
                                }
                            }, 350);
                            return;
                        }

                        throw popupErr;
                    }

                    if (result && result.user) {
                        await processGoogleAuthSuccess(result.user);
                    }

                } catch (error) {
                    console.error('Google Sign-In error:', error);
                    setGoogleLoading(false);

                    const isPopupIssue = error.code === 'auth/popup-blocked' ||
                                         error.code === 'auth/cancelled-popup-request' ||
                                         (error.message && error.message.toLowerCase().includes('popup'));

                    if (error.code === 'auth/popup-closed-by-user') {
                        return;
                    } else if (isPopupIssue) {
                        showInlineAlert('Popup blocked', 'Allow popups for this site or sign in using your email and password above.');
                    } else {
                        showInlineAlert('Google Sign-In paused', 'Could not complete Google authentication. Please try again.');
                    }
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
            if (window.ViewManager && typeof window.ViewManager.updateSecondaryNavSavedCount === 'function') {
                window.ViewManager.updateSecondaryNavSavedCount();
            }
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

        // Saved Projects Row Navigation (directs logged-in users to their personal dashboard saved section)
        const pdSavedRow = document.getElementById('pd-saved-row');
        if (pdSavedRow) {
            pdSavedRow.addEventListener('click', async (e) => {
                e.preventDefault();
                closeDropdown();
                let userType = sessionStorage.getItem('userType') || localStorage.getItem('userType');
                if (!userType && window.AuthService) {
                    userType = await AuthService.getUserType();
                }
                if (userType === 'admin' || userType === 'librarian') {
                    // Librarians and admins cannot save projects
                    return;
                }
                const isSubpage = window.location.pathname.includes('/pages/');
                let targetUrl = '';
                if (userType === 'student') {
                    targetUrl = isSubpage ? 'student_page.html#saved' : 'pages/student_page.html#saved';
                } else if (userType === 'teacher') {
                    targetUrl = isSubpage ? 'teacher_page.html#saved' : 'pages/teacher_page.html#saved';
                } else {
                    targetUrl = isSubpage ? 'student_page.html#saved' : 'pages/student_page.html#saved';
                }

                // If already on the target page, trigger rail switch directly
                const currentPage = window.location.pathname.split('/').pop();
                const targetPage = targetUrl.split('#')[0].split('/').pop();
                if (currentPage === targetPage) {
                    const savedNav = document.querySelector('.rail-nav-item[data-section="saved"]');
                    if (savedNav) savedNav.click();
                    else window.location.hash = '#saved';
                } else {
                    window.location.href = targetUrl;
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
    async function updateHeader(user) {
        const themeToggleBtn = document.getElementById('theme-toggle');
        const aboutNavLink = document.getElementById('about-nav-link');
        const pdSavedRow = document.getElementById('pd-saved-row');
        const pdSavedDivider = document.getElementById('pd-saved-divider');

        if (user) {
            localStorage.setItem('cachedAuthState', 'true');
            if (loginNavLink) loginNavLink.style.display = 'none';
            if (profileLink) profileLink.style.display = 'block';
            if (profileImg) profileImg.src = user.photoURL || profileImg.src;
            if (avatarImg) avatarImg.src = user.photoURL || avatarImg.src;
            if (themeToggleBtn) themeToggleBtn.style.display = 'none';
            if (aboutNavLink) aboutNavLink.style.display = 'none'; // moved into dropdown

            let userRole = sessionStorage.getItem('userType') || localStorage.getItem('userType');
            if (!userRole && window.AuthService) {
                try {
                    userRole = await AuthService.getUserType(user.uid);
                } catch (e) {}
            }
            if (userRole) {
                sessionStorage.setItem('userType', userRole);
                localStorage.setItem('userType', userRole);
                document.documentElement.classList.add(`role-${userRole}`);
                document.documentElement.setAttribute('data-user-role', userRole);
            }

            const isRestricted = userRole === 'admin' || userRole === 'librarian';

            // Show Saved Projects row inside profile dropdown ONLY for roles that can save projects (student, teacher)
            if (pdSavedRow) {
                if (isRestricted) {
                    pdSavedRow.style.setProperty('display', 'none', 'important');
                    pdSavedRow.classList.add('role-hidden');
                } else {
                    pdSavedRow.style.removeProperty('display');
                    pdSavedRow.style.display = 'flex';
                    pdSavedRow.classList.remove('role-hidden');
                }
            }
            if (pdSavedDivider) {
                if (isRestricted) {
                    pdSavedDivider.style.setProperty('display', 'none', 'important');
                    pdSavedDivider.classList.add('role-hidden');
                } else {
                    pdSavedDivider.style.removeProperty('display');
                    pdSavedDivider.style.display = 'block';
                    pdSavedDivider.classList.remove('role-hidden');
                }
            }

            if (window.ViewManager && typeof window.ViewManager.updateSecondaryNavSavedCount === 'function') {
                window.ViewManager.updateSecondaryNavSavedCount();
            }
        } else {
            localStorage.removeItem('cachedAuthState');
            localStorage.removeItem('userType');
            ['student', 'teacher', 'librarian', 'admin'].forEach(r => {
                document.documentElement.classList.remove(`role-${r}`);
            });
            document.documentElement.removeAttribute('data-user-role');
            if (loginNavLink) loginNavLink.style.display = 'block';
            if (profileLink) profileLink.style.display = 'none';
            if (themeToggleBtn) themeToggleBtn.style.display = 'block';
            if (aboutNavLink) aboutNavLink.style.display = 'flex'; // show when logged out

            // ANONYMOUS: Hide Saved Projects row from profile dropdown
            if (pdSavedRow) {
                pdSavedRow.style.setProperty('display', 'none', 'important');
                pdSavedRow.classList.add('role-hidden');
            }
            if (pdSavedDivider) {
                pdSavedDivider.style.setProperty('display', 'none', 'important');
                pdSavedDivider.classList.add('role-hidden');
            }

            if (window.ViewManager && typeof window.ViewManager.updateSecondaryNavSavedCount === 'function') {
                window.ViewManager.updateSecondaryNavSavedCount();
            }
        }
    }

    // Check auth state changes
    const authInstance = (typeof auth !== 'undefined' && auth) ? auth : (typeof window !== 'undefined' ? window.auth : null);
    if (authInstance && typeof authInstance.onAuthStateChanged === 'function') {
        authInstance.onAuthStateChanged(async (user) => {
            if (user) {
                let userRole = sessionStorage.getItem('userType') || localStorage.getItem('userType');
                if (!userRole && window.AuthService) {
                    try {
                        userRole = await AuthService.getUserType(user.uid);
                    } catch (e) {}
                }
                if (userRole) {
                    sessionStorage.setItem('userType', userRole);
                    localStorage.setItem('userType', userRole);
                    document.documentElement.classList.add(`role-${userRole}`);
                    document.documentElement.setAttribute('data-user-role', userRole);
                }
            }
            await updateHeader(user);
            
            if (user) {
                if (userName) {
                    userName.textContent = user.displayName || sessionStorage.getItem('userName') || "User";
                }
                // Pre-fetch and cache user profile in session storage
                if (window.AuthService) {
                    const fetchedRole = await AuthService.getUserType(user.uid);
                    if (fetchedRole) {
                        sessionStorage.setItem('userType', fetchedRole);
                        localStorage.setItem('userType', fetchedRole);
                        document.documentElement.classList.add(`role-${fetchedRole}`);
                        document.documentElement.setAttribute('data-user-role', fetchedRole);
                        await updateHeader(user);
                        if (window.ViewManager && typeof window.ViewManager.syncSavedNavVisibility === 'function') {
                            window.ViewManager.syncSavedNavVisibility(user);
                        }
                    }
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="welcome-modal-svg">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                </div>
                <h2 class="welcome-modal-title">Welcome back, <span>${safeName}</span>!</h2>
                <p class="welcome-modal-text">We're glad to see you again. Ready to dive into your capstone research?</p>
                <button class="welcome-modal-btn" id="welcome-lets-go-btn">Continue</button>
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
        overlay.className = 'welcome-modal-overlay no-account-modal-overlay';
        
        overlay.innerHTML = `
            <div class="welcome-modal-content no-account-modal-content">
                <div class="no-account-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="no-account-svg">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <circle cx="17.5" cy="10.5" r="3.5"></circle>
                        <line x1="20" y1="13" x2="22" y2="15"></line>
                    </svg>
                </div>
                <h2 class="no-account-title">No Account Found</h2>
                <p class="no-account-text">The Google account you used is not registered in our system. Please register first to access RE-CAPS.</p>
                <div class="no-account-buttons">
                    <button class="no-account-btn-secondary" id="no-account-back-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>
                        <span>Back to Login</span>
                    </button>
                    <button class="no-account-btn-primary" id="no-account-register-btn">
                        <span>Register Now</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </button>
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
        // Admins cannot save or sync projects
        if (userData && userData.userType === 'admin') {
            if (typeof onFinished === 'function') onFinished();
            return;
        }

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

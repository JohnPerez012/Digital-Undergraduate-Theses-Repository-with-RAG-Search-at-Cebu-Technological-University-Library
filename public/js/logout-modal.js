/**
 * Logout Confirmation Modal
 * Provides a reusable confirmation dialog for logout actions
 */

class LogoutModal {
    constructor() {
        this.modal = null;
        this.abortCallback = null;
        this.confirmCallback = null;
        this.isProcessing = false;
        this.init();
    }

    init() {
        // Create modal HTML structure
        const modalHTML = `
            <div class="logout-modal" id="logout-confirmation-modal">
                <div class="logout-modal-overlay"></div>
                <div class="logout-modal-content">
                    <div class="logout-modal-header">
                        <div class="logout-modal-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                        </div>
                        <h3 class="logout-modal-title">Confirm Logout</h3>
                        <p class="logout-modal-description">Are you sure you want to log out? You will need to sign in again to access your account.</p>
                    </div>
                    <div class="logout-modal-actions">
                        <button type="button" class="logout-modal-btn logout-modal-btn-abort" id="logout-abort-btn">
                            <span>Cancel</span>
                        </button>
                        <button type="button" class="logout-modal-btn logout-modal-btn-confirm" id="logout-confirm-btn">
                            <span class="btn-text">Logout</span>
                            <span class="btn-spinner" style="display: none;">
                                <svg class="spinner-icon" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3"></circle>
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Inject modal into body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        this.modal = document.getElementById('logout-confirmation-modal');
        this.overlay = this.modal.querySelector('.logout-modal-overlay');
        this.abortBtn = document.getElementById('logout-abort-btn');
        this.confirmBtn = document.getElementById('logout-confirm-btn');
        this.btnText = this.confirmBtn.querySelector('.btn-text');
        this.btnSpinner = this.confirmBtn.querySelector('.btn-spinner');

        this.attachEventListeners();
    }

    attachEventListeners() {
        // Abort button - strict: only closes modal, does nothing else
        this.abortBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent action if processing
            if (this.isProcessing) {
                return;
            }
            
            this.close();
            
            // Call abort callback if provided
            if (this.abortCallback && typeof this.abortCallback === 'function') {
                this.abortCallback();
            }
        });

        // Confirm button - strict: executes logout only
        this.confirmBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent double-clicking
            if (this.isProcessing) {
                return;
            }
            
            // Execute logout
            await this.executeLogout();
        });

        // Overlay click - treat as abort
        this.overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent closing if processing
            if (this.isProcessing) {
                return;
            }
            
            this.close();
            
            if (this.abortCallback && typeof this.abortCallback === 'function') {
                this.abortCallback();
            }
        });

        // ESC key - treat as abort
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active') && !this.isProcessing) {
                this.close();
                
                if (this.abortCallback && typeof this.abortCallback === 'function') {
                    this.abortCallback();
                }
            }
        });
    }

    async executeLogout() {
        this.isProcessing = true;
        
        // Disable both buttons
        this.abortBtn.disabled = true;
        this.confirmBtn.disabled = true;
        
        // Show loading state
        this.btnText.style.display = 'none';
        this.btnSpinner.style.display = 'inline-block';

        try {
            // Call confirm callback if provided
            if (this.confirmCallback && typeof this.confirmCallback === 'function') {
                await this.confirmCallback();
            } else {
                // Default logout behavior
                await this.defaultLogout();
            }
        } catch (error) {
            console.error('Logout execution error:', error);
            
            // Show error toast if available
            if (window.showToast) {
                showToast('Error logging out. Please try again.', '❌');
            } else {
                alert('Error logging out. Please try again.');
            }
            
            // Re-enable buttons on error
            this.abortBtn.disabled = false;
            this.confirmBtn.disabled = false;
            this.btnText.style.display = 'inline';
            this.btnSpinner.style.display = 'none';
            this.isProcessing = false;
        }
    }

    async defaultLogout() {
        // Clear session storage
        sessionStorage.clear();
        
        // Clear specific localStorage items
        localStorage.removeItem('cachedAuthState');
        
        // Firebase sign out
        if (window.firebase && firebase.auth) {
            await firebase.auth().signOut();
        }
        
        // Show success message if toast available
        if (window.showToast) {
            showToast('Logged out successfully', '✅');
        }
        
        // Redirect after short delay
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 800);
    }

    show(options = {}) {
        // Reset state
        this.isProcessing = false;
        this.abortBtn.disabled = false;
        this.confirmBtn.disabled = false;
        this.btnText.style.display = 'inline';
        this.btnSpinner.style.display = 'none';
        
        // Set callbacks
        this.abortCallback = options.onAbort || null;
        this.confirmCallback = options.onConfirm || null;
        
        // Show modal
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus on abort button (safe default)
        setTimeout(() => {
            this.abortBtn.focus();
        }, 100);
    }

    close() {
        if (this.isProcessing) {
            return; // Prevent closing during processing
        }
        
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Reset callbacks
        this.abortCallback = null;
        this.confirmCallback = null;
    }
}

// Initialize global instance
let logoutModalInstance = null;

function getLogoutModal() {
    if (!logoutModalInstance) {
        logoutModalInstance = new LogoutModal();
    }
    return logoutModalInstance;
}

// Export for use in other scripts
window.LogoutModal = LogoutModal;
window.getLogoutModal = getLogoutModal;

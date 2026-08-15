/**
 * Network Status Monitor
 * Monitors internet connection and displays toast notifications for connectivity issues
 */

class NetworkMonitor {
    constructor() {
        this.isOnline = navigator.onLine;
        this.connectionQuality = 'good';
        this.checkInterval = null;
        this.lastNotificationTime = 0;
        this.notificationCooldown = 5000; // 5 seconds between notifications
        this.toastId = null;
        
        this.init();
    }

    init() {
        // Listen for online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Check connection quality periodically when online
        this.startConnectionQualityCheck();
        
        // Initial check
        this.checkConnectionStatus();
    }

    handleOnline() {
        this.isOnline = true;
        this.connectionQuality = 'good';
        
        // Clear any existing offline toast
        if (this.toastId) {
            this.removeToast(this.toastId);
            this.toastId = null;
        }
        
        this.showToast('🌐 You\'re back online!', 'success', 3000);
        this.startConnectionQualityCheck();
    }

    handleOffline() {
        this.isOnline = false;
        this.connectionQuality = 'offline';
        
        // Clear any existing toast
        if (this.toastId) {
            this.removeToast(this.toastId);
        }
        
        // Show persistent offline toast
        this.toastId = this.showToast(
            '❌ No internet connection. Some features may not work properly.',
            'error',
            null // persistent
        );
        
        this.stopConnectionQualityCheck();
    }

    async checkConnectionQuality() {
        if (!this.isOnline) return;

        const startTime = Date.now();
        const timeout = 5000; // 5 second timeout
        
        try {
            // Try to fetch a small resource with cache-busting
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch('/assets/logo.png?t=' + Date.now(), {
                method: 'HEAD',
                cache: 'no-cache',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;
            
            if (response.ok) {
                this.evaluateConnectionSpeed(responseTime);
            } else {
                this.connectionQuality = 'poor';
                this.notifyConnectionIssue('poor');
            }
        } catch (error) {
            // Connection failed or timed out
            if (error.name === 'AbortError') {
                this.connectionQuality = 'poor';
                this.notifyConnectionIssue('slow');
            } else {
                this.connectionQuality = 'poor';
                this.notifyConnectionIssue('poor');
            }
        }
    }

    evaluateConnectionSpeed(responseTime) {
        const previousQuality = this.connectionQuality;
        
        if (responseTime < 1000) {
            this.connectionQuality = 'good';
        } else if (responseTime < 3000) {
            this.connectionQuality = 'moderate';
            if (previousQuality === 'good') {
                this.notifyConnectionIssue('moderate');
            }
        } else {
            this.connectionQuality = 'poor';
            if (previousQuality !== 'poor') {
                this.notifyConnectionIssue('slow');
            }
        }
    }

    notifyConnectionIssue(type) {
        const now = Date.now();
        
        // Prevent spam notifications
        if (now - this.lastNotificationTime < this.notificationCooldown) {
            return;
        }
        
        this.lastNotificationTime = now;
        
        // Clear previous network toast if exists
        if (this.toastId) {
            this.removeToast(this.toastId);
        }
        
        let message = '';
        let duration = 5000;
        
        switch (type) {
            case 'slow':
                message = '⚠️ Slow internet connection detected. Loading may take longer than usual.';
                duration = 6000;
                break;
            case 'moderate':
                message = '⚠️ Internet connection is slower than normal. Some features may be affected.';
                duration = 5000;
                break;
            case 'poor':
                message = '⚠️ Poor internet connection. Features may not work properly.';
                duration = 7000;
                break;
        }
        
        if (message) {
            this.toastId = this.showToast(message, 'warning', duration);
        }
    }

    checkConnectionStatus() {
        if (navigator.onLine) {
            this.checkConnectionQuality();
        } else {
            this.handleOffline();
        }
    }

    startConnectionQualityCheck() {
        // Clear existing interval
        this.stopConnectionQualityCheck();
        
        // Check every 30 seconds
        this.checkInterval = setInterval(() => {
            this.checkConnectionQuality();
        }, 30000);
    }

    stopConnectionQualityCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    showToast(message, type = 'info', duration = 5000) {
        // Create toast container if it doesn't exist
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast element
        const toast = document.createElement('div');
        const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        toast.className = `toast toast-${type}`;
        toast.dataset.toastId = toastId;
        
        toast.innerHTML = `
            <div class="toast-message">${message}</div>
            <button class="toast-close" aria-label="Close notification">&times;</button>
        `;

        // Add close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toastId);
            if (this.toastId === toastId) {
                this.toastId = null;
            }
        });

        // Add to container
        container.appendChild(toast);

        // Auto remove after duration (if specified)
        if (duration) {
            setTimeout(() => {
                this.removeToast(toastId);
                if (this.toastId === toastId) {
                    this.toastId = null;
                }
            }, duration);
        }

        return toastId;
    }

    removeToast(toastId) {
        const toast = document.querySelector(`[data-toast-id="${toastId}"]`);
        if (toast && !toast.classList.contains('removing')) {
            toast.classList.add('removing');
            setTimeout(() => {
                toast.remove();
            }, 500);
        }
    }

    // Public method to manually check connection
    checkNow() {
        this.checkConnectionStatus();
    }

    // Get current connection status
    getStatus() {
        return {
            isOnline: this.isOnline,
            quality: this.connectionQuality
        };
    }
}

// Initialize network monitor when DOM is ready
let networkMonitor;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        networkMonitor = new NetworkMonitor();
    });
} else {
    networkMonitor = new NetworkMonitor();
}

// Export for use in other modules
window.NetworkMonitor = networkMonitor;

/**
 * Dashboard Rail Navigation System
 * Handles sidebar rail interactions for all role dashboards
 */

(function() {
    'use strict';

    // Wait for DOM to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeDashboardRail();
    });

    function initializeDashboardRail() {
        // Get DOM elements
        const sidebarRail = document.getElementById('sidebar-rail');
        const railOverlay = document.getElementById('rail-overlay');
        const mobileToggle = document.getElementById('mobile-rail-toggle');
        const navItems = document.querySelectorAll('.rail-nav-item[data-section]');
        const contentSections = document.querySelectorAll('.content-section');
        const pageTitle = document.getElementById('page-title');

        // Mobile toggle functionality
        if (mobileToggle && sidebarRail && railOverlay) {
            mobileToggle.addEventListener('click', function() {
                toggleMobileMenu();
            });

            railOverlay.addEventListener('click', function() {
                closeMobileMenu();
            });
        }

        // Navigation item click handling
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                
                const sectionId = this.getAttribute('data-section');
                
                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
                
                // Show corresponding content section
                contentSections.forEach(section => {
                    section.classList.remove('active');
                });
                
                const targetSection = document.getElementById('section-' + sectionId);
                if (targetSection) {
                    targetSection.classList.add('active');
                }
                
                // Update page title
                if (pageTitle) {
                    const navText = this.querySelector('.rail-nav-text');
                    if (navText) {
                        pageTitle.textContent = navText.textContent;
                    }
                }
                
                // Close mobile menu if open
                if (window.innerWidth <= 1024) {
                    closeMobileMenu();
                }
                
                // Scroll to top of content
                const dashboardContent = document.querySelector('.dashboard-content');
                if (dashboardContent) {
                    dashboardContent.scrollTop = 0;
                }
            });
        });

        // Theme toggle functionality
        const themeToggle = document.querySelector('[id^="theme-toggle"]');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Logout button functionality
        const logoutBtn = document.querySelector('[id$="-logout-btn"]');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Handle keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // ESC to close mobile menu
            if (e.key === 'Escape' && sidebarRail && sidebarRail.classList.contains('mobile-open')) {
                closeMobileMenu();
            }
        });

        // Handle window resize
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (window.innerWidth > 1024 && sidebarRail) {
                    closeMobileMenu();
                }
            }, 250);
        });

        // Initialize greeting for student dashboard
        initializeGreeting();

        // Load dashboard data
        loadDashboardData();
    }

    function toggleMobileMenu() {
        const sidebarRail = document.getElementById('sidebar-rail');
        const railOverlay = document.getElementById('rail-overlay');
        
        if (sidebarRail && railOverlay) {
            sidebarRail.classList.toggle('mobile-open');
            railOverlay.classList.toggle('active');
            document.body.style.overflow = sidebarRail.classList.contains('mobile-open') ? 'hidden' : '';
        }
    }

    function closeMobileMenu() {
        const sidebarRail = document.getElementById('sidebar-rail');
        const railOverlay = document.getElementById('rail-overlay');
        
        if (sidebarRail && railOverlay) {
            sidebarRail.classList.remove('mobile-open');
            railOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Optional: Show toast notification
        if (window.showToast) {
            showToast(`Switched to ${newTheme} mode`, 'success');
        }
    }

    function handleLogout(e) {
        e.preventDefault();
        
        // Use the new logout modal
        const modal = getLogoutModal();
        modal.show({
            onAbort: () => {
                // Optional: log abort action
                console.log('Logout cancelled by user');
            },
            onConfirm: async () => {
                // Clear local storage
                localStorage.removeItem('cachedAuthState');
                
                // If Firebase auth is available
                if (window.firebase && firebase.auth) {
                    await firebase.auth().signOut();
                }
                
                // Show success toast
                if (window.showToast) {
                    showToast('Logged out successfully', '✅');
                }
                
                // Redirect after short delay
                setTimeout(() => {
                    if (window.AuthService && typeof window.AuthService.navigateToHome === 'function') {
                        window.AuthService.navigateToHome();
                    } else {
                        const isInPagesFolder = window.location.pathname.includes('/pages/');
                        window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
                    }
                }, 800);
            }
        });
    }

    function initializeGreeting() {
        const greetingElement = document.getElementById('greeting');
        if (!greetingElement) return;

        const hour = new Date().getHours();
        let greeting = 'Good day';
        
        if (hour < 12) {
            greeting = 'Good morning';
        } else if (hour < 18) {
            greeting = 'Good afternoon';
        } else {
            greeting = 'Good evening';
        }

        const userName = document.querySelector('.rail-profile-name');
        const name = userName ? userName.textContent : 'User';
        
        greetingElement.textContent = `${greeting}, ${name}.`;
    }

    function loadDashboardData() {
        // This function will be extended by individual dashboard scripts
        // Load user profile data
        loadUserProfile();
        
        // Load statistics
        loadStatistics();
    }

    function loadUserProfile() {
        // Check if Firebase auth is available
        if (window.firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    updateUserProfile(user);
                }
            });
        }
    }

    function updateUserProfile(user) {
        // Update profile name
        const profileNames = document.querySelectorAll('.rail-profile-name, [id$="-name"]');
        profileNames.forEach(elem => {
            if (user.displayName) {
                elem.textContent = user.displayName;
            }
        });

        // Update profile image if available
        if (user.photoURL) {
            const profileImages = document.querySelectorAll('.rail-profile-avatar, [id$="-profile-img"]');
            profileImages.forEach(img => {
                img.src = user.photoURL;
            });
        }
    }

    function loadStatistics() {
        // This will be overridden by individual dashboard scripts
        // Placeholder for loading dashboard statistics
        console.log('Loading dashboard statistics...');
    }

    // Export functions for use in other scripts
    window.dashboardRail = {
        toggleMobileMenu,
        closeMobileMenu,
        toggleTheme,
        updateUserProfile
    };

})();

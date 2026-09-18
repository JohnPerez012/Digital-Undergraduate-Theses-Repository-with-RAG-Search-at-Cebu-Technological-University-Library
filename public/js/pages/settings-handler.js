/**
 * Settings Handler
 * Manages user settings in the student dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
    // Only run on student page
    if (!document.getElementById('section-settings')) return;

    console.log('[Settings] Initializing settings handler...');

    // Theme Toggle
    const themeToggle = document.getElementById('settings-theme-toggle');
    if (themeToggle) {
        // Set initial state based on current theme
        const currentTheme = localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        themeToggle.checked = currentTheme === 'dark';

        themeToggle.addEventListener('change', (e) => {
            const newTheme = e.target.checked ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            
            // Show toast notification
            if (typeof showToast === 'function') {
                showToast(`Switched to ${newTheme} mode`, 'success');
            }
            
            console.log(`[Settings] Theme changed to: ${newTheme}`);
        });
    }

    // Toast Notifications Toggle
    const toastToggle = document.getElementById('settings-toast-toggle');
    if (toastToggle) {
        // Get saved preference
        const toastEnabled = localStorage.getItem('toastNotifications') !== 'false';
        toastToggle.checked = toastEnabled;

        toastToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('toastNotifications', enabled);
            
            if (enabled && typeof showToast === 'function') {
                showToast('Toast notifications enabled', 'success');
            }
            
            console.log(`[Settings] Toast notifications: ${enabled ? 'enabled' : 'disabled'}`);
        });
    }

    // Display user email
    const userEmailDisplay = document.getElementById('settings-user-email');
    if (userEmailDisplay && typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user && user.email) {
                userEmailDisplay.textContent = user.email;
            } else {
                userEmailDisplay.textContent = 'Not logged in';
            }
        });
    }

    // Clear Search History Button
    const clearHistoryBtn = document.getElementById('clear-search-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear your search history? This cannot be undone.')) {
                localStorage.removeItem('recap_search_history');
                
                if (typeof showToast === 'function') {
                    showToast('Search history cleared', 'success');
                }
                
                console.log('[Settings] Search history cleared');
            }
        });
    }

    // Export Saved Projects Button
    const exportBtn = document.getElementById('export-saved-projects-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                // Get saved projects from localStorage
                const savedProjects = JSON.parse(localStorage.getItem('savedProjects') || '[]');
                
                if (savedProjects.length === 0) {
                    if (typeof showToast === 'function') {
                        showToast('No saved projects to export', 'warning');
                    }
                    return;
                }

                // Create export data
                const exportData = {
                    exportDate: new Date().toISOString(),
                    projectCount: savedProjects.length,
                    projects: savedProjects.map(proj => ({
                        title: proj.title,
                        id: proj.id,
                        authors: proj.rawData?.authors || [],
                        year: proj.rawData?.year || '',
                        program: proj.rawData?.program || '',
                        abstract: proj.rawData?.abstract || ''
                    }))
                };

                // Create downloadable JSON file
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `recaps-saved-projects-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (typeof showToast === 'function') {
                    showToast(`Exported ${savedProjects.length} projects`, 'success');
                }
                
                console.log(`[Settings] Exported ${savedProjects.length} projects`);
            } catch (error) {
                console.error('[Settings] Export error:', error);
                if (typeof showToast === 'function') {
                    showToast('Failed to export projects', 'error');
                }
            }
        });
    }

    console.log('[Settings] Settings handler initialized');

    // ========================================
    // BACKGROUND IMAGE PREFERENCE
    // ========================================
    
    // Available library images (1-11)
    const LIBRARY_IMAGES = Array.from({length: 11}, (_, i) => `assets/library_images/img (${i + 1}).jpg`);
    
    // Initialize background preference
    function initBackgroundPreference() {
        const randomRadio = document.getElementById('bg-mode-random');
        const staticRadio = document.getElementById('bg-mode-static');
        const gallery = document.getElementById('bg-image-gallery');
        
        if (!randomRadio || !staticRadio || !gallery) return;
        
        // Load saved preference
        const savedMode = localStorage.getItem('bgImageMode') || 'random';
        const savedImage = localStorage.getItem('bgStaticImage');
        
        // Set initial radio state
        if (savedMode === 'static') {
            staticRadio.checked = true;
            gallery.style.display = 'block';
        } else {
            randomRadio.checked = true;
            gallery.style.display = 'none';
        }
        
        // Create image gallery
        createImageGallery(gallery, savedImage);
        
        // Handle mode change
        randomRadio.addEventListener('change', () => {
            if (randomRadio.checked) {
                localStorage.setItem('bgImageMode', 'random');
                gallery.style.display = 'none';
                localStorage.removeItem('bgStaticImage');
                
                if (typeof showToast === 'function') {
                    showToast('Background set to random mode', 'success');
                }
                
                console.log('[Settings] Background mode: random');
            }
        });
        
        staticRadio.addEventListener('change', () => {
            if (staticRadio.checked) {
                localStorage.setItem('bgImageMode', 'static');
                gallery.style.display = 'block';
                
                // If no image selected yet, select first one
                if (!localStorage.getItem('bgStaticImage')) {
                    selectBackgroundImage(LIBRARY_IMAGES[0]);
                }
                
                if (typeof showToast === 'function') {
                    showToast('Background set to static mode - select your image', 'info');
                }
                
                console.log('[Settings] Background mode: static');
            }
        });
    }
    
    function createImageGallery(container, selectedImage) {
        const galleryGrid = container.querySelector('div[style*="grid-template-columns"]');
        if (!galleryGrid) return;
        
        galleryGrid.innerHTML = '';
        
        LIBRARY_IMAGES.forEach((imagePath, index) => {
            const isSelected = imagePath === selectedImage;
            
            const imageItem = document.createElement('div');
            imageItem.className = 'bg-image-item' + (isSelected ? ' selected' : '');
            imageItem.innerHTML = `
                <img src="../${imagePath}" alt="Library Image ${index + 1}" loading="lazy">
                <div class="selected-badge">✓</div>
            `;
            
            imageItem.addEventListener('click', () => {
                selectBackgroundImage(imagePath);
                
                // Update visual selection
                galleryGrid.querySelectorAll('.bg-image-item').forEach(item => {
                    item.classList.remove('selected');
                });
                imageItem.classList.add('selected');
            });
            
            galleryGrid.appendChild(imageItem);
        });
    }
    
    function selectBackgroundImage(imagePath) {
        localStorage.setItem('bgStaticImage', imagePath);
        localStorage.setItem('bgImageMode', 'static');
        
        if (typeof showToast === 'function') {
            showToast('Background image selected', 'success');
        }
        
        console.log('[Settings] Selected background:', imagePath);
    }
    
    // Initialize on load
    initBackgroundPreference();
});

/**
 * Secondary Header Active State Detection
 * Detects the current page and applies active styling to the corresponding navigation item.
 * The active item is also disabled — you cannot click a link to the page you are already on.
 * Conditionally shows "Project Detail" button based on sessionStorage.
 */

/**
 * Detects the current page and applies the active + disabled state to the matching nav item.
 */
function initSecondaryHeader() {
  // Check if we're on index.html - if so, skip this (ViewManager handles it)
  const currentPath = window.location.pathname;
  if (currentPath.endsWith('index.html') || currentPath.endsWith('/')) {
    console.log('Secondary header: Skipping init on index.html (ViewManager handles navigation)');
    return;
  }
  
  // Check if a project has been viewed
  const hasViewedProject = sessionStorage.getItem('selectedProjectForViewDetails');
  
  // Get the Project Detail nav item
  const projectDetailNavItem = document.querySelector('.nav-item[data-page="project-detail"]');
  
  // Show/hide Project Detail button based on sessionStorage
  if (projectDetailNavItem) {
    if (hasViewedProject) {
      // User has viewed a project - show the button
      projectDetailNavItem.style.display = 'flex';
    } else {
      // No project viewed yet - hide the button
      projectDetailNavItem.style.display = 'none';
    }
  }
  
  // Get all navigation items with data-page attributes
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  
  // Handle missing DOM elements gracefully
  if (!navItems || navItems.length === 0) {
    console.warn('Secondary header navigation items not found');
    return;
  }
  
  // Get current page filename from URL
  let fileName = currentPath.substring(currentPath.lastIndexOf('/') + 1);
  
  // Clean filename: remove extension and any hash/query params
  fileName = fileName.split('?')[0].split('#')[0].replace('.html', '').toLowerCase();
  
  // Map page filenames to data-page attributes
  const pageMap = {
    'index': 'index',
    '': 'index', // Root path
    'librarian_page': 'library',
    'admin_page': 'admin',
    'teacher_page': 'teacher',
    'student_page': 'student',
    'about_page': 'about'
  };
  
  // Determine current page, defaulting to index for unknown pages or root
  const currentPage = pageMap[fileName] || fileName;
  
  // Apply active + disabled state to current page; ensure others are clickable
  navItems.forEach(item => {
    const isCurrentPage = item.dataset.page === currentPage;

    if (isCurrentPage) {
      // Mark as active (visual highlight)
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');

      // Mark as disabled so it cannot be clicked
      item.classList.add('nav-item-disabled');
      item.style.pointerEvents = 'none';
      item.style.cursor = 'not-allowed';
      item.setAttribute('aria-disabled', 'true');
      item.setAttribute('tabindex', '-1');

      // Belt-and-suspenders: block any click that somehow gets through
      item.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true });

    } else {
      // Ensure non-current items are fully interactive
      item.classList.remove('active', 'nav-item-disabled');
      item.removeAttribute('aria-current');
      item.removeAttribute('aria-disabled');
      item.style.pointerEvents = '';
      item.style.cursor = '';
      item.removeAttribute('tabindex');
    }
  });
}

// Initialize on DOM load with proper event listener handling
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSecondaryHeader);
} else {
  // DOM already loaded, initialize immediately
  initSecondaryHeader();
}


/**
 * Secondary Header Active State Detection
 * Detects the current page and applies active styling to the corresponding navigation item
 * Conditionally shows "Project Detail" button based on sessionStorage
 */

/**
 * Detects the current page and applies the active state to the corresponding nav item
 */
function initSecondaryHeader() {
  // Check if a project has been viewed
  const hasViewedProject = sessionStorage.getItem('selectedProjectForViewDetails');
  
  // Get the Project Detail nav item
  const projectDetailNavItem = document.querySelector('.nav-item[data-page="project-detail"]');
  
  // Show/hide Project Detail button based on sessionStorage
  if (projectDetailNavItem) {
    if (hasViewedProject) {
      if (projectDetailNavItem.style.display === 'none' || window.getComputedStyle(projectDetailNavItem).display === 'none') {
        projectDetailNavItem.style.display = 'flex';
        projectDetailNavItem.classList.add('nav-item-animated-show');
      } else {
        projectDetailNavItem.style.display = 'flex';
      }
    } else {
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
  const currentPath = window.location.pathname;
  let fileName = currentPath.substring(currentPath.lastIndexOf('/') + 1);
  
  // Clean filename: remove extension and any hash/query params
  fileName = fileName.split('?')[0].split('#')[0].replace('.html', '').toLowerCase();
  
  // Map page filenames to data-page attributes
  const pageMap = {
    'index': 'index',
    '': 'index', // Root path
    'view_project_details': 'project-detail'
  };
  
  // Determine current page, defaulting to index for unknown pages or root
  const currentPage = pageMap[fileName] || 'index';
  
  // Apply active state to matching navigation item
  navItems.forEach(item => {
    if (item.dataset.page === currentPage) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    } else {
      // Remove active state from other items (in case it was set)
      item.classList.remove('active');
      item.removeAttribute('aria-current');
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

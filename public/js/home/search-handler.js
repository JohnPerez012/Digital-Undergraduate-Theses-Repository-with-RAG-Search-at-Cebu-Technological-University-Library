/**
 * Search Handler for Home Page
 * Handles both traditional and AI semantic (RAG) search
 * Enhanced with search history and improved UX
 */

const SearchHandler = {
  isSearching: false,
  useAISearch: false, // Default to traditional search
  searchTimeout: null,
  
  /**
   * Initialize search functionality
   */
  init() {
    const searchInput = document.querySelector('.search-input');
    const searchBtn = document.querySelector('.search-btn');
    const searchClearBtn = document.querySelector('.search-clear-btn');
    const aiToggle = document.querySelector('.ai-toggle-input');
    
    if (!searchInput || !searchBtn) {
      console.warn('Search elements not found');
      return;
    }
    
    // Handle search button click
    searchBtn.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (query) {
        this.performSearch(query);
        this.saveSearchHistory(query);
      }
    });
    
    // Handle clear button click
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearSearch(searchInput, searchClearBtn);
      });
    }
    
    // Show/hide clear button based on input
    searchInput.addEventListener('input', () => {
      if (searchClearBtn) {
        if (searchInput.value.trim()) {
          searchClearBtn.style.display = 'flex';
        } else {
          searchClearBtn.style.display = 'none';
        }
      }
    });
    
    // Handle Enter key in search input
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          this.performSearch(query);
          this.saveSearchHistory(query);
        }
      }
    });
    
    // Handle AI toggle
    if (aiToggle) {
      // Always default to OFF (no localStorage)
      aiToggle.checked = false;
      this.useAISearch = false;
      
      // Add login-required indicator for non-logged-in users
      this.setupLoginRequiredTooltip(aiToggle);
      
      // Make entire ai-search-toggle container clickable
      const aiToggleContainer = aiToggle.closest('.ai-search-toggle');
      if (aiToggleContainer) {
        aiToggleContainer.style.cursor = 'pointer';
        
        // Remove default label behavior
        aiToggleContainer.addEventListener('click', (e) => {
          console.log('[SearchHandler] Container clicked, target:', e.target.className);
          
          // If clicking the checkbox input itself, let it handle naturally
          if (e.target === aiToggle) {
            console.log('[SearchHandler] Direct checkbox click - allowing default');
            return;
          }
          
          // For any other click on the label, manually toggle
          e.preventDefault();
          e.stopPropagation();
          
          // Get current state
          const currentState = aiToggle.checked;
          console.log('[SearchHandler] Current state:', currentState);
          
          // Check if user is logged in BEFORE toggling
          const isLoggedIn = this.checkUserLoggedIn();
          console.log('[SearchHandler] Is logged in:', isLoggedIn);
          
          // If trying to turn ON but not logged in, show login
          if (!currentState && !isLoggedIn) {
            console.log('[SearchHandler] Attempting to enable without login - opening modal');
            // Pulse the tooltip
            this.pulseLoginTooltip();
            
            // Open login modal
            setTimeout(() => {
              const loginLink = document.getElementById('login-nav-link');
              if (loginLink) {
                loginLink.click();
              }
            }, 800);
            return;
          }
          
          // Otherwise, toggle the checkbox
          aiToggle.checked = !currentState;
          console.log('[SearchHandler] Toggled to:', aiToggle.checked);
          
          // Dispatch change event
          const changeEvent = new Event('change', { bubbles: true });
          aiToggle.dispatchEvent(changeEvent);
        });
      }
      
      aiToggle.addEventListener('change', (e) => {
        // Check if user is logged in
        const isLoggedIn = this.checkUserLoggedIn();
        
        if (e.target.checked && !isLoggedIn) {
          // User is trying to enable AI search but not logged in
          e.preventDefault();
          aiToggle.checked = false; // Revert toggle
          this.useAISearch = false;
          
          // Notify particle system that toggle was reverted
          this.notifyParticleSystem(false);
          
          // Pulse the tooltip to draw attention
          this.pulseLoginTooltip();
          
          // Open login modal after a brief delay
          setTimeout(() => {
            const loginLink = document.getElementById('login-nav-link');
            if (loginLink) {
              loginLink.click();
            }
          }, 800);
          
          console.log('⚠️ AI Search requires login');
          return;
        }
        
        // User is logged in or turning OFF - allow the change
        this.useAISearch = e.target.checked;
        // No localStorage - preference is NOT saved
        
        // Notify particle system of actual state
        this.notifyParticleSystem(this.useAISearch);
        
        if (this.useAISearch) {
          console.log('🤖 AI Semantic Search ENABLED');
          searchInput.placeholder = 'Try: "projects about machine learning in agriculture" or "IoT systems for monitoring" (Press Enter)';
        } else {
          console.log('🔤 Traditional Search ENABLED');
          searchInput.placeholder = 'Search by title, author, or keyword... (Press Enter)';
        }
      });
      
      // Set initial placeholder (always traditional since default is OFF)
      searchInput.placeholder = 'Search by title, author, or keyword... (Press Enter)';
    }
    
    console.log('✓ Search handler initialized with AI semantic search support');
  },
  
  /**
   * Setup hover-aware login-required tooltip
   */
  setupLoginRequiredTooltip(aiToggle) {
    const aiToggleLabel = aiToggle.closest('.ai-search-toggle');
    if (!aiToggleLabel) return;
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'login-required-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      bottom: calc(100% + 12px);
      left: 50%;
      transform: translateX(-50%) scale(0.9);
      background: linear-gradient(135deg, var(--yellow-400) 0%, var(--yellow-700) 100%);
      color: white;
      padding: 0.875rem 1.25rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px var(--yellow-400), 0 0 0 1px var(--yellow-700);
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      white-space: nowrap;
      font-size: 0.875rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    `;
    
    tooltip.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Login required</span>
      <span style="margin-left: 0.25rem; padding: 0.25rem 0.5rem; background: rgba(0, 0, 0, 0.3); border-radius: 6px; font-size: 0.75rem; animation: clickPulse 2s ease-in-out infinite;">
        Click to login
      </span>
    `;
    
    // Arrow pointer
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid var(--yellow-300);
    `;
    tooltip.appendChild(arrow);
    
    // Make tooltip position relative container
    aiToggleLabel.style.position = 'relative';
    aiToggleLabel.appendChild(tooltip);
    
    // Store tooltip reference
    this.loginTooltip = tooltip;
    
    // Show/hide tooltip on hover (only when not logged in)
    const showTooltip = () => {
      if (!this.checkUserLoggedIn()) {
        tooltip.style.opacity = '1';
        tooltip.style.transform = 'translateX(-50%) scale(1)';
        tooltip.style.pointerEvents = 'auto';
      }
    };
    
    const hideTooltip = () => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateX(-50%) scale(0.9)';
      tooltip.style.pointerEvents = 'none';
    };
    
    aiToggleLabel.addEventListener('mouseenter', showTooltip);
    aiToggleLabel.addEventListener('mouseleave', hideTooltip);
    
    // Click tooltip to open login
    tooltip.addEventListener('click', (e) => {
      e.stopPropagation();
      const loginLink = document.getElementById('login-nav-link');
      if (loginLink) {
        loginLink.click();
      }
    });
    
    // Hide tooltip when user logs in
    this.onLoginStateChange = () => {
      if (this.checkUserLoggedIn()) {
        hideTooltip();
        aiToggleLabel.removeEventListener('mouseenter', showTooltip);
      } else {
        aiToggleLabel.addEventListener('mouseenter', showTooltip);
      }
    };
  },
  
  /**
   * Pulse the tooltip to draw attention
   */
  pulseLoginTooltip() {
    if (this.loginTooltip) {
      this.loginTooltip.style.animation = 'tooltipPulse 0.6s ease-in-out';
      setTimeout(() => {
        if (this.loginTooltip) {
          this.loginTooltip.style.animation = '';
        }
      }, 600);
    }
  },
  
  /**
   * Notify particle system of AI search state
   */
  notifyParticleSystem(isEnabled) {
    // Dispatch custom event for particle system
    const event = new CustomEvent('aiSearchStateChange', {
      detail: { enabled: isEnabled }
    });
    window.dispatchEvent(event);
    console.log(`[SearchHandler] Notified particle system: ${isEnabled}`);
  },
  
  /**
   * Check if user is currently logged in
   */
  checkUserLoggedIn() {
    // Check if Firebase auth is available and user is logged in
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      return true;
    }
    
    // Fallback: Check if profile link is visible (indicates logged in)
    const profileLink = document.getElementById('profile-link');
    if (profileLink && profileLink.style.display !== 'none') {
      return true;
    }
    
    return false;
  },
  
  /**
   * Clear search input and reset view
   */
  clearSearch(searchInput, searchClearBtn) {
    // Clear the input
    searchInput.value = '';
    
    // Hide the clear button
    if (searchClearBtn) {
      searchClearBtn.style.display = 'none';
    }
    
    // Show loading state briefly
    const container = document.getElementById('projects-container');
    if (container) {
      container.innerHTML = `
        <div class="loading-text" style="text-align: center; padding: 3rem;">
          <div class="loading-spinner" style="margin: 0 auto 1rem; width: 40px; height: 40px; border: 3px solid rgba(74, 143, 216, 0.2); border-top-color: #4a8fd8; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <p style="animation: loadingPulse 1.5s ease-in-out infinite;">Loading all projects...</p>
        </div>
      `;
    }
    
    // Focus back on input
    searchInput.focus();
    
    // Reload all projects (reset to default view) without page refresh
    if (typeof window.ProjectList !== 'undefined' && typeof window.ProjectList.loadProjects === 'function') {
      window.ProjectList.loadProjects();
    } else {
      console.warn('ProjectList.loadProjects not available, reloading page...');
      location.reload();
    }
    
    console.log('✓ Search cleared');
  },
  
  /**
   * Save search query to history
   */
  saveSearchHistory(query) {
    try {
      // Get or create search history
      let history = JSON.parse(localStorage.getItem('recap_search_history') || '[]');
      
      // Don't add duplicates (check if same query exists recently)
      const isDuplicate = history.some(entry => 
        entry.query.toLowerCase() === query.toLowerCase() &&
        (new Date() - new Date(entry.timestamp)) < 3600000 // within 1 hour
      );
      
      if (!isDuplicate) {
        const searchEntry = {
          query: query,
          timestamp: new Date().toISOString(),
          searchType: this.useAISearch ? 'ai' : 'traditional'
        };
        
        history.unshift(searchEntry); // Add to beginning
        history = history.slice(0, 20); // Keep only last 20
        localStorage.setItem('recap_search_history', JSON.stringify(history));
        
        console.log('✓ Search history saved:', query);
      }
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  },
  
  /**
   * Get search history
   */
  getSearchHistory(limit = 10) {
    try {
      const history = JSON.parse(localStorage.getItem('recap_search_history') || '[]');
      return history.slice(0, limit);
    } catch (error) {
      console.error('Error getting search history:', error);
      return [];
    }
  },
  
  /**
   * Clear search history
   */
  clearSearchHistory() {
    try {
      localStorage.removeItem('recap_search_history');
      console.log('✓ Search history cleared');
    } catch (error) {
      console.error('Error clearing search history:', error);
    }
  },
  
  /**
   * Perform search based on current mode (AI or traditional)
   */
  async performSearch(query) {
    if (this.isSearching) {
      console.log('Search already in progress...');
      return;
    }
    
    this.isSearching = true;
    
    try {
      if (this.useAISearch) {
        await this.performAISearch(query);
      } else {
        await this.performTraditionalSearch(query);
      }
    } catch (error) {
      console.error('Search error:', error);
      this.showError('Search failed. Please try again.');
    } finally {
      this.isSearching = false;
    }
  },
  
  /**
   * Perform AI semantic search using RAG with improved filtering
   */
  async performAISearch(query) {
    console.log('🧠 Performing AI semantic search:', query);
    
    // Show loading state
    this.showLoading();
    
    // Check if RAGService is available
    if (typeof window.RAGService === 'undefined') {
      console.error('RAGService not loaded');
      this.showError('AI Search is not available. Using traditional search.');
      await this.performTraditionalSearch(query);
      return;
    }
    
    try {
      // Perform RAG search with strict filtering (70% threshold)
      const result = await window.RAGService.search(query, {
        topK: 50,
        minRelevanceScore: 0.7  // Use 70% threshold for better quality
      });
      
      if (!result.hasResults) {
        // Try with lower threshold if no results at 70%
        console.log('⚠️ No results at 70% threshold, trying 50%...');
        const fallbackResult = await window.RAGService.search(query, {
          topK: 50,
          minRelevanceScore: 0.5  // Lower threshold for fallback
        });
        
        if (!fallbackResult.hasResults) {
          console.log('No results found from AI search');
          this.showNoResults(query);
          return;
        }
        
        console.log(`✓ Found ${fallbackResult.filteredCount} relevant projects with relaxed threshold (from ${fallbackResult.totalMatches} matches)`);
        
        // Display fallback results with notice
        if (typeof window.ProjectList !== 'undefined') {
          window.ProjectList.displaySearchResults(fallbackResult.projects, query, true); // true = isRAGSearch
          this.showRelaxedThresholdNotice();
        } else {
          console.error('ProjectList not available');
        }
        return;
      }
      
      console.log(`✓ Found ${result.filteredCount} relevant projects (from ${result.totalMatches} matches)`);
      
      // Display results using ProjectList if available
      if (typeof window.ProjectList !== 'undefined') {
        window.ProjectList.displaySearchResults(result.projects, query, true); // true = isRAGSearch
      } else {
        console.error('ProjectList not available');
      }
      
    } catch (error) {
      console.error('AI search error:', error);
      throw error;
    }
  },
  
  /**
   * Perform traditional Firestore search
   */
  async performTraditionalSearch(query) {
    console.log('🔤 Performing traditional search:', query);
    
    // Show loading state
    this.showLoading();
    
    try {
      if (typeof db === 'undefined') {
        throw new Error('Firestore not initialized');
      }
      
      const querySnapshot = await db.collection('projects').get();
      const allProjects = [];
      
      querySnapshot.forEach(doc => {
        const data = doc.data();
        data.id = doc.id;
        allProjects.push(data);
      });
      
      // Filter projects by query
      const lowerQuery = query.toLowerCase();
      const filteredProjects = allProjects.filter(project => {
        const title = (project.title || '').toLowerCase();
        const abstract = (project.abstract || '').toLowerCase();
        const authors = Array.isArray(project.authors) 
          ? project.authors.join(' ').toLowerCase() 
          : (project.authors || '').toLowerCase();
        const keywords = Array.isArray(project.keywords)
          ? project.keywords.join(' ').toLowerCase()
          : (project.keywords || '').toLowerCase();
        const adviser = (project.adviser || '').toLowerCase();
        
        return title.includes(lowerQuery) || 
               abstract.includes(lowerQuery) ||
               authors.includes(lowerQuery) ||
               keywords.includes(lowerQuery) ||
               adviser.includes(lowerQuery);
      });
      
      console.log(`✓ Found ${filteredProjects.length} matching projects`);
      
      if (filteredProjects.length === 0) {
        this.showNoResults(query);
        return;
      }
      
      // Display results using ProjectList if available
      if (typeof window.ProjectList !== 'undefined') {
        window.ProjectList.displaySearchResults(filteredProjects, query, false); // false = not RAG
      } else {
        console.error('ProjectList not available');
      }
      
    } catch (error) {
      console.error('Traditional search error:', error);
      throw error;
    }
  },
  
  /**
   * Show loading state with smooth animation
   */
  showLoading() {
    const container = document.getElementById('projects-container');
    if (container) {
      container.innerHTML = `
        <div class="loading-text" style="text-align: center; padding: 3rem;">
          <div class="loading-spinner" style="margin: 0 auto 1rem; width: 40px; height: 40px; border: 3px solid rgba(74, 143, 216, 0.2); border-top-color: #4a8fd8; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <p style="animation: loadingPulse 1.5s ease-in-out infinite;">Searching projects...</p>
        </div>
      `;
    }
  },
  
  /**
   * Show notice about relaxed threshold
   */
  showRelaxedThresholdNotice() {
    const container = document.getElementById('projects-container');
    if (container && container.firstChild) {
      const notice = document.createElement('div');
      notice.className = 'search-notice';
      notice.style.cssText = 'background: #fef3c7; border-left: 4px solid #f59e0b; padding: 0.75rem 1rem; margin-bottom: 1.5rem; border-radius: 6px; font-size: 0.9rem;';
      notice.innerHTML = `
        <strong>ℹ️ Note:</strong> Showing results with medium relevance (50%+). 
        Try more specific keywords for better matches.
      `;
      container.insertBefore(notice, container.firstChild);
    }
  },
  
  /**
   * Show no results message with helpful hints
   */
  showNoResults(query) {
    const container = document.getElementById('projects-container');
    if (container) {
      const searchType = this.useAISearch ? 'AI semantic search' : 'search';
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 3rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 1rem;">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <h3 style="margin-bottom: 0.5rem; font-size: 1.25rem;">No Results Found</h3>
          <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
            No projects found matching "${this.escapeHtml(query)}" using ${searchType}.
          </p>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
            ${this.useAISearch 
              ? 'Try natural language like "projects about AI in healthcare" or use different keywords.' 
              : 'Try different keywords or enable AI Semantic Search for better results.'}
          </p>
          <button onclick="location.reload()" style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer;">
            Clear Search
          </button>
        </div>
      `;
    }
    
    // Clear pagination
    const pagination = document.getElementById('pagination-container');
    if (pagination) {
      pagination.innerHTML = '';
    }
    
    // Update count
    const countElement = document.getElementById('total-projects-count');
    if (countElement) {
      countElement.textContent = '0';
    }
  },
  
  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('projects-container');
    if (container) {
      container.innerHTML = `
        <div class="error-state" style="text-align: center; padding: 3rem; color: #ef4444;">
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    }
  },
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Clean up any old localStorage for AI search preference
    localStorage.removeItem('aiSearchEnabled');
    SearchHandler.init();
  });
} else {
  // Clean up any old localStorage for AI search preference
  localStorage.removeItem('aiSearchEnabled');
  SearchHandler.init();
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes loadingPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes clickPulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.9;
    }
  }
  @keyframes tooltipPulse {
    0%, 100% {
      transform: translateX(-50%) scale(1);
    }
    25% {
      transform: translateX(-50%) scale(1.1);
    }
    50% {
      transform: translateX(-50%) scale(0.95);
    }
    75% {
      transform: translateX(-50%) scale(1.05);
    }
  }
  
  /* Hover effect for login tooltip */
  .login-required-tooltip:hover {
    background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%) !important;
    box-shadow: 0 12px 32px rgba(217, 119, 6, 0.6), 0 0 0 1px rgba(251, 191, 36, 0.5) !important;
    transform: translateX(-50%) scale(1.05) !important;
  }
`;
document.head.appendChild(style);

// Make available globally
window.SearchHandler = SearchHandler;

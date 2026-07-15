/**
 * Citation Module
 * Handles citation generation in multiple formats
 */

const Citation = {
  currentProject: null,
  currentFormat: 'apa',

  /**
   * Show citation modal
   */
  showCitationModal() {
    console.log('showCitationModal called');
    
    // Get current project from sessionStorage
    const projectData = sessionStorage.getItem('currentProject');
    console.log('Project data:', projectData);
    
    if (!projectData) {
      alert('No project data available. Please select a project first.');
      return;
    }

    try {
      this.currentProject = JSON.parse(projectData);
      console.log('Parsed project:', this.currentProject);
    } catch (error) {
      console.error('Error parsing project data:', error);
      alert('Error loading project data.');
      return;
    }

    // Reset to APA format
    this.currentFormat = 'apa';
    this.updateCitationTabs();
    this.generateCitation();

    // Show modal using 'active' class (not 'hidden')
    const modal = document.getElementById('citation-modal');
    console.log('Modal element:', modal);
    
    if (modal) {
      modal.classList.add('active');
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      console.log('Modal should now be visible');
    } else {
      console.error('Citation modal element not found!');
    }
  },

  /**
   * Close citation modal
   */
  closeCitationModal() {
    const modal = document.getElementById('citation-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  },

  /**
   * Switch citation format
   */
  switchFormat(format) {
    this.currentFormat = format;
    this.updateCitationTabs();
    this.generateCitation();
  },

  /**
   * Update citation tabs
   */
  updateCitationTabs() {
    document.querySelectorAll('.citation-tab').forEach(tab => {
      const format = tab.dataset.format;
      if (format === this.currentFormat) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  },

  /**
   * Generate citation based on format
   */
  generateCitation() {
    if (!this.currentProject) return;

    let citation = '';
    switch (this.currentFormat) {
      case 'apa':
        citation = this.generateAPA();
        break;
      case 'mla':
        citation = this.generateMLA();
        break;
      case 'chicago':
        citation = this.generateChicago();
        break;
      case 'ieee':
        citation = this.generateIEEE();
        break;
    }

    document.getElementById('citation-text').textContent = citation;
  },

  /**
   * Generate APA 7th edition citation
   */
  generateAPA() {
    const project = this.currentProject;
    const authors = this.formatAuthorsAPA(project.authors);
    const year = project.year || 'n.d.';
    const title = project.title || 'Untitled';
    const program = project.program || '';
    
    return `${authors} (${year}). ${title} [Undergraduate thesis, Cebu Technological University - Daanbantayan Campus]. CTU RECAP Repository.`;
  },

  /**
   * Generate MLA 9th edition citation
   */
  generateMLA() {
    const project = this.currentProject;
    const authors = this.formatAuthorsMLA(project.authors);
    const title = project.title || 'Untitled';
    const year = project.year || 'n.d.';
    
    return `${authors} "${title}." Undergraduate thesis, Cebu Technological University - Daanbantayan Campus, ${year}. CTU RECAP Repository.`;
  },

  /**
   * Generate Chicago citation
   */
  generateChicago() {
    const project = this.currentProject;
    const authors = this.formatAuthorsChicago(project.authors);
    const title = project.title || 'Untitled';
    const year = project.year || 'n.d.';
    
    return `${authors} "${title}." Undergraduate thesis, Cebu Technological University - Daanbantayan Campus, ${year}.`;
  },

  /**
   * Generate IEEE citation
   */
  generateIEEE() {
    const project = this.currentProject;
    const authors = this.formatAuthorsIEEE(project.authors);
    const title = project.title || 'Untitled';
    const year = project.year || 'n.d.';
    
    return `${authors} "${title}," Undergraduate thesis, Cebu Technological University - Daanbantayan Campus, ${year}.`;
  },

  /**
   * Format authors for APA
   */
  formatAuthorsAPA(authors) {
    if (!authors || authors.length === 0) return 'Author Unknown';
    
    const formatted = authors.map(author => {
      const parts = author.trim().split(/[\s,]+/);
      if (parts.length === 0) return '';
      
      const lastName = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + '.').join(' ');
      
      return initials ? `${lastName}, ${initials}` : lastName;
    });

    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
    
    const lastAuthor = formatted[formatted.length - 1];
    const otherAuthors = formatted.slice(0, -1).join(', ');
    return `${otherAuthors}, & ${lastAuthor}`;
  },

  /**
   * Format authors for MLA
   */
  formatAuthorsMLA(authors) {
    if (!authors || authors.length === 0) return 'Author Unknown';
    
    const formatted = authors.map(author => {
      const parts = author.trim().split(/[\s,]+/);
      if (parts.length === 0) return '';
      
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, -1).join(' ');
      
      return firstName ? `${lastName}, ${firstName}` : lastName;
    });

    if (formatted.length === 1) return formatted[0] + '.';
    if (formatted.length === 2) return `${formatted[0]}, and ${formatted[1]}.`;
    
    const lastAuthor = formatted[formatted.length - 1];
    const otherAuthors = formatted.slice(0, -1).join(', ');
    return `${otherAuthors}, and ${lastAuthor}.`;
  },

  /**
   * Format authors for Chicago
   */
  formatAuthorsChicago(authors) {
    if (!authors || authors.length === 0) return 'Author Unknown';
    
    const formatted = authors.map(author => {
      const parts = author.trim().split(/[\s,]+/);
      if (parts.length === 0) return '';
      
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, -1).join(' ');
      
      return firstName ? `${lastName}, ${firstName}` : lastName;
    });

    if (formatted.length === 1) return formatted[0] + '.';
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}.`;
    if (formatted.length === 3) return `${formatted[0]}, ${formatted[1]}, and ${formatted[2]}.`;
    
    return `${formatted[0]} et al.`;
  },

  /**
   * Format authors for IEEE
   */
  formatAuthorsIEEE(authors) {
    if (!authors || authors.length === 0) return 'Author Unknown';
    
    const formatted = authors.map(author => {
      const parts = author.trim().split(/[\s,]+/);
      if (parts.length === 0) return '';
      
      const lastName = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + '.').join(' ');
      
      return initials ? `${initials} ${lastName}` : lastName;
    });

    if (formatted.length === 1) return formatted[0] + ',';
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]},`;
    
    const lastAuthor = formatted[formatted.length - 1];
    const otherAuthors = formatted.slice(0, -1).join(', ');
    return `${otherAuthors}, and ${lastAuthor},`;
  },

  /**
   * Copy citation to clipboard
   */
  async copyCitation() {
    const citationText = document.getElementById('citation-text').textContent;
    
    try {
      await navigator.clipboard.writeText(citationText);
      
      // Show success feedback
      const button = document.querySelector('[data-action="copy-citation"]');
      const originalText = button.innerHTML;
      button.innerHTML = '&#10003; Copied!';
      button.style.background = '#27ae60';
      
      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
      }, 2000);
      
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      
      // Fallback: select text
      const citationBox = document.getElementById('citation-text');
      const range = document.createRange();
      range.selectNodeContents(citationBox);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      alert('Citation text selected. Press Ctrl+C (or Cmd+C on Mac) to copy.');
    }
  },

  /**
   * Initialize citation module
   */
  init() {
    // Setup citation format tabs - will be initialized when modal is shown
    console.log('✓ Citation module loaded');
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Citation.init());
} else {
  Citation.init();
}

// Make Citation globally available
window.Citation = Citation;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Citation;
}

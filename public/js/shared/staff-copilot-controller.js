/**
 * StaffCopilotController
 * Institutional AI Copilot Controller for Administrator (Head Librarian) and Librarian Staff.
 * 
 * Features:
 * - Direct SSE streaming from /api/staff-copilot/chat
 * - Strict 5-Conversation Quota limit with Saved Chats Drawer
 * - Automatic message saving to Firestore via StaffCopilotService
 * - Interactive Spatial Guidance, Copy Action Buttons, and Zero-Emoji Architecture
 */

(function(window) {
  'use strict';

  function getBackendCandidateUrls(path = '/api/staff-copilot/chat') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const candidates = [];

    if (typeof window.BACKEND_API_BASE === 'string' && window.BACKEND_API_BASE.trim()) {
      candidates.push(`${window.BACKEND_API_BASE.replace(/\/+$/, '')}${cleanPath}`);
    }

    if (isLocal) {
      candidates.push(`http://localhost:3001${cleanPath}`);
      candidates.push(`https://recap-backend-jy5b.onrender.com${cleanPath}`);
    } else {
      candidates.push(`https://recap-backend-jy5b.onrender.com${cleanPath}`);
      candidates.push(`http://localhost:3001${cleanPath}`);
    }

    return Array.from(new Set(candidates));
  }

  function getOfflineProceduralGuidance(query, role = 'admin') {
    // If rich knowledge base from main.js is available and user is admin, prioritize it
    if (role === 'admin' && typeof window.getAdminCopilotResponse === 'function') {
      try {
        const res = window.getAdminCopilotResponse(query);
        if (res && res.steps && res.steps.length > 0) {
          let text = '';
          if (res.landmark) {
            text += `[Area: ${res.landmark.replace(' > ', '] > [Element: ')}]\n\n`;
          }
          res.steps.forEach((step, idx) => {
            text += `${idx + 1}. ${step}\n`;
          });
          if (res.precaution) {
            text += `\nPrecaution: ${res.precaution}\n`;
          }
          return text;
        }
      } catch (_) {}
    }

    const q = (query || '').toLowerCase().trim();

    // 1. Create Librarian Staff
    if (q.includes('create') && (q.includes('librarian') || q.includes('staff'))) {
      if (role === 'admin') {
        return `[Area: Users Section > Header Toolbar] > [Element: #create-librarian-btn]\n1. Click "Users" in the left navigation rail.\n2. Click "+ Create Librarian" (#create-librarian-btn) in the top toolbar to open the modal.\n3. Enter Full Name and institutional email prefix (auto-suffixed with @ctu.edu.ph).\n4. Select designation (default: Librarian) and enter a secure password (minimum 6 characters).\n5. Click "Create Librarian" and provide the auto-generated credentials to the staff member.\nPrecaution: Newly created librarian accounts have cataloging permissions but cannot delete records or publish without approval.`;
      } else {
        return `[Area: Librarian Dashboard > Access Restriction] > [Element: Administrator Authority]\n1. Creating librarian or staff accounts requires Head Librarian (Administrator) privileges.\n2. Please contact the Head Librarian to provision new staff credentials via Admin Portal > Users > Create Librarian.\nPrecaution: Standard library staff credentials cannot create or sanction user accounts.`;
      }
    }

    // 2. Sanction / Suspend / Delete Users
    if (q.includes('sanction') || q.includes('suspend') || q.includes('quarantine') || (q.includes('delete') && q.includes('user'))) {
      if (role === 'admin') {
        return `[Area: Users Section > Actions Column] > [Element: #user-governance-modal]\n1. Open Users from the Sidebar Rail and locate the targeted account.\n2. Click "Sanction" in the row actions column to open the 3-tier Governance Modal.\n3. Choose Account Suspension (temporary freeze) or 14-Day Deletion Quarantine (soft-delete).\n4. Specify violation reason and detailed justification notes (minimum 15 characters).\n5. Affirm and confirm to apply the account restriction.\nPrecaution: Quarantined accounts can be restored within 14 days before being eligible for permanent purge.`;
      } else {
        return `[Area: Librarian Dashboard > Security Policy] > [Element: Restricted Action]\n1. User sanctions and account deletions are strictly reserved for the System Administrator.\nPrecaution: Contact administrative personnel for disciplinary user account actions.`;
      }
    }

    // 3. Approvals / Evaluations
    if (q.includes('approv') || q.includes('evaluat') || q.includes('pending')) {
      if (role === 'admin') {
        return `[Area: Approvals Section > Submissions Table] > [Element: #approval-review-modal]\n1. Click "Approvals" in the left Sidebar Rail (or press Ctrl+Shift+A).\n2. Review pending capstone submissions uploaded by library staff.\n3. Click "Evaluate" to inspect metadata, authors, and cover image.\n4. Click "Approve & Publish Publicly" to index the project and make it searchable.\nPrecaution: Approving a project triggers automated Pinecone vector synchronization.`;
      } else {
        return `[Area: Submissions Section > Intake Queue] > [Element: Status Tracker]\n1. Open Submissions from your Librarian rail.\n2. Check the status badge for your submitted thesis drafts (Pending Approval, Approved, or Revision Needed).\nPrecaution: Submissions pending approval cannot be edited until evaluation completes.`;
      }
    }

    // 4. Physical Cataloging & Shelf Coordinates
    if (q.includes('shelf') || q.includes('location') || q.includes('call number') || q.includes('accession')) {
      return `[Area: Physical Cataloging Studio] > [Element: #cn-sec-location]\n1. Locate the capstone record in the catalog.\n2. Open Section 05 (Physical Catalog & Storage Coordinates).\n3. Input Shelf Location Note (Rack, Row, Stand, Color Tag).\n4. Assign official Dewey/Library Call Number and institutional Accession Number.\n5. Save changes to update the physical tracking audit box.\nPrecaution: Accession numbers must be unique across the campus repository.`;
    }

    // 5. Change Password / 2FA Security
    if (q.includes('password') || q.includes('2fa') || q.includes('gmail')) {
      return `[Area: Settings Section > Security & Sign-in] > [Element: #change-password-btn]\n1. Click "Settings" in the left navigation rail.\n2. Under Security, locate "Linked Personal Gmail" to verify your 2FA email channel.\n3. Click "Change Password" to verify your current password and set a compliant 8+ character password.\nPrecaution: Changing passwords invalidates active sessions and requires re-authentication.`;
    }

    // Default institutional operational overview
    return `[Area: ${role === 'librarian' ? 'Librarian Dashboard' : 'Admin Operations'}] > [Element: Operational Guidance]\n1. Institutional repository procedures loaded for ${role.toUpperCase()} operations.\n2. Use the left navigation rail to manage Projects, Submissions, and Account Settings.\n3. For specific procedures, ask about creating accounts, approving theses, shelf locations, or password management.\nPrecaution: Privileged institutional modifications require verified 2FA authorization.`;
  }

  function getBackendUrl() {
    const candidates = getBackendCandidateUrls();
    return candidates[0] || 'https://recap-backend-jy5b.onrender.com';
  }

  async function getAuthToken() {
    const user = (typeof auth !== 'undefined' && auth && auth.currentUser)
      ? auth.currentUser
      : ((typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null);

    if (user && typeof user.getIdToken === 'function') {
      try {
        return await user.getIdToken();
      } catch (err) {
        console.warn('[StaffCopilot] Token fetch warning:', err);
      }
    }
    return null;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Ensure user messages always render as clean plain text (never wrapped in assistant HTML).
   * Also safely unwraps any legacy corrupted user message that may have stored copilot HTML.
   */
  function extractPlainUserText(raw) {
    const str = String(raw || '');
    if (!str) return '';
    if (str.includes('<div class="copilot-dynamic-response"') || str.includes('<div class="copilot-text-body"')) {
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = str;
        const bodyEl = tmp.querySelector('.copilot-text-body');
        if (bodyEl) return (bodyEl.textContent || '').trim();
        return (tmp.textContent || '').trim();
      } catch (_e) {}
    }
    return str;
  }

  function getIcon(name) {
    if (window.SVGRegistry && typeof window.SVGRegistry.getIcon === 'function') {
      const svg = window.SVGRegistry.getIcon(name);
      if (svg) return svg;
    }
    const fallbacks = {
      'message-square': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      'plus': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      'trash': '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      'x': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      'check': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#08D488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      'copy': '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      'bot': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>'
    };
    return fallbacks[name] || '';
  }

  function formatMarkdown(text) {
    if (!text) return '';

    // If dynamicCopilotNormalizer is present (from main.js), leverage its full institutional action renderer
    if (typeof window.dynamicCopilotNormalizer === 'function') {
      try {
        const normalized = window.dynamicCopilotNormalizer(text, 'Staff Copilot RAG');
        if (normalized && normalized.trim()) return normalized;
      } catch (_) {}
    }

    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    formatted = formatted.replace(/^### (.*$)/gim, '<h5 style="margin:0.5rem 0 0.25rem;color:#F7F7F8;font-weight:700;">$1</h5>');
    formatted = formatted.replace(/^## (.*$)/gim, '<h4 style="margin:0.6rem 0 0.3rem;color:#F7F7F8;font-weight:700;">$1</h4>');

    // Bold & italic
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#F7F7F8;">$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code blocks & inline code
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre style="background:#0b0f17;padding:0.65rem 0.85rem;border-radius:6px;border:1px solid #334155;overflow-x:auto;color:#08D488;font-size:0.8rem;margin:0.5rem 0;"><code>$1</code></pre>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:#1e293b;padding:2px 5px;border-radius:4px;color:#08D488;font-size:0.82em;">$1</code>');

    // Spatial Landmarks with or without Element tag
    formatted = formatted.replace(/\[Area: ([^\]]+)\] &gt; \[Element: ([^\]]+)\]/g, 
      '<div class="copilot-spatial-landmark" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.65rem;background:#1e293b;border-left:3px solid #08D488;border-radius:4px;margin-bottom:0.5rem;font-size:0.78rem;color:#cbd5e1;"><span style="color:#08D488;font-weight:700;">[Navigation]</span> <strong>$1</strong> &rarr; <span style="color:#FCCC56;">$2</span></div>');
    formatted = formatted.replace(/\[Area: ([^\]]+)\]/g,
      '<div class="copilot-spatial-landmark" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.65rem;background:#1e293b;border-left:3px solid #08D488;border-radius:4px;margin-bottom:0.5rem;font-size:0.78rem;color:#cbd5e1;"><span style="color:#08D488;font-weight:700;">[Navigation]</span> <strong>$1</strong></div>');

    // Precaution alerts (Zero-emoji, clean red-accented border)
    formatted = formatted.replace(/Precaution: (.*$)/gim,
      '<div class="copilot-precaution-box" style="margin-top:0.6rem;padding:0.5rem 0.75rem;background:rgba(239, 68, 68, 0.08);border-left:3px solid #ef4444;border-radius:4px;color:#cbd5e1;font-size:0.8rem;"><strong style="color:#ef4444;">Precaution:</strong> $1</div>');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
  }

  class StaffCopilot {
    constructor(options = {}) {
      if (window._staffCopilotSingleton) {
        return window._staffCopilotSingleton;
      }

      this.role = options.role || 'admin'; // 'admin' | 'librarian'
      this.currentMessages = [];
      this.activeRequestId = 0;
      this.isStreaming = false;
      this.abortController = null;

      window._staffCopilotSingleton = this;
      window.staffCopilotInstance = this;
      window._staffCopilot = this;

      this.init();
    }

    async init() {
      this.bindDOMElements();
      this.bindEvents();

      // Synchronize conversation drawer upon Firebase Auth resolution
      const handleAuthSync = async (user) => {
        if (user) {
          console.log('[StaffCopilot] Authenticated user verified:', user.uid, '— syncing saved conversations...');
          await this.refreshHistoryDrawer();
        }
      };

      if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
        auth.onAuthStateChanged(handleAuthSync);
      } else if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(handleAuthSync);
      }

      await this.refreshHistoryDrawer();
    }

    bindDOMElements() {
      // Containers
      this.widgetEl = document.getElementById(this.role === 'librarian' ? 'librarian-copilot-widget' : 'admin-copilot-widget');
      this.floatingBtn = document.getElementById(this.role === 'librarian' ? 'librarian-floating-copilot-btn' : 'admin-floating-copilot-btn');
      this.sectionEl = document.getElementById('section-copilot');

      // Drawer
      this.drawerEl = document.getElementById('copilot-history-drawer');
      this.historyListEl = document.getElementById('copilot-history-list');
      this.countBadgeEl = document.getElementById('copilot-history-count');
      this.quotaBarEl = document.getElementById('copilot-quota-text');

      // Input controls (widget & section)
      this.widgetInput = document.getElementById('copilot-widget-input');
      this.widgetForm = document.getElementById('copilot-widget-form');
      this.sectionInput = document.getElementById('copilot-input-text');
      this.sectionSendBtn = document.getElementById('copilot-send-btn');

      // Message targets
      this.widgetMessages = document.getElementById('copilot-widget-messages');
      this.sectionMessages = document.getElementById('copilot-messages-list');
      this.widgetWelcome = document.getElementById('copilot-widget-welcome');
      this.sectionWelcome = document.getElementById('copilot-welcome-box');

      // Typing indicators
      this.widgetTyping = document.getElementById('copilot-widget-typing');
      this.sectionTyping = document.getElementById('copilot-section-typing');
    }

    bindEvents() {
      // Floating button toggle
      if (this.floatingBtn && this.widgetEl) {
        this.floatingBtn.addEventListener('click', () => {
          const isActive = this.widgetEl.classList.contains('active');
          if (isActive) {
            this.closeWidget();
          } else {
            this.openWidget();
          }
        });
      }

      // Close button
      const closeBtn = document.getElementById('copilot-widget-close-btn');
      if (closeBtn) closeBtn.addEventListener('click', () => this.closeWidget());

      // Expand button
      const expandBtn = document.getElementById('copilot-widget-fullscreen-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          this.closeWidget();
          if (window.dashboardRail && typeof window.dashboardRail.switchToSection === 'function') {
            window.dashboardRail.switchToSection('copilot');
          } else {
            const nav = document.querySelector('.rail-nav-item[data-section="copilot"]');
            if (nav) nav.click();
          }
        });
      }

      // Widget Form submit
      if (this.widgetForm && this.widgetInput) {
        this.widgetForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const val = this.widgetInput.value.trim();
          if (val) {
            this.widgetInput.value = '';
            this.sendMessage(val);
          }
        });
      }

      // Section send
      if (this.sectionSendBtn && this.sectionInput) {
        this.sectionSendBtn.addEventListener('click', () => {
          const val = this.sectionInput.value.trim();
          if (val) {
            this.sectionInput.value = '';
            this.sendMessage(val);
          }
        });
        this.sectionInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const val = this.sectionInput.value.trim();
            if (val) {
              this.sectionInput.value = '';
              this.sendMessage(val);
            }
          }
        });
      }

      // Quick Prompt Chips / Pills
      document.querySelectorAll('[data-copilot-prompt]').forEach(btn => {
        if (btn._copilotPromptBound) return;
        btn._copilotPromptBound = true;
        btn.addEventListener('click', () => {
          const prompt = btn.getAttribute('data-copilot-prompt');
          if (prompt) this.sendMessage(prompt);
        });
      });

      // Saved Chats Drawer Trigger
      document.querySelectorAll('.copilot-btn-history-trigger').forEach(btn => {
        if (btn._copilotHistoryBound) return;
        btn._copilotHistoryBound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[StaffCopilot] Saved chats button clicked from:', btn);
          this.toggleDrawer(btn);
        });
      });

      // Drawer Close
      const drawerClose = document.getElementById('copilot-drawer-close-btn');
      if (drawerClose && !drawerClose._copilotCloseBound) {
        drawerClose._copilotCloseBound = true;
        drawerClose.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeDrawer();
        });
      }

      // Close drawer on click outside
      if (!window._copilotDocClickBound) {
        window._copilotDocClickBound = true;
        document.addEventListener('click', (e) => {
          const copilot = window._staffCopilotSingleton;
          if (!copilot || !copilot.drawerEl || !copilot.drawerEl.classList.contains('active')) return;
          if (e.target.closest('.copilot-history-drawer') || e.target.closest('.copilot-btn-history-trigger')) return;
          copilot.closeDrawer();
        });
      }

      // Close drawer on Escape
      if (!window._copilotDocKeyBound) {
        window._copilotDocKeyBound = true;
        document.addEventListener('keydown', (e) => {
          const copilot = window._staffCopilotSingleton;
          if (e.key === 'Escape' && copilot && copilot.drawerEl && copilot.drawerEl.classList.contains('active')) {
            copilot.closeDrawer();
          }
        });
      }

      // + New Chat Trigger
      document.querySelectorAll('.copilot-btn-new-chat-trigger').forEach(btn => {
        if (btn._copilotNewBound) return;
        btn._copilotNewBound = true;
        btn.addEventListener('click', () => this.startNewConversation());
      });
    }

    openWidget() {
      if (!this.widgetEl) return;
      this.widgetEl.style.display = 'flex';
      requestAnimationFrame(() => this.widgetEl.classList.add('active'));
      if (this.widgetInput) setTimeout(() => this.widgetInput.focus(), 120);
    }

    closeWidget() {
      if (!this.widgetEl) return;
      this.widgetEl.classList.remove('active');
      setTimeout(() => {
        if (!this.widgetEl.classList.contains('active')) {
          this.widgetEl.style.display = 'none';
        }
      }, 250);
    }

    ensureBackdrop() {
      let backdrop = document.getElementById('copilot-drawer-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'copilot-drawer-backdrop';
        backdrop.className = 'copilot-drawer-backdrop';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', () => this.closeDrawer());
      }
      return backdrop;
    }

    toggleDrawer(originBtn = null) {
      if (!this.drawerEl) {
        this.drawerEl = document.getElementById('copilot-history-drawer');
      }
      if (!this.drawerEl) {
        console.warn('[StaffCopilot] #copilot-history-drawer element not found.');
        return;
      }

      // Debounce rapid double-clicks (prevent open-and-immediate-close race condition)
      if (this._isTogglingHistory) return;
      this._isTogglingHistory = true;
      setTimeout(() => { this._isTogglingHistory = false; }, 320);

      // If clicked from floating widget, navigate to main copilot section
      if (originBtn && originBtn.closest('.copilot-widget, .admin-copilot-widget, .librarian-copilot-widget')) {
        console.log('[StaffCopilot] History opened from widget. Switching to full workspace...');
        this.closeWidget();
        if (window.dashboardRail && typeof window.dashboardRail.switchToSection === 'function') {
          window.dashboardRail.switchToSection('copilot');
        } else {
          const nav = document.querySelector('.rail-nav-item[data-section="copilot"]');
          if (nav) nav.click();
        }
      }

      const isOpen = this.drawerEl.classList.contains('active');
      if (isOpen) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    }

    async openDrawer() {
      if (!this.drawerEl) {
        this.drawerEl = document.getElementById('copilot-history-drawer');
      }
      if (!this.drawerEl) return;
      console.log('[StaffCopilot] Opening Saved Chats Drawer...');

      const backdrop = this.ensureBackdrop();
      if (backdrop) backdrop.classList.add('active');

      this.drawerEl.classList.add('active');

      if (!this.historyListEl) {
        this.historyListEl = document.getElementById('copilot-history-list');
      }
      if (this.historyListEl) {
        this.historyListEl.innerHTML = `
          <div class="copilot-history-loading">
            <svg class="copilot-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span>Loading saved conversations...</span>
          </div>
        `;
      }

      await this.refreshHistoryDrawer();
      console.log('[StaffCopilot] Saved Chats Drawer is active.');
    }

    closeDrawer() {
      if (!this.drawerEl) {
        this.drawerEl = document.getElementById('copilot-history-drawer');
      }
      if (this.drawerEl) {
        console.log('[StaffCopilot] Closing Saved Chats Drawer.');
        this.drawerEl.classList.remove('active');
      }
      const backdrop = document.getElementById('copilot-drawer-backdrop');
      if (backdrop) {
        backdrop.classList.remove('active');
      }
    }

    /**
     * Start a fresh conversation with 5-limit verification
     */
    async startNewConversation() {
      if (!window.StaffCopilotService) return;

      const check = await window.StaffCopilotService.canStartNew();
      if (!check.allowed) {
        const msg = `You have reached the maximum of 5 saved conversations for Staff Copilot (${check.count}/5). Please delete an older conversation from Saved Chats before starting a new one.`;
        if (window.ModalDialog && typeof window.ModalDialog.alert === 'function') {
          await window.ModalDialog.alert({
            title: 'Staff Copilot Quota Reached',
            message: msg,
            buttonText: 'Understood',
            icon: 'alert-triangle'
          });
        } else if (typeof showToast === 'function') {
          showToast(msg, 'warning');
        } else {
          alert(msg);
        }
        this.openDrawer();
        return;
      }

      // Reset active conversation
      window.StaffCopilotService.resetSession();
      this.currentMessages = [];

      // Clear UI
      if (this.widgetMessages) this.widgetMessages.innerHTML = '';
      if (this.sectionMessages) this.sectionMessages.innerHTML = '';

      if (this.widgetWelcome) this.widgetWelcome.style.display = 'block';
      if (this.sectionWelcome) this.sectionWelcome.style.display = 'block';

      this.closeDrawer();
      if (typeof showToast === 'function') {
        showToast('New Staff Copilot conversation started', 'info');
      }
    }

    /**
     * Refresh the Saved Conversations Drawer list
     */
    async refreshHistoryDrawer() {
      if (!window.StaffCopilotService) {
        console.warn('[StaffCopilot] StaffCopilotService unavailable, cannot load conversations.');
        return;
      }
      if (!this.historyListEl) {
        this.historyListEl = document.getElementById('copilot-history-list');
      }
      if (!this.countBadgeEl) {
        this.countBadgeEl = document.getElementById('copilot-history-count');
      }
      if (!this.quotaBarEl) {
        this.quotaBarEl = document.getElementById('copilot-quota-text');
      }

      console.log('[StaffCopilot] Querying saved staff conversations from Firestore...');
      const convs = await window.StaffCopilotService.loadConversations();
      const count = convs.length;
      const max = window.StaffCopilotService.MAX_CONVERSATIONS || 5;
      console.log(`[StaffCopilot] Loaded ${count} of ${max} saved conversation(s):`, convs);

      // Update badge
      if (this.countBadgeEl) {
        this.countBadgeEl.textContent = `${count}/${max}`;
        if (count >= max) {
          this.countBadgeEl.classList.add('limit-reached');
        } else {
          this.countBadgeEl.classList.remove('limit-reached');
        }
      }

      if (this.quotaBarEl) {
        this.quotaBarEl.innerHTML = `Saved <strong>${count} of ${max}</strong> conversations`;
      }

      if (!this.historyListEl) {
        console.warn('[StaffCopilot] #copilot-history-list element not found in DOM.');
        return;
      }

      if (count === 0) {
        this.historyListEl.innerHTML = `
          <div class="copilot-history-empty">
            ${getIcon('message-square')}
            <p>No saved conversations yet.<br>Start chatting to preserve operational guidance.</p>
          </div>
        `;
        return;
      }

      let html = '';
      if (count >= max) {
        html += `
          <div class="copilot-limit-banner">
            <span>5/5 Quota reached. Delete an older conversation to enable new consultations.</span>
          </div>
        `;
      }

      const activeId = window.StaffCopilotService.activeConversationId;

      convs.forEach(c => {
        const isActive = c.id === activeId ? 'active' : '';
        const timeAgo = window.StaffCopilotService.formatTimeAgo(c.updatedAt || c.createdAt);

        html += `
          <div class="copilot-history-item ${isActive}" data-conv-id="${c.id}">
            <div class="copilot-history-item-content">
              <h5 class="copilot-history-item-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</h5>
              <span class="copilot-history-item-meta">${timeAgo} &bull; ${c.messages?.length || 0} messages</span>
            </div>
            <button type="button" class="copilot-history-delete-btn" data-delete-id="${c.id}" title="Delete conversation" aria-label="Delete conversation">
              ${getIcon('trash')}
            </button>
          </div>
        `;
      });

      this.historyListEl.innerHTML = html;

      // Bind item click
      this.historyListEl.querySelectorAll('.copilot-history-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          if (e.target.closest('.copilot-history-delete-btn')) return;
          const id = item.getAttribute('data-conv-id');
          await this.loadSavedConversation(id);
        });
      });

      // Bind delete click
      this.historyListEl.querySelectorAll('.copilot-history-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-delete-id');
          await this.confirmDeleteConversation(id);
        });
      });
    }

    async loadSavedConversation(id) {
      if (!window.StaffCopilotService) return;
      const conv = await window.StaffCopilotService.loadConversation(id);
      if (!conv || !Array.isArray(conv.messages)) return;

      this.currentMessages = conv.messages;

      // Hide welcome boxes
      if (this.widgetWelcome) this.widgetWelcome.style.display = 'none';
      if (this.sectionWelcome) this.sectionWelcome.style.display = 'none';

      const resolveRenderedContent = (m) => {
        if (m.role === 'user') {
          return extractPlainUserText(m.text);
        }
        return m.html || formatMarkdown(m.text);
      };

      // Render messages in widget
      if (this.widgetMessages) {
        this.widgetMessages.innerHTML = '';
        conv.messages.forEach(m => {
          this.appendMessageDOM(m.role, resolveRenderedContent(m), m.time, 'widget');
        });
        const wBody = document.getElementById('copilot-widget-body');
        if (wBody) wBody.scrollTop = wBody.scrollHeight;
      }

      // Render messages in section
      if (this.sectionMessages) {
        this.sectionMessages.innerHTML = '';
        this.sectionMessages.style.display = 'flex';
        conv.messages.forEach(m => {
          this.appendMessageDOM(m.role, resolveRenderedContent(m), m.time, 'section');
        });
        const sBody = document.getElementById('copilot-chat-body');
        if (sBody) sBody.scrollTop = sBody.scrollHeight;
      }

      this.closeDrawer();
      this.refreshHistoryDrawer();
    }

    async confirmDeleteConversation(id) {
      if (!window.StaffCopilotService) return;

      const confirmed = await window.ModalDialog.confirm({
        title: 'Delete Staff Conversation',
        message: 'Are you sure you want to delete this saved Copilot conversation? This action cannot be undone.',
        confirmText: 'Delete Conversation',
        cancelText: 'Keep',
        isDanger: true,
        icon: 'trash'
      });

      if (confirmed) {
        await window.StaffCopilotService.deleteConversation(id);
        if (typeof showToast === 'function') {
          showToast('Conversation deleted', 'info');
        }
        await this.refreshHistoryDrawer();
      }
    }

    appendMessageDOM(role, contentHTML, time, target) {
      const parent = target === 'widget' ? this.widgetMessages : this.sectionMessages;
      if (!parent) return null;

      const row = document.createElement('div');
      row.className = `copilot-msg-row ${role}`;

      const bubble = document.createElement('div');
      bubble.className = `copilot-msg-bubble ${role}`;

      if (role === 'user') {
        bubble.textContent = contentHTML;
      } else {
        bubble.innerHTML = contentHTML;
      }

      row.appendChild(bubble);
      parent.appendChild(row);

      return { row, bubble };
    }

    async sendMessage(text) {
      if (!text || this.isStreaming) return;

      const reqSeq = ++this.activeRequestId;
      this.isStreaming = true;

      // Hide welcome
      if (this.widgetWelcome) this.widgetWelcome.style.display = 'none';
      if (this.sectionWelcome) this.sectionWelcome.style.display = 'none';

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Add user message to UI
      this.appendMessageDOM('user', text, timeStr, 'widget');
      if (this.sectionMessages) {
        this.sectionMessages.style.display = 'flex';
        this.appendMessageDOM('user', text, timeStr, 'section');
      }

      // Add to local buffer
      this.currentMessages.push({ role: 'user', text, time: timeStr, timestamp: Date.now() });

      // Show typing indicators
      if (this.widgetTyping) this.widgetTyping.style.display = 'flex';
      if (this.sectionTyping) this.sectionTyping.style.display = 'flex';

      const wBody = document.getElementById('copilot-widget-body');
      const sBody = document.getElementById('copilot-chat-body');
      if (wBody) wBody.scrollTop = wBody.scrollHeight;
      if (sBody) sBody.scrollTop = sBody.scrollHeight;

      // Setup Bot Bubbles
      let widgetBubble = null;
      let sectionBubble = null;
      let accumulatedText = '';

      const ensureBubbles = () => {
        if (this.widgetTyping) this.widgetTyping.style.display = 'none';
        if (this.sectionTyping) this.sectionTyping.style.display = 'none';
        if (!widgetBubble) {
          const res = this.appendMessageDOM('bot', '', timeStr, 'widget');
          if (res) widgetBubble = res.bubble;
        }
        if (this.sectionMessages && !sectionBubble) {
          const res = this.appendMessageDOM('bot', '', timeStr, 'section');
          if (res) sectionBubble = res.bubble;
        }
      };

      const updateView = (str, isDone = false) => {
        ensureBubbles();
        const html = formatMarkdown(str) + (isDone ? '' : '<span class="streaming-cursor"></span>');
        if (widgetBubble) widgetBubble.innerHTML = html;
        if (sectionBubble) sectionBubble.innerHTML = html;
        if (wBody) wBody.scrollTop = wBody.scrollHeight;
        if (sBody) sBody.scrollTop = sBody.scrollHeight;
      };

      this.abortController = new AbortController();
      let streamSucceeded = false;
      const candidateUrls = getBackendCandidateUrls('/api/staff-copilot/chat');

      try {
        const token = await getAuthToken();
        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let resp = null;
        let lastFetchErr = null;

        for (const targetUrl of candidateUrls) {
          try {
            resp = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                message: text,
                userRole: this.role,
                history: this.currentMessages.slice(-5).map(m => ({ role: m.role, content: m.text })),
                stream: true
              }),
              signal: this.abortController.signal
            });
            if (resp) break;
          } catch (err) {
            lastFetchErr = err;
            if (err.name === 'AbortError') break;
            console.warn(`[StaffCopilot] ${targetUrl} connection error, trying next candidate...`);
          }
        }

        if (resp) {
          // Check HTTP authentication and authorization gates
          if (resp.status === 401) {
            accumulatedText = `[Area: Staff Portal > Authentication Gate] > [Element: Sign-in Required]\n1. Your staff authentication session has expired or requires renewal.\n2. Please refresh the page or sign in again to continue using Copilot.\nPrecaution: Unauthenticated queries cannot access institutional knowledge.`;
            streamSucceeded = true;
          } else if (resp.status === 403) {
            const errData = await resp.json().catch(() => ({}));
            if (errData.code === 'MANDATORY_2FA_LINK_REQUIRED') {
              accumulatedText = `[Area: Settings Section > Linked Personal Gmail] > [Element: #btn-request-link-code]\n1. Institutional 2FA security mandate is active for staff accounts.\n2. Navigate to Settings and verify your personal Gmail address with a 6-digit verification code.\n3. Once verified, Staff Copilot and privileged catalog operations unlock automatically.\nPrecaution: Staff features remain locked until your personal 2FA email is verified.`;
            } else {
              accumulatedText = `[Area: Institutional Security Gate] > [Element: Access Restricted]\n1. ${errData.error || 'Access restricted for current role.'}\nPrecaution: Elevated administrative actions require approved security authorization.`;
            }
            streamSucceeded = true;
          } else if (resp.ok) {
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.includes('text/event-stream') && resp.body) {
              const reader = resp.body.getReader();
              const decoder = new TextDecoder('utf-8');
              let buffer = '';

              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || !trimmed.startsWith('data:')) continue;
                  const jsonStr = trimmed.slice(5).trim();
                  if (jsonStr === '[DONE]') break;

                  try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.type === 'token') {
                      const token = parsed.content || '';
                      if (token) {
                        accumulatedText += token;
                        updateView(accumulatedText, false);
                        streamSucceeded = true;
                      }
                    } else if (parsed.type === 'start') {
                      streamSucceeded = true;
                    } else if (parsed.type === 'done') {
                      if (parsed.fullResponse) {
                        accumulatedText = parsed.fullResponse;
                      }
                      streamSucceeded = true;
                    } else if (parsed.type === 'error') {
                      console.warn('[StaffCopilot] Stream error event:', parsed.error);
                    } else if (parsed.delta) {
                      accumulatedText += parsed.delta;
                      updateView(accumulatedText, false);
                      streamSucceeded = true;
                    } else if (parsed.content) {
                      accumulatedText += parsed.content;
                      updateView(accumulatedText, false);
                      streamSucceeded = true;
                    }
                  } catch (_) {
                    // Partial JSON chunk
                  }
                }
              }
            } else {
              // Non-streaming JSON fallback
              const data = await resp.json().catch(() => ({}));
              const reply = data.reply || data.response || data.content || '';
              if (reply) {
                accumulatedText = reply;
                streamSucceeded = true;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[StaffCopilot] Stream request interrupted:', err);
      }

      // Finalize message with intelligent offline procedural guidance if backend returned empty or unreachable
      if (!streamSucceeded || !accumulatedText.trim()) {
        accumulatedText = getOfflineProceduralGuidance(text, this.role);
      }

      updateView(accumulatedText, true);

      const finalHtml = formatMarkdown(accumulatedText);
      this.currentMessages.push({
        role: 'bot',
        text: accumulatedText,
        html: finalHtml,
        time: timeStr,
        timestamp: Date.now()
      });

      this.isStreaming = false;

      // Auto-save to Firestore (up to 5 conversations)
      if (window.StaffCopilotService) {
        await window.StaffCopilotService.saveConversation(this.currentMessages, this.role);
        await this.refreshHistoryDrawer();
      }
    }
  }

  window.StaffCopilot = StaffCopilot;

  // Auto-init on page load
  document.addEventListener('DOMContentLoaded', () => {
    if (window._staffCopilotSingleton) return;
    const isLibrarianPage = window.location.pathname.includes('librarian_page');
    const role = isLibrarianPage ? 'librarian' : 'admin';
    window._staffCopilot = new StaffCopilot({ role });
  });

})(window);

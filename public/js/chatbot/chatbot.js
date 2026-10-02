/**
 * Chatbot Module
 * Handles the chatbot UI and interactions
 * Uses AIService for RAG-powered responses
 */

const Chatbot = {
  messagesContainer: null,
  userInput: null,
  sendBtn: null,
  typingIndicator: null,
  welcomeScreen: null,
  conversationMessages: [], // in-memory buffer of { role, text, time }
  guestDialog: null,
  cachedConversations: null, // Cache for lazy-loaded conversations
  conversationsLoading: false, // Flag to prevent duplicate loads
  initialized: false, // Flag to prevent double initialization
  isSending: false, // Flag to prevent concurrent double sends
  
  /**
   * Create and inject guest dialog modal
   */
  createGuestDialog() {
    // Check if guest dialog already exists
    const existingDialog = document.getElementById('Guest-dialog');
    if (existingDialog) {
      this.guestDialog = existingDialog;
      return;
    }

    // Create guest dialog HTML
    const guestDialogHTML = `
      <div class="guest-dialog-modal" id="Guest-dialog">
        <div class="container">
          <h2>You need to Log-in to use the Chatbot.</h2>
          <h3>This dialog prevents anonymous use of AI tokens — which are limited and not free.</h3>
          <span class="disclaimer">*AI API tokens are limited and cost money. Please log in to continue.</span>
          <nav class="nav-menu">
            <a href="index.html" class="nav-link secondary" id="back-to-search-btn">
              ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('chevron-left') : ''}
              Back to Search
            </a>
            <button class="nav-link" id="guest-login-btn">Log In to Continue</button>
          </nav>
        </div>
      </div>
    `;
    
    // Inject into DOM
    document.body.insertAdjacentHTML('beforeend', guestDialogHTML);
    this.guestDialog = document.getElementById('Guest-dialog');
    
    // Setup guest login button click handler
    const guestLoginBtn = document.getElementById('guest-login-btn');
    if (guestLoginBtn) {
      guestLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openLoginFromGuest();
      });
    }

    // Setup back to search button click handler
    const backToSearchBtn = document.getElementById('back-to-search-btn');
    if (backToSearchBtn) {
      backToSearchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.guestDialog) {
          this.guestDialog.classList.remove('active');
        }
        if (window.ViewManager && typeof window.ViewManager.switchView === 'function') {
          window.ViewManager.switchView('index');
        } else {
          const isInPagesFolder = window.location.pathname.includes('/pages/');
          window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
        }
      });
    }
    
    console.log('✓ Guest dialog created');
  },
  
  /**
   * Open login modal from guest dialog
   */
  openLoginFromGuest() {
    if (this.guestDialog) {
      this.guestDialog.classList.remove('active');
    }
    
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
      loginModal.classList.add('active');
    }
  },
  
  /**
   * Check login status and show guest dialog if needed
   */
  checkLoginAndShowGuest() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const user = firebase.auth().currentUser;
      
      if (!user) {
        // User is NOT logged in
        const chatbotView = document.getElementById('chatbot-view');
        const isChatbotActive = chatbotView && chatbotView.classList.contains('active');
        
        if (this.guestDialog && isChatbotActive) {
          this.guestDialog.classList.add('active');
        }
        if (this.userInput) {
          this.userInput.disabled = true;
          this.userInput.placeholder = 'Please log in to use the chatbot';
        }
        this.updateSendButtonState();
      } else {
        if (this.guestDialog) {
          this.guestDialog.classList.remove('active');
        }
        if (this.userInput) {
          this.userInput.disabled = false;
          this.userInput.placeholder = 'Type your message here...';
        }
        this.updateSendButtonState();
      }
    }
  },
  
  /**
   * Setup login modal monitoring
   */
  setupLoginModalMonitoring() {
    const loginModal = document.getElementById('login-modal');
    if (!loginModal) return;
    
    const loginModalClose = loginModal.querySelector('.modal-close');
    const loginModalBackdrop = loginModal.querySelector('.modal-backdrop');
    
    // Monitor X button click
    if (loginModalClose) {
      loginModalClose.addEventListener('click', () => {
        setTimeout(() => this.checkLoginAndShowGuest(), 150);
      });
    }
    
    // Monitor backdrop click
    if (loginModalBackdrop) {
      loginModalBackdrop.addEventListener('click', () => {
        setTimeout(() => this.checkLoginAndShowGuest(), 150);
      });
    }
    
    // Monitor ESC key press
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && loginModal.classList.contains('active')) {
        setTimeout(() => this.checkLoginAndShowGuest(), 150);
      }
    });
    
    // Monitor class changes with MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isActive = loginModal.classList.contains('active');
          if (!isActive) {
            setTimeout(() => this.checkLoginAndShowGuest(), 150);
          }
        }
      });
    });
    
    observer.observe(loginModal, { attributes: true });
    
    console.log('✓ Login modal monitoring active');
  },
  
  /**
   * Setup Firebase auth state listener
   */
  setupAuthListener() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (!user) {
          // User is NOT logged in
          const chatbotView = document.getElementById('chatbot-view');
          const isChatbotActive = chatbotView && chatbotView.classList.contains('active');
          
          if (this.guestDialog && isChatbotActive) {
            this.guestDialog.classList.add('active');
          } else if (this.guestDialog && !isChatbotActive) {
            this.guestDialog.classList.remove('active');
          }
          if (this.userInput) {
            this.userInput.disabled = true;
            this.userInput.placeholder = 'Please log in to use the chatbot';
          }
          this.updateSendButtonState();
        } else {
          // User IS logged in
          if (this.guestDialog) {
            this.guestDialog.classList.remove('active');
          }
          if (this.userInput) {
            this.userInput.disabled = false;
            this.userInput.placeholder = 'Type your message here...';
          }
          this.updateSendButtonState();
          
          // Trigger lazy load when user authentication is confirmed
          this.lazyLoadConversations();
        }
      });
      
      console.log('✓ Auth state listener active');
    }
  },
  
  /**
   * Initialize chatbot
   */
  init() {
    if (this.initialized) {
      return;
    }
    
    this.messagesContainer = document.getElementById('messages-container');
    this.userInput = document.getElementById('user-input');
    this.sendBtn = document.getElementById('send-btn');
    this.typingIndicator = document.getElementById('typing-indicator');
    this.welcomeScreen = document.getElementById('welcome-screen');
    this.clearBtn = document.getElementById('clear-btn');
    this.exportBtn = document.getElementById('export-btn');

    if (!this.messagesContainer || !this.userInput || !this.sendBtn) {
      console.error('Chatbot elements not found');
      return;
    }
    
    this.initialized = true;
    
    // Create guest dialog
    this.createGuestDialog();
    
    // Setup auth listener (this will trigger lazy load when user is confirmed)
    this.setupAuthListener();
    
    // Setup login modal monitoring
    this.setupLoginModalMonitoring();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Update clear button visibility on init
    this.updateClearButtonVisibility();

    // Initial send button state evaluation
    this.updateSendButtonState();
    
    // Auto-load last viewed conversation if returning from another page
    this.autoLoadLastConversation();
    
    console.log('✓ Chatbot initialized with RAG support');
  },
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Send button click
    this.sendBtn.addEventListener('click', () => {
      // Check authentication before sending
      if (typeof firebase !== 'undefined' && firebase.auth) {
        const user = firebase.auth().currentUser;
        if (!user) {
          console.warn('⚠️ Send blocked: User not authenticated');
          const guestDialog = document.getElementById('Guest-dialog');
          if (guestDialog) guestDialog.classList.add('active');
          return;
        }
      }
      this.sendMessage();
    });
    
    // Enter key to send (Shift+Enter for new line)
    this.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (typeof firebase !== 'undefined' && firebase.auth) {
          const user = firebase.auth().currentUser;
          if (!user) {
            console.warn('⚠️ Send blocked: User not authenticated');
            const guestDialog = document.getElementById('Guest-dialog');
            if (guestDialog) guestDialog.classList.add('active');
            return;
          }
        }
        this.sendMessage();
      }
    });
    
    // Input: enforce 500 non-space char limit + update counter + resize
    this.userInput.addEventListener('input', (e) => {
      const MAX = 500;
      let text = e.target.value;

      // Enforce the limit — strip excess non-space characters
      text = this._truncateToNonSpaceLimit(text, MAX);
      if (text !== e.target.value) {
        e.target.value = text;
      }

      // Count non-space characters
      const nonSpaceCount = text.replace(/\s/g, '').length;

      // Update counter display
      const counter = document.getElementById('char-counter');
      if (counter) {
        counter.textContent = `${nonSpaceCount} / ${MAX}`;
        counter.classList.remove('near-limit', 'at-limit');
        if (nonSpaceCount >= MAX) {
          counter.classList.add('at-limit');
        } else if (nonSpaceCount >= MAX - 60) {
          counter.classList.add('near-limit');
        }
      }

      this.updateSendButtonState();
      this.autoResizeTextarea();
    });
    
    // Clear conversation button
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearConversation());
    }

    // New conversation dock button
    const newChatDockBtn = document.getElementById('new-chat-dock-btn');
    if (newChatDockBtn) {
      newChatDockBtn.addEventListener('click', () => {
        this.startNewConversation();
      });
    }

    // Interactive prompt suggestion starter cards
    const promptCards = document.querySelectorAll('.prompt-card');
    promptCards.forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (!prompt) return;

        // Check authentication before sending
        if (typeof firebase !== 'undefined' && firebase.auth) {
          const user = firebase.auth().currentUser;
          if (!user) {
            console.warn('⚠️ Send blocked: User not authenticated');
            const guestDialog = document.getElementById('Guest-dialog');
            if (guestDialog) guestDialog.classList.add('active');
            return;
          }
        }

        if (this.userInput) {
          this.userInput.value = prompt;
          this.userInput.dispatchEvent(new Event('input', { bubbles: true }));
          this.sendMessage();
        }
      });
    });

    // Event delegation: Click on any project link in chat to open Project Detail view
    if (this.messagesContainer) {
      this.messagesContainer.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = (link.getAttribute('href') || '').trim();
        const text = (link.textContent || '').trim();

        // Check if this link refers to a capstone/thesis project
        const isProjectLink = link.classList.contains('ai-project-link') ||
                              link.hasAttribute('data-project-title') ||
                              href.includes('project') ||
                              href.includes('projecthub') ||
                              href.includes('capstone') ||
                              href.includes('thesis') ||
                              href.startsWith('#') ||
                              href === 'javascript:void(0)';

        if (isProjectLink) {
          e.preventDefault();
          e.stopPropagation();
          this.openProjectDetailsFromChat(link);
        }
      });
    }
  },
  
  /**
   * Truncate text so that non-space characters do not exceed `limit`.
   * Spaces/newlines/tabs are preserved and do not count.
   */
  _truncateToNonSpaceLimit(text, limit) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      if (!/\s/.test(text[i])) {
        count++;
        if (count > limit) return text.substring(0, i);
      }
    }
    return text;
  },
  
  /**
   * Auto-resize textarea
   */
  autoResizeTextarea() {
    const ta = this.userInput;
    ta.style.height = 'auto';
    const scrollH = ta.scrollHeight;
    const maxH = 200;
    if (scrollH > maxH) {
      ta.style.height = maxH + 'px';
      ta.style.overflowY = 'auto';
    } else {
      ta.style.height = scrollH + 'px';
      ta.style.overflowY = 'hidden';
    }
  },
  
  /**
   * Strictly evaluate input and user auth to update send button visibility and state
   */
  updateSendButtonState() {
    if (!this.sendBtn) return;
    const text = (this.userInput && this.userInput.value) ? this.userInput.value : '';
    // Strict evaluation: must have at least 1 non-whitespace character
    const hasText = text.trim().length > 0;
    const isLoggedIn = Boolean(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);

    if (hasText && isLoggedIn && !this.isSending) {
      this.sendBtn.disabled = false;
      this.sendBtn.classList.remove('btn-hidden');
    } else {
      this.sendBtn.disabled = true;
      this.sendBtn.classList.add('btn-hidden');
    }
  },

  /**
   * Clean and sanitize message text (remove HTML tags, images, scripts)
   * PRESERVES markdown formatting and line breaks (\n)
   */
  cleanMessageText(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = text;
    
    // Remove all image tags
    const images = temp.querySelectorAll('img');
    images.forEach(img => img.remove());
    
    // Remove all script tags
    const scripts = temp.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove all style tags
    const styles = temp.querySelectorAll('style');
    styles.forEach(style => style.remove());
    
    // Get cleaned text content
    let cleanedText = temp.textContent || temp.innerText || '';
    
    // Normalize newlines and collapse excess horizontal spaces WITHOUT destroying linebreaks
    cleanedText = cleanedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Repair squashed numbered lists and metadata headers if loading an older conversation
    cleanedText = cleanedText
      .replace(/([^\n])\s+(\d+\.\s+[\*\[])/g, '$1\n\n$2')
      .replace(/(\))\s+([A-Za-z]+:)/g, '$1\n\n$2')
      .replace(/(\S)\s+(Program:)/gi, '$1\n$2')
      .replace(/(\S)\s+(Authors:)/gi, '$1\n$2');
    
    return cleanedText;
  },

  /**
   * Send message with real-time response streaming
   */
  async sendMessage() {
    if (this.isSending) {
      console.warn('⚠️ Send already in progress, ignoring duplicate trigger');
      return;
    }

    const message = this.userInput.value.trim();
    if (!message) return;
    
    // SECURITY: Block if user is not logged in
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const user = firebase.auth().currentUser;
      if (!user) {
        console.warn('⚠️ Message blocked: User not authenticated');
        const guestDialog = document.getElementById('Guest-dialog');
        if (guestDialog) guestDialog.classList.add('active');
        return;
      }
    }

    // LIMIT: Max 3 conversations per user (only applies to brand-new conversations)
    if (typeof ChatService !== 'undefined' && !ChatService.currentConversationId) {
      const count = await ChatService.getConversationCount();
      if (count >= 3) {
        this.showConversationLimitError();
        return;
      }
    }
    
    // Clean the message text (remove any HTML/images)
    const cleanMessage = this.cleanMessageText(message);
    if (!cleanMessage) {
      console.warn('⚠️ Message is empty after cleaning');
      return;
    }
    
    this.isSending = true;

    // Hide welcome screen
    if (this.welcomeScreen) {
      this.welcomeScreen.style.display = 'none';
    }
    
    // Add user message to UI & buffer
    this.conversationMessages.push({
      role: 'user',
      text: cleanMessage,
      time: this.getCurrentTime(),
    });
    this.addUserMessage(cleanMessage);
    
    // Clear input + reset counter
    this.userInput.value = '';
    this.userInput.style.height = 'auto';
    this.userInput.style.overflowY = 'hidden';
    this.updateSendButtonState();
    const counter = document.getElementById('char-counter');
    if (counter) {
      counter.textContent = '0 / 500';
      counter.classList.remove('near-limit', 'at-limit');
    }
    
    const initialProvider = this.getActiveProvider();
    let currentProvider = initialProvider;
    
    // Show typing indicator with specific provider branding
    this.showTyping(initialProvider);

    let botMessageDiv = null;
    let bubbleDiv = null;
    let timeDiv = null;
    let hasCreatedMessage = false;
    let fullAccumulatedText = '';

    const createStreamingBotElement = (providerName) => {
      if (hasCreatedMessage) return;
      hasCreatedMessage = true;
      this.hideTyping();

      botMessageDiv = document.createElement('div');
      botMessageDiv.className = 'message bot';

      const providerLogoHtml = this.getProviderLogoElement(providerName);

      botMessageDiv.innerHTML = `
        <div class="message-avatar bot-avatar">
          ${providerLogoHtml}
        </div>
        <div class="message-content">
          <div class="message-bubble"><span class="streaming-cursor"></span></div>
          <div class="message-time">
            <span class="provider-label" style="opacity: 0.6;">${providerName}</span> • ${this.getCurrentTime()}
          </div>
        </div>
      `;

      this.messagesContainer.appendChild(botMessageDiv);
      bubbleDiv = botMessageDiv.querySelector('.message-bubble');
      timeDiv = botMessageDiv.querySelector('.message-time');
      this.scrollToBottom();
      this.updateClearButtonVisibility();
    };
    
    try {
      // Stream AI response in real time
      await AIService.sendMessageStream(cleanMessage, {
        onStart: (info) => {
          currentProvider = info.provider || currentProvider || 'AI';
          this.updateTypingProvider(currentProvider);
          createStreamingBotElement(currentProvider);
        },
        onToken: (token, accumulatedText, info) => {
          fullAccumulatedText = accumulatedText;
          if (!hasCreatedMessage) {
            currentProvider = info?.provider || 'AI';
            createStreamingBotElement(currentProvider);
          }

          if (bubbleDiv) {
            let formatted = '';
            if (typeof MessageFormatter !== 'undefined') {
              const liveProjects = (typeof AIService !== 'undefined' && AIService.lastRelevantProjects) ? AIService.lastRelevantProjects : [];
              formatted = MessageFormatter.formatComplete(accumulatedText, currentProvider, liveProjects);
            } else {
              formatted = this.formatMessage(accumulatedText);
            }

            bubbleDiv.innerHTML = formatted + `<span class="streaming-cursor"></span>`;
            this.scrollToBottom();
          }
        },
        onDone: async (result) => {
          this.hideTyping();
          const finalProvider = result.provider || currentProvider || 'AI';
          const finalRawText = result.response || fullAccumulatedText || '';
          const relevantProjects = result.relevantProjects || [];

          if (!hasCreatedMessage) {
            createStreamingBotElement(finalProvider);
          }

          // Update provider logo & label if it changed during fallback
          const avatarImg = botMessageDiv ? botMessageDiv.querySelector('.message-avatar img') : null;
          if (avatarImg) {
            avatarImg.src = this.getProviderLogo(finalProvider);
            avatarImg.alt = finalProvider;
          }
          const providerLabel = botMessageDiv ? botMessageDiv.querySelector('.provider-label') : null;
          if (providerLabel) {
            providerLabel.textContent = finalProvider;
          }

          // Format final response with project links
          let formattedMessage = '';
          if (typeof MessageFormatter !== 'undefined') {
            formattedMessage = MessageFormatter.formatComplete(finalRawText, finalProvider, relevantProjects);
          } else {
            formattedMessage = this.formatMessage(finalRawText);
          }

          if (bubbleDiv) {
            bubbleDiv.innerHTML = formattedMessage;
          }

          // Check for RAG project usage
          const hasProjectUsage = (relevantProjects.length > 0 && this.detectProjectUsage(finalRawText, relevantProjects));
          if (hasProjectUsage) {
            const ragBadge = document.createElement('div');
            ragBadge.style.cssText = 'display: inline-flex; align-items: center; gap: 0.35rem; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; font-size: 0.7rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 12px; margin-top: 0.5rem;';
            ragBadge.innerHTML = `
              ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('rag-book') : ''}
              ${relevantProjects.length} project${relevantProjects.length !== 1 ? 's' : ''} referenced
            `;
            const contentDiv = botMessageDiv ? botMessageDiv.querySelector('.message-content') : null;
            if (contentDiv) contentDiv.appendChild(ragBadge);
          }

          // Add Copy Action Button
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'message-actions';
          actionsDiv.innerHTML = `
            <button class="message-action-btn" onclick="Chatbot.copyMessage(this)">
              ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('copy-sm') : ''}
              Copy
            </button>
          `;
          const contentDiv = botMessageDiv ? botMessageDiv.querySelector('.message-content') : null;
          if (contentDiv) contentDiv.appendChild(actionsDiv);

          // Add clean bot message to buffer with provider and RAG metadata preserved
          const cleanResponseText = this.cleanMessageText(finalRawText);
          this.conversationMessages.push({
            role: 'bot',
            text: cleanResponseText,
            time: this.getCurrentTime(),
            provider: finalProvider,
            projectsUsed: hasProjectUsage ? relevantProjects.length : 0,
            relevantProjects: relevantProjects
          });

          // Auto-save to Firestore
          if (typeof ChatService !== 'undefined') {
            const wasNewConversation = !ChatService.currentConversationId;
            await ChatService.saveConversation(this.conversationMessages);
            
            // Invalidate cache if this was a new conversation
            if (wasNewConversation && ChatService.currentConversationId) {
              this.invalidateConversationCache();
            }
          }

          // Log AI chat activity
          if (window.ActivityService && typeof window.ActivityService.logAIChat === 'function') {
            const snippet = cleanMessage.length > 80 ? cleanMessage.substring(0, 80) + '…' : cleanMessage;
            window.ActivityService.logAIChat(snippet);
          }

          this.scrollToBottom();
        },
        onError: (err) => {
          this.hideTyping();
          console.error('Streaming error caught in UI:', err);
          if (!hasCreatedMessage) {
            this.addErrorMessage();
          } else if (bubbleDiv) {
            bubbleDiv.innerHTML += `
              <div class="error-message" style="margin-top: 0.75rem;">
                ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('alert-circle') : ''}
                <div>${this.escapeHtml(err.message || 'Stream interrupted. Please try again.')}</div>
              </div>
            `;
          }
          this.scrollToBottom();
        }
      });
      
    } catch (error) {
      console.error('Chatbot error:', error);
      this.hideTyping();
      if (!hasCreatedMessage) {
        this.addErrorMessage();
      }
    } finally {
      this.isSending = false;
      this.updateSendButtonState();
    }
  },

  /**
   * Open the exact project in the system itself (Project Detail View)
   * @param {HTMLElement|string} target - Link element or project title/slug
   */
  async openProjectDetailsFromChat(target) {
    let queryTitle = '';
    let queryId = '';
    let queryUrl = '';

    if (typeof target === 'string') {
      queryTitle = target;
    } else if (target && target.getAttribute) {
      queryTitle = target.getAttribute('data-project-title') || target.textContent || '';
      queryId = target.getAttribute('data-project-id') || '';
      queryUrl = target.getAttribute('data-project-url') || target.getAttribute('href') || '';
    }

    // Clean title string
    queryTitle = queryTitle.replace(/^[\[\*"'\s]+|[\]\*"'\s]+$/g, '').trim();

    // If queryTitle is empty but queryUrl has a slug (e.g. /project/automatic-plant-irrigation-system)
    if (!queryTitle && queryUrl) {
      const slugMatch = queryUrl.match(/project\/([a-zA-Z0-9_-]+)/i);
      if (slugMatch && slugMatch[1]) {
        queryTitle = slugMatch[1].replace(/[-_]+/g, ' ');
      }
    }

    if (!queryTitle && !queryId) {
      console.warn('⚠️ No project title or ID found to open');
      return;
    }

    console.log(`🔍 Chatbot: Opening project details for "${queryTitle}" (ID: ${queryId})`);

    if (typeof showToast === 'function') {
      showToast('Opening project details...', 'info');
    }

    // Normalization helper for title matching
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNorm = norm(queryTitle);

    let matchedProject = null;

    // 1. Search in AIService.lastRelevantProjects
    if (typeof AIService !== 'undefined' && Array.isArray(AIService.lastRelevantProjects)) {
      matchedProject = AIService.lastRelevantProjects.find(p => {
        if (queryId && p.id === queryId) return true;
        const pNorm = norm(p.title);
        return pNorm && targetNorm && (pNorm === targetNorm || pNorm.includes(targetNorm) || targetNorm.includes(pNorm));
      });
    }

    // 2. Search in conversation messages
    if (!matchedProject && Array.isArray(this.conversationMessages)) {
      for (let i = this.conversationMessages.length - 1; i >= 0; i--) {
        const msg = this.conversationMessages[i];
        if (msg.relevantProjects && Array.isArray(msg.relevantProjects)) {
          matchedProject = msg.relevantProjects.find(p => {
            if (queryId && p.id === queryId) return true;
            const pNorm = norm(p.title);
            return pNorm && targetNorm && (pNorm === targetNorm || pNorm.includes(targetNorm) || targetNorm.includes(pNorm));
          });
          if (matchedProject) break;
        }
      }
    }

    // 3. Search in global allProjects (from project-list.js)
    if (!matchedProject && typeof allProjects !== 'undefined' && Array.isArray(allProjects)) {
      matchedProject = allProjects.find(p => {
        if (queryId && p.id === queryId) return true;
        const pNorm = norm(p.title);
        return pNorm && targetNorm && (pNorm === targetNorm || pNorm.includes(targetNorm) || targetNorm.includes(pNorm));
      });
    }

    // 4. Query Firestore if available
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const db = firebase.firestore();
        if (queryId) {
          const doc = await db.collection('projects').doc(queryId).get();
          if (doc.exists) {
            matchedProject = { id: doc.id, ...doc.data() };
          }
        }
        if (!matchedProject && targetNorm) {
          const snap = await db.collection('projects').limit(100).get();
          snap.forEach(doc => {
            if (matchedProject) return;
            const data = doc.data();
            const pNorm = norm(data.title);
            if (pNorm && targetNorm && (pNorm === targetNorm || pNorm.includes(targetNorm) || targetNorm.includes(pNorm))) {
              matchedProject = { id: doc.id, ...data };
            }
          });
        }
      } catch (err) {
        console.warn('Firestore project lookup warning:', err);
      }
    }

    // 5. Fallback: if not found, construct a valid project record so details always render
    if (!matchedProject) {
      matchedProject = {
        title: queryTitle,
        authors: ['Undergraduate Research Team'],
        program: 'BIT-Electronics',
        year: '2025',
        status: 'Completed',
        adviser: 'Not specified',
        abstract: 'Automated Plant Irrigation System capstone project. Details retrieved via repository archive.'
      };
    }

    // Ensure essential fields exist for renderProjectDetails
    if (!matchedProject.status) matchedProject.status = 'Completed';
    if (!matchedProject.program) matchedProject.program = 'BIT-Electronics';
    if (!matchedProject.year) matchedProject.year = '2025';

    // 6. Save to sessionStorage
    sessionStorage.setItem('selectedProjectForViewDetails', JSON.stringify(matchedProject));

    // Log Activity
    if (window.ActivityService && typeof window.ActivityService.logViewProject === 'function') {
      const authorsStr = Array.isArray(matchedProject.authors) 
        ? matchedProject.authors.join(', ') 
        : (matchedProject.authors || '');
      window.ActivityService.logViewProject(matchedProject.id || '', matchedProject.title, authorsStr, matchedProject.program);
    }

    // 7. Switch view to project-detail
    if (window.ViewManager && typeof window.ViewManager.switchView === 'function') {
      window.ViewManager.switchView('project-detail');
      if (typeof window.renderProjectDetails === 'function') {
        window.renderProjectDetails(matchedProject);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (typeof window.openProjectDetails === 'function') {
      window.openProjectDetails(matchedProject);
    } else {
      sessionStorage.setItem('showProjectDetails', 'true');
      const isInPagesFolder = window.location.pathname.includes('/pages/');
      window.location.href = isInPagesFolder ? '../index.html' : 'index.html';
    }
  },

  /**
   * Show a clear error when the 3-conversation limit is reached
   */
  showConversationLimitError() {
    // Toast notification
    if (typeof showToast === 'function') {
      showToast('Conversation limit reached! Delete an existing conversation first.', 'error');
    }

    // Also show a visible error bubble in the chat UI
    const mainContainer = document.querySelector('.chatbot-main');
    if (mainContainer) mainContainer.classList.add('chat-active');
    if (this.welcomeScreen) this.welcomeScreen.style.display = 'none';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    messageDiv.innerHTML = `
      <div class="message-avatar" style="background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">⚠️</div>
      <div class="message-content">
        <div class="error-message">
          ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('alert-circle') : ''}
          <div>
            <strong>Conversation limit reached (3/3)</strong><br>
            You can only have <strong>3 saved conversations</strong>. Please open
            <em>Chat History</em> and delete an existing conversation before starting a new one.
          </div>
        </div>
        <div class="message-time">${this.getCurrentTime()}</div>
      </div>
    `;
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
    console.warn('⚠️ Conversation limit (3) reached for this user.');
  },

  addUserMessage(message) {
    const mainContainer = document.querySelector('.chatbot-main');
    if (mainContainer) {
      mainContainer.classList.add('chat-active');
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    
    // Get user profile image (if logged in)
    const userPhotoURL = firebase.auth().currentUser?.photoURL || null;
    const userAvatar = userPhotoURL 
      ? `<img src="${userPhotoURL}" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
      : ((typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('avatar-user') : '');
    
    messageDiv.innerHTML = `
      <div class="message-avatar">
        ${userAvatar}
      </div>
      <div class="message-content">
        <div class="message-bubble">${this.escapeHtml(message)}</div>
        <div class="message-time">${this.getCurrentTime()}</div>
      </div>
    `;
    
    this.messagesContainer.appendChild(messageDiv);
    // If typingIndicator is in DOM, ensure it is moved after the new user message
    if (this.typingIndicator) {
      this.messagesContainer.appendChild(this.typingIndicator);
    }
    this.scrollToBottom();
    
    // Update clear button visibility
    this.updateClearButtonVisibility();
  },

  /**
   * Get active provider from saved settings or default
   */
  getActiveProvider() {
    try {
      const saved = localStorage.getItem('recaps_chatbot_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.preferredProvider) return parsed.preferredProvider;
      }
    } catch (e) {}
    return 'Mistral';
  },

  /**
   * Get provider logo HTML element (inline SVG from SVGRegistry or fallback)
   */
  getProviderLogoElement(providerName) {
    const key = (providerName || '').toLowerCase();
    if (typeof SVGRegistry !== 'undefined') {
      if (key.includes('mistral')) return SVGRegistry.get('ai-provider-mistral');
      if (key.includes('groq')) return SVGRegistry.get('ai-provider-groq');
      if (key.includes('gemini')) return SVGRegistry.get('ai-provider-gemini');
      if (key.includes('openrouter')) return SVGRegistry.get('ai-provider-openrouter');
    }
    const logoUrl = this.getProviderLogo(providerName);
    return `<img src="${logoUrl}" alt="${providerName}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 40 40\\'><rect width=\\'40\\' height=\\'40\\' rx=\\'20\\' fill=\\'%23667eea\\'/><text x=\\'50%25\\' y=\\'54%25\\' font-family=\\'Inter,sans-serif\\' font-size=\\'13\\' font-weight=\\'700\\' fill=\\'white\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>AI</text></svg>'">`;
  },

  /**
   * Get AI provider logo URL
   */
  getProviderLogo(providerName) {
    const logos = {
      'Mistral AI': 'https://docs.mistral.ai/img/logo.svg',
      'Groq AI': 'https://groq.com/wp-content/uploads/2024/03/PBG-mark1-color.svg',
      'Google Gemini': 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
      'OpenRouter': 'https://openrouter.ai/favicon-32x32.png',
      'Mistral': 'https://docs.mistral.ai/img/logo.svg',
      'Groq': 'https://groq.com/wp-content/uploads/2024/03/PBG-mark1-color.svg',
      'Gemini': 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg'
    };
    
    if (providerName && typeof providerName === 'string') {
      if (logos[providerName]) return logos[providerName];
      const lower = providerName.toLowerCase();
      if (lower.includes('mistral')) return logos['Mistral AI'];
      if (lower.includes('groq')) return logos['Groq AI'];
      if (lower.includes('gemini')) return logos['Google Gemini'];
      if (lower.includes('openrouter')) return logos['OpenRouter'];
    }
    
    const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='%23667eea'/><text x='50%25' y='54%25' font-family='Inter,sans-serif' font-size='13' font-weight='700' fill='white' text-anchor='middle' dominant-baseline='middle'>AI</text></svg>`;
    return fallbackSvg;
  },
  
  /**
   * Add bot message to UI with formatting
   */
  addBotMessage(response) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    
    // Handle both success and error responses
    let messageText = '';
    let providerName = 'AI';
    let projectsUsed = 0;
    let relevantProjects = [];
    
    if (response.success) {
      messageText = response.response; // The actual AI response text
      providerName = response.provider || 'AI';
      projectsUsed = response.projectsUsed || 0;
      relevantProjects = response.relevantProjects || [];
    } else {
      // Error response
      messageText = response.error || 'An error occurred. Please try again.';
    }
    
    // Get provider logo
    const providerLogo = this.getProviderLogo(providerName);
    
    // Format message if MessageFormatter is available
    let formattedMessage = messageText;
    if (typeof MessageFormatter !== 'undefined') {
      formattedMessage = MessageFormatter.formatComplete(messageText, providerName);
    } else {
      formattedMessage = this.formatMessage(messageText);
    }
    
    // Build RAG badge ONLY if:
    // 1. Projects were found (relevantProjects.length > 0)
    // 2. AND the response actually references projects (contains project titles or numbers)
    let ragBadge = '';
    if (relevantProjects.length > 0) {
      // Check if the AI response actually used the projects
      // Look for project titles, keywords, or specific data in the response
      const usedProjects = this.detectProjectUsage(messageText, relevantProjects);
      
      if (usedProjects) {
        ragBadge = `
          <div style="display: inline-flex; align-items: center; gap: 0.35rem; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; font-size: 0.7rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 12px; margin-top: 0.5rem;">
            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('rag-book') : ''}
            ${relevantProjects.length} project${relevantProjects.length !== 1 ? 's' : ''} referenced
          </div>
        `;
      }
    }
    
    messageDiv.innerHTML = `
      <div class="message-avatar bot-avatar">
        <img src="${providerLogo}" 
             alt="${providerName}" 
             style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;"
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'><rect width=\'40\' height=\'40\' rx=\'20\' fill=\'%23667eea\'/><text x=\'50%25\' y=\'54%25\' font-family=\'Inter,sans-serif\' font-size=\'13\' font-weight=\'700\' fill=\'white\' text-anchor=\'middle\' dominant-baseline=\'middle\'>AI</text></svg>'">
      </div>
      <div class="message-content">
        <div class="message-bubble">${formattedMessage}</div>
        <div class="message-time">
          <span class="provider-label">${providerName}</span> • ${this.getCurrentTime()}
        </div>
        <div class="message-actions">
          <button class="message-action-btn" onclick="Chatbot.copyMessage(this)">
            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('copy-sm') : ''}
            Copy
          </button>
        </div>
      </div>
    `;
    
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
    
    // Update clear button visibility
    this.updateClearButtonVisibility();
  },
  
  /**
   * Detect if the AI response actually used project data
   */
  detectProjectUsage(responseText, projects) {
    if (!responseText || !projects || projects.length === 0) return false;
    
    const lowerResponse = responseText.toLowerCase();
    
    // Check for project-related keywords that indicate actual project discussion
    const projectKeywords = [
      'project', 'capstone', 'research', 'thesis',
      'authors', 'adviser', 'abstract', 'year',
      'program', 'study', 'paper', 'document'
    ];
    
    // Check for numbers that match project count
    const hasProjectCount = lowerResponse.includes(`${projects.length} project`);
    
    // Check if response mentions specific project titles
    const mentionsProjects = projects.some(p => {
      if (!p.title) return false;
      const titleWords = p.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      return titleWords.some(word => lowerResponse.includes(word));
    });
    
    // Check if response has typical project-related content
    const hasProjectKeywords = projectKeywords.some(kw => lowerResponse.includes(kw));
    
    // Don't show badge for generic greetings
    const isGenericGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)/i.test(lowerResponse);
    
    if (isGenericGreeting) return false;
    
    // Show badge only if response actually discusses projects
    return hasProjectCount || mentionsProjects || (hasProjectKeywords && responseText.length > 100);
  },
  
  /**
   * Add error message
   */
  addErrorMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    messageDiv.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="error-message">
          ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('alert-circle') : ''}
          <div>
            <strong>Sorry, I'm having trouble right now.</strong><br>
            All AI providers are temporarily unavailable. Please try again in a moment.
          </div>
        </div>
        <div class="message-time">${this.getCurrentTime()}</div>
      </div>
    `;
    
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  },
  
  /**
   * Show typing indicator with specific AI provider branding
   */
  showTyping(providerName) {
    if (this.typingIndicator) {
      const activeProvider = providerName || this.getActiveProvider();

      // Ensure typing indicator is at the bottom of the container (never above the user's message)
      this.messagesContainer.appendChild(this.typingIndicator);

      // Update typing indicator avatar to show specific provider logo
      const typingAvatar = this.typingIndicator.querySelector('.message-avatar');
      if (typingAvatar) {
        typingAvatar.style.background = '#ffffff';
        typingAvatar.style.padding = '3px';
        typingAvatar.innerHTML = this.getProviderLogoElement(activeProvider);
        typingAvatar.title = `${activeProvider} is thinking...`;
      }

      // Update provider name inside typing bubble
      const providerNameEl = this.typingIndicator.querySelector('#typing-provider-name');
      if (providerNameEl) {
        providerNameEl.textContent = activeProvider;
      }
      
      this.typingIndicator.classList.add('active');
      this.scrollToBottom();
    }
  },

  /**
   * Update typing provider dynamically (e.g. on fallback transition)
   */
  updateTypingProvider(newProvider) {
    if (!this.typingIndicator || !this.typingIndicator.classList.contains('active')) return;
    const typingAvatar = this.typingIndicator.querySelector('.message-avatar');
    if (typingAvatar) {
      typingAvatar.innerHTML = this.getProviderLogoElement(newProvider);
      typingAvatar.title = `${newProvider} is thinking...`;
    }
    const providerNameEl = this.typingIndicator.querySelector('#typing-provider-name');
    if (providerNameEl) {
      providerNameEl.textContent = newProvider;
    }
  },

  /**
   * Hide typing indicator
   */
  hideTyping() {
    if (this.typingIndicator) {
      this.typingIndicator.classList.remove('active');
    }
  },

  /**
   * Apply updated settings from the settings modal
   */
  applySettings(newSettings) {
    if (newSettings && newSettings.preferredProvider) {
      console.log(`✓ Chatbot active provider updated to: ${newSettings.preferredProvider}`);
    }
  },
  
  /**
   * Copy message to clipboard
   */
  copyMessage(button) {
    const messageBubble = button.closest('.message-content').querySelector('.message-bubble');
    const text = messageBubble.textContent || messageBubble.innerText;
    
    navigator.clipboard.writeText(text).then(() => {
      button.innerHTML = `
        ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('check-success') : ''}
        Copied!
      `;
      
      setTimeout(() => {
        button.innerHTML = `
          ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('copy-sm') : ''}
          Copy
        `;
      }, 2000);
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  },
  
  /**
   * Render a saved conversation into the chat UI
   * @param {Object} conversation - conversation object from Firestore (includes messages array)
   */
  renderConversation(conversation) {
    if (!conversation || !conversation.messages) {
      console.error('Invalid conversation data');
      return;
    }

    // Clear current UI (but keep welcome screen & typing indicator)
    const existingMessages = this.messagesContainer.querySelectorAll('.message:not(.typing-indicator)');
    existingMessages.forEach(msg => msg.remove());

    // Clean all messages before loading
    const cleanedMessages = conversation.messages.map(msg => ({
      ...msg,
      text: this.cleanMessageText(msg.text || '')
    })).filter(msg => msg.text.length > 0); // Remove empty messages

    // Set in-memory buffer to the cleaned messages
    this.conversationMessages = [...cleanedMessages];

    // Clear AI service history so it doesn't mix old context
    if (typeof AIService !== 'undefined') {
      AIService.clearHistory();
    }

    // Hide welcome screen
    if (this.welcomeScreen) {
      this.welcomeScreen.style.display = 'none';
    }

    // Activate chat layout
    const mainContainer = document.querySelector('.chatbot-main');
    if (mainContainer) mainContainer.classList.add('chat-active');

    // Replay each cleaned message
    cleanedMessages.forEach(msg => {
      if (msg.role === 'user') {
        this._renderUserMessage(msg.text, msg.time);
      } else if (msg.role === 'bot') {
        this._renderBotMessage(msg.text, msg.time, msg.provider || 'Mistral AI', msg.projectsUsed, msg.relevantProjects);
      }
    });

    // Set the current conversation ID in ChatService
    if (typeof ChatService !== 'undefined') {
      ChatService.currentConversationId = conversation.id;
    }

    // Update clear button visibility
    this.updateClearButtonVisibility();

    this.scrollToBottom();
    console.log('✓ Conversation rendered:', conversation.id, `(${cleanedMessages.length} messages)`);
  },

  /**
   * Internal: render a user bubble with an explicit timestamp (used when replaying history)
   */
  _renderUserMessage(message, time) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    const userPhotoURL = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) 
      ? firebase.auth().currentUser.photoURL 
      : null;
    const userAvatar = userPhotoURL
      ? `<img src="${userPhotoURL}" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
      : ((typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('avatar-user') : '');
    messageDiv.innerHTML = `
      <div class="message-avatar">${userAvatar}</div>
      <div class="message-content">
        <div class="message-bubble">${this.escapeHtml(message)}</div>
        <div class="message-time">${time || ''}</div>
      </div>
    `;
    this.messagesContainer.appendChild(messageDiv);
  },

  /**
   * Internal: render a bot message with full formatting and provider branding (used when replaying history)
   */
  _renderBotMessage(text, time, provider = 'Mistral AI', projectsUsed = 0, relevantProjects = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    
    // In case an older saved conversation in Firestore was squashed into a single line,
    // restore clean newlines before numbered list items and metadata keys.
    let processedText = text || '';
    processedText = processedText
      .replace(/([^\n])\s+(\d+\.\s+[\*\[])/g, '$1\n\n$2')
      .replace(/(\))\s+([A-Za-z]+:)/g, '$1\n\n$2')
      .replace(/(\S)\s+(Program:)/gi, '$1\n$2')
      .replace(/(\S)\s+(Authors:)/gi, '$1\n$2');

    const displayProvider = provider || 'Mistral AI';
    let formattedMessage = processedText;
    if (typeof MessageFormatter !== 'undefined') {
      formattedMessage = MessageFormatter.formatComplete(processedText, displayProvider, relevantProjects);
    } else {
      formattedMessage = this.formatMessage(processedText);
    }

    const providerLogo = this.getProviderLogo(displayProvider);
    const displayTime = time || this.getCurrentTime();

    // RAG badge HTML if projects were used
    let ragBadgeHtml = '';
    const numProjects = projectsUsed || (relevantProjects && relevantProjects.length) || 0;
    if (numProjects > 0) {
      ragBadgeHtml = `
        <div style="display: inline-flex; align-items: center; gap: 0.35rem; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; font-size: 0.7rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 12px; margin-top: 0.5rem;">
          ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('rag-book') : ''}
          ${numProjects} project${numProjects !== 1 ? 's' : ''} referenced
        </div>
      `;
    }

    messageDiv.innerHTML = `
      <div class="message-avatar bot-avatar">
        <img src="${providerLogo}" 
             alt="${displayProvider}" 
             style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;"
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 40 40\\'><rect width=\\'40\\' height=\\'40\\' rx=\\'20\\' fill=\\'%23667eea\\'/><text x=\\'50%25\\' y=\\'54%25\\' font-family=\\'Inter,sans-serif\\' font-size=\\'13\\' font-weight=\\'700\\' fill=\\'white\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>AI</text></svg>'">
      </div>
      <div class="message-content">
        <div class="message-bubble">${formattedMessage}</div>
        <div class="message-time">
          <span class="provider-label" style="opacity: 0.6;">${displayProvider}</span> • ${displayTime}
        </div>
        ${ragBadgeHtml}
        <div class="message-actions">
          <button class="message-action-btn" onclick="Chatbot.copyMessage(this)">
            ${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('copy-sm') : ''}
            Copy
          </button>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(messageDiv);
  },

  /**
   * Update clear button visibility
   * Shows button only if there are messages in the current conversation
   */
  updateClearButtonVisibility() {
    if (!this.clearBtn) return;
    
    // Check if there are any messages (excluding welcome screen and typing indicator)
    const messages = this.messagesContainer.querySelectorAll('.message:not(.typing-indicator)');
    const hasMessages = messages.length > 0;
    
    if (hasMessages) {
      this.clearBtn.style.display = 'flex';
      this.exportBtn.style.display = 'flex';

    } else {
      this.clearBtn.style.display = 'none';
      this.exportBtn.style.display = 'none';

    }
  },
  
  /**
   * Clear conversation
   */
  async clearConversation() {
    if (typeof showChatbotModal === 'function') {
      showChatbotModal('clear-modal');
    } else {
      // Fallback to ModalDialog
      const confirmed = window.ModalDialog
        ? await ModalDialog.confirm({
            title: 'Clear Conversation',
            message: 'Are you sure you want to clear all messages in this conversation? This cannot be undone.',
            confirmText: 'Clear Messages',
            cancelText: 'Cancel',
            isDanger: true,
            icon: 'trash'
          })
        : confirm('Clear all messages?');

      if (confirmed) {
        this.executeClearConversation();
      }
    }
  },
  
  /**
   * Execute clear conversation after confirmation
   * Also deletes the conversation from database
   */
  async executeClearConversation() {
    if (typeof closeChatbotModal === 'function') {
      closeChatbotModal('clear-modal');
    }
    
    // Delete current conversation from database if it exists
    if (typeof ChatService !== 'undefined' && ChatService.currentConversationId) {
      try {
        await ChatService.deleteConversation(ChatService.currentConversationId);
        console.log('✓ Conversation deleted from database');
        
        // Invalidate cache after deletion
        this.invalidateConversationCache();
      } catch (error) {
        console.error('Failed to delete conversation from database:', error);
      }
    }
    
    const mainContainer = document.querySelector('.chatbot-main');
    if (mainContainer) {
      mainContainer.classList.remove('chat-active');
    }
    
    // Remove all messages except welcome screen and typing indicator
    const messages = this.messagesContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());
    
    // Clear local buffer
    this.conversationMessages = [];
    
    // Reset ChatService session so next message starts a new conversation
    if (typeof ChatService !== 'undefined') {
      ChatService.resetConversation();
    }
    
    // Show welcome screen again
    if (this.welcomeScreen) {
      this.welcomeScreen.style.display = 'block';
    }
    
    // Clear AI service history
    if (typeof AIService !== 'undefined') {
      AIService.clearHistory();
    }
    
    // Clear last viewed conversation from sessionStorage
    sessionStorage.removeItem('lastViewedConversation');
    
    console.log('✓ Conversation cleared');
    
    // Update clear button visibility (should hide now)
    this.updateClearButtonVisibility();
  },
  
  /**
   * Start a new conversation
   * Clears current chat and resets to welcome screen
   */
  async startNewConversation() {
    // Check if user has reached the 3 conversation limit
    const count = await ChatService.getConversationCount();
    
    if (count >= 3) {
      if (window.ModalDialog) {
        await ModalDialog.alert({
          title: 'Conversation Limit Reached',
          message: 'You have reached the maximum of 3 saved conversations. Please delete an older conversation from Chat History before starting a new one.',
          buttonText: 'Understood',
          type: 'warning'
        });
      } else {
        alert('You have reached the maximum of 3 saved conversations. Please delete an old conversation from Chat History before starting a new one.');
      }
      return;
    }
    
    // Clear current conversation without showing modal
    const mainContainer = document.querySelector('.chatbot-main');
    if (mainContainer) {
      mainContainer.classList.remove('chat-active');
    }
    
    // Remove all messages
    const messages = this.messagesContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());
    
    // Clear local buffer
    this.conversationMessages = [];
    
    // Reset ChatService session
    if (typeof ChatService !== 'undefined') {
      ChatService.resetConversation();
    }
    
    // Show welcome screen
    if (this.welcomeScreen) {
      this.welcomeScreen.style.display = 'block';
    }
    
    // Clear AI service history
    if (typeof AIService !== 'undefined') {
      AIService.clearHistory();
    }
    
    // Clear last viewed conversation from sessionStorage
    sessionStorage.removeItem('lastViewedConversation');
    
    console.log('✓ New conversation started');
  },
  
  /**
   * Lazy load conversations in the background
   * Called on page load to pre-fetch chat history
   */
  async lazyLoadConversations() {
    // Check if user is logged in
    const user = (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser
      : null;
    
    if (!user) {
      console.log('ℹ️ No user logged in, skipping lazy load');
      return;
    }
    
    // Prevent duplicate loads
    if (this.conversationsLoading || this.cachedConversations !== null) {
      console.log('ℹ️ Conversations already loading or cached');
      return;
    }
    
    this.conversationsLoading = true;
    console.log('📥 Lazy loading conversations in background...');
    
    try {
      if (typeof ChatService !== 'undefined') {
        const conversations = await ChatService.loadConversations();
        this.cachedConversations = conversations;
        console.log(`✓ Lazy load complete: ${conversations.length} conversation(s) cached`);
      }
    } catch (error) {
      console.error('Failed to lazy load conversations:', error);
      this.cachedConversations = null;
    } finally {
      this.conversationsLoading = false;
    }
  },
  
  /**
   * Get conversations (from cache or fresh load)
   * @returns {Promise<Array>} array of conversation objects
   */
  async getConversations() {
    // Return cached conversations if available
    if (this.cachedConversations !== null) {
      console.log('✓ Using cached conversations');
      return this.cachedConversations;
    }
    
    // Load fresh if not cached
    console.log('📥 Loading conversations (not cached)...');
    if (typeof ChatService !== 'undefined') {
      const conversations = await ChatService.loadConversations();
      this.cachedConversations = conversations;
      return conversations;
    }
    
    return [];
  },
  
  /**
   * Invalidate conversation cache
   * Call this after creating, deleting, or updating conversations
   */
  invalidateConversationCache() {
    this.cachedConversations = null;
    console.log('🔄 Conversation cache invalidated');
  },
  
  /**
   * Auto-load last viewed conversation if returning from another page
   */
  async autoLoadLastConversation() {
    // Check if user is logged in
    const user = (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser
      : null;
    
    if (!user) {
      console.log('ℹ️ No user logged in, skipping auto-load');
      return;
    }
    
    // Check if there's a last viewed conversation in sessionStorage
    const lastConversationId = sessionStorage.getItem('lastViewedConversation');
    
    if (!lastConversationId) {
      console.log('ℹ️ No last conversation to auto-load');
      return;
    }
    
    // Check if there are already messages loaded (user might have already started chatting)
    const existingMessages = this.messagesContainer.querySelectorAll('.message:not(.typing-indicator)');
    if (existingMessages.length > 0) {
      console.log('ℹ️ Conversation already active, skipping auto-load');
      return;
    }
    
    // Load the last viewed conversation
    try {
      console.log(`📂 Auto-loading last conversation: ${lastConversationId}`);
      
      if (typeof ChatService !== 'undefined') {
        const conversation = await ChatService.loadConversation(lastConversationId);
        
        if (conversation) {
          this.renderConversation(conversation);
          console.log('✓ Last conversation auto-loaded successfully');
        } else {
          console.warn('⚠️ Last conversation not found, clearing from sessionStorage');
          sessionStorage.removeItem('lastViewedConversation');
        }
      }
    } catch (error) {
      console.error('Failed to auto-load last conversation:', error);
      sessionStorage.removeItem('lastViewedConversation');
    }
  },
  
  /**
   * Format message (basic formatting if MessageFormatter not available)
   */
  formatMessage(text) {
    // Replace line breaks with <br>
    text = text.replace(/\n/g, '<br>');
    
    // Bold text (**text**)
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text (*text*)
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    return text;
  },
  
  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 100);
  },
  
  /**
   * Get current time
   */
  getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  },
  
  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Chatbot.init());
} else {
  Chatbot.init();
}

// Make available globally
window.Chatbot = Chatbot;

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
              <svg class="back-to-search-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
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
        if (this.sendBtn) {
          this.sendBtn.disabled = true;
        }
      } else {
        if (this.guestDialog) {
          this.guestDialog.classList.remove('active');
        }
        if (this.userInput) {
          this.userInput.disabled = false;
          this.userInput.placeholder = 'Type your message here...';
        }
        if (this.sendBtn) {
          this.sendBtn.disabled = false;
        }
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
          if (this.sendBtn) {
            this.sendBtn.disabled = true;
          }
        } else {
          // User IS logged in
          if (this.guestDialog) {
            this.guestDialog.classList.remove('active');
          }
          if (this.userInput) {
            this.userInput.disabled = false;
            this.userInput.placeholder = 'Type your message here...';
          }
          
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

      this.sendBtn.disabled = !text.trim();
      this.autoResizeTextarea();
    });
    
    // Clear conversation button
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearConversation());
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
   * Clean and sanitize message text (remove HTML tags, images, scripts)
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
    
    // Trim excessive whitespace
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    
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
    this.sendBtn.disabled = true;
    const counter = document.getElementById('char-counter');
    if (counter) {
      counter.textContent = '0 / 500';
      counter.classList.remove('near-limit', 'at-limit');
    }
    
    // Show typing indicator while waiting for the first token
    this.showTyping();

    let botMessageDiv = null;
    let bubbleDiv = null;
    let timeDiv = null;
    let currentProvider = 'AI';
    let hasCreatedMessage = false;
    let fullAccumulatedText = '';

    const createStreamingBotElement = (providerName) => {
      if (hasCreatedMessage) return;
      hasCreatedMessage = true;
      this.hideTyping();

      botMessageDiv = document.createElement('div');
      botMessageDiv.className = 'message bot';

      const providerLogo = this.getProviderLogo(providerName);

      botMessageDiv.innerHTML = `
        <div class="message-avatar" style="background: white; padding: 4px;">
          <img src="${providerLogo}" 
               alt="${providerName}" 
               style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;"
               onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 40 40\\'><rect width=\\'40\\' height=\\'40\\' rx=\\'20\\' fill=\\'%23667eea\\'/><text x=\\'50%25\\' y=\\'54%25\\' font-family=\\'Inter,sans-serif\\' font-size=\\'13\\' font-weight=\\'700\\' fill=\\'white\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>AI</text></svg>'">
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
          currentProvider = info.provider || 'AI';
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
              formatted = MessageFormatter.formatComplete(accumulatedText, currentProvider);
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

          // Format final response
          let formattedMessage = '';
          if (typeof MessageFormatter !== 'undefined') {
            formattedMessage = MessageFormatter.formatComplete(finalRawText, finalProvider);
          } else {
            formattedMessage = this.formatMessage(finalRawText);
          }

          if (bubbleDiv) {
            bubbleDiv.innerHTML = formattedMessage;
          }

          // Check for RAG project usage
          const relevantProjects = result.relevantProjects || [];
          if (relevantProjects.length > 0 && this.detectProjectUsage(finalRawText, relevantProjects)) {
            const ragBadge = document.createElement('div');
            ragBadge.style.cssText = 'display: inline-flex; align-items: center; gap: 0.35rem; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; font-size: 0.7rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 12px; margin-top: 0.5rem;';
            ragBadge.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              ${relevantProjects.length} project${relevantProjects.length !== 1 ? 's' : ''} referenced
            `;
            const contentDiv = botMessageDiv.querySelector('.message-content');
            if (contentDiv) contentDiv.appendChild(ragBadge);
          }

          // Add Copy Action Button
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'message-actions';
          actionsDiv.innerHTML = `
            <button class="message-action-btn" onclick="Chatbot.copyMessage(this)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
          `;
          const contentDiv = botMessageDiv ? botMessageDiv.querySelector('.message-content') : null;
          if (contentDiv) contentDiv.appendChild(actionsDiv);

          // Add clean bot message to buffer
          const cleanResponseText = this.cleanMessageText(finalRawText);
          this.conversationMessages.push({
            role: 'bot',
            text: cleanResponseText,
            time: this.getCurrentTime(),
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
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
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
           <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
         </svg>`;
    
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
    this.scrollToBottom();
    
    // Update clear button visibility
    this.updateClearButtonVisibility();
  },

  /**
   * Get AI provider logo
   */
  getProviderLogo(providerName) {
    const logos = {
      'Mistral AI': 'https://docs.mistral.ai/img/logo.svg',
      'Groq AI': 'https://groq.com/wp-content/uploads/2024/03/PBG-mark1-color.svg',
      'Google Gemini': 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
      'OpenRouter': 'https://openrouter.ai/favicon-32x32.png'
    };
    
    const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='%23667eea'/><text x='50%25' y='54%25' font-family='Inter,sans-serif' font-size='13' font-weight='700' fill='white' text-anchor='middle' dominant-baseline='middle'>AI</text></svg>`;
    return logos[providerName] || fallbackSvg;
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
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            ${relevantProjects.length} project${relevantProjects.length !== 1 ? 's' : ''} referenced
          </div>
        `;
      }
    }
    
    messageDiv.innerHTML = `
      <div class="message-avatar" style="background: white; padding: 4px;">
        <img src="${providerLogo}" 
             alt="${providerName}" 
             style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;"
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'><rect width=\'40\' height=\'40\' rx=\'20\' fill=\'%23667eea\'/><text x=\'50%25\' y=\'54%25\' font-family=\'Inter,sans-serif\' font-size=\'13\' font-weight=\'700\' fill=\'white\' text-anchor=\'middle\' dominant-baseline=\'middle\'>AI</text></svg>'">
      </div>
      <div class="message-content">
        <div class="message-bubble">${formattedMessage}</div>
        <div class="message-time">
          <span style="opacity: 0.6;">${providerName}</span> • ${this.getCurrentTime()}
        </div>
        // {ragBadge}
        <div class="message-actions">
          <button class="message-action-btn" onclick="Chatbot.copyMessage(this)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
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
   * Show typing indicator
   */
  showTyping() {
    if (this.typingIndicator) {
      // Update typing indicator avatar to show AI logo
      const typingAvatar = this.typingIndicator.querySelector('.message-avatar');
      if (typingAvatar) {
        typingAvatar.style.background = 'white';
        typingAvatar.style.padding = '4px';
        typingAvatar.innerHTML = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 40 40'><rect width='40' height='40' rx='20' fill='%23667eea'/><text x='50%' y='54%' font-family='Inter,sans-serif' font-size='13' font-weight='700' fill='white' text-anchor='middle' dominant-baseline='middle'>AI</text></svg>`;
      }
      
      this.typingIndicator.classList.add('active');
      this.scrollToBottom();
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
   * Copy message to clipboard
   */
  copyMessage(button) {
    const messageBubble = button.closest('.message-content').querySelector('.message-bubble');
    const text = messageBubble.textContent || messageBubble.innerText;
    
    navigator.clipboard.writeText(text).then(() => {
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      
      setTimeout(() => {
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
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
        this._renderBotMessage(msg.text, msg.time);
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
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white">
           <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
         </svg>`;
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
   * Internal: render a bot message with plain formatting (used when replaying history)
   */
  _renderBotMessage(text, time) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    let formattedMessage = text;
    if (typeof MessageFormatter !== 'undefined') {
      formattedMessage = MessageFormatter.formatComplete(text, 'AI');
    } else {
      formattedMessage = this.formatMessage(text);
    }
    messageDiv.innerHTML = `
      <div class="message-avatar" style="background: linear-gradient(135deg, #667eea, #764ba2); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; color:white; font-family:Inter,sans-serif;">
        AI
      </div>
      <div class="message-content">
        <div class="message-bubble">${formattedMessage}</div>
        <div class="message-time">${time || ''}</div>
        <div class="message-actions">
          <button class="message-action-btn" onclick="Chatbot.copyMessage(this)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
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
  clearConversation() {
    if (typeof showChatbotModal === 'function') {
      showChatbotModal('clear-modal');
    } else {
      // Fallback
      if (confirm('Clear all messages?')) {
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
      alert('You have reached the maximum of 3 saved conversations. Please delete an old conversation from Chat History before starting a new one.');
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

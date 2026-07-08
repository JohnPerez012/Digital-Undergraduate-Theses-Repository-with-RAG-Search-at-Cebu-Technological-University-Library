// =====================================
// AI CHATBOT WIDGET - GEMINI POWERED
// =====================================

(function() {
    'use strict';

    // ========== CONFIGURATION ==========
    const CONFIG = {
        GEMINI_API_KEY: 'AIzaSyD-cx4ujJ2RUq6TZ8fUaNetft05OuTW4vk', // Using the same Firebase API key
        GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        MAX_HISTORY: 20,
        STORAGE_KEY: 'recaps_chatbot_history',
        TYPING_DELAY: 1500,
        WELCOME_SUGGESTIONS: [
            { icon: '📚', text: 'How do I submit a capstone project?' },
            { icon: '🔍', text: 'Search for projects by year' },
            { icon: '👤', text: 'How do I update my profile?' },
            { icon: '💡', text: 'What are the project requirements?' }
        ],
        QUICK_ACTIONS: [
            '📊 View Projects',
            '📝 Submit Project',
            '👥 Manage Users',
            '📈 Analytics',
            '⚙️ Settings'
        ]
    };

    // ========== STATE ==========
    let chatState = {
        isOpen: false,
        conversationHistory: [],
        unreadCount: 0,
        currentUser: null,
        currentPage: null,
        isStandalone: false
    };

    // ========== DOM ELEMENTS ==========
    let elements = {
        button: null,
        window: null,
        messagesContainer: null,
        welcomeScreen: null,
        input: null,
        sendBtn: null,
        typingIndicator: null,
        badge: null
    };

    // ========== INITIALIZATION ==========
    function init() {
        console.log('🤖 Initializing AI Chatbot...');
        
        // Get current user and page context
        detectUserContext();
        detectPageContext();
        
        // Check if we are on the standalone chatbot page
        chatState.isStandalone = document.getElementById('messages-container') !== null && document.getElementById('user-input') !== null;
        
        // Create chatbot UI (must be BEFORE loadConversationHistory)
        createChatbotUI();
        
        // Load conversation history
        loadConversationHistory();
        
        // Attach event listeners
        attachEventListeners();
        
        console.log('✅ AI Chatbot initialized');
    }

    // ========== USER CONTEXT ==========
    function detectUserContext() {
        // Try to get current user from Firebase Auth
        if (typeof firebase !== 'undefined' && firebase.auth()) {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    chatState.currentUser = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName || user.email
                    };
                    
                    // Try to get user role from Firestore
                    if (firebase.firestore) {
                        firebase.firestore().collection('users').doc(user.uid).get()
                            .then(doc => {
                                if (doc.exists) {
                                    chatState.currentUser.role = doc.data().userType || 'student';
                                }
                            })
                            .catch(err => console.warn('Could not fetch user role:', err));
                    }
                }
            });
        }
    }

    // ========== PAGE CONTEXT ==========
    function detectPageContext() {
        const path = window.location.pathname;
        if (path.includes('admin')) chatState.currentPage = 'admin';
        else if (path.includes('teacher')) chatState.currentPage = 'teacher';
        else if (path.includes('library')) chatState.currentPage = 'librarian';
        else if (path.includes('student')) chatState.currentPage = 'student';
        else if (path.includes('about')) chatState.currentPage = 'about';
        else chatState.currentPage = 'home';
    }

    // ========== CREATE UI ==========
    function createChatbotUI() {
        if (chatState.isStandalone) {
            chatState.isOpen = true; // Always active in standalone mode
            elements.messagesContainer = document.getElementById('messages-container');
            elements.welcomeScreen = document.getElementById('welcome-screen');
            elements.input = document.getElementById('user-input');
            elements.sendBtn = document.getElementById('send-btn');
            elements.typingIndicator = document.getElementById('typing-indicator');
            return;
        }

        // Create floating button
        const button = document.createElement('button');
        button.className = 'chatbot-button';
        button.setAttribute('aria-label', 'Open AI Chatbot');
        button.innerHTML = `
            <svg class="chatbot-icon-chat" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <svg class="chatbot-icon-close" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
        `;
        elements.button = button;

        // Create badge
        const badge = document.createElement('span');
        badge.className = 'chatbot-badge';
        badge.style.display = 'none';
        badge.textContent = '0';
        button.appendChild(badge);
        elements.badge = badge;

        // Create chat window
        const chatWindow = document.createElement('div');
        chatWindow.className = 'chatbot-window';
        chatWindow.innerHTML = `
            <div class="chatbot-header">
                <div class="chatbot-avatar">🤖</div>
                <div class="chatbot-header-info">
                    <div class="chatbot-header-title">RE-CAPS AI Assistant</div>
                    <div class="chatbot-header-status">
                        <span class="chatbot-status-dot"></span>
                        Online
                    </div>
                </div>
                <div class="chatbot-header-actions">
                    <button class="chatbot-header-btn" id="chatbot-clear" title="Clear conversation">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="chatbot-messages" id="chatbot-messages">
                <div class="chatbot-welcome" id="chatbot-welcome">
                    <div class="chatbot-welcome-icon">👋</div>
                    <h3>Welcome to RE-CAPS AI!</h3>
                    <p>I'm here to help you navigate the Research and Capstone Project Archiving System. Ask me anything!</p>
                    <div class="chatbot-suggestions" id="chatbot-suggestions"></div>
                </div>

                <div class="chatbot-typing" id="chatbot-typing">
                    <div class="chatbot-message-avatar">🤖</div>
                    <div class="chatbot-typing-bubble">
                        <span class="chatbot-typing-dot"></span>
                        <span class="chatbot-typing-dot"></span>
                        <span class="chatbot-typing-dot"></span>
                    </div>
                </div>
            </div>

            <div class="chatbot-input-container">
                <div class="chatbot-quick-actions" id="chatbot-quick-actions"></div>
                <div class="chatbot-input-wrapper">
                    <textarea 
                        class="chatbot-input" 
                        id="chatbot-input" 
                        placeholder="Type your message..."
                        rows="1"
                    ></textarea>
                    <button class="chatbot-send-btn" id="chatbot-send" disabled>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
        elements.window = chatWindow;

        // Get references
        elements.messagesContainer = chatWindow.querySelector('#chatbot-messages');
        elements.welcomeScreen = chatWindow.querySelector('#chatbot-welcome');
        elements.input = chatWindow.querySelector('#chatbot-input');
        elements.sendBtn = chatWindow.querySelector('#chatbot-send');
        elements.typingIndicator = chatWindow.querySelector('#chatbot-typing');

        // Append to body
        document.body.appendChild(button);
        document.body.appendChild(chatWindow);

        // Render welcome suggestions
        renderWelcomeSuggestions();
        renderQuickActions();
    }

    // ========== WELCOME SUGGESTIONS ==========
    function renderWelcomeSuggestions() {
        const container = document.getElementById('chatbot-suggestions');
        if (!container) return;

        container.innerHTML = CONFIG.WELCOME_SUGGESTIONS.map(suggestion => `
            <button class="chatbot-suggestion" data-text="${suggestion.text}">
                <span>${suggestion.icon}</span>
                <span>${suggestion.text}</span>
            </button>
        `).join('');

        // Attach click handlers
        container.querySelectorAll('.chatbot-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text');
                sendMessage(text);
            });
        });
    }

    // ========== QUICK ACTIONS ==========
    function renderQuickActions() {
        const container = document.getElementById('chatbot-quick-actions');
        if (!container) return;

        container.innerHTML = CONFIG.QUICK_ACTIONS.map(action => `
            <button class="chatbot-quick-action" data-action="${action}">${action}</button>
        `).join('');

        // Attach click handlers
        container.querySelectorAll('.chatbot-quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                sendMessage(`Help me with: ${action}`);
            });
        });
    }

    // ========== EVENT LISTENERS ==========
    function attachEventListeners() {
        // Toggle chat window
        if (elements.button) {
            elements.button.addEventListener('click', toggleChatWindow);
        }

        // Send message on button click
        if (elements.sendBtn) {
            elements.sendBtn.addEventListener('click', () => {
            const message = elements.input.value.trim();
            if (message) {
                sendMessage(message);
            }
        });

        // Send message on Enter (Shift+Enter for new line)
        elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const message = elements.input.value.trim();
                if (message) {
                    sendMessage(message);
                }
            }
        });

        // Enable/disable send button based on input
        elements.input.addEventListener('input', () => {
            const hasText = elements.input.value.trim().length > 0;
            elements.sendBtn.disabled = !hasText;
            
            // Auto-resize textarea
            elements.input.style.height = 'auto';
            elements.input.style.height = elements.input.scrollHeight + 'px';
        });

        // Clear conversation
        const clearBtn = document.getElementById(chatState.isStandalone ? 'clear-btn' : 'chatbot-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearConversation);
        }

        // Keyboard shortcut: Ctrl+K to focus chatbot
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (!chatState.isOpen) {
                    toggleChatWindow();
                }
                elements.input.focus();
            }
        });
    }

    // ========== TOGGLE WINDOW ==========
    function toggleChatWindow() {
        chatState.isOpen = !chatState.isOpen;
        
        if (chatState.isOpen) {
            elements.button.classList.add('active');
            elements.window.classList.add('active');
            elements.input.focus();
            
            // Reset unread count
            chatState.unreadCount = 0;
            updateBadge();
            
            // Scroll to bottom
            scrollToBottom();
        } else {
            elements.button.classList.remove('active');
            elements.window.classList.remove('active');
        }
    }

    // ========== SEND MESSAGE ==========
    async function sendMessage(text) {
        if (!text || text.trim().length === 0) return;

        // Add user message to UI
        addMessage('user', text);
        
        // Add to conversation history
        chatState.conversationHistory.push({
            role: 'user',
            content: text,
            timestamp: Date.now()
        });

        // Clear input
        elements.input.value = '';
        elements.input.style.height = 'auto';
        elements.sendBtn.disabled = true;

        // Hide welcome screen
        if (elements.welcomeScreen) {
            elements.welcomeScreen.style.display = 'none';
        }

        // Show typing indicator
        showTypingIndicator();

        // Get AI response
        try {
            const response = await getAIResponse(text);
            hideTypingIndicator();
            addMessage('bot', response);
            
            // Add to conversation history
            chatState.conversationHistory.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            });

            // Save to localStorage
            saveConversationHistory();
        } catch (error) {
            hideTypingIndicator();
            addMessage('bot', '❌ Sorry, I encountered an error. Please try again.', true);
            console.error('Chatbot error:', error);
        }
    }

    // ========== GET AI RESPONSE ==========
    async function getAIResponse(userMessage) {
        // Build context-aware system prompt
        const systemContext = buildSystemContext();
        
        // Prepare conversation history for API
        const messages = chatState.conversationHistory
            .slice(-10) // Last 10 messages for context
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));

        // Add system context as first message
        messages.unshift({
            role: 'user',
            parts: [{ text: systemContext }]
        });

        // Add current message
        messages.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        try {
            const response = await fetch(`${CONFIG.GEMINI_API_URL}?key=${CONFIG.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: messages,
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    }

    // ========== BUILD SYSTEM CONTEXT ==========
    function buildSystemContext() {
        let context = `You are an AI assistant for RE-CAPS (Research and Capstone Project Archiving System), a web-based platform for managing academic capstone projects.

SYSTEM OVERVIEW:
- RE-CAPS is a capstone project archiving system for academic institutions
- It allows students to submit projects, teachers to review them, librarians to catalog them, and admins to manage everything
- The system supports multiple roles: Admin, Librarian, Teacher, Student

YOUR ROLE:
- Help users navigate the system
- Answer questions about features and functionality
- Provide guidance on how to complete tasks
- Be friendly, helpful, and concise
- Use emojis sparingly for emphasis

ROLE PERMISSIONS:
- Admin: Full system access, can create librarian accounts, manage all users and projects
- Librarian: Manage project archive and catalog, cannot create user accounts
- Teacher: View projects and students, manage own classes and submissions
- Student: Submit and view own projects, browse archived projects

CURRENT CONTEXT:
- Page: ${chatState.currentPage}`;

        if (chatState.currentUser) {
            context += `\n- User: ${chatState.currentUser.displayName} (${chatState.currentUser.role || 'student'})`;
        } else {
            context += `\n- User: Not logged in (anonymous visitor)`;
        }

        context += `\n\nREMEMBER:
- Keep responses concise (2-3 sentences for simple questions)
- Provide step-by-step instructions when needed
- If you don't know something, admit it and suggest where to find help
- Be context-aware based on the current page and user role`;

        return context;
    }

    // ========== ADD MESSAGE TO UI ==========
    function addMessage(type, text, isError = false) {
        const messageDiv = document.createElement('div');
        const prefix = chatState.isStandalone ? '' : 'chatbot-';
        messageDiv.className = `${prefix}message ${type}`;
        
        const avatar = type === 'user' ? 
            (chatState.currentUser?.displayName?.charAt(0).toUpperCase() || '👤') : 
            '🤖';

        const time = new Date().toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        if (isError) {
            messageDiv.innerHTML = `
                <div class="${prefix}message-avatar">${avatar}</div>
                <div class="${prefix}message-content">
                    <div class="${chatState.isStandalone ? 'error-message' : 'chatbot-error'}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>${text}</span>
                    </div>
                    <div class="${prefix}message-time">${time}</div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="${prefix}message-avatar">${avatar}</div>
                <div class="${prefix}message-content">
                    <div class="${prefix}message-bubble">${formatMessage(text)}</div>
                    <div class="${prefix}message-time">${time}</div>
                    ${type === 'bot' ? `
                        <div class="${prefix}message-actions">
                            <button class="${prefix}message-action-btn" onclick="window.chatbot.copyMessage(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Insert before typing indicator
        elements.messagesContainer.insertBefore(messageDiv, elements.typingIndicator);
        
        // Scroll to bottom
        scrollToBottom();

        // If window is closed, increment unread count
        if (!chatState.isOpen && type === 'bot') {
            chatState.unreadCount++;
            updateBadge();
        }
    }

    // ========== FORMAT MESSAGE ==========
    function formatMessage(text) {
        // Convert markdown-like formatting to HTML
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>') // Code
            .replace(/\n/g, '<br>'); // Line breaks
        
        return formatted;
    }

    // ========== TYPING INDICATOR ==========
    function showTypingIndicator() {
        elements.typingIndicator.classList.add('active');
        scrollToBottom();
    }

    function hideTypingIndicator() {
        elements.typingIndicator.classList.remove('active');
    }

    // ========== SCROLL TO BOTTOM ==========
    function scrollToBottom() {
        setTimeout(() => {
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }, 100);
    }

    // ========== UPDATE BADGE ==========
    function updateBadge() {
        if (chatState.unreadCount > 0) {
            elements.badge.textContent = chatState.unreadCount > 9 ? '9+' : chatState.unreadCount;
            elements.badge.style.display = 'block';
        } else {
            elements.badge.style.display = 'none';
        }
    }

    // ========== CLEAR CONVERSATION ==========
    function clearConversation() {
        if (confirm('Are you sure you want to clear the conversation?')) {
            // Remove all messages
            const messages = elements.messagesContainer.querySelectorAll(chatState.isStandalone ? '.message' : '.chatbot-message');
            messages.forEach(msg => msg.remove());

            // Clear history
            chatState.conversationHistory = [];
            saveConversationHistory();

            // Show welcome screen
            elements.welcomeScreen.style.display = 'block';

            // Show toast
            if (typeof showToast === 'function') {
                showToast('✨ Conversation cleared');
            }
        }
    }

    // ========== COPY MESSAGE ==========
    function copyMessage(button) {
        const messageContent = button.closest(chatState.isStandalone ? '.message-content' : '.chatbot-message-content');
        const bubble = messageContent.querySelector(chatState.isStandalone ? '.message-bubble' : '.chatbot-message-bubble');
        const text = bubble.textContent;

        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') {
                showToast('📋 Message copied to clipboard');
            }
            
            // Change button text temporarily
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Copied
            `;
            
            setTimeout(() => {
                button.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            if (typeof showToast === 'function') {
                showToast('❌ Copy failed');
            }
        });
    }

    // ========== LOCAL STORAGE ==========
    function saveConversationHistory() {
        try {
            // Keep only last MAX_HISTORY messages
            const historyToSave = chatState.conversationHistory.slice(-CONFIG.MAX_HISTORY);
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(historyToSave));
        } catch (error) {
            console.warn('Failed to save conversation history:', error);
        }
    }

    function loadConversationHistory() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                chatState.conversationHistory = JSON.parse(saved);
                
                // Restore messages to UI
                chatState.conversationHistory.forEach(msg => {
                    if (msg.role === 'user') {
                        addMessage('user', msg.content);
                    } else if (msg.role === 'assistant') {
                        addMessage('bot', msg.content);
                    }
                });

                // Hide welcome screen if there are messages
                if (chatState.conversationHistory.length > 0) {
                    elements.welcomeScreen.style.display = 'none';
                }
            }
        } catch (error) {
            console.warn('Failed to load conversation history:', error);
        }
    }

    // ========== PUBLIC API ==========
    window.chatbot = {
        init,
        sendMessage,
        toggleChatWindow,
        clearConversation,
        copyMessage
    };

    // ========== AUTO-INIT ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

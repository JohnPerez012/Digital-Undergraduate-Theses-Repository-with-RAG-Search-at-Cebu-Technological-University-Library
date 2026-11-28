/**
 * ChatService
 * Handles saving, loading, and deleting conversations in Firestore.
 * Each conversation is stored in /conversations/{conversationId}
 * with the structure:
 *   {
 *     userId: string,
 *     title: string,        // first user message (truncated)
 *     portal: 'general_chat', // distinguishes from staff_copilot
 *     createdAt: Timestamp,
 *     updatedAt: Timestamp,
 *     messages: [
 *       { role: 'user' | 'bot', text: string, time: string }
 *     ]
 *   }
 * 
 * Strict Conversation Quotas:
 *   - Regular users (Students, Teachers, Guests): Maximum 3 saved conversations
 *   - Library Personnel & Admin (Librarian, Admin): Maximum 5 saved conversations
 */

const ChatService = {
  currentConversationId: null,
  DEFAULT_MAX_CONVERSATIONS: 3,
  STAFF_MAX_CONVERSATIONS: 5,
  _creationPromise: null,

  /**
   * Get the current authenticated user, or null if not logged in.
   */
  getCurrentUser() {
    return (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser
      : null;
  },

  /**
   * Detect authenticated user's role (student, teacher, librarian, admin).
   * @param {Object} [user] - optional firebase user object
   * @returns {Promise<string>} lowercase role string
   */
  async getUserRole(user) {
    if (!user) user = this.getCurrentUser();
    if (!user) return 'student';

    // 1. Check AuthService if available
    if (typeof AuthService !== 'undefined' && typeof AuthService.getUserType === 'function') {
      try {
        const role = await AuthService.getUserType(user.uid);
        if (role) return String(role).trim().toLowerCase();
      } catch (e) {
        console.warn('[ChatService] AuthService.getUserType error:', e);
      }
    }

    // 2. Check session/local storage
    const stored = sessionStorage.getItem('userType') || localStorage.getItem('userType');
    if (stored) return String(stored).trim().toLowerCase();

    // 3. Fallback: Query Firestore users collection directly
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const snap = await firebase.firestore().collection('users').doc(user.uid).get();
        if (snap.exists) {
          const role = snap.data()?.userType || snap.data()?.role;
          if (role) return String(role).trim().toLowerCase();
        }
      } catch (e) {
        console.warn('[ChatService] Firestore userType fetch error:', e);
      }
    }

    return 'student';
  },

  /**
   * Determine the maximum allowed saved conversations for the user:
   * - 5 conversations for Librarian Personnel ('librarian') and Librarian Admin ('admin')
   * - 3 conversations for all other users (Student, Teacher, Guest)
   * @param {Object} [user]
   * @returns {Promise<number>}
   */
  async getMaxConversations(user) {
    const role = await this.getUserRole(user);
    if (role === 'librarian' || role === 'admin') {
      return this.STAFF_MAX_CONVERSATIONS; // 5
    }
    return this.DEFAULT_MAX_CONVERSATIONS; // 3
  },

  /**
   * Save or update the current conversation in Firestore.
   * Called automatically after each AI response.
   * Strictly enforces 3 (regular) or 5 (staff) maximum conversation limits.
   * @param {Array} messages - array of { role, text, time } objects
   */
  async saveConversation(messages) {
    const user = this.getCurrentUser();
    if (!user) {
      console.log('ChatService: Not logged in — skipping save.');
      return;
    }
    if (!messages || messages.length === 0) return;

    // Mutex guard: if another save is actively creating a conversation document, await it first
    if (this._creationPromise) {
      try {
        await this._creationPromise;
      } catch (e) {}
    }

    const db = firebase.firestore();
    const title = messages[0].text
      ? messages[0].text.substring(0, 60) + (messages[0].text.length > 60 ? '…' : '')
      : 'New Conversation';

    const conversationData = {
      userId: user.uid,
      title: title,
      portal: 'general_chat',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      messages: messages,
    };

    try {
      if (this.currentConversationId && typeof this.currentConversationId === 'string' && this.currentConversationId.trim()) {
        // Update existing conversation session
        await db.collection('conversations')
          .doc(this.currentConversationId)
          .update(conversationData);
        console.log('Conversation updated:', this.currentConversationId);
      } else {
        // Creating a BRAND-NEW conversation: Strictly enforce user quota!
        const createWork = (async () => {
          const maxAllowed = await this.getMaxConversations(user);
          const existing = await this.loadConversations();

          if (existing.length >= maxAllowed) {
            console.warn(`[ChatService] Quota reached (${existing.length}/${maxAllowed}). Reusing active conversation instead of exceeding limit.`);
            // Attach to the most recent conversation rather than creating a prohibited 4th/6th
            this.currentConversationId = existing[0].id;
            await db.collection('conversations')
              .doc(this.currentConversationId)
              .update(conversationData);
            return;
          }

          conversationData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('conversations').add(conversationData);
          this.currentConversationId = docRef.id;
          console.log(`[ChatService] Conversation created: ${this.currentConversationId} (${existing.length + 1}/${maxAllowed})`);
        })();

        this._creationPromise = createWork;
        await createWork;
        this._creationPromise = null;
      }
    } catch (error) {
      console.error('ChatService save error:', error);
      this._creationPromise = null;
    }
  },

  /**
   * Load all conversations for the current user, ordered by updatedAt desc.
   * Auto-prunes any legacy overflow exceeding the user's quota.
   * @returns {Array} array of conversation objects (with id)
   */
  async loadConversations() {
    const user = this.getCurrentUser();
    if (!user) return [];

    const db = firebase.firestore();
    try {
      const snapshot = await db.collection('conversations')
        .where('userId', '==', user.uid)
        .limit(50)
        .get();

      // Filter out staff_copilot conversations to isolate general chat history
      const results = [];
      snapshot.forEach(doc => {
        const data = doc.data() || {};
        if (data.portal !== 'staff_copilot') {
          results.push({ id: doc.id, ...data });
        }
      });

      // Sort client-side by updatedAt descending (avoids needing a composite Firestore index)
      results.sort((a, b) => {
        const aTime = a.updatedAt ? (a.updatedAt.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt).getTime()) : 0;
        const bTime = b.updatedAt ? (b.updatedAt.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt).getTime()) : 0;
        return bTime - aTime;
      });

      // OVERFLOW GUARD: If user has 4+ conversations (e.g. from prior runs), auto-prune oldest to enforce quota strictly
      const maxAllowed = await this.getMaxConversations(user);
      if (results.length > maxAllowed) {
        console.warn(`[ChatService] Quota overflow detected (${results.length}/${maxAllowed}). Auto-pruning oldest excess conversations...`);
        const excess = results.slice(maxAllowed);
        for (const oldDoc of excess) {
          db.collection('conversations').doc(oldDoc.id).delete().catch(e => {
            console.warn('[ChatService] Auto-prune deletion warning:', e);
          });
        }
        return results.slice(0, maxAllowed);
      }

      return results;
    } catch (error) {
      console.error('ChatService load error:', error.code, error.message);
      return [];
    }
  },

  /**
   * Delete a specific conversation by ID.
   * @param {string} conversationId
   */
  async deleteConversation(conversationId) {
    const user = this.getCurrentUser();
    if (!user) return;

    if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
      console.warn('ChatService: deleteConversation called with invalid conversationId:', conversationId);
      return;
    }

    const db = firebase.firestore();
    try {
      await db.collection('conversations').doc(conversationId).delete();
      console.log('Conversation deleted:', conversationId);
      // If we just deleted the current session, reset it
      if (this.currentConversationId === conversationId) {
        this.currentConversationId = null;
      }
    } catch (error) {
      console.error('ChatService delete error:', error);
      throw error;
    }
  },

  /**
   * Load a single conversation by ID and set it as the active session.
   * @param {string} conversationId
   * @returns {Object|null} conversation data (including messages) or null on error
   */
  async loadConversation(conversationId) {
    const user = this.getCurrentUser();
    if (!user) return null;

    if (!conversationId || typeof conversationId !== 'string' || !conversationId.trim()) {
      console.warn('ChatService: loadConversation called with invalid conversationId:', conversationId);
      return null;
    }

    const db = firebase.firestore();
    try {
      const doc = await db.collection('conversations').doc(conversationId).get();
      if (!doc.exists) return null;
      const data = { id: doc.id, ...doc.data() };
      // Make this the active conversation so subsequent messages update it
      this.currentConversationId = conversationId;
      return data;
    } catch (error) {
      console.error('ChatService loadConversation error:', error);
      return null;
    }
  },

  /**
   * Count how many conversations the current user has saved.
   * @returns {Promise<number>}
   */
  async getConversationCount() {
    const user = this.getCurrentUser();
    if (!user) return 0;
    const convs = await this.loadConversations();
    return convs.length;
  },

  /**
   * Reset the current conversation ID (called when conversation is cleared or New Chat started).
   */
  resetConversation() {
    this.currentConversationId = null;
  },

  /**
   * Format a Firestore Timestamp to a readable date string.
   * @param {Timestamp} timestamp
   */
  formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },
};

/**
 * ChatService
 * Handles saving, loading, and deleting conversations in Firestore.
 * Each conversation is stored in /conversations/{conversationId}
 * with the structure:
 *   {
 *     userId: string,
 *     title: string,        // first user message (truncated)
 *     createdAt: Timestamp,
 *     updatedAt: Timestamp,
 *     messages: [
 *       { role: 'user' | 'bot', text: string, time: string }
 *     ]
 *   }
 */

const ChatService = {
  currentConversationId: null,

  /**
   * Get the current authenticated user, or null if not logged in.
   */
  getCurrentUser() {
    return (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser
      : null;
  },

  /**
   * Save or update the current conversation in Firestore.
   * Called automatically after each AI response.
   * @param {Array} messages - array of { role, text, time } objects
   */
  async saveConversation(messages) {
    const user = this.getCurrentUser();
    if (!user) {
      console.log('ChatService: Not logged in — skipping save.');
      return;
    }
    if (!messages || messages.length === 0) return;

    const db = firebase.firestore();
    const title = messages[0].text
      ? messages[0].text.substring(0, 60) + (messages[0].text.length > 60 ? '…' : '')
      : 'New Conversation';

    const conversationData = {
      userId: user.uid,
      title: title,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      messages: messages,
    };

    try {
      if (this.currentConversationId) {
        // Update existing conversation
        await db.collection('conversations')
          .doc(this.currentConversationId)
          .update(conversationData);
        console.log('✓ Conversation updated:', this.currentConversationId);
      } else {
        // Create new conversation
        conversationData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const docRef = await db.collection('conversations').add(conversationData);
        this.currentConversationId = docRef.id;
        console.log('✓ Conversation created:', this.currentConversationId);
      }
    } catch (error) {
      console.error('ChatService save error:', error);
    }
  },

  /**
   * Load all conversations for the current user, ordered by updatedAt desc.
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

      // Sort client-side by updatedAt descending (avoids needing a composite Firestore index)
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      results.sort((a, b) => {
        const aTime = a.updatedAt ? (a.updatedAt.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt).getTime()) : 0;
        const bTime = b.updatedAt ? (b.updatedAt.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt).getTime()) : 0;
        return bTime - aTime;
      });
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

    const db = firebase.firestore();
    try {
      await db.collection('conversations').doc(conversationId).delete();
      console.log('✓ Conversation deleted:', conversationId);
      // If we just deleted the current session, reset it
      if (this.currentConversationId === conversationId) {
        this.currentConversationId = null;
      }
    } catch (error) {
      console.error('ChatService delete error:', error);
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
   * Uses a simple where-only query so no composite index is needed.
   * @returns {number}
   */
  async getConversationCount() {
    const user = this.getCurrentUser();
    if (!user) return 0;
    const db = firebase.firestore();
    try {
      const snapshot = await db.collection('conversations')
        .where('userId', '==', user.uid)
        .get();
      return snapshot.size;
    } catch (error) {
      console.error('ChatService count error:', error.code, error.message);
      return 0;
    }
  },

  /**
   * Reset the current conversation ID (called when conversation is cleared).
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

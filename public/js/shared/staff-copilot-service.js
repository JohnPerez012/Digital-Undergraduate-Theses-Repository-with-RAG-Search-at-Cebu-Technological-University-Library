/**
 * StaffCopilotService
 * Dedicated Firestore Conversation Manager for Admin & Librarian Staff Copilot.
 * 
 * Quota: Exactly 5 Saved Conversations per staff member (compared to 3 for standard users).
 * Database Collection: /conversations/{conversationId}
 * Schema:
 *   {
 *     userId: string,
 *     userRole: 'admin' | 'librarian',
 *     portal: 'staff_copilot',
 *     title: string,
 *     createdAt: Timestamp,
 *     updatedAt: Timestamp,
 *     messages: [
 *       { role: 'user' | 'bot', text: string, html: string, time: string, timestamp: number }
 *     ]
 *   }
 */

(function(window) {
  'use strict';

  const MAX_STAFF_CONVERSATIONS = 5;

  const StaffCopilotService = {
    activeConversationId: null,
    cachedConversations: null,
    isLoading: false,

    MAX_CONVERSATIONS: MAX_STAFF_CONVERSATIONS,

    /**
     * Get authenticated Firebase user
     */
    getCurrentUser() {
      if (typeof auth !== 'undefined' && auth && auth.currentUser) {
        return auth.currentUser;
      }
      if (typeof firebase !== 'undefined' && firebase.auth) {
        return firebase.auth().currentUser;
      }
      return null;
    },

    /**
     * Get Firestore DB instance
     */
    getDb() {
      if (typeof db !== 'undefined' && db) return db;
      if (typeof firebase !== 'undefined' && firebase.firestore) return firebase.firestore();
      return null;
    },

    /**
     * Check if a new conversation can be started
     * @returns {Promise<{ allowed: boolean, count: number, max: number }>}
     */
    async canStartNew() {
      const count = await this.getConversationCount();
      return {
        allowed: count < MAX_STAFF_CONVERSATIONS,
        count,
        max: MAX_STAFF_CONVERSATIONS
      };
    },

    /**
     * Count saved staff copilot conversations for current user
     * @returns {Promise<number>}
     */
    async getConversationCount() {
      const user = this.getCurrentUser();
      if (!user) return 0;

      const firestore = this.getDb();
      if (!firestore) return 0;

      try {
        const snap = await firestore.collection('conversations')
          .where('userId', '==', user.uid)
          .get();

        let count = 0;
        snap.forEach(doc => {
          const data = doc.data() || {};
          if (data.portal === 'staff_copilot') {
            count++;
          }
        });
        return count;
      } catch (err) {
        console.warn('[StaffCopilotService] getConversationCount warning:', err);
        return this.cachedConversations ? this.cachedConversations.length : 0;
      }
    },

    /**
     * Load all saved staff copilot conversations for the user
     * @returns {Promise<Array>}
     */
    async loadConversations() {
      const user = this.getCurrentUser();
      if (!user) return [];

      const firestore = this.getDb();
      if (!firestore) return [];

      this.isLoading = true;
      try {
        const snap = await firestore.collection('conversations')
          .where('userId', '==', user.uid)
          .get();

        const list = [];
        snap.forEach(doc => {
          const data = doc.data() || {};
          if (data.portal === 'staff_copilot') {
            list.push({ id: doc.id, ...data });
          }
        });

        // Client-side sort by updatedAt descending (avoids composite index requirements)
        list.sort((a, b) => {
          const aTime = a.updatedAt ? (a.updatedAt.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt).getTime()) : 0;
          const bTime = b.updatedAt ? (b.updatedAt.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt).getTime()) : 0;
          return bTime - aTime;
        });

        this.cachedConversations = list;
        this.isLoading = false;
        return list;
      } catch (err) {
        console.error('[StaffCopilotService] loadConversations error:', err);
        this.isLoading = false;
        return [];
      }
    },

    /**
     * Load a single conversation by ID and activate it
     * @param {string} conversationId
     * @returns {Promise<Object|null>}
     */
    async loadConversation(conversationId) {
      if (!conversationId) return null;
      const firestore = this.getDb();
      if (!firestore) return null;

      try {
        const doc = await firestore.collection('conversations').doc(conversationId).get();
        if (!doc.exists) return null;
        const data = { id: doc.id, ...doc.data() };
        this.activeConversationId = conversationId;
        return data;
      } catch (err) {
        console.error('[StaffCopilotService] loadConversation error:', err);
        return null;
      }
    },

    /**
     * Save or update conversation in Firestore
     * @param {Array} messages - [{ role: 'user'|'bot', text: string, html: string, time: string }]
     * @param {string} role - 'admin' | 'librarian'
     * @returns {Promise<string|null>} active conversation ID
     */
    async saveConversation(messages, role = 'admin') {
      const user = this.getCurrentUser();
      if (!user || !Array.isArray(messages) || messages.length === 0) return null;

      const firestore = this.getDb();
      if (!firestore) return null;

      // Extract title from first user query
      const firstUserMsg = messages.find(m => m.role === 'user');
      const rawText = firstUserMsg ? firstUserMsg.text : 'New Staff Consultation';
      const cleanTitle = (rawText.replace(/\s+/g, ' ').trim().slice(0, 52) || 'Staff Consultation') + (rawText.length > 52 ? '…' : '');

      const payload = {
        userId: user.uid,
        userRole: role,
        portal: 'staff_copilot',
        title: cleanTitle,
        messages: messages.map(m => ({
          role: m.role,
          text: m.text || '',
          html: m.role === 'user' ? '' : (m.html || ''),
          time: m.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: m.timestamp || Date.now()
        })),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (this.activeConversationId) {
          // Update existing conversation
          await firestore.collection('conversations')
            .doc(this.activeConversationId)
            .update(payload);
          return this.activeConversationId;
        } else {
          // Check limit before creating new conversation
          const count = await this.getConversationCount();
          if (count >= MAX_STAFF_CONVERSATIONS) {
            console.warn(`[StaffCopilotService] Conversation limit reached (${count}/${MAX_STAFF_CONVERSATIONS})`);
            return null;
          }

          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const ref = await firestore.collection('conversations').add(payload);
          this.activeConversationId = ref.id;
          return ref.id;
        }
      } catch (err) {
        console.error('[StaffCopilotService] saveConversation error:', err);
        return null;
      }
    },

    /**
     * Delete a conversation by ID
     * @param {string} conversationId
     * @returns {Promise<boolean>}
     */
    async deleteConversation(conversationId) {
      if (!conversationId) return false;
      const firestore = this.getDb();
      if (!firestore) return false;

      try {
        await firestore.collection('conversations').doc(conversationId).delete();
        if (this.activeConversationId === conversationId) {
          this.activeConversationId = null;
        }
        if (this.cachedConversations) {
          this.cachedConversations = this.cachedConversations.filter(c => c.id !== conversationId);
        }
        return true;
      } catch (err) {
        console.error('[StaffCopilotService] deleteConversation error:', err);
        return false;
      }
    },

    /**
     * Reset active conversation session
     */
    resetSession() {
      this.activeConversationId = null;
    },

    /**
     * Format timestamp to human readable label
     */
    formatTimeAgo(timestamp) {
      if (!timestamp) return 'Just now';
      const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMs / 3600000);
      const days = Math.floor(diffMs / 86400000);

      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  window.StaffCopilotService = StaffCopilotService;
})(window);

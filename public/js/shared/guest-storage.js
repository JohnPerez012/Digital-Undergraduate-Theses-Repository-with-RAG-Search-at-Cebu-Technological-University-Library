/**
 * Guest Saved Projects Storage Service
 * Manages locally saved capstone projects for non-authenticated (guest) users.
 * Supports offline storage, toggling, and synchronization to Firebase Firestore upon login.
 */

(function(window) {
    'use strict';

    const STORAGE_KEY = 'recap_guest_saved_projects';

    const GuestSavedProjects = {
        STORAGE_KEY: STORAGE_KEY,

        /**
         * Retrieve all locally saved project records
         * @returns {Array<Object>}
         */
        getAll() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : [];
            } catch (err) {
                console.error('[GuestSavedProjects] Failed to read from localStorage:', err);
                return [];
            }
        },

        /**
         * Get an array of all locally saved project IDs
         * @returns {Array<string>}
         */
        getIds() {
            return this.getAll()
                .map(item => (typeof item === 'string' ? item : item.id))
                .filter(Boolean);
        },

        /**
         * Check if there are any locally saved projects
         * @returns {boolean}
         */
        hasSaved() {
            return this.getIds().length > 0;
        },

        /**
         * Check if a specific project is saved locally
         * @param {string} projectId
         * @returns {boolean}
         */
        isSaved(projectId) {
            if (!projectId) return false;
            return this.getIds().includes(projectId);
        },

        /**
         * Save a project to local device storage
         * @param {Object|string} project
         */
        save(project) {
            if (!project) return;
            const id = typeof project === 'string' ? project : project.id;
            if (!id) return;

            const list = this.getAll();
            const exists = list.some(item => (typeof item === 'string' ? item : item.id) === id);

            if (!exists) {
                const projectRecord = typeof project === 'string'
                    ? { id: id, savedAt: new Date().toISOString() }
                    : {
                        id: project.id,
                        title: project.title || 'Untitled Project',
                        authors: project.authors || '',
                        program: project.program || '',
                        year: project.year || '',
                        savedAt: new Date().toISOString()
                    };

                list.push(projectRecord);
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
                    window.dispatchEvent(new CustomEvent('guestSavedProjectsChanged', { detail: { action: 'save', projectId: id } }));
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged'));
                } catch (err) {
                    console.error('[GuestSavedProjects] Failed to write to localStorage:', err);
                }
            }
        },

        /**
         * Remove a project from local device storage
         * @param {string} projectId
         */
        remove(projectId) {
            if (!projectId) return;
            let list = this.getAll();
            const originalLength = list.length;
            list = list.filter(item => (typeof item === 'string' ? item : item.id) !== projectId);

            if (list.length !== originalLength) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
                    window.dispatchEvent(new CustomEvent('guestSavedProjectsChanged', { detail: { action: 'remove', projectId } }));
                    window.dispatchEvent(new CustomEvent('projectSavedStateChanged'));
                } catch (err) {
                    console.error('[GuestSavedProjects] Failed to update localStorage:', err);
                }
            }
        },

        /**
         * Delete all local project records from device
         */
        clear() {
            try {
                localStorage.removeItem(STORAGE_KEY);
                window.dispatchEvent(new CustomEvent('guestSavedProjectsChanged', { detail: { action: 'clear' } }));
                window.dispatchEvent(new CustomEvent('projectSavedStateChanged'));
            } catch (err) {
                console.error('[GuestSavedProjects] Failed to clear localStorage:', err);
            }
        },

        /**
         * Sync all guest saved projects to Firestore for the authenticated user,
         * then delete the local copies from the device.
         * @param {string} userId - Firebase Auth User UID
         * @param {Object} [firestoreDb] - Firestore instance
         * @returns {Promise<{syncedCount: number}>}
         */
        async syncToFirestore(userId, firestoreDb) {
            const list = this.getAll();
            const ids = this.getIds();

            if (!userId || ids.length === 0) {
                this.clear();
                return { syncedCount: 0 };
            }

            const db = firestoreDb || (typeof firebase !== 'undefined' ? firebase.firestore() : null);

            if (db) {
                const docRef = db.collection('usersSavedProjects').doc(userId);
                await docRef.set({
                    UIDproject: firebase.firestore.FieldValue.arrayUnion(...ids)
                }, { merge: true });

                // Log bookmark activity in ActivityService if available
                if (window.ActivityService && typeof window.ActivityService.logBookmark === 'function') {
                    list.forEach(p => {
                        const title = (typeof p === 'object' && p.title) ? p.title : 'Capstone Project';
                        const pId = typeof p === 'string' ? p : p.id;
                        window.ActivityService.logBookmark(pId, title, 'saved');
                    });
                }
            }

            // Delete the local device data
            this.clear();

            return { syncedCount: ids.length };
        }
    };

    window.GuestSavedProjects = GuestSavedProjects;
})(window);

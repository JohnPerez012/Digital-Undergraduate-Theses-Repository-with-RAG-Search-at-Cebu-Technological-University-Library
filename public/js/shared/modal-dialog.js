/**
 * ============================================================================
 * ModalDialog - Universal Responsive Dialog System for RE-CAPS
 * ============================================================================
 * 
 * Replaces clunky browser-native alert(), confirm(), and prompt() dialogs
 * with modern, responsive, organized, glassmorphic modals.
 * 
 * Usage Examples:
 *   await ModalDialog.alert({ title: 'Success', message: 'Profile updated!', type: 'success' });
 *   const confirmed = await ModalDialog.confirm({ title: 'Delete Item', message: 'Are you sure?', isDanger: true });
 *   const format = await ModalDialog.choice({ title: 'Export', options: [{ id: 'csv', label: 'CSV' }, { id: 'json', label: 'JSON' }] });
 * 
 * @module ModalDialog
 * @author RE-CAPS Team
 * @version 1.0.0
 */

(function(window) {
    'use strict';

    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, match => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[match] || match;
        });
    }

    const ICONS = {
        danger: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
        code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
    };

    class ModalDialogManager {
        constructor() {
            this.activeModal = null;
            this.activeResolve = null;
            this.keyListener = null;
        }

        /**
         * Render and display a confirmation modal
         * @param {Object} options
         * @returns {Promise<boolean>}
         */
        confirm(options = {}) {
            if (typeof options === 'string') {
                options = { message: options };
            }

            const title = options.title || 'Are you sure?';
            const message = options.message || '';
            const confirmText = options.confirmText || 'Confirm';
            const cancelText = options.cancelText || 'Cancel';
            const isDanger = options.isDanger || options.type === 'danger';
            const type = isDanger ? 'danger' : (options.type || 'info');
            const iconSvg = options.icon === 'trash' ? ICONS.trash : (ICONS[type] || ICONS.info);

            return new Promise((resolve) => {
                this.closeActive();

                const modalEl = document.createElement('div');
                modalEl.className = 'app-dialog-modal';
                modalEl.setAttribute('role', 'dialog');
                modalEl.setAttribute('aria-modal', 'true');

                modalEl.innerHTML = `
                    <div class="app-dialog-overlay"></div>
                    <div class="app-dialog-card">
                        <button type="button" class="app-dialog-close-btn" aria-label="Close dialog">
                            ${ICONS.close}
                        </button>
                        <div class="app-dialog-header">
                            <div class="app-dialog-icon-wrapper app-dialog-icon-${type}">
                                ${iconSvg}
                            </div>
                            <h3 class="app-dialog-title">${escapeHtml(title)}</h3>
                            <p class="app-dialog-description">${escapeHtml(message)}</p>
                        </div>
                        <div class="app-dialog-actions">
                            <button type="button" class="app-dialog-btn app-dialog-btn-cancel">
                                ${escapeHtml(cancelText)}
                            </button>
                            <button type="button" class="app-dialog-btn ${isDanger ? 'app-dialog-btn-danger' : 'app-dialog-btn-primary'}">
                                ${escapeHtml(confirmText)}
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modalEl);
                this.activeModal = modalEl;
                this.activeResolve = resolve;

                // Elements
                const overlay = modalEl.querySelector('.app-dialog-overlay');
                const closeBtn = modalEl.querySelector('.app-dialog-close-btn');
                const cancelBtn = modalEl.querySelector('.app-dialog-btn-cancel');
                const confirmBtn = modalEl.querySelector(isDanger ? '.app-dialog-btn-danger' : '.app-dialog-btn-primary');

                const handleCancel = () => this.finish(false);
                const handleConfirm = () => this.finish(true);

                overlay.addEventListener('click', handleCancel);
                closeBtn.addEventListener('click', handleCancel);
                cancelBtn.addEventListener('click', handleCancel);
                confirmBtn.addEventListener('click', handleConfirm);

                this.setupKeyboard(handleCancel, handleConfirm);
                this.show(modalEl, confirmBtn);
            });
        }

        /**
         * Render and display an alert information modal
         * @param {Object|string} options
         * @returns {Promise<void>}
         */
        alert(options = {}) {
            if (typeof options === 'string') {
                options = { message: options };
            }

            const title = options.title || 'Notice';
            const message = options.message || '';
            const buttonText = options.buttonText || options.confirmText || 'Understood';
            const type = options.type || 'info';
            const iconSvg = ICONS[type] || ICONS.info;

            return new Promise((resolve) => {
                this.closeActive();

                const modalEl = document.createElement('div');
                modalEl.className = 'app-dialog-modal';
                modalEl.setAttribute('role', 'alertdialog');
                modalEl.setAttribute('aria-modal', 'true');

                modalEl.innerHTML = `
                    <div class="app-dialog-overlay"></div>
                    <div class="app-dialog-card">
                        <button type="button" class="app-dialog-close-btn" aria-label="Close dialog">
                            ${ICONS.close}
                        </button>
                        <div class="app-dialog-header">
                            <div class="app-dialog-icon-wrapper app-dialog-icon-${type}">
                                ${iconSvg}
                            </div>
                            <h3 class="app-dialog-title">${escapeHtml(title)}</h3>
                            <p class="app-dialog-description">${escapeHtml(message)}</p>
                        </div>
                        <div class="app-dialog-actions">
                            <button type="button" class="app-dialog-btn app-dialog-btn-primary">
                                ${escapeHtml(buttonText)}
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modalEl);
                this.activeModal = modalEl;
                this.activeResolve = resolve;

                const overlay = modalEl.querySelector('.app-dialog-overlay');
                const closeBtn = modalEl.querySelector('.app-dialog-close-btn');
                const okBtn = modalEl.querySelector('.app-dialog-btn-primary');

                const handleClose = () => this.finish(true);

                overlay.addEventListener('click', handleClose);
                closeBtn.addEventListener('click', handleClose);
                okBtn.addEventListener('click', handleClose);

                this.setupKeyboard(handleClose, handleClose);
                this.show(modalEl, okBtn);
            });
        }

        /**
         * Render and display a choice modal with multiple actionable cards
         * @param {Object} options - { title, message, options: [{ id, label, icon, desc }], cancelText }
         * @returns {Promise<string|null>}
         */
        choice(options = {}) {
            const title = options.title || 'Choose an option';
            const message = options.message || '';
            const choices = Array.isArray(options.options) ? options.options : [];
            const cancelText = options.cancelText || 'Cancel';

            return new Promise((resolve) => {
                this.closeActive();

                const modalEl = document.createElement('div');
                modalEl.className = 'app-dialog-modal';
                modalEl.setAttribute('role', 'dialog');
                modalEl.setAttribute('aria-modal', 'true');

                let choicesHtml = '';
                choices.forEach(opt => {
                    const iconKey = opt.icon || 'file';
                    const iconSvg = ICONS[iconKey] || ICONS.file;
                    choicesHtml += `
                        <button type="button" class="app-dialog-choice-btn" data-choice-id="${escapeHtml(opt.id)}">
                            <div class="app-dialog-choice-icon">
                                ${iconSvg}
                            </div>
                            <div class="app-dialog-choice-info">
                                <div class="app-dialog-choice-title">${escapeHtml(opt.label || opt.id)}</div>
                                ${opt.desc ? `<div class="app-dialog-choice-desc">${escapeHtml(opt.desc)}</div>` : ''}
                            </div>
                        </button>
                    `;
                });

                modalEl.innerHTML = `
                    <div class="app-dialog-overlay"></div>
                    <div class="app-dialog-card wide">
                        <button type="button" class="app-dialog-close-btn" aria-label="Close dialog">
                            ${ICONS.close}
                        </button>
                        <div class="app-dialog-header">
                            <div class="app-dialog-icon-wrapper app-dialog-icon-info">
                                ${ICONS.info}
                            </div>
                            <h3 class="app-dialog-title">${escapeHtml(title)}</h3>
                            ${message ? `<p class="app-dialog-description">${escapeHtml(message)}</p>` : ''}
                        </div>
                        <div class="app-dialog-choices">
                            ${choicesHtml}
                        </div>
                        <div class="app-dialog-actions">
                            <button type="button" class="app-dialog-btn app-dialog-btn-cancel">
                                ${escapeHtml(cancelText)}
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modalEl);
                this.activeModal = modalEl;
                this.activeResolve = resolve;

                const overlay = modalEl.querySelector('.app-dialog-overlay');
                const closeBtn = modalEl.querySelector('.app-dialog-close-btn');
                const cancelBtn = modalEl.querySelector('.app-dialog-btn-cancel');

                const handleCancel = () => this.finish(null);

                overlay.addEventListener('click', handleCancel);
                closeBtn.addEventListener('click', handleCancel);
                cancelBtn.addEventListener('click', handleCancel);

                modalEl.querySelectorAll('.app-dialog-choice-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const choiceId = btn.getAttribute('data-choice-id');
                        this.finish(choiceId);
                    });
                });

                this.setupKeyboard(handleCancel, null);
                this.show(modalEl, modalEl.querySelector('.app-dialog-choice-btn'));
            });
        }

        /**
         * Render and display a text prompt input modal
         * @param {Object|string} options
         * @returns {Promise<string|null>}
         */
        prompt(options = {}) {
            if (typeof options === 'string') {
                options = { message: options };
            }

            const title = options.title || 'Input Required';
            const message = options.message || '';
            const placeholder = options.placeholder || '';
            const defaultValue = options.defaultValue || '';
            const confirmText = options.confirmText || 'Submit';
            const cancelText = options.cancelText || 'Cancel';
            const inputType = options.inputType || 'text';

            return new Promise((resolve) => {
                this.closeActive();

                const modalEl = document.createElement('div');
                modalEl.className = 'app-dialog-modal';
                modalEl.setAttribute('role', 'dialog');
                modalEl.setAttribute('aria-modal', 'true');

                modalEl.innerHTML = `
                    <div class="app-dialog-overlay"></div>
                    <div class="app-dialog-card">
                        <button type="button" class="app-dialog-close-btn" aria-label="Close dialog">
                            ${ICONS.close}
                        </button>
                        <div class="app-dialog-header">
                            <div class="app-dialog-icon-wrapper app-dialog-icon-info">
                                ${ICONS.info}
                            </div>
                            <h3 class="app-dialog-title">${escapeHtml(title)}</h3>
                            ${message ? `<p class="app-dialog-description">${escapeHtml(message)}</p>` : ''}
                        </div>
                        <div class="app-dialog-input-group">
                            <input type="${escapeHtml(inputType)}" 
                                   class="app-dialog-input" 
                                   placeholder="${escapeHtml(placeholder)}" 
                                   value="${escapeHtml(defaultValue)}">
                        </div>
                        <div class="app-dialog-actions">
                            <button type="button" class="app-dialog-btn app-dialog-btn-cancel">
                                ${escapeHtml(cancelText)}
                            </button>
                            <button type="button" class="app-dialog-btn app-dialog-btn-primary">
                                ${escapeHtml(confirmText)}
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modalEl);
                this.activeModal = modalEl;
                this.activeResolve = resolve;

                const overlay = modalEl.querySelector('.app-dialog-overlay');
                const closeBtn = modalEl.querySelector('.app-dialog-close-btn');
                const cancelBtn = modalEl.querySelector('.app-dialog-btn-cancel');
                const confirmBtn = modalEl.querySelector('.app-dialog-btn-primary');
                const inputEl = modalEl.querySelector('.app-dialog-input');

                const handleCancel = () => this.finish(null);
                const handleConfirm = () => this.finish(inputEl ? inputEl.value : '');

                overlay.addEventListener('click', handleCancel);
                closeBtn.addEventListener('click', handleCancel);
                cancelBtn.addEventListener('click', handleCancel);
                confirmBtn.addEventListener('click', handleConfirm);

                if (inputEl) {
                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleConfirm();
                        }
                    });
                }

                this.setupKeyboard(handleCancel, handleConfirm);
                this.show(modalEl, inputEl);
            });
        }

        /**
         * Setup keyboard accessibility (Escape to cancel, Enter to confirm)
         */
        setupKeyboard(onEscape, onEnter) {
            this.teardownKeyboard();

            this.keyListener = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (typeof onEscape === 'function') onEscape();
                } else if (e.key === 'Enter') {
                    // Only trigger onEnter if not focused on cancel button
                    const active = document.activeElement;
                    if (active && active.classList.contains('app-dialog-btn-cancel')) {
                        return;
                    }
                    if (typeof onEnter === 'function') {
                        e.preventDefault();
                        onEnter();
                    }
                }
            };

            document.addEventListener('keydown', this.keyListener);
        }

        teardownKeyboard() {
            if (this.keyListener) {
                document.removeEventListener('keydown', this.keyListener);
                this.keyListener = null;
            }
        }

        /**
         * Show modal with animation
         */
        show(modalEl, focusTarget) {
            document.body.classList.add('dialog-open');
            requestAnimationFrame(() => {
                modalEl.classList.add('active');
                if (focusTarget && typeof focusTarget.focus === 'function') {
                    focusTarget.focus();
                }
            });
        }

        /**
         * Complete active modal and resolve promise
         */
        finish(result) {
            const modal = this.activeModal;
            const resolve = this.activeResolve;

            this.teardownKeyboard();
            document.body.classList.remove('dialog-open');

            if (modal) {
                modal.classList.remove('active');
                setTimeout(() => {
                    if (modal.parentNode) {
                        modal.parentNode.removeChild(modal);
                    }
                }, 260);
            }

            this.activeModal = null;
            this.activeResolve = null;

            if (typeof resolve === 'function') {
                resolve(result);
            }
        }

        /**
         * Force close any existing active modal
         */
        closeActive() {
            if (this.activeModal) {
                this.finish(null);
            }
        }
    }

    // Expose singleton to window
    const instance = new ModalDialogManager();
    window.ModalDialog = instance;

})(window);

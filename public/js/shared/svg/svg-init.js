/**
 * SVG Init — Unified Initializer
 * ================================
 * Single entry point that initializes all SVG icons across every page.
 * Replaces: index-svgs-init.js, universal-svgs-init.js, rail-svgs-init.js
 *
 * Load order in HTML:
 *   1. svg-loader.js    (defines window.SVGLoader + global loadIcon shim)
 *   2. svg-registry.js  (defines window.SVGRegistry)
 *   3. svg-init.js      (this file)
 *
 * Public API (window.SVGInit):
 *   updateThemeIcons()         → call after theme changes
 *   initPasswordToggles()      → call after dynamic password fields mount
 *   loadRailNavIcons()         → call to re-load rail nav icons
 */

(function (global) {
    'use strict';

    // ─── Guard: ensure loader is available ───────────────────────────────────
    function _waitForLoader(cb, attempts) {
        attempts = attempts || 0;
        if (typeof global.SVGLoader !== 'undefined') {
            cb();
        } else if (attempts < 50) {
            setTimeout(() => _waitForLoader(cb, attempts + 1), 100);
        } else {
            console.error('[SVGInit] SVGLoader not found after 5s. Aborting SVG init.');
        }
    }

    // ─── Shorthand ───────────────────────────────────────────────────────────
    function _load(name, targetId, className, options) {
        return SVGLoader.loadIcon(name, targetId, className || '', options || {});
    }

    function _batch(configs) {
        // Skip configs whose target element doesn't exist — no noise in console
        const present = configs.filter(c => document.getElementById(c.targetId));
        return SVGLoader.loadIcons(present);
    }

    // ─── Page Detection ───────────────────────────────────────────────────────
    function _detectPage() {
        const path = window.location.pathname;
        const html = document.documentElement;
        const role = html.getAttribute('data-required-role');
        if (role === 'admin'      || path.includes('admin_page'))       return 'admin';
        if (role === 'librarian'  || path.includes('librarian_page'))   return 'librarian';
        if (role === 'student'    || path.includes('student_page'))     return 'student';
        if (role === 'teacher'    || path.includes('teacher_page'))     return 'teacher';
        if (path.includes('about_page'))                                return 'about';
        if (path.includes('account_registration'))                      return 'registration';
        if (path.includes('index.html') || path.endsWith('/') || path.endsWith('/public')) return 'index';
        return 'unknown';
    }

    // =========================================================================
    // COMMON — header icons present on ALL pages
    // =========================================================================
    function _loadCommonIcons() {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';

        _batch([
            // Profile dropdown
            { name: 'dashboard',   targetId: 'pd-dashboard-icon', options: { width: 16, height: 16 } },
            { name: 'arrowright', targetId: 'pd-dashboard-arrow', options: { width: 13, height: 13, style: { opacity: '0.4' } } },
            { name: 'about',      targetId: 'pd-about-icon',      options: { width: 16, height: 16 } },
            { name: 'arrowright', targetId: 'pd-about-arrow',     options: { width: 13, height: 13, style: { opacity: '0.4' } } },
            { name: 'logout',     targetId: 'pd-logout-icon',     options: { width: 15, height: 15 } },
        ]);

        // Theme icons in header toggle button
        _initThemeToggleIcons();

        // Profile dropdown theme icon
        const pdMoonEl = document.getElementById('pd-moon-icon');
        if (pdMoonEl) {
            _load(theme === 'dark' ? 'moon' : 'sun', 'pd-moon-icon', '', { width: 16, height: 16 });
        }
    }

    // =========================================================================
    // THEME TOGGLE — sun/moon in header button
    // =========================================================================
    function _initThemeToggleIcons() {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const btn   = document.getElementById('theme-toggle');
        if (!btn) return;

        // Only inject containers if they don't already exist
        if (!btn.querySelector('#theme-sun-icon')) {
            const sunSpan  = document.createElement('span');
            sunSpan.id     = 'theme-sun-icon';
            sunSpan.style.display  = theme === 'dark' ? 'none' : 'inline-flex';
            sunSpan.style.width    = '16px';
            sunSpan.style.height   = '16px';

            const moonSpan = document.createElement('span');
            moonSpan.id    = 'theme-moon-icon';
            moonSpan.style.display = theme === 'dark' ? 'inline-flex' : 'none';
            moonSpan.style.width   = '16px';
            moonSpan.style.height  = '16px';

            btn.appendChild(sunSpan);
            btn.appendChild(moonSpan);

            _load('sun',  'theme-sun-icon',  '', { width: 16, height: 16 });
            _load('moon', 'theme-moon-icon', '', { width: 16, height: 16 });
        }
    }

    // =========================================================================
    // PASSWORD TOGGLES — eye icons for all .toggle-password-btn elements
    // =========================================================================
    function _initPasswordToggles() {
        document.querySelectorAll('.toggle-password-btn').forEach(btn => {
            if (btn.querySelector('.eye-icon')) return; // already initialized

            const targetField = btn.getAttribute('data-target') || 'password';
            btn.innerHTML = '';

            const onSpan  = document.createElement('span');
            onSpan.id     = `${targetField}-eye-on`;
            onSpan.className = 'eye-icon eye-open';
            onSpan.style.display  = 'inline-flex';
            onSpan.style.width    = '20px';
            onSpan.style.height   = '20px';

            const offSpan = document.createElement('span');
            offSpan.id    = `${targetField}-eye-off`;
            offSpan.className = 'eye-icon eye-closed';
            offSpan.style.display = 'none';
            offSpan.style.width   = '20px';
            offSpan.style.height  = '20px';

            btn.appendChild(onSpan);
            btn.appendChild(offSpan);

            _load('eyeson',   `${targetField}-eye-on`,  '', { width: 20, height: 20 });
            _load('eyesoff',  `${targetField}-eye-off`, '', { width: 20, height: 20 });
        });
    }

    // =========================================================================
    // UPDATE THEME ICONS — called by MutationObserver and externally
    // =========================================================================
    function _updateThemeIcons() {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';

        // Header toggle sun/moon visibility
        const sunEl  = document.getElementById('theme-sun-icon');
        const moonEl = document.getElementById('theme-moon-icon');
        if (sunEl && moonEl) {
            sunEl.style.display  = theme === 'dark' ? 'none' : 'inline-flex';
            moonEl.style.display = theme === 'dark' ? 'inline-flex' : 'none';
        }

        // Profile dropdown icon
        const pdMoon = document.getElementById('pd-moon-icon');
        if (pdMoon) {
            _load(theme === 'dark' ? 'moon' : 'sun', 'pd-moon-icon', '', { width: 16, height: 16 });
        }
    }

    // =========================================================================
    // RAIL NAV — convert inline SVGs to dynamic loader icons
    // Uses data-section attribute to map sections to icon files.
    // =========================================================================

    // Section → SVG file name map
    const _RAIL_ICON_MAP = {
        'dashboard':   'dashboard',
        'projects':    'projects',
        'users':       'users',
        'analytics':   'analytics',
        'settings':    'settings',
        'library':     'library',
        'catalog':     'library',
        'saved':       'save',
        'profile':     'user',
        'notifications': 'notification',
        'feedback':    'about',
        'reports':     'analytics',
        'search':      'search',
        'home':        'home',
        'about':       'about',
        'students':    'users',
        'classes':     'datastack',
        'submissions': 'successful',
        'circulation': 'refresh',
        'requests':    'addconversation',
        'bookmarks':   'save',
        'theses':      'projects',
        'programs':    'program',
        'citations':   'citations',
        'activity':    'activity',
    };

    function _loadRailNavIcons() {
        // Rail nav items
        document.querySelectorAll('.rail-nav-item[data-section]').forEach((item, idx) => {
            const section = item.getAttribute('data-section');
            const iconName = _RAIL_ICON_MAP[section] || null;
            if (!iconName) {
                console.warn(`[SVGInit] No rail icon mapping for section: "${section}"`);
                return;
            }

            const iconContainer = item.querySelector('.rail-nav-icon');
            if (!iconContainer) return;

            const spanId = `rail-icon-${section}-${idx}`;
            const span   = document.createElement('span');
            span.id      = spanId;
            span.style.cssText = 'display:inline-flex;width:20px;height:20px;';

            iconContainer.innerHTML = '';
            iconContainer.appendChild(span);

            _load(iconName, spanId, '', { width: 20, height: 20 });
        });

        // Back-to-home button
        const homeIconContainer = document.querySelector('#back-to-home-btn .rail-nav-icon');
        if (homeIconContainer) {
            const span = document.createElement('span');
            span.id    = 'rail-icon-back-home';
            span.style.cssText = 'display:inline-flex;width:20px;height:20px;';
            homeIconContainer.innerHTML = '';
            homeIconContainer.appendChild(span);
            _load('home', 'rail-icon-back-home', '', { width: 20, height: 20 });
        }

        // Logout buttons in rail footer
        document.querySelectorAll('.rail-footer-item.danger .rail-nav-icon').forEach((container, i) => {
            const span = document.createElement('span');
            span.id    = `rail-icon-logout-${i}`;
            span.style.cssText = 'display:inline-flex;width:20px;height:20px;';
            container.innerHTML = '';
            container.appendChild(span);
            _load('logout', `rail-icon-logout-${i}`, '', { width: 20, height: 20 });
        });
    }

    // =========================================================================
    // PAGE-SPECIFIC ICON CONFIGS
    // =========================================================================

    function _loadIndexIcons() {
        _batch([
            // Search bar
            { name: 'clear',              targetId: 'search-clear-icon',   options: { width: 16, height: 16 } },
            { name: 'search',             targetId: 'search-btn-icon',     options: { width: 20, height: 20 } },
            // Sort & view controls
            { name: 'arrowdown',          targetId: 'sort-toggle-icon',    options: { width: 16, height: 16 } },
            { name: 'bulletedstackedbar', targetId: 'view-list-icon',      options: { width: 20, height: 20 } },
            { name: 'grid',               targetId: 'view-grid-icon',      options: { width: 20, height: 20 } },
            { name: 'stackedbar',         targetId: 'view-compact-icon',   options: { width: 20, height: 20 } },
            // Details view
            { name: 'back',               targetId: 'back-btn-icon',       options: { width: 16, height: 16 } },
            // Chatbot floating buttons
            { name: 'conversationhistory', targetId: 'history-btn-icon',  options: { width: 20, height: 20 } },
            { name: 'delete',             targetId: 'clear-btn-icon',      options: { width: 20, height: 20 } },
            { name: 'download',           targetId: 'export-btn-icon',     options: { width: 20, height: 20 } },
            { name: 'settings',           targetId: 'settings-btn-icon',   options: { width: 20, height: 20 } },
            // Chatbot send
            { name: 'sendmessage',        targetId: 'send-btn-icon',       options: { width: 18, height: 18 } },
            // Login modal
            { name: 'mail',               targetId: 'login-email-icon',    options: { width: 20, height: 20 } },
            { name: 'lock',               targetId: 'login-password-icon', options: { width: 20, height: 20 } },
            { name: 'login',              targetId: 'login-btn-icon',      options: { width: 18, height: 18 } },
            { name: 'googlelogo',         targetId: 'google-logo-icon',    options: { width: 24, height: 24 } },
            // Conversation
            { name: 'addconversation',    targetId: 'new-conversation-icon', options: { width: 16, height: 16, style: { verticalAlign: 'middle', marginRight: '0.5rem' } } },
            // Export modal
            { name: 'successful',         targetId: 'export-success-icon', options: { width: 64, height: 64, style: { marginBottom: '1rem' } } },
            // Citation
            { name: 'copy',               targetId: 'citation-copy-icon',  options: { width: 16, height: 16, style: { marginRight: '0.5rem' } } },
        ]);

        // Password toggle for login modal
        _initPasswordToggles();
    }

    function _loadAdminIcons() {
        // Admin page uses rail nav (handled by _loadRailNavIcons)
        // Add admin-specific static icons here if needed
    }

    function _loadLibrarianIcons() {
        // Librarian page uses rail nav (handled by _loadRailNavIcons)
    }

    function _loadStudentIcons() {
        // Student page uses rail nav (handled by _loadRailNavIcons)
    }

    function _loadTeacherIcons() {
        // Teacher page uses rail nav (handled by _loadRailNavIcons)
    }

    function _loadAboutIcons() {
        // Add about-page static icons here if needed
    }

    function _loadRegistrationIcons() {
        // Account registration page — initialize password toggles
        setTimeout(_initPasswordToggles, 200);
    }

    // =========================================================================
    // THEME MUTATION OBSERVER — set up once
    // =========================================================================
    let _themeObserverAttached = false;
    function _attachThemeObserver() {
        if (_themeObserverAttached) return;
        _themeObserverAttached = true;
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (m.attributeName === 'data-theme') _updateThemeIcons();
            });
        });
        observer.observe(document.documentElement, { attributes: true });
    }

    // =========================================================================
    // MAIN INITIALIZER
    // =========================================================================
    function _init() {
        const page = _detectPage();
        console.log(`[SVGInit] Initializing for page: ${page}`);

        // Always: common header icons + theme observer
        _loadCommonIcons();
        _attachThemeObserver();

        // Page-specific
        switch (page) {
            case 'index':        _loadIndexIcons();        break;
            case 'admin':        _loadRailNavIcons(); _loadAdminIcons();      break;
            case 'librarian':    _loadRailNavIcons(); _loadLibrarianIcons();  break;
            case 'student':      _loadRailNavIcons(); _loadStudentIcons();    break;
            case 'teacher':      _loadRailNavIcons(); _loadTeacherIcons();    break;
            case 'about':        _loadAboutIcons();        break;
            case 'registration': _loadRegistrationIcons(); break;
            default:
                console.warn(`[SVGInit] No icon config for page: "${page}"`);
        }
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────
    function _boot() {
        _waitForLoader(_init);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
    } else {
        _boot();
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    global.SVGInit = {
        updateThemeIcons:    _updateThemeIcons,
        initPasswordToggles: _initPasswordToggles,
        loadRailNavIcons:    _loadRailNavIcons,
    };

    // Backwards-compat: keep window.updateThemeIcons and window.initializePasswordToggleIcons
    global.updateThemeIcons = _updateThemeIcons;
    global.initializePasswordToggleIcons = _initPasswordToggles;

})(window);

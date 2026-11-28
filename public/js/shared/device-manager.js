/**
 * ============================================================================
 * RE-CAPS Account Security & Manage All Devices Controller
 * ============================================================================
 * - Universally mounts compact "Account Security" controls inside stakeholder
 *   profile cards (#aset-profile-card, #lset-profile-card, #sset-profile-card).
 * - Tracks IP address, approximate location, device/OS/browser, first login,
 *   and last active timestamp in Firestore (users/{uid}/devices/{deviceId})
 *   via authenticated Express backend endpoints.
 * - Supports per-device remote sign-out, "Sign out all other devices", and
 *   automatic enforcement when this browser's session is revoked remotely.
 * ============================================================================
 */

(function (window, document) {
    'use strict';

    const DEVICE_ID_STORAGE_KEY = 'recaps_device_id';
    const LAST_SYNC_STORAGE_KEY = 'recaps_device_last_sync';
    const SYNC_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes (protects Firestore Spark quota)
    const REVOCATION_CHECK_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes on window focus

    let currentDevicesCache = [];
    let lastFocusCheckAt = 0;
    let isForcingSignOut = false;
    let isModalOpen = false;
    let hasMountedCardWidget = false;

    function getCandidateBackendUrls() {
        if (typeof window.BACKEND_API_BASE === 'string' && window.BACKEND_API_BASE.trim()) {
            return [window.BACKEND_API_BASE.replace(/\/+$/, '')];
        }
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        return isLocal
            ? ['http://localhost:3001', 'https://recap-backend-jy5b.onrender.com']
            : ['https://recap-backend-jy5b.onrender.com', 'http://localhost:3001'];
    }

    async function requestDeviceApi(apiPath, options = {}) {
        const bases = getCandidateBackendUrls();
        let lastErr = null;
        for (const base of bases) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            try {
                const resp = await fetch(`${base}${apiPath}`, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timer);
                return resp;
            } catch (err) {
                clearTimeout(timer);
                lastErr = err;
            }
        }
        throw lastErr || new Error('Unable to reach RE-CAPS security service.');
    }

    function getOrCreateDeviceId() {
        try {
            let existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
            if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
                return existing;
            }
            const bytes = new Uint8Array(12);
            if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                window.crypto.getRandomValues(bytes);
            } else {
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = Math.floor(Math.random() * 256);
                }
            }
            const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
            const id = `dev_${hex}`;
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
            return id;
        } catch (e) {
            return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        }
    }

    function detectClientHardware() {
        const ua = navigator.userAgent || '';
        let os = 'Unknown OS';
        if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
        else if (/Windows NT/i.test(ua)) os = 'Windows';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPad/i.test(ua)) os = 'iPadOS';
        else if (/iPhone|iPod/i.test(ua)) os = 'iOS';
        else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
        else if (/CrOS/i.test(ua)) os = 'ChromeOS';
        else if (/Linux/i.test(ua)) os = 'Linux';

        let browser = 'Web Browser';
        if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
        else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
        else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
        else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Google Chrome';
        else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

        let deviceType = 'desktop';
        if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
            deviceType = 'tablet';
        } else if (/Mobile|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) {
            deviceType = 'mobile';
        }

        let timezone = 'UTC';
        try {
            timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch (_) {}

        const screenRes = (window.screen && window.screen.width && window.screen.height)
            ? `${window.screen.width}x${window.screen.height}`
            : 'Unknown';

        return {
            deviceId: getOrCreateDeviceId(),
            deviceType,
            os,
            browser,
            deviceName: `${os} · ${browser}`,
            platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || os,
            screen: screenRes,
            timezone
        };
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDateTime(iso) {
        if (!iso) return 'Unknown';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatRelativeTime(iso) {
        if (!iso) return '';
        const diffMs = Date.now() - new Date(iso).getTime();
        if (Number.isNaN(diffMs) || diffMs < 0) return 'Just now';
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    }

    function getDeviceIconSvg(deviceType) {
        if (deviceType === 'mobile') {
            return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>';
        }
        if (deviceType === 'tablet') {
            return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>';
        }
        return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
    }

    async function getAuthUserAndToken() {
        if (typeof firebase === 'undefined' || !firebase.auth) return null;
        const user = firebase.auth().currentUser;
        if (!user) return null;
        const token = await user.getIdToken();
        return { user, token };
    }

    async function enforceRemoteSignOut() {
        if (isForcingSignOut) return;
        isForcingSignOut = true;
        try {
            if (typeof showToast === 'function') {
                showToast('This device session was signed out remotely for account security.', 'warning');
            }
            localStorage.removeItem('cachedAuthState');
            localStorage.removeItem(LAST_SYNC_STORAGE_KEY);
            sessionStorage.clear();
            if (typeof firebase !== 'undefined' && firebase.auth) {
                await firebase.auth().signOut();
            }
        } catch (err) {
            console.warn('[DeviceManager] Remote sign-out cleanup warning:', err);
        } finally {
            setTimeout(() => {
                const inPages = window.location.pathname.includes('/pages/');
                window.location.href = inPages ? '../index.html' : 'index.html';
            }, 900);
        }
    }

    /**
     * Registers or refreshes the current browser's device session in Firestore.
     * Throttled to once per 10 minutes unless { isFreshLogin: true } or { force: true }.
     */
    async function registerCurrentDevice(options = {}) {
        try {
            const authBundle = await getAuthUserAndToken();
            if (!authBundle) return null;

            const { user, token } = authBundle;
            const hw = detectClientHardware();
            const isFreshLogin = Boolean(options.isFreshLogin);
            const force = Boolean(options.force);

            const syncCacheKey = `${user.uid}:${hw.deviceId}`;
            if (!isFreshLogin && !force) {
                try {
                    const lastRaw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
                    if (lastRaw) {
                        const parsed = JSON.parse(lastRaw);
                        if (parsed.key === syncCacheKey && (Date.now() - parsed.ts) < SYNC_THROTTLE_MS) {
                            return null;
                        }
                    }
                } catch (_) {}
            }

            // Guard against orphan subcollection writes for incomplete Google sign-ups or deleted accounts
            if (typeof db !== 'undefined' && db && typeof db.collection === 'function') {
                try {
                    const profileSnap = await db.collection('users').doc(user.uid).get();
                    if (!profileSnap.exists) {
                        return null;
                    }
                } catch (_) {}
            }

            const resp = await requestDeviceApi('/api/auth/devices/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...hw,
                    isFreshLogin
                })
            });

            const data = await resp.json().catch(() => ({}));
            if (resp.status === 403 && (data.revoked || data.code === 'SESSION_REVOKED')) {
                await enforceRemoteSignOut();
                return null;
            }

            if (resp.ok && data.success) {
                try {
                    localStorage.setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify({ key: syncCacheKey, ts: Date.now() }));
                } catch (_) {}
                return data.device || null;
            }
            return null;
        } catch (err) {
            console.warn('[DeviceManager] Register device skipped:', err.message);
            return null;
        }
    }

    /**
     * Fetches all tracked devices for the authenticated user and updates UI summary.
     */
    async function fetchDevices() {
        const authBundle = await getAuthUserAndToken();
        if (!authBundle) return { devices: [], activeCount: 0, totalCount: 0, currentRevoked: false };

        const { token } = authBundle;
        const currentDeviceId = getOrCreateDeviceId();
        const resp = await requestDeviceApi(`/api/auth/devices?deviceId=${encodeURIComponent(currentDeviceId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
            throw new Error(data.error || 'Could not load device sessions.');
        }

        if (data.currentRevoked) {
            await enforceRemoteSignOut();
            return data;
        }

        currentDevicesCache = Array.isArray(data.devices) ? data.devices : [];
        updateProfileCardSummary(data);
        return data;
    }

    function updateProfileCardSummary(data) {
        const countEl = document.getElementById('acct-sec-active-count');
        const metaEl = document.getElementById('acct-sec-current-meta');
        const activeCount = Number(data && data.activeCount) || 0;

        if (countEl) {
            countEl.textContent = activeCount === 1 ? '1 active device' : `${activeCount} active devices`;
        }
        if (metaEl && Array.isArray(data.devices)) {
            const current = data.devices.find(d => d.isCurrent) || data.devices[0];
            if (current) {
                metaEl.textContent = `${current.ipAddress} · ${current.location}`;
                metaEl.title = `${current.deviceName} — ${current.ipAddress} (${current.location})`;
            }
        }
    }

    function injectProfileCardWidget() {
        if (hasMountedCardWidget) return;
        const card = document.querySelector('#sset-profile-card, #lset-profile-card, #aset-profile-card');
        if (!card || card.querySelector('.acct-sec-block')) return;

        hasMountedCardWidget = true;
        const block = document.createElement('div');
        block.className = 'acct-sec-block';
        block.id = 'acct-sec-block';
        block.innerHTML = `
            <div class="acct-sec-head">
                <span class="acct-sec-eyebrow">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                    <span>Account Security</span>
                </span>
                <span class="acct-sec-count" id="acct-sec-active-count">Checking...</span>
            </div>
            <p class="acct-sec-meta" id="acct-sec-current-meta">Signed-in devices &amp; session history</p>
            <button type="button" class="acct-sec-manage-btn" id="open-manage-devices-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                <span>Manage All Devices</span>
            </button>
        `;

        // Place cleanly above the profile-card Log Out button if present (Student/Teacher),
        // otherwise append at the bottom of the profile card (Admin/Librarian).
        const logoutWrap = card.querySelector('.sset-profile-logout-wrap, .lset-profile-logout-wrap, .aset-profile-logout-wrap');
        if (logoutWrap && logoutWrap.parentNode === card) {
            card.insertBefore(block, logoutWrap);
        } else {
            card.appendChild(block);
        }

        const openBtn = block.querySelector('#open-manage-devices-btn');
        if (openBtn) {
            openBtn.addEventListener('click', openManageDevicesModal);
        }
    }

    function ensureModalMounted() {
        if (document.getElementById('manage-devices-modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'manage-devices-modal';
        overlay.className = 'dm-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'dm-modal-title');
        overlay.innerHTML = `
            <div class="dm-modal-dialog">
                <div class="dm-modal-header">
                    <div class="dm-header-left">
                        <div class="dm-header-icon" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                        </div>
                        <div>
                            <h3 class="dm-modal-title" id="dm-modal-title">Manage All Devices</h3>
                            <p class="dm-modal-subtitle">Review signed-in devices, IP addresses, approximate locations, and remotely sign out unrecognized sessions.</p>
                        </div>
                    </div>
                    <div class="dm-header-actions">
                        <button type="button" class="dm-icon-btn" id="dm-refresh-btn" title="Refresh device list" aria-label="Refresh device list">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        </button>
                        <button type="button" class="dm-icon-btn" id="dm-close-btn" title="Close" aria-label="Close">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>

                <div class="dm-summary-bar">
                    <div class="dm-summary-metrics">
                        <div class="dm-metric">
                            <span class="dm-metric-lbl">Active Sessions</span>
                            <span class="dm-metric-val" id="dm-sum-active">--</span>
                        </div>
                        <div class="dm-metric">
                            <span class="dm-metric-lbl">Current IP</span>
                            <span class="dm-metric-val" id="dm-sum-ip">--</span>
                        </div>
                        <div class="dm-metric">
                            <span class="dm-metric-lbl">Location</span>
                            <span class="dm-metric-val" id="dm-sum-loc">--</span>
                        </div>
                    </div>
                    <button type="button" class="dm-revoke-others-btn" id="dm-revoke-others-btn" hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        <span>Sign out all other devices</span>
                    </button>
                </div>

                <div class="dm-modal-body" id="dm-devices-list">
                    <div class="dm-empty-state">Loading active and recent device sessions...</div>
                </div>

                <div class="dm-modal-footer">
                    <span>Up to 12 most recent device sessions are preserved securely in Firestore.</span>
                    <span id="dm-footer-updated">Synced</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeManageDevicesModal();
        });
        overlay.querySelector('#dm-close-btn').addEventListener('click', closeManageDevicesModal);
        overlay.querySelector('#dm-refresh-btn').addEventListener('click', () => loadAndRenderDevices(true));
        overlay.querySelector('#dm-revoke-others-btn').addEventListener('click', handleRevokeAllOtherDevices);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isModalOpen) {
                closeManageDevicesModal();
            }
        });
    }

    function renderDevicesModal(data) {
        const listEl = document.getElementById('dm-devices-list');
        const sumActive = document.getElementById('dm-sum-active');
        const sumIp = document.getElementById('dm-sum-ip');
        const sumLoc = document.getElementById('dm-sum-loc');
        const revokeOthersBtn = document.getElementById('dm-revoke-others-btn');
        const updatedEl = document.getElementById('dm-footer-updated');

        const devices = Array.isArray(data.devices) ? data.devices : [];
        const activeCount = Number(data.activeCount) || 0;
        const current = devices.find(d => d.isCurrent) || devices[0];
        const otherActiveCount = devices.filter(d => !d.isCurrent && d.status === 'active').length;

        if (sumActive) sumActive.textContent = `${activeCount} of ${devices.length}`;
        if (sumIp) sumIp.textContent = current ? current.ipAddress : 'Unavailable';
        if (sumLoc) sumLoc.textContent = current ? current.location : 'Unavailable';
        if (revokeOthersBtn) revokeOthersBtn.hidden = otherActiveCount === 0;
        if (updatedEl) {
            updatedEl.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        if (!listEl) return;
        if (devices.length === 0) {
            listEl.innerHTML = '<div class="dm-empty-state">No device sessions have been recorded yet.</div>';
            return;
        }

        listEl.innerHTML = devices.map(dev => {
            const isRevoked = dev.status === 'revoked';
            const cardCls = `dm-device-card${dev.isCurrent ? ' is-current' : ''}${isRevoked ? ' is-revoked' : ''}`;
            const statusTag = dev.isCurrent
                ? '<span class="dm-status-tag tag-current">This Device</span>'
                : (isRevoked
                    ? '<span class="dm-status-tag tag-revoked">Signed Out</span>'
                    : '<span class="dm-status-tag">Active</span>');

            const lastRel = formatRelativeTime(dev.lastActiveAt);
            const lastFull = formatDateTime(dev.lastActiveAt);
            const firstFull = formatDateTime(dev.firstLoginAt);

            let actionHtml = '';
            if (dev.isCurrent) {
                actionHtml = '<span class="dm-revoked-note">Current session</span>';
            } else if (isRevoked) {
                actionHtml = `<span class="dm-revoked-note">Ended ${escapeHtml(formatDateTime(dev.revokedAt))}</span>`;
            } else {
                actionHtml = `
                    <button type="button" class="dm-signout-btn" data-revoke-device="${escapeHtml(dev.deviceId)}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        <span>Sign out</span>
                    </button>
                `;
            }

            return `
                <div class="${cardCls}">
                    <div class="dm-device-left">
                        <div class="dm-device-icon" aria-hidden="true">${getDeviceIconSvg(dev.deviceType)}</div>
                        <div class="dm-device-info">
                            <div class="dm-device-title-row">
                                <span class="dm-device-name">${escapeHtml(dev.deviceName)}</span>
                                ${statusTag}
                            </div>
                            <div class="dm-meta-grid">
                                <div class="dm-meta-item" title="IP Address: ${escapeHtml(dev.ipAddress)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    <span class="dm-meta-label">IP:</span>
                                    <span class="dm-meta-val is-mono">${escapeHtml(dev.ipAddress)}</span>
                                </div>
                                <div class="dm-meta-item" title="Location: ${escapeHtml(dev.location)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                    <span class="dm-meta-label">Location:</span>
                                    <span class="dm-meta-val">${escapeHtml(dev.location)}</span>
                                </div>
                                <div class="dm-meta-item" title="Last Active: ${escapeHtml(lastFull)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    <span class="dm-meta-label">Active:</span>
                                    <span class="dm-meta-val">${escapeHtml(lastRel ? `${lastRel} (${lastFull})` : lastFull)}</span>
                                </div>
                                <div class="dm-meta-item" title="First Signed In: ${escapeHtml(firstFull)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    <span class="dm-meta-label">First login:</span>
                                    <span class="dm-meta-val">${escapeHtml(firstFull)}</span>
                                </div>
                                <div class="dm-meta-item" title="Device & Display: ${escapeHtml(dev.os)} · ${escapeHtml(dev.screen)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line></svg>
                                    <span class="dm-meta-label">System:</span>
                                    <span class="dm-meta-val">${escapeHtml(dev.os)} · ${escapeHtml(dev.screen)}</span>
                                </div>
                                <div class="dm-meta-item" title="Timezone: ${escapeHtml(dev.timezone)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.93 4.93l1.41 1.41"></path><path d="M17.66 17.66l1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path></svg>
                                    <span class="dm-meta-label">Timezone:</span>
                                    <span class="dm-meta-val">${escapeHtml(dev.timezone)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="dm-device-actions">${actionHtml}</div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('[data-revoke-device]').forEach(btn => {
            btn.addEventListener('click', () => handleRevokeSingleDevice(btn.getAttribute('data-revoke-device'), btn));
        });
    }

    async function loadAndRenderDevices(forceRegister = false) {
        const refreshBtn = document.getElementById('dm-refresh-btn');
        const listEl = document.getElementById('dm-devices-list');
        if (refreshBtn) refreshBtn.classList.add('is-spinning');
        try {
            if (forceRegister) {
                await registerCurrentDevice({ force: true });
            }
            const data = await fetchDevices();
            renderDevicesModal(data);
        } catch (err) {
            if (listEl) {
                listEl.innerHTML = `<div class="dm-empty-state">${escapeHtml(err.message || 'Unable to load devices right now.')}</div>`;
            }
        } finally {
            if (refreshBtn) refreshBtn.classList.remove('is-spinning');
        }
    }

    async function confirmAction(title, message, confirmText) {
        return await ModalDialog.confirm({
            title,
            message,
            confirmText,
            cancelText: 'Cancel',
            isDanger: true
        });
    }

    async function handleRevokeSingleDevice(targetDeviceId, btnEl) {
        if (!targetDeviceId) return;
        const target = currentDevicesCache.find(d => d.deviceId === targetDeviceId);
        const targetLabel = target ? `${target.deviceName} (${target.ipAddress})` : 'this device';

        const ok = await confirmAction(
            'Sign Out Device',
            `Remotely sign out ${targetLabel}? That browser will be logged out automatically on its next check.`,
            'Sign Out Device'
        );
        if (!ok) return;

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Signing out...';
        }

        try {
            const authBundle = await getAuthUserAndToken();
            if (!authBundle) return;

            const resp = await requestDeviceApi('/api/auth/devices/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authBundle.token}`
                },
                body: JSON.stringify({
                    deviceId: targetDeviceId,
                    currentDeviceId: getOrCreateDeviceId()
                })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.success) {
                throw new Error(data.error || 'Failed to sign out device.');
            }
            if (typeof showToast === 'function') {
                showToast('Device session revoked successfully.', 'success');
            }
            await loadAndRenderDevices(false);
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err.message || 'Could not revoke device.', 'error');
            }
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Sign out';
            }
        }
    }

    async function handleRevokeAllOtherDevices() {
        const btn = document.getElementById('dm-revoke-others-btn');
        const ok = await confirmAction(
            'Sign Out All Other Devices',
            'All other active browsers and devices signed into your RE-CAPS account will be logged out automatically. Your current session will remain active.',
            'Sign Out All Others'
        );
        if (!ok) return;

        if (btn) btn.disabled = true;
        try {
            const authBundle = await getAuthUserAndToken();
            if (!authBundle) return;

            const resp = await requestDeviceApi('/api/auth/devices/revoke-others', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authBundle.token}`
                },
                body: JSON.stringify({
                    currentDeviceId: getOrCreateDeviceId()
                })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.success) {
                throw new Error(data.error || 'Failed to revoke other devices.');
            }
            if (typeof showToast === 'function') {
                const n = Number(data.revokedCount) || 0;
                showToast(n > 0 ? `Signed out ${n} other device${n === 1 ? '' : 's'}.` : 'No other active devices found.', 'success');
            }
            await loadAndRenderDevices(false);
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast(err.message || 'Could not sign out other devices.', 'error');
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function openManageDevicesModal() {
        ensureModalMounted();
        const overlay = document.getElementById('manage-devices-modal');
        if (!overlay) return;
        overlay.classList.add('open');
        isModalOpen = true;
        loadAndRenderDevices(false);
    }

    function closeManageDevicesModal() {
        const overlay = document.getElementById('manage-devices-modal');
        if (overlay) overlay.classList.remove('open');
        isModalOpen = false;
    }

    function bootstrapOnDashboard() {
        const hasProfileCard = Boolean(document.querySelector('#sset-profile-card, #lset-profile-card, #aset-profile-card'));
        if (hasProfileCard) {
            injectProfileCardWidget();
        }

        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (!user) return;
                await registerCurrentDevice({ force: false });
                if (hasProfileCard) {
                    try {
                        await fetchDevices();
                    } catch (_) {}
                }
            });
        }

        // Refresh active summary when user opens the Settings section
        window.addEventListener('rail:section-change', (e) => {
            if (e && e.detail && e.detail.sectionId === 'settings' && hasProfileCard) {
                fetchDevices().catch(() => {});
            }
        });

        // Lightweight remote-revocation check when tab regains focus (throttled to 2 min)
        window.addEventListener('focus', () => {
            if ((Date.now() - lastFocusCheckAt) < REVOCATION_CHECK_THROTTLE_MS) return;
            lastFocusCheckAt = Date.now();
            if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
                fetchDevices().catch(() => {});
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapOnDashboard);
    } else {
        bootstrapOnDashboard();
    }

    window.DeviceManager = {
        getDeviceId: getOrCreateDeviceId,
        registerCurrentDevice,
        fetchDevices,
        openModal: openManageDevicesModal,
        closeModal: closeManageDevicesModal
    };
})(window, document);

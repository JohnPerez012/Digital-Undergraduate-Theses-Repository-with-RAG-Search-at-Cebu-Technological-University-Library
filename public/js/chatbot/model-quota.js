/**
 * ModelQuotaManager — Concept A (4-Tier Model Health Pool) + Concept B (Role-Based Daily Allocation)
 * Visual UI: Option 2 (Compact Segmented Progress Bars)
 *
 * Zero Firestore Quota Waste:
 *   - Authoritative daily usage & 4-tier operational health synced via backend X-RateLimit-* & X-Model-Health headers
 *   - Client-side localStorage mirror keyed by UID + PHT date (YYYYMMDD) auto-resets at 12:00 AM PHT (UTC+8)
 *
 * Role Daily Quotas:
 *   - Student: 25 queries/day
 *   - Faculty / Teacher: 50 queries/day
 *   - Librarian & Admin: 150 queries/day
 */

(function (global) {
  'use strict';

  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const ROLE_LIMITS = {
    student: 25,
    teacher: 50,
    faculty: 50,
    librarian: 150,
    admin: 150,
    guest: 25
  };

  const ROLE_LABELS = {
    student: 'Student',
    teacher: 'Faculty',
    faculty: 'Faculty',
    librarian: 'Librarian',
    admin: 'Admin',
    guest: 'Guest'
  };

  const DEFAULT_TIERS = [
    { key: 'mistral',    tier: 1, name: 'Mistral AI',    model: 'open-mistral-nemo',   configured: true, status: 'active',  healthPct: 100, cooldownSeconds: 0, rpmUsed: 0, rpmLimit: 20 },
    { key: 'groq',       tier: 2, name: 'Groq AI',       model: 'gpt-oss-120b',        configured: true, status: 'standby', healthPct: 100, cooldownSeconds: 0, rpmUsed: 0, rpmLimit: 30 },
    { key: 'gemini',     tier: 3, name: 'Google Gemini', model: 'gemini-3.5-flash-lite', configured: true, status: 'standby', healthPct: 100, cooldownSeconds: 0, rpmUsed: 0, rpmLimit: 15 },
    { key: 'openrouter', tier: 4, name: 'OpenRouter',    model: 'nemotron-3-nano',     configured: true, status: 'standby', healthPct: 100, cooldownSeconds: 0, rpmUsed: 0, rpmLimit: 20 }
  ];

  const PROVIDER_DISPLAY = {
    mistral: 'Mistral',
    groq: 'Groq',
    gemini: 'Gemini',
    openrouter: 'OpenRouter'
  };

  const ModelQuotaManager = {
    initialized: false,
    isOpen: false,
    isSyncing: false,
    cooldownTimerId: null,
    midnightTimerId: null,
    currentUid: 'guest',
    state: {
      quota: {
        role: 'student',
        limit: 25,
        used: 0,
        remaining: 25,
        dayKey: '',
        resetAt: 0,
        resetLabel: '12:00 AM',
        byModel: { mistral: 0, groq: 0, gemini: 0, openrouter: 0 },
        lastProviderKey: 'mistral',
        exhausted: false
      },
      modelHealth: {
        activeTier: 'mistral',
        cascadeOrder: ['mistral', 'groq', 'gemini', 'openrouter'],
        updatedAt: 0,
        tiers: DEFAULT_TIERS.map(t => ({ ...t }))
      }
    },

    getApiBaseUrl() {
      if (typeof AIService !== 'undefined' && AIService.API_BASE_URL) {
        return AIService.API_BASE_URL;
      }
      return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3001/api'
        : 'https://recap-backend-jy5b.onrender.com/api';
    },

    getPhtDayInfo() {
      const nowMs = Date.now();
      const phtNow = new Date(nowMs + PHT_OFFSET_MS);
      const y = phtNow.getUTCFullYear();
      const m = String(phtNow.getUTCMonth() + 1).padStart(2, '0');
      const d = String(phtNow.getUTCDate()).padStart(2, '0');
      const dayKey = `${y}-${m}-${d}`;
      const compactKey = `${y}${m}${d}`;
      const resetAt = Date.UTC(y, phtNow.getUTCMonth(), phtNow.getUTCDate() + 1, 0, 0, 0) - PHT_OFFSET_MS;
      return { dayKey, compactKey, resetAt, resetLabel: '12:00 AM' };
    },

    getStorageKey(uid, compactDay) {
      return `recaps_model_usage_${uid || 'guest'}_${compactDay}`;
    },

    normalizeRole(rawRole) {
      const r = String(rawRole || 'student').trim().toLowerCase();
      if (r === 'admin') return 'admin';
      if (r === 'librarian') return 'librarian';
      if (r === 'teacher' || r === 'faculty') return 'teacher';
      return 'student';
    },

    getPreferredProviderKey() {
      try {
        const saved = JSON.parse(localStorage.getItem('recaps_chatbot_settings') || '{}');
        const pref = String(saved.preferredProvider || 'mistral').toLowerCase();
        if (pref.includes('groq')) return 'groq';
        if (pref.includes('gemini')) return 'gemini';
        if (pref.includes('openrouter')) return 'openrouter';
      } catch (_e) {}
      return 'mistral';
    },

    /**
     * Initialize listeners, local storage hydration, and midnight reset guard
     */
    init() {
      if (this.initialized) return;
      this.initialized = true;

      this.bindUIEvents();
      this.hydrateFromLocal('guest', 'student');
      this.render();
      this.scheduleMidnightReset();
    },

    bindUIEvents() {
      const dockBtn = document.getElementById('model-quota-dock-btn');
      const pillBtn = document.getElementById('quota-status-pill');
      const closeBtn = document.getElementById('quota-popover-close');
      const refreshBtn = document.getElementById('quota-popover-refresh');

      if (dockBtn) {
        dockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePopover();
        });
      }

      if (pillBtn) {
        pillBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePopover();
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closePopover();
        });
      }

      if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.syncWithServer(true);
        });
      }

      // Close when clicking outside popover
      document.addEventListener('click', (e) => {
        if (!this.isOpen) return;
        const popover = document.getElementById('model-quota-popover');
        const dock = document.getElementById('model-quota-dock-btn');
        const pill = document.getElementById('quota-status-pill');
        if (
          popover &&
          !popover.contains(e.target) &&
          (!dock || !dock.contains(e.target)) &&
          (!pill || !pill.contains(e.target))
        ) {
          this.closePopover();
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.closePopover();
        }
      });
    },

    togglePopover() {
      if (this.isOpen) {
        this.closePopover();
      } else {
        this.openPopover();
      }
    },

    openPopover() {
      const popover = document.getElementById('model-quota-popover');
      const dockBtn = document.getElementById('model-quota-dock-btn');
      if (!popover) return;
      this.isOpen = true;
      popover.classList.add('active');
      popover.setAttribute('aria-hidden', 'false');
      if (dockBtn) dockBtn.classList.add('quota-btn-active');
      this.render();
      this.syncWithServer(false);
    },

    closePopover() {
      const popover = document.getElementById('model-quota-popover');
      const dockBtn = document.getElementById('model-quota-dock-btn');
      if (!popover) return;
      this.isOpen = false;
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      if (dockBtn) dockBtn.classList.remove('quota-btn-active');
    },

    /**
     * Called when Firebase Auth state resolves or changes
     */
    async onAuthChanged(user) {
      if (!user) {
        this.currentUid = 'guest';
        this.hydrateFromLocal('guest', 'student');
        this.render();
        return;
      }

      this.currentUid = user.uid;
      let role = 'student';
      if (typeof ChatService !== 'undefined' && typeof ChatService.getUserRole === 'function') {
        try {
          role = await ChatService.getUserRole(user);
        } catch (_e) {}
      } else {
        role = sessionStorage.getItem('userType') || localStorage.getItem('userType') || 'student';
      }

      this.hydrateFromLocal(user.uid, role);
      this.render();
      await this.syncWithServer(false);
    },

    /**
     * Prunes stale previous-day keys and hydrates today's PHT counter from localStorage
     */
    hydrateFromLocal(uid, role) {
      const pht = this.getPhtDayInfo();
      const normRole = this.normalizeRole(role);
      const limit = ROLE_LIMITS[normRole] || 25;
      const key = this.getStorageKey(uid, pht.compactKey);

      // Clean up expired daily keys for this user
      try {
        const prefix = `recaps_model_usage_${uid || 'guest'}_`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix) && k !== key) {
            localStorage.removeItem(k);
          }
        }
      } catch (_e) {}

      let stored = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) stored = JSON.parse(raw);
      } catch (_e) {}

      const used = stored && typeof stored.used === 'number' ? Math.max(0, stored.used) : 0;
      const byModel = {
        mistral: stored?.byModel?.mistral || 0,
        groq: stored?.byModel?.groq || 0,
        gemini: stored?.byModel?.gemini || 0,
        openrouter: stored?.byModel?.openrouter || 0
      };

      this.state.quota = {
        role: normRole,
        limit,
        used: Math.min(used, limit),
        remaining: Math.max(0, limit - used),
        dayKey: pht.dayKey,
        resetAt: pht.resetAt,
        resetLabel: pht.resetLabel,
        byModel,
        lastProviderKey: stored?.lastProviderKey || this.getPreferredProviderKey(),
        exhausted: used >= limit
      };

      this.persistToLocal();
    },

    persistToLocal() {
      try {
        const pht = this.getPhtDayInfo();
        const key = this.getStorageKey(this.currentUid, pht.compactKey);
        localStorage.setItem(key, JSON.stringify({
          dayKey: pht.dayKey,
          role: this.state.quota.role,
          limit: this.state.quota.limit,
          used: this.state.quota.used,
          byModel: this.state.quota.byModel,
          lastProviderKey: this.state.quota.lastProviderKey,
          updatedAt: Date.now()
        }));
      } catch (_e) {}
    },

    scheduleMidnightReset() {
      if (this.midnightTimerId) {
        clearTimeout(this.midnightTimerId);
      }
      const { resetAt } = this.getPhtDayInfo();
      const msUntilMidnight = Math.max(5000, (resetAt - Date.now()) + 1500);
      // Cap setTimeout to 6 hours and re-evaluate safely
      const delay = Math.min(msUntilMidnight, 6 * 60 * 60 * 1000);
      this.midnightTimerId = setTimeout(() => {
        const pht = this.getPhtDayInfo();
        if (this.state.quota.dayKey && this.state.quota.dayKey !== pht.dayKey) {
          this.hydrateFromLocal(this.currentUid, this.state.quota.role);
          this.render();
          this.syncWithServer(false);
        }
        this.scheduleMidnightReset();
      }, delay);
    },

    async getAuthHeaders() {
      const headers = {};
      try {
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
          const token = await firebase.auth().currentUser.getIdToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        }
      } catch (_e) {}
      return headers;
    },

    /**
     * Fetch live quota & 4-tier model health from GET /api/chat/quota
     */
    async syncWithServer(forceSpinner = false) {
      if (this.isSyncing) return;
      this.isSyncing = true;

      const refreshBtn = document.getElementById('quota-popover-refresh');
      if (refreshBtn && forceSpinner) {
        refreshBtn.classList.add('is-spinning');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const headers = await this.getAuthHeaders();
        const pref = encodeURIComponent(this.getPreferredProviderKey());
        const res = await fetch(`${this.getApiBaseUrl()}/chat/quota?preferredProvider=${pref}`, {
          method: 'GET',
          headers,
          signal: controller.signal
        });

        this.ingestResponseHeaders(res);

        if (res.ok) {
          const data = await res.json();
          this.applyServerPayload(data);
        }
      } catch (err) {
        // Silent graceful fallback to localStorage cache if backend is cold-starting
        console.warn('[ModelQuotaManager] Sync warning (using local mirror):', err.message || err);
      } finally {
        clearTimeout(timeoutId);
        this.isSyncing = false;
        if (refreshBtn) refreshBtn.classList.remove('is-spinning');
      }
    },

    /**
     * Read standard backend rate-limiting headers from any /api/chat or /api/chat/quota response
     */
    ingestResponseHeaders(response) {
      if (!response || !response.headers) return;

      const limitHdr = response.headers.get('X-RateLimit-Limit');
      const remHdr = response.headers.get('X-RateLimit-Remaining');
      const usedHdr = response.headers.get('X-RateLimit-Used');
      const resetHdr = response.headers.get('X-RateLimit-Reset');
      const roleHdr = response.headers.get('X-RateLimit-Role');
      const tierHdr = response.headers.get('X-RateLimit-Tier');
      const healthHdr = response.headers.get('X-Model-Health');

      let changed = false;

      if (roleHdr) {
        this.state.quota.role = this.normalizeRole(roleHdr);
        changed = true;
      }

      if (limitHdr !== null && !Number.isNaN(Number(limitHdr))) {
        this.state.quota.limit = Math.max(1, Number(limitHdr));
        changed = true;
      }

      if (usedHdr !== null && !Number.isNaN(Number(usedHdr))) {
        const serverUsed = Math.max(0, Number(usedHdr));
        // Reconcile smoothly if server restarted cold while client already recorded local queries today
        this.state.quota.used = Math.min(this.state.quota.limit, Math.max(serverUsed, this.state.quota.used));
        changed = true;
      } else if (remHdr !== null && !Number.isNaN(Number(remHdr))) {
        const derivedUsed = Math.max(0, this.state.quota.limit - Number(remHdr));
        this.state.quota.used = Math.min(this.state.quota.limit, Math.max(derivedUsed, this.state.quota.used));
        changed = true;
      }

      if (changed) {
        this.state.quota.remaining = Math.max(0, this.state.quota.limit - this.state.quota.used);
        this.state.quota.exhausted = this.state.quota.remaining <= 0;
      }

      if (resetHdr !== null && !Number.isNaN(Number(resetHdr))) {
        this.state.quota.resetAt = Number(resetHdr);
      }

      if (tierHdr) {
        const normalizedTier = String(tierHdr).toLowerCase();
        if (PROVIDER_DISPLAY[normalizedTier]) {
          this.state.quota.lastProviderKey = normalizedTier;
          this.state.modelHealth.activeTier = normalizedTier;
          changed = true;
        }
      }

      if (healthHdr) {
        try {
          const compact = JSON.parse(healthHdr);
          if (Array.isArray(compact) && compact.length > 0) {
            this._applyCompactHealth(compact);
            changed = true;
          }
        } catch (_e) {}
      }

      if (changed) {
        this.persistToLocal();
        this.ensureCooldownTicker();
        this.render();
      }
    },

    _applyCompactHealth(compactList) {
      const byKey = new Map(this.state.modelHealth.tiers.map(t => [t.key, t]));
      const nextTiers = [];
      compactList.forEach((item, idx) => {
        const existing = byKey.get(item.k) || DEFAULT_TIERS.find(d => d.key === item.k);
        if (!existing) return;
        nextTiers.push({
          ...existing,
          tier: idx + 1,
          status: item.s || existing.status,
          healthPct: typeof item.p === 'number' ? item.p : existing.healthPct,
          cooldownSeconds: typeof item.c === 'number' ? item.c : 0,
          rpmUsed: typeof item.r === 'number' ? item.r : existing.rpmUsed,
          rpmLimit: typeof item.m === 'number' ? item.m : existing.rpmLimit
        });
      });
      if (nextTiers.length > 0) {
        this.state.modelHealth.tiers = nextTiers;
        this.state.modelHealth.updatedAt = Date.now();
        const active = nextTiers.find(t => t.status === 'active');
        if (active) this.state.modelHealth.activeTier = active.key;
      }
    },

    /**
     * Merge full JSON quota & modelHealth payload from backend SSE done event, 429 error, or GET /api/chat/quota
     */
    applyServerPayload(payload) {
      if (!payload || typeof payload !== 'object') return;
      let changed = false;

      if (payload.quota && typeof payload.quota === 'object') {
        const q = payload.quota;
        const pht = this.getPhtDayInfo();
        const role = this.normalizeRole(q.role || this.state.quota.role);
        const limit = Math.max(1, Number(q.limit) || ROLE_LIMITS[role] || 25);
        const serverUsed = Math.max(0, Number(q.used) || 0);
        const sameDay = !this.state.quota.dayKey || this.state.quota.dayKey === (q.dayKey || pht.dayKey);
        const mergedUsed = sameDay
          ? Math.min(limit, Math.max(serverUsed, this.state.quota.used))
          : Math.min(limit, serverUsed);

        const mergedByModel = { mistral: 0, groq: 0, gemini: 0, openrouter: 0 };
        for (const k of Object.keys(mergedByModel)) {
          const sVal = Number(q.byModel?.[k] || 0);
          const lVal = sameDay ? Number(this.state.quota.byModel?.[k] || 0) : 0;
          mergedByModel[k] = Math.max(sVal, lVal);
        }

        this.state.quota = {
          role,
          limit,
          used: mergedUsed,
          remaining: Math.max(0, limit - mergedUsed),
          dayKey: q.dayKey || pht.dayKey,
          resetAt: q.resetAt || pht.resetAt,
          resetLabel: q.resetLabel || '12:00 AM',
          byModel: mergedByModel,
          lastProviderKey: q.lastProviderKey || this.state.quota.lastProviderKey || 'mistral',
          exhausted: mergedUsed >= limit
        };
        changed = true;
      }

      if (payload.modelHealth && typeof payload.modelHealth === 'object' && Array.isArray(payload.modelHealth.tiers)) {
        this.state.modelHealth = {
          activeTier: payload.modelHealth.activeTier || this.state.modelHealth.activeTier,
          cascadeOrder: Array.isArray(payload.modelHealth.cascadeOrder)
            ? payload.modelHealth.cascadeOrder
            : this.state.modelHealth.cascadeOrder,
          updatedAt: payload.modelHealth.updatedAt || Date.now(),
          tiers: payload.modelHealth.tiers.map(t => ({ ...t }))
        };
        changed = true;
      }

      if (changed) {
        this.persistToLocal();
        this.ensureCooldownTicker();
        this.render();
      }
    },

    /**
     * Fallback local increment if a streaming response completes without full server payload
     */
    recordLocalFallbackUsage(providerKey) {
      const pKey = String(providerKey || 'mistral').toLowerCase();
      const resolvedKey = Object.prototype.hasOwnProperty.call(this.state.quota.byModel, pKey) ? pKey : 'mistral';
      this.state.quota.byModel[resolvedKey] = (this.state.quota.byModel[resolvedKey] || 0) + 1;
      const sumByModel = Object.values(this.state.quota.byModel).reduce((a, b) => a + b, 0);
      this.state.quota.used = Math.min(this.state.quota.limit, Math.max(this.state.quota.used, sumByModel));
      this.state.quota.remaining = Math.max(0, this.state.quota.limit - this.state.quota.used);
      this.state.quota.exhausted = this.state.quota.remaining <= 0;
      this.state.quota.lastProviderKey = resolvedKey;
      this.persistToLocal();
      this.render();
    },

    ensureCooldownTicker() {
      const hasCooldown = this.state.modelHealth.tiers.some(t => t.cooldownSeconds > 0);
      if (hasCooldown && !this.cooldownTimerId) {
        this.cooldownTimerId = setInterval(() => {
          let stillCooling = false;
          let recoveredAny = false;
          this.state.modelHealth.tiers.forEach(tier => {
            if (tier.cooldownSeconds > 0) {
              tier.cooldownSeconds = Math.max(0, tier.cooldownSeconds - 1);
              if (tier.cooldownSeconds > 0) {
                stillCooling = true;
                tier.healthPct = Math.max(10, Math.min(35, Math.round((1 - tier.cooldownSeconds / 35) * 35)));
              } else {
                tier.status = 'standby';
                tier.healthPct = 100;
                tier.lastError = null;
                recoveredAny = true;
              }
            }
          });
          if (recoveredAny) {
            // Promote highest-priority configured ready tier to active
            let promoted = false;
            this.state.modelHealth.tiers.forEach(tier => {
              if (!promoted && tier.configured && tier.cooldownSeconds === 0) {
                tier.status = 'active';
                this.state.modelHealth.activeTier = tier.key;
                promoted = true;
              } else if (tier.status === 'active') {
                tier.status = 'standby';
              }
            });
          }
          this.render();
          if (!stillCooling) {
            clearInterval(this.cooldownTimerId);
            this.cooldownTimerId = null;
          }
        }, 1000);
      } else if (!hasCooldown && this.cooldownTimerId) {
        clearInterval(this.cooldownTimerId);
        this.cooldownTimerId = null;
      }
    },

    isQuotaExhausted() {
      const pht = this.getPhtDayInfo();
      if (this.state.quota.dayKey && this.state.quota.dayKey !== pht.dayKey) {
        this.hydrateFromLocal(this.currentUid, this.state.quota.role);
      }
      return Boolean(this.state.quota.exhausted || this.state.quota.remaining <= 0);
    },

    getQuotaExhaustedMessage() {
      const q = this.state.quota;
      return `Daily research quota reached (${q.used}/${q.limit} queries). Resets at ${q.resetLabel || '12:00 AM'}.`;
    },

    /**
     * Build 10-segment Option 2 horizontal progress bar HTML (brand palette only)
     */
    _buildSegmentedBarHtml(filledSegments, totalSegments, toneClass) {
      const count = Math.max(0, Math.min(totalSegments, filledSegments));
      let html = `<div class="quota-seg-bar" role="progressbar" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${totalSegments}">`;
      for (let i = 0; i < totalSegments; i++) {
        const cls = i < count ? `quota-seg ${toneClass}` : 'quota-seg seg-empty';
        html += `<span class="${cls}"></span>`;
      }
      html += '</div>';
      return html;
    },

    /**
     * Render all UI surfaces: Floating Dock dot, Popover panel, Input Footer pill, and Graceful Lock Banner
     */
    render() {
      const q = this.state.quota;
      const h = this.state.modelHealth;
      const usedRatio = q.limit > 0 ? (q.used / q.limit) : 0;
      const isExhausted = q.remaining <= 0;
      const isWarning = !isExhausted && usedRatio >= 0.8;
      const hasCoolingPrimary = h.tiers[0] && h.tiers[0].status === 'cooldown';

      const overallTone = isExhausted ? 'tone-danger' : (isWarning || hasCoolingPrimary ? 'tone-warning' : 'tone-healthy');
      const activeTierName = PROVIDER_DISPLAY[h.activeTier] || 'Mistral';
      const roleLabel = ROLE_LABELS[q.role] || 'Student';

      // 1. Floating Dock Status Dot
      const dockDot = document.getElementById('model-quota-dock-dot');
      if (dockDot) {
        dockDot.className = `quota-dock-dot ${overallTone}`;
      }
      const dockBtn = document.getElementById('model-quota-dock-btn');
      if (dockBtn) {
        dockBtn.setAttribute('data-tooltip', `AI Quota (${q.used}/${q.limit})`);
      }

      // 2. Compact Input Footer Status Pill
      const pill = document.getElementById('quota-status-pill');
      if (pill) {
        pill.className = `quota-status-pill ${overallTone}`;
        const pillDot = pill.querySelector('.quota-pill-dot');
        const pillText = pill.querySelector('.quota-pill-text');
        const pillMini = pill.querySelector('.quota-pill-mini');
        if (pillDot) pillDot.className = `quota-pill-dot ${overallTone}`;
        if (pillText) {
          pillText.textContent = isExhausted
            ? `Quota ${q.used}/${q.limit}`
            : `${q.used}/${q.limit} · ${activeTierName}`;
        }
        if (pillMini) {
          const filledMini = Math.round(((q.limit - q.used) / Math.max(1, q.limit)) * 5);
          const miniTone = isExhausted ? 'seg-red' : (isWarning ? 'seg-yellow' : 'seg-green');
          let miniHtml = '';
          for (let i = 0; i < 5; i++) {
            miniHtml += `<span class="quota-mini-seg ${i < filledMini ? miniTone : 'seg-empty'}"></span>`;
          }
          pillMini.innerHTML = miniHtml;
        }
      }

      // 3. Popover Panel (Option 2 Segmented Progress Bars — Concept B + Concept A)
      const popoverBody = document.getElementById('model-quota-popover-body');
      const roleBadge = document.getElementById('quota-role-badge');
      if (roleBadge) {
        roleBadge.textContent = roleLabel;
      }

      if (popoverBody) {
        // Concept B: Daily Allocation Bar (remaining capacity or usage filled cleanly)
        const remainingPct = Math.round((q.remaining / Math.max(1, q.limit)) * 100);
        const dailyFilledSegs = isExhausted ? 10 : Math.max(q.used > 0 ? 1 : 0, Math.round((q.used / Math.max(1, q.limit)) * 10));
        const dailyBarTone = isExhausted ? 'seg-red' : (isWarning ? 'seg-yellow' : 'seg-green');

        const tiersHtml = h.tiers.map((tier) => {
          const modelCount = Number(q.byModel?.[tier.key] || 0);
          const segFilled = tier.status === 'unavailable'
            ? 0
            : Math.max(1, Math.round((tier.healthPct / 100) * 10));

          let segTone = 'seg-green';
          let badgeClass = 'status-standby';
          let badgeText = 'Standby';

          if (tier.status === 'active') {
            segTone = tier.healthPct < 45 ? 'seg-yellow' : 'seg-green';
            badgeClass = 'status-active';
            badgeText = 'Active';
          } else if (tier.status === 'cooldown') {
            segTone = 'seg-yellow';
            badgeClass = 'status-cooldown';
            badgeText = `Cooling ${tier.cooldownSeconds}s`;
          } else if (tier.status === 'unavailable') {
            segTone = 'seg-red';
            badgeClass = 'status-offline';
            badgeText = 'Offline';
          } else {
            segTone = tier.healthPct < 50 ? 'seg-yellow' : 'seg-green';
            badgeClass = 'status-standby';
            badgeText = tier.tier === 4 ? 'Failover' : 'Standby';
          }

          const answeredLabel = modelCount === 1 ? '1 answered' : `${modelCount} answered`;

          return `
            <div class="quota-model-row ${tier.status === 'active' ? 'is-active-tier' : ''}">
              <div class="quota-model-top">
                <div class="quota-model-meta">
                  <span class="quota-tier-tag">T${tier.tier}</span>
                  <span class="quota-model-name">${this._escape(tier.name)}</span>
                  <span class="quota-model-id">${this._escape(tier.model)}</span>
                </div>
                <span class="quota-model-badge ${badgeClass}">${this._escape(badgeText)}</span>
              </div>
              <div class="quota-model-bar-row">
                ${this._buildSegmentedBarHtml(segFilled, 10, segTone)}
                <span class="quota-model-stats">${tier.healthPct}% · ${answeredLabel}</span>
              </div>
            </div>
          `;
        }).join('');

        const cascadeNames = (h.cascadeOrder || ['mistral', 'groq', 'gemini', 'openrouter'])
          .map(k => PROVIDER_DISPLAY[k] || k)
          .join(' → ');

        popoverBody.innerHTML = `
          <div class="quota-daily-card ${overallTone}">
            <div class="quota-daily-header">
              <span class="quota-daily-label">Daily Research Quota</span>
              <span class="quota-daily-count"><strong>${q.used}</strong> / ${q.limit} queries</span>
            </div>
            ${this._buildSegmentedBarHtml(dailyFilledSegs, 10, dailyBarTone)}
            <div class="quota-daily-footer">
              <span>${isExhausted ? 'Limit reached' : `${q.remaining} remaining (${remainingPct}%)`}</span>
              <span>Resets at ${this._escape(q.resetLabel || '12:00 AM')} PHT</span>
            </div>
          </div>

          <div class="quota-section-label">
            <span>4-Tier Model Health &amp; Usage Pool</span>
            <span class="quota-section-sub">Live Capacity</span>
          </div>

          <div class="quota-models-list">
            ${tiersHtml}
          </div>

          <div class="quota-cascade-foot">
            <span class="quota-cascade-label">Cascade:</span>
            <span class="quota-cascade-chain">${this._escape(cascadeNames)}</span>
          </div>
        `;
      }

      // 4. Graceful UI Lock Banner & Input Enforcement
      this.applyLockState();
    },

    applyLockState() {
      const banner = document.getElementById('quota-lock-banner');
      const bannerText = document.getElementById('quota-lock-banner-text');
      const userInput = document.getElementById('user-input');
      const inputWrapper = document.querySelector('#chatbot-view .input-wrapper');
      const promptCards = document.querySelectorAll('#chatbot-view .prompt-card');
      const isLoggedIn = Boolean(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
      const exhausted = isLoggedIn && this.isQuotaExhausted();

      if (banner && bannerText) {
        if (exhausted) {
          bannerText.textContent = this.getQuotaExhaustedMessage();
          banner.classList.add('active');
          banner.setAttribute('aria-hidden', 'false');
        } else {
          banner.classList.remove('active');
          banner.setAttribute('aria-hidden', 'true');
        }
      }

      if (inputWrapper) {
        inputWrapper.classList.toggle('quota-locked', exhausted);
      }

      if (userInput && isLoggedIn) {
        if (exhausted) {
          userInput.disabled = true;
          userInput.placeholder = this.getQuotaExhaustedMessage();
        } else if (userInput.disabled && userInput.placeholder.startsWith('Daily research quota reached')) {
          userInput.disabled = false;
          userInput.placeholder = 'Ask anything about capstones, methodologies, authors, or research topics... (Enter to send)';
        }
      }

      promptCards.forEach(card => {
        card.disabled = exhausted;
        card.classList.toggle('quota-disabled', exhausted);
      });

      if (typeof Chatbot !== 'undefined' && typeof Chatbot.updateSendButtonState === 'function') {
        Chatbot.updateSendButtonState();
      }
    },

    _escape(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  };

  global.ModelQuotaManager = ModelQuotaManager;

  document.addEventListener('DOMContentLoaded', () => {
    ModelQuotaManager.init();
  });
})(window);

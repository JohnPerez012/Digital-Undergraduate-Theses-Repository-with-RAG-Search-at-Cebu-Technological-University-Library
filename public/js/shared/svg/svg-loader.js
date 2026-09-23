/**
 * SVG Loader — Core Engine
 * ========================
 * Centralized SVG fetch, cache, and DOM injection utility.
 *
 * Public API (window.SVGLoader):
 *   loadIcon(name, targetId, className?, options?)  → Promise<SVGElement|null>
 *   loadIcons([...configs])                          → Promise<Array>
 *   updateIconColor(targetId, color)                 → void
 *   getString(name)                                  → Promise<string|null>
 *
 * Options object:
 *   { color, width, height, style: {} }
 */

(function (global) {
    'use strict';

    // ─── Internal cache: icon name → raw SVG string ──────────────────────────
    const _cache = {};

    // ─── Resolve the base path to /assets/svgs/ ─────────────────────────────
    // Works whether the page is at root (/) or inside /pages/
    const _BASE = '/assets/svgs/';

    /**
     * Apply color normalization + custom options to an <svg> element.
     * @param {SVGElement} svg
     * @param {Object} options
     */
    function _applyOptions(svg, options = {}) {
        const allEls = svg.querySelectorAll('*');

        // Force currentColor so icons inherit from CSS
        allEls.forEach(el => {
            const stroke = el.getAttribute('stroke');
            if (stroke && stroke !== 'none' && stroke !== 'transparent') {
                el.setAttribute('stroke', 'currentColor');
            }
            const fill = el.getAttribute('fill');
            if (fill && fill !== 'none' && fill !== 'transparent' && !fill.startsWith('url(')) {
                el.setAttribute('fill', 'currentColor');
            }
        });

        // Override with explicit color if provided
        if (options.color) {
            allEls.forEach(el => {
                const stroke = el.getAttribute('stroke');
                if (stroke && stroke !== 'none' && stroke !== 'transparent') {
                    el.setAttribute('stroke', options.color);
                }
                const fill = el.getAttribute('fill');
                if (fill && fill !== 'none' && fill !== 'transparent' && !fill.startsWith('url(')) {
                    el.setAttribute('fill', options.color);
                }
            });
        }

        // Dimensions
        if (options.width)  svg.setAttribute('width',  options.width);
        if (options.height) svg.setAttribute('height', options.height);

        // Inline styles
        if (options.style && typeof options.style === 'object') {
            Object.assign(svg.style, options.style);
        }
    }

    /**
     * Fetch and cache the raw SVG string for a given icon name.
     * @param {string} name
     * @returns {Promise<string>}
     */
    async function _fetchRaw(name) {
        if (_cache[name]) return _cache[name];
        const res = await fetch(`${_BASE}${name}.svg`);
        if (!res.ok) throw new Error(`[SVGLoader] Icon "${name}" not found at ${_BASE}${name}.svg`);
        _cache[name] = await res.text();
        return _cache[name];
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Load an SVG icon into a target DOM element.
     * @param {string} name            Icon filename without .svg
     * @param {string} targetId        ID of the container element
     * @param {string} [className]     Optional CSS class(es) to add to <svg>
     * @param {Object} [options]       { color, width, height, style }
     * @returns {Promise<SVGElement|null>}
     */
    async function loadIcon(name, targetId, className = '', options = {}) {
        const container = document.getElementById(targetId);
        if (!container) {
            console.warn(`[SVGLoader] Target #${targetId} not found`);
            return null;
        }
        try {
            const raw = await _fetchRaw(name);
            container.innerHTML = raw;
            const svg = container.querySelector('svg');
            if (!svg) return null;
            if (className) svg.setAttribute('class', className);
            _applyOptions(svg, options);
            return svg;
        } catch (err) {
            console.error(`[SVGLoader] Failed to load "${name}":`, err);
            return null;
        }
    }

    /**
     * Batch-load multiple icons in parallel.
     * @param {Array<{name, targetId, className?, options?}>} configs
     * @returns {Promise<Array<SVGElement|null>>}
     */
    async function loadIcons(configs) {
        return Promise.all(
            configs.map(c => loadIcon(c.name, c.targetId, c.className || '', c.options || {}))
        );
    }

    /**
     * Update the color of an already-injected SVG icon.
     * @param {string} targetId
     * @param {string} color   CSS color value
     */
    function updateIconColor(targetId, color) {
        const container = document.getElementById(targetId);
        if (!container) return;
        const svg = container.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('*').forEach(el => {
            if (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
                el.setAttribute('stroke', color);
            }
            const fill = el.getAttribute('fill');
            if (fill && fill !== 'none' && fill !== 'transparent' && !fill.startsWith('url(')) {
                el.setAttribute('fill', color);
            }
        });
    }

    /**
     * Get the raw SVG markup string for an icon (useful for template literals).
     * The string is cached after the first fetch.
     * @param {string} name
     * @returns {Promise<string|null>}
     */
    async function getString(name) {
        try {
            return await _fetchRaw(name);
        } catch (err) {
            console.error(`[SVGLoader] getString failed for "${name}":`, err);
            return null;
        }
    }

    // ─── Expose globally ─────────────────────────────────────────────────────
    global.SVGLoader = { loadIcon, loadIcons, updateIconColor, getString };

    // Backwards-compat shim: keep `loadIcon` / `loadIcons` / `updateIconColor`
    // as plain globals so any existing call sites continue to work unchanged.
    global.loadIcon        = loadIcon;
    global.loadIcons       = loadIcons;
    global.updateIconColor = updateIconColor;

})(window);

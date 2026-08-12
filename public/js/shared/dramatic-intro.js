/**
 * RE-CAPS Dramatic Intro Animation
 * Ultra-wide geometric display font with GSAP animations
 * Converts stroke text to solid with dramatic entrance effects
 * 
 * IMPORTANT: The wrapper element is NEVER removed from DOM after animation.
 * It stays permanently but is made completely invisible and non-interactive.
 * Why? Removing ANY element from DOM can cause micro-flickers (even 0.01s)
 * due to layout recalculation. The only way to guarantee ZERO flicker is to
 * keep the element in DOM but make it invisible with display:none + opacity:0.
 * 
 * Memory impact: Negligible (~2KB for hidden DOM node)
 * Performance impact: Zero (display:none = not rendered)
 */

class DramaticIntro {
  constructor(options = {}) {
    // Detect current color theme from data-theme attribute or system preference
    const isLightMode = this._detectLightMode();

    // Light-mode defaults vs dark-mode defaults
    const defaultStrokeColor = isLightMode ? '#6366f1' : '#7d88f1';
    const defaultSolidColor  = isLightMode ? '#4f46e5' : '#ffffff';
    const defaultBgColor     = isLightMode ? '#f8fafc' : '#0a0a0a';

    this.options = {
      text: options.text || 'RECAPS',
      duration: options.duration || 3500, // Total animation duration in ms
      autoStart: options.autoStart !== false,
      onComplete: options.onComplete || null,
      fontFamily: options.fontFamily || 'Unbounded',
      fontSize: options.fontSize || '5.5rem',
      strokeColor: options.strokeColor || defaultStrokeColor,
      solidColor: options.solidColor || defaultSolidColor,
      backgroundColor: options.backgroundColor || defaultBgColor,
      ...options
    };

    this.isLightMode = isLightMode;
    this.isInitialized = false;
    this.isAnimating = false;
    this.elements = {};
    this.scrollPosition = 0;
    this.lastKnownScrollPosition = 0;
    this.scrollTrackingInterval = null;
    this.scrollLocked = false; // tracks whether WE locked the scroll
    
    if (this.options.autoStart) {
      this.init();
    }
  }

  /**
   * Detect whether the user is in light mode.
   * Priority: 1) data-theme attribute  2) prefers-color-scheme media query
   * Returns true for light mode, false for dark mode (default).
   */
  _detectLightMode() {
    // 1. Check the data-theme attribute on <html> (set by theme-toggle.js)
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme === 'light') return true;
    if (dataTheme === 'dark') return false;

    // 2. Fall back to OS / browser preference
    if (window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return true;
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return false;
    }

    // 3. Default to dark mode (matches original behavior)
    return false;
  }

  /**
   * Initialize the intro overlay and inject HTML
   */
  init() {
    if (this.isInitialized) {
      console.warn('DramaticIntro: Already initialized');
      return;
    }

    // Load Google Font if not already loaded
    this.loadFont();

    // Create and inject the intro overlay
    this.createIntroElements();
    
    this.isInitialized = true;

    // Start animation after a brief delay
    setTimeout(() => this.start(), 100);
  }

  /**
   * Load the Unbounded font from Google Fonts
   */
  loadFont() {
    const fontName = this.options.fontFamily;
    
    // Check if font is already loaded
    if (document.querySelector(`link[href*="${fontName}"]`)) {
      return;
    }

    // Create preconnect links
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    
    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';

    // Create font stylesheet link
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@900&display=swap`;

    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(fontLink);
  }

  /**
   * Create and inject intro HTML elements
   */
  createIntroElements() {
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'recaps-intro-wrapper';
    wrapper.id = 'recapsIntroWrapper';
    
    // Create background
    const bg = document.createElement('div');
    bg.className = 'recaps-intro-bg';
    bg.id = 'recapsIntroBg';
    
    // Create title
    const title = document.createElement('h1');
    title.className = 'recaps-intro-title';
    title.id = 'recapsIntroText';
    title.textContent = this.options.text;
    
    wrapper.appendChild(bg);
    wrapper.appendChild(title);
    document.body.appendChild(wrapper);
    
    // Store element references
    this.elements = {
      wrapper,
      bg,
      title
    };

    // Apply inline styles
    this.applyStyles();
  }

  /**
   * Apply CSS styles dynamically
   */
  applyStyles() {
    const { wrapper, bg, title } = this.elements;
    
    // Wrapper styles - positioned outside document flow with CSS containment
    Object.assign(wrapper.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '9999',
      pointerEvents: 'auto',
      // Prevent any layout impact
      overflow: 'hidden',
      isolation: 'isolate',
      // CSS containment - prevents layout recalculation
      contain: 'layout style paint',
      // Use transform for better performance
      willChange: 'opacity, transform',
      // Ensure it's on its own layer
      transform: 'translateZ(0)'
    });

    // Background styles
    Object.assign(bg.style, {
      position: 'absolute',
      inset: '0',
      backgroundColor: this.options.backgroundColor,
      zIndex: '1',
      // Prevent repainting
      willChange: 'opacity'
    });

    // Title styles
    Object.assign(title.style, {
      position: 'relative',
      zIndex: '2',
      fontFamily: `'${this.options.fontFamily}', sans-serif`,
      fontSize: this.options.fontSize,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: 'transparent',
      WebkitTextStroke: `2px ${this.options.strokeColor}`,
      filter: `drop-shadow(0 0 16px ${this.options.strokeColor}66)`,
      margin: '0',
      padding: '0'
    });

    // Responsive font size
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    if (mediaQuery.matches) {
      title.style.fontSize = '3rem';
    }
  }

  /**
   * Wrap each character in a span for individual animation
   */
  wrapCharacters() {
    const textElement = this.elements.title;
    const text = textElement.textContent;
    
    // Replace each non-whitespace character with a span
    textElement.innerHTML = text.replace(/\S/g, "<span class='recaps-char'>$&</span>");
    
    return document.querySelectorAll('.recaps-char');
  }

  /**
   * Start the dramatic intro animation
   */
  async start() {
    if (this.isAnimating) {
      console.warn('DramaticIntro: Animation already in progress');
      return;
    }

    // Check if GSAP is loaded
    if (typeof gsap === 'undefined') {
      console.error('DramaticIntro: GSAP library not found. Please include GSAP before using this module.');
      await this.loadGSAP();
    }

    this.isAnimating = true;

    // Disable scrolling at the start
    this.disableScroll();

    // Wrap characters for animation
    const chars = this.wrapCharacters();

    // Create GSAP timeline
    const tl = gsap.timeline({
      onComplete: () => {
        this.onAnimationComplete();
      }
    });

    // 1. Entry Drop-in Animation
    tl.from(chars, {
      duration: 0.75,
      y: 120,
      opacity: 0,
      rotationX: -90,
      stagger: 0.08,
      ease: "power4.out",
      delay: 0.1
    });

    // 2. Morph: Stroke -> Solid Color
    tl.to(chars, {
      duration: 0.5,
      color: this.options.solidColor,
      webkitTextStroke: "2px transparent",
      scale: 1.05,
      stagger: 0.12,
      ease: "power2.inOut"
    }, "+=0.2");

    // 3. Settle scale back down
    tl.to(chars, {
      duration: 0.4,
      scale: 1,
      stagger: 0.12,
      ease: "power2.out"
    }, "<0.1");

    // 4. Background fade out - RE-ENABLE SCROLLING when background disappears
    tl.to(this.elements.bg, {
      duration: 0.9,
      opacity: 0,
      ease: "power2.inOut",
      onStart: () => {
        // Re-enable scrolling as background starts to fade
        this.enableScroll();
        
        // Start tracking scroll position during fade
        this.startScrollTracking();
      }
    });

    // 5. Fade out entire wrapper - make it completely invisible (but KEEP in DOM)
    tl.to(this.elements.wrapper, {
      duration: 0.5,
      opacity: 0,
      ease: "power2.inOut",
      onComplete: () => {
        // Make completely invisible and non-interactive (but KEEP in DOM forever)
        if (this.elements.wrapper) {
          this.elements.wrapper.style.visibility = 'hidden';
          this.elements.wrapper.style.pointerEvents = 'none';
          this.elements.wrapper.style.display = 'none';
          this.elements.wrapper.style.position = 'absolute';
          this.elements.wrapper.style.zIndex = '-9999';
        }
      }
    }, "+=0.1");

    // 6. Animation complete - wrapper stays in DOM forever (no removal = no flicker!)
    tl.call(() => {
      // Wrapper is permanently invisible but never removed
      // This is the ONLY way to guarantee zero flicker
    });
  }

  /**
   * Load GSAP dynamically if not already loaded
   */
  async loadGSAP() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
      script.onload = () => {
        console.log('DramaticIntro: GSAP loaded successfully');
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load GSAP'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Called when animation completes
   */
  onAnimationComplete() {
    this.isAnimating = false;
    
    // Stop tracking scroll position
    this.stopScrollTracking();
    
    // Ensure scrolling is enabled
    this.enableScroll();
    
    // Call user-provided callback
    if (typeof this.options.onComplete === 'function') {
      this.options.onComplete();
    }

    // CRITICAL: NEVER remove wrapper from DOM - just make it permanently invisible
    // This is the ONLY way to prevent ANY flicker
    if (this.elements.wrapper) {
      // Make completely invisible and non-interactive
      this.elements.wrapper.style.opacity = '0';
      this.elements.wrapper.style.visibility = 'hidden';
      this.elements.wrapper.style.pointerEvents = 'none';
      
      // Move behind everything else (but keep in DOM)
      this.elements.wrapper.style.zIndex = '-9999';
      
      // Remove from layout flow completely
      this.elements.wrapper.style.position = 'absolute';
      this.elements.wrapper.style.display = 'none';
      
      // Mark as completed for potential cleanup later if needed
      this.elements.wrapper.setAttribute('data-intro-complete', 'true');
    }
    
    // DO NOT REMOVE FROM DOM - this causes the flicker
    // Wrapper stays in DOM forever but is completely invisible and non-interactive
  }

  /**
   * Disable page scrolling
   */
  disableScroll() {
    if (this.scrollLocked) return; // already locked
    
    // Store current scroll position
    this.scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    
    // Add class to body to prevent scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.scrollPosition}px`;
    document.body.style.width = '100%';
    
    // Add data attribute for CSS
    document.body.setAttribute('data-intro-active', 'true');
    
    this.scrollLocked = true;
  }

  /**
   * Re-enable page scrolling.
   * IMPORTANT: Only restores scroll position when WE locked it.
   * Calling this when already unlocked is a safe no-op — this
   * prevents the double-call in onAnimationComplete() from
   * snapping the page back to the top after the user has scrolled.
   */
  enableScroll() {
    // Guard: if we didn't lock scroll, don't touch anything
    if (!this.scrollLocked) return;
    
    // Mark as unlocked FIRST so re-entrant calls are no-ops
    this.scrollLocked = false;
    
    // Read the position the user may have scrolled to during the text fade.
    // lastKnownScrollPosition is updated by startScrollTracking() every ~16ms.
    // If tracking was never started (very fast skip), fall back to the original position.
    const scrollY = this.lastKnownScrollPosition || this.scrollPosition || 0;
    
    // Remove scroll prevention styles
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    
    // Remove data attribute
    document.body.removeAttribute('data-intro-active');
    
    // Restore to wherever the user scrolled (or top if they didn't scroll)
    window.scrollTo(0, scrollY);
    
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  }

  /**
   * Start tracking scroll position during animation
   */
  startScrollTracking() {
    // Store interval for cleanup
    this.scrollTrackingInterval = setInterval(() => {
      // Continuously update the scroll position
      this.lastKnownScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    }, 16); // ~60fps
  }

  /**
   * Stop tracking scroll position
   */
  stopScrollTracking() {
    if (this.scrollTrackingInterval) {
      clearInterval(this.scrollTrackingInterval);
      this.scrollTrackingInterval = null;
    }
  }

  /**
   * Manually trigger the animation
   */
  replay() {
    if (this.isAnimating) {
      console.warn('DramaticIntro: Animation already in progress');
      return;
    }

    // Reset and replay
    if (!this.isInitialized) {
      this.init();
    } else {
      this.elements.wrapper.style.display = 'flex';
      this.elements.wrapper.style.opacity = '1';
      this.elements.wrapper.style.pointerEvents = 'auto';
      this.elements.bg.style.opacity = '1';
      this.start();
    }
  }

  /**
   * Skip the animation immediately
   */
  skip() {
    if (!this.isInitialized) return;
    
    // Stop scroll tracking
    this.stopScrollTracking();
    
    // Re-enable scrolling immediately
    this.enableScroll();
    
    // Kill all GSAP animations
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf([this.elements.wrapper, this.elements.bg, '.recaps-char']);
    }
    
    // Hide immediately (but DON'T remove - this prevents flicker)
    if (this.elements.wrapper) {
      this.elements.wrapper.style.display = 'none';
      this.elements.wrapper.style.opacity = '0';
      this.elements.wrapper.style.visibility = 'hidden';
      this.elements.wrapper.style.pointerEvents = 'none';
      this.elements.wrapper.style.zIndex = '-9999';
    }
    
    this.isAnimating = false;
    
    // Call completion callback
    if (typeof this.options.onComplete === 'function') {
      this.options.onComplete();
    }
  }

  /**
   * Destroy the intro and clean up (only call this if you really need to remove it)
   */
  destroy() {
    // Stop scroll tracking
    this.stopScrollTracking();
    
    // Re-enable scrolling if locked
    this.enableScroll();
    
    // NOW we can safely remove wrapper (only when explicitly requested)
    if (this.elements.wrapper && this.elements.wrapper.parentNode) {
      // Make invisible first
      this.elements.wrapper.style.display = 'none';
      
      // Wait for next frame
      requestAnimationFrame(() => {
        // Remove from DOM
        if (this.elements.wrapper && this.elements.wrapper.parentNode) {
          this.elements.wrapper.parentNode.removeChild(this.elements.wrapper);
        }
      });
    }
    
    this.isInitialized = false;
    this.isAnimating = false;
  }
}

// Auto-initialize if data attribute is present
document.addEventListener('DOMContentLoaded', () => {
  const autoInit = document.querySelector('[data-recaps-intro]');
  if (autoInit) {
    const options = {
      text: autoInit.dataset.recapsIntroText || 'RECAPS',
      autoStart: autoInit.dataset.recapsIntroAutostart !== 'false'
    };
    
    window.recapsIntro = new DramaticIntro(options);
  }
});

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DramaticIntro;
}

// Make available globally
window.DramaticIntro = DramaticIntro;

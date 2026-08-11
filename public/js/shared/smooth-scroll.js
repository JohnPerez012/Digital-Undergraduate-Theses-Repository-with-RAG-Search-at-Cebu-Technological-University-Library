/**
 * CTU RECAP - Ultra-smooth Inertial Scrolling
 * Provides natural, eased momentum scrolling for a premium feel.
 * Detects and supports trackpads natively, and hooks into standard page navigation.
 */

class SmoothScroll {
  constructor(options = {}) {
    this.ease = options.ease || 0.085; // Lerp factor for mouse wheel glide (0.05 - 0.15)
    this.keySpeed = options.keySpeed || 120; // Pixels per arrow keypress
    this.wheelMultiplier = options.wheelMultiplier || 1.0;
    
    this.targetY = window.scrollY;
    this.currentY = window.scrollY;
    this.isAnimating = false;
    this.isProgrammaticScroll = false;
    this.isTrackpad = false;
    this.trackpadTimer = null;
    
    // Performance: Add scrolling class to body to optimize painting
    this.scrollClassTimer = null;
    
    this.init();
  }
  
  init() {
    // Respect user's system preference for reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      console.log('SmoothScroll: Reduced motion requested by system. Disabling custom scrolling.');
      return;
    }
    
    // Listen to wheel events
    window.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    
    // Listen to keydown events for keyboard scrolling
    window.addEventListener('keydown', this.onKeyDown.bind(this), { passive: false });
    
    // Listen to native scroll events (for scrollbar clicks/drags, touch swipe, anchor jumps)
    window.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
    
    // Recalculate max scroll on resize
    window.addEventListener('resize', this.onResize.bind(this));
    
    // Initial max scroll calculation
    this.onResize();
  }
  
  onResize() {
    this.maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  }
  
  getMaxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }
  
  onWheel(e) {
    // If another script (like a carousel) has already handled this and prevented default, respect it
    if (e.defaultPrevented) return;
    
    // Zoom shortcut (Ctrl + wheel) should not be hijacked
    if (e.ctrlKey) return;
    
    // Ignore scrolling if inside a scrollable subcontainer (e.g. Chat chatbot messages, dropdown lists)
    if (this.shouldIgnoreScroll(e.target)) {
      return;
    }
    
    // Trackpad detection logic
    this.detectTrackpad(e);
    
    // If it's a trackpad, bypass hijacking and allow native momentum scrolling
    if (this.isTrackpad) {
      // Sync positions so we know where we are if the user switches back to a mouse
      this.targetY = window.scrollY;
      this.currentY = window.scrollY;
      return;
    }
    
    // If we reach here, it's a mouse wheel: hijack and smooth
    e.preventDefault();
    
    const normalized = this.normalizeWheel(e);
    const maxScroll = this.getMaxScroll();
    
    this.targetY += normalized.dy * this.wheelMultiplier;
    this.targetY = Math.max(0, Math.min(this.targetY, maxScroll));
    
    this.startAnimation();
  }
  
  detectTrackpad(e) {
    if (this.trackpadTimer) clearTimeout(this.trackpadTimer);
    
    // Trackpad characteristics:
    // 1. Non-integer deltas (e.g. deltaY is 1.5, 3.25 instead of 100 or 120)
    const hasFractionalDelta = (Math.abs(e.deltaY) % 1 !== 0) || (Math.abs(e.deltaX) % 1 !== 0);
    
    // 2. Very small deltas firing rapidly
    const isSmallDelta = Math.abs(e.deltaY) < 30 && Math.abs(e.deltaX) < 30;
    
    if (hasFractionalDelta || isSmallDelta) {
      this.isTrackpad = true;
    }
    
    // Reset trackpad status after scrolling stops
    this.trackpadTimer = setTimeout(() => {
      this.isTrackpad = false;
    }, 200);
  }
  
  normalizeWheel(e) {
    let dx = e.deltaX;
    let dy = e.deltaY;
    
    // Handle Firefox line-based scrolling
    if (e.deltaMode === 1) { 
      dx *= 40; 
      dy *= 40;
    } else if (e.deltaMode === 2) { // Page mode
      dx *= window.innerWidth;
      dy *= window.innerHeight;
    }
    
    return { dx, dy };
  }
  
  onKeyDown(e) {
    // Ignore keydown if user is typing in a form or chat
    const active = document.activeElement;
    if (active && (
      active.tagName === 'INPUT' || 
      active.tagName === 'TEXTAREA' || 
      active.isContentEditable
    )) {
      return;
    }
    
    // Ignore if key target is inside a scrollable subcontainer
    if (this.shouldIgnoreScroll(e.target)) {
      return;
    }
    
    let scrollAmount = 0;
    const maxScroll = this.getMaxScroll();
    
    switch (e.key) {
      case 'ArrowDown':
        scrollAmount = this.keySpeed;
        break;
      case 'ArrowUp':
        scrollAmount = -this.keySpeed;
        break;
      case 'PageDown':
        scrollAmount = window.innerHeight * 0.8;
        break;
      case 'PageUp':
        scrollAmount = -window.innerHeight * 0.8;
        break;
      case 'Spacebar':
      case ' ':
        scrollAmount = (e.shiftKey ? -1 : 1) * window.innerHeight * 0.8;
        break;
      case 'Home':
        e.preventDefault();
        this.targetY = 0;
        this.startAnimation();
        return;
      case 'End':
        e.preventDefault();
        this.targetY = maxScroll;
        this.startAnimation();
        return;
      default:
        return; // Let other keys process normally
    }
    
    e.preventDefault();
    this.targetY += scrollAmount;
    this.targetY = Math.max(0, Math.min(this.targetY, maxScroll));
    
    this.startAnimation();
  }
  
  onScroll() {
    // If the scroll was triggered by our animate loop, do nothing
    if (this.isProgrammaticScroll) {
      this.isProgrammaticScroll = false;
      return;
    }
    
    // If it's a native scroll (scrollbar drag, touch swipe, browser find-in-page centering),
    // sync our target and current values to avoid jumping.
    this.currentY = window.scrollY;
    this.targetY = window.scrollY;
  }
  
  shouldIgnoreScroll(element) {
    let el = element;
    while (el && el !== document.body && el !== document.documentElement) {
      // Check if container is overflow-scrollable
      const style = window.getComputedStyle(el);
      const isScrollableY = (style.overflowY === 'auto' || style.overflowY === 'scroll');
      if (isScrollableY && el.scrollHeight > el.clientHeight) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }
  
  startAnimation() {
    if (!this.isAnimating) {
      this.isAnimating = true;
      document.body.classList.add('is-scrolling');
      requestAnimationFrame(this.animate.bind(this));
    }
  }
  
  animate() {
    const diff = this.targetY - this.currentY;
    
    // Snap to target if very close
    if (Math.abs(diff) < 0.25) {
      this.currentY = this.targetY;
      this.isProgrammaticScroll = true;
      window.scrollTo(0, this.currentY);
      this.isAnimating = false;
      this.tempEase = null; // reset temp ease
      
      // Clean up body class after scrolling stops
      if (this.scrollClassTimer) clearTimeout(this.scrollClassTimer);
      this.scrollClassTimer = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 100);
      return;
    }
    
    // Linear interpolation
    const currentEase = this.tempEase || this.ease;
    this.currentY += diff * currentEase;
    
    this.isProgrammaticScroll = true;
    window.scrollTo(0, this.currentY);
    
    requestAnimationFrame(this.animate.bind(this));
  }
  
  // Custom programmatic scrollTo method
  scrollTo(target, options = {}) {
    const maxScroll = this.getMaxScroll();
    let targetPosition = 0;
    
    if (typeof target === 'number') {
      targetPosition = target;
    } else if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      targetPosition = window.scrollY + rect.top;
    } else if (typeof target === 'string') {
      const el = document.querySelector(target);
      if (el) {
        const rect = el.getBoundingClientRect();
        targetPosition = window.scrollY + rect.top;
      }
    }
    
    if (options.offset) {
      targetPosition += options.offset;
    }
    
    if (options.ease) {
      this.tempEase = options.ease;
    }
    
    this.targetY = Math.max(0, Math.min(targetPosition, maxScroll));
    this.startAnimation();
  }
}

// Instantiate and wire up custom overrides
window.addEventListener('DOMContentLoaded', () => {
  window.smoothScroller = new SmoothScroll();
  
  // Override window.scrollTo to run smoothly through our scroller when requested
  const originalScrollTo = window.scrollTo;
  window.scrollTo = function() {
    if (arguments.length === 1 && typeof arguments[0] === 'object' && arguments[0] !== null) {
      const options = arguments[0];
      if (options.behavior === 'smooth') {
        if (window.smoothScroller) {
          window.smoothScroller.scrollTo(options.top !== undefined ? options.top : 0);
          return;
        }
      }
    }
    originalScrollTo.apply(window, arguments);
  };
  
  // Override Element.prototype.scrollIntoView to route smooth scrolls through our scroller
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function() {
    const options = arguments[0];
    if (options && typeof options === 'object' && options.behavior === 'smooth') {
      if (window.smoothScroller) {
        const rect = this.getBoundingClientRect();
        let targetY = window.scrollY + rect.top;
        
        // Handle basic alignment block options
        if (options.block === 'center') {
          targetY -= (window.innerHeight - rect.height) / 2;
        } else if (options.block === 'end') {
          targetY -= (window.innerHeight - rect.height);
        } else {
          // 'start' or default - adjust for potential header spacing
          targetY -= 80; // Standard layout offset for header
        }
        
        window.smoothScroller.scrollTo(targetY);
        return;
      }
    }
    originalScrollIntoView.apply(this, arguments);
  };
});

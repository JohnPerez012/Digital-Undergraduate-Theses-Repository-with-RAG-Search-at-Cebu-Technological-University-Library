/**
 * Advanced Slider Captcha with Bot Detection
 * Based on @dreamer/humancheck library implementation
 * Reference: https://jsr.io/@dreamer/humancheck
 * 
 * Features:
 * - Track analysis (detects unnatural movement patterns)
 * - Time verification (detects too-fast or too-constant timing)
 * - Y-axis jitter detection (detects lack of human jitter)
 * - Position tolerance verification
 * - Behavioral analysis
 */

(function() {
    'use strict';

    class AdvancedSliderCaptcha {
        constructor(options) {
            this.container = typeof options.container === 'string' 
                ? document.querySelector(options.container) 
                : options.container;
            
            this.onVerified = options.onVerified || function() {};
            this.onFailed = options.onFailed || function() {};
            
            // Detection thresholds (adjusted for better user experience while detecting bots)
            this.config = {
                tolerance: options.tolerance || 10,          // Position tolerance in pixels (relaxed)
                minDuration: options.minDuration || 50,     // Minimum drag time in ms (very relaxed - essentially disabled)
                maxDuration: options.maxDuration || 10000,   // Maximum drag time in ms (relaxed)
                minTrackPoints: options.minTrackPoints || 5, // Minimum track points required (relaxed)
                maxJitterY: options.maxJitterY || 50,       // Maximum Y-axis jitter in pixels (relaxed)
                minJitterY: options.minJitterY || 0,        // Minimum Y-axis jitter required (disabled)
                trackVarianceThreshold: options.trackVarianceThreshold || 0.3, // Track variance threshold (relaxed)
                velocityChangeThreshold: options.velocityChangeThreshold || 0.1 // Velocity change threshold (relaxed)
            };
            
            this.handle = null;
            this.track = null;
            this.fill = null;
            this.bgText = null;
            
            this.isDragging = false;
            this.verified = false;
            this.trackData = []; // Array of {x, y, timestamp}
            this.startTime = null;
            this.endTime = null;
            this.startX = 0;
            this.startY = 0;
            
            this.init();
        }
        
        init() {
            if (!this.container) {
                console.error('Slider captcha container not found');
                return;
            }
            
            this.handle = this.container.querySelector('#slider-verify-handle');
            this.track = this.container.querySelector('#slider-verify-track');
            this.fill = this.container.querySelector('#slider-verify-fill');
            this.bgText = this.container.querySelector('.slider-verify-bg-text');
            
            if (!this.handle || !this.track || !this.fill) {
                console.error('Slider captcha elements not found');
                return;
            }
            
            this.setupEventListeners();
        }
        
        setupEventListeners() {
            // Mouse events
            this.handle.addEventListener('mousedown', this.onStart.bind(this));
            window.addEventListener('mousemove', this.onMove.bind(this));
            window.addEventListener('mouseup', this.onEnd.bind(this));
            
            // Touch events
            this.handle.addEventListener('touchstart', this.onStart.bind(this), { passive: false });
            window.addEventListener('touchmove', this.onMove.bind(this), { passive: false });
            window.addEventListener('touchend', this.onEnd.bind(this));
        }
        
        onStart(e) {
            if (this.verified) return;
            
            e.preventDefault();
            this.isDragging = true;
            
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
            
            this.startX = clientX;
            this.startY = clientY;
            this.startTime = performance.now();
            this.trackData = [];
            
            // Record initial position
            this.recordTrackPoint(clientX, clientY);
            
            // Remove transitions for smooth dragging
            this.handle.style.transition = 'none';
            this.fill.style.transition = 'none';
        }
        
        onMove(e) {
            if (!this.isDragging || this.verified) return;
            
            e.preventDefault();
            
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
            
            // Record track point
            this.recordTrackPoint(clientX, clientY);
            
            // Calculate movement
            const deltaX = clientX - this.startX;
            const maxSlideWidth = this.track.clientWidth - this.handle.clientWidth - 8;
            
            // Clamp values
            let x = Math.max(0, Math.min(deltaX, maxSlideWidth));
            
            // Update UI
            this.handle.style.left = (x + 4) + 'px';
            this.fill.style.width = (x + this.handle.clientWidth / 2) + 'px';
            
            // Check if reached end
            if (x >= maxSlideWidth) {
                this.onComplete();
            }
        }
        
        onEnd(e) {
            if (!this.isDragging || this.verified) return;
            
            this.isDragging = false;
            this.endTime = performance.now();
            
            // Reset if not completed
            if (!this.verified) {
                this.reset();
            }
        }
        
        recordTrackPoint(x, y) {
            this.trackData.push({
                x: x,
                y: y,
                timestamp: performance.now()
            });
        }
        
        onComplete() {
            this.isDragging = false;
            this.endTime = performance.now();
            
            console.log('Slider drag completed. Starting validation...');
            console.log('Track data points:', this.trackData.length);
            console.log('Duration:', this.endTime - this.startTime);
            
            // Perform bot detection
            const validationResult = this.validate();
            
            console.log('Slider Captcha Validation Result:', validationResult);
            console.log('Success:', validationResult.success);
            console.log('Errors:', validationResult.errors);
            console.log('Metrics:', validationResult.metrics);
            
            if (validationResult.success) {
                this.verified = true;
                this.onVerified(validationResult);
            } else {
                this.onFailed(validationResult);
                this.reset();
            }
        }
        
        validate() {
            const result = {
                success: false,
                errors: [],
                metrics: {}
            };
            
            // 1. Time verification
            const duration = this.endTime - this.startTime;
            result.metrics.duration = duration;
            
            if (duration < this.config.minDuration) {
                result.errors.push(`Too fast: ${duration}ms < ${this.config.minDuration}ms`);
            }
            
            if (duration > this.config.maxDuration) {
                result.errors.push(`Too slow: ${duration}ms > ${this.config.maxDuration}ms`);
            }
            
            // 2. Track data validation
            if (this.trackData.length < this.config.minTrackPoints) {
                result.errors.push(`Insufficient track points: ${this.trackData.length} < ${this.config.minTrackPoints}`);
            }
            
            result.metrics.trackPoints = this.trackData.length;
            
            // 3. Y-axis jitter detection (only check maximum, not minimum)
            const yJitter = this.calculateYJitter();
            result.metrics.yJitter = yJitter;
            
            if (yJitter > this.config.maxJitterY) {
                result.errors.push(`Excessive Y jitter: ${yJitter.toFixed(2)}px > ${this.config.maxJitterY}px`);
            }
            
            // Special case: zero Y-jitter with high track points indicates bot-like linear movement
            if (yJitter === 0 && this.trackData.length > 20) {
                result.errors.push(`Zero Y-jitter with many track points (possible bot)`);
            }
            
            // 4. Track variance analysis (only for very obvious linear movement)
            const trackVariance = this.calculateTrackVariance();
            result.metrics.trackVariance = trackVariance;
            
            if (trackVariance < 0.1 && this.trackData.length > 15) {
                result.errors.push(`Track too uniform (possible bot): ${trackVariance.toFixed(3)} < 0.1`);
            }
            
            // 5. Velocity change analysis (only for very constant movement)
            const velocityChanges = this.calculateVelocityChanges();
            result.metrics.velocityChanges = velocityChanges;
            
            if (velocityChanges < 0.05 && this.trackData.length > 12) {
                result.errors.push(`Velocity too constant (possible bot): ${velocityChanges.toFixed(3)} < 0.05`);
            }
            
            // 6. Position verification
            const finalX = parseFloat(this.handle.style.left) || 0;
            const maxSlideWidth = this.track.clientWidth - this.handle.clientWidth - 8;
            const positionError = Math.abs(maxSlideWidth - finalX);
            result.metrics.positionError = positionError;
            
            if (positionError > this.config.tolerance) {
                result.errors.push(`Position error: ${positionError.toFixed(2)}px > ${this.config.tolerance}px`);
            }
            
            // Final decision
            result.success = result.errors.length === 0;
            
            return result;
        }
        
        calculateYJitter() {
            if (this.trackData.length < 2) return 0;
            
            const yValues = this.trackData.map(point => point.y);
            const minY = Math.min(...yValues);
            const maxY = Math.max(...yValues);
            
            return maxY - minY;
        }
        
        calculateTrackVariance() {
            if (this.trackData.length < 3) return 1;
            
            // Calculate variance in X direction (should have some irregularity)
            const xValues = this.trackData.map(point => point.x);
            const meanX = xValues.reduce((a, b) => a + b, 0) / xValues.length;
            const variance = xValues.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0) / xValues.length;
            const stdDev = Math.sqrt(variance);
            
            // Normalize by range
            const range = Math.max(...xValues) - Math.min(...xValues);
            if (range === 0) return 0;
            
            return stdDev / range;
        }
        
        calculateVelocityChanges() {
            if (this.trackData.length < 4) return 1;
            
            const velocities = [];
            
            for (let i = 1; i < this.trackData.length; i++) {
                const prev = this.trackData[i - 1];
                const curr = this.trackData[i];
                
                const dt = curr.timestamp - prev.timestamp;
                if (dt > 0) {
                    const dx = curr.x - prev.x;
                    const velocity = dx / dt;
                    velocities.push(velocity);
                }
            }
            
            if (velocities.length < 2) return 1;
            
            // Calculate variance in velocities
            const meanV = velocities.reduce((a, b) => a + b, 0) / velocities.length;
            const variance = velocities.reduce((sum, v) => sum + Math.pow(v - meanV, 2), 0) / velocities.length;
            const stdDev = Math.sqrt(variance);
            
            // Normalize by mean velocity
            if (meanV === 0) return 0;
            
            return stdDev / Math.abs(meanV);
        }
        
        reset() {
            this.isDragging = false;
            this.trackData = [];
            this.startTime = null;
            this.endTime = null;
            
            // Animate back to start
            this.handle.style.transition = 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            this.fill.style.transition = 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            this.handle.style.left = '4px';
            this.fill.style.width = '0px';
        }
        
        destroy() {
            // Remove event listeners
            this.handle.removeEventListener('mousedown', this.onStart.bind(this));
            window.removeEventListener('mousemove', this.onMove.bind(this));
            window.removeEventListener('mouseup', this.onEnd.bind(this));
            this.handle.removeEventListener('touchstart', this.onStart.bind(this));
            window.removeEventListener('touchmove', this.onMove.bind(this));
            window.removeEventListener('touchend', this.onEnd.bind(this));
        }
    }

    // Export for use in other files
    window.AdvancedSliderCaptcha = AdvancedSliderCaptcha;

})();

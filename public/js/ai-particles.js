/**
 * AI Semantic Search Particle Effect
 * Creates floating particles that rise upward when AI search is enabled
 * Symbolizes speed and enhanced performance
 */

(function() {
    let canvas, ctx;
    let particles = [];
    let animationId = null;
    let isActive = false;
    
    class Particle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.size = Math.random() * 4 + 2; // 2-6px
            this.speedY = Math.random() * 2 + 1.5; // Faster upward speed (1.5-3.5)
            this.speedX = (Math.random() - 0.5) * 1; // Slight horizontal drift
            this.opacity = Math.random() * 0.5 + 0.5; // 0.5-1
            this.color = this.getRandomColor();
            this.life = 1; // Lifespan from 1 to 0
            this.decay = Math.random() * 0.005 + 0.003; // 0.003-0.008 decay rate
            this.glowPhase = Math.random() * Math.PI * 2; // For glow effect
        }
        
        getRandomColor() {
            const colors = [
                { r: 102, g: 126, b: 234 }, // #667eea
                { r: 118, g: 75, b: 162 },  // #764ba2
                { r: 139, g: 92, b: 246 },  // Purple
                { r: 59, g: 130, b: 246 },  // Blue
                { r: 168, g: 85, b: 247 }   // Violet
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        }
        
        update() {
            // Move upward (faster)
            this.y -= this.speedY;
            this.x += this.speedX;
            
            // Decay over time
            this.life -= this.decay;
            this.opacity = this.life;
            
            // Add slight pulsing/glow effect
            this.glowPhase += 0.05;
            const glowIntensity = Math.sin(this.glowPhase) * 0.3 + 0.7;
            this.currentOpacity = this.opacity * glowIntensity;
            
            // Check if particle is dead
            return this.life > 0 && this.y > -10;
        }
        
        draw(ctx) {
            ctx.save();
            
            // Outer glow
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.size * 2
            );
            gradient.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.currentOpacity})`);
            gradient.addColorStop(0.5, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.currentOpacity * 0.5})`);
            gradient.addColorStop(1, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Core particle
            ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.currentOpacity})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
    }
    
    function initCanvas() {
        canvas = document.getElementById('ai-particles-canvas');
        if (!canvas) return;
        
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    function resizeCanvas() {
        if (!canvas) return;
        const section = canvas.parentElement;
        canvas.width = section.offsetWidth;
        canvas.height = section.offsetHeight;
    }
    
    function createParticles() {
        // Create particles from bottom of canvas
        const particlesPerFrame = isActive ? 3 : 0; // Generate 3 particles per frame when active
        
        for (let i = 0; i < particlesPerFrame; i++) {
            const x = Math.random() * canvas.width;
            const y = canvas.height + Math.random() * 20; // Start slightly below canvas
            particles.push(new Particle(x, y));
        }
        
        // Limit total particles
        if (particles.length > 200) {
            particles = particles.slice(-200);
        }
    }
    
    function animate() {
        if (!ctx || !canvas) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Create new particles
        if (isActive) {
            createParticles();
        }
        
        // Update and draw particles
        particles = particles.filter(particle => {
            const alive = particle.update();
            if (alive) {
                particle.draw(ctx);
            }
            return alive;
        });
        
        // Continue animation
        if (isActive || particles.length > 0) {
            animationId = requestAnimationFrame(animate);
        } else {
            animationId = null;
        }
    }
    
    function startParticles() {
        if (isActive) return;
        
        isActive = true;
        canvas.classList.add('active');
        
        if (!animationId) {
            animate();
        }
        
        console.log('[AI Particles] Started');
    }
    
    function stopParticles() {
        isActive = false;
        canvas.classList.remove('active');
        console.log('[AI Particles] Stopped');
        
        // Let existing particles fade out naturally
        // Animation will stop automatically when all particles are gone
    }
    
    function setupToggleListener() {
        const toggle = document.querySelector('.ai-toggle-input');
        if (!toggle) {
            console.warn('[AI Particles] Toggle not found, retrying...');
            setTimeout(setupToggleListener, 100);
            return;
        }
        
        toggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                startParticles();
            } else {
                stopParticles();
            }
        });
        
        // Check initial state
        if (toggle.checked) {
            startParticles();
        }
        
        console.log('[AI Particles] Toggle listener attached');
    }
    
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initCanvas();
                setupToggleListener();
            });
        } else {
            initCanvas();
            setupToggleListener();
        }
    }
    
    // Auto-initialize
    init();
    
    // Export for manual control if needed
    window.AIParticles = {
        start: startParticles,
        stop: stopParticles,
        isActive: () => isActive
    };
})();

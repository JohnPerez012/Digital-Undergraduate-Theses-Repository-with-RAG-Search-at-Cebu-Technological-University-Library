/**
 * Cinematic Elastic Slider for Search Section Background
 * Fully randomized start with elastic motion and blur effects
 */

(function() {
    let slideInterval = null;
    let resizeTimer = null;
    let lastWasMobile = null;

    // Helper: Determine if user is viewing from a phone/mobile device
    function isMobileDevice() {
        const isNarrow = window.innerWidth <= 768;
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return isNarrow || (hasTouch && isMobileUA);
    }

    // Wait for dramatic intro to complete before initializing
    function waitForElement(callback) {
        const slideTrack = document.getElementById('slideTrack');
        if (slideTrack) {
            callback();
        } else {
            setTimeout(() => waitForElement(callback), 100);
        }
    }
    
    function initCinematicSlider() {
        console.log('🎬 Initializing cinematic slider...');
        
        // Clear any previously running interval
        if (slideInterval) {
            clearInterval(slideInterval);
            slideInterval = null;
        }

        // Check user preference for background images
        const bgMode = localStorage.getItem('bgImageMode') || 'random';
        const staticImage = localStorage.getItem('bgStaticImage');
        
        console.log('[Cinematic Slider] Mode:', bgMode);
        console.log('[Cinematic Slider] Static image:', staticImage);
        
        // Check if we have the correct number of images (use actual filenames with spaces)
        const baseImages = [
            '/assets/library_images/img (1).jpg',
            '/assets/library_images/img (2).jpg',
            '/assets/library_images/img (3).jpg',
            '/assets/library_images/img (4).jpg',
            '/assets/library_images/img (5).jpg',
            '/assets/library_images/img (6).jpg',
            '/assets/library_images/img (7).jpg',
            '/assets/library_images/img (8).jpg',
            '/assets/library_images/img (9).jpg',
            '/assets/library_images/img (10).jpg',
            '/assets/library_images/img (11).jpg'
        ];

        const slideTrack = document.getElementById('slideTrack');
        
        // Don't initialize if element doesn't exist
        if (!slideTrack) {
            console.warn('Cinematic slider: slideTrack element not found');
            return;
        }
        
        // 1. If explicit static mode selected by user in Settings, show only that image
        if (bgMode === 'static' && staticImage) {
            console.log('[Cinematic Slider] Using user-defined STATIC mode with:', staticImage);
            
            const img = document.createElement('img');
            img.src = staticImage;
            img.className = 'slide active-focus static-mode';
            img.alt = 'Selected Background';
            img.loading = 'eager';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';
            
            slideTrack.innerHTML = '';
            slideTrack.appendChild(img);
            slideTrack.style.transform = 'translateX(0)';
            slideTrack.style.transition = 'none';
            return;
        }
        
        // 2. MOBILE OPTIMIZATION: Pick a random image ONCE per entrance/visit, but keep it completely STATIC.
        // Avoids multiple image loads, continuous GPU compositing, motion blur filters, and device lag.
        const onMobile = isMobileDevice();
        lastWasMobile = onMobile;

        if (onMobile) {
            const randomBaseIndex = Math.floor(Math.random() * baseImages.length);
            const chosenImage = baseImages[randomBaseIndex];
            console.log(`📱 [Cinematic Slider] Mobile device detected (width: ${window.innerWidth}px). Applying STATIC RANDOM background:`, chosenImage);

            const img = document.createElement('img');
            img.src = chosenImage;
            img.className = 'slide active-focus static-mobile-mode';
            img.alt = `Background ${randomBaseIndex + 1}`;
            img.loading = 'eager';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';

            slideTrack.innerHTML = '';
            slideTrack.appendChild(img);
            slideTrack.style.transform = 'translateX(0)';
            slideTrack.style.transition = 'none';

            console.log('✅ [Cinematic Slider] Static random mobile background loaded with 0 recurring animation overhead.');
            return; // Exit here - zero setInterval, zero sliding animation
        }

        // 3. DESKTOP / WIDE SCREEN: Proceed with full dynamic animated elastic slider
        console.log('[Cinematic Slider] Desktop/Wide screen detected. Using DYNAMIC animated slider mode');
        console.log('🎯 slideTrack found:', slideTrack);
        
        // Infinite loop setup: [Last, 1, 2, 3, 4, First]
        const images = [baseImages[baseImages.length - 1], ...baseImages, baseImages[0]];
        
        let currentIndex = 1;
        let slideElements = [];
        let isAnimating = false;

        function initSlider() {
            console.log('🎨 Building slider with images:', baseImages);
            slideTrack.innerHTML = '';
            slideElements = [];
            
            // Randomize the initial starting slide index between 1 and baseImages.length
            const randomBaseIndex = Math.floor(Math.random() * baseImages.length);
            currentIndex = randomBaseIndex + 1;

            images.forEach((src, index) => {
                const img = document.createElement('img');
                img.src = src;
                img.className = `slide ${index === currentIndex ? 'active-focus' : ''}`;
                img.alt = `Background ${index}`;
                img.loading = 'eager';
                
                slideTrack.appendChild(img);
                slideElements.push(img);
            });

            // Position track instantly to the random start index without animation
            slideTrack.style.transition = 'none';
            slideTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
            
            console.log('Cinematic slider initialized at index:', currentIndex);
        }

        function getNextRandomIndex() {
            let nextIndex;
            const realCurrentIndex = currentIndex;
            
            do {
                nextIndex = Math.floor(Math.random() * baseImages.length) + 1;
            } while (nextIndex === realCurrentIndex && baseImages.length > 1);
            
            return nextIndex;
        }

        function updateView(targetIndex) {
            if (isAnimating) return;
            isAnimating = true;

            // Add motion blur to all slides
            slideElements.forEach(slide => slide.classList.add('motion-blur'));

            // Enable transition
            slideTrack.style.transition = 'transform 1.4s cubic-bezier(0.25, 1, 0.35, 1.25)';

            // Calculate elastic over-travel
            const direction = targetIndex > currentIndex ? 1 : -1;
            const overTravelOffset = (targetIndex * 100) + (direction * 30);

            // First move with elastic over-travel
            slideTrack.style.transform = `translateX(-${overTravelOffset}%)`;

            setTimeout(() => {
                // Snap back to exact position
                slideTrack.style.transform = `translateX(-${targetIndex * 100}%)`;
                currentIndex = targetIndex;

                // Update active focus
                slideElements.forEach((slide, idx) => {
                    slide.classList.toggle('active-focus', idx === currentIndex);
                    slide.classList.remove('motion-blur');
                });

                setTimeout(() => {
                    // Handle infinite loop wrap-around
                    if (currentIndex === 0) {
                        slideTrack.style.transition = 'none';
                        currentIndex = baseImages.length;
                        slideTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
                    } else if (currentIndex === images.length - 1) {
                        slideTrack.style.transition = 'none';
                        currentIndex = 1;
                        slideTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
                    }

                    isAnimating = false;
                }, 900);

            }, 1000);
        }

        function moveSlide() {
            const nextRandom = getNextRandomIndex();
            updateView(nextRandom);
        }

        // Initialize slider
        initSlider();

        // Auto-play interval for desktop (6 seconds between transitions)
        slideInterval = setInterval(() => {
            if (!isAnimating) {
                moveSlide();
            }
        }, 6000);
    }

    // Responsive listener for viewport switches (e.g. device rotation or browser resizing)
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const currentIsMobile = isMobileDevice();
            if (lastWasMobile !== null && currentIsMobile !== lastWasMobile) {
                console.log('🔄 [Cinematic Slider] Viewport category changed, adjusting slider mode...');
                initCinematicSlider();
            }
        }, 300);
    });

    // Wait for both DOM and dramatic intro
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            waitForElement(initCinematicSlider);
        });
    } else {
        waitForElement(initCinematicSlider);
    }

})();

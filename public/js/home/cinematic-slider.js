/**
 * Cinematic Elastic Slider for Search Section Background
 * Fully randomized start with elastic motion and blur effects
 */

(function() {
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
        
        // If static mode and user has selected an image, show only that image
        if (bgMode === 'static' && staticImage) {
            console.log('[Cinematic Slider] Using STATIC mode with:', staticImage);
            
            const img = document.createElement('img');
            img.src = staticImage;
            img.className = 'slide active-focus static-mode';
            img.alt = 'Selected Background';
            img.loading = 'eager';
            img.style.width = '100%';
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';
            
            slideTrack.innerHTML = ''; // Clear any existing slides
            slideTrack.appendChild(img);
            slideTrack.style.transform = 'translateX(0)'; // No animation needed
            
            console.log('✓ Static background loaded');
            return; // Exit - no animation needed
        }
        
        // Otherwise, proceed with RANDOM animated slider
        console.log('[Cinematic Slider] Using RANDOM animated mode');
        console.log('🎯 slideTrack found:', slideTrack);
        console.log('🎯 slideTrack parent:', slideTrack.parentElement);
        console.log('🎯 Parent computed style:', window.getComputedStyle(slideTrack.parentElement));
        
        // Infinite loop setup: [Last, 1, 2, 3, 4, First]
        const images = [baseImages[baseImages.length - 1], ...baseImages, baseImages[0]];
        
        let currentIndex = 1;
        let slideElements = [];
        let isAnimating = false;

        function initSlider() {
            console.log('🎨 Building slider with images:', baseImages);
            
            // Randomize the initial starting slide index between 1 and baseImages.length
            const randomBaseIndex = Math.floor(Math.random() * baseImages.length);
            currentIndex = randomBaseIndex + 1;

            images.forEach((src, index) => {
                const img = document.createElement('img');
                img.src = src;
                img.className = `slide ${index === currentIndex ? 'active-focus' : ''}`;
                img.alt = `Background ${index}`;
                img.loading = 'eager'; // Load immediately for background
                
                // Add load event listener for debugging
                img.addEventListener('load', () => {
                    console.log('✅ Image loaded:', src);
                });
                img.addEventListener('error', () => {
                    console.error('❌ Image failed to load:', src);
                });
                
                slideTrack.appendChild(img);
                slideElements.push(img);
            });

            // Position track instantly to the random start index without animation
            slideTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
            
            console.log('✓ Cinematic slider initialized at index:', currentIndex);
            console.log('📊 SlideTrack element:', slideTrack);
            console.log('📊 Total slides created:', slideElements.length);
        }

        function getNextRandomIndex() {
            let nextIndex;
            const realCurrentIndex = currentIndex;
            
            // Get a random index that's different from current (if we have more than 1 image)
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

        // Auto-play interval (6 seconds between transitions)
        setInterval(() => {
            if (!isAnimating) {
                moveSlide();
            }
        }, 6000);
    }

    // Wait for both DOM and dramatic intro
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            waitForElement(initCinematicSlider);
        });
    } else {
        waitForElement(initCinematicSlider);
    }

})();

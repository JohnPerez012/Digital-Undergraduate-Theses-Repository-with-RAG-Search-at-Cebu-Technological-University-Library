document.addEventListener('DOMContentLoaded', function() {
    const header = document.querySelector('.header');
    
    function updateHeaderScroll() {
        if (window.scrollY > 20) {
            header.classList.add('header--scrolled');
        } else {
            header.classList.remove('header--scrolled');
        }
    }
    
    window.addEventListener('scroll', updateHeaderScroll);
    updateHeaderScroll();
    
    // AI Toggle - Only slider is clickable
    const aiToggleLabel = document.querySelector('.ai-search-toggle');
    const aiToggleSlider = document.querySelector('.ai-toggle-slider');
    const aiToggleInput = document.querySelector('.ai-toggle-input');
    
    if (aiToggleLabel && aiToggleSlider && aiToggleInput) {
        // Prevent label from toggling the checkbox
        aiToggleLabel.addEventListener('click', function(e) {
            e.preventDefault();
        });
        
        // Only slider can toggle the checkbox
        aiToggleSlider.addEventListener('click', function(e) {
            e.stopPropagation();
            aiToggleInput.checked = !aiToggleInput.checked;
            
            // Trigger change event for any listeners
            const event = new Event('change', { bubbles: true });
            aiToggleInput.dispatchEvent(event);
        });
    }

    // Detect if this is a page refresh/reload
    const isReload = (window.performance && window.performance.navigation && window.performance.navigation.type === 1) || 
                     (window.performance && window.performance.getEntriesByType('navigation').length > 0 && window.performance.getEntriesByType('navigation')[0].type === 'reload');
                     
    if (isReload) {
        sessionStorage.removeItem('selectedProjectForViewDetails');
    }
    
    // Global active link setter for all navigation links
    const currentPath = window.location.pathname;
    const allNavLinks = document.querySelectorAll('.nav-link');
    
    const getBaseName = (path) => {
        let name = path.split('/').pop() || '';
        return name.split('?')[0].split('#')[0].replace('.html', '');
    };
    
    const currentBaseName = getBaseName(currentPath) || 'index';
    
    allNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        
        const linkBaseName = getBaseName(href);
        
        if (currentBaseName === linkBaseName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
});







const terms = ["capstone", "research", "thesis"];
let termIndex = 0;
const termElement = document.getElementById("dynamic-term");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function scrambleWithBlur(targetWord, callback) {
    // Step 1: Add the blur/glitch effect class
    termElement.classList.add("glitching");

    let iteration = 0;
    const maxIterations = targetWord.length * 3; // Controls how long it scrambles

    // Step 2: Run the letter shuffle while blurred
    const interval = setInterval(() => {
        termElement.textContent = targetWord
            .split("")
            .map((letter, index) => {
                if (index < iteration / 3) {
                    return targetWord[index];
                }
                return alphabet[Math.floor(Math.random() * alphabet.length)];
            })
            .join("");

        if (iteration >= maxIterations) {
            clearInterval(interval);
            
            // Step 3: Ensure the exact word is set, then remove blur to snap into focus
            termElement.textContent = targetWord;
            termElement.classList.remove("glitching");

            if (callback) callback();
        }

        iteration++;
    }, 35); // Speed of the scramble ticks
}

function startRotation() {
    termIndex = (termIndex + 1) % terms.length;
    scrambleWithBlur(terms[termIndex], () => {
        // Wait 3 seconds before triggering the next scramble/blur cycle
        setTimeout(startRotation, 3000);
    });
}

// Start the loop after an initial 3-second delay
setTimeout(startRotation, 3000);
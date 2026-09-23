document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Greeting
    const hour = new Date().getHours();
    let greetingText = 'Good evening';
    if (hour < 12) greetingText = 'Good morning';
    else if (hour < 18) greetingText = 'Good afternoon';
    
    const userName = sessionStorage.getItem('userName') || 'Student';
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) {
        greetingEl.textContent = `${greetingText}, ${userName.split(' ')[0]}.`;
    }

    // Cool Interaction 1: Focus Mode
    const focusBtn = document.getElementById('focus-toggle');
    if (focusBtn) {
        focusBtn.addEventListener('click', () => {
            document.body.classList.toggle('focus-mode');
            if (document.body.classList.contains('focus-mode')) {
                focusBtn.innerHTML = `${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('focus-exit') : ''} Exit Focus`;
            } else {
                focusBtn.innerHTML = `${(typeof SVGRegistry !== 'undefined') ? SVGRegistry.get('focus-enter') : ''} Focus Mode`;
            }
        });
    }

    // Cool Interaction 2: Smooth mouse follow effect for cards (parallax)
    const cards = document.querySelectorAll('.action-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -5;
            const rotateY = ((x - centerX) / centerX) * 5;
            
            // Only apply if not in focus mode, or if it's the target
            if(!document.body.classList.contains('focus-mode') || card.classList.contains('focus-target')) {
                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-10px) scale(1.02)`;
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if(!document.body.classList.contains('focus-mode') || card.classList.contains('focus-target')) {
                card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) translateY(0) scale(1)`;
            }
        });
    });

    // Cool Interaction 3: Custom cursor dot that expands on hoverable elements
    const cursorDot = document.getElementById('cursor-dot');
    if (cursorDot) {
        document.addEventListener('mousemove', (e) => {
            cursorDot.style.left = e.clientX + 'px';
            cursorDot.style.top = e.clientY + 'px';
        });
        
        const hoverables = document.querySelectorAll('a, button, .action-card');
        hoverables.forEach(el => {
            el.addEventListener('mouseenter', () => cursorDot.classList.add('active'));
            el.addEventListener('mouseleave', () => cursorDot.classList.remove('active'));
        });
    }

    // Citation Generator Implementation
    const genCitationBtn = document.getElementById('generate-citation-btn');
    if (genCitationBtn) {
        genCitationBtn.addEventListener('click', () => {
            const format = (document.getElementById('citation-format')?.value || 'apa').toLowerCase();
            const title = document.getElementById('citation-title')?.value.trim() || 'Untitled Research Project';
            const authors = document.getElementById('citation-authors')?.value.trim() || 'Author Unknown';
            const year = document.getElementById('citation-year')?.value.trim() || new Date().getFullYear().toString();
            const outputBox = document.getElementById('citation-output');

            let result = '';
            if (format === 'apa') {
                result = `${authors} (${year}). ${title}. Cebu Technological University Library Repository.`;
            } else if (format === 'mla') {
                result = `${authors}. "${title}." Cebu Technological University, ${year}.`;
            } else if (format === 'chicago') {
                result = `${authors}. "${title}." Undergraduate thesis, Cebu Technological University, ${year}.`;
            } else if (format === 'ieee') {
                result = `${authors}, "${title}," CTU Undergraduate Thesis, Cebu, Philippines, ${year}.`;
            }

            if (outputBox) {
                outputBox.style.display = 'block';
                outputBox.textContent = result;
            }

            // Log activity
            if (window.ActivityService && typeof window.ActivityService.logCitation === 'function') {
                window.ActivityService.logCitation(format.toUpperCase(), title);
            }

            if (typeof showToast === 'function') {
                showToast(`Generated ${format.toUpperCase()} citation!`, 'success');
            }
        });
    }
});

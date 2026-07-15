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
                focusBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg> Exit Focus`;
            } else {
                focusBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg> Focus Mode`;
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
});

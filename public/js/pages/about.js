/**
 * RE-CAPS About Page Interactive Controller
 * Handles scroll progress, metric counter animations, interactive RAG simulator,
 * interactive role matrix, citation playground switcher, and scroll reveal effects.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initScrollProgress();
    initScrollReveal();
    initCounters();
    initRagSimulator();
    initRoleMatrix();
    initCitationPlayground();
  });

  /* ============================================================
     1. Scroll Progress Bar
     ============================================================ */
  function initScrollProgress() {
    const progressBar = document.getElementById('scroll-progress');
    if (!progressBar) return;

    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }, { passive: true });
  }

  /* ============================================================
     2. Scroll-Reveal Animations (IntersectionObserver)
     ============================================================ */
  function initScrollReveal() {
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if (!revealElements.length) return;

    if (!('IntersectionObserver' in window)) {
      revealElements.forEach(el => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
  }

  /* ============================================================
     3. Animated Metric Counters
     ============================================================ */
  function initCounters() {
    const counterElements = document.querySelectorAll('[data-counter-target]');
    if (!counterElements.length) return;

    const animateCounter = (el) => {
      const target = parseFloat(el.getAttribute('data-counter-target'));
      const suffix = el.getAttribute('data-counter-suffix') || '';
      const prefix = el.getAttribute('data-counter-prefix') || '';
      const isInteger = Number.isInteger(target);
      const duration = 1400; // ms
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out quad
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = target * easeOut;

        el.textContent = `${prefix}${isInteger ? Math.round(currentVal) : currentVal.toFixed(1)}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = `${prefix}${target}${suffix}`;
        }
      }

      requestAnimationFrame(update);
    };

    if (!('IntersectionObserver' in window)) {
      counterElements.forEach(el => animateCounter(el));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    counterElements.forEach(el => observer.observe(el));
  }

  /* ============================================================
     4. Interactive RAG Query Simulator
     ============================================================ */
  const RAG_SIMULATOR_DATA = {
    aquaculture: {
      tag: 'IoT & Marine Informatics',
      query: 'IoT-based Smart Aquaculture & Water Quality Monitoring in Northern Cebu',
      score: 97.8,
      scoreColor: '#08D488',
      title: 'IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu',
      program: 'BSIT',
      year: '2025',
      adviser: 'Prof. M. Arriesgado',
      authors: 'Cadaro, Cabardo, Conde, De Jesus, Ompoy',
      summary: 'Utilizes an ESP32 sensor cluster measuring dissolved oxygen (DO), pH, and salinity with MQTT telemetry and cloud alarms. Evaluated at Daanbantayan coastal fish ponds, the system demonstrated a 34% reduction in unexpected aquatic mortality and enabled real-time mobile notifications for farm operators.',
      keyFindings: 'DO levels remained consistently above 5.0 mg/L via automated relay activation; average notification latency was 1.4 seconds.',
      citation: 'Cadaro, J., et al. (2025). IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture. CTU Daanbantayan Campus Library.'
    },
    fisherfolk: {
      tag: 'Community Systems & PWA',
      query: 'Mobile Inventory & Direct-Trade Marketplace for Small-Scale Fisherfolk',
      score: 95.4,
      scoreColor: '#1AD28F',
      title: 'BantayanIsda: A Progressive Web-Based Fisherfolk Direct-Trade and Cold-Chain Inventory System',
      program: 'BSIT',
      year: '2024',
      adviser: 'Engr. R. Batulan',
      authors: 'Alimodian, Balbuena, Carvajal, Duka',
      summary: 'Engineered an offline-first Progressive Web App (PWA) facilitating transparent dockside fish pricing, digital catch logbooks, and direct wholesale order matching for fisherfolk cooperatives in Daanbantayan and neighboring Bantayan islands, eliminating exploitative middlemen.',
      keyFindings: 'Cooperatives reported a 28% increase in net profit margins; offline caching enabled uninterrupted transaction logging during sea voyages.',
      citation: 'Alimodian, K., et al. (2024). BantayanIsda: Progressive Web-Based Direct-Trade. CTU Daanbantayan Campus Library.'
    },
    agriculture: {
      tag: 'Computer Vision & AI',
      query: 'Deep Learning Computer Vision for Mango Crop Pest & Disease Identification',
      score: 98.2,
      scoreColor: '#08D488',
      title: 'Automated Mango Anthracnose and Stem-End Rot Detection Using Mobile Deep Learning',
      program: 'BSIT',
      year: '2025',
      adviser: 'Dr. E. Sanchez',
      authors: 'Villanueva, Mendoza, Tundag, Ybañez',
      summary: 'Trained a lightweight MobileNetV3 convolutional network on 3,400 field images of mango foliage and fruit collected across northern Cebu orchards. The system operates directly in mobile browsers, accurately diagnosing fungal pathogens and prescribing organic countermeasures without remote cloud latency.',
      keyFindings: 'Achieved 94.6% classification accuracy under varying sunlight conditions; inferencing completed in 142ms on standard Android devices.',
      citation: 'Villanueva, R., et al. (2025). Automated Mango Anthracnose Detection. CTU Daanbantayan Campus Library.'
    }
  };

  function initRagSimulator() {
    const tabs = document.querySelectorAll('.sim-preset-btn');
    const queryEl = document.getElementById('sim-query-text');
    const scoreValEl = document.getElementById('sim-score-val');
    const scoreFillEl = document.getElementById('sim-score-fill');
    const titleEl = document.getElementById('sim-result-title');
    const metaEl = document.getElementById('sim-result-meta');
    const summaryEl = document.getElementById('sim-result-summary');
    const findingsEl = document.getElementById('sim-result-findings');
    const cardEl = document.getElementById('sim-result-card');

    if (!tabs.length || !queryEl) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-sim-key');
        const data = RAG_SIMULATOR_DATA[key];
        if (!data) return;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Flash animation
        if (cardEl) {
          cardEl.classList.add('sim-updating');
          setTimeout(() => cardEl.classList.remove('sim-updating'), 350);
        }

        queryEl.textContent = `"${data.query}"`;
        scoreValEl.textContent = `${data.score}%`;
        if (scoreFillEl) {
          scoreFillEl.style.width = `${data.score}%`;
          scoreFillEl.style.backgroundColor = data.scoreColor;
        }

        titleEl.textContent = data.title;
        metaEl.innerHTML = `
          <span class="sim-pill">${data.program}</span>
          <span class="sim-pill">A.Y. ${data.year}</span>
          <span class="sim-pill">Adviser: ${data.adviser}</span>
        `;
        summaryEl.textContent = data.summary;
        if (findingsEl) {
          findingsEl.textContent = data.keyFindings;
        }
      });
    });
  }

  /* ============================================================
     5. Interactive Role Matrix Switcher
     ============================================================ */
  const ROLE_MATRIX_DATA = {
    student: {
      roleBadge: 'Undergraduate Researchers',
      title: 'Student Researcher',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      headline: 'Uncover past research, verify topic novelty, and cite with precision.',
      description: 'Students can search the repository using traditional filters or the AI-powered Pinecone vector search, read abstracts and key findings, save bookmarks, and export formatted citations.',
      features: [
        'Natural-language semantic search via Pinecone Vector Database',
        'Conversational Q&A with the RAG Assistant grounded in CTU theses',
        'Instant multi-format citation export (APA 7th, IEEE, MLA, Chicago, BibTeX)',
        'Personal Cloud Bookmarking synced across devices'
      ],
      ctaText: 'Start Researching',
      ctaHref: '../index.html'
    },
    teacher: {
      roleBadge: 'Academic Advisers & Faculty',
      title: 'Faculty / Teacher Researcher',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
      headline: 'Explore past literature, benchmark methodology, and verify topic originality.',
      description: 'Faculty members and teachers enjoy the same powerful research workstation as students: semantic search, conversational RAG AI, personal cloud bookmarks, and dynamic citation generation.',
      features: [
        'Natural-language semantic search via Pinecone Vector Database',
        'Conversational Q&A with the RAG Assistant grounded in CTU theses',
        'Instant multi-format citation export (APA 7th, IEEE, MLA, Chicago)',
        'Personal Cloud Bookmarking and research activity telemetry'
      ],
      ctaText: 'Access Teacher Portal',
      ctaHref: 'teacher_page.html'
    },
    librarian: {
      roleBadge: 'Information Curators',
      title: 'Campus Librarian',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
      headline: 'Harmonize physical library accession with digital cloud records.',
      description: 'The campus librarian oversees repository integrity, ensuring thesis metadata, call numbers, physical shelf accession, and digital documentation remain perfectly synchronized.',
      features: [
        'Curate thesis records, abstracts, keyword indexing, and metadata taxonomy',
        'Monitor digital repository usage statistics and search inquiry volume',
        'Ensure compliance with CTU library institutional archival standards',
        'Bridge physical binder archives with 24/7 online open accessibility'
      ],
      ctaText: 'Open Library Catalog',
      ctaHref: 'librarian_page.html'
    },
    admin: {
      roleBadge: 'System Administration & DevOps',
      title: 'System Administrator',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      headline: 'Full operational control over vector indexes, database security, and user roles.',
      description: 'System administrators maintain the Pinecone vector synchronization, oversee Firestore collections, manage user permissions, monitor API performance, and audit activity logs.',
      features: [
        'One-click Pinecone Vector DB re-indexing and synchronization endpoint',
        'User management and role-based access control (Student, Teacher, Librarian, Admin)',
        'Cloudinary cloud storage image asset inspection and cleanup',
        'Real-time system audit logs tracking search, authentication, and vector activity'
      ],
      ctaText: 'Admin Dashboard',
      ctaHref: 'admin_page.html'
    }
  };

  function initRoleMatrix() {
    const roleBtns = document.querySelectorAll('.role-tab-btn');
    const roleBadgeEl = document.getElementById('role-card-badge');
    const roleTitleEl = document.getElementById('role-card-title');
    const roleDescEl = document.getElementById('role-card-desc');
    const roleFeaturesEl = document.getElementById('role-card-features');
    const roleCtaEl = document.getElementById('role-card-cta');
    const roleIconEl = document.getElementById('role-card-icon');
    const roleContainer = document.getElementById('role-card-body');

    if (!roleBtns.length || !roleTitleEl) return;

    roleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const roleKey = btn.getAttribute('data-role-key');
        const role = ROLE_MATRIX_DATA[roleKey];
        if (!role) return;

        roleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (roleContainer) {
          roleContainer.classList.add('role-updating');
          setTimeout(() => roleContainer.classList.remove('role-updating'), 300);
        }

        roleBadgeEl.textContent = role.roleBadge;
        roleTitleEl.textContent = role.title;
        roleDescEl.textContent = role.description;
        if (roleIconEl) roleIconEl.innerHTML = role.icon;

        roleFeaturesEl.innerHTML = role.features
          .map(f => `
            <li class="role-feature-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="check-icon"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${f}</span>
            </li>
          `)
          .join('');

        if (roleCtaEl) {
          roleCtaEl.textContent = role.ctaText;
          roleCtaEl.setAttribute('href', role.ctaHref);
        }
      });
    });
  }

  /* ============================================================
     6. Interactive Citation Playground
     ============================================================ */
  const CITATION_SAMPLES = {
    apa: 'Cadaro, J., Cabardo, C., Conde, C., De Jesus, A., & Ompoy, R. (2025). IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu. Cebu Technological University — Daanbantayan Campus Library.',
    ieee: 'J. Cadaro, C. Cabardo, C. Conde, A. De Jesus, and R. Ompoy, "IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu," Undergraduate Capstone Project, Dept. Information Technology, Cebu Technological Univ., Daanbantayan Campus, 2025.',
    mla: 'Cadaro, John, et al. "IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu." Undergraduate Capstone Project, Cebu Technological University — Daanbantayan Campus, 2025.',
    chicago: 'Cadaro, John, Carmela Cabardo, Christine Conde, Allan De Jesus, and Rheina Ompoy. "IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu." Undergraduate thesis, Cebu Technological University — Daanbantayan Campus, 2025.',
    harvard: 'Cadaro, J., Cabardo, C., Conde, C., De Jesus, A. and Ompoy, R., 2025. IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu. Undergraduate thesis. Cebu Technological University — Daanbantayan Campus Library.',
    bibtex: `@thesis{cadaro2025iot,\n  author = {Cadaro, John and Cabardo, Carmela and Conde, Christine and De Jesus, Allan and Ompoy, Rheina},\n  title  = {IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu},\n  school = {Cebu Technological University -- Daanbantayan Campus},\n  year   = {2025},\n  type   = {Undergraduate Capstone Project}\n}`
  };

  function initCitationPlayground() {
    const tabs = document.querySelectorAll('.cite-tab-btn');
    const textEl = document.getElementById('cite-sample-text');
    const copyBtn = document.getElementById('cite-copy-btn');

    if (!tabs.length || !textEl || !copyBtn) return;

    let currentFormat = 'apa';

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const fmt = tab.getAttribute('data-cite-fmt');
        if (!CITATION_SAMPLES[fmt]) return;

        currentFormat = fmt;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        textEl.textContent = CITATION_SAMPLES[fmt];
      });
    });

    copyBtn.addEventListener('click', () => {
      const text = CITATION_SAMPLES[currentFormat] || textEl.textContent;
      navigator.clipboard.writeText(text).then(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('Citation copied to clipboard!', 'success');
        } else if (window.ModalDialog) {
          ModalDialog.alert({
            title: 'Copied',
            message: 'Citation copied to clipboard!',
            type: 'success'
          });
        } else {
          alert('Citation copied to clipboard!');
        }

        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12"/></svg>
          Copied!
        `;
        copyBtn.classList.add('btn-copied');

        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.classList.remove('btn-copied');
        }, 2200);
      }).catch(err => {
        console.error('Failed to copy citation:', err);
      });
    });
  }

})();

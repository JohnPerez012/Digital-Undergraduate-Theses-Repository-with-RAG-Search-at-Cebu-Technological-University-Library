/**
 * RE-CAPS About Page Interactive Controller (v3.0 — Editorial Architectural System)
 * Handles theme toggle, scroll progress, section scroll-spy, counters,
 * 4-stage RAG pipeline stepper, semantic vector match explorer, security accordion,
 * stakeholder workstation matrix, and multi-format citation playground.
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initScrollProgressAndSpy();
    initScrollReveal();
    initCounters();
    initRagStageStepper();
    initRagSimulator();
    initSecurityAccordion();
    initRoleMatrix();
    initCitationPlayground();
  });

  /* ============================================================
     1. Light / Dark Theme Toggle (synced with main app localStorage)
     ============================================================ */
  function initThemeToggle() {
    const btn = document.getElementById('about-theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch (_e) {}
    });
  }

  /* ============================================================
     2. Scroll Progress Hairline & Sticky Nav Scroll-Spy
     ============================================================ */
  function initScrollProgressAndSpy() {
    const progressBar = document.getElementById('scroll-progress');
    const navAnchors = Array.from(document.querySelectorAll('.nav-anchor'));
    const sections = navAnchors
      .map(a => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);

    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (progressBar) {
        const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      }

      if (sections.length) {
        let activeId = sections[0].id;
        for (const sec of sections) {
          if (sec.getBoundingClientRect().top <= 140) {
            activeId = sec.id;
          }
        }
        navAnchors.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === `#${activeId}`);
        });
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
     3. Scroll-Reveal Animations
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
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    revealElements.forEach(el => observer.observe(el));
  }

  /* ============================================================
     4. Metric Counters (Integer & Decimal Safe)
     ============================================================ */
  function initCounters() {
    const counterElements = document.querySelectorAll('[data-counter-target]');
    if (!counterElements.length) return;

    const animateCounter = (el) => {
      const rawTarget = el.getAttribute('data-counter-target') || '0';
      const target = parseFloat(rawTarget);
      const suffix = el.getAttribute('data-counter-suffix') || '';
      const prefix = el.getAttribute('data-counter-prefix') || '';
      const decimals = rawTarget.includes('.') ? rawTarget.split('.')[1].length : 0;
      const duration = 900;
      const startTime = performance.now();

      function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = target * eased;
        el.textContent = `${prefix}${decimals > 0 ? val.toFixed(decimals) : Math.round(val)}${suffix}`;
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = `${prefix}${decimals > 0 ? target.toFixed(decimals) : target}${suffix}`;
        }
      }

      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      counterElements.forEach(animateCounter);
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });

    counterElements.forEach(el => observer.observe(el));
  }

  /* ============================================================
     5. Interactive 4-Stage RAG Architecture Stepper
     ============================================================ */
  const RAG_STAGE_DETAILS = {
    '1': {
      kicker: 'STAGE 01 · SYNCHRONIZATION CONTRACT',
      heading: 'Structured Metadata Vectorization & Atomic Parity',
      desc: 'Whenever a librarian approves or edits a capstone record in Firestore, Express formats its Title, Abstract, Authors, Adviser, Program, Year, and Keywords via <code>formatSearchableText()</code> and embeds it using Pinecone Inference (<code>multilingual-e5-large</code>, <code>input_type: "passage"</code>) with identical document IDs.',
      specs: [
        ['Endpoint', 'POST /api/projects/sync'],
        ['Index', 'recaps-projects-search'],
        ['Dimensions', '1024-D float32 (Cosine)']
      ]
    },
    '2': {
      kicker: 'STAGE 02 · SEMANTIC RETRIEVAL',
      heading: 'Real-Time Cosine Similarity Across Degree Programs',
      desc: 'Student and faculty natural-language queries are embedded with <code>input_type: "query"</code> and matched against the Pinecone vector space. Results are enriched with cached physical shelf call numbers, accession numbers, and Cloudinary cover previews.',
      specs: [
        ['Endpoint', 'POST /api/pinecone/search'],
        ['Metric', 'Cosine Similarity Top-K'],
        ['Role Scope', 'Public Catalog / Staff Copilot']
      ]
    },
    '3': {
      kicker: 'STAGE 03 · ANTI-HALLUCINATION GROUNDING',
      heading: 'Context-Only Prompt Assembly & Citation Anchoring',
      desc: 'Retrieved project titles, abstracts, authors, advisers, and relevance scores are assembled into a strict grounding system prompt. The model is explicitly instructed never to invent external URLs or unarchived theses and to attribute every claim to verified repository records.',
      specs: [
        ['Grounding Rule', 'Context-Only Citation Policy'],
        ['History Cap', '3 Saved (Std) · 5 (Staff)'],
        ['IP Guard', 'R.A. 10173 Copy Protection']
      ]
    },
    '4': {
      kicker: 'STAGE 04 · RESILIENT MULTI-PROVIDER STREAMING',
      heading: '4-Tier Cascading Failover with Live Health Pool & Quotas',
      desc: 'Queries stream token-by-token via Server-Sent Events across <strong>Mistral AI</strong>, <strong>Groq AI</strong>, <strong>Google Gemini</strong>, and <strong>OpenRouter</strong> using 30-second Undici connection pooling. Rate-limit headers (<code>X-RateLimit-*</code>, <code>X-Model-Health</code>) track per-role daily allocations (25 / 50 / 150) and automatically route around cooling tiers.',
      specs: [
        ['Endpoints', 'POST /api/chat · GET /api/chat/quota'],
        ['Daily Reset', '12:00 AM PHT (UTC+8)'],
        ['Fallback Pool', 'Mistral → Groq → Gemini → OpenRouter']
      ]
    }
  };

  function initRagStageStepper() {
    const cards = document.querySelectorAll('.rag-stage-card');
    const kickerEl = document.getElementById('rag-detail-kicker');
    const headingEl = document.getElementById('rag-detail-heading');
    const descEl = document.getElementById('rag-detail-desc');
    const specsEl = document.getElementById('rag-detail-specs');
    if (!cards.length || !headingEl) return;

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const stage = card.getAttribute('data-stage');
        const info = RAG_STAGE_DETAILS[stage];
        if (!info) return;

        cards.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-selected', 'false');
        });
        card.classList.add('active');
        card.setAttribute('aria-selected', 'true');

        kickerEl.textContent = info.kicker;
        headingEl.textContent = info.heading;
        descEl.innerHTML = info.desc;
        specsEl.innerHTML = info.specs
          .map(([label, code]) => `<div class="spec-line"><span>${label}</span><code>${code}</code></div>`)
          .join('');
      });
    });
  }

  /* ============================================================
     6. Interactive Semantic Vector Match Explorer
     ============================================================ */
  const RAG_SIMULATOR_DATA = {
    aquaculture: {
      query: 'IoT-based Smart Aquaculture & Water Quality Monitoring in Northern Cebu',
      score: 97.8,
      title: 'IoT-Driven Water Quality Monitoring and Automated Aeration for Coastal Aquaculture in Northern Cebu',
      program: 'BSIT',
      year: 'A.Y. 2025',
      shelf: 'Shelf: IT-R2-S4',
      adviser: 'Prof. M. Arriesgado',
      provider: 'Mistral AI · Tier 1',
      summary: 'Utilizes an ESP32 sensor cluster measuring dissolved oxygen (DO), pH, and salinity with MQTT telemetry and cloud alarms. Evaluated at Daanbantayan coastal fish ponds, the system demonstrated a 34% reduction in unexpected aquatic mortality and enabled real-time mobile notifications for farm operators.',
      findings: 'DO levels remained consistently above 5.0 mg/L via automated relay activation; average notification latency was 1.4 seconds. Physical manuscript available at Shelf IT-R2-S4 for on-campus inspection.'
    },
    fisherfolk: {
      query: 'Mobile Inventory & Direct-Trade Marketplace for Small-Scale Fisherfolk',
      score: 95.4,
      title: 'BantayanIsda: A Progressive Web-Based Fisherfolk Direct-Trade and Cold-Chain Inventory System',
      program: 'BSFi / BSIT',
      year: 'A.Y. 2024',
      shelf: 'Shelf: FI-R1-S2',
      adviser: 'Engr. R. Batulan',
      provider: 'Groq AI · Tier 2',
      summary: 'Engineered an offline-first Progressive Web App facilitating transparent dockside fish pricing, digital catch logbooks, and direct wholesale order matching for fisherfolk cooperatives in Daanbantayan and neighboring islands.',
      findings: 'Cooperatives reported a 28% increase in net margins; offline caching enabled uninterrupted catch logging during sea voyages. Full hardbound copy cataloged under Shelf FI-R1-S2.'
    },
    agriculture: {
      query: 'Deep Learning Computer Vision for Mango Crop Pest & Disease Identification',
      score: 98.2,
      title: 'Automated Mango Anthracnose and Stem-End Rot Detection Using Mobile Deep Learning',
      program: 'BSIT',
      year: 'A.Y. 2025',
      shelf: 'Shelf: IT-R3-S1',
      adviser: 'Dr. E. Sanchez',
      provider: 'Mistral AI · Tier 1',
      summary: 'Trained a lightweight MobileNetV3 convolutional network on 3,400 field images of mango foliage and fruit collected across northern Cebu orchards, diagnosing fungal pathogens directly in mobile browsers without cloud latency.',
      findings: 'Achieved 94.6% classification accuracy under varying daylight conditions with 142ms on-device inference latency. Reference copy located at Shelf IT-R3-S1.'
    },
    library: {
      query: 'AI semantic capstone repository with RAG chatbot and physical shelf tracking',
      score: 99.1,
      title: 'Development of an AI-Integrated Undergraduate Capstone Project and Fundamentals of Research Repository with RAG and Chatbot Support (RE-CAPS)',
      program: 'BSIT',
      year: 'A.Y. 2026',
      shelf: 'Shelf: IT-R4-S1',
      adviser: 'Mr. V. Sayson Jr.',
      provider: 'Mistral AI · Tier 1',
      summary: 'Centralizes undergraduate capstone metadata in Firebase Firestore with 1024-D multilingual-e5-large vector retrieval in Pinecone, 4-tier cascading LLM assistance, 45-second cataloging mutex locks, and R.A. 10173 anti-plagiarism text protection.',
      findings: 'Validated by 363 CTU Daanbantayan respondents with an overall Strongly Agree mean of 4.27/5.00 and unanimous 5.00/5.00 librarian retrieval speed rating.'
    }
  };

  function renderSegmentedMeter(container, pct) {
    if (!container) return;
    const total = 20;
    const filled = Math.max(1, Math.min(total, Math.round((pct / 100) * total)));
    let html = '';
    for (let i = 0; i < total; i++) {
      html += `<span class="sim-seg ${i < filled ? 'filled' : ''}"></span>`;
    }
    container.innerHTML = html;
  }

  function initRagSimulator() {
    const buttons = document.querySelectorAll('.sim-preset-btn');
    const queryEl = document.getElementById('sim-query-text');
    const scoreValEl = document.getElementById('sim-score-val');
    const segMeterEl = document.getElementById('sim-seg-meter');
    const titleEl = document.getElementById('sim-result-title');
    const metaEl = document.getElementById('sim-result-meta');
    const summaryEl = document.getElementById('sim-result-summary');
    const findingsEl = document.getElementById('sim-result-findings');
    const providerEl = document.getElementById('sim-provider-label');
    const cardEl = document.getElementById('sim-result-card');

    if (!buttons.length || !queryEl) return;

    // Initial segmented meter render
    renderSegmentedMeter(segMeterEl, RAG_SIMULATOR_DATA.aquaculture.score);

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sim-key');
        const data = RAG_SIMULATOR_DATA[key];
        if (!data) return;

        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (cardEl) {
          cardEl.classList.add('sim-updating');
          setTimeout(() => cardEl.classList.remove('sim-updating'), 220);
        }

        queryEl.textContent = `"${data.query}"`;
        scoreValEl.textContent = `${data.score.toFixed(1)}%`;
        renderSegmentedMeter(segMeterEl, data.score);
        titleEl.textContent = data.title;
        metaEl.innerHTML = `
          <span class="ed-tag">${data.program}</span>
          <span class="ed-tag">${data.year}</span>
          <span class="ed-tag">${data.shelf}</span>
          <span class="ed-tag">Adviser: ${data.adviser}</span>
        `;
        summaryEl.textContent = data.summary;
        if (findingsEl) findingsEl.textContent = data.findings;
        if (providerEl) providerEl.textContent = data.provider;
      });
    });
  }

  /* ============================================================
     7. Security & Governance Accordion
     ============================================================ */
  function initSecurityAccordion() {
    const items = document.querySelectorAll('#security-accordion .acc-item');
    if (!items.length) return;

    items.forEach(item => {
      const trigger = item.querySelector('.acc-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', () => {
        const wasActive = item.classList.contains('active');
        items.forEach(other => {
          other.classList.remove('active');
          const otherBtn = other.querySelector('.acc-trigger');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });
        if (!wasActive) {
          item.classList.add('active');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ============================================================
     8. Stakeholder Workstation Matrix (Aligned with Real Quotas)
     ============================================================ */
  const ROLE_MATRIX_DATA = {
    student: {
      badge: 'Undergraduate Researchers',
      quotas: ['25 AI Queries / Day', '3 Saved Chats'],
      title: 'Student Researcher',
      description: 'Discover prior undergraduate capstones using natural-language Pinecone semantic search, inspect abstracts and physical shelf locations, bookmark references, and export formatted citations.',
      features: [
        'Natural-language semantic search across campus degree programs',
        'Grounded RAG Assistant with live 4-tier model health visibility',
        'Instant APA 7th, MLA 9th, and IEEE citation generation',
        'Personal Cloud Bookmarking and local-device activity history'
      ],
      ctaText: 'Start Researching',
      ctaHref: '../index.html'
    },
    teacher: {
      badge: 'Faculty Advisers & Instructors',
      quotas: ['50 AI Queries / Day', '3 Saved Chats'],
      title: 'Faculty / Research Adviser',
      description: 'Verify capstone topic novelty during Capstone 1 title hearings, benchmark prior methodologies across departments, and guide student teams with doubled daily AI query capacity.',
      features: [
        'Pre-defense novelty verification via 1024-D semantic similarity',
        'Expanded 50 queries/day AI Assistant research allocation',
        'Dedicated Faculty Portal with saved reference collections',
        'Instant APA 7th, MLA 9th, and IEEE citation verification'
      ],
      ctaText: 'Open Faculty Portal',
      ctaHref: 'teacher_page.html'
    },
    librarian: {
      badge: 'Library Personnel & Curators',
      quotas: ['150 AI Queries / Day', '5 Saved Chats'],
      title: 'Campus Librarian',
      description: 'Catalog physical shelf coordinates, Dewey/Library call numbers, and accession numbers with 45-second concurrency mutex locks, submission review queues, and a dedicated Staff Copilot.',
      features: [
        'Physical Shelf Cataloging Studio with 45-second mutex locks',
        'Thesis submission intake and metadata curation workflows',
        'Dedicated Staff Copilot RAG scoped to library procedures',
        'Mandatory Email 2FA security gate for archival integrity'
      ],
      ctaText: 'Open Librarian Portal',
      ctaHref: 'librarian_page.html'
    },
    admin: {
      badge: 'Head Librarian & System Admin',
      quotas: ['150 AI Queries / Day', '5 Saved Chats'],
      title: 'System Administrator',
      description: 'Exercise full institutional governance over capstone approvals, one-click Pinecone batch vector synchronization, user role administration, 3-tier account sanctions, and Cloudinary asset hygiene.',
      features: [
        'Approval & public publication queue with automatic Pinecone sync',
        'User provisioning (Librarian creation) and 14-day soft-delete quarantine',
        'Staff Copilot RAG (Admin + Librarian knowledge base scope)',
        'Analytics dashboard, Cloudinary asset cleanup, and verified 2FA control'
      ],
      ctaText: 'Open Admin Dashboard',
      ctaHref: 'admin_page.html'
    }
  };

  function initRoleMatrix() {
    const roleBtns = document.querySelectorAll('.role-tab-btn');
    const badgeEl = document.getElementById('role-card-badge');
    const quotasEl = document.getElementById('role-card-quotas');
    const titleEl = document.getElementById('role-card-title');
    const descEl = document.getElementById('role-card-desc');
    const featuresEl = document.getElementById('role-card-features');
    const ctaEl = document.getElementById('role-card-cta');
    const panelEl = document.getElementById('role-card-body');

    if (!roleBtns.length || !titleEl) return;

    roleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-role-key');
        const role = ROLE_MATRIX_DATA[key];
        if (!role) return;

        roleBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        if (panelEl) {
          panelEl.classList.add('role-updating');
          setTimeout(() => panelEl.classList.remove('role-updating'), 200);
        }

        if (badgeEl) badgeEl.textContent = role.badge;
        if (quotasEl) {
          quotasEl.innerHTML = role.quotas.map(q => `<span class="ed-tag">${q}</span>`).join('');
        }
        titleEl.textContent = role.title;
        descEl.textContent = role.description;
        featuresEl.innerHTML = role.features.map(f => `<li>${f}</li>`).join('');
        if (ctaEl) {
          ctaEl.textContent = role.ctaText;
          ctaEl.setAttribute('href', role.ctaHref);
        }
      });
    });
  }

  /* ============================================================
     9. Interactive Citation Playground (Reference + In-Text)
     ============================================================ */
  const CITATION_SAMPLES = {
    apa: {
      full: 'Cabardo, C. M., Cadaro, J. P., Conde, C. D., De Jesus, A., Jr. P., & Ompoy, R. C. (2026). Development of an AI-integrated undergraduate capstone project and fundamentals of research repository with retrieval-augmented generation and chatbot support for Cebu Technological University Daanbantayan Campus Library [Undergraduate capstone project]. Cebu Technological University — Daanbantayan Campus.',
      intext: 'Parenthetical: (Cabardo et al., 2026)  |  Narrative: Cabardo et al. (2026)'
    },
    mla: {
      full: 'Cabardo, Carmela M., et al. "Development of an AI-Integrated Undergraduate Capstone Project and Fundamentals of Research Repository with Retrieval-Augmented Generation and Chatbot Support." Cebu Technological University — Daanbantayan Campus, 2026.',
      intext: 'Parenthetical: (Cabardo et al.)  |  Narrative: According to Cabardo et al.'
    },
    ieee: {
      full: '[1] C. M. Cabardo, J. P. Cadaro, C. D. Conde, A. P. De Jesus Jr., and R. C. Ompoy, "Development of an AI-Integrated Undergraduate Capstone Project and Fundamentals of Research Repository with Retrieval-Augmented Generation and Chatbot Support," Undergraduate Capstone Project, Cebu Technological Univ., Daanbantayan Campus, Cebu, Philippines, 2026.',
      intext: 'Numeric In-Text: "...as demonstrated in the CTU repository architecture [1]."'
    }
  };

  function initCitationPlayground() {
    const fmtBtns = document.querySelectorAll('.cite-tab-btn');
    const modeBtns = document.querySelectorAll('.cite-mode-btn');
    const textEl = document.getElementById('cite-sample-text');
    const copyBtn = document.getElementById('cite-copy-btn');

    if (!fmtBtns.length || !textEl || !copyBtn) return;

    let currentFmt = 'apa';
    let currentMode = 'full';

    const updateOutput = () => {
      const sample = CITATION_SAMPLES[currentFmt];
      if (!sample) return;
      textEl.textContent = sample[currentMode];
      textEl.classList.toggle('is-intext', currentMode === 'intext');
    };

    fmtBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentFmt = btn.getAttribute('data-cite-fmt') || 'apa';
        fmtBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateOutput();
      });
    });

    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = btn.getAttribute('data-cite-mode') || 'full';
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateOutput();
      });
    });

    copyBtn.addEventListener('click', () => {
      const text = textEl.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('Citation copied to clipboard', 'success');
        }
        const labelSpan = copyBtn.querySelector('span');
        if (labelSpan) {
          const orig = labelSpan.textContent;
          labelSpan.textContent = 'Copied';
          setTimeout(() => { labelSpan.textContent = orig; }, 1800);
        }
      }).catch(err => {
        console.error('Failed to copy citation:', err);
      });
    });
  }
})();

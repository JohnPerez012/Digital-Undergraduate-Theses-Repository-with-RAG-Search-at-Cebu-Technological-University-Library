/**
 * ==========================================================================
 * RE-CAPS CITATION GENERATOR & BIBLIOGRAPHY STUDIO
 * Full-featured academic citation generator supporting APA 7th, MLA 9th,
 * Chicago 17th, IEEE, Harvard, and BibTeX with live preview, in-text
 * citation builder, import from saved projects, and one-click copy.
 * ==========================================================================
 */

(function () {
    'use strict';

    const CitationStudio = {
        currentFormat: 'apa',
        historyStorageKey: 'recaps_citation_history',

        init() {
            const section = document.getElementById('section-citations');
            if (!section) return;

            this.bindElements();
            this.initAuthors();
            this.bindEvents();
            this.populateSavedProjectsMenu();
            this.loadHistory();
            this.generate(); // initial render
        },

        bindElements() {
            this.formatPills = document.querySelectorAll('.citation-format-pill');
            this.legacyFormatSelect = document.getElementById('citation-format');
            this.titleInput = document.getElementById('citation-title');
            this.authorsInput = document.getElementById('citation-authors');
            this.authorsContainer = document.getElementById('citation-authors-container');
            this.addAuthorBtn = document.getElementById('btn-add-citation-author');
            this.yearInput = document.getElementById('citation-year');
            this.programInput = document.getElementById('citation-program');
            this.institutionInput = document.getElementById('citation-institution');
            this.repositoryInput = document.getElementById('citation-repository');
            this.generateBtn = document.getElementById('generate-citation-btn');

            this.displayBox = document.getElementById('citation-formatted-display');
            this.legacyOutputBox = document.getElementById('citation-output');
            this.activeFormatTag = document.getElementById('citation-active-format-tag');
            this.intextFormatTag = document.getElementById('citation-intext-format-tag');
            this.intextParenthetical = document.getElementById('citation-intext-parenthetical');
            this.intextNarrative = document.getElementById('citation-intext-narrative');

            this.copyRefBtn = document.getElementById('btn-copy-reference');
            this.copyBibtexBtn = document.getElementById('btn-copy-bibtex');
            this.downloadTxtBtn = document.getElementById('btn-download-txt');
            this.copyParenBtn = document.getElementById('btn-copy-parenthetical');
            this.copyNarrBtn = document.getElementById('btn-copy-narrative');

            this.importToggleBtn = document.getElementById('btn-import-saved-project');
            this.importMenu = document.getElementById('citation-import-menu');
            this.savedProjectsList = document.getElementById('citation-saved-projects-list');
            this.resetBtn = document.getElementById('btn-citation-reset');
            this.clearFormBtn = document.getElementById('btn-clear-citation-form');
            this.clearAuthorsBtn = document.getElementById('btn-clear-citation-authors');
            this.historyList = document.getElementById('citation-history-list');
            this.clearHistoryBtn = document.getElementById('btn-clear-citation-history');
        },

        initAuthors() {
            if (!this.authorsContainer) return;
            this.authorsContainer.innerHTML = '';

            let initialList = [];
            if (this.authorsInput && this.authorsInput.value.trim()) {
                initialList = this.splitPastedNames(this.authorsInput.value);
            }
            if (initialList.length === 0) {
                initialList = ['Cadaro, John P.', 'Allan P. De Jesus Jr.'];
            }

            initialList.forEach(name => this.addAuthorRow(name, false));
        },

        addAuthorRow(value = '', autoFocus = false) {
            if (!this.authorsContainer) return;

            const row = document.createElement('div');
            row.className = 'citation-author-row';
            row.innerHTML = `
                <div class="citation-author-badge">1</div>
                <div class="citation-author-input-wrap">
                    <input type="text" class="citation-text-input citation-author-item-input" 
                           placeholder="Author name (e.g. John Cadaro, or Cadaro, John, or Juan Dela Cruz)" 
                           value="${this.escapeHtml(value)}">
                </div>
                <button type="button" class="btn-remove-citation-author" title="Remove author" aria-label="Remove author">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;

            const input = row.querySelector('.citation-author-item-input');
            const removeBtn = row.querySelector('.btn-remove-citation-author');

            // Live updates on keystroke
            input.addEventListener('input', () => {
                this.syncAuthorsToHidden();
                this.generate(false);
            });

            // Enter key automatically adds next author row
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addAuthorRow('', true);
                }
            });

            // Smart paste handler: automatically splits if multiple authors are pasted
            input.addEventListener('paste', (e) => {
                const text = (e.clipboardData || window.clipboardData)?.getData('text');
                if (text && (text.includes(';') || text.includes('\n') || (text.match(/,/g) || []).length > 1 || text.includes(' and '))) {
                    e.preventDefault();
                    const splitNames = this.splitPastedNames(text);
                    if (splitNames.length > 0) {
                        input.value = splitNames[0];
                        for (let i = 1; i < splitNames.length; i++) {
                            this.addAuthorRow(splitNames[i], false);
                        }
                        this.syncAuthorsToHidden();
                        this.generate(false);
                    }
                }
            });

            // Remove author
            removeBtn.addEventListener('click', () => {
                const allRows = this.authorsContainer.querySelectorAll('.citation-author-row');
                if (allRows.length <= 1) {
                    input.value = '';
                    input.focus();
                } else {
                    row.remove();
                }
                this.updateAuthorBadges();
                this.syncAuthorsToHidden();
                this.generate(false);
            });

            this.authorsContainer.appendChild(row);
            this.updateAuthorBadges();
            this.syncAuthorsToHidden();

            if (autoFocus) {
                input.focus();
            }
        },

        updateAuthorBadges() {
            if (!this.authorsContainer) return;
            const rows = this.authorsContainer.querySelectorAll('.citation-author-row');
            rows.forEach((r, idx) => {
                const badge = r.querySelector('.citation-author-badge');
                if (badge) badge.textContent = (idx + 1).toString();
                const btn = r.querySelector('.btn-remove-citation-author');
                if (btn) {
                    btn.title = rows.length <= 1 ? 'Clear author' : 'Remove author';
                }
            });
        },

        splitPastedNames(raw) {
            if (!raw) return [];
            let list = [];
            if (raw.includes(';')) {
                list = raw.split(';');
            } else if (raw.includes('\n')) {
                list = raw.split('\n');
            } else if (raw.includes(' and ')) {
                list = raw.split(' and ');
            } else if ((raw.match(/,/g) || []).length > 1) {
                list = raw.split(',');
            } else {
                list = [raw];
            }
            return list.map(s => s.trim()).filter(Boolean);
        },

        setAuthors(authors) {
            if (!this.authorsContainer) return;
            this.authorsContainer.innerHTML = '';

            let list = [];
            if (Array.isArray(authors)) {
                list = authors;
            } else if (typeof authors === 'string') {
                list = this.splitPastedNames(authors);
            }

            if (list.length === 0) {
                list = [''];
            }

            list.forEach(name => this.addAuthorRow(name, false));
            this.syncAuthorsToHidden();
            this.generate(false);
        },

        syncAuthorsToHidden() {
            if (!this.authorsHiddenInput) return;
            const names = this.getAuthorEntries();
            this.authorsHiddenInput.value = names.join('; ');
        },

        getAuthorEntries() {
            if (this.authorsContainer) {
                const inputs = this.authorsContainer.querySelectorAll('.citation-author-item-input');
                const list = Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
                if (list.length > 0) return list;
            }
            if (this.authorsInput && this.authorsInput.value.trim()) {
                return this.splitPastedNames(this.authorsInput.value);
            }
            return [];
        },

        bindEvents() {
            // Format Pills
            this.formatPills.forEach(pill => {
                pill.addEventListener('click', () => {
                    const format = pill.dataset.format;
                    this.switchFormat(format);
                });
            });

            // Add Author Button
            if (this.addAuthorBtn) {
                this.addAuthorBtn.addEventListener('click', () => {
                    this.addAuthorRow('', true);
                });
            }

            // Live Input changes
            const liveInputs = [
                this.titleInput,
                this.yearInput,
                this.programInput,
                this.institutionInput,
                this.repositoryInput
            ];

            liveInputs.forEach(input => {
                if (input) {
                    input.addEventListener('input', () => this.generate(false));
                }
            });

            // Generate Button (Logs Activity & Saves to History)
            if (this.generateBtn) {
                this.generateBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.generate(true);
                });
            }

            // Copy Reference Button
            if (this.copyRefBtn) {
                this.copyRefBtn.addEventListener('click', () => {
                    const text = this.getPlainTextReference();
                    this.copyToClipboard(text, this.copyRefBtn, 'Copy Reference');
                });
            }

            // Copy BibTeX Button
            if (this.copyBibtexBtn) {
                this.copyBibtexBtn.addEventListener('click', () => {
                    const bibtex = this.buildBibTeX();
                    this.copyToClipboard(bibtex, this.copyBibtexBtn, 'Copy BibTeX');
                });
            }

            // Download Text Button
            if (this.downloadTxtBtn) {
                this.downloadTxtBtn.addEventListener('click', () => {
                    this.downloadCitationFile();
                });
            }

            // Copy In-Text Buttons
            if (this.copyParenBtn) {
                this.copyParenBtn.addEventListener('click', () => {
                    const text = this.intextParenthetical?.textContent?.trim() || '';
                    this.copyToClipboard(text, this.copyParenBtn, 'Copy');
                });
            }

            if (this.copyNarrBtn) {
                this.copyNarrBtn.addEventListener('click', () => {
                    const text = this.intextNarrative?.textContent?.trim() || '';
                    this.copyToClipboard(text, this.copyNarrBtn, 'Copy');
                });
            }

            // Import Saved Project Dropdown Toggle
            if (this.importToggleBtn && this.importMenu) {
                this.importToggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = this.importMenu.style.display === 'block';
                    this.importMenu.style.display = isOpen ? 'none' : 'block';
                });

                document.addEventListener('click', (e) => {
                    if (!this.importMenu.contains(e.target) && e.target !== this.importToggleBtn) {
                        this.importMenu.style.display = 'none';
                    }
                });
            }

            // Clear Form Button
            if (this.clearFormBtn) {
                this.clearFormBtn.addEventListener('click', () => {
                    this.clearForm();
                });
            }

            // Clear Authors Button
            if (this.clearAuthorsBtn) {
                this.clearAuthorsBtn.addEventListener('click', () => {
                    this.clearAuthors();
                });
            }

            // Reset Form Button
            if (this.resetBtn) {
                this.resetBtn.addEventListener('click', () => {
                    this.clearForm();
                });
            }

            // Clear History Button
            if (this.clearHistoryBtn) {
                this.clearHistoryBtn.addEventListener('click', () => {
                    localStorage.removeItem(this.historyStorageKey);
                    this.loadHistory();
                    if (typeof showToast === 'function') {
                        showToast('Citation history cleared', 'info');
                    }
                });
            }
        },

        clearForm() {
            if (this.titleInput) this.titleInput.value = '';
            this.setAuthors(['']);
            if (this.yearInput) this.yearInput.value = '';
            if (this.programInput) this.programInput.value = '';
            this.generate(false);
            if (this.titleInput) this.titleInput.focus();
            if (typeof showToast === 'function') {
                showToast('Citation form cleared', 'info');
            }
        },

        clearAuthors() {
            this.setAuthors(['']);
            if (this.authorsContainer) {
                const firstInput = this.authorsContainer.querySelector('.citation-author-item-input');
                if (firstInput) firstInput.focus();
            }
            if (typeof showToast === 'function') {
                showToast('Author fields cleared', 'info');
            }
        },

        resetForm() {
            this.clearForm();
        },

        switchFormat(format) {
            this.currentFormat = format;
            this.formatPills.forEach(p => {
                p.classList.toggle('active', p.dataset.format === format);
                p.setAttribute('aria-selected', p.dataset.format === format ? 'true' : 'false');
            });

            if (this.legacyFormatSelect) {
                this.legacyFormatSelect.value = format;
            }

            this.generate(false);
        },

        getMetadata() {
            const authorList = this.getAuthorEntries();
            return {
                title: this.titleInput?.value.trim() || '[Project Title]',
                authors: authorList.length > 0 ? authorList : [],
                year: this.yearInput?.value.trim() || new Date().getFullYear().toString(),
                program: this.programInput?.value.trim() || '',
                institution: this.institutionInput?.value.trim() || 'Cebu Technological University - Daanbantayan Campus',
                repository: this.repositoryInput?.value.trim() || 'RE-CAPS University Repository'
            };
        },

        parseAuthors(authorInput) {
            let rawList = [];
            if (Array.isArray(authorInput)) {
                rawList = authorInput;
            } else if (typeof authorInput === 'string' && authorInput.trim()) {
                rawList = this.splitPastedNames(authorInput);
            } else {
                rawList = this.getAuthorEntries();
            }

            if (rawList.length === 0) {
                return [{ first: '', last: 'Author Unknown', initials: 'A.' }];
            }

            const parsed = rawList.map(item => this.parseSingleAuthor(item)).filter(Boolean);
            return parsed.length > 0 ? parsed : [{ first: '', last: 'Author Unknown', initials: 'A.' }];
        },

        parseSingleAuthor(cleanName) {
            let str = (cleanName || '').trim();
            if (!str) return null;

            // Strip academic/honorific titles
            str = str.replace(/^(Dr\.|Engr\.|Prof\.|Professor|Atty\.|Rev\.|Hon\.|Mr\.|Ms\.|Mrs\.)\s+/i, '');

            // Comma format: "Last, First" or "Last, First Middle"
            if (str.includes(',')) {
                const parts = str.split(',').map(p => p.trim());
                const last = parts[0] || '';
                const first = parts[1] || '';
                const initials = first.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' ');
                return { first, last, initials: initials || (last ? last[0].toUpperCase() + '.' : 'A.') };
            }

            // Natural name: "First Last" or "First Middle Last" or compound surnames
            const words = str.split(/\s+/).filter(Boolean);
            if (words.length === 1) {
                return { first: '', last: words[0], initials: words[0][0].toUpperCase() + '.' };
            }

            // Compound Filipino / Spanish / European surnames (e.g. Dela Cruz, Delos Santos, De la Rosa, San Juan)
            const compoundPrefixes = ['dela', 'delos', 'de la', 'de los', 'del', 'de', 'san', 'santa', 'van', 'von', 'da', 'di'];

            // 3-word compound: e.g. "Juan De la Rosa"
            if (words.length >= 4) {
                const twoWordsBefore = (words[words.length - 3] + ' ' + words[words.length - 2]).toLowerCase();
                if (compoundPrefixes.includes(twoWordsBefore)) {
                    const last = words.slice(words.length - 3).join(' ');
                    const first = words.slice(0, words.length - 3).join(' ');
                    const initials = words.slice(0, words.length - 3).map(w => w[0].toUpperCase() + '.').join(' ');
                    return { first, last, initials };
                }
            }

            // 2-word compound: e.g. "Juan Dela Cruz" or "Maria Delos Reyes"
            if (words.length >= 3) {
                const wordBefore = words[words.length - 2].toLowerCase();
                if (compoundPrefixes.includes(wordBefore)) {
                    const last = words.slice(words.length - 2).join(' ');
                    const first = words.slice(0, words.length - 2).join(' ');
                    const initials = words.slice(0, words.length - 2).map(w => w[0].toUpperCase() + '.').join(' ');
                    return { first, last, initials };
                }
            }

            // Standard: last word is surname, earlier words are given names
            const last = words[words.length - 1];
            const first = words.slice(0, -1).join(' ');
            const initials = words.slice(0, -1).map(w => w[0].toUpperCase() + '.').join(' ');
            return { first, last, initials: initials || (last ? last[0].toUpperCase() + '.' : 'A.') };
        },

        generate(isUserAction = false) {
            const data = this.getMetadata();
            const authors = this.parseAuthors(data.authors);

            let htmlCitation = '';
            let plainTextCitation = '';
            let parenthetical = '';
            let narrative = '';
            let formatTitle = '';

            switch (this.currentFormat) {
                case 'apa':
                    formatTitle = 'APA 7th Edition';
                    htmlCitation = this.buildAPA(data, authors, true);
                    plainTextCitation = this.buildAPA(data, authors, false);
                    parenthetical = this.buildInTextParenAPA(authors, data.year);
                    narrative = this.buildInTextNarrativeAPA(authors, data.year);
                    break;
                case 'mla':
                    formatTitle = 'MLA 9th Edition';
                    htmlCitation = this.buildMLA(data, authors, true);
                    plainTextCitation = this.buildMLA(data, authors, false);
                    parenthetical = this.buildInTextParenMLA(authors);
                    narrative = this.buildInTextNarrativeMLA(authors);
                    break;
                case 'chicago':
                    formatTitle = 'Chicago 17th (Author-Date)';
                    htmlCitation = this.buildChicago(data, authors, true);
                    plainTextCitation = this.buildChicago(data, authors, false);
                    parenthetical = this.buildInTextParenChicago(authors, data.year);
                    narrative = this.buildInTextNarrativeChicago(authors, data.year);
                    break;
                case 'ieee':
                    formatTitle = 'IEEE Style';
                    htmlCitation = this.buildIEEE(data, authors, true);
                    plainTextCitation = this.buildIEEE(data, authors, false);
                    parenthetical = '[1]';
                    narrative = `${authors[0].last} et al. [1]`;
                    break;
                case 'harvard':
                    formatTitle = 'Harvard (Author-Date)';
                    htmlCitation = this.buildHarvard(data, authors, true);
                    plainTextCitation = this.buildHarvard(data, authors, false);
                    parenthetical = this.buildInTextParenHarvard(authors, data.year);
                    narrative = this.buildInTextNarrativeHarvard(authors, data.year);
                    break;
                case 'bibtex':
                    formatTitle = 'BibTeX Entry';
                    const bib = this.buildBibTeX(data, authors);
                    htmlCitation = `<pre style="margin: 0; font-family: inherit;">${this.escapeHtml(bib)}</pre>`;
                    plainTextCitation = bib;
                    parenthetical = `\\cite{${this.makeCitationKey(authors, data.year)}}`;
                    narrative = `\\citet{${this.makeCitationKey(authors, data.year)}}`;
                    break;
            }

            // Update DOM
            if (this.displayBox) {
                this.displayBox.innerHTML = htmlCitation;
                this.displayBox.classList.toggle('bibtex-mode', this.currentFormat === 'bibtex');
            }

            if (this.legacyOutputBox) {
                this.legacyOutputBox.textContent = plainTextCitation;
            }

            if (this.activeFormatTag) {
                this.activeFormatTag.textContent = formatTitle;
            }

            if (this.intextFormatTag) {
                this.intextFormatTag.textContent = formatTitle;
            }

            if (this.intextParenthetical) {
                this.intextParenthetical.textContent = parenthetical;
            }

            if (this.intextNarrative) {
                this.intextNarrative.textContent = narrative;
            }

            // If triggered explicitly by button
            if (isUserAction) {
                this.saveToHistory({
                    format: this.currentFormat.toUpperCase(),
                    title: data.title,
                    authors: data.authors,
                    year: data.year,
                    reference: plainTextCitation,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                if (window.ActivityService && typeof window.ActivityService.logCitation === 'function') {
                    window.ActivityService.logCitation(this.currentFormat.toUpperCase(), data.title);
                    if (typeof refreshLiveCounters === 'function') {
                        refreshLiveCounters();
                    }
                }

                if (typeof showToast === 'function') {
                    showToast(`Generated & saved ${formatTitle} citation!`, 'success');
                }
            }
        },

        // APA 7th Edition
        buildAPA(data, authors, isHtml = false) {
            let authorStr = '';
            if (authors.length === 1) {
                authorStr = `${authors[0].last}, ${authors[0].initials}`;
            } else if (authors.length === 2) {
                authorStr = `${authors[0].last}, ${authors[0].initials}, & ${authors[1].last}, ${authors[1].initials}`;
            } else {
                const allExceptLast = authors.slice(0, -1).map(a => `${a.last}, ${a.initials}`).join(', ');
                const last = authors[authors.length - 1];
                authorStr = `${allExceptLast}, & ${last.last}, ${last.initials}`;
            }

            const title = isHtml ? `<em>${this.escapeHtml(data.title)}</em>` : data.title;
            const programInfo = data.program ? `${data.program} undergraduate thesis, ` : 'Undergraduate thesis, ';
            return `${authorStr} (${data.year}). ${title} [${programInfo}${data.institution}]. ${data.repository}.`;
        },

        buildInTextParenAPA(authors, year) {
            if (authors.length === 1) return `(${authors[0].last}, ${year})`;
            if (authors.length === 2) return `(${authors[0].last} & ${authors[1].last}, ${year})`;
            return `(${authors[0].last} et al., ${year})`;
        },

        buildInTextNarrativeAPA(authors, year) {
            if (authors.length === 1) return `${authors[0].last} (${year})`;
            if (authors.length === 2) return `${authors[0].last} and ${authors[1].last} (${year})`;
            return `${authors[0].last} et al. (${year})`;
        },

        // MLA 9th Edition
        buildMLA(data, authors, isHtml = false) {
            let authorStr = '';
            if (authors.length === 1) {
                const first = authors[0].first || authors[0].initials;
                authorStr = `${authors[0].last}, ${first}`;
            } else if (authors.length === 2) {
                const first1 = authors[0].first || authors[0].initials;
                const first2 = authors[1].first || authors[1].initials;
                authorStr = `${authors[0].last}, ${first1}, and ${first2} ${authors[1].last}`;
            } else {
                const first = authors[0].first || authors[0].initials;
                authorStr = `${authors[0].last}, ${first}, et al`;
            }

            const title = isHtml ? `<em>${this.escapeHtml(data.title)}</em>` : data.title;
            return `${authorStr}. ${title}. ${data.year}. ${data.institution}, Undergraduate thesis. ${data.repository}.`;
        },

        buildInTextParenMLA(authors) {
            if (authors.length === 1) return `(${authors[0].last})`;
            if (authors.length === 2) return `(${authors[0].last} and ${authors[1].last})`;
            return `(${authors[0].last} et al.)`;
        },

        buildInTextNarrativeMLA(authors) {
            if (authors.length === 1) return `${authors[0].last}`;
            if (authors.length === 2) return `${authors[0].last} and ${authors[1].last}`;
            return `${authors[0].last} et al.`;
        },

        // Chicago 17th
        buildChicago(data, authors, isHtml = false) {
            let authorStr = '';
            if (authors.length === 1) {
                const first = authors[0].first || authors[0].initials;
                authorStr = `${authors[0].last}, ${first}`;
            } else if (authors.length === 2) {
                const first1 = authors[0].first || authors[0].initials;
                const first2 = authors[1].first || authors[1].initials;
                authorStr = `${authors[0].last}, ${first1}, and ${first2} ${authors[1].last}`;
            } else {
                const first = authors[0].first || authors[0].initials;
                authorStr = `${authors[0].last}, ${first}, et al`;
            }

            const title = isHtml ? `"${this.escapeHtml(data.title)}"` : `"${data.title}"`;
            return `${authorStr}. ${data.year}. ${title}. Undergraduate thesis, ${data.institution}.`;
        },

        buildInTextParenChicago(authors, year) {
            if (authors.length === 1) return `(${authors[0].last} ${year})`;
            if (authors.length === 2) return `(${authors[0].last} and ${authors[1].last} ${year})`;
            return `(${authors[0].last} et al. ${year})`;
        },

        buildInTextNarrativeChicago(authors, year) {
            if (authors.length === 1) return `${authors[0].last} (${year})`;
            if (authors.length === 2) return `${authors[0].last} and ${authors[1].last} (${year})`;
            return `${authors[0].last} et al. (${year})`;
        },

        // IEEE
        buildIEEE(data, authors, isHtml = false) {
            let authorStr = '';
            if (authors.length === 1) {
                authorStr = `${authors[0].initials} ${authors[0].last}`;
            } else if (authors.length === 2) {
                authorStr = `${authors[0].initials} ${authors[0].last} and ${authors[1].initials} ${authors[1].last}`;
            } else {
                authorStr = `${authors[0].initials} ${authors[0].last} et al.`;
            }

            const title = isHtml ? `"${this.escapeHtml(data.title)}"` : `"${data.title}"`;
            return `${authorStr}, ${title}, Undergraduate thesis, ${data.institution}, ${data.year}.`;
        },

        // Harvard
        buildHarvard(data, authors, isHtml = false) {
            let authorStr = '';
            if (authors.length === 1) {
                authorStr = `${authors[0].last}, ${authors[0].initials}`;
            } else if (authors.length === 2) {
                authorStr = `${authors[0].last}, ${authors[0].initials} and ${authors[1].last}, ${authors[1].initials}`;
            } else {
                authorStr = `${authors[0].last}, ${authors[0].initials} et al.`;
            }

            const title = isHtml ? `<em>${this.escapeHtml(data.title)}</em>` : data.title;
            return `${authorStr} (${data.year}) ${title}, Undergraduate thesis, ${data.institution}.`;
        },

        buildInTextParenHarvard(authors, year) {
            if (authors.length === 1) return `(${authors[0].last}, ${year})`;
            if (authors.length === 2) return `(${authors[0].last} and ${authors[1].last}, ${year})`;
            return `(${authors[0].last} et al., ${year})`;
        },

        buildInTextNarrativeHarvard(authors, year) {
            if (authors.length === 1) return `${authors[0].last} (${year})`;
            if (authors.length === 2) return `${authors[0].last} and ${authors[1].last} (${year})`;
            return `${authors[0].last} et al. (${year})`;
        },

        // BibTeX
        buildBibTeX(data = this.getMetadata(), authors = this.parseAuthors(data.authors)) {
            const key = this.makeCitationKey(authors, data.year);
            const bibAuthors = authors.map(a => `${a.last}, ${a.first || a.initials}`).join(' and ');
            return `@mastersthesis{${key},
  author  = {${bibAuthors}},
  title   = {{${data.title}}},
  school  = {${data.institution}},
  year    = {${data.year}},
  note    = {${data.program ? data.program + ' Undergraduate Thesis' : 'Undergraduate Thesis'}}
}`;
        },

        makeCitationKey(authors, year) {
            const firstLastName = (authors[0]?.last || 'Author').replace(/[^a-zA-Z]/g, '').toLowerCase();
            return `${firstLastName}${year}`;
        },

        getPlainTextReference() {
            const data = this.getMetadata();
            const authors = this.parseAuthors(data.authors);
            switch (this.currentFormat) {
                case 'apa': return this.buildAPA(data, authors, false);
                case 'mla': return this.buildMLA(data, authors, false);
                case 'chicago': return this.buildChicago(data, authors, false);
                case 'ieee': return this.buildIEEE(data, authors, false);
                case 'harvard': return this.buildHarvard(data, authors, false);
                case 'bibtex': return this.buildBibTeX(data, authors);
                default: return this.buildAPA(data, authors, false);
            }
        },

        copyToClipboard(text, button, originalText) {
            if (!text) return;

            navigator.clipboard.writeText(text).then(() => {
                if (button) {
                    const originalHTML = button.innerHTML;
                    button.classList.add('copied');
                    button.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Copied!</span>
                    `;
                    setTimeout(() => {
                        button.classList.remove('copied');
                        button.innerHTML = originalHTML;
                    }, 2000);
                }

                if (typeof showToast === 'function') {
                    showToast('Copied citation to clipboard!', 'success');
                }
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                if (typeof showToast === 'function') {
                    showToast('Failed to copy to clipboard', 'error');
                }
            });
        },

        downloadCitationFile() {
            const isBib = this.currentFormat === 'bibtex';
            const content = isBib ? this.buildBibTeX() : this.getPlainTextReference();
            const ext = isBib ? 'bib' : 'txt';
            const filename = `citation_${Date.now()}.${ext}`;

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            if (typeof showToast === 'function') {
                showToast(`Downloaded citation (${filename})!`, 'success');
            }
        },

        populateSavedProjectsMenu() {
            if (!this.savedProjectsList) return;

            let savedProjects = [];
            try {
                savedProjects = JSON.parse(localStorage.getItem('savedProjects')) || [];
            } catch (e) {
                console.error('Error parsing savedProjects:', e);
            }

            this.savedProjectsList.innerHTML = '';

            if (savedProjects.length === 0) {
                this.savedProjectsList.innerHTML = `
                    <div class="citation-import-empty">
                        No saved projects found in your collection yet.
                    </div>
                `;
                return;
            }

            savedProjects.forEach(proj => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'citation-import-item';

                let authorText = '';
                if (Array.isArray(proj.authors)) {
                    authorText = proj.authors.join('; ');
                } else if (typeof proj.authors === 'string') {
                    authorText = proj.authors;
                } else if (proj.author) {
                    authorText = proj.author;
                }

                item.innerHTML = `
                    <div class="citation-import-item-title">${this.escapeHtml(proj.title || 'Untitled Project')}</div>
                    <div class="citation-import-item-meta">${this.escapeHtml(authorText || 'Authors unknown')} · ${proj.year || '2024'}</div>
                `;

                item.addEventListener('click', () => {
                    this.applyProjectData(proj);
                    if (this.importMenu) this.importMenu.style.display = 'none';
                    if (typeof showToast === 'function') {
                        showToast(`Imported: "${proj.title || 'Project'}"`, 'info');
                    }
                });

                this.savedProjectsList.appendChild(item);
            });
        },

        applyProjectData(proj) {
            if (this.titleInput && proj.title) this.titleInput.value = proj.title;

            const projAuthors = proj.authors || proj.author || [];
            this.setAuthors(projAuthors);

            if (this.yearInput && proj.year) this.yearInput.value = proj.year;
            if (this.programInput && (proj.program || proj.department)) {
                this.programInput.value = proj.program || proj.department;
            }

            this.generate(false);
        },

        resetForm() {
            if (this.titleInput) this.titleInput.value = '';
            this.setAuthors(['Cadaro, John P.', 'Allan P. De Jesus Jr.']);
            if (this.yearInput) this.yearInput.value = new Date().getFullYear().toString();
            if (this.programInput) this.programInput.value = 'BS in Information Technology';
            if (this.institutionInput) this.institutionInput.value = 'Cebu Technological University - Daanbantayan Campus';
            if (this.repositoryInput) this.repositoryInput.value = 'RE-CAPS University Repository';

            this.generate(false);
            if (typeof showToast === 'function') {
                showToast('Citation form reset', 'info');
            }
        },

        saveToHistory(item) {
            let history = [];
            try {
                history = JSON.parse(localStorage.getItem(this.historyStorageKey)) || [];
            } catch (e) {
                history = [];
            }

            // Prepend, prevent duplicate of identical reference, keep top 10
            history = history.filter(h => h.reference !== item.reference);
            history.unshift(item);
            if (history.length > 10) history = history.slice(0, 10);

            try {
                localStorage.setItem(this.historyStorageKey, JSON.stringify(history));
            } catch (e) {
                console.error('Error saving citation history:', e);
            }

            this.loadHistory();
        },

        loadHistory() {
            if (!this.historyList) return;

            let history = [];
            try {
                history = JSON.parse(localStorage.getItem(this.historyStorageKey)) || [];
            } catch (e) {
                history = [];
            }

            this.historyList.innerHTML = '';

            if (history.length === 0) {
                this.historyList.innerHTML = `
                    <div class="citation-history-empty">
                        No recent citations generated yet.<br>Click "Generate & Save" to store citations here.
                    </div>
                `;
                return;
            }

            history.forEach(item => {
                const el = document.createElement('div');
                el.className = 'citation-history-item';
                el.innerHTML = `
                    <div class="citation-history-meta">
                        <div class="citation-history-title-text">${this.escapeHtml(item.title)}</div>
                        <div class="citation-history-sub-text">${item.format} · ${item.year} · ${item.timestamp}</div>
                    </div>
                    <button type="button" class="btn-history-copy" title="Copy reference">Copy</button>
                `;

                const copyBtn = el.querySelector('.btn-history-copy');
                copyBtn.addEventListener('click', () => {
                    this.copyToClipboard(item.reference, copyBtn, 'Copy');
                });

                this.historyList.appendChild(el);
            });
        },

        escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    // Auto-init on DOMContentLoaded or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CitationStudio.init());
    } else {
        CitationStudio.init();
    }

    // Expose globally
    window.CitationStudio = CitationStudio;
})();

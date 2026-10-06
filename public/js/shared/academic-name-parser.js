/**
 * =============================================================================
 * RE-CAPS ACADEMIC NAME & POST-NOMINAL CREDENTIAL PARSER (Universal System)
 * =============================================================================
 * Provides systematic, zero-maintenance parsing of faculty, researcher, and author
 * names across the RE-CAPS platform (Admin Analytics, Citation Studio, Project Detail
 * Citations, Search Filtering, and Sorting).
 *
 * Automatically separates and handles:
 * 1. Honorific & Academic Prefixes: Dr., Engr., Prof., Assoc. Prof., Asst. Prof., Dean, Atty., etc.
 * 2. Personal Names: First Name, Middle Name / Initial.
 * 3. True Surnames: Single and Compound Spanish/Philippine particles (de la Cruz, Del Rosario, etc.).
 * 4. Generational Suffixes: Jr., Sr., II, III, IV, V.
 * 5. Post-nominal Academic Degrees & Certifications: Ph.D., Ph. D., Ed.D., D.Eng., DIT,
 *    MSME, MSIT, MIT, MBA, MPA, M.Sc., M.Eng., PECE, CPA, LPT, RN, MD, etc.
 * =============================================================================
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AcademicNameParser = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const AcademicNameParser = {
        // Honorific / Academic prefixes
        prefixRegex: /^(dr\.?|doctor|engr\.?|engineer|prof\.?|professor|assoc\.?\s*prof\.?|asst\.?\s*prof\.?|dean|atty\.?|rev\.?|hon\.?|mr\.?|ms\.?|mrs\.?)\s+/i,

        // Generational / Lineage suffixes
        suffixRegex: /^(jr\.?|sr\.?|ii|iii|iv|v)$/i,

        // Post-nominal degrees, licenses, and professional certifications
        credentialPatterns: [
            // Doctorates
            'ph.?\\s*d.?', 'ed.?\\s*d.?', 'd.?\\s*eng.?', 'dit', 'dba', 'dpa', 'dm', 'sc.?\\s*d.?', 'd.?\\s*tech.?', 'd.?\\s*phil.?',
            // Master's
            'msme', 'msit', 'mit', 'mba', 'mpa', 'man', 'maed', 'm.?\\s*ed.?', 'm.?\\s*sc.?', 'm.?\\s*s.?', 'm.?\\s*eng.?',
            'me', 'mscs', 'mst', 'mem', 'mm', 'ma', 'm.?\\s*a.?',
            // Bachelor's
            'bsit', 'bscs', 'bsie', 'bscpe', 'bsee', 'bsme', 'bs', 'b.?\\s*s.?', 'ab', 'ba',
            // Professional Licenses, Fellowships & Certifications
            'pece', 'ece', 'cpa', 'lpt', 'rn', 'md', 'jd', 'ree', 'rme', 'csp', 'pmp', 'friedr', 'che', 'ce', 'pie'
        ],

        // Common compound surname particles (Philippine, Spanish, Dutch, German, French)
        compoundParticles: ['de', 'del', 'dela', 'de la', 'de los', 'de las', 'delos', 'san', 'santa', 'sta.', 'sto.', 'van', 'von', 'da', 'di'],

        /**
         * Test if a given token represents an academic degree or professional certification
         */
        isCredential(token) {
            if (!token) return false;
            const trimmed = String(token).trim();
            const clean = trimmed.replace(/[.,\s]/g, '').toLowerCase();
            return this.credentialPatterns.some(pattern => {
                const regex = new RegExp('^' + pattern + '$', 'i');
                return regex.test(trimmed) || regex.test(clean);
            });
        },

        /**
         * Test if a given token is a generational suffix (Jr., Sr., III, etc.)
         */
        isSuffix(token) {
            if (!token) return false;
            return this.suffixRegex.test(String(token).trim());
        },

        /**
         * Parse any raw person name string into its structured academic components
         * @param {string} raw - E.g. "Cyros M. Suson, Ph. D.", "Annalie C. Rubio, MSME", "Rogelio C. Sala Jr."
         * @returns {Object|null}
         */
        parse(raw) {
            if (!raw) return null;
            let str = String(raw).trim();
            if (!str || /^(not specified|n\/?a|none|unknown|null|tbd|undefined)$/i.test(str)) {
                return null;
            }

            let prefix = '';
            let suffix = '';
            const credentials = [];

            // 1. Extract honorific prefix
            const pMatch = str.match(this.prefixRegex);
            if (pMatch) {
                prefix = pMatch[1].trim();
                str = str.replace(this.prefixRegex, '').trim();
            }

            // 2. Inspect comma separation: distinguish 'Last, First' vs 'First Last, Credentials'
            const commaParts = str.split(',').map(s => s.trim()).filter(Boolean);
            let baseName = commaParts[0] || '';

            // Check if commaParts format is "Surname, Given Name" (traditional catalog style)
            let isCatalogLastFirst = false;
            if (commaParts.length >= 2) {
                const part1 = commaParts[1];
                if (!this.isSuffix(part1) && !this.isCredential(part1)) {
                    // Check if part0 is 1 or 2 words (a plausible surname)
                    const p0Tokens = commaParts[0].split(/\s+/).filter(Boolean);
                    if (p0Tokens.length <= 2) {
                        isCatalogLastFirst = true;
                        const surnamePart = commaParts[0];
                        const givenPart = commaParts[1];
                        baseName = givenPart + ' ' + surnamePart;
                        for (let i = 2; i < commaParts.length; i++) {
                            const p = commaParts[i];
                            if (this.isSuffix(p)) suffix = p;
                            else credentials.push(p);
                        }
                    }
                }
            }

            if (!isCatalogLastFirst) {
                for (let i = 1; i < commaParts.length; i++) {
                    const part = commaParts[i];
                    if (this.isSuffix(part)) {
                        suffix = part;
                    } else {
                        credentials.push(part);
                    }
                }
            }

            // 3. Scan trailing tokens of baseName for credentials or suffixes written WITHOUT commas
            // e.g. "Cyros M. Suson Ph. D." or "Rogelio C. Sala Jr."
            let tokens = baseName.split(/\s+/).filter(Boolean);
            while (tokens.length > 1) {
                // Two-token degree pattern like "Ph." + "D."
                if (tokens.length >= 2) {
                    const combinedTwo = tokens[tokens.length - 2] + ' ' + tokens[tokens.length - 1];
                    if (/^(ph\.?\s*d\.?|ed\.?\s*d\.?|d\.?\s*eng\.?|sc\.?\s*d\.?|m\.?\s*ed\.?|m\.?\s*sc\.?|m\.?\s*s\.?|b\.?\s*s\.?)$/i.test(combinedTwo)) {
                        credentials.unshift(combinedTwo);
                        tokens.splice(tokens.length - 2, 2);
                        continue;
                    }
                }

                const lastToken = tokens[tokens.length - 1];
                if (this.isCredential(lastToken)) {
                    credentials.unshift(lastToken);
                    tokens.pop();
                    continue;
                }
                if (this.isSuffix(lastToken)) {
                    suffix = lastToken;
                    tokens.pop();
                    continue;
                }
                break;
            }

            if (tokens.length === 0) return null;

            // 4. Resolve Surname, Middle, First from remaining tokens
            let surname = '';
            let firstName = '';
            let middle = '';

            const len = tokens.length;
            if (len === 1) {
                surname = tokens[0];
                firstName = tokens[0];
            } else if (len >= 3 && /^(de|del|dela|delos|san|santa|sta\.?|sto\.?)$/i.test(tokens[len - 2])) {
                // 2-word compound surname: e.g. "Juan Dela Cruz", "Pedro San Juan"
                surname = tokens[len - 2] + ' ' + tokens[len - 1];
                const rest = tokens.slice(0, len - 2);
                if (rest.length > 1 && /^[A-Za-z]\.?$/.test(rest[rest.length - 1])) {
                    middle = rest.pop();
                }
                firstName = rest.join(' ');
            } else if (len >= 4 && /^(de|van|von)$/i.test(tokens[len - 3]) && /^(la|los|las)$/i.test(tokens[len - 2])) {
                // 3-word compound surname: e.g. "Juan De la Rosa", "Jose De los Santos"
                surname = tokens[len - 3] + ' ' + tokens[len - 2] + ' ' + tokens[len - 1];
                const rest = tokens.slice(0, len - 3);
                if (rest.length > 1 && /^[A-Za-z]\.?$/.test(rest[rest.length - 1])) {
                    middle = rest.pop();
                }
                firstName = rest.join(' ');
            } else {
                surname = tokens[tokens.length - 1];
                const pen = tokens[tokens.length - 2];
                if (/^[A-Za-z]\.?$/.test(pen)) {
                    middle = pen;
                    firstName = tokens.slice(0, tokens.length - 2).join(' ');
                } else {
                    firstName = tokens.slice(0, tokens.length - 1).join(' ');
                }
            }

            // Clean punctuation on surname
            surname = surname.replace(/[,;]+$/, '').trim();

            // Normalized canonical clustering key (for merging variations like "Annalie C. Rubio" and "Annalie C. Rubio, MSME")
            const normFirst = firstName.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
            let normLast = surname.toLowerCase().replace(/[^a-z]/g, '');
            if (normLast.includes('rubio')) normLast = 'rubio'; // Typo tolerance for 'cmrubio'
            const clusterKey = (normFirst ? normFirst + '_' : '') + normLast;

            // Formatted initials for academic citations
            const initialsList = [];
            if (firstName) {
                firstName.split(/\s+/).forEach(w => {
                    if (w) initialsList.push(w[0].toUpperCase() + '.');
                });
            }
            if (middle) {
                const midChar = middle.replace(/[^A-Za-z]/g, '')[0];
                if (midChar) initialsList.push(midChar.toUpperCase() + '.');
            }
            const initials = initialsList.join(' ');

            // APA Citation format: Surname, F. M. or Surname, F. M., Jr.
            const suffixFormat = suffix ? `, ${suffix}` : '';
            const apaAuthor = initials ? `${surname}, ${initials}${suffixFormat}` : `${surname}${suffixFormat}`;

            // MLA Citation format: Surname, First M., Jr.
            const mlaMiddle = middle ? ` ${middle}` : '';
            const mlaAuthor = firstName ? `${surname}, ${firstName}${mlaMiddle}${suffixFormat}` : `${surname}${suffixFormat}`;

            // IEEE Citation format: F. M. Surname, Jr.
            const ieeeAuthor = initials ? `${initials} ${surname}${suffix ? ' ' + suffix : ''}` : `${surname}${suffix ? ' ' + suffix : ''}`;

            // Full display name with credentials
            const cleanCreds = credentials.length > 0 ? ', ' + credentials.join(', ') : '';
            const fullDisplay = [prefix, firstName, middle, surname, suffix].filter(Boolean).join(' ') + cleanCreds;

            return {
                raw,
                prefix,
                firstName,
                middle,
                surname,
                suffix,
                credentials: credentials.join(', '),
                initials,
                apaAuthor,
                mlaAuthor,
                ieeeAuthor,
                clusterKey,
                fullDisplay
            };
        },

        /**
         * Safely extract the clean, true surname of any academic name
         */
        extractSurname(raw) {
            const parsed = this.parse(raw);
            return parsed ? parsed.surname : (raw || '').trim();
        },

        /**
         * Get a normalized sort key for catalog sorting (e.g. "suson_cyros")
         */
        getSortKey(raw) {
            const parsed = this.parse(raw);
            if (!parsed) return (raw || '').trim().toLowerCase();
            return (parsed.surname + '_' + parsed.firstName).toLowerCase();
        },

        /**
         * Format an author or adviser for APA 7th edition
         */
        formatAPA(raw) {
            const parsed = this.parse(raw);
            return parsed ? parsed.apaAuthor : (raw || '').trim();
        },

        /**
         * Format an author or adviser for MLA 9th edition
         */
        formatMLA(raw) {
            const parsed = this.parse(raw);
            return parsed ? parsed.mlaAuthor : (raw || '').trim();
        },

        /**
         * Format an author or adviser for IEEE edition
         */
        formatIEEE(raw) {
            const parsed = this.parse(raw);
            return parsed ? parsed.ieeeAuthor : (raw || '').trim();
        },

        /**
         * Cluster and aggregate advisers across a list of project documents
         * Automatically groups variations and selects the canonical display title
         */
        clusterAdvisers(projects = []) {
            const clusters = {};

            projects.forEach(p => {
                const adv = p.adviser;
                const parsed = this.parse(adv);
                if (!parsed) return;

                if (!clusters[parsed.clusterKey]) {
                    clusters[parsed.clusterKey] = {
                        clusterKey: parsed.clusterKey,
                        surname: parsed.surname,
                        firstName: parsed.firstName,
                        count: 0,
                        canonicalDisplay: parsed.fullDisplay,
                        rawVariations: []
                    };
                }
                const item = clusters[parsed.clusterKey];
                item.count++;
                item.rawVariations.push(adv);
                if (parsed.fullDisplay.length > item.canonicalDisplay.length) {
                    item.canonicalDisplay = parsed.fullDisplay;
                }
            });

            return Object.values(clusters).sort((a, b) => b.count - a.count);
        }
    };

    return AcademicNameParser;
}));

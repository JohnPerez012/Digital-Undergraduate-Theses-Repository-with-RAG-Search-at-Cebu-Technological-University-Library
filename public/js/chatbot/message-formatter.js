/**
 * Message Formatter Module
 * Converts AI response text (markdown-like) into clean, formatted HTML
 */

const MessageFormatter = {
  
  /**
   * Main formatting function - converts raw AI text to formatted HTML
   * @param {string} rawText - Raw text from AI response
   * @param {string} source - Source of the message (e.g., 'Mistral', 'Groq', 'User')
   * @returns {string} - Formatted HTML string
   */
  format(rawText, source = '', relevantProjects = []) {
    if (!rawText) return '';
    
    // Fall back to AIService.lastRelevantProjects if not passed directly
    if ((!relevantProjects || !relevantProjects.length) && typeof AIService !== 'undefined' && Array.isArray(AIService.lastRelevantProjects)) {
      relevantProjects = AIService.lastRelevantProjects;
    }
    
    let html = rawText;
    
    // Apply formatting transformations in order
    html = this.formatHeaders(html);
    html = this.formatBoldText(html);
    html = this.formatItalicText(html);
    html = this.formatBulletLists(html);
    html = this.formatNumberedLists(html);
    html = this.formatCodeBlocks(html);
    html = this.formatInlineCode(html);
    html = this.formatLinks(html, relevantProjects);
    html = this.formatProjectTitles(html, relevantProjects);
    html = this.formatQuotes(html);
    html = this.formatLineBreaks(html);
    html = this.formatEmojis(html);
    
    return html;
  },
  
  /**
   * Format markdown headers (# Header, ## Header, etc.)
   */
  formatHeaders(text) {
    // H3 (###)
    text = text.replace(/^### (.+)$/gm, '<h3 class="ai-header-3">$1</h3>');
    // H2 (##)
    text = text.replace(/^## (.+)$/gm, '<h2 class="ai-header-2">$1</h2>');
    // H1 (#)
    text = text.replace(/^# (.+)$/gm, '<h1 class="ai-header-1">$1</h1>');
    
    return text;
  },
  
  /**
   * Format bold text (**text** or __text__)
   */
  formatBoldText(text) {
    // **bold**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="ai-bold">$1</strong>');
    // __bold__
    text = text.replace(/__(.+?)__/g, '<strong class="ai-bold">$1</strong>');
    
    return text;
  },
  
  /**
   * Format italic text (*text* or _text_)
   */
  formatItalicText(text) {
    // *italic* (avoid ** which is bold)
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="ai-italic">$1</em>');
    // _italic_ (avoid __ which is bold)
    text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em class="ai-italic">$1</em>');
    
    return text;
  },
  
  /**
   * Format bullet lists (- item or * item)
   */
  formatBulletLists(text) {
    const lines = text.split('\n');
    const formatted = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
      
      if (bulletMatch) {
        if (!inList) {
          formatted.push('<ul class="ai-list">');
          inList = true;
        }
        formatted.push(`<li class="ai-list-item">${bulletMatch[1]}</li>`);
      } else {
        if (inList) {
          formatted.push('</ul>');
          inList = false;
        }
        formatted.push(line);
      }
    }
    
    // Close list if still open
    if (inList) {
      formatted.push('</ul>');
    }
    
    return formatted.join('\n');
  },
  
  /**
   * Format numbered lists (1. item, 2. item, etc.)
   */
  formatNumberedLists(text) {
    const lines = text.split('\n');
    const formatted = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const numberMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
      
      if (numberMatch) {
        if (!inList) {
          formatted.push('<ol class="ai-list ai-list-numbered">');
          inList = true;
        }
        formatted.push(`<li class="ai-list-item">${numberMatch[1]}</li>`);
      } else {
        if (inList) {
          formatted.push('</ol>');
          inList = false;
        }
        formatted.push(line);
      }
    }
    
    // Close list if still open
    if (inList) {
      formatted.push('</ol>');
    }
    
    return formatted.join('\n');
  },
  
  /**
   * Format code blocks (```code```)
   */
  formatCodeBlocks(text) {
    // Multi-line code blocks
    text = text.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
      const language = lang || 'text';
      return `<pre class="ai-code-block"><code class="language-${language}">${this.escapeHtml(code.trim())}</code></pre>`;
    });
    
    return text;
  },
  
  /**
   * Format inline code (`code`)
   */
  formatInlineCode(text) {
    // Inline code (avoid code blocks)
    text = text.replace(/(?<!`)`(?!`)([^`]+?)(?<!`)`(?!`)/g, '<code class="ai-code-inline">$1</code>');
    
    return text;
  },
  
  /**
   * Escape attribute values
   */
  escapeAttr(text) {
    return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /**
   * Format links ([text](url)) - converts project links into interactive repository detail viewers
   */
  formatLinks(text, relevantProjects = []) {
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      const cleanUrl = (url || '').trim();
      const cleanText = (linkText || '').trim();
      const lowerUrl = cleanUrl.toLowerCase();
      const lowerText = cleanText.toLowerCase();

      // Check if this link refers to an internal project or thesis
      const isProjectLink = lowerUrl.includes('project') || 
                            lowerUrl.includes('capstone') || 
                            lowerUrl.includes('thesis') || 
                            lowerUrl.includes('projecthub') || 
                            lowerUrl.startsWith('#') ||
                            lowerUrl.startsWith('project:') ||
                            !cleanUrl.startsWith('http') ||
                            (relevantProjects && relevantProjects.some(p => {
                              const pt = (p.title || '').toLowerCase();
                              return pt && (pt.includes(lowerText) || lowerText.includes(pt));
                            }));

      if (isProjectLink) {
        const safeTitle = this.escapeHtml(cleanText);
        const attrTitle = this.escapeAttr(cleanText);
        const attrUrl = this.escapeAttr(cleanUrl);
        return `<a href="javascript:void(0)" class="ai-project-link" data-project-title="${attrTitle}" data-project-url="${attrUrl}" onclick="if(window.Chatbot && window.Chatbot.openProjectDetailsFromChat){ window.Chatbot.openProjectDetailsFromChat(this); } return false;" title="Click to view full project details in repository"><svg class="ai-project-link-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>${safeTitle}</a>`;
      }

      return `<a href="${cleanUrl}" class="ai-link" target="_blank" rel="noopener noreferrer">${this.escapeHtml(cleanText)}</a>`;
    });

    return text;
  },

  /**
   * Format project titles from RAG context into clickable project detail links
   */
  formatProjectTitles(text, relevantProjects = []) {
    if (!relevantProjects || !relevantProjects.length) return text;

    relevantProjects.forEach(proj => {
      if (!proj || !proj.title) return;
      const title = proj.title.trim();
      if (title.length < 5) return;

      // Escape for regex safely
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Look for <strong>[Title]</strong> or <strong>Title</strong> (generated from **Title**)
      // but only if not already wrapped in <a
      const boldPattern = new RegExp(`(?<!<a[^>]*>)<strong>\\[?(${escaped})\\]?<\\/strong>(?!<\\/a>)`, 'gi');
      text = text.replace(boldPattern, (m, matchedTitle) => {
        const safeTitle = this.escapeHtml(matchedTitle);
        const attrTitle = this.escapeAttr(matchedTitle);
        return `<a href="javascript:void(0)" class="ai-project-link" data-project-title="${attrTitle}" onclick="if(window.Chatbot && window.Chatbot.openProjectDetailsFromChat){ window.Chatbot.openProjectDetailsFromChat(this); } return false;" title="Click to view full project details in repository"><svg class="ai-project-link-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>${safeTitle}</a>`;
      });
    });

    return text;
  },
  
  /**
   * Format blockquotes (> quote)
   */
  formatQuotes(text) {
    const lines = text.split('\n');
    const formatted = [];
    let inQuote = false;
    let quoteContent = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const quoteMatch = line.match(/^>\s*(.*)$/);
      
      if (quoteMatch) {
        if (!inQuote) {
          inQuote = true;
        }
        quoteContent.push(quoteMatch[1]);
      } else {
        if (inQuote) {
          formatted.push(`<blockquote class="ai-quote">${quoteContent.join('<br>')}</blockquote>`);
          quoteContent = [];
          inQuote = false;
        }
        formatted.push(line);
      }
    }
    
    // Close quote if still open
    if (inQuote) {
      formatted.push(`<blockquote class="ai-quote">${quoteContent.join('<br>')}</blockquote>`);
    }
    
    return formatted.join('\n');
  },
  
  /**
   * Format line breaks and paragraphs
   */
  formatLineBreaks(text) {
    // Split into paragraphs (double line break)
    const paragraphs = text.split(/\n\n+/);
    
    return paragraphs.map(para => {
      para = para.trim();
      if (!para) return '';
      
      // Don't wrap if already wrapped in HTML tag
      if (para.startsWith('<')) return para;
      
      // Replace single line breaks with <br>
      para = para.replace(/\n/g, '<br>');
      
      return `<p class="ai-paragraph">${para}</p>`;
    }).join('\n');
  },
  
  /**
   * Format and preserve emojis
   */
  formatEmojis(text) {
    // Emojis are already Unicode, just wrap them for styling if needed
    return text.replace(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}])/gu, '<span class="ai-emoji">$1</span>');
  },
  
  /**
   * Add source attribution badge
   */
  addSourceAttribution(html, source) {
    const badge = `<div class="ai-source-badge">${this.escapeHtml(source)}</div>`;
    return badge + html;
  },
  
  /**
   * Format project count/metadata (e.g., "5 projects")
   */
  formatProjectCount(text) {
    text = text.replace(/(\d+)\s+(projects?|results?|items?)/gi, 
      '<span class="ai-count-badge">$1 $2</span>');
    return text;
  },
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  /**
   * Clean up extra whitespace and empty elements
   */
  cleanup(html) {
    // Remove empty paragraphs
    html = html.replace(/<p class="ai-paragraph">\s*<\/p>/g, '');
    // Remove multiple consecutive <br>
    html = html.replace(/(<br>\s*){3,}/g, '<br><br>');
    // Trim whitespace
    html = html.trim();
    
    return html;
  },
  
  /**
   * Complete formatting pipeline with cleanup
   */
  formatComplete(rawText, source = '', relevantProjects = []) {
    let html = this.format(rawText, source, relevantProjects);
    html = this.formatProjectCount(html);
    html = this.cleanup(html);
    return html;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageFormatter;
}

// Make available globally
window.MessageFormatter = MessageFormatter;

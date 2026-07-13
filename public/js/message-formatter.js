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
  format(rawText, source = '') {
    if (!rawText) return '';
    
    let html = rawText;
    
    // Apply formatting transformations in order
    html = this.formatHeaders(html);
    html = this.formatBoldText(html);
    html = this.formatItalicText(html);
    html = this.formatBulletLists(html);
    html = this.formatNumberedLists(html);
    html = this.formatCodeBlocks(html);
    html = this.formatInlineCode(html);
    html = this.formatLinks(html);
    html = this.formatQuotes(html);
    html = this.formatLineBreaks(html);
    html = this.formatEmojis(html);
    
    // Add source attribution if provided
    if (source) {
      html = this.addSourceAttribution(html, source);
    }
    
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
   * Format links ([text](url))
   */
  formatLinks(text) {
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="ai-link" target="_blank" rel="noopener noreferrer">$1</a>');
    
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
  formatComplete(rawText, source = '') {
    let html = this.format(rawText, source);
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

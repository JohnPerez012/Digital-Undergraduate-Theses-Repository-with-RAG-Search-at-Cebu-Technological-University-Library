/**
 * AI Service with RAG Integration
 * 4-Tier Fallback: Mistral → Groq → Gemini → OpenRouter
 */

const AIService = {
  API_BASE_URL: 'http://localhost:3001/api',
  conversationHistory: [],
  
  /**
   * Initialize the service
   */
  async initialize() {
    console.log('✓ AI Service initialized with 4-tier fallback');
    console.log('  Priority: Mistral → Groq → Gemini → OpenRouter');
  },
  
  /**
   * Search for relevant projects using RAG
   */
  async searchRelevantProjects(query, topK = 8, minScore = 0.2) {
    try {
      console.log(`🔍 Searching for relevant projects...`);
      
      const response = await fetch(`${this.API_BASE_URL}/pinecone/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          topK,
          filter: {}  // Empty filter, can be expanded later
        })
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Backend returns { matches: [...] }
      if (data.matches && data.matches.length > 0) {
        // Filter by minimum score AND exclude metadata-only documents
        const filteredMatches = data.matches.filter(match => {
          // Exclude the document count record
          if (match.id && match.id.includes('document_count')) return false;
          
          // Only include if score is high enough
          return (match.score || 0) >= minScore;
        });
        
        if (filteredMatches.length > 0) {
          console.log(`✓ Found ${filteredMatches.length} relevant projects for context (score >= ${minScore})`);
          
          // Format for AI context with full abstract extraction
          return filteredMatches.map(match => {
            let abstract = match.abstract || '';
            const text = match.text || '';
            
            // If abstract field is missing or empty, extract from text if present
            if (!abstract && text) {
              const abstractMatch = text.match(/Abstract:\s*([^]*?)(?=(?:\s*(?:Keywords|Adviser|Authors|Key Findings|Program):|\n\n|\*$|$))/i);
              if (abstractMatch && abstractMatch[1]) {
                abstract = abstractMatch[1].trim();
              } else {
                abstract = text;
              }
            }

            let authors = match.authors || '';
            if (!authors && text) {
              const authorsMatch = text.match(/Authors?:\s*([^]*?)(?=(?:\s*(?:Abstract|Keywords|Adviser|Key Findings|Program):|\n\n|\*$|$))/i);
              if (authorsMatch) authors = authorsMatch[1].trim();
            }

            let adviser = match.adviser || '';
            if (!adviser && text) {
              const adviserMatch = text.match(/Adviser:\s*([^]*?)(?=(?:\s*(?:Abstract|Keywords|Authors|Key Findings|Program):|\n\n|\*$|$))/i);
              if (adviserMatch) adviser = adviserMatch[1].trim();
            }

            let keywords = match.keywords || '';
            if (!keywords && text) {
              const kwMatch = text.match(/Keywords?:\s*([^]*?)(?=(?:\s*(?:Abstract|Adviser|Authors|Key Findings|Program):|\n\n|\*$|$))/i);
              if (kwMatch) keywords = kwMatch[1].trim();
            }

            return {
              id: match.id,
              score: match.score,
              title: match.title || 'Untitled',
              abstract: abstract,
              fullText: text || abstract,
              authors: authors,
              year: match.year || '',
              program: match.program || '',
              adviser: adviser,
              keywords: keywords
            };
          });
        }
      }
      
      console.log('ℹ️ No relevant projects found');
      return [];
      
    } catch (error) {
      console.error('❌ RAG search error:', error);
      return [];
    }
  },
  
  /**
   * Send message to AI with RAG context and 4-tier fallback
   */
  async sendMessage(userMessage) {
    try {
      // Step 1: Search for relevant projects
      const relevantProjects = await this.searchRelevantProjects(userMessage, 8, 0.2);
      
      // Step 2: Send to AI with context
      console.log(`💬 Sending message to AI with ${relevantProjects.length} projects context`);
      
      const response = await fetch(`${this.API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: this.conversationHistory,
          relevantProjects: relevantProjects
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 503) {
          // All providers failed
          return {
            success: false,
            error: 'All AI providers are currently busy. Please try again in a moment.',
            fallbackMessage: errorData.fallbackMessage
          };
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Update conversation history
        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: data.response }
        );
        
        // Keep only last 10 messages to prevent context overflow
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }
        
        console.log(`✓ AI responded via ${data.provider} (attempt ${data.attemptNumber})`);
        
        return {
          success: true,
          response: data.response,
          provider: data.provider,
          providerKey: data.providerKey,
          attemptNumber: data.attemptNumber,
          projectsUsed: data.projectsUsed,
          relevantProjects: relevantProjects
        };
      }
      
      throw new Error('Invalid response from server');
      
    } catch (error) {
      console.error('❌ AI Service error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get AI response'
      };
    }
  },
  
  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
    console.log('✓ Conversation history cleared');
  },
  
  /**
   * Get current conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  },
  
  /**
   * Check service health
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.API_BASE_URL}/health`);
      const data = await response.json();
      
      console.log('🏥 Health Check:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
};

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    AIService.initialize();
  });
}

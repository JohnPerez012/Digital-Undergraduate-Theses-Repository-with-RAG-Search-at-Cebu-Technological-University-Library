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
              const abstractMatch = text.match(/Abstract:\s*([^]*?)(?=(?:\s*(?:Keywords|Adviser|Authors|Program):|\n\n|\*$|$))/i);
              if (abstractMatch && abstractMatch[1]) {
                abstract = abstractMatch[1].trim();
              } else {
                abstract = text;
              }
            }

            let authors = match.authors || '';
            if (!authors && text) {
              const authorsMatch = text.match(/Authors?:\s*([^]*?)(?=(?:\s*(?:Abstract|Keywords|Adviser|Program):|\n\n|\*$|$))/i);
              if (authorsMatch) authors = authorsMatch[1].trim();
            }

            let adviser = match.adviser || '';
            if (!adviser && text) {
              const adviserMatch = text.match(/Adviser:\s*([^]*?)(?=(?:\s*(?:Abstract|Keywords|Authors|Program):|\n\n|\*$|$))/i);
              if (adviserMatch) adviser = adviserMatch[1].trim();
            }

            let keywords = match.keywords || '';
            if (!keywords && text) {
              const kwMatch = text.match(/Keywords?:\s*([^]*?)(?=(?:\s*(?:Abstract|Adviser|Authors|Program):|\n\n|\*$|$))/i);
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
   * Send message to AI with RAG context and real-time response streaming (word-by-word)
   * @param {string} userMessage - Message from user
   * @param {Object} callbacks - { onStart, onToken, onDone, onError }
   */
  async sendMessageStream(userMessage, callbacks = {}) {
    const { onStart, onToken, onDone, onError } = callbacks;

    try {
      // Step 1: Search for relevant projects using Pinecone RAG
      const relevantProjects = await this.searchRelevantProjects(userMessage, 8, 0.2);
      
      console.log(`💬 Streaming message to AI with ${relevantProjects.length} projects context`);
      
      // Step 2: Send request with stream: true
      const response = await fetch(`${this.API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: this.conversationHistory,
          relevantProjects: relevantProjects,
          stream: true
        })
      });
      
      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.fallbackMessage || errorData.error || errorMsg;
        } catch (e) {
          const rawText = await response.text().catch(() => '');
          if (rawText) errorMsg = rawText;
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by this browser/network response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      let providerInfo = { provider: 'AI', providerKey: 'ai', attemptNumber: 1 };
      let isCompleted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep partial trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            isCompleted = true;
            break;
          }

          try {
            const data = JSON.parse(dataStr);

            if (data.type === 'start') {
              providerInfo = {
                provider: data.provider || 'AI',
                providerKey: data.providerKey || 'ai',
                attemptNumber: data.attemptNumber || 1
              };
              if (typeof onStart === 'function') {
                onStart(providerInfo);
              }
            } else if (data.type === 'token') {
              accumulatedText += data.content;
              if (typeof onToken === 'function') {
                onToken(data.content, accumulatedText, providerInfo);
              }
            } else if (data.type === 'done') {
              isCompleted = true;
              const finalResult = {
                success: true,
                response: data.fullResponse || accumulatedText,
                provider: data.provider || providerInfo.provider,
                providerKey: data.providerKey || providerInfo.providerKey,
                attemptNumber: data.attemptNumber || providerInfo.attemptNumber,
                projectsUsed: relevantProjects.length,
                relevantProjects: relevantProjects
              };

              // Update conversation history
              this.conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: finalResult.response }
              );

              // Keep only last 20 messages (10 turns) to prevent context overflow
              if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
              }

              console.log(`✓ AI response streaming finished via ${finalResult.provider}`);

              if (typeof onDone === 'function') {
                onDone(finalResult);
              }
              return finalResult;
            } else if (data.type === 'error') {
              throw new Error(data.error || 'AI provider streaming failed');
            }
          } catch (jsonErr) {
            if (jsonErr.message && !jsonErr.message.includes('JSON')) {
              throw jsonErr;
            }
          }
        }
      }

      // Stream closed naturally without explicit 'done' event
      const finalResult = {
        success: true,
        response: accumulatedText,
        provider: providerInfo.provider,
        providerKey: providerInfo.providerKey,
        attemptNumber: providerInfo.attemptNumber,
        projectsUsed: relevantProjects.length,
        relevantProjects: relevantProjects
      };

      if (accumulatedText) {
        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: accumulatedText }
        );
        if (this.conversationHistory.length > 20) {
          this.conversationHistory = this.conversationHistory.slice(-20);
        }
      }

      if (typeof onDone === 'function') {
        onDone(finalResult);
      }
      return finalResult;

    } catch (error) {
      console.error('❌ AI Service streaming error:', error);
      if (typeof onError === 'function') {
        onError(error);
      }
      return {
        success: false,
        error: error.message || 'Failed to get AI streaming response'
      };
    }
  },

  /**
   * Send message to AI (wrapper that supports both streaming and non-streaming)
   */
  async sendMessage(userMessage) {
    return this.sendMessageStream(userMessage);
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

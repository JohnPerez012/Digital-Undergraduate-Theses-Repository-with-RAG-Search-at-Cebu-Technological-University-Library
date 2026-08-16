/**
 * RAG Service (Retrieval-Augmented Generation)
 * Connects Pinecone semantic search for intelligent search results
 * Adapted for RE-CAPS home page search functionality
 */
const RAGService = {
  backendUrl: window.location.hostname === 'localhost' 
    ? 'http://localhost:3001'
    : 'https://recap-backend-jy5b.onrender.com',

  // Minimum relevance score (0.0 to 1.0)
  // 0.3 = 30% (shows more results, may include less relevant)
  // 0.5 = 50% (balanced)
  // 0.7 = 70% (strict - only highly relevant results) ⭐ RECOMMENDED
  // 0.8 = 80% (very strict, only near-perfect matches)
  MIN_RELEVANCE_SCORE: 0.8,  
  topKvalue: 5,
  /**
   * Search Pinecone for relevant projects (Retrieval step)
   */
  async searchProjects(query, topK = topKvalue, filters = {}) {
    try {
      console.log(`🔍 RAG: Searching Pinecone for "${query}"...`);
      
      const response = await fetch(`${this.backendUrl}/api/pinecone/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          topK: topK,
          filter: filters
        })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      const matches = data.matches || [];
      
      console.log(`✓ Found ${matches.length} relevant projects from Pinecone`);
      
      // Log all scores for debugging (show full picture)
      if (matches.length > 0) {
        console.log('📊 All scores:', matches.map((m, i) => ({
          rank: i + 1,
          title: m.title?.substring(0, 40) + '...',
          score: (m.score * 100).toFixed(1) + '%'
        })));
      }
      
      return matches;
      
    } catch (error) {
      console.error('❌ Pinecone search error:', error);
      return [];
    }
  },

  /**
   * Filter results by minimum relevance score
   */
  filterByRelevance(matches, minScore = null) {
    const threshold = minScore !== null ? minScore : this.MIN_RELEVANCE_SCORE;
    const filtered = matches.filter(m => (m.score || 0) >= threshold);
    const percentage = (threshold * 100).toFixed(0);
    
    console.log(`✅ ${filtered.length}/${matches.length} results above ${percentage}% relevance (filtered ${matches.length - filtered.length} low-relevance results)`);
    
    if (filtered.length > 0) {
      console.log('🎯 Top results:', filtered.slice(0, 3).map(m => ({
        title: m.title?.substring(0, 50) + '...',
        relevance: (m.score * 100).toFixed(1) + '%'
      })));
    }
    
    return filtered;
  },

  /**
   * Transform Pinecone matches to project format
   */
  transformToProjects(matches) {
    return matches.map(match => {
      let abstract = match.abstract || '';
      const text = match.text || '';
      if (!abstract && text) {
        const abstractMatch = text.match(/Abstract:\s*([^]*?)(?=(?:\s*(?:Keywords|Adviser|Authors|Program):|\n\n|\*$|$))/i);
        if (abstractMatch && abstractMatch[1]) {
          abstract = abstractMatch[1].trim();
        } else {
          abstract = text;
        }
      }
      return {
        id: match.id,
        title: match.title || 'Untitled Project',
        abstract: abstract || 'No abstract available',
        year: match.year || 'N/A',
        program: match.program || 'Unknown Program',
        adviser: match.adviser || 'Unknown Adviser',
        authors: match.authors ? (Array.isArray(match.authors) ? match.authors : match.authors.split(', ')) : ['Unknown Author'],
        keywords: match.keywords ? (Array.isArray(match.keywords) ? match.keywords : match.keywords.split(', ')) : [],
        relevanceScore: match.score || 0
      };
    });
  },

  /**
   * Main RAG search function with improved filtering
   */
  async search(query, options = {}) {
    const {
      topK = 50,
      minRelevanceScore = null,  // Use default if not specified
      filters = {}
    } = options;

    console.log('🧠 RAG: Starting semantic search...');
    
    // Step 1: Retrieve relevant projects from Pinecone
    const matches = await this.searchProjects(query, topK, filters);
    
    if (matches.length === 0) {
      console.log('ℹ️ No matches found from Pinecone');
      return {
        projects: [],
        hasResults: false,
        totalMatches: 0,
        filteredCount: 0
      };
    }
    
    // Step 2: Filter by minimum relevance score
    const relevantMatches = this.filterByRelevance(matches, minRelevanceScore);
    
    // Step 3: Transform to project format
    const projects = this.transformToProjects(relevantMatches);
    
    console.log('✓ RAG: Search complete');
    
    return {
      projects: projects,
      hasResults: projects.length > 0,
      totalMatches: matches.length,
      filteredCount: projects.length,
      allMatches: matches  // Include all matches for fallback/analysis
    };
  },

  /**
   * Quick health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.backendUrl}/api/health`);
      const isHealthy = response.ok;
      if (isHealthy) {
        console.log('✓ RAG backend is healthy');
      } else {
        console.warn('⚠️ RAG backend health check failed');
      }
      return isHealthy;
    } catch (error) {
      console.error('❌ RAG backend health check failed:', error);
      return false;
    }
  },

  /**
   * Update minimum relevance score dynamically
   */
  setMinRelevanceScore(score) {
    if (score >= 0 && score <= 1) {
      this.MIN_RELEVANCE_SCORE = score;
      console.log(`✓ Min relevance score updated to ${(score * 100).toFixed(0)}%`);
    } else {
      console.warn('Invalid relevance score. Must be between 0 and 1.');
    }
  }
};

console.log(RAGService.MIN_RELEVANCE_SCORE);
console.log(RAGService.topKvalue);

// Make available globally
window.RAGService = RAGService;

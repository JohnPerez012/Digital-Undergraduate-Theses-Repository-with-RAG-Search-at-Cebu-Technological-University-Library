const express = require('express');
const cors = require('cors');
require('dotenv').config();

const admin = require('firebase-admin');
const { Pinecone } = require('@pinecone-database/pinecone');

// Initialize Firebase Admin
// Check if running in production (Railway/Render) or local
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Production: Use JSON string from environment variable
  console.log('Using Firebase credentials from environment variable');
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  // Local: Use file path
  console.log('Using Firebase credentials from file:', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  console.error('❌ ERROR: No Firebase credentials found!');
  console.error('Set either FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
  process.exit(1);
}
const db = admin.firestore();

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

// Get the index (serverless - no need to specify environment)
const index = pinecone.index('recaps-projects-search', process.env.PINECONE_INDEX_HOST);

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// ENDPOINT: Upsert project to Pinecone
// ============================================
app.post('/api/pinecone/upsert', async (req, res) => {
  try {
    const { projectId } = req.body;
    
    // Fetch project from Firestore
    const doc = await db.collection('projects').doc(projectId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const data = doc.data();
    
    // Verify text field exists
    if (!data.text) {
      return res.status(400).json({ 
        error: 'Text field missing. Ensure EMBD fields are populated.' 
      });
    }
    
    // Prepare record for Pinecone Inference API
    // For serverless inference, we need to use the 'data' format
    const records = [{
      id: projectId,
      data: {
        text: data.text  // Pinecone will generate embeddings from this text field
      },
      metadata: {
        title: data.title,
        abstract: data.abstract,
        adviser: data.adviser,
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        authors: Array.isArray(data.authors) ? data.authors : [],
        program: data.program,
        year: data.year
      }
    }];
    
    // Upsert to Pinecone with Inference API format
    await index.upsert(records);
    
    console.log('✓ Project upserted to Pinecone:', projectId);
    res.json({ success: true, projectId });
    
  } catch (error) {
    console.error('Error upserting to Pinecone:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT: Search Pinecone
// ============================================
app.post('/api/pinecone/search', async (req, res) => {
  try {
    const { query, topK = 10, filter = {} } = req.body;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Build metadata filter if provided
    const metadataFilter = {};
    if (filter.year) metadataFilter.year = { $eq: filter.year };
    if (filter.program) metadataFilter.program = { $eq: filter.program };
    
    // Query Pinecone with Inference API
    // Pinecone automatically generates embeddings from the query text
    const results = await index.query({
      topK,
      includeMetadata: true,
      data: [{ text: query }],  // Inference API uses 'data' with 'text' field
      filter: Object.keys(metadataFilter).length > 0 ? metadataFilter : undefined
    });
    
    console.log(`✓ Found ${results.matches?.length || 0} results for: "${query}"`);
    
    // Transform results for frontend
    const matches = results.matches.map(match => ({
      id: match.id,
      score: match.score,
      ...match.metadata
    }));
    
    res.json({ matches });
    
  } catch (error) {
    console.error('Error searching Pinecone:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT: Delete from Pinecone
// ============================================
app.delete('/api/pinecone/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    await index.deleteOne(projectId);
    
    console.log('✓ Project deleted from Pinecone:', projectId);
    res.json({ success: true, projectId });
    
  } catch (error) {
    console.error('Error deleting from Pinecone:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT: Batch migrate existing data
// ============================================
app.post('/api/pinecone/migrate', async (req, res) => {
  try {
    const snapshot = await db.collection('projects').get();
    const projects = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.text) {  // Only migrate projects with text field
        projects.push({ id: doc.id, ...data });
      }
    });
    
    if (projects.length === 0) {
      return res.json({ 
        success: true, 
        migrated: 0, 
        message: 'No projects with text field found' 
      });
    }
    
    console.log(`Starting migration of ${projects.length} projects...`);
    
    // Process in batches of 100 (Pinecone recommendation)
    const batchSize = 100;
    let totalMigrated = 0;
    
    for (let i = 0; i < projects.length; i += batchSize) {
      const batch = projects.slice(i, i + batchSize);
      
      // Prepare records for Pinecone Inference API
      const records = batch.map(project => ({
        id: project.id,
        data: {
          text: project.text  // Pinecone generates embeddings from this
        },
        metadata: {
          title: project.title,
          abstract: project.abstract,
          adviser: project.adviser,
          keywords: Array.isArray(project.keywords) ? project.keywords : [],
          authors: Array.isArray(project.authors) ? project.authors : [],
          program: project.program,
          year: project.year
        }
      }));
      
      // Upsert batch to Pinecone
      await index.upsert(records);
      
      totalMigrated += batch.length;
      console.log(`✓ Batch ${Math.floor(i / batchSize) + 1} completed (${totalMigrated}/${projects.length})`);
    }
    
    console.log(`✓ Migration complete: ${totalMigrated} projects`);
    res.json({ 
      success: true, 
      migrated: totalMigrated,
      total: projects.length 
    });
    
  } catch (error) {
    console.error('Error migrating data:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT: Health check
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'RECAP Pinecone Backend',
    pineconeIndex: 'recaps-projects-search'
  });
});

// Start server
app.listen(process.env.PORT, () => {
  console.log(`✓ Server running on port ${process.env.PORT}`);
  console.log(`✓ Pinecone index: recaps-projects-search`);
  console.log(`✓ Using Inference API (automatic embeddings)`);
});

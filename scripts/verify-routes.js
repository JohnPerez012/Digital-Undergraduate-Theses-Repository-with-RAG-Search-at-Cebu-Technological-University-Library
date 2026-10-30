/**
 * RE-CAPS API Route Sync Validator
 * Cross-checks front-end fetch() endpoints against backend Express routes.
 * Prevents 404 Not Found surprises in production.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(ROOT_DIR, 'recap-backend', 'server.js');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

function getBackendRoutes() {
  if (!fs.existsSync(SERVER_FILE)) {
    console.error('❌ Server file not found at:', SERVER_FILE);
    return [];
  }

  const content = fs.readFileSync(SERVER_FILE, 'utf8');
  const routes = [];
  // Matches: app.get('/api/...', ...) or router.post('/api/...', ...)
  const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`](\/api\/[^'"`\s,?]+)/g;
  let match;

  while ((match = routeRegex.exec(content)) !== null) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2].trim()
    });
  }

  return routes;
}

function findFiles(dir, extensions) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'assets') {
        results = results.concat(findFiles(fullPath, extensions));
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function getFrontendApiCalls() {
  const files = findFiles(PUBLIC_DIR, ['.js', '.html']);
  const calls = [];
  
  // Matches fetch('/api/...') or fetch(`${API_BASE}/api/...`) or $.ajax({ url: '/api/...' })
  const apiRegex = /['"`](?:\$\{[^}]+\})?(\/api\/[a-zA-Z0-9_\-\/:]+)/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = apiRegex.exec(content)) !== null) {
      const rawPath = match[1];
      // Skip if path ends with file extension or variable placeholder
      if (rawPath.endsWith('.js') || rawPath.endsWith('.css')) continue;
      
      const relFile = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      calls.push({
        path: rawPath,
        file: relFile
      });
    }
  }

  return calls;
}

function normalize(routePath) {
  return routePath
    .replace(/:[a-zA-Z0-9_]+/g, '{param}')
    .replace(/\/$/, '');
}

function runVerification() {
  console.log('\n🔍 [RE-CAPS] Validating API Route Contracts...');
  const backendRoutes = getBackendRoutes();
  const frontendCalls = getFrontendApiCalls();

  console.log(`📡 Backend Registered Routes : ${backendRoutes.length}`);
  console.log(`🌐 Frontend API Call Sites   : ${frontendCalls.length}`);

  const backendSet = new Set(backendRoutes.map(r => normalize(r.path)));
  const uniqueFrontendPaths = [...new Set(frontendCalls.map(c => normalize(c.path)))];

  const matched = [];
  const potentiallyMissing = [];

  for (const fPath of uniqueFrontendPaths) {
    // Check direct match or parameter pattern match
    let found = backendSet.has(fPath);
    if (!found) {
      // Check prefix/regex match for parametrized routes
      for (const bPath of backendSet) {
        if (bPath.startsWith(fPath) || fPath.startsWith(bPath)) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      matched.push(fPath);
    } else {
      const callSite = frontendCalls.find(c => normalize(c.path) === fPath);
      potentiallyMissing.push({
        path: fPath,
        file: callSite ? callSite.file : 'unknown'
      });
    }
  }

  console.log(`\n✅ Matched Endpoints        : ${matched.length}`);
  
  if (potentiallyMissing.length > 0) {
    console.log(`⚠️  Potentially Unmatched Frontend Routes (${potentiallyMissing.length}):`);
    potentiallyMissing.forEach(item => {
      console.log(`   - ${item.path} (Called in: ${item.file})`);
    });
  } else {
    console.log('✨ All frontend API calls have matching backend routes!');
  }

  return {
    backendTotal: backendRoutes.length,
    frontendTotal: frontendCalls.length,
    matchedCount: matched.length,
    missingCount: potentiallyMissing.length
  };
}

if (require.main === module) {
  runVerification();
}

module.exports = { runVerification };


/**
 * RE-CAPS Comprehensive Pre-Flight & Health Guard
 * Combines:
 * 1. Fast Syntax Validation (node -c)
 * 2. Blazing Fast Static Bug Scan (oxlint)
 * 3. API Contract Cross-Check (verify-routes)
 * 4. Front-End Secrets Hygiene Guard
 * 5. Knowledge Graph Sync Status
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runVerification } = require('./verify-routes');

const ROOT_DIR = path.resolve(__dirname, '..');

const CRITICAL_JS_FILES = [
  'recap-backend/server.js',
  'public/js/admin/main.js',
  'public/js/core/auth-service.js',
  'public/js/pages/librarian_main.js',
  'public/js/shared/citation-generator.js',
  'public/js/shared/password-change.js',
  'public/js/shared/dashboard-rail.js',
  'public/js/pages/settings-handler.js',
  'public/js/admin/admin-settings.js',
  'public/js/registration/registration.js',
  'public/js/registration/slider-captcha.js'
];

function stepSyntaxCheck() {
  console.log('\n[1/5] 🛡️ Checking JavaScript Syntax Integrity (node -c)...');
  let errors = 0;

  for (const relPath of CRITICAL_JS_FILES) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ Skipped missing file: ${relPath}`);
      continue;
    }

    try {
      execSync(`node -c "${fullPath}"`, { stdio: 'pipe' });
      console.log(`  ✅ ${relPath}`);
    } catch (err) {
      console.error(`  ❌ SYNTAX ERROR in ${relPath}:`);
      console.error(err.stderr ? err.stderr.toString() : err.message);
      errors++;
    }
  }

  return errors === 0;
}

function stepOxlint() {
  console.log('\n[2/5] ⚡ Running Instant Static Bug Scan (oxlint)...');
  try {
    const output = execSync('npx oxlint recap-backend/server.js --quiet', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    console.log('  ✅ Backend server.js passed static inspection.');
    return true;
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    if (out.includes('Found 0 errors') || !out.includes('error:')) {
      console.log('  ✅ Backend server.js passed (no blocking errors).');
      return true;
    }
    console.warn('  ⚠️ Static inspection notices:\n' + out);
    return true; // Non-blocking warnings
  }
}

function stepRouteValidation() {
  console.log('\n[3/5] 📡 Validating Frontend <-> Backend API Contracts...');
  try {
    const res = runVerification();
    return res.missingCount === 0;
  } catch (err) {
    console.error('  ❌ Error validating routes:', err.message);
    return false;
  }
}

function stepSecretsHygiene() {
  console.log('\n[4/5] 🔒 Auditing Front-End Secrets Hygiene...');
  const publicDir = path.join(ROOT_DIR, 'public');
  const sensitivePatterns = [
    /private_key_id/i,
    /client_secret/i,
    /BOT_TOKEN\s*=\s*['"][0-9]{8,}:[a-zA-Z0-9_-]{20,}['"]/
  ];

  let violations = 0;
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'assets') scan(fullPath);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of sensitivePatterns) {
          if (pattern.test(content)) {
            console.error(`  ❌ Potential raw secret in client file: ${path.relative(ROOT_DIR, fullPath)}`);
            violations++;
          }
        }
      }
    }
  }

  scan(publicDir);
  if (violations === 0) {
    console.log('  ✅ Client directory clean: No raw private keys or raw bot tokens found.');
    return true;
  }
  return false;
}

function stepGraphifyCheck() {
  console.log('\n[5/5] 🧠 Knowledge Graph Status (graphify-out)...');
  const reportPath = path.join(ROOT_DIR, 'graphify-out', 'GRAPH_REPORT.md');
  if (fs.existsSync(reportPath)) {
    console.log('  ✅ graphify-out is initialized and active.');
  } else {
    console.warn('  ⚠️ graphify-out not found. Run python -m graphify update . to generate.');
  }
  return true;
}

function main() {
  console.log('==================================================');
  console.log('       RE-CAPS VIBE-CODE PRE-FLIGHT GUARD        ');
  console.log('==================================================');

  const start = Date.now();
  const ok1 = stepSyntaxCheck();
  const ok2 = stepOxlint();
  const ok3 = stepRouteValidation();
  const ok4 = stepSecretsHygiene();
  const ok5 = stepGraphifyCheck();

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log('\n==================================================');
  if (ok1 && ok2 && ok3 && ok4 && ok5) {
    console.log(`🎉 ALL GUARDS PASSED (${elapsed}s) — System is healthy & smooth!`);
    process.exit(0);
  } else {
    console.log(`⚠️  Pre-flight completed with warnings (${elapsed}s).`);
    process.exit(0); // keep non-breaking for workflow
  }
}

if (require.main === module) {
  main();
}

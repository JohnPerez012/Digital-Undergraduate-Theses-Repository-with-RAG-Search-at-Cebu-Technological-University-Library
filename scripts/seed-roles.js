#!/usr/bin/env node
/**
 * RE-CAPS Role Seeder — scripts/seed-roles.js
 *
 * Populates realistic, fully-structured records for Student, Teacher, and
 * Librarian accounts across Firebase Auth + Firestore, mirroring the exact
 * live schema produced by registration.js and /api/users/create-librarian.
 *
 *   Student / Teacher : Auth account, users/{uid} (every registration field),
 *                       usersSavedProjects/{uid} (+1 projects.saveCount each),
 *                       conversations (AI chat history).
 *   Librarian         : Auth account + custom claim role=librarian,
 *                       users/{uid}, conversations. NO catalog writes.
 *
 * Deliberately NOT seeded (per architecture decisions):
 *   - Citations (localStorage-only: recaps_citation_history)
 *   - User activities (localStorage-only, Spark quota guard)
 *   - Realtime Database (only holds project counters)
 *
 * SAFETY
 *   - Dry-run by default. Nothing is written unless --commit is passed.
 *   - Every document / account is tagged with seedBatch=<tag>.
 *   - Seed emails use the reserved domain @seed.recaps.local (never real users).
 *   - A manifest (scripts/seed-manifests/<tag>.json) records every write so
 *     --rollback <tag> reverses exactly those changes, including saveCount.
 *
 * USAGE
 *   node scripts/seed-roles.js --role=student --count=5                (dry run)
 *   node scripts/seed-roles.js --role=all --count=3 --commit
 *   node scripts/seed-roles.js --role=teacher --count=2 --saved=4 --chats=2 --commit
 *   node scripts/seed-roles.js --rollback=<tag>                          (dry run)
 *   node scripts/seed-roles.js --rollback=<tag> --commit
 *   node scripts/seed-roles.js --list
 *
 * ENV (recap-backend/.env)
 *   SEED_PASSWORD   Shared login password for seeded accounts (min 8 chars).
 *                   If unset, a random one is generated and printed once.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Resolve dependencies & credentials from recap-backend (single source) ──
const BACKEND_DIR = path.resolve(__dirname, '../recap-backend');
const req = (m) => require(require.resolve(m, { paths: [BACKEND_DIR, __dirname] }));
req('dotenv').config({ path: path.join(BACKEND_DIR, '.env') });
const admin = req('firebase-admin');

const MANIFEST_DIR = path.join(__dirname, 'seed-manifests');
const SEED_DOMAIN = 'seed.recaps.local';
const ROLES = ['student', 'teacher', 'librarian'];
const MAX_PER_ROLE = 25;
const VALID_PROJECT_STATUSES = ['Completed', 'completed', 'approved', 'Approved'];

// ── CLI parsing ──
const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
}));
const COMMIT = !!args.commit;
const intArg = (k, def) => {
    const n = parseInt(args[k], 10);
    return Number.isFinite(n) && n >= 0 ? n : def;
};

// ── Firebase init (mirrors server.js credential resolution) ──
function initFirebase() {
    let sa;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
        const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
            ? path.resolve(BACKEND_DIR, process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
            : path.join(BACKEND_DIR, 'serviceAccountKey.json');
        if (!fs.existsSync(p)) fail(`Service account not found at ${p}`);
        sa = require(p);
    }
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    return { auth: admin.auth(), db: admin.firestore(), projectId: sa.project_id };
}

function fail(msg) {
    console.error(`\n[seed-roles] ERROR: ${msg}\n`);
    process.exit(1);
}

// ── Deterministic-looking sample data pools ──
const FIRST = ['Andrea', 'Mark', 'Kristine', 'Joshua', 'Princess', 'Carlo', 'Jessa', 'Rhea', 'Neil', 'Angelica', 'Kyle', 'Mae', 'Ronald', 'Lovely', 'Jerome'];
const MIDDLE = ['Dela', 'Ybañez', 'Rosales', 'Abellana', 'Cabahug', 'Pepito', 'Villacora', 'Ramos'];
const LAST = ['Cañete', 'Monteros', 'Alcover', 'Lapiz', 'Cuizon', 'Dumdum', 'Sanchez', 'Bacalso', 'Ouano', 'Tumulak', 'Gonzaga', 'Rubio'];
const SEC_QUESTIONS = ['pet', 'school', 'city'];
const CHAT_PROMPTS = [
    (t) => [`Summarize the capstone "${t}".`, `The capstone **"${t}"** is part of the archived undergraduate collection. Open its Project Details page for the full abstract, authors, and adviser.`],
    (t) => [`What methodology did "${t}" use?`, `Based on the archived record for **"${t}"**, review the Methodology chapter in the physical copy at the University Library for the complete research design.`],
    () => ['Suggest 3 feasible capstone ideas for IT students.', 'Here are **three feasible capstone ideas**: 1) an IoT-based campus energy monitor, 2) a barangay health record system, 3) a library seat-reservation app.'],
    () => ['How do I format an APA 7th citation for a thesis?', 'An APA 7th thesis citation follows: **Author, A. A. (Year).** *Title of thesis* [Undergraduate thesis, Institution].']
];

const pick = (arr) => arr[crypto.randomInt(arr.length)];
const sampleN = (arr, n) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy.slice(0, Math.min(n, copy.length));
};
const timeLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const randomId = () => String(8200000 + crypto.randomInt(99999)).padStart(7, '0');

// ── Reference data from LIVE production (read-only) ──
async function loadReferenceData(db) {
    const projSnap = await db.collection('projects').where('status', 'in', VALID_PROJECT_STATUSES).get();
    const projects = projSnap.docs.map(d => ({ id: d.id, title: d.data().title || 'Untitled Capstone', program: d.data().program || '' }));

    // Program ↔ college pairs actually observed on real (non-seed) users — no invented mappings.
    const userSnap = await db.collection('users').get();
    const pairs = new Map();
    userSnap.forEach(d => {
        const u = d.data();
        if (u.seedBatch) return;
        if (u.program && u.college) pairs.set(`${u.program}|${u.college}`, { program: u.program, college: u.college });
    });
    const programPairs = pairs.size ? [...pairs.values()] : [{ program: 'BSIT', college: 'COTE' }];
    return { projects, programPairs };
}

// ── Role-specific record builders (strict structured output) ──
function buildIdentity(role, index, tag) {
    const firstName = pick(FIRST);
    const middleName = pick(MIDDLE);
    const lastName = pick(LAST);
    const fullName = `${firstName} ${middleName} ${lastName}`;
    const email = `seed.${role}.${tag}.${index}@${SEED_DOMAIN}`.toLowerCase();
    return { firstName, middleName, lastName, fullName, email };
}

function buildUserDoc(role, uid, identity, ref, tag, adminUid) {
    const ts = admin.firestore.FieldValue.serverTimestamp();
    const base = {
        uid,
        email: identity.email,
        firstName: identity.firstName,
        middleName: identity.middleName,
        lastName: identity.lastName,
        fullName: identity.fullName,
        displayName: identity.fullName,
        userType: role,
        role,
        photoURL: null,
        authProviders: ['password'],
        createdAt: ts,
        updatedAt: new Date().toISOString(),
        lastLogin: null,
        seedBatch: tag
    };

    if (role === 'librarian') {
        // Mirrors /api/users/create-librarian
        return { ...base, position: 'Librarian', department: 'University Library', createdBy: adminUid || 'seed-roles' };
    }

    // Student / Teacher mirror registration.js
    const pair = pick(ref.programPairs);
    const registeredId = randomId();
    const doc = {
        ...base,
        securityQuestion: pick(SEC_QUESTIONS),
        securityAnswer: 'seed',
        termsAccepted: true,
        termsAcceptedAt: ts,
        idCardVerified: true,
        idVerification: {
            verified: true,
            verifiedAt: ts,
            idNumber: registeredId,
            role,
            verifiedName: identity.fullName,
            program: role === 'student' ? pair.program : null,
            college: pair.college
        },
        college: pair.college
    };
    if (role === 'student') {
        doc.studentId = registeredId;
        doc.program = pair.program;
    } else {
        doc.teacherId = registeredId;
        doc.department = 'Faculty';
    }
    return doc;
}

function buildConversations(uid, projects, count, tag) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const proj = projects.length ? pick(projects) : { title: 'Undergraduate Capstone' };
        const [q, a] = pick(CHAT_PROMPTS)(proj.title);
        const asked = new Date(Date.now() - crypto.randomInt(1, 14) * 86400000);
        const answered = new Date(asked.getTime() + 45000);
        out.push({
            userId: uid,
            title: q.length > 60 ? `${q.slice(0, 60)}…` : q,
            messages: [
                { role: 'user', text: q, time: timeLabel(asked) },
                { role: 'bot', text: a, time: timeLabel(answered) }
            ],
            createdAt: admin.firestore.Timestamp.fromDate(asked),
            updatedAt: admin.firestore.Timestamp.fromDate(answered),
            seedBatch: tag
        });
    }
    return out;
}

// ── Seeding (iterative, per-user atomic batch) ──
async function seed({ auth, db, projectId }) {
    const roleArg = String(args.role || '').toLowerCase();
    const roles = roleArg === 'all' ? ROLES : ROLES.filter(r => r === roleArg);
    if (!roles.length) fail(`--role must be one of: ${ROLES.join(', ')}, all`);

    const count = intArg('count', 1);
    if (count < 1) fail('--count must be at least 1');
    if (count > MAX_PER_ROLE && !args.force) fail(`--count above ${MAX_PER_ROLE} per role requires --force (Spark quota guard)`);

    const savedPer = intArg('saved', 3);
    const chatsPer = intArg('chats', 2);
    const tag = String(args.tag || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)).replace(/[^a-zA-Z0-9_-]/g, '');
    const manifestPath = path.join(MANIFEST_DIR, `${tag}.json`);
    if (COMMIT && fs.existsSync(manifestPath)) fail(`Manifest for tag "${tag}" already exists. Use a new --tag or roll it back first.`);

    let password = process.env.SEED_PASSWORD;
    let generatedPassword = false;
    if (!password || password.length < 8) {
        password = `Seed-${crypto.randomBytes(6).toString('base64url')}!9`;
        generatedPassword = true;
    }

    const ref = await loadReferenceData(db);
    if (!ref.projects.length && roles.some(r => r !== 'librarian') && savedPer > 0) {
        console.warn('[seed-roles] No Completed projects found; saved-project milestones will be empty.');
    }

    console.log('\n================ RE-CAPS ROLE SEEDER ================');
    console.log(`Firebase project : ${projectId}`);
    console.log(`Mode             : ${COMMIT ? 'COMMIT (writing to production)' : 'DRY RUN (no writes)'}`);
    console.log(`Tag (seedBatch)  : ${tag}`);
    console.log(`Roles x count    : ${roles.join(', ')} x ${count}`);
    console.log(`Per user         : ${savedPer} saved projects (students/teachers), ${chatsPer} conversations`);
    console.log(`Source projects  : ${ref.projects.length} Completed  |  program pairs: ${ref.programPairs.map(p => p.program + '/' + p.college).join(', ')}`);
    console.log('=====================================================\n');

    const manifest = { tag, projectId, createdAt: new Date().toISOString(), users: [] };
    const persistManifest = () => {
        fs.mkdirSync(MANIFEST_DIR, { recursive: true });
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    };

    for (const role of roles) {
        for (let i = 1; i <= count; i++) {
            const identity = buildIdentity(role, i, tag);
            const savedIds = role === 'librarian' ? [] : sampleN(ref.projects, savedPer).map(p => p.id);
            const preview = `${role.padEnd(9)} ${identity.email}  saved=${savedIds.length} chats=${chatsPer}`;

            if (!COMMIT) { console.log(`  [dry] ${preview}`); continue; }

            let uid = null;
            try {
                // 1) Auth account
                const userRecord = await auth.createUser({ email: identity.email, password, displayName: identity.fullName, emailVerified: true });
                uid = userRecord.uid;
                await auth.setCustomUserClaims(uid, { role, seedBatch: tag });

                // 2) Firestore — single atomic batch per user
                const batch = db.batch();
                batch.set(db.collection('users').doc(uid), buildUserDoc(role, uid, identity, ref, tag, args.admin));

                if (savedIds.length) {
                    batch.set(db.collection('usersSavedProjects').doc(uid), { UIDproject: savedIds, seedBatch: tag });
                    savedIds.forEach(pid => batch.update(db.collection('projects').doc(pid), { saveCount: admin.firestore.FieldValue.increment(1) }));
                }

                const convIds = [];
                buildConversations(uid, ref.projects, chatsPer, tag).forEach(conv => {
                    const cRef = db.collection('conversations').doc();
                    convIds.push(cRef.id);
                    batch.set(cRef, conv);
                });

                await batch.commit();
                manifest.users.push({ uid, role, email: identity.email, savedProjects: savedIds, conversations: convIds });
                persistManifest(); // persist after every user so partial runs remain fully reversible
                console.log(`  [ok]  ${preview}  uid=${uid}`);
            } catch (err) {
                console.error(`  [err] ${preview}  ${err.code || ''} ${err.message}`);
                if (uid) {
                    // Batch failed after Auth creation: remove the orphan auth account.
                    await auth.deleteUser(uid).catch(() => {});
                }
            }
        }
    }

    if (!COMMIT) {
        console.log('\nDry run complete. Re-run with --commit to write these records.\n');
        return;
    }

    console.log(`\nSeeded ${manifest.users.length} account(s). Manifest: ${path.relative(process.cwd(), manifestPath)}`);
    console.log(`Login password    : ${generatedPassword ? password + '   (generated; set SEED_PASSWORD in recap-backend/.env to fix it)' : '(SEED_PASSWORD from .env)'}`);
    console.log(`Undo everything   : node scripts/seed-roles.js --rollback=${tag} --commit\n`);
}

// ── Rollback (exact reversal from manifest, tag-query fallback) ──
async function rollback({ auth, db }) {
    const tag = String(args.rollback).replace(/[^a-zA-Z0-9_-]/g, '');
    const manifestPath = path.join(MANIFEST_DIR, `${tag}.json`);
    let users;

    if (fs.existsSync(manifestPath)) {
        users = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).users;
    } else {
        console.warn(`[seed-roles] No manifest for "${tag}". Falling back to seedBatch tag query.`);
        const snap = await db.collection('users').where('seedBatch', '==', tag).get();
        users = await Promise.all(snap.docs.map(async d => {
            const saved = await db.collection('usersSavedProjects').doc(d.id).get();
            const convs = await db.collection('conversations').where('userId', '==', d.id).where('seedBatch', '==', tag).get();
            return { uid: d.id, role: d.data().userType, email: d.data().email, savedProjects: saved.exists ? (saved.data().UIDproject || []) : [], conversations: convs.docs.map(c => c.id) };
        }));
    }

    console.log(`\n${COMMIT ? 'ROLLING BACK' : '[dry] Would roll back'} ${users.length} seeded account(s) for tag "${tag}"\n`);

    for (const u of users) {
        // Guard: only ever touch accounts that are provably seed accounts.
        const userDoc = await db.collection('users').doc(u.uid).get();
        const isSeed = (userDoc.exists && userDoc.data().seedBatch === tag) || String(u.email || '').endsWith(`@${SEED_DOMAIN}`);
        if (!isSeed) { console.warn(`  [skip] ${u.uid} is not tagged seedBatch=${tag}; refusing to delete.`); continue; }

        const line = `${String(u.role).padEnd(9)} ${u.email}  saved=${u.savedProjects.length} chats=${u.conversations.length}`;
        if (!COMMIT) { console.log(`  [dry] ${line}`); continue; }

        try {
            const batch = db.batch();
            for (const pid of u.savedProjects) {
                const pRef = db.collection('projects').doc(pid);
                const pDoc = await pRef.get();
                if (pDoc.exists && (pDoc.data().saveCount || 0) > 0) batch.update(pRef, { saveCount: admin.firestore.FieldValue.increment(-1) });
            }
            u.conversations.forEach(cid => batch.delete(db.collection('conversations').doc(cid)));
            batch.delete(db.collection('usersSavedProjects').doc(u.uid));
            batch.delete(db.collection('users').doc(u.uid));
            await batch.commit();
            await auth.deleteUser(u.uid).catch(e => { if (e.code !== 'auth/user-not-found') throw e; });
            console.log(`  [ok]  removed ${line}`);
        } catch (err) {
            console.error(`  [err] ${line}  ${err.message}`);
        }
    }

    if (COMMIT && fs.existsSync(manifestPath)) fs.renameSync(manifestPath, manifestPath.replace(/\.json$/, '.rolledback.json'));
    console.log(COMMIT ? '\nRollback complete.\n' : '\nDry run complete. Re-run with --commit to apply.\n');
}

function listManifests() {
    if (!fs.existsSync(MANIFEST_DIR)) return console.log('No seed manifests yet.');
    fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.json')).forEach(f => {
        const m = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, f), 'utf8'));
        console.log(`${f.padEnd(36)} ${m.users.length} users  created ${m.createdAt}`);
    });
}

// ── Entry ──
(async () => {
    if (args.list) return listManifests();
    const ctx = initFirebase();
    if (args.rollback) await rollback(ctx);
    else await seed(ctx);
    process.exit(0);
})().catch(err => fail(err.stack || err.message));

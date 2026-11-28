/**
 * update-staff-copilot-vectors.js
 * Updates and enhances the Pinecone 'recaps-staff-copilot' vector index.
 * Uses multilingual-e5-large (1024 dimensions) embedding.
 */

require('dotenv').config({ path: 'recap-backend/.env' });
const fetch = global.fetch;

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST = process.env.PINECONE_STAFF_COPILOT_HOST || 'recaps-staff-copilot-wf1edxk.svc.aped-4627-b74a.pinecone.io';

if (!PINECONE_API_KEY) {
  console.error('Missing PINECONE_API_KEY in environment');
  process.exit(1);
}

// Chunks to upsert / update
const KNOWLEDGE_CHUNKS = [
  {
    id: 'admin_settings_profile_and_security',
    category: 'system_settings',
    role_scope: ['admin'],
    title: 'Settings Profile Card, Profile Editing, and 2FA Email OTP Password Change',
    landmark: 'Settings Section > Profile Card & Security Card ("Edit Profile Info" / "Change Password")',
    text: `Managing Administrator Profile & Password Security (#section-settings):
[Area: Settings Section > Profile & Security Cards] > [Element: "Edit Profile Info" (#update-profile-btn) & "Change Password" (#change-password-btn)]
1. Open "Settings" in the Sidebar Rail. The sticky left Profile Card displays the administrator's verified institutional email from the Firestore database, with a one-click copy button (#aset-card-copy-email-btn) and quick-jump stat buttons for Holdings (#aset-btn-holdings -> Projects), Pending (#aset-btn-pending -> Approvals), and Users (#aset-btn-users).
2. Click "Edit Profile Info" (#update-profile-btn) to open #admin-profile-modal and update First Name, Last Name, and Department. The primary institutional login email is immutable and readonly.
3. Click "Change Password" (#change-password-btn) to open the institutional security gate: enter Current Password and complete 6-digit OTP verification sent to your linked personal Gmail via Resend (#send-otp-btn).
4. Step 2 requires entering the New Password and Confirm New Password with a live dynamic password policy checklist (8+ characters, uppercase, lowercase, number, special character) and real-time password strength meter (Weak, Moderate, Institutional Grade).
5. Security enforces a strict 3-strike -> 24-hour persistent lockout in Firestore across failed credentials or OTP attempts, with live HH:MM:SS countdown and email security alert dispatch.
Precaution: Administrative accounts must bind a verified personal Gmail under Mandatory 2FA Enrollment before accessing security functions.`
  },
  {
    id: 'staff_copilot_saved_conversations',
    category: 'copilot_governance',
    role_scope: ['admin', 'librarian', 'shared'],
    title: 'Staff Copilot Saved Conversations & 5-Conversation Quota Limit',
    landmark: 'AI Copilot Workspace (#section-copilot) / Floating Copilot Widget > Saved Conversations Drawer (#copilot-history-btn)',
    text: `Staff Copilot Saved Conversations & History Management:
[Area: AI Copilot Workspace (#section-copilot) OR Floating Copilot Widget] > [Element: "Saved Chats" Button (#copilot-history-btn) & "+ New Chat" Button (#copilot-new-chat-btn)]
1. Staff Copilot automatically saves conversations to the repository Firestore database under the /conversations collection, tagged with the staff member's authenticated UID and portal role.
2. Quota Limit: Head Librarian (Admin) and Library Staff (Librarian) accounts have an elevated quota of up to 5 saved conversations (compared to the standard 3-conversation limit for student and faculty accounts).
3. To view past conversations, click "Saved Chats" (#copilot-history-btn) in the Copilot header to open the history drawer. Each conversation displays the initial query title, last updated timestamp, and a delete button (#copilot-delete-conv-btn).
4. To start a fresh conversation thread, click "+ New Chat" (#copilot-new-chat-btn). If the active session already has 5 saved conversations, the system prompts you to delete an older conversation before starting a new one.
5. Deleting a conversation removes the thread from Firestore and frees up one slot within your 5-conversation staff allowance.
Precaution: Deleting a saved conversation is irreversible. Ensure critical institutional procedures or guidance notes are copied before purging.`
  },
  {
    id: 'staff_2fa_gmail_security_mandate',
    category: 'system_security',
    role_scope: ['admin', 'librarian', 'shared'],
    title: 'Mandatory Two-Factor Authentication (2FA) Personal Gmail Enrollment',
    landmark: 'Administrative and Librarian Portals > Mandatory 2FA Modal (#staff-2fa-modal)',
    text: `Institutional Two-Factor Authentication (2FA) Security Mandate:
[Area: Screen Overlay / Security Gate] > [Element: Mandatory 2FA Modal (#staff-2fa-modal)]
1. Under institutional data protection protocols (R.A. 10173), all Administrator and Library Staff accounts are subjected to a continuous background security evaluation daemon (evaluated every 1 second).
2. If a staff account lacks a verified linked personal Gmail address, total interface lockdown is initiated: all sidebar rail tabs, buttons, forms, and background views are blurred and non-clickable, with only the 2FA Enrollment Modal active.
3. Enrollment Procedure: Enter a valid personal Gmail address and click "Send 6-Digit Verification Code". Check your personal inbox for the 6-digit code dispatched via Resend (enforcing a 60-second cooldown timer).
4. Enter the verification code and click "Verify & Unlock Portal". Upon verification, your linked email is committed to Firestore (users/{uid}.linkedEmail and linkedEmailVerified: true), and all repository holdings and tools unlock immediately.
5. Unbinding: If you must change or unbind your linked Gmail, you must enter your current password to request a 6-digit unbind security PIN sent to that Gmail.
Precaution: 3 incorrect code attempts trigger a 24-hour security lockout. Never share verification codes or unbind PINs.`
  },
  {
    id: 'librarian_copilot_usage_and_guidance',
    category: 'copilot_governance',
    role_scope: ['librarian'],
    title: 'Operating the Librarian Staff AI Copilot Workspace & Cataloging Assistant',
    landmark: 'Librarian Sidebar Rail > "Copilot" (#nav-copilot) OR Floating Assistant (#librarian-floating-copilot-btn)',
    text: `Operating the Librarian Staff AI Copilot:
[Area: Librarian AI Copilot Workspace (#section-copilot) OR Floating Assistant Widget] > [Element: Copilot Input (#copilot-input-text) & Quick Action Pills]
1. Open the Copilot workspace from the Librarian Sidebar Rail (#nav-copilot) or click the green floating assistant button in the bottom right (#librarian-floating-copilot-btn).
2. The Librarian Copilot provides operational assistance for:
   - Dewey Decimal Classification (DDC) numbers for BSIT, BSFi, BSHM, BSIE, BEEd, BSEd, BIT, and BTLEd capstones.
   - Accession number sequencing (CTU-YYYY-XXX format).
   - Physical shelf location formatting (Shelf A-Z, Tier 1-5, Section 01-10).
   - Drafting thesis submissions in "+ Add New Project" (#upload-metadata-modal).
   - Checking submission approval statuses (Pending Approval, Approved / Published, Rejected with Feedback).
3. Saved Chats: You can preserve up to 5 multi-turn cataloging discussions by clicking "Saved Chats" (#copilot-history-btn).
4. Role Boundaries: Librarian Copilot is strictly read-only advisory and cannot directly approve submissions, delete catalog records, or purge accounts (these require Head Librarian / Admin authority).
Precaution: Always verify physical shelf space availability before finalizing book shelf labels.`
  }
];

async function getEmbedding(text) {
  const resp = await fetch('https://api.pinecone.io/embed', {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
      'X-Pinecone-Api-Version': '2024-10'
    },
    body: JSON.stringify({
      model: 'multilingual-e5-large',
      parameters: {
        input_type: 'passage',
        truncate: 'END'
      },
      inputs: [{ text }]
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Embedding API failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return data.data[0].values;
}

async function upsertToPinecone(vectors) {
  const url = `https://${PINECONE_HOST}/vectors/upsert`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
      'X-Pinecone-Api-Version': '2025-04'
    },
    body: JSON.stringify({
      vectors,
      namespace: ''
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Pinecone upsert failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

async function run() {
  console.log(`🚀 Starting Vector Database Enhancement for recaps-staff-copilot...`);
  console.log(`Target Host: https://${PINECONE_HOST}`);
  console.log(`Knowledge chunks to process: ${KNOWLEDGE_CHUNKS.length}\n`);

  const vectorsToUpsert = [];

  for (let i = 0; i < KNOWLEDGE_CHUNKS.length; i++) {
    const chunk = KNOWLEDGE_CHUNKS[i];
    console.log(`[${i + 1}/${KNOWLEDGE_CHUNKS.length}] Embedding chunk: "${chunk.title}" (ID: ${chunk.id})...`);
    
    // Combine text with title and category for semantic richness
    const embedInput = `title: ${chunk.title}\ncategory: ${chunk.category}\nlandmark: ${chunk.landmark}\n\n${chunk.text}`;
    const values = await getEmbedding(embedInput);
    console.log(`  ✅ Generated 1024-dim embedding vector.`);

    vectorsToUpsert.push({
      id: chunk.id,
      values,
      metadata: {
        title: chunk.title,
        category: chunk.category,
        landmark: chunk.landmark,
        role_scope: chunk.role_scope,
        text: chunk.text
      }
    });
  }

  console.log(`\n📦 Upserting ${vectorsToUpsert.length} vectors to Pinecone 'recaps-staff-copilot'...`);
  const result = await upsertToPinecone(vectorsToUpsert);
  console.log('✅ Pinecone Upsert Result:', result);
  console.log('\n🎉 Vector Database successfully updated with fresh Staff Copilot knowledge!');
}

run().catch(err => {
  console.error('❌ Error updating vector database:', err);
  process.exit(1);
});

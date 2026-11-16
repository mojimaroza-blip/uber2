// Run locally from the functions folder after setting GOOGLE_APPLICATION_CREDENTIALS
// to a service-account JSON file. Never upload that file to GitHub or Netlify.
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
initializeApp({ credential: cert(serviceAccount) });
(async () => {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: node set-admin.js admin@example.com");
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`Admin access granted to ${email}. Sign out and sign in again.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
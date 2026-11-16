# Village Ride 2.0 — setup guide

This is a starter application for the existing Village Ride GitHub Pages project. It contains separate passenger, driver and administrator pages, Firebase Authentication, Firestore real-time updates, and trusted Cloud Functions for ride state changes.

## Important before launch
This is a working starter/MVP, not a finished commercial Uber replacement. It uses manually entered pickup/destination text and a distance-based fare estimate (R10 base + R3/km). It does not yet provide live GPS tracking, route-based distance calculation, push notifications, online payments, identity-document upload, or in-app chat. Test with dummy accounts first. Verify driver permits, insurance, safety processes, POPIA obligations and local transport rules before carrying passengers commercially.

## A. Create Firebase project
1. Go to https://console.firebase.google.com/ and create a project called Village Ride.
2. In Project settings > General, add a Web app. Register it as `Village Ride Web`.
3. Copy the Firebase web config and paste the values into `firebase-config.js`, replacing every placeholder.
4. In Build > Authentication > Get started > Sign-in method, enable Email/Password.
5. In Build > Firestore Database, create a database. Start in production mode.
6. In Project settings > Your apps, make sure the config's projectId matches the project.

## B. Install Firebase command-line tools and deploy backend
You need Node.js 20 or later and a computer (Windows/Mac/Linux).
1. Install Node.js from https://nodejs.org/
2. Open Terminal / Command Prompt in this project folder.
3. Run:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```
   Select the Firebase project you created.
4. Install the Cloud Functions packages:
   ```bash
   cd functions
   npm install
   cd ..
   ```
5. Upgrade the Firebase project to the Blaze (pay-as-you-go) plan if Firebase requires billing to deploy Cloud Functions. Set budget alerts in Google Cloud Billing. Cloud Functions can incur charges; check current Firebase pricing before deployment.
6. Deploy:
   ```bash
   firebase deploy --only firestore:rules,functions
   ```
   Choose a supported Cloud Functions region close to your users if prompted. Keep the frontend and functions in the same default region or update `getFunctions(app, "REGION")` in app.js to match.

## C. Create the first administrator securely
1. Create your own normal account using the Passenger page first (or create a Firebase Authentication user in the console).
2. In Firebase Console > Authentication > Users, find the exact email address.
3. Create a service account in Firebase project settings > Service accounts. Download its JSON key to a private folder on your computer. Never put it inside the website folder or GitHub repository.
4. Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS` to the full path of that private JSON file.
   - Windows PowerShell: `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\private\service-account.json"`
   - macOS/Linux: `export GOOGLE_APPLICATION_CREDENTIALS="/private/service-account.json"`
5. From the `functions` folder run:
   ```bash
   npm install
   node set-admin.js your-admin-email@example.com
   ```
6. Sign out and back in to the admin page. The account will now have the admin custom claim. Never give admin access to public users.

## D. Run locally
Because the site uses JavaScript modules, do not open the HTML files by double-clicking them. Serve the folder using a local web server. For example, with Python installed:
```bash
python -m http.server 8000
```
Then open http://localhost:8000.

## E. Publish on Netlify
1. Push the project folder to a GitHub repository (do not include any service-account JSON file).
2. Sign in at https://app.netlify.com/ and choose Add new site > Import an existing project.
3. Select the repository. For this static site, set the publish directory to `.` and leave the build command empty.
4. Deploy. Your pages will be available at:
   - `/` — homepage
   - `/passenger.html` — passenger portal
   - `/driver.html` — driver portal
   - `/admin.html` — administrator console
5. Firebase Authentication > Settings > Authorized domains: add your Netlify hostname (for example `your-site.netlify.app`) and `localhost` for local testing.
6. Firebase config is public client configuration, but security comes from Firestore rules and Cloud Functions. Never put service-account credentials in frontend files.

## F. Test the full workflow
1. Create a passenger account at `/passenger.html`.
2. Create a driver account at `/driver.html`.
3. Sign in as the admin at `/admin.html` and approve the driver.
4. Sign in as the driver and switch availability online.
5. Sign in as the passenger and submit a ride request. Enter pickup, destination and estimated kilometres.
6. Driver should see the request and accept it. Passenger sees the accepted status. Driver completes it.
7. Test cancellation before acceptance.
8. Try to access admin with a normal account; it should be denied.

## Current fare estimate
`R10 + (R3 × estimated kilometres)`. This is a configurable example only. Confirm your actual pricing before public launch.

## Files
- `index.html`: marketing homepage
- `passenger.html`: passenger registration, login, booking and ride history
- `driver.html`: driver registration, login, availability, requests and trip completion
- `admin.html`: protected admin login, driver approval and ride overview
- `app.js`: Firebase frontend logic
- `firebase-config.js`: your Firebase web configuration
- `firestore.rules`: database access rules
- `functions/`: trusted backend operations

## Known next upgrades
- Google Maps Places/autocomplete, route distance and live driver location
- FCM push notifications
- secure driver document upload and manual verification workflow
- passenger/driver ratings and support
- payment provider integration
- cancellation policy, trip dispute flow, audit logs and rate limiting
- proper mobile app / PWA packaging and accessibility testing

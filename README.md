# Employee Contract Renewal Evaluation
ระบบประเมินต่อสัญญาจ้างพนักงานออนไลน์ — Nano Mirror Industry Co., Ltd.

## Architecture
- Firebase Authentication (Email/Password)
- Firestore collections: `hrUsers/{uid}`, `contractReviews/{id}`
- Supervisor submits evaluations; HR sees submitted reviews across departments and approves/returns.
- Firebase Hosting serves `public/`.
- This is an initial version: test permission boundaries, reports, and PDF/DOCX layout against the original Word template before production.

## Setup
1. Enable Firebase Authentication Email/Password.
2. Create HR and supervisor users in Authentication.
3. In Firestore Console, create documents `hrUsers/{UID}` with `active: true`, `role: "hr"` or `"supervisor"`, and department (e.g. `"ผลิต"`).
4. Review and deploy `firestore.rules` via Firebase CLI: `firebase deploy --only firestore:rules`.
5. Enable Hosting and deploy: `firebase deploy --only hosting`.
6. Add hosted URL to Firebase Authentication authorized domains if needed.
7. Test with separate HR/supervisor accounts and verify each user's access to reviews.

## Security
Never store employee personal data in this repository. Keep it private. Firebase web API key is client-side configuration, **not** an admin secret. Access control must be enforced by Firestore Rules, not only UI logic.

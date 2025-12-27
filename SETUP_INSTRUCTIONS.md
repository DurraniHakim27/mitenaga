# Quick Setup Instructions

## 1. Update KWTBB Column ✅
Done! The KWTBB column now shows "✅ 1.6%" instead of just "✅ Applies" for all applicable rows.

## 2. Firebase Hybrid Backend Setup

### Step 1: Move Files to Public Folder
Create a `public` folder and move these files:
```
public/
  ├── index.html
  ├── style.css
  └── script.js
```

### Step 2: Install Dependencies
```bash
cd functions
npm install
```

### Step 3: Set API Key
```bash
firebase functions:config:set iot.token="YOUR_SECRET_KEY_HERE"
```
Replace `YOUR_SECRET_KEY_HERE` with a strong random string (e.g., use `openssl rand -hex 32`).

### Step 4: Deploy
```bash
firebase deploy --only functions,hosting,firestore:rules,database
```

### Step 5: Create Firestore Config
In Firebase Console → Firestore Database, create a document:
- Collection: `config`
- Document ID: `billing`
- Fields:
  ```json
  {
    "afaRate": -0.065,
    "billingDay": 1,
    "serviceTaxScope": "all"
  }
  ```

## 3. Test

### Test History Trigger
1. Manually add an entry to `/history` in Firebase Console
2. Check Cloud Functions logs: `firebase functions:log`
3. Verify Firestore collections are updated

### Test Billing
1. Wait for billing day (or set `billingDay` to today)
2. Check `/billing/currentMonth` in RTDB
3. View billing on the website's Billings page

## Files Created

### Configuration
- `firebase.json` - Firebase project configuration
- `.firebaserc` - Firebase project reference
- `firestore.rules` - Firestore security rules
- `database.rules.json` - Realtime Database security rules
- `firestore.indexes.json` - Firestore indexes
- `.gitignore` - Git ignore file

### Cloud Functions
- `functions/package.json` - Node.js dependencies
- `functions/tsconfig.json` - TypeScript configuration
- `functions/src/index.ts` - Main Cloud Functions code
- `functions/src/billingLogic.ts` - Malaysian TNB billing calculation logic

### Documentation
- `DEPLOYMENT.md` - Detailed deployment guide
- `SETUP_INSTRUCTIONS.md` - This file

## What's Changed

### Frontend
1. **Billings Section**: Added "Current Month Bill" card that displays billing breakdown
2. **KWTBB Column**: Updated to show "✅ 1.6%" for all applicable rows
3. **Billing Data Loading**: Automatically loads and displays billing data from RTDB

### Backend
1. **History Aggregation**: `onHistoryCreate` function aggregates usage data
2. **Daily Rollup**: Scheduled function archives daily usage
3. **Monthly Billing**: Scheduled function calculates monthly bill using TNB tariff rules
4. **HTTPS Endpoint**: Optional endpoint for device ingestion with API key

## Next Steps

1. Move HTML/CSS/JS files to `public` folder
2. Deploy functions and hosting
3. Test with your ESP32
4. Monitor Cloud Functions logs
5. Verify billing calculation on billing day

For detailed information, see `DEPLOYMENT.md`.




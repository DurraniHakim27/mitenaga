# Test Billing Setup - Step by Step

## Current Status ✅
- ✅ Frontend deployed (billing card ready)
- ✅ Functions deployed (billing calculation ready)
- ✅ Database rules deployed
- ✅ Frontend code fetches from `/billing/currentMonth.json`

## What You Need to Do Next

### Step 1: Create Firestore Config (REQUIRED)
**Without this, billing won't calculate!**

1. Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
2. Create collection: `config`
3. Create document: `billing`
4. Add fields:
   ```json
   {
     "afaRate": -0.065,
     "billingDay": 1,
     "serviceTaxScope": "all"
   }
   ```

### Step 2: Check Current Usage Data
**To see accumulated usage for this month:**

1. Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
2. Look for collection: `usage_monthly`
3. Check document: `2025-11` (or current month in YYYY-MM format)
4. You should see: `totalKWh` field with accumulated usage

**If no data exists:**
- Your ESP32 needs to send data to `/history`
- The `onHistoryCreate` function will aggregate it automatically
- Check Firebase Console → Realtime Database → `/history` to see if data is coming in

### Step 3: Test Billing Calculation (Manual)
**Option A: Wait for scheduled function**
- The `monthlyBill` function runs daily at 00:05 MYT
- It only calculates on `billingDay` (default: 1st of month)
- For testing, you can trigger it manually

**Option B: Manually trigger billing (for testing)**
1. Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/functions
2. Find function: `monthlyBill`
3. Click "Test" or "Trigger"
4. Or use Firebase CLI (see below)

### Step 4: View Billing on Website
1. Open your hosted website: https://iot-energy-monitoring-sy-1d1a1.web.app (or your hosting URL)
2. Click "Billings" tab
3. You should see "Current Month Bill" card (if billing data exists)
4. If card is hidden, billing data doesn't exist yet

## Quick Test Commands

### Check if usage data exists:
```bash
# Check Realtime Database
# Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
# Look at: /aggregates/monthly/2025-11 (or current month)
```

### Check if billing exists:
```bash
# Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
# Look at: /billing/currentMonth
# Or check Firestore: billing/currentMonth
```

### Manual billing trigger (Firebase CLI):
```bash
# This requires Firebase CLI and authentication
firebase functions:shell
# Then in the shell:
monthlyBill()
```

## Troubleshooting

### "No billing data available" on website
- ✅ Check if Firestore config exists: `config/billing`
- ✅ Check if usage data exists: `usage_monthly/2025-11`
- ✅ Check if billing was calculated: `billing/currentMonth` in RTDB or Firestore
- ✅ Check browser console for errors (F12 → Console)

### Billing card not showing
- The card is hidden by default (`display: none`)
- It only shows when billing data is loaded
- Check browser console for fetch errors

### No usage data accumulating
- Check if ESP32 is sending data to `/history`
- Check if `onHistoryCreate` function is being triggered
- Check Cloud Functions logs for errors

## Expected Data Flow

1. **ESP32** → Sends data to RTDB `/history` and `/latest`
2. **onHistoryCreate** → Aggregates to Firestore `usage_daily/{date}` and `usage_monthly/{month}`
3. **monthlyBill** → Calculates billing from `usage_monthly/{month}` → Writes to `/billing/currentMonth`
4. **Frontend** → Fetches from `/billing/currentMonth.json` → Displays in UI

## Next Steps
1. Create Firestore config document
2. Verify ESP32 is sending data
3. Check usage_monthly collection
4. Trigger billing calculation (manually or wait for schedule)
5. View billing on website






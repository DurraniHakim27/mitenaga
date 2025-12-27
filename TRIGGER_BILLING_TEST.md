# How to Trigger Billing Calculation for Testing

## Method 1: Change billingDay to Today's Date (Easiest)

### Step 1: Go to Firestore Console
1. Open: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
2. Make sure you're in the **Firestore Database** tab (not Realtime Database)

### Step 2: Find the Config Document
1. In the left sidebar, you should see collections
2. Click on the **`config`** collection
3. Click on the **`billing`** document

### Step 3: Edit billingDay Field
1. You should see the document with these fields:
   - `afaRate`: -0.065
   - `billingDay`: 1
   - `serviceTaxScope`: "all"

2. **Click on the `billingDay` field** (click the number `1`)
3. Change the value to **today's date** (e.g., if today is November 9th, change it to `9`)
4. Click **"Update"** or press Enter

### Step 4: Wait for Scheduled Function
- The `monthlyBill` function runs daily at **00:05 MYT** (midnight + 5 minutes)
- If you want to trigger it immediately, use Method 2 below

### Step 5: Check Billing Result
1. Go to Realtime Database: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
2. Check `/billing/currentMonth` - should show billing data
3. Or check Firestore: `billing/currentMonth`

### Step 6: Change billingDay Back
After testing, change `billingDay` back to `1` for production.

---

## Method 2: Manually Trigger Function (Immediate)

### Step 1: Go to Cloud Functions
1. Open: https://console.cloud.google.com/functions/list?project=iot-energy-monitoring-sy-1d1a1
2. Make sure you're in the correct region: **asia-southeast1** (check the region filter at the top)

### Step 2: Find monthlyBill Function
1. Look for the function named **`monthlyBill`**
2. Click on it to open the details

### Step 3: Trigger the Function
1. Click the **"TEST"** tab (or "Trigger" button)
2. You can leave the test data empty `{}`
3. Click **"Test the function"** or **"Trigger"**
4. Wait for it to execute (may take 10-30 seconds)

### Step 4: Check Logs
1. After triggering, check the **"LOGS"** tab
2. You should see messages like:
   - "Calculating bill for month: 2025-11"
   - "Total usage for 2025-11: X.XX kWh"
   - "Billing calculated for 2025-11: RM XX.XX"

### Step 5: Verify Billing Data
1. Go to Realtime Database: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
2. Check `/billing/currentMonth`
3. You should see the billing breakdown with all charges

---

## Method 3: Use Firebase CLI (Advanced)

### Step 1: Open Terminal
```bash
cd C:\Users\User\Downloads\FYP
```

### Step 2: Start Functions Shell
```bash
firebase functions:shell
```

### Step 3: Call the Function
```bash
monthlyBill()
```

### Step 4: Check Results
- Check Firebase Console for billing data
- Or check logs in the terminal

---

## Quick Visual Guide

### Finding Firestore Config:
```
Firebase Console
  └── Firestore Database (left sidebar)
      └── Collections
          └── config (collection)
              └── billing (document)
                  ├── afaRate: -0.065
                  ├── billingDay: 1  ← Change this to today's date
                  └── serviceTaxScope: "all"
```

### Finding Cloud Functions:
```
Google Cloud Console
  └── Cloud Functions
      └── monthlyBill (function)
          └── TEST tab
              └── Click "Test the function"
```

---

## What to Expect

### After Triggering:
1. **In Firestore**: `usage_monthly/2025-11` should have `totalKWh`
2. **In Realtime Database**: `/billing/currentMonth` should have billing data
3. **On Website**: Billings tab should show "Current Month Bill" card with breakdown

### Billing Data Structure:
```json
{
  "month": "2025-11",
  "totalKWh": 123.45,
  "energyCharge": 33.40,
  "capacityCharge": 5.62,
  "networkCharge": 15.86,
  "retailServiceCharge": 10.00,
  "afa": -8.02,
  "eeci": -30.86,
  "kwtbb": 0.42,
  "serviceTax": 2.34,
  "totalPayable": 28.76,
  "meta": { ... }
}
```

---

## Troubleshooting

### "No usage data found for 2025-11"
- Check if `usage_monthly/2025-11` exists in Firestore
- Check if it has `totalKWh` field
- Make sure ESP32 data is being aggregated

### Function times out
- Check if Firestore config exists
- Check if usage data exists
- Check function logs for errors

### Billing shows $0.00
- Check if usage data is correct
- Verify `totalKWh` is not zero
- Check function logs for calculation errors

---

## Important Notes

1. **billingDay** determines when billing runs automatically
   - Default: `1` (1st of each month)
   - For testing: Set to today's date
   - After testing: Change back to `1`

2. **Scheduled Function** runs at 00:05 MYT daily
   - Only calculates if `today === billingDay`
   - Otherwise, it skips

3. **Manual Trigger** works anytime
   - Use Cloud Functions console
   - Or Firebase CLI

4. **Data Requirements**:
   - Firestore config must exist: `config/billing`
   - Usage data must exist: `usage_monthly/{month}`
   - Both are required for billing calculation






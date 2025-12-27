# How to Reset pzem3's Monthly Total

## Option 1: Direct Firestore Edit (Easiest)

1. Go to Firebase Console: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
2. Navigate to: `usage_monthly_pzem` collection
3. Find document: `2025-11_pzem3`
4. Click on the document
5. Edit the `totalKWh` field:
   - Change from: `68.58` (or current value)
   - Change to: `0.06`
6. Click "Update"

## Option 2: Wait for Function Deployment

The `resetPzemMonthlyTotal` function should be available at:
```
https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/resetPzemMonthlyTotal
```

If you get 404, the function might still be deploying. Wait a few minutes and try again.

## Option 3: Use Firebase Console Functions

1. Go to Firebase Console → Functions
2. Find `resetPzemMonthlyTotal`
3. Click "Test" tab
4. Use this JSON:
```json
{
  "pzemId": "pzem3",
  "month": "2025-11",
  "newValue": 0.06
}
```

## Option 4: Manual SQL-like Query (if you have access)

You can also use Firebase Admin SDK or Firestore console to directly update the value.

## After Resetting

1. Go to Reports page on your website
2. Click "🔄 Recalculate Allocation"
3. pzem3 should now show ~0.06 kWh like the others







# Test Billing Calculation - Easy Method

## Problem Identified
The scheduled function `monthlyBill` has a check that only runs on the billing day. Even when manually triggered, it might not work correctly.

## Solution
I've created a new HTTP endpoint `calculateBillingNow` that you can call directly to calculate billing for the current month.

## How to Use

### Method 1: Call the URL Directly (Easiest)

1. **After deploying the function**, you'll get a URL like:
   ```
   https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/calculateBillingNow
   ```

2. **Open this URL in your browser** or use curl:
   ```bash
   curl https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/calculateBillingNow
   ```

3. **You should see** a JSON response with billing data if successful.

### Method 2: Check Function URL After Deployment

1. Go to: https://console.cloud.google.com/functions/list?project=iot-energy-monitoring-sy-1d1a1
2. Region: **asia-southeast1**
3. Find function: **`calculateBillingNow`**
4. Click on it
5. Copy the **Trigger URL**
6. Open it in your browser

### Method 3: Use the Diagnostic Tool

1. Open: `CHECK_BILLING_DATA.html` in your browser
2. It will check if billing data exists
3. If not, you can call the endpoint manually

## Expected Response

### Success:
```json
{
  "success": true,
  "message": "Billing calculated successfully",
  "month": "2025-11",
  "billing": {
    "totalKWh": 0.495,
    "energyCharge": 0.13,
    "capacityCharge": 0.02,
    "networkCharge": 0.06,
    "retailServiceCharge": 0,
    "afa": -0.03,
    "eeci": -1.24,
    "kwtbb": 0,
    "serviceTax": 0,
    "totalPayable": -1.02,
    "month": "2025-11",
    ...
  }
}
```

### Error (No usage data):
```json
{
  "error": "No usage data found",
  "month": "2025-11",
  "message": "Please ensure usage data exists in Firestore: usage_monthly/2025-11"
}
```

## After Calling the Endpoint

1. **Check billing data**:
   - Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
   - Check: `/billing/currentMonth`
   - Should now have billing data!

2. **Refresh your website**:
   - Go to: https://iot-energy-monitoring-sy-1d1a1.web.app/billings
   - The "Current Month Bill" card should now appear!

## Troubleshooting

### "No usage data found"
- Check Firestore: `usage_monthly/2025-11` exists
- Check if it has `totalKWh` field
- Your usage data shows `0.495` kWh, so this should work!

### "Function not found"
- Make sure you deployed the function
- Check the function exists in Cloud Functions console
- Verify the region is `asia-southeast1`

### "Internal server error"
- Check Cloud Functions logs
- Look for error messages
- Verify Firestore config exists







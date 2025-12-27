# How to Check Function Execution Logs

## Step 1: Go to Cloud Functions Logs
1. Open: https://console.cloud.google.com/functions/list?project=iot-energy-monitoring-sy-1d1a1
2. Make sure region is: **asia-southeast1**
3. Click on **`monthlyBill`** function

## Step 2: View Execution Logs
1. Click **"LOGS"** tab
2. Look for the most recent execution (should be when you triggered it)
3. Look for:
   - ✅ "Function execution started"
   - ✅ "Calculating bill for month: 2025-11"
   - ✅ "Total usage for 2025-11: 0.495 kWh"
   - ✅ "Billing calculated for 2025-11: RM XX.XX"
   - ❌ Any red error messages

## Step 3: Filter Logs
1. In the logs filter, type: `monthlyBill`
2. Or look for timestamps around when you triggered it
3. Look for error messages in red

## Common Errors to Look For:
- "No usage data found for 2025-11" → But we know it exists!
- "No billing config found" → But you just created it!
- "Permission denied" → Database rules issue
- "Function execution took too long" → Timeout
- "Error calculating billing" → Calculation error

## What to Share:
Copy and paste the log messages from the function execution, especially:
- Any error messages (red text)
- The last few log lines before it stopped
- Any "Error" or "Exception" messages







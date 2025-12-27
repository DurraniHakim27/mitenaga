# Debug Billing Data Loading Issue

## Step-by-Step Debugging

### Step 1: Check if Billing Data Exists in Database

1. **Go to Realtime Database**:
   - https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
   - Look for: `/billing/currentMonth`
   - **Does it exist?** 
     - ✅ If YES → Go to Step 2
     - ❌ If NO → Go to Step 3

### Step 2: Verify Billing Data Structure

If `/billing/currentMonth` exists, check if it has the required fields:
- `totalKWh` (must exist)
- `totalPayable`
- `month`
- `energyCharge`
- etc.

**If data exists but website doesn't show it:**
- Check browser console (F12 → Console) for errors
- Check Network tab (F12 → Network) for failed requests
- Verify the URL is correct

### Step 3: Check Cloud Functions Logs

1. **Go to Cloud Functions**:
   - https://console.cloud.google.com/functions/list?project=iot-energy-monitoring-sy-1d1a1
   - Region: **asia-southeast1**
   - Click on **`monthlyBill`** function
   - Click **"LOGS"** tab
   - Look for error messages

**Common Errors:**
- "No usage data found for {month}" → No usage data in Firestore
- "No billing config found" → Firestore config doesn't exist
- Function timeout → Function took too long
- Permission denied → Database rules issue

### Step 4: Check Usage Data

1. **Go to Firestore**:
   - https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
   - Check collection: **`usage_monthly`**
   - Look for document: **`2025-11`** (current month in YYYY-MM format)
   - **Does it exist?**
     - ✅ If YES → Check if it has `totalKWh` field
     - ❌ If NO → Usage data hasn't been aggregated yet

### Step 5: Check Firestore Config

1. **Go to Firestore**:
   - Check collection: **`config`**
   - Check document: **`billing`**
   - **Does it exist?**
     - ✅ If YES → Verify fields are correct
     - ❌ If NO → Create it (see CREATE_FIRESTORE_CONFIG.md)

### Step 6: Check Browser Console

1. **Open your website**:
   - https://iot-energy-monitoring-sy-1d1a1.web.app/billings
   - Press **F12** to open Developer Tools
   - Go to **Console** tab
   - Look for errors or messages

**What to look for:**
- Red error messages
- "Failed to fetch" errors
- CORS errors
- 404 errors
- Network errors

### Step 7: Check Network Requests

1. **Open Developer Tools** (F12)
2. Go to **Network** tab
3. Refresh the page
4. Look for request to: `/billing/currentMonth.json`
5. **Check the response:**
   - Status code: Should be 200 (success) or 404 (not found)
   - Response body: Should show billing data or error

---

## Quick Diagnostic Checklist

- [ ] Billing data exists in `/billing/currentMonth` in Realtime Database?
- [ ] Usage data exists in `usage_monthly/2025-11` in Firestore?
- [ ] Firestore config exists: `config/billing`?
- [ ] Cloud Function logs show success?
- [ ] Browser console shows any errors?
- [ ] Network request to billing URL succeeds?
- [ ] Billing data has `totalKWh` field?

---

## Common Issues and Solutions

### Issue 1: "No billing data available yet"
**Solution**: Billing hasn't been calculated yet. Trigger the function manually.

### Issue 2: "No usage data found"
**Solution**: 
- Check if ESP32 data is being aggregated
- Check `usage_monthly` collection in Firestore
- Verify `onHistoryCreate` function is working

### Issue 3: "Function timeout"
**Solution**: 
- Check if Firestore config exists
- Check if usage data exists
- Check function logs for errors

### Issue 4: "404 Not Found"
**Solution**: 
- Billing data doesn't exist
- Trigger billing calculation
- Check if function ran successfully

### Issue 5: "CORS error"
**Solution**: 
- Check database rules
- Verify URL is correct
- Check browser console for specific error

---

## Manual Test Steps

1. **Check if billing data exists**:
   ```
   Open: https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/billing/currentMonth.json
   ```
   - If you see data → Data exists, check frontend
   - If you see "null" → Data doesn't exist, trigger billing

2. **Check if usage data exists**:
   - Firestore → `usage_monthly` → `2025-11`
   - Should have `totalKWh` field

3. **Trigger billing manually**:
   - Cloud Functions → `monthlyBill` → TEST → Trigger
   - Check logs for errors

4. **Check browser console**:
   - F12 → Console
   - Look for errors or log messages

---

## Next Steps

Based on what you find, we can:
1. Fix the billing calculation
2. Fix the data fetching
3. Fix the data display
4. Create missing data

Tell me what you find in each step!







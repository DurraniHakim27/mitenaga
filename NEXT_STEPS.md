# Next Steps - Get Billing Working! 🚀

## ✅ What's Already Done
- ✅ Frontend deployed (billing card ready)
- ✅ Functions deployed (billing calculation ready)
- ✅ Database rules deployed
- ✅ Frontend fetches billing data automatically

## 🎯 What You Need to Do NOW

### Step 1: Create Firestore Config (5 minutes) ⚠️ REQUIRED

**This is REQUIRED for billing to work!**

1. **Open Firestore Console**: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore

2. **Create Collection**:
   - Click "Start collection" (or "+" button)
   - Collection ID: `config`
   - Click "Next"

3. **Create Document**:
   - Document ID: `billing`
   - Add these 3 fields:
     ```
     Field 1:
     - Field name: afaRate
     - Type: number
     - Value: -0.065
     
     Field 2:
     - Field name: billingDay
     - Type: number
     - Value: 1
     
     Field 3:
     - Field name: serviceTaxScope
     - Type: string
     - Value: all
     ```
   - Click "Save"

### Step 2: Check Your Website (2 minutes)

1. **Open your hosted website**: 
   - Go to: https://iot-energy-monitoring-sy-1d1a1.web.app
   - Or check your Firebase Hosting URL

2. **Go to Billings Tab**:
   - Click "Billings" in the navigation
   - You should see the tariff table
   - The "Current Month Bill" card might be hidden (that's normal if no billing data yet)

### Step 3: Verify Data Flow (5 minutes)

**Check if your ESP32 data is being aggregated:**

1. **Check Realtime Database**:
   - Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
   - Look at `/history` - should see entries from your ESP32
   - Look at `/latest` - should see current data

2. **Check Firestore Usage Data**:
   - Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
   - Look for collection: `usage_monthly`
   - Check document: `2025-11` (current month in YYYY-MM format)
   - Should see `totalKWh` field with accumulated usage

3. **Check if Billing Exists**:
   - In Realtime Database, check: `/billing/currentMonth`
   - Or in Firestore, check: `billing/currentMonth`
   - If it doesn't exist, billing hasn't been calculated yet

### Step 4: Test Billing Calculation

**Option A: Wait for Automatic Calculation**
- The `monthlyBill` function runs daily at 00:05 MYT
- It only calculates on `billingDay` (1st of month by default)
- For testing, you might want to trigger it manually

**Option B: Manually Trigger (For Testing)**

You can test billing calculation by:
1. Going to Cloud Functions: https://console.cloud.google.com/functions/list?project=iot-energy-monitoring-sy-1d1a1
2. Find `monthlyBill` function
3. Click "Test" to trigger it manually
4. Or wait until the 1st of next month

**Option C: Calculate for Current Month (Testing)**
- Temporarily change `billingDay` in Firestore config to today's date
- Wait for the scheduled function to run, or trigger manually
- Then change it back to 1

## 📊 What You Should See

### On Your Website:
1. **Dashboard Tab**: Real-time sensor data, graphs
2. **Reports Tab**: Historical data, summaries
3. **Billings Tab**: 
   - Tariff table (always visible)
   - Current Month Bill card (visible when billing data exists)

### Current Month Bill Card Shows:
- Month (e.g., "2025-11")
- Total Usage (kWh)
- Energy Charge (RM)
- Capacity Charge (RM)
- Network Charge (RM)
- Retail Service Charge (RM)
- AFA (RM)
- EECI Rebate (RM)
- KWTBB (RM)
- Service Tax (RM)
- **Total Payable (RM)** ← This is what you want to see!

## 🐛 Troubleshooting

### "Current Month Bill" card not showing?
- ✅ Check browser console (F12 → Console) for errors
- ✅ Check if billing data exists in RTDB: `/billing/currentMonth`
- ✅ The card is hidden by default until data loads

### No billing data?
- ✅ Make sure Firestore config exists: `config/billing`
- ✅ Make sure usage data exists: `usage_monthly/2025-11`
- ✅ Trigger billing calculation manually or wait for schedule

### No usage data?
- ✅ Check if ESP32 is sending data to `/history`
- ✅ Check Cloud Functions logs for `onHistoryCreate` errors
- ✅ Verify ESP32 is connected and sending data

## 🎉 Success Checklist

- [ ] Firestore config created (`config/billing`)
- [ ] ESP32 sending data to `/history`
- [ ] Usage data accumulating in `usage_monthly/{month}`
- [ ] Billing calculated in `/billing/currentMonth`
- [ ] Website shows "Current Month Bill" card
- [ ] All billing breakdown values visible

## 🚀 Quick Test

1. **Create config** (if not done)
2. **Check website**: https://iot-energy-monitoring-sy-1d1a1.web.app/billings
3. **Check data**: Firebase Console → Firestore → `usage_monthly`
4. **Check billing**: Firebase Console → Database → `/billing/currentMonth`

If billing data exists, you'll see it on the website! 🎉






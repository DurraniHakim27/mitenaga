# Complete Reset Guide - Fix Data Coming Back

## The Problem

After resetting, data comes back because:
1. **RTDB aggregates weren't cleared** - `/aggregates/monthly/{month}` still had old data
2. **Old history entries** - Previous history entries might be re-aggregating
3. **Frontend caching** - Browser might be caching old data

## Complete Reset Steps

### Step 1: Reset via Function (Updated - Now Clears Everything)

```powershell
Invoke-RestMethod -Uri "https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/resetAllMonthlyData" -Method POST -ContentType "application/json" -Body '{}'
```

This now clears:
- ✅ All 5 PZEM monthly totals (Firestore)
- ✅ Total monthly usage (Firestore)
- ✅ RTDB aggregates (`/aggregates/monthly/{month}`) - **FIXED!**
- ✅ Daily aggregates for the month
- ✅ Billing data (RTDB + Firestore)
- ✅ Allocation data (RTDB + Firestore)
- ✅ Billing history

### Step 2: Manual Firestore Check (Verify)

1. Go to Firebase Console → Firestore
2. Check `usage_monthly/2025-11` → `totalKWh` should be 0
3. Check `usage_monthly_pzem/2025-11_pzem1` through `pzem5` → all should be 0
4. Check `billing/currentMonth` → should not exist

### Step 3: Manual RTDB Check (Verify)

1. Go to Firebase Console → Realtime Database
2. Check `/aggregates/monthly/2025-11` → `totalKWh` should be 0
3. Check `/billing/currentMonth` → should not exist
4. Check `/billing_allocation/2025-11` → should not exist

### Step 4: Clear Browser Cache

1. Press `Ctrl + Shift + Delete`
2. Clear cached images and files
3. Or hard refresh: `Ctrl + F5`

### Step 5: Wait and Monitor

1. Wait 5-10 minutes
2. Check website - should show 0 kWh
3. Let ESP32 send new data
4. Verify new data accumulates correctly

## If Data Still Comes Back

### Option A: Delete History Entries (Nuclear Option)

**WARNING: This deletes all history data for the month!**

1. Go to Firebase Console → Realtime Database
2. Navigate to `/history`
3. Delete entries from the current month (or all if needed)
4. This prevents re-aggregation from old data

### Option B: Check for Multiple Data Sources

The system uses:
- **Firestore** (primary): `usage_monthly`, `usage_monthly_pzem`
- **RTDB** (secondary): `/aggregates/monthly`, `/billing/currentMonth`

Make sure BOTH are reset!

## Verification After Reset

After resetting, verify:
1. Firestore `usage_monthly/2025-11` → `totalKWh: 0`
2. RTDB `/aggregates/monthly/2025-11` → `totalKWh: 0`
3. Website shows 0 kWh
4. After 10 minutes, new data should start accumulating
5. Sum of PZEMs should match total

## Why Data Came Back

The old reset function missed:
- RTDB `/aggregates/monthly/{month}` - this was still being read
- Daily aggregates might have been re-aggregating
- Frontend might have cached old data

The updated reset function now clears **everything**!







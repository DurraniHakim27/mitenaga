# How to Check Cloud Functions Logs

## Option 1: Google Cloud Console (Recommended - More Detailed)

1. Go to: https://console.cloud.google.com/logs
2. Make sure you're in the correct project: `iot-energy-monitoring-sy-1d1a1`
3. In the filter box, type: `onHistoryCreate` or `Per-PZEM Energy Tracking`
4. Look for logs with:
   - `=== Per-PZEM Energy Tracking ===`
   - `pzem1: current=X kWh, previous=Y kWh, delta=Z kWh`
   - `✅ Updated pzemX monthly usage`

## Option 2: Firebase Console Logs (Simpler)

1. Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/functions/logs
2. Select the function: `onHistoryCreate`
3. Look for the detailed logs

## Option 3: Check Latest Data Directly

1. Go to Firebase Console → Realtime Database
2. Navigate to `/latest`
3. Check the `sensors` object:
   ```json
   {
     "sensors": {
       "pzem1": { "energy": 38.28, ... },
       "pzem2": { "energy": 0.04, ... },
       "pzem3": { "energy": 0.04, ... },
       ...
     }
   }
   ```

## What to Look For

### If all PZEMs show the same energy value:
- The sensors might all be reading from the same source
- Check ESP32 wiring/configuration

### If some PZEMs show 0 or very low values:
- Those sensors might not be connected
- Check Serial Monitor output from ESP32

### If energy values aren't incrementing:
- The sensors might be reset
- Check if delta is always 0 in logs

## Quick Test: Check Firestore

1. Go to Firebase Console → Firestore Database
2. Navigate to `usage_monthly_pzem` collection
3. Check documents like `2025-11_pzem1`, `2025-11_pzem2`, etc.
4. See what `totalKWh` values are stored

This will show you what's actually being tracked!



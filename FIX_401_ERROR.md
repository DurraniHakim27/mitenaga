# Fixed 401 Error - Database Rules Updated ✅

## Problem
ESP32 was getting **401 Unauthorized** errors when trying to write to Firebase:
- `PUT /latest.json -> 401`
- `POST /history.json -> 401`

## Solution Applied
Updated database rules to allow writes to `/latest` and `/history` paths.

**Changed:**
- `/latest`: `.write: false` → `.write: true`
- `/history`: `.write: false` → `.write: true`
- `/billing`: `.write: false` (still protected - only Cloud Functions can write)
- `/aggregates`: `.write: false` (still protected - only Cloud Functions can write)

## What to Do Now

### Step 1: Restart Your ESP32
1. Restart your ESP32 (unplug and plug back in, or press reset)
2. Watch the Serial Monitor
3. You should now see:
   ```
   PUT /latest.json attempt 1 -> 200 ✅
   POST /history.json attempt 1 -> 200 ✅
   ```

### Step 2: Verify Data in Firebase
1. Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
2. Check `/latest` - should update every few seconds
3. Check `/history` - should have new entries every 60 seconds
4. Data should show:
   ```json
   {
     "sensors": {
       "pzem1": { "power": 30.30, "energy": ... },
       "pzem2": { "power": 30.20, "energy": ... },
       ...
     },
     "total": { "power": 123.60, ... },
     "time": { "day": "Sunday", "date": "2025-11-09", ... }
   }
   ```

### Step 3: Check Website Updates
1. Open: https://iot-energy-monitoring-sy-1d1a1.web.app
2. Go to Dashboard tab
3. You should see:
   - Real-time sensor data updating
   - Graphs updating
   - "Last updated" timestamp changing

### Step 4: Check Data Aggregation
After data starts flowing:
1. Go to Firestore: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
2. Check collection: `usage_daily`
3. Should see documents like: `2025-11-09` with `totalKWh` field
4. Check collection: `usage_monthly`
5. Should see document: `2025-11` with accumulated `totalKWh`

## Expected Behavior

### ESP32 Serial Monitor:
```
PUT /latest.json attempt 1 -> 200 ✅
POST /history.json attempt 1 -> 200 ✅
OUT latest: p1=30.30W p2=30.20W p3=0.00W p4=31.50W p5=31.60W total=123.60W
```

### Firebase Database:
- `/latest` updates every cycle (every few seconds)
- `/history` gets new entry every 60 seconds
- Data includes: sensors, total, time, timestamp

### Website:
- Dashboard shows real-time data
- Graphs update automatically
- Billings tab shows status (or billing data if calculated)

## Troubleshooting

### Still getting 401 errors?
1. Wait 1-2 minutes after deploying rules (propagation time)
2. Restart ESP32
3. Check if rules were deployed correctly:
   - Go to Firebase Console → Realtime Database → Rules
   - Should see `.write: true` for `latest` and `history`

### Data not updating on website?
1. Check browser console (F12 → Console) for errors
2. Verify data exists in `/latest` in Firebase Console
3. Check if website URL is correct
4. Try hard refresh (Ctrl+F5)

### No aggregation happening?
1. Check Cloud Functions logs:
   - Go to: https://console.cloud.google.com/functions/list?project=iot-energy-monitoring-sy-1d1a1
   - Click on `onHistoryCreate` function
   - Check "Logs" tab for errors
2. Verify `/history` entries are being created
3. Check if function is being triggered

## Security Note

⚠️ **Current rules allow public writes for development!**

For production, you should:
1. Use the Cloud Function HTTPS endpoint with API key
2. Update ESP32 to use the endpoint: `https://us-central1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/ingestDevice`
3. Add `x-api-key` header with your secret
4. Change database rules back to `.write: false` for `/latest` and `/history`
5. Only allow Cloud Functions to write (they have admin privileges)

## Next Steps

1. ✅ Database rules updated
2. ⏳ Restart ESP32 and verify 200 responses
3. ⏳ Check Firebase Console for data
4. ⏳ Verify website updates
5. ⏳ Check data aggregation in Firestore
6. ⏳ Trigger billing calculation (if usage data exists)






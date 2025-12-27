# Firebase Hybrid Backend Deployment Guide

## Overview
This project implements a hybrid Firebase backend pattern:
- **Realtime Database**: ESP32 sends data to `/latest` and `/history`
- **Cloud Functions**: Aggregate data and calculate billing
- **Firestore**: Store aggregated daily/monthly usage and billing results

## Prerequisites
1. Firebase Blaze plan (required for Cloud Functions)
2. Node.js 20+ installed
3. Firebase CLI installed: `npm install -g firebase-tools`
4. Firebase project: `iot-energy-monitoring-sy-1d1a1`

## Setup Steps

### 1. Initialize Firebase (if not done)
```bash
firebase login
firebase init
```
Select:
- Functions
- Firestore
- Hosting
- Realtime Database

### 2. Install Dependencies
```bash
cd functions
npm install
```

### 3. Set Function Configuration
```bash
firebase functions:config:set iot.token="YOUR_SECRET_API_KEY_HERE"
```
Replace `YOUR_SECRET_API_KEY_HERE` with a strong random string.

### 4. Deploy Functions and Hosting
```bash
firebase deploy --only functions,hosting
```

### 5. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 6. Deploy Database Rules
```bash
firebase deploy --only database
```

## Data Flow

### ESP32 → Realtime Database
1. ESP32 sends JSON to `/latest` (PUT) every cycle
2. ESP32 sends JSON to `/history` (POST) every 60 seconds
3. Format:
```json
{
  "sensors": {
    "pzem1": { "voltage": 230, "current": 1.2, "power": 276, "energy": 1.23 },
    ...
  },
  "total": { "power": 500, "energy": 5.5, "current": 2.1 },
  "timestamp": "2025-11-09T10:10:10Z",
  "time": { "day": "Monday", "date": "2025-11-09", ... }
}
```

### Cloud Functions Processing
1. **onHistoryCreate**: Triggered when new entry added to `/history`
   - Calculates delta kWh from previous entry
   - Updates Firestore `usage_daily/{date}` and `usage_monthly/{month}`
   - Updates RTDB aggregates for backward compatibility

2. **dailyRollup**: Scheduled daily at 23:58 MYT
   - Archives daily usage to RTDB `/dailyArchive`

3. **monthlyBill**: Scheduled daily at 00:05 MYT (runs on billing day)
   - Reads monthly usage from Firestore
   - Calculates billing using Malaysian TNB tariff rules
   - Writes to RTDB `/billing/currentMonth` and Firestore `billing/currentMonth`

### Frontend Reading
- Dashboard reads `/latest.json` for real-time data
- Billings page reads `/billing/currentMonth.json` for current bill

## Billing Calculation

The billing logic implements TNB Domestic Tariff (Tarif A) 2025:
- Energy Charge: 0.2703 RM/kWh (standard), 0.3703 RM/kWh (>1500 kWh)
- Capacity Charge: 0.0455 RM/kWh
- Network Charge: 0.1285 RM/kWh
- Retail Service Charge: RM 10.00/month (if usage >= 600 kWh)
- EECI Rebate: Tiered based on usage (see billingLogic.ts)
- KWTBB: 1.6% of subtotal (if usage > 300 kWh)
- Service Tax: 8% of subtotal (if usage > 600 kWh)

## Configuration

### Firestore Config Document
Create a document at `config/billing`:
```json
{
  "afaRate": -0.065,
  "billingDay": 1,
  "serviceTaxScope": "all"
}
```

### Billing Day
The monthly bill is calculated on the `billingDay` (default: 1st of month) at 00:05 MYT.

## Testing

### Test History Trigger
1. Manually add an entry to `/history` in Firebase Console
2. Check Cloud Functions logs: `firebase functions:log`
3. Verify Firestore `usage_daily` and `usage_monthly` collections are updated

### Test Billing Calculation
1. Set `billingDay` to today's date in `config/billing`
2. Wait for scheduled function to run (or trigger manually)
3. Check `/billing/currentMonth` in RTDB and Firestore

### Test HTTPS Endpoint (Optional)
```bash
curl -X POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/ingestDevice \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SECRET_API_KEY_HERE" \
  -d '{
    "sensors": { "pzem1": { "power": 100, "energy": 1.0 } },
    "total": { "power": 100, "energy": 1.0 },
    "timestamp": "2025-11-09T10:10:10Z"
  }'
```

## Monitoring

### View Function Logs
```bash
firebase functions:log
```

### View Real-time Data
- RTDB: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/database
- Firestore: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore

## Troubleshooting

### Functions Not Triggering
- Check function logs for errors
- Verify RTDB rules allow Cloud Functions to write
- Check function deployment: `firebase functions:list`

### Billing Not Calculating
- Verify `config/billing` document exists in Firestore
- Check `billingDay` matches current date
- Verify monthly usage data exists in `usage_monthly` collection

### Data Not Aggregating
- Check `onHistoryCreate` function logs
- Verify history entries have valid `total.energy` field
- Check for negative or invalid delta calculations

## Security Notes

1. **Database Rules**: Currently set to read-only for public (write only via Cloud Functions)
2. **API Key**: Store `iot.token` securely, never commit to git
3. **Firestore Rules**: Restrict write access to admin users in production
4. **HTTPS Endpoint**: Always use HTTPS, validate API key

## Next Steps

1. Set up proper authentication for admin access
2. Add error alerting (e.g., via email or Slack)
3. Add billing history visualization
4. Add export functionality for billing data
5. Implement usage predictions/alerts



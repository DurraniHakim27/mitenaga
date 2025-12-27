# Deployment Fix - Cloud Scheduler 503 Error

## Problem
Cloud Scheduler API is returning a 503 error (service unavailable) when trying to deploy scheduled functions.

## Solutions

### Option 1: Enable Cloud Scheduler API (Recommended)
1. Go to Google Cloud Console: https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=iot-energy-monitoring-sy-1d1a1
2. Click "Enable" if not already enabled
3. Wait 1-2 minutes for the API to activate
4. Retry deployment

### Option 2: Deploy Functions Without Scheduled Jobs First
Deploy the trigger and HTTP functions first, then add scheduled functions later:

```bash
# Deploy only the database trigger and HTTP endpoint
cmd /c "cd C:\Users\User\Downloads\FYP && firebase deploy --only functions:onHistoryCreate,functions:ingestDevice"
```

Then enable Cloud Scheduler API and deploy scheduled functions:
```bash
cmd /c "cd C:\Users\User\Downloads\FYP && firebase deploy --only functions:dailyRollup,functions:monthlyBill"
```

### Option 3: Wait and Retry
If it's a temporary outage, wait 10-15 minutes and retry the deployment.

### Option 4: Use Different Region
The functions are now configured for `asia-southeast1`. If Cloud Scheduler has issues in that region, you might need to:
1. Check Cloud Scheduler availability in asia-southeast1
2. Or use us-central1 for scheduled functions (but database triggers should stay in asia-southeast1)

## Current Status
- ✅ Functions updated to use `asia-southeast1` region
- ✅ Functions rebuilt successfully
- ❌ Cloud Scheduler API needs to be enabled or service is unavailable

## Quick Fix Command
Try enabling the API first, then redeploy:
```bash
# After enabling API in console, retry:
cmd /c "cd C:\Users\User\Downloads\FYP && firebase deploy --only functions,hosting,firestore:rules,database"
```




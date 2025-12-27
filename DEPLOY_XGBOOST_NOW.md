# Deploy XGBoost Function NOW - Quick Guide

## Step 1: Install gcloud CLI (if not installed)

**Windows (PowerShell as Admin):**
```powershell
winget install Google.CloudSDK
```

Or download from: https://cloud.google.com/sdk/docs/install

## Step 2: Authenticate and Set Project

```powershell
gcloud auth login
gcloud config set project iot-energy-monitoring-sy-1d1a1
```

## Step 3: Deploy the Function

```powershell
cd functions-python
gcloud functions deploy predict_energy_consumption `
  --gen2 `
  --runtime=python311 `
  --region=asia-southeast1 `
  --source=. `
  --entry-point=predict_energy_consumption `
  --trigger-http `
  --allow-unauthenticated `
  --memory=2GB `
  --timeout=540s
```

**Note:** The backticks (`) are for PowerShell line continuation. If using cmd, use `^` instead.

## Step 4: Update Website URL

After deployment, gcloud will show you the function URL. Update `public/script.js`:

```javascript
const PREDICT_ENERGY_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption';
```

## Step 5: Deploy Website

```powershell
cd ..
firebase deploy --only hosting
```

## Verify It Works

Test the function:
```powershell
Invoke-RestMethod -Uri "https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption" -Method POST -ContentType "application/json" -Body '{"mode": "end_of_month"}'
```

You should see XGBoost predictions (not simple linear)!










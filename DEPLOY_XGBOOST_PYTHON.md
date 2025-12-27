# Deploy XGBoost Python Function to Google Cloud Functions

Since Firebase Functions has issues with Python virtualenv, we'll deploy directly to Google Cloud Functions using `gcloud` CLI.

## Prerequisites

1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Authenticate: `gcloud auth login`
3. Set project: `gcloud config set project iot-energy-monitoring-sy-1d1a1`

## Deployment Steps

### Step 1: Deploy using gcloud

```bash
cd functions-python
gcloud functions deploy predict_energy_consumption \
  --gen2 \
  --runtime=python311 \
  --region=asia-southeast1 \
  --source=. \
  --entry-point=predict_energy_consumption \
  --trigger-http \
  --allow-unauthenticated \
  --memory=2GB \
  --timeout=540s
```

### Step 2: Update Website URL

After deployment, update `public/script.js`:

```javascript
const PREDICT_ENERGY_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption';
```

## Alternative: Use Cloud Run (Recommended for larger models)

If the model file is large, Cloud Run might be better:

```bash
cd functions-python
gcloud run deploy predict-energy-consumption \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 540 \
  --max-instances 10
```

## Verify Deployment

Test the function:
```bash
curl -X POST https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption \
  -H "Content-Type: application/json" \
  -d '{"mode": "end_of_month"}'
```










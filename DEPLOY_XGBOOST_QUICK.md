# Quick Deploy XGBoost Python Function

## Option 1: Deploy with gcloud CLI (Recommended)

1. **Install gcloud CLI** (if not installed):
   - Download: https://cloud.google.com/sdk/docs/install
   - Or use: `winget install Google.CloudSDK`

2. **Authenticate and set project**:
   ```powershell
   gcloud auth login
   gcloud config set project iot-energy-monitoring-sy-1d1a1
   ```

3. **Deploy the function**:
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

4. **Update website URL** in `public/script.js`:
   ```javascript
   const PREDICT_ENERGY_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption';
   ```

5. **Deploy website**:
   ```powershell
   firebase deploy --only hosting
   ```

## Option 2: Use Cloud Run (Better for large models)

```powershell
cd functions-python
gcloud run deploy predict-energy-consumption `
  --source . `
  --region asia-southeast1 `
  --platform managed `
  --allow-unauthenticated `
  --memory 2Gi `
  --timeout 540 `
  --max-instances 10
```

Then update the URL in `script.js` to the Cloud Run URL.

## Note

The function file `main_gcf.py` is ready for gcloud deployment. Make sure:
- `london_energy_xgboost.model` is in `functions-python/`
- `model_hyperparameters.json` is in `functions-python/`
- `requirements.txt` has all dependencies










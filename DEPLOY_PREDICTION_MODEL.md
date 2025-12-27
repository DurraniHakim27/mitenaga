# Deploy XGBoost Energy Prediction Model to Firebase

This guide will help you deploy the XGBoost model for energy consumption prediction to Firebase Cloud Functions.

## 📋 Prerequisites

1. **Model Files**: You should have:
   - `london_energy_xgboost.model` - The trained XGBoost model
   - `model_hyperparameters.json` - Model hyperparameters (optional, for reference)

2. **Firebase CLI**: Make sure Firebase CLI is installed and you're logged in:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## 📁 File Structure

```
FYP/
├── functions-python/
│   ├── main.py                    # Python Cloud Function
│   ├── requirements.txt           # Python dependencies
│   ├── .python-version            # Python version (3.11)
│   ├── .gcloudignore             # Files to ignore during deployment
│   ├── london_energy_xgboost.model  # ⚠️ COPY YOUR MODEL FILE HERE
│   └── model_hyperparameters.json   # ⚠️ COPY YOUR JSON FILE HERE
├── firebase.json                  # Updated to include Python functions
└── public/
    ├── index.html                 # Updated with prediction UI
    └── script.js                  # Updated with prediction API call
```

## 🚀 Deployment Steps

### Step 1: Copy Model Files

Copy your model files to the `functions-python` directory:

```bash
# Copy the model file
cp london_energy_xgboost.model functions-python/

# Copy the hyperparameters file (if you have it)
cp model_hyperparameters.json functions-python/
```

**Note**: The file name in the code expects `model_hyperparameters.json` (with lowercase 'p' in parameters). If your file is named differently, either:
- Rename it to match, OR
- Update line 45 in `functions-python/main.py` to match your filename

### Step 2: Install Python Dependencies (Optional - for local testing)

If you want to test locally first:

```bash
cd functions-python
pip install -r requirements.txt
```

### Step 3: Deploy to Firebase

Deploy the Python function:

```bash
# From the project root directory
firebase deploy --only functions:predict_energy_consumption
```

Or deploy all functions (Node.js + Python):

```bash
firebase deploy --only functions
```

### Step 4: Deploy Website Updates

Deploy the updated website:

```bash
firebase deploy --only hosting
```

Or deploy everything:

```bash
firebase deploy
```

## 🔍 Verify Deployment

1. **Check Function URL**: After deployment, Firebase will show you the function URL. It should be:
   ```
   https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption
   ```

2. **Test the Function**: You can test it using curl or PowerShell:

   **PowerShell:**
   ```powershell
   Invoke-RestMethod -Uri "https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption" -Method POST -ContentType "application/json" -Body '{"mode": "end_of_month"}'
   ```

   **curl:**
   ```bash
   curl -X POST https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption \
     -H "Content-Type: application/json" \
     -d '{"mode": "end_of_month"}'
   ```

3. **Check Website**: Visit your website and go to the "Reports" page. You should see:
   - A new "Energy Consumption Forecast" card
   - A "Predict Until End of Month" button
   - Click the button to test the prediction

## 🐛 Troubleshooting

### Error: "Model file not found"

- Make sure `london_energy_xgboost.model` is in the `functions-python/` directory
- Check the file name matches exactly (case-sensitive)
- Verify the file was included in deployment (check `.gcloudignore`)

### Error: "Module not found" or "Import error"

- Make sure `requirements.txt` includes all dependencies
- Check that Python 3.11 runtime is specified in `firebase.json`
- Try redeploying: `firebase deploy --only functions:predict_energy_consumption`

### Error: "Historical data not found"

- The function tries to fetch data from Firestore `usage_daily` collection
- Make sure your daily rollup function is running and creating `usage_daily` documents
- Check Firestore console to verify daily data exists

### Function timeout

- Python functions have a default timeout of 60 seconds
- If predictions take longer, you may need to increase timeout in `firebase.json`:
  ```json
  "functions": [
    {
      "source": "functions-python",
      "runtime": "python311",
      "timeout": "120s"
    }
  ]
  ```

### CORS errors

- The function already includes CORS headers
- If you still see CORS errors, check the function logs:
  ```bash
  firebase functions:log --only predict_energy_consumption
  ```

## 📊 How It Works

1. **User clicks "Predict Until End of Month"** on the Reports page
2. **JavaScript calls** the Python Cloud Function via POST request
3. **Function loads** the XGBoost model from the deployed file
4. **Function fetches** historical consumption data from Firestore (`usage_daily` collection)
5. **Function fills missing lags** using the last known value (if fewer than 9 days available)
6. **Function performs recursive forecasting**:
   - Predicts day 1 using historical lags
   - Uses day 1 prediction as lag_1 for day 2
   - Continues until end of month
7. **Function returns** predictions with summary statistics
8. **Website displays** predictions in a chart and table

## 🔧 Customization

### Change prediction period

To predict a different number of days, modify `predict_until_end_of_month()` in `main.py` or add a new mode.

### Adjust lag filling strategy

Currently, missing lags are filled with the last known value. To change this, modify `fill_missing_lags()` in `main.py`.

### Add more features

To add more features to the prediction (e.g., weather data), modify `create_features()` in `main.py`.

## 📝 Notes

- The model expects exactly 15 features: 6 time features + 9 lag features
- Make sure your historical data is in Firestore `usage_daily` collection with `totalKWh` field
- The function automatically handles missing data by filling with last known value
- Predictions are recursive: each prediction becomes input for the next

## ✅ Success Checklist

- [ ] Model file copied to `functions-python/`
- [ ] Hyperparameters file copied (if available)
- [ ] Function deployed successfully
- [ ] Function URL accessible
- [ ] Website updated and deployed
- [ ] Prediction button works on Reports page
- [ ] Predictions display correctly in chart and table







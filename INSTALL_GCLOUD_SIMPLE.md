# Install gcloud CLI - Simple Steps

## Download and Install

1. **Download the installer:**
   - Go to: https://cloud.google.com/sdk/docs/install
   - Or direct download: https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe

2. **Run the installer:**
   - Double-click `GoogleCloudSDKInstaller.exe`
   - Follow the installation wizard
   - Make sure "Add to PATH" is checked

3. **Close and reopen PowerShell**

4. **Verify installation:**
   ```powershell
   gcloud --version
   ```

5. **Authenticate and set project:**
   ```powershell
   gcloud auth login
   gcloud config set project iot-energy-monitoring-sy-1d1a1
   ```

6. **Deploy:**
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

This is the most reliable way to deploy Python functions with XGBoost!










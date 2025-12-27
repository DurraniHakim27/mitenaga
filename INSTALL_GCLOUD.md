# Install Google Cloud SDK (gcloud CLI)

## Windows Installation

### Method 1: Using winget (Easiest)

Open PowerShell as Administrator and run:
```powershell
winget install Google.CloudSDK
```

After installation, close and reopen PowerShell, then verify:
```powershell
gcloud --version
```

### Method 2: Manual Installation

1. Download the installer: https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe
2. Run the installer
3. Follow the installation wizard
4. Close and reopen PowerShell
5. Verify: `gcloud --version`

### Method 3: Using Chocolatey (if you have it)

```powershell
choco install gcloudsdk
```

## After Installation

1. **Initialize gcloud:**
   ```powershell
   gcloud init
   ```
   This will:
   - Ask you to log in
   - Let you select/create a project
   - Set default region

2. **Or just authenticate:**
   ```powershell
   gcloud auth login
   gcloud config set project iot-energy-monitoring-sy-1d1a1
   ```

## Then Deploy

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










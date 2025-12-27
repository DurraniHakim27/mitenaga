# How to Enable Cloud Scheduler API

## Step-by-Step Instructions

### Method 1: Direct Link (Easiest)
1. **Click this link**: https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=iot-energy-monitoring-sy-1d1a1
2. **Click the blue "ENABLE" button** (if it says "ENABLE", it's not enabled yet)
3. **Wait 1-2 minutes** for the API to activate
4. You should see a green checkmark or "API enabled" message

### Method 2: Through Google Cloud Console
1. Go to: https://console.cloud.google.com/
2. Make sure you're in the correct project: **iot-energy-monitoring-sy-1d1a1**
   - Check the project name in the top bar
   - If wrong, click the project name and select the correct one
3. In the left menu, go to **"APIs & Services"** → **"Library"**
4. In the search bar, type: **"Cloud Scheduler API"**
5. Click on **"Cloud Scheduler API"** from the results
6. Click the blue **"ENABLE"** button
7. Wait for it to enable (you'll see a success message)

### Method 3: Through Firebase Console
1. Go to: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1
2. Click the **gear icon** (⚙️) in the top left
3. Click **"Project settings"**
4. Go to the **"Cloud Messaging"** or **"Integrations"** tab
5. Look for **"Cloud APIs"** section
6. Find **"Cloud Scheduler API"** and enable it

## How to Verify It's Enabled

After enabling, you can verify by:
1. Going back to: https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com?project=iot-energy-monitoring-sy-1d1a1
2. You should see **"API enabled"** or a green checkmark
3. If you see **"ENABLE"** button, it's not enabled yet

## After Enabling

Once the API is enabled, you can deploy the scheduled functions:

```bash
cmd /c "cd C:\Users\User\Downloads\FYP && firebase deploy --only functions:dailyRollup,functions:monthlyBill"
```

Or deploy all functions:
```bash
cmd /c "cd C:\Users\User\Downloads\FYP && firebase deploy --only functions"
```

## Troubleshooting

- **If the link doesn't work**: Make sure you're logged into the correct Google account
- **If you don't have permission**: You need to be a project owner or have "Project Editor" role
- **If it says "already enabled"**: Great! You can proceed with deployment
- **If you get an error**: Try refreshing the page or wait a few minutes and try again






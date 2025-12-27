# Quick Fix Guide

## Issue 1: PowerShell Execution Policy

Your PowerShell is blocking npm. Fix it with one of these options:

### Option A: Run in Command Prompt (Easiest)
1. Open **Command Prompt** (cmd) instead of PowerShell
2. Navigate to your project:
   ```
   cd C:\Users\User\Downloads\FYP\functions
   ```
3. Run:
   ```
   npm install
   ```

### Option B: Change PowerShell Execution Policy (One-time)
Run this in PowerShell (as Administrator):
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try `npm install` again.

### Option C: Bypass for This Session Only
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
npm install
```

## Issue 2: Missing Frontend Files

The `index.html`, `style.css`, and `script.js` files were deleted. You need to recreate them in the `public` folder.

**Solution**: The files need to be recreated with all the latest features:
- Billings section with Current Month Bill card
- KWTBB column showing "✅ 1.6%"
- MYT time display (day, date, timezone)
- Sensor names modal
- Billing data loading from Firebase

**Next Steps**:
1. Fix the npm issue (use Option A above)
2. Install dependencies: `npm install`
3. Recreate the public folder files (I'll help with this next)

## Current Status
- ✅ `functions` folder exists
- ✅ `functions/package.json` exists
- ✅ `public` folder created
- ❌ Frontend files (HTML/CSS/JS) missing from `public`
- ❌ npm blocked by PowerShell execution policy

## Recommended Action
1. Open **Command Prompt** (not PowerShell)
2. Run:
   ```
   cd C:\Users\User\Downloads\FYP\functions
   npm install
   ```
3. Wait for dependencies to install
4. Then we'll recreate the frontend files




# Firebase Python Functions Deployment Fix

## Issue
Error: `functions.codebase must be unique but 'default' was used more than once`

## Solution Options

### Option 1: Deploy Python Functions Separately (Recommended)

Firebase might not support Python and Node.js functions in the same `firebase.json` easily. Try deploying them separately:

1. **Temporarily remove Node.js functions from firebase.json:**
   ```json
   "functions": [
     {
       "source": "functions-python",
       "codebase": "python",
       "runtime": "python311"
     }
   ]
   ```

2. **Deploy Python function:**
   ```powershell
   cmd /c "firebase deploy --only functions:predict_energy_consumption"
   ```

3. **Restore Node.js functions and deploy separately:**
   ```json
   "functions": [
     {
       "source": "functions",
       "codebase": "nodejs",
       "runtime": "nodejs20"
     }
   ]
   ```
   ```powershell
   cmd /c "firebase deploy --only functions"
   ```

### Option 2: Use Node.js HTTP Function as Proxy

If Python functions don't work, create a Node.js function that calls a Python script or uses a Python runtime via child process.

### Option 3: Deploy Python Function to Separate Firebase Project

Deploy Python functions to a separate Firebase project and call them via HTTP.

## Current Status

The `firebase.json` has been updated with unique codebase names:
- `"codebase": "nodejs"` for Node.js functions
- `"codebase": "python"` for Python functions

Try deploying again with:
```powershell
cmd /c "firebase deploy --only functions:predict_energy_consumption"
```

If it still fails, try Option 1 above.







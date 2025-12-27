# Create Firestore Config Document

## Step 1: Go to Firestore Console
1. Open: https://console.firebase.google.com/project/iot-energy-monitoring-sy-1d1a1/firestore
2. Click "Start collection" (if no collections exist) or click "+ Start collection"

## Step 2: Create Config Collection
1. **Collection ID**: `config`
2. Click "Next"

## Step 3: Create Billing Document
1. **Document ID**: `billing`
2. Add these fields:
   - Field: `afaRate`
     - Type: `number`
     - Value: `-0.065`
   
   - Field: `billingDay`
     - Type: `number`
     - Value: `1`
   
   - Field: `serviceTaxScope`
     - Type: `string`
     - Value: `all`

3. Click "Save"

## Alternative: Use Firebase CLI
You can also create it via command line, but the UI method above is easier.

## Verify
After creating, you should see:
- Collection: `config`
- Document: `billing`
- Fields: `afaRate`, `billingDay`, `serviceTaxScope`






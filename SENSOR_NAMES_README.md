# Sensor Names Feature - Implementation Guide

## Overview
This feature adds editable sensor names for each PZEM (PZEM1-PZEM5) with Firestore/localStorage persistence.

## Files Modified

### 1. `index.html`
- Added Firestore SDK CDN link
- Added "Sensor Names" button in top navigation
- Added sensor names modal
- Added IDs to all PZEM title elements for dynamic updates
- Added inline edit button structure in card generation

### 2. `script.js`
- Added Firestore initialization
- Added sensor names management functions:
  - `loadSensorNames()` - Loads from Firestore → localStorage → defaults
  - `saveSensorNames()` - Saves to Firestore (preferred) or localStorage
  - `resetSensorNames()` - Resets to defaults
  - `getPzemName(id)` - Helper to get name by ID
  - `setPzemName(id, name)` - Helper to set name by ID
  - `updateAllNamesInUI()` - Updates all UI elements with custom names
  - `openSensorNamesModal()` - Opens settings modal
  - `closeSensorNamesModal()` - Closes modal
  - `startInlineEdit(pzemNum)` - Starts inline editing on card
  - `saveInlineEdit(pzemNum)` - Saves inline edit
  - `cancelInlineEdit(pzemNum)` - Cancels inline edit
  - `togglePresetDropdown(pzemNum)` - Toggles preset dropdown
  - `selectPreset(pzemNum, name)` - Selects preset name

### 3. `style.css`
- Added styles for:
  - Sensor Names button
  - Inline edit UI (pencil icon, input, save/cancel buttons)
  - Modal (overlay, content, header, body, footer)
  - Preset dropdown
  - Responsive adjustments

## Firebase Configuration

### Firestore Structure
The sensor names are stored in Firestore at:
```
settings/pzemNames
```

Document structure:
```json
{
  "pzem1": "Living Room",
  "pzem2": "Kitchen",
  "pzem3": "Bedroom",
  "pzem4": "AC Load",
  "pzem5": "Solar"
}
```

### Firestore Security Rules

**For Production (with authentication):**
```javascript
match /settings/pzemNames {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

**For Development (unauthenticated):**
```javascript
match /settings/pzemNames {
  allow read, write: if true;
}
```

⚠️ **Warning:** Unauthenticated writes are insecure. Only use for development/testing.

## Switching Between Firestore and localStorage

In `script.js`, line ~22, you can switch persistence:

```javascript
// Use Firestore (default)
firestore = firebase.firestore();

// OR use localStorage only (comment out Firestore line above)
firestore = null;
```

## Preset Names
Available preset names:
- Living Room
- Kitchen
- Bedroom
- AC Load
- Heater
- Solar
- Garage
- Workshop

## Usage

1. **Inline Edit**: Click the ✏️ icon next to any PZEM card title to edit inline
2. **Modal Edit**: Click "Sensor Names" button in top nav to open settings modal
3. **Preset Selection**: Click ▼ button next to input to see preset options
4. **Save**: Click ✓ or press Enter to save
5. **Cancel**: Click ✕ or press Escape to cancel

## Validation
- Max length: 30 characters
- Whitespace trimmed
- Empty names revert to default (e.g., "PZEM 1")
- Non-empty validation before save

## UI Updates
When names change, the following are automatically updated:
- Card titles
- Badges
- Graph titles
- Chart legends
- Report section titles
- All labels throughout the dashboard

## Notes
- Names persist across page refreshes
- Firestore is preferred; localStorage is fallback
- Timestamp shown in modal indicates last update time
- All changes are saved immediately on save action



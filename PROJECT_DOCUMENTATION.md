# MyTenaga Energy Monitoring System - Complete Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack & Decision Rationale](#technology-stack--decision-rationale)
4. [Hardware Components](#hardware-components)
5. [Firebase Infrastructure](#firebase-infrastructure)
6. [Cloud Functions Architecture](#cloud-functions-architecture)
7. [Data Flow & Processing](#data-flow--processing)
8. [Frontend Development](#frontend-development)
9. [Machine Learning Integration](#machine-learning-integration)
10. [Billing Calculation System](#billing-calculation-system)
11. [Deployment Strategy](#deployment-strategy)
12. [Challenges & Solutions](#challenges--solutions)
13. [Future Enhancements](#future-enhancements)

---

## Project Overview

### Purpose
MyTenaga is a comprehensive IoT-based energy monitoring system designed to track real-time electricity consumption across multiple sensors (PZEM-004T), calculate accurate billing based on Malaysian TNB (Tenaga Nasional Berhad) domestic tariff structure, and provide predictive analytics using machine learning.

### Key Objectives
1. **Real-time Monitoring**: Track voltage, current, power, and energy consumption from 5 PZEM-004T sensors
2. **Accurate Billing**: Calculate electricity bills using TNB's complex non-linear tariff structure
3. **Per-Sensor Allocation**: Distribute total monthly bill proportionally across individual sensors
4. **Predictive Analytics**: Forecast energy consumption until end of month using XGBoost ML model
5. **User-Friendly Dashboard**: Provide intuitive web interface with dark theme for monitoring and analysis

### Scope
- Hardware: ESP32 microcontroller with 5 PZEM-004T energy sensors
- Backend: Firebase Realtime Database, Firestore, Cloud Functions
- Frontend: Progressive Web Application with responsive design
- Machine Learning: XGBoost model for energy consumption forecasting

---

## System Architecture

### High-Level Architecture

```
┌─────────────────┐
│   ESP32 Device  │
│  (5x PZEM-004T) │
└────────┬────────┘
         │
         │ HTTPS POST
         │ (REST API)
         ▼
┌─────────────────────────────────────┐
│     Firebase Cloud Functions        │
│  ┌───────────────────────────────┐ │
│  │  Node.js Functions            │ │
│  │  - onHistoryCreate            │ │
│  │  - dailyRollup                │ │
│  │  - monthlyBill                │ │
│  │  - calculateBillingNow        │ │
│  │  - calculateAllocationNow     │ │
│  │  - resetAllMonthlyData        │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │  Python Functions (GCF Gen2)  │ │
│  │  - predict_energy_consumption│ │
│  └───────────────────────────────┘ │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│     Firebase Realtime Database      │
│  - /latest (real-time sensor data) │
│  - /history (time-series data)      │
│  - /aggregates (daily/monthly)     │
│  - /billing (current month bill)    │
│  - /billing_allocation (per-PZEM)  │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│     Firebase Firestore              │
│  - usage_daily (daily aggregates)  │
│  - usage_monthly (monthly totals)   │
│  - usage_monthly_pzem (per-PZEM)    │
│  - config/billing (tariff config)  │
│  - settings/pzemNames (sensor names)│
│  - resets (baseline markers)        │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│     Firebase Hosting                │
│  - index.html (SPA)                 │
│  - style.css (dark theme)           │
│  - script.js (client logic)         │
└─────────────────────────────────────┘
```

### Data Flow Diagram

1. **Data Collection**: ESP32 reads PZEM sensors → sends to Firebase via HTTPS
2. **Data Processing**: Cloud Functions trigger on new data → aggregate and store
3. **Data Presentation**: Frontend polls Firebase → displays real-time updates
4. **Billing Calculation**: Scheduled functions calculate bills → store in Firestore/RTDB
5. **ML Prediction**: Frontend calls Python function → XGBoost predicts consumption

---

## Technology Stack & Decision Rationale

### Frontend Technologies

#### HTML5 + CSS3 + Vanilla JavaScript
**Decision**: Chose vanilla JavaScript over frameworks (React, Vue, Angular)

**Rationale**:
- **Lightweight**: No build process, faster load times for IoT dashboard
- **Simplicity**: Direct DOM manipulation sufficient for real-time updates
- **Compatibility**: Works on all browsers without transpilation
- **Maintainability**: Easier for future developers to understand and modify
- **Performance**: No framework overhead for simple polling-based updates

#### Chart.js
**Decision**: Used Chart.js for data visualization

**Rationale**:
- **Lightweight**: ~60KB minified, perfect for IoT dashboards
- **Real-time Updates**: Excellent performance for streaming data
- **Responsive**: Automatic canvas resizing
- **Dark Theme Support**: Easy to customize colors for dark backgrounds
- **Multiple Chart Types**: Line charts for time-series, pie charts for allocation

### Backend Technologies

#### Firebase Realtime Database (RTDB)
**Decision**: Primary database for real-time sensor data

**Rationale**:
- **Real-time Sync**: Automatic updates to connected clients
- **Low Latency**: Optimized for IoT applications
- **Simple Structure**: JSON-based, easy to query
- **Free Tier**: Generous free quota for development
- **Use Case**: Perfect for `/latest` sensor readings and `/history` time-series

**Structure**:
```
/latest
  /sensors
    /pzem1: { voltage, current, power, energy, timestamp }
    /pzem2: { ... }
    ...
  /total: { combined totals }
  
/history
  /{pushId}: { sensor data, timestamp }
  
/aggregates
  /daily/{date}: { totalKWh, lastUpdated }
  /monthly/{YYYY-MM}: { totalKWh, lastUpdated }
  
/billing
  /currentMonth: { breakdown, total, calculatedAt }
  
/billing_allocation
  /{YYYY-MM}: { pzem1: { kwh, percentage, allocatedBill }, ... }
```

#### Firebase Firestore
**Decision**: Secondary database for structured, queryable data

**Rationale**:
- **Structured Queries**: Complex filtering and aggregation
- **Scalability**: Better for large datasets than RTDB
- **Offline Support**: Built-in caching for mobile apps
- **Transactions**: ACID transactions for billing calculations
- **Use Case**: Daily/monthly aggregates, billing history, configuration

**Collections**:
- `usage_daily/{YYYY-MM-DD}`: Daily energy totals
- `usage_monthly/{YYYY-MM}`: Monthly energy totals
- `usage_monthly_pzem/{YYYY-MM}_{pzemKey}`: Per-PZEM monthly totals
- `config/billing`: Tariff configuration
- `settings/pzemNames`: User-defined sensor names
- `resets/{YYYY-MM}`: Baseline markers for data reset

#### Firebase Cloud Functions (Node.js)
**Decision**: Serverless backend for data processing

**Rationale**:
- **Event-Driven**: Automatic triggers on database changes
- **Scalability**: Auto-scales based on load
- **Cost-Effective**: Pay only for execution time
- **Integration**: Native Firebase SDK for seamless data access
- **Scheduled Tasks**: Cloud Scheduler integration for daily/monthly jobs

**Key Functions**:
1. `onHistoryCreate`: Triggered on new `/history` entry → aggregates energy
2. `dailyRollup`: Scheduled daily at 11:58 PM MYT → calculates allocation
3. `monthlyBill`: Scheduled monthly at 12:05 AM MYT → calculates bill
4. `calculateBillingNow`: Manual billing calculation
5. `calculateAllocationNow`: Manual allocation calculation
6. `resetAllMonthlyData`: Nuclear reset of all data

#### Google Cloud Functions (Python - Gen 2)
**Decision**: Separate Python function for ML predictions

**Rationale**:
- **ML Libraries**: XGBoost, pandas, numpy require Python
- **Gen 2 Architecture**: Better for ML workloads, longer timeouts
- **Direct Deployment**: Bypasses Firebase CLI Python limitations
- **Isolation**: ML model separate from main application logic
- **Scalability**: Independent scaling from Node.js functions

**Function**:
- `predict_energy_consumption`: XGBoost model for end-of-month forecasting

### Hardware Technologies

#### ESP32 Microcontroller
**Decision**: ESP32 for sensor data collection

**Rationale**:
- **WiFi Built-in**: No additional modules needed
- **Dual Core**: Handles multiple sensor readings efficiently
- **Low Power**: Suitable for continuous monitoring
- **Arduino IDE**: Easy development and debugging
- **Cost-Effective**: Affordable for multi-sensor deployment

#### PZEM-004T Energy Sensors
**Decision**: 5x PZEM-004T for multi-point monitoring

**Rationale**:
- **Accuracy**: ±1% measurement accuracy
- **Modbus RTU**: Reliable serial communication
- **Wide Range**: 80-260V AC, 0-100A current
- **Energy Accumulation**: Built-in energy counter (kWh)
- **Cost**: Affordable for residential monitoring

---

## Hardware Components

### ESP32 Configuration

**Board**: ESP32 DevKit V1
**WiFi**: 2.4GHz (required for Firebase)
**Serial Communication**: Hardware Serial for PZEM sensors
**Power**: USB or external 5V supply

### PZEM-004T Sensor Setup

**Communication**: Modbus RTU over RS485
**Addressing**: Each sensor has unique Modbus address (1-5)
**Wiring**: 
- VCC: 5V
- GND: Common ground
- A+/B-: RS485 differential pair
- Connected via MAX485 RS485-to-TTL converter

### Data Collection Process

1. ESP32 initializes WiFi connection
2. NTP synchronization for accurate timestamps
3. Loop through sensors (1-5):
   - Read Modbus registers (voltage, current, power, energy)
   - Validate data (sanity checks)
   - Prepare JSON payload
4. Send HTTPS POST to Cloud Function endpoint
5. Wait for response, then repeat after delay (e.g., 10 seconds)

### Security Considerations

- **API Key Authentication**: `x-api-key` header for Cloud Function endpoint
- **HTTPS Only**: All communication encrypted
- **Input Validation**: Server-side validation of sensor data
- **Rate Limiting**: Cloud Functions handle excessive requests

---

## Firebase Infrastructure

### Project Setup

**Project ID**: `iot-energy-monitoring-sy-1d1a1`
**Region**: `asia-southeast1` (Singapore - closest to Malaysia)
**Billing**: Blaze Plan (required for Cloud Functions)

### Realtime Database Structure

#### `/latest` - Real-time Sensor Data
```json
{
  "sensors": {
    "pzem1": {
      "voltage": 240.5,
      "current": 2.3,
      "power": 552.15,
      "energy": 1234.56,
      "timestamp": 1731234567890
    },
    "pzem2": { ... },
    ...
  },
  "total": {
    "voltage": 240.5,
    "current": 10.5,
    "power": 2520.75,
    "energy": 5678.90
  }
}
```

**Purpose**: Frontend polls this for real-time dashboard updates

#### `/history` - Time-Series Data
```json
{
  "-Oe3RKhEFg0QTyT9JZcc": {
    "sensors": { "pzem1": {...}, ... },
    "total": {...},
    "timestamp": 1731234567890,
    "entryId": "-Oe3RKhEFg0QTyT9JZcc"
  }
}
```

**Purpose**: Historical data for charts and reports
**Trigger**: `onHistoryCreate` Cloud Function processes each entry

#### `/aggregates` - Pre-calculated Totals
```json
{
  "daily": {
    "2025-11-16": {
      "totalKWh": 12.345,
      "lastUpdated": 1731234567890
    }
  },
  "monthly": {
    "2025-11": {
      "totalKWh": 234.567,
      "lastUpdated": 1731234567890
    }
  }
}
```

**Purpose**: Fast retrieval for dashboard summaries

#### `/billing` - Current Month Bill
```json
{
  "currentMonth": {
    "month": "2025-11",
    "totalKWh": 234.567,
    "breakdown": {
      "energyCharge": 63.45,
      "capacityCharge": 10.67,
      "networkCharge": 30.14,
      "retailCharge": 10.00,
      "afa": -15.25,
      "eeciRebate": -58.64,
      "subtotal": 40.27,
      "kwtbb": 0.64,
      "serviceTax": 3.27,
      "totalPayable": 44.18
    },
    "calculatedAt": 1731234567890
  }
}
```

#### `/billing_allocation` - Per-PZEM Bill Distribution
```json
{
  "2025-11": {
    "pzem1": {
      "kwh": 100.5,
      "percentage": 42.8,
      "allocatedBill": 18.91
    },
    "pzem2": { ... },
    ...
  }
}
```

**Purpose**: Pie chart data and per-sensor billing breakdown

### Firestore Collections

#### `usage_daily/{YYYY-MM-DD}`
```json
{
  "date": "2025-11-16",
  "totalKWh": 12.345,
  "lastUpdated": Timestamp
}
```

#### `usage_monthly/{YYYY-MM}`
```json
{
  "month": "2025-11",
  "totalKWh": 234.567,
  "lastUpdated": Timestamp
}
```

#### `usage_monthly_pzem/{YYYY-MM}_{pzemKey}`
```json
{
  "month": "2025-11",
  "pzemKey": "pzem1",
  "totalKWh": 100.5,
  "lastUpdated": Timestamp
}
```

**Purpose**: Per-PZEM monthly tracking for allocation calculation

#### `config/billing`
```json
{
  "afaRate": -0.065,
  "retailChargeThreshold": 600,
  "retailChargeAmount": 10.00,
  "kwtbbThreshold": 300,
  "kwtbbRate": 0.016,
  "serviceTaxThreshold": 600,
  "serviceTaxRate": 0.08
}
```

**Purpose**: Configurable tariff parameters

#### `settings/pzemNames`
```json
{
  "pzem1": "Living Room",
  "pzem2": "Kitchen",
  "pzem3": "Bedroom",
  "pzem4": "Garage",
  "pzem5": "Workshop"
}
```

**Purpose**: User-defined sensor names persisted in Firestore

#### `resets/{YYYY-MM}`
```json
{
  "resetTimestamp": 1731234567890,
  "resetTimestampISO": "2025-11-16T10:30:00.000Z",
  "baselineEnergy": {
    "total": 1234.56,
    "pzem": {
      "pzem1": 100.5,
      "pzem2": 200.3,
      ...
    }
  },
  "resetReason": "Nuclear reset"
}
```

**Purpose**: Baseline markers to prevent re-aggregation of old data after reset

---

## Cloud Functions Architecture

### Node.js Functions (Firebase Cloud Functions)

#### 1. `onHistoryCreate` - Real-time Aggregation

**Trigger**: Firebase Realtime Database trigger on `/history/{pushId}` create

**Purpose**: 
- Calculate energy delta (current - previous)
- Aggregate to daily/monthly totals
- Track per-PZEM monthly consumption
- Prevent duplicate aggregation using baseline mechanism

**Key Logic**:
```typescript
1. Read new history entry
2. Check for baseline in /resets/{month}
3. If baseline exists:
   - Calculate delta = currentEnergy - baselineEnergy
   - Apply sanity checks (delta < 1.0 kWh, no negative)
4. If no baseline:
   - Compare with previous history entry
   - Calculate delta = currentEnergy - previousEnergy
5. Update Firestore:
   - usage_daily/{date}.totalKWh += delta
   - usage_monthly/{month}.totalKWh += delta
   - usage_monthly_pzem/{month}_{pzemKey}.totalKWh += delta
6. Update RTDB aggregates
```

**Baseline Mechanism**: 
- Prevents re-aggregation of old data after reset
- Stores energy values at reset time
- All future calculations use baseline as reference point

#### 2. `dailyRollup` - Daily Allocation Calculation

**Trigger**: Cloud Scheduler (daily at 11:58 PM MYT)

**Purpose**:
- Calculate per-PZEM bill allocation for current month
- Distribute total bill proportionally based on kWh consumption
- Store results in `/billing_allocation/{month}`

**Key Logic**:
```typescript
1. Get current month (YYYY-MM)
2. Fetch total monthly kWh from Firestore
3. Calculate total bill using billingLogic.ts
4. Fetch per-PZEM monthly kWh from Firestore
5. For each PZEM:
   - Calculate percentage = (pzemKWh / totalKWh) * 100
   - Calculate allocatedBill = (pzemKWh / totalKWh) * totalBill
6. Store in /billing_allocation/{month}
```

**Why Daily**: Ensures allocation updates as consumption accumulates

#### 3. `monthlyBill` - Monthly Billing Calculation

**Trigger**: Cloud Scheduler (monthly at 12:05 AM MYT on 1st day)

**Purpose**:
- Calculate final bill for previous month
- Store in `/billing/currentMonth`
- Trigger allocation calculation

**Key Logic**:
```typescript
1. Get previous month (YYYY-MM)
2. Fetch total monthly kWh from Firestore
3. Calculate bill using billingLogic.ts with TNB tariff
4. Store in /billing/currentMonth
5. Trigger calculatePerPzemBillAllocation()
```

#### 4. `calculateBillingNow` - Manual Billing Calculation

**Trigger**: HTTPS callable function

**Purpose**: Allow users to manually trigger billing calculation

**Use Case**: Testing, immediate calculation without waiting for schedule

#### 5. `calculateAllocationNow` - Manual Allocation Calculation

**Trigger**: HTTPS callable function

**Purpose**: Allow users to manually trigger allocation calculation

**Use Case**: Testing, immediate allocation update

#### 6. `resetAllMonthlyData` - Nuclear Reset

**Trigger**: HTTPS callable function

**Purpose**: 
- Clear all monthly data (Firestore + RTDB)
- Delete all history entries
- Set new baseline with current energy values

**Key Logic**:
```typescript
1. Get current month
2. Fetch current energy from /latest
3. Delete all Firestore monthly documents
4. Delete all RTDB aggregates
5. Delete all /history entries
6. Create reset marker in /resets/{month} with baseline
7. Backdate baseline timestamp by 3 minutes (for immediate activation)
```

**Why Needed**: Clean slate for testing, fixing data corruption issues

### Python Function (Google Cloud Functions Gen 2)

#### `predict_energy_consumption` - ML Energy Forecasting

**Trigger**: HTTPS POST request

**Purpose**: Predict energy consumption until end of current month using XGBoost

**Deployment**: 
- Deployed via `gcloud functions deploy` (not Firebase CLI)
- Region: `asia-southeast1`
- Runtime: Python 3.11
- Entry Point: `predict_energy_consumption`

**Key Logic**:
```python
1. Load XGBoost model from /workspace/london_energy_xgboost.model
2. Load hyperparameters from /workspace/model_hyperparameters.json
3. Fetch historical consumption from Firestore (last 30 days)
4. Extract lag features (lag_1 to lag_9)
5. Fill missing lags with last known value
6. Calculate days until end of month
7. For each day:
   - Create feature vector (day_of_week, month, quarter, year, workday, lag_1..lag_9)
   - Predict consumption using XGBoost
   - Use prediction as lag_1 for next day (recursive forecasting)
8. Return predictions array with dates and values
```

**Features Used**:
- Temporal: day_of_week, day_of_year, month, quarter, year, workday
- Lag Features: lag_1 through lag_9 (previous 9 days consumption)

**Recursive Forecasting**:
- Prediction for day N becomes lag_1 for day N+1
- Ensures predictions account for predicted trends
- More accurate than independent daily predictions

**Error Handling**:
- Missing historical data: Fill lags with last known value
- Model loading errors: Return error response
- Invalid dates: Validate and return error

---

## Data Flow & Processing

### Real-Time Data Flow

```
ESP32 → HTTPS POST → Cloud Function (ingestDevice)
                    ↓
              Validate & Store
                    ↓
         Write to /latest (RTDB)
                    ↓
         Write to /history (RTDB)
                    ↓
    Trigger: onHistoryCreate
                    ↓
    Calculate Energy Delta
                    ↓
    Update Aggregates (Firestore + RTDB)
                    ↓
    Frontend Polls /latest → Display
```

### Billing Calculation Flow

```
Scheduled Trigger (monthlyBill)
        ↓
Fetch Monthly Total kWh (Firestore)
        ↓
Calculate Bill (billingLogic.ts)
        ↓
Store in /billing/currentMonth (RTDB)
        ↓
Trigger Allocation Calculation
        ↓
Fetch Per-PZEM kWh (Firestore)
        ↓
Calculate Proportional Allocation
        ↓
Store in /billing_allocation/{month} (RTDB)
        ↓
Frontend Displays Pie Chart & Summary
```

### ML Prediction Flow

```
Frontend: User Clicks "Predict Until End of Month"
        ↓
HTTPS POST → predict_energy_consumption (Python)
        ↓
Load XGBoost Model & Hyperparameters
        ↓
Fetch Historical Data (Firestore)
        ↓
Extract Lag Features
        ↓
Recursive Forecasting Loop
        ↓
Return Predictions Array
        ↓
Frontend: Display Chart & Table
```

### Baseline Mechanism (Data Reset Prevention)

**Problem**: After reset, old data in `/history` would be re-aggregated

**Solution**: Baseline marker system

```
Reset Triggered (resetAllMonthlyData)
        ↓
Fetch Current Energy from /latest
        ↓
Create Reset Marker in /resets/{month}
  - resetTimestamp
  - baselineEnergy (total + per-PZEM)
        ↓
onHistoryCreate Checks for Baseline
        ↓
If Baseline Exists:
  delta = currentEnergy - baselineEnergy
Else:
  delta = currentEnergy - previousHistoryEnergy
        ↓
Only Positive, Sanity-Checked Deltas Aggregated
```

**Why 3-Minute Backdate**: Ensures baseline is active immediately for new entries

---

## Frontend Development

### Architecture

**Type**: Single Page Application (SPA)
**Pattern**: Polling-based real-time updates
**Framework**: Vanilla JavaScript (no build process)

### Key Components

#### 1. Navigation System
- Top navigation bar with page switching
- Active page highlighting
- Responsive mobile menu

#### 2. Dashboard Page
- **Real-time Sensor Cards**: 5 PZEM cards with voltage, current, power, energy
- **Individual Sensor Charts**: Line charts for each PZEM power over time
- **Total Power Chart**: Combined power from all sensors
- **Total Summary**: Combined energy, average power, peak power

#### 3. Reports Page
- **Energy Share Pie Chart**: Visual allocation of monthly consumption
- **Per-PZEM Summary**: Individual summaries with totals
- **Energy Forecast**: ML predictions with chart and table
- **Total Summary**: Combined metrics

#### 4. Billings Page
- **Current Bill Card**: Detailed TNB tariff breakdown
- **Tariff Structure Table**: Complete tariff tiers
- **Tariff Information**: Explanatory notes
- **Recalculate Button**: Manual billing trigger

#### 5. Settings Page
- Firebase configuration info
- System parameters

#### 6. Sensor Names Modal
- Edit sensor names
- Save to Firestore
- Preset name suggestions

### Data Fetching Strategy

**Polling Interval**: 5 seconds for `/latest`
**REST API**: Direct Firebase RTDB REST endpoints
**Error Handling**: Retry logic, loading indicators

### Dark Theme Design

**Color Scheme**:
- Background: Dark navy (#050816 → #0b1220 gradient)
- Cards: Dark gray (#111827) with subtle borders
- Accent: Cyan/Teal (#00d4ff) for highlights
- Text: White (#ffffff) primary, gray (#9ca3af) secondary

**Design Principles**:
- Modern smart-energy dashboard aesthetic
- Grafana-inspired dark theme
- High contrast for readability
- Smooth transitions and hover effects

### Chart Configuration

**Chart.js Setup**:
- Transparent backgrounds
- Light gray axes and grid lines
- Bright data series colors
- Responsive sizing
- Real-time data updates

---

## Machine Learning Integration

### Model Selection: XGBoost

**Decision**: XGBoost for time-series forecasting

**Rationale**:
- **Performance**: State-of-the-art for tabular data
- **Feature Importance**: Understandable feature contributions
- **Handles Non-linearity**: Captures complex consumption patterns
- **Robust**: Handles missing values and outliers
- **Fast Inference**: Quick predictions for real-time use

### Feature Engineering

#### Temporal Features
- `day_of_week`: 0-6 (Monday-Sunday)
- `day_of_year`: 1-365
- `month`: 1-12
- `quarter`: 1-4
- `year`: 2025, 2026, etc.
- `workday`: Binary (1 for Mon-Fri, 0 for weekend)

#### Lag Features
- `lag_1` through `lag_9`: Previous 9 days consumption
- **Purpose**: Capture short-term trends and patterns
- **Filling Strategy**: If < 9 days available, fill with last known value

### Model Training

**Dataset**: London energy consumption data (similar patterns to residential)
**Preprocessing**:
- Sort by date
- Create lag features
- Drop NaN rows (first 9 rows)
- Train/test split

**Hyperparameters**: Stored in `model_hyperparameters.json`
**Model Format**: XGBoost binary format (`.model` file)

### Deployment Strategy

**Why Separate Python Function**:
- Firebase CLI has limitations with Python virtualenv
- Direct `gcloud` deployment more reliable for ML
- Gen 2 architecture better for ML workloads
- Independent scaling from main application

**Deployment Command**:
```bash
gcloud functions deploy predict_energy_consumption \
  --gen2 \
  --runtime=python311 \
  --region=asia-southeast1 \
  --source=functions-python \
  --entry-point=predict_energy_consumption \
  --trigger-http \
  --allow-unauthenticated
```

**Model Storage**: 
- Model file: `/workspace/london_energy_xgboost.model`
- Hyperparameters: `/workspace/model_hyperparameters.json`
- Deployed with function code

### Prediction Workflow

1. **Input**: Mode (`end_of_month` or default)
2. **Data Fetching**: Get last 30 days from Firestore
3. **Feature Extraction**: Create feature vectors for each prediction day
4. **Recursive Forecasting**: 
   - Day 1: Use historical lags
   - Day 2: Use Day 1 prediction as lag_1
   - Day 3: Use Day 2 prediction as lag_1, Day 1 as lag_2
   - Continue until end of month
5. **Output**: Array of predictions with dates and values

### Integration with Frontend

**API Endpoint**: `https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption`

**Request**:
```json
{
  "mode": "end_of_month"
}
```

**Response**:
```json
{
  "success": true,
  "mode": "end_of_month",
  "start_date": "2025-11-16",
  "end_date": "2025-11-30",
  "days_predicted": 15,
  "total_predicted_kwh": 41.005,
  "average_daily_kwh": 2.734,
  "predictions": [
    {
      "date": "2025-11-16",
      "day_of_week": "Sunday",
      "predicted_consumption": 2.910,
      "day_number": 1
    },
    ...
  ]
}
```

**Frontend Display**:
- Summary statistics (period, total, average)
- Line chart (Chart.js)
- Table with daily predictions

---

## Billing Calculation System

### TNB Domestic Tariff Structure (Tarif A - 2025)

**Complexity**: Non-linear tiered structure with multiple components

#### Base Charges (per kWh)
- **Energy Charge (Caj Tenaga)**: 
  - Standard: RM 0.2703/kWh
  - High-use (>1500 kWh): RM 0.3703/kWh
- **Capacity Charge (Caj Kapasiti)**: RM 0.0455/kWh
- **Network Charge (Caj Rangkaian)**: RM 0.1285/kWh

#### Fixed Charges
- **Retail Service Charge (Caj Peruncitan)**: 
  - Waived for <600 kWh
  - RM 10.00/month for ≥600 kWh

#### Adjustments
- **AFA (Additional Fixed Adjustment)**: 
  - Only applies if usage ≥600 kWh
  - Default: -RM 0.065/kWh (rebate)
- **EECI Rebate (Insentif Cekap Tenaga)**: 
  - Tiered rebate up to -RM 0.25/kWh for <1000 kWh
  - No rebate for >1000 kWh

#### Taxes & Surcharges
- **KWTBB (1.6%)**: Applied to subtotal if usage >300 kWh
- **Service Tax (8%)**: Applied to (Subtotal + KWTBB) if usage >600 kWh

### Implementation: `billingLogic.ts`

**Modular Design**: Separate function for reusability

**Key Function**: `calculateBilling(input: BillingInput): BillingBreakdown`

**Input**:
```typescript
{
  totalKWh: number,
  afaRate?: number (default: -0.065)
}
```

**Output**:
```typescript
{
  totalKWh: number,
  energyCharge: number,
  capacityCharge: number,
  networkCharge: number,
  retailCharge: number,
  afa: number,
  eeciRebate: number,
  subtotal: number,
  kwtbb: number,
  serviceTax: number,
  totalPayable: number
}
```

**Calculation Logic**:
1. Determine energy rate (standard vs high-use)
2. Calculate base charges (energy, capacity, network)
3. Apply retail charge if threshold met
4. Apply AFA if threshold met
5. Calculate EECI rebate (tiered)
6. Calculate subtotal
7. Apply KWTBB if threshold met
8. Apply service tax if threshold met
9. Calculate final total

### Per-PZEM Allocation

**Challenge**: Total bill must be calculated first (non-linear), then distributed proportionally

**Solution**: Proportional allocation based on kWh share

**Formula**:
```
For each PZEM:
  percentage = (pzemKWh / totalKWh) * 100
  allocatedBill = (pzemKWh / totalKWh) * totalBill
```

**Why This Approach**:
- Respects non-linear tariff structure
- Fair distribution based on consumption
- Total of allocations equals total bill

**Implementation**: `calculatePerPzemBillAllocation()` in `index.ts`

---

## Deployment Strategy

### Firebase Hosting

**Deployment**:
```bash
firebase deploy --only hosting
```

**Configuration**: `firebase.json`
- Public directory: `public`
- SPA routing: All routes → `index.html`
- Ignore: `node_modules`, dotfiles

**URL**: `https://iot-energy-monitoring-sy-1d1a1.web.app`

### Node.js Cloud Functions

**Deployment**:
```bash
firebase deploy --only functions
```

**Configuration**: `functions/package.json`
- Runtime: Node.js 20
- Entry point: `lib/index.js` (compiled from TypeScript)

**Build Process**:
1. TypeScript compilation (`tsc`)
2. Firebase CLI packages functions
3. Deploys to `asia-southeast1` region

### Python Cloud Function

**Deployment**:
```bash
gcloud functions deploy predict_energy_consumption \
  --gen2 \
  --runtime=python311 \
  --region=asia-southeast1 \
  --source=functions-python \
  --entry-point=predict_energy_consumption \
  --trigger-http \
  --allow-unauthenticated
```

**Why Separate**:
- Firebase CLI Python support has limitations
- Direct `gcloud` deployment more reliable
- Gen 2 architecture for ML workloads

### Cloud Scheduler

**Daily Rollup**:
- Schedule: `58 23 * * *` (11:58 PM MYT)
- Timezone: `Asia/Kuala_Lumpur`
- Function: `dailyRollup`

**Monthly Bill**:
- Schedule: `5 0 1 * *` (12:05 AM MYT on 1st day)
- Timezone: `Asia/Kuala_Lumpur`
- Function: `monthlyBill`

### Environment Configuration

**Firebase Config**: Stored in `firebase.json`
**Runtime Config**: Firebase Runtime Config API for API keys
**Secrets**: Stored in Firebase Secret Manager (if needed)

---

## Challenges & Solutions

### Challenge 1: Data Reset and Re-aggregation

**Problem**: After reset, old `/history` entries would be re-processed, causing duplicate aggregation

**Solution**: Baseline marker system
- Store energy values at reset time
- Calculate deltas from baseline, not from previous history
- Prevents re-aggregation of old data

**Implementation**: `/resets/{month}` collection with `baselineEnergy`

### Challenge 2: Non-linear Tariff Allocation

**Problem**: Cannot calculate each PZEM's bill independently (tariff is non-linear)

**Solution**: Two-step process
1. Calculate total bill from total kWh
2. Distribute proportionally based on kWh share

**Result**: Fair allocation that respects tariff structure

### Challenge 3: Python Function Deployment

**Problem**: Firebase CLI Python deployment failed (virtualenv issues on Windows)

**Solution**: Direct Google Cloud Functions deployment via `gcloud`
- Bypasses Firebase CLI limitations
- More reliable for ML workloads
- Gen 2 architecture support

### Challenge 4: Missing Lag Features

**Problem**: Historical data might have < 9 days, causing ML prediction errors

**Solution**: Fill missing lags with last known value
- Ensures model always receives 9 lag features
- Maintains prediction accuracy
- Handles edge cases gracefully

### Challenge 5: Real-time Updates

**Problem**: Firebase Realtime Database listeners complex for SPA

**Solution**: REST API polling
- Simple implementation
- Works with vanilla JavaScript
- Sufficient for 5-second update intervals
- No WebSocket complexity

### Challenge 6: AFA Calculation Bug

**Problem**: AFA was calculating for usage < 600 kWh (should be 0)

**Solution**: Added threshold check in `billingLogic.ts`
```typescript
if (totalKWh >= 600) {
  afa = totalKWh * afaRate;
}
```

### Challenge 7: Chart Colors for Dark Theme

**Problem**: Charts not visible on dark background

**Solution**: Updated Chart.js configuration
- Light gray axes and grid lines
- Bright data series colors
- Transparent backgrounds
- Custom color palette

---

## Future Enhancements

### Short-term
1. **User Authentication**: Firebase Auth for multi-user support
2. **Historical Data Export**: CSV/PDF export of consumption data
3. **Alerts & Notifications**: Email/SMS for high consumption
4. **Mobile App**: React Native or Flutter app

### Medium-term
1. **Multiple Properties**: Support for multiple locations
2. **Cost Optimization**: Recommendations based on usage patterns
3. **Integration**: Smart home systems (Home Assistant, etc.)
4. **Advanced Analytics**: Trend analysis, anomaly detection

### Long-term
1. **Solar Integration**: Track solar generation vs consumption
2. **Demand Response**: Automatic load shedding during peak hours
3. **Blockchain**: Immutable energy consumption records
4. **AI Optimization**: ML-based energy optimization recommendations

---

## Conclusion

The MyTenaga Energy Monitoring System successfully integrates IoT hardware, cloud infrastructure, and machine learning to provide comprehensive energy monitoring and billing. The architecture is scalable, maintainable, and cost-effective, leveraging Firebase's serverless infrastructure and Google Cloud's ML capabilities.

**Key Achievements**:
- Real-time multi-sensor monitoring
- Accurate TNB tariff billing calculation
- Fair per-sensor bill allocation
- ML-powered consumption forecasting
- Modern, responsive web interface

**Technical Highlights**:
- Event-driven serverless architecture
- Baseline mechanism for data integrity
- Recursive ML forecasting
- Non-linear tariff handling
- Dark theme UI/UX

This system demonstrates the practical application of IoT, cloud computing, and machine learning in residential energy management, providing valuable insights for energy conservation and cost optimization.

---

## Appendix: File Structure

```
FYP/
├── FYP.ino                    # ESP32 Arduino code
├── firebase.json              # Firebase configuration
├── functions/
│   ├── src/
│   │   ├── index.ts          # Main Cloud Functions
│   │   └── billingLogic.ts   # TNB billing calculation
│   ├── package.json
│   └── tsconfig.json
├── functions-python/
│   ├── main.py               # XGBoost prediction function
│   ├── requirements.txt
│   ├── london_energy_xgboost.model
│   └── model_hyperparameters.json
├── public/
│   ├── index.html            # Frontend SPA
│   ├── style.css            # Dark theme styles
│   └── script.js            # Client-side logic
├── firestore.rules
├── firestore.indexes.json
└── database.rules.json
```

---

**Document Version**: 1.0  
**Last Updated**: November 2025  
**Author**: MyTenaga Development Team






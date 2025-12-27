# MyTenaga - Smart Energy Monitoring System

A comprehensive IoT-based energy monitoring dashboard that tracks real-time energy consumption from multiple PZEM-004T sensors, provides detailed analytics, billing calculations, and AI-powered energy consumption predictions.

![MyTenaga Logo](public/logo.png)

## 🌟 Features

### Real-Time Monitoring
- **5 PZEM-004T Sensors**: Monitor individual energy consumption from up to 5 sensors
- **Real-Time Dashboard**: Live power, voltage, current, and energy readings
- **Interactive Charts**: Dynamic Chart.js visualizations for real-time and historical data
- **Sensor Customization**: Customizable sensor names stored in Firestore

### Analytics & Reports
- **Daily Energy Consumption**: Historical daily kWh consumption charts
- **Per-PZEM Breakdown**: Stacked bar charts showing daily consumption by sensor
- **Monthly Allocation**: Pie charts and summaries showing energy share by PZEM
- **Energy Forecast**: XGBoost ML model predictions for end-of-month consumption

### Billing & Tariff
- **TNB Domestic Tariff A**: Accurate billing calculations based on Malaysian TNB rates
- **Current Month Bill**: Detailed breakdown of all charges (Energy, Capacity, Network, etc.)
- **Forecast Bill**: Predicted end-of-month bill based on current usage patterns
- **Per-PZEM Allocation**: Bill allocation breakdown by sensor

### Smart Alerts
- **Email Notifications**: Automated alerts when energy usage reaches warning/critical thresholds
- **Configurable Thresholds**: Set custom warning and critical percentages
- **Monthly Target Tracking**: Track usage against kWh or bill amount targets

### Modern UI
- **Dark Theme**: Beautiful modern dark theme with gradient backgrounds
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Custom Branding**: MyTenaga logo and branding throughout

## 🏗️ Architecture

### Frontend
- **HTML/CSS/JavaScript**: Vanilla web technologies
- **Chart.js**: Data visualization
- **Firebase SDK**: Real-time data access
- **Responsive Design**: Mobile-first approach

### Backend
- **Firebase Realtime Database**: Real-time sensor data storage
- **Firestore**: Configuration, sensor names, billing history
- **Cloud Functions (Node.js)**: 
  - Data aggregation (daily/monthly rollups)
  - Billing calculations
  - Email alerts
  - API endpoints
- **Cloud Functions (Python)**: 
  - XGBoost energy consumption prediction

### Hardware
- **ESP32**: Microcontroller for sensor data collection
- **PZEM-004T**: Energy monitoring sensors (up to 5 units)

## 📁 Project Structure

```
FYP/
├── public/                 # Frontend web application
│   ├── index.html          # Main HTML file
│   ├── style.css           # Dark theme styles
│   ├── script.js           # Frontend logic
│   └── logo.png            # MyTenaga logo
├── functions/              # Node.js Cloud Functions
│   ├── src/
│   │   ├── index.ts        # Main functions (billing, alerts, etc.)
│   │   ├── billingLogic.ts # TNB tariff calculations
│   │   └── predictEnergy.ts
│   └── package.json
├── functions-python/        # Python Cloud Functions
│   ├── main.py             # XGBoost prediction function
│   ├── london_energy_xgboost.model
│   └── requirements.txt
├── FYP.ino                  # ESP32 Arduino code
├── firebase.json            # Firebase configuration
├── firestore.rules          # Firestore security rules
└── database.rules.json      # Realtime Database rules
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Firebase CLI
- Google Cloud SDK (for Python functions)
- Python 3.11+ (for XGBoost function)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mitenaga.git
   cd mitenaga
   ```

2. **Install Node.js dependencies**
   ```bash
   cd functions
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   cd functions-python
   pip install -r requirements.txt
   ```

4. **Configure Firebase**
   - Create a Firebase project
   - Update `firebase.json` with your project ID
   - Configure Firestore and Realtime Database

5. **Deploy**
   ```bash
   # Deploy Node.js functions
   firebase deploy --only functions
   
   # Deploy Python function (separately)
   cd functions-python
   gcloud functions deploy predict_energy_consumption --gen2 --runtime=python311 --region=asia-southeast1 --source=. --entry-point=predict_energy_consumption --trigger-http --allow-unauthenticated
   
   # Deploy frontend
   firebase deploy --only hosting
   ```

## 📊 Key Features Explained

### TNB Billing Calculation
The system implements the complete TNB Domestic Tariff A (2025) structure:
- Energy Charge (Caj Tenaga): RM 0.2703/kWh (standard), RM 0.3703/kWh (>1500 kWh)
- Capacity Charge (Caj Kapasiti): RM 0.0455/kWh
- Network Charge (Caj Rangkaian): RM 0.1285/kWh
- Retail Service Charge (Caj Peruncitan): RM 10.00/month (≥600 kWh)
- AFA (Additional Fixed Adjustment): Configurable (default: -RM 0.065/kWh)
- EECI Rebate: Tiered rebate up to -RM 0.25/kWh (<1000 kWh)
- KWTBB: 1.6% surcharge (>300 kWh)
- Service Tax: 8% (>600 kWh)

### XGBoost Energy Prediction
- Uses historical daily consumption data
- Features: day of week, day of year, month, quarter, workday, lag values
- Predicts daily consumption until end of month
- Provides forecasted monthly total and bill estimate

### Email Alerts
- Configurable warning and critical thresholds
- Sends alerts when predicted usage exceeds thresholds
- Includes detailed billing breakdown in critical alerts
- Per-PZEM breakdown available in critical emails

## 🔧 Configuration

### App Settings (Firestore: `config/appSettings`)
- `ownerEmail`: Email address for alerts
- `emailAlertsEnabled`: Enable/disable email alerts
- `monthlyTargetType`: "kwh" or "bill"
- `monthlyTargetValue`: Target value
- `warnPercent`: Warning threshold percentage
- `criticalPercent`: Critical threshold percentage
- `includePzemBreakdownInEmail`: Include per-PZEM breakdown
- `AFA_rate`: Additional Fixed Adjustment rate

### Firebase Functions Config
```bash
firebase functions:config:set smtp.host="smtp.gmail.com" smtp.port="587" smtp.user="your-email@gmail.com" smtp.pass="your-app-password"
```

## 📝 License

This project is part of a Final Year Project (FYP) for academic purposes.

## 👤 Author

Your Name - [Your GitHub](https://github.com/yourusername)

## 🙏 Acknowledgments

- TNB for tariff structure documentation
- Firebase for backend infrastructure
- Chart.js for data visualization
- XGBoost for machine learning predictions


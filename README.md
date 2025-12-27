# MyTenaga - Energy Monitoring System with AI Analytics

A comprehensive IoT-based energy monitoring dashboard that tracks real-time energy consumption from multiple PZEM-004T sensors, provides detailed analytics, billing calculations, and AI-powered energy consumption predictions.

![MyTenaga Logo](public/Mytenagafull.png)

<img width="497" height="502" alt="prototype123-removebg-preview" src="https://github.com/user-attachments/assets/c1fffcf7-2d2d-4b08-8497-a6764ecef037" />


## 🌟 Features

### Real-Time Monitoring
- **5 PZEM-004T Sensors**: Monitor individual energy consumption from up to 5 sensors
- **Real-Time Dashboard**: Live power, voltage, current, and energy readings
- **Interactive Charts**: Dynamic Chart.js visualizations for real-time and historical data
- **Sensor Customization**: Customizable sensor names stored in Firestore

<img width="1811" height="429" alt="dashboard1" src="https://github.com/user-attachments/assets/96ce41c7-2ab7-4dd4-9d76-eaa53c33edc9" />

<img width="1627" height="537" alt="image" src="https://github.com/user-attachments/assets/01244c1a-121b-440a-b3ad-e1d6c1580b04" />

<img width="1129" height="632" alt="image" src="https://github.com/user-attachments/assets/cbdfc8d8-b51e-4648-963a-c6493b370e26" />



### Analytics & Reports
- **Daily Energy Consumption**: Historical daily kWh consumption charts
- **Per-PZEM Breakdown**: Stacked bar charts showing daily consumption by sensor
- **Monthly Allocation**: Pie charts and summaries showing energy share by PZEM
- **Energy Forecast**: XGBoost ML model predictions for end-of-month consumption

<img width="957" height="633" alt="image" src="https://github.com/user-attachments/assets/fcb03f14-befc-4f93-ba1a-a8fad062b32f" />

<img width="802" height="854" alt="image" src="https://github.com/user-attachments/assets/d3127b9a-fcc5-4a50-a548-f17c75cd4504" />



### Billing & Tariff
- **TNB Domestic Tariff A**: Accurate billing calculations based on Malaysian TNB rates
- **Current Month Bill**: Detailed breakdown of all charges (Energy, Capacity, Network, etc.)
- **Forecast Bill**: Predicted end-of-month bill based on current usage patterns
- **Per-PZEM Allocation**: Bill allocation breakdown by sensor

<img width="502" height="830" alt="image" src="https://github.com/user-attachments/assets/07ee44c0-fe20-4af0-b671-7d3a2752c4ec" />


### Smart Alerts
- **Email Notifications**: Automated alerts when energy usage reaches warning/critical thresholds
- **Configurable Thresholds**: Set custom warning and critical percentages
- **Monthly Target Tracking**: Track usage against kWh or bill amount targets

<img width="560" height="593" alt="image" src="https://github.com/user-attachments/assets/361860e7-0e85-4bdd-92a2-9688eb92b45b" />

<img width="564" height="781" alt="image" src="https://github.com/user-attachments/assets/4203ff2f-cf50-4949-92a9-c04f69142afc" />



## 🏗️ Architecture

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/5434499c-d91c-43b0-808e-3538fb530ca0" />


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

Muhammad Durrani Hakim Bin Mohd Fared - [My Website](https://durranihakim.netlify.app/)

## 🙏 Acknowledgments

- TNB for tariff structure documentation
- Firebase for backend infrastructure
- Chart.js for data visualization
- XGBoost for machine learning predictions


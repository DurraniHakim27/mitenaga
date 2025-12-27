"""
Firebase Cloud Function for Energy Consumption Prediction using XGBoost
Predicts energy consumption until the end of the current month
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd
import xgboost as xgb

# For Google Cloud Functions - use Flask Request directly
from flask import Request
from firebase_admin import initialize_app, firestore
import firebase_admin

# Initialize Firebase Admin (only once)
if not firebase_admin._apps:
    initialize_app()

# Global variables for model and hyperparameters (loaded once)
model = None
hyperparameters = None
model_loaded = False

# Feature names used when training the XGBoost model
FEATURE_COLUMNS = [
    "day_of_week",
    "day_of_year",
    "month",
    "quarter",
    "year",
    "workday",
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_4",
    "lag_5",
    "lag_6",
    "lag_7",
    "lag_8",
    "lag_9",
]


def load_model():
    """Load XGBoost model and hyperparameters from files"""
    global model, hyperparameters, model_loaded
    
    if model_loaded:
        return
    
    try:
        # Get the directory where this script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, 'london_energy_xgboost.model')
        hyperparams_path = os.path.join(script_dir, 'model_hyperparameters.json')
        
        # Load model
        model = xgb.Booster()
        model.load_model(model_path)
        print(f"✅ Model loaded from {model_path}")
        
        # Load hyperparameters
        with open(hyperparams_path, 'r') as f:
            hyperparameters = json.load(f)
        print(f"✅ Hyperparameters loaded from {hyperparams_path}")
        
        model_loaded = True
        print("✅ Model and hyperparameters loaded successfully")
        
    except Exception as e:
        print(f"❌ Error loading model: {str(e)}")
        raise


def get_historical_consumption(days: int = 9) -> List[float]:
    """
    Fetch historical consumption data from Firebase
    Returns list of consumption values (oldest first, up to 'days' days)
    """
    try:
        # Use Firestore to get daily usage data
        db = firestore.client()
        today = datetime.now()
        consumption_data = []
        
        for i in range(days - 1, -1, -1):  # Go backwards from (days-1) to 0
            date_str = (today - timedelta(days=i)).strftime('%Y-%m-%d')
            
            # Try Firestore first
            doc_ref = db.collection('usage_daily').document(date_str)
            doc = doc_ref.get()
            
            if doc.exists:
                data = doc.to_dict()
                if data and 'totalKWh' in data:
                    consumption_data.append(float(data['totalKWh']))
                    continue
            
            # If not in Firestore, try RTDB via REST API (fallback)
            # Note: Firebase Admin Python SDK doesn't directly support RTDB
            # We'll rely on Firestore for now, but you can add REST API calls if needed
        
        print(f"📊 Fetched {len(consumption_data)} days of historical data")
        return consumption_data
        
    except Exception as e:
        print(f"⚠️ Error fetching historical data: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


def fill_missing_lags(historical_data: List[float], required_lags: int = 9) -> List[float]:
    """
    Fill missing lag values using the last known value
    If we have fewer than required_lags values, pad with the last known value
    """
    if not historical_data:
        # If no data at all, return zeros (or a default value)
        return [0.0] * required_lags
    
    # Get the last known value
    last_value = historical_data[-1] if historical_data else 0.0
    
    # If we have enough data, return the last N values
    if len(historical_data) >= required_lags:
        return historical_data[-required_lags:]
    
    # Otherwise, pad with the last known value
    missing_count = required_lags - len(historical_data)
    padded_data = historical_data + [last_value] * missing_count
    
    print(f"📈 Filled {missing_count} missing lags with last value: {last_value:.3f}")
    return padded_data


def create_features(date: datetime, lag_values: List[float]) -> pd.DataFrame:
    """
    Create feature vector for a given date.
    Returns a pandas DataFrame with named columns so XGBoost sees feature names.
    """
    features = [
        date.weekday(),                  # day_of_week (0=Monday, 6=Sunday)
        date.timetuple().tm_yday,        # day_of_year
        date.month,                      # month
        (date.month - 1) // 3 + 1,       # quarter
        date.year,                       # year
        1 if date.weekday() < 5 else 0,  # workday (Monday-Friday = 1)
    ]

    # Add lag features (lag_1 to lag_9). lag_1 is most recent, lag_9 oldest.
    features.extend(lag_values)

    # Wrap in DataFrame with correct column names
    return pd.DataFrame([features], columns=FEATURE_COLUMNS)


def predict_until_end_of_month(
    start_date: datetime,
    historical_data: List[float],
    model: xgb.Booster
) -> List[Dict[str, Any]]:
    """
    Recursive multi-step forecasting until the end of the month
    Uses previous predictions as lag_1 for next predictions
    """
    # Get last day of current month
    if start_date.month == 12:
        end_date = datetime(start_date.year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = datetime(start_date.year, start_date.month + 1, 1) - timedelta(days=1)
    
    days_to_predict = (end_date - start_date).days + 1
    
    print(f"📅 Predicting from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')} ({days_to_predict} days)")
    
    # Prepare lag values (fill missing ones)
    lag_values = fill_missing_lags(historical_data, required_lags=9)
    
    predictions = []
    current_date = start_date
    
    # Maintain a rolling window of predictions for lag features
    prediction_window = lag_values.copy()  # Start with historical data
    
    for day in range(days_to_predict):
        # Create features for current date
        features = create_features(current_date, prediction_window[-9:])
        
        # Convert to DMatrix for XGBoost, preserving feature names
        dmatrix = xgb.DMatrix(features, feature_names=FEATURE_COLUMNS)
        
        # Predict
        prediction = model.predict(dmatrix)[0]
        
        # Store prediction
        predictions.append({
            'date': current_date.strftime('%Y-%m-%d'),
            'day_of_week': current_date.strftime('%A'),
            'predicted_consumption': float(prediction),
            'day_number': day + 1
        })
        
        # Update prediction window: add new prediction, remove oldest
        prediction_window.append(prediction)
        if len(prediction_window) > 9:
            prediction_window.pop(0)
        
        # Move to next day
        current_date += timedelta(days=1)
    
    return predictions


# Google Cloud Functions Gen 2 entry point
def predict_energy_consumption(request: Request):
    """
    HTTP Cloud Function endpoint for energy consumption prediction
    POST /predict_energy_consumption
    Body (optional): {"mode": "end_of_month"} or empty for default
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return ('', 204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        })
    
    try:
        # Load model if not already loaded
        load_model()
        
        # Get request mode (default: end_of_month)
        request_data = {}
        if request.method == 'POST':
            try:
                if request.is_json:
                    request_data = request.get_json() or {}
            except:
                pass
        
        mode = request_data.get('mode', 'end_of_month')
        
        # Get current date
        now = datetime.now()
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Fetch historical consumption data
        historical_data = get_historical_consumption(days=30)  # Fetch last 30 days
        
        if mode == 'end_of_month':
            # Predict until end of current month
            predictions = predict_until_end_of_month(
                start_date=start_date,
                historical_data=historical_data,
                model=model
            )
            
            # Calculate summary statistics
            total_predicted = sum(p['predicted_consumption'] for p in predictions)
            avg_daily = total_predicted / len(predictions) if predictions else 0
            
            response = {
                'success': True,
                'mode': 'end_of_month',
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': predictions[-1]['date'] if predictions else None,
                'days_predicted': len(predictions),
                'total_predicted_kwh': round(total_predicted, 3),
                'average_daily_kwh': round(avg_daily, 3),
                'predictions': predictions,
                'historical_data_points': len(historical_data),
                'timestamp': datetime.now().isoformat()
            }
            
            return (json.dumps(response, indent=2), 200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            })
        
        else:
            return (json.dumps({'error': f'Unknown mode: {mode}'}), 400, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            })
    
    except Exception as e:
        error_msg = f"Error in prediction: {str(e)}"
        print(f"❌ {error_msg}")
        import traceback
        traceback.print_exc()
        
        return (json.dumps({
            'success': False,
            'error': error_msg,
            'timestamp': datetime.now().isoformat()
        }), 500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        })


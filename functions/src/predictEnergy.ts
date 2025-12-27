/**
 * Energy Consumption Prediction Function
 * 
 * Note: This is a placeholder that returns mock predictions.
 * For full XGBoost predictions, deploy the Python function separately
 * or use a Node.js ML library.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const REGION = 'asia-southeast1';

/**
 * Predict energy consumption until end of month
 * This version uses simple linear extrapolation based on historical data
 * For full XGBoost predictions, use the Python function
 */
export const predictEnergyConsumption = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const firestore = admin.firestore();
    const requestData = req.method === 'POST' ? (req.body || {}) : {};
    const mode = requestData.mode || 'end_of_month';

    // Get current date
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
    // Calculate end of month
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const daysToPredict = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Fetch historical consumption data (last 30 days)
    const historicalData: number[] = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const docRef = firestore.collection('usage_daily').doc(dateStr);
      const doc = await docRef.get();
      
      if (doc.exists) {
        const data = doc.data();
        if (data && data.totalKWh) {
          historicalData.push(data.totalKWh);
        }
      }
    }

    if (mode === 'end_of_month') {
      // Simple prediction: use average of last 7 days, or last known value
      let avgDaily = 0;
      if (historicalData.length > 0) {
        const recentData = historicalData.slice(-7); // Last 7 days
        const sum = recentData.reduce((a, b) => a + b, 0);
        avgDaily = sum / recentData.length;
      } else {
        // No historical data - use a default
        avgDaily = 2.0; // Default 2 kWh/day
      }

      // Generate predictions
      const predictions: Array<{
        date: string;
        day_of_week: string;
        predicted_consumption: number;
        day_number: number;
      }> = [];

      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      for (let day = 0; day < daysToPredict; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + day);
        
        // Simple variation: weekends might be slightly different
        let dailyPrediction = avgDaily;
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          // Weekend - slightly higher consumption
          dailyPrediction = avgDaily * 1.1;
        }
        
        predictions.push({
          date: currentDate.toISOString().split('T')[0],
          day_of_week: daysOfWeek[dayOfWeek],
          predicted_consumption: Math.max(0, dailyPrediction),
          day_number: day + 1,
        });
      }

      const totalPredicted = predictions.reduce((sum, p) => sum + p.predicted_consumption, 0);
      const averageDaily = totalPredicted / predictions.length;

      res.status(200).json({
        success: true,
        mode: 'end_of_month',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        days_predicted: predictions.length,
        total_predicted_kwh: Math.round(totalPredicted * 1000) / 1000,
        average_daily_kwh: Math.round(averageDaily * 1000) / 1000,
        predictions: predictions,
        historical_data_points: historicalData.length,
        note: 'This is a simple linear prediction. For XGBoost predictions, deploy the Python function.',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Unknown mode: ${mode}`,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error('Error in prediction:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});


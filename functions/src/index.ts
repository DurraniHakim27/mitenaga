import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { calculateBilling, BillingInput } from './billingLogic';
const nodemailer = require('nodemailer');
export { predictEnergyConsumption } from './predictEnergy';

admin.initializeApp();

const db = admin.database();
const firestore = admin.firestore();

// Use asia-southeast1 region to match database location
const REGION = 'asia-southeast1';

/**
 * RTDB Trigger: When a new history entry is created, aggregate it
 */
export const onHistoryCreate = functions.region(REGION).database
  .ref('/history/{pushId}')
  .onCreate(async (snapshot, context) => {
    const pushId = context.params.pushId;
    const current = snapshot.val();

    try {
      console.log(`Processing history entry: ${pushId}`);

      // Get current timestamp and parse date
      const timestamp = current.timestamp || current.ingestedAt || new Date().toISOString();
      
      // Check if this entry was created before a reset (ignore if timestamp is before reset)
      // This prevents re-aggregating old data after a reset
      const entryDate = new Date(timestamp);
      const now = new Date();
      const hoursDiff = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60);
      
      // If entry is more than 24 hours old, it might be from before reset - log but process normally
      // (We can't skip it because we don't know if it was already processed)
      if (hoursDiff > 24) {
        console.warn(`⚠️ Old history entry detected: ${hoursDiff.toFixed(1)} hours old. Processing anyway (might be duplicate).`);
      }
      const date = new Date(timestamp);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const monthStr = dateStr.substring(0, 7); // YYYY-MM

      // Get current total energy
      const currentEnergy = current.total?.energy || 0;

      // Check if there was a reset for this month - get baseline energy values
      // Read from RTDB (most up-to-date) first, then fallback to Firestore
      const resetRef = await db.ref(`/resets/${monthStr}`).once('value');
      let resetData = resetRef.val();
      
      // If RTDB doesn't have baselinePzemEnergies or it's empty, try Firestore
      if (!resetData || !resetData.baselinePzemEnergies || Object.keys(resetData.baselinePzemEnergies || {}).length === 0) {
        console.log(`  RTDB reset data missing or incomplete (baselinePzemEnergies: ${JSON.stringify(resetData?.baselinePzemEnergies)}), checking Firestore...`);
        const firestoreResetRef = firestore.collection('resets').doc(monthStr);
        const firestoreResetDoc = await firestoreResetRef.get();
        if (firestoreResetDoc.exists) {
          const firestoreData = firestoreResetDoc.data();
          console.log(`  Firestore baseline data:`, JSON.stringify({
            baselineEnergy: firestoreData?.baselineEnergy,
            baselinePzemEnergies: firestoreData?.baselinePzemEnergies,
            baselinePzemKeys: firestoreData?.baselinePzemEnergies ? Object.keys(firestoreData.baselinePzemEnergies) : [],
          }, null, 2));
          resetData = {
            ...resetData,
            baselineEnergy: firestoreData?.baselineEnergy || resetData?.baselineEnergy || 0,
            baselinePzemEnergies: firestoreData?.baselinePzemEnergies || resetData?.baselinePzemEnergies || {},
          };
          console.log(`  ✅ Using Firestore baseline data (${Object.keys(resetData.baselinePzemEnergies || {}).length} PZEMs)`);
        } else {
          console.warn(`  ⚠️ No reset data found in RTDB or Firestore for ${monthStr}`);
        }
      } else {
        console.log(`  ✅ Using RTDB baseline data (${Object.keys(resetData.baselinePzemEnergies || {}).length} PZEMs)`);
        console.log(`  RTDB baselinePzemEnergies:`, JSON.stringify(resetData.baselinePzemEnergies, null, 2));
      }
      
      const resetTimestamp = resetData?.resetTimestamp || 0;
      const baselineEnergy = resetData?.baselineEnergy || 0; // Energy value at time of reset
      
      let deltaKWh = 0;
      let entries: any[] = [];
      
      // CRITICAL: If baseline exists, ALWAYS use it (don't fall back to history comparison)
      if (resetTimestamp > 0) {
        // After reset: ALWAYS use baseline energy as previous value
        // This prevents old cumulative values from being treated as new usage
        // NOTE: baselineEnergy can be 0 if sensors were at 0 when reset happened
        deltaKWh = Math.max(0, currentEnergy - baselineEnergy);
        console.log(`🔵 USING BASELINE: current=${currentEnergy.toFixed(6)} kWh, baseline=${baselineEnergy.toFixed(6)} kWh, delta=${deltaKWh.toFixed(6)} kWh`);
        
        // CRITICAL CHECK: If current energy is very close to baseline (within 0.01 kWh), it's likely the same reading
        // This handles the case where ESP32 sends the same cumulative value multiple times
        const energyDiff = Math.abs(currentEnergy - baselineEnergy);
        if (energyDiff < 0.01) {
          console.log(`   Current energy (${currentEnergy.toFixed(6)}) is very close to baseline (${baselineEnergy.toFixed(6)}), delta=0 (no new usage)`);
          deltaKWh = 0;
        }
        
        // SANITY CHECK: If delta is suspiciously large (>1 kWh), something is wrong
        // This means either baseline is wrong, or energy jumped dramatically
        if (deltaKWh > 1.0) {
          console.error(`❌ SUSPICIOUS DELTA: ${deltaKWh.toFixed(6)} kWh (current=${currentEnergy.toFixed(6)}, baseline=${baselineEnergy.toFixed(6)})`);
          console.error(`   This suggests baseline is wrong or energy jumped. IGNORING this update.`);
          console.error(`   💡 SOLUTION: Call nuclearReset to set baseline to current energy (${currentEnergy.toFixed(6)} kWh)`);
          deltaKWh = 0; // Ignore suspicious deltas
        }
      } else {
        // No baseline set - use normal history comparison (fallback for old data)
        console.log(`⚠️ No baseline found (resetTimestamp=${resetTimestamp}, baselineEnergy=${baselineEnergy}), using history comparison`);
        
        const historyRef = db.ref('/history');
        const snapshot2 = await historyRef.orderByKey().limitToLast(10).once('value');
        const historyData = snapshot2.val();
        entries = Object.entries(historyData || {})
          .map(([key, value]: [string, any]) => ({ 
            key, 
            ...value,
            entryTimestamp: value.timestamp || value.ingestedAt || '',
          }))
          .filter((entry: any) => {
            // Filter out entries from before reset
            if (resetTimestamp > 0 && entry.entryTimestamp) {
              const entryTime = new Date(entry.entryTimestamp).getTime();
              return entryTime >= resetTimestamp;
            }
            return true;
          })
          .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

        if (entries.length >= 2) {
          // Normal operation: compare with previous entry
          const previous = entries[entries.length - 2];
          const previousEnergy = previous.total?.energy || 0;
          deltaKWh = Math.max(0, currentEnergy - previousEnergy);
          console.log(`Using history comparison: current=${currentEnergy.toFixed(6)}, previous=${previousEnergy.toFixed(6)}, delta=${deltaKWh.toFixed(6)}`);
        } else {
          // No previous entries - no delta
          deltaKWh = 0;
          console.log(`No previous entries, delta=0`);
        }
      }

      // Sanity check: if delta is too large (>100 kWh), ignore it (likely device reset)
      if (deltaKWh > 100) {
        console.warn(`Delta too large (${deltaKWh} kWh), ignoring`);
        deltaKWh = 0;
      }

      console.log(`Delta kWh: ${deltaKWh} for date ${dateStr}`);

      if (deltaKWh > 0) {
        // Update Firestore daily aggregate
        const dailyRef = firestore.collection('usage_daily').doc(dateStr);
        await dailyRef.set(
          {
            totalKWh: admin.firestore.FieldValue.increment(deltaKWh),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            lastEntryId: pushId,
          },
          { merge: true }
        );

        // Track per-PZEM daily usage
        if (current.sensors) {
          const sensors = current.sensors;
          const baselinePzemEnergies = resetData?.baselinePzemEnergies || {};
          const previousSensors = entries.length >= 2 ? entries[entries.length - 2]?.sensors || {} : {};

          for (let i = 1; i <= 5; i++) {
            const pzemKey = `pzem${i}`;
            const currentEnergy = sensors[pzemKey]?.energy || 0;
            
            let previousEnergy = 0;
            if (resetTimestamp > 0 && baselinePzemEnergies[pzemKey] !== undefined) {
              previousEnergy = baselinePzemEnergies[pzemKey] || 0;
            } else if (previousSensors[pzemKey]) {
              previousEnergy = previousSensors[pzemKey]?.energy || 0;
            }
            
            const deltaEnergy = Math.max(0, currentEnergy - previousEnergy);
            
            // Skip if delta is too small or suspicious
            if (deltaEnergy < 0.01 || deltaEnergy > 1.0) {
              continue;
            }

            // Update per-PZEM daily usage
            const dailyPzemRef = firestore.collection('usage_daily_pzem').doc(`${dateStr}_${pzemKey}`);
            await dailyPzemRef.set(
              {
                date: dateStr,
                pzemId: pzemKey,
                kwh: admin.firestore.FieldValue.increment(deltaEnergy),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }

        // Update Firestore monthly aggregate
        const monthlyRef = firestore.collection('usage_monthly').doc(monthStr);
        await monthlyRef.set(
          {
            totalKWh: admin.firestore.FieldValue.increment(deltaKWh),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Track per-PZEM monthly kWh
        if (current.sensors) {
          const sensors = current.sensors;
          const previousSnapshot = entries.length >= 2 ? entries[entries.length - 2] : null;
          const previousSensors = previousSnapshot?.sensors || {};

          console.log('=== Per-PZEM Energy Tracking ===');
          console.log('Current sensors keys:', Object.keys(sensors));
          console.log('Current sensors (abbreviated):', JSON.stringify(
            Object.fromEntries(
              Object.entries(sensors).map(([key, val]: [string, any]) => [
                key,
                { energy: val?.energy || 0, power: val?.power || 0 }
              ])
            ),
            null,
            2
          ));
          if (previousSnapshot) {
            console.log('Previous sensors (abbreviated):', JSON.stringify(
              Object.fromEntries(
                Object.entries(previousSensors).map(([key, val]: [string, any]) => [
                  key,
                  { energy: val?.energy || 0, power: val?.power || 0 }
                ])
              ),
              null,
              2
            ));
          } else {
            console.log('No previous snapshot (first entry)');
          }

          // First pass: collect all current energy values for comparison
          const allCurrentEnergies: { [key: string]: number } = {};
          for (let i = 1; i <= 5; i++) {
            const pzemKey = `pzem${i}`;
            allCurrentEnergies[pzemKey] = sensors[pzemKey]?.energy || 0;
          }
          
          // Calculate average and detect outliers in sensor readings
          const energyValues = Object.values(allCurrentEnergies).filter(v => v > 0);
          const avgEnergy = energyValues.length > 0 ? energyValues.reduce((a, b) => a + b, 0) / energyValues.length : 0;
          const maxEnergy = Math.max(...Object.values(allCurrentEnergies));
          const minEnergy = Math.min(...Object.values(allCurrentEnergies).filter(v => v > 0));
          
          // If one sensor's energy is way higher than others, flag it
          if (maxEnergy > avgEnergy * 5 && avgEnergy > 0.1) {
            const outlier = Object.entries(allCurrentEnergies).find(([_, v]) => v === maxEnergy);
            console.warn(`⚠️ SENSOR OUTLIER: ${outlier?.[0]} energy reading is ${maxEnergy.toFixed(3)} kWh (avg: ${avgEnergy.toFixed(3)} kWh, min: ${minEnergy.toFixed(3)} kWh)`);
            console.warn(`   This suggests ${outlier?.[0]} may be reading incorrectly or has a different scale.`);
          }

          // Get baseline PZEM energies from reset (if reset happened)
          const baselinePzemEnergies = resetData?.baselinePzemEnergies || {};
          
          // Calculate delta for each PZEM
          for (let i = 1; i <= 5; i++) {
            const pzemKey = `pzem${i}`;
            const currentEnergy = sensors[pzemKey]?.energy || 0;
            
            let previousEnergy = 0;
            // CRITICAL: If baseline exists, ALWAYS use it (don't fall back to history)
            if (resetTimestamp > 0 && baselinePzemEnergies[pzemKey] !== undefined) {
              // After reset: use baseline energy as previous (can be 0 if sensor was at 0)
              previousEnergy = baselinePzemEnergies[pzemKey] || 0;
              console.log(`  🔵 ${pzemKey} using reset baseline: ${previousEnergy.toFixed(6)} kWh`);
            } else if (previousSensors[pzemKey]) {
              // No baseline - fallback to history comparison
              previousEnergy = previousSensors[pzemKey]?.energy || 0;
              console.log(`  ⚠️ ${pzemKey} no baseline, using history: ${previousEnergy.toFixed(6)} kWh`);
            }
            
            const deltaEnergy = Math.max(0, currentEnergy - previousEnergy);
            
            // CRITICAL CHECK: If current energy is very close to baseline (within 0.01 kWh), it's likely the same reading
            const energyDiff = Math.abs(currentEnergy - previousEnergy);
            if (energyDiff < 0.01) {
              console.log(`  ${pzemKey} current (${currentEnergy.toFixed(6)}) very close to baseline (${previousEnergy.toFixed(6)}), delta=0 (no new usage - this is correct!)`);
              // Still update the document to ensure it exists, but with 0 increment
              // This ensures the document is created even if delta is 0
              const pzemMonthlyRef = firestore.collection('usage_monthly_pzem').doc(`${monthStr}_${pzemKey}`);
              const currentDoc = await pzemMonthlyRef.get();
              if (!currentDoc.exists) {
                // Document doesn't exist - create it with 0
                await pzemMonthlyRef.set({
                  pzemId: pzemKey,
                  month: monthStr,
                  totalKWh: 0,
                  lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                console.log(`  ${pzemKey} created document with 0 (first time)`);
              }
              continue; // Skip increment - no new usage
            }
            
            // SANITY CHECK: If delta is suspiciously large, ignore it
            if (deltaEnergy > 1.0) {
              console.error(`  ❌ ${pzemKey} SUSPICIOUS DELTA: ${deltaEnergy.toFixed(6)} kWh (current=${currentEnergy.toFixed(6)}, previous=${previousEnergy.toFixed(6)})`);
              console.error(`     Ignoring this update.`);
              continue; // Skip this PZEM update
            }

            // Get current total before update
            const pzemMonthlyRef = firestore.collection('usage_monthly_pzem').doc(`${monthStr}_${pzemKey}`);
            const currentDoc = await pzemMonthlyRef.get();
            const currentTotal = currentDoc.exists ? (currentDoc.data()?.totalKWh || 0) : 0;

            console.log(`${pzemKey}: current=${currentEnergy.toFixed(6)} kWh, previous=${previousEnergy.toFixed(6)} kWh, delta=${deltaEnergy.toFixed(6)} kWh, total_before=${currentTotal.toFixed(3)} kWh`);

            // Enhanced sanity checks
            const MAX_DELTA_PER_UPDATE = 0.1; // Max 0.1 kWh per update (3 minutes = ~2kW load, reasonable max)
            const MAX_TOTAL_PER_PZEM = 1000; // Max 1000 kWh per PZEM per month (safety limit)
            const SUSPICIOUS_DELTA = 0.05; // Flag if delta > 0.05 kWh (50W for 3 min = suspicious)
            const MAX_RATE_KWH_PER_HOUR = 2; // Max 2 kWh/hour per PZEM (2kW constant load)
            
            // Calculate rate (assuming ~3 minute intervals)
            const ratePerHour = deltaEnergy * 20; // 20 updates per hour (3 min intervals)
            
            // Check if delta is suspiciously large
            if (deltaEnergy > SUSPICIOUS_DELTA) {
              console.warn(`⚠️ ${pzemKey} suspiciously large delta: ${deltaEnergy.toFixed(6)} kWh (rate: ${ratePerHour.toFixed(2)} kWh/hour)`);
              console.warn(`   Current: ${currentEnergy.toFixed(6)} kWh, Previous: ${previousEnergy.toFixed(6)} kWh`);
            }
            
            // Check if rate is too high
            if (ratePerHour > MAX_RATE_KWH_PER_HOUR) {
              console.error(`❌ ${pzemKey} rate too high: ${ratePerHour.toFixed(2)} kWh/hour (max: ${MAX_RATE_KWH_PER_HOUR} kWh/hour)`);
              console.error(`   Delta: ${deltaEnergy.toFixed(6)} kWh - IGNORING this update`);
              continue; // Skip this update
            }
            
            // Sanity check: ignore if delta is too large per update OR rate is too high
            if (deltaEnergy > 0 && deltaEnergy <= MAX_DELTA_PER_UPDATE && ratePerHour <= MAX_RATE_KWH_PER_HOUR) {
              const projectedTotal = currentTotal + deltaEnergy;
              
              // Additional check: if adding this delta would exceed monthly limit, cap it
              if (projectedTotal > MAX_TOTAL_PER_PZEM) {
                console.error(`❌ ${pzemKey} would exceed monthly limit (${projectedTotal.toFixed(3)} > ${MAX_TOTAL_PER_PZEM} kWh), capping at ${MAX_TOTAL_PER_PZEM} kWh`);
                await pzemMonthlyRef.set(
                  {
                    pzemId: pzemKey,
                    month: monthStr,
                    totalKWh: MAX_TOTAL_PER_PZEM,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                    capped: true,
                    originalDelta: deltaEnergy,
                  },
                  { merge: true }
                );
              } else {
                await pzemMonthlyRef.set(
                  {
                    pzemId: pzemKey,
                    month: monthStr,
                    totalKWh: admin.firestore.FieldValue.increment(deltaEnergy),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );
                const newTotal = currentTotal + deltaEnergy;
                console.log(`✅ Updated ${pzemKey} monthly usage: ${currentTotal.toFixed(3)} → ${newTotal.toFixed(3)} kWh (+${deltaEnergy.toFixed(6)} kWh)`);
              }
            } else if (deltaEnergy > MAX_DELTA_PER_UPDATE) {
              console.error(`❌ ${pzemKey} delta too large (${deltaEnergy.toFixed(6)} kWh > ${MAX_DELTA_PER_UPDATE} kWh), IGNORING - likely sensor error`);
              console.error(`   Current energy: ${currentEnergy.toFixed(6)} kWh, Previous: ${previousEnergy.toFixed(6)} kWh`);
            } else if (ratePerHour > MAX_RATE_KWH_PER_HOUR) {
              console.error(`❌ ${pzemKey} rate too high (${ratePerHour.toFixed(2)} kWh/hour > ${MAX_RATE_KWH_PER_HOUR} kWh/hour), IGNORING - sensor reading error`);
              console.error(`   Delta: ${deltaEnergy.toFixed(6)} kWh in ~3 minutes is unrealistic`);
            } else if (deltaEnergy === 0 && currentEnergy > 0) {
              console.log(`ℹ️ ${pzemKey} no change (current=${currentEnergy.toFixed(6)} kWh, previous=${previousEnergy.toFixed(6)} kWh, total=${currentTotal.toFixed(3)} kWh)`);
            } else if (currentEnergy === 0) {
              console.log(`ℹ️ ${pzemKey} energy is 0 (sensor may not be reading), total=${currentTotal.toFixed(3)} kWh`);
            }
          }
          console.log('=== End Per-PZEM Tracking ===');
        } else {
          console.warn('⚠️ No sensors data in current snapshot');
        }

        // Also update RTDB aggregates (for backward compatibility)
        await db.ref(`/aggregates/daily/${dateStr}`).set({
          totalKWh: admin.database.ServerValue.increment(deltaKWh),
          lastUpdated: admin.database.ServerValue.TIMESTAMP,
        });

        await db.ref(`/aggregates/monthly/${monthStr}`).set({
          totalKWh: admin.database.ServerValue.increment(deltaKWh),
          lastUpdated: admin.database.ServerValue.TIMESTAMP,
        });

        console.log(`Updated aggregates: daily=${dateStr}, monthly=${monthStr}, delta=${deltaKWh} kWh`);
      }

      return null;
    } catch (error) {
      console.error(`Error processing history entry ${pushId}:`, error);
      throw error;
    }
  });

/**
 * Scheduled function: Daily rollup (runs at 23:58 MYT)
 */
export const dailyRollup = functions.region(REGION).pubsub
  .schedule('58 23 * * *')
  .timeZone('Asia/Kuala_Lumpur')
  .onRun(async (context) => {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      console.log(`Running daily rollup for ${dateStr}`);

      // Read today's Firestore doc
      const dailyRef = firestore.collection('usage_daily').doc(dateStr);
      const dailyDoc = await dailyRef.get();

      const monthStr = today.toISOString().substring(0, 7);

      if (dailyDoc.exists) {
        const data = dailyDoc.data();
        console.log(`Daily usage for ${dateStr}: ${data?.totalKWh || 0} kWh`);
      } else {
        console.log(`No data found for ${dateStr}`);
      }

      // Ensure monthly doc exists
      const monthlyDocRef = firestore.collection('usage_monthly').doc(monthStr);
      await monthlyDocRef.set(
        {
          lastChecked: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Calculate per-PZEM bill allocation
      await calculatePerPzemBillAllocation(monthStr);

      // Finalize per-PZEM daily usage for yesterday (if not already done)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Read yesterday's usage_monthly_pzem to get final daily values
      const pzemMonthlySnapshot = await firestore.collection('usage_monthly_pzem')
        .where('month', '==', monthStr)
        .get();

      for (const doc of pzemMonthlySnapshot.docs) {
        const data = doc.data();
        const pzemId = data.pzemId;
        const monthTotal = data.totalKWh || 0;
        
        // Get sum of all previous days for this PZEM this month
        const dailyPzemSnapshot = await firestore.collection('usage_daily_pzem')
          .where('date', '>=', `${monthStr}-01`)
          .where('date', '<', yesterdayStr)
          .where('pzemId', '==', pzemId)
          .get();
        
        let previousDaysTotal = 0;
        dailyPzemSnapshot.forEach((dailyDoc) => {
          previousDaysTotal += dailyDoc.data()?.kwh || 0;
        });
        
        // Calculate yesterday's usage as difference
        const yesterdayKwh = Math.max(0, monthTotal - previousDaysTotal);
        
        // Write or update yesterday's daily PZEM usage
        const yesterdayPzemRef = firestore.collection('usage_daily_pzem').doc(`${yesterdayStr}_${pzemId}`);
        const yesterdayPzemDoc = await yesterdayPzemRef.get();
        
        if (!yesterdayPzemDoc.exists || (yesterdayPzemDoc.data()?.kwh || 0) < yesterdayKwh) {
          await yesterdayPzemRef.set({
            date: yesterdayStr,
            pzemId: pzemId,
            kwh: yesterdayKwh,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            finalized: true,
          }, { merge: true });
        }
      }

      return null;
    } catch (error) {
      console.error('Error in dailyRollup:', error);
      throw error;
    }
  });

/**
 * Scheduled function: Monthly billing (runs daily at 00:05 MYT, but only calculates on billing day)
 */
export const monthlyBill = functions.region(REGION).pubsub
  .schedule('5 0 * * *')
  .timeZone('Asia/Kuala_Lumpur')
  .onRun(async (context) => {
    try {
      const now = new Date();

      // Get billing config from Firestore (try appSettings first, then billing config)
      const appSettingsRef = firestore.collection('config').doc('appSettings');
      const appSettingsDoc = await appSettingsRef.get();
      const billingConfigRef = firestore.collection('config').doc('billing');
      const billingConfigDoc = await billingConfigRef.get();
      
      // Get AFA_rate from appSettings if available, otherwise from billing config
      let afaRate = -0.065;
      if (appSettingsDoc.exists && appSettingsDoc.data()?.AFA_rate !== undefined) {
        afaRate = appSettingsDoc.data()?.AFA_rate;
      } else if (billingConfigDoc.exists && billingConfigDoc.data()?.afaRate !== undefined) {
        afaRate = billingConfigDoc.data()?.afaRate;
      }
      
      const defaultConfig = {
        afaRate: afaRate,
        billingDay: 1, // Default: 1st of month
        serviceTaxScope: 'all',
      };
      const config = billingConfigDoc.exists ? billingConfigDoc.data() : defaultConfig;
      const configData = { ...defaultConfig, ...config };

      // Get current month - always use current month for now (simpler for testing)
      const monthStr = now.toISOString().substring(0, 7); // YYYY-MM (current)
      const billingMonthStr = monthStr;

      // For testing: always calculate for current month
      // TODO: For production, implement previous month logic on billing day
      console.log(`Calculating billing for current month: ${billingMonthStr}`);

      // Read monthly usage from Firestore
      const monthlyRef = firestore.collection('usage_monthly').doc(billingMonthStr);
      const monthlyDoc = await monthlyRef.get();

      if (!monthlyDoc.exists) {
        console.log(`No usage data found for ${billingMonthStr}`);
        return null;
      }

      const monthlyData = monthlyDoc.data();
      const totalKWh = monthlyData?.totalKWh || 0;

      console.log(`Total usage for ${billingMonthStr}: ${totalKWh} kWh`);

      // Calculate billing
      const billingInput: BillingInput = {
        totalKWh,
        afaRate: (configData.afaRate as number) || -0.065,
      };

      const billing = calculateBilling(billingInput);

      // Add metadata
      const billingResult = {
        ...billing,
        month: billingMonthStr,
        calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        config: {
          afaRate: billingInput.afaRate,
          billingDay: (configData.billingDay as number) || 1,
        },
      };

      // Write to RTDB
      console.log('Writing billing data to RTDB: /billing/currentMonth');
      await db.ref('/billing/currentMonth').set(billingResult);
      console.log('✅ Billing data written to RTDB');

      // Write to Firestore
      console.log('Writing billing data to Firestore: billing/currentMonth');
      await firestore.collection('billing').doc('currentMonth').set(billingResult);
      console.log('✅ Billing data written to Firestore');

      // Write to history
      console.log(`Writing billing history: billing_history/${billingMonthStr}`);
      await firestore.collection('billing_history').doc(billingMonthStr).set(billingResult);
      console.log('✅ Billing history written');

      console.log(`✅ Billing calculated for ${billingMonthStr}: RM ${billing.totalPayable.toFixed(2)}`);
      console.log(`Billing breakdown:`, JSON.stringify(billingResult, null, 2));

      return null;
    } catch (error) {
      console.error('Error in monthlyBill:', error);
      throw error;
    }
  });

/**
 * HTTP endpoint to reset ALL monthly data (for fresh start/testing)
 */
export const resetAllMonthlyData = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.body;
    const monthStr = month || new Date().toISOString().substring(0, 7); // Default to current month
    
    console.log(`Resetting ALL monthly data for ${monthStr}`);
    
    // 1. Reset all PZEM monthly totals
    const resetResults: { [key: string]: number } = {};
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      const docId = `${monthStr}_${pzemKey}`;
      const pzemMonthlyRef = firestore.collection('usage_monthly_pzem').doc(docId);
      
      const currentDoc = await pzemMonthlyRef.get();
      const currentValue = currentDoc.exists ? (currentDoc.data()?.totalKWh || 0) : 0;
      
      await pzemMonthlyRef.set({
        pzemId: pzemKey,
        month: monthStr,
        totalKWh: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        resetAt: admin.firestore.FieldValue.serverTimestamp(),
        previousValue: currentValue,
        resetReason: 'Full monthly data reset',
      }, { merge: true });
      
      resetResults[pzemKey] = currentValue;
      console.log(`  Reset ${pzemKey}: ${currentValue.toFixed(3)} → 0 kWh`);
    }
    
    // 2. Reset total monthly usage (Firestore)
    const monthlyRef = firestore.collection('usage_monthly').doc(monthStr);
    const monthlyDoc = await monthlyRef.get();
    const previousTotal = monthlyDoc.exists ? (monthlyDoc.data()?.totalKWh || 0) : 0;
    
    await monthlyRef.set({
      totalKWh: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      previousTotalKWh: previousTotal,
      resetReason: 'Full monthly data reset',
    }, { merge: true });
    
    console.log(`  Reset monthly total (Firestore): ${previousTotal.toFixed(3)} → 0 kWh`);
    
    // 2b. Reset RTDB aggregates (CRITICAL - this was missing!)
    await db.ref(`/aggregates/monthly/${monthStr}`).set({
      totalKWh: 0,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
      resetAt: admin.database.ServerValue.TIMESTAMP,
      previousTotalKWh: previousTotal,
      resetReason: 'Full monthly data reset',
    });
    console.log(`  Reset monthly total (RTDB aggregates): ${previousTotal.toFixed(3)} → 0 kWh`);
    
    // 3. Reset billing data (both Firestore and RTDB)
    await db.ref('/billing/currentMonth').remove();
    await firestore.collection('billing').doc('currentMonth').delete().catch(() => {});
    await firestore.collection('billing_history').doc(monthStr).delete().catch(() => {});
    console.log(`  Reset billing data (RTDB + Firestore)`);
    
    // 4. Reset allocation data (both Firestore and RTDB)
    await db.ref(`/billing_allocation/${monthStr}`).remove();
    await firestore.collection('billing_allocation').doc(monthStr).delete().catch(() => {});
    console.log(`  Reset allocation data (RTDB + Firestore)`);
    
    // 5. Reset daily aggregates for the month (optional but thorough)
    const daysInMonth = new Date(new Date(monthStr + '-01').getFullYear(), new Date(monthStr + '-01').getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0');
      const dateStr = `${monthStr}-${dayStr}`;
      await db.ref(`/aggregates/daily/${dateStr}`).remove().catch(() => {});
      // Also reset Firestore daily docs
      await firestore.collection('usage_daily').doc(dateStr).delete().catch(() => {});
    }
    console.log(`  Reset daily aggregates for ${monthStr} (RTDB + Firestore)`);
    
    // 6. Get current energy values from /latest BEFORE deleting history (CRITICAL!)
    // These are the baseline values - we'll use them to calculate deltas correctly
    const latestRef = await db.ref('/latest').once('value');
    const latestData = latestRef.val();
    const baselineTotalEnergy = latestData?.total?.energy || 0;
    const baselinePzemEnergies: { [key: string]: number } = {};
    
    // Check both root level (pzem1) and nested (sensors.pzem1)
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      if (latestData?.[pzemKey]) {
        baselinePzemEnergies[pzemKey] = latestData[pzemKey].energy || latestData[pzemKey].active_energy || 0;
      } else if (latestData?.sensors?.[pzemKey]) {
        baselinePzemEnergies[pzemKey] = latestData.sensors[pzemKey].energy || latestData.sensors[pzemKey].active_energy || 0;
      } else {
        baselinePzemEnergies[pzemKey] = 0;
      }
    }
    
    console.log(`  Baseline energy values at reset:`);
    console.log(`    Total: ${baselineTotalEnergy.toFixed(6)} kWh`);
    Object.entries(baselinePzemEnergies).forEach(([key, val]) => {
      console.log(`    ${key}: ${val.toFixed(6)} kWh`);
    });
    
    // 7. Delete old history entries for this month (CRITICAL - prevents re-aggregation)
    console.log(`  Deleting old history entries for ${monthStr}...`);
    const historyRef = db.ref('/history');
    const historySnapshot = await historyRef.once('value');
    const historyData = historySnapshot.val() || {};
    let deletedCount = 0;
    
    const resetTimestamp = Date.now();
    const monthStart = new Date(monthStr + '-01').getTime();
    const monthEnd = new Date(new Date(monthStr + '-01').getFullYear(), new Date(monthStr + '-01').getMonth() + 1, 0, 23, 59, 59).getTime();
    
    for (const [key, entry] of Object.entries(historyData)) {
      const entryData = entry as any;
      const entryTimestamp = entryData.timestamp || entryData.ingestedAt;
      if (entryTimestamp) {
        const entryDate = new Date(entryTimestamp).getTime();
        // Delete entries from this month
        if (entryDate >= monthStart && entryDate <= monthEnd) {
          await db.ref(`/history/${key}`).remove();
          deletedCount++;
        }
      }
    }
    console.log(`  Deleted ${deletedCount} history entries for ${monthStr}`);
    
    // 8. Set a reset marker with baseline energy values (CRITICAL!)
    const resetMarker = {
      month: monthStr,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetTimestamp: resetTimestamp,
      baselineEnergy: baselineTotalEnergy, // Store baseline total energy
      baselinePzemEnergies: baselinePzemEnergies, // Store baseline per-PZEM energies
    };
    await firestore.collection('resets').doc(monthStr).set(resetMarker);
    await db.ref(`/resets/${monthStr}`).set({
      month: monthStr,
      resetTimestamp: admin.database.ServerValue.TIMESTAMP,
      baselineEnergy: baselineTotalEnergy,
      baselinePzemEnergies: baselinePzemEnergies,
    });
    console.log(`  Set reset marker with baseline energies for ${monthStr}`);
    
    console.log(`✅ All monthly data reset for ${monthStr} (including ${deletedCount} history entries)`);

    res.status(200).json({
      success: true,
      message: `All monthly data reset for ${monthStr}`,
      month: monthStr,
      previousValues: {
        pzemTotals: resetResults,
        monthlyTotal: previousTotal,
      },
      baselineEnergies: {
        total: baselineTotalEnergy,
        pzem: baselinePzemEnergies,
      },
      resetAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in resetAllMonthlyData:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// QUICK DELETE: Delete ALL history entries (for manual cleanup)
export const deleteAllHistory = functions.region(REGION).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    console.log('🗑️ Deleting ALL history entries...');
    
    const historyRef = db.ref('/history');
    const historySnapshot = await historyRef.once('value');
    const historyData = historySnapshot.val() || {};
    const entries = Object.keys(historyData);
    
    console.log(`Found ${entries.length} history entries to delete`);
    
    // Delete all entries
    await historyRef.remove();
    
    console.log(`✅ Deleted ${entries.length} history entries`);
    
    res.status(200).json({
      success: true,
      message: `Deleted ${entries.length} history entries`,
      deletedCount: entries.length,
    });
  } catch (error: any) {
    console.error('Error deleting history:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// NUCLEAR OPTION: Reset EVERYTHING and set baseline to current values
export const nuclearReset = functions.region(REGION).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.body;
    const monthStr = month || new Date().toISOString().substring(0, 7);
    
    console.log(`💣 NUCLEAR RESET: Clearing ALL data and setting baseline for ${monthStr}`);
    
    // STEP 1: Get CURRENT energy values from /latest (these become the new baseline)
    const latestRef = await db.ref('/latest').once('value');
    const latestData = latestRef.val();
    const currentTotalEnergy = latestData?.total?.energy || 0;
    const currentPzemEnergies: { [key: string]: number } = {};
    
    if (latestData?.sensors) {
      for (let i = 1; i <= 5; i++) {
        const pzemKey = `pzem${i}`;
        currentPzemEnergies[pzemKey] = latestData.sensors[pzemKey]?.energy || 0;
      }
    }
    
    console.log(`  Current energy (new baseline): Total=${currentTotalEnergy.toFixed(6)} kWh`);
    
    // STEP 2: Reset ALL Firestore collections
    console.log(`  Resetting Firestore collections...`);
    
    // Reset usage_monthly
    await firestore.collection('usage_monthly').doc(monthStr).set({
      totalKWh: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetReason: 'Nuclear reset - all data cleared',
    }, { merge: true });
    
    // Reset usage_monthly_pzem
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      await firestore.collection('usage_monthly_pzem').doc(`${monthStr}_${pzemKey}`).set({
        pzemId: pzemKey,
        month: monthStr,
        totalKWh: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        resetAt: admin.firestore.FieldValue.serverTimestamp(),
        resetReason: 'Nuclear reset',
      }, { merge: true });
    }
    
    // Delete usage_daily for the month
    const daysInMonth = new Date(new Date(monthStr + '-01').getFullYear(), new Date(monthStr + '-01').getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0');
      const dateStr = `${monthStr}-${dayStr}`;
      await firestore.collection('usage_daily').doc(dateStr).delete().catch(() => {});
    }
    
    // STEP 3: Reset ALL RTDB aggregates (delete everything, not just this month)
    console.log(`  Resetting RTDB aggregates...`);
    
    // Delete ALL monthly aggregates (nuclear option)
    const aggregatesMonthlyRef = db.ref('/aggregates/monthly');
    const aggregatesMonthlySnapshot = await aggregatesMonthlyRef.once('value');
    const aggregatesMonthlyData = aggregatesMonthlySnapshot.val() || {};
    for (const key of Object.keys(aggregatesMonthlyData)) {
      await db.ref(`/aggregates/monthly/${key}`).remove();
    }
    console.log(`  Deleted ${Object.keys(aggregatesMonthlyData).length} monthly aggregates`);
    
    // Delete ALL daily aggregates (nuclear option)
    const aggregatesDailyRef = db.ref('/aggregates/daily');
    const aggregatesDailySnapshot = await aggregatesDailyRef.once('value');
    const aggregatesDailyData = aggregatesDailySnapshot.val() || {};
    for (const key of Object.keys(aggregatesDailyData)) {
      await db.ref(`/aggregates/daily/${key}`).remove();
    }
    console.log(`  Deleted ${Object.keys(aggregatesDailyData).length} daily aggregates`);
    
    // Now set the current month to 0 (fresh start)
    await db.ref(`/aggregates/monthly/${monthStr}`).set({
      totalKWh: 0,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
      resetAt: admin.database.ServerValue.TIMESTAMP,
      resetReason: 'Nuclear reset',
    });
    
    // STEP 4: Delete ALL history entries (not just for this month - delete everything)
    console.log(`  Deleting ALL history entries...`);
    const historyRef = db.ref('/history');
    const historySnapshot = await historyRef.once('value');
    const historyData = historySnapshot.val() || {};
    let deletedCount = 0;
    
    // Delete ALL history entries (nuclear option)
    for (const key of Object.keys(historyData)) {
      await db.ref(`/history/${key}`).remove();
      deletedCount++;
    }
    
    console.log(`  Deleted ${deletedCount} history entries (ALL entries, not just ${monthStr})`);
    
    // STEP 5: Set baseline with CURRENT energy values (CRITICAL!)
    const resetTimestamp = Date.now();
    const resetMarker = {
      month: monthStr,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetTimestamp: resetTimestamp,
      baselineEnergy: currentTotalEnergy, // Current cumulative energy becomes baseline
      baselinePzemEnergies: currentPzemEnergies,
      resetReason: 'Nuclear reset - all data cleared, baseline set to current energy',
    };
    
    await firestore.collection('resets').doc(monthStr).set(resetMarker);
    await db.ref(`/resets/${monthStr}`).set({
      month: monthStr,
      resetTimestamp: resetTimestamp,
      baselineEnergy: currentTotalEnergy,
      baselinePzemEnergies: currentPzemEnergies,
      resetReason: 'Nuclear reset',
    });
    
    console.log(`✅ NUCLEAR RESET COMPLETE:`);
    console.log(`   - Deleted ${deletedCount} history entries`);
    console.log(`   - Reset all Firestore collections to 0`);
    console.log(`   - Reset all RTDB aggregates to 0`);
    console.log(`   - Baseline set to: Total=${currentTotalEnergy.toFixed(6)} kWh`);
    console.log(`   - All future entries will calculate: delta = (newEnergy - ${currentTotalEnergy.toFixed(6)})`);
    
    res.status(200).json({
      success: true,
      message: `Nuclear reset complete for ${monthStr}`,
      month: monthStr,
      deletedHistoryEntries: deletedCount,
      baseline: {
        total: currentTotalEnergy,
        pzem: currentPzemEnergies,
      },
      resetTimestamp: resetTimestamp,
      resetTimestampISO: new Date(resetTimestamp).toISOString(),
      note: 'All data cleared. Baseline set to current energy values. Old 26.022 kWh will be ignored.',
    });
  } catch (error: any) {
    console.error('Error in nuclear reset:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Check current baseline values
export const checkBaseline = functions.region(REGION).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.body || req.query;
    const monthStr = month || new Date().toISOString().substring(0, 7);
    
    console.log(`Checking baseline values for ${monthStr}`);
    
    // Get baseline from RTDB
    const resetRef = await db.ref(`/resets/${monthStr}`).once('value');
    const resetData = resetRef.val();
    
    // Get current energy from /latest
    const latestRef = await db.ref('/latest').once('value');
    const latestData = latestRef.val();
    const currentTotalEnergy = latestData?.total?.energy || 0;
    const currentPzemEnergies: { [key: string]: number } = {};
    
    // Check sensors object first (most common structure), then root level as fallback
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      if (latestData?.sensors?.[pzemKey]) {
        currentPzemEnergies[pzemKey] = latestData.sensors[pzemKey].energy || latestData.sensors[pzemKey].active_energy || 0;
      } else if (latestData?.[pzemKey]) {
        currentPzemEnergies[pzemKey] = latestData[pzemKey].energy || latestData[pzemKey].active_energy || 0;
      } else {
        currentPzemEnergies[pzemKey] = 0;
      }
    }
    
    // Get current totals from Firestore
    const currentTotals: { [key: string]: number } = {};
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      const pzemMonthlyRef = firestore.collection('usage_monthly_pzem').doc(`${monthStr}_${pzemKey}`);
      const currentDoc = await pzemMonthlyRef.get();
      currentTotals[pzemKey] = currentDoc.exists ? (currentDoc.data()?.totalKWh || 0) : 0;
    }
    
    const monthlyRef = firestore.collection('usage_monthly').doc(monthStr);
    const monthlyDoc = await monthlyRef.get();
    const currentMonthlyTotal = monthlyDoc.exists ? (monthlyDoc.data()?.totalKWh || 0) : 0;
    
    res.status(200).json({
      success: true,
      month: monthStr,
      baseline: {
        resetTimestamp: resetData?.resetTimestamp || null,
        resetTimestampISO: resetData?.resetTimestamp ? new Date(resetData.resetTimestamp).toISOString() : null,
        total: resetData?.baselineEnergy || 0,
        pzem: resetData?.baselinePzemEnergies || {},
      },
      currentEnergy: {
        total: currentTotalEnergy,
        pzem: currentPzemEnergies,
      },
      currentTotals: {
        monthly: currentMonthlyTotal,
        pzem: currentTotals,
      },
      analysis: {
        totalDelta: currentTotalEnergy - (resetData?.baselineEnergy || 0),
        pzemDeltas: Object.fromEntries(
          Object.keys(currentPzemEnergies).map(key => [
            key,
            currentPzemEnergies[key] - (resetData?.baselinePzemEnergies?.[key] || 0)
          ])
        ),
      },
      note: 'If baseline is 0 but current energy is non-zero, call updateBaselineToCurrent to fix it.',
    });
  } catch (error: any) {
    console.error('Error checking baseline:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// URGENT FIX: Update baseline to CURRENT energy values (to stop old data from reappearing)
export const updateBaselineToCurrent = functions.region(REGION).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.body;
    const monthStr = month || new Date().toISOString().substring(0, 7);
    
    console.log(`🔧 URGENT: Updating baseline to CURRENT energy values for ${monthStr}`);
    
    // Get CURRENT energy values from /latest (these are the cumulative values we want to ignore)
    const latestRef = await db.ref('/latest').once('value');
    const latestData = latestRef.val();
    const currentTotalEnergy = latestData?.total?.energy || 0;
    const currentPzemEnergies: { [key: string]: number } = {};
    
    console.log(`  Raw /latest data structure:`, JSON.stringify({
      hasSensors: !!latestData?.sensors,
      hasTotal: !!latestData?.total,
      sensorKeys: latestData?.sensors ? Object.keys(latestData.sensors) : [],
      totalEnergy: latestData?.total?.energy,
    }, null, 2));
    
    // Try to get PZEM energies - check sensors object first (most common structure)
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      let energy = 0;
      
      // Check nested structure first (sensors.pzem1, sensors.pzem2, etc.) - this is the actual structure
      if (latestData?.sensors?.[pzemKey]) {
        const sensorData = latestData.sensors[pzemKey];
        energy = sensorData.energy || sensorData.active_energy || 0;
        console.log(`  Found ${pzemKey} in sensors object: energy=${energy}`);
      }
      // Check root level as fallback (pzem1, pzem2, etc. at /latest root)
      else if (latestData?.[pzemKey]) {
        const sensorData = latestData[pzemKey];
        energy = sensorData.energy || sensorData.active_energy || 0;
        console.log(`  Found ${pzemKey} at root level: energy=${energy}`);
      } else {
        console.log(`  ${pzemKey} not found, setting to 0`);
        energy = 0;
      }
      
      currentPzemEnergies[pzemKey] = energy;
    }
    
    console.log(`  Current energy values (these will become the new baseline):`);
    console.log(`    Total: ${currentTotalEnergy.toFixed(6)} kWh`);
    Object.entries(currentPzemEnergies).forEach(([key, val]) => {
      console.log(`    ${key}: ${val.toFixed(6)} kWh`);
    });
    
    // Get existing reset data
    const resetRef = await db.ref(`/resets/${monthStr}`).once('value');
    const existingReset = resetRef.val();
    const oldBaseline = existingReset?.baselineEnergy || 0;
    
    console.log(`  Old baseline total: ${oldBaseline.toFixed(6)} kWh`);
    console.log(`  New baseline total: ${currentTotalEnergy.toFixed(6)} kWh`);
    console.log(`  Difference: ${(currentTotalEnergy - oldBaseline).toFixed(6)} kWh (this will be ignored going forward)`);
    
    // Set reset timestamp to NOW (so it's immediately active)
    const resetTimestamp = Date.now();
    
    // Update reset marker with CURRENT energy as baseline
    const resetMarker = {
      month: monthStr,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetTimestamp: resetTimestamp,
      baselineEnergy: currentTotalEnergy, // UPDATE to current value
      baselinePzemEnergies: currentPzemEnergies, // UPDATE to current values
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updateReason: 'Baseline updated to current energy values to prevent old data accumulation',
      previousBaseline: oldBaseline,
    };
    
    // Ensure all 5 PZEMs are explicitly set (even if 0)
    const finalPzemBaselines: { [key: string]: number } = {};
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      const value = currentPzemEnergies[pzemKey];
      finalPzemBaselines[pzemKey] = (value !== undefined && value !== null) ? value : 0;
      console.log(`  Setting ${pzemKey} baseline: ${finalPzemBaselines[pzemKey]} (from currentPzemEnergies: ${value})`);
    }
    
    console.log(`  Final PZEM baselines to store:`, JSON.stringify(finalPzemBaselines, null, 2));
    console.log(`  Final PZEM baselines keys:`, Object.keys(finalPzemBaselines));
    console.log(`  Final PZEM baselines keys count:`, Object.keys(finalPzemBaselines).length);
    console.log(`  Final PZEM baselines values:`, Object.values(finalPzemBaselines));
    
    await firestore.collection('resets').doc(monthStr).set({
      ...resetMarker,
      baselinePzemEnergies: finalPzemBaselines, // Use final object
    });
    
    const rtdbData = {
      month: monthStr,
      resetTimestamp: resetTimestamp,
      baselineEnergy: currentTotalEnergy,
      baselinePzemEnergies: finalPzemBaselines, // CRITICAL: Use final object with all 5 PZEMs
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      updateReason: 'Baseline updated to current energy values',
      previousBaseline: oldBaseline,
    };
    
    console.log(`  RTDB data to store:`, JSON.stringify({
      ...rtdbData,
      updatedAt: 'SERVER_TIMESTAMP',
    }, null, 2));
    console.log(`  baselinePzemEnergies in RTDB data:`, JSON.stringify(rtdbData.baselinePzemEnergies, null, 2));
    
    await db.ref(`/resets/${monthStr}`).set(rtdbData);
    
    // Verify it was stored
    const verifyRef = await db.ref(`/resets/${monthStr}/baselinePzemEnergies`).once('value');
    const storedBaselines = verifyRef.val();
    console.log(`  ✅ Verified stored baselinePzemEnergies in RTDB:`, JSON.stringify(storedBaselines, null, 2));
    console.log(`  ✅ Stored baselinePzemEnergies to RTDB with ${Object.keys(finalPzemBaselines).length} keys`);
    
    console.log(`✅ Baseline updated! All future entries will use these as baseline.`);
    console.log(`   Total baseline: ${currentTotalEnergy.toFixed(6)} kWh`);
    console.log(`   PZEM baselines:`, JSON.stringify(currentPzemEnergies, null, 2));
    console.log(`   PZEM baselines keys:`, Object.keys(currentPzemEnergies));
    console.log(`   PZEM baselines count:`, Object.keys(currentPzemEnergies).length);
    for (const [key, val] of Object.entries(currentPzemEnergies)) {
      console.log(`     ${key}: ${val}`);
    }
    console.log(`   Next entry: delta = (newEnergy - ${currentTotalEnergy.toFixed(6)}) kWh`);
    
    res.status(200).json({
      success: true,
      message: `Baseline updated to current energy values for ${monthStr}`,
      month: monthStr,
      oldBaseline: {
        total: oldBaseline,
      },
      newBaseline: {
        total: currentTotalEnergy,
        pzem: currentPzemEnergies, // This should have pzem1, pzem2, etc.
      },
      debug: {
        currentPzemEnergiesKeys: Object.keys(currentPzemEnergies),
        currentPzemEnergiesCount: Object.keys(currentPzemEnergies).length,
        currentPzemEnergiesValues: currentPzemEnergies,
      },
      resetTimestamp: resetTimestamp,
      resetTimestampISO: new Date(resetTimestamp).toISOString(),
      note: 'All future entries will calculate delta from these baseline values. Old cumulative energy (26.022 kWh) will be ignored.',
    });
  } catch (error: any) {
    console.error('Error updating baseline:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// TEST FUNCTION: Set reset marker with current energy as baseline (for testing)
// This sets the reset timestamp to 3 minutes ago so it's immediately active
export const testSetResetBaseline = functions.region(REGION).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.body;
    const monthStr = month || new Date().toISOString().substring(0, 7);
    
    console.log(`🧪 TEST: Setting reset baseline for ${monthStr} (timestamp 3 minutes ago)`);
    
    // Get current energy values from /latest
    const latestRef = await db.ref('/latest').once('value');
    const latestData = latestRef.val();
    const baselineTotalEnergy = latestData?.total?.energy || 0;
    const baselinePzemEnergies: { [key: string]: number } = {};
    
    // Check both root level (pzem1) and nested (sensors.pzem1)
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      if (latestData?.[pzemKey]) {
        baselinePzemEnergies[pzemKey] = latestData[pzemKey].energy || latestData[pzemKey].active_energy || 0;
      } else if (latestData?.sensors?.[pzemKey]) {
        baselinePzemEnergies[pzemKey] = latestData.sensors[pzemKey].energy || latestData.sensors[pzemKey].active_energy || 0;
      } else {
        baselinePzemEnergies[pzemKey] = 0;
      }
    }
    
    console.log(`  Baseline energy values:`);
    console.log(`    Total: ${baselineTotalEnergy.toFixed(6)} kWh`);
    Object.entries(baselinePzemEnergies).forEach(([key, val]) => {
      console.log(`    ${key}: ${val.toFixed(6)} kWh`);
    });
    
    // Set reset timestamp to 3 minutes ago (so it's immediately active)
    const resetTimestamp = Date.now() - (3 * 60 * 1000); // 3 minutes ago
    
    // Set reset marker with baseline
    const resetMarker = {
      month: monthStr,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      resetTimestamp: resetTimestamp,
      baselineEnergy: baselineTotalEnergy,
      baselinePzemEnergies: baselinePzemEnergies,
      testMode: true, // Mark as test
    };
    
    await firestore.collection('resets').doc(monthStr).set(resetMarker);
    await db.ref(`/resets/${monthStr}`).set({
      month: monthStr,
      resetTimestamp: resetTimestamp,
      baselineEnergy: baselineTotalEnergy,
      baselinePzemEnergies: baselinePzemEnergies,
      testMode: true,
    });
    
    console.log(`✅ TEST: Reset marker set with baseline (timestamp: ${new Date(resetTimestamp).toISOString()})`);
    
    res.status(200).json({
      success: true,
      message: `Reset baseline set for ${monthStr} (test mode)`,
      month: monthStr,
      baselineEnergies: {
        total: baselineTotalEnergy,
        pzem: baselinePzemEnergies,
      },
      resetTimestamp: resetTimestamp,
      resetTimestampISO: new Date(resetTimestamp).toISOString(),
      note: 'Reset timestamp set to 3 minutes ago - baseline is now active for all new entries',
    });
  } catch (error: any) {
    console.error('Error in testSetResetBaseline:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Set PZEM totals to current energy values (for immediate pie chart display)
export const setPzemTotalsToCurrent = functions.region(REGION).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.body || req.query;
    const monthStr = month || new Date().toISOString().substring(0, 7);
    
    console.log(`🚀 Setting PZEM totals to CURRENT energy values for ${monthStr}`);
    
    // Get current energy from /latest
    const latestRef = await db.ref('/latest').once('value');
    const latestData = latestRef.val();
    const currentTotalEnergy = latestData?.total?.energy || 0;
    const currentPzemEnergies: { [key: string]: number } = {};
    
    // Check sensors object first (most common structure)
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      if (latestData?.sensors?.[pzemKey]) {
        currentPzemEnergies[pzemKey] = latestData.sensors[pzemKey].energy || latestData.sensors[pzemKey].active_energy || 0;
      } else if (latestData?.[pzemKey]) {
        currentPzemEnergies[pzemKey] = latestData[pzemKey].energy || latestData[pzemKey].active_energy || 0;
      } else {
        currentPzemEnergies[pzemKey] = 0;
      }
    }
    
    console.log(`  Current energy values:`);
    console.log(`    Total: ${currentTotalEnergy.toFixed(6)} kWh`);
    Object.entries(currentPzemEnergies).forEach(([key, val]) => {
      console.log(`    ${key}: ${val.toFixed(6)} kWh`);
    });
    
    // Set PZEM totals to current energy values
    const results: { [key: string]: { old: number, new: number } } = {};
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      const docId = `${monthStr}_${pzemKey}`;
      const pzemMonthlyRef = firestore.collection('usage_monthly_pzem').doc(docId);
      
      const currentDoc = await pzemMonthlyRef.get();
      const oldValue = currentDoc.exists ? (currentDoc.data()?.totalKWh || 0) : 0;
      const newValue = currentPzemEnergies[pzemKey] || 0;
      
      await pzemMonthlyRef.set({
        pzemId: pzemKey,
        month: monthStr,
        totalKWh: newValue,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        setToCurrentAt: admin.firestore.FieldValue.serverTimestamp(),
        setReason: 'Manually set to current energy values for immediate display',
      }, { merge: true });
      
      results[pzemKey] = { old: oldValue, new: newValue };
      console.log(`  Set ${pzemKey}: ${oldValue.toFixed(3)} → ${newValue.toFixed(3)} kWh`);
    }
    
    // Also update total monthly usage
    const monthlyRef = firestore.collection('usage_monthly').doc(monthStr);
    await monthlyRef.set({
      totalKWh: currentTotalEnergy,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      setToCurrentAt: admin.firestore.FieldValue.serverTimestamp(),
      setReason: 'Manually set to current energy values',
    }, { merge: true });
    
    // Update RTDB aggregates
    await db.ref(`/aggregates/monthly/${monthStr}`).set({
      totalKWh: currentTotalEnergy,
      lastUpdated: admin.database.ServerValue.TIMESTAMP,
      setToCurrentAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    console.log(`✅ PZEM totals set to current energy values`);
    
    res.status(200).json({
      success: true,
      message: `PZEM totals set to current energy values for ${monthStr}`,
      month: monthStr,
      results: results,
      totalEnergy: currentTotalEnergy,
      pzemEnergies: currentPzemEnergies,
      note: 'Totals are now set to current cumulative energy values. Pie chart should display immediately.',
    });
  } catch (error: any) {
    console.error('Error setting PZEM totals:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

/**
 * HTTP endpoint to reset a PZEM's monthly total (for fixing outliers)
 */
export const resetPzemMonthlyTotal = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { pzemId, month, newValue = 0 } = req.body;
    
    if (!pzemId || !month) {
      res.status(400).json({ 
        error: 'Missing required fields',
        required: ['pzemId', 'month'],
        optional: ['newValue (default: 0)']
      });
      return;
    }

    const docId = `${month}_${pzemId}`;
    const pzemMonthlyRef = firestore.collection('usage_monthly_pzem').doc(docId);
    
    const currentDoc = await pzemMonthlyRef.get();
    const currentValue = currentDoc.exists ? (currentDoc.data()?.totalKWh || 0) : 0;
    
    await pzemMonthlyRef.set({
      pzemId,
      month,
      totalKWh: newValue,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
      previousValue: currentValue,
      resetReason: 'Manual reset via API',
    }, { merge: true });

    console.log(`Reset ${pzemId} monthly total for ${month}: ${currentValue.toFixed(3)} → ${newValue} kWh`);

    res.status(200).json({
      success: true,
      message: `Reset ${pzemId} monthly total for ${month}`,
      previousValue: currentValue,
      newValue: newValue,
    });
  } catch (error: any) {
    console.error('Error in resetPzemMonthlyTotal:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

/**
 * HTTP endpoint to manually trigger per-PZEM allocation calculation (for testing)
 */
export const calculateAllocationNow = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const now = new Date();
    const monthStr = now.toISOString().substring(0, 7); // YYYY-MM
    
    console.log(`Manual allocation calculation triggered for month: ${monthStr}`);
    
    await calculatePerPzemBillAllocation(monthStr);
    
    res.status(200).json({
      success: true,
      message: 'Allocation calculated successfully',
      month: monthStr,
    });
  } catch (error: any) {
    console.error('Error in calculateAllocationNow:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

/**
 * HTTP endpoint to manually trigger billing calculation (for testing)
 */
export const calculateBillingNow = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const now = new Date();
    const monthStr = now.toISOString().substring(0, 7); // YYYY-MM (current)
    
    console.log(`Manual billing calculation triggered for month: ${monthStr}`);

    // Get billing config from Firestore (try appSettings first, then billing config)
    const appSettingsRef = firestore.collection('config').doc('appSettings');
    const appSettingsDoc = await appSettingsRef.get();
    const billingConfigRef = firestore.collection('config').doc('billing');
    const billingConfigDoc = await billingConfigRef.get();
    
    // Get AFA_rate from appSettings if available, otherwise from billing config
    let afaRate = -0.065;
    if (appSettingsDoc.exists && appSettingsDoc.data()?.AFA_rate !== undefined) {
      afaRate = appSettingsDoc.data()?.AFA_rate;
    } else if (billingConfigDoc.exists && billingConfigDoc.data()?.afaRate !== undefined) {
      afaRate = billingConfigDoc.data()?.afaRate;
    }
    
    const defaultConfig = {
      afaRate: afaRate,
      billingDay: 1,
      serviceTaxScope: 'all',
    };
    const config = billingConfigDoc.exists ? billingConfigDoc.data() : defaultConfig;
    const configData = { ...defaultConfig, ...config };

    // Read monthly usage from Firestore
    const monthlyRef = firestore.collection('usage_monthly').doc(monthStr);
    const monthlyDoc = await monthlyRef.get();

    if (!monthlyDoc.exists) {
      console.log(`No usage data found for ${monthStr}`);
      res.status(404).json({ 
        error: 'No usage data found', 
        month: monthStr,
        message: `Please ensure usage data exists in Firestore: usage_monthly/${monthStr}`
      });
      return;
    }

    const monthlyData = monthlyDoc.data();
    const totalKWh = monthlyData?.totalKWh || 0;

    console.log(`Total usage for ${monthStr}: ${totalKWh} kWh`);

    if (totalKWh === 0) {
      res.status(400).json({ 
        error: 'No usage data', 
        month: monthStr,
        totalKWh: 0,
        message: 'Usage data exists but totalKWh is 0'
      });
      return;
    }

    // Calculate billing
    const billingInput: BillingInput = {
      totalKWh,
      afaRate: (configData.afaRate as number) || -0.065,
    };

    const billing = calculateBilling(billingInput);

    // Add metadata
    const billingResult = {
      ...billing,
      month: monthStr,
      calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      config: {
        afaRate: billingInput.afaRate,
        billingDay: configData.billingDay || 1,
      },
    };

    // Write to RTDB
    console.log('Writing billing data to RTDB: /billing/currentMonth');
    await db.ref('/billing/currentMonth').set(billingResult);
    console.log('✅ Billing data written to RTDB');

    // Write to Firestore
    console.log('Writing billing data to Firestore: billing/currentMonth');
    await firestore.collection('billing').doc('currentMonth').set(billingResult);
    console.log('✅ Billing data written to Firestore');

    // Write to history
    console.log(`Writing billing history: billing_history/${monthStr}`);
    await firestore.collection('billing_history').doc(monthStr).set(billingResult);
    console.log('✅ Billing history written');

    console.log(`✅ Billing calculated for ${monthStr}: RM ${billing.totalPayable.toFixed(2)}`);

    res.status(200).json({
      success: true,
      message: 'Billing calculated successfully',
      month: monthStr,
      billing: billingResult,
    });
  } catch (error: any) {
    console.error('Error in calculateBillingNow:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

/**
 * Optional: HTTPS endpoint for device ingestion with API key
 */
export const ingestDevice = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Check API key
    const apiKey = req.headers['x-api-key'] as string;
    const expectedKey = functions.config().iot?.token;

    if (!expectedKey || apiKey !== expectedKey) {
      console.warn('Invalid or missing API key');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate payload
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    // Write to RTDB /latest
    await db.ref('/latest').set({
      ...payload,
      ingestedAt: admin.database.ServerValue.TIMESTAMP,
      source: 'https-endpoint',
    });

    // Also push to /history
    const historyRef = db.ref('/history').push();
    await historyRef.set({
      ...payload,
      ingestedAt: admin.database.ServerValue.TIMESTAMP,
      source: 'https-endpoint',
    });

    console.log(`Ingested data via HTTPS endpoint, history key: ${historyRef.key}`);

    res.status(200).json({
      success: true,
      historyKey: historyRef.key,
      message: 'Data ingested successfully',
    });
  } catch (error) {
    console.error('Error in ingestDevice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Calculate per-PZEM bill allocation for a given month
 * This allocates the total monthly bill proportionally based on each PZEM's kWh share
 * CRITICAL: We calculate the total bill FIRST using the full TNB tariff, then allocate proportionally
 */
async function calculatePerPzemBillAllocation(monthStr: string): Promise<void> {
  try {
    console.log(`Calculating per-PZEM bill allocation for ${monthStr}`);

    // 1. Get total monthly usage
    const monthlyDoc = await firestore.collection('usage_monthly').doc(monthStr).get();
    if (!monthlyDoc.exists) {
      console.log(`No monthly usage data found for ${monthStr}`);
      return;
    }
    const totalKWh = monthlyDoc.data()?.totalKWh || 0;
    if (totalKWh === 0) {
      console.log(`Total monthly usage is 0 for ${monthStr}`);
      return;
    }

    // 2. Get per-PZEM monthly usage
    const pzemMonthlySnapshot = await firestore.collection('usage_monthly_pzem')
      .where('month', '==', monthStr)
      .get();

    const pzemUsage: { [key: string]: number } = {};
    console.log(`Found ${pzemMonthlySnapshot.size} per-PZEM monthly documents for ${monthStr}`);
    
    pzemMonthlySnapshot.forEach((doc) => {
      const data = doc.data();
      const pzemId = data.pzemId;
      const pzemKWh = data.totalKWh || 0;
      const lastUpdated = data.lastUpdated?.toDate?.() || null;
      pzemUsage[pzemId] = pzemKWh;
      console.log(`  ${pzemId}: ${pzemKWh} kWh (from doc ${doc.id}, last updated: ${lastUpdated ? lastUpdated.toISOString() : 'unknown'})`);
    });

    // Ensure all 5 PZEMs have entries (fill with 0 if missing)
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      if (!(pzemKey in pzemUsage)) {
        pzemUsage[pzemKey] = 0;
        console.log(`  ${pzemKey}: 0 kWh (no document found)`);
      }
    }
    
    console.log('Per-PZEM usage summary:', JSON.stringify(pzemUsage, null, 2));
    
    // Check for outliers (one PZEM way higher than others)
    const values = Object.values(pzemUsage).filter(v => v > 0);
    if (values.length > 1) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      // If one value is more than 10x the average, flag it
      if (max > avg * 10 && max > 1) {
        const outlier = Object.entries(pzemUsage).find(([_, v]) => v === max);
        console.warn(`⚠️ OUTLIER DETECTED: ${outlier?.[0]} has ${max.toFixed(3)} kWh (avg: ${avg.toFixed(3)} kWh, min: ${min.toFixed(3)} kWh)`);
        console.warn(`   This suggests a sensor reset or error. Consider resetting ${outlier?.[0]}'s monthly total.`);
      }
    }

    // 3. Calculate total bill using existing billing logic (applied to TOTAL, not per-PZEM)
    // Get AFA_rate from appSettings if available, otherwise from billing config
    const appSettingsDoc = await firestore.collection('config').doc('appSettings').get();
    const billingConfigDoc = await firestore.collection('config').doc('billing').get();
    
    let afaRate = -0.065;
    if (appSettingsDoc.exists && appSettingsDoc.data()?.AFA_rate !== undefined) {
      afaRate = appSettingsDoc.data()?.AFA_rate;
    } else if (billingConfigDoc.exists && billingConfigDoc.data()?.afaRate !== undefined) {
      afaRate = billingConfigDoc.data()?.afaRate;
    }
    
    const defaultConfig = {
      afaRate: afaRate,
      billingDay: 1,
      serviceTaxScope: 'all',
    };
    const config = billingConfigDoc.exists ? billingConfigDoc.data() : defaultConfig;
    const configData = { ...defaultConfig, ...config };

    const billingInput: BillingInput = {
      totalKWh,
      afaRate: (configData.afaRate as number) || -0.065,
    };

    const billing = calculateBilling(billingInput);
    const totalBill = billing.totalPayable;

    // 4. Allocate bill proportionally to each PZEM based on their kWh share
    const pzemAllocation: { [key: string]: { kwh: number; percentage: number; allocatedBill: number } } = {};

    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      const pzemKWh = pzemUsage[pzemKey] || 0;
      const percentage = totalKWh > 0 ? (pzemKWh / totalKWh) * 100 : 0;
      const allocatedBill = totalKWh > 0 ? (pzemKWh / totalKWh) * totalBill : 0;

      pzemAllocation[pzemKey] = {
        kwh: Math.round(pzemKWh * 100) / 100,
        percentage: Math.round(percentage * 100) / 100,
        allocatedBill: Math.round(allocatedBill * 100) / 100,
      };
    }

    // 5. Store allocation in Firestore
    const allocationDoc = firestore.collection('billing_allocation').doc(monthStr);
    await allocationDoc.set({
      month: monthStr,
      totalKWh: Math.round(totalKWh * 100) / 100,
      totalBill: Math.round(totalBill * 100) / 100,
      pzemAllocation,
      calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Also store in RTDB for frontend access
    await db.ref(`/billing_allocation/${monthStr}`).set({
      month: monthStr,
      totalKWh: Math.round(totalKWh * 100) / 100,
      totalBill: Math.round(totalBill * 100) / 100,
      pzemAllocation,
      calculatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    console.log(`Per-PZEM bill allocation calculated for ${monthStr}:`);
    Object.entries(pzemAllocation).forEach(([pzem, data]) => {
      console.log(`  ${pzem}: ${data.kwh} kWh (${data.percentage}%) = RM ${data.allocatedBill}`);
    });

    return;
  } catch (error) {
    console.error(`Error calculating per-PZEM bill allocation for ${monthStr}:`, error);
    throw error;
  }
}

/**
 * Firestore trigger: When billing/currentMonth is updated, check thresholds and send email alerts
 */
export const onBillingUpdated = functions.region(REGION).firestore
  .document('billing/currentMonth')
  .onUpdate(async (change, context) => {
    try {
      const after = change.after.data();
      const before = change.before.data();
      
      // Check if billing actually changed (for logging)
      const totalPayableChanged = after?.totalPayable !== before?.totalPayable;
      const totalKWhChanged = after?.totalKWh !== before?.totalKWh;
      
      if (totalPayableChanged || totalKWhChanged) {
        console.log(`Billing updated: RM ${before?.totalPayable || 0} → RM ${after?.totalPayable || 0}, kWh ${before?.totalKWh || 0} → ${after?.totalKWh || 0}`);
      } else {
        console.log('Billing values unchanged, but checking email alerts anyway (thresholds may have changed)');
      }

      // Always check email alerts, even if billing didn't change
      // (user might have updated thresholds in settings)

      // Read appSettings
      const appSettingsRef = firestore.collection('config').doc('appSettings');
      const appSettingsDoc = await appSettingsRef.get();
      
      if (!appSettingsDoc.exists) {
        console.log('appSettings not found, skipping email alerts');
        return null;
      }

      const appSettings = appSettingsDoc.data();
      
      // Check if email alerts are enabled
      if (!appSettings?.emailAlertsEnabled) {
        console.log('Email alerts disabled in appSettings');
        return null;
      }

      const ownerEmail = appSettings?.ownerEmail;
      if (!ownerEmail) {
        console.log('ownerEmail not set in appSettings');
        return null;
      }

      const monthlyTargetType = appSettings?.monthlyTargetType || 'kwh'; // 'kwh' or 'bill'
      const monthlyTargetValue = appSettings?.monthlyTargetValue || 0;
      const warnPercent = appSettings?.warnPercent || 80;
      const criticalPercent = appSettings?.criticalPercent || 100;
      const includePzemBreakdown = appSettings?.includePzemBreakdownInEmail || false;

      if (monthlyTargetValue <= 0) {
        console.log('monthlyTargetValue not set or invalid, skipping email alerts');
        return null;
      }

      // Get current month key
      const now = new Date();
      const monthKey = now.toISOString().substring(0, 7); // YYYY-MM

      // Calculate current usage/bill and percentage
      let currentValue = 0;
      let predictedValue = 0;
      
      if (monthlyTargetType === 'kwh') {
        currentValue = after?.totalKWh || 0;
        // Try to get predicted kWh from forecast (if available)
        // For now, use current value as predicted
        predictedValue = currentValue;
      } else {
        // monthlyTargetType === 'bill'
        currentValue = after?.totalPayable || 0;
        // Try to get predicted bill (if available)
        predictedValue = currentValue;
      }

      // Calculate percentage
      const currentPercent = (currentValue / monthlyTargetValue) * 100;
      const predictedPercent = (predictedValue / monthlyTargetValue) * 100;

      console.log(`Current: ${currentValue} (${currentPercent.toFixed(1)}%), Predicted: ${predictedValue} (${predictedPercent.toFixed(1)}%)`);

      // Check if we should send an alert
      let shouldSendAlert = false;
      let alertLevel = '';
      
      // Check critical threshold first (highest priority)
      if (predictedPercent >= criticalPercent) {
        shouldSendAlert = true;
        alertLevel = 'critical';
        console.log(`Critical threshold reached: ${predictedPercent.toFixed(1)}% >= ${criticalPercent}%`);
      } else if (predictedPercent >= warnPercent) {
        // Send warning if predicted is above warning threshold
        // Check if we already sent a warning for this percentage range
        shouldSendAlert = true;
        alertLevel = 'warn';
        console.log(`Warning threshold reached: ${predictedPercent.toFixed(1)}% >= ${warnPercent}%`);
      }

      if (!shouldSendAlert) {
        console.log(`No alert needed: ${predictedPercent.toFixed(1)}% < ${warnPercent}% (target: ${monthlyTargetValue}, current: ${currentValue}, predicted: ${predictedValue})`);
        return null;
      }

      // Check if we already sent an alert for this threshold this month
      const alertsRef = firestore.collection('alerts').doc(monthKey);
      const alertsDoc = await alertsRef.get();
      const alertsData = alertsDoc.exists ? (alertsDoc.data() || {}) : {};
      
      const alertKey = `${alertLevel}_${Math.floor(predictedPercent)}`;
      if (alertsData && alertsData[alertKey]) {
        console.log(`Alert ${alertKey} already sent for ${monthKey}, skipping`);
        return null;
      }

      // Prepare email content
      const subject = `⚡ Energy Alert: ${alertLevel === 'critical' ? 'CRITICAL' : 'WARNING'} - ${predictedPercent.toFixed(1)}% of Monthly Target`;
      
      let emailBody = `
        <h2>Energy Consumption Alert</h2>
        <p><strong>Alert Level:</strong> ${alertLevel === 'critical' ? 'CRITICAL' : 'WARNING'}</p>
        <p><strong>Month:</strong> ${monthKey}</p>
        <p><strong>Target Type:</strong> ${monthlyTargetType === 'kwh' ? 'kWh' : 'Bill (RM)'}</p>
        <p><strong>Monthly Target:</strong> ${monthlyTargetType === 'kwh' ? monthlyTargetValue.toFixed(2) + ' kWh' : 'RM ' + monthlyTargetValue.toFixed(2)}</p>
        <p><strong>Current Usage:</strong> ${monthlyTargetType === 'kwh' ? currentValue.toFixed(2) + ' kWh' : 'RM ' + currentValue.toFixed(2)} (${currentPercent.toFixed(1)}%)</p>
        <p><strong>Predicted End of Month:</strong> ${monthlyTargetType === 'kwh' ? predictedValue.toFixed(2) + ' kWh' : 'RM ' + predictedValue.toFixed(2)} (${predictedPercent.toFixed(1)}%)</p>
      `;

      // Add billing breakdown if available
      if (after?.totalPayable) {
        emailBody += `
          <h3>Current Bill Breakdown</h3>
          <ul>
            <li>Total Usage: ${after.totalKWh || 0} kWh</li>
            <li>Energy Charge: RM ${(after.energyCharge || 0).toFixed(2)}</li>
            <li>Capacity Charge: RM ${(after.capacityCharge || 0).toFixed(2)}</li>
            <li>Network Charge: RM ${(after.networkCharge || 0).toFixed(2)}</li>
            <li>Retail Service Charge: RM ${(after.retailServiceCharge || 0).toFixed(2)}</li>
            <li>AFA: RM ${(after.afa || 0).toFixed(2)}</li>
            <li>EECI Rebate: RM ${(after.eeci || 0).toFixed(2)}</li>
            <li>KWTBB: RM ${(after.kwtbb || 0).toFixed(2)}</li>
            <li>Service Tax: RM ${(after.serviceTax || 0).toFixed(2)}</li>
            <li><strong>Total Payable: RM ${(after.totalPayable || 0).toFixed(2)}</strong></li>
          </ul>
        `;
      }

      // Add PZEM breakdown if requested and at critical level
      if (includePzemBreakdown && alertLevel === 'critical') {
        const allocationRef = firestore.collection('billing_allocation').doc(monthKey);
        const allocationDoc = await allocationRef.get();
        
        if (allocationDoc.exists) {
          const allocationData = allocationDoc.data();
          const pzemAllocation = allocationData?.pzemAllocation || {};
          
          emailBody += `
            <h3>Per-PZEM Breakdown</h3>
            <table border="1" cellpadding="5" cellspacing="0">
              <tr>
                <th>PZEM</th>
                <th>kWh</th>
                <th>Percentage</th>
                <th>Allocated Bill</th>
              </tr>
          `;
          
          for (let i = 1; i <= 5; i++) {
            const pzemKey = `pzem${i}`;
            const pzemData = pzemAllocation[pzemKey] || { kwh: 0, percentage: 0, allocatedBill: 0 };
            emailBody += `
              <tr>
                <td>${pzemKey.toUpperCase()}</td>
                <td>${pzemData.kwh.toFixed(2)} kWh</td>
                <td>${pzemData.percentage.toFixed(2)}%</td>
                <td>RM ${pzemData.allocatedBill.toFixed(2)}</td>
              </tr>
            `;
          }
          
          emailBody += `</table>`;
        }
      }

      emailBody += `
        <p><small>This is an automated alert from MyTenaga Energy Monitoring System.</small></p>
      `;

      // Send email using nodemailer (Gmail SMTP or similar)
      // Note: You'll need to configure SMTP settings in Firebase Functions config
      // Example: firebase functions:config:set smtp.host="smtp.gmail.com" smtp.port="587" smtp.user="your-email@gmail.com" smtp.pass="your-app-password"
      
      const smtpConfig = functions.config().smtp;
      if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass || smtpConfig.user === 'your-email@gmail.com' || smtpConfig.pass === 'your-app-password') {
        console.error('❌ SMTP config not properly configured!');
        console.error('   Current config:', JSON.stringify(smtpConfig || {}, null, 2));
        console.error('   Please configure with: firebase functions:config:set smtp.host="smtp.gmail.com" smtp.port="587" smtp.user="YOUR-REAL-EMAIL@gmail.com" smtp.pass="ldtz wfwm wcek xmdn"');
        console.error('   Then redeploy: firebase deploy --only functions:onBillingUpdated');
        // Still mark alert as sent to avoid retries
        await alertsRef.set({
          [alertKey]: {
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            level: alertLevel,
            percent: predictedPercent,
            error: 'SMTP not configured',
          },
        }, { merge: true });
        return null;
      }

      const transporter = nodemailer.createTransport({
        host: smtpConfig.host || 'smtp.gmail.com',
        port: parseInt(smtpConfig.port || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      });

      const mailOptions = {
        from: smtpConfig.user,
        to: ownerEmail,
        subject: subject,
        html: emailBody,
      };

      await transporter.sendMail(mailOptions);
      console.log(`✅ Email alert sent to ${ownerEmail} (${alertLevel}, ${predictedPercent.toFixed(1)}%)`);

      // Mark alert as sent
      await alertsRef.set({
        [alertKey]: {
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          level: alertLevel,
          percent: predictedPercent,
        },
      }, { merge: true });

      return null;
    } catch (error) {
      console.error('Error in onBillingUpdated:', error);
      // Don't throw - we don't want to break billing updates if email fails
      return null;
    }
  });

/**
 * HTTP endpoint to fetch daily PZEM usage data for charting
 */
export const getDailyPzemUsage = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { month } = req.query;
    const monthStr = month as string || new Date().toISOString().substring(0, 7); // YYYY-MM

    console.log(`Fetching daily PZEM usage for ${monthStr}`);

    // Get all daily PZEM documents for the month
    const dailyPzemSnapshot = await firestore.collection('usage_daily_pzem')
      .where('date', '>=', `${monthStr}-01`)
      .where('date', '<', `${monthStr}-32`) // Up to end of month
      .get();

    // Organize data by date and PZEM
    const dailyData: { [date: string]: { [pzemId: string]: number } } = {};
    const dates = new Set<string>();

    dailyPzemSnapshot.forEach((doc) => {
      const data = doc.data();
      const date = data.date || '';
      const pzemId = data.pzemId || '';
      const kwh = data.kwh || 0;

      if (date.startsWith(monthStr)) {
        if (!dailyData[date]) {
          dailyData[date] = {};
        }
        dailyData[date][pzemId] = kwh;
        dates.add(date);
      }
    });

    // Convert to sorted array
    const sortedDates = Array.from(dates).sort();

    // Build response
    const response = {
      success: true,
      month: monthStr,
      dates: sortedDates,
      data: dailyData,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error fetching daily PZEM usage:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * HTTP endpoint to get appSettings
 */
export const getAppSettings = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const appSettingsRef = firestore.collection('config').doc('appSettings');
    const appSettingsDoc = await appSettingsRef.get();

    if (!appSettingsDoc.exists) {
      // Return defaults
      res.status(200).json({
        success: true,
        data: {
          ownerEmail: '',
          emailAlertsEnabled: false,
          monthlyTargetType: 'kwh',
          monthlyTargetValue: 0,
          warnPercent: 80,
          criticalPercent: 100,
          includePzemBreakdownInEmail: false,
          AFA_rate: -0.065,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: appSettingsDoc.data(),
    });
  } catch (error: any) {
    console.error('Error fetching appSettings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * HTTP endpoint to save appSettings
 */
export const saveAppSettings = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const settings = req.body;

    // Validate required fields
    if (!settings.ownerEmail || !settings.monthlyTargetValue) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: ownerEmail and monthlyTargetValue are required',
      });
      return;
    }

    // Prepare settings document
    const appSettings = {
      ownerEmail: String(settings.ownerEmail).trim(),
      emailAlertsEnabled: Boolean(settings.emailAlertsEnabled),
      monthlyTargetType: String(settings.monthlyTargetType || 'kwh'),
      monthlyTargetValue: Number(settings.monthlyTargetValue) || 0,
      warnPercent: Number(settings.warnPercent) || 80,
      criticalPercent: Number(settings.criticalPercent) || 100,
      includePzemBreakdownInEmail: Boolean(settings.includePzemBreakdownInEmail),
      AFA_rate: Number(settings.AFA_rate) || -0.065,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save to Firestore
    await firestore.collection('config').doc('appSettings').set(appSettings, { merge: true });

    console.log('✅ AppSettings saved:', appSettings);

    res.status(200).json({
      success: true,
      message: 'Settings saved successfully',
      data: appSettings,
    });
  } catch (error: any) {
    console.error('Error saving appSettings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * HTTP endpoint to manually add/update daily PZEM usage data
 */
export const setDailyPzemUsage = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { date, pzemId, kwh } = req.body;

    // Validate required fields
    if (!date || !pzemId || kwh === undefined) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: date, pzemId, and kwh are required',
      });
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD (e.g., 2025-11-30)',
      });
      return;
    }

    // Validate PZEM ID
    if (!['pzem1', 'pzem2', 'pzem3', 'pzem4', 'pzem5'].includes(pzemId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid pzemId. Must be one of: pzem1, pzem2, pzem3, pzem4, pzem5',
      });
      return;
    }

    // Validate kWh (must be a number >= 0)
    const kwhValue = Number(kwh);
    if (isNaN(kwhValue) || kwhValue < 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid kWh value. Must be a number >= 0',
      });
      return;
    }

    // Create document ID
    const docId = `${date}_${pzemId}`;

    // Check if document exists
    const docRef = firestore.collection('usage_daily_pzem').doc(docId);
    const existingDoc = await docRef.get();
    const previousValue = existingDoc.exists ? (existingDoc.data()?.kwh || 0) : 0;

    // Save to Firestore
    await docRef.set({
      date: date,
      pzemId: pzemId,
      kwh: kwhValue,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      manuallySet: true,
      previousValue: previousValue,
    }, { merge: true });

    console.log(`✅ Daily PZEM usage set: ${docId} = ${kwhValue} kWh (previous: ${previousValue} kWh)`);

    res.status(200).json({
      success: true,
      message: `Daily PZEM usage set successfully`,
      data: {
        date: date,
        pzemId: pzemId,
        kwh: kwhValue,
        previousValue: previousValue,
        docId: docId,
      },
    });
  } catch (error: any) {
    console.error('Error setting daily PZEM usage:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * HTTP endpoint to batch add/update daily PZEM usage data
 */
export const batchSetDailyPzemUsage = functions.region(REGION).https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { entries } = req.body; // Array of {date, pzemId, kwh}

    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Missing or empty entries array. Expected array of {date, pzemId, kwh}',
      });
      return;
    }

    const results = [];
    const errors = [];

    for (const entry of entries) {
      try {
        const { date, pzemId, kwh } = entry;

        if (!date || !pzemId || kwh === undefined) {
          errors.push({ entry, error: 'Missing required fields' });
          continue;
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
          errors.push({ entry, error: 'Invalid date format' });
          continue;
        }

        if (!['pzem1', 'pzem2', 'pzem3', 'pzem4', 'pzem5'].includes(pzemId)) {
          errors.push({ entry, error: 'Invalid pzemId' });
          continue;
        }

        const kwhValue = Number(kwh);
        if (isNaN(kwhValue) || kwhValue < 0) {
          errors.push({ entry, error: 'Invalid kWh value' });
          continue;
        }

        const docId = `${date}_${pzemId}`;
        const docRef = firestore.collection('usage_daily_pzem').doc(docId);
        const existingDoc = await docRef.get();
        const previousValue = existingDoc.exists ? (existingDoc.data()?.kwh || 0) : 0;

        await docRef.set({
          date: date,
          pzemId: pzemId,
          kwh: kwhValue,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          manuallySet: true,
          previousValue: previousValue,
        }, { merge: true });

        results.push({ date, pzemId, kwh: kwhValue, docId, previousValue });
      } catch (error: any) {
        errors.push({ entry, error: error.message });
      }
    }

    console.log(`✅ Batch set daily PZEM usage: ${results.length} successful, ${errors.length} errors`);

    res.status(200).json({
      success: true,
      message: `Batch operation completed: ${results.length} successful, ${errors.length} errors`,
      results: results,
      errors: errors,
    });
  } catch (error: any) {
    console.error('Error in batch set daily PZEM usage:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});


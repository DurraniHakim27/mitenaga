/* ============================================================
   MyTenaga Dashboard Script (REST polling version, ES2020)
   ============================================================ */

/* global Chart, firebase */

// Initialize Firebase
// Minimal config - Firestore only needs projectId
const firebaseConfig = {
  projectId: "iot-energy-monitoring-sy-1d1a1",
  databaseURL: "https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined') {
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
      console.log('✅ Firebase initialized');
    } else {
      console.log('✅ Firebase already initialized');
    }
  } catch (e) {
    console.warn('Firebase initialization error (may already be initialized):', e.message);
  }
} else {
  console.error('Firebase SDK not loaded');
}

const useStatic = new URLSearchParams(window.location.search).get('static') === 'true';
const LATEST_REST_URL = 'https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/latest.json';
const BILLING_REST_URL = 'https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/billing/currentMonth.json';
const CALCULATE_BILLING_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/calculateBillingNow';
const BILLING_ALLOCATION_URL = 'https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/billing_allocation';
const CALCULATE_ALLOCATION_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/calculateAllocationNow';
const PREDICT_ENERGY_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/predict_energy_consumption';
const AGGREGATES_REST_URL = 'https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/aggregates/daily.json';
const DAILY_PZEM_USAGE_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/getDailyPzemUsage';
const GET_APP_SETTINGS_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/getAppSettings';
const SAVE_APP_SETTINGS_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/saveAppSettings';
const SET_DAILY_PZEM_USAGE_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/setDailyPzemUsage';
const BATCH_SET_DAILY_PZEM_USAGE_URL = 'https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/batchSetDailyPzemUsage';

const SENSOR_COUNT = 5;
const SENSOR_COLORS = {
  1: '#ff6b6b', // Red (brightened for dark theme)
  2: '#4dabf7', // Blue (brightened for dark theme)
  3: '#51cf66', // Green (brightened for dark theme)
  4: '#ffd43b', // Yellow (brightened for dark theme)
  5: '#b197fc'  // Purple (brightened for dark theme)
};
const PRESET_NAMES = ['Living Room', 'Kitchen', 'Bedroom', 'AC Load', 'Heater', 'Solar', 'Garage', 'Workshop'];
const DEFAULT_NAMES = { 1: 'PZEM 1', 2: 'PZEM 2', 3: 'PZEM 3', 4: 'PZEM 4', 5: 'PZEM 5' };
const sensorNames = { ...DEFAULT_NAMES };
const chartHistory = {};
const reportHistory = {};
const MAX_HISTORY_POINTS = 60;

const sensorCharts = {};
let totalChart = null;
const firestore = null; // placeholder for future Firestore persistence
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_AGGREGATES_CACHE_MS = 5 * 60 * 1000;
const FORECAST_CACHE_MS = 2 * 60 * 1000;

let dailyAggregatesCache = { data: null, fetchedAt: 0 };
let forecastApiCache = { data: null, fetchedAt: 0 };
let currentBillingData = null;

function byId(id) { return document.getElementById(id); }
function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
function setHTML(id, html) { const el = byId(id); if (el) el.innerHTML = html; }

function padNumber(num, size = 2) {
  return String(num).padStart(size, '0');
}

function formatRm(value = 0) {
  const amount = Number(value) || 0;
  return `RM ${amount.toFixed(2)}`;
}

function getMytDateParts(offsetDays = 0) {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const target = new Date(utcMs + MYT_OFFSET_MS + (offsetDays * 24 * 60 * 60 * 1000));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();
  return {
    year,
    month,
    day,
    iso: `${year}-${padNumber(month)}-${padNumber(day)}`
  };
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function fetchDailyAggregates(force = false) {
  if (!force && dailyAggregatesCache.data && (Date.now() - dailyAggregatesCache.fetchedAt < DAILY_AGGREGATES_CACHE_MS)) {
    return dailyAggregatesCache.data;
  }

  const response = await fetch(`${AGGREGATES_REST_URL}?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Daily aggregates HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json() || {};
  dailyAggregatesCache = { data, fetchedAt: Date.now() };
  return data;
}

async function fetchEnergyForecast(force = false) {
  if (!force && forecastApiCache.data && (Date.now() - forecastApiCache.fetchedAt < FORECAST_CACHE_MS)) {
    return forecastApiCache.data;
  }

  const response = await fetch(PREDICT_ENERGY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'end_of_month' }),
  });

  if (!response.ok) {
    throw new Error(`Forecast HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Prediction failed');
  }
  forecastApiCache = { data, fetchedAt: Date.now() };
  return data;
}

function getEeciRate(totalKWh) {
  if (totalKWh <= 200) return -25.0;
  if (totalKWh <= 250) return -24.5;
  if (totalKWh <= 300) return -22.5;
  if (totalKWh <= 350) return -21.0;
  if (totalKWh <= 400) return -17.0;
  if (totalKWh <= 450) return -14.5;
  if (totalKWh <= 500) return -12.0;
  if (totalKWh <= 550) return -10.5;
  if (totalKWh <= 600) return -9.0;
  if (totalKWh <= 650) return -7.5;
  if (totalKWh <= 700) return -5.5;
  if (totalKWh <= 750) return -4.5;
  if (totalKWh <= 800) return -4.0;
  if (totalKWh <= 850) return -2.5;
  if (totalKWh <= 900) return -1.0;
  if (totalKWh <= 1000) return -0.5;
  return 0;
}

function calculateEstimatedBilling(totalKWh, afaRate = -0.065) {
  const usage = Math.max(0, Number(totalKWh) || 0);
  const energyRate = usage > 1500 ? 0.3703 : 0.2703;
  const energyCharge = usage * energyRate;
  const capacityCharge = usage * 0.0455;
  const networkCharge = usage * 0.1285;
  const retailServiceCharge = usage >= 600 ? 10.0 : 0;

  let afa = 0;
  if (usage >= 600) {
    afa = usage * afaRate;
  }

  const eeciRateSen = getEeciRate(usage);
  const eeci = usage * (eeciRateSen / 100);

  const subtotalBeforeKwtbb = energyCharge + capacityCharge + networkCharge + retailServiceCharge + afa - Math.abs(eeci);
  const kwtbb = usage > 300 ? 0.016 * subtotalBeforeKwtbb : 0;
  const subtotalBeforeServiceTax = subtotalBeforeKwtbb + kwtbb;
  const serviceTax = usage > 600 ? 0.08 * subtotalBeforeServiceTax : 0;
  const totalPayable = subtotalBeforeServiceTax + serviceTax;

  const round = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

  return {
    totalKWh: round(usage),
    energyCharge: round(energyCharge),
    capacityCharge: round(capacityCharge),
    networkCharge: round(networkCharge),
    retailServiceCharge: round(retailServiceCharge),
    afa: round(afa),
    eeci: round(eeci),
    kwtbb: round(kwtbb),
    serviceTax: round(serviceTax),
    totalPayable: round(totalPayable),
    meta: {
      energyRateApplied: energyRate,
      eeciRateApplied: eeciRateSen,
      subtotalBeforeKwtbb: round(subtotalBeforeKwtbb),
      subtotalBeforeServiceTax: round(subtotalBeforeServiceTax),
    },
  };
}

function showPage(page) {
  document.querySelectorAll('.page-section').forEach(section => section.classList.remove('active'));
  const active = byId(`${page}-section`);
  if (active) active.classList.add('active');
  document.querySelectorAll('.top-nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${page}`);
  });
}

function toggleLoading(show) {
  const indicator = byId('loading-indicator');
  if (indicator) indicator.classList.toggle('active', show);
}

function createSensorCards() {
  const container = byId('pzem-cards-container');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const card = document.createElement('div');
    card.className = `card pzem-card pzem-${i}`;
    card.innerHTML = `
      <div class="pzem-card-header">
        <div class="pzem-title-container">
          <h3 class="pzem-title" id="pzem-title-${i}">${DEFAULT_NAMES[i]}</h3>
          <button class="pzem-edit-btn" onclick="startInlineEdit(${i})" title="Rename"><span class="edit-icon">✏️</span></button>
        </div>
        <div class="pzem-badge pzem-${i}" id="pzem-badge-${i}">${DEFAULT_NAMES[i]}</div>
      </div>
      <div class="pzem-metrics">
        <div><div class="pzem-metric-label">Voltage</div><div class="pzem-metric-value" id="pzem${i}-voltage">-- V</div></div>
        <div><div class="pzem-metric-label">Current</div><div class="pzem-metric-value" id="pzem${i}-current">-- A</div></div>
        <div><div class="pzem-metric-label">Power</div><div class="pzem-metric-value" id="pzem${i}-power">-- W</div></div>
        <div><div class="pzem-metric-label">Energy</div><div class="pzem-metric-value" id="pzem${i}-energy">-- kWh</div></div>
      </div>
      <div class="pzem-updated" id="pzem${i}-updated">Updated: --:--:--</div>
    `;
    container.appendChild(card);
  }
}

function initSensorCharts() {
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    chartHistory[i] = [];
    const ctx = byId(`chart-pzem${i}`);
    if (ctx) {
      sensorCharts[i] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: `${DEFAULT_NAMES[i]} - Power (W)`,
            data: [],
            borderColor: SENSOR_COLORS[i],
            backgroundColor: `${SENSOR_COLORS[i]}33`,
            tension: 0.35,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { 
            legend: { 
              display: true, 
              position: 'bottom',
              labels: {
                color: '#9ca3af',
                font: { size: 12 }
              }
            } 
          },
          scales: {
            x: { 
              display: true, 
              title: { 
                display: true, 
                text: 'Time',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: { 
              type: 'linear', 
              display: true, 
              position: 'left', 
              title: { 
                display: true, 
                text: 'Power (W)',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            }
          }
        }
      });
    }

    reportHistory[i] = [];
  }

  const totalCtx = byId('chart-total-power');
  if (totalCtx) {
    totalChart = new Chart(totalCtx, {
      type: 'line',
      data: { 
        labels: [], 
        datasets: [{ 
          label: 'Total Power (W)', 
          data: [], 
          borderColor: '#00d4ff', 
          backgroundColor: 'rgba(0, 212, 255, 0.2)', 
          tension: 0.35,
          borderWidth: 2
        }] 
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { 
          legend: { 
            display: true,
            labels: {
              color: '#9ca3af',
              font: { size: 12 }
            }
          } 
        },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { 
            display: true, 
            title: { 
              display: true, 
              text: 'Time',
              color: '#9ca3af',
              font: { size: 12 }
            },
            ticks: { color: '#6b7280' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: { 
            type: 'linear', 
            display: true, 
            title: { 
              display: true, 
              text: 'Power (W)',
              color: '#9ca3af',
              font: { size: 12 }
            },
            ticks: { color: '#6b7280' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  }
}

async function loadPzemNames() {
  try {
    const raw = localStorage.getItem('pzemNames');
    if (raw) {
      const data = JSON.parse(raw);
      for (let i = 1; i <= SENSOR_COUNT; i++) {
        const key = `pzem${i}`;
        if (typeof data[key] === 'string' && data[key].trim()) sensorNames[i] = data[key].trim().slice(0, 30);
      }
      updateAllNamesInUI();
      const ts = localStorage.getItem('pzemNamesTimestamp');
      if (ts) updateSensorNamesTimestamp(new Date(ts));
      return;
    }
  } catch (err) {
    console.warn('Failed to load names from localStorage', err);
  }
  updateAllNamesInUI();
}

function savePzemNames(names = sensorNames) {
  const payload = {};
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    payload[`pzem${i}`] = (names[i] || DEFAULT_NAMES[i]).trim().slice(0, 30) || DEFAULT_NAMES[i];
    sensorNames[i] = payload[`pzem${i}`];
  }
  localStorage.setItem('pzemNames', JSON.stringify(payload));
  localStorage.setItem('pzemNamesTimestamp', new Date().toISOString());
  updateSensorNamesTimestamp(new Date());
  updateAllNamesInUI();
}

function resetSensorNames() {
  if (!confirm('Reset all sensor names to defaults?')) return;
  savePzemNames({ ...DEFAULT_NAMES });
  renderSensorNameInputs();
}

function getPzemName(idx) { return sensorNames[idx] || DEFAULT_NAMES[idx]; }

function updateAllNamesInUI() {
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const name = getPzemName(i);
    setText(`pzem-title-${i}`, name);
    setText(`pzem-badge-${i}`, name);
    setText(`graph-title-pzem${i}`, `${name} - Power`);
    setText(`report-title-pzem${i}`, `${name} Summary`);
    setText(`report-badge-pzem${i}`, name);

    try {
      if (sensorCharts[i] && sensorCharts[i].data && Array.isArray(sensorCharts[i].data.datasets) && sensorCharts[i].data.datasets.length > 0 && sensorCharts[i].data.datasets[0]) {
        sensorCharts[i].data.datasets[0].label = `${name} - Power (W)`;
        sensorCharts[i].update('none');
      }
    } catch (err) {
      console.warn(`Failed to update chart label for PZEM ${i}:`, err);
    }
  }
  if (totalChart) totalChart.update('none');
}

function updateSensorNamesTimestamp(ts) {
  const el = byId('sensor-names-timestamp');
  if (!el) return;
  if (!ts) { el.textContent = ''; return; }
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  el.textContent = `Last updated: ${date.toLocaleString()}`;
}

function renderSensorNameInputs() {
  const wrapper = byId('sensor-names-list');
  if (!wrapper) return;
  wrapper.innerHTML = '';
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const name = getPzemName(i);
    const div = document.createElement('div');
    div.className = 'sensor-name-item';
    div.innerHTML = `
      <label class="sensor-name-label" for="sensor-input-${i}">PZEM ${i}</label>
      <div class="sensor-name-input-group">
        <input id="sensor-input-${i}" class="sensor-name-input" type="text" maxlength="30" value="${name}" />
        <button class="btn-preset-toggle" onclick="togglePresetDropdown(${i})">▼</button>
        <div class="preset-dropdown" id="preset-dropdown-${i}">
          ${PRESET_NAMES.map(p => `<div class="preset-item" onclick="selectPreset(${i}, '${p.replace(/'/g, "\\'")}')">${p}</div>`).join('')}
        </div>
      </div>
    `;
    wrapper.appendChild(div);
  }
}

function openSensorNamesModal() {
  renderSensorNameInputs();
  const modal = byId('sensor-names-modal');
  if (modal) modal.style.display = 'block';
}

function closeSensorNamesModal() {
  const modal = byId('sensor-names-modal');
  if (modal) modal.style.display = 'none';
  document.querySelectorAll('.preset-dropdown').forEach(dd => { dd.style.display = 'none'; });
}

function selectPreset(idx, name) {
  const input = byId(`sensor-input-${idx}`);
  if (input) input.value = name;
  togglePresetDropdown(idx);
}

function togglePresetDropdown(idx) {
  document.querySelectorAll('.preset-dropdown').forEach(dd => { if (dd.id !== `preset-dropdown-${idx}`) dd.style.display = 'none'; });
  const dropdown = byId(`preset-dropdown-${idx}`);
  if (!dropdown) return;
  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function saveSensorNamesFromModal() {
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const input = byId(`sensor-input-${i}`);
    if (!input) continue;
    sensorNames[i] = input.value.trim().slice(0, 30) || DEFAULT_NAMES[i];
  }
  savePzemNames(sensorNames);
  closeSensorNamesModal();
}

window.saveSensorNames = saveSensorNamesFromModal;
window.resetSensorNames = resetSensorNames;
window.openSensorNamesModal = openSensorNamesModal;
window.closeSensorNamesModal = closeSensorNamesModal;
window.togglePresetDropdown = togglePresetDropdown;
window.selectPreset = selectPreset;

function startInlineEdit(idx) {
  const title = byId(`pzem-title-${idx}`);
  if (!title) return;
  const current = getPzemName(idx);
  title.parentElement.innerHTML = `
    <div class="inline-edit-container">
      <input id="inline-edit-${idx}" class="inline-edit-input" type="text" maxlength="30" value="${current}" />
      <button class="inline-edit-btn save" onclick="saveInlineEdit(${idx})" title="Save">✓</button>
      <button class="inline-edit-btn cancel" onclick="cancelInlineEdit(${idx})" title="Cancel">✕</button>
    </div>
  `;
  const input = byId(`inline-edit-${idx}`);
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') saveInlineEdit(idx);
      if (evt.key === 'Escape') cancelInlineEdit(idx);
    });
  }
}

function saveInlineEdit(idx) {
  const input = byId(`inline-edit-${idx}`);
  if (!input) return;
  sensorNames[idx] = (input.value || '').trim().slice(0, 30) || DEFAULT_NAMES[idx];
  savePzemNames(sensorNames);
}

function cancelInlineEdit() { updateAllNamesInUI(); }

window.startInlineEdit = startInlineEdit;
window.saveInlineEdit = saveInlineEdit;
window.cancelInlineEdit = cancelInlineEdit;
window.showPage = showPage;

function pushDataToUI(payload) {
  if (!payload || typeof payload !== 'object') {
    console.warn('Invalid payload:', payload);
    return;
  }

  let { timestamp, sensors = {}, total = {}, balance, time: timeInfo } = payload;

  // Handle case where sensors might be at root level (fallback for different data structures)
  if (!sensors || Object.keys(sensors).length === 0) {
    sensors = {};
    // Check if pzem1 data is at root level (has voltage, power, etc. directly)
    if (payload.voltage !== undefined || payload.power !== undefined) {
      // pzem1 data is at root, create sensors object
      sensors.pzem1 = {
        voltage: payload.voltage,
        current: payload.current,
        power: payload.power || payload.active_power,
        energy: payload.energy || payload.active_energy,
        frequency: payload.frequency,
        powerFactor: payload.powerFactor || payload.power_factor
      };
    }
    // Check for other pzem objects at root level
    for (let i = 2; i <= SENSOR_COUNT; i++) {
      const key = `pzem${i}`;
      if (payload[key] && typeof payload[key] === 'object') {
        sensors[key] = payload[key];
      }
    }
  }

  // Update time information (MYT)
  if (timeInfo && typeof timeInfo === 'object') {
    setText('day-display', timeInfo.day || '--');
    setText('date-display', timeInfo.date || '--');
    setText('timezone-label', timeInfo.timezone || 'MYT (UTC+08:00)');
    
    const syncIndicator = byId('sync-indicator');
    if (syncIndicator) {
      syncIndicator.className = 'sync-indicator';
      if (timeInfo.synced === true) {
        syncIndicator.classList.add('synced');
        syncIndicator.title = 'Time synced';
      } else {
        syncIndicator.classList.add('not-synced');
        syncIndicator.title = 'Time not synced';
      }
    }
    
    // Update timestamp using MYT time if available
    if (timeInfo.time) {
      setText('update-timestamp', `Last updated: ${timeInfo.time}`);
    } else if (timestamp) {
      setText('update-timestamp', `Last updated: ${new Date(timestamp).toLocaleTimeString()}`);
    }
  } else {
    // Fallback for old data without time info
    setText('day-display', '--');
    setText('date-display', '--');
    const syncIndicator = byId('sync-indicator');
    if (syncIndicator) {
      syncIndicator.className = 'sync-indicator not-synced';
      syncIndicator.title = 'Time info unavailable';
    }
    if (timestamp) {
      setText('update-timestamp', `Last updated: ${new Date(timestamp).toLocaleTimeString()}`);
    }
  }

  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const sensor = sensors[`pzem${i}`] || {};
    const voltage = Number(sensor.voltage) || 0;
    const current = Number(sensor.current) || 0;
    const power   = Number(sensor.power)   || 0;
    const energy  = Number(sensor.energy)  || 0;

    if (i === 1) console.log(`PZEM ${i} sample data:`, { voltage, current, power, energy, sensor });

    setText(`pzem${i}-voltage`, `${voltage.toFixed(1)} V`);
    setText(`pzem${i}-current`, `${current.toFixed(3)} A`);
    setText(`pzem${i}-power`,   `${power.toFixed(1)} W`);
    setText(`pzem${i}-energy`, `${energy.toFixed(3)} kWh`);
    setText(`pzem${i}-updated`, `Updated: ${timestamp ? new Date(timestamp).toLocaleTimeString() : '--:--:--'}`);
  }

  const totalPower   = Number(total.power)   || 0;
  const totalEnergy  = Number(total.energy)  || 0;
  const totalCurrent = Number(total.current) || 0;

  setText('total-power-all',  `${totalPower.toFixed(1)} W`);
  setText('total-energy-all', `${totalEnergy.toFixed(3)} kWh`);
  setText('total-current-all',`${totalCurrent.toFixed(3)} A`);

  if (typeof balance === 'number') {
    // optional: update balance card if present
  }

  pushMultiSensorData(payload);
}

function pushMultiSensorData(payload) {
  // Use MYT time if available, otherwise fall back to timestamp or current time
  let timeLabel = '--:--:--';
  if (payload.time && payload.time.time) {
    timeLabel = payload.time.time; // Already in MYT format from ESP32 (HH:MM:SS)
  } else if (payload.timestamp) {
    // Convert UTC timestamp to MYT (UTC+8) - fallback for old data
    try {
      const ts = new Date(payload.timestamp);
      if (!isNaN(ts.getTime())) {
        const mytTime = new Date(ts.getTime() + (8 * 60 * 60 * 1000)); // Add 8 hours
        const hours = String(mytTime.getUTCHours()).padStart(2, '0');
        const minutes = String(mytTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(mytTime.getUTCSeconds()).padStart(2, '0');
        timeLabel = `${hours}:${minutes}:${seconds}`;
      }
    } catch (e) {
      console.warn('Failed to parse timestamp:', e);
    }
  }
  
  const sensors = payload.sensors || {};
  const total = payload.total || {};

  let combinedAvgPower = 0;
  let combinedPeakPower = 0;

  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const sensor = sensors[`pzem${i}`] || {};
    chartHistory[i] = chartHistory[i] || [];
    chartHistory[i].push({
      time: timeLabel,
      power: Number(sensor.power) || 0,
      energy: Number(sensor.energy) || 0
    });
    if (chartHistory[i].length > MAX_HISTORY_POINTS) chartHistory[i].shift();

    if (sensorCharts[i]) {
      sensorCharts[i].data.labels = chartHistory[i].map(x => x.time);
      sensorCharts[i].data.datasets[0].data = chartHistory[i].map(x => x.power);
      sensorCharts[i].update('none');
    }

    reportHistory[i] = reportHistory[i] || [];
    reportHistory[i].push({
      time: timeLabel,
      energy: Number(sensor.energy) || 0,
      power: Number(sensor.power) || 0
    });
    if (reportHistory[i].length > MAX_HISTORY_POINTS) reportHistory[i].shift();

    const powers = reportHistory[i].map(x => x.power);
    const avgPower = powers.length ? powers.reduce((a, b) => a + b, 0) / powers.length : 0;
    const peakPower = powers.length ? Math.max(...powers) : 0;
    setText(`report-energy-${i}`, `${(Number(sensor.energy) || 0).toFixed(3)} kWh`);
    setText(`report-avg-power-${i}`, `${avgPower.toFixed(1)} W`);
    setText(`report-peak-power-${i}`, `${peakPower.toFixed(1)} W`);

    combinedAvgPower += avgPower;
    if (peakPower > combinedPeakPower) combinedPeakPower = peakPower;
  }

  if (totalChart) {
    totalChart.data.labels.push(timeLabel);
    totalChart.data.datasets[0].data.push(Number(total.power) || 0);
    if (totalChart.data.labels.length > MAX_HISTORY_POINTS) {
      totalChart.data.labels.shift();
      totalChart.data.datasets[0].data.shift();
    }
    totalChart.update('none');
  }

  setText('total-avg-power-all', `${combinedAvgPower.toFixed(1)} W`);
  setText('total-peak-power-all', `${combinedPeakPower.toFixed(1)} W`);
}

function downloadAllChartsCSV() {
  const rows = [];
  const header = ['Timestamp'];
  for (let i = 1; i <= SENSOR_COUNT; i++) {
    const name = getPzemName(i);
    header.push(`${name} Power (W)`, `${name} Energy (kWh)`);
  }
  header.push('Total Power (W)');
  rows.push(header.join(','));

  const longest = Math.max(...Object.values(chartHistory).map(arr => arr.length), totalChart?.data?.labels?.length || 0);

  for (let idx = 0; idx < longest; idx++) {
    const columns = [];
    const label = totalChart?.data?.labels[idx] || chartHistory[1]?.[idx]?.time || '';
    columns.push(label);
    for (let i = 1; i <= SENSOR_COUNT; i++) {
      const entry = chartHistory[i]?.[idx];
      columns.push(entry ? entry.power.toFixed(2) : '', entry ? entry.energy.toFixed(3) : '');
    }
    const totalVal = totalChart?.data?.datasets?.[0]?.data?.[idx];
    columns.push(totalVal !== undefined ? Number(totalVal).toFixed(3) : '');
    rows.push(columns.join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pzem-history-${new Date().toISOString().slice(0, 16)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
window.downloadAllChartsCSV = downloadAllChartsCSV;

function fetchStaticData() {
  fetch('/data.json')
    .then(res => res.json())
    .then(data => { if (data) pushDataToUI(data); })
    .catch(err => console.error('Static data fetch failed', err));
}

async function fetchLatestData() {
  try {
    const response = await fetch(`${LATEST_REST_URL}?t=${Date.now()}`);
    
    if (response.status === 404) {
      console.warn('⚠️ /latest node does not exist in Firebase RTDB');
      console.warn('   This means the ESP32 has not sent data yet, or data was deleted.');
      console.warn('   Check: 1) ESP32 Serial monitor for connection errors');
      console.warn('          2) Cloud Function logs for ingestDevice errors');
      console.warn('          3) Firebase RTDB to verify /latest exists');
      toggleLoading(false);
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      console.warn('⚠️ /latest exists but is empty');
      toggleLoading(false);
      return;
    }
    
    console.log('✅ Latest data received:', data);
    console.log('Data structure check:', {
      hasSensors: !!data.sensors,
      hasPzem1: !!data.sensors?.pzem1,
      hasPzem1Root: !!data.pzem1,
      sensorKeys: data.sensors ? Object.keys(data.sensors) : [],
      rootKeys: Object.keys(data).filter(k => k.startsWith('pzem')),
      totalKeys: Object.keys(data)
    });
    
    if (data) pushDataToUI(data);
    toggleLoading(false);
  } catch (err) {
    console.error('❌ Failed to fetch latest data:', err);
    console.error('   URL:', LATEST_REST_URL);
    console.error('   Error details:', err.message);
    toggleLoading(false);
  }
}

function startStaticPolling() {
  fetchStaticData();
  setInterval(fetchStaticData, 3000);
}

function startRealtimePolling() {
  fetchLatestData();
  setInterval(fetchLatestData, 3000);
}

document.addEventListener('DOMContentLoaded', async () => {
  createSensorCards();
  initSensorCharts();
  
  // Wait a tick to ensure charts are fully initialized
  await new Promise(resolve => setTimeout(resolve, 100));
  
  await loadPzemNames();

  toggleLoading(true);

  if (useStatic) {
    console.log('Static mode enabled - polling data.json');
    startStaticPolling(); 
  } else {
    console.log('Live mode enabled - polling Realtime Database via REST');
    startRealtimePolling();
  }
  
  loadBillingData();
  loadPzemAllocation();
});

// Per-PZEM Allocation Chart
let pzemAllocationChart = null;

// Manual trigger for allocation calculation (for testing)
async function triggerAllocationCalculation() {
  const btnNoData = byId('calculate-allocation-btn-no-data');
  const btnWithData = byId('calculate-allocation-btn-with-data');
  const statusNoData = byId('allocation-status-no-data');
  const statusWithData = byId('allocation-status-with-data');
  
  // Determine which button and status div to use
  const btn = btnNoData || btnWithData;
  const statusDiv = statusNoData || statusWithData;
  
  // Disable button and show loading
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
  }
  
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--primary);">⏳ Calculating allocation...</span>';
  }
  
  try {
    console.log('Calling calculateAllocationNow function...');
    const response = await fetch(CALCULATE_ALLOCATION_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Allocation calculation result:', result);
    
    if (result.success) {
      if (statusDiv) {
        statusDiv.innerHTML = '<span style="color: var(--success);">✅ Allocation calculated successfully! Refreshing...</span>';
      }
      
      // Wait a moment then reload
      setTimeout(() => {
        loadPzemAllocation();
        if (statusDiv) {
          setTimeout(() => {
            statusDiv.innerHTML = '';
          }, 2000);
        }
      }, 1000);
    } else {
      throw new Error(result.message || 'Calculation failed');
    }
  } catch (error) {
    console.error('Error triggering allocation:', error);
    if (statusDiv) {
      statusDiv.innerHTML = `<span style="color: var(--danger);">❌ Error: ${error.message}</span>`;
    }
  } finally {
    // Re-enable button
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }
}

// Load per-PZEM monthly allocation data
async function loadPzemAllocation() {
  const card = byId('pzem-allocation-card');
  const messageDiv = byId('pzem-allocation-message');
  const contentDiv = byId('pzem-allocation-content');
  const btnNoData = byId('calculate-allocation-btn-no-data');
  const btnWithData = byId('calculate-allocation-btn-with-data');
  
  try {
    const now = new Date();
    const monthStr = now.toISOString().substring(0, 7); // YYYY-MM
    
    console.log('Loading PZEM allocation for month:', monthStr);
    const response = await fetch(`${BILLING_ALLOCATION_URL}/${monthStr}.json?t=${Date.now()}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        // No allocation data yet - show message with "Calculate" button
        console.log('No allocation data found (404)');
        if (card) card.style.display = 'block';
        if (messageDiv) messageDiv.style.display = 'block';
        if (contentDiv) contentDiv.style.display = 'none';
        if (btnNoData) btnNoData.style.display = 'inline-block';
        if (btnWithData) btnWithData.style.display = 'none';
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const allocation = await response.json();
    console.log('Allocation data received:', allocation);
    
    if (allocation && allocation.pzemAllocation) {
      // Hide message, show content with "Recalculate" button
      if (messageDiv) messageDiv.style.display = 'none';
      if (contentDiv) contentDiv.style.display = 'block';
      if (card) card.style.display = 'block';
      if (btnNoData) btnNoData.style.display = 'none';
      if (btnWithData) btnWithData.style.display = 'inline-block';
      displayPzemAllocation(allocation);
    } else {
      // Invalid data - show message with "Calculate" button
      if (card) card.style.display = 'block';
      if (messageDiv) messageDiv.style.display = 'block';
      if (contentDiv) contentDiv.style.display = 'none';
      if (btnNoData) btnNoData.style.display = 'inline-block';
      if (btnWithData) btnWithData.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading PZEM allocation:', error);
    // Show card with error message
    if (card) card.style.display = 'block';
    if (messageDiv) {
      messageDiv.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
        <p style="font-size: 16px; margin-bottom: 10px;"><strong>Error loading allocation data</strong></p>
        <p style="font-size: 14px; color: var(--gray-500); margin-bottom: 20px;">${error.message}</p>
        <button class="btn btn-secondary" id="calculate-allocation-btn-no-data" onclick="triggerAllocationCalculation()" style="background: var(--gray-600); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px;">
          🔄 Calculate Allocation Now
        </button>
        <div id="allocation-status-no-data" style="margin-top: 10px; font-size: 13px;"></div>
      `;
      messageDiv.style.display = 'block';
    }
    if (contentDiv) contentDiv.style.display = 'none';
    if (btnNoData) btnNoData.style.display = 'inline-block';
    if (btnWithData) btnWithData.style.display = 'none';
  }
}

// Display per-PZEM allocation with pie chart and summary
function displayPzemAllocation(allocation) {
  const messageDiv = byId('pzem-allocation-message');
  const contentDiv = byId('pzem-allocation-content');
  
  // Hide message, show content
  if (messageDiv) messageDiv.style.display = 'none';
  if (contentDiv) contentDiv.style.display = 'block';
  
  const { pzemAllocation, totalKWh, totalBill } = allocation;
  
  // Prepare chart data
  const labels = [];
  const data = [];
  const backgroundColors = [];
  const summaryItems = [];
  
  // Debug: Log raw allocation data
  console.log('Raw allocation data:', allocation);
  console.log('PZEM allocation breakdown:', pzemAllocation);
  
  // Show debug info in UI
  const debugDiv = byId('pzem-allocation-debug');
  if (debugDiv) {
    debugDiv.textContent = JSON.stringify(allocation, null, 2);
  }
  
  for (let i = 1; i <= 5; i++) {
    const pzemKey = `pzem${i}`;
    const pzemData = pzemAllocation[pzemKey];
    
    // Include all PZEMs, even if kwh is 0 or very small
    if (pzemData) {
      const name = sensorNames[i] || `PZEM ${i}`;
      
      // Only add to chart if kwh > 0.01 (to avoid tiny slices)
      if (pzemData.kwh > 0.01) {
        labels.push(name);
        data.push(pzemData.kwh);
        backgroundColors.push(SENSOR_COLORS[i]);
      }
      
      // Always add to summary (even if 0)
      summaryItems.push({
        name,
        kwh: pzemData.kwh,
        percentage: pzemData.percentage,
        allocatedBill: pzemData.allocatedBill,
        color: SENSOR_COLORS[i],
      });
      
      console.log(`${pzemKey} (${name}): ${pzemData.kwh} kWh (${pzemData.percentage}%), RM ${pzemData.allocatedBill}`);
    } else {
      console.warn(`${pzemKey}: No data found in allocation`);
    }
  }
  
  // Update pie chart
  const ctx = document.getElementById('pzem-allocation-chart');
  if (ctx) {
    if (pzemAllocationChart) {
      pzemAllocationChart.destroy();
    }
    
    pzemAllocationChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: backgroundColors,
          borderWidth: 2,
          borderColor: '#111827',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              color: '#9ca3af',
              font: {
                size: 12,
              },
            },
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                const pzemKey = Object.keys(pzemAllocation).find(
                  key => sensorNames[parseInt(key.replace('pzem', ''))] === label || 
                         `PZEM ${key.replace('pzem', '')}` === label
                );
                const allocatedBill = pzemKey ? (pzemAllocation[pzemKey]?.allocatedBill || 0) : 0;
                return [
                  `${label}: ${value.toFixed(2)} kWh`,
                  `${percentage}% of total`,
                  `RM ${allocatedBill.toFixed(2)} allocated`,
                ];
              },
            },
          },
        },
      },
    });
  }
  
  // Update summary list
  const summaryDiv = byId('pzem-allocation-summary');
  if (summaryDiv) {
    summaryDiv.innerHTML = summaryItems
      .sort((a, b) => b.kwh - a.kwh)
      .map((item) => {
        return `
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--gray-100); border-radius: 6px; border-left: 4px solid ${item.color};">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: var(--text); margin-bottom: 4px;">${item.name}</div>
              <div style="font-size: 13px; color: var(--gray-600);">
                ${item.kwh.toFixed(2)} kWh (${item.percentage.toFixed(1)}% of total)
              </div>
            </div>
            <div style="font-weight: 600; color: var(--primary); font-size: 16px;">
              RM ${item.allocatedBill.toFixed(2)}
            </div>
          </div>
        `;
      })
      .join('');
  }
}

// Load billing data from RTDB
// Calculate billing now by calling the Cloud Function
async function calculateBillNow() {
  // Find which button was clicked (no-data or with-data)
  const btnNoData = byId('calculate-bill-btn-no-data');
  const btnWithData = byId('calculate-bill-btn-with-data');
  const statusNoData = byId('calculate-bill-status-no-data');
  const statusWithData = byId('calculate-bill-status-with-data');
  
  // Determine which button and status div to use
  const btn = btnNoData || btnWithData;
  const statusDiv = statusNoData || statusWithData;
  
  if (!btn || !statusDiv) {
    console.error('Calculate bill button or status div not found');
    return;
  }
  
  // Disable both buttons and show loading
  if (btnNoData) {
    btnNoData.disabled = true;
    btnNoData.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Calculating...</span>';
  }
  if (btnWithData) {
    btnWithData.disabled = true;
    btnWithData.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Calculating...</span>';
  }
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--primary);">⏳ Calculating billing...</span>';
    statusDiv.style.color = 'var(--primary)';
  }
  
  try {
    console.log('Calling calculateBillingNow function...');
    const response = await fetch(CALCULATE_BILLING_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Billing calculation result:', result);
    
    if (result.success) {
      // Show success message
      if (statusDiv) {
        statusDiv.innerHTML = '<span style="color: var(--success);">✅ Billing calculated successfully!</span>';
        statusDiv.style.color = 'var(--success)';
      }
      
      // Wait a moment then reload billing data
      setTimeout(() => {
        loadBillingData();
        // Reset buttons after a delay
        setTimeout(() => {
          if (btnNoData) {
            btnNoData.disabled = false;
            btnNoData.innerHTML = '<span class="btn-icon">🧮</span><span class="btn-text">Calculate Bill Now</span>';
          }
          if (btnWithData) {
            btnWithData.disabled = false;
            btnWithData.innerHTML = '<span class="btn-icon">🔄</span><span class="btn-text">Recalculate Bill</span>';
          }
          if (statusNoData) statusNoData.innerHTML = '';
          if (statusWithData) statusWithData.innerHTML = '';
        }, 2000);
      }, 500);
    } else {
      throw new Error(result.message || 'Calculation failed');
    }
  } catch (error) {
    console.error('Error calculating billing:', error);
    if (statusDiv) {
      statusDiv.innerHTML = `<span style="color: var(--danger);">❌ Error: ${error.message}</span>`;
      statusDiv.style.color = 'var(--danger)';
      
      // Show error details if available
      if (error.message.includes('usage data')) {
        statusDiv.innerHTML += '<br><small style="color: var(--gray-600);">Make sure usage data exists in Firestore: usage_monthly/YYYY-MM</small>';
      }
    }
    
    // Re-enable buttons
    if (btnNoData) {
      btnNoData.disabled = false;
      btnNoData.innerHTML = '<span class="btn-icon">🧮</span><span class="btn-text">Calculate Bill Now</span>';
    }
    if (btnWithData) {
      btnWithData.disabled = false;
      btnWithData.innerHTML = '<span class="btn-icon">🔄</span><span class="btn-text">Recalculate Bill</span>';
    }
  }
}

async function loadBillingData() {
  const statusCard = byId('billing-status-card');
  const statusMessage = byId('billing-status-message');
  const loadingSpan = byId('billing-loading');
  const calculateCardNoData = byId('calculate-bill-card-no-data');
  const calculateCardWithData = byId('calculate-bill-card-with-data');
  
  try {
    // Show loading state
    if (statusCard) statusCard.style.display = 'block';
    if (loadingSpan) loadingSpan.textContent = 'Loading billing data...';
    
    console.log('Fetching billing data from:', BILLING_REST_URL);
    const response = await fetch(`${BILLING_REST_URL}?t=${Date.now()}`);
    console.log('Billing response status:', response.status, response.statusText);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('Billing data not found (404)');
        if (statusMessage) {
          statusMessage.innerHTML = `
            <strong>No billing data available yet.</strong><br>
            <small style="color: var(--gray-500);">
              Click the "Calculate Bill Now" button below to calculate billing for the current month.<br>
              Make sure usage data exists in Firestore: <code>usage_monthly/YYYY-MM</code>
            </small>
          `;
          statusMessage.style.color = 'var(--warning)';
        }
        // Show calculate button when no data, hide the "with data" button
        if (calculateCardNoData) calculateCardNoData.style.display = 'block';
        if (calculateCardWithData) calculateCardWithData.style.display = 'none';
      } else {
        console.error('Billing fetch error:', response.status, response.statusText);
        if (statusMessage) {
          statusMessage.innerHTML = `
            <strong>Error loading billing data (HTTP ${response.status}).</strong><br>
            <small style="color: var(--gray-500);">${response.statusText}</small>
          `;
          statusMessage.style.color = 'var(--danger)';
        }
        // Show calculate button on error
        if (calculateCardNoData) calculateCardNoData.style.display = 'block';
        if (calculateCardWithData) calculateCardWithData.style.display = 'none';
      }
      if (statusCard) statusCard.style.display = 'block';
      return;
    }
    
    const billing = await response.json();
    console.log('Billing data received:', billing);
    
    if (billing && billing.totalKWh !== undefined) {
      console.log('Displaying billing data, totalKWh:', billing.totalKWh);
      // Hide status card and "no data" button, show billing card and "with data" button
      if (statusCard) statusCard.style.display = 'none';
      if (calculateCardNoData) calculateCardNoData.style.display = 'none';
      if (calculateCardWithData) calculateCardWithData.style.display = 'block';
      displayBillingData(billing);
    } else {
      console.warn('Billing data incomplete:', billing);
      // Invalid data - show calculate button
      if (statusMessage) {
        statusMessage.innerHTML = `
          <strong>Billing data incomplete.</strong><br>
          <small style="color: var(--gray-500);">
            Received data but missing required fields.<br>
            Click "Calculate Bill Now" to recalculate.
          </small>
        `;
        statusMessage.style.color = 'var(--warning)';
      }
      if (statusCard) statusCard.style.display = 'block';
      if (calculateCardNoData) calculateCardNoData.style.display = 'block';
      if (calculateCardWithData) calculateCardWithData.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading billing data:', error);
    if (statusMessage) {
      statusMessage.innerHTML = `
        <strong>Error loading billing data.</strong><br>
        <small style="color: var(--gray-500);">${error.message}<br>Check browser console (F12) for details.</small>
      `;
      statusMessage.style.color = 'var(--danger)';
    }
    if (statusCard) statusCard.style.display = 'block';
    if (calculateCardNoData) calculateCardNoData.style.display = 'block';
    if (calculateCardWithData) calculateCardWithData.style.display = 'none';
  }
}

// Display billing data in UI
function displayBillingData(billing) {
  const card = byId('current-bill-card');
  if (card) card.style.display = 'block';
  currentBillingData = billing;

  // Format month for display
  const monthStr = billing.month || '--';
  const monthDate = monthStr !== '--' ? new Date(monthStr + '-01') : null;
  const monthDisplay = monthDate 
    ? monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '--';
  
  setText('bill-month', `Month: ${monthDisplay}`);
  
  // Format calculated date
  const calcDate = billing.calculatedAt 
    ? new Date(billing.calculatedAt).toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : new Date().toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
  setText('bill-calculated-date', `Calculated: ${calcDate}`);

  // Display values
  setText('bill-total-kwh', `${(billing.totalKWh || 0).toFixed(3)} kWh`);
  setText('bill-energy-charge', `RM ${(billing.energyCharge || 0).toFixed(2)}`);
  setText('bill-capacity-charge', `RM ${(billing.capacityCharge || 0).toFixed(2)}`);
  setText('bill-network-charge', `RM ${(billing.networkCharge || 0).toFixed(2)}`);
  setText('bill-retail-charge', `RM ${(billing.retailServiceCharge || 0).toFixed(2)}`);
  setText('bill-afa', `RM ${(billing.afa || 0).toFixed(2)}`);
  setText('bill-eeci', `RM ${(billing.eeci || 0).toFixed(2)}`);
  
  // Calculate subtotal (before KWTBB and Service Tax)
  const subtotal = (billing.energyCharge || 0) + 
                   (billing.capacityCharge || 0) + 
                   (billing.networkCharge || 0) + 
                   (billing.retailServiceCharge || 0) + 
                   (billing.afa || 0) + 
                   (billing.eeci || 0); // eeci is negative, so adding it subtracts
  setText('bill-subtotal', `RM ${subtotal.toFixed(2)}`);
  
  setText('bill-kwtbb', `RM ${(billing.kwtbb || 0).toFixed(2)}`);
  setText('bill-service-tax', `RM ${(billing.serviceTax || 0).toFixed(2)}`);
  setText('bill-total-payable', `RM ${(billing.totalPayable || 0).toFixed(2)}`);

  // Refresh forecast card with new baseline data
  loadForecastBilling();
}

// Override showPage to load billing data when billings page is shown
const originalShowPage = showPage;
window.showPage = function(page) {
  originalShowPage(page);
  if (page === 'billings') {
    loadBillingData();
    loadForecastBilling();
    // Poll billing data every 5 minutes when on billings page
    if (window.billingPollInterval) clearInterval(window.billingPollInterval);
    window.billingPollInterval = setInterval(loadBillingData, 5 * 60 * 1000);
    if (window.forecastBillingInterval) clearInterval(window.forecastBillingInterval);
    window.forecastBillingInterval = setInterval(loadForecastBilling, 5 * 60 * 1000);
  } else if (page === 'reports') {
    loadPzemAllocation();
    loadDailyUsageChart();
    loadDailyPzemChart();
    // Poll allocation data every 5 minutes when on reports page
    if (window.allocationPollInterval) clearInterval(window.allocationPollInterval);
    window.allocationPollInterval = setInterval(loadPzemAllocation, 5 * 60 * 1000);
    // Poll daily usage every 5 minutes
    if (window.dailyUsagePollInterval) clearInterval(window.dailyUsagePollInterval);
    window.dailyUsagePollInterval = setInterval(loadDailyUsageChart, 5 * 60 * 1000);
    // Poll daily PZEM chart every 5 minutes
    if (window.dailyPzemPollInterval) clearInterval(window.dailyPzemPollInterval);
    window.dailyPzemPollInterval = setInterval(loadDailyPzemChart, 5 * 60 * 1000);
  } else {
    if (window.billingPollInterval) {
      clearInterval(window.billingPollInterval);
      window.billingPollInterval = null;
    }
    if (window.allocationPollInterval) {
      clearInterval(window.allocationPollInterval);
      window.allocationPollInterval = null;
    }
    if (window.dailyUsagePollInterval) {
      clearInterval(window.dailyUsagePollInterval);
      window.dailyUsagePollInterval = null;
    }
    if (window.forecastBillingInterval) {
      clearInterval(window.forecastBillingInterval);
      window.forecastBillingInterval = null;
    }
  }
};

window.onclick = function (event) {
  const modal = byId('sensor-names-modal');
  if (event.target === modal) closeSensorNamesModal();
};

// Daily Usage Historical Chart
let dailyUsageChart = null;

async function loadDailyUsageChart() {
  const loadingDiv = byId('daily-usage-loading');
  const errorDiv = byId('daily-usage-error');
  const contentDiv = byId('daily-usage-content');
  const summaryDiv = byId('daily-usage-summary');
  
  if (!loadingDiv || !errorDiv || !contentDiv) return;
  
  // Show loading
  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  contentDiv.style.display = 'none';
  
  try {
    const current = getMytDateParts();
    const monthStr = `${current.year}-${padNumber(current.month)}`;
    const dailyData = await fetchDailyAggregates();
    const dailyArray = [];
    
    for (let day = 1; day <= current.day; day++) {
      const dateStr = `${monthStr}-${padNumber(day)}`;
      const dayData = dailyData?.[dateStr];
      dailyArray.push({
        date: dateStr,
        day,
        kwh: dayData && dayData.totalKWh !== undefined ? (dayData.totalKWh || 0) : 0,
        timestamp: dayData?.lastUpdated || null
      });
    }
    
    if (dailyArray.length === 0) {
      throw new Error('No data available for current month');
    }
    
    // Hide loading, show content
    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'block';
    
    // Prepare chart data
    const labels = dailyArray.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const values = dailyArray.map(d => d.kwh);
    
    // Calculate summary statistics
    const totalKwh = dailyArray.reduce((sum, d) => sum + d.kwh, 0);
    const avgKwh = dailyArray.length > 0 ? totalKwh / dailyArray.length : 0;
    const maxKwh = Math.max(...values, 0);
    const maxDay = dailyArray.find(d => d.kwh === maxKwh);
    const minKwh = Math.min(...values.filter(v => v > 0), 0);
    const minDay = dailyArray.find(d => d.kwh === minKwh && d.kwh > 0);
    
    // Update summary
    if (summaryDiv) {
      summaryDiv.innerHTML = `
        <div style="padding: 15px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 5px;">Total This Month</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${totalKwh.toFixed(2)} kWh</div>
        </div>
        <div style="padding: 15px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 5px;">Daily Average</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--text);">${avgKwh.toFixed(2)} kWh/day</div>
        </div>
        <div style="padding: 15px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 5px;">Peak Day</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--text);">${maxDay ? maxDay.day : '--'} (${maxKwh.toFixed(2)} kWh)</div>
        </div>
        ${minDay ? `
        <div style="padding: 15px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px;">
          <div style="font-size: 12px; color: var(--gray-600); margin-bottom: 5px;">Lowest Day</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--text);">${minDay.day} (${minKwh.toFixed(2)} kWh)</div>
        </div>
        ` : ''}
      `;
    }
    
    // Create/update chart
    const ctx = document.getElementById('daily-usage-chart');
    if (ctx) {
      if (dailyUsageChart) {
        dailyUsageChart.destroy();
      }
      
      dailyUsageChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Energy Consumption (kWh)',
            data: values,
            backgroundColor: 'rgba(0, 212, 255, 0.6)',
            borderColor: '#00d4ff',
            borderWidth: 2,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: '#9ca3af',
                font: { size: 12 }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `Consumption: ${context.parsed.y.toFixed(3)} kWh`;
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Energy Consumption (kWh)',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            x: {
              title: {
                display: true,
                text: 'Date',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
          },
        },
      });
    }
    
    console.log('✅ Daily usage chart loaded:', dailyArray);
    
  } catch (error) {
    console.error('❌ Daily usage chart error:', error);
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Error loading daily usage data: ${error.message}`;
  }
}

async function loadForecastBilling() {
  const card = byId('forecast-bill-card');
  const loadingDiv = byId('forecast-bill-loading');
  const errorDiv = byId('forecast-bill-error');
  const contentDiv = byId('forecast-bill-content');
  if (!card || !loadingDiv || !errorDiv || !contentDiv) return;

  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  contentDiv.style.display = 'none';

  try {
    const current = getMytDateParts();
    const monthStr = `${current.year}-${padNumber(current.month)}`;
    const dailyData = await fetchDailyAggregates();
    const forecast = await fetchEnergyForecast();

    let actualToYesterday = 0;
    for (let day = 1; day < current.day; day++) {
      const key = `${monthStr}-${padNumber(day)}`;
      const value = dailyData?.[key]?.totalKWh;
      if (typeof value === 'number') {
        actualToYesterday += value;
      }
    }

    const predictedRemainingKwh = Number(forecast?.total_predicted_kwh || 0);
    const estimatedMonthlyKwh = actualToYesterday + predictedRemainingKwh;
    const breakdown = calculateEstimatedBilling(estimatedMonthlyKwh);
    const remainingBillRaw = breakdown.totalPayable - (currentBillingData?.totalPayable || 0);
    const remainingBill = Math.max(0, remainingBillRaw);

    // Update summary values
    setText('forecast-bill-total', formatRm(breakdown.totalPayable));
    setText('forecast-bill-estimate', formatRm(breakdown.totalPayable));
    setText('forecast-bill-kwh', `${estimatedMonthlyKwh.toFixed(2)} kWh`);
    setText('forecast-bill-remaining', formatRm(remainingBill));

    // Detailed breakdown
    setText('forecast-energy-charge', formatRm(breakdown.energyCharge));
    setText('forecast-capacity-charge', formatRm(breakdown.capacityCharge));
    setText('forecast-network-charge', formatRm(breakdown.networkCharge));
    setText('forecast-retail-charge', formatRm(breakdown.retailServiceCharge));
    setText('forecast-afa', formatRm(breakdown.afa));
    setText('forecast-eeci', formatRm(breakdown.eeci));
    setText('forecast-kwtbb', formatRm(breakdown.kwtbb));
    setText('forecast-service-tax', formatRm(breakdown.serviceTax));
    setText('forecast-total-payable', formatRm(breakdown.totalPayable));

    const toggleBtn = byId('forecast-bill-toggle');
    const detailsDiv = byId('forecast-bill-details');
    if (toggleBtn && detailsDiv && !toggleBtn.dataset.initialized) {
      toggleBtn.dataset.initialized = 'true';
      toggleBtn.addEventListener('click', () => {
        const isVisible = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isVisible ? 'none' : 'block';
        const textSpan = toggleBtn.querySelector('.btn-text');
        if (textSpan) {
          textSpan.textContent = isVisible ? 'View detailed forecast breakdown' : 'Hide detailed forecast breakdown';
        }
      });
    }

    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'block';
    card.style.display = 'block';
    console.log('✅ Forecast billing loaded:', { actualToYesterday, predictedRemainingKwh, breakdown });
  } catch (error) {
    console.error('❌ Forecast billing error:', error);
    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Error loading forecast billing: ${error.message}`;
  }
}

// Energy Consumption Prediction
let predictionChart = null;

async function predictEnergyConsumption() {
  const loadingDiv = byId('prediction-loading');
  const errorDiv = byId('prediction-error');
  const summaryDiv = byId('prediction-summary');
  const chartContainer = byId('prediction-chart-container');
  const tableContainer = byId('prediction-table-container');
  const btn = byId('predict-energy-btn');
  
  // Hide previous results
  errorDiv.style.display = 'none';
  summaryDiv.style.display = 'none';
  chartContainer.style.display = 'none';
  tableContainer.style.display = 'none';
  
  // Show loading
  loadingDiv.style.display = 'block';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Predicting...</span>';
  }
  
  try {
    const response = await fetch(PREDICT_ENERGY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'end_of_month' }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Prediction failed');
    }
    
    // Hide loading
    loadingDiv.style.display = 'none';
    
    // Display summary
    setText('prediction-period', `${data.start_date} to ${data.end_date} (${data.days_predicted} days)`);
    setText('prediction-total', `${data.total_predicted_kwh.toFixed(2)} kWh`);
    setText('prediction-avg', `${data.average_daily_kwh.toFixed(2)} kWh/day`);
    summaryDiv.style.display = 'block';
    
    // Create/update chart
    const ctx = document.getElementById('prediction-chart');
    if (ctx) {
      if (predictionChart) {
        predictionChart.destroy();
      }
      
      const labels = data.predictions.map(p => {
        const date = new Date(p.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      const values = data.predictions.map(p => p.predicted_consumption);
      
      predictionChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Predicted Consumption (kWh)',
            data: values,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.2)',
            tension: 0.4,
            fill: true,
            borderWidth: 2
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: '#9ca3af',
                font: { size: 12 }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `Predicted: ${context.parsed.y.toFixed(3)} kWh`;
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Energy Consumption (kWh)',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            x: {
              title: {
                display: true,
                text: 'Date',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
          },
        },
      });
      
      chartContainer.style.display = 'block';
    }
    
    // Display table
    const tableBody = byId('prediction-table-body');
    if (tableBody) {
      tableBody.innerHTML = data.predictions.map(p => {
        const date = new Date(p.date);
        const dateStr = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
        return `
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
            <td style="padding: 10px; font-size: 13px; color: #9ca3af;">${dateStr}</td>
            <td style="padding: 10px; font-size: 13px; color: #6b7280;">${p.day_of_week}</td>
            <td style="padding: 10px; text-align: right; font-size: 13px; font-weight: 600; color: #00d4ff;">${p.predicted_consumption.toFixed(3)}</td>
          </tr>
        `;
      }).join('');
      tableContainer.style.display = 'block';
    }
    
    console.log('✅ Prediction successful:', data);
    
  } catch (error) {
    console.error('❌ Prediction error:', error);
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Error: ${error.message}`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">🔮</span><span class="btn-text">Predict Until End of Month</span>';
    }
  }
}

// Daily Energy Consumption by PZEM Chart
let dailyPzemChart = null;

async function loadDailyPzemChart() {
  const loadingDiv = byId('daily-pzem-loading');
  const errorDiv = byId('daily-pzem-error');
  const contentDiv = byId('daily-pzem-content');
  const card = byId('daily-pzem-chart-card');
  
  if (!card) return;
  
  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  contentDiv.style.display = 'none';
  
  try {
    const { year, month, iso: todayStr } = getMytDateParts();
    const monthStr = `${year}-${padNumber(month)}`;
    
    // Fetch daily PZEM data from Cloud Function
    const response = await fetch(`${DAILY_PZEM_USAGE_URL}?month=${monthStr}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch daily PZEM data');
    }
    
    const dailyData = result.data || {};
    const dates = result.dates || [];
    
    // Build datasets for each PZEM
    const datasets = [];
    for (let i = 1; i <= 5; i++) {
      const pzemKey = `pzem${i}`;
      const values = dates.map(date => dailyData[date]?.[pzemKey] || 0);
      
      datasets.push({
        label: `PZEM ${i}`,
        data: values,
        backgroundColor: SENSOR_COLORS[i],
        borderColor: SENSOR_COLORS[i],
        borderWidth: 1,
      });
    }
    
    // Create/update chart
    const ctx = document.getElementById('daily-pzem-chart');
    if (ctx) {
      if (dailyPzemChart) {
        dailyPzemChart.destroy();
      }
      
      const labels = dates.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      
      dailyPzemChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            x: {
              stacked: true,
              display: true,
              title: {
                display: true,
                text: 'Date',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
              stacked: true,
              display: true,
              title: {
                display: true,
                text: 'Energy Consumption (kWh)',
                color: '#9ca3af',
                font: { size: 12 }
              },
              ticks: { color: '#6b7280' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              beginAtZero: true
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#9ca3af',
                usePointStyle: true,
                padding: 15
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(17, 24, 39, 0.9)',
              titleColor: '#ffffff',
              bodyColor: '#9ca3af',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1
            }
          }
        }
      });
    }
    
    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'block';
  } catch (error) {
    console.error('Error loading daily PZEM chart:', error);
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Error loading daily PZEM data: ${error.message}. Note: This feature requires Firestore REST API access or a Cloud Function endpoint.`;
  }
}

// App Settings Management
// Initialize Firestore
let FIRESTORE_DB = null;
function initializeFirestore() {
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded');
    return false;
  }
  
  try {
    // Ensure Firebase app is initialized
    if (!firebase.apps || firebase.apps.length === 0) {
      console.warn('Firebase not initialized, attempting to initialize...');
      firebase.initializeApp(firebaseConfig);
    }
    
    // Get Firestore instance
    FIRESTORE_DB = firebase.firestore();
    console.log('✅ Firestore initialized');
    return true;
  } catch (e) {
    console.error('Firestore initialization failed:', e);
    return false;
  }
}

// Initialize Firestore when script loads (Firebase SDKs should be loaded by then)
// Use a small delay to ensure Firebase SDKs are fully loaded
setTimeout(() => {
  initializeFirestore();
}, 100);

async function loadAppSettings() {
  const loadingDiv = byId('settings-loading');
  const errorDiv = byId('settings-error');
  const form = byId('app-settings-form');
  
  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  form.style.display = 'none';
  
  try {
    const response = await fetch(GET_APP_SETTINGS_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to load settings');
    }
    
    const data = result.data || {};
    byId('ownerEmail').value = data.ownerEmail || '';
    byId('emailAlertsEnabled').checked = data.emailAlertsEnabled || false;
    byId('monthlyTargetType').value = data.monthlyTargetType || 'kwh';
    byId('monthlyTargetValue').value = data.monthlyTargetValue || '';
    byId('warnPercent').value = data.warnPercent || 80;
    byId('criticalPercent').value = data.criticalPercent || 100;
    byId('includePzemBreakdownInEmail').checked = data.includePzemBreakdownInEmail || false;
    byId('AFA_rate').value = data.AFA_rate !== undefined ? data.AFA_rate : -0.065;
    
    loadingDiv.style.display = 'none';
    form.style.display = 'block';
  } catch (error) {
    console.error('Error loading app settings:', error);
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `Error loading settings: ${error.message}`;
  }
}

async function saveAppSettings(event) {
  event.preventDefault();
  
  const statusDiv = byId('settings-save-status');
  statusDiv.textContent = 'Saving...';
  statusDiv.style.color = '#6b7280';
  
  try {
    const settings = {
      ownerEmail: byId('ownerEmail').value.trim(),
      emailAlertsEnabled: byId('emailAlertsEnabled').checked,
      monthlyTargetType: byId('monthlyTargetType').value,
      monthlyTargetValue: parseFloat(byId('monthlyTargetValue').value) || 0,
      warnPercent: parseInt(byId('warnPercent').value) || 80,
      criticalPercent: parseInt(byId('criticalPercent').value) || 100,
      includePzemBreakdownInEmail: byId('includePzemBreakdownInEmail').checked,
      AFA_rate: parseFloat(byId('AFA_rate').value) || -0.065,
    };
    
    const response = await fetch(SAVE_APP_SETTINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save settings');
    }
    
    statusDiv.textContent = '✅ Settings saved successfully!';
    statusDiv.style.color = '#10b981';
    
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 3000);
  } catch (error) {
    console.error('Error saving app settings:', error);
    statusDiv.textContent = `❌ Error saving settings: ${error.message}`;
    statusDiv.style.color = '#ef4444';
  }
}

// Daily PZEM Manual Entry Functions
function clearDailyPzemEntryForm() {
  byId('entry-date').value = '';
  byId('entry-pzem').value = '';
  byId('entry-kwh').value = '';
  byId('daily-pzem-entry-error').style.display = 'none';
  byId('daily-pzem-entry-success').style.display = 'none';
}

async function saveDailyPzemEntry(event) {
  if (event) event.preventDefault();
  
  const loadingDiv = byId('daily-pzem-entry-loading');
  const errorDiv = byId('daily-pzem-entry-error');
  const successDiv = byId('daily-pzem-entry-success');
  
  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  try {
    const date = byId('entry-date').value;
    const pzemId = byId('entry-pzem').value;
    const kwh = parseFloat(byId('entry-kwh').value);
    
    if (!date || !pzemId || isNaN(kwh)) {
      throw new Error('Please fill in all fields');
    }
    
    const response = await fetch(SET_DAILY_PZEM_USAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, pzemId, kwh }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save entry');
    }
    
    loadingDiv.style.display = 'none';
    successDiv.style.display = 'block';
    successDiv.textContent = `✅ Saved: ${date} - ${pzemId.toUpperCase()} = ${kwh.toFixed(3)} kWh`;
    
    // Clear form after 2 seconds
    setTimeout(() => {
      clearDailyPzemEntryForm();
      successDiv.style.display = 'none';
    }, 2000);
  } catch (error) {
    console.error('Error saving daily PZEM entry:', error);
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `❌ Error: ${error.message}`;
  }
}

async function saveBatchDailyPzemEntries() {
  const textarea = byId('batch-entry-textarea');
  const errorDiv = byId('daily-pzem-entry-error');
  const successDiv = byId('daily-pzem-entry-success');
  const loadingDiv = byId('daily-pzem-entry-loading');
  
  const text = textarea.value.trim();
  if (!text) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = 'Please enter data in the textarea';
    return;
  }
  
  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  
  try {
    // Parse CSV format: date,pzemId,kwh
    const lines = text.split('\n').filter(line => line.trim());
    const entries = [];
    
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length !== 3) {
        throw new Error(`Invalid format in line: "${line}". Expected: date,pzemId,kwh`);
      }
      
      const [date, pzemId, kwhStr] = parts;
      const kwh = parseFloat(kwhStr);
      
      if (isNaN(kwh)) {
        throw new Error(`Invalid kWh value in line: "${line}"`);
      }
      
      entries.push({ date, pzemId, kwh });
    }
    
    if (entries.length === 0) {
      throw new Error('No valid entries found');
    }
    
    const response = await fetch(BATCH_SET_DAILY_PZEM_USAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save batch entries');
    }
    
    loadingDiv.style.display = 'none';
    successDiv.style.display = 'block';
    successDiv.innerHTML = `✅ Batch saved: ${result.results.length} entries successful${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`;
    
    if (result.errors.length > 0) {
      console.error('Batch errors:', result.errors);
    }
    
    // Clear textarea after 3 seconds
    setTimeout(() => {
      textarea.value = '';
      successDiv.style.display = 'none';
    }, 3000);
  } catch (error) {
    console.error('Error saving batch entries:', error);
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = `❌ Error: ${error.message}`;
  }
}

// Set today's date as default
function setDefaultDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const dateInput = byId('entry-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = dateStr;
  }
}

// Initialize settings page
window.loadAppSettings = loadAppSettings;
window.saveAppSettings = saveAppSettings;
window.clearDailyPzemEntryForm = clearDailyPzemEntryForm;
window.saveBatchDailyPzemEntries = saveBatchDailyPzemEntries;

// Add event listeners for forms
document.addEventListener('DOMContentLoaded', () => {
  const form = byId('app-settings-form');
  if (form) {
    form.addEventListener('submit', saveAppSettings);
  }
  
  const dailyPzemForm = byId('daily-pzem-entry-form');
  if (dailyPzemForm) {
    dailyPzemForm.addEventListener('submit', saveDailyPzemEntry);
  }
  
  // Set default date when settings page loads
  if (window.location.hash === '#settings' || window.location.hash.includes('settings')) {
    setTimeout(setDefaultDate, 100);
  }
});

// Update showPage to load settings and daily PZEM chart
const originalShowPageWithSettings = window.showPage;
window.showPage = function(page) {
  originalShowPageWithSettings(page);
  if (page === 'settings') {
    loadAppSettings();
    setDefaultDate(); // Set default date for manual entry form
  } else if (page === 'reports') {
    loadDailyPzemChart();
    // Poll daily PZEM chart every 5 minutes
    if (window.dailyPzemPollInterval) clearInterval(window.dailyPzemPollInterval);
    window.dailyPzemPollInterval = setInterval(loadDailyPzemChart, 5 * 60 * 1000);
  } else {
    if (window.dailyPzemPollInterval) {
      clearInterval(window.dailyPzemPollInterval);
      window.dailyPzemPollInterval = null;
    }
  }
};


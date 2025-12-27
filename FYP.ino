#define MYCILA_JSON_SUPPORT
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <MycilaPZEM.h>

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const char* WIFI_SSID     = "Durrani";
const char* WIFI_PASSWORD = "87654321";

// Firebase endpoints - using Cloud Function for reliability
// Cloud Function endpoint (more reliable than direct RTDB writes)
const char* INGEST_URL = "https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/ingestDevice";
const char* API_KEY = "durrani"; // Set this in Firebase Functions config: firebase functions:config:set iot.token="your-secret-key"

// Fallback: Direct RTDB URLs (if Cloud Function fails)
const char* LATEST_URL  = "https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/latest.json";
const char* HISTORY_URL = "https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/history.json";

// Use Cloud Function by default (more reliable)
const bool USE_CLOUD_FUNCTION = true;

// History throttling (default 60 seconds)
const unsigned long HISTORY_INTERVAL_MS = 60000UL;

// Network retry parameters
const uint8_t  MAX_HTTP_RETRIES     = 3;
const uint8_t  MAX_WIFI_RETRIES     = 5;
const uint16_t WIFI_RETRY_DELAY_MS  = 1000;
const uint16_t REQUEST_DELAY_MS     = 2000; // Delay between requests

// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------

Mycila::PZEM pzem1, pzem2, pzem3, pzem4, pzem5;
HardwareSerial SerialPZEM1(1);  // PZEM 1–3
HardwareSerial SerialPZEM2(2);  // PZEM 4–5
WiFiClientSecure secureClient;
WiFiClientSecure secureClientHistory; // Separate client for history to avoid connection reuse issues

unsigned long lastHistoryPush = 0;

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

bool ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    // Verify connection is still valid
    if (WiFi.localIP() != IPAddress(0, 0, 0, 0)) {
      return true;
    }
  }

  Serial.println("WiFi not connected, attempting connection...");
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  for (uint8_t attempt = 0; attempt < MAX_WIFI_RETRIES; ++attempt) {
    Serial.printf("Wi-Fi reconnect attempt %u/%u...\n", attempt + 1, MAX_WIFI_RETRIES);
    unsigned long start = millis();
    unsigned long waitTime = WIFI_RETRY_DELAY_MS * (attempt + 1);

    while (millis() - start < waitTime) {
      wl_status_t status = WiFi.status();
      if (status == WL_CONNECTED) {
        IPAddress ip = WiFi.localIP();
        if (ip != IPAddress(0, 0, 0, 0)) {
          Serial.printf("Wi-Fi connected, IP: %s, RSSI: %d dBm\n", ip.toString().c_str(), WiFi.RSSI());
          return true;
        }
      } else if (status == WL_CONNECT_FAILED) {
        Serial.println("WiFi connection failed (wrong password?)");
      } else if (status == WL_NO_SSID_AVAIL) {
        Serial.println("WiFi SSID not found");
      }
      delay(200);
    }

    Serial.printf("WiFi status after attempt %u: %d\n", attempt + 1, WiFi.status());
    WiFi.reconnect();
  }

  Serial.printf("Wi-Fi connection failed after %u retries. Final status: %d\n", MAX_WIFI_RETRIES, WiFi.status());
  return false;
}

String isoTimestamp() {
  time_t now = time(nullptr);
  if (now < 100000) {
    return "1970-01-01T00:00:00Z";
  }
  struct tm* tmUTC = gmtime(&now);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", tmUTC);
  return String(buffer);
}

// Check if time is synced (not epoch time)
bool isTimeSynced() {
  time_t now = time(nullptr);
  return (now > 100000);
}

// Get Malaysia time (UTC+8)
void getMalaysiaTime(char* dayName, char* dateStr, char* timeStr, bool& synced) {
  time_t now = time(nullptr);
  synced = (now > 100000);
  
  if (!synced) {
    strcpy(dayName, "Unknown");
    strcpy(dateStr, "1970-01-01");
    strcpy(timeStr, "00:00:00");
    return;
  }
  
  // Convert to MYT (UTC+8) by adding 8 hours (28800 seconds)
  time_t mytTime = now + (8 * 3600);
  struct tm* tmMYT = gmtime(&mytTime);
  
  // Day of week (0=Sunday, 6=Saturday)
  const char* days[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
  strcpy(dayName, days[tmMYT->tm_wday]);
  
  // Date: YYYY-MM-DD
  strftime(dateStr, 12, "%Y-%m-%d", tmMYT);
  
  // Time: HH:MM:SS
  strftime(timeStr, 10, "%H:%M:%S", tmMYT);
}

void readAllSensors(DynamicJsonDocument& doc) {
  JsonObject sensors = doc.createNestedObject("sensors");
  Mycila::PZEM* devices[] = { &pzem1, &pzem2, &pzem3, &pzem4, &pzem5 };

  float totalPower = 0.0f;
  float totalEnergy = 0.0f;
  float totalCurrent = 0.0f;

  for (int i = 0; i < 5; ++i) {
    JsonObject sensor = sensors.createNestedObject(String("pzem") + (i + 1));

    if (devices[i]->isEnabled()) {
      devices[i]->toJson(sensor);
    }

    float voltage = sensor.containsKey("voltage") ? sensor["voltage"].as<float>() : 0.0f;
    float current = sensor.containsKey("current") ? sensor["current"].as<float>() : 0.0f;

    float pf = 1.0f;
    if (sensor.containsKey("power_factor")) {
      pf = sensor["power_factor"].as<float>();
      sensor["powerFactor"] = pf;
    } else if (sensor.containsKey("powerFactor")) {
      pf = sensor["powerFactor"].as<float>();
    } else {
      sensor["powerFactor"] = pf;
    }

    float power = 0.0f;
    if (sensor.containsKey("power") && !sensor["power"].isNull()) {
      power = sensor["power"].as<float>();
    } else if (sensor.containsKey("active_power")) {
      power = sensor["active_power"].as<float>();
      sensor["power"] = power;
    } else if (sensor.containsKey("apparent_power")) {
      power = sensor["apparent_power"].as<float>();
      sensor["power"] = power;
    } else {
      power = voltage * current * pf;
      sensor["power"] = power;
    }

    float energy = 0.0f;
    if (sensor.containsKey("energy") && !sensor["energy"].isNull()) {
      energy = sensor["energy"].as<float>();
    } else if (sensor.containsKey("active_energy")) {
      float ae = sensor["active_energy"].as<float>();
      // Adjust this heuristic if your device reports Wh differently
      float ekwh = (ae > 100.0f) ? (ae / 1000.0f) : ae;
      energy = ekwh;
      sensor["energy"] = energy;
    } else {
      sensor["energy"] = 0.0f;
    }

    if (!(sensor.containsKey("frequency") && !sensor["frequency"].isNull())) {
      float freq = 0.0f;
      if (sensor.containsKey("freq")) {
        freq = sensor["freq"].as<float>();
      } else if (sensor.containsKey("frequency_hz")) {
        freq = sensor["frequency_hz"].as<float>();
      }
      sensor["frequency"] = freq;
    }

    if (!sensor.containsKey("voltage") || sensor["voltage"].isNull()) sensor["voltage"] = voltage;
    if (!sensor.containsKey("current") || sensor["current"].isNull()) sensor["current"] = current;
    if (!sensor.containsKey("power")   || sensor["power"].isNull())   sensor["power"]   = power;
    if (!sensor.containsKey("energy")  || sensor["energy"].isNull())  sensor["energy"]  = energy;
    if (!sensor.containsKey("powerFactor") || sensor["powerFactor"].isNull()) sensor["powerFactor"] = pf;

    power   = sensor["power"].as<float>();
    energy  = sensor["energy"].as<float>();
    current = sensor["current"].as<float>();

    totalPower   += power;
    totalEnergy  += energy;
    totalCurrent += current;
  }

  JsonObject total = doc.createNestedObject("total");
  total["power"]   = totalPower;
  total["energy"]  = totalEnergy;
  total["current"] = totalCurrent;

  doc["balance"]   = 0.0f;
  doc["timestamp"] = isoTimestamp();
  
  // Add Malaysia time information
  JsonObject timeInfo = doc.createNestedObject("time");
  char dayName[15];
  char dateStr[12];
  char timeStr[10];
  bool synced = false;
  getMalaysiaTime(dayName, dateStr, timeStr, synced);
  
  timeInfo["day"] = dayName;
  timeInfo["date"] = dateStr;
  timeInfo["time"] = timeStr;
  timeInfo["timezone"] = "MYT (UTC+08:00)";
  timeInfo["synced"] = synced;
  
  // Also add ISO timestamp in MYT
  if (synced) {
    time_t now = time(nullptr);
    time_t mytTime = now + (8 * 3600);
    struct tm* tmMYT = gmtime(&mytTime);
    char mytISO[25];
    strftime(mytISO, sizeof(mytISO), "%Y-%m-%dT%H:%M:%S+08:00", tmMYT);
    timeInfo["iso"] = mytISO;
  } else {
    timeInfo["iso"] = "1970-01-01T00:00:00+08:00";
  }
}

bool sendToCloudFunction(const String& payload, WiFiClientSecure* client = nullptr) {
  // Use provided client or default to secureClient
  if (client == nullptr) {
    client = &secureClient;
  }
  
  for (uint8_t attempt = 0; attempt < MAX_HTTP_RETRIES; ++attempt) {
    // Check WiFi status
    if (WiFi.status() != WL_CONNECTED) {
      Serial.printf("WiFi not connected (status: %d), attempting reconnect...\n", WiFi.status());
      if (!ensureWiFiConnected()) {
        Serial.printf("WiFi reconnect failed, attempt %u/%u\n", attempt + 1, MAX_HTTP_RETRIES);
        delay((1UL << attempt) * 500);
        continue;
      }
    }

    // Verify WiFi is actually connected
    if (WiFi.status() != WL_CONNECTED) {
      Serial.printf("WiFi still not connected after ensureWiFiConnected(), status: %d\n", WiFi.status());
      delay((1UL << attempt) * 500);
      continue;
    }

    Serial.printf("WiFi connected: IP=%s, RSSI=%d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());

    HTTPClient http;
    http.setTimeout(45000); // 45 second timeout (increased for slow networks)
    http.setReuse(false);
    
    Serial.printf("Sending to Cloud Function: %s\n", INGEST_URL);
    Serial.printf("API Key: %s\n", API_KEY);
    
    unsigned long connectStart = millis();
    
    // Test basic connectivity first
    Serial.println("Testing SSL connection...");
    if (!client->connect("asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net", 443)) {
      Serial.printf("❌ SSL connection failed to Cloud Functions server\n");
      client->stop();
      delay((1UL << attempt) * 1000);
      continue;
    }
    
    unsigned long sslTime = millis() - connectStart;
    Serial.printf("✅ SSL connection successful (took %lu ms)\n", sslTime);
    client->stop();
    
    // Now try HTTP request
    connectStart = millis();
    if (!http.begin(*client, INGEST_URL)) {
      Serial.printf("HTTP begin failed for Cloud Function\n");
      delay((1UL << attempt) * 500);
      continue;
    }
    
    unsigned long connectTime = millis() - connectStart;
    Serial.printf("HTTP begin successful (took %lu ms)\n", connectTime);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", API_KEY);
    http.addHeader("Connection", "close");
    http.addHeader("User-Agent", "ESP32-EnergyMonitor/1.0");
    
    Serial.printf("POST request (payload size: %u bytes, timeout: 45s)...\n", payload.length());
    
    unsigned long sendStart = millis();
    int code = http.POST(payload);
    unsigned long sendTime = millis() - sendStart;
    
    Serial.printf("Request completed in %lu ms (%.1f seconds)\n", sendTime, sendTime / 1000.0);
    
    // Decode error codes
    const char* errorMsg = "";
    if (code == -1) errorMsg = " (Connection failed/timeout)";
    else if (code == -2) errorMsg = " (Send header failed)";
    else if (code == -3) errorMsg = " (Send payload failed)";
    else if (code == -4) errorMsg = " (Not connected)";
    else if (code == -5) errorMsg = " (POST not allowed)";
    else if (code == -6) errorMsg = " (No stream)";
    else if (code == -7) errorMsg = " (No HTTP server)";
    else if (code == -8) errorMsg = " (Too less RAM)";
    else if (code == -9) errorMsg = " (Encoding problem)";
    else if (code == -10) errorMsg = " (Stream write timeout)";
    else if (code == -11) errorMsg = " (Read timeout)";
    
    Serial.printf("POST Cloud Function attempt %u -> %d%s\n", attempt + 1, code, errorMsg);

    if (code > 0 && code < 500) {
      String response = http.getString();
      Serial.printf("✅ Success! Response: %d\n", code);
      if (response.length() > 0 && response.length() < 200) {
        Serial.printf("Response: %s\n", response.c_str());
      }
      http.end();
      return true;
    }

    if (code > 0) {
      String response = http.getString();
      Serial.printf("❌ Error response (code %d): %s\n", code, response.c_str());
    } else {
      Serial.printf("❌ HTTP error code: %d\n", code);
    }

    http.end();
    client->stop();
    delay(1000);
    delay((1UL << attempt) * 500);
  }

  Serial.printf("Failed to send to Cloud Function after %u attempts\n", MAX_HTTP_RETRIES);
  return false;
}

bool sendJsonToEndpoint(const char* url, const String& payload, bool usePut, WiFiClientSecure* client = nullptr) {
  // Use provided client or default to secureClient
  if (client == nullptr) {
    client = &secureClient;
  }
  for (uint8_t attempt = 0; attempt < MAX_HTTP_RETRIES; ++attempt) {
    // Check WiFi status
    if (WiFi.status() != WL_CONNECTED) {
      Serial.printf("WiFi not connected (status: %d), attempting reconnect...\n", WiFi.status());
      if (!ensureWiFiConnected()) {
        Serial.printf("WiFi reconnect failed, attempt %u/%u\n", attempt + 1, MAX_HTTP_RETRIES);
        delay((1UL << attempt) * 500);
        continue;
      }
    }

    // Verify WiFi is actually connected
    if (WiFi.status() != WL_CONNECTED) {
      Serial.printf("WiFi still not connected after ensureWiFiConnected(), status: %d\n", WiFi.status());
      delay((1UL << attempt) * 500);
      continue;
    }

    Serial.printf("WiFi connected: IP=%s, RSSI=%d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());

    HTTPClient http;
    http.setTimeout(60000); // 60 second timeout (Firebase can be very slow)
    http.setReuse(false); // Don't reuse connection - create fresh connection each time
    http.setConnectTimeout(30000); // 30 second connection timeout
    
    Serial.printf("Attempting to connect to: %s\n", url);
    unsigned long connectStart = millis();
    
    if (!http.begin(*client, url)) {
      Serial.printf("HTTP begin failed for %s\n", url);
      delay((1UL << attempt) * 500);
      continue;
    }
    
    unsigned long connectTime = millis() - connectStart;
    Serial.printf("HTTP begin successful (took %lu ms)\n", connectTime);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("Connection", "close");
    http.addHeader("User-Agent", "ESP32-EnergyMonitor/1.0");
    
    // Try to reduce payload if possible (but keep all data for now)
    // Firebase REST API works better with smaller payloads
    
    Serial.printf("Sending %s request (payload size: %u bytes, timeout: 60s)...\n", usePut ? "PUT" : "POST", payload.length());
    
    unsigned long sendStart = millis();
    int code = usePut ? http.PUT(payload) : http.POST(payload);
    unsigned long sendTime = millis() - sendStart;
    
    Serial.printf("Request completed in %lu ms (%.1f seconds)\n", sendTime, sendTime / 1000.0);
    
    // Check if we're hitting timeout
    if (sendTime >= 59000) {
      Serial.println("⚠️ WARNING: Request took nearly the full timeout period!");
    }
    
    // Decode error codes
    const char* errorMsg = "";
    if (code == -1) errorMsg = " (Connection failed/timeout)";
    else if (code == -2) errorMsg = " (Send header failed)";
    else if (code == -3) errorMsg = " (Send payload failed)";
    else if (code == -4) errorMsg = " (Not connected)";
    else if (code == -5) errorMsg = (usePut ? " (PUT not allowed)" : " (POST not allowed)");
    else if (code == -6) errorMsg = " (No stream)";
    else if (code == -7) errorMsg = " (No HTTP server)";
    else if (code == -8) errorMsg = " (Too less RAM)";
    else if (code == -9) errorMsg = " (Encoding problem)";
    else if (code == -10) errorMsg = " (Stream write timeout)";
    else if (code == -11) errorMsg = " (Read timeout)";
    
    Serial.printf("%s %s attempt %u -> %d%s\n", usePut ? "PUT" : "POST", url, attempt + 1, code, errorMsg);

    if (code > 0 && code < 500) {
      Serial.printf("✅ Success! Response: %d\n", code);
      String response = http.getString();
      if (response.length() > 0 && response.length() < 200) {
        Serial.printf("Response: %s\n", response.c_str());
      }
      http.end();
      return true;
    }

    if (code > 0) {
      String response = http.getString();
      Serial.printf("❌ Error response (code %d): %s\n", code, response.c_str());
    } else {
      Serial.printf("❌ HTTP error code: %d\n", code);
    }

    http.end();
    // Close the secure client connection completely
    client->stop();
    delay(1000); // Wait before retry
    delay((1UL << attempt) * 500);
  }

  Serial.printf("Failed to send to %s after %u attempts\n", url, MAX_HTTP_RETRIES);
  return false;
}

// -----------------------------------------------------------------------------
// Arduino lifecycle
// -----------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  SerialPZEM1.begin(9600, SERIAL_8N1, 16, 17);
  pzem1.begin(SerialPZEM1, 16, 17, 0x01, true);
  pzem2.begin(SerialPZEM1, 16, 17, 0x02, true);
  pzem3.begin(SerialPZEM1, 16, 17, 0x03, true);

  SerialPZEM2.begin(9600, SERIAL_8N1, 14, 27);
  pzem4.begin(SerialPZEM2, 14, 27, 0x04, true);
  pzem5.begin(SerialPZEM2, 14, 27, 0x05, true);

  WiFi.mode(WIFI_STA);
  ensureWiFiConnected();

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("Syncing time");
  for (uint8_t i = 0; i < 30; ++i) {
    if (time(nullptr) > 100000) break;
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  secureClient.setInsecure();  // For dev only; replace with secureClient.setCACert(...) in production
  secureClient.setTimeout(60000); // 60 second timeout for SSL handshake
  secureClient.setHandshakeTimeout(30000); // 30 second handshake timeout
  
  // Initialize history client
  secureClientHistory.setInsecure();
  secureClientHistory.setTimeout(60000);
  secureClientHistory.setHandshakeTimeout(30000);
}

void loop() {
  DynamicJsonDocument doc(4096);
  readAllSensors(doc);

  serializeJsonPretty(doc, Serial);
      Serial.println();

  String payload;
  serializeJson(doc, payload);
  
  Serial.printf("Payload size: %u bytes (%.1f KB)\n", payload.length(), payload.length() / 1024.0);
  
  // Warn if payload is getting large
  if (payload.length() > 3000) {
    Serial.println("⚠️ WARNING: Large payload may cause slow responses");
  }
  
  // If payload is too large, it might cause issues - warn if > 4KB
  if (payload.length() > 4096) {
    Serial.printf("⚠️ WARNING: Payload is very large (%u bytes), this may cause timeouts\n", payload.length());
  }

  Serial.printf(
      "OUT latest: p1=%.2fW p2=%.2fW p3=%.2fW p4=%.2fW p5=%.2fW total=%.2fW\n",
      doc["sensors"]["pzem1"]["power"].as<float>(),
      doc["sensors"]["pzem2"]["power"].as<float>(),
      doc["sensors"]["pzem3"]["power"].as<float>(),
      doc["sensors"]["pzem4"]["power"].as<float>(),
      doc["sensors"]["pzem5"]["power"].as<float>(),
      doc["total"]["power"].as<float>());

  if (!ensureWiFiConnected()) {
    Serial.println("Skipping send; Wi-Fi unavailable.");
    delay(3000);
    return;
  }

  // Send data using Cloud Function (more reliable) or direct RTDB (fallback)
  bool success = false;
  
  if (USE_CLOUD_FUNCTION) {
    // Use Cloud Function - it handles both /latest and /history automatically
    Serial.println("Using Cloud Function endpoint (more reliable)...");
    Serial.printf("Network test: Can reach internet? %s\n", (WiFi.status() == WL_CONNECTED) ? "Yes" : "No");
    
    success = sendToCloudFunction(payload);
    
    if (success) {
      Serial.println("✅ Data sent successfully via Cloud Function");
      // Cloud Function handles history automatically, so update lastHistoryPush
      unsigned long nowMs = millis();
      if (lastHistoryPush == 0 || nowMs - lastHistoryPush >= HISTORY_INTERVAL_MS) {
        lastHistoryPush = nowMs;
      }
    } else {
      Serial.println("❌ Cloud Function failed after all retries");
      Serial.println("⚠️ This suggests a network connectivity issue, not a Firebase issue");
      Serial.println("💡 Try: 1) Mobile hotspot, 2) Different WiFi, 3) Check router firewall");
      // Don't fallback to RTDB - if Cloud Function fails, RTDB will also fail
    }
  } else {
    // Direct RTDB writes (original method)
    Serial.println("Using direct RTDB writes...");
    success = sendJsonToEndpoint(LATEST_URL, payload, true);
    
    if (success) {
      Serial.println("✅ Latest data sent successfully");
    } else {
      Serial.println("❌ Failed to send latest data");
    }

    // Add delay between requests
    delay(REQUEST_DELAY_MS);

    // Send to /history (throttled)
    unsigned long nowMs = millis();
    if (lastHistoryPush == 0 || nowMs - lastHistoryPush >= HISTORY_INTERVAL_MS) {
      Serial.println("Sending to history (throttled interval)...");
      secureClientHistory.setInsecure();
      secureClientHistory.setTimeout(60000);
      if (sendJsonToEndpoint(HISTORY_URL, payload, false, &secureClientHistory)) {
        lastHistoryPush = nowMs;
        Serial.println("✅ History data sent successfully");
      } else {
        Serial.println("❌ Failed to send history data (will retry on next interval)");
      }
    } else {
      unsigned long remaining = HISTORY_INTERVAL_MS - (nowMs - lastHistoryPush);
      Serial.printf("History push throttled (next in %lu ms)\n", remaining);
    }
  }

  delay(2000); // Main loop delay
}

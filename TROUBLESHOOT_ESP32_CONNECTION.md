# Troubleshooting ESP32 Connection Errors

## Error Codes Explained

Your ESP32 is showing HTTP error codes:
- **`-1`**: Connection failed or timeout
- **`-11`**: Read timeout

These typically indicate network connectivity issues.

## Common Causes & Fixes

### 1. WiFi Connection Issues
**Symptoms**: Error `-1`, WiFi status not `WL_CONNECTED`

**Check**:
- Is WiFi SSID and password correct in `FYP.ino`?
- Is your WiFi router working?
- Is ESP32 within range?

**Fix**:
- Verify `WIFI_SSID` and `WIFI_PASSWORD` in code
- Check Serial Monitor for WiFi connection messages
- Try connecting ESP32 to a different WiFi network

### 2. SSL/TLS Handshake Failure
**Symptoms**: Connection fails immediately, error `-1`

**Fix**:
- Code already uses `setInsecure()` for dev
- If still failing, try increasing timeout: `secureClient.setTimeout(15000)`

### 3. Database Rules Blocking Writes
**Symptoms**: Connection succeeds but returns 401/403

**Check**:
- Go to Firebase Console → Realtime Database → Rules
- Ensure `.write: true` for `/latest` and `/history`

**Fix**:
```json
{
  "rules": {
    "latest": {
      ".read": true,
      ".write": true
    },
    "history": {
      ".read": true,
      ".write": true
    }
  }
}
```

### 4. Network Timeout
**Symptoms**: Error `-11` (read timeout)

**Fix**:
- Check internet connection
- Verify Firebase URL is correct
- Try increasing HTTP timeout in code

### 5. Insufficient Memory
**Symptoms**: Random failures, error `-8`

**Fix**:
- Reduce JSON buffer size if needed
- Close unused connections

## Diagnostic Steps

1. **Check Serial Monitor Output**:
   - Look for "WiFi connected" message
   - Check IP address is assigned
   - Verify RSSI (signal strength) > -70 dBm

2. **Test WiFi Connection**:
   - Upload code and watch Serial Monitor
   - Should see: "Wi-Fi connected, IP: 192.168.x.x"

3. **Test HTTP Connection**:
   - After WiFi connects, should see PUT/POST attempts
   - Success = HTTP code 200, 201, or 204
   - Failure = negative codes or 4xx/5xx

4. **Check Firebase URL**:
   - Verify URL in code matches your database
   - Should be: `https://iot-energy-monitoring-sy-1d1a1-default-rtdb.asia-southeast1.firebasedatabase.app/`

## Quick Test

1. Upload updated code (with better error messages)
2. Open Serial Monitor at 115200 baud
3. Look for:
   - WiFi connection status
   - IP address
   - HTTP error codes with descriptions
   - Any error messages

## Updated Code Features

The updated code now:
- Shows detailed error messages for each HTTP error code
- Displays WiFi status and signal strength
- Verifies WiFi connection before each HTTP request
- Adds 10-second timeout for HTTP requests
- Better retry logic with exponential backoff

## Next Steps

1. Upload the updated `FYP.ino` code
2. Watch Serial Monitor for detailed error messages
3. Share the new error output if issues persist



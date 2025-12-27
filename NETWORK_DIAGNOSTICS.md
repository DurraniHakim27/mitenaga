# Network Diagnostics for ESP32

## Problem
Even Cloud Functions are timing out, suggesting a **network connectivity issue** rather than a Firebase-specific problem.

## Possible Causes

### 1. Router/Firewall Blocking
- Your router might be blocking HTTPS connections to Firebase
- Check router settings for "HTTPS filtering" or "SSL inspection"
- Try connecting ESP32 to a different network (mobile hotspot)

### 2. ISP Throttling
- Some ISPs throttle or block certain domains
- Try at different times of day
- Contact ISP if issue persists

### 3. DNS Issues
- ESP32 might not be resolving Firebase domains correctly
- Check if you can ping `asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net` from your computer

### 4. SSL/TLS Handshake Problems
- ESP32's SSL library might be having issues
- The handshake might be timing out

## Quick Tests

### Test 1: Mobile Hotspot
1. Create a mobile hotspot on your phone
2. Connect ESP32 to hotspot
3. Test if it works

### Test 2: Different Network
1. Try connecting ESP32 to a different WiFi network
2. See if the issue persists

### Test 3: Browser Test
On the same network as ESP32, open in browser:
```
https://asia-southeast1-iot-energy-monitoring-sy-1d1a1.cloudfunctions.net/ingestDevice
```
If this also times out, it's a network issue.

### Test 4: Check Router Logs
- Look for blocked connections
- Check firewall rules
- Look for "SSL/TLS" or "HTTPS" blocking

## Alternative Solutions

### Option 1: Use HTTP (NOT SECURE - Testing Only)
If HTTPS is blocked, you could temporarily test with HTTP, but Firebase requires HTTPS, so this won't work.

### Option 2: Use MQTT
- Set up MQTT broker (e.g., Mosquitto)
- ESP32 publishes to MQTT
- Cloud Function subscribes and writes to Firebase
- More reliable for IoT devices

### Option 3: Use Firebase Admin SDK via Different Endpoint
- Create a simpler endpoint that doesn't require SSL
- But Firebase requires HTTPS, so this won't work either

### Option 4: Check ESP32 SSL Library
- Update ESP32 Arduino core
- Try different SSL/TLS settings
- Check if there are known issues with your ESP32 board

## Most Likely Fix

**Try connecting ESP32 to a mobile hotspot** - this will tell us if it's your router/network blocking the connections.

If it works on mobile hotspot but not on your WiFi, the issue is your router/firewall.

## Next Steps

1. Test with mobile hotspot
2. Check router firewall settings
3. Try different WiFi network
4. Check if browser can access the same URLs on same network







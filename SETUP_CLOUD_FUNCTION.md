# Setting Up Cloud Function Endpoint (More Reliable)

## Why Use Cloud Function?

The Cloud Function endpoint is **much more reliable** than direct RTDB writes because:
- ✅ Faster response times (typically 1-3 seconds vs 30-60 seconds)
- ✅ Better error handling
- ✅ Automatic retries on server side
- ✅ Handles both `/latest` and `/history` in one call
- ✅ More secure (API key authentication)

## Setup Steps

### 1. Set API Key in Firebase Functions Config

Run this command in your terminal:

```bash
firebase functions:config:set iot.token="your-secret-api-key-here"
```

**Important**: Choose a strong, random API key. For example:
```bash
firebase functions:config:set iot.token="aB3xK9mP2qR7vW4tY8uI1oP5sD6fG0hJ"
```

### 2. Deploy Functions

```bash
firebase deploy --only functions
```

### 3. Update ESP32 Code

In `FYP.ino`, update the API key:

```cpp
const char* API_KEY = "your-secret-api-key-here"; // Same as in step 1
```

### 4. Upload to ESP32

Upload the updated code to your ESP32.

## How It Works

1. ESP32 sends POST request to Cloud Function with API key
2. Cloud Function validates API key
3. Cloud Function writes to both `/latest` and `/history` in RTDB
4. Cloud Function responds quickly (1-3 seconds)
5. ESP32 receives success response

## Benefits

- **Reliability**: Cloud Functions are more stable than direct RTDB writes
- **Speed**: Much faster (1-3s vs 30-60s)
- **Security**: API key prevents unauthorized access
- **Simplicity**: One call handles both endpoints

## Testing

After setup, check Serial Monitor. You should see:
```
Using Cloud Function endpoint (more reliable)...
Sending to Cloud Function: https://...
POST Cloud Function attempt 1 -> 200
✅ Success! Response: 200
✅ Data sent successfully via Cloud Function
```

If you see errors, check:
1. API key matches in both places
2. Functions are deployed
3. Network connectivity

## Fallback

If Cloud Function fails, the code will automatically fallback to direct RTDB writes.







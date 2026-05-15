#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <ArduinoJson.h> // Make sure to install ArduinoJson library v6 or v7

// ---------------------------------------------------------
// Configuration
// ---------------------------------------------------------

// Wi-Fi settings
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Replace with your Vercel Project URL or AI Studio App URL
// Example: "https://my-smart-home-app.vercel.app/esp-sync"
const char* serverUrl = "https://YOUR_VERCEL_APP_URL/esp-sync";

// DHT11 Sensor settings
#define DHTPIN 4
#define DHTTYPE DHT11

// Relay settings
// Modul relay biasanya aktif LOW (memberi nilai LOW menyalakan relay/menyambung arus)
// Jika module anda aktif HIGH, ubah RELAY_ON menjadi HIGH dan RELAY_OFF menjadi LOW
#define RELAY_ON LOW
#define RELAY_OFF HIGH

const int relayPins[4] = {5, 19, 18, 23}; // Relay 1, 2, 3, 4

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  
  // Initialize DHT sensor
  dht.begin();
  
  // Initialize relay pins
  for(int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], RELAY_OFF); // Matikan relay pada saat booting awal
  }

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // 1. Read Sensor
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    
    // Check if any reads failed
    if (isnan(h) || isnan(t)) {
      Serial.println("Failed to read from DHT sensor!");
      delay(2000);
      return;
    }
    
    Serial.printf("Temperature: %.1f°C, Humidity: %.1f%%\n", t, h);
    
    // 2. Prepare HTTP connection
    HTTPClient http;
    
    // Build the URL with query parameters for the sensor data
    String url = String(serverUrl) + "?temp=" + String(t) + "&hum=" + String(h);
    
    http.begin(url);
    
    // 3. Send HTTP GET request
    int httpResponseCode = http.GET();
    
    if (httpResponseCode > 0) {
      Serial.printf("HTTP Response code: %d\n", httpResponseCode);
      String payload = http.getString();
      Serial.println("Response Payload: " + payload);
      
      // 4. Parse the JSON response containing the relay states
      // Payload looks like: {"1":false,"2":true,"3":false,"4":false}
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);
      
      if (!error) {
        // Update relays physically based on server command
        // doc["1"] refers to Relay 1 (Pin 5)
        digitalWrite(relayPins[0], doc["1"].as<bool>() ? RELAY_ON : RELAY_OFF);
        // doc["2"] refers to Relay 2 (Pin 19)
        digitalWrite(relayPins[1], doc["2"].as<bool>() ? RELAY_ON : RELAY_OFF);
        // doc["3"] refers to Relay 3 (Pin 18)
        digitalWrite(relayPins[2], doc["3"].as<bool>() ? RELAY_ON : RELAY_OFF);
        // doc["4"] refers to Relay 4 (Pin 23)
        digitalWrite(relayPins[3], doc["4"].as<bool>() ? RELAY_ON : RELAY_OFF);
      } else {
        Serial.print("deserializeJson() failed: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.printf("Error code: %d\n", httpResponseCode);
    }
    // Free resources
    http.end();
  } else {
    Serial.println("WiFi Disconnected");
  }
  
  // Delay before the next loop
  // Jangan diset terlalu cepat agar tidak membebani limit API / Cloud function server
  delay(5000); 
}

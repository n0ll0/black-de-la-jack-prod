#include <ESP8266WiFi.h>  // Use <WiFi.h> for ESP32
#include <ESP8266HTTPClient.h>  // Use <HTTPClient.h> for ESP32
#include <ArduinoJson.h>
#include <DHT.h>

#define DHTPIN 2  // GPIO2 (D4 on NodeMCU)
#define DHTTYPE DHT22  // Change to DHT11 if needed
DHT dht(DHTPIN, DHTTYPE);

// WiFi credentials
const char* ssid = "your_wifi_ssid";
const char* password = "your_wifi_password";

// Server details
const char* serverUrl = "http://your-server-ip:3000/json";  // Change IP to match your server

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  dht.begin();

  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("Failed to read from DHT sensor!");
      return;
    }

    // Create JSON object
    StaticJsonDocument<200> jsonDoc;
    jsonDoc["date"] = getISOTime();
    jsonDoc["temperature"] = temperature;
    jsonDoc["humidity"] = humidity;
    jsonDoc["other"] = "Arduino Sensor";

    String requestBody;
    serializeJson(jsonDoc, requestBody);

    // Send POST request
    int httpResponseCode = http.POST(requestBody);
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();
  } else {
    Serial.println("WiFi Disconnected");
  }

  delay(60000);  // Send data every 60 seconds
}

// Function to get current timestamp in ISO format
String getISOTime() {
  time_t now = time(nullptr);
  struct tm* timeInfo;
  timeInfo = gmtime(&now);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", timeInfo);
  return String(buffer);
}

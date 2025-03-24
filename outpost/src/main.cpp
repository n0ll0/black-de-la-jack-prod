#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// WiFi credentials
const char* ssid = "your_wifi_ssid";
const char* password = "your_wifi_password";

// Server details
const char* serverUrl = "http://insert_server_here:3000";

// Function prototype
String getISOTime();

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

    // Use JsonDocument directly
    JsonDocument* jsonDoc = new JsonDocument();
    
    (*jsonDoc)["date"] = getISOTime();
    (*jsonDoc)["temperature"] = temperature;
    (*jsonDoc)["humidity"] = humidity;
    (*jsonDoc)["other"] = "ESP32 Sensor";

    String requestBody;
    serializeJson(*jsonDoc, requestBody);

    // Send POST request
    int httpResponseCode = http.POST(requestBody);
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();

    // Free allocated memory
    delete jsonDoc;
  } else {
    Serial.println("WiFi Disconnected");
  }

  delay(60000);
}

// Function to get current timestamp in ISO format
String getISOTime() {
  time_t now = time(nullptr);
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo)) {
    Serial.println("Failed to obtain time");
    return "";
  }
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(buffer);
}
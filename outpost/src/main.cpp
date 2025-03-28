#include <BluetoothSerial.h>
#include <DHT.h>
#include <ArduinoJson.h>

#define DHTPIN 2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Bluetooth Serial Object
BluetoothSerial SerialBT;

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


void setup() {
  Serial.begin(115200);
  dht.begin();

  // Start Bluetooth Serial
  if (!SerialBT.begin("ESP32_DHT22")) {  // "ESP32_DHT22" is the Bluetooth device name
    Serial.println("Bluetooth initialization failed!");
    return;
  }
  Serial.println("Bluetooth initialized and waiting for connection...");
  
  // Waiting for Bluetooth device connection
  while (!SerialBT.connected()) {
    delay(1000);
    Serial.println("Waiting for Bluetooth connection...");
  }

  Serial.println("Bluetooth device connected!");
}

void loop() {
  // Check if Bluetooth is connected
  if (SerialBT.hasClient()) {
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("Failed to read from DHT sensor!");
      return;
    }

    // Create a JsonDocument
    JsonDocument jsonDoc;

    // Add data to the JsonDocument
    jsonDoc["date"] = getISOTime();
    jsonDoc["temperature"] = temperature;
    jsonDoc["humidity"] = humidity;
    jsonDoc["other"] = "ESP32 Sensor";

    // Serialize the JsonDocument into a string
    String requestBody;
    serializeJson(jsonDoc, requestBody);

    // Send the JSON data via Bluetooth Serial
    SerialBT.println(requestBody);  // Send data over Bluetooth

    Serial.println("Data sent over Bluetooth:");
    Serial.println(requestBody);
  } else {
    Serial.println("No Bluetooth client connected.");
  }

  // Wait 60 seconds before sending data again
  delay(60000);
}

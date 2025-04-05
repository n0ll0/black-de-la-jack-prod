#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <time.h>

#define SERVICE_UUID        "711661ab-a17a-4c7f-bc9f-de1f070a66f4"
#define CHARACTERISTIC_UUID "4d4bc742-f257-41e5-b268-6bc4f3d1ea73"

#define DHTPIN 2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

BLEServer* pServer = nullptr;
BLECharacteristic* pCharacteristic = nullptr;
bool deviceConnected = false;

class ServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("BLE device connected");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("BLE device disconnected");
  }
};

void setup() {
  Serial.begin(115200);
  dht.begin();

  BLEDevice::init("BlackDeLaJack");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );

  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->start();

  Serial.println("Server started. Waiting for client...");
}

void loop() {
  if (deviceConnected) {
    float temperature = 1000;
    float humidity = 727;

    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("Failed to read from DHT sensor!");
      delay(10000);
      return;
    }

    // Create JSON using JsonDocument (still static memory)
    JsonDocument doc; // Alias for StaticJsonDocument<256>
    StaticJsonDocument<256>& docRef = reinterpret_cast<StaticJsonDocument<256>&>(doc);
    
    docRef["temperature"] = temperature;
    docRef["humidity"] = humidity;

    char jsonBuffer[256];
    serializeJson(docRef, jsonBuffer);

    // Send as BLE notification
    pCharacteristic->setValue((uint8_t*)jsonBuffer, strlen(jsonBuffer));
    pCharacteristic->notify();

    Serial.print("Sent via BLE: ");
    Serial.println(jsonBuffer);
  } else {
    Serial.println("No BLE client connected.");
  }

  delay(1000); // send every 1 seconds
}

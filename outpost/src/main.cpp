#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <time.h>

#define DEBUG

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
    pServer->getAdvertising()->start(); // Restart advertising
    Serial.println("Advertising restarted");
  }
};

void setup() {
  #ifdef DEBUG
  Serial.begin(9600);
  #endif
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
  #ifdef DEBUG
  Serial.println("Server started. Waiting for client...");
  #endif
}

void loop() {
  if (deviceConnected) {
    // Read temperature and humidity from DHT sensor
    #ifdef DEBUG
    float temperature = 1000;
    #else
    float temperature = dht.readTemperature();
    #endif
    #ifdef DEBUG
    float humidity = 727;
    #else
    float humidity = dht.readHumidity();
    #endif


    if (isnan(temperature) || isnan(humidity)) {
      #ifdef DEBUG
      Serial.println("Failed to read from DHT sensor!");
      #endif
      delay(10000);
      return;
    }

    JsonDocument doc;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["location"] = "Living Room";

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);

    // Send as BLE notification
    pCharacteristic->setValue((uint8_t*)jsonBuffer, strlen(jsonBuffer));
    pCharacteristic->notify();
    #ifdef DEBUG
    Serial.print("Sent via BLE: ");
    Serial.println(jsonBuffer);
    #endif
  } else {
    #ifdef DEBUG
    Serial.println("No BLE client connected.");
    #endif
  }

  delay(1000); // send every 1 seconds
}

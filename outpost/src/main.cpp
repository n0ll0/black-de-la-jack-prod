#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>
// #include <SPS30.h>
#include <MHZ19.h>
#include <HardwareSerial.h>
#include <Wire.h>
#include <time.h>
#include <ArduinoJson.h>

#define DEBUG
#define DEBUG1

#define SERVICE_UUID        "711661ab-a17a-4c7f-bc9f-de1f070a66f4"
#define CHARACTERISTIC_UUID "4d4bc742-f257-41e5-b268-6bc4f3d1ea73"

//DHT22
#define DHTPIN 2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// MQ2
#define MQ2_PIN 36  // Analog Pin

// // SPS30 (I2C)
// SPS30 sps30;  // GPIO 21 (SDA) & GPIO 22 (SCL)

// MH-Z19B (Serial)
#define RX_PIN 16
#define TX_PIN 17

// MH-Z19B (Serial)
HardwareSerial mySerial(1);  // Use HardwareSerial 1
MHZ19 mhz19(&mySerial); 

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
  #ifdef DEBUG1
  Serial.begin(9600);

  #endif
  // DHT setup
  dht.begin();

 // Initialize the MH-Z19 sensor
 mhz19.setAutoCalibration(true);

  // // SPS30 setup
  // Wire.begin();
  // if (!sps30.begin(Wire)) {
  //   Serial.println("SPS30 not detected!");
  // } else {
  //   sps30.startMeasurement();
  //   Serial.println("SPS30 started successfully!");
  // }

  // BLE setup
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
  #ifdef DEBUG1
  Serial.println("Server started. Waiting for client...");
  #endif
}

void loop() {
  if (deviceConnected) {
    // Read temperature and humidity
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

    // Check if sensor readings are valid
    if (isnan(temperature) || isnan(humidity)) {
      #ifdef DEBUG
      delay(10000);
      #endif
      Serial.println("Failed to read from DHT sensor!");
      return;
    }

    // Read CO2
    #ifdef DEBUG
    int co2 = 400;
    #else
    int co2 = mhz19.getCO2();
    if (co2 == -1) {
      Serial.println("Failed to read from MH-Z19B!");
    }
    #endif

    // Read gas concentration
    #ifdef DEBUG
    int mq2Value = 512;
    #else
    int mq2Value = analogRead(MQ2_PIN);
    #endif

    // Read particulate matter (PM2.5, PM10)
    #ifdef DEBUG
    float pm2_5 = 25.5;
    float pm10 = 40.5;
    #else
    // float pm2_5, pm10;
    // if (sps30.readReadyFlag() && sps30.readMeasurement()) {
    //   pm2_5 = sps30.getPM2_5();
    //   pm10 = sps30.getPM10();
    // } 
    // else {
    //   pm2_5 = pm10 = -1;  // If fails to read
    // }
    float pm2_5 = 25.5;
    float pm10 = 40.5;
    #endif

    JsonDocument doc;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["co2"] = co2;
    doc["mq2"] = mq2Value;
    doc["pm2_5"] = pm2_5;
    doc["pm10"] = pm10;
    doc["location"] = "kitchen";

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);

    // Send as BLE notification
    pCharacteristic->setValue((uint8_t*)jsonBuffer, strlen(jsonBuffer));
    pCharacteristic->notify();
    #ifdef DEBUG1
    Serial.print("Sent via BLE: ");
    Serial.println(jsonBuffer);
    #endif
  } else {
    #ifdef DEBUG1
    Serial.println("No BLE client connected.");
    #endif
  }

  delay(5000); // send every 5 second
}

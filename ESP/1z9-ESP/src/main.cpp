// ================================================================
//  1 z 9  —  ESP32-S3 (Adafruit Metro)
//  JSON API + WiFi. Bez frontendu - UI hostuje projekt web/.
//  UART do Arduino Uno przez Serial1 (piny TX/RX na plytce).
// ================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// -------- KONFIG WiFi --------
static const char* WIFI_SSID = "TWOJE_WIFI";
static const char* WIFI_PASS = "TWOJE_HASLO";

// -------- TOKEN do API --------
// Backend Node musi wysylac ten sam token w naglowku X-Api-Token
// (patrz server/.env: ESP_API_TOKEN). Chroni przed dowolnym urzadzeniem w LAN.
static const char* API_TOKEN = "1z9-esp-token";

// -------- LINK do Uno --------
// Adafruit Metro ESP32-S3: TX = GPIO43, RX = GPIO44 (piny oznaczone TX/RX na plytce).
#define LINK        Serial1
#define LINK_BAUD   115200
#define LINK_RX     44
#define LINK_TX     43

// -------- STALE --------
static const uint8_t NUM_PANELS        = 9;
static const uint8_t SECTORS_PER_PANEL = 3;
static const uint8_t NUM_BUTTONS       = 3;

// -------- STAN --------
struct SectorState { uint8_t r, g, b; bool on; };
SectorState sectors[NUM_PANELS][SECTORS_PER_PANEL];
uint8_t brightness = 128;

struct BtnEvent { int8_t id; unsigned long t; };
BtnEvent events[NUM_BUTTONS];
int eventCount = 0;
bool round2Active = false;

String linkRxBuf;

WebServer server(80);

// -------- HELPERS: link -> Uno --------
static void linkPrintln(const String& s) { LINK.print(s); LINK.print('\n'); }

static void sendSectorToArduino(uint8_t p, uint8_t s) {
  const SectorState& x = sectors[p][s];
  if (x.on) {
    LINK.print("PANEL:"); LINK.print(p);
    LINK.print(':');      LINK.print(s);
    LINK.print(':');
    LINK.print(x.r); LINK.print(','); LINK.print(x.g); LINK.print(','); LINK.println(x.b);
  } else {
    LINK.print("OFF:"); LINK.print(p); LINK.print(':'); LINK.println(s);
  }
}

// -------- ODBIOR z Uno --------
static void processArduinoLine(String msg) {
  msg.trim();
  if (msg.startsWith("BTN:")) {
    int c1 = msg.indexOf(':', 4);
    if (c1 < 0) return;
    int id = msg.substring(4, c1).toInt();
    unsigned long t = msg.substring(c1 + 1).toInt();
    for (int i = 0; i < eventCount; i++) if (events[i].id == id) return;
    if (eventCount < NUM_BUTTONS) events[eventCount++] = { (int8_t)id, t };
  } else if (msg == "ROUND2:STARTED") {
    round2Active = true;
    eventCount = 0;
  } else if (msg == "ROUND2:STOPPED") {
    round2Active = false;
  }
}

static void readLink() {
  while (LINK.available()) {
    char c = LINK.read();
    if (c == '\n') { processArduinoLine(linkRxBuf); linkRxBuf = ""; }
    else if (c != '\r' && linkRxBuf.length() < 128) linkRxBuf += c;
  }
}

// -------- CORS --------
static void sendCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type,X-Api-Token");
}

// -------- AUTH --------
// Zwraca true, gdy token OK. W przeciwnym razie odpisuje 401 i zwraca false.
static bool checkToken() {
  String t = server.header("X-Api-Token");
  if (t == API_TOKEN) return true;
  sendCors();
  server.send(401, "application/json", "{\"err\":\"unauthorized\"}");
  return false;
}

static void sendJson(int code, const String& body) {
  sendCors();
  server.send(code, "application/json", body);
}

static void handleOptions() {
  sendCors();
  server.send(204);
}

// -------- API --------
// GET /api/state -> pelny stan (sektory, jasnosc, runda 2, eventy)
static void handleState() {
  JsonDocument doc;
  doc["round2"] = round2Active;
  doc["brightness"] = brightness;
  doc["numPanels"] = NUM_PANELS;
  doc["sectorsPerPanel"] = SECTORS_PER_PANEL;
  doc["numButtons"] = NUM_BUTTONS;

  JsonArray panels = doc["panels"].to<JsonArray>();
  for (int p = 0; p < NUM_PANELS; p++) {
    JsonArray sarr = panels.add<JsonArray>();
    for (int s = 0; s < SECTORS_PER_PANEL; s++) {
      JsonObject o = sarr.add<JsonObject>();
      o["r"]  = sectors[p][s].r;
      o["g"]  = sectors[p][s].g;
      o["b"]  = sectors[p][s].b;
      o["on"] = sectors[p][s].on;
    }
  }

  JsonArray evs = doc["events"].to<JsonArray>();
  for (int i = 0; i < eventCount; i++) {
    JsonObject o = evs.add<JsonObject>();
    o["id"] = events[i].id;
    o["t"]  = events[i].t;
  }

  String out;
  serializeJson(doc, out);
  sendJson(200, out);
}

// POST /api/sector  { panel, sector, on, r, g, b }
static void handleSector() {
  if (!checkToken()) return;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) { sendJson(400, "{\"err\":\"json\"}"); return; }
  int p = doc["panel"] | -1;
  int s = doc["sector"] | -1;
  if (p < 0 || p >= NUM_PANELS || s < 0 || s >= SECTORS_PER_PANEL) {
    sendJson(400, "{\"err\":\"range\"}"); return;
  }
  sectors[p][s].on = doc["on"] | false;
  sectors[p][s].r  = doc["r"]  | 0;
  sectors[p][s].g  = doc["g"]  | 0;
  sectors[p][s].b  = doc["b"]  | 0;
  sendSectorToArduino(p, s);
  sendJson(200, "{\"ok\":true}");
}

// POST /api/panel  { panel, on, r, g, b }  - wszystkie 3 sektory panelu
static void handlePanel() {
  if (!checkToken()) return;
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) { sendJson(400, "{\"err\":\"json\"}"); return; }
  int p = doc["panel"] | -1;
  if (p < 0 || p >= NUM_PANELS) { sendJson(400, "{\"err\":\"range\"}"); return; }
  bool on = doc["on"] | false;
  uint8_t r = doc["r"] | 0, g = doc["g"] | 0, b = doc["b"] | 0;
  for (int s = 0; s < SECTORS_PER_PANEL; s++) sectors[p][s] = { r, g, b, on };
  if (on) {
    LINK.print("PANEL:"); LINK.print(p); LINK.print(":ALL:");
    LINK.print(r); LINK.print(','); LINK.print(g); LINK.print(','); LINK.println(b);
  } else {
    LINK.print("OFF:"); LINK.print(p); LINK.println(":ALL");
  }
  sendJson(200, "{\"ok\":true}");
}

// POST /api/offall
static void handleOffAll() {
  if (!checkToken()) return;
  for (int p = 0; p < NUM_PANELS; p++)
    for (int s = 0; s < SECTORS_PER_PANEL; s++)
      sectors[p][s] = { 0, 0, 0, false };
  linkPrintln("OFFALL");
  sendJson(200, "{\"ok\":true}");
}

// POST /api/bright  { v: 0..255 }
static void handleBright() {
  if (!checkToken()) return;
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) { sendJson(400, "{\"err\":\"json\"}"); return; }
  int v = doc["v"] | 128;
  if (v < 0) v = 0; if (v > 255) v = 255;
  brightness = v;
  LINK.print("BRIGHT:"); LINK.println(v);
  sendJson(200, "{\"ok\":true}");
}

static void handleR2Start() { if (!checkToken()) return; linkPrintln("ROUND2:START"); sendJson(200, "{\"ok\":true}"); }
static void handleR2Stop()  { if (!checkToken()) return; linkPrintln("ROUND2:STOP");  sendJson(200, "{\"ok\":true}"); }

// GET /api/health
static void handleHealth() {
  JsonDocument doc;
  doc["ok"] = true;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptimeMs"] = millis();
  String out; serializeJson(doc, out);
  sendJson(200, out);
}

// -------- SETUP / LOOP --------
void setup() {
  Serial.begin(115200);
  LINK.begin(LINK_BAUD, SERIAL_8N1, LINK_RX, LINK_TX);

  for (int p = 0; p < NUM_PANELS; p++)
    for (int s = 0; s < SECTORS_PER_PANEL; s++)
      sectors[p][s] = { 255, 0, 0, false };

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] laczenie");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 30000) {
    delay(300); Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] brak polaczenia - restart za chwile");
    delay(3000); ESP.restart();
  }

  // Zbieraj naglowki potrzebne do auth (WebServer domyslnie nie parsuje ich wszystkich)
  const char* wantedHeaders[] = { "X-Api-Token" };
  server.collectHeaders(wantedHeaders, 1);

  // Router
  server.on("/api/state",         HTTP_GET,     handleState);
  server.on("/api/sector",        HTTP_POST,    handleSector);
  server.on("/api/sector",        HTTP_OPTIONS, handleOptions);
  server.on("/api/panel",         HTTP_POST,    handlePanel);
  server.on("/api/panel",         HTTP_OPTIONS, handleOptions);
  server.on("/api/offall",        HTTP_POST,    handleOffAll);
  server.on("/api/offall",        HTTP_OPTIONS, handleOptions);
  server.on("/api/bright",        HTTP_POST,    handleBright);
  server.on("/api/bright",        HTTP_OPTIONS, handleOptions);
  server.on("/api/round2/start",  HTTP_POST,    handleR2Start);
  server.on("/api/round2/start",  HTTP_OPTIONS, handleOptions);
  server.on("/api/round2/stop",   HTTP_POST,    handleR2Stop);
  server.on("/api/round2/stop",   HTTP_OPTIONS, handleOptions);
  server.on("/api/health",        HTTP_GET,     handleHealth);
  server.onNotFound([]() { sendCors(); server.send(404, "application/json", "{\"err\":\"notfound\"}"); });
  server.begin();
  Serial.println("[HTTP] API na porcie 80");
}

void loop() {
  server.handleClient();
  readLink();
}

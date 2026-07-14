// ================================================================
//  1 z 9  —  ESP32 (zwykly DevKit / WROOM-32)
//  JSON API + WiFi. Bez frontendu - UI hostuje projekt web/.
//  UART do Arduino Uno przez Serial2 (GPIO16 = RX, GPIO17 = TX).
//
//  Polaczenie z Arduino Uno (KONIECZNIE wspolna masa GND!):
//    ESP GPIO17 (TX) -> Uno D0 (RX)   ESP 3.3V -> Uno 5V: zwykle OK bez konwersji
//    ESP GPIO16 (RX) <- Uno D1 (TX)   Uno 5V -> ESP 3.3V: DAJ dzielnik / level shifter!
//    ESP GND        <-> Uno GND
//
//  Uwaga o swietle: to ARDUINO steruje panelami LED (D2..D10) oraz lampkami
//  przyciskow (D11/D12/D13, masa wspolna). ESP samo nie ma zadnych zlacz do
//  swiatla - tylko wysyla komendy (PANEL/OFF/ROUND2...) i odbiera BTN po UART.
//
//  Konfiguracja WiFi (bez rekompilacji): gdy ESP nie polaczy sie w 12 s (albo
//  trzymasz BOOT przy starcie), wystawia siec "1z9-setup". Wejdz na nia z telefonu,
//  otworz http://192.168.4.1, wpisz SSID/haslo/staly IP -> ESP zapisze do NVS,
//  zrestartuje i wejdzie na docelowa siec. W trybie AP gra (/api/*) NIE dziala.
// ================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// -------- KONFIG WiFi (seed domyslny; realne dane trzyma NVS/Preferences) --------
// Puste = swiezy ESP idzie od razu w tryb konfiguracji (AP).
static const char* WIFI_SSID = "";
static const char* WIFI_PASS = "";

// Tryb konfiguracji: gdy STA nie polaczy w WIFI_STA_TIMEOUT_MS (albo trzymasz BOOT
// przy starcie), ESP wystawia wlasna siec AP tylko do wpisania sieci docelowej.
// Gra (API /api/*) NIE dziala w trybie AP.
static const char*    AP_SSID             = "1z9-setup";
static const char*    AP_PASS             = "konfiguracja";   // >= 8 znakow (WPA2)
static const uint32_t WIFI_STA_TIMEOUT_MS = 12000;            // krotki czas na STA
#define BOOT_BTN 0                                             // GPIO0 = przycisk BOOT

// -------- TOKEN do API --------
// Backend Node musi wysylac ten sam token w naglowku X-Api-Token
// (patrz server/.env: ESP_API_TOKEN). Chroni przed dowolnym urzadzeniem w LAN.
static const char* API_TOKEN = "1z9-esp-token";

// -------- LINK do Uno --------
// Zwykly ESP32: uzywamy Serial2 (UART2). GPIO16 = RX, GPIO17 = TX.
// (Serial1 domyslnie siedzi na pinach flash - nie uzywac na WROOM.)
#define LINK        Serial2
#define LINK_BAUD   115200
#define LINK_RX     16
#define LINK_TX     17

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

Preferences prefs;      // trwale dane WiFi w NVS
bool apMode = false;    // true = tryb konfiguracji (AP), gra wylaczona

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

// -------- SERWER: tryb gry (STA) --------
static void startGameServer() {
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

// -------- SERWER: tryb konfiguracji (AP) --------
// Strona z formularzem; pola prefill z NVS (albo wartosci domyslne).
static void handleConfigRoot() {
  String ssid = prefs.getString("ssid", "");
  String ip   = prefs.getString("ip",   "192.168.1.50");
  String gw   = prefs.getString("gw",   "192.168.1.1");
  String html =
    "<!doctype html><html lang=\"pl\"><head><meta charset=\"utf-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>1 z 9 - konfiguracja WiFi</title><style>"
    "body{font-family:sans-serif;background:#0d0e12;color:#eaeaf0;margin:0;padding:24px}"
    "h1{font-size:20px}form{max-width:420px}label{display:block;margin:14px 0 4px;color:#8b8ea0}"
    "input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;"
    "background:#1a1b23;color:#eaeaf0;font-size:16px}"
    "button{margin-top:22px;width:100%;padding:12px;border:0;border-radius:8px;"
    "background:#2d6a4f;color:#fff;font-size:16px;font-weight:bold}small{color:#8b8ea0}"
    "</style></head><body><h1>1 z 9 - konfiguracja WiFi</h1>"
    "<form method=\"POST\" action=\"/wifi\">"
    "<label>Siec WiFi (SSID)</label><input name=\"ssid\" value=\"" + ssid + "\" required>"
    "<label>Haslo WiFi</label><input name=\"pass\" type=\"password\">"
    "<label>Staly IP dla ESP</label><input name=\"ip\" value=\"" + ip + "\" required>"
    "<label>Brama / router</label><input name=\"gw\" value=\"" + gw + "\" required>"
    "<button type=\"submit\">Zapisz i uruchom ponownie</button>"
    "<p><small>Po zapisie ESP zrestartuje sie i polaczy z podana siecia pod tym IP. "
    "Ten sam IP musi byc w server/.env jako ESP_URL.</small></p>"
    "</form></body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}

static void handleWifiSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  String ip   = server.arg("ip");
  String gw   = server.arg("gw");
  if (ssid.length() == 0 || ip.length() == 0 || gw.length() == 0) {
    server.send(400, "text/html; charset=utf-8",
      "<meta charset=\"utf-8\"><p>Brak SSID / IP / bramy. <a href=\"/\">Wroc</a></p>");
    return;
  }
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("ip",   ip);
  prefs.putString("gw",   gw);
  String html =
    "<!doctype html><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;"
    "background:#0d0e12;color:#eaeaf0;padding:24px\"><h1>Zapisano</h1>"
    "<p>ESP uruchamia sie ponownie i laczy z siecia <b>" + ssid + "</b>.</p>"
    "<p>Za chwile bedzie dostepny pod <b>http://" + ip + "</b></p></body>";
  server.send(200, "text/html; charset=utf-8", html);
  delay(700);
  ESP.restart();
}

static void startConfigServer() {
  server.on("/",     HTTP_GET,  handleConfigRoot);
  server.on("/wifi", HTTP_POST, handleWifiSave);
  // Kazda inna sciezka -> formularz (mini captive portal).
  server.onNotFound([]() { server.sendHeader("Location", "/"); server.send(302, "text/plain", ""); });
  server.begin();
  Serial.println("[HTTP] tryb konfiguracji (AP) na porcie 80");
}

// -------- SETUP / LOOP --------
void setup() {
  Serial.begin(115200);
  LINK.begin(LINK_BAUD, SERIAL_8N1, LINK_RX, LINK_TX);
  pinMode(BOOT_BTN, INPUT_PULLUP);

  for (int p = 0; p < NUM_PANELS; p++)
    for (int s = 0; s < SECTORS_PER_PANEL; s++)
      sectors[p][s] = { 255, 0, 0, false };

  prefs.begin("wifi", false);                     // NVS read-write
  String ssid = prefs.getString("ssid", WIFI_SSID);
  String pass = prefs.getString("pass", WIFI_PASS);
  String ipS  = prefs.getString("ip",   "192.168.1.50");
  String gwS  = prefs.getString("gw",   "192.168.1.1");

  bool forceAp = (digitalRead(BOOT_BTN) == LOW);  // trzymany BOOT = wymus konfiguracje

  bool connected = false;
  if (!forceAp && ssid.length() > 0) {
    IPAddress ip, gw, mask(255, 255, 255, 0);
    ip.fromString(ipS);
    gw.fromString(gwS);
    WiFi.mode(WIFI_STA);
    WiFi.config(ip, gw, mask, gw);                // DNS = brama
    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.print("[WiFi] laczenie z '"); Serial.print(ssid); Serial.print("' ");
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_STA_TIMEOUT_MS) {
      delay(250); Serial.print('.');
    }
    Serial.println();
    connected = (WiFi.status() == WL_CONNECTED);
  }

  if (connected) {
    apMode = false;
    Serial.print("[WiFi] IP: "); Serial.println(WiFi.localIP());
    startGameServer();
  } else {
    apMode = true;
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASS);
    Serial.print("[AP] siec konfiguracyjna '"); Serial.print(AP_SSID);
    Serial.print("', IP: "); Serial.println(WiFi.softAPIP());
    startConfigServer();
  }
}

void loop() {
  server.handleClient();
  readLink();
}

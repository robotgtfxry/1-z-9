// ================================================================
//  1 z 9  —  ARDUINO UNO
//  9 tasm WS2812B (po 3 sektory) + 3 przyciski do rundy 2.
//  Komunikacja z ESP32 przez hardware Serial (D0/D1) - 115200 8N1.
//  UWAGA: uzywamy tego samego Serial co USB. Podczas flashowania
//  odlacz linie RX/TX od ESP32 (albo ich level shiftera).
//
//  Pinout:
//    LED DATA:  D2..D10  (panele 1..9)
//    Przyciski: A0, A1, A2 (runda 2 - 3 finalistow, styki)
//    Lampki:    D11, D12, D13 (podswietlenie przyciskow; masa wspolna /
//               katoda wspolna, HIGH = swieci). Pierwszy nacisniety w
//               rundzie 2 swieci 5 s, potem gasnie.
//    Serial:    D0 (RX) <- ESP32 TX (przez level shifter)
//               D1 (TX) -> ESP32 RX (przez level shifter)
//
//  Protokol (linie zakonczone '\n'):
//    ESP -> ARD:
//      PANEL:<id>:<sector|ALL>:<R>,<G>,<B>   ustaw kolor sektora
//      OFF:<id>:<sector|ALL>                 zgas
//      OFFALL                                zgas wszystko
//      BRIGHT:<0-255>                        globalna jasnosc
//      ROUND2:START / ROUND2:STOP            wl./wyl. rundy 2
//      PING                                  -> PONG
//    ARD -> ESP:
//      READY / PONG
//      ROUND2:STARTED / ROUND2:STOPPED
//      BTN:<id>:<ms_od_startu>               id = 0..2
// ================================================================

#include <Arduino.h>
#include <FastLED.h>

// -------- KONFIGURACJA --------
#define NUM_PANELS         9
#define SECTORS_PER_PANEL  3
#define LEDS_PER_SECTOR    10                             // <- dopasuj do tasmy
#define LEDS_PER_PANEL     (SECTORS_PER_PANEL * LEDS_PER_SECTOR)

#define NUM_BUTTONS        3
const uint8_t BTN_PINS[NUM_BUTTONS] = { A0, A1, A2 };

// Lampki przyciskow — masa wspolna (katoda), stan HIGH na pinie zapala lampke.
const uint8_t LAMP_PINS[NUM_BUTTONS] = { 11, 12, 13 };
const unsigned long LAMP_HOLD_MS = 5000;   // pierwszy nacisniety swieci 5 s

#define LINK       Serial
#define LINK_BAUD  115200

// -------- STAN --------
CRGB leds[NUM_PANELS][LEDS_PER_PANEL];
CRGB sectorColor[NUM_PANELS][SECTORS_PER_PANEL];
uint8_t brightness = 128;

bool round2Active = false;
unsigned long round2StartMs = 0;

bool btnLast[NUM_BUTTONS] = { false };
bool btnReported[NUM_BUTTONS] = { false };
unsigned long btnDebounceMs[NUM_BUTTONS] = { 0 };
const unsigned long DEBOUNCE = 25;

int firstBtn = -1;                 // kto byl pierwszy w tej rundzie (-1 = nikt)
bool lampActive = false;           // czy lampka pierwszego aktualnie swieci
unsigned long lampOnMs = 0;        // moment zapalenia lampki (millis)

void lampsAllOff();                // uzywane w handleCommand (definicja nizej)

String rxBuf;

// -------- LED --------
void refreshLeds() {
  for (int p = 0; p < NUM_PANELS; p++) {
    for (int s = 0; s < SECTORS_PER_PANEL; s++) {
      for (int l = 0; l < LEDS_PER_SECTOR; l++) {
        leds[p][s * LEDS_PER_SECTOR + l] = sectorColor[p][s];
      }
    }
  }
  FastLED.setBrightness(brightness);
  FastLED.show();
}

void setSector(int panel, int sector, CRGB c) {
  if (panel < 0 || panel >= NUM_PANELS) return;
  if (sector < 0 || sector >= SECTORS_PER_PANEL) return;
  sectorColor[panel][sector] = c;
}

// -------- PARSER KOMEND --------
void handlePanelCmd(const String& body) {
  int a = body.indexOf(':');
  int b = body.indexOf(':', a + 1);
  if (a < 0 || b < 0) return;
  int panel = body.substring(0, a).toInt();
  String sec = body.substring(a + 1, b);
  String rgb = body.substring(b + 1);
  int c1 = rgb.indexOf(',');
  int c2 = rgb.indexOf(',', c1 + 1);
  if (c1 < 0 || c2 < 0) return;
  int r  = rgb.substring(0, c1).toInt();
  int g  = rgb.substring(c1 + 1, c2).toInt();
  int bl = rgb.substring(c2 + 1).toInt();
  CRGB color(r, g, bl);
  if (sec == "ALL") {
    for (int s = 0; s < SECTORS_PER_PANEL; s++) setSector(panel, s, color);
  } else {
    setSector(panel, sec.toInt(), color);
  }
  refreshLeds();
}

void handleOffCmd(const String& body) {
  int a = body.indexOf(':');
  if (a < 0) return;
  int panel = body.substring(0, a).toInt();
  String sec = body.substring(a + 1);
  if (sec == "ALL") {
    for (int s = 0; s < SECTORS_PER_PANEL; s++) setSector(panel, s, CRGB::Black);
  } else {
    setSector(panel, sec.toInt(), CRGB::Black);
  }
  refreshLeds();
}

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.startsWith("PANEL:"))          handlePanelCmd(cmd.substring(6));
  else if (cmd.startsWith("OFF:"))       handleOffCmd(cmd.substring(4));
  else if (cmd == "OFFALL") {
    for (int p = 0; p < NUM_PANELS; p++)
      for (int s = 0; s < SECTORS_PER_PANEL; s++)
        setSector(p, s, CRGB::Black);
    refreshLeds();
  }
  else if (cmd.startsWith("BRIGHT:")) {
    brightness = (uint8_t) constrain(cmd.substring(7).toInt(), 0, 255);
    refreshLeds();
  }
  else if (cmd == "ROUND2:START") {
    round2Active = true;
    round2StartMs = millis();
    for (int i = 0; i < NUM_BUTTONS; i++) btnReported[i] = false;
    firstBtn = -1;
    lampsAllOff();
    LINK.println(F("ROUND2:STARTED"));
  }
  else if (cmd == "ROUND2:STOP") {
    round2Active = false;
    lampsAllOff();
    LINK.println(F("ROUND2:STOPPED"));
  }
  else if (cmd == "PING") LINK.println(F("PONG"));
}

void readLink() {
  while (LINK.available()) {
    char c = LINK.read();
    if (c == '\n' || c == '\r') {          // akceptuj LF, CR i CRLF
      if (rxBuf.length()) { handleCommand(rxBuf); rxBuf = ""; }
    } else if (rxBuf.length() < 96) {
      rxBuf += c;
    }
  }
}

// -------- LAMPKI PRZYCISKOW --------
void lampsAllOff() {
  for (int i = 0; i < NUM_BUTTONS; i++) digitalWrite(LAMP_PINS[i], LOW);
  lampActive = false;
}

// Gasi lampke pierwszego po uplywie LAMP_HOLD_MS i re-armuje na kolejne
// nacisniecie (bez resetu Arduino). Przycisk trzymany wcisniety nie odpali
// od razu ponownie — trzeba go puscic i nacisnac jeszcze raz.
void updateLamp() {
  if (lampActive && (millis() - lampOnMs) >= LAMP_HOLD_MS) {
    digitalWrite(LAMP_PINS[firstBtn], LOW);
    lampActive = false;
    firstBtn = -1;
    for (int i = 0; i < NUM_BUTTONS; i++) btnReported[i] = false;
  }
}

// -------- PRZYCISKI --------
void pollButtons() {
  if (!round2Active) return;
  unsigned long now = millis();
  for (int i = 0; i < NUM_BUTTONS; i++) {
    bool pressed = digitalRead(BTN_PINS[i]) == LOW;
    if (pressed != btnLast[i] && (now - btnDebounceMs[i]) > DEBOUNCE) {
      btnDebounceMs[i] = now;
      btnLast[i] = pressed;
      if (pressed && !btnReported[i]) {
        btnReported[i] = true;
        unsigned long dt = now - round2StartMs;
        LINK.print(F("BTN:"));
        LINK.print(i);
        LINK.print(':');
        LINK.println(dt);

        if (firstBtn < 0) {              // ten byl pierwszy w rundzie
          firstBtn = i;
          digitalWrite(LAMP_PINS[i], HIGH);
          lampActive = true;
          lampOnMs = now;
        }
      }
    }
  }
}

// -------- SETUP / LOOP --------
void setup() {
  LINK.begin(LINK_BAUD);

  // FastLED - kazdy panel na osobnym pinie (piny musza byc constexpr).
  FastLED.addLeds<WS2812B, 2,  GRB>(leds[0], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 3,  GRB>(leds[1], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 4,  GRB>(leds[2], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 5,  GRB>(leds[3], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 6,  GRB>(leds[4], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 7,  GRB>(leds[5], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 8,  GRB>(leds[6], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 9,  GRB>(leds[7], LEDS_PER_PANEL);
  FastLED.addLeds<WS2812B, 10, GRB>(leds[8], LEDS_PER_PANEL);

  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(BTN_PINS[i], INPUT_PULLUP);
    pinMode(LAMP_PINS[i], OUTPUT);
    digitalWrite(LAMP_PINS[i], LOW);
  }

  // Krotki test lampek przy starcie — mrugniecie 11 -> 12 -> 13.
  // Potwierdza okablowanie lampek bez ESP i bez rundy 2.
  for (int i = 0; i < NUM_BUTTONS; i++) {
    digitalWrite(LAMP_PINS[i], HIGH);
    delay(200);
    digitalWrite(LAMP_PINS[i], LOW);
  }

  // Przyciski aktywne od razu po starcie (bez czekania na ROUND2:START z ESP).
  // Przed runda 2 przyciski sa fizycznie schowane, wiec nie ma ryzyka.
  // ROUND2:START z ESP i tak zresetuje "pierwszego" na start prawdziwej rundy.
  round2Active = true;
  round2StartMs = millis();
  for (int p = 0; p < NUM_PANELS; p++)
    for (int s = 0; s < SECTORS_PER_PANEL; s++)
      sectorColor[p][s] = CRGB::Black;

  refreshLeds();
  LINK.println(F("READY"));
}

void loop() {
  readLink();
  pollButtons();
  updateLamp();
}

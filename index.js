const BACKEND_ORIGIN = "http://localhost:3000";
if (window.location.origin !== BACKEND_ORIGIN) {
  window.location.replace(`${BACKEND_ORIGIN}/index.html`);
}

// initialize the map
const map = L.map("map").setView([51.505, -0.09], 13);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// marker tracking for frequency/highlight
const locationCounts = new Map();
const locationMarkers = new Map();
const locationIncidentType = new Map();
const locationLabels = new Map();

const topAreaLayer = L.layerGroup().addTo(map);

map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
  const incidentType = incidentTypeSelect ? incidentTypeSelect.value : "none";
  const customText = incidentCustomInput
    ? incidentCustomInput.value.trim()
    : "";
  const address = await reverseGeocode(lat, lng);
  const label = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  addOrUpdatePinnedLocation(lat, lng, label, incidentType, customText);
});

const incidentTypeLabels = {
  flood: "Flood",
  fire: "Fire",
  accident: "Accident",
  missing_person: "Missing Person",
  fallen_building: "Fallen Building",
  natural_disaster: "Natural Disaster",
  crime: "Crime",
  medical_emergency: "Medical Emergency",
  none: "None",
  custom: "Custom",
};

const incidentColors = {
  flood: "#2196f3",
  fire: "#ff5722",
  accident: "#e91e63",
  missing_person: "#9c27b0",
  fallen_building: "#607d8b",
  natural_disaster: "#d32f2f",
  crime: "#000000",
  medical_emergency: "#4caf50",
  none: "#007bff",
  custom: "#795548",
};

const incidentSymbols = {
  flood: "🌊",
  fire: "🔥",
  accident: "🚑",
  missing_person: "🧍",
  fallen_building: "🏚️",
  natural_disaster: "🌪️",
  crime: "🚔",
  medical_emergency: "⚕️",
  none: "📍",
  custom: "⭐",
};

function createIncidentIcon(type = "none", highlighted = false) {
  const color = incidentColors[type] || incidentColors.none;
  const symbol = incidentSymbols[type] || incidentSymbols.none;
  const dim = highlighted ? 30 : 24;
  const border = highlighted ? "3px solid #fff" : "2px solid #fff";
  const glow = highlighted
    ? "0 0 14px rgba(255,255,255,.7)"
    : "0 0 8px rgba(0,0,0,.3)";

  return L.divIcon({
    className: "incident-icon",
    html: `
      <div style="width:${dim}px;height:${dim}px;border-radius:50%;background:${color};${border};box-shadow:${glow};display:flex;align-items:center;justify-content:center;font-size:${dim / 1.5}px;text-shadow:0 0 3px rgba(0,0,0,0.35);">
        ${symbol}
      </div>
    `,
    iconSize: [dim, dim],
    iconAnchor: [dim / 2, dim / 2],
    popupAnchor: [0, -dim / 2],
  });
}

function getIncidentLabel(typeValue) {
  if (typeValue === "custom") {
    return "Custom";
  }
  if (!typeValue || typeValue === "none") {
    return "None";
  }
  return incidentTypeLabels[typeValue] || typeValue;
}

const searchForm = document.getElementById("search-form");
const logoutButton = document.getElementById("logout-btn");
const sessionUsername = document.getElementById("session-username");
const searchInput = document.getElementById("search-input");
const incidentTypeSelect = document.getElementById("incident-type");
const incidentCustomInput = document.getElementById("incident-custom");
const personNameInput = document.getElementById("person-name");
const savePersonButton = document.getElementById("save-person");
const personStatus = document.getElementById("person-status");
const toggleGraphsButton = document.getElementById("toggle-graphs");
const graphsPanel = document.getElementById("graphs-panel");
const messagePanel = document.getElementById("message-panel");
const toggleMessageButton = document.getElementById("toggle-message");
const messageBody = document.getElementById("message-body");
const messageInput = document.getElementById("direction-message");
const sendMessageButton = document.getElementById("send-message");
const messageStatus = document.getElementById("message-status");
const aiChatbotLog = document.getElementById("ai-chatbot-log");
const aiChatbotInput = document.getElementById("ai-chatbot-input");
const aiChatbotSend = document.getElementById("ai-chatbot-send");
const aiAutofillButton = document.getElementById("ai-autofill-btn");
const showEmergencyButton = document.getElementById("show-emergency-btn");
const panicButton = document.getElementById("panic-btn");
const closeEmergencyButton = document.getElementById("close-emergency-btn");
const emergencyBackdrop = document.getElementById("emergency-backdrop");
const emergencyPanel = document.getElementById("emergency-panel");

const smsSideToggle = document.getElementById("sms-side-toggle");
const smsSideBar = document.getElementById("sms-side-bar");
const smsSideClose = document.getElementById("sms-side-close");
const smsSidePhone = document.getElementById("sms-side-phone");
const smsSideSend = document.getElementById("sms-side-send");
const smsSideStatus = document.getElementById("sms-side-status");
const smsSideLocation = document.getElementById("sms-side-location");
const smsSideRefresh = document.getElementById("sms-side-refresh");

let searchMarker;
let latestPinnedData = null;
let panicInProgress = false;

incidentCustomInput.style.display = "none";

incidentTypeSelect.addEventListener("change", () => {
  if (incidentTypeSelect.value === "custom") {
    incidentCustomInput.style.display = "inline-block";
    incidentCustomInput.focus();
  } else {
    incidentCustomInput.style.display = "none";
  }
});

function locationKey(lat, lon) {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function setPersonName(name) {
  const normalized = name.trim();
  if (!normalized) {
    personStatus.textContent = "Please enter a valid name.";
    personStatus.style.color = "#d4414e";
    return;
  }

  localStorage.setItem("helpedPerson", normalized);
  personNameInput.value = normalized;
  personStatus.textContent = `Saved: ${normalized}`;
  personStatus.style.color = "#28a745";
}

function loadPersonName() {
  const stored = localStorage.getItem("helpedPerson");
  if (stored) {
    personNameInput.value = stored;
    personStatus.textContent = `Currently helping: ${stored}`;
    personStatus.style.color = "#007bff";
  } else {
    personStatus.textContent = "No saved person yet.";
    personStatus.style.color = "#666";
  }
}

const BACKEND_SMS_MOCK = false; // fallback mock mode if backend is unavailable
const API_ROUTES = {
  authMe: "/api/auth/me",
  logout: "/api/logout",
  dispatch: "/api/dispatch",
  smsRequest: "/api/sms-request",
  aiChat: "/api/ai-chat",
};

async function loadSessionUser() {
  if (!sessionUsername) return;

  try {
    const response = await fetch(API_ROUTES.authMe);
    if (!response.ok) {
      throw new Error(`Auth API returned ${response.status}`);
    }
    const result = await response.json();
    const username = result?.user?.username || "User";
    sessionUsername.textContent = `Signed in: ${username}`;
  } catch (err) {
    sessionUsername.textContent = "Signed in";
    console.warn("Could not load session user", err);
  }
}

async function logoutUser() {
  if (logoutButton) {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";
  }

  try {
    await fetch(API_ROUTES.logout, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn("Logout request failed", err);
  } finally {
    window.location.href = "/login.html";
  }
}

if (logoutButton) {
  logoutButton.addEventListener("click", logoutUser);
}

loadSessionUser();

const emergencyButton = document.getElementById("call-emergency");
const dispatch911Button = document.getElementById("dispatch-911-btn");
const customEmergencyNumberInput = document.getElementById(
  "custom-emergency-number",
);
const emergencyStatus = document.getElementById("emergency-status");
const routeButton = document.getElementById("route-btn");
const routeInfo = document.getElementById("route-info");
const fromCoordsInput = document.getElementById("from-coords");
const toCoordsInput = document.getElementById("to-coords");
const smsPhoneInput = document.getElementById("sms-phone");
const smsRequestButton = document.getElementById("sms-request-btn");
const routeLayer = L.layerGroup().addTo(map);

function setSmsRequestStatus(text, color) {
  emergencyStatus.textContent = text;
  emergencyStatus.style.color = color;
  if (smsSideStatus) {
    smsSideStatus.textContent = text;
    smsSideStatus.style.color = color;
  }
}

function appendChatbotMessage(text, fromUser = false) {
  if (!aiChatbotLog) return;
  const msg = document.createElement("div");
  msg.className = fromUser ? "ai-user-msg" : "ai-bot-msg";
  msg.textContent = text;
  aiChatbotLog.appendChild(msg);
  aiChatbotLog.scrollTop = aiChatbotLog.scrollHeight;
}

function getTopVolatileAreas(limit = 3) {
  return Array.from(locationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([coord, count]) => {
      const label = locationLabels.get(coord) || coord;
      const type = locationIncidentType.get(coord) || "none";
      return { coord, count, label, type };
    });
}

function getVolatileAreasForAi(limit = 5) {
  return getTopVolatileAreas(limit).map((entry) => ({
    coord: entry.coord,
    count: entry.count,
    label: entry.label,
    type: entry.type,
  }));
}

function getLocalAssistantReply(normalizedPrompt) {
  if (
    normalizedPrompt.includes("volatile") ||
    normalizedPrompt.includes("hotspot") ||
    normalizedPrompt.includes("risk")
  ) {
    const topAreas = getTopVolatileAreas(3);
    if (!topAreas.length) {
      return "No volatile area data yet. Pin incidents to build records.";
    }

    return (
      "Recorded volatile areas: " +
      topAreas
        .map(
          (entry, idx) =>
            `${idx + 1}. ${entry.label} (${entry.count} reports, ${getIncidentLabel(entry.type)})`,
        )
        .join(" | ")
    );
  }

  return "Try: 'volatile areas' to review records, or 'autofill' to fill incident fields.";
}

async function requestAiAssistantReply(prompt) {
  const response = await fetch(API_ROUTES.aiChat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      volatileAreas: getVolatileAreasForAi(5),
    }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || `AI request failed (${response.status})`);
  }

  return result.data?.reply || "I could not generate a response right now.";
}

function autofillFromTopVolatileArea() {
  const topArea = getTopVolatileAreas(1)[0];
  if (!topArea) {
    appendChatbotMessage("No volatile area recorded yet. Pin incidents first.");
    return;
  }

  searchInput.value = topArea.label;
  incidentTypeSelect.value = topArea.type || "none";
  incidentTypeSelect.dispatchEvent(new Event("change"));
  if (topArea.type === "custom") {
    incidentCustomInput.value = "High-risk custom incident";
  }

  appendChatbotMessage(
    `Autofilled from top volatile area: ${topArea.label} (${topArea.count} reports).`,
  );
}

function handleChatbotPrompt() {
  if (!aiChatbotInput) return;
  const prompt = aiChatbotInput.value.trim();
  if (!prompt) return;

  appendChatbotMessage(prompt, true);
  aiChatbotInput.value = "";

  const normalized = prompt.toLowerCase();
  if (
    normalized.includes("autofill") ||
    normalized.includes("fill") ||
    normalized.includes("top area")
  ) {
    autofillFromTopVolatileArea();
    return;
  }

  appendChatbotMessage("Thinking...");

  requestAiAssistantReply(prompt)
    .then((reply) => {
      const last = aiChatbotLog?.lastElementChild;
      if (last && last.textContent === "Thinking...") {
        last.remove();
      }
      appendChatbotMessage(reply);
    })
    .catch((err) => {
      const last = aiChatbotLog?.lastElementChild;
      if (last && last.textContent === "Thinking...") {
        last.remove();
      }
      console.warn("AI assistant unavailable, using local fallback", err);
      appendChatbotMessage(getLocalAssistantReply(normalized));
    });
}

const emergencyNumbers = {
  flood: "112",
  fire: "112",
  accident: "112",
  missing_person: "112",
  fallen_building: "112",
  natural_disaster: "112",
  crime: "112",
  medical_emergency: "112",
  none: "112",
  custom: "112",
};

function getEmergencyServiceDetails(typeValue) {
  const label = getIncidentLabel(typeValue);
  const number = emergencyNumbers[typeValue] || "112";
  return { label, number };
}

function getPreferredEmergencyNumber(typeValue) {
  const typed = customEmergencyNumberInput
    ? customEmergencyNumberInput.value.trim()
    : "";
  const cleaned = typed.replace(/[^\d+]/g, "");
  if (cleaned) {
    return cleaned;
  }
  return emergencyNumbers[typeValue] || "112";
}

function contactEmergency() {
  const typeValue = incidentTypeSelect.value || "none";
  if (!typeValue || typeValue === "none") {
    emergencyStatus.textContent =
      "Choose an incident type before contacting emergency services.";
    emergencyStatus.style.color = "#d4414e";
    return;
  }

  const { label } = getEmergencyServiceDetails(typeValue);
  const number = getPreferredEmergencyNumber(typeValue);
  const center = map.getCenter();
  const message = `Requesting help for ${label} at ${center.lat.toFixed(5)},${center.lng.toFixed(5)}. Calling ${number}.`;

  emergencyStatus.textContent = message;
  emergencyStatus.style.color = "#28a745";

  try {
    const link = document.createElement("a");
    link.href = `tel:${number}`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.warn("Unable to open dialer", err);
  }

  const history = JSON.parse(localStorage.getItem("emergencyHistory") || "[]");
  history.push({
    time: new Date().toISOString(),
    incident: label,
    number,
    location: `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`,
  });
  localStorage.setItem("emergencyHistory", JSON.stringify(history));
}

function buildDispatchPayload() {
  const typeValue = incidentTypeSelect.value || "none";
  const center = map.getCenter();
  const number = getPreferredEmergencyNumber(typeValue);
  const coords = latestPinnedData
    ? `${latestPinnedData.lat.toFixed(5)},${latestPinnedData.lon.toFixed(5)}`
    : `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
  const locationLabel = latestPinnedData
    ? latestPinnedData.label
    : searchInput.value.trim() || "Current map center";
  const incident =
    typeValue === "custom"
      ? incidentCustomInput.value.trim() || "Custom"
      : getIncidentLabel(typeValue);

  return {
    id: `dispatch-${Date.now()}`,
    timestamp: new Date().toISOString(),
    destination: number,
    incident,
    incidentType: typeValue,
    person: personNameInput.value.trim() || "Unknown",
    locationLabel,
    coords,
    note: messageInput.value.trim() || "No extra note",
  };
}

async function dispatchSelectedDataTo911() {
  const typeValue = incidentTypeSelect.value || "none";
  if (typeValue === "none" && !latestPinnedData && !searchInput.value.trim()) {
    emergencyStatus.textContent =
      "Select an incident type or pin a location before dispatching to 911.";
    emergencyStatus.style.color = "#d4414e";
    return;
  }

  const payload = buildDispatchPayload();
  emergencyStatus.textContent = `Dispatching selected data to ${payload.destination}...`;
  emergencyStatus.style.color = "#444";

  try {
    const response = await fetch(API_ROUTES.dispatch, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Dispatch API returned ${response.status}`);
    }

    const result = await response.json();
    if (!result || !result.success) {
      throw new Error(result?.error || "Unknown dispatch error");
    }

    const history = JSON.parse(localStorage.getItem("dispatchHistory") || "[]");
    history.push({ ...payload, backendId: result.data?.id || null });
    localStorage.setItem("dispatchHistory", JSON.stringify(history));

    emergencyStatus.textContent = `${payload.destination} dispatch sent: ${payload.incident} at ${payload.locationLabel} (${payload.coords}).`;
    emergencyStatus.style.color = "#28a745";
    console.info("Dispatch payload sent:", payload);
  } catch (err) {
    const history = JSON.parse(localStorage.getItem("dispatchHistory") || "[]");
    history.push({ ...payload, backendId: null, backendStatus: "failed" });
    localStorage.setItem("dispatchHistory", JSON.stringify(history));

    emergencyStatus.textContent = `Dispatch API failed: ${err.message}. Saved locally only.`;
    emergencyStatus.style.color = "#d4414e";
    console.warn(err);
  }
}

async function activatePanicAlert() {
  if (panicInProgress) {
    return;
  }
  panicInProgress = true;
  if (panicButton) {
    panicButton.disabled = true;
  }

  emergencyPanel.classList.add("open");
  emergencyBackdrop.classList.add("show");

  // Use a sensible emergency type by default for one-tap panic mode.
  if (!incidentTypeSelect.value || incidentTypeSelect.value === "none") {
    incidentTypeSelect.value = "medical_emergency";
    incidentTypeSelect.dispatchEvent(new Event("change"));
  }

  setSmsRequestStatus(
    "PANIC activated. Capturing location and alerting services...",
    "#d32f2f",
  );

  try {
    let panicLat = map.getCenter().lat;
    let panicLon = map.getCenter().lng;

    if (navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 10000,
          });
        });
        panicLat = position.coords.latitude;
        panicLon = position.coords.longitude;
      } catch (geoErr) {
        console.warn("Panic geolocation unavailable, using map center", geoErr);
      }
    }

    // Use coordinates immediately for fail-safe speed.
    const panicLabel = `${panicLat.toFixed(5)}, ${panicLon.toFixed(5)}`;
    map.setView([panicLat, panicLon], 16);
    addOrUpdatePinnedLocation(
      panicLat,
      panicLon,
      panicLabel,
      incidentTypeSelect.value || "medical_emergency",
      "PANIC",
    );

    emergencyStatus.textContent =
      "PANIC location locked. Sending emergency call and dispatch now...";
    emergencyStatus.style.color = "#d32f2f";

    contactEmergency();
    await dispatchSelectedDataTo911();

    // Improve label after fail-safe actions are sent.
    reverseGeocode(panicLat, panicLon)
      .then((address) => {
        if (!address) return;
        locationLabels.set(locationKey(panicLat, panicLon), address);
        latestPinnedData = {
          lat: panicLat,
          lon: panicLon,
          label: address,
          incidentType: incidentTypeSelect.value || "medical_emergency",
        };
      })
      .catch((err) => {
        console.warn("Panic reverse geocode failed", err);
      });
  } finally {
    panicInProgress = false;
    if (panicButton) {
      panicButton.disabled = false;
    }
  }
}

savePersonButton.addEventListener("click", () => {
  setPersonName(personNameInput.value);
});

emergencyButton.addEventListener("click", contactEmergency);
if (dispatch911Button) {
  dispatch911Button.addEventListener("click", dispatchSelectedDataTo911);
}
if (panicButton) {
  panicButton.addEventListener("click", activatePanicAlert);
}
if (aiAutofillButton) {
  aiAutofillButton.addEventListener("click", autofillFromTopVolatileArea);
}
if (aiChatbotSend) {
  aiChatbotSend.addEventListener("click", handleChatbotPrompt);
}
if (aiChatbotInput) {
  aiChatbotInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleChatbotPrompt();
    }
  });
}
routeButton.addEventListener("click", routeUserChoice);
smsRequestButton.addEventListener("click", () => {
  requestLocationViaSMS(smsPhoneInput.value);
});
async function requestLocationViaSMS(phone, location = null) {
  if (!phone || !phone.trim()) {
    setSmsRequestStatus(
      "Enter phone number to request location via SMS.",
      "#d4414e",
    );
    return;
  }

  const loc =
    location ||
    (map && map.getCenter
      ? { lat: map.getCenter().lat, lon: map.getCenter().lng }
      : null);
  const locText = loc
    ? `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`
    : "unknown";

  setSmsRequestStatus(`Sending SMS request for location ${locText}...`, "#444");

  // NOTE: Real SMS requires a backend API and SMS provider.
  // E.g. POST /api/sms-request with Twilio/Nexmo credentials.
  // The app can then store a code and wait for the user reply to provide location.

  try {
    const response = await fetch(API_ROUTES.smsRequest, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim(), location: loc }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Session expired. Please log in again.");
      }
      throw new Error(`SMS API returned ${response.status}`);
    }

    const result = await response.json();
    if (result && result.success) {
      setSmsRequestStatus(
        `SMS sent to ${phone}. Waiting for location response.`,
        "#28a745",
      );
    } else {
      throw new Error(result.error || "Unknown error");
    }
  } catch (err) {
    if (BACKEND_SMS_MOCK) {
      setSmsRequestStatus(
        `Backend unavailable. Mock SMS sent to ${phone} for location ${locText}.`,
        "#28a745",
      );
      return;
    }
    setSmsRequestStatus(`SMS request failed: ${err.message}.`, "#d4414e");
    if (
      String(err.message || "")
        .toLowerCase()
        .includes("log in")
    ) {
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 600);
    }
    console.warn(err);
  }
}

function getNearestProvider() {
  // We use the most-pin-count location as the nearest provider proxy for now.
  let nearest = null;
  let most = 0;
  for (const [coord, cnt] of locationCounts.entries()) {
    if (cnt > most) {
      most = cnt;
      nearest = coord;
    }
  }
  return nearest || "Unknown location";
}
function unpinLocation(key) {
  if (!locationCounts.has(key)) {
    return;
  }

  const marker = locationMarkers.get(key);
  if (marker) {
    map.removeLayer(marker);
    locationMarkers.delete(key);
  }

  locationCounts.delete(key);
  locationIncidentType.delete(key);
  locationLabels.delete(key);

  updateTopPinned();
  routeInfo.textContent = `Unpinned ${key}.`;
  routeInfo.style.color = "#555";
}
function getTopHotspotCoords() {
  if (!locationCounts.size) return null;
  let top = null;
  let most = -1;
  for (const [coord, cnt] of locationCounts.entries()) {
    if (cnt > most) {
      most = cnt;
      top = coord;
    }
  }
  if (!top) return null;
  const parts = top.split(",").map((n) => parseFloat(n));
  if (
    parts.length !== 2 ||
    !Number.isFinite(parts[0]) ||
    !Number.isFinite(parts[1])
  )
    return null;
  return { lat: parts[0], lon: parts[1] };
}

function parseCoords(text) {
  if (!text || !text.trim()) return null;
  const parts = text.split(",").map((t) => parseFloat(t.trim()));
  if (
    parts.length !== 2 ||
    !Number.isFinite(parts[0]) ||
    !Number.isFinite(parts[1])
  ) {
    return null;
  }
  return { lat: parts[0], lon: parts[1] };
}

async function routeFromTo(fromLat, fromLon, toLat, toLon) {
  routeInfo.textContent = "Routing in progress...";
  routeInfo.style.color = "#444";

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Routing status ${response.status}`);
    }
    const data = await response.json();
    if (data.code !== "Ok" || !data.routes.length) {
      throw new Error(`Router error: ${data.message || "no route"}`);
    }

    const route = data.routes[0];
    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);

    routeLayer.clearLayers();
    const longRoute = L.polyline(coords, {
      color: "#007bff",
      weight: 5,
      opacity: 0.8,
    }).addTo(routeLayer);
    map.fitBounds(longRoute.getBounds().pad(0.2));

    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);

    routeInfo.textContent = `Route: ${distanceKm} km, ${durationMin} min from ${fromLat.toFixed(5)},${fromLon.toFixed(5)} to ${toLat.toFixed(5)},${toLon.toFixed(5)}.`;
    routeInfo.style.color = "#1a7b1a";

    L.marker([fromLat, fromLon], { title: "From" }).addTo(routeLayer);
    L.marker([toLat, toLon], { title: "To" }).addTo(routeLayer);
  } catch (err) {
    console.error(err);
    routeInfo.textContent = "Unable to get route: " + err.message;
    routeInfo.style.color = "#d4414e";
  }
}

async function routeToTopHotspot() {
  const hotspot = getTopHotspotCoords();
  if (!hotspot) {
    routeInfo.textContent = "No hotspot pinned yet to route to.";
    routeInfo.style.color = "#d4414e";
    return;
  }

  if (!navigator.geolocation) {
    routeInfo.textContent = "Geolocation not available in this browser.";
    routeInfo.style.color = "#d4414e";
    return;
  }

  routeInfo.textContent = "Finding your location...";
  routeInfo.style.color = "#444";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const fromLat = position.coords.latitude;
      const fromLon = position.coords.longitude;
      const toLat = hotspot.lat;
      const toLon = hotspot.lon;
      await routeFromTo(fromLat, fromLon, toLat, toLon);
    },
    (error) => {
      routeInfo.textContent = "Geolocation permission denied or unavailable.";
      routeInfo.style.color = "#d4414e";
      console.warn(error);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

async function routeUserChoice() {
  const fromText = fromCoordsInput.value.trim();
  const toText = toCoordsInput.value.trim();

  const fromC = parseCoords(fromText);
  const toC = parseCoords(toText);

  if (fromC && toC) {
    await routeFromTo(fromC.lat, fromC.lon, toC.lat, toC.lon);
    return;
  }

  if (toC) {
    // From user location to custom to coords
    if (!navigator.geolocation) {
      routeInfo.textContent = "Geolocation not available in this browser.";
      routeInfo.style.color = "#d4414e";
      return;
    }
    routeInfo.textContent = "Finding your location...";
    routeInfo.style.color = "#444";
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await routeFromTo(
          position.coords.latitude,
          position.coords.longitude,
          toC.lat,
          toC.lon,
        );
      },
      (err) => {
        routeInfo.textContent = "Geolocation permission denied or unavailable.";
        routeInfo.style.color = "#d4414e";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return;
  }

  // no to provided, route to top hotspot
  await routeToTopHotspot();
}

async function geocodeAddress(query) {
  if (!query || !query.trim()) return null;
  const cleanQuery = query.trim();

  const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cleanQuery)}`;
  const altUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(geoUrl)}`;
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=1`;

  async function fetchResults(url, proxy = false) {
    const response = await fetch(url, {
      headers: { "Accept-Language": "en" },
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    if (proxy) {
      return JSON.parse(payload.contents || "[]");
    }
    return payload;
  }

  async function tryPhoton() {
    const response = await fetch(photonUrl, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Photon HTTP ${response.status}`);
    }
    const docs = await response.json();
    if (docs.features && docs.features.length) {
      const feature = docs.features[0];
      return {
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        label: feature.properties.name
          ? `${feature.properties.name}, ${feature.properties.city || feature.properties.country || ""}`.trim()
          : cleanQuery,
      };
    }
    return null;
  }

  try {
    let results = [];
    try {
      results = await fetchResults(geoUrl, false);
    } catch (firstErr) {
      console.warn("Direct geocode call failed", firstErr);
    }

    if (!Array.isArray(results) || !results.length) {
      try {
        results = await fetchResults(altUrl, true);
      } catch (proxyErr) {
        console.warn("Proxy geocode call failed", proxyErr);
        results = [];
      }
    }

    if (Array.isArray(results) && results.length) {
      const place = results[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon, label: place.display_name || cleanQuery };
      }
    }

    const photonData = await tryPhoton();
    if (photonData) {
      return photonData;
    }

    return null;
  } catch (err) {
    console.error(`Geocode lookup failed: ${err.message}`, err);
    return null;
  }
}

async function routeUserChoice() {
  const fromText = fromCoordsInput.value.trim();
  const toText = toCoordsInput.value.trim();

  async function resolvePosition(text, description) {
    if (!text) return null;
    const coord = parseCoords(text);
    if (coord) {
      return coord;
    }
    const geocoded = await geocodeAddress(text);
    if (geocoded) {
      return { lat: geocoded.lat, lon: geocoded.lon };
    }
    routeInfo.textContent = `Unable to resolve ${description}: ${text}`;
    routeInfo.style.color = "#d4414e";
    return null;
  }

  const hasFrom = Boolean(fromText);
  const hasTo = Boolean(toText);

  if (!hasFrom && !hasTo) {
    await routeToTopHotspot();
    return;
  }

  const fromPos = hasFrom
    ? await resolvePosition(fromText, "from location")
    : null;
  const toPos = hasTo ? await resolvePosition(toText, "to destination") : null;

  if (hasFrom && !fromPos) return;
  if (hasTo && !toPos) return;

  if (fromPos && toPos) {
    await routeFromTo(fromPos.lat, fromPos.lon, toPos.lat, toPos.lon);
    return;
  }

  if (toPos && !fromPos) {
    if (!navigator.geolocation) {
      routeInfo.textContent = "Geolocation not available in this browser.";
      routeInfo.style.color = "#d4414e";
      return;
    }
    routeInfo.textContent = "Finding your location...";
    routeInfo.style.color = "#444";
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await routeFromTo(
          position.coords.latitude,
          position.coords.longitude,
          toPos.lat,
          toPos.lon,
        );
      },
      (err) => {
        routeInfo.textContent = "Geolocation permission denied or unavailable.";
        routeInfo.style.color = "#d4414e";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return;
  }

  if (fromPos && !toPos) {
    const hotspot = getTopHotspotCoords();
    if (!hotspot) {
      routeInfo.textContent = "No destination provided and no hotspot pinned.";
      routeInfo.style.color = "#d4414e";
      return;
    }
    await routeFromTo(fromPos.lat, fromPos.lon, hotspot.lat, hotspot.lon);
    return;
  }

  // Fallback, should not reach here
  await routeToTopHotspot();
}

function sendDirectionMessage() {
  const messageText = messageInput.value.trim();
  if (!messageText) {
    messageStatus.textContent = "Enter a description before sending.";
    messageStatus.style.color = "#d4414e";
    return;
  }

  const incidentType = incidentTypeSelect.value || "none";
  const typeLabel = getIncidentLabel(incidentType);
  const currentPosition = map.getCenter();
  const provider = getNearestProvider();

  const payload = {
    timestamp: new Date().toISOString(),
    provider,
    incident: typeLabel,
    coords: `${currentPosition.lat.toFixed(5)},${currentPosition.lng.toFixed(5)}`,
    message: messageText,
    from: personNameInput.value.trim() || "Unknown",
  };

  const history = JSON.parse(localStorage.getItem("messageHistory") || "[]");
  history.push(payload);
  localStorage.setItem("messageHistory", JSON.stringify(history));

  messageStatus.textContent = `Message sent to provider at ${provider}.`;
  messageStatus.style.color = "#28a745";
  messageInput.value = "";
}

sendMessageButton.addEventListener("click", sendDirectionMessage);

const showMessageButton = document.getElementById("show-message-btn");

function setMessageVisible(visible) {
  if (visible) {
    messagePanel.classList.remove("hidden");
    showMessageButton.style.display = "none";
    toggleMessageButton.textContent = "Hide Message";
  } else {
    messagePanel.classList.add("hidden");
    showMessageButton.style.display = "flex";
    toggleMessageButton.textContent = "Hide Message";
  }
}

toggleMessageButton.addEventListener("click", () => {
  setMessageVisible(false);
});

showMessageButton.addEventListener("click", () => {
  setMessageVisible(true);
});

// Start visible
setMessageVisible(true);

toggleGraphsButton.addEventListener("click", () => {
  if (graphsPanel.style.display === "none" || !graphsPanel.style.display) {
    graphsPanel.style.display = "block";
    toggleGraphsButton.textContent = "Hide Stats";
    updateGraphs();
  } else {
    graphsPanel.style.display = "none";
    toggleGraphsButton.textContent = "Show Stats";
  }
});

showEmergencyButton.addEventListener("click", () => {
  emergencyPanel.classList.add("open");
  emergencyBackdrop.classList.add("show");
});

closeEmergencyButton.addEventListener("click", () => {
  emergencyPanel.classList.remove("open");
  emergencyBackdrop.classList.remove("show");
});

emergencyBackdrop.addEventListener("click", () => {
  emergencyPanel.classList.remove("open");
  emergencyBackdrop.classList.remove("show");
});

function updateSmsSideLocation() {
  if (!smsSideLocation) return;
  if (!map || !map.getCenter) {
    smsSideLocation.textContent = "Location: unknown";
    return;
  }
  const center = map.getCenter();
  smsSideLocation.textContent = `Location: ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
  return { lat: center.lat, lon: center.lng };
}

smsSideToggle.addEventListener("click", () => {
  smsSideBar.classList.toggle("open");
  if (smsSideBar.classList.contains("open")) {
    updateSmsSideLocation();
  }
});

smsSideClose.addEventListener("click", () => {
  smsSideBar.classList.remove("open");
});

smsSideRefresh.addEventListener("click", () => {
  updateSmsSideLocation();
});

smsSideSend.addEventListener("click", () => {
  const loc = updateSmsSideLocation();
  requestLocationViaSMS(smsSidePhone.value, loc);
});

loadPersonName();

function updateTopPinned() {
  let topKey = null;
  let topCount = 0;

  for (const [key, count] of locationCounts.entries()) {
    if (count > topCount) {
      topCount = count;
      topKey = key;
    }
  }

  for (const [key, marker] of locationMarkers.entries()) {
    const type = locationIncidentType.get(key) || "none";
    marker.setIcon(
      key === topKey
        ? createIncidentIcon(type, true)
        : createIncidentIcon(type),
    );
  }

  const stats = document.getElementById("stats-panel");
  if (!stats) return;

  if (!topKey) {
    stats.textContent = "Top pinned: none";
    return;
  }

  const topLabel = locationLabels.get(topKey) || topKey;
  stats.textContent = `Top pinned: ${topLabel} (${topCount})`;
  updateGraphs();
}

function updateGraphs() {
  const typeCounts = {};
  const locationCountsList = [];

  for (const [key, count] of locationCounts.entries()) {
    const type = locationIncidentType.get(key) || "none";
    typeCounts[type] = (typeCounts[type] || 0) + count;
    locationCountsList.push({ location: key, count });
  }

  const incidentByType = document.getElementById("incident-by-type");
  const topLocations = document.getElementById("top-locations");

  if (!incidentByType || !topLocations) return;

  incidentByType.innerHTML = "<strong>Incidents by type</strong>";
  const maxTypeCount = Math.max(1, ...Object.values(typeCounts));

  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const pct = Math.round((count / maxTypeCount) * 100);
      const node = document.createElement("div");
      node.className = "graph-block";
      node.innerHTML =
        `<div class='graph-meta'>${getIncidentLabel(type)}: ${count}</div>` +
        `<div class='graph-bar'><span style='width:${pct}%;'></span></div>`;
      incidentByType.appendChild(node);
    });

  const topFive = locationCountsList
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  topLocations.innerHTML = "<strong>Top pinned locations</strong>";
  const maxLocCount = Math.max(1, ...topFive.map((v) => v.count));

  topFive.forEach((entry) => {
    const label = locationLabels.get(entry.location) || entry.location;
    const pct = Math.round((entry.count / maxLocCount) * 100);
    const node = document.createElement("div");
    node.className = "graph-block";
    node.innerHTML =
      `<div class='graph-meta'>${label} (${entry.location}): ${entry.count}</div>` +
      `<div class='graph-bar'><span style='width:${pct}%;'></span></div>`;
    topLocations.appendChild(node);
  });
  const areaCumulative = document.getElementById("area-cumulative");
  if (areaCumulative) {
    areaCumulative.innerHTML = "<h4>Most reported cumulative areas</h4>";
    topFive.forEach((entry, index) => {
      const label = locationLabels.get(entry.location) || entry.location;
      const line = document.createElement("div");
      line.className = "area-entry";
      line.textContent = `${index + 1}. ${label} (${entry.location}) — ${entry.count} report(s)`;
      areaCumulative.appendChild(line);
    });
  }

  const locationAddresses = document.getElementById("location-addresses");
  if (locationAddresses) {
    locationAddresses.innerHTML = "<h4>Pinned addresses / coordinates</h4>";
    const entries = [...locationCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      locationAddresses.innerHTML += "<div>No locations pinned yet.</div>";
    } else {
      const list = document.createElement("ul");
      list.style.margin = "0";
      list.style.paddingLeft = "16px";
      entries.forEach(([coord, count]) => {
        const label = locationLabels.get(coord) || coord;
        const li = document.createElement("li");
        li.textContent = `${label} (${coord}): ${count} report${count === 1 ? "" : "s"}`;
        list.appendChild(li);
      });
      locationAddresses.appendChild(list);
    }
  }

  updateAreaHighlights();
}

function updateAreaHighlights() {
  topAreaLayer.clearLayers();
  const topAreas = Array.from(locationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topAreas.forEach(([coord, count]) => {
    const [lat, lon] = coord.split(",").map((x) => parseFloat(x));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const radius = 70 + count * 60;
    const ring = L.circle([lat, lon], {
      radius,
      color: "#dd2c00",
      fillColor: "#ff7043",
      fillOpacity: 0.22,
      weight: 2,
    }).bindTooltip(`Hot zone: ${coord}\nReports: ${count}`, {
      permanent: false,
    });

    ring.addTo(topAreaLayer);
  });
}

function addOrUpdatePinnedLocation(
  lat,
  lon,
  placeName,
  incidentType = "none",
  customText = "",
) {
  const key = locationKey(lat, lon);
  const count = (locationCounts.get(key) || 0) + 1;
  locationCounts.set(key, count);

  const typeUsed =
    incidentType === "custom" ? "custom" : incidentType || "none";
  const incidentLabel =
    typeUsed === "custom" ? customText || "Custom" : getIncidentLabel(typeUsed);

  let marker = locationMarkers.get(key);
  const plainName = placeName || "Selected location";
  const html =
    `<strong>${plainName}</strong><br>Incident: ${incidentLabel}<br>Pin count: ${count}` +
    `<br><button class='unpin-btn'>Unpin</button>`;

  if (!marker) {
    marker = L.marker([lat, lon], { icon: createIncidentIcon(typeUsed) })
      .addTo(map)
      .bindPopup(html);
    marker.unpinKey = key;
    marker.on("popupopen", (e) => {
      const btn = e.popup._contentNode.querySelector(".unpin-btn");
      if (btn) {
        btn.onclick = () => unpinLocation(key);
      }
    });
    locationMarkers.set(key, marker);
  } else {
    marker.setPopupContent(html);
    marker.setIcon(createIncidentIcon(typeUsed));
  }

  // store a human friendly label for stats
  locationLabels.set(key, plainName);
  locationIncidentType.set(key, typeUsed);
  latestPinnedData = {
    lat,
    lon,
    label: plainName,
    incidentType: typeUsed,
  };
  updateTopPinned();
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14&addressdetails=0`;
    const response = await fetch(url, {
      headers: { "Accept-Language": "en" },
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(`Reverse geocode HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.display_name || null;
  } catch (err) {
    console.warn("Reverse geocode failed", err);
    return null;
  }
}

async function addInitialMarkers() {
  const initialPoints = [
    { lat: 51.5, lon: -0.08 },
    { lat: 52.5, lon: -0.09 },
    { lat: 57.5, lon: -0.06 },
  ];

  for (let i = 0; i < initialPoints.length; i++) {
    const { lat, lon } = initialPoints[i];
    const address = await reverseGeocode(lat, lon);
    const label = address || `Initial Marker ${i + 1}`;
    addOrUpdatePinnedLocation(lat, lon, label, "none", "");
  }
}

addInitialMarkers().catch((err) =>
  console.warn("addInitialMarkers error", err),
);

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  const incidentType = incidentTypeSelect.value;
  const customText = incidentCustomInput.value.trim();

  if (!query) {
    alert("Please enter an address or place.");
    return;
  }

  if (incidentType === "custom" && !customText) {
    alert("Please enter custom incident text when selecting Custom.");
    return;
  }

  const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const altUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(geoUrl)}`;
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;

  async function fetchResults(url, proxy = false) {
    const response = await fetch(url, {
      headers: { "Accept-Language": "en" },
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    if (proxy) {
      // allorigins returns { contents: string }
      return JSON.parse(payload.contents || "[]");
    }
    return payload;
  }

  async function tryPhoton() {
    const response = await fetch(photonUrl, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Photon HTTP ${response.status}`);
    }
    const docs = await response.json();
    if (docs.features && docs.features.length) {
      const feature = docs.features[0];
      const lon = feature.geometry.coordinates[0];
      const lat = feature.geometry.coordinates[1];
      const label = feature.properties.name
        ? `${feature.properties.name}, ${feature.properties.city || feature.properties.country || ""}`.trim()
        : query;
      return { lat, lon, label };
    }
    return null;
  }

  try {
    let results = [];
    try {
      results = await fetchResults(geoUrl, false);
    } catch (firstErr) {
      console.warn("Direct geocode call failed", firstErr);
    }

    if (!Array.isArray(results) || !results.length) {
      try {
        results = await fetchResults(altUrl, true);
      } catch (proxyErr) {
        console.warn("Proxy geocode call failed", proxyErr);
        results = [];
      }
    }

    if (Array.isArray(results) && results.length) {
      const place = results[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const name = place.display_name || query;

      map.setView([lat, lon], 15);
      addOrUpdatePinnedLocation(lat, lon, name, incidentType, customText);
      return;
    }

    const photonData = await tryPhoton();
    if (photonData) {
      map.setView([photonData.lat, photonData.lon], 15);
      addOrUpdatePinnedLocation(
        photonData.lat,
        photonData.lon,
        photonData.label,
        incidentType,
        customText,
      );
      return;
    }

    alert(
      "Address not found. Try a different query or simplify the location (city, then street).",
    );
  } catch (err) {
    console.error(err);
    alert(
      `Geocode lookup failed: ${err.message}. Try again or check console for details.`,
    );
  }
});

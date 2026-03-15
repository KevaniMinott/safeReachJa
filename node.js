const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const SESSION_COOKIE = "safeReachSession";
const LOGIN_USER = process.env.APP_LOGIN_USER || "admin";
const LOGIN_PASS = process.env.APP_LOGIN_PASS || "safe123";
const USERS_FILE = path.join(__dirname, "users.json");
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

// In-memory logs for demo/testing.
const dispatchLog = [];
const smsLog = [];
const sessions = new Map();
const users = new Map();

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function saveUsersToFile() {
  const serializableUsers = Array.from(users.values()).map((user) => ({
    username: user.username,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
  }));

  fs.writeFileSync(USERS_FILE, JSON.stringify(serializableUsers, null, 2), {
    encoding: "utf8",
  });
}

function loadUsersFromFile() {
  if (!fs.existsSync(USERS_FILE)) {
    return;
  }

  const raw = fs.readFileSync(USERS_FILE, { encoding: "utf8" });
  if (!raw.trim()) {
    return;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return;
  }

  parsed.forEach((entry) => {
    const username = String(entry?.username || "").trim();
    const passwordHash = String(entry?.passwordHash || "").trim();
    if (!username || !passwordHash) {
      return;
    }

    users.set(username, {
      username,
      passwordHash,
      createdAt: Number(entry?.createdAt) || Date.now(),
    });
  });
}

try {
  loadUsersFromFile();
} catch (err) {
  console.warn(
    "Unable to load users.json, starting with default account.",
    err,
  );
}

if (!users.has(LOGIN_USER)) {
  users.set(LOGIN_USER, {
    username: LOGIN_USER,
    passwordHash: hashPassword(LOGIN_PASS),
    createdAt: Date.now(),
  });
}

try {
  saveUsersToFile();
} catch (err) {
  console.warn("Unable to write users.json.", err);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname, { index: false }));

function parseCookies(cookieHeader = "") {
  const pairs = cookieHeader.split(";").map((part) => part.trim());
  const result = {};
  pairs.forEach((pair) => {
    if (!pair) return;
    const eq = pair.indexOf("=");
    if (eq < 0) return;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(value);
    }
  });
  return result;
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function getSessionFromRequest(req) {
  clearExpiredSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    return res.redirect("/login.html");
  }
  req.sessionUser = session.username;
  return next();
}

function setSessionCookie(res, token) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

app.get("/", (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    return res.redirect("/index.html");
  }
  return res.redirect("/login.html");
});

app.get("/login.html", (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    return res.redirect("/index.html");
  }
  return res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/register.html", (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    return res.redirect("/index.html");
  }
  return res.sendFile(path.join(__dirname, "register.html"));
});

app.get("/index.html", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "username and password are required",
    });
  }

  const account = users.get(username);
  if (!account || account.passwordHash !== hashPassword(password)) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid credentials" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  setSessionCookie(res, token);

  return res.json({ success: true, user: { username } });
});

app.post("/api/register", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const confirmPassword = String(req.body?.confirmPassword || "");

  if (!username || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      error: "username, password, and confirmPassword are required",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      error: "Passwords do not match",
    });
  }

  if (username.length < 3) {
    return res.status(400).json({
      success: false,
      error: "Username must be at least 3 characters",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: "Password must be at least 6 characters",
    });
  }

  if (users.has(username)) {
    return res.status(409).json({
      success: false,
      error: "Username already exists",
    });
  }

  users.set(username, {
    username,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  });

  try {
    saveUsersToFile();
  } catch (err) {
    users.delete(username);
    return res.status(500).json({
      success: false,
      error: "Failed to persist account. Please try again.",
    });
  }

  return res.json({ success: true, user: { username } });
});

app.post("/api/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }
  clearSessionCookie(res);
  return res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  return res.json({ success: true, user: { username: session.username } });
});

app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "ok", time: new Date().toISOString() });
});

app.post("/api/dispatch", requireAuth, (req, res) => {
  const payload = req.body || {};

  if (!payload.incident || !payload.coords || !payload.destination) {
    return res.status(400).json({
      success: false,
      error: "incident, coords, and destination are required",
    });
  }

  const entry = {
    id: `d-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    receivedAt: new Date().toISOString(),
    ...payload,
  };

  dispatchLog.push(entry);
  return res.json({ success: true, data: entry });
});

app.post("/api/sms-request", requireAuth, (req, res) => {
  const { phone, location } = req.body || {};

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({
      success: false,
      error: "phone is required",
    });
  }

  const entry = {
    id: `s-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    phone: String(phone).trim(),
    location: location || null,
    receivedAt: new Date().toISOString(),
  };

  smsLog.push(entry);
  return res.json({ success: true, data: entry });
});

app.post("/api/ai-chat", requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  const volatileAreas = Array.isArray(req.body?.volatileAreas)
    ? req.body.volatileAreas
    : [];

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "prompt is required",
    });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(503).json({
      success: false,
      error: "OPENROUTER_API_KEY is not configured on the server.",
    });
  }

  if (typeof fetch !== "function") {
    return res.status(500).json({
      success: false,
      error: "Global fetch is unavailable. Use Node.js 18+.",
    });
  }

  const areaSummary = volatileAreas.length
    ? volatileAreas
        .slice(0, 5)
        .map(
          (a, i) =>
            `${i + 1}. ${a.label || a.coord || "unknown"} | reports=${a.count || 0} | incident=${a.type || "none"}`,
        )
        .join("\n")
    : "No volatile area records provided yet.";

  const systemPrompt =
    "You are an emergency mapping assistant. Provide concise, practical advice. " +
    "When user asks for volatile zones, summarize highest-risk areas first. " +
    "If user asks to autofill, suggest the best area label and incident type.";

  const userPrompt =
    `User request: ${prompt}\n\n` +
    `Current volatile area data:\n${areaSummary}\n\n` +
    "Keep the response short (2-5 lines).";

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Safe Reach Assistant",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
        }),
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          payload?.error?.message ||
          payload?.error ||
          `OpenRouter request failed (${response.status})`,
      });
    }

    const reply =
      payload?.choices?.[0]?.message?.content ||
      "I could not generate a response right now.";

    return res.json({
      success: true,
      data: {
        reply,
        model: OPENROUTER_MODEL,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `OpenRouter network error: ${err.message}`,
    });
  }
});

app.get("/api/logs", requireAuth, (_req, res) => {
  res.json({
    success: true,
    counts: {
      dispatch: dispatchLog.length,
      sms: smsLog.length,
    },
    dispatch: dispatchLog,
    sms: smsLog,
  });
});

app.get("*", (_req, res) => {
  return res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

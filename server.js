const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Parse time string -> 24h hour number
function parseHour(timeStr) {
  const match = timeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1]);
  const period = match[3] ? match[3].toUpperCase() : null;
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour;
}

// Analyze schedule + compute safety score
function analyzeSchedule(plan) {
  const lines = plan.split("\n").filter(l => l.trim());
  const warnings = [];
  const safePlan = [];
  let unsafeCount = 0;

  for (const line of lines) {
    const timeMatches = [...line.matchAll(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/gi)];
    let unsafe = false;
    for (const m of timeMatches) {
      const hour = parseHour(m[1]);
      if (hour !== null && hour >= 20) { unsafe = true; break; }
    }
    if (unsafe) {
      unsafeCount++;
      warnings.push(`"${line.trim()}" — this timing is after 8 PM.`);
      safePlan.push(`${line.trim()} → Consider shifting this to before 7:30 PM`);
    } else {
      safePlan.push(line.trim());
    }
  }

  // Score: start at 100, deduct 20 per unsafe activity, min 10
  const score = Math.max(10, 100 - unsafeCount * 20);
  let scoreLabel, scoreColor;
  if (score >= 80) { scoreLabel = "Safe"; scoreColor = "green"; }
  else if (score >= 50) { scoreLabel = "Moderate Risk"; scoreColor = "orange"; }
  else { scoreLabel = "High Risk"; scoreColor = "red"; }

  return { warnings, safePlan: safePlan.join("\n"), score, scoreLabel, scoreColor };
}

// POST /api/plan
app.post("/api/plan", (req, res) => {
  const { name, plan } = req.body;
  if (!plan || !plan.trim()) return res.status(400).json({ error: "Plan cannot be empty." });

  const { warnings, safePlan, score, scoreLabel, scoreColor } = analyzeSchedule(plan);

  const suggestion = warnings.length > 0
    ? "Some activities are scheduled after 8 PM. It's safer to wrap up travel and outings by 7:30 PM.\n" +
      warnings.map(w => `• ${w}`).join("\n")
    : "Your schedule looks safe. Great planning!";

  const tips = [
    "Always share your live location with a trusted family member or friend when traveling.",
    "Keep emergency contacts (family, local helpline 1091) saved and easy to reach.",
    "Prefer well-lit, busy routes and avoid isolated areas especially in the evening."
  ];

  db.get("plans").push({
    id: Date.now(),
    name: name || "Anonymous",
    plan,
    safe_plan: safePlan,
    score,
    created_at: new Date().toISOString()
  }).write();

  res.json({ safePlan, suggestion, tips, score, scoreLabel, scoreColor });
});

// GET /api/plans
app.get("/api/plans", (req, res) => {
  const plans = db.get("plans").value().slice(-10).reverse();
  res.json(plans);
});

// Emergency contacts CRUD
app.get("/api/contacts", (req, res) => {
  res.json(db.get("contacts").value());
});

app.post("/api/contacts", (req, res) => {
  const { name, phone, relation } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "Name and phone required." });
  const contacts = db.get("contacts").value();
  if (contacts.length >= 5) return res.status(400).json({ error: "Max 5 contacts allowed." });
  const contact = { id: Date.now(), name, phone, relation: relation || "" };
  db.get("contacts").push(contact).write();
  res.json(contact);
});

app.delete("/api/contacts/:id", (req, res) => {
  db.get("contacts").remove({ id: parseInt(req.params.id) }).write();
  res.json({ ok: true });
});

// Check-in timer — save active timer
app.post("/api/checkin", (req, res) => {
  const { name, returnTime, plan } = req.body;
  if (!returnTime) return res.status(400).json({ error: "Return time required." });
  const checkin = { id: Date.now(), name: name || "Anonymous", returnTime, plan: plan || "", created_at: new Date().toISOString() };
  db.set("activeCheckin", checkin).write();
  res.json(checkin);
});

app.get("/api/checkin", (req, res) => {
  res.json(db.get("activeCheckin").value() || null);
});

app.delete("/api/checkin", (req, res) => {
  db.set("activeCheckin", null).write();
  res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

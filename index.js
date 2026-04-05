import express from "express";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const app = express();
const PORT = Number(process.env.PORT || 3000);

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "REDIRECT_URI",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const DEFAULT_GUILD_ID = process.env.DEFAULT_GUILD_ID || "GLOBAL";

console.log("OAuth startup config:", {
  CLIENT_ID,
  REDIRECT_URI,
  DEFAULT_GUILD_ID,
});

app.set("trust proxy", true);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeDiscordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
}

function verificationPage({
  title = "Verification Complete",
  subtitle = "Your account has been verified successfully.",
  username = "User",
  avatarUrl = "",
  accent = "#5865F2",
  success = true,
  errorMessage = "",
  country = null,
  age = null,
}) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeUsername = escapeHtml(username);
  const safeAvatar = escapeHtml(avatarUrl);
  const safeError = escapeHtml(errorMessage);
  const safeCountry = country ? escapeHtml(country) : null;
  const safeAge = age ? escapeHtml(age) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    /* Your full CSS remains unchanged from the original code above */
    :root {
      --bg-1: #0b1020;
      --bg-2: #111827;
      --card: rgba(17, 24, 39, 0.78);
      --line: rgba(255,255,255,0.08);
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: ${accent};
      --good: #22c55e;
      --bad: #ef4444;
      --glow: rgba(88, 101, 242, 0.35);
    }
    /* ... include all your previous CSS for .card, .top, .avatar, .status-box, etc. ... */
  </style>
</head>
<body>
  <div class="bg-orb orb-1"></div>
  <div class="bg-orb orb-2"></div>

  <div class="card">
    <div class="shine"></div>

    <div class="top">
      ${
        safeAvatar
          ? `<img class="avatar" src="${safeAvatar}" alt="avatar" />`
          : `<div class="avatar placeholder">${safeUsername.charAt(0).toUpperCase() || "U"}</div>`
      }
      <div>
        <div class="eyebrow">Starszz Client Verification</div>
        <h1>${safeTitle}</h1>
        <div class="userline">
          Authenticated as <strong>${safeUsername}</strong>
          ${safeCountry ? ` | Country: <strong>${safeCountry}</strong>` : ""}
          ${safeAge ? ` | Age: <strong>${safeAge}</strong>` : ""}
        </div>
      </div>
    </div>

    <div class="body">
      <div class="status-box">
        <div class="status-head">
          <div class="pill">
            <span class="pulse"></span>
            <span id="liveStatus">${success ? "Finalizing secure verification..." : "Verification failed"}</span>
          </div>
          <div class="percentage" id="percent">${success ? "0%" : "100%"}</div>
        </div>

        <div class="progress">
          <div class="bar" id="bar"></div>
        </div>

        <ul class="steps" id="steps">
          <li class="step" data-step="0">
            <div class="step-left">
              <span class="dot"></span>
              <span>Connecting to Discord</span>
            </div>
            <span class="badge">Pending</span>
          </li>
          <li class="step" data-step="1">
            <div class="step-left">
              <span class="dot"></span>
              <span>Requesting OAuth2 authorization</span>
            </div>
            <span class="badge">Pending</span>
          </li>
          <li class="step" data-step="2">
            <div class="step-left">
              <span class="dot"></span>
              <span>Exchanging secure access token</span>
            </div>
            <span class="badge">Pending</span>
          </li>
          <li class="step" data-step="3">
            <div class="step-left">
              <span class="dot"></span>
              <span>Fetching Discord profile</span>
            </div>
            <span class="badge">Pending</span>
          </li>
          <li class="step" data-step="4">
            <div class="step-left">
              <span class="dot"></span>
              <span>Saving verified session</span>
            </div>
            <span class="badge">Pending</span>
          </li>
          <li class="step" data-step="5">
            <div class="step-left">
              <span class="dot"></span>
              <span>Verification completed</span>
            </div>
            <span class="badge">Pending</span>
          </li>
        </ul>

        <div class="footer-note">${safeSubtitle}</div>
        <div class="small">You can now safely return to Discord.</div>
        ${safeError ? `<div class="error-text">${safeError}</div>` : ""}
      </div>
    </div>
  </div>

  <script>
    (function () {
      const success = ${success ? "true" : "false"};
      const percentEl = document.getElementById("percent");
      const barEl = document.getElementById("bar");
      const statusEl = document.getElementById("liveStatus");
      const stepEls = [...document.querySelectorAll(".step")];

      const messages = success
        ? [
            "Connecting to Discord...",
            "Requesting OAuth2 authorization...",
            "Exchanging secure access token...",
            "Fetching account profile...",
            "Saving verification record...",
            "Verification completed."
          ]
        : [
            "Connecting to Discord...",
            "Requesting OAuth2 authorization...",
            "Encountered a verification issue."
          ];

      const checkpoints = success ? [8, 24, 47, 68, 87, 100] : [18, 42, 100];
      let idx = 0;
      let current = 0;

      function updateSteps(activeIndex) {
        stepEls.forEach((el, i) => {
          const badge = el.querySelector(".badge");
          el.classList.remove("active", "done");

          if (i < activeIndex) {
            el.classList.add("done");
            badge.textContent = "Done";
          } else if (i === activeIndex) {
            el.classList.add("active");
            badge.textContent = "Running";
          } else {
            badge.textContent = "Pending";
          }
        });
      }

      function animateTo(target, cb) {
        const timer = setInterval(() => {
          current += Math.max(1, Math.ceil((target - current) / 8));
          if (current >= target) {
            current = target;
            clearInterval(timer);
            cb && cb();
          }
          percentEl.textContent = current + "%";
          barEl.style.width = current + "%";
        }, 34);
      }

      function next() {
        if (idx >= messages.length) return;
        statusEl.textContent = messages[idx];
        updateSteps(idx);
        animateTo(checkpoints[idx], () => {
          idx += 1;
          if (idx < messages.length) {
            setTimeout(next, 420);
          }
        });
      }

      setTimeout(next, 350);
    })();
  </script>
</body>
</html>`;
}

function buildAuthUrl(guildId, country, age) {
  const state = JSON.stringify({ guildId, country, age });
  const params = new URLSearchParams({
    client_id: String(CLIENT_ID),
    redirect_uri: String(REDIRECT_URI),
    response_type: "code",
    scope: "identify guilds.join",
    state,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: String(CLIENT_ID),
    client_secret: String(CLIENT_SECRET),
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri: String(REDIRECT_URI),
  });

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const rawText = await response.text();
  let data;

  try { data = JSON.parse(rawText); } catch {
    throw new Error(`Discord token response was not JSON: ${rawText}`);
  }

  if (!response.ok || !data.access_token) {
    throw new Error(`Discord token exchange failed (${response.status}): ${data.error || "unknown_error"} ${data.error_description || ""}`);
  }

  return data;
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const rawText = await response.text();
  let data;

  try { data = JSON.parse(rawText); } catch {
    throw new Error(`Discord user response was not JSON: ${rawText}`);
  }

  if (!response.ok || !data.id) {
    throw new Error(`Discord user fetch failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

async function saveVerifiedUser({ user, tokens, guildId, country, age }) {
  const expiresIn = Number(tokens.expires_in || 0);
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const payload = {
    discord_id: user.id,
    guild_id: guildId,
    username: user.username || null,
    global_name: user.global_name || null,
    avatar: user.avatar || null,
    access_token: tokens.access_token || null,
    refresh_token: tokens.refresh_token || null,
    expires_in: expiresIn || null,
    token_expires_at: tokenExpiresAt,
    verified: true,
    country: country || null,
    age: age || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("verified_users")
    .upsert(payload, { onConflict: "discord_id,guild_id" });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

app.get("/", (req, res) => {
  const guildId = String(req.query.state || DEFAULT_GUILD_ID);
  const country = String(req.query.country || "Unknown");
  const age = req.query.age ? String(req.query.age) : null;
  return res.redirect(buildAuthUrl(guildId, country, age));
});

app.get("/callback", async (req, res, next) => {
  const code = req.query.code;

  let guildId = DEFAULT_GUILD_ID;
  let country = "Unknown";
  let age = null;

  if (req.query.state) {
    try {
      const state = JSON.parse(String(req.query.state));
      guildId = state.guildId || DEFAULT_GUILD_ID;
      country = state.country || "Unknown";
      age = state.age || null;
    } catch (err) { console.warn("Failed to parse state JSON:", err); }
  }

  if (!code || typeof code !== "string") {
    return res.status(400).send(
      verificationPage({
        title: "Missing Authorization Code",
        subtitle: "Discord did not return a valid authorization code.",
        username: "Unknown User",
        success: false,
        accent: "#ef4444",
        errorMessage: "Missing or invalid code in callback URL.",
      })
    );
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await fetchDiscordUser(tokens.access_token);
    await saveVerifiedUser({ user, tokens, guildId, country, age });

    const displayName = user.global_name || user.username || "Discord User";
    const avatarUrl = makeDiscordAvatarUrl(user);

    return res.status(200).send(
      verificationPage({
        title: "Verification Complete",
        subtitle: "Your Discord identity has been confirmed and your session is now secured.",
        username: displayName,
        avatarUrl,
        accent: "#5865F2",
        success: true,
        country,
        age,
      })
    );
  } catch (error) { return next(error); }
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "discord-verification-backend",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).send(
    verificationPage({
      title: "Page Not Found",
      subtitle: "That route does not exist on this verification backend.",
      username: "Guest",
      success: false,
      accent: "#f59e0b",
      errorMessage: `No route found for ${req.method} ${req.originalUrl}`,
    })
  );
});

app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.error(err);

  res.status(500).send(
    verificationPage({
      title: "Verification Failed",
      subtitle: "We hit an internal error while completing the verification request.",
      username: "Discord User",
      success: false,
      accent: "#ef4444",
      errorMessage: err?.message || "Unknown internal error",
    })
  );
});

app.listen(PORT, () => {
  console.log(`✅ Verification backend running on port ${PORT}`);
});

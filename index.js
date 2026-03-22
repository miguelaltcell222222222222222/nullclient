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
}) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeUsername = escapeHtml(username);
  const safeAvatar = escapeHtml(avatarUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
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

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(88,101,242,0.20), transparent 35%),
        radial-gradient(circle at bottom right, rgba(34,197,94,0.10), transparent 30%),
        linear-gradient(135deg, var(--bg-1), #0f172a 45%, var(--bg-2));
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow: hidden;
    }

    .bg-orb {
      position: fixed;
      inset: auto;
      width: 420px;
      height: 420px;
      border-radius: 999px;
      filter: blur(80px);
      opacity: 0.16;
      pointer-events: none;
      animation: drift 12s ease-in-out infinite alternate;
    }

    .orb-1 { top: -80px; left: -80px; background: #5865F2; }
    .orb-2 { bottom: -100px; right: -60px; background: #22c55e; animation-delay: 1.8s; }

    @keyframes drift {
      from { transform: translate(0, 0) scale(1); }
      to   { transform: translate(40px, -20px) scale(1.08); }
    }

    .card {
      position: relative;
      width: 100%;
      max-width: 620px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 28px;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      box-shadow:
        0 20px 80px rgba(0,0,0,0.45),
        0 0 0 1px rgba(255,255,255,0.02) inset;
      overflow: hidden;
    }

    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%),
        radial-gradient(circle at top center, var(--glow), transparent 35%);
      pointer-events: none;
    }

    .top {
      padding: 28px 28px 12px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .avatar {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      box-shadow: 0 8px 24px rgba(0,0,0,0.28);
    }

    .avatar.placeholder {
      display: grid;
      place-items: center;
      font-size: 26px;
      font-weight: 700;
      color: white;
      background: linear-gradient(135deg, #5865F2, #7c3aed);
    }

    .eyebrow {
      color: #cbd5e1;
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.1;
      letter-spacing: -0.03em;
    }

    .userline {
      margin-top: 8px;
      color: var(--muted);
      font-size: 15px;
    }

    .userline strong {
      color: white;
      font-weight: 700;
    }

    .body {
      padding: 18px 28px 28px;
    }

    .status-box {
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      border-radius: 20px;
      padding: 18px;
      margin-top: 8px;
    }

    .status-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: #dbeafe;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(88,101,242,0.16);
      border: 1px solid rgba(88,101,242,0.24);
    }

    .pulse {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${success ? "var(--good)" : "var(--bad)"};
      box-shadow: 0 0 0 0 ${success ? "rgba(34,197,94,0.65)" : "rgba(239,68,68,0.6)"};
      animation: pulse 1.8s infinite;
    }

    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 ${success ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)"}; }
      70%  { box-shadow: 0 0 0 12px rgba(0,0,0,0); }
      100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
    }

    .percentage {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.04em;
    }

    .progress {
      width: 100%;
      height: 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
      position: relative;
    }

    .bar {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #5865F2, #7c3aed, #22c55e);
      box-shadow: 0 0 24px rgba(88,101,242,0.45);
      transition: width 0.8s cubic-bezier(.22,1,.36,1);
    }

    .steps {
      list-style: none;
      padding: 0;
      margin: 16px 0 0;
      display: grid;
      gap: 10px;
    }

    .step {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: #cbd5e1;
      font-size: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255,255,255,0.028);
      border: 1px solid rgba(255,255,255,0.04);
      transform: translateY(8px);
      opacity: 0.6;
      transition: 0.45s ease;
    }

    .step.active,
    .step.done {
      transform: translateY(0);
      opacity: 1;
    }

    .step-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: rgba(255,255,255,0.22);
      transition: 0.25s ease;
      flex: 0 0 auto;
    }

    .step.active .dot {
      background: #5865F2;
      box-shadow: 0 0 0 6px rgba(88,101,242,0.16);
    }

    .step.done .dot {
      background: #22c55e;
      box-shadow: 0 0 0 6px rgba(34,197,94,0.15);
    }

    .badge {
      font-size: 12px;
      color: #94a3b8;
      white-space: nowrap;
    }

    .footer-note {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
    }

    .footer-note strong {
      color: white;
    }

    .shine {
      position: absolute;
      top: -120%;
      left: -30%;
      width: 40%;
      height: 320%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
      transform: rotate(18deg);
      animation: shine 4s linear infinite;
      pointer-events: none;
    }

    @keyframes shine {
      from { transform: translateX(-10%) rotate(18deg); }
      to   { transform: translateX(340%) rotate(18deg); }
    }

    .error-text {
      color: #fecaca;
      margin-top: 10px;
      font-size: 14px;
      text-align: center;
    }

    .small {
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
      margin-top: 10px;
    }
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
        <div class="eyebrow">Premium Verification Gateway</div>
        <h1>${safeTitle}</h1>
        <div class="userline">Authenticated as <strong>${safeUsername}</strong></div>
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
        ${success ? "" : `<div class="error-text">Something went wrong while completing the verification flow.</div>`}
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
            cb?.();
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

function buildAuthUrl(guildId) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.join",
    state: guildId,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(`Discord token exchange failed: ${JSON.stringify(data)}`);
  }

  return data;
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.id) {
    throw new Error(`Discord user fetch failed: ${JSON.stringify(data)}`);
  }

  return data;
}

async function saveVerifiedUser({ user, tokens, guildId }) {
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
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("verified_users")
    .upsert(payload, { onConflict: "discord_id,guild_id" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}

app.get("/", (req, res) => {
  const guildId = String(req.query.state || DEFAULT_GUILD_ID);
  return res.redirect(buildAuthUrl(guildId));
});

app.get("/callback", async (req, res, next) => {
  const code = req.query.code;
  const guildId = String(req.query.state || DEFAULT_GUILD_ID);

  if (!code || typeof code !== "string") {
    return res.status(400).send(
      verificationPage({
        title: "Missing Authorization Code",
        subtitle: "Discord did not return a valid authorization code.",
        username: "Unknown User",
        success: false,
        accent: "#ef4444",
      })
    );
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await fetchDiscordUser(tokens.access_token);
    await saveVerifiedUser({ user, tokens, guildId });

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
      })
    );
  } catch (error) {
    return next(error);
  }
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
    })
  );
});

app.listen(PORT, () => {
  console.log(`✅ Verification backend running on port ${PORT}`);
});

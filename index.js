import express from "express";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const DOMAIN_URL = process.env.DOMAIN_URL || "";
const DEFAULT_GUILD_ID = process.env.DEFAULT_GUILD_ID || "GLOBAL";

function maskIP(ip) {
  if (!ip) return "unknown";
  if (ip.includes(":")) return ip; // leave ipv6 as-is
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.***` : ip;
}

function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function discordSnowflakeToISO(id) {
  return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString();
}

function getAvatarURL(user) {
  if (!user.avatar) {
    return "https://discord.com/assets/02b73275048e30fd09ac.png";
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024`;
}

async function exchangeCode(code) {
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(data.error_description || "Discord token exchange failed");
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
  if (!data.id) {
    throw new Error(data.message || "Failed to fetch Discord user");
  }

  return data;
}

async function lookupGeo(ip) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    const geo = await res.json();

    return {
      country: geo.country_name || "Unknown",
      region: geo.region || "Unknown",
      isp: geo.org || "Unknown",
    };
  } catch {
    return {
      country: "Unknown",
      region: "Unknown",
      isp: "Unknown",
    };
  }
}

async function getExistingUser(discordId) {
  const { data, error } = await supabase
    .from("verified_users")
    .select("discord_id, ip_address, country, region, isp, last_ip_capture, created_at")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

app.get("/", async (req, res) => {
  const state = req.query.state || DEFAULT_GUILD_ID;

  const authURL =
    "https://discord.com/oauth2/authorize?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds.join email",
      state,
    }).toString();

  return res.redirect(authURL);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const guild_id = req.query.state || DEFAULT_GUILD_ID;

  if (!code) {
    return res.status(400).send(`
      <body style="background:#0b0f19;color:#fff;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="max-width:560px;background:#121826;padding:32px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center;">
          <h1 style="margin:0 0 12px;color:#ff6b6b;">Authorization Error</h1>
          <p style="margin:0;color:#9aa4b2;">Missing OAuth2 code. Please restart verification.</p>
        </div>
      </body>
    `);
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await fetchDiscordUser(tokens.access_token);

    const existing = await getExistingUser(user.id);
    const rawIP = getClientIP(req);

    let country = existing?.country || "Unknown";
    let region = existing?.region || "Unknown";
    let isp = existing?.isp || "Unknown";
    let ip_address = existing?.ip_address || null;
    let last_ip_capture = existing?.last_ip_capture || null;

    // only capture IP/geo once unless missing
    if (!existing?.ip_address || !existing?.country || existing.country === "Unknown") {
      const geo = await lookupGeo(rawIP);
      country = geo.country;
      region = geo.region;
      isp = geo.isp;
      ip_address = maskIP(rawIP);
      last_ip_capture = new Date().toISOString();
    }

    const payload = {
      discord_id: user.id,
      guild_id,

      username: user.username || null,
      global_name: user.global_name || null,
      avatar: user.avatar || null,
      locale: user.locale || null,
      email: user.email || null,
      email_verified: user.verified ?? null,
      mfa_enabled: user.mfa_enabled ?? null,

      country,
      region,
      isp,
      ip_address,
      last_ip_capture,

      account_created: discordSnowflakeToISO(user.id),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),

      verified: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("verified_users")
      .upsert(payload, { onConflict: "discord_id" });

    if (error) throw error;

    const displayName = user.global_name || user.username;
    const avatarURL = getAvatarURL(user);

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Starszz Verification</title>
      </head>
      <body style="margin:0;background:linear-gradient(180deg,#081120 0%,#0f172a 100%);color:#fff;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="width:100%;max-width:640px;margin:20px;background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:36px;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center;">
          <img src="${avatarURL}" alt="avatar" style="width:92px;height:92px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.08);margin-bottom:16px;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#11213f;color:#8ab4ff;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px;">Starszz Identity</div>
          <h1 style="margin:0 0 10px;font-size:32px;color:#4ade80;">Verification Complete</h1>
          <p style="margin:0 0 24px;color:#94a3b8;font-size:16px;line-height:1.6;">
            Your Discord account <strong style="color:#fff;">${displayName}</strong> has been securely connected.
          </p>

          <div style="background:#0b1220;border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:18px;text-align:left;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);">
              <span style="color:#94a3b8;">Username</span>
              <span>${user.username}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);">
              <span style="color:#94a3b8;">Location</span>
              <span>${country}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);">
              <span style="color:#94a3b8;">Region</span>
              <span>${region}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;">
              <span style="color:#94a3b8;">Source</span>
              <span>${guild_id}</span>
            </div>
          </div>

          <p style="margin:22px 0 0;color:#64748b;font-size:14px;">You can now safely close this window.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Callback error:", error.message);
    return res.status(500).send(`
      <body style="background:#0b0f19;color:#fff;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="max-width:560px;background:#121826;padding:32px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center;">
          <h1 style="margin:0 0 12px;color:#ff6b6b;">Verification Failed</h1>
          <p style="margin:0;color:#9aa4b2;">${error.message}</p>
        </div>
      </body>
    `);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Starszz backend running on port ${PORT}`);
});

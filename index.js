import express from "express";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// -----------------------------
// Helper
// -----------------------------
function generateLicenseKey() {
  return crypto.randomBytes(12).toString("hex");
}

// -----------------------------
// OAuth Redirect
// -----------------------------
app.get("/", (req, res) => {
  const state = req.query.state || "GLOBAL";
  const bot_name = req.query.bot || "main";
  const authURL = "https://discord.com/oauth2/authorize?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds.join",
      state: `${state}:${bot_name}`
    }).toString();
  res.redirect(authURL);
});

// -----------------------------
// OAuth Callback
// -----------------------------
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const [guild_id = "GLOBAL", bot_name = "main"] = (req.query.state || "").split(":");

  if (!code) return res.status(400).send("Missing code");

  try {
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("Token exchange failed");

    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();

    const payload = {
      discord_id: user.id,
      bot_name,
      guild_id,
      username: user.username,
      global_name: user.global_name || null,
      avatar: user.avatar,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabase.from("verified_users").upsert(payload, { onConflict: ["discord_id","bot_name","guild_id"] });

    res.send(`<h1>✅ Verified for bot ${bot_name}</h1><p>User: ${user.username}</p>`);

  } catch (err) {
    console.error(err);
    res.status(500).send("Verification failed");
  }
});

// -----------------------------
// Refresh token
// -----------------------------
app.post("/refresh", async (req, res) => {
  const { discord_id, bot_name } = req.body;
  const { data: user } = await supabase.from("verified_users").select("*").eq("discord_id", discord_id).eq("bot_name", bot_name).single();
  if (!user || !user.refresh_token) return res.status(404).send("User not found");

  try {
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: user.refresh_token,
        redirect_uri: REDIRECT_URI
      })
    });
    const tokens = await tokenRes.json();
    await supabase.from("verified_users").update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString()
    }).eq("discord_id", discord_id).eq("bot_name", bot_name);
    res.json({ success: true, tokens });
  } catch (err) {
    console.error(err);
    res.status(500).send("Refresh failed");
  }
});

// -----------------------------
// Create license (owner only)
// -----------------------------
app.post("/create_license", async (req, res) => {
  const { owner_id, bot_name, expiry } = req.body;
  if (!owner_id || !bot_name) return res.status(400).send("Missing parameters");

  const license_key = generateLicenseKey();
  await supabase.from("licenses").insert({ license_key, owner_id, bot_name, expiry: expiry || null, created_at: new Date().toISOString() });

  res.json({ success: true, license_key });
});

// -----------------------------
// Claim license (user)
app.post("/claim_license", async (req, res) => {
  const { user_id, license_key } = req.body;
  const { data: license } = await supabase.from("licenses").select("*").eq("license_key", license_key).single();
  if (!license) return res.status(404).send("License not found");

  const now = new Date();
  if (license.expiry && new Date(license.expiry) < now) return res.status(400).send("License expired");

  await supabase.from("license_claims").insert({ license_key, user_id, claimed_at: now.toISOString() });
  res.json({ success: true, message: "License claimed" });
});

app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));

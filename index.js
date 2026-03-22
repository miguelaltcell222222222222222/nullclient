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
const DEFAULT_GUILD_ID = process.env.DEFAULT_GUILD_ID || "GLOBAL";

// Redirect to Discord OAuth2 with identify + guilds.join
app.get("/", (req, res) => {
  const state = req.query.state || DEFAULT_GUILD_ID;
  const authURL = "https://discord.com/oauth2/authorize?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds.join",
      state
    }).toString();
  res.redirect(authURL);
});

// Callback
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const guild_id = req.query.state || DEFAULT_GUILD_ID;

  if (!code) return res.status(400).send("Missing code");

  try {
    // Exchange code for token
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

    // Fetch user info
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();
    if (!user.id) throw new Error("Failed to fetch user profile");

    // Save to Supabase
    const payload = {
      discord_id: user.id,
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

    const { error } = await supabase
      .from("verified_users")
      .upsert(payload, { onConflict: "discord_id,guild_id" });
    if (error) throw error;

    res.send(`
      <body style="margin:0;background:#0f172a;color:white;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <div style="max-width:560px;background:#111827;padding:32px;border-radius:20px;text-align:center;">
          <h1 style="color:#4ade80;">Verification Complete</h1>
          <p>Your account <strong>${user.global_name || user.username}</strong> has been verified.</p>
          <p style="color:#94a3b8;">You can now return to Discord.</p>
        </div>
      </body>
    `);

  } catch (e) {
    console.error(e);
    res.status(500).send("Verification failed");
  }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

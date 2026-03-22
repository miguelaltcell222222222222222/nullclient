import 'dotenv/config'; // Required for local development
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch'; // Ensure 'npm install node-fetch' if on Node < 18

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Discord Config from Environment
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

function maskIP(ip) {
    const p = (ip || '').split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.***` : ip;
}

app.get('/callback', async (req, res) => {
    // 'state' is used here as the Guild ID where the user came from
    const { code, state: guild_id } = req.query;

    if (!code) return res.status(400).send('<h1>Missing OAuth2 Code</h1>');

    try {
        // 1. Exchange Code for Access Token
        const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            })
        });

        const tokens = await tokenRes.json();
        if (!tokens.access_token) throw new Error('Token exchange failed');

        // 2. Fetch User Profile
        const userRes = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const user = await userRes.json();

        // 3. Geolocation Data
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        let country = 'Unknown';
        try {
            const geo = await fetch(`https://ipapi.co/${ip}/json/`).then(r => r.json());
            country = geo.country_name || 'Unknown';
        } catch (err) {
            console.error("GeoIP Error:", err.message);
        }

        // 4. Calculate Account Age (Snowflake ID)
        const created = new Date(Number((BigInt(user.id) >> 22n) + 1420070400000n)).toISOString();

        // 5. Upsert into Supabase (Matches the Python Bot's requirements)
        const { error } = await supabase.from('verified_users').upsert({
            discord_id: user.id,
            guild_id: guild_id || "GLOBAL", // Tracks which invite/link they used
            country: country,
            ip_address: maskIP(ip),
            account_created: created,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            verified: true
        }, { onConflict: 'discord_id' });

        if (error) throw error;

        // Success Page
        res.send(`
            <body style="background-color: #23272a; color: white; font-family: sans-serif; text-align: center; padding-top: 100px;">
                <h1 style="color: #57F287;">✅ Verification Successful!</h1>
                <p>You can now close this window and return to Discord.</p>
                <small style="color: #72767d;">ID: ${user.id} | Location: ${country}</small>
            </body>
        `);

    } catch (e) {
        console.error("Critical Error:", e);
        res.status(500).send('<h1 style="color:red; text-align:center;">Verification Failed. Please try again later.</h1>');
    }
});

app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));

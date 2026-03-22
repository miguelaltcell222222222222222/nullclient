import express from 'express';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase using your Railway Variables
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Discord Config from Railway Variables
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Helper to mask IP for privacy while keeping the record
function maskIP(ip) {
    const p = (ip || '').split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.***` : ip;
}

app.get('/callback', async (req, res) => {
    const { code, state: guild_id } = req.query;

    if (!code) return res.status(400).send('<h1 style="font-family:sans-serif;text-align:center;">Error: Missing OAuth2 Code</h1>');

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
        if (!tokens.access_token) throw new Error('Discord Token Exchange Failed');

        // 2. Fetch User Profile
        const userRes = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const user = await userRes.json();

        // 3. Geolocation & IP
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        let country = 'Unknown';
        try {
            const geo = await fetch(`https://ipapi.co/${ip}/json/`).then(r => r.json());
            country = geo.country_name || 'Unknown';
        } catch (e) { console.error("Geo error:", e.message); }

        // 4. Calculate Account Creation Date
        const created = new Date(Number((BigInt(user.id) >> 22n) + 1420070400000n)).toISOString();

        // 5. Upsert to Supabase
        const { error } = await supabase.from('verified_users').upsert({
            discord_id: user.id,
            guild_id: guild_id || "GLOBAL",
            country: country,
            ip_address: maskIP(ip),
            account_created: created,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            verified: true
        }, { onConflict: 'discord_id' });

        if (error) throw error;

        // Success Page Response
        res.send(`
            <body style="background-color: #2c2f33; color: white; font-family: sans-serif; text-align: center; padding-top: 100px;">
                <h1 style="color: #43b581;">✅ Verification Successful!</h1>
                <p style="font-size: 1.1rem;">Your account <strong>${user.username}</strong> has been synced.</p>
                <p style="color: #72767d;">You can now safely close this window.</p>
            </body>
        `);

    } catch (e) {
        console.error("Critical Error:", e.message);
        res.status(500).send(`<h1 style="color:#f04747;text-align:center;font-family:sans-serif;">Verification Failed</h1><p style="text-align:center;">${e.message}</p>`);
    }
});

// Railway needs 0.0.0.0 to bind correctly to their internal network
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Backend running on port ${PORT}`));

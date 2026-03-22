import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

function maskIP(ip) {
  const p = (ip || '').split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.***` : ip;
}

app.get('/callback', async (req, res) => {
  const { code, state: guild } = req.query;
  if (!code) return res.status(400).send('<h1>Missing code</h1>');

  try {
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

    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    let country = 'Unknown';
    try {
      const geo = await fetch(`https://ipapi.co/${ip}/json/`).then(r => r.json());
      country = geo.country_name || 'Unknown';
    } catch {}

    const created = new Date(Number((BigInt(user.id) >> 22n) + 1420070400000n)).toISOString();

    await supabase.from('verified_users').upsert({
      discord_id: user.id,
      guild_id: guild || null,
      country,
      ip_address: maskIP(ip),
      account_created: created,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      verified: true
    });

    res.send(`<h1 style="color:green;text-align:center;padding:100px;font-family:sans-serif;">✅ Verification Successful!<br><br>You can now be pulled by whitelisted users.</h1>`);
  } catch (e) {
    console.error(e);
    res.status(500).send('<h1>Verification Failed</h1>');
  }
});

app.listen(PORT, () => console.log('Callback running on Render'));

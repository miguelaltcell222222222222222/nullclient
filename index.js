import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const DOMAIN_URL = process.env.DOMAIN_URL;

async function getIPInfo(ip){
    try{
        const res = await fetch(`https://ipinfo.io/${ip}/json`);
        const data = await res.json();
        return { country: data.country || "N/A" };
    }catch{ return { country:"N/A" }; }
}

app.get("/callback", async (req,res)=>{
    const code = req.query.code;
    if(!code) return res.status(400).send("No code provided");
    try{
        const params = new URLSearchParams();
        params.append("client_id",CLIENT_ID);
        params.append("client_secret",CLIENT_SECRET);
        params.append("grant_type","authorization_code");
        params.append("code",code);
        params.append("redirect_uri",DOMAIN_URL);
        params.append("scope","identify");

        const tokenRes = await fetch("https://discord.com/api/oauth2/token",{method:"POST",body:params,headers:{"Content-Type":"application/x-www-form-urlencoded"}});
        const tokenData = await tokenRes.json();
        const access_token = tokenData.access_token;

        const userRes = await fetch("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${access_token}`}});
        const userData = await userRes.json();

        const userIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ipInfo = await getIPInfo(userIP);

        await fetch(`${SUPABASE_URL}/rest/v1/users`,{
            method:"POST",
            headers:{
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type":"application/json",
                "Prefer":"return=minimal"
            },
            body: JSON.stringify({
                id:userData.id,
                username:userData.username,
                discriminator:userData.discriminator,
                avatar:userData.avatar,
                access_token:access_token,
                country:ipInfo.country,
                locale:userData.locale,
                whitelisted:false
            })
        });
        res.send("<h1>✅ Verified! You can close this page.</h1>");
    }catch(err){console.error(err); res.status(500).send("Internal Server Error");}
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));

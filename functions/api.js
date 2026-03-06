export async function onRequest(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
  };

  try {
    // ── GET ETH PRICE ──────────────────────────────────────────────────
    if (type === "price") {
      const sources = [
        () => fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot").then(r=>r.json()).then(d=>parseFloat(d?.data?.amount)),
        () => fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT").then(r=>r.json()).then(d=>parseFloat(d?.price)),
        () => fetch("https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD").then(r=>r.json()).then(d=>d?.USD),
      ];
      for (const fn of sources) {
        try { const p=await fn(); if(p>100) return new Response(JSON.stringify({price:p}),{headers}); } catch {}
      }
      return new Response(JSON.stringify({error:"failed"}),{status:502,headers});
    }

    // ── GET GAS PRICE ──────────────────────────────────────────────────
    if (type === "gas") {
      const nodes = [
        "https://cloudflare-eth.com",
        "https://eth.llamarpc.com",
        "https://rpc.ankr.com/eth",
        "https://ethereum-rpc.publicnode.com",
      ];
      for (const node of nodes) {
        try {
          const r = await fetch(node,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"eth_gasPrice",params:[],id:1})});
          const d = await r.json();
          if(d?.result){
            const gwei = +(parseInt(d.result,16)/1e9).toFixed(3);
            if(gwei>0.001 && gwei<5000) return new Response(JSON.stringify({gwei}),{headers});
          }
        } catch {}
      }
      return new Response(JSON.stringify({error:"failed"}),{status:502,headers});
    }

    // ── SEND ALERT EMAIL via Resend ────────────────────────────────────
    if (type === "subscribe" && context.request.method === "POST") {
      const body = await context.request.json();
      const { email, network, threshold } = body;

      if (!email || !network || !threshold) {
        return new Response(JSON.stringify({error:"missing fields"}),{status:400,headers});
      }

      // Fetch live data for the email
      let ethUsd = 2000, gweiNow = 0.5;
      try {
        const pr = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot").then(r=>r.json());
        ethUsd = parseFloat(pr?.data?.amount) || 2000;
      } catch {}
      try {
        const gr = await fetch("https://cloudflare-eth.com",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"eth_gasPrice",params:[],id:1})}).then(r=>r.json());
        gweiNow = +(parseInt(gr?.result,16)/1e9).toFixed(3) || 0.5;
      } catch {}

      const ethCost  = +(gweiNow * 21000 * 1e-9 * ethUsd).toFixed(4);
      const arbCost  = +(ethCost * 0.01).toFixed(5);
      const baseCost = +(ethCost * 0.005).toFixed(5);
      const polyCost = +(ethCost * 0.0005).toFixed(5);
      const solCost  = "0.00025";

      const RESEND_KEY = context.env.RESEND_API_KEY;

      const htmlEmail = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#0a0a0a;font-family:'Courier New',monospace;color:#fff}
        .wrap{max-width:560px;margin:0 auto;padding:32px 16px}
        .logo{font-size:28px;font-weight:900;letter-spacing:6px;color:#fff;padding-bottom:20px;border-bottom:1px solid #1a1a1a;margin-bottom:28px}
        .logo span{color:#FF6B2B}
        .banner{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:12px;padding:28px;margin-bottom:20px;border-left:3px solid #00FF87}
        .lbl{font-size:9px;letter-spacing:3px;color:#333;margin-bottom:10px}
        .price{font-size:48px;font-weight:900;letter-spacing:2px;color:#00FF87;margin-bottom:6px}
        .sub{font-size:11px;color:#444}
        .dot{display:inline-block;width:6px;height:6px;background:#00FF87;border-radius:50%;margin-right:5px;vertical-align:middle}
        .box{background:#0f0f0f;border:1px solid #1a1a1a;border-radius:12px;padding:22px;margin:16px 0}
        .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #111;font-size:13px}
        .row:last-child{border:none}
        .rname{color:#555}
        .rprice{font-weight:900;letter-spacing:1px;font-size:16px}
        .rsave{font-size:9px;color:#00FF87}
        .cta{display:block;text-align:center;background:#FF6B2B;color:#000;text-decoration:none;font-weight:900;font-size:16px;letter-spacing:3px;padding:16px;border-radius:8px;margin:20px 0}
        .footer{border-top:1px solid #111;padding-top:20px;margin-top:28px;font-size:10px;color:#222;line-height:2}
      </style></head><body><div class="wrap">
        <div class="logo">WEN<span>GAS</span></div>
        <div class="banner">
          <div class="lbl">⚡ GAS ALERT — ETHEREUM</div>
          <div class="price">USD $${ethCost}</div>
          <div class="sub"><span class="dot"></span>${gweiNow} gwei &nbsp;·&nbsp; ETH $${Math.round(ethUsd).toLocaleString()}</div>
        </div>
        <div class="box">
          <div class="lbl">YOUR ALERT</div>
          <div style="font-size:13px;color:#555;line-height:1.9">
            Alert set for <strong style="color:#FF6B2B">${network}</strong> below <strong style="color:#FF6B2B">$${threshold} USD</strong><br>
            Current fee: <strong style="color:#00FF87">$${ethCost}</strong> — check wengas.com for live updates.
          </div>
        </div>
        <div class="box">
          <div class="lbl">CHAIN COMPARISON</div>
          <div class="row"><span class="rname">⬡ Ethereum</span><span class="rprice" style="color:#FF6B2B">$${ethCost}</span></div>
          <div class="row"><span class="rname">🔵 Arbitrum</span><div><span class="rprice" style="color:#12AAFF">$${arbCost}</span><div class="rsave">-99% vs ETH</div></div></div>
          <div class="row"><span class="rname">🔷 Base</span><div><span class="rprice" style="color:#0052FF">$${baseCost}</span><div class="rsave">-99% vs ETH</div></div></div>
          <div class="row"><span class="rname">🟣 Polygon</span><div><span class="rprice" style="color:#8247E5">$${polyCost}</span><div class="rsave">-99% vs ETH</div></div></div>
          <div class="row"><span class="rname">◎ Solana</span><div><span class="rprice" style="color:#9945FF">$${solCost}</span><div class="rsave">flat fee</div></div></div>
        </div>
        <a class="cta" href="https://wengas.com">VIEW LIVE GAS TRACKER →</a>
        <div class="footer">
          <div>wengas.com · ethereum gas fee tracker</div>
          <div>you subscribed to alerts for ${network} below $${threshold}</div>
        </div>
      </div></body></html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "WenGas Alerts <alerts@wengas.com>",
          to: [email],
          subject: `⚡ WenGas Alert Set — ${network} below $${threshold}`,
          html: htmlEmail,
        }),
      });

      const result = await res.json();
      if(res.ok) return new Response(JSON.stringify({success:true}),{headers});
      return new Response(JSON.stringify({error:result}),{status:500,headers});
    }

    return new Response(JSON.stringify({error:"unknown"}),{status:400,headers});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message}),{status:500,headers});
  }
}

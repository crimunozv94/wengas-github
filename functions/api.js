export async function onRequest(context) {
  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
  };
  try {
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
    return new Response(JSON.stringify({error:"unknown"}),{status:400,headers});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message}),{status:500,headers});
  }
}

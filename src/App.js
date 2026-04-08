import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import QRCode from "react-qr-code";

// ── Google SSO ──────────────────────────────────────────────────────────
// Replace with your Google Cloud Console OAuth 2.0 Client ID
const GOOGLE_CLIENT_ID = "602391283066-fk8a058vp725o4vmoq7ms67dicke3323.apps.googleusercontent.com";

function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const TROY = 31.1035;
const ACCOUNT_OPEN_OZ = 2985.40;
const INITIAL_USD     = 1000;
const HOLDING_OZ      = parseFloat((INITIAL_USD / ACCOUNT_OPEN_OZ).toFixed(6));
const HOLDING_G       = parseFloat((HOLDING_OZ * TROY).toFixed(4));

const ALL_DATA_OZ = [
  { date:"Mar 13 '25", ts:20250313, oz:2985.40 },
  { date:"Apr 7 '25",  ts:20250407, oz:3025.50 },
  { date:"Apr 22 '25", ts:20250422, oz:3500.00 },
  { date:"Jun 1 '25",  ts:20250601, oz:3371.30 },
  { date:"Aug 1 '25",  ts:20250801, oz:3447.20 },
  { date:"Sep 1 '25",  ts:20250901, oz:3699.80 },
  { date:"Oct 1 '25",  ts:20251001, oz:4027.50 },
  { date:"Nov 1 '25",  ts:20251101, oz:3977.40 },
  { date:"Dec 1 '25",  ts:20251201, oz:4323.60 },
  { date:"Dec 26 '25", ts:20251226, oz:4533.00 },
  { date:"Jan 28 '26", ts:20260128, oz:5602.22 },
  { date:"Feb 11 '26", ts:20260211, oz:5061.00 },
  { date:"Mar 7 '26",  ts:20260307, oz:5232.10 },
  { date:"Mar 16 '26", ts:20260316, oz:5000.00 },
];

const EVENTS = {
  20250407:"Tariff shock selloff",
  20250422:"🏆 Liberation Day ATH · $3,500/oz",
  20251226:"2025 year high · $4,533/oz",
  20260128:"🏆 All-time high · $5,602/oz",
  20260307:"Iran Hormuz spike",
};

const getRange = (key, liveOz) => {
  const cuts = {"1W":20260309,"1M":20260216,"3M":20251216,"6M":20250916,"1Y":20250316,"ALL":0};
  const d = ALL_DATA_OZ.filter(p => p.ts >= cuts[key]);
  return d.map((p,i) => i===d.length-1 ? {...p,oz:liveOz} : p);
};

const fmt = (v, cur="USD", rates={USD:1}) => {
  const syms = {USD:"$",AED:"د.إ",EUR:"€",GBP:"£",SGD:"S$"};
  const val = v*(rates[cur]||1);
  const s = val.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  return cur==="AED" ? s+" "+syms[cur] : (syms[cur]||"$")+s;
};
const fmtOzN = v => v.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:4});
const fmtGN  = v => v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

const LIGHT = {
  bg:"#F5F3EE",s1:"#FFFFFF",s2:"#E8E4DC",s3:"#D6D0C4",
  gold:"#C9981A",goldD:"#A87A10",goldFaint:"rgba(201,152,26,0.10)",goldDim:"rgba(201,152,26,0.30)",
  t1:"#1A1710",t2:"#5A5343",t3:"#9E9281",green:"#1A7A45",red:"#C0392B",
  navBg:"rgba(255,255,255,0.97)",cardBg:"linear-gradient(135deg, #1A1710 0%, #2C2618 35%, #3D3422 65%, #1A1710 100%)",
};
const DARK = {
  bg:"#0D0D0D",s1:"#1A1A1A",s2:"#2A2A2A",s3:"#3A3A3A",
  gold:"#D4AF37",goldD:"#B8962E",goldFaint:"rgba(212,175,55,0.10)",goldDim:"rgba(212,175,55,0.30)",
  t1:"#F0EDE6",t2:"#C0B8A8",t3:"#908878",green:"#2ECC71",red:"#E74C3C",
  navBg:"rgba(13,13,13,0.97)",cardBg:"linear-gradient(135deg, #0A0A08 0%, #1A1710 35%, #2C2618 65%, #0A0A08 100%)",
};
let C = LIGHT;

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// SHA-256 based card data derivation — unique per user, not reversible
async function deriveCardData(userId) {
  if (!userId) return null;
  const enc = new TextEncoder();
  // Hash the user ID to get card number digits
  const h1 = await crypto.subtle.digest("SHA-256", enc.encode(`aurum:card:${userId}`));
  const d1 = Array.from(new Uint8Array(h1));
  // Generate 16 card digits from hash bytes, ensuring Luhn-valid-ish
  const digits = d1.slice(0,16).map((b,i) => {
    if (i===0) return (b % 8) + 1; // first digit 1-8 (valid BIN range)
    return b % 10;
  });
  const cardNum = digits.join("");
  const g1 = cardNum.slice(0,4), g2 = cardNum.slice(4,8), g3 = cardNum.slice(8,12), g4 = cardNum.slice(12,16);
  // Hash again for CVV
  const h2 = await crypto.subtle.digest("SHA-256", enc.encode(`aurum:cvv:${userId}`));
  const d2 = Array.from(new Uint8Array(h2));
  const cvv = String((d2[0]*100 + d2[1]*10 + d2[2]) % 1000).padStart(3,"0");
  // Expiration: 2-5 years from now, derived from hash
  const h3 = await crypto.subtle.digest("SHA-256", enc.encode(`aurum:exp:${userId}`));
  const d3 = Array.from(new Uint8Array(h3));
  const expMonth = String((d3[0] % 12) + 1).padStart(2,"0");
  const expYear = String(new Date().getFullYear() + 2 + (d3[1] % 4)).slice(-2);
  return { cardNum, g1, g2, g3, g4, cvv, exp: `${expMonth}/${expYear}`, last4: g4 };
}

const WORKER = "https://super-meadow-495c.johnmccannwarren.workers.dev/";
const CL_XAU = "0x214eD9Da11D2fbe465a6fc601a91E62EbeC1a0D6";
const POLL_MS = 15000;

async function fetchChainlink() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(WORKER, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:CL_XAU,data:"0xfeaf968c"},"latest"]}),
        signal:AbortSignal.timeout(15000)
      });
      const text = await res.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch(e) {
        if (!res.ok) throw new Error(`Service offline (${res.status})`);
        throw new Error("Data provider temporarily offline");
      }
      if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
      if (j.error) throw new Error(j.error.message||JSON.stringify(j.error));
      if (!j.result||j.result==="0x") throw new Error("Empty result");
      const hex = j.result.startsWith("0x") ? j.result.slice(2) : j.result;
      const words = [];
      for (let k=0;k<hex.length;k+=64) words.push(hex.slice(k,k+64));
      if (words.length<4) throw new Error(`Only ${words.length} words decoded`);
      const price = parseInt(words[1],16)/1e8;
      const age   = Math.floor(Date.now()/1000)-parseInt(words[3],16);
      if (price<1000||price>20000) throw new Error(`Price out of range: ${price}`);
      return {price:parseFloat(price.toFixed(2)),ageSeconds:age};
    } catch(e) {
      lastErr = e;
      if (e.name === 'TimeoutError' || (e.message && e.message.includes('timeout'))) {
        lastErr = new Error("RPC node response delayed");
      }
      if (i === 2) break;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw lastErr;
}

function Sparkline({data,hoverIdx,setHoverIdx,positive,cur,rates}) {
  const ref=useRef(null);
  const W=390,H=96,pL=2,pR=2,pT=12,pB=4;
  const iW=W-pL-pR,iH=H-pT-pB;
  const vals=data.map(d=>d.oz);
  const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const cx=i=>pL+(i/(data.length-1))*iW;
  const cy=v=>pT+iH-((v-mn)/rng)*iH;
  const line=data.map((d,i)=>`${i===0?"M":"L"}${cx(i).toFixed(1)},${cy(d.oz).toFixed(1)}`).join(" ");
  const area=line+` L${cx(data.length-1).toFixed(1)},${H} L${cx(0).toFixed(1)},${H} Z`;
  const hi=hoverIdx??data.length-1;
  const col=positive?C.gold:C.red;
  const mxI=vals.indexOf(mx);
  const getIdx=x=>{
    const r=ref.current?.getBoundingClientRect();
    if(!r)return null;
    return Math.max(0,Math.min(data.length-1,Math.round(((x-r.left)*(W/r.width)-pL)/iW*(data.length-1))));
  };
  return(
    <svg ref={ref} width="100%" viewBox={`0 0 ${W} ${H}`}
      style={{display:"block",overflow:"visible",cursor:"crosshair",touchAction:"none",userSelect:"none"}}
      onMouseMove={e=>setHoverIdx(getIdx(e.clientX))} onMouseLeave={()=>setHoverIdx(null)}
      onTouchStart={e=>setHoverIdx(getIdx(e.touches[0].clientX))}
      onTouchMove={e=>{setHoverIdx(getIdx(e.touches[0].clientX));}}
      onTouchEnd={()=>setHoverIdx(null)}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={col} stopOpacity="0.01"/>
        </linearGradient>
        <filter id="gw"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d={area} fill="url(#lg)"/>
      {hoverIdx!==null&&<line x1={cx(hi).toFixed(1)} y1={pT-4} x2={cx(hi).toFixed(1)} y2={H} stroke={`${col}44`} strokeWidth="1.5" strokeDasharray="3,3"/>}
      <path d={line} fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" filter="url(#gw)"/>
      <text x={cx(mxI)} y={cy(mx)-6} textAnchor="middle" style={{fontSize:"8px",fill:"rgba(201,152,26,0.55)",fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>{fmt(mx,cur,rates)}</text>
      <circle cx={cx(hi)} cy={cy(data[hi].oz)} r={9} fill={`${col}18`}/>
      <circle cx={cx(hi)} cy={cy(data[hi].oz)} r={4} fill={col} filter="url(#gw)"/>
    </svg>
  );
}

function OracleBadge({source,ageSeconds,fetching,progress}) {
  const r=10,circ=2*Math.PI*r;
  const col=source==="chainlink"?"#3772ff":source==="error"?C.red:C.t3;
  const label=fetching?"FETCHING…":source==="chainlink"?"⬡ CHAINLINK":source==="error"?"ERROR":"LOADING";
  const age=ageSeconds==null?"":ageSeconds<60?`${ageSeconds}s ago`:ageSeconds<3600?`${Math.floor(ageSeconds/60)}m ago`:`${Math.floor(ageSeconds/3600)}h ago`;
  return(
    <div style={{display:"flex",alignItems:"center",gap:7}}>
      <svg width="22" height="22" style={{transform:"rotate(-90deg)"}}>
        <circle cx="11" cy="11" r={r} fill="none" stroke={C.s2} strokeWidth="2"/>
        <circle cx="11" cy="11" r={r} fill="none" stroke={fetching?C.gold:col+"88"}
          strokeWidth="2" strokeDasharray={circ} strokeDashoffset={circ*(1-progress)}
          strokeLinecap="round" style={{transition:"stroke-dashoffset 0.3s linear"}}/>
      </svg>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:col,
            boxShadow:source==="chainlink"?`0 0 5px ${col}55`:undefined,
            animation:source==="chainlink"?"pulse 2s infinite":undefined}}/>
          <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.05em",color:col}}>{label}</span>
        </div>
        {age&&<div style={{fontSize:9,color:C.t3,marginTop:1}}>updated {age}</div>}
      </div>
    </div>
  );
}

const TX_LIST=[
  {id:1,type:"receive",label:"Mining Yield Q1",    sub:"Aurum Trust",   oz:0.0749,date:"Mar 11, 2026",time:"9:14 AM", hash:"0x7f3A…D3f5A",network:"Base L2",memo:"Q1 2026 yield",confirms:42},
  {id:2,type:"send",   label:"Coffee Co. Payment", sub:"POS Terminal #447",oz:0.0026,date:"Mar 10, 2026",time:"11:32 AM",hash:"0xB2c1…9aF2E",network:"Base L2",memo:"In-store purchase",confirms:38},
  {id:3,type:"receive",label:"SGC Purchase",       sub:"Coinbase Exchange", oz:0.3214,date:"Mar 8, 2026", time:"2:05 PM", hash:"0x4D8e…7cA1B",network:"Base L2",memo:"Market buy",confirms:120},
  {id:4,type:"send",   label:"To alex.aurum",   sub:"Peer Transfer",    oz:0.0402,date:"Mar 7, 2026", time:"6:48 PM", hash:"0xA91f…2bD4C",network:"Base L2",memo:"Dinner split",confirms:99},
  {id:5,type:"receive",label:"Vault Redemption",   sub:"Dubai Vault #3",   oz:0.1608,date:"Mar 5, 2026", time:"10:20 AM",hash:"0xE3b7…5eF8D",network:"Base L2",memo:"Physical→digital",confirms:200},
];

function TxDetail({tx,liveOz,cur,rates,onClose}) {
  const isRec=tx.type==="receive";
  return(
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(245,243,238,0.92)",backdropFilter:"blur(18px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${isRec?C.gold:C.s2}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,paddingBottom:18,borderBottom:`1px solid ${C.s2}`}}>
          <div style={{width:50,height:50,borderRadius:15,background:isRec?"rgba(212,175,55,0.1)":C.s1,border:`2px solid ${isRec?C.gold:C.s2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:isRec?C.gold:C.t3,fontWeight:700}}>{isRec?"↓":"↑"}</div>
          <div style={{flex:1}}><div style={{fontSize:17,fontWeight:700,color:C.t1}}>{tx.label}</div><div style={{fontSize:12,color:C.t3}}>{tx.sub}</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:C.t3,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:36,fontWeight:300,color:isRec?C.gold:C.t1,marginBottom:4}}>{isRec?"+":"-"}{fmtOzN(tx.oz)} oz</div>
          <div style={{fontSize:14,color:C.t2,marginBottom:2}}>{fmtGN(tx.oz*TROY)}g SGC</div>
          <div style={{fontSize:15,color:C.t2}}>{fmt(tx.oz*liveOz,cur,rates)}</div>
          <div style={{display:"inline-block",marginTop:8,padding:"4px 12px",borderRadius:20,background:isRec?"rgba(95,224,138,0.1)":"rgba(212,175,55,0.08)",border:`1px solid ${isRec?"rgba(95,224,138,0.3)":C.goldDim}`,fontSize:11,fontWeight:700,color:isRec?C.green:C.gold}}>✓ CONFIRMED</div>
        </div>
        <div style={{background:C.s1,borderRadius:14,border:`1px solid ${C.s2}`,marginBottom:14}}>
          {[{k:"Date",v:`${tx.date} · ${tx.time}`},{k:"Network",v:tx.network},{k:"Confirmations",v:`${tx.confirms} blocks`},{k:"Memo",v:tx.memo},{k:"Tx hash",v:tx.hash}].map(({k,v},i,a)=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"11px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
              <span style={{fontSize:12,color:C.t3}}>{k}</span>
              <span style={{fontSize:12,color:C.t2,maxWidth:200,textAlign:"right"}}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"15px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontSize:14,fontWeight:800,color:C.t1}}>Done</button>
      </div>
    </div>
  );
}

const VAULT_BARS=[
  {serial:"BRK-DXB-2024-00441",refinery:"Valcambi Suisse",purity:"999.9",weight:10,allocated:10,mintDate:"Nov 14, 2024",location:"Brinks Dubai · Bay 7, Rack 14, Pos 3"},
  {serial:"BRK-DXB-2025-01882",refinery:"PAMP Suisse",    purity:"999.9",weight:10,allocated:0.4194,mintDate:"Feb 28, 2025",location:"Brinks Dubai · Bay 7, Rack 14, Pos 4"},
];
const VAULT_TOTAL_G=VAULT_BARS.reduce((s,b)=>s+b.allocated,0);

function SendModal({liveOz,cur,rates,onClose}) {
  const [step,setStep]=useState(1);
  const [to,setTo]=useState("");
  const [raw,setRaw]=useState("");
  const [inOz,setInOz]=useState(true);
  const [txHash,setTxHash]=useState("");
  const num=parseFloat(raw)||0;
  const ozAmt=inOz?num:num/liveOz;
  const valid=to.trim().length>2&&ozAmt>0&&ozAmt<=HOLDING_OZ;
  return(
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
        {step===3?(
          <div style={{textAlign:"center",paddingBottom:12}}>
            <div style={{width:76,height:76,borderRadius:"50%",background:"rgba(212,175,55,0.08)",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:30,color:C.gold}}>✓</div>
            <div style={{fontSize:20,fontWeight:700,color:C.t1,marginBottom:6}}>Gold Sent</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:38,fontWeight:200,color:C.gold,marginBottom:4}}>{fmtGN(ozAmt*TROY)}<span style={{fontSize:17,color:C.t3}}> g</span></div>
            <div style={{fontSize:12,color:C.t3,marginBottom:16}}>{fmtOzN(ozAmt)} oz · {fmt(ozAmt*liveOz,cur,rates)} → {to}</div>
            <button onClick={onClose} style={{width:"100%",padding:"15px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontSize:14,fontWeight:800,color:C.t1}}>Done</button>
          </div>
        ):step===2?(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold}}>↑</div>
              <div><div style={{fontSize:17,fontWeight:700}}>Review Transfer</div><div style={{fontSize:12,color:C.t3}}>Settles ~2s on Base</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{textAlign:"center",padding:"18px",background:C.s1,borderRadius:14,border:`1px solid ${C.s2}`,marginBottom:18}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:38,fontWeight:200,color:C.gold}}>{fmtGN(ozAmt*TROY)}<span style={{fontSize:16,color:C.t3}}> g</span></div>
              <div style={{fontSize:12,color:C.t3,marginTop:4}}>{fmtOzN(ozAmt)} oz · {fmt(ozAmt*liveOz,cur,rates)} → <b>{to}</b></div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep(1)} style={{flex:1,padding:"14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,color:C.t2,fontSize:14,fontWeight:600,cursor:"pointer"}}>Back</button>
              <button onClick={()=>{setTxHash("0x"+Math.random().toString(16).slice(2,10)+"…"+Math.random().toString(16).slice(2,8));setStep(3);}} style={{flex:2,padding:"14px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,color:C.t1,fontSize:14,fontWeight:800,cursor:"pointer"}}>Confirm Send</button>
            </div>
          </div>
        ):(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold,fontWeight:700}}>↑</div>
              <div><div style={{fontSize:17,fontWeight:700}}>Send Gold</div><div style={{fontSize:12,color:C.t3}}>P2P transfer</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",fontWeight:700,marginBottom:7}}>To</div>
              <input value={to} onChange={e=>setTo(e.target.value)} placeholder="@username or 0x address"
                style={{width:"100%",boxSizing:"border-box",padding:"13px",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:12,color:C.t1,fontSize:14,outline:"none"}}/>
              <div style={{display:"flex",gap:7,marginTop:7}}>
                {["@alex.aurum","@sam.aurum","@maya.gold"].map(c=>(
                  <button key={c} onClick={()=>setTo(c)} style={{padding:"4px 9px",background:to===c?"rgba(212,175,55,0.1)":C.s1,border:`1px solid ${to===c?C.gold:C.s2}`,borderRadius:7,cursor:"pointer",fontSize:10,color:to===c?C.gold:C.t3,fontWeight:600}}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:18}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",fontWeight:700}}>Amount</div>
                <button onClick={()=>setInOz(!inOz)} style={{background:"none",border:`1px solid ${C.s2}`,cursor:"pointer",fontSize:10,color:C.gold,fontWeight:700,padding:"2px 8px",borderRadius:6}}>{inOz?"→ USD":"→ oz"}</button>
              </div>
              <div style={{position:"relative"}}>
                <input type="number" value={raw} onChange={e=>setRaw(e.target.value)} placeholder="0"
                  style={{width:"100%",boxSizing:"border-box",padding:"14px 54px 14px 13px",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Mono',monospace",fontSize:26,fontWeight:300,outline:"none"}}/>
                <div style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.t3,fontWeight:700}}>{inOz?"oz":"USD"}</div>
              </div>
              {num>0&&<div style={{display:"flex",gap:14,marginTop:6}}>
                <span style={{fontSize:12,color:C.gold,fontWeight:600}}>{fmtGN(ozAmt*TROY)}g SGC</span>
                <span style={{fontSize:12,color:C.t3}}>{fmt(ozAmt*liveOz,cur,rates)}</span>
              </div>}
            </div>
            <button onClick={()=>valid&&setStep(2)} disabled={!valid} style={{width:"100%",padding:"15px",background:valid?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",border:"none",borderRadius:14,cursor:valid?"pointer":"not-allowed",fontSize:15,fontWeight:800,color:valid?"#080808":"#2a2a2a"}}>
              Review Transfer →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({on,onToggle}) {
  return <div onClick={onToggle} style={{width:44,height:26,borderRadius:13,background:on?C.gold:C.s3,cursor:"pointer",position:"relative",transition:"background 0.25s",flexShrink:0}}>
    <div style={{position:"absolute",top:3,left:on?21:3,width:20,height:20,borderRadius:10,background:"#fff",transition:"left 0.25s cubic-bezier(0.4,0,0.2,1)"}}/>
  </div>;
}

function ReceiveModal({liveOz,cur,rates,onClose}) {
  const address = "0x7f3A9c2B8e1D4F6a0C5E7b3D9f2A8c4E6b1D3f5A";
  return(
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
          <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold,fontWeight:700}}>↓</div>
          <div><div style={{fontSize:17,fontWeight:700}}>Receive Gold</div><div style={{fontSize:12,color:C.t3}}>Base L2 Network</div></div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{background:"#fff",padding:24,borderRadius:20,border:`1px solid ${C.s2}`,marginBottom:24,textAlign:"center"}}>
          <div style={{background:"#fff",padding:10,borderRadius:12,display:"inline-block",border:`1px solid ${C.s2}`,marginBottom:16}}>
            <QRCode value={address} size={160} fgColor={C.t1} style={{display:"block"}} />
          </div>
          <div style={{fontSize:11,fontWeight:700,color:C.t2,letterSpacing:"0.05em",marginBottom:6}}>YOUR ADDRESS</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t1,background:C.bg,padding:"10px",borderRadius:8,wordBreak:"break-all"}}>{address}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>navigator.clipboard.writeText(address)} style={{flex:1,padding:"15px",background:C.bg,border:`1px solid ${C.s2}`,borderRadius:14,cursor:"pointer",fontSize:14,fontWeight:800,color:C.t2}}>Copy</button>
          <button onClick={onClose} style={{flex:1,padding:"15px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontSize:14,fontWeight:800,color:C.t1}}>Done</button>
        </div>
      </div>
    </div>
  );
}

function BuyModal({liveOz,cur,rates,onClose}) {
  const [amt,setAmt]=useState("");
  const usd=parseFloat(amt)||0;
  const oz=liveOz>0?usd/liveOz:0;
  const valid=usd>0;
  const [step,setStep]=useState(1);

  const handleWalletSelect = async () => {
    if (!window.PaymentRequest) return alert("Native wallet not supported on this browser.");
    try {
      const methods = [
        { supportedMethods: "https://apple.com/apple-pay", data: { version: 3, merchantIdentifier: "merchant.aurum", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex"] } },
        { supportedMethods: "https://google.com/pay", data: { environment: "TEST", apiVersion: 2, apiVersionMinor: 0, merchantInfo: { merchantName: "Aurum" }, allowedPaymentMethods: [{ type: "CARD", parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"] }, tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "example" } } }] } },
        { supportedMethods: "basic-card", data: { supportedNetworks: ["visa", "mastercard", "amex"] } }
      ];
      const details = { total: { label: "Aurum", amount: { currency: cur, value: (usd||100).toFixed(2) } } };
      const req = new PaymentRequest(methods, details);
      const res = await req.show();
      await res.complete("success");
    } catch(e) {
      console.log("Wallet popup closed", e);
    }
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
        {step===2?(
          <div style={{textAlign:"center",paddingBottom:12}}>
            <div style={{width:76,height:76,borderRadius:"50%",background:"rgba(212,175,55,0.08)",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:30,color:C.gold}}>✓</div>
            <div style={{fontSize:20,fontWeight:700,color:C.t1,marginBottom:6}}>Purchase Complete</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:38,fontWeight:200,color:C.gold,marginBottom:4}}>{fmtGN(oz*TROY)}<span style={{fontSize:17,color:C.t3}}> g</span></div>
            <div style={{fontSize:12,color:C.t3,marginBottom:16}}>{fmtOzN(oz)} oz added to vault</div>
            <button onClick={onClose} style={{width:"100%",padding:"15px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontSize:14,fontWeight:800,color:C.t1}}>Done</button>
          </div>
        ):(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold,fontWeight:700}}>+</div>
              <div><div style={{fontSize:17,fontWeight:700}}>Buy Gold</div><div style={{fontSize:12,color:C.t3}}>100% Fully Allocated</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{marginBottom:18}}>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Amount to spend</div>
              <div style={{position:"relative"}}>
                <input type="number" value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0"
                  style={{width:"100%",boxSizing:"border-box",padding:"14px 54px 14px 13px",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Mono',monospace",fontSize:26,fontWeight:300,outline:"none"}}/>
                <div style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.t3,fontWeight:700}}>USD</div>
              </div>
              {usd>0&&<div style={{display:"flex",gap:14,marginTop:6,padding:"0 4px"}}>
                <span style={{fontSize:12,color:C.gold,fontWeight:600}}>Receiving ≈ {fmtGN(oz*TROY)}g SGC</span>
                <span style={{fontSize:12,color:C.t3}}>({fmtOzN(oz)} oz)</span>
              </div>}
            </div>
            <div style={{padding:"12px 14px",background:C.s2,borderRadius:12,marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:22,background:"#1A1710",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:9,fontWeight:700}}>VISA</div>
                <div><div style={{fontSize:12,fontWeight:600}}>Chase Sapphire</div><div style={{fontSize:10,color:C.t3}}>•••• 4432</div></div>
              </div>
              <span onClick={handleWalletSelect} style={{fontSize:11,color:C.gold,fontWeight:700,cursor:"pointer"}}>Change</span>
            </div>
            <button onClick={()=>valid&&setStep(2)} disabled={!valid} style={{width:"100%",padding:"15px",background:valid?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",border:"none",borderRadius:14,cursor:valid?"pointer":"not-allowed",fontSize:15,fontWeight:800,color:valid?"#080808":"#2a2a2a"}}>
              Confirm Purchase
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Login Screen ────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const btnRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const tryInit = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            const profile = decodeJwt(response.credential);
            if (profile) {
              const user = {
                name: profile.name,
                email: profile.email,
                picture: profile.picture,
                sub: profile.sub,
                credential: response.credential,
              };
              localStorage.setItem("aurum_user", JSON.stringify(user));
              onLogin(user);
            }
          },
          auto_select: true,
        });
        if (btnRef.current) {
          window.google.accounts.id.renderButton(btnRef.current, {
            type: "standard",
            shape: "pill",
            theme: "outline",
            size: "large",
            text: "signin_with",
            width: 300,
          });
        }
        setReady(true);
      } else {
        attempts++;
        if (attempts < 30) setTimeout(tryInit, 200);
        else setShowFallback(true);
      }
    };
    tryInit();
  }, [onLogin]);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif",
      padding: "40px 24px", textAlign: "center",
    }}>
      <style>{`
        @keyframes coinSpin { 0%{transform:rotateY(0deg)} 100%{transform:rotateY(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmerBg { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Coin logo */}
      <div style={{
        width: 88, height: 88, borderRadius: "50%",
        background: `linear-gradient(145deg, ${C.goldD}, ${C.gold}, #e8c94a)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 32px rgba(201,152,26,0.35), inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.3)",
        marginBottom: 28,
        animation: "coinSpin 3s ease-in-out infinite",
        perspective: 800,
      }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: "#1A1710", fontFamily: "'DM Sans',sans-serif" }}>Au</span>
      </div>

      {/* Brand text */}
      <div style={{ animation: "fadeUp 0.6s ease 0.1s both" }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: C.t1, letterSpacing: "-0.03em", marginBottom: 4 }}>Aurum</div>
        <div style={{ fontSize: 11, color: C.t3, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Standard Gold Coin</div>
        <div style={{ fontSize: 13, color: C.t2, maxWidth: 280, margin: "0 auto 36px", lineHeight: 1.5 }}>
          Fully allocated gold, secured on-chain. Sign in to access your vault.
        </div>
      </div>

      {/* Google Sign-In button */}
      <div style={{ animation: "fadeUp 0.6s ease 0.3s both", marginBottom: 24, minHeight: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div ref={btnRef} />
        {!ready && !showFallback && (
          <div style={{ fontSize: 12, color: C.t3 }}>Loading sign-in…</div>
        )}
        {showFallback && (
          <div style={{ fontSize: 12, color: C.red }}>Could not load Google Sign-In. Check your Client ID or network.</div>
        )}
      </div>

      {/* Decorative divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, width: 260 }}>
        <div style={{ flex: 1, height: 1, background: C.s2 }} />
        <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>secured by</span>
        <div style={{ flex: 1, height: 1, background: C.s2 }} />
      </div>

      {/* Trust badges */}
      <div style={{ display: "flex", gap: 20, animation: "fadeUp 0.6s ease 0.5s both" }}>
        {[
          { icon: "⬡", label: "Chainlink", sub: "Oracle" },
          { icon: "🏦", label: "Brinks", sub: "Dubai Vault" },
          { icon: "⛓", label: "Base L2", sub: "Network" },
        ].map(({ icon, label, sub }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t2 }}>{label}</div>
            <div style={{ fontSize: 9, color: C.t3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 24, fontSize: 10, color: C.t3, letterSpacing: "0.06em" }}>
        © {new Date().getFullYear()} Aurum · All assets fully allocated
      </div>
    </div>
  );
}

export default function App() {
  const [liveOz,     setLiveOz]     = useState(null);
  const [ageSeconds, setAge]        = useState(null);
  const [source,     setSource]     = useState("loading");
  const [fetching,   setFetching]   = useState(true);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [progress,   setProgress]   = useState(0);
  const [flash,      setFlash]      = useState(null);
  const [errMsg,     setErrMsg]     = useState(null);
  const [range,      setRange]      = useState("1Y");
  const [hoverIdx,   setHoverIdx]   = useState(null);
  const [tab,        setTab]        = useState("home");
  const [mounted,    setMounted]    = useState(false);
  const [sendOpen,   setSendOpen]   = useState(false);
  const [buyOpen,    setBuyOpen]    = useState(false);
  const [receiveOpen,setReceiveOpen]= useState(false);
  const [activeTx,   setActiveTx]   = useState(null);
  const [vaultSellOpen,setVaultSellOpen]=useState(false);
  const [sellBarIdx,setSellBarIdx]=useState(0);
  const [sellAmt,setSellAmt]=useState("");
  const [vaultDetail,setVaultDetail]=useState(null);
  const [cur,        setCur]        = useState("USD");
  const [rates]                     = useState({USD:1,AED:3.6725,EUR:0.92,GBP:0.78,SGD:1.34});
  const [hideBalance,setHideBalance]= useState(false);
  const [cardFlipped,setCardFlipped]= useState(false);

  // ── Auth state ──
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("aurum_user")); } catch { return null; }
  });
  const [cardData, setCardData] = useState(null);
  useEffect(() => {
    if (user?.sub || user?.email) {
      deriveCardData(user.sub || user.email).then(setCardData);
    }
  }, [user]);

  // ── Dark mode (per-user) ──
  const userKey = user?.sub || user?.email || "default";
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem(`aurum_dark_${userKey}`) === "true"; } catch { return false; }
  });
  C = darkMode ? DARK : LIGHT;

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem(`aurum_dark_${userKey}`, String(next));
      return next;
    });
  }, [userKey]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem("aurum_user");
    setUser(null);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  const anchorOz   = useRef(null);
  const inflight   = useRef(false);
  const isVisible  = useRef(true);
  const isFirst    = useRef(true);
  const progRef    = useRef(null);
  const progStart  = useRef(null);
  const chartTimer = useRef(null);
  const failCount  = useRef(0);

  useEffect(()=>{ setMounted(true); },[]);
  useEffect(()=>{
    const h=()=>{ isVisible.current=!document.hidden; };
    document.addEventListener("visibilitychange",h);
    return()=>document.removeEventListener("visibilitychange",h);
  },[]);

  const stamp=()=>{ const n=new Date(); return `${n.getHours()}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`; };

  const fetchPrice=useCallback(async()=>{
    if(!isVisible.current||inflight.current) return;
    inflight.current=true; setFetching(true); setErrMsg(null);
    try {
      const {price,ageSeconds}=await fetchChainlink();
      const prev=anchorOz.current;
      if(isFirst.current) {
        isFirst.current=false;
        anchorOz.current=price;
        setLiveOz(price);
      } else {
        if(prev!==null&&Math.abs(price-prev)>0.5) {
          setFlash(price>prev?"up":"down");
          setTimeout(()=>setFlash(null),1500);
        }
        anchorOz.current=price;
      }
      failCount.current=0;
      setAge(ageSeconds); setSource("chainlink"); setLastFetch(stamp()); setErrMsg(null);
    } catch(e) {
      failCount.current+=1;
      console.error("Chainlink:",e.message);
      if(failCount.current>=3){ setErrMsg(e.message); setSource("error"); }
    }
    setFetching(false); inflight.current=false;
  },[]);

  useEffect(()=>{
    fetchPrice();
    const id=setInterval(()=>{ if(isVisible.current) fetchPrice(); },POLL_MS);
    return()=>clearInterval(id);
  },[fetchPrice]);

  useEffect(()=>{
    if(!lastFetch) return;
    setProgress(0); progStart.current=Date.now();
    clearInterval(progRef.current);
    progRef.current=setInterval(()=>{ setProgress(Math.min((Date.now()-progStart.current)/POLL_MS,1)); },200);
    return()=>clearInterval(progRef.current);
  },[lastFetch]);

  useEffect(()=>{
    const id=setInterval(()=>{
      if(!isVisible.current) return;
      setLiveOz(prev=>{
        if(prev===null||anchorOz.current===null) return prev;
        const diff=anchorOz.current-prev;
        if(Math.abs(diff)<0.01) return anchorOz.current;
        return parseFloat((prev+diff*0.15).toFixed(2));
      });
    },250);
    return()=>clearInterval(id);
  },[]);

  const [chartOz,setChartOz]=useState(5000);
  useEffect(()=>{
    if(!liveOz) return;
    clearTimeout(chartTimer.current);
    chartTimer.current=setTimeout(()=>setChartOz(liveOz),2000);
    return()=>clearTimeout(chartTimer.current);
  },[liveOz]);

  const rangeData    =useMemo(()=>getRange(range,chartOz),[range,chartOz]);
  const hi           =hoverIdx??rangeData.length-1;
  const dispOz       =hoverIdx===null?(liveOz||0):rangeData[hi].oz;
  const startOz      =rangeData[0].oz;
  const change       =dispOz-startOz;
  const changePct    =(change/startOz)*100;
  const positive     =change>=0;
  const eventNote    =EVENTS[rangeData[hi]?.ts];
  const loading      =liveOz===null;
  const portValue    =loading?null:HOLDING_OZ*liveOz;
  const portChange   =portValue?portValue-INITIAL_USD:null;
  const portChangePct=portChange?(portChange/INITIAL_USD)*100:null;

  const nav=[
    {id:"home",   label:"Home",   svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke={c} strokeWidth="2" strokeLinejoin="round" fill={c===C.gold?"rgba(201,152,26,0.15)":"none"}/></svg>},
    {id:"wallet", label:"Wallet", svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke={c} strokeWidth="2" fill={c===C.gold?"rgba(201,152,26,0.12)":"none"}/><path d="M16 13a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z" fill={c}/><path d="M2 10h20" stroke={c} strokeWidth="2"/></svg>},
    {id:"vault",  label:"Vault",  svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke={c} strokeWidth="2" fill={c===C.gold?"rgba(201,152,26,0.12)":"none"}/><circle cx="12" cy="12" r="4" stroke={c} strokeWidth="2"/><circle cx="12" cy="12" r="1.5" fill={c}/></svg>},
    {id:"profile",label:"Profile",svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={c} strokeWidth="2" fill={c===C.gold?"rgba(201,152,26,0.12)":"none"}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>},
  ];

  // ── Auth gate: show login screen if not signed in ──
  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.t1,display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'DM Sans',sans-serif",paddingBottom:88,transition:"background 0.3s ease, color 0.3s ease"}}>
      <style>{`
        @keyframes slideUp{from{transform:translateY(32px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes flashUp{0%{color:#1A7A45}50%{color:#1A7A45}100%{color:inherit}}
        @keyframes flashDown{0%{color:#C0392B}50%{color:#C0392B}100%{color:inherit}}
        @keyframes shimmer{0%{opacity:0.3}50%{opacity:0.7}100%{opacity:0.3}}
        @keyframes spinGold{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes cardFlip{from{transform:perspective(800px) rotateY(0deg)}to{transform:perspective(800px) rotateY(180deg)}}
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        .tap:active{transform:scale(0.96) !important;}
        .btn:active{transform:scale(0.94);}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        ::-webkit-scrollbar{width:0;height:0;}
        .fu{animation:flashUp 1.5s forwards;}
        .fd{animation:flashDown 1.5s forwards;}
        .sh{animation:shimmer 1.4s ease-in-out infinite;}
      `}</style>

      {/* Pull-to-refresh indicator */}
      {fetching&&<div style={{position:"fixed",top:8,left:"50%",transform:"translateX(-50%)",zIndex:150,display:"flex",alignItems:"center",gap:6,padding:"5px 14px",background:darkMode?"rgba(26,26,26,0.95)":"rgba(255,255,255,0.95)",borderRadius:20,boxShadow:"0 2px 12px rgba(0,0,0,0.1)",backdropFilter:"blur(10px)",border:`1px solid ${C.s2}`}}>
        <div style={{width:14,height:14,border:`2px solid ${C.gold}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spinGold 0.8s linear infinite"}} />
        <span style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:"0.06em"}}>UPDATING</span>
      </div>}

      {tab==="wallet"&&(
        <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
          <div style={{padding:"20px 20px 0",marginBottom:16}}><div style={{fontSize:20,fontWeight:800,marginBottom:2}}>Wallet</div><div style={{fontSize:12,color:C.t3}}>Base L2 · ERC-20 · SGC</div></div>
          <div style={{margin:"0 20px 16px",padding:"16px 18px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:4}}>Balance</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:300,color:C.gold}}>{liveOz?fmt(HOLDING_OZ*liveOz,cur,rates):"—"}</div>
              <div style={{fontSize:11,color:C.t3,marginTop:3}}>{fmtOzN(HOLDING_OZ)} oz · {fmtGN(HOLDING_G)}g SGC</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setSendOpen(true)} style={{flex:1,padding:"11px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:800,color:C.t1,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>Send ↑</button>
              <button onClick={()=>setReceiveOpen(true)} style={{flex:1,padding:"11px 0",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:800,color:C.t2,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>Receive ↓</button>
            </div>
          </div>

          {/* ── Aurum Card (Flippable) ── */}
          <style>{`
            @keyframes cardShine { 0%{transform:translateX(-100%) rotate(25deg)} 100%{transform:translateX(200%) rotate(25deg)} }
            .card-container { perspective: 1000px; }
            .card-inner { position:relative; width:100%; transition: transform 0.6s cubic-bezier(0.4,0,0.2,1); transform-style: preserve-3d; }
            .card-inner.flipped { transform: rotateY(180deg); }
            .card-front, .card-back { backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius:18px; min-height:200px; }
            .card-back { position:absolute; top:0; left:0; right:0; transform: rotateY(180deg); }
            .card-front { transition: box-shadow 0.35s ease; }
            .card-front:hover { box-shadow: 0 20px 60px rgba(201,152,26,0.30), 0 4px 20px rgba(0,0,0,0.12) !important; }
          `}</style>
          <div style={{margin:"0 20px 16px"}}>
            <div className="card-container" onClick={()=>setCardFlipped(f=>!f)} style={{cursor:"pointer"}}>
              <div className={`card-inner${cardFlipped?" flipped":""}`}>
                {/* ── FRONT ── */}
                <div className="card-front" style={{
                  position:"relative", overflow:"hidden",
                  background:C.cardBg||"linear-gradient(135deg, #1A1710 0%, #2C2618 35%, #3D3422 65%, #1A1710 100%)",
                  padding:"22px 24px 20px",
                  boxShadow:"0 12px 40px rgba(0,0,0,0.25), 0 2px 12px rgba(201,152,26,0.15)",
                }}>
                  {/* Shine */}
                  <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,overflow:"hidden",borderRadius:18,pointerEvents:"none"}}>
                    <div style={{position:"absolute",top:"-50%",width:"60%",height:"200%",background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)",animation:"cardShine 4s ease-in-out infinite"}} />
                  </div>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${C.gold},transparent)`,opacity:0.6}} />

                  {/* Top row */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#1A1710"}}>Au</div>
                      <div>
                        <div style={{fontSize:14,fontWeight:800,color:"#E8DCC8",letterSpacing:"-0.02em"}}>Aurum</div>
                        <div style={{fontSize:8,color:"rgba(232,220,200,0.4)",letterSpacing:"0.12em",textTransform:"uppercase"}}>Gold Card</div>
                      </div>
                    </div>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{opacity:0.5}}>
                      <path d="M7 17.5c3-3 3-8 0-11" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M11 19.5c4.5-4.5 4.5-12 0-16.5" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M15 21.5c6-6 6-16 0-22" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </div>

                  {/* EMV chip */}
                  <div style={{width:42,height:32,borderRadius:6,background:"linear-gradient(145deg,#c8a84b,#b8962e,#d4af37)",marginBottom:18,position:"relative",overflow:"hidden",boxShadow:"inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)"}}>
                    <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:"rgba(0,0,0,0.15)"}} />
                    <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:1,background:"rgba(0,0,0,0.1)"}} />
                    <div style={{position:"absolute",top:4,left:4,right:4,bottom:4,border:"1px solid rgba(0,0,0,0.08)",borderRadius:3}} />
                  </div>

                  {/* Masked number */}
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:17,letterSpacing:"0.16em",color:"#E8DCC8",marginBottom:18,display:"flex",gap:14}}>
                    <span style={{opacity:0.35}}>••••</span>
                    <span style={{opacity:0.35}}>••••</span>
                    <span style={{opacity:0.35}}>••••</span>
                    <span>{cardData?.last4||"----"}</span>
                  </div>

                  {/* Bottom row */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                    <div>
                      <div style={{fontSize:8,color:"rgba(232,220,200,0.35)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:3}}>Card Holder</div>
                      <div style={{fontSize:13,fontWeight:600,color:"#E8DCC8",letterSpacing:"0.04em",textTransform:"uppercase"}}>{user.name||"CARD HOLDER"}</div>
                    </div>
                    <div style={{display:"flex",gap:16}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:8,color:"rgba(232,220,200,0.35)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:3}}>Exp</div>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#E8DCC8"}}>{cardData?.exp||"--/--"}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:8,color:"rgba(232,220,200,0.35)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:3}}>CVV</div>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:"#E8DCC8"}}>•••</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── BACK ── */}
                <div className="card-back" style={{
                  overflow:"hidden",
                  background:C.cardBg||"linear-gradient(135deg, #1A1710 0%, #2C2618 35%, #3D3422 65%, #1A1710 100%)",
                  padding:"22px 24px 20px",
                  boxShadow:"0 12px 40px rgba(0,0,0,0.25), 0 2px 12px rgba(201,152,26,0.15)",
                }}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${C.gold},transparent)`,opacity:0.6}} />
                  {/* Mag stripe */}
                  <div style={{background:"#111",height:36,margin:"-22px -24px 20px",borderRadius:"18px 18px 0 0"}} />

                  <div style={{fontSize:9,color:"rgba(232,220,200,0.4)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Card Number</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,letterSpacing:"0.16em",color:"#E8DCC8",marginBottom:16,display:"flex",gap:12}}>
                    <span>{cardData?.g1||"----"}</span><span>{cardData?.g2||"----"}</span><span>{cardData?.g3||"----"}</span><span>{cardData?.g4||"----"}</span>
                  </div>

                  <div style={{display:"flex",gap:24,marginBottom:16}}>
                    <div>
                      <div style={{fontSize:9,color:"rgba(232,220,200,0.4)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>Expiration</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:"#E8DCC8"}}>{cardData?.exp||"--/--"}</div>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:"rgba(232,220,200,0.4)",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>CVV</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:"#E8DCC8"}}>{cardData?.cvv||"---"}</div>
                    </div>
                  </div>

                  <button onClick={(e)=>{e.stopPropagation();navigator.clipboard.writeText(cardData?.cardNum||"");}} className="tap" style={{
                    width:"100%",padding:"10px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:10,
                    cursor:"pointer",fontSize:11,fontWeight:800,color:"#1A1710",letterSpacing:"0.06em",transition:"transform 0.15s ease",
                  }}>COPY CARD NUMBER</button>
                </div>
              </div>
            </div>

            {/* Hint */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:10,padding:"4px 0"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M7 17.5c3-3 3-8 0-11" stroke={C.t3} strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M11 19.5c4.5-4.5 4.5-12 0-16.5" stroke={C.t3} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span style={{fontSize:10,color:C.t3,fontWeight:600,letterSpacing:"0.06em"}}>{cardFlipped?"TAP CARD TO FLIP BACK":"TAP CARD TO REVEAL DETAILS"}</span>
            </div>

            {/* ── Card Action Buttons ── */}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:10}}>
              {/* Tap to Pay */}
              <button className="tap" onClick={async()=>{
                if(!window.PaymentRequest) return alert("Tap to Pay requires a secure context (HTTPS) or a compatible browser.");
                try {
                  const methods=[
                    {supportedMethods:"https://apple.com/apple-pay",data:{version:3,merchantIdentifier:"merchant.aurum",merchantCapabilities:["supports3DS"],supportedNetworks:["visa","masterCard","amex"]}},
                    {supportedMethods:"https://google.com/pay",data:{environment:"TEST",apiVersion:2,apiVersionMinor:0,merchantInfo:{merchantName:"Aurum"},allowedPaymentMethods:[{type:"CARD",parameters:{allowedAuthMethods:["PAN_ONLY","CRYPTOGRAM_3DS"],allowedCardNetworks:["VISA","MASTERCARD","AMEX"]},tokenizationSpecification:{type:"PAYMENT_GATEWAY",parameters:{gateway:"example"}}}]}},
                    {supportedMethods:"basic-card",data:{supportedNetworks:["visa","mastercard","amex"]}}
                  ];
                  const details={total:{label:"Aurum Tap to Pay",amount:{currency:cur,value:"0.00"}}};
                  const req=new PaymentRequest(methods,details);
                  const res=await req.show();
                  await res.complete("success");
                } catch(e){ console.log("Tap to Pay dismissed",e); }
              }} style={{
                width:"100%",padding:"13px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:12,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                boxShadow:"0 4px 16px rgba(201,152,26,0.25)",transition:"transform 0.15s ease",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M7 17.5c3-3 3-8 0-11" stroke="#1A1710" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M11 19.5c4.5-4.5 4.5-12 0-16.5" stroke="#1A1710" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M15 21.5c6-6 6-16 0-22" stroke="#1A1710" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span style={{fontSize:12,fontWeight:800,color:"#1A1710",letterSpacing:"0.04em"}}>Tap to Pay</span>
              </button>

              {/* Add to Wallet — auto-detects platform */}
              {(()=>{
                const ua=navigator.userAgent||"";
                const isApple=/iPhone|iPad|iPod|Mac/i.test(ua);
                const walletName=isApple?"Apple Wallet":"Google Wallet";
                const walletMsg=isApple
                  ?"Add to Apple Wallet requires a server-side .pkpass file. In production, this will provision your Aurum card to Apple Wallet via PassKit."
                  :"Add to Google Wallet requires a server-side JWT pass. In production, this will provision your Aurum card to Google Wallet via the Google Wallet API.";
                return(
                  <button className="tap" onClick={()=>alert(walletMsg)} style={{
                    width:"100%",padding:"13px",background:isApple?(darkMode?"#1A1A1A":"#000"):(darkMode?"#1A1A1A":"#fff"),
                    border:isApple?"none":`1.5px solid ${C.s2}`,borderRadius:12,
                    cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                    transition:"transform 0.15s ease",
                  }}>
                    {isApple?(
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M18.7 8.3c-.1.1-2.1 1.2-2.1 3.7 0 2.9 2.5 3.9 2.6 3.9 0 0-.4 1.3-1.2 2.6-.7 1.2-1.5 2.3-2.7 2.3-1.2 0-1.5-.7-2.8-.7-1.3 0-1.7.7-2.8.7-1.2 0-2-1.2-2.7-2.3C5.6 16.4 4.5 13.2 4.5 10.2c0-3.5 2.3-5.3 4.5-5.3 1.2 0 2.1.8 2.8.8.7 0 1.8-.8 3.1-.8.5 0 2.3.1 3.8 1.4z" fill="#fff"/>
                        <path d="M15.5 3.5c.7-.8 1.2-2 1-3.2-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.2-.6 2.9-1.4z" fill="#fff"/>
                      </svg>
                    ):(
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    <span style={{fontSize:12,fontWeight:800,color:isApple?"#fff":C.t1,letterSpacing:"0.04em"}}>Add to {walletName}</span>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Activity header */}
          <div style={{padding:"0 20px 10px"}}><div style={{fontSize:15,fontWeight:800}}>Activity</div></div>
          <div style={{margin:"0 20px",background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden"}}>
            {TX_LIST.map((tx,i)=>(
              <div key={tx.id} onClick={()=>setActiveTx(tx)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<TX_LIST.length-1?`1px solid ${C.s2}`:"none",cursor:"pointer"}}>
                <div style={{width:40,height:40,borderRadius:12,flexShrink:0,background:tx.type==="receive"?"rgba(212,175,55,0.08)":C.s2,border:`1.5px solid ${tx.type==="receive"?"rgba(212,175,55,0.2)":C.s3}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:tx.type==="receive"?C.gold:C.t2,fontWeight:700}}>{tx.type==="receive"?"↓":"↑"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.label}</div>
                  <div style={{fontSize:10,color:C.t3}}>{tx.date} · {tx.time}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:tx.type==="receive"?C.gold:C.t2}}>{tx.type==="receive"?"+":"-"}{fmtOzN(tx.oz)} oz</div>
                  <div style={{fontSize:10,color:C.t3,marginTop:2}}>{liveOz?fmt(tx.oz*liveOz,cur,rates):"—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="profile"&&(
        <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
          <div style={{padding:"20px 20px 16px"}}><div style={{fontSize:20,fontWeight:800,marginBottom:2}}>Profile</div><div style={{fontSize:12,color:C.t3}}>Aurum · SGC Wallet</div></div>
          <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:18,padding:"18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              {user.picture
                ? <img src={user.picture} alt="" referrerPolicy="no-referrer" style={{width:50,height:50,borderRadius:14,objectFit:"cover"}} />
                : <div style={{width:50,height:50,borderRadius:14,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:C.t1}}>{(user.name||"U").split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
              }
              <div><div style={{fontSize:16,fontWeight:700}}>{user.name||"User"}</div><div style={{fontSize:12,color:C.t3}}>{user.email||"—"}</div></div>
              <div style={{marginLeft:"auto",padding:"4px 10px",background:"rgba(26,122,69,0.1)",border:"1px solid rgba(26,122,69,0.2)",borderRadius:20,fontSize:10,fontWeight:700,color:C.green}}>✓ KYC</div>
            </div>
            <div style={{padding:"10px 12px",background:C.s2,borderRadius:10}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t2,wordBreak:"break-all"}}>0x7f3A9c2B8e1D4F6a0C5E7b3D9f2A8c4E6b1D3f5A</div>
            </div>
          </div>
          <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.s2}`,fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Portfolio</div>
            {[{k:"oz held",v:`${fmtOzN(HOLDING_OZ)} oz`},{k:"Grams",v:`${fmtGN(HOLDING_G)}g`},{k:"Current value",v:portValue?fmt(portValue,cur,rates):"loading…",gold:true},{k:"Total return",v:portChange?(portChange>=0?"+":"")+fmt(portChange,cur,rates)+" ("+Math.abs(portChangePct||0).toFixed(1)+"%)":"loading…",gold:true}].map(({k,v,gold},i,a)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"11px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                <span style={{fontSize:12,color:C.t3}}>{k}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:`1px solid ${C.s2}`}}>
              <div><div style={{fontSize:13,fontWeight:600}}>Dark Mode</div><div style={{fontSize:11,color:C.t3}}>Gold on black aesthetic</div></div>
              <Toggle on={darkMode} onToggle={toggleDarkMode}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:`1px solid ${C.s2}`}}>
              <div><div style={{fontSize:13,fontWeight:600}}>Hide Balance</div><div style={{fontSize:11,color:C.t3}}>Mask values on home screen</div></div>
              <Toggle on={hideBalance} onToggle={()=>setHideBalance(v=>!v)}/>
            </div>
            <div style={{padding:"12px 16px"}}>
              <div style={{fontSize:11,color:C.t3,marginBottom:8}}>Display Currency</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {["USD","AED","EUR","GBP","SGD"].map(v=>(
                  <button key={v} onClick={()=>setCur(v)} style={{padding:"6px 12px",background:cur===v?"rgba(212,175,55,0.12)":C.s2,border:`1.5px solid ${cur===v?C.gold:C.s2}`,borderRadius:9,cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,color:cur===v?C.gold:C.t2}}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Sign out */}
          <div style={{margin:"0 20px"}}>
            <button onClick={handleSignOut} className="tap" style={{
              width:"100%", padding:"14px", background:C.s1, border:`1px solid ${C.s2}`,
              borderRadius:14, cursor:"pointer", fontSize:13, fontWeight:700, color:C.red,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              transition:"transform 0.15s ease",
            }}>Sign Out</button>
          </div>
        </div>
      )}

      {tab==="home"&&(
        <div style={{width:"100%",maxWidth:430}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:darkMode?"#0D0D0D":"#1A1710"}}>Au</div>
              <div><div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.02em"}}>{getGreeting()}, {(user.name||"User").split(" ")[0]}</div><div style={{fontSize:10,color:C.t3,letterSpacing:"0.08em"}}>AURUM</div></div>
            </div>
            <OracleBadge source={source} ageSeconds={ageSeconds} fetching={fetching} progress={progress}/>
          </div>

          {errMsg&&<div style={{margin:"12px 20px 0",padding:"10px 14px",background:"rgba(192,57,43,0.08)",border:"1px solid rgba(192,57,43,0.25)",borderRadius:10,fontSize:11,color:C.red}}>⚠ {errMsg}</div>}

          <div style={{padding:"28px 22px 0",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.05s"}}>
            <div style={{fontSize:11,color:C.t3,marginBottom:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
              Portfolio Value {hideBalance&&<span style={{fontSize:9,background:C.s2,padding:"2px 7px",borderRadius:10,color:C.t3}}>HIDDEN</span>}
            </div>
            {loading
              ?<div className="sh" style={{fontFamily:"'DM Mono',monospace",fontWeight:300,fontSize:52,letterSpacing:"-0.04em",lineHeight:1,color:C.t3,marginBottom:12}}>$—,———.——</div>
              :<div className={flash==="up"?"fu":flash==="down"?"fd":""}
                  style={{fontFamily:"'DM Mono',monospace",fontWeight:300,fontSize:52,letterSpacing:"-0.04em",lineHeight:1,color:C.t1,marginBottom:12,fontVariantNumeric:"tabular-nums"}}>
                  {hideBalance?"••••••":fmt(portValue,cur,rates)}
                </div>
            }
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:14,color:C.t2,fontWeight:500}}>{fmtOzN(HOLDING_OZ)} oz SGC</span>
              {!loading&&portChange!==null&&<span style={{fontSize:12,color:portChange>=0?C.gold:C.red,fontWeight:600}}>
                {portChange>=0?"▲ +":"▼ "}{fmt(Math.abs(portChange),cur,rates)} ({Math.abs(portChangePct).toFixed(1)}%)
              </span>}
            </div>
          </div>

          <div style={{padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.1s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:6}}>
              <div>
                {loading
                  ?<div className="sh" style={{fontFamily:"'DM Mono',monospace",fontSize:20,color:C.t3}}>$—,———.——<span style={{fontSize:11}}>/oz</span></div>
                  :<div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:400,color:hoverIdx!==null?C.t1:C.gold}}>{fmt(dispOz,cur,rates)}<span style={{fontSize:11,color:C.t3,marginLeft:3}}>/oz</span></div>
                }
                {!loading&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                  <span style={{fontSize:12,fontWeight:700,color:positive?C.gold:C.red}}>{positive?"▲":"▼"} {Math.abs(changePct).toFixed(2)}%</span>
                  <span style={{fontSize:11,color:C.t3}}>{positive?"+":""}{fmt(change,cur,rates)}{hoverIdx!==null?` · ${rangeData[hi].date}`:""}</span>
                </div>}
              </div>
              {!loading&&<div style={{fontSize:11,color:C.t3}}>{fmt(liveOz/TROY,cur,rates)}/g</div>}
            </div>
            {!loading&&<Sparkline data={rangeData} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} positive={positive} cur={cur} rates={rates}/>}
            {!loading&&eventNote&&<div style={{marginTop:8,padding:"6px 10px",background:"rgba(212,175,55,0.05)",border:"1px solid rgba(212,175,55,0.12)",borderRadius:7,fontSize:11,color:"rgba(212,175,55,0.6)",display:"flex",gap:5}}><span>📌</span>{eventNote}</div>}
            <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:12}}>
              {["1W","1M","3M","6M","1Y","ALL"].map(r=>(
                <button key={r} onClick={()=>{setRange(r);setHoverIdx(null);}} style={{padding:"5px 10px",borderRadius:20,background:range===r?"rgba(212,175,55,0.12)":"transparent",border:range===r?"1px solid rgba(212,175,55,0.4)":`1px solid ${C.s2}`,color:range===r?C.gold:C.t3,fontSize:11,fontWeight:700,cursor:"pointer"}}>{r}</button>
              ))}
            </div>
          </div>

          <div style={{display:"flex",gap:10,padding:"20px 20px 0"}}>
            {[{label:"Buy",icon:"+",gold:true,fn:()=>setBuyOpen(true)},{label:"Send",icon:"↑",gold:false,fn:()=>setSendOpen(true)},{label:"Receive",icon:"↓",gold:false,fn:()=>setReceiveOpen(true)},{label:"Vault",icon:"🏅",gold:false,fn:()=>setTab("vault")}].map(({label,icon,gold,fn})=>(
              <button key={label} className="btn" onClick={fn} style={{flex:1,padding:"14px 0",background:gold?`linear-gradient(145deg,${C.goldD},${C.gold})`:C.s1,border:gold?"none":`1px solid ${C.s2}`,borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,boxShadow:gold?"0 4px 20px rgba(212,175,55,0.2)":"none"}}>
                <span style={{fontSize:17,color:gold?"#1A1710":C.t2,fontWeight:gold?800:400}}>{icon}</span>
                <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",color:gold?"#1A1710":C.t3,textTransform:"uppercase"}}>{label}</span>
              </button>
            ))}
          </div>

          <div style={{margin:"14px 20px 0",padding:"13px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span>🥇</span>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.t2}}>XAU/{cur} · ⬡ Chainlink</div>
                <div style={{fontSize:10,color:C.t3,marginTop:1}}>{liveOz?fmt(liveOz/TROY,cur,rates)+"/g":""} · every 15s</div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              {loading
                ?<div className="sh" style={{fontFamily:"'DM Mono',monospace",fontSize:15,color:C.t3}}>$—,———.——</div>
                :<div className={flash==="up"?"fu":flash==="down"?"fd":""} style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:C.gold,fontVariantNumeric:"tabular-nums"}}>{fmt(liveOz,cur,rates)}</div>
              }
            </div>
          </div>

          <div onClick={()=>setTab("vault")} style={{margin:"8px 20px 0",padding:"11px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span>🏅</span>
              <span style={{fontSize:12,color:C.t2,fontWeight:500}}>Brinks Dubai · {fmtGN(HOLDING_G)}g allocated</span>
              <span style={{padding:"2px 6px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.2)",borderRadius:4,fontSize:9,fontWeight:700,color:C.green}}>ALLOCATED</span>
            </div>
            <span style={{fontSize:13,color:C.t3}}>›</span>
          </div>

          {/* ── Holdings (above Activity) ── */}
          <div style={{margin:"16px 20px 0",background:C.s1,borderRadius:18,border:`1px solid ${C.s2}`,overflow:"hidden",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.3s"}}>
            <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.s2}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:800}}>Holdings</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:C.gold,fontWeight:500}}>{hideBalance?"••••":loading?"—":fmt(portValue,cur,rates)}</span>
            </div>
            {!loading&&portChangePct!==null&&(
              <div style={{padding:"12px 20px 14px",borderBottom:`1px solid ${C.s2}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{fontSize:11,color:C.t3,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Return since open</span>
                  <span style={{fontSize:11,color:portChange>=0?C.gold:C.red,fontWeight:700}}>{portChange>=0?"+":""}{portChangePct.toFixed(1)}%</span>
                </div>
                <div style={{height:5,background:C.s2,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(Math.max(portChangePct,0),100)}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,borderRadius:3,transition:"width 1s ease"}}/>
                </div>
              </div>
            )}
            {[{k:"Opened",v:fmt(INITIAL_USD,cur,rates)},{k:"Open price",v:`${fmt(ACCOUNT_OPEN_OZ,cur,rates)}/oz`},{k:"oz held",v:`${fmtOzN(HOLDING_OZ)} oz`},{k:"Current value",v:loading?"—":hideBalance?"••••":fmt(portValue,cur,rates),gold:true},{k:"Total return",v:loading?"—":hideBalance?"••••":(portChange>=0?"+":"")+fmt(portChange,cur,rates),gold:true}].map(({k,v,gold})=>(
              <div key={k} className="tap" style={{display:"flex",justifyContent:"space-between",padding:"11px 20px",borderBottom:`1px solid ${C.s2}`,transition:"transform 0.15s ease"}}>
                <span style={{fontSize:12,color:C.t3}}>{k}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
              </div>
            ))}
          </div>

          {/* ── Activity ── */}
          <div style={{padding:"22px 0 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"0 20px 12px",borderBottom:`1px solid ${C.s2}`}}>
              <span style={{fontSize:16,fontWeight:800}}>Activity</span>
              <span onClick={()=>setTab("wallet")} style={{fontSize:13,color:C.gold,cursor:"pointer",fontWeight:600}}>See all →</span>
            </div>
            {TX_LIST.slice(0,3).map(tx=>(
              <div key={tx.id} onClick={()=>setActiveTx(tx)} className="tap" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 20px",cursor:"pointer",borderBottom:`1px solid ${C.s2}`,transition:"transform 0.15s ease"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:13,flexShrink:0,background:tx.type==="receive"?"rgba(212,175,55,0.08)":C.s1,border:`1.5px solid ${tx.type==="receive"?"rgba(212,175,55,0.2)":C.s2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,color:tx.type==="receive"?C.gold:C.t3,fontWeight:700}}>{tx.type==="receive"?"↓":"↑"}</div>
                  <div><div style={{fontSize:13,fontWeight:600,color:C.t1,marginBottom:2}}>{tx.label}</div><div style={{fontSize:11,color:C.t3}}>{tx.sub}</div></div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:tx.type==="receive"?C.gold:C.t2}}>{tx.type==="receive"?"+":"-"}{fmtOzN(tx.oz)} oz</div>
                  <div style={{fontSize:11,color:C.t3,marginTop:1}}>{liveOz?fmt(tx.oz*liveOz,cur,rates):"—"}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Backed by gold footer badge ── */}
          <div style={{margin:"16px 20px 0",padding:"10px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{fontSize:11,color:C.t3,fontWeight:500}}>Backed by <span style={{color:C.gold,fontWeight:700}}>{fmtGN(HOLDING_G)}g</span> physical gold · Brinks Dubai</span>
          </div>
        </div>
      )}

      {/* ── Vault Tab ── */}
      {tab==="vault"&&(
        <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
          <div style={{padding:"20px 20px 0",marginBottom:16}}><div style={{fontSize:20,fontWeight:800,marginBottom:2}}>Vault</div><div style={{fontSize:12,color:C.t3}}>Brinks Dubai · Allocated Storage</div></div>

          {/* Summary card */}
          <div style={{margin:"0 20px 16px",padding:"18px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div>
                <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:4}}>Total Gold</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:300,color:C.gold}}>{fmtGN(VAULT_TOTAL_G)}g</div>
                <div style={{fontSize:11,color:C.t3,marginTop:3}}>{fmtOzN(VAULT_TOTAL_G/TROY)} oz · {liveOz?fmt((VAULT_TOTAL_G/TROY)*liveOz,cur,rates):"—"}</div>
              </div>
              <div style={{padding:"4px 10px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.2)",borderRadius:20,fontSize:10,fontWeight:700,color:C.green}}>✓ ALLOCATED</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="tap" onClick={()=>setBuyOpen(true)} style={{flex:1,padding:"11px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:800,color:darkMode?"#0D0D0D":"#1A1710",display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"transform 0.15s ease"}}>Buy Gold</button>
              <button className="tap" onClick={()=>setVaultSellOpen(true)} style={{flex:1,padding:"11px 0",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:800,color:C.t2,display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"transform 0.15s ease"}}>Sell Gold</button>
            </div>
          </div>

          {/* Bars list */}
          <div style={{padding:"0 20px 10px"}}><div style={{fontSize:15,fontWeight:800}}>Your Bars ({VAULT_BARS.length})</div></div>
          {VAULT_BARS.map((bar,i)=>{
            const pct=(bar.allocated/bar.weight*100).toFixed(1);
            return(
              <div key={bar.serial} className="tap" onClick={()=>setVaultDetail(i)} style={{margin:"0 20px 10px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden",cursor:"pointer",transition:"transform 0.15s ease"}}>
                <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                  {/* Gold bar icon */}
                  <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,rgba(212,175,55,0.12),rgba(184,150,46,0.06))",border:`1.5px solid rgba(212,175,55,0.2)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{width:24,height:16,borderRadius:3,background:"linear-gradient(135deg,#c8a84b,#d4af37,#b8962e)",boxShadow:"inset 0 1px 2px rgba(255,255,255,0.3)"}} />
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:13,fontWeight:700}}>Bar {i+1} · {bar.refinery}</span>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.gold,fontWeight:600}}>{fmtGN(bar.allocated)}g</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t3}}>{bar.serial}</span>
                      <span style={{fontSize:10,color:C.t3}}>{liveOz?fmt((bar.allocated/TROY)*liveOz,cur,rates):"—"}</span>
                    </div>
                    {/* Allocation bar */}
                    <div style={{marginTop:6,height:3,background:C.s2,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,borderRadius:2}} />
                    </div>
                    <div style={{marginTop:3,fontSize:9,color:C.t3}}>{pct}% of {fmtGN(bar.weight)}g bar · {bar.purity} LBMA · Minted {bar.mintDate}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Chainlink oracle footer */}
          <div style={{margin:"6px 20px 0",padding:"12px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.18)",borderRadius:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#3772ff",marginBottom:4}}>⬡ Chainlink XAU/USD · Ethereum Mainnet</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3,wordBreak:"break-all"}}>{CL_XAU}</div>
          </div>
        </div>
      )}

      {/* ── Sell Gold Modal ── */}
      {vaultSellOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&setVaultSellOpen(false)}>
          <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
            <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(192,57,43,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.red}}>↓</div>
              <div><div style={{fontSize:17,fontWeight:700}}>Sell Gold</div><div style={{fontSize:12,color:C.t3}}>Select a bar and amount to sell</div></div>
              <button onClick={()=>setVaultSellOpen(false)} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Select Bar</div>
            <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto"}}>
              {VAULT_BARS.map((b,i)=>(
                <button key={i} onClick={()=>setSellBarIdx(i)} className="tap" style={{minWidth:100,padding:"10px",background:sellBarIdx===i?"rgba(212,175,55,0.1)":C.s1,border:`1.5px solid ${sellBarIdx===i?C.gold:C.s2}`,borderRadius:12,cursor:"pointer",textAlign:"left",flexShrink:0,transition:"transform 0.15s ease"}}>
                  <div style={{fontSize:9,color:sellBarIdx===i?C.gold:C.t3,fontWeight:700,marginBottom:2}}>BAR {i+1}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3}}>{b.serial.slice(-8)}</div>
                  <div style={{fontSize:11,fontWeight:600,color:sellBarIdx===i?C.gold:C.t2,marginTop:2}}>{fmtGN(b.allocated)}g</div>
                  <div style={{fontSize:9,color:C.t3,marginTop:1}}>{liveOz?fmt((b.allocated/TROY)*liveOz,cur,rates):"—"}</div>
                </button>
              ))}
            </div>
            <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",fontWeight:700,marginBottom:7}}>Amount to sell (grams)</div>
            <div style={{position:"relative",marginBottom:12}}>
              <input type="number" value={sellAmt} onChange={e=>setSellAmt(e.target.value)} placeholder="0"
                style={{width:"100%",boxSizing:"border-box",padding:"14px 40px 14px 13px",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:300,outline:"none"}}/>
              <div style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.t3,fontWeight:700}}>g</div>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {["25%","50%","100%"].map(p=>{
                const frac=parseInt(p)/100;
                return <button key={p} onClick={()=>setSellAmt((VAULT_BARS[sellBarIdx].allocated*frac).toFixed(4))} style={{padding:"5px 12px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:8,cursor:"pointer",fontSize:10,fontWeight:700,color:C.t3}}>{p}</button>;
              })}
            </div>
            {parseFloat(sellAmt)>0&&<div style={{padding:"10px 14px",background:"rgba(212,175,55,0.06)",border:`1px solid rgba(212,175,55,0.15)`,borderRadius:10,marginBottom:16,fontSize:11,color:C.t2}}>
              You will receive <span style={{color:C.gold,fontWeight:700}}>{liveOz?fmt((parseFloat(sellAmt)/TROY)*liveOz,cur,rates):"—"}</span> for <span style={{fontWeight:600}}>{sellAmt}g</span> from Bar {sellBarIdx+1}
            </div>}
            <button onClick={()=>{alert(`Sell order submitted: ${sellAmt}g from Bar ${sellBarIdx+1} (${VAULT_BARS[sellBarIdx].serial})`);setVaultSellOpen(false);setSellAmt("");}} disabled={!parseFloat(sellAmt)||parseFloat(sellAmt)>VAULT_BARS[sellBarIdx].allocated} className="tap" style={{
              width:"100%",padding:"15px",background:parseFloat(sellAmt)&&parseFloat(sellAmt)<=VAULT_BARS[sellBarIdx].allocated?`linear-gradient(135deg,${C.goldD},${C.gold})`:C.s2,
              border:"none",borderRadius:14,cursor:parseFloat(sellAmt)?"pointer":"default",fontSize:14,fontWeight:800,
              color:parseFloat(sellAmt)&&parseFloat(sellAmt)<=VAULT_BARS[sellBarIdx].allocated?(darkMode?"#0D0D0D":"#1A1710"):C.t3,transition:"transform 0.15s ease",
            }}>Sell Gold</button>
          </div>
        </div>
      )}

      {/* ── Bar Detail Modal ── */}
      {vaultDetail!==null&&(()=>{
        const bar=VAULT_BARS[vaultDetail];
        const pct=(bar.allocated/bar.weight*100).toFixed(2);
        return(
          <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&setVaultDetail(null)}>
            <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",maxHeight:"80vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
              <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.s2}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                <div style={{width:36,height:24,borderRadius:4,background:"linear-gradient(135deg,#c8a84b,#d4af37,#b8962e)",boxShadow:"inset 0 1px 2px rgba(255,255,255,0.3)"}} />
                <div style={{flex:1}}><div style={{fontSize:16,fontWeight:700}}>Bar {vaultDetail+1} · {bar.refinery}</div><div style={{fontSize:11,color:C.t3}}>{bar.serial}</div></div>
                <button onClick={()=>setVaultDetail(null)} style={{background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"16px 20px 40px"}}>
                <div style={{background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden",marginBottom:14}}>
                  <div style={{padding:"14px",background:"linear-gradient(135deg,rgba(212,175,55,0.08),rgba(184,150,46,0.04))",borderBottom:`1px solid ${C.s2}`,textAlign:"center"}}>
                    <div style={{display:"inline-block",padding:"10px 20px",background:"linear-gradient(135deg,#c8a84b,#d4af37,#b8962e)",borderRadius:8,marginBottom:8}}>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(0,0,0,0.5)",marginBottom:3}}>FINE GOLD {bar.purity}</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:"rgba(0,0,0,0.8)"}}>{bar.weight.toFixed(3)}g</div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"rgba(0,0,0,0.5)",marginTop:3}}>{bar.refinery.toUpperCase()}</div>
                    </div>
                    <div style={{height:4,background:C.s2,borderRadius:2,overflow:"hidden",marginBottom:4}}>
                      <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`}}/>
                    </div>
                    <div style={{fontSize:11,color:C.t3}}>Your share: <span style={{color:C.gold,fontWeight:700}}>{fmtGN(bar.allocated)}g</span> / {fmtGN(bar.weight)}g ({pct}%)</div>
                  </div>
                  {[{k:"Serial",v:bar.serial},{k:"Refinery",v:bar.refinery},{k:"Purity",v:`${bar.purity} LBMA`},{k:"Mint date",v:bar.mintDate},{k:"Location",v:bar.location},{k:"Live value",v:liveOz?fmt((bar.allocated/TROY)*liveOz,cur,rates):"—",gold:true}].map(({k,v,gold},i,a)=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                      <span style={{fontSize:11,color:C.t3}}>{k}</span>
                      <span style={{fontSize:11,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="tap" onClick={()=>{setVaultDetail(null);setBuyOpen(true);}} style={{flex:1,padding:"13px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:800,color:darkMode?"#0D0D0D":"#1A1710",transition:"transform 0.15s ease"}}>Buy More</button>
                  <button className="tap" onClick={()=>{setVaultDetail(null);setSellBarIdx(vaultDetail);setVaultSellOpen(true);}} style={{flex:1,padding:"13px 0",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:800,color:C.t2,transition:"transform 0.15s ease"}}>Sell This Bar</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.navBg,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.s2}`,display:"flex",justifyContent:"center",zIndex:100,transition:"background 0.3s ease"}}>
        <div style={{width:"100%",maxWidth:430,display:"flex"}}>
          {nav.map(({id,label,svg})=>(
            <button key={id} onClick={()=>setTab(id)} className="tap" style={{flex:1,padding:"13px 0 11px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative",transition:"transform 0.15s ease"}}>
              {tab===id&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:32,height:3,borderRadius:2,background:`linear-gradient(90deg,${C.goldD},${C.gold})`}}/>}
              {svg(tab===id?C.gold:C.t3)}
              <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:tab===id?C.gold:C.t3}}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTx&&<TxDetail tx={activeTx} liveOz={liveOz||0} cur={cur} rates={rates} onClose={()=>setActiveTx(null)}/>}
      {sendOpen&&<SendModal liveOz={liveOz||0} cur={cur} rates={rates} onClose={()=>setSendOpen(false)}/>}
      {buyOpen&&<BuyModal liveOz={liveOz||0} cur={cur} rates={rates} onClose={()=>setBuyOpen(false)}/>}
      {receiveOpen&&<ReceiveModal liveOz={liveOz||0} cur={cur} rates={rates} onClose={()=>setReceiveOpen(false)}/>}
    </div>
  );
}

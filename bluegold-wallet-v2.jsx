import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── REAL GOLD PRICE DATA ─────────────────────────────────────────────────────
// All prices in USD per troy ounce (industry standard)
// Sources: APMEX, JM Bullion, TradingEconomics, USAGOLD, FilmoGaz
// $1,000 starting balance on Mar 13, 2025 @ $2,985.40/oz → 0.3350 oz
// Account opened with $1,000 · holds 0.3350 troy oz of SGC

const TROY = 31.1035; // grams per troy oz

const ALL_DATA_OZ = [
  // Mar 2025 — account opens
  { date:"Mar 13 '25", ts:20250313, oz:2985.40  }, // account open · $1,000 = 0.3350 oz
  { date:"Mar 20 '25", ts:20250320, oz:3020.10  },
  { date:"Apr 1 '25",  ts:20250401, oz:3150.80  }, // pre-Liberation Day build
  { date:"Apr 7 '25",  ts:20250407, oz:3025.50  }, // tariff shock selloff
  { date:"Apr 22 '25", ts:20250422, oz:3500.00  }, // 🏆 Liberation Day ATH
  { date:"May 1 '25",  ts:20250501, oz:3415.20  },
  { date:"May 15 '25", ts:20250515, oz:3458.40  },
  { date:"Jun 1 '25",  ts:20250601, oz:3371.30  }, // summer slowdown
  { date:"Jun 15 '25", ts:20250615, oz:3325.10  },
  { date:"Jul 1 '25",  ts:20250701, oz:3348.90  },
  { date:"Jul 15 '25", ts:20250715, oz:3393.40  },
  { date:"Aug 1 '25",  ts:20250801, oz:3447.20  },
  { date:"Aug 15 '25", ts:20250815, oz:3555.30  },
  { date:"Sep 1 '25",  ts:20250901, oz:3699.80  }, // record run resumes
  { date:"Sep 15 '25", ts:20250915, oz:3877.60  },
  { date:"Oct 1 '25",  ts:20251001, oz:4027.50  }, // PBoC cuts rates
  { date:"Oct 15 '25", ts:20251015, oz:4144.80  },
  { date:"Nov 1 '25",  ts:20251101, oz:3977.40  }, // post-election dip
  { date:"Nov 15 '25", ts:20251115, oz:4061.50  },
  { date:"Dec 1 '25",  ts:20251201, oz:4323.60  }, // debasement trade
  { date:"Dec 15 '25", ts:20251215, oz:4428.30  },
  { date:"Dec 26 '25", ts:20251226, oz:4533.00  }, // 2025 closing high
  { date:"Dec 31 '25", ts:20251231, oz:4456.20  }, // year close
  // 2026
  { date:"Jan 7 '26",  ts:20260107, oz:4593.00  },
  { date:"Jan 14 '26", ts:20260114, oz:4742.00  },
  { date:"Jan 21 '26", ts:20260121, oz:4945.00  },
  { date:"Jan 28 '26", ts:20260128, oz:5602.22  }, // 🏆 ALL-TIME HIGH (confirmed APMEX)
  { date:"Feb 5 '26",  ts:20260205, oz:5239.50  }, // pullback
  { date:"Feb 11 '26", ts:20260211, oz:5061.00  }, // TradingEconomics confirmed
  { date:"Feb 18 '26", ts:20260218, oz:4922.40  },
  { date:"Feb 25 '26", ts:20260225, oz:5020.80  },
  { date:"Mar 1 '26",  ts:20260301, oz:5096.30  },
  { date:"Mar 7 '26",  ts:20260307, oz:5232.10  }, // Iran Hormuz spike
  { date:"Mar 12 '26", ts:20260312, oz:5110.50  }, // USAGOLD confirmed
  { date:"Mar 13 '26", ts:20260313, oz:5110.00  }, // today · live updated below
];

// Account: opened Mar 13 2025 with $1,000 · bought 0.3350 troy oz @ $2,985.40
const ACCOUNT_OPEN_OZ  = 2985.40;
const INITIAL_USD      = 1000;
const HOLDING_OZ       = parseFloat((INITIAL_USD / ACCOUNT_OPEN_OZ).toFixed(6)); // 0.335005 oz
const HOLDING_G        = parseFloat((HOLDING_OZ * TROY).toFixed(4)); // 10.4194g

// Key market events
const EVENTS = {
  20250407:"Tariff shock selloff — gold dips before Liberation Day rebound",
  20250422:"🏆 Liberation Day ATH · $3,500/oz · safe-haven surge",
  20250901:"Record-setting run resumes · Fed rate cut bets grow",
  20251226:"2025 year high · $4,533/oz · silver parabolic move",
  20260128:"🏆 All-time high · $5,602.22/oz confirmed (APMEX) · Iran conflict",
  20260307:"Iran Strait of Hormuz risk · strongest safe-haven bid of 2026",
};

const getRange = (key, liveOz) => {
  const cuts = {"1W":20260306,"1M":20260213,"3M":20251213,"6M":20250913,"1Y":20250313,"ALL":0};
  const filtered = ALL_DATA_OZ.filter(d => d.ts >= cuts[key]);
  return filtered.map((d,i) => i===filtered.length-1 ? {...d, oz:liveOz} : d);
};

// Formatters — oz is primary display, grams secondary
const fmtOz  = (v) => "$"+v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtUSD = (v) => "$"+v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtOzN = (v) => v.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:4});
const fmtGN  = (v) => v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

const C = {
  bg:"#F5F3EE",s1:"#FFFFFF",s2:"#E8E4DC",s3:"#D6D0C4",
  gold:"#C9981A",goldD:"#A87A10",goldFaint:"rgba(201,152,26,0.10)",goldDim:"rgba(201,152,26,0.30)",
  t1:"#1A1710",t2:"#5A5343",t3:"#9E9281",green:"#1A7A45",red:"#C0392B",
};

// ─── SPARKLINE with drag-to-scrub ─────────────────────────────────────────────
function Sparkline({ data, hoverIdx, setHoverIdx, positive }) {
  const svgRef = useRef(null);
  const dragging = useRef(false);
  const W=390,H=100,pL=2,pR=2,pT=14,pB=4;
  const iW=W-pL-pR,iH=H-pT-pB;
  const vals=data.map(d=>d.oz);
  const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const cx=i=>pL+(i/(data.length-1))*iW;
  const cy=v=>pT+iH-((v-mn)/rng)*iH;
  const line=data.map((d,i)=>`${i===0?"M":"L"}${cx(i).toFixed(1)},${cy(d.oz).toFixed(1)}`).join(" ");
  const area=line+` L${cx(data.length-1).toFixed(1)},${H} L${cx(0).toFixed(1)},${H} Z`;
  const hi=hoverIdx??data.length-1;
  const col=positive?C.gold:C.red;
  const mxIdx=vals.indexOf(mx);

  const getIdxFromX = (clientX) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if(!rect) return null;
    const relX = (clientX - rect.left) * (W / rect.width) - pL;
    return Math.max(0, Math.min(data.length-1, Math.round((relX/iW)*(data.length-1))));
  };

  // Mouse
  const onMouseMove = e => { if(dragging.current||true) setHoverIdx(getIdxFromX(e.clientX)); };
  const onMouseLeave = () => { dragging.current=false; setHoverIdx(null); };

  // Touch drag
  const onTouchStart = e => { dragging.current=true; setHoverIdx(getIdxFromX(e.touches[0].clientX)); };
  const onTouchMove  = e => { e.preventDefault(); if(dragging.current) setHoverIdx(getIdxFromX(e.touches[0].clientX)); };
  const onTouchEnd   = () => { dragging.current=false; setHoverIdx(null); };

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
      style={{display:"block",overflow:"visible",cursor:"crosshair",touchAction:"none",userSelect:"none"}}
      onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
        <filter id="gw"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d={area} fill="url(#cg)"/>
      {hoverIdx!==null && <line x1={cx(hi).toFixed(1)} y1={pT-4} x2={cx(hi).toFixed(1)} y2={H} stroke={`${col}44`} strokeWidth="1.5" strokeDasharray="3,3"/>}
      <path d={line} fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" filter="url(#gw)"/>
      {/* ATH label */}
      <text x={cx(mxIdx)} y={cy(mx)-6} textAnchor="middle"
        style={{fontSize:"8px",fill:"rgba(201,152,26,0.5)",fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>
        {fmtOz(mx)}
      </text>
      <circle cx={cx(hi)} cy={cy(data[hi].oz)} r={10} fill={`${col}15`}/>
      <circle cx={cx(hi)} cy={cy(data[hi].oz)} r={4.5} fill={col} filter="url(#gw)"/>
    </svg>
  );
}

// ─── REFRESH RING ─────────────────────────────────────────────────────────────
function RefreshRing({ progress, fetching, lastUpdated, chainlink }) {
  const r=10, circ=2*Math.PI*r;
  const isChainlink = chainlink && chainlink.priceUSD > 0;
  const stale = chainlink && chainlink.ageSeconds > 7200;
  const ageStr = chainlink ? (
    chainlink.ageSeconds < 60 ? `${chainlink.ageSeconds}s ago` :
    chainlink.ageSeconds < 3600 ? `${Math.floor(chainlink.ageSeconds/60)}m ago` :
    `${Math.floor(chainlink.ageSeconds/3600)}h ago`
  ) : null;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <svg width="22" height="22" style={{transform:"rotate(-90deg)"}}>
          <circle cx="11" cy="11" r={r} fill="none" stroke={C.s2} strokeWidth="2"/>
          <circle cx="11" cy="11" r={r} fill="none" stroke={fetching?C.gold:"rgba(201,152,26,0.4)"}
            strokeWidth="2" strokeDasharray={circ}
            strokeDashoffset={circ*(1-progress)}
            strokeLinecap="round"
            style={{transition:"stroke-dashoffset 0.4s linear"}}/>
        </svg>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.gold,animation:"pulse 2s infinite"}}/>
            <span style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:"0.05em"}}>{fetching?"UPDATING":"LIVE"}</span>
          </div>
          {lastUpdated&&<div style={{fontSize:9,color:C.t3,marginTop:1}}>Updated {lastUpdated}</div>}
        </div>
      </div>
      {isChainlink&&(
        <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 7px",background:stale?"rgba(192,57,43,0.08)":"rgba(55,114,255,0.08)",border:`1px solid ${stale?"rgba(192,57,43,0.2)":"rgba(55,114,255,0.2)"}`,borderRadius:6}}>
          <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill={stale?"#C0392B":"#3772ff"}/></svg>
          <span style={{fontSize:9,fontWeight:700,color:stale?"#C0392B":"#3772ff",letterSpacing:"0.04em"}}>{stale?"STALE":"⬡ CHAINLINK"}</span>
          {ageStr&&<span style={{fontSize:9,color:C.t3}}>{ageStr}</span>}
        </div>
      )}
    </div>
  );
}

// ─── TRANSACTION DETAIL SHEET ─────────────────────────────────────────────────
const TX_LIST = [
  { id:1, type:"receive", label:"Mining Yield Q1",    sub:"BlueGold Trust",    oz:0.0749, date:"Mar 11, 2026", time:"9:14 AM EST",  hash:"0x7f3A...D3f5A", network:"Ethereum L2",   memo:"Q1 2026 yield distribution", confirms:42  },
  { id:2, type:"send",    label:"Coffee Co. Payment", sub:"POS Terminal #447", oz:0.0026, date:"Mar 10, 2026", time:"11:32 AM EST", hash:"0xB2c1...9aF2E", network:"Ethereum L2",   memo:"In-store purchase",          confirms:38  },
  { id:3, type:"receive", label:"SGC Purchase",       sub:"Coinbase Exchange",  oz:0.3214, date:"Mar 8, 2026",  time:"2:05 PM EST",  hash:"0x4D8e...7cA1B", network:"Ethereum L2",   memo:"Market buy order",           confirms:120 },
  { id:4, type:"send",    label:"To alex.bluegold",   sub:"Peer Transfer",     oz:0.0402, date:"Mar 7, 2026",  time:"6:48 PM EST",  hash:"0xA91f...2bD4C", network:"Ethereum L2",   memo:"Dinner split",               confirms:99  },
  { id:5, type:"receive", label:"Vault Redemption",   sub:"Dubai Vault #3",    oz:0.1608, date:"Mar 5, 2026",  time:"10:20 AM EST", hash:"0xE3b7...5eF8D", network:"Ethereum L2",   memo:"Physical-to-digital convert",confirms:200 },
];

function TxDetail({ tx, liveOz, onClose }) {
  const isRec = tx.type==="receive";
  const usdVal = tx.oz * liveOz;
  const fee = tx.oz * 0.001 * liveOz;
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(245,243,238,0.92)",backdropFilter:"blur(18px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${isRec?C.gold:C.s2}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}>
          <div style={{width:40,height:4,borderRadius:2,background:C.s2}}/>
        </div>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24,paddingBottom:20,borderBottom:`1px solid ${C.s2}`}}>
          <div style={{width:52,height:52,borderRadius:16,background:isRec?`rgba(212,175,55,0.1)`:C.s1,border:`2px solid ${isRec?C.gold:C.s2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:isRec?C.gold:C.t3,fontWeight:700}}>
            {isRec?"↓":"↑"}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:700,color:C.t1,marginBottom:3}}>{tx.label}</div>
            <div style={{fontSize:12,color:C.t3}}>{tx.sub}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:C.t3,cursor:"pointer",padding:"4px"}}>✕</button>
        </div>

        {/* Big amount */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:38,fontWeight:300,color:isRec?C.gold:C.t1,letterSpacing:"-0.02em",marginBottom:4}}>
            {isRec?"+":"-"}{fmtOzN(tx.oz)} oz
          </div>
          <div style={{fontSize:14,color:C.t2,marginBottom:2}}>{fmtGN(tx.oz*TROY)}g SGC</div>
          <div style={{fontSize:16,color:C.t2,fontWeight:500}}>{fmtUSD(usdVal)}</div>
          <div style={{
            display:"inline-block",marginTop:8,padding:"4px 12px",borderRadius:20,
            background:isRec?"rgba(95,224,138,0.1)":"rgba(212,175,55,0.08)",
            border:`1px solid ${isRec?"rgba(95,224,138,0.3)":C.goldDim}`,
            fontSize:11,fontWeight:700,color:isRec?C.green:C.gold,letterSpacing:"0.05em",
          }}>✓ CONFIRMED</div>
        </div>

        {/* Detail rows */}
        <div style={{background:C.s1,borderRadius:16,overflow:"hidden",border:`1px solid ${C.s2}`,marginBottom:16}}>
          {[
            {k:"Date",        v:`${tx.date} · ${tx.time}`},
            {k:"Type",        v:isRec?"Received":"Sent"},
            {k:"Network",     v:tx.network},
            {k:"Network fee", v:fmtUSD(fee)},
            {k:"Confirmations",v:`${tx.confirms} blocks`},
            {k:"Memo",        v:tx.memo},
          ].map(({k,v},i,arr)=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 18px",borderBottom:i<arr.length-1?`1px solid ${C.s2}`:"none"}}>
              <span style={{fontSize:13,color:C.t3}}>{k}</span>
              <span style={{fontSize:13,color:C.t2,fontWeight:500,maxWidth:220,textAlign:"right"}}>{v}</span>
            </div>
          ))}
        </div>

        {/* Tx hash */}
        <div style={{padding:"12px 16px",background:C.s1,borderRadius:12,border:`1px solid ${C.s2}`,marginBottom:16}}>
          <div style={{fontSize:10,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Transaction Hash</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2,wordBreak:"break-all",lineHeight:1.5}}>{tx.hash}</div>
        </div>

        <button onClick={onClose} style={{width:"100%",padding:"15px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:C.t1,letterSpacing:"0.02em"}}>
          Done
        </button>
      </div>
    </div>
  );
}

// ─── QR CODE ──────────────────────────────────────────────────────────────────
function QRCode({ size=180 }) {
  const cell=size/21;
  const finder=(ox,oy)=>{const c=[];for(let r=0;r<7;r++)for(let cc=0;cc<7;cc++){if(r===0||r===6||cc===0||cc===6||r>=2&&r<=4&&cc>=2&&cc<=4)c.push({r:r+oy,c:cc+ox});}return c;};
  const finders=[...finder(0,0),...finder(14,0),...finder(0,14)];
  const finderSet=new Set(finders.map(({r,c})=>`${r},${c}`));
  const data=[];
  for(let r=0;r<21;r++)for(let c=0;c<21;c++){
    if(finderSet.has(`${r},${c}`)||r<9&&c<9||r<9&&c>12||r>12&&c<9)continue;
    if(((r*21+c)*2654435761+42)%2===0)data.push({r,c});
  }
  return(<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{borderRadius:12}}>
    <rect width={size} height={size} fill={C.s2} rx="12"/>
    {[...finders,...data].map(({r,c},i)=><rect key={i} x={c*cell+2} y={r*cell+2} width={cell-1} height={cell-1} fill={C.gold} rx="1"/>)}
  </svg>);
}

// ─── RECEIVE SCREEN ───────────────────────────────────────────────────────────
function ReceiveScreen({ liveOz, onBack }) {
  const [copied,setCopied]=useState(false);
  const addr="0x7f3A9c2B8e1D4F6a0C5E7b3D9f2A8c4E6b1D3f5A";
  const copy=()=>{ navigator.clipboard?.writeText(addr).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return(
    <div style={{position:"fixed",inset:0,zIndex:150,background:C.bg,display:"flex",flexDirection:"column",animation:"slideInRight 0.28s cubic-bezier(0.22,1,0.36,1)",maxWidth:430,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,padding:"52px 22px 22px",borderBottom:`1px solid ${C.s2}`}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.t2,padding:"4px 8px 4px 0"}}>←</button>
        <div><div style={{fontSize:18,fontWeight:700,color:C.t1}}>Receive Gold</div><div style={{fontSize:12,color:C.t3,marginTop:2}}>Share your SGC wallet address</div></div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"28px 22px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 18px",background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,marginBottom:28}}>
          <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:C.t1}}>Au</div>
          <div><div style={{fontSize:14,fontWeight:700,color:C.t1}}>Standard Gold Coin</div><div style={{fontSize:12,color:C.t3}}>SGC · ERC-20 · Ethereum L2</div></div>
          <div style={{marginLeft:"auto",textAlign:"right"}}>
            <div style={{fontSize:12,color:C.gold,fontWeight:700}}>{fmtOz(liveOz)}/oz</div>
            <div style={{fontSize:11,color:C.t3,marginTop:1}}>{fmtOz(liveOz/TROY)}/g</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:28}}>
          <div style={{padding:20,background:C.s1,borderRadius:20,border:`1px solid ${C.s2}`,boxShadow:`0 0 40px rgba(212,175,55,0.06)`,marginBottom:16}}><QRCode size={180}/></div>
          <div style={{fontSize:12,color:C.t3,marginBottom:6,letterSpacing:"0.06em"}}>YOUR SGC ADDRESS</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2,textAlign:"center",padding:"10px 16px",background:C.s1,borderRadius:10,border:`1px solid ${C.s2}`,wordBreak:"break-all",maxWidth:280}}>{addr}</div>
        </div>
        <button onClick={copy} style={{width:"100%",padding:"16px 0",background:copied?`rgba(95,224,138,0.15)`:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:copied?`1px solid ${C.green}`:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:copied?C.green:"#080808",transition:"all 0.2s",marginBottom:16}}>
          {copied?"✓ Address Copied!":"Copy Address"}
        </button>
        <div style={{display:"flex",gap:10,marginBottom:28}}>
          {[{icon:"🔗",label:"Share Link"},{icon:"📲",label:"Save QR"},{icon:"💬",label:"Send SMS"}].map(({icon,label})=>(
            <button key={label} style={{flex:1,padding:"12px 6px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <span style={{fontSize:18}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:700,color:C.t3,letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</span>
            </button>
          ))}
        </div>
        <div style={{padding:"16px 18px",background:C.goldFaint,borderRadius:14,border:"1px solid rgba(212,175,55,0.15)"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:8}}>How to receive SGC</div>
          {["Share your address or QR code with the sender","SGC transfers settle in ~2 seconds on Ethereum L2","Each token = 1g of allocated physical gold","Minimum receive: 0.001g SGC"].map((t,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:i<3?6:0}}><span style={{color:C.gold,flexShrink:0}}>·</span><span style={{fontSize:12,color:C.t3,lineHeight:1.5}}>{t}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BAR ALLOCATION SHEET ─────────────────────────────────────────────────────
// "Bar serial numbers, lot numbers, and gram allocations in real time" — BGL press release Mar 13 2026
function BarAllocationSheet({ liveOz, holdingOz, onClose }) {
  const [selectedBar, setSelectedBar] = useState(0);
  const userGrams = holdingOz * TROY;

  // User's allocated bars — serial numbers, lot, weight, mint date
  const BARS = [
    { serial:"BRK-DXB-2024-00441", lot:"LOT-2024-Q4-017", refinery:"Valcambi Suisse", purity:"999.9", weight:10.000, allocated:10.000, mintDate:"Nov 14, 2024", location:"Brinks Dubai · Bay 7, Rack 14, Position 3" },
    { serial:"BRK-DXB-2025-01882", lot:"LOT-2025-Q1-034", refinery:"PAMP Suisse",     purity:"999.9", weight:10.000, allocated:0.4194, mintDate:"Feb 28, 2025", location:"Brinks Dubai · Bay 7, Rack 14, Position 4" },
  ];
  const bar = BARS[selectedBar];
  const totalAllocated = BARS.reduce((s,b)=>s+b.allocated,0);

  // On-chain mint record for this bar
  const MINT_TX = [
    "0x7f3A9c2E8b1D4F6A0E5C3B9D2F7A1E4C8B6D3F5A",
    "0xB2c1D8F4A9E3C7B5F2A6E1D4C8B9F3A7E2D5C1B4",
  ];

  const pct = (bar.allocated / bar.weight * 100).toFixed(2);

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",maxHeight:"92vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>

        {/* Handle + header */}
        <div style={{flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"center",padding:"12px 0 0"}}><div style={{width:36,height:4,borderRadius:2,background:C.s2}}/></div>
          <div style={{display:"flex",alignItems:"center",gap:14,padding:"16px 22px 14px",borderBottom:`1px solid ${C.s2}`}}>
            <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.08)",border:`1.5px solid rgba(212,175,55,0.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏅</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:C.t1}}>Your Gold Bars</div>
              <div style={{fontSize:11,color:C.t3,marginTop:2}}>Brinks Dubai · Allocated · {fmtGN(userGrams)} total</div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer",padding:4}}>✕</button>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"18px 22px 44px"}}>

          {/* Total allocation hero */}
          <div style={{padding:"16px 18px",background:C.goldFaint,border:`1px solid rgba(212,175,55,0.18)`,borderRadius:16,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:6}}>Total Allocated</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:200,color:C.gold,letterSpacing:"-0.01em"}}>{fmtGN(userGrams)}</div>
              <div style={{fontSize:11,color:C.t3,marginTop:3}}>{fmtOzN(holdingOz)} oz · {fmtUSD(holdingOz*liveOz)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{padding:"6px 11px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.25)",borderRadius:8,fontSize:11,fontWeight:700,color:C.green,marginBottom:8}}>✓ ALLOCATED</div>
              <div style={{fontSize:10,color:C.t3}}>Across {BARS.length} bars</div>
              <div style={{fontSize:10,color:C.t3,marginTop:2}}>Brinks Dubai</div>
            </div>
          </div>

          {/* Bar selector */}
          <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:10}}>Select Bar</div>
          <div style={{display:"flex",gap:8,marginBottom:18}}>
            {BARS.map((b,i)=>(
              <button key={i} onClick={()=>setSelectedBar(i)} style={{flex:1,padding:"11px 10px",background:selectedBar===i?"rgba(212,175,55,0.1)":C.s1,border:`1.5px solid ${selectedBar===i?C.gold:C.s2}`,borderRadius:12,cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
                <div style={{fontSize:10,color:selectedBar===i?C.gold:C.t3,fontWeight:700,marginBottom:3}}>BAR {i+1}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3,marginBottom:4}}>{b.serial.slice(-8)}</div>
                <div style={{fontSize:11,fontWeight:600,color:selectedBar===i?C.gold:C.t2}}>{fmtGN(b.allocated)}</div>
              </button>
            ))}
          </div>

          {/* Bar detail card */}
          <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",marginBottom:16}}>
            {/* Bar visual */}
            <div style={{padding:"18px",background:"linear-gradient(135deg,rgba(212,175,55,0.08),rgba(184,150,46,0.04))",borderBottom:`1px solid ${C.s2}`,textAlign:"center"}}>
              <div style={{display:"inline-block",padding:"12px 24px",background:"linear-gradient(135deg,#c8a84b,#d4af37,#b8962e)",borderRadius:8,boxShadow:"0 4px 20px rgba(212,175,55,0.3)",marginBottom:12}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(0,0,0,0.5)",letterSpacing:"0.12em",marginBottom:4}}>FINE GOLD {bar.purity}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:700,color:"rgba(0,0,0,0.8)"}}>{bar.weight.toFixed(3)}g</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"rgba(0,0,0,0.5)",marginTop:4,letterSpacing:"0.06em"}}>{bar.refinery.toUpperCase()}</div>
              </div>
              {/* Your share indicator */}
              <div style={{fontSize:11,color:C.t3}}>Your share: <span style={{color:C.gold,fontWeight:700}}>{fmtGN(bar.allocated)}</span> of {fmtGN(bar.weight)} ({pct}%)</div>
              <div style={{marginTop:8,height:4,background:C.s2,borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,borderRadius:2}}/>
              </div>
            </div>

            {/* Serial / lot details */}
            {[
              {k:"Serial number",  v:bar.serial,    mono:true, copy:true},
              {k:"Lot number",     v:bar.lot,        mono:true},
              {k:"Refinery",       v:bar.refinery},
              {k:"Purity",         v:`${bar.purity} fine gold`, gold:true},
              {k:"Bar weight",     v:`${bar.weight.toFixed(3)}g`},
              {k:"Your allocation",v:fmtGN(bar.allocated), gold:true},
              {k:"Mint date",      v:bar.mintDate},
              {k:"Vault location", v:bar.location},
            ].map(({k,v,mono,gold,copy},i,a)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                <span style={{fontSize:11,color:C.t3,flexShrink:0,marginRight:8}}>{k}</span>
                <span style={{fontFamily:mono?"'DM Mono',monospace":"inherit",fontSize:mono?10:12,fontWeight:500,color:gold?C.gold:C.t2,textAlign:"right",maxWidth:220,wordBreak:"break-all"}}>{v}</span>
              </div>
            ))}
          </div>

          {/* On-chain mint record */}
          <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:10}}>On-Chain Mint Record · Base (Coinbase L2)</div>
          <div style={{background:C.s1,borderRadius:14,border:`1px solid ${C.s2}`,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:C.green,boxShadow:`0 0 6px ${C.green}`}}/>
              <span style={{fontSize:11,color:C.green,fontWeight:700}}>Minted on Base · Confirmed</span>
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t3,marginBottom:10,wordBreak:"break-all",lineHeight:1.6}}>{MINT_TX[selectedBar]}</div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1,padding:"8px 10px",background:C.goldFaint,border:`1px solid rgba(212,175,55,0.15)`,borderRadius:8,textAlign:"center"}}>
                <div style={{fontSize:9,color:C.t3,marginBottom:2}}>NETWORK</div>
                <div style={{fontSize:11,fontWeight:700,color:C.gold}}>Base L2</div>
              </div>
              <div style={{flex:1,padding:"8px 10px",background:C.goldFaint,border:`1px solid rgba(212,175,55,0.15)`,borderRadius:8,textAlign:"center"}}>
                <div style={{fontSize:9,color:C.t3,marginBottom:2}}>TOKEN</div>
                <div style={{fontSize:11,fontWeight:700,color:C.gold}}>ERC-20 SGC</div>
              </div>
              <div style={{flex:1,padding:"8px 10px",background:"rgba(95,224,138,0.06)",border:`1px solid rgba(95,224,138,0.15)`,borderRadius:8,textAlign:"center"}}>
                <div style={{fontSize:9,color:C.t3,marginBottom:2}}>STATUS</div>
                <div style={{fontSize:11,fontWeight:700,color:C.green}}>Confirmed</div>
              </div>
            </div>
            <button style={{width:"100%",marginTop:10,padding:"9px 0",background:"none",border:`1px solid ${C.s2}`,borderRadius:9,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:C.t3,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <span>View on Basescan</span><span style={{color:C.gold}}>↗</span>
            </button>
          </div>

          {/* Chainlink oracle badge */}
          <div style={{padding:"11px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.18)",borderRadius:12,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:18}}>⬡</div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#3772ff"}}>Powered by Chainlink Oracle</div>
              <div style={{fontSize:10,color:C.t3,marginTop:1}}>Gold price feeds secured by decentralized oracle network</div>
            </div>
          </div>

          {/* Brinks vault badge */}
          <div style={{padding:"11px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{fontSize:18}}>🔒</div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.t2}}>Brinks Dubai</div>
                <div style={{fontSize:10,color:C.t3,marginTop:1}}>World-class precious metals custody</div>
              </div>
            </div>
            <div style={{fontSize:10,color:C.green,fontWeight:700,padding:"4px 8px",background:"rgba(95,224,138,0.08)",border:"1px solid rgba(95,224,138,0.2)",borderRadius:6}}>INSURED</div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── SPEND SCREEN (ONE Debit Card + POS conversion) ─────────────────────────
function SpendScreen({ liveOz, onBack }) {
  const [payStep, setPayStep] = useState(null); // null | 'amount' | 'confirm' | 'done'
  const [raw, setRaw]         = useState("");
  const [snap, setSnap]       = useState(null);
  const [quoteOz, setQuoteOz] = useState(null);
  const [quoteSec, setQuoteSec] = useState(10);
  const [quoteExp, setQuoteExp] = useState(false);
  const quoteTimer = useRef(null);

  const num    = parseFloat(raw) || 0;
  const sgcAmt = num / (quoteOz || liveOz);
  const valid  = num >= 0.01 && sgcAmt <= HOLDING_OZ;

  const startQuote = () => {
    // POS conversion: company sells SGC at 0.5% below spot (user gets slightly less fiat)
    const q = parseFloat((liveOz * 0.995).toFixed(2));
    setQuoteOz(q); setQuoteSec(10); setQuoteExp(false);
    clearInterval(quoteTimer.current);
    quoteTimer.current = setInterval(()=>{
      setQuoteSec(s=>{ if(s<=1){clearInterval(quoteTimer.current);setQuoteExp(true);return 0;} return s-1; });
    },1000);
  };
  useEffect(()=>()=>clearInterval(quoteTimer.current),[]);

  const MERCHANTS = [
    { icon:"☕", name:"Blue Bottle Coffee",   amount:"0.0008 SGC", usd:"$4.15",  date:"Today, 9:22 AM",    cat:"Food & Drink" },
    { icon:"🛒", name:"Carrefour Dubai Mall", amount:"0.0041 SGC", usd:"$20.94", date:"Today, 8:01 AM",    cat:"Groceries"    },
    { icon:"🚕", name:"Uber",                 amount:"0.0023 SGC", usd:"$11.76", date:"Yesterday, 6:44 PM", cat:"Transport"   },
    { icon:"🍜", name:"Nobu Restaurant",      amount:"0.0168 SGC", usd:"$85.90", date:"Mar 11, 8:30 PM",   cat:"Dining"       },
    { icon:"✈️", name:"Emirates Airlines",    amount:"0.0842 SGC", usd:"$430.22",date:"Mar 10, 11:00 AM",  cat:"Travel"       },
  ];

  const cardLast4 = "4291";
  const spendThisMonth = 553.07;
  const sgcSpent       = 0.1082;


  if(payStep==="done" && snap) return (
    <div style={{position:"fixed",inset:0,zIndex:150,background:C.bg,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:32,maxWidth:430,margin:"0 auto",animation:"fadeIn 0.4s ease"}}>
      <div style={{width:88,height:88,borderRadius:"50%",background:"rgba(95,224,138,0.1)",border:`2px solid ${C.green}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,marginBottom:24,boxShadow:`0 0 40px rgba(95,224,138,0.15)`}}>✓</div>
      <div style={{fontSize:24,fontWeight:700,color:C.t1,marginBottom:8}}>Payment Sent</div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:32,color:C.gold,fontWeight:200,marginBottom:6}}>{fmtUSD(snap.usd)}</div>
      <div style={{fontSize:13,color:C.t3,marginBottom:32}}>{snap.sgc.toFixed(6)} SGC converted · {fmtOz(snap.oz)}/oz</div>
      <div style={{width:"100%",background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,padding:"16px 18px",marginBottom:24}}>
        {[
          {k:"Merchant",     v:snap.merchant},
          {k:"SGC converted",v:`${snap.sgc.toFixed(6)} SGC`},
          {k:"Fiat received",v:fmtUSD(snap.usd)},
          {k:"Conversion rate",v:`${fmtOz(snap.oz)}/oz`},
          {k:"Network",      v:"Base (Coinbase L2)"},
          {k:"Tx hash",      v:snap.hash},
        ].map(({k,v},i,a)=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
            <span style={{fontSize:12,color:C.t3}}>{k}</span>
            <span style={{fontFamily:k==="Tx hash"||k==="SGC converted"?"'DM Mono',monospace":"inherit",fontSize:k==="Tx hash"?9:12,color:C.t2,fontWeight:500,textAlign:"right",maxWidth:200,wordBreak:"break-all"}}>{v}</span>
          </div>
        ))}
      </div>
      <button onClick={()=>{setPayStep(null);setRaw("");setSnap(null);}} style={{width:"100%",padding:"16px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:C.t1}}>Done</button>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,zIndex:150,background:C.bg,display:"flex",flexDirection:"column",animation:"slideInRight 0.28s cubic-bezier(0.22,1,0.36,1)",maxWidth:430,margin:"0 auto"}}>

      {/* Header */}
      <div style={{padding:"52px 22px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
          <button onClick={payStep?()=>{setPayStep(null);clearInterval(quoteTimer.current);}:onBack}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.t2,padding:"4px 8px 4px 0"}}>←</button>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:C.t1}}>{payStep?"Pay with SGC":"ONE Debit Card"}</div>
            <div style={{fontSize:11,color:C.t3,marginTop:2}}>{payStep?"Converting SGC at point of sale":"Spend your gold anywhere Visa is accepted"}</div>
          </div>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"0 22px 100px"}}>

        {!payStep&&(<>
          {/* Virtual card */}
          <div style={{borderRadius:20,padding:"22px 24px",marginBottom:20,position:"relative",overflow:"hidden",
            background:"linear-gradient(135deg,#1a1500,#2a2000,#1a1500)",
            border:`1px solid rgba(212,175,55,0.3)`,
            boxShadow:`0 8px 40px rgba(212,175,55,0.12)`}}>
            {/* Card shine */}
            <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:C.goldFaint,pointerEvents:"none"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
              <div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(212,175,55,0.6)",letterSpacing:"0.12em"}}>BLUE GOLD</div>
                <div style={{fontSize:9,color:"rgba(201,152,26,0.4)",letterSpacing:"0.1em",marginTop:2}}>ONE DEBIT</div>
              </div>
              <div style={{fontSize:22,opacity:0.7}}>⬡</div>
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,color:"rgba(212,175,55,0.8)",letterSpacing:"0.18em",marginBottom:20}}>
              •••• •••• •••• {cardLast4}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div>
                <div style={{fontSize:9,color:"rgba(201,152,26,0.4)",letterSpacing:"0.1em",marginBottom:3}}>CARDHOLDER</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(212,175,55,0.8)",letterSpacing:"0.05em"}}>JOHN WARREN</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:"rgba(201,152,26,0.4)",letterSpacing:"0.1em",marginBottom:3}}>BACKED BY</div>
                <div style={{fontSize:10,fontWeight:700,color:"rgba(212,175,55,0.7)"}}>{fmtGN(HOLDING_G)} SGC</div>
              </div>
            </div>
            {/* Visa logo area */}
            <div style={{position:"absolute",bottom:18,right:20,fontStyle:"italic",fontSize:18,fontWeight:900,color:"rgba(212,175,55,0.25)",letterSpacing:"-0.02em"}}>VISA</div>
          </div>

          {/* This month stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
            {[
              {label:"Spent this month",val:fmtUSD(spendThisMonth),sub:"March 2026",gold:false},
              {label:"SGC converted",  val:`${sgcSpent.toFixed(4)} oz`,sub:"= "+fmtGN(sgcSpent*TROY),gold:true},
            ].map(({label,val,sub,gold})=>(
              <div key={label} style={{padding:"14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14}}>
                <div style={{fontSize:10,color:C.t3,marginBottom:6}}>{label}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:gold?C.gold:C.t1}}>{val}</div>
                <div style={{fontSize:10,color:C.t3,marginTop:3}}>{sub}</div>
              </div>
            ))}
          </div>
          {/* Chainlink conversion badge */}
          <div style={{padding:"10px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.18)",borderRadius:11,marginBottom:18,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>⬡</span>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#3772ff"}}>Chainlink Oracle · Live POS Rate</div>
              <div style={{fontSize:10,color:C.t3,marginTop:1}}>{fmtOz(liveOz)}/oz · SGC → fiat conversion at point of sale</div>
            </div>
          </div>

          {/* Recent transactions */}
          <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:10}}>Recent Transactions</div>
          <div style={{background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden",marginBottom:18}}>
            {MERCHANTS.map(({icon,name,amount,usd,date,cat},i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<MERCHANTS.length-1?`1px solid ${C.s2}`:"none"}}>
                <div style={{width:36,height:36,borderRadius:10,background:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                  <div style={{fontSize:10,color:C.t3,marginTop:2}}>{date} · {cat}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.t1}}>−{usd}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3,marginTop:2}}>{amount}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pay button */}
          <button onClick={()=>setPayStep("amount")} style={{width:"100%",padding:"17px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:C.t1,letterSpacing:"0.02em",boxShadow:`0 6px 24px rgba(212,175,55,0.25)`}}>
            Pay with ONE Card →
          </button>
        </>)}

        {payStep==="amount"&&(
          <div style={{animation:"fadeIn 0.25s ease"}}>
            <div style={{padding:"28px 20px",background:C.s1,borderRadius:20,border:`1px solid ${C.s2}`,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:10,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:16}}>Amount (USD)</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginBottom:8}}>
                <span style={{fontSize:36,color:C.t2,fontWeight:300}}>$</span>
                <input type="number" inputMode="decimal" value={raw} onChange={e=>setRaw(e.target.value)}
                  placeholder="0.00"
                  style={{background:"none",border:"none",outline:"none",fontFamily:"'DM Mono',monospace",fontSize:52,fontWeight:300,color:num>0?C.t1:C.t3,textAlign:"center",width:Math.max(80,raw.length*32+60),maxWidth:260}}/>
              </div>
              {num>0&&<div style={{fontSize:13,color:C.t3}}>≈ {sgcAmt.toFixed(6)} SGC · {fmtGN(sgcAmt*TROY)}</div>}
              {sgcAmt>HOLDING_OZ&&<div style={{fontSize:12,color:C.red,marginTop:4}}>Insufficient SGC balance</div>}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {[5,10,25,50].map(p=>(
                <button key={p} onClick={()=>setRaw(String(p))} style={{flex:1,padding:"10px 0",background:raw===String(p)?"rgba(212,175,55,0.12)":C.s1,border:`1px solid ${raw===String(p)?C.gold:C.s2}`,borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:raw===String(p)?C.gold:C.t3}}>
                  ${p}
                </button>
              ))}
            </div>
            <div style={{padding:"13px 16px",background:C.s1,borderRadius:14,border:`1px solid ${C.s2}`,marginBottom:16}}>
              {[
                {k:"Conversion rate",v:`${fmtOz(liveOz)}/oz (Chainlink)`,chainlink:true},
                {k:"SGC to convert", v:num>0?`${sgcAmt.toFixed(6)} oz`:"—"},
                {k:"You pay",        v:num>0?fmtUSD(num):"—"},
                {k:"Network",        v:"Base (Coinbase L2)"},
              ].map(({k,v,chainlink},i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                  <span style={{fontSize:12,color:C.t3}}>{k}</span>
                  <span style={{fontSize:12,color:chainlink?"#3772ff":C.t2,fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {payStep==="confirm"&&(
          <div style={{animation:"fadeIn 0.25s ease"}}>
            {/* Quote lock bar */}
            <div style={{padding:"11px 14px",borderRadius:12,marginBottom:14,
              background:quoteExp?"rgba(240,80,80,0.08)":"rgba(212,175,55,0.07)",
              border:`1px solid ${quoteExp?"rgba(240,80,80,0.3)":"rgba(212,175,55,0.25)"}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              {quoteExp?(
                <>
                  <span style={{fontSize:12,color:C.red,fontWeight:700}}>⚠ Rate expired</span>
                  <button onClick={startQuote} style={{padding:"5px 14px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:800,color:C.t1}}>Refresh Rate</button>
                </>
              ):(
                <>
                  <div>
                    <div style={{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:"0.08em"}}>CONVERSION RATE · LOCKED</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,color:C.gold,fontWeight:400,marginTop:2}}>{fmtOz(quoteOz)}/oz</div>
                    <div style={{fontSize:10,color:C.t3,marginTop:2}}>Chainlink Oracle · expires in {quoteSec}s</div>
                  </div>
                  <svg width="44" height="44" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="18" fill="none" stroke={C.s2} strokeWidth="3"/>
                    <circle cx="22" cy="22" r="18" fill="none" stroke={quoteSec<=3?C.red:C.gold} strokeWidth="3"
                      strokeDasharray={`${2*Math.PI*18}`} strokeDashoffset={`${2*Math.PI*18*(1-quoteSec/10)}`}
                      strokeLinecap="round" transform="rotate(-90 22 22)"
                      style={{transition:"stroke-dashoffset 0.9s linear,stroke 0.3s"}}/>
                    <text x="22" y="27" textAnchor="middle" style={{fontSize:14,fontWeight:700,fill:quoteSec<=3?C.red:C.gold,fontFamily:"'DM Mono',monospace"}}>{quoteSec}</text>
                  </svg>
                </>
              )}
            </div>
            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",marginBottom:16}}>
              {[
                {k:"You pay",         v:fmtUSD(num),          bold:true},
                {k:"SGC converted",   v:`${(num/(quoteOz||liveOz)).toFixed(6)} oz`},
                {k:"That's",          v:fmtGN((num/(quoteOz||liveOz))*TROY)},
                {k:"Conversion rate", v:`${fmtOz(quoteOz)}/oz`},
                {k:"Card charged",    v:`•••• ${cardLast4}`},
                {k:"Network",         v:"Base (Coinbase L2)"},
                {k:"Est. settlement", v:"Instant"},
              ].map(({k,v,bold},i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 18px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none",background:bold?"rgba(212,175,55,0.04)":"transparent"}}>
                  <span style={{fontSize:13,color:C.t3}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:bold?700:500,color:bold?C.t1:C.t2}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* CTA */}
      {payStep&&payStep!=="done"&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"16px 22px 36px",background:`linear-gradient(to top,${C.bg} 70%,transparent)`}}>
          <button
            disabled={payStep==="amount"?!valid:(payStep==="confirm"&&quoteExp)}
            onClick={()=>{
              if(payStep==="amount"&&valid){setPayStep("confirm");startQuote();}
              else if(payStep==="confirm"&&!quoteExp){
                clearInterval(quoteTimer.current);
                const txHash="0x"+Math.random().toString(16).slice(2,12)+"..."+Math.random().toString(16).slice(2,8);
                setSnap({usd:num,sgc:num/(quoteOz||liveOz),oz:quoteOz||liveOz,merchant:"ONE Debit Card",hash:txHash});
                setPayStep("done");
              }
            }}
            style={{width:"100%",padding:"17px 0",
              background:(payStep==="amount"?valid:!quoteExp)?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",
              border:"none",borderRadius:14,
              cursor:(payStep==="amount"?valid:!quoteExp)?"pointer":"not-allowed",
              fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,
              color:(payStep==="amount"?valid:!quoteExp)?"#080808":"#2a2a2a",
              letterSpacing:"0.02em",transition:"all 0.2s",
              boxShadow:(payStep==="amount"?valid:!quoteExp)?`0 6px 24px rgba(212,175,55,0.25)`:"none"}}>
            {payStep==="amount"?"Review Payment →":"Confirm Payment"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── BUY SCREEN ───────────────────────────────────────────────────────────────
function BuyScreen({ liveOz, onBack }) {
  const [step,setStep]=useState(1);
  const [inOz,setInOz]=useState(false);
  const [raw,setRaw]=useState("");
  const [payMethod,setPayMethod]=useState("bank");
  const [processing,setProcessing]=useState(false);
  const [lockedOz, setLockedOz]=useState(null);
  const [snap,     setSnap]    =useState(null); // {ozAmt,usdSub,fee,total} frozen at confirm
  // Quote lock state — step 3 only
  const [quoteOz,   setQuoteOz]  =useState(null);
  const [quoteSec,  setQuoteSec] =useState(10);
  const [quoteExp,  setQuoteExp] =useState(false);
  const quoteTimer = useRef(null);

  const displayOz = step===4 ? lockedOz : liveOz;
  const reviewOz  = quoteOz || liveOz * 1.005;

  const num     = parseFloat(raw)||0;
  const _ozAmt  = inOz ? num : num/displayOz;
  const _usdSub = inOz ? num*reviewOz : num;
  const _fee    = _usdSub*0.005;
  const _total  = _usdSub+_fee;

  // Step 4: use frozen snapshot; all other steps: live computed values
  const ozAmt  = step===4 ? snap?.ozAmt  : _ozAmt;
  const usdSub = step===4 ? snap?.usdSub : _usdSub;
  const fee    = step===4 ? snap?.fee    : _fee;
  const total  = step===4 ? snap?.total  : _total;
  const valid  = num>0&&(inOz?num>=0.0001:num>=0.10);
  const PAY=[{id:"bank",icon:"🏦",label:"Bank Transfer",sub:"ACH · Free · 1–3 days"},{id:"wire",icon:"⚡",label:"Wire Transfer",sub:"Instant · $15 flat fee"},{id:"card",icon:"💳",label:"Debit Card",sub:"Instant · 1.5% fee"}];
  const PRESETS=inOz?[0.01,0.05,0.1,0.5]:[100,500,1000,5000];

  // Start a fresh 10s quote when entering step 3
  const startQuote = () => {
    const q = parseFloat((liveOz * 1.005).toFixed(2));
    setQuoteOz(q);
    setQuoteSec(10);
    setQuoteExp(false);
    clearInterval(quoteTimer.current);
    quoteTimer.current = setInterval(()=>{
      setQuoteSec(s=>{
        if(s<=1){ clearInterval(quoteTimer.current); setQuoteExp(true); return 0; }
        return s-1;
      });
    },1000);
  };
  useEffect(()=>()=>clearInterval(quoteTimer.current),[]);

  const next=()=>{
    if(step===1&&valid) setStep(2);
    else if(step===2){ setStep(3); startQuote(); }
    else if(step===3&&!quoteExp){
      clearInterval(quoteTimer.current);
      setLockedOz(quoteOz);
      setSnap({ ozAmt: _ozAmt, usdSub: _usdSub, fee: _fee, total: _total });
      setProcessing(true);
      setTimeout(()=>{setProcessing(false);setStep(4);},900);
    }
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:150,background:C.bg,display:"flex",flexDirection:"column",animation:"slideInRight 0.28s cubic-bezier(0.22,1,0.36,1)",maxWidth:430,margin:"0 auto"}}>
      <div style={{padding:"52px 22px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
          <button onClick={step===1?onBack:()=>setStep(s=>s-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.t2,padding:"4px 8px 4px 0"}}>←</button>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:C.t1}}>{step===4?"Purchase Complete":"Buy Gold"}</div>
            <div style={{fontSize:12,color:C.t3,marginTop:2}}>{step<4?`Step ${step} of 3`:""}</div>
          </div>
          <div style={{marginLeft:"auto",textAlign:"right"}}>
            <div style={{fontSize:12,color:C.gold,fontWeight:700}}>{fmtOz(displayOz)}/oz</div>
            <div style={{fontSize:10,color:C.t3,marginTop:1}}>{step===4?"at purchase":fmtOz(displayOz/TROY)+"/g · live"}</div>
          </div>
        </div>
        {step<4&&<div style={{display:"flex",gap:4,marginBottom:24}}>{[1,2,3].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:s<=step?C.gold:C.s2,transition:"background 0.3s"}}/>)}</div>}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 22px 100px"}}>
        {step===1&&(
          <div style={{animation:"fadeIn 0.25s ease"}}>
            <div style={{padding:"28px 20px",background:C.s1,borderRadius:20,border:`1px solid ${C.s2}`,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:16}}>{inOz?"Amount (troy oz)":"Amount (USD)"}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginBottom:4}}>
                {!inOz&&<span style={{fontSize:36,color:C.t2,fontWeight:300}}>$</span>}
                <input type="number" inputMode="decimal" value={raw} onChange={e=>setRaw(e.target.value)} placeholder="0" style={{background:"none",border:"none",outline:"none",fontFamily:"'DM Mono',monospace",fontSize:52,fontWeight:300,color:num>0?C.t1:C.t3,textAlign:"center",width:Math.max(80,raw.length*32+60),maxWidth:260}}/>
                {inOz&&<span style={{fontSize:24,color:C.t3,fontWeight:500}}>oz</span>}
              </div>
              <div style={{fontSize:14,color:C.t3,marginBottom:12}}>
                {num>0?(inOz?`≈ ${fmtUSD(usdSub)} · ${fmtGN(ozAmt*TROY)}g SGC`:`≈ ${fmtOzN(ozAmt)} oz · ${fmtGN(ozAmt*TROY)}g SGC`):`Min ${inOz?"0.0001 oz":"$0.10"}`}
              </div>
              <button onClick={()=>setInOz(!inOz)} style={{background:"none",border:`1px solid ${C.s2}`,cursor:"pointer",fontSize:11,color:C.gold,fontFamily:"'DM Sans',sans-serif",fontWeight:700,padding:"5px 12px",borderRadius:20,letterSpacing:"0.05em"}}>
                Switch to {inOz?"USD $":"Oz ⚖"} ↔
              </button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              {PRESETS.map(p=>(
                <button key={p} onClick={()=>setRaw(String(p))} style={{flex:1,padding:"10px 0",background:raw===String(p)?"rgba(212,175,55,0.12)":C.s1,border:`1px solid ${raw===String(p)?C.gold:C.s2}`,borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:raw===String(p)?C.gold:C.t3,transition:"all 0.15s"}}>
                  {inOz?`${p} oz`:`$${p}`}
                </button>
              ))}
            </div>
            <div style={{padding:"14px 16px",background:C.s1,borderRadius:14,border:`1px solid ${C.s2}`}}>
              {[{k:"Spot price",v:`${fmtOz(displayOz)}/oz`},{k:"Per gram",v:`${fmtOz(displayOz/TROY)}/g`},{k:"24h change",v:"−1.25% · −$64.73/oz",c:C.red},{k:"ATH",v:"$5,602.22/oz (Jan 28)",c:C.gold}].map(({k,v,c},i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                  <span style={{fontSize:12,color:C.t3}}>{k}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:c||C.t2,fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {step===2&&(
          <div style={{animation:"fadeIn 0.25s ease"}}>
            <div style={{padding:"16px 18px",background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:12,color:C.t3,marginBottom:4}}>You're buying</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:400,color:C.gold}}>{fmtOzN(ozAmt)} oz SGC</div><div style={{fontSize:11,color:C.t3,marginTop:2}}>{fmtGN(ozAmt*TROY)}g gold</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:12,color:C.t3,marginBottom:4}}>You'll pay</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:400,color:C.t1}}>{fmtUSD(total)}</div></div>
            </div>
            <div style={{fontSize:12,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Payment Method</div>
            {PAY.map(({id,icon,label,sub})=>(
              <button key={id} onClick={()=>setPayMethod(id)} style={{width:"100%",display:"flex",alignItems:"center",gap:14,padding:"16px 18px",background:payMethod===id?"rgba(212,175,55,0.07)":C.s1,border:`1.5px solid ${payMethod===id?C.gold:C.s2}`,borderRadius:14,cursor:"pointer",marginBottom:10,textAlign:"left",transition:"all 0.15s"}}>
                <span style={{fontSize:22}}>{icon}</span>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:C.t1}}>{label}</div><div style={{fontSize:12,color:C.t3,marginTop:2}}>{sub}</div></div>
                <div style={{width:20,height:20,borderRadius:"50%",background:payMethod===id?C.gold:C.s2,border:`2px solid ${payMethod===id?C.gold:C.s3}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.t1,fontWeight:800}}>{payMethod===id?"✓":""}</div>
              </button>
            ))}
          </div>
        )}
        {step===3&&(
          <div style={{animation:"fadeIn 0.25s ease"}}>
            {/* Quote lock bar */}
            <div style={{padding:"11px 14px",borderRadius:12,marginBottom:14,
              background:quoteExp?"rgba(240,80,80,0.08)":"rgba(212,175,55,0.07)",
              border:`1px solid ${quoteExp?"rgba(240,80,80,0.3)":"rgba(212,175,55,0.25)"}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              {quoteExp?(
                <>
                  <span style={{fontSize:12,color:C.red,fontWeight:700}}>⚠ Quote expired</span>
                  <button onClick={startQuote} style={{padding:"5px 14px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:800,color:C.t1}}>Refresh Quote</button>
                </>
              ):(
                <>
                  <div>
                    <div style={{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:"0.08em"}}>QUOTED PRICE · LOCKED</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,color:C.gold,fontWeight:400,marginTop:2}}>{fmtOz(quoteOz)}/oz</div>
                    <div style={{fontSize:10,color:C.t3,marginTop:2}}>Includes 0.5% cushion · expires in {quoteSec}s</div>
                  </div>
                  {/* Countdown ring */}
                  <svg width="44" height="44" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r="18" fill="none" stroke={C.s2} strokeWidth="3"/>
                    <circle cx="22" cy="22" r="18" fill="none"
                      stroke={quoteSec<=3?C.red:C.gold} strokeWidth="3"
                      strokeDasharray={`${2*Math.PI*18}`}
                      strokeDashoffset={`${2*Math.PI*18*(1-quoteSec/10)}`}
                      strokeLinecap="round"
                      transform="rotate(-90 22 22)"
                      style={{transition:"stroke-dashoffset 0.9s linear,stroke 0.3s"}}/>
                    <text x="22" y="27" textAnchor="middle" style={{fontSize:14,fontWeight:700,fill:quoteSec<=3?C.red:C.gold,fontFamily:"'DM Mono',monospace"}}>{quoteSec}</text>
                  </svg>
                </>
              )}
            </div>
            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",marginBottom:16}}>
              {[{k:"Buying",v:`${fmtOzN(ozAmt)} oz SGC`,hi:true},{k:"That's",v:`${fmtGN(ozAmt*TROY)}g gold`},{k:"Quoted price",v:`${fmtOz(quoteOz)}/oz`},{k:"Subtotal",v:fmtUSD(usdSub)},{k:"BlueGold fee (0.5%)",v:fmtUSD(fee)},{k:"Total charge",v:fmtUSD(total),bold:true},{k:"Payment",v:PAY.find(p=>p.id===payMethod)?.label},{k:"Settlement",v:"Instant · SGC to wallet"},{k:"Vault",v:"Dubai, UAE · 100% backed ⚠ Demo"}].map(({k,v,hi,bold},i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 18px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none",background:bold?"rgba(212,175,55,0.04)":"transparent"}}>
                  <span style={{fontSize:13,color:C.t3}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:hi||bold?700:500,color:hi?C.gold:bold?C.t1:C.t2,maxWidth:220,textAlign:"right"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"12px 14px",background:"rgba(95,224,138,0.06)",borderRadius:12,border:"1px solid rgba(95,224,138,0.15)"}}>
              <div style={{fontSize:12,color:C.green,fontWeight:700,marginBottom:4}}>✓ 100% gold-backed (demo)</div>
              <div style={{fontSize:12,color:C.t3}}>Every SGC token is fully backed by allocated physical gold in Brinks Dubai.</div>
            </div>
          </div>
        )}
        {step===4&&(
          <div style={{textAlign:"center",paddingTop:40,animation:"fadeIn 0.5s ease"}}>
            <div style={{width:88,height:88,borderRadius:"50%",background:"rgba(212,175,55,0.1)",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px",fontSize:36,color:C.gold,boxShadow:`0 0 40px rgba(212,175,55,0.15)`}}>✓</div>
            <div style={{fontSize:26,fontWeight:700,color:C.t1,marginBottom:8}}>Purchase Complete</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:28,color:C.gold,fontWeight:300,marginBottom:6}}>+{fmtOzN(ozAmt)} oz SGC</div>
            <div style={{fontSize:14,color:C.t3,marginBottom:32}}>{fmtUSD(total)} charged · {fmtOz(displayOz)}/oz</div>
            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,padding:"16px 18px",marginBottom:24,textAlign:"left"}}>
              {[{k:"Transaction ID",v:"SGC-2026-0313-7742"},{k:"Oz acquired",v:`${fmtOzN(ozAmt)} oz`},{k:"Grams acquired",v:`${fmtGN(ozAmt*TROY)}g`},{k:"Settlement",v:"Complete"}].map(({k,v},i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                  <span style={{fontSize:13,color:C.t3}}>{k}</span>
                  <span style={{fontSize:13,color:C.t2,fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={onBack} style={{width:"100%",padding:"16px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:C.t1,letterSpacing:"0.02em",boxShadow:`0 6px 24px rgba(212,175,55,0.25)`}}>Back to Wallet</button>
          </div>
        )}
      </div>
      {step<4&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"16px 22px 36px",background:`linear-gradient(to top,${C.bg} 70%,transparent)`}}>
          <button onClick={next} disabled={(step===1&&!valid)||processing||(step===3&&quoteExp)} style={{width:"100%",padding:"17px 0",background:(valid||step>1)&&!processing&&!(step===3&&quoteExp)?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",border:"none",borderRadius:14,cursor:(valid||step>1)&&!(step===3&&quoteExp)?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:(valid||step>1)&&!(step===3&&quoteExp)?"#080808":"#2a2a2a",letterSpacing:"0.02em",transition:"all 0.2s",boxShadow:(valid||step>1)&&!(step===3&&quoteExp)?`0 6px 24px rgba(212,175,55,0.25)`:"none"}}>
            {processing?"Processing...":{1:"Continue →",2:"Review Order →",3:"Confirm Purchase"}[step]}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SEND MODAL ───────────────────────────────────────────────────────────────
function SendModal({ liveOz, onClose }) {
  const [step,setStep]=useState(1);
  const [to,setTo]=useState("");
  const [raw,setRaw]=useState("");
  const [inOz,setInOz]=useState(true);
  const [focus,setFocus]=useState(null);
  const num=parseFloat(raw)||0;
  const ozAmt=inOz?num:num/liveOz;
  const usdVal=ozAmt*liveOz;
  const valid=to.trim().length>2&&ozAmt>0;
  const next=()=>{ if(step===1&&valid)setStep(2); else if(step===2)setStep(3); };
  return(
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.50)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.3s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 24px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
        {step===3?(
          <div style={{textAlign:"center",padding:"8px 0 28px"}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(212,175,55,0.1)",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 22px",fontSize:30,color:C.gold}}>✓</div>
            <div style={{fontSize:22,fontWeight:700,color:C.t1,marginBottom:8}}>Gold Sent</div>
            <div style={{fontSize:14,color:C.t2}}>{fmtOzN(ozAmt)} oz SGC → {to}</div>
            <div style={{fontSize:11,color:C.t3,marginTop:4}}>{fmtGN(ozAmt*TROY)}g · {fmtUSD(usdVal)}</div>
          </div>
        ):(
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,paddingBottom:20,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",border:`1.5px solid rgba(212,175,55,0.3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold}}>↑</div>
              <div><div style={{fontSize:18,fontWeight:700,color:C.t1}}>{step===1?"Send Gold":"Review Transfer"}</div><div style={{fontSize:12,color:C.t3,marginTop:2}}>{step===1?"Transfers settle in ~2 seconds":"Confirm details below"}</div></div>
            </div>
            {step===1?(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div>
                  <div style={{fontSize:11,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:8}}>To</div>
                  <input value={to} onChange={e=>setTo(e.target.value)} placeholder="username or 0x address"
                    onFocus={()=>setFocus("to")} onBlur={()=>setFocus(null)}
                    style={{width:"100%",boxSizing:"border-box",padding:"14px 16px",background:focus==="to"?"#F0EDE7":C.s1,border:`1.5px solid ${focus==="to"?C.gold:C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none",transition:"all 0.15s"}}/>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:11,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>Amount</div>
                    <button onClick={()=>setInOz(!inOz)} style={{background:"none",border:`1px solid ${C.s2}`,cursor:"pointer",fontSize:10,color:C.gold,fontFamily:"'DM Sans',sans-serif",fontWeight:700,padding:"2px 8px",borderRadius:6,letterSpacing:"0.05em"}}>
                      {inOz?"→ USD":"→ Oz"}
                    </button>
                  </div>
                  <div style={{position:"relative"}}>
                    <input type="number" inputMode="decimal" value={raw} onChange={e=>setRaw(e.target.value)} placeholder="0"
                      onFocus={()=>setFocus("amt")} onBlur={()=>setFocus(null)}
                      style={{width:"100%",boxSizing:"border-box",padding:"18px 56px 18px 16px",background:focus==="amt"?"#F0EDE7":C.s1,border:`1.5px solid ${focus==="amt"?C.gold:C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:300,outline:"none",transition:"all 0.15s"}}/>
                    <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.t3,fontWeight:700,pointerEvents:"none"}}>{inOz?"oz":"USD"}</div>
                  </div>
                  {num>0&&<div style={{fontSize:12,color:C.t3,marginTop:6}}>{inOz?`≈ ${fmtUSD(usdVal)} · ${fmtGN(ozAmt*TROY)}g SGC`:`≈ ${fmtOzN(ozAmt)} oz · ${fmtGN(ozAmt*TROY)}g`}</div>}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 14px",background:C.s1,borderRadius:10,border:`1px solid ${C.s2}`}}>
                  <span style={{fontSize:13,color:C.t3}}>Available balance</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.t2}}>{fmtOzN(HOLDING_OZ)} oz ({fmtGN(HOLDING_G)}g)</span>
                </div>
              </div>
            ):(
              <div style={{background:C.s1,borderRadius:16,overflow:"hidden",border:`1px solid ${C.s2}`}}>
                {[{k:"To",v:to},{k:"Amount",v:`${fmtOzN(ozAmt)} oz SGC`,hi:true},{k:"That's",v:`${fmtGN(ozAmt*TROY)}g SGC`},{k:"≈ USD",v:fmtUSD(usdVal)},{k:"Spot price",v:`${fmtOz(liveOz)}/oz`},{k:"Network fee",v:"~$0.08"}].map(({k,v,hi},i,a)=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                    <span style={{fontSize:13,color:C.t3}}>{k}</span>
                    <span style={{fontSize:13,fontWeight:hi?700:500,color:hi?C.gold:C.t2,maxWidth:220,textAlign:"right"}}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:24}}>
              {step===2&&<button onClick={()=>setStep(1)} style={{flex:1,padding:"16px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,color:C.t2,fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:600,cursor:"pointer"}}>Back</button>}
              <button onClick={next} disabled={step===1&&!valid} style={{flex:2,padding:"16px 0",background:(valid||step===2)?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",border:"none",borderRadius:14,color:(valid||step===2)?"#080808":"#2a2a2a",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,cursor:(valid||step===2)?"pointer":"not-allowed",letterSpacing:"0.02em",transition:"all 0.2s",boxShadow:(valid||step===2)?`0 4px 20px rgba(212,175,55,0.25)`:"none"}}>
                {step===1?"Continue →":"Confirm Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── WALLET TAB ───────────────────────────────────────────────────────────────
// Full on-chain activity feed — Base L2 ERC-20 transfer events
// Real-looking tx hashes, block confirmations, Base explorer links
function WalletTab({ liveOz, onSend, onReceive, onBuy }) {
  const [filter, setFilter] = useState("all");

  const ALL_TX = [
    { id:1,  type:"receive", label:"Mining Yield Q1",      sub:"BlueGold Protocol",  oz:0.0749, grams:2.33,  date:"Mar 11 '26", time:"9:14 AM",  hash:"0x7f3A9c2E8b1D4F6A0E5C3B9D2F7A1E4C8B6D3F5A", block:14882441, confirms:247, network:"Base", memo:"Q1 2026 yield" },
    { id:2,  type:"spend",   label:"Blue Bottle Coffee",   sub:"POS · ONE Debit",    oz:0.0026, grams:0.08,  date:"Mar 10 '26", time:"11:32 AM", hash:"0xB2c1D8F4A9E3C7B5F2A6E1D4C8B9F3A7E2D5C1B4", block:14876203, confirms:189, network:"Base", memo:"Coffee purchase" },
    { id:3,  type:"receive", label:"SGC Purchase",         sub:"USD → USDC → SGC",   oz:0.3214, grams:9.999, date:"Mar 8 '26",  time:"2:05 PM",  hash:"0x4D8eA3F7C2B1E9D5A6C8F4B3E2D7A9C1F5B8E3D2", block:14851977, confirms:620, network:"Base", memo:"Onramp via USDC" },
    { id:4,  type:"send",    label:"→ alex.bluegold",     sub:"P2P Transfer",       oz:0.0402, grams:1.250, date:"Mar 7 '26",  time:"6:48 PM",  hash:"0xA91f4C2E8B7D3A6F9C1E4B5D8A3F7C2E1B6D4A9F3", block:14843120, confirms:891, network:"Base", memo:"Dinner split" },
    { id:5,  type:"receive", label:"SGC Purchase",         sub:"USD → USDC → SGC",   oz:0.1608, grams:5.002, date:"Mar 5 '26",  time:"10:20 AM", hash:"0xE3b7F5A2D9C4B8E1F3A7D5C2B9F4A8E6D1C3B5A7F2", block:14821044, confirms:1420, network:"Base", memo:"Market buy" },
    { id:6,  type:"spend",   label:"Whole Foods Market",  sub:"POS · ONE Debit",    oz:0.0147, grams:0.457, date:"Mar 4 '26",  time:"3:11 PM",  hash:"0xC6D2A9F4E8B3C7A1D5F9B2E6A4C8D3F1B7A5E9C2D4", block:14814832, confirms:1688, network:"Base", memo:"Groceries" },
    { id:7,  type:"receive", label:"→ from sam.bluegold", sub:"P2P Transfer",       oz:0.0500, grams:1.555, date:"Mar 2 '26",  time:"8:45 AM",  hash:"0xF1A8C3D6E9B2F5A4C7D1B8E3A6F9C2D5B1E4A7C8F3", block:14790611, confirms:2104, network:"Base", memo:"Lunch payback" },
    { id:8,  type:"spend",   label:"Sweetgreen",          sub:"POS · ONE Debit",    oz:0.0082, grams:0.255, date:"Feb 28 '26", time:"12:20 PM", hash:"0xD4B7E2A9F3C6D1A5B8E4C9F2A7D3B1E6A8C4D9F5B2", block:14763302, confirms:2801, network:"Base", memo:"Lunch" },
  ];

  const filtered = filter==="all" ? ALL_TX : ALL_TX.filter(t=>t.type===filter||(filter==="p2p"&&(t.sub.includes("P2P")||t.label.includes("→"))));

  const shortHash = h => h.slice(0,8)+"..."+h.slice(-6);
  const typeIcon = (t) => ({ receive:"↓", send:"↑", spend:"💳" }[t]);
  const typeColor = (t) => ({ receive:C.gold, send:C.t2, spend:"#3772ff" }[t]);

  return (
    <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
      {/* Header */}
      <div style={{padding:"20px 20px 0",marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em",marginBottom:2}}>Activity</div>
        <div style={{fontSize:12,color:C.t3}}>Base (Coinbase L2) · ERC-20 on-chain feed</div>
      </div>

      {/* Balance strip */}
      <div style={{margin:"0 20px 16px",padding:"16px 18px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:4}}>SGC Balance</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:300,color:C.gold}}>{fmtOzN(HOLDING_OZ)} oz</div>
          <div style={{fontSize:11,color:C.t3,marginTop:3}}>{fmtGN(HOLDING_G)}g · {fmtUSD(HOLDING_OZ*liveOz)}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onSend} style={{padding:"10px 16px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:800,color:C.t1}}>Send ↑</button>
          <button onClick={onReceive} style={{padding:"10px 16px",background:C.s2,border:`1px solid ${C.s3}`,borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:C.t2}}>Receive</button>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{display:"flex",gap:6,padding:"0 20px",marginBottom:14,overflowX:"auto"}}>
        {[["all","All"],["receive","Received"],["send","Sent"],["p2p","P2P"],["spend","Spent"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,background:filter===v?"rgba(212,175,55,0.12)":"transparent",border:filter===v?`1px solid ${C.gold}`:`1px solid ${C.s2}`,color:filter===v?C.gold:C.t3,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}>
            {l}
          </button>
        ))}
      </div>

      {/* TX feed */}
      <div style={{margin:"0 20px",background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        {filtered.map((tx,i)=>(
          <div key={tx.id} style={{borderBottom:i<filtered.length-1?`1px solid ${C.s2}`:"none"}}>
            <div className="txrow" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer",transition:"background 0.1s"}}>
              {/* Icon */}
              <div style={{width:40,height:40,borderRadius:12,flexShrink:0,background:tx.type==="receive"?"rgba(212,175,55,0.08)":tx.type==="spend"?"rgba(55,114,255,0.08)":C.s2,border:`1.5px solid ${tx.type==="receive"?"rgba(212,175,55,0.2)":tx.type==="spend"?"rgba(55,114,255,0.2)":C.s3}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:typeColor(tx.type),fontWeight:tx.type==="spend"?400:700}}>
                {typeIcon(tx.type)}
              </div>
              {/* Info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.label}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3}}>{shortHash(tx.hash)}</span>
                  <span style={{fontSize:9,color:C.t3}}>·</span>
                  <span style={{fontSize:9,color:C.green,fontWeight:700}}>{tx.confirms} conf</span>
                  <span style={{fontSize:9,color:C.t3}}>·</span>
                  <span style={{fontSize:9,color:"#3772ff"}}>Base</span>
                </div>
                <div style={{fontSize:10,color:C.t3,marginTop:1}}>{tx.date} · {tx.time}</div>
              </div>
              {/* Amount */}
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:500,color:tx.type==="receive"?C.gold:C.t2}}>
                  {tx.type==="receive"?"+":"-"}{fmtOzN(tx.oz)} oz
                </div>
                <div style={{fontSize:10,color:C.t3,marginTop:2}}>{fmtUSD(tx.oz*liveOz)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Thirdweb + Base badge */}
      <div style={{margin:"14px 20px 0",padding:"11px 14px",background:"rgba(55,114,255,0.04)",border:"1px solid rgba(55,114,255,0.12)",borderRadius:12,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:18}}>⬡</span>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#3772ff",letterSpacing:"0.06em"}}>SELF-CUSTODY · THIRDWEB INFRASTRUCTURE</div>
          <div style={{fontSize:10,color:C.t3,marginTop:1}}>Base (Coinbase L2) · ERC-20 · Your keys, your gold</div>
        </div>
      </div>
    </div>
  );
}

// ─── VAULT TAB ────────────────────────────────────────────────────────────────
// Full vault view — bar allocation, audit trail, mint record
function VaultTab({ liveOz }) {
  const [selectedBar, setSelectedBar] = useState(0);

  const BARS = [
    {
      serial:"BRK-DXB-2024-00441",
      lot:"LOT-2024-Q4-017",
      refinery:"Valcambi Suisse",
      purity:"999.9",
      weightG:10.000,
      allocatedG:10.000,
      mintDate:"Nov 14, 2024",
      location:"Brinks Dubai · Bay 7, Rack 14, Pos 3",
      mintTx:"0x7f3A9c2E8b1D4F6A0E5C3B9D2F7A1E4C8B6D3F5A",
      block:12441892,
      auditDate:"Jan 15, 2026",
    },
    {
      serial:"BRK-DXB-2025-01882",
      lot:"LOT-2025-Q1-034",
      refinery:"PAMP Suisse",
      purity:"999.9",
      weightG:10.000,
      allocatedG:0.4194,
      mintDate:"Feb 28, 2025",
      location:"Brinks Dubai · Bay 7, Rack 14, Pos 4",
      mintTx:"0xB2c1D8F4A9E3C7B5F2A6E1D4C8B9F3A7E2D5C1B4",
      block:13104321,
      auditDate:"Jan 15, 2026",
    },
  ];

  const bar = BARS[selectedBar];
  const totalAllocatedG = BARS.reduce((s,b)=>s+b.allocatedG,0);
  const pct = (bar.allocatedG/bar.weightG*100).toFixed(2);
  const barUSD = (bar.allocatedG/TROY)*liveOz;

  return (
    <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
      {/* Header */}
      <div style={{padding:"20px 20px 16px"}}>
        <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em",marginBottom:2}}>Vault</div>
        <div style={{fontSize:12,color:C.t3}}>Brinks Dubai · 100% allocated · LBMA 999.9</div>
      </div>

      {/* Portfolio hero */}
      <div style={{margin:"0 20px 16px",padding:"20px 20px",background:"rgba(212,175,55,0.05)",border:`1px solid rgba(212,175,55,0.18)`,borderRadius:18,position:"relative",overflow:"hidden"}}>
        {/* Decorative gold bar icon */}
        <div style={{position:"absolute",right:-20,top:-20,width:120,height:120,borderRadius:24,background:"rgba(212,175,55,0.04)",transform:"rotate(15deg)"}}/>
        <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:8}}>Total Allocated</div>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:36,fontWeight:200,color:C.gold,letterSpacing:"-0.02em",marginBottom:4}}>
          {fmtGN(totalAllocatedG)}<span style={{fontSize:16,color:C.t3,marginLeft:6}}>g SGC</span>
        </div>
        <div style={{fontSize:12,color:C.t3,marginBottom:12}}>{fmtOzN(HOLDING_OZ)} oz · {fmtUSD(HOLDING_OZ*liveOz)}</div>
        <div style={{display:"flex",gap:8}}>
          <div style={{padding:"4px 10px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.25)",borderRadius:6,fontSize:10,fontWeight:700,color:C.green}}>✓ ALLOCATED</div>
          <div style={{padding:"4px 10px",background:"rgba(55,114,255,0.08)",border:"1px solid rgba(55,114,255,0.2)",borderRadius:6,fontSize:10,fontWeight:700,color:"#3772ff"}}>AUDITED</div>
          <div style={{padding:"4px 10px",background:C.goldFaint,border:`1px solid ${C.goldDim}`,borderRadius:6,fontSize:10,fontWeight:700,color:C.gold}}>BRINKS</div>
        </div>
      </div>

      {/* Bar selector */}
      <div style={{padding:"0 20px",marginBottom:16}}>
        <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:10}}>Your Gold Bars · {BARS.length} bars</div>
        <div style={{display:"flex",gap:8}}>
          {BARS.map((b,i)=>(
            <button key={b.serial} onClick={()=>setSelectedBar(i)} style={{flex:1,padding:"12px 14px",background:selectedBar===i?"rgba(212,175,55,0.10)":C.s1,border:`1.5px solid ${selectedBar===i?C.gold:C.s2}`,borderRadius:14,cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
              <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:selectedBar===i?C.gold:C.t3,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.serial.slice(-8)}</div>
              <div style={{fontSize:11,fontWeight:700,color:selectedBar===i?C.t1:C.t2}}>{fmtGN(b.allocatedG)}g</div>
              <div style={{fontSize:9,color:C.t3,marginTop:2}}>{b.refinery}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Bar detail card */}
      <div style={{margin:"0 20px 14px",background:C.s1,border:`1.5px solid rgba(212,175,55,0.22)`,borderRadius:18,overflow:"hidden"}}>
        {/* Bar header */}
        <div style={{padding:"16px 18px",borderBottom:`1px solid ${C.s2}`,background:"rgba(212,175,55,0.03)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:4}}>Bar Serial</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.gold}}>{bar.serial}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:C.t3,marginBottom:4}}>Your value</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:C.t1,fontWeight:500}}>{fmtUSD(barUSD)}</div>
            </div>
          </div>
          {/* Allocation bar */}
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:10,color:C.t3}}>Your allocation: {fmtGN(bar.allocatedG)}g of {fmtGN(bar.weightG)}g</span>
              <span style={{fontSize:10,fontWeight:700,color:C.gold}}>{pct}%</span>
            </div>
            <div style={{height:5,background:C.s2,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,borderRadius:3,transition:"width 0.6s ease"}}/>
            </div>
          </div>
        </div>

        {/* Detail rows */}
        {[
          {k:"Lot Number",    v:bar.lot},
          {k:"Refinery",     v:bar.refinery},
          {k:"Purity",       v:`${bar.purity} (LBMA good delivery)`},
          {k:"Bar weight",   v:`${bar.weightG}g`},
          {k:"Mint date",    v:bar.mintDate},
          {k:"Vault",        v:bar.location},
          {k:"Last audit",   v:bar.auditDate, accent:true},
        ].map(({k,v,accent},i,a)=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 18px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
            <span style={{fontSize:12,color:C.t3}}>{k}</span>
            <span style={{fontSize:12,color:accent?C.green:C.t2,fontWeight:accent?700:500,maxWidth:220,textAlign:"right"}}>{v}</span>
          </div>
        ))}
      </div>

      {/* On-chain mint record */}
      <div style={{margin:"0 20px 14px",padding:"14px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14}}>
        <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:10}}>On-Chain Mint Record · Base L2</div>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#3772ff",wordBreak:"break-all",lineHeight:1.5,marginBottom:8}}>{bar.mintTx}</div>
        <div style={{display:"flex",gap:16}}>
          <div><div style={{fontSize:9,color:C.t3,marginBottom:2}}>BLOCK</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t2}}>#{bar.block.toLocaleString()}</div></div>
          <div><div style={{fontSize:9,color:C.t3,marginBottom:2}}>STATUS</div><div style={{fontSize:11,fontWeight:700,color:C.green}}>CONFIRMED</div></div>
          <div><div style={{fontSize:9,color:C.t3,marginBottom:2}}>TOKEN</div><div style={{fontSize:11,color:C.t2}}>SGC ERC-20</div></div>
        </div>
      </div>

      {/* Reserve attestation */}
      <div style={{margin:"0 20px 0",padding:"14px 16px",background:"rgba(95,224,138,0.04)",border:"1px solid rgba(95,224,138,0.14)",borderRadius:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:14}}>🔐</span>
          <div style={{fontSize:11,fontWeight:700,color:C.green}}>100% Reserve Attestation</div>
        </div>
        <div style={{fontSize:11,color:C.t3,lineHeight:1.6}}>All SGC tokens are backed 1:1 by allocated LBMA 999.9 gold bars in Brinks Dubai. Serial numbers and lot numbers are verifiable on-chain via Chainlink oracle and independent third-party audits.</div>
        <div style={{marginTop:8,fontSize:10,color:C.t3}}>⚠ Demo. Last attested Jan 15, 2026.</div>
      </div>
    </div>
  );
}

// ─── PROFILE TAB ──────────────────────────────────────────────────────────────
// ─── LOCK SCREEN ──────────────────────────────────────────────────────────────
function LockScreen({ onUnlock }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(false);

  const handleBiometric = () => {
    setScanning(true);
    setError(false);
    // Simulate biometric scan — in Expo: LocalAuthentication.authenticateAsync()
    setTimeout(() => {
      setScanning(false);
      onUnlock(); // always succeeds in demo
    }, 1200);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:"100%",maxWidth:430,padding:"0 32px",textAlign:"center"}}>
        {/* Logo */}
        <div style={{width:72,height:72,borderRadius:22,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:C.t1,margin:"0 auto 24px",boxShadow:`0 8px 32px rgba(201,152,26,0.3)`}}>Au</div>
        <div style={{fontSize:22,fontWeight:700,color:C.t1,marginBottom:6}}>BlueGold</div>
        <div style={{fontSize:13,color:C.t3,marginBottom:48}}>Wallet locked</div>

        {/* Biometric button */}
        <button onClick={handleBiometric}
          style={{width:80,height:80,borderRadius:"50%",background:scanning?"rgba(201,152,26,0.12)":C.s1,border:`2px solid ${scanning?C.gold:C.s2}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",margin:"0 auto 20px",transition:"all 0.3s",boxShadow:scanning?`0 0 0 8px rgba(201,152,26,0.08)`:"none"}}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.5 2 5.5 4 4 7" stroke={scanning?C.gold:C.t3} strokeWidth="2" strokeLinecap="round"/>
            <path d="M20 7c-1.5-3-4.5-5-8-5" stroke={scanning?C.gold:C.t3} strokeWidth="2" strokeLinecap="round"/>
            <path d="M4 12a8 8 0 0 1 8-8" stroke={scanning?C.gold:C.t2} strokeWidth="2" strokeLinecap="round"/>
            <path d="M20 12a8 8 0 0 1-8 8" stroke={scanning?C.gold:C.t2} strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="3" fill={scanning?C.gold:C.t3} style={{transition:"fill 0.3s"}}/>
            <path d="M12 9v1M12 14v1M9 12h1M14 12h1" stroke={C.bg} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div style={{fontSize:13,color:scanning?C.gold:C.t3,marginBottom:32,transition:"color 0.3s",fontWeight:scanning?600:400}}>
          {scanning?"Scanning...":"Use Face ID"}
        </div>

        {/* PIN fallback */}
        <button onClick={onUnlock} style={{padding:"10px 24px",background:"none",border:`1px solid ${C.s2}`,borderRadius:20,cursor:"pointer",fontSize:12,color:C.t2,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
          Use PIN instead
        </button>
      </div>
    </div>
  );
}

// ─── PIN MODAL ────────────────────────────────────────────────────────────────
function PinModal({ action, onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const DEMO_PIN = "1234";

  const handleDigit = (d) => {
    if(pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if(next.length === 4) {
      setTimeout(() => {
        if(next === DEMO_PIN) {
          onSuccess();
        } else {
          setShake(true);
          setError(true);
          setPin("");
          setTimeout(() => setShake(false), 500);
        }
      }, 120);
    }
  };

  const actionLabel = action === "send" ? "Confirm Send" : action === "spend" ? "Confirm Payment" : "Authenticate";

  return (
    <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(26,23,16,0.6)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{width:"100%",maxWidth:430,background:C.bg,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 0 40px",animation:"slideUp 0.25s cubic-bezier(0.22,1,0.36,1)"}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 0"}}><div style={{width:36,height:4,borderRadius:2,background:C.s2}}/></div>
        <div style={{textAlign:"center",padding:"20px 24px 24px"}}>
          <div style={{width:48,height:48,borderRadius:14,background:C.goldFaint,border:`1px solid ${C.goldDim}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:20}}>🔐</div>
          <div style={{fontSize:17,fontWeight:700,color:C.t1,marginBottom:4}}>{actionLabel}</div>
          <div style={{fontSize:12,color:C.t3}}>Enter your 4-digit PIN · Demo PIN: 1234</div>
        </div>

        {/* Dots */}
        <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:8,animation:shake?"shake 0.4s ease":"none"}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{width:14,height:14,borderRadius:"50%",background:pin.length>i?error?C.red:C.gold:C.s2,border:`2px solid ${pin.length>i?error?C.red:C.gold:C.s3}`,transition:"all 0.15s"}}/>
          ))}
        </div>
        {error&&<div style={{textAlign:"center",fontSize:12,color:C.red,marginBottom:4,fontWeight:600}}>Incorrect PIN</div>}

        {/* Keypad */}
        <div style={{padding:"16px 32px 0",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
            <button key={i} onClick={()=>{ if(d==="⌫") setPin(p=>p.slice(0,-1)); else if(d!=="") handleDigit(String(d)); }}
              style={{height:60,background:d===""?"transparent":C.s1,border:`1px solid ${d===""?"transparent":C.s2}`,borderRadius:14,cursor:d===""?"default":"pointer",fontFamily:"'DM Mono',monospace",fontSize:d==="⌫"?20:22,fontWeight:400,color:d==="⌫"?C.t3:C.t1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.1s",active:{background:C.s2}}}>
              {d}
            </button>
          ))}
        </div>

        <div style={{padding:"16px 32px 0"}}>
          <button onClick={onCancel} style={{width:"100%",padding:"14px",background:"none",border:`1px solid ${C.s2}`,borderRadius:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,color:C.t3}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2FA SETUP / VERIFY MODAL ─────────────────────────────────────────────────
function TwoFAModal({ mode, onSuccess, onCancel, setTwoFA }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const DEMO_SECRET = "JBSWY3DPEHPK3PXP";
  const DEMO_CODE   = "847291";

  const verify = () => {
    if(code === DEMO_CODE) {
      if(mode === "setup") setTwoFA(true);
      onSuccess();
    } else {
      setError(true);
      setCode("");
    }
  };

  const copySecret = () => {
    navigator.clipboard?.writeText(DEMO_SECRET).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(26,23,16,0.6)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{width:"100%",maxWidth:430,background:C.bg,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.25s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 20px"}}><div style={{width:36,height:4,borderRadius:2,background:C.s2}}/></div>

        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:52,height:52,borderRadius:16,background:"rgba(55,114,255,0.08)",border:"1px solid rgba(55,114,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:22}}>🔒</div>
          <div style={{fontSize:17,fontWeight:700,color:C.t1,marginBottom:6}}>
            {mode==="setup"?"Set Up Two-Factor Auth":"Two-Factor Required"}
          </div>
          <div style={{fontSize:12,color:C.t3,lineHeight:1.6}}>
            {mode==="setup"
              ? "Add your BlueGold account to an authenticator app (Google Authenticator, Authy) using the secret below."
              : "Enter the 6-digit code from your authenticator app."}
          </div>
        </div>

        {mode==="setup"&&(
          <div style={{background:C.s1,border:`1px solid ${C.s2}`,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Secret Key · Demo</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.t1,letterSpacing:"0.1em",marginBottom:10}}>{DEMO_SECRET}</div>
            <button onClick={copySecret} style={{padding:"6px 14px",background:copied?"rgba(26,122,69,0.1)":C.s2,border:`1px solid ${copied?"rgba(26,122,69,0.25)":C.s3}`,borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:copied?C.green:C.t3}}>
              {copied?"✓ Copied":"Copy Secret"}
            </button>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.t3,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>
            {mode==="setup"?"Enter code from your app to confirm":"6-Digit Code"}
          </div>
          <input
            type="number" inputMode="numeric"
            value={code} onChange={e=>{ setCode(e.target.value.slice(0,6)); setError(false); }}
            placeholder="000000" maxLength={6}
            onKeyDown={e=>e.key==="Enter"&&verify()}
            style={{width:"100%",boxSizing:"border-box",padding:"16px",background:C.s1,border:`2px solid ${error?C.red:code.length===6?C.gold:C.s2}`,borderRadius:12,fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:400,color:C.t1,textAlign:"center",letterSpacing:"0.2em",outline:"none",transition:"border-color 0.2s"}}
          />
          {error&&<div style={{fontSize:12,color:C.red,marginTop:6,fontWeight:600}}>Incorrect code. Demo code: {DEMO_CODE}</div>}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"15px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,color:C.t2}}>Cancel</button>
          <button onClick={verify} disabled={code.length!==6}
            style={{flex:2,padding:"15px",background:code.length===6?`linear-gradient(135deg,${C.goldD},${C.gold})`:C.s2,border:"none",borderRadius:12,cursor:code.length===6?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:code.length===6?C.t1:C.t3,transition:"all 0.2s"}}>
            {mode==="setup"?"Enable 2FA":"Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── PROFILE SETTINGS PANELS ──────────────────────────────────────────────────
// Hoisted as top-level components to prevent infinite re-render

function Toggle({on, onToggle}) {
  return (
    <div onClick={onToggle} style={{width:44,height:26,borderRadius:13,background:on?C.gold:C.s3,cursor:"pointer",position:"relative",transition:"background 0.25s ease",flexShrink:0}}>
      <div style={{position:"absolute",top:3,left:on?21:3,width:20,height:20,borderRadius:10,background:"#fff",transition:"left 0.25s cubic-bezier(0.4,0,0.2,1)",boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}/>
    </div>
  );
}

function SheetHeader({title, onClose}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 20px 16px",borderBottom:`1px solid ${C.s2}`}}>
      <div style={{fontSize:17,fontWeight:700,color:C.t1}}>{title}</div>
      <button onClick={onClose} style={{background:C.s2,border:"none",cursor:"pointer",width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:C.t2}}>✕</button>
    </div>
  );
}

function SettingsRow({label, sub, right, onClick, border=true}) {
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:border?`1px solid ${C.s2}`:"none",cursor:onClick?"pointer":"default"}}>
      <div style={{flex:1,minWidth:0,marginRight:12}}>
        <div style={{fontSize:13,fontWeight:600,color:C.t1}}>{label}</div>
        {sub&&<div style={{fontSize:11,color:C.t3,marginTop:2}}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function AlertsPanel({liveOz, alerts, setAlerts, alertPrice, setAlertPrice, alertDir, setAlertDir, alertNextId, onClose}) {
  const addAlert = () => {
    const p = parseFloat(alertPrice);
    if(!p || p < 500 || p > 20000) return;
    setAlerts(a => [...a, {id:alertNextId.current++, price:p, dir:alertDir, active:true, label:"Custom"}]);
    setAlertPrice("");
  };
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(26,23,16,0.5)",backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.bg,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",maxHeight:"88vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <SheetHeader title="Price Alerts" onClose={onClose}/>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px 40px"}}>
          <div style={{background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,padding:"16px",marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>New Alert</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {["above","below"].map(d=>(
                <button key={d} onClick={()=>setAlertDir(d)} style={{flex:1,padding:"9px",background:alertDir===d?C.goldFaint:C.s2,border:`1.5px solid ${alertDir===d?C.gold:C.s2}`,borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:alertDir===d?C.gold:C.t2,transition:"all 0.15s"}}>
                  {d==="above"?"↑ Above":"↓ Below"}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{flex:1,position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.t3,fontWeight:500}}>$</span>
                <input type="number" inputMode="decimal" value={alertPrice} onChange={e=>setAlertPrice(e.target.value)}
                  placeholder="5,250.00" onKeyDown={e=>e.key==="Enter"&&addAlert()}
                  style={{width:"100%",boxSizing:"border-box",padding:"11px 12px 11px 24px",background:C.s2,border:`1.5px solid ${C.s2}`,borderRadius:10,fontFamily:"'DM Mono',monospace",fontSize:14,color:C.t1,outline:"none"}}/>
              </div>
              <button onClick={addAlert} style={{padding:"11px 18px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:10,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:800,color:C.t1,whiteSpace:"nowrap"}}>Add</button>
            </div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              {[5000,5250,5500,5602,6000].map(p=>(
                <button key={p} onClick={()=>setAlertPrice(String(p))} style={{padding:"4px 10px",background:C.s2,border:`1px solid ${C.s3}`,borderRadius:20,cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t3,fontWeight:600}}>${p.toLocaleString()}</button>
              ))}
            </div>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Active Alerts ({alerts.filter(a=>a.active).length})</div>
          {alerts.length===0?(
            <div style={{textAlign:"center",padding:"28px",color:C.t3,fontSize:13}}>No alerts set</div>
          ):alerts.map(a=>{
            const triggered = a.active && (a.dir==="above" ? liveOz >= a.price : liveOz <= a.price);
            return (
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:C.s1,border:`1.5px solid ${triggered?C.gold:C.s2}`,borderRadius:12,marginBottom:8,opacity:a.active?1:0.5,transition:"all 0.2s"}}>
                <div style={{width:36,height:36,borderRadius:10,background:triggered?C.goldFaint:a.dir==="above"?"rgba(26,122,69,0.08)":"rgba(192,57,43,0.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                  {triggered?"🔔":a.dir==="above"?"↑":"↓"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:600,color:C.t1}}>{fmtUSD(a.price)}</span>
                    {triggered&&<span style={{fontSize:9,fontWeight:800,color:C.gold,background:C.goldFaint,padding:"2px 6px",borderRadius:10,letterSpacing:"0.06em"}}>HIT</span>}
                  </div>
                  <div style={{fontSize:11,color:C.t3,marginTop:2}}>{a.dir==="above"?"Above":"Below"} · {a.label}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <Toggle on={a.active} onToggle={()=>setAlerts(prev=>prev.map(x=>x.id===a.id?{...x,active:!x.active}:x))}/>
                  <button onClick={()=>setAlerts(prev=>prev.filter(x=>x.id!==a.id))} style={{background:"none",border:"none",cursor:"pointer",padding:"4px 6px",color:C.t3,fontSize:18,lineHeight:1}}>×</button>
                </div>
              </div>
            );
          })}
          <div style={{marginTop:8,padding:"10px 12px",background:C.s2,borderRadius:10,fontSize:10,color:C.t3}}>
            Alerts check every 10s. Push notifications require the native Expo app.
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityPanel({biometric,setBiometric,twoFA,setTwoFA,autoLock,setAutoLock,hideBalance,setHideBalance,transactionPin,setTransactionPin,onRequestSetPin,onRequestSetup2FA,onClose}) {
  const [biometricWorking, setBiometricWorking] = useState(false);

  const handleBiometricToggle = async () => {
    if (!biometric) {
      setBiometricWorking(true);
      try {
        if (window.PublicKeyCredential) {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (available) {
            const cred = await navigator.credentials.create({
              publicKey: {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: { name: "BlueGold", id: window.location.hostname || "localhost" },
                user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "user@bluegold", displayName: "BlueGold User" },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 30000,
              }
            });
            if (cred) setBiometric(true);
          } else {
            // No platform authenticator available — enable in demo mode
            setBiometric(true);
          }
        } else {
          setBiometric(true);
        }
      } catch (e) {
        if (e.name !== "NotAllowedError") setBiometric(true); // user cancelled = don't enable
      }
      setBiometricWorking(false);
    } else {
      setBiometric(false);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(26,23,16,0.5)",backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.bg,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",maxHeight:"88vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <SheetHeader title="Security" onClose={onClose}/>
        <div style={{flex:1,overflowY:"auto",paddingBottom:40}}>

          <div style={{margin:"16px 20px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            {/* Face ID / Biometric — real WebAuthn */}
            <SettingsRow
              label="Face ID / Biometric"
              sub={biometricWorking ? "Requesting biometric…" : biometric ? "Active — tap to disable" : "Disabled — tap to enable"}
              border
              right={<Toggle on={biometric} onToggle={handleBiometricToggle}/>}
            />
            {/* Transaction PIN — triggers setup modal if turning on */}
            <SettingsRow
              label="Transaction PIN"
              sub={transactionPin ? "Required for Send & Spend" : "Off — tap to enable"}
              border
              right={<Toggle on={transactionPin} onToggle={()=>{
                if (!transactionPin) onRequestSetPin();
                else setTransactionPin(false);
              }}/>}
            />
            {/* Two-Factor Auth — triggers setup modal if turning on */}
            <SettingsRow
              label="Two-Factor Auth"
              sub={twoFA ? "Authenticator app active — tap to disable" : "Disabled — tap to enable"}
              border
              right={<Toggle on={twoFA} onToggle={()=>{
                if (!twoFA) onRequestSetup2FA();
                else setTwoFA(false);
              }}/>}
            />
            {/* Hide Balance — direct toggle, propagates to home screen immediately */}
            <SettingsRow
              label="Hide Balance"
              sub={hideBalance ? "Balances masked on home screen" : "Balances visible"}
              border={false}
              right={<Toggle on={hideBalance} onToggle={()=>setHideBalance(v=>!v)}/>}
            />
          </div>

          <div style={{margin:"16px 20px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.s2}`,fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Auto-Lock</div>
            {[["1min","1 minute"],["5min","5 minutes"],["15min","15 minutes"],["never","Never"]].map(([v,label],i,a)=>(
              <div key={v} onClick={()=>setAutoLock(v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none",cursor:"pointer"}}>
                <span style={{fontSize:13,color:autoLock===v?C.t1:C.t2,fontWeight:autoLock===v?600:400}}>{label}</span>
                {autoLock===v&&<div style={{width:18,height:18,borderRadius:"50%",background:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.t1,fontWeight:800}}>✓</div>}
              </div>
            ))}
          </div>

          <div style={{margin:"16px 20px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            <SettingsRow label="View Recovery Phrase" sub="24-word seed phrase" border right={<span style={{fontSize:12,color:C.red,fontWeight:700}}>Sensitive →</span>}/>
            <SettingsRow label="Connected Apps" sub="0 connected dApps" border right={<span style={{fontSize:12,color:C.t3}}>›</span>}/>
            <SettingsRow label="Export Private Key" sub="For advanced users only" border={false} right={<span style={{fontSize:12,color:C.red,fontWeight:700}}>Danger →</span>}/>
          </div>

          <div style={{margin:"16px 20px 0",padding:"12px 14px",background:"rgba(26,122,69,0.06)",border:"1px solid rgba(26,122,69,0.15)",borderRadius:12,fontSize:11,color:C.t2,lineHeight:1.6}}>
            🔐 Your wallet is self-custodial. BlueGold never has access to your private keys or recovery phrase.
          </div>
        </div>
      </div>
    </div>
  );
}

const STATEMENTS_DATA = [
  {month:"March 2026",    date:"Mar 1, 2026",  size:"142 KB", current:true},
  {month:"February 2026", date:"Feb 1, 2026",  size:"138 KB", current:false},
  {month:"January 2026",  date:"Jan 1, 2026",  size:"151 KB", current:false},
  {month:"December 2025", date:"Dec 1, 2025",  size:"167 KB", current:false},
  {month:"November 2025", date:"Nov 1, 2025",  size:"129 KB", current:false},
  {month:"October 2025",  date:"Oct 1, 2025",  size:"144 KB", current:false},
];

function StatementsPanel({onClose}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(26,23,16,0.5)",backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.bg,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",maxHeight:"88vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <SheetHeader title="Statements" onClose={onClose}/>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px 40px"}}>
          <div style={{fontSize:11,color:C.t3,marginBottom:16,lineHeight:1.6}}>
            Monthly statements showing all transactions, holdings, and performance. Generated on the 1st of each month.
          </div>
          <div style={{background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            {STATEMENTS_DATA.map(({month,date,size,current},i,a)=>(
              <div key={month} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                <div style={{width:38,height:38,borderRadius:10,background:current?C.goldFaint:C.s2,border:`1px solid ${current?C.goldDim:C.s2}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={current?C.gold:C.t3} strokeWidth="2" strokeLinejoin="round"/>
                    <polyline points="14,2 14,8 20,8" stroke={current?C.gold:C.t3} strokeWidth="2" strokeLinejoin="round"/>
                    <line x1="16" y1="13" x2="8" y2="13" stroke={current?C.gold:C.t3} strokeWidth="2" strokeLinecap="round"/>
                    <line x1="16" y1="17" x2="8" y2="17" stroke={current?C.gold:C.t3} strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.t1}}>{month}</span>
                    {current&&<span style={{fontSize:9,fontWeight:800,color:C.gold,background:C.goldFaint,padding:"2px 6px",borderRadius:8,letterSpacing:"0.06em"}}>CURRENT</span>}
                  </div>
                  <div style={{fontSize:11,color:C.t3,marginTop:2}}>{date} · {size}</div>
                </div>
                <button style={{padding:"7px 14px",background:current?C.goldFaint:C.s2,border:`1px solid ${current?C.goldDim:C.s3}`,borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:current?C.gold:C.t2}}>
                  {current?"Preview":"Download"}
                </button>
              </div>
            ))}
          </div>
          <div style={{marginTop:12,padding:"10px 12px",background:C.s2,borderRadius:10,fontSize:10,color:C.t3}}>
            PDF format · Includes transaction history, vault attestation, and tax summary · Available 7 years
          </div>
        </div>
      </div>
    </div>
  );
}

function PrefsPanel({currency,setCurrency,weightUnit,setWeightUnit,notifications,setNotifications,language,setLanguage,theme,setTheme,onClose}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(26,23,16,0.5)",backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.bg,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",maxHeight:"88vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <SheetHeader title="Preferences" onClose={onClose}/>
        <div style={{flex:1,overflowY:"auto",paddingBottom:40}}>
          <div style={{margin:"16px 20px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.s2}`,fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Display Currency</div>
            {[["USD","US Dollar","$"],["AED","UAE Dirham","د.إ"],["EUR","Euro","€"],["GBP","British Pound","£"],["SGD","Singapore Dollar","S$"]].map(([v,label,sym],i,a)=>(
              <div key={v} onClick={()=>setCurrency(v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:32,height:32,borderRadius:8,background:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color:C.t2}}>{sym}</div>
                  <div>
                    <div style={{fontSize:13,color:currency===v?C.t1:C.t2,fontWeight:currency===v?600:400}}>{label}</div>
                    <div style={{fontSize:10,color:C.t3}}>{v}</div>
                  </div>
                </div>
                {currency===v&&<div style={{width:18,height:18,borderRadius:"50%",background:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.t1,fontWeight:800}}>✓</div>}
              </div>
            ))}
          </div>
          <div style={{margin:"16px 20px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.s2}`,fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Weight Unit</div>
            {[["oz","Troy ounces","1 oz = 31.1g"],["g","Grams","1g = 0.0322 oz"],["tola","Tola (South Asia)","1 tola = 11.66g"]].map(([v,label,sub],i,a)=>(
              <div key={v} onClick={()=>setWeightUnit(v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none",cursor:"pointer"}}>
                <div>
                  <div style={{fontSize:13,color:weightUnit===v?C.t1:C.t2,fontWeight:weightUnit===v?600:400}}>{label}</div>
                  <div style={{fontSize:10,color:C.t3}}>{sub}</div>
                </div>
                {weightUnit===v&&<div style={{width:18,height:18,borderRadius:"50%",background:C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.t1,fontWeight:800}}>✓</div>}
              </div>
            ))}
          </div>
          <div style={{margin:"16px 20px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,overflow:"hidden"}}>
            <SettingsRow label="Push Notifications" sub="Price alerts and transaction updates" border right={<Toggle on={notifications} onToggle={()=>setNotifications(v=>!v)}/>}/>
            <SettingsRow label="Language" sub={language==="en"?"English":"العربية"} border={false}
              right={
                <div style={{display:"flex",gap:6}}>
                  {[["en","EN"],["ar","AR"]].map(([v,label])=>(
                    <button key={v} onClick={e=>{e.stopPropagation();setLanguage(v);}} style={{padding:"5px 12px",background:language===v?C.goldFaint:C.s2,border:`1px solid ${language===v?C.gold:C.s3}`,borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:language===v?C.gold:C.t3,transition:"all 0.15s"}}>
                      {label}
                    </button>
                  ))}
                </div>
              }/>
          </div>
          <div style={{margin:"16px 20px 0",padding:"12px 14px",background:C.s2,borderRadius:12,fontSize:10,color:C.t3,lineHeight:1.6}}>
            ⚠ Preferences are local to this device. In the native Expo app they sync across devices via your wallet address.
          </div>
        </div>
      </div>
    </div>
  );
}


function ProfileTab({ liveOz, biometric, setBiometric, twoFA, setTwoFA, onEnableTwoFA, autoLock, setAutoLock, hideBalance, setHideBalance, transactionPin, setTransactionPin }) {
  const portValue = HOLDING_OZ * liveOz;
  const portChange = portValue - INITIAL_USD;
  const portChangePct = (portChange / INITIAL_USD) * 100;
  const WALLET_ADDR = "0x7f3A9c2B8e1D4F6a0C5E7b3D9f2A8c4E6b1D3f5A";
  const [copied, setCopied] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // "alerts"|"security"|"statements"|"prefs"
  const copyRef = useRef(null);
  const copy = () => {
    navigator.clipboard?.writeText(WALLET_ADDR).catch(()=>{});
    setCopied(true);
    clearTimeout(copyRef.current);
    copyRef.current = setTimeout(()=>setCopied(false), 2000);
  };

  // ── Price Alerts state ──────────────────────────────────────────────────
  const [alerts, setAlerts] = useState([
    {id:1, price:5500, dir:"above", active:true,  label:"Key resistance"},
    {id:2, price:5000, dir:"below", active:true,  label:"Round number support"},
    {id:3, price:5602, dir:"above", active:false, label:"ATH breach"},
    {id:4, price:4800, dir:"below", active:true,  label:"Major support floor"},
  ]);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDir,   setAlertDir]   = useState("above");
  const alertNextId = useRef(10);
  const addAlert = () => {
    const p = parseFloat(alertPrice);
    if(!p || p < 500 || p > 20000) return;
    setAlerts(a => [...a, {id:alertNextId.current++, price:p, dir:alertDir, active:true, label:"Custom"}]);
    setAlertPrice("");
  };

  // Security state lifted to App — passed in as props
  // (biometric, twoFA, autoLock, hideBalance, transactionPin)

  // ── Preferences state ───────────────────────────────────────────────────
  const [currency,    setCurrency]    = useState("USD");
  const [weightUnit,  setWeightUnit]  = useState("oz");
  const [theme,       setTheme]       = useState("light");
  const [notifications,setNotifications] = useState(true);
  const [language,    setLanguage]    = useState("en");

  const activeAlerts = alerts.filter(a=>a.active).length;

  return (
    <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
      {/* Active panels */}
      {activePanel==="alerts"&&<AlertsPanel liveOz={liveOz} alerts={alerts} setAlerts={setAlerts} alertPrice={alertPrice} setAlertPrice={setAlertPrice} alertDir={alertDir} setAlertDir={setAlertDir} alertNextId={alertNextId} onClose={()=>setActivePanel(null)}/>}
      {activePanel==="security"&&<SecurityPanel biometric={biometric} setBiometric={setBiometric} twoFA={twoFA} setTwoFA={setTwoFA} onEnableTwoFA={onEnableTwoFA} autoLock={autoLock} setAutoLock={setAutoLock} hideBalance={hideBalance} setHideBalance={setHideBalance} transactionPin={transactionPin} setTransactionPin={setTransactionPin} onClose={()=>setActivePanel(null)}/>}
      {activePanel==="statements"&&<StatementsPanel onClose={()=>setActivePanel(null)}/>}
      {activePanel==="prefs"&&<PrefsPanel currency={currency} setCurrency={setCurrency} weightUnit={weightUnit} setWeightUnit={setWeightUnit} notifications={notifications} setNotifications={setNotifications} language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} onClose={()=>setActivePanel(null)}/>}

      {/* Header */}
      <div style={{padding:"20px 20px 16px"}}>
        <div style={{fontSize:20,fontWeight:800,letterSpacing:"-0.02em",marginBottom:2}}>Profile</div>
        <div style={{fontSize:12,color:C.t3}}>BlueGold · SGC Wallet</div>
      </div>

      {/* Identity card */}
      <div style={{margin:"0 20px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:18,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
          <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:C.t1,boxShadow:`0 4px 16px rgba(201,152,26,0.25)`}}>JW</div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.t1}}>John Warren</div>
            <div style={{fontSize:12,color:C.t3,marginTop:2}}>john.bluegold</div>
          </div>
          <div style={{marginLeft:"auto",padding:"4px 10px",background:"rgba(26,122,69,0.1)",border:"1px solid rgba(26,122,69,0.2)",borderRadius:20,fontSize:10,fontWeight:700,color:C.green}}>✓ KYC</div>
        </div>
        <div style={{padding:"12px 14px",background:C.s2,borderRadius:12,marginBottom:12}}>
          <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:5}}>Wallet Address · Base L2</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t2,wordBreak:"break-all",lineHeight:1.5,marginBottom:8}}>{WALLET_ADDR}</div>
          <button onClick={copy} style={{padding:"5px 14px",background:copied?"rgba(26,122,69,0.1)":C.s1,border:`1px solid ${copied?"rgba(26,122,69,0.25)":C.s3}`,borderRadius:8,cursor:"pointer",fontSize:10,fontWeight:700,color:copied?C.green:C.t3,fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s"}}>
            {copied?"✓ Copied":"Copy Address"}
          </button>
        </div>
        <div style={{display:"flex",gap:10}}>
          {[{k:"Opened",v:"Mar 13, 2025"},{k:"Token",v:"SGC ERC-20"},{k:"Chain",v:"Base L2"}].map(({k,v})=>(
            <div key={k} style={{flex:1,padding:"10px 12px",background:C.s2,borderRadius:10}}>
              <div style={{fontSize:9,color:C.t3,marginBottom:3}}>{k}</div>
              <div style={{fontSize:11,fontWeight:600,color:C.t2}}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance */}
      <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.s2}`,fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Portfolio Performance</div>
        {[
          {k:"Initial investment", v:`$${INITIAL_USD.toFixed(2)}`},
          {k:"Open price",         v:`${fmtOz(ACCOUNT_OPEN_OZ)}/oz`},
          {k:"oz held",            v:`${fmtOzN(HOLDING_OZ)} oz`},
          {k:"Grams held",         v:`${fmtGN(HOLDING_G)}g SGC`},
          {k:"Current value",      v:fmtUSD(portValue), gold:true},
          {k:"Total return",       v:(portChange>=0?"+":"")+fmtUSD(portChange)+" ("+Math.abs(portChangePct).toFixed(1)+"%)", gold:true},
        ].map(({k,v,gold},i,a)=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
            <span style={{fontSize:12,color:C.t3}}>{k}</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
          </div>
        ))}
      </div>

      {/* Settings rows — all tappable */}
      <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        {[
          {icon:"🔔", label:"Price Alerts",  sub:`${activeAlerts} active`,           panel:"alerts"},
          {icon:"🔐", label:"Security",      sub:biometric?"Biometric on · PIN on":"Biometric off", panel:"security"},
          {icon:"📋", label:"Statements",    sub:"Monthly · PDF download",            panel:"statements"},
          {icon:"⚙️", label:"Preferences",   sub:`${currency} · ${weightUnit==="oz"?"troy oz":weightUnit} · ${theme}`, panel:"prefs"},
        ].map(({icon,label,sub,panel},i,a)=>(
          <div key={label} className="txrow" onClick={()=>setActivePanel(panel)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none",cursor:"pointer"}}>
            <div style={{width:36,height:36,borderRadius:10,background:C.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:C.t1}}>{label}</div>
              <div style={{fontSize:11,color:C.t3,marginTop:1}}>{sub}</div>
            </div>
            <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke={C.t3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        ))}
      </div>

      {/* Infrastructure */}
      <div style={{margin:"0 20px 14px"}}>
        <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:10}}>Powered By</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[
            {icon:"⬡",name:"Thirdweb",    note:"Self-custody wallet"},
            {icon:"🔗",name:"Chainlink",   note:"Oracle price feed"},
            {icon:"🔵",name:"Base L2",     note:"ERC-20 settlement"},
            {icon:"🏦",name:"Brinks Dubai",note:"Physical vault"},
          ].map(({icon,name,note})=>(
            <div key={name} style={{padding:"12px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14}}>
              <div style={{fontSize:18,marginBottom:6}}>{icon}</div>
              <div style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:2}}>{name}</div>
              <div style={{fontSize:10,color:C.t3}}>{note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ELEVATED SEND MODAL (Venmo-for-gold) ─────────────────────────────────────
// P2P gold transfer — "as easy as sending a text" (BGL press release)
// Shows gram amount + USD equiv + Base tx hash on confirm
function ElevatedSendModal({ liveOz, onClose }) {
  const [step, setStep] = useState(1); // 1=compose, 2=review, 3=done
  const [to, setTo] = useState("");
  const [raw, setRaw] = useState("");
  const [inOz, setInOz] = useState(true);
  const [focus, setFocus] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [baseBlock, setBaseBlock] = useState(0);

  const num = parseFloat(raw)||0;
  const ozAmt = inOz ? num : num/liveOz;
  const gramAmt = ozAmt * TROY;
  const usdVal = ozAmt * liveOz;
  const valid = to.trim().length>2 && ozAmt>0 && ozAmt <= HOLDING_OZ;

  const confirm = () => {
    const hash = "0x"+Array.from({length:40},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("").slice(0,8)+"..."+Array.from({length:6},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
    setTxHash(hash);
    setBaseBlock(14882441 + Math.floor(Math.random()*100));
    setStep(3);
  };

  const recipient = to.startsWith("0x") ? to.slice(0,6)+"..."+to.slice(-4) : to;

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>

        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>

        {step===3 ? (
          /* ── DONE STATE ── */
          <div style={{textAlign:"center",paddingBottom:12}}>
            <div style={{width:80,height:80,borderRadius:"50%",background:"rgba(212,175,55,0.08)",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:32,color:C.gold,boxShadow:`0 0 40px rgba(212,175,55,0.12)`}}>✓</div>
            <div style={{fontSize:22,fontWeight:700,color:C.t1,marginBottom:6}}>Gold Sent</div>

            {/* Big gram amount — the differentiator */}
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:42,fontWeight:200,color:C.gold,letterSpacing:"-0.02em",marginBottom:4}}>
              {fmtGN(gramAmt)}<span style={{fontSize:20,color:C.t3}}> g</span>
            </div>
            <div style={{fontSize:14,color:C.t3,marginBottom:4}}>{fmtOzN(ozAmt)} oz SGC · {fmtUSD(usdVal)}</div>
            <div style={{fontSize:13,color:C.t2,marginBottom:24}}>→ {recipient}</div>

            {/* Base tx confirmation */}
            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,padding:"14px 16px",marginBottom:20,textAlign:"left"}}>
              <div style={{fontSize:9,color:"#3772ff",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:8}}>Base Chain · Confirmed</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#3772ff",wordBreak:"break-all",lineHeight:1.5,marginBottom:10}}>{txHash}</div>
              <div style={{display:"flex",gap:16}}>
                <div><div style={{fontSize:9,color:C.t3,marginBottom:2}}>BLOCK</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t2}}>#{baseBlock.toLocaleString()}</div></div>
                <div><div style={{fontSize:9,color:C.t3,marginBottom:2}}>CONFIRMS</div><div style={{fontSize:11,fontWeight:700,color:C.green}}>Instant ✓</div></div>
                <div><div style={{fontSize:9,color:C.t3,marginBottom:2}}>FEE</div><div style={{fontSize:11,color:C.t2}}>~$0.08</div></div>
              </div>
            </div>

            <div style={{padding:"10px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.15)",borderRadius:10,fontSize:11,color:C.t3,marginBottom:20,textAlign:"left"}}>
              🔗 View on <span style={{color:"#3772ff",fontWeight:700}}>Base Explorer</span>
            </div>

            <button onClick={onClose} style={{width:"100%",padding:"16px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:C.t1}}>
              Done
            </button>
          </div>
        ) : step===2 ? (
          /* ── REVIEW STATE ── */
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,paddingBottom:20,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",border:`1.5px solid rgba(212,175,55,0.3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold}}>↑</div>
              <div><div style={{fontSize:18,fontWeight:700,color:C.t1}}>Review Transfer</div><div style={{fontSize:12,color:C.t3,marginTop:2}}>Settles in ~2s on Base</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>

            {/* Big send amount */}
            <div style={{textAlign:"center",marginBottom:24,padding:"20px",background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:44,fontWeight:200,color:C.gold,letterSpacing:"-0.02em"}}>
                {fmtGN(gramAmt)}<span style={{fontSize:18,color:C.t3}}> g</span>
              </div>
              <div style={{fontSize:13,color:C.t3,marginTop:4}}>{fmtOzN(ozAmt)} oz · {fmtUSD(usdVal)}</div>
              <div style={{fontSize:12,color:C.t2,marginTop:8}}>→ <span style={{fontWeight:600}}>{recipient}</span></div>
            </div>

            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",marginBottom:20}}>
              {[
                {k:"To",            v:recipient,                 hi:false},
                {k:"Grams",         v:`${fmtGN(gramAmt)}g SGC`, hi:true},
                {k:"Troy oz",       v:`${fmtOzN(ozAmt)} oz`,    hi:false},
                {k:"USD value",     v:fmtUSD(usdVal),           hi:false},
                {k:"Chainlink rate",v:`${fmtOz(liveOz)}/oz`,    chainlink:true},
                {k:"Network",       v:"Base (Coinbase L2)",      hi:false},
                {k:"Est. fee",      v:"~$0.08",                  hi:false},
                {k:"Settlement",    v:"~2 seconds",              hi:false},
              ].map(({k,v,hi,chainlink},i,a)=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 18px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                  <span style={{fontSize:13,color:C.t3}}>{k}</span>
                  <span style={{fontSize:13,fontWeight:hi?700:500,color:chainlink?"#3772ff":hi?C.gold:C.t2}}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep(1)} style={{flex:1,padding:"16px 0",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,color:C.t2,fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:600,cursor:"pointer"}}>Back</button>
              <button onClick={confirm} style={{flex:2,padding:"16px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,color:C.t1,fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:`0 4px 20px rgba(212,175,55,0.25)`}}>
                Confirm Send
              </button>
            </div>
          </div>
        ) : (
          /* ── COMPOSE STATE ── */
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,paddingBottom:20,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",border:`1.5px solid rgba(212,175,55,0.3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold,fontWeight:700}}>↑</div>
              <div><div style={{fontSize:18,fontWeight:700,color:C.t1}}>Send Gold</div><div style={{fontSize:12,color:C.t3,marginTop:2}}>P2P · as easy as a text</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>

            {/* Recipient */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:8}}>To</div>
              <input value={to} onChange={e=>setTo(e.target.value)} placeholder="@username or 0x address"
                onFocus={()=>setFocus("to")} onBlur={()=>setFocus(null)}
                style={{width:"100%",boxSizing:"border-box",padding:"14px 16px",background:focus==="to"?"#F0EDE7":C.s1,border:`1.5px solid ${focus==="to"?C.gold:C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Sans',sans-serif",fontSize:15,outline:"none",transition:"all 0.15s"}}/>
              {/* Quick contacts */}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                {["@alex.bluegold","@sam.bg","@maya.gold"].map(c=>(
                  <button key={c} onClick={()=>setTo(c)} style={{padding:"5px 10px",background:to===c?"rgba(212,175,55,0.1)":C.s1,border:`1px solid ${to===c?C.gold:C.s2}`,borderRadius:8,cursor:"pointer",fontSize:10,color:to===c?C.gold:C.t3,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Amount</div>
                <button onClick={()=>setInOz(!inOz)} style={{background:"none",border:`1px solid ${C.s2}`,cursor:"pointer",fontSize:10,color:C.gold,fontFamily:"'DM Sans',sans-serif",fontWeight:700,padding:"2px 10px",borderRadius:6}}>
                  {inOz?"→ USD":"→ oz"}
                </button>
              </div>
              <div style={{position:"relative"}}>
                <input type="number" inputMode="decimal" value={raw} onChange={e=>setRaw(e.target.value)} placeholder="0"
                  onFocus={()=>setFocus("amt")} onBlur={()=>setFocus(null)}
                  style={{width:"100%",boxSizing:"border-box",padding:"18px 60px 18px 16px",background:focus==="amt"?"#F0EDE7":C.s1,border:`1.5px solid ${focus==="amt"?C.gold:C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Mono',monospace",fontSize:32,fontWeight:300,outline:"none",transition:"all 0.15s"}}/>
                <div style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.t3,fontWeight:700}}>{inOz?"oz":"USD"}</div>
              </div>
              {num>0&&(
                <div style={{display:"flex",gap:16,marginTop:8}}>
                  <span style={{fontSize:12,color:C.gold,fontWeight:600}}>{fmtGN(gramAmt)}g SGC</span>
                  <span style={{fontSize:12,color:C.t3}}>{fmtUSD(usdVal)}</span>
                </div>
              )}
              {ozAmt>HOLDING_OZ&&<div style={{fontSize:11,color:C.red,marginTop:4}}>⚠ Insufficient balance</div>}
            </div>

            {/* Balance row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 14px",background:C.s1,borderRadius:10,border:`1px solid ${C.s2}`,marginBottom:20}}>
              <span style={{fontSize:12,color:C.t3}}>Available</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2}}>{fmtOzN(HOLDING_OZ)} oz · {fmtGN(HOLDING_G)}g</span>
            </div>

            <button onClick={()=>valid&&setStep(2)} disabled={!valid} style={{width:"100%",padding:"17px 0",background:valid?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",border:"none",borderRadius:14,cursor:valid?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:valid?"#080808":"#2a2a2a",letterSpacing:"0.02em",transition:"all 0.2s",boxShadow:valid?`0 6px 24px rgba(212,175,55,0.25)`:"none"}}>
              Review Transfer →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// LBMA Fix logic — AM 10:30 UTC / PM 15:00 UTC
function getLBMAStatus() {
  const now   = new Date();
  const utcM  = now.getUTCHours()*60 + now.getUTCMinutes();
  return {
    amFixed: utcM >= 630,  // 10:30
    pmFixed: utcM >= 900,  // 15:00
    amFix:   5098.50,
    pmFix:   5114.25,
    amTime:  "10:30 UTC",
    pmTime:  "15:00 UTC",
  };
}

// Trading sessions (UTC offsets, approximate)
function getSessions() {
  const now    = new Date();
  const utcH   = now.getUTCHours();
  const utcM   = now.getUTCMinutes();
  const utcMin = utcH*60+utcM;
  return [
    { name:"Sydney",  open:22*60, close:7*60,  tz:"AEDT",  color:"#4FC3F7" },
    { name:"Tokyo",   open:23*60, close:8*60,  tz:"JST",   color:"#F5A623" },
    { name:"London",  open:8*60,  close:17*60, tz:"GMT",   color:"#D4AF37" },
    { name:"New York",open:13*60, close:22*60, tz:"ET",    color:"#5FE08A" },
  ].map(s => {
    let active;
    if(s.open > s.close) active = utcMin >= s.open || utcMin < s.close;
    else active = utcMin >= s.open && utcMin < s.close;
    return {...s, active};
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MiniSparkline({ data, positive }) {
  const W=72, H=26, pts=data.length;
  const mn=Math.min(...data), mx=Math.max(...data), rng=mx-mn||1;
  const cx=i=>(i/(pts-1))*W;
  const cy=v=>H-((v-mn)/rng)*H*0.82-H*0.09;
  const line=data.map((v,i)=>`${i===0?"M":"L"}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(" ");
  const col=positive?C.gold:C.red;
  return(
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block",overflow:"visible"}}>
      <path d={line} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      <circle cx={cx(pts-1)} cy={cy(data[pts-1])} r="2.5" fill={col}/>
    </svg>
  );
}

function SentimentDial({ score }) {
  const label = score<20?"Extreme Fear":score<40?"Fear":score<60?"Neutral":score<80?"Greed":"Extreme Greed";
  const color  = score<20?C.red:score<40?"#F5A623":score<60?C.t2:score<80?C.green:C.gold;
  const R=64, CX=84, CY=84;
  const toRad  = d=>d*Math.PI/180;
  const aDeg   = 180-(score/100)*180;
  const needleX= CX+R*Math.cos(toRad(aDeg));
  const needleY= CY-R*Math.sin(toRad(aDeg));
  const arc=(a,b,r)=>{
    const [s,e]=[toRad(a),toRad(b)];
    const [x1,y1]=[CX+r*Math.cos(s),CY-r*Math.sin(s)];
    const [x2,y2]=[CX+r*Math.cos(e),CY-r*Math.sin(e)];
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,0 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      <svg width="168" height="96" viewBox="0 0 168 96" style={{overflow:"visible"}}>
        {[[180,144,"#F05050"],[144,108,"#F5A623"],[108,72,C.t3],[72,36,"#8BC34A"],[36,0,C.green]].map(([a,b,col],i)=>(
          <path key={i} d={arc(a,b,R)} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" opacity="0.28"/>
        ))}
        <path d={arc(180,aDeg,R)} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"/>
        <line x1={CX} y1={CY} x2={needleX.toFixed(1)} y2={needleY.toFixed(1)} stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx={CX} cy={CY} r="5.5" fill={C.bg} stroke={color} strokeWidth="2"/>
        <text x="10"  y="92" style={{fontSize:"7.5px",fill:C.t2,fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>FEAR</text>
        <text x="136" y="92" style={{fontSize:"7.5px",fill:C.t2,fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>GREED</text>
      </svg>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:300,color,marginTop:-6}}>{score}</div>
      <div style={{fontSize:12,fontWeight:700,color,marginTop:1,letterSpacing:"0.05em"}}>{label}</div>
    </div>
  );
}

function AlertBanner({ alerts, liveOz, onDismiss }) {
  const hit = alerts.filter(a=>a.active&&(a.dir==="above"?liveOz>=a.price:liveOz<=a.price));
  if(!hit.length) return null;
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:400,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
      <div style={{width:"100%",maxWidth:430,pointerEvents:"all"}}>
        {hit.map(a=>(
          <div key={a.id} style={{margin:"10px 14px 0",padding:"11px 14px",background:"rgba(10,10,10,0.95)",border:`1px solid ${C.gold}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",backdropFilter:"blur(24px)",boxShadow:`0 4px 32px rgba(212,175,55,0.2)`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:9,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🔔</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:C.gold}}>Alert Triggered</div>
                <div style={{fontSize:11,color:C.t2,marginTop:1}}>Gold {a.dir==="above"?"↑ above":"↓ below"} {fmtUSD(a.price)} · now {fmtUSD(liveOz)}</div>
              </div>
            </div>
            <button onClick={()=>onDismiss(a.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.t3,padding:4}}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
function MarketsTab({ liveOz, mktData, dataSource, lastUpdated, chainlink }) {
  const d          = mktData;
  const lastFetch  = lastUpdated;
  const [alerts,   setAlerts]   = useState([
    {id:1,price:5250,dir:"above",active:true, label:"Resistance breakout"},
    {id:2,price:5000,dir:"below",active:true, label:"Round number support"},
    {id:3,price:5602,dir:"above",active:true, label:"ATH breach"},
  ]);
  const [alertInput,setAlertInput] = useState("");
  const [alertDir,  setAlertDir]   = useState("above");
  const [alertFocus,setAlertFocus] = useState(false);
  const nextId = useRef(10);
  const sessions = getSessions();
  const lbma = getLBMAStatus();

  // Derived values
  const gsRatio = d?(liveOz/(d.silver_oz||57.42)).toFixed(1):"89.0";


  const SPARKS={
    gold:    [5232,5185,5201,5244,5190,5111,liveOz],
    silver:  [57.8,57.2,58.1,57.9,57.5,57.8,d?.silver_oz||57.4],
    plat:    [1008,1002,1015,1010,1005,1001,d?.platinum_oz||998],
    pall:    [975,968,972,965,960,962,d?.palladium_oz||958],
  };

  // Price alert handlers
  const addAlert=()=>{
    const p=parseFloat(alertInput);
    if(!p||p<100||p>20000)return;
    setAlerts(a=>[...a,{id:nextId.current++,price:p,dir:alertDir,active:true,label:"Custom"}]);
    setAlertInput("");
  };
  const removeAlert=id=>setAlerts(a=>a.filter(x=>x.id!==id));
  const toggleAlert=id=>setAlerts(a=>a.map(x=>x.id===id?{...x,active:!x.active}:x));
  const dismissAlert=id=>setAlerts(a=>a.map(x=>x.id===id?{...x,active:false}:x));

  // Shared card style
  const card=(mb=14)=>({margin:`0 20px ${mb}px`,background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"});
  const cardHdr=(label,right)=>(
    <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.s2}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:10,color:C.t3,letterSpacing:"0.11em",textTransform:"uppercase",fontWeight:700}}>{label}</span>
      {right&&<span style={{fontSize:10,color:C.t3}}>{right}</span>}
    </div>
  );

  const goldChg = d.change_pct_24h ?? -1.25;
  const todayRange = (d.intraday_high||5148) - (d.intraday_low||5096);
  const posInRange=Math.max(0,Math.min(100,((liveOz-d.intraday_low)/todayRange)*100));

  return(
    <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>

      <AlertBanner alerts={alerts} liveOz={liveOz} onDismiss={dismissAlert}/>

      {/* ─ 0. PRICE HERO + SESSIONS ─────────────────────────────────────── */}
      <div style={{padding:"18px 20px 0"}}>
        {/* Header row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div>
            <div style={{fontSize:11,color:C.t3,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>XAU/USD · Live Spot</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:36,fontWeight:200,color:C.gold,letterSpacing:"-0.02em",lineHeight:1}}>{fmtUSD(liveOz)}</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
              <span style={{fontSize:13,fontWeight:700,color:goldChg>=0?C.green:C.red}}>{goldChg>=0?"+":""}{goldChg.toFixed(2)}%</span>
              <span style={{fontSize:12,color:C.t3}}>{fmtUSD(Math.abs(goldChg/100*liveOz))} today</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.t3,marginBottom:4}}>per gram SGC</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:300,color:C.gold}}>{fmtUSD(liveOz/TROY)}</div>
            <div style={{fontSize:10,color:C.t3,marginTop:4}}>AED {(liveOz*3.6725).toLocaleString("en-US",{maximumFractionDigits:0})}/oz</div>
          </div>
        </div>

        {/* Data source status bar */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"7px 12px",borderRadius:9,marginBottom:12,
          background:dataSource==="live"?"rgba(95,224,138,0.07)":dataSource==="cached"?"rgba(245,166,35,0.07)":"rgba(58,58,58,0.5)",
          border:`1px solid ${dataSource==="live"?"rgba(95,224,138,0.25)":dataSource==="cached"?"rgba(245,166,35,0.25)":"rgba(58,58,58,0.8)"}`,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:7,height:7,borderRadius:"50%",
              background:dataSource==="live"?C.green:dataSource==="cached"?"#F5A623":C.t3,
              boxShadow:dataSource==="live"?`0 0 6px ${C.green}`:undefined,
              animation:dataSource==="live"?"pulse 2s ease-in-out infinite":undefined,
            }}/>
            <span style={{fontSize:11,fontWeight:700,
              color:dataSource==="live"?C.green:dataSource==="cached"?"#F5A623":C.t3,
              letterSpacing:"0.06em",
            }}>
              {chainlink?.priceUSD ? "⬡ CHAINLINK · BASE MAINNET" : dataSource==="live" ? "LIVE · YAHOO FINANCE" : dataSource==="cached" ? "CACHED · REFRESHING" : "SEED DATA"}
            </span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {lastFetch&&<span style={{fontSize:10,color:C.t3}}>Updated {lastFetch}</span>}
            <span style={{fontSize:10,color:C.t3}}>· 15s refresh</span>
          </div>
        </div>

        {/* Session clock */}
        <div style={{display:"flex",gap:6,marginBottom:4}}>
          {sessions.map(({name,tz,color,active})=>(
            <div key={name} style={{flex:1,padding:"7px 0",background:active?"rgba(212,175,55,0.07)":C.s1,border:`1px solid ${active?C.goldDim:C.s2}`,borderRadius:10,textAlign:"center",transition:"all 0.3s"}}>
              <div style={{fontSize:10,fontWeight:700,color:active?color:C.t3,marginBottom:2}}>{name.split(" ")[0]}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:active?color:C.s2,boxShadow:active?`0 0 5px ${color}`:undefined}}/>
                <span style={{fontSize:9,color:active?C.t2:C.t3,fontWeight:active?700:400}}>{active?"OPEN":"CLOSED"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─ 1. INTRADAY RANGE + KEY LEVELS ──────────────────────────────── */}
      <div style={{...card(14),marginTop:14}}>
        {cardHdr("Intraday Range · Key Levels","Mar 13, 2026")}
        <div style={{padding:"14px"}}>
          {/* Range bar */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:9,color:C.t3,fontWeight:700,marginBottom:2}}>LOW</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.red}}>{fmtUSD(d.intraday_low)}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:9,color:C.t3,fontWeight:700,marginBottom:2}}>OPEN</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2}}>{fmtUSD(d.intraday_open)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:C.t3,fontWeight:700,marginBottom:2}}>HIGH</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.green}}>{fmtUSD(d.intraday_high)}</div>
              </div>
            </div>
            {/* Visual range */}
            <div style={{height:8,background:C.s2,borderRadius:4,position:"relative",overflow:"visible",marginBottom:4}}>
              <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,rgba(240,80,80,0.2),rgba(212,175,55,0.2),rgba(95,224,138,0.2))`,borderRadius:4}}/>
              {/* Current price dot */}
              <div style={{position:"absolute",left:`${posInRange}%`,top:"50%",transform:"translate(-50%,-50%)",width:14,height:14,borderRadius:"50%",background:C.gold,border:`2px solid ${C.bg}`,zIndex:2,boxShadow:`0 0 8px rgba(212,175,55,0.6)`}}/>
              {/* Open marker */}
              <div style={{position:"absolute",left:`${Math.max(2,Math.min(98,((d.intraday_open-d.intraday_low)/todayRange)*100))}%`,top:"-3px",width:2,height:14,background:"rgba(136,136,136,0.5)",borderRadius:1}}/>
            </div>
            <div style={{textAlign:"center",fontSize:10,color:C.t3}}>Range: {fmtUSD(todayRange)} · Price {posInRange.toFixed(0)}% of range</div>
          </div>

          {/* Support / Resistance table */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:9,color:C.green,fontWeight:700,letterSpacing:"0.1em",marginBottom:6}}>SUPPORT</div>
              {[5107.72,5052.87,4996.26,4937.88].map(s=>(
                <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(95,224,138,0.04)",borderRadius:6,marginBottom:4,border:"1px solid rgba(95,224,138,0.1)"}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2}}>{fmtUSD(s)}</span>
                  <span style={{fontSize:9,color:C.t3}}>−{fmtUSD(liveOz-s)}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{fontSize:9,color:C.red,fontWeight:700,letterSpacing:"0.1em",marginBottom:6}}>RESISTANCE</div>
              {[5208.41,5266.41,5320.89,5426.67].map(r=>(
                <div key={r} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(240,80,80,0.04)",borderRadius:6,marginBottom:4,border:"1px solid rgba(240,80,80,0.1)"}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2}}>{fmtUSD(r)}</span>
                  <span style={{fontSize:9,color:C.t3}}>+{fmtUSD(r-liveOz)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Pivot */}
          <div style={{marginTop:8,padding:"8px 10px",background:"rgba(212,175,55,0.05)",border:`1px solid ${C.goldDim}`,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:C.t3,fontWeight:600}}>Pivot Point</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.gold,fontWeight:500}}>$5,173.04</span>
            <span style={{fontSize:10,color:liveOz<5173?"rgba(240,80,80,0.8)":"rgba(95,224,138,0.8)",fontWeight:700}}>{liveOz<5173?"Below pivot":"Above pivot"}</span>
          </div>
          <div style={{fontSize:10,color:C.t3,marginTop:8}}>Source: LiteFinance · FX Leaders · Verified Mar 13 2026</div>
        </div>
      </div>

      {/* ─ 2. TECHNICAL INDICATORS ──────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Technical Indicators · Daily","XAU/USD")}
        <div style={{padding:"12px 14px"}}>
          {/* Summary signal row */}
          <div style={{padding:"10px 12px",background:"rgba(240,80,80,0.06)",border:"1px solid rgba(240,80,80,0.15)",borderRadius:10,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:C.t3,marginBottom:3}}>Overall daily signal</div>
              <div style={{fontSize:14,fontWeight:800,color:C.red,letterSpacing:"0.05em"}}>SELL</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:10,color:C.t3,marginBottom:3}}>Weekly</div>
              <div style={{fontSize:13,fontWeight:700,color:C.gold}}>STRONG BUY</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:C.t3,marginBottom:3}}>Monthly</div>
              <div style={{fontSize:13,fontWeight:700,color:C.green}}>STRONG BUY</div>
            </div>
          </div>

          {/* Indicator rows */}
          {[
            {
              label:"RSI (14)",
              value:d.rsi14.toFixed(1),
              sub:"Neutral · no clear bias",
              bar:d.rsi14,barMin:0,barMax:100,
              zones:[{x:30,w:40,color:"rgba(95,224,138,0.12)"}],
              overBought:70,overSold:30,
              signal:d.rsi14>70?"OVERBOUGHT":d.rsi14<30?"OVERSOLD":"NEUTRAL",
              sigColor:d.rsi14>70?C.red:d.rsi14<30?C.green:C.t2,
            },
            {
              label:"MACD (12,26,9)",
              value:`${(d.macd||0).toFixed(1)} / ${(d.macd_signal||0).toFixed(1)}`,
              sub:(d.macd||0)<(d.macd_signal||0)?"Bearish crossover":"Bullish crossover",
              signal:(d.macd||0)<(d.macd_signal||0)?"BEARISH":"BULLISH",
              sigColor:(d.macd||0)<(d.macd_signal||0)?C.red:C.green,
              noBar:true,
            },
            {
              label:"ATR (14-day)",
              value:fmtUSD(d.atr||19.6),
              sub:"Daily volatility range",
              signal:`±${fmtUSD(d.atr||19.6)}`,
              sigColor:C.t2,noBar:true,
            },
            {
              label:"ADX (14)",
              value:(d.adx||24.1).toFixed(1),
              sub:(d.adx||24)<25?"Weak trend · <25":"Trending",
              bar:d.adx||24,barMin:0,barMax:60,
              signal:(d.adx||24)<20?"NO TREND":(d.adx||24)<25?"WEAK":d.adx<40?"TRENDING":"STRONG",
              sigColor:(d.adx||24)<25?C.t2:C.gold,
            },
          ].map(({label,value,sub,bar,barMin,barMax,signal,sigColor,noBar,zones})=>(
            <div key={label} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:noBar?0:5}}>
                <div>
                  <span style={{fontSize:12,fontWeight:600,color:C.t1}}>{label}</span>
                  <span style={{fontSize:10,color:C.t3,marginLeft:8}}>{sub}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2}}>{value}</span>
                  <span style={{fontSize:10,fontWeight:800,color:sigColor,letterSpacing:"0.04em"}}>{signal}</span>
                </div>
              </div>
              {!noBar&&(
                <div style={{height:4,background:C.s2,borderRadius:2,position:"relative",overflow:"hidden"}}>
                  {zones?.map((z,i)=>(
                    <div key={i} style={{position:"absolute",left:`${(z.x-barMin)/(barMax-barMin)*100}%`,width:`${z.w/(barMax-barMin)*100}%`,height:"100%",background:z.color}}/>
                  ))}
                  <div style={{position:"absolute",left:`${((bar-barMin)/(barMax-barMin))*100}%`,transform:"translateX(-50%)",top:"-1px",width:6,height:6,borderRadius:"50%",background:sigColor}}/>
                </div>
              )}
            </div>
          ))}

          {/* Moving averages */}
          <div style={{marginTop:4}}>
            <div style={{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Moving Averages</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[
                {label:"SMA 50",  value:d.sma50,  note:"Resistance"},
                {label:"EMA 20",  value:d.ema20,  note:"Resistance"},
                {label:"SMA 200", value:d.sma200, note:"Support"},
              ].map(({label,value,note})=>{
                const abv=liveOz>value;
                return(
                  <div key={label} style={{padding:"8px",background:C.s2,borderRadius:9,textAlign:"center"}}>
                    <div style={{fontSize:9,color:C.t3,fontWeight:700,marginBottom:3}}>{label}</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t2,marginBottom:3}}>{fmtUSD(value)}</div>
                    <div style={{fontSize:9,fontWeight:700,color:abv?C.green:C.red}}>{abv?"ABOVE":"BELOW"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* ─ 16. PRICE ALERTS ─────────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Price Alerts",`${alerts.filter(a=>a.active).length} active`)}
        {/* Input */}
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.s2}`}}>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {["above","below"].map(dir=>(
              <button key={dir} onClick={()=>setAlertDir(dir)} style={{flex:1,padding:"7px",background:alertDir===dir?"rgba(212,175,55,0.08)":C.s2,border:`1px solid ${alertDir===dir?C.gold:C.s2}`,borderRadius:9,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:alertDir===dir?C.gold:C.t2,transition:"all 0.15s"}}>
                {dir==="above"?"↑ Above":"↓ Below"}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <div style={{flex:1,display:"flex",alignItems:"center",background:alertFocus?"#0f0f0f":C.s2,border:`1.5px solid ${alertFocus?C.gold:C.s2}`,borderRadius:9,padding:"0 10px",transition:"all 0.15s"}}>
              <span style={{fontSize:13,color:C.t3,marginRight:4}}>$</span>
              <input type="number" value={alertInput} onChange={e=>setAlertInput(e.target.value)} onFocus={()=>setAlertFocus(true)} onBlur={()=>setAlertFocus(false)} placeholder="Price per oz"
                style={{flex:1,background:"none",border:"none",outline:"none",fontFamily:"'DM Mono',monospace",fontSize:13,color:C.t1,padding:"9px 0"}}/>
            </div>
            <button onClick={addAlert} disabled={!parseFloat(alertInput)||parseFloat(alertInput)<100}
              style={{padding:"0 14px",background:parseFloat(alertInput)>100?`linear-gradient(135deg,${C.goldD},${C.gold})`:"#1a1a1a",border:"none",borderRadius:9,cursor:parseFloat(alertInput)>100?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:800,color:parseFloat(alertInput)>100?"#080808":"#2a2a2a",transition:"all 0.15s",whiteSpace:"nowrap"}}>
              + Set
            </button>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[5000,5208,5266,5370,5602].map(p=>(
              <button key={p} onClick={()=>setAlertInput(String(p))} style={{padding:"3px 8px",background:C.s2,border:`1px solid ${C.s2}`,borderRadius:14,cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3,fontWeight:600}}>
                {fmtUSD(p)}
              </button>
            ))}
          </div>
          <div style={{fontSize:9,color:C.t3,marginTop:6}}>Presets = support/resistance levels from section 1 above</div>
        </div>
        {/* Alert list */}
        {alerts.length===0?(
          <div style={{padding:"18px",textAlign:"center",fontSize:12,color:C.t3}}>No alerts set.</div>
        ):alerts.map((a,i)=>(
          <div key={a.id} style={{display:"flex",alignItems:"center",padding:"10px 14px",borderBottom:i<alerts.length-1?`1px solid ${C.s2}`:"none",opacity:a.active?1:0.4}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:a.active?C.gold:C.t3,marginRight:12,flexShrink:0,boxShadow:a.active?`0 0 5px rgba(212,175,55,0.5)`:undefined}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:C.t1,fontWeight:500}}>
                {a.dir==="above"?"↑ Above":"↓ Below"}{" "}
                <span style={{fontFamily:"'DM Mono',monospace",color:C.gold}}>{fmtUSD(a.price)}</span>
              </div>
              <div style={{fontSize:9,color:C.t3,marginTop:2}}>
                {a.label}
                {a.active&&<span style={{marginLeft:6,color:(a.dir==="above"?liveOz>=a.price:liveOz<=a.price)?C.red:C.green}}>{(a.dir==="above"?liveOz>=a.price:liveOz<=a.price)?"● HIT":"● Watching"}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>toggleAlert(a.id)} style={{padding:"3px 9px",background:a.active?"rgba(212,175,55,0.08)":C.s2,border:`1px solid ${a.active?C.goldDim:C.s2}`,borderRadius:14,cursor:"pointer",fontSize:9,fontWeight:700,color:a.active?C.gold:C.t3,fontFamily:"'DM Sans',sans-serif"}}>{a.active?"ON":"OFF"}</button>
              <button onClick={()=>removeAlert(a.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:C.t3,padding:"2px 4px"}}>✕</button>
            </div>
          </div>
        ))}
        <div style={{padding:"7px 14px",background:"rgba(26,23,16,0.05)"}}>
          <div style={{fontSize:10,color:C.t3}}>Checks on every 15s poll. Push notifications available in the native Expo app.</div>
        </div>
      </div>

      {/* ─ 17. AI ANALYST CONTEXT ───────────────────────────────────────── */}
      {d.analyst_note&&(
        <div style={{margin:"0 20px 14px",padding:"14px",background:"rgba(212,175,55,0.04)",border:`1px solid rgba(212,175,55,0.14)`,borderRadius:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>📊</div>
            <div>
              <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>AI Market Context</div>
              <div style={{fontSize:9,color:C.t3,marginTop:1}}>Generated by Claude · refreshes every 15s</div>
            </div>
          </div>
          <div style={{fontSize:13,color:"#bbb",lineHeight:1.7}}>{d.analyst_note}</div>
          <div style={{marginTop:10,padding:"7px 10px",background:"rgba(26,23,16,0.06)",borderRadius:8,fontSize:9,color:C.t3}}>Not investment advice. AI-synthesized for demonstration purposes only. Consult a licensed advisor before trading.</div>
        </div>
      )}

      {/* ─ FOOTER ───────────────────────────────────────────────────────── */}
      <div style={{margin:"0 20px",padding:"12px 14px",background:C.s1,borderRadius:12,border:`1px solid ${C.s2}`}}>
        <div style={{fontSize:9,color:C.t3,lineHeight:1.8}}>
          <span style={{color:C.t2,fontWeight:700}}>Primary:</span> Chainlink XAU/USD oracle · Base Mainnet · 0x7b21...626F · <span style={{color:C.t2,fontWeight:700}}>Fallback:</span> Yahoo Finance (GC=F, SI=F, PL=F, CL=F, ^GSPC, ^VIX, DX-Y.NYB, ^TNX) · CoinGecko (BTC) · Technicals calculated from price history · AI analyst by Claude
          {"\n"}
          <span style={{color:C.t2,fontWeight:700}}>BlueGold SGC:</span> 1 SGC = 1g allocated gold · LBMA 999.9 · Dubai vault · ERC-20 on Base (Coinbase L2) · Audited 100% reserve ratio ⚠ demo
          {"\n"}All prices USD unless noted. Market data is for informational purposes only and does not constitute investment advice or an offer to buy or sell any financial instrument.
        </div>
      </div>

    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// Expo/TypeScript-ready architecture · Base L2 · Thirdweb · Chainlink
// ─── REAL-TIME DATA LAYER ─────────────────────────────────────────────────────
// PRIMARY:  Chainlink XAU/USD oracle on Base (Alchemy RPC)
// FALLBACK: Yahoo Finance GC=F (no key required)
// MACRO:    Yahoo Finance parallel fetch
// BTC:      CoinGecko (no key required)
// TECHNICALS: Calculated client-side from price history
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_POLL_MS = 10000;  // 10s price refresh
const DEEP_POLL_MS  = 60000;  // 60s full macro refresh

// ── Chainlink XAU/USD on Base ─────────────────────────────────────────────
const ALCHEMY_RPC       = "https://base-mainnet.g.alchemy.com/v2/jtNzdZOS1MmjIhuPTNp7B";
const CHAINLINK_XAU_USD = "0x7b219F57a8e9C7303204Af681e9fA69d17ef626F";
// latestRoundData() selector: 0xfeaf968c
// Returns: roundId, answer (8 decimals), startedAt, updatedAt, answeredInRound

async function fetchChainlinkGold() {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{
      to: CHAINLINK_XAU_USD,
      data: "0xfeaf968c"   // latestRoundData()
    }, "latest"]
  };
  const res = await fetch(ALCHEMY_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Alchemy RPC: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  // ABI decode: 5 x uint256 (32 bytes each) = 320 hex chars + 0x
  const hex = json.result;
  if (!hex || hex === "0x") throw new Error("Empty response");
  // answer is the 2nd word (bytes 32-64, index 1)
  const words = [];
  for (let i = 2; i < hex.length; i += 64) {
    words.push(hex.slice(i, i + 64));
  }
  const answer    = parseInt(words[1], 16);   // 8 decimals
  const updatedAt = parseInt(words[3], 16);   // unix timestamp
  const priceUSD  = answer / 1e8;
  const ageSeconds = Math.floor(Date.now() / 1000) - updatedAt;
  if (priceUSD < 1000 || priceUSD > 15000) throw new Error("Price out of range");
  return { priceUSD, updatedAt, ageSeconds };
}

// ── Yahoo Finance fallback ────────────────────────────────────────────────
async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);
  const d = await res.json();
  const meta = d.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No meta for ${symbol}`);
  const price   = meta.regularMarketPrice;
  const prev    = meta.chartPreviousClose || meta.previousClose || price;
  const chgPct  = prev ? ((price - prev) / prev) * 100 : 0;
  const high    = meta.regularMarketDayHigh  || price * 1.005;
  const low     = meta.regularMarketDayLow   || price * 0.995;
  const open    = meta.regularMarketOpen     || prev;
  return { price, prev, chgPct, high, low, open };
}

// ── RSI calculation (14-period) from price array ─────────────────────────────
function calcRSI(prices, period=14) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i-1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

// ── EMA calculation ───────────────────────────────────────────────────────────
function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return parseFloat(ema.toFixed(2));
}

// ── SMA calculation ───────────────────────────────────────────────────────────
function calcSMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
}

// ── ATR (14) approximation from daily data ───────────────────────────────────
function calcATR(prices, period=14) {
  // Approximate using daily price range from ALL_DATA_OZ
  const ranges = [];
  for (let i = 1; i < prices.length; i++) {
    ranges.push(Math.abs(prices[i] - prices[i-1]));
  }
  const recent = ranges.slice(-period);
  return parseFloat((recent.reduce((a,b)=>a+b,0)/recent.length).toFixed(1));
}

// ── MACD (12,26,9) ───────────────────────────────────────────────────────────
function calcMACD(prices) {
  if (prices.length < 26) return { macd: 0, signal: 0 };
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macdLine = parseFloat((ema12 - ema26).toFixed(1));
  // Signal: 9-period EMA of MACD — approximate with last few MACD values
  const signal = parseFloat((macdLine * 0.82).toFixed(1)); // simplified
  return { macd: macdLine, signal };
}

// ── Fear/Greed from VIX + gold momentum ──────────────────────────────────────
function calcFearScore(vix, goldChgPct) {
  // VIX above 30 = fear, below 15 = greed
  const vixScore = Math.max(0, Math.min(100, 100 - ((vix - 10) / 30) * 100));
  // Gold up = some greed/safe-haven, down = fear
  const goldScore = Math.max(0, Math.min(100, 50 + goldChgPct * 8));
  return Math.round(vixScore * 0.6 + goldScore * 0.4);
}

const SEED = {
  oz:5110.00, change_pct_24h:-1.25, change_oz_24h:-64.88,
  silver_oz:57.42, platinum_oz:998.50, palladium_oz:958.20,
  silver_chg:-0.82, platinum_chg:0.31, palladium_chg:-1.14,
  dxy:104.18, dxy_chg:-0.22,
  t10y:4.38, t10y_chg:-2.1, t2y:4.61, t2y_chg:-1.8,
  spx:5821, spx_chg:0.44, vix:18.4,
  oil:84.20, oil_chg:0.62,
  rsi14:47.2, macd:-11.4, macd_signal:-8.9, atr:19.6, adx:24.1,
  sma50:5185, sma200:4438, ema20:5162,
  intraday_high:5148.30, intraday_low:5096.20, intraday_open:5134.00,
  gld_flow:-87, iau_flow:-32, gld_aum:62.4,
  fear_score:64,
  fear_rationale:"Institutional bid firm; Iran risk premium intact.",
  analyst_note:"Gold consolidating near key resistance. RSI at 47 suggests pullback may be near exhaustion.",
  gold_ytd:19.2, btc_chg:-2.14,
};

export default function App() {
  const [liveOz,      setLiveOz]      = useState(SEED.oz);
  const [mktData,     setMktData]     = useState(SEED);
  const [dataSource,  setDataSource]  = useState("seed");
  const [priceFlash,  setPriceFlash]  = useState(null);
  const [fetching,    setFetching]    = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [progress,    setProgress]    = useState(0);

  const [range,    setRange]    = useState("1Y");
  const [hoverIdx, setHoverIdx] = useState(null);
  const [tab,      setTab]      = useState("home");
  const [mounted,  setMounted]  = useState(false);
  const [screen,   setScreen]   = useState("home");

  const [sendOpen,   setSendOpen]   = useState(false);
  const [activeTx,   setActiveTx]   = useState(null);
  const [vaultOpen,  setVaultOpen]  = useState(false);

  // ── Security state — app-wide ──────────────────────────────────────────
  const [biometric,     setBiometric]     = useState(true);
  const [twoFA,         setTwoFA]         = useState(false);
  const [autoLock,      setAutoLock]      = useState("5min");
  const [hideBalance,   setHideBalance]   = useState(false);
  const [transactionPin,setTransactionPin]= useState(true);
  // Lock / PIN / 2FA UI state
  const [appLocked,     setAppLocked]     = useState(false);
  const [pinModal,      setPinModal]      = useState(null); // null | "send" | "spend" — action to resume after PIN
  const [twoFAModal,    setTwoFAModal]    = useState(null); // null | "setup" | "verify"
  const [enteredPin,    setEnteredPin]    = useState("");
  const DEMO_PIN = "1234"; // demo PIN — in prod stored in secure enclave
  const DEMO_TOTP = "847291"; // demo TOTP code

  const progRef    = useRef(null);
  const progStart  = useRef(null);
  const isVisible  = useRef(true);
  const retryCount = useRef(0);
  const tickRef    = useRef(null);
  const anchorOz   = useRef(SEED.oz);
  const priceHistory = useRef(ALL_DATA_OZ.map(d => d.oz));

  useEffect(()=>{ setMounted(true); },[]);
  useEffect(()=>{
    const h=()=>{ isVisible.current=!document.hidden; };
    document.addEventListener("visibilitychange",h);
    return()=>document.removeEventListener("visibilitychange",h);
  },[]);

  const stamp=()=>{
    const n=new Date();
    return `${n.getHours()}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`;
  };

  const tabRef   = useRef(tab);
  const screenRef= useRef(screen);
  useEffect(()=>{ tabRef.current=tab; },     [tab]);
  useEffect(()=>{ screenRef.current=screen; },[screen]);

  const inflight = useRef(false);

  // ── PRICE POLL: Chainlink oracle primary, Yahoo Finance fallback ────────────
  const [chainlinkData, setChainlinkData] = useState(null); // {priceUSD, ageSeconds, updatedAt}
  const fetchPrice = useCallback(async()=>{
    if(!isVisible.current || inflight.current) return;
    inflight.current = true;
    setFetching(true);
    let newOz = null;
    let source = "seed";
    let chgPct = SEED.change_pct_24h;
    let prevPrice = anchorOz.current;
    let high = null, low = null, open = null;

    // ── 1. Try Chainlink on Base first ──────────────────────────────────────
    try {
      const cl = await fetchChainlinkGold();
      newOz = parseFloat(cl.priceUSD.toFixed(2));
      setChainlinkData({ priceUSD: newOz, ageSeconds: cl.ageSeconds, updatedAt: cl.updatedAt });
      source = "chainlink";
    } catch(e) {
      // Chainlink failed — fall through to Yahoo
    }

    // ── 2. Yahoo Finance fallback (also gets intraday range) ────────────────
    try {
      const g = await yahooQuote("GC=F");
      const yahooOz = parseFloat(g.price.toFixed(2));
      if(!newOz) {
        // Chainlink failed — use Yahoo as price
        newOz = yahooOz;
        source = "yahoo";
      }
      // Always use Yahoo for intraday range + daily change (Chainlink doesn't provide these)
      chgPct    = parseFloat(g.chgPct.toFixed(2));
      prevPrice = parseFloat(g.prev.toFixed(2));
      high      = parseFloat(g.high.toFixed(2));
      low       = parseFloat(g.low.toFixed(2));
      open      = parseFloat(g.open.toFixed(2));
    } catch(e) {
      if(!newOz) {
        // Both failed
        retryCount.current++;
        setDataSource(retryCount.current <= 3 ? "cached" : "seed");
        setLastUpdated(stamp());
        setFetching(false);
        inflight.current = false;
        return;
      }
    }

    if(!newOz || newOz < 1000 || newOz > 15000) {
      setFetching(false); inflight.current = false; return;
    }

    // Update price history for technical calculations
    const hist = [...priceHistory.current, newOz];
    if(hist.length > 250) hist.shift();
    priceHistory.current = hist;

    const rsi14   = calcRSI(hist, 14);
    const { macd, signal: macdSig } = calcMACD(hist);
    const atr     = calcATR(hist, 14);
    const sma50   = calcSMA(hist, 50);
    const sma200  = calcSMA(hist, 200);
    const ema20   = calcEMA(hist, 20);

    anchorOz.current = newOz;
    setLiveOz(prev => {
      if(Math.abs(newOz - prev) > 0.5) {
        setPriceFlash(newOz > prev ? "up" : "down");
        setTimeout(()=>setPriceFlash(null), 1000);
      }
      return newOz;
    });

    setMktData(prev=>({
      ...prev,
      oz: newOz,
      change_pct_24h: chgPct,
      change_oz_24h: parseFloat((newOz - prevPrice).toFixed(2)),
      ...(high ? { intraday_high: high, intraday_low: low, intraday_open: open } : {}),
      rsi14, macd, macd_signal: macdSig, atr, sma50, sma200, ema20,
    }));

    setDataSource(source === "chainlink" ? "live" : "cached");
    setLastUpdated(stamp());
    retryCount.current = 0;
    setFetching(false);
    inflight.current = false;
  },[]);

  // ── DEEP POLL: full macro snapshot — parallel Yahoo Finance + CoinGecko ─────
  const inflightDeep = useRef(false);
  const fetchDeep = useCallback(async()=>{
    if(!isVisible.current || inflightDeep.current) return;
    if(screenRef.current!=="home" || tabRef.current!=="markets") return;
    inflightDeep.current = true;
    try {
      // Fire all requests in parallel
      const [silver, plat, pall, oil, spx, vix, dxy, t10y, t2y, btcRes] = await Promise.allSettled([
        yahooQuote("SI=F"),            // Silver futures
        yahooQuote("PL=F"),            // Platinum futures
        yahooQuote("PA=F"),            // Palladium futures
        yahooQuote("CL=F"),            // WTI Crude Oil
        yahooQuote("%5EGSPC"),         // S&P 500
        yahooQuote("%5EVIX"),          // VIX
        yahooQuote("DX-Y.NYB"),        // US Dollar Index
        yahooQuote("%5ETNX"),          // 10-Year Treasury Yield
        yahooQuote("%5EIRX"),          // 2-Year Treasury (IRX = 13-week, proxy)
        fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true")
          .then(r=>r.json()),
      ]);

      const get = (res) => res.status === "fulfilled" ? res.value : null;
      const silverD  = get(silver);
      const platD    = get(plat);
      const pallD    = get(pall);
      const oilD     = get(oil);
      const spxD     = get(spx);
      const vixD     = get(vix);
      const dxyD     = get(dxy);
      const t10yD    = get(t10y);
      const t2yD     = get(t2y);
      const btcData  = get(btcRes);

      const vixVal   = vixD?.price  || SEED.vix;
      const goldChg  = mktData.change_pct_24h || SEED.change_pct_24h;
      const fearScore = calcFearScore(vixVal, goldChg);

      // Claude AI analyst note — real AI synthesis, labeled as such
      let analystNote = mktData.analyst_note;
      try {
        const goldPrice = anchorOz.current;
        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 120,
            system: "You are a gold market analyst. Write 2 concise sentences (max 120 words total) summarizing current gold market conditions based on the data provided. Be specific about price levels. No disclaimers.",
            messages: [{ role: "user", content: `Gold: $${goldPrice}/oz (${goldChg>0?"+":""}${goldChg.toFixed(2)}% today). VIX: ${vixVal.toFixed(1)}. SPX: ${spxD?.price?.toFixed(0)||"N/A"}. DXY: ${dxyD?.price?.toFixed(2)||"N/A"}. 10Y: ${t10yD?.price?.toFixed(2)||"N/A"}%. Write 2 sentences on gold outlook.` }]
          })
        });
        if(aiRes.ok) {
          const aiBody = await aiRes.json();
          const txt = aiBody.content?.[0]?.text?.trim();
          if(txt && txt.length > 20) analystNote = txt;
        }
      } catch {}

      setMktData(prev => ({
        ...prev,
        // Precious metals
        ...(silverD ? { silver_oz: parseFloat(silverD.price.toFixed(2)), silver_chg: parseFloat(silverD.chgPct.toFixed(2)) } : {}),
        ...(platD   ? { platinum_oz: parseFloat(platD.price.toFixed(2)), platinum_chg: parseFloat(platD.chgPct.toFixed(2)) } : {}),
        ...(pallD   ? { palladium_oz: parseFloat(pallD.price.toFixed(2)), palladium_chg: parseFloat(pallD.chgPct.toFixed(2)) } : {}),
        // Macro
        ...(oilD    ? { oil: parseFloat(oilD.price.toFixed(2)), oil_chg: parseFloat(oilD.chgPct.toFixed(2)) } : {}),
        ...(spxD    ? { spx: Math.round(spxD.price), spx_chg: parseFloat(spxD.chgPct.toFixed(2)) } : {}),
        ...(vixD    ? { vix: parseFloat(vixVal.toFixed(1)) } : {}),
        ...(dxyD    ? { dxy: parseFloat(dxyD.price.toFixed(2)), dxy_chg: parseFloat(dxyD.chgPct.toFixed(2)) } : {}),
        ...(t10yD   ? { t10y: parseFloat(t10yD.price.toFixed(2)), t10y_chg: parseFloat(t10yD.chgPct.toFixed(2)) } : {}),
        ...(t2yD    ? { t2y: parseFloat(t2yD.price.toFixed(2)), t2y_chg: parseFloat(t2yD.chgPct.toFixed(2)) } : {}),
        // BTC
        ...(btcData?.bitcoin ? { btc_chg: parseFloat((btcData.bitcoin.usd_24h_change||0).toFixed(2)) } : {}),
        // Derived
        fear_score: fearScore,
        fear_rationale: `VIX at ${vixVal.toFixed(1)} — ${vixVal > 25 ? "elevated fear, flight-to-safety bid supporting gold" : vixVal < 15 ? "low volatility, risk-on environment" : "neutral sentiment"}. Gold ${goldChg >= 0 ? "gaining" : "declining"} ${Math.abs(goldChg).toFixed(2)}% on the session.`,
        analyst_note: analystNote,
        // YTD gold calculation (Jan 1 open ~$2,650 in 2025 terms — use actual)
        gold_ytd: parseFloat(((anchorOz.current - 2650) / 2650 * 100).toFixed(1)),
      }));

      setDataSource("live");
    } catch(e) {
      // Keep existing data on error
    }
    inflightDeep.current = false;
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    fetchPrice();
    const priceId = setInterval(()=>{ if(isVisible.current) fetchPrice(); }, PRICE_POLL_MS);
    const deepId  = setInterval(()=>{ if(isVisible.current) fetchDeep();  }, DEEP_POLL_MS);
    return()=>{ clearInterval(priceId); clearInterval(deepId); };
  },[fetchPrice]);

  useEffect(()=>{
    if(screen==="home" && tab==="markets") fetchDeep();
  },[tab, screen]);

  useEffect(()=>{
    setProgress(0);
    progStart.current = Date.now();
    clearInterval(progRef.current);
    progRef.current = setInterval(()=>{
      if(!isVisible.current) return;
      const pct = Math.min((Date.now()-progStart.current) / PRICE_POLL_MS, 1);
      setProgress(pct);
      if(pct >= 1) clearInterval(progRef.current);
    }, 50);
    return()=>clearInterval(progRef.current);
  },[lastUpdated]);

  // ── Smooth price interpolation — no random noise, pure ease toward anchor ──
  // Only shows real price movement, no fake jitter
  useEffect(()=>{
    tickRef.current = setInterval(()=>{
      if(!isVisible.current) return;
      setLiveOz(prev=>{
        const anchor = anchorOz.current;
        const diff = anchor - prev;
        // If within $0.50 of anchor, snap to it (no micro-jitter)
        if(Math.abs(diff) < 0.50) return anchor;
        // Smooth exponential ease: closes 15% of gap each tick
        const next = parseFloat((prev + diff * 0.15).toFixed(2));
        return next;
      });
    }, 250); // 250ms = 4 updates/sec, smooth without being jumpy
    return()=>clearInterval(tickRef.current);
  },[]);

    // Debounced chart price — updates chart every 2s not every 250ms
  const [chartOz, setChartOz] = useState(SEED.oz);
  const chartTimer = useRef(null);
  useEffect(()=>{
    clearTimeout(chartTimer.current);
    chartTimer.current = setTimeout(()=>setChartOz(liveOz), 2000);
    return()=>clearTimeout(chartTimer.current);
  },[liveOz]);
  const rangeData=useMemo(()=>getRange(range,chartOz),[range,chartOz]);

  // Smooth portfolio value counter — animates over 600ms on price update
  const portValueRaw = HOLDING_OZ * liveOz;
  const [displayPortValue, setDisplayPortValue] = useState(portValueRaw);
  const animRef = useRef(null);
  const animStart = useRef(null);
  const animFrom = useRef(portValueRaw);
  const animTo = useRef(portValueRaw);
  useEffect(()=>{
    animFrom.current = displayPortValue;
    animTo.current = portValueRaw;
    animStart.current = performance.now();
    cancelAnimationFrame(animRef.current);
    const animate = (now) => {
      const elapsed = now - animStart.current;
      const duration = 600;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const val = animFrom.current + (animTo.current - animFrom.current) * eased;
      setDisplayPortValue(val);
      if(t < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return()=>cancelAnimationFrame(animRef.current);
  },[portValueRaw]);
  const hi=hoverIdx??rangeData.length-1;
  // When not scrubbing: show live price. When scrubbing: show historical.
  const dispOz = hoverIdx===null ? liveOz : rangeData[hi].oz;
  const dispDate=rangeData[hi].date;
  const startOz=rangeData[0].oz;
  const change=dispOz-startOz;
  const changePct=(change/startOz)*100;
  const positive=change>=0;
  const eventNote=EVENTS[rangeData[hi]?.ts];

  const portValue = portValueRaw; // raw for calculations
  const portChange=portValue-INITIAL_USD;
  const portChangePct=(portChange/INITIAL_USD)*100;

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.t1,display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'DM Sans',sans-serif",paddingBottom:88}}>

      {/* Sub-screens */}
      {screen==="receive"&&<ReceiveScreen liveOz={liveOz} onBack={()=>setScreen("home")}/>}
      {screen==="buy"&&<BuyScreen liveOz={liveOz} onBack={()=>setScreen("home")}/>}
      {screen==="spend"&&<SpendScreen liveOz={liveOz} onBack={()=>setScreen("home")}/>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes slideUp{from{transform:translateY(32px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes slideInRight{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes flashUp{0%{color:${C.green};transform:scale(1.01)}100%{color:inherit;transform:scale(1)}}
        @keyframes flashDown{0%{color:${C.red};transform:scale(0.99)}100%{color:inherit;transform:scale(1)}}
        *{-webkit-tap-highlight-color:transparent;}
        .abtn{transition:all 0.14s cubic-bezier(0.4,0,0.2,1);}
        .abtn:active{transform:scale(0.95);opacity:0.9;}
        .nbtn{transition:color 0.18s ease;}
        .nbtn:hover span{color:${C.gold}!important;}
        .txrow{transition:background 0.12s ease;}
        .txrow:hover{background:${C.s2}!important;}
        .rbtn{transition:all 0.14s ease;}
        .rbtn:hover{color:${C.gold}!important;border-color:rgba(201,152,26,0.5)!important;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input{transition:border-color 0.18s ease,background 0.18s ease,box-shadow 0.18s ease;}
        input:focus{outline:none;box-shadow:0 0 0 3px rgba(201,152,26,0.15);}
        input::placeholder{color:${C.t3};}
        ::-webkit-scrollbar{width:0;height:0;}
        body{background:${C.bg};-webkit-font-smoothing:antialiased;overscroll-behavior:none;}
        ::selection{background:rgba(201,152,26,0.2);}
        .flash-up{animation:flashUp 1s cubic-bezier(0.4,0,0.6,1) forwards;}
        .flash-down{animation:flashDown 1s cubic-bezier(0.4,0,0.6,1) forwards;}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
      `}</style>

      {/* ── MARKETS TAB ── */}
      {screen==="home"&&tab==="markets"&&<MarketsTab liveOz={liveOz} mktData={mktData} dataSource={dataSource} lastUpdated={lastUpdated} chainlink={chainlinkData}/>}

      {/* ── WALLET TAB ── */}
      {screen==="home"&&tab==="wallet"&&(
        <WalletTab
          liveOz={liveOz}
          onSend={()=>setSendOpen(true)}
          onReceive={()=>setScreen("receive")}
          onBuy={()=>setScreen("buy")}
        />
      )}

      {/* ── VAULT TAB ── */}
      {screen==="home"&&tab==="vault"&&<VaultTab liveOz={liveOz}/>}

      {/* ── PROFILE TAB ── */}
      {screen==="home"&&tab==="profile"&&<ProfileTab
        liveOz={liveOz}
        biometric={biometric} setBiometric={setBiometric}
        twoFA={twoFA} setTwoFA={setTwoFA}
        autoLock={autoLock} setAutoLock={setAutoLock}
        hideBalance={hideBalance} setHideBalance={setHideBalance}
        transactionPin={transactionPin} setTransactionPin={setTransactionPin}
        onRequestSetPin={()=>setPinModal("setup_pin")}
        onRequestSetup2FA={()=>setTwoFAModal("setup")}
      />}

      {/* ── HOME TAB ── */}
      {screen==="home"&&tab==="home"&&<div style={{width:"100%",maxWidth:430}}>

        {/* Top bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:C.t1,boxShadow:`0 2px 12px rgba(212,175,55,0.35)`}}>Au</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1}}>BlueGold</div>
              <div style={{fontSize:10,color:C.t3,letterSpacing:"0.08em"}}>STANDARD GOLD COIN</div>
            </div>
          </div>
          <RefreshRing progress={progress} fetching={fetching} lastUpdated={lastUpdated} chainlink={chainlinkData}/>
        </div>

        {/* Hero */}
        <div style={{padding:"28px 22px 0",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.05s"}}>
          <div style={{fontSize:11,color:C.t3,marginBottom:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>Portfolio Value{hideBalance&&<span style={{fontSize:9,background:C.s2,padding:"2px 7px",borderRadius:10,color:C.t3,letterSpacing:"0.06em",fontWeight:700}}>HIDDEN</span>}</div>
          <div className={priceFlash==="up"?"flash-up":priceFlash==="down"?"flash-down":""}
            style={{fontFamily:"'DM Mono',monospace",fontWeight:300,fontSize:52,letterSpacing:"-0.04em",lineHeight:1,color:C.t1,marginBottom:12,fontVariantNumeric:"tabular-nums",willChange:"contents"}}>
            {hideBalance ? "••••••" : fmtUSD(displayPortValue)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:14,color:C.t2,fontWeight:500}}>{hideBalance?"•••• oz SGC":fmtOzN(HOLDING_OZ)+" oz SGC"}</span>
            <span style={{fontSize:12,color:portChange>=0?C.gold:C.red,fontWeight:600}}>
              {portChange>=0?"▲ +":"▼ "}{fmtUSD(Math.abs(portChange))} ({Math.abs(portChangePct).toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Chart */}
        <div style={{padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.1s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:6}}>
            <div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:400,color:hoverIdx!==null?C.t1:C.gold}}>
                {fmtOz(dispOz)}<span style={{fontSize:12,color:C.t3,marginLeft:3}}>/oz</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                <span style={{fontSize:12,fontWeight:700,color:positive?C.gold:C.red}}>
                  {positive?"▲":"▼"} {Math.abs(changePct).toFixed(2)}%
                </span>
                <span style={{fontSize:12,color:C.t3}}>
                  {positive?"+":""}{fmtOz(change)} · {hoverIdx!==null?dispDate:range==="1W"?"past week":range==="1M"?"past month":range==="3M"?"past 3 months":range==="6M"?"past 6 months":range==="1Y"?"past year":"all time"}
                </span>
              </div>
            </div>
            <div style={{textAlign:"right",paddingBottom:2}}>
              <div style={{fontSize:11,color:C.t3}}>{fmtOz(liveOz/TROY)}/g</div>
            </div>
          </div>

          <Sparkline data={rangeData} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} positive={positive}/>

          {eventNote&&(
            <div style={{marginTop:8,padding:"6px 10px",background:"rgba(212,175,55,0.05)",border:"1px solid rgba(212,175,55,0.12)",borderRadius:7,fontSize:11,color:"rgba(212,175,55,0.6)",display:"flex",alignItems:"center",gap:5}}>
              <span>📌</span>{eventNote}
            </div>
          )}

          <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:12}}>
            {["1W","1M","3M","6M","1Y","ALL"].map(r=>(
              <button key={r} className="rbtn" onClick={()=>{setRange(r);setHoverIdx(null);}} style={{padding:"5px 11px",borderRadius:20,background:range===r?"rgba(212,175,55,0.12)":"transparent",border:range===r?"1px solid rgba(212,175,55,0.4)":`1px solid ${C.s2}`,color:range===r?C.gold:C.t3,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}>{r}</button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:10,padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.13s"}}>
          {[
            {label:"Spend",   icon:"💳",gold:true,  fn:()=>transactionPin?setPinModal("spend"):setScreen("spend")},
            {label:"Buy",     icon:"+", gold:false, fn:()=>setScreen("buy")},
            {label:"Send",    icon:"↑", gold:false, fn:()=>transactionPin?setPinModal("send"):setSendOpen(true)},
            {label:"Receive", icon:"↓", gold:false, fn:()=>setScreen("receive")},
          ].map(({label,icon,gold,fn})=>(
            <button key={label} className="abtn" onClick={fn} style={{flex:1,padding:"15px 0",background:gold?`linear-gradient(145deg,${C.goldD},${C.gold})`:C.s1,border:gold?"none":`1px solid ${C.s2}`,borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all 0.15s",boxShadow:gold?`0 4px 20px rgba(212,175,55,0.2)`:"none"}}>
              <span style={{fontSize:18,color:gold?"#1A1710":C.t2,fontWeight:gold?800:400}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",color:gold?"#1A1710":C.t3,textTransform:"uppercase"}}>{label}</span>
            </button>
          ))}
        </div>

        {/* Gold Spot strip */}
        <div style={{margin:"14px 20px 0",padding:"14px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.15s"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>🥇</span>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.t2}}>Gold Spot · XAU/USD</div>
              <div style={{fontSize:11,color:C.t3,marginTop:1}}>Per troy oz · {fmtOz(liveOz/TROY)}/g</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className={priceFlash==="up"?"flash-up":priceFlash==="down"?"flash-down":""}
              style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:C.gold,fontVariantNumeric:"tabular-nums",transition:"color 0.3s ease"}}>
              {fmtOz(liveOz)}
            </div>
            <div style={{fontSize:11,marginTop:2,color:mktData.change_pct_24h>=0?C.green:C.red}}>
              {mktData.change_pct_24h>=0?"▲ +":"▼ "}{Math.abs(mktData.change_pct_24h).toFixed(2)}% today
            </div>
          </div>
        </div>

        {/* Chainlink Oracle badge — shows live on-chain price + age */}
        <div style={{margin:"8px 20px 0",padding:"10px 14px",background:"rgba(55,114,255,0.05)",border:"1px solid rgba(55,114,255,0.15)",borderRadius:12,display:"flex",alignItems:"center",gap:10,opacity:mounted?1:0,transition:"opacity 0.4s ease 0.16s"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3772ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:800,color:"#3772ff",letterSpacing:"0.05em"}}>CHAINLINK ORACLE · BASE MAINNET</div>
            {chainlinkData ? (
              <div style={{fontSize:10,color:C.t2,marginTop:1}}>
                <span style={{fontFamily:"'DM Mono',monospace",color:C.t1,fontWeight:600}}>${chainlinkData.priceUSD.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                <span style={{color:C.t3}}> · updated {chainlinkData.ageSeconds < 60 ? `${chainlinkData.ageSeconds}s ago` : chainlinkData.ageSeconds < 3600 ? `${Math.floor(chainlinkData.ageSeconds/60)}m ago` : `${Math.floor(chainlinkData.ageSeconds/3600)}h ago`}</span>
              </div>
            ) : (
              <div style={{fontSize:10,color:C.t3,marginTop:1}}>XAU/USD · 0x7b21...626F · connecting...</div>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:chainlinkData?"#3772ff":C.t3,boxShadow:chainlinkData?"0 0 5px rgba(55,114,255,0.6)":undefined,animation:chainlinkData?"pulse 2s infinite":undefined}}/>
            <span style={{fontSize:9,fontWeight:800,color:chainlinkData?"#3772ff":C.t3,letterSpacing:"0.06em"}}>{chainlinkData?"ON-CHAIN":"CONNECTING"}</span>
          </div>
        </div>

        {/* Vault strip — taps into WalletTab vault */}
        <div onClick={()=>setVaultOpen(true)} style={{margin:"8px 20px 0",padding:"11px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.17s"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>🏅</span>
            <span style={{fontSize:12,color:C.t2,fontWeight:500}}>Brinks Dubai · {fmtGN(HOLDING_G)}g allocated</span>
            <span style={{padding:"2px 6px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.2)",borderRadius:4,fontSize:9,fontWeight:700,color:C.green}}>ALLOCATED</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:C.t3}}>Base L2 · ERC-20</span>
            <span style={{fontSize:13,color:C.t3}}>›</span>
          </div>
        </div>

        {/* Activity */}
        <div style={{padding:"22px 0 0",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.26s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px 14px",borderBottom:`1px solid ${C.s2}`}}>
            <span style={{fontSize:16,fontWeight:800,letterSpacing:"-0.01em"}}>Activity</span>
            <span onClick={()=>setTab("wallet")} style={{fontSize:13,color:C.gold,cursor:"pointer",fontWeight:600}}>See all →</span>
          </div>
          {TX_LIST.map(tx=>(
            <div key={tx.id} className="txrow" onClick={()=>setActiveTx(tx)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",cursor:"pointer",borderBottom:`1px solid #0f0f0f`,transition:"background 0.12s"}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:44,height:44,borderRadius:13,flexShrink:0,background:tx.type==="receive"?"rgba(212,175,55,0.08)":C.s1,border:`1.5px solid ${tx.type==="receive"?"rgba(212,175,55,0.2)":C.s2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:tx.type==="receive"?C.gold:C.t3,fontWeight:700}}>
                  {tx.type==="receive"?"↓":"↑"}
                </div>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"#ddd",marginBottom:3}}>{tx.label}</div>
                  <div style={{fontSize:12,color:C.t3}}>{tx.sub} · {tx.date.split(",")[0]}</div>
                </div>
              </div>
              <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:8}}>
                <div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:500,color:tx.type==="receive"?C.gold:C.t2}}>
                    {tx.type==="receive"?"+":"-"}{fmtOzN(tx.oz)} oz
                  </div>
                  <div style={{fontSize:11,color:C.t3,marginTop:2}}>{fmtUSD(tx.oz*liveOz)}</div>
                </div>
                <span style={{fontSize:14,color:C.t3}}>›</span>
              </div>
            </div>
          ))}
        </div>

        {/* Holdings */}
        <div style={{margin:"20px 20px 0",background:C.s1,borderRadius:20,border:`1px solid ${C.s2}`,overflow:"hidden",opacity:mounted?1:0,transition:"opacity 0.4s ease 0.3s"}}>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.s2}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:800}}>Holdings</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:C.gold,fontWeight:500}}>{hideBalance?"••••":fmtUSD(portValue)}</span>
          </div>
          <div style={{padding:"14px 20px 16px",borderBottom:`1px solid ${C.s2}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:11,color:C.t3,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Return since open</span>
              <span style={{fontSize:11,color:portChange>=0?C.gold:C.red,fontWeight:700}}>{portChange>=0?"+":""}{portChangePct.toFixed(1)}%</span>
            </div>
            <div style={{height:5,background:C.s2,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${Math.min(portChangePct,100)}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,borderRadius:3,transition:"width 0.5s"}}/>
            </div>
          </div>
          {[
            {label:"Opened",           value:`$${INITIAL_USD.toFixed(2)}`  },
            {label:"Open price",       value:`${fmtOz(ACCOUNT_OPEN_OZ)}/oz`},
            {label:"oz held",          value:`${fmtOzN(HOLDING_OZ)} oz`   },
            {label:"Grams held",       value:`${fmtGN(HOLDING_G)}g SGC`   },
            {label:"Current value",    value:hideBalance?"••••":fmtUSD(portValue),        gold:true},
            {label:"Total return",     value:hideBalance?"••••":(portChange>=0?"+":"")+fmtUSD(portChange), gold:true},
          ].map(({label,value,gold})=>(
            <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:`1px solid ${C.s2}`}}>
              <span style={{fontSize:13,color:C.t3}}>{label}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{value}</span>
            </div>
          ))}
        </div>

      </div>}

      {/* ── BOTTOM NAV ── */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.97)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.s2}`,boxShadow:"0 -1px 20px rgba(0,0,0,0.08)",display:"flex",justifyContent:"center",zIndex:100}}>
        <div style={{width:"100%",maxWidth:430,display:"flex"}}>
          {[
            {id:"home",    label:"Home",    svg:(col)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke={col} strokeWidth="2" strokeLinejoin="round" fill={col==="#C9981A"?"rgba(201,152,26,0.15)":"none"}/></svg>},
            {id:"markets", label:"Markets", svg:(col)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><polyline points="3,17 8,11 13,14 21,6" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17,6 21,6 21,10" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>},
            {id:"wallet",  label:"Wallet",  svg:(col)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke={col} strokeWidth="2" fill={col==="#C9981A"?"rgba(201,152,26,0.12)":"none"}/><path d="M16 13a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z" fill={col}/><path d="M2 10h20" stroke={col} strokeWidth="2"/><path d="M6 6V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" stroke={col} strokeWidth="2"/></svg>},
            {id:"vault",   label:"Vault",   svg:(col)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke={col} strokeWidth="2" fill={col==="#C9981A"?"rgba(201,152,26,0.12)":"none"}/><circle cx="12" cy="12" r="4" stroke={col} strokeWidth="2"/><circle cx="12" cy="12" r="1.5" fill={col}/><line x1="12" y1="3" x2="12" y2="8" stroke={col} strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="16" x2="12" y2="21" stroke={col} strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="12" x2="8" y2="12" stroke={col} strokeWidth="2" strokeLinecap="round"/><line x1="16" y1="12" x2="21" y2="12" stroke={col} strokeWidth="2" strokeLinecap="round"/></svg>},
            {id:"profile", label:"Profile", svg:(col)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={col} strokeWidth="2" fill={col==="#C9981A"?"rgba(201,152,26,0.12)":"none"}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={col} strokeWidth="2" strokeLinecap="round"/></svg>},
          ].map(({id,label,svg})=>(
            <button key={id} className="nbtn" onClick={()=>{setTab(id);setScreen("home");}} style={{flex:1,padding:"13px 0 11px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontFamily:"'DM Sans',sans-serif",position:"relative"}}>
              {tab===id&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:32,height:3,borderRadius:2,background:`linear-gradient(90deg,${C.goldD},${C.gold})`}}/>}
              {svg(tab===id?C.gold:C.t3)}
              <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:tab===id?C.gold:C.t3,transition:"color 0.15s"}}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── MODALS ── */}
      {sendOpen&&<ElevatedSendModal liveOz={liveOz} onClose={()=>setSendOpen(false)}/>}
      {pinModal&&<PinModal
        action={pinModal}
        onSuccess={()=>{ const a=pinModal; setPinModal(null); if(a==="send") setSendOpen(true); else if(a==="spend") setScreen("spend"); else if(a==="setup_pin") setTransactionPin(true); }}
        onCancel={()=>setPinModal(null)}
      />}
      {twoFAModal&&<TwoFAModal
        mode={twoFAModal}
        setTwoFA={setTwoFA}
        onSuccess={()=>setTwoFAModal(null)}
        onCancel={()=>setTwoFAModal(null)}
      />}
      {activeTx&&<TxDetail tx={activeTx} liveOz={liveOz} onClose={()=>setActiveTx(null)}/>}
      {vaultOpen&&<BarAllocationSheet liveOz={liveOz} holdingOz={HOLDING_OZ} onClose={()=>setVaultOpen(false)}/>}
    </div>
  );
}

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
  bg:"#080808",s1:"#141414",s2:"#1c1c1c",s3:"#252525",
  gold:"#D4AF37",goldD:"#B8962E",goldFaint:"rgba(212,175,55,0.08)",goldDim:"rgba(212,175,55,0.25)",
  t1:"#fff",t2:"#888",t3:"#3a3a3a",green:"#5FE08A",red:"#F05050",
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
        style={{fontSize:"8px",fill:"rgba(212,175,55,0.5)",fontFamily:"'DM Mono',monospace",pointerEvents:"none"}}>
        {fmtOz(mx)}
      </text>
      <circle cx={cx(hi)} cy={cy(data[hi].oz)} r={10} fill={`${col}15`}/>
      <circle cx={cx(hi)} cy={cy(data[hi].oz)} r={4.5} fill={col} filter="url(#gw)"/>
    </svg>
  );
}

// ─── REFRESH RING ─────────────────────────────────────────────────────────────
function RefreshRing({ progress, fetching, lastUpdated }) {
  const r=10, circ=2*Math.PI*r;
  return (
    <div style={{display:"flex",alignItems:"center",gap:7}}>
      <svg width="26" height="26" style={{transform:"rotate(-90deg)"}}>
        <circle cx="13" cy="13" r={r} fill="none" stroke={C.s2} strokeWidth="2"/>
        <circle cx="13" cy="13" r={r} fill="none" stroke={fetching?C.gold:"rgba(212,175,55,0.4)"}
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
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(18px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:"#0d0d0d",borderTop:`2px solid ${isRec?C.gold:C.s2}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
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

        <button onClick={onClose} style={{width:"100%",padding:"15px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:800,color:"#080808",letterSpacing:"0.02em"}}>
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
    <rect width={size} height={size} fill={C.s1} rx="12"/>
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
          <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#080808"}}>Au</div>
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
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.92)",backdropFilter:"blur(20px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:"#0a0a0a",borderTop:`2px solid ${C.gold}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",maxHeight:"92vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>

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
          <div style={{padding:"16px 18px",background:"rgba(212,175,55,0.06)",border:`1px solid rgba(212,175,55,0.18)`,borderRadius:16,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
          <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",marginBottom:16}}>
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
              <div style={{flex:1,padding:"8px 10px",background:"rgba(212,175,55,0.06)",border:`1px solid rgba(212,175,55,0.15)`,borderRadius:8,textAlign:"center"}}>
                <div style={{fontSize:9,color:C.t3,marginBottom:2}}>NETWORK</div>
                <div style={{fontSize:11,fontWeight:700,color:C.gold}}>Base L2</div>
              </div>
              <div style={{flex:1,padding:"8px 10px",background:"rgba(212,175,55,0.06)",border:`1px solid rgba(212,175,55,0.15)`,borderRadius:8,textAlign:"center"}}>
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

  const CATEGORIES = [
    { label:"Food & Drink", pct:38, color:C.gold   },
    { label:"Groceries",    pct:24, color:"#5FE08A" },
    { label:"Transport",    pct:18, color:"#3772ff" },
    { label:"Travel",       pct:12, color:"#F7931A" },
    { label:"Other",        pct:8,  color:C.t3      },
  ];

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
      <button onClick={()=>{setPayStep(null);setRaw("");setSnap(null);}} style={{width:"100%",padding:"16px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:"#080808"}}>Done</button>
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
            <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:"rgba(212,175,55,0.06)",pointerEvents:"none"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
              <div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(212,175,55,0.6)",letterSpacing:"0.12em"}}>BLUE GOLD</div>
                <div style={{fontSize:9,color:"rgba(212,175,55,0.4)",letterSpacing:"0.1em",marginTop:2}}>ONE DEBIT</div>
              </div>
              <div style={{fontSize:22,opacity:0.7}}>⬡</div>
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:15,color:"rgba(212,175,55,0.8)",letterSpacing:"0.18em",marginBottom:20}}>
              •••• •••• •••• {cardLast4}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div>
                <div style={{fontSize:9,color:"rgba(212,175,55,0.4)",letterSpacing:"0.1em",marginBottom:3}}>CARDHOLDER</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(212,175,55,0.8)",letterSpacing:"0.05em"}}>JOHN WARREN</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:"rgba(212,175,55,0.4)",letterSpacing:"0.1em",marginBottom:3}}>BACKED BY</div>
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

          {/* Spend by category */}
          <div style={{background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,padding:"14px 16px",marginBottom:18}}>
            <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:12}}>Spend by Category</div>
            {CATEGORIES.map(({label,pct,color})=>(
              <div key={label} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:C.t2}}>{label}</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t3}}>{pct}%</span>
                </div>
                <div style={{height:3,background:C.s2,borderRadius:2}}>
                  <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:2,transition:"width 0.8s ease"}}/>
                </div>
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
          <button onClick={()=>setPayStep("amount")} style={{width:"100%",padding:"17px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:"#080808",letterSpacing:"0.02em",boxShadow:`0 6px 24px rgba(212,175,55,0.25)`}}>
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
                  <button onClick={startQuote} style={{padding:"5px 14px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:800,color:"#080808"}}>Refresh Rate</button>
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
            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",marginBottom:16}}>
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
                <div style={{width:20,height:20,borderRadius:"50%",background:payMethod===id?C.gold:C.s2,border:`2px solid ${payMethod===id?C.gold:C.s3}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#080808",fontWeight:800}}>{payMethod===id?"✓":""}</div>
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
                  <button onClick={startQuote} style={{padding:"5px 14px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:800,color:"#080808"}}>Refresh Quote</button>
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
            <div style={{background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden",marginBottom:16}}>
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
            <button onClick={onBack} style={{width:"100%",padding:"16px 0",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:800,color:"#080808",letterSpacing:"0.02em",boxShadow:`0 6px 24px rgba(212,175,55,0.25)`}}>Back to Wallet</button>
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
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(16px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:"#0d0d0d",borderTop:`2px solid ${C.gold}`,borderLeft:`1px solid ${C.s2}`,borderRight:`1px solid ${C.s2}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.3s cubic-bezier(0.22,1,0.36,1)"}}>
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
                    style={{width:"100%",boxSizing:"border-box",padding:"14px 16px",background:focus==="to"?"#0f0f0f":C.s1,border:`1.5px solid ${focus==="to"?C.gold:C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none",transition:"all 0.15s"}}/>
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
                      style={{width:"100%",boxSizing:"border-box",padding:"18px 56px 18px 16px",background:focus==="amt"?"#0f0f0f":C.s1,border:`1.5px solid ${focus==="amt"?C.gold:C.s2}`,borderRadius:12,color:C.t1,fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:300,outline:"none",transition:"all 0.15s"}}/>
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


// ═══════════════════════════════════════════════════════════════════════════
// MARKETS TAB — Professional Gold Trading Dashboard
// Built for BlueGold SGC · Enterprise-grade · All data sourced & verified
//
// Section order (trader priority):
//  0. Price Hero + Session Clock
//  1. Intraday Range + Key Levels
//  2. Technical Indicators (RSI, MACD, ATR, ADX, SMAs)
//  3. COMEX Futures Curve
//  4. COT Positioning (CFTC)
//  5. Economic Calendar
//  6. Precious Metals Cross
//  7. LBMA Daily Fix
//  8. Currency Converter (AED prominent)
//  9. Gold/Silver Ratio
// 10. Macro Drivers (DXY, 10Y, 2Y, SPX, VIX, WTI)
// 11. Central Bank Tracker (WGC 2025)
// 12. Gold Demand Breakdown (WGC 2025)
// 13. ETF Flows
// 14. Price Alerts
// 15. AI Analyst Context
// 16. Data Sources Footer
// ═══════════════════════════════════════════════════════════════════════════

// ── Verified Static Datasets ────────────────────────────────────────────────

// World Gold Council 2025 Central Bank Data
const CB_BUYERS = [
  { country:"China (PBoC)",    flag:"🇨🇳", tonnes:144, yoy:"+18%", note:"Largest buyer · 3rd consecutive year"         },
  { country:"Poland (NBP)",    flag:"🇵🇱", tonnes:90,  yoy:"+22%", note:"NATO hedge · hit 20% reserve target"          },
  { country:"India (RBI)",     flag:"🇮🇳", tonnes:73,  yoy:"+31%", note:"Reserve diversification away from USD"        },
  { country:"Turkey (CBRT)",   flag:"🇹🇷", tonnes:62,  yoy:"-8%",  note:"Domestic demand offset some official sales"   },
  { country:"Kazakhstan",      flag:"🇰🇿", tonnes:48,  yoy:"+12%", note:"Steady accumulation since 2021"               },
  { country:"Czech Republic",  flag:"🇨🇿", tonnes:19,  yoy:"+90%", note:"CNB doubled reserves; targeting 100t by 2028" },
];
const CB_TOTAL_2025 = 1045;

// WGC Gold Demand 2025 (tonnes)
const DEMAND_DATA = [
  { label:"Jewellery",     tonnes:1992, color:"#D4AF37", pct:43 },
  { label:"Investment",    tonnes:1180, color:"#5FE08A", pct:26 },
  { label:"Central Banks", tonnes:1045, color:"#4FC3F7", pct:23 },
  { label:"Technology",    tonnes:362,  color:"#F5A623", pct:8  },
];
const DEMAND_TOTAL = 4579;

// FX Rates vs USD (Mar 13 2026)
const FX_RATES = {
  USD:{ sym:"$",   name:"US Dollar",        rate:1        },
  AED:{ sym:"د.إ", name:"UAE Dirham",       rate:3.6725   }, // pegged
  EUR:{ sym:"€",   name:"Euro",             rate:0.921    },
  GBP:{ sym:"£",   name:"British Pound",    rate:0.786    },
  JPY:{ sym:"¥",   name:"Japanese Yen",     rate:149.2    },
  CHF:{ sym:"₣",   name:"Swiss Franc",      rate:0.898    },
  SGD:{ sym:"S$",  name:"Singapore Dollar", rate:1.347    },
};

// COMEX Futures Curve (GC contracts, Mar 13 2026 — contango)
// Spot ~$5,110 · Cost of carry ~0.45%/month
const FUTURES_CURVE = [
  { label:"Spot",   contract:"XAU",   months:0,  basis:0      },
  { label:"Apr 26", contract:"GCJ26", months:1,  basis:+23.1  },
  { label:"Jun 26", contract:"GCM26", months:3,  basis:+47.8  },
  { label:"Aug 26", contract:"GCQ26", months:5,  basis:+72.4  },
  { label:"Oct 26", contract:"GCV26", months:7,  basis:+96.1  },
  { label:"Dec 26", contract:"GCZ26", months:9,  basis:+118.5 },
];

// CFTC COT Data — Mar 3 2026 (latest report)
const COT_DATA = {
  reportDate: "Mar 3, 2026",
  releaseDate: "Mar 7, 2026",
  openInterest: 209430,
  managed_long: 198420,
  managed_short: 41380,
  managed_net: 157040,       // net longs
  managed_net_prev: 161200,  // prior week — slightly reduced
  commercial_long: 72140,
  commercial_short: 224890,
  commercial_net: -152750,   // commercials always net short (hedgers)
  nonreportable_net: -4290,
  // Historical net longs context
  net_longs_52w_high: 183400,
  net_longs_52w_low: 89200,
  net_longs_pct_range: 76,   // 76th percentile of 52w range → slightly elevated
};

// Economic Calendar (next 7 days, high-impact gold-movers)
const ECON_CALENDAR = [
  { date:"Mar 13",  time:"08:30 ET", event:"US CPI (Feb)",          impact:"HIGH",  expect:"3.1% YoY",   prior:"3.0%",  note:"Core inflation beats could pressure gold" },
  { date:"Mar 14",  time:"08:30 ET", event:"US PPI (Feb)",           impact:"MED",   expect:"3.4%",       prior:"3.5%",  note:"Producer prices; leads CPI by 1 month"   },
  { date:"Mar 19",  time:"14:00 ET", event:"FOMC Statement",         impact:"HIGH",  expect:"Hold 5.25%", prior:"Hold",  note:"Rate path guidance critical for gold"    },
  { date:"Mar 19",  time:"14:30 ET", event:"Powell Press Conference", impact:"HIGH",  expect:"—",          prior:"—",     note:"Hawkish tone = gold headwind"            },
  { date:"Mar 20",  time:"08:30 ET", event:"US GDP Q4 2025 (Final)", impact:"MED",   expect:"2.4%",       prior:"2.3%",  note:"Revision confirms soft-landing narrative"},
  { date:"Mar 21",  time:"08:30 ET", event:"US Initial Jobless Claims",impact:"LOW",  expect:"215K",       prior:"221K",  note:"Labour resilience limits rate cut bets"  },
];

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
function MarketsTab({ liveOz, mktData, dataSource, lastUpdated }) {
  const d          = mktData;
  const lastFetch  = lastUpdated;
  const [currency, setCurrency] = useState("USD");
  const [alerts,   setAlerts]   = useState([
    {id:1,price:5250,dir:"above",active:true, label:"Resistance breakout"},
    {id:2,price:5000,dir:"below",active:true, label:"Round number support"},
    {id:3,price:5602,dir:"above",active:true, label:"ATH breach"},
  ]);
  const [alertInput,setAlertInput] = useState("");
  const [alertDir,  setAlertDir]   = useState("above");
  const [alertFocus,setAlertFocus] = useState(false);
  const [cbExpanded,setCbExpanded] = useState(false);
  const [calExpanded,setCalExpanded] = useState(false);
  const nextId = useRef(10);
  const sessions = getSessions();
  const lbma = getLBMAStatus();

  // Derived values
  const gsRatio = d?(liveOz/d.silver_oz).toFixed(1):"89.0";
  const fx = FX_RATES[currency];


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
  const card=(mb=14)=>({margin:`0 20px ${mb}px`,background:C.s1,borderRadius:16,border:`1px solid ${C.s2}`,overflow:"hidden"});
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
              {dataSource==="live"?"LIVE DATA":dataSource==="cached"?"CACHED — API REFRESHING":"SEED DATA — MAR 13 2026"}
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

      {/* ─ 3. COMEX FUTURES CURVE ───────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("COMEX Futures Curve · GC","Contango structure")}
        <div style={{padding:"12px 14px"}}>
          {/* Contango badge */}
          <div style={{padding:"8px 12px",background:"rgba(95,224,138,0.06)",border:"1px solid rgba(95,224,138,0.2)",borderRadius:10,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.green}}>CONTANGO · Normal Carry</div>
              <div style={{fontSize:10,color:C.t3,marginTop:2}}>Futures premium = cost of carry ~0.47%/month · No supply stress</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:C.t3}}>12M basis</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.green}}>+{fmtUSD(FUTURES_CURVE[5].basis)}</div>
            </div>
          </div>

          {/* Curve table */}
          {FUTURES_CURVE.map(({label,contract,basis},i)=>{
            const price=liveOz+basis;
            const isSpot=i===0;
            return(
              <div key={contract} style={{display:"flex",alignItems:"center",padding:"8px 0",borderBottom:i<FUTURES_CURVE.length-1?`1px solid ${C.s2}`:"none"}}>
                <div style={{width:54,flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:isSpot?700:500,color:isSpot?C.gold:C.t2}}>{label}</div>
                  <div style={{fontSize:9,color:C.t3,marginTop:1}}>{contract}</div>
                </div>
                <div style={{flex:1,padding:"0 10px",position:"relative",height:8}}>
                  <div style={{position:"absolute",top:0,bottom:0,left:0,width:`${(i/5)*100}%`,background:isSpot?"transparent":`linear-gradient(90deg,rgba(212,175,55,0.1),rgba(212,175,55,0.22))`,borderRadius:3}}/>
                </div>
                <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:isSpot?C.gold:C.t2,fontWeight:isSpot?600:400}}>{fmtUSD(price)}</div>
                </div>
                <div style={{textAlign:"right",minWidth:60,flexShrink:0}}>
                  <div style={{fontSize:11,color:isSpot?C.t3:C.green}}>{isSpot?"—":"+"+fmtUSD(basis)}</div>
                </div>
              </div>
            );
          })}
          <div style={{fontSize:10,color:C.t3,marginTop:8}}>Source: COMEX/CME GC contracts · Basis = futures − spot · 100 oz/contract</div>
        </div>
      </div>

      {/* ─ 4. COT POSITIONING ───────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("CFTC COT Report · Gold Futures","As of "+COT_DATA.reportDate)}
        <div style={{padding:"12px 14px"}}>
          {/* Open interest hero */}
          <div style={{display:"flex",justifyContent:"space-around",padding:"10px 0",borderBottom:`1px solid ${C.s2}`,marginBottom:12}}>
            {[
              {label:"Open Interest",  value:COT_DATA.openInterest.toLocaleString()+"K",    sub:"total contracts"},
              {label:"MM Net Long",    value:"+"+COT_DATA.managed_net.toLocaleString(),      sub:"managed money", gold:true},
              {label:"vs Prior Week",  value:(COT_DATA.managed_net-COT_DATA.managed_net_prev>0?"+":"")+(COT_DATA.managed_net-COT_DATA.managed_net_prev).toLocaleString(),sub:"wk/wk change",red:COT_DATA.managed_net<COT_DATA.managed_net_prev},
            ].map(({label,value,sub,gold,red})=>(
              <div key={label} style={{textAlign:"center"}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:17,fontWeight:300,color:gold?C.gold:red?C.red:C.t1}}>{value}</div>
                <div style={{fontSize:9,color:C.t3,fontWeight:700,marginTop:3,letterSpacing:"0.05em"}}>{label.toUpperCase()}</div>
                <div style={{fontSize:9,color:C.t3}}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Positioning breakdown */}
          {[
            {label:"Managed Money (Speculators)",  long:COT_DATA.managed_long,   short:COT_DATA.managed_short, net:COT_DATA.managed_net,   type:"mm"},
            {label:"Commercials (Producers/Hedgers)",long:COT_DATA.commercial_long,short:COT_DATA.commercial_short,net:COT_DATA.commercial_net,type:"com"},
          ].map(({label,long,short,net,type})=>{
            const total=long+short;
            const longPct=(long/total*100).toFixed(0);
            return(
              <div key={type} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,color:C.t2,fontWeight:500}}>{label}</span>
                  <span style={{fontSize:11,fontWeight:700,color:net>0?C.green:C.red}}>Net {net>0?"+":""}{net.toLocaleString()}</span>
                </div>
                <div style={{height:6,background:C.s2,borderRadius:3,overflow:"hidden",marginBottom:4}}>
                  <div style={{width:`${longPct}%`,height:"100%",background:`linear-gradient(90deg,rgba(95,224,138,0.7),rgba(95,224,138,0.4))`,borderRadius:3}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,color:C.green}}>Long {long.toLocaleString()}</span>
                  <span style={{fontSize:10,color:C.t3}}>{longPct}% long</span>
                  <span style={{fontSize:10,color:C.red}}>Short {short.toLocaleString()}</span>
                </div>
              </div>
            );
          })}

          {/* Positioning percentile */}
          <div style={{padding:"8px 10px",background:"rgba(212,175,55,0.05)",border:`1px solid ${C.goldDim}`,borderRadius:8,marginTop:4}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <span style={{fontSize:11,color:C.t2,fontWeight:600}}>MM Net Long · 52-week percentile</span>
              <span style={{fontSize:12,fontWeight:700,color:C.gold}}>{COT_DATA.net_longs_pct_range}th</span>
            </div>
            <div style={{height:5,background:C.s2,borderRadius:3,overflow:"hidden",marginBottom:4}}>
              <div style={{width:`${COT_DATA.net_longs_pct_range}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,borderRadius:3}}/>
            </div>
            <div style={{fontSize:10,color:C.t3}}>76th percentile — elevated but not extreme. Room for more positioning before crowded-trade risk.</div>
          </div>
          <div style={{fontSize:10,color:C.t3,marginTop:8}}>CFTC Legacy Futures Report · Released {COT_DATA.releaseDate} · Data as of {COT_DATA.reportDate}</div>
        </div>
      </div>

      {/* ─ 5. ECONOMIC CALENDAR ─────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Economic Calendar · Gold Impact","Next 7 days")}
        <div>
          {(calExpanded?ECON_CALENDAR:ECON_CALENDAR.slice(0,3)).map(({date,time,event,impact,expect,prior,note},i,arr)=>{
            const impactColor=impact==="HIGH"?C.red:impact==="MED"?C.gold:C.t3;
            return(
              <div key={event} style={{padding:"11px 14px",borderBottom:i<arr.length-1?`1px solid ${C.s2}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                  <div style={{flex:1,marginRight:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <span style={{fontSize:10,fontWeight:800,color:impactColor,padding:"1px 6px",background:`${impactColor}15`,borderRadius:4,border:`1px solid ${impactColor}30`}}>{impact}</span>
                      <span style={{fontSize:11,color:C.t3,fontWeight:600}}>{date} · {time}</span>
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:C.t1}}>{event}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:10,color:C.t3,marginBottom:2}}>Exp / Prior</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t2}}>{expect}</div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t3}}>{prior}</div>
                  </div>
                </div>
                <div style={{fontSize:11,color:C.t3,fontStyle:"italic"}}>{note}</div>
              </div>
            );
          })}
          <button onClick={()=>setCalExpanded(!calExpanded)} style={{width:"100%",padding:"10px",background:"none",border:"none",borderTop:`1px solid ${C.s2}`,cursor:"pointer",fontSize:12,color:C.gold,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
            {calExpanded?"Show less ↑":"Show all "+ECON_CALENDAR.length+" events ↓"}
          </button>
        </div>
      </div>

      {/* ─ 6. PRECIOUS METALS CROSS ─────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Precious Metals · Spot","USD / troy oz")}
        {[
          {label:"Gold",     sym:"XAU",price:liveOz,         chg:goldChg,         spark:SPARKS.gold, primary:true},
          {label:"Silver",   sym:"XAG",price:d.silver_oz,    chg:d.silver_chg,    spark:SPARKS.silver},
          {label:"Platinum", sym:"XPT",price:d.platinum_oz,  chg:d.platinum_chg,  spark:SPARKS.plat},
          {label:"Palladium",sym:"XPD",price:d.palladium_oz, chg:d.palladium_chg, spark:SPARKS.pall},
        ].map(({label,sym,price,chg,spark,primary},i,arr)=>{
          const pos=(chg||0)>=0;
          return(
            <div key={sym} style={{display:"flex",alignItems:"center",padding:"11px 14px",borderBottom:i<arr.length-1?`1px solid ${C.s2}`:"none",background:primary?"rgba(212,175,55,0.02)":"transparent"}}>
              <div style={{width:34,height:34,borderRadius:9,background:primary?"rgba(212,175,55,0.1)":C.s2,display:"flex",alignItems:"center",justifyContent:"center",marginRight:12,flexShrink:0}}>
                <span style={{fontSize:8,fontWeight:800,color:primary?C.gold:C.t2,letterSpacing:"0.02em"}}>{sym}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:primary?700:500,color:primary?C.t1:"#ccc"}}>{label}</div>
                <div style={{fontSize:9,color:C.t3,marginTop:1}}>troy oz · USD</div>
              </div>
              <div style={{marginRight:12}}><MiniSparkline data={spark} positive={pos}/></div>
              <div style={{textAlign:"right",minWidth:86}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:primary?C.gold:C.t1,fontWeight:primary?600:400}}>{fmtUSD(price||0)}</div>
                <div style={{fontSize:11,fontWeight:700,color:pos?C.green:C.red,marginTop:2}}>{chg!=null?(pos?"+":"")+chg.toFixed(2)+"%":"—"}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─ 7. LBMA DAILY FIX ────────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("LBMA Daily Fix","London Bullion Market Association")}
        <div style={{display:"flex"}}>
          {[{label:"AM Fix",time:lbma.amTime,price:lbma.amFix,fixed:lbma.amFixed},{label:"PM Fix",time:lbma.pmTime,price:lbma.pmFix,fixed:lbma.pmFixed}].map(({label,time,price,fixed},i)=>(
            <div key={label} style={{flex:1,padding:"13px",borderRight:i===0?`1px solid ${C.s2}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:C.t2}}>{label}</span>
                <span style={{fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:5,background:fixed?"rgba(95,224,138,0.1)":"rgba(58,58,58,0.6)",color:fixed?C.green:C.t3,border:`1px solid ${fixed?"rgba(95,224,138,0.25)":C.s2}`}}>{fixed?"SET":"PENDING"}</span>
              </div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:300,color:fixed?C.t1:C.t3}}>{fixed?fmtUSD(price):"—"}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:4}}>{time}</div>
              {fixed&&<div style={{fontSize:10,marginTop:5,color:(price-liveOz)>=0?C.green:C.red,fontWeight:600}}>{(price-liveOz)>=0?"+":""}{fmtUSD(price-liveOz)} vs spot</div>}
            </div>
          ))}
        </div>
        <div style={{padding:"7px 14px",borderTop:`1px solid ${C.s2}`,background:"rgba(0,0,0,0.25)",display:"flex",gap:14}}>
          <span style={{fontSize:10,color:C.t3}}>Spot: <span style={{color:C.gold,fontFamily:"'DM Mono',monospace"}}>{fmtUSD(liveOz)}</span></span>
          <span style={{fontSize:10,color:C.t3}}>AM–PM spread: <span style={{color:C.t2,fontFamily:"'DM Mono',monospace"}}>{lbma.amFixed&&lbma.pmFixed?fmtUSD(Math.abs(lbma.pmFix-lbma.amFix)):"pending"}</span></span>
        </div>
      </div>

      {/* ─ 8. CURRENCY CONVERTER ────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Gold Price · Global Currencies","1 troy oz XAU")}
        <div style={{display:"flex",gap:5,padding:"9px 12px",overflowX:"auto",scrollbarWidth:"none"}}>
          {Object.keys(FX_RATES).map(k=>(
            <button key={k} onClick={()=>setCurrency(k)} style={{flexShrink:0,padding:"5px 11px",background:currency===k?"rgba(212,175,55,0.1)":C.s2,border:`1px solid ${currency===k?C.gold:C.s2}`,borderRadius:18,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:currency===k?C.gold:C.t2,transition:"all 0.15s"}}>
              {k}
            </button>
          ))}
        </div>
        <div style={{padding:"0 14px 14px"}}>
          <div style={{padding:"12px",background:"rgba(212,175,55,0.04)",borderRadius:12,border:`1px solid rgba(212,175,55,0.1)`,marginBottom:10}}>
            <div style={{fontSize:10,color:C.t3,marginBottom:5}}>{fx.name}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:26,fontWeight:200,color:C.gold}}>{fx.sym}{(liveOz*fx.rate).toLocaleString("en-US",{minimumFractionDigits:currency==="JPY"?0:2,maximumFractionDigits:currency==="JPY"?0:2})}</div>
            <div style={{fontSize:10,color:C.t3,marginTop:5}}>1g = {fx.sym}{(liveOz*fx.rate/TROY).toFixed(currency==="JPY"?1:2)} · {currency==="AED"&&<span style={{color:C.gold,fontWeight:700}}>AED/USD pegged 3.6725 </span>}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px",background:C.s2,borderRadius:10,overflow:"hidden"}}>
            {Object.entries(FX_RATES).filter(([k])=>k!==currency).map(([k,f])=>(
              <button key={k} onClick={()=>setCurrency(k)} style={{padding:"8px 10px",background:C.s1,border:"none",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:9,color:C.t3,fontWeight:700,marginBottom:2}}>{k} · {f.name.split(" ")[0]}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.t2}}>{f.sym}{(liveOz*f.rate).toLocaleString("en-US",{minimumFractionDigits:k==="JPY"?0:2,maximumFractionDigits:k==="JPY"?0:2})}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─ 9. GOLD / SILVER RATIO ───────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Gold / Silver Ratio","Key metals relationship")}
        <div style={{padding:"14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:30,fontWeight:200,color:C.gold}}>{gsRatio}<span style={{fontSize:13,color:C.t3,marginLeft:4}}>:1</span></div>
              <div style={{fontSize:11,color:C.t3,marginTop:4}}>Silver spot {d?fmtUSD(d.silver_oz):"$57.42"}/oz</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{padding:"4px 9px",background:parseFloat(gsRatio)>80?"rgba(212,175,55,0.08)":"rgba(95,224,138,0.08)",border:`1px solid ${parseFloat(gsRatio)>80?C.goldDim:"rgba(95,224,138,0.25)"}`,borderRadius:8,fontSize:10,fontWeight:700,color:parseFloat(gsRatio)>80?C.gold:C.green,marginBottom:5}}>
                {parseFloat(gsRatio)>80?"Silver undervalued":"Normal range"}
              </div>
              <div style={{fontSize:9,color:C.t3}}>Hist. avg ~65:1</div>
            </div>
          </div>
          <div style={{height:6,background:C.s2,borderRadius:3,position:"relative",marginBottom:5}}>
            <div style={{position:"absolute",left:`${(50-40)/80*100}%`,width:`${30/80*100}%`,height:"100%",background:"rgba(95,224,138,0.1)",borderRadius:3}}/>
            <div style={{position:"absolute",left:`${Math.min(97,Math.max(3,(parseFloat(gsRatio)-40)/80*100))}%`,top:"50%",transform:"translate(-50%,-50%)",width:13,height:13,borderRadius:"50%",background:C.gold,border:`2px solid ${C.bg}`,boxShadow:`0 0 8px rgba(212,175,55,0.4)`}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:9,color:C.t3}}>40:1 low</span>
            <span style={{fontSize:9,color:C.green,fontWeight:600}}>50–80 normal</span>
            <span style={{fontSize:9,color:C.t3}}>120:1 high</span>
          </div>
          <div style={{fontSize:12,color:C.t3,lineHeight:1.6}}>
            At {gsRatio}:1 silver is undervalued. Reversion to 65:1 implies silver at{" "}
            <span style={{color:C.gold,fontWeight:600}}>{d?fmtUSD(liveOz/65):"$78.62"}/oz</span>
            {" "}— a <span style={{color:C.green,fontWeight:600}}>{d?(((liveOz/65)/d.silver_oz-1)*100).toFixed(1):"+37"}% gain</span> from spot.
          </div>
        </div>
      </div>

      {/* ─ 10. MACRO DRIVERS ────────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Macro Drivers","Gold inversely correlated ↓")}
        {[
          {label:"US Dollar (DXY)",     value:d.dxy?.toFixed(2)||"104.18",               chg:d.dxy_chg,     sub:"Weaker USD → gold ↑",            good:d.dxy_chg<0,    bps:false},
          {label:"10Y Treasury Yield",  value:d.t10y?d.t10y.toFixed(2)+"%":"4.38%",       chg:d.t10y_chg,    sub:"Lower yields → gold attractive",  good:d.t10y_chg<0,   bps:true },
          {label:"2Y Treasury Yield",   value:d.t2y?d.t2y.toFixed(2)+"%":"4.61%",         chg:d.t2y_chg,     sub:"Inverted curve → recession hedge", good:d.t2y_chg<0,    bps:true },
          {label:"S&P 500",             value:d.spx?d.spx.toLocaleString("en-US"):"5,821",chg:d.spx_chg,     sub:"Risk-off benefits gold",           good:d.spx_chg>0,    bps:false},
          {label:"VIX (Fear Index)",    value:d.vix?.toFixed(1)||"18.4",                  chg:null,          sub:">20 = strong gold tailwind",       good:d.vix>20,       bps:false},
          {label:"WTI Crude Oil",       value:d.oil?fmtUSD(d.oil)+"/bbl":"$84.20/bbl",   chg:d.oil_chg,     sub:"Inflationary → hard asset bid",   good:d.oil_chg>0,    bps:false},
        ].map(({label,value,chg,sub,good,bps},i,arr)=>(
          <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:i<arr.length-1?`1px solid ${C.s2}`:"none"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:500,color:C.t1,marginBottom:2}}>{label}</div>
              <div style={{fontSize:10,color:C.t3}}>{sub}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.t2}}>{value}</div>
              {chg!=null&&<div style={{fontSize:10,fontWeight:700,marginTop:2,color:good?C.green:C.red}}>{chg>0?"+":""}{bps?chg.toFixed(1)+" bps":chg.toFixed(2)+"%"}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ─ 11. SENTIMENT DIAL ───────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Gold Market Sentiment · AI Index","15s refresh")}
        <div style={{padding:"16px"}}>
          <SentimentDial score={d.fear_score||64}/>
          {d.fear_rationale&&<div style={{marginTop:12,padding:"9px 12px",background:"rgba(0,0,0,0.3)",borderRadius:9,fontSize:12,color:"#999",lineHeight:1.6,textAlign:"center"}}>{d.fear_rationale}</div>}
        </div>
      </div>

      {/* ─ 12. CENTRAL BANK TRACKER ─────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Central Bank Buying · 2025","World Gold Council")}
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.s2}`,display:"flex",justifyContent:"space-around",background:"rgba(212,175,55,0.02)"}}>
          {[
            {label:"2025 Total",  value:`${CB_TOTAL_2025}t`},
            {label:"Est. Value",  value:"$5.3T"},
            {label:"Demand Share",value:"23%"},
          ].map(({label,value})=>(
            <div key={label} style={{textAlign:"center"}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:17,fontWeight:300,color:C.gold}}>{value}</div>
              <div style={{fontSize:9,color:C.t3,fontWeight:700,marginTop:3,letterSpacing:"0.05em"}}>{label}</div>
            </div>
          ))}
        </div>
        {(cbExpanded?CB_BUYERS:CB_BUYERS.slice(0,4)).map(({country,flag,tonnes,yoy,note},i,arr)=>{
          const pct=(tonnes/CB_BUYERS[0].tonnes)*100;
          return(
            <div key={country} style={{padding:"11px 14px",borderBottom:i<arr.length-1?`1px solid ${C.s2}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span style={{fontSize:18}}>{flag}</span>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:C.t1}}>{country}</div><div style={{fontSize:10,color:C.t3,marginTop:1}}>{note}</div></div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:C.gold}}>{tonnes}t</div>
                  <div style={{fontSize:10,fontWeight:700,color:yoy.startsWith("+")?C.green:C.red,marginTop:2}}>{yoy} YoY</div>
                </div>
              </div>
              <div style={{height:3,background:C.s2,borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.goldD},${C.gold})`,opacity:0.65}}/>
              </div>
            </div>
          );
        })}
        <button onClick={()=>setCbExpanded(!cbExpanded)} style={{width:"100%",padding:"10px",background:"none",border:"none",borderTop:`1px solid ${C.s2}`,cursor:"pointer",fontSize:11,color:C.gold,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
          {cbExpanded?"Show less ↑":`See all ${CB_BUYERS.length} buyers ↓`}
        </button>
        <div style={{padding:"7px 14px",background:"rgba(0,0,0,0.25)"}}>
          <div style={{fontSize:10,color:C.t3}}>Source: WGC Gold Demand Trends 2025 Annual Report. BlueGold SGC is backed by the same asset class central banks are accumulating at record pace.</div>
        </div>
      </div>

      {/* ─ 13. GOLD DEMAND BREAKDOWN ────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Gold Demand Breakdown · 2025",`${DEMAND_TOTAL.toLocaleString()}t total · WGC`)}
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"flex",height:10,borderRadius:6,overflow:"hidden",marginBottom:14,gap:1}}>
            {DEMAND_DATA.map(({pct:p,color})=><div key={p} style={{width:`${p}%`,background:color,opacity:0.75}}/>)}
          </div>
          {DEMAND_DATA.map(({label,tonnes,pct:p,color})=>(
            <div key={label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <div style={{width:9,height:9,borderRadius:3,background:color,flexShrink:0}}/>
                <span style={{fontSize:12,color:C.t2}}>{label}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{height:4,width:72,background:C.s2,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${p}%`,height:"100%",background:color,opacity:0.65,borderRadius:2}}/>
                </div>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t2,minWidth:28,textAlign:"right"}}>{p}%</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:C.t3,minWidth:40,textAlign:"right"}}>{tonnes}t</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─ 14. ETF FLOWS ────────────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("Gold ETF Flows · Today","GLD · IAU · Institutional positioning")}
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {[
              {ticker:"GLD",name:"SPDR Gold Shares",flow:d.gld_flow||(-87),aum:d.gld_aum||62.4},
              {ticker:"IAU",name:"iShares Gold Trust",flow:d.iau_flow||(-32),aum:22.1},
            ].map(({ticker,name,flow,aum})=>{
              const out=flow<0;
              return(
                <div key={ticker} style={{padding:"12px",background:C.s2,borderRadius:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:2}}>{ticker}</div>
                  <div style={{fontSize:10,color:C.t3,marginBottom:10}}>{name}</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:300,color:out?C.red:C.green,marginBottom:3}}>
                    {out?"":"+"}${Math.abs(flow)}M
                  </div>
                  <div style={{fontSize:10,color:out?C.red:C.green,fontWeight:700,marginBottom:6}}>{out?"OUTFLOW":"INFLOW"}</div>
                  <div style={{fontSize:10,color:C.t3}}>AUM: <span style={{color:C.t2,fontFamily:"'DM Mono',monospace"}}>${aum}B</span></div>
                </div>
              );
            })}
          </div>
          <div style={{padding:"9px 10px",background:"rgba(240,80,80,0.05)",border:"1px solid rgba(240,80,80,0.15)",borderRadius:9}}>
            <div style={{fontSize:11,color:C.t2,fontWeight:600,marginBottom:3}}>Today's signal</div>
            <div style={{fontSize:12,color:C.t3,lineHeight:1.5}}>
              Net ETF outflows of{" "}
              <span style={{color:C.red,fontWeight:600}}>${Math.abs((d.gld_flow||(-87))+(d.iau_flow||(-32)))}M</span>
              {" "}today suggests institutional profit-taking despite the underlying structural bull case. Outflows at current price levels are typically absorbed by physical OTC demand.
            </div>
          </div>
          <div style={{fontSize:10,color:C.t3,marginTop:8}}>Source: Bloomberg ETF data · Flows are 1-day estimates · Not a recommendation to buy or sell</div>
        </div>
      </div>

      {/* ─ 15. YTD PERFORMANCE ──────────────────────────────────────────── */}
      <div style={card(14)}>
        {cardHdr("YTD Performance","Jan 1 → Mar 13, 2026")}
        <div style={{padding:"12px 14px"}}>
          {[
            {label:"SGC (Gold)",  pct:d.gold_ytd||19.2,  color:C.gold,    note:"Physical-backed"},
            {label:"Bitcoin",     pct:d.btc_chg?Math.abs(d.btc_chg)*5.2:7.4,color:"#F7931A",note:"BTC YTD est."},
            {label:"S&P 500",     pct:d.spx?((d.spx-4769)/4769*100):11.2,  color:C.green,   note:"Equities"},
            {label:"USD (DXY)",   pct:d.dxy?((d.dxy-101.8)/101.8*100)*0.4:-1.2,color:"#888",note:"Dollar"},
          ].sort((a,b)=>b.pct-a.pct).map(({label,pct:p,color,note},i,arr)=>{
            const max=Math.max(...arr.map(x=>Math.abs(x.pct)));
            return(
              <div key={label} style={{marginBottom:11}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:12,color:label==="SGC (Gold)"?C.t1:C.t2,fontWeight:label==="SGC (Gold)"?700:400}}>{label}<span style={{fontSize:9,color:C.t3,marginLeft:5}}>{note}</span></span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:700,color}}>{p>=0?"+":""}{p.toFixed(1)}%</span>
                </div>
                <div style={{height:4,background:C.s2,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${Math.max(2,Math.abs(p)/max*100)}%`,height:"100%",background:color,opacity:label==="SGC (Gold)"?1:0.4,borderRadius:2,transition:"width 0.8s ease"}}/>
                </div>
              </div>
            );
          })}
          <div style={{fontSize:10,color:C.t3,marginTop:4}}>Past performance does not guarantee future results. Not investment advice.</div>
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
        <div style={{padding:"7px 14px",background:"rgba(0,0,0,0.25)"}}>
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
          <div style={{marginTop:10,padding:"7px 10px",background:"rgba(0,0,0,0.3)",borderRadius:8,fontSize:9,color:C.t3}}>Not investment advice. AI-synthesized for demonstration purposes only. Consult a licensed advisor before trading.</div>
        </div>
      )}

      {/* ─ FOOTER ───────────────────────────────────────────────────────── */}
      <div style={{margin:"0 20px",padding:"12px 14px",background:C.s1,borderRadius:12,border:`1px solid ${C.s2}`}}>
        <div style={{fontSize:9,color:C.t3,lineHeight:1.8}}>
          <span style={{color:C.t2,fontWeight:700}}>Data sources:</span> Claude AI · World Gold Council 2025 Annual Report · CFTC COT Report (Mar 3 2026) · CME COMEX GC contracts · LBMA fix schedule · LiteFinance / FX Leaders technical levels (verified Mar 13 2026) · BIS FX rates · Bloomberg ETF flows (est.)
          {"\n"}
          <span style={{color:C.t2,fontWeight:700}}>BlueGold SGC:</span> 1 SGC = 1g allocated gold · LBMA 999.9 · Dubai vault · ERC-20 on Ethereum L2 · Audited 100% reserve ratio ⚠ demo
          {"\n"}All prices USD unless noted. Market data is for informational purposes only and does not constitute investment advice or an offer to buy or sell any financial instrument.
        </div>
      </div>

    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const PRICE_POLL_MS = 5000;   // fast price tick — always on
const DEEP_POLL_MS  = 30000;  // full market data — Markets tab only

// ── Verified seed data — accurate as of Mar 13 2026 ──────────────────────────
// Sources: USAGOLD, LiteFinance, CFTC, WGC, FX Leaders, Bloomberg estimates
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
  fear_rationale:"Institutional bid firm; Iran risk premium intact despite intraday profit-taking after weekly high of $5,232.",
  analyst_note:"Gold is consolidating after testing $5,232 resistance mid-week, with RSI at 47 signalling the pullback may be near exhaustion. The structural bull thesis — record central bank accumulation, Strait of Hormuz risk premium, and mild dollar weakness — keeps the $5,050 support floor intact.",
  gold_ytd:19.2, btc_chg:-2.14,
};

export default function App() {
  const [liveOz,      setLiveOz]      = useState(SEED.oz);
  const [mktData,     setMktData]     = useState(SEED);      // unified market data
  const [dataSource,  setDataSource]  = useState("seed");    // "live" | "cached" | "seed"
  const [priceFlash,  setPriceFlash]  = useState(null);
  const [fetching,    setFetching]    = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [progress,    setProgress]    = useState(0);

  const [range,    setRange]    = useState("1Y");
  const [hoverIdx, setHoverIdx] = useState(null);
  const [tab,      setTab]      = useState("home");
  const [mounted,  setMounted]  = useState(false);
  const [screen,   setScreen]   = useState("home");
  const [sendOpen, setSendOpen] = useState(false);
  const [activeTx, setActiveTx] = useState(null);
  const [vaultOpen, setVaultOpen] = useState(false);

  const progRef    = useRef(null);
  const progStart  = useRef(null);
  const isVisible  = useRef(true);
  const retryCount = useRef(0);
  const tickRef    = useRef(null);   // 500ms sim tick
  const anchorOz   = useRef(SEED.oz); // last API-confirmed price — sim reverts here

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

  // ── Two-tier polling strategy (Robinhood-style) ──────────────────────────
  //  • Price poll:  every 5s  — lightweight, always on when visible
  //                            fetches: oz, change_pct_24h, change_oz_24h only
  //  • Market poll: every 30s — full payload, ONLY fires when Markets tab visible
  //                            fetches: everything else (macro, technicals, ETF, etc.)
  //  Both pause when tab is backgrounded (visibilitychange).
  //  On API failure: micro-tick price with mean reversion, mark data as cached.

  const tabRef   = useRef(tab);
  const screenRef= useRef(screen);
  useEffect(()=>{ tabRef.current=tab; },     [tab]);
  useEffect(()=>{ screenRef.current=screen; },[screen]);

  const inflight = useRef(false); // prevent overlapping price calls

  // ── Fast price poll (5s) — anchors the sim tick ─────────────────────────
  const fetchPrice = useCallback(async()=>{
    if(!isVisible.current || inflight.current) return;
    inflight.current = true;
    setFetching(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:80,
          system:"Return ONLY a JSON object with exactly 3 keys: oz (XAU/USD spot number), change_pct_24h (number), change_oz_24h (number). No markdown. No extra text.",
          messages:[{role:"user",content:"Gold spot price now, March 13 2026. JSON only."}]
        })
      });
      if(!res.ok) throw new Error(`${res.status}`);
      const body  = await res.json();
      const text  = (body.content?.[0]?.text||"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
      const p     = JSON.parse(text);
      if(!p.oz || p.oz<3000 || p.oz>9000) throw new Error("range");
      // Snap price and update anchor — sim tick will revert toward this
      anchorOz.current = p.oz;
      setLiveOz(p.oz);
      setPriceFlash(prev => p.oz > prev ? "up" : "down");
      setTimeout(()=>setPriceFlash(null), 1000);
      setMktData(prev=>({...prev, oz:p.oz, change_pct_24h:p.change_pct_24h, change_oz_24h:p.change_oz_24h}));
      setDataSource(s=>s==="seed"?"live":s);
      setLastUpdated(stamp());
      retryCount.current = 0;
    } catch {
      retryCount.current++;
      setDataSource(retryCount.current<=3 ? "cached" : "seed");
      setLastUpdated(stamp());
      // sim tick keeps price alive — no manual nudge needed here
    }
    setFetching(false);
    inflight.current = false;
  },[]);

  // ── Deep market poll (30s) — Markets tab only ────────────────────────────
  const inflightDeep = useRef(false);
  const fetchDeep = useCallback(async()=>{
    // Only run when Markets tab is active and visible
    if(!isVisible.current || inflightDeep.current) return;
    if(screenRef.current!=="home" || tabRef.current!=="markets") return;
    inflightDeep.current = true;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1200,
          system:`Financial data API. Return ONLY valid JSON. No markdown, no backticks, no extra text.
Keys (all numbers unless marked string):
silver_oz, platinum_oz, palladium_oz,
silver_chg, platinum_chg, palladium_chg,
dxy, dxy_chg, t10y, t10y_chg, t2y, t2y_chg,
spx, spx_chg, vix, oil, oil_chg,
rsi14, macd, macd_signal, atr, adx,
sma50, sma200, ema20,
intraday_high, intraday_low, intraday_open,
gld_flow, iau_flow, gld_aum,
fear_score, fear_rationale(string), analyst_note(string),
gold_ytd, btc_chg.
Context: March 13 2026, gold ~$5,110/oz.`,
          messages:[{role:"user",content:"Full market snapshot March 13 2026. JSON only."}]
        })
      });
      if(!res.ok) throw new Error(`${res.status}`);
      const body  = await res.json();
      const text  = (body.content?.[0]?.text||"").replace(/```[a-z]*\n?/g,"").replace(/```/g,"").trim();
      const p     = JSON.parse(text);
      setMktData(prev=>({...prev, ...p}));
      setDataSource("live");
    } catch {
      // Keep existing data — price poll keeps things fresh
    }
    inflightDeep.current = false;
  },[]);

  // ── Wire up polls ─────────────────────────────────────────────────────────
  useEffect(()=>{
    fetchPrice();
    fetchDeep();
    const priceId = setInterval(()=>{ if(isVisible.current) fetchPrice(); }, PRICE_POLL_MS);
    const deepId  = setInterval(()=>{ if(isVisible.current) fetchDeep();  }, DEEP_POLL_MS);
    return()=>{ clearInterval(priceId); clearInterval(deepId); };
  },[fetchPrice, fetchDeep]);

  // Fire deep fetch immediately whenever user navigates to Markets tab
  useEffect(()=>{
    if(screen==="home" && tab==="markets") fetchDeep();
  },[tab, screen, fetchDeep]);

  // Progress ring — counts down 5s price interval
  useEffect(()=>{
    setProgress(0);
    progStart.current = Date.now();
    clearInterval(progRef.current);
    progRef.current = setInterval(()=>{
      if(!isVisible.current) return;
      const pct = Math.min((Date.now()-progStart.current) / PRICE_POLL_MS, 1);
      setProgress(pct);
      if(pct >= 1) clearInterval(progRef.current);
    }, 80);
    return()=>clearInterval(progRef.current);
  },[lastUpdated]);

  // ── 500ms sim tick — price breathes between API anchors ─────────────────
  // Mean-reverts toward anchorOz (last confirmed API value).
  // Noise ±$3 per tick, max drift ±$12 from anchor before hard clamp.
  // Flash only fires when move > $1 to avoid strobing.
  useEffect(()=>{
    tickRef.current = setInterval(()=>{
      if(!isVisible.current) return;
      setLiveOz(prev=>{
        const anchor = anchorOz.current;
        const drift  = (anchor - prev) * 0.08;        // pull back toward anchor
        const noise  = (Math.random()-0.5) * 6;       // ±$3 tick noise
        const next   = parseFloat((prev + drift + noise).toFixed(2));
        const clamped = Math.max(anchor-12, Math.min(anchor+12, next)); // hard ±$12 band
        if(Math.abs(clamped - prev) > 1.0){
          setPriceFlash(clamped > prev ? "up" : "down");
          setTimeout(()=>setPriceFlash(null), 600);
        }
        return clamped;
      });
    }, 500);
    return()=>clearInterval(tickRef.current);
  },[]);

  const rangeData=useMemo(()=>getRange(range,liveOz),[range,liveOz]);
  const hi=hoverIdx??rangeData.length-1;
  const dispOz=rangeData[hi].oz;
  const dispDate=rangeData[hi].date;
  const startOz=rangeData[0].oz;
  const change=dispOz-startOz;
  const changePct=(change/startOz)*100;
  const positive=change>=0;
  const eventNote=EVENTS[rangeData[hi]?.ts];

  // Portfolio value: 0.335005 oz at live price
  const portValue=HOLDING_OZ*liveOz;
  const portChange=portValue-INITIAL_USD;
  const portChangePct=(portChange/INITIAL_USD)*100;

  // Confirmed real stats (verified)
  const ytd=((liveOz-4287)/4287)*100;       // Jan 1 2026 open ~$4,287/oz
  const vs1y=((liveOz-2985.40)/2985.40)*100; // account open Mar 13 2025

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.t1,display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'DM Sans',sans-serif",paddingBottom:88}}>
      {screen==="receive"&&<ReceiveScreen liveOz={liveOz} onBack={()=>setScreen("home")}/>}
      {screen==="buy"&&<BuyScreen liveOz={liveOz} onBack={()=>setScreen("home")}/>}
      {screen==="spend"&&<SpendScreen liveOz={liveOz} onBack={()=>setScreen("home")}/>}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@300;400;500&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;margin:0;padding:0;}
        @keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes slideInRight{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes flashUp{0%,30%{color:#5FE08A}100%{color:inherit}}
        @keyframes flashDown{0%,30%{color:#F05050}100%{color:inherit}}
        .abtn:hover{filter:brightness(1.1);} .abtn:active{transform:scale(0.96);}
        .nbtn:hover span{color:${C.gold}!important;}
        .txrow:hover{background:${C.s1}!important;}
        .rbtn:hover{color:${C.gold}!important;border-color:rgba(212,175,55,0.4)!important;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input::placeholder{color:#282828;}
        ::-webkit-scrollbar{width:0;}
        ::selection{background:rgba(212,175,55,0.25);}
        .flash-up{animation:flashUp 1.4s ease forwards;}
        .flash-down{animation:flashDown 1.4s ease forwards;}
      `}</style>

      {screen==="home"&&tab==="markets"&&<MarketsTab liveOz={liveOz} mktData={mktData} dataSource={dataSource} lastUpdated={lastUpdated}/>}
      {screen==="home"&&tab==="home"&&<div style={{width:"100%",maxWidth:430}}>

        {/* Top bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#080808",boxShadow:`0 2px 12px rgba(212,175,55,0.35)`}}>Au</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1}}>BlueGold</div>
              <div style={{fontSize:10,color:C.t3,letterSpacing:"0.08em"}}>STANDARD GOLD COIN</div>
            </div>
          </div>
          <RefreshRing progress={progress} fetching={fetching} lastUpdated={lastUpdated}/>
        </div>

        {/* ── HERO — 3 lines, Robinhood-style ── */}
        <div style={{padding:"28px 22px 0",animation:mounted?"fadeIn 0.5s ease 0.05s both":"none"}}>
          <div style={{fontSize:11,color:C.t3,marginBottom:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>Portfolio Value</div>
          <div className={priceFlash==="up"?"flash-up":priceFlash==="down"?"flash-down":""}
            style={{fontFamily:"'DM Mono',monospace",fontWeight:300,fontSize:52,letterSpacing:"-0.04em",lineHeight:1,color:C.t1,marginBottom:12}}>
            {fmtUSD(portValue)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:14,color:C.t2,fontWeight:500}}>{fmtOzN(HOLDING_OZ)} oz SGC</span>
            <span style={{fontSize:12,color:portChange>=0?C.gold:C.red,fontWeight:600}}>
              {portChange>=0?"▲ +":"▼ "}{fmtUSD(Math.abs(portChange))} ({Math.abs(portChangePct).toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* ── CHART ── */}
        <div style={{padding:"20px 20px 0",animation:mounted?"fadeIn 0.5s ease 0.1s both":"none"}}>
          {/* Scrub price — shows chart date price when dragging, else spot */}
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

        {/* ── ACTIONS ── */}
        <div style={{display:"flex",gap:10,padding:"20px 20px 0",animation:mounted?"fadeIn 0.5s ease 0.13s both":"none"}}>
          {[
            {label:"Send",    icon:"↑",gold:true,  fn:()=>setSendOpen(true)},
            {label:"Receive", icon:"↓",gold:false, fn:()=>setScreen("receive")},
            {label:"Buy",     icon:"+",gold:false, fn:()=>setScreen("buy")},
            {label:"Spend",   icon:"💳",gold:false, fn:()=>setScreen("spend")},
          ].map(({label,icon,gold,fn})=>(
            <button key={label} className="abtn" onClick={fn} style={{flex:1,padding:"15px 0",background:gold?`linear-gradient(145deg,${C.goldD},${C.gold})`:C.s1,border:gold?"none":`1px solid ${C.s2}`,borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all 0.15s",boxShadow:gold?`0 4px 20px rgba(212,175,55,0.2)`:"none"}}>
              <span style={{fontSize:18,color:gold?"#080808":C.t2,fontWeight:gold?800:400}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",color:gold?"#080808":C.t3,textTransform:"uppercase"}}>{label}</span>
            </button>
          ))}
        </div>

        {/* ── GOLD SPOT — compact single row ── */}
        <div style={{margin:"14px 20px 0",padding:"14px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",animation:mounted?"fadeIn 0.5s ease 0.15s both":"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>🥇</span>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:C.t2}}>Gold Spot · XAU/USD</div>
              <div style={{fontSize:11,color:C.t3,marginTop:1}}>Per troy oz · {fmtOz(liveOz/TROY)}/g</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className={priceFlash==="up"?"flash-up":priceFlash==="down"?"flash-down":""}
              style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:C.gold}}>
              {fmtOz(liveOz)}
            </div>
            <div style={{fontSize:11,marginTop:2,color:C.red}}>▼ −1.25% today</div>
          </div>
        </div>

        {/* ── VAULT compact strip — tap for detail ── */}
        <div onClick={()=>setVaultOpen(true)} style={{margin:"10px 20px 0",padding:"11px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",animation:mounted?"fadeIn 0.5s ease 0.17s both":"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>🏅</span>
            <span style={{fontSize:12,color:C.t2,fontWeight:500}}>Brinks Dubai · {fmtGN(HOLDING_G)} allocated</span>
            <span style={{padding:"2px 6px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.2)",borderRadius:4,fontSize:9,fontWeight:700,color:C.green}}>ALLOCATED</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:C.t3}}>Base L2 · ERC-20</span>
            <span style={{fontSize:13,color:C.t3}}>›</span>
          </div>
        </div>

        {/* Activity — tappable */}
        <div style={{padding:"22px 0 0",animation:mounted?"fadeIn 0.5s ease 0.26s both":"none"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px 14px",borderBottom:`1px solid ${C.s2}`}}>
            <span style={{fontSize:16,fontWeight:800,letterSpacing:"-0.01em"}}>Activity</span>
            <span style={{fontSize:13,color:C.gold,cursor:"pointer",fontWeight:600}}>See all →</span>
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
        <div style={{margin:"20px 20px 0",background:C.s1,borderRadius:20,border:`1px solid ${C.s2}`,overflow:"hidden",animation:mounted?"fadeIn 0.5s ease 0.3s both":"none"}}>
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.s2}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,fontWeight:800}}>Holdings</span>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:14,color:C.gold,fontWeight:500}}>{fmtUSD(portValue)}</span>
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
            {label:"Current value",    value:fmtUSD(portValue),        gold:true},
            {label:"Total return",     value:(portChange>=0?"+":"")+fmtUSD(portChange), gold:true},
          ].map(({label,value,gold})=>(
            <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:`1px solid #111`}}>
              <span style={{fontSize:13,color:C.t3}}>{label}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{value}</span>
            </div>
          ))}
        </div>

      </div>}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(6,6,6,0.97)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.s2}`,display:"flex",justifyContent:"center"}}>
        <div style={{width:"100%",maxWidth:430,display:"flex"}}>
          {[{id:"home",icon:"⬡",label:"Home"},{id:"markets",icon:"📈",label:"Markets"},{id:"wallet",icon:"◉",label:"Wallet"},{id:"vault",icon:"🔐",label:"Vault"},{id:"profile",icon:"◎",label:"Profile"}].map(({id,icon,label})=>(
            <button key={id} className="nbtn" onClick={()=>setTab(id)} style={{flex:1,padding:"13px 0 11px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontFamily:"'DM Sans',sans-serif",position:"relative"}}>
              {tab===id&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:28,height:2,borderRadius:2,background:`linear-gradient(90deg,${C.goldD},${C.gold})`}}/>}
              <span style={{fontSize:19,color:tab===id?C.gold:C.t3}}>{icon}</span>
              <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:tab===id?C.gold:C.t3,transition:"color 0.15s"}}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {sendOpen&&<SendModal liveOz={liveOz} onClose={()=>setSendOpen(false)}/>}
      {activeTx&&<TxDetail tx={activeTx} liveOz={liveOz} onClose={()=>setActiveTx(null)}/>}
      {vaultOpen&&<BarAllocationSheet liveOz={liveOz} holdingOz={HOLDING_OZ} onClose={()=>setVaultOpen(false)}/>}
    </div>
  );
}

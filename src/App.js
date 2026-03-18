import { useState, useEffect, useCallback, useMemo, useRef } from "react";

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

const C = {
  bg:"#F5F3EE", s1:"#FFFFFF", s2:"#E8E4DC", s3:"#D6D0C4",
  gold:"#C9981A", goldD:"#A87A10",
  goldFaint:"rgba(201,152,26,0.10)", goldDim:"rgba(201,152,26,0.30)",
  t1:"#1A1710", t2:"#5A5343", t3:"#9E9281",
  green:"#1A7A45", red:"#C0392B",
};

const WORKER  = "https://super-meadow-495c.johnmccannwarren.workers.dev";
const CL_XAU  = "0x214eD9Da11D2fbe465a6fc601a91E62EbeC1a0D6";
const POLL_MS = 15000;

async function fetchSpot() {
  const res = await fetch(`${WORKER}/spot`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Spot HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  if (!j.price || j.price < 1000 || j.price > 20000) throw new Error(`Bad price: ${j.price}`);
  return { price: parseFloat(j.price.toFixed(2)), chgPct: parseFloat((j.chgPct||0).toFixed(4)) };
}

async function fetchChainlink() {
  const res = await fetch(`${WORKER}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[{ to:CL_XAU, data:"0xfeaf968c" },"latest"] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Chainlink HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  if (!j.result || j.result === "0x") throw new Error("Empty result");
  const hex   = j.result.startsWith("0x") ? j.result.slice(2) : j.result;
  const words = [];
  for (let i=0; i<hex.length; i+=64) words.push(hex.slice(i,i+64));
  if (words.length < 4) throw new Error(`Only ${words.length} words`);
  const price      = parseInt(words[1],16) / 1e8;
  const ageSeconds = Math.floor(Date.now()/1000) - parseInt(words[3],16);
  if (price < 1000 || price > 20000) throw new Error(`Out of range: ${price}`);
  return { price: parseFloat(price.toFixed(2)), ageSeconds };
}

function Sparkline({ data, hoverIdx, setHoverIdx, positive, cur, rates }) {
  const ref = useRef(null);
  const W=390, H=96, pL=2, pR=2, pT=12, pB=4;
  const iW=W-pL-pR, iH=H-pT-pB;
  const vals = data.map(d=>d.oz);
  const mn=Math.min(...vals), mx=Math.max(...vals), rng=mx-mn||1;
  const cx = i => pL+(i/(data.length-1))*iW;
  const cy = v => pT+iH-((v-mn)/rng)*iH;
  const line = data.map((d,i)=>`${i===0?"M":"L"}${cx(i).toFixed(1)},${cy(d.oz).toFixed(1)}`).join(" ");
  const area = line+` L${cx(data.length-1).toFixed(1)},${H} L${cx(0).toFixed(1)},${H} Z`;
  const hi   = hoverIdx ?? data.length-1;
  const col  = positive ? C.gold : C.red;
  const mxI  = vals.indexOf(mx);
  const getIdx = x => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    return Math.max(0, Math.min(data.length-1, Math.round(((x-r.left)*(W/r.width)-pL)/iW*(data.length-1))));
  };
  return (
    <svg ref={ref} width="100%" viewBox={`0 0 ${W} ${H}`}
      style={{display:"block",overflow:"visible",cursor:"crosshair",touchAction:"none",userSelect:"none"}}
      onMouseMove={e=>setHoverIdx(getIdx(e.clientX))} onMouseLeave={()=>setHoverIdx(null)}
      onTouchStart={e=>setHoverIdx(getIdx(e.touches[0].clientX))}
      onTouchMove={e=>{e.preventDefault();setHoverIdx(getIdx(e.touches[0].clientX));}}
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

function PriceBadge({ clAge, fetching, progress }) {
  const r=10, circ=2*Math.PI*r;
  const clAge_ = clAge==null ? "" :
    clAge<60 ? `${clAge}s ago` :
    clAge<3600 ? `${Math.floor(clAge/60)}m ago` :
    `${Math.floor(clAge/3600)}h ago`;
  return (
    <div style={{display:"flex",alignItems:"center",gap:7}}>
      <svg width="22" height="22" style={{transform:"rotate(-90deg)"}}>
        <circle cx="11" cy="11" r={r} fill="none" stroke={C.s2} strokeWidth="2"/>
        <circle cx="11" cy="11" r={r} fill="none" stroke={fetching?C.gold:"rgba(201,152,26,0.5)"}
          strokeWidth="2" strokeDasharray={circ} strokeDashoffset={circ*(1-progress)}
          strokeLinecap="round" style={{transition:"stroke-dashoffset 0.3s linear"}}/>
      </svg>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:C.gold,animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.05em",color:C.gold}}>
            {fetching?"UPDATING":"LIVE"}
          </span>
        </div>
        {clAge_&&<div style={{fontSize:9,color:C.t3,marginTop:1}}>⬡ settle {clAge_}</div>}
      </div>
    </div>
  );
}

const TX_LIST = [
  {id:1,type:"receive",label:"Mining Yield Q1",    sub:"BlueGold Trust",   oz:0.0749,date:"Mar 11, 2026",time:"9:14 AM", hash:"0x7f3A…D3f5A",network:"Base L2",memo:"Q1 2026 yield",confirms:42},
  {id:2,type:"send",   label:"Coffee Co. Payment", sub:"POS Terminal #447",oz:0.0026,date:"Mar 10, 2026",time:"11:32 AM",hash:"0xB2c1…9aF2E",network:"Base L2",memo:"In-store purchase",confirms:38},
  {id:3,type:"receive",label:"SGC Purchase",       sub:"Coinbase Exchange", oz:0.3214,date:"Mar 8, 2026", time:"2:05 PM", hash:"0x4D8e…7cA1B",network:"Base L2",memo:"Market buy",confirms:120},
  {id:4,type:"send",   label:"To alex.bluegold",   sub:"Peer Transfer",    oz:0.0402,date:"Mar 7, 2026", time:"6:48 PM", hash:"0xA91f…2bD4C",network:"Base L2",memo:"Dinner split",confirms:99},
  {id:5,type:"receive",label:"Vault Redemption",   sub:"Dubai Vault #3",   oz:0.1608,date:"Mar 5, 2026", time:"10:20 AM",hash:"0xE3b7…5eF8D",network:"Base L2",memo:"Physical→digital",confirms:200},
];

function TxDetail({ tx, liveOz, cur, rates, onClose }) {
  const isRec = tx.type==="receive";
  return (
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

function VaultSheet({ liveOz, clPrice, clAge, cur, rates, onClose }) {
  const [sel,setSel] = useState(0);
  const BARS = [
    {serial:"BRK-DXB-2024-00441",refinery:"Valcambi Suisse",purity:"999.9",weight:10,allocated:10,    mintDate:"Nov 14, 2024",location:"Brinks Dubai · Bay 7, Rack 14, Pos 3"},
    {serial:"BRK-DXB-2025-01882",refinery:"PAMP Suisse",    purity:"999.9",weight:10,allocated:0.4194,mintDate:"Feb 28, 2025",location:"Brinks Dubai · Bay 7, Rack 14, Pos 4"},
  ];
  const bar  = BARS[sel];
  const pct  = (bar.allocated/bar.weight*100).toFixed(2);
  const clAge_ = clAge==null?"—":clAge<60?`${clAge}s`:clAge<3600?`${Math.floor(clAge/60)}m`:`${Math.floor(clAge/3600)}h`;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",maxHeight:"88vh",display:"flex",flexDirection:"column",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{padding:"16px 22px",borderBottom:`1px solid ${C.s2}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <span style={{fontSize:20}}>🏅</span>
          <div style={{flex:1}}><div style={{fontSize:16,fontWeight:700}}>Your Gold Bars</div><div style={{fontSize:11,color:C.t3}}>Brinks Dubai · {fmtGN(HOLDING_G)}g total</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px 40px"}}>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {BARS.map((b,i)=>(
              <button key={i} onClick={()=>setSel(i)} style={{flex:1,padding:"10px",background:sel===i?"rgba(212,175,55,0.1)":C.s1,border:`1.5px solid ${sel===i?C.gold:C.s2}`,borderRadius:12,cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:9,color:sel===i?C.gold:C.t3,fontWeight:700,marginBottom:2}}>BAR {i+1}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3}}>{b.serial.slice(-8)}</div>
                <div style={{fontSize:11,fontWeight:600,color:sel===i?C.gold:C.t2,marginTop:2}}>{fmtGN(b.allocated)}g</div>
              </button>
            ))}
          </div>
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
            {[{k:"Serial",v:bar.serial},{k:"Refinery",v:bar.refinery},{k:"Purity",v:`${bar.purity} LBMA`},{k:"Mint date",v:bar.mintDate},{k:"Live value",v:fmt((bar.allocated/TROY)*liveOz,cur,rates),gold:true}].map(({k,v,gold},i,a)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                <span style={{fontSize:11,color:C.t3}}>{k}</span>
                <span style={{fontSize:11,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{padding:"14px 16px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.2)",borderRadius:14}}>
            <div style={{fontSize:10,fontWeight:800,color:"#3772ff",letterSpacing:"0.06em",marginBottom:10}}>⬡ CHAINLINK · SETTLEMENT PRICE</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div>
                <div style={{fontSize:9,color:C.t3,marginBottom:3}}>ON-CHAIN PRICE</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:300,color:"#3772ff"}}>{clPrice?fmt(clPrice,cur,rates):"—"}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:C.t3,marginBottom:3}}>ORACLE AGE</div>
                <div style={{fontSize:14,fontWeight:600,color:C.t2}}>{clAge_}</div>
              </div>
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:C.t3,wordBreak:"break-all",marginBottom:6}}>{CL_XAU}</div>
            <div style={{fontSize:10,color:"#3772ff",lineHeight:1.5}}>All trades settle against this Chainlink XAU/USD oracle on Ethereum Mainnet.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendModal({ liveOz, clPrice, clAge, cur, rates, onClose }) {
  const [step,setStep] = useState(1);
  const [to,setTo]     = useState("");
  const [raw,setRaw]   = useState("");
  const [inOz,setInOz] = useState(true);
  const num    = parseFloat(raw)||0;
  const ozAmt  = inOz ? num : num/liveOz;
  const valid  = to.trim().length>2 && ozAmt>0 && ozAmt<=HOLDING_OZ;
  const clAge_ = clAge==null?"—":clAge<60?`${clAge}s ago`:clAge<3600?`${Math.floor(clAge/60)}m ago`:`${Math.floor(clAge/3600)}h ago`;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(26,23,16,0.55)",backdropFilter:"blur(12px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:"100%",maxWidth:430,background:C.s1,borderTop:`2px solid ${C.gold}`,borderRadius:"22px 22px 0 0",padding:"0 24px 48px",animation:"slideUp 0.28s cubic-bezier(0.22,1,0.36,1)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 20px"}}><div style={{width:40,height:4,borderRadius:2,background:C.s2}}/></div>
        {step===3 ? (
          <div style={{textAlign:"center",paddingBottom:12}}>
            <div style={{width:76,height:76,borderRadius:"50%",background:"rgba(212,175,55,0.08)",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:30,color:C.gold}}>✓</div>
            <div style={{fontSize:20,fontWeight:700,color:C.t1,marginBottom:6}}>Gold Sent</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:38,fontWeight:200,color:C.gold,marginBottom:4}}>{fmtGN(ozAmt*TROY)}<span style={{fontSize:17,color:C.t3}}> g</span></div>
            <div style={{fontSize:12,color:C.t3,marginBottom:8}}>{fmtOzN(ozAmt)} oz · {fmt(ozAmt*liveOz,cur,rates)} → {to}</div>
            <div style={{padding:"10px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.15)",borderRadius:10,fontSize:11,marginBottom:18,textAlign:"left"}}>
              <span style={{color:"#3772ff",fontWeight:700}}>⬡ Settlement:</span> <span style={{color:C.t2}}>{clPrice?fmt(clPrice,cur,rates):"—"}/oz · Chainlink · {clAge_}</span>
            </div>
            <button onClick={onClose} style={{width:"100%",padding:"15px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,cursor:"pointer",fontSize:14,fontWeight:800,color:C.t1}}>Done</button>
          </div>
        ) : step===2 ? (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold}}>↑</div>
              <div><div style={{fontSize:17,fontWeight:700}}>Review Transfer</div><div style={{fontSize:12,color:C.t3}}>Settles via Chainlink on Base</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{textAlign:"center",padding:"18px",background:C.s1,borderRadius:14,border:`1px solid ${C.s2}`,marginBottom:14}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:38,fontWeight:200,color:C.gold}}>{fmtGN(ozAmt*TROY)}<span style={{fontSize:16,color:C.t3}}> g</span></div>
              <div style={{fontSize:12,color:C.t3,marginTop:4}}>{fmtOzN(ozAmt)} oz · {fmt(ozAmt*liveOz,cur,rates)} → <b>{to}</b></div>
            </div>
            <div style={{padding:"10px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.15)",borderRadius:10,fontSize:11,marginBottom:18}}>
              <span style={{color:"#3772ff",fontWeight:700}}>⬡ Settlement price:</span> <span style={{color:C.t2}}>{clPrice?fmt(clPrice,cur,rates):"—"}/oz · Chainlink · {clAge_}</span>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep(1)} style={{flex:1,padding:"14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,color:C.t2,fontSize:14,fontWeight:600,cursor:"pointer"}}>Back</button>
              <button onClick={()=>setStep(3)} style={{flex:2,padding:"14px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:14,color:C.t1,fontSize:14,fontWeight:800,cursor:"pointer"}}>Confirm Send</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.s2}`}}>
              <div style={{width:44,height:44,borderRadius:12,background:"rgba(212,175,55,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.gold,fontWeight:700}}>↑</div>
              <div><div style={{fontSize:17,fontWeight:700}}>Send Gold</div><div style={{fontSize:12,color:C.t3}}>P2P · settles on-chain</div></div>
              <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",fontSize:18,color:C.t3,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",fontWeight:700,marginBottom:7}}>To</div>
              <input value={to} onChange={e=>setTo(e.target.value)} placeholder="@username or 0x address"
                style={{width:"100%",boxSizing:"border-box",padding:"13px",background:C.s1,border:`1.5px solid ${C.s2}`,borderRadius:12,color:C.t1,fontSize:14,outline:"none"}}/>
              <div style={{display:"flex",gap:7,marginTop:7}}>
                {["@alex.bluegold","@sam.bg","@maya.gold"].map(c=>(
                  <button key={c} onClick={()=>setTo(c)} style={{padding:"4px 9px",background:to===c?"rgba(212,175,55,0.1)":C.s1,border:`1px solid ${to===c?C.gold:C.s2}`,borderRadius:7,cursor:"pointer",fontSize:10,color:to===c?C.gold:C.t3,fontWeight:600}}>{c}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
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
            <div style={{padding:"10px 14px",background:"rgba(55,114,255,0.06)",border:"1px solid rgba(55,114,255,0.15)",borderRadius:10,fontSize:11,marginBottom:18}}>
              <span style={{color:"#3772ff",fontWeight:700}}>⬡ Settlement:</span> <span style={{color:C.t2}}>{clPrice?fmt(clPrice,cur,rates):"—"}/oz · Chainlink · {clAge_}</span>
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

function Toggle({ on, onToggle }) {
  return <div onClick={onToggle} style={{width:44,height:26,borderRadius:13,background:on?C.gold:C.s3,cursor:"pointer",position:"relative",transition:"background 0.25s",flexShrink:0}}>
    <div style={{position:"absolute",top:3,left:on?21:3,width:20,height:20,borderRadius:10,background:"#fff",transition:"left 0.25s cubic-bezier(0.4,0,0.2,1)"}}/>
  </div>;
}

export default function App() {
  const [liveOz,     setLiveOz]     = useState(null);
  const [chgPct,     setChgPct]     = useState(null);
  const [clPrice,    setClPrice]    = useState(null);
  const [clAge,      setClAge]      = useState(null);
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
  const [activeTx,   setActiveTx]   = useState(null);
  const [vaultOpen,  setVaultOpen]  = useState(false);
  const [cur,        setCur]        = useState("USD");
  const [rates]                     = useState({USD:1,AED:3.6725,EUR:0.92,GBP:0.78,SGD:1.34});
  const [hideBalance,setHideBalance]= useState(false);

  const anchorOz   = useRef(null);
  const inflight   = useRef(false);
  const isVisible  = useRef(true);
  const isFirst    = useRef(true);
  const progRef    = useRef(null);
  const progStart  = useRef(null);
  const chartTimer = useRef(null);

  useEffect(()=>{ setMounted(true); },[]);
  useEffect(()=>{
    const h=()=>{ isVisible.current=!document.hidden; };
    document.addEventListener("visibilitychange",h);
    return()=>document.removeEventListener("visibilitychange",h);
  },[]);

  const stamp=()=>{ const n=new Date(); return `${n.getHours()}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`; };

  const fetchAll=useCallback(async()=>{
    if (!isVisible.current||inflight.current) return;
    inflight.current=true;
    setFetching(true);
    setErrMsg(null);
    const [spotResult, clResult] = await Promise.allSettled([fetchSpot(), fetchChainlink()]);
    if (spotResult.status==="fulfilled") {
      const { price, chgPct } = spotResult.value;
      const prev = anchorOz.current;
      if (isFirst.current) {
        isFirst.current=false;
        anchorOz.current=price;
        setLiveOz(price);
      } else {
        if (prev!==null&&Math.abs(price-prev)>0.5) {
          setFlash(price>prev?"up":"down");
          setTimeout(()=>setFlash(null),1500);
        }
        anchorOz.current=price;
      }
      setChgPct(chgPct);
      setLastFetch(stamp());
    } else {
      setErrMsg("Live price unavailable · "+spotResult.reason?.message);
    }
    if (clResult.status==="fulfilled") {
      setClPrice(clResult.value.price);
      setClAge(clResult.value.ageSeconds);
    }
    setFetching(false);
    inflight.current=false;
  },[]);

  useEffect(()=>{
    fetchAll();
    const id=setInterval(()=>{ if(isVisible.current) fetchAll(); },POLL_MS);
    return()=>clearInterval(id);
  },[fetchAll]);

  useEffect(()=>{
    if (!lastFetch) return;
    setProgress(0); progStart.current=Date.now();
    clearInterval(progRef.current);
    progRef.current=setInterval(()=>{ setProgress(Math.min((Date.now()-progStart.current)/POLL_MS,1)); },200);
    return()=>clearInterval(progRef.current);
  },[lastFetch]);

  useEffect(()=>{
    const id=setInterval(()=>{
      if (!isVisible.current) return;
      setLiveOz(prev=>{
        if (prev===null||anchorOz.current===null) return prev;
        const diff=anchorOz.current-prev;
        if (Math.abs(diff)<0.01) return anchorOz.current;
        return parseFloat((prev+diff*0.15).toFixed(2));
      });
    },250);
    return()=>clearInterval(id);
  },[]);

  const [chartOz,setChartOz]=useState(5000);
  useEffect(()=>{
    if (!liveOz) return;
    clearTimeout(chartTimer.current);
    chartTimer.current=setTimeout(()=>setChartOz(liveOz),2000);
    return()=>clearTimeout(chartTimer.current);
  },[liveOz]);

  const rangeData     = useMemo(()=>getRange(range,chartOz),[range,chartOz]);
  const hi            = hoverIdx??rangeData.length-1;
  const dispOz        = hoverIdx===null?(liveOz||0):rangeData[hi].oz;
  const startOz       = rangeData[0].oz;
  const change        = dispOz-startOz;
  const changePct     = (change/startOz)*100;
  const positive      = change>=0;
  const eventNote     = EVENTS[rangeData[hi]?.ts];
  const loading       = liveOz===null;
  const portValue     = loading?null:HOLDING_OZ*liveOz;
  const portChange    = portValue?portValue-INITIAL_USD:null;
  const portChangePct = portChange?(portChange/INITIAL_USD)*100:null;

  const nav=[
    {id:"home",   label:"Home",   svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke={c} strokeWidth="2" strokeLinejoin="round" fill={c===C.gold?"rgba(201,152,26,0.15)":"none"}/></svg>},
    {id:"wallet", label:"Wallet", svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke={c} strokeWidth="2" fill={c===C.gold?"rgba(201,152,26,0.12)":"none"}/><path d="M16 13a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z" fill={c}/><path d="M2 10h20" stroke={c} strokeWidth="2"/></svg>},
    {id:"vault",  label:"Vault",  svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke={c} strokeWidth="2" fill={c===C.gold?"rgba(201,152,26,0.12)":"none"}/><circle cx="12" cy="12" r="4" stroke={c} strokeWidth="2"/><circle cx="12" cy="12" r="1.5" fill={c}/></svg>},
    {id:"profile",label:"Profile",svg:c=><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={c} strokeWidth="2" fill={c===C.gold?"rgba(201,152,26,0.12)":"none"}/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.t1,display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'DM Sans',sans-serif",paddingBottom:88}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@400;500&display=swap');
        @keyframes slideUp{from{transform:translateY(32px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes flashUp{0%{color:#1A7A45}50%{color:#1A7A45}100%{color:inherit}}
        @keyframes flashDown{0%{color:#C0392B}50%{color:#C0392B}100%{color:inherit}}
        @keyframes shimmer{0%{opacity:0.3}50%{opacity:0.7}100%{opacity:0.3}}
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        .btn:active{transform:scale(0.94);}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        ::-webkit-scrollbar{width:0;height:0;}
        .fu{animation:flashUp 1.5s forwards;}
        .fd{animation:flashDown 1.5s forwards;}
        .sh{animation:shimmer 1.4s ease-in-out infinite;}
      `}</style>

      {tab==="wallet"&&(
        <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
          <div style={{padding:"20px 20px 0",marginBottom:16}}><div style={{fontSize:20,fontWeight:800,marginBottom:2}}>Activity</div><div style={{fontSize:12,color:C.t3}}>Base L2 · ERC-20 · SGC</div></div>
          <div style={{margin:"0 20px 16px",padding:"16px 18px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:4}}>SGC Balance</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:300,color:C.gold}}>{fmtOzN(HOLDING_OZ)} oz</div>
              <div style={{fontSize:11,color:C.t3,marginTop:3}}>{fmtGN(HOLDING_G)}g · {liveOz?fmt(HOLDING_OZ*liveOz,cur,rates):"—"}</div>
            </div>
            <button onClick={()=>setSendOpen(true)} style={{padding:"10px 16px",background:`linear-gradient(135deg,${C.goldD},${C.gold})`,border:"none",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:800,color:C.t1}}>Send ↑</button>
          </div>
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

      {tab==="vault"&&(
        <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
          <div style={{padding:"20px 20px 16px"}}><div style={{fontSize:20,fontWeight:800,marginBottom:2}}>Vault</div><div style={{fontSize:12,color:C.t3}}>Brinks Dubai · 100% allocated · LBMA 999.9</div></div>
          <div style={{margin:"0 20px 16px",padding:"20px",background:"rgba(212,175,55,0.05)",border:"1px solid rgba(212,175,55,0.18)",borderRadius:18}}>
            <div style={{fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:8}}>Total Allocated</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:34,fontWeight:200,color:C.gold,marginBottom:4}}>{fmtGN(HOLDING_G)}<span style={{fontSize:15,color:C.t3,marginLeft:5}}>g SGC</span></div>
            <div style={{fontSize:12,color:C.t3,marginBottom:12}}>{fmtOzN(HOLDING_OZ)} oz · {liveOz?fmt(HOLDING_OZ*liveOz,cur,rates):"loading…"}</div>
            <div style={{display:"flex",gap:8}}>
              <div style={{padding:"4px 10px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.25)",borderRadius:6,fontSize:10,fontWeight:700,color:C.green}}>✓ ALLOCATED</div>
              <div style={{padding:"4px 10px",background:"rgba(55,114,255,0.08)",border:"1px solid rgba(55,114,255,0.2)",borderRadius:6,fontSize:10,fontWeight:700,color:"#3772ff"}}>⬡ CHAINLINK SETTLE</div>
            </div>
          </div>
          <div style={{margin:"0 20px",display:"flex",gap:10}}>
            <div style={{flex:1,padding:"14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14}}>
              <div style={{fontSize:9,color:C.t3,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Live · Yahoo Finance</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:300,color:C.gold}}>{liveOz?fmt(liveOz,cur,rates):"—"}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:3}}>Display · every 15s</div>
            </div>
            <div style={{flex:1,padding:"14px",background:"rgba(55,114,255,0.05)",border:"1px solid rgba(55,114,255,0.2)",borderRadius:14}}>
              <div style={{fontSize:9,color:"#3772ff",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>⬡ Settlement · Chainlink</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,fontWeight:300,color:"#3772ff"}}>{clPrice?fmt(clPrice,cur,rates):"—"}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:3}}>{clAge!=null?(clAge<60?`${clAge}s`:clAge<3600?`${Math.floor(clAge/60)}m`:`${Math.floor(clAge/3600)}h`)+" ago":"—"}</div>
            </div>
          </div>
        </div>
      )}

      {tab==="profile"&&(
        <div style={{width:"100%",maxWidth:430,paddingBottom:24}}>
          <div style={{padding:"20px 20px 16px"}}><div style={{fontSize:20,fontWeight:800,marginBottom:2}}>Profile</div><div style={{fontSize:12,color:C.t3}}>BlueGold · SGC Wallet</div></div>
          <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:18,padding:"18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <div style={{width:50,height:50,borderRadius:14,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:C.t1}}>JW</div>
              <div><div style={{fontSize:16,fontWeight:700}}>John Warren</div><div style={{fontSize:12,color:C.t3}}>john.bluegold</div></div>
              <div style={{marginLeft:"auto",padding:"4px 10px",background:"rgba(26,122,69,0.1)",border:"1px solid rgba(26,122,69,0.2)",borderRadius:20,fontSize:10,fontWeight:700,color:C.green}}>✓ KYC</div>
            </div>
            <div style={{padding:"10px 12px",background:C.s2,borderRadius:10}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.t2,wordBreak:"break-all"}}>0x7f3A9c2B8e1D4F6a0C5E7b3D9f2A8c4E6b1D3f5A</div>
            </div>
          </div>
          <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.s2}`,fontSize:10,color:C.t3,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Portfolio</div>
            {[{k:"oz held",v:`${fmtOzN(HOLDING_OZ)} oz`},{k:"Grams",v:`${fmtGN(HOLDING_G)}g`},{k:"Live value",v:portValue?fmt(portValue,cur,rates):"loading…",gold:true},{k:"Total return",v:portChange?(portChange>=0?"+":"")+fmt(portChange,cur,rates)+" ("+Math.abs(portChangePct||0).toFixed(1)+"%)":"loading…",gold:true}].map(({k,v,gold},i,a)=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"11px 16px",borderBottom:i<a.length-1?`1px solid ${C.s2}`:"none"}}>
                <span style={{fontSize:12,color:C.t3}}>{k}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{margin:"0 20px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:16,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:`1px solid ${C.s2}`}}>
              <div><div style={{fontSize:13,fontWeight:600}}>Hide Balance</div><div style={{fontSize:11,color:C.t3}}>Mask values on home</div></div>
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
        </div>
      )}

      {tab==="home"&&(
        <div style={{width:"100%",maxWidth:430}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 0",opacity:mounted?1:0,transition:"opacity 0.4s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${C.goldD},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:C.t1}}>Au</div>
              <div><div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.02em"}}>BlueGold</div><div style={{fontSize:10,color:C.t3,letterSpacing:"0.08em"}}>STANDARD GOLD COIN</div></div>
            </div>
            <PriceBadge clAge={clAge} fetching={fetching} progress={progress}/>
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
                  <span style={{fontSize:11,color:C.t3}}>{positive?"+":""}{fmt(change,cur,rates)} · {hoverIdx!==null?rangeData[hi].date:"since account open"}</span>
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
            {[{label:"Buy",icon:"+",gold:true,fn:()=>{}},{label:"Send",icon:"↑",gold:false,fn:()=>setSendOpen(true)},{label:"Receive",icon:"↓",gold:false,fn:()=>{}},{label:"Vault",icon:"🏅",gold:false,fn:()=>setVaultOpen(true)}].map(({label,icon,gold,fn})=>(
              <button key={label} className="btn" onClick={fn} style={{flex:1,padding:"14px 0",background:gold?`linear-gradient(145deg,${C.goldD},${C.gold})`:C.s1,border:gold?"none":`1px solid ${C.s2}`,borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,boxShadow:gold?"0 4px 20px rgba(212,175,55,0.2)":"none"}}>
                <span style={{fontSize:17,color:gold?"#1A1710":C.t2,fontWeight:gold?800:400}}>{icon}</span>
                <span style={{fontSize:10,fontWeight:800,letterSpacing:"0.08em",color:gold?"#1A1710":C.t3,textTransform:"uppercase"}}>{label}</span>
              </button>
            ))}
          </div>

          <div style={{margin:"14px 20px 0",display:"flex",gap:10}}>
            <div style={{flex:1,padding:"12px 14px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14}}>
              <div style={{fontSize:10,fontWeight:600,color:C.t3,marginBottom:4}}>Live · Yahoo Finance</div>
              {loading
                ?<div className="sh" style={{fontFamily:"'DM Mono',monospace",fontSize:16,color:C.t3}}>$—,———.——</div>
                :<div className={flash==="up"?"fu":flash==="down"?"fd":""} style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:C.gold,fontVariantNumeric:"tabular-nums"}}>{fmt(liveOz,cur,rates)}</div>
              }
              {!loading&&chgPct!==null&&<div style={{fontSize:10,marginTop:3,color:chgPct>=0?C.green:C.red}}>{chgPct>=0?"▲ +":"▼ "}{Math.abs(chgPct).toFixed(2)}% today</div>}
            </div>
            <div style={{flex:1,padding:"12px 14px",background:"rgba(55,114,255,0.05)",border:"1px solid rgba(55,114,255,0.2)",borderRadius:14}}>
              <div style={{fontSize:10,fontWeight:600,color:"#3772ff",marginBottom:4}}>⬡ Settle · Chainlink</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:"#3772ff",fontVariantNumeric:"tabular-nums"}}>{clPrice?fmt(clPrice,cur,rates):"—"}</div>
              <div style={{fontSize:10,marginTop:3,color:C.t3}}>{clAge!=null?(clAge<60?`${clAge}s`:clAge<3600?`${Math.floor(clAge/60)}m`:`${Math.floor(clAge/3600)}h`)+" ago":"—"}</div>
            </div>
          </div>

          <div onClick={()=>setVaultOpen(true)} style={{margin:"10px 20px 0",padding:"11px 16px",background:C.s1,border:`1px solid ${C.s2}`,borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span>🏅</span>
              <span style={{fontSize:12,color:C.t2,fontWeight:500}}>Brinks Dubai · {fmtGN(HOLDING_G)}g allocated</span>
              <span style={{padding:"2px 6px",background:"rgba(95,224,138,0.1)",border:"1px solid rgba(95,224,138,0.2)",borderRadius:4,fontSize:9,fontWeight:700,color:C.green}}>ALLOCATED</span>
            </div>
            <span style={{fontSize:13,color:C.t3}}>›</span>
          </div>

          <div style={{padding:"22px 0 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"0 20px 12px",borderBottom:`1px solid ${C.s2}`}}>
              <span style={{fontSize:16,fontWeight:800}}>Activity</span>
              <span onClick={()=>setTab("wallet")} style={{fontSize:13,color:C.gold,cursor:"pointer",fontWeight:600}}>See all →</span>
            </div>
            {TX_LIST.slice(0,3).map(tx=>(
              <div key={tx.id} onClick={()=>setActiveTx(tx)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 20px",cursor:"pointer",borderBottom:`1px solid ${C.s2}`}}>
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
            {[{k:"Opened",v:fmt(INITIAL_USD,cur,rates)},{k:"Open price",v:`${fmt(ACCOUNT_OPEN_OZ,cur,rates)}/oz`},{k:"oz held",v:`${fmtOzN(HOLDING_OZ)} oz`},{k:"Live value",v:loading?"—":hideBalance?"••••":fmt(portValue,cur,rates),gold:true},{k:"Total return",v:loading?"—":hideBalance?"••••":(portChange>=0?"+":"")+fmt(portChange,cur,rates),gold:true}].map(({k,v,gold})=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"11px 20px",borderBottom:`1px solid ${C.s2}`}}>
                <span style={{fontSize:12,color:C.t3}}>{k}</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:gold?C.gold:C.t2,fontWeight:gold?600:400}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.97)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.s2}`,display:"flex",justifyContent:"center",zIndex:100}}>
        <div style={{width:"100%",maxWidth:430,display:"flex"}}>
          {nav.map(({id,label,svg})=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"13px 0 11px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative"}}>
              {tab===id&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:32,height:3,borderRadius:2,background:`linear-gradient(90deg,${C.goldD},${C.gold})`}}/>}
              {svg(tab===id?C.gold:C.t3)}
              <span style={{fontSize:9,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:tab===id?C.gold:C.t3}}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTx&&<TxDetail tx={activeTx} liveOz={liveOz||0} cur={cur} rates={rates} onClose={()=>setActiveTx(null)}/>}
      {vaultOpen&&<VaultSheet liveOz={liveOz||0} clPrice={clPrice} clAge={clAge} cur={cur} rates={rates} onClose={()=>setVaultOpen(false)}/>}
      {sendOpen&&<SendModal liveOz={liveOz||0} clPrice={clPrice} clAge={clAge} cur={cur} rates={rates} onClose={()=>setSendOpen(false)}/>}
    </div>
  );
}

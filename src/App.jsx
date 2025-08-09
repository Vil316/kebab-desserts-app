// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { db, ensureAuth } from "./firebase";
import {
  collection, addDoc, doc, setDoc, onSnapshot, query, orderBy,
  deleteDoc, where, getDocs
} from "firebase/firestore";

/** ===== THEME (Dark Brown + White) ===== */
const COLORS = {
  bg: "#fd2c08ff",            // page background (very dark brown)
  card: "#543027ff",          // cards / sections
  cardBorder: "#462c23ff",    // borders
  text: "#ffffff",          // default text
  subtext: "#f5e9e7",       // lighter text
  pillActive: "#3e2723",    // active pill (deep brown)
  pillInactive: "#4e342e",  // inactive pill
  pillBorder: "#6d4c41",    // pill border
  pillDisabled: "#8d6e63",  // disabled
  badgeBg: "#3e2723",       // count chips
  chipBg: "#5d4037",        // info chips (ETA / service type)
  statusReady: "#2e7d32",   // green for READY/DONE
  divider: "#6d4c41"
};

/** ===== CONFIG ===== */
const CLEAR_HOUR = 1; // auto-clear previous-day DONE at 1:00 AM

/** ===== HELPERS ===== */
const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();
const resizeFlavours = (arr, n, fallback) => {
  const out = arr ? [...arr] : [];
  const base = out.length ? out[out.length - 1] : fallback;
  while (out.length < n) out.push(base);
  if (out.length > n) out.length = n;
  return out;
};

/** ===== MENU DATA ===== */
const milkshakeRegularFlavours = [
  "Areo-Mint","Banana","Bounty","Crunchie","Chocolate","Ferrero","Flake","Galaxy",
  "Galaxy Caramel","Kinder Bueno","Kinder Bueno White","Lotus Biscoff","Mnalteasers",
  "Milkybar","Millions Bubblegum","Nutella","Oreo","Raspberry Ripple","Reese's",
  "Skittles","Snickers","Strawberry","Terry's Orange","Vanilla",
];
const milkshakeGourmetFlavours = [
  "Jammie Whammie","Tango Mango","Oreo & Strawberry","Reese's & Oreo","Shake This Way",
];
const iceCreamFlavours = [
  "Belgian Chocolate","Biscoff","Bluebubblegum","Choco Fudge Brownie",
  "Cookie Dough Ice Cream","Kinder","Mint Chocochip","Raspberry Ripple",
  "Salted Caramel","Strawberry","Strawberry Cheesecake","Vanilla","White Chocolate",
];
const cakeOptions = [
  "Chocolate Volcano","Ferraro Brownie","Sticky Toffee Pudding",
  "Chocolate Fudge Brownie","Kinder Brownie","Chocolate Fudge Cake",
];
const readyOptions = [5, 10, 15];
const serviceTypes = ["Waiting", "Delivery", "Collection"];

/** ===== PRIMITIVES ===== */
function Section({ title, count, children }) {
  return (
    <section style={{
      background: COLORS.card,
      color: COLORS.text,
      border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: 16,
      padding: 12
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {typeof count === 'number' ? (
          <span style={{
            background: COLORS.badgeBg,
            color: COLORS.text,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 999, minWidth: 22, height: 22,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize: 12, padding: '0 6px'
          }}>{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Button({ children, onClick, disabled, active }) {
  const bg = active ? COLORS.pillActive : COLORS.pillInactive;
  const color = COLORS.text;
  const border = `1px solid ${COLORS.pillBorder}`;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border,
        background: disabled ? COLORS.pillDisabled : bg,
        color: disabled ? "#ddd" : color,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 700
      }}
    >
      {children}
    </button>
  );
}

function PillGroup({ options, value, onChange, groupLabel }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {groupLabel && <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.subtext }}>{groupLabel}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map(opt => (
          <Button key={String(opt)} active={value===opt} onClick={()=>onChange(opt)}>{String(opt)}</Button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, labels=["No","Yes"] }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button active={!value} onClick={()=>onChange(false)}>{labels[0]}</Button>
      <Button active={value} onClick={()=>onChange(true)}>{labels[1]}</Button>
    </div>
  );
}

function Qty({ value, setValue }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Button onClick={() => setValue(Math.max(1, value-1))}>-</Button>
      <div style={{ minWidth: 24, textAlign: "center" }}>{value}</div>
      <Button onClick={() => setValue(value+1)}>+</Button>
    </div>
  );
}

function Chip({ children, tone="neutral" }) {
  const bg = tone === "ready" ? COLORS.statusReady : COLORS.chipBg;
  const color = tone === "ready" ? "#fff" : COLORS.text;
  return (
    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: bg, color }}>{children}</span>
  );
}

/** ===== ORDER CARD ===== */
function OrderCard({ o, forceDone }) {
  const statusBg = forceDone
    ? COLORS.statusReady
    : (o.status === "READY" ? COLORS.statusReady
      : (o.status === "IN_PROGRESS" ? COLORS.chipBg : COLORS.badgeBg));
  const statusColor = (o.status === "NEW" && !forceDone) ? "#fff" : COLORS.text;

  return (
    <div style={{
      border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: 12,
      padding: 8,
      display: "grid",
      gap: 6,
      background: COLORS.card,
      color: COLORS.text
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><b>#{o.number}</b> — {new Date(o.placedAt).toLocaleTimeString()}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {o.serviceType && (<Chip>{o.serviceType}</Chip>)}
          {typeof o.etaMins!=="undefined" && !forceDone && (<Chip>ETA {o.etaMins}m</Chip>)}
          <span style={{
            fontSize: 12, padding: "2px 8px", borderRadius: 999,
            background: statusBg, color: statusColor, border: `1px solid ${COLORS.cardBorder}`
          }}>
            {forceDone ? "DONE" : o.status}
          </span>
        </div>
      </div>
      <div>
        {o.items.map(li => (
          <div key={li.id || JSON.stringify(li)} style={{ fontSize: 13, color: COLORS.subtext }}>
            • <b style={{ color: COLORS.text }}>{li.name}</b> × {li.qty}
            {li.size?` • ${li.size}`:""}
            {typeof li.scoops!=="undefined"?` • ${li.scoops} scoops`:""}
            {Array.isArray(li.flavours) && li.flavours.length>0 ? ` • ${li.flavours.join("/")}` : ""}
            {typeof li.whipped!=="undefined"?` • Whipped ${li.whipped?"Yes":"No"}`:""}
            {typeof li.pack!=="undefined"?` • Pack ${li.pack?"Yes":"No"}`:""}
            {li.side && li.side!=="None"?` • ${li.side}`:""}
            {li.notes?` — ${li.notes}`: ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ===== KEBAB (Sender) ===== */
function KebabSender({ onSend, sentOrders }){
  const [cart, setCart] = useState([]);

  const [milkshake, setMilkshake] = useState({ flavour: null, isGourmet: false, size: "Regular", qty: 1, whipped: false, pack: false });
  const [iceCream, setIceCream] = useState({ scoops: 1, flavours: [iceCreamFlavours[0]], qty: 1 });
  const [cake, setCake] = useState({ name: cakeOptions[0], qty: 1, side: "None" });

  const [note, setNote] = useState("");
  const [readyIn, setReadyIn] = useState(readyOptions[0]);
  const [serviceType, setServiceType] = useState(null);
  const [productTab, setProductTab] = useState("milkshakes");

  function setScoops(n){
    setIceCream(s => ({ ...s, scoops: n, flavours: resizeFlavours(s.flavours, n, iceCreamFlavours[0]) }));
  }
  function setFlavourAt(idx, val){
    setIceCream(s => {
      const arr = [...s.flavours]; arr[idx] = val; return { ...s, flavours: arr };
    });
  }
  function selectRegular(flavour){ setMilkshake(s => ({ ...s, flavour, isGourmet: false })); }
  function selectGourmet(flavour){ setMilkshake(s => ({ ...s, flavour, isGourmet: true })); }

  function addMilkshake(){
    if (!milkshake.flavour) return;
    const labelPrefix = milkshake.isGourmet ? "Gourmet " : "";
    setCart(c => [...c, {
      id: uid(), kind: "milkshake",
      name: `${labelPrefix}${milkshake.flavour} Milkshake`,
      qty: milkshake.qty, size: milkshake.size,
      whipped: milkshake.whipped, pack: milkshake.qty===1 ? milkshake.pack : undefined
    }]);
  }
  function addIceCream(){
    setCart(c => [...c, {
      id: uid(), kind: "icecream",
      name: `${iceCream.flavours.join(" / ")} Ice Cream`,
      qty: iceCream.qty, scoops: iceCream.scoops, flavours: iceCream.flavours
    }]);
  }
  function addCake(){
    setCart(c => [...c, { id: uid(), kind: "cake", name: cake.name, qty: cake.qty, side: cake.side }]);
  }
  function clearCart(){ setCart([]); setNote(""); }

  async function sendOrder(){
    if(!cart.length || !serviceType) return;
    const order = {
      items: note ? cart.map(i => ({ ...i, notes: note })) : cart,
      placedAt: nowIso(),
      status: "NEW",
      etaMins: readyIn,
      serviceType,
      number: Date.now() % 100000 // human-readable ref
    };
    await onSend(order);
    clearCart();
  }

  const active = (sentOrders||[]).filter(o=>o.status!=="DONE");
  const completed = (sentOrders||[]).filter(o=>o.status==="DONE");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Product Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        <Button active={productTab==='milkshakes'} onClick={()=>setProductTab('milkshakes')}>Milkshakes</Button>
        <Button active={productTab==='icecream'} onClick={()=>setProductTab('icecream')}>Ice Cream</Button>
        <Button active={productTab==='cakes'} onClick={()=>setProductTab('cakes')}>Cakes</Button>
      </div>

      {/* Milkshakes */}
      {productTab === 'milkshakes' && (
        <Section title="Milkshakes">
          <div style={{ display: "grid", gap: 10 }}>
            <PillGroup groupLabel="Regular" options={milkshakeRegularFlavours}
              value={milkshake.isGourmet ? null : milkshake.flavour}
              onChange={(v)=>selectRegular(v)} />
            <div style={{ height: 2, background: COLORS.divider, borderRadius: 1 }} />
            <PillGroup groupLabel="Gourmet" options={milkshakeGourmetFlavours}
              value={milkshake.isGourmet ? milkshake.flavour : null}
              onChange={(v)=>selectGourmet(v)} />
            <div>
              <div style={{ fontSize: 12, color: COLORS.subtext, margin: "8px 0 4px" }}>Size</div>
              <PillGroup options={["Regular","Large"]} value={milkshake.size} onChange={v=>setMilkshake(s=>({ ...s, size: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Whipped Cream</div>
              <Toggle value={milkshake.whipped} onChange={v=>setMilkshake(s=>({ ...s, whipped: v }))} />
            </div>
            {milkshake.qty===1 && (
              <div>
                <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Pack this milkshake?</div>
                <Toggle value={milkshake.pack} onChange={v=>setMilkshake(s=>({ ...s, pack: v }))} />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Qty value={milkshake.qty} setValue={n=>setMilkshake(s=>({ ...s, qty:n }))} />
              <Button onClick={addMilkshake} disabled={!milkshake.flavour}>Add</Button>
            </div>
          </div>
        </Section>
      )}

      {/* Ice Cream */}
      {productTab === 'icecream' && (
        <Section title="Ice Cream">
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Scoops</div>
              <PillGroup options={[1,2,3]} value={iceCream.scoops} onChange={setScoops} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Flavours</div>
              <div style={{ display: "grid", gap: 8 }}>
                {Array.from({ length: iceCream.scoops }).map((_, idx) => (
                  <div key={idx}>
                    <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Scoop {idx+1}</div>
                    <PillGroup options={iceCreamFlavours} value={iceCream.flavours[idx]} onChange={(v)=>setFlavourAt(idx, v)} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Qty value={iceCream.qty} setValue={n=>setIceCream(s=>({ ...s, qty:n }))} />
              <Button onClick={addIceCream}>Add</Button>
            </div>
          </div>
        </Section>
      )}

      {/* Cakes */}
      {productTab === 'cakes' && (
        <Section title="Cakes">
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Cake</div>
              <PillGroup options={cakeOptions} value={cake.name} onChange={v=>setCake(s=>({ ...s, name: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Serve With</div>
              <PillGroup options={["None","Custard","Vanilla Ice Cream"]} value={cake.side} onChange={v=>setCake(s=>({ ...s, side: v }))} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Qty value={cake.qty} setValue={n=>setCake(s=>({ ...s, qty:n }))} />
              <Button onClick={addCake}>Add</Button>
            </div>
          </div>
        </Section>
      )}

      {/* Cart + Send */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Section title="Cart">
          {cart.length === 0 ? (
            <div style={{ color: COLORS.subtext, fontSize: 14 }}>No items yet. Add milkshakes, ice creams, or cakes.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {cart.map(li => (
                <div key={li.id} style={{
                  display: "flex", justifyContent: "space-between",
                  border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12, padding: 8
                }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{li.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.subtext }}>
                      Qty {li.qty}
                      {li.size?` • ${li.size}`:""}
                      {typeof li.scoops!=="undefined"?` • ${li.scoops} scoops`:""}
                      {Array.isArray(li.flavours) && li.flavours.length>0 ? ` • ${li.flavours.join("/")}` : ""}
                      {typeof li.whipped!=="undefined"?` • Whipped ${li.whipped?"Yes":"No"}`:""}
                      {typeof li.pack!=="undefined"?` • Pack ${li.pack?"Yes":"No"}`:""}
                      {li.side && li.side!=="None"?` • ${li.side}`:""}
                    </div>
                  </div>
                  <Button onClick={()=>setCart(c=>c.filter(x=>x.id!==li.id))}>Remove</Button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Order Note & Send">
          <input
            placeholder="e.g., No cream on shake"
            value={note}
            onChange={e=>setNote(e.target.value)}
            style={{
              width: "100%", padding: 8, borderRadius: 8,
              border: `1px solid ${COLORS.cardBorder}`, background: COLORS.bg, color: COLORS.text
            }}
          />
          <div style={{ height: 8 }} />
          <div>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Order Type</div>
            <PillGroup options={serviceTypes} value={serviceType} onChange={setServiceType} />
          </div>
          <div style={{ height: 8 }} />
          <div>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Tell Desserts: Ready In</div>
            <PillGroup options={readyOptions} value={readyIn} onChange={setReadyIn} />
          </div>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={clearCart}>Clear</Button>
            <Button onClick={sendOrder} disabled={!cart.length || !serviceType}>Send to Desserts</Button>
          </div>
        </Section>
      </div>

      {/* Kebab page: current orders (live) */}
      <Section title="Active Orders" count={active.length}>
        {active.length === 0 ? (
          <div style={{ color: COLORS.subtext, fontSize: 14 }}>No active orders.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 250, overflowY: "auto" }}>
            {active.map(o => (<OrderCard key={o.id} o={o} />))}
          </div>
        )}
      </Section>

      <Section title="Completed Orders" count={completed.length}>
        {completed.length === 0 ? (
          <div style={{ color: COLORS.subtext, fontSize: 14 }}>No completed orders yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 250, overflowY: "auto" }}>
            {completed.map(o => (<OrderCard key={o.id} o={o} forceDone />))}
          </div>
        )}
      </Section>
    </div>
  );
}

/** ===== DESSERTS (Receiver) ===== */
function DessertsReceiver({ orders, onStart, onReady, onDone }) {
  const active = orders.filter(o=>o.status!=="DONE");
  const completed = orders.filter(o=>o.status==="DONE");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Section title="Active Orders" count={active.length}>
        <div style={{ display: "grid", gap: 12 }}>
          {active.length === 0 && <div style={{ color: COLORS.subtext, fontSize: 14 }}>Waiting for orders…</div>}
          {active.map(o => (
            <div key={o.id} style={{
              padding: 12, borderRadius: 16, background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>#{o.number}</div>
                  <div style={{ fontSize: 12, color: COLORS.subtext }}>{new Date(o.placedAt).toLocaleTimeString()}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {o.serviceType && (<Chip>{o.serviceType}</Chip>)}
                  {typeof o.etaMins!=="undefined" && (<Chip>ETA {o.etaMins} mins</Chip>)}
                  <Chip tone={o.status==="READY" ? "ready" : "neutral"}>{o.status}</Chip>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                {o.items.map((li, idx) => (
                  <div key={idx} style={{ fontSize: 14, color: COLORS.subtext }}>
                    • <b style={{ color: COLORS.text }}>{li.name}</b> × {li.qty}
                    {li.size?` • ${li.size}`:""}
                    {typeof li.scoops!=="undefined"?` • ${li.scoops} scoops`:""}
                    {Array.isArray(li.flavours) && li.flavours.length>0 ? ` • ${li.flavours.join("/")}` : ""}
                    {typeof li.whipped!=="undefined"?` • Whipped ${li.whipped?"Yes":"No"}`:""}
                    {typeof li.pack!=="undefined"?` • Pack ${li.pack?"Yes":"No"}`:""}
                    {li.side && li.side!=="None"?` • ${li.side}`:""}
                    {li.notes? <span> — {li.notes}</span>: null}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <Button onClick={()=>onStart(o.id)}>Start</Button>
                <Button onClick={()=>onReady(o.id)}>Mark Ready</Button>
                <Button onClick={()=>onDone(o.id)}>Done</Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ height: 12 }} />

      <Section title="Completed Orders" count={completed.length}>
        {completed.length === 0 ? (
          <div style={{ color: COLORS.subtext, fontSize: 14 }}>No completed orders yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 250, overflowY: 'auto' }}>
            {completed.map(o => (<OrderCard key={o.id} o={o} forceDone />))}
          </div>
        )}
      </Section>
    </div>
  );
}

/** ===== ROOT APP ===== */
export default function App(){
  const [tab, setTab] = useState("kebab");
  const [orders, setOrders] = useState([]);
  const audioRef = useRef(null);
  const [lastClearedDate, setLastClearedDate] = useState(null);

  // Firestore realtime listener
  useEffect(() => {
    let unsub;
    (async () => {
      await ensureAuth();
      const q = query(collection(db, "orders"), orderBy("placedAt", "desc"));
      unsub = onSnapshot(q, (snap) => {
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    })();
    return () => unsub && unsub();
  }, []);

  // Send new order
  async function pushOrder(order){
    await ensureAuth();
    await addDoc(collection(db, "orders"), order);
    setTab("desserts");
    const audio = audioRef.current;
    if (audio){ try { audio.currentTime = 0; audio.play(); } catch(e) {} }
  }

  // Update status
  async function setStatus(id, status){
    await ensureAuth();
    const ref = doc(db, "orders", id);
    const patch = { status };
    if (status === "DONE") patch.doneAt = new Date().toISOString();
    await setDoc(ref, patch, { merge: true });
  }

  // Auto-clear DONE (previous day) at CLEAR_HOUR
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === CLEAR_HOUR && now.getMinutes() === 0) {
        const today = now.toISOString().slice(0, 10);
        if (lastClearedDate !== today) {
          await ensureAuth();
          const startOfToday = new Date(`${today}T00:00:00`);
          const q = query(collection(db, "orders"), where("status", "==", "DONE"));
          const snap = await getDocs(q);
          const deletions = [];
          snap.forEach((d) => {
            const { doneAt } = d.data();
            if (!doneAt) return;
            const doneDate = new Date(doneAt);
            if (doneDate < startOfToday) {
              deletions.push(deleteDoc(doc(db, "orders", d.id)));
            }
          });
          await Promise.all(deletions);
          setLastClearedDate(today);
        }
      }
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [lastClearedDate]);

  // Derived
  const active = orders.filter(o=>o.status!=="DONE").length;
  const done = orders.filter(o=>o.status==="DONE").length;

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh" }}>
      <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/beep_short.ogg" preload="auto" />
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto", display: "grid", gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Desserts Relay — Live (Firestore)</div>
        <div style={{ fontSize: 12, color: COLORS.subtext }}>Open on both tablets. Kebab sends; Desserts receives. Works over different Wi‑Fi.</div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button active={tab==="kebab"} onClick={()=>setTab("kebab")}>Kebab — Send Orders</Button>
          <Button active={tab==="desserts"} onClick={()=>setTab("desserts")}>Desserts — Receive Orders</Button>
        </div>

        {tab === "kebab" && (
          <KebabSender
            onSend={pushOrder}
            sentOrders={orders}
          />
        )}

        {tab === "desserts" && (
          <DessertsReceiver
            orders={orders}
            onStart={(id)=>setStatus(id, "IN_PROGRESS")}
            onReady={(id)=>setStatus(id, "READY")}
            onDone={(id)=>setStatus(id, "DONE")}
          />
        )}

        <Section title="Today — Summary" count={active + done}>
          <div style={{ fontSize: 12, color: COLORS.subtext }}>
            Active: <b style={{ color: COLORS.text }}>{active}</b> • Completed: <b style={{ color: COLORS.text }}>{done}</b> • Auto‑clear: <b style={{ color: COLORS.text }}>{String(CLEAR_HOUR).padStart(2,'0')}:00</b>
          </div>
        </Section>
      </div>
    </div>
  );
}
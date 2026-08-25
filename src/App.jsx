import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient.js";

/* =========================================================================
VALD'Z BURGER — pedidos online
Dirección visual: formato "app de delivery" (buscador arriba, categorías
en pestañas, cards con foto, barra de carrito flotante) — la convención
que usan PedidosYa / Rappi — pero con la identidad propia de la marca
(brasa, no el rojo genérico de plataforma) y pensado para verse bien
tanto en el celular como en una PC de mostrador.

Paleta:
bg #FAF8F5 (fondo general, claro)
bg-panel #FFFFFF (cards)
borde #EDE6DB
brasa #E8541F (acento principal)
brasa-op #C43B14 (hover / activo)
tinta #221A14 (texto principal)
humo #756B5E (texto secundario)

Tipografía: display "Anton" (marca), cuerpo "Inter", precios/comanda
"JetBrains Mono" (solo en el panel de cocina).
========================================================================= */

const FONTS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
`;

const SEED_MENU = [
  {
    cat: "Burgers",
    icon: "🍔",
    items: [
      { id: "b1", name: "Clásica Valdez", desc: "2 medallones smash, cheddar, cebolla caramelizada, salsa de la casa", price: 6800 },
      { id: "b2", name: "Doble Brasa", desc: "2 medallones, panceta ahumada, cheddar, BBQ", price: 8200 },
      { id: "b3", name: "Criolla", desc: "medallón 180g, chorizo, morrón asado, provoleta", price: 7900 },
      { id: "b4", name: "Pollo Crocante", desc: "milanesa de pollo, coleslaw, mayo picante", price: 6900 },
      { id: "b5", name: "Veggie", desc: "medallón de garbanzo y remolacha, rúcula, alioli", price: 6500 },
    ],
  },
  {
    cat: "Acompañamientos",
    icon: "🍟",
    items: [
      { id: "s1", name: "Papas Valdez", desc: "cheddar, panceta, cebolla crispy", price: 4200 },
      { id: "s2", name: "Papas clásicas", desc: "con nuestra sal ahumada", price: 2800 },
      { id: "s3", name: "Aros de cebolla", desc: "6 unidades, salsa ranch", price: 3400 },
    ],
  },
  {
    cat: "Bebidas",
    icon: "🥤",
    items: [
      { id: "d1", name: "Gaseosa línea Coca-Cola 500ml", desc: "", price: 2100 },
      { id: "d2", name: "Agua saborizada", desc: "", price: 1800 },
      { id: "d3", name: "Cerveza artesanal IPA", desc: "473ml", price: 3200 },
    ],
  },
];

const CATEGORY_ICONS = { Burgers: "🍔", Acompañamientos: "🍟", Bebidas: "🥤", Combos: "🎁" };
function categoryIcon(cat) {
  return CATEGORY_ICONS[cat] || "🍽️";
}

function buildSeedItems() {
  const rows = [];
  let order = 0;
  SEED_MENU.forEach((section) => {
    section.items.forEach((it) => {
      rows.push({
        id: it.id, category: section.cat, name: it.name,
        description: it.desc || "", price: it.price, image_url: null, sort_order: order++,
      });
    });
  });
  return rows;
}

function groupItems(items) {
  const order = [];
  const map = {};
  items.forEach((it) => {
    if (!map[it.category]) { map[it.category] = []; order.push(it.category); }
    map[it.category].push(it);
  });
  return order.map((cat) => ({ cat, icon: categoryIcon(cat), items: map[cat] }));
}

const WHATSAPP = "5491137994287";
const ALIAS = "valdzburger";
const KITCHEN_PASS = "valdez2026";
const ADMIN_PASS = "valdezfotos2026";

// Alias de Mercado Pago para que el cliente transfiera directo desde la app de MP.
const MP_ALIAS = "cruza.cedo.cuis.mp";

function money(n) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1108, 1318];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.14);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.4);
    });
  } catch (e) {}
}

/* ---------------------------------------------------------------------
Capa de almacenamiento.
Si conectaste Supabase (ver README.md), los pedidos y las fotos del
menú se guardan en una base de datos compartida de verdad: un pedido
hecho desde el celular de un cliente aparece al toque en tu PC.
Si todavía no lo conectaste, se usa localStorage como respaldo (para
que la app no se rompa) — pero eso NO comparte datos entre
dispositivos, cada navegador ve solo lo suyo.
window.storage solo existe adentro de Claude (para probar la app acá).
--------------------------------------------------------------------- */

const hasSupabase = !!supabase;
const hasClaudeStorage = typeof window !== "undefined" && !!window.storage;

async function storageGet(key, shared) {
  if (hasClaudeStorage) {
    try {
      const r = await window.storage.get(key, shared);
      return r ? r.value : null;
    } catch {
      return null;
    }
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key, value, shared) {
  if (hasClaudeStorage) {
    try {
      await window.storage.set(key, value, shared);
    } catch (e) {
      console.error("Storage error", e);
    }
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.error("Storage error", e);
  }
}

function rowToOrder(row) {
  return {
    id: row.id, items: row.items, total: row.total, customer: row.customer, status: row.status,
    createdAt: row.created_at, orderNumber: row.order_number || null,
    timestamps: row.timestamps || { Nuevo: row.created_at, "En preparación": null, Listo: null, "En camino": null, Entregado: null },
    courierLat: row.courier_lat ?? null, courierLng: row.courier_lng ?? null, courierUpdatedAt: row.courier_updated_at ?? null,
    deliveryCode: row.delivery_code || null,
  };
}

function genDeliveryCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function getNextOrderNumber() {
  const list = await getOrders();
  const numbers = list.map((o) => o.orderNumber || 0).filter((n) => typeof n === "number");
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

async function getOrders() {
  if (hasSupabase) {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data.map(rowToOrder);
  }
  const v = await storageGet("orders-all", true);
  try { return v ? JSON.parse(v) : []; } catch { return []; }
}

async function saveOrders(list) {
  // solo se usa en el modo de respaldo (sin Supabase)
  await storageSet("orders-all", JSON.stringify(list), true);
}

async function insertOrder(order) {
  if (hasSupabase) {
    const { error } = await supabase.from("orders").insert({
      id: order.id, items: order.items, total: order.total,
      customer: order.customer, status: order.status, created_at: order.createdAt,
      order_number: order.orderNumber, timestamps: order.timestamps, delivery_code: order.deliveryCode,
    });
    if (error) console.error(error);
    return;
  }
  const list = await getOrders();
  await saveOrders([order, ...list]);
}

async function updateOrderStatus(id, status, timestamps) {
  if (hasSupabase) {
    const { error } = await supabase.from("orders").update({ status, timestamps }).eq("id", id);
    if (error) console.error(error);
    return;
  }
  const list = await getOrders();
  await saveOrders(list.map((o) => (o.id === id ? { ...o, status, timestamps } : o)));
}

async function getOrderById(id) {
  if (hasSupabase) {
    const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
    if (error) { console.error(error); return null; }
    return rowToOrder(data);
  }
  const list = await getOrders();
  return list.find((o) => o.id === id) || null;
}

async function updateCourierLocation(id, lat, lng) {
  if (!hasSupabase) return; // el seguimiento en vivo necesita base de datos compartida
  const { error } = await supabase
    .from("orders")
    .update({ courier_lat: lat, courier_lng: lng, courier_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error(error);
}

// Convierte una dirección de texto en coordenadas usando Nominatim (OpenStreetMap),
// gratis y sin API key.
async function geocodeAddress(address) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${encodeURIComponent(address)}`
    );
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error(e);
  }
  return null;
}

async function getMenuItems() {
  if (hasSupabase) {
    let { data, error } = await supabase.from("menu_items").select("*").order("sort_order", { ascending: true });
    if (error) { console.error(error); return buildSeedItems(); }
    if (!data || data.length === 0) {
      const seed = buildSeedItems();
      await supabase.from("menu_items").insert(seed);
      const res = await supabase.from("menu_items").select("*").order("sort_order", { ascending: true });
      data = res.data;
    }
    return data || buildSeedItems();
  }
  const v = await storageGet("menu-items", true);
  try {
    const parsed = v ? JSON.parse(v) : null;
    return parsed && parsed.length ? parsed : buildSeedItems();
  } catch {
    return buildSeedItems();
  }
}

async function saveLocalMenuItems(list) {
  await storageSet("menu-items", JSON.stringify(list), true);
}

async function upsertMenuItem(item) {
  if (hasSupabase) {
    const { error } = await supabase.from("menu_items").upsert(item);
    if (error) console.error(error);
    return;
  }
  const list = await getMenuItems();
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item; else list.push(item);
  await saveLocalMenuItems(list);
}

async function deleteMenuItemRow(id) {
  if (hasSupabase) {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) console.error(error);
    return;
  }
  const list = await getMenuItems();
  await saveLocalMenuItems(list.filter((x) => x.id !== id));
}

async function getProfile() {
  const v = await storageGet("my-profile", false);
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}

async function saveProfile(p) {
  await storageSet("my-profile", JSON.stringify(p), false);
}

const STATUS_FLOW = ["Nuevo", "En preparación", "Listo", "En camino", "Entregado"];
const STATUS_COLOR = { Nuevo: "#E8541F", "En preparación": "#D6A233", Listo: "#4C9A6A", "En camino": "#3E7CB1", Entregado: "#8A8073" };
const STATUS_EMOJI = { Nuevo: "✅", "En preparación": "🍳", Listo: "📦", "En camino": "🛵", Entregado: "🏠" };

function getUrlParams() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return { courier: p.get("courier"), pedido: p.get("pedido") };
}

// Carga Leaflet (mapa) desde CDN una sola vez, sin tocar index.html.
function useLeaflet() {
  const [ready, setReady] = useState(typeof window !== "undefined" && !!window.L);
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setReady(true);
      document.body.appendChild(script);
    } else {
      const t = setInterval(() => { if (window.L) { setReady(true); clearInterval(t); } }, 300);
      return () => clearInterval(t);
    }
  }, []);
  return ready;
}

export default function ValdezBurger() {
  const urlParams = useMemo(() => getUrlParams(), []);
  const [view, setView] = useState(() => (urlParams.courier ? "courier-share" : "store"));
  const [cart, setCart] = useState([]);
  const [profile, setProfile] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);

  const reloadItems = useCallback(() => {
    getMenuItems().then((list) => {
      setItems(list);
      setActiveCat((prev) => (prev && list.some((it) => it.category === prev)) ? prev : (list[0]?.category || null));
    });
  }, []);

  useEffect(() => { getProfile().then(setProfile); }, []);
  useEffect(() => { reloadItems(); }, [reloadItems]);

  // Seguimiento persistente: si hay un pedido activo guardado (y no está
  // ya en la vista del repartidor), lo retomamos automáticamente.
  useEffect(() => {
    if (urlParams.courier) return;
    storageGet("active-order-id", false).then(async (id) => {
      if (!id) return;
      const o = await getOrderById(id);
      if (!o) { storageSet("active-order-id", "", false); return; }
      if (o.status === "Entregado") { storageSet("active-order-id", "", false); return; }
      setLastOrder(o);
      setView("confirm");
    });
  }, [urlParams.courier]);

  const sections = useMemo(() => groupItems(items), [items]);

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1600); };

  const addToCart = (item) => {
    setCart((c) => {
      const found = c.find((x) => x.id === item.id);
      if (found) return c.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { id: item.id, qty: 1 }];
    });
    flashToast(`${item.name} agregada`);
  };

  const changeQty = (id, delta) => {
    setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: x.qty + delta } : x)).filter((x) => x.qty > 0));
  };

  const cartLines = cart.map((c) => ({ ...c, item: items.find((i) => i.id === c.id) })).filter((l) => l.item);
  const total = cartLines.reduce((s, l) => s + l.item.price * l.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <div style={styles.app}>
      <style>{FONTS_CSS}{GLOBAL_CSS}</style>

      {view === "store" && (
        <TopBar query={query} setQuery={setQuery} cartCount={cartCount} onCart={() => setView("cart")} />
      )}

      {view === "store" && (
        <Store
          query={query}
          sections={sections}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          onAdd={addToCart}
          cartCount={cartCount}
          cartTotal={total}
          onCart={() => setView("cart")}
        />
      )}

      {view === "cart" && (
        <OrderPanel
          heading="Tu pedido"
          lines={cartLines}
          total={total}
          onBack={() => setView("store")}
          backLabel="Seguir eligiendo"
        >
          {cartLines.length === 0 && <p style={styles.emptyText}>Todavía no agregaste nada.</p>}
          {cartLines.map((l) => (
            <LineRow key={l.id} qty={l.qty} name={l.item.name} price={l.item.price * l.qty} onMinus={() => changeQty(l.id, -1)} onPlus={() => changeQty(l.id, 1)} />
          ))}
          {cartLines.length > 0 && (
            <button style={styles.primaryBtn} onClick={() => setView("checkout")}>Continuar</button>
          )}
        </OrderPanel>
      )}

      {view === "checkout" && (
        <Checkout
          lines={cartLines}
          total={total}
          profile={profile}
          onBack={() => setView("cart")}
          onConfirm={async (custom) => {
            const now = new Date().toISOString();
            const orderNumber = await getNextOrderNumber();
            const order = {
              id: uid().toUpperCase(),
              orderNumber,
              items: cartLines.map((l) => ({ name: l.item.name, price: l.item.price, qty: l.qty })),
              total,
              customer: custom,
              status: "Nuevo",
              createdAt: now,
              timestamps: { Nuevo: now, "En preparación": null, Listo: null, "En camino": null, Entregado: null },
              deliveryCode: genDeliveryCode(),
            };
            await insertOrder(order);
            await saveProfile(custom);
            await storageSet("active-order-id", order.id, false);
            setProfile(custom);
            setLastOrder(order);
            setCart([]);
            setView("confirm");
          }}
        />
      )}

      {view === "confirm" && lastOrder && (
        <Confirmation
          order={lastOrder}
          onNew={() => {
            storageSet("active-order-id", "", false);
            setView("store");
          }}
        />
      )}

      {view === "courier-share" && urlParams.courier && (
        <CourierShare orderId={urlParams.courier} />
      )}

      {(view === "store") && (
        <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
          <button style={styles.kitchenLink} onClick={() => setView("kitchen-login")}>Acceso cocina</button>
          <button style={styles.kitchenLink} onClick={() => setView("admin-login")}>Editar menú</button>
        </div>
      )}

      {view === "kitchen-login" && <KitchenLogin onOk={() => setView("kitchen")} onBack={() => setView("store")} />}
      {view === "kitchen" && <Kitchen onExit={() => setView("store")} />}

      {view === "admin-login" && (
        <AdminLogin onOk={() => setView("admin")} onBack={() => setView("store")} />
      )}
      {view === "admin" && (
        <AdminMenu
          onExit={() => {
            reloadItems();
            setView("store");
          }}
        />
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

/* ---------------------------- TOP BAR ---------------------------- */
function TopBar({ query, setQuery, cartCount, onCart }) {
  return (
    <div style={styles.topBar}>
      <div style={styles.topBarInner}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>VZ</span>
          <span style={styles.brandName}>VALD'Z BURGER</span>
        </div>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>⌕</span>
          <input
            style={styles.searchInput}
            placeholder="Buscar en el menú…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button style={styles.cartBtn} onClick={onCart}>
          🛒 Pedido {cartCount > 0 && <span style={styles.cartBadge}>{cartCount}</span>}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- STORE ---------------------------- */
function Store({ query, sections, activeCat, setActiveCat, onAdd, cartCount, cartTotal, onCart }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.map((section) => ({
      ...section,
      items: section.items.filter(
        (it) => !q || it.name.toLowerCase().includes(q) || (it.description || "").toLowerCase().includes(q)
      ),
    })).filter((section) => section.items.length > 0);
  }, [query, sections]);

  return (
    <div style={styles.storeWrap}>
      <div style={styles.hero}>
        <div style={styles.heroEyebrow}>SMASH BURGERS & COMBOS</div>
        <h1 style={styles.heroTitle}>PEDÍ TU BURGER FAVORITA</h1>
      </div>

      {sections.length === 0 && <p style={styles.emptyText}>Cargando menú…</p>}

      {!query && sections.length > 0 && (
        <div style={styles.tabsRow}>
          {sections.map((s) => (
            <button
              key={s.cat}
              style={{ ...styles.tab, ...(activeCat === s.cat ? styles.tabActive : {}) }}
              onClick={() => setActiveCat(s.cat)}
            >
              <span style={{ marginRight: 6 }}>{s.icon}</span>{s.cat}
            </button>
          ))}
        </div>
      )}

      {filtered
        .filter((s) => query || s.cat === activeCat)
        .map((section) => (
          <div key={section.cat} style={styles.section}>
            {query && <h2 style={styles.sectionTitle}>{section.icon} {section.cat}</h2>}
            <div style={styles.grid}>
              {section.items.map((item) => (
                <div key={item.id} style={styles.card}>
                  <div
                    style={{
                      ...styles.cardImg,
                      background: item.image_url ? `center 35% / cover no-repeat url(${item.image_url})` : imgGradient(section.cat),
                    }}
                  >
                    {!item.image_url && <span style={styles.cardEmoji}>{section.icon}</span>}
                    <button style={styles.cardAddFab} onClick={() => onAdd(item)}>+</button>
                  </div>
                  <div style={styles.cardBody}>
                    <h3 style={styles.cardName}>{item.name}</h3>
                    {item.description && <p style={styles.cardDesc}>{item.description}</p>}
                    <span style={styles.cardPrice}>{money(item.price)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {sections.length > 0 && filtered.every((s) => s.items.length === 0) && (
        <p style={styles.emptyText}>No encontramos nada con “{query}”.</p>
      )}

      {cartCount > 0 && (
        <button style={styles.floatingCartBar} onClick={onCart}>
          <span>🛒 {cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
          <span>{money(cartTotal)} · Ver pedido ›</span>
        </button>
      )}
    </div>
  );
}

function imgGradient(cat) {
  if (cat === "Burgers") return "linear-gradient(135deg,#F3B27A,#E8541F)";
  if (cat === "Acompañamientos") return "linear-gradient(135deg,#F6D68A,#D6A233)";
  return "linear-gradient(135deg,#8FCBB0,#3F8F6B)";
}

/* ---------------------------- ORDER PANEL (carrito / resumen) ---------------------------- */
function OrderPanel({ heading, lines, total, onBack, backLabel, children }) {
  return (
    <div style={styles.panelWrap}>
      <button style={styles.backLink} onClick={onBack}>‹ {backLabel}</button>
      <div style={styles.card2}>
        <h2 style={styles.panelHeading}>{heading}</h2>
        {children}
        {lines.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.totalRow}><span>Total</span><span>{money(total)}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function LineRow({ qty, name, price, onMinus, onPlus }) {
  return (
    <div style={styles.lineRow}>
      <div style={styles.lineName}>{name}</div>
      <div style={styles.lineRight}>
        <div style={styles.qtyStepper}>
          <button style={styles.qtyBtn} onClick={onMinus}>–</button>
          <span style={{ minWidth: 16, textAlign: "center", fontSize: 13 }}>{qty}</span>
          <button style={styles.qtyBtn} onClick={onPlus}>+</button>
        </div>
        <span style={styles.linePrice}>{money(price)}</span>
      </div>
    </div>
  );
}

/* ---------------------------- CHECKOUT ---------------------------- */
function Checkout({ lines, total, profile, onBack, onConfirm }) {
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address || "");
  const [payment, setPayment] = useState("transferencia");
  const [notes, setNotes] = useState("");
  const [mpLoading, setMpLoading] = useState(false);
  const [mpError, setMpError] = useState("");

  const canSend = name.trim() && phone.trim() && address.trim();

  const payWithMercadoPago = async () => {
    if (!hasSupabase) {
      setMpError("Conectá Supabase para poder cobrar con Mercado Pago (ver README.md).");
      return;
    }
    setMpError("");
    setMpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-mp-preference", {
        body: {
          items: lines.map((l) => ({ name: l.item.name, qty: l.qty, price: l.item.price })),
          orderId: uid().toUpperCase(),
        },
      });
      if (error || !data?.init_point) {
        setMpError("No se pudo iniciar el pago. Probá de nuevo en un momento.");
        return;
      }
      window.location.href = data.init_point;
    } catch (e) {
      setMpError("No se pudo iniciar el pago. Probá de nuevo en un momento.");
    } finally {
      setMpLoading(false);
    }
  };

  return (
    <div style={styles.panelWrap}>
      <button style={styles.backLink} onClick={onBack}>‹ Volver al pedido</button>
      <div style={styles.card2}>
        <h2 style={styles.panelHeading}>Datos de entrega</h2>
        <Field label="Nombre y apellido" value={name} onChange={setName} placeholder="Cómo te llamamos" />
        <Field label="Teléfono" value={phone} onChange={setPhone} placeholder="11 xxxx xxxx" />
        <Field label="Dirección de envío" value={address} onChange={setAddress} placeholder="Calle, número, piso/depto" />
        <Field label="Aclaraciones (opcional)" value={notes} onChange={setNotes} placeholder="Sin cebolla, timbre roto, etc." />

        <div style={{ marginTop: 14 }}>
          <div style={styles.fieldLabel}>Método de pago</div>
          <div style={styles.payRow}>
            <label style={styles.payOption}>
              <input type="radio" checked={payment === "transferencia"} onChange={() => setPayment("transferencia")} /> Transferencia
            </label>
            <label style={styles.payOption}>
              <input type="radio" checked={payment === "mercadopago"} onChange={() => setPayment("mercadopago")} /> Mercado Pago
            </label>
            <label style={styles.payOption}>
              <input type="radio" checked={payment === "efectivo"} onChange={() => setPayment("efectivo")} /> Efectivo
            </label>
          </div>

          {payment === "transferencia" && (
            <div style={styles.aliasBox}>Alias: <b>{ALIAS}</b> — enviá el comprobante por WhatsApp al confirmar.</div>
          )}

          {payment === "mercadopago" && (
            <div style={styles.aliasBox}>
              Tocá el botón para pagar {money(total)} directo en Mercado Pago (tarjeta, saldo o transferencia).
              <button style={styles.mpBtn} onClick={payWithMercadoPago} disabled={mpLoading || lines.length === 0}>
                {mpLoading ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
              </button>
              {mpError && <div style={styles.errText}>{mpError}</div>}
              <div style={{ marginTop: 6 }}>
                O transferí directo al alias <b>{MP_ALIAS}</b> y enviá el comprobante por WhatsApp al confirmar.
              </div>
            </div>
          )}
        </div>

        <div style={styles.divider} />
        <div style={styles.totalRow}><span>Total</span><span>{money(total)}</span></div>
      </div>

      <button
        style={{ ...styles.primaryBtn, opacity: canSend ? 1 : 0.5 }}
        disabled={!canSend}
        onClick={() => canSend && onConfirm({ name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim(), payment })}
      >
        Confirmar pedido
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.fieldLabel}>{label}</div>
      <input style={styles.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------------------------- CONFIRMATION ---------------------------- */
function Confirmation({ order, onNew }) {
  const [live, setLive] = useState(order);
  const waMsg = encodeURIComponent(
    `Hola! Soy ${order.customer.name}, hice el pedido #${order.orderNumber || order.id} (${money(order.total)}, ${order.customer.payment}). Dirección: ${order.customer.address}`
  );

  useEffect(() => {
    const t = setInterval(async () => {
      const list = await getOrders();
      const fresh = list.find((o) => o.id === order.id);
      if (fresh) {
        setLive(fresh);
        if (fresh.status === "Entregado") storageSet("active-order-id", "", false);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [order.id]);

  return (
    <div style={styles.panelWrap}>
      <div style={styles.card2}>
        <div style={styles.confirmBadge}>✓</div>
        <h2 style={styles.panelHeading}>Pedido #{live.orderNumber || live.id}</h2>
        <p style={styles.emptyText}>Lo estamos preparando — acá abajo vas a ver el estado en vivo.</p>

        <div style={{ margin: "16px 0" }}>
          {STATUS_FLOW.map((status, idx) => {
            const reached = idx <= STATUS_FLOW.indexOf(live.status);
            return (
              <div key={status}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: reached ? 1 : 0.4 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: reached ? STATUS_COLOR[status] : "#E0D5C7",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}>
                    {STATUS_EMOJI[status]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{status}</div>
                    {live.timestamps && live.timestamps[status] && (
                      <div style={{ fontSize: 11.5, color: HUMO }}>
                        {new Date(live.timestamps[status]).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </div>
                {idx < STATUS_FLOW.length - 1 && (
                  <div style={{ marginLeft: 17, height: 20, borderLeft: "2px solid #E0D5C7" }} />
                )}
              </div>
            );
          })}
        </div>

        {live.status === "En camino" && (
          <div style={{ marginBottom: 14 }}>
            {live.deliveryCode && (
              <div style={{ ...styles.aliasBox, textAlign: "center", marginBottom: 10 }}>
                Cuando llegue el repartidor, dale este código para confirmar la entrega:
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, color: BRASA, marginTop: 4 }}>
                  {live.deliveryCode}
                </div>
              </div>
            )}
            <CourierMapView lat={live.courierLat} lng={live.courierLng} />
          </div>
        )}

        <div style={styles.divider} />
        {order.items.map((it, i) => (
          <div key={i} style={styles.lineRow}>
            <div style={styles.lineName}>{it.qty}× {it.name}</div>
            <span style={styles.linePrice}>{money(it.price * it.qty)}</span>
          </div>
        ))}
        <div style={styles.divider} />
        <div style={styles.totalRow}><span>Total</span><span>{money(order.total)}</span></div>
      </div>
      <a style={styles.primaryBtn} href={`https://wa.me/${WHATSAPP}?text=${waMsg}`} target="_blank" rel="noreferrer">
        Enviar comprobante por WhatsApp
      </a>
      <button style={styles.secondaryBtn} onClick={onNew}>Hacer otro pedido</button>
    </div>
  );
}

/* ---------------------------- KITCHEN ---------------------------- */
function KitchenLogin({ onOk, onBack }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  return (
    <div style={styles.panelWrap}>
      <button style={styles.backLink} onClick={onBack}>‹ Volver a la tienda</button>
      <div style={styles.card2}>
        <div style={styles.fieldLabel}>Clave de cocina</div>
        <input
          style={styles.input}
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (pass === KITCHEN_PASS ? onOk() : setErr(true))}
        />
        {err && <div style={styles.errText}>Clave incorrecta.</div>}
        <button style={styles.primaryBtn} onClick={() => (pass === KITCHEN_PASS ? onOk() : setErr(true))}>Entrar</button>
      </div>
    </div>
  );
}

function AdminLogin({ onOk, onBack }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  return (
    <div style={styles.panelWrap}>
      <button style={styles.backLink} onClick={onBack}>‹ Volver a la tienda</button>
      <div style={styles.card2}>
        <h2 style={styles.panelHeading}>Editar fotos del menú</h2>
        <div style={styles.fieldLabel}>Clave</div>
        <input
          style={styles.input}
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (pass === ADMIN_PASS ? onOk() : setErr(true))}
        />
        {err && <div style={styles.errText}>Clave incorrecta.</div>}
        <button style={styles.primaryBtn} onClick={() => (pass === ADMIN_PASS ? onOk() : setErr(true))}>Entrar</button>
      </div>
    </div>
  );
}

function AdminMenu({ onExit }) {
  const [rows, setRows] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [draftNew, setDraftNew] = useState({ category: "", name: "", description: "", price: "", image_url: "" });
  const [addingFlash, setAddingFlash] = useState(false);

  const reload = () => getMenuItems().then(setRows);
  useEffect(() => { reload(); }, []);

  const updateRow = (id, field, value) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row) => {
    await upsertMenuItem({ ...row, price: Number(row.price) || 0 });
    setSavedId(row.id);
    setTimeout(() => setSavedId(null), 1200);
  };

  const removeRow = async (id) => {
    await deleteMenuItemRow(id);
    setRows((list) => list.filter((r) => r.id !== id));
  };

  const addNew = async () => {
    if (!draftNew.category.trim() || !draftNew.name.trim() || !draftNew.price) return;
    const maxOrder = rows && rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) : 0;
    const item = {
      id: uid(),
      category: draftNew.category.trim(),
      name: draftNew.name.trim(),
      description: draftNew.description.trim(),
      price: Number(draftNew.price) || 0,
      image_url: draftNew.image_url.trim() || null,
      sort_order: maxOrder + 1,
    };
    await upsertMenuItem(item);
    setRows((list) => [...(list || []), item]);
    setDraftNew({ category: draftNew.category, name: "", description: "", price: "", image_url: "" });
    setAddingFlash(true);
    setTimeout(() => setAddingFlash(false), 1200);
  };

  const grouped = rows ? groupItems(rows) : [];

  return (
    <div style={styles.panelWrap}>
      <button style={styles.backLink} onClick={onExit}>‹ Volver a la tienda</button>

      <div style={styles.card2}>
        <h2 style={styles.panelHeading}>Agregar producto o combo</h2>
        <Field label="Categoría (Burgers, Combos, Bebidas...)" value={draftNew.category} onChange={(v) => setDraftNew((d) => ({ ...d, category: v }))} placeholder="Ej: Combos" />
        <Field label="Nombre" value={draftNew.name} onChange={(v) => setDraftNew((d) => ({ ...d, name: v }))} placeholder="Ej: Combo Doble Brasa" />
        <Field label="Descripción" value={draftNew.description} onChange={(v) => setDraftNew((d) => ({ ...d, description: v }))} placeholder="Ej: burger + papas + bebida" />
        <Field label="Precio" value={draftNew.price} onChange={(v) => setDraftNew((d) => ({ ...d, price: v.replace(/[^0-9]/g, "") }))} placeholder="Ej: 9500" />
        <Field label="Foto (link, opcional)" value={draftNew.image_url} onChange={(v) => setDraftNew((d) => ({ ...d, image_url: v }))} placeholder="https://…" />
        <button style={styles.primaryBtn} onClick={addNew}>
          {addingFlash ? "Agregado ✓" : "+ Agregar al menú"}
        </button>
      </div>

      {!rows && <p style={{ ...styles.emptyText, marginTop: 16 }}>Cargando…</p>}

      {grouped.map((section) => (
        <div key={section.cat} style={{ ...styles.card2, marginTop: 16 }}>
          <h2 style={styles.panelHeading}>{section.icon} {section.cat}</h2>
          {section.items.map((row) => (
            <div key={row.id} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${BG}` }}>
              <Field label="Nombre" value={row.name} onChange={(v) => updateRow(row.id, "name", v)} />
              <Field label="Descripción" value={row.description || ""} onChange={(v) => updateRow(row.id, "description", v)} />
              <Field label="Precio" value={String(row.price)} onChange={(v) => updateRow(row.id, "price", v.replace(/[^0-9]/g, ""))} />
              <Field label="Categoría" value={row.category} onChange={(v) => updateRow(row.id, "category", v)} />
              <Field label="Foto (link)" value={row.image_url || ""} onChange={(v) => updateRow(row.id, "image_url", v)} placeholder="https://…" />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button style={styles.printBtn} onClick={() => saveRow(row)}>
                  {savedId === row.id ? "Guardado ✓" : "Guardar cambios"}
                </button>
                <button style={{ ...styles.printBtn, color: BRASA, borderColor: BRASA }} onClick={() => removeRow(row.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Kitchen({ onExit }) {
  const [orders, setOrders] = useState([]);
  const [printJob, setPrintJob] = useState(null); // { order, type: 'cocina' | 'factura' }
  const prevCount = useRef(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!printJob) return;
    const t = setTimeout(() => {
      window.print();
      setPrintJob(null);
    }, 150);
    return () => clearTimeout(t);
  }, [printJob]);

  const refresh = useCallback(async () => {
    const list = await getOrders();
    if (!firstLoad.current && list.length > prevCount.current) playChime();
    prevCount.current = list.length;
    firstLoad.current = false;
    setOrders(list);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const advance = async (id) => {
    const current = orders.find((o) => o.id === id);
    if (!current) return;
    const idx = STATUS_FLOW.indexOf(current.status);
    const nextStatus = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)];
    const timestamps = { ...current.timestamps, [nextStatus]: new Date().toISOString() };
    await updateOrderStatus(id, nextStatus, timestamps);
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, status: nextStatus, timestamps } : o)));
  };

  const active = orders.filter((o) => o.status !== "Entregado");
  const done = orders.filter((o) => o.status === "Entregado");

  return (
    <div style={styles.kitchenWrap}>
      <style>{PRINT_CSS}</style>
      {!hasSupabase && (
        <div style={styles.warnBox}>
          ⚠ Todavía no está conectada la base de datos (Supabase): los pedidos hechos desde el
          celular de un cliente no van a aparecer acá hasta que la conectes (ver README.md).
        </div>
      )}
      <div style={styles.kitchenHeader}>
        <span style={styles.brandName}>COCINA · VALD'Z BURGER</span>
        <button style={styles.backLink} onClick={onExit}>Salir</button>
      </div>

      {active.length === 0 && <p style={styles.emptyText}>No hay pedidos pendientes.</p>}

      <div style={styles.kitchenGrid}>
        {active.map((o) => (
          <div key={o.id} style={styles.ticket}>
            <div style={styles.ticketHeaderRow}>
              <span>Pedido #{o.orderNumber || o.id}</span>
              <span>{new Date(o.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div style={styles.ticketDivider} />
            {o.items.map((it, i) => (
              <div key={i} style={styles.ticketLine}>{it.qty}× {it.name} — {money(it.price * it.qty)}</div>
            ))}
            <div style={styles.ticketDivider} />
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              <div><b>{o.customer.name}</b> · {o.customer.phone}</div>
              <div>{o.customer.address}</div>
              {o.customer.notes && <div>Nota: {o.customer.notes}</div>}
              <div>Pago: {o.customer.payment} · Total: {money(o.total)}</div>
            </div>
            <div style={styles.ticketDivider} />
            <button style={{ ...styles.statusBtn, background: STATUS_COLOR[o.status] }} onClick={() => advance(o.id)}>
              {o.status} — tocar para avanzar
            </button>
            <div style={styles.printRow}>
              <button style={styles.printBtn} onClick={() => setPrintJob({ order: o, type: "cocina" })}>🖨 Comanda</button>
              <button style={styles.printBtn} onClick={() => setPrintJob({ order: o, type: "factura" })}>🖨 Factura</button>
            </div>
            {(o.status === "Listo" || o.status === "En camino") && (
              <a
                style={{ ...styles.printBtn, display: "block", textAlign: "center", textDecoration: "none", width: "100%", marginTop: 8, boxSizing: "border-box" }}
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Pedido #${o.orderNumber || o.id} — ${o.customer.name}, ${o.customer.address}. Abrí este link para navegar y compartir tu ubicación: ${window.location.origin}${window.location.pathname}?courier=${o.id}`
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                📍 Enviar al repartidor por WhatsApp
              </a>
            )}
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h3 style={{ ...styles.sectionTitle, marginTop: 24 }}>Entregados hoy ({done.length})</h3>
          <div style={styles.doneList}>
            {done.map((o) => (
              <div key={o.id} style={styles.doneRow}>#{o.id} · {o.customer.name} · {money(o.total)}</div>
            ))}
          </div>
        </>
      )}

      {printJob && <PrintArea order={printJob.order} type={printJob.type} />}
    </div>
  );
}

function PrintArea({ order, type }) {
  return (
    <div id="print-area">
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, width: 280 }}>
        <div style={{ textAlign: "center", fontWeight: 700 }}>VALD'Z BURGER</div>
        <div style={{ textAlign: "center", fontSize: 11 }}>
          {type === "cocina" ? "COMANDA DE COCINA" : "FACTURA / COMPROBANTE"}
        </div>
        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div>Pedido #{order.orderNumber || order.id}</div>
        <div>{new Date(order.createdAt).toLocaleString("es-AR")}</div>
        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        {order.items.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{it.qty}× {it.name}</span>
            {type === "factura" && <span>{money(it.price * it.qty)}</span>}
          </div>
        ))}
        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        {type === "factura" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>TOTAL</span><span>{money(order.total)}</span>
            </div>
            <div>Pago: {order.customer.payment}</div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          </>
        )}
        <div>Cliente: {order.customer.name}</div>
        <div>Tel: {order.customer.phone}</div>
        <div>Dirección: {order.customer.address}</div>
        {order.customer.notes && <div>Nota: {order.customer.notes}</div>}
      </div>
    </div>
  );
}

/* ---------------------------- MAPA EN VIVO (cliente) ---------------------------- */
function CourierMapView({ lat, lng }) {
  const ready = useLeaflet();
  const mapDivRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!ready || !mapDivRef.current || lat == null || lng == null) return;
    if (!mapObjRef.current) {
      mapObjRef.current = window.L.map(mapDivRef.current).setView([lat, lng], 15);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(mapObjRef.current);
      markerRef.current = window.L.marker([lat, lng]).addTo(mapObjRef.current).bindPopup("Repartidor");
    } else {
      markerRef.current.setLatLng([lat, lng]);
      mapObjRef.current.setView([lat, lng]);
    }
  }, [ready, lat, lng]);

  if (!ready) return <p style={styles.emptyText}>Cargando mapa…</p>;
  if (lat == null || lng == null) return <p style={styles.emptyText}>Todavía no hay ubicación del repartidor.</p>;
  return <div ref={mapDivRef} style={{ height: 260, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }} />;
}

/* ---------------------------- MAPA DE NAVEGACIÓN (repartidor) ---------------------------- */
function CourierNavMap({ destLat, destLng, lat, lng }) {
  const ready = useLeaflet();
  const mapDivRef = useRef(null);
  const mapObjRef = useRef(null);
  const destMarkerRef = useRef(null);
  const meMarkerRef = useRef(null);

  useEffect(() => {
    if (!ready || !mapDivRef.current) return;
    if (!mapObjRef.current) {
      const center = destLat != null ? [destLat, destLng] : lat != null ? [lat, lng] : [-34.6, -58.4];
      mapObjRef.current = window.L.map(mapDivRef.current).setView(center, 14);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(mapObjRef.current);
    }
    if (destLat != null && destLng != null) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = window.L.marker([destLat, destLng]).addTo(mapObjRef.current).bindPopup("Dirección de entrega");
      } else {
        destMarkerRef.current.setLatLng([destLat, destLng]);
      }
    }
    if (lat != null && lng != null) {
      if (!meMarkerRef.current) {
        meMarkerRef.current = window.L.circleMarker([lat, lng], { radius: 8, color: "#3E7CB1", fillColor: "#3E7CB1", fillOpacity: 0.9 })
          .addTo(mapObjRef.current)
          .bindPopup("Vos");
      } else {
        meMarkerRef.current.setLatLng([lat, lng]);
      }
    }
    if (destLat != null && lat != null) {
      mapObjRef.current.fitBounds(window.L.latLngBounds([[destLat, destLng], [lat, lng]]), { padding: [30, 30] });
    }
  }, [ready, destLat, destLng, lat, lng]);

  if (!ready) return <p style={styles.emptyText}>Cargando mapa…</p>;
  return <div ref={mapDivRef} style={{ height: 280, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }} />;
}

/* ---------------------------- VISTA DEL REPARTIDOR ---------------------------- */
function CourierShare({ orderId }) {
  const [order, setOrder] = useState(null);
  const [dest, setDest] = useState(null);
  const [geoStatus, setGeoStatus] = useState("loading");
  const [sharing, setSharing] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [lastCoords, setLastCoords] = useState(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [delivered, setDelivered] = useState(false);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    getOrderById(orderId).then((o) => {
      setOrder(o);
      if (o) {
        if (o.status === "Entregado") setDelivered(true);
        geocodeAddress(o.customer.address).then((coords) => {
          if (coords) { setDest(coords); setGeoStatus("ok"); }
          else setGeoStatus("failed");
        });
      }
    });
  }, [orderId]);

  const startSharing = () => {
    if (!navigator.geolocation) {
      setErrMsg("Este navegador no soporta geolocalización.");
      return;
    }
    setErrMsg("");
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLastCoords({ lat: latitude, lng: longitude });
        const now = Date.now();
        if (now - lastSentRef.current > 6000) {
          lastSentRef.current = now;
          updateCourierLocation(orderId, latitude, longitude);
        }
      },
      (err) => setErrMsg("No pudimos acceder a tu ubicación: " + err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const stopSharing = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setSharing(false);
  };

  useEffect(() => () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  const confirmDelivery = async () => {
    if (!order) return;
    if (codeInput.trim() !== order.deliveryCode) {
      setCodeErr("El código no coincide. Confirmalo con el cliente.");
      return;
    }
    setCodeErr("");
    const now = new Date().toISOString();
    const timestamps = { ...order.timestamps, Entregado: now };
    await updateOrderStatus(order.id, "Entregado", timestamps);
    stopSharing();
    setDelivered(true);
  };

  const gmapsUrl = order
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer.address)}`
    : null;

  return (
    <div style={styles.panelWrap}>
      <div style={styles.card2}>
        <h2 style={styles.panelHeading}>Reparto — Pedido #{order?.orderNumber || orderId}</h2>
        {!order && <p style={styles.emptyText}>Cargando datos del pedido…</p>}

        {order && delivered ? (
          <>
            <div style={styles.confirmBadge}>✓</div>
            <p style={styles.emptyText}>Pedido marcado como entregado. ¡Gracias!</p>
          </>
        ) : order && (
          <>
            <div style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
              <div><b>{order.customer.name}</b> · {order.customer.phone}</div>
              <div>{order.customer.address}</div>
              {order.customer.notes && <div>Nota: {order.customer.notes}</div>}
            </div>

            <div style={{ marginBottom: 14 }}>
              {geoStatus === "loading" && <p style={styles.emptyText}>Ubicando la dirección de entrega…</p>}
              {geoStatus === "failed" && (
                <p style={styles.emptyText}>No pudimos ubicar la dirección automáticamente en el mapa, pero podés usar el botón de abajo para navegar igual.</p>
              )}
              <CourierNavMap destLat={dest?.lat} destLng={dest?.lng} lat={lastCoords?.lat} lng={lastCoords?.lng} />
            </div>

            {gmapsUrl && (
              <a style={{ ...styles.primaryBtn, background: TINTA, marginTop: 0 }} href={gmapsUrl} target="_blank" rel="noreferrer">
                🧭 Abrir en Google Maps — Cómo llegar
              </a>
            )}

            {!sharing ? (
              <button style={{ ...styles.primaryBtn, marginTop: 10 }} onClick={startSharing}>Empezar a compartir mi ubicación</button>
            ) : (
              <>
                <div style={{ ...styles.aliasBox, marginTop: 10, marginBottom: 10 }}>
                  Compartiendo ubicación en vivo{lastCoords ? ` · ${lastCoords.lat.toFixed(5)}, ${lastCoords.lng.toFixed(5)}` : "…"}
                </div>
                <button style={styles.secondaryBtn} onClick={stopSharing}>Dejar de compartir</button>
              </>
            )}
            {errMsg && <div style={styles.errText}>{errMsg}</div>}

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px dashed ${BORDER}` }}>
              <div style={styles.fieldLabel}>Confirmar entrega</div>
              <p style={{ ...styles.emptyText, marginBottom: 8 }}>Pedile al cliente el código de 4 dígitos y ponelo acá:</p>
              <input
                style={{ ...styles.input, textAlign: "center", fontSize: 20, letterSpacing: 4 }}
                value={codeInput}
                maxLength={4}
                inputMode="numeric"
                placeholder="0000"
                onChange={(e) => setCodeInput(e.target.value.replace(/[^0-9]/g, ""))}
              />
              {codeErr && <div style={styles.errText}>{codeErr}</div>}
              <button style={{ ...styles.primaryBtn, background: "#2F8B57" }} onClick={confirmDelivery}>
                Confirmar entrega
              </button>
            </div>

            <p style={{ ...styles.emptyText, marginTop: 14 }}>
              Dejá esta pestaña abierta mientras estás en camino — el cliente va a ver tu posición actualizarse sola.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================== ESTILOS ============================== */
const BG = "#FAF8F5";
const BORDER = "#EDE6DB";
const BRASA = "#E8541F";
const TINTA = "#221A14";
const HUMO = "#756B5E";

const GLOBAL_CSS = `
* { box-sizing: border-box; }
input:focus { outline: 2px solid ${BRASA}; outline-offset: 2px; }
button:focus-visible { outline: 2px solid ${BRASA}; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
::-webkit-scrollbar { height: 6px; }
`;

const PRINT_CSS = `
#print-area { display: none; }
@media print {
  body * { visibility: hidden; }
  #print-area, #print-area * { visibility: visible; }
  #print-area { display: block; position: absolute; top: 0; left: 0; }
}
`;

const styles = {
  app: { minHeight: "100vh", background: BG, color: TINTA, fontFamily: "'Inter', sans-serif", paddingBottom: 60 },
  topBar: { position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: `1px solid ${BORDER}`, boxShadow: "0 1px 0 rgba(0,0,0,0.03)" },
  topBarInner: { maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", flexWrap: "wrap" },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandMark: { fontFamily: "'Anton', sans-serif", background: BRASA, color: "#fff", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 },
  brandName: { fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: 0.5 },
  searchWrap: { flex: "1 1 220px", position: "relative", minWidth: 180 },
  searchIcon: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: HUMO, fontSize: 14 },
  searchInput: { width: "100%", padding: "9px 12px 9px 32px", borderRadius: 20, border: `1px solid ${BORDER}`, background: BG, fontSize: 13.5, fontFamily: "'Inter', sans-serif" },
  cartBtn: { background: BRASA, color: "#fff", border: "none", borderRadius: 20, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", position: "relative", whiteSpace: "nowrap" },
  cartBadge: { background: "#fff", color: BRASA, fontSize: 11, borderRadius: "50%", padding: "1px 6px", marginLeft: 6, fontWeight: 800 },
  storeWrap: { maxWidth: 1100, margin: "0 auto", padding: "0 20px" },
  floatingCartBar: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 16, maxWidth: 480, width: "calc(100% - 32px)", background: TINTA, color: "#fff", border: "none", borderRadius: 14, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 30 },
  hero: { padding: "28px 2px 6px" },
  heroEyebrow: { color: BRASA, fontSize: 12, fontWeight: 700, letterSpacing: 2 },
  heroTitle: { fontFamily: "'Anton', sans-serif", fontSize: 30, margin: "6px 0 4px", letterSpacing: 0.3 },
  tabsRow: { display: "flex", gap: 8, overflowX: "auto", padding: "12px 2px 18px", position: "sticky", top: 60, background: BG, zIndex: 10 },
  tab: { flex: "0 0 auto", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 20, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: TINTA, cursor: "pointer" },
  tabActive: { background: TINTA, color: "#fff", borderColor: TINTA },
  section: { marginTop: 6, marginBottom: 20 },
  sectionTitle: { fontFamily: "'Anton', sans-serif", fontSize: 16, letterSpacing: 0.5, color: BRASA, marginBottom: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 },
  card: { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" },
  cardImg: { position: "relative", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" },
  cardEmoji: { fontSize: 40 },
  cardAddFab: { position: "absolute", right: 10, bottom: -14, width: 32, height: 32, borderRadius: "50%", background: TINTA, color: "#fff", border: "3px solid #fff", fontSize: 18, lineHeight: "24px", cursor: "pointer" },
  cardBody: { padding: "20px 14px 14px" },
  cardName: { fontSize: 14.5, fontWeight: 700, margin: 0 },
  cardDesc: { color: HUMO, fontSize: 12, marginTop: 4, marginBottom: 8, lineHeight: 1.4, minHeight: 32 },
  cardPrice: { fontSize: 14, fontWeight: 800, color: TINTA },
  panelWrap: { maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px" },
  backLink: { background: "none", border: "none", color: HUMO, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, textAlign: "left" },
  card2: { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px 18px" },
  panelHeading: { fontFamily: "'Anton', sans-serif", fontSize: 20, margin: "0 0 14px", letterSpacing: 0.3 },
  divider: { borderTop: `1px dashed ${BORDER}`, margin: "12px 0" },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800 },
  emptyText: { color: HUMO, fontSize: 13 },
  lineRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BG}` },
  lineName: { fontSize: 13.5, flex: 1, paddingRight: 8 },
  lineRight: { display: "flex", alignItems: "center", gap: 10 },
  qtyStepper: { display: "flex", alignItems: "center", gap: 6 },
  qtyBtn: { width: 22, height: 22, borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, cursor: "pointer", fontSize: 14, lineHeight: "18px" },
  linePrice: { fontSize: 13.5, fontWeight: 700, minWidth: 64, textAlign: "right" },
  fieldLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: HUMO, marginBottom: 4, fontWeight: 700 },
  input: { width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, fontSize: 13.5, fontFamily: "'Inter', sans-serif", color: TINTA },
  payRow: { display: "flex", gap: 16, marginBottom: 6, flexWrap: "wrap" },
  payOption: { display: "flex", alignItems: "center", gap: 6, fontSize: 13 },
  aliasBox: { background: "#FCEEE4", padding: "10px 12px", borderRadius: 8, fontSize: 12.5, lineHeight: 1.5 },
  mpBtn: { display: "block", width: "100%", textAlign: "center", background: "#009EE3", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, marginTop: 8, marginBottom: 4, cursor: "pointer" },
  primaryBtn: { display: "block", width: "100%", textAlign: "center", background: BRASA, color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14.5, marginTop: 16, cursor: "pointer", textDecoration: "none" },
  secondaryBtn: { display: "block", width: "100%", textAlign: "center", background: "transparent", color: TINTA, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13.5, marginTop: 10, cursor: "pointer" },
  errText: { color: BRASA, fontSize: 12, marginTop: 4 },
  confirmBadge: { width: 40, height: 40, borderRadius: "50%", background: "#E4F3EA", color: "#2F8B57", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 10 },
  kitchenLink: { display: "block", margin: "18px auto 0", background: "none", border: "none", color: "#B8AC98", fontSize: 11, cursor: "pointer", textAlign: "center", width: "100%" },
  toast: { position: "fixed", top: 74, left: "50%", transform: "translateX(-50%)", background: TINTA, color: "#fff", padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 50 },
  kitchenWrap: { maxWidth: 1100, margin: "0 auto", padding: "20px 20px 50px" },
  warnBox: { background: "#FCEEE4", border: "1px solid #E8541F", color: "#8A3A16", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, marginBottom: 16 },
  kitchenHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  kitchenGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 },
  ticket: { background: "#FBF6EA", color: "#241A13", fontFamily: "'JetBrains Mono', monospace", borderRadius: 10, padding: "14px 16px", boxShadow: "0 6px 18px rgba(0,0,0,0.08)" },
  ticketHeaderRow: { display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 },
  ticketDivider: { borderTop: "1px dashed #B7A98C", margin: "8px 0" },
  ticketLine: { fontSize: 12.5, padding: "2px 0" },
  statusBtn: { width: "100%", border: "none", borderRadius: 6, padding: "9px 0", color: "#fff", fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 12.5, cursor: "pointer" },
  printRow: { display: "flex", gap: 8, marginTop: 8 },
  printBtn: { flex: 1, border: `1px solid #B7A98C`, background: "transparent", borderRadius: 6, padding: "7px 0", fontFamily: "'Inter', sans-serif", fontSize: 11.5, fontWeight: 700, cursor: "pointer", color: "#241A13" },
  doneList: { display: "flex", flexDirection: "column", gap: 6 },
  doneRow: { fontSize: 12.5, color: HUMO, fontFamily: "'JetBrains Mono', monospace" },
};

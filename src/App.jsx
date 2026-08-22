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
     bg        #FAF8F5  (fondo general, claro)
     bg-panel  #FFFFFF  (cards)
     borde     #EDE6DB
     brasa     #E8541F  (acento principal)
     brasa-op  #C43B14  (hover / activo)
     tinta     #221A14  (texto principal)
     humo      #756B5E  (texto secundario)
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
    id: row.id, items: row.items, total: row.total, customer: row.customer, status: row.status, createdAt: row.created_at,
    courierLat: row.courier_lat ?? null, courierLng: row.courier_lng ?? null, courierUpdatedAt: row.courier_updated_at ?? null,
  };
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
    });
    if (error) console.error(error);
    return;
  }
  const list = await getOrders();
  await saveOrders([order, ...list]);
}
async function updateOrderStatus(id, status) {
  if (hasSupabase) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) console.error(error);
    return;
  }
  const list = await getOrders();
  await saveOrders(list.map((o) => (o.id === id ? { ...o, status } : o)));
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
// gratis y sin API key — service público con límite de uso razonable, ideal para
// un local que geolocaliza una dirección por pedido.
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

function getUrlParams() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return { courier: p.get("courier"), pedido: p.get("pedido") };
}

export default function ValdezBurger() {
  const urlParams = useMemo(() => getUrlParams(), []);
  const [view, setView] = useState(() => {
    if (urlParams.courier) return "courier-share";
    if (urlParams.pedido) return "track";
    return "store";
  });
  const [trackingId, setTrackingId] = useState(urlParams.pedido || null);
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
            const order = {
              id: uid().toUpperCase(),
              items: cartLines.map((l) => ({ name: l.item.name, price: l.item.price, qty: l.qty })),
              total,
              customer: custom,
              status: "Nuevo",
              createdAt: new Date().toISOString(),
            };
            await insertOrder(order);
            await saveProfile(custom);
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
          onNew={() => setView("store")}
          onTrack={() => {
            setTrackingId(lastOrder.id);
            setView("track");
          }}
        />
      )}

      {view === "track" && trackingId && (
        <TrackOrder orderId={trackingId} onExit={() => setView("store")} />
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
function Store({ query, sections, activeCat, setActiveCat, onAdd }) {
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
                      background: item.image_url ? `center/cover no-repeat url(${item.image_url})` : imgGradient(section.cat),
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
  return 
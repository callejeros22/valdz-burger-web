import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si todavía no configuraste las claves, esto queda en null y la app
// sigue funcionando con localStorage (sin compartir datos entre
// dispositivos) — ver README.md para conectarlo de verdad.
export const supabase = url && key ? createClient(url, key) : null;

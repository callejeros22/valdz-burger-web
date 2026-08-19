# Vald'z Burger — web de pedidos

## 1. Conectar la base de datos compartida (Supabase, gratis)

Esto es lo que hace que un pedido hecho desde el celular de un cliente
aparezca al toque en la PC de tu cocina.

1. Creá una cuenta gratis en https://supabase.com y un proyecto nuevo
   (podés llamarlo "valdz-burger").
2. Andá a **SQL Editor** (menú de la izquierda) y pegá y ejecutá esto:

```sql
create table if not exists orders (
  id text primary key,
  items jsonb not null,
  total numeric not null,
  customer jsonb not null,
  status text not null default 'Nuevo',
  created_at timestamptz not null default now()
);

create table if not exists menu_images (
  item_id text primary key,
  url text not null
);

alter table orders enable row level security;
alter table menu_images enable row level security;

create policy "public read orders" on orders for select using (true);
create policy "public insert orders" on orders for insert with check (true);
create policy "public update orders" on orders for update using (true);

create policy "public read images" on menu_images for select using (true);
create policy "public upsert images" on menu_images for insert with check (true);
create policy "public update images" on menu_images for update using (true);
create policy "public delete images" on menu_images for delete using (true);
```

3. Andá a **Project Settings → API**. Ahí vas a ver dos datos:
   - **Project URL**
   - **anon public key**

4. Copiá el archivo `.env.example` de esta carpeta, renombralo a `.env`,
   y pegá esos dos valores:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
   ```

5. Si vas a publicar en Vercel o Netlify (ver paso 2), esas mismas dos
   variables las tenés que cargar también en la configuración del hosting
   ("Environment Variables" en Vercel / "Environment" en Netlify) — el
   archivo `.env` local no viaja solo con el código.

> Nota sobre seguridad: la "anon key" está pensada para ser pública (viaja
> igual en el navegador de cualquier cliente), la protección real la dan
> las políticas de arriba. Como esta app no tiene login de clientes, esas
> políticas son abiertas — cualquiera con la key técnicamente podría leer
> la tabla de pedidos directo desde la base. Para un local chico es
> aceptable, pero si más adelante te preocupa avisame y lo ajustamos
> (por ejemplo, restringiendo qué campos se pueden leer).

## 2. Publicar la página (gratis, 5 minutos)

**Opción más simple: Vercel**
1. Creá una cuenta gratis en https://vercel.com (podés entrar con GitHub).
2. Subí esta carpeta a un repositorio de GitHub.
3. En Vercel: "Add New Project" → elegís el repo → "Deploy". Antes de
   confirmar, agregá las dos variables de entorno del paso 1
   (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).
4. En un par de minutos te da un link tipo `valdz-burger.vercel.app` que
   podés compartir con tus clientes (y después, si querés, apuntarle un
   dominio propio como `valdzburger.com.ar`).

**Alternativa: Netlify** — mismo proceso, en https://netlify.com.

## 3. Desarrollo local (opcional)
```
npm install
npm run dev
```
Abrí el link que te muestra la terminal (normalmente http://localhost:5173).

## 4. Claves configuradas en la app
- Clave del panel de cocina: `valdez2026`
- Clave para editar fotos del menú: `valdezfotos2026`
- Alias de transferencia: `valdzburger`
(Están en `src/App.jsx`, arriba del todo, por si querés cambiarlas.)

## 5. Si todavía no conectaste Supabase
La app funciona igual, pero vas a ver un aviso naranja en el panel de
cocina recordándote que los pedidos por ahora solo se guardan en el
navegador de cada persona (no viajan entre dispositivos).

## 6. "Descargarla" al celular
La página ya está preparada como PWA (con ícono propio de Vald'z Burger).
Una vez publicada, en Android Chrome suele aparecer solo un cartel de
"Instalar app"; si no aparece, o en iPhone, el cliente puede tocar el
menú del navegador → "Agregar a pantalla de inicio". Le queda un ícono
como cualquier app, abre a pantalla completa.


# Cuentas Claras

Sitio estático para dividir los gastos de la casa entre Sammy, Nubi y
Gabriel. Subís un CSV con los items de la boleta (generado por un agente de
IA a partir de la foto/lista de la compra), asignás cada item a una o varias
personas, y la app calcula cuánto le corresponde pagar a cada uno y quién le
debe a quién, mes a mes. Se puede instalar como app (PWA) en el celular.

Los datos (boletas, balances) se guardan en Supabase (Postgres) para que los
tres vean lo mismo desde cualquier dispositivo.

## Cómo usar la app (flujo mensual)

1. Después de cada compra, pedile a un agente (Claude, Gemini, etc.) algo así:

   > Te paso la lista de items y precios de esta boleta del supermercado,
   > incluyendo los descuentos aplicados. Devolveme un CSV con dos columnas,
   > `item,price`, donde `price` sea el precio final ya con el descuento
   > aplicado a cada item. La suma de la columna `price` tiene que dar el
   > total de la boleta.

2. Entrá a la página, pestaña **Nueva compra**, pegá el CSV (o subí el
   archivo) y tocá **Parsear**.
3. Asigná cada item a Sammy, Nubi y/o Gabriel (tocá más de uno para
   dividirlo entre varios, o usá los botones rápidos "Todos" / de a pares).
4. Revisá que la suma de items coincida con el total real de la boleta,
   elegí la fecha, quién pagó y la categoría (Supermercado / Salidas /
   Comida), y guardá.
5. En la pestaña **Historial** vas a ver el gasto acumulado por categoría y
   el detalle de cada compra. En **Balances**, cuánto le debe cada uno a
   cada quien en total, con un botón para marcar como pagado cuando alguien
   te transfiere.

## Setup (una sola vez)

### 1. Crear el proyecto de Supabase

1. Andá a [supabase.com](https://supabase.com/), creá una cuenta y un
   proyecto nuevo (plan Free alcanza). Elegí una contraseña de base de
   datos (no la vas a necesitar para esto, pero Supabase la pide).
2. **Authentication → Sign In / Providers → Anonymous Sign-Ins → activalo.**
   Esto permite que la app identifique "alguien de la casa" sin pedir
   usuario/contraseña.
3. **SQL Editor → New query**, pegá el contenido de
   [`supabase.sql`](supabase.sql) y ejecutalo. Esto crea la tabla `bills` y
   las políticas de seguridad (Row Level Security).
4. **Project Settings → API**. Copiá el **Project URL** y la **anon
   public key**.
5. Pegá esos valores en [`js/supabase-config.js`](js/supabase-config.js),
   reemplazando los `"REEMPLAZAR"`. La anon key no es secreta (el acceso
   real lo controlan las políticas de RLS), así que está bien commitearla.

### 2. Activar GitHub Pages

En el repo: **Settings → Pages → Source: Deploy from a branch → Branch:
`main` / `(root)` → Save**. Después de un minuto la página va a estar en
`https://sam-my16.github.io/grocery-splitter/`.

### 4. Instalarla como app (PWA)

Desde el navegador del celular: **Compartir → Agregar a la pantalla de
inicio** (iOS Safari) o **⋮ → Instalar app** (Android Chrome). Queda con
ícono propio y abre en pantalla completa, sin la barra del navegador.

### 3. Personalizar nombres

Si alguno de los nombres cambia, editá el array `PEOPLE` en
[`js/supabase-config.js`](js/supabase-config.js).

## Formato del CSV

Columnas esperadas (nombres flexibles, detecta variantes en español/inglés):

| item / producto | price / precio |
|---|---|
| Leche | 1200 |
| Pan | 900 |

`price` debe ser el precio final del item, descuento ya aplicado. La suma de
la columna tiene que coincidir con el total real de la boleta (la app te
avisa si no coincide).

## Problemas comunes

**"La fecha y hora de tu celular están mal" / error de conexión.** El login
anónimo de Supabase depende de que el reloj del dispositivo esté bien
sincronizado. Solución: **Ajustes → General → Fecha y hora → activar
"Ajustar automáticamente"**, y volver a entrar a la página.

## Ideas para más adelante

- Categorías por item (no sólo por compra completa) y gráficos de gasto en
  el tiempo.
- Notificación (WhatsApp/email) recordando de quién es el turno de comprar.
- Autocompletar items recurrentes para no tener que asignarlos cada vez.
- Exportar el resumen mensual a PDF.

## Stack

Sin build ni framework: HTML/CSS/JS plano + [PapaParse](https://www.papaparse.com/)
para el CSV + [Supabase](https://supabase.com/) (Auth anónima + Postgres)
para los datos compartidos. Todo corre en el navegador, servido como
página estática por GitHub Pages.

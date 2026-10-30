# Cuentas Claras

Sitio estático para dividir los gastos de la casa entre Sammy, Nubi y
Gabriel. Subís un CSV con los items de la boleta (generado por un agente de
IA a partir de la foto/lista de la compra), asignás cada item a una o varias
personas, y la app calcula cuánto le corresponde pagar a cada uno y quién le
debe a quién, mes a mes. Se puede instalar como app (PWA) en el celular.

Los datos (boletas, balances) se guardan en Supabase (Postgres) para que los
tres vean lo mismo desde cualquier dispositivo.

## Cómo usar la app

- **Gasto rápido**: escribí una descripción y el importe, elegí quién pagó,
  la fecha, la categoría y quiénes lo comparten. Revisá las partes y guardá.
- **Importar compra**: pegá el CSV del agente (con o sin bloque de código) o
  subí un archivo. Tocá **Revisar items**, elegí el reparto de toda la compra
  y ajustá las excepciones. Podés editar, agregar o quitar productos antes de guardar.
- El CSV acepta `item,price`, variantes en español y filas sin encabezado.
  Los precios deben incluir los descuentos, sin símbolo de moneda ni miles.
  La app indica las filas inválidas y exige que el total coincida con los items.
- El borrador se guarda en este dispositivo al editar. Al volver, se recupera;
  **Descartar borrador** permite empezar de nuevo. No se sincroniza entre dispositivos.
- En **Historial** podés editar compras y exportarlas. En **Balances**, **Ver detalle**
  explica las partes de las compras y los pagos en ambos sentidos. Es un saldo
  de todas las fechas; los pagos no se asignan a boletas particulares.
- **Marcar como pagado** registra una transferencia por el saldo completo;
  **Deshacer** elimina ese registro si fue un error.

La app sigue necesitando conexión para guardar o consultar los datos compartidos.
No lee fotos directamente: el botón **Copiar prompt para el agente** ayuda a preparar el CSV.

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

## Desarrollo y pruebas

No hay build: serví la raíz del repositorio con cualquier servidor estático.
Para ejecutar las pruebas instalá Node.js 22 o superior y Chrome:

```sh
npm install
npm test
npm run test:ui
```

Las pruebas de interfaz levantan un servidor local en el puerto 4173 y usan
respuestas de Supabase simuladas, sin modificar los datos reales. Cubren vistas
móviles y escritorio. Los paquetes npm son sólo herramientas de desarrollo.

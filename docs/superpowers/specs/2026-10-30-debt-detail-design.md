# Detalle de compras pendientes

Mostrar en Balances → Ver detalle las compras que componen la deuda entre dos personas. Ejemplo para un saldo de $6.000:

- Supermercado — $4.000
- 31-08-2026 — $500
- Compra de hoy — $1.500

Cada fila muestra únicamente el título y el importe pendiente. Si falta el título, mostrar la fecha. Quitar el resumen general y el historial de movimientos del detalle. Ocultar compras saldadas.

## Enfoques

Mostrar las partes originales de las compras no permite explicar el saldo después de pagos. Vincular manualmente cada pago a una compra requiere cambiar el flujo y los datos. Se propone compensar automáticamente las compras más antiguas con los pagos y las compras en sentido contrario, sin modificar los datos guardados ni el cálculo del saldo total. La implementación usa esta regla de presentación y prioriza siempre el título; solo usa la fecha si falta el título, conforme a la aclaración del usuario.

## Implementación y validación

Extender `pairAccount` con los importes pendientes y simplificar `renderDebtDetail`. Mantener la precisión actual del saldo y distribuir los centavos de visualización para que las filas sumen el saldo mostrado. Probar saldos parciales, compras saldadas, compras y pagos en ambos sentidos, títulos vacíos y redondeos; incluir el ejemplo de $6.000 en navegador. Actualizar las versiones del PWA y publicar tras verificar.

Si un pago en sentido contrario produce deuda que no corresponde a ninguna compra (por ejemplo, un pago en exceso), no atribuirla falsamente a una compra: identificar ese remanente como «Saldo por pagos». Es una excepción necesaria para conservar el saldo existente.

El control de acceso por hogar queda fuera del alcance.

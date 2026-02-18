# Diagnóstico de cartera en Postman

Para ver **paso a paso** por qué no carga la cartera, usa el endpoint de diagnóstico. **Siempre responde 200** (nunca 502/500 desde el backend), así puedes ver el comportamiento aunque falle algo en el camino.

## Request en Postman

- **Método:** GET  
- **URL:**  
  `https://TU_DOMINIO/api/cxc/estado-cartera/diagnostic?cedula=TU_CEDULA`

(Sustituye `TU_DOMINIO` por tu backend, ej. `rewards.gsp.com.co` o `app.gsp.com.co`, y `TU_CEDULA` por una cédula de prueba.)

## Qué devuelve la API

La respuesta es un JSON con:

| Campo | Descripción |
|-------|-------------|
| `request` | Lo que recibió (cedula, vendedor). |
| `steps` | Lista de pasos ejecutados: nombre, tiempo en ms, si tuvo éxito y detalle (error, recomendación). |
| `summary` | Objeto final de cartera (cupoCredito, saldoCartera, etc.) o null si no hubo datos. |
| `totalMs` | Tiempo total del request en ms. |
| `recommendation` | Texto con qué revisar según lo que falló. |

### Pasos que puedes ver en `steps`

1. **init** – Cedula normalizada y fecha. Si falla aquí, falta `cedula` en la URL.
2. **cxc_sin_vendedor** – Llamada a CXC sin vendedor. Si `success: false`, mira `error` y `recommendation` (ej. timeout → subir `CXC_TIMEOUT_MS`).
3. **resolve_vendedor** – Resolución del vendedor desde clientes. Si falla, revisar cache de clientes / ERP.
4. **cxc_con_vendedor** – Llamada a CXC con vendedor. Si falla, mismo tipo de revisión que en paso 2.
5. **parse_and_cupo** – Parseo del payload y búsqueda de cupo. Si todo lo anterior fue OK, aquí suele ser OK.

### Cómo interpretar

- Si **no llega respuesta** (Postman se queda cargando o 502): el problema está **antes** del backend (Apache/proxy, red, DNS). Revisar ProxyTimeout y que el backend esté arriba.
- Si **llega 200** con `steps`:
  - Algún paso con `success: false` → usar su `error` y `recommendation` para corregir (timeouts, CXC, clientes).
  - Todos `success: true` pero la app no muestra cartera → revisar que la app envíe `cedula` y que el timeout de la app (60 s) sea mayor que `totalMs`.

La cabecera **X-Cartera-Time-Ms** también trae el tiempo total; si es muy alto (>60 000 ms), la app puede estar cortando por timeout.

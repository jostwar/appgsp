# API cartera – proveedor (Fomplus)

Referencia de la API entregada por el proveedor y cómo la usa el backend.

## Endpoint del proveedor

- **URL base:** `https://cartera.fomplus.com/srvCxcPed.asmx`
- **Método:** GET
- **Recurso:** `EstadoDeCuentaCartera`

**URL completa:**  
`https://cartera.fomplus.com/srvCxcPed.asmx/EstadoDeCuentaCartera?strPar_Basedatos=...&strPar_Token=...&strPar_Vended=...&datPar_Fecha=...&strPar_Cedula=...`

## Parámetros (query)

| Parámetro         | Ejemplo     | Descripción                    | En el backend              |
|------------------|-------------|--------------------------------|----------------------------|
| `strPar_Basedatos` | GSPSAS      | Base de datos / empresa        | `CXC_EMPRESA`              |
| `strPar_Token`     | (token)     | Token de autenticación         | `CXC_TOKEN`                |
| `strPar_Vended`    | vacío o código | Código de vendedor           | `vendedor` (resuelto o env) |
| `datPar_Fecha`     | 2026-01-23  | Fecha de consulta              | `fecha` (formato YYYY-MM-DD) |
| `strPar_Cedula`    | 901458981   | Cédula del cliente             | `cedula`                   |

## Respuesta (200 OK)

JSON array de ítems de cartera. Cada ítem puede tener, entre otros:

- `SALDO` – saldo
- `DAIAVEN` – días a vencer (negativo = por vencer, positivo = vencido)
- `CEDULA`, `NOMCED`, `VENDED`, `NOMVEN`, `FECHA`, `FECVEN`, `ULTPAG`, `PREFIJ`, `NUMDOC`, etc.

El backend usa `SALDO`, `DAIAVEN` y las claves equivalentes para armar el resumen (cupo, saldo cartera, por vencer, vencido).

## Variables de entorno en el servidor

En el backend (Lightsail) deben estar definidas:

```bash
CXC_API_URL=https://cartera.fomplus.com/srvCxcPed.asmx
CXC_EMPRESA=GSPSAS
CXC_TOKEN=<token entregado por el proveedor>
```

Opcional: `CXC_TIMEOUT_MS=120000` (2 min) o `180000` (3 min) si el proveedor tarda más de 60 s.

## Cómo llama el backend

- **Módulo:** `backend/src/cxcClient.js`
- **Método:** `cxc.estadoCartera({ fecha, cedula, vendedor })`
- **Internamente:** GET a `CXC_API_URL/EstadoDeCuentaCartera` con `baseParams()` que añade `strPar_Basedatos` y `strPar_Token`, más `datPar_Fecha`, `strPar_Cedula`, `strPar_Vended`.

Si el GET falla, el cliente hace fallback a una llamada SOAP al mismo método (por compatibilidad con otras configuraciones).

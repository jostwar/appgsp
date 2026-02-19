# Estado de cartera (Postman)

- **Saldos** (saldo cartera, por vencer, vencido): se obtienen de la **Lambda** del usuario (que consulta `EstadoDeCuentaCartera` en cartera.fomplus.com).
- **Cupo crédito**: viene del servicio **ListadoClientes** en `https://cartera.fomplus.com/srvCxcPed.asmx` (mismo origen que CLI_NOMBRE y CLI_CEDULA).

## Request

- **Método:** GET  
- **URL:**  
  `https://app.gsp.com.co/api/cxc/estado-cartera/summary?cedula=TU_CEDULA`

(Sustituye `TU_CEDULA` por la cédula de prueba, ej. `901188568`.)

## Respuesta

JSON con:

- `cupoCredito`
- `saldoCartera`
- `saldoPorVencer`
- `saldoVencido`

Si la Lambda falla o no responde, se devuelven ceros.

## Lambda

La URL por defecto es:

`https://rue2usb4cwm63vhvmebk7ydf6y0ekuln.lambda-url.us-west-2.on.aws/`

Se puede sobreescribir con la variable de entorno `CARTERA_LAMBDA_URL` en el backend.

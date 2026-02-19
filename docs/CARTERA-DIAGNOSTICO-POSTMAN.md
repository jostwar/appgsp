# Estado de cartera (Postman)

El estado de cartera se obtiene **solo** llamando a la Lambda del usuario.

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

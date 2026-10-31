# Cine boliviano Stremio — v1.4.0

Esta versión recupera la búsqueda conservadora de carteles de v1.1, mantiene IDs internos `bolivia:`, y sirve páginas de hasta 100 elementos mediante `skip`.

Los resultados negativos de búsqueda ya no se guardan: si IMDb no responde o no hay coincidencia fiable, se volverá a intentar en una pasada posterior. Solo se guardan coincidencias con cartel, similitud >= 0.92 y año compatible.

Comprobación del servicio: `/health.json` muestra el total, carteles identificados y estado de búsqueda.

No incluye enlaces de reproducción.

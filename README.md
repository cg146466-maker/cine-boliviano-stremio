# La gran videoteca del cine boliviano — versión 1.1.0

Complemento de catálogo para Stremio. No incluye enlaces de reproducción.

## Mejoras
- CORS para compatibilidad con clientes Stremio.
- Búsqueda conservadora de identificadores IMDb por título y año.
- Usa carátula encontrada cuando la coincidencia es muy alta y el año coincide.
- Si no se encuentra una carátula fiable, muestra una lámina propia que indica que el cartel no está localizado, en vez de dejar un cuadro vacío o asignar una película equivocada.
- Mantiene fichas propias para títulos que no se encuentran en IMDb.

Las búsquedas automáticas no garantizan una coincidencia para todos los títulos; el catálogo conserva los títulos sin coincidencia.

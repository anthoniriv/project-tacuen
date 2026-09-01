<h1 align="center">🧾 Tacuen — dividí la cuenta sin hacer cuentas</h1>

<p align="center">
  <sub>Digitalizá boletas y repartí gastos entre personas — con IA para leer los tickets y exportación a Excel.</sub>
</p>

<p align="center">
  <img src="screenshot.png" alt="Carga de una boleta en Project Tacuen" width="800">
</p>

---

## Qué resuelve

**Project Tacuen** convierte una foto de boleta en un reparto revisable. Extrae ítems y montos con IA, deja corregirlos y permite asignar el gasto entre las personas del grupo antes de exportar el resultado a Excel.

## Funcionalidades principales

- **Carga de comprobantes** con validación de tipo y tamaño mediante `MAX_RECEIPT_MB`.
- **Procesamiento asistido por IA** para convertir la boleta en ítems y totales editables.
- **Revisión de ítems y cargos** antes de calcular el reparto.
- **Distribución por persona** y cálculo del resumen final.
- **Exportación a Excel** en formato `.xlsx`.
- **Persistencia** de comprobantes en Supabase Storage y datos en Postgres.

## Flujo de uso

```text
foto de boleta → extracción con IA → revisión → reparto → exportación Excel
```

1. **Foto de boleta:** subí una imagen PNG o JPG y, opcionalmente, nombrá el evento.
2. **Extracción con IA:** Tacuen procesa el comprobante y convierte sus ítems, cargos y totales en datos editables.
3. **Revisión:** corregí nombres, cantidades, precios y cargos antes de calcular.
4. **Reparto:** agregá a las personas y asigná cada consumo; también podés ajustar redondeos y cargos.
5. **Exportación:** consultá el resumen por persona y descargá el reparto en formato `.xlsx`.

## Arquitectura y stack

| Capa | Stack |
|------|-------|
| Framework | Next.js 16 (App Router) |
| Interfaz y estado | React + store local de Tacuen |
| Base de datos | Supabase (Postgres) |
| Almacenamiento | Supabase Storage |
| IA | OpenAI |
| Exportación | ExcelJS (`.xlsx`) |

```text
app/                    pantallas del flujo: carga, ítems, personas, reparto y resumen
app/api/                carga, procesamiento y lectura de comprobantes
src/features/tacuen/    modelo de dominio, estado, UI y analítica
lib/                    integración con Excel y servicios de soporte
public/                 recursos estáticos
```

## Instalación y ejecución local

1. Instalá dependencias:

```bash
npm install
```

2. Configurá las variables de entorno en `.env`:

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio, solo para servidor |
| `SUPABASE_STORAGE_BUCKET` | Bucket de imágenes de boletas |
| `OPENAI_API_KEY` | Clave de OpenAI para analizar tickets |
| `MAX_RECEIPT_MB` | Tamaño máximo de subida; por defecto, 10 |

3. Levantá la aplicación:

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Límites y consideraciones

- La extracción con IA es una ayuda, no una fuente definitiva: revisá los ítems y totales antes de compartir el resultado.
- La carga acepta imágenes PNG o JPG y respeta el límite configurado en `MAX_RECEIPT_MB` (10 MB por defecto).
- El análisis requiere `OPENAI_API_KEY`; la persistencia requiere un proyecto Supabase configurado.
- `SUPABASE_SERVICE_ROLE_KEY` es una credencial de servidor: no la expongas en el navegador ni la incluyas en el repositorio.
- El reparto se exporta después de la revisión y el cálculo dentro del flujo; la aplicación no reemplaza el comprobante original.

---

<p align="center"><sub>Hecho con ❤️ por <a href="https://github.com/anthoniriv">Anthoni Rivera</a></sub></p>

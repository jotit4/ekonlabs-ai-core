# Análisis del turnero real de ISADI (Excel) — modelo mental de las recepcionistas

- **Fecha:** 2026-07-01 · **Autora:** Sally (UX/UI · BMad)
- **Fuente:** `TURNERO MAYO 2026 (1).xlsx` (archivo local del usuario; **no se copian nombres de pacientes** a este doc por privacidad).
- **Objetivo:** entender cómo piensan la agenda hoy, para que el rediseño respete ese modelo y baje el rechazo al sistema.

## Cómo está hecho el archivo (hechos)

- 6 hojas; **solo `Hoja1` tiene datos**. El contenido real vive en las **~96 primeras filas**; el resto (hasta la 7398) está vacío (formato heredado). → confirma "una sola hoja gigante hacia abajo" y "filas que no se usan".
- Muchas **columnas sin usar** (huecos entre la col N y la W). → confirma "columnas que no se usan".
- Es una **plantilla semanal/tipo** escrita a mano, con notas operativas libres dentro de las celdas ("BUSCAR FICHA", "NUEVA", "X OSEP", "NO DAR esta semana", "PART", teléfonos, patología).

## La estructura real: es una GRILLA, no listas

El turnero son **3 mini-planillas apiladas**, cada una con su propia lógica:

### 1) Rehabilitación / Kinesio — grilla HORA × BOX (filas 1–16)
- **Columnas = BOX/equipo** (no profesional): fila 1 = "BOX", fila 2 = el equipamiento de ese box → `MGTO-US`, `OC-ELECTRODOS`, `MGTO-OC`, `TRACCIÓN LUMBAR`, `GIM`.
- **Filas = franjas horarias** hacia abajo: mañana 08:00–12:00, luego tarde 15:00–17:15 (separador "ALDO").
- **Celda = un paciente** con su patología + obra social + nota.

### 2) Pileta — Aquagym / Hidro (filas 18–46)
- **Clases grupales** por día y horario: columnas = "LUNES AQUA 9:30–10:30", "MIÉRCOLES HIDRO 10:30–11:30", etc.
- **Filas = lista de inscriptos** en esa clase. Bloques MAÑANA y TARDE.

### 3) Pilates — grilla HORA × DÍA (filas 48–83)
- **Columnas = días** (Lunes…Viernes), **filas = franjas horarias** (8–9, 9–10, … y tarde).
- **Celda = inscriptos** de esa clase grupal.

## El modelo mental (lo que hay que respetar)

1. **Piensan en grilla:** eje vertical = horas hacia abajo; eje horizontal = un recurso (box, día o clase). **El sistema actual usa listas apiladas por profesional → es lo que las descoloca.**
2. **Una celda = un turno, compacto** (nombre + nota corta). El hueco libre es una **celda vacía**, no un item "+ Libre" repetido que satura la pantalla (el gran defecto visual actual).
3. **Todo el día de un vistazo**, scrolleando: mañana → tarde → pileta → pilates.
4. **Tres modalidades distintas**: rehabilitación individual (box×hora) vs clases grupales con lista de inscriptos (Aqua/Hidro/Pilates). El sistema las mezcla; ellas las separan visualmente.
5. **Organizan por recurso físico (BOX/equipo)**, no por profesional. El sistema modela por profesional → diferencia de fondo (un box podría ser evolución futura del modelo de datos).
6. **Notas operativas inline** son parte del flujo (obra social, "nueva", "buscar ficha", "no dar"). Necesitan un campo de nota corta visible en la celda.

## Implicancia para el rediseño

Reemplazar la vista de **listas apiladas + "+ Libre"** por una **grilla tipo planilla**: filas = horas, columnas = recurso (profesional en el MVP; box como evolución), celda ocupada = turno compacto con nota, celda vacía = clickeable y discreta. Las **clases grupales** merecen un tratamiento propio (bloque con cupo + lista de inscriptos), no una fila de turno individual.

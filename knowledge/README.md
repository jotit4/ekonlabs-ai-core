# Knowledge Base

Este directorio contiene los documentos que se indexarán como base de conocimiento clínico del agente. Los PDFs aquí almacenados deben ser procesados con el script de ingesta antes de que el agente pueda consultarlos.

## Prerequisitos

1. **Extensión pgvector habilitada** en tu proyecto Supabase:
   - Dashboard → Database → Extensions → buscar `vector` y activar

2. **Migración aplicada** en Supabase SQL Editor:
   ```sql
   -- Ejecutar el contenido de:
   migrations/002_knowledge_chunks.sql
   ```

3. **Variables de entorno** configuradas en `.env`:
   ```
   DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_KEY=<service-role-key>  # IMPORTANTE: usar service_role key, NO anon key
   ```

4. **Tenant creado** previamente con `POST /api/v1/tenants`.

## Cómo ingestar un documento

Desde la raíz del proyecto (`ekonlabs-ai-core/`):

```bash
python scripts/ingest.py --tenant-id <uuid> --file knowledge/tarifario.pdf
```

### Validación sin insertar datos (dry-run)

```bash
python scripts/ingest.py --tenant-id <uuid> --file knowledge/tarifario.pdf --dry-run
```

### Ejemplo completo

```bash
# 1. Obtener el tenant_id (del endpoint POST /api/v1/tenants o de Supabase)
TENANT_ID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

# 2. Copiar el PDF a este directorio
cp ~/Downloads/tarifario_clinica_sonrisa.pdf knowledge/

# 3. Ingestar
python scripts/ingest.py --tenant-id $TENANT_ID --file knowledge/tarifario_clinica_sonrisa.pdf

# Output esperado:
# [INFO] Checking tenant aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee...
# [INFO] Ingesting 'tarifario_clinica_sonrisa.pdf' for tenant aaaaaaaa-...
# [OK] Ingested 42 chunks from 'tarifario_clinica_sonrisa.pdf' → tenant aaaaaaaa-...
```

## Cómo funciona internamente

1. **Carga**: `PyPDFLoader` extrae el texto del PDF página por página
2. **Chunking**: `RecursiveCharacterTextSplitter` divide en bloques de ≤ 1000 caracteres con 200 de overlap
3. **Embeddings**: `OpenAIEmbeddings(model="text-embedding-3-small")` vectoriza cada chunk (1536 dimensiones)
4. **Almacenamiento**: INSERT directo via psycopg2 en la tabla `knowledge_chunks` con `tenant_id` en cada registro
5. **Índice**: IVFFlat con `vector_cosine_ops` para búsquedas semánticas eficientes

## Búsqueda (uso del agente)

El nodo `rag_retrieval` del grafo LangGraph realiza búsquedas automáticamente durante las conversaciones:

```python
from app.services.rag_service import search_knowledge

results = search_knowledge(tenant_id=TENANT_ID, query="precio implante dental", k=3)
# [{"content": "...", "source_filename": "tarifario.pdf", "similarity": 0.92}, ...]
```

## Aislamiento multi-tenant

⚠️ Todos los registros en `knowledge_chunks` tienen un `tenant_id`. Las búsquedas **siempre** filtran por `tenant_id` — un tenant nunca puede ver el conocimiento de otro.

#!/usr/bin/env python3
"""Admin script: ingest a PDF document into a tenant's knowledge base.

Usage:
    python scripts/ingest.py --tenant-id <uuid> --file docs/tarifario.pdf
    python scripts/ingest.py --tenant-id <uuid> --file docs/tarifario.pdf --dry-run

Requires:
    - DATABASE_URL configured in .env (PostgreSQL connection string)
    - OPENAI_API_KEY configured in .env
    - SUPABASE_URL and SUPABASE_KEY configured in .env (service_role key)
    - pgvector extension enabled on the Supabase project
    - migrations/002_knowledge_chunks.sql applied to the database
"""
import argparse
import os
import sys

# Add project root to path so 'app' is importable when running as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from app.core.config import settings  # noqa: E402 (needs dotenv loaded first)
from app.core.database import get_supabase_client  # noqa: E402
from app.services.rag_service import ingest_document  # noqa: E402


def validate_tenant_exists(tenant_id: str) -> bool:
    """Return True if the tenant_id exists in the tenants table."""
    client = get_supabase_client()
    result = client.table("tenants").select("tenant_id").eq("tenant_id", tenant_id).execute()
    return len(result.data) > 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a PDF document into a tenant's knowledge base (pgvector)."
    )
    parser.add_argument("--tenant-id", required=True, help="UUID of the target tenant")
    parser.add_argument("--file", required=True, help="Path to the PDF file to ingest")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs without inserting any data",
    )
    args = parser.parse_args()

    tenant_id: str = args.tenant_id
    file_path: str = args.file

    # Validate file exists
    if not os.path.isfile(file_path):
        print(f"[ERROR] File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    if not file_path.lower().endswith(".pdf"):
        print("[ERROR] Only PDF files are supported.", file=sys.stderr)
        sys.exit(1)

    # Validate DATABASE_URL is configured
    if not settings.DATABASE_URL:
        print(
            "[ERROR] DATABASE_URL is not configured. Add it to your .env file.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate tenant exists in DB
    print(f"[INFO] Checking tenant {tenant_id}...")
    if not validate_tenant_exists(tenant_id):
        print(f"[ERROR] Tenant '{tenant_id}' not found in the tenants table.", file=sys.stderr)
        sys.exit(1)

    source_filename = os.path.basename(file_path)

    if args.dry_run:
        print(f"[DRY-RUN] Would ingest '{source_filename}' for tenant {tenant_id}")
        print("[DRY-RUN] No data was written.")
        sys.exit(0)

    print(f"[INFO] Ingesting '{source_filename}' for tenant {tenant_id}...")
    count = ingest_document(
        tenant_id=tenant_id,
        file_path=file_path,
        source_filename=source_filename,
    )
    print(f"[OK] Ingested {count} chunks from '{source_filename}' → tenant {tenant_id}")


if __name__ == "__main__":
    main()

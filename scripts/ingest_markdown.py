#!/usr/bin/env python3
"""Admin script: ingest a markdown file into a tenant's knowledge base.

Usage:
    python scripts/ingest_markdown.py --tenant-id <uuid> --file docs/isadi_kb/obras_sociales.md
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from app.core.database import get_supabase_client  # noqa: E402
from app.services.rag_service import ingest_text  # noqa: E402


def validate_tenant_exists(tenant_id: str) -> bool:
    client = get_supabase_client()
    result = client.table("tenants").select("tenant_id").eq("tenant_id", tenant_id).execute()
    return len(result.data) > 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a markdown file into a tenant's knowledge base (pgvector)."
    )
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--file", required=True, help="Path to .md file")
    args = parser.parse_args()

    tenant_id: str = args.tenant_id
    file_path: str = args.file

    if not os.path.isfile(file_path):
        print(f"[ERROR] File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Checking tenant {tenant_id}...")
    if not validate_tenant_exists(tenant_id):
        print(f"[ERROR] Tenant '{tenant_id}' not found.", file=sys.stderr)
        sys.exit(1)

    with open(file_path, encoding="utf-8") as f:
        text = f.read()

    source_filename = os.path.basename(file_path)
    print(f"[INFO] Ingesting '{source_filename}' for tenant {tenant_id}...")
    count = ingest_text(tenant_id=tenant_id, text=text, source_filename=source_filename)
    print(f"[OK] Ingested {count} chunks from '{source_filename}' → tenant {tenant_id}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Ingest markdown KB files via Supabase REST API + OpenAI embeddings.

Uses HTTPS (no direct DB connection needed) — works from any network.

Usage:
    python scripts/ingest_markdown_rest.py \
        --tenant-id 5298fcc5-15bf-494c-9655-b49d759cfef4 \
        --file docs/isadi_kb/obras_sociales.md
"""
import argparse
import os
import sys
import json
import uuid

import requests
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI

CHUNK_SIZE = 400
CHUNK_OVERLAP = 60
EMBED_MODEL = "text-embedding-3-small"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    supabase_key = os.environ["SUPABASE_KEY"]
    openai_key   = os.environ["OPENAI_API_KEY"]

    if not os.path.isfile(args.file):
        print(f"[ERROR] File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    # 1. Verify tenant exists
    r = requests.get(
        f"{supabase_url}/rest/v1/tenants",
        headers=headers,
        params={"tenant_id": f"eq.{args.tenant_id}", "select": "tenant_id"},
        timeout=10,
    )
    r.raise_for_status()
    if not r.json():
        print(f"[ERROR] Tenant '{args.tenant_id}' not found.", file=sys.stderr)
        sys.exit(1)

    # 2. Read + split
    with open(args.file, encoding="utf-8") as f:
        text = f.read()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    chunks = splitter.split_text(text)
    source_filename = os.path.basename(args.file)
    print(f"[INFO] {len(chunks)} chunks from '{source_filename}'")

    # 3. Generate embeddings
    client = OpenAI(api_key=openai_key)
    print(f"[INFO] Generating embeddings via OpenAI ({EMBED_MODEL})...")
    resp = client.embeddings.create(model=EMBED_MODEL, input=chunks)
    embeddings = [item.embedding for item in resp.data]

    # 4. Delete existing chunks for this source_filename + tenant
    del_r = requests.delete(
        f"{supabase_url}/rest/v1/knowledge_chunks",
        headers=headers,
        params={
            "tenant_id": f"eq.{args.tenant_id}",
            "source_filename": f"eq.{source_filename}",
        },
        timeout=10,
    )
    del_r.raise_for_status()
    print(f"[INFO] Deleted existing chunks for '{source_filename}'")

    # 5. Insert new chunks — vector as string "[x, y, ...]"
    rows = [
        {
            "id": str(uuid.uuid4()),
            "tenant_id": args.tenant_id,
            "content": chunk,
            "embedding": str(emb),        # pgvector REST format
            "source_filename": source_filename,
            "chunk_index": idx,
        }
        for idx, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]

    ins_r = requests.post(
        f"{supabase_url}/rest/v1/knowledge_chunks",
        headers=headers,
        data=json.dumps(rows),
        timeout=30,
    )
    ins_r.raise_for_status()
    print(f"[OK] Ingested {len(rows)} chunks from '{source_filename}' → tenant {args.tenant_id}")


if __name__ == "__main__":
    main()

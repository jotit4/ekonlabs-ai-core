# ekonlabs-ai-core

## What This Is

Multi-tenant WhatsApp AI agent for medical clinics. Handles appointment scheduling, FAQs, and patient intake via the official Meta WhatsApp Business API. Built with LangGraph + FastAPI + Supabase + Redis.

One deployment serves multiple clinics (tenants). Each clinic has its own WhatsApp number, Google Calendar, knowledge base, and system prompt.

## Who It's For

Medical clinics, rehabilitation centers, and health professionals in Argentina who lose patients because they can't respond to WhatsApp messages outside business hours.

**First target client:** Instituto San Diego (ISADI) — rehabilitation/physiotherapy clinic in Mendoza, Argentina.

## Core Value

A patient writes on WhatsApp at 11pm. The agent responds immediately, answers questions about services, and books an appointment directly into the clinic's Google Calendar. The clinic wakes up to confirmed appointments, not missed messages.

## Architecture

```
WhatsApp (Meta Cloud API)
  → FastAPI webhook handler
  → Redis/RQ job queue
  → LangGraph agent worker:
      triage → anti_diagnostic → booking → scheduling → rag_retrieval → generation
  → Google Calendar API (booking)
  → Supabase (conversations, tenants, knowledge_chunks, thread_states)
  → WhatsApp (response)
```

## What's Built (v1.0 — BMAD Epics 1-4, completed March 2026)

- **Epic 1:** Architecture base — tenant CRUD, knowledge ingestion, system rules, rate limiting
- **Epic 2:** WhatsApp gateway — webhook handling, session memory, RAG retrieval, triage, anti-diagnostic
- **Epic 3:** Calendar integration — availability query, event creation/cancellation, kill switch (shadow mode)
- **Epic 4:** Human handoff — silence mode, agent resume

**Stack:** Python 3.11, FastAPI, LangGraph, langchain-openai (gpt-4o-mini), Supabase (pgvector), Redis/RQ, Google Calendar API v3, Docker + nginx

## Current Milestone: v1.2 Human-Feeling Agent

**Goal:** Make the agent feel like a human receptionist — the patient should not notice they're talking to a bot, either conversationally or in how effectively their problem gets resolved.

**Target features:**
- Full system prompt redesign: character brief with persona, protocols, tone, voseo
- LLM generates all patient-facing responses (no more hardcoded strings); deterministic nodes inject structured data as context
- Patient name collection before booking confirmation (multi-turn)
- LLM-driven RAG via tool calling (search_knowledge_tool), replacing pre-injection node
- Natural slot presentation and booking confirmations (no emoji lists, no templated copy)
- Proactive conversation guidance: LLM steers toward resolution after answering info questions

## Key Constraints

- **Language:** Argentine Spanish (voseo, regional idioms). All patient-facing copy must sound like a real WhatsApp conversation in Mendoza.
- **Medical context:** Agent must NEVER diagnose. Anti-diagnostic guardrail is non-negotiable.
- **Multi-tenant:** Every fix must preserve full tenant isolation.
- **1 week timeline:** Milestone must be completable in 5-7 working days.

## Business Model

- $150 USD one-time setup
- $100 USD/month subscription
- 48-hour activation promise
- 30-day money-back guarantee

## Active Requirements

See REQUIREMENTS.md

---
*Last updated: 2026-04-05 | Milestone: v1.2 Human-Feeling Agent*

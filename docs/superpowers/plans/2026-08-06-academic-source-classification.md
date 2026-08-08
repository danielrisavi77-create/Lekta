# Academic Source Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the supplied academic source classification migration to the Lekta repository and apply it to the shared Supabase project.

**Architecture:** Preserve the supplied SQL as an idempotent timestamped migration. Apply the same SQL to the remote Supabase project, then query the resulting columns, constraints, index, and migrated row values.

**Tech Stack:** Supabase PostgreSQL 17, Supabase MCP, SQL migrations, PowerShell.

## Global Constraints

- Do not overwrite unrelated existing work in the dirty worktree.
- Use `supabase/migrations` as the repository source of truth.
- Preserve owner-protected RLS; do not add public access policies.
- Run the repository hard gate `npm run check` before claiming repository verification.

### Task 1: Add the migration file

**Files:**
- Create: `supabase/migrations/20260806003106_academic_source_classification.sql`

- [x] Copy the supplied SQL into the timestamped migration file without changing its schema behavior.
- [x] Confirm the new file is the only task-owned migration change.

### Task 2: Apply the migration remotely

**Inputs:**
- Project: `zrrjttizjyfcxmcpgzml`
- Migration name: `academic_source_classification`
- SQL: the exact contents of the repository migration file.

- [x] Apply the migration through the Supabase migration tool.
- [ ] If the remote operation fails, stop and report the database error without retrying blindly.

### Task 3: Verify schema and data

- [x] Query `public.academic_sources` for `source_type`, `full_text_available`, and `classification_confidence` defaults and nullability.
- [x] Query the two named check constraints and `academic_sources_project_type_idx`.
- [x] Query counts and values proving existing rows were classified and chunk-backed rows were marked as full text.
- [ ] Run `npm run check` and report its exact result. `tsc --noEmit` and `vite build` passed separately, but the full Vitest suite timed out after 10 minutes without a result.

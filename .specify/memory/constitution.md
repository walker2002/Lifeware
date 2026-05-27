<!--
  Sync Impact Report
  ==================
  Version change: 1.7.1 → 1.7.2
  Rationale: PATCH — Added Form Component Reuse Constraint to CN-UI Protocol
  Constraints: forms MUST reuse Domain components via adapters, not maintain 
  independent field definitions. No new principles or governance changes.

  Modified sections:
    - Architecture Constraints > Domain Registration Process (Step 6
      clarified: view_routes now include url field; routes generated
      at build time via scripts/generate-routes.ts; app/ routes are
      auto-generated thin wrappers)
    - CN-UI Protocol Constraints (Form Component Reuse Constraint added)

  Modified principles:
    - None (implementation detail only)

  Templates requiring updates:
    - .specify/templates/plan-template.md            ✅ no changes needed
    - .specify/templates/spec-template.md             ✅ no changes needed
    - .specify/templates/tasks-template.md             ✅ no changes needed

  Follow-up documents requiring updates:
    - docs/route-generation-spec.md                   ✅ created
    - manifest.md                                     ✅ updated (added route-generation-spec)
-->

# Lifeware Constitution

## Core Principles

### I. Intent-Driven, Not Feature-Driven

The system responds to user intent rather than presenting features. The
Intent Engine is the **sole entry point** for all write operations,
including those originating from the Bridge Layer. The Action Surface
Engine is the **sole output channel**. No component may bypass this
intent-to-action pipeline.

Intent Engine processing has two distinct phases:

- **Phase A (Routing)**: A bounded classification task that maps user
  input to a `(targetDomain, action, pathType)` triple with
  confidence score. This is "interpretive execution" — AI MUST
  participate. Domain manifests provide `intent_triggers` as
  structured routing context. The output space is bounded: only
  registered Domain actions are candidates. `pathType` is one of
  `contract`, `generative`, or `query` — determined by matching
  the action against manifest `actions`, `generation_actions`, or
  `query_actions` respectively. Low confidence triggers user
  clarification.
- **Phase B (Field Completion)**: A structured extraction task that
  populates `StructuredIntent` fields from user input and Domain
  `required_fields`. This is "contract execution" — output types are
  determined. AI assists but the result is deterministic.

Users may submit intent through three input methods: natural language
(default path through both phases), slash shortcuts (`/domain:action`,
fast path skipping Phase A with confidence = 1.0), or function menu
(direct template form). Slash shortcuts and function menu enter
Phase B directly.

For complex create/plan operations, an AI Markdown workflow is
supported: AI generates Markdown from Domain-defined templates and
user attachments, user edits collaboratively, Intent Engine parses
confirmed Markdown into `StructuredIntent`(s) following the standard
Nexus chain. Cross-Domain batch processing from a single Markdown is
deferred to post-MVP.

**Rationale**: Ensures every system mutation is traceable to a user
intention. The two-phase model separates AI-dependent classification
from deterministic field extraction, enabling clear testing boundaries
and graceful degradation (Phase A failure → template form fallback).

**How to apply**: Any new write path MUST route through Intent Engine.
UI components MUST NOT directly call State Machine or Repository
write methods. Domain manifests MUST include `intent_triggers` for
Phase A routing context.

### II. Energy-First Scheduling

Energy is a co-equal scheduling dimension with time. The Rule Engine's
highest enforcement principle is: "Energy mismatch, execution does not
start." The system MUST use user-calibrated energy data rather than
system predictions. MVP scope: single energy dimension (1–10 scale).

**Rationale**: Distinguishes Lifeware from conventional time-management
tools. Biological rhythm awareness is a core value proposition.

**How to apply**: Timebox creation and task scheduling MUST validate
energy compatibility. User calibration values override system defaults.

### III. Single-Writer Invariant

Five components hold exclusive write authority — no other component may
usurp their responsibilities:

| Component | Exclusive Authority |
|---|---|
| State Machine | System state writes; generic lifecycle executor that validates transitions against Domain manifest `lifecycle` declarations (accepts only StateProposal from Orchestrator or time triggers) |
| Memory Framework | Memory writes (all levels L1–L5); Derived Signals as the sole read interface for external consumers |
| Intent Engine | Intent parsing and StructuredIntent production |
| Action Surface Engine | Output presentation (Action Guide, Dynamic Tile, Continuity Cue) |
| Context Engine | Context assembly for generative operations; reads manifest `generation_actions`, resolves Context Capabilities, produces `GenerationRequest` |

AI Runtime's Session Manager coordinates with Memory Framework L1 for
session history but MUST NOT bypass Memory Framework's write authority.
All session message writes MUST go through Memory Framework's API.
AI Runtime is infrastructure (model routing, token accounting,
CN-UI protocol), not a writer of system state.

**Rationale**: Prevents race conditions, ensures auditability, and
enables each component to reason about its invariants without
coordinating with peers. Context Engine is the sole authority for
assembling cross-Domain context data — no Handler may fetch its own
context, and no other component may produce GenerationRequests.

**How to apply**: Code reviews MUST reject any PR where a component
outside these five performs its reserved write operation.

### IV. USOM Sovereignty & Document Authority

The priority chain for resolving design disputes is:

**USOM Document > Database Design Document > Schema Code**

Every capability MUST map to a USOM object; if it cannot, it MUST NOT
be implemented. New USOM fields MUST be defined in documentation before
code. Domain plugins MUST only receive `USOMSnapshot` — never
`ContextSnapshot` or raw database rows.

**Rationale**: Documentation-first development prevents code-driven
schema drift and ensures all stakeholders share a single mental model.

**How to apply**: When schema code conflicts with USOM documentation,
the documentation wins. Update the document first, then align the code.

### V. Repository Interface Isolation

Nexus components MUST NOT directly call Drizzle. All data access goes
through Repository interfaces whose input/output types are USOM objects
or USOM IDs — never database row objects. Raw SQL is prohibited; all
queries use the Drizzle query builder. Drizzle schema is the single
schema source for all platforms.

**Rationale**: Enables future database migration (PostgreSQL → SQLite
WASM) without modifying Nexus logic. Decouples business rules from
storage implementation.

**How to apply**: Any `import` of Drizzle symbols in Nexus or Domain
files is a violation. Repository files are the only permitted location.

### VI. Domain Plugin Dual-Track Model

Domain plugins operate under a dual-track model, separating passive
constraint checking from active generation:

#### Reactive Track — Hooks (Constraint System)

Four hooks with three prohibitions (unchanged):

**Permitted (four hooks)**:
1. `onValidate` — structural validation of intents
2. `onEvent` — return metrics and suggestions (no state mutation)
3. `onActionSurfaceRequest` — return action candidates
4. `onOutboundRequest` — declare outbound push intent (optional, not in MVP)

**Prohibited**:
1. Writing state directly
2. Autonomous execution without Nexus orchestration
3. Accessing other domains' internal data

#### Generative Track — Handlers (Planning System)

Domain-defined computational units that receive `GenerationRequest`
from Context Engine and produce `GenerationResult`. Handlers are the
sole location for generative AI logic within Domain Plugins.

**Handler entry points**:
- `onGenerate(request: GenerationRequest, aiRuntime: AIRuntime)` —
  for generative operations. AI Runtime is injected as a dependency —
  Handler decides how to use it (call frequency, model parameters,
  tool use, CN-UI vs. text output).
- `onQuery(context: QueryContext, aiRuntime?: AIRuntime)` — optional
  hook for complex analysis queries (Handler Path). Only needed when
  query results require LLM processing or data aggregation. AI Runtime
  is provided when `response_mode === 'text'` or when the Handler
  needs AI for data analysis. Shortcut Path queries bypass Handler
  entirely — Orchestrator assembles read-only CN-UI directly.

Orchestrator does not call AI Runtime directly in any path.

**Handler constraints**:
- Handlers MAY call AI via injected `aiRuntime` (unique among Domain
  components)
- Handlers own prompt design and Zod schema definition (MVP: inlined
  in .ts files; PromptTemplate Registry deferred to Phase 2)
- Handlers MUST NOT access repositories directly — all data arrives
  via `GenerationRequest.contexts` assembled by Context Engine
- Handlers MUST NOT write state — output is `GenerationResult`
  (structured proposals or CN-UI Payload), which re-enters the
  Reactive Path via Rule Engine validation and State Machine execution
- Handlers MUST NOT trigger events directly

#### Context Providers (Controlled Sharing Interface)

Each Domain MAY declare `ContextCapability` entries in the Context
Registry, exposing read-only projections of its internal data for
cross-Domain consumption by Handlers.

**Provider constraints**:
- Providers are limited to read, project, and lightweight aggregate
  operations from their own Domain's Repository
- Providers MUST NOT perform planning, decision-making, complex
  computation, or call AI
- All Provider output MUST pass Zod schema validation

**Visibility control**:

| Level | Meaning | Consumers |
|---|---|---|
| `private` | Domain-internal only | None (reserved) |
| `planning` | Planning operations | Handlers via Context Engine |
| `system` | System-global | All Nexus components |

MVP stage: all Providers use `planning` visibility.

#### Manifest Declarations

Domain manifests MUST include two structured fields enabling Nexus
components to operate generically without per-Domain hard-coding:

1. `intent_triggers`: Structured routing context for Intent Engine
   Phase A (action name, description, examples, keywords, signals,
   excludes). Enables bounded classification without hard-coding
   routing logic into Intent Engine.
2. `lifecycle`: Object lifecycle definitions and state transition
   rules (from → to, trigger type `'intent'|'time'`, irreversible
   states). Enables State Machine to validate transitions generically
   without per-Domain business knowledge.

These are passive declarations, not execution capabilities. They do
not violate Domain passivity.

In addition to `intent_triggers` and `lifecycle`, manifests MUST
include the complete six-block structure defined in the Domain
Registration Guide: field metadata (C), list actions (D),
required fields and templates (E), and event subscriptions (F).
Each block serves a distinct consumer (Presentation Layer, Intent
Engine, Event Bus) and MUST NOT be omitted.

For Domains with generative capabilities, manifests MAY include a
`generation_actions` block declaring Handler entry points and their
required Context Provider dependencies (see Architecture Constraints >
Domain Manifest Self-Description).

For Domains with query capabilities, manifests MAY include a
`query_actions` block declaring read-only query actions. Query actions
bypass Rule Engine and State Machine — they produce no state mutation.
Each query action declares `response_mode` (text or cnui), optional
`cnui_surface`, and `context_capabilities` for data assembly.
`session_mode` is forced to `multi_turn` for all query actions — no
`single_round` option is permitted (see Architecture Constraints >
Query Path Constraints).

For Domains with view routes (page navigation), manifests MUST include a
`view_routes` block declaring page component mappings. Each entry
includes the `component` path (relative to `src/`) and a `url` field
declaring the Next.js App Router path. Routes are generated at build
time by `scripts/generate-routes.ts` from these declarations. This
build-time generation maintains Domain independence despite Next.js
App Router's constraint that routes must exist in the `app/` directory
(see Architecture Constraints > Domain Registration Process for details).

**Rationale**: The dual-track model keeps the proven "four-hook,
three-prohibition" constraint system intact while providing a clean
home for generative AI operations. Hooks remain pure constraint
checks; Handlers own the planning logic. Context Providers solve
cross-Domain data sharing without violating Domain isolation.
AI Runtime is infrastructure — Handlers use it, but are not
controlled by it. Build-time route generation from `view_routes.url`
maintains Domain independence while accommodating Next.js constraints.

**How to apply**: Each domain plugin file MUST implement the four
hooks for the Reactive Track. Domains with generative needs MUST
also implement `onGenerate` handler methods and register Context
Capabilities. Domains with view routes MUST declare `url` in
`view_routes` and run `npm run generate:routes` (or `npm run dev` which
runs it automatically) to generate `app/` route files. Any state-mutating
code inside a Domain is a violation regardless of track. Adding a new
Domain MUST NOT require modifying Intent Engine routing logic or State
Machine transition rules. Refer to
`mydocs/core/LW_domain_注册指南_2026_05_14.md` for the complete
step-by-step registration process.

### VII. Bridge Layer Readiness

Bridge Layer constraints take effect from the first line of MVP code:

| ID | Constraint |
|---|---|
| A | All external writes MUST traverse the full Nexus chain (Intent Engine → Rule Engine → State Machine) |
| B | MCP Tools expose only read queries and intent submission — no direct CRUD |
| C | Derived Signals is the ONLY memory entry point for Agent reads; L2–L5 layers are not exposed |
| D | Nexus method signatures MUST NOT depend on HTTP context; they MUST be callable from Bridge Layer |

Bridge Layer implementation is deferred to Phase 2, but interface
compatibility is enforced from MVP.

**Rationale**: Prevents architectural shortcuts during MVP that would
require breaking refactors when Bridge Layer is added.

**How to apply**: Nexus methods MUST accept plain USOM types, not
Request/Response objects. Any HTTP-aware type in Nexus is a violation.

### VIII. AI/Rule Boundary

AI handles ambiguity; rules handle certainty. AI participates in Intent
Engine Phase A (routing classification) and Phase B (field extraction),
Presentation (report generation), Domain Plugin Handlers (generative
planning within Domain scope), and Domain Plugin Handler onQuery
(complex analysis queries). AI MUST NOT participate in Rule Engine,
State Machine, Context Engine, or time-conflict detection. AI generates
proposals — it NEVER directly writes system state.

The Intent Engine two-phase model enforces this boundary: Phase A
(routing) is interpretive and AI-dependent; Phase B (field completion)
and all subsequent stages are contract-type execution where AI assists
but output types are predetermined. Once `StructuredIntent` is formed,
the pipeline is fully deterministic — except for the Query Path, which
bypasses Rule Engine and State Machine entirely by design (read-only
queries produce no state mutation to validate or execute).

In the Generative Path, Handler output (`GenerationResult`) re-enters
the deterministic pipeline: Rule Engine validates, State Machine
executes. AI participation is confined to the Handler boundary —
Context Engine assembles data deterministically, Rule Engine validates
deterministically.

AI Runtime provides infrastructure for Handlers (model routing, retry/
fallback, token accounting, CN-UI protocol) but does not make business
decisions. LLMProvider retry/fallback is transparent to Handlers —
they only see final success or `AIRuntimeError`. Handler AI failures
MUST degrade to rule-based fallback.

When AI fails, the Intent Engine MUST degrade gracefully to template-form
fallback, producing an equivalent `StructuredIntent`. When Handler AI
fails, the system MUST degrade to rule-based fallback (e.g., priority
ordered scheduling) ensuring a proposal is always produced.

**Streaming boundary**: CN-UI scenarios use non-streaming `generate()`
because the Payload is structured JSON that cannot be parsed in
intermediate states. Only pure-text scenarios use streaming `stream()`.
Frontend loading animations cover the 2–5 second wait for CN-UI
generation.

**Rationale**: Deterministic rules ensure safety invariants (energy
mismatch, WIP limits). AI provides flexibility where rules cannot
cover all cases. The Generative Path preserves this boundary by
wrapping AI output in structured proposals that pass through the same
deterministic validation pipeline.

**How to apply**: Rule Engine files MUST NOT import AI/LLM SDKs. Intent
Engine files MUST include a non-AI fallback path tested independently.
Handler files MUST include a rule-based fallback path. Phase A and
Phase B MUST have separate test suites — Phase A tests routing
accuracy, Phase B tests field extraction completeness.

## Architecture Constraints

### Multi-Tenancy (From Day One)

| ID | Constraint |
|---|---|
| T-01 | All business tables MUST contain `user_id` foreign key |
| T-02 | All queries MUST include `user_id` filter; Repository layer handles injection |
| T-03 | Nexus components MUST NOT be aware of `user_id` |
| T-04 | `ContextSnapshot` and `USOMSnapshot` MUST include `userId` |

### Database Access

| ID | Constraint |
|---|---|
| R-01 | Nexus components MUST NOT directly call Drizzle |
| R-02 | Repository input/output MUST be USOM objects or IDs |
| R-03 | Repository handles bidirectional DB ↔ USOM mapping |
| R-04 | UI components MUST only receive USOM objects |

### JSONB Usage

**Allowed**: Event payloads, configuration/metadata, embedded documents
(ReviewSection[]), optional complex objects (RecurrenceRule).

**Forbidden** (must be independent columns with indexes): Status fields,
time fields (`due_date`, `start_time`), foreign key references, enum
fields (`priority`, `energy_level`).

### Event Sourcing

`system_events` is append-only. The Repository MUST expose only `insert`
— never `update` or `delete`. Modifying historical events is an
architectural violation.

### Orchestrator Purity

The Orchestrator is a pure dispatcher. It MUST NOT contain business
logic, write state, or call AI Runtime directly. It handles exceptions,
retries, human-decision pause points, and cross-Domain intent
splitting (sequential processing of multiple `StructuredIntent`s
derived from a single user input) only.

For generative operations, the Orchestrator identifies the correct
path by checking whether the action exists in the Domain manifest's
`generation_actions` block. If present, it:
1. Delegates data assembly to Context Engine
2. Prepares Session (if `session_mode === 'conversational'`)
3. Injects `aiRuntime` as a parameter to `handler.onGenerate()`
4. Receives Handler output and routes to Rule Engine

For query operations, the Orchestrator checks the Domain manifest's
`query_actions` block. If present, it:
1. Delegates data assembly to Context Engine (same `assemble()`
   call, reading `query_actions.context_capabilities`)
2. Determines sub-path:
   - **Shortcut Path** (simple display queries): Orchestrator
     directly assembles read-only CN-UI Payload from Context Engine
     data. No Handler involvement. This is UI assembly, not business
     logic — Orchestrator packages data into display format using
     manifest-declared `cnui_surface` type.
   - **Handler Path** (complex analysis queries): Orchestrator calls
     `handler.onQuery(context, aiRuntime)` for LLM-powered analysis.
3. Records query result summary to Session via `memoryFramework.record()`
4. Session remains active (forced `multi_turn`)

The Orchestrator never performs AI calls, prompt assembly, model
selection, or conversation history management itself.

### Domain Manifest Self-Description

Domain manifests MUST declare structured fields enabling Nexus
components to operate generically without per-Domain hard-coding:

| Field | Consumer | Purpose |
|---|---|---|
| `intent_triggers` | Intent Engine (Phase A) | Bounded classification context for routing user input to Domain actions |
| `lifecycle` | State Machine | Object lifecycle definitions and transition rules for validating state changes |
| `view_routes` | Build-time route generator | Maps component paths to Next.js App Router URLs for auto-generating `app/` route files |

For Domains with generative capabilities, manifests MAY declare a
fourth structured field:

| Field | Consumer | Purpose |
|---|---|---|
| `generation_actions` | Context Engine + Orchestrator + AI Runtime | Handler entry points and their required Context Provider dependencies |

The `generation_actions` block maps each generative action to:
- Which Context Capabilities to resolve (by id)
- Query parameters for each Provider
- Parameter extraction from `intent.fields`
- `session_mode`: `'single_shot'` or `'conversational'`
- `response_mode`: `'text'` or `'cnui'`
- `cnui_surface`: CNUISurface type identifier (when response_mode is cnui)
- `cache_ttl_minutes`: Cache validity period (optional)

For Domains with query capabilities, manifests MAY declare a fifth
structured field:

| Field | Consumer | Purpose |
|---|---|---|
| `query_actions` | Orchestrator + Context Engine | Read-only query actions with response mode and data requirements |

The `query_actions` block maps each query action to:
- `action`: Unique action name within the Domain
- `description`: Human-readable description for Intent Engine routing
- `response_mode`: `'text'` (LLM-generated answer) or `'cnui'` (read-only display)
- `cnui_surface`: CNUISurface type identifier (when response_mode is cnui)
- `context_capabilities`: Required Context Provider dependencies for data assembly
- No `session_mode` field — all query actions are forced `multi_turn`

This enables Context Engine to assemble `GenerationRequest`,
Orchestrator to identify generative vs. reactive paths, and AI Runtime
to determine streaming policy — all without Domain-specific code.

For view routes, the `view_routes` block maps each view action to:
- `action`: Unique action name within the Domain
- `component`: Component path (relative to `src/`, e.g., `domains/habits/pages/HabitListPage`)
- `url`: Next.js App Router path (e.g., `/habits`, `/habits/templates`, `/okrs/:id`)
- `params`: Optional static parameters to pass to the component

The build-time route generator (`scripts/generate-routes.ts`) reads all
Domain manifests' `view_routes.url` declarations and generates the
corresponding `app/` directory route files. Only routes for components
that actually exist are generated. Generated files include an
"Auto-generated" header comment and MUST NOT be manually edited.

This enables Domain independence: adding a Domain requires no manual
edits to the `app/` directory — the build script auto-generates the
necessary route files from manifest declarations. Deleting a Domain
and running `npm run generate:routes --clean` removes orphaned routes.

These declarations MUST be structured (not free-form text) to enable
deterministic processing. Adding a new Domain MUST NOT require
modifying Nexus components — only registering new manifest declarations.

**Rationale**: Prevents coupling leakage between State Machine and
Domain-specific lifecycle rules. State Machine is a generic executor;
Domain manifests are the business knowledge source. The
`generation_actions` block extends this principle to generative
operations, keeping Context Engine, Orchestrator, and AI Runtime
generic. Build-time route generation extends this principle to view
routes, maintaining Domain independence despite Next.js App Router's
constraint that routes must exist in `app/`.

### Manifest Runtime Consumption

`manifest.yaml` is a **runtime configuration artifact**, not a
development-time reference document. Its values MUST be loaded and
consumed at runtime through the Domain registry — never duplicated as
hardcoded constants in source code.

**Concrete rules**:

1. **Nexus components MUST read manifest values from the registry at
   runtime.** If Intent Engine needs to know available actions, it MUST
   query the manifest registry — not maintain a parallel
   `SUPPORTED_ACTIONS` constant. If State Machine needs lifecycle rules,
   it MUST load them from the manifest's `lifecycle` block.

2. **AI code generation MUST treat manifest content as configuration to
   be loaded, not as documentation to be duplicated.** When generating
   Domain scaffolding, AI MUST emit code that reads from the manifest
   via the registry — not code that hardcodes manifest values (action
   names, lifecycle states, field lists) into TypeScript constants.

3. **The manifest is the single source of truth** for its declared
   blocks (A–F, plus optional G–J). Any component needing data from a
   manifest block MUST obtain it through the manifest loading mechanism,
   not through code that duplicates the same data.

4. **Build-time route generation MUST read view_routes from manifests.**
   The `scripts/generate-routes.ts` script loads all Domain manifests
   at build time, reads the `view_routes.url` declarations, validates
   component existence, and generates `app/` route files. This is the
   authoritative source for route URLs — manual `app/` route files
   are thin wrappers that MUST NOT diverge from manifest declarations.

**Hardcoding detection — code smells indicating violation**:

- A constant array of action names that mirrors `manifest.yaml`
  `intent_triggers`
- A state transition map in TypeScript that duplicates `manifest.yaml`
  `lifecycle`
- A field validation list in code that copies `manifest.yaml`
  `required_fields`
- Inline string literals matching manifest values used for comparison
  instead of reading from the loaded manifest
- Manually created `app/` route files that don't match `view_routes.url`
  declarations

**Rationale**: When manifest content is hardcoded, changes to the
manifest have no effect until the code is also updated, defeating the
purpose of a declarative manifest. Runtime consumption ensures manifest
changes take effect immediately, keeping Nexus truly generic and
enabling zero-code Domain configuration updates. Build-time route
generation ensures `app/` routes stay in sync with `view_routes`
declarations without manual maintenance.

**How to apply**: Code reviews MUST reject PRs where manifest-derived
values are duplicated as constants. The Domain registry MUST expose
manifest data through accessor methods. AI assistants generating Domain
code MUST generate registry reads, not value copies. Route files
MUST include "Auto-generated" headers; manual edits to generated
routes are overwritten on the next `npm run generate:routes`.

### Context Provider Constraints

Context Providers are a controlled sharing mechanism that preserves
Domain isolation while enabling cross-Domain data access for
generative operations.

**Three constraints**:

1. **Read-only projection**: Providers MUST only read from their own
   Domain's Repository. They MAY filter, transform, and aggregate
   data into a sharing format, but MUST NOT modify any data.

2. **No complex computation**: Providers MUST NOT perform planning,
   decision-making, complex calculations, or call AI. Complex logic
   belongs in Handlers. Providers are limited to lightweight
   operations: query, filter, map, count, sum.

3. **Schema-validated output**: All Provider output MUST pass Zod
   schema validation registered with the `ContextCapability`. This
   ensures consumers receive well-typed data and prevents Provider
   output drift.

**Provider ≠ Repository**: Repository manages Domain internal CRUD
and transactions. Provider exposes read-only projections for external
consumption. They serve different consumers and have different
constraints.

**Rationale**: Without Providers, Handlers would need direct access to
other Domains' Repositories, violating Domain isolation (Principle VI
Prohibition 3). Providers create a controlled, validated, visibility-
gated sharing channel that keeps Domains composable.

**How to apply**: Each Provider MUST be registered in the Context
Registry with a unique capability id, visibility level, and Zod
schema. Code reviews MUST reject Providers that contain planning logic,
AI calls, or write operations.

### AI Runtime Constraints

AI Runtime is Nexus infrastructure, not a Domain component. It provides
shared AI capabilities via dependency injection into Handlers.

**Seven constraints**:

1. **Dependency injection, not middleware**: AI Runtime is injected
   into Handler's `onGenerate` hook as a parameter. Orchestrator does
   not call AI Runtime directly. AI Runtime is invisible to Reactive
   Path (onIntent hooks).

2. **Handler AI autonomy**: Handler decides how to use the injected
   `aiRuntime` — call frequency, model parameters, tool use, CN-UI
   vs. text output, streaming vs. non-streaming. AI Runtime provides
   the mechanism; Handler provides the strategy.

3. **LLMProvider resilience is transparent**: Retry (timeout, rate
   limit), fallback model switching, and error handling happen inside
   LLMProvider. Handlers see only final success or `AIRuntimeError`.
   Handlers implement domain-level degradation (e.g., rule-based
   fallback) by catching `AIRuntimeError`.

4. **Streaming policy**: CN-UI scenarios MUST use non-streaming
   `generate()` (JSON Payload cannot be parsed in intermediate
   states). Pure-text scenarios MAY use streaming `stream()`.
   Handler specifies `stream: boolean` per request.

5. **CN-UI Schema validation at generation time**: LLM-generated
   CN-UI Payloads MUST pass Zod schema validation inside
   `generateCNUIObject()`. Failed validation triggers one repair
   retry with Zod error context. Two consecutive failures raise
   `CNUISchemaError` for Handler-level degradation.

6. **Session lifecycle**: Session Manager creates/activates/archives
   sessions per manifest `session_mode`. Sessions are linked to Memory
   Framework L1 — all message writes go through Memory Framework API.
   Session history injection into GenerationRequest is Orchestrator's
   responsibility, not Handler's.

7. **MVP scope**: Token Budget records usage and exposes daily
   summaries — no hard limits. PromptTemplate Registry is deferred
   (prompts inlined in Handler .ts files). CNUISurfaceStore is an
   in-memory Map — no persistence, optimistic locking, or history
   snapshots.

**Rationale**: AI Runtime provides uniform, safe, cost-effective AI
infrastructure while preserving Handler autonomy. The dependency-
injection model prevents AI Runtime from becoming a middleware layer
that couples Orchestrator to AI decisions.

**How to apply**: Code reviews MUST reject PRs where Orchestrator
directly calls `aiRuntime.generate()` or `aiRuntime.stream()`. AI
Runtime imports in Domain hook files (onValidate, onEvent, etc.) are
violations — AI Runtime is only accessible via `onGenerate`'s injected
parameter.

### CN-UI Protocol Constraints

CN-UI (Conversation Native UI) is a declarative Payload protocol that
allows Handlers to produce interactive UI components within the
conversation flow.

**Four constraints**:

1. **Declarative data, not executable code**: CN-UI Payloads are JSON
   data describing component structure, props, and actions. They
   MUST NOT contain executable JavaScript, HTML, or CSS. The CN-UI
   Renderer interprets Payloads using pre-built React components.

2. **Component catalog whitelist**: Agents (LLM-generated Payloads)
   MAY only reference components registered in the Component Catalog
   — both base UI components (text-input, select, slider, etc.) and
   domain components (habit-creation-card, timebox-list, etc.).
   Unknown component types in a Payload MUST be rejected by
   `generateCNUIObject()` schema validation.

3. **Conversation-closed-loop**: CN-UI interactions MUST complete
   within the conversation flow. User actions (confirm, cancel,
   modify) are captured as CNUIEvents, processed by SurfaceManager,
   and result in structured data entering Rule Engine → State Machine.
   CN-UI MUST NOT navigate users to separate pages.

4. **Form Component Reuse Constraint**: 当 CN-UI 表面需要渲染与 Domain 页面编辑面板相同的表单时，
   MUST 通过适配层（CnuiFormAdapter）复用 Domain 的 Form 组件，MUST NOT 维护独立的字段定义和验证逻辑。
   Domain 的 Form 组件是表单实现的唯一来源。新 Domain 只需注册 FormAdapterConfig 即可在三种上下文
   （页面编辑面板、GrowthMenu 入口、AI 助手 CN-UI）中复用同一表单实现。

**Rationale**: CN-UI solves the experience fragmentation problem
(form jumps, Markdown editing) while maintaining Nexus safety
guarantees. The declarative + whitelist model prevents security risks
from LLM-generated executable code.

**How to apply**: Each CN-UI component type MUST be registered in the
Component Catalog before use. Code reviews MUST reject Payload
generation that includes components not in the Catalog. CN-UI event
handling MUST flow through SurfaceManager → Handler → Rule Engine,
never directly to Repository.

### Query Path Constraints

Query Path is the third routing path in the Orchestrator, handling
read-only data queries. It bypasses Rule Engine and State Machine
by design — queries produce no state mutation.

**Six constraints**:

1. **Read-only invariant**: Query Path MUST NOT modify any system
   state. It produces no `StateProposal`, requires no user
   confirmation, and triggers no `StateChanged` events. Query
   results are display-only — the data equivalent of a SELECT
   statement without side effects.

2. **Forced multi_turn**: All `query_actions` MUST use `multi_turn`
   session mode. The `session_mode` field is not declared in
   `query_actions` — it is forced by the system. This ensures
   query results remain available for follow-up conversation
   (追问, cross-reference, intent transition) within the same
   Session.

3. **Two sub-paths determined by response_mode**:
   - **Shortcut Path** (`response_mode === 'cnui'` and data is
     directly displayable): Orchestrator assembles read-only CN-UI
     Payload from Context Engine data without Handler involvement.
     Permitted because this is UI assembly, not business logic.
   - **Handler Path** (`response_mode === 'text'` or data needs
     LLM processing): Orchestrator delegates to
     `handler.onQuery(context, aiRuntime)` for AI-powered analysis.
     Handler decides how to use AI Runtime — same autonomy as
     `onGenerate`.

4. **Session context injection**: Context Engine MUST inject
   `session_context.priorQueries` into all subsequent requests
   within a Query Session. This enables follow-up questions
   ("why is the meditation streak so low?") to reference prior
   query results. Context Engine applies time-based relevance
   decay (not deletion) to manage staleness.

5. **Orchestrator CN-UI assembly permission**: For Shortcut Path,
   Orchestrator MAY directly assemble read-only CN-UI Payloads.
   This is an explicit exception to Orchestrator Purity — it is
   UI packaging (data → display format), not business logic.
   The assembled CN-UI MUST be read-only (no editable inputs,
   no confirm/cancel actions, only optional dismiss).

6. **Memory recording by Orchestrator**: After query execution,
   Orchestrator calls `memoryFramework.record()` with a query
   result summary (action, domain, object IDs, key metrics,
   timestamp). Full objects are NOT stored — only summaries that
   enable re-query when needed. Handler MUST NOT call
   `memoryFramework.record()` directly.

**Hard boundaries**:

```
✓ Permitted: Shortcut Path Orchestrator assembles read-only CN-UI
✓ Permitted: Handler Path onQuery calls AI Runtime for analysis
✓ Permitted: Orchestrator records query summary via Memory Framework
✓ Permitted: Context Engine injects session_context.priorQueries
✓ Permitted: Query Session transitions to Contract or Generative Path

✗ Prohibited: Shortcut Path calling Handler.onQuery
✗ Prohibited: Handler.onQuery calling State Machine
✗ Prohibited: Handler.onQuery directly accessing Repository
✗ Prohibited: Handler.onQuery calling memoryFramework.record()
✗ Prohibited: Query Path entering Rule Engine or State Machine
✗ Prohibited: query_actions declaring session_mode (forced multi_turn)
```

**Rationale**: Query Path addresses the "query as conversation
starter" pattern — users almost always follow up after seeing data.
The read-only invariant simplifies the execution chain (no Rule
Engine, no State Machine, no confirmation), while forced multi_turn
and session context injection enable natural follow-up conversation.
The Shortcut/Handler split avoids requiring a Handler for every
simple display query.

**How to apply**: Domains with queryable data MUST declare
`query_actions` in their manifest. Only Domains with complex
analysis queries (requiring LLM summarization or data aggregation)
MUST implement `onQuery`. Code reviews MUST reject any Query Path
code that produces state mutations or enters Rule Engine.

### Domain Registration Process

All new Domains MUST follow the mandatory registration process
defined in `mydocs/core/LW_domain_注册指南_2026_05_14.md`. This
section codifies the architectural invariants enforced by that process.

**Mandatory registration steps**:

1. Declare new USOM object types (if any) in USOM documentation
2. Write `manifest.yaml` with all six blocks (A–F), plus optional
   `generation_actions` for generative capabilities, optional
   `query_actions` for query capabilities, and optional `view_routes`
   for page navigation
3. Implement four hook functions (Reactive Track, pure functions)
4. Define Drizzle DB Schema
5. Implement Repository interface
6. Implement Domain page components (in `domains/{domain}/pages/`)
7. Declare `view_routes` with `url` field in `manifest.yaml`
8. Run `npm run generate:routes` to auto-generate `app/` route files from
   manifest declarations
9. Register Domain in `domains/registry.ts`
10. Implement Markdown templates (optional)
11. (If generative) Implement `onGenerate` handler method and register
    in `domains/<domain>/handlers/index.ts`
12. (If generative) Implement Context Providers and register in
    Context Registry with capability id, visibility, and Zod schema
13. (If query-capable) Declare `query_actions` in manifest with
    action, response_mode, cnui_surface, and context_capabilities
14. (If query-capable, complex queries only) Implement `onQuery`
    handler method and register in `domains/<domain>/handlers/index.ts`

**Build-time route generation (Step 6-8)**:

The `scripts/generate-routes.ts` script handles view route generation:
- Scans all Domain `manifest.yaml` files for `view_routes` blocks
- Validates that `url` field is present and properly formatted
- Validates that the declared `component` file exists
- Generates `app/{url_path}/page.tsx` files with "Auto-generated" header
- Skips generation for components that don't exist (warnings only)
- `--force` flag overwrites existing auto-generated files
- `--clean` flag removes orphaned routes (Domains deleted but app/
  files remain)

The generated `app/` route files are thin wrappers:
```tsx
// Auto-generated from domains/{domain}/manifest.yaml
// DO NOT EDIT MANUALLY
import { ComponentPage } from "@/domains/{domain}/pages/ComponentPage"
export default function ComponentPagePage() {
  return <ComponentPage />
}
```

package.json integration:
```json
{
  "scripts": {
    "generate:routes": "npx tsx scripts/generate-routes.ts",
    "predev": "npm run generate:routes",
    "prebuild": "npm run generate:routes"
  }
}
```

This ensures routes are regenerated on every dev server start and
production build, keeping `app/` in sync with manifest declarations.

**Nexus inviolability**: If completing any step requires modifying Nexus
core components (Intent Engine, Context Engine, Rule Engine, State
Machine, Action Surface Engine, Orchestrator, AI Runtime), the
boundary is broken. Stop and discuss before proceeding. The only
permitted Nexus modification is adding a new object's Summary to
`ContextSnapshot` — this is a legitimate aggregation need, not
coupling leakage.

**Page component data access rules**:

| Operation Type | Path | Rationale |
|---|---|---|
| Read (list, detail) | Repository directly | No state mutation, Rule Engine has no value |
| Write (create, update, delete, lifecycle) | `PrebuiltIntent` → Nexus chain | All state mutations must traverse full chain for consistency |

Page components MUST NOT:
- Directly call hook functions from `hooks.ts`
- Directly import Drizzle schema or `db/` modules
- Bypass Repository interface for data access

**Manifest completeness**: Every registered Domain MUST have a
`manifest.yaml` containing all six blocks (A–F). Incomplete manifests
(block C–F omitted) are a registration violation and MUST be resolved
before the Domain is considered production-ready.

**Rationale**: The registration process ensures every Domain is
self-contained, fully declared, and operates within Nexus boundaries
without requiring Nexus modifications. Build-time route generation
from `view_routes.url` maintains Domain independence despite Next.js
App Router's constraint that routes must exist in the `app/` directory.
This is the operational foundation for Domain Plugin Passivity (VI) and
the Single-Writer Invariant (III).

**How to apply**: Before implementing any new Domain, read the
Registration Guide in full. Verify each step's checklist before
proceeding to the next. The guide is the authoritative reference;
this constitution codifies the architectural invariants it enforces.

## Methodology Governance

### Design-Time vs. Runtime Separation

Design-time (developer + AI extracts principles into static config)
and runtime (Nexus executes codified rules; AI for dialog guidance
only) MUST NOT be conflated. Runtime MUST NEVER interpret raw
methodology text.

### Layer 1 Rule Immutability

Methodology rules (`methodology/rules/`) are cross-user principles
maintained via Git by humans. They MUST NOT be auto-modified by
execution data. Execution failure triggers calibration review, not
rule revision.

### Rule Engine Coaching, Not Gatekeeping

The Rule Engine produces exactly three result types: `pass`,
`warning`, and `confirm`. It MUST NEVER block user actions. Lifeware
is a coach, not a gatekeeper.

### Calibration Governance

Calibration proposals appear only during Review cycles — never
proactively interrupting the user. User responses: confirm (adjust
parameter), exception (reset counter, keep rule), or skip (reappear
next cycle).

### Conflict Arbitration Hierarchy

Methodology conflicts are resolved by strict tier priority:

- **Tier 0 (Hard constraints)**: Time exclusivity > Capacity limits
- **Tier 1 (Strong recommendations)**: Deadline urgency > Energy match
  > Timebox lock > OKR alignment > Habit protection
- **Tier 2 (Gentle suggestions)**: Alternating schedule / streak
  preservation / learning curve

Cross-tier conflicts: higher tier always wins.

## Governance

This constitution is the authoritative governance document for the
Lifeware project. In case of conflict between this constitution and
any other document, practice, or convention, this constitution takes
precedence — except where `LW_overall_项目开发必读` (Project Must-Read)
defines a higher-level product decision that supersedes architectural
rules.

### Document Ownership Model

All project documents follow a three-tier ownership model. The tier
determines who initiates changes and who executes them.

| Tier | Directory | Owner | Claude's Role |
|---|---|---|---|
| 1 — User-owned | `mydocs/` | User | Read-only. Updates only when user explicitly requests. |
| 2 — Co-maintained | `docs/` | User defines intent, Claude executes | Ensures consistency with code. User does not directly edit. |
| 3 — Auto-maintained | Root + `.specify/` | Claude | Mechanical tracking. User approves changes. |

**Tier 1 documents** (`mydocs/`): Product vision, architecture decisions,
methodology philosophy. These express the user's creative and domain
expertise. Claude MUST NOT modify them unless the user issues an
explicit instruction referencing a specific discussion outcome.

**Tier 2 documents** (`docs/`): Implementation-level design that MUST
stay in sync with code (`usom-design.md`, `database-design.md`,
`route-generation-spec.md`). The user describes intent ("add a
HabitLog object"); Claude updates the document, schema code, and
cross-references in one atomic change.

**Tier 3 documents**: `manifest.md` (version tracking), `CLAUDE.md`
(developer guidance), this constitution, and `specs/` (speckit
artifacts). Claude updates these mechanically when triggered by
workflow events or document changes.

### Amendment Procedure

1. Propose amendment with written rationale and impact analysis.
2. Verify no existing principle is violated without explicit
   superseding language.
3. Update this document and increment version per semantic versioning:
   - **MAJOR**: Principle removal, redefinition, or backward-incompatible
     governance change.
   - **MINOR**: New principle/section added or materially expanded
     guidance.
   - **PATCH**: Clarifications, wording fixes, non-semantic refinements.
4. Run consistency propagation across all Spec Kit templates.
5. Update `manifest.md` version history.

### Compliance Review

- All PRs MUST verify compliance with the Single-Writer Invariant (III),
  Repository Isolation (V), Domain Passivity (VI), and Bridge Layer
  Readiness (VII).
- Code commits violating Architecture Constraints (R-01 through R-04,
  T-01 through T-04) are treated as technical debt and MUST be resolved
  within the current iteration.
- Complexity introduced without necessity MUST be justified in the
  Complexity Tracking section of the implementation plan.

### Document Authority Chain

```
mydocs/core/项目开发必读         (product decisions — Tier 1)
    ↓
Lifeware Constitution           (architectural governance — Tier 3)
    ↓
mydocs/core/总体设计             (overall design constraints — Tier 1)
    ↓
mydocs/core/Domain注册指南       (Domain development process — Tier 1)
    ↓
docs/route-generation-spec.md    (route generation implementation — Tier 2)
    ↓
docs/usom-design.md             (object model definitions — Tier 2)
    ↓
docs/database-design.md         (physical schema — Tier 2)
    ↓
Drizzle Schema Code             (implementation)
```

The Domain Registration Guide (`mydocs/core/LW_domain_注册指南_*`)
is a Tier 1 document and required reading for all Domain development.
It provides the concrete step-by-step process that operationalizes the
architectural invariants defined in this constitution. The Route
Generation Spec (`docs/route-generation-spec.md`) is a Tier 2
document that specifies the build-time route generation mechanism
detailing how `view_routes.url` declarations become Next.js App Router
files.

**Version**: 1.7.2 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-27

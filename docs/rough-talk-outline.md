# Rough Talk Outline: Batteries vs. Speed

Based on `NOTES.md` and the Fireflies transcript `01KXZVYMX1MZCX2N2BWSZVDTKD`.

## Core thesis

There is no universally correct framework choice. Django (with Django Ninja for the closest API comparison) and FastAPI are both viable, active, well-supported choices. The useful question is not “Which framework wins?” but “Which trade-offs fit this application and this team?”

The recurring decision factors are:

- what the team already knows;
- whether the application is a focused API or likely to grow into a broader product;
- whether Django’s built-in and third-party batteries save meaningful work;
- whether the workload actually benefits from async or greater concurrency;
- whether a measured performance difference matters for the real application;
- and what deployment and operational path the team wants to own.

## Suggested 45-minute flow

### 1. Welcome, speaker introductions, and framing — 4 minutes

**On screen:** title, speaker names, and a persistent QR code linking to the public repository, slides, benchmark code, and results.

- Brief speaker introductions and relevant Django/FastAPI experience.
- Establish that this is a pragmatic, no-hype comparison.
- State up front: **there is no wrong answer here**.
- Set expectations: this is a guided conversation supported by code, evidence, and benchmarks—not a framework cage match.
- Clarify the comparison: for API work, the closest useful comparison is generally **Django + Django Ninja versus FastAPI**, with DRF included only where it provides helpful historical or feature context.

### 2. Meet the two approaches — 4 minutes

**Supporting slides:** one concise “why this exists” slide per framework.

- **Django:** mature full-stack framework, integrated conventions, ORM, admin, authentication, and a deep third-party ecosystem.
- **FastAPI:** API-focused framework with type-driven validation and documentation, an async-first story, and a smaller, composable core.
- Explain that both are opinionated, but about different things.
- Introduce the first decision heuristic:
  - focused, bounded internal service with little expected scope growth → FastAPI may be the natural fit;
  - application likely to need admin, workflows, content, permissions, or other product features → Django’s batteries may compound in value;
  - an experienced team’s existing knowledge may outweigh small technical differences.

### 3. “Did the slide change?” Code comparison — 4 minutes

**Supporting slides:** equivalent minimal Django Ninja and FastAPI endpoints, flipped back and forth with changed lines highlighted.

- Use the planned joke: one presenter claims the slide did not change.
- Highlight that the endpoint, schema, validation, and routing code are remarkably similar.
- Explain the few naming/import differences (`Schema`/Pydantic model, router/app, framework imports).
- Main takeaway: syntax is probably not a strong reason to choose one over the other.
- Briefly explain why Ninja is being used as a Django battery rather than treating older DRF patterns as the only Django API option.

### 4. Batteries, ecosystems, and build vs. buy — 8 minutes

**Supporting slides:**

1. concise feature matrix for Django + Ninja, FastAPI, and optionally DRF;
2. Django Activity Stream example;
3. django-fsm-2 lifecycle example;
4. build/buy/vendor decision diagram.

Conversation points:

- Both can start with relatively few project dependencies.
- Django supplies more integrated facilities and supports a much deeper ecosystem of reusable applications.
- FastAPI is closer to the Flask model in areas where no common ORM or full application architecture is assumed.
- FastAPI includes different batteries for API work, such as OpenAPI documentation, validation, OAuth-related tools, and WebSocket support.
- Use **Django Activity Stream** as an example of a thin reusable layer that provides substantial application behavior because it builds on Django’s ORM and conventions.
- Use **django-fsm → django-fsm-2** to show both sides of third-party reuse:
  - mature design and significant saved effort;
  - but maintenance, compatibility, and upgrade risk remain yours.
- Discuss choices when a dependency stalls: wait, contribute, fork, or vendor it.
- AI changes the cost curve of building or adapting code, but does not remove the responsibility to understand, test, secure, and maintain it.
- Neither ecosystem is disappearing; project health is not a useful scare tactic here.

### 5. Async? — 5 minutes

**On screen:** one intentionally simple slide: **“Async?”**, followed by **“Do you actually need it?”**

- Most applications do not benefit merely because more code is declared async.
- Async has costs: complexity, debugging difficulty, library/ORM boundaries, and operational understanding.
- It is valuable for high-concurrency, I/O-bound work—especially endpoints aggregating several independent services, long-lived connections, or WebSockets.
- Django has an async story; FastAPI has an async-first design. The practical difference depends on the complete request path, not just the view function.
- Existing Django applications can lose the expected FastAPI advantage if a FastAPI layer still depends on synchronous Django ORM work.
- Often only one endpoint or subsystem needs special treatment. A monolith plus one extracted service may be more appropriate than an all-async rewrite.

### 6. Benchmarks: useful, biased, and workload-specific — 10 minutes

**Opening slide:** **“All benchmarks are biased.”**

State the rules before showing results:

- These results describe these implementations, workloads, machines, and concurrency levels—not all Django and FastAPI applications.
- Compare equivalent behavior and data, not a feature-rich implementation against a toy endpoint.
- Publish all code, configuration, raw runs, environment details, and the commands needed to reproduce the tests.

#### Scenario A: Redis ZIP-code typeahead

- Identical API behavior in Django Ninja and FastAPI.
- Lookup against Redis so the endpoint performs realistic external I/O without involving an ORM.
- Run at lower and higher concurrency (the working idea was approximately 20 versus 200 concurrent connections).
- Use this to discuss async I/O and framework overhead without pretending it represents a complete application.

#### Scenario B: “Zellit” real-estate API

A Zillow/Reddit-inspired synthetic application:

- PostgreSQL read workload;
- ZIP-code demographics;
- homes joined to photos;
- optionally votes/comments or an activity feed;
- deterministic generated data, potentially using Faker.

Run equivalent endpoints at multiple concurrency levels. Show throughput plus latency and errors, not only requests per second. Explain where database time begins to dominate framework overhead.

#### Methodology

- Docker Compose for reproducible services.
- Artillery is the current proposed load generator; confirm it before implementation.
- Warm-up period and multiple measured runs.
- Run on both presenters’ machines if useful, but report each environment separately as well as any aggregate.
- Show medians and tail latency (at least p50/p95/p99), throughput, error rate, and resource use.
- Prefer pre-recorded results and visualizations during the talk; keep a live run optional rather than making the presentation depend on it.

#### Interpretation

- FastAPI may provide more headroom out of the box for some concurrent workloads.
- A modest measured difference may not outweigh Django’s ecosystem and team familiarity.
- Scaling Django usually means targeted changes, not necessarily a rewrite.
- Mention emerging alternatives such as Django Bolt only after checking their current maturity and benchmark relevance.

### 7. Deployment: easy path and production path — 5 minutes

**Supporting slides:**

1. FastAPI Cloud one-command/one-line deployment versus Django Simple Deploy and supported platforms;
2. a realistic container/Kubernetes architecture diagram.

- Show the attractive FastAPI Cloud developer experience, using the calendar application as a concrete example if appropriate.
- Compare it fairly with Django Simple Deploy and established Django-friendly platforms—not with a deliberately manual Django deployment.
- Separate framework choice from platform choice and current promotional/free-tier pricing.
- At larger production scale, both generally become containerized services with similar concerns:
  - database and connection pooling;
  - migrations;
  - secrets and configuration;
  - observability;
  - scaling and orchestration;
  - backups and incident response.
- Main takeaway: the easy path can differ; the mature operational architecture often converges.

### 8. Decision guide and closing — 5 minutes

**Supporting slide:** a short decision tree or two-column “choose based on constraints” list.

Choose **Django + Ninja** when:

- the team already knows Django;
- the product is likely to need Django’s ORM, admin, auth, permissions, templates/content, or reusable apps;
- ecosystem leverage is worth more than a possible framework-level speed difference;
- or an API is being added to an existing Django system.

Choose **FastAPI** when:

- the service is focused, bounded, and API-only;
- async I/O and high concurrency are central requirements;
- the team wants a composable stack rather than Django’s integrated conventions;
- or FastAPI’s deployment path and tooling materially reduce operational friction.

Mix them when:

- an existing Django product benefits from a separate high-concurrency service;
- Django owns the models/admin/product workflows while FastAPI serves a specialized API;
- or one subsystem has fundamentally different scaling or connection requirements.

Close with:

1. Measure your workload.
2. Value team knowledge and maintenance cost.
3. Buy batteries when they create leverage; build when the constraints justify ownership.
4. Either framework can be the right answer.
5. Return to the QR code for code, methodology, results, and references.

## Gaps in `NOTES.md` compared with the transcript

### Framing and scope

- The notes say “there is no wrong answer,” but omit the stronger transcript framing that **team familiarity may be the deciding factor**.
- They do not clearly state that the practical API comparison is **Django + Django Ninja vs. FastAPI**, not bare Django vs. FastAPI. This should be explained early to avoid an audience bait-and-switch reaction.
- They omit the transcript’s selection heuristics: focused internal service, expected scope growth, existing Django application, and future need for admin/product features.
- The notes do not capture the counterarguments around unused Django features: tiny disk-cost concerns are usually irrelevant, while security surface area and unnecessary middleware can be legitimate concerns.

### Presentation format and logistics

- No explicit 45-minute time budget or section timeboxes.
- No allowance for a close, questions, or schedule slippage.
- The transcript calls for a **scripted** podcast-style conversation, not completely free-form banter; prompts and handoffs still need to be written.
- The need for two microphones/lavs and confirmation with organizers is missing.
- The QR code should link to slides, demo code, methodology, raw results, and references—not merely “the repo.”
- The transcript recommends avoiding constant speaker switching; ownership of each section and handoff points remain undefined.

### Framework and ecosystem comparison

- “Feature comparison” is still a placeholder. The matrix needs named rows such as validation, OpenAPI/docs, routing, ORM assumptions, admin, auth/OAuth, permissions, templates, WebSockets, background work, testing, and deployment tooling.
- “What third-party FastAPI apps exist?” remains unanswered. The transcript found possible admin and auth options but reached no researched conclusion.
- The notes omit the key explanation that FastAPI can be both opinionated and unopinionated: it supplies API-oriented batteries while avoiding a common ORM/application architecture.
- The Flask analogy and why it affects reusable app ecosystems are absent.
- The Activity Stream example is unfinished (“Illustrate the batteries included via the …”). It needs a concrete before/after story showing what the dependency saves.
- The notes mention django-fsm-2 but not the actual lesson: a dependency can stall, be forked, and return under community maintenance; users still own upgrade risk.
- The transcript’s nuanced AI point is missing: AI can make vendoring or adaptation cheaper, but generated code still creates maintenance and review obligations.
- The assertion that both projects are active and supported needs evidence and current project-health references.

### Async

- The notes need concrete examples of workloads that benefit: parallel service aggregation, WebSockets/long-lived connections, and large numbers of I/O-bound requests.
- They omit the warning that an async FastAPI endpoint can still be constrained by synchronous ORM or library calls.
- They omit the “one subsystem” architectural option: retain a Django monolith and extract only the endpoint/service that needs different concurrency characteristics.
- The exact current limits and capabilities of Django’s async ORM/request stack need fact-checking before slides are written.

### Benchmarks

- No explicit statement that the two implementations must provide identical behavior, data, validation, server configuration, and dependency versions.
- The notes say 20 versus 200 connections but do not define request rate, duration, warm-up, number of runs, hardware, server workers, or concurrency semantics.
- They do not specify metrics beyond an implied speed number. Include latency distributions, throughput, error rate, and CPU/memory—not only requests per second.
- The transcript adds running tests multiple times on both presenters’ machines. A stronger plan should report environments separately and avoid an opaque average across unlike machines.
- No plan exists for publishing raw benchmark artifacts or tying every chart to a reproducible run.
- Artillery is proposed but not finalized; Locust was discussed and rejected only informally.
- The Redis and PostgreSQL datasets, sizes, indexes, query shapes, cache state, connection pools, and data-generation seeds remain undefined.
- The notes alternate between “Zellit,” “Zellit/Zellit-like,” and the transcript’s spoken “Zealot.” Pick a name and spelling.
- Decide whether comments/activity-feed behavior is part of the measured database workload or merely visual flavor.
- “Django Bolt” and any gevent comparison need current validation and a clear reason for inclusion; otherwise they could distract from the controlled Django Ninja/FastAPI comparison.
- A live demo is desired, but the notes lack a fallback. Pre-recorded/reproducible results should be the primary presentation artifact.

### Deployment

- The deployment comparison needs explicit fairness criteria: same app capability, database requirements, regions, observability, backups, and cost window.
- FastAPI Cloud, Django Simple Deploy, platform support, commands, and pricing all need current verification near the conference date.
- The calendar-app deployment story includes Neon, Cloudflare Workers/R2, an API gateway, and FastAPI Cloud. Decide how much of that architecture is relevant; otherwise “one-line deploy” may conceal substantial surrounding infrastructure.
- Production concerns named in the transcript—especially connection pooling—are absent from the notes.
- The Kubernetes diagram source and permission to use it need confirmation.

### Evidence and unresolved claims

The notes currently contain several presentation claims but no sources or validation plan. Before turning them into slides, verify at least:

- FastAPI vs. Django Ninja performance under the talk’s own workload;
- Django’s current async capabilities and limitations;
- FastAPI’s current built-in OAuth/WebSocket/template features;
- Ninja, DRF, and FastAPI OpenAPI behavior;
- current third-party admin/auth ecosystem options for FastAPI;
- Django Simple Deploy and FastAPI Cloud capabilities;
- Django Bolt’s maturity and relevance;
- any claims about large deployments such as Threads or Instagram;
- community activity and maintenance status for every named dependency.

## Immediate next steps

1. Agree on the section order, presenter ownership, and strict timeboxes.
2. Resolve the talk’s comparison scope and state “Django + Ninja vs. FastAPI” explicitly.
3. Finish the framework feature matrix with cited, current facts.
4. Research the FastAPI third-party ecosystem rather than leaving it as a rhetorical question.
5. Write the benchmark protocol before building either demo implementation.
6. Choose and consistently spell the demo name.
7. Build deterministic Redis and PostgreSQL datasets and equivalent endpoints.
8. Run reproducible benchmark trials and preserve raw artifacts.
9. Verify every product, ecosystem, async, scaling, and deployment claim close to talk day.
10. Script conversational prompts and transitions, confirm two microphones, and prepare a no-live-demo fallback.

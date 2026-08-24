---
theme: default
title: "Django vs. FastAPI: Batteries vs. Speed"
info: |
  ## Django vs. FastAPI: Batteries vs. Speed
  A pragmatic DjangoCon conversation about framework trade-offs.
class: deck-title no-deck-footer
drawings:
  persist: false
transition: slide-left
comark: true
duration: 45min
mdc: true
---

<BrandLockup size="lg" />

# Django <span class="title-vs">vs.</span> FastAPI

## Batteries vs. Speed

<div class="deck-subtitle">A pragmatic conversation about framework trade-offs</div>
<div class="deck-speakers"><strong>Calvin Hendryx-Parker</strong><span>·</span><strong>Frank Wiles</strong></div>
<div class="deck-repo">github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed</div>

<!--
DRAFT: Add a large QR code for the repository.

Keep this slide visible through both introductions so the audience has time to scan it.
Confirm the exact public URL and deployed slide URL before the talk.

Timing: 0:00–2:00
-->

---
layout: center
class: statement-slide
---

# There is no wrong answer here.

<div v-click class="mt-10 text-2xl opacity-80">
There are only trade-offs that fit your context—or do not.
</div>

<DeckFooter />
<!--
Set the tone immediately: this is not a framework cage match.
Both projects are healthy choices. We are comparing constraints, not declaring a universal winner.

Timing: 2:00–3:00
-->

---
class: content-slide
---

# Two perspectives

<div class="comparison-grid mt-8">
  <section class="deck-card">
    <div class="text-2xl font-bold">Calvin Hendryx-Parker</div>
    <ul class="mt-5 text-xl leading-8">
      <li>FastAPI practitioner</li>
      <li>Agency and operations perspective</li>
      <li>Built and deployed a real FastAPI side project</li>
      <li>Here to defend speed—and question the hype</li>
    </ul>
  </section>
  <section class="deck-card">
    <div class="text-2xl font-bold">Frank Wiles</div>
    <ul class="mt-5 text-xl leading-8">
      <li>Long-time Django practitioner</li>
      <li>Deep ecosystem and scaling experience</li>
      <li>Uses Django where the boring parts matter</li>
      <li>Here to defend batteries—and question their cost</li>
    </ul>
  </section>
</div>

<DeckFooter />
<!--
DRAFT: Frank and Calvin should replace these bullets with the bios they want spoken.
Avoid reading biographies. Establish why each person has useful experience with the trade-offs.

Timing: 3:00–4:00
-->

---
layout: center
class: content-slide text-center
---

# What are we actually comparing?

<div class="mt-10 rounded-3xl bg-white/85 px-10 py-8 text-4xl font-bold shadow-lg">
  Django <span class="opacity-50">+</span> Django Ninja
  <span class="mx-5 framework-accent">vs.</span>
  FastAPI
</div>

<div v-click class="mt-12 text-xl opacity-75">
DRF still matters—but it is not the only Django API story.
</div>

<DeckFooter />
<!--
Say this explicitly so the audience does not feel that the title promised bare Django vs. FastAPI and the talk quietly substituted Ninja.

Ninja is itself an example of Django's battery ecosystem. DRF can appear in the feature discussion where useful, but the code and benchmark comparison should be Ninja vs. FastAPI.

Timing: 4:00–5:30
-->

---
class: content-slide
---

# Start with context, not framework

<div class="deck-cards mt-10">
  <div class="deck-card">
    <div class="text-3xl mb-3">👥</div>
    <h3>Your team</h3>
    <p>What do they know, operate, and debug well?</p>
  </div>
  <div class="deck-card">
    <div class="text-3xl mb-3">🧭</div>
    <h3>Your scope</h3>
    <p>A bounded API—or the beginning of a product?</p>
  </div>
  <div class="deck-card">
    <div class="text-3xl mb-3">📈</div>
    <h3>Your workload</h3>
    <p>Where is the real bottleneck?</p>
  </div>
</div>

<div v-click class="mt-10 text-2xl text-center">
Framework choice is an organizational decision, too.
</div>

<DeckFooter />
<!--
Examples from the transcript:
- A focused internal service with three endpoints and bounded scope may be a natural FastAPI project.
- An existing Django system with dozens of models may not become simpler merely by putting FastAPI in front of it.
- A Django-expert team should demand a material reason before introducing a second stack.

Timing: 5:30–7:00
-->

---
layout: center
class: statement-slide content-slide
---

# A minimal API in FastAPI…


<DeckFooter />
<!--
Set up the code-comparison bit. Frank can prompt Calvin to show the FastAPI version.

Timing: 7:00–7:15
-->

---
class: content-slide code-slide
---

# FastAPI

<div class="code-comparison" style="grid-template-columns: minmax(0, 1fr);">
  <div class="dark-code-panel">
    <header><span class="framework-label" style="--framework-accent: #f8f7fb">FastAPI</span></header>

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    price: float
    is_offer: bool | None = None


@app.put("/items/{item_id}")
def update_item(item_id: int, item: Item):
    return {"item_name": item.name, "item_id": item_id}
```

  </div>
</div>

<DeckFooter />
<!--
Walk only the shape: imports, app, schema, decorated operation.
Do not teach FastAPI syntax—the audience can inspect the repository.
-->

---
class: content-slide code-slide
---

# Django Ninja

<div class="code-comparison" style="grid-template-columns: minmax(0, 1fr);">
  <div class="dark-code-panel">
    <header><span class="framework-label" style="--framework-accent: #f8f7fb">Django Ninja</span></header>

```python
from ninja import NinjaAPI, Schema

api = NinjaAPI()


class Item(Schema):
    name: str
    price: float
    is_offer: bool | None = None


@api.put("/items/{item_id}")
def update_item(request, item_id: int, item: Item):
    return {"item_name": item.name, "item_id": item_id}
```

  </div>
</div>

<div v-click class="absolute right-16 bottom-14 text-2xl rotate--3">
Wait… did it change?
</div>

<DeckFooter />
<!--
Use the transcript's planned joke: one presenter claims the slide did not move.
Then highlight the actual differences: imports, app/API naming, Schema/BaseModel, and Ninja's request argument.

DRAFT: Verify both examples against the exact dependency versions used in the demos.

Timing through this slide: 9:30
-->

---
layout: center
class: statement-slide
---

# Syntax is not the decision.

<div class="mt-10 text-3xl opacity-80">
The interesting differences emerge as the application grows.
</div>

<DeckFooter />
<!--
Transition from code to batteries and ecosystem.
Both provide type-driven schemas, validation, routing, and generated API documentation. The meaningful divergence is architecture and what can be added later.

Timing: 9:30–10:00
-->

---
class: section-divider no-deck-footer
---

<div class="section-number">01</div>
<div class="section-kicker">THE COMPARISON</div>

# Different batteries.

## Different opinions.

<div class="comparison-table mt-6 [&_tbody_tr:nth-child(even)_td]:!bg-[rgba(81,148,252,0.06)]">

| Concern | Django + Ninja | FastAPI |
|---|---|---|
| Validation & OpenAPI | Ninja | Built in |
| Data layer | Django ORM convention | Choose your own |
| Admin | Django admin | Choose/build an option |
| Auth & permissions | Django ecosystem | API-oriented tools + choices |
| WebSockets | ASGI/Channels or a service | Starlette/FastAPI support |
| Reusable app ecosystem | Deep, convention-driven | Younger, more composable |

</div>

<div class="mt-6 text-sm opacity-60">
Working comparison for discussion—not a scorecard.
</div>

<!--
DRAFT / FACT CHECK: Verify every row and decide whether DRF deserves a third column.
Potential matrix rows for appendix or repo: templates, background jobs, testing, migrations, ORM async behavior, docs customization, deployment.

The key argument is not that FastAPI has no batteries. It has batteries selected for its API flow. Django's shared ORM and application conventions make deeper reusable applications possible.

Timing: 10:00–12:00
-->

---
class: content-slide
---

# A battery that buys leverage

<div class="comparison-grid mt-8">
  <div class="dark-code-panel">
    <header><span class="framework-label" style="--framework-accent: #f8f7fb">Django Activity Stream</span></header>

```python
from actstream import action

action.send(
    request.user,
    verb="commented on",
    action_object=comment,
    target=listing,
)
```

  </div>
  <div class="deck-card text-xl">
    <div class="text-2xl font-bold">A small integration can provide:</div>
    <ul class="mt-5 leading-8">
      <li>actors, verbs, objects, and targets</li>
      <li>activity feeds</li>
      <li>reusable queries and relationships</li>
      <li>conventions already tied to Django models</li>
    </ul>
    <div v-click class="mt-5 text-2xl font-bold">
      You could build it. But should you?
    </div>
  </div>
</div>

<DeckFooter />
<!--
Use this as the concrete "batteries" story.
The package does not make the feature free, but it lets a mature design and Django's conventions do substantial work.

DRAFT: Verify API example and current package status. Add a screenshot from a real project if permission allows.
Source: https://django-activity-stream.readthedocs.io/

Timing: 12:00–14:00
-->

---
layout: center
class: content-slide text-center
---

# Batteries have a shelf life.

<div class="mt-10 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-5 text-2xl">
  <div class="rounded-xl border border-main bg-white/85 px-6 py-4 shadow-sm">django-fsm</div>
  <div class="text-3xl opacity-50">→</div>
  <div class="rounded-xl border border-main bg-white/85 px-6 py-4 shadow-sm">maintenance slows</div>
  <div class="text-3xl opacity-50">→</div>
  <div class="rounded-xl border border-main bg-white/85 px-6 py-4 shadow-sm">django-fsm-2</div>
</div>

<div class="comparison-grid mt-12 text-left">
  <div class="rounded-2xl border border-main bg-white p-6 shadow-sm">
    <div class="mb-4 h-1.5 w-18 rounded-full bg-green-500"></div>
    <div class="text-xl font-bold text-green-500">What you bought</div>
    <div class="mt-2 opacity-80">A mature design, saved time, and community experience.</div>
  </div>
  <div class="rounded-2xl border border-main bg-white p-6 shadow-sm">
    <div class="mb-4 h-1.5 w-18 rounded-full bg-amber-500"></div>
    <div class="text-xl font-bold text-amber-500">What you still own</div>
    <div class="mt-2 opacity-80">Compatibility, upgrades, security, and a contingency plan.</div>
  </div>
</div>

<DeckFooter />
<!--
Tell the nuanced dependency story: maintainers move on, forks happen, communities can recover projects.
Options are wait, contribute, fork, replace, or vendor.

DRAFT: Verify the current history and status before presenting this lifecycle as fact.

Timing: 14:00–16:00
-->

---
class: content-slide
---

# Build, buy, or vendor?

<div class="diagram-panel">

```mermaid {theme: 'neutral', scale: 0.8}
flowchart LR
    N[Need a capability] --> F{Good fit exists?}
    F -->|No| B[Build]
    F -->|Yes| H{Healthy enough?}
    H -->|Yes| U[Use it]
    H -->|No| V{Small and understood?}
    V -->|Yes| D[Vendor or fork]
    V -->|No| B
    U --> O[Own the decision]
    D --> O
    B --> O
```

</div>

<div v-click class="mt-4 text-center text-xl">
AI can lower implementation cost. It does not erase ownership.
</div>

<DeckFooter />
<!--
Podcast-style exchange:
- AI makes it easier to understand nine files, patch for a new Django version, or build a tailored feature.
- But generated or vendored code still needs tests, security review, maintenance, and operational understanding.
- Avoid drifting into a 20-minute AI discussion; timebox this tightly.

Timing: 16:00–18:00
-->

---
class: section-divider no-deck-footer
---

<div class="section-number">02</div>
<div class="section-kicker">THE WORKLOAD</div>

# Async?

## Start with what the application actually does.

<div v-click class="mt-14 text-5xl font-bold">
Do you actually need it?
</div>

<!--
Keep this visually spare so the audience listens to the conversation.

Timing: 18:00–18:30
-->

---
class: content-slide
---

# Async is a workload property

<div class="comparison-grid mt-8">
  <section class="deck-card">
    <div class="mb-4 h-1.5 w-18 rounded-full bg-green-500"></div>
    <div class="text-2xl font-bold text-green-500">Often valuable</div>
    <ul class="mt-5 text-xl leading-9">
      <li>Many concurrent I/O waits</li>
      <li>Parallel service aggregation</li>
      <li>WebSockets and long-lived connections</li>
      <li>A known high-concurrency hot path</li>
    </ul>
  </section>
  <section class="deck-card">
    <div class="mb-4 h-1.5 w-18 rounded-full bg-amber-500"></div>
    <div class="text-2xl font-bold text-amber-500">Not magic</div>
    <ul class="mt-5 text-xl leading-9">
      <li>CPU-bound work</li>
      <li>Mostly synchronous dependencies</li>
      <li>Database-bound requests</li>
      <li>“It sounds faster”</li>
    </ul>
  </section>
</div>

<div v-click class="mt-8 text-center text-2xl">
The whole request path matters—not just <code>async def</code>.
</div>

<DeckFooter />
<!--
Most applications do not benefit merely because everything is declared async.
Discuss complexity: debugging, blocking libraries, ORM boundaries, and operational behavior.

DRAFT / FACT CHECK: Cite and accurately describe current Django async request and ORM capabilities. Avoid broad statements that either framework is "fully async."

Timing: 18:30–21:00
-->

---
layout: center
class: statement-slide
---

# Maybe only one part is special.

<div class="diagram-panel mt-6 text-left">

```mermaid {theme: 'neutral', scale: 0.82}
flowchart LR
    C[Clients] --> D[Django product]
    D --> A[Admin / auth / workflows]
    D --> P[(PostgreSQL)]
    C --> F[Specialized API service]
    F --> R[(Redis / external APIs)]
    F -. shared domain or APIs .-> D
```

</div>

<div class="mt-5 text-xl opacity-80">
A monolith plus one focused service can be a feature—not a failure.
</div>

<DeckFooter />
<!--
Use the transcript's examples: a timeline, chat/WebSocket system, or endpoint wrapping many internal APIs may deserve separate treatment. Password settings and admin workflows may not.

Do not prescribe this architecture universally. It introduces a second service and its own operational cost.

Timing: 21:00–22:00
-->

---
class: section-divider no-deck-footer
---

<div class="section-number">03</div>
<div class="section-kicker">THE EVIDENCE</div>

# All benchmarks are biased.

<div class="mt-10 text-3xl opacity-80">
Including ours.
</div>

<div v-click class="mt-12 text-xl">
A benchmark measures a workload, an implementation, and an environment.
<br>It does not measure your application.
</div>

<!--
This line was central to the planning conversation. Establish humility before showing any chart.

Timing: 22:00–22:45
-->

---
class: content-slide
---

# Our benchmark contract

<div class="checklist-grid mt-6 text-xl">
  <div v-click><span class="mr-2 text-green-600">✓</span>Equivalent behavior and validation</div>
  <div v-click><span class="mr-2 text-green-600">✓</span>Identical data and query shape</div>
  <div v-click><span class="mr-2 text-green-600">✓</span>Pinned versions and server config</div>
  <div v-click><span class="mr-2 text-green-600">✓</span>Warm-up + repeated measured runs</div>
  <div v-click><span class="mr-2 text-green-600">✓</span>Multiple concurrency levels</div>
  <div v-click><span class="mr-2 text-green-600">✓</span>Raw results in the repository</div>
</div>

<div v-click class="mt-6 text-center text-2xl font-bold">
Throughput + latency + errors + resources
</div>

<div class="mt-3 text-center opacity-70">
Not one heroic requests-per-second number.
</div>

<DeckFooter />
<!--
DRAFT: This is a promise. Do not retain any bullet the final benchmark process does not satisfy.

Proposed tooling: Docker Compose and Artillery. Record CPU, memory, worker counts, pool settings, hardware, duration, seed, and dependency versions. Report p50/p95/p99, throughput, and errors.

Timing: 22:45–24:00
-->

---
class: content-slide
---

# Scenario A: ZIP typeahead

<div class="comparison-grid mt-6">
  <div class="deck-card">
    <div class="text-6xl">📮 → ⚡</div>

```http
GET /zip-codes?q=462
```

```json
[
  { "zip": "46201", "city": "Indianapolis" },
  { "zip": "46202", "city": "Indianapolis" }
]
```

  </div>
  <div class="deck-card text-xl leading-9">
    <ul>
      <li>Redis-backed lookup</li>
      <li>Real external I/O, no ORM</li>
      <li>Same response and validation</li>
      <li>Lower and higher concurrency</li>
      <li>Isolate framework + I/O behavior</li>
    </ul>
  </div>
</div>

<DeckFooter />
<!--
Working concurrency idea from the transcript: roughly 20 vs. 200 concurrent connections. Choose exact stages only after trial runs and document what "20" and "200" mean in Artillery.

DRAFT: Build both implementations and define the deterministic ZIP dataset.

Timing: 24:00–25:30
-->

---
class: content-slide
---

# Scenario B: Zellit

<div class="comparison-grid mt-6">
  <section class="deck-card">
    <h2>Zillow meets Reddit</h2>
    <div class="mt-5 text-6xl">🏠 💬 ⬆️</div>
    <div class="mt-8 text-xl opacity-80">Synthetic real estate listings with opinions.</div>
  </section>
  <section class="deck-card text-xl leading-9">
    <ul>
      <li>PostgreSQL reads</li>
      <li>ZIP-code demographics</li>
      <li>Homes joined to photos</li>
      <li>Optional votes and comments</li>
      <li>Deterministic generated data</li>
      <li>Realistic connection management</li>
    </ul>
    <div class="mt-8 rounded-lg bg-amber-500/15 border border-amber-500/40 p-3 text-center">
    Name still needs Frank's vote: <strong>Zellit?</strong> <strong>Zealot?</strong>
    </div>
  </section>
</div>

<DeckFooter />
<!--
The transcript brainstormed a Zillow/Reddit cross and landed on a name phonetically, but not a stable spelling.

Decide whether votes/comments are part of the measured endpoint or just visual flavor. Keep the measured query understandable: demographics plus homes and photos is enough.

DRAFT: Define schema, indexes, row counts, pool settings, seeds, and exact response shape before implementation.

Timing: 25:30–27:00
-->

---
class: content-slide
---

# Results: Redis workload

<div class="result-placeholder mt-8 h-62" style="border-image: linear-gradient(90deg, var(--sixie-purple), var(--revsys-blue)) 1;">
  <div>
    <div class="text-4xl opacity-50">CHART PLACEHOLDER</div>
    <div class="mt-4 text-xl opacity-60">p50 · p95 · p99 · throughput · errors</div>
    <div class="mt-2 opacity-50">lower and higher concurrency</div>
  </div>
</div>

<div class="mt-6 text-center text-xl">
Describe what happened—not what we expected to happen.
</div>

<DeckFooter />
<!--
Do not invent results. Replace with a chart generated from committed benchmark artifacts.
Include run ID and environment in a readable footer.

Discuss variance and surprises. If results are effectively tied, that is a useful result.

Timing: 27:00–29:00
-->

---
class: content-slide
---

# Results: PostgreSQL workload

<div class="result-placeholder mt-8 h-62" style="border-image: linear-gradient(90deg, var(--sixie-purple), var(--revsys-blue)) 1;">
  <div>
    <div class="text-4xl opacity-50">CHART PLACEHOLDER</div>
    <div class="mt-4 text-xl opacity-60">p50 · p95 · p99 · throughput · errors</div>
    <div class="mt-2 opacity-50">same data, queries, and response</div>
  </div>
</div>

<div class="mt-6 text-center text-xl">
When the database dominates, how much framework is left to measure?
</div>

<DeckFooter />
<!--
Do not invent results. Replace with a chart generated from committed benchmark artifacts.
Discuss connection pools and server worker configuration explicitly.

Timing: 29:00–31:00
-->

---
layout: center
class: statement-slide
---

# Faster is not the same as better.

<div class="deck-cards mt-12 text-xl text-left">
  <div class="deck-card">Does the difference survive a realistic workload?</div>
  <div class="deck-card">Does it matter at your traffic level?</div>
  <div class="deck-card">What do you give up to get it?</div>
</div>

<div v-click class="mt-12 text-2xl font-bold">
Measure the bottleneck you actually have.
</div>

<DeckFooter />
<!--
Possible discussion: FastAPI may provide more concurrency headroom out of the box in some workloads, but a modest difference may not outweigh Django's ecosystem and team familiarity.

Do not mention a percentage until the benchmark is complete. Validate any Django Bolt or gevent comparison separately; likely move those to appendix or omit unless they materially explain a result.

Timing: 31:00–32:00
-->

---
class: content-slide
---

# Easy deploy paths

<div class="comparison-grid mt-10">
  <section class="deck-card">
    <div class="text-2xl font-bold">FastAPI Cloud</div>
    <div class="dark-code-panel mt-7 p-4 font-mono text-xl">fastapi deploy</div>
    <div class="mt-6 opacity-75">A framework-aligned happy path.</div>
  </section>
  <section class="deck-card">
    <div class="text-2xl font-bold">Django Simple Deploy</div>
    <div class="dark-code-panel mt-7 p-4 font-mono text-xl">python manage.py simple_deploy</div>
    <div class="mt-6 opacity-75">A Django path across supported platforms.</div>
  </section>
</div>

<div v-click class="mt-8 text-center text-xl">
Compare capabilities—not command length alone.
</div>

<DeckFooter />
<!--
Calvin: show the compelling one-command FastAPI Cloud experience from the calendar app.
Frank: respond with the current Django Simple Deploy story and established platform paths.

DRAFT / FACT CHECK: Verify exact commands, supported platforms, limitations, pricing, and database assumptions immediately before the conference.
The calendar app also uses Neon and Cloudflare infrastructure; do not imply the entire production system is one command.

Timing: 32:00–35:00
-->

---
class: content-slide
---

# In production, the shapes converge

<div class="diagram-panel mt-4">

```mermaid {theme: 'neutral', scale: 0.78}
flowchart LR
    U[Users] --> E[CDN / edge / load balancer]
    E --> C1[App containers]
    E --> C2[App containers]
    C1 --> P[(PostgreSQL)]
    C2 --> P
    C1 --> R[(Cache / queue)]
    C2 --> R
    C1 --> O[Logs / metrics / traces]
    C2 --> O
```

</div>

<div class="mt-3 text-center text-xl opacity-80">
Containers, migrations, pooling, secrets, observability, backups, incidents…
</div>

<DeckFooter />
<!--
At Kubernetes/production scale, replacing the app label from Django to FastAPI does not remove the surrounding operational system.
Use the SCAFF full-stack architecture diagram instead if it is clearer and permission is confirmed.

Timing: 35:00–37:00
-->

---
class: recommendation-slide
---

# Lean toward Django + Ninja when…

<section class="deck-card text-xl leading-10">
  <ul>
    <li>The team already knows Django</li>
    <li>An existing Django product needs an API</li>
    <li>Admin, auth, permissions, or workflows matter</li>
    <li>Scope is likely to grow beyond “just an API”</li>
    <li>Reusable apps create meaningful leverage</li>
    <li>A small speed difference would not change the business</li>
  </ul>
</section>

<section class="deck-card text-center">
  <div class="mt-8 text-7xl">🔋</div>

  <div class="mt-8 text-2xl font-bold">
  Optimize for total product work.
  </div>
</section>

<DeckFooter />
<!--
This is a heuristic, not a checklist that mechanically produces an answer.

Timing: 37:00–38:30
-->

---
class: recommendation-slide
---

# Lean toward FastAPI when…

<section class="deck-card text-xl leading-10">
  <ul>
    <li>The service is focused and API-only</li>
    <li>Scope is intentionally bounded</li>
    <li>Concurrent I/O is central to the workload</li>
    <li>The team wants a composable stack</li>
    <li>Unused full-stack surface area is a real concern</li>
    <li>Its tooling or deploy path removes material friction</li>
  </ul>
</section>

<section class="deck-card text-center">
  <div class="mt-8 text-7xl">⚡</div>

  <div class="mt-8 text-2xl font-bold">
  Optimize for the service you actually need.
  </div>
</section>

<DeckFooter />
<!--
Mention legitimate concerns separately from trivia. A few megabytes in a container is rarely decisive; unnecessary complexity, middleware, or security surface can be.

Timing: 38:30–40:00
-->

---
layout: center
class: statement-slide
---

# You can use both.

<div class="deck-card mt-10 text-3xl">
  Django for the product
  <span class="mx-4 opacity-50">+</span>
  FastAPI for a specialized service
</div>

<div class="mt-10 text-xl opacity-80">
Or Django + Ninja everywhere. Or FastAPI everywhere.
</div>

<div v-click class="mt-10 text-2xl font-bold">
Complexity must earn its keep.
</div>

<DeckFooter />
<!--
Mix-and-match is an option, not the automatic compromise.
A second framework adds deployment, observability, authentication, data ownership, and staffing complexity. Extract a service only when its constraints justify that cost.

Timing: 40:00–41:00
-->

---
layout: center
class: statement-slide
---

# Our answer

<div class="comparison-grid mt-10 text-2xl text-left">
  <div v-click class="deck-card">Value team knowledge.</div>
  <div v-click class="deck-card">Measure your workload.</div>
  <div v-click class="deck-card">Buy batteries for leverage.</div>
  <div v-click class="deck-card">Build when ownership is worth it.</div>
</div>

<div v-click class="mt-10 text-3xl font-bold">
Choose constraints—not hype.
</div>

<DeckFooter />
<!--
Restate the opening: there is no wrong answer independent of context.
Both communities are active and neither framework is going away. Verify and cite project-health claims in the final deck/repository.

Timing: 41:00–43:00
-->

---
layout: center
class: deck-title no-deck-footer
---

<BrandLockup size="lg" />

# Thank you

<div class="deck-subtitle">Questions, code, methodology, raw results, and references</div>

<div class="deck-speakers"><strong>Calvin Hendryx-Parker</strong><span>·</span><strong>Frank Wiles</strong></div>
<div class="deck-repo">github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed</div>
<!--
DRAFT: Add the final QR code, contact details, and deployed slide URL.
Leave approximately two minutes for the close/transition or questions depending on conference format.

Timing: 43:00–45:00
-->

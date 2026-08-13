# Zellit shared data

Framework-neutral deterministic data tooling for the Zellit benchmark workload.
It uses CPython 3.12.12, Faker 40.5.1, and fixed seed `20260813`.

```shell
uv sync --frozen
uv run zellit-data generate --spec data/spec.json --output data/generated
uv run zellit-data verify --spec data/spec.json \
  --manifest data/manifest.json --output data/generated
uv run pytest -q
```

The seven generated relational CSV files use UTF-8, LF endings, fixed column
orders, and stable integer IDs. They are intentionally ignored by Git.
`manifest.json` records each artifact's SHA-256 digest, byte count, row count,
and columns plus an overall digest. The committed request corpus contains 100
ZIPs crossed with offsets 0, 20, 40, 60, and 80.

Regeneration must use the locked environment and must produce the committed
manifest exactly. Update the specification, manifest, environment contract,
and corpus together when deliberately changing the dataset.

After Django migrations create the explicit Zellit tables, seed PostgreSQL with:

```shell
uv run zellit-data seed --database-url "$DATABASE_URL" \
  --data-dir data/generated --manifest data/manifest.json --if-needed
```

The loader verifies every byte before opening its destructive transaction,
serializes concurrent seeders with a PostgreSQL advisory lock, uses explicit
`COPY` columns, validates loaded counts and relationships, and writes readiness
metadata last. Any failure rolls back the complete replacement. `--if-needed`
leaves an already matching dataset untouched; `--force` deliberately reloads.

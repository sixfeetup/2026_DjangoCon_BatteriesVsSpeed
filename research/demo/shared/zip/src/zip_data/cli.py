from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path

from .dataset import DatasetVerificationError, generate_dataset, verify_dataset
from .seeder import SeedError, seed_redis


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="zip-data")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate")
    generate_parser.add_argument("--output", type=Path, required=True)
    generate_parser.add_argument("--seed", type=int, default=20260811)
    generate_parser.add_argument("--count", type=int, default=50_000)

    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--output", type=Path, required=True)

    seed_parser = subparsers.add_parser("seed")
    seed_parser.add_argument("--redis-url", required=True)
    seed_parser.add_argument("--data-dir", type=Path, required=True)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "generate":
            manifest = generate_dataset(args.output, seed=args.seed, count=args.count)
        elif args.command == "verify":
            manifest = verify_dataset(args.output)
        else:
            seed_redis(args.redis_url, args.data_dir)
            return 0
    except (DatasetVerificationError, SeedError, ValueError) as exc:
        parser.exit(1, f"{exc}\n")

    print(json.dumps(asdict(manifest), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

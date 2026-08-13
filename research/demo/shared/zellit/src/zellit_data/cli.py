from __future__ import annotations

import argparse
from pathlib import Path

from zellit_data.config import DatasetSpec
from zellit_data.generator import generate
from zellit_data.loader import seed
from zellit_data.manifest import verify_manifest


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="zellit-data")
    commands = result.add_subparsers(dest="command", required=True)
    generate_command = commands.add_parser("generate")
    generate_command.add_argument("--spec", type=Path, required=True)
    generate_command.add_argument("--output", type=Path, required=True)
    generate_command.add_argument("--zip-input", type=Path, default=Path("data/zip_codes.csv"))
    verify_command = commands.add_parser("verify")
    verify_command.add_argument("--spec", type=Path, required=True)
    verify_command.add_argument("--manifest", type=Path, required=True)
    verify_command.add_argument("--output", type=Path, required=True)
    seed_command = commands.add_parser("seed")
    seed_command.add_argument("--database-url", required=True)
    seed_command.add_argument("--data-dir", type=Path, required=True)
    seed_command.add_argument("--manifest", type=Path, required=True)
    mode = seed_command.add_mutually_exclusive_group(required=True)
    mode.add_argument("--if-needed", action="store_true")
    mode.add_argument("--force", action="store_true")
    return result


def main() -> None:
    args = parser().parse_args()
    if args.command == "generate":
        spec = DatasetSpec.load(args.spec)
        generate(spec, args.output, args.zip_input)
    elif args.command == "verify":
        spec = DatasetSpec.load(args.spec)
        manifest = verify_manifest(args.output, args.manifest)
        if (
            manifest["schema_version"] != spec.schema_version
            or manifest["generator_version"] != spec.generator_version
            or manifest["seed"] != spec.seed
        ):
            raise SystemExit("manifest identity does not match specification")
    else:
        seed(
            args.database_url,
            args.data_dir,
            args.manifest,
            if_needed=args.if_needed,
            force=args.force,
        )


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
from pathlib import Path

from zellit_data.config import DatasetSpec
from zellit_data.generator import generate
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
    return result


def main() -> None:
    args = parser().parse_args()
    spec = DatasetSpec.load(args.spec)
    if args.command == "generate":
        generate(spec, args.output, args.zip_input)
    else:
        manifest = verify_manifest(args.output, args.manifest)
        if (
            manifest["schema_version"] != spec.schema_version
            or manifest["generator_version"] != spec.generator_version
            or manifest["seed"] != spec.seed
        ):
            raise SystemExit("manifest identity does not match specification")


if __name__ == "__main__":
    main()

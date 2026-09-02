#!/usr/bin/env python3
"""Generate a static public-holiday dataset for the Wanderlist website.

Usage:
    python3 generate_holidays.py
    python3 generate_holidays.py --year 2027
    python3 generate_holidays.py --output data/custom-holidays.json

Install the dependency first:
    python3 -m pip install holidays
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import holidays
except ImportError:
    print(
        "The 'holidays' package is not installed. Run: "
        "python3 -m pip install holidays",
        file=sys.stderr,
    )
    raise SystemExit(1)


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_YEAR = 2026
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / f"holidays-{DEFAULT_YEAR}.json"


def parse_arguments() -> argparse.Namespace:
    """Read optional year and output-path arguments from the command line."""
    parser = argparse.ArgumentParser(
        description="Generate static public-holiday JSON for all supported countries."
    )
    parser.add_argument(
        "--year",
        type=int,
        default=DEFAULT_YEAR,
        help=f"Holiday year to generate (default: {DEFAULT_YEAR}).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON path. Defaults to data/holidays-YEAR.json.",
    )
    return parser.parse_args()


def supported_country_codes() -> list[str]:
    """Return the country identifiers exposed by the installed package version."""
    # The public function is available from recent versions of holidays. The
    # fallback keeps this generator compatible with older releases.
    list_function = getattr(holidays, "list_supported_countries", None)
    if list_function is None:
        from holidays.utils import list_supported_countries

        list_function = list_supported_countries

    supported = list_function()

    if isinstance(supported, dict):
        values = supported.keys()
    else:
        values = supported

    codes = {
        str(value).strip().upper()
        for value in values
        if str(value).strip()
    }
    return sorted(codes)


def normalize_holiday_name(value: Any) -> str:
    """Convert a holiday name into a readable string for the frontend."""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return "; ".join(str(item) for item in value)
    return str(value)


def generate_country_holidays(
    country_codes: list[str], year: int
) -> tuple[dict[str, list[dict[str, str]]], dict[str, str]]:
    """Generate holidays and collect failures without stopping the whole run."""
    generated: dict[str, list[dict[str, str]]] = {}
    skipped: dict[str, str] = {}

    for index, country_code in enumerate(country_codes, start=1):
        print(f"[{index}/{len(country_codes)}] Generating {country_code}...")

        try:
            calendar = holidays.country_holidays(country_code, years=year)
            generated[country_code] = [
                {
                    "date": holiday_date.isoformat(),
                    "name": normalize_holiday_name(name),
                }
                for holiday_date, name in sorted(calendar.items())
            ]
        except Exception as error:  # One unsupported alias should not stop all countries.
            skipped[country_code] = f"{type(error).__name__}: {error}"
            print(f"  Skipped {country_code}: {error}", file=sys.stderr)

    return generated, skipped


def write_json(
    output_path: Path,
    year: int,
    generated: dict[str, list[dict[str, str]]],
    skipped: dict[str, str],
) -> None:
    """Write an atomic, readable JSON file for the static website."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "year": year,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "countryCount": len(generated),
        "skippedCountryCount": len(skipped),
        "data": generated,
        "skipped": skipped,
    }

    temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(output_path)


def main() -> int:
    arguments = parse_arguments()

    if arguments.year < 1900 or arguments.year > 2200:
        print("Choose a year between 1900 and 2200.", file=sys.stderr)
        return 2

    output_path = arguments.output or (
        PROJECT_ROOT / "data" / f"holidays-{arguments.year}.json"
    )
    if not output_path.is_absolute():
        output_path = PROJECT_ROOT / output_path

    country_codes = supported_country_codes()
    generated, skipped = generate_country_holidays(country_codes, arguments.year)
    write_json(output_path, arguments.year, generated, skipped)

    holiday_count = sum(len(items) for items in generated.values())
    print()
    print(f"Generated: {output_path}")
    print(f"Countries written: {len(generated)}")
    print(f"Countries skipped: {len(skipped)}")
    print(f"Holiday entries written: {holiday_count}")

    if skipped:
        print("Skipped country codes:")
        for code, reason in skipped.items():
            print(f"  - {code}: {reason}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

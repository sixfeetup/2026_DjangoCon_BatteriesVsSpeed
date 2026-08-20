from __future__ import annotations

from pathlib import Path

from django.core.management import CommandError
from django_typer.management import TyperCommand
from django_typer.management import command
from typer import Argument
from typer import Option


class Command(TyperCommand):
    help = "Execute Python code with Django properly bootstrapped"

    @command(help="Execute Python code with Django properly bootstrapped")
    def default(
        self,
        code: str = Argument(
            None,
            help="Python code to execute (use -c/--code for inline code, or provide a file path)",
        ),
        code_inline: str = Option(
            None,
            "-c",
            "--code",
            help="Inline Python code to execute",
        ),
    ):
        """
        Execute Python code with Django properly bootstrapped.

        This is useful for running quick scripts or diagnostics that need Django models
        and settings fully configured. Use -c for inline code or provide a file path.

        Examples:
            just run_python -c "print(User.objects.count())"
            just run_python_file frank.py
            ./manage.py run_python -c "from people.models import Person; print(Person.objects.count())"
        """
        if code_inline:
            source = code_inline
            filename = "<string>"
        elif code:
            file_path = Path(code)
            if not file_path.exists():
                raise CommandError(f"File not found: {code}")

            if not file_path.is_file():
                raise CommandError(f"Path is not a file: {code}")

            source = file_path.read_text()
            filename = str(file_path)
        else:
            raise CommandError(
                "Either provide a file path or use -c/--code for inline code. "
                "See --help for examples."
            )

        try:
            exec(
                compile(source, filename, "exec"),
                {"__name__": "__main__", "__file__": filename},
            )
        except Exception as e:
            raise CommandError(f"Error executing code: {e}") from e

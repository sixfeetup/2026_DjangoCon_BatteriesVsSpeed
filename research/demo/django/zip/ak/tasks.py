from __future__ import annotations

import dramatiq
import structlog

logger = structlog.get_logger(__name__)


@dramatiq.actor(store_results=True)
def add(number_one: int, number_two: int) -> int:
    """Add two numbers in a sample asynchronous task."""
    answer = number_one + number_two
    logger.info(
        "sample_add_task",
        number_one=number_one,
        number_two=number_two,
        answer=answer,
    )
    return answer

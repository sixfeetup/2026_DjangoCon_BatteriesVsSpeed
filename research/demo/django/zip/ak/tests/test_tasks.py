from __future__ import annotations

from ak.tasks import add


def test_add_sync():
    """The sample actor can be called synchronously."""
    assert add(2, 3) == 5


def test_add_async(broker, worker):
    """The sample actor can return a result through a worker."""
    message = add.send(3, 4)

    result_backend = broker.get_results_backend()
    broker.join(add.queue_name, fail_fast=True)
    worker.join()

    assert message.get_result(backend=result_backend) == 7

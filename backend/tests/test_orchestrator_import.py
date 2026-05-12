import sys


def test_create_orchestrator():
    sys.path.insert(0, "/home/atituiset/Projects/combinate-agentic-review/worker")
    from orchestrator import create_orchestrator, OpenCodeOrchestrator

    orch = create_orchestrator(concurrency=3, debug=True, web_port=8080)
    assert isinstance(orch, OpenCodeOrchestrator)
    assert orch.concurrency == 3
    assert orch.debug is True

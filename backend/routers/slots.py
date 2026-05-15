from fastapi import APIRouter
from backend.models.schemas import SlotAcquirePayload, SlotPushPayload, SlotStatusPayload
from backend.redis_client import publish_log, publish_meta

router = APIRouter()

NUM_SLOTS = 3

# Worker-isolated slot states: {worker_id: [slot0, slot1, slot2]}
worker_slots = {}


def _get_slots(worker_id: str):
    """Get or create slot states for a worker."""
    if worker_id not in worker_slots:
        worker_slots[worker_id] = [
            {"task_id": None, "file_path": None, "status": "waiting"}
            for _ in range(NUM_SLOTS)
        ]
    return worker_slots[worker_id]


@router.post("/api/slot/{slot_id}/acquire")
async def slot_acquire_legacy(slot_id: int, payload: SlotAcquirePayload):
    """Legacy slot acquire - maps to local worker."""
    return await _slot_acquire("local", slot_id, payload)


@router.post("/api/slot/{worker_id}/{slot_id}/acquire")
async def slot_acquire(worker_id: str, slot_id: int, payload: SlotAcquirePayload):
    return await _slot_acquire(worker_id, slot_id, payload)


async def _slot_acquire(worker_id: str, slot_id: int, payload: SlotAcquirePayload):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    slots = _get_slots(worker_id)
    slots[slot_id] = {
        "task_id": payload.task_id,
        "file_path": payload.file_path,
        "status": "running"
    }
    await publish_meta(slot_id, "acquire", {
        "task_id": payload.task_id,
        "file_path": payload.file_path,
        "slot": slot_id
    }, worker_id=worker_id)
    return {"ok": True}


@router.post("/api/slot/{slot_id}/push")
async def slot_push_legacy(slot_id: int, payload: SlotPushPayload):
    """Legacy slot push - maps to local worker."""
    return await _slot_push("local", slot_id, payload)


@router.post("/api/slot/{worker_id}/{slot_id}/push")
async def slot_push(worker_id: str, slot_id: int, payload: SlotPushPayload):
    return await _slot_push(worker_id, slot_id, payload)


async def _slot_push(worker_id: str, slot_id: int, payload: SlotPushPayload):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    await publish_log(slot_id, {
        "type": payload.log_type,
        "content": payload.content,
        "slot": slot_id
    }, worker_id=worker_id)
    return {"ok": True}


@router.post("/api/slot/{slot_id}/status")
async def slot_status_legacy(slot_id: int, payload: SlotStatusPayload):
    """Legacy slot status - maps to local worker."""
    return await _slot_status("local", slot_id, payload)


@router.post("/api/slot/{worker_id}/{slot_id}/status")
async def slot_status(worker_id: str, slot_id: int, payload: SlotStatusPayload):
    return await _slot_status(worker_id, slot_id, payload)


async def _slot_status(worker_id: str, slot_id: int, payload: SlotStatusPayload):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    slots = _get_slots(worker_id)
    slots[slot_id]["status"] = payload.status
    await publish_meta(slot_id, "status", {
        "status": payload.status,
        "duration": payload.duration,
        "slot": slot_id
    }, worker_id=worker_id)
    return {"ok": True}


@router.post("/api/slot/{slot_id}/release")
async def slot_release_legacy(slot_id: int):
    """Legacy slot release - maps to local worker."""
    return await _slot_release("local", slot_id)


@router.post("/api/slot/{worker_id}/{slot_id}/release")
async def slot_release(worker_id: str, slot_id: int):
    return await _slot_release(worker_id, slot_id)


async def _slot_release(worker_id: str, slot_id: int):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    slots = _get_slots(worker_id)
    slots[slot_id] = {"task_id": None, "file_path": None, "status": "waiting"}
    await publish_meta(slot_id, "release", {"slot": slot_id}, worker_id=worker_id)
    return {"ok": True}


@router.get("/api/slot/{worker_id}/status")
async def get_worker_slots(worker_id: str):
    """Get all slot statuses for a worker."""
    slots = _get_slots(worker_id)
    return {"worker_id": worker_id, "slots": slots}

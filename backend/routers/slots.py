from fastapi import APIRouter
from backend.models.schemas import SlotAcquirePayload, SlotPushPayload, SlotStatusPayload
from backend.redis_client import publish_log, publish_meta

router = APIRouter()

NUM_SLOTS = 3

slot_states = [
    {"task_id": None, "file_path": None, "status": "waiting"}
    for _ in range(NUM_SLOTS)
]


@router.post("/api/slot/{slot_id}/acquire")
async def slot_acquire(slot_id: int, payload: SlotAcquirePayload):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    slot_states[slot_id] = {
        "task_id": payload.task_id,
        "file_path": payload.file_path,
        "status": "running"
    }
    await publish_meta(slot_id, "acquire", {
        "task_id": payload.task_id,
        "file_path": payload.file_path,
        "slot": slot_id
    })
    return {"ok": True}


@router.post("/api/slot/{slot_id}/push")
async def slot_push(slot_id: int, payload: SlotPushPayload):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    await publish_log(slot_id, {
        "type": payload.log_type,
        "content": payload.content,
        "slot": slot_id
    })
    return {"ok": True}


@router.post("/api/slot/{slot_id}/status")
async def slot_status(slot_id: int, payload: SlotStatusPayload):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    slot_states[slot_id]["status"] = payload.status
    await publish_meta(slot_id, "status", {
        "status": payload.status,
        "duration": payload.duration,
        "slot": slot_id
    })
    return {"ok": True}


@router.post("/api/slot/{slot_id}/release")
async def slot_release(slot_id: int):
    if slot_id < 0 or slot_id >= NUM_SLOTS:
        return {"ok": False, "error": "Invalid slot"}
    slot_states[slot_id] = {"task_id": None, "file_path": None, "status": "waiting"}
    await publish_meta(slot_id, "release", {"slot": slot_id})
    return {"ok": True}

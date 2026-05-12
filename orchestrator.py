import sys
import time
import json
import argparse
import random

def emit_event(event_type, text, data=None):
    msg = {"type": event_type, "text": text}
    if data:
        msg["data"] = data
    print(f"__AGENT_EVENT__:{json.dumps(msg)}", flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--files', nargs='*')
    parser.add_argument('--diff')
    parser.add_argument('-c', '--concurrency', type=int, default=3)
    args = parser.parse_args()

    files_to_scan = []
    if args.diff:
        emit_event("system", f"Fetching changed files for diff: {args.diff}... (Mock)")
        time.sleep(1)
        files_to_scan = ["src/memory_pool.cpp", "src/mac/scheduler.c", "src/rr/abc/cde/efg/Hello.c"]
    elif args.files:
        files_to_scan = args.files
    else:
        files_to_scan = ["demo.c"]

    emit_event("system", f"Output directory: reports/MAX_RUN")
    emit_event("system", f"=== Starting scan: {len(files_to_scan)} files, concurrency={args.concurrency}, timeout=300s, scan_delay=10s ===")

    issues_found = []

    for idx, file in enumerate(files_to_scan):
        task_id = f"task-{idx+1:03d}"
        emit_event("system", f"[{task_id}] START {file}")
        
        # Simulate loading file
        time.sleep(0.5)
        emit_event("thought", f"[{task_id}] Preparing to scan {file} using 'nga'")
        
        # Simulate nga CLI execution
        emit_event("action", f"subprocess.Popen(['nga', 'run', 'review {file}'])")
        time.sleep(1)
        
        # Simulate finding issues or success
        if "memory_pool.cpp" in file:
            emit_event("output", f"[{task_id}] nga output: Memory Leak detected: `malloc` is called but `deallocate()` is a stub.")
            issues_found.append({
                "severity": "Critical",
                "message": "Memory Leak detected: `malloc` is called in `allocate()` but `deallocate()` is a stub without `free(ptr)`. This will cause severe memory leaks.",
                "file": file
            })
        elif "scheduler.c" in file:
             emit_event("output", f"[{task_id}] nga output: Null pointer dereference risk on line 120.")
             issues_found.append({
                "severity": "High",
                "message": "Null pointer dereference: No check for NULL before using pointer `task_info`.",
                "file": file
            })
        else:
            emit_event("output", f"[{task_id}] nga output: No obvious issues found. Looks clean.")

        emit_event("system", f"[{task_id}] Finished {file}. Elapsed: {random.uniform(2, 5):.1f}s")
        
    emit_event("system", f"Finished: {len(files_to_scan)}/{len(files_to_scan)} files | Success: {len(files_to_scan)} | Failed: 0")
    
    # Finally, emit result payload
    emit_event("result", "Scan completed", {"issues": issues_found})

if __name__ == "__main__":
    main()

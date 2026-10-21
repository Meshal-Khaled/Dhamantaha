#!/usr/bin/env python3
"""Host-side, read-only Docker collector. Never exports env values or raw logs."""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys

EVENTS = {"request", "provider_attempt", "server_started", "server_stopping", "request_completed", "request_complete", "request_finished", "analysis_not_configured", "mock_provider_enabled"}
QR_CONTAINERS = {"dhamantaha-website-website-1", "dhamantaha-qr-1"}

def command(*args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=True)
    if len(result.stdout) > 524288:
        raise RuntimeError("output_limit")
    return result.stdout.decode("utf-8", "replace")

def safe_logs(raw):
    events = []
    omitted = 0
    for line in raw.splitlines()[-60:]:
        try:
            row = json.loads(line)
        except (ValueError, TypeError):
            omitted += 1
            continue
        event = row.get("event")
        if event not in EVENTS:
            omitted += 1
            continue
        entry = {"event": event}
        for name in ("time", "level", "key", "model", "category", "route", "method"):
            value = row.get(name)
            if isinstance(value, str) and len(value) <= 100 and re.fullmatch(r"[a-zA-Z0-9_ .:+/\-]+", value) and not re.search(r"AIza|sk-|Bearer", value):
                entry[name] = value
        for name in ("status", "statusCode", "durationMs", "attempt", "ok"):
            value = row.get(name)
            if isinstance(value, (int, float, bool)):
                entry[name] = value
        events.append(entry)
    return events, omitted

def container_summary(info, raw):
    name = info["Name"].lstrip("/")
    mounts = info.get("Mounts", [])
    keys = []
    for mount in mounts:
        source = mount.get("Source", "")
        dest = mount.get("Destination", "")
        if re.search(r"/gemini(?:\.\d+)?\.key$", source):
            keys.append(Path(source).name)
        elif dest == "/app/keys":
            keys.append("Ring key registry mounted · active selection managed by gateway")
        elif "gemini" in dest.lower():
            keys.append("Gemini secret mounted")
    if any("GEMINI" in env.split("=", 1)[0] and "KEY" in env.split("=", 1)[0] and env.partition("=")[2] for env in info.get("Config", {}).get("Env", [])) and not keys:
        keys.append("Gemini credential configured · environment")
    state = info.get("State", {})
    events, omitted = safe_logs(raw)
    return {"name": name, "image": info.get("Config", {}).get("Image", ""), "status": state.get("Status", "unknown"),
            "health": state.get("Health", {}).get("Status", "not configured"), "startedAt": state.get("StartedAt"),
            "restarts": info.get("RestartCount", 0), "memoryLimitBytes": info.get("HostConfig", {}).get("Memory", 0),
            "keyAssignments": keys, "logs": events, "omittedLogLines": omitted}

def collect():
    ids = command("docker", "ps", "-aq").split()[:32]
    rows = []
    for ident in ids:
        info = json.loads(command("docker", "inspect", ident))[0]
        if info["Name"].lstrip("/") not in QR_CONTAINERS:
            continue
        # Only the Dhamantaha API's structured metadata is shown as log entries.
        raw = command("docker", "logs", "--tail", "60", ident)
        rows.append(container_summary(info, raw))
    qr_usage_file = Path("/home/ubuntu/dhamantaha/qr-state/usage.json")
    qr_usage = None
    if qr_usage_file.exists():
        saved = json.loads(qr_usage_file.read_text())
        users = saved.get("users", {})
        recent = sorted(users.items(), key=lambda pair: pair[1].get("lastSeen", 0), reverse=True)[:25]
        stamp = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).isoformat()
        qr_usage = {**saved.get("totals", {}), "users": len(users), "persistent": True,
                    "unattributedAnalyses": saved.get("unattributedAnalyses", 0),
                    "activeLast24h": sum(datetime.datetime.now().timestamp() * 1000 - u.get("lastSeen", 0) < 86400000 for u in users.values()),
                    "recentUsers": [{"user": ident[:8], **{k: u.get(k, 0) for k in ("visits", "refetches", "analyses", "downloads")},
                                     "firstSeen": stamp(u["firstSeen"]), "lastSeen": stamp(u["lastSeen"]), "containers": u.get("containers", []), "name": u.get("name", ""), "team": u.get("team", "")} for ident, u in recent]}
        qr_usage["requests"] = saved.get("requests", [])[-100:]
    return {"collectedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "containers": rows, "qrUsage": qr_usage}

if __name__ == "__main__":
    destination = Path(sys.argv[1])
    try:
        snapshot = collect()
    except Exception:
        # Preserve the last known snapshot; dashboard explicitly marks it stale.
        sys.exit(1)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot))
    temporary.chmod(0o644)
    os.replace(temporary, destination)

"""Central job store built on top of StateManager."""

import copy
import hashlib
import os
import time


class JobStore:
    def __init__(self, state_manager):
        self.state_manager = state_manager

    def list_jobs(self):
        state = self.state_manager.get_state_snapshot()
        jobs = list((state.get("jobs") or {}).values())
        jobs.sort(key=lambda job: float(job.get("updated_at") or 0), reverse=True)
        return jobs

    def get_job(self, job_id):
        state = self.state_manager.get_state_snapshot()
        job = (state.get("jobs") or {}).get(job_id)
        return copy.deepcopy(job) if job else None

    def get_recent_events(self, limit=100):
        state = self.state_manager.get_state_snapshot()
        events = list(state.get("events") or [])
        return events[-max(1, int(limit)):]

    def get_recent_errors(self, limit=20):
        events = self.get_recent_events(limit=500)
        errors = [
            event for event in events
            if "error" in str(event.get("event") or "").lower()
            or "failed" in str(event.get("event") or "").lower()
        ]
        return errors[-max(1, int(limit)):]

    def list_flow_runs(self):
        state = self.state_manager.get_state_snapshot()
        runs = list((state.get("flow_runs") or {}).values())
        runs.sort(key=lambda run: float(run.get("updated_at") or 0), reverse=True)
        return runs

    def create_or_update_from_pdf(self, pdf_data):
        pdf_id = str(pdf_data.get("id") or "").strip()
        filename = str(pdf_data.get("filename") or "").strip()
        filepath = str(pdf_data.get("filepath") or pdf_data.get("pdf_path") or "").strip()
        job_id = self._make_job_id(pdf_id or filename or filepath)
        now = time.time()

        def mutate(state):
            jobs = state.setdefault("jobs", {})
            existing = jobs.get(job_id) or self._build_default_job(job_id)
            existing["source"] = existing.get("source") or "scanner"
            existing["pdf_id"] = pdf_id or existing.get("pdf_id") or ""
            existing["pdf_filename"] = filename or existing.get("pdf_filename") or ""
            existing["pdf_path"] = filepath or existing.get("pdf_path") or ""
            if existing["pdf_id"] or existing["pdf_filename"]:
                existing["statuses"]["conversion"] = self._coalesce_status(
                    existing["statuses"].get("conversion"), "pending"
                )
            existing["updated_at"] = now
            jobs[job_id] = existing
            return copy.deepcopy(existing)

        job = self.state_manager.update_state(mutate)
        self.append_event(job["id"], {
            "event": "job.updated",
            "message": f"PDF synchronized: {job.get('pdf_filename') or job.get('pdf_id')}",
            "data": {"pdf_id": job.get("pdf_id"), "pdf_path": job.get("pdf_path")},
        })
        return job

    def create_or_update_from_zoho_mapping(self, mapping):
        filename = str(mapping.get("filename") or "").strip()
        zoho_url = str(mapping.get("zohoUrl") or mapping.get("zoho_url") or "").strip()
        pdf_id = str(mapping.get("pdfId") or "").strip()
        download_id = mapping.get("downloadId")
        captured_at = float(mapping.get("capturedAt") or time.time())
        now = time.time()

        def mutate(state):
            jobs = state.setdefault("jobs", {})
            existing = self._find_job_by_pdf(jobs, pdf_id=pdf_id, filename=filename)
            if existing is None:
                job_id = self._make_job_id(pdf_id or filename or f"mapping-{captured_at}")
                existing = self._build_default_job(job_id)
                jobs[job_id] = existing
            existing["source"] = "zoho"
            existing["pdf_id"] = pdf_id or existing.get("pdf_id") or ""
            existing["pdf_filename"] = filename or existing.get("pdf_filename") or ""
            existing["zoho_url"] = zoho_url or existing.get("zoho_url") or ""
            existing["download_id"] = download_id
            existing["statuses"]["zoho"] = "mapped" if zoho_url else existing["statuses"].get("zoho")
            if existing["pdf_id"] or existing["pdf_filename"]:
                existing["statuses"]["conversion"] = self._coalesce_status(
                    existing["statuses"].get("conversion"), "pending"
                )
            existing["updated_at"] = now
            return copy.deepcopy(existing)

        job = self.state_manager.update_state(mutate)
        self.append_event(job["id"], {
            "event": "job.updated",
            "message": "Zoho mapping imported",
            "data": {"zoho_url": job.get("zoho_url"), "download_id": job.get("download_id")},
        })
        return job

    def update_job_status(self, job_id, domain, status, message=""):
        updated = False
        now = time.time()

        def mutate(state):
            nonlocal updated
            job = (state.setdefault("jobs", {})).get(job_id)
            if not job:
                return False
            job.setdefault("statuses", {})
            job["statuses"][domain] = status
            if message and status in {"error", "failed"}:
                job["last_error"] = message
            job["updated_at"] = now
            updated = True
            return True

        self.state_manager.update_state(mutate)
        if updated:
            self.append_event(job_id, {
                "event": f"{domain}.status",
                "message": message or f"{domain} -> {status}",
                "data": {"domain": domain, "status": status},
            })
        return updated

    def set_excel_path(self, job_id, excel_path):
        updated = False
        now = time.time()

        def mutate(state):
            nonlocal updated
            job = (state.setdefault("jobs", {})).get(job_id)
            if not job:
                return False
            job["excel_path"] = str(excel_path or "").strip()
            job["converted_at"] = now if excel_path else job.get("converted_at")
            job["statuses"]["conversion"] = "completed" if excel_path else job["statuses"].get("conversion")
            job["updated_at"] = now
            updated = True
            return True

        self.state_manager.update_state(mutate)
        if updated:
            self.append_event(job_id, {
                "event": "file.converted",
                "message": "Excel path updated",
                "data": {"excel_path": excel_path},
            })
        return updated

    def append_event(self, job_id, event):
        timestamp = float(event.get("timestamp") or time.time())
        stored_event = {
            "timestamp": timestamp,
            "event": str(event.get("event") or "job.event"),
            "job_id": job_id,
            "flow_id": event.get("flow_id"),
            "step_id": event.get("step_id"),
            "agent_type": event.get("agent_type"),
            "message": str(event.get("message") or ""),
            "data": copy.deepcopy(event.get("data") or {}),
        }

        def mutate(state):
            events = state.setdefault("events", [])
            events.append(stored_event)
            if len(events) > 1000:
                del events[:-1000]
            job = (state.setdefault("jobs", {})).get(job_id)
            if job:
                job.setdefault("events", [])
                job["events"].append(stored_event)
                if len(job["events"]) > 200:
                    del job["events"][:-200]
                job["updated_at"] = timestamp
            return True

        return self.state_manager.update_state(mutate)

    def append_step_result(self, job_id, step):
        timestamp = float(step.get("timestamp") or time.time())
        stored_step = copy.deepcopy(step)
        stored_step.setdefault("timestamp", timestamp)

        def mutate(state):
            job = (state.setdefault("jobs", {})).get(job_id)
            if not job:
                return False
            job.setdefault("steps", [])
            job["steps"].append(stored_step)
            if len(job["steps"]) > 100:
                del job["steps"][:-100]
            job["updated_at"] = timestamp
            return True

        return self.state_manager.update_state(mutate)

    def create_flow_run(self, flow_id, job_id):
        run_id = f"run_{int(time.time() * 1000)}"
        now = time.time()
        run = {
            "id": run_id,
            "flow_id": flow_id,
            "job_id": job_id,
            "status": "started",
            "created_at": now,
            "updated_at": now,
            "last_error": "",
        }

        def mutate(state):
            state.setdefault("flow_runs", {})[run_id] = copy.deepcopy(run)
            return copy.deepcopy(run)

        return self.state_manager.update_state(mutate)

    def update_flow_run(self, run_id, **updates):
        now = time.time()

        def mutate(state):
            run = (state.setdefault("flow_runs", {})).get(run_id)
            if not run:
                return None
            for key, value in updates.items():
                if value is not None:
                    run[key] = value
            run["updated_at"] = now
            return copy.deepcopy(run)

        return self.state_manager.update_state(mutate)

    def wait_for_job_status(self, job_id, domain, expected_statuses, timeout_s=30, poll_interval_s=0.5):
        deadline = time.time() + max(0.1, float(timeout_s))
        expected = set(expected_statuses or [])
        while time.time() < deadline:
            job = self.get_job(job_id)
            current = ((job or {}).get("statuses") or {}).get(domain)
            if current in expected:
                return True, job
            time.sleep(poll_interval_s)
        return False, self.get_job(job_id)

    def _build_default_job(self, job_id):
        now = time.time()
        return {
            "id": job_id,
            "source": "",
            "pdf_id": "",
            "pdf_filename": "",
            "pdf_path": "",
            "zoho_url": "",
            "excel_path": "",
            "download_id": None,
            "statuses": {
                "zoho": "not_mapped",
                "conversion": "not_started",
                "site2": "not_started",
                "flow": "idle",
            },
            "last_error": "",
            "created_at": now,
            "updated_at": now,
            "converted_at": None,
            "sent_at": None,
            "steps": [],
            "events": [],
        }

    def _find_job_by_pdf(self, jobs, pdf_id="", filename=""):
        normalized_filename = self._normalize_filename(filename)
        for job in jobs.values():
            if pdf_id and str(job.get("pdf_id") or "") == pdf_id:
                return job
            if normalized_filename and self._normalize_filename(job.get("pdf_filename")) == normalized_filename:
                return job
        return None

    def _make_job_id(self, seed):
        digest = hashlib.md5(str(seed or time.time()).encode("utf-8")).hexdigest()[:12]
        return f"job_{digest}"

    def _normalize_filename(self, filename):
        return os.path.basename(str(filename or "")).strip().lower()

    def _coalesce_status(self, current, fallback):
        if current and current not in {"not_started", "idle"}:
            return current
        return fallback

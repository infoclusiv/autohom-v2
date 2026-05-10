"""Background flow orchestration for central jobs."""

import json
import os
import threading
import time

from config import FLOWS_FILE


class FlowOrchestrator:
    def __init__(self, job_store, ws_server, flows_file=FLOWS_FILE):
        self.job_store = job_store
        self.ws_server = ws_server
        self.flows_file = flows_file

    def list_flows(self):
        if not os.path.isfile(self.flows_file):
            return []
        try:
            with open(self.flows_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return list(data.get("flows") or [])
        except Exception:
            return []

    def start_flow(self, flow_id, job_id):
        run = self.job_store.create_flow_run(flow_id, job_id)
        thread = threading.Thread(
            target=self.run_flow,
            args=(flow_id, job_id, run["id"]),
            daemon=True,
        )
        thread.start()
        return run

    def run_flow(self, flow_id, job_id, run_id=None):
        job = self.job_store.get_job(job_id)
        flow = self._get_flow(flow_id)
        if not job:
            if run_id:
                self.job_store.update_flow_run(run_id, status="error", last_error="Job not found")
            return {"ok": False, "error": "Job not found"}
        if not flow:
            if run_id:
                self.job_store.update_flow_run(run_id, status="error", last_error="Flow not found")
            return {"ok": False, "error": "Flow not found"}

        self.job_store.update_job_status(job_id, "flow", "running", f"Flow {flow_id} started")
        self.job_store.append_event(job_id, {
            "event": "flow.started",
            "flow_id": flow_id,
            "message": f"Starting flow {flow_id}",
        })

        for step in flow.get("steps") or []:
            result = self.run_step(self.job_store.get_job(job_id), step, flow_id)
            if not result.get("ok"):
                error = result.get("error") or f"Step failed: {step.get('id')}"
                self.job_store.update_job_status(job_id, "flow", "error", error)
                self.job_store.append_event(job_id, {
                    "event": "flow.failed",
                    "flow_id": flow_id,
                    "step_id": step.get("id"),
                    "agent_type": step.get("agent_type"),
                    "message": error,
                })
                if run_id:
                    self.job_store.update_flow_run(run_id, status="error", last_error=error)
                return {"ok": False, "error": error}

        self.job_store.update_job_status(job_id, "flow", "completed", f"Flow {flow_id} completed")
        self.job_store.append_event(job_id, {
            "event": "flow.completed",
            "flow_id": flow_id,
            "message": f"Flow {flow_id} completed",
        })
        if run_id:
            self.job_store.update_flow_run(run_id, status="completed")
        return {"ok": True, "run_id": run_id}

    def run_step(self, job, step, flow_id=None):
        job_id = job["id"]
        missing = [field for field in step.get("requires") or [] if not job.get(field)]
        if missing:
            error = f"Missing required fields: {', '.join(missing)}"
            self.job_store.append_step_result(job_id, {
                "step_id": step.get("id"),
                "status": "failed",
                "error": error,
            })
            self.job_store.append_event(job_id, {
                "event": "step.failed",
                "flow_id": flow_id,
                "step_id": step.get("id"),
                "agent_type": step.get("agent_type"),
                "message": error,
            })
            return {"ok": False, "error": error}

        agent_type = step.get("agent_type")
        if not self.ws_server.is_connected(agent_type):
            error = f"{agent_type} agent not connected"
            self.job_store.append_step_result(job_id, {
                "step_id": step.get("id"),
                "status": "failed",
                "error": error,
            })
            self.job_store.append_event(job_id, {
                "event": "step.failed",
                "flow_id": flow_id,
                "step_id": step.get("id"),
                "agent_type": agent_type,
                "message": error,
            })
            return {"ok": False, "error": error}

        self.job_store.append_event(job_id, {
            "event": "step.started",
            "flow_id": flow_id,
            "step_id": step.get("id"),
            "agent_type": agent_type,
            "message": f"Dispatching {step.get('action')}",
        })

        payload = {
            "action": step.get("action"),
            "jobId": job_id,
            "pdfId": job.get("pdf_id"),
            "filename": job.get("pdf_filename"),
            "excelPath": job.get("excel_path"),
        }
        ok, data, error = self.ws_server.send_agent_request(
            agent_type,
            payload,
            expected_actions={"CONVERT_PDF_ACK", "CONVERSION_STATUS", "UPLOAD_EXCEL_ACK"},
            timeout_s=15,
        )
        if not ok:
            self.job_store.append_step_result(job_id, {
                "step_id": step.get("id"),
                "status": "failed",
                "error": error,
            })
            self.job_store.append_event(job_id, {
                "event": "step.failed",
                "flow_id": flow_id,
                "step_id": step.get("id"),
                "agent_type": agent_type,
                "message": error,
            })
            return {"ok": False, "error": error, "data": data}

        self.job_store.append_event(job_id, {
            "event": "command.ack",
            "flow_id": flow_id,
            "step_id": step.get("id"),
            "agent_type": agent_type,
            "message": f"{step.get('action')} acknowledged",
            "data": data or {},
        })

        if step.get("action") == "CONVERT_PDF":
            self.job_store.update_job_status(job_id, "conversion", "queued", "Conversion queued")
            completed, latest_job = self.job_store.wait_for_job_status(
                job_id,
                "conversion",
                {"completed"},
                timeout_s=180,
            )
            if not completed:
                latest_status = ((latest_job or {}).get("statuses") or {}).get("conversion")
                if latest_status == "error":
                    return {"ok": False, "error": (latest_job or {}).get("last_error") or "Conversion failed"}
                return {"ok": False, "error": "Timeout waiting for conversion completion"}

        self.job_store.append_step_result(job_id, {
            "step_id": step.get("id"),
            "status": "completed",
            "completed_at": time.time(),
        })
        self.job_store.append_event(job_id, {
            "event": "step.completed",
            "flow_id": flow_id,
            "step_id": step.get("id"),
            "agent_type": agent_type,
            "message": f"Step {step.get('id')} completed",
        })
        return {"ok": True}

    def _get_flow(self, flow_id):
        for flow in self.list_flows():
            if flow.get("id") == flow_id:
                return flow
        return None

"""State manager for shared JSON state."""

import hashlib
import json
import os
import threading
import time

from config import STATE_FILE


class StateManager:
    """Thread-safe persistence for folder, PDFs, jobs, and flow state."""

    def __init__(self, state_file=STATE_FILE):
        self._state_file = state_file
        self._lock = threading.Lock()
        self._state = self._load()

    def _default_state(self):
        return {
            "version": 2,
            "current_folder": "",
            "pdfs": {},
            "jobs": {},
            "flow_runs": {},
            "events": [],
        }

    def _ensure_structure(self, data):
        merged = self._default_state()
        if isinstance(data, dict):
            merged.update(data)
        merged["version"] = 2
        if not isinstance(merged.get("pdfs"), dict):
            merged["pdfs"] = {}
        if not isinstance(merged.get("jobs"), dict):
            merged["jobs"] = {}
        if not isinstance(merged.get("flow_runs"), dict):
            merged["flow_runs"] = {}
        if not isinstance(merged.get("events"), list):
            merged["events"] = []
        return merged

    def _load(self):
        if not os.path.exists(self._state_file):
            return self._default_state()
        try:
            with open(self._state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return self._ensure_structure(data)
        except (json.JSONDecodeError, OSError):
            return self._default_state()

    def _save(self):
        try:
            with open(self._state_file, "w", encoding="utf-8") as f:
                json.dump(self._state, f, ensure_ascii=False, indent=2)
        except OSError as ex:
            print(f"[StateManager] Error saving state: {ex}")

    def get_current_folder(self):
        with self._lock:
            return self._state.get("current_folder", "")

    def set_current_folder(self, folder_path):
        with self._lock:
            self._state["current_folder"] = str(folder_path or "").strip()
            self._save()

    def get_state_snapshot(self):
        with self._lock:
            return json.loads(json.dumps(self._state))

    def update_state(self, mutator):
        with self._lock:
            result = mutator(self._state)
            self._state = self._ensure_structure(self._state)
            self._save()
            return result

    @staticmethod
    def make_pdf_id(filepath):
        basename = os.path.basename(filepath)
        return hashlib.md5(basename.encode("utf-8")).hexdigest()[:12]

    def get_all_pdfs(self):
        with self._lock:
            return dict(self._state.get("pdfs", {}))

    def get_pdf(self, pdf_id):
        with self._lock:
            return self._state.get("pdfs", {}).get(pdf_id)

    def upsert_pdf(self, pdf_id, pdf_data):
        with self._lock:
            existing = self._state["pdfs"].get(pdf_id, {})
            existing.update(pdf_data)
            self._state["pdfs"][pdf_id] = existing
            self._save()

    def set_pdf_status(self, pdf_id, status, message=""):
        with self._lock:
            pdf = self._state["pdfs"].get(pdf_id)
            if pdf is None:
                return False
            pdf["status"] = status
            pdf["message"] = message or ""
            if status == "completed":
                pdf["converted_at"] = time.time()
            self._save()
            return True

    def merge_scanned_pdfs(self, scanned_pdfs):
        with self._lock:
            existing = self._state.get("pdfs", {})
            scanned_ids = set()

            for pdf_info in scanned_pdfs:
                pdf_id = pdf_info["id"]
                scanned_ids.add(pdf_id)
                if pdf_id not in existing:
                    existing[pdf_id] = {
                        "id": pdf_id,
                        "filename": pdf_info["filename"],
                        "filepath": pdf_info["filepath"],
                        "status": "pending",
                        "message": "",
                        "created_at": time.time(),
                        "converted_at": None,
                    }
                else:
                    existing[pdf_id]["filepath"] = pdf_info["filepath"]
                    existing[pdf_id]["filename"] = pdf_info["filename"]
                    existing[pdf_id]["status"] = "pending"
                    existing[pdf_id]["message"] = ""
                    existing[pdf_id]["converted_at"] = None

            for pdf_id in list(existing.keys()):
                if pdf_id not in scanned_ids:
                    existing[pdf_id]["status"] = "missing"
                    existing[pdf_id]["message"] = ""
                    existing[pdf_id]["converted_at"] = None

            self._state["pdfs"] = existing
            self._save()
            return existing

    def clear_pdfs(self):
        with self._lock:
            self._state["pdfs"] = {}
            self._save()

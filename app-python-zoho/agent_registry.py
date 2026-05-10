"""In-memory registry of connected automation agents."""

import copy
import threading
import time


class AgentRegistry:
    def __init__(self):
        self._lock = threading.Lock()
        self._agents_by_type = {}
        self._agents_by_connection_id = {}

    def register(self, websocket, meta):
        with self._lock:
            agent_type = str(meta.get("agent_type") or "").strip()
            runtime_id = str(meta.get("runtime_instance_id") or "").strip()
            if not agent_type:
                raise ValueError("agent_type is required")

            existing = self._agents_by_type.get(agent_type)
            if existing and existing.get("runtime_instance_id") == runtime_id and runtime_id:
                raise ValueError("duplicate_runtime")

            if existing:
                old_connection_id = existing.get("connection_id")
                if old_connection_id:
                    self._agents_by_connection_id.pop(old_connection_id, None)

            record = copy.deepcopy(meta)
            record["connected"] = True
            record["last_seen"] = time.time()
            record["_websocket"] = websocket

            self._agents_by_type[agent_type] = record
            self._agents_by_connection_id[record["connection_id"]] = agent_type
            return self._sanitize(record)

    def unregister_by_connection_id(self, connection_id):
        with self._lock:
            agent_type = self._agents_by_connection_id.pop(connection_id, None)
            if not agent_type:
                return None
            record = self._agents_by_type.get(agent_type)
            if record and record.get("connection_id") == connection_id:
                self._agents_by_type.pop(agent_type, None)
                return self._sanitize(record)
            return None

    def get_agent(self, agent_type):
        with self._lock:
            record = self._agents_by_type.get(agent_type)
            return self._sanitize(record) if record else None

    def list_agents(self):
        with self._lock:
            return [
                self._sanitize(agent)
                for agent in sorted(self._agents_by_type.values(), key=lambda item: item.get("agent_type", ""))
            ]

    def is_connected(self, agent_type):
        with self._lock:
            return agent_type in self._agents_by_type

    def get_websocket(self, agent_type):
        with self._lock:
            agent = self._agents_by_type.get(agent_type)
            return agent.get("_websocket") if agent else None

    def touch(self, connection_id):
        with self._lock:
            agent_type = self._agents_by_connection_id.get(connection_id)
            if not agent_type:
                return
            agent = self._agents_by_type.get(agent_type)
            if agent:
                agent["last_seen"] = time.time()

    def _sanitize(self, record):
        if not record:
            return None
        clean = dict(record)
        clean.pop("_websocket", None)
        return clean

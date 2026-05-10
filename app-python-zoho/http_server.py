"""HTTP API server for the central orchestrator."""

import asyncio
import contextlib
import os

from aiohttp import web

from pdf_scanner import scan_folder


def create_app(state_manager, ws_server, job_store, flow_orchestrator):
    app = web.Application(middlewares=[cors_middleware])
    app["state_manager"] = state_manager
    app["bridge_session"] = ws_server
    app["job_store"] = job_store
    app["flow_orchestrator"] = flow_orchestrator

    app.router.add_get("/api/pdfs", handle_list_pdfs)
    app.router.add_get("/api/pdfs/{pdf_id}/file", handle_serve_pdf)
    app.router.add_post("/api/pdfs/{pdf_id}/status", handle_update_status)
    app.router.add_post("/api/pdfs/clear", handle_clear_pdfs)
    app.router.add_get("/api/config", handle_get_config)
    app.router.add_post("/api/config", handle_set_config)
    app.router.add_post("/api/folder-dialog", handle_folder_dialog)
    app.router.add_post("/api/scan", handle_scan)
    app.router.add_get("/api/bridge", handle_bridge_state)

    app.router.add_get("/api/jobs", handle_list_jobs)
    app.router.add_get("/api/jobs/{job_id}", handle_get_job)
    app.router.add_get("/api/jobs/{job_id}/diagnostics", handle_job_diagnostics)
    app.router.add_post("/api/jobs/import-zoho-mapping", handle_import_zoho_mapping)
    app.router.add_post("/api/jobs/{job_id}/actions/open-zoho", handle_open_zoho)
    app.router.add_post("/api/jobs/{job_id}/actions/convert-pdf", handle_convert_pdf)
    app.router.add_post("/api/jobs/{job_id}/actions/send-excel-site2", handle_send_excel_site2)
    app.router.add_post("/api/jobs/{job_id}/flows/run", handle_run_flow)
    app.router.add_get("/api/agents", handle_list_agents)
    app.router.add_get("/api/flows", handle_list_flows)
    app.router.add_get("/api/events/recent", handle_recent_events)
    app.router.add_route("OPTIONS", "/{path:.*}", handle_options)
    return app


def _choose_initial_dir(initial_folder):
    if initial_folder and os.path.isdir(initial_folder):
        return os.path.abspath(initial_folder)
    return os.path.expanduser("~")


def _open_native_folder_dialog(initial_folder=""):
    root = None
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as ex:
        print(f"[HTTP] Native folder dialog unavailable: {ex}")
        return ""

    try:
        root = tk.Tk()
        root.withdraw()
        with contextlib.suppress(Exception):
            root.attributes("-topmost", True)
        with contextlib.suppress(Exception):
            root.update()
        selected = filedialog.askdirectory(
            title="Selecciona la carpeta con PDFs",
            initialdir=_choose_initial_dir(initial_folder),
            mustexist=True,
            parent=root,
        )
        if not selected:
            return ""
        return os.path.abspath(selected)
    except Exception as ex:
        print(f"[HTTP] Native folder dialog failed: {ex}")
        return ""
    finally:
        if root is not None:
            with contextlib.suppress(Exception):
                root.destroy()


def _sorted_pdf_list(pdfs):
    return sorted(pdfs.values(), key=lambda p: p.get("filename", ""))


def _sync_jobs_from_pdfs(job_store, pdfs):
    for pdf in pdfs.values():
        job_store.create_or_update_from_pdf(pdf)


def _scan_and_merge(state_manager, job_store, folder):
    scanned = scan_folder(folder)
    merged = state_manager.merge_scanned_pdfs(scanned)
    _sync_jobs_from_pdfs(job_store, merged)
    return merged


def _job_by_pdf_id(job_store, pdf_id):
    for job in job_store.list_jobs():
        if job.get("pdf_id") == pdf_id:
            return job
    return None


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return _cors_response()
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def _cors_response():
    return web.Response(
        status=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    )


async def handle_options(request):
    return _cors_response()


async def handle_list_pdfs(request):
    sm = request.app["state_manager"]
    pdfs = sm.get_all_pdfs()
    return web.json_response({"ok": True, "pdfs": _sorted_pdf_list(pdfs), "folder": sm.get_current_folder()})


async def handle_serve_pdf(request):
    pdf_id = request.match_info["pdf_id"]
    sm = request.app["state_manager"]
    pdf = sm.get_pdf(pdf_id)
    if not pdf:
        return web.json_response({"ok": False, "error": "PDF not found"}, status=404)

    filepath = pdf.get("filepath", "")
    if not filepath or not os.path.isfile(filepath):
        return web.json_response({"ok": False, "error": "File not found on disk"}, status=404)

    return web.FileResponse(
        filepath,
        headers={
            "Content-Type": "application/pdf",
            "Content-Disposition": f'attachment; filename="{pdf.get("filename", "file.pdf")}"',
            "Access-Control-Allow-Origin": "*",
        },
    )


async def handle_update_status(request):
    pdf_id = request.match_info["pdf_id"]
    sm = request.app["state_manager"]
    job_store = request.app["job_store"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    status = body.get("status", "")
    message = body.get("message", "")
    ok = sm.set_pdf_status(pdf_id, status, message)
    if not ok:
        return web.json_response({"ok": False, "error": "PDF not found"}, status=404)

    job = _job_by_pdf_id(job_store, pdf_id)
    if job:
        job_store.update_job_status(job["id"], "conversion", status, message)
    return web.json_response({"ok": True})


async def handle_clear_pdfs(request):
    sm = request.app["state_manager"]
    await asyncio.to_thread(sm.clear_pdfs)
    return web.json_response({
        "ok": True,
        "current_folder": sm.get_current_folder(),
        "pdfs": [],
        "count": 0,
    })


async def handle_get_config(request):
    sm = request.app["state_manager"]
    return web.json_response({"ok": True, "current_folder": sm.get_current_folder()})


async def handle_folder_dialog(request):
    sm = request.app["state_manager"]
    body = {}
    if request.can_read_body:
        try:
            body = await request.json()
        except Exception:
            body = {}

    initial_folder = str(body.get("initial_folder") or sm.get_current_folder() or "").strip()
    selected_folder = await asyncio.to_thread(_open_native_folder_dialog, initial_folder)
    if not selected_folder:
        return web.json_response({"ok": True, "selected": False, "folder": sm.get_current_folder()})

    await asyncio.to_thread(sm.set_current_folder, selected_folder)
    return web.json_response({"ok": True, "selected": True, "folder": selected_folder})


async def handle_set_config(request):
    sm = request.app["state_manager"]
    job_store = request.app["job_store"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    folder = body.get("folder", "").strip()
    pdfs = sm.get_all_pdfs()
    if folder:
        if not os.path.isdir(folder):
            return web.json_response({"ok": False, "error": f"Folder not found: {folder}"}, status=400)
        folder = os.path.abspath(folder)
        await asyncio.to_thread(sm.set_current_folder, folder)
        pdfs = await asyncio.to_thread(_scan_and_merge, sm, job_store, folder)

    pdf_list = _sorted_pdf_list(pdfs)
    return web.json_response({
        "ok": True,
        "current_folder": sm.get_current_folder(),
        "pdfs": pdf_list,
        "count": len(pdf_list),
    })


async def handle_scan(request):
    sm = request.app["state_manager"]
    job_store = request.app["job_store"]
    folder = sm.get_current_folder()
    if not folder or not os.path.isdir(folder):
        return web.json_response({"ok": False, "error": "No valid folder configured"}, status=400)

    pdfs = await asyncio.to_thread(_scan_and_merge, sm, job_store, folder)
    pdf_list = _sorted_pdf_list(pdfs)
    return web.json_response({"ok": True, "pdfs": pdf_list, "count": len(pdf_list)})


async def handle_bridge_state(request):
    bridge = request.app["bridge_session"]
    return web.json_response({"ok": True, "bridge": bridge.get_bridge_state()})


async def handle_list_jobs(request):
    jobs = request.app["job_store"].list_jobs()
    return web.json_response({"ok": True, "jobs": jobs})


async def handle_get_job(request):
    job = request.app["job_store"].get_job(request.match_info["job_id"])
    if not job:
        return web.json_response({"ok": False, "error": "Job not found"}, status=404)
    return web.json_response({"ok": True, "job": job})


async def handle_job_diagnostics(request):
    job_store = request.app["job_store"]
    bridge = request.app["bridge_session"]
    job_id = request.match_info["job_id"]
    job = job_store.get_job(job_id)
    if not job:
        return web.json_response({"ok": False, "error": "Job not found"}, status=404)
    return web.json_response({
        "ok": True,
        "job": job,
        "events": job.get("events", []),
        "agents": bridge.list_agents(),
        "recent_errors": job_store.get_recent_errors(),
    })


async def handle_import_zoho_mapping(request):
    job_store = request.app["job_store"]
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    job = await asyncio.to_thread(job_store.create_or_update_from_zoho_mapping, body)
    return web.json_response({"ok": True, "job": job})


async def handle_open_zoho(request):
    job_store = request.app["job_store"]
    job = job_store.get_job(request.match_info["job_id"])
    if not job:
        return web.json_response({"ok": False, "error": "Job not found"}, status=404)
    if not job.get("zoho_url"):
        return web.json_response({"ok": False, "error": "Job has no zoho_url"}, status=400)
    return web.json_response({"ok": True, "zohoUrl": job.get("zoho_url")})


async def handle_convert_pdf(request):
    job_store = request.app["job_store"]
    bridge = request.app["bridge_session"]
    job = job_store.get_job(request.match_info["job_id"])
    if not job:
        return web.json_response({"ok": False, "error": "Job not found"}, status=404)
    if not job.get("pdf_id") and not job.get("pdf_path"):
        return web.json_response({"ok": False, "error": "Job has no pdf_id or pdf_path"}, status=400)
    if not bridge.is_connected("ilovepdf-converter"):
        return web.json_response({"ok": False, "error": "ilovepdf-converter agent not connected"}, status=400)

    job_store.update_job_status(job["id"], "conversion", "queued", "Conversion queued from HTTP action")
    ok, data, error = await asyncio.to_thread(
        bridge.send_agent_request,
        "ilovepdf-converter",
        {
            "action": "CONVERT_PDF",
            "jobId": job["id"],
            "pdfId": job.get("pdf_id"),
            "filename": job.get("pdf_filename"),
        },
        {"CONVERT_PDF_ACK", "CONVERSION_STATUS"},
        15,
    )
    if not ok:
        job_store.update_job_status(job["id"], "conversion", "error", error)
        return web.json_response({"ok": False, "error": error}, status=500)
    return web.json_response({"ok": True, "job": job_store.get_job(job["id"]), "response": data})


async def handle_send_excel_site2(request):
    job_store = request.app["job_store"]
    bridge = request.app["bridge_session"]
    job = job_store.get_job(request.match_info["job_id"])
    if not job:
        return web.json_response({"ok": False, "error": "Job not found"}, status=404)
    if not job.get("excel_path"):
        return web.json_response({"ok": False, "error": "Job has no excel_path"}, status=400)
    if not bridge.is_connected("site2-uploader"):
        return web.json_response({"ok": False, "error": "site2-uploader agent not connected"}, status=400)
    return web.json_response({"ok": False, "error": "site2-uploader flow is not implemented yet"}, status=501)


async def handle_run_flow(request):
    job_store = request.app["job_store"]
    flow_orchestrator = request.app["flow_orchestrator"]
    job_id = request.match_info["job_id"]
    job = job_store.get_job(job_id)
    if not job:
        return web.json_response({"ok": False, "error": "Job not found"}, status=404)

    body = {}
    if request.can_read_body:
        with contextlib.suppress(Exception):
            body = await request.json()
    flow_id = body.get("flowId") or body.get("flow_id") or "pdf_to_excel"
    run = flow_orchestrator.start_flow(flow_id, job_id)
    return web.json_response({"ok": True, "flow_run_id": run["id"], "status": "started"})


async def handle_list_agents(request):
    agents = request.app["bridge_session"].list_agents()
    return web.json_response({"ok": True, "agents": agents})


async def handle_list_flows(request):
    flows = request.app["flow_orchestrator"].list_flows()
    return web.json_response({"ok": True, "flows": flows})


async def handle_recent_events(request):
    events = request.app["job_store"].get_recent_events(limit=int(request.query.get("limit", "100")))
    return web.json_response({"ok": True, "events": events})

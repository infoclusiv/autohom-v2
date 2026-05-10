"""PDF Scanner — escanea una carpeta y lista archivos .pdf."""

import os

from state_manager import StateManager


def scan_folder(folder_path):
    """Escanea la carpeta y retorna una lista de dicts con info de cada PDF."""
    if not folder_path or not os.path.isdir(folder_path):
        return []

    results = []
    try:
        for entry in sorted(os.listdir(folder_path)):
            if not entry.lower().endswith(".pdf"):
                continue
            filepath = os.path.join(folder_path, entry)
            if not os.path.isfile(filepath):
                continue
            pdf_id = StateManager.make_pdf_id(filepath)
            results.append({
                "id": pdf_id,
                "filename": entry,
                "filepath": os.path.abspath(filepath),
            })
    except OSError as ex:
        print(f"[PDFScanner] Error scanning {folder_path}: {ex}")

    return results

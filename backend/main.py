from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler
import os
import threading
from collections import defaultdict
import fnmatch
from backend.scanner import Scanner

app = FastAPI()

APP_VERSION = "v1.2.0"
APP_CHANGELOG = [
    "Refactored ignore folder logic to scan all images and dynamically filter them on the frontend",
    "Added logarithmic blur slider",
    "Display file size and paths on image cards",
    "Lazily calculate file sizes for backward compatibility",
    "Added Settings tab with wildcard ignore functionality",
    "Fixed OpenCV memory leak by disabling multithreading and aggressive GC",
    "Upgraded OpenCV to 4.10+ to fix NumPy 2.x incompatibility"
]

IMAGE_DIR = os.getenv("IMAGE_DIR", "./sample_images")
STATE_FILE = os.getenv("STATE_FILE", "./app_data/state.json")

scanner = Scanner(image_dir=IMAGE_DIR, state_file=STATE_FILE)

# Schedule weekly scan
scheduler = BackgroundScheduler()
# 0 0 * * 0 means midnight on Sunday (once a week)
scheduler.add_job(scanner.scan, 'cron', day_of_week='sun', hour=0, minute=0)
scheduler.start()

# Ensure directories exist
os.makedirs(IMAGE_DIR, exist_ok=True)
os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)

# Mount frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.on_event("startup")
def startup_event():
    print(f"==========================================")
    print(f" Starting Image Analyzer {APP_VERSION}")
    print(f"==========================================")
    for change in APP_CHANGELOG:
        print(f" - {change}")
        
    # Run an initial background scan on startup just to be sure we have some state
    # if it's completely empty.
    if not scanner.state.images:
        threading.Thread(target=scanner.scan).start()

@app.get("/")
def read_root():
    return FileResponse("frontend/index.html")

import math

@app.get("/api/status")
def get_status():
    return {
        "is_scanning": scanner.state.is_scanning,
        "total_files": scanner.state.total_files,
        "processed_files": scanner.state.processed_files
    }

def is_folder_ignored(path: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
    return False

@app.get("/api/images/blurred")
def get_blurred_images(page: int = 1, limit: int = 50, threshold: float = 100.0):
    images = [
        img for img in scanner.state.images.values() 
        if not img.is_ignored 
        and not is_folder_ignored(img.path, scanner.state.ignore_patterns) 
        and img.blur_score < threshold
    ]
    # sort by blur score ascending (most blurred first)
    images.sort(key=lambda x: x.blur_score)
    
    total = len(images)
    total_pages = math.ceil(total / limit) if total > 0 else 1
    start = (page - 1) * limit
    end = start + limit
    paginated = images[start:end]
    
    for img in paginated:
        if img.filesize == 0:
            try:
                img.filesize = os.path.getsize(os.path.join(IMAGE_DIR, img.path))
            except OSError:
                pass
    
    return {
        "images": paginated,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@app.get("/api/images/duplicates")
def get_duplicate_images(page: int = 1, limit: int = 10):
    images = [
        img for img in scanner.state.images.values() 
        if not img.is_ignored
        and not is_folder_ignored(img.path, scanner.state.ignore_patterns)
    ]
    
    hash_map = defaultdict(list)
    for img in images:
        hash_map[img.file_hash].append(img)
        
    duplicates = [group for group in hash_map.values() if len(group) > 1]
    duplicates.sort(key=lambda g: (-len(g), g[0].path))
    
    total = len(duplicates)
    total_pages = math.ceil(total / limit) if total > 0 else 1
    start = (page - 1) * limit
    end = start + limit
    paginated = duplicates[start:end]
    
    for group in paginated:
        for img in group:
            if img.filesize == 0:
                try:
                    img.filesize = os.path.getsize(os.path.join(IMAGE_DIR, img.path))
                except OSError:
                    pass
    
    return {
        "duplicates": paginated,
        "total_groups": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@app.post("/api/scan")
def trigger_scan():
    threading.Thread(target=scanner.scan).start()
    return {"status": "Scan started in background"}

@app.delete("/api/images/{path:path}")
def delete_image(path: str):
    if path not in scanner.state.images:
        raise HTTPException(status_code=404, detail="Image not found in state")
    
    full_path = os.path.join(IMAGE_DIR, path)
    if os.path.exists(full_path):
        os.remove(full_path)
    
    del scanner.state.images[path]
    scanner.save_state()
    return {"status": "Deleted"}

@app.post("/api/images/{path:path}/ignore")
def ignore_image(path: str):
    if path not in scanner.state.images:
        raise HTTPException(status_code=404, detail="Image not found in state")
    
    scanner.state.images[path].is_ignored = True
    scanner.save_state()
    return {"status": "Ignored"}

@app.get("/api/serve-image/{path:path}")
def serve_image(path: str):
    full_path = os.path.join(IMAGE_DIR, path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(full_path)

from pydantic import BaseModel
class SettingsUpdate(BaseModel):
    ignore_patterns: list[str]

@app.get("/api/settings")
def get_settings():
    return {"ignore_patterns": scanner.state.ignore_patterns}

@app.post("/api/settings")
def update_settings(settings: SettingsUpdate):
    # filter empty strings
    patterns = [p.strip() for p in settings.ignore_patterns if p.strip()]
    scanner.state.ignore_patterns = patterns
    scanner.save_state()
    return {"status": "Settings updated", "ignore_patterns": scanner.state.ignore_patterns}

@app.get("/api/version")
def get_version():
    return {
        "version": APP_VERSION,
        "changelog": APP_CHANGELOG
    }

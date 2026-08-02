from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler
import os
import threading
from collections import defaultdict
from backend.scanner import Scanner

app = FastAPI()

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
    # Run an initial background scan on startup just to be sure we have some state
    # if it's completely empty.
    if not scanner.state.images:
        threading.Thread(target=scanner.scan).start()

@app.get("/")
def read_root():
    return FileResponse("frontend/index.html")

@app.get("/api/images")
def get_images():
    images = list(scanner.state.images.values())
    
    # Calculate duplicates
    hash_map = defaultdict(list)
    for img in images:
        hash_map[img.file_hash].append(img)
        
    duplicates = [group for group in hash_map.values() if len(group) > 1]
    
    return {
        "images": images,
        "duplicates": duplicates
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

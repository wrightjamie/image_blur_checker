import os
import cv2
import hashlib
import json
from pathlib import Path
from backend.models import ScanState, ImageDetail

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'}

def calculate_file_hash(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

def calculate_blur_score(filepath: str) -> float:
    # Read image using cv2
    image = cv2.imread(filepath)
    if image is None:
        return 10000.0 # Cannot read, assume not blurred to avoid false positives
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    fm = cv2.Laplacian(gray, cv2.CV_64F).var()
    return float(fm)

class Scanner:
    def __init__(self, image_dir: str, state_file: str):
        self.image_dir = image_dir
        self.state_file = state_file
        self.state = self.load_state()
        # Reset scanning flag on startup in case it crashed midway
        if self.state.is_scanning:
            self.state.is_scanning = False
            self.save_state()

    def load_state(self) -> ScanState:
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    data = json.load(f)
                    return ScanState(**data)
            except Exception as e:
                print(f"Error loading state: {e}")
        return ScanState()

    def save_state(self):
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        with open(self.state_file, 'w') as f:
            f.write(self.state.model_dump_json(indent=2))

    def scan(self):
        if self.state.is_scanning:
            print("Scan already in progress.")
            return

        print(f"Starting scan in {self.image_dir}...")
        self.state.is_scanning = True
        self.state.total_files = 0
        self.state.processed_files = 0
        self.save_state()
        
        # Pre-count total files
        file_list = []
        for root, _, files in os.walk(self.image_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in IMAGE_EXTENSIONS:
                    filepath = os.path.join(root, file)
                    rel_path = os.path.relpath(filepath, self.image_dir)
                    file_list.append((filepath, rel_path))
                    
        self.state.total_files = len(file_list)
        self.save_state()

        current_files = set()
        
        for i, (filepath, rel_path) in enumerate(file_list):
            current_files.add(rel_path)
            
            if rel_path not in self.state.images:
                # New image, calculate details
                try:
                    file_hash = calculate_file_hash(filepath)
                    blur_score = calculate_blur_score(filepath)
                    
                    self.state.images[rel_path] = ImageDetail(
                        path=rel_path,
                        filename=os.path.basename(filepath),
                        file_hash=file_hash,
                        blur_score=blur_score,
                        is_ignored=False
                    )
                except Exception as e:
                    print(f"Failed to process {rel_path}: {e}")
            
            self.state.processed_files = i + 1
            
            # Periodic save every 500 images
            if (i + 1) % 500 == 0:
                self.save_state()
        
        # Remove deleted files from state
        to_remove = []
        for rel_path in self.state.images:
            if rel_path not in current_files:
                to_remove.append(rel_path)
        for rel_path in to_remove:
            del self.state.images[rel_path]
            
        self.state.is_scanning = False
        self.save_state()
        print("Scan complete.")

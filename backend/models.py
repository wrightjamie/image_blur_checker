from pydantic import BaseModel
from typing import List, Dict, Optional

class ImageDetail(BaseModel):
    path: str
    filename: str
    file_hash: str
    blur_score: float
    is_ignored: bool = False

class ScanState(BaseModel):
    images: Dict[str, ImageDetail] = {}

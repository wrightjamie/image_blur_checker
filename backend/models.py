from pydantic import BaseModel
from typing import List, Dict, Optional

class ImageDetail(BaseModel):
    path: str
    filename: str
    file_hash: str
    blur_score: float
    is_ignored: bool = False
    filesize: int = 0

class ScanState(BaseModel):
    images: Dict[str, ImageDetail] = {}
    is_scanning: bool = False
    total_files: int = 0
    processed_files: int = 0
    ignore_patterns: List[str] = ["*/@eaDir/*"]

class PaginatedImages(BaseModel):
    images: List[ImageDetail]
    total: int
    page: int
    limit: int
    total_pages: int

class PaginatedDuplicates(BaseModel):
    duplicates: List[List[ImageDetail]]
    total_groups: int
    page: int
    limit: int
    total_pages: int

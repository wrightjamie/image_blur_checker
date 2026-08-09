from pydantic import BaseModel, model_validator
from typing import List, Dict, Optional, Any

class ImageDetail(BaseModel):
    path: str
    filename: str
    file_hash: str
    blur_score: float
    ignore_blur: bool = False
    ignore_duplicate: bool = False
    filesize: int = 0

    @model_validator(mode='before')
    @classmethod
    def migrate_is_ignored(cls, data: Any) -> Any:
        if isinstance(data, dict) and 'is_ignored' in data:
            val = data.pop('is_ignored')
            if 'ignore_blur' not in data:
                data['ignore_blur'] = val
            if 'ignore_duplicate' not in data:
                data['ignore_duplicate'] = val
        return data

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

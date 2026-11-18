from typing import Generic, TypeVar, List, Optional
from pydantic import BaseModel, Field

T = TypeVar("T")

class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, description="Page number starting from 1")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)")
    search: Optional[str] = Field(default=None, description="Search keyword")
    sort_by: Optional[str] = Field(default=None, description="Field name to sort by")
    sort_order: Optional[str] = Field(default="desc", pattern="^(asc|desc)$", description="Sort order: asc or desc")

class PageResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

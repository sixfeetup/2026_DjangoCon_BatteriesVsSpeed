from __future__ import annotations

from typing import Annotated

from ninja import Field
from ninja import Query
from ninja import Router

from listings.schemas import DetailSchema
from listings.schemas import ListingsResponseSchema
from listings.selectors import ZipCodeNotFound
from listings.selectors import listings_for_zip

router = Router(auth=None, tags=["listings"])
ZipPath = Annotated[str, Field(pattern=r"^[0-9]{5}$")]
LimitQuery = Annotated[int, Field(ge=1, le=50)]
OffsetQuery = Annotated[int, Field(ge=0, le=199)]


@router.get(
    "/zip-codes/{zip_code}/listings",
    response={200: ListingsResponseSchema, 404: DetailSchema},
)
def get_listings(
    request,
    zip_code: ZipPath,
    limit: LimitQuery = Query(20),
    offset: OffsetQuery = Query(0),
):
    try:
        return 200, listings_for_zip(zip_code, limit, offset)
    except ZipCodeNotFound:
        return 404, {"detail": "ZIP code not found"}

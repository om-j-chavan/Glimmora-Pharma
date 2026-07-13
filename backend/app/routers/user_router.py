"""
User Router
-----------
Your existing user routes go here.
This file was already in your project — kept as-is.
"""

from fastapi import APIRouter

router = APIRouter(
    prefix="/api/v1/users",
    tags=["Users"]
)


@router.get("/", summary="Get All Users")
def get_users():
    """Placeholder — replace with your actual user logic."""
    return {"message": "Users endpoint working ✅"}
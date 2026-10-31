"""Authenticated crop records scoped to their owning account."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.api.auth import CurrentUser
from app.models.schemas import CropCreate, CropResponse
from app.services.database import database_connection

router = APIRouter(prefix="/api/v1/crops", tags=["crop management"])


def _crop_response(row: sqlite3.Row) -> CropResponse:
    return CropResponse(
        id=row["id"],
        name=row["name"],
        variety=row["variety"],
        planting_date=row["planting_date"],
        farm_location=row["farm_location"],
        soil_type=row["soil_type"],
        growth_stage=row["growth_stage"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=list[CropResponse])
def list_crops(user: CurrentUser) -> list[CropResponse]:
    with database_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM crops WHERE owner_id = ? ORDER BY created_at DESC",
            (user.id,),
        ).fetchall()
    return [_crop_response(row) for row in rows]


@router.post("", response_model=CropResponse, status_code=status.HTTP_201_CREATED)
def create_crop(payload: CropCreate, user: CurrentUser) -> CropResponse:
    crop_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).isoformat()
    with database_connection() as connection:
        connection.execute(
            """
            INSERT INTO crops(
                id, owner_id, name, variety, planting_date, farm_location,
                soil_type, growth_stage, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                crop_id,
                user.id,
                payload.name,
                payload.variety,
                payload.planting_date.isoformat() if payload.planting_date else None,
                payload.farm_location,
                payload.soil_type,
                payload.growth_stage,
                now,
                now,
            ),
        )
        row = connection.execute(
            "SELECT * FROM crops WHERE id = ? AND owner_id = ?",
            (crop_id, user.id),
        ).fetchone()
    return _crop_response(row)


@router.put("/{crop_id}", response_model=CropResponse)
def update_crop(crop_id: str, payload: CropCreate, user: CurrentUser) -> CropResponse:
    now = datetime.now(timezone.utc).isoformat()
    with database_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE crops
            SET name = ?, variety = ?, planting_date = ?, farm_location = ?,
                soil_type = ?, growth_stage = ?, updated_at = ?
            WHERE id = ? AND owner_id = ?
            """,
            (
                payload.name,
                payload.variety,
                payload.planting_date.isoformat() if payload.planting_date else None,
                payload.farm_location,
                payload.soil_type,
                payload.growth_stage,
                now,
                crop_id,
                user.id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Crop record not found.")
        row = connection.execute(
            "SELECT * FROM crops WHERE id = ? AND owner_id = ?",
            (crop_id, user.id),
        ).fetchone()
    return _crop_response(row)


@router.delete("/{crop_id}")
def delete_crop(crop_id: str, user: CurrentUser) -> dict[str, bool]:
    with database_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM crops WHERE id = ? AND owner_id = ?",
            (crop_id, user.id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Crop record not found.")
    return {"success": True}

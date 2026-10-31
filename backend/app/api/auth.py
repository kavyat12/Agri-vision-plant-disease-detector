"""Password-based authentication using expiring opaque bearer sessions."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.models.schemas import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.services.database import database_connection

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
bearer_scheme = HTTPBearer(auto_error=False)
SESSION_LIFETIME = timedelta(days=14)
_auth_attempts: dict[str, list[float]] = {}
_attempts_lock = threading.Lock()


def _check_auth_rate_limit(client_host: str) -> None:
    now = time.monotonic()
    cutoff = now - 60
    with _attempts_lock:
        recent = [stamp for stamp in _auth_attempts.get(client_host, []) if stamp > cutoff]
        if len(recent) >= settings.auth_rate_limit_per_minute:
            raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.")
        if client_host not in _auth_attempts and len(_auth_attempts) >= 1024:
            for host, stamps in list(_auth_attempts.items()):
                active = [stamp for stamp in stamps if stamp > cutoff]
                if active:
                    _auth_attempts[host] = active
                else:
                    del _auth_attempts[host]
            if len(_auth_attempts) >= 1024:
                raise HTTPException(status_code=503, detail="Authentication capacity is temporarily limited.")
        recent.append(now)
        _auth_attempts[client_host] = recent


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
        dklen=64,
    )
    return f"{salt.hex()}:{digest.hex()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, digest_hex = stored_hash.split(":", maxsplit=1)
        candidate = _hash_password(password, bytes.fromhex(salt_hex)).split(":", maxsplit=1)[1]
        return hmac.compare_digest(candidate, digest_hex)
    except (ValueError, TypeError):
        return False


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _user_response(row: sqlite3.Row) -> UserResponse:
    return UserResponse(
        id=row["id"],
        email=row["email"],
        full_name=row["full_name"],
        created_at=row["created_at"],
    )


def _issue_session(connection: sqlite3.Connection, user_id: str) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    created_at = _now()
    expires_at = created_at + SESSION_LIFETIME
    connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (created_at.isoformat(),))
    connection.execute(
        "INSERT INTO sessions(token_hash, user_id, expires_at, created_at) "
        "VALUES (?, ?, ?, ?)",
        (
            _token_digest(token),
            user_id,
            expires_at.isoformat(),
            created_at.isoformat(),
        ),
    )
    return token, expires_at


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> UserResponse:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with database_connection() as connection:
        row = connection.execute(
            """
            SELECT users.id, users.email, users.full_name, users.created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (_token_digest(credentials.credentials), _now().isoformat()),
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is invalid or expired. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _user_response(row)


CurrentUser = Annotated[UserResponse, Depends(get_current_user)]


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request) -> AuthResponse:
    _check_auth_rate_limit(request.client.host if request.client else "unknown")
    user_id = uuid.uuid4().hex
    created_at = _now()
    password_hash = _hash_password(payload.password)
    try:
        with database_connection() as connection:
            connection.execute(
                "INSERT INTO users(id, email, full_name, password_hash, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    user_id,
                    payload.email,
                    payload.full_name,
                    password_hash,
                    created_at.isoformat(),
                ),
            )
            token, expires_at = _issue_session(connection, user_id)
            user = UserResponse(
                id=user_id,
                email=payload.email,
                full_name=payload.full_name,
                created_at=created_at,
            )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from exc

    return AuthResponse(access_token=token, expires_at=expires_at, user=user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request) -> AuthResponse:
    _check_auth_rate_limit(request.client.host if request.client else "unknown")
    with database_connection() as connection:
        row = connection.execute(
            "SELECT id, email, full_name, password_hash, created_at "
            "FROM users WHERE email = ? COLLATE NOCASE",
            (payload.email,),
        ).fetchone()
        if row is None or not _verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")

        token, expires_at = _issue_session(connection, row["id"])
        user = _user_response(row)

    return AuthResponse(access_token=token, expires_at=expires_at, user=user)


@router.get("/me", response_model=UserResponse)
def current_user_profile(user: CurrentUser) -> UserResponse:
    return user


@router.post("/logout")
def logout(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    _user: CurrentUser,
) -> dict[str, bool]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    with database_connection() as connection:
        connection.execute(
            "DELETE FROM sessions WHERE token_hash = ?",
            (_token_digest(credentials.credentials),),
        )
    return {"success": True}

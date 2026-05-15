import os
from datetime import datetime, timedelta, timezone

import pytest

# Ensure env default before import
os.environ.setdefault("SECRET_KEY", "test-secret")

from services.auth_service import (
    ACCESS_TOKEN_EXPIRE_DAYS,
    ALGORITHM,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_hash_password_returns_str():
    hashed = hash_password("plain123")
    assert isinstance(hashed, str)
    assert hashed != "plain123"


def test_verify_password_correct():
    hashed = hash_password("plain123")
    assert verify_password("plain123", hashed) is True


def test_verify_password_wrong():
    hashed = hash_password("plain123")
    assert verify_password("wrongpassword", hashed) is False


def test_create_access_token_returns_str():
    token = create_access_token({"sub": "user1"})
    assert isinstance(token, str)
    assert len(token) > 0


def test_jwt_roundtrip():
    data = {"sub": "user1", "role": "admin"}
    token = create_access_token(data)
    decoded = decode_token(token)
    assert decoded is not None
    assert decoded["sub"] == "user1"
    assert decoded["role"] == "admin"


def test_jwt_expiry_is_set():
    token = create_access_token({"sub": "user1"})
    decoded = decode_token(token)
    assert decoded is not None
    assert "exp" in decoded


def test_jwt_custom_expiry():
    now = datetime.now(timezone.utc)
    delta = timedelta(minutes=5)
    token = create_access_token({"sub": "user1"}, expires_delta=delta)
    decoded = decode_token(token)
    assert decoded is not None
    exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
    # Should be roughly 5 minutes from now
    assert (exp - now) < timedelta(minutes=6)


def test_decode_invalid_token_returns_none():
    assert decode_token("not.a.token") is None
    assert decode_token("") is None

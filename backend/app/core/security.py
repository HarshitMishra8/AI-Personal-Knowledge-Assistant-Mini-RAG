from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.models.user import User

ALGORITHM = "HS256"
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
_google_jwks: jwt.PyJWKClient | None = None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:  # Google-only account
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:  # e.g. password longer than 72 bytes
        return False


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire}, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_google_credential(credential: str) -> dict:
    """Verify a Google Identity Services ID token and return its claims."""
    global _google_jwks
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google sign-in is not configured on the server")
    if _google_jwks is None:
        _google_jwks = jwt.PyJWKClient(GOOGLE_CERTS_URL)  # caches Google's signing keys
    try:
        signing_key = _google_jwks.get_signing_key_from_jwt(credential).key
        claims = jwt.decode(credential, signing_key, algorithms=["RS256"], audience=settings.GOOGLE_CLIENT_ID)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    if claims.get("iss") not in GOOGLE_ISSUERS or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    return claims


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user

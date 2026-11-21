from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core import security
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.db.database import get_db
from app.models.schemas import GoogleLogin, Token, UserCreate, UserOut
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(
        email=email,
        name=(payload.name or "").strip() or None,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    return Token(access_token=create_access_token(user.id))


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username.strip().lower()).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id))


@router.post("/google", response_model=Token)
def google_login(payload: GoogleLogin, db: Session = Depends(get_db)):
    claims = security.verify_google_credential(payload.credential)
    email = claims["email"].lower()

    user = db.query(User).filter(User.google_sub == claims["sub"]).first()
    if user is None:
        # Same verified email as an existing password account: link the two.
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(email=email)
            db.add(user)
        user.google_sub = claims["sub"]
    user.name = user.name or claims.get("name")
    user.avatar_url = claims.get("picture") or user.avatar_url
    db.commit()
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

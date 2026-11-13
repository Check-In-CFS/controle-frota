import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

JWT_ALGORITHM = "HS256"
JWT_EXPIRA_HORAS = 12


SEGREDO_MINIMO = 32


def segredo_fraco(segredo: str) -> bool:
    """HS256 com segredo curto pode ser quebrado por força bruta offline a partir de um token."""
    return len(segredo or "") < SEGREDO_MINIMO


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(senha.encode(), senha_hash.encode())


def criar_token(usuario_id: int, usuario: str, papel: str) -> str:
    agora = datetime.now(timezone.utc)
    payload = {
        "sub": str(usuario_id),
        "usuario": usuario,
        "papel": papel,
        "iat": agora,
        "exp": agora + timedelta(hours=JWT_EXPIRA_HORAS),
    }
    secret = os.environ["JWT_SECRET"]
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decodificar_token(token: str) -> dict:
    secret = os.environ["JWT_SECRET"]
    return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])

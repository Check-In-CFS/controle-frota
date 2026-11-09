"""
Fotos de notas fiscais: validação/normalização da imagem e guarda no Supabase Storage.

O bucket é PRIVADO. Cada foto fica em `<id do usuário que enviou>/<uuid>.jpg`; esse
prefixo é o que define quem pode vê-la depois (admin e quem enviou). Ninguém abre a
foto direto: o backend confere a permissão e devolve um link temporário assinado.
"""

import io
import uuid

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.auth_deps import UsuarioLogado

BUCKET = "notas-fiscais"
TAMANHO_MAXIMO_UPLOAD = 12 * 1024 * 1024  # foto de celular costuma ter 3-8 MB
LADO_MAXIMO = 2000                          # px -- suficiente para ler uma nota, bem mais leve
VALIDADE_LINK_SEGUNDOS = 120

Image.MAX_IMAGE_PIXELS = 60_000_000  # barra "bombas de descompressão"

_bucket_garantido = False


def normalizar_imagem(conteudo: bytes) -> bytes:
    """
    Abre a imagem de verdade (recusa qualquer outra coisa disfarçada), corrige a rotação,
    reduz e regrava como JPEG. De quebra remove metadados (EXIF/GPS) da foto.
    """
    try:
        with Image.open(io.BytesIO(conteudo)) as img:
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
            img.thumbnail((LADO_MAXIMO, LADO_MAXIMO))
            saida = io.BytesIO()
            img.save(saida, format="JPEG", quality=85, optimize=True)
            return saida.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(status_code=422, detail="O arquivo enviado não é uma foto válida (use JPG, PNG ou WebP).")


def garantir_bucket(sb) -> None:
    global _bucket_garantido
    if _bucket_garantido:
        return
    try:
        sb.storage.get_bucket(BUCKET)
    except Exception:
        sb.storage.create_bucket(
            BUCKET,
            options={"public": False, "file_size_limit": 5 * 1024 * 1024, "allowed_mime_types": ["image/jpeg"]},
        )
    _bucket_garantido = True


def guardar_foto(sb, usuario: UsuarioLogado, jpeg: bytes) -> str:
    caminho = f"{usuario.id}/{uuid.uuid4().hex}.jpg"
    try:
        garantir_bucket(sb)
        sb.storage.from_(BUCKET).upload(caminho, jpeg, {"content-type": "image/jpeg"})
    except Exception as exc:
        print(f"[fotos_notas] falha ao guardar foto: {exc}")
        raise HTTPException(status_code=502, detail="Não foi possível guardar a foto agora. Tente novamente.")
    return caminho


def usuario_pode_ver(usuario: UsuarioLogado, caminho: str) -> bool:
    """Admin vê todas; mecânico só as que ele mesmo enviou."""
    return usuario.papel == "admin" or caminho.startswith(f"{usuario.id}/")


def link_temporario(sb, caminho: str) -> str:
    try:
        resp = sb.storage.from_(BUCKET).create_signed_url(caminho, VALIDADE_LINK_SEGUNDOS)
        return resp["signedURL"]
    except Exception as exc:
        print(f"[fotos_notas] falha ao gerar link: {exc}")
        raise HTTPException(status_code=404, detail="A foto não foi encontrada.")

"""
Fotos de notas fiscais: validação/normalização da imagem e guarda no Supabase Storage.

O bucket é PRIVADO. Cada foto fica em `<id do usuário que enviou>/<uuid>.jpg`; esse
prefixo é o que define quem pode vê-la depois (admin e quem enviou). Ninguém abre a
foto direto: o backend confere a permissão e devolve um link temporário assinado.
"""

import io
import re
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


def _ja_existe(exc: Exception) -> bool:
    texto = str(exc).lower()
    return "already exists" in texto or "bucketalreadyexists" in texto or "duplicate" in texto


def garantir_bucket(sb) -> None:
    """
    Garante o bucket privado. Usa list_buckets: o get_bucket da biblioteca (storage3 0.8) quebra com
    TypeError quando o Supabase devolve campos novos (ex: versioning_status), o que fazia o envio
    achar que o bucket não existia, tentar criar de novo e falhar com "BucketAlreadyExists".
    """
    global _bucket_garantido
    if _bucket_garantido:
        return
    existe = False
    try:
        existe = any(getattr(b, "name", None) == BUCKET or getattr(b, "id", None) == BUCKET for b in sb.storage.list_buckets())
    except Exception as exc:
        print(f"[fotos_notas] não consegui listar os buckets ({exc}); vou tentar criar")
    if not existe:
        try:
            sb.storage.create_bucket(
                BUCKET,
                options={"public": False, "file_size_limit": 5 * 1024 * 1024, "allowed_mime_types": ["image/jpeg"]},
            )
        except Exception as exc:
            if not _ja_existe(exc):  # criado por outra requisição ao mesmo tempo: tudo certo
                raise
    _bucket_garantido = True


def guardar_foto(sb, usuario: UsuarioLogado, jpeg: bytes) -> str:
    caminho = f"{usuario.id}/{uuid.uuid4().hex}.jpg"
    ultimo_erro = None
    for _tentativa in range(2):  # a 2ª cobre conexão reaproveitada que o servidor já encerrou
        try:
            garantir_bucket(sb)
            sb.storage.from_(BUCKET).upload(caminho, jpeg, {"content-type": "image/jpeg"})
            return caminho
        except Exception as exc:
            ultimo_erro = exc
    print(f"[fotos_notas] falha ao guardar foto: {type(ultimo_erro).__name__}: {ultimo_erro}")
    raise HTTPException(status_code=502, detail="Não foi possível guardar a foto agora. Tente novamente.")


_FORMATO_CAMINHO = re.compile(r"(\d+)/[0-9a-f]{32}\.jpg")


def caminho_do_usuario(usuario: UsuarioLogado, caminho: str) -> bool:
    """O caminho é exatamente `<id do usuário>/<32 hex>.jpg`: bloqueia '..', subpastas e prefixos parecidos."""
    m = _FORMATO_CAMINHO.fullmatch(caminho or "")
    return bool(m) and m.group(1) == str(usuario.id)


def usuario_pode_ver(usuario: UsuarioLogado, caminho: str) -> bool:
    """Admin vê todas; mecânico só as que ele mesmo enviou (no formato exato)."""
    return usuario.papel == "admin" or caminho_do_usuario(usuario, caminho)


def link_temporario(sb, caminho: str) -> str:
    try:
        resp = sb.storage.from_(BUCKET).create_signed_url(caminho, VALIDADE_LINK_SEGUNDOS)
        return resp["signedURL"]
    except Exception as exc:
        print(f"[fotos_notas] falha ao gerar link: {exc}")
        raise HTTPException(status_code=404, detail="A foto não foi encontrada.")

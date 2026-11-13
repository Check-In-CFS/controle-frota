from typing import Optional

import time

import jwt
from fastapi import Depends, HTTPException, Header

from app.auth_utils import decodificar_token
from app.database import get_supabase

CACHE_USUARIO_SEGUNDOS = 30
_cache_usuarios: dict[int, tuple[float, dict | None]] = {}


def consultar_usuario(usuario_id: int):
    """
    Situação ATUAL do usuário no banco (ativo? qual papel?), com cache de 30 s para não consultar
    a cada requisição. Sem isso, o JWT (12 h) continuaria valendo para um usuário desativado,
    excluído ou rebaixado. Devolve None se o usuário não existe mais.
    """
    agora = time.monotonic()
    guardado = _cache_usuarios.get(usuario_id)
    if guardado and guardado[0] > agora:
        return guardado[1]
    resp = get_supabase().table("usuarios").select("ativo, papel").eq("id", usuario_id).execute()
    dados = resp.data[0] if resp.data else None
    _cache_usuarios[usuario_id] = (agora + CACHE_USUARIO_SEGUNDOS, dados)
    return dados


class UsuarioLogado:
    def __init__(self, id: int, usuario: str, papel: str):
        self.id = id
        self.usuario = usuario
        self.papel = papel


def obter_usuario_atual(authorization: Optional[str] = Header(None)) -> UsuarioLogado:
    """
    Lê o header `Authorization: Bearer <token>`, valida o JWT e retorna o usuário logado.
    Usado como dependency em rotas que exigem estar autenticado.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Não autenticado")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decodificar_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada, faça login novamente")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

    usuario_id = int(payload["sub"])
    atual = consultar_usuario(usuario_id)
    if not atual or not atual.get("ativo"):
        raise HTTPException(status_code=401, detail="Sessão inválida, faça login novamente")

    # o papel vale o do BANCO: se o admin rebaixou o usuário, o token antigo não mantém o poder
    return UsuarioLogado(id=usuario_id, usuario=payload["usuario"], papel=atual.get("papel") or payload["papel"])


def exigir_admin(usuario: UsuarioLogado = Depends(obter_usuario_atual)) -> UsuarioLogado:
    """Dependency para rotas que só o papel 'admin' pode executar (ex: exclusões, gestão de usuários)."""
    if usuario.papel != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem realizar esta ação")
    return usuario


def exigir_operacional(usuario: UsuarioLogado = Depends(obter_usuario_atual)) -> UsuarioLogado:
    """
    Dependency para rotas de lançamento operacional (manutenção, abastecimento,
    nota fiscal, checklist, fornecedor). O papel 'diretor' é somente leitura
    -- não pode criar nem editar nada no sistema.
    """
    if usuario.papel == "diretor":
        raise HTTPException(status_code=403, detail="Diretores têm acesso somente para visualização")
    return usuario


def exigir_admin_ou_diretor(usuario: UsuarioLogado = Depends(obter_usuario_atual)) -> UsuarioLogado:
    """Dependency para módulos de gestão (Financeiro) -- admin e diretor têm acesso, mecânico não."""
    if usuario.papel not in ("admin", "diretor"):
        raise HTTPException(status_code=403, detail="Apenas administradores e diretores podem acessar este módulo")
    return usuario

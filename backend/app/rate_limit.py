"""
Limite de tentativas por IP (em memória) para a rota de login.

O bloqueio por usuário (auth.py) protege uma conta contra adivinhação de senha,
mas sozinho permite que alguém trave a conta de outra pessoa de propósito. Este
limite por IP freia quem tenta muitas vezes de um mesmo lugar, sem depender do usuário.

Em memória: vale por processo e zera ao reiniciar -- suficiente para uma instância única.
"""

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

JANELA_SEGUNDOS = 60
MAX_TENTATIVAS_POR_JANELA = 10

_tentativas: dict[str, deque] = defaultdict(deque)


def _atras_de_proxy_confiavel() -> bool:
    """X-Forwarded-For só é confiável quando há um proxy nosso na frente (Railway) ou CONFIAR_PROXY=1."""
    return bool(os.environ.get("RAILWAY_ENVIRONMENT_NAME") or os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("CONFIAR_PROXY") == "1")


def ip_do_cliente(request: Request) -> str:
    """
    Atrás de proxy (Railway) o IP real vem em X-Forwarded-For. Usa a ÚLTIMA entrada,
    a que o proxy confiável acrescentou -- a primeira pode ser forjada pelo cliente.
    Sem proxy, o cabeçalho é ignorado (qualquer um poderia mandar um IP diferente a cada tentativa
    e burlar o limite): vale o IP da conexão.
    """
    encaminhado = request.headers.get("x-forwarded-for")
    if encaminhado and _atras_de_proxy_confiavel():
        return encaminhado.split(",")[-1].strip()
    return request.client.host if request.client else "desconhecido"


def limitar_login(request: Request) -> None:
    agora = time.monotonic()
    fila = _tentativas[ip_do_cliente(request)]
    while fila and agora - fila[0] > JANELA_SEGUNDOS:
        fila.popleft()
    if len(fila) >= MAX_TENTATIVAS_POR_JANELA:
        raise HTTPException(status_code=429, detail="Muitas tentativas de login. Aguarde um minuto e tente novamente.")
    fila.append(agora)


_por_chave: dict[str, deque] = defaultdict(deque)


def limitar_por_chave(chave: str, maximo: int, janela_segundos: int, mensagem: str) -> None:
    """Limite genérico (ex: leituras de foto por usuário/hora, que custam dinheiro)."""
    agora = time.monotonic()
    fila = _por_chave[chave]
    while fila and agora - fila[0] > janela_segundos:
        fila.popleft()
    if len(fila) >= maximo:
        raise HTTPException(status_code=429, detail=mensagem)
    fila.append(agora)


def zerar() -> None:
    """Usado nos testes."""
    _tentativas.clear()
    _por_chave.clear()

"""
Limite de tentativas por IP (em memória) para a rota de login.

O bloqueio por usuário (auth.py) protege uma conta contra adivinhação de senha,
mas sozinho permite que alguém trave a conta de outra pessoa de propósito. Este
limite por IP freia quem tenta muitas vezes de um mesmo lugar, sem depender do usuário.

Em memória: vale por processo e zera ao reiniciar -- suficiente para uma instância única.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

JANELA_SEGUNDOS = 60
MAX_TENTATIVAS_POR_JANELA = 10

_tentativas: dict[str, deque] = defaultdict(deque)


def ip_do_cliente(request: Request) -> str:
    """
    Atrás de proxy (Railway) o IP real vem em X-Forwarded-For. Usa a ÚLTIMA entrada,
    a que o proxy confiável acrescentou -- a primeira pode ser forjada pelo cliente.
    """
    encaminhado = request.headers.get("x-forwarded-for")
    if encaminhado:
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


def zerar() -> None:
    """Usado nos testes."""
    _tentativas.clear()

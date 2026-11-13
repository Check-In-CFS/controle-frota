"""
Consulta de dados públicos de uma empresa pelo CNPJ (BrasilAPI, gratuita, base da Receita Federal).

Só o CNPJ do fornecedor sai do servidor (dado público de empresa; nada da nota nem da foto).
Serve para cadastrar automaticamente, com o nome certo, o fornecedor lido da foto de uma nota.
Falhou ou desligou? Devolve None e quem chamou segue sem esses dados.
"""

import json
import os
import re
import urllib.error
import urllib.request

URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
TIMEOUT_SEGUNDOS = 6


def ativa() -> bool:
    return os.environ.get("CONSULTA_CNPJ", "ligada").strip().lower() not in ("desligada", "nao", "não", "0", "false")


def buscar_empresa(cnpj: str):
    """Devolve {"nome", "telefone", "email"} (campos já no tamanho que o cadastro aceita) ou None."""
    if not ativa() or not re.fullmatch(r"\d{14}", cnpj):
        return None
    try:
        pedido = urllib.request.Request(URL.format(cnpj=cnpj), headers={"User-Agent": "controle-frota/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(pedido, timeout=TIMEOUT_SEGUNDOS) as resp:  # noqa: S310 (URL fixa, https)
            dados = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        print(f"[consulta_cnpj] sem resposta para {cnpj}: {exc}")
        return None

    nome = (dados.get("razao_social") or dados.get("nome_fantasia") or "").strip()[:200]
    if not nome:
        return None
    telefone = re.sub(r"\D", "", str(dados.get("ddd_telefone_1") or ""))
    email = (dados.get("email") or "").strip()
    return {
        "nome": nome,
        "telefone": telefone if 0 < len(telefone) <= 13 else None,
        "email": email if 0 < len(email) <= 50 else None,
    }

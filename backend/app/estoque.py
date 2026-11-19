"""Regras do estoque: mexer no saldo de forma atômica e registrar o histórico."""

from fastapi import HTTPException

from app.auth_deps import UsuarioLogado


def produto_por_nome(sb, nome: str):
    """Produto com exatamente esse nome (sem diferenciar maiúsculas). % e _ não viram curinga."""
    literal = nome.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    resp = sb.table("produtos").select("*").ilike("nome", literal).execute()
    return resp.data[0] if resp.data else None


def mover_saldo(sb, produto_id: int, delta: float) -> float:
    """
    Soma `delta` ao saldo do produto direto no banco (uma operação só, sem ler-e-gravar),
    então duas pessoas retirando ao mesmo tempo não se atropelam. O banco recusa saldo negativo.
    """
    try:
        resp = sb.rpc("ajustar_estoque", {"p_produto_id": produto_id, "p_delta": delta}).execute()
    except Exception as erro:  # noqa: BLE001 - a biblioteca levanta tipos variados
        texto = str(erro)
        if "23514" in texto or "check constraint" in texto:
            raise HTTPException(status_code=409, detail="Estoque insuficiente para essa retirada.")
        if "produto_nao_encontrado" in texto:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        raise
    return float(resp.data)


def registrar_movimento(sb, usuario: UsuarioLogado, produto_id: int, tipo: str, quantidade: float, **ligacoes) -> dict:
    """`quantidade` é sempre positiva para entrada/retirada; no ajuste leva o sinal."""
    linha = {
        "produto_id": produto_id,
        "tipo": tipo,
        "quantidade": quantidade,
        "usuario_id": usuario.id,
        "usuario_nome": usuario.usuario,
        **{k: v for k, v in ligacoes.items() if v is not None},
    }
    return sb.table("estoque_movimentos").insert(linha).execute().data[0]

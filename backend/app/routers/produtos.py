from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auditoria import registrar_log
from app.auth_deps import UsuarioLogado, exigir_admin, exigir_operacional
from app.database import get_supabase
from app.estoque import mover_saldo, produto_por_nome, registrar_movimento
from app.maquina_guard import validar_maquina_permite_lancamento
from app.schemas.produtos import Ajuste, Movimento, Produto, ProdutoCreate, ProdutoUpdate, Retirada

router = APIRouter(prefix="/produtos", tags=["Estoque"])


def _com_alerta(p: dict) -> dict:
    minimo = p.get("estoque_minimo")
    p["abaixo_minimo"] = minimo is not None and float(p["estoque_atual"]) <= float(minimo)
    return p


def _buscar(sb, produto_id: int) -> dict:
    resp = sb.table("produtos").select("*").eq("id", produto_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return resp.data[0]


@router.get("", response_model=list[Produto])
def listar_produtos(busca: Optional[str] = None, incluir_inativos: bool = False, abaixo_minimo: bool = False):
    sb = get_supabase()
    consulta = sb.table("produtos").select("*")
    if not incluir_inativos:
        consulta = consulta.eq("ativo", True)
    if busca:
        # só letras/números/espaço: evita injetar sintaxe do filtro do PostgREST
        limpo = "".join(c for c in busca if c.isalnum() or c == " ").strip()
        if limpo:
            consulta = consulta.ilike("nome", f"%{limpo}%")
    produtos = [_com_alerta(p) for p in consulta.order("nome").execute().data]
    return [p for p in produtos if p["abaixo_minimo"]] if abaixo_minimo else produtos


@router.post("", response_model=Produto, status_code=201)
def criar_produto(dados: ProdutoCreate, usuario: UsuarioLogado = Depends(exigir_admin)):
    sb = get_supabase()
    if produto_por_nome(sb, dados.nome):
        raise HTTPException(status_code=409, detail="Já existe um produto com esse nome.")
    criado = sb.table("produtos").insert(dados.model_dump()).execute().data[0]
    registrar_log(usuario, "criar", "produto", criado["id"], f"Produto {criado['nome']} cadastrado", dados_depois=criado)
    return _com_alerta(criado)


@router.patch("/{produto_id}", response_model=Produto)
def atualizar_produto(produto_id: int, dados: ProdutoUpdate, usuario: UsuarioLogado = Depends(exigir_admin)):
    sb = get_supabase()
    campos = dados.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo enviado para atualização")
    antes = _buscar(sb, produto_id)
    if "nome" in campos:
        outro = produto_por_nome(sb, campos["nome"])
        if outro and outro["id"] != produto_id:
            raise HTTPException(status_code=409, detail="Já existe um produto com esse nome.")
    depois = sb.table("produtos").update(campos).eq("id", produto_id).execute().data[0]
    registrar_log(usuario, "atualizar", "produto", produto_id, f"Produto {antes['nome']} atualizado", dados_antes=antes, dados_depois=depois)
    return _com_alerta(depois)


@router.get("/{produto_id}/movimentos", response_model=list[Movimento])
def listar_movimentos(produto_id: int):
    sb = get_supabase()
    _buscar(sb, produto_id)
    resp = (
        sb.table("estoque_movimentos")
        .select("*, notas_fiscais(numero), maquinas(codigo)")
        .eq("produto_id", produto_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    saida = []
    for m in resp.data:
        nota = m.pop("notas_fiscais", None) or {}
        maquina = m.pop("maquinas", None) or {}
        m["nota_numero"] = nota.get("numero")
        m["maquina_codigo"] = maquina.get("codigo")
        saida.append(m)
    return saida


@router.post("/{produto_id}/retirada", response_model=Produto)
def retirar_do_estoque(produto_id: int, dados: Retirada, usuario: UsuarioLogado = Depends(exigir_operacional)):
    sb = get_supabase()
    produto = _buscar(sb, produto_id)
    if not produto["ativo"]:
        raise HTTPException(status_code=409, detail="Produto inativo.")
    if dados.maquina_id is not None:
        validar_maquina_permite_lancamento(dados.maquina_id)  # mesma regra dos outros lançamentos
    if dados.manutencao_id is not None and not sb.table("manutencoes").select("id").eq("id", dados.manutencao_id).execute().data:
        raise HTTPException(status_code=422, detail="Manutenção não encontrada.")

    mover_saldo(sb, produto_id, -dados.quantidade)  # falha com 409 se não houver saldo
    registrar_movimento(
        sb, usuario, produto_id, "retirada", dados.quantidade,
        maquina_id=dados.maquina_id, manutencao_id=dados.manutencao_id, observacao=dados.observacao,
    )
    atual = _buscar(sb, produto_id)
    registrar_log(usuario, "retirada", "produto", produto_id, f"Retirada de {dados.quantidade:g} {produto['unidade_medida']} de {produto['nome']}")
    return _com_alerta(atual)


@router.post("/{produto_id}/ajuste", response_model=Produto)
def ajustar_saldo(produto_id: int, dados: Ajuste, usuario: UsuarioLogado = Depends(exigir_admin)):
    sb = get_supabase()
    produto = _buscar(sb, produto_id)
    mover_saldo(sb, produto_id, dados.quantidade)
    registrar_movimento(sb, usuario, produto_id, "ajuste", dados.quantidade, observacao=dados.motivo)
    atual = _buscar(sb, produto_id)
    registrar_log(usuario, "ajuste", "produto", produto_id, f"Ajuste de saldo de {produto['nome']}: {dados.quantidade:+g} ({dados.motivo})", dados_antes=produto, dados_depois=atual)
    return _com_alerta(atual)

import pytest

from tests.conftest import cabecalho


def produto(id=1, estoque=5.0, nome="Farol Bobcat S650", minimo=None, ativo=True):
    return {"id": id, "nome": nome, "unidade_medida": "un", "estoque_atual": estoque,
            "estoque_minimo": minimo, "ativo": ativo, "created_at": "2026-11-19T10:00:00Z"}


# ---------- retirada ----------

def test_mecanico_retira_e_o_saldo_baixa(client, banco):
    banco.tabelas["produtos"] = [produto(estoque=5)]
    r = client.post("/produtos/1/retirada", json={"quantidade": 2}, headers=cabecalho("mecanico"))
    assert r.status_code == 200
    assert r.json()["estoque_atual"] == 3
    assert ("ajustar_estoque", {"p_produto_id": 1, "p_delta": -2.0}) in banco.chamadas_rpc
    mov = [l for t, l in banco.inseridos if t == "estoque_movimentos"][0]
    assert (mov["tipo"], mov["quantidade"], mov["usuario_nome"]) == ("retirada", 2, "mecanico1")


def test_retirada_maior_que_o_saldo_e_recusada(client, banco):
    banco.tabelas["produtos"] = [produto(estoque=1)]
    r = client.post("/produtos/1/retirada", json={"quantidade": 3}, headers=cabecalho("mecanico"))
    assert r.status_code == 409
    assert "insuficiente" in r.json()["detail"].lower()
    assert not [1 for t, _ in banco.inseridos if t == "estoque_movimentos"]  # nada registrado


def test_retirada_exige_quantidade_positiva(client, banco):
    banco.tabelas["produtos"] = [produto()]
    assert client.post("/produtos/1/retirada", json={"quantidade": 0}, headers=cabecalho("mecanico")).status_code == 422
    assert client.post("/produtos/1/retirada", json={"quantidade": -1}, headers=cabecalho("mecanico")).status_code == 422


def test_diretor_nao_retira_mas_consulta(client, banco):
    banco.tabelas["produtos"] = [produto()]
    assert client.post("/produtos/1/retirada", json={"quantidade": 1}, headers=cabecalho("diretor")).status_code == 403
    assert client.get("/produtos", headers=cabecalho("diretor")).status_code == 200


# ---------- catálogo ----------

def test_mecanico_nao_cadastra_nem_ajusta_produto(client, banco):
    banco.tabelas["produtos"] = [produto()]
    assert client.post("/produtos", json={"nome": "Filtro de óleo"}, headers=cabecalho("mecanico")).status_code == 403
    assert client.post("/produtos/1/ajuste", json={"quantidade": 1, "motivo": "contagem"}, headers=cabecalho("mecanico")).status_code == 403
    assert client.patch("/produtos/1", json={"ativo": False}, headers=cabecalho("mecanico")).status_code == 403


def test_admin_cadastra_produto_e_recusa_nome_repetido(client, banco):
    ok = client.post("/produtos", json={"nome": "  Filtro   de óleo "}, headers=cabecalho("admin"))
    assert ok.status_code == 201
    assert ok.json()["nome"] == "Filtro de óleo"
    repetido = client.post("/produtos", json={"nome": "Filtro de óleo"}, headers=cabecalho("admin"))
    assert repetido.status_code == 409


def test_alerta_de_estoque_minimo(client, banco):
    banco.tabelas["produtos"] = [produto(1, estoque=2, minimo=2), produto(2, estoque=9, minimo=2, nome="Correia")]
    lista = client.get("/produtos", headers=cabecalho("mecanico")).json()
    assert {p["nome"]: p["abaixo_minimo"] for p in lista} == {"Farol Bobcat S650": True, "Correia": False}
    so_baixos = client.get("/produtos?abaixo_minimo=true", headers=cabecalho("mecanico")).json()
    assert [p["id"] for p in so_baixos] == [1]


def test_ajuste_de_saldo_admin_com_motivo(client, banco):
    banco.tabelas["produtos"] = [produto(estoque=4)]
    assert client.post("/produtos/1/ajuste", json={"quantidade": -1, "motivo": "x"}, headers=cabecalho("admin")).status_code == 422  # motivo curto
    r = client.post("/produtos/1/ajuste", json={"quantidade": -1, "motivo": "contagem física"}, headers=cabecalho("admin"))
    assert r.status_code == 200 and r.json()["estoque_atual"] == 3
    mov = [l for t, l in banco.inseridos if t == "estoque_movimentos"][0]
    assert (mov["tipo"], mov["quantidade"]) == ("ajuste", -1)


# ---------- entrada de mercadoria ----------

def nota_com_itens(banco, recebida=0.0):
    banco.tabelas["notas_fiscais"] = [{"id": 1, "numero": "123", "serie": "1", "fornecedor_id": 1, "data_emissao": "2026-11-10",
                                       "tipo": "peca", "valor_total": 600, "created_at": "2026-11-10T10:00:00Z"}]
    banco.tabelas["notas_fiscais_itens"] = [
        {"id": 10, "nota_fiscal_id": 1, "nome": "Farol Bobcat S650", "quantidade": 2, "valor_unitario": 300,
         "quantidade_recebida": recebida, "produto_id": None},
    ]


def test_entrada_com_produto_novo_cria_e_soma_no_estoque(client, banco):
    nota_com_itens(banco)
    r = client.post("/notas-fiscais/1/entrada-mercadoria",
                    json={"itens": [{"item_id": 10, "quantidade": 2, "novo_produto": True}]}, headers=cabecalho("mecanico"))
    assert r.status_code == 200, r.text
    criado = [l for t, l in banco.inseridos if t == "produtos"][0]
    assert criado["nome"] == "Farol Bobcat S650"
    assert banco.tabelas["produtos"][0]["estoque_atual"] == 2
    mov = [l for t, l in banco.inseridos if t == "estoque_movimentos"][0]
    assert (mov["tipo"], mov["quantidade"], mov["nota_fiscal_id"], mov["nota_item_id"]) == ("entrada", 2, 1, 10)
    assert any(t == "notas_fiscais_itens" and d.get("quantidade_recebida") == 2 for t, d in banco.atualizacoes)


def test_entrada_em_produto_existente(client, banco):
    nota_com_itens(banco)
    banco.tabelas["produtos"] = [produto(estoque=1)]
    r = client.post("/notas-fiscais/1/entrada-mercadoria",
                    json={"itens": [{"item_id": 10, "quantidade": 1, "produto_id": 1}]}, headers=cabecalho("admin"))
    assert r.status_code == 200
    assert banco.tabelas["produtos"][0]["estoque_atual"] == 2


def test_entrada_nao_passa_do_que_falta_receber(client, banco):
    nota_com_itens(banco, recebida=1)
    r = client.post("/notas-fiscais/1/entrada-mercadoria",
                    json={"itens": [{"item_id": 10, "quantidade": 2, "novo_produto": True}]}, headers=cabecalho("mecanico"))
    assert r.status_code == 422 and "falta" in r.json()["detail"]
    assert not banco.chamadas_rpc


def test_entrada_exige_produto_e_item_da_nota(client, banco):
    nota_com_itens(banco)
    sem_produto = client.post("/notas-fiscais/1/entrada-mercadoria", json={"itens": [{"item_id": 10, "quantidade": 1}]}, headers=cabecalho("mecanico"))
    assert sem_produto.status_code == 422
    item_alheio = client.post("/notas-fiscais/1/entrada-mercadoria", json={"itens": [{"item_id": 99, "quantidade": 1, "novo_produto": True}]}, headers=cabecalho("mecanico"))
    assert item_alheio.status_code == 422
    assert not banco.chamadas_rpc


def test_diretor_nao_da_entrada(client, banco):
    nota_com_itens(banco)
    r = client.post("/notas-fiscais/1/entrada-mercadoria", json={"itens": [{"item_id": 10, "quantidade": 1, "novo_produto": True}]}, headers=cabecalho("diretor"))
    assert r.status_code == 403


def test_nota_com_entrada_nao_pode_ser_excluida_nem_ter_itens_trocados(client, banco):
    nota_com_itens(banco, recebida=1)
    assert client.delete("/notas-fiscais/1", headers=cabecalho("admin")).status_code == 409
    troca = client.patch("/notas-fiscais/1", json={"itens": []}, headers=cabecalho("admin"))
    assert troca.status_code == 409


def test_nota_com_entrada_aceita_edicao_que_reenvia_os_mesmos_itens(client, banco):
    # o formulário de edição sempre reenvia a lista inteira; se ela não mudou, editar outro campo deve funcionar
    nota_com_itens(banco, recebida=2)
    mesmos = [{"nome": "Farol Bobcat S650", "quantidade": 2, "valor_unitario": 300}]
    r = client.patch("/notas-fiscais/1", json={"observacoes": "conferida", "itens": mesmos}, headers=cabecalho("admin"))
    assert r.status_code == 200, r.text
    assert not [c for c in banco.consultas if c.nome == "notas_fiscais_itens" and c._op == "delete"]


def test_retirada_para_maquina_baixada_e_recusada(client, banco):
    banco.tabelas["produtos"] = [produto()]
    banco.tabelas["maquinas"] = [{"id": 3, "codigo": "TR-01", "situacao": "baixada"}]
    r = client.post("/produtos/1/retirada", json={"quantidade": 1, "maquina_id": 3}, headers=cabecalho("mecanico"))
    assert r.status_code == 422 and "baixada" in r.json()["detail"]
    assert not banco.chamadas_rpc


def test_nome_com_curinga_nao_casa_com_outro_produto():
    from app.estoque import produto_por_nome

    class Sb:
        def table(self, _):
            return self
        def select(self, _):
            return self
        def ilike(self, coluna, valor):
            self.valor = valor
            return self
        def execute(self):
            return type("R", (), {"data": []})()

    sb = Sb()
    produto_por_nome(sb, "Filtro_100%")
    assert sb.valor == "Filtro\\_100\\%"


def test_nota_sem_entrada_continua_podendo_ser_excluida(client, banco):
    nota_com_itens(banco, recebida=0)
    assert client.delete("/notas-fiscais/1", headers=cabecalho("admin")).status_code != 409

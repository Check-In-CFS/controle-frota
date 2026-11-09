import pytest

from tests.conftest import cabecalho

# Corpo vazio: quem tem permissão chega até a validação (422); quem não tem é barrado antes (403).


@pytest.mark.parametrize("papel,esperado", [("admin", 422), ("mecanico", 422), ("diretor", 403)])
def test_criar_maquina_diretor_e_somente_leitura(client, papel, esperado):
    assert client.post("/maquinas", json={}, headers=cabecalho(papel)).status_code == esperado


@pytest.mark.parametrize("papel", ["mecanico", "diretor"])
def test_excluir_maquina_so_admin(client, papel):
    assert client.delete("/maquinas/1", headers=cabecalho(papel)).status_code == 403


def test_admin_passa_na_exclusao_de_maquina(client):
    # sem a máquina no banco falso, o admin chega ao 404 -- ou seja, passou pela permissão
    assert client.delete("/maquinas/1", headers=cabecalho("admin")).status_code == 404


@pytest.mark.parametrize("rota", ["/usuarios", "/logs"])
@pytest.mark.parametrize("papel", ["mecanico", "diretor"])
def test_usuarios_e_logs_so_admin(client, rota, papel):
    assert client.get(rota, headers=cabecalho(papel)).status_code == 403


@pytest.mark.parametrize("rota", ["/usuarios", "/logs"])
def test_admin_acessa_usuarios_e_logs(client, rota):
    assert client.get(rota, headers=cabecalho("admin")).status_code == 200


def test_mecanico_nao_acessa_financeiro(client):
    assert client.get("/financeiro/visao-geral", headers=cabecalho("mecanico")).status_code == 403


@pytest.mark.parametrize("papel", ["admin", "diretor"])
def test_admin_e_diretor_passam_no_financeiro(client, papel):
    assert client.get("/financeiro/visao-geral", headers=cabecalho(papel)).status_code != 403


@pytest.mark.parametrize("rota", ["/abastecimentos", "/manutencoes", "/notas-fiscais"])
def test_diretor_nao_lanca_registros_operacionais(client, rota):
    assert client.post(rota, json={}, headers=cabecalho("diretor")).status_code == 403


def test_mecanico_nao_promove_a_si_mesmo(client):
    r = client.patch("/usuarios/1", json={"papel": "admin"}, headers=cabecalho("mecanico"))
    assert r.status_code == 403


def test_documentacao_da_api_ligada_so_fora_de_producao(client):
    assert client.get("/docs").status_code == 200

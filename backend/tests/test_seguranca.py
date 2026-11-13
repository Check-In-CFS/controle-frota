"""
Testes de segurança: cada um descreve um ataque ou falha possível e exige que ele NÃO funcione.
"""
import time

import pytest

from app import auth_deps, rate_limit
from app.auth_deps import consultar_usuario as consultar_usuario_real  # a de verdade (os testes trocam a do módulo)
from app.auth_utils import criar_token, hash_senha
from tests.conftest import cabecalho


# ---------- sessão: usuário desativado ou rebaixado perde o acesso na hora (não em 12 h) ----------

def test_usuario_desativado_perde_o_acesso_mesmo_com_token_valido(client, monkeypatch):
    monkeypatch.setattr(auth_deps, "consultar_usuario", lambda uid: {"ativo": False, "papel": "mecanico"})
    r = client.get("/maquinas", headers=cabecalho("mecanico", 5))
    assert r.status_code == 401


def test_usuario_excluido_perde_o_acesso(client, monkeypatch):
    monkeypatch.setattr(auth_deps, "consultar_usuario", lambda uid: None)
    assert client.get("/maquinas", headers=cabecalho("admin", 5)).status_code == 401


def test_papel_vale_o_do_banco_e_nao_o_que_esta_no_token(client, monkeypatch):
    # token diz "admin", mas o banco já rebaixou para mecânico
    monkeypatch.setattr(auth_deps, "consultar_usuario", lambda uid: {"ativo": True, "papel": "mecanico"})
    assert client.get("/usuarios", headers=cabecalho("admin", 5)).status_code == 403


def test_consulta_do_usuario_usa_cache_curto(banco):
    banco.tabelas["usuarios"] = [{"id": 7, "ativo": True, "papel": "mecanico"}]
    auth_deps._cache_usuarios.clear()
    assert consultar_usuario_real(7)["papel"] == "mecanico"
    n = len(banco.consultas)
    consultar_usuario_real(7)
    assert len(banco.consultas) == n   # 2ª chamada veio do cache


# ---------- força bruta / enumeração ----------

def test_login_de_usuario_inexistente_gasta_o_mesmo_tempo_de_senha_errada(client, banco, usuario_db):
    """Sem isso, o tempo de resposta revela quais usuários existem (bcrypt só roda se o usuário existe)."""
    banco.tabelas["usuarios"] = [usuario_db]

    def medir(usuario):
        rate_limit.zerar()
        t = time.perf_counter()
        client.post("/auth/login", json={"usuario": usuario, "senha": "errada"})
        return time.perf_counter() - t

    existente = min(medir("fulano") for _ in range(3))
    banco.tabelas["usuarios"] = []
    inexistente = min(medir("ninguem") for _ in range(3))
    assert inexistente > existente * 0.5   # ambos pagam o custo do bcrypt (ms, não microssegundos)


def test_ip_forjado_no_cabecalho_nao_burla_o_limite_sem_proxy(client, monkeypatch):
    monkeypatch.delenv("CONFIAR_PROXY", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT_NAME", raising=False)
    for i in range(rate_limit.MAX_TENTATIVAS_POR_JANELA):
        client.post("/auth/login", json={"usuario": "a", "senha": "b"}, headers={"x-forwarded-for": f"7.7.7.{i}"})
    r = client.post("/auth/login", json={"usuario": "a", "senha": "b"}, headers={"x-forwarded-for": "7.7.7.200"})
    assert r.status_code == 429   # sem proxy confiável, o cabeçalho é ignorado e vale o IP da conexão


# ---------- foto: caminho do arquivo ----------

@pytest.mark.parametrize("caminho", ["5/../9/abc.jpg", "5/sub/abc.jpg", "5/abc.jpg", "5/" + "a" * 31 + ".jpg", "5/" + "g" * 32 + ".jpg", "5/" + "a" * 32 + ".jpg/../x", "5/" + "a" * 32 + ".jpg.exe", "55/" + "a" * 32 + ".jpg"])
def test_mecanico_so_anexa_caminho_no_formato_exato_das_proprias_fotos(client, banco, caminho):
    corpo = {"numero": "1", "fornecedor_id": 1, "data_emissao": "2026-10-01", "tipo": "peca", "valor_total": 10, "arquivo_url": caminho}
    assert client.post("/notas-fiscais", json=corpo, headers=cabecalho("mecanico", 5)).status_code == 403


def test_caminho_no_formato_exato_da_propria_foto_passa_na_checagem(client, banco):
    corpo = {"numero": "1", "fornecedor_id": 1, "data_emissao": "2026-10-01", "tipo": "peca", "valor_total": 10,
             "arquivo_url": "5/" + "a" * 32 + ".jpg"}
    assert client.post("/notas-fiscais", json=corpo, headers=cabecalho("mecanico", 5)).status_code != 403


def test_nao_abre_foto_com_caminho_fora_do_formato(client, banco):
    banco.tabelas["notas_fiscais"] = [{"id": 1, "arquivo_url": "5/../9/abc.jpg"}]
    assert client.get("/notas-fiscais/1/foto", headers=cabecalho("mecanico", 5)).status_code == 403


# ---------- segredo do JWT ----------

def test_segredo_jwt_fraco_e_detectado():
    from app import auth_utils
    assert auth_utils.segredo_fraco("curto")
    assert auth_utils.segredo_fraco("")
    assert not auth_utils.segredo_fraco("x" * 40)


# ---------- cabeçalhos de segurança ----------

def test_respostas_da_api_trazem_cabecalhos_de_seguranca(client):
    r = client.get("/")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_respostas_autenticadas_nao_ficam_em_cache(client):
    assert "no-store" in client.get("/maquinas", headers=cabecalho("admin")).headers.get("cache-control", "")


# ---------- senha ----------

def test_senha_fraca_e_recusada_na_criacao_de_usuario(client):
    r = client.post("/usuarios", json={"nome": "x", "usuario": "x", "senha": "1234567"}, headers=cabecalho("admin"))
    assert r.status_code == 422

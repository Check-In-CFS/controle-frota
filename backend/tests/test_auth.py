from datetime import datetime, timedelta, timezone

import jwt

from app import rate_limit
from app.auth_utils import JWT_ALGORITHM
from tests.conftest import cabecalho


def test_rota_protegida_sem_token_da_401(client):
    assert client.get("/maquinas").status_code == 401


def test_token_invalido_da_401(client):
    r = client.get("/maquinas", headers={"Authorization": "Bearer lixo"})
    assert r.status_code == 401


def test_token_expirado_da_401(client):
    import os
    agora = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": "1", "usuario": "x", "papel": "admin", "iat": agora - timedelta(hours=13), "exp": agora - timedelta(hours=1)},
        os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM,
    )
    r = client.get("/maquinas", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert "expirada" in r.json()["detail"]


def test_token_assinado_com_outro_segredo_da_401(client):
    token = jwt.encode({"sub": "1", "usuario": "x", "papel": "admin"}, "outro-segredo-qualquer-com-32-bytes!!", algorithm=JWT_ALGORITHM)
    assert client.get("/maquinas", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_login_correto_devolve_token_e_papel(client, banco, usuario_db):
    banco.tabelas["usuarios"] = [usuario_db]
    r = client.post("/auth/login", json={"usuario": "fulano", "senha": "senha-certa"})
    assert r.status_code == 200
    assert r.json()["papel"] == "mecanico"
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200


def test_login_usuario_inexistente_nao_revela_nada(client):
    r = client.post("/auth/login", json={"usuario": "ninguem", "senha": "x"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Usuário ou senha inválidos"


def test_login_senha_errada_conta_tentativa(client, banco, usuario_db):
    banco.tabelas["usuarios"] = [usuario_db]
    r = client.post("/auth/login", json={"usuario": "fulano", "senha": "errada"})
    assert r.status_code == 401
    assert ("usuarios", {"tentativas_falhas": 1}) in banco.atualizacoes


def test_quinta_tentativa_errada_bloqueia_a_conta(client, banco, usuario_db):
    usuario_db["tentativas_falhas"] = 4
    banco.tabelas["usuarios"] = [usuario_db]
    client.post("/auth/login", json={"usuario": "fulano", "senha": "errada"})
    nome, dados = banco.atualizacoes[-1]
    assert dados["tentativas_falhas"] == 0
    assert dados["bloqueado_ate"]


def test_conta_bloqueada_da_429_mesmo_com_senha_certa(client, banco, usuario_db):
    usuario_db["bloqueado_ate"] = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    banco.tabelas["usuarios"] = [usuario_db]
    r = client.post("/auth/login", json={"usuario": "fulano", "senha": "senha-certa"})
    assert r.status_code == 429


def test_limite_de_tentativas_por_ip(client):
    for _ in range(rate_limit.MAX_TENTATIVAS_POR_JANELA):
        assert client.post("/auth/login", json={"usuario": "a", "senha": "b"}).status_code == 401
    assert client.post("/auth/login", json={"usuario": "a", "senha": "b"}).status_code == 429


def test_limite_por_ip_nao_afeta_outro_ip(client, monkeypatch):
    monkeypatch.setenv("CONFIAR_PROXY", "1")
    for _ in range(rate_limit.MAX_TENTATIVAS_POR_JANELA):
        client.post("/auth/login", json={"usuario": "a", "senha": "b"}, headers={"x-forwarded-for": "1.1.1.1"})
    r = client.post("/auth/login", json={"usuario": "a", "senha": "b"}, headers={"x-forwarded-for": "2.2.2.2"})
    assert r.status_code == 401


def test_ip_forjado_no_inicio_do_cabecalho_nao_burla_o_limite(client, monkeypatch):
    monkeypatch.setenv("CONFIAR_PROXY", "1")
    # O proxy confiável acrescenta o IP real no FIM; o cliente só consegue forjar o começo.
    for i in range(rate_limit.MAX_TENTATIVAS_POR_JANELA):
        client.post("/auth/login", json={"usuario": "a", "senha": "b"}, headers={"x-forwarded-for": f"9.9.9.{i}, 3.3.3.3"})
    r = client.post("/auth/login", json={"usuario": "a", "senha": "b"}, headers={"x-forwarded-for": "9.9.9.99, 3.3.3.3"})
    assert r.status_code == 429


def test_cadastro_publico_nao_existe_mais(client):
    r = client.post("/auth/registrar", json={"nome": "x", "usuario": "x", "senha": "123456"})
    assert r.status_code in (404, 405)

import os

import pytest
from fastapi.testclient import TestClient

# Variáveis falsas: nenhum teste fala com o Supabase real.
os.environ["SUPABASE_URL"] = "http://supabase.invalido"
os.environ["SUPABASE_SERVICE_KEY"] = "chave-de-teste"
os.environ["JWT_SECRET"] = "segredo-de-teste-com-tamanho-suficiente-para-hs256"
os.environ.pop("RAILWAY_ENVIRONMENT", None)
os.environ.pop("RAILWAY_ENVIRONMENT_NAME", None)

from app import database, rate_limit  # noqa: E402
from app.auth_utils import criar_token, hash_senha  # noqa: E402
from app.main import app  # noqa: E402


class Resposta:
    def __init__(self, data):
        self.data = data


class ConsultaFalsa:
    """Imita o encadeamento do cliente Supabase (select/eq/or_/order...) e guarda o que foi chamado."""

    def __init__(self, banco, nome):
        self.banco = banco
        self.nome = nome
        self.chamadas = []
        self._op = "select"
        self._payload = None

    def __getattr__(self, metodo):
        def encadear(*args, **kwargs):
            self.chamadas.append((metodo, args, kwargs))
            if metodo in ("insert", "update", "delete", "select"):
                self._op = metodo
                self._payload = args[0] if args else None
            return self
        return encadear

    def execute(self):
        self.banco.consultas.append(self)
        if self._op == "update":
            self.banco.atualizacoes.append((self.nome, self._payload))
        return Resposta(list(self.banco.tabelas.get(self.nome, [])))


class BancoFalso:
    def __init__(self):
        self.tabelas = {}
        self.consultas = []
        self.atualizacoes = []

    def table(self, nome):
        return ConsultaFalsa(self, nome)


@pytest.fixture(autouse=True)
def banco(monkeypatch):
    falso = BancoFalso()
    monkeypatch.setattr(database, "create_client", lambda url, key: falso)
    database.get_supabase.cache_clear()
    rate_limit.zerar()
    yield falso
    database.get_supabase.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


def cabecalho(papel, usuario_id=1):
    token = criar_token(usuario_id, f"{papel}1", papel)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def usuario_db():
    return {
        "id": 7, "nome": "Fulano", "usuario": "fulano", "papel": "mecanico", "ativo": True,
        "senha_hash": hash_senha("senha-certa"), "tentativas_falhas": 0, "bloqueado_ate": None,
    }

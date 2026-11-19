import os

import pytest
from fastapi.testclient import TestClient

# Variáveis falsas: nenhum teste fala com o Supabase real.
os.environ["SUPABASE_URL"] = "http://supabase.invalido"
os.environ["SUPABASE_SERVICE_KEY"] = "chave-de-teste"
os.environ["JWT_SECRET"] = "segredo-de-teste-com-tamanho-suficiente-para-hs256"
os.environ.pop("RAILWAY_ENVIRONMENT", None)
os.environ.pop("RAILWAY_ENVIRONMENT_NAME", None)

from app import database, fotos_notas, rate_limit  # noqa: E402
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
        if self._op == "insert" and isinstance(self._payload, dict):
            tabela = self.banco.tabelas.setdefault(self.nome, [])
            padroes = {"produtos": {"estoque_atual": 0, "ativo": True, "unidade_medida": "un", "estoque_minimo": None}}.get(self.nome, {})
            linha = {"id": len(tabela) + 1, "created_at": "2026-11-13T10:00:00Z", **padroes, **self._payload}
            tabela.append(linha)
            self.banco.inseridos.append((self.nome, linha))
            return Resposta([linha])
        return Resposta(list(self.banco.tabelas.get(self.nome, [])))


class BucketFalso:
    def __init__(self, banco):
        self.banco = banco

    def upload(self, caminho, conteudo, opcoes=None):
        self.banco.arquivos[caminho] = conteudo

    def create_signed_url(self, caminho, expira_em):
        return {"signedURL": f"http://storage.falso/{caminho}?expira={expira_em}"}


class StorageFalso:
    def __init__(self, banco):
        self.banco = banco

    def get_bucket(self, nome):  # como na biblioteca real com o Supabase atual: sempre quebra
        raise TypeError("SyncBucket.__init__() got an unexpected keyword argument 'versioning_status'")

    def list_buckets(self):
        return [type("B", (), {"name": n, "id": n})() for n in self.banco.buckets]

    def create_bucket(self, nome, options=None):
        if nome in self.banco.buckets:
            raise Exception("{'statusCode': 400, 'error': 'Duplicate', 'message': 'The resource already exists', 'code': 'BucketAlreadyExists'}")
        self.banco.buckets[nome] = options

    def from_(self, nome):
        return BucketFalso(self.banco)


class BancoFalso:
    def __init__(self):
        self.tabelas = {}
        self.consultas = []
        self.atualizacoes = []
        self.inseridos = []
        self.arquivos = {}
        self.buckets = {}
        self.chamadas_rpc = []
        self.storage = StorageFalso(self)

    def table(self, nome):
        return ConsultaFalsa(self, nome)

    def rpc(self, nome, params):
        """Só `ajustar_estoque`: soma ao produto e recusa saldo negativo, como o banco real."""
        banco = self

        class Chamada:
            def execute(self_):
                assert nome == "ajustar_estoque"
                produto = next((p for p in banco.tabelas.get("produtos", []) if p["id"] == params["p_produto_id"]), None)
                if produto is None:
                    raise Exception("produto_nao_encontrado")
                novo = float(produto["estoque_atual"]) + float(params["p_delta"])
                if novo < 0:
                    raise Exception('new row for relation "produtos" violates check constraint "produtos_estoque_atual_check" (23514)')
                produto["estoque_atual"] = novo
                banco.chamadas_rpc.append((nome, dict(params)))
                return Resposta(novo)

        return Chamada()


@pytest.fixture(autouse=True)
def banco(monkeypatch):
    falso = BancoFalso()
    monkeypatch.setattr(database, "create_client", lambda url, key: falso)
    database.get_supabase.cache_clear()
    rate_limit.zerar()
    fotos_notas._bucket_garantido = False
    yield falso
    database.get_supabase.cache_clear()


@pytest.fixture(autouse=True)
def usuarios_ativos(monkeypatch):
    """Por padrão todo token de teste pertence a um usuário ativo cujo papel é o do próprio token."""
    from app import auth_deps
    auth_deps._cache_usuarios.clear()
    monkeypatch.setattr(auth_deps, "consultar_usuario", lambda uid: {"ativo": True, "papel": None})
    yield
    auth_deps._cache_usuarios.clear()


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

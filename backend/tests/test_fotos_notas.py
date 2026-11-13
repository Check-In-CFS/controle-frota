import io

import pytest
from PIL import Image

from app import fotos_notas, leitura_nota
from tests.conftest import cabecalho


def foto_jpeg(tamanho=(400, 300), formato="JPEG"):
    saida = io.BytesIO()
    Image.new("RGB", tamanho, (200, 30, 30)).save(saida, format=formato)
    return saida.getvalue()


def enviar(client, papel="mecanico", usuario_id=5, conteudo=None, nome="nota.jpg"):
    return client.post(
        "/notas-fiscais/ler-foto",
        files={"arquivo": (nome, conteudo if conteudo is not None else foto_jpeg(), "image/jpeg")},
        headers=cabecalho(papel, usuario_id),
    )


@pytest.fixture
def leitura_ligada(monkeypatch):
    """Simula a resposta da IA, sem chamar a API de verdade."""
    monkeypatch.setenv("LEITURA_FOTO", "ia")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "chave-de-teste")
    lida = leitura_nota.NotaLida(
        numero="000.123", serie="1", data_emissao="2026-10-20", fornecedor_nome="Oficina do João",
        fornecedor_cnpj="12.345.678/0001-99", valor_total=350.5, tipo="peca",
        itens=[leitura_nota.ItemLido(nome="Filtro de óleo", quantidade=2, valor_unitario=50.0)],
    )
    monkeypatch.setattr(leitura_nota, "ler_nota", lambda jpeg: lida)
    return lida


# ---------- envio ----------

def test_mecanico_envia_foto_e_recebe_dados_lidos(client, banco, leitura_ligada):
    banco.tabelas["fornecedores"] = [{"id": 9, "nome": "Oficina do João Ltda"}]
    r = enviar(client)
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["arquivo_url"].startswith("5/") and corpo["arquivo_url"].endswith(".jpg")
    assert corpo["dados"]["numero"] == "000123"
    assert corpo["dados"]["fornecedor_cnpj"] == "12345678000199"
    assert corpo["dados"]["fornecedor_id"] == 9          # casou pelo CNPJ
    assert corpo["dados"]["valor_total"] == 350.5
    assert corpo["aviso"] is None


def test_foto_guardada_em_bucket_privado_como_jpeg(client, banco, leitura_ligada):
    r = enviar(client)
    caminho = r.json()["arquivo_url"]
    assert banco.arquivos[caminho][:2] == b"\xff\xd8"      # JPEG
    assert banco.buckets[fotos_notas.BUCKET]["public"] is False


def test_foto_grande_e_reduzida(client, banco, leitura_ligada):
    r = enviar(client, conteudo=foto_jpeg((5000, 4000)))
    guardada = Image.open(io.BytesIO(banco.arquivos[r.json()["arquivo_url"]]))
    assert max(guardada.size) <= fotos_notas.LADO_MAXIMO


def test_png_e_aceito_e_vira_jpeg(client, banco, leitura_ligada):
    r = enviar(client, conteudo=foto_jpeg(formato="PNG"), nome="nota.png")
    assert r.status_code == 200
    assert banco.arquivos[r.json()["arquivo_url"]][:2] == b"\xff\xd8"


def test_arquivo_que_nao_e_imagem_e_recusado(client, banco):
    assert enviar(client, conteudo=b"%PDF-1.4 nao sou imagem").status_code == 422
    assert banco.arquivos == {}


def test_foto_acima_do_limite_da_413(client, monkeypatch):
    monkeypatch.setattr(fotos_notas, "TAMANHO_MAXIMO_UPLOAD", 1000)
    assert enviar(client, conteudo=b"x" * 2000).status_code == 413


def test_diretor_nao_envia_foto(client):
    assert enviar(client, papel="diretor").status_code == 403


def test_sem_login_nao_envia(client):
    r = client.post("/notas-fiscais/ler-foto", files={"arquivo": ("a.jpg", foto_jpeg(), "image/jpeg")})
    assert r.status_code == 401


def test_limite_de_fotos_por_usuario(client, leitura_ligada, monkeypatch):
    from app.routers import notas_fiscais
    monkeypatch.setattr(notas_fiscais, "LEITURAS_POR_HORA", 2)
    assert enviar(client).status_code == 200
    assert enviar(client).status_code == 200
    assert enviar(client).status_code == 429
    assert enviar(client, usuario_id=6).status_code == 200  # outro usuário não é afetado


# ---------- leitura (IA) ----------

def test_sem_chave_da_ia_guarda_a_foto_e_avisa(client, banco, monkeypatch):
    monkeypatch.setenv("LEITURA_FOTO", "ia")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = enviar(client)
    assert r.status_code == 200
    assert r.json()["dados"] is None and "manualmente" in r.json()["aviso"]
    assert r.json()["arquivo_url"] in banco.arquivos


def test_falha_da_ia_nao_perde_a_foto(client, banco, monkeypatch):
    monkeypatch.setenv("LEITURA_FOTO", "ia")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "chave-de-teste")

    def falha(jpeg):
        raise RuntimeError("API fora do ar")

    monkeypatch.setattr(leitura_nota, "ler_nota", falha)
    r = enviar(client)
    assert r.status_code == 200 and r.json()["dados"] is None
    assert r.json()["arquivo_url"] in banco.arquivos


def test_saneamento_descarta_dados_sem_sentido():
    lida = leitura_nota.NotaLida(
        numero="ABC", serie="x", data_emissao="2999-01-01", fornecedor_cnpj="123", valor_total=-5,
        itens=[leitura_nota.ItemLido(nome="", quantidade=1, valor_unitario=1),
               leitura_nota.ItemLido(nome="Ok", quantidade=0, valor_unitario=1),
               leitura_nota.ItemLido(nome="Bom", quantidade=1, valor_unitario=2)],
    )
    dados = leitura_nota.saneado(lida)
    assert dados["numero"] is None and dados["data_emissao"] is None
    assert dados["fornecedor_cnpj"] is None and dados["valor_total"] is None
    assert [i["nome"] for i in dados["itens"]] == ["Bom"]


# ---------- quem pode ver ----------

def nota_com_foto(banco, caminho="5/" + "a" * 32 + ".jpg"):
    banco.tabelas["notas_fiscais"] = [{"id": 1, "arquivo_url": caminho}]


def test_quem_enviou_abre_a_foto(client, banco):
    nota_com_foto(banco)
    r = client.get("/notas-fiscais/1/foto", headers=cabecalho("mecanico", 5))
    assert r.status_code == 200 and r.json()["url"].startswith("http://storage.falso/5/" + "a" * 32 + ".jpg")


def test_admin_abre_qualquer_foto(client, banco):
    nota_com_foto(banco)
    assert client.get("/notas-fiscais/1/foto", headers=cabecalho("admin", 1)).status_code == 200


def test_outro_mecanico_nao_abre_a_foto(client, banco):
    nota_com_foto(banco)
    assert client.get("/notas-fiscais/1/foto", headers=cabecalho("mecanico", 6)).status_code == 403


def test_id_de_usuario_parecido_nao_burla_o_prefixo(client, banco):
    nota_com_foto(banco, "55/" + "b" * 32 + ".jpg")  # usuário 5 não pode abrir a foto do usuário 55
    assert client.get("/notas-fiscais/1/foto", headers=cabecalho("mecanico", 5)).status_code == 403


def test_diretor_nao_abre_foto(client, banco):
    nota_com_foto(banco)
    assert client.get("/notas-fiscais/1/foto", headers=cabecalho("diretor", 3)).status_code == 403


def test_nota_sem_foto_da_404(client, banco):
    banco.tabelas["notas_fiscais"] = [{"id": 1, "arquivo_url": None}]
    assert client.get("/notas-fiscais/1/foto", headers=cabecalho("admin", 1)).status_code == 404


def test_mecanico_nao_anexa_foto_de_outro_usuario(client, banco):
    corpo = {"numero": "1", "fornecedor_id": 1, "data_emissao": "2026-10-01", "tipo": "peca",
             "valor_total": 10, "arquivo_url": "99/" + "c" * 32 + ".jpg"}
    r = client.post("/notas-fiscais", json=corpo, headers=cabecalho("mecanico", 5))
    assert r.status_code == 403


# ---------- fornecedor lido da foto e ainda não cadastrado: cadastra sozinho ----------

def test_fornecedor_novo_e_cadastrado_com_o_nome_da_consulta_do_cnpj(client, banco, leitura_ligada, monkeypatch):
    from app import consulta_cnpj
    monkeypatch.setattr(consulta_cnpj, "buscar_empresa",
                        lambda cnpj: {"nome": "OFICINA DO JOAO LTDA", "telefone": "6133331111", "email": "a@b.com"})
    banco.tabelas["fornecedores"] = []
    d = enviar(client).json()["dados"]
    assert d["fornecedor_cadastrado"] is True and d["fornecedor_nome_provisorio"] is False
    assert d["fornecedor_nome"] == "OFICINA DO JOAO LTDA" and d["fornecedor_id"] is not None
    nome, linha = [i for i in banco.inseridos if i[0] == "fornecedores"][0]
    assert linha["cnpj"] == "12345678000199" and linha["telefone"] == "6133331111"


def test_consulta_do_cnpj_fora_do_ar_cadastra_com_nome_provisorio(client, banco, leitura_ligada, monkeypatch):
    from app import consulta_cnpj
    monkeypatch.setattr(consulta_cnpj, "buscar_empresa", lambda cnpj: None)
    banco.tabelas["fornecedores"] = []
    d = enviar(client).json()["dados"]
    assert d["fornecedor_cadastrado"] is True and d["fornecedor_nome_provisorio"] is True
    assert d["fornecedor_nome"] == "Fornecedor 12345678000199"


def test_fornecedor_ja_cadastrado_nao_e_duplicado(client, banco, leitura_ligada, monkeypatch):
    from app import consulta_cnpj
    chamadas = []
    monkeypatch.setattr(consulta_cnpj, "buscar_empresa", lambda cnpj: chamadas.append(cnpj))
    banco.tabelas["fornecedores"] = [{"id": 9, "nome": "Já cadastrado"}]
    d = enviar(client).json()["dados"]
    assert d["fornecedor_id"] == 9 and d["fornecedor_cadastrado"] is False
    assert chamadas == [] and not [i for i in banco.inseridos if i[0] == "fornecedores"]


def test_sem_cnpj_lido_nao_cadastra_nada(client, banco, monkeypatch):
    monkeypatch.setenv("LEITURA_FOTO", "ia")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setattr(leitura_nota, "ler_nota", lambda jpeg: leitura_nota.NotaLida(numero="55"))
    d = enviar(client).json()["dados"]
    assert d["fornecedor_id"] is None and not [i for i in banco.inseridos if i[0] == "fornecedores"]


def test_consulta_cnpj_desligavel_e_so_aceita_14_digitos(monkeypatch):
    from app import consulta_cnpj
    monkeypatch.setenv("CONSULTA_CNPJ", "desligada")
    assert consulta_cnpj.buscar_empresa("12345678000199") is None
    monkeypatch.setenv("CONSULTA_CNPJ", "ligada")
    assert consulta_cnpj.buscar_empresa("123") is None

import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from app import leitura_nota, ocr_nota
from tests.conftest import cabecalho

CNPJ_VALIDO = "11.222.333/0001-81"  # dígitos verificadores corretos

TEXTO_DANFE = f"""
OFICINA DO JOAO PECAS E SERVICOS LTDA
CNPJ: {CNPJ_VALIDO}
DANFE - NOTA FISCAL ELETRONICA
N° 000.123  Série 1
Data de Emissão: 20/10/2026
DESTINATARIO: AGRO FROTA LTDA  CNPJ 45.723.174/0001-10
Valor dos produtos  R$ 400,00
Valor Total da Nota  R$ 1.350,50
"""


def test_cnpj_valido_e_invalido():
    assert ocr_nota._cnpj_valido("11222333000181")
    assert not ocr_nota._cnpj_valido("11222333000182")
    assert not ocr_nota._cnpj_valido("11111111111111")


def test_interpreta_os_campos_de_uma_danfe():
    nota = ocr_nota.interpretar(TEXTO_DANFE)
    assert nota.fornecedor_cnpj == "11222333000181"   # o do emitente (primeiro válido), não o do destinatário
    assert nota.numero == "000123"
    assert nota.serie == "1"
    assert nota.data_emissao == "2026-10-20"
    assert nota.valor_total == 1350.50                # "Valor Total da Nota", não "Valor dos produtos"


def test_nao_inventa_o_que_nao_acha():
    nota = ocr_nota.interpretar("texto borrado sem nada util 12 34 ab")
    assert nota.numero is None and nota.fornecedor_cnpj is None
    assert nota.data_emissao is None and nota.valor_total is None


def test_cnpj_com_erro_de_leitura_e_descartado():
    nota = ocr_nota.interpretar("CNPJ 11.222.333/0001-80")  # um dígito errado
    assert nota.fornecedor_cnpj is None


def test_data_futura_ou_impossivel_e_ignorada():
    assert ocr_nota.interpretar("Emissão: 31/02/2026").data_emissao is None
    assert ocr_nota.interpretar("Emissão: 01/01/2999").data_emissao is None


def test_valor_total_com_rotulo_mais_generico():
    assert ocr_nota.interpretar("TOTAL R$ 89,90").valor_total == 89.90


def test_modo_padrao_e_ocr(monkeypatch):
    monkeypatch.delenv("LEITURA_FOTO", raising=False)
    assert leitura_nota.modo() == "ocr"
    monkeypatch.setenv("LEITURA_FOTO", "ia")
    assert leitura_nota.modo() == "ia"


def test_endpoint_usa_ocr_por_padrao_sem_nenhuma_chave(client, banco, monkeypatch):
    monkeypatch.delenv("LEITURA_FOTO", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ocr_nota, "disponivel", lambda: True)
    monkeypatch.setattr(ocr_nota, "_ocr", lambda img, modo: TEXTO_DANFE)
    banco.tabelas["fornecedores"] = [{"id": 4, "nome": "Oficina do João"}]
    saida = io.BytesIO()
    Image.new("RGB", (300, 200), "white").save(saida, format="JPEG")
    r = client.post("/notas-fiscais/ler-foto", files={"arquivo": ("n.jpg", saida.getvalue(), "image/jpeg")},
                    headers=cabecalho("mecanico", 5))
    assert r.status_code == 200
    d = r.json()["dados"]
    assert d["numero"] == "000123" and d["valor_total"] == 1350.5 and d["fornecedor_id"] == 4


# ---------- Tesseract de verdade (pulado onde ele não está instalado) ----------

@pytest.mark.skipif(not ocr_nota.disponivel(), reason="Tesseract não instalado")
def test_tesseract_le_texto_de_uma_imagem_real():
    fonte = None
    for caminho in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        try:
            fonte = ImageFont.truetype(caminho, 34)
        except OSError:
            pass
    if fonte is None:
        try:
            fonte = ImageFont.load_default(size=34)
        except TypeError:
            pytest.skip("sem fonte vetorial para desenhar o texto de teste")
    img = Image.new("RGB", (1500, 700), "white")
    desenho = ImageDraw.Draw(img)
    linhas = [f"CNPJ: {CNPJ_VALIDO}", "Numero 000123  Serie 1", "Data de Emissao: 20/10/2026", "Valor Total da Nota R$ 1.350,50"]
    for i, linha in enumerate(linhas):
        desenho.text((40, 40 + i * 90), linha, fill="black", font=fonte)
    saida = io.BytesIO()
    img.save(saida, format="JPEG", quality=90)
    nota = ocr_nota.ler_nota(saida.getvalue())
    assert nota.fornecedor_cnpj == "11222333000181"
    assert nota.valor_total == 1350.50
    assert nota.data_emissao == "2026-10-20"


def test_ocr_com_espacos_entre_digitos_e_letra_trocada():
    texto = "CNPJ: 1 1.222.333/0001-81\nNº000.123 Sirie 1\nData de Emissão: 20/1 0/2026\nValor Total da Nota R$ 1.350,50"
    nota = ocr_nota.interpretar(texto)
    assert nota.fornecedor_cnpj == "11222333000181"
    assert nota.serie == "1"
    assert nota.data_emissao == "2026-10-20"


@pytest.mark.skipif(not ocr_nota.disponivel(), reason="Tesseract não instalado")
@pytest.mark.parametrize("graus", [90, 180, 270])
def test_foto_deitada_ou_de_cabeca_para_baixo_e_lida(graus):
    fonte = ImageFont.load_default(size=34)
    img = Image.new("RGB", (1500, 700), "white")
    desenho = ImageDraw.Draw(img)
    linhas = [f"CNPJ: {CNPJ_VALIDO}", "Numero 000123  Serie 1", "Data de Emissao: 20/10/2026",
              "Valor Total da Nota R$ 1.350,50", "DANFE DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA"]
    for i, linha in enumerate(linhas):
        desenho.text((40, 40 + i * 90), linha, fill="black", font=fonte)
    saida = io.BytesIO()
    img.rotate(graus, expand=True, fillcolor="white").save(saida, format="JPEG", quality=90)
    nota = ocr_nota.ler_nota(saida.getvalue())
    assert nota.fornecedor_cnpj == "11222333000181"
    assert nota.valor_total == 1350.50


# Trecho do texto que o Tesseract leu de uma foto REAL de DANFE (deitada, de celular).
TEXTO_FOTO_REAL = """
PRIMEIRA LINHA COMERCI ERRA DA
ROLAME AL AUXI
71200-045 BRASÃO DE Riasia ENTRADA Dé 1124 9076 0200 0195 5500 1000 E da NF-e
(61) 3462-5000 RISADA [1] Consulta de autenticidade no portal nacto
872.637 www nfe. fazenda. gov.br/ a
É E i ora
REIDA e SÉRIE 1 ou no site da Sefaz Autoriza
Ro SE QdE Rea! C/ST (60) 253260083601451 11/11/2026 13:28:08
INSCRIÇÃO EST; CNPJCPF
DESTINATÁRIO
NOME7RAZÃO SOCIAL TA DA EMISSÃO
HOME CENTER CASTELO FORTE LTDA “03.009.406/0001-23 | 11/11/2026
FATURA / DUPLICATA
-812637/001 09/12/2026 187,52 COOOTT À CCEE
VER FRETE] [VER SEGURO, à ; OUTRAS DESP T [TOTAL DA NOTA.
187,52
"""


def test_foto_real_nao_confunde_o_cnpj_do_comprador_com_o_do_fornecedor():
    nota = ocr_nota.interpretar(TEXTO_FOTO_REAL)
    assert nota.fornecedor_cnpj is None          # o único CNPJ lido é o do DESTINATÁRIO (comprador)
    assert nota.numero == "872637"               # número da DANFE, sem prefixo "Nº"
    assert nota.serie == "1"
    assert nota.data_emissao == "2026-11-11"
    assert nota.valor_total == 187.52


def test_cnpj_da_propria_empresa_e_ignorado_mesmo_sem_marcador(monkeypatch):
    monkeypatch.setenv("EMPRESA_CNPJ", "03.009.406/0001-23")
    assert ocr_nota.interpretar("CNPJ 03.009.406/0001-23").fornecedor_cnpj is None
    nota = ocr_nota.interpretar("CNPJ 03.009.406/0001-23  CNPJ 11.222.333/0001-81")
    assert nota.fornecedor_cnpj == "11222333000181"


def test_cnpj_do_emitente_antes_do_destinatario_e_o_escolhido():
    texto = "EMITENTE X CNPJ 11.222.333/0001-81\nDESTINATARIO\nHOME CENTER 45.723.174/0001-10"
    assert ocr_nota.interpretar(texto).fornecedor_cnpj == "11222333000181"


# ---------- casos tirados das fotos reais de teste (NFS-e e DANFE) ----------

def test_nfse_o_tomador_nao_e_o_fornecedor(monkeypatch):
    monkeypatch.setenv("EMPRESA_CNPJ", "03.009.406/0001-23")
    texto = ("PRESTADOR / FORNECEDOR CNPJ 33.144.63310001-22\nTOTAL PECAS E SERVICOS HIDRAULICOS LTDA\n"
             "TOMADOR / ADQUIRENTE CNPJ 03.009.406/0002-04\nHOME CENTER CASTELO FORTE LTDA")
    nota = ocr_nota.interpretar(texto)
    assert nota.fornecedor_cnpj == "33144633000122"  # barra perdida pelo OCR e tomador ignorado


def test_filial_da_empresa_e_ignorada_pela_raiz(monkeypatch):
    monkeypatch.setenv("EMPRESA_CNPJ", "03.009.406/0001-23")   # matriz informada...
    assert ocr_nota.interpretar("CNPJ 03.009.406/0002-04").fornecedor_cnpj is None  # ...filial 0002 também é ignorada


def test_data_nao_e_perdida_quando_o_ocr_cola_numeros_vizinhos():
    texto = "ri É 141/2026 04/11/2026 14:32:32.\n70000 04/11/2026 14:32:31"  # emissão da NFS-e e da DPS
    assert ocr_nota.interpretar(texto).data_emissao == "2026-11-04"


def test_valor_sem_rotulo_usa_o_que_mais_se_repete():
    texto = "VALOR DA OPERAÇÃO R$ 850,00\nVALOR LIQUIDO R$ 850,00\nR$ 0,00\nISS R$ 12,00"
    assert ocr_nota.interpretar(texto).valor_total == 850.0


def test_giro_so_com_confianca(monkeypatch):
    import pytesseract
    chamadas = []
    monkeypatch.setattr(pytesseract, "image_to_osd", lambda img, config="": "Rotate: 180\nOrientation confidence: 0.01\n")
    img = Image.new("L", (200, 100), 255)
    saida = ocr_nota._corrigir_orientacao(img)
    assert saida.size == (200, 100) and not chamadas   # confiança 0.01: não gira
    monkeypatch.setattr(pytesseract, "image_to_osd", lambda img, config="": "Rotate: 90\nOrientation confidence: 4.5\n")
    assert ocr_nota._corrigir_orientacao(img).size == (100, 200)  # confiança alta: gira


def test_data_duvidosa_fica_em_branco_em_vez_de_errada():
    # "05" lido como "08" ao lado do rótulo, e a data certa aparece solta uma vez: conflito -> sem sugestão
    assert ocr_nota.interpretar("EMISSÃO: 08/11/2026\n05/11/2026 15:14").data_emissao is None


def test_data_ao_lado_do_rotulo_vale_quando_ninguem_a_contradiz():
    assert ocr_nota.interpretar("DATA DA EMISSÃO 11/11/2026").data_emissao == "2026-11-11"


def test_lei_da_transparencia_nao_vira_numero_da_nota():
    assert ocr_nota.interpretar("Lei n° 12.741/2012: Federais").numero is None


def test_valor_repetido_escolhe_o_maior_e_nao_a_aliquota():
    texto = "TOTAL DOS PRODUTOS\n59,87 11,98 187,52\n20,00 20,00 20,00 20,00\nTOTAL\n187,52"
    assert ocr_nota.interpretar(texto).valor_total == 187.52


def test_rotulo_nao_atravessa_a_quebra_de_linha_para_pegar_a_coluna_vizinha():
    assert ocr_nota.interpretar("TOTAL DOS PRODUTOS\n59,87").valor_total is None


# ---------- NF de serviço (DANFSe): layout próprio, rótulo ACIMA do valor ----------

TEXTO_NFSE = """
DANFSe v2.0
Documento Auxiliar da NFS-e
NÚMERO DA NFS-o
04/11/2026
A autenticidade desta NFS-e
1050
DATA E HORA DA EMISSÃO DA DPS
NÚMERO DA DPS
14
PRESTADOR / FORNECEDOR CNPJ 33.144.63310001-22
TOMADOR / ADQUIRENTE CNPJ 03.009.406/0002-04
Tributos cfe. Lei
nº 12774
VALOR DA OPERAÇÃO / SERVIÇO
R$ 850,00
VALOR LÍQUIDO DA NFS-e
R$ 850,00
"""


def test_nfse_le_numero_pelo_rotulo_e_marca_como_servico():
    nota = ocr_nota.interpretar(TEXTO_NFSE)
    assert nota.numero == "1050"            # não o 14 da DPS nem o "nº 12774" da lei
    assert nota.tipo == "servico"
    assert nota.valor_total == 850.0
    assert nota.fornecedor_cnpj == "33144633000122"


def test_nfse_sem_numero_legivel_fica_em_branco_em_vez_de_pegar_numero_solto():
    nota = ocr_nota.interpretar("DANFSe v2.0\nLei nº 12774\nR$ 100,00")
    assert nota.numero is None


def test_danfe_nao_e_marcada_como_servico():
    assert ocr_nota.interpretar(TEXTO_DANFE).tipo is None


def test_numero_da_danfe_com_milhar_separado_por_espaco_e_maioria():
    texto = "Nº 000.037 184 !\nSÉRIE 001\nN 000.037.184\nNº 000.037"
    assert ocr_nota.interpretar(texto).numero == "000037184"


def test_cnpj_no_texto_cru_quando_colar_digitos_o_emendaria_ao_vizinho():
    texto = "0748959600131 08.933.691 [0001:98 RIU."   # inscrição estadual + CNPJ com "/" lido como "[" e "-" como ":"
    assert ocr_nota.interpretar(texto).fornecedor_cnpj == "08933691000198"


def test_emitente_depois_do_destinatario_na_ordem_do_ocr_com_empresa_configurada(monkeypatch):
    monkeypatch.setenv("EMPRESA_CNPJ", "03.009.406/0001-23")
    texto = "DESTINATÁRIO / REMETENTE\nHOME CENTER 03.009.406/0002-04\nCNPJ 08.933.691/0001-98"
    assert ocr_nota.interpretar(texto).fornecedor_cnpj == "08933691000198"
    monkeypatch.delenv("EMPRESA_CNPJ")
    assert ocr_nota.interpretar(texto).fornecedor_cnpj is None   # sem saber quem é o comprador, não arrisca

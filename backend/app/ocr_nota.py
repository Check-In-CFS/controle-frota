"""
Leitura de foto de nota fiscal por OCR (Tesseract), sem IA: roda no próprio servidor,
não tem custo por foto e a imagem não sai da infraestrutura.

O OCR de foto de celular erra mais que a leitura por IA, e por isso este módulo é
CONSERVADOR: só devolve um campo quando acha um padrão confiável (ex: CNPJ com dígito
verificador válido, valor ao lado de "valor total"). O que não achar fica vazio para o
usuário preencher -- tudo vira sugestão para conferir, nunca é gravado direto.
"""

import io
import os
import re
from datetime import date

from PIL import Image, ImageOps

from app.leitura_nota import NotaLida

LIMITE_PIXELS_OCR = 3000  # lado maior; acima disso o Tesseract só fica mais lento
CONFIANCA_MINIMA_GIRO = 0.5  # Img reta chutou 180 com 0.01; fotos realmente deitadas dão 0.7 a 4.5


def disponivel() -> bool:
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _preparar(jpeg: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(jpeg))
    img = ImageOps.grayscale(img)
    img = ImageOps.autocontrast(img, cutoff=1)
    maior = max(img.size)
    if maior < 1600:  # foto pequena: amplia, o Tesseract lê melhor texto maior
        fator = 1600 / maior
        img = img.resize((int(img.width * fator), int(img.height * fator)), Image.LANCZOS)
    elif maior > LIMITE_PIXELS_OCR:
        img.thumbnail((LIMITE_PIXELS_OCR, LIMITE_PIXELS_OCR))
    return img


def _corrigir_orientacao(img: Image.Image) -> Image.Image:
    """Foto deitada ou de cabeça para baixo: o Tesseract detecta o giro (OSD) e a gente desfaz."""
    import pytesseract
    try:
        osd = pytesseract.image_to_osd(img, config="--psm 0 -c min_characters_to_try=15")
        m = re.search(r"Rotate:\s*(\d+)", osd)
        confianca = re.search(r"Orientation confidence:\s*([\d.]+)", osd)
        # só gira quando o Tesseract tem certeza: em foto reta com pouco texto ele "chuta" 180 graus
        graus = int(m.group(1)) if m and confianca and float(confianca.group(1)) >= CONFIANCA_MINIMA_GIRO else 0
    except Exception:  # OSD falha em imagem com pouco texto: segue sem girar
        return img
    return img.rotate(-graus, expand=True, fillcolor=255) if graus else img


# psm 6 = bloco uniforme (melhor p/ texto corrido); 11 e 4 achham números soltos em quadros e tabelas
MODOS_TESSERACT = ("--psm 6", "--psm 11", "--psm 4")


def _ocr(img: Image.Image, modo: str) -> str:
    import pytesseract
    return pytesseract.image_to_string(img, lang="por", config=modo)


def extrair_texto(jpeg: bytes, modo: str = MODOS_TESSERACT[0]) -> str:
    return _ocr(_corrigir_orientacao(_preparar(jpeg)), modo)


# ---------- interpretação do texto ----------

def _cnpj_valido(d: str) -> bool:
    if len(d) != 14 or d == d[0] * 14:
        return False

    def digito(base: str, pesos: list[int]) -> str:
        resto = sum(int(n) * p for n, p in zip(base, pesos)) % 11
        return "0" if resto < 2 else str(11 - resto)

    d1 = digito(d[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = digito(d[:12] + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return d[12:] == d1 + d2


def _moeda(texto: str):
    """'1.234,56' -> 1234.56 (formato brasileiro)."""
    limpo = texto.strip().replace(".", "").replace(",", ".")
    try:
        return float(limpo)
    except ValueError:
        return None


# a barra do CNPJ às vezes some ou vira "1", "|", "I" ou "l" no OCR; o dígito verificador filtra os falsos positivos
_RE_CNPJ = re.compile(r"(?<!\d)(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})\s?[/1|Il\[\]\\]?\s?(\d{4})\s?[-:.]?\s?(\d{2})(?!\d)")
_RE_DATA = re.compile(r"(?<!\d)(\d{2})[/.\-](\d{2})[/.\-](\d{4})(?!\d)")
_RE_VALOR_SEM_RS = r"(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})"
_RE_VALOR = r"R?\$?[ \t]*" + _RE_VALOR_SEM_RS
_RE_NUMERO = re.compile(
    r"(?:N[º°o0]\.?|N[úu]mero|NF-?e?\s*(?:N[º°o0]\.?)?)\s*[:.]?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{1,10})(?!\d)", re.I
)
_RE_SERIE = re.compile(r"S[éeií]rie\s*[:.]?\s*(\d{1,3})(?!\d)", re.I)

# do mais específico ao mais genérico
_ROTULOS_TOTAL = [
    r"valor\s+total\s+da\s+nota", r"total\s+da\s+nota", r"valor\s+total\s+nf",
    r"valor\s+a\s+pagar", r"total\s+a\s+pagar", r"valor\s+total", r"total\s+geral", r"\btotal\b",
]


def _colar_digitos(texto: str) -> str:
    """'1 1.222.333/0001-81' -> '11.222.333/0001-81' (o OCR costuma separar dígitos com espaço)."""
    return re.sub(r"(?<=\d) (?=\d)", "", texto)


def _raizes_da_empresa() -> set[str]:
    """
    Raiz (8 primeiros dígitos) do CNPJ da própria empresa compradora, para nunca confundir com o do
    fornecedor. Vale para matriz e todas as filiais (ex: .../0001-23 e .../0002-04 têm a mesma raiz).
    Env EMPRESA_CNPJ, separados por vírgula.
    """
    return {re.sub(r"\D", "", c)[:8] for c in os.environ.get("EMPRESA_CNPJ", "").split(",") if len(re.sub(r"\D", "", c)) >= 8}


def _achar_cnpj_emitente(colado: str):
    """
    Em uma DANFE o CNPJ do emitente (quem vendeu) vem antes do bloco DESTINATÁRIO, e o do
    destinatário (quem comprou -- no nosso caso a própria empresa) vem depois. Por isso:
    ignora os CNPJs da empresa e tudo que aparece depois do marcador "DESTINATÁRIO".
    Se o do fornecedor não foi lido, devolve None em vez de arriscar o do comprador.
    """
    proprias = _raizes_da_empresa()
    marcador = re.search(r"DESTINAT[ÁA]RIO|TOMADOR|ADQUIRENTE", colado, re.I)
    limite = marcador.start() if marcador else len(colado)

    validos = []  # (posição, dígitos) de todo CNPJ válido que não é da própria empresa
    for m in _RE_CNPJ.finditer(colado):
        digitos = "".join(m.groups())
        if _cnpj_valido(digitos) and digitos[:8] not in proprias:
            validos.append((m.start(), digitos))

    antes_do_destinatario = [d for pos, d in validos if pos < limite]
    if antes_do_destinatario:
        return antes_do_destinatario[0]
    # A ordem de leitura do OCR nem sempre segue a página (o emitente pode vir "depois" do destinatário).
    # Se sabemos qual é o CNPJ da empresa compradora, qualquer outro CNPJ válido do texto é do fornecedor.
    return validos[0][1] if proprias and validos else None


_RE_NUMERO_DANFE = re.compile(r"(?<![\d.,/-])(\d{1,3}(?:\.\d{3})+)(?![\d.,/-])")


def _eh_nfse(texto: str) -> bool:
    """NF de serviço (DANFSe): layout próprio, com rótulos acima dos valores."""
    return bool(re.search(r"DANFSe|NFS-?\s?[eo]\b|Nota\s+Fiscal\s+de\s+Servi", texto, re.I))


def _achar_numero_nfse(texto: str):
    """
    Na NFS-e o rótulo "NÚMERO DA NFS-e" fica ACIMA do valor, que vem numa das linhas seguintes
    (às vezes depois de outras: data, QR code). Pega o primeiro número inteiro sozinho numa linha,
    parando se chegar no rótulo "NÚMERO DA DPS" (outro número, que não é o da nota).
    """
    m = re.search(r"N[úu]MERO\s+DA\s+NFS-?\s?[eo0]", texto, re.I)
    if not m:
        return None
    resto = texto[m.end():].splitlines()
    for i, linha in enumerate(resto[:9]):
        if re.search(r"N[úu]MERO\s+DA\s+DPS", linha, re.I):
            break
        achou = re.fullmatch(r"\W*(\d{1,9})\W*", linha) if i else re.match(r"\s*(\d{1,9})(?!\S)", linha)
        if achou:
            return achou.group(1)
    return None


def _achar_numero(texto: str):
    """Número da NF-e pelo prefixo "Nº": entre as leituras, a que mais se repete (empate: a mais longa)."""
    contagem: dict[str, int] = {}
    for m in _RE_NUMERO.finditer(texto):
        antes = texto[max(0, m.start() - 12): m.start()].lower()
        depois = texto[m.end(): m.end() + 8]
        if "lei" in antes or re.match(r"\s*/\s*\d{4}", depois):  # "Lei nº 12.741/2012"
            continue
        digitos = re.sub(r"\D", "", m.group(1))
        if 0 < len(digitos) <= 9:
            contagem[digitos] = contagem.get(digitos, 0) + 1
    if not contagem:
        return None
    return max(contagem, key=lambda d: (contagem[d], len(d)))


def _achar_numero_danfe(texto: str):
    """Na DANFE o número (ex: 872.637) vem sozinho, poucas linhas antes de 'SÉRIE', sem o prefixo 'Nº'."""
    linhas = texto.splitlines()
    for i, linha in enumerate(linhas):
        if re.search(r"S[ÉEÍI]RIE\s*\d", linha, re.I):
            for anterior in reversed(linhas[max(0, i - 4): i + 1]):
                m = _RE_NUMERO_DANFE.search(anterior)
                if m:
                    return re.sub(r"\D", "", m.group(1))
    return None


def interpretar(texto: str) -> NotaLida:
    nota = NotaLida()
    colado = _colar_digitos(texto)

    # texto cru primeiro: colar dígitos pode emendar o CNPJ com o número vizinho ("…0131 08.933.691")
    nota.fornecedor_cnpj = _achar_cnpj_emitente(texto) or _achar_cnpj_emitente(colado)

    if _eh_nfse(texto):
        # em NFS-e o "Nº" solto costuma ser a Lei 12.741 ou outro número: só vale o do rótulo
        nota.numero = _achar_numero_nfse(texto)
        nota.tipo = "servico"
    else:
        nota.numero = _achar_numero(texto) or _achar_numero_danfe(texto)

    m = _RE_SERIE.search(texto)
    if m:
        nota.serie = m.group(1)

    nota.data_emissao = _achar_data(texto)
    if nota.data_emissao is None and not _RE_DATA.search(texto):
        # sem nenhuma data legível no texto cru: tenta de novo com dígitos soltos colados ("20/1 0/2026")
        nota.data_emissao = _achar_data(colado)

    for rotulo in _ROTULOS_TOTAL:
        m = re.search(rotulo + r"[^\d\n]{0,25}" + _RE_VALOR, texto, re.I)
        if m:
            valor = _moeda(m.group(1))
            if valor is not None and valor > 0:
                nota.valor_total = valor
                break

    if nota.valor_total is None:
        nota.valor_total = _valor_mais_repetido(texto)

    return nota


def _valor_mais_repetido(texto: str):
    """Sem rótulo legível: o maior valor com 'R$' (ou, sem R$, o maior valor que apareça 2+ vezes)."""
    for padrao, minimo in ((r"R\$\s*" + _RE_VALOR_SEM_RS, 1), (r"(?<![\d.,])" + _RE_VALOR_SEM_RS + r"(?![\d,])", 2)):
        contagem: dict[float, int] = {}
        for m in re.finditer(padrao, texto):
            v = _moeda(m.group(1))
            if v and v > 0:
                contagem[v] = contagem.get(v, 0) + 1
        repetidos = [v for v, c in contagem.items() if c >= minimo]
        if repetidos:
            return max(repetidos)
    return None


def _achar_data(texto: str):
    """
    Data ao lado do rótulo "emissão" só vale se nenhuma outra data a contradiz (emissão, saída e
    protocolo costumam coincidir); solta no texto, só vale se a MESMA data aparecer 2+ vezes. Um dígito
    mal lido (05 -> 08) aparece uma vez só, e preferimos deixar em branco a sugerir uma data errada.
    """
    def valida(m):
        try:
            d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
        return d if date(2000, 1, 1) <= d <= date.today() else None

    contagem: dict[date, int] = {}
    for m in _RE_DATA.finditer(texto):
        d = valida(m)
        if d:
            contagem[d] = contagem.get(d, 0) + 1

    for m in re.finditer(r"emiss[ãa]o[^\d\n]{0,20}" + _RE_DATA.pattern, texto, re.I):
        d = valida(m)
        if d:
            # se há OUTRAS datas no texto e nenhuma confirma esta, a leitura é duvidosa: melhor em branco
            if contagem[d] >= 2 or len(contagem) == 1:
                return d.isoformat()
            return None

    repetidas = [d for d, c in contagem.items() if c >= 2]
    return max(repetidas, key=lambda d: contagem[d]).isoformat() if repetidas else None


_CAMPOS = ("fornecedor_cnpj", "numero", "serie", "data_emissao", "valor_total")


def _completa(nota: NotaLida) -> bool:
    return all(getattr(nota, c) is not None for c in _CAMPOS)


def ler_nota(jpeg: bytes) -> NotaLida:
    """
    Lê com o modo padrão; se faltar campo, tenta os outros modos do Tesseract (cada um enxerga
    coisas diferentes) e junta o resultado campo a campo, sempre preferindo o que veio primeiro.
    Cada modo é interpretado SEPARADO, para o marcador "DESTINATÁRIO" valer só dentro do seu texto.
    """
    img = _corrigir_orientacao(_preparar(jpeg))  # gira uma vez só
    final = NotaLida()
    for modo in MODOS_TESSERACT:
        lida = interpretar(_ocr(img, modo))
        for campo in _CAMPOS:
            if getattr(final, campo) is None:
                setattr(final, campo, getattr(lida, campo))
        if _completa(final):
            break
    return final

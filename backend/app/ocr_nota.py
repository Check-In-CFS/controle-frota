"""
Leitura de foto de nota fiscal por OCR (Tesseract), sem IA: roda no próprio servidor,
não tem custo por foto e a imagem não sai da infraestrutura.

O OCR de foto de celular erra mais que a leitura por IA, e por isso este módulo é
CONSERVADOR: só devolve um campo quando acha um padrão confiável (ex: CNPJ com dígito
verificador válido, valor ao lado de "valor total"). O que não achar fica vazio para o
usuário preencher -- tudo vira sugestão para conferir, nunca é gravado direto.
"""

import io
import re
from datetime import date

from PIL import Image, ImageOps

from app.leitura_nota import NotaLida

LIMITE_PIXELS_OCR = 3000  # lado maior; acima disso o Tesseract só fica mais lento


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
        graus = int(m.group(1)) if m else 0
    except Exception:  # OSD falha em imagem com pouco texto: segue sem girar
        return img
    return img.rotate(-graus, expand=True, fillcolor=255) if graus else img


def extrair_texto(jpeg: bytes) -> str:
    import pytesseract
    img = _corrigir_orientacao(_preparar(jpeg))
    return pytesseract.image_to_string(img, lang="por", config="--psm 6")


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


_RE_CNPJ = re.compile(r"(?<!\d)(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})\s?/\s?(\d{4})\s?-?\s?(\d{2})(?!\d)")
_RE_DATA = re.compile(r"(?<!\d)(\d{2})[/.\-](\d{2})[/.\-](\d{4})(?!\d)")
_RE_VALOR = r"R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})"
_RE_NUMERO = re.compile(
    r"(?:N[º°o0]\.?|N[úu]mero|NF-?e?\s*(?:N[º°o0]\.?)?)\s*[:.]?\s*(\d{1,3}(?:\.\d{3})+|\d{1,10})(?!\d)", re.I
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


def interpretar(texto: str) -> NotaLida:
    nota = NotaLida()
    colado = _colar_digitos(texto)

    # CNPJ do emitente: o primeiro com dígito verificador válido (o emitente vem antes do destinatário)
    for m in _RE_CNPJ.finditer(colado):
        digitos = "".join(m.groups())
        if _cnpj_valido(digitos):
            nota.fornecedor_cnpj = digitos
            break

    m = _RE_NUMERO.search(texto)
    if m:
        nota.numero = re.sub(r"\D", "", m.group(1))

    m = _RE_SERIE.search(texto)
    if m:
        nota.serie = m.group(1)

    nota.data_emissao = _achar_data(colado)

    for rotulo in _ROTULOS_TOTAL:
        m = re.search(rotulo + r"[^\d\n]{0,25}" + _RE_VALOR, texto, re.I)
        if m:
            valor = _moeda(m.group(1))
            if valor is not None and valor > 0:
                nota.valor_total = valor
                break

    return nota


def _achar_data(texto: str):
    def valida(m):
        try:
            d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
        return d if date(2000, 1, 1) <= d <= date.today() else None

    # prefere a data que vem logo depois de "emissão"
    for m in re.finditer(r"emiss[ãa]o[^\d\n]{0,20}" + _RE_DATA.pattern, texto, re.I):
        d = valida(m)
        if d:
            return d.isoformat()
    for m in _RE_DATA.finditer(texto):
        d = valida(m)
        if d:
            return d.isoformat()
    return None


def ler_nota(jpeg: bytes) -> NotaLida:
    return interpretar(extrair_texto(jpeg))

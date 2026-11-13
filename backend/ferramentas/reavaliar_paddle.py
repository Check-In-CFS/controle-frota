"""Reaplica o interpretador ATUAL ao texto que o PaddleOCR já leu (arquivo salvo pelo comparar_ocr.py)."""
import re, sys
sys.path.insert(0, "/app")
from app import ocr_nota
gab = {"TesteImg1.jpeg": ("24907602000195", "872637", "1", "2026-11-11", 187.52),
       "TesteImg2.jpeg": ("33144633000122", "1050", None, "2026-11-04", 850.0),
       "TesteImg3.jpeg": ("08933691000198", "000037184", "001", "2026-11-05", 350.0)}
bruto = open("/app/amostras/_paddle_saida.txt", encoding="utf-8", errors="ignore").read()
tot = ok = 0
for bloco in bruto.split("=" * 78)[1:]:
    nome = bloco.strip().split()[0]
    m = re.search(r"\[paddleocr\][^\n]*\n(.*)", bloco, re.S)
    if not m or nome not in gab:
        continue
    corpo = m.group(1)
    corpo = corpo.split("--- texto lido ---", 1)[-1]
    texto = "\n".join(l.split("| ", 1)[1] for l in corpo.splitlines() if "| " in l)
    n = ocr_nota.interpretar(texto)
    lido = (n.fornecedor_cnpj, n.numero, n.serie, n.data_emissao, n.valor_total)
    print(nome)
    for campo, esp, got in zip(("cnpj", "numero", "serie", "data", "valor"), gab[nome], lido):
        if esp is None: continue
        tot += 1; ok += esp == got
        print(f"   {campo:6} {'OK ' if esp == got else ('-- ' if got is None else 'ERR')} lido={got}  esperado={esp}")
print(f"acertos paddle: {ok}/{tot}")

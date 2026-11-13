import sys, time
sys.path.insert(0, "/app")
from pathlib import Path
from app import fotos_notas, ocr_nota
gab = {"TesteImg1.jpeg": ("24907602000195", "872637", "1", "2026-11-11", 187.52),
       "TesteImg2.jpeg": ("33144633000122", "1050", None, "2026-11-04", 850.0),
       "TesteImg3.jpeg": ("08933691000198", "000037184", "001", "2026-11-05", 350.0),
       "WhatsApp Image 2026-11-13 at 09.53.33.jpeg": ("24907602000195", "872637", "1", "2026-11-11", 187.52)}
tot = ok = 0
for f, g in gab.items():
    jpeg = fotos_notas.normalizar_imagem(Path(f"/app/amostras/{f}").read_bytes())
    t = time.perf_counter(); n = ocr_nota.ler_nota(jpeg); dt = time.perf_counter() - t
    lido = (n.fornecedor_cnpj, n.numero, n.serie, n.data_emissao, n.valor_total)
    print(f"{f} {dt:4.1f}s")
    for nome, esp, got in zip(("cnpj", "numero", "serie", "data", "valor"), g, lido):
        if esp is None: continue
        tot += 1; ok += esp == got
        print(f"   {nome:6} {'OK ' if esp == got else ('-- ' if got is None else 'ERR')} lido={got}  esperado={esp}")
print(f"acertos: {ok}/{tot}")

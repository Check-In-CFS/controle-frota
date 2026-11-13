"""
Compara motores de OCR nas fotos de nota fiscal da pasta `amostras/` (fora do git).

Uso (dentro do container do backend, com o PaddleOCR instalado só ali):
    python ferramentas/comparar_ocr.py            # todas as imagens de amostras/
    python ferramentas/comparar_ocr.py foto.jpg   # uma imagem

Para cada imagem mostra, por motor: tempo, os campos que o interpretador extraiu e o texto lido.
Os campos usam o MESMO interpretador (app/ocr_nota.interpretar), então a diferença vem só do motor.
"""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageOps  # noqa: E402

from app import fotos_notas, ocr_nota  # noqa: E402

PASTA = Path(__file__).resolve().parent.parent / "amostras"
_paddle = None


def jpeg_normalizado(caminho: Path) -> bytes:
    return fotos_notas.normalizar_imagem(caminho.read_bytes())  # igual ao que o sistema faz no upload


def texto_tesseract(jpeg: bytes) -> str:
    return ocr_nota.extrair_texto(jpeg)


def texto_paddle(jpeg: bytes) -> str:
    """Junta os trechos detectados que estão na mesma linha (rótulo + valor), de cima para baixo."""
    global _paddle
    import numpy as np
    from paddleocr import PaddleOCR

    if _paddle is None:
        _paddle = PaddleOCR(
            lang="pt", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, enable_mkldnn=False,
        )
    img = np.array(Image.open(io.BytesIO(jpeg)).convert("RGB"))
    resultado = _paddle.predict(img)[0]
    caixas = []
    for texto, poly in zip(resultado["rec_texts"], resultado["rec_polys"]):
        ys = [p[1] for p in poly]
        xs = [p[0] for p in poly]
        caixas.append({"t": texto, "x": min(xs), "yc": sum(ys) / len(ys), "h": max(ys) - min(ys)})
    caixas.sort(key=lambda c: c["yc"])
    linhas, atual = [], []
    for c in caixas:
        if atual and abs(c["yc"] - atual[-1]["yc"]) > max(c["h"], atual[-1]["h"]) * 0.6:
            linhas.append(atual)
            atual = []
        atual.append(c)
    if atual:
        linhas.append(atual)
    return "\n".join(" ".join(c["t"] for c in sorted(l, key=lambda c: c["x"])) for l in linhas)


MOTORES = {"tesseract": texto_tesseract, "paddleocr": texto_paddle}


def main():
    args = sys.argv[1:]
    imagens = [Path(a) for a in args] if args else sorted(p for p in PASTA.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    if not imagens:
        print(f"Nenhuma imagem em {PASTA}")
        return
    for caminho in imagens:
        jpeg = jpeg_normalizado(caminho)
        print("=" * 78)
        print(f"{caminho.name}  ({len(jpeg)//1024} KB)")
        for nome, motor in MOTORES.items():
            t0 = time.perf_counter()
            try:
                texto = motor(jpeg)
            except Exception as exc:  # noqa: BLE001
                print(f"\n[{nome}] FALHOU: {exc}")
                continue
            dt = time.perf_counter() - t0
            nota = ocr_nota.interpretar(texto)
            print(f"\n[{nome}] {dt:.1f}s")
            print(f"  cnpj={nota.fornecedor_cnpj}  numero={nota.numero}  serie={nota.serie}  data={nota.data_emissao}  valor={nota.valor_total}")
            print("  --- texto lido ---")
            print("\n".join("  | " + l for l in texto.splitlines() if l.strip()))


if __name__ == "__main__":
    main()

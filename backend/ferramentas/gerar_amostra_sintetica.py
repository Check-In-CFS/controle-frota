"""Gera uma 'foto' de DANFE falsa (inclinada, com ruído) só para testar o ambiente de OCR."""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

fonte = ImageFont.load_default(size=30)
img = Image.new("RGB", (1400, 1000), (245, 245, 240))
d = ImageDraw.Draw(img)
linhas = [
    "OFICINA DO JOAO PECAS E SERVICOS LTDA",
    "CNPJ: 11.222.333/0001-81",
    "DANFE - NOTA FISCAL ELETRONICA",
    "N° 000.123      Série 1",
    "Data de Emissão: 20/10/2026",
    "DESTINATARIO: AGRO FROTA LTDA  CNPJ 45.723.174/0001-10",
    "Filtro hidraulico        2     R$ 150,00     R$ 300,00",
    "Valor dos produtos  R$ 400,00",
    "Valor Total da Nota  R$ 1.350,50",
]
for i, l in enumerate(linhas):
    d.text((60, 60 + i * 95), l, fill=(20, 20, 20), font=fonte)
random.seed(1)
for _ in range(4000):
    x, y = random.randrange(1400), random.randrange(1000)
    d.point((x, y), fill=(random.randrange(150, 230),) * 3)
img = img.rotate(-2.5, expand=True, fillcolor=(120, 120, 115)).filter(ImageFilter.GaussianBlur(0.8))
destino = Path(sys.argv[1] if len(sys.argv) > 1 else "amostras/sintetica_01.jpg")
destino.parent.mkdir(exist_ok=True)
img.save(destino, quality=82)
print("gerada:", destino)

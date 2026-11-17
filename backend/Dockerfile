FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Tesseract com 1 thread: em servidor com pouco processador, varias threads brigando ficam 3-4x mais lentas
ENV OMP_THREAD_LIMIT=1

# Tesseract (OCR) em português: lê o texto das fotos de notas fiscais, sem IA e sem enviar a imagem a terceiros
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Produção: respeita a porta que a hospedagem define ($PORT) e não usa --reload.
# O docker-compose.yml sobrescreve este comando para desenvolvimento (com --reload).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

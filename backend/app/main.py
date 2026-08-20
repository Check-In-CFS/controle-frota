import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    maquinas,
    fornecedores,
    manutencoes,
    preventivas,
    abastecimentos,
    notas_fiscais,
    checklist,
    dashboard,
    relatorios,
)

load_dotenv()

app = FastAPI(
    title="Controle de Frota API",
    description="API do sistema de controle de frota (máquinas, manutenções, abastecimentos, notas fiscais, checklist).",
    version="0.1.0",
)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(maquinas.router)
app.include_router(fornecedores.router)
app.include_router(manutencoes.router)
app.include_router(preventivas.router)
app.include_router(abastecimentos.router)
app.include_router(notas_fiscais.router)
app.include_router(checklist.router)
app.include_router(dashboard.router)
app.include_router(relatorios.router)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "controle-frota-api"}

import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth_deps import obter_usuario_atual, exigir_admin_ou_diretor
from app.auth_utils import segredo_fraco
from app.routers import (
    auth,
    usuarios,
    maquinas,
    fornecedores,
    manutencoes,
    preventivas,
    abastecimentos,
    notas_fiscais,
    checklist,
    dashboard,
    relatorios,
    financeiro,
    logs,
)

load_dotenv()

# Em produção (Railway) a documentação da API fica desligada -- evita expor
# publicamente a lista de rotas do sistema. Localmente continua em /docs.
em_producao = bool(os.environ.get("RAILWAY_ENVIRONMENT_NAME") or os.environ.get("RAILWAY_ENVIRONMENT"))

app = FastAPI(
    title="Controle de Frota API",
    description="API do sistema de controle de frota (máquinas, manutenções, abastecimentos, notas fiscais, checklist).",
    version="0.1.0",
    docs_url=None if em_producao else "/docs",
    redoc_url=None if em_producao else "/redoc",
    openapi_url=None if em_producao else "/openapi.json",
)

# FRONTEND_URL aceita mais de um endereço, separados por vírgula (ex: o site e o IP da rede para testar no celular)
frontend_urls = [u.strip() for u in os.environ.get("FRONTEND_URL", "http://localhost:5173").split(",") if u.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_urls,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if segredo_fraco(os.environ.get("JWT_SECRET", "")):
    print("[SEGURANÇA] JWT_SECRET ausente ou com menos de 32 caracteres: gere um novo (openssl rand -hex 32).")


@app.middleware("http")
async def cabecalhos_de_seguranca(request, call_next):
    resposta = await call_next(request)
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    resposta.headers["X-Frame-Options"] = "DENY"
    resposta.headers["Referrer-Policy"] = "no-referrer"
    # dados da API (notas, valores, usuários) não devem ficar em cache de navegador/proxy
    if request.url.path != "/":
        resposta.headers["Cache-Control"] = "no-store"
    return resposta


# /auth (login) fica público -- sem exigir token, é a própria porta de entrada.
app.include_router(auth.router)

# Todos os demais módulos exigem estar logado (token JWT válido no header Authorization).
# Ações de exclusão exigem papel 'admin' -- isso é checado individualmente em cada
# rota DELETE dos routers abaixo, via dependency `exigir_admin`.
_protegido = [Depends(obter_usuario_atual)]

app.include_router(usuarios.router, dependencies=_protegido)
app.include_router(maquinas.router, dependencies=_protegido)
app.include_router(fornecedores.router, dependencies=_protegido)
app.include_router(manutencoes.router, dependencies=_protegido)
app.include_router(preventivas.router, dependencies=_protegido)
app.include_router(abastecimentos.router, dependencies=_protegido)
app.include_router(notas_fiscais.router, dependencies=_protegido)
app.include_router(checklist.router, dependencies=_protegido)
app.include_router(dashboard.router, dependencies=_protegido)
app.include_router(relatorios.router, dependencies=_protegido)
app.include_router(financeiro.router, dependencies=[Depends(obter_usuario_atual), Depends(exigir_admin_ou_diretor)])
app.include_router(logs.router, dependencies=_protegido)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "controle-frota-api"}

# Controle de Frota

Sistema de controle de frota (máquinas, manutenções, abastecimentos, notas fiscais, checklist).

## Como rodar (sem instalar nada no seu PC)

Este projeto usa **GitHub Codespaces** — um ambiente de desenvolvimento completo rodando na nuvem,
acessado pelo navegador. Node.js, Python e todas as dependências já vêm prontos automaticamente.

### 1. Subir o projeto pro GitHub
No seu perfil do GitHub, crie um repositório novo (ex: `controle-frota`) e envie estes arquivos
(pelo próprio site do GitHub: "Add file" → "Upload files", arraste a pasta inteira).

### 2. Abrir no Codespaces
No repositório, clique no botão verde **Code** → aba **Codespaces** → **Create codespace on main**.

Aguarde alguns minutos na primeira vez — ele vai instalar Node.js, Python e todas as dependências
sozinho (definido em `.devcontainer/devcontainer.json`). Você verá o progresso no terminal.

### 3. Configurar as variáveis de ambiente
No terminal do Codespaces (já aberto no navegador):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edite `backend/.env` e cole sua `SUPABASE_SERVICE_KEY`
(pegue em: Supabase → Project Settings → API → service_role secret).

### 4. Rodar o backend
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0
```
O Codespaces vai perguntar se quer abrir a porta 8000 no navegador — aceite.

### 5. Rodar o frontend (em outro terminal)
No VS Code do navegador, abra um novo terminal (ícone `+`) e rode:
```bash
cd frontend
npm run dev -- --host 0.0.0.0
```
O Codespaces abre automaticamente a porta 5173 com o preview do sistema.

## Deploy em produção (depois de testado)

- **Backend** → Railway (conecta direto no repositório GitHub, builda sozinho)
- **Frontend** → Vercel (conecta direto no repositório GitHub, builda sozinho)
- **Banco** → Supabase (já configurado)

Nenhuma dessas etapas exige instalar nada na sua máquina — tudo roda na nuvem dos próprios serviços.

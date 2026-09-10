# Trilho Educacional — Painel de Tráfego (Benne Performance)

Painel de acompanhamento de tráfego pago das 3 unidades (Antenor Thomazi, Anjinho, Aquas),
com dados do Meta atualizados automaticamente, leads da planilha do Google e fluxo de
aprovação de criativos com login (Benne e Colégio).

## Como funciona (visão geral)

- **`index.html`** — o painel (site estático, hospedado no GitHub Pages).
- **`dados.json`** — os números do Meta e dos leads. É **gerado automaticamente**.
- **`scripts/pull-dados.mjs`** + **`.github/workflows/atualizar-dados.yml`** — o "robô":
  de tempos em tempos, o GitHub puxa o Meta (3 unidades) e a planilha de leads e
  reescreve o `dados.json`.
- **Firebase** — cuida do **login** (Benne e Colégio) e do **salvamento das aprovações**
  de criativos. É o que permite o Colégio entrar só com link + usuário/senha, sem conta no Claude.

O Colégio acessa por **link + usuário/senha**, vê tudo e só aprova/comenta.
A Benne tem acesso total (envia criativos, etc.).

---

## Passo a passo (uma vez só)

### 1) Criar o repositório e subir os arquivos
1. Em https://github.com/Bennecomunica crie um repositório novo chamado **`trilho-educacional`** (pode ser privado).
2. Suba **todos os arquivos desta pasta** (index.html, dados.json, README.md, a pasta `scripts/`, a pasta `.github/` e o `firestore.rules`).
   - Dá pra arrastar os arquivos na tela "uploading an existing file" do GitHub, mas cuidado para manter as **pastas** `.github/workflows/` e `scripts/`.

### 2) Ligar o GitHub Pages (deixa o painel no ar)
1. No repositório: **Settings → Pages**.
2. Em "Source", escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**. Salve.
3. Em ~1 minuto o painel fica no ar em: `https://bennecomunica.github.io/trilho-educacional/`
   (esse é o link que você manda pro Colégio).

### 3) Token do Meta (para o robô puxar os anúncios)
Precisamos de um token de **longa duração** com permissão de leitura de anúncios.
1. Em https://business.facebook.com , abra a Business **Trilho Educacional** → **Configurações → Usuários → Usuários do sistema**.
2. Crie um **Usuário do Sistema** (ex.: "robo-painel"), papel **Admin**.
3. Dê acesso a ele às **3 contas de anúncio** (CECAT, Anjinho, Aquas), com permissão de visualizar desempenho.
4. Clique em **Gerar novo token**, escolha o app (ou crie um app simples em developers.facebook.com), marque a permissão **`ads_read`**, e gere.
5. **Copie o token** (token de usuário do sistema não expira).
6. No repositório: **Settings → Secrets and variables → Actions → New repository secret**:
   - Nome: `META_TOKEN`  ·  Valor: (o token)

> As 3 unidades atualizam por aqui — inclusive o **Anjinho** (a limitação era só do MCP; pela API com token, funciona).

### 4) Chave da API do Google Sheets (para os leads)
1. A planilha **"COLÉGIOS | LEADS 2027"** precisa estar como **"Qualquer pessoa com o link pode ver"** (Compartilhar → Acesso geral → Leitor).
2. Em https://console.cloud.google.com crie um projeto, vá em **APIs e serviços → Biblioteca**, ative **Google Sheets API**.
3. Em **Credenciais → Criar credenciais → Chave de API**. Copie a chave.
4. No repositório, crie o secret:
   - Nome: `SHEETS_API_KEY`  ·  Valor: (a chave)

> O robô lê a célula "TOTAL DE LEADS" de cada aba (CECAT / AQUAS / ANJINHO).

### 5) Firebase (login + aprovações)
1. Em https://console.firebase.google.com crie um projeto (ex.: **trilho-educacional**).
2. **Authentication → Sign-in method → Email/senha → Ativar.**
3. **Authentication → Users → Add user**, crie os dois logins:
   - `benne@trilhoeducacional.app` — senha à sua escolha (acesso total)
   - `colegio@trilhoeducacional.app` — senha à sua escolha (só vê + aprova/comenta)
   - (pode usar outros e-mails; se mudar, ajuste em `firestore.rules` e no `index.html` no `papelDoEmail`.)
4. **Firestore Database → Criar banco de dados** (modo produção).
5. **Firestore → Regras**: cole o conteúdo do arquivo **`firestore.rules`** deste repositório e publique.
   - Se você usou outros e-mails no passo 3, troque-os nas duas linhas `ehBenne` / `ehColegio`.
6. **Configurações do projeto (engrenagem) → Seus apps → Adicionar app → Web (`</>`)**. Registre o app.
   Vai aparecer um bloco `const firebaseConfig = { ... }`.
7. Abra o **`index.html`**, ache o bloco `const firebaseConfig = { apiKey: "COLE_AQUI", ... }`
   (logo no topo, dentro do `<script>` do Firebase) e **cole os valores** do seu projeto. Salve e suba a alteração.

### 6) Rodar o robô pela primeira vez
1. No repositório: aba **Actions → "Atualizar dados (Meta + leads)" → Run workflow**.
2. Ao terminar (1–2 min), o `dados.json` é atualizado com os números reais.
3. Depois disso ele roda sozinho **de 4 em 4 horas** (dá pra mudar o horário no arquivo do workflow, na linha `cron`).

---

## Usando o painel

- **Link:** `https://bennecomunica.github.io/trilho-educacional/`
- **Benne:** usuário `benne` (ou o e-mail) + senha → acesso total.
- **Colégio:** usuário `colegio` (ou o e-mail) + senha → vê tudo, aprova e comenta criativos.
- O login fica lembrado no navegador; "Sair" encerra a sessão.

## Manutenção

- **Matrículas / metas anuais (dos PDFs):** editar o bloco `MATRICULAS` em `scripts/pull-dados.mjs`
  e rodar o Action de novo (ou esperar o próximo ciclo).
- **Frequência de atualização do Meta:** linha `cron` em `.github/workflows/atualizar-dados.yml`.
- **Senhas:** trocadas direto no Firebase (Authentication → Users).
- **Imagens de criativo novo:** upload de foto (fica leve, comprimida) ou link de vídeo do Drive — como no protótipo.

## Custos
GitHub Pages, GitHub Actions e Firebase (plano Spark) têm camada gratuita que cobre com folga este volume.

## Observação de segurança
O `dados.json` fica público (é o que o painel lê) — contém números de desempenho, não credenciais.
O token do Meta e a chave do Google ficam nos **Secrets** do GitHub (nunca no código). As senhas ficam no Firebase.

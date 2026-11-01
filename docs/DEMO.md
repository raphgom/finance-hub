## Correcao 1.3.3: Docker Desktop / PowerShell (Windows 11)

- A demo passa a executar `docker info` e `docker compose` diretamente, **sem pipelines** `| Out-Host`, `| Out-Null` ou captura da saida nativa. Algumas versoes de Docker Desktop para Windows apresentam `failed to get console: Identificador invalido` quando o console e redirecionado.
- Compose em modo sem ANSI e progresso `plain` (`--ansi never --progress plain`, suportados pelo Compose V2).
- Caso as credenciais isoladas tenham acabado de ser criadas, remove exclusivamente a demo legada, sem tocar no volume nem nos segredos operacionais. Se uma demo existente falhar no inicio, tenta **uma** recriacao apenas do banco ficticio.
- A demonstracao requer teste HTTP de saude e login antes de anunciar sucesso.
- A senha nao deve ser incluida em capturas ou logs enviados a terceiros.
- **Limite de validacao:** script revisado e testes locais realizados, mas nao foi possivel executa-lo no Docker Desktop/Windows dentro do ambiente de desenvolvimento.

# Ambiente de demonstração do Finance Hub

## Objetivo
A demo apresenta todos os módulos com registros fictícios, em um banco PostgreSQL fisicamente separado do banco operacional, utilizando o nome de projeto Docker `financehub-demo`.

## Criar
Execute `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1` no Windows 11 com Docker Desktop ativo. O script inicializa segredos quando ausentes, prepara os serviços, executa a carga transacional demo e espera a saúde da API. Acesse `http://localhost:3100`.

O usuário de acesso é `demo@financehub.local`, e a senha é exibida pelo comando e fica em `secrets/demo/demo_password` (não incluída no ZIP nem na imagem).

## Conteúdo
São três workspaces com categorias, dados dos últimos 12 meses e relatórios alimentados: pessoal, familiar e empresarial. São números ilustrativos, sem qualquer conexão com instituições financeiras.

Pessoal: contas, salários, despesas recorrentes, dois cartões, compras parceladas, pagamentos, metas, orçamentos, investimentos, cotações, dividendos, dívida, pagamentos, bens e regras de automação.

Família: receitas e despesas, imóvel, financiamento, cartão, parcelamentos, metas e orçamentos.

Empresa: contas PJ, 12 meses de receitas e custos, clientes, fornecedores, documentos a receber e a pagar, pipeline de vendas, cartão corporativo, orçamento e assinaturas.

## Verificar
Execute `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo-verify.ps1` para validar os endpoints com autenticação e operações de leitura e escrita no banco demo. O teste altera somente dados de demonstração; utilize `demo.ps1 -ResetDemo -ConfirmReset` se desejar restabelecer a carga fictícia original.

## Isolamento e segurança
A demo usa outro projeto Compose e outro volume. A aplicação continua vinculada apenas a `127.0.0.1`. Os segredos do processo de instalação são os mesmos arquivos locais, mas o banco e as contas são independentes. Não utilize o banco demo para informações verdadeiras.

As sessões possuem cookies distintos (`fh_session_demo` na demo e `fh_session` na produção), pois cookies HTTP ignoram a porta; isto permite alternar entre 3000 e 3100 sem desconectar a outra instância.


## Credenciais da demonstração (1.3.2)

As seis credenciais ficam em `secrets/demo/` e NÃO são compartilhadas com o projeto operacional. Uma demo legada com volume criado sob credenciais operacionais antigas será recriada automaticamente, somente com dados fictícios. Se o login inicial ou a autenticação PostgreSQL falhar, a rotina tenta uma recuperação única, e o resultado só é marcado aprovado após teste de login HTTP.

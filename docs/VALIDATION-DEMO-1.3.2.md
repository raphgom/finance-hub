# Finance Hub 1.3.2 — Registro de verificação e escopo da correção

## Evidências recebidas

- Produção (porta 3000): `docker compose up` concluiu; banco, migração, worker e web iniciaram.
- Demonstração (porta 3100): o banco PostgreSQL já existente ignorou o valor novo de `POSTGRES_PASSWORD_FILE`. O serviço migrate falhou em `password authentication failed for user "financehub"`, SQLSTATE `28P01`, impedindo o seed e a web da demo.
- Causa de projeto: a versão anterior reutilizava os segredos do sistema operacional na demo, mas mantinha volumes independentes. Resetar o volume principal não resetava o volume demo.

## Correções

1. Compose de demo passa a apontar todos os segredos para arquivos exclusivos em `secrets/demo/`.
2. `scripts/demo.ps1` gera essas credenciais localmente, sem chamar o inicializador do sistema real.
3. Reaproveitamento da demo não exige reinicializar seu volume quando segredo e banco permanecem consistentes.
4. A primeira migração de um volume demo legado é recuperada recriando somente o banco fictício (`financehub-demo_db_data`); a base operacional não é afetada.
5. Caso o PostgreSQL da demo retorne `28P01`, ocorre uma única tentativa de reconstrução da **base fictícia**, não do sistema principal.
6. O script valida a API, a execução de consultas analíticas, o status de seed e realiza **login real** com a senha gerada antes de anunciar sucesso.
7. `scripts/demo-verify.ps1` utiliza a senha exclusiva da demonstração.

## Validação executada neste ambiente

- 40 testes locais automatizados (unitários e contratos), todos passaram.
- Sintaxe dos scripts Node.js: aprovada.
- YAML de Compose: analisado; todos os secrets da demo são exclusivos.
- Manifesto SHA-256 e verificação do ZIP integral.

## Limitações

Neste ambiente não há Docker Engine ou PowerShell no Windows para executar testes end-to-end reais. Portanto, o sucesso no Docker do Windows 11 deve ser verificado no destino. Os 40 testes são majoritariamente unitários/contratuais e não substituem essa homologação.

## Compatibilidade e riscos

- A atualização não apaga volumes, dados ou segredos do ambiente principal.
- A primeira execução 1.3.2 em uma demo legada pode **apagar dados fictícios e customizações feitas na demo** para recriar a carga de exemplo. Não use dados reais na demo.
- Uma atualização não troca a chave mestra nem os dados de produção.
- Como a pasta está sob OneDrive no Windows apresentado, evite manter segredos financeiros reais sob diretórios sincronizados.

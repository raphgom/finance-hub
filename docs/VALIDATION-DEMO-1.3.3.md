# Finance Hub 1.3.3: Validacao do reparo PowerShell / Demo

## Evidencia apresentada pelo usuario

Instalacao principal: build e inicializacao OK. Na demo, apos remover o volume `financehub-demo_db_data`, a chamada Docker falhou com `failed to get console: Identificador invalido.`

## Correcao implementada

- Removidas as capturas e pipelines da saida de comandos Docker no `scripts/demo.ps1`; todos os comandos nativos Docker sao executados diretamente no host, sem `Out-Host`, `Out-Null` e `Out-String`.
- Docker Compose invocado com `--ansi never --progress plain` e ambiente definido para progresso plain, reduzindo a dependencia dos handles de TTY no Windows.
- Eliminada a consulta de volumes por pipeline. A exclusao de dados e sempre limitada ao projeto `financehub-demo` via `-p financehub-demo`.
- Mantidas credenciais isoladas da demonstracao; recuperacao unica do banco FICTICIO, log de falha e verificacao real HTTP de saude + login.
- Diagnostico de `scripts/demo-verify.ps1` passa a executar comandos Docker sem redirecionar a saida.

## Testes

- `node --experimental-strip-types --test tests/*.test.mjs`: 44 testes aprovados (executado em Node.js 22.16). Inclui regressao de pipelines em comandos Docker, Compose com progresso plain, reset no projeto isolado, verificacoes de health e login.
- Integridade do ZIP e manifesto SHA-256 verificados programaticamente.
- Nao ha Docker Engine ou PowerShell neste ambiente; o teste integrado com Docker Desktop/Windows 11 NAO foi executado. Portanto, nao existe garantia de ausencia de outros defeitos.

## Atualizacao

Extrair pacote completo sobre o projeto existente preservando `secrets/` e os volumes, executar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

Opcionalmente recriar a demo de forma explicita:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1 -ResetDemo -ConfirmReset
```

Os comandos acima NUNCA removem o banco operacional (`finance-hub_db_data`). Nao use dados reais na demo.

# Guia operacional multi-OS — Finance Hub

## Matriz de sistemas

| Ambiente | Container engine | Comando | Arquitetura |
| --- | --- | --- | --- |
| Windows 11 | Docker Desktop + WSL2 (Linux containers) | `powershell -File .\scripts\start.ps1` | x86_64 |
| macOS Intel | Docker Desktop | `bash scripts/financehub.sh start` | linux/amd64 |
| macOS Apple Silicon | Docker Desktop | `bash scripts/financehub.sh start` | linux/arm64 |
| Linux x86_64 | Docker Engine + Compose plugin | `bash scripts/financehub.sh start` | linux/amd64 |
| Linux ARM64 | Docker Engine + Compose plugin | `bash scripts/financehub.sh start` | linux/arm64 |

**Limites:** não executamos builds integrados locais de todos esses sistemas neste ambiente de criação. A compatibilidade arquitetural das imagens oficiais e o código Bash foram revisados; a CI de três OS e o smoke Docker no Ubuntu serão a evidência verificável após a publicação.

### Comandos Bash (macOS/Linux)

| Finalidade | Comando |
| --- | --- |
| Instalar / atualizar | `bash scripts/financehub.sh start` |
| Gerar segredos | `bash scripts/financehub.sh init` |
| Subir demo | `bash scripts/financehub.sh demo` |
| Verificar principal | `bash scripts/financehub.sh verify` |
| Verificar demo e login | `bash scripts/financehub.sh verify-demo` |
| Diagnóstico | `bash scripts/financehub.sh logs` |
| Diagnóstico demo | `bash scripts/financehub.sh logs-demo` |
| Status | `bash scripts/financehub.sh status` |
| Parar principal | `bash scripts/financehub.sh stop` |
| Parar demo | `bash scripts/financehub.sh stop-demo` |
| Apagar apenas DEMO | `bash scripts/financehub.sh reset-demo --confirm` |
| Apagar PRINCIPAL | `bash scripts/financehub.sh reset --confirm` |

**Cuidado:** `reset --confirm` apaga os volumes financeiros da instalação principal. `reset-demo --confirm` apaga apenas os dados fictícios da demo. Backups e segredos são independentes.

### Windows PowerShell

`start.ps1`, `demo.ps1`, `upgrade.ps1`, `doctor.ps1`, `acceptance.ps1`, `demo-verify.ps1` permanecem disponíveis na distribuição. Scripts de publicação são independentes dos scripts de implantação.

### Segurança

- Segredos são gerados com OpenSSL, Python `secrets` ou Node `crypto.randomBytes`. Não armazenados no repositório.
- No Windows, prefira dados fora do OneDrive. No macOS/Linux, mantenha o projeto num filesystem local com permissões restritas.
- Não desabilite o bind loopback (`127.0.0.1`) sem HTTPS e análise de risco.
- A criptografia dos campos da aplicação não equivale a TDE no PostgreSQL. Use criptografia de disco e backup externo criptografado.

### Observações de plataforma

Docker Desktop no macOS permite execução de containers Linux, inclusive ARM64 em Apple Silicon, desde que as imagens possuam essa arquitetura. Docker Desktop no Windows usa WSL2. Em Linux, configure corretamente o plugin Compose e privilégios do Docker socket (pertencer ao grupo `docker` equivale a ter privilégios elevados).

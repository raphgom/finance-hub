# Segurança e privacidade

O Finance Hub armazena informações pessoais/financeiras. Não é um serviço bancário e não deve ser disponibilizado publicamente sem hardening, testes de segurança e configuração de acesso.

**Regras de contribuição:** nunca inclua credenciais em issues, PRs ou screenshots. O repositório não deve conter `secrets/`, `backups/`, `.env*` privados, dumps nem bancos. O script `scripts/security-check.mjs` faz verificação preventiva do stage, mas não é garantia completa contra vazamentos.

## Modelo local

- Por padrão, `web` é publicada em `127.0.0.1` e PostgreSQL fica apenas na rede interna Docker.
- Criptografia autenticada AES-256-GCM é aplicada apenas aos **campos configurados**; senhas são derivadas por bcrypt. Não há alegação de TDE integral.
- O sistema usa usuários diferentes para administração de migrações e queries transacionais.
- Faça backup cifrado e mantenha chaves de backup offline. Teste a restauração antes de depender dela.
- Recomenda-se BitLocker / FileVault / LUKS para proteção do volume do host e ambiente WSL2.

## Publicação segura

Repositório GitHub público é **repositório de código**, não endpoint financeiro. Nunca exponha containers web/DB diretamente na internet. Audite dependências, CSP, sessão, RBAC e todo fluxo de importação antes de habilitar acesso remoto.

## Vulnerabilidades

Até que o proprietário configure um canal privado de reporte, evite divulgar detalhes exploráveis de possíveis vulnerabilidades em issues públicas. Use a opção de *private vulnerability reporting* do GitHub nas configurações do repositório quando disponível.

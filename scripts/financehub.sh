#!/usr/bin/env bash
# Finance Hub - Linux / macOS (Bash 3.2+, Docker Engine/Desktop + Compose V2)
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
export COMPOSE_ANSI=never COMPOSE_PROGRESS=plain BUILDKIT_PROGRESS=plain COMPOSE_MENU=false
PORT="${APP_PORT:-3000}"; DEMO_PORT="${DEMO_PORT:-3100}"
DEMO_PROJECT=financehub-demo
DEMO_FILES=(-p "$DEMO_PROJECT" -f compose.yaml -f compose.demo.yaml)
log(){ printf '[Finance Hub] %s\n' "$*"; }
fail(){ printf '[Finance Hub] ERRO: %s\n' "$*" >&2; exit 1; }
usage(){ cat <<'HELP'
Usage: bash scripts/financehub.sh COMMAND [--confirm]
  start          Inicia/atualiza a instalação local em http://localhost:3000
  init           Gera os cinco segredos da instalação principal, sem sobrescrever
  demo           Inicia a demo isolada com dados fictícios em http://localhost:3100
  reset-demo     Apaga APENAS o banco da demo e recria tudo (--confirm obrigatório)
  reset          Apaga APENAS o banco principal (--confirm obrigatório)
  stop           Para aplicação principal (preserva os volumes)
  stop-demo      Para demo (preserva o volume)
  status         Mostra o estado dos dois projetos Docker
  logs           Exibe últimos 100 logs da aplicação principal
  logs-demo      Exibe últimos 100 logs da demo
  verify         Verifica health, analytics e configuração principal
  verify-demo    Verifica health/analytics, login e workspaces da demo
Environment: APP_PORT=3000 DEMO_PORT=3100 (portas locais)
Exemplo: bash scripts/financehub.sh demo
HELP
}
check_pre(){
 command -v docker >/dev/null || fail 'Instale Docker Desktop ou Docker Engine.'
 docker info --format '{{.ServerVersion}}' >/dev/null || fail 'Docker Engine não disponível ou usuário sem permissão.'
 docker compose version >/dev/null || fail 'Docker Compose V2 é obrigatório.'
}
secret(){
 name="$1"; size="$2"; folder="$3"; target="$folder/$name"
 [ -f "$target" ] && return 1
 mkdir -p "$folder"
 if command -v openssl >/dev/null; then
  # 4*N/3 caracteres base64, sem newline; apenas fonte criptograficamente segura.
  openssl rand -base64 "$size" | tr -d '\r\n' > "$target"
 elif command -v python3 >/dev/null; then
  python3 -c 'import secrets,sys;sys.stdout.write(secrets.token_urlsafe(int(sys.argv[1])))' "$size" > "$target"
 elif command -v node >/dev/null; then
  node -e 'process.stdout.write(require("crypto").randomBytes(Number(process.argv[1])).toString("base64url"))' "$size" > "$target"
 else
  fail 'É necessário openssl, python3 ou node para gerar segredos de forma segura.'
 fi
 chmod 600 "$target" 2>/dev/null || true
 log "Segredo gerado localmente: $folder/$name"
 return 0
}
init_for(){
 folder="$1"
 mkdir -p "$folder" backups
 secret db_password 36 "$folder" || :
 secret app_password 36 "$folder" || :
 secret master_key 48 "$folder" || :
 secret setup_code 24 "$folder" || :
 secret backup_key 48 "$folder" || :
}
wait_ready(){
 port="$1"; n=0
 command -v curl >/dev/null || fail 'curl é necessário para verificar os serviços.'
 while [ "$n" -lt 90 ]; do
  status="$(curl -fsS --max-time 4 "http://127.0.0.1:$port/api/health" 2>/dev/null || true)"
  case "$status" in
   *'"status":"ok"'*'"analytics":"ready"'*) return 0;;
   *'"analytics":"ready"'*'"status":"ok"'*) return 0;;
  esac
  n=$((n+1)); sleep 2
 done
 return 1
}
check_main(){
 wait_ready "$PORT" || fail "API principal indisponível; use 'logs'."
 setup="$(curl -fsS --max-time 10 "http://127.0.0.1:$PORT/api/setup-status")" || fail 'Endpoint setup-status indisponível.'
 case "$setup" in *'"configured"'*) :;; *) fail 'Resposta inesperada de setup-status.';; esac
 log "Principal saudável: http://localhost:$PORT"
}
check_demo(){
 wait_ready "$DEMO_PORT" || fail "API demo indisponível; use 'logs-demo'."
 [ -f secrets/demo/demo_password ] || fail 'Senha da demo não encontrada.'
 password="$(cat secrets/demo/demo_password)"
 # senha gerada por base64, sem aspas; não enviar a nenhum serviço externo.
 response="$(curl --silent --show-error --fail --max-time 20 -X POST "http://127.0.0.1:$DEMO_PORT/api/login" \
   -H 'Content-Type: application/json' -H "Origin: http://localhost:$DEMO_PORT" \
   --data "{\"email\":\"demo@financehub.local\",\"password\":\"$password\"}")" || fail 'Login da demo falhou.'
 case "$response" in *'"ok":true'*) log 'Login real da demo validado.';; *) fail 'Demo não autenticou.';; esac
 log "Demo saudável: http://localhost:$DEMO_PORT"
}
start_main(){
 check_pre; init_for secrets
 export APP_PORT="$PORT"
 docker compose --ansi never config --quiet || fail 'Compose inválido.'
 docker compose --ansi never --progress plain up --build -d || fail 'Build / inicialização falhou.'
 check_main
 setup="$(curl -fsS "http://127.0.0.1:$PORT/api/setup-status")"
 if [[ "$setup" == *'"configured":false'* ]]; then
  printf 'Código de configuração inicial (não divulgue): '; cat secrets/setup_code; printf '\n'
 fi
}
start_demo(){
 check_pre
 export APP_PORT="$DEMO_PORT"
 had=1; [ -f secrets/demo/db_password ] || had=0
 init_for secrets/demo
 secret demo_password 24 secrets/demo || :
 docker compose --ansi never "${DEMO_FILES[@]}" config --quiet || fail 'Compose demo inválido.'
 # Nunca redefinir as credenciais de um banco existente sem reconstruir SOMENTE a demo.
 if [ "$had" -eq 0 ]; then
  log 'Primeiro uso de segredos isolados: reinicializando apenas a demo fictícia.'
  docker compose --ansi never --progress plain "${DEMO_FILES[@]}" down --volumes --remove-orphans
 fi
 docker compose --ansi never --progress plain "${DEMO_FILES[@]}" up --build -d || fail 'Build / inicialização da demo falhou.'
 check_demo
 printf 'Usuário: demo@financehub.local\nSenha da demo (não divulgue): '; cat secrets/demo/demo_password; printf '\n'
}
cmd="${1:-help}"; confirmation="${2:-}"
case "$cmd" in
 help|-h|--help) usage;;
 init) init_for secrets; printf 'Código de setup: '; cat secrets/setup_code; printf '\n';;
 start) start_main;;
 demo) start_demo;;
 reset-demo)
  [ "$confirmation" = '--confirm' ] || fail 'Para excluir os dados FICTÍCIOS da demo: reset-demo --confirm.'
  check_pre; init_for secrets/demo; secret demo_password 24 secrets/demo || :
  docker compose --ansi never --progress plain "${DEMO_FILES[@]}" down --volumes --remove-orphans
  start_demo;;
 reset)
  [ "$confirmation" = '--confirm' ] || fail 'Para excluir os dados financeiros PRINCIPAIS: reset --confirm.'
  check_pre; init_for secrets
  docker compose --ansi never --progress plain down --volumes --remove-orphans
  # reset da configuração inicial para não reutilizar código exposto, mas manter chaves para backups.
  rm -f secrets/setup_code; secret setup_code 24 secrets || :
  start_main;;
 stop) check_pre; docker compose --ansi never down;;
 stop-demo) check_pre; docker compose --ansi never "${DEMO_FILES[@]}" down;;
 status) check_pre; docker compose --ansi never ps; docker compose --ansi never "${DEMO_FILES[@]}" ps;;
 logs) check_pre; docker compose --ansi never logs --no-color --tail=100 web worker migrate db;;
 logs-demo) check_pre; docker compose --ansi never "${DEMO_FILES[@]}" logs --no-color --tail=100 web demo-seed migrate db;;
 verify) check_main;;
 verify-demo) check_demo;;
 *) usage; fail "Comando desconhecido: $cmd";;
esac

import pg from 'pg';
import { readFileSync } from 'node:fs';
const password = readFileSync('/run/secrets/db_password', 'utf8').trim();
const sql = readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
const pool = new pg.Pool({host:process.env.PGHOST||'db',database:process.env.PGDATABASE||'financehub',user:process.env.PGUSER||'financehub',password,port:Number(process.env.PGPORT||5432)});
try {
 await pool.query(sql);
 const appPassword=readFileSync('/run/secrets/app_password','utf8').trim();
 if(!appPassword || appPassword.length<30)throw Error('Senha de acesso da aplicação ausente ou fraca. Execute init.ps1.');
 const exists=await pool.query("SELECT 1 FROM pg_roles WHERE rolname='financehub_app'");
 const sqlRole=await pool.query("SELECT format($1::text, $2::text) AS sql",[
  exists.rowCount ? 'ALTER ROLE financehub_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION' : 'CREATE ROLE financehub_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  appPassword]);
 await pool.query(sqlRole.rows[0].sql);
 await pool.query('GRANT CONNECT ON DATABASE financehub TO financehub_app');
 await pool.query('GRANT USAGE ON SCHEMA public TO financehub_app');
 await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO financehub_app');
 await pool.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO financehub_app');
 await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financehub_app');
 await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO financehub_app');
 console.log('Schema applied. Application role financehub_app configured with restricted privileges.');
} finally {await pool.end();}

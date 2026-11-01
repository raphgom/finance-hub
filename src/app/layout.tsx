import type { Metadata } from 'next';
import './style.css';
export const metadata:Metadata={title:'Finance Hub | Inteligência Financeira',description:'Gestão pessoal, familiar e empresarial, privada e local.',robots:'noindex,nofollow,noarchive'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}

import { connection } from 'next/server';
import FinanceApp from '@/components/FinanceApp';
export default async function Home(){await connection();return <FinanceApp/>;}

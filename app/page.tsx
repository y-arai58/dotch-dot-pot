import {redirect} from 'next/navigation';
import {getChatGPTUser} from './chatgpt-auth';
import {Landing} from '@/components/project/landing';
export const dynamic='force-dynamic';
export default async function Home(){if(await getChatGPTUser())redirect('/projects');return <Landing/>;}

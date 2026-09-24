import {redirect} from 'next/navigation';
import {getChatGPTUser,chatGPTSignInPath} from '../chatgpt-auth';
import {ProjectsPage} from '@/components/project/projects-page';
export const dynamic='force-dynamic';
export default async function Projects(){if(!await getChatGPTUser())redirect(chatGPTSignInPath('/projects'));return <ProjectsPage/>;}

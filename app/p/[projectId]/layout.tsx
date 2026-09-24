import {redirect} from 'next/navigation';
import {ProjectProvider} from '@/components/project/project-provider';
import {isDemoProject} from '@/lib/studio/demo';
import {getChatGPTUser,chatGPTSignInPath} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function ProjectLayout({children,params}:{children:React.ReactNode;params:Promise<{projectId:string}>}){
 const {projectId}=await params;
 if(!isDemoProject(projectId)&&!await getChatGPTUser())redirect(chatGPTSignInPath(`/p/${projectId}`));
 return <ProjectProvider projectId={projectId}>{children}</ProjectProvider>;
}

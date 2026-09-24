import {redirect} from 'next/navigation';
import {getChatGPTUser,chatGPTSignInPath} from '../../chatgpt-auth';
import {CodexSettings} from '@/components/project/codex-settings';
export const dynamic='force-dynamic';
export default async function CodexSettingsPage(){if(!await getChatGPTUser())redirect(chatGPTSignInPath('/settings/codex'));return <CodexSettings/>;}

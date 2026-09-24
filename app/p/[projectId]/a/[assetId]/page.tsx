import {redirect} from 'next/navigation';
export default async function AssetIndex({params}:{params:Promise<{projectId:string;assetId:string}>}){const {projectId,assetId}=await params;redirect(`/p/${projectId}/a/${assetId}/pixel`);}

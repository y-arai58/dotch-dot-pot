import {AssetWorkspace} from '@/components/workspace/workspace-shell';
export default async function AssetLayout({children,params}:{children:React.ReactNode;params:Promise<{projectId:string;assetId:string}>}){const {assetId}=await params;return <AssetWorkspace assetId={assetId}>{children}</AssetWorkspace>;}

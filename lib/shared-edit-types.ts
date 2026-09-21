import type {V3} from './pixel';
export type V2=[number,number];
/** Triangle coordinates stay attached to the original surface through part transforms and animation. */
export type SurfacePaint={triangle:number;polygon:V2[];color:string;shade:number};
export type PartTransform={offset:V3;scale:V3};
export type SharedEdits={version:1;source?:string;paints:SurfacePaint[];parts:Record<string,PartTransform>};
export const MAX_SURFACE_PAINTS=2048;
export const MAX_EDITED_TRIANGLES=120000;

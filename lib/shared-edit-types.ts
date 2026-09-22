import type {V3} from './pixel';
export type V2=[number,number];
/** Triangle coordinates stay attached to the original surface through part transforms and animation. */
export type SurfacePaint={triangle:number;polygon:V2[];color:string;shade:number};
/** Rotation is XYZ degrees; pivot is a position in the original model, before scale/rotation. */
export type PartTransform={offset:V3;scale:V3;rotation?:V3;pivot?:V3};
/** A part's base color, normalized to the lighting seen in the edited direction. */
export type PartColor={color:string;shade:number};
export type ColorReplacement=PartColor&{from:string};
export type SharedEdits={version:1;source?:string;paints:SurfacePaint[];parts:Record<string,PartTransform>;partColors?:Record<string,PartColor>;colorReplacements?:Record<string,ColorReplacement[]>};
export const MAX_SURFACE_PAINTS=2048;
export const MAX_EDITED_TRIANGLES=120000;

import {z} from 'zod';
import {sharedEditsSchema} from './shared-edits-schema';
/** Why a revision exists; shown in the version panel. Older revisions have none and fall back to inference. */
export const REVISION_REASONS=['sample','skill','import','duplicate','restyle','regenerate','redraw-direction','extend-eight','shared-edit','part-edit','articulated'] as const;
export const idSchema=z.string().min(1).max(100).regex(/^[\w-]+$/);
const palette=z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(64);
export const styleSchema=z.object({id:idSchema,name:z.string().min(1).max(100),palette,light:z.number().int().min(0).max(315).multipleOf(45),lightHeight:z.number().min(20).max(80),elevation:z.number().min(15).max(60),outline:z.boolean(),shadow:z.boolean(),scale:z.number().min(5).max(30),anchor:z.tuple([z.literal(32),z.literal(52)])});
const pixels=z.array(z.number().int().min(0).max(64)).length(4096);
const frame=z.object({direction:z.enum(['S','SE','E','NE','N','NW','W','SW']),body:pixels,shadow:pixels,clipped:z.boolean()});
export const revisionSchema=z.object({id:idSchema,rendererVersion:z.string().max(100).optional(),createdAt:z.string().datetime(),style:styleSchema,frames:z.array(frame).min(1).max(8),baseFrames:z.array(frame).min(1).max(8),approved:z.boolean(),reviewed:z.boolean(),issues:z.string().max(2000),mode:z.enum(['front','eight']),source:z.enum(['sample','tripo','import','skill']),rigKind:z.enum(['humanoid','quadruped','prop']).optional(),modelId:z.string().max(100),features:z.array(z.string().max(250)).max(20),name:z.string().min(1).max(100),prompt:z.string().max(2000),facing:z.number().min(0).max(315).multipleOf(45),size:z.number().min(.25).max(2),modelKey:idSchema.optional(),referenceKeys:z.array(idSchema).max(3).optional(),sharedEdits:sharedEditsSchema.optional(),parentRevisionId:idSchema.optional(),reason:z.enum(REVISION_REASONS).optional()});
export const projectSchema=z.object({id:idSchema,name:z.string().min(1).max(100),styles:z.array(styleSchema).min(1).max(50),version:z.number().int().min(0),updatedAt:z.string()});
export const assetSchema=z.object({id:idSchema,projectId:idSchema,name:z.string().min(1).max(100),revisions:z.array(revisionSchema).min(1).max(20),version:z.number().int().min(0),updatedAt:z.string()});

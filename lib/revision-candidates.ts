import {clone,type Asset,type Revision} from './pixel';

/** Branch from the last successful save; the working drawing belongs only to the new candidate. */
export function sharedCandidateAsset(saved:Asset,draft:Asset,candidate:Revision):Asset{
 if(saved.id!==draft.id||saved.projectId!==draft.projectId||saved.version!==draft.version)throw Error('修正元の保存状態が変わりました。編集内容を確認してください');
 if(!saved.revisions.some(r=>r.id===candidate.parentRevisionId)||saved.revisions.some(r=>r.id===candidate.id))throw Error('修正元の版を確認してください');
 if(saved.revisions.length>=20)throw Error('このアセットは20版の上限に達しました');
 const next=clone(saved);next.revisions.push(clone(candidate));return next;
}

'use client';
import {Checkbox} from '@/components/ui/checkbox';

/** Keep the prerequisite and its remedy beside the action it blocks. */
export function MotionGenerationNotice({id,busy,adopted,rigReviewed,rigErrors,onReview}:{id:string;busy:boolean;adopted:boolean;rigReviewed:boolean;rigErrors:string[];onReview:(reviewed:boolean)=>void}){
 return <div id={id} className="motion-generation-notice">
  {busy?<p role="status">処理中です。完了するまでお待ちください。</p>
   :adopted?<p>採用済みの動作です。変更・再生成するには、上の「新しい候補」を選んでください。</p>
   :rigErrors.length>0?<div role="status"><p>部位の設定に問題があるため、まだ生成できません。左側のパーツと関節を確認してください。</p><ul>{rigErrors.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>
   :<><p>{rigReviewed?'部位の確認が済んでいます。全動作を生成できます。':'生成前に部位の確認が必要です。プレビューで左右と関節の位置を確認し、下の欄にチェックしてください。'}</p>
    <div className="check-row"><Checkbox id={id+'-review'} checked={rigReviewed} onCheckedChange={v=>onReview(v===true)}/><label htmlFor={id+'-review'}>部位・左右・支点を確認した</label></div></>}
 </div>;
}

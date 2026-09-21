import {test} from 'node:test';
import assert from 'node:assert/strict';
import legacySamples from '../lib/samples.json';
import animationSamples from '../lib/animation-samples.json';
import animalSamples from '../lib/animal-samples.json';
import {SAMPLE_MODELS, sampleModel, humanoidSample, articulatedReplacement} from '../lib/sample-models';
import {buildMesh, clone, DEFAULT_STYLE, renderFrame, renderSet, type Model, type Revision, type SurfaceHit} from '../lib/pixel';
import {defaultClips, evaluatePose, poseMesh, rigFromModel, type RiggedModel} from '../lib/animation';
import {applySharedEdits, captureSurfacePaint, emptySharedEdits} from '../lib/shared-edits';

test('旧サンプルの静止画は元のモデルと全8方向で一致する', () => {
 for (const original of legacySamples as Model[]) {
  const resolved = sampleModel(original.id);
  assert.ok(resolved);
  assert.deepEqual(resolved, original);
  assert.deepEqual(renderSet(buildMesh(resolved), DEFAULT_STYLE), renderSet(buildMesh(original), DEFAULT_STYLE));
 }
});

test('旧人型の保存済み動作は従来の関節分割済みモデルを使う', () => {
 for (const original of animationSamples as RiggedModel[]) {
  const resolved = humanoidSample(original.id);
  assert.ok(resolved);
  assert.deepEqual(resolved, original);
  assert.ok(resolved.parts.length > sampleModel(original.id)!.parts.length);
  const clip = defaultClips(original.motionCorrections).find(item => item.id === 'walk')!;
  const before = poseMesh(buildMesh(original), rigFromModel(original), evaluatePose(rigFromModel(original), clip, 3));
  const after = poseMesh(buildMesh(resolved), rigFromModel(resolved), evaluatePose(rigFromModel(resolved), clip, 3));
  assert.deepEqual(renderSet(after, DEFAULT_STYLE), renderSet(before, DEFAULT_STYLE));
 }
});

test('新規人型は静止画とアニメーションに同一形状を使い、小物と動物も選択できる', () => {
 assert.equal(new Set(SAMPLE_MODELS.map(model => model.id)).size, SAMPLE_MODELS.length);
 for (const original of animationSamples as RiggedModel[]) {
  const replacement = articulatedReplacement(original.id);
  assert.ok(replacement);
  assert.equal(replacement.id, `${original.id}-articulated-v1`);
  assert.equal(sampleModel(replacement.id), humanoidSample(replacement.id));
  assert.deepEqual(buildMesh(replacement), buildMesh(original));
  assert.ok(SAMPLE_MODELS.includes(replacement));
  assert.ok(!SAMPLE_MODELS.some(model => model.id === original.id));
  assert.equal(articulatedReplacement(replacement.id), undefined);
 }
 for (const original of [...legacySamples.filter(model => !humanoidSample(model.id)), ...animalSamples]) {
  assert.deepEqual(SAMPLE_MODELS.find(model => model.id === original.id), original);
  assert.equal(articulatedReplacement(original.id), undefined);
 }
 assert.equal(sampleModel('constructor'), undefined);
 assert.equal(humanoidSample('missing'), undefined);
});

test('新規人型の表面修正は歩行へ引き継がれ、旧形状の修正は誤移行できない', () => {
 for (const original of animationSamples as RiggedModel[]) {
  const model = articulatedReplacement(original.id)!, base = buildMesh(model), frames = renderSet(base, DEFAULT_STYLE);
  const revision:Revision = {id:'test', createdAt:'2026-09-21T00:00:00.000Z', style:clone(DEFAULT_STYLE), frames:clone(frames), baseFrames:clone(frames), approved:false, reviewed:false, issues:'', mode:'eight', source:'sample', modelId:model.id, features:[], name:model.name, prompt:'', facing:0, size:1};
  const hits:(SurfaceHit|undefined)[] = [];
  renderFrame(base, DEFAULT_STYLE, 'S', 1, 0, hits);
  const headParts = new Set(model.parts.filter(part => part.bone === 'head').map(part => part.id));
  const at = hits.findIndex(hit => hit && headParts.has(base.triangles[hit.triangle].partId!));
  assert.ok(at >= 0);
  revision.frames[0].body[at] = frames[0].body[at] === 20 ? 10 : 20;
  const edits = {...emptySharedEdits(base), paints:captureSurfacePaint(base, revision, 'S').paints};
  assert.ok(edits.paints.length > 0);
  const edited = applySharedEdits(buildMesh(sampleModel(model.id)!), edits);
  assert.equal(renderFrame(edited, DEFAULT_STYLE, 'S').body[at], revision.frames[0].body[at]);
  const rig = rigFromModel(humanoidSample(model.id)!), clip = defaultClips(model.motionCorrections).find(item => item.id === 'walk')!;
  const posed = poseMesh(edited, rig, evaluatePose(rig, clip, 3));
  const painted = edited.triangles.filter(triangle => triangle.paint);
  const posedPainted = posed.triangles.filter(triangle => triangle.paint);
  assert.ok(posedPainted.every(triangle => headParts.has(triangle.partId!)));
  assert.deepEqual(posedPainted.map(triangle => triangle.sourceUV), painted.map(triangle => triangle.sourceUV));
  assert.ok(posedPainted.some((triangle, index) => JSON.stringify(triangle.vertices) !== JSON.stringify(painted[index].vertices)));
  assert.ok(renderSet(posed, DEFAULT_STYLE).every(frame => frame.body.length === 4096));

  const legacy = buildMesh(sampleModel(original.id)!);
  const oldEdits = {...emptySharedEdits(legacy), parts:{[legacy.parts![0].id]:{scale:[1.1,1,1] as [number,number,number], offset:[0,0,0] as [number,number,number]}}};
  assert.throws(() => applySharedEdits(base, oldEdits), /構造が変わ/);
 }
});
